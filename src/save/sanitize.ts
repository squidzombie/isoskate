// save/sanitize.ts: deep-merge a (migrated) save with the defaults, field by field, and make it safe to use
// (TECH §10.5): numbers are finite and clamped, enums are known, unknown item / trick / area ids are dropped, the
// starters are always owned, equipped items are owned and in the right slot, and the crate state is well-formed.
// It never throws: a field that does not fit falls back to its default.
import type { AreaId, CrateTier, HintId, ItemId, TrickId } from '../core/ids';
import type { SaveV1 } from '../core/save';
import { CRATE_TIERS, KNOWN, RARITIES, REVEAL_QUEUE_MAX, type KnownIds, type SaveCratesExt, type SaveDailyExt } from './schema';

type Raw = Record<string, unknown>;
const isObj = (x: unknown): x is Raw => !!x && typeof x === 'object' && !Array.isArray(x);
const obj = (x: unknown): Raw => (isObj(x) ? x : {});

/** Upper bound for any counter: far beyond any honest value, far below float trouble. */
export const SANE_MAX = 1e12;

const num = (v: unknown, d: number, lo = 0, hi = SANE_MAX, int = false): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return d;
  const x = Math.min(hi, Math.max(lo, v));
  return int ? Math.floor(x) : x;
};
const int = (v: unknown, d: number, lo = 0, hi = SANE_MAX) => num(v, d, lo, hi, true);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' && v.length > 0 && v.length < 200 ? v : d);
const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const oneOf = <T extends string | number>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
/** Unique strings from `v` that pass `ok`, in their original order. */
const ids = <T extends string>(v: unknown, ok: (s: string) => boolean): T[] => {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v) if (typeof x === 'string' && ok(x) && !out.includes(x as T)) out.push(x as T);
  return out;
};
/** A record of non-negative integer counts with known keys. */
const counts = <K extends string>(v: unknown, ok: (k: string) => boolean): Partial<Record<K, number>> => {
  const out: Partial<Record<K, number>> = {};
  for (const [k, x] of Object.entries(obj(v))) if (ok(k) && typeof x === 'number' && Number.isFinite(x) && x > 0) out[k as K] = Math.floor(Math.min(x, SANE_MAX));
  return out;
};

