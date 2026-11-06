// meta/results.ts: what a finished run is worth (DESIGN §14), applied to a SaveV1 inside save.mutate.
//   Coins: pickups (doubled by the day's warm-up) + combo payouts + score coins floor(sqrt(score/400)) + 25 New Best.
//   XP: meta/progression.ts, with the onboarding cap in runs 1–3. Level rewards, Trick Book entries, postcards, the
//   Crate Meter, stats, bests and the one next goal are all decided here. Crate rewards that carry a forced result
//   (the Level 2 "guaranteed Rare skater") are rolled now and queued as a pending reveal: the result is fixed in the
//   save, and what is inside is granted when the reveal opens the lid (ackReveal), so nothing spoils it.
import { AREA_ORDER, type AreaId, type CrateTier, type ItemId, type Rarity, type Slot, type TrickId } from '../core/ids';
import type { CosmeticItem } from '../core/cosmetics';
import type { CrateResult, NextGoal, Reward, RunRewards } from '../core/meta';
import { Sfc32 } from '../core/rng';
import type { SaveV1 } from '../core/save';
import type { RunResult } from '../core/sim';
import { sAt } from '../core/tuning';
import { TRICK_BOOK, type SaveCratesExt } from '../save';
import { complianceValue, rollCrate } from './crates';
import { COINS, COMPLIANCE, CRATE_METER, UNLOCK_LEVEL } from './economy.config';
import { addXp, cappedRun, levelGrants, runXp, xpToNext, type RunXp } from './progression';
import { basePrice, featuredPrice } from './shop';
import { addCoins, grantItem, type Grant } from './wallet';

/** The area timeline (DESIGN §12.1: the first visit 40 s, later visits 35 s, gateways 4 s), mirrored here so meta does
 *  not import world/gen internals (WG owns them). tests/unit/meta/economy.test.ts pins it against the frozen
 *  WorldGen.areaAt; docs/core-requests.md (MU) asks for these in core/tuning.ts. */
export const AREA_TIMELINE = { firstVisitSec: 40, visitSec: 35, gatewaySec: 4 } as const;

type Pending = NonNullable<SaveV1['crates']['pending']>;
const queueOf = (s: SaveV1): Pending[] => ((s.crates as SaveV1['crates'] & SaveCratesExt).queue ??= []);

/** Every reveal still waiting: the pending one first, then the queue (a crate rolled while another was unopened). */
export function pendingReveals(s: Readonly<SaveV1>): readonly Pending[] {
  const q = (s.crates as SaveV1['crates'] & SaveCratesExt).queue ?? [];
  return s.crates.pending ? [s.crates.pending, ...q] : q;
}

/** Writes a rolled result as a reveal: the pending one if none is waiting, else at the end of the queue. */
function queueReveal(s: SaveV1, res: CrateResult): void {
  if (!s.crates.pending) s.crates.pending = { ...res };
  else queueOf(s).push({ ...res });
}

/** Grants what a revealed crate holds (call when the lid opens): the item, or its coins. An item that was bought in
 *  the meantime converts to its duplicate value (DESIGN §14.2). */
export function grantReveal(s: SaveV1, p: Readonly<Pending>, byId: ReadonlyMap<ItemId, CosmeticItem>): Grant | null {
  if (p.item && !p.dup) return grantItem(s, p.item, byId);
  addCoins(s, p.coins);
  return null;
}

/** Acknowledges the pending reveal: grants it and moves the next queued one up. */
export function ackPending(s: SaveV1, byId: ReadonlyMap<ItemId, CosmeticItem>): boolean {
  const p = s.crates.pending;
  if (!p) return false;
  grantReveal(s, p, byId);
  const q = (s.crates as SaveV1['crates'] & SaveCratesExt).queue;
  s.crates.pending = q?.shift() ?? null;
  if (q && !q.length) delete (s.crates as SaveV1['crates'] & SaveCratesExt).queue;
  return true;
}

export interface MetaCtx {
  catalog: readonly CosmeticItem[];
  byId: ReadonlyMap<ItemId, CosmeticItem>;
  today: string;
  now: number;
}

/** Everything the Results screen shows beyond the core RunRewards (the UI reads these when present). */
export interface RunRewardsExt extends RunRewards {
  runId: string;
  runIndex: number;                       // 1-based
  capped: boolean;                        // the onboarding cap applied to this results screen
  xpParts: RunXp;
  xpBefore: { level: number; into: number; toNext: number };
  levelUps: number[];                     // every level reached, in order
  held: number;                           // XP held back by the onboarding cap
  unlocks: ('shop' | 'wishlist' | 'crateMeter' | 'trickBook')[];
  postcards: AreaId[];                    // postcards granted by this run (Downtown's on run 1)
  pending: CrateResult | null;            // a crate rolled now, waiting for its reveal
  coinsBefore: number; coinsAfter: number; levelCoins: number;
  warmupApplied: boolean;
  trickBookCount: number;
  installHint: boolean;                   // show the calm "Add to Home Screen" hint once (after run 3)
}

