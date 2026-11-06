// ui.spec (TECH §11.3, ROADMAP W3a acceptance): every screen opens; Results → ROLL AGAIN ≤ 3 s; buy → equip →
// persists after reload; open a crate → reload mid-reveal → the same result resumes; pity counts are visible; HUD
// no-overlap at 320 / 360 / 390 px; Back up → Restore round-trips; no layout reads during runs and HUD text writes
// ≤ 15 Hz (dev guard); offers hidden with the NullProvider; hidden screens are inert.
import { expect, test, type Page } from '@playwright/test';
import type { SaveV1 } from '../../src/core/save';

declare global {
  interface Window {
    __skate?: import('../../src/core/debug').DebugAPI;
    __dusklaneUi?: { guard: { reads: number; samples: string[]; active: boolean; reset(): void }; hudStats(): { batches: number; textWrites: number; minBatchGapMs: number };
      current(): string; reveal(): { item: string | null; rarity: string } | null; modalOpen(): boolean };
  }
}

async function boot(page: Page, errors: string[], query = ''): Promise<void> {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?debug=1&quality=low${query}`);
  await page.waitForFunction(() => !!window.__skate && !!window.__dusklaneUi);
}
const screenOn = (page: Page, id: string) => page.locator(`#screens [data-screen="${id}"]`);
/** Edits the save through the debug API (import + sanitize, like a restore). */
async function editSave(page: Page, f: string): Promise<void> {
  await page.evaluate((src) => {
    const s = window.__skate!.save.get();
    new Function('s', src)(s);
    window.__skate!.save.set(s);
  }, f);
}
const save = (page: Page) => page.evaluate(() => window.__skate!.save.get()) as Promise<SaveV1>;

test('every screen opens through the App, and hidden screens are inert', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  const ids = ['title', 'locker', 'shop', 'crates', 'stats', 'settings', 'rewards', 'results', 'pause', 'crash'];
  for (const id of ids) {
    if (id === 'pause') { await page.evaluate(() => window.__skate!.start({ seed: 3, god: true })); }
    else await page.evaluate(() => window.__skate!.ui('title'));
    await page.evaluate((s) => window.__skate!.ui(s as 'title'), id);
    await expect(screenOn(page, id)).toHaveClass(/\bon\b/);
    const st = await page.evaluate((s) => [...document.querySelectorAll<HTMLElement>('#screens [data-screen]')]
      .map((e) => ({ id: e.dataset.screen, on: e.classList.contains('on'), inert: e.inert })), id);
    for (const x of st) expect(x.inert, `${x.id} inert while ${id} is shown`).toBe(!x.on);
    expect(st.filter((x) => x.on).map((x) => x.id)).toEqual([id]);
  }
  // Menu-to-menu navigation goes through the App (Shop → Crates → Back → Title).
  await page.evaluate(() => window.__skate!.ui('title'));
  await page.evaluate(() => window.__skate!.ui('shop'));
  await screenOn(page, 'shop').getByRole('button', { name: 'Crates' }).click();
  await expect(screenOn(page, 'crates')).toHaveClass(/\bon\b/);
  await screenOn(page, 'crates').getByRole('button', { name: /^back$/i }).click();
  await expect(screenOn(page, 'title')).toHaveClass(/\bon\b/);
  expect(errors).toEqual([]);
});

