// world/gen/antistraight.ts: the anti-"just go straight" bookkeeping (DESIGN §10.7) on the non-T0 A-clock.
//  - A1 column rule: 18 lateral columns of 0.5 m. A tall solid COVERS a column when a board centred anywhere in the
//    column's reachable part (|x| ≤ 4.3, and left of the Docks lip) overlaps its inset box: tapping ollie cannot save a
//    straight line there. lastTall[k] is the A-time of the last cover; it must recur within the phase period.
//  - Column fillers: overdue columns get an area filler blocker outside the committed safe line (then the segment is
//    validated again, DESIGN §10.5).
//  - A2 wander rule: the safe line's lateral range since the last wander reaches 3 m at least once per period.
import type { AreaId } from '../../core/ids';
import { round1cm } from '../../core/math';
import { HITBOX, TARGET_X_MAX, sAt, tAt } from '../../core/tuning';
import type { Obstacle, Solid } from '../../core/world';
import { GEN, type PhaseId } from './gen.config';
import { insetOf } from './validator/path';
import { buildFiller, fillerKinds } from './props/shared';
import type { PropCtx } from './props/common';
import { LIP } from './props/street';
import type { SafeLine } from './safe';
import { EXIT_ZONE_SEC } from './props/street';

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

export const A1_DEBUG = { last: '', why: '' };
export interface FillerPlan { t: number; x: number; wide: boolean; cols: number[] }

/** Plan fillers for the columns due before aDue(k) (A-time) within [tMin, tMax] (run time), away from the line, other
 *  bodies, grind sweeps, pits, slopes and decks; at most one filler in the line's way (the line then re-plans around
 *  it). `tOfA` maps an A-time back to run time. Serves what it can: the caller re-plans with the new line. */
export function planFillers(due: readonly { k: number; aDue: number; optional?: boolean }[], line: SafeLine, obs: readonly Obstacle[], area: AreaId,
  tMin: number, tMax: number, tOfA: (a: number) => number, p: PropCtx, shiftTry: number, tBlockFrom = Infinity): FillerPlan[] {
  const plans: FillerPlan[] = [];
  const kinds = fillerKinds(area);
  const left = new Map(due.map((d) => [d.k, d]));
  const placed: { s0: number; s1: number; x0: number; x1: number }[] = [];
  let blocking = 0;
  while (left.size) {
    // The most urgent column first; widen to its due neighbours when the wide kind covers them.
    const first = [...left.values()].sort((a, b) => a.aDue - b.aDue || a.k - b.k)[0]!;
    let done = false;
    // Pass 0: outside the line; pass 1: in the line's way (the line re-plans around it), at most once per segment
    // and never for an optional (early) column.
    for (let pass = 0; pass < 1 && !done; pass++) {
      for (const wide of [true, false]) {
        const f = kinds[wide ? 1 : 0]!;
        const base = colX0(first.k) + GEN.a1.colW / 2;
        for (const dx of [0, 0.25, -0.25, 0.5, -0.5]) {
          const x = round1cm(base + dx);
          if (Math.abs(x) > 4.5 - f.wid / 2 + 0.3) continue;
          const so: Solid = { box: { s0: 0, s1: 1, x0: x - f.wid / 2, x1: x + f.wid / 2, y0: 0, y1: 2 }, top: 'crash', tall: true };
          if (!covers(so, first.k, area)) continue;
          const cols = [...left.keys()].filter((k) => covers(so, k, area));
          const tDue = Math.min(...cols.map((k) => tOfA(left.get(k)!.aDue)), tMax);
          const hi = Math.max(Math.min(tMax, tDue) - shiftTry * 0.35, tMin), lo = pass === 1 ? Math.max(tMin, tBlockFrom) : tMin;
          for (let t = hi; t >= lo - 1e-9; t -= 0.15) {
            const s = sAt(t);
            if (!clearAt(s, x, f.len, f.wid, pass === 0 ? line : null, obs, placed)) continue;
            plans.push({ t, x, wide, cols });
            placed.push({ s0: s, s1: s + f.len, x0: x - f.wid / 2, x1: x + f.wid / 2 });
            for (const k of cols) left.delete(k);
            if (pass === 1) blocking++;
            done = true;
            break;
          }
          if (done) break;
        }
        if (done) break;
      }
    }
    if (!done) {
      if (!first.optional) A1_DEBUG.last = `col ${first.k} due ${tOfA(first.aDue).toFixed(2)} t∈[${tMin.toFixed(2)}, ${tMax.toFixed(2)}] why ${A1_DEBUG.why}`;
      left.delete(first.k);
    }
  }
  void p;
  return plans;
}

/** Is a filler footprint [s, s + len) × [x ± wid/2] clear of the line (with the follow tube), bodies, sweeps, pits,
 *  slopes and decks? */
function clearAt(s: number, x: number, len: number, wid: number, line: SafeLine | null, obs: readonly Obstacle[],
  placed: readonly { s0: number; s1: number; x0: number; x1: number }[]): boolean {
  const half = wid / 2, cl = GEN.a1.clearLine, cb = GEN.a1.clearBody;
  const t0 = tAt(s) - 0.45, t1 = tAt(s + len) + 0.35;
  if (line) for (let t = t0; t <= t1; t += 0.05) if (Math.abs(line.xAt(t) - x) < half + HITBOX.w / 2 + 0.1 + cl) { A1_DEBUG.why = 'line'; return false; }
  const x0 = x - half - cb, x1 = x + half + cb, s0 = s - cb - 0.5, s1 = s + len + cb + 0.5;
  for (const q of placed) if (q.s1 > s0 && q.s0 < s1 && q.x1 > x0 && q.x0 < x1) { A1_DEBUG.why = 'placed'; return false; }
  for (const ob of obs) {
    if (ob.s > s1 + 30 || ob.s + ob.len < s0 - 30) continue;
    for (const so of ob.solids) if (so.box.s1 > s0 && so.box.s0 < s1 && so.box.x1 > x0 && so.box.x0 < x1) { A1_DEBUG.why = `solid ${ob.kind}`; return false; }
    for (const pt of ob.pits) if (pt.s1 > s0 - 2 && pt.s0 < s1 + 2 && pt.x1 > x0 && pt.x0 < x1) return false;
    for (const sl of ob.slabs) {
      if (sl.s1 <= s0 || sl.s0 >= s1 || sl.x1 <= x0 || sl.x0 >= x1) continue;
      if (sl.kind !== 'flat' || sl.layer === 1) { A1_DEBUG.why = `slab ${ob.kind}`; return false; }
    }
    if (ob.kind === 'curb' || ob.kind === 'dock_lip') continue;        // base edges are rebuilt around the fillers
    for (const e of ob.edges) {
      const zone = EXIT_ZONE_SEC * 10.5;
      // Grind sweep (hitbox along the edge) and exit zone (±1.5 m around its end).
      if (s1 > e.a.s - 1 && s0 < e.b.s + 0.5 && Math.min(Math.abs(e.a.x - x), Math.abs(e.b.x - x)) < half + HITBOX.w / 2 + 0.4) return false;
      if (s1 > e.b.s && s0 < e.b.s + zone && Math.abs(e.b.x - x) < half + 1.6) return false;
    }
  }
  return true;
}

/** Fillers as obstacles (Filler tag; area kit; one per plan). */
export function buildFillers(plans: readonly FillerPlan[], p: PropCtx): Obstacle[] {
  return plans.map((f, i) => buildFiller(round1cm(sAt(f.t)), f.x, f.wide, p, i % 3));
}

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
