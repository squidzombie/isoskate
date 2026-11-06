// world/render/camera.ts: the run camera rig with the full framing solver (TECH §8.3, DESIGN §8).
// The solver is pure and unit-tested (tests/unit/render/camera.test.ts); its maths and guarantees are frozen with the
// test table. W2a adds: shake and the Perfect zoom punch driven by GameEvents (DESIGN §8 table, SHAKE in
// render.config.ts; off with reduced motion), and the menu cameras: the static Title diorama ('title') and the
// Locker / Shop ('locker'), low perspective cameras (FOV 35°, 1.4 m high) that also see the sky layer (sky.ts).
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { clamp, lerp } from '../../core/math';
import { CAMERA, CORRIDOR_HALF, DT, LOOKAHEAD_TARGET, speedAt } from '../../core/tuning';
import type { CameraMode, CameraRig, RenderFrame, Viewport } from '../../core/view';
import { originOf } from '../../gfx';
import { SHAKE } from './render.config';

/** What the rig did this frame, for the WorldView of the same module (sky layer, haze mode, hidden camera-side decor).
 *  The world view updates before the rig in a frame, so it reads the previous frame's state (one frame of lag). */
export const RIG_STATE = { mode: 'run' as CameraMode, yawDeg: 0, hudTop: 0.066, menu: false, H: 20.8, camera: null as OrthographicCamera | PerspectiveCamera | null };
/** Layer of the sky dome, clouds, birds and skyline strips (sky.ts): only the menu cameras enable it. */
const SKY_LAYER = 1;

const DEG = Math.PI / 180;
const SIN_T = Math.sin(CAMERA.pitchDeg * DEG), COS_T = Math.cos(CAMERA.pitchDeg * DEG);
const HALF_W = CORRIDOR_HALF + CAMERA.marginX;        // 4.8 m: corridor plus margin
const CAM_DIST = 60;

export interface Framing { H: number; yawDeg: number; lookAheadSec: number; anchorY: number; hudTop: number; rotate: boolean;
  /** Screen-X centre of the required region relative to the anchor, m (0 in portrait). */ xCentre: number }

export function yawForAspect(aspect: number): number {
  const u = clamp((aspect - CAMERA.yawAspect0) / (CAMERA.yawAspect1 - CAMERA.yawAspect0), 0, 1);
  return lerp(CAMERA.yawMinDeg, CAMERA.yawMaxDeg, u);
}
export const hudTopOf = (vp: Viewport) => (vp.safeTop + CAMERA.hudPx) / vp.hCss;
export const rotateFor = (vp: Viewport) => vp.coarse && Math.min(vp.wCss, vp.hCss) < 500 && vp.aspect > 1;

/** Screen coordinates (m) of a ground point relative to the skater's ground point. */
const screenX = (s: number, x: number, cosP: number, sinP: number) => x * cosP + s * sinP;
const screenY = (s: number, x: number, cosP: number, sinP: number) => s * SIN_T * cosP - x * sinP * SIN_T;

/** Full-corridor-width look-ahead (s) achieved with ortho height H, measured below the HUD band. */
export function lookAheadFor(H: number, speed: number, vp: Viewport, yawDeg: number, xCentre: number): number {
  const cosP = Math.cos(yawDeg * DEG), sinP = Math.sin(yawDeg * DEG);
  const hudTop = hudTopOf(vp);
  // Vertical: the corner with the largest Y at a given s is x = −HALF_W.
  const yRoom = (CAMERA.anchorFromTop - hudTop) * H - CAMERA.headroom;
  let sMax = (yRoom - HALF_W * sinP * SIN_T) / (cosP * SIN_T);
  if (sinP > 1e-9) {
    // Horizontal: the corner with the largest X at a given s is x = +HALF_W.
    const right = xCentre + (vp.aspect * H) / 2;
    sMax = Math.min(sMax, (right - HALF_W * cosP) / sinP);
  }
  return Math.max(0, sMax) / speed;
}

/** Pure framing solver (TECH §8.3). `out` (optional) is filled and returned instead of a new object (the rig's
 *  per-frame call). */
