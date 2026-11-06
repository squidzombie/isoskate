// world/gen/validator/rules.ts: the static rules of DESIGN §10.6.5 over the instantiated obstacles:
//  (b) required-action spacing (R_MIN and T_SHIFT, across segment boundaries);
//  (d) no trick-line traps: every grind edge (curbs and lips included) and every L1 surface ends in an exit zone
//      (≥ 0.6 s·v long, ±1.5 m, no crash faces or pits) that intersects B; each edge's grind sweep (the hitbox swept
//      along it) is free of other solids; rail ends never point into a tall blocker within 1.0 s; edges end inside
//      their segment;
//  (e) height bands: no solid top in the forbidden band (0.61–1.14 m above any ground a board beside it rides on),
//      full-width hazards ≤ 0.50 m tall and ≤ 0.6 m long, pits ≤ 0.35 s·v;
//  (g) occlusion: no reachable crash face within h·cot 35° + 0.5 m behind a solid in the same columns (h ≤ 1.6, the
//      x-ray cap), and nothing under an L1 deck.
import { HEIGHT, HITBOX, STEP_UP, VALIDATOR, speedAt, tAt } from '../../../core/tuning';
import type { GrindEdge, Obstacle, Solid } from '../../../core/world';
import { ObTag } from '../../../core/world';
import { EXIT_ZONE_HALF_W, EXIT_ZONE_SEC } from '../props/street';
import { SLOPE_BODIES, STEPPED } from '../props/common';
import { B, F, spacingAfter } from './sweep';
import { NC, NPLANES, bitTest, cellX, type Raster } from './grid';
import { insetOf } from './path';

const COT35 = 1 / Math.tan((35 * Math.PI) / 180);
/** Exit zone length after an L1 deck drop (DESIGN §10.3 skywalk: nothing within 3.4 m beyond its end). */
export const DECK_EXIT_M = 3.4;

/** Rule (b): consecutive required actions start ≥ max(R_MIN, T_SHIFT(dx_prev)) apart, from the previous segment's. */
export function checkSpacing(actions: readonly { t: number; dx: number }[], last: { t: number; dx: number } | null): string | null {
  let prev = last;
  for (const a of actions) {
    if (prev && a.t - prev.t < spacingAfter(prev.t, prev.dx) - 1e-6) return 'spacing';
    prev = a;
  }
  return null;
}

/** Rule (e). `groundHi(x0, x1)` = the highest street ground (absolute) beside a footprint (the hitbox reach). */
export function checkBands(obs: readonly Obstacle[], groundHi: (x0: number, x1: number, s: number) => number): string | null {
  for (const ob of obs) {
    if (ob.kind === 'curb') continue;
    for (const so of ob.solids) {
      const bx = so.box;
      const h = bx.y1 - bx.y0;
      const hRel = bx.y1 - Math.max(bx.y0, groundHi(bx.x0 - HITBOX.w / 2, bx.x1 + HITBOX.w / 2, bx.s0));
      if (bx.y0 >= bx.y1 - 0.2 && bx.y0 > groundHi(bx.x0, bx.x1, bx.s0) + HITBOX.h - 0.01) continue;   // overhead plate
      if (STEPPED.has(so)) continue;                                  // rails / hubbas / incline bodies down a slope
      for (const v of [h, hRel]) if (v > HEIGHT.forbidMin - 0.005 && v < HEIGHT.forbidMax + 0.005) return `band:${ob.kind}`;
      if (ob.tags & ObTag.FullWidth) {
        if (h > HEIGHT.fullWidthMaxH + 1e-6) return 'band:fullWidthH';
        if (bx.s1 - bx.s0 > HEIGHT.fullWidthMaxL + 1e-6) return 'band:fullWidthL';
      }
    }
    for (const p of ob.pits) if (p.s1 - p.s0 > HEIGHT.pitMaxSec * speedAt(tAt(p.s0)) + 0.011) return 'band:pit';
  }
  return null;
}

const isCrashFace = (so: Solid, refY: number): boolean =>
  so.top !== 'knock' && !(so.top === 'landable' && so.box.y1 - refY <= STEP_UP);

/** Any viable ground cell within [x0, x1] at the slice nearest s? (Exit zones must intersect B.) */
function viableNear(r: Raster, s: number, x0: number, x1: number): boolean | null {
  if (s > r.s[r.n - 1]! || s < r.s[0]!) return null;
  let i = 0;
  while (i < r.n - 1 && r.s[i]! < s) i++;
  // A grinder leaves the reachable set F through the edge, so B (the exit can still be reached) is the test.
  const bl = B[i * NPLANES * 2]!, bh = B[i * NPLANES * 2 + 1]!;
  for (let c = 0; c < NC; c++) if (cellX(c) >= x0 && cellX(c) <= x1 && bitTest(bl, bh, c)) return true;
  return false;
}

