// meta/wallet.ts: coins and item grants on a SaveV1 (mutating helpers used inside save.mutate). Coins never go
// negative; every coin in is counted in earnedTotal (purchased coins also in coinsPurchased, DESIGN §20 ledger).
import type { ItemId, Rarity } from '../core/ids';
import type { CosmeticItem } from '../core/cosmetics';
import type { SaveV1 } from '../core/save';
import { DUPLICATE_VALUE } from './economy.config';

export function addCoins(s: SaveV1, n: number, purchased = false): number {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  s.wallet.coins += v;
  s.wallet.earnedTotal += v;
  if (purchased) s.wallet.coinsPurchased += v;
  return v;
}

/** Spends `n` coins if the wallet holds them; returns false (and changes nothing) otherwise. */
export function spendCoins(s: SaveV1, n: number): boolean {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  if (s.wallet.coins < v) return false;
  s.wallet.coins -= v;
  s.wallet.spentTotal += v;
  return true;
}

export interface Grant { id: ItemId; dup: boolean; coins: number; rarity: Rarity | null }

/** Gives an item: new items are owned and marked unseen ("New" badge); an owned one converts to its duplicate value. */
export function grantItem(s: SaveV1, id: ItemId, byId: ReadonlyMap<ItemId, CosmeticItem>): Grant {
  const it = byId.get(id);
  if (!it) return { id, dup: false, coins: 0, rarity: null };
  if (s.owned.includes(id)) {
    const coins = addCoins(s, DUPLICATE_VALUE[it.rarity]);
    return { id, dup: true, coins, rarity: it.rarity };
  }
  s.owned.push(id);
  if (!s.unseen.includes(id)) s.unseen.push(id);
  if (s.wishlist === id) s.wishlist = null;
  return { id, dup: false, coins: 0, rarity: it.rarity };
}
