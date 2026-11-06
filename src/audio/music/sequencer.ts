// audio/music/sequencer.ts: the composer. Pure: (song seed, area, bar, level, pivot) → the bar's note events, with
// swing and humanize already applied. No WebAudio, so it is unit-tested in node and the live scheduler and the
// offline render produce identical music for the same seed (DESIGN §19.1: form, patterns, comping, bass, motif).
import { Sfc32 } from '../../core/rng';
import { jitter, sixteenthSec, stepOffset } from '../clock';
import {
  ARP, BASS, CLANK, EP, FILL, FORM, FORM_BARS, HATS, INTENSITY, INTRO_DRUM_LP, MALLET, PAD, SCHED, type AreaMusic, type ChordSpec,
  type MusicArea, type Section,
} from '../mix.config';
import { PATTERNS } from './patterns';
import { allowedPool, altBars, areaMusic, chordAt, chordPcs, nearestIn, pentatonicNote } from './progressions';

export type Inst = 'kick' | 'snare' | 'rim' | 'clap' | 'hatC' | 'hatO' | 'shaker' | 'ep' | 'bass' | 'pad' | 'mallet' | 'arp' | 'clank';
export type Layer = 'drums' | 'ghost' | 'shaker' | 'bass' | 'ep' | 'pad' | 'melody' | 'arp' | 'clank';
export const LAYERS: readonly Layer[] = ['drums', 'ghost', 'shaker', 'bass', 'ep', 'pad', 'melody', 'arp', 'clank'];
export type Level = 0 | 1 | 2 | 3;

export interface NoteEv {
  inst: Inst; layer: Layer;
  /** Seconds from the bar start (swing and humanize included; may be a few ms negative). */
  t: number; step: number;
  vel: number; midi: number; dur: number; pan: number;
  /** Pad chords: all notes of the voice. */
  notes?: readonly number[];
}
export interface FormPos { section: Section; inSection: number; phraseBar: number }
export interface BarCtx {
  area: MusicArea; seed: number; alt: boolean; bar: number; level: Level;
  /** One bar of the next key's V7 (gateway pivot); replaces the harmony and mutes the melody. */
  pivot?: ChordSpec | null;
  /** Bass approach target on the pivot bar (the next song's first bass note). */
  approachTo?: number | null;
}

const LANE = { kick: 1, snare: 2, hat: 3, ep: 4, bass: 5, pad: 6, mel: 7, arp: 8, shaker: 9, clank: 10, fill: 11, comp: 12, strum: 13, mut: 14 } as const;

export function formAt(bar: number): FormPos {
  let b = ((bar % FORM_BARS) + FORM_BARS) % FORM_BARS;
  for (const f of FORM) {
    if (b < f.bars) return { section: f.s, inSection: b, phraseBar: b % FILL.phraseBars };
    b -= f.bars;
  }
  return { section: 'A3', inSection: 0, phraseBar: 0 };
}
/** First bar of a section (song-relative). */
export function sectionStart(s: Section): number {
  let b = 0;
  for (const f of FORM) { if (f.s === s) return b; b += f.bars; }
  return 0;
}

/** Which layers sound in a bar (§19.1 intensity table plus the song form). */
export function layersFor(level: Level, section: Section, a: AreaMusic, pivot: boolean): Record<Layer, boolean> {
  const intro = section === 'intro';
  return {
    drums: true,
    ep: true,
    pad: true,
    bass: level >= 1,
    ghost: level >= 2 && !intro,
    shaker: level >= 3 && !intro,
    melody: !pivot && !intro && section !== 'break' && (level >= 2 || (level >= 1 && (section === 'A2' || section === 'A3'))),
    arp: level >= a.arpLevel && !intro,
    clank: a.clanks && level >= 1 && !intro,
  };
}

/** The 4-bar progression for a song (the alternate voice-led set on every 2nd song). Cached per area. */
const altCache = new Map<MusicArea, ChordSpec[][]>();
export function progression(area: MusicArea, alt: boolean): readonly (readonly ChordSpec[])[] {
  const a = areaMusic(area);
  if (!alt) return a.bars;
  let p = altCache.get(area);
  if (!p) { p = altBars(a.bars); altCache.set(area, p); }
  return p;
}

