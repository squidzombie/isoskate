// world/gen/templates/shared.ts: the 9 shared templates (DESIGN §10.4, all v1), re-skinned per area by their props.
//   S_OPEN       T0     3–5 s  breather: a free wave string, or an optional flat bar off the line
//   S_CONES      T1     2.5 s  a weaving line of knockable cones (A-frames in Neon); coins between them
//   S_TRENCH     T1–T3  2.0 s  full-width trench (gap 0.25 / 0.30 / 0.33 s·v) with the area's plank(s)
//   S_BARRIER    T1–T2  1.8 s  full-width barrier_low (holo gate in Neon); T2 may open a 2 m slot
//   S_LADDER     T2     3.0 s  3 flat bars 2.5 m apart laterally, overlapping 0.3 s: rail-to-rail transfers
//   S_GATE       T2–T4  1.5 s  a row of tall area blockers with 1–2 openings ≥ 3 m from the last wander's x (A2)
//   S_PADS       T1     3.0 s  2–3 manual pads (bumps) in a lane; coins on top
//   S_STAIRS     T1–T3  2.5 s  T1: a 3-stair side set; T2/T3: a 5 / 7-stair full-width terrace with a handrail
//   S_INCLINE_UP T0     ≥1 s   1:10 incline paying a datum drop back
import { clamp, round1cm } from '../../../core/math';
import { HEIGHT, T_SHIFT, sAt, speedAt, tAt } from '../../../core/tuning';
import { ObTag } from '../../../core/world';
import { GEN, type Tier } from '../gen.config';
import type { PropCtx } from '../props/common';
import type { Obstacle } from '../../../core/world';
import { buildBarrier, buildBench, buildCone, buildFiller, buildFlatbar, buildHandrail, buildIncline, buildPad, buildSideSet,
  buildTerrace, buildTrench, fillerKinds, stairDrop, STAIR } from '../props/shared';
import { LIP } from '../props/street';
import type { Template, TemplateCtx, TemplateOut } from './types';
import { actFrom, contentFrom, edgeCoins, endAfter, put, roadHalf, side, sOf } from './util';

export const S_OPEN: Template = {
  id: 'S_OPEN', area: 'shared', tiers: [0], durMax: 5, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    const dur = c.dur ?? c.rng.range(GEN.open.dur[0], GEN.open.dur[1]);
    const t1 = Math.min(c.t0 + dur, c.maxT1);
    const x = c.safeX;
    if (c.dur === undefined && t1 - c.t0 >= 2.8 && c.rng.chance(GEN.open.flatbar)) {
      // Optional flat bar (trick line) 1.8–2.6 m off the line, on the road.
      const rh = roadHalf(c) - 0.4;
      let bx = x + side(c) * c.rng.range(1.8, 2.6);
      if (Math.abs(bx) > rh) bx = x - Math.sign(bx - x) * Math.abs(bx - x);
      if (Math.abs(bx) <= rh) {
        const tA = c.t0 + 0.7;
        const lenSec = Math.min(c.rng.range(0.7, 1.4), t1 - tA - 0.9);
        const len = clamp(c.v * lenSec, 3, 16);
        const bar = put(c, buildFlatbar(sOf(tA), round1cm(bx), len, round1cm(c.rng.range(0.35, 0.45)), c.props));
        edgeCoins(c, bar);
        return { t1, t0Stretch: true };
      }
    }
    // Short fillers stay empty (A5: ≤ 10 % of coins on the safe line outside breathers).
    if (t1 - c.t0 >= 1.6) c.coins.wave(c.t0 + 0.3, t1 - 0.3, x, GEN.coins.breatherAmp, c.coinRng.range(0, 6.28), c.datum + GEN.coins.groundY);
    return { t1, t0Stretch: true };
  },
};

