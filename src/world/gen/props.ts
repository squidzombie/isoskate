// world/gen/props.ts: M0 grey-box prop builders. (kind, placement, size) → Obstacle in track space, 1 cm rounding.
// WG replaces this with props/{shared,downtown,suburbs,docks,neon}.ts using the DESIGN §10.3 catalog.
// Rules kept here because the sim and validator rely on them (TECH §5.1):
//  - top type: T kinds → 'landable', K kinds → 'knock', everything else → 'crash'
//  - tall = top − local ground ≥ HEIGHT.tallMin
//  - landable bodies higher than STEP_UP get a rideable top slab; edges ≤ STEP_UP above ground are pickOnly.
import type { AreaId, EdgeKind, EdgeMaterial, PropKind } from '../../core/ids';
import { round1cm } from '../../core/math';
import { HEIGHT, STEP_UP } from '../../core/tuning';
import type { GrindEdge, GroundSlab, Obstacle, Solid } from '../../core/world';
import { ObTag } from '../../core/world';

const LANDABLE: ReadonlySet<PropKind> = new Set<PropKind>(['granite_ledge', 'bench', 'planter', 'planter_tree', 'garden_wall',
  'crate_stack', 'manual_pad', 'pallet_2', 'pallet_3', 'loading_dock', 'skywalk', 'hubba', 'curb', 'neon_curb', 'cherry_planter']);
const KNOCK: ReadonlySet<PropKind> = new Set<PropKind>(['cone', 'a_frame_sign']);

export interface IdCounters { ob: number; coin: number; edge: number }

export interface PropSpec {
  kind: PropKind; area: AreaId; segment: number;
  s: number; x: number; len: number; wid: number; hgt: number;
  ground?: number;                        // local ground height under the prop (default 0)
  tags?: number;
  edges?: { side: -1 | 1; kind: EdgeKind; material: EdgeMaterial }[];   // grind edges along the long sides
  topSlab?: boolean;                      // emit a rideable top slab (landable kinds default true)
  variant?: number; warnAtS?: number; landmark?: string; gap?: Obstacle['gap'];
}

export function buildProp(spec: PropSpec, ids: IdCounters): Obstacle {
  const g = spec.ground ?? 0;
  const s0 = round1cm(spec.s), s1 = round1cm(spec.s + spec.len);
  const x0 = round1cm(spec.x - spec.wid / 2), x1 = round1cm(spec.x + spec.wid / 2);
  const top = round1cm(g + spec.hgt);
  const topType: Solid['top'] = LANDABLE.has(spec.kind) ? 'landable' : KNOCK.has(spec.kind) ? 'knock' : 'crash';
  const id = ++ids.ob;
  const solids: Solid[] = [];
  const slabs: GroundSlab[] = [];
  const edges: GrindEdge[] = [];
  if (spec.hgt > STEP_UP || topType !== 'landable') {
    solids.push({ box: { s0, s1, x0, x1, y0: g, y1: top }, top: topType, tall: spec.hgt >= HEIGHT.tallMin });
  }
  if (topType === 'landable' && (spec.topSlab ?? true)) {
    slabs.push({ s0, s1, x0, x1, y0: top, y1: top, layer: 0, surface: spec.kind === 'bench' ? 'wood' : 'granite', kind: 'flat' });
  }
  for (const e of spec.edges ?? []) {
    const ex = e.side < 0 ? x0 : x1;
    edges.push({
      id: ++ids.edge, obstacleId: id,
      a: { s: s0, x: ex, y: top }, b: { s: s1, x: ex, y: top },
      kind: e.kind, material: e.material, layer: 0, pickOnly: spec.hgt <= STEP_UP,
    });
  }
  let tags = spec.tags ?? 0;
  if (edges.length) tags |= ObTag.Grindable;
  const ob: Obstacle = {
    id, kind: spec.kind, area: spec.area, segment: spec.segment,
    s: s0, x: round1cm(spec.x), len: round1cm(s1 - s0), wid: round1cm(x1 - x0), hgt: round1cm(spec.hgt),
    rotY: 0, mirror: false, variant: spec.variant ?? 0,
    solids, slabs, pits: [], edges, tags,
  };
  if (spec.warnAtS !== undefined) ob.warnAtS = round1cm(spec.warnAtS);
  if (spec.landmark) ob.landmark = spec.landmark;
  if (spec.gap) ob.gap = spec.gap;
  return ob;
}

/** Sidewalk + curb on one side of a Downtown street segment (DESIGN §10.2): sidewalk slab at +0.15 from |x| = 3.0
 *  to 4.5, with one pick-only curb edge along its outer top edge facing the road. */
export function buildCurb(side: -1 | 1, s0: number, s1: number, area: AreaId, segment: number, ids: IdCounters): Obstacle {
  const xIn = 3.0 * side, xOut = 4.5 * side;
  const ob = buildProp({ kind: 'curb', area, segment, s: s0, x: (xIn + xOut) / 2, len: s1 - s0, wid: 1.5, hgt: 0.15,
    topSlab: false }, ids);
  ob.slabs.push({ s0: ob.s, s1: round1cm(s1), x0: Math.min(xIn, xOut), x1: Math.max(xIn, xOut), y0: 0.15, y1: 0.15,
    layer: 0, surface: 'concrete', kind: 'flat' });
  ob.solids.length = 0;                   // 0.15 ≤ STEP_UP: a bump, never a body
  ob.edges.push({ id: ++ids.edge, obstacleId: ob.id, a: { s: ob.s, x: xIn, y: 0.15 }, b: { s: round1cm(s1), x: xIn, y: 0.15 },
    kind: 'curb', material: 'concrete', layer: 0, pickOnly: true });
  ob.tags |= ObTag.Grindable;
  return ob;
}
