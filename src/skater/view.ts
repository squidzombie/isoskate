// skater/view.ts: the SkaterView (TECH §4.6, §8.5). One rigid-skinned body mesh plus its outline twin sharing the
// skeleton; the board (deck + trucks + wheels) on the board-pivot bone and the helmet on the head's socket, each with
// an outline twin. 6 draw calls (8 with the Fishbowl's glass and goldfish), +3 in the shadow pass.
//
// Run mode: positioned from the interpolated sim state (origin rebasing, gfx/space.ts) and animated from the
// RenderFrame's SkaterPose. Showcase mode (Locker / Shop turntable): the same rig, facing the menu camera at
// turntable 0, with a slow idle, a trick-preview loop and a board display whenever the board changes.
//
// A loadout switch never compiles a shader: every material (toon and outline per part, the Fishbowl's glass) and
// every canvas texture (atlas, board, decal: one per view, redrawn in place) lives as long as the view, so a switch
// only rebuilds geometry and re-uploads the changed canvas. The glass program is compiled at construction.
import {
  BufferGeometry, type Camera, Color, Group, Matrix4, Mesh, type MeshToonMaterial, type Object3D, PerspectiveCamera,
  SkinnedMesh, type Texture, Vector2, Vector3, type WebGLRenderer,
} from 'three';
import { DEFAULT_LOADOUT } from '../content';
import type { BoardLook, HelmetLook, Loadout, SkaterLook } from '../core/cosmetics';
import { AREA_ORDER, type CrashCause } from '../core/ids';
import { clamp, lerp } from '../core/math';
import { Sfc32 } from '../core/rng';
import type { GameEvent } from '../core/events';
import type { GfxContext, RenderFrame, SkaterPose, SkaterView } from '../core/view';
import type { AreaBlend } from '../core/world';
import { originOf, sharedUniforms } from '../gfx';
import { Animator, type AnimInput, type AnimStyle } from './animator';
import { buildBoard } from './board';
import { buildBody } from './body';
import { buildHelmet } from './helmet';
import { glassMaterial, newUniforms, outlineMaterial, toonMaterial, toonRamp, type SkaterUniforms } from './materials';
import type { PartBuilder } from './parts';
import { applyRest, createRig, rigDims, type Rig, type RigDims } from './rig';
import { BLINK, FX, OUTLINE, POSE, SHADE, SHOWCASE, TEX } from './skater.config';
import { showcasePose } from './showcase';
import {
  BOARD_ATLAS_H, DECAL_H, DECAL_W, DECK_W, drawBoardAtlas, drawFace, drawHelmetDecal, drawSkaterAtlas,
} from './textures';

const DEG = Math.PI / 180;
let viewSeq = 0;
type Ctx2D = CanvasRenderingContext2D;
type OutlineMat = ReturnType<typeof outlineMaterial>;
type Built = ReturnType<PartBuilder['build']>;

/** One drawn part: its mesh and outline twin, their long-lived materials and canvas texture. */
interface Part { mesh: Mesh; outline: Mesh; mat: MeshToonMaterial; omat: OutlineMat; tex: Texture; tris: number; outlineTris: number }

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

const canvasOf = (t: Texture): Ctx2D | null => (t.image as HTMLCanvasElement | undefined)?.getContext?.('2d') ?? null;
const BIND = new Matrix4();
const INK = new Color(OUTLINE.color), NIGHT_INK = new Color(OUTLINE.nightColor);
const RIM = new Color(SHADE.rimColor), NIGHT_RIM = new Color(SHADE.nightRimColor);

export interface SkaterStats { drawCalls: number; tris: number; switchMs: number; parts: { body: number; board: number; helmet: number } }

