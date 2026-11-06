// sim/stub.ts: M0 kinematic stub of the Sim contract (core/sim.ts). Deterministic and DOM-free.
// It rolls forward on the speed schedule, carves toward targetX (P-controller, soft walls), follows ground slabs,
// ollies on TAP / ↑, starts single flips and spin ollies, lands with the DESIGN §7 bands, picks up coins and
// crashes on solids with simplified TECH §6.4 rules. Enough to drive the camera, views, HUD and app flow.
// TODO(M0-sim): the full step order of TECH §6.3 (interpret, magnet through targetX, capture and grinds, coyote,
// jump buffer, skim/side-bump classification at first contact, pits, near miss, combo/scoring), zero allocation.
import type { InputFrame } from '../core/input';
import { approach, clamp } from '../core/math';
import { hash32 } from '../core/rng';
import type { RunConfig, RunResult, ScoreState, Sim, SimDeps, SimSnapshot, SkaterState } from '../core/sim';
import type { TrickTables } from '../core/tricks';
import {
  A_LAT_AIR, A_LAT_GROUND, DT, FACE_INSET, G, HITBOX, LAND, POP_BLEED, SIDE_BUMP_V, SOFT_WALL_K, SOFT_WALL_X,
  SPEED_TIERS, STEER_GAIN, STEER_P, STEP_UP, TARGET_X_MAX, V_LAT_MAX, V_POP, sAt, speedAt,
} from '../core/tuning';
import type { GameEvent } from '../core/events';
import type { SkaterPose } from '../core/view';
import type { AreaId, Dir8, TrickId } from '../core/ids';
import type { WorldGen, WorldGenConfig, WorldQuery } from '../core/world';
import { createWorldGen, createWorldQuery } from '../world/gen';

const DEG = Math.PI / 180;
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;

function initState(t0: number): SkaterState {
  return {
    tick: 0, t: t0, p: { s: sAt(t0), x: 0, y: 0 }, vel: { s: speedAt(t0), x: 0, y: 0 }, targetX: 0,
    mode: 'roll', layer: 0, groundY: 0, surface: 'asphalt', airT: 0, airLeft: 0, dropH: 0,
    coyote: 0, jumpBuffer: 0, popBleed: 0, flip: null, flipsThisAir: 0, airTricks: [], spin: null, fakie: false,
    grind: null, pickWindow: null, magnetEdge: null, magnetCancelled: false, transferArmed: false,
    manual: null, grab: null, pressRiseTick: -1, wobble: 0, crash: null,
  };
}
function initScore(): ScoreState {
  return {
    total: 0, trickPts: 0, distancePts: 0, bonusPts: 0,
    combo: { active: false, entries: [], flat: 0, links: 0, manualLinked: false, manualCount: 0, window: 0, heat: 0,
      bankIn: 0, startTick: 0, pending: 0, uniqueNames: 0 },
    bestCombo: 0, maxLinks: 0, lostCombo: 0, coins: 0, coinPayouts: 0, recent: [], tricks: {}, longestGrind: 0,
    areasReached: [], furthestArea: 'downtown', maxSpeed: 0,
  };
}
/** Copy `src` into `dst` (flat fields + nested p/vel; trick sub-states are cloned when present). */
function copyState(dst: SkaterState, src: Readonly<SkaterState>): void {
  const { p, vel } = dst;
  Object.assign(dst, src);
  dst.p = p; dst.vel = vel;
  Object.assign(dst.p, src.p); Object.assign(dst.vel, src.vel);
  dst.flip = src.flip && { ...src.flip };
  dst.spin = src.spin && { ...src.spin };
  dst.airTricks = src.airTricks.slice();
}

interface Internal {
  cfg: RunConfig; startT: number; s0: number;
  cur: SkaterState; prev: SkaterState; score: ScoreState;
  collected: number[]; knocked: number[]; lastArea: AreaId; tier: 0 | 1 | 2 | 3; landTick: number;
}

export class StubSim implements Sim {
  private st: Internal;
  private _gen: WorldGen;
  private _world: WorldQuery;
  private readonly events: GameEvent[] = [];
  private readonly collected = new Set<number>();
  private readonly knocked = new Set<number>();
  /** God mode: obstacles whose crash was logged are passed through from then on. */
  private readonly ghosted = new Set<number>();
  private readonly makeWorld: (cfg: WorldGenConfig) => { gen: WorldGen; world: WorldQuery };

