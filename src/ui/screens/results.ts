// ui/screens/results.ts: Results (DESIGN §17.2, §14). The card slides up in 250 ms; the score counts up over 0.8 s
// (tap the card to skip), "NEW BEST!" when you beat it; breakdown Tricks / Distance / Best Combo / Furthest Area and
// the lost combo struck through; the coin tally (pickups + combos + score coins + warm-up + best) counting up; the XP
// bar with level-up bursts inline; the rewards strip (items, unlock banners, postcards); Crate Meter and wishlist
// bars; ONE next-goal line (under the score, so it is never below the fold); a huge ROLL AGAIN in the thumb zone that
// works from the first frame (nothing here ever delays it), and small Locker / Shop / Home. A crate this run earned
// (the Level 2 "guaranteed Rare skater") opens as the Rewards modal once the XP bar has filled (DESIGN §14.4, §17.1):
// 3 taps, the reveal, "Equip now?", Back to Results. A tap on ROLL AGAIN before that skips it; it then waits on
// the next Title visit. A hidden slot is reserved for the future
// rewarded offer (DESIGN §20): it only appears if the policy allows it AND the provider has an ad ready, which the
// v1 NullProvider never does.
import type { ItemId } from '../../core/ids';
import type { Reward, RunRewards } from '../../core/meta';
import type { RunResult } from '../../core/sim';
import type { CrateResult } from '../../core/meta';
import { isMetaExt, isRewardsExt, meterSpan, pendingReveals, PRICE, xpToNext, type MetaExt, type RunRewardsExt } from '../../meta';
import { TRICK_BOOK } from '../../save';
import { itemArt } from '../art';
import { areaName, fmtScore, trickName } from '../format';
import { h, setText, type Child } from '../h';
import { icon } from '../icons';
import type { Reveal } from '../reveal';
import { bar, btn, coinTag, fmtN, RARITY_LABEL, section, type Screen, type ScreenCtx } from './common';
import { RESULTS_ANIM } from '../ui.config';

export { RESULTS_ANIM };
const ease = (u: number) => 1 - (1 - u) ** 3;

export interface ResultsHooks { reveal(): Reveal; onShown(runId: string): void }

/** Is this rolled result still waiting for its reveal (pending or queued)? */
const stillWaiting = (m: MetaExt, p: CrateResult) =>
  pendingReveals(m.data).some((q) => q.tier === p.tier && q.item === p.item && q.coins === p.coins && q.rarity === p.rarity);

