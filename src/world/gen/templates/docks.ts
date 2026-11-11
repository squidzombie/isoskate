// world/gen/templates/docks.ts: the Industrial Docks v1 templates (DESIGN §10.4). Never mirrored (the lip is right).
//   IN_BEAM     T1  2.5 s  a long I-beam on the apron                                  (long grind)
//   IN_LIP      T1  3.0 s  "Pier 9 lip": a 2–3 s lip run, mooring bollards on the apron (landmark, the long grind)
//   IN_PALLETS  T2  3.0 s  the pallet "staircase": 1 / 2–3 / tall                      (manual on top)
//   IN_CHANNEL  T2  4.0 s  container walls with a 3 m channel that shifts sideways, a beam inside
//   IN_DOCK_UP  T2  4.0 s  incline up onto the loading dock, ride along it, drop off      (edge grind, drop flip)
//   IN_GAUNTLET T4  4.0 s  the loading-dock high line with a gap, drums on the low line  (gap to gap; thread the drums)
import { clamp, round1cm } from '../../../core/math';
import { sAt, tAt } from '../../../core/tuning';
import { ObTag } from '../../../core/world';
import { GEN } from '../gen.config';
import { buildBollard, buildContainer, buildDeck, buildDrums, buildIbeam, buildPallet } from '../props/docks';
import { LIP } from '../props/street';
import type { Template, TemplateCtx, TemplateOut } from './types';
import { contentFrom, edgeCoins, endAfter, put, sOf, secondBeat } from './util';

export const IN_BEAM: Template = {
  id: 'IN_BEAM', area: 'docks', tiers: [1], durMax: 4.2, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    const x = round1cm(c.rng.range(-1.2, 2.2));
    const beam = put(c, buildIbeam(sOf(contentFrom(c) + 0.3), x, c.v * c.rng.range(1.0, 1.3), c.props));
    edgeCoins(c, beam);
    secondBeat(c, beam);
    return { t1: endAfter(c, 0.7) };
  },
};

export const IN_LIP: Template = {
  id: 'IN_LIP', area: 'docks', tiers: [1], durMax: 3.6, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    const tA = contentFrom(c) + 0.2, dur = c.rng.range(2.0, 2.6);
    const s0 = sOf(tA), s1 = sOf(tA + dur);
    // Mooring bollards beside the run (x ≤ 3.4: outside the lip grind sweep), from 0.6 s into it to 0.6 s before its end.
    for (let t = tA + 0.6; t < tA + dur - 0.6; t += c.rng.range(0.7, 0.9)) put(c, buildBollard(sOf(t), round1cm(c.rng.range(3.1, 3.4)), c.props));
    // Coins along the lip (edge y + 0.35).
    c.coins.string(s0 + 0.3 * c.v, s1 - 0.2 * c.v, LIP.x0, c.datum + LIP.h + GEN.coins.edgeUp, c.v);
    return { t1: tAt(s1) + 0.7, lip: { s0, s1, landmark: 'Pier 9 lip' } };
  },
};

export const IN_PALLETS: Template = {
  id: 'IN_PALLETS', area: 'docks', tiers: [2, 3], durMax: 3.6, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    const x = round1cm(c.rng.range(-1.4, 1.8)), tA = contentFrom(c) + 0.4;
    const mid: 2 | 3 = c.rng.chance(0.5) ? 2 : 3;
    const p1 = put(c, buildPallet(1, sOf(tA), x, c.props));
    const p2 = put(c, buildPallet(mid, sOf(tA + 0.35), x, c.props));
    const p3 = put(c, buildPallet(3, sOf(tA + 0.75), x, c.props));
    for (const p of [p1, p2, p3]) c.coins.add(p.s + 0.6, x, (p.slabs[0]?.y0 ?? c.datum) + GEN.coins.padUp, 'trick');
    // The tall one beside the line's end: the staircase reads 1 / 2–3 / tall (dropped on the easy re-rolls).
    const tx = round1cm(x + (x > 0 ? -2.0 : 2.0));
    if (c.attempt < GEN.easyFrom) put(c, buildPallet(4, sOf(tA + 0.75), tx, c.props));
    return { t1: endAfter(c, 0.75) };
  },
};

