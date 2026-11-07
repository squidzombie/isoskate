// title.spec (owner request: the Title in space and the dive): the Title draws the Earth scene with the equipped
// board clear of the UI and no console errors; TAP TO ROLL dives into a live run within 2.5 s; a tap during the dive
// skips it; Results › ROLL AGAIN starts with no dive.
import { expect, test, type Page } from '@playwright/test';

declare global { interface Window { __skate?: import('../../src/core/debug').DebugAPI } }
interface TitleTools {
  stats(): { drawCalls: number; tris: number; backdrop: string; diving: boolean; worldWarm: number;
    bake: { previewMs: number; slices: number; maxSliceMs: number; totalMs: number; done: boolean } };
  dive(): { frames: number; maxWorkMs: number; startedAt: number; liveAt: number; skipped: boolean | null };
  hold(t: number | null): void;
  bakeDone(): boolean;
  scene: { camera: import('three').PerspectiveCamera; boardSlot: import('three').Object3D; time: number; spinTime: number };
}

async function boot(page: Page, errors: string[]): Promise<void> {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug=1');
  await page.waitForFunction(() => !!window.__skate && !!(window as unknown as { __skateTitle?: unknown }).__skateTitle);
}
const screenOn = (page: Page, id: string) => page.locator(`#screens [data-screen="${id}"]`);
async function tap(page: Page, touch: boolean, x: number, y: number): Promise<void> {
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}
const state = (page: Page) => page.evaluate(() => ({ tick: window.__skate!.snapshot().tick, diving: (window as unknown as { __skateTitle: TitleTools }).__skateTitle.stats().diving, dive: (window as unknown as { __skateTitle: TitleTools }).__skateTitle.dive() }));

test('the Title draws the Earth in space with the equipped board clear of the UI, and no console errors', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  await boot(page, errors);
  await expect(screenOn(page, 'title')).toHaveClass(/\bon\b/);
  await page.waitForFunction(() => (window as unknown as { __skateTitle: TitleTools }).__skateTitle.bakeDone(), null, { timeout: 60_000, polling: 250 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);                                             // the band is re-measured twice a second
  const r = await page.evaluate(() => {
    window.__skate!.renderNow();
    const st = (window as unknown as { __skateTitle: TitleTools }).__skateTitle.stats();
    // The canvas: deep space at the corners, a lit, coloured planet in the logo block.
    const gl = document.querySelector<HTMLCanvasElement>('#gl')!;
    const c = document.createElement('canvas'); c.width = 60; c.height = 100;
    const x = c.getContext('2d')!; x.drawImage(gl, 0, 0, c.width, c.height);
    const px = (u: number, v: number) => Array.from(x.getImageData(Math.floor(u * 59), Math.floor(v * 99), 1, 1).data.slice(0, 3));
    const lum = (p: number[]) => 0.2126 * p[0]! + 0.7152 * p[1]! + 0.0722 * p[2]!;
    let sum = 0, sum2 = 0;
    const d = x.getImageData(0, 0, 60, 100).data;
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!; sum += l; sum2 += l * l; }
    // The board's projected box against the Title UI.
    const S = (window as unknown as { __skateTitle: TitleTools }).__skateTitle.scene, cam = S.camera, V = cam.position.constructor as unknown as new (a: number, b: number, c: number) => import('three').Vector3;
    S.boardSlot.updateMatrixWorld(true);
    const box = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    S.boardSlot.traverse((o) => {
      const m = o as import('three').Mesh;
      if (!m.isMesh) return;
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i += 5) {
        const q = new V(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m.matrixWorld).project(cam);
        const sx = ((q.x + 1) / 2) * innerWidth, sy = ((1 - q.y) / 2) * innerHeight;
        box.x0 = Math.min(box.x0, sx); box.x1 = Math.max(box.x1, sx); box.y0 = Math.min(box.y0, sy); box.y1 = Math.max(box.y1, sy);
      }
    });
    const rect = (s: string) => document.querySelector(`#screens [data-screen="title"] ${s}`)!.getBoundingClientRect();
    const ui = ['.logo', '.tagline', '.tap', '.tabs', '.title-top'].map((s) => { const b = rect(s); return { s, x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; });
    const overlaps = ui.filter((u) => u.x0 < box.x1 && box.x0 < u.x1 && u.y0 < box.y1 && box.y0 < u.y1).map((u) => u.s);
    return { st, corner: lum(px(0.02, 0.6)), variance: sum2 / (d.length / 4) - (sum / (d.length / 4)) ** 2, box, overlaps, w: innerWidth, h: innerHeight };
  });
  expect(r.st.backdrop).toBe('space');
  expect(r.st.drawCalls).toBeGreaterThanOrEqual(6);
  expect(r.st.drawCalls).toBeLessThanOrEqual(10);                            // Earth, clouds, atmosphere, sky, stars, board ×2
  expect(r.st.tris).toBeLessThan(40_000);
  expect(r.st.bake.done).toBe(true);
  expect(r.corner).toBeLessThan(70);                                          // space is dark
  expect(r.variance).toBeGreaterThan(80);                                     // and something bright and coloured is in it
  // The board is on screen, readable (≥ 18% of the short side long), and under none of the Title UI.
  expect(r.box.x0).toBeGreaterThan(0); expect(r.box.x1).toBeLessThan(r.w);
  expect(r.box.y0).toBeGreaterThan(0); expect(r.box.y1).toBeLessThan(r.h);
  expect(Math.max(r.box.x1 - r.box.x0, r.box.y1 - r.box.y0)).toBeGreaterThan(0.18 * Math.min(r.w, r.h));
  expect(r.overlaps).toEqual([]);
  // The board spins at one constant rate (owner direction): the same angular speed over every interval of its clock,
  // and that clock keeps pace with the wall clock (frames slower than the sim's 0.1 s cap do not slow it).
  const { rates, wallRatio } = await page.evaluate(async () => {
    const S = (window as unknown as { __skateTitle: TitleTools }).__skateTitle.scene, out: number[] = [];
    let a = S.boardSlot.parent!.rotation.y, t = S.spinTime;
    const t0 = S.spinTime, w0 = performance.now();
    for (let i = 0; i < 8; i++) {
      await new Promise((res) => setTimeout(res, 250));
      const b = S.boardSlot.parent!.rotation.y, u = S.spinTime;
      if (u > t) out.push((((b - a) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (u - t));
      a = b; t = u;
    }
    return { rates: out, wallRatio: (S.spinTime - t0) / ((performance.now() - w0) / 1000) };
  });
  expect(rates.length).toBeGreaterThan(4);
  for (const w of rates) expect(w).toBeCloseTo((2 * Math.PI) / 11, 3);
  expect(wallRatio).toBeGreaterThan(0.85); expect(wallRatio).toBeLessThan(1.1);   // frame quantisation at the ends
  expect(errors).toEqual([]);
});

test('a phone on its side (844×390) keeps the whole tab bar under the hero, with no sideways scroll', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 844, height: 390 });
  await boot(page, errors);
  await expect(screenOn(page, 'title')).toHaveClass(/\bon\b/);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const rect = (s: string) => { const b = document.querySelector(`#screens [data-screen="title"] ${s}`)!.getBoundingClientRect(); return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; };
    return { tabs: rect('.tabs'), tap: rect('.tap'), tagline: rect('.tagline'), top: rect('.title-top'), sw: document.documentElement.scrollWidth };
  });
  expect(r.tabs.y1 - r.tabs.y0).toBeGreaterThanOrEqual(60);                  // labels and icons whole (a squeezed bar was 35 px)
  expect(r.tabs.y1).toBeLessThanOrEqual(390);
  expect(r.tap.y1).toBeLessThan(r.tabs.y0);
  expect(r.tagline.y0).toBeGreaterThan(r.top.y1);
  expect(r.sw).toBeLessThanOrEqual(844);
  expect(errors).toEqual([]);
});

