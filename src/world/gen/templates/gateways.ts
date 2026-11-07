// world/gen/templates/gateways.ts: the 4 gateways (DESIGN §12.2): T0, 4 s, a free coin string, no required actions.
// Each hides the swap of building kit and carries the palette and music crossfade; the curbs fade out.
//   GW_greenway      (DT → SB)  park path, low walls on the lawns (optional grinds), leaves blowing
//   GW_levelCrossing (SB → IN)  raised gate arms, flush rail tracks (bumps with a clack), chain-link starts
//   GW_harborBridge  (IN → NE)  an optional bridge deck (L1, like the skywalk) on one side: 1:10 up 2.0 m, a guard rail,
//                               the city's glow ahead, a 2.0 m drop; the open road beside it is the safe line
//   GW_underpass     (NE → DT)  a tiled tunnel with warm sodium lights: the sky resets to golden inside
import { clamp, round1cm } from '../../../core/math';
import { sAt, tAt } from '../../../core/tuning';
import { ObTag } from '../../../core/world';
import { GEN } from '../gen.config';
import { buildProp } from '../props/common';
import { buildDeck } from '../props/docks';
import { LAYOUTS } from '../props/street';
import { buildGardenWall } from '../props/suburbs';
import type { Template, TemplateCtx, TemplateOut } from './types';
import { put, sOf } from './util';

const wave = (c: TemplateCtx, t1: number) =>
  c.coins.wave(c.t0 + 0.4, t1 - 0.4, c.safeX, GEN.coins.breatherAmp, c.coinRng.range(0, 6.28), c.datum + GEN.coins.groundY);
const end = (c: TemplateCtx) => Math.min(c.t0 + (c.dur ?? 4), c.maxT1);
/** Harbor Bridge deck: incline start after the gateway starts (s), exit room before it ends (s·v), shortest deck (m). */
const GW_BRIDGE = GEN.harborBridge;

export const GW_greenway: Template = {
  id: 'GW_greenway', area: 'fixed', tiers: [0], durMax: 4, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    const t1 = end(c);
    for (const sd of [-1, 1] as const) {
      const w = put(c, buildGardenWall(sOf(c.t0 + 0.7), round1cm(sd * 3.9), Math.max(3, sAt(t1 - 0.9) - sAt(c.t0 + 0.7)), c.props));
      w.params = { ...w.params, park: 1 };
    }
    wave(c, t1);
    return { t1, layout: LAYOUTS.greenway, noCurbEdges: true, t0Stretch: true };
  },
};

export const GW_levelCrossing: Template = {
  id: 'GW_levelCrossing', area: 'fixed', tiers: [0], durMax: 4, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    const t1 = end(c);
    // Two flush tracks across the road (rails at gauge 1.435 m): metal slabs at datum height, harmless bumps.
    for (const tt of [c.t0 + 1.4, c.t0 + 2.2]) {
      const s = sOf(tt);
      const ob = buildProp({ kind: 'rail_track', s, x: 0, len: 1.6, wid: 9.0, hgt: 0, topSlab: false, params: { gauge: 1.435 } }, c.props);
      ob.solids.length = 0;
      for (const ds of [0, 1.435]) ob.slabs.push({ s0: round1cm(s + ds), s1: round1cm(s + ds + 0.08), x0: -4.5, x1: 4.5,
        y0: round1cm(c.datum), y1: round1cm(c.datum), layer: 0, surface: 'metal', kind: 'flat' });
      put(c, ob);
    }
    wave(c, t1);
    return { t1, layout: LAYOUTS.levelCrossing, noCurbEdges: true, t0Stretch: true };
  },
};

export const GW_harborBridge: Template = {
  id: 'GW_harborBridge', area: 'fixed', tiers: [0], durMax: 4, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    const t1 = end(c);
    // The deck goes on the side away from the safe line (the open road beside it is the safe line).
    const sd = c.safeX <= 0 ? 1 : -1;
    const x0 = sd > 0 ? 1.6 : -4.5, x1 = sd > 0 ? 4.5 : -1.6;
    // 1:10 up 2.0 m (20 m) from 0.4 s in, the deck to 0.6 s·v before the gateway ends (its exit zone and the 3.4 m
    // clear road beyond the drop stay inside the gateway): ~10 m of deck at v ≈ 10.
    const tA = c.t0 + GW_BRIDGE.lead;
    const sA = sOf(tA), sEnd = sAt(t1) - GW_BRIDGE.exitSec * c.v;
    const inc = 20, deckLen = round1cm(clamp(sEnd - sA - inc, GW_BRIDGE.minDeck, 20));
    if (sEnd - sA - inc >= GW_BRIDGE.minDeck) {
      const deck = put(c, buildDeck({ kind: 'skywalk', s: sA, inclineLen: inc, deckLen, x0, x1, h: 2.0, body: 'plate', rails: 'both',
        material: 'neon', variant: 1 }, c.props));
      deck.params = { ...deck.params, bridge: 1 };
      deck.tags |= ObTag.TrickLine;
      c.coins.gold(deck.s + deck.len - 1.0, (x0 + x1) / 2, c.datum + 2.6);
    }
    wave(c, t1);
    return { t1, layout: LAYOUTS.harborBridge, noCurbEdges: true, t0Stretch: true };
  },
};

export const GW_underpass: Template = {
  id: 'GW_underpass', area: 'fixed', tiers: [0], durMax: 4, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    const t1 = end(c);
    wave(c, t1);
    return { t1, layout: LAYOUTS.underpass, noCurbEdges: true, t0Stretch: true };
  },
};
