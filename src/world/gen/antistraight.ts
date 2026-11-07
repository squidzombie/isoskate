// world/gen/antistraight.ts: the anti-"just go straight" bookkeeping (DESIGN §10.7) on the non-T0 A-clock. The
// straight-bot guarantee itself comes from the anti-straight rows (rows.ts, scheduled in generator.ts); these are
// measured (docs/core-requests.md, WG section):
//  - A1 column rule: 18 lateral columns of 0.5 m. A tall solid COVERS a column when a board centred anywhere in the
//    column's reachable part (|x| ≤ 4.3, and left of the Docks lip) overlaps its inset box: tapping ollie cannot save a
//    straight line there. lastTall[k] is the A-time of the last cover.
//  - A2 wander rule: the safe line's lateral range since the last wander reaches 3 m (a wander wall goes in when a
//    template would leave the period without one and it fits).
import type { AreaId } from '../../core/ids';
import { HITBOX, TARGET_X_MAX } from '../../core/tuning';
import type { Obstacle, Solid } from '../../core/world';
import { GEN, type PhaseId } from './gen.config';
import { insetOf } from './validator/path';
import { LIP } from './props/street';
import type { SafeLine } from './safe';

export const COLS = 18;
export const colX0 = (k: number): number => -4.5 + GEN.a1.colW * k;

/** The reachable centre range of column k (soft walls; the Docks lip). */
export function colRange(k: number, area: AreaId): [number, number] {
  const xMax = area === 'docks' ? LIP.x0 + insetOf(LIP.x1 - LIP.x0) - HITBOX.w / 2 - 0.01 : TARGET_X_MAX;
  return [Math.max(colX0(k), -TARGET_X_MAX), Math.min(colX0(k) + GEN.a1.colW, xMax)];
}

/** Does a tall solid cover column k? */
export function covers(so: Solid, k: number, area: AreaId): boolean {
  if (!so.tall) return false;
  const [a, b] = colRange(k, area);
  if (b <= a) return true;                                // nothing reachable there
  const ix = insetOf(so.box.x1 - so.box.x0);
  return so.box.x0 + ix < a + HITBOX.w / 2 && so.box.x1 - ix > b - HITBOX.w / 2;
}

/** Columns with nothing reachable (always "covered"). */
export const deadColumn = (k: number, area: AreaId): boolean => { const [a, b] = colRange(k, area); return b <= a; };

/** Update lastTall from the tall solids of a segment: aOf(s) maps a front s to its A-time. */
export function coverColumns(lastTall: Float64Array, obs: readonly Obstacle[], area: AreaId, aOf: (s: number) => number): void {
  for (const ob of obs) for (const so of ob.solids) {
    if (!so.tall || so.box.y0 > ob.solids[0]!.box.y0 + 0.5) continue;
    const a = aOf(so.box.s0);
    for (let k = 0; k < COLS; k++) if (a > lastTall[k]! && covers(so, k, area)) lastTall[k] = a;
  }
}

export const a1Period = (ph: PhaseId): number => GEN.a1.period[ph];
export const a2Period = (ph: PhaseId): number => GEN.a2.period[ph];

/** A2: advance the wander state over the line on [t0, t1]; aOf maps run time to A-time. Returns the new state. */
export function trackWander(line: SafeLine, t0: number, t1: number, st: { lo: number; hi: number; lastA: number },
  aOf: (t: number) => number): { lo: number; hi: number; lastA: number } {
  let { lo, hi, lastA } = st;
  for (let t = t0; t <= t1 + 1e-9; t += 0.05) {
    const x = line.xAt(t);
    lo = Math.min(lo, x); hi = Math.max(hi, x);
    if (hi - lo >= GEN.a2.shift - 1e-6) { lastA = aOf(t); lo = hi = x; }
  }
  return { lo, hi, lastA };
}