// ── Melody motif (§19.1 "Mallet melody") ──────────────────────────────────────────────────────────────────────────
export interface MotifNote { step: number; deg: number; len: number; accent: boolean }
/** Rhythm cells for one beat (16th offsets) with weights; a beat rests with probability MALLET.restChance. */
const CELLS: readonly (readonly [readonly number[], number])[] = [
  [[0], 3], [[0, 2], 2], [[2], 2], [[0, 3], 1.5], [[3], 1], [[1, 2], 0.5], [[0, 1, 2], 0.4],
];
const MOVES_UP: readonly (readonly [number, number])[] = [[1, 3], [2, 2], [-1, 1.5], [3, 0.5], [-2, 0.7], [0, 0.4]];
const MOVES_DOWN: readonly (readonly [number, number])[] = [[-1, 3], [-2, 2], [1, 1.5], [-3, 0.5], [2, 0.7], [0, 0.4]];
/** Phrase endings: the pentatonic root, 3rd or 5th (degrees around the root in octave 5). */
const CADENCE = [-5, -3, -2, 0, 2, 3] as const;

/** A seeded 2-bar motif on the 16th grid: pentatonic degrees around the root in octave 5 (deg 0), rests on 35% of
 *  beats, a breath at the end, an arch contour (rising for the first 60% of notes, then falling) in [−5, 5], no
 *  note repeated three times, a cadence on the root, 3rd or 5th; strong beats are flagged to land on chord tones. */
export function makeMotif(seed: number): MotifNote[] {
  const r = new Sfc32(seed ^ 0x6d656c6f);
  const steps: number[] = [];
  for (let beat = 0; beat < 8; beat++) {
    const rest = beat === 7 ? r.chance(0.75) : r.chance(MALLET.restChance);
    if (rest) continue;
    for (const o of r.weighted(CELLS)) steps.push(beat * 4 + o);
  }
  for (const s of [0, 6, 16, 22, 10, 26]) { if (steps.length >= 5) break; if (!steps.includes(s)) steps.push(s); }
  steps.sort((x, y) => x - y);
  while (steps.length > 11) steps.splice(1 + Math.floor(r.float() * (steps.length - 2)), 1);
  let deg = r.pick([-2, -1, 0, 1]), last = 99;
  const out: MotifNote[] = [];
  const n = steps.length;
  for (let i = 0; i < n; i++) {
    const s = steps[i]!;
    if (i > 0 && i < n - 1) {
      let mv = r.weighted(i < n * 0.6 ? MOVES_UP : MOVES_DOWN);
      if (mv === 0 && last === 0) mv = i < n * 0.6 ? 1 : -1;
      last = mv;
      deg += mv;
      if (deg > 4) deg = 8 - deg; else if (deg < -5) deg = -10 - deg;
    } else if (i === n - 1 && n > 1) {
      let best: number = CADENCE[0], bd = Infinity;
      for (const cd of CADENCE) { const d = Math.abs(cd - deg) + (cd === deg ? 0.5 : 0); if (d < bd) { bd = d; best = cd; } }
      deg = best;
    }
    const next = steps[i + 1] ?? 32;
    out.push({ step: s, deg, len: Math.min(6, next - s), accent: s % 4 === 0 });
  }
  return out;
}

const motifCache = new Map<number, MotifNote[]>();
function motifFor(seed: number): MotifNote[] {
  let m = motifCache.get(seed);
  if (!m) { m = makeMotif(seed); motifCache.set(seed, m); if (motifCache.size > 32) motifCache.delete(motifCache.keys().next().value!); }
  return m;
}

/** Melody pitches for one 2-bar repeat of the motif. Each degree is mutated (±1) on 25% of notes per repeat, mapped
 *  to the pentatonic around the root in octave 5, then fitted to the chord under it: beats 1 and 3 take chord tones,
 *  other notes chord tones or non-clashing pentatonic notes. The fit leans in the motif's direction of travel so
 *  the contour survives, and a moving line never collapses onto the same pitch. */