/** Rule (d) for one edge (owner `own`) against the window's obstacles. */
function checkEdge(e: GrindEdge, own: Obstacle, obs: readonly Obstacle[], r: Raster | null, segS1: number | null): string | null {
  // An edge that continues into another edge of the same obstacle (a handrail's flat kink into its slope) has no end.
  const continues = own.edges.some((e2) => e2 !== e && Math.abs(e2.a.s - e.b.s) < 0.05 && Math.abs(e2.a.x - e.b.x) < 0.05);
  const v = speedAt(tAt(e.b.s));
  const zone = EXIT_ZONE_SEC * v;
  if (segS1 !== null && e.b.s > segS1 - zone * 0.9 && !continues) return 'edge:boundary';
  const ez0 = e.b.s, ez1 = e.b.s + zone, zx0 = e.b.x - EXIT_ZONE_HALF_W, zx1 = e.b.x + EXIT_ZONE_HALF_W;
  const halfW = HITBOX.w / 2, halfL = HITBOX.l / 2;
  const railEnd = speedAt(tAt(e.b.s)) * 1.0;
  for (const o2 of obs) {
    if (o2.s > ez1 + railEnd && o2.s > e.b.s + halfL) continue;
    if (o2.s + o2.len < e.a.s - halfL) continue;
    for (const so of o2.solids) {
      const bx = so.box;
      // Exit zone: no crash faces (another obstacle's, or the own obstacle's beyond the edge end).
      const ownHere = o2.id === own.id && bx.s0 < e.b.s - 0.01;
      if (!continues && !ownHere && bx.s1 > ez0 && bx.s0 < ez1 && bx.x1 > zx0 && bx.x0 < zx1 && isCrashFace(so, e.b.y)) return 'edge:exit';
      // Rail end pointing into a tall blocker within 1.0 s.
      if (!continues && so.tall && o2.id !== own.id && bx.s0 >= e.b.s - 0.01 && bx.s0 < e.b.s + railEnd && bx.x1 > e.b.x - 0.5 && bx.x0 < e.b.x + 0.5) return 'edge:railEnd';
      // Grind sweep: the hitbox along the edge (own obstacle excluded).
      if (o2.id === own.id || so.top === 'knock') continue;
      const is = insetOf(bx.s1 - bx.s0), ix = insetOf(bx.x1 - bx.x0), iy = insetOf(bx.y1 - bx.y0);
      if (bx.s1 - is <= e.a.s - halfL || bx.s0 + is >= e.b.s + halfL) continue;
      const sa = Math.max(e.a.s, bx.s0), sb = Math.min(e.b.s, bx.s1);
      const ua = (sa - e.a.s) / Math.max(1e-6, e.b.s - e.a.s), ub = (sb - e.a.s) / Math.max(1e-6, e.b.s - e.a.s);
      const xa = e.a.x + (e.b.x - e.a.x) * Math.max(0, Math.min(1, ua)), xb = e.a.x + (e.b.x - e.a.x) * Math.max(0, Math.min(1, ub));
      if (Math.max(xa, xb) + halfW <= bx.x0 + ix || Math.min(xa, xb) - halfW >= bx.x1 - ix) continue;
      const ey = Math.min(e.a.y, e.b.y);
      if (bx.y1 - iy <= ey + 1e-6 || bx.y0 >= Math.max(e.a.y, e.b.y) + HITBOX.h) continue;
      if (so.top === 'landable' && bx.y1 - ey <= STEP_UP) continue;
      return 'edge:sweep';
    }
    for (const p of o2.pits) {
      if (!continues && p.s1 > ez0 && p.s0 < ez1 && p.x1 > zx0 && p.x0 < zx1) return 'edge:exitPit';
    }
  }
  if (r && !continues) {
    const ok = viableNear(r, e.b.s + zone * 0.5, zx0, zx1);
    if (ok === false) return 'edge:trap';
  }
  return null;
}

/** The edge that failed the last checkTrickLines (the generator trims base curb / lip edges and retries). */
export const TRICK_FAIL: { edge: GrindEdge | null; base: boolean; text: string } = { edge: null, base: false, text: '' };

/** Rule (d) over the window: edges of `segObs` (ending in their segment, which ends at segS1) and history edges whose
 *  exit zones reach into it; L1 surfaces' drop ends. */
