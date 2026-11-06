// skater/: the skater, board and helmet view (SK). Public surface (TECH §4.13).
// M0 stub: a capsule rider and a box board. TODO(SK): DESIGN §18.5 rig, outline twins, poses, crash tumble.
import type { GfxContext, SkaterView } from '../core/view';
import { StubSkaterView } from './stub';

export function createSkaterView(ctx: GfxContext): SkaterView {
  return new StubSkaterView(ctx);
}
