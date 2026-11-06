// world/render/camera.ts: the run camera rig with the full framing solver (TECH §8.3, DESIGN §8).
// The solver is pure and unit-tested (tests/unit/render/camera.test.ts). WA owns this file from W2a
// (shake/punch from events, menu cameras); the solver maths and its guarantees are frozen with the test table.
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { clamp, lerp } from '../../core/math';
import { CAMERA, CORRIDOR_HALF, DT, LOOKAHEAD_TARGET, speedAt } from '../../core/tuning';
import type { CameraMode, CameraRig, RenderFrame, Viewport } from '../../core/view';
import { originOf } from '../../gfx';

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
function screenXY(s: number, x: number, cosP: number, sinP: number): [number, number] {
  return [x * cosP + s * sinP, s * SIN_T * cosP - x * sinP * SIN_T];
}

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

/** Pure framing solver (TECH §8.3). */
export function solveFraming(speed: number, vp: Viewport): Framing {
  const yawDeg = yawForAspect(vp.aspect);
  const cosP = Math.cos(yawDeg * DEG), sinP = Math.sin(yawDeg * DEG);
  const hudTop = hudTopOf(vp);
  const L = LOOKAHEAD_TARGET * speed;
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const s of [-CAMERA.behind, L]) {
    for (const x of [-HALF_W, HALF_W]) {
      const [X, Y] = screenXY(s, x, cosP, sinP);
      xMin = Math.min(xMin, X); xMax = Math.max(xMax, X); yMin = Math.min(yMin, Y); yMax = Math.max(yMax, Y);
    }
  }
  const H = Math.max(
    (xMax - xMin) / vp.aspect,
    (yMax + CAMERA.headroom) / (CAMERA.anchorFromTop - hudTop),
    -yMin / (1 - CAMERA.anchorFromTop),
  );
  const xCentre = (xMin + xMax) / 2;
  return { H, yawDeg, lookAheadSec: lookAheadFor(H, speed, vp, yawDeg, xCentre), anchorY: CAMERA.anchorFromTop, hudTop,
    rotate: rotateFor(vp), xCentre };
}

/** The run camera rig. Forward follow is rigid; vertical follows the ground height (τ 0.3 s); lateral follows 15%
 *  only when ψ > 0; H eases with τ = 2 s toward the framing for the speed 2 s ahead and never shrinks within a run.
 *  The follow easings run on game time (sim ticks elapsed, or the frame dt if larger), so manual stepping
 *  (`__skate.step(3600)`) frames exactly like real-time play. Shake and punch run on the frame dt. */
export class RunCameraRig implements CameraRig {
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 200);
  readonly menuCamera = new PerspectiveCamera(35, 1, 0.1, 400);
  private mode: CameraMode = 'run';
  private H = 0;
  private yawDeg = 0;
  private xCentre = 0;
  private groundY = 0;
  private lat = 0;
  private vpKey = '';
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

  setMode(m: CameraMode): void { this.mode = m; this.lastTick = -1; }
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
    const dt = Math.max(0, f.dt);
    const key = `${vp.wCss}x${vp.hCss}:${vp.safeTop}`;
    const lead = Math.max(f.speed, speedAt(f.cur.t + CAMERA.zoomTau));
    const want = solveFraming(lead, vp);
    const reset = key !== this.vpKey || f.cur.tick < this.lastTick || this.lastTick < 0;
    // Game time since the last update: debug steps can advance thousands of ticks between two renders.
    const dtE = reset ? 0 : Math.max(dt, (f.cur.tick - this.lastTick) * DT);
    this.vpKey = key;
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
    this.xCentre = want.xCentre;
    this.last = { ...want, H: this.H, lookAheadSec: lookAheadFor(this.H, f.speed, vp, want.yawDeg, want.xCentre) };

    // Effects (additive, off with reduced motion).
    let zoom = 1, shx = 0, shy = 0;
    if (this.punchT < this.punchDur) { this.punchT += dt; zoom = 1 - this.punchAmt * Math.sin(Math.PI * Math.min(1, this.punchT / this.punchDur)); }
    if (this.shakeT < this.shakeDur) {
      this.shakeT += dt;
      const a = this.shakeAmp * (1 - this.shakeT / this.shakeDur);
      shx = a * Math.sin(this.shakeT * 91.7); shy = a * Math.cos(this.shakeT * 77.3);
    }
    this.place(f.playerS, this.lat, this.groundY, zoom, shx, shy);
  }

  /** Positions the ortho camera so the anchor (s, x = lat, y = ground) lands 74% from the top. */
  private place(playerS: number, latX: number, groundY: number, zoom: number, shx: number, shy: number): void {
    const vp = this.vp, H = this.H * zoom;
    this.originS = originOf(playerS);
    const yaw = this.yawDeg * DEG, pitch = CAMERA.pitchDeg * DEG;
    // View direction: pitched down by θ, yawed by ψ so that +s leans toward screen right.
    this.dir.set(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    this.target.set(latX, groundY, -(playerS - this.originS));
    const cam = this.camera;
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

  project(p: { s: number; x: number; y: number }): { x: number; y: number } {
    this.tmp.set(p.x, p.y, -(p.s - this.originS)).project(this.camera);
    return { x: ((this.tmp.x + 1) / 2) * this.vp.wCss, y: ((1 - this.tmp.y) / 2) * this.vp.hCss };
  }

  get cameraMode(): CameraMode { return this.mode; }
}

export function createCameraRigImpl(): CameraRig {
  return new RunCameraRig();
}
