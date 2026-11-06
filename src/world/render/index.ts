// world/render/: world meshes, palette, lights and the run camera (WA; M0-io ships the grey-box chunk builder).
// Public surface (TECH §4.13).
import type { CameraRig, GfxContext, WorldView } from '../../core/view';
import { createCameraRigImpl } from './camera';
import { createGreyboxWorldView } from './view';

export function createWorldView(ctx: GfxContext): WorldView {
  return createGreyboxWorldView(ctx);
}

export function createCameraRig(): CameraRig {
  return createCameraRigImpl();
}

export { solveFraming, lookAheadFor, yawForAspect, hudTopOf, type Framing } from './camera';
export { heightClass, solidColor, COLORS, SURFACE_COLOR } from './chunkBuilder';
export { buildOptionsFor, VIEW, type GreyboxView } from './view';
