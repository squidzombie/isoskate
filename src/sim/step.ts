// sim/step.ts: the Sim (core/sim.ts) and its fixed step order (TECH §6.3):
//  1 time · 2 steering target · 3 interpret (tricks/) and apply intents · 4 magnet / ground align, then lateral motion ·
//  5 vertical motion by mode · 6 capture (air) and collision · 7 touchdown · 8 pickups and markers · 9 scoring ·
//  10 bookkeeping. Deterministic: it reads only RunConfig, InputFrames and the WorldGen output.
import type { GameEvent } from '../core/events';
import type { InputFrame } from '../core/input';
import type { AreaId, CrashCause, GatewayId, PropKind } from '../core/ids';
import type { RunConfig, RunResult, ScoreState, Sim, SimDeps, SimSnapshot, SkaterMode, SkaterState } from '../core/sim';
import type { TrickTables } from '../core/tricks';
import type { SkaterPose } from '../core/view';
import type { Coin, GroundHit, Obstacle, WorldGen, WorldGenConfig, WorldQuery } from '../core/world';
import { PIT_FALL_EPS } from '../core/tuning';
import { createWorldGen, createWorldQuery, fastQueryOf, type FastQuery } from '../world/gen';
import { SCORE, interpret, lose, tickCombo, type Intent, type InterpretView } from '../tricks';
import { copySkater, initState, modeOf, type Ctx, type SimState } from './state';
import { advanceTime, applySteer, lateral, nudgeTarget, timers } from './kinematics';
import { obstacleOfPit, rollGround } from './ground';
import { airStep, bufferOllie, pop, startFlip, startSpin, upgradeFlip, upgradeSpin } from './air';
import { predict } from './predict';
import { addPick, groundAlign, magnet, updatePickWindow } from './magnet';
import { endGrind, grindStep, latePick, tryCapture } from './grind';
import { endManual, manualStep, onTop, startManual } from './manual';
import { touchdown } from './landing';
import { collide } from './collide';
import { markers, pickups } from './pickups';
import { poseOf } from './pose';
import { hashState, readSnapshot, takeSnapshot } from './snapshot';

type MakeWorld = (cfg: WorldGenConfig) => { gen: WorldGen; world: WorldQuery };
const defaultWorld: MakeWorld = (cfg) => { const gen = createWorldGen(cfg); return { gen, world: createWorldQuery(gen) }; };
const worldKey = (c: RunConfig) => `${c.seed >>> 0}|${c.mode}|${c.startT ?? 0}|${c.startArea ?? 'downtown'}`;

