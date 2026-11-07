// Gate: the trick bot (greedy trick lines, flips, spins, grinds on the safe plan): 50 seeds × 5 min from the
// plateau. Trick lines are safe to ride (0 crashes); feasibility: doubles, triples and the 360 spin happen.
// The score ratio (survival-only ÷ trick bot per minute ≤ 10 %, DESIGN §10.11 A4) and the p95 combo duration
// (≤ 45 s, comboBanked.durSec) are measured and written to artifacts/bots.json; they gate from G1, with the W1a
// scoring merged (ROADMAP W1b), so their assertions are `todo` here.
import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/debug/bots';
import { MIN, PLATEAU_T, crashOf, quantile, seedsFor, writeReport } from './suites';

const seeds = seedsFor(50);
const runs = seeds.map((seed) => runBot('trick', seed, { ticks: 5 * MIN, startT: PLATEAU_T }));
const survival = seeds.slice(0, 10).map((seed) => runBot('safe', seed, { ticks: 5 * MIN, startT: PLATEAU_T }));
const perMin = (r: { score: number; survivedSec: number }) => r.score / Math.max(1 / 60, r.survivedSec / 60);
const trickRate = runs.reduce((a, r) => a + perMin(r), 0) / runs.length;
const survRate = survival.reduce((a, r) => a + perMin(r), 0) / survival.length;
const durs = runs.flatMap((r) => r.combos.map((c) => c.durSec));
const count = (ids: readonly string[]) => runs.reduce((a, r) => a + ids.reduce((b, id) => b + (r.sim.score.tricks[id as keyof typeof r.sim.score.tricks] ?? 0), 0), 0);
const feasible = {
  doubles: count(['doubleKickflip', 'doubleHeelflip']),
  triples: count(['tripleKickflip', 'tripleHeelflip']),
  spin360: count(['fs360', 'bs360']),
  grinds: runs.reduce((a, r) => a + (r.events.grindStart ?? 0), 0),
};
writeReport('trick', {
  bot: 'trick', seeds: seeds.length, startT: PLATEAU_T, minutes: 5, feasible,
  scorePerMin: { trick: Math.round(trickRate), survival: Math.round(survRate), ratio: +(survRate / Math.max(1, trickRate)).toFixed(4) },
  comboSec: { n: durs.length, p50: +quantile(durs, 0.5).toFixed(2), p95: +quantile(durs, 0.95).toFixed(2), max: +Math.max(0, ...durs).toFixed(2) },
  crashes: runs.filter((r) => r.crash).map(crashOf),
});

describe('bots gate: trick', () => {
  it('trick bot: no trick-line deaths (DESIGN §10.11): 0 crashes on 50 seeds × 5 min', () => {
    expect(runs.filter((r) => r.crash).map(crashOf)).toEqual([]);
  });
  it('trick bot: doubles and the 360 spin are feasible on generated streets; grinds happen', () => {
    expect(feasible.doubles).toBeGreaterThan(0);
    expect(feasible.spin360).toBeGreaterThan(0);
    expect(feasible.grinds).toBeGreaterThan(seeds.length);
  });
  // Triples need ≥ 0.82 s of air (drops): reported, asserted from G1 with the W1a trick timings.
  it.todo('trick bot: a triple flip happens (G1)');
  it.todo('score ratio: survival-only ≤ 10 % of the trick bot per minute at the plateau (G1, W1a scoring)');
  it.todo('p95 combo duration ≤ 45 s (G1, W1a scoring)');
});
