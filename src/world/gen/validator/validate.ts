// world/gen/validator/validate.ts: one candidate segment through the whole validator (DESIGN §10.6, TECH §5.2).
//   raster (history window + segment + 1 s of open entry) → F (from the stored planes) → B (to the exit set) →
//   (a) E_prev ⊆ B → minimum-action path (DP) → required actions → head/tail/grace/T0 → (b) spacing → (c) decision
//   time → (h) dead ends → (i) greedy player → (e) bands, (d) trick lines, (g) occlusion → exact ollie windows on the
//   tick grid (≥ 0.25 s, keys centred) → exact 60 Hz tube check of the committed line → the next segment's state
//   (history planes, committed exit set E, the path's state at the boundary).
import { round1cm } from '../../../core/math';
import { DECISION_MIN, DT, T_SHIFT, VALIDATOR, sAt } from '../../../core/tuning';
import type { Obstacle } from '../../../core/world';
import type { StreetLayout } from '../props/street';
import { SafeLine, type RequiredAction } from '../safe';
import { HI_MASK, NC, RASTER, SLICE, cellOf, cellX, nG } from './grid';
import { PATH_FAIL, checkPath, ollieWindow } from './path';
import { TRICK_FAIL, checkBands, checkOcclusion, checkSpacing, checkTrickLines } from './rules';
import {
  DEAD_END_SLICES, EXIT_FAIL, F, B, actionsOf, backward, decisionTime, exitSetViolations, fillViable, forward,
  GUIDES, QUIET, dumpGround, greedyCheck, minActionPath, planesAt, precomputePlanes, rMinAt, worstDeadEnd, type PlaneBits,
} from './sweep';

/** What the cursor carries between segments for the validator. */
export interface ValState {
  jH: number; hist: PlaneBits[];          // F at global slice jH (start of the next history window)
  jE: number; exitSet: PlaneBits[];       // committed exit set E at global slice jE (first slice ≥ the boundary)
  start: { c: number; h: number | null; k: number };   // the safe path's state at jE (h = take-off height if airborne)
  lastDir: -1 | 0 | 1;
  /** Sim tick phase: ticks are at phase + n·DT (startT runs). */
  phase: number;
}

export interface ValInput {
  obstacles: readonly Obstacle[];         // window: history + persistent + this segment
  seg: readonly Obstacle[];               // this segment's own obstacles (rules d, g)
  t0: number; t1: number; s1: number;
  layoutEnd: StreetLayout; datumEnd: number; exit: readonly (readonly [number, number])[];
  earliest: number;                       // no required action before (spawn grace)
  last: { t: number; dx: number } | null; // previous required action (rule b)
  noActions: boolean;                     // T0: no required actions at all
  headSec: number; tailSec: number;       // DESIGN §10.5: none in the first 0.6 s / last 0.4 s
  groundHi(x0: number, x1: number, s: number): number;
  greedy: boolean;
  /** Template hints for the line (where it should pass), e.g. a gate opening's centre. */
  guides?: readonly { t0: number; t1: number; x0: number; x1: number }[];
  /** Emergency (the bare fallback failed): skip the fairness rules, keep only a followable line. */
  relax?: boolean;
}

export interface ValStats { decisionMin: number; windowMin: number; deadEndMax: number; actions: number }
export type ValResult =
  | { ok: true; line: SafeLine; actions: RequiredAction[]; next: ValState; stats: ValStats; exitX: number }
  | { ok: false; why: string; detail?: string; edge?: { s0: number; s1: number; x: number } };

const HEAD_EPS = 1e-6;

/** Rule (h) tolerance in slices: none. Grid states die at slice granularity (1/30 s) with dilated blockers, so a real
 *  pocket may outlive its grid twin by up to a slice; the limit is applied to the grid as it stands (≤ 2.0 s). */
export const DEAD_END_TOL = 0;
/** Development switch: attach ground-plane dumps to some rejections. */
export const VAL_DEBUG = { dump: false, calls: 0 };