export function resultsScreen(ctx: ScreenCtx, hooks: ResultsHooks): Screen {
  const head = h('div', { class: 'res-head' }, '');
  const score = h('div', { class: 'res-score' }, '0');
  const cell = (label: string) => { const v = h('b', null, '—'); return [h('div', { class: 'cell' }, h('span', null, label), v), v] as const; };
  const [cTricks, vTricks] = cell('Tricks'), [cDist, vDist] = cell('Distance'), [cCombo, vCombo] = cell('Best combo'), [cArea, vArea] = cell('Furthest');
  const lost = h('div', { class: 'res-lost' }, h('s', null, ''), h('span', null, ' combo lost'));
  const coinTotal = h('b', null, '+0');
  const coinChips = h('div', { class: 'coin-chips' });
  const coinRow = h('div', { class: 'res-coins' }, h('i', { class: 'coin-dot big', 'aria-hidden': 'true' }), coinTotal, coinChips);
  const lvBadge = h('span', { class: 'lv-badge' }, 'LV 1');
  const xpBar = bar('xp');
  const xpText = h('span', { class: 'xp-text' }, '');
  const burst = h('div', { class: 'lv-burst', 'aria-live': 'polite' }, '');
  const xpRow = h('div', { class: 'res-xp' }, lvBadge, h('div', { class: 'xp-wrap' }, xpBar.el, xpText), burst);
  const rewards = h('div', { class: 'res-rewards' });
  const meterBar = bar('meter'), wishBar = bar('wish');
  const meterText = h('span', null, ''), wishText = h('span', null, '');
  const meterRow = h('div', { class: 'res-track' }, h('span', { class: 'crate-ico street mini', 'aria-hidden': 'true' }), h('div', { class: 'trk' }, meterText, meterBar.el));
  const wishRow = h('div', { class: 'res-track' }, icon('heartFull', 'trk-heart'), h('div', { class: 'trk' }, wishText, wishBar.el));
  const goal = h('div', { class: 'res-goal' }, '');
  const goalText = h('span', null, '');
  goal.append(h('i', { class: 'goal-arrow', 'aria-hidden': 'true' }, '→'), goalText);
  const offerBtn = btn('', () => void watchOffer(), ctx, 'offer-btn');
  const offer = h('div', { class: 'offer-slot', 'data-placement': 'results_double_coins' }, offerBtn);
  offer.hidden = true;
  const install = h('div', { class: 'install-hint' },
    h('span', null, 'Add Dusklane to your Home Screen: it opens full-screen and keeps your progress safe.'),
    btn('✕', () => { install.hidden = true; ext()?.markInstallHint(); }, ctx, 'x', 'Dismiss', 'back'));
  install.hidden = true;
  const card = h('div', { class: 'res-card' },
    h('div', { class: 'res-top' }, head, score, goal),
    h('div', { class: 'res-body' },
      h('div', { class: 'grid' }, cTricks, cDist, cCombo, cArea), lost, coinRow, xpRow, rewards, meterRow, wishRow, offer, install));
  const roll = btn([h('span', null, 'Roll again')], { k: 'retry' }, ctx, 'primary huge roll');
  const foot = h('div', { class: 'res-foot' }, roll,
    h('div', { class: 'row small-row' }, btn('Locker', () => ctx.go('locker'), ctx, 'small'), btn('Shop', () => ctx.go('shop'), ctx, 'small'),
      btn('Home', { k: 'home' }, ctx, 'small', undefined, 'back')));
  const el = section('results', 'results', card, foot);

  const ext = (): MetaExt | null => { const m = ctx.meta(); return isMetaExt(m) ? m : null; };
  let r: RunResult | null = null, w: RunRewards | null = null, wx: RunRewardsExt | null = null;
  let t0 = 0, raf = 0, skipped = false, levelEmitted = 0, inFlip = false;
  let autoReveal: CrateResult | null = null, autoTimer: ReturnType<typeof setTimeout> | null = null;
  const segs: { level: number; from: number; to: number; toNext: number }[] = [];

  const tallyChip = (label: string, n: number, cls = '') => h('span', { class: `chip ${cls}` }, `${label} `, h('b', null, `+${fmtN(n)}`));

  const rewardRow = (rw: Reward): HTMLElement | null => {
    const m = ext();
    switch (rw.kind) {
      case 'coins': return h('div', { class: 'reward coins' }, coinTag(`+${fmtN(rw.amount)}`), h('span', null, rw.source));
      case 'item': {
        const it = m?.item(rw.id);
        if (!it) return null;
        const img = h('img', { class: 'rw-art', alt: '' }); img.src = itemArt(it);
        const kids: Child[] = [img, h('div', { class: 'rw-txt' }, h('b', null, it.name), h('span', { class: `rar r-${it.rarity}` }, rw.duplicateCoins ? `already owned · +${rw.duplicateCoins} coins` : `${RARITY_LABEL[it.rarity]} · NEW`))];
        if (!rw.duplicateCoins) kids.push(equipButton(it.id));
        return h('div', { class: `reward item r-${it.rarity}` }, ...kids);
      }
      case 'crate': {
        const pending = m?.pendingReveal();
        // The Level 2 crate after its reveal: show what came out of it (with Equip), not the closed crate again.
        if (rw.forced && wx?.pending?.item && m && !stillWaiting(m, wx.pending)) {
          const it = m?.item(wx.pending.item);
          if (it) {
            const img = h('img', { class: 'rw-art', alt: '' }); img.src = itemArt(it);
            return h('div', { class: `reward item r-${it.rarity}` }, img,
              h('div', { class: 'rw-txt' }, h('b', null, it.name), h('span', { class: `rar r-${it.rarity}` }, `${RARITY_LABEL[it.rarity]} · from the Street Crate`)),
              equipButton(it.id));
          }
        }
        const forced = rw.forced?.rarity ? `Guaranteed ${RARITY_LABEL[rw.forced.rarity]} ${rw.forced.slot ?? 'item'} inside!` : '';
        const name = rw.tier === 'pro' ? 'Pro Crate' : rw.tier === 'street' ? 'Street Crate' : 'Cardboard Box';
        const open = pending && pending.tier === rw.tier
          ? btn('Open', () => openPending(), ctx, 'primary small open-crate')
          : btn('Crates', () => ctx.go('crates'), ctx, 'small');
        return h('div', { class: 'reward crate' }, h('span', { class: `crate-ico ${rw.tier}`, 'aria-hidden': 'true' }),
          h('div', { class: 'rw-txt' }, h('b', null, `${rw.count > 1 ? `${rw.count} × ` : ''}${name}`), h('span', null, forced || 'Open it in Crates')), open);
      }
      case 'title': return h('div', { class: 'reward title' }, h('span', { class: 'badge-ico' }, '★'), h('div', { class: 'rw-txt' }, h('b', null, `Title: ${rw.name}`), h('span', null, 'Shown on your profile')));
      case 'badge': return h('div', { class: 'reward title' }, h('span', { class: 'badge-ico' }, '✦'), h('div', { class: 'rw-txt' }, h('b', null, 'Profile badge'), h('span', null, rw.id)));
      default: return null;
    }
  };
  const equipButton = (id: ItemId) => {
    const m = ext();
    const on = m?.data.equipped[m.item(id)?.slot ?? 'skater'] === id;
    const b = btn(on ? 'Equipped' : 'Equip', () => { ctx.meta()?.equip(id); setText(b, 'Equipped'); b.disabled = true; }, ctx, 'small equip');
    b.disabled = on;
    return b;
  };
  const openPending = (auto = false) => {
    const m = ctx.meta();
    const p = m?.pendingReveal();
    if (!p) return;
    const it = p.item ? ext()?.item(p.item) : undefined;
    hooks.reveal().play(p, { equipLabel: it?.slot === 'skater' ? 'Equip now?' : 'Equip', later: auto, onClose: () => { renderRewards(); renderTracks(); } });
  };
  /** The crate this run rolled (wx.pending) opens by itself once, after the XP bar has filled. */
  const scheduleAutoReveal = () => {
    if (!autoReveal || autoTimer) return;
    autoTimer = setTimeout(() => {
      autoTimer = null;
      const m = ext(), p = autoReveal;
      autoReveal = null;
      if (!m || !p || ctx.current() !== 'results' || ctx.modal.open || !stillWaiting(m, p)) return;
      openPending(true);
    }, RESULTS_ANIM.revealDelayMs);
  };
  const banners = (): HTMLElement[] => {
    const m = ext(), out: HTMLElement[] = [];
    if (!wx || !m) return out;
    const cheapest = PRICE.common;
    for (const u of wx.unlocks) {
      const text = u === 'shop' ? (m.data.wallet.coins >= cheapest ? 'Shop open — you can afford a board' : `Shop open — boards from ${fmtN(cheapest)} coins`)
        : u === 'wishlist' ? 'Wishlist: pin one item in the Shop and watch it fill'
          : u === 'crateMeter' ? `Crate Meter: ${kmLeft(m)} to a free crate`
            : `Trick Book: ${m.data.trickBook.length}/${TRICK_BOOK.length} tricks discovered`;
      const go = u === 'shop' || u === 'wishlist' ? btn('Shop', () => ctx.go('shop'), ctx, 'small') : u === 'trickBook' ? btn('Stats', () => ctx.go('stats'), ctx, 'small') : null;
      out.push(h('div', { class: `reward banner ${u}` }, h('span', { class: 'badge-ico' }, '!'), h('div', { class: 'rw-txt' }, h('b', null, text)), go));
    }
    for (const a of wx.postcards) out.push(h('div', { class: 'reward postcard' }, h('span', { class: 'badge-ico' }, '✉'), h('div', { class: 'rw-txt' }, h('b', null, `Postcard: ${areaName(a)}`), h('span', null, 'In Stats'))));
    if (wx.newTricks.length) {
      const names = wx.newTricks.slice(0, 4).map((t) => trickName(t)).join(', ') + (wx.newTricks.length > 4 ? ` +${wx.newTricks.length - 4}` : '');
      out.push(h('div', { class: 'reward tricks' }, h('span', { class: 'badge-ico' }, '✓'), h('div', { class: 'rw-txt' }, h('b', null, `New in the Trick Book: ${names}`), h('span', null, `${wx.trickBookCount}/${TRICK_BOOK.length} discovered`))));
    }
    return out;
  };
  const renderRewards = () => {
    const rows: HTMLElement[] = [];
    for (const rw of w?.rewards ?? []) { const row = rewardRow(rw); if (row) rows.push(row); }
    // A crate rolled earlier and not revealed yet (e.g. Results reopened after a reload).
    const m = ext();
    const p = m?.pendingReveal();
    if (p && !(w?.rewards ?? []).some((x) => x.kind === 'crate')) {
      const n = m?.pendingCount() ?? 1;
      rows.unshift(h('div', { class: 'reward crate' }, h('span', { class: `crate-ico ${p.tier}`, 'aria-hidden': 'true' }),
        h('div', { class: 'rw-txt' }, h('b', null, n > 1 ? `${n} crates are waiting` : 'A crate is waiting'), h('span', null, 'Tap to open it')),
        btn('Open', () => openPending(), ctx, 'primary small open-crate')));
    }
    rows.push(...banners());
    rewards.replaceChildren(...rows);
    rewards.style.display = rows.length ? '' : 'none';
  };
  const kmLeft = (m: MetaExt) => { const left = Math.max(0, m.data.crateMeter.nextAt - m.data.crateMeter.metres); return left >= 1000 ? `${(left / 1000).toFixed(1)} km` : `${Math.round(left)} m`; };

  const renderTracks = () => {
    const m = ext();
    if (!m) { meterRow.style.display = wishRow.style.display = 'none'; return; }
    const meterOn = m.unlocked('crateMeter');
    meterRow.style.display = meterOn ? '' : 'none';
    if (meterOn) {
      const cm = m.data.crateMeter;
      const span = meterSpan(cm.nextAt);
      meterBar.set(1 - (cm.nextAt - cm.metres) / span);
      setText(meterText, `${kmLeft(m)} to a free crate`);
    }
    const wid = m.data.wishlist, it = wid ? m.item(wid) : undefined;
    wishRow.style.display = it && !m.owns(it.id) ? '' : 'none';
    if (it) {
      const need = m.price(it.id).featured ?? m.price(it.id).base, have = Math.min(need, m.data.wallet.coins);
      wishBar.set(have / need);
      setText(wishText, have >= need ? `${it.name}: you can buy it now` : `${it.name} ${fmtN(have)}/${fmtN(need)}`);
    }
  };

  const offerState = { shown: false };
  const renderOffer = () => {
    const m = ext();
    const prov = ctx.monetization();
    const coins = w?.coins.total ?? 0;
    const ok = !!m && !!wx && m.offerEligible('results_double_coins', coins, wx.runId) && prov.isAdReady('results_double_coins');
    offer.hidden = !ok;
    if (ok) {
      setText(offerBtn, `Watch a short ad: +${fmtN(coins)} coins`);
      offerBtn.disabled = false;
      if (!offerState.shown) { offerState.shown = true; m!.track('rewarded_offer_shown', { placement: 'results_double_coins' }); }
    }
  };
  const watchOffer = async () => {
    const m = ext();
    if (!m || !wx) return;
    offerBtn.disabled = true;
    ctx.raise({ k: 'rewarded', placement: 'results_double_coins' });
    m.track('rewarded_offer_accepted', { placement: 'results_double_coins' });
    const out = await ctx.monetization().showRewarded('results_double_coins');
    if (out !== 'rewarded') { offerBtn.disabled = false; return; }
    const n = m.grantOffer('results_double_coins', wx.runId, w?.coins.total ?? 0);
    m.track('rewarded_offer_completed', { placement: 'results_double_coins' });
    if (n > 0) { ctx.emit({ t: 'coinsChanged', coins: m.data.wallet.coins, delta: n }); ctx.toast(`+${fmtN(n)} coins`); }
    offer.hidden = true;
    renderTracks();
  };

  // ── animation (rAF while visible; text + transform writes only) ──
  const frame = () => {
    raf = 0;
    if (!r) return;
    const t = skipped ? 1e9 : performance.now() - t0;
    const us = ease(Math.min(1, t / RESULTS_ANIM.scoreMs));
    setText(score, fmtScore(r.score * us));
    const c = w?.coins.total ?? 0;
    const uc = ease(Math.max(0, Math.min(1, (t - RESULTS_ANIM.coinsAt) / RESULTS_ANIM.coinsMs)));
    setText(coinTotal, `+${fmtN(c * uc)}`);
    coinChips.classList.toggle('on', t >= RESULTS_ANIM.coinsAt);
    // XP: one segment per level crossed.
    let tt = t - RESULTS_ANIM.xpAt, idx = 0;
    while (idx < segs.length - 1 && tt > RESULTS_ANIM.xpMsPerLevel) { tt -= RESULTS_ANIM.xpMsPerLevel; idx++; }
    const s = segs[idx];
    if (s) {
      const u = tt <= 0 ? 0 : ease(Math.min(1, tt / RESULTS_ANIM.xpMsPerLevel));
      const into = s.from + (s.to - s.from) * u;
      xpBar.set(into / s.toNext);
      setText(lvBadge, `LV ${s.level}`);
      setText(xpText, `${fmtN(into)} / ${fmtN(s.toNext)} XP${idx === segs.length - 1 && wx?.held ? ` · +${fmtN(wx.held)} saved for next run` : ''}`);
      if (s.level > levelEmitted && idx > 0) {
        levelEmitted = s.level;
        ctx.emit({ t: 'levelUp', level: s.level });
        setText(burst, `LEVEL ${s.level}!`);
        burst.classList.add('go');
        xpRow.classList.add('leveled');
      }
    }
    const rewardsOn = t >= RESULTS_ANIM.rewardsAt + Math.max(0, segs.length - 1) * RESULTS_ANIM.xpMsPerLevel;
    rewards.classList.toggle('on', rewardsOn);
    if (rewardsOn) scheduleAutoReveal();
    const end = RESULTS_ANIM.rewardsAt + segs.length * RESULTS_ANIM.xpMsPerLevel;
    if (t < end) raf = requestAnimationFrame(frame);
  };
  card.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) return; if (!skipped) { skipped = true; if (!raf) frame(); } });

  return {
    id: 'results', el,
    show(p) {
      r = p.result ?? null; w = p.rewards ?? null; wx = isRewardsExt(w) ? w : null;
      const m = ext();
      skipped = false; levelEmitted = 0; offerState.shown = false;
      if (wx) hooks.onShown(wx.runId);
      inFlip = !inFlip;                                          // restart the slide-up without a layout read
      el.classList.toggle('in-a', inFlip); el.classList.toggle('in-b', !inFlip);
      const best = !!w?.newBest;
      setText(head, best ? 'NEW BEST!' : wx && wx.runIndex > 0 ? `RUN ${wx.runIndex}` : 'RESULTS');
      head.classList.toggle('best', best);
      setText(vTricks, r ? fmtScore(r.trickPts) : '—');
      setText(vDist, r ? `${fmtN(r.distance)} m` : '—');
      setText(vCombo, r ? fmtScore(r.bestCombo) : '—');
      setText(vArea, r ? areaName(r.furthestArea) : '—');
      setText(lost.firstChild as HTMLElement, r?.lostCombo ? `−${fmtScore(r.lostCombo)}` : '');
      lost.style.display = r?.lostCombo ? '' : 'none';
      const c = w?.coins;
      coinChips.replaceChildren(...(c ? [
        tallyChip('pickups', c.pickups),
        c.payouts ? tallyChip('combos', c.payouts) : null,
        c.score ? tallyChip('score', c.score) : null,
        c.warmup ? tallyChip('Warm-up ×2', c.warmup, 'warm') : null,
        c.newBest ? tallyChip('best', c.newBest, 'best') : null,
      ].filter((x): x is HTMLElement => !!x) : []));
      coinRow.style.display = c ? '' : 'none';
      // XP segments: from the level/into before the run to the level/into after, one per level crossed.
      segs.length = 0;
      if (w) {
        const before = wx?.xpBefore ?? { level: w.xp.levelBefore, into: 0, toNext: xpToNext(w.xp.levelBefore) };
        let L = before.level, from = before.into;
        for (const up of wx?.levelUps ?? []) { segs.push({ level: L, from, to: xpToNext(L), toNext: xpToNext(L) }); L = up; from = 0; }
        segs.push({ level: w.xp.levelAfter, from, to: w.xp.intoLevel, toNext: w.xp.toNext });
      }
      xpRow.style.display = w ? '' : 'none';
      xpRow.classList.remove('leveled');
      burst.classList.remove('go');
      setText(burst, '');
      renderRewards();
      rewards.classList.remove('on');
      renderTracks();
      setText(goalText, w?.nextGoal.text ? `Next: ${w.nextGoal.text}` : '');
      goal.style.display = w?.nextGoal.text ? '' : 'none';
      goal.dataset.kind = w?.nextGoal.kind ?? '';
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      autoReveal = wx?.pending && m && stillWaiting(m, wx.pending) ? wx.pending : null;
      // One line per idea: the goal line replaces its own tracker bar.
      if (w?.nextGoal.kind === 'wishlist') wishRow.style.display = 'none';
      if (w?.nextGoal.kind === 'crate') meterRow.style.display = 'none';
      renderOffer();
      const standalone = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
      install.hidden = !(wx?.installHint && m && !m.data.onboarding.installHintShown && !standalone);
      if (!install.hidden) m?.markInstallHint();
      t0 = performance.now();
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
      if (!r) { skipped = true; }
    },
    hide() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      autoReveal = null;
    },
  };
}
