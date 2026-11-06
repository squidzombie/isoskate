// world/gen/props/common.ts: the generic prop builder. (kind, placement, size) → Obstacle in track space, 1 cm rounding.
// Rules the sim and the validator rely on (TECH §5.1, DESIGN §10.3):
//  - top type: T kinds → 'landable', K kinds → 'knock', everything else → 'crash' (DESIGN §7);
//  - tall = top − local ground ≥ HEIGHT.tallMin;
//  - landable bodies higher than STEP_UP get a rideable top slab (raised slabs have bodies);
//  - edges ≤ STEP_UP above the local ground are pickOnly (curb-class).
// Kind-specific builders live in props/shared.ts and props/<area>.ts (WG adds the rest of the catalog).
import type { AreaId, EdgeKind, EdgeMaterial, PropKind, Surface } from '../../../core/ids';
import { round1cm } from '../../../core/math';
import { HEIGHT, STEP_UP } from '../../../core/tuning';
import type { GrindEdge, GroundSlab, Obstacle, Solid } from '../../../core/world';
import { ObTag } from '../../../core/world';

export const LANDABLE: ReadonlySet<PropKind> = new Set<PropKind>(['granite_ledge', 'bench', 'planter', 'planter_tree',
  'garden_wall', 'crate_stack', 'manual_pad', 'pallet_2', 'pallet_3', 'loading_dock', 'skywalk', 'hubba', 'curb',
  'neon_curb', 'cherry_planter', 'terrace']);
export const KNOCK: ReadonlySet<PropKind> = new Set<PropKind>(['cone', 'a_frame_sign']);

export interface IdCounters { ob: number; coin: number; edge: number }

/** What every builder needs: ids, the segment and its area. */
export interface PropCtx { ids: IdCounters; segment: number; area: AreaId }

export interface PropSpec {
  kind: PropKind;
  s: number; x: number; len: number; wid: number; hgt: number;
  ground?: number;                        // local ground height under the prop (default 0)
  tags?: number;
  edges?: { side: -1 | 0 | 1; kind: EdgeKind; material: EdgeMaterial }[];   // long-side (±1) or centre (0) edges
  topSlab?: boolean;                      // landable kinds default true
  surface?: Surface;                      // top slab surface
  variant?: number; warnAtS?: number; landmark?: string; gap?: Obstacle['gap']; params?: Record<string, number>;
}

export function buildProp(spec: PropSpec, p: PropCtx): Obstacle {
  const g = round1cm(spec.ground ?? 0);
  const s0 = round1cm(spec.s), s1 = round1cm(spec.s + spec.len);
  const x0 = round1cm(spec.x - spec.wid / 2), x1 = round1cm(spec.x + spec.wid / 2);
  const top = round1cm(g + spec.hgt);
  const topType: Solid['top'] = LANDABLE.has(spec.kind) ? 'landable' : KNOCK.has(spec.kind) ? 'knock' : 'crash';
  const id = ++p.ids.ob;
  const solids: Solid[] = [];
  const slabs: GroundSlab[] = [];
  const edges: GrindEdge[] = [];
  if (spec.hgt > STEP_UP || topType !== 'landable') {
    solids.push({ box: { s0, s1, x0, x1, y0: g, y1: top }, top: topType, tall: spec.hgt >= HEIGHT.tallMin });
  }
  if (topType === 'landable' && (spec.topSlab ?? true)) {
    slabs.push({ s0, s1, x0, x1, y0: top, y1: top, layer: 0, surface: spec.surface ?? 'granite', kind: 'flat' });
  }
  for (const e of spec.edges ?? []) {
    const ex = e.side < 0 ? x0 : e.side > 0 ? x1 : round1cm(spec.x);
    edges.push({ id: ++p.ids.edge, obstacleId: id, a: { s: s0, x: ex, y: top }, b: { s: s1, x: ex, y: top },
      kind: e.kind, material: e.material, layer: 0, pickOnly: spec.hgt <= STEP_UP });
  }
  let tags = spec.tags ?? 0;
  if (edges.length) tags |= ObTag.Grindable;
  const ob: Obstacle = {
    id, kind: spec.kind, area: p.area, segment: p.segment,
    s: s0, x: round1cm(spec.x), len: round1cm(s1 - s0), wid: round1cm(x1 - x0), hgt: round1cm(spec.hgt),
    rotY: 0, mirror: false, variant: spec.variant ?? 0,
    solids, slabs, pits: [], edges, tags,
  };
  if (spec.warnAtS !== undefined) ob.warnAtS = round1cm(spec.warnAtS);
  if (spec.landmark) ob.landmark = spec.landmark;
  if (spec.gap) ob.gap = spec.gap;
  if (spec.params) ob.params = spec.params;
  return ob;
}

/** Street datum under x in M0 Downtown: road 0, sidewalks +0.15 beyond |x| = 3.0 (DESIGN §10.2). */
export const SIDEWALK_X = 3.0, SIDEWALK_Y = 0.15;
export const groundUnder = (x0: number, x1: number): { lo: number; hi: number } => {
  const lo = x0 >= SIDEWALK_X || x1 <= -SIDEWALK_X ? SIDEWALK_Y : 0;
  const hi = x1 > SIDEWALK_X || x0 < -SIDEWALK_X ? SIDEWALK_Y : 0;
  return { lo, hi };
};
