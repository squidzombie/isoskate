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

export { solveFraming, lookAheadFor, lookAheadPersp, yawForAspect, hudTopOf, edgeHalfAt, edgeMetresPerPx, edgeWidening, farMetresPerPx, framePx, groundAt, groundDepthAt, OCCLUSION_DEBUG, RIG_STATE, RIG_UNIFORMS, type Framing } from './camera';
export { CAM_VARIANTS, DEFAULT_CAM_VARIANT, camVariant, parseCamVariant, setCamVariant, type CamVariant } from './camVariants';
export { heightClass } from './chunkBuilder';
export { COLORS, SURFACE_COLOR, CONTACT, PRESETS, HAZARD, ACCENTS, samplePalette, blendWeight } from './palette';
export { buildOptionsFor, coinFloorOf, worldAmbient, VIEW, type WorldViewDebug } from './view';
export { QUALITY } from './render.config';
export type { AmbientRec } from './kits/decor';
/** The Title's space scene (the Earth, the floating equipped board) and the dive's hand-over to the run camera. */
export { TitleScene, TITLE_SCENE, type TitleBand, type DiveFrame } from './title/space';
export { HANDOVER } from './title/handover';
export { EarthBaker, EARTH_TEX } from './title/earthTexture';
