// world/gen/templates/shared.ts: the shared M0 templates (DESIGN §10.4), skinned per area later by WG.
//   S_OPEN    T0  3–5 s   breather: wave coins, or an optional flat bar off the safe line
//   S_BARRIER T1–T2 1.8 s  full-width barrier_low (T2: optional 2 m slot); safe line ollies it
//   S_TRENCH  T1–T3 2.0 s  full-width trench (gap 0.25 / 0.30 / 0.35 s·v) with a 1.2 m plank; safe line steers onto it
//   S_GATE    T2–T4 1.5 s  row of tall blockers with 1–2 openings of 2.5 / 2.2 / 2.0 m, ≥ 3 m from the previous safe x
import { clamp, round1cm } from '../../../core/math';
import { sAt, speedAt, tAt } from '../../../core/tuning';
import { GEN, type Tier } from '../gen.config';
import { groundUnder } from '../props/common';
import { buildBarrier, buildBlocker, buildFlatbar, buildTrench } from '../props/shared';
import { MOVE_MIN } from '../safe';
import type { Template, TemplateCtx, TemplateOut } from './types';

/** Ground height of a line position on the M0 street (road 0, sidewalk 0.15). */
export const lineGround = (x: number): number => groundUnder(x, x).lo;

/** Earliest start of an ollie / a move in this template (head rule + spacing). */
export const ollieStart = (c: TemplateCtx): number => Math.max(c.t0 + GEN.noActionHead, c.earliest);
export const moveStart = (c: TemplateCtx): number => Math.max(c.t0 + 0.1, c.earliest);

export const S_OPEN: Template = {
  id: 'S_OPEN', tiers: [0],
  build(c: TemplateCtx): TemplateOut {
    const dur = c.dur ?? c.rng.range(GEN.open.dur[0], GEN.open.dur[1]);
    const t1 = Math.min(c.t0 + dur, c.maxT1);
    const x = c.line.x, v = c.v;
    if (c.dur === undefined && t1 - c.t0 >= 2.8 && c.rng.chance(GEN.openFlatbar)) {
      // Optional flat bar (trick line), ≥ 1.8 m off the safe line on the road.
      let bx = x + (c.rng.chance(0.5) ? 1 : -1) * c.rng.range(1.8, 2.6);
      if (Math.abs(bx) > 2.6) bx = x - Math.sign(bx - x) * Math.abs(bx - x);
      if (Math.abs(bx) <= 2.6) {
        const tA = c.t0 + 0.6;
        const lenSec = Math.min(c.rng.range(0.6, 1.5), t1 - tA - 0.8);
        const len = clamp(v * lenSec, 3, 16);
        const hgt = round1cm(c.rng.range(0.35, 0.45));
        const s = sAt(tA);
        if (tAt(s + len) <= t1 - 0.7) {
          c.obstacles.push(buildFlatbar(s, bx, len, hgt, c.props));
          c.coins.edge(s + 0.4, s + len - 0.3, round1cm(bx), hgt, v);
          return { t1 };
        }
      }
    }
    c.coins.wave(c.t0 + 0.2, t1 - 0.2, x, GEN.coins.breatherAmp, c.coinRng.range(0, 6.28));
    return { t1 };
  },
};

export const S_BARRIER: Template = {
  id: 'S_BARRIER', tiers: [1, 2],
  build(c: TemplateCtx): TemplateOut {
    const tTake = ollieStart(c) + c.rng.range(0, 0.25);
    // Centre over the barrier's middle at the apex (0.3 s after take-off): the middle of the ollie window.
    const s = sAt(tTake + 0.3) - 0.3;
    const v = speedAt(tTake);
    const hgt = c.tier <= 1 ? round1cm(c.rng.range(0.35, 0.45)) : 0.5;
    let slot: { x: number; w: number } | undefined;
    if (c.tier >= 2 && c.rng.chance(0.35)) {
      let sx = round1cm(c.rng.range(-2.4, 2.4));
      if (Math.abs(sx - c.line.x) < 1.5) sx = round1cm(clamp(c.line.x + (sx >= c.line.x ? 1.5 : -1.5), -2.4, 2.4));
      if (Math.abs(sx - c.line.x) >= 1.5) slot = { x: sx, w: 2.0 };
    }
    c.obstacles.push(buildBarrier(s, hgt, v, c.props, slot));
    c.line.ollie(tTake);
    c.coins.arc(tTake, c.line.x, lineGround(c.line.x));
    return { t1: tTake + 0.6 + GEN.noActionTail + 0.2, fullWidth: true };
  },
};

const TRENCH_GAP_SEC: Record<Tier, number> = { 0: 0.25, 1: 0.25, 2: 0.30, 3: 0.35, 4: 0.35 };
const PLANK_OFF: Record<Tier, readonly [number, number]> = { 0: [0, 1], 1: [0, 1], 2: [1, 2], 3: [2, 3], 4: [2, 3] };

