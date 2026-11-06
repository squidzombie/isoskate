// world/gen/props/shared.ts: physical builders for the shared kinds used by the M0 templates (DESIGN §10.3 sizes):
// the street base (sidewalks + curb edges), barrier_low, trench (pits at lip level + plank), trash_can, flatbar,
// bench and cone. TODO(WG): stairs, handrail, hubba, incline, terrace, manual_pad, filler, and the area skins.
import { round1cm } from '../../../core/math';
import { HAZARD_WARN_SEC, HEIGHT, HITBOX, STEP_UP } from '../../../core/tuning';
import type { Obstacle } from '../../../core/world';
import { ObTag } from '../../../core/world';
import { SIDEWALK_X, SIDEWALK_Y, buildProp, groundUnder, type PropCtx } from './common';

/** Exit zone of a grind edge (DESIGN §10.6 rule d): 0.6 s·v long, ±1.5 m wide, centred on the edge's end. */
export const EXIT_ZONE_SEC = 0.6, EXIT_ZONE_HALF_W = 1.5;
/** Shortest curb grind edge worth emitting (m). */
const CURB_EDGE_MIN = 1.0;

/** Subtract intervals from [a, b): the uncovered pieces, in order. */
function subtract(a: number, b: number, cuts: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  let u = a;
  for (const [c0, c1] of [...cuts].sort((p, q) => p[0] - q[0])) {
    if (c1 <= u || c0 >= b) continue;
    if (c0 > u) out.push([u, c0]);
    u = Math.max(u, c1);
  }
  if (u < b) out.push([u, b]);
  return out;
}

/** Sidewalk + curb on one side (DESIGN §10.2): a sidewalk slab at +0.15 from |x| = 3.0 to 4.5 per uncut piece of
 *  [s0, s1) (`cuts`: full-width pits), and pick-only curb edges along its road-side top edge. The road (y = 0) is the
 *  implicit datum. A curb grind never carries the board into a blocker (DESIGN §6.3): each curb edge ends one exit
 *  zone before any crash face or pit within ±1.5 m of the curb line, and before the segment end, so its grind sweep
 *  and exit zone are clear by construction (validator/rules.ts checkEdges checks them like any edge). */
export function buildCurb(side: -1 | 1, s0: number, s1: number, p: PropCtx, cuts: readonly [number, number][] = [],
  obstacles: readonly Obstacle[] = [], v = 7): Obstacle[] {
  const out: Obstacle[] = [];
  const xIn = SIDEWALK_X * side, xOut = 4.5 * side;
  const zone = EXIT_ZONE_SEC * v;
  const blocked: [number, number][] = [[s1 - zone, s1]];
  for (const ob of obstacles) {
    if (ob.kind === 'curb') continue;
    for (const so of ob.solids) {
      const b = so.box;
      if (b.x1 <= xIn - EXIT_ZONE_HALF_W || b.x0 >= xIn + EXIT_ZONE_HALF_W) continue;
      if (so.top === 'knock' || (so.top === 'landable' && b.y1 - SIDEWALK_Y <= STEP_UP)) continue;
      blocked.push([b.s0 - zone, b.s1]);
    }
    for (const pt of ob.pits) {
      if (pt.x1 <= xIn - EXIT_ZONE_HALF_W || pt.x0 >= xIn + EXIT_ZONE_HALF_W) continue;
      blocked.push([pt.s0 - zone, pt.s1]);
    }
  }
  for (const [u0, u1] of subtract(s0, s1, cuts)) {
    if (u1 - u0 < 0.05) continue;
    const ob = buildProp({ kind: 'curb', s: u0, x: (xIn + xOut) / 2, len: u1 - u0, wid: 1.5, hgt: SIDEWALK_Y, topSlab: false }, p);
    ob.slabs.push({ s0: ob.s, s1: round1cm(u1), x0: Math.min(xIn, xOut), x1: Math.max(xIn, xOut), y0: SIDEWALK_Y, y1: SIDEWALK_Y,
      layer: 0, surface: 'concrete', kind: 'flat' });
    ob.solids.length = 0;                   // 0.15 ≤ STEP_UP: a bump, never a body
    for (const [e0, e1] of subtract(ob.s, round1cm(u1), blocked)) {
      const a = round1cm(e0), b = round1cm(Math.floor(e1 * 100) / 100 - 0.02);     // 2 cm short: the zone check never ties
      if (b - a < CURB_EDGE_MIN) continue;
      ob.edges.push({ id: ++p.ids.edge, obstacleId: ob.id, a: { s: a, x: xIn, y: SIDEWALK_Y }, b: { s: b, x: xIn, y: SIDEWALK_Y },
        kind: 'curb', material: 'concrete', layer: 0, pickOnly: true });
    }
    if (ob.edges.length) ob.tags |= ObTag.Grindable;
    out.push(ob);
  }
  return out;
}

