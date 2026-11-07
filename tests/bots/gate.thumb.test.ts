// Gate: the thumb bot (the safe plan as pointer traces through the real recognizer): 20 seeds × 4 min at the plateau
// (DESIGN §10.11),
// 0 crashes and 0 unintended tricks (any flip / spin / grab / manual start: the plan asks for none).
import { describe, expect, it } from 'vitest';
import { describeCrash, runBot } from '../../src/debug/bots';
import { MIN, PLATEAU_T, crashOf, seedsFor, writeReport } from './suites';

describe('bots gate: thumb', () => {
  it('thumb bot: 0 crashes, 0 unintended tricks on 20 seeds × 4 min from the plateau', () => {
    const runs = seedsFor(20).map((seed) => runBot('thumb', seed, { ticks: 4 * MIN, startT: PLATEAU_T }));
    const unintended = runs.flatMap((r) => r.unintended.map((u) => ({ seed: r.seed, t: +u.t.toFixed(3), ev: u.ev })));
    writeReport('thumb', {
      bot: 'thumb', seeds: runs.length, minutes: 4, startT: PLATEAU_T, crashes: runs.filter((r) => r.crash).map(crashOf), unintended,
      ollies: runs.reduce((a, r) => a + (r.events.ollie ?? 0), 0),
    });
    expect(runs.filter((r) => r.crash).map((r) => `seed ${r.seed}: ${describeCrash(r)}`)).toEqual([]);
    expect(unintended).toEqual([]);
  });
});