export const S_TRENCH: Template = {
  id: 'S_TRENCH', tiers: [1, 2, 3],
  build(c: TemplateCtx): TemplateOut {
    const x = c.line.x, v = c.v;
    const len = round1cm(clamp(v * TRENCH_GAP_SEC[c.tier], 1.8, Math.min(3.7, 0.35 * v)));
    const off = c.rng.range(PLANK_OFF[c.tier][0], PLANK_OFF[c.tier][1]);
    let dir = c.rng.chance(0.5) ? 1 : -1;
    if (Math.abs(x + dir * off) > 2.4) dir = -dir;
    const plankX = round1cm(clamp(x + dir * off, -2.4, 2.4));
    const dx = plankX - x;
    const start = Math.abs(dx) >= MOVE_MIN ? moveStart(c) : c.t0 + 0.1;
    const arrive = c.line.moveTo(plankX, start);
    const s = round1cm(sAt(arrive + GEN.arriveMargin + c.rng.range(0, 0.3)));
    c.obstacles.push(buildTrench(s, len, plankX, v, c.props));
    c.cuts.push([s, s + len]);
    // Trick line: flip across, away from the plank.
    const tx = clamp(plankX + (plankX >= 0 ? -2.2 : 2.2), -2.8, 2.8);
    c.coins.arc(tAt(s + len / 2) - 0.3, tx, 0);
    return { t1: tAt(s + len) + 0.5 + GEN.noActionTail, fullWidth: true };
  },
};

const GATE_W: Record<Tier, number> = { 0: 2.5, 1: 2.5, 2: 2.5, 3: 2.2, 4: 2.0 };
export const GATE_REACH = 4.6, GATE_MAX_C = 3.2, GATE_APART = 2.4;

/** Width (m) of opening centres the next gate could still use, given this gate's openings (≥ GATE_APART away). */
export function nextGateRoom(centres: readonly number[]): number {
  let n = 0;
  for (let i = 0; i <= 64; i++) { const x = -GATE_MAX_C + i * 0.1; if (!centres.some((o) => Math.abs(x - o) < GATE_APART)) n++; }
  return n * 0.1;
}

export const S_GATE: Template = {
  id: 'S_GATE', tiers: [2, 3, 4],
  build(c: TemplateCtx): TemplateOut {
    const x0 = c.line.x;
    const w = GATE_W[c.tier];
    // Opening ≥ 3 m (≤ 3.6 m, for decision time) from the previous safe x, inside ±3.2, and ≥ GATE_APART from the
    // last gate's opening: a straight lane can pass at most one of two consecutive gates (A1/A2 stand-in).
    // Search a 0.1 m grid: prefer |cx − x0| ∈ [3.0, 3.6] (rng tie-break), never closer than GATE_APART to the last
    // gate's openings; if nothing is that far, fall back to the best shift alone.
    const want0 = 3.0, want1 = 3.6, jitter = c.rng.range(0, 1);
    let cx = NaN, best = Infinity, cxAny = NaN, bestAny = Infinity;
    for (let i = 0; i <= 64; i++) {
      const x = -GATE_MAX_C + i * 0.1;
      const d = Math.abs(x - x0);
      const miss = d < want0 ? want0 - d : d > want1 ? d - want1 : 0;
      const score = miss + 0.05 * Math.abs(((i * 0.6180339887 + jitter) % 1) - 0.5);
      if (score < bestAny) { bestAny = score; cxAny = x; }
      if (c.lastGateX.some((o) => Math.abs(x - o) < GATE_APART)) continue;
      if (score < best) { best = score; cx = x; }
    }
    if (Number.isNaN(cx) || best > 2.0) cx = cxAny;
    const dir = cx >= x0 ? 1 : -1;
    cx = round1cm(cx);
    const arrive = c.line.moveTo(cx, moveStart(c));
    const sRow = round1cm(sAt(arrive + GEN.arriveMargin) + 0.35);
    const open: [number, number][] = [[cx - w / 2, cx + w / 2]];
    const centres = [cx];
    if (c.tier === 2 && c.rng.chance(0.4)) {
      const c2 = round1cm(cx - dir * c.rng.range(3.5, 5.0));
      if (Math.abs(c2) <= GATE_MAX_C && !c.lastGateX.some((o) => Math.abs(c2 - o) < GATE_APART) && nextGateRoom([cx, c2]) >= 0.6) {
        open.push([c2 - 1.25, c2 + 1.25]);
        centres.push(c2);
      }
    }
    open.sort((a, b) => a[0] - b[0]);
    const kind = c.rng.chance(0.3) ? 'news_box' : 'trash_can';
    const bw = kind === 'trash_can' ? 0.6 : 0.5, pitch = bw + 0.1;
    let a = -GATE_REACH;
    const runs: [number, number][] = [];
    for (const [o0, o1] of open) { runs.push([a, o0]); a = o1; }
    runs.push([a, GATE_REACH]);
    for (const [r0, r1] of runs) {
      const L = r1 - r0;
      if (L < 0.3) continue;
      const n = Math.max(1, Math.ceil((L - bw) / pitch) + 1);
      const step = n > 1 ? (L - bw) / (n - 1) : 0;
      for (let i = 0; i < n; i++) {
        const bx = n > 1 ? r0 + bw / 2 + i * step : (r0 + r1) / 2;
        c.obstacles.push(buildBlocker(kind, sRow, round1cm(bx), c.props, i % 3));
      }
    }
    return { t1: tAt(sRow + bw) + 0.5, gate: true, gateX: centres, mirror: dir < 0 };
  },
};
