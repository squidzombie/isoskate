// meta/ economy tables and rules (TECH §11.1, ROADMAP W3a): XP values, the level track references only existing
// items, odds sum to 1, pity at exactly 10 / 40 / 10, duplicate preference, score coins, the onboarding cap, applyRun
// idempotent per runId, crate results persisted before the reveal, no negative coins, featured per date.
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../src/content';
import type { AreaId, ItemId, TrickId } from '../../../src/core/ids';
import type { RunResult } from '../../../src/core/sim';
import {
  addXp, applyRunRules, arrivalDistance, BEYOND_30, cappedRun, COINS, CRATES, crateOdds, crateValue, createMetaImpl, DUPLICATE_VALUE,
  featuredFor, isRewardsExt, LEVEL_REWARDS, levelGrants, nextGoal, PITY, PRICE, rollCrate, xpToNext, xpToReach,
  type MetaCtx, type RunRewardsExt,
} from '../../../src/meta';
import { createStorage, makeDefaults, Store, type StorageLike } from '../../../src/save';

const byId = new Map(CATALOG.map((c) => [c.id, c]));
const NOW = new Date(2026, 10, 6, 18, 0, 0).getTime();          // local 2026-11-06 18:00
const ctx = (now = NOW): MetaCtx => ({ catalog: CATALOG, byId, today: localDayOf(now), now });
function localDayOf(ms: number) { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

let runN = 0;
export function run(o: Partial<RunResult> & { tricks?: Partial<Record<TrickId, number>> } = {}): RunResult {
  return {
    runId: `run-${++runN}`, seed: 1, mode: 'normal', startArea: 'downtown', score: 0, trickPts: 0, distance: 0, durationS: 0,
    coins: 0, coinPayouts: 0, bestCombo: 0, maxLinks: 0, lostCombo: 0, furthestArea: 'downtown', areasReached: [], maxSpeed: 7,
    tricks: {}, longestGrind: 0, crash: { cause: 'slam', obstacleKind: 'trash_can', state: 'roll', t: 30, flipProgress: 0, spinProgress: 0 },
    ...o,
  };
}
/** Typical onboarding runs (DESIGN §14.4): run 1 is the Lesson Line into Suburbs, runs 2–3 are ordinary first runs. */
const TYPICAL: Partial<RunResult>[] = [
  { score: 5200, distance: 560, durationS: 76, coins: 24, areasReached: ['suburbs'], furthestArea: 'suburbs',
    tricks: { ollie: 9, fiftyFifty: 2, kickflip: 2, boardslide: 1, manual: 1, fs180: 1 } },
  { score: 6400, distance: 610, durationS: 82, coins: 31, areasReached: ['suburbs'], furthestArea: 'suburbs',
    tricks: { ollie: 12, fiftyFifty: 3, kickflip: 3, heelflip: 2, manual: 1 } },
  { score: 9100, distance: 760, durationS: 98, coins: 44, areasReached: ['suburbs', 'docks'], furthestArea: 'docks',
    tricks: { ollie: 14, fiftyFifty: 3, kickflip: 4, heelflip: 2, popShuvit: 2, fiveO: 1, manual: 2 } },
];

function memStore(seed = 11, now = NOW) {
  const m = new Map<string, string>();
  const b: StorageLike = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
  return { m, b, store: () => new Store(createStorage(b), { now: () => now, seed }) };
}

describe('XP curve (DESIGN §14.2, exponent 1.5)', () => {
  it('matches the table', () => {
    expect([1, 2, 3, 5, 10, 20, 29].map(xpToNext)).toEqual([150, 260, 402, 761, 1987, 5457, 9460]);
    expect(xpToNext(30)).toBe(10_000);
    expect(xpToNext(57)).toBe(10_000);
  });
  it('total XP to reach Level 30 is about 116k', () => {
    expect(xpToReach(30)).toBeGreaterThan(114_000);
    expect(xpToReach(30)).toBeLessThan(118_000);
  });
  it('uncapped addXp crosses every threshold; capped holds the overflow', () => {
    const a = addXp({ total: 0, level: 1, intoLevel: 0, held: 0 }, 1000, false);
    expect(a.levelsGained).toEqual([2, 3, 4]);                     // 150 + 260 + 402 = 812
    expect(a.intoLevel).toBe(188);
    const b = addXp({ total: 0, level: 1, intoLevel: 0, held: 0 }, 1000, true);
    expect(b.levelsGained).toEqual([2]);
    expect(b).toMatchObject({ level: 2, intoLevel: 0, held: 850, total: 1000 });
    const c = addXp(b, 0, false);                                  // the held XP is released at the next results
    expect(c.levelsGained).toEqual([3, 4]);
    expect(c).toMatchObject({ level: 4, intoLevel: 188, held: 0 });
    expect(cappedRun(1) && cappedRun(3) && !cappedRun(4)).toBe(true);
  });
});

describe('level rewards (DESIGN §14.2)', () => {
  it('L1–L30 all defined and reference only existing items; L30 is the Golden Hour board', () => {
    for (let L = 1; L <= 30; L++) {
      const g = LEVEL_REWARDS[L];
      expect(g, `L${L}`).toBeDefined();
      expect(g!.length).toBeGreaterThan(0);
      for (const x of g!) if (x.kind === 'item') expect(byId.has(x.id), `L${L} ${x.id}`).toBe(true);
    }
    expect(LEVEL_REWARDS[30]!.some((x) => x.kind === 'item' && x.id === 'bd_golden_hour')).toBe(true);
    expect(byId.get('bd_golden_hour')!.source).toBe('level30');
    const items = (L: number) => LEVEL_REWARDS[L]!.filter((x) => x.kind === 'item').map((x) => (x as { id: ItemId }).id);
    expect(items(1)).toEqual(['sk_juno', 'bd_plain_maple', 'hm_classic']);
    expect(items(4)).toEqual(['bd_sunset_stripe']);
    expect(items(15)).toEqual(['sk_ines']);
    expect(LEVEL_REWARDS[2]![0]).toEqual({ kind: 'crate', tier: 'street', count: 1, forced: { slot: 'skater', rarity: 'rare' } });
    expect(LEVEL_REWARDS[3]!.some((x) => x.kind === 'coins' && x.amount === 300)).toBe(true);
  });
  it('beyond L30: 500 coins every level, a Pro Crate every 5th, a star every 10th', () => {
    expect(levelGrants(31)).toEqual([{ kind: 'coins', amount: BEYOND_30.coins }]);
    expect(levelGrants(35).some((g) => g.kind === 'crate' && g.tier === 'pro')).toBe(true);
    expect(levelGrants(40).some((g) => g.kind === 'badge')).toBe(true);
  });
});

describe('crates (DESIGN §16.3)', () => {
  it('odds sum to 1 for every tier; expected values match the design', () => {
    for (const t of ['cardboard', 'street', 'pro'] as const) {
      const sum = Object.values(crateOdds(t)).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 12);
    }
    expect(crateValue('street', PRICE)).toBeCloseTo(573, 0);
    expect(crateValue('pro', PRICE)).toBeCloseTo(1788, 0);
    expect(CRATES.street.price).toBe(450);
    expect(CRATES.pro.price).toBe(1500);
  });
  /** Opens `n` crates with the worst possible luck (u = 0 every time) and returns the rarities. */
  const worstLuck = (tier: 'street' | 'pro', n: number) => {
    let pity = { streetEpic: 0, streetLegendary: 0, proLegendary: 0 };
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const r = rollCrate({ tier, pity, owned: new Set(), catalog: CATALOG, uniform: () => 0 });
      pity = r.pity; out.push(r.result.rarity);
    }
    return out;
  };
  it('pity triggers at exactly the 10th Street crate (Epic+) and the 40th (Legendary)', () => {
    const r = worstLuck('street', 40);
    expect(r.slice(0, 9).every((x) => x === 'common')).toBe(true);
    expect(r[9]).toBe('epic');
    expect(r.slice(10, 19).every((x) => x === 'common')).toBe(true);
    expect(r[19]).toBe('epic');
    expect(r[29]).toBe('epic');
    expect(r.slice(30, 39).every((x) => x === 'common')).toBe(true);
    expect(r[39]).toBe('legendary');
    expect(PITY).toEqual({ streetEpic: 10, streetLegendary: 40, proLegendary: 10 });
  });
  it('pity triggers at exactly the 10th Pro crate (Legendary)', () => {
    const r = worstLuck('pro', 20);
    expect(r.slice(0, 9).every((x) => x === 'rare')).toBe(true);
    expect(r[9]).toBe('legendary');
    expect(r[19]).toBe('legendary');
  });
  it('a lucky Epic resets the Epic+ counter; a Legendary resets both', () => {
    const base = { tier: 'street' as const, owned: new Set<string>(), catalog: CATALOG };
    const epic = rollCrate({ ...base, pity: { streetEpic: 5, streetLegendary: 5, proLegendary: 0 }, uniform: () => 0.96 });
    expect(epic.result.rarity).toBe('epic');
    expect(epic.pity).toMatchObject({ streetEpic: 0, streetLegendary: 6 });
    const leg = rollCrate({ ...base, pity: { streetEpic: 5, streetLegendary: 5, proLegendary: 0 }, uniform: () => 0.999 });
    expect(leg.result.rarity).toBe('legendary');
    expect(leg.pity).toMatchObject({ streetEpic: 0, streetLegendary: 0 });
  });
  it('rolls prefer items you do not own; a duplicate only once the whole tier is owned', () => {
    const rares = CATALOG.filter((c) => c.rarity === 'rare' && c.slot === 'skater').map((c) => c.id);
    const owned = new Set(rares.slice(0, -1));
    for (const u of [0, 0.3, 0.7, 0.99]) {
      const r = rollCrate({ tier: 'street', pity: { streetEpic: 0, streetLegendary: 0, proLegendary: 0 }, owned, catalog: CATALOG,
        uniform: () => u, forced: { slot: 'skater', rarity: 'rare' } });
      expect(r.result).toMatchObject({ item: rares[rares.length - 1], dup: false, coins: 0 });
    }
    const all = rollCrate({ tier: 'street', pity: { streetEpic: 0, streetLegendary: 0, proLegendary: 0 }, owned: new Set(rares), catalog: CATALOG,
      uniform: () => 0.5, forced: { slot: 'skater', rarity: 'rare' } });
    expect(all.result.dup).toBe(true);
    expect(all.result.coins).toBe(DUPLICATE_VALUE.rare);
  });
  it('the L30 board never drops; Cardboard pays 60–120 coins or an item', () => {
    for (let i = 0; i < 200; i++) {
      const u = i / 200;
      const r = rollCrate({ tier: 'pro', pity: { streetEpic: 0, streetLegendary: 0, proLegendary: 0 }, owned: new Set(), catalog: CATALOG, uniform: () => u });
      expect(r.result.item).not.toBe('bd_golden_hour');
      const c = rollCrate({ tier: 'cardboard', pity: { streetEpic: 0, streetLegendary: 0, proLegendary: 0 }, owned: new Set(), catalog: CATALOG, uniform: () => u });
      if (c.result.rarity === 'coins') { expect(c.result.coins).toBeGreaterThanOrEqual(60); expect(c.result.coins).toBeLessThanOrEqual(120); }
      else expect(['common', 'rare']).toContain(c.result.rarity);
    }
  });
});

