// gfx/renderer.ts: the one WebGL2 renderer, scene and lights (TECH §8.1, §8.7; DESIGN §18.2).
import {
  ACESFilmicToneMapping, CanvasTexture, Color, DirectionalLight, HemisphereLight, PCFShadowMap, SRGBColorSpace, Scene,
  type Texture, WebGLRenderer,
} from 'three';
import type { AreaId, QualityTier } from '../core/ids';
import type { GfxContext, PaletteSample } from '../core/view';
import type { AreaBlend } from '../core/world';
import { GOLDEN } from './palette';

export const DPR_CAP: Readonly<Record<QualityTier, number>> = { low: 1.0, med: 1.5, high: 2.0 };
const SHADOW_MAP: Readonly<Record<QualityTier, number>> = { low: 0, med: 1024, high: 2048 };
const SHADOW_RADIUS: Readonly<Record<QualityTier, number>> = { low: 0, med: 2, high: 3 };
export const SUN_NAME = 'sun', HEMI_NAME = 'hemi';
/** DESIGN §18.1 intensities are legacy (pre-r155) units. three.js r186 lights are physically based (Lambert divides
 *  by π), so palette intensities are scaled by π to keep the intended mid-value ground. */
export const LIGHT_SCALE = Math.PI;

interface TexEntry { tex: CanvasTexture; draw: (c: CanvasRenderingContext2D) => void; canvas: HTMLCanvasElement }

class Gfx implements GfxContext {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  quality: QualityTier;
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  private readonly textures = new Map<string, TexEntry>();
  /** Where palette() samples come from (WA: world/render presets, set by the WorldView at construction). */
  paletteSource: ((area: AreaId, blend: AreaBlend | null) => PaletteSample) | null = null;

  constructor(canvas: HTMLCanvasElement, q: QualityTier) {
    this.quality = q;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP[q]);
    // MSAA is fixed at context creation from the capped ratio of the starting tier (TECH §8.1).
    this.renderer = new WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.setPixelRatio(dpr);
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = ACESFilmicToneMapping;
    r.shadowMap.type = PCFShadowMap;
    const p = GOLDEN;
    r.toneMappingExposure = p.exposure;
    this.scene.background = new Color(p.fog);
    this.hemi = new HemisphereLight(p.hemiSky, p.hemiGround, 1.0 * LIGHT_SCALE);
    this.hemi.name = HEMI_NAME;
    this.sun = new DirectionalLight(p.sunColor, p.sunIntensity * LIGHT_SCALE);
    this.sun.name = SUN_NAME;
    const sh = this.sun.shadow;
    sh.bias = -0.0004; sh.normalBias = 0.03;
    sh.camera.near = 1; sh.camera.far = 140;
    sh.camera.left = -24; sh.camera.right = 24; sh.camera.top = 24; sh.camera.bottom = -24;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.applyQuality(q);
  }

  applyQuality(q: QualityTier): void {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP[q]));
    const size = SHADOW_MAP[q];
    this.renderer.shadowMap.enabled = size > 0;
    this.sun.castShadow = size > 0;
    if (size > 0) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.radius = SHADOW_RADIUS[q];
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  palette(area: AreaId, blend: AreaBlend | null): PaletteSample {
    return this.paletteSource ? this.paletteSource(area, blend) : GOLDEN;
  }

  canvasTexture(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): Texture {
    const hit = this.textures.get(key);
    if (hit) return hit.tex;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d');
    if (c) draw(c);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    this.textures.set(key, { tex, draw, canvas });
    return tex;
  }

  /** Context restore: redraw every canvas texture from its callback (TECH §8.10). */
  redrawTextures(): void {
    for (const e of this.textures.values()) {
      const c = e.canvas.getContext('2d');
      if (c) { c.clearRect(0, 0, e.canvas.width, e.canvas.height); e.draw(c); }
      e.tex.needsUpdate = true;
    }
  }
}

export function createGfxImpl(canvas: HTMLCanvasElement, q: QualityTier): GfxContext {
  return new Gfx(canvas, q);
}

/** Changes the quality tier at runtime (DPR cap and shadows; MSAA stays as created). */
export function setGfxQuality(ctx: GfxContext, q: QualityTier): void {
  if (ctx instanceof Gfx) ctx.applyQuality(q);
  else ctx.quality = q;
}
export function redrawCanvasTextures(ctx: GfxContext): void {
  if (ctx instanceof Gfx) ctx.redrawTextures();
}
/** Routes `ctx.palette()` to a preset sampler (WA, W2a: world/render/palette.ts; DESIGN §22 keeps presets there).
 *  The sampler may return the same object every call (read it, don't keep it). */
export function setPaletteSource(ctx: GfxContext, f: ((area: AreaId, blend: AreaBlend | null) => PaletteSample) | null): void {
  if (ctx instanceof Gfx) ctx.paletteSource = f;
}
export function getHemi(ctx: GfxContext): HemisphereLight | null {
  return ctx instanceof Gfx ? ctx.hemi : (ctx.scene.getObjectByName(HEMI_NAME) as HemisphereLight | undefined) ?? null;
}
export function getSun(ctx: GfxContext): DirectionalLight | null {
  return ctx instanceof Gfx ? ctx.sun : (ctx.scene.getObjectByName(SUN_NAME) as DirectionalLight | undefined) ?? null;
}
