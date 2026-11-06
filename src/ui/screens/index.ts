// ui/screens/: M0 text-only screens. Each builds its <section data-screen> once; show() updates text.
// TODO(MU): every DESIGN §17.2 screen.
import type { ScreenId } from '../../core/ids';
import type { RunRewards } from '../../core/meta';
import type { RunResult } from '../../core/sim';
import type { UiIntent } from '../../core/ui';
import { h, setText } from '../h';
import { fmtScore } from '../hud';

export interface ScreenParams { result?: RunResult; rewards?: RunRewards; rotate?: boolean; cause?: string; lost?: number }
export interface Screen { readonly id: ScreenId; readonly el: HTMLElement; show(p: ScreenParams): void }

type Raise = (i: UiIntent) => void;
const btn = (label: string, intent: UiIntent, raise: Raise, cls = '') =>
  h('button', { type: 'button', class: cls, onclick: (e: Event) => { e.stopPropagation(); raise(intent); } }, label);

export function titleScreen(raise: Raise): Screen {
  const el = h('section', { class: 'screen', dataset: { screen: 'title' },
    onclick: () => raise({ k: 'play' }) },
  h('h1', null, 'DUSKLANE'),
  h('div', { class: 'tap' }, 'TAP TO ROLL'),
  h('div', { class: 'spacer' }),
  h('div', { class: 'row' },
    btn('Locker', { k: 'open', screen: 'locker' }, raise), btn('Shop', { k: 'open', screen: 'shop' }, raise),
    btn('Stats', { k: 'open', screen: 'stats' }, raise), btn('Settings', { k: 'open', screen: 'settings' }, raise)));
  return { id: 'title', el, show() { /* static */ } };
}

export function crashScreen(): Screen {
  const cause = h('div', { class: 'line' }, '');
  const lost = h('div', { class: 'line' }, '');
  const tap = h('div', { class: 'tap' }, 'TAP TO ROLL AGAIN');
  const el = h('section', { class: 'screen clear', dataset: { screen: 'crash' } },
    h('div', { class: 'sticker' }, 'BAILED!'), cause, lost, tap);
  return {
    id: 'crash', el,
    show(p) {
      setText(cause, p.cause ?? '');
      setText(lost, p.lost ? `−${fmtScore(p.lost)} lost` : '');
      tap.style.animation = 'none'; void tap.offsetWidth; tap.style.animation = '';   // restart the 0.6 s reveal
    },
  };
}

export function resultsScreen(raise: Raise): Screen {
  const score = h('div', { class: 'big' }, '0');
  const lines = h('div', { class: 'line' }, '');
  const coins = h('div', { class: 'line' }, '');
  const best = h('div', { class: 'line' }, '');
  const el = h('section', { class: 'screen dim', dataset: { screen: 'results' } },
    h('h2', null, 'RESULTS'), score, lines, coins, best, h('div', { class: 'spacer' }),
    btn('Roll again', { k: 'retry' }, raise, 'primary'),
    h('div', { class: 'row' }, btn('Home', { k: 'home' }, raise)));
  return {
    id: 'results', el,
    show(p) {
      const r = p.result;
      setText(score, fmtScore(r?.score ?? 0));
      setText(lines, r ? `${Math.floor(r.distance)} m · ${r.durationS.toFixed(1)} s · tricks ${fmtScore(r.trickPts)}` : '');
      setText(coins, p.rewards ? `+${p.rewards.coins.total} coins · +${p.rewards.xp.gained} XP` : '');
      setText(best, p.rewards?.newBest ? 'NEW BEST!' : '');
    },
  };
}

export function pauseScreen(raise: Raise): Screen {
  const title = h('h2', null, 'PAUSED');
  const note = h('div', { class: 'line' }, '');
  const keys = h('div', { class: 'line', style: 'font-size:13px;opacity:.8' },
    'A/D steer · Space ollie · arrows flip/pick · S manual · Q grab · Esc pause');
  const el = h('section', { class: 'screen dim', dataset: { screen: 'pause' } },
    title, note, btn('Resume', { k: 'resume' }, raise, 'primary'),
    h('div', { class: 'row' }, btn('Restart', { k: 'restart' }, raise), btn('Home', { k: 'home' }, raise)), keys);
  return {
    id: 'pause', el,
    show(p) {
      setText(title, p.rotate ? 'ROTATE TO PORTRAIT' : 'PAUSED');
      setText(note, p.rotate ? 'Dusklane plays in portrait.' : '');
      keys.style.display = matchMedia('(pointer: coarse)').matches ? 'none' : '';
    },
  };
}

export function placeholderScreen(id: ScreenId, label: string, raise: Raise): Screen {
  const el = h('section', { class: 'screen dim', dataset: { screen: id } },
    h('h2', null, label), h('div', { class: 'line' }, 'Coming soon.'), btn('Back', { k: 'home' }, raise));
  return { id, el, show() { /* static */ } };
}