export function sanitize(input: unknown, defaults: SaveV1, known: KnownIds = KNOWN): SaveV1 {
  const r = obj(input), d = defaults;
  const item = (s: string) => known.items.has(s);
  const area = (s: string) => known.areas.has(s);

  const w = obj(r.wallet), xp = obj(r.xp), cr = obj(r.crates), dl = obj(r.daily), cm = obj(r.crateMeter), st = obj(r.stats);
  const ob = obj(r.onboarding), se = obj(r.settings), en = obj(r.entitlements), sh = obj(r.shop), eq = obj(r.equipped);

  const owned = ids<ItemId>(r.owned, item);
  for (const s of [d.equipped.skater, d.equipped.board, d.equipped.helmet]) if (!owned.includes(s)) owned.unshift(s);
  const equip = (slot: 'skater' | 'board' | 'helmet'): ItemId => {
    const v = eq[slot];
    return typeof v === 'string' && owned.includes(v) && known.slotOf.get(v) === slot ? v : d.equipped[slot];
  };
  const wish = typeof r.wishlist === 'string' && item(r.wishlist) && !owned.includes(r.wishlist) ? r.wishlist : null;

  const held = obj(cr.held), pity = obj(cr.pity);
  const rngIn = Array.isArray(cr.rng) && cr.rng.length === 4 && cr.rng.every((x) => typeof x === 'number' && Number.isFinite(x))
    ? (cr.rng as number[]).map((x) => x >>> 0) as [number, number, number, number] : null;
  const rng = rngIn && rngIn.some((x) => x !== 0) ? rngIn : [...d.crates.rng] as [number, number, number, number];
  const reveal = (x: unknown): SaveV1['crates']['pending'] => {
    const p = obj(x);
    return isObj(x) && CRATE_TIERS.includes(p.tier as CrateTier)
      && (p.rarity === 'coins' || RARITIES.includes(p.rarity as never))
      && (p.item === null || (typeof p.item === 'string' && item(p.item)))
      ? { tier: p.tier as CrateTier, rarity: p.rarity as string, item: (p.item as ItemId | null), coins: int(p.coins, 0, 0, 1e7), dup: bool(p.dup, false) }
      : null;
  };
  const queue = (Array.isArray(cr.queue) ? cr.queue : []).map(reveal).filter((x): x is NonNullable<typeof x> => !!x).slice(0, REVEAL_QUEUE_MAX);
  const pending = reveal(cr.pending) ?? queue.shift() ?? null;

  const learned: Partial<Record<HintId, boolean>> = {};
  for (const [k, v] of Object.entries(obj(ob.learned))) if (known.hints.has(k) && v === true) learned[k as HintId] = true;
  const cs = obj(ob.crashStreak);
  const crashStreak = isObj(ob.crashStreak) && typeof cs.kind === 'string' && cs.kind.length < 40
    ? { kind: cs.kind, runs: int(cs.runs, 1, 0, 1e6) } : null;

  const runs = int(st.runs, 0);
  const postcards = ids<AreaId>(r.postcards, area);
  if (runs > 0 && !postcards.includes('downtown')) postcards.unshift('downtown');

  const s: SaveV1 = {
    v: 1,
    installId: str(r.installId, d.installId),
    created: num(r.created, d.created, 0, 1e15), lastPlayed: num(r.lastPlayed, d.lastPlayed, 0, 1e15),
    installDay: day(r.installDay) ?? d.installDay,
    wallet: {
      coins: int(w.coins, 0), earnedTotal: int(w.earnedTotal, 0), spentTotal: int(w.spentTotal, 0),
      coinsPurchased: int(w.coinsPurchased, 0),
    },
    xp: { total: int(xp.total, 0), level: int(xp.level, 1, 1, 1e6), intoLevel: int(xp.intoLevel, 0), held: int(xp.held, 0) },
    lastRunId: typeof r.lastRunId === 'string' ? r.lastRunId : null,
    owned,
    unseen: ids<ItemId>(r.unseen, (x) => owned.includes(x)),
    equipped: { skater: equip('skater'), board: equip('board'), helmet: equip('helmet') },
    wishlist: wish,
    titles: ids<string>(r.titles, (x) => x.length < 40),
    badges: ids<string>(r.badges, (x) => x.length < 40),
    crates: {
      // Cardboard: the gift + its bonus box (= meta CRATE_HELD_MAX.cardboard; save may not import meta, economy.test pins it).
      held: { cardboard: int(held.cardboard, 0, 0, 2), street: int(held.street, 0, 0, 999), pro: int(held.pro, 0, 0, 999) },
      pity: { streetEpic: int(pity.streetEpic, 0, 0, 1e6), streetLegendary: int(pity.streetLegendary, 0, 0, 1e6),
        proLegendary: int(pity.proLegendary, 0, 0, 1e6) },
      rng, pending, opened: int(cr.opened, 0),
    },
    daily: {
      lastGiftDay: day(dl.lastGiftDay), giftHeld: bool(dl.giftHeld, false), lastWarmupDay: day(dl.lastWarmupDay),
      adsDay: day(dl.adsDay), adsCount: int(dl.adsCount, 0, 0, 1000),
    },
    crateMeter: { metres: num(cm.metres, 0), nextAt: num(cm.nextAt, d.crateMeter.nextAt, 1) },
    stats: {
      runs, best: int(st.best, 0), bestDist: num(st.bestDist, 0), bestTime: num(st.bestTime, 0), bestCombo: int(st.bestCombo, 0),
      furthestArea: oneOf(st.furthestArea, [...known.areas] as AreaId[], 'downtown'),
      totalDist: num(st.totalDist, 0), totalTime: num(st.totalTime, 0), longestGrind: num(st.longestGrind, 0, 0, 1e6),
      tricks: counts<TrickId>(st.tricks, (k) => known.tricks.has(k)), areaVisits: counts<AreaId>(st.areaVisits, area),
    },
    trickBook: ids<TrickId>(r.trickBook, (x) => known.tricks.has(x)),
    postcards,
    onboarding: {
      lessonDone: bool(ob.lessonDone, false), runsStarted: int(ob.runsStarted, 0), learned, crashStreak,
      persistAsked: bool(ob.persistAsked, false), installHintShown: bool(ob.installHintShown, false),
    },
    settings: {
      music: num(se.music, d.settings.music, 0, 1), sfx: num(se.sfx, d.settings.sfx, 0, 1),
      haptics: oneOf(se.haptics, ['off', 'key', 'all'] as const, d.settings.haptics),
      shake: bool(se.shake, d.settings.shake), reducedMotion: bool(se.reducedMotion, d.settings.reducedMotion),
      effects: bool(se.effects, d.settings.effects),
      quality: oneOf(se.quality, ['auto', 'low', 'med', 'high'] as const, d.settings.quality),
      batterySaver: bool(se.batterySaver, d.settings.batterySaver),
      steerSensitivity: num(se.steerSensitivity, d.settings.steerSensitivity, 0.6, 1.6),
      simpleTricks: bool(se.simpleTricks, d.settings.simpleTricks),
      keyPreset: oneOf(se.keyPreset, ['A', 'B'] as const, d.settings.keyPreset),
      analyticsOptOut: bool(se.analyticsOptOut, d.settings.analyticsOptOut),
    },
    entitlements: { adFree: bool(en.adFree, false), supporter: bool(en.supporter, false), purchases: ids<string>(en.purchases, (x) => x.length < 80) },
    shop: { featuredDay: day(sh.featuredDay), featured: ids<ItemId>(sh.featured, item) },
  };
  // Local extension (docs/core-requests.md MU): the day the rewarded daily-gift bonus was used.
  const bonusDay = day(dl.giftBonusDay);
  if (bonusDay) (s.daily as SaveV1['daily'] & SaveDailyExt).giftBonusDay = bonusDay;
  // Local extension (docs/core-requests.md MU): reveals queued behind the pending one.
  if (queue.length) (s.crates as SaveV1['crates'] & SaveCratesExt).queue = queue;
  // An unopened daily gift is a held Cardboard crate (at most the gift plus the rewarded bonus one are held).
  if (s.daily.giftHeld && s.crates.held.cardboard < 1) s.crates.held.cardboard = 1;
  return s;
}
