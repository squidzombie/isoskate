// The pure sequencer clock (TECH §11.1 audio row): step times at 84 BPM with 58% swing, the lookahead window
// produces every step exactly once however the ticks fall, and quantization never moves a note more than 40 ms.
import { describe, expect, it } from 'vitest';
import { barAt, barSec, barStart, beatSec, jitter, nextSixteenth, quantize, sixteenthSec, stepOffset, stepsIn, stepTime, swingBeats, type SongClock } from '../../../src/audio/clock';
import { QUANTIZE_MAX, SCHED } from '../../../src/audio/mix.config';

const C84: SongClock = { bpm: 84, t0: 10, bar0: 0, swing: 0.58 };

describe('song clock', () => {
  it('84 BPM: beat 0.714 s, 16th 0.179 s, bar 2.857 s; 58% swing delays odd 16ths by 0.04 beat', () => {
    expect(beatSec(84)).toBeCloseTo(60 / 84, 12);
    expect(sixteenthSec(84)).toBeCloseTo(15 / 84, 12);
    expect(barSec(84)).toBeCloseTo(240 / 84, 12);
    expect(swingBeats(0.58)).toBeCloseTo(0.04, 12);
    expect(SCHED.swing).toBe(0.58);
  });

  it('expected step times for one bar at 84 BPM swing 58%', () => {
    const s16 = 15 / 84, sw = 0.04 * (60 / 84);
    const expected = Array.from({ length: 16 }, (_, i) => 10 + i * s16 + (i % 2 ? sw : 0));
    for (let i = 0; i < 16; i++) expect(stepTime(C84, 0, i)).toBeCloseTo(expected[i]!, 9);
    // Odd 16ths: 0.29 beat after the 8th (58 : 42 split of each 8th).
    expect((stepTime(C84, 0, 1) - stepTime(C84, 0, 0)) / (stepTime(C84, 0, 2) - stepTime(C84, 0, 0))).toBeCloseTo(0.58, 9);
    expect(stepTime(C84, 3, 0)).toBeCloseTo(10 + 3 * (240 / 84), 9);
    expect(stepOffset(84, 4, 0.58)).toBeCloseTo(60 / 84, 9);          // step 4 = beat 2, straight
  });

  it('bars index from bar0 at t0 and barAt inverts barStart', () => {
    const c: SongClock = { bpm: 78, t0: 3.5, bar0: 4, swing: 0.58 };
    expect(barStart(c, 4)).toBe(3.5);
    for (let b = 0; b < 70; b++) expect(barAt(c, barStart(c, b) + 0.001)).toBe(b);
  });

  it('the lookahead window emits each step exactly once, in order, for any tick chunking', () => {
    const want = stepsIn(C84, 10, 40).map((s) => `${s.bar}:${s.step}`);
    expect(want.length).toBe(Math.round((30 / barSec(84)) * 16));
    for (const seed of [1, 2, 3]) {
      let from = 10, got: string[] = [], last = -Infinity, k = seed;
      while (from < 40) {
        k = (k * 1103515245 + 12345) >>> 0;
        const to = Math.min(40, from + 0.005 + (k % 1000) / 1000 * 0.2);   // 5–205 ms ticks
        for (const s of stepsIn(C84, from, to)) { expect(s.t).toBeGreaterThanOrEqual(last); last = s.t; got.push(`${s.bar}:${s.step}`); }
        from = to;
      }
      expect(got).toEqual(want);
    }
  });

  it('quantize: the next swung 16th if ≤ 40 ms away, else now; never earlier, never later than 40 ms', () => {
    expect(QUANTIZE_MAX).toBe(0.04);
    for (let t = 10; t < 16; t += 0.0037) {
      const q = quantize(C84, t);
      expect(q).toBeGreaterThanOrEqual(t);
      expect(q - t).toBeLessThanOrEqual(0.04 + 1e-9);
      const n = nextSixteenth(C84, t);
      if (n - t <= 0.04) expect(q).toBeCloseTo(n, 12); else expect(q).toBe(t);
    }
    expect(quantize(null, 5)).toBe(5);
  });

  it('humanize jitter is deterministic and in [−1, 1)', () => {
    for (let i = 0; i < 2000; i++) {
      const j = jitter(7, i, i % 16, 3);
      expect(j).toBeGreaterThanOrEqual(-1);
      expect(j).toBeLessThan(1);
      expect(jitter(7, i, i % 16, 3)).toBe(j);
    }
  });
});
