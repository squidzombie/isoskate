// ui/: DOM HUD, screens, popups and toasts (MU; M0 ships a debug HUD + text screens). Public surface (TECH §4.13).
// UI raises intents; game/app.ts decides what happens. Hidden screens get visibility:hidden + inert.
import './styles/base.css';
import type { ScreenId } from '../core/ids';
import type { Bus } from '../core/bus';
import type { AppEvent, GameEvent } from '../core/events';
import type { MetaApi } from '../core/meta';
import type { UiApi, UiIntent } from '../core/ui';
import { h } from './h';
import { createHud } from './hud';
import { crashScreen, pauseScreen, placeholderScreen, resultsScreen, titleScreen, type Screen, type ScreenParams } from './screens';

/** One-line crash cause (DESIGN §9): "Clipped a trash can", "Flip 62% done — flick earlier". */
export function crashCause(e: Extract<GameEvent, { t: 'crash' }>): string {
  const kind = e.kind ? e.kind.replace(/_/g, ' ') : 'something';
  if (e.cause === 'badLanding' && (e.flipProgress > 0 || e.spinProgress > 0)) {
    const p = Math.round(100 * Math.max(e.flipProgress, e.spinProgress));
    return `${e.flipProgress > 0 ? 'Flip' : 'Spin'} ${p}% done — flick earlier`;
  }
  if (e.cause === 'badLanding') return `Landed on a ${kind}`;
  if (e.cause === 'fall') return 'Fell in the trench';
  if (e.cause === 'splash') return 'Splashed into the fountain';
  return `Clipped a ${kind}`;
}

export function createUi(root: HTMLElement): UiApi {
  const hudEl = root.querySelector<HTMLElement>('#hud') ?? root.appendChild(h('div', { id: 'hud' }));
  const screensEl = root.querySelector<HTMLElement>('#screens') ?? root.appendChild(h('div', { id: 'screens' }));
  const toastsEl = root.querySelector<HTMLElement>('#toasts') ?? root.appendChild(h('div', { id: 'toasts' }));
  const listeners = new Set<(i: UiIntent) => void>();
  const raise = (i: UiIntent) => { for (const f of listeners) f(i); };
  const hud = createHud(hudEl, raise);
  const screens = new Map<ScreenId, Screen>();
  for (const s of [titleScreen(raise), crashScreen(), resultsScreen(raise), pauseScreen(raise),
    placeholderScreen('locker', 'LOCKER', raise), placeholderScreen('shop', 'SHOP', raise),
    placeholderScreen('crates', 'CRATES', raise), placeholderScreen('stats', 'STATS', raise),
    placeholderScreen('settings', 'SETTINGS', raise), placeholderScreen('rewards', 'REWARDS', raise),
    placeholderScreen('boot', 'DUSKLANE', raise)]) {
    screens.set(s.id, s);
    s.el.inert = true;
    screensEl.append(s.el);
  }
  let current: ScreenId = 'boot';
  let lastCause = '';
  let lastLost = 0;

  const ui: UiApi = {
    hud,
    get current() { return current; },
    show(screen, params) {
      current = screen;
      for (const [id, s] of screens) {
        const on = id === screen;
        s.el.classList.toggle('on', on);
        s.el.inert = !on;
      }
      const p: ScreenParams = { ...params, cause: lastCause, lost: lastLost };
      screens.get(screen)?.show(p);
    },
    toast(text, ms = 2000) {
      const t = h('div', { class: 'toast' }, text);
      toastsEl.append(t);
      setTimeout(() => t.remove(), ms);
    },
    attach(game: Bus<GameEvent>, _app: Bus<AppEvent>, meta: MetaApi) {
      const offs = [
        game.on('runStart', () => { lastCause = ''; lastLost = 0; }),
        game.on('crash', (e) => { if (!e.god) { lastCause = crashCause(e); } }),
        game.on('comboLost', (e) => { lastLost = e.total; }),
        game.on('trickScored', (e) => hud.lastTrick(e.id.replace(/([A-Z])/g, ' $1').toUpperCase())),
        game.on('runEnd', () => { void meta; }),
      ];
      return () => { for (const off of offs) off(); };
    },
    onIntent(f) { listeners.add(f); return () => { listeners.delete(f); }; },
  };
  return ui;
}