test('Results → ROLL AGAIN takes ≤ 3 s from the crash (ROLL AGAIN works from the first frame of Results)', async ({ page }, info) => {
  const errors: string[] = [];
  await boot(page, errors);
  // Measured in-page (CPU load on the test machine must not count): crash → Results shown → a tap on ROLL AGAIN the
  // moment it is visible → the new run's first rendered frame.
  const t = await page.evaluate(() => new Promise<{ results: number; ref: number; click: number; run: number }>((done) => {
    const k = window.__skate!;
    k.start({ seed: 2 }); k.manual(true);
    let s = k.step(120);
    while (s.alive && s.tick < 900) s = k.step(1);
    const crashAt = performance.now();
    // A reference timer with the App's delay: on a loaded CPU both fire late by the same amount.
    let refAt = 0;
    setTimeout(() => { refAt = performance.now(); }, 1200);
    const res = document.querySelector<HTMLElement>('#screens [data-screen="results"]')!;
    const obs = new MutationObserver(() => {
      if (!res.classList.contains('on')) return;
      obs.disconnect();
      const resultsAt = performance.now();
      k.manual(false);
      res.querySelector<HTMLButtonElement>('button.roll')!.click();          // App.startRun + the UI switch, synchronous
      const clickAt = performance.now();
      requestAnimationFrame(() => done({ results: resultsAt - crashAt, ref: (refAt || resultsAt) - crashAt, click: clickAt - resultsAt, run: performance.now() - crashAt }));
    });
    obs.observe(res, { attributes: true, attributeFilter: ['class'] });
  }));
  const snap = await page.evaluate(() => window.__skate!.snapshot());
  expect(snap.alive).toBe(true);
  expect(snap.tick).toBeLessThan(60);
  console.log(`crash → Results shown ${Math.round(t.results)} ms (a 1.2 s reference timer fired at ${Math.round(t.ref)} ms) → ROLL AGAIN handled in ${Math.round(t.click)} ms → next frame at ${Math.round(t.run)} ms`);
  // Budget (DESIGN §17.3, ≤ 3.0 s through Results): the App's 1.2 s Results delay + showing Results + the ROLL AGAIN
  // handler + the player's tap. SwiftShader on a shared CPU renders a frame in 0.1–3 s and delays every timer, so the
  // UI's own cost is measured against a reference timer with the same delay.
  expect(t.results).toBeGreaterThanOrEqual(1150);                  // never earlier than the App's 1.2 s
  expect(t.results - t.ref).toBeLessThanOrEqual(150);              // showing Results adds ≤ 150 ms
  expect(t.click).toBeLessThanOrEqual(300);                        // ROLL AGAIN → the new run, synchronously
  expect(1200 + (t.results - t.ref) + t.click + 600).toBeLessThanOrEqual(3000);
  void info;
  // And a real click works as soon as Results is on.
  await page.evaluate(() => { const k = window.__skate!; k.start({ seed: 2 }); k.manual(true); let s = k.step(120); while (s.alive && s.tick < 900) s = k.step(1); });
  await expect(screenOn(page, 'results')).toHaveClass(/\bon\b/, { timeout: 10_000 });
  await page.getByRole('button', { name: /roll again/i }).click();
  await expect(screenOn(page, 'results')).not.toHaveClass(/\bon\b/);
  expect(errors).toEqual([]);
});

