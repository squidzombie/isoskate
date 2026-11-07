// core/view.ts (TECH §4.6). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
import type { Object3D, OrthographicCamera, PerspectiveCamera, Scene, WebGLRenderer, Texture } from 'three';
import type { AreaId, GrindId, ManualId, QualityTier } from './ids';
import type { ScoreState, SkaterMode, SkaterState } from './sim';
import type { AreaBlend, WorldGen } from './world';
import type { GameEvent } from './events';
import type { Loadout } from './cosmetics';

export type PoseId = 'roll' | 'carve' | 'pop' | 'tuck' | 'flip' | 'grab' | 'land' | 'manual' | 'noseManual'
  | 'grind' | 'sketchy' | 'crash' | 'idle' | 'showcase';
/** Produced by Sim.pose() each tick: deterministic targets. The view smooths them with springs. */
export interface SkaterPose {
  mode: SkaterMode; pose: PoseId; grindId: GrindId | null; manualKind: ManualId | null;
  heading: number;                     // rad, board yaw from carve = atan2(vx, vs)
  lean: number;                        // rad, body roll from carve
  latAccel: number;                    // m/s², toeside(+)/heelside(−) pose selection
  crouch: number;                      // 0..1
  board: { roll: number; yaw: number; pitch: number };   // deg, eased flip/shuv/manual rotation (continuous across upgrades)
  bodyYaw: number;                     // deg, grind/slide body orientation
  spinYaw: number;                     // deg, body + board spin (FS/BS 180/360), 0 when not spinning
  fakie: boolean;                      // visual stance after a 180 until the revert
  height: number;                      // board bottom above ground (blob shadow)
  airT: number; wobble: number;        // wobble 0..1
  landImpulse: number;                 // 1 on the touchdown tick (scaled by drop), else 0
  crash: { t: number; seed: number } | null;
}
export interface Viewport { wCss: number; hCss: number; dpr: number; aspect: number; safeTop: number; safeBottom: number;
  coarse: boolean }                    // coarse = (pointer: coarse); with aspect > 1 on a phone → rotate card
export interface RenderFrame {
  alpha: number;                       // interpolation factor between prev and cur
  dt: number;                          // real frame delta (s)
  timeScale: number;                   // slow-mo (render & loop), 1 = normal
  prev: Readonly<SkaterState>; cur: Readonly<SkaterState>; pose: Readonly<SkaterPose>;
  score: Readonly<ScoreState>;         // bank-timer arc (combo.bankIn, heat), predicted-landing tint
  events: readonly GameEvent[];        // sim events since the last frame, in order
  playerS: number; speed: number;
  area: AreaId; blend: AreaBlend | null;
  viewport: Viewport;
}
export interface PaletteSample {
  zenith: number; mid: number; horizon: number; sun: number; sunGlow: number; fog: number;
  hemiSky: number; hemiGround: number; sunColor: number; sunIntensity: number; sunElevDeg: number;
  exposure: number; windowLit: number; neonGlow: number;  // 0..1
}
export interface GfxContext {
  renderer: WebGLRenderer; scene: Scene; quality: QualityTier;
  palette(area: AreaId, blend: AreaBlend | null): PaletteSample;
  canvasTexture(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): Texture;
}
export interface WorldView {
  attach(gen: WorldGen): void;        // new run
  update(f: RenderFrame): void;       // streaming, time-sliced chunk builds (≤ 4 ms), lights, palette
  setQuality(q: QualityTier): void;
  rebuildGPU(): void;                 // after context restore
  stats(): { chunksBuilt: number; buildMsP95: number; drawCalls: number };
  dispose(): void;
  /** added @G1 (WA): work-time auto-adjust (TECH §8.9) on while the saved quality is 'auto', off after a manual pick. */
  setAutoQuality?(on: boolean): void;
}
export interface SkaterView {
  readonly object3d: Object3D;
  setLoadout(l: Loadout): void;
  update(f: RenderFrame): void;
  setMode(m: 'run' | 'showcase'): void;   // showcase = Locker/Shop turntable
  setTurntable?(yawDeg: number): void;    // showcase yaw, deg (Locker drag via UiIntent 'turntable', shots) (added @m0-core)
  rebuildGPU(): void;
}
export type CameraMode = 'run' | 'title' | 'locker';   // 'title' = static diorama (live attract run is M5 stretch)
export interface CameraRig {
  readonly camera: OrthographicCamera | PerspectiveCamera;
  setMode(m: CameraMode): void;
  update(f: RenderFrame): void;
  shake(amp: number, dur: number): void;
  punch(zoomFrac: number, dur: number): void;
  setReducedMotion(on: boolean): void;
  /** Pure framing solver (unit-tested): ortho height, yaw and achieved full-width look-ahead in seconds,
   *  measured below hudTop = (vp.safeTop + CAMERA.hudPx) / vp.hCss. `rotate` = phone in landscape → show the rotate card. */
  solve(speed: number, vp: Viewport): { H: number; yawDeg: number; lookAheadSec: number; anchorY: number; hudTop: number; rotate: boolean };
  /** Projects a track-space point to CSS px (HUD anchor, popups). */
  project(p: { s: number; x: number; y: number }): { x: number; y: number };
}
export interface Vfx {
  update(f: RenderFrame): void; setQuality(q: QualityTier): void; clear(): void;
  /** Legendary cosmetic particles requested by skater/ (TECH §8.5; added @G0, implemented by WA / M5). */
  emit?(kind: 'steam' | 'leaves' | 'petals' | 'glyphs' | 'lightTrail', p: { s: number; x: number; y: number }, n?: number): void;
  /** added @G1 (WA): DESIGN §18.8 reduced motion / "Reduce effects" (no speed lines, no ambient drift). */
  setReducedMotion?(on: boolean): void;
}
