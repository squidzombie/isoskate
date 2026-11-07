// Touch e2e (TECH §11.3, ROADMAP M0 acceptance): real touches (page.touchscreen and CDP Input.dispatchTouchEvent) go
// through #play → pointer events → the recognizer → frame binning → the sim. Both projects: the desktop project has
// no touchscreen API, so CDP touch is used there (Chromium turns it into pointerType 'touch' events), plus mouse
// drag (which must behave exactly like touch) and keyboard preset A (which must play the same as touch).
// Synthetic traces through __skate.pointer() in manual mode cover the timing-exact cases deterministically.
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import type { GameEvent } from '../../src/core/events';

declare global { interface Window { __skate?: import('../../src/core/debug').DebugAPI } }

async function boot(page: Page, errors: string[]): Promise<void> {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug=1&quality=low');
  await page.waitForFunction(() => !!window.__skate);
}

/** Raw touch through CDP (works with and without hasTouch). */
class Touch {
  private constructor(private readonly cdp: CDPSession) {}
  static async of(page: Page): Promise<Touch> { return new Touch(await page.context().newCDPSession(page)); }
  start(x: number, y: number, id = 1) { return this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] }); }
  move(x: number, y: number, id = 1) { return this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id }] }); }
  end() { return this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  /** Down and up queued back to back (like flick). Awaiting each ack stretched a CDP tap to 23–1,098 ms on a quiet
   *  machine at G1 (a round trip waits for a rendered SwiftShader frame of the full world art), so it was often a
   *  HOLD past the 600 ms long tap, not a tap; queued, the pair arrives as one still touch. */
  async tap(x: number, y: number) { await Promise.all([this.start(x, y), this.end()]); }
  /** A fast flick: down, `steps` moves of (dx, dy) and up queued back to back without waiting for each ack (under
   *  SwiftShader one round trip can take a whole slow frame, which would turn the flick into a slow, old stroke).
   *  Chromium delivers the moves as one pointermove with coalesced events, as for a real fast thumb. */
  async flick(x: number, y: number, dx: number, dy: number, steps = 4) {
    const all: Promise<unknown>[] = [this.start(x, y)];
    for (let i = 1; i <= steps; i++) all.push(this.move(x + (dx * i) / steps, y + (dy * i) / steps));
    all.push(this.end());
    await Promise.all(all);
  }
}

const events = (page: Page, since = 0) => page.evaluate((s) => window.__skate!.events(s), since);
const kinds = (ev: GameEvent[]) => ev.map((e) => e.t);
const snap = (page: Page) => page.evaluate(() => window.__skate!.snapshot());
const screenOn = (page: Page, id: string) => page.locator(`#screens [data-screen="${id}"]`);
/** Waits for the `ollie` event after `since`, then until the sim is `ticks` ticks past it (sim time, not wall time:
 *  SwiftShader frames can run the loop slower than real time, and the 70 ms pop bleed is counted in ticks). */
async function airborneFor(page: Page, since: number, ticks: number): Promise<void> {
  await expect.poll(async () => (await events(page, since)).some((e) => e.t === 'ollie'), { timeout: 3000 }).toBe(true);
  const at = (await events(page, since)).find((e) => e.t === 'ollie')!.tick;
  await expect.poll(async () => (await snap(page)).tick, { timeout: 3000, intervals: [5] }).toBeGreaterThanOrEqual(at + ticks);
}

/** A real-time god-mode run (crashes logged, not applied), rolled for a few ticks. With `prime`, one still touch
 *  (held 700 ms, past the 600 ms long tap: no tap, no drag, and a resting thumb starts nothing) primes Chromium's touch pipeline first: under
 *  SwiftShader the first touchmove of a page's life can be held back by seconds while the first frames compile. */