  constructor(private readonly tables: TrickTables, deps?: SimDeps) {
    this.makeWorld = deps?.makeWorld ?? ((cfg) => { const gen = createWorldGen(cfg); return { gen, world: createWorldQuery(gen) }; });
    const w = this.makeWorld({ seed: 0, mode: 'normal' });
    this._gen = w.gen; this._world = w.world;
    this.st = this.fresh({ runId: 'none', seed: 0, mode: 'normal', firstRuns: false, bestDist: 0 });
  }

  get cur(): Readonly<SkaterState> { return this.st.cur; }
  get prev(): Readonly<SkaterState> { return this.st.prev; }
  get score(): Readonly<ScoreState> { return this.st.score; }
  get gen(): WorldGen { return this._gen; }
  get world(): WorldQuery { return this._world; }

  private fresh(cfg: RunConfig): Internal {
    const startT = cfg.startT ?? 0;
    const cur = initState(startT);
    const prev = initState(startT);
    return { cfg, startT, s0: cur.p.s, cur, prev, score: initScore(), collected: [], knocked: [],
      lastArea: cfg.startArea ?? 'downtown', tier: 0, landTick: -1 };
  }

  reset(cfg: RunConfig): void {
    const w = this.makeWorld({ seed: cfg.seed, mode: cfg.mode, startT: cfg.startT, startArea: cfg.startArea });
    this._gen = w.gen; this._world = w.world;
    this.st = this.fresh(cfg);
    this.collected.clear(); this.knocked.clear(); this.ghosted.clear();
    this.st.score.furthestArea = this.st.lastArea;
  }

  step(f: InputFrame): readonly GameEvent[] {
    const ev = this.events;
    ev.length = 0;
    const st = this.st, c = st.cur;
    if (c.mode === 'crashed') return ev;
    copyState(st.prev, c);
    const tick = ++c.tick;
    if (tick === 1) ev.push({ t: 'runStart', tick, seed: st.cfg.seed, mode: st.cfg.mode });
    c.t = st.startT + tick * DT;
    c.vel.s = speedAt(c.t);
    c.p.s = sAt(c.t);
    const air = c.mode === 'air';

    // Steering target (TECH §6.3 step 2) and lateral motion (step 4).
    c.targetX = clamp(c.targetX + f.steerDx * STEER_GAIN[c.mode] + f.steerAxis * V_LAT_MAX * DT, -TARGET_X_MAX, TARGET_X_MAX);
    const desired = clamp(STEER_P * (c.targetX - c.p.x), -V_LAT_MAX, V_LAT_MAX);
    c.vel.x = approach(c.vel.x, desired, (air ? A_LAT_AIR : A_LAT_GROUND) * DT);
    const over = Math.abs(c.p.x) - SOFT_WALL_X;
    if (over > 0) c.vel.x -= Math.sign(c.p.x) * SOFT_WALL_K * over * DT;
    c.p.x = clamp(c.p.x + c.vel.x * DT, -4.5, 4.5);
    c.popBleed = Math.max(0, c.popBleed - DT);
    c.wobble = Math.max(0, c.wobble - DT);

    // Gestures (a tiny subset of tricks/interpret.ts). Swipes of the steering stroke are treated as steering.
    const swipe = f.swipe && !f.swipeSteer ? f.swipe : null;
    if (!air && (f.tap || swipe === 'u')) this.pop(tick, null);
    else if (!air && (swipe === 'ur' || swipe === 'ul')) this.pop(tick, swipe);
    else if (air && swipe && c.popBleed <= 0) this.airSwipe(tick, swipe);

    // Vertical motion.
    if (c.mode === 'roll') {
      const g = this._world.groundAt(c.p.s, c.p.x, c.p.y + STEP_UP);
      if (g.y < c.p.y - 0.05) { c.mode = 'air'; c.vel.y = 0; c.airT = 0; ev.push({ t: 'airborne', tick, reason: 'rollOff' }); }
      else { if (g.surface !== c.surface) ev.push({ t: 'surface', tick, surface: g.surface }); c.p.y = g.y; c.groundY = g.y; c.surface = g.surface; }
    }
    if (c.mode === 'air') this.airStep(tick);

    if (!this.crashed()) this.collide(tick);
    if (!this.crashed()) this.pickups(tick);
    this.markers(tick);
    const sc = st.score;
    sc.distancePts = Math.floor(c.p.s - st.s0);
    sc.total = sc.distancePts + sc.trickPts + sc.bonusPts;
    sc.maxSpeed = Math.max(sc.maxSpeed, c.vel.s);
    return ev;
  }

