// world/gen/templates/downtown.ts: the M0 Downtown templates (DESIGN §10.4). In M0 every area falls back to these.
//   DT_LEDGE   T1(–T2) 2.5 s  one ledge (road edge or sidewalk), 1.2–2 s long; T2 adds a parked car opposite
//   DT_BENCHES T1      2.5 s  3 benches in a row 0.5 s apart ("Bench Hop" gaps); safe line on the other half
// TODO(WG): DT_LEDGE_PAIR, DT_PLANTERS, DT_BOLLARDS, DT_FOUNTAIN, DT_TERRACE, DT_CROSSWALK, DT_HUBBA_KIOSK, DT_RUSH, DT_BIG7.
import { clamp, round1cm } from '../../../core/math';
import { sAt, tAt } from '../../../core/tuning';
import { ObTag } from '../../../core/world';
import { GEN } from '../gen.config';
import { SIDEWALK_Y } from '../props/common';
import { buildParkedCar, buildLedge } from '../props/downtown';
import { buildBench } from '../props/shared';
import { MOVE_MIN } from '../safe';
import type { Template, TemplateCtx, TemplateOut } from './types';
import { moveStart } from './shared';

/** Lateral clearance of the safe line from a trick-line body's centre: half width + half hitbox + margin + tube. */
const clearOf = (halfW: number) => halfW + 0.2 + 0.1 + 0.5;

/** Keep the safe line clear of a lane [lx ± halfW]: move to `away` if needed. Returns the time the line is clear. */
function clearLane(c: TemplateCtx, lx: number, halfW: number, away: number): number {
  const x0 = c.line.x;
  const between = Math.abs(lx) > 3 && Math.abs(x0) > Math.abs(lx) && Math.sign(x0) === Math.sign(lx);
  if (Math.abs(x0 - lx) >= clearOf(halfW) && !between) return c.t0;
  const target = round1cm(clamp(away, -2.8, 2.8));
  const start = Math.abs(target - x0) >= MOVE_MIN ? moveStart(c) : c.t0 + 0.1;
  return c.line.moveTo(target, start);
}

export const DT_LEDGE: Template = {
  id: 'DT_LEDGE', tiers: [1, 2],
  build(c: TemplateCtx): TemplateOut {
    const v = c.v;
    const side = c.rng.chance(0.5) ? 1 : -1;
    const sidewalk = c.rng.chance(0.5);
    const lx = round1cm(side * (sidewalk ? c.rng.range(3.4, 3.8) : c.rng.range(1.8, 2.6)));
    const ground = sidewalk ? SIDEWALK_Y : 0;
    const len = round1cm(clamp(v * c.rng.range(1.2, 2.0), 4, 22));
    let lane = lx - side * c.rng.range(1.7, 2.4);
    let carX = 0;
    if (c.tier >= 2) {
      carX = -side * 2.1;
      const inner = lx - side * 0.3, carInner = carX + side * 0.9;
      lane = (inner + carInner) / 2;
    }
    const clearAt = c.tier >= 2 ? c.line.moveTo(round1cm(lane), Math.abs(lane - c.line.x) >= MOVE_MIN ? moveStart(c) : c.t0 + 0.1)
      : clearLane(c, lx, 0.3, lane);
    const tA = Math.max(c.t0 + 0.5, clearAt + GEN.arriveMargin + 0.1);
    const sA = round1cm(sAt(tA));
    const ledge = buildLedge(sA, lx, len, c.props, ground);
    c.obstacles.push(ledge);
    let sEnd = sA + ledge.len;
    if (c.tier >= 2) {
      const tCar = tA + c.rng.range(0.1, 0.6) * (len / v);
      const car = buildParkedCar(round1cm(sAt(tCar)), round1cm(carX), c.props, c.rng.int(0, 5));
      c.obstacles.push(car);
      sEnd = Math.max(sEnd, car.s + car.len);
    }
    c.coins.edge(sA + 0.3 * v, sA + ledge.len - 0.2 * v, lx, ground + 0.45, v);
    return { t1: tAt(sEnd) + 0.7, mirror: side < 0 };
  },
};

export const DT_BENCHES: Template = {
  id: 'DT_BENCHES', tiers: [1],
  build(c: TemplateCtx): TemplateOut {
    const v = c.v;
    const side = c.rng.chance(0.5) ? 1 : -1;
    const sidewalk = c.rng.chance(0.3);
    const bx = round1cm(side * (sidewalk ? 3.75 : c.rng.range(1.7, 2.5)));
    const ground = sidewalk ? SIDEWALK_Y : 0;
    const clearAt = clearLane(c, bx, 0.25, bx - side * c.rng.range(1.7, 2.4));
    const tA = Math.max(c.t0 + 0.5, clearAt + GEN.arriveMargin + 0.1);
    let prev = -1;
    let sEnd = 0;
    const sA = round1cm(sAt(tA));
    for (let k = 0; k < 3; k++) {
      const s = round1cm(sAt(tA + 0.5 * k));
      const b = buildBench(s, bx, c.props, ground, ObTag.TrickLine);
      if (prev >= 0) b.gap = { name: 'Bench Hop', pts: 200, fromObstacle: prev };
      prev = b.id;
      c.obstacles.push(b);
      sEnd = s + b.len;
    }
    c.coins.string(sA + 0.2, sEnd - 0.2, bx, ground + 0.45 + GEN.coins.edgeUp, v);
    return { t1: tAt(sEnd) + 0.7, mirror: side < 0 };
  },
};
