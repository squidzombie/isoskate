// skater/view.ts: the SkaterView (TECH §4.6, §8.5). One rigid-skinned body mesh plus its outline twin sharing the
// skeleton; the board (deck + trucks + wheels) on the board-pivot bone and the helmet on the head's socket, each with
// an outline twin. 6 draw calls (8 with the Fishbowl's glass and goldfish), +3 in the shadow pass.
//
// Run mode: positioned from the interpolated sim state (origin rebasing, gfx/space.ts) and animated from the
// RenderFrame's SkaterPose. Showcase mode (Locker / Shop turntable): the same rig, facing the menu camera at
// turntable 0, with a slow idle and a trick-preview loop.
import {
  BufferGeometry, type Camera, Color, Group, Matrix4, Mesh, type Material, type MeshToonMaterial,
  type Object3D, SkinnedMesh, type Texture, Vector2, Vector3, type WebGLRenderer,
} from 'three';
import { DEFAULT_LOADOUT } from '../content';
import type { BoardLook, HelmetLook, Loadout, SkaterLook } from '../core/cosmetics';
import { AREA_ORDER } from '../core/ids';
import { clamp, lerp } from '../core/math';
import { Sfc32 } from '../core/rng';
import type { GameEvent } from '../core/events';
import type { GfxContext, RenderFrame, SkaterPose, SkaterView } from '../core/view';
import type { AreaBlend } from '../core/world';
import { originOf } from '../gfx';
import { Animator, type AnimStyle } from './animator';
import { buildBoard } from './board';
import { buildBody } from './body';
import { buildHelmet } from './helmet';
import { newUniforms, outlineMaterial, toonMaterial, glassMaterial, toonRamp } from './materials';
import type { PartBuilder } from './parts';
import { applyRest, createRig, rigDims, type Rig, type RigDims } from './rig';
import { BLINK, FX, OUTLINE, SHOWCASE, TEX } from './skater.config';
import { showcasePose } from './showcase';
import {
  BOARD_ATLAS_H, DECAL_H, DECAL_W, DECK_W, drawBoardAtlas, drawFace, drawHelmetDecal, drawSkaterAtlas, lookSeed,
} from './textures';

const DEG = Math.PI / 180;
let viewSeq = 0;

interface Twin { mesh: Mesh; outline: Mesh; geo: BufferGeometry; outlineGeo: BufferGeometry; tris: number; outlineTris: number }
type OutlineMat = ReturnType<typeof outlineMaterial>;

const v2 = new Vector2(), v3 = new Vector3(), v4 = new Vector3();
/** Per-frame outline width from the camera: never below OUTLINE.minPx on screen, capped at OUTLINE.maxWidth. */
function outlineWidth(renderer: WebGLRenderer, camera: Camera, obj: Object3D): number {
  const h = Math.max(1, renderer.getSize(v2).y);
  let wpp = 0;
  const c = camera as Camera & { isOrthographicCamera?: boolean; isPerspectiveCamera?: boolean; top?: number; bottom?: number; zoom?: number; fov?: number };
  if (c.isOrthographicCamera) wpp = ((c.top ?? 1) - (c.bottom ?? -1)) / (c.zoom ?? 1) / h;
  else if (c.isPerspectiveCamera) {
    obj.getWorldPosition(v3);
    const d = v3.distanceTo(camera.getWorldPosition(v4));
    wpp = (2 * d * Math.tan(((c.fov ?? 35) * DEG) / 2)) / h;
  }
  return clamp(Math.max(OUTLINE.width, OUTLINE.minPx * wpp), 0, OUTLINE.maxWidth);
}

/** Shares the drawn buffers with a shorter draw range (the outline twin draws only the outlined parts). */
function outlineGeometry(g: BufferGeometry, verts: number): BufferGeometry {
  const o = new BufferGeometry();
  for (const k of ['position', 'normal', 'aOutline', 'skinIndex', 'skinWeight'] as const) {
    const a = g.getAttribute(k);
    if (a) o.setAttribute(k, a);
  }
  o.setDrawRange(0, verts);
  o.boundingSphere = g.boundingSphere;
  return o;
}