test('TAP TO ROLL dives into a live run within 2.5 s', async ({ page }, info) => {
  const errors: string[] = [];
  await boot(page, errors);
  await expect(screenOn(page, 'title')).toHaveClass(/\bon\b/);
  const vp = page.viewportSize()!;
  // Measured in the page: from the tap's pointerdown to the first frame of the live run.
  await page.evaluate(() => window.addEventListener('pointerdown', () => { (window as unknown as { tapAt: number }).tapAt = performance.now(); }, { capture: true, once: true }));
  await tap(page, !!info.project.use.hasTouch, vp.width / 2, vp.height * 0.45);
  expect((await state(page)).diving).toBe(true);
  await expect(screenOn(page, 'title')).not.toHaveClass(/\bon\b/);
  await expect.poll(async () => { const s = await state(page); return !s.diving && s.tick > 0; }, { timeout: 4000, intervals: [50] }).toBe(true);
  const d = (await state(page)).dive;
  const tapAt = await page.evaluate(() => (window as unknown as { tapAt: number }).tapAt);
  expect(d.liveAt - tapAt).toBeLessThan(2500);
  expect(d.frames).toBeGreaterThanOrEqual(3);
  expect(d.skipped).toBe(false);
  expect(d.liveAt - d.startedAt).toBeGreaterThan(1000);                        // it played (DIVE.sec 1.45 s)
  expect(errors).toEqual([]);
});

test('a tap during the dive skips it', async ({ page }, info) => {
  const errors: string[] = [];
  await boot(page, errors);
  await expect(screenOn(page, 'title')).toHaveClass(/\bon\b/);
  const vp = page.viewportSize()!, touch = !!info.project.use.hasTouch;
  await tap(page, touch, vp.width / 2, vp.height * 0.45);
  expect((await state(page)).diving).toBe(true);
  // Hold the dive mid-flight (so the harness's own latency under load cannot let it end by itself), and stamp the
  // skipping tap's pointerdown in the page.
  await page.evaluate(() => {
    (window as unknown as { __skateTitle: TitleTools }).__skateTitle.hold(0.4);
    window.addEventListener('pointerdown', () => { (window as unknown as { skipAt: number }).skipAt = performance.now(); }, { capture: true, once: true });
  });
  await tap(page, touch, vp.width / 2, vp.height * 0.5);
  await expect.poll(async () => (await state(page)).diving, { timeout: 2000, intervals: [20] }).toBe(false);
  await expect.poll(async () => (await state(page)).tick, { timeout: 3000 }).toBeGreaterThan(5);
  const d = (await state(page)).dive;
  const skipAt = await page.evaluate(() => (window as unknown as { skipAt: number }).skipAt);
  expect(d.skipped).toBe(true);
  expect(d.liveAt - skipAt).toBeLessThan(700);                                 // the next frame or two is the run
  // The skipping tap did not reach the run's input: no ollie at the start.
  const ev = await page.evaluate(() => window.__skate!.events(0).filter((e) => e.t === 'ollie').length);
  expect(ev).toBe(0);
  expect(errors).toEqual([]);
});

test('Results › ROLL AGAIN starts the run with no dive', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await page.evaluate(() => window.__skate!.ui('results'));
  await expect(screenOn(page, 'results')).toHaveClass(/\bon\b/);
  const before = (await state(page)).dive.startedAt;
  await page.getByRole('button', { name: /roll again/i }).click();
  const s = await state(page);
  expect(s.diving).toBe(false);
  expect(s.dive.startedAt).toBe(before);
  await expect.poll(async () => (await state(page)).tick, { timeout: 3000 }).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});