export function melodyLine(a: AreaMusic, chordAtStep: (step32: number) => ChordSpec, motif: readonly MotifNote[], seed: number, repeat: number): number[] {
  const out: number[] = [];
  let prevDeg = 0, prevMidi = -1;
  motif.forEach((n, i) => {
    let deg = n.deg;
    if (repeat > 0 && (jitter(seed, repeat, i, LANE.mut) + 1) / 2 < MALLET.mutate) deg += jitter(seed, repeat, i, LANE.mut + 100) < 0 ? -1 : 1;
    const ch = chordAtStep(n.step);
    const raw = pentatonicNote(a, deg, 5);
    let pool = allowedPool(a, ch, MALLET.lo - 3, MALLET.hi);
    if (n.step % 8 === 0) {
      const tones = chordPcs(ch);
      const ct = pool.filter((m) => tones.has(((m % 12) + 12) % 12));
      if (ct.length) pool = ct;
    }
    const dir = i === 0 ? 0 : Math.sign(deg - prevDeg);
    let m = pool.includes(raw) ? raw : nearestIn(pool, raw + dir * 0.6);
    if (dir !== 0 && m === prevMidi) {
      const k = pool.indexOf(m) + dir;
      if (k >= 0 && k < pool.length) m = pool[k]!;
    }
    out.push(m);
    prevDeg = deg; prevMidi = m;
  });
  return out;
}

