// world/gen/templates/downtown.ts: the Downtown Plaza v1 templates (DESIGN §10.4).
//   DT_LEDGE    T1     2.5 s  one sidewalk / road-edge granite ledge, 1.2–2 s long          (50-50 / boardslide)
//   DT_BENCHES  T1     2.5 s  3 benches in a row 0.5 s apart, "Bench Hop" gaps             (grind, hop, grind)
//   DT_PLANTERS T2     3.0 s  a 2 × 3 planter grid with tree variants                       (rim grinds, lanes between)
//   DT_TERRACE  T2     3.0 s  full-width 5-stair terrace with a rail and a hubba (datum −0.85)
//   DT_RUSH     T3–T4  3.5 s  both parking lanes full, a double-parked car in the centre    (zig-zag; sidewalk ledge, rail)
//   DT_BIG7     T3     3.0 s  "Amberlane Seven": full-width 7-stair with a long handrail (landmark, datum −1.19)
import { clamp, round1cm } from '../../../core/math';
import { sAt, tAt } from '../../../core/tuning';
import { ObTag } from '../../../core/world';
import { GEN } from '../gen.config';
import { buildLedge, buildParkedCar, buildPlanter } from '../props/downtown';
import { buildBench, buildFlatbar, buildHandrail, buildHubba, buildTerrace, stairDrop, STAIR } from '../props/shared';
import type { Template, TemplateCtx, TemplateOut } from './types';
import { contentFrom, edgeCoins, endAfter, put, side, sOf } from './util';

export const DT_LEDGE: Template = {
  id: 'DT_LEDGE', area: 'downtown', tiers: [1], durMax: 3.2, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    const sd = side(c);
    const walk = c.layout.curbX !== null && c.rng.chance(0.55);
    const lx = round1cm(sd * (walk ? c.rng.range(3.55, 3.8) : c.rng.range(1.9, 2.5)));
    const tA = contentFrom(c) + 0.3;
    const ledge = put(c, buildLedge(sOf(tA), lx, c.v * c.rng.range(1.2, 2.0), c.props));
    c.coins.string(ledge.s + 0.3 * c.v, ledge.s + ledge.len - 0.2 * c.v, lx, ledge.solids[0]!.box.y1 + GEN.coins.edgeUp, c.v);
    return { t1: endAfter(c, 0.7) };
  },
};

export const DT_BENCHES: Template = {
  id: 'DT_BENCHES', area: 'downtown', tiers: [1], durMax: 3.4, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    const sd = side(c);
    const walk = c.layout.curbX !== null && c.rng.chance(0.3);
    const bx = round1cm(sd * (walk ? 3.75 : c.rng.range(1.7, 2.5)));
    const tA = contentFrom(c) + 0.3;
    let prev = -1, sEnd = 0, top = 0;
    const sA = sOf(tA);
    for (let k = 0; k < 3; k++) {
      const b = put(c, buildBench(sOf(tA + 0.5 * k), bx, c.props));
      if (prev >= 0) b.gap = { name: 'Bench Hop', pts: 200, fromObstacle: prev };
      prev = b.id; sEnd = b.s + b.len; top = b.solids[0]!.box.y1;
    }
    c.coins.string(sA + 0.2, sEnd - 0.2, bx, top + GEN.coins.edgeUp, c.v);
    return { t1: endAfter(c, 0.7) };
  },
};

export const DT_PLANTERS: Template = {
  id: 'DT_PLANTERS', area: 'downtown', tiers: [2, 3], durMax: 3.8, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    // Two columns 3.3 m apart (a lane between them and lanes outside), three rows 0.85 s apart.
    const xa = round1cm(clamp(c.rng.range(-2.4, -0.6), -2.4, 2.4)), xb = round1cm(xa + 3.3);
    const tA = contentFrom(c) + 0.5;
    const trick = c.rng.chance(0.5) ? xa : xb;
    for (let r = 0; r < 3; r++) {
      const t = tA + r * 0.85;
      for (const x of [xa, xb]) {
        const tree = x !== trick && c.rng.chance(0.55);
        const p = put(c, buildPlanter(sOf(t), c.X(x), tree, c.props, x === trick ? ObTag.TrickLine : 0));
        if (x === trick) edgeCoins(c, p);
      }
    }
    return { t1: endAfter(c, 0.65) };
  },
};

/** A full-width terrace of n steps at time tA with rails / hubbas at the given template-space xs. */
function terrace(c: TemplateCtx, tA: number, n: number, rails: number[], hubbas: number[], landmark?: string): number {
  const s = sOf(tA), len = n * STAIR.tread, drop = stairDrop(n);
  put(c, buildTerrace(s, n, c.props, landmark));
  c.cuts.push([s, s + len]);
  c.datumAt.push({ s: s + len, datum: round1cm(c.datum - drop) });
  for (const x of rails) { const r = put(c, buildHandrail(s, len, c.X(x), c.datum, drop, c.props)); c.coins.edge(r.edges[1]!, 0.02, 0.02); }
  for (const x of hubbas) { const h = put(c, buildHubba(s, len, c.X(x), c.datum, drop, c.props)); void h; }
  return s + len;
}

