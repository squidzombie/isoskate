// gfx/: low-level rendering helpers shared by world/render, vfx and skater (INT in M0; WA may add files).
// WA (W2a) added uniforms.ts (sharedUniforms / uDesat) and, in renderer.ts, setPaletteSource + getHemi.
// Public surface (TECH §4.13): createGfx. The helpers below are exported for the other render modules.
import type { QualityTier } from '../core/ids';
import type { GfxContext } from '../core/view';
import { createGfxImpl } from './renderer';

export function createGfx(canvas: HTMLCanvasElement, q: QualityTier): GfxContext {
  return createGfxImpl(canvas, q);
}

export { DPR_CAP, LIGHT_SCALE, getHemi, getSun, redrawCanvasTextures, setGfxQuality, setPaletteSource, SUN_NAME, HEMI_NAME } from './renderer';
export { GRADING_PARS, sharedUniforms, type SharedUniforms } from './uniforms';
export { readViewport, onViewportChange } from './canvas';
export { colorBox, mergeAll } from './geom';
export { originOf, toWorld } from './space';
export { GOLDEN } from './palette';
export { readWorldPoints, type WorldPoints } from './silhouette';   // debug only (the contrast gate); tree-shaken from the game
