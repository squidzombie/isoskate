// Touch e2e (TECH §11.3, ROADMAP M0 acceptance): real touches (page.touchscreen and CDP Input.dispatchTouchEvent) go
// through #play → pointer events → the recognizer → frame binning → the sim. Both projects: the desktop project has
// no touchscreen API, so CDP touch is used there (Chromium turns it into pointerType 'touch' events), plus mouse
// drag (which must behave exactly like touch) and keyboard preset A (which must play the same as touch).
// Synthetic traces through __skate.pointer() in manual mode cover the timing-exact cases deterministically.
// Touch controls (DESIGN §4.1): two thumbs by default (a touch that goes down on the left half only steers, one on the
// right half only taps / swipes / holds); the one-thumb (classic) cases run after switching the setting in Settings.
// A mouse always uses the one-thumb grammar.
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
  /** Two simultaneous thumbs: every event carries all the active points (CDP diffs them against the last event). */
  static async multi(page: Page): Promise<Multi> { return new Multi(await page.context().newCDPSession(page)); }
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

/** Raw multi-touch through CDP: `down` / `move` send every active point (Chromium diffs them against the last event);
 *  `up` sends a touchEnd with only the point that lifts (measured: a touchMove that leaves a point out releases
 *  nothing, and a touchEnd lifts the points it lists while the others stay down). */
class Multi {
  private readonly pts = new Map<number, [number, number]>();
  constructor(private readonly cdp: CDPSession) {}
  private send(type: 'touchStart' | 'touchMove') {
    return this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...this.pts].map(([id, [x, y]]) => ({ id, x, y })) });
  }
  down(id: number, x: number, y: number) { this.pts.set(id, [x, y]); return this.send('touchStart'); }
  move(id: number, x: number, y: number) { this.pts.set(id, [x, y]); return this.send('touchMove'); }
  up(id: number) {
    const p = this.pts.get(id)!;
    this.pts.delete(id);
    return this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id, x: p[0], y: p[1] }] });
  }
}

