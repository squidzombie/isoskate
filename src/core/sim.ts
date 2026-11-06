// core/sim.ts (TECH §4.5). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
import type { V3 } from './math';
import type { AreaId, CrashCause, FlipId, GrindId, ManualId, GrabId, SpinId, TrickId, Surface, PropKind } from './ids';
import type { InputFrame } from './input';
import type { GameEvent } from './events';
import type { WorldGen, WorldGenConfig, WorldQuery } from './world';
import type { SkaterPose } from './view';

export type SkaterMode = 'roll' | 'air' | 'grind' | 'manual' | 'crashed';
/** angle0/t0 let an upgrade keep the current angle and spread the remaining rotation (no visible jump). */
export interface FlipState { id: FlipId; t: number; dur: number; upgrades: number; airLeftAtStart: number; angle0: number; t0: number }
export interface SpinState { id: SpinId; t: number; dur: number; upgrades: number; startTick: number; linked: boolean }
export interface GrindState {
  edgeId: number; obstacleId: number; id: GrindId; u: number;   // u = 0..1 along the edge
  t: number; lockTick: number; perfect: boolean; switches: number; transfer: boolean;
}
export interface ManualState { kind: ManualId; t: number; budget: number; coast: number; switched: boolean }
export interface GrabState { id: GrabId; t: number }
export interface SkaterState {
  tick: number; t: number;                       // run time t = startT + tick·DT
  p: V3; vel: { s: number; x: number; y: number };
  targetX: number;
  mode: SkaterMode; layer: 0 | 1; groundY: number; surface: Surface;
  airT: number; airLeft: number;                 // seconds airborne; predicted seconds to touchdown
  dropH: number;                                 // take-off height − predicted landing height
  coyote: number; jumpBuffer: number; popBleed: number;
  flip: FlipState | null; flipsThisAir: number; airTricks: TrickId[];
  spin: SpinState | null; fakie: boolean;        // fakie is visual only; auto-reverts on ground touchdown
  grind: GrindState | null; pickWindow: { edgeId: number; tCapture: number } | null;
  magnetEdge: number | null; magnetCancelled: boolean; transferArmed: boolean;
  manual: ManualState | null; grab: GrabState | null;
  pressRiseTick: number;                         // tick the current press went down (−1 if none): pre-press window
  wobble: number;
  crash: { cause: CrashCause; obstacleId: number | null; obstacleKind: PropKind | null; tick: number;
           flipProgress: number; spinProgress: number } | null;
}
export interface ComboEntry { id: TrickId; pts: number; factor: number; mod: number; link: boolean }
export interface ComboState {
  active: boolean; entries: ComboEntry[]; flat: number; links: number;
  manualLinked: boolean; manualCount: number;    // manual budget index within this combo
  window: number;                                // seconds left in link window; −1 = paused (in air/grind/manual)
  heat: number;                                  // seconds left to start the next link-adding trick (2.5); paused in grind/manual
  bankIn: number;                                // min(heat, window while rolling): drives the bank-timer arc
  startTick: number;                             // for the p95 combo-duration check
  pending: number;                               // current unbanked value (formula DESIGN §13.2)
  uniqueNames: number;
}
export interface ScoreState {
  total: number; trickPts: number; distancePts: number; bonusPts: number;
  combo: ComboState; bestCombo: number; maxLinks: number; lostCombo: number;
  coins: number; coinPayouts: number;
  recent: TrickId[];                             // decay window (10)
  tricks: Partial<Record<TrickId, number>>;
  longestGrind: number;
  areasReached: AreaId[]; furthestArea: AreaId; maxSpeed: number;
}
export interface RunConfig {
  runId: string;                                 // drawn outside the sim with the seed; makes MetaApi.applyRun idempotent
  seed: number; mode: 'lesson' | 'normal'; startT?: number;
  startArea?: AreaId;                            // Start District (M5 stretch); default 'downtown'
  firstRuns: boolean;                            // bail floor 0.40 when true (first 3 runs)
  bestDist: number;                              // for the BEST line event
  god?: boolean;                                 // debug: crashes are logged, not applied
  rewinds?: number;                              // lesson: crash → rewind (REWIND.max). Implemented by GP in W1a.
}
export interface RunResult {
  runId: string; seed: number; mode: 'lesson' | 'normal'; startArea: AreaId;
  score: number; trickPts: number; distance: number; durationS: number;
  coins: number; coinPayouts: number; bestCombo: number; maxLinks: number; lostCombo: number;
  furthestArea: AreaId; areasReached: AreaId[]; maxSpeed: number;
  tricks: Partial<Record<TrickId, number>>; longestGrind: number;
  crash: { cause: CrashCause; obstacleKind: PropKind | null; state: SkaterMode; t: number;
           flipProgress: number; spinProgress: number } | null;
}
export type SimSnapshot = { readonly __brand: 'SimSnapshot' };   // opaque; structuredClone-able
export interface Sim {
  readonly cur: Readonly<SkaterState>; readonly prev: Readonly<SkaterState>;
  readonly score: Readonly<ScoreState>;
  readonly gen: WorldGen; readonly world: WorldQuery;
  reset(cfg: RunConfig): void;
  step(f: InputFrame): readonly GameEvent[];      // exactly one 60 Hz tick; returns this tick's events in order
  pose(): SkaterPose;                             // visual targets for `cur` (deterministic)
  result(): RunResult;
  snapshot(): SimSnapshot; restore(s: SimSnapshot): void;
  hash(): number;                                 // FNV-1a over quantized state, for determinism tests
}
/** Optional dependency injection, so GP can test with hand-built worlds (tests/unit/sim/fixtures.ts). */
export interface SimDeps { makeWorld(cfg: WorldGenConfig): { gen: WorldGen; world: WorldQuery } }
