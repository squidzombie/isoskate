// audio/music/progressions.ts: keys, chords and the small amount of music theory the engine needs (pure, tested).
// - Pentatonic of the key, or of the relative major in minor keys (DESIGN §9: Suburbs A minor → C, Docks C minor → E♭).
// - "Avoid" notes: a scale note a semitone from a chord tone (and not itself one) is never played over that chord.
// - Voice leading: the alternate voicing set (every 2nd song) moves each chord to the inversion nearest the previous one.
// - The pivot chord for gateways: the new key's V7 (♭9 in minor keys), voiced near the current chord.
import { AREA_MUSIC, VOICING_RANGE, type AreaMusic, type ChordSpec, type MusicArea } from '../mix.config';

export const MAJOR_PENTATONIC = [0, 2, 4, 7, 9] as const;
export const mod12 = (n: number) => ((n % 12) + 12) % 12;
export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Pitch class of the pentatonic's root: the tonic in major keys, the relative major (tonic + 3) in minor keys. */
export function pentatonicRoot(a: Pick<AreaMusic, 'tonic' | 'mode'>): number {
  return a.mode === 'major' ? mod12(a.tonic) : mod12(a.tonic + 3);
}
export function pentatonicPcs(a: Pick<AreaMusic, 'tonic' | 'mode'>): number[] {
  const r = pentatonicRoot(a);
  return MAJOR_PENTATONIC.map((i) => mod12(r + i));
}
/** MIDI note of pentatonic degree `deg` (0 = the pentatonic root in `octave`, C4 = 60 convention: octave 4 → 60..71). */
export function pentatonicNote(a: Pick<AreaMusic, 'tonic' | 'mode'>, deg: number, octave: number): number {
  const r = pentatonicRoot(a);
  const o = Math.floor(deg / 5), i = deg - o * 5;
  return 12 * (octave + 1) + r + 12 * o + MAJOR_PENTATONIC[i]!;
}

export function chordPcs(ch: ChordSpec): Set<number> {
  const s = new Set<number>([mod12(ch.bass)]);
  for (const v of ch.voicing) s.add(mod12(v));
  return s;
}
/** True when pitch class `pc` is a semitone from a chord tone without being one (a clash over this chord). */
export function isAvoid(pc: number, tones: ReadonlySet<number>): boolean {
  const p = mod12(pc);
  if (tones.has(p)) return false;
  return tones.has(mod12(p + 1)) || tones.has(mod12(p - 1));
}
/** Sorted MIDI notes in [lo, hi] that are chord tones or non-avoid pentatonic notes of the key. */
export function allowedPool(a: Pick<AreaMusic, 'tonic' | 'mode'>, ch: ChordSpec, lo: number, hi: number): number[] {
  const tones = chordPcs(ch);
  const pent = new Set(pentatonicPcs(a));
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) {
    const pc = mod12(m);
    if (tones.has(pc) || (pent.has(pc) && !isAvoid(pc, tones))) out.push(m);
  }
  return out;
}
/** Nearest member of a sorted pool (ties go up, so melodies keep rising). */
export function nearestIn(pool: readonly number[], m: number): number {
  let best = pool[0] ?? m, bd = Infinity;
  for (const p of pool) {
    const d = Math.abs(p - m) - (p >= m ? 0.01 : 0);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/** Re-voices pitch classes `pcs` (one per voice) as the chord nearest `prev` (sum of |movement| on sorted voices),
 *  inside [lo, hi], with no unison and no minor second below E3 (mud). */
export function voiceLead(prev: readonly number[], pcs: readonly number[], lo = VOICING_RANGE.lo, hi = VOICING_RANGE.hi): number[] {
  const cands = pcs.map((pc) => {
    const out: number[] = [];
    for (let m = lo; m <= hi; m++) if (mod12(m) === mod12(pc)) out.push(m);
    return out;
  });
  const p = [...prev].sort((x, y) => x - y);
  let best: number[] | null = null, bestCost = Infinity;
  const pick: number[] = [];
  const rec = (i: number) => {
    if (i === cands.length) {
      const v = [...pick].sort((x, y) => x - y);
      for (let k = 1; k < v.length; k++) {
        if (v[k] === v[k - 1]) return;
        if (v[k]! - v[k - 1]! === 1 && v[k - 1]! < 52) return;
      }
      let cost = 0;
      for (let k = 0; k < v.length; k++) cost += Math.abs(v[k]! - (p[k] ?? v[k]!));
      cost += Math.max(0, v[v.length - 1]! - v[0]! - 14) * 2;          // keep it compact (≤ a 9th spread)
      if (cost < bestCost) { bestCost = cost; best = v; }
      return;
    }
    for (const m of cands[i]!) { pick.push(m); rec(i + 1); pick.pop(); }
  };
  rec(0);
  return best ?? [...prev];
}

/** The alternate voicing set: chord 1 moved up a fourth (nearest inversion), then each chord voice-led from the last.
 *  Two passes so the loop back to chord 1 is smooth too. */
export function altBars(bars: readonly (readonly ChordSpec[])[]): ChordSpec[][] {
  const flat = bars.flat();
  const first = flat[0]!;
  let prev = voiceLead(first.voicing.map((v) => v + 5), first.voicing);
  const out: number[][] = [];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < flat.length; i++) {
      const ch = flat[i]!;
      prev = i === 0 && pass === 0 ? prev : voiceLead(prev, ch.voicing);
      if (pass === 1) out.push(prev);
    }
  }
  let k = 0;
  return bars.map((bar) => bar.map((ch) => ({ ...ch, voicing: out[k++]! })));
}

