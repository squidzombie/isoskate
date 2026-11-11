// ui/reveal.ts: the crate reveal (DESIGN §16.3 "Reveal"). The result is already rolled and written to the save
// (MetaApi.openCrate) before this plays, so a refresh resumes the same result at the closed crate.
//   1. Tap the crate 3 times: it shakes harder each time (AppEvent crateShake n → a note 2 semitones higher).
//   2. The tape rips and the lid pops; a light beam shows the rarity colour (Common cream, Rare teal-blue, Epic violet,
//      Legendary an animated gold-to-pink gradient). The reveal is acknowledged here (MetaApi.ackReveal grants what is
//      inside: until now the item was in the crate, not in the Locker), then crateReveal → the stinger.
//   3. The item rises spinning with a "NEW!" badge, or a "DUPLICATE" stamp that shatters into coins flying to the
//      counter. Buttons: Equip / Open another / Back.
//   After the first reveal ever, a tap skips the animation. A reveal that opened by itself (`later`) offers "Later"
//   while the crate is still closed; the result stays pending and comes back on the next visit.
// Polish: light leaks from the crate's seam as it is shaken (warm white, then the rarity colour on tap 2); the
// box squashes and pops; a flash ring and slow sun rays behind the item; sparkles scaled by rarity; the coin total
// counts up. Transform/opacity only (compositor-friendly on phones). Reduce Motion (the OS query or Settings › Reduce
// motion / Reduce effects) keeps the colours and drops the movement (`.calm`).
import type { CrateTier } from '../core/ids';
import type { CrateResult } from '../core/meta';
import { isMetaExt } from '../meta';
import { itemArt } from './art';
import { h, setText } from './h';
import { btn, coinTag, fmtN, RARITY_LABEL, type ScreenCtx } from './screens/common';
import { REVEAL } from './ui.config';

export { REVEAL };
const TIER_NAME: Readonly<Record<CrateTier, string>> = { cardboard: 'Cardboard Box', street: 'Street Crate', pro: 'Pro Crate' };

export interface RevealOptions { onClose?: () => void; onEquip?: (id: string) => void; equipLabel?: string; later?: boolean }
export interface Reveal {
  readonly el: HTMLElement; play(res: CrateResult, o?: RevealOptions): void; readonly result: CrateResult | null;
  /** The player chose "Later" for this result in this session (nothing opens it by itself again until a reload). */
  wasPostponed(res: CrateResult): boolean;
}
const keyOf = (r: CrateResult) => `${r.tier}|${r.rarity}|${r.item ?? ''}|${r.coins}|${r.dup}`;