async function liveRun(page: Page, seed = 1, prime: Touch | null = null): Promise<void> {
  await page.evaluate((s) => { window.__skate!.manual(false); window.__skate!.start({ seed: s, god: true }); }, seed);
  await expect.poll(async () => (await snap(page)).tick, { timeout: 5000 }).toBeGreaterThan(20);
  if (!prime) return;
  const vp = page.viewportSize()!, touch = prime;
  await page.evaluate(() => {
    (window as unknown as { __moved: boolean }).__moved = false;
    document.getElementById('play')!.addEventListener('pointermove', () => { (window as unknown as { __moved: boolean }).__moved = true; }, { once: true });
  });
  await touch.start(vp.width / 2, vp.height * 0.6, 7);
  await touch.move(vp.width / 2 + 3, vp.height * 0.6, 7);
  await page.waitForFunction(() => (window as unknown as { __moved: boolean }).__moved, null, { timeout: 15000 });
  await page.waitForTimeout(700);
  await touch.end();
}

test.describe('real touch', () => {
  test('a tap on the Title starts a run', async ({ page }, info) => {
    const errors: string[] = [];
    await boot(page, errors);
    await expect(screenOn(page, 'title')).toHaveClass(/\bon\b/);
    const vp = page.viewportSize()!;
    if (info.project.use.hasTouch) await page.touchscreen.tap(vp.width / 2, vp.height * 0.45);
    else await (await Touch.of(page)).tap(vp.width / 2, vp.height * 0.45);
    await expect(screenOn(page, 'title')).not.toHaveClass(/\bon\b/);
    await expect.poll(async () => (await snap(page)).tick, { timeout: 5000 }).toBeGreaterThan(10);
    expect((await snap(page)).alive).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the first real touch unlocks audio (touchend / pointerup are user activation)', async ({ page }, info) => {
    const errors: string[] = [];
    await boot(page, errors);
    expect((await page.evaluate(() => window.__skate!.audio())).unlocked).toBe(false);
    const vp = page.viewportSize()!;
    if (info.project.use.hasTouch) await page.touchscreen.tap(vp.width / 2, vp.height * 0.45);
    else await (await Touch.of(page)).tap(vp.width / 2, vp.height * 0.45);
    await expect.poll(() => page.evaluate(() => window.__skate!.audio().unlocked), { timeout: 5000 }).toBe(true);
    expect(errors).toEqual([]);
  });

  test('a tap during a run ollies', async ({ page }, info) => {
    const errors: string[] = [];
    await boot(page, errors);
    await liveRun(page);
    const vp = page.viewportSize()!;
    const t0 = (await snap(page)).tick;
    if (info.project.use.hasTouch) await page.touchscreen.tap(vp.width / 2, vp.height * 0.6);
    else await (await Touch.of(page)).tap(vp.width / 2, vp.height * 0.6);
    await expect.poll(async () => kinds(await events(page, t0)), { timeout: 3000 }).toContain('ollie');
    expect(errors).toEqual([]);
  });

  test('a drag steers (relative, from the touch-down point)', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    const vp = page.viewportSize()!, touch = await Touch.of(page);
    await liveRun(page, 1, touch);
    const x0 = (await snap(page)).p.x;
    const y = vp.height * 0.6;
    await touch.start(vp.width * 0.3, y);
    for (let i = 1; i <= 12; i++) { await touch.move(vp.width * 0.3 + i * 10, y); await page.waitForTimeout(16); }
    await touch.end();
    // The skater carves right while the thumb moves (direct steering, DESIGN §4.2: a thumb faster than the skater's
    // 5.5 m/s loses the excess and the skater stops soon after the lift), so how far depends on how long the CDP drag
    // took under SwiftShader; 120 px at this pace always gives well over 0.5 m.
    await expect.poll(async () => (await snap(page)).p.x - x0, { timeout: 3000 }).toBeGreaterThan(0.5);
    expect(kinds(await events(page)).filter((k) => k === 'ollie' || k === 'flipStart')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a swipe left in the air kickflips', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    const vp = page.viewportSize()!, touch = await Touch.of(page);
    await liveRun(page, 1, touch);
    await page.evaluate(() => {
      const w = window as unknown as { __ptr: string[] };
      w.__ptr = [];
      for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
        document.getElementById('play')!.addEventListener(t, (e) => { const p = e as PointerEvent; w.__ptr.push(`${t}@${Math.round(p.timeStamp)}:${Math.round(p.clientX)}`); });
      }
    });
    // Loop time scale 0.3 (the Lesson assist mechanism: exact sim ticks, slower wall clock) stretches the 0.6 s of
    // air to 2 s, so CDP and polling latency under SwiftShader cannot push the flick past the landing. The flick
    // itself is still judged on real touch timestamps by the recognizer.
    await page.evaluate(() => window.__skate!.timeScale(0.3));
    const t0 = (await snap(page)).tick;
    await touch.tap(vp.width / 2, vp.height * 0.6);
    await airborneFor(page, t0, 7);                   // past the 70 ms pop bleed, well before the late-flip cutoff
    await touch.flick(vp.width * 0.62, vp.height * 0.55, -90, 0);
    const flips = async () => (await events(page, t0)).filter((e) => e.t === 'flipStart').map((e) => (e as { id: string }).id);
    await expect.poll(flips, { timeout: 3000 }).toHaveLength(1).catch(async () => {
      const diag = await page.evaluate((s) => ({ ev: window.__skate!.events(s).filter((e) => e.t !== 'coin').map((e) => `${e.t}@${e.tick}`),
        ptr: (window as unknown as { __ptr: string[] }).__ptr }), t0);
      throw new Error(`no flip: ${JSON.stringify(diag)}`);
    });
    expect(await flips()).toEqual(['kickflip']);
    expect(kinds(await events(page, t0))).toContain('ollie');
    expect(errors).toEqual([]);
  });

  test('mouse drag behaves like touch (steer) and a click ollies', async ({ page }, info) => {
    test.skip(!!info.project.use.hasTouch, 'desktop pointer');
    const errors: string[] = [];
    await boot(page, errors);
    await liveRun(page);
    const vp = page.viewportSize()!;
    const x0 = (await snap(page)).p.x;
    await page.mouse.move(vp.width * 0.4, vp.height * 0.6);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(vp.width * 0.4 - i * 12, vp.height * 0.6); await page.waitForTimeout(16); }
    await page.mouse.up();
    await expect.poll(async () => (await snap(page)).p.x - x0, { timeout: 3000 }).toBeLessThan(-0.5);   // as the touch drag
    const t0 = (await snap(page)).tick;
    await page.mouse.click(vp.width / 2, vp.height * 0.6);
    await expect.poll(async () => kinds(await events(page, t0)), { timeout: 3000 }).toContain('ollie');
    expect(errors).toEqual([]);
  });
});