describe('coins (DESIGN §14.1)', () => {
  it('score coins = floor(sqrt(score / 400)): 8k → 4, 40k → 10, 160k → 20', () => {
    for (const [score, want] of [[8000, 4], [40_000, 10], [160_000, 20], [0, 0], [399, 0]] as const) {
      const s = makeDefaults(0, 1); s.stats.runs = 5; s.daily.lastWarmupDay = ctx().today;
      const { rewards } = applyRunRules(s, run({ score }), ctx());
      expect(rewards.coins.score, String(score)).toBe(want);
    }
    expect(COINS.scoreDiv).toBe(400);
  });
  it('the first run of a local day doubles pickups (warm-up), later runs do not; New Best +25 not on run 1', () => {
    const s = makeDefaults(0, 1);
    const a = applyRunRules(s, run({ coins: 30, score: 1000 }), ctx()).rewards;
    expect(a.coins).toMatchObject({ pickups: 30, warmup: 30, newBest: 0 });
    const b = applyRunRules(s, run({ coins: 30, score: 2000 }), ctx()).rewards;
    expect(b.coins).toMatchObject({ pickups: 30, warmup: 0, newBest: 25 });
    expect(b.coins.total).toBe(30 + 25 + Math.floor(Math.sqrt(2000 / 400)));
    const next = applyRunRules(s, run({ coins: 10 }), ctx(NOW + 24 * 3600e3)).rewards;
    expect(next.coins.warmup).toBe(10);
  });
});

