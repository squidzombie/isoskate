// audio/sfx/oneshots.ts: every gameplay one-shot of DESIGN §19.3 (pop, flip whoosh, catch, landings, stairs, bump,
// knock, coin climb, near miss, hazard tick, combo bank / lost, crash, grind entry / exit, spin swish, revert scuff,
// pick-window chime, rewind, needle lift, new best, new area). Short, soft and pitched in key; each one is one voice
// with ±3% pitch and ±1.5 dB variation (§19.2).
import type { EdgeMaterial } from '../../core/ids';
import { COIN, COMBO_BANK, FEEDBACK, GRIND_MATERIAL, SFX_LEVEL, VARIATION, type AreaMusic, type ChordSpec } from '../mix.config';
import type { Graph } from '../graph';
import { playMallet } from '../music/instruments';
import { coinMidi, feedbackMidi, midiHz, pentatonicNote } from '../music/progressions';
import { filter, gain, noiseOffset, osc, perc, swell, sweep, vary, voice, type VoiceOut } from '../synth';
import { PRI } from '../voices';

/** What musical one-shots need to know about the music right now. */
export interface KeyInfo { area: AreaMusic; chord: ChordSpec | null }
export interface CueOpts {
  pan?: number; pitch?: number; gain?: number; intensity?: number;
  dur?: number; variant?: string; material?: EdgeMaterial | null; side?: -1 | 1; drop?: number; n?: number;
}

/** Noise burst through a filter into `dest` (sweeping when fTo is given). */
export function nz(g: Graph, v: VoiceOut, dest: AudioNode, t: number, dur: number, type: BiquadFilterType, f: number, q: number,
  peak: number, attack = 0.002, fTo?: number, shape: 'perc' | 'swell' = 'perc'): void {
  const ctx = g.ctx;
  const eg = gain(ctx, 0, dest);
  const bf = filter(ctx, type, f, q, eg);
  if (fTo) sweep(bf.frequency, t, f, fTo, dur);
  const src = ctx.createBufferSource();
  src.buffer = g.noise.white; src.connect(bf);
  if (shape === 'swell') swell(eg.gain, t, peak, dur * 0.5, dur * 0.5); else perc(eg.gain, t, peak, attack, dur);
  src.start(Math.max(0, t), noiseOffset(g));
  src.stop(t + attack + dur + 0.01);
}
/** Tone into `dest`: sine/triangle/square/saw, optional exponential pitch sweep. */
export function tn(g: Graph, v: VoiceOut, dest: AudioNode, t: number, dur: number, type: OscillatorType, f: number, peak: number,
  attack = 0.002, fTo?: number, fSec?: number): OscillatorNode {
  const ctx = g.ctx;
  const eg = gain(ctx, 0, dest);
  const o = osc(ctx, type, f, eg);
  if (fTo) sweep(o.frequency, t, f, fTo, fSec ?? dur);
  perc(eg.gain, t, peak, attack, dur);
  return v.src(o, t, t + attack + dur + 0.01);
}
function panned(g: Graph, v: VoiceOut, pan: number): AudioNode {
  if (!pan) return v.out;
  const p = g.ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(v.out);
  return p;
}
function sfxVoice(g: Graph, t: number, len: number, level: number, o: CueOpts, pri: number = PRI.sfx, dest: AudioNode = g.sfx): { v: VoiceOut; d: AudioNode; p: number } | null {
  const v = voice(g, dest, t, t + len + 0.05, pri);
  if (!v) return null;
  const vr = vary(g, VARIATION.pitch, VARIATION.db);
  v.out.gain.value = level * vr.gain * (o.gain ?? 1);
  return { v, d: panned(g, v, o.pan ?? 0), p: vr.pitch * (o.pitch ?? 1) };
}

/** The wood knock of a pop / landing: sine 180 → 110 Hz (80 ms) by default. */
function knock(g: Graph, v: VoiceOut, d: AudioNode, t: number, f0: number, f1: number, dur: number, peak: number): void {
  tn(g, v, d, t, dur, 'sine', f0, peak, 0.001, f1, dur);
}