test.describe('synthetic traces through the real recognizer (__skate.pointer, manual stepping)', () => {
  /** Starts a manual god run and returns a pointer() helper whose times are relative to the next tick. */
  async function manualRun(page: Page): Promise<void> {
    await page.evaluate(() => { window.__skate!.start({ seed: 1, god: true }); window.__skate!.manual(true); window.__skate!.step(30); });
  }
  type S = { id: number; tMs: number; x: number; y: number; phase: 'down' | 'move' | 'up' | 'cancel' };
  const flick = (x: number, y: number, dx: number, dy: number, t0 = 0, ms = 48, id = 1): S[] => {
    const out: S[] = [{ id, tMs: t0, x, y, phase: 'down' }];
    for (let i = 1; i <= 6; i++) out.push({ id, tMs: t0 + (ms * i) / 6, x: x + (dx * i) / 6, y: y + (dy * i) / 6, phase: 'move' });
    out.push({ id, tMs: t0 + ms, x: x + dx, y: y + dy, phase: 'up' });
    return out;
  };
  const tap = (x: number, y: number, t0: number, ms: number): S[] => [{ id: 9, tMs: t0, x, y, phase: 'down' }, { id: 9, tMs: t0 + ms, x, y, phase: 'up' }];

  test('a nervous 300 ms tap is still an ollie', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    await manualRun(page);
    const ev = await page.evaluate((s) => { window.__skate!.pointer(s); window.__skate!.step(30); return window.__skate!.events(30).map((e) => e.t); },
      tap(195, 500, 0, 300));
    expect(ev).toContain('ollie');
    expect(errors).toEqual([]);
  });

  test('↗ on the ground pops a FS 180; ← in the air is a kickflip', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    await manualRun(page);
    const spin = await page.evaluate((s) => { window.__skate!.pointer(s); window.__skate!.step(12); return window.__skate!.events(30); },
      flick(150, 520, 50, -50));
    expect(spin.find((e) => e.t === 'spinStart')).toMatchObject({ id: 'fs180' });
    await page.evaluate(() => window.__skate!.step(60));
    const t1 = (await snap(page)).tick;
    const flip = await page.evaluate(([a, b]) => {
      window.__skate!.pointer(a); window.__skate!.step(8);         // tap → ollie, then 8 ticks of air
      window.__skate!.pointer(b); window.__skate!.step(10);        // fresh fast flick left
      return window.__skate!.events();
    }, [tap(195, 500, 0, 60), flick(260, 480, -80, 0)] as const);
    expect(flip.filter((e) => e.tick > t1).map((e) => e.t)).toEqual(expect.arrayContaining(['ollie', 'flipStart']));
    expect(flip.find((e) => e.t === 'flipStart' && e.tick > t1)).toMatchObject({ id: 'kickflip' });
    expect(errors).toEqual([]);
  });

  test('a resting thumb outside a combo starts nothing', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    await manualRun(page);
    const ev = await page.evaluate((s) => { window.__skate!.pointer(s); window.__skate!.step(50); return window.__skate!.events(31).map((e) => e.t); },
      tap(195, 520, 0, 650));
    expect(ev.filter((k) => ['ollie', 'manualStart', 'flipStart', 'spinStart', 'grabStart'].includes(k))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a synthetic drag steers by S = 9 / (0.55·W) m per px', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    await manualRun(page);
    const w = page.viewportSize()!.width;
    const r = await page.evaluate((s) => {
      const before = window.__skate!.snapshot().p.x;
      window.__skate!.pointer(s); const after = window.__skate!.step(90);
      return { dx: after.p.x - before };
    }, [{ id: 3, tMs: 0, x: 100, y: 500, phase: 'down' as const },
      ...Array.from({ length: 20 }, (_, i) => ({ id: 3, tMs: 30 + i * 30, x: 100 + (i + 1) * 2, y: 500, phase: 'move' as const })),
      { id: 3, tMs: 640, x: 140, y: 500, phase: 'up' as const }]);
    // 40 px of slow drag (0.07 px/ms: the skater keeps up, no swipe), lifted: it ends where the thumb said and holds the line.
    expect(r.dx).toBeCloseTo((40 * 9) / (0.55 * w), 1);
    expect(errors).toEqual([]);
  });

  test('a quick slide stops the skater within 0.35 m of where the thumb stopped or lifted (owner playtest @steer)', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    for (const lift of [true, false]) {
      await manualRun(page);
      const r = await page.evaluate((lift) => {
        // 90 px to the right in 180 ms (minimum jerk, a sample every 8 ms), then lifted or left resting.
        const s: { id: number; tMs: number; x: number; y: number; phase: 'down' | 'move' | 'up' }[] = [{ id: 4, tMs: 0, x: 120, y: 560, phase: 'down' }];
        for (let i = 1; i <= 22; i++) {
          const u = i / 22, p = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
          s.push({ id: 4, tMs: 100 + 180 * u, x: 120 + 90 * p, y: 560 - 9 * p, phase: 'move' });
        }
        if (lift) s.push({ id: 4, tMs: 281, x: 210, y: 551, phase: 'up' });
        const x0 = window.__skate!.snapshot().p.x;
        window.__skate!.pointer(s);
        const atStop = window.__skate!.step(17).p.x;                   // the tick the thumb stops in (280 ms)
        const end = window.__skate!.step(60).p.x;
        if (!lift) window.__skate!.pointer([{ id: 4, tMs: 0, x: 210, y: 551, phase: 'up' }]);
        window.__skate!.step(2);
        return { moved: atStop - x0, after: end - atStop };
      }, lift);
      expect(r.moved, `lift ${lift}`).toBeGreaterThan(0.3);            // it dodged while the thumb moved
      expect(r.after, `lift ${lift}`).toBeGreaterThan(0);
      expect(r.after, `lift ${lift}`).toBeLessThanOrEqual(0.35);       // was ~3.3 m before @steer
    }
    expect(errors).toEqual([]);
  });
});

