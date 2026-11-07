// world/render/kits/index.ts: the PropKind → kit registry (every kind has one; tests assert it) and the per-obstacle
// dispatcher: ground slabs and pits, the kit body (long kinds per chunk and clipped, compact kinds once in their
// anchor chunk), then the grind edges on top.
import type { PropKind } from '../../../core/ids';
import type { Obstacle } from '../../../core/world';
import { CHUNK_LEN } from '../../../core/tuning';
import { contact, edgesOf, groundOfObstacle, setArea, solidsFallback, type KitCtx } from './common';
import { DRESSER } from './dress';
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
 *  obstacles anchored before the run's first built chunk are drawn there). `isolated`: an isolated column filler
 *  (the sapling exception, kits/dress.ts isIsolatedFiller; the chunk builder passes it). Returns the far s of what
 *  was drawn. The kit reads the obstacle's skin and draws its dressing through DRESSER (kits/dress.ts). */
export function drawObstacle(c: KitCtx, ob: Obstacle, chunkIndex: number, first = false, isolated = false): number {
  setArea(c, ob.area);
  c.hz = HAZARD[c.lookAt(ob.s + Math.min(ob.len, 2) / 2)];
  const K = c.K;
  K.reset();
  groundOfObstacle(c, ob);
  const def = KITS[ob.kind];
  const anchored = anchorChunk(ob) === chunkIndex || (first && anchorChunk(ob) < chunkIndex);
  let far = Math.min(ob.s + ob.len, c.s1);
  const contacts0 = c.contacts;
  if (def?.long) {
    K.reset(); K.clip0 = c.s0; K.clip1 = c.s1;
    DRESSER.begin(ob, c.s0, c.s1, isolated);
    def.draw(c, ob);
    DRESSER.end();
  } else if (anchored) {
    K.reset();
    DRESSER.begin(ob, -Infinity, Infinity, isolated);
    if (def) def.draw(c, ob); else solidsFallback(c, ob);
    DRESSER.end();
    far = ob.s + ob.len + 1;
  }
  K.reset();
  if ((anchored || def?.long) && c.contacts === contacts0) contactsOf(c, ob, !!def?.long);
  edgesOf(c, ob);
  return far;
}

/** The default contact shadow under every solid of a kit that drew none of its own (DESIGN §18.4). */
function contactsOf(c: KitCtx, ob: Obstacle, clip: boolean): void {
  for (const so of ob.solids) {
    const b = so.box;
    if (clip && (b.s1 <= c.s0 || b.s0 >= c.s1)) continue;
    const s0 = clip ? Math.max(b.s0, c.s0) : b.s0, s1 = clip ? Math.min(b.s1, c.s1) : b.s1;
    contact(c, b.x0, b.x1, s0, s1, b.y0 + 0.01, so.top === 'crash' ? 0.5 : 0.35, so.tall ? 0.2 : 0);
  }
}