export class SimImpl implements Sim, Ctx {
  st: SimState;
  obs: readonly Obstacle[] = [];
  readonly ev: GameEvent[] = [];
  private _gen: WorldGen;
  private _world: WorldQuery;
  private _worldKey: string;
  private readonly intents: Intent[] = [];
  private readonly view: InterpretView = { mode: 'roll', airLeft: 0, popBleed: 0, coyote: 0, flip: null, spin: null,
    pickOpen: false, comboWindow: -1, onTop: false, manual: false, manualLatched: false };
  private readonly makeWorld: MakeWorld;
  // Allocation-free world queries (world/gen FastQuery) and their scratch; contract calls for other worlds.
  private fast: FastQuery | undefined;
  private readonly obsBuf: Obstacle[] = [];
  private readonly coinBuf: Coin[] = [];
  private readonly groundBuf: [GroundHit, GroundHit] = [
    { y: 0, layer: 0, surface: 'asphalt', slab: null, pit: null }, { y: 0, layer: 0, surface: 'asphalt', slab: null, pit: null }];
  private readonly areaBuf: { area: AreaId; gateway: GatewayId | null } = { area: 'downtown', gateway: null };

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
  }

  step(f: InputFrame): readonly GameEvent[] {
    const ev = this.ev;
    ev.length = 0;
    const st = this.st, c = st.cur, sc = st.score;
    if (c.mode === 'crashed') return ev;
    copySkater(st.prev, c);
    // 1. Time.
    advanceTime(this);
    if (c.tick === 1) ev.push({ t: 'runStart', tick: c.tick, seed: st.cfg.seed, mode: st.cfg.mode, startArea: st.cfg.startArea ?? 'downtown' });
    timers(this);
    this.obs = this.fast ? this.fast.obstaclesInto(c.p.s - 2, c.p.s + 20, this.obsBuf) : this._world.obstacles(c.p.s - 2, c.p.s + 20);
    // 2. Steering target.
    let applied = applySteer(this, f);
    // 3. Interpret and apply.
    const v = this.view;
    v.mode = c.mode; v.airLeft = c.airLeft; v.popBleed = c.popBleed; v.coyote = c.coyote; v.flip = c.flip; v.spin = c.spin;
    v.pickOpen = st.pick.open; v.comboWindow = sc.combo.active ? sc.combo.window : -1; v.manual = c.mode === 'manual';
    v.onTop = (f.hold || f.manualKey) && c.mode === 'roll' ? onTop(this) : false;
    if (!f.hold && !f.manualKey) st.manualLatch = false;
    v.manualLatched = st.manualLatch;
    for (const it of interpret(v, f, this.tables, this.intents)) {
      if (this.apply(it) && 'swipe' in it && it.swipe && f.swipeDx) { nudgeTarget(this, -f.swipeDx); applied -= f.swipeDx; }
      if (st.cur.mode === 'crashed') return ev;
    }
    // 4. Magnet / ground align (they move targetX), then lateral motion.
    magnet(this, applied);
    groundAlign(this);
    lateral(this);
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
    // 6–7. Capture, collision, touchdown.
    if (c.mode === 'air') { predict(this); tryCapture(this); }
    if (modeOf(c) !== 'crashed') collide(this);
    if (c.mode === 'air' && c.vel.y <= 0) {
      const g = this.ground(c.p.s, c.p.x, st.prev.p.y + 1e-6);
      if (g.pit && !g.slab && c.p.y <= g.pit.lipY + PIT_FALL_EPS + 1e-9) {
        const ob = obstacleOfPit(this, g);
        if (!st.cfg.god) { this.crash(g.pit.cause, ob?.id ?? null); return ev; }
        if (!ob || !st.ghosted.has(ob.id)) this.crash(g.pit.cause, ob?.id ?? null);
        touchdown(this, g);
      } else if (c.p.y <= g.y + 1e-9) touchdown(this, g);
    }
    if (modeOf(c) === 'crashed') return ev;
    if (c.mode === 'air') predict(this); else { c.airLeft = 0; c.dropH = 0; }
    updatePickWindow(this);
    // 8. Pickups and markers.
    pickups(this);
    markers(this);
    // 9. Scoring: combo clocks (a roll-off drop keeps the rolling window running), distance, total.
    const comboMode: SkaterMode = c.mode === 'air' && st.air.reason === 'rollOff' ? 'roll' : c.mode;
    tickCombo(sc, ev, c.tick, comboMode);
    sc.distancePts = Math.floor((c.p.s - st.s0) * SCORE.distancePerM);
    sc.total = sc.distancePts + sc.trickPts + sc.bonusPts;
    sc.maxSpeed = Math.max(sc.maxSpeed, c.vel.s);
    return ev;
  }

  /** Apply one intent. Returns true when it consumed its swipe (→ swipe cancel). */
  private apply(it: Intent): boolean {
    const c = this.st.cur;
    switch (it.k) {
      case 'ollie': {
        const from: SkaterMode = c.mode === 'manual' ? 'manual' : 'roll';
        if (c.mode === 'manual') endManual(this, 'pop');
        pop(this, from, null);
        return true;
      }
      case 'spinOllie': {
        const from: SkaterMode = c.mode === 'manual' ? 'manual' : 'roll';
        if (c.mode === 'manual') endManual(this, 'pop');
        pop(this, from, it.dir);
        return true;
      }
      case 'flip': startFlip(this, it.id); return true;
      case 'flipUpgrade': upgradeFlip(this, it.to); return true;
      case 'spinUpgrade': upgradeSpin(this, it.to); return true;
      case 'pick': addPick(this, it.dir); if (c.mode === 'grind') latePick(this); return true;
      case 'popOut': endGrind(this, 'pop', null); return true;
      case 'spinOut': endGrind(this, 'pop', it.dir); return true;
      case 'manualStart': startManual(this); this.st.manualLatch = true; return false;
      case 'bufferOllie': bufferOllie(this); return false;
    }
  }

  crash(cause: CrashCause, obstacleId: number | null, kind: PropKind | null = null): void {
    const st = this.st, c = st.cur;
    const ob = obstacleId === null ? undefined : this._world.obstacle(obstacleId);
    const flipProgress = c.flip ? Math.min(1, c.flip.t / c.flip.dur) : 0;
    const spinProgress = c.spin ? Math.min(1, c.spin.t / c.spin.dur) : 0;
    const god = !!st.cfg.god;
    this.ev.push({ t: 'crash', tick: c.tick, cause, obstacleId, kind: ob?.kind ?? kind, speed: c.vel.s, state: c.mode,
      flipProgress, spinProgress, ...(god ? { god: true } : {}) });
    if (god) { if (obstacleId !== null) st.ghosted.add(obstacleId); return; }
    lose(st.score, this.ev, c.tick);
    st.crashMode = c.mode;
    c.crash = { cause, obstacleId, obstacleKind: ob?.kind ?? kind, tick: c.tick, flipProgress, spinProgress };
    c.mode = 'crashed';
    c.vel.y = 0;
    if (st.pick.open) { this.ev.push({ t: 'pickWindow', tick: c.tick, edgeId: st.pick.edgeId, open: false }); st.pick.open = false; c.pickWindow = null; }
    const sc = st.score;
    sc.distancePts = Math.floor((c.p.s - st.s0) * SCORE.distancePerM);
    sc.total = sc.distancePts + sc.trickPts + sc.bonusPts;
    this.ev.push({ t: 'runEnd', tick: c.tick, result: this.result() });
  }

  pose(): SkaterPose { return poseOf(this.st, this.tables); }

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

  snapshot(): SimSnapshot { return takeSnapshot(this.st); }

  restore(s: SimSnapshot): void {
    const st = readSnapshot(s);
    const key = worldKey(st.cfg);
    if (key !== this._worldKey) {
      const w = this.makeWorld({ seed: st.cfg.seed, mode: st.cfg.mode, startT: st.cfg.startT, startArea: st.cfg.startArea });
      this._gen = w.gen; this._world = w.world; this._worldKey = key;
      this.fast = fastQueryOf(w.world);
    }
    this.st = st;
  }

  hash(): number { return hashState(this.st); }
}