export class SkaterViewImpl implements SkaterView {
  readonly object3d = new Group();
  /** Showcase turntable (and the preview hop). */
  readonly turn = new Group();
  readonly rig: Rig = createRig();
  readonly anim = new Animator();
  private readonly id = ++viewSeq;
  private readonly uni = { body: newUniforms(), board: newUniforms(), helmet: newUniforms() };
  private readonly body: Part;
  private readonly board: Part;
  private readonly helmet: Part;
  private readonly glass: Mesh;
  private readonly fish: Mesh;
  private loadout: Loadout = DEFAULT_LOADOUT;
  private keys = { skater: '', board: '', helmet: '' };
  private dims: RigDims = rigDims({ heightScale: 1, build: 'regular', kind: 'human' });
  private style: AnimStyle = { stance: 'regular', upright: false, dims: this.dims, hemSway: false, waves: false };
  private mode: 'run' | 'showcase' = 'run';
  private yawDeg = 0;
  private showT = 0;
  private displayLeft = 0;
  private blinkRng = new Sfc32(0xb11c + this.id);
  private nextBlink = 3;
  private blinkLeft = 0;
  private robotFace = 0;
  private dusk = 0;
  private sunT = 0;
  private crashCause: CrashCause | null = null;
  private readonly input: AnimInput = { dt: 0, pose: showcasePose(0).pose, speed: 0, landed: 0, perfect: false, crashCause: null, display: 0 };
  private readonly ink = new Color(OUTLINE.color);
  /** Milliseconds the last setLoadout took (budget: BUDGET.switchMs). */
  lastSwitchMs = 0;

  constructor(private readonly ctx: GfxContext) {
    this.object3d.name = 'skater';
    // The crash desaturation follows the world's (DESIGN §18.8: one shared material uniform; wired @G1).
    const desat = sharedUniforms(ctx).uDesat;
    for (const u of [this.uni.body, this.uni.board, this.uni.helmet]) u.uDesat = desat;
    this.object3d.add(this.turn);
    this.turn.add(this.rig.bone.root);
    // One canvas per slot per view, redrawn in place on a switch. The draw callbacks read the current look, so a
    // context restore (gfx redraws every canvas texture, TECH §8.10) redraws what is on screen.
    const atlas = ctx.canvasTexture(`sk-atlas:${this.id}`, TEX.atlas, TEX.atlas, (c) => this.drawAtlas(c));
    const boardTex = ctx.canvasTexture(`sk-board:${this.id}`, DECK_W, BOARD_ATLAS_H, (c) => this.drawBoard(c));
    boardTex.anisotropy = 4;
    const decal = ctx.canvasTexture(`sk-decal:${this.id}`, DECAL_W, DECAL_H, (c) => this.drawDecal(c));
    this.body = this.makePart('skater-body', atlas, this.uni.body, true, this.object3d);
    this.board = this.makePart('skater-board', boardTex, this.uni.board, false, this.rig.bone.board);
    this.helmet = this.makePart('skater-helmet', decal, this.uni.helmet, false, this.rig.bone.helmet);
    // The Fishbowl's glass (transparent: its own program) and goldfish (the helmet material), hidden until worn.
    this.glass = new Mesh(new BufferGeometry(), glassMaterial(this.uni.helmet, 0xffffff, 0.35));
    this.glass.name = 'helmet-glass'; this.glass.renderOrder = 2; this.glass.castShadow = false; this.glass.visible = false;
    this.glass.frustumCulled = false;
    this.fish = new Mesh(new BufferGeometry(), this.helmet.mat);
    this.fish.name = 'helmet-fish'; this.fish.castShadow = false; this.fish.visible = false; this.fish.frustumCulled = false;
    this.rig.bone.helmet.add(this.glass, this.fish);
    this.setLoadout(defaultLoadout());
    this.precompile();
  }

