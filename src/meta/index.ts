// meta/: economy, progression, shop, crates, offers and analytics (MU; DESIGN §14, §16, §20, §21). Public surface
// (TECH §4.13): createMeta, createAnalytics. Rules are pure functions in meta/*.ts over economy.config.ts; this file
// binds them to the SaveStore (every mutation through save.mutate, flush() at the TECH §10.5 flush points: run end,
// crate roll, purchase) and records the analytics events meta owns.
//
// MetaExt (below) is what the UI uses beyond the frozen MetaApi: a read view of the save, unlocks, pity, offers,
// backup/restore and the last run's rewards (for the instant-retry toast). The UI duck-types it (isMetaExt).
import type { CrateTier, ItemId, Slot } from '../core/ids';
import type { CosmeticItem, Loadout } from '../core/cosmetics';
import type { CrateResult, MetaApi, RunRewards } from '../core/meta';
import type { Analytics, Placement } from '../core/platform';
import type { SaveStore, SaveV1 } from '../core/save';
import type { RunResult } from '../core/sim';
import { localDay, requestPersist, type SaveDailyExt } from '../save';
import { analyticsFor, createAnalyticsImpl } from './analytics';
import { crateOdds as oddsOf, pityRemaining } from './crates';
import { COMPLIANCE, CRATES, PITY, UNLOCK_LEVEL } from './economy.config';
import { createOfferPolicy, type OfferPolicyExt } from './offers';
import { xpToNext } from './progression';
import { applyRunRules, commitRoll, nextGoal, type MetaCtx, type RunRewardsExt } from './results';
import { basePrice, featuredFor, featuredPrice, isBuyable } from './shop';
import { addCoins, spendCoins } from './wallet';

export type Unlock = keyof typeof UNLOCK_LEVEL;
type Props = Record<string, string | number | boolean | object>;

export interface MetaExt extends MetaApi {
  readonly ext: true;
  /** Read-only view of the save (stats, Trick Book, postcards, settings, onboarding). Never mutate it. */
  readonly data: Readonly<SaveV1>;
  /** false = memory fallback ("progress won't be saved"). */
  readonly persistent: boolean;
  today(): string;
  lastRun(): RunRewardsExt | null;
  unlocked(what: Unlock): boolean;
  owns(id: ItemId): boolean;
  item(id: ItemId): CosmeticItem | undefined;
  crateHeld(tier: CrateTier): number;
  cratePrice(tier: CrateTier): number;
  cratesEnabled(): boolean;
  /** Crates left until each pity guarantee ("Epic+ guaranteed within 4"). */
  pity(): { streetEpic: number; streetLegendary: number; proLegendary: number };
  markSeen(ids?: readonly ItemId[]): void;
  markInstallHint(): void;
  offers: OfferPolicyExt;
  offerEligible(p: Placement, runCoins?: number, runId?: string | null): boolean;
  /** Grants a completed rewarded offer; returns the coins (double coins) or crates (gift bonus) granted. */
  grantOffer(p: Placement, runId?: string | null, runCoins?: number): number;
  track(event: string, props?: Props): void;
  exportSave(): string;
  importSave(json: string): boolean;
  resetProgress(): void;
}
export const isMetaExt = (m: MetaApi | null | undefined): m is MetaExt => !!m && (m as Partial<MetaExt>).ext === true;

export interface MetaOptions { now?: () => number }