export function createReveal(ctx: ScreenCtx): Reveal {
  const tierName = h('div', { class: 'rv-tier' }, '');
  const dots = h('div', { class: 'rv-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
  const hint = h('div', { class: 'rv-hint' }, 'TAP TO OPEN');
  const crate = h('button', { type: 'button', class: 'rv-crate', 'aria-label': 'Tap the crate to open it' },
    h('span', { class: 'rv-seam' }), h('span', { class: 'rv-lid' }), h('span', { class: 'rv-body' }, h('span', { class: 'rv-tape' }), h('span', { class: 'rv-mark' }, '?')));
  const beam = h('div', { class: 'rv-beam', 'aria-hidden': 'true' });
  const rays = h('div', { class: 'rv-rays', 'aria-hidden': 'true' });
  const flash = h('div', { class: 'rv-flash', 'aria-hidden': 'true' });
  // Sparkles: 16 fixed directions and reaches (no randomness: the same crate always looks the same); rarity shows more.
  const sparks = h('div', { class: 'rv-sparks', 'aria-hidden': 'true' }, ...Array.from({ length: 16 }, (_, i) =>
    h('i', { style: `--a:${i * 22.5 + (i % 2) * 9}deg;--r:${96 + ((i * 37) % 64)}px;--d:${(i % 4) * 45}ms;--s:${(0.7 + ((i * 7) % 5) * 0.12).toFixed(2)}` })));
  const art = h('img', { class: 'rv-art', alt: '', draggable: 'false' });
  const band = h('span', { class: 'card-band' }, '');
  const name = h('div', { class: 'rv-name' }, '');
  const stamp = h('div', { class: 'rv-stamp' }, '');
  const shards = h('div', { class: 'rv-shards', 'aria-hidden': 'true' }, ...Array.from({ length: 12 }, (_, i) => h('i', { style: `--a:${i * 30}deg;--d:${(i % 3) * 60}ms` })));
  const coinsBig = h('div', { class: 'rv-coins' }, '');
  const card = h('div', { class: 'rv-card' }, band, art, name, stamp);
  const item = h('div', { class: 'rv-item' }, card, coinsBig, shards);
  const equipBtn = btn('Equip', () => equip(), ctx, 'primary rv-equip');
  const againBtn = btn('Open another', () => again(), ctx, 'rv-again');
  const backBtn = btn('Back', () => close(), ctx, 'rv-back', undefined, 'back');
  const actions = h('div', { class: 'rv-actions' }, equipBtn, h('div', { class: 'row' }, againBtn, backBtn));
  const postponed = new Set<string>();
  const laterBtn = btn('Later', () => { if (res) postponed.add(keyOf(res)); close(); }, ctx, 'rv-later', 'Open it later', 'back');
  const el = h('div', { class: 'reveal', dataset: { stage: 'closed' } }, tierName, h('div', { class: 'rv-stage' }, rays, beam, flash, crate, sparks, item), dots, hint, laterBtn, actions);

  let res: CrateResult | null = null, opts: RevealOptions = {};
  let taps = 0, stage: 'closed' | 'opening' | 'item' | 'done' = 'closed', timers: ReturnType<typeof setTimeout>[] = [];
  let skippable = false, raf = 0;
  const clear = () => { for (const t of timers) clearTimeout(t); timers = []; if (raf) cancelAnimationFrame(raf); raf = 0; };
  const calm = () => ctx.lofi.state.reducedMotion || !ctx.lofi.state.effects
    || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const coinText = () => (coinsBig.querySelector('.coins-tag')?.lastChild ?? null) as Text | null;
  /** The coin total counts up from 0 as the item rises (ease-out); skipping or Reduce Motion shows the total at once. */
  const countUp = () => {
    const t = coinText(), n = res?.coins ?? 0;
    if (!t || n <= 0 || calm() || typeof requestAnimationFrame !== 'function') return;
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / REVEAL.countMs);
      t.data = `+${fmtN(Math.round(n * (1 - (1 - u) ** 3)))}`;
      raf = u < 1 ? requestAnimationFrame(step) : 0;
    };
    t.data = '+0';
    raf = requestAnimationFrame(step);
  };
  const setStage = (s: typeof stage) => { stage = s; el.dataset.stage = s; };
  const ext = () => { const m = ctx.meta(); return isMetaExt(m) ? m : null; };

  const finish = () => {
    clear();
    setStage('done');
    const m = ext();
    if (!res) return;
    const t = coinText();
    if (t) t.data = `+${fmtN(res.coins)}`;
    const canEquip = !!res.item && !res.dup && !!m?.owns(res.item);
    equipBtn.style.display = canEquip ? '' : 'none';
    setText(equipBtn, opts.equipLabel ?? 'Equip');
    equipBtn.disabled = false;
    const held = m?.crateHeld(res.tier) ?? 0;
    againBtn.style.display = held > 0 ? '' : 'none';
    setText(againBtn, held > 1 ? `Open another (${held})` : 'Open another');
    actions.classList.add('on');
  };
  const open = () => {
    if (!res) return;
    setStage('opening');
    const x = ext();
    const coinsBefore = x?.data.wallet.coins ?? 0;
    ctx.meta()?.ackReveal();                          // opened now: granted, and a later visit won't replay it
    ctx.emit({ t: 'crateReveal', tier: res.tier, rarity: res.rarity === 'coins' ? 'common' : res.rarity, dup: res.dup });
    if (res.item && !res.dup) { const it = x?.item(res.item); if (it) ctx.emit({ t: 'itemGranted', id: it.id, rarity: it.rarity, duplicateCoins: 0 }); }
    const coinsAfter = x?.data.wallet.coins ?? coinsBefore;
    if (coinsAfter !== coinsBefore) ctx.emit({ t: 'coinsChanged', coins: coinsAfter, delta: coinsAfter - coinsBefore });
    timers.push(setTimeout(() => { setStage('item'); countUp(); }, REVEAL.lidMs));
    timers.push(setTimeout(finish, REVEAL.lidMs + REVEAL.riseMs + (res.dup ? REVEAL.coinsMs * 0.5 : 0)));
  };
  const onTap = (e: Event) => {
    e.stopPropagation();
    if (stage === 'closed') {
      taps++;
      ctx.emit({ t: 'crateShake', n: Math.min(3, taps) as 1 | 2 | 3 });
      crate.classList.remove('sh1', 'sh2', 'sh3');
      crate.classList.add(`sh${Math.min(3, taps)}`);
      for (let i = 0; i < dots.children.length; i++) dots.children[i]!.classList.toggle('on', i < taps);
      if (taps >= REVEAL.taps) open();
    } else if ((stage === 'opening' || stage === 'item') && skippable) finish();
  };
  crate.addEventListener('click', onTap);
  el.addEventListener('click', (e) => { if (stage !== 'closed' && stage !== 'done') onTap(e); e.stopPropagation(); });

  const equip = () => {
    if (!res?.item) return;
    ctx.meta()?.equip(res.item);
    opts.onEquip?.(res.item);
    setText(equipBtn, 'Equipped ✓');
    equipBtn.disabled = true;
  };
  const again = () => {
    const m = ctx.meta();
    if (!res || !m) return;
    const next = m.openCrate(res.tier);
    if (next.item === null && next.coins === 0 && next.rarity === 'coins') return;
    reveal.play(next, { ...opts, later: false });
  };
  const close = () => { clear(); ctx.modal.close(); };

  const reveal: Reveal = {
    el,
    get result() { return res; },
    wasPostponed: (r) => postponed.has(keyOf(r)),
    play(r, o = {}) {
      clear();
      res = r; opts = o; taps = 0;
      const m = ext();
      skippable = (m?.data.crates.opened ?? 0) > 1 || (m?.data.crates.opened === 1 && !m.pendingReveal());
      el.dataset.tier = r.tier;
      el.dataset.rarity = r.rarity;
      el.dataset.item = r.item ?? '';
      el.classList.toggle('dup', r.dup);
      el.classList.toggle('can-later', !!o.later);
      setText(tierName, TIER_NAME[r.tier]);
      crate.classList.remove('sh1', 'sh2', 'sh3');
      for (const d of dots.children) d.classList.remove('on');
      actions.classList.remove('on');
      const it = r.item ? m?.item(r.item) : undefined;
      if (it) {
        art.src = itemArt(it);
        setText(band, RARITY_LABEL[it.rarity]);
        setText(name, it.name);
        card.className = `rv-card r-${it.rarity}`;
        card.style.display = '';
      } else card.style.display = 'none';
      setText(stamp, r.dup ? 'DUPLICATE' : r.item ? 'NEW!' : '');
      coinsBig.replaceChildren(...(r.coins > 0 ? [coinTag(`+${fmtN(r.coins)}`, 'big')] : []));
      // The buttons the result will offer take their space now (hidden until done), so nothing jumps when they appear.
      equipBtn.style.display = r.item && !r.dup ? '' : 'none';
      againBtn.style.display = (m?.crateHeld(r.tier) ?? 0) > 0 ? '' : 'none';
      el.classList.toggle('calm', calm());
      setStage('closed');
      ctx.modal.show(el, { cls: 'reveal-modal', dismissable: false, onClose: () => { clear(); opts.onClose?.(); } });
    },
  };
  return reveal;
}
