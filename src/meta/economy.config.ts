// meta/economy.config.ts: every economy number (DESIGN §14, §16, §20; the tunables map in §22). Pure data: the rules
// in meta/*.ts read only this file, so M5 tunes the economy here and nowhere else.
import type { CrateTier, ItemId, Rarity, Slot } from '../core/ids';

/** Coins (DESIGN §14.1). In-run pickups and combo payouts come from the sim (RunResult.coins / .coinPayouts). */
export const COINS = {
  /** Post-run score coins = floor(sqrt(score / scoreDiv)): 8k → 4, 40k → 10, 160k → 20. */
  scoreDiv: 400,
  /** New Best bonus (never on run 1, where any score is a best). */
  newBest: 25,
  /** Warm-up: the first run of each local day multiplies pickup coins (shown as a calm tag, never a countdown). */
  warmupMult: 2,
} as const;

/** XP (DESIGN §14.2). */
export const XP = {
  scoreDiv: 50,                    // floor(score / 50)
  distDiv: 10,                     // floor(distance_m / 10)
  trickBookEntry: 50,              // per new Trick Book entry …
  trickBookEntryOnboarding: 25,    // … during runs 1–3
  newArea: 150,                    // per area first reached through a gateway (the start area never counts)
  newBest: 100,                    // not on run 1
  /** xpToNext(L) = round(curveMul · L^curveExp + curveAdd) up to L29; a flat `flatAfter30` from L30 on. */
  curveMul: 60, curveExp: 1.5, curveAdd: 90, flatFrom: 30, flatAfter30: 10_000,
  /** Onboarding cap: during runs 1..capRuns one results screen grants at most one level-up; the rest is held. */
  capRuns: 3,
} as const;

/** A level reward (resolved into core `Reward`s by meta/progression.ts). */
export type LevelGrant =
  | { kind: 'coins'; amount: number }
  | { kind: 'item'; id: ItemId }
  | { kind: 'crate'; tier: CrateTier; count: number; forced?: { slot?: Slot; rarity?: Rarity } }
  | { kind: 'title'; name: string }
  | { kind: 'badge'; id: string }
  | { kind: 'unlock'; what: 'shop' | 'crateMeter' | 'wishlist' | 'trickBook' };

/** Level rewards L1–L30 (DESIGN §14.2). The key is the level being reached. */
export const LEVEL_REWARDS: Readonly<Record<number, readonly LevelGrant[]>> = {
  1: [{ kind: 'item', id: 'sk_juno' }, { kind: 'item', id: 'bd_plain_maple' }, { kind: 'item', id: 'hm_classic' }],
  2: [{ kind: 'crate', tier: 'street', count: 1, forced: { slot: 'skater', rarity: 'rare' } }],
  3: [{ kind: 'coins', amount: 300 }, { kind: 'unlock', what: 'shop' }, { kind: 'unlock', what: 'wishlist' }],
  4: [{ kind: 'item', id: 'bd_sunset_stripe' }, { kind: 'unlock', what: 'crateMeter' }, { kind: 'unlock', what: 'trickBook' }],
  5: [{ kind: 'item', id: 'hm_stickerbomb' }],
  6: [{ kind: 'coins', amount: 400 }],
  7: [{ kind: 'item', id: 'sk_mika' }],
  8: [{ kind: 'crate', tier: 'street', count: 1 }],
  9: [{ kind: 'coins', amount: 500 }],
  10: [{ kind: 'item', id: 'bd_lofi_waves' }, { kind: 'badge', id: 'level10' }],
  11: [{ kind: 'coins', amount: 500 }],
  12: [{ kind: 'item', id: 'hm_catears' }],
  13: [{ kind: 'crate', tier: 'street', count: 1 }],
  14: [{ kind: 'coins', amount: 600 }],
  15: [{ kind: 'item', id: 'sk_ines' }, { kind: 'title', name: 'Local' }],
  16: [{ kind: 'coins', amount: 600 }],
  17: [{ kind: 'item', id: 'bd_palm_shadow' }],
  18: [{ kind: 'crate', tier: 'pro', count: 1 }],
  19: [{ kind: 'coins', amount: 700 }],
  20: [{ kind: 'item', id: 'hm_fishbowl' }],
  21: [{ kind: 'coins', amount: 700 }],
  22: [{ kind: 'crate', tier: 'street', count: 2 }],
  23: [{ kind: 'coins', amount: 800 }],
  24: [{ kind: 'item', id: 'bd_lantern_row' }],
  25: [{ kind: 'item', id: 'sk_vesper' }],
  26: [{ kind: 'coins', amount: 900 }],
  27: [{ kind: 'crate', tier: 'pro', count: 1 }],
  28: [{ kind: 'coins', amount: 1000 }],
  29: [{ kind: 'crate', tier: 'pro', count: 1 }],
  30: [{ kind: 'item', id: 'bd_golden_hour' }, { kind: 'title', name: 'Golden' }],
};
/** Beyond L30: coins every level, a Pro Crate every 5th level, a profile star every 10th. */
export const BEYOND_30 = { coins: 500, proCrateEvery: 5, starEvery: 10 } as const;