export function createMetaImpl(save: SaveStore, catalog: readonly CosmeticItem[], o: MetaOptions = {}): MetaExt {
  const now = o.now ?? (() => Date.now());
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const today = () => localDay(now());
  const ctx = (): MetaCtx => ({ catalog, byId, today: today(), now: now() });
  let last: RunRewardsExt | null = null;
  let offerRunId: string | null = null;
  const look = <T extends CosmeticItem['look']>(slot: Slot, id: ItemId): T => {
    const it = byId.get(id);
    return (it && it.slot === slot ? it : catalog.find((c) => c.slot === slot)!).look as T;
  };
  const track = (e: string, p?: Props) => analyticsFor(save)?.track(e, p);
  const offers = createOfferPolicy(() => save.data as SaveV1 & { daily: SaveV1['daily'] & SaveDailyExt }, () => offerRunId);

  const meta: MetaExt = {
    ext: true,
    get data() { return save.data; },
    get persistent() { return save.persistent; },
    catalog: () => catalog,
    loadout(): Loadout {
      const e = save.data.equipped;
      return { skater: look('skater', e.skater), board: look('board', e.board), helmet: look('helmet', e.helmet) };
    },

    applyRun(r: RunResult): RunRewards {
      if (save.data.lastRunId === r.runId) {
        if (last?.runId === r.runId) return last;
        return replayRewards(save.data, r, ctx());            // applied before a reload: report, change nothing
      }
      let res: ReturnType<typeof applyRunRules> | null = null;
      save.mutate((s) => { res = applyRunRules(s, r, ctx()); });
      const out = res as unknown as ReturnType<typeof applyRunRules>;
      save.flush();
      for (const t of out.track) track(t.e, t.p);
      if (!save.data.onboarding.persistAsked && save.data.stats.runs >= 1) {
        save.mutate((s) => { s.onboarding.persistAsked = true; });
        void requestPersist();                                 // once, after run 1 (TECH §10.5)
      }
      last = out.rewards;
      return last;
    },
    canAfford: (price) => save.data.wallet.coins >= price,
    price(id) {
      const it = byId.get(id);
      if (!it) return { base: 0, featured: null };
      return { base: basePrice(it), featured: meta.featured().includes(id) ? featuredPrice(it) : null };
    },
    buy(id) {
      const it = byId.get(id);
      if (!it || !isBuyable(it) || save.data.owned.includes(id) || !meta.unlocked('shop')) return false;
      const p = meta.price(id), cost = p.featured ?? p.base;
      let ok = false;
      save.mutate((s) => {
        if (!spendCoins(s, cost)) return;
        s.owned.push(id);
        if (s.wishlist === id) s.wishlist = null;
        ok = true;
      });
      if (!ok) return false;
      save.flush();
      track('shop_purchase', { item: id, rarity: it.rarity, price: cost, featured: p.featured !== null });
      return true;
    },
    equip(id) {
      const it = byId.get(id);
      if (!it || !save.data.owned.includes(id) || save.data.equipped[it.slot] === id) return;
      save.mutate((s) => { s.equipped[it.slot] = id; s.unseen = s.unseen.filter((u) => u !== id); });
      save.flush();                                              // a deliberate choice: never lost to a quick reload
      track('equip', { item: id });
    },
    setWishlist(id) {
      if (id !== null && (!byId.has(id) || save.data.owned.includes(id))) return;
      if (save.data.wishlist === id) return;
      save.mutate((s) => { s.wishlist = id; });
      track('wishlist_set', { item: id ?? 'none' });
    },
    featured() {
      const d = today();
      if (save.data.shop.featuredDay !== d) {
        const picks = featuredFor(d, new Set(save.data.owned), catalog);
        save.mutate((s) => { s.shop.featuredDay = d; s.shop.featured = picks; });
      }
      return save.data.shop.featured.filter((id) => !save.data.owned.includes(id));
    },
    crateOdds: (tier) => oddsOf(tier),
    buyCrate(tier) {
      if (!COMPLIANCE.cratesEnabled || !meta.unlocked('shop')) return false;
      let ok = false;
      save.mutate((s) => { if (spendCoins(s, CRATES[tier].price)) { s.crates.held[tier]++; ok = true; } });
      if (!ok) return false;
      save.flush();
      track('shop_purchase', { item: `crate_${tier}`, rarity: 'crate', price: CRATES[tier].price, featured: false });
      return true;
    },
    openCrate(tier): CrateResult {
      const p = meta.pendingReveal();
      if (p) return p;                                           // an unfinished reveal resumes, never rerolls
      if (tier === 'cardboard' && save.data.crates.held.cardboard < 1 && meta.dailyGiftReady()) meta.claimDailyGift();
      if (save.data.crates.held[tier] < 1) return { tier, rarity: 'coins', item: null, coins: 0, dup: false };
      const before = { ...save.data.crates.pity };
      let res: CrateResult | null = null;
      save.mutate((s) => {
        s.crates.held[tier]--;
        if (tier === 'cardboard') s.daily.giftHeld = false;
        res = commitRoll(s, tier, ctx());
        s.crates.pending = { ...(res as CrateResult) };
      });
      save.flush();                                              // written BEFORE the reveal animation (DESIGN §16.3)
      const out = res as unknown as CrateResult;
      const pityHit = tier === 'street' ? before.streetEpic + 1 >= PITY.streetEpic || before.streetLegendary + 1 >= PITY.streetLegendary
        : tier === 'pro' ? before.proLegendary + 1 >= PITY.proLegendary : false;
      track('crate_open', { tier, rarity: out.rarity, dup: out.dup, pity: pityHit });
      return out;
    },
    pendingReveal(): CrateResult | null {
      const p = save.data.crates.pending;
      return p ? { tier: p.tier, rarity: p.rarity as CrateResult['rarity'], item: p.item, coins: p.coins, dup: p.dup } : null;
    },
    ackReveal() {
      if (!save.data.crates.pending) return;
      save.mutate((s) => { s.crates.pending = null; });
      save.flush();
    },
    dailyGiftReady: () => save.data.daily.lastGiftDay !== today() && !save.data.daily.giftHeld,
    claimDailyGift() {
      if (!meta.dailyGiftReady()) return;
      const d = today();
      save.mutate((s) => {
        s.daily.lastGiftDay = d;
        if (COMPLIANCE.cratesEnabled) { s.daily.giftHeld = true; s.crates.held.cardboard = Math.min(2, s.crates.held.cardboard + 1); }
        else addCoins(s, COMPLIANCE.cardboardValue);
      });
      save.flush();
    },
    levelInfo() { const x = save.data.xp; return { level: x.level, into: x.intoLevel, toNext: xpToNext(x.level) }; },

    // ── MetaExt ──
    today,
    lastRun: () => last,
    unlocked: (what) => save.data.xp.level >= UNLOCK_LEVEL[what],
    owns: (id) => save.data.owned.includes(id),
    item: (id) => byId.get(id),
    crateHeld: (tier) => save.data.crates.held[tier],
    cratePrice: (tier) => CRATES[tier].price,
    cratesEnabled: () => COMPLIANCE.cratesEnabled,
    pity: () => pityRemaining(save.data.crates.pity),
    markSeen(ids) {
      const drop = ids ? new Set(ids) : null;
      if (!save.data.unseen.some((u) => !drop || drop.has(u))) return;
      save.mutate((s) => { s.unseen = drop ? s.unseen.filter((u) => !drop.has(u)) : []; });
    },
    markInstallHint() { if (!save.data.onboarding.installHintShown) save.mutate((s) => { s.onboarding.installHintShown = true; }); },
    offers,
    offerEligible: (p, runCoins = 0, runId = null) => offers.eligibleFor(p, { runCoins, runsTotal: save.data.stats.runs, today: today() }, runId),
    grantOffer(p, runId = null, runCoins = 0) {
      if (!meta.offerEligible(p, runCoins, runId)) return 0;
      const d = today();
      let n = 0;
      save.mutate((s) => {
        if (s.daily.adsDay !== d) { s.daily.adsDay = d; s.daily.adsCount = 0; }
        s.daily.adsCount++;
        if (p === 'results_double_coins') { n = addCoins(s, runCoins); offerRunId = runId; }
        else { (s.daily as SaveV1['daily'] & SaveDailyExt).giftBonusDay = d; s.crates.held.cardboard = Math.min(2, s.crates.held.cardboard + 1); n = 1; }
      });
      save.flush();
      return n;
    },
    track,
    exportSave: () => save.export(),
    importSave(json) { const ok = save.import(json); if (ok) last = null; return ok; },
    resetProgress() { save.reset(); last = null; },
  };
  return meta;
}

