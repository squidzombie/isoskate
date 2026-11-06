// sim/pickups.ts: coins and the run markers (TECH §6.3 step 8): hazard warnings (warnAtS), area and gateway entry
// (a gateway entry banks the combo; arriving in a new area pays New Ground), the BEST line and speed tiers.
import { SPEED_TIERS } from '../core/tuning';
import { SCORE, addBonus, bank } from '../tricks';
import type { Ctx } from './state';

/** Coin pickup volume around the skater's centre (board bottom + 0.75 m), DESIGN §10.8. */
export const COIN_VOLUME = { lat: 0.3, fwd: 0.4, vert: 0.7, centreUp: 0.75 } as const;
const CHAIN_TICKS = 30;
const PRUNE_EVERY = 600;

export function pickups(k: Ctx): void {
  const st = k.st, c = st.cur;
  if (c.mode === 'crashed') return;
  const cy = c.p.y + COIN_VOLUME.centreUp;
  for (const coin of k.world.coins(c.p.s - COIN_VOLUME.fwd, c.p.s + COIN_VOLUME.fwd)) {
    if (st.collected.has(coin.id)) continue;
    // Inclusive bounds (+1 µm): a coin string on a 0.6 m ledge's centre is exactly 0.3 m from either grind edge.
    if (Math.abs(coin.p.x - c.p.x) > COIN_VOLUME.lat + 1e-6 || Math.abs(coin.p.y - cy) > COIN_VOLUME.vert + 1e-6) continue;
    st.collected.add(coin.id);
    st.coinChain = c.tick - st.lastCoinTick <= CHAIN_TICKS ? st.coinChain + 1 : 0;
    st.lastCoinTick = c.tick;
    st.score.coins += coin.value;
    k.ev.push({ t: 'coin', tick: c.tick, id: coin.id, value: coin.value, p: coin.p, chain: st.coinChain });
  }
  // Ids are only ever looked up near the skater: forget the ones far behind now and then (bounded snapshots).
  if (c.tick % PRUNE_EVERY === 0) {
    for (const set of [st.collected, st.warned, st.knocked, st.ghosted]) {
      if (set.size < 64) continue;
      const keep = new Set<number>();
      for (const ob of k.obs) if (set.has(ob.id)) keep.add(ob.id);
      if (set === st.collected) for (const coin of k.world.coins(c.p.s - 2, c.p.s + 2)) if (set.has(coin.id)) keep.add(coin.id);
      set.clear();
      for (const id of keep) set.add(id);
    }
  }
}

export function markers(k: Ctx): void {
  const st = k.st, c = st.cur, pv = st.prev, sc = st.score;
  // Hazard warnings: the full-width hazard's warnAtS is crossed (1.6 s out).
  for (const ob of k.obs) {
    if (ob.warnAtS === undefined || st.warned.has(ob.id)) continue;
    if (pv.p.s < ob.warnAtS && c.p.s >= ob.warnAtS) {
      st.warned.add(ob.id);
      k.ev.push({ t: 'hazardWarn', tick: c.tick, obstacleId: ob.id, kind: ob.kind, inSec: (ob.s - c.p.s) / c.vel.s });
    }
  }
  // Areas and gateways (world/gen's pure timeline).
  const a = k.gen.areaAt(c.p.s);
  if (a.gateway !== st.gateway) {
    st.gateway = a.gateway;
    if (a.gateway) {
      k.ev.push({ t: 'gatewayEnter', tick: c.tick, gateway: a.gateway });
      bank(sc, k.ev, c.tick, 'gateway');
    }
  }
  if (a.area !== st.area) {
    st.area = a.area;
    // Arrivals through a gateway count; the starting area never counts as "reached" (DESIGN §12.1).
    const first = !sc.areasReached.includes(a.area) && a.area !== (st.cfg.startArea ?? 'downtown');
    if (first) sc.areasReached.push(a.area);
    sc.furthestArea = a.area;
    k.ev.push({ t: 'areaEnter', tick: c.tick, area: a.area, firstThisRun: first });
    addBonus(sc, k.ev, c.tick, c.mode, 'newGround', 'New Ground', SCORE.bonus.newGround, false);
  }
  // BEST line.
  const dist = c.p.s - st.s0;
  if (!st.bestPassed && st.cfg.bestDist > 0 && dist >= st.cfg.bestDist) {
    st.bestPassed = true;
    k.ev.push({ t: 'bestPassed', tick: c.tick, dist: st.cfg.bestDist });
  }
  // Speed tiers.
  let tier: 0 | 1 | 2 | 3 = 0;
  for (let i = 0; i < SPEED_TIERS.length; i++) if (c.vel.s >= SPEED_TIERS[i]! - 1e-9) tier = (i + 1) as 1 | 2 | 3;
  if (tier !== st.tier) { st.tier = tier; k.ev.push({ t: 'speedTier', tick: c.tick, tier }); }
}
