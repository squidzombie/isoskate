// world/gen/props/street.ts: the per-area lateral layouts and the street base (DESIGN §10.2, TECH §5.1 "Street base").
// Every segment emits its area's base GroundSlabs as `kind: 'curb'` obstacles with `params.band` (BAND_CODE): road,
// sidewalks at +0.15 behind the curbs, lawns, the Docks apron and dock band, plazas, park paths, tunnel floors. All
// heights are relative to the segment datum (full-width drops lower it, S_INCLINE_UP pays it back). Sidewalk bands carry
// the pick-only curb edges on their road-side top edge, one finite edge per segment, each ending one exit zone
// before any crash face or pit within ±1.5 m of the curb line (so every curb grind ends on clear ground, rule d).
// Template "cuts" ([s0, s1) intervals) remove the base where a template lays its own full-width ground (pits,
// stairs, inclines, crests).
// The Docks lip (+4.2…+4.5, 0.30 high, landable) is one body per Docks visit (no joints a wall-hugging board could
// slam into) plus per-segment lip edges (the signature long grind, auto-capture), cut like the curbs.
import type { Surface } from '../../../core/ids';
import { round1cm } from '../../../core/math';
import { STEP_UP } from '../../../core/tuning';
import type { Obstacle } from '../../../core/world';
import { ObTag } from '../../../core/world';
import { BODY_TOPS, buildProp, type PropCtx } from './common';

export type BandKind = 'road' | 'sidewalk' | 'lawn' | 'apron' | 'dock' | 'plaza' | 'path' | 'tunnel';
/** `params.band` of a street-base obstacle (for the renderer's kits). */
export const BAND_CODE: Readonly<Record<BandKind, number>> = { road: 0, sidewalk: 1, lawn: 2, apron: 3, dock: 4, plaza: 5, path: 6, tunnel: 7 };
export interface Band { readonly x0: number; readonly x1: number; readonly dy: number; readonly surface: Surface; readonly kind: BandKind }
export type LayoutId = 'downtown' | 'plaza' | 'suburbs' | 'docks' | 'neon' | 'greenway' | 'levelCrossing' | 'harborBridge' | 'underpass';
export interface StreetLayout {
  readonly id: LayoutId;
  readonly bands: readonly Band[];
  /** Curb lines (|x|, both sides) on the road-side top edge of the sidewalks; null = curb-free. */
  readonly curbX: number | null;
  readonly curbKind: 'curb' | 'neon_curb';
  /** Docks: the lip at +4.2…+4.5 with water beyond (never mirrored). */
  readonly lip: boolean;
}

export const SIDEWALK_DY = 0.15;
export const LIP = { x0: 4.2, x1: 4.5, h: 0.30 } as const;

const b = (x0: number, x1: number, dy: number, surface: Surface, kind: BandKind): Band => ({ x0, x1, dy, surface, kind });
export const LAYOUTS: Readonly<Record<LayoutId, StreetLayout>> = {
  downtown: { id: 'downtown', curbX: 3.0, curbKind: 'curb', lip: false,
    bands: [b(-4.5, -3.0, SIDEWALK_DY, 'concrete', 'sidewalk'), b(-3.0, 3.0, 0, 'asphalt', 'road'), b(3.0, 4.5, SIDEWALK_DY, 'concrete', 'sidewalk')] },
  plaza: { id: 'plaza', curbX: null, curbKind: 'curb', lip: false, bands: [b(-4.5, 4.5, 0, 'tile', 'plaza')] },
  suburbs: { id: 'suburbs', curbX: 2.6, curbKind: 'curb', lip: false,
    bands: [b(-4.5, -3.8, 0, 'grass', 'lawn'), b(-3.8, -2.6, SIDEWALK_DY, 'concrete', 'sidewalk'), b(-2.6, 2.6, 0, 'asphalt', 'road'),
      b(2.6, 3.8, SIDEWALK_DY, 'concrete', 'sidewalk'), b(3.8, 4.5, 0, 'grass', 'lawn')] },
  docks: { id: 'docks', curbX: null, curbKind: 'curb', lip: true,
    bands: [b(-4.5, -2.0, 0, 'metal', 'dock'), b(-2.0, 4.5, 0, 'concrete', 'apron')] },
  neon: { id: 'neon', curbX: 3.0, curbKind: 'neon_curb', lip: false,
    bands: [b(-4.5, -3.0, SIDEWALK_DY, 'tile', 'sidewalk'), b(-3.0, 3.0, 0, 'wetAsphalt', 'road'), b(3.0, 4.5, SIDEWALK_DY, 'tile', 'sidewalk')] },
  greenway: { id: 'greenway', curbX: null, curbKind: 'curb', lip: false,
    bands: [b(-4.5, -3.2, 0, 'grass', 'lawn'), b(-3.2, 3.2, 0, 'concrete', 'path'), b(3.2, 4.5, 0, 'grass', 'lawn')] },
  levelCrossing: { id: 'levelCrossing', curbX: null, curbKind: 'curb', lip: false, bands: [b(-4.5, 4.5, 0, 'asphalt', 'road')] },
  harborBridge: { id: 'harborBridge', curbX: null, curbKind: 'curb', lip: false, bands: [b(-4.5, 4.5, 0, 'asphalt', 'road')] },
  underpass: { id: 'underpass', curbX: null, curbKind: 'curb', lip: false, bands: [b(-4.5, 4.5, 0, 'tile', 'tunnel')] },
};