export function initialState(t: number, x = 0): ValState {
  const j = Math.ceil(t / SLICE - 1e-9), c = cellOf(x);
  const lo = c < 32 ? 1 << c : 0, hi = c >= 32 ? 1 << (c - 32) : 0;
  return { jH: j, hist: [{ h: null, k: 0, lo, hi }], jE: j, exitSet: [], start: { c, h: null, k: 0 }, lastDir: 0,
    phase: ((t % DT) + DT) % DT };
}

export function validate(st: ValState, inp: ValInput): ValResult {
  const r = RASTER;
  VAL_DEBUG.calls++;
  const j0 = st.jH, jS = st.jE;
  const jT = Math.ceil(inp.t1 / SLICE - 1e-9), jN = jT + 30;
  const n = jN - j0 + 1;
  if (n > 400 || jS < j0) return { ok: false, why: 'window' };
  r.build(j0, n, inp.obstacles, jT - j0, { layout: inp.layoutEnd, datum: inp.datumEnd, exit: inp.exit }, inp.t0, inp.t1);
  precomputePlanes(r);
  forward(r, st.hist);
  backward(r);
  fillViable(r);
  const iS = jS - j0, iT = jT - j0;
  // (a) the previous committed exit set must still be viable.
  if (!inp.relax && st.exitSet.length && exitSetViolations(r, iS, st.exitSet) > 0) return { ok: false, why: 'a:exitSet', detail: EXIT_FAIL.text + (VAL_DEBUG.dump ? '\n' + dumpGround(r, iS - 3, iS + 40) : '') };
  // The safe path: follow the start state's arc down if airborne, then the DP.
  let iP = iS, cP = st.start.c;
  const pre: { i: number; c: number; air: boolean; h: number; k: number }[] = [];
  if (st.start.h !== null) {
    let h = -1;
    for (let q = 0; q < r.nh; q++) if (Math.abs(r.classes[q]! - st.start.h) < 0.005) h = q;
    if (h < 0) return { ok: false, why: 'dp:class' };
    for (let k = st.start.k; ; k++) {
      const i = iS + (k - st.start.k);
      if (i >= r.n) return { ok: false, why: 'dp:air' };
      const q = h * 31 + k;
      if (k > r.kMax[h]! || (r.pvy[q]! < 0 && r.py[q]! <= r.cellGy(i, cP) + 1e-6)) { iP = i; break; }
      pre.push({ i, c: cP, air: true, h, k });
    }
  }
  GUIDES.length = 0;
  QUIET.length = 0;
  QUIET.push({ i0: iS - 1, i1: Math.ceil((inp.t0 + inp.headSec) / SLICE) - j0 }, { i0: Math.floor((inp.t1 - inp.tailSec) / SLICE) - j0, i1: iT });
  for (const g of inp.guides ?? []) GUIDES.push({ i0: Math.round(g.t0 / SLICE) - j0, i1: Math.round(g.t1 / SLICE) - j0, c0: cellOf(g.x0), c1: cellOf(g.x1) });
  const dp = minActionPath(r, iP, cP, st.lastDir);
  GUIDES.length = 0; QUIET.length = 0;
  if (!dp) return { ok: false, why: 'dp' };
  const steps = [...pre, ...dp.steps];
  const tOf = (i: number) => r.t[i]!;
  // Exact ollie windows on the tick grid: keys centred, required windows ≥ 0.25 s (DESIGN §5.5, §10.6.6).
  let windowMin = Infinity;
  const ollieKeys = new Map<number, number>();
  for (const o of dp.ollies) {
    if (o >= iT) continue;
    const x = cellX(steps[o - iP + pre.length]!.c);
    const w = ollieWindow(inp.obstacles, x, tOf(o) + DT, st.phase);
    if (!w) return { ok: false, why: 'window:none' };
    const win = w.tb - w.ta + DT;
    windowMin = Math.min(windowMin, win);
    if (win < VALIDATOR.ollieWindowRequired - 1e-6) return { ok: false, why: 'window' };
    ollieKeys.set(o, round6(st.phase + Math.round(((w.ta + w.tb) / 2 - st.phase) / DT) * DT));
  }
  const acts = actionsOf(r, steps, dp.ollies).filter((a) => a.i < iT)
    .map((a) => (a.kind === 'ollie' ? { ...a, t: ollieKeys.get(a.i)! } : a)).sort((a, b) => a.t - b.t);
  // Head / tail / grace / T0 (DESIGN §10.5).
  for (const a of acts) {
    if (inp.noActions && !inp.relax) return { ok: false, why: 't0:action' };
    if (a.t < inp.earliest - HEAD_EPS) return { ok: false, why: 'grace' };
    if (a.t < inp.t0 + inp.headSec - HEAD_EPS) return { ok: false, why: 'head' };
    if (a.t > inp.t1 - inp.tailSec + HEAD_EPS) return { ok: false, why: 'tail' };
  }
  // (b) spacing.
  const sp = checkSpacing(acts.map((a) => ({ t: a.t, dx: a.dx })), inp.last);
  if (sp) return { ok: false, why: sp, detail: acts.map((a) => `${a.kind}@${a.t.toFixed(2)}:${a.dx}`).join(' ') + (inp.last ? ` last ${inp.last.t.toFixed(2)}:${inp.last.dx}` : '') };
  // (c) decision time.
  let decisionMin = Infinity;
  for (const a of acts) {
    const d = decisionTime(r, a).decision;
    decisionMin = Math.min(decisionMin, d);
    if (d < DECISION_MIN - SLICE - 1e-6 && !inp.relax) return { ok: false, why: 'c:decision' };
  }
  // (h) dead ends die within 2.0 s (slices whose 2.0 s horizon lies inside the window).
  const de = worstDeadEnd(r, 0, r.n - 1 - DEAD_END_SLICES - 1, DEAD_END_SLICES + DEAD_END_TOL);
  if (de.slices > DEAD_END_SLICES + DEAD_END_TOL && !inp.relax) return { ok: false, why: `h:deadEnd`, detail: `t=${r.t[de.i]!.toFixed(2)} x=${cellX(de.c)} live=${(de.slices * SLICE).toFixed(2)}` + (VAL_DEBUG.dump ? '\n' + dumpGround(r, de.i - 3, de.i + de.slices + 3) : '') };
  // (i) the greedy player.
  if (inp.greedy && !inp.relax) {
    const g = greedyCheck(r, iP, cellX(cP), iT);
    if (g >= 0) return { ok: false, why: 'i:greedy', detail: `fail t=${r.t[g]!.toFixed(2)} start x=${cellX(cP)} t0=${inp.t0.toFixed(2)}` + (VAL_DEBUG.dump ? '\n' + dumpGround(r, iP, Math.min(r.n - 1, g + 3)) : '') };
  }
  // (e), (d), (g).
  const band = checkBands(inp.seg, inp.groundHi);
  if (band) return { ok: false, why: band };
  const tl = checkTrickLines(inp.seg, inp.obstacles, r, inp.s1);
  if (tl) return { ok: false, why: tl, detail: TRICK_FAIL.text, edge: TRICK_FAIL.base && TRICK_FAIL.edge ? { s0: TRICK_FAIL.edge.a.s, s1: TRICK_FAIL.edge.b.s, x: TRICK_FAIL.edge.a.x } : undefined };
  const occ = checkOcclusion(inp.seg, inp.obstacles, r);
  if (occ) return { ok: false, why: occ };
  // The committed line: polyline vertices from the path, ollie keys centred in their exact windows.
  const x0 = cellX(steps[0]!.c);
  const line = new SafeLine(inp.t0, x0);
  let prevDir = 0, prevMoveEnd = -1;
  for (let k = 1; k < steps.length && steps[k - 1]!.i < iT; k++) {
    const a = steps[k - 1]!, b = steps[k]!;
    const dc = b.c - a.c;
    if (dc !== 0) {
      const dir = Math.sign(dc);
      if (dir !== prevDir || (prevMoveEnd >= 0 && a.i - prevMoveEnd > 1)) line.hold(Math.max(line.t, tOf(a.i)));
      prevDir = dir; prevMoveEnd = b.i;
      line.pts.push({ t: tOf(b.i), x: cellX(b.c) });
    } else if (prevDir !== 0 && !a.air && nG(r.j0 + a.i) === 1) { prevDir = 0; }
  }
  // Collapse collinear vertices (a move is one ramp).
  compress(line);
  for (const t of ollieKeys.values()) line.ollies.push(t);
  line.ollies.sort((p, q) => p - q);
  const pr = checkPath(line, inp.obstacles, inp.t0, inp.t1, 0);
  if (pr) return { ok: false, why: pr, detail: PATH_FAIL.text + ' ollies=' + line.ollies.map((o) => o.toFixed(2)).join(',') + ' pts=' + line.pts.map((p) => `${p.t.toFixed(2)}:${p.x}`).join(' ') };
  // Required actions for the cursor (spacing across the boundary).
  const actions: RequiredAction[] = acts.map((a) => ({ t: a.t, kind: a.kind, dx: a.dx, x: cellX(a.c) }));
  // Next state.
  const stT = steps.find((s) => s.i === iT) ?? steps[steps.length - 1]!;
  const exitX = cellX(stT.c);
  let bandLo = 0, bandHi = 0;
  for (let c = 0; c < NC; c++) if (Math.abs(cellX(c) - exitX) <= VALIDATOR.exitBand + 1e-9) { if (c < 32) bandLo |= 1 << c; else bandHi |= 1 << (c - 32); }
  const exitSet = planesAt(r, iT, F, bandLo | 0, bandHi & HI_MASK, B);
  const lastMove = [...acts].reverse().find((a) => a.kind === 'move');
  const histSec = Math.max(VALIDATOR.historyMinSec, rMinAt(inp.t1), lastMove ? T_SHIFT(lastMove.dx) : 0);
  const jH = Math.max(j0, Math.min(jT, Math.floor((inp.t1 - histSec) / SLICE)));
  const hist = planesAt(r, jH - j0, F);
  let lastDir: -1 | 0 | 1 = 0;
  for (let k = steps.length - 1; k > 0; k--) {
    if (steps[k]!.i > iT) continue;
    const dc = steps[k]!.c - steps[k - 1]!.c;
    if (dc) { lastDir = dc > 0 ? 1 : -1; break; }
    if (!steps[k - 1]!.air && nG(r.j0 + steps[k - 1]!.i) === 1) break;
  }
  const start = stT.air ? { c: stT.c, h: r.classes[stT.h]!, k: stT.k } : { c: stT.c, h: null, k: 0 };
  return {
    ok: true, line, actions, exitX,
    next: { jH, hist, jE: jT, exitSet, start, lastDir, phase: st.phase },
    stats: { decisionMin, windowMin, deadEndMax: de.slices * SLICE, actions: acts.length },
  };
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Merge consecutive vertices that are collinear in (t, x) (a ramp drawn one cell at a time is one segment). */
function compress(line: SafeLine): void {
  const p = line.pts;
  if (p.length < 3) return;
  const out = [p[0]!];
  for (let k = 1; k < p.length - 1; k++) {
    const a = out[out.length - 1]!, b = p[k]!, c = p[k + 1]!;
    const s1 = (b.x - a.x) / Math.max(1e-9, b.t - a.t), s2 = (c.x - b.x) / Math.max(1e-9, c.t - b.t);
    const flat1 = Math.abs(b.x - a.x) < 1e-9, flat2 = Math.abs(c.x - b.x) < 1e-9;
    if ((flat1 && flat2) || (!flat1 && !flat2 && Math.sign(s1) === Math.sign(s2))) continue;
    out.push(b);
  }
  out.push(p[p.length - 1]!);
  p.length = 0;
  for (const q of out) p.push(q);
}

export { sAt };
