// Sim bench (TECH §6.8, §11.6: part of `npm test`): `step()` ≤ 0.05 ms mean per tick. The input is recorded first
// (SafeKey follower `BOTS.conformance`, 3 seeds × 2 min from t = 0, with S_TRENCH as shipped) in `beforeAll`, then
// replayed into a fresh Sim, so only sim work is timed and the bot's cost never counts against the test's timeout
// (G1: `BOTS.safe` became the planner, about 2× the follower's cost). The replayed world is generated before the
// clock starts (world/gen has its own segment bench), so only `step()` is timed. CPU is shared with other agents and
// CI jobs, so each seed is replayed 3 times and the best mean counts: noise only ever adds time, and a real
// regression slows every repeat.
import { beforeAll, describe, expect, it } from 'vitest';
import { EMPTY_FRAME, type InputFrame } from '../../../src/core/input';
import type { RunConfig } from '../../../src/core/sim';
import { sAt, SIM_HZ } from '../../../src/core/tuning';
import { BOTS } from '../../../src/debug/bots';
import { createSim } from '../../../src/sim';
import { TRICKS } from '../../../src/tricks';

export const SIM_TICK_BUDGET_MS = 0.05;
const TICKS = 120 * SIM_HZ;
const cfg = (seed: number): RunConfig => ({ runId: `bench-${seed}`, seed, mode: 'normal', firstRuns: false, bestDist: 0 });

function record(c: RunConfig): InputFrame[] {
  const sim = createSim(TRICKS);
  sim.reset(c);
  const bot = BOTS.conformance!({ seed: c.seed });
  const frames: InputFrame[] = [];
  for (let i = 0; i < TICKS && sim.cur.mode !== 'crashed'; i++) {
    const fr: InputFrame = { ...EMPTY_FRAME, ...bot.frame(sim) };
    frames.push(fr);
    sim.step(fr);
  }
  return frames;
}

const SEEDS = [1, 2, 3];
const recorded = new Map<number, InputFrame[]>();

describe('sim bench', () => {
  beforeAll(() => { for (const seed of SEEDS) recorded.set(seed, record(cfg(seed))); }, 60_000);

  it(`step() mean ≤ ${SIM_TICK_BUDGET_MS} ms per tick (SafeKey run, 3 seeds × 2 min, best of 3)`, () => {
    const means: number[] = [];
    for (const seed of SEEDS) {
      const c = cfg(seed);
      const frames = recorded.get(seed)!;
      expect(frames.length, `seed ${seed} must survive the recording`).toBe(TICKS);
      let best = Infinity;
      for (let rep = 0; rep < 3; rep++) {
        const sim = createSim(TRICKS);
        sim.reset(c);
        sim.gen.ensure(sAt(TICKS / SIM_HZ + 10));   // the 2 min of street (and its look-ahead) exist before timing
        const t0 = performance.now();
        for (const fr of frames) sim.step(fr);
        best = Math.min(best, (performance.now() - t0) / frames.length);
      }
      means.push(best);
    }
    const mean = means.reduce((a, b) => a + b, 0) / means.length;
    console.info(`[bench] sim step mean ${mean.toFixed(4)} ms/tick (per seed ${means.map((m) => m.toFixed(4)).join(', ')})`);
    expect(mean).toBeLessThanOrEqual(SIM_TICK_BUDGET_MS);
  }, 30_000);
});