export interface SkaterStats { drawCalls: number; tris: number; switchMs: number; parts: { body: number; board: number; helmet: number } }

export class SkaterViewImpl implements SkaterView {
  readonly object3d = new Group();
  /** Showcase turntable (and the preview hop). */
  readonly turn = new Group();
  readonly rig: Rig = createRig();
  readonly anim = new Animator();
  private readonly id = ++viewSeq;
  private readonly uni = { body: newUniforms(), board: newUniforms(), helmet: newUniforms() };
  private body: Twin | null = null;
  private board: Twin | null = null;
  private helmet: Twin | null = null;
  private glass: Mesh | null = null;
  private fish: Mesh | null = null;
  private loadout: Loadout | null = null;
  private keys = { skater: '', board: '', helmet: '', headVisible: false };
  private dims: RigDims = rigDims({ heightScale: 1, build: 'regular', kind: 'human' });
  private style: AnimStyle = { stance: 'regular', upright: false, dims: this.dims, hemSway: false, waves: false };
  private mode: 'run' | 'showcase' = 'run';
  private yawDeg = 0;
  private showT = 0;
  private atlas: Texture | null = null;
  private boardTex: Texture | null = null;
  private decalTex: Texture | null = null;
  private blinkRng = new Sfc32(0xb11c + this.id);
  private nextBlink = 3;
  private blinkLeft = 0;
  private robotFace = 0;
  private dusk = 0;
  private sunT = 0;
  /** Milliseconds the last setLoadout took (budget: BUDGET.switchMs). */
  lastSwitchMs = 0;

  constructor(private readonly ctx: GfxContext) {
    this.object3d.name = 'skater';
    this.object3d.add(this.turn);
    this.turn.add(this.rig.bone.root);
    this.setLoadout(defaultLoadout());
  }

  // ── SkaterView ──────────────────────────────────────────────────────────────────────────────────────────────
  setLoadout(l: Loadout): void {
    const t0 = now();
    const headVisible = l.helmet.shell === 'bubble';
    const kS = JSON.stringify(l.skater) + headVisible, kB = JSON.stringify(l.board), kH = JSON.stringify(l.helmet);
    if (kS !== this.keys.skater) this.setSkater(l.skater, headVisible);
    if (kB !== this.keys.board) this.setBoard(l.board);
    if (kH !== this.keys.helmet) this.setHelmet(l.helmet);
    this.keys = { skater: kS, board: kB, helmet: kH, headVisible };
    this.loadout = l;
    this.anim.snap();
    this.lastSwitchMs = now() - t0;
  }

  update(f: RenderFrame): void {
    const dt = clamp(Number.isFinite(f.dt) ? f.dt : 0, 0, 0.1);
    // Interpolated track position (origin rebasing shared with the world and the camera).
    const s = f.playerS;
    const x = lerp(f.prev.p.x, f.cur.p.x, f.alpha), y = lerp(f.prev.p.y, f.cur.p.y, f.alpha);
    this.object3d.position.set(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, -(s - originOf(s)));
    this.dusk = duskOf(f.area, f.blend);
    let landed = f.pose.landImpulse > 0 ? f.pose.landImpulse : 0, perfect = false;
    for (const e of f.events) {
      if (e.t === 'land') { landed = Math.max(landed, clamp(0.7 + e.dropH * 0.35, 0.5, 1.5)); perfect ||= e.quality === 'perfect'; }
      this.onEvent(e);
    }
    if (this.mode === 'showcase') {
      const prevT = this.showT;
      this.showT += dt;
      const sp = showcasePose(this.showT, prevT);
      // Goofy riders stand turned 180° on the board: turn the rig so every rider faces the menu camera at yaw 0.
      const goofy = this.style.stance === 'goofy' ? 180 : 0;
      this.turn.rotation.set(0, (SHOWCASE.facingDeg + goofy + this.yawDeg + SHOWCASE.idleSpin * this.showT) * DEG, 0);
      this.turn.position.set(0, sp.hop, 0);
      this.anim.update(this.rig, this.style, { dt, pose: sp.pose, speed: 0, landed: sp.landed, perfect: false });
    } else {
      this.turn.rotation.set(0, 0, 0);
      this.turn.position.set(0, 0, 0);
      this.anim.update(this.rig, this.style, { dt, pose: f.pose, speed: f.speed, landed, perfect });
    }
    this.tickFx(dt);
  }