  // ── SkaterView ──────────────────────────────────────────────────────────────────────────────────────────────
  setLoadout(l: Loadout): void {
    const t0 = now();
    const headVisible = l.helmet.shell === 'bubble';
    const kS = JSON.stringify(l.skater) + headVisible, kB = JSON.stringify(l.board), kH = JSON.stringify(l.helmet);
    const first = this.keys.board === '';
    this.loadout = l;
    if (kS !== this.keys.skater) this.setSkater(l.skater, headVisible);
    if (kB !== this.keys.board) {
      this.setBoard(l.board);
      // Locker / Shop: a new board is shown graphic-out before the rider hops back on.
      if (this.mode === 'showcase' && !first) this.displayLeft = SHOWCASE.display.dur;
    }
    if (kH !== this.keys.helmet) this.setHelmet(l.helmet);
    this.keys = { skater: kS, board: kB, helmet: kH };
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
      if (e.t === 'land') { landed = Math.max(landed, clamp(LI.base + e.dropH * LI.perDrop, LI.min, LI.max)); perfect ||= e.quality === 'perfect'; }
      this.onEvent(e);
    }
    const inp = this.input;
    inp.dt = dt;
    if (this.mode === 'showcase') {
      // Board display: the clock holds at the idle start, then resumes just before a kickflip preview.
      if (this.displayLeft > 0) {
        this.displayLeft -= dt;
        this.showT = this.displayLeft > 0 ? 0 : SHOWCASE.display.afterT;
      }
      const prevT = this.showT;
      if (this.displayLeft <= 0) this.showT += dt;
      const sp = showcasePose(this.showT, prevT);
      // Goofy riders stand turned 180° on the board: turn the rig so every rider faces the menu camera at yaw 0.
      const goofy = this.style.stance === 'goofy' ? 180 : 0;
      this.turn.rotation.set(0, (SHOWCASE.facingDeg + goofy + this.yawDeg + SHOWCASE.idleSpin * this.showT) * DEG, 0);
      this.turn.position.set(0, sp.hop, 0);
      inp.pose = sp.pose; inp.speed = 0; inp.landed = sp.landed; inp.perfect = false; inp.crashCause = null;
      inp.display = this.displayLeft > 0 ? 1 : 0;
    } else {
      this.turn.rotation.set(0, 0, 0);
      this.turn.position.set(0, 0, 0);
      if (!f.pose.crash) this.crashCause = null;
      inp.pose = f.pose; inp.speed = f.speed; inp.landed = landed; inp.perfect = perfect;
      inp.crashCause = f.cur.crash?.cause ?? this.crashCause; inp.display = 0;
    }
    this.anim.update(this.rig, this.style, inp);
    this.tickFx(dt);
  }

  setMode(m: 'run' | 'showcase'): void {
    if (m === this.mode) return;
    this.mode = m;
    this.showT = 0;
    this.displayLeft = 0;
    this.anim.snap();
  }

  setTurntable(yawDeg: number): void { this.yawDeg = Number.isFinite(yawDeg) ? yawDeg : 0; }

  rebuildGPU(): void {
    toonRamp().needsUpdate = true;
    this.redrawAtlas(); this.redrawBoard(); this.redrawDecal();
  }

  // ── extras (tools, contact sheets, tests) ───────────────────────────────────────────────────────────────────
  /** Snap the springs to the next pose (contact sheets, a new run). */
  snap(): void { this.anim.snap(); }
  /** Sets the showcase clock (deterministic contact sheets). */
  setShowcaseTime(t: number): void { this.showT = t; }
  /** Shows the current board graphic-out for `sec` seconds (showcase; also starts on every board change there). */
  showBoard(sec: number = SHOWCASE.display.dur): void { if (this.mode === 'showcase') this.displayLeft = Math.max(0, sec); }
  get currentMode(): 'run' | 'showcase' { return this.mode; }
  /** Draw calls, triangles (outline twins included) and the last loadout switch time. */
  stats(): SkaterStats {
    let calls = 0, tris = 0;
    for (const t of [this.body, this.board, this.helmet]) { calls += 2; tris += t.tris + t.outlineTris; }
    let extra = 0;
    for (const m of [this.glass, this.fish]) if (m.visible) { calls++; extra += m.geometry.getAttribute('position').count / 3; }
    tris += extra;
    return {
      drawCalls: calls, tris, switchMs: this.lastSwitchMs,
      parts: { body: this.body.tris + this.body.outlineTris, board: this.board.tris + this.board.outlineTris,
        helmet: this.helmet.tris + this.helmet.outlineTris + extra },
    };
  }
  /** Every mesh the skater draws (tests). */
  meshes(): Mesh[] {
    const out: Mesh[] = [];
    this.object3d.traverse((o) => { if ((o as Mesh).isMesh && o.visible) out.push(o as Mesh); });
    return out;
  }
  /** Every material the view owns (tests: a switch must never replace one). */
  materials(): readonly unknown[] {
    return [this.body.mat, this.body.omat, this.board.mat, this.board.omat, this.helmet.mat, this.helmet.omat, this.glass.material, this.fish.material];
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────────────────────────
  private makePart(name: string, tex: Texture, u: SkaterUniforms, skinned: boolean, parent: Object3D): Part {
    const mat = toonMaterial(u, { map: tex }), omat = outlineMaterial(sharedUniforms(this.ctx).uDesat);
    let mesh: Mesh, outline: Mesh;
    if (skinned) {
      const sm = new SkinnedMesh(new BufferGeometry(), mat), so = new SkinnedMesh(new BufferGeometry(), omat);
      sm.bind(this.rig.skeleton, BIND); so.bind(this.rig.skeleton, BIND);
      mesh = sm; outline = so;
    } else { mesh = new Mesh(new BufferGeometry(), mat); outline = new Mesh(new BufferGeometry(), omat); }
    mesh.name = name; outline.name = `${name}-outline`;
    mesh.frustumCulled = false; outline.frustumCulled = false;
    mesh.castShadow = true; mesh.receiveShadow = false;
    outline.castShadow = false; outline.receiveShadow = false;
    outline.onBeforeRender = (renderer, _scene, camera) => {
      omat.userData.uniforms.uOutlineW.value = outlineWidth(renderer, camera, this.object3d);
    };
    parent.add(mesh, outline);
    return { mesh, outline, mat, omat, tex, tris: 0, outlineTris: 0 };
  }

  /** Swaps a part's geometry (the materials stay). */
  private setGeometry(p: Part, built: Built): void {
    const old = p.mesh.geometry, oldO = p.outline.geometry;
    p.mesh.geometry = built.geometry;
    p.outline.geometry = outlineGeometry(built.geometry, built.outlineVerts);
    oldO.dispose(); old.dispose();
    p.tris = built.tris; p.outlineTris = built.outlineVerts / 3;
  }

  private setExtra(m: Mesh, g: BufferGeometry | null): void {
    const old = m.geometry;
    m.geometry = g ?? new BufferGeometry();
    m.visible = g !== null;
    old.dispose();
  }

  /** Compiles every skater program (the hidden glass included) against the scene's lights, so the first Fishbowl
   *  preview never stalls on a shader compile. No-op without a real renderer (unit tests). */
  private precompile(): void {
    const r = this.ctx.renderer as Partial<WebGLRenderer>;
    if (typeof r.compile !== 'function') return;
    try { r.compile(this.object3d, PRECOMPILE_CAMERA, this.ctx.scene); } catch { /* headless or lost context */ }
  }

  private redrawAtlas(): void { const c = canvasOf(this.body.tex); if (c) { this.drawAtlas(c); this.body.tex.needsUpdate = true; } }
  private redrawBoard(): void { const c = canvasOf(this.board.tex); if (c) { this.drawBoard(c); this.board.tex.needsUpdate = true; } }
  private redrawDecal(): void { const c = canvasOf(this.helmet.tex); if (c) { this.drawDecal(c); this.helmet.tex.needsUpdate = true; } }
  private drawAtlas(c: Ctx2D): void { drawSkaterAtlas(c, this.loadout.skater, { blink: this.blinkLeft > 0, robotFace: this.robotFace }); }
  private drawBoard(c: Ctx2D): void {
    const b = this.loadout.board;
    drawBoardAtlas(c, b, b.animated && this.mode === 'showcase' ? (this.anim.time % FX.sunLoop) / FX.sunLoop : 0.5);
  }
  private drawDecal(c: Ctx2D): void { drawHelmetDecal(c, this.loadout.helmet); }

  /** Kettle's screen face reacts to tricks, sketchy landings and crashes. */
  private onEvent(e: GameEvent): void {
    if (e.t === 'crash') this.crashCause = e.cause;
    if (!this.loadout.skater.fx.includes('screenFace')) return;
    switch (e.t) {
      case 'land': if (e.quality === 'sketchy') { this.robotFace = 3; this.redrawFace(); } break;
      case 'trickScored': case 'flipStart': case 'spinStart': case 'grindStart':
        this.robotFace = (this.robotFace + 1) % 12; this.redrawFace();
        break;
      case 'crash': this.robotFace = 9; this.redrawFace(); break;
      default: break;
    }
  }

  private tickFx(dt: number): void {
    // Blink every 3–6 s.
    if (this.blinkLeft > 0) { this.blinkLeft -= dt; if (this.blinkLeft <= 0) this.redrawFace(); }
    else { this.nextBlink -= dt; if (this.nextBlink <= 0) { this.blinkLeft = BLINK.dur; this.nextBlink = this.blinkRng.range(BLINK.min, BLINK.max); this.redrawFace(); } }
    const t = this.anim.time, sk = this.loadout.skater, hm = this.loadout.helmet, U = this.uni;
    U.body.uTime.value = t; U.board.uTime.value = t; U.helmet.uTime.value = t;
    // Blue hour: the ink line lifts toward a pale lilac and the rim turns to the cool moon fill, so dark outfits keep
    // an edge on Neon's dark road (DESIGN §18.4 value hierarchy).
    const night = smoothstep(OUTLINE.nightFrom, 1, this.dusk);
    this.ink.copy(INK).lerp(NIGHT_INK, night);
    const rimS = lerp(SHADE.rimStrength, SHADE.nightRimStrength, night);
    for (const p of PARTS) {
      this[p].omat.color.copy(this.ink);
      U[p].uRimColor.value.copy(RIM).lerp(NIGHT_RIM, night);
      U[p].uRimStrength.value = rimS;
    }
    // Vesper's reflective strips brighten toward dusk; Aki's seams cycle magenta ↔ cyan at 0.5 Hz.
    U.body.uEmitGain.value = sk.fx.includes('reflectiveStrips') ? lerp(FX.stripMin, FX.stripMax, this.dusk) : 1;
    if (sk.fx.includes('lightSeams')) {
      const u = 0.5 + 0.5 * Math.sin(2 * Math.PI * FX.seamHz * t);
      U.body.uFxColor.value.setHex(FX.seamA).lerp(tmpColor.setHex(FX.seamB), u).multiplyScalar(FX.seamGain);
    }
    U.helmet.uEmitGain.value = hm.fx === 'emissiveDusk' ? lerp(FX.lanternMin, FX.lanternMax, this.dusk) : 1;
    if (this.fish.visible) this.fish.rotation.y = t * 2 * Math.PI * FX.fishOrbitHz;
    // Glide Ring's animated canvas: the sun rises and sets on a 6 s loop (showcase only; static in runs).
    if (this.loadout.board.animated && this.mode === 'showcase') {
      this.sunT += dt;
      if (this.sunT > FX.sunRedraw) { this.sunT = 0; this.redrawBoard(); }
    }
  }

  private redrawFace(): void {
    const c = canvasOf(this.body.tex);
    if (!c) return;
    drawFace(c, this.loadout.skater, { blink: this.blinkLeft > 0, robotFace: this.robotFace });
    this.body.tex.needsUpdate = true;
  }

  private setSkater(look: SkaterLook, headVisible: boolean): void {
    this.dims = rigDims(look);
    applyRest(this.rig, this.dims);
    this.style = {
      stance: look.stance, upright: look.poseStyle === 'upright', dims: this.dims,
      hemSway: look.fx.includes('coatSway'), waves: look.poseStyle === 'upright',
    };
    // The whole atlas, face included (with the current blink and screen face: never a stale closed eye).
    this.redrawAtlas();
    this.setGeometry(this.body, buildBody(look, this.dims, { headVisible }).build());
  }

  private setBoard(look: BoardLook): void {
    this.redrawBoard();
    this.uni.board.uHolo.value = look.finish === 'holo' || look.finish === 'animHue' ? 1 : 0;
    this.setGeometry(this.board, buildBoard(look).build());
  }

  private setHelmet(look: HelmetLook): void {
    this.redrawDecal();
    const h = buildHelmet(look);
    this.setGeometry(this.helmet, h.main.build());
    this.setExtra(this.glass, h.glass ? h.glass.build().geometry : null);
    (this.glass.material as MeshToonMaterial).opacity = look.opacity ?? 0.35;
    this.setExtra(this.fish, h.fish ? h.fish.build().geometry : null);
  }
}

const PARTS = ['body', 'board', 'helmet'] as const;
const LI = POSE.land.impulse;
const PRECOMPILE_CAMERA = new PerspectiveCamera();
const smoothstep = (a: number, b: number, x: number): number => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const tmpColor = new Color();
function defaultLoadout(): Loadout { return DEFAULT_LOADOUT; }

/** 0 at golden hour (Downtown) → 1 at blue hour (Neon), following the area order and the gateway blends. */
export function duskOf(area: RenderFrame['area'], blend: AreaBlend | null): number {
  const i = (a: RenderFrame['area']) => Math.max(0, AREA_ORDER.indexOf(a)) / (AREA_ORDER.length - 1);
  return blend ? lerp(i(blend.from), i(blend.to), clamp(blend.u, 0, 1)) : i(area);
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

export type { SkaterPose };
