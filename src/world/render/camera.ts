// world/render/camera.ts: the run camera rig with the full framing solver (TECH §8.3, DESIGN §8).
// The solver is pure and unit-tested (tests/unit/render/camera.test.ts); its maths and guarantees are frozen with the
// test table. Since @cam (DESIGN decision row 67) production runs a telephoto perspective camera (CAMERA.proj
// 'persp': pitch 34°, portrait yaw 9°, window FOV 24°) whose distance D is solved per frame; the ortho solver stays
// for `?debug=1&cam=A` (the pre-@cam camera) and custom ortho specs (camVariants.ts). W2a adds: shake and the Perfect zoom punch driven by GameEvents (DESIGN §8 table, SHAKE in
// render.config.ts; off with reduced motion), and the menu cameras: the static Title diorama ('title') and the
// Locker / Shop ('locker'), low perspective cameras (FOV 35°, 1.4 m high) that also see the sky layer (sky.ts).
import { OrthographicCamera, PerspectiveCamera, Vector3, Vector4 } from 'three';
import { clamp, lerp } from '../../core/math';
import { CAMERA, CORRIDOR_HALF, DT, LOOKAHEAD_TARGET, V_MAX, speedAt } from '../../core/tuning';
import type { CameraMode, CameraRig, RenderFrame, Viewport } from '../../core/view';
import { originOf } from '../../gfx';
import { camVariant, type CamProj, type CamVariant } from './camVariants';
import { OCCLUSION, SHAKE } from './render.config';

/** What the rig did this frame, for the WorldView of the same module (sky layer, haze mode, hidden camera-side decor).
 *  The world view updates before the rig in a frame, so it reads the previous frame's state (one frame of lag). */
export const RIG_STATE = { mode: 'run' as CameraMode, yawDeg: 0, hudTop: 0.066, menu: false, H: 20.8, camera: null as OrthographicCamera | PerspectiveCamera | null,
  /** The track s and origin the camera was last placed for (the world view extrapolates the visible range). */
  playerS: 0, originS: 0, placed: false,
  /** The run pitch, and the shadow box grown to the ground the run camera shows (view.ts). */
  pitchDeg: CAMERA.pitchDeg as number, shadowBox: null as ShadowBox | null };
/** Camera-derived uniforms the world materials (materials.ts) and the lantern layer (layers.ts) read, written by the
 *  rig in its update, i.e. right before the frame renders (no lag). OCCLUSION in render.config.ts has the rules.
 *    uCut     (cutX, ground y, slope, on): camera-side decor (fx `near`) keeps y ≤ ground + (x − cutX)·slope − margin
 *    uCutBand the dark band along the cut (width, darkness, 1/√(1 + slope²), ortho)
 *    uOver    (skater world z, ground y, HUD-line ground distance ahead m, faded alpha): the overhead-span fade
 *    uOverDir (view direction xyz, 1 ortho | 0 perspective): ortho rays are parallel, perspective rays start at the
 *             camera position (three's cameraPosition) */
export const RIG_UNIFORMS = {
  /** Grind-edge stripes (writer.ts stripe): (cream half-width built, ink pad built, cream half-width per metre of view
   *  depth, ink pad per metre of depth); 0 per-depth terms keep the built widths (ortho specs, menus). */
  uEdge: { value: new Vector4(0.035, 0.02, 0, 0) },
  uCut: { value: new Vector4(OCCLUSION.cutX, 0, 0, 0) },
  /** The cut's dark edge band: (width as an angle from the cut plane, tangent units | ortho: metres, the darkest
   *  factor, 1 / √(1 + slope²), 1 ortho | 0 perspective). */
  uCutBand: { value: new Vector4(0, 1, 1, 0) },
  uOver: { value: new Vector4(0, 0, 30, 1) },
  uOverDir: { value: new Vector4(0, -1, 0, 1) },
};
/** Debug only (`__camLab.occlusion()`, before/after shots): switch the camera-side cut and the overhead fade off. */
export const OCCLUSION_DEBUG = { cut: true, fade: true, all: false };
/** Layer of the sky dome, clouds, birds and skyline strips (sky.ts): only the menu cameras enable it. */
const SKY_LAYER = 1;

