// Gate: going straight is not viable (DESIGN §10.7): every lane x ∈ {−4 … 4} crashes by t ≤ 20 s from t = 0, and
// within 10 s of a plateau start (150 and 165), on 20 seeds; the straight bot ollies every full-width hazard.
import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/debug/bots';
import { seedsFor, writeReport } from './suites';

const LANES = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

describe('bots gate: straight', () => {
  it('straight bot: 100 % of lanes crash by 20 s from t = 0 and within 10 s of startT 150 / 165 (20 seeds)', () => {
    const late: string[] = [];
    const worst: Record<string, number> = {};
    for (const [label, startT, limit] of [['t0', undefined, 20], ['p150', 150, 10], ['p165', 165, 10]] as const) {
      let w = 0;
      for (const seed of seedsFor(20)) for (const lane of LANES) {
        const r = runBot('straight', seed, { ticks: limit * 60, bot: { lane }, ...(startT !== undefined ? { startT } : {}) });
        if (!r.crash) late.push(`${label} seed ${seed} lane ${lane}`);
        else w = Math.max(w, r.survivedSec);
      }
      worst[label] = +w.toFixed(2);
    }
    writeReport('straight', { bot: 'straight', seeds: seedsFor(20).length, lanes: LANES, worstSurvivalSec: worst, alive: late });
    expect(late).toEqual([]);
  });
});
