// sim/step.ts: the Sim (core/sim.ts) and its fixed step order (TECH §6.3):
//  1 time · 2 steering target (and the press edge) · 3 interpret (tricks/) and apply intents · 4 magnet / ground
//  align, then lateral motion and the soft walls · 5 vertical motion by mode · 6 capture (air) and collision, near
//  misses · 7 touchdown · 8 pickups and markers · 9 scoring · 10 bookkeeping (Lesson rewind ring). Deterministic: it
//  reads only RunConfig, InputFrames and the WorldGen output.
import type { GameEvent } from '../core/events';
import type { InputFrame } from '../core/input';
import type { AreaId, CrashCause, Dir8, GatewayId, GrindId, ManualId, PropKind } from '../core/ids';
import type { RunConfig, RunResult, ScoreState, Sim, SimDeps, SimSnapshot, SkaterMode, SkaterState } from '../core/sim';
import type { TrickTables } from '../core/tricks';
import type { SkaterPose } from '../core/view';
import type { Coin, GroundHit, Obstacle, WorldGen, WorldGenConfig, WorldQuery } from '../core/world';
import { EMPTY_FRAME } from '../core/input';
import { DT, PIT_FALL_EPS, REWIND, SOFT_WALL_X } from '../core/tuning';
import { BUMP_WOBBLE } from './consts';
import { createWorldGen, createWorldQuery, fastQueryOf, type FastQuery } from '../world/gen';
import {
  SCORE, emptyView, interpret, lose, tickCombo, type AmendView, type InputFrameExt, type Intent, type InterpretView,
} from '../tricks';
import { copySkater, initState, modeOf, type Ctx, type SimState } from './state';
import { advanceTime, applySteer, lateral, nudgeTarget, timers } from './kinematics';
import { obstacleOfPit, rollGround } from './ground';
import {
  airStep, amendAir, bufferOllie, endGrab, grabTick, pop, startFlip, startGrab, started, upgradeFlip, upgradeSpin,
} from './air';
import { predict } from './predict';
import { addPick, groundAlign, magnet, updatePickWindow } from './magnet';
import { endGrind, grindStep, latePick, switchGrind, tryCapture } from './grind';
import { endManual, manualStep, noseManual, onTop, startManual } from './manual';
import { touchdown } from './landing';
import { collide } from './collide';
import { nearMiss } from './nearmiss';
import { markers, pickups } from './pickups';
import { poseOf } from './pose';
import { hashState, readSnapshot, takeSnapshot } from './snapshot';

type MakeWorld = (cfg: WorldGenConfig) => { gen: WorldGen; world: WorldQuery };
const defaultWorld: MakeWorld = (cfg) => { const gen = createWorldGen(cfg); return { gen, world: createWorldQuery(gen) }; };
const worldKey = (c: RunConfig) => `${c.seed >>> 0}|${c.mode}|${c.startT ?? 0}|${c.startArea ?? 'downtown'}`;

/** The rewind event with the crash it undid (GP request in docs/core-requests.md: M4 replays the hint for it). */
export interface RewindEventExt { t: 'rewind'; tick: number; toTick: number; cause: CrashCause; obstacleId: number | null;
  kind: PropKind | null; left: number }

/** Debug overlay data (GP request: DebugSnapshot.sim): the pick window, the combo clocks and the prediction. */
export interface SimDebugInfo {
  airLeft: number; heat: number; window: number; bankIn: number; magnetEdge: number | null; transferArmed: boolean;
  pick: { open: boolean; edgeId: number; tCapture: number; inSec: number; dirs: Dir8[]; grind: GrindId | null } | null;
  manual: { kind: ManualId; t: number; budget: number } | null;
  rewindsLeft: number;
}

export class SimImpl implements Sim, Ctx {
  st: SimState;
  obs: readonly Obstacle[] = [];
  readonly ev: GameEvent[] = [];
  f: Readonly<InputFrameExt> = EMPTY_FRAME;
  private _gen: WorldGen;
  private _world: WorldQuery;
  private _worldKey: string;
  private readonly intents: Intent[] = [];
  private readonly view: InterpretView = emptyView();
  private readonly manualView = { kind: 'manual' as ManualId, switched: false, fromHold: false };
  private readonly grindView = { id: 'fiftyFifty' as GrindId, sinceLock: 0, switches: 0, sinceSwitch: 0, lastSwitchDir: null as Dir8 | null };
  private readonly amendView: AmendView = { kind: 'ollie', age: 0, progress: 0 };
  private readonly makeWorld: MakeWorld;
  // Allocation-free world queries (world/gen FastQuery) and their scratch; contract calls for other worlds.
  private fast: FastQuery | undefined;
  private readonly obsBuf: Obstacle[] = [];
  private readonly obsBuf2: Obstacle[] = [];
  private readonly coinBuf: Coin[] = [];
  private readonly groundBuf: [GroundHit, GroundHit] = [
    { y: 0, layer: 0, surface: 'asphalt', slab: null, pit: null }, { y: 0, layer: 0, surface: 'asphalt', slab: null, pit: null }];
  private readonly areaBuf: { area: AreaId; gateway: GatewayId | null } = { area: 'downtown', gateway: null };
  // Lesson rewind (RunConfig.rewinds): snapshots every REWIND.snapEveryTicks, newest last; not part of the state.
  private ring: SimState[] = [];
  private rewindFrom: RewindEventExt | null = null;