test('buy an item → equip → it persists after a reload', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await editSave(page, 's.xp.level = 3; s.wallet.coins = 1000;');
  await page.evaluate(() => { window.__skate!.ui('title'); window.__skate!.ui('shop'); });
  const shop = screenOn(page, 'shop');
  await shop.getByRole('tab', { name: 'Boards' }).click();
  await shop.locator('.card-grid [data-item="bd_mint_chip"]').click();
  const buy = shop.locator('.detail .act-buy');
  await expect(buy).toBeEnabled();
  await buy.click();
  await shop.locator('.detail .act-equip').click();
  await expect(shop.locator('.detail .act-equip')).toHaveText(/equipped/i);
  const before = await save(page);
  expect(before.owned).toContain('bd_mint_chip');
  expect(before.equipped.board).toBe('bd_mint_chip');
  await page.reload();
  await page.waitForFunction(() => !!window.__skate);
  const after = await save(page);
  expect(after.owned).toContain('bd_mint_chip');
  expect(after.equipped.board).toBe('bd_mint_chip');
  expect(after.wallet.coins).toBe(1000 - (before.shop.featured.includes('bd_mint_chip') ? 225 : 300));
  expect(after.wallet.spentTotal).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('open a crate → reload mid-reveal → the same result resumes; pity counts are visible', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await editSave(page, 's.xp.level = 4; s.crates.held.street = 2; s.crates.pity.streetEpic = 6; s.crates.pity.streetLegendary = 31; s.crates.pity.proLegendary = 3;');
  await page.evaluate(() => { window.__skate!.ui('title'); window.__skate!.ui('crates'); });
  const crates = screenOn(page, 'crates');
  await expect(crates.locator('[data-tier="street"]')).toContainText('Epic+ guaranteed within 4');
  await expect(crates.locator('[data-tier="street"]')).toContainText('Legendary guaranteed within 9');
  await expect(crates.locator('[data-tier="pro"]')).toContainText('Legendary guaranteed within 7');
  await expect(crates.locator('[data-tier="street"] .odds')).toContainText('70%');
  await crates.locator('[data-tier="street"] button.open').click();
  await expect(page.locator('.reveal')).toBeVisible();
  const rolled = await page.evaluate(() => window.__dusklaneUi!.reveal());
  const pending = (await save(page)).crates.pending;
  expect(pending).not.toBeNull();
  expect(pending!.item).toBe(rolled!.item);
  await page.locator('.rv-crate').click();                         // one shake, then the tab is closed
  await page.reload();
  await page.waitForFunction(() => !!window.__skate && !!window.__dusklaneUi);
  expect((await save(page)).crates.held.street).toBe(1);           // the roll was not repeated
  await page.evaluate(() => { window.__skate!.ui('title'); window.__skate!.ui('crates'); });
  await expect(page.locator('.reveal')).toBeVisible();
  const resumed = await page.evaluate(() => window.__dusklaneUi!.reveal());
  expect(resumed).toEqual(rolled);
  for (let i = 0; i < 3; i++) await page.locator('.rv-crate').click();
  await expect(page.locator('.reveal')).toHaveAttribute('data-stage', /item|done/);
  await expect.poll(async () => (await save(page)).crates.pending).toBeNull();
  if (rolled!.item) expect((await save(page)).owned).toContain(rolled!.item);
  await expect(page.locator('.rv-actions')).toHaveClass(/\bon\b/, { timeout: 4000 });
  await page.locator('.rv-back').click();
  await expect(crates.locator('[data-tier="street"]')).toContainText(/guaranteed within/);
  expect(errors).toEqual([]);
});

for (const [w, h] of [[320, 568], [360, 640], [390, 844]] as const) {
  test(`HUD: no overlap and inside the 56 px band at ${w} px`, async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'viewport override on one project');
    await page.setViewportSize({ width: w, height: h });
    const errors: string[] = [];
    await boot(page, errors);
    await page.evaluate(() => { window.__skate!.start({ seed: 1, god: true }); window.__skate!.manual(true); window.__skate!.step(120); });
    for (const v of [null, { score: 987654, dist: 23456, combo: 98765, links: 24, coins: 98765, trick: 'VARIAL HEELFLIP ×0.45' }, { score: 1_234_567, combo: 5, links: 1, coins: 3 }]) {
      await page.evaluate((p) => window.__skate!.ext!.hud(p), v);
      await page.waitForTimeout(120);
      const m = await page.evaluate(() => {
        const probe = document.getElementById('safe-probe');
        const safeTop = probe ? parseFloat(getComputedStyle(probe).paddingTop) || 0 : 0;
        const els = [...document.querySelectorAll<HTMLElement>('#hud [data-hud]')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && (e.textContent !== '' || e.dataset.hud === 'pause'));
        const rect = (e: Element) => { const r = e.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
        // Text that overflows its box (an ellipsis) counts as the box; scrollWidth catches clipped digits.
        const clipped = els.filter((e) => e.dataset.hud !== 'pause' && e.dataset.hud !== 'trick' && e.scrollWidth > e.clientWidth + 1).map((e) => e.dataset.hud);
        return { safeTop, vw: innerWidth, clipped, rects: els.map((e) => ({ id: e.dataset.hud!, ...rect(e) })) };
      });
      const groups: Record<string, string> = { score: 'L', dist: 'L', combo: 'M', trick: 'M', coins: 'R', pause: 'R' };
      for (const a of m.rects) {
        expect(a.y1, `${a.id} inside the band`).toBeLessThanOrEqual(m.safeTop + 56 + 0.5);
        expect(a.x0).toBeGreaterThanOrEqual(-0.5);
        expect(a.x1).toBeLessThanOrEqual(m.vw + 0.5);
        for (const b of m.rects) {
          if (a === b || groups[a.id] === groups[b.id]) continue;
          const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
          expect(ix > 0.5 && iy > 0.5, `${a.id} overlaps ${b.id} at ${w} px (${JSON.stringify(v)})`).toBe(false);
        }
      }
      expect(m.clipped, `clipped HUD text at ${w} px`).toEqual([]);
    }
    await page.evaluate(() => window.__skate!.ext!.hud(null));
    expect(errors).toEqual([]);
  });
}