export const S_CONES: Template = {
  id: 'S_CONES', area: 'shared', tiers: [1], durMax: 3.0, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    const n = c.rng.int(5, 7), tA = contentFrom(c) + 0.2, gap = 0.3;
    const amp = c.rng.range(0.9, 1.4), x0 = clamp(c.safeX + side(c) * c.rng.range(0.5, 1.5), -2.2, 2.2), ph = c.rng.range(0, 3);
    for (let k = 0; k < n; k++) {
      const t = tA + k * gap, x = round1cm(clamp(x0 + amp * Math.sin(ph + k * 1.4), -2.6, 2.6));
      put(c, buildCone(sOf(t), x, c.props));
      if (k > 0) c.coins.add(sAt(t - gap / 2), (x + clamp(x0 + amp * Math.sin(ph + (k - 1) * 1.4), -2.6, 2.6)) / 2, c.datum + GEN.coins.groundY, 'trick');
    }
    return { t1: endAfter(c, 0.6) };
  },
};

/** Street bands for a trench's pits (the Docks lip stays a body: no pit under it). */
const pitBands = (c: TemplateCtx) => c.layout.bands.map((b) => ({ x0: b.x0, x1: c.layout.lip ? Math.min(b.x1, LIP.x0) : b.x1, dy: b.dy }))
  .filter((b) => b.x1 > b.x0);

export const S_TRENCH: Template = {
  id: 'S_TRENCH', area: 'shared', tiers: [1, 2, 3], durMax: 2.6, mirror: true, fullWidth: true,
  build(c: TemplateCtx): TemplateOut {
    const x = c.safeX, v = c.v;
    const tier = Math.min(3, Math.max(1, c.tier)) as 1 | 2 | 3;
    const len = round1cm(clamp(v * GEN.trench.gapSec[tier], 1.8, Math.min(3.7, HEIGHT.pitMaxSec * v - 0.05)));
    const off = c.rng.range(GEN.trench.plankOff[tier][0], GEN.trench.plankOff[tier][1]);
    let dir = side(c);
    const lim = c.layout.lip ? 2.6 : 2.4;
    if (Math.abs(x + dir * off) > lim) dir = -dir as 1 | -1;
    const plankX = round1cm(clamp(x + dir * off, -lim, lim));
    const tA = actFrom(c) + T_SHIFT(off) + 0.15 + c.rng.range(0, 0.3);
    const s = sOf(tA);
    const planks = c.area === 'docks' ? [plankX, round1cm(clamp(plankX - dir * 2.2, -lim, lim))] : [plankX];
    put(c, buildTrench(s, len, planks, v, c.props, GEN.trench.depth, pitBands(c)));
    c.cuts.push([s, s + len]);
    // Trick line: flip across, away from the plank.
    const tx = clamp(plankX + (plankX >= 0 ? -2.2 : 2.2), -2.6, 2.6);
    c.coins.arc(tAt(s + len / 2) - 0.3, tx, c.datum);
    return { t1: tAt(s + len) + 0.55, fullWidth: true };
  },
};

export const S_BARRIER: Template = {
  id: 'S_BARRIER', area: 'shared', tiers: [1, 2], durMax: 2.2, mirror: true, fullWidth: true,
  build(c: TemplateCtx): TemplateOut {
    const tTake = actFrom(c) + 0.15 + c.rng.range(0, 0.3);
    const s = sAt(tTake + 0.3) - 0.3;                     // the barrier's middle under the apex
    const hgt = c.tier <= 1 ? round1cm(c.rng.range(0.35, 0.45)) : round1cm(c.rng.range(0.42, 0.5));
    let slot: { x: number; w: number } | undefined;
    if (c.tier >= 2 && c.rng.chance(0.4)) {
      let sx = round1cm(c.rng.range(-2.4, 2.4));
      if (Math.abs(sx - c.safeX) < 1.5) sx = round1cm(clamp(c.safeX + (sx >= c.safeX ? 1.5 : -1.5), -2.4, 2.4));
      if (Math.abs(sx - c.safeX) >= 1.5) slot = { x: sx, w: 2.0 };
    }
    put(c, buildBarrier(round1cm(s), hgt, speedAt(tTake), c.props, slot));
    return { t1: tTake + 0.6 + GEN.noActionTail + 0.25, fullWidth: true };
  },
};

