// sim/state.ts: the sim's internal state (everything a snapshot must carry) and the per-step context the modules share.
// SkaterState / ScoreState are the frozen contract (core/sim.ts); SimState adds the bookkeeping the contract does not
// expose. Everything here is plain data (structuredClone-able), so snapshot() is one clone (TECH §6.7).
import type { AreaId, Dir8, FlipId, GatewayId, PropKind } from '../core/ids';
import type { InputFrameExt } from '../tricks';
import type { GameEvent } from '../core/events';
import type { RunConfig, ScoreState, SkaterMode, SkaterState } from '../core/sim';
import type { TrickTables } from '../core/tricks';
import { REWIND, sAt, speedAt } from '../core/tuning';
import type { Coin, GroundHit, GroundSlab, Obstacle, WorldGen, WorldQuery } from '../core/world';
import { emptyCombo } from '../tricks';

/** Per-air bookkeeping (reset at every take-off). */
export interface AirExt {
  reason: 'pop' | 'rollOff' | 'grindEnd';
  takeoffTick: number;                  // tick of the take-off (a grab HOLD must have gone down after it)
  takeoffY: number;                     // board bottom at take-off (dropH)
  takeoffS: number; takeoffX: number;   // where the air started (gaps)
  fromOb: number;                       // obstacle the board left (its slab top or its edge), −1: the street (gaps)
  doneFlips: { id: FlipId; doubleUp: boolean }[];   // flips finished earlier in this air (scored at touchdown)
  flipDoubleUp: boolean;                // the rotating flip is a Double-up (2nd separate flip)
  lastDoneTick: number;                 // tick the last rotation finished (−1: none) → Perfect window
  steerAway: number;                    // magnet cancel: net steering away from the magnet edge this jump (m)
  steerNet: number;                     // net steering applied this jump, after consumed swipes (m, + right)
  fromEdgeOb: number;                   // obstacle id of the edge we left (−1) → Transfer
  popEdge: number; popOb: number;       // the edge / obstacle a pop-out left (−1): no re-capture (RULES.popOutSkipsOwnEdge)
  popX: number;                         // x at that pop-out ("steering toward" the edge)
  spinOut: boolean;                     // the spin is a 180 Out
  grabbed: boolean;                     // a grab happened in this air (one per air)
  grabDur: number;                      // seconds the grab of this air was held (scored at touchdown / capture)
  grabHeldToLand: boolean;              // the grab's hold is still down: rolls into a manual on touchdown
  spinYaw0: number; spinT0: number;     // spin pose continuity across the 180 → 360 upgrade (deg, s)
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

/** What the last swipe started (keyboard amend, DESIGN §4.6). */
export interface StartExt { kind: 'ollie' | 'popOut' | 'flip' | 'pick' | 'switch'; tick: number }

/** Near-miss tracking (DESIGN §7): crash-top obstacles the board came close to (or touched) while passing them, until
 *  it has passed their far end. Fixed capacity, plain arrays (snapshot-friendly, no allocation per tick). */
export interface NearExt { ids: number[]; sEnd: number[]; side: number[]; contact: boolean[] }
export const NEAR_CAP = 8;

export interface SimState {
  cfg: RunConfig; startT: number; s0: number;
  cur: SkaterState; prev: SkaterState; score: ScoreState;
  air: AirExt; pick: PickExt; pred: PredExt;
  flipFrom: { roll: number; yaw: number; pitch: number };  // board angle (deg) the rotating flip eases from (upgrades)
  grindSnap: { dx: number; dy: number; entry: number };   // lock offsets (eased out over CAPTURE.snapT), combo entry idx
  grindPartT0: number;                  // grind time when the current part (after a switch) began
  manualEntry: number;                  // combo entry index of the running manual (−1)
  manualLatch: boolean;                 // the hold / key that started a manual is still down: no restart until released
  manualSrc: 'hold' | 'key' | 'prePress' | 'grab' | null;   // what started the running manual
  manualPartT0: number;                 // manual time when the running part began (0, the Nose Manual switch, a gateway cut)
  manualsSinceAir: number;              // manuals started since the last take-off (back-to-back manuals keep the heat)
  manualHeat: boolean;                  // the running manual keeps the combo heat running (RULES.backToBackManualPausesHeat)
  timedCarry: boolean;                  // the running grind / manual part is the rest of one a gateway bank cut (no entry pts)
  lastStart: StartExt | null;           // keyboard amend
  sw: { tick: number; dir: Dir8 | null };   // the last grind switch on this edge
  pressDown: boolean;                   // the press level of the previous frame (pressRiseTick edge)
  near: NearExt;
  gapped: Set<number>;                  // gap obstacles already paid this run
  landmarksPaid: string[];              // landmarks paid this area visit
  rewindsLeft: number;
  revertTick: number;                   // last revert (pose keeps fakie visible a few ticks)
  shadowY: number;                      // ground under the board (pose height in the air)
  wallSide: -1 | 0 | 1;                 // soft wall currently touched (bump on entry)
  /** Only inside a snapshot: the Lesson rewind ring at that moment (the live ring is kept by the Sim, not the state),
   *  so snapshot → restore replays rewinds exactly too. */
  ring?: SimState[];
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
  /** This tick's input frame (levels the touchdown rules read: press, hold, grab, manualKey). */
  f: Readonly<InputFrameExt>;
  /** Obstacles in [s − 2, s + 20] for this tick (collision, warnings, magnet and align candidates). */
  obs: readonly Obstacle[];
  /** world.groundAt without allocating: the result lives in scratch `slot` until the next call with that slot
   *  (slot 0: this tick's ground and touchdown checks; slot 1: the air prediction loop). */
  ground(s: number, x: number, yMax: number, slot?: 0 | 1): GroundHit;
  /** Obstacles overlapping [s0, s1] without allocating (valid until the next call; not `obs`). */
  obstaclesIn(s0: number, s1: number): readonly Obstacle[];
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

export const freshAir = (): AirExt => ({ reason: 'pop', takeoffTick: -1, takeoffY: 0, takeoffS: 0, takeoffX: 0, fromOb: -1, doneFlips: [],
  flipDoubleUp: false, lastDoneTick: -1, steerAway: 0, steerNet: 0, fromEdgeOb: -1, popEdge: -1, popOb: -1, popX: 0,
  spinOut: false, grabbed: false, grabDur: 0, grabHeldToLand: false, spinYaw0: 0, spinT0: 0 });

const freshNear = (): NearExt => ({ ids: [], sEnd: [], side: [], contact: [] });

export function initState(cfg: RunConfig): SimState {
  const startT = cfg.startT ?? 0;
  const cur = initSkater(startT);
  const startArea = cfg.startArea ?? 'downtown';
  return {
    cfg, startT, s0: cur.p.s, cur, prev: initSkater(startT), score: initScore(startArea),
    air: freshAir(), pick: { open: false, edgeId: -1, dirs: [], tick: -1, miss: 0 },
    pred: { tLand: 0, landY: 0, captureEdge: -1, tCapture: Infinity, magnetEdge: -1, magnetX: 0 },
    flipFrom: { roll: 0, yaw: 0, pitch: 0 }, grindSnap: { dx: 0, dy: 0, entry: -1 }, grindPartT0: 0, manualEntry: -1, manualLatch: false,
    manualSrc: null, manualPartT0: 0, manualsSinceAir: 0, manualHeat: false, timedCarry: false, lastStart: null, sw: { tick: -1, dir: null }, pressDown: false, near: freshNear(),
    gapped: new Set(), landmarksPaid: [], rewindsLeft: Math.max(0, Math.min(REWIND.max, Math.floor(cfg.rewinds ?? 0))),
    revertTick: -1, shadowY: 0, wallSide: 0,
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