  setMode(m: 'run' | 'showcase'): void {
    if (m === this.mode) return;
    this.mode = m;
    this.showT = 0;
    this.anim.snap();
  }

  setTurntable(yawDeg: number): void { this.yawDeg = Number.isFinite(yawDeg) ? yawDeg : 0; }

  rebuildGPU(): void {
    toonRamp().needsUpdate = true;
    this.redrawFace();
    for (const t of [this.atlas, this.boardTex, this.decalTex]) if (t) t.needsUpdate = true;
  }

  // ── extras (tools, contact sheets, tests) ───────────────────────────────────────────────────────────────────
  /** Snap the springs to the next pose (contact sheets, a new run). */
  snap(): void { this.anim.snap(); }
  /** Sets the showcase clock (deterministic contact sheets). */
  setShowcaseTime(t: number): void { this.showT = t; }
  get currentMode(): 'run' | 'showcase' { return this.mode; }
  /** Draw calls, triangles (outline twins included) and the last loadout switch time. */
  stats(): SkaterStats {
    const tw = [this.body, this.board, this.helmet];
    let calls = 0, tris = 0;
    for (const t of tw) if (t) { calls += 2; tris += t.tris + t.outlineTris; }
    for (const m of [this.glass, this.fish]) if (m) { calls++; tris += (m.geometry.getAttribute('position').count / 3); }
    return {
      drawCalls: calls, tris, switchMs: this.lastSwitchMs,
      parts: { body: (this.body?.tris ?? 0) + (this.body?.outlineTris ?? 0), board: (this.board?.tris ?? 0) + (this.board?.outlineTris ?? 0),
        helmet: (this.helmet?.tris ?? 0) + (this.helmet?.outlineTris ?? 0) + (this.glass ? this.glass.geometry.getAttribute('position').count / 3 : 0)
          + (this.fish ? this.fish.geometry.getAttribute('position').count / 3 : 0) },
    };
  }
  /** Every mesh the skater draws (tests). */
  meshes(): Mesh[] {
    const out: Mesh[] = [];
    this.object3d.traverse((o) => { if ((o as Mesh).isMesh) out.push(o as Mesh); });
    return out;
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────────────────────────
  /** Kettle's screen face reacts to tricks, sketchy landings and crashes. */
  private onEvent(e: GameEvent): void {
    switch (e.t) {
      case 'land': if (e.quality === 'sketchy' && this.loadout?.skater.fx.includes('screenFace')) { this.robotFace = 3; this.redrawFace(); } break;
      case 'trickScored': case 'flipStart': case 'spinStart': case 'grindStart':
        if (this.loadout?.skater.fx.includes('screenFace')) { this.robotFace = (this.robotFace + 1) % 12; this.redrawFace(); }
        break;
      case 'crash': if (this.loadout?.skater.fx.includes('screenFace')) { this.robotFace = 9; this.redrawFace(); } break;
      default: break;
    }
  }

  private tickFx(dt: number): void {
    // Blink every 3–6 s.
    if (this.blinkLeft > 0) { this.blinkLeft -= dt; if (this.blinkLeft <= 0) this.redrawFace(); }
    else { this.nextBlink -= dt; if (this.nextBlink <= 0) { this.blinkLeft = BLINK.dur; this.nextBlink = this.blinkRng.range(BLINK.min, BLINK.max); this.redrawFace(); } }
    const t = this.anim.time, sk = this.loadout?.skater, hm = this.loadout?.helmet;
    for (const u of [this.uni.body, this.uni.board, this.uni.helmet]) u.uTime.value = t;
    // Vesper's reflective strips brighten toward dusk; Aki's seams cycle magenta ↔ cyan at 0.5 Hz.
    this.uni.body.uEmitGain.value = sk?.fx.includes('reflectiveStrips') ? lerp(FX.stripMin, FX.stripMax, this.dusk) : 1;
    if (sk?.fx.includes('lightSeams')) {
      const u = 0.5 + 0.5 * Math.sin(2 * Math.PI * FX.seamHz * t);
      this.uni.body.uFxColor.value.setHex(FX.seamA).lerp(tmpColor.setHex(FX.seamB), u).multiplyScalar(1.6);
    }
    this.uni.helmet.uEmitGain.value = hm?.fx === 'emissiveDusk' ? lerp(FX.lanternMin, FX.lanternMax, this.dusk) : 1;
    if (this.fish) this.fish.rotation.y = t * 2 * Math.PI * FX.fishOrbitHz;
    // Glide Ring's animated canvas: the sun rises and sets on a 6 s loop (showcase only; static in runs).
    const b = this.loadout?.board;
    if (b?.animated && this.mode === 'showcase' && this.boardTex) {
      this.sunT += dt;
      if (this.sunT > 0.12) {
        this.sunT = 0;
        const img = (this.boardTex as Texture & { image?: HTMLCanvasElement }).image;
        const c = img?.getContext?.('2d');
        if (c) { drawBoardAtlas(c, b, (t % FX.sunLoop) / FX.sunLoop); this.boardTex.needsUpdate = true; }
      }
    }
  }

  private redrawFace(): void {
    const sk = this.loadout?.skater, img = (this.atlas as (Texture & { image?: HTMLCanvasElement }) | null)?.image;
    const c = img?.getContext?.('2d');
    if (!sk || !c || !this.atlas) return;
    drawFace(c, sk, { blink: this.blinkLeft > 0, robotFace: this.robotFace });
    this.atlas.needsUpdate = true;
  }

  private setSkater(look: SkaterLook, headVisible: boolean): void {
    this.dims = rigDims(look);
    applyRest(this.rig, this.dims);
    this.style = {
      stance: look.stance, upright: look.poseStyle === 'upright', dims: this.dims,
      hemSway: look.fx.includes('coatSway'), waves: look.poseStyle === 'upright',
    };
    const face = { blink: false, robotFace: this.robotFace };
    const atlas = this.ctx.canvasTexture(`sk-atlas:${this.id}:${lookSeed(look)}`, TEX.atlas, TEX.atlas, (c) => drawSkaterAtlas(c, look, face));
    if (this.atlas && this.atlas !== atlas) this.atlas.dispose();
    this.atlas = atlas;
    const built = buildBody(look, this.dims, { headVisible }).build();
    this.body = this.replaceTwin(this.body, built, toonMaterial(this.uni.body, { map: atlas }), true, this.object3d);
  }

  private setBoard(look: BoardLook): void {
    const key = look.animated ? `sk-board:${this.id}:${lookSeed(look)}` : `sk-board:${lookSeed(look)}`;
    const tex = this.ctx.canvasTexture(key, DECK_W, BOARD_ATLAS_H, (c) => drawBoardAtlas(c, look));
    tex.anisotropy = 4;
    if (this.boardTex && this.boardTex !== tex) this.boardTex.dispose();
    this.boardTex = tex;
    const built = buildBoard(look).build();
    this.board = this.replaceTwin(this.board, built, toonMaterial(this.uni.board, { map: tex, holo: look.finish === 'holo' || look.finish === 'animHue' }), false, this.rig.bone.board);
  }

  private setHelmet(look: HelmetLook): void {
    const tex = this.ctx.canvasTexture(`sk-decal:${lookSeed(look)}`, DECAL_W, DECAL_H, (c) => drawHelmetDecal(c, look));
    if (this.decalTex && this.decalTex !== tex) this.decalTex.dispose();
    this.decalTex = tex;
    const h = buildHelmet(look);
    const socket = this.rig.bone.helmet;
    this.helmet = this.replaceTwin(this.helmet, h.main.build(), toonMaterial(this.uni.helmet, { map: tex }), false, socket);
    for (const m of [this.glass, this.fish]) if (m) { m.removeFromParent(); m.geometry.dispose(); (m.material as Material).dispose(); }
    this.glass = this.fish = null;
    if (h.glass) {
      const g = h.glass.build();
      const mat = glassMaterial(this.uni.helmet, 0xffffff, look.opacity ?? 0.35);
      this.glass = new Mesh(g.geometry, mat);
      this.glass.renderOrder = 2;
      this.glass.name = 'helmet-glass';
      socket.add(this.glass);
    }
    if (h.fish) {
      const g = h.fish.build();
      this.fish = new Mesh(g.geometry, toonMaterial(this.uni.helmet, { map: tex }));
      this.fish.name = 'helmet-fish';
      this.fish.castShadow = false;
      socket.add(this.fish);
    }
  }

  private replaceTwin(old: Twin | null, built: ReturnType<PartBuilder['build']>, mat: MeshToonMaterial, skinned: boolean, parent: Object3D): Twin {
    if (old) {
      old.mesh.removeFromParent(); old.outline.removeFromParent();
      old.geo.dispose(); old.outlineGeo.dispose();
      (old.mesh.material as Material).dispose(); (old.outline.material as Material).dispose();
    }
    const geo = built.geometry, og = outlineGeometry(geo, built.outlineVerts);
    const omat = outlineMaterial();
    let mesh: Mesh, outline: Mesh;
    if (skinned) {
      const id = new Matrix4();
      const sm = new SkinnedMesh(geo, mat), so = new SkinnedMesh(og, omat);
      sm.bind(this.rig.skeleton, id); so.bind(this.rig.skeleton, id);
      mesh = sm; outline = so;
    } else { mesh = new Mesh(geo, mat); outline = new Mesh(og, omat); }
    mesh.name = skinned ? 'skater-body' : parent === this.rig.bone.board ? 'skater-board' : 'skater-helmet';
    outline.name = `${mesh.name}-outline`;
    mesh.frustumCulled = false; outline.frustumCulled = false;
    mesh.castShadow = true; mesh.receiveShadow = false;
    outline.castShadow = false; outline.receiveShadow = false;
    outline.onBeforeRender = (renderer, _scene, camera) => {
      const m = outline.material as OutlineMat;
      m.userData.uniforms.uOutlineW.value = outlineWidth(renderer, camera, this.object3d);
    };
    parent.add(mesh, outline);
    return { mesh, outline, geo, outlineGeo: og, tris: built.tris, outlineTris: built.outlineVerts / 3 };
  }
}

const tmpColor = new Color();
function defaultLoadout(): Loadout { return DEFAULT_LOADOUT; }

/** 0 at golden hour (Downtown) → 1 at blue hour (Neon), following the area order and the gateway blends. */
export function duskOf(area: RenderFrame['area'], blend: AreaBlend | null): number {
  const i = (a: RenderFrame['area']) => Math.max(0, AREA_ORDER.indexOf(a)) / (AREA_ORDER.length - 1);
  return blend ? lerp(i(blend.from), i(blend.to), clamp(blend.u, 0, 1)) : i(area);
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

export type { SkaterPose };