  constructor(readonly tables: TrickTables, deps?: SimDeps) {
    this.makeWorld = deps?.makeWorld ?? defaultWorld;
    const cfg: RunConfig = { runId: 'none', seed: 0, mode: 'normal', firstRuns: false, bestDist: 0 };
    const w = this.makeWorld({ seed: 0, mode: 'normal' });
    this._gen = w.gen; this._world = w.world; this._worldKey = worldKey(cfg);
    this.fast = fastQueryOf(w.world);
    this.st = initState(cfg);
  }

  ground(s: number, x: number, yMax: number, slot: 0 | 1 = 0): GroundHit {
    return this.fast ? this.fast.groundInto(s, x, yMax, this.groundBuf[slot]) : this._world.groundAt(s, x, yMax);
  }
  obstaclesIn(s0: number, s1: number): readonly Obstacle[] {
    return this.fast ? this.fast.obstaclesInto(s0, s1, this.obsBuf2) : this._world.obstacles(s0, s1);
  }
  coinsNear(s0: number, s1: number): readonly Coin[] {
    return this.fast ? this.fast.coinsInto(s0, s1, this.coinBuf) : this._world.coins(s0, s1);
  }
  areaGateway(s: number): { readonly area: AreaId; readonly gateway: GatewayId | null } {
    if (this.fast) this.fast.areaGatewayInto(s, this.areaBuf);
    else { const a = this._gen.areaAt(s); this.areaBuf.area = a.area; this.areaBuf.gateway = a.gateway; }
    return this.areaBuf;
  }

  get cur(): Readonly<SkaterState> { return this.st.cur; }
  get prev(): Readonly<SkaterState> { return this.st.prev; }
  get score(): Readonly<ScoreState> { return this.st.score; }
  get gen(): WorldGen { return this._gen; }
  get world(): WorldQuery { return this._world; }

  reset(cfg: RunConfig): void {
    const w = this.makeWorld({ seed: cfg.seed, mode: cfg.mode, startT: cfg.startT, startArea: cfg.startArea });
    this._gen = w.gen; this._world = w.world; this._worldKey = worldKey(cfg);
    this.fast = fastQueryOf(w.world);
    this.st = initState(cfg);
    const a = this._gen.areaAt(this.st.s0);
    this.st.area = a.area; this.st.gateway = a.gateway;
    this.ev.length = 0;
    this.obs = [];
    this.ring = [];
    this.rewindFrom = null;
  }

  step(f: InputFrame): readonly GameEvent[] {
    const ev = this.ev;
    ev.length = 0;
    if (this.st.cur.mode === 'crashed') return ev;
    this.f = f;
    this.tick(f);
    if (this.rewindFrom) this.rewind();
    else if (this.st.rewindsLeft > 0 && modeOf(this.st.cur) !== 'crashed' && this.st.cur.tick % REWIND.snapEveryTicks === 0) this.keepSnapshot();
    return ev;
  }

