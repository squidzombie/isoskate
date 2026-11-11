// bots.quick, part 2 (TECH §11.2, part of `npm test`): the safe bot (planner on the 2.5 s view as seen 0.25 s ago,
// 0.15 s input latency, ±0.05 s tap jitter, 85 % lateral speed) never crashes: 20 seeds × 4 min from the plateau.
import { describe, expect, it } from 'vitest';
import { describeCrash, runBot } from '../../src/debug/bots';
import { MIN, PLATEAU_T } from './suites';

describe('bots.quick (safe bot)', () => {
  it('safe bot: 0 crashes on 20 seeds × 4 min from the plateau (startT 150)', () => {
    const crashes: string[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const r = runBot('safe', seed, { ticks: 4 * MIN, startT: PLATEAU_T });
      if (r.crash) crashes.push(`seed ${seed}: ${describeCrash(r)}`);
    }
    expect(crashes).toEqual([]);
  }, 300_000);
});
