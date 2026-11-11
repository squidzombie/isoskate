// World-gen bench (TECH §6.8, §11.6: part of `npm test`): generating and validating one segment, re-rolls included,
// ≤ 3 ms p95. Each `ensure(∞, 1)` call is one unit of the loop's per-frame generation budget (TECH §5.2).
//  - What runs is what ships: world/gen bundled by Vite's production bundler (Rollup), run by plain Node in a child
//    process. Vitest's module transform turns every cross-module call into a getter lookup, which costs this hot,
//    many-small-functions code about 2.5× and would measure the test runner, not the generator.
//  - CPU is shared with other work, and noise only adds time: after a warm-up pass (JIT), every segment is generated in
//    3 passes and its fastest time counts (generation is deterministic, so a segment is the same work in each pass);
//    the p95 is taken over those per-segment times. 5 seeds × 160 segments (≈ 8 min of street) from t = 0, releasing
//    behind as the game does.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type Rollup } from 'vite';
import { describe, expect, it } from 'vitest';

export const SEGMENT_P95_BUDGET_MS = 3;
const ROOT = resolve(__dirname, '../../..');

const RUNNER = (genUrl: string) => `
import { createWorldGen } from ${JSON.stringify(genUrl)};
const CHUNK_LEN = 32, SEEDS = [1, 2, 3, 4, 5], SEGS = 160, PASSES = 3;
function pass() {
  const times = [];
  for (const seed of SEEDS) {
    const gen = createWorldGen({ seed, mode: 'normal' });
    for (let k = 0; k < SEGS; k++) {
      const t0 = performance.now();
      gen.ensure(Number.MAX_SAFE_INTEGER, 1);
      times.push(performance.now() - t0);
      const segs = gen.segments();
      if (k % 40 === 39) gen.release(Math.floor(segs[segs.length - 1].s0 / CHUNK_LEN) - 2);
    }
  }
  return times;
}
pass();
const runs = Array.from({ length: PASSES }, pass);
const best = runs[0].map((_, i) => Math.min(...runs.map((r) => r[i])));
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };
console.log(JSON.stringify({ n: best.length, p50: q(best, 0.5), p95: q(best, 0.95), p99: q(best, 0.99), max: Math.max(...best),
  passP95: runs.map((r) => q(r, 0.95)) }));
`;

describe('world-gen bench', () => {
  it(`one segment (generate + validate, re-rolls included) ≤ ${SEGMENT_P95_BUDGET_MS} ms p95 (production bundle, 5 seeds, fastest of 3 passes per segment)`, async () => {
    const out = await build({
      configFile: false, root: ROOT, logLevel: 'silent',
      define: { __BUILD__: JSON.stringify({ version: 'bench', hash: 'bench', mode: 'production' }) },
      build: { ssr: 'src/world/gen/index.ts', write: false, minify: false, target: 'node22', rollupOptions: { output: { format: 'es' } } },
      ssr: { noExternal: true },
    }) as Rollup.RollupOutput | Rollup.RollupOutput[];
    const chunk = (Array.isArray(out) ? out[0]! : out).output.find((o): o is Rollup.OutputChunk => o.type === 'chunk' && o.isEntry)!;
    const dir = mkdtempSync(join(tmpdir(), 'dusklane-genbench-'));
    try {
      const gen = join(dir, 'gen.mjs'), runner = join(dir, 'run.mjs');
      writeFileSync(gen, chunk.code);
      writeFileSync(runner, RUNNER(pathToFileURL(gen).href));
      const r = spawnSync(process.execPath, [runner], { encoding: 'utf8', timeout: 240_000 });
      expect(r.status, r.stderr).toBe(0);
      const res = JSON.parse(r.stdout.trim().split('\n').pop()!) as { n: number; p50: number; p95: number; p99: number; max: number; passP95: number[] };
      process.stderr.write(`\n[bench] segment p50 ${res.p50.toFixed(3)} ms, p95 ${res.p95.toFixed(3)} ms, p99 ${res.p99.toFixed(2)} ms (n ${res.n}, max ${res.max.toFixed(2)} ms); pass p95 ${res.passP95.map((p) => p.toFixed(2)).join(' / ')}\n`);
      expect(res.n).toBeGreaterThan(700);
      expect(res.p95).toBeLessThanOrEqual(SEGMENT_P95_BUDGET_MS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});