  private tick(f: Readonly<InputFrameExt>): void {
    const ev = this.ev;
    const st = this.st, c = st.cur, sc = st.score;
    copySkater(st.prev, c);
    // 1. Time.
    advanceTime(this);
    if (c.tick === 1) ev.push({ t: 'runStart', tick: c.tick, seed: st.cfg.seed, mode: st.cfg.mode, startArea: st.cfg.startArea ?? 'downtown' });
    timers(this);
    this.obs = this.fast ? this.fast.obstaclesInto(c.p.s - 2, c.p.s + 20, this.obsBuf) : this._world.obstacles(c.p.s - 2, c.p.s + 20);
    // 2. Steering target; the press edge (pre-press window, resting-thumb manuals) and the manual latch.
    let applied = applySteer(this, f);
    if (f.press && !st.pressDown) c.pressRiseTick = c.tick;
    else if (!f.press) c.pressRiseTick = -1;
    st.pressDown = f.press;
    if (!f.hold && !f.manualKey && !f.press) st.manualLatch = false;
    // 3. Interpret and apply. Consumed air swipes give back their steering (DESIGN §4.4 rule 2), at most the lead it
    //    left in its direction: the steering lead cap (STEER_LEAD_MAX) may have kept part of swipeDx from ever applying.
    for (const it of interpret(this.viewOf(f), f, this.tables, this.intents)) {
      if (this.apply(it) && f.swipeDx) {
        const lead = c.targetX - c.p.x;
        const back = f.swipeDx > 0 ? Math.min(f.swipeDx, Math.max(0, lead)) : Math.max(f.swipeDx, Math.min(0, lead));
        nudgeTarget(this, -back); applied -= back;
      }
      if (modeOf(c) === 'crashed') return;
    }
    // 4. Magnet / ground align (they move targetX), then lateral motion and the soft walls.
    magnet(this, applied);
    groundAlign(this);
    lateral(this);
    this.walls();
    // 5. Vertical motion by mode.
    if (c.mode === 'roll' || c.mode === 'manual') {
      const wasManual = c.mode === 'manual';
      const r = rollGround(this);
      if (wasManual && r !== 'crash') {
        if (r === 'air') endManual(this, 'release');
        else manualStep(this, f, r === 'bump');
      }
    } else if (c.mode === 'air') airStep(this);
    else if (c.mode === 'grind') grindStep(this);
    if (modeOf(c) === 'crashed') return;
    // 6–7. Capture, collision, near misses, touchdown.
    if (c.mode === 'air') { predict(this); tryCapture(this); }
    if (modeOf(c) !== 'crashed') collide(this);
    if (modeOf(c) === 'crashed') return;
    nearMiss(this);
    st.shadowY = c.mode === 'air' ? st.shadowY : c.p.y;
    if (c.mode === 'air') {
      const g = this.ground(c.p.s, c.p.x, st.prev.p.y + 1e-6);
      st.shadowY = g.y;
      if (c.vel.y <= 0) {
        if (g.pit && !g.slab && c.p.y <= g.pit.lipY + PIT_FALL_EPS + 1e-9) {
          const ob = obstacleOfPit(this, g);
          if (!st.cfg.god) { this.crash(g.pit.cause, ob?.id ?? null); return; }
          if (!ob || !st.ghosted.has(ob.id)) this.crash(g.pit.cause, ob?.id ?? null);
          touchdown(this, g);
        } else if (c.p.y <= g.y + 1e-9) touchdown(this, g);
      }
    }
    if (modeOf(c) === 'crashed') return;
    if (c.mode === 'air') { predict(this); grabTick(this); } else { c.airLeft = 0; c.dropH = 0; }
    updatePickWindow(this);
    // 8. Pickups and markers.
    pickups(this);
    markers(this);
    // 9. Scoring: combo clocks (a roll-off drop keeps the rolling window running; a back-to-back manual keeps the
    // heat running), distance, total.
    const comboMode: SkaterMode = c.mode === 'air' && st.air.reason === 'rollOff' ? 'roll' : c.mode;
    tickCombo(sc, ev, c.tick, comboMode, c.mode === 'manual' && st.manualHeat);
    sc.distancePts = Math.floor((c.p.s - st.s0) * SCORE.distancePerM);
    sc.total = sc.distancePts + sc.trickPts + sc.bonusPts;
    sc.maxSpeed = Math.max(sc.maxSpeed, c.vel.s);
  }

  /** The interpretation view of the current state (reused objects: no allocation per tick). */
  private viewOf(f: Readonly<InputFrame>): InterpretView {
    const st = this.st, c = st.cur, sc = st.score, v = this.view;
    v.mode = c.mode; v.airLeft = c.airLeft; v.popBleed = c.popBleed; v.coyote = c.coyote; v.flip = c.flip; v.spin = c.spin;
    v.grab = !!c.grab; v.grabbed = c.mode === 'air' && st.air.grabbed;
    v.pressInAir = c.mode === 'air' && c.pressRiseTick > st.air.takeoffTick;
    v.pickOpen = st.pick.open; v.comboWindow = sc.combo.active ? sc.combo.window : -1;
    v.onTop = (f.hold || f.manualKey) && c.mode === 'roll' ? onTop(this) : false;
    v.manualLatched = st.manualLatch;
    v.pressAge = c.pressRiseTick >= 0 ? (c.tick - c.pressRiseTick) * DT : -1;
    if (c.manual) {
      const m = this.manualView;
      m.kind = c.manual.kind; m.switched = c.manual.switched; m.fromHold = st.manualSrc === 'hold';
      v.manual = m;
    } else v.manual = null;
    if (c.grind) {
      const g = this.grindView;
      g.id = c.grind.id; g.sinceLock = (c.tick - c.grind.lockTick) * DT; g.switches = c.grind.switches;
      g.sinceSwitch = st.sw.tick >= 0 ? (c.tick - st.sw.tick) * DT : Infinity; g.lastSwitchDir = st.sw.dir;
      v.grind = g;
    } else v.grind = null;
    const ls = st.lastStart;
    if (ls) {
      const a = this.amendView;
      a.kind = ls.kind; a.age = (c.tick - ls.tick) * DT;
      a.progress = ls.kind === 'flip' && c.flip ? c.flip.t / c.flip.dur : 0;
      v.amend = a;
    } else v.amend = null;
    return v;
  }

