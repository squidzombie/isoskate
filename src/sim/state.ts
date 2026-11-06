// sim/state.ts: the sim's internal state (everything a snapshot must carry) and the per-step context the modules share.
// SkaterState / ScoreState are the frozen contract (core/sim.ts); SimState adds the bookkeeping the contract does not
// expose. Everything here is plain data (structuredClone-able), so snapshot() is one clone (TECH §6.7).
import type { AreaId, Dir8, FlipId, GatewayId, PropKind } from '../core/ids';
import type { GameEvent } from '../core/events';
import type { RunConfig, ScoreState, SkaterMode, SkaterState } from '../core/sim';
import type { TrickTables } from '../core/tricks';
import { sAt, speedAt } from '../core/tuning';
import type { Coin, GroundHit, GroundSlab, Obstacle, WorldGen, WorldQuery } from '../core/world';
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
  miss: number;                         // consecutive air ticks the open window's capture was not predicted (hysteresis)
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
  /** world.groundAt without allocating: the result lives in scratch `slot` until the next call with that slot
   *  (slot 0: this tick's ground and touchdown checks; slot 1: the air prediction loop). */
  ground(s: number, x: number, yMax: number, slot?: 0 | 1): GroundHit;
  /** world.coins without allocating (valid until the next call). */
  coinsNear(s0: number, s1: number): readonly Coin[];
  /** The area and gateway at s (gen.areaAt's area / gateway) without allocating. */
  areaGateway(s: number): { readonly area: AreaId; readonly gateway: GatewayId | null };
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
    air: freshAir(), pick: { open: false, edgeId: -1, dirs: [], tick: -1, miss: 0 },
    pred: { tLand: 0, landY: 0, captureEdge: -1, tCapture: Infinity, magnetEdge: -1, magnetX: 0 },
    flipFrom: { roll: 0, yaw: 0, pitch: 0 }, grindSnap: { dx: 0, dy: 0, entry: -1 }, manualEntry: -1, manualLatch: false,
    landTick: -1, landDrop: 0, slabKind: 'flat', stairStep: -1, groundOb: -1,
    tier: 0, area: startArea, gateway: null, bestPassed: false,
    collected: new Set(), knocked: new Set(), ghosted: new Set(), warned: new Set(),
    coinChain: 0, lastCoinTick: -1000, crashMode: 'roll',
  };
}

type SubKey = 'flip' | 'spin' | 'grind' | 'manual' | 'grab' | 'pickWindow' | 'crash';
const SUB_KEYS: readonly SubKey[] = ['flip', 'spin', 'grind', 'manual', 'grab', 'pickWindow', 'crash'];
/** Spare sub-state objects per destination (prev), reused so copySkater allocates nothing once warm. They never
 *  alias the source's objects, and they are not part of the state (snapshots clone prev on their own). */
const SPARES = new WeakMap<SkaterState, Partial<Record<SubKey, object>>>();
const OLD: (object | null)[] = SUB_KEYS.map(() => null);

/** prev ← cur without allocating: plain fields one by one (a generic copy would box every number), the trick
 *  sub-states copied by value into reused objects (TECH §6.3: no allocation per tick). A field added to SkaterState
 *  must be added here: tests/unit/sim/replay.test.ts checks the copy is complete. */
export function copySkater(dst: SkaterState, src: Readonly<SkaterState>): void {
  let spares = SPARES.get(dst);
  if (!spares) { spares = {}; SPARES.set(dst, spares); }
  const p = dst.p, vel = dst.vel, airTricks = dst.airTricks;
  const d = dst as unknown as Record<SubKey, object | null>;
  for (let i = 0; i < SUB_KEYS.length; i++) OLD[i] = d[SUB_KEYS[i]!];
  dst.tick = src.tick; dst.t = src.t; dst.targetX = src.targetX;
  dst.mode = src.mode; dst.layer = src.layer; dst.groundY = src.groundY; dst.surface = src.surface;
  dst.airT = src.airT; dst.airLeft = src.airLeft; dst.dropH = src.dropH;
  dst.coyote = src.coyote; dst.jumpBuffer = src.jumpBuffer; dst.popBleed = src.popBleed;
  dst.flipsThisAir = src.flipsThisAir; dst.fakie = src.fakie;
  dst.magnetEdge = src.magnetEdge; dst.magnetCancelled = src.magnetCancelled; dst.transferArmed = src.transferArmed;
  dst.pressRiseTick = src.pressRiseTick; dst.wobble = src.wobble;
  p.s = src.p.s; p.x = src.p.x; p.y = src.p.y;
  vel.s = src.vel.s; vel.x = src.vel.x; vel.y = src.vel.y;
  airTricks.length = 0;
  for (const id of src.airTricks) airTricks.push(id);
  for (let i = 0; i < SUB_KEYS.length; i++) {
    const key = SUB_KEYS[i]!;
    const from = src[key] as object | null, mine = OLD[i]!;
    OLD[i] = null;
    if (from) d[key] = Object.assign(mine ?? spares[key] ?? {}, from);
    else { if (mine) spares[key] = mine; d[key] = null; }
  }
}
