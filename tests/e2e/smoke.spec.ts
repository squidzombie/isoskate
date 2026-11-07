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
// `tapAfterMs` schedules a fresh touch that long after the crash from inside the same page task as the crashing step
// (the App stamps its crash time during that step), so neither the CDP round trip nor a slow rendered frame between
// two evaluate() calls can shift it: 0 is a touch in the same task as the crash (a panic tap during the tumble). G1:
// with the full world art a desktop frame can take 0.6 s+, and a "0 ms" tap sent by a second evaluate() reached the
// App after its 0.6 s retry threshold. Returns whether the crash overlay was on at the crash.
async function crashStraight(page: Page, seed: number, tapAfterMs: number | null = null): Promise<boolean> {
  const r = await page.evaluate(({ s, tap }) => {
    window.__skate!.start({ seed: s });
    window.__skate!.manual(true);
    let sn = window.__skate!.step(200);
    while (sn.alive && sn.tick < 400) sn = window.__skate!.step(1);
    const crashOn = /\bon\b/.test(document.querySelector('#screens [data-screen="crash"]')?.className ?? '');
    if (tap !== null && !sn.alive) {
      const el = document.getElementById('play')!;
      const fire = () => {
        const o = { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 195, clientY: 420, bubbles: true };
        el.dispatchEvent(new PointerEvent('pointerdown', o));
        el.dispatchEvent(new PointerEvent('pointerup', o));
      };
      if (tap <= 0) fire();
      else {
        const at = performance.now();
        const wait = () => { if (performance.now() - at >= tap) fire(); else setTimeout(wait, 5); };
        setTimeout(wait, tap);
      }
    }
    return { alive: sn.alive, cause: sn.crash?.cause ?? null, crashOn };
  }, { s: seed, tap: tapAfterMs });
  expect(r.alive).toBe(false);
  expect(r.cause).toBe('slam');
  return r.crashOn;
}

test('crash → overlay → fresh tap after 0.6 s → new run', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors, '&quality=low');
  expect(await crashStraight(page, 1, 650)).toBe(true);   // the overlay is up; the touch lands 650 ms later
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
  await crashStraight(page, 3, 0);                   // panic tap during the tumble
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

test.describe('landscape phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test('a run started in landscape pauses on the rotate card until the phone is portrait', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'one project is enough for the viewport override');
    const errors: string[] = [];
    await boot(page, errors, '&quality=low');
    await page.touchscreen.tap(422, 180);
    const pause = screenOn(page, 'pause');
    await expect(pause).toHaveClass(/\bon\b/);
    await expect(pause).toContainText('ROTATE TO PORTRAIT');
    const frozen = await page.evaluate(() => window.__skate!.snapshot().tick);
    await page.getByRole('button', { name: /resume/i }).click();      // still landscape: stays on the card
    await expect(pause).toHaveClass(/\bon\b/);
    await expect(pause).toContainText('ROTATE TO PORTRAIT');
    expect(await page.evaluate(() => window.__skate!.snapshot().tick)).toBe(frozen);
    await page.setViewportSize({ width: 390, height: 844 });           // rotate back: normal Pause, no auto-resume
    await expect(pause).toContainText('PAUSED');
    expect(await page.evaluate(() => window.__skate!.snapshot().tick)).toBe(frozen);
    await page.getByRole('button', { name: /resume/i }).click();
    await expect(pause).not.toHaveClass(/\bon\b/);
    await expect.poll(() => page.evaluate(() => window.__skate!.snapshot().tick)).toBeGreaterThan(frozen);
    expect((await page.evaluate(() => window.__skate!.camera())).yawDeg).toBe(0);
    expect(errors).toEqual([]);
  });
});

test('__skate.ui() goes through the app: Locker shows the turntable, Back returns to the Title diorama', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors, '&quality=low');
  await page.evaluate(() => window.__skate!.ui('locker', { preview: 'bd_plain_maple', yaw: 30 }));
  await expect(screenOn(page, 'locker')).toHaveClass(/\bon\b/);
  await page.getByRole('button', { name: /back/i }).click();
  await expect(screenOn(page, 'title')).toHaveClass(/\bon\b/);
  await page.evaluate(() => window.__skate!.ui('results'));
  await expect(screenOn(page, 'results')).toHaveClass(/\bon\b/);
  await page.getByRole('button', { name: /roll again/i }).click();
  await expect(screenOn(page, 'results')).not.toHaveClass(/\bon\b/);
  await expect.poll(() => page.evaluate(() => window.__skate!.snapshot().tick)).toBeGreaterThan(3);
  // AU ships renderOffline (G0): one second of Downtown, rendered offline (only the summary crosses the bridge).
  const r = await page.evaluate(async () => {
    const a = await window.__skate!.renderAudio!('downtown', 1);
    return a ? { sec: a.sec, peak: a.peak, rate: a.sampleRate, bytes: a.wavBase64.length } : null;
  });
  expect(r).not.toBeNull();
  expect(r!.sec).toBeCloseTo(1, 2);
  expect(r!.peak).toBeGreaterThan(0.01);
  expect(r!.peak).toBeLessThan(0.9);
  expect(r!.bytes).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test('Settings opens from Pause with the current values, and Back returns to the frozen run', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors, '&quality=low');
  await page.evaluate(() => {
    const s = window.__skate!;
    const save = s.save.get();
    save.settings.simpleTricks = true;
    s.save.set(save);
    s.start({ seed: 1 });
  });
  await expect.poll(() => page.evaluate(() => window.__skate!.snapshot().tick)).toBeGreaterThan(10);
  await page.keyboard.press('Escape');
  await expect(screenOn(page, 'pause')).toHaveClass(/\bon\b/);
  const frozen = await page.evaluate(() => window.__skate!.snapshot().tick);
  await screenOn(page, 'pause').getByRole('button', { name: /settings/i }).click();
  const settings = screenOn(page, 'settings');
  await expect(settings).toHaveClass(/\bon\b/);
  // The app passed save.settings: Simple tricks shows On.
  const simple = settings.locator('.setting', { hasText: 'Simple tricks' });
  await expect(simple.getByRole('button', { name: 'On' })).toHaveClass(/\bon\b/);
  await settings.getByRole('button', { name: /back/i }).click();
  await expect(screenOn(page, 'pause')).toHaveClass(/\bon\b/);
  expect(await page.evaluate(() => window.__skate!.snapshot().tick)).toBe(frozen);
  // The back gesture (Android back / iOS edge swipe) on Settings over Pause also returns to Pause.
  await screenOn(page, 'pause').getByRole('button', { name: /settings/i }).click();
  await expect(settings).toHaveClass(/\bon\b/);
  await page.evaluate(() => history.back());
  await expect(screenOn(page, 'pause')).toHaveClass(/\bon\b/);
  await expect(settings).not.toHaveClass(/\bon\b/);
  expect(await page.evaluate(() => window.__skate!.snapshot().tick)).toBe(frozen);
  await screenOn(page, 'pause').getByRole('button', { name: /resume/i }).click();
  await expect.poll(() => page.evaluate(() => window.__skate!.snapshot().tick)).toBeGreaterThan(frozen);
  expect(errors).toEqual([]);
});

