// ui/screens/menus.ts: Boot and the Rewards screen.
//   Boot: the wordmark on the space backdrop over a progress bar and one loading line (DESIGN §17.2, BRAND §3.4;
//   WebGL / AudioContext checks are INT's).
//   Rewards: the rewards modal content on its own (DESIGN §17.1: "only when an item or crate was earned"); Results
//   shows the same reveal as a modal over itself. Opened directly (debug ui('rewards')), it resumes a pending crate
//   reveal, or lists the items still marked NEW.
import { isMetaExt } from '../../meta';
import { h, setText } from '../h';
import { logoEl } from '../logo';
import type { Reveal } from '../reveal';
import { btn, header, itemCard, section, type Screen, type ScreenCtx } from './common';

/** The boot's loading lines (THEME §9), one at a time. */
export const BOOT_LINES = ['Waxing the ledges…', 'Listening for birds…', 'Finding the smoothest street…'] as const;

export function bootScreen(): Screen {
  const line = h('div', { class: 'boot-line', role: 'status' }, BOOT_LINES[0]);
  const el = section('boot', 'boot', logoEl(), h('div', { class: 'bar boot-bar' }, h('i')), line);
  let n = 0, timer: ReturnType<typeof setInterval> | null = null;
  return {
    id: 'boot', el,
    show() { if (!timer) timer = setInterval(() => setText(line, BOOT_LINES[++n % BOOT_LINES.length]!), 1600); },
    hide() { if (timer) { clearInterval(timer); timer = null; } },
  };
}

export function rewardsScreen(ctx: ScreenCtx, getReveal: () => Reveal): Screen {
  const title = h('div', { class: 'rw-title' }, '');
  const list = h('div', { class: 'card-grid' });
  const open = btn('Open crate', () => play(), ctx, 'primary');
  const el = section('rewards', 'rewards', header('REWARDS', ctx), h('div', { class: 'scroll' }, title, open, list));
  const play = () => { const p = ctx.meta()?.pendingReveal(); if (p) getReveal().play(p, { onClose: () => render() }); };
  const render = () => {
    const m = ctx.meta();
    const ext = isMetaExt(m) ? m : null;
    const pending = m?.pendingReveal();
    open.style.display = pending ? '' : 'none';
    const fresh = ext ? ext.data.unseen.map((id) => ext.item(id)).filter((x) => !!x) : [];
    setText(title, pending ? 'A crate is waiting for you' : fresh.length ? 'New in your Locker' : 'Nothing new right now. Go roll!');
    list.replaceChildren(...fresh.map((it) => itemCard(it!, ext!.data.equipped[it!.slot] === it!.id ? 'EQUIPPED' : 'NEW', {
      onClick: () => { ext!.equip(it!.id); ctx.sfx('tap'); render(); } })));
  };
  return { id: 'rewards', el, show() { render(); if (ctx.meta()?.pendingReveal()) play(); } };
}
