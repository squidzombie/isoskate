// bots.quick, part 1 (TECH §11.2, part of `npm test`): going straight is not viable (DESIGN §10.7: every lane
// x ∈ {−4 … 4} crashes by t ≤ 20 s from t = 0 and within 10 s of a plateau start), and the conformance bot (the
// committed SafeKeys followed exactly) never crashes: 10 seeds × 2 min. The safe bot is in quick.safe.test.ts.
// The headless harness is debug/bots/harness.ts: the real createSim + world generator, bots drive InputFrames only.
import { describe, expect, it } from 'vitest';
import { describeCrash, runBot } from '../../src/debug/bots';
import { MIN, PLATEAU_T } from './suites';

const LANES = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

describe('bots.quick', () => {
  it('straight bot: every lane crashes by t ≤ 20 s from t = 0 (9 lanes × 3 seeds)', () => {
    const late: string[] = [];
    for (const seed of [1, 2, 3]) for (const lane of LANES) {
      const r = runBot('straight', seed, { ticks: 20 * 60, bot: { lane } });
      if (!r.crash) late.push(`seed ${seed} lane ${lane}`);
    }
    expect(late).toEqual([]);
  });

  it('straight bot: every lane crashes within 10 s of a plateau start (9 lanes × 3 seeds)', () => {
    const late: string[] = [];
    for (const seed of [1, 2, 3]) for (const lane of LANES) {
      const r = runBot('straight', seed, { ticks: 10 * 60, startT: PLATEAU_T, bot: { lane } });
      if (!r.crash) late.push(`seed ${seed} lane ${lane}`);
    }
    expect(late).toEqual([]);
  });

  it('conformance bot (SafeKeys followed exactly): 0 crashes on 10 seeds × 2 min, never captured by an edge', () => {
    const crashes: string[] = [];
    let grinds = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = runBot('conformance', seed, { ticks: 2 * MIN });
      if (r.crash) crashes.push(`seed ${seed}: ${describeCrash(r)}`);
      grinds += r.events.grindStart ?? 0;
      expect(r.gen.fallbacks, `seed ${seed} fallbacks`).toBeLessThanOrEqual(1);
    }
    expect(crashes).toEqual([]);
    expect(grinds).toBe(0);
  });

  it('conformance bot on the Lesson Line (first runs): 0 crashes through 0–45 s on 3 seeds', () => {
    const crashes: string[] = [];
    for (const seed of [1, 2, 3]) {
      const r = runBot('conformance', seed, { ticks: 45 * 60, mode: 'lesson' });
      if (r.crash) crashes.push(`seed ${seed}: ${describeCrash(r)}`);
    }
    expect(crashes).toEqual([]);
  });
});
