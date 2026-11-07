// skater/hero.ts: the equipped board on its own, for the Title's space scene (the floating "moon"): the same deck
// geometry, graphic, grip, trucks and wheels as the rider's board (board.ts, textures.ts), the same toon and ink
// outline materials, but its own canvas, uniforms and outline width (a big board on screen gets a ~2 px line, not the
// run's 0.025 m). Two draw calls. setLook() rebuilds only when the look changes; animated decks (Glide Ring) redraw
// their canvas on the showcase cadence.
import { BufferGeometry, Group, Mesh, type Camera, type Object3D, type Texture, Vector2, Vector3, type WebGLRenderer } from 'three';
import type { BoardLook } from '../core/cosmetics';
import { clamp } from '../core/math';
import type { GfxContext } from '../core/view';
import { buildBoard } from './board';
import { newUniforms, outlineMaterial, toonMaterial } from './materials';
import { FX } from './skater.config';
import { BOARD_ATLAS_H, DECK_W, drawBoardAtlas } from './textures';

export interface HeroBoard {
  /** The deck centre at the origin, the long axis along z (nose toward −z), grip up (+y). */
  readonly object3d: Object3D;
  setLook(look: BoardLook): void;
  /** Animated decks and the shader clock. */
  update(dt: number): void;
  /** Context restore: redraw the canvas. */
  rebuildGPU(): void;
  stats(): { drawCalls: number; tris: number };
}

const v2 = new Vector2(), v3 = new Vector3(), v4 = new Vector3();
const DEG = Math.PI / 180;

class HeroBoardImpl implements HeroBoard {
  readonly object3d = new Group();
  private readonly uni = newUniforms();
  private readonly tex: Texture;
  private readonly mesh: Mesh;
  private readonly outline: Mesh;
  private look: BoardLook | null = null;
  private key = '';
  private tris = 0;
  private time = 0;
  private sunT = 0;

  constructor(ctx: GfxContext, private readonly outlinePx: number) {
    this.object3d.name = 'hero-board';
    this.tex = ctx.canvasTexture('sk-hero-board', DECK_W, BOARD_ATLAS_H, (c) => { if (this.look) drawBoardAtlas(c, this.look, this.phase()); });
    this.tex.anisotropy = 8;
    const mat = toonMaterial(this.uni, { map: this.tex }), omat = outlineMaterial({ value: 0 });
    this.mesh = new Mesh(new BufferGeometry(), mat);
    this.outline = new Mesh(new BufferGeometry(), omat);
    this.mesh.name = 'hero-board-deck'; this.outline.name = 'hero-board-outline';
    this.mesh.frustumCulled = false; this.outline.frustumCulled = false;
    this.outline.onBeforeRender = (renderer, _scene, camera) => { omat.userData.uniforms.uOutlineW.value = this.width(renderer, camera); };
    this.object3d.add(this.mesh, this.outline);
  }

  setLook(look: BoardLook): void {
    const k = JSON.stringify(look);
    if (k === this.key) return;
    this.key = k; this.look = look;
    this.uni.uHolo.value = look.finish === 'holo' || look.finish === 'animHue' ? 1 : 0;
    this.redraw();
    const b = buildBoard(look).build();
    const old = this.mesh.geometry, oldO = this.outline.geometry;
    this.mesh.geometry = b.geometry;
    const o = new BufferGeometry();
    for (const n of ['position', 'normal', 'aOutline'] as const) { const a = b.geometry.getAttribute(n); if (a) o.setAttribute(n, a); }
    o.setDrawRange(0, b.outlineVerts);
    this.outline.geometry = o;
    old.dispose(); oldO.dispose();
    this.tris = b.tris + b.outlineVerts / 3;
  }

  update(dt: number): void {
    this.time += dt;
    this.uni.uTime.value = this.time;
    if (this.look?.animated) { this.sunT += dt; if (this.sunT > FX.sunRedraw) { this.sunT = 0; this.redraw(); } }
  }

  rebuildGPU(): void { this.redraw(); }
  stats() { return { drawCalls: 2, tris: this.tris }; }

  private phase(): number { return this.look?.animated ? (this.time % FX.sunLoop) / FX.sunLoop : 0.5; }
  private redraw(): void {
    const c = (this.tex.image as HTMLCanvasElement | undefined)?.getContext?.('2d');
    if (!c || !this.look) return;
    drawBoardAtlas(c, this.look, this.phase());
    this.tex.needsUpdate = true;
  }
  /** Outline width in model units for `outlinePx` CSS-ish pixels at the board's distance (perspective cameras). */
  private width(renderer: WebGLRenderer, camera: Camera): number {
    const h = Math.max(1, renderer.getSize(v2).y);
    const c = camera as Camera & { fov?: number; isPerspectiveCamera?: boolean };
    this.object3d.getWorldPosition(v3);
    const s = this.object3d.getWorldScale(v4).x || 1;
    const d = v3.distanceTo(camera.getWorldPosition(v4));
    const wpp = c.isPerspectiveCamera ? (2 * d * Math.tan(((c.fov ?? 40) * DEG) / 2)) / h : 0.002;
    return clamp((this.outlinePx * wpp) / s, 0.003, 0.03);
  }
}

/** The equipped board as a standalone model (Title space scene). `outlinePx`: ink line width on screen. */
export function createHeroBoard(ctx: GfxContext, o: { outlinePx?: number } = {}): HeroBoard {
  return new HeroBoardImpl(ctx, o.outlinePx ?? 2.2);
}
