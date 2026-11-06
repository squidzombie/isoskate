// core/meta.ts (TECH §4.10). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
import type { AreaId, CrateTier, ItemId, Rarity, Slot, TrickId } from './ids';
import type { RunResult } from './sim';
import type { CosmeticItem, Loadout } from './cosmetics';
export type Reward =
  | { kind: 'coins'; amount: number; source: string }
  | { kind: 'item'; id: ItemId; duplicateCoins: number }
  | { kind: 'crate'; tier: CrateTier; count: number; forced?: { slot?: Slot; rarity?: Rarity } }
  | { kind: 'title'; name: string } | { kind: 'badge'; id: string };
export interface NextGoal { kind: 'level' | 'wishlist' | 'crate' | 'area' | 'best'; text: string; progress: number }
export interface RunRewards {
  coins: { pickups: number; payouts: number; score: number; warmup: number; newBest: number; total: number };
  xp: { gained: number; levelBefore: number; levelAfter: number; intoLevel: number; toNext: number };
  rewards: Reward[]; newTricks: TrickId[]; newAreas: AreaId[]; newBest: boolean;
  crateMeter: { metres: number; nextAt: number; granted: number };
  wishlist: { id: ItemId; have: number; need: number } | null;
  nextGoal: NextGoal;
}
export interface CrateResult { tier: CrateTier; rarity: Rarity | 'coins'; item: ItemId | null; coins: number; dup: boolean }
export interface MetaApi {
  catalog(): readonly CosmeticItem[];
  loadout(): Loadout;
  applyRun(r: RunResult): RunRewards;            // pure rules + save mutation; idempotent per r.runId (save.lastRunId)
  canAfford(price: number): boolean;
  price(id: ItemId): { base: number; featured: number | null };
  buy(id: ItemId): boolean;
  equip(id: ItemId): void; setWishlist(id: ItemId | null): void;
  featured(): ItemId[];                          // seeded by local date
  crateOdds(tier: CrateTier): Record<string, number>;
  buyCrate(tier: 'street' | 'pro'): boolean;
  openCrate(tier: CrateTier): CrateResult;       // rolls + writes the save BEFORE any animation
  pendingReveal(): CrateResult | null; ackReveal(): void;
  dailyGiftReady(): boolean; claimDailyGift(): void;
  levelInfo(): { level: number; into: number; toNext: number };
}