describe('onboarding cap (DESIGN §14.2, §14.4)', () => {
  it('runs 1, 2, 3 end at exactly Levels 2, 3, 4 for typical XP', () => {
    const s = makeDefaults(0, 1);
    const levels: number[] = [], gained: number[] = [];
    for (const t of TYPICAL) {
      const { rewards } = applyRunRules(s, run(t), ctx());
      levels.push(rewards.xp.levelAfter); gained.push(rewards.xp.gained);
      expect(rewards.levelUps.length).toBeLessThanOrEqual(1);
    }
    expect(levels).toEqual([2, 3, 4]);
    expect(gained[0]).toBeGreaterThanOrEqual(350);
    expect(gained[0]).toBeLessThanOrEqual(550);
  });
  it('holds for light and heavy onboarding runs too (one level per results screen), and releases at run 4', () => {
    for (const scale of [0.8, 1, 2, 6]) {
      const s = makeDefaults(0, 1);
      const lv = TYPICAL.map((t) => applyRunRules(s, run({ ...t, score: (t.score ?? 0) * scale, distance: (t.distance ?? 0) * scale }), ctx()).rewards.xp.levelAfter);
      expect(lv, `×${scale}`).toEqual([2, 3, 4]);
      const r4 = applyRunRules(s, run({ score: 6000, distance: 600 }), ctx()).rewards;
      expect(r4.capped).toBe(false);
      expect(r4.xp.levelAfter).toBeGreaterThanOrEqual(4);
      expect(s.xp.held).toBe(0);
    }
  });
  it('run 1: no New Best XP, Trick Book entries at 25, Suburbs 150, Downtown postcard granted, Level 2 crate pre-rolled as a Rare skater', () => {
    const s = makeDefaults(0, 1);
    const { rewards } = applyRunRules(s, run(TYPICAL[0]), ctx());
    expect(rewards.xpParts).toMatchObject({ best: 0, tricks: 6 * 25, areas: 150 });
    expect(rewards.postcards).toEqual(['downtown', 'suburbs']);
    expect(rewards.pending).not.toBeNull();
    const it2 = byId.get(rewards.pending!.item!)!;
    expect(it2.slot).toBe('skater'); expect(it2.rarity).toBe('rare');
    expect(s.owned).toContain(it2.id);                           // granted now; the reveal only shows it
    expect(s.crates.pending).toEqual(rewards.pending);
    expect(s.crates.pity).toEqual({ streetEpic: 0, streetLegendary: 0, proLegendary: 0 });   // gifts don't move pity
  });
  it('run 2 reaches Level 3: 300 coins and the shop and wishlist unlock; run 3 Level 4: Sunset Stripe, Crate Meter, Trick Book', () => {
    const s = makeDefaults(0, 1);
    const r = TYPICAL.map((t) => applyRunRules(s, run(t), ctx()).rewards);
    expect(r[1]!.rewards).toContainEqual({ kind: 'coins', amount: 300, source: 'Level 3' });
    expect(r[1]!.unlocks).toEqual(['shop', 'wishlist']);
    expect(r[2]!.rewards).toContainEqual({ kind: 'item', id: 'bd_sunset_stripe', duplicateCoins: 0 });
    expect(r[2]!.unlocks).toEqual(['crateMeter', 'trickBook']);
    expect(r[2]!.installHint).toBe(true);
  });
});

