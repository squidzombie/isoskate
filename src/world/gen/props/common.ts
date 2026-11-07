// world/gen/props/common.ts: the generic prop builder. (kind, placement, size) → Obstacle in track space, 1 cm rounding.
// Rules the sim and the validator rely on (TECH §5.1, DESIGN §10.3):
//  - top type: T kinds → 'landable', K kinds → 'knock', everything else → 'crash' (DESIGN §7);
//  - tall = top − local ground ≥ HEIGHT.tallMin;
//  - landable bodies higher than STEP_UP get a rideable top slab (raised slabs have bodies); that top slab is a
//    "body top" (BODY_TOPS): the validator models it as the body's solid, never as datum ground (it ignores L1);
//  - edges ≤ STEP_UP above the local ground are pickOnly (curb-class).
// Kind-specific builders live in props/shared.ts and props/<area>.ts; the street base in props/street.ts.
import type { AreaId, EdgeKind, EdgeMaterial, PropKind, Surface } from '../../../core/ids';
import { round1cm } from '../../../core/math';
import { HEIGHT, STEP_UP } from '../../../core/tuning';
import type { GrindEdge, GroundSlab, Obstacle, Solid } from '../../../core/world';
import { ObTag } from '../../../core/world';

export const LANDABLE: ReadonlySet<PropKind> = new Set<PropKind>(['granite_ledge', 'bench', 'planter', 'planter_tree',
  'garden_wall', 'crate_stack', 'manual_pad', 'pallet_1', 'pallet_2', 'pallet_3', 'loading_dock', 'skywalk', 'hubba',
  'curb', 'neon_curb', 'cherry_planter', 'terrace', 'dock_lip', 'incline']);
export const KNOCK: ReadonlySet<PropKind> = new Set<PropKind>(['cone', 'a_frame_sign']);

/** Top slabs of landable bodies (ledge, bench, pad, deck tops): not datum ground for the validator's L0 model. */
export const BODY_TOPS = new WeakSet<GroundSlab>();
/** Stepped bodies under a rideable slope (an incline up to a deck): a board coming down onto them lands on the slope,
 *  so they are not crash faces of an exit zone. */
export const SLOPE_BODIES = new WeakSet<Solid>();
/** Every stepped body piece (rails and hubbas down stairs, incline bodies): its box height is not its height above
 *  the surface beside it (that is the rail / hubba height by construction), so the band rule skips the box height. */
export const STEPPED = new WeakSet<Solid>();

export interface IdCounters { ob: number; coin: number; edge: number }

/** What every builder needs: ids, the segment, its area and the datum (street height, DESIGN §10.10). */
export interface PropCtx {
  ids: IdCounters; segment: number; area: AreaId;
  /** Street datum y of the segment (0 except after full-width drops). */
  datum: number;
  /** Local riding surface under [x0, x1] (min / max of the street bands), relative to the datum. */
  ground(x0: number, x1: number): { lo: number; hi: number };
}

export interface PropSpec {
  kind: PropKind;
  s: number; x: number; len: number; wid: number; hgt: number;
  ground?: number;                        // absolute local ground height under the prop (default: the datum)
  tags?: number;
  edges?: { side: -1 | 0 | 1; kind: EdgeKind; material: EdgeMaterial; layer?: 0 | 1 }[];   // long-side (±1) or centre (0)
  topSlab?: boolean;                      // landable kinds default true
  surface?: Surface;                      // top slab surface
  layer?: 0 | 1;                          // top slab layer (decks: 1)
  top?: Solid['top'];                     // override the kind's top type
  variant?: number; warnAtS?: number; landmark?: string; gap?: Obstacle['gap']; params?: Record<string, number>;
  mirror?: boolean;
}