/** Rewards for a run that was already applied (e.g. Results after a reload): no gains, the current state. */
function replayRewards(s: Readonly<SaveV1>, r: RunResult, ctx: MetaCtx): RunRewardsExt {
  const lv = { level: s.xp.level, into: s.xp.intoLevel, toNext: xpToNext(s.xp.level) };
  return {
    coins: { pickups: 0, payouts: 0, score: 0, warmup: 0, newBest: 0, total: 0 },
    xp: { gained: 0, levelBefore: lv.level, levelAfter: lv.level, intoLevel: lv.into, toNext: lv.toNext },
    rewards: [], newTricks: [], newAreas: [], newBest: false,
    crateMeter: { metres: s.crateMeter.metres, nextAt: s.crateMeter.nextAt, granted: 0 }, wishlist: null,
    nextGoal: nextGoal(s, r, ctx),
    runId: r.runId, runIndex: s.stats.runs, capped: false, xpParts: { score: 0, distance: 0, tricks: 0, areas: 0, best: 0, total: 0 },
    xpBefore: lv, levelUps: [], held: s.xp.held, unlocks: [], postcards: [], pending: null,
    coinsBefore: s.wallet.coins, coinsAfter: s.wallet.coins, levelCoins: 0, warmupApplied: false, trickBookCount: s.trickBook.length,
    installHint: false,
  };
}

