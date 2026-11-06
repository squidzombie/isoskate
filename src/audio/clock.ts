// audio/clock.ts: pure musical time (no WebAudio), shared by the live scheduler, the offline render and the tests.
// A song clock maps (bar, 16th step) to AudioContext seconds: bar b starts at t0 + (b − bar0)·barSec, and odd 16ths
// are delayed by (swing − 0.5)·0.5 beat (58% swing → 0.04 beat, DESIGN §19.1).
import { hash32 } from '../core/rng';
import { QUANTIZE_MAX, SCHED } from './mix.config';

export interface SongClock { bpm: number; t0: number; bar0: number; swing: number }

export const beatSec = (bpm: number) => 60 / bpm;
export const sixteenthSec = (bpm: number) => 15 / bpm;
export const barSec = (bpm: number) => 240 / bpm;
/** Delay of every odd 16th, in beats: 58% swing → 0.04. */
export const swingBeats = (swing: number) => (swing - 0.5) * 0.5;

export function barStart(c: SongClock, bar: number): number {
  return c.t0 + (bar - c.bar0) * barSec(c.bpm);
}
/** Straight-grid offset of a 16th step inside its bar plus the swing delay for odd steps, in seconds. */
export function stepOffset(bpm: number, step: number, swing: number): number {
  const s16 = sixteenthSec(bpm);
  return step * s16 + (step % 2 === 1 ? swingBeats(swing) * beatSec(bpm) : 0);
}
export function stepTime(c: SongClock, bar: number, step: number): number {
  return barStart(c, bar) + stepOffset(c.bpm, step, c.swing);
}
/** Bar index containing time t (may be fractional-negative before t0 → floor). */
export function barAt(c: SongClock, t: number): number {
  return c.bar0 + Math.floor((t - c.t0) / barSec(c.bpm) + 1e-9);
}
/** The first swung 16th grid time ≥ t. */
export function nextSixteenth(c: SongClock, t: number): number {
  const b = barAt(c, t);
  for (let bar = b; bar <= b + 1; bar++) {
    for (let s = 0; s < SCHED.stepsPerBar; s++) {
      const st = stepTime(c, bar, s);
      if (st >= t - 1e-9) return st;
    }
  }
  return barStart(c, b + 2);
}
/** Feedback quantization (§9): the next 16th if it is ≤ `max` away, otherwise now. Always in [t, t + max]. */
export function quantize(c: SongClock | null, t: number, max = QUANTIZE_MAX): number {
  if (!c) return t;
  const n = nextSixteenth(c, t);
  return n - t <= max ? n : t;
}

/** Deterministic humanize in [−1, 1) for one note: a hash of (seed, bar, step, lane), independent of how the
 *  scheduler chunks time, so live play and offline renders agree. */
export function jitter(seed: number, bar: number, step: number, lane: number): number {
  return hash32(seed, bar, step, lane) / 2147483648 - 1;
}

/** Lookahead window: every (bar, step) whose time falls in [from, to), in order. Pure; the scheduler calls this with
 *  from = the previous horizon, so each step is produced exactly once however the ticks fall. */
export function stepsIn(c: SongClock, from: number, to: number): { bar: number; step: number; t: number }[] {
  const out: { bar: number; step: number; t: number }[] = [];
  if (!(to > from)) return out;
  for (let bar = barAt(c, from) - 1; barStart(c, bar) < to; bar++) {
    for (let s = 0; s < SCHED.stepsPerBar; s++) {
      const t = stepTime(c, bar, s);
      if (t >= from && t < to) out.push({ bar, step: s, t });
    }
  }
  return out;
}
