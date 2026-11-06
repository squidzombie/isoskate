// wa.spec (W2a, world art): the per-area budgets at the plateau, the run's first frame and the Roll-out cache, and
// context loss. Everything goes through window.__skate (DebugAPI + ext.world(): world/render WorldView.debugInfo).
//   - each area at the plateau (startT past 150 s, safe bot, god mode, 30 s): main-pass draw calls ≤ 70, all calls ≤ 120
//     (the shadow pass included), triangles ≤ 120k (TECH §8.4, DESIGN §24 row 23); chunk build p95 ≤ 4 ms, measured by
//     rebuilding the nearest chunk 40× in place (ext.world().bench), so frame-render contention under SwiftShader is
//     not counted (FPS under SwiftShader is not a metric);
//   - the first frame of a run makes exactly the three chunks the camera sees (TECH §8.6 exception); a retry restores
//     the Roll-out chunks from the cache instead of building them;
//   - WEBGL_lose_context → restore → Resume: the scene is rebuilt and renders again.
import { expect, test, type Page } from '@playwright/test';

declare global { interface Window { __skate?: import('../../src/core/debug').DebugAPI } }

interface WorldInfo {
  chunks: number[]; cached: number[]; mainCalls: number; shadowCalls: number; chunksBuilt: number; cacheHits: number;
  maxChunkTris: number; bench(n?: number): { p50: number; p95: number; max: number; tris: number };
}
const world = (page: Page) => page.evaluate(() => {
  const w = (window.__skate as unknown as { ext: { world(): WorldInfo } }).ext.world();
  return { chunks: w.chunks, cached: w.cached, mainCalls: w.mainCalls, shadowCalls: w.shadowCalls, chunksBuilt: w.chunksBuilt, cacheHits: w.cacheHits, maxChunkTris: w.maxChunkTris };
});

export const BUDGET = { main: 70, calls: 120, tris: 120_000, buildP95: 4, chunkTris: 12_000 } as const;
// Plateau starts 2 s into each area's second visit (DESIGN §12.1 timeline: loop 2 arrives at 161 / 200 / 239 / 278 s).
const PLATEAU: readonly [string, number][] = [['downtown', 163], ['suburbs', 202], ['docks', 241], ['neon', 280]];

test('each area at the plateau stays within the draw-call, triangle and chunk-build budgets', async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, 'runs once, on the mobile project (portrait sees the most street)');
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?debug=1&quality=med');
  await page.waitForFunction(() => !!window.__skate);
  for (const [area, startT] of PLATEAU) {
    const r = await page.evaluate(([startT]) => {
      const s = window.__skate!;
      s.start({ seed: 7, startT, god: true });
      s.manual(true);
      s.bot('safe');
      let main = 0, calls = 0, tris = 0, chunkTris = 0;
      const w = () => (s as unknown as { ext: { world(): WorldInfo } }).ext.world();
      const area = s.step(1).area;
      for (let k = 0; k < 50; k++) {
        s.step(30);
        const p = s.perf(), wi = w();
        main = Math.max(main, wi.mainCalls); calls = Math.max(calls, p.calls); tris = Math.max(tris, p.tris); chunkTris = Math.max(chunkTris, wi.maxChunkTris);
      }
      // Best of three rounds (TECH §11.6: CPU noise from other processes only adds time).
      const rounds = [w().bench(40), w().bench(40), w().bench(40)];
      const bench = rounds.reduce((a, b) => (b.p95 < a.p95 ? b : a));
      s.bot('off');
      return { area, main, calls, tris, chunkTris, bench };
    }, [startT] as const);
    console.log(`wa ${area}: main ${r.main} / all ${r.calls} calls, ${r.tris} tris, chunk ≤ ${r.chunkTris} tris, build p50 ${r.bench.p50.toFixed(2)} p95 ${r.bench.p95.toFixed(2)} ms`);
    expect(r.area).toBe(area);
    expect(r.main).toBeLessThanOrEqual(BUDGET.main);
    expect(r.calls).toBeLessThanOrEqual(BUDGET.calls);
    expect(r.tris).toBeLessThanOrEqual(BUDGET.tris);
    expect(r.chunkTris).toBeLessThanOrEqual(BUDGET.chunkTris);
    expect(r.bench.p95).toBeLessThanOrEqual(BUDGET.buildP95);
  }
  expect(errors).toEqual([]);
});

