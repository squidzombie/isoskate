// ui/: DOM HUD, screens, popups, hints, toasts, the lo-fi overlay and the crate reveal (MU; DESIGN §13.8, §17, §18.9;
// TECH §9). Public surface (TECH §4.13): createUi(root) → UiApi.
//   - UI raises intents; game/app.ts decides what happens (TECH §4.12). Menu-to-menu moves go through the App too
//     (Home first where the App only opens screens from Title / Results; see docs/core-requests.md, MU).
//   - Hidden screens are visibility:hidden + inert; during a run every UI element except the pause button is
//     pointer-events:none, so nothing swallows an ollie; toasts never take touches.
//   - Nothing reads layout during a run (a dev-mode guard counts any read: window.__dusklaneUi in debug builds).
//   - The analytics events UI owns (crash, combo_banked, area_reached, hint_shown, shop_view, rewarded_offer_*) go
//     through MetaExt.track into the local ring buffer.
import './styles/base.css';
import './styles/buttons.css';
import './styles/hud.css';
import './styles/screens.css';
import './styles/overlay.css';
import type { Bus } from '../core/bus';
import type { AppEvent, GameEvent } from '../core/events';
import type { AreaId, ScreenId } from '../core/ids';
import type { MetaApi } from '../core/meta';
import type { MonetizationProvider } from '../core/platform';
import type { UiApi, UiIntent } from '../core/ui';
import { isMetaExt, type MetaExt } from '../meta';
import { createMonetization, readFlags } from '../platform';
import { clearMeasureCache } from './fit';
import { crashCause, fmtShort } from './format';
import { createLayoutGuard, type LayoutGuard } from './guard';
import { h } from './h';
import { createHud, type HudExt } from './hud';
import { createModal } from './modal';
import { createLofi } from './overlay';
import { createReveal, type Reveal } from './reveal';
import {
  bootScreen, crashScreen, cratesScreen, pauseScreen, resultsScreen, rewardsScreen, settingsScreen, showcaseScreen, statsScreen, titleScreen,
  type Screen, type ScreenCtx, type ScreenParams, type Sfx,
} from './screens';

/** Menu screens the App opens only from Title / Results (game/app.ts onIntent 'open'). */
const MENUS: ReadonlySet<ScreenId> = new Set<ScreenId>(['locker', 'shop', 'crates', 'stats', 'settings', 'rewards']);
const DT = 1 / 60;

export interface UiExt extends UiApi {
  readonly hud: HudExt;
  /** The real monetization provider (wiring at G3; until then a NullProvider, or the FakeProvider with ?fakeads=1). */
  setMonetization(p: MonetizationProvider): void;
  readonly guard: LayoutGuard;
}

/** Frozen factory (TECH §4.13). The returned object is a UiExt (duck-type `setMonetization` / `guard`). */
export function createUi(root: HTMLElement): UiApi {
  return createUiImpl(root);
}