/** Full-width barrier_low (crash top, chevrons), optionally with a slot [slot.x ± slot.w/2] (DESIGN §10.3). */
export function buildBarrier(s: number, hgt: number, v: number, p: PropCtx, slot?: { x: number; w: number }): Obstacle {
  const len = 0.6;
  const ob = buildProp({ kind: 'barrier_low', s, x: 0, len, wid: 9.0, hgt, tags: ObTag.FullWidth | ObTag.Required,
    warnAtS: s - HAZARD_WARN_SEC * v, params: slot ? { slotX: round1cm(slot.x), slotW: round1cm(slot.w) } : {} }, p);
  if (slot) {
    const b = ob.solids[0]!.box;
    const l = { ...b, x1: round1cm(slot.x - slot.w / 2) }, r = { ...b, x0: round1cm(slot.x + slot.w / 2) };
    ob.solids = [l, r].filter((bb) => bb.x1 - bb.x0 > 0.05).map((box) => ({ box, top: 'crash' as const, tall: false }));
  }
  return ob;
}

/** Full-width trench (pit at lip level) of length len with one plank 1.2 m wide at plankX (DESIGN §10.3).
 *  Road band lip 0, sidewalk bands lip 0.15. The caller cuts the sidewalk slabs over [s, s + len). */
export function buildTrench(s: number, len: number, plankX: number, v: number, p: PropCtx, plankW = 1.2, depth = 0.6): Obstacle {
  const ob = buildProp({ kind: 'trench', s, x: 0, len, wid: 9.0, hgt: 0, tags: ObTag.FullWidth | ObTag.Required,
    warnAtS: s - HAZARD_WARN_SEC * v, params: { plankX: round1cm(plankX), plankW, depth } }, p);
  ob.solids.length = 0;
  const s0 = ob.s, s1 = round1cm(ob.s + ob.len);
  const bands: [number, number, number][] = [[-4.5, -SIDEWALK_X, SIDEWALK_Y], [-SIDEWALK_X, SIDEWALK_X, 0], [SIDEWALK_X, 4.5, SIDEWALK_Y]];
  for (const [x0, x1, lip] of bands) ob.pits.push({ s0, s1, x0, x1, lipY: lip, depth, cause: 'fall' });
  ob.slabs.push({ s0, s1, x0: round1cm(plankX - plankW / 2), x1: round1cm(plankX + plankW / 2), y0: 0, y1: 0, layer: 0,
    surface: 'wood', kind: 'flat' });
  return ob;
}

/** A tall column blocker (trash can 0.6 × 0.6, news box 0.5 × 0.5) standing on the street or the sidewalk; its top is
 *  1.15 above the highest ground a board touching it can stand on (its footprint widened by half the hitbox), so it
 *  is never ollie-able from the sidewalk either, even when it stands on the road right beside the curb. */
export function buildBlocker(kind: 'trash_can' | 'news_box', s: number, x: number, p: PropCtx, variant = 0): Obstacle {
  const w = kind === 'trash_can' ? 0.6 : 0.5;
  const g = groundUnder(x - w / 2, x + w / 2);
  const reach = groundUnder(x - w / 2 - HITBOX.w / 2, x + w / 2 + HITBOX.w / 2);
  const ob = buildProp({ kind, s, x, len: w, wid: w, hgt: HEIGHT.tallMin + (reach.hi - g.lo), ground: g.lo, variant }, p);
  ob.hgt = HEIGHT.tallMin;
  return ob;
}

/** Flat bar: a 0.05 m rail on posts (crash top) with one centre grind edge (DESIGN §10.3). */
export function buildFlatbar(s: number, x: number, len: number, hgt: number, p: PropCtx, tags = ObTag.TrickLine): Obstacle {
  return buildProp({ kind: 'flatbar', s, x, len, wid: 0.05, hgt, tags, edges: [{ side: 0, kind: 'rail', material: 'metal' }] }, p);
}

/** Bench 2.0 × 0.5 × 0.45, long axis along s: landable top, grindable long edges, crash front (DESIGN §10.3). */
export function buildBench(s: number, x: number, p: PropCtx, ground = 0, tags = ObTag.TrickLine): Obstacle {
  return buildProp({ kind: 'bench', s, x, len: 2.0, wid: 0.5, hgt: 0.45, ground, tags, surface: 'wood',
    edges: [{ side: -1, kind: 'bench', material: 'stone' }, { side: 1, kind: 'bench', material: 'stone' }] }, p);
}

export function buildCone(s: number, x: number, p: PropCtx): Obstacle {
  return buildProp({ kind: 'cone', s, x, len: 0.3, wid: 0.3, hgt: 0.5, tags: ObTag.Knockable }, p);
}
