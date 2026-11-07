// world/gen/templates/suburbs.ts: the Suburbs v1 templates (DESIGN §10.4).
//   SB_WALL      T1  2.5 s  a long garden wall on the sidewalk / lawn side          (grind or manual on top)
//   SB_HILL      T0  3.0 s  a 1:15 dip and crest (breather)                          (crest flips)
//   SB_DRIVEWAYS T2  3.0 s  parked cars jutting out of driveways, alternating sides  (curb grinds, pick)
//   SB_BINDAY    T2  3.0 s  bin pairs every 0.6 s, alternating                       (curb grinds between, pick)
//   SB_PICKET    T3  3.5 s  hedges narrow the street to the road; a mailbox slalom    (curb runs)
//   SB_SCOOPS    T2  3.0 s  "Corner Scoops wall": a long low wall outside the ice-cream shop (landmark)
import { clamp, round1cm } from '../../../core/math';
import { tAt } from '../../../core/tuning';
import { GEN } from '../gen.config';
import { buildParkedCar } from '../props/downtown';
import { buildDip } from '../props/shared';
import { buildBins, buildGardenWall, buildHedge, buildMailbox } from '../props/suburbs';
import type { Template, TemplateCtx, TemplateOut } from './types';
import { contentFrom, edgeCoins, endAfter, put, side, sOf } from './util';

/** Lateral position of a wall on the sidewalk band (x ∈ ±[2.6, 3.8]) or the lawn edge. */
const wallX = (c: TemplateCtx, sd: number): number => round1cm(sd * (c.rng.chance(0.6) ? 3.2 : 2.15));

export const SB_WALL: Template = {
  id: 'SB_WALL', area: 'suburbs', tiers: [1], durMax: 3.4, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    const sd = side(c), x = wallX(c, sd);
    const w = put(c, buildGardenWall(sOf(contentFrom(c) + 0.3), x, c.v * c.rng.range(1.4, 2.2), c.props));
    c.coins.string(w.s + 0.3 * c.v, w.s + w.len - 0.2 * c.v, x, w.solids[0]!.box.y1 + GEN.coins.edgeUp, c.v);
    return { t1: endAfter(c, 0.7) };
  },
};

export const SB_HILL: Template = {
  id: 'SB_HILL', area: 'suburbs', tiers: [0], durMax: 3.2, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    const tA = c.t0 + 0.3, len = round1cm(c.v * 2.4), depth = round1cm(len / 2 / 15);
    const s = sOf(tA);
    put(c, buildDip(s, len, depth, c.props));
    c.cuts.push([s, s + len]);
    // Coins on the crests (free) and a wave through the dip.
    c.coins.wave(tA, tAt(s + len), c.safeX, 1.0, c.coinRng.range(0, 6.28), c.datum + GEN.coins.groundY - depth * 0.5);
    return { t1: Math.min(c.maxT1, tAt(s + len) + 0.5), t0Stretch: true };
  },
};

export const SB_DRIVEWAYS: Template = {
  id: 'SB_DRIVEWAYS', area: 'suburbs', tiers: [2, 3], durMax: 3.6, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    // Cars nose-out of driveways at ±2.35 (jutting into the road), alternating sides 0.95 s apart; curb cuts there.
    let sd = side(c);
    const tA = contentFrom(c) + 0.7;
    for (let k = 0; k < 3; k++) {
      const s = sOf(tA + k * 0.95);
      const car = put(c, buildParkedCar(s, round1cm(sd * 2.35), c.props, c.rng.int(0, 5), c.rng.chance(0.3)));
      c.driveways.push([car.s - 0.4, car.s + car.len + 0.4, sd]);
      sd = -sd as 1 | -1;
    }
    // Curb coins on the long curb run before the first car (pick a grind there).
    c.coins.string(sOf(c.t0 + 0.4), sOf(tA) - 1.0, side(c) * 2.6, c.datum + 0.15 + GEN.coins.edgeUp, c.v);
    return { t1: endAfter(c, 0.6) };
  },
};

export const SB_BINDAY: Template = {
  id: 'SB_BINDAY', area: 'suburbs', tiers: [2, 3], durMax: 3.6, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    // Bin pairs on the road edge (1.5 m across, centred ±1.85) every 0.6 s, alternating: weave down the centre.
    let sd = side(c);
    const tA = contentFrom(c) + 0.7, n = c.rng.int(4, 5);
    for (let k = 0; k < n; k++) {
      put(c, buildBins(sOf(tA + k * 0.6), round1cm(sd * 1.85), c.props, k % 4));
      // Curb coins between the bins on the other side.
      if (k < n - 1) c.coins.add(sOf(tA + k * 0.6 + 0.3), -sd * 2.6, c.datum + 0.15 + GEN.coins.edgeUp, 'trick');
      sd = -sd as 1 | -1;
    }
    return { t1: endAfter(c, 0.6) };
  },
};

export const SB_PICKET: Template = {
  id: 'SB_PICKET', area: 'suburbs', tiers: [3, 4], durMax: 4.0, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    // Hedge / picket runs along both sidewalks (x = ±3.05) and a mailbox slalom on the road (±1.1, 0.75 s apart).
    const tA = contentFrom(c) + 0.5, v = c.v;
    const sA = sOf(tA), len = v * 2.6;
    for (const sd of [-1, 1] as const) put(c, buildHedge(sA, round1cm(sd * 3.05), len, c.props, c.rng.chance(0.5), c.rng.int(0, 3)));
    let sd = side(c);
    for (let k = 0; k < 3; k++) {
      put(c, buildMailbox(sOf(tA + 0.6 + k * 0.75), round1cm(sd * 1.1), c.props, k));
      sd = -sd as 1 | -1;
    }
    // Curb runs (pick): coins along one curb.
    c.coins.string(sA + 1.0, sA + len - 1.0, side(c) * 2.6, c.datum + 0.15 + GEN.coins.edgeUp, v);
    return { t1: endAfter(c, 0.6) };
  },
};

export const SB_SCOOPS: Template = {
  id: 'SB_SCOOPS', area: 'suburbs', tiers: [2], durMax: 3.6, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    const sd = side(c), x = round1cm(sd * 3.2);
    const w = put(c, buildGardenWall(sOf(contentFrom(c) + 0.3), x, clamp(c.v * c.rng.range(2.0, 2.4), 8, 24), c.props, undefined, 'Corner Scoops wall'));
    edgeCoins(c, w);
    c.coins.gold(w.s + w.len - 0.6, x, w.solids[0]!.box.y1 + 0.6);
    w.params = { ...w.params, shop: 1 };
    return { t1: endAfter(c, 0.7) };
  },
};
