// world/gen/validator/path.ts: the M0 safe-line check. The candidate's safe line is swept at 60 Hz as a tube (the
// polyline over [t − LAG, t + LEAD], plus the half hitbox and VALIDATOR.safeMargin) with the ballistic board height of
// its ollies, against the candidate's and the history window's solids and pits, with the sim's own contact rules
// (TECH §6.4 / §5.2): a crash top prunes any board below its inset top (no skim), a landable top prunes boards more
// than STEP_UP below it, pits prune at lip level. Each ollie is also checked shifted by ±shift (ollie window ≥ 2·shift).
// It also refuses lines that would be captured by a grind edge while airborne (bots and the conformance check follow
// the line exactly). TODO(WG): the full grid validator (TECH §5.2: planes, F/B passes, DP, dead ends, greedy check).
import { CAPTURE, DT, G, HITBOX, PIT_FALL_EPS, STEP_UP, V_POP, VALIDATOR, sAt } from '../../../core/tuning';
import type { GroundSlab, Obstacle, Pit } from '../../../core/world';
import { slabYAt } from '../query';
import type { SafeLine } from '../safe';

/** How far the follower may lag / lead the polyline (s). */
export const TUBE_LAG = 0.2, TUBE_LEAD = 0.1;
/** Extra margin on the board centre when crossing a pit on a plank (m). */
export const PIT_CENTRE_MARGIN = 0.15;

const inset = (extent: number) => Math.min(0.08, Math.max(0, extent) / 4);

interface Flat { slabs: GroundSlab[]; pits: Pit[] }

function flatten(obs: readonly Obstacle[]): Flat {
  const f: Flat = { slabs: [], pits: [] };
  for (const ob of obs) { for (const sl of ob.slabs) f.slabs.push(sl); for (const p of ob.pits) f.pits.push(p); }
  return f;
}

/** Ground under a point, with the WorldQuery rules (highest slab ≤ yMax, else pit lip, else the street at 0). */
function groundAt(f: Flat, s: number, x: number, yMax: number): { y: number; pit: boolean; slab: boolean } {
  let best = -Infinity;
  for (const sl of f.slabs) {
    if (s < sl.s0 || s >= sl.s1 || x < sl.x0 || x > sl.x1) continue;
    const y = slabYAt(sl, s);
    if (y <= yMax + 1e-9 && y > best) best = y;
  }
  if (best > -Infinity) return { y: best, pit: false, slab: true };
  for (const p of f.pits) if (s >= p.s0 && s < p.s1 && x >= p.x0 && x <= p.x1) return { y: p.lipY, pit: true, slab: false };
  return { y: 0, pit: false, slab: false };
}

/** Min / max of the polyline over [a, b] (vertices and ends). */
function tube(line: SafeLine, a: number, b: number): [number, number] {
  let lo = Math.min(line.xAt(a), line.xAt(b)), hi = Math.max(line.xAt(a), line.xAt(b));
  for (const p of line.pts) if (p.t > a && p.t < b) { lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); }
  return [lo, hi];
}

export function checkPath(line: SafeLine, obs: readonly Obstacle[], tFrom: number, tTo: number, shift: number): string | null {
  const f = flatten(obs);
  const ollies = line.ollies.map((o) => o + shift).sort((a, b) => a - b);
  let oi = 0, air = false, tTake = 0, y0 = 0, y = 0;
  // Start from the rolling height at tFrom.
  y = groundAt(f, sAt(tFrom), line.xAt(tFrom), STEP_UP).y;
  const halfW = HITBOX.w / 2 + VALIDATOR.safeMargin, halfL = HITBOX.l / 2;
  for (let t = tFrom; t <= tTo + 1e-9; t += DT) {
    const s = sAt(t), xc = line.xAt(t);
    if (!air && oi < ollies.length && t >= ollies[oi]! - 1e-9) {
      air = true; tTake = ollies[oi]!; oi++;
      y0 = groundAt(f, sAt(tTake), line.xAt(tTake), y + STEP_UP).y;
    }
    if (air) {
      const tau = t - tTake;
      const ya = y0 + V_POP * tau - 0.5 * G * tau * tau;
      const g = groundAt(f, s, xc, Math.max(y, ya) + 1e-6);
      if (tau > 0.05 && ya <= g.y) { air = false; y = g.y; } else y = ya;
    } else {
      y = groundAt(f, s, xc, y + STEP_UP).y;
    }
    const [lo, hi] = tube(line, t - TUBE_LAG, t + TUBE_LEAD);
    // Solids.
    for (const ob of obs) {
      if (ob.s > s + halfL + 0.1 || ob.s + ob.len < s - halfL - 0.1) continue;
      for (const so of ob.solids) {
        const b = so.box;
        const is = inset(b.s1 - b.s0), ix = inset(b.x1 - b.x0), iy = inset(b.y1 - b.y0);
        if (s + halfL <= b.s0 + is || s - halfL >= b.s1 - is) continue;
        if (hi + halfW <= b.x0 + ix || lo - halfW >= b.x1 - ix) continue;
        if (y >= b.y1 - iy - 1e-9 || y + HITBOX.h <= b.y0) continue;
        if (so.top === 'knock') continue;
        if (so.top === 'landable' && b.y1 - y <= STEP_UP) continue;    // skim
        return `path:${ob.kind}`;
      }
    }
    // Pits: the board centre (with a margin) must not be over an uncovered pit at lip level.
    for (const p of f.pits) {
      if (s < p.s0 || s >= p.s1) continue;
      const a = lo - PIT_CENTRE_MARGIN, b = hi + PIT_CENTRE_MARGIN;
      if (b < p.x0 || a > p.x1 || y > p.lipY + PIT_FALL_EPS + 0.05) continue;
      // Covered by a slab across the whole centre tube (a plank)?
      let covered = false;
      for (const sl of f.slabs) if (s >= sl.s0 && s < sl.s1 && sl.x0 <= Math.max(a, p.x0) && sl.x1 >= Math.min(b, p.x1)) { covered = true; break; }
      if (!covered) return 'path:pit';
    }
    // Never captured by a grind edge while airborne.
    // The sim captures from s ≥ a.s − HITBOX.l/2 (sim/predict.ts CAPTURE_LEAD), with u clamped to 0.
    if (air) {
      for (const ob of obs) for (const e of ob.edges) {
        if (e.pickOnly || s < e.a.s - halfL || s > e.b.s) continue;
        const u = Math.min(1, Math.max(0, (s - e.a.s) / Math.max(1e-6, e.b.s - e.a.s)));
        const ex = e.a.x + (e.b.x - e.a.x) * u;
        if (ex < lo - CAPTURE.lat - 0.2 || ex > hi + CAPTURE.lat + 0.2) continue;
        const ey = e.a.y + (e.b.y - e.a.y) * u;
        if (y <= ey + CAPTURE.above + 0.05 && y >= ey - CAPTURE.below - 0.05) return 'path:capture';
      }
    }
  }
  return null;
}
