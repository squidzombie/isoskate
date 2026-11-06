// World-gen bench (TECH §6.8, §11.6: part of `npm test`): generating and validating one segment, re-rolls included,
// ≤ 3 ms p95. Each `ensure(∞, 1)` call is one unit of the loop's per-frame generation budget (TECH §5.2). 5 seeds ×
// 160 segments (≈ 8 min of street) from t = 0, releasing behind as the game does. CPU is shared with other work, so
// a warm-up pass runs first (JIT), then the best p95 of 3 passes counts (noise only adds time).
import { describe, expect, it } from 'vitest';
import { CHUNK_LEN } from '../../../src/core/tuning';
import { createWorldGen } from '../../../src/world/gen';

export const SEGMENT_P95_BUDGET_MS = 3;
const SEGMENTS_PER_SEED = 160;

function pass(): { p50: number; p95: number; n: number; max: number } {
  const times: number[] = [];
  for (const seed of [1, 2, 3, 4, 5]) {
    const gen = createWorldGen({ seed, mode: 'normal' });
    for (let k = 0; k < SEGMENTS_PER_SEED; k++) {
      const before = gen.segments().length;
      const t0 = performance.now();
      gen.ensure(Number.MAX_SAFE_INTEGER, 1);
      times.push(performance.now() - t0);
      const segs = gen.segments();
      if (segs.length === before) break;
      if (k % 40 === 39) gen.release(Math.floor(segs[segs.length - 1]!.s0 / CHUNK_LEN) - 2);
    }
  }
  times.sort((a, b) => a - b);
  return { p50: times[Math.floor(0.5 * (times.length - 1))]!, p95: times[Math.floor(0.95 * (times.length - 1))]!, n: times.length, max: times[times.length - 1]! };
}

describe('world-gen bench', () => {
  it(`one segment (generate + validate, re-rolls included) ≤ ${SEGMENT_P95_BUDGET_MS} ms p95 (5 seeds, warm-up + best of 3 passes)`, () => {
    pass();
    const runs = [pass(), pass(), pass()];
    const best = runs.reduce((a, b) => (b.p95 < a.p95 ? b : a));
    console.info(`[bench] segment p50 ${best.p50.toFixed(3)} ms, p95 ${best.p95.toFixed(3)} ms (n ${best.n}, max ${best.max.toFixed(2)} ms); passes ${runs.map((r) => r.p95.toFixed(2)).join(' / ')}`);
    expect(best.n).toBeGreaterThan(700);
    expect(best.p95).toBeLessThanOrEqual(SEGMENT_P95_BUDGET_MS);
  }, 120_000);
});