  /** Apply one intent. Returns true when it consumed an air swipe (→ swipe cancel, DESIGN §4.4 rule 2: flips, upgrades
   *  and picks in the air). Pops from the ground, a manual or a grind keep the swipe's steering, so a dodge that also
   *  pops is still a dodge (and grinds ignore steering, so there is nothing to cancel). */
  private apply(it: Intent): boolean {
    const c = this.st.cur, f = this.f;
    switch (it.k) {
      case 'ollie':
      case 'spinOllie': {
        const from: SkaterMode = c.mode === 'manual' ? 'manual' : 'roll';
        if (c.mode === 'manual') endManual(this, 'pop');
        pop(this, from, it.k === 'spinOllie' ? it.dir : null);
        if (f.swipe) started(this, 'ollie');
        return false;
      }
      case 'flip': startFlip(this, it.id); started(this, 'flip'); return true;
      case 'flipUpgrade': upgradeFlip(this, it.to); return true;
      case 'spinUpgrade': upgradeSpin(this, it.to); return true;
      case 'pick': {
        addPick(this, it.dir, it.amend);
        if (c.mode === 'grind') latePick(this);
        started(this, 'pick');
        return it.air;
      }
      case 'switch': switchGrind(this, it.to, it.inPlace, f.swipe); started(this, 'switch'); return false;
      case 'popOut': endGrind(this, 'pop', null); if (f.swipe) started(this, 'popOut'); return false;
      case 'spinOut': endGrind(this, 'pop', it.dir); return false;
      case 'manualStart': startManual(this, it.src); return false;
      case 'noseManual': noseManual(this); return false;
      case 'grabStart': startGrab(this); return false;
      case 'grabEnd': endGrab(this); return false;
      case 'bufferOllie': bufferOllie(this); return false;
      case 'amend': amendAir(this, it.dir); return it.air;
    }
  }

  /** Soft walls (DESIGN §5.3): touching one is a harmless bump with a wobble (`bump`, kind 'wall'), once per contact. */
  private walls(): void {
    const st = this.st, c = st.cur;
    const side: -1 | 0 | 1 = c.mode === 'grind' || Math.abs(c.p.x) <= SOFT_WALL_X ? 0 : c.p.x < 0 ? -1 : 1;
    if (side !== 0 && side !== st.wallSide) {
      c.wobble = Math.max(c.wobble, BUMP_WOBBLE);
      this.ev.push({ t: 'bump', tick: c.tick, side, kind: 'wall' });
    }
    st.wallSide = side;
  }

  crash(cause: CrashCause, obstacleId: number | null, kind: PropKind | null = null): void {
    const st = this.st, c = st.cur;
    const ob = obstacleId === null ? undefined : this._world.obstacle(obstacleId);
    const flipProgress = c.flip ? Math.min(1, c.flip.t / c.flip.dur) : 0;
    const spinProgress = c.spin ? Math.min(1, c.spin.t / c.spin.dur) : 0;
    const god = !!st.cfg.god;
    // Lesson rewind: the crash is undone at the end of this tick (step → rewind), not applied.
    if (!god && st.rewindsLeft > 0 && this.ring.length) {
      this.rewindFrom = { t: 'rewind', tick: c.tick, toTick: -1, cause, obstacleId, kind: ob?.kind ?? kind, left: st.rewindsLeft - 1 };
      c.mode = 'crashed';                                // every caller stops this tick, as for a real crash
      return;
    }
    this.ev.push({ t: 'crash', tick: c.tick, cause, obstacleId, kind: ob?.kind ?? kind, speed: c.vel.s, state: c.mode,
      flipProgress, spinProgress, ...(god ? { god: true } : {}) });
    if (god) { if (obstacleId !== null) st.ghosted.add(obstacleId); return; }
    lose(st.score, this.ev, c.tick);
    st.crashMode = c.mode;
    c.crash = { cause, obstacleId, obstacleKind: ob?.kind ?? kind, tick: c.tick, flipProgress, spinProgress };
    c.mode = 'crashed';
    c.vel.y = 0;
    c.grab = null;
    if (st.pick.open) { this.ev.push({ t: 'pickWindow', tick: c.tick, edgeId: st.pick.edgeId, open: false }); st.pick.open = false; c.pickWindow = null; }
    const sc = st.score;
    sc.distancePts = Math.floor((c.p.s - st.s0) * SCORE.distancePerM);
    sc.total = sc.distancePts + sc.trickPts + sc.bonusPts;
    this.ev.push({ t: 'runEnd', tick: c.tick, result: this.result() });
  }