/** Min / max band height (relative to the datum) under [x0, x1] (outside the corridor: the outer bands). */
export function bandRange(l: StreetLayout, x0: number, x1: number): { lo: number; hi: number } {
  let lo = Infinity, hi = -Infinity;
  for (const bd of l.bands) {
    if (bd.x1 <= x0 || bd.x0 >= x1) continue;
    lo = Math.min(lo, bd.dy); hi = Math.max(hi, bd.dy);
  }
  if (lo === Infinity) {
    const edge = x1 <= l.bands[0]!.x0 ? l.bands[0]! : l.bands[l.bands.length - 1]!;
    lo = hi = edge.dy;
  }
  return { lo, hi };
}
/** Band height at a point (relative to the datum). */
export function bandAt(l: StreetLayout, x: number): Band {
  for (const bd of l.bands) if (x >= bd.x0 && x < bd.x1) return bd;
  return x < 0 ? l.bands[0]! : l.bands[l.bands.length - 1]!;
}

/** Exit zone of a grind edge (DESIGN §10.6 rule d): 0.6 s·v long, ±1.5 m wide, centred on the edge's end. */
export const EXIT_ZONE_SEC = 0.6, EXIT_ZONE_HALF_W = 1.5;
/** Shortest curb / lip grind edge worth emitting (m). */
const EDGE_MIN = 1.0;

/** Subtract intervals from [a, b): the uncovered pieces, in order. */
export function subtract(a: number, b2: number, cuts: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  let u = a;
  for (const [c0, c1] of [...cuts].sort((p, q) => p[0] - q[0])) {
    if (c1 <= u || c0 >= b2) continue;
    if (c0 > u) out.push([u, c0]);
    u = Math.max(u, c1);
  }
  if (u < b2) out.push([u, b2]);
  return out;
}

/** Edge pieces along x = ex (height ey) over [a, b2) that satisfy rule (d) by construction (DESIGN §10.6): no solid
 *  in the grind sweep (the hitbox along the edge), and every piece ENDS with a clear exit zone (0.6 s·v, ±1.5 m: no
 *  crash face, no pit) before the segment end. Blockers beside the edge (outside the sweep) do not cut it. */