/** One obstacle from a box spec (the general case; composite kinds add solids / slabs / edges afterwards). */
export function buildProp(spec: PropSpec, p: PropCtx): Obstacle {
  const g = round1cm(spec.ground ?? p.datum);
  const s0 = round1cm(spec.s), s1 = round1cm(spec.s + spec.len);
  const x0 = round1cm(spec.x - spec.wid / 2), x1 = round1cm(spec.x + spec.wid / 2);
  const top = round1cm(g + spec.hgt);
  const topType: Solid['top'] = spec.top ?? (LANDABLE.has(spec.kind) ? 'landable' : KNOCK.has(spec.kind) ? 'knock' : 'crash');
  const id = ++p.ids.ob;
  const solids: Solid[] = [];
  const slabs: GroundSlab[] = [];
  const edges: GrindEdge[] = [];
  if (spec.hgt > STEP_UP || topType !== 'landable') {
    solids.push({ box: { s0, s1, x0, x1, y0: g, y1: top }, top: topType, tall: spec.hgt >= HEIGHT.tallMin });
  }
  if (topType === 'landable' && (spec.topSlab ?? true)) {
    const sl: GroundSlab = { s0, s1, x0, x1, y0: top, y1: top, layer: spec.layer ?? 0, surface: spec.surface ?? 'granite', kind: 'flat' };
    slabs.push(sl);
    if (spec.hgt > STEP_UP) BODY_TOPS.add(sl);
  }
  for (const e of spec.edges ?? []) {
    const ex = e.side < 0 ? x0 : e.side > 0 ? x1 : round1cm(spec.x);
    edges.push({ id: ++p.ids.edge, obstacleId: id, a: { s: s0, x: ex, y: top }, b: { s: s1, x: ex, y: top },
      kind: e.kind, material: e.material, layer: e.layer ?? 0, pickOnly: spec.hgt <= STEP_UP });
  }
  let tags = spec.tags ?? 0;
  if (edges.length) tags |= ObTag.Grindable;
  if (topType === 'knock') tags |= ObTag.Knockable;
  const ob: Obstacle = {
    id, kind: spec.kind, area: p.area, segment: p.segment,
    s: s0, x: round1cm(spec.x), len: round1cm(s1 - s0), wid: round1cm(x1 - x0), hgt: round1cm(spec.hgt),
    rotY: 0, mirror: !!spec.mirror, variant: spec.variant ?? 0,
    solids, slabs, pits: [], edges, tags,
  };
  if (spec.warnAtS !== undefined) ob.warnAtS = round1cm(spec.warnAtS);
  if (spec.landmark) ob.landmark = spec.landmark;
  if (spec.gap) ob.gap = spec.gap;
  if (spec.params) ob.params = spec.params;
  return ob;
}

/** A tall blocker standing on the street bands: its top is HEIGHT.tallMin above the highest ground a board touching
 *  it can ride on (its footprint widened by half the hitbox), so it is never ollie-able from a sidewalk either, and
 *  never in the forbidden band from any side. `hgt` is the nominal height (≥ 1.15); the body grows to keep the rule. */
export function buildTall(kind: PropKind, s: number, x: number, len: number, wid: number, hgt: number, p: PropCtx,
  o: { variant?: number; params?: Record<string, number>; tags?: number } = {}): Obstacle {
  const g = p.ground(x - wid / 2, x + wid / 2);
  const reach = p.ground(x - wid / 2 - 0.2, x + wid / 2 + 0.2);
  const need = HEIGHT.tallMin + (reach.hi - g.lo);
  const ob = buildProp({ kind, s, x, len, wid, hgt: Math.max(hgt, need), ground: p.datum + g.lo, tags: o.tags,
    variant: o.variant, params: o.params }, p);
  ob.hgt = round1cm(hgt);
  return ob;
}

/** Ground band height (absolute) a low prop of width wid at x stands on: the lowest band under it. */
export function lowGround(x: number, wid: number, p: PropCtx): number { return p.datum + p.ground(x - wid / 2, x + wid / 2).lo; }

/** Add a raised body as stepped boxes under a sloped top (stair rails, hubbas, inclines up to a deck). The box tops
 *  sit at the LOWER end of each piece for landable tops (a rider on the slope is never inside a box), at the HIGHER
 *  end for crash tops (a rail is never thinner than drawn). Pieces whose landable top is a bump are skipped. */
export function steppedBody(ob: Obstacle, s0: number, s1: number, x0: number, x1: number, yAt: (s: number) => number,
  base: (s: number) => number, top: Solid['top'], pieces: number): void {
  for (let k = 0; k < pieces; k++) {
    const a = s0 + ((s1 - s0) * k) / pieces, b = s0 + ((s1 - s0) * (k + 1)) / pieces;
    const ya = yAt(a), yb = yAt(b);
    const y1 = round1cm(top === 'landable' ? Math.min(ya, yb) : Math.max(ya, yb));
    // Crash tops (rails) stand on the piece's higher ground: the box is never taller than the rail is (no box height
    // in the forbidden band); a board beside the low end still meets it (the gap under it is < the hitbox height).
    const y0 = round1cm(top === 'landable' ? Math.min(base(a), base(b)) : Math.max(base(a), base(b)));
    if (top === 'landable' && y1 - Math.max(base(a), base(b)) <= STEP_UP) continue;
    const so: Solid = { box: { s0: round1cm(a), s1: round1cm(b), x0: round1cm(x0), x1: round1cm(x1), y0, y1 }, top,
      tall: y1 - y0 >= HEIGHT.tallMin };
    if (top === 'landable') SLOPE_BODIES.add(so);
    STEPPED.add(so);
    ob.solids.push(so);
  }
}
