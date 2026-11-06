// core/debug.ts (TECH §4.11). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
import type { AreaId, PropKind, ScreenId, QualityTier } from './ids';
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
  audio(): { unlocked: boolean; voices: number; scene: string; intensity: number };
  /** shots --audio: `sec` seconds of `area` rendered offline, as a 16-bit stereo WAV in base64 plus its peak (0..1).
   *  Resolves null until AU ships audio/index.ts `renderOffline` (added @m0-core). */
  renderAudio?(area: AreaId, sec: number): Promise<{ wavBase64: string; peak: number; sampleRate: number; sec: number } | null>;
}
declare global { interface Window { __skate?: DebugAPI } }
