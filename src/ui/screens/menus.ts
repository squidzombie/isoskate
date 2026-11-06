// ui/screens/menus.ts: Boot and the Rewards screen.
//   Boot: the procedural logo on paper behind a progress bar (DESIGN §17.2; WebGL / AudioContext checks are INT's).
//   Rewards: the rewards modal content on its own (DESIGN §17.1: "only when an item or crate was earned"); Results
//   shows the same reveal as a modal over itself. Opened directly (debug ui('rewards')), it resumes a pending crate
//   reveal, or lists the items still marked NEW.
import { GAME_NAME } from '../../core/ids';
import { isMetaExt } from '../../meta';
import { h, setText } from '../h';
import type { Reveal } from '../reveal';
import { btn, header, itemCard, section, type Screen, type ScreenCtx } from './common';

export function bootScreen(): Screen {
  const el = section('boot', 'paper boot', h('h1', { class: 'logo', 'aria-label': GAME_NAME }, GAME_NAME.toUpperCase()), h('div', { class: 'bar boot-bar' }, h('i')));
  return { id: 'boot', el, show() { /* static */ } };
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
