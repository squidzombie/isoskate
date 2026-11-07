// Gate: the myopic bot (DESIGN §10.11): 100 seeds from the plateau, capped at 8 min; median survival ≥ 4 min.
// It may crash (it models a player who misreads lines); the survival distribution goes to artifacts/bots.json.
import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/debug/bots';
import { MIN, PLATEAU_T, crashOf, median, quantile, seedsFor, writeReport } from './suites';

describe('bots gate: myopic', () => {
  it('myopic bot: median survival ≥ 4 min over 100 plateau starts (capped at 8 min)', () => {
    const runs = seedsFor(100).map((seed) => runBot('myopic', seed, { ticks: 8 * MIN, startT: PLATEAU_T }));
    const surv = runs.map((r) => r.survivedSec / 60);
    const med = median(surv);
    writeReport('myopic', {
      bot: 'myopic', seeds: runs.length, startT: PLATEAU_T, capMin: 8, medianMin: +med.toFixed(2),
      p10Min: +quantile(surv, 0.1).toFixed(2), p25Min: +quantile(surv, 0.25).toFixed(2),
      survivedCap: surv.filter((m) => m >= 8 - 1e-6).length, survivalMin: surv.map((m) => +m.toFixed(2)),
      crashes: runs.filter((r) => r.crash).map(crashOf),
    });
    expect(med).toBeGreaterThanOrEqual(4);
  });
});
