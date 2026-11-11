// core/save.ts (TECH §4.9). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
import type { AreaId, CrateTier, HintId, ItemId, TrickId } from './ids';

export interface SaveV1 {
  v: 1;
  installId: string; created: number; lastPlayed: number; installDay: string;   // YYYY-MM-DD local
  wallet: { coins: number; earnedTotal: number; spentTotal: number; coinsPurchased: number };
  xp: { total: number; level: number; intoLevel: number; held: number };   // held: onboarding cap overflow (DESIGN §14.2)
  lastRunId: string | null;                                       // applyRun idempotency
  owned: ItemId[]; unseen: ItemId[];
  equipped: { skater: ItemId; board: ItemId; helmet: ItemId };
  wishlist: ItemId | null;
  titles: string[]; badges: string[];
  crates: {
    held: Record<CrateTier, number>;
    pity: { streetEpic: number; streetLegendary: number; proLegendary: number };
    rng: [number, number, number, number];                        // Sfc32 state (rolls are pre-committed)
    pending: { tier: CrateTier; rarity: string; item: ItemId | null; coins: number; dup: boolean } | null;
    opened: number;
    /** added @G1 (MU): pre-committed results waiting behind `pending` (granted at their reveal; ≤ 8, absent when empty). */
    queue?: { tier: CrateTier; rarity: string; item: ItemId | null; coins: number; dup: boolean }[];
  };
  daily: { lastGiftDay: string | null; giftHeld: boolean; lastWarmupDay: string | null;
           adsDay: string | null; adsCount: number;
           giftBonusDay?: string | null };                        // added @G1 (MU): day the daily_gift_bonus offer was granted
  crateMeter: { metres: number; nextAt: number };                 // 4000, then +8000
  stats: {
    runs: number; best: number; bestDist: number; bestTime: number; bestCombo: number;
    furthestArea: AreaId; totalDist: number; totalTime: number; longestGrind: number;
    tricks: Partial<Record<TrickId, number>>; areaVisits: Partial<Record<AreaId, number>>;
  };
  trickBook: TrickId[]; postcards: AreaId[];
  onboarding: { lessonDone: boolean; runsStarted: number; learned: Partial<Record<HintId, boolean>>;
                crashStreak: { kind: string; runs: number } | null;
                persistAsked: boolean; installHintShown: boolean;
                /** added @ctl: the one-run re-teach of the two-thumb controls for a profile from before them (DESIGN
                 *  §12.5): -1 = due (sanitize: runsStarted > 3 and no settings.controls in the stored save), n > 0 = shown
                 *  in run n (its runsStarted), 0 / absent = not needed (new profiles learn them in runs 1–3). */
                twoThumbIntro?: number };
  settings: {
    music: number; sfx: number; haptics: 'off' | 'key' | 'all'; shake: boolean; reducedMotion: boolean; effects: boolean;
    quality: 'auto' | 'low' | 'med' | 'high'; batterySaver: boolean; steerSensitivity: number; simpleTricks: boolean;
    keyPreset: 'A' | 'B'; analyticsOptOut: boolean;
    /** added @ctl: touch controls (DESIGN §4.1): 'two' = steer with the left thumb, tricks with the right (default);
     *  'one' = the one-thumb grammar (classic). `swapSides`: steer right, tricks left. Absent = 'two', false. */
    controls?: 'two' | 'one'; swapSides?: boolean;
  };
  entitlements: { adFree: boolean; supporter: boolean; purchases: string[] };
  shop: { featuredDay: string | null; featured: ItemId[] };
}
export type SaveAny = SaveV1;                       // union grows with versions
export const SAVE_VERSION = 1;
export interface SaveStore {
  readonly data: Readonly<SaveV1>;
  readonly persistent: boolean;                   // false = memory fallback ("progress won't be saved")
  mutate(f: (s: SaveV1) => void): void;           // apply + debounce(500 ms) write
  flush(): void;                                  // immediate write (visibility hidden, crate rolls, purchases)
  reset(): void;
  export(): string; import(json: string): boolean;
}
