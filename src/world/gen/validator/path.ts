// world/gen/validator/path.ts: the exact 60 Hz checks of a committed safe line, with the sim's own contact rules
// (TECH §6.4 / §5.2): a crash top prunes any board below its inset top (no skim), a landable top prunes boards more
// than STEP_UP below it (frontal), pits prune at lip level, and a non-pickOnly edge must never capture the board while
// airborne (bots and the conformance check follow the line exactly).
//  - checkPath: the polyline swept as a tube (x over [t − LAG, t + LEAD], plus the half hitbox and SAFE_MARGIN) with
//    the ballistic board height of its ollies, against the window's solids and pits;
//  - ollieWindow: the exact take-off window of one ollie on the sim's tick grid, so its key sits in the middle of the
//    window and the required window (≥ 0.25 s, DESIGN §5.5) is measured, not estimated.
// The grid validator (grid.ts, sweep.ts) is the fairness proof; these checks make the committed line followable.
import { CAPTURE, DT, FACE_INSET, G, HITBOX, PIT_FALL_EPS, STEP_UP, V_POP, VALIDATOR, sAt } from '../../../core/tuning';
import type { GroundSlab, Obstacle, Pit } from '../../../core/world';
import { slabYAt } from '../query';
import type { SafeLine } from '../safe';

export const PATH_FAIL = { text: '' };
/** How far a follower may lag / lead the polyline (s). */
export const TUBE_LAG = 0.2, TUBE_LEAD = 0.1;
/** Extra margin on the board centre when crossing a pit on a plank (m). */
export const PIT_CENTRE_MARGIN = 0.15;

/** The sim's crash-face inset of one axis (TECH §6.4): FACE_INSET, never more than a quarter of the extent. The one
 *  definition; sim/collide.ts uses it too. */
export const insetOf = (extent: number): number => Math.min(FACE_INSET, Math.max(0, extent) / 4);

interface Flat { slabs: GroundSlab[]; pits: Pit[]; obs: readonly Obstacle[] }

function flatten(obs: readonly Obstacle[]): Flat {
  const f: Flat = { slabs: [], pits: [], obs };
  for (const ob of obs) { for (const sl of ob.slabs) f.slabs.push(sl); for (const p of ob.pits) f.pits.push(p); }
  return f;
}
/** The flattened subset of a window's obstacles overlapping [s0, s1] (checkPath works through it in chunks). */
function flattenRange(obs: readonly Obstacle[], s0: number, s1: number): Flat {
  return flatten(obs.filter((o) => o.s <= s1 && o.s + o.len >= s0));
}

/** Ground under a point, with the WorldQuery rules (highest slab ≤ yMax, else pit lip, else the street at 0).
 *  GROUND_PIT tells whether the last call found a pit (no allocation per call: this runs per tick). */
let GROUND_PIT = false;
function groundAt(f: Flat, s: number, x: number, yMax: number): number {
  let best = -Infinity;
  const slabs = f.slabs;
  for (let k = 0; k < slabs.length; k++) {
    const sl = slabs[k]!;
    if (s < sl.s0 || s >= sl.s1 || x < sl.x0 || x > sl.x1) continue;
    const y = slabYAt(sl, s);
    if (y <= yMax + 1e-9 && y > best) best = y;
  }
  GROUND_PIT = false;
  if (best > -Infinity) return best;
  for (const p of f.pits) if (s >= p.s0 && s < p.s1 && x >= p.x0 && x <= p.x1) { GROUND_PIT = true; return p.lipY; }
  return 0;
}

/** Contact of a board (centre s, x range [lo, hi], board bottom y) with the window's solids, pits and (airborne) edges:
 *  null = clear, else the reason. */