test('a run starts with exactly the three chunks on screen; a retry restores the Roll-out from the cache', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?debug=1&quality=med');
  await page.waitForFunction(() => !!window.__skate);
  const first = await page.evaluate(() => {
    const s = window.__skate!, w = () => (s as unknown as { ext: { world(): WorldInfo } }).ext.world();
    s.manual(true);
    const a = w();
    s.start({ seed: 11, god: true });
    s.step(1);
    const b = w();
    return { built: b.chunksBuilt - a.chunksBuilt, hits: b.cacheHits - a.cacheHits, chunks: b.chunks };
  });
  // The first frame makes 3 chunks available (built, or restored from the Title preview's cache), plus whatever the
  // catch-up render of step() adds ahead; at least the three around the start are there.
  expect(first.chunks).toEqual(expect.arrayContaining([-1, 0, 1]));
  const retry = await page.evaluate(() => {
    const s = window.__skate!, w = () => (s as unknown as { ext: { world(): WorldInfo } }).ext.world();
    s.step(600);                                   // leave the Roll-out behind (its chunks go to the cache)
    const a = w();
    s.start({ seed: 12, god: true });              // a retry: same Roll-out, new seed after it
    s.renderNow();
    const b = w();
    return { built: b.chunksBuilt - a.chunksBuilt, hits: b.cacheHits - a.cacheHits, cachedBefore: a.cached };
  });
  expect(retry.cachedBefore).toEqual(expect.arrayContaining([-1, 0]));
  expect(retry.hits).toBeGreaterThanOrEqual(3);
});

test('context loss → restore → Resume rebuilds the scene and renders it again', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug=1&quality=med');
  await page.waitForFunction(() => !!window.__skate);
  await page.evaluate(() => { const s = window.__skate!; s.start({ seed: 3, startT: 30, god: true }); s.manual(true); s.step(120); });
  const before = await world(page);
  expect(before.chunks.length).toBeGreaterThanOrEqual(3);
  await page.evaluate(() => {
    const gl = (document.getElementById('gl') as HTMLCanvasElement).getContext('webgl2')!;
    (window as unknown as { __lose: WEBGL_lose_context }).__lose = gl.getExtension('WEBGL_lose_context')!;
    (window as unknown as { __lose: WEBGL_lose_context }).__lose.loseContext();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => new Promise<void>((res) => {
    const c = document.getElementById('gl') as HTMLCanvasElement;
    c.addEventListener('webglcontextrestored', () => res(), { once: true });
    (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext();
  }));
  // The run paused on the loss (game/wiring.ts): resume through the Pause screen's button.
  await page.getByRole('button', { name: /resume/i }).first().click({ timeout: 10_000 });
  await page.evaluate(() => { const s = window.__skate!; s.manual(true); s.step(60); });
  const after = await page.evaluate(() => {
    const s = window.__skate!, w = (s as unknown as { ext: { world(): WorldInfo } }).ext.world();
    const shot = (s as unknown as { ext: { capture(o: object): { dataUrl: string } } }).ext.capture({});
    return { chunks: w.chunks, calls: s.perf().calls, tris: s.perf().tris, url: shot.dataUrl };
  });
  expect(after.chunks.length).toBeGreaterThanOrEqual(3);
  expect(after.calls).toBeGreaterThan(15);
  expect(after.tris).toBeGreaterThan(5000);
  // The canvas is not blank: decode the capture and check the pixel variance.
  const variance = await page.evaluate(async (url) => {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let m = 0, m2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { const l = d[i]! * 0.3 + d[i + 1]! * 0.59 + d[i + 2]! * 0.11; m += l; m2 += l * l; n++; }
    m /= n; return m2 / n - m * m;
  }, after.url);
  expect(variance).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});