export const DT_TERRACE: Template = {
  id: 'DT_TERRACE', area: 'downtown', tiers: [2], durMax: 3.2, mirror: true, drop: stairDrop(5),
  build(c: TemplateCtx): TemplateOut | null {
    if (c.datum - stairDrop(5) < GEN.datum.min) return null;
    const tA = contentFrom(c) + 0.6 + c.rng.range(0, 0.3);
    const rx = round1cm(c.rng.range(0.6, 1.6)), hx = round1cm(-c.rng.range(1.6, 2.6));
    const sEnd = terrace(c, tA, 5, [rx], [hx]);
    return { t1: tAt(sEnd + 0.4) + 0.8 };
  },
};

export const DT_BIG7: Template = {
  id: 'DT_BIG7', area: 'downtown', tiers: [3], durMax: 3.2, mirror: true, drop: stairDrop(7),
  build(c: TemplateCtx): TemplateOut | null {
    if (c.datum - stairDrop(7) < GEN.datum.min) return null;
    const tA = contentFrom(c) + 0.6 + c.rng.range(0, 0.3);
    const rx = round1cm(c.rng.range(-1.2, 1.2));
    const sEnd = terrace(c, tA, 7, [rx], [], 'Amberlane Seven');
    c.coins.gold(sEnd + 1.0, c.X(rx), c.datum - stairDrop(7) + 1.0);
    return { t1: tAt(sEnd + 0.4) + 0.8 };
  },
};

export const DT_RUSH: Template = {
  id: 'DT_RUSH', area: 'downtown', tiers: [3, 4], durMax: 4.6, mirror: true,
  build(c: TemplateCtx): TemplateOut {
    // Parking lanes at ±2.15 full of cars, each lane with one gap, the gaps 1.2 s apart (zig-zag); a double-parked car
    // in the centre beside the first gap (zig into it and back). The cars start ≥ 1.5 s in (the entry fan, a myopic
    // player's look-ahead). Trick lines on the sidewalks, running past the cars on their side and ending ≥ 0.8 s after
    // them (their exit zones and rail-end lanes stay clear): a granite ledge on one, a flat bar on the other.
    const v = c.v, tA = contentFrom(c) + 0.9, carsSec = 2.4;
    const carLen = 4.4, gapLen = Math.max(7.5, v * 0.95);
    const gapSide = side(c);
    const sStart = sOf(tA), sEndCars = sOf(tA + carsSec);
    const sGap = sOf(tA + 0.8);
    let sLast = sStart;
    for (const sd of [-1, 1] as const) {
      const x = round1cm(sd * 2.15);
      const g0 = sd === gapSide ? sGap : sGap + v * 1.2 + (c.tier >= 4 ? 0 : 0.8);
      let s = sStart;
      while (s + carLen <= sEndCars + 0.01) {
        if (s + carLen > g0 && s < g0 + gapLen) { s = g0 + gapLen; continue; }
        put(c, buildParkedCar(round1cm(s), x, c.props, c.rng.int(0, 5)));
        sLast = Math.max(sLast, s + carLen);
        s += carLen + c.rng.range(0.6, 1.1);
      }
    }
    // The double-parked car: centre, alongside the gap side's gap (the hardest element: dropped on the easy re-rolls).
    if (c.attempt < GEN.easyFrom) put(c, buildParkedCar(round1cm(sGap + 1.0), round1cm(-gapSide * 0.35), c.props, c.rng.int(0, 5)));
    if (c.tier >= 4 && c.attempt < GEN.easyFrom) put(c, buildParkedCar(round1cm(sGap + v * 1.4 + 1.0), round1cm(gapSide * 0.35), c.props, c.rng.int(0, 5)));
    if (c.layout.curbX !== null) {
      const ls = side(c), sEnd = sLast + v * 0.8;
      const ledge = put(c, buildLedge(round1cm(sStart + v * 0.4), round1cm(ls * 3.75), round1cm(sEnd - sStart - v * 0.4), c.props));
      edgeCoins(c, ledge);
      const bar = put(c, buildFlatbar(round1cm(sStart + v * 0.8), round1cm(-ls * 3.75), round1cm(sEnd - sStart - v * 0.8), 0.4, c.props));
      c.coins.edge(bar.edges[0]!);
      if (c.tier >= 3) c.coins.gold(bar.s + bar.len - 0.5, bar.x, bar.solids[0]!.box.y1 + 0.6);
    }
    return { t1: Math.max(endAfter(c, 0.6), tAt(sAt(c.t0) + 0.1) + 2.5) };
  },
};