function contact(f: Flat, s: number, lo: number, hi: number, y: number, air: boolean, vy: number, margin: number): string | null {
  const halfW = HITBOX.w / 2 + margin, halfL = HITBOX.l / 2;
  for (const ob of f.obs) {
    if (ob.s > s + halfL + 0.1 || ob.s + ob.len < s - halfL - 0.1) continue;
    for (const so of ob.solids) {
      const b = so.box;
      const is = insetOf(b.s1 - b.s0), ix = insetOf(b.x1 - b.x0), iy = insetOf(b.y1 - b.y0);
      if (s + halfL <= b.s0 + is || s - halfL >= b.s1 - is) continue;
      if (hi + halfW <= b.x0 + ix || lo - halfW >= b.x1 - ix) continue;
      if (y >= b.y1 - iy - 1e-9 || y + HITBOX.h <= b.y0) continue;
      if (so.top === 'knock') continue;
      if (so.top === 'landable' && b.y1 - y <= STEP_UP) continue;    // skim
      return `path:${ob.kind}`;
    }
    if (air && vy <= CAPTURE.vyMax) {
      // Never captured by a grind edge while airborne. The sim captures from s ≥ a.s − HITBOX.l/2 (CAPTURE_LEAD).
      for (const e of ob.edges) {
        if (e.pickOnly || s < e.a.s - halfL || s > e.b.s) continue;
        const u = Math.min(1, Math.max(0, (s - e.a.s) / Math.max(1e-6, e.b.s - e.a.s)));
        const ex = e.a.x + (e.b.x - e.a.x) * u;
        if (ex < lo - CAPTURE.lat - 0.2 || ex > hi + CAPTURE.lat + 0.2) continue;
        const ey = e.a.y + (e.b.y - e.a.y) * u;
        if (y <= ey + CAPTURE.above + 0.05 && y >= ey - CAPTURE.below - 0.05) return 'path:capture';
      }
    }
  }
  // Pits: the board centre (with a margin) must not be over an uncovered pit at lip level.
  for (const p of f.pits) {
    if (s < p.s0 || s >= p.s1) continue;
    const a = lo - PIT_CENTRE_MARGIN, b = hi + PIT_CENTRE_MARGIN;
    if (b < p.x0 || a > p.x1 || y > p.lipY + PIT_FALL_EPS + 0.05) continue;
    let covered = false;
    for (const sl of f.slabs) if (s >= sl.s0 && s < sl.s1 && sl.x0 <= Math.max(a, p.x0) && sl.x1 >= Math.min(b, p.x1)) { covered = true; break; }
    if (!covered) return 'path:pit';
  }
  return null;
}

/** Min / max of the polyline over [a, b] (vertices and ends), into TUBE_LO / TUBE_HI. */
let TUBE_LO = 0, TUBE_HI = 0;
function tube(line: SafeLine, a: number, b: number): void {
  const xa = line.xAt(a), xb = line.xAt(b);
  let lo = Math.min(xa, xb), hi = Math.max(xa, xb);
  const pts = line.pts;
  for (let k = 0; k < pts.length; k++) { const p = pts[k]!; if (p.t > a && p.t < b) { if (p.x < lo) lo = p.x; if (p.x > hi) hi = p.x; } }
  TUBE_LO = lo; TUBE_HI = hi;
}

/** The line swept at 60 Hz from tFrom to tTo with its ollies (tap ticks; the pop advances one tick in the tap tick),
 *  shifted by `shift` seconds. Null = clear. */