test.describe('keyboard preset A plays the same as touch', () => {
  test('Space ollies and ← in the air kickflips, like a tap and a swipe left; D steers right', async ({ page }, info) => {
    test.skip(!!info.project.use.hasTouch, 'desktop keyboard');
    const errors: string[] = [];
    await boot(page, errors);
    // Touch reference (synthetic, manual): tap, then a swipe left 8 ticks later.
    const viaTouch = await page.evaluate(() => {
      window.__skate!.start({ seed: 1, god: true }); window.__skate!.manual(true); window.__skate!.step(30);
      window.__skate!.pointer([{ id: 1, tMs: 0, x: 195, y: 500, phase: 'down' }, { id: 1, tMs: 60, x: 195, y: 500, phase: 'up' }]);
      window.__skate!.step(8);
      const f: { id: number; tMs: number; x: number; y: number; phase: 'down' | 'move' | 'up' }[] = [{ id: 2, tMs: 0, x: 260, y: 480, phase: 'down' }];
      for (let i = 1; i <= 6; i++) f.push({ id: 2, tMs: i * 8, x: 260 - i * 14, y: 480, phase: 'move' });
      window.__skate!.pointer([...f, { id: 2, tMs: 48, x: 176, y: 480, phase: 'up' }]);
      window.__skate!.step(40);
      return window.__skate!.events(31).filter((e) => e.t === 'ollie' || e.t === 'flipStart' || e.t === 'land').map((e) => ('id' in e ? `${e.t}:${e.id}` : e.t));
    });
    // Keyboard, real time (loop time scale 0.3 so harness latency cannot push the arrow past the landing).
    await liveRun(page);
    await page.evaluate(() => window.__skate!.timeScale(0.3));
    const t0 = (await snap(page)).tick;
    await page.keyboard.press('Space');
    await airborneFor(page, t0, 7);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await events(page, t0)).filter((e) => e.t === 'land').length, { timeout: 4000 }).toBeGreaterThan(0);
    const viaKeys = (await events(page, t0)).filter((e) => e.t === 'ollie' || e.t === 'flipStart' || e.t === 'land')
      .map((e) => ('id' in e ? `${e.t}:${(e as { id: string }).id}` : e.t));
    expect(viaKeys.slice(0, 3)).toEqual(viaTouch.slice(0, 3));
    expect(viaKeys).toEqual(expect.arrayContaining(['ollie', 'flipStart:kickflip']));
    // D (held) steers right at V_LAT_MAX, like a drag right.
    await page.evaluate(() => window.__skate!.timeScale(1));
    const s0 = await snap(page), x0 = s0.p.x;
    await page.keyboard.down('KeyD');
    await expect.poll(async () => (await snap(page)).tick, { timeout: 3000, intervals: [5] }).toBeGreaterThanOrEqual(s0.tick + 20);
    await page.keyboard.up('KeyD');
    await expect.poll(async () => (await snap(page)).p.x - x0, { timeout: 3000 }).toBeGreaterThan(0.5);
    // Enter / R are ignored during a run.
    const before = (await snap(page)).tick;
    await page.keyboard.press('Enter'); await page.keyboard.press('KeyR');
    await page.waitForTimeout(200);
    expect((await snap(page)).tick).toBeGreaterThan(before);
    await expect(screenOn(page, 'title')).not.toHaveClass(/\bon\b/);
    expect(errors).toEqual([]);
  });
});
