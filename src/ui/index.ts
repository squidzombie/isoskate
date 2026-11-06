// ui/: DOM HUD, screens, popups and toasts (MU; M0 ships the debug HUD and stub screens). Public surface (TECH §4.13).
// UI raises intents; game/app.ts decides what happens. Hidden screens get visibility:hidden + inert; during a run
// every UI element except the pause button is pointer-events:none, so nothing swallows an ollie.
import './styles/base.css';
import './styles/hud.css';
import './styles/screens.css';
import type { ScreenId } from '../core/ids';
import type { Bus } from '../core/bus';
import type { AppEvent, GameEvent } from '../core/events';
import type { MetaApi } from '../core/meta';
import type { UiApi, UiIntent } from '../core/ui';
import { crashCause, trickName } from './format';
import { h } from './h';
import { createHud, type HudExt } from './hud';
import {
  bootScreen, crashScreen, pauseScreen, placeholderScreen, resultsScreen, settingsScreen, showcaseScreen, statsScreen, titleScreen,
  type Screen, type ScreenCtx, type ScreenParams,
} from './screens';

export function createUi(root: HTMLElement): UiApi {
  const hudEl = root.querySelector<HTMLElement>('#hud') ?? root.appendChild(h('div', { id: 'hud' }));
  const screensEl = root.querySelector<HTMLElement>('#screens') ?? root.appendChild(h('div', { id: 'screens' }));
  const toastsEl = root.querySelector<HTMLElement>('#toasts') ?? root.appendChild(h('div', { id: 'toasts' }));
  const listeners = new Set<(i: UiIntent) => void>();
  const raise = (i: UiIntent) => { for (const f of listeners) f(i); };
  const hud: HudExt = createHud(hudEl, raise);
  let meta: MetaApi | null = null;
  const ctx: ScreenCtx = { raise, meta: () => meta };
  const screens = new Map<ScreenId, Screen>();
  for (const s of [bootScreen(), titleScreen(ctx), crashScreen(), resultsScreen(ctx), pauseScreen(ctx),
    showcaseScreen(ctx, 'locker', 'LOCKER'), showcaseScreen(ctx, 'shop', 'SHOP'), settingsScreen(ctx), statsScreen(ctx),
    placeholderScreen('crates', 'CRATES', ctx, 'Mystery crates arrive with Meta/UI.'),
    placeholderScreen('rewards', 'REWARDS', ctx, 'Rewards arrive with Meta/UI.')]) {
    screens.set(s.id, s);
    s.el.inert = true;
    screensEl.append(s.el);
  }
  let current: ScreenId = 'boot';
  let lastCause = '', lastLost = 0, best = 0;

  const ui: UiApi = {
    hud,
    get current() { return current; },
    show(screen, params) {
      current = screen;
      if (params?.result) best = Math.max(best, params.result.score);
      for (const [id, s] of screens) {
        const on = id === screen;
        s.el.classList.toggle('on', on);
        s.el.inert = !on;
      }
      root.dataset.screen = screen;
      const p: ScreenParams = { ...params, cause: lastCause, lost: lastLost, best };
      screens.get(screen)?.show(p);
    },
    toast(text, ms = 2000) {
      const t = h('div', { class: 'toast' }, text);
      toastsEl.append(t);
      setTimeout(() => t.remove(), ms);
    },
    attach(game: Bus<GameEvent>, _app: Bus<AppEvent>, m: MetaApi) {
      meta = m;
      const offs = [
        game.on('runStart', () => { lastCause = ''; lastLost = 0; }),
        game.on('crash', (e) => { if (!e.god) lastCause = crashCause(e); }),
        game.on('comboLost', (e) => { lastLost = e.total; }),
        game.on('trickScored', (e) => { if (e.id !== 'ollie') hud.lastTrick(trickName(e.id).toUpperCase()); }),
        game.on('flipStart', (e) => hud.popup(trickName(e.id), 'flip', true)),
        game.on('flipUpgrade', (e) => hud.popup(trickName(e.to), 'flip', true)),
        game.on('spinStart', (e) => hud.popup(trickName(e.id), 'flip', true)),
        game.on('grindStart', (e) => hud.popup(e.perfect ? `${trickName(e.id)} · PERFECT LOCK` : trickName(e.id), 'grind')),
        game.on('manualStart', (e) => hud.popup(trickName(e.kind), 'manual')),
        game.on('land', (e) => { if (e.quality === 'perfect') hud.popup('PERFECT', 'perfect'); else if (e.quality === 'sketchy') hud.popup('SKETCHY', 'sketchy'); }),
        game.on('nearMiss', () => hud.popup('CLOSE!', 'bonus')),
        game.on('bonus', (e) => hud.popup(e.name, e.id === 'gap' || e.id === 'transfer' ? 'gap' : 'bonus')),
      ];
      return () => { for (const off of offs) off(); };
    },
    onIntent(f) { listeners.add(f); return () => { listeners.delete(f); }; },
  };
  return ui;
}

export { crashCause, fmtScore, fmtShort, trickName } from './format';
export { badLandingPredicted, comboTier } from './hud';