test('Level 2: Results opens the crate by itself, the skater reaches the Locker only at the reveal, "Equip now?" works', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await boot(page, errors);
  await editSave(page, 's.xp.intoLevel = 149;');                   // any run 1 now ends at Level 2 (the forced crate)
  await page.evaluate(() => { const k = window.__skate!; k.start({ seed: 2 }); k.manual(true); let s = k.step(60); while (s.alive && s.tick < 900) s = k.step(1); k.manual(false); });
  await expect(screenOn(page, 'results')).toHaveClass(/\bon\b/, { timeout: 30_000 });
  const s0 = await save(page);
  expect(s0.xp.level).toBe(2);
  const skater = s0.crates.pending!.item!;
  expect(skater).toMatch(/^sk_/);
  expect(s0.owned).not.toContain(skater);                          // still in the crate: Locker and badges can't spoil it
  // After the XP bar (~2.4 s), without a tap. A loaded SwiftShader machine can stall the page for tens of seconds.
  await expect(page.locator('.reveal')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.reveal .rv-later')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.locator('.rv-crate').click();
  await expect(page.locator('.rv-actions')).toHaveClass(/\bon\b/, { timeout: 8000 });
  await expect(page.locator('.rv-equip')).toHaveText('Equip now?');
  await page.locator('.rv-equip').click();
  await page.locator('.rv-back').click();
  await expect(screenOn(page, 'results')).toHaveClass(/\bon\b/);
  const s1 = await save(page);
  expect(s1.owned).toContain(skater);
  expect(s1.equipped.skater).toBe(skater);
  expect(s1.crates.pending).toBeNull();
  await expect(screenOn(page, 'results').locator('.reward.item')).toContainText('Equipped');
  // Run 2 rides as the new skater.
  await page.getByRole('button', { name: /roll again/i }).click();
  await expect(screenOn(page, 'results')).not.toHaveClass(/\bon\b/);
  expect((await save(page)).equipped.skater).toBe(skater);
  expect(errors).toEqual([]);
});

test('Level 2 skipped by ROLL AGAIN: the crate waits, "Later" is honoured, and Title opens it once', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await boot(page, errors);
  await editSave(page, 's.xp.intoLevel = 149;');
  await page.evaluate(() => { const k = window.__skate!; k.start({ seed: 2 }); k.manual(true); let s = k.step(60); while (s.alive && s.tick < 900) s = k.step(1); k.manual(false); });
  await expect(screenOn(page, 'results')).toHaveClass(/\bon\b/, { timeout: 30_000 });
  await page.getByRole('button', { name: /roll again/i }).click();  // before the reveal opens
  await expect(screenOn(page, 'results')).not.toHaveClass(/\bon\b/);
  expect(await page.evaluate(() => window.__dusklaneUi!.modalOpen())).toBe(false);
  const pending = (await save(page)).crates.pending!;
  expect(pending.item).toMatch(/^sk_/);
  await page.evaluate(() => window.__skate!.ui('title'));
  await expect(page.locator('.reveal')).toBeVisible({ timeout: 60_000 });
  await page.locator('.reveal .rv-later').click();
  await expect(screenOn(page, 'title')).toHaveClass(/\bon\b/);
  await page.evaluate(() => { window.__skate!.ui('stats'); });
  await page.evaluate(() => { window.__skate!.ui('title'); });
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__dusklaneUi!.modalOpen())).toBe(false);       // "Later" is not nagged again
  expect((await save(page)).crates.pending).toEqual(pending);
  expect((await save(page)).owned).not.toContain(pending.item);
  expect(errors).toEqual([]);
});

