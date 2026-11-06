// world/render/kits/index.ts: the PropKind → kit registry (every kind has one; tests assert it) and the per-obstacle
// dispatcher: ground slabs and pits, the kit body (long kinds per chunk and clipped, compact kinds once in their
// anchor chunk), then the grind edges on top.
import type { PropKind } from '../../../core/ids';
import type { Obstacle } from '../../../core/world';
import { CHUNK_LEN } from '../../../core/tuning';
import { edgesOf, groundOfObstacle, hazardPool, setArea, solidsFallback, type KitCtx } from './common';
import { HAZARD } from '../palette';
import { DOCKS_KITS } from './docks';
import { DOWNTOWN_KITS } from './downtown';
import { NEON_KITS } from './neon';
import { SHARED_KITS, type KitDef } from './shared';
import { SUBURBS_KITS } from './suburbs';

export const KITS: Readonly<Partial<Record<PropKind, KitDef>>> = {
  ...SHARED_KITS, ...DOWNTOWN_KITS, ...SUBURBS_KITS, ...DOCKS_KITS, ...NEON_KITS,
  holo_gate: SHARED_KITS.barrier_low!,
};

/** The chunk index an obstacle's compact body is drawn in (its anchor). */
export const anchorChunk = (ob: Obstacle) => Math.floor(ob.s / CHUNK_LEN);

/** Draws one obstacle into the chunk the KitCtx covers. `first`: the earliest chunk built for it (compact bodies of
 *  obstacles anchored before the run's first built chunk are drawn there). Returns the far s of what was drawn. */
export function drawObstacle(c: KitCtx, ob: Obstacle, chunkIndex: number, first = false): number {
  setArea(c, ob.area);
  c.hz = HAZARD[c.lookAt(ob.s + Math.min(ob.len, 2) / 2)];
  const K = c.K;
  K.reset();
  groundOfObstacle(c, ob);
  const def = KITS[ob.kind];
  const anchored = anchorChunk(ob) === chunkIndex || (first && anchorChunk(ob) < chunkIndex);
  let far = Math.min(ob.s + ob.len, c.s1);
  if (def?.long) {
    K.reset(); K.clip0 = c.s0; K.clip1 = c.s1;
    def.draw(c, ob);
  } else if (anchored) {
    K.reset();
    if (def) def.draw(c, ob); else solidsFallback(c, ob);
    far = ob.s + ob.len + 1;
  }
  K.reset();
  if (anchored && !c.hz.inverted) hazardPools(c, ob);
  edgesOf(c, ob);
  return far;
}

/** Every crash-top solid sits in its own pool of shadow (DESIGN §18.4: contact shadows under every obstacle): a soft
 *  dark decal over the ground its screen hull covers (its footprint and h·cot 35° behind it, where the sun-from-
 *  behind shadow falls), so see-through parts (legs, gaps, the x-ray cap) still read as one dark silhouette. The
 *  inverted Neon hazards glow instead. Full-width barriers draw their own pool. */
function hazardPools(c: KitCtx, ob: Obstacle): void {
  if (ob.kind === 'barrier_low' || ob.kind === 'holo_gate') return;
  for (const so of ob.solids) {
    if (so.top !== 'crash') continue;
    const b = so.box;
    hazardPool(c, b.x0, b.x1, b.s0, b.s1, b.y1 - b.y0, so.tall ? 0.95 : 0.82);
  }
}