export const IN_CHANNEL: Template = {
  id: 'IN_CHANNEL', area: 'docks', tiers: [2, 3], durMax: 4.4, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    // Two container rows (6.1 m long) with a 3 m channel; the channel shifts 1.6–2.2 m between them.
    const tA = contentFrom(c) + 0.8;
    const cx1 = round1cm(clamp(c.safeX + c.rng.range(-0.6, 0.6), -1.4, 1.6));
    const dir = cx1 > 0.2 ? -1 : 1;
    const cx2 = round1cm(clamp(cx1 + dir * c.rng.range(1.6, 2.2), -1.6, 1.8));
    const row = (s: number, cx: number) => {
      // Left wall: containers from −4.5 to cx − 1.5; right wall from cx + 1.5 to the lip.
      const l1 = cx - 1.5, r0 = cx + 1.5;
      for (let x1 = l1; x1 > -4.5 + 0.3; x1 -= 2.4) put(c, buildContainer(s, round1cm(Math.max(-4.5 + 1.2, x1 - 1.2)), c.props, c.rng.int(0, 5)));
      for (let x0 = r0; x0 < LIP.x0 - 0.3; x0 += 2.4) put(c, buildContainer(s, round1cm(Math.min(LIP.x0 - 1.2, x0 + 1.2)), c.props, c.rng.int(0, 5)));
    };
    const s1 = sOf(tA), s2 = s1 + 6.1 + Math.max(9, c.v * 1.05);
    row(s1, cx1); row(s2, cx2);
    const beamX = round1cm(cx1 + (cx1 >= 0 ? -0.9 : 0.9));
    const beam = put(c, buildIbeam(s1 + 0.3, beamX, 5.6, c.props));
    beam.tags |= ObTag.TrickLine;
    edgeCoins(c, beam);
    return { t1: endAfter(c, 0.6), lip: false };
  },
};

export const IN_DOCK_UP: Template = {
  id: 'IN_DOCK_UP', area: 'docks', tiers: [2, 3], durMax: 4.6, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    const tA = contentFrom(c) + 0.8;
    const inc = 12, deckLen = round1cm(clamp(c.v * c.rng.range(1.1, 1.6), 10, 30));
    const dock = put(c, buildDeck({ kind: 'loading_dock', s: sOf(tA), inclineLen: inc, deckLen, x0: -4.5, x1: -2.0, h: 1.2, body: 'solid',
      rails: 'none', openEdge: 1, material: 'metal', variant: 0 }, c.props));
    const top = c.datum + 1.2;
    c.coins.string(dock.s + inc + 1.0, dock.s + dock.len - 1.0, -3.25, top + GEN.coins.padUp, c.v);
    return { t1: tAt(dock.s + dock.len) + 0.9 };
  },
};

export const IN_GAUNTLET: Template = {
  id: 'IN_GAUNTLET', area: 'docks', tiers: [4], durMax: 4.6, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    // High line: a loading dock, a 0.3 s·v gap, a second dock (its incline starts in the gap, so a short drop lands on
    // a slope, never a face). Low line: drum clusters on the apron, alternating, to thread.
    const tA = contentFrom(c) + 0.6, v = c.v;
    const d1 = put(c, buildDeck({ kind: 'loading_dock', s: sOf(tA), inclineLen: 12, deckLen: round1cm(v * 0.8), x0: -4.5, x1: -2.0, h: 1.2,
      body: 'solid', rails: 'none', openEdge: 1, variant: 1 }, c.props));
    const sGap = d1.s + d1.len;
    // (d2's incline outlasts d1's drop-off zone, 0.6 s·v: its deck face never stands where a d1 rider lands)
    const d2 = put(c, buildDeck({ kind: 'loading_dock', s: round1cm(sGap + v * 0.05), inclineLen: round1cm(v * 0.65 + 1.0), deckLen: round1cm(v * 0.7),
      x0: -4.5, x1: -2.0, h: 1.2, body: 'solid', rails: 'none', openEdge: 1, variant: 2 }, c.props));
    d2.gap = { name: 'Dock Gap', pts: 300, fromObstacle: d1.id };
    c.coins.gold(sGap + v * 0.15, -3.25, c.datum + 1.2 + 1.0);
    let sd = 1;
    for (let t = tA + 0.9; t < tAt(d2.s + d2.len) - 0.6; t += 0.8) {
      // (clear of the docks' drop-off zones: ≥ 1.6 m beside their open edge at x = −2.0)
      put(c, buildDrums(sOf(t), round1cm(sd > 0 ? c.rng.range(1.9, 2.6) : c.rng.range(-0.2, 0.4)), c.rng.int(2, 3), c.props, c.rng.int(0, 3)));
      sd = -sd;
    }
    return { t1: tAt(d2.s + d2.len) + 0.9 };
  },
};
