// save/defaults.ts: SaveV1 defaults (TECH §4.9). MU owns this from W3a.
import { SAVE_VERSION, type SaveV1 } from '../core/save';

/** Local calendar day, YYYY-MM-DD. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function newInstallId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function makeDefaults(now: number = Date.now()): SaveV1 {
  return {
    v: SAVE_VERSION as 1,
    installId: newInstallId(), created: now, lastPlayed: now, installDay: localDay(now),
    wallet: { coins: 0, earnedTotal: 0, spentTotal: 0, coinsPurchased: 0 },
    xp: { total: 0, level: 1, intoLevel: 0, held: 0 },
    lastRunId: null,
    owned: ['sk_juno', 'bd_plain_maple', 'hm_classic'], unseen: [],
    equipped: { skater: 'sk_juno', board: 'bd_plain_maple', helmet: 'hm_classic' },
    wishlist: null,
    titles: [], badges: [],
    crates: {
      held: { cardboard: 0, street: 0, pro: 0 },
      pity: { streetEpic: 0, streetLegendary: 0, proLegendary: 0 },
      rng: [0x9e3779b9, 0x243f6a88, 0xb7e15162, 1],
      pending: null, opened: 0,
    },
    daily: { lastGiftDay: null, giftHeld: false, lastWarmupDay: null, adsDay: null, adsCount: 0 },
    crateMeter: { metres: 0, nextAt: 4000 },
    stats: {
      runs: 0, best: 0, bestDist: 0, bestTime: 0, bestCombo: 0, furthestArea: 'downtown', totalDist: 0, totalTime: 0,
      longestGrind: 0, tricks: {}, areaVisits: {},
    },
    trickBook: [], postcards: ['downtown'],
    onboarding: { lessonDone: false, runsStarted: 0, learned: {}, crashStreak: null, persistAsked: false, installHintShown: false },
    settings: {
      music: 0.8, sfx: 0.9, haptics: 'key', shake: true, reducedMotion: false, effects: true, quality: 'auto',
      batterySaver: false, steerSensitivity: 1, simpleTricks: false, keyPreset: 'A', analyticsOptOut: false,
    },
    entitlements: { adFree: false, supporter: false, purchases: [] },
    shop: { featuredDay: null, featured: [] },
  };
}
