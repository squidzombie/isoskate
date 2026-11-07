// core/debug.ts (TECH §4.11). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
import type { AreaId, Dir8, GrindId, ManualId, PropKind, ScreenId, QualityTier } from './ids';
import type { V3 } from './math';
import type { InputFrame } from './input';
import type { GameEvent } from './events';
import type { SkaterMode } from './sim';
import type { SaveV1 } from './save';
import type { GenStats, SafeKey } from './world';

export interface DebugSnapshot {
  tick: number; t: number; mode: SkaterMode; p: V3; vel: { s: number; x: number; y: number };
  speed: number; area: AreaId; layer: 0 | 1; alive: boolean;
  score: number; combo: { pts: number; links: number; window: number }; coins: number;
  crash: { cause: string; kind: string | null } | null;
  nextObstacles: { id: number; kind: PropKind; s: number; x: number; dist: number; tags: number }[];  // next 40 m
  safe: SafeKey[];                                                                              // next 40 m
  /** added @G1 (GP request 4): the debug overlay data (pick window, combo clocks, prediction), from sim's simDebug(). */
  sim?: DebugSimInfo;
}
/** The sim's debug overlay data (added @G1). `heat` is 0 outside a combo; `pick` is null unless the pick window is open. */
export interface DebugSimInfo {
  airLeft: number; heat: number; window: number; bankIn: number; magnetEdge: number | null; transferArmed: boolean;
  pick: { open: boolean; edgeId: number; tCapture: number; inSec: number; dirs: Dir8[]; grind: GrindId | null } | null;
  manual: { kind: ManualId; t: number; budget: number } | null;
  rewindsLeft: number;
}
export interface DebugAPI {
  readonly version: string;
  start(o?: { seed?: number; mode?: 'lesson' | 'normal'; startT?: number; startArea?: AreaId; god?: boolean; firstRuns?: boolean }): void;
  manual(on: boolean): void;                                    // true: rAF no longer advances the sim
  step(n: number, input?: Partial<InputFrame> | InputFrame[]): DebugSnapshot;
  queue(f: Partial<InputFrame>): void;                           // merged into the next tick's frame
  gesture(g: 'tap' | 'holdStart' | 'holdEnd' | { swipe: string } | { steerDx: number }): void;
  snapshot(): DebugSnapshot;
  events(sinceTick?: number): GameEvent[];                       // ring buffer of 1024
  bot(kind: 'off' | 'safe' | 'myopic' | 'thumb' | 'straight' | 'trick' | 'conformance',
      opts?: { lane?: number; reaction?: number }): void;
  pointer(samples: { id: number; tMs: number; x: number; y: number; phase: 'down' | 'move' | 'up' | 'cancel' }[]): void;  // synthetic traces
  gen(): GenStats;
  previewArea(area: AreaId, blend?: number): void;               // palette/kit preview without a run (shots.mjs)
  contrast(): { hazard: number; edge: number; worst: { kind: string; ratio: number } | null };  // shots --contrast
  timeScale(x: number): void;
  renderNow(): void;
  camera(): { H: number; yawDeg: number; lookAheadSec: number; aspect: number };
  perf(): { fps: number; p50: number; p95: number; calls: number; tris: number; geoms: number; textures: number;
            simMs: number; buildMs: number; heapMB: number | null };
  quality(q: QualityTier | 'auto'): void;
  save: { get(): SaveV1; set(s: SaveV1): void; reset(): void };
  ui(screen: ScreenId, params?: object): void;
  audio(): { unlocked: boolean; voices: number; scene: string; intensity: number;
    // added @G0: AudioContext state, whole-session average cost per rendered frame (ms), voice peak, dropped voices
    contextState?: string; msPerFrame?: number; voicePeak?: number; voicesDropped?: number };
  /** shots --audio: `sec` seconds of `area` rendered offline, as a 16-bit stereo WAV in base64 plus its peak (0..1).
   *  Resolves null until AU ships audio/index.ts `renderOffline` (added @m0-core). */
  renderAudio?(area: AreaId, sec: number): Promise<{ wavBase64: string; peak: number; sampleRate: number; sec: number } | null>;
  /** Tooling hooks for scripts/shots.mjs and the e2e specs (frozen @G0 as a hook; see DebugExt). */
  ext?: DebugExt;
}

// ── __skate.ext (added @G0): the tooling hooks shots.mjs and the e2e specs use, so later packages never edit them ──
/** HUD layout preview values (shots --hud): replace the live numbers until cleared with null. */
export interface HudPreview { score?: number; dist?: number; speed?: number; combo?: number; links?: number; coins?: number; trick?: string }
/** One measured hazard or grind edge of the DESIGN §18.4 contrast gate. */
export interface ContrastItem {
  cls: 'hazard' | 'edge'; kind: string; id: number; ratio: number; fg: number; bg: number; px: number;
  /** Where it was measured: screen box in CSS px (hazard hull bbox, or the span of the edge samples). */
  at: { x0: number; y0: number; x1: number; y1: number };
}
export interface ContrastReport { hazard: number; edge: number; worst: { kind: string; ratio: number } | null; items: ContrastItem[] }
/** An isolated turntable view of the skater (shots --cosmetics). Angles are relative to the direction toward the
 *  active camera: `azDeg` orbits about the vertical (+ moves the camera toward screen-left), `elevDeg` looks down
 *  (negative: from below). `part` frames the whole skater, its board or its head. */
export interface CaptureView { azDeg?: number; elevDeg?: number; part?: 'all' | 'board' | 'head'; fovDeg?: number; pad?: number }
export interface DebugExt {
  overlay(on?: boolean): boolean;
  perfHud(on?: boolean): boolean;
  tuning(on?: boolean): boolean;
  /** The full contrast report (every measured hazard and edge) of the current frame. */
  contrastReport(): ContrastReport;
  /** Renders now and returns a PNG data URL: the whole canvas, or a square crop around the skater. `native`: the crop
   *  at its rendered pixel size. `view`: the skater alone on a plain `bg`, framed by its own perspective camera. */
  capture(o?: { target?: 'canvas' | 'skater'; size?: number; pad?: number; bg?: string; native?: boolean; view?: CaptureView }):
    { dataUrl: string; rect: { x: number; y: number; w: number; h: number } | null;
      /** target 'skater' on the live frame: the skater's projected size, CSS px. */ skaterCss?: { w: number; h: number } };
  /** Puts one catalog item on the skater over the equipped loadout (null = the equipped loadout), until the next run
   *  start or Locker visit. */
  tryOn(id: string | null): boolean;
  /** The cosmetic catalog (content/ CATALOG): what shots --cosmetics iterates. */
  catalog(): { id: string; slot: string; name: string; rarity: string; source: string; theme?: string; look: unknown }[];
  /** HUD layout preview with fake values (null = live values again). */
  hud(v: HudPreview | null): void;
  /** World-view internals when available (chunks, pools, coin slots). */
  world(): unknown;
  /** The synthetic clock used by manual stepping (ms; one tick = 1000/60). */
  readonly clockMs: number;
}
declare global { interface Window { __skate?: DebugAPI } }