describe('applyRun through the store (idempotent per runId, flush points)', () => {
  it('a second applyRun of the same run changes nothing, before and after a reload', () => {
    const { store } = memStore();
    const save = store();
    const meta = createMetaImpl(save, CATALOG, { now: () => NOW });
    const r = run(TYPICAL[0]);
    const a = meta.applyRun(r);
    const coins = save.data.wallet.coins, xp = save.data.xp.total;
    expect(meta.applyRun(r)).toBe(a);
    const save2 = store();                                          // reload: flushed at run end
    expect(save2.data.lastRunId).toBe(r.runId);
    const meta2 = createMetaImpl(save2, CATALOG, { now: () => NOW });
    const b = meta2.applyRun(r);
    expect(save2.data.wallet.coins).toBe(coins);
    expect(save2.data.xp.total).toBe(xp);
    expect(b.coins.total).toBe(0);
    expect(isRewardsExt(b)).toBe(true);
  });
  it('the crate result is written before the reveal and resumes after a reload, never rerolled', () => {
    const { store } = memStore(5);
    const save = store();
    save.mutate((s) => { s.crates.held.street = 2; });
    const meta = createMetaImpl(save, CATALOG, { now: () => NOW });
    const res = meta.openCrate('street');
    const reloaded = createMetaImpl(store(), CATALOG, { now: () => NOW });     // "reload mid-reveal"
    expect(reloaded.pendingReveal()).toEqual(res);
    expect(reloaded.openCrate('street')).toEqual(res);                         // resumes, does not roll the 2nd crate
    expect(reloaded.crateHeld('street')).toBe(1);
    reloaded.ackReveal();
    expect(createMetaImpl(store(), CATALOG, { now: () => NOW }).pendingReveal()).toBeNull();
  });
  it('no negative coins: buying without funds fails and changes nothing; the shop opens at Level 3', () => {
    const { store } = memStore();
    const save = store();
    const meta = createMetaImpl(save, CATALOG, { now: () => NOW });
    save.mutate((s) => { s.wallet.coins = 5000; });
    expect(meta.buy('bd_mint_chip')).toBe(false);                               // Level 1: shop closed
    save.mutate((s) => { s.xp.level = 3; s.wallet.coins = 100; });
    expect(meta.buy('bd_mint_chip')).toBe(false);
    expect(meta.buyCrate('street')).toBe(false);
    expect(save.data.wallet.coins).toBe(100);
    save.mutate((s) => { s.wallet.coins = 300; });
    const p = meta.price('bd_mint_chip');
    expect(p.base).toBe(300);
    save.mutate((s) => { s.wallet.coins = p.featured ?? p.base; });
    expect(meta.buy('bd_mint_chip')).toBe(true);
    expect(save.data.wallet.coins).toBe(0);
    expect(meta.buy('bd_mint_chip')).toBe(false);                               // already owned
    expect(meta.buy('bd_golden_hour')).toBe(false);                             // L30 only
    meta.equip('bd_mint_chip');
    expect(store().data.equipped.board).toBe('bd_mint_chip');                   // purchase and equip are flush points
  });
  it('the daily gift: one Cardboard crate per local day, at most one held, no streaks', () => {
    let now = NOW;
    const { store } = memStore();
    const meta = createMetaImpl(store(), CATALOG, { now: () => now });
    expect(meta.dailyGiftReady()).toBe(true);
    meta.claimDailyGift();
    expect(meta.dailyGiftReady()).toBe(false);
    expect(meta.crateHeld('cardboard')).toBe(1);
    now += 24 * 3600e3;
    expect(meta.dailyGiftReady()).toBe(false);                                  // yesterday's is still held
    meta.openCrate('cardboard'); meta.ackReveal();
    expect(meta.dailyGiftReady()).toBe(true);
    now += 5 * 24 * 3600e3;                                                     // missed days: no penalty
    expect(meta.dailyGiftReady()).toBe(true);
  });
});

