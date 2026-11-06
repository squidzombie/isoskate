// ui/screens/title.ts: Title (DESIGN §17.2). The 3D diorama (WA) shows through. Bungee logo with a sunset fill and an
// ink stroke, "TAP TO ROLL" pulsing every 1.2 s (Space / Enter on desktop), level chip with its XP bar, best score,
// coins, and the bottom tab bar Play / Locker / Shop / Crates / Stats + the Settings gear, with calm badges (NEW items,
// a ready daily gift, crates to open). A tap anywhere outside the bar and the chips plays (the middle of the screen is
// never a button, so a first tap always rolls).
import { GAME_NAME } from '../../core/ids';
import { isMetaExt } from '../../meta';
import { fmtScore } from '../format';
import { icon, type IconName } from '../icons';
import { h, setText } from '../h';
import { bar, btn, coinTag, finePointer, fmtN, section, type Screen, type ScreenCtx } from './common';

export function titleScreen(ctx: ScreenCtx): Screen {
  const best = h('div', { class: 'title-best' }, '');
  const keys = h('div', { class: 'title-keys' }, 'or press Space');
  const lvNum = h('b', null, '1');
  const xp = bar('xp-mini');
  const coins = coinTag('0', 'title-coins');
  const level = h('div', { class: 'title-level', 'aria-label': 'Level' }, h('span', { class: 'lv' }, 'LV'), lvNum, xp.el);
  const badge = (b: HTMLElement) => { const s = h('span', { class: 'tab-badge' }, ''); b.append(s); return s; };
  const tab = (label: string, ic: IconName, screen: 'locker' | 'shop' | 'crates' | 'stats') =>
    btn([icon(ic, 'tab-ico'), h('span', { class: 'tab-label' }, label)], () => ctx.go(screen), ctx, 'tab');
  const locker = tab('Locker', 'shirt', 'locker'), shop = tab('Shop', 'board', 'shop'), crates = tab('Crates', 'gift', 'crates'), stats = tab('Stats', 'star', 'stats');
  const bLocker = badge(locker), bShop = badge(shop), bCrates = badge(crates);
  const play = btn([icon('play', 'tab-ico'), h('span', { class: 'tab-label' }, 'Play')], { k: 'play' }, ctx, 'tab play');
  const gear = btn(icon('gear', 'tab-ico'), () => ctx.go('settings'), ctx, 'tab gear', 'Settings');
  const tabs = h('nav', { class: 'tabs', 'aria-label': 'Menu', onclick: (e: Event) => e.stopPropagation() }, play, locker, shop, crates, stats, gear);
  const top = h('div', { class: 'title-top', onclick: (e: Event) => e.stopPropagation() }, level, coins);
  const logo = h('h1', { class: 'logo', 'aria-label': GAME_NAME }, ...GAME_NAME.toUpperCase().split('').map((ch, i) => h('span', { style: `--i:${i}` }, ch)));
  const el = section('title', 'title',
    top,
    h('div', { class: 'title-hero' }, logo, h('div', { class: 'tagline' }, 'Roll from golden hour into the neon night.')),
    h('div', { class: 'title-mid' }, h('div', { class: 'tap' }, 'TAP TO ROLL'), keys, best),
    h('div', { class: 'spacer' }), tabs);
  el.addEventListener('click', () => ctx.raise({ k: 'play' }));
  return {
    id: 'title', el,
    show(p) {
      const m = ctx.meta();
      const ext = isMetaExt(m) ? m : null;
      const lv = m?.levelInfo();
      setText(lvNum, String(lv?.level ?? 1));
      xp.set(lv ? lv.into / Math.max(1, lv.toNext) : 0);
      const b = Math.max(p.best ?? 0, ext?.data.stats.best ?? 0);
      setText(best, b ? `BEST ${fmtScore(b)}` : '');
      setText(coins.lastChild as HTMLElement, fmtN(ext?.data.wallet.coins ?? 0));
      keys.style.display = finePointer() ? '' : 'none';
      // Badges: calm counts, never timers.
      const unseen = ext?.data.unseen.length ?? 0;
      setText(bLocker, unseen ? 'NEW' : '');
      const gift = !!m?.dailyGiftReady();
      const held = ext ? ext.crateHeld('cardboard') + ext.crateHeld('street') + ext.crateHeld('pro') + (m?.pendingReveal() ? 1 : 0) : 0;
      setText(bCrates, gift ? 'GIFT' : held ? String(held) : '');
      bCrates.classList.toggle('gift', gift);
      setText(bShop, ext && !ext.unlocked('shop') ? 'LV 3' : '');
      bShop.classList.toggle('lock', !!ext && !ext.unlocked('shop'));
    },
  };
}