  private crashed(): boolean { return this.st.cur.mode === 'crashed'; }

  private pop(tick: number, spinDir: Dir8 | null): void {
    const c = this.st.cur;
    c.mode = 'air'; c.vel.y = V_POP; c.airT = 0; c.popBleed = POP_BLEED; c.flipsThisAir = 0; c.airTricks = [];
    this.events.push({ t: 'ollie', tick, from: 'roll', linked: false }, { t: 'airborne', tick, reason: 'pop' });
    this.scoreTrick(tick, 'ollie', this.tables.ollie.points);
    if (spinDir) {
      const def = this.tables.spins.find((d) => d.input === spinDir && d.upgradeOf === null);
      if (def) { c.spin = { id: def.id, t: 0, dur: def.dur, upgrades: 0, startTick: tick, linked: true }; this.events.push({ t: 'spinStart', tick, id: def.id, dur: def.dur, out: false }); }
    }
  }

  private airSwipe(tick: number, dir: Dir8): void {
    const c = this.st.cur;
    if (c.flip) {
      const def = this.tables.flips.find((d) => d.upgradeOf === c.flip!.id && d.input[0] === dir);
      if (def && c.flip.t / c.flip.dur < 0.6) {
        this.events.push({ t: 'flipUpgrade', tick, from: c.flip.id, to: def.id });
        Object.assign(c.flip, { id: def.id, dur: def.dur, upgrades: c.flip.upgrades + 1 });
      }
      return;
    }
    const def = this.tables.flips.find((d) => d.input.length === 1 && d.input[0] === dir);
    if (!def) return;
    c.flip = { id: def.id, t: 0, dur: def.dur, upgrades: 0, airLeftAtStart: c.airLeft, angle0: 0, t0: 0 };
    this.events.push({ t: 'flipStart', tick, id: def.id, dur: def.dur });
  }

  private airStep(tick: number): void {
    const c = this.st.cur;
    c.vel.y -= G * DT;
    c.p.y += c.vel.y * DT;
    c.airT += DT;
    if (c.flip) c.flip.t = Math.min(c.flip.dur, c.flip.t + DT);
    if (c.spin) c.spin.t = Math.min(c.spin.dur, c.spin.t + DT);
    const g = this._world.groundAt(c.p.s, c.p.x, this.st.prev.p.y + 1e-6);
    const h = c.p.y - g.y;
    c.airLeft = c.vel.y * c.vel.y + 2 * G * h > 0 ? (c.vel.y + Math.sqrt(c.vel.y * c.vel.y + 2 * G * Math.max(0, h))) / G : 0;
    if (c.p.y > g.y || c.vel.y > 0) return;
    // Touchdown: judge rotation progress (DESIGN §7), the worse of flip and spin.
    const pf = c.flip ? c.flip.t / c.flip.dur : 1, ps = c.spin ? c.spin.t / c.spin.dur : 1;
    const p = Math.min(pf, ps);
    const bail = this.st.cfg.firstRuns ? LAND.sketchyFirstRuns : LAND.sketchy;
    c.p.y = g.y; c.groundY = g.y; c.vel.y = 0;
    if (p < bail) { this.crash(tick, 'badLanding', null); return; }
    const quality = p < LAND.snap ? 'sketchy' : 'clean';
    if (quality === 'sketchy') c.wobble = LAND.sketchyWobble;
    this.events.push({ t: 'land', tick, airT: c.airT, dropH: 0, quality, surface: g.surface });
    const mult = quality === 'sketchy' ? 0.5 : 1;
    if (c.flip) { const d = this.tables.flips.find((x) => x.id === c.flip!.id); if (d) this.scoreTrick(tick, d.id, d.points * mult); }
    if (c.spin) { const d = this.tables.spins.find((x) => x.id === c.spin!.id); if (d) this.scoreTrick(tick, d.id, d.points * mult); }
    c.mode = 'roll'; c.flip = null; c.spin = null; c.airT = 0; c.airLeft = 0;
    this.st.landTick = tick;
  }