export function createUiImpl(root: HTMLElement): UiExt {
  const hudEl = root.querySelector<HTMLElement>('#hud') ?? root.appendChild(h('div', { id: 'hud' }));
  const screensEl = root.querySelector<HTMLElement>('#screens') ?? root.appendChild(h('div', { id: 'screens' }));
  const toastsEl = root.querySelector<HTMLElement>('#toasts') ?? root.appendChild(h('div', { id: 'toasts' }));
  const flags = readFlags();
  const guard = createLayoutGuard(flags.debug);
  const listeners = new Set<(i: UiIntent) => void>();
  const raise = (i: UiIntent) => { for (const f of [...listeners]) f(i); };
  const coarse = () => typeof matchMedia !== 'function' || matchMedia('(pointer: coarse)').matches;
  let meta: MetaApi | null = null;
  let appBus: Bus<AppEvent> | null = null;
  let monetization: MonetizationProvider = createMonetization({ fakeAds: flags.fakeAds });   // replaced by setMonetization
  const ext = (): MetaExt | null => (isMetaExt(meta) ? meta : null);
  const track = (e: string, p?: Record<string, string | number | boolean | object>) => ext()?.track(e, p);

  const hud = createHud(hudEl, { raise, coarse, onHint: (id) => track('hint_shown', { hint: id }) });
  const modal = createModal(screensEl);
  const lofi = createLofi(root.querySelector<HTMLElement>('#lofi'));

  // Toasts: informational only (pointer-events:none), at most 2 stacked, below the HUD band.
  const toast = (text: string, ms = 2000) => {
    while (toastsEl.children.length >= 2) toastsEl.firstElementChild?.remove();
    const t = h('div', { class: 'toast' }, text);
    toastsEl.append(t);
    setTimeout(() => t.classList.add('out'), Math.max(200, ms - 220));
    setTimeout(() => t.remove(), ms);
  };

  let current: ScreenId = 'boot';
  let reveal: Reveal | null = null;
  const getReveal = () => (reveal ??= createReveal(ctx));
  const ctx: ScreenCtx = {
    raise, meta: () => meta, ext, emit: (e) => appBus?.emit(e),
    sfx: (s: Sfx) => appBus?.emit({ t: 'ui', sfx: s }),
    go(screen) {
      if (screen === current) return;
      if (current !== 'title' && current !== 'results' && MENUS.has(current)) raise({ k: 'home' });
      raise({ k: 'open', screen });
    },
    current: () => current,
    modal, toast, lofi, monetization: () => monetization, coarse,
  };

  const shownResults = new Set<string>(), toasted = new Set<string>();
  const screens = new Map<ScreenId, Screen>();
  for (const s of [bootScreen(), titleScreen(ctx), crashScreen(), resultsScreen(ctx, { reveal: getReveal, onShown: (id) => shownResults.add(id) }),
    pauseScreen(ctx), showcaseScreen(ctx, 'locker'), showcaseScreen(ctx, 'shop'), settingsScreen(ctx), statsScreen(ctx),
    cratesScreen(ctx, getReveal), rewardsScreen(ctx, getReveal)]) {
    screens.set(s.id, s);
    s.el.inert = true;
    screensEl.insertBefore(s.el, modal.layer);
  }
  let lastCause = '', lastLost = 0, best = 0;

  // HUD columns: measured at boot and on resize only (allowed reads), never per frame.
  const probe = h('div', { class: 'safe-lr', 'aria-hidden': 'true' });
  hudEl.append(probe);
  const relayout = () => guard.allow(() => {
    const cs = typeof getComputedStyle === 'function' ? getComputedStyle(probe) : null;
    hud.relayout(window.innerWidth, parseFloat(cs?.paddingLeft ?? '0') || 0, parseFloat(cs?.paddingRight ?? '0') || 0);
  });
  if (typeof window !== 'undefined') {
    relayout();
    window.addEventListener('resize', relayout);
    void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(() => { clearMeasureCache(); relayout(); });
  }

  // Per-run bookkeeping for the analytics UI owns.
  const run = { banks: 0, bankMax: 0, bankSum: 0, maxLinks: 0, area: 'downtown' as AreaId, tracked: false };

  const ui: UiExt = {
    hud, guard,
    get current() { return current; },
    setMonetization(p) { monetization = p; },
    show(screen, params) {
      const prev = screens.get(current);
      if (current !== screen) { prev?.hide?.(); if (modal.open) modal.close(); }
      current = screen;
      guard.active = screen === 'run';
      if (params?.result) best = Math.max(best, params.result.score);
      for (const [id, s] of screens) {
        const on = id === screen;
        s.el.classList.toggle('on', on);
        s.el.inert = !on;
      }
      root.dataset.screen = screen;
      if (screen !== 'run' && screen !== 'pause' && screen !== 'crash') lofi.set({ neon: false });
      const p: ScreenParams = { ...params, cause: lastCause, lost: lastLost, best };
      screens.get(screen)?.show(p);
    },
    toast,
    attach(game: Bus<GameEvent>, app: Bus<AppEvent>, m: MetaApi) {
      meta = m;
      appBus = app;
      const x = ext();
      if (x) {
        const st = x.data.settings;
        lofi.set({ effects: st.effects, reducedMotion: st.reducedMotion,
          tier: flags.quality ?? (st.quality === 'auto' ? (coarse() ? 'med' : 'high') : st.quality) });
      }
      const offs = [
        game.onAny((e) => hud.onGame(e)),
        game.on('runStart', () => {
          lastCause = ''; lastLost = 0;
          Object.assign(run, { banks: 0, bankMax: 0, bankSum: 0, maxLinks: 0, area: 'downtown', tracked: false });
          lofi.set({ neon: false });
          const d = ext()?.data;
          hud.setFirstRuns(!!d && d.onboarding.runsStarted <= 3);
          // Instant retry: what the last run earned, in the band, gone by 3.0 s (DESIGN §17.3).
          const last = ext()?.lastRun();
          if (last && !shownResults.has(last.runId) && !toasted.has(last.runId)) {
            toasted.add(last.runId);
            const lv = last.levelUps.length ? ` · Level ${last.xp.levelAfter}!` : '';
            const extra = last.rewards.some((r) => r.kind === 'item' || r.kind === 'crate') ? ' · NEW in Locker' : '';
            hud.rewardToast(`+${fmtShort(last.coins.total)} coins · +${fmtShort(last.xp.gained)} XP${lv}${extra}`);
          }
        }),
        game.on('crash', (e) => {
          if (e.god) return;
          lastCause = crashCause(e);
          track('crash', { cause: e.cause, obstacle_kind: e.kind ?? 'none', area: run.area, speed: Math.round(e.speed * 100) / 100,
            t_s: Math.round(e.tick * DT * 10) / 10, state: e.state === 'crashed' ? 'roll' : e.state, flip_progress: e.flipProgress, spin_progress: e.spinProgress });
          if (!run.tracked) { run.tracked = true; track('combo_banked', { count: run.banks, max: run.bankMax, sum: run.bankSum, max_links: run.maxLinks }); }
        }),
        game.on('comboLost', (e) => { lastLost = e.total; }),
        game.on('comboBanked', (e) => { run.banks++; run.bankMax = Math.max(run.bankMax, e.total); run.bankSum += e.total; run.maxLinks = Math.max(run.maxLinks, e.links); }),
        game.on('areaEnter', (e) => {
          run.area = e.area;
          lofi.set({ neon: e.area === 'neon' });
          if (e.tick > 1) track('area_reached', { area: e.area, t_s: Math.round(e.tick * DT * 10) / 10, first_time: !(ext()?.data.postcards.includes(e.area) ?? false) });
        }),
        app.on('quality', (e) => lofi.set({ tier: e.tier })),
      ];
      return () => { for (const off of offs) off(); };
    },
    onIntent(f) { listeners.add(f); return () => { listeners.delete(f); }; },
  };
  if (flags.debug && typeof window !== 'undefined') {
    (window as unknown as { __dusklaneUi?: object }).__dusklaneUi = {
      guard, hudStats: () => hud.stats(), current: () => current, reveal: () => reveal?.result ?? null, modalOpen: () => modal.open,
    };
  }
  return ui;
}

export { crashCause, fmtScore, fmtShort, trickName, areaName } from './format';
export { badLandingPredicted, comboTier, HUD_TIMING, type HudExt } from './hud';
export { HINT_TEXT, REST_MARK_SEC } from './hints';
export { hudColumns, fitPx } from './fit';
export { popupCurve, POPUP } from './popups';