export const isRewardsExt = (r: RunRewards | null | undefined): r is RunRewardsExt => !!r && typeof (r as RunRewardsExt).runIndex === 'number';

/** Runs `f` with the save's crate RNG stream and stores the advanced state back. */
export function withRng<T>(s: SaveV1, f: (u: () => number) => T): T {
  const r = new Sfc32(0);
  r.setState(s.crates.rng);
  const out = f(() => r.float());
  s.crates.rng = r.getState();
  return out;
}

/** Rolls one crate (pre-committed, DESIGN §16.3): pity advanced (not for forced gifts), counted as opened, and queued
 *  as a reveal in the save. Nothing is granted until the reveal opens it (ackPending). Items already waiting in a
 *  reveal count as owned, so two queued crates never hold the same new item. */
export function commitRoll(s: SaveV1, tier: CrateTier, ctx: MetaCtx, forced?: { slot?: Slot; rarity?: Rarity }): CrateResult {
  const owned = new Set(s.owned);
  for (const p of pendingReveals(s)) if (p.item && !p.dup) owned.add(p.item);
  const out = withRng(s, (uniform) => rollCrate({ tier, pity: s.crates.pity, owned, catalog: ctx.catalog, uniform, forced }));
  const res = out.result;
  if (!forced) s.crates.pity = out.pity;
  s.crates.opened++;
  queueReveal(s, res);
  return res;
}

/** Arrival distance (m) of the k-th area visit of a run from t = 0 (k = 1: Suburbs at 0:44). */
export function arrivalDistance(k: number): number {
  const T = AREA_TIMELINE;
  return sAt(k <= 0 ? 0 : T.firstVisitSec + T.gatewaySec + (k - 1) * (T.visitSec + T.gatewaySec));
}

