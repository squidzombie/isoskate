// world/gen/props/docks.ts: Industrial Docks builders (DESIGN §10.3): I-beams, containers, the pallet "staircase",
// drum clusters, mooring bollards, and raised decks (the loading dock; the Neon skywalk and the Harbor Bridge deck use
// the same builder). The lip itself is street base (props/street.ts).
import type { EdgeMaterial, PropKind } from '../../../core/ids';
import { round1cm } from '../../../core/math';
import { HEIGHT, STEP_UP } from '../../../core/tuning';
import type { GroundSlab, Obstacle } from '../../../core/world';
import { ObTag } from '../../../core/world';
import { BODY_TOPS, buildProp, buildTall, lowGround, steppedBody, type PropCtx } from './common';

/** I-beam 6–12 × 0.2 × 0.40 lying along s: crash top, one centre grind edge (the long grind). */
export function buildIbeam(s: number, x: number, len: number, p: PropCtx, tags: number = ObTag.TrickLine): Obstacle {
  return buildProp({ kind: 'ibeam', s, x, len: Math.min(12, Math.max(6, len)), wid: 0.2, hgt: 0.4, ground: lowGround(x, 0.2, p), tags,
    edges: [{ side: 0, kind: 'rail', material: 'metal' }] }, p);
}

/** Shipping container 6.1 × 2.4 × 2.6 (tall), long axis along s: forms channel walls. */
export const buildContainer = (s: number, x: number, p: PropCtx, variant = 0) => buildTall('container', s, x, 6.1, 2.4, 2.6, p, { variant });

/** Pallets 1.2 (along s) × 1.0: 1 = 0.15 bump, 2 = 0.30 / 3 = 0.45 Low landable (ollie onto, manual), tall = 1.20 (A). */
export function buildPallet(n: 1 | 2 | 3 | 4, s: number, x: number, p: PropCtx, tags: number = ObTag.TrickLine): Obstacle {
  if (n === 4) return buildTall('pallet_tall', s, x, 1.2, 1.0, 1.2, p, { tags: ObTag.Filler });
  const kind: PropKind = n === 1 ? 'pallet_1' : n === 2 ? 'pallet_2' : 'pallet_3';
  return buildProp({ kind, s, x, len: 1.2, wid: 1.0, hgt: round1cm(0.15 * n), ground: lowGround(x, 1.0, p), tags, surface: 'wood' }, p);
}

/** Drum cluster: `n` (2–5) drums 0.6 Ø × 1.15 side by side on a skid (0.7 along s), tall. */
export const buildDrums = (s: number, x: number, n: number, p: PropCtx, variant = 0) =>
  buildTall('drum_cluster', s, x, 0.7, round1cm(0.65 * Math.max(1, n)), 1.15, p, { variant, params: { drums: n } });

/** Mooring bollard 0.5 Ø × 1.15 (with its chain post), tall; sits on the apron outside every lip grind sweep. */
export const buildBollard = (s: number, x: number, p: PropCtx) => buildTall('mooring_bollard', s, x, 0.5, 0.5, 1.15, p);

export interface DeckSpec {
  kind: 'loading_dock' | 'skywalk';
  s: number; inclineLen: number; deckLen: number; x0: number; x1: number; h: number;
  /** 'solid': the body reaches the ground (loading dock); 'plate': a 0.15 m plate (skywalk, bridge): L0 rides under. */
  body: 'solid' | 'plate';
  /** Guard rails on the deck edges (crash, 0.5 high, grindable tops), or one grind edge on the open side. */
  rails: 'both' | 'none';
  openEdge?: -1 | 1;                     // side whose deck edge is grindable (loading dock steel edge)
  material?: EdgeMaterial; landmark?: string; variant?: number;
}

/** A raised L1 deck reached by a 1:10-ish incline at its start, with a drop at its end (DESIGN §10.3, §10.10). The
 *  incline and deck tops are layer-1 body tops (the validator ignores L1: their bodies are solids for L0). */
export function buildDeck(d: DeckSpec, p: PropCtx): Obstacle {
  const g = p.datum;
  const len = d.inclineLen + d.deckLen;
  const ob = buildProp({ kind: d.kind, s: d.s, x: (d.x0 + d.x1) / 2, len, wid: d.x1 - d.x0, hgt: d.h, ground: g, topSlab: false,
    tags: ObTag.TrickLine | ObTag.Elevated, landmark: d.landmark, variant: d.variant ?? 0,
    params: { inclineLen: round1cm(d.inclineLen), deckLen: round1cm(d.deckLen), h: d.h, plate: d.body === 'plate' ? 1 : 0 } }, p);
  ob.solids.length = 0;
  const sI = ob.s, sD = round1cm(d.s + d.inclineLen), sE = round1cm(d.s + len);
  const x0 = round1cm(d.x0), x1 = round1cm(d.x1);
  const yAt = (s: number) => g + (d.h * Math.min(1, Math.max(0, (s - sI) / Math.max(1e-6, sD - sI))));
  if (d.inclineLen > 0) steppedBody(ob, sI, sD, x0, x1, yAt, () => g, 'landable', Math.max(4, Math.round(d.inclineLen / 2)));
  const top = round1cm(g + d.h);
  const bottom = d.body === 'solid' ? round1cm(g) : round1cm(top - 0.15);
  ob.solids.push({ box: { s0: sD, s1: sE, x0, x1, y0: bottom, y1: top }, top: 'landable', tall: top - bottom >= HEIGHT.tallMin });
  const slabs: GroundSlab[] = [];
  if (d.inclineLen > 0) slabs.push({ s0: sI, s1: sD, x0, x1, y0: round1cm(g), y1: top, layer: 1, surface: 'concrete', kind: 'incline' });
  slabs.push({ s0: sD, s1: sE, x0, x1, y0: top, y1: top, layer: 1, surface: d.kind === 'skywalk' ? 'tile' : 'metal', kind: 'flat' });
  for (const sl of slabs) { ob.slabs.push(sl); BODY_TOPS.add(sl); }
  const mat: EdgeMaterial = d.material ?? 'metal';
  if (d.rails === 'both') {
    for (const ex of [x0 + 0.03, x1 - 0.03]) {
      const ra = round1cm(sD + 0.4), rb = round1cm(sE - 0.1);
      ob.solids.push({ box: { s0: ra, s1: rb, x0: round1cm(ex - 0.03), x1: round1cm(ex + 0.03), y0: top, y1: round1cm(top + 0.5) },
        top: 'crash', tall: false });
      ob.edges.push({ id: ++p.ids.edge, obstacleId: ob.id, a: { s: ra, x: round1cm(ex), y: round1cm(top + 0.5) },
        b: { s: rb, x: round1cm(ex), y: round1cm(top + 0.5) }, kind: 'rail', material: mat, layer: 1, pickOnly: false });
    }
  } else if (d.openEdge) {
    const ex = d.openEdge < 0 ? x0 : x1;
    ob.edges.push({ id: ++p.ids.edge, obstacleId: ob.id, a: { s: round1cm(sD + 0.2), x: ex, y: top }, b: { s: round1cm(sE - 0.05), x: ex, y: top },
      kind: 'ledge', material: mat, layer: 1, pickOnly: d.h <= STEP_UP });
  }
  if (ob.edges.length) ob.tags |= ObTag.Grindable;
  return ob;
}
