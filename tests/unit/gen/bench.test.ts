// World-gen bench (TECH §6.8, §11.6: part of `npm test`): generating and validating one segment ≤ 3 ms p95. Each
// `ensure(∞, 1)` call is one unit of the loop's per-frame generation budget (TECH §5.2). 5 seeds × ~8 min of street
// from t = 0, releasing behind as the game does. CPU is shared, so the p95 is taken over 2 passes and the better one
// counts (noise only adds time).
import { describe, expect, it } from 'vitest';
import { CHUNK_LEN } from '../../../src/core/tuning';
import { createWorldGen } from '../../../src/world/gen';

export const SEGMENT_P95_BUDGET_MS = 3;
const SEGMENTS_PER_SEED = 160;

function pass(): { p95: number; n: number; max: number } {
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
  return { p95: times[Math.floor(0.95 * (times.length - 1))]!, n: times.length, max: times[times.length - 1]! };
}

describe('world-gen bench', () => {
  it(`one segment (generate + validate) ≤ ${SEGMENT_P95_BUDGET_MS} ms p95 (5 seeds, best of 2 passes)`, () => {
    const a = pass(), b = pass();
    const best = a.p95 <= b.p95 ? a : b;
    console.info(`[bench] segment p95 ${best.p95.toFixed(3)} ms (n ${best.n}, max ${best.max.toFixed(2)} ms)`);
    expect(best.n).toBeGreaterThan(100);
    expect(best.p95).toBeLessThanOrEqual(SEGMENT_P95_BUDGET_MS);
  });
});