const areaName = (a: AreaId) => ({ downtown: 'Downtown', suburbs: 'Suburbs', docks: 'Docks', neon: 'Neon City' })[a];
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(1, Math.round(m))} m`);
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** The one next goal (DESIGN §17.2): the closest of next level, wishlist, free crate, next area, or the best.
 *  A level the held XP already guarantees (runs 1–3) is not a goal to chase; it is shown only when nothing else is. */
export function nextGoal(s: Readonly<SaveV1>, r: Pick<RunResult, 'distance'> | null, ctx: MetaCtx): NextGoal {
  const c: NextGoal[] = [];
  const toNext = xpToNext(s.xp.level), into = s.xp.intoLevel + s.xp.held;
  const levelGoal: NextGoal = into >= toNext
    ? { kind: 'level', text: `Level ${s.xp.level + 1} on your next run`, progress: 1 }
    : { kind: 'level', text: `Level ${s.xp.level + 1} in ${fmt(toNext - into)} XP`, progress: into / toNext };
  if (into < toNext) c.push(levelGoal);
  if (s.wishlist && s.xp.level >= UNLOCK_LEVEL.wishlist) {
    const it = ctx.byId.get(s.wishlist);
    if (it && !s.owned.includes(it.id)) {
      const need = wishPrice(s, it, ctx);
      const have = Math.min(need, s.wallet.coins);
      c.push(have >= need
        ? { kind: 'wishlist', text: `${it.name}: you can buy it now`, progress: 1 }
        : { kind: 'wishlist', text: `${it.name} ${fmt(have)}/${fmt(need)}`, progress: have / need });
    }
  }
  if (s.xp.level >= UNLOCK_LEVEL.crateMeter) {
    const span = meterSpan(s.crateMeter.nextAt);
    const left = Math.max(0, s.crateMeter.nextAt - s.crateMeter.metres);
    c.push({ kind: 'crate', text: `${km(left)} to a free crate`, progress: Math.min(0.999, 1 - left / span) });
  }
  const dist = r?.distance ?? 0;
  for (let k = 1; k < AREA_ORDER.length; k++) {
    const a = AREA_ORDER[k]!;
    if (s.postcards.includes(a)) continue;
    const at = arrivalDistance(k);
    if (dist < at) c.push({ kind: 'area', text: `${areaName(a)}: ${fmt(at - dist)} m further`, progress: dist / at });
    break;
  }
  if (r && s.stats.bestDist > dist + 1) {
    c.push({ kind: 'best', text: `${fmt(s.stats.bestDist - dist)} m to your best`, progress: dist / s.stats.bestDist });
  }
  if (!c.length) c.push(levelGoal);
  let best = c[0]!;
  for (const g of c) if (g.progress > best.progress + 1e-9) best = g;
  return { ...best, progress: Math.max(0, Math.min(1, best.progress)) };
}

/** The span of the Crate Meter's current stretch (the first crate at 4 km, then every 8 km). */
export const meterSpan = (nextAt: number) => (nextAt <= CRATE_METER.first ? CRATE_METER.first : CRATE_METER.every);

/** What the wishlist item costs today: the featured price when it is in today's picks (the Results bar, the goal line
 *  and RunRewards.wishlist all use this). */
export function wishPrice(s: Readonly<SaveV1>, it: CosmeticItem, ctx: Pick<MetaCtx, 'today'>): number {
  return s.shop.featuredDay === ctx.today && s.shop.featured.includes(it.id) ? featuredPrice(it) : basePrice(it);
}

/** Applies a finished run to `s` (call inside save.mutate). Not idempotent by itself: the caller checks runId. */
export function applyRunRules(s: SaveV1, r: RunResult, ctx: MetaCtx): { rewards: RunRewardsExt; track: { e: string; p: Record<string, string | number | boolean | object> }[] } {
  const track: { e: string; p: Record<string, string | number | boolean | object> }[] = [];
  const runIndex = s.stats.runs + 1;
  const capped = cappedRun(runIndex);
  const coinsBefore = s.wallet.coins;
  const score = Math.max(0, Math.floor(r.score));
  const distance = Math.max(0, r.distance);
  const newBest = runIndex > 1 && score > s.stats.best;

  // Trick Book, postcards, areas.
  const newTricks: TrickId[] = [];
  for (const id of TRICK_BOOK) if ((r.tricks[id] ?? 0) > 0 && !s.trickBook.includes(id)) newTricks.push(id);
  const postcards: AreaId[] = [];
  if (!s.postcards.includes('downtown')) postcards.push('downtown');
  const newAreas: AreaId[] = [];
  for (const a of r.areasReached) if (a !== r.startArea && !s.postcards.includes(a) && !newAreas.includes(a)) newAreas.push(a);
  postcards.push(...newAreas.filter((a) => !postcards.includes(a)));

  // Coins.
  const warmupApplied = s.daily.lastWarmupDay !== ctx.today;
  const pickups = Math.max(0, Math.floor(r.coins));
  const coins = {
    pickups, payouts: Math.max(0, Math.floor(r.coinPayouts)),
    score: Math.floor(Math.sqrt(score / COINS.scoreDiv)),
    warmup: warmupApplied ? pickups * (COINS.warmupMult - 1) : 0,
    newBest: newBest ? COINS.newBest : 0, total: 0,
  };
  coins.total = coins.pickups + coins.payouts + coins.score + coins.warmup + coins.newBest;
  addCoins(s, coins.total);
  if (warmupApplied) s.daily.lastWarmupDay = ctx.today;

  // XP and levels.
  const parts = runXp({ score, distance, newTricks: newTricks.length, newAreas: newAreas.length, newBest, runIndex });
  const xpBefore = { level: s.xp.level, into: s.xp.intoLevel, toNext: xpToNext(s.xp.level) };
  const step = addXp(s.xp, parts.total, capped);
  s.xp = { total: step.total, level: step.level, intoLevel: step.intoLevel, held: step.held };

  const rewards: Reward[] = [];
  const unlocks: RunRewardsExt['unlocks'] = [];
  let pending: CrateResult | null = null;
  let levelCoins = 0;
  for (const L of step.levelsGained) {
    track.push({ e: 'level_up', p: { level: L, runsTotal: runIndex } });
    for (const g of levelGrants(L)) {
      if (g.kind === 'coins') { levelCoins += addCoins(s, g.amount); rewards.push({ kind: 'coins', amount: g.amount, source: `Level ${L}` }); }
      else if (g.kind === 'item') {
        const gr = grantItem(s, g.id, ctx.byId);
        rewards.push({ kind: 'item', id: g.id, duplicateCoins: gr.dup ? gr.coins : 0 });
      } else if (g.kind === 'crate') {
        if (!COMPLIANCE.cratesEnabled) {
          const v = g.count * complianceValue(g.tier);
          levelCoins += addCoins(s, v); rewards.push({ kind: 'coins', amount: v, source: `Level ${L}` });
        } else if (g.forced) {
          pending = commitRoll(s, g.tier, ctx, g.forced);           // queued behind any unfinished reveal, never lost
          rewards.push({ kind: 'crate', tier: g.tier, count: g.count, forced: g.forced });
        } else {
          s.crates.held[g.tier] += g.count;
          rewards.push({ kind: 'crate', tier: g.tier, count: g.count });
        }
      } else if (g.kind === 'title') { if (!s.titles.includes(g.name)) s.titles.push(g.name); rewards.push({ kind: 'title', name: g.name }); }
      else if (g.kind === 'badge') { if (!s.badges.includes(g.id)) s.badges.push(g.id); rewards.push({ kind: 'badge', id: g.id }); }
      else if (g.kind === 'unlock') unlocks.push(g.what);
    }
  }

  // Crate Meter: a free Street Crate at 4 km of total distance, then every 8 km.
  s.crateMeter.metres += distance;
  let granted = 0;
  while (s.crateMeter.metres >= s.crateMeter.nextAt) { granted++; s.crateMeter.nextAt += CRATE_METER.every; }
  if (granted) {
    if (COMPLIANCE.cratesEnabled) { s.crates.held[CRATE_METER.tier] += granted; rewards.push({ kind: 'crate', tier: CRATE_METER.tier, count: granted }); }
    else { const v = granted * complianceValue(CRATE_METER.tier); levelCoins += addCoins(s, v); rewards.push({ kind: 'coins', amount: v, source: 'Crate Meter' }); }
  }

  // Stats, bests, books.
  const st = s.stats;
  st.runs = runIndex;
  if (score > st.best) st.best = score;
  st.bestDist = Math.max(st.bestDist, distance);
  st.bestTime = Math.max(st.bestTime, Math.max(0, r.durationS));
  st.bestCombo = Math.max(st.bestCombo, Math.max(0, Math.floor(r.bestCombo)));
  const rank = (a: AreaId) => AREA_ORDER.indexOf(a);
  for (const a of [r.furthestArea, ...r.areasReached]) if (rank(a) > rank(st.furthestArea)) st.furthestArea = a;
  st.totalDist += distance;
  st.totalTime += Math.max(0, r.durationS);
  st.longestGrind = Math.max(st.longestGrind, Math.max(0, r.longestGrind));
  for (const [id, n] of Object.entries(r.tricks)) if (n && n > 0) st.tricks[id as TrickId] = (st.tricks[id as TrickId] ?? 0) + n;
  for (const a of new Set<AreaId>([r.startArea, ...r.areasReached])) st.areaVisits[a] = (st.areaVisits[a] ?? 0) + 1;
  s.trickBook.push(...newTricks);
  for (const a of postcards) if (!s.postcards.includes(a)) s.postcards.push(a);
  // Crash streak (DESIGN §12.5 re-teaching: M4 re-arms a hint after 3 runs on the same hazard kind).
  const kind = r.crash?.obstacleKind ?? r.crash?.cause ?? null;
  if (kind) s.onboarding.crashStreak = s.onboarding.crashStreak?.kind === kind ? { kind, runs: s.onboarding.crashStreak.runs + 1 } : { kind, runs: 1 };
  else s.onboarding.crashStreak = null;
  const installHint = runIndex >= 3 && !s.onboarding.installHintShown;
  s.lastRunId = r.runId;
  s.lastPlayed = ctx.now;

  track.push({ e: 'trick_counts', p: { ...r.tricks } });

  const wish = s.wishlist ? ctx.byId.get(s.wishlist) : undefined;
  const out: RunRewardsExt = {
    coins,
    xp: { gained: parts.total, levelBefore: xpBefore.level, levelAfter: s.xp.level, intoLevel: s.xp.intoLevel, toNext: xpToNext(s.xp.level) },
    rewards, newTricks, newAreas, newBest,
    crateMeter: { metres: s.crateMeter.metres, nextAt: s.crateMeter.nextAt, granted },
    wishlist: wish && !s.owned.includes(wish.id) ? { id: wish.id, have: Math.min(s.wallet.coins, wishPrice(s, wish, ctx)), need: wishPrice(s, wish, ctx) } : null,
    nextGoal: nextGoal(s, r, ctx),
    runId: r.runId, runIndex, capped, xpParts: parts, xpBefore, levelUps: step.levelsGained, held: s.xp.held,
    unlocks, postcards, pending, coinsBefore, coinsAfter: s.wallet.coins, levelCoins, warmupApplied,
    trickBookCount: s.trickBook.length, installHint,
  };
  return { rewards: out, track };
}
