// world/render/kits/index.ts: the PropKind → kit registry (every kind has one; tests assert it) and the per-obstacle
// dispatcher: ground slabs and pits, the kit body (long kinds per chunk and clipped, compact kinds once in their
// anchor chunk), then the grind edges on top.
import type { PropKind } from '../../../core/ids';
import type { Obstacle } from '../../../core/world';
import { CHUNK_LEN } from '../../../core/tuning';
import { edgesOf, groundOfObstacle, setArea, solidsFallback, type KitCtx } from './common';
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
  edgesOf(c, ob);
  return far;
}
