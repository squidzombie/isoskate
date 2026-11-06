// bot-survival.spec (TECH §11.3, ROADMAP "Rules: Performance"): the SafeKey bot rides 3 minutes from the plateau
// (startT 160) on 5 seeds through the real app, renderer and world view, and stays alive; every rendered frame keeps
// the TECH §8.4 budget (draw calls ≤ 120, triangles ≤ 120k), and GPU geometries and textures stay bounded (no
// per-chunk leak). WA tightens this at G2 (main calls ≤ 70, per area). FPS under SwiftShader is not a metric.
import { expect, test } from '@playwright/test';

declare global { interface Window { __skate?: import('../../src/core/debug').DebugAPI } }

export const BUDGET = { calls: 120, tris: 120_000 } as const;
const SEEDS = [1, 2, 3, 4, 5];

test('safe bot from the plateau: alive after 3 × 3600 ticks on 5 seeds, within the draw-call and triangle budget', async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, 'runs once, on the mobile project (the portrait framing sees the most street)');
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug=1&quality=med');
  await page.waitForFunction(() => !!window.__skate);
  for (const seed of SEEDS) {
    const r = await page.evaluate((seed) => {
      const s = window.__skate!;
      s.start({ seed, startT: 160 });
      s.manual(true);
      s.bot('safe');
      const perfs: ReturnType<typeof s.perf>[] = [];
      let snap = s.snapshot();
      for (let k = 0; k < 3; k++) { snap = s.step(3600); perfs.push(s.perf()); }   // step() renders the last tick
      const crashes = s.events().filter((e) => e.t === 'crash').length;
      s.bot('off');
      return { alive: snap.alive, t: snap.t, crashes, perfs };
    }, seed);
    const line = r.perfs.map((p) => `${p.calls} calls / ${p.tris} tris / ${p.geoms} geoms / ${p.textures} tex`).join(' | ');
    console.log(`bot-survival seed ${seed}: t ${r.t.toFixed(1)} s, crashes ${r.crashes} | ${line} | build p95 ${r.perfs[2]!.buildMs.toFixed(2)} ms`);
    expect(r.alive, `seed ${seed} survives`).toBe(true);
    expect(r.crashes).toBe(0);
    for (const p of r.perfs) {
      expect(p.calls).toBeLessThanOrEqual(BUDGET.calls);
      expect(p.tris).toBeLessThanOrEqual(BUDGET.tris);
    }
    // Bounded GPU memory: chunks are pooled and released behind the player, so 3 minutes later the counts have not grown.
    expect(r.perfs[2]!.geoms).toBeLessThanOrEqual(r.perfs[0]!.geoms + 4);
    expect(r.perfs[2]!.textures).toBeLessThanOrEqual(r.perfs[0]!.textures + 2);
  }
  expect(errors).toEqual([]);
});