test('320 × 568: Shop cards, labels and the detail bar fit; Results shows the next goal above the fold', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'viewport override on one project');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 568 });
  const errors: string[] = [];
  await boot(page, errors);
  const shop = screenOn(page, 'shop');
  const measure = () => page.evaluate(() => {
    const root = document.querySelector('#screens [data-screen="shop"]')!;
    const r = (sel: string) => { const e = root.querySelector(sel); if (!e || !(e as HTMLElement).offsetParent) return null; const b = e.getBoundingClientRect(); return { y0: b.top, y1: b.bottom, x0: b.left, x1: b.right }; };
    const clipped = [...root.querySelectorAll<HTMLElement>('.featured .card-band, .featured .card-foot, .lock-note span, .detail .act-buy, .detail .act-equip')]
      .filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map((e) => `${e.className}: ${e.textContent}`);
    const grid = root.querySelector<HTMLElement>('.card-grid')!, card = grid.querySelector<HTMLElement>('.card')!;
    return { panel: r('.panel'), detail: r('.detail'), buy: r('.detail .act-buy'), equip: r('.detail .act-equip'),
      gridH: grid.clientHeight, cardH: card.offsetHeight, gridY1: grid.getBoundingClientRect().bottom, clipped, vh: innerHeight };
  });
  for (const level of [1, 5]) {
    await editSave(page, `s.xp.level = ${level}; s.wallet.coins = 120;`);
    await page.evaluate(() => { window.__skate!.ui('title'); window.__skate!.ui('shop'); });
    await shop.locator('.card-grid [data-item]').nth(4).click();
    const m = await measure();
    expect(m.clipped, `clipped at Level ${level}`).toEqual([]);
    const act = m.buy ?? m.equip;
    expect(act, `a detail action at Level ${level}`).not.toBeNull();
    expect(act!.y1, `detail action inside the panel at Level ${level}`).toBeLessThanOrEqual(m.panel!.y1 + 0.5);
    expect(m.panel!.y1).toBeLessThanOrEqual(m.vh + 0.5);
    expect(m.gridH, `one full card row visible above the detail bar at Level ${level}`).toBeGreaterThanOrEqual(m.cardH);
    expect(m.gridY1).toBeLessThanOrEqual(m.detail!.y0 + 1);
  }
  // Results: the goal line is on screen without scrolling.
  await page.evaluate(() => { const k = window.__skate!; k.start({ seed: 2 }); k.manual(true); let s = k.step(60); while (s.alive && s.tick < 900) s = k.step(1); k.manual(false); });
  await expect(screenOn(page, 'results')).toHaveClass(/\bon\b/, { timeout: 30_000 });
  const goal = screenOn(page, 'results').locator('.res-goal');
  await expect(goal).toBeVisible();
  const g = await goal.boundingBox();
  expect(g!.y + g!.height).toBeLessThanOrEqual(568);
  const roll = await page.getByRole('button', { name: /roll again/i }).boundingBox();
  expect(g!.y + g!.height).toBeLessThanOrEqual(roll!.y);
  expect(errors).toEqual([]);
});