export function solveFraming(speed: number, vp: Viewport, out?: Framing): Framing {
  const yawDeg = yawForAspect(vp.aspect);
  const cosP = Math.cos(yawDeg * DEG), sinP = Math.sin(yawDeg * DEG);
  const hudTop = hudTopOf(vp);
  const L = LOOKAHEAD_TARGET * speed;
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  // The four corners of the required region (s ∈ {−behind, L} × x ∈ {±HALF_W}); scalar code, no per-frame arrays.
  for (let i = 0; i < 4; i++) {
    const s = i < 2 ? -CAMERA.behind : L, x = i & 1 ? HALF_W : -HALF_W;
    const X = screenX(s, x, cosP, sinP), Y = screenY(s, x, cosP, sinP);
    xMin = Math.min(xMin, X); xMax = Math.max(xMax, X); yMin = Math.min(yMin, Y); yMax = Math.max(yMax, Y);
  }
  const H = Math.max(
    (xMax - xMin) / vp.aspect,
    (yMax + CAMERA.headroom) / (CAMERA.anchorFromTop - hudTop),
    -yMin / (1 - CAMERA.anchorFromTop),
  );
  const xCentre = (xMin + xMax) / 2;
  const lookAheadSec = lookAheadFor(H, speed, vp, yawDeg, xCentre), rotate = rotateFor(vp);
  if (!out) return { H, yawDeg, lookAheadSec, anchorY: CAMERA.anchorFromTop, hudTop, rotate, xCentre };
  out.H = H; out.yawDeg = yawDeg; out.lookAheadSec = lookAheadSec; out.anchorY = CAMERA.anchorFromTop; out.hudTop = hudTop;
  out.rotate = rotate; out.xCentre = xCentre;
  return out;
}

/** The run camera rig. Forward follow is rigid; vertical follows the ground height (τ 0.3 s); lateral follows 15%
 *  only when ψ > 0; H eases with τ = 2 s toward the framing for the speed 2 s ahead and never shrinks within a run.
 *  The follow easings run on game time (sim ticks elapsed, or the frame dt if larger), so manual stepping
 *  (`__skate.step(3600)`) frames exactly like real-time play. Shake and punch run on the frame dt. */
/** The M0 Locker / Shop camera (DESIGN §8 "non-run cameras"): a low perspective camera (FOV 35°, 1.4 m high) behind
 *  the skater looking down the street, with the skater's mid-body at 33% from the top (the turntable sits in the top
 *  half, above the item panel). TODO(WA): the Title diorama, sky dome and skyline strips. */
export const LOCKER_CAM = { fovDeg: 35, height: 1.4, dist: 11, targetY: 0.9, anchorFromTop: 0.33 } as const;
/** The static Title diorama camera (DESIGN §8): low, behind and to the right of the idling skater, looking down the
 *  street toward the horizon (the skater sits in the lower third, the sunset sky fills the top). */
export const TITLE_CAM = { fovDeg: 35, height: 1.4, back: 4.6, side: 0.55, lookAhead: 26, lookY: 1.7, lookX: -0.35 } as const;

export class RunCameraRig implements CameraRig {
  readonly runCamera = new OrthographicCamera(-1, 1, 1, -1, 1, 200);
  readonly menuCamera = new PerspectiveCamera(LOCKER_CAM.fovDeg, 1, 0.1, 400);
  /** The camera to render with: the ortho run camera, or the perspective camera in 'locker' mode. */
  get camera(): OrthographicCamera | PerspectiveCamera { return this.mode === 'run' ? this.runCamera : this.menuCamera; }
  private mode: CameraMode = 'run';
  private H = 0;
  private yawDeg = 0;
  private xCentre = 0;
  private groundY = 0;
  private lat = 0;
  private vpW = -1; private vpH = -1; private vpSafe = -1;
  private lastTick = -1;
  private reduced = false;
  private shakeAmp = 0; private shakeDur = 0; private shakeT = 0;
  private punchAmt = 0; private punchDur = 0; private punchT = 0;
  private vp: Viewport = { wCss: 390, hCss: 844, dpr: 1, aspect: 390 / 844, safeTop: 0, safeBottom: 0, coarse: false };
  private readonly target = new Vector3();
  private readonly dir = new Vector3();
  private readonly tmp = new Vector3();
  private originS = 0;
  last: Framing = solveFraming(7, this.vp);
  private readonly want: Framing = solveFraming(7, this.vp);