export function cutEdgePieces(a: number, b2: number, ex: number, ey: number, s1: number, zone: number,
  obstacles: readonly Obstacle[], extraBlocked: readonly (readonly [number, number])[] = []): [number, number][] {
  const sweep: [number, number][] = [...extraBlocked.map(([u, w]) => [u, w] as [number, number])];
  const ends: [number, number][] = [[s1 - zone, s1 + 1]];
  for (const ob of obstacles) {
    if (ob.kind === 'curb' || ob.kind === 'dock_lip') continue;
    for (const so of ob.solids) {
      const bx = so.box;
      if (so.top === 'knock' || (so.top === 'landable' && bx.y1 - ey <= STEP_UP)) continue;
      if (bx.y0 >= ey + 1.5) continue;
      if (bx.x1 > ex - 0.35 && bx.x0 < ex + 0.35) sweep.push([bx.s0 - Math.max(zone, so.tall ? zone / 0.6 : 0) - 0.1, bx.s1 + 0.5]);
      else if (bx.x1 > ex - EXIT_ZONE_HALF_W && bx.x0 < ex + EXIT_ZONE_HALF_W) {
        // A tall blocker in line with the edge (±0.5 m) must be ≥ 1.0 s past its end (rail ends never point into one).
        const lead = so.tall && bx.x1 > ex - 0.5 && bx.x0 < ex + 0.5 ? zone / 0.6 + 0.1 : zone;
        ends.push([bx.s0 - lead, bx.s1]);
      }
    }
    for (const pt of ob.pits) {
      if (pt.x1 <= ex - EXIT_ZONE_HALF_W || pt.x0 >= ex + EXIT_ZONE_HALF_W) continue;
      if (pt.x1 > ex - 0.2 && pt.x0 < ex + 0.2) sweep.push([pt.s0 - zone, pt.s1 + 0.5]);
      else ends.push([pt.s0 - zone, pt.s1]);
    }
  }
  const out: [number, number][] = [];
  for (const [p0, p1] of subtract(a, b2, sweep)) {
    let e1 = p1;
    // Pull the end back out of every zone-blocked interval (an end there would face a blocker within its exit zone).
    for (let guard = 0; guard < 32; guard++) {
      const hit = ends.find(([u, w]) => e1 > u && e1 <= w);
      if (!hit) break;
      e1 = hit[0];
    }
    if (e1 - p0 >= EDGE_MIN) out.push([p0, e1]);
  }
  return out;
}

/** Add finite grind edges for the pieces (2 cm short so a zone never ties). */
export function addEdgePieces(ob: Obstacle, pieces: readonly [number, number][], ex: number, ey: number,
  kind: 'curb' | 'lip', material: 'concrete' | 'metal' | 'neon', pickOnly: boolean, p: PropCtx): void {
  for (const [e0, e1] of pieces) {
    const ea = round1cm(e0), eb = round1cm(Math.floor(e1 * 100) / 100 - 0.02);
    if (eb - ea < EDGE_MIN) continue;
    ob.edges.push({ id: ++p.ids.edge, obstacleId: ob.id, a: { s: ea, x: ex, y: ey }, b: { s: eb, x: ex, y: ey },
      kind, material, layer: 0, pickOnly });
  }
  if (ob.edges.length) ob.tags |= ObTag.Grindable;
}

export interface StreetOpts {
  /** [s0, s1) intervals with no base (pits, template ground). */
  cuts?: readonly (readonly [number, number])[];
  /** Curb cuts (driveways): [s0, s1, side) where that side's sidewalk drops to road level and carries no curb edge. */
  driveways?: readonly (readonly [number, number, number])[];
  /** Obstacles of the segment: curb edges end one exit zone before their crash faces and pits. */
  obstacles?: readonly Obstacle[];
  /** Speed at the segment (exit zone length). */
  v: number;
  /** No curb edges at all (gateways that fade the curbs out). */
  noCurbEdges?: boolean;
  /** [s0, s1, x] stretches where a base edge failed rule (d): no edge there (and none ending in it). */
  /** Edge bans [s0, s1, x] (x NaN = every base edge): no curb / lip edge piece over [s0 − 0.5, s1 + exit zone]. */
  noEdges?: readonly (readonly [number, number, number])[];
}

