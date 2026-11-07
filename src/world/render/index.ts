// world/render/: world meshes, palette, lights, sky and the run / menu cameras (WA). Public surface (TECH §4.13): the
// two factories; the other exports are for vfx/, tests and the gallery harness.
import type { CameraRig, GfxContext, WorldView } from '../../core/view';
import { createCameraRigImpl } from './camera';
import { createWorldViewImpl } from './view';

export function createWorldView(ctx: GfxContext): WorldView {
  return createWorldViewImpl(ctx);
}

export function createCameraRig(): CameraRig {
  return createCameraRigImpl();
}

export { solveFraming, lookAheadFor, lookAheadPersp, yawForAspect, hudTopOf, edgeMetresPerPx, farMetresPerPx, framePx, groundAt, groundDepthAt, RIG_STATE, type Framing } from './camera';
export { CAM_VARIANTS, camVariant, isDefaultCam, parseCamVariant, setCamVariant, type CamVariant } from './camVariants';
export { heightClass } from './chunkBuilder';
export { COLORS, SURFACE_COLOR, CONTACT, PRESETS, HAZARD, ACCENTS, samplePalette, blendWeight } from './palette';
export { buildOptionsFor, worldAmbient, VIEW, type WorldViewDebug } from './view';
export { QUALITY } from './render.config';
export type { AmbientRec } from './kits/decor';
