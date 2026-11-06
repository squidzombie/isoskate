// Gate: the conformance bot follows the committed SafeKeys exactly: 50 seeds × 4 min, 0 crashes. It proves the
// validator's geometry and the sim's collision agree.
import { describe, expect, it } from 'vitest';
import { describeCrash, runBot } from '../../src/debug/bots';
import { MIN, crashOf, genOf, seedsFor, writeReport } from './suites';

describe('bots gate: conformance', () => {
  it('conformance bot: 0 crashes on 50 seeds × 4 min', () => {
    const runs = seedsFor(50).map((seed) => runBot('conformance', seed, { ticks: 4 * MIN }));
    writeReport('conformance', { bot: 'conformance', seeds: runs.length, minutes: 4, crashes: runs.filter((r) => r.crash).map(crashOf),
      grinds: runs.reduce((a, r) => a + (r.events.grindStart ?? 0), 0), gen: runs.map(genOf) });
    expect(runs.filter((r) => r.crash).map((r) => `seed ${r.seed}: ${describeCrash(r)}`)).toEqual([]);
  });
});
