// world/gen/planner.ts: the validator's planner for bots (TECH §11.2): the same raster, F / B passes and minimum-
// action DP over a short horizon of visible obstacles, from a bot's own state. It shares the validator's scratch
// (one plan at a time; results are copied out). The safe bot plans on what was inside the guaranteed view 0.25 s ago.
import { DT, sAt } from '../../core/tuning';
import type { Obstacle } from '../../core/world';
import { LAYOUTS } from './props/street';
import { RASTER, SLICE, cellOf, cellX } from './validator/grid';
import { ollieWindow } from './validator/path';
import { GUIDES, QUIET, backward, fillViable, forward, minActionPath, precomputePlanes } from './validator/sweep';

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
  /** Refine ollie keys to the middle of their exact window (costs ~0.1 ms per ollie). */
  refine?: boolean;
}
export interface PlanOutput { pts: { t: number; x: number }[]; ollies: number[] }

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
  const ollies: number[] = [];
  for (const o of dp.ollies) {
    const tk = r.t[o]! + DT;
    const x = cellX(dp.steps[o]!.c);
    if (inp.refine) {
      const w = ollieWindow(inp.obstacles, x, tk, inp.phase);
      if (w) { ollies.push(inp.phase + Math.round(((w.ta + w.tb) / 2 - inp.phase) / DT) * DT); continue; }
    }
    ollies.push(inp.phase + Math.round((tk - inp.phase) / DT) * DT);
  }
  void sAt;
  return { pts, ollies };
}