  constructor() { this.menuCamera.layers.enable(SKY_LAYER); }
  setMode(m: CameraMode): void { this.mode = m; this.lastTick = -1; RIG_STATE.mode = m; RIG_STATE.menu = m !== 'run'; }
  setReducedMotion(on: boolean): void { this.reduced = on; }
  shake(amp: number, dur: number): void { if (!this.reduced && amp >= this.shakeAmp * (1 - this.shakeT / Math.max(1e-6, this.shakeDur))) { this.shakeAmp = amp; this.shakeDur = dur; this.shakeT = 0; } }
  punch(zoomFrac: number, dur: number): void { if (!this.reduced) { this.punchAmt = zoomFrac; this.punchDur = dur; this.punchT = 0; } }
  solve(speed: number, vp: Viewport) {
    const f = solveFraming(speed, vp);
    return { H: f.H, yawDeg: f.yawDeg, lookAheadSec: f.lookAheadSec, anchorY: f.anchorY, hudTop: f.hudTop, rotate: f.rotate };
  }

  update(f: RenderFrame): void {
    const vp = f.viewport;
    this.vp = vp;
    RIG_STATE.mode = this.mode; RIG_STATE.menu = this.mode !== 'run'; RIG_STATE.hudTop = hudTopOf(vp); RIG_STATE.camera = this.camera;
    if (this.mode === 'locker') { this.placeLocker(f); return; }
    if (this.mode === 'title') { this.placeTitle(f); return; }
    this.events(f);
    const dt = Math.max(0, f.dt);
    const vpChanged = vp.wCss !== this.vpW || vp.hCss !== this.vpH || vp.safeTop !== this.vpSafe;
    const lead = Math.max(f.speed, speedAt(f.cur.t + CAMERA.zoomTau));
    const want = solveFraming(lead, vp, this.want);
    const reset = vpChanged || f.cur.tick < this.lastTick || this.lastTick < 0;
    // Game time since the last update: debug steps can advance thousands of ticks between two renders.
    const dtE = reset ? 0 : Math.max(dt, (f.cur.tick - this.lastTick) * DT);
    this.vpW = vp.wCss; this.vpH = vp.hCss; this.vpSafe = vp.safeTop;
    this.lastTick = f.cur.tick;
    const gy = lerp(f.prev.groundY, f.cur.groundY, f.alpha);
    const px = lerp(f.prev.p.x, f.cur.p.x, f.alpha);
    if (reset) {
      this.H = solveFraming(f.speed, vp).H;
      this.groundY = gy;
      this.lat = want.yawDeg > 0 ? CAMERA.latFollow * px : 0;
    } else {
      this.H = Math.max(this.H, this.H + (want.H - this.H) * (1 - Math.exp(-dtE / CAMERA.zoomTau)));
      this.groundY += (gy - this.groundY) * (1 - Math.exp(-dtE / CAMERA.vertTau));
      const latWant = want.yawDeg > 0 ? CAMERA.latFollow * px : 0;
      this.lat += (latWant - this.lat) * (1 - Math.exp(-dtE / 0.4));
    }
    this.yawDeg = want.yawDeg;
    RIG_STATE.yawDeg = want.yawDeg; RIG_STATE.H = this.H;
    this.xCentre = want.xCentre;
    // `last` is updated in place (read it, don't keep it): one framing object per rig, not per frame.
    Object.assign(this.last, want);
    this.last.H = this.H;
    this.last.lookAheadSec = lookAheadFor(this.H, f.speed, vp, want.yawDeg, want.xCentre);

    // Effects (additive, off with reduced motion).
    let zoom = 1, shx = 0, shy = 0;
    if (this.punchT < this.punchDur) { this.punchT += dt; zoom = 1 - this.punchAmt * Math.sin(Math.PI * Math.min(1, this.punchT / this.punchDur)); }
    if (this.shakeT < this.shakeDur) {
      this.shakeT += dt;
      const a = this.shakeAmp * (1 - this.shakeT / this.shakeDur);
      shx = a * Math.sin(this.shakeT * 91.7); shy = a * Math.cos(this.shakeT * 77.3);
    }
    if (this.grinding && !this.reduced) {
      // Continuous grinding jitter (DESIGN §8: 0.01 m).
      this.jitterT += dt;
      shx += SHAKE.grinding * Math.sin(this.jitterT * 63.1); shy += SHAKE.grinding * Math.cos(this.jitterT * 71.9);
    }
    this.place(f.playerS, this.lat, this.groundY, zoom, shx, shy);
  }

