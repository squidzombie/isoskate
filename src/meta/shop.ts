// meta/shop.ts: prices and the featured row (DESIGN §16.1–16.2). Pure.
//   Every shop item is always buyable (except the L30 board, `source: 'level30'`); starters are owned from the start.
//   Featured: 3 slots per local day seeded by the date (works offline): A Common/Rare, B Rare/Epic, C Epic/Legendary,
//   unowned items only, 25% off. "New picks tomorrow"; no countdowns.
import { hash32, Sfc32 } from '../core/rng';
import type { ItemId } from '../core/ids';
import type { CosmeticItem } from '../core/cosmetics';
import { FEATURED, PRICE } from './economy.config';

export const isBuyable = (c: CosmeticItem) => c.source === 'shop';
export const basePrice = (c: CosmeticItem) => PRICE[c.rarity];
export const featuredPrice = (c: CosmeticItem) => Math.round(PRICE[c.rarity] * (1 - FEATURED.discount));

/** A stable integer for a YYYY-MM-DD day. */
export const daySeed = (day: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : hash32(day.length);
};

/** The day's featured picks: deterministic for (day, owned set). */
export function featuredFor(day: string, owned: ReadonlySet<ItemId>, catalog: readonly CosmeticItem[]): ItemId[] {
  const rng = new Sfc32(hash32(daySeed(day), FEATURED.salt));
  const out: ItemId[] = [];
  for (const rarities of FEATURED.slots) {
    const pool = catalog.filter((c) => isBuyable(c) && rarities.includes(c.rarity) && !owned.has(c.id) && !out.includes(c.id));
    if (pool.length) out.push(rng.pick(pool).id);
  }
  return out;
}
