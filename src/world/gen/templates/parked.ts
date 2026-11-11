// world/gen/templates/parked.ts: Phase B parked rows (THEME §3.4, theme T8; DESIGN §10.4): cars as the main blocker.
// One per area. The vehicles stand in painted bays along ONE side only, parallel to s, an empty bay apart (≥ 0.6 m;
// out of each other's 35° shadow, validator rule g) and all facing the same way (rear to the camera); never two rows
// facing each other, never a row in the centre lanes. The other side carries the area's trick line, so riding past a
// row is a line, not a wait.
//   DT_PARKED_ROW   T1–T2  4.0 s  3–4 cars in the curb lane (±2.15; a plaza: its edge), a ledge on the far side
//   SB_DRIVEWAY_ROW T1–T2  4.0 s  3–4 cars on the driveway aprons (±3.5, curb cuts behind them), a garden wall on the far side
//   IN_LOADING_ROW  T1–T2  4.2 s  3 box trucks backed up along the dock band (−3.25), an I-beam on the apron
//   NE_TAXI_RANK    T1–T2  4.0 s  3–4 taxis in the curb lane (±2.15), a glowing guard rail on the far side
import { round1cm } from '../../../core/math';
import type { Obstacle } from '../../../core/world';
import { buildLedge } from '../props/downtown';
import { buildIbeam } from '../props/docks';
import { buildGuardRail } from '../props/neon';
import { buildGardenWall } from '../props/suburbs';
import { buildTall } from '../props/common';
import { buildCurbCar, carDriveways, rowGap, skinVariant } from '../props/shared';
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
    // (a plaza has no curb lane: the cars stand in bays along its edge, half up on the paving)
    const sd = side(c), tA = contentFrom(c) + 0.6, slot = c.layout.curbX === null ? 1 : 0;
    const [s0, s1] = row(c, sOf(tA), c.rng.int(3, 4), 4.4, 1.4, (s) => buildCurbCar(s, sd, c.props, c.rng.int(0, 7), 0, slot));
    const ledge = put(c, buildLedge(round1cm(s0 + c.v * 0.2), round1cm(-sd * 3.75), round1cm(s1 - s0), c.props));
    edgeCoins(c, ledge);
    return { t1: endAfter(c, 0.6) };
  },
};

export const SB_DRIVEWAY_ROW: Template = {
  id: 'SB_DRIVEWAY_ROW', area: 'suburbs', tiers: [1, 2], durMax: 4.4, mirror: true,
  build(c: TemplateCtx): TemplateOut | null {
    if (c.layout.curbX === null) return null;
    // Parked on the driveway aprons beside the road (sidewalk and lawn band), the curb cut behind each car.
    const sd = side(c), tA = contentFrom(c) + 0.6;
    const [s0, s1] = row(c, sOf(tA), 4, 4.6, 1.5, (s) => {
      const ob = buildCurbCar(s, sd, c.props, c.rng.int(0, 7));
      if (ob) c.driveways.push(...carDriveways([ob]));
      return ob;
    });
    // A garden wall on the far sidewalk past the row (grind or manual on top).
    const wall = put(c, buildGardenWall(round1cm(s0 + c.v * 0.2), round1cm(-sd * 3.2), round1cm(Math.max(3, s1 - s0)), c.props));
    c.coins.string(wall.s + 0.3 * c.v, wall.s + wall.len - 0.2 * c.v, wall.x, wall.solids[0]!.box.y1 + GEN.coins.edgeUp, c.v);
    return { t1: endAfter(c, 0.6) };
  },
};

export const IN_LOADING_ROW: Template = {
  id: 'IN_LOADING_ROW', area: 'docks', tiers: [1, 2], durMax: 4.6, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    // Box trucks backed up along the dock band (a container-size truck skin), an I-beam on the apron beside them.
    const tA = contentFrom(c) + 0.6;
    const [s0, s1] = row(c, sOf(tA), 3, 6.1, 2.6, (s) => {
      const ob = buildTall('container', s, -3.25, 6.1, 2.4, 2.6, c.props, { variant: c.rng.int(0, 7) });
      ob.variant = skinVariant(ob, (k) => k.body === 'box_truck' && !k.nosedIn);
      return ob;
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
