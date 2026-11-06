// skater/: the skater, board and helmet view (SK). Public surface (TECH §4.13): createSkaterView.
// Extras for tools (contact sheets, the Locker, tests): the concrete view class (stats(), snap(), setShowcaseTime()),
// the pose resolver, the budgets and the config.
import type { GfxContext, SkaterView } from '../core/view';
import { SkaterViewImpl } from './view';

export function createSkaterView(ctx: GfxContext): SkaterView {
  return new SkaterViewImpl(ctx);
}

export { SkaterViewImpl, duskOf, type SkaterStats } from './view';
export { resolvePose, POSE_TABLE, GRIND_POSES, MANUAL_POSES } from './poses';
export { basePose, showcasePose } from './showcase';
export { BUDGET } from './skater.config';