export function createMeta(save: SaveStore, catalog: readonly CosmeticItem[]): MetaApi {
  return createMetaImpl(save, catalog);
}

/** Local analytics ring buffer (500 events, opt-out honoured). No network in v1 (DESIGN §21). */
export function createAnalytics(save: SaveStore): Analytics {
  return createAnalyticsImpl(save);
}

/** DESIGN §21 `run_end` properties for a finished run (game/app.ts tracks run_end; see docs/core-requests.md, MU). */
export function runEndProps(r: RunResult, w: RunRewards | null, retryKind: 'instant' | 'results'): Record<string, string | number | boolean> {
  return {
    score: r.score, distance_m: Math.round(r.distance), duration_s: Math.round(r.durationS * 10) / 10, area_reached: r.furthestArea,
    max_speed: Math.round(r.maxSpeed * 100) / 100, best_combo: r.bestCombo, coins: w?.coins.total ?? r.coins + r.coinPayouts,
    xp: w?.xp.gained ?? 0, new_best: w?.newBest ?? false, lost_combo: r.lostCombo, retry_kind: retryKind,
  };
}

export { xpToNext, xpToReach, addXp, runXp, levelGrants, cappedRun } from './progression';
export { rollCrate, crateOdds, pityRemaining, crateValue, RARITY_ORDER } from './crates';
export { featuredFor, featuredPrice, basePrice, isBuyable, daySeed } from './shop';
export { createOfferPolicy, type OfferPolicyExt } from './offers';
export { applyRunRules, nextGoal, arrivalDistance, isRewardsExt, type RunRewardsExt, type MetaCtx } from './results';
export { createAnalyticsImpl, analyticsFor, ANALYTICS_KEY, ANALYTICS, type AnalyticsExt } from './analytics';
export { COINS, XP, LEVEL_REWARDS, UNLOCK_LEVEL, PRICE, DUPLICATE_VALUE, FEATURED, CRATES, PITY, CRATE_METER, COMPLIANCE, OFFERS,
  CARDBOARD_COINS, BEYOND_30 } from './economy.config';