// ── M0-io additions: debug tooling, the contrast gate, live pointer traces and the HUD band ───────────────────────
type Ext = { overlay(on?: boolean): boolean; perfHud(on?: boolean): boolean; tuning(on?: boolean): boolean };

test('debug tooling: overlays, perf HUD, tuning panel and the contrast gate on a live frame', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors, '&quality=low');
  const r = await page.evaluate(() => {
    const x = (window.__skate as unknown as { ext: Ext }).ext;
    window.__skate!.start({ seed: 1, god: true }); window.__skate!.manual(true); window.__skate!.step(150);
    const on = [x.overlay(true), x.perfHud(true), x.tuning(true)];
    window.__skate!.renderNow();
    const c = window.__skate!.contrast();
    const perf = window.__skate!.perf();
    const off = [x.overlay(false), x.perfHud(false), x.tuning(false)];
    return { on, off, c, perf, panel: !!document.getElementById('tuning-panel'), hud: !!document.getElementById('perf-hud') };
  });
  expect(r.on).toEqual([true, true, true]);
  expect(r.off).toEqual([false, false, false]);
  expect(r.panel && r.hud).toBe(true);
  expect(r.perf.calls).toBeGreaterThan(0);
  expect(r.perf.calls).toBeLessThanOrEqual(120);
  expect(r.perf.tris).toBeLessThanOrEqual(120_000);
  // The Roll-out's 3.5 s barrier is in view at t = 2.5 s: hazards ≥ 2.5:1, grind edges ≥ 1.8:1 (DESIGN §18.4).
  expect(r.c.hazard).toBeGreaterThanOrEqual(2.5);
  if (!Number.isNaN(r.c.edge)) expect(r.c.edge).toBeGreaterThanOrEqual(1.8);
  expect(errors).toEqual([]);
});

test('__skate.pointer() in real time goes through the live recognizer: a synthetic tap ollies', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors, '&quality=low');
  await page.evaluate(() => { window.__skate!.manual(false); window.__skate!.start({ seed: 4, god: true }); });
  await expect.poll(() => page.evaluate(() => window.__skate!.snapshot().tick)).toBeGreaterThan(10);
  const t0 = await page.evaluate(() => window.__skate!.snapshot().tick);
  // On the right half: with two thumbs (the default) a tap on the left (steering) half is only steering.
  await page.evaluate(() => { const x = window.innerWidth * 0.75; window.__skate!.pointer([{ id: 5, tMs: 0, x, y: 500, phase: 'down' }, { id: 5, tMs: 90, x, y: 500, phase: 'up' }]); });
  await expect.poll(() => page.evaluate((s) => window.__skate!.events(s).map((e) => e.t), t0), { timeout: 3000 }).toContain('ollie');
  expect(errors).toEqual([]);
});

test('the HUD sits inside its 56 px band (+ safe area) and only the pause button takes touches', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors, '&quality=low');
  await page.evaluate(() => { window.__skate!.start({ seed: 1, god: true }); window.__skate!.manual(true); window.__skate!.step(60); });
  await page.waitForTimeout(150);
  const m = await page.evaluate(() => {
    const probe = document.getElementById('safe-probe');
    const safeTop = probe ? parseFloat(getComputedStyle(probe).paddingTop) || 0 : 0;
    const rects = [...document.querySelectorAll<HTMLElement>('#hud [data-hud]')].map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.dataset.hud!, top: r.top, bottom: r.bottom, w: r.width, h: r.height, pe: getComputedStyle(e).pointerEvents };
    });
    return { safeTop, rects, hudPe: getComputedStyle(document.getElementById('hud')!).pointerEvents };
  });
  expect(m.hudPe).toBe('none');
  expect(m.rects.map((r) => r.id)).toEqual(expect.arrayContaining(['score', 'dist', 'combo', 'trick', 'coins', 'pause']));
  for (const r of m.rects) expect(r.bottom, r.id).toBeLessThanOrEqual(m.safeTop + 56 + 0.5);
  const pause = m.rects.find((r) => r.id === 'pause')!;
  expect(pause.w).toBeGreaterThanOrEqual(56);
  expect(pause.h).toBeGreaterThanOrEqual(56);
  expect(pause.pe).toBe('auto');
  expect(errors).toEqual([]);
});