export function playOneShot(g: Graph, id: string, t: number, o: CueOpts, key: KeyInfo): void {
  const L = SFX_LEVEL;
  switch (id) {
    case 'pop': {
      const s = sfxVoice(g, t, 0.1, L.pop, o); if (!s) return;
      nz(g, s.v, s.d, t, 0.015, 'bandpass', 2200 * s.p, 1.5, 1.0);
      knock(g, s.v, s.d, t, 180 * s.p, 110 * s.p, 0.08, 0.9);
      nz(g, s.v, s.d, t + 0.005, 0.06, 'highpass', 3000, 0.7, 0.15);
      return;
    }
    case 'whoosh': {
      // Band-pass sweep 600 → 2,400 Hz over 60% of the flip (Q 2), gain 0 → peak → 0; shove-its 400 → 1,200 with a
      // pan sweep; the tre flip layers two sweeps 80 ms apart. Shorter flips sweep higher (pitch follows spin rate).
      const dur = Math.max(0.12, (o.dur ?? 0.32) * 0.6);
      const rate = Math.min(1.25, Math.max(0.85, 0.32 / Math.max(0.2, o.dur ?? 0.32)));
      const shove = o.variant === 'shove', layered = o.variant === 'tre';
      const s = sfxVoice(g, t, dur + (layered ? 0.09 : 0), L.whoosh, o); if (!s) return;
      let d = s.d;
      if (shove) {
        const p = g.ctx.createStereoPanner(); p.connect(s.v.out); d = p;
        p.pan.setValueAtTime(-0.45, t); p.pan.linearRampToValueAtTime(0.45, t + dur);
      }
      const [f0, f1] = shove ? [400, 1200] : [600, 2400];
      nz(g, s.v, d, t, dur, 'bandpass', f0 * rate * s.p, 2, 0.5, 0, f1 * rate * s.p, 'swell');
      if (layered) nz(g, s.v, d, t + 0.08, dur, 'bandpass', f0 * 1.2 * rate, 2, 0.35, 0, f1 * 1.2 * rate, 'swell');
      return;
    }
    case 'catch': {
      const s = sfxVoice(g, t, 0.05, L.catch, o); if (!s) return;
      nz(g, s.v, s.d, t, 0.02, 'highpass', 2500, 0.7, 0.6);
      tn(g, s.v, s.d, t, 0.03, 'sine', 210 * s.p, 0.5);
      return;
    }
    case 'land': case 'sketchy': case 'perfect': {
      // Two knocks 15 ms apart (sine 140 Hz, 60 ms + 20 ms of noise at 1.5 kHz) and a 70 Hz thud. Bigger drops add up
      // to +4 dB and −20% pitch. Sketchy adds a 120 ms scuff; Perfect is a double clack plus a chord chime.
      const drop = Math.min(1, Math.max(0, (o.drop ?? 0) / 2));
      const s = sfxVoice(g, t, 0.2, (id === 'sketchy' ? L.sketchy : id === 'perfect' ? L.perfect : L.land) * Math.pow(10, (4 * drop) / 20), o);
      if (!s) return;
      const pf = s.p * (1 - 0.2 * drop);
      for (const dt of [0, 0.015]) {
        tn(g, s.v, s.d, t + dt, 0.06, 'sine', 140 * pf, dt ? 0.55 : 0.7);
        nz(g, s.v, s.d, t + dt, 0.02, 'bandpass', 1500 * pf, 1.2, dt ? 0.35 : 0.45);
      }
      tn(g, s.v, s.d, t, 0.12, 'sine', 70 * pf, 0.8, 0.003, 52 * pf, 0.12);
      if (id === 'sketchy') nz(g, s.v, s.d, t + 0.02, 0.12, 'bandpass', 1200, 0.9, 0.35, 0.01, 600);
      if (id === 'perfect') {
        nz(g, s.v, s.d, t + 0.03, 0.025, 'bandpass', 2600, 2, 0.5);
        nz(g, s.v, s.d, t + 0.065, 0.025, 'bandpass', 3000, 2, 0.4);
        chordChime(g, t + 0.06, key, 0.6);
      }
      return;
    }
    case 'stair': {
      const s = sfxVoice(g, t, 0.03, L.stair, o); if (!s) return;
      nz(g, s.v, s.d, t, 0.025, 'bandpass', 900 * s.p, 1, 0.7);
      tn(g, s.v, s.d, t, 0.025, 'sine', 160 * s.p, 0.6);
      return;
    }
    case 'bump': {
      const s = sfxVoice(g, t, 0.14, L.bump, { ...o, pan: (o.side ?? 0) * 0.6 }); if (!s) return;
      nz(g, s.v, s.d, t, 0.1, 'bandpass', 700 * s.p, 0.9, 0.5, 0.004, 450);
      tn(g, s.v, s.d, t, 0.09, 'sine', 90 * s.p, 0.7, 0.002, 60);
      return;
    }
    case 'knock': {
      const s = sfxVoice(g, t, 0.16, L.knock, o); if (!s) return;
      tn(g, s.v, s.d, t, 0.04, 'sine', 600 * s.p, 0.8);
      for (let i = 1; i <= 3; i++) nz(g, s.v, s.d, t + 0.02 + i * 0.025, 0.015, 'bandpass', 2000 * s.p, 2, 0.35 / i);
      return;
    }
    case 'coin': {
      // Sine + 2× partial (0.3), 180 ms; a fifth above at 0.6 gain 60 ms later. Pitch climbs the area pentatonic.
      const n = o.n ?? 0;
      const m = coinMidi(key.area, n, COIN.octave, COIN.maxDegrees);
      const big = o.variant === 'big';
      const oct = (m - coinMidi(key.area, 0, COIN.octave, 0)) / 12;
      const roll = Math.pow(10, (-COIN.highRolloffDbPerOct * oct) / 20);
      const s = sfxVoice(g, t, COIN.fifthDelay + COIN.decay + (big ? 0.3 : 0), (big ? COIN.bigGain : COIN.gain) * roll, { ...o, pitch: 1 }); if (!s) return;
      const f = midiHz(m), f5 = midiHz(m + 7);
      tn(g, s.v, s.d, t, COIN.decay, 'sine', f, 1, 0.002);
      tn(g, s.v, s.d, t, COIN.decay * 0.6, 'sine', f * 2, COIN.partialGain * roll);
      tn(g, s.v, s.d, t + COIN.fifthDelay, COIN.decay, 'sine', f5, COIN.fifthGain);
      if (big) tn(g, s.v, s.d, t + COIN.fifthDelay * 2, COIN.decay + 0.25, 'sine', f * 2, 0.35);
      return;
    }
    case 'nearMiss': {
      const s = sfxVoice(g, t, 0.16, L.nearMiss, { ...o, pan: (o.side ?? 0) * 0.75 }); if (!s) return;
      nz(g, s.v, s.d, t, 0.15, 'bandpass', 3000 * s.p, 2, 0.6, 0, 1000 * s.p, 'swell');
      return;
    }
    case 'hazardTick': {
      // Wood block: 1.6 kHz for 20 ms plus 5 ms of noise. A readable cue, never quantized.
      const s = sfxVoice(g, t, 0.04, L.hazardTick, { ...o, pitch: 1 }); if (!s) return;
      tn(g, s.v, s.d, t, 0.02, 'sine', 1600, 0.8, 0.0008);
      tn(g, s.v, s.d, t, 0.012, 'triangle', 800, 0.3, 0.0008);
      nz(g, s.v, s.d, t, 0.005, 'bandpass', 2500, 1, 0.4, 0.0005);
      return;
    }
    case 'comboBank': {
      // An arpeggio of the current chord, 4 notes 50 ms apart, on the feedback bus (gateway: an octave on top).
      const ch = key.chord;
      const notes = ch ? [...ch.voicing].sort((a, b) => a - b).map((m) => m + 12) : [0, 2, 3, 5].map((d) => pentatonicNote(key.area, d, 5));
      if (o.variant === 'gateway') notes.push(notes[0]! + 12);
      notes.forEach((m, i) => playMallet(g, g.fb, t + (i * COMBO_BANK.noteMs) / 1000, m, 1, { gain: COMBO_BANK.gain, decay: 0.6, pri: PRI.feedback }));
      return;
    }
    case 'comboLost': {
      // Descending minor third on the feedback bus, soft.
      const top = pentatonicNote(key.area, 3, 5);
      playMallet(g, g.fb, t, top, 0.8, { gain: FEEDBACK.gain * 0.6, decay: 0.5, pri: PRI.feedback });
      playMallet(g, g.fb, t + 0.16, top - 3, 0.7, { gain: FEEDBACK.gain * 0.55, decay: 0.7, pri: PRI.feedback });
      return;
    }
    case 'crash': {
      // Low-passed noise burst (250 ms), an 80 → 40 Hz thump (300 ms), 3–5 board-clatter knocks (150–300 Hz) over
      // 0.6 s and the wheel whir. The tape stop is started by the bindings.
      const s = sfxVoice(g, t, 0.75, L.crash, o); if (!s) return;
      nz(g, s.v, s.d, t, 0.25, 'lowpass', 1500, 0.7, 0.8, 0.003);
      tn(g, s.v, s.d, t, 0.3, 'sine', 80, 1, 0.003, 40, 0.3);
      const n = 3 + Math.floor(g.rng.float() * 3);
      for (let i = 0; i < n; i++) {
        const at = t + 0.08 + (i / n) * 0.5 + g.rng.float() * 0.04;
        const f = 150 + g.rng.float() * 150;
        tn(g, s.v, s.d, at, 0.05, 'sine', f, 0.55 * (1 - i / (n + 1)), 0.001, f * 0.8);
        nz(g, s.v, s.d, at, 0.02, 'bandpass', 1800, 1.5, 0.25 * (1 - i / (n + 1)));
      }
      tn(g, s.v, s.d, t, 0.5, 'triangle', 900, 0.06, 0.01, 700);
      return;
    }
    case 'grindEntry': case 'grindSwitch': {
      const kind = GRIND_MATERIAL[o.material ?? 'metal'];
      const s = sfxVoice(g, t, 0.25, L.grindEntry * (id === 'grindSwitch' ? 0.6 : 1), o); if (!s) return;
      if (kind === 'metal' || kind === 'neon') {
        // FM clank at 600 Hz, ratio 1.41, index 8 → 0 over 0.2 s.
        const ctx = g.ctx, f = 600 * s.p;
        const car = osc(ctx, 'sine', f);
        const eg = gain(ctx, 0, s.d); car.connect(eg);
        const mod = osc(ctx, 'sine', f * 1.41); const mi = gain(ctx, 8 * f * 1.41);
        mod.connect(mi); mi.connect(car.frequency);
        mi.gain.setValueAtTime(8 * f * 1.41, t); mi.gain.exponentialRampToValueAtTime(1, t + 0.2);
        perc(eg.gain, t, 0.5, 0.001, 0.22);
        s.v.src(car, t, t + 0.25); s.v.src(mod, t, t + 0.25);
      } else if (kind === 'concrete') {
        tn(g, s.v, s.d, t, 0.09, 'sine', 120 * s.p, 0.9, 0.002, 80);
        nz(g, s.v, s.d, t, 0.05, 'bandpass', 900, 0.8, 0.4);
      } else {
        knock(g, s.v, s.d, t, 260 * s.p, 160 * s.p, 0.07, 0.8);
        nz(g, s.v, s.d, t, 0.03, 'bandpass', 700, 1.5, 0.35);
      }
      return;
    }
    case 'grindExit': {
      const s = sfxVoice(g, t, 0.1, L.grindExit, o); if (!s) return;
      const kind = GRIND_MATERIAL[o.material ?? 'metal'];
      nz(g, s.v, s.d, t, 0.08, 'bandpass', kind === 'metal' || kind === 'neon' ? 3400 : 900, 2, 0.5, 0.002, kind === 'wood' ? 500 : undefined);
      tn(g, s.v, s.d, t, 0.03, 'sine', 180 * s.p, 0.4);
      return;
    }
    case 'perfectLock': {
      // Bright metal ring: three inharmonic partials on the chord's fifth, 0.4 s.
      const s = sfxVoice(g, t, 0.45, L.perfectLock, o); if (!s) return;
      const base = midiHz(feedbackMidi(key.area, key.chord, 3, 6, 6));
      for (const [k, a] of [[1, 0.6], [1.62, 0.3], [2.56, 0.18]] as const) tn(g, s.v, s.d, t, 0.4 / k, 'sine', base * k, a, 0.001);
      chordChime(g, t + 0.04, key, 0.45);
      return;
    }
    case 'spin': {
      // Low swish: band-pass 350 → 700 Hz over the spin, pan sweep by direction.
      const dur = Math.max(0.18, (o.dur ?? 0.4) * 0.7);
      const s = sfxVoice(g, t, dur, L.spin, o); if (!s) return;
      const p = g.ctx.createStereoPanner(); p.connect(s.v.out);
      const dir = o.side ?? 1;
      p.pan.setValueAtTime(-0.4 * dir, t); p.pan.linearRampToValueAtTime(0.4 * dir, t + dur);
      nz(g, s.v, p, t, dur, 'bandpass', 350 * s.p, 1.2, 0.6, 0, 700 * s.p, 'swell');
      return;
    }
    case 'revert': {
      const s = sfxVoice(g, t, 0.13, L.revert, o); if (!s) return;
      nz(g, s.v, s.d, t, 0.12, 'bandpass', 900 * s.p, 1, 0.6, 0.004, 500);
      return;
    }
    case 'pickChime': {
      // Soft chime: the chord's 5th-ish feedback note an octave up, sine + quiet 3× partial, 0.5 s. Not quantized.
      const s = sfxVoice(g, t, 0.5, L.pickChime, o, PRI.sfx, g.fb); if (!s) return;
      const f = midiHz(feedbackMidi(key.area, key.chord, 4, 5, 8));
      tn(g, s.v, s.d, t, 0.5, 'sine', f, 1, 0.004);
      tn(g, s.v, s.d, t, 0.18, 'sine', f * 3, 0.12, 0.004);
      return;
    }
    case 'rewind': {
      const s = sfxVoice(g, t, 0.4, L.rewind, o); if (!s) return;
      nz(g, s.v, s.d, t, 0.35, 'bandpass', 1000, 3, 0.7, 0.02, 5000, 'swell');
      tn(g, s.v, s.d, t, 0.35, 'triangle', 300, 0.15, 0.02, 1400, 0.35);
      return;
    }
    case 'needle': {
      const s = sfxVoice(g, t, 0.12, L.needle, o); if (!s) return;
      nz(g, s.v, s.d, t, 0.004, 'highpass', 1000, 0.7, 1, 0.0003);
      tn(g, s.v, s.d, t, 0.08, 'sine', 60, 0.5, 0.002);
      nz(g, s.v, s.d, t + 0.03, 0.05, 'bandpass', 3000, 1, 0.12);
      return;
    }
    case 'newBest': {
      // "Vocal-chop" flourish: a saw through 'ah' formants (700 / 1,200 Hz), three rising pentatonic notes.
      const s = sfxVoice(g, t, 0.7, L.newBest, o, PRI.sfx, g.fb); if (!s) return;
      const ctx = g.ctx;
      const f1 = filter(ctx, 'bandpass', 700, 6, s.d), f2 = filter(ctx, 'bandpass', 1200, 8, s.d);
      const eg = gain(ctx, 0); eg.connect(f1); eg.connect(f2);
      const o1 = osc(ctx, 'sawtooth', 220, eg);
      const vib = osc(ctx, 'sine', 5.5); const vd = gain(ctx, 6); vib.connect(vd); vd.connect(o1.frequency);
      [2, 3, 5].forEach((d, i) => o1.frequency.setValueAtTime(midiHz(pentatonicNote(key.area, d, 4)), t + i * 0.11));
      eg.gain.setValueAtTime(0, t);
      eg.gain.linearRampToValueAtTime(1, t + 0.02);
      eg.gain.setValueAtTime(1, t + 0.4);
      eg.gain.linearRampToValueAtTime(0, t + 0.65);
      s.v.src(o1, t, t + 0.68); s.v.src(vib, t, t + 0.68);
      return;
    }
    case 'newArea': {
      // A soft swell (band-pass 2 → 5 kHz, 0.8 s) and a high mallet note on the area's tonic.
      const s = sfxVoice(g, t, 1.0, L.newArea, o); if (!s) return;
      nz(g, s.v, s.d, t, 0.8, 'bandpass', 2000, 1.5, 0.35, 0, 5000, 'swell');
      playMallet(g, g.fb, t + 0.35, pentatonicNote(key.area, 5, 4), 0.7, { gain: 0.16, decay: 1.0, pri: PRI.feedback });
      return;
    }
    default: return;
  }
}

/** Quiet chime of the current chord's top voices, an octave up (Perfect landing / Perfect Lock). */
export function chordChime(g: Graph, t: number, key: KeyInfo, level: number): void {
  const ch = key.chord;
  const top = ch ? [...ch.voicing].sort((a, b) => b - a).slice(0, 2) : [pentatonicNote(key.area, 2, 4), pentatonicNote(key.area, 4, 4)];
  top.forEach((m, i) => playMallet(g, g.fb, t + i * 0.012, m + 12, 0.8, { gain: 0.16 * level, decay: 0.6, pri: PRI.feedback }));
}
