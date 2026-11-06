// world/gen/props/downtown.ts: Downtown Plaza builders used by the M0 templates (DESIGN §10.3).
// TODO(WG): planter, planter_tree, fountain, bollard_row, kiosk, bike_rack, cafe_set, terrace, crosswalk_car.
import type { Obstacle } from '../../../core/world';
import { ObTag } from '../../../core/world';
import { buildProp, type PropCtx } from './common';

/** Granite ledge 4–22 × 0.6 × 0.45: landable top, both long edges grindable (DESIGN §10.3). */
export function buildLedge(s: number, x: number, len: number, p: PropCtx, ground = 0, tags = ObTag.TrickLine): Obstacle {
  return buildProp({ kind: 'granite_ledge', s, x, len: Math.min(22, Math.max(4, len)), wid: 0.6, hgt: 0.45, ground, tags,
    edges: [{ side: -1, kind: 'ledge', material: 'stone' }, { side: 1, kind: 'ledge', material: 'stone' }] }, p);
}

/** Parked car 4.4 × 1.8 × 1.4 (tall, in the parking bays). */
export function buildParkedCar(s: number, x: number, p: PropCtx, variant = 0): Obstacle {
  return buildProp({ kind: 'parked_car', s, x, len: 4.4, wid: 1.8, hgt: 1.4, variant }, p);
}