export const S_LADDER: Template = {
  id: 'S_LADDER', area: 'shared', tiers: [2], durMax: 3.4, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    const dir = side(c);
    const xs = [-2.5, 0, 2.5].map((x) => x * dir);
    const tA = contentFrom(c) + 0.4, barSec = c.rng.range(0.95, 1.15);
    let prev = -1;
    for (let k = 0; k < 3; k++) {
      const t = tA + k * (barSec - 0.3);
      const bar = put(c, buildFlatbar(sOf(t), round1cm(xs[k]!), Math.max(3, c.v * barSec), round1cm(c.rng.range(0.38, 0.45)), c.props));
      if (prev >= 0) bar.gap = { name: 'Ladder Transfer', pts: 250, fromObstacle: prev };
      prev = bar.id;
      edgeCoins(c, bar);
    }
    return { t1: endAfter(c, 0.65) };
  },
};

/** Gate openings (A2 + straight-bot rule): centres within ±maxC, ≥ 3 m (≤ 4.4 m) from the line's x, ≥ `apart` from the
 *  last row's openings (a straight lane passes at most one of two rows); an optional second opening. Relaxed in
 *  steps when nothing fits. */
export function gateOpenings(rng: TemplateCtx['rng'], x0: number, lastGateX: readonly number[], tier: Tier,
  keepOut: readonly (readonly [number, number])[] = []): number[] | null {
  const w = GEN.gate.width[tier];
  const clear = (x: number) => !keepOut.some(([a, b]) => x + w / 2 > a && x - w / 2 < b);
  const far = (x: number) => !lastGateX.some((o) => Math.abs(x - o) < GEN.gate.apart) && clear(x);
  const cand: number[] = [];
  const scan = (ok: (x: number) => boolean) => { if (!cand.length) for (let i = 0; i <= 66; i++) { const x = round1cm(-GEN.gate.maxC + i * 0.1); if (ok(x)) cand.push(x); } };
  // Prefer a real move (A2) the myopic player can still make, then no move at all (the line already left the last
  // openings), then anything apart from the last openings (the straight-bot guarantee needs only that).
  scan((x) => { const d = Math.abs(x - x0); return d >= GEN.gate.shift[0] && d <= GEN.gate.shift[1] && far(x); });
  scan((x) => far(x) && Math.abs(x - x0) <= 1.0);
  scan((x) => far(x) && Math.abs(x - x0) <= GEN.gate.shift[1]);
  scan((x) => far(x));
  scan((x) => Math.abs(x - x0) >= GEN.gate.shift[0] && clear(x));
  if (!cand.length) return null;
  const pick = cand[rng.int(0, cand.length - 1)]!;
  const centres = [pick];
  if (rng.chance(GEN.gate.second[tier] ?? 0)) {
    const c2 = round1cm(pick - Math.sign(pick - x0 || 1) * rng.range(GEN.gate.secondOff[0], GEN.gate.secondOff[1]));
    // Keep room for the next row: ≥ 1 m of opening centres ≥ `apart` from both openings.
    let room = 0;
    for (let k = 0; k <= 66; k++) { const x = -GEN.gate.maxC + k * 0.1; if (Math.abs(x - pick) >= GEN.gate.apart && Math.abs(x - c2) >= GEN.gate.apart) room += 0.1; }
    if (Math.abs(c2) <= GEN.gate.maxC && far(c2) && Math.abs(c2 - x0) >= GEN.gate.shift[0] && room >= 1.0) centres.push(c2);
  }
  return centres;
}

/** A row of the area's tall blockers across the corridor at sRow, except the openings (width w): blockers 0.1 m apart
 *  (inset gaps ≤ 0.26 m < the 0.40 m hitbox), so no lane passes the row outside an opening. */
