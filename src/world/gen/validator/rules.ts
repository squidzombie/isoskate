// world/gen/validator/rules.ts: the M0 static rules (DESIGN §10.6.5): height bands (rule e), required-action spacing
// along the SafeKeys (rule b: R_MIN and T_SHIFT, across segment boundaries), edges ending inside their segment with a
// clear exit zone (rule d, simplified), and the safe-line path check (validator/path.ts). A3 scheduling is enforced by
// the generator (schedule.ts). TODO(WG): rules a, c, f–i and the grid planes (TECH §5.2).
import { HEIGHT, R_MIN, STEP_UP, T_SHIFT, VALIDATOR, speedAt, tAt } from '../../../core/tuning';
import type { Obstacle } from '../../../core/world';
import { ObTag } from '../../../core/world';
import type { RequiredAction, SafeLine } from '../safe';
import { EXIT_ZONE_HALF_W, EXIT_ZONE_SEC } from '../props/shared';
import { checkPath } from './path';

export const rMinAt = (t: number): number => {
  let r = R_MIN[0]!.sec;
  for (const e of R_MIN) if (t >= e.t) r = e.sec;
  return r;
};

/** Minimum gap after a required action at time t that moved dx (DESIGN §10.6 rule b). */
export const spacingAfter = (t: number, dx: number): number => Math.max(rMinAt(t), T_SHIFT(dx));

/** Rule (e): no solid top in the forbidden band; full-width hazards ≤ 0.50 m tall and ≤ 0.6 m long; pits ≤ 0.35 s·v. */
export function checkBands(obs: readonly Obstacle[]): string | null {
  for (const ob of obs) {
    for (const so of ob.solids) {
      const h = so.box.y1 - so.box.y0;
      if (h > HEIGHT.forbidMin - 0.005 && h < HEIGHT.forbidMax + 0.005) return `band:${ob.kind}`;
      if (ob.tags & ObTag.FullWidth) {
        if (h > HEIGHT.fullWidthMaxH + 1e-6) return 'band:fullWidthH';
        if (so.box.s1 - so.box.s0 > HEIGHT.fullWidthMaxL + 1e-6) return 'band:fullWidthL';
      }
    }
    for (const p of ob.pits) if (p.s1 - p.s0 > HEIGHT.pitMaxSec * speedAt(tAt(p.s0)) + 0.011) return 'band:pit';
  }
  return null;
}

/** Rule (b): consecutive required actions start ≥ max(R_MIN, T_SHIFT(dx_prev)) apart, from the previous segment's. */
export function checkSpacing(actions: readonly RequiredAction[], last: { t: number; dx: number } | null): string | null {
  let prev = last;
  for (const a of actions) {
    if (prev && a.t - prev.t < spacingAfter(prev.t, prev.dx) - 1e-6) return 'spacing';
    prev = { t: a.t, dx: a.dx };
  }
  return null;
}

/** Rule (d), simplified: every grind edge (curbs included) ends inside the segment with a clear exit zone (0.6 s·v
 *  long, ±1.5 m wide): no crash face and no landable face taller than STEP_UP above the edge in it. */
export function checkEdges(obs: readonly Obstacle[], s1: number, v: number): string | null {
  const zone = EXIT_ZONE_SEC * v;
  for (const ob of obs) {
    for (const e of ob.edges) {
      if (e.b.s > s1 - zone * 0.9) return 'edge:boundary';
      for (const o2 of obs) {
        if (o2.id === ob.id) continue;
        for (const so of o2.solids) {
          const b = so.box;
          if (b.s1 <= e.b.s || b.s0 >= e.b.s + zone || b.x1 <= e.b.x - EXIT_ZONE_HALF_W || b.x0 >= e.b.x + EXIT_ZONE_HALF_W) continue;
          if (so.top === 'landable' && b.y1 - e.b.y <= STEP_UP) continue;
          if (so.top === 'knock') continue;
          return 'edge:exit';
        }
      }
    }
  }
  return null;
}

/** The safe line survives with every ollie on time and shifted by ±window/2 (required ollie window 0.25 s; 1 ms of
 *  float slack, far below a tick, so a trench at exactly 0.35 s·v, whose window is exactly 0.25 s, passes). */
export function checkLine(line: SafeLine, obs: readonly Obstacle[], tFrom: number, tTo: number): string | null {
  const shift = VALIDATOR.ollieWindowRequired / 2 - 0.001;
  for (const sh of line.ollies.length ? [0, -shift, shift] : [0]) {
    const r = checkPath(line, obs, tFrom, tTo, sh);
    if (r) return r;
  }
  return null;
}