/** Settings › Touch controls through the Settings screen (the App writes the save and re-applies the input). */
async function setControls(page: Page, name: 'Two thumbs' | 'One thumb'): Promise<void> {
  await page.evaluate(() => { window.__skate!.ui('title'); window.__skate!.ui('settings'); });
  await screenOn(page, 'settings').locator('[data-setting="controls"]').getByRole('button', { name }).click();
  await expect.poll(() => page.evaluate(() => window.__skate!.save.get().settings.controls)).toBe(name === 'One thumb' ? 'one' : 'two');
  await page.evaluate(() => window.__skate!.ui('title'));
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

  test('a right-thumb tap during a run ollies; a left-thumb tap does nothing', async ({ page }, info) => {
    const errors: string[] = [];
    await boot(page, errors);
    await liveRun(page);
    const vp = page.viewportSize()!;
    const tap = async (x: number) => {
      if (info.project.use.hasTouch) await page.touchscreen.tap(x, vp.height * 0.7);
      else await (await Touch.of(page)).tap(x, vp.height * 0.7);
    };
    const tL = (await snap(page)).tick;
    await tap(vp.width * 0.25);
    await expect.poll(async () => (await snap(page)).tick, { timeout: 10000 }).toBeGreaterThan(tL + 30);   // ~0.5 s of sim
    expect(kinds(await events(page, tL))).not.toContain('ollie');
    const t0 = (await snap(page)).tick;
    await tap(vp.width * 0.75);
    await expect.poll(async () => kinds(await events(page, t0)), { timeout: 3000 }).toContain('ollie');
    expect(errors).toEqual([]);
  });

  test('a left-thumb drag steers (relative, from the touch-down point)', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    const vp = page.viewportSize()!, touch = await Touch.of(page);
    await liveRun(page, 1, touch);
    const x0 = (await snap(page)).p.x;
    const y = vp.height * 0.6;
    await touch.start(vp.width * 0.3, y);
    for (let i = 1; i <= 12; i++) { await touch.move(vp.width * 0.3 + i * 10, y); await page.waitForTimeout(16); }
    await touch.end();
    // 120 px ≈ 120 × 9 / (0.55 × W) m of target offset: the skater carves right.
    await expect.poll(async () => (await snap(page)).p.x - x0, { timeout: 3000 }).toBeGreaterThan(1.0);
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

  test('both thumbs at once: a left drag and a right flick ← in the air give the kickflip AND the steering', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    const vp = page.viewportSize()!, touch = await Touch.of(page);
    await liveRun(page, 1, touch);
    const mt = await Touch.multi(page);
    await page.evaluate(() => window.__skate!.timeScale(0.25));
    const x0 = (await snap(page)).p.x;
    const t0 = (await snap(page)).tick;
    // 0.12·W of drag ≈ 1.96 m of steering, to the left (away from the Roll-out ledge at x = +2 and its magnet).
    const yL = vp.height * 0.75, xL = vp.width * 0.32, dx = -Math.round(vp.width * 0.12);
    await mt.down(1, xL, yL);                                       // the left thumb lands and starts steering
    for (let i = 1; i <= 4; i++) await mt.move(1, xL + (dx * i) / 12, yL);
    await Promise.all([mt.down(2, vp.width * 0.75, vp.height * 0.7), mt.up(2)]);   // right tap (queued: a tap, not a hold)
    await airborneFor(page, t0, 7);
    // Right flick ← right away (queued, like a real flick) while the left thumb is down mid-drag, then the left goes on.
    const fl: Promise<unknown>[] = [mt.down(2, vp.width * 0.7, vp.height * 0.65)];
    for (let i = 1; i <= 4; i++) fl.push(mt.move(2, vp.width * 0.7 - i * 22, vp.height * 0.65));
    fl.push(mt.up(2));
    await Promise.all(fl);
    for (let i = 5; i <= 12; i++) await mt.move(1, xL + (dx * i) / 12, yL);
    await mt.up(1);
    await expect.poll(async () => (await events(page, t0)).filter((e) => e.t === 'flipStart').map((e) => (e as { id: string }).id), { timeout: 4000 })
      .toEqual(['kickflip']);
    await page.evaluate(() => window.__skate!.timeScale(1));
    // Every pixel of the left drag steered (nothing subtracted for the flick): the skater settles on x0 + 0.12·W·S.
    const want = x0 + (dx * 9) / (0.55 * vp.width);
    await expect.poll(async () => (await snap(page)).p.x, { timeout: 4000 }).toBeLessThan(want + 0.15);
    expect((await snap(page)).p.x).toBeGreaterThan(want - 0.15);
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
    await expect.poll(async () => (await snap(page)).p.x - x0, { timeout: 3000 }).toBeLessThan(-1.0);
    // A mouse is one pointer, not two thumbs: it keeps the one-thumb grammar, so a click on the left half ollies too.
    const t0 = (await snap(page)).tick;
    await page.mouse.click(vp.width * 0.25, vp.height * 0.6);
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
  const tap = (x: number, y: number, t0: number, ms: number, id = 9): S[] => [{ id, tMs: t0, x, y, phase: 'down' }, { id, tMs: t0 + ms, x, y, phase: 'up' }];
  /** The left (steering) and right (trick) halves of the play area. */
  const sides = (page: Page) => { const w = page.viewportSize()!.width; return { w, L: w * 0.25, R: w * 0.75 }; };
  const flipsOf = (ev: GameEvent[], after: number) => ev.filter((e) => e.t === 'flipStart' && e.tick > after).map((e) => (e as { id: string }).id);

  test('a nervous 300 ms right-thumb tap is still an ollie', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    await manualRun(page);
    const { R } = sides(page);
    const ev = await page.evaluate((s) => { window.__skate!.pointer(s); window.__skate!.step(30); return window.__skate!.events(30).map((e) => e.t); },
      tap(R, 500, 0, 300));
    expect(ev).toContain('ollie');
    expect(errors).toEqual([]);
  });

  test('right thumb: ↗ on the ground pops a FS 180; ← in the air is a kickflip', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    await manualRun(page);
    const { w, R } = sides(page);
    const spin = await page.evaluate((s) => { window.__skate!.pointer(s); window.__skate!.step(12); return window.__skate!.events(30); },
      flick(w * 0.62, 520, 50, -50));
    expect(spin.find((e) => e.t === 'spinStart')).toMatchObject({ id: 'fs180' });
    await page.evaluate(() => window.__skate!.step(60));
    const t1 = (await snap(page)).tick;
    const flip = await page.evaluate(([a, b]) => {
      window.__skate!.pointer(a); window.__skate!.step(8);         // tap → ollie, then 8 ticks of air
      window.__skate!.pointer(b); window.__skate!.step(10);        // fresh fast flick left
      return window.__skate!.events();
    }, [tap(R, 500, 0, 60), flick(R, 480, -80, 0)] as const);
    expect(flip.filter((e) => e.tick > t1).map((e) => e.t)).toEqual(expect.arrayContaining(['ollie', 'flipStart']));
    expect(flipsOf(flip, t1)).toEqual(['kickflip']);
    expect(errors).toEqual([]);
  });

  test('left thumb: taps, a hard ↑ on the ground and a hard ← in the air are only steering', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    await manualRun(page);
    const { L, R } = sides(page);
    const t1 = (await snap(page)).tick;
    const ev = await page.evaluate(([a, b, c, d]) => {
      window.__skate!.pointer(a); window.__skate!.step(30);        // left tap: nothing
      window.__skate!.pointer(b); window.__skate!.step(30);        // left hard flick ↑ on the ground: no ollie
      window.__skate!.pointer(c); window.__skate!.step(8);         // right tap: ollie
      window.__skate!.pointer(d); window.__skate!.step(40);        // left hard flick ← in the air: no flip
      return window.__skate!.events();
    }, [tap(L, 520, 0, 90, 4), flick(L, 560, 0, -90, 0, 48, 5), tap(R, 500, 0, 60), flick(L, 520, -80, 0, 0, 48, 6)] as const);
    expect(ev.filter((e) => e.tick > t1 && e.t === 'ollie')).toHaveLength(1);
    expect(flipsOf(ev, t1)).toEqual([]);
    expect(ev.filter((e) => e.tick > t1 && e.t === 'spinStart')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('both thumbs in one trace: the left steers while the right flicks ← in the air (flip and steering)', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    await manualRun(page);
    const { w, L, R } = sides(page);
    const x0 = (await snap(page)).p.x;
    const t1 = (await snap(page)).tick;
    const left: S[] = [{ id: 3, tMs: 0, x: L, y: 600, phase: 'down' }];
    for (let i = 1; i <= 25; i++) left.push({ id: 3, tMs: i * 16, x: L - i * 2, y: 600, phase: 'move' });   // 50 px left in 400 ms
    left.push({ id: 3, tMs: 420, x: L - 50, y: 600, phase: 'up' });
    const r = await page.evaluate(([a, b, c]) => {
      window.__skate!.pointer([...a, ...b, ...c]);
      window.__skate!.step(120);
      return { ev: window.__skate!.events(), x: window.__skate!.snapshot().p.x };
    }, [left, tap(R, 500, 40, 60), flick(R, 480, -80, 0, 220, 48, 7)] as const);
    expect(flipsOf(r.ev, t1)).toEqual(['kickflip']);
    expect(r.x - x0).toBeCloseTo((-50 * 9) / (0.55 * w), 1);       // every pixel steered, none taken back
    expect(errors).toEqual([]);
  });

  test('a resting thumb outside a combo starts nothing (either side)', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    await manualRun(page);
    const { L, R } = sides(page);
    const ev = await page.evaluate(([a, b]) => { window.__skate!.pointer([...a, ...b]); window.__skate!.step(50); return window.__skate!.events(31).map((e) => e.t); },
      [tap(R, 520, 0, 650), tap(L, 520, 0, 650, 4)] as const);
    expect(ev.filter((k) => ['ollie', 'manualStart', 'flipStart', 'spinStart', 'grabStart'].includes(k))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a synthetic left drag steers by S = 9 / (0.55·W) m per px; a right drag steers nothing', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    await manualRun(page);
    const { w, L, R } = sides(page);
    const drag = (x: number, id: number): S[] => [{ id, tMs: 0, x, y: 500, phase: 'down' },
      ...Array.from({ length: 10 }, (_, i) => ({ id, tMs: 20 + i * 20, x: x + (i + 1) * 4, y: 500, phase: 'move' as const })),
      { id, tMs: 240, x: x + 40, y: 500, phase: 'up' }];
    const r = await page.evaluate(([a, b]) => {
      const before = window.__skate!.snapshot().p.x;
      window.__skate!.pointer(a); const mid = window.__skate!.step(60).p.x;
      window.__skate!.pointer(b); const after = window.__skate!.step(60).p.x;
      return { dx: mid - before, dxR: after - mid };
    }, [drag(L * 0.4, 3), drag(R, 8)] as const);
    expect(r.dx).toBeCloseTo((40 * 9) / (0.55 * w), 1);          // 40 px of slow drag (no swipe), lifted: holds the line
    expect(Math.abs(r.dxR)).toBeLessThan(0.02);
    expect(errors).toEqual([]);
  });
});

