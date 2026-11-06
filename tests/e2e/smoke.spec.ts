// Smoke test (TECH §11.3): boots without console errors, the canvas renders, Title → tap → run, the debug API
// drives the sim, a tap produces an ollie, and the crash flow (instant retry and Results → ROLL AGAIN) works.
import { expect, test, type Page } from '@playwright/test';

declare global { interface Window { __skate?: import('../../src/core/debug').DebugAPI } }

async function boot(page: Page, errors: string[], query = ''): Promise<void> {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?debug=1${query}`);
  await page.waitForFunction(() => !!window.__skate);
}

async function tapScreen(page: Page, hasTouch: boolean, x: number, y: number): Promise<void> {
  if (hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

const screenOn = (page: Page, id: string) => page.locator(`#screens [data-screen="${id}"]`);

test('boots, renders and starts a run from the Title', async ({ page }, info) => {
  const errors: string[] = [];
  await boot(page, errors);
  await expect(screenOn(page, 'title')).toHaveClass(/\bon\b/);

  // The canvas is not blank: luminance variance of a downsampled copy, read in the same task as the render.
  const variance = await page.evaluate(() => {
    window.__skate!.renderNow();
    const gl = document.querySelector<HTMLCanvasElement>('#gl')!;
    const c = document.createElement('canvas');
    c.width = 48; c.height = 96;
    const x = c.getContext('2d')!;
    x.drawImage(gl, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, sum2 = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!; sum += l; sum2 += l * l; }
    return sum2 / n - (sum / n) ** 2;
  });
  expect(variance).toBeGreaterThan(50);

  const vp = page.viewportSize()!;
  await tapScreen(page, !!info.project.use.hasTouch, vp.width / 2, vp.height * 0.45);
  await expect(screenOn(page, 'title')).not.toHaveClass(/\bon\b/);
  await expect.poll(() => page.evaluate(() => window.__skate!.snapshot().tick), { timeout: 5000 }).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test('debug API: start, manual stepping, tap → ollie', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  const snap = await page.evaluate(() => {
    window.__skate!.start({ seed: 1, god: true });
    window.__skate!.manual(true);
    return window.__skate!.step(600);
  });
  expect(snap.tick).toBe(600);
  expect(snap.t).toBeCloseTo(10, 6);
  expect(snap.p.s).toBeCloseTo(70, 6);
  expect(snap.speed).toBe(7);
  expect(snap.alive).toBe(true);
  expect(snap.nextObstacles.length).toBeGreaterThan(0);

  const kinds = await page.evaluate(() => {
    window.__skate!.start({ seed: 1 });
    window.__skate!.manual(true);
    window.__skate!.step(30);
    window.__skate!.gesture('tap');
    window.__skate!.step(5);
    return window.__skate!.events().map((e) => e.t);
  });
  expect(kinds).toContain('runStart');
  expect(kinds).toContain('ollie');
  const cam = await page.evaluate(() => window.__skate!.camera());
  expect(cam.lookAheadSec).toBeGreaterThanOrEqual(2.5);
  expect(errors).toEqual([]);
});

// Timing-sensitive flows run at the low tier: SwiftShader frames at the high tier are slow enough to starve timers.
// The Roll-out is the same for every seed: going straight slams into the 3.5 s chain at tick ~208.
async function crashStraight(page: Page, seed: number): Promise<void> {
  const snap = await page.evaluate((s) => {
    window.__skate!.start({ seed: s });
    window.__skate!.manual(true);
    let sn = window.__skate!.step(200);
    while (sn.alive && sn.tick < 400) sn = window.__skate!.step(1);
    return sn;
  }, seed);
  expect(snap.alive).toBe(false);
  expect(snap.crash?.cause).toBe('slam');
}

/** A fresh tap `afterMs` after the crash, dispatched in-page so CPU load can't push it past the 1.2 s window. */
async function tapAfterCrash(page: Page, afterMs: number): Promise<void> {
  await page.evaluate(async (ms) => {
    const crashAt = performance.now();               // ≥ the app's crash time (it was set during the last step)
    await new Promise((r) => setTimeout(r, ms));
    while (performance.now() - crashAt < ms) await new Promise((r) => setTimeout(r, 5));
    const el = document.getElementById('play')!;
    const o = { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 195, clientY: 420, bubbles: true };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
  }, afterMs);
}

test('crash → overlay → fresh tap after 0.6 s → new run', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors, '&quality=low');
  await crashStraight(page, 1);
  await expect(screenOn(page, 'crash')).toHaveClass(/\bon\b/);
  await tapAfterCrash(page, 650);
  await expect(screenOn(page, 'crash')).not.toHaveClass(/\bon\b/);
  await expect(screenOn(page, 'results')).not.toHaveClass(/\bon\b/);
  const fresh = await page.evaluate(() => window.__skate!.snapshot());
  expect(fresh.alive).toBe(true);
  expect(fresh.tick).toBeLessThan(10);
  expect(errors).toEqual([]);
});

test('a touch that went down before 0.6 s does not retry', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors, '&quality=low');
  await crashStraight(page, 3);
  await tapAfterCrash(page, 0);                      // panic tap during the tumble
  await expect(screenOn(page, 'results')).toHaveClass(/\bon\b/, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('crash → Results after 1.2 s → ROLL AGAIN', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors, '&quality=low');
  await crashStraight(page, 2);
  await expect(screenOn(page, 'results')).toHaveClass(/\bon\b/, { timeout: 10_000 });
  await page.getByRole('button', { name: /roll again/i }).click();
  await expect(screenOn(page, 'results')).not.toHaveClass(/\bon\b/);
  expect((await page.evaluate(() => window.__skate!.snapshot())).alive).toBe(true);
  expect(errors).toEqual([]);
});

test('pause: button, Esc and visibility; resume continues the run', async ({ page }, info) => {
  const errors: string[] = [];
  await boot(page, errors, '&quality=low');
  await page.evaluate(() => window.__skate!.start({ seed: 5, god: true }));
  await expect.poll(() => page.evaluate(() => window.__skate!.snapshot().tick)).toBeGreaterThan(5);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(screenOn(page, 'pause')).toHaveClass(/\bon\b/);
  const frozen = await page.evaluate(() => window.__skate!.snapshot().tick);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__skate!.snapshot().tick)).toBe(frozen);
  await page.getByRole('button', { name: /resume/i }).click();
  await expect(screenOn(page, 'pause')).not.toHaveClass(/\bon\b/);
  await expect.poll(() => page.evaluate(() => window.__skate!.snapshot().tick)).toBeGreaterThan(frozen);
  if (!info.project.use.hasTouch) {
    await page.keyboard.press('Escape');
    await expect(screenOn(page, 'pause')).toHaveClass(/\bon\b/);
    await page.keyboard.press('Escape');
    await expect(screenOn(page, 'pause')).not.toHaveClass(/\bon\b/);
  }
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // still visible: no pause
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(screenOn(page, 'pause')).toHaveClass(/\bon\b/);
  expect(errors).toEqual([]);
});
