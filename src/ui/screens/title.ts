// ui/screens/title.ts: Title at stub fidelity (DESIGN §17.2): Bungee logo with a sunset fill and ink stroke over the
// street preview, "TAP TO ROLL" pulsing every 1.2 s (Space / Enter on desktop), best score and level, and the bottom
// tab bar (Play / Locker / Shop / Crates / Stats + the Settings gear). A tap anywhere outside the tab bar plays.
import { h, setText } from '../h';
import { fmtScore } from '../format';
import { btn, finePointer, section, type Screen, type ScreenCtx } from './common';

export function titleScreen(ctx: ScreenCtx): Screen {
  const { raise } = ctx;
  const best = h('div', { class: 'best' }, '');
  const keys = h('div', { class: 'keys' }, 'or press Space');
  const tabs = h('nav', { class: 'tabs', 'aria-label': 'Menu', onclick: (e: Event) => e.stopPropagation() },
    btn('Play', { k: 'play' }, raise, 'tab primary'),
    btn('Locker', { k: 'open', screen: 'locker' }, raise, 'tab'),
    btn('Shop', { k: 'open', screen: 'shop' }, raise, 'tab'),
    btn('Crates', { k: 'open', screen: 'crates' }, raise, 'tab'),
    btn('Stats', { k: 'open', screen: 'stats' }, raise, 'tab'),
    btn('⚙', { k: 'open', screen: 'settings' }, raise, 'tab gear', 'Settings'));
  const el = section('title', '',
    h('h1', { class: 'logo' }, 'DUSKLANE'),
    h('div', { class: 'tagline' }, 'Roll from golden hour into the neon night.'),
    h('div', { class: 'tap' }, 'TAP TO ROLL'), keys, best,
    h('div', { class: 'spacer' }), tabs);
  el.addEventListener('click', () => raise({ k: 'play' }));
  return {
    id: 'title', el,
    show(p) {
      const lv = ctx.meta()?.levelInfo().level;
      setText(best, [p.best ? `BEST ${fmtScore(p.best)}` : '', lv ? `LV ${lv}` : ''].filter(Boolean).join('  ·  '));
      keys.style.display = finePointer() ? '' : 'none';
    },
  };
}