test.describe('one thumb (classic), behind Settings › Touch controls', () => {
  type S = { id: number; tMs: number; x: number; y: number; phase: 'down' | 'move' | 'up' | 'cancel' };
  test('one thumb: a left-half tap ollies, one thumb steers and flicks (↗ pops a FS 180 anywhere)', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    await setControls(page, 'One thumb');
    await page.evaluate(() => { window.__skate!.start({ seed: 1, god: true }); window.__skate!.manual(true); window.__skate!.step(30); });
    const w = page.viewportSize()!.width;
    const tapL: S[] = [{ id: 1, tMs: 0, x: w * 0.25, y: 520, phase: 'down' }, { id: 1, tMs: 90, x: w * 0.25, y: 520, phase: 'up' }];
    const ev = await page.evaluate((s) => { window.__skate!.pointer(s); window.__skate!.step(30); return window.__skate!.events(30).map((e) => e.t); }, tapL);
    expect(ev).toContain('ollie');
    await page.evaluate(() => window.__skate!.step(60));
    const t1 = (await snap(page)).tick;
    const up: S[] = [{ id: 2, tMs: 0, x: w * 0.3, y: 520, phase: 'down' }];
    for (let i = 1; i <= 6; i++) up.push({ id: 2, tMs: i * 8, x: w * 0.3 + (50 * i) / 6, y: 520 - (50 * i) / 6, phase: 'move' });
    up.push({ id: 2, tMs: 48, x: w * 0.3 + 50, y: 470, phase: 'up' });
    const spin = await page.evaluate((s) => { window.__skate!.pointer(s); window.__skate!.step(12); return window.__skate!.events(); }, up);
    expect(spin.find((e) => e.t === 'spinStart' && e.tick > t1)).toMatchObject({ id: 'fs180' });
    // Back to two thumbs: the same left tap does nothing.
    await setControls(page, 'Two thumbs');
    await page.evaluate(() => { window.__skate!.start({ seed: 1, god: true }); window.__skate!.manual(true); window.__skate!.step(30); });
    const ev2 = await page.evaluate((s) => { window.__skate!.pointer(s); window.__skate!.step(30); return window.__skate!.events(30).map((e) => e.t); }, tapL);
    expect(ev2).not.toContain('ollie');
    expect(errors).toEqual([]);
  });

  test('one thumb, real touch: a tap on the left half ollies and a drag on the right half steers', async ({ page }, info) => {
    const errors: string[] = [];
    await boot(page, errors);
    await setControls(page, 'One thumb');
    const vp = page.viewportSize()!, touch = await Touch.of(page);
    await liveRun(page, 1, touch);
    const t0 = (await snap(page)).tick;
    if (info.project.use.hasTouch) await page.touchscreen.tap(vp.width * 0.25, vp.height * 0.7);
    else await touch.tap(vp.width * 0.25, vp.height * 0.7);
    await expect.poll(async () => kinds(await events(page, t0)), { timeout: 3000 }).toContain('ollie');
    await expect.poll(async () => kinds(await events(page, t0)), { timeout: 3000 }).toContain('land');
    const x0 = (await snap(page)).p.x, y = vp.height * 0.6;
    await touch.start(vp.width * 0.8, y);
    for (let i = 1; i <= 12; i++) { await touch.move(vp.width * 0.8 - i * 10, y); await page.waitForTimeout(16); }
    await touch.end();
    await expect.poll(async () => (await snap(page)).p.x - x0, { timeout: 3000 }).toBeLessThan(-1.0);
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
      const R = window.innerWidth * 0.75;                           // the right (trick) thumb
      window.__skate!.pointer([{ id: 1, tMs: 0, x: R, y: 500, phase: 'down' }, { id: 1, tMs: 60, x: R, y: 500, phase: 'up' }]);
      window.__skate!.step(8);
      const f: { id: number; tMs: number; x: number; y: number; phase: 'down' | 'move' | 'up' }[] = [{ id: 2, tMs: 0, x: R, y: 480, phase: 'down' }];
      for (let i = 1; i <= 6; i++) f.push({ id: 2, tMs: i * 8, x: R - i * 14, y: 480, phase: 'move' });
      window.__skate!.pointer([...f, { id: 2, tMs: 48, x: R - 84, y: 480, phase: 'up' }]);
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
    // 15 s of wall time: under load SwiftShader frames run this loop at a few ticks per second (the landing is sim time).
    await expect.poll(async () => (await events(page, t0)).filter((e) => e.t === 'land').length, { timeout: 15000 }).toBeGreaterThan(0).catch(async () => {
      const diag = await page.evaluate((x) => ({ ev: window.__skate!.events(x).filter((e) => e.t !== 'coin').map((e) => `${e.t}@${e.tick}`), s: window.__skate!.snapshot() }), t0);
      throw new Error(`no landing: ${JSON.stringify({ ev: diag.ev, tick: diag.s.tick, mode: diag.s.mode, y: diag.s.p.y })}`);
    });
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