  private collide(tick: number): void {
    const c = this.st.cur, pv = this.st.prev;
    const s0 = c.p.s - HITBOX.l / 2, s1 = c.p.s + HITBOX.l / 2, x0 = c.p.x - HITBOX.w / 2, x1 = c.p.x + HITBOX.w / 2;
    const ps1 = pv.p.s + HITBOX.l / 2;
    for (const ob of this._world.obstacles(c.p.s - 2, c.p.s + 3)) {
      if (this.ghosted.has(ob.id)) continue;
      for (const so of ob.solids) {
        const b = so.box;
        if (s1 <= b.s0 + FACE_INSET || s0 >= b.s1 - FACE_INSET || x1 <= b.x0 + FACE_INSET || x0 >= b.x1 - FACE_INSET) continue;
        if (c.p.y >= b.y1 - FACE_INSET - 1e-6 || c.p.y + HITBOX.h <= b.y0) continue;
        if (so.top === 'knock') {
          if (!this.knocked.has(ob.id)) { this.knocked.add(ob.id); this.events.push({ t: 'knock', tick, obstacleId: ob.id }); }
          continue;
        }
        if (so.top === 'landable' && b.y1 - c.p.y <= STEP_UP) {         // skim onto the top
          c.p.y = b.y1; this.events.push({ t: 'bump', tick, side: 1, kind: ob.kind }); continue;
        }
        if (pv.p.y >= b.y1 - FACE_INSET && so.top === 'crash') { this.crash(tick, 'badLanding', ob.id); return; }
        if (ps1 > b.s0 + FACE_INSET) {                                       // already alongside: side bump
          const side: -1 | 1 = c.p.x < (b.x0 + b.x1) / 2 ? -1 : 1;
          c.p.x = side < 0 ? b.x0 + FACE_INSET - HITBOX.w / 2 : b.x1 - FACE_INSET + HITBOX.w / 2;
          c.vel.x = side * SIDE_BUMP_V; c.targetX = c.p.x; c.wobble = 0.3;
          this.events.push({ t: 'bump', tick, side, kind: ob.kind });
          continue;
        }
        this.crash(tick, 'slam', ob.id);
        return;
      }
    }
  }

  private pickups(tick: number): void {
    const c = this.st.cur;
    for (const coin of this._world.coins(c.p.s - 0.4, c.p.s + 0.4)) {
      if (this.collected.has(coin.id)) continue;
      if (Math.abs(coin.p.x - c.p.x) > 0.3 || Math.abs(coin.p.y - (c.p.y + 0.75)) > 0.7) continue;
      this.collected.add(coin.id);
      this.st.score.coins += coin.value;
      this.events.push({ t: 'coin', tick, id: coin.id, value: coin.value, p: coin.p, chain: 0 });
    }
  }

  private markers(tick: number): void {
    const st = this.st, c = st.cur;
    let tier: 0 | 1 | 2 | 3 = 0;
    for (let i = 0; i < SPEED_TIERS.length; i++) if (c.vel.s >= SPEED_TIERS[i]! - 1e-9) tier = (i + 1) as 1 | 2 | 3;
    if (tier !== st.tier) { st.tier = tier; this.events.push({ t: 'speedTier', tick, tier }); }
    const a = this._gen.areaAt(c.p.s);
    if (a.area !== st.lastArea) {
      st.lastArea = a.area;
      const first = !st.score.areasReached.includes(a.area);
      if (first) st.score.areasReached.push(a.area);
      st.score.furthestArea = a.area;
      this.events.push({ t: 'areaEnter', tick, area: a.area, firstThisRun: first });
    }
  }

  private scoreTrick(tick: number, id: TrickId, pts: number): void {
    const sc = this.st.score;
    const r = Math.round(pts);
    sc.trickPts += r;
    sc.tricks[id] = (sc.tricks[id] ?? 0) + 1;
    sc.recent.push(id); if (sc.recent.length > 10) sc.recent.shift();
    this.events.push({ t: 'trickScored', tick, id, pts: r, factor: 1, link: false, comboPts: 0, links: 0, seq: 0 });
  }

