// meta/crates.ts: crate rolls (DESIGN §16.3). Pure: the caller passes a uniform [0,1) source (the save's Sfc32 stream)
// and writes the result to the save BEFORE any animation, so a refresh can never reroll it.
//   1. Rarity: a forced rarity (the Level 2 crate) wins; else pity (Street: Epic+ on the 10th crate without one,
//      Legendary on the 40th; Pro: Legendary on the 10th); else the tier's odds, lowest rarity first.
//   2. Item: uniformly among the items of that rarity you don't own (and of the forced slot). Only when you own the
//      whole tier is a duplicate possible; it converts to coins at the duplicate value. The L30 board never drops.
import type { CrateTier, ItemId, Rarity, Slot } from '../core/ids';
import type { CosmeticItem } from '../core/cosmetics';
import type { CrateResult } from '../core/meta';
import type { SaveV1 } from '../core/save';
import { CARDBOARD_COINS, CRATES, DUPLICATE_VALUE, PITY } from './economy.config';

export type Pity = SaveV1['crates']['pity'];
export const RARITY_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const rank = (r: Rarity | 'coins') => (r === 'coins' ? -1 : RARITY_ORDER.indexOf(r));

/** The odds shown on the crate screen (and used by the roll): outcome → probability, summing to 1. */
export function crateOdds(tier: CrateTier): Record<string, number> {
  return { ...CRATES[tier].odds } as Record<string, number>;
}

/** Weighted pick over `odds` in rarity order (coins first), so u → 0 gives the lowest outcome. */
function pickOutcome(odds: Readonly<Partial<Record<Rarity | 'coins', number>>>, u: number, minRank = -1): Rarity | 'coins' {
  const order: (Rarity | 'coins')[] = ['coins', ...RARITY_ORDER];
  let total = 0;
  for (const k of order) if (rank(k) >= minRank) total += odds[k] ?? 0;
  let r = u * total;
  let last: Rarity | 'coins' = 'coins';
  for (const k of order) {
    const p = rank(k) >= minRank ? odds[k] ?? 0 : 0;
    if (p <= 0) continue;
    last = k;
    if (r < p) return k;
    r -= p;
  }
  return last;
}

export interface RollInput {
  tier: CrateTier; pity: Readonly<Pity>; owned: ReadonlySet<ItemId>; catalog: readonly CosmeticItem[];
  uniform: () => number; forced?: { slot?: Slot; rarity?: Rarity };
}
export interface RollOutput { result: CrateResult; pity: Pity; pityHit: boolean }

export function rollCrate(i: RollInput): RollOutput {
  const pity: Pity = { ...i.pity };
  const odds = CRATES[i.tier].odds;
  let rarity: Rarity | 'coins';
  let pityHit = false;
  if (i.forced?.rarity) rarity = i.forced.rarity;
  else if (i.tier === 'street') {
    const e = pity.streetEpic + 1, l = pity.streetLegendary + 1;
    if (l >= PITY.streetLegendary) { rarity = 'legendary'; pityHit = true; }
    else if (e >= PITY.streetEpic) { rarity = pickOutcome(odds, i.uniform(), rank('epic')); pityHit = true; }
    else rarity = pickOutcome(odds, i.uniform());
    pity.streetEpic = rank(rarity) >= rank('epic') ? 0 : e;
    pity.streetLegendary = rarity === 'legendary' ? 0 : l;
  } else if (i.tier === 'pro') {
    const l = pity.proLegendary + 1;
    if (l >= PITY.proLegendary) { rarity = 'legendary'; pityHit = true; }
    else rarity = pickOutcome(odds, i.uniform());
    pity.proLegendary = rarity === 'legendary' ? 0 : l;
  } else rarity = pickOutcome(odds, i.uniform());

  if (rarity === 'coins') {
    const coins = CARDBOARD_COINS.min + Math.floor(i.uniform() * (CARDBOARD_COINS.max - CARDBOARD_COINS.min + 1));
    return { result: { tier: i.tier, rarity: 'coins', item: null, coins, dup: false }, pity, pityHit };
  }
  const pool = i.catalog.filter((c) => c.rarity === rarity && c.source !== 'level30' && (!i.forced?.slot || c.slot === i.forced.slot));
  const fresh = pool.filter((c) => !i.owned.has(c.id));
  if (fresh.length) {
    const it = fresh[Math.min(fresh.length - 1, Math.floor(i.uniform() * fresh.length))]!;
    return { result: { tier: i.tier, rarity, item: it.id, coins: 0, dup: false }, pity, pityHit };
  }
  if (!pool.length) return { result: { tier: i.tier, rarity, item: null, coins: DUPLICATE_VALUE[rarity], dup: true }, pity, pityHit };
  const it = pool[Math.min(pool.length - 1, Math.floor(i.uniform() * pool.length))]!;
  return { result: { tier: i.tier, rarity, item: it.id, coins: DUPLICATE_VALUE[rarity], dup: true }, pity, pityHit };
}

/** Crates left until the pity guarantee, as shown on the crate screen ("Epic+ guaranteed within 4"). */
export function pityRemaining(p: Readonly<Pity>): { streetEpic: number; streetLegendary: number; proLegendary: number } {
  return {
    streetEpic: Math.max(1, PITY.streetEpic - p.streetEpic),
    streetLegendary: Math.max(1, PITY.streetLegendary - p.streetLegendary),
    proLegendary: Math.max(1, PITY.proLegendary - p.proLegendary),
  };
}

/** Expected value of a crate in shop coins (DESIGN §16.3: Street ≈ 573, Pro ≈ 1,788). */
export function crateValue(tier: CrateTier, price: Readonly<Record<Rarity, number>>): number {
  const o = CRATES[tier].odds;
  let v = (o.coins ?? 0) * (CARDBOARD_COINS.min + CARDBOARD_COINS.max) / 2;
  for (const r of RARITY_ORDER) v += (o[r] ?? 0) * price[r];
  return v;
}