  private grinding = false;
  private jitterT = 0;
  /** Shake and punch from this frame's GameEvents (DESIGN §8 table). God-mode crashes are logged, not applied. */
  private events(f: RenderFrame): void {
    for (const e of f.events) {
      if (e.t === 'crash' && !e.god) this.shake(SHAKE.crash.amp, SHAKE.crash.dur);
      else if (e.t === 'land') {
        if (e.dropH >= SHAKE.bigLanding.minDrop) this.shake(SHAKE.bigLanding.amp, SHAKE.bigLanding.dur);
        if (e.quality === 'perfect') this.punch(SHAKE.perfectPunch.zoom, SHAKE.perfectPunch.dur);
      } else if (e.t === 'grindStart') this.shake(SHAKE.grindLock.amp, SHAKE.grindLock.dur);
      else if (e.t === 'runStart') { this.shakeT = this.shakeDur; this.punchT = this.punchDur; }
    }
    this.grinding = !!f.cur.grind && f.cur.mode === 'grind';
  }

  /** Title diorama: behind-right of the idling skater, 1.4 m high, looking down the street toward the horizon. */
  private placeTitle(f: RenderFrame): void {
    const vp = this.vp, cam = this.menuCamera;
    const s = f.playerS, x = lerp(f.prev.p.x, f.cur.p.x, f.alpha), gy = lerp(f.prev.groundY, f.cur.groundY, f.alpha);
    this.originS = originOf(s);
    const z = -(s - this.originS);
    cam.clearViewOffset();
    cam.fov = TITLE_CAM.fovDeg; cam.aspect = vp.wCss / Math.max(1, vp.hCss);
    // Portrait screens frame the rider larger and lower; landscape widens the street view.
    const k = vp.aspect < 1 ? 1 : 1.35;
    cam.position.set(x + TITLE_CAM.side * k, gy + TITLE_CAM.height, z + TITLE_CAM.back * k);
    this.target.set(x + TITLE_CAM.lookX, gy + TITLE_CAM.lookY, z - TITLE_CAM.lookAhead);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    cam.near = 0.1; cam.far = 600;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Positions the ortho camera so the anchor (s, x = lat, y = ground) lands 74% from the top. */
  private place(playerS: number, latX: number, groundY: number, zoom: number, shx: number, shy: number): void {
    const vp = this.vp, H = this.H * zoom;
    this.originS = originOf(playerS);
    const yaw = this.yawDeg * DEG, pitch = CAMERA.pitchDeg * DEG;
    // View direction: pitched down by θ, yawed by ψ so that +s leans toward screen right.
    this.dir.set(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    this.target.set(latX, groundY, -(playerS - this.originS));
    const cam = this.runCamera;
    cam.position.copy(this.target).addScaledVector(this.dir, -CAM_DIST);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    const halfW = (vp.aspect * H) / 2;
    const xc = this.xCentre - latX * Math.cos(yaw);
    cam.left = xc - halfW + shx; cam.right = xc + halfW + shx;
    cam.top = CAMERA.anchorFromTop * H + shy; cam.bottom = -(1 - CAMERA.anchorFromTop) * H + shy;
    cam.near = 1; cam.far = 200;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Locker / Shop: behind the skater at 1.4 m, looking at its mid-body, which lands 33% from the top. */
  private placeLocker(f: RenderFrame): void {
    const vp = this.vp, cam = this.menuCamera;
    const s = f.playerS, x = lerp(f.prev.p.x, f.cur.p.x, f.alpha), gy = lerp(f.prev.groundY, f.cur.groundY, f.alpha);
    this.originS = originOf(s);
    this.target.set(x, gy + LOCKER_CAM.targetY, -(s - this.originS));
    cam.position.set(x, gy + LOCKER_CAM.height, this.target.z + LOCKER_CAM.dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    // A taller virtual frame (1.4 h, FOV over the full frame) whose centre is the target, cropped so the target sits
    // at anchorFromTop.
    const w = vp.wCss, h = vp.hCss, full = 1.4 * h;
    cam.fov = LOCKER_CAM.fovDeg; cam.near = 0.1; cam.far = 600;
    cam.aspect = w / full;
    cam.setViewOffset(w, full, 0, full / 2 - LOCKER_CAM.anchorFromTop * h, w, h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  project(p: { s: number; x: number; y: number }): { x: number; y: number } {
    this.tmp.set(p.x, p.y, -(p.s - this.originS)).project(this.camera);
    return { x: ((this.tmp.x + 1) / 2) * this.vp.wCss, y: ((1 - this.tmp.y) / 2) * this.vp.hCss };
  }

  get cameraMode(): CameraMode { return this.mode; }
}

export function createCameraRigImpl(): CameraRig {
  return new RunCameraRig();
}