/** The base street of one segment over [s0, s1): one obstacle per band piece. */
export function buildStreet(l: StreetLayout, s0: number, s1: number, p: PropCtx, o: StreetOpts): Obstacle[] {
  const out: Obstacle[] = [];
  const cuts = o.cuts ?? [];
  const zone = EXIT_ZONE_SEC * o.v;
  for (const bd of l.bands) {
    const pieces = subtract(s0, s1, cuts);
    for (const [u0, u1] of pieces) {
      if (u1 - u0 < 0.05) continue;
      const isWalk = bd.kind === 'sidewalk';
      const sideOf = bd.x0 < 0 ? -1 : 1;
      const drive = isWalk ? (o.driveways ?? []).filter((d) => d[2] === sideOf).map((d) => [d[0], d[1]] as [number, number]) : [];
      const ob = buildProp({ kind: 'curb', s: u0, x: (bd.x0 + bd.x1) / 2, len: u1 - u0, wid: bd.x1 - bd.x0, hgt: bd.dy,
        topSlab: false, params: { band: BAND_CODE[bd.kind] } }, p);
      ob.solids.length = 0;                               // bands are ≤ STEP_UP apart: bumps, never bodies
      const y = round1cm(p.datum + bd.dy);
      for (const [w0, w1] of subtract(u0, u1, drive)) {
        if (w1 - w0 < 0.02) continue;
        ob.slabs.push({ s0: round1cm(w0), s1: round1cm(w1), x0: bd.x0, x1: bd.x1, y0: y, y1: y, layer: 0, surface: bd.surface, kind: 'flat' });
      }
      for (const [d0, d1] of drive) {
        const a = Math.max(d0, u0), c = Math.min(d1, u1);
        if (c - a < 0.02) continue;
        ob.slabs.push({ s0: round1cm(a), s1: round1cm(c), x0: bd.x0, x1: bd.x1, y0: round1cm(p.datum), y1: round1cm(p.datum),
          layer: 0, surface: 'concrete', kind: 'flat' });
      }
      if (isWalk && l.curbX !== null && !o.noCurbEdges) {
        const ex = bd.x0 < 0 ? -l.curbX : l.curbX;
        if (Math.abs(Math.abs(bd.x0 < 0 ? bd.x1 : bd.x0) - l.curbX) < 1e-6) {
          const banned = (o.noEdges ?? []).filter((n) => Number.isNaN(n[2]) || Math.abs(n[2] - ex) < 0.05).map((n) => [n[0] - 0.5, n[1] + zone] as [number, number]);
          const pieces = cutEdgePieces(ob.s, round1cm(u1), ex, y, s1, zone, o.obstacles ?? [], [...drive.map(([a, c]) => [a - 0.5, c + 0.5] as [number, number]), ...banned]);
          addEdgePieces(ob, pieces, ex, y, 'curb', l.curbKind === 'neon_curb' ? 'neon' : 'concrete', true, p);
          if (l.curbKind === 'neon_curb') ob.params = { ...ob.params, neon: 1 };
        }
      }
      out.push(ob);
    }
  }
  return out;
}

/** The Docks lip body for one visit [s0, s1): a landable 0.30 body at +4.2…+4.5 (one piece: no joints). */
export function buildLipBody(s0: number, s1: number, p: PropCtx): Obstacle {
  const ob = buildProp({ kind: 'dock_lip', s: s0, x: (LIP.x0 + LIP.x1) / 2, len: s1 - s0, wid: LIP.x1 - LIP.x0, hgt: LIP.h,
    surface: 'concrete', params: { body: 1 } }, p);
  return ob;
}

/** Per-segment lip grind edges at x = +4.2 (y = datum + 0.30), cut one exit zone before crash faces and pits. */
export function buildLipEdges(s0: number, s1: number, p: PropCtx, obstacles: readonly Obstacle[], v: number,
  o: { tags?: number; landmark?: string; from?: number; to?: number; noEdges?: readonly (readonly [number, number, number])[] } = {}): Obstacle | null {
  const y = round1cm(p.datum + LIP.h);
  const ob = buildProp({ kind: 'dock_lip', s: o.from ?? s0, x: LIP.x0, len: (o.to ?? s1) - (o.from ?? s0), wid: 0.05, hgt: 0,
    topSlab: false, tags: o.tags ?? 0, landmark: o.landmark, params: { body: 0 } }, p);
  ob.solids.length = 0;
  const zone = EXIT_ZONE_SEC * v;
  const banned = (o.noEdges ?? []).filter((n) => Number.isNaN(n[2]) || Math.abs(n[2] - LIP.x0) < 0.05).map((n) => [n[0] - 0.5, n[1] + zone] as [number, number]);
  addEdgePieces(ob, cutEdgePieces(ob.s, round1cm(o.to ?? s1), LIP.x0, y, s1, zone, obstacles, banned), LIP.x0, y, 'lip', 'metal', false, p);
  return ob.edges.length ? ob : null;
}

/** True when a slab is datum ground for the validator (not a body top, not a deck). */
export const isDatumSlab = (o: Obstacle, i: number): boolean => {
  const sl = o.slabs[i]!;
  return sl.layer === 0 && !BODY_TOPS.has(sl);
};