test('the instant-retry reward toast sits in the HUD band and is gone by 3.0 s', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'touch flow');
  const errors: string[] = [];
  await boot(page, errors);
  // Crash, then a fresh touch 0.65 s later (dispatched in-page, so CPU load can't push it past the 1.2 s window).
  await page.evaluate(async () => {
    const k = window.__skate!; k.start({ seed: 1 }); k.manual(true); let s = k.step(60); while (s.alive && s.tick < 900) s = k.step(1);
    // One timer registered right after the crash: due before the App's 1.2 s Results timer even when a slow frame
    // makes both overdue (a polling loop could be re-armed after it and lose the race).
    await new Promise<void>((done) => setTimeout(() => {
      k.manual(false);
      const el = document.getElementById('play')!;
      const o = { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 195, clientY: 420, bubbles: true };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new PointerEvent('pointerup', o));
      done();
    }, 650));
  });
  await expect(screenOn(page, 'crash')).not.toHaveClass(/\bon\b/);
  await expect(screenOn(page, 'results')).not.toHaveClass(/\bon\b/);
  const toast = page.locator('#hud .hud-reward');
  await expect(toast).toHaveClass(/\bon\b/);
  await expect(toast).toContainText('coins');
  const r = await toast.boundingBox();
  expect(r!.y + r!.height).toBeLessThanOrEqual(56.5);
  await expect(toast).not.toHaveClass(/\bon\b/, { timeout: 3000 });
  expect(errors).toEqual([]);
});

test('Back up → Restore round-trips through Settings', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await editSave(page, "s.wallet.coins = 4321; s.xp.level = 7; s.owned.push('sk_rook'); s.trickBook = ['ollie', 'kickflip']; s.stats.best = 55555; s.settings.music = 0.35;");
  await page.evaluate(() => { window.__skate!.ui('title'); window.__skate!.ui('settings'); });
  const settings = screenOn(page, 'settings');
  await settings.getByRole('button', { name: 'Export' }).click();
  const code = await page.locator('.modal-card textarea.code').inputValue();
  expect(JSON.parse(code).wallet.coins).toBe(4321);
  await page.locator('.modal-card').getByRole('button', { name: 'Done' }).click();
  // Lose everything, then restore from the code.
  await page.evaluate(() => window.__skate!.save.reset());
  await page.reload();
  await page.waitForFunction(() => !!window.__skate);
  expect((await save(page)).wallet.coins).toBe(0);
  await page.evaluate(() => { window.__skate!.ui('title'); window.__skate!.ui('settings'); });
  await settings.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.locator('.modal-card textarea.code').fill(code);
  await page.locator('.modal-card').getByRole('button', { name: 'Restore', exact: true }).click();
  await page.locator('.modal-card').getByRole('button', { name: 'Restore', exact: true }).click();   // confirm
  await page.waitForEvent('load');
  await page.waitForFunction(() => !!window.__skate);
  const s = await save(page);
  expect(s.wallet.coins).toBe(4321);
  expect(s.xp.level).toBe(7);
  expect(s.owned).toContain('sk_rook');
  expect(s.trickBook).toEqual(['ollie', 'kickflip']);
  expect(s.stats.best).toBe(55555);
  expect(s.settings.music).toBe(0.35);
  expect({ ...s, lastPlayed: 0 }).toEqual({ ...JSON.parse(code), lastPlayed: 0 });
  // A garbage code is refused and changes nothing.
  await page.evaluate(() => { window.__skate!.ui('title'); window.__skate!.ui('settings'); });
  await settings.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.locator('.modal-card textarea.code').fill('{"hello":"world"}');
  await page.locator('.modal-card').getByRole('button', { name: 'Restore', exact: true }).click();
  await page.locator('.modal-card').getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.locator('#toasts')).toContainText('not a Dusklane backup');
  expect((await save(page)).wallet.coins).toBe(4321);
  expect(errors).toEqual([]);
});

