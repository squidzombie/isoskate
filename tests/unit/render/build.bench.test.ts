// Chunk-build bench (TECH §8.4 "chunk build ≤ 4 ms", §8.6; part of `npm test` like the sim and segment benches):
// real WG content at each area's plateau (seed 7, the second visit, 20 chunks per area, the chunks wa.spec streams),
// every chunk built alone into pooled writers, best of 3 per chunk (CPU noise only adds time), p95 over all chunks.
// The gate runs here in Node rather than in the browser: under SwiftShader the GPU rasteriser threads share the CPU
// with the page, so a single build timed in Chromium reads 2× slower with GC-sized outliers (G1: browser p95 4.3–5.6
// ms on the same chunks whose Node p95 is ~2 ms). wa.spec still logs the in-browser numbers.
import { describe, expect, it } from 'vitest';
import type { AreaId } from '../../../src/core/ids';
import { CHUNK_LEN, sAt } from '../../../src/core/tuning';
import { createWorldGen } from '../../../src/world/gen';
import { DEFAULT_BUILD, buildChunk } from '../../../src/world/render/chunkBuilder';
import { GeoPool, type PooledGeo } from '../../../src/world/render/pools';
import { GeoWriter, type KitTargets } from '../../../src/world/render/writer';

export const CHUNK_BUILD_BUDGET_MS = 4;
const TARGETS = ['o', 'x', 'e', 'g', 'b'] as const;
type T = (typeof TARGETS)[number];
/** Plateau starts 2 s into each area's second visit (as wa.spec). */
const PLATEAU: readonly [AreaId, number][] = [['downtown', 163], ['suburbs', 202], ['docks', 241], ['neon', 280]];

describe('chunk build bench', () => {
  it(`single chunk builds p95 ≤ ${CHUNK_BUILD_BUDGET_MS} ms (4 areas at the plateau × 20 chunks, best of 3)`, () => {
    const pools = Object.fromEntries(TARGETS.map((t) => [t, new GeoPool(256)])) as Record<T, GeoPool>;
    const w = Object.fromEntries(TARGETS.map((t) => [t, new GeoWriter()])) as unknown as KitTargets;
    const all: number[] = [];
    const per: string[] = [];
    for (const [area, startT] of PLATEAU) {
      const gen = createWorldGen({ seed: 7, mode: 'normal', startT });
      const src = { areaAt: (s: number) => gen.areaAt(s) };
      const i0 = Math.floor(sAt(startT) / CHUNK_LEN);
      const best = new Array<number>(20).fill(Infinity);
      for (let rep = 0; rep < 3; rep++) {
        for (let k = 0; k < 20; k++) {
          const ch = gen.chunk(i0 + k);
          for (const t of TARGETS) w[t].begin(pools[t].acquire());
          const t0 = performance.now();
          buildChunk(ch, w, src, DEFAULT_BUILD, 40, false);
          best[k] = Math.min(best[k]!, performance.now() - t0);
          for (const t of TARGETS) pools[t].release(w[t].end() as PooledGeo);
        }
      }
      const s = best.slice().sort((a, b) => a - b);
      per.push(`${area} p50 ${s[10]!.toFixed(2)} max ${s[19]!.toFixed(2)}`);
      all.push(...best);
    }
    all.sort((a, b) => a - b);
    const p95 = all[Math.min(all.length - 1, Math.floor(all.length * 0.95))]!;
    console.info(`[bench] chunk build p95 ${p95.toFixed(2)} ms over ${all.length} chunks (${per.join('; ')})`);
    expect(p95).toBeLessThanOrEqual(CHUNK_BUILD_BUDGET_MS);
  }, 60_000);
});
