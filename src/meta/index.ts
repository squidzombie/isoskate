// meta/: economy, progression, shop, crates, offers and analytics (MU). Public surface (TECH §4.13).
// M0 stub: applyRun pays pickups + distance-based coins (1 per 20 m) and simple XP, idempotent per runId;
// the shop/crate/daily APIs are inert. TODO(MU): DESIGN §14 and §16 rules in economy.config.ts.
import type { ItemId, Slot } from '../core/ids';
import type { CosmeticItem, Loadout } from '../core/cosmetics';
import type { CrateResult, MetaApi, RunRewards } from '../core/meta';
import type { Analytics } from '../core/platform';
import type { SaveStore } from '../core/save';
import type { RunResult } from '../core/sim';

const PRICE = { common: 300, rare: 900, epic: 2400, legendary: 6000 } as const;
export const xpToNext = (level: number) => Math.round(60 * level ** 1.5 + 90);

function levelFor(total: number): { level: number; into: number; toNext: number } {
  let level = 1, rest = total;
  while (rest >= xpToNext(level)) { rest -= xpToNext(level); level++; }
  return { level, into: rest, toNext: xpToNext(level) };
}

export function createMeta(save: SaveStore, catalog: readonly CosmeticItem[]): MetaApi {
  let lastRewards: { runId: string; rewards: RunRewards } | null = null;
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const look = <T extends CosmeticItem['look']>(slot: Slot, id: ItemId): T =>
    (byId.get(id) ?? catalog.find((c) => c.slot === slot)!).look as T;

  return {
    catalog: () => catalog,
    loadout(): Loadout {
      const e = save.data.equipped;
      return { skater: look('skater', e.skater), board: look('board', e.board), helmet: look('helmet', e.helmet) };
    },
    applyRun(r: RunResult): RunRewards {
      if (save.data.lastRunId === r.runId && lastRewards?.runId === r.runId) return lastRewards.rewards;
      const before = levelFor(save.data.xp.total);
      const newBest = save.data.stats.runs > 0 && r.score > save.data.stats.best;
      const distCoins = Math.floor(Math.max(0, r.distance) / 20);
      const total = r.coins + distCoins;
      const xpGained = Math.floor(r.score / 50) + Math.floor(Math.max(0, r.distance) / 10);
      let rewards: RunRewards;
      if (save.data.lastRunId === r.runId) {
        // Already applied (e.g. after a reload): report it, change nothing.
        rewards = emptyRewards(before, save.data.crateMeter);
      } else {
        save.mutate((s) => {
          s.lastRunId = r.runId;
          s.lastPlayed = Date.now();
          s.wallet.coins += total; s.wallet.earnedTotal += total;
          s.xp.total += xpGained;
          const lv = levelFor(s.xp.total);
          s.xp.level = lv.level; s.xp.intoLevel = lv.into;
          s.stats.runs++;
          s.stats.best = Math.max(s.stats.best, r.score);
          s.stats.bestDist = Math.max(s.stats.bestDist, r.distance);
          s.stats.bestTime = Math.max(s.stats.bestTime, r.durationS);
          s.stats.totalDist += r.distance; s.stats.totalTime += r.durationS;
          s.crateMeter.metres += r.distance;
        });
        save.flush();
        const after = levelFor(save.data.xp.total);
        rewards = {
          coins: { pickups: r.coins, payouts: r.coinPayouts, score: distCoins, warmup: 0, newBest: 0, total },
          xp: { gained: xpGained, levelBefore: before.level, levelAfter: after.level, intoLevel: after.into, toNext: after.toNext },
          rewards: [], newTricks: [], newAreas: [], newBest,
          crateMeter: { ...save.data.crateMeter, granted: 0 },
          wishlist: null,
          nextGoal: { kind: 'best', text: `Best ${Math.round(save.data.stats.bestDist)} m`, progress: Math.min(1, r.distance / Math.max(1, save.data.stats.bestDist)) },
        };
      }
      lastRewards = { runId: r.runId, rewards };
      return rewards;
    },
    canAfford: (price) => save.data.wallet.coins >= price,
    price(id) { const it = byId.get(id); return { base: it ? PRICE[it.rarity] : 0, featured: null }; },
    buy: () => false,
    equip(id) {
      const it = byId.get(id);
      if (!it || !save.data.owned.includes(id)) return;
      save.mutate((s) => { s.equipped[it.slot] = id; });
    },
    setWishlist(id) { save.mutate((s) => { s.wishlist = id; }); },
    featured: () => [],
    crateOdds: () => ({}),
    buyCrate: () => false,
    openCrate(tier): CrateResult { return { tier, rarity: 'coins', item: null, coins: 0, dup: false }; },
    pendingReveal: () => null,
    ackReveal() { /* no-op */ },
    dailyGiftReady: () => false,
    claimDailyGift() { /* no-op */ },
    levelInfo() { const l = levelFor(save.data.xp.total); return { level: l.level, into: l.into, toNext: l.toNext }; },
  };
}

function emptyRewards(lv: { level: number; into: number; toNext: number }, meter: { metres: number; nextAt: number }): RunRewards {
  return {
    coins: { pickups: 0, payouts: 0, score: 0, warmup: 0, newBest: 0, total: 0 },
    xp: { gained: 0, levelBefore: lv.level, levelAfter: lv.level, intoLevel: lv.into, toNext: lv.toNext },
    rewards: [], newTricks: [], newAreas: [], newBest: false,
    crateMeter: { ...meter, granted: 0 }, wishlist: null, nextGoal: { kind: 'best', text: '', progress: 0 },
  };
}

/** Local analytics ring buffer (500 events, opt-out honoured). No network in v1 (DESIGN §21). */
export function createAnalytics(save: SaveStore): Analytics {
  const buf: { e: string; t: number; p?: object }[] = [];
  let optOut = save.data.settings.analyticsOptOut;
  return {
    track(event, props) {
      if (optOut) return;
      buf.push(props ? { e: event, t: Date.now(), p: props } : { e: event, t: Date.now() });
      if (buf.length > 500) buf.shift();
    },
    setOptOut(on) { optOut = on; if (on) buf.length = 0; },
    buffer: () => buf,
  };
}
