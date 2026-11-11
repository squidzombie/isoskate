// world/gen/props/neon.ts: Neon City (Hoshimachi Ward) builders (DESIGN §10.3): glowing guard rails, vending banks,
// viaduct pillars (carrying the maglev's two edge beams: decor), cherry planters with trunks, lantern stands, food
// carts and bike rows. The skywalk deck uses props/docks.ts buildDeck; the holo gate is the S_BARRIER skin.
import { round1cm } from '../../../core/math';
import type { Obstacle } from '../../../core/world';
import { ObTag } from '../../../core/world';
import { buildProp, buildTall, lowGround, type PropCtx } from './common';

/** Guard rail run along x (±2.95: road side of the curb, so its 0.50 top is Low from the road and the sidewalk):
 *  a crash-top rail body (end posts crash) with a cream top grind edge; the cyan glow is the kit's (DESIGN §18.4). */
export function buildGuardRail(s: number, x: number, len: number, p: PropCtx, tags: number = ObTag.TrickLine): Obstacle {
  return buildProp({ kind: 'guard_rail', s, x, len: Math.min(32, Math.max(6, len)), wid: 0.06, hgt: 0.5, ground: lowGround(x, 0.06, p), tags,
    edges: [{ side: 0, kind: 'rail', material: 'neon' }] }, p);
}

/** Vending bank: 0.8 along s × 1.0 per machine (1–4) × 1.8, lit fronts toward the camera (tall). */
export const buildVending = (s: number, x: number, machines: number, p: PropCtx, variant = 0, tags = 0) =>
  buildTall('vending_bank', s, x, 0.8, machines, 1.8, p, { variant, params: { machines }, tags });

/** Viaduct pillar 1.2 × 1.2 × 6.0 at x (0 = the median line). */
export const buildPillar = (s: number, x: number, p: PropCtx) => buildTall('viaduct_pillar', s, x, 1.2, 1.2, 6.0, p);

/** Cherry planter 2.4 × 1.2 × 0.50 with a 0.3 Ø × 2.8 trunk (tall): long-rim grinds only. */
export function buildCherryPlanter(s: number, x: number, p: PropCtx, tags: number = ObTag.TrickLine): Obstacle {
  const ob = buildProp({ kind: 'cherry_planter', s, x, len: 2.4, wid: 1.2, hgt: 0.5, ground: lowGround(x, 1.2, p), tags, surface: 'tile',
    edges: [{ side: -1, kind: 'rim', material: 'stone' }, { side: 1, kind: 'rim', material: 'stone' }] }, p);
  const g = ob.solids[0]!.box.y0;
  ob.solids.push({ box: { s0: round1cm(s + 1.05), s1: round1cm(s + 1.35), x0: round1cm(x - 0.15), x1: round1cm(x + 0.15), y0: g, y1: round1cm(g + 2.8) },
    top: 'crash', tall: true });
  ob.params = { trunkH: 2.8 };
  return ob;
}

export const buildLanternStand = (s: number, x: number, p: PropCtx) => buildTall('lantern_stand', s, x, 0.4, 0.4, 1.6, p, { tags: ObTag.Filler });
export const buildFoodCart = (s: number, x: number, p: PropCtx, variant = 0) => buildTall('food_cart', s, x, 2.0, 1.2, 2.2, p, { variant });
export const buildBikeRow = (s: number, x: number, len: number, p: PropCtx) =>
  buildTall('bike_row', s, x, Math.min(8, Math.max(4, len)), 0.6, 1.15, p);