const DEG = Math.PI / 180;
const HALF_W = CORRIDOR_HALF + CAMERA.marginX;        // 4.8 m: corridor plus margin
const CAM_DIST = 60;
/** Perspective cameras: the search range of the camera distance D (m) and the look-ahead search cap (m). */
const PERSP_D = { min: 4, max: 4000, iters: 48 } as const;
const LOOK_CAP_M = 600;

export interface Framing { H: number; yawDeg: number; lookAheadSec: number; anchorY: number; hudTop: number; rotate: boolean;
  /** Screen-X centre of the required region relative to the anchor, m (0 in portrait); perspective: tangent units. */ xCentre: number;
  /** The projection (camVariants.ts; production 'persp'). Ortho: D = tanH = 0. Perspective: the camera sits D m from the skater's
   *  ground point along the view direction and the window spans tanH (2·tan(fov/2)) vertically; H = tanH·D is the
   *  frame height in metres at the skater's depth. */
  proj: CamProj; pitchDeg: number; D: number; tanH: number }
export interface ShadowBox { halfX: number; halfS: number; centreAhead: number; height: number }

export function yawForAspect(aspect: number, v: CamVariant = camVariant()): number {
  const u = clamp((aspect - CAMERA.yawAspect0) / (CAMERA.yawAspect1 - CAMERA.yawAspect0), 0, 1);
  return lerp(v.yawMinDeg, CAMERA.yawMaxDeg, u);
}
export const hudTopOf = (vp: Viewport) => (vp.safeTop + CAMERA.hudPx) / vp.hCss;
export const rotateFor = (vp: Viewport) => vp.coarse && Math.min(vp.wCss, vp.hCss) < 500 && vp.aspect > 1;

/** Full-corridor-width look-ahead (s) achieved with ortho height H, measured below the HUD band. */
export function lookAheadFor(H: number, speed: number, vp: Viewport, yawDeg: number, xCentre: number,
  pitchDeg: number = camVariant().pitchDeg): number {
  const cosP = Math.cos(yawDeg * DEG), sinP = Math.sin(yawDeg * DEG), sinT = Math.sin(pitchDeg * DEG);
  const hudTop = hudTopOf(vp);
  // Vertical: the corner with the largest Y at a given s is x = −HALF_W.
  const yRoom = (CAMERA.anchorFromTop - hudTop) * H - CAMERA.headroom;
  let sMax = (yRoom - HALF_W * sinP * sinT) / (cosP * sinT);
  if (sinP > 1e-9) {
    // Horizontal: the corner with the largest X at a given s is x = +HALF_W.
    const right = xCentre + (vp.aspect * H) / 2;
    sMax = Math.min(sMax, (right - HALF_W * cosP) / sinP);
  }
  return Math.max(0, sMax) / speed;
}

// ── perspective ────────────────────────────────────────────────────────────────────────────────────────
// A track point (s, x, y) relative to the target (the skater's ground point, x = lat) has camera-frame coordinates
//   X = x·cosψ + s·sinψ,  Y = −x·sinθ·sinψ + y·cosθ + s·sinθ·cosψ,  depth = D + s·cosθ·cosψ − x·cosθ·sinψ − y·sinθ
// (the ortho screen coordinates are X, Y); the perspective window coordinates are u = X / depth, v = Y / depth.
// Every window extent of the required region falls as D grows, so the smallest D that fits a fixed tanH is found by
// bisection; each look-ahead constraint is monotonic in s, so the look-ahead is found by bisection too.
const EXT = { uMin: 0, uMax: 0, vMin: 0, vMaxH: 0 };
function perspExtents(D: number, L: number, sinT: number, cosT: number, cosP: number, sinP: number, lat: number): typeof EXT {
  EXT.uMin = Infinity; EXT.uMax = -Infinity; EXT.vMin = Infinity; EXT.vMaxH = -Infinity;
  for (let i = 0; i < 4; i++) {
    const s = i < 2 ? -CAMERA.behind : L, x = (i & 1 ? HALF_W : -HALF_W) - lat;
    const X = x * cosP + s * sinP, Y = s * sinT * cosP - x * sinP * sinT, dep = D + s * cosT * cosP - x * cosT * sinP;
    const u = X / dep, v = Y / dep, vh = (Y + CAMERA.headroom) / dep;
    EXT.uMin = Math.min(EXT.uMin, u); EXT.uMax = Math.max(EXT.uMax, u); EXT.vMin = Math.min(EXT.vMin, v); EXT.vMaxH = Math.max(EXT.vMaxH, vh);
  }
  return EXT;
}
const tanHOf = (e: typeof EXT, aspect: number, hudTop: number) => Math.max((e.uMax - e.uMin) / aspect,
  e.vMaxH / (CAMERA.anchorFromTop - hudTop), -e.vMin / (1 - CAMERA.anchorFromTop));
