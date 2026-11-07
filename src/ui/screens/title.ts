// ui/screens/title.ts: Title (DESIGN §17.2, BRAND §3). The Earth-in-space scene shows through. The Bungee wordmark
// (ui/logo.ts) over the Earth's limb, the tagline on a night chip, "TAP TO ROLL" as a pulsing moss pill (Space / Enter on desktop), level chip with its XP bar, best score,
// coins, and the bottom tab bar Play / Locker / Shop / Crates / Stats + the Settings gear, with calm badges (NEW items,
// a ready daily gift, crates to open). A tap anywhere outside the bar and the chips plays (the middle of the screen is
// never a button, so a first tap always rolls). A crate reveal still waiting (the Level 2 crate after an instant retry,
// or a reveal interrupted by a reload) opens by itself once per session, with "Later".
import { isMetaExt, UNLOCK_LEVEL } from '../../meta';
import { fmtScore } from '../format';
import { icon, type IconName } from '../icons';
import { h, setText } from '../h';
import { logoEl } from '../logo';
import type { Reveal } from '../reveal';
import { TITLE } from '../ui.config';
import { bar, btn, coinTag, finePointer, fmtN, section, type Screen, type ScreenCtx } from './common';

export function titleScreen(ctx: ScreenCtx, getReveal?: () => Reveal): Screen {
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
  const logo = logoEl();
  const el = section('title', 'title',
    top,
    h('div', { class: 'title-hero' }, logo, h('div', { class: 'tagline' }, 'The city’s quiet. The streets are\u00a0yours.')),
    h('div', { class: 'title-mid' }, h('div', { class: 'tap' }, 'TAP TO ROLL'), keys, best),
    h('div', { class: 'spacer' }), tabs);
  el.addEventListener('click', () => ctx.raise({ k: 'play' }));
  const autoShown = new Set<string>();
  let autoTimer: ReturnType<typeof setTimeout> | null = null;
  let last: Parameters<Screen['show']>[0] = {};
  const autoReveal = () => {
    const m = ctx.meta();
    const x = isMetaExt(m) ? m : null;
    const p = m?.pendingReveal();
    if (!getReveal || !p || !x || getReveal().wasPostponed(p)) return;
    const key = `${JSON.stringify(p)}|${x.data.crates.opened}`;
    if (autoShown.has(key) || autoTimer) return;
    autoTimer = setTimeout(() => {
      autoTimer = null;
      const q = ctx.meta()?.pendingReveal();
      if (ctx.current() !== 'title' || ctx.modal.open || !q || JSON.stringify(q) !== JSON.stringify(p)) return;
      autoShown.add(key);
      const it = q.item ? x.item(q.item) : undefined;
      getReveal().play(q, { later: true, equipLabel: it?.slot === 'skater' ? 'Equip now?' : 'Equip', onClose: () => screen.show(last) });
    }, TITLE.revealDelayMs);
  };
  const screen: Screen = {
    id: 'title', el,
    hide() { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } },
    show(p) {
      last = p;
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
      const held = ext ? ext.crateHeld('cardboard') + ext.crateHeld('street') + ext.crateHeld('pro') + ext.pendingCount() : 0;
      setText(bCrates, gift ? 'GIFT' : held ? String(held) : '');
      bCrates.classList.toggle('gift', gift);
      setText(bShop, ext && !ext.unlocked('shop') ? `LV ${UNLOCK_LEVEL.shop}` : '');
      bShop.classList.toggle('lock', !!ext && !ext.unlocked('shop'));
      autoReveal();
    },
  };
  return screen;
}