describe('featured row (DESIGN §16.2)', () => {
  it('deterministic per date, one per slot band, unowned only, 25% off', () => {
    const a = featuredFor('2026-11-06', new Set(), CATALOG);
    expect(featuredFor('2026-11-06', new Set(), CATALOG)).toEqual(a);
    expect(a.length).toBe(3);
    const r = a.map((id) => byId.get(id)!.rarity);
    expect(['common', 'rare']).toContain(r[0]);
    expect(['rare', 'epic']).toContain(r[1]);
    expect(['epic', 'legendary']).toContain(r[2]);
    const days = new Set(Array.from({ length: 10 }, (_, i) => featuredFor(`2026-11-${String(10 + i)}`, new Set(), CATALOG).join()));
    expect(days.size).toBeGreaterThan(5);
    const owned = new Set(a);
    for (const id of featuredFor('2026-11-06', owned, CATALOG)) expect(owned.has(id)).toBe(false);
    for (const id of a) expect(byId.get(id)!.source).toBe('shop');
    const { store } = memStore();
    const meta = createMetaImpl(store(), CATALOG, { now: () => NOW });
    const f = meta.featured()[0]!;
    expect(meta.price(f).featured).toBe(Math.round(PRICE[byId.get(f)!.rarity] * 0.75));
  });
});