export function checkPath(line: SafeLine, obs: readonly Obstacle[], tFrom: number, tTo: number, shift: number): string | null {
  // Work through the window in 0.5 s chunks, each with only the obstacles near it.
  let f = flattenRange(obs, sAt(tFrom) - 3, sAt(tFrom + 0.5) + 3), fTo = tFrom + 0.5;
  const ollies = line.ollies.map((o) => o + shift).sort((a, b) => a - b);
  let oi = 0, air = false, tPop = 0, y0 = 0, y = 0, vy = 0;
  y = groundAt(f, sAt(tFrom), line.xAt(tFrom), STEP_UP);
  for (let t = tFrom; t <= tTo + 1e-9; t += DT) {
    if (t > fTo) { f = flattenRange(obs, sAt(t) - 3, sAt(t + 0.5) + 3); fTo = t + 0.5; }
    const s = sAt(t), xc = line.xAt(t);
    if (!air && oi < ollies.length && t >= ollies[oi]! - 1e-9) {
      air = true; tPop = ollies[oi]! - DT; oi++;
      y0 = groundAt(f, sAt(t), line.xAt(t), y + STEP_UP);
    }
    if (air) {
      const tau = t - tPop;
      const ya = y0 + V_POP * tau - 0.5 * G * tau * tau;
      vy = V_POP - G * tau;
      const gy = groundAt(f, s, xc, Math.max(y, ya) + 1e-6);
      if (vy < 0 && ya <= gy) { air = false; y = gy; } else y = ya;
    } else {
      y = groundAt(f, s, xc, y + STEP_UP);
    }
    tube(line, t - TUBE_LAG, t + TUBE_LEAD);
    const lo = TUBE_LO, hi = TUBE_HI;
    const r = contact(f, s, lo, hi, y, air, vy, VALIDATOR.safeMargin);
    if (r) { PATH_FAIL.text = `t=${t.toFixed(3)} x=${xc.toFixed(2)} tube=[${lo.toFixed(2)},${hi.toFixed(2)}] y=${y.toFixed(2)} air=${air}`; return r; }
  }
  return null;
}

/** The exact take-off window of an ollie from x on the sim's tick grid (ticks at phase + n·DT): every tap tick T
 *  within ±0.4 s of `tKey` for which rolling at x from T − 0.2 s, popping at T and rolling 0.2 s past the touch-down
 *  meets nothing. Returns the contiguous valid range around the tick nearest tKey (null if that tick fails). */
export function ollieWindow(obs: readonly Obstacle[], x: number, tKey: number, phase: number, tube = 0.05): { ta: number; tb: number } | null {
  const near = obs.filter((o) => o.s <= sAt(tKey + 1.4) && o.s + o.len >= sAt(tKey - 0.7));
  const f = flatten(near);
  const ok = (T: number): boolean => {
    let y = groundAt(f, sAt(T - 0.2), x, STEP_UP + 10);
    for (let t = T - 0.2; t < T - 1e-9; t += DT) {
      y = groundAt(f, sAt(t), x, y + STEP_UP);
      if (contact(f, sAt(t), x - tube, x + tube, y, false, 0, VALIDATOR.safeMargin)) return false;
    }
    const y0 = groundAt(f, sAt(T), x, y + STEP_UP);
    let landed = -1;
    for (let k = 0; k < 90; k++) {
      const t = T + k * DT, tau = (k + 1) * DT, s = sAt(t);
      const ya = y0 + V_POP * tau - 0.5 * G * tau * tau, vy = V_POP - G * tau;
      const gy = groundAt(f, s, x, Math.max(ya, y0) + 1e-6);
      if (vy < 0 && ya <= gy) {
        if (GROUND_PIT) return false;
        y = gy; landed = k; break;
      }
      if (contact(f, s, x - tube, x + tube, ya, true, vy, VALIDATOR.safeMargin)) return false;
    }
    if (landed < 0) return false;
    for (let k = landed; k < landed + 12; k++) {
      const t = T + k * DT;
      y = groundAt(f, sAt(t), x, y + STEP_UP);
      if (contact(f, sAt(t), x - tube, x + tube, y, false, 0, VALIDATOR.safeMargin)) return false;
    }
    return true;
  };
  const n0 = Math.round((tKey - phase) / DT);
  if (!ok(phase + n0 * DT)) return null;
  // Expand in steps of 3 ticks, then refine the last step tick by tick (a hole narrower than 3 ticks inside a window
  // is not physical: contacts change monotonically with the take-off time around an obstacle).
  const edge = (dir: -1 | 1): number => {
    let k = n0;
    while (Math.abs(k + 3 * dir - n0) <= 24 && ok(phase + (k + 3 * dir) * DT)) k += 3 * dir;
    while (Math.abs(k + dir - n0) <= 24 && ok(phase + (k + dir) * DT)) k += dir;
    return k;
  };
  const a = edge(-1), b = edge(1);
  return { ta: phase + a * DT, tb: phase + b * DT };
}
