// world/gen/templates/neon.ts: the Neon City (Hoshimachi Ward) v1 templates (DESIGN §10.4).
//   NE_RAIL     T1  3.0 s  a glowing guard rail along ±2.95, 1.5–3 s long               (long glowing grind)
//   NE_PILLARS  T2  3.5 s  median pillars every 1.3 s, split lanes, a rail on one lane   (pick a side, switch at gaps)
//   NE_VENDING  T2  3.0 s  vending banks narrowing the sidewalks, benches               (bench grinds)
//   NE_SAKURA   T2  3.0 s  staggered cherry planters                                     (rim grinds, lanes between)
//   NE_SKYWALK  T3  6.0 s  "Sora Line Skywalk": 20 m incline up to the +2.0 m deck, rails, 2 m drop (landmark, ≥ 90 s)
//   NE_GAUNTLET T4  4.0 s  pillars + holo gate + rail transfer                           (transfer → gate flip)
import { clamp, round1cm } from '../../../core/math';
import { sAt, speedAt, tAt } from '../../../core/tuning';
import { GEN } from '../gen.config';
import { buildDeck } from '../props/docks';
import { buildCherryPlanter, buildGuardRail, buildPillar, buildVending } from '../props/neon';
import { buildBarrier, buildBench } from '../props/shared';
import type { Template, TemplateCtx, TemplateOut } from './types';
import { actFrom, contentFrom, edgeCoins, endAfter, put, side, sOf } from './util';

const RAIL_X = 2.95;

export const NE_RAIL: Template = {
  id: 'NE_RAIL', area: 'neon', tiers: [1], durMax: 3.6, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    const sd = side(c);
    const rail = put(c, buildGuardRail(sOf(contentFrom(c) + 0.3), round1cm(sd * RAIL_X), c.v * c.rng.range(1.5, 2.4), c.props));
    edgeCoins(c, rail);
    return { t1: endAfter(c, 0.7) };
  },
};

export const NE_PILLARS: Template = {
  id: 'NE_PILLARS', area: 'neon', tiers: [2, 3], durMax: 4.0, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    const tA = contentFrom(c) + 0.6;
    for (let k = 0; k < 3; k++) put(c, buildPillar(sOf(tA + k * 1.3), 0, c.props));
    const rail = put(c, buildGuardRail(sOf(tA + 0.3), round1cm(side(c) * RAIL_X), c.v * 2.2, c.props));
    edgeCoins(c, rail);
    return { t1: endAfter(c, 0.6) };
  },
};

export const NE_VENDING: Template = {
  id: 'NE_VENDING', area: 'neon', tiers: [2], durMax: 3.6, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    // Vending banks on both sidewalks (fronts to the camera), staggered; two benches on the road edges.
    // Each bench sits on the side of the bank before it, so its exit zone (±1.5 m, 0.6 s) never meets the next bank.
    const tA = contentFrom(c) + 0.4, f = side(c);
    for (const [k, sd] of [[0, -1], [1, 1], [2, -1]] as const) {
      const m = c.rng.int(1, 2);
      put(c, buildVending(sOf(tA + k * 0.7), round1cm(f * sd * (4.5 - m / 2)), m, c.props, c.rng.int(0, 5)));
    }
    for (let k = 0; k < 2; k++) {
      const b = put(c, buildBench(sOf(tA + 0.3 + k * 0.9), round1cm(f * (k ? 1 : -1) * c.rng.range(1.5, 2.1)), c.props));
      edgeCoins(c, b);
    }
    return { t1: endAfter(c, 0.6) };
  },
};

export const NE_SAKURA: Template = {
  id: 'NE_SAKURA', area: 'neon', tiers: [2, 3], durMax: 3.6, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    let sd = side(c);
    const tA = contentFrom(c) + 0.4, n = c.rng.int(3, 4);
    for (let k = 0; k < n; k++) {
      const p = put(c, buildCherryPlanter(sOf(tA + k * 0.75), round1cm(sd * c.rng.range(1.5, 2.1)), c.props));
      if (k % 2 === 0) edgeCoins(c, p);
      sd = -sd as 1 | -1;
    }
    return { t1: endAfter(c, 0.6) };
  },
};

export const NE_SKYWALK: Template = {
  id: 'NE_SKYWALK', area: 'neon', tiers: [3], durMax: 6.6, mirror: true, fromT: 90,
  build(c: TemplateCtx): TemplateOut | null {
    const v = c.v;
    if (v < 8.9 - 1e-6) return null;
    const sd = side(c);
    const x0 = sd > 0 ? 1.5 : -4.5, x1 = sd > 0 ? 4.5 : -1.5;
    const tA = contentFrom(c) + 0.7;
    const deckLen = round1cm(clamp(v * c.rng.range(2.2, 2.8), 20, 45));
    const deck = put(c, buildDeck({ kind: 'skywalk', s: sOf(tA), inclineLen: 20, deckLen, x0, x1, h: 2.0, body: 'plate', rails: 'both',
      material: 'neon', landmark: 'Sora Line Skywalk', variant: 0 }, c.props));
    const top = c.datum + 2.0;
    c.coins.string(deck.s + 21, deck.s + deck.len - 3, (x0 + x1) / 2, top + GEN.coins.padUp, v);
    c.coins.gold(deck.s + deck.len - 1.5, (x0 + x1) / 2, top + 0.6);
    return { t1: tAt(deck.s + deck.len + 3.4) + 0.6 };
  },
};

export const NE_GAUNTLET: Template = {
  id: 'NE_GAUNTLET', area: 'neon', tiers: [4], durMax: 4.6, mirror: true, fullWidth: true,
  build(c: TemplateCtx): TemplateOut {
    // Pillars on the median, guard rails both sides (transfer across), then a holo gate (flip it).
    const tA = contentFrom(c) + 0.4;
    put(c, buildPillar(sOf(tA + 0.3), 0, c.props));
    const r1 = put(c, buildGuardRail(sOf(tA), round1cm(-RAIL_X), c.v * 1.1, c.props));
    const r2 = put(c, buildGuardRail(sOf(tA + 1.0), round1cm(RAIL_X), c.v * 1.0, c.props));
    r2.gap = { name: 'Neon Transfer', pts: 300, fromObstacle: r1.id };
    edgeCoins(c, r1); edgeCoins(c, r2);
    const tTake = Math.max(actFrom(c), tAt(r2.s + r2.len) + 0.9);
    const s = sAt(tTake + 0.3) - 0.3;
    put(c, buildBarrier(round1cm(s), 0.45, speedAt(tTake), c.props));
    c.coins.gold(s, 0, c.datum + 1.3);
    return { t1: tTake + 0.6 + GEN.noActionTail + 0.25, fullWidth: true };
  },
};