  private crash(tick: number, cause: 'slam' | 'badLanding', obstacleId: number | null): void {
    const c = this.st.cur;
    const ob = obstacleId === null ? undefined : this._world.obstacle(obstacleId);
    const flipProgress = c.flip ? c.flip.t / c.flip.dur : 0, spinProgress = c.spin ? c.spin.t / c.spin.dur : 0;
    const god = !!this.st.cfg.god;
    this.events.push({ t: 'crash', tick, cause, obstacleId, kind: ob?.kind ?? null, speed: c.vel.s, state: c.mode,
      flipProgress, spinProgress, ...(god ? { god: true } : {}) });
    if (god) {
      if (obstacleId !== null) this.ghosted.add(obstacleId);
      if (c.mode === 'air' && cause === 'badLanding' && obstacleId === null) { c.mode = 'roll'; c.flip = null; c.spin = null; }
      return;
    }
    c.crash = { cause, obstacleId, obstacleKind: ob?.kind ?? null, tick, flipProgress, spinProgress };
    const state = c.mode;
    c.mode = 'crashed';
    const result = this.result();
    if (result.crash) result.crash.state = state;
    this.events.push({ t: 'runEnd', tick, result });
  }

  pose(): SkaterPose {
    const c = this.st.cur, pv = this.st.prev;
    const heading = Math.atan2(c.vel.x, c.vel.s);
    const latAccel = (c.vel.x - pv.vel.x) / DT;
    const fd = c.flip && this.tables.flips.find((d) => d.id === c.flip!.id);
    const fu = c.flip ? easeOutCubic(c.flip.t / c.flip.dur) : 0;
    const sd = c.spin && this.tables.spins.find((d) => d.id === c.spin!.id);
    const su = c.spin ? easeOutCubic(c.spin.t / c.spin.dur) : 0;
    const air = c.mode === 'air';
    return {
      mode: c.mode,
      pose: c.mode === 'crashed' ? 'crash' : air ? (c.flip ? 'flip' : c.airT < 0.06 ? 'pop' : 'tuck')
        : c.tick - this.st.landTick < 6 ? 'land' : Math.abs(latAccel) > 8 ? 'carve' : 'roll',
      grindId: null, manualKind: null,
      heading, lean: clamp(0.8 * heading, -25 * DEG, 25 * DEG), latAccel,
      crouch: air ? 0.6 : 0.2,
      board: { roll: fd ? fd.rot.roll * fu : 0, yaw: fd ? fd.rot.yaw * fu : 0, pitch: fd ? fd.rot.pitch * fu : 0 },
      bodyYaw: 0, spinYaw: sd ? sd.yaw * su : 0, fakie: false,
      height: Math.max(0, c.p.y - c.groundY), airT: c.airT, wobble: clamp(c.wobble / 0.3, 0, 1),
      landImpulse: c.tick === this.st.landTick ? 1 : 0,
      crash: c.crash ? { t: (c.tick - c.crash.tick) * DT, seed: hash32(this.st.cfg.seed, c.crash.tick) } : null,
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
      crash: c.crash ? { cause: c.crash.cause, obstacleKind: c.crash.obstacleKind, state: c.mode, t: c.t,
        flipProgress: c.crash.flipProgress, spinProgress: c.crash.spinProgress } : null,
    };
  }

  snapshot(): SimSnapshot {
    this.st.collected = [...this.collected];
    this.st.knocked = [...this.knocked];
    return structuredClone(this.st) as unknown as SimSnapshot;
  }

  restore(s: SimSnapshot): void {
    const st = structuredClone(s as unknown as Internal);
    if (st.cfg.seed !== this.st.cfg.seed || st.startT !== this.st.startT) {
      const w = this.makeWorld({ seed: st.cfg.seed, mode: st.cfg.mode, startT: st.cfg.startT, startArea: st.cfg.startArea });
      this._gen = w.gen; this._world = w.world;
    }
    this.st = st;
    this.collected.clear(); for (const id of st.collected) this.collected.add(id);
    this.knocked.clear(); for (const id of st.knocked) this.knocked.add(id);
  }

  /** FNV-1a over the quantized state (1e-6 m), tick, mode and score fields. */
  hash(): number {
    const c = this.st.cur, sc = this.st.score;
    const q = (v: number) => Math.round(v * 1e6) | 0;
    const modes = ['roll', 'air', 'grind', 'manual', 'crashed'];
    let h = 0x811c9dc5;
    for (const v of [c.tick, q(c.p.s), q(c.p.x), q(c.p.y), q(c.vel.x), q(c.vel.y), q(c.targetX), modes.indexOf(c.mode), sc.total, sc.coins]) {
      for (let k = 0; k < 4; k++) { h ^= (v >>> (8 * k)) & 0xff; h = Math.imul(h, 0x01000193); }
    }
    return h >>> 0;
  }
}
