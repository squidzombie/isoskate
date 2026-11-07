// ui/screens/showcase.ts: Locker and Shop (DESIGN §16.2, §17.2). The 3D turntable fills the top (game/app.ts puts the
// skater in 'showcase' and the camera in 'locker'); drag there to rotate (UiIntent 'turntable'). Below, a panel with
// Skaters / Boards / Helmets tabs and a 3-column card grid; tapping a card tries it on for free (UiIntent 'preview').
//   Locker: owned items only (+ a "get more" card). Equipping is free and instant.
//   Shop:   every item, always buyable except the L30 board; today's featured row (3 picks, 25% off, "New picks
//           tomorrow", no countdown); pin one item to the wishlist (♥); the shop opens at Level 3; Crates link.
import type { ItemId, Slot } from '../../core/ids';
import type { CosmeticItem } from '../../core/cosmetics';
import { FEATURED, isMetaExt, UNLOCK_LEVEL, type MetaExt } from '../../meta';
import { h, setText } from '../h';
import { icon } from '../icons';
import { PICK_NAME } from '../ui.config';
import { btn, coinTag, fmtN, header, itemCard, RARITY_LABEL, section, SLOT_LABEL, type Screen, type ScreenCtx } from './common';

export function showcaseScreen(ctx: ScreenCtx, id: 'locker' | 'shop'): Screen {
  const shop = id === 'shop';
  let slot: Slot = 'skater';
  let picked: ItemId | null = null;
  const coins = coinTag('0', 'head-coins');
  const grid = h('div', { class: 'card-grid', role: 'list' });
  const featured = h('div', { class: 'featured' });
  const featWrap = h('div', { class: 'feat-wrap' },
    h('div', { class: 'feat-head' }, h('div', null, "Today's picks ", h('b', null, `−${Math.round(FEATURED.discount * 100)}%`)), h('span', null, 'New picks tomorrow')), featured);
  const lockNote = h('div', { class: 'lock-note' }, icon('lock'), h('span', null, `Shop opens at Level ${UNLOCK_LEVEL.shop} · try-ons free`));
  const dName = h('b', { class: 'd-name' }, ''), dRar = h('span', { class: 'd-rar' }, ''), dInfo = h('span', { class: 'd-info' }, '');
  const actBuy = btn('', () => buy(), ctx, 'primary act-buy');
  const actEquip = btn('Equip', () => equip(), ctx, 'primary act-equip');
  const actWish = btn(icon('heart'), () => wish(), ctx, 'act-wish', 'Pin to wishlist', 'toggle');
  const detail = h('div', { class: 'detail' }, h('div', { class: 'd-txt' }, dName, h('div', { class: 'd-sub' }, dRar, dInfo)), actWish, actBuy, actEquip);
  const tabs = h('div', { class: 'seg-tabs', role: 'tablist' });
  for (const s of ['skater', 'board', 'helmet'] as const) {
    const b = btn(SLOT_LABEL[s], () => { slot = s; picked = null; fill(); grid.scrollTop = 0; }, ctx, 'seg-tab', undefined, 'toggle');
    b.dataset.slot = s; b.setAttribute('role', 'tab');
    tabs.append(b);
  }
  const cratesLink = btn(icon('gift'), () => ctx.go('crates'), ctx, 'small crates-link', 'Crates');
  const panel = h('div', { class: 'panel' }, shop ? featWrap : null, shop ? lockNote : null, h('div', { class: 'tab-row' }, tabs, shop ? cratesLink : null), grid, detail);
  // Drag on the turntable area rotates the skater.
  const spin = h('div', { class: 'turn-area', 'aria-label': 'Drag to rotate', role: 'img' }, h('span', { class: 'turn-hint' }, '‹ drag to spin ›'));
  let dragX: number | null = null;
  spin.addEventListener('pointerdown', (e) => { dragX = e.clientX; spin.setPointerCapture?.(e.pointerId); spin.classList.add('drag'); });
  spin.addEventListener('pointermove', (e) => { if (dragX === null) return; ctx.raise({ k: 'turntable', dYaw: (e.clientX - dragX) * 0.6 }); dragX = e.clientX; });
  const endDrag = () => { dragX = null; spin.classList.remove('drag'); };
  spin.addEventListener('pointerup', endDrag); spin.addEventListener('pointercancel', endDrag);
  const el = section(id, `showcase ${id}`, header(shop ? 'SHOP' : 'LOCKER', ctx, coins), spin, panel);

  const ext = (): MetaExt | null => { const m = ctx.meta(); return isMetaExt(m) ? m : null; };
  const items = (m: MetaExt): CosmeticItem[] => m.catalog().filter((c) => c.slot === slot && (shop || m.owns(c.id)));
  const priceOf = (m: MetaExt, it: CosmeticItem) => { const p = m.price(it.id); return p.featured ?? p.base; };
  const footer = (m: MetaExt, it: CosmeticItem) => {
    if (m.data.equipped[it.slot] === it.id) return h('span', { class: 'eq' }, 'EQUIPPED');
    if (m.owns(it.id)) return h('span', { class: 'own' }, shop ? 'OWNED' : '');
    if (it.source === 'level30') return h('span', { class: 'lv30' }, 'LEVEL 30');
    const p = m.price(it.id);
    return p.featured !== null ? h('span', { class: 'price feat' }, h('s', null, fmtN(p.base)), coinTag(fmtN(p.featured))) : coinTag(fmtN(p.base), 'price');
  };
  const pick = (it: CosmeticItem) => {
    picked = it.id;
    ctx.raise({ k: 'preview', id: ext()?.data.equipped[it.slot] === it.id ? null : it.id });
    for (const c of el.querySelectorAll<HTMLElement>('.card')) c.classList.toggle('sel', c.dataset.item === it.id);
    renderDetail();
  };
  const renderDetail = () => {
    const m = ext();
    const it = picked && m ? m.item(picked) : undefined;
    detail.classList.toggle('on', !!it);
    if (!m || !it) { actBuy.style.display = actEquip.style.display = actWish.style.display = 'none'; return; }
    setText(dName, it.name);
    setText(dRar, RARITY_LABEL[it.rarity]);
    dRar.className = `d-rar r-${it.rarity}`;
    const owned = m.owns(it.id), equipped = m.data.equipped[it.slot] === it.id;
    const open = m.unlocked('shop');
    actEquip.style.display = owned ? '' : 'none';
    setText(actEquip, equipped ? 'Equipped' : 'Equip');
    actEquip.disabled = equipped;
    const buyable = shop && !owned && it.source === 'shop';
    actBuy.style.display = buyable ? '' : 'none';
    actWish.style.display = shop && !owned && it.source === 'shop' && m.unlocked('wishlist') ? '' : 'none';
    const wished = m.data.wishlist === it.id;
    actWish.classList.toggle('on', wished);
    actWish.replaceChildren(icon(wished ? 'heartFull' : 'heart'));
    actWish.setAttribute('aria-pressed', String(wished));
    if (buyable) {
      const price = priceOf(m, it);
      actBuy.replaceChildren(open ? coinTag(fmtN(price)) : `LV ${UNLOCK_LEVEL.shop}`);
      actBuy.disabled = !open || m.data.wallet.coins < price;
      actBuy.setAttribute('aria-label', open ? `Buy for ${price} coins` : `Opens at Level ${UNLOCK_LEVEL.shop}`);
      const need = price - m.data.wallet.coins;
      setText(dInfo, !open ? `Opens at Level ${UNLOCK_LEVEL.shop}` : need > 0 ? `${fmtN(need)} more coins` : m.price(it.id).featured !== null ? 'Featured today' : 'Try it on, then buy');
    } else if (it.source === 'level30' && !owned) setText(dInfo, 'Only from Level 30');
    else setText(dInfo, equipped ? 'On your rider now' : owned ? 'Yours · equipping is free' : '');
  };
  const fill = () => {
    const m = ext();
    for (const b of tabs.children) {
      const on = (b as HTMLElement).dataset.slot === slot;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    }
    if (!m) { grid.replaceChildren(); return; }
    setText(coins.lastChild as HTMLElement, fmtN(m.data.wallet.coins));
    const list = items(m);
    if (!picked) picked = m.data.equipped[slot];
    grid.replaceChildren(...list.map((it) => itemCard(it, footer(m, it), {
      onClick: () => { ctx.sfx('tap'); pick(it); }, selected: it.id === picked,
      badge: m.data.unseen.includes(it.id) ? 'NEW' : m.data.wishlist === it.id ? '♥' : null, dim: shop && it.source === 'level30' && !m.owns(it.id),
    })));
    if (!shop) {
      grid.append(h('button', { type: 'button', class: 'card more', onclick: (e: Event) => { e.stopPropagation(); ctx.sfx('tap'); ctx.go('shop'); } },
        h('span', { class: 'more-plus' }, '+'), h('span', { class: 'card-name' }, 'Get more'), h('span', { class: 'card-foot' }, 'Shop · Crates')));
    }
    if (shop) {
      const f = m.featured();
      featured.replaceChildren(...f.map((fid) => { const it = m.item(fid)!; return itemCard(it, footer(m, it), { onClick: () => { ctx.sfx('tap'); slot = it.slot; picked = it.id; fill(); pick(it); } }); }));
      featWrap.style.display = f.length ? '' : 'none';
      fitPickNames();
      lockNote.style.display = m.unlocked('shop') ? 'none' : '';
      panel.classList.toggle('locked', !m.unlocked('shop'));
    }
    renderDetail();
  };
  /** A long single word ("Stickerbomb", "Sunflower") never breaks mid-word in a narrow pick card: that name shrinks a
   *  little instead. Measured in the DOM (letter-spacing included) with a hidden probe: a menu screen, never a run. */
  const fitPickNames = () => {
    const names = [...featured.querySelectorAll<HTMLElement>('.card-name')];
    const colW = names[0]?.clientWidth ?? 0;
    if (!colW) return;
    const probe = h('span', { 'aria-hidden': 'true', style: 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap' });
    for (const n of names) {
      const words = (n.textContent ?? '').split(/\s+/).filter(Boolean);
      n.style.fontSize = '';
      n.append(probe);
      let widest = 0;
      for (const w of words) { probe.textContent = w; widest = Math.max(widest, probe.getBoundingClientRect().width); }
      probe.remove();
      if (widest > colW) n.style.fontSize = `${Math.max(PICK_NAME.minPx, Math.floor((PICK_NAME.px * colW * 0.97 / widest) * 10) / 10)}px`;
    }
  };
  const buy = () => {
    const m = ext();
    if (!m || !picked) return;
    const it = m.item(picked)!;
    const price = priceOf(m, it);
    if (!m.buy(picked)) { ctx.sfx('error'); return; }
    ctx.emit({ t: 'purchase', id: picked, price });
    ctx.emit({ t: 'coinsChanged', coins: m.data.wallet.coins, delta: -price });
    ctx.toast(`${it.name} is yours`);
    fill();
  };
  const equip = () => {
    const m = ext();
    if (!m || !picked) return;
    m.equip(picked);
    ctx.raise({ k: 'preview', id: null });
    fill();
  };
  const wish = () => {
    const m = ext();
    if (!m || !picked) return;
    m.setWishlist(m.data.wishlist === picked ? null : picked);
    fill();
  };
  return {
    id, el,
    show() {
      picked = null;
      fill();
      grid.scrollTop = 0;                                        // a fresh visit starts at the top of the list
      if (shop) ext()?.track('shop_view', { item: 'shop', rarity: 'none', price: 0, featured: false });
    },
    hide() { if (!shop) { const m = ext(); if (m) m.markSeen(m.data.unseen.filter((u) => m.item(u)?.slot === slot)); } },
  };
}