export function gateRow(sRow: number, centres: readonly number[], w: number, props: PropCtx, rng: TemplateCtx['rng'],
  keepOut: readonly (readonly [number, number])[] = []): Obstacle[] {
  const out: Obstacle[] = [];
  // Openings, plus the lateral spans of obstacles the row passes beside (they are part of the wall there).
  const open = [...centres.map((x) => [x - w / 2, x + w / 2] as [number, number]), ...keepOut.map(([a, b]) => [a - 0.3, b + 0.3] as [number, number])]
    .sort((a, b) => a[0] - b[0]);
  const kinds = fillerKinds(props.area);
  const wide = props.area === 'suburbs' ? rng.chance(0.6) : props.area === 'docks' ? rng.chance(0.5) : false;
  let a = -4.5;
  const runs: [number, number][] = [];
  for (const [o0, o1] of open) { if (o0 > a) runs.push([a, o0]); a = Math.max(a, o1); }
  if (a < 4.5) runs.push([a, 4.5]);
  let i = 0;
  for (const [r0, r1] of runs) {
    const L = r1 - r0;
    if (L < 0.25) continue;
    const useWide = wide && L >= kinds[1]!.wid;
    const bw = kinds[useWide ? 1 : 0]!.wid, pitch = bw + 0.1;
    const n = Math.max(1, Math.ceil((L - bw) / pitch) + 1);
    const step = n > 1 ? (L - bw) / (n - 1) : 0;
    for (let k = 0; k < n; k++) out.push(buildFiller(sRow, round1cm(n > 1 ? r0 + bw / 2 + k * step : (r0 + r1) / 2), useWide, props, i++ % 3));
  }
  return out;
}

export const S_GATE: Template = {
  id: 'S_GATE', area: 'shared', tiers: [2, 3, 4], durMax: 2.9, mirror: true, wander: true,
  build(c: TemplateCtx): TemplateOut | null {
    const w = GEN.gate.width[c.tier];
    const centres = gateOpenings(c.rng, c.safeX, c.lastGateX, c.tier);
    if (!centres) return null;
    const pick = centres[0]!;
    const tRow = Math.max(actFrom(c) + T_SHIFT(Math.abs(pick - c.safeX)) + 0.3, c.t0 + 1.7) + c.rng.range(0, 0.15);
    const sRow = sOf(tRow);
    // The approach carries a trick line beyond the opening (away from the entry, off the move path): a bench or a
    // flat bar ending ≥ 1 s before the row (its exit zone stays clear of the blockers), coins along it.
    const fA = contentFrom(c) + 0.2, fB = tRow - GEN.gate.featureGap;
    if (fB - fA >= 0.45 && c.rng.chance(GEN.gate.feature)) {
      const dir = Math.sign(pick - c.safeX) || 1;
      const fx = round1cm(clamp(pick + dir * c.rng.range(1.3, 1.7), -3.3, 3.3));
      if (Math.abs(fx - c.safeX) >= 1.2) {
        const len = clamp(sAt(fB) - sAt(fA), 2.0, 5.0);
        const f = c.rng.chance(0.5) || len < 3 ? buildBench(sOf(fB) - 2.0, fx, c.props) : buildFlatbar(round1cm(sAt(fB) - len), fx, round1cm(len), 0.35, c.props);
        put(c, f);
        c.coins.string(f.s + 0.2, f.s + f.len - 0.2, fx, f.solids[0]!.box.y1 + GEN.coins.edgeUp, c.v);
      }
    }
    for (const ob of gateRow(sRow, centres, w, c.props, c.rng)) put(c, ob);
    const tr = tAt(sRow);
    return { t1: tAt(sRow + 1.2) + 0.5, gateX: centres, gateT: tr, guides: [{ t0: tr - 0.45, t1: tr + 0.15, x0: pick - 0.25, x1: pick + 0.25 }] };
  },
};