  /** Lesson rewind ring: one snapshot every REWIND.snapEveryTicks ticks, at most REWIND.ring of them. */
  private keepSnapshot(): void {
    if (this.ring.length >= REWIND.ring) this.ring.shift();
    this.ring.push(structuredClone(this.st));
  }

  /** Restore the newest snapshot at least REWIND.sec old (else the oldest), with one rewind fewer, and emit `rewind`. */
  private rewind(): void {
    const from = this.rewindFrom!;
    this.rewindFrom = null;
    const ring = this.ring;
    let i = ring.length - 1;
    while (i > 0 && (from.tick - ring[i]!.cur.tick) * DT < REWIND.sec - 1e-9) i--;
    const snap = ring[i]!;
    ring.length = i + 1;
    this.st = structuredClone(snap);
    this.st.rewindsLeft = from.left;
    for (const r of ring) r.rewindsLeft = from.left;
    from.toTick = this.st.cur.tick;
    this.ev.length = 0;
    this.ev.push(from);
  }

  pose(): SkaterPose { return poseOf(this.st, this.tables); }

  /** Debug overlay data: the pick window, heat and airLeft (GP request: DebugSnapshot.sim). */
  debug(): SimDebugInfo {
    const st = this.st, c = st.cur, cb = st.score.combo, pk = st.pick;
    return {
      airLeft: c.airLeft, heat: cb.active ? cb.heat : 0, window: cb.window, bankIn: cb.bankIn,
      magnetEdge: c.magnetEdge, transferArmed: c.transferArmed,
      pick: pk.open ? { open: true, edgeId: pk.edgeId, tCapture: c.pickWindow?.tCapture ?? c.t, inSec: Math.max(0, (c.pickWindow?.tCapture ?? c.t) - c.t),
        dirs: pk.dirs.slice(), grind: c.grind?.id ?? null } : null,
      manual: c.manual ? { kind: c.manual.kind, t: c.manual.t, budget: c.manual.budget } : null,
      rewindsLeft: st.rewindsLeft,
    };
  }

  result(): RunResult {
    const st = this.st, sc = st.score, c = st.cur;
    return {
      runId: st.cfg.runId, seed: st.cfg.seed, mode: st.cfg.mode, startArea: st.cfg.startArea ?? 'downtown',
      score: sc.total, trickPts: sc.trickPts, distance: c.p.s - st.s0, durationS: c.t - st.startT,
      coins: sc.coins, coinPayouts: sc.coinPayouts, bestCombo: sc.bestCombo, maxLinks: sc.maxLinks, lostCombo: sc.lostCombo,
      furthestArea: sc.furthestArea, areasReached: sc.areasReached.slice(), maxSpeed: sc.maxSpeed,
      tricks: { ...sc.tricks }, longestGrind: sc.longestGrind,
      crash: c.crash ? { cause: c.crash.cause, obstacleKind: c.crash.obstacleKind, state: st.crashMode, t: c.t,
        flipProgress: c.crash.flipProgress, spinProgress: c.crash.spinProgress } : null,
    };
  }

  snapshot(): SimSnapshot { return takeSnapshot(this.ring.length ? { ...this.st, ring: this.ring } : this.st); }

  restore(s: SimSnapshot): void {
    const st = readSnapshot(s);
    const key = worldKey(st.cfg);
    if (key !== this._worldKey) {
      const w = this.makeWorld({ seed: st.cfg.seed, mode: st.cfg.mode, startT: st.cfg.startT, startArea: st.cfg.startArea });
      this._gen = w.gen; this._world = w.world; this._worldKey = key;
      this.fast = fastQueryOf(w.world);
    }
    this.ring = st.ring ?? [];
    delete st.ring;
    this.st = st;
    this.rewindFrom = null;
  }

  hash(): number { return hashState(this.st); }
}