/** The new key's V7 for a gateway pivot (♭9 in minor keys, 9 in major), voiced near `near`; bass in octave 2. */
export function pivotChord(to: Pick<AreaMusic, 'tonic' | 'mode'>, near: readonly number[]): ChordSpec {
  const root = mod12(to.tonic + 7);
  const pcs = [root + 4, root + 10, root + (to.mode === 'minor' ? 13 : 14), root + 7].map(mod12);
  const v = voiceLead(near.length === 4 ? near : [55, 59, 62, 65], pcs);
  return { name: 'V7', bass: 36 + mod12(root - 0), voicing: v, beats: 4 };
}

/** Chord sounding at `beat` (0..3) of a progression bar. */
export function chordAt(bar: readonly ChordSpec[], beat: number): ChordSpec {
  let acc = 0;
  for (const ch of bar) { acc += ch.beats; if (beat < acc) return ch; }
  return bar[bar.length - 1]!;
}

export function areaMusic(a: MusicArea): AreaMusic { return AREA_MUSIC[a]; }

/** Musical feedback pitch (§9): pentatonic degree `seq` (capped at `maxDeg`, i.e. two octaves) from the root in
 *  `octave`; if that note clashes with the current chord it moves up to the next pentatonic degree that doesn't. */
export function feedbackMidi(a: Pick<AreaMusic, 'tonic' | 'mode'>, ch: ChordSpec | null, seq: number, octave: number, maxDeg: number): number {
  let d = Math.max(0, Math.min(maxDeg, Math.floor(seq)));
  if (!ch) return pentatonicNote(a, d, octave);
  const tones = chordPcs(ch);
  for (let k = 0; k < 5; k++) {
    const m = pentatonicNote(a, d + k, octave);
    if (!isAvoid(m, tones)) return m;
  }
  return pentatonicNote(a, d, octave);
}
/** Coin pitch (§19.3): degree `n` of the area pentatonic from its root in `octave`, capped at two octaves. */
export function coinMidi(a: Pick<AreaMusic, 'tonic' | 'mode'>, n: number, octave: number, maxDeg: number): number {
  return pentatonicNote(a, Math.max(0, Math.min(maxDeg, Math.floor(n))), octave);
}
