// world/gen/props/downtown.ts: Downtown Plaza builders (DESIGN §10.3): granite ledges, planters (with tree variants),
// parked cars, kiosks, café sets and bike racks. Stairs, terraces, rails and hubbas are shared (props/shared.ts).
import { round1cm } from '../../../core/math';
import type { Obstacle } from '../../../core/world';
import { ObTag } from '../../../core/world';
import { buildProp, buildTall, lowGround, type PropCtx } from './common';

/** Granite ledge 4–22 × 0.6 × 0.45: landable top, both long edges grindable (DESIGN §10.3). */
export function buildLedge(s: number, x: number, len: number, p: PropCtx, tags: number = ObTag.TrickLine, wid = 0.6): Obstacle {
  return buildProp({ kind: 'granite_ledge', s, x, len: Math.min(22, Math.max(4, len)), wid, hgt: 0.45, ground: lowGround(x, wid, p), tags,
    edges: [{ side: -1, kind: 'ledge', material: 'stone' }, { side: 1, kind: 'ledge', material: 'stone' }] }, p);
}

/** Planter 3.0 × 1.5 × 0.50 (long axis along s): rim grinds on the long rims, rideable top. With a tree, the central
 *  trunk (0.3 Ø × 2.6) is a tall crash solid, so the top is not a line (DESIGN §10.3). */
export function buildPlanter(s: number, x: number, tree: boolean, p: PropCtx, tags: number = ObTag.TrickLine): Obstacle {
  const ob = buildProp({ kind: tree ? 'planter_tree' : 'planter', s, x, len: 3.0, wid: 1.5, hgt: 0.5, ground: lowGround(x, 1.5, p), tags,
    surface: 'concrete', edges: [{ side: -1, kind: 'rim', material: 'concrete' }, { side: 1, kind: 'rim', material: 'concrete' }] }, p);
  if (tree) {
    const g = ob.solids[0]!.box.y0;
    ob.solids.push({ box: { s0: round1cm(s + 1.35), s1: round1cm(s + 1.65), x0: round1cm(x - 0.15), x1: round1cm(x + 0.15),
      y0: g, y1: round1cm(g + 2.6) }, top: 'crash', tall: true });
    ob.params = { trunkH: 2.6 };
  }
  return ob;
}

/** Parked car 4.4 × 1.8 × 1.4 (tall, in the parking bays); `van` 4.6 × 1.9 × 1.9 (Suburbs). */
export function buildParkedCar(s: number, x: number, p: PropCtx, variant = 0, van = false): Obstacle {
  return van ? buildTall('parked_van', s, x, 4.6, 1.9, 1.9, p, { variant })
    : buildTall('parked_car', s, x, p.area === 'suburbs' ? 4.6 : 4.4, p.area === 'suburbs' ? 1.9 : 1.8, p.area === 'suburbs' ? 1.5 : 1.4, p, { variant });
}

export const buildKiosk = (s: number, x: number, p: PropCtx, variant = 0) => buildTall('kiosk', s, x, 1.6, 1.6, 2.4, p, { variant });
export const buildCafeSet = (s: number, x: number, p: PropCtx, variant = 0) => buildTall('cafe_set', s, x, 1.2, 1.2, 1.2, p, { variant, params: { canopyY: 2.2 } });
export const buildBikeRack = (s: number, x: number, p: PropCtx) => buildTall('bike_rack', s, x, 2.4, 0.7, 1.15, p);
