// gfx/: low-level rendering helpers shared by world/render, vfx and skater (INT in M0; WA may add files).
// Public surface (TECH §4.13): createGfx. The helpers below are exported for the other render modules.
import type { QualityTier } from '../core/ids';
import type { GfxContext } from '../core/view';
import { createGfxImpl } from './renderer';

export function createGfx(canvas: HTMLCanvasElement, q: QualityTier): GfxContext {
  return createGfxImpl(canvas, q);
}

export { DPR_CAP, LIGHT_SCALE, getSun, redrawCanvasTextures, setGfxQuality, SUN_NAME, HEMI_NAME } from './renderer';
export { readViewport, onViewportChange } from './canvas';
export { colorBox, mergeAll } from './geom';
export { originOf, toWorld } from './space';
export { GOLDEN } from './palette';
