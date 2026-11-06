// save/defaults.ts: SaveV1 defaults (TECH §4.9, DESIGN §14–§17). A fresh profile owns and wears the starter set
// (DESIGN §14.2 Level 1), has Level 1 and no coins, and gets its own crate RNG stream (rolls are pre-committed).
import { Sfc32 } from '../core/rng';
import { SAVE_VERSION, type SaveV1 } from '../core/save';
import { STARTERS } from '../content';

/** Local calendar day, YYYY-MM-DD (the daily gift, the warm-up bonus and the featured row all use it). */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function random32(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') return c.getRandomValues(new Uint32Array(1))[0]!;
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

function newInstallId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `id-${random32().toString(36)}-${random32().toString(36)}-${Date.now().toString(36)}`;
}

/** The v1 settings defaults (DESIGN §17.2). */
export const DEFAULT_SETTINGS: Readonly<SaveV1['settings']> = Object.freeze({
  music: 0.8, sfx: 0.9, haptics: 'key', shake: true, reducedMotion: false, effects: true, quality: 'auto',
  batterySaver: false, steerSensitivity: 1, simpleTricks: false, keyPreset: 'A', analyticsOptOut: false,
});

/** A fresh profile. `seed` fixes the crate RNG stream (tests); by default each install draws its own. */
export function makeDefaults(now: number = Date.now(), seed: number = random32()): SaveV1 {
  return {
    v: SAVE_VERSION as 1,
    installId: newInstallId(), created: now, lastPlayed: now, installDay: localDay(now),
    wallet: { coins: 0, earnedTotal: 0, spentTotal: 0, coinsPurchased: 0 },
    xp: { total: 0, level: 1, intoLevel: 0, held: 0 },
    lastRunId: null,
    owned: [STARTERS.skater, STARTERS.board, STARTERS.helmet], unseen: [],
    equipped: { skater: STARTERS.skater, board: STARTERS.board, helmet: STARTERS.helmet },
    wishlist: null,
    titles: [], badges: [],
    crates: {
      held: { cardboard: 0, street: 0, pro: 0 },
      pity: { streetEpic: 0, streetLegendary: 0, proLegendary: 0 },
      rng: new Sfc32(seed >>> 0).getState(),
      pending: null, opened: 0,
    },
    daily: { lastGiftDay: null, giftHeld: false, lastWarmupDay: null, adsDay: null, adsCount: 0 },
    crateMeter: { metres: 0, nextAt: 4000 },
    stats: {
      runs: 0, best: 0, bestDist: 0, bestTime: 0, bestCombo: 0, furthestArea: 'downtown', totalDist: 0, totalTime: 0,
      longestGrind: 0, tricks: {}, areaVisits: {},
    },
    trickBook: [], postcards: [],          // Downtown's postcard is granted on run 1 (DESIGN §14.3)
    onboarding: { lessonDone: false, runsStarted: 0, learned: {}, crashStreak: null, persistAsked: false, installHintShown: false },
    settings: { ...DEFAULT_SETTINGS },
    entitlements: { adFree: false, supporter: false, purchases: [] },
    shop: { featuredDay: null, featured: [] },
  };
}