// ── Compose one bar ───────────────────────────────────────────────────────────────────────────────────────────────
export function composeBar(c: BarCtx): NoteEv[] {
  const a = areaMusic(c.area);
  const bpm = a.bpm, s16 = sixteenthSec(bpm);
  const pos = formAt(c.bar);
  const pivot = c.pivot ?? null;
  const L = layersFor(c.level, pos.section, a, !!pivot);
  const prog = progression(c.area, c.alt);
  const barChords: readonly ChordSpec[] = pivot ? [pivot] : prog[((c.bar % prog.length) + prog.length) % prog.length]!;
  const nextBarChords = prog[(((c.bar + 1) % prog.length) + prog.length) % prog.length]!;
  const out: NoteEv[] = [];
  const seed = c.seed, bar = c.bar;
  const hum = (step: number, lane: number) => jitter(seed, bar, step, lane) * SCHED.humanizeSec;
  const vh = (step: number, lane: number) => 1 + jitter(seed, bar, step, lane + 50) * SCHED.humanizeVel;
  const at = (step: number, lane: number) => stepOffset(bpm, step, SCHED.swing) + hum(step, lane);
  const push = (e: NoteEv) => out.push(e);

  // Drums.
  const pat = PATTERNS[pos.section === 'B' ? a.patterns.alt : a.patterns.main];
  const fillRoll = pos.phraseBar === FILL.phraseBars - 1 && (jitter(seed, bar, 0, LANE.fill) + 1) / 2 < FILL.chance;
  const roll = fillRoll && (jitter(seed, bar, 1, LANE.fill) + 1) / 2 < FILL.rollChance;
  const kickDrop = fillRoll && !roll;                          // last two beats of the phrase without kick
  const kickOut = pos.section === 'B' && pos.inSection >= 6;    // B: the kick drops out in bars 7–8
  for (const h of pat.K) {
    if (kickOut || (kickDrop && h.step >= 8)) continue;
    push({ inst: 'kick', layer: 'drums', t: at(h.step, LANE.kick), step: h.step, vel: (h.kind === 'g' ? 0.45 : 1) * vh(h.step, LANE.kick), midi: 0, dur: 0, pan: 0 });
  }
  const snareInst = (kind: 'x' | 'g') => (kind === 'g' && a.ghost === 'rim' ? 'rim' : 'snare');
  for (const h of pat.S) {
    push({ inst: snareInst(h.kind), layer: 'drums', t: at(h.step, LANE.snare), step: h.step, vel: (h.kind === 'g' ? 0.3 : 1) * vh(h.step, LANE.snare), midi: 0, dur: 0, pan: 0.04 });
    if (a.clap && h.kind === 'x') push({ inst: 'clap', layer: 'drums', t: at(h.step, LANE.snare) + 0.004, step: h.step, vel: 0.9 * vh(h.step, LANE.snare + 1), midi: 0, dur: 0, pan: -0.08 });
  }
  if (roll) {
    const vels = [0.22, 0.3, 0.42, 0.58];
    for (let i = 0; i < 4; i++) {
      const st = 12 + i;
      if (pat.S.some((h) => h.step === st)) continue;
      push({ inst: a.ghost === 'rim' ? 'rim' : 'snare', layer: 'drums', t: at(st, LANE.fill), step: st, vel: vels[i]! * vh(st, LANE.fill), midi: 0, dur: 0, pan: 0.04 });
    }
  }
  // Ghost 16th rim/snare touches (level ≥ 2): one or two soft notes per bar where the pattern is empty.
  if (L.ghost) {
    for (const st of [7, 9, 15]) {
      if (pat.S.some((h) => h.step === st) || (roll && st >= 12)) continue;
      if ((jitter(seed, bar, st, LANE.snare + 20) + 1) / 2 < 0.4)
        push({ inst: a.ghost === 'rim' ? 'rim' : 'snare', layer: 'ghost', t: at(st, LANE.snare + 21), step: st, vel: 0.2 * vh(st, LANE.snare + 22), midi: 0, dur: 0, pan: 0.04 });
    }
  }
  const openStep = L.ghost && bar % 2 === 1 ? 14 : -1;
  const hatSteps = new Set(pat.H.map((h) => h.step));
  for (const h of pat.H) {
    if (h.step === openStep) continue;
    const onBeat = h.step % 4 === 0;
    const v = h.kind === 'g' ? 0.22 : onBeat ? HATS.velHi : HATS.velLo + (HATS.velHi - HATS.velLo) * 0.4;
    push({ inst: 'hatC', layer: 'drums', t: at(h.step, LANE.hat), step: h.step, vel: v * vh(h.step, LANE.hat), midi: 0, dur: a.hats.closed, pan: 0.18 });
  }
  if (L.ghost) {
    for (let st = 1; st < 16; st += 2) {
      if (hatSteps.has(st)) continue;
      const g = HATS.ghostVel[0] + (HATS.ghostVel[1] - HATS.ghostVel[0]) * (jitter(seed, bar, st, LANE.hat + 30) + 1) / 2;
      push({ inst: 'hatC', layer: 'ghost', t: at(st, LANE.hat), step: st, vel: g, midi: 0, dur: a.hats.closed * 0.8, pan: 0.22 });
    }
    if (openStep >= 0) push({ inst: 'hatO', layer: 'ghost', t: at(openStep, LANE.hat), step: openStep, vel: 0.42 * vh(openStep, LANE.hat), midi: 0, dur: HATS.open, pan: 0.18 });
  }
  if (L.shaker) {
    for (let st = 0; st < 16; st++) {
      push({ inst: 'shaker', layer: 'shaker', t: at(st, LANE.shaker), step: st, vel: (st % 2 === 1 ? 0.85 : st % 4 === 0 ? 0.55 : 0.4) * vh(st, LANE.shaker), midi: 0, dur: 0, pan: -0.3 });
    }
  }

  // Harmony: EP comping (strummed), pad, arp.
  const split = barChords.length > 1;
  const comps = pivot ? [0, 6] : split ? [...EP.splitComp] : new Sfc32(seed ^ Math.imul(bar + 1, 0x9e3779b1)).weighted(EP.comps);
  const strum = EP.strumMs[0] + (EP.strumMs[1] - EP.strumMs[0]) * (jitter(seed, bar, 0, LANE.strum) + 1) / 2;
  for (let i = 0; i < comps.length; i++) {
    const st = comps[i]!;
    const end = comps[i + 1] ?? 16;
    const ch = chordAt(barChords, Math.floor(st / 4));
    const dur = (end - st) * s16 * 0.96;
    const base = at(st, LANE.comp);
    const vel = (i === 0 ? 0.82 : 0.64) * vh(st, LANE.ep);
    ch.voicing.forEach((m, k) => push({ inst: 'ep', layer: 'ep', t: base + (k * strum) / 1000, step: st, vel: vel * (k === ch.voicing.length - 1 ? 1.06 : 1), midi: m, dur, pan: 0 }));
  }
  {
    let beat = 0;
    for (const ch of barChords) {
      const st = beat * 4;
      const boost = pos.section === 'B' ? Math.pow(10, PAD.bSectionDb / 20) : 1;
      push({ inst: 'pad', layer: 'pad', t: stepOffset(bpm, st, SCHED.swing), step: st, vel: boost, midi: ch.voicing[0]! + PAD.octave,
        dur: ch.beats * 4 * s16, pan: 0, notes: ch.voicing.map((m) => m + PAD.octave) });
      beat += ch.beats;
    }
  }
  if (L.arp) {
    const idx = [0, 1, 2, 3, 2, 1];
    for (let st = 0; st < 16; st++) {
      const ch = chordAt(barChords, Math.floor(st / 4));
      const v = ch.voicing;
      const m = v[idx[st % idx.length]! % v.length]! + ARP.octave;
      push({ inst: 'arp', layer: 'arp', t: at(st, LANE.arp), step: st, vel: (st % 4 === 0 ? 1 : 0.72) * vh(st, LANE.arp), midi: m, dur: ARP.decay, pan: st % 2 ? 0.25 : -0.25 });
    }
  }

  // Bass: root on beat 1, fifth or octave on beat 3 (or the 2nd chord's root), a chromatic approach on the last 16th.
  if (L.bass) {
    const ch0 = barChords[0]!, ch2 = chordAt(barChords, 2);
    const nextRoot = c.approachTo ?? nextBarChords[0]!.bass;
    const approach = !!pivot || (jitter(seed, bar, 15, LANE.bass) + 1) / 2 < BASS.approachChance;
    const third = split ? ch2.bass : (jitter(seed, bar, 8, LANE.bass) + 1) / 2 < BASS.fifthChance ? ch0.bass + 7 : ch0.bass + 12;
    push({ inst: 'bass', layer: 'bass', t: at(0, LANE.bass), step: 0, vel: 0.95 * vh(0, LANE.bass), midi: ch0.bass, dur: 7.4 * s16, pan: 0 });
    push({ inst: 'bass', layer: 'bass', t: at(8, LANE.bass), step: 8, vel: 0.8 * vh(8, LANE.bass), midi: third, dur: (approach ? 6.4 : 7.4) * s16, pan: 0 });
    if (approach) {
      const from = nextRoot + ((jitter(seed, bar, 14, LANE.bass) < 0) ? -1 : 1);
      push({ inst: 'bass', layer: 'bass', t: at(15, LANE.bass), step: 15, vel: 0.7 * vh(15, LANE.bass), midi: from, dur: 0.9 * s16, pan: 0 });
    }
  }

  // Melody (mallet motif, 2 bars, repeated with mutations).
  if (L.melody) {
    const motif = motifFor(seed);
    const half = ((bar % 2) + 2) % 2, repeat = Math.floor(bar / 2);
    const barOf = (h: number) => prog[(((repeat * 2 + h) % prog.length) + prog.length) % prog.length]!;
    const line = melodyLine(a, (s32) => chordAt(barOf(s32 >= 16 ? 1 : 0), Math.floor((s32 % 16) / 4)), motif, seed, repeat);
    motif.forEach((n, i) => {
      if (Math.floor(n.step / 16) !== half) return;
      const st = n.step % 16;
      push({ inst: 'mallet', layer: 'melody', t: at(st, LANE.mel), step: st, vel: (n.accent ? 0.78 : 0.6) * vh(st, LANE.mel),
        midi: line[i]!, dur: n.len * s16, pan: -0.12 });
    });
  }

  // Docks: off-beat FM clanks on the "and"s.
  if (L.clank) {
    for (const st of [6, 14]) {
      if ((jitter(seed, bar, st, LANE.clank) + 1) / 2 >= CLANK.chance) continue;
      const ch = chordAt(barChords, Math.floor(st / 4));
      push({ inst: 'clank', layer: 'clank', t: at(st, LANE.clank), step: st, vel: 0.8 * vh(st, LANE.clank), midi: ch.bass + 24 + 7, dur: CLANK.sec, pan: st === 6 ? -0.35 : 0.35 });
    }
  }
  out.sort((x, y) => x.t - y.t);
  return out;
}

/** Drum-bus low-pass for a bar: muffled in the intro and at level 0, 9 kHz normally, 12 kHz at level 3. */
export function drumLpFor(level: Level, section: Section): number {
  return section === 'intro' ? INTRO_DRUM_LP : INTENSITY.drumLp[level];
}