describe('crate meter and next goal', () => {
  it('a free Street Crate at 4 km of total distance, then every 8 km', () => {
    const s = makeDefaults(0, 1);
    s.stats.runs = 5;
    const a = applyRunRules(s, run({ distance: 3999 }), ctx()).rewards;
    expect(a.crateMeter.granted).toBe(0);
    const b = applyRunRules(s, run({ distance: 2 }), ctx()).rewards;
    expect(b.crateMeter).toMatchObject({ granted: 1, nextAt: 12_000 });
    expect(s.crates.held.street).toBe(1);
    const c = applyRunRules(s, run({ distance: 8000 }), ctx()).rewards;
    expect(c.crateMeter.granted).toBe(1);
  });
  it('picks the closest goal', () => {
    const s = makeDefaults(0, 1);
    s.stats.runs = 3; s.stats.bestDist = 700; s.postcards = ['downtown', 'suburbs'];
    s.xp = { total: 0, level: 4, intoLevel: 10, held: 0 };
    const g = nextGoal(s, { distance: 650 }, ctx());
    expect(g.kind).toBe('best');
    expect(g.text).toBe('50 m to your best');
    s.wishlist = 'bd_koi_current'; s.wallet.coins = 900;
    expect(nextGoal(s, { distance: 650 }, ctx())).toMatchObject({ kind: 'wishlist', progress: 1 });
    const area: AreaId = 'docks';
    expect(arrivalDistance(2)).toBeGreaterThan(arrivalDistance(1));
    s.wishlist = null; s.stats.bestDist = 0;
    expect(nextGoal(s, { distance: arrivalDistance(2) - 100 }, ctx())).toMatchObject({ kind: 'area', text: `Docks: 100 m further` });
    expect(area).toBe('docks');
  });
  it('a typical run 2 shows a concrete goal line', () => {
    const s = makeDefaults(0, 1);
    const r = TYPICAL.slice(0, 2).map((t) => applyRunRules(s, run(t), ctx()).rewards) as RunRewardsExt[];
    expect(r[1]!.nextGoal.text.length).toBeGreaterThan(5);
  });
});
