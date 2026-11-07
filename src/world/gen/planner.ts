// world/gen/planner.ts: the validator's planner for bots (TECH §11.2): the same raster, F / B passes and minimum-
// action DP over a short horizon of visible obstacles, from a bot's own state. It shares the validator's scratch
// (one plan at a time; results are copied out). The safe bot plans on what was inside the guaranteed view 0.25 s ago.
import { DT } from '../../core/tuning';
import type { Obstacle } from '../../core/world';
import { LAYOUTS } from './props/street';
import { RASTER, SLICE, cellOf, cellX } from './validator/grid';
import { ollieWindow } from './validator/path';
import { GUIDES, QUIET, backward, fillViable, forward, groundMasks, minActionPath, precomputePlanes } from './validator/sweep';

export interface PlanInput {
  /** Plan start (run time, on the ground) and the board x there. */
  t: number; x: number;
  /** Horizon length (s). */
  horizon: number;
  /** Visible obstacles (street base included). */
  obstacles: readonly Obstacle[];
  /** Sim tick phase (ticks at phase + n·DT). */
  phase: number;
  /** Last lateral direction (−1, 0, 1). */
  dir?: -1 | 0 | 1;
  /** Refine ollie keys to the middle of their exact window (costs ~0.1 ms per ollie), for take-offs up to this time
   *  (true = all). */
  refine?: boolean | number;
}
/** pts: the line (run time, x); ollies: tap ticks; lands: the planned touch-down time of each ollie. */
export interface PlanOutput { pts: { t: number; x: number }[]; ollies: number[]; lands: number[] }

/** Plan a line from (t, x). Null when no viable line exists in the visible window. */
export function plan(inp: PlanInput): PlanOutput | null {
  const r = RASTER;
  const j0 = Math.ceil(inp.t / SLICE - 1e-9);
  const n = Math.min(380, Math.max(8, Math.round(inp.horizon / SLICE)));
  r.build(j0, n, inp.obstacles, n, { layout: LAYOUTS.downtown, datum: 0, exit: [[-4.5, 4.5]] }, inp.t, inp.t + inp.horizon);
  precomputePlanes(r);
  const c0 = cellOf(inp.x);
  const lo = c0 < 32 ? 1 << c0 : 0, hi = c0 >= 32 ? 1 << (c0 - 32) : 0;
  forward(r, [{ h: null, k: 0, lo, hi }]);
  backward(r);
  fillViable(r);
  GUIDES.length = 0; QUIET.length = 0;
  const dp = minActionPath(r, 0, c0, inp.dir ?? 0);
  if (!dp) return null;
  const pts: { t: number; x: number }[] = [{ t: inp.t, x: inp.x }];
  for (const st of dp.steps) pts.push({ t: r.t[st.i]!, x: cellX(st.c) });
  const ollies: number[] = [], lands: number[] = [];
  for (const o of dp.ollies) {
    let l = o + 1;
    while (l < dp.steps.length && dp.steps[l]!.air) l++;
    const tk = r.t[o]! + DT;
    const x = cellX(dp.steps[o]!.c);
    let tap = inp.phase + Math.round((tk - inp.phase) / DT) * DT;
    if (inp.refine === true || (typeof inp.refine === 'number' && tk <= inp.refine)) {
      const w = ollieWindow(inp.obstacles, x, tk, inp.phase);
      if (w) tap = inp.phase + Math.round(((w.ta + w.tb) / 2 - inp.phase) / DT) * DT;
    }
    ollies.push(tap);
    lands.push(r.t[Math.min(l, dp.steps.length - 1)]! + (tap - tk));
  }
  return { pts, ollies, lands };
}

/** The validator's reachable set from (t, x) over a short horizon (the debug overlay's safe-line heatmap, TECH §11.5):
 *  per grid slice its s and four ground-plane cell masks [reachLo, reachHi, viableLo, viableHi] (reach: the forward
 *  set; viable: reachable and survivable, F & B). Cells are `cellX(c)` (0.25 m from −4.5). Writes into `out` (its
 *  arrays sized for ≥ 380 slices) and returns the slice count. Shares the validator's scratch like plan(). */
export interface ReachOut { s: Float64Array; masks: Int32Array }
export function reachable(inp: Pick<PlanInput, 't' | 'x' | 'horizon' | 'obstacles'>, out: ReachOut): number {
  const r = RASTER;
  const j0 = Math.ceil(inp.t / SLICE - 1e-9);
  const n = Math.min(380, Math.max(8, Math.round(inp.horizon / SLICE)));
  r.build(j0, n, inp.obstacles, n, { layout: LAYOUTS.downtown, datum: 0, exit: [[-4.5, 4.5]] }, inp.t, inp.t + inp.horizon);
  precomputePlanes(r);
  const c0 = cellOf(inp.x);
  forward(r, [{ h: null, k: 0, lo: c0 < 32 ? 1 << c0 : 0, hi: c0 >= 32 ? 1 << (c0 - 32) : 0 }]);
  backward(r);
  fillViable(r);
  for (let i = 0; i < r.n; i++) { out.s[i] = r.s[i]!; groundMasks(i, out.masks, i * 4); }
  return r.n;
}