/** Unlock levels implied by the table above (the UI gates on these). */
export const UNLOCK_LEVEL = { shop: 3, wishlist: 3, crateMeter: 4, trickBook: 4 } as const;

/** Prices and duplicate values by rarity (DESIGN §16.1). */
export const PRICE: Readonly<Record<Rarity, number>> = { common: 300, rare: 900, epic: 2400, legendary: 6000 };
export const DUPLICATE_VALUE: Readonly<Record<Rarity, number>> = { common: 150, rare: 450, epic: 1200, legendary: 3000 };

/** Shop featured row (DESIGN §16.2): 3 slots per local day, seeded by the date; unowned items only; 25% off. */
export const FEATURED = {
  discount: 0.25,
  slots: [['common', 'rare'], ['rare', 'epic'], ['epic', 'legendary']] as readonly (readonly Rarity[])[],
  /** Salt for the date seed, so the featured row and the crate RNG never share a stream. */
  salt: 0x5a0f,
} as const;

/** Crate tiers (DESIGN §16.3). Odds are per rarity (or 'coins'); each row sums to 1 (unit-tested). */
export const CRATES: Readonly<Record<CrateTier, { price: number; odds: Readonly<Partial<Record<Rarity | 'coins', number>>> }>> = {
  cardboard: { price: 0, odds: { coins: 0.70, common: 0.25, rare: 0.05 } },
  street: { price: 450, odds: { common: 0.70, rare: 0.25, epic: 0.045, legendary: 0.005 } },
  pro: { price: 1500, odds: { rare: 0.60, epic: 0.32, legendary: 0.08 } },
};
/** Cardboard coin roll, inclusive. */
export const CARDBOARD_COINS = { min: 60, max: 120 } as const;
/** Pity: the Nth crate without the rarity is guaranteed it (so the counter is shown as "within N − count"). */
export const PITY = { streetEpic: 10, streetLegendary: 40, proLegendary: 10 } as const;

/** Crate Meter (DESIGN §14.3): a free Street Crate at 4 km of total distance, then every 8 km. */
export const CRATE_METER = { first: 4000, every: 8000, tier: 'street' as CrateTier } as const;

/** Crates you can hold: the daily Cardboard gift plus the rewarded bonus one (no stockpiling of free gifts). */
export const CRATE_HELD_MAX = { cardboard: 2, street: 999, pro: 999 } as const;

/** Region compliance (DESIGN §20): with crates off, purchase is hidden and every free crate pays its expected value
 *  (meta/crates.ts › complianceValue, computed from CRATES and PRICE: Cardboard 183, Street 573, Pro 1,788). */
export const COMPLIANCE = { cratesEnabled: true } as const;

/** Rewarded offers (DESIGN §20). Policy lives in meta/offers.ts. */
export const OFFERS = {
  results_double_coins: { minRunCoins: 20, perDay: 5 },
  daily_gift_bonus: { perDay: 1 },
  /** Never in the first N runs, never on the install day. */
  minRunsTotal: 3,
} as const;
