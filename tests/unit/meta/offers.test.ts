// Monetization policy (DESIGN §20) and local analytics (DESIGN §21): ads hidden with NullProvider, never in the first
// 3 runs or on the install day, results_double_coins ≥ 20 coins / once per run / 5 per day, the gift bonus once a day;
// the analytics ring buffer keeps 500 events, persists locally and honours the opt-out.
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../src/content';
import { ANALYTICS_KEY, createAnalyticsImpl, createMetaImpl, createOfferPolicy, OFFERS } from '../../../src/meta';
import { createMonetizationImpl, NullProvider } from '../../../src/platform/monetization';
import { createStorage, Store, type StorageLike } from '../../../src/save';

const mem = () => {
  const m = new Map<string, string>();
  const b: StorageLike = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
  return { m, io: createStorage(b) };
};
const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;

describe('offer policy (meta/offers.ts)', () => {
  const view = { installDay: day(1), daily: { adsDay: null as string | null, adsCount: 0, lastGiftDay: null as string | null, giftBonusDay: null as string | null } };
  let used: string | null = null;
  const p = createOfferPolicy(() => view, () => used);
  it('never in the first 3 runs, never on the install day', () => {
    for (const runsTotal of [0, 1, 2, 3]) expect(p.eligible('results_double_coins', { runCoins: 100, runsTotal, today: day(5) })).toBe(false);
    expect(p.eligible('results_double_coins', { runCoins: 100, runsTotal: 4, today: day(1) })).toBe(false);
    expect(p.eligible('results_double_coins', { runCoins: 100, runsTotal: 4, today: day(5) })).toBe(true);
    expect(OFFERS.minRunsTotal).toBe(3);
  });
  it('double coins needs ≥ 20 run coins, at most 5 per day and once per run', () => {
    const c = { runsTotal: 10, today: day(5) };
    expect(p.eligible('results_double_coins', { ...c, runCoins: 19 })).toBe(false);
    expect(p.eligible('results_double_coins', { ...c, runCoins: 20 })).toBe(true);
    view.daily.adsDay = day(5); view.daily.adsCount = 5;
    expect(p.eligible('results_double_coins', { ...c, runCoins: 50 })).toBe(false);
    expect(p.eligible('results_double_coins', { ...c, runCoins: 50, today: day(6) })).toBe(true);   // a new day
    view.daily.adsCount = 1;
    used = 'run-a';
    expect(p.eligibleFor('results_double_coins', { ...c, runCoins: 50 }, 'run-a')).toBe(false);
    expect(p.eligibleFor('results_double_coins', { ...c, runCoins: 50 }, 'run-b')).toBe(true);
  });
  it('the daily gift bonus once per day, after the gift was claimed', () => {
    const c = { runCoins: 0, runsTotal: 10, today: day(5) };
    expect(p.eligible('daily_gift_bonus', c)).toBe(false);
    view.daily.lastGiftDay = day(5);
    expect(p.eligible('daily_gift_bonus', c)).toBe(true);
    view.daily.giftBonusDay = day(5);
    expect(p.eligible('daily_gift_bonus', c)).toBe(false);
  });
  it('NullProvider: no ad is ever ready, so no ad UI shows; ?fakeads=1 selects the FakeProvider', async () => {
    expect(NullProvider.kind).toBe('null');
    expect(NullProvider.isAdReady('results_double_coins')).toBe(false);
    expect(NullProvider.isAdReady('daily_gift_bonus')).toBe(false);
    expect(await NullProvider.showRewarded('results_double_coins')).toBe('unavailable');
    expect(createMonetizationImpl({ fakeAds: false }).kind).toBe('null');
    const fake = createMonetizationImpl({ fakeAds: true });
    expect(fake.kind).toBe('fake');
    expect(fake.isAdReady('results_double_coins')).toBe(true);
  });
  it('grantOffer doubles the run coins once and counts the day', () => {
    const { io } = mem();
    let now = new Date(2026, 10, 1, 12).getTime();
    const save = new Store(io, { now: () => now, seed: 1 });
    const meta = createMetaImpl(save, CATALOG, { now: () => now });
    save.mutate((s) => { s.stats.runs = 4; s.wallet.coins = 100; });
    expect(meta.grantOffer('results_double_coins', 'r1', 40)).toBe(0);           // install day
    now += 2 * 24 * 3600e3;
    expect(meta.grantOffer('results_double_coins', 'r1', 40)).toBe(40);
    expect(save.data.wallet.coins).toBe(140);
    expect(meta.grantOffer('results_double_coins', 'r1', 40)).toBe(0);           // once per run
    expect(save.data.daily.adsCount).toBe(1);
  });
});

describe('analytics (meta/analytics.ts)', () => {
  const setup = () => {
    const { m, io } = mem();
    const save = new Store(io, { seed: 1 });
    return { m, io, save, a: createAnalyticsImpl(save, { io, now: () => 1234, log: false }) };
  };
  it('keeps the last 500 events and persists them under dusklane.analytics', () => {
    const { m, io, save, a } = setup();
    for (let i = 0; i < 520; i++) a.track('crash', { i });
    expect(a.buffer().length).toBe(500);
    expect((a.buffer()[0]!.p as { i: number }).i).toBe(20);
    a.flush();
    expect(JSON.parse(m.get(ANALYTICS_KEY)!).length).toBe(500);
    const b = createAnalyticsImpl(save, { io, now: () => 1, log: false });
    expect(b.buffer().length).toBe(500);
  });
  it('opt-out clears the buffer and records nothing', () => {
    const { m, a } = setup();
    a.track('run_start', { seed: 1 }); a.flush();
    a.setOptOut(true);
    expect(a.buffer().length).toBe(0);
    expect(m.has(ANALYTICS_KEY)).toBe(false);
    a.track('run_start', { seed: 2 });
    expect(a.buffer().length).toBe(0);
    a.setOptOut(false);
    a.track('run_start', { seed: 3 });
    expect(a.buffer().length).toBe(1);
  });
  it('meta records its own events (purchase, equip, wishlist, crate open, level up) into the same buffer', async () => {
    const { save, a } = setup();
    const meta = createMetaImpl(save, CATALOG, { now: () => new Date(2026, 10, 6).getTime() });
    save.mutate((s) => { s.xp.level = 5; s.wallet.coins = 5000; s.crates.held.street = 1; });
    meta.setWishlist('bd_koi_current');
    meta.buy('bd_cassette'); meta.equip('bd_cassette');
    meta.openCrate('street');
    const names = a.buffer().map((e) => e.e);
    expect(names).toEqual(['wishlist_set', 'shop_purchase', 'equip', 'crate_open']);
    expect(a.buffer()[1]!.p).toMatchObject({ item: 'bd_cassette', rarity: 'common', price: 300 });
    let uploaded = 0;
    expect(await a.upload({ flush: async (ev) => { uploaded = ev.length; } })).toBe(4);
    expect(uploaded).toBe(4);
    expect(a.buffer().length).toBe(0);
  });
});