export const S_PADS: Template = {
  id: 'S_PADS', area: 'shared', tiers: [1], durMax: 3.4, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    const n = c.rng.int(2, 3), rh = roadHalf(c) - 0.9;
    const x = round1cm(clamp(c.safeX + side(c) * c.rng.range(0.8, 2.0), -rh, rh));
    let t = contentFrom(c) + 0.3;
    for (let k = 0; k < n; k++) {
      const len = clamp(c.v * c.rng.range(0.45, 0.6), 3, 6);
      const pad = put(c, buildPad(sOf(t), x, len, c.props));
      c.coins.string(pad.s + 0.4, pad.s + pad.len - 0.4, x, c.datum + 0.15 + GEN.coins.padUp, c.v);
      t = tAt(pad.s + pad.len) + c.rng.range(0.25, 0.4);
    }
    return { t1: endAfter(c, 0.6) };
  },
};

export const S_STAIRS: Template = {
  id: 'S_STAIRS', area: 'shared', tiers: [1, 2, 3], durMax: 3.0, mirror: true,
  build(c: TemplateCtx): TemplateOut | null {
    const v = c.v;
    if (c.tier <= 1) {
      // A 3-stair side set: a 0.51 m platform (pop up onto it) on one side, its stairs back down to the street.
      const sd = side(c);
      const x0 = sd > 0 ? 1.8 : -4.5, x1 = sd > 0 ? 4.5 : -1.8;
      if (Math.abs(c.safeX) > 1.5 && Math.sign(c.safeX) === sd && c.attempt < 2) return null;
      const tA = contentFrom(c) + 0.4;
      const plat = clamp(v * c.rng.range(0.6, 0.9), 4, 9);
      const set = put(c, buildSideSet(sOf(tA), plat, x0, x1, c.props));
      c.coins.string(set.s + 0.6, set.s + plat - 0.4, (x0 + x1) / 2, c.datum + stairDrop(3) + GEN.coins.padUp, v);
      return { t1: endAfter(c, 0.7) };
    }
    if (c.datum - stairDrop(7) < GEN.datum.min - 1e-6 || c.area === 'docks') return null;
    const n = c.tier >= 3 && c.datum - stairDrop(7) >= GEN.datum.min ? 7 : 5;
    const tA = contentFrom(c) + 0.5 + c.rng.range(0, 0.3);
    const s = sOf(tA);
    const ter = put(c, buildTerrace(s, n, c.props));
    const len = n * STAIR.tread, drop = stairDrop(n);
    c.cuts.push([s, s + len]);
    c.datumAt.push({ s: s + len, datum: round1cm(c.datum - drop) });
    const rx = round1cm(side(c) * c.rng.range(0.8, 2.4));
    const rail = put(c, buildHandrail(s, len, rx, c.datum, drop, c.props));
    c.coins.edge(rail.edges[1]!, 0.05, 0.05);
    if (c.tier >= 3) c.coins.gold(s + len, rx, c.datum - drop + 1.2);
    void ter;
    return { t1: tAt(s + len + 0.5) + 0.6 };
  },
};

export const S_INCLINE_UP: Template = {
  id: 'S_INCLINE_UP', area: 'shared', tiers: [0], durMax: 3.0, mirror: false,
  build(c: TemplateCtx): TemplateOut | null {
    const rise = round1cm(-c.datum);
    if (rise <= 0) return null;
    const tA = c.t0 + 0.3;
    const len = round1cm(Math.max(rise / GEN.datum.slope, c.v * 1.0));
    const s = sOf(tA);
    put(c, buildIncline(s, len, rise, c.props));
    c.cuts.push([s, s + len]);
    c.datumAt.push({ s: s + len, datum: 0 });
    // Wave up the slope (free coins, few: A5 keeps ≥ 75 % on trick lines).
    for (let k = 0; k < 3; k++) {
      const u = (k + 0.5) / 3;
      c.coins.add(s + u * len, round1cm(c.safeX + 1.2 * Math.sin(k * 0.9)), c.datum + rise * u + GEN.coins.groundY, 'breather');
    }
    return { t1: Math.min(c.maxT1, tAt(s + len) + 0.5), t0Stretch: true };
  },
};

export { buildBench };