/** The window's vertical tangent span of a perspective camera. */
export const tanHOfVariant = (v: CamVariant) => 2 * Math.tan((v.fovDeg * DEG) / 2);

/** Smallest camera distance D at which the required region fits the variant's fixed window (perspective). */
export function solvePerspD(speed: number, vp: Viewport, yawDeg: number, v: CamVariant = camVariant(), lat = 0): number {
  const sinT = Math.sin(v.pitchDeg * DEG), cosT = Math.cos(v.pitchDeg * DEG), cosP = Math.cos(yawDeg * DEG), sinP = Math.sin(yawDeg * DEG);
  const L = LOOKAHEAD_TARGET * speed, hudTop = hudTopOf(vp), want = tanHOfVariant(v);
  const fits = (D: number) => tanHOf(perspExtents(D, L, sinT, cosT, cosP, sinP, lat), vp.aspect, hudTop) <= want;
  let lo: number = PERSP_D.min, hi: number = PERSP_D.max;
  if (fits(lo)) return lo;
  for (let i = 0; i < PERSP_D.iters; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  return hi;
}
/** Window centre (tangent units) of the required region at distance D with the target at x = lat. */
export function perspCentre(D: number, speed: number, yawDeg: number, pitchDeg: number, lat: number): number {
  const e = perspExtents(D, LOOKAHEAD_TARGET * speed, Math.sin(pitchDeg * DEG), Math.cos(pitchDeg * DEG), Math.cos(yawDeg * DEG), Math.sin(yawDeg * DEG), lat);
  return (e.uMin + e.uMax) / 2;
}
/** Full-corridor-width look-ahead (s) of a perspective camera (D, tanH, window centre uc), below the HUD band. */
export function lookAheadPersp(D: number, tanH: number, uc: number, speed: number, vp: Viewport, yawDeg: number, pitchDeg: number, lat = 0): number {
  const sinT = Math.sin(pitchDeg * DEG), cosT = Math.cos(pitchDeg * DEG), cosP = Math.cos(yawDeg * DEG), sinP = Math.sin(yawDeg * DEG);
  const top = (CAMERA.anchorFromTop - hudTopOf(vp)) * tanH, half = (vp.aspect * tanH) / 2, eps = 1e-9;
  const ok = (s: number) => {
    for (let k = 0; k < 2; k++) {
      const x = (k ? HALF_W : -HALF_W) - lat;
      const X = x * cosP + s * sinP, Y = s * sinT * cosP - x * sinP * sinT, dep = D + s * cosT * cosP - x * cosT * sinP;
      if (dep <= 0 || (Y + CAMERA.headroom) / dep > top + eps || Math.abs(X / dep - uc) > half + eps) return false;
    }
    return true;
  };
  if (!ok(0)) return 0;
  if (ok(LOOK_CAP_M)) return LOOK_CAP_M / speed;
  let lo = 0, hi = LOOK_CAP_M;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo / speed;
}

/** Pure framing solver (TECH §8.3). `out` (optional) is filled and returned instead of a new object (the rig's
 *  per-frame call). Perspective (production) solves the smallest camera distance D at the fixed window; ortho specs
 *  (debug, `?cam=A`) the smallest H. */
export function solveFraming(speed: number, vp: Viewport, out?: Framing): Framing {
  const v = camVariant();
  const yawDeg = yawForAspect(vp.aspect, v);
  const cosP = Math.cos(yawDeg * DEG), sinP = Math.sin(yawDeg * DEG), sinT = Math.sin(v.pitchDeg * DEG);
  const hudTop = hudTopOf(vp);
  const L = LOOKAHEAD_TARGET * speed;
  let H: number, xCentre: number, lookAheadSec: number, D = 0, tanH = 0;
  if (v.proj === 'ortho') {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    // The four corners of the required region (s ∈ {−behind, L} × x ∈ {±HALF_W}); scalar code, no per-frame arrays.
    for (let i = 0; i < 4; i++) {
      const s = i < 2 ? -CAMERA.behind : L, x = i & 1 ? HALF_W : -HALF_W;
      const X = x * cosP + s * sinP, Y = s * sinT * cosP - x * sinP * sinT;
      xMin = Math.min(xMin, X); xMax = Math.max(xMax, X); yMin = Math.min(yMin, Y); yMax = Math.max(yMax, Y);
    }
    H = Math.max(
      (xMax - xMin) / vp.aspect,
      (yMax + CAMERA.headroom) / (CAMERA.anchorFromTop - hudTop),
      -yMin / (1 - CAMERA.anchorFromTop),
    );
    xCentre = (xMin + xMax) / 2;
    lookAheadSec = lookAheadFor(H, speed, vp, yawDeg, xCentre, v.pitchDeg);
  } else {
    // With ψ > 0 the rig follows 15% of the skater's offset (|x| ≤ CORRIDOR_HALF), which slides the window sideways:
    // D is solved for the worst follow offset, so the guarantee holds wherever the skater is (≈ 1.5% skater size).
    const latMax = yawDeg > 0 ? CAMERA.latFollow * CORRIDOR_HALF : 0;
    D = latMax > 0 ? Math.max(solvePerspD(speed, vp, yawDeg, v, latMax), solvePerspD(speed, vp, yawDeg, v, -latMax)) : solvePerspD(speed, vp, yawDeg, v);
    tanH = tanHOfVariant(v);
    H = tanH * D;
    xCentre = perspCentre(D, speed, yawDeg, v.pitchDeg, 0);
    lookAheadSec = lookAheadPersp(D, tanH, xCentre, speed, vp, yawDeg, v.pitchDeg);
  }
  const rotate = rotateFor(vp);
  if (!out) return { H, yawDeg, lookAheadSec, anchorY: CAMERA.anchorFromTop, hudTop, rotate, xCentre, proj: v.proj, pitchDeg: v.pitchDeg, D, tanH };
  out.H = H; out.yawDeg = yawDeg; out.lookAheadSec = lookAheadSec; out.anchorY = CAMERA.anchorFromTop; out.hudTop = hudTop;
  out.rotate = rotate; out.xCentre = xCentre; out.proj = v.proj; out.pitchDeg = v.pitchDeg; out.D = D; out.tanH = tanH;
  return out;
}

/** Depth (along the view direction) of the ground seen at window height v (tangent units), perspective framing;
 *  Infinity when that ray does not reach the ground (at or above the horizon). */
export function groundDepthAt(f: Framing, v: number): number {
  const sinT = Math.sin(f.pitchDeg * DEG), cosT = Math.cos(f.pitchDeg * DEG), den = sinT - v * cosT;
  return den > 1e-6 ? (f.D * sinT) / den : Infinity;
}
/** Metres per CSS px of the farthest readable ground (the HUD line) at framing f: the minimum on-screen sizes (grind
 *  edges, coins) are met there and so everywhere nearer. Ortho: H / hCss (the same at every depth). */
export function farMetresPerPx(f: Framing, vp: Viewport): number {
  if (f.proj === 'ortho') return f.H / Math.max(1, vp.hCss);
  const dep = Math.min(groundDepthAt(f, (f.anchorY - f.hudTop) * f.tanH), f.D + LOOK_CAP_M);
  return (f.tanH * dep) / Math.max(1, vp.hCss);
}
/** CSS px position (relative to the anchor, y down) of the track point (s, x, y) relative to the skater's ground
 *  point under framing f (lat = 0), from the framing maths alone (no camera object). */
export function framePx(f: Framing, vp: Viewport, s: number, x: number, y: number): { x: number; y: number } {
  const sinT = Math.sin(f.pitchDeg * DEG), cosT = Math.cos(f.pitchDeg * DEG), cosP = Math.cos(f.yawDeg * DEG), sinP = Math.sin(f.yawDeg * DEG);
  const X = x * cosP + s * sinP, Y = -x * sinT * sinP + y * cosT + s * sinT * cosP;
  if (f.proj === 'ortho') { const k = vp.hCss / f.H; return { x: X * k, y: -Y * k }; }
  const dep = f.D + s * cosT * cosP - x * cosT * sinP - y * sinT, k = vp.hCss / f.tanH;
  return { x: (X / dep) * k, y: (-Y / dep) * k };
}
/** Metres per CSS px ACROSS a grind edge (an edge along +s, its width along x) at the farthest readable ground (the
 *  HUD line: window centre and both sides, |x| ≤ 4.3 m), i.e. including the on-screen foreshortening of the stripe
 *  under yaw and the convergence of perspective (the ortho edge-width floor; perspective floors every edge at its own
 *  depth, view.ts EDGE_DEPTH). */
export function edgeMetresPerPx(f: Framing, vp: Viewport): number {
  const span = f.proj === 'ortho' ? f.H : f.tanH, vh = (f.anchorY - f.hudTop) * span, half = (vp.aspect * span) / 2;
  let best = Infinity;
  for (const u of [f.xCentre - half, f.xCentre, f.xCentre + half]) {
    const g = groundAt(f, u, vh, LOOK_CAP_M);
    const x = clamp(g.x, -4.3, 4.3), w = 0.1;
    const a = framePx(f, vp, g.s, x - w / 2, 0), b = framePx(f, vp, g.s, x + w / 2, 0), t = framePx(f, vp, g.s + 1, x - w / 2, 0);
    const tx = t.x - a.x, ty = t.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const across = Math.abs((b.x - a.x) * ty - (b.y - a.y) * tx) / tl;      // px between the stripe's two long sides
    best = Math.min(best, across / w);
  }
  return 1 / best;
}
/** Ground point (s, x relative to the skater's ground point) under the window point (u, v): ortho screen metres,
 *  perspective tangent units. The far side of a perspective horizon is clamped to `capS` metres ahead. */
export function groundAt(f: Framing, u: number, v: number, capS = LOOK_CAP_M): { s: number; x: number } {
  const sinT = Math.sin(f.pitchDeg * DEG), cosT = Math.cos(f.pitchDeg * DEG), cosP = Math.cos(f.yawDeg * DEG), sinP = Math.sin(f.yawDeg * DEG);
  let X: number, Y: number, Z: number;
  if (f.proj === 'ortho') { X = u; Y = v; Z = v * (cosT / sinT); }
  else { const t = Math.min(groundDepthAt(f, v), f.D + capS); X = u * t; Y = v * t; Z = t - f.D; }
  // World offset q = X·xc + Y·yc + Z·d with xc = (cosψ, 0, −sinψ), yc = (−sinθ sinψ, cosθ, −sinθ cosψ), d = (−sinψ cosθ, −sinθ, −cosψ cosθ).
  const x = X * cosP - Y * sinT * sinP - Z * sinP * cosT;
  const s = X * sinP + Y * sinT * cosP + Z * cosP * cosT;
  return { s: Math.min(s, capS), x };
}
/** Grind-edge stripe widening of the perspective run camera (DESIGN §8 minimum sizes, judged at @cam): the cream
 *  stripe keeps EDGE_WIDEN.px × CAMERA.minEdgePx across at its own view depth, the ink pad EDGE_WIDEN.inkPx beside
 *  it; below the depth where the built (physical) width is wider, the built width stays. Per metre of depth: the
 *  frame height there is tanH·depth, and ψ > 0 narrows an x-width by cos ψ on screen (EDGE_WIDEN.tilt covers the
 *  convergence tilt of a stripe at the corridor sides). Ortho specs build their floor instead (view.ts). */
export const EDGE_WIDEN = { px: 1.2, inkPx: 1.6, tilt: 1.12, hw0: 0.035, pad0: 0.02 } as const;
export function edgeWidening(f: Framing, vp: Viewport): { hw0: number; pad0: number; kHalf: number; kPad: number } {
  if (f.proj !== 'persp') return { hw0: EDGE_WIDEN.hw0, pad0: EDGE_WIDEN.pad0, kHalf: 0, kPad: 0 };
  const per = (f.tanH / Math.max(1, vp.hCss)) * (EDGE_WIDEN.tilt / Math.cos(f.yawDeg * DEG));
  return { hw0: EDGE_WIDEN.hw0, pad0: EDGE_WIDEN.pad0, kHalf: ((CAMERA.minEdgePx * EDGE_WIDEN.px) / 2) * per, kPad: EDGE_WIDEN.inkPx * per };
}
/** The stripe half-widths at a view depth (m), as the lit material draws them (materials.ts VERT_EDGE). */
export function edgeHalfAt(f: Framing, vp: Viewport, depth: number): { cream: number; ink: number } {
  const e = edgeWidening(f, vp), cream = Math.max(e.hw0, e.kHalf * depth);
  return { cream, ink: cream + Math.max(e.pad0, e.kPad * depth) };
}

/** Shadow box of the run camera: the default (x ±10, s − 6 … s + 34) grown to the ground footprint the widest run
 *  framing shows (viewport corners, far side clamped to 120 m), in 2 m steps (stable texel size). */
export function shadowBoxFor(vp: Viewport, base: ShadowBox): ShadowBox {
  const f = solveFraming(V_MAX, vp), w = f.proj === 'ortho' ? (vp.aspect * f.H) / 2 : (vp.aspect * f.tanH) / 2;
  const top = f.anchorY * (f.proj === 'ortho' ? f.H : f.tanH), bot = -(1 - f.anchorY) * (f.proj === 'ortho' ? f.H : f.tanH);
  let s0 = base.centreAhead - base.halfS, s1 = base.centreAhead + base.halfS, hx = base.halfX;
  for (const u of [f.xCentre - w, f.xCentre + w]) for (const v of [bot, top]) {
    const g = groundAt(f, u, v, 120);
    s0 = Math.min(s0, g.s); s1 = Math.max(s1, g.s); hx = Math.max(hx, Math.abs(g.x));
  }
  const up2 = (m: number) => Math.ceil(m / 2) * 2;
  s0 = -up2(-s0); s1 = up2(s1);
  return { halfX: up2(hx), halfS: (s1 - s0) / 2, centreAhead: (s0 + s1) / 2, height: base.height };
}

/** The run camera rig. Forward follow is rigid; vertical follows the ground height (τ 0.3 s); lateral follows 15%
 *  (τ 0.4 s) only when ψ > 0; D (ortho: H) eases with τ = 2 s toward the framing for the speed 2 s ahead and never
 *  shrinks within a run.
 *  The follow easings run on game time (sim ticks elapsed, or the frame dt if larger), so manual stepping
 *  (`__skate.step(3600)`) frames exactly like real-time play. Shake and punch run on the frame dt. */
/** The M0 Locker / Shop camera (DESIGN §8 "non-run cameras"): a low perspective camera (FOV 35°, 1.4 m high) behind
 *  the skater looking down the street, with the skater's mid-body at 33% from the top (the turntable sits in the top
 *  half, above the item panel). The Title diorama has its own camera (TITLE_CAM). */
export const LOCKER_CAM = { fovDeg: 35, height: 1.4, dist: 11, targetY: 0.9, anchorFromTop: 0.33 } as const;
/** The static Title diorama camera (DESIGN §8): low, behind and to the right of the idling skater, looking down the
 *  street toward the horizon (the skater sits in the lower third, the sunset sky fills the top). */
export const TITLE_CAM = { fovDeg: 35, height: 1.4, back: 4.6, side: 0.55, lookAhead: 26, lookY: 1.7, lookX: -0.35,
  /** Portrait: further back and a wider vertical FOV, so the whole rider stands in the lower third (not cropped at the
   *  edge) and the sunset sky, sun glow and clouds fill the top. */
  portrait: { fovDeg: 52, height: 1.75, back: 7.2, side: 0.75, lookAhead: 30, lookY: 3.4, lookX: 0.15 } } as const;

export class RunCameraRig implements CameraRig {
  readonly runCamera = new OrthographicCamera(-1, 1, 1, -1, 1, 200);
  readonly menuCamera = new PerspectiveCamera(LOCKER_CAM.fovDeg, 1, 0.1, 400);
  /** The production run camera (perspective); `runCamera` (ortho) serves the debug ortho specs (camVariants.ts). */
  readonly runPersp = new PerspectiveCamera(CAMERA.fovDeg, 1, 1, 400);
  /** The camera to render with: the run camera of the active spec, or the perspective menu camera. */
  get camera(): OrthographicCamera | PerspectiveCamera {
    return this.mode === 'run' ? (camVariant().proj === 'persp' ? this.runPersp : this.runCamera) : this.menuCamera;
  }
  private mode: CameraMode = 'run';
  /** The eased framing: ortho height H, or the perspective camera distance D (both only grow within a run). */
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
    if (this.mode !== 'run') { RIG_UNIFORMS.uCut.value.w = 0; RIG_UNIFORMS.uOver.value.w = 1; RIG_UNIFORMS.uEdge.value.z = 0; RIG_UNIFORMS.uEdge.value.w = 0; }
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
    const persp = want.proj === 'persp';
    if (reset) {
      const now = solveFraming(f.speed, vp);
      this.H = persp ? now.D : now.H;
      this.groundY = gy;
      this.lat = want.yawDeg > 0 ? CAMERA.latFollow * px : 0;
    } else {
      const goal = persp ? want.D : want.H;
      this.H = Math.max(this.H, this.H + (goal - this.H) * (1 - Math.exp(-dtE / CAMERA.zoomTau)));
      this.groundY += (gy - this.groundY) * (1 - Math.exp(-dtE / CAMERA.vertTau));
      const latWant = want.yawDeg > 0 ? CAMERA.latFollow * px : 0;
      this.lat += (latWant - this.lat) * (1 - Math.exp(-dtE / CAMERA.latTau));
    }
    this.yawDeg = want.yawDeg;
    this.xCentre = persp ? perspCentre(this.H, lead, want.yawDeg, want.pitchDeg, this.lat) : want.xCentre;
    // `last` is updated in place (read it, don't keep it): one framing object per rig, not per frame.
    Object.assign(this.last, want);
    if (persp) {
      this.last.D = this.H; this.last.H = this.H * want.tanH; this.last.xCentre = this.xCentre;
      this.last.lookAheadSec = lookAheadPersp(this.H, want.tanH, this.xCentre, f.speed, vp, want.yawDeg, want.pitchDeg, this.lat);
    } else {
      this.last.H = this.H;
      this.last.lookAheadSec = lookAheadFor(this.H, f.speed, vp, want.yawDeg, want.xCentre, want.pitchDeg);
    }
    RIG_STATE.yawDeg = want.yawDeg; RIG_STATE.H = this.last.H; RIG_STATE.pitchDeg = want.pitchDeg;

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
    if (persp) this.placePersp(f.playerS, this.lat, this.groundY, zoom, shx, shy);
    else this.place(f.playerS, this.lat, this.groundY, zoom, shx, shy);
    RIG_STATE.playerS = f.playerS; RIG_STATE.originS = this.originS; RIG_STATE.placed = true;
    this.occlusionUniforms(persp);
  }

  /** The camera-side cut plane and the overhead-span fade for this frame (RIG_UNIFORMS, DESIGN §8 occlusion). Shake
   *  and the punch move the window, not the camera, so neither moves the cut. */
  private occlusionUniforms(persp: boolean): void {
    // The street datum or the skater's ground, whichever is lower (on a raised deck, the corridor floor beside it
    // still stays clear).
    const u = RIG_UNIFORMS, gy = Math.min(0, this.groundY), lim = OCCLUSION.cutX, f = this.last;
    let slope = 0, on = false;
    if (persp) {
      // The plane through the line (x = lim, y = gy) and the camera: points above it project onto the corridor side.
      const c = this.runPersp.position;
      on = c.x > lim + 0.05; slope = on ? (c.y - gy) / (c.x - lim) : 0;
    } else if (this.yawDeg > 0) {
      const yaw = this.yawDeg * DEG, th = camVariant().pitchDeg * DEG;
      on = true; slope = Math.sin(th) / (Math.sin(yaw) * Math.cos(th));
    }
    u.uCut.value.set(lim, gy, slope, on && OCCLUSION_DEBUG.cut ? 1 : 0);
    // A dark band along the cut, OCCLUSION.edgePx wide on screen: the street wall reads as a cutaway section and a
    // light hazard at the corridor edge never stands against a lit facade.
    u.uCutBand.value.set((OCCLUSION.edgePx * (persp ? f.tanH : f.H)) / Math.max(1, this.vp.hCss), OCCLUSION.edgeDark, 1 / Math.hypot(1, slope), persp ? 0 : 1);
    if (OCCLUSION_DEBUG.all) u.uCut.value.set(lim, -1000, 0, 1);
    const span = persp ? f.tanH : f.H;
    const ahead = groundAt(f, f.xCentre, (f.anchorY - f.hudTop) * span).s;
    u.uOver.value.set(this.target.z, this.groundY, Math.max(0, ahead), OCCLUSION_DEBUG.fade ? OCCLUSION.overAlpha : 1);
    u.uOverDir.value.set(this.dir.x, this.dir.y, this.dir.z, persp ? 0 : 1);
    const ew = edgeWidening(f, this.vp);
    u.uEdge.value.set(ew.hw0, ew.pad0, ew.kHalf, ew.kPad);
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
    // Portrait has its own framing (TITLE_CAM.portrait); landscape widens the street view.
    const c = vp.aspect < 1 ? TITLE_CAM.portrait : TITLE_CAM, k = vp.aspect < 1 ? 1 : 1.35;
    cam.fov = c.fovDeg; cam.aspect = vp.wCss / Math.max(1, vp.hCss);
    cam.position.set(x + c.side * k, gy + c.height, z + c.back * k);
    this.target.set(x + c.lookX, gy + c.lookY, z - c.lookAhead);
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
    const yaw = this.yawDeg * DEG, pitch = camVariant().pitchDeg * DEG;
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

  /** Perspective (production): the camera D (this.H) metres back along the view direction from the anchor (s, x =
   *  lat, y = ground), with an off-axis window (tangent units) that puts the anchor 74% from the top and centres the
   *  required region; shake is converted from metres at the skater's depth, the punch scales the window. */
  private placePersp(playerS: number, latX: number, groundY: number, zoom: number, shx: number, shy: number): void {
    const vp = this.vp, D = this.H, tanH = this.last.tanH * zoom;
    this.originS = originOf(playerS);
    const yaw = this.yawDeg * DEG, pitch = camVariant().pitchDeg * DEG;
    this.dir.set(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    this.target.set(latX, groundY, -(playerS - this.originS));
    const cam = this.runPersp;
    cam.position.copy(this.target).addScaledVector(this.dir, -D);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    const halfW = (vp.aspect * tanH) / 2, ox = shx / D, oy = shy / D;
    const top = CAMERA.anchorFromTop * tanH + oy, bottom = -(1 - CAMERA.anchorFromTop) * tanH + oy;
    const left = this.xCentre - halfW + ox, right = this.xCentre + halfW + ox;
    // A symmetric frame around the optical axis, cropped to the window (PerspectiveCamera.setViewOffset).
    const ty = Math.max(Math.abs(top), Math.abs(bottom)), tx = Math.max(Math.abs(left), Math.abs(right)), k = 1000;
    cam.fov = (2 * Math.atan(ty)) / DEG; cam.aspect = tx / ty; cam.zoom = 1;
    cam.near = Math.max(1, D - 60); cam.far = D + LOOK_CAP_M;
    cam.setViewOffset(2 * tx * k, 2 * ty * k, (left + tx) * k, (ty - top) * k, (right - left) * k, (top - bottom) * k);
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
