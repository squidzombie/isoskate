// The safe-bot gate suite body (TECH §11.2), shared by the four gate.safe*.test.ts files (they run in parallel
// threads): seeds × 8 min, from t = 0 or from the plateau; the gate is 0 crashes.
import { describe, expect, it } from 'vitest';
import { describeCrash, runBot } from '../../src/debug/bots';
import { MIN, crashOf, genOf, writeReport } from './suites';

export function safeSuite(name: string, seeds: readonly number[], startT?: number): void {
  describe(`bots gate: ${name}`, () => {
    it(`safe bot: 0 crashes on ${seeds.length} seeds × 8 min${startT ? ` from startT ${startT}` : ' from t = 0'}`, () => {
      const runs = seeds.map((seed) => runBot('safe', seed, { ticks: 8 * MIN, ...(startT !== undefined ? { startT } : {}) }));
      const crashes = runs.filter((r) => r.crash);
      writeReport(name, {
        bot: 'safe', seeds: seeds.length, startT: startT ?? 0, minutes: 8, crashes: crashes.map(crashOf),
        gen: runs.map(genOf), wallSec: +(runs.reduce((a, r) => a + r.wallMs, 0) / 1000).toFixed(1),
      });
      expect(crashes.map((r) => `seed ${r.seed}: ${describeCrash(r)}`)).toEqual([]);
    });
  });
}