test('a live run: no layout reads (dev guard) and HUD text batches ≤ 15 Hz', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await page.evaluate(() => { window.__skate!.start({ seed: 1, god: true }); });
  await expect.poll(() => page.evaluate(() => window.__skate!.snapshot().tick)).toBeGreaterThan(10);
  const t0 = await page.evaluate(() => { window.__dusklaneUi!.guard.reset(); return { b: window.__dusklaneUi!.hudStats().batches, t: performance.now() }; });
  // Steer, ollie and flip with the keyboard for ~3 s (popups, the combo pill, coins and the score all update). Touch-
  // downs are left out on purpose: input/ re-reads window.innerHeight on every pointerdown (docs/core-requests.md, MU).
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
    await page.keyboard.down(i % 2 ? 'KeyA' : 'KeyD');
    await page.waitForTimeout(260);
    await page.keyboard.up(i % 2 ? 'KeyA' : 'KeyD');
    await page.waitForTimeout(120);
  }
  const r = await page.evaluate(() => ({ reads: window.__dusklaneUi!.guard.reads, samples: window.__dusklaneUi!.guard.samples, active: window.__dusklaneUi!.guard.active,
    stats: window.__dusklaneUi!.hudStats(), t: performance.now() }));
  expect(r.active).toBe(true);
  expect(r.reads, `layout reads during the run: ${r.samples.join(' | ')}`).toBe(0);
  const sec = (r.t - t0.t) / 1000, hz = (r.stats.batches - t0.b) / sec;
  console.log(`HUD text batches: ${hz.toFixed(1)} Hz over ${sec.toFixed(1)} s, min gap ${r.stats.minBatchGapMs.toFixed(1)} ms`);
  expect(hz).toBeLessThanOrEqual(15.5);
  expect(r.stats.minBatchGapMs).toBeGreaterThanOrEqual(1000 / 15 - 1);
  expect(errors).toEqual([]);
});

test('offers: hidden with the NullProvider; with ?fakeads=1 only after run 3 and not on the install day', async ({ page }) => {
  // Three runs and two boots: on a shared CPU, SwiftShader can take seconds per frame right after a page load.
  test.setTimeout(180_000);
  const errors: string[] = [];
  await boot(page, errors);
  const crashToResults = async () => {
    await page.evaluate(() => { const k = window.__skate!; k.start({ seed: 2 }); k.manual(true); let s = k.step(60); while (s.alive && s.tick < 900) s = k.step(1); });
    await expect(screenOn(page, 'results')).toHaveClass(/\bon\b/, { timeout: 30_000 });
  };
  const slot = page.locator('#screens .offer-slot');
  // Level 5: no run here earns the Level 2 crate, whose reveal would open over Results (in play it is always run 1).
  await editSave(page, "s.stats.runs = 9; s.installDay = '2020-01-01'; s.created = 0; s.xp.level = 5;");
  await crashToResults();
  await expect(slot).toBeHidden();                                   // NullProvider: never ready
  await page.goto('/?debug=1&quality=low&fakeads=1');
  await page.waitForFunction(() => !!window.__skate);
  await editSave(page, "s.stats.runs = 1; s.installDay = '2020-01-01';");
  await crashToResults();
  await expect(slot).toBeHidden();                                   // runs 1–3: never
  await page.evaluate(() => window.__skate!.manual(false));
  await editSave(page, "s.stats.runs = 9; s.installDay = '2020-01-01'; s.daily.lastWarmupDay = null;");
  const before = (await page.evaluate(() => window.__skate!.save.get().wallet.coins));
  await page.evaluate(() => { const k = window.__skate!; k.start({ seed: 1 }); k.manual(true); k.bot('safe'); k.step(3000); k.bot('off'); let s = k.step(1); while (s.alive && s.tick < 4500) s = k.step(1); });
  await expect(screenOn(page, 'results')).toHaveClass(/\bon\b/, { timeout: 30_000 });
  const coins = (await page.evaluate(() => window.__skate!.save.get().wallet.coins));
  const earned = coins - before;
  console.log(`fake ad run: ${earned} coins earned`);
  expect(earned).toBeGreaterThanOrEqual(20);
  {
    await expect(slot).toBeVisible();
    await expect(page.getByRole('button', { name: /roll again/i })).toBeEnabled();   // an offer never delays ROLL AGAIN
    await slot.locator('button').click();
    await expect(slot).toBeHidden({ timeout: 5000 });
    expect((await page.evaluate(() => window.__skate!.save.get().wallet.coins))).toBeGreaterThan(coins);
  }
  expect(errors).toEqual([]);
});