export function checkTrickLines(segObs: readonly Obstacle[], all: readonly Obstacle[], r: Raster | null, segS1: number): string | null {
  TRICK_FAIL.edge = null; TRICK_FAIL.base = false;
  const mine = new Set(segObs.map((o) => o.id));
  for (const ob of all) {
    const own = mine.has(ob.id);
    for (const e of ob.edges) {
      if (!own && e.b.s + EXIT_ZONE_SEC * speedAt(tAt(e.b.s)) < (segObs[0]?.s ?? segS1)) continue;
      const why = checkEdge(e, ob, all, own ? r : null, own ? segS1 : null);
      if (why) { TRICK_FAIL.edge = e; TRICK_FAIL.base = own && (ob.kind === 'curb' || ob.kind === 'dock_lip'); TRICK_FAIL.text = `${ob.kind}${own ? '' : '(hist)'} edge ${e.a.s.toFixed(1)}-${e.b.s.toFixed(1)} x=${e.a.x}`; return why; }
    }
    if (!own) continue;
    // L1 surfaces: each deck end drops onto a clear exit zone (and nothing under the deck).
    for (const sl of ob.slabs) {
      if (sl.layer !== 1 || sl.kind !== 'flat') continue;
      const v = speedAt(tAt(sl.s1));
      const z1 = sl.s1 + Math.max(EXIT_ZONE_SEC * v, DECK_EXIT_M);
      const xc = (sl.x0 + sl.x1) / 2, hw = Math.max(EXIT_ZONE_HALF_W, (sl.x1 - sl.x0) / 2);
      if (sl.s1 > segS1 - EXIT_ZONE_SEC * v * 0.9) return 'deck:boundary';
      for (const o2 of all) {
        if (o2.id === ob.id) continue;
        for (const so of o2.solids) {
          const bx = so.box;
          if (bx.x1 <= xc - hw || bx.x0 >= xc + hw) continue;
          if (bx.s1 > sl.s1 && bx.s0 < z1 && !SLOPE_BODIES.has(so) && isCrashFace(so, -1e9)) return 'deck:exit';
          if (bx.s1 > sl.s0 && bx.s0 < sl.s1 && bx.x1 > sl.x0 && bx.x0 < sl.x1 && bx.y1 < sl.y0) return 'deck:under';
        }
        for (const p of o2.pits) if (p.x1 > xc - hw && p.x0 < xc + hw && p.s1 > sl.s1 && p.s0 < z1) return 'deck:exitPit';
      }
    }
  }
  return null;
}

/** Rule (g). A face of B is reachable when some reachable (F) ground state sits in its dilated columns at the slice
 *  just before its dilated start. Solids of one obstacle never hide each other. */
export function checkOcclusion(segObs: readonly Obstacle[], all: readonly Obstacle[], r: Raster): string | null {
  const mine = new Set(segObs.map((o) => o.id));
  const dil = VALIDATOR.dilateX + VALIDATOR.safeMargin;
  const list: { so: Solid; ob: Obstacle }[] = [];
  for (const ob of all) for (const so of ob.solids) list.push({ so, ob });
  list.sort((p, q) => p.so.box.s0 - q.so.box.s0);
  const firstAtLeast = (s: number) => { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m]!.so.box.s0 < s) lo = m + 1; else hi = m; } return lo; };
  const sliceBefore = (s: number) => { let lo = 0, hi = r.n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (r.s[m]! < s) lo = m; else hi = m - 1; } return lo; };
  for (const { so: sa, ob: a } of list) {
    const ha = Math.min(sa.box.y1 - sa.box.y0, 1.6);
    if (ha <= STEP_UP) continue;
    const shadow = ha * COT35 + 0.5;
    for (let k = firstAtLeast(sa.box.s1 + 1e-9); k < list.length; k++) {
      const { so: sb, ob: b } = list[k]!;
      if (sb.box.s0 > sa.box.s1 + shadow) break;
      if (b.id === a.id || (!mine.has(b.id) && !mine.has(a.id))) continue;
      if (!isCrashFace(sb, sb.box.y0)) continue;
      if (sb.box.x1 <= sa.box.x0 || sb.box.x0 >= sa.box.x1) continue;
      if (sb.box.y0 >= sa.box.y1) continue;                 // an overhead plate behind a low thing is visible
      // Reachable? The ground states facing B's front just before it.
      const i = sliceBefore(sb.box.s0 + insetOf(sb.box.s1 - sb.box.s0) - VALIDATOR.dilateS);
      const lo = F[i * NPLANES * 2]!, hi = F[i * NPLANES * 2 + 1]!;
      const x0 = Math.max(sa.box.x0, sb.box.x0) - dil, x1 = Math.min(sa.box.x1, sb.box.x1) + dil;
      for (let c = 0; c < NC; c++) {
        const x = cellX(c);
        if (x <= x0 || x >= x1 || !bitTest(lo, hi, c)) continue;
        return `occlusion:${b.kind}`;
      }
    }
  }
  return null;
}
