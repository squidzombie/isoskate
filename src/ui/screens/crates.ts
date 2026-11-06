// ui/screens/crates.ts: Mystery crates (DESIGN §16.3). Coins only, odds ALWAYS visible on this screen, pity counters
// shown ("Epic+ guaranteed within 4"), the free daily Cardboard gift (one per local day, at most one held, no streaks,
// no penalty for missed days). Buying needs the shop (Level 3). Opening rolls and writes the result to the save
// before the reveal (MetaApi.openCrate); an unfinished reveal resumes here on the next visit.
import type { CrateTier } from '../../core/ids';
import { isMetaExt, type MetaExt } from '../../meta';
import { h, setText } from '../h';
import type { Reveal } from '../reveal';
import { btn, coinTag, fmtN, header, section, type Screen, type ScreenCtx } from './common';

const TIERS: readonly { tier: CrateTier; name: string; blurb: string }[] = [
  { tier: 'cardboard', name: 'Cardboard Box', blurb: 'Free once a day: 60–120 coins or an item' },
  { tier: 'street', name: 'Street Crate', blurb: 'Every rarity' },
  { tier: 'pro', name: 'Pro Crate', blurb: 'Rare or better' },
];
const ODDS_LABEL: Readonly<Record<string, string>> = { coins: 'Coins', common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const pct = (p: number) => `${(p * 100).toFixed(p < 0.01 ? 1 : p < 0.1 ? 1 : 0).replace(/\.0$/, '')}%`;

export function cratesScreen(ctx: ScreenCtx, getReveal: () => Reveal): Screen {
  const coins = coinTag('0', 'head-coins');
  const resume = h('div', { class: 'resume-banner' }, h('b', null, 'A crate is waiting for you'), btn('Open', () => resumeReveal(), ctx, 'primary small'));
  const list = h('div', { class: 'crate-list' });
  const note = h('div', { class: 'crate-note' }, 'Odds are per crate. A duplicate only appears once you own the whole rarity, and turns into coins.');
  const el = section('crates', 'crates', header('CRATES', ctx, coins), h('div', { class: 'scroll' }, resume, list, note));
  const ext = (): MetaExt | null => { const m = ctx.meta(); return isMetaExt(m) ? m : null; };

  const resumeReveal = () => {
    const p = ctx.meta()?.pendingReveal();
    if (p) getReveal().play(p, { onClose: () => render() });
  };
  const open = (tier: CrateTier) => {
    const m = ctx.meta();
    if (!m) return;
    const res = m.openCrate(tier);
    if (res.rarity === 'coins' && res.item === null && res.coins === 0) { ctx.sfx('error'); return; }
    getReveal().play(res, { onClose: () => render() });
  };
  const buy = (tier: 'street' | 'pro') => {
    const m = ext();
    if (!m) return;
    if (!m.buyCrate(tier)) { ctx.sfx('error'); return; }
    ctx.emit({ t: 'purchase', id: `crate_${tier}`, price: m.cratePrice(tier) });
    ctx.emit({ t: 'coinsChanged', coins: m.data.wallet.coins, delta: -m.cratePrice(tier) });
    open(tier);
  };

  const render = () => {
    const m = ext();
    if (!m) return;
    setText(coins.lastChild as HTMLElement, fmtN(m.data.wallet.coins));
    resume.style.display = m.pendingReveal() ? '' : 'none';
    const pity = m.pity(), shopOpen = m.unlocked('shop');
    list.replaceChildren(...TIERS.map(({ tier, name, blurb }) => {
      const odds = m.crateOdds(tier);
      const held = m.crateHeld(tier);
      const gift = tier === 'cardboard' && m.dailyGiftReady();
      const price = m.cratePrice(tier);
      const oddsList = h('ul', { class: 'odds' }, ...Object.entries(odds).map(([k, p]) => h('li', { class: `o-${k}` }, h('span', null, ODDS_LABEL[k] ?? k), h('b', null, pct(p)))));
      const pityLines = tier === 'street'
        ? [h('div', { class: 'pity' }, h('b', null, `Epic+ guaranteed within ${pity.streetEpic}`)), h('div', { class: 'pity' }, `Legendary guaranteed within ${pity.streetLegendary}`)]
        : tier === 'pro' ? [h('div', { class: 'pity' }, h('b', null, `Legendary guaranteed within ${pity.proLegendary}`))] : [h('div', { class: 'pity none' }, 'No pity needed: it’s a gift')];
      const acts: HTMLElement[] = [];
      if (held > 0 || gift) acts.push(btn(gift ? 'Open gift' : held > 1 ? `Open (${held})` : 'Open', () => open(tier), ctx, 'primary small open'));
      if (tier !== 'cardboard' && m.cratesEnabled()) {
        const b = btn(shopOpen ? ['Buy', coinTag(fmtN(price))] : 'LV 3', () => buy(tier as 'street' | 'pro'), ctx, 'small buy', shopOpen ? `Buy a ${name} for ${price} coins` : 'Opens at Level 3');
        b.disabled = !shopOpen || m.data.wallet.coins < price;
        acts.push(b);
      }
      const status = tier === 'cardboard' ? (gift ? 'Your daily gift is ready' : held ? 'Held: open it any time' : 'Next gift tomorrow') : held ? `${held} held` : shopOpen ? `${fmtN(price)} coins` : 'Shop opens at Level 3';
      return h('article', { class: `crate-card t-${tier}${gift ? ' ready' : ''}`, dataset: { tier } },
        h('div', { class: 'cc-art' }, h('span', { class: `crate-ico ${tier}`, 'aria-hidden': 'true' })),
        h('div', { class: 'cc-main' }, h('h3', null, name), h('div', { class: 'cc-blurb' }, `${blurb} · ${status}`), oddsList, ...pityLines),
        h('div', { class: 'cc-acts' }, ...acts));
    }));
  };
  return {
    id: 'crates', el,
    show() {
      render();
      // An unfinished reveal resumes on the next visit (DESIGN §16.3).
      if (ctx.meta()?.pendingReveal()) resumeReveal();
    },
  };
}
