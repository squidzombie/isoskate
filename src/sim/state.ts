// sim/state.ts: the sim's internal state (everything a snapshot must carry) and the per-step context the modules share.
// SkaterState / ScoreState are the frozen contract (core/sim.ts); SimState adds the bookkeeping the contract does not
// expose. Everything here is plain data (structuredClone-able), so snapshot() is one clone (TECH §6.7).
import type { AreaId, Dir8, FlipId, GatewayId, PropKind } from '../core/ids';
import type { GameEvent } from '../core/events';
import type { RunConfig, ScoreState, SkaterMode, SkaterState } from '../core/sim';
import type { TrickTables } from '../core/tricks';
import { sAt, speedAt } from '../core/tuning';
import type { GroundSlab, Obstacle, WorldGen, WorldQuery } from '../core/world';
import { emptyCombo } from '../tricks';

/** Per-air bookkeeping (reset at every take-off). */
export interface AirExt {
  reason: 'pop' | 'rollOff' | 'grindEnd';
  takeoffY: number;                     // board bottom at take-off (dropH)
  doneFlips: { id: FlipId; doubleUp: boolean }[];   // flips finished earlier in this air (scored at touchdown)
  flipDoubleUp: boolean;                // the rotating flip is a Double-up (2nd separate flip)
  lastDoneTick: number;                 // tick the last rotation finished (−1: none) → Perfect window
  steerAway: number;                    // magnet cancel: net steering away from the magnet edge this jump (m)
  fromEdgeOb: number;                   // obstacle id of the edge we left (−1) → Transfer
  spinOut: boolean;                     // the spin is a 180 Out
}
/** Grind pick window (TECH §6.6): picks made while it is open. */
export interface PickExt {
  open: boolean; edgeId: number; dirs: Dir8[]; tick: number;   // tick of the last pick swipe (−1: none)
}
/** Prediction made each air tick (sim/predict.ts). */
export interface PredExt {
  tLand: number; landY: number;
  captureEdge: number; tCapture: number;  // soonest predicted capture (−1 / Infinity)
  magnetEdge: number; magnetX: number;    // magnet candidate (−1) and its axis x at the crossing
}

export interface SimState {
  cfg: RunConfig; startT: number; s0: number;
  cur: SkaterState; prev: SkaterState; score: ScoreState;
  air: AirExt; pick: PickExt; pred: PredExt;
  flipFrom: { roll: number; yaw: number; pitch: number };  // board angle (deg) the rotating flip eases from (upgrades)
  grindSnap: { dx: number; dy: number; entry: number };   // lock offsets (eased out over CAPTURE.snapT), combo entry idx
  manualEntry: number;                  // combo entry index of the running manual (−1)
  manualLatch: boolean;                 // the hold / key that started a manual is still down: no restart until released
  landTick: number; landDrop: number;   // last touchdown tick and its drop (pose landImpulse)
  slabKind: GroundSlab['kind']; stairStep: number; groundOb: number;   // ground under the board (stickiness, stairs, pads)
  tier: 0 | 1 | 2 | 3; area: AreaId; gateway: GatewayId | null; bestPassed: boolean;
  collected: Set<number>; knocked: Set<number>; ghosted: Set<number>; warned: Set<number>;
  coinChain: number; lastCoinTick: number;
  crashMode: SkaterMode;                // the mode the skater crashed in (RunResult.crash.state)
}

/** The mode read through a call, so TypeScript doesn't keep a narrowing across calls that change it. */
export const modeOf = (c: Readonly<SkaterState>): SkaterMode => c.mode;

/** What the sim modules share during one step. */
export interface Ctx {
  st: SimState;
  readonly world: WorldQuery;
  readonly gen: WorldGen;
  readonly tables: TrickTables;
  readonly ev: GameEvent[];
  /** Obstacles in [s − 2, s + 20] for this tick (collision, warnings, magnet and align candidates). */
  obs: readonly Obstacle[];
  crash(cause: 'slam' | 'badLanding' | 'fall' | 'splash', obstacleId: number | null, kind?: PropKind | null): void;
}

export function initSkater(t0: number): SkaterState {
  return {
    tick: 0, t: t0, p: { s: sAt(t0), x: 0, y: 0 }, vel: { s: speedAt(t0), x: 0, y: 0 }, targetX: 0,
    mode: 'roll', layer: 0, groundY: 0, surface: 'asphalt', airT: 0, airLeft: 0, dropH: 0,
    coyote: 0, jumpBuffer: 0, popBleed: 0, flip: null, flipsThisAir: 0, airTricks: [], spin: null, fakie: false,
    grind: null, pickWindow: null, magnetEdge: null, magnetCancelled: false, transferArmed: false,
    manual: null, grab: null, pressRiseTick: -1, wobble: 0, crash: null,
  };
}

export function initScore(startArea: AreaId): ScoreState {
  return {
    total: 0, trickPts: 0, distancePts: 0, bonusPts: 0, combo: emptyCombo(),
    bestCombo: 0, maxLinks: 0, lostCombo: 0, coins: 0, coinPayouts: 0, recent: [], tricks: {}, longestGrind: 0,
    areasReached: [], furthestArea: startArea, maxSpeed: 0,
  };
}

export const freshAir = (): AirExt => ({ reason: 'pop', takeoffY: 0, doneFlips: [], flipDoubleUp: false, lastDoneTick: -1,
  steerAway: 0, fromEdgeOb: -1, spinOut: false });

export function initState(cfg: RunConfig): SimState {
  const startT = cfg.startT ?? 0;
  const cur = initSkater(startT);
  const startArea = cfg.startArea ?? 'downtown';
  return {
    cfg, startT, s0: cur.p.s, cur, prev: initSkater(startT), score: initScore(startArea),
    air: freshAir(), pick: { open: false, edgeId: -1, dirs: [], tick: -1 },
    pred: { tLand: 0, landY: 0, captureEdge: -1, tCapture: Infinity, magnetEdge: -1, magnetX: 0 },
    flipFrom: { roll: 0, yaw: 0, pitch: 0 }, grindSnap: { dx: 0, dy: 0, entry: -1 }, manualEntry: -1, manualLatch: false,
    landTick: -1, landDrop: 0, slabKind: 'flat', stairStep: -1, groundOb: -1,
    tier: 0, area: startArea, gateway: null, bestPassed: false,
    collected: new Set(), knocked: new Set(), ghosted: new Set(), warned: new Set(),
    coinChain: 0, lastCoinTick: -1000, crashMode: 'roll',
  };
}

/** prev ← cur without allocating the hot fields (trick sub-states are small and copied by value). */
export function copySkater(dst: SkaterState, src: Readonly<SkaterState>): void {
  const p = dst.p, vel = dst.vel, airTricks = dst.airTricks;
  Object.assign(dst, src);
  dst.p = p; dst.vel = vel; dst.airTricks = airTricks;
  p.s = src.p.s; p.x = src.p.x; p.y = src.p.y;
  vel.s = src.vel.s; vel.x = src.vel.x; vel.y = src.vel.y;
  airTricks.length = 0;
  for (const id of src.airTricks) airTricks.push(id);
  dst.flip = src.flip && { ...src.flip };
  dst.spin = src.spin && { ...src.spin };
  dst.grind = src.grind && { ...src.grind };
  dst.manual = src.manual && { ...src.manual };
  dst.grab = src.grab && { ...src.grab };
  dst.pickWindow = src.pickWindow && { ...src.pickWindow };
  dst.crash = src.crash && { ...src.crash };
}
