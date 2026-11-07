// core/input.ts (TECH §4.4). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
import type { Dir8 } from './ids';

/** One per sim tick. Recordable/replayable. Gestures only; meaning is decided by the sim (DESIGN §4.3). */
export interface InputFrame {
  steerDx: number;       // metres to add to targetX this tick (touch/mouse drag, sensitivity applied)
  steerAxis: number;     // −1..1 held keys / stick: targetX moves at steerAxis·V_LAT_MAX
  tap: boolean;          // edge: still touch released ≤ 350 ms after down | Space/W keydown | 2nd-finger tap | pad A
  swipe: Dir8 | null;    // edge: recognized swipe | arrow-key direction
  swipeDx: number;       // metres of steering that stroke contributed: its 80 ms window, or all since touch-down if ≤ 150 ms old
  swipeFast: boolean;    // ≥ 60·k px in 80 ms (≥ 0.75 px/ms)
  swipeFromRest: boolean;// the thumb was parked (< 0.15 px/ms for ≥ 60 ms) right before the flick
  swipeSteer: boolean;   // the stroke is the steering owner and older than 150 ms (steering-stroke rule, DESIGN §4.3)
  swipeAmend: boolean;   // keyboard: a 2nd arrow ≤ 80 ms after the 1st; replaces it with the diagonal if the trick is < 25% done
  hold: boolean;         // level: touch HOLD active (still ≥ 200 ms). Ground → manual (if allowed); air → grab.
  press: boolean;        // level: a non-DRAG touch is down, or the manual key is held. The sim tracks its rising edge
                         //        for the pre-press window (0.30–0.10 s before touchdown). A touch that becomes a DRAG drops it.
  manualKey: boolean;    // level: S/Shift/RT held. Ground → manual like HOLD; air → never a grab (press handles pre-press)
  grab: boolean;         // level: Q / LT held
  /** added @G1 (GP request 1): edge: a still touch released after tapMaxMs and ≤ longTapMaxMs (600 ms) after down,
   *  a HOLD that never moved. The sim reads it as a TAP wherever that hold started nothing. */
  longTap?: boolean;
}
export const EMPTY_FRAME: Readonly<InputFrame> = { steerDx: 0, steerAxis: 0, tap: false, swipe: null, swipeDx: 0,
  swipeFast: false, swipeFromRest: false, swipeSteer: false, swipeAmend: false,
  hold: false, press: false, manualKey: false, grab: false };

export interface PointerSample { id: number; tMs: number; x: number; y: number; phase: 'down' | 'move' | 'up' | 'cancel' }
export type Gesture =
  | { k: 'steer'; tMs: number; dxPx: number }
  | { k: 'tap'; tMs: number }
  | { k: 'swipe'; tMs: number; dir: Dir8; dxPx: number; fast: boolean; fromRest: boolean; steer: boolean }
  | { k: 'holdStart'; tMs: number } | { k: 'holdEnd'; tMs: number; release?: true }   // release: the long tap (added @G1)
  | { k: 'press'; tMs: number; down: boolean };
export interface RecognizerConfig {
  slopPx: number; tapMaxMs: number; holdMs: number;                 // 10, 350, 200
  swipeWindowMs: number; swipeMinPx: number; fastMinPx: number;     // 80, 32, 60
  liftSwipeMinPx: number; liftSuppressMs: number;                   // 24, 150
  recoilMs: number; recoilDeg: number;                              // 150, 60
  refireMs: number; refireDip: number;                              // 90, 0.5 (speed must dip below 50% of the last peak)
  restSpeed: number; restMs: number; steerStrokeMs: number;         // 0.15 px/ms, 60, 150
  cardinalHalfDeg: number; diagonalHalfDeg: number;                 // 30, 15
  arcCompDeg: number; arcOuterFrac: number;                         // 8, 0.4
  simpleTricks: boolean;                                            // Settings: diagonals snap to cardinals
  deadZoneBottomPx: number;                                         // safeBottom + 12
  k: number;                                                        // clamp(screenW/390, 0.85, 1.3)
  // CSS px (added @G0): arc compensation uses the outer arcOuterFrac of screenW; touch-starts below
  // screenH − deadZoneBottomPx are ignored. 0 / absent = 390·k / no dead zone.
  screenW?: number; screenH?: number;
}
export interface GestureRecognizer {                       // pure; unit-tested with synthetic traces
  feed(s: PointerSample): Gesture[];                       // 'cancel' → no tap/swipe, ends hold, frees steering
  tick(nowMs: number): Gesture[];                          // time-based transitions (HOLD at 200 ms)
  reset(): void;
  readonly config: RecognizerConfig;
}
export interface InputSource {
  /** Collect everything with timestamp ≤ tickEndMs into one frame. Called once per sim tick. */
  frame(tickEndMs: number): InputFrame;
  setEnabled(on: boolean): void;
  setSensitivity(mult: number): void;                      // 0.6..1.6
  setPreset(p: 'A' | 'B'): void;
  onAnyInput(f: () => void): () => void;                   // fires on pointerup/touchend/click/keydown (user activation): audio unlock
  setSimpleTricks?(on: boolean): void;                     // Settings "Simple tricks" → RecognizerConfig.simpleTricks (added @m0-core)
  /** Schedules a synthetic trace through the real recognizer and frame binning: the first sample lands at `atMs`
   *  (default now), later samples keep their relative times (debug `__skate.pointer` in rAF mode; added @G0). */
  inject?(samples: readonly PointerSample[], atMs?: number): void;
  dispose(): void;
}
