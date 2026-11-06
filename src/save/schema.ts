// save/schema.ts: the vocabularies the save is validated against (TECH §10.5 sanitize: "drop unknown item ids").
// SaveV1 itself is the frozen contract in core/save.ts; this file only lists what may appear inside it.
import { AREA_ORDER, type AreaId, type CrateTier, type HintId, type ItemId, type Rarity, type TrickId } from '../core/ids';
import { CATALOG } from '../content';
import { TRICKS } from '../tricks';

/** The 36 Trick Book entries in book order (DESIGN §14.3): ollie, 15 flips, 4 spins, the Indy, 13 grinds, 2 manuals. */
export const TRICK_BOOK: readonly TrickId[] = Object.freeze([
  'ollie' as TrickId,
  ...TRICKS.flips.map((d) => d.id), ...TRICKS.spins.map((d) => d.id), ...TRICKS.grabs.map((d) => d.id),
  ...TRICKS.grinds.map((d) => d.id), ...TRICKS.manuals.map((d) => d.id),
]);

export const HINT_IDS: readonly HintId[] = ['drag', 'tap', 'grind', 'pick', 'flip', 'avoid', 'manual', 'transfer', 'spin', 'pit'];
export const CRATE_TIERS: readonly CrateTier[] = ['cardboard', 'street', 'pro'];
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export interface KnownIds {
  items: ReadonlySet<ItemId>;
  tricks: ReadonlySet<string>;
  areas: ReadonlySet<string>;
  hints: ReadonlySet<string>;
  /** Item id → slot, to keep `equipped` slot-correct. */
  slotOf: ReadonlyMap<ItemId, string>;
}

export const KNOWN: KnownIds = {
  items: new Set(CATALOG.map((c) => c.id)),
  tricks: new Set<string>(TRICK_BOOK),
  areas: new Set<string>(AREA_ORDER),
  hints: new Set<string>(HINT_IDS),
  slotOf: new Map(CATALOG.map((c) => [c.id, c.slot])),
};

export const isArea = (a: unknown): a is AreaId => typeof a === 'string' && KNOWN.areas.has(a);

/** Local extension of SaveV1['daily'] (filed in docs/core-requests.md, MU): the day the rewarded Cardboard bonus
 *  (`daily_gift_bonus`, once per day) was granted. Kept by sanitize; absent in older saves. */
export interface SaveDailyExt { giftBonusDay?: string | null }
