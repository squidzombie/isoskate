// world/gen/templates/parked.ts: Phase B parked rows (THEME §3.4, theme T8; DESIGN §10.4), reworked for "where they
// stopped": occasional street set pieces, not the main blocker. One per area. The vehicles stand along ONE kerb only,
// in the road and inside it (never on a sidewalk or a lawn), parallel to s, an empty bay apart (≥ 0.6 m; out of each
// other's 35° shadow, validator rule g), each facing its own traffic (the generator's traffic pass, faceTraffic): one
// row, one side, so the whole row faces one way. Never two rows facing each other, never a row in the centre lanes.
// The other side carries the area's trick line, so riding past a row is a line, not a wait.
//   DT_PARKED_ROW   T1–T2  4.0 s  3–4 cars at the kerb (±2.05, painted bays); none on a plaza
//   SB_DRIVEWAY_ROW T1–T2  4.0 s  3–4 cars at the kerb in front of the houses (±1.62; the id is kept from Phase B, when
//                                 they stood on the driveway aprons), a garden wall on the far sidewalk
//   IN_LOADING_ROW  T1–T2  4.2 s  3 box trucks backed up along the dock band (−3.25), an I-beam on the apron
//   NE_TAXI_RANK    T1–T2  4.0 s  3–4 taxis at the kerb (±2.05), a glowing guard rail on the far side
import { round1cm } from '../../../core/math';
import type { Obstacle } from '../../../core/world';
import { buildLedge } from '../props/downtown';
import { buildIbeam } from '../props/docks';
import { buildGuardRail } from '../props/neon';
import { buildGardenWall } from '../props/suburbs';
import { buildTall } from '../props/common';
import { buildCurbCar, rowGap, skinVariant } from '../props/shared';
import { GEN } from '../gen.config';
import type { Template, TemplateCtx, TemplateOut } from './types';
import { contentFrom, edgeCoins, endAfter, put, side, sOf } from './util';

/** Up to n vehicles from s along one side (each `make(s)`), an empty bay apart: the gap keeps each car out of the
 *  one before's 35° shadow (rowGap, validator rule g), so it is ≥ 0.6 m and reads as bays. The count fits the
 *  vehicles into ~2.8 s at the template's speed. Returns [first s, last end s]. */
function row(c: TemplateCtx, s: number, n: number, len: number, h: number, make: (s: number) => Obstacle | null): [number, number] {
  const gap = rowGap(h), fit = Math.max(2, Math.floor((c.v * 2.8 + gap) / (len + gap)));
  let at = s, end = s;
  for (let k = 0; k < Math.min(n, fit); k++) {
    const ob = make(round1cm(at));
    if (!ob) break;
    put(c, ob);
    end = ob.s + ob.len;
    at = end + gap + c.rng.range(0, 0.5);
  }
  return [s, end];
}

export const DT_PARKED_ROW: Template = {
  id: 'DT_PARKED_ROW', area: 'downtown', tiers: [1, 2], durMax: 4.4, mirror: true,
  build(c: TemplateCtx): TemplateOut | null {
    // (a plaza is a pedestrian square: no cars on it)
    if (c.layout.curbX === null) return null;
    const sd = side(c), tA = contentFrom(c) + 0.6;
    const [s0, s1] = row(c, sOf(tA), c.rng.int(3, 4), 4.4, 1.4, (s) => buildCurbCar(s, sd, c.props, c.rng.int(0, 7)));
    const ledge = put(c, buildLedge(round1cm(s0 + c.v * 0.2), round1cm(-sd * 3.75), round1cm(s1 - s0), c.props));
    edgeCoins(c, ledge);
    return { t1: endAfter(c, 0.6) };
  },
};

export const SB_DRIVEWAY_ROW: Template = {
  id: 'SB_DRIVEWAY_ROW', area: 'suburbs', tiers: [1, 2], durMax: 4.4, mirror: true,
  build(c: TemplateCtx): TemplateOut | null {
    if (c.layout.curbX === null) return null;
    // Parked along the kerb in front of the houses (in the road, 0.03 m off the kerb).
    const sd = side(c), tA = contentFrom(c) + 0.6;
    const [s0, s1] = row(c, sOf(tA), 4, 4.6, 1.5, (s) => buildCurbCar(s, sd, c.props, c.rng.int(0, 7)));
    // A garden wall on the far sidewalk past the row (grind or manual on top).
    const wall = put(c, buildGardenWall(round1cm(s0 + c.v * 0.2), round1cm(-sd * 3.2), round1cm(Math.max(3, s1 - s0)), c.props));
    c.coins.string(wall.s + 0.3 * c.v, wall.s + wall.len - 0.2 * c.v, wall.x, wall.solids[0]!.box.y1 + GEN.coins.edgeUp, c.v);
    return { t1: endAfter(c, 0.6) };
  },
};

export const IN_LOADING_ROW: Template = {
  id: 'IN_LOADING_ROW', area: 'docks', tiers: [1, 2], durMax: 4.6, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    // Box trucks backed up along the dock band (a container-size truck skin), an I-beam on the apron beside them. A
    // truck whose skin search misses is left out (never a shipping container in a row of trucks).
    const tA = contentFrom(c) + 0.6;
    const [s0, s1] = row(c, sOf(tA), 3, 6.1, 2.6, (s) => {
      const ob = buildTall('container', s, -3.25, 6.1, 2.4, 2.6, c.props, { variant: c.rng.int(0, 7) });
      ob.variant = skinVariant(ob, (k) => k.body === 'box_truck');
      return ob.variant < 0 ? null : ob;
    });
    const beam = put(c, buildIbeam(round1cm(s0 + c.v * 0.3), round1cm(c.rng.range(0.6, 2.2)), round1cm(Math.max(4, s1 - s0 - c.v * 0.6)), c.props));
    edgeCoins(c, beam);
    return { t1: endAfter(c, 0.6) };
  },
};

export const NE_TAXI_RANK: Template = {
  id: 'NE_TAXI_RANK', area: 'neon', tiers: [1, 2], durMax: 4.4, mirror: true,
  build(c: TemplateCtx): TemplateOut | null {
    if (c.layout.curbX === null) return null;
    const sd = side(c), tA = contentFrom(c) + 0.6;
    const [s0, s1] = row(c, sOf(tA), c.rng.int(3, 4), 4.4, 1.4, (s) => buildCurbCar(s, sd, c.props, c.rng.int(0, 7)));
    const rail = put(c, buildGuardRail(round1cm(s0 + c.v * 0.2), round1cm(-sd * 2.95), round1cm(s1 - s0), c.props));
    edgeCoins(c, rail);
    return { t1: endAfter(c, 0.6) };
  },
};
