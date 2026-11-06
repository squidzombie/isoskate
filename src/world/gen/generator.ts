// world/gen/generator.ts: the M0 segment pipeline (TECH §5.1):
//   plan (schedule.ts: Roll-out, gateways, fillers, A3, gates, breathers, tier draw)
//   → instantiate the template with the layout RNG (obstacles in track space, 1 cm rounding, its safe line, coins)
//   → validate (validator/rules.ts) → accept | re-roll ×6 | constructive fallback (S_OPEN)
//   → commit: street base, decor (decor RNG), SafeKeys, into 32 m chunk buckets; advance the cursor.
// Generation is strictly in order and reads no clock; the same seed gives the same street everywhere.
import type { AreaId } from '../../core/ids';
import { Sfc32, streamSeed } from '../../core/rng';
import { CHUNK_LEN, ROLLOUT_SEC, sAt, speedAt, tAt } from '../../core/tuning';
import type { Chunk, Coin, Decor, GenStats, GrindEdge, Obstacle, SafeKey, Segment, WorldGen, WorldGenConfig } from '../../core/world';
import { ObTag } from '../../core/world';
import { areaAtTime } from './areas';
import { CoinWriter } from './coins';
import type { GenCursor } from './cursor';
import { emitDecor } from './decor';
import { GEN, GEN_FLAGS, PHASES, type Tier } from './gen.config';
import { ROLLOUT_DECOR_SEED } from './lesson';
import type { PropCtx } from './props/common';
import { buildCurb } from './props/shared';
import { SafeLine } from './safe';
import { a3Plan, a3Range, gateRoom, gatewayWindow, nextFullWidthTarget, phaseAt, planSegment, type Plan } from './schedule';
import { TEMPLATES, type TemplateCtx, type TemplateOut } from './templates';
import { checkBands, checkEdges, checkLine, checkSpacing, spacingAfter } from './validator/rules';

/** Internal lookups shared with world/gen/query.ts (not part of the contract). */
export interface GenInternals {
  obstacleById: Map<number, Obstacle>;
  edgeById: Map<number, GrindEdge>;
}
export const GEN_INTERNALS = new WeakMap<WorldGen, GenInternals>();

interface Built {
  plan: Plan; out: TemplateOut; t1: number; s1: number;
  obstacles: Obstacle[]; coins: Coin[]; line: SafeLine;
}

/** History window kept for the next segment's validation (m behind the segment end). */
const HISTORY_M = 15, HISTORY_SEC = 2.0;

export class Generator implements WorldGen {
  readonly seed: number;
  readonly mode: 'lesson' | 'normal';
  private readonly startT: number;
  private readonly startArea: AreaId;
  private readonly rollout: boolean;
  private readonly segs: Segment[] = [];
  private readonly chunks = new Map<number, Chunk>();
  private released = -1;
  private readonly cur: GenCursor;
  private rerolls = 0;
  private fallbacks = 0;
  private readonly rejections: Record<string, number> = {};
  private coinsTotal = 0;
  private coinsTrick = 0;
  readonly internals: GenInternals = { obstacleById: new Map(), edgeById: new Map() };

  constructor(cfg: WorldGenConfig) {
    this.seed = cfg.seed >>> 0;
    this.mode = cfg.mode;
    this.startT = Math.max(0, cfg.startT ?? 0);
    this.startArea = cfg.startArea ?? 'downtown';
    this.rollout = this.startT === 0;
    const rng = new Sfc32(streamSeed(this.seed, -1, 'layout'));
    const clockT = this.rollout ? ROLLOUT_SEC : this.startT;
    const br = GEN.breather.warm!;
    this.cur = {
      segIndex: 0, t: this.startT, s: sAt(this.startT), area: this.startArea, safeX: 0,
      last: null, firstActionT: this.rollout ? 0 : this.startT + GEN.spawnGrace,
      aClock: 0, hazardA: 0, fwTargetA: nextFullWidthTarget(0, phaseAt(clockT), rng),
      gateDueT: clockT + GEN.gate.lead + rng.range(GEN.gate.first[0], GEN.gate.first[1]), lastGateX: [],
      trench: GEN_FLAGS.trench,
      breatherDueT: Math.max(PHASES[1]!.t0, this.startT) + rng.range(br.every[0], br.every[1]) / 2,
      lastTier: 0, ids: { ob: 0, coin: 0, edge: 0 }, history: [], historyLine: null,
    };
    GEN_INTERNALS.set(this, this.internals);
  }

  /** Coverage: the s up to which segments exist. */
  get coverage(): number { return this.cur.s; }

  ensure(sAhead: number, maxSegments = Infinity): boolean {
    let n = 0;
    while (this.cur.s < sAhead && n < maxSegments) { this.generateSegment(); n++; }
    return this.cur.s >= sAhead;
  }

  chunk(i: number): Chunk {
    if (i > this.released) {
      const end = (i + 1) * CHUNK_LEN;
      while (this.cur.s < end) this.generateSegment();
    }
    return this.bucket(i);
  }

  release(beforeIndex: number): void {
    for (const [i, c] of this.chunks) {
      if (i >= beforeIndex) continue;
      for (const ob of c.obstacles) {
        if (ob.s + ob.len < beforeIndex * CHUNK_LEN) {
          this.internals.obstacleById.delete(ob.id);
          for (const e of ob.edges) this.internals.edgeById.delete(e.id);
        }
      }
      this.chunks.delete(i);
    }
    this.released = Math.max(this.released, beforeIndex - 1);
    while (this.segs.length > 1 && this.segs[0]!.s1 < beforeIndex * CHUNK_LEN) this.segs.shift();
  }

  segments(): readonly Segment[] { return this.segs; }

  areaAt(s: number) {
    const a = areaAtTime(tAt(s), this.startArea);
    return { area: a.area, blend: a.blend, gateway: a.gateway, first: a.first };
  }

  stats(): GenStats {
    return {
      segments: this.cur.segIndex, rerolls: this.rerolls, fallbacks: this.fallbacks, rejections: { ...this.rejections },
      trickCoinShare: this.coinsTotal ? this.coinsTrick / this.coinsTotal : 1, msPerSegment: 0,
    };
  }

  // ── internals ────────────────────────────────────────────────────────────────────────────────────────────────

  private bucket(i: number): Chunk {
    let c = this.chunks.get(i);
    if (!c) {
      const s0 = i * CHUNK_LEN;
      const a = this.areaAt(s0 + CHUNK_LEN / 2);
      c = { index: i, s0, len: CHUNK_LEN, area: a.area, blend: a.blend, obstacles: [], coins: [], decor: [], safe: [], segments: [] };
      this.chunks.set(i, c);
    }
    return c;
  }

  private generateSegment(): void {
    const c = this.cur;
    const index = c.segIndex++;
    const rng = new Sfc32(streamSeed(this.seed, index, 'layout'));
    const coinRng = new Sfc32(streamSeed(this.seed, index, 'coins'));
    const t0 = c.t;
    const gw = gatewayWindow(t0, this.startArea);
    const inGw = t0 >= gw.start - 1e-6 && t0 < gw.end - 1e-6;
    const phase = phaseAt(t0);
    const isRollout = index === 0 && this.rollout;
    const decorRng = new Sfc32(isRollout ? ROLLOUT_DECOR_SEED : streamSeed(this.seed, index, 'decor'));
    const area = areaAtTime(t0 + 1e-6, this.startArea).area;
    let plan: Plan = isRollout ? { id: 'ROLLOUT', tier: 0, reason: 'rollout' }
      : inGw ? { id: 'GATEWAY', tier: 0, dur: gw.end - t0, reason: 'gateway' }
      : planSegment(c, phase, rng, gw.start - t0, gateRoom(c, gw.start, gw.end));
    const maxT1 = isRollout ? Infinity : inGw ? gw.end : gw.start;
    let built: Built | null = null, rerolls = 0;
    for (let attempt = 0; attempt <= GEN.rerolls; attempt++) {
      const r = this.tryBuild(plan, index, area, rng, coinRng, maxT1, true, inGw || isRollout ? Infinity : gateRoom(c, gw.start, gw.end));
      if (typeof r !== 'string') { built = r; break; }
      this.rejections[r] = (this.rejections[r] ?? 0) + 1;
      rerolls++;
      const gate: Plan = { id: 'S_GATE', tier: Math.max(2, plan.tier) as Tier, reason: 'gate' };
      if (r === 'a3') plan = a3Plan(c, rng, 1);
      // Would overrun the gate deadline, or leave no room for the gate before the gateway: the gate instead.
      else if (r === 'gate') plan = gate;
      else if (r === 'fit' && plan.reason !== 'gate' && plan.reason !== 'filler' && maxT1 - t0 >= GEN.gate.fit) plan = gate;
      // Doesn't fit before the gateway: fill the rest with a cut-down S_OPEN (T0, always valid).
      else if (r === 'fit' && attempt >= 1 && maxT1 - t0 <= GEN.open.dur[1]) plan = { id: 'S_OPEN', tier: 0, dur: maxT1 - t0, reason: 'filler' };
    }
    let fallback = false;
    if (!built) {
      fallback = true;
      this.fallbacks++;
      const dur = Math.max(GEN.open.minFiller, Math.min(maxT1 - t0, 2.0));
      built = this.tryBuild({ id: 'S_OPEN', tier: 0, dur, reason: 'filler' }, index, area, rng, coinRng, maxT1, false) as Built;
    }
    this.rerolls += rerolls;
    this.commit(built, index, area, decorRng, rerolls, fallback, inGw ? gw.id : undefined, rng);
  }

  private tryBuild(plan: Plan, index: number, area: AreaId, rng: Sfc32, coinRng: Sfc32, maxT1: number, validate = true,
    gateRoomSec = Infinity): Built | string {
    const c = this.cur;
    const t0 = c.t, s0 = c.s;
    const ids0 = { ...c.ids };
    const fail = (why: string) => { Object.assign(c.ids, ids0); return why; };
    const props: PropCtx = { ids: c.ids, segment: index, area };
    const line = new SafeLine(t0, c.safeX);
    const obstacles: Obstacle[] = [];
    const coins = new CoinWriter(c.ids);
    const cuts: [number, number][] = [];
    const earliest = Math.max(c.firstActionT, c.last ? c.last.t + spacingAfter(c.last.t, c.last.dx) : -Infinity);
    const ctx: TemplateCtx = { t0, v: speedAt(t0), tier: plan.tier, phase: phaseAt(t0), area, rng, coinRng, earliest, maxT1,
      line, lastGateX: c.lastGateX, props, coins, obstacles, cuts, ...(plan.dur !== undefined ? { dur: plan.dur } : {}) };
    const out = TEMPLATES[plan.id].build(ctx);
    const t1 = plan.dur !== undefined && (plan.id === 'S_OPEN' || plan.id === 'GATEWAY') ? Math.min(out.t1, t0 + plan.dur) : out.t1;
    if (t1 > maxT1 + 1e-6) return fail('fit');
    if (t1 <= t0 + 1e-6) return fail('empty');
    if (validate && plan.tier > 0 && !out.fullWidth && c.aClock + (t1 - t0) + GEN.a3Lead > c.hazardA + a3Range(phaseAt(t0))[1]) return fail('a3');
    // Gate deadline (A1/A2 stand-in, GEN.gate): a template may not end after the next gate segment must start
    // (A3 hazards pass when theirs was the tighter clock; fillers only fill up to a gateway).
    if (validate && !out.gate && plan.reason !== 'a3' && plan.reason !== 'filler' && t1 - t0 > gateRoomSec + 1e-6) return fail('gate');
    const s1 = sAt(t1);
    const v0 = speedAt(t0);
    obstacles.unshift(...buildCurb(-1, s0, s1, props, cuts, obstacles, v0), ...buildCurb(1, s0, s1, props, cuts, obstacles, v0));
    if (validate) {
      for (const a of line.actions) if (a.t < c.firstActionT - 1e-6) return fail('grace');
      const why = checkBands(obstacles) ?? checkSpacing(line.actions, c.last) ?? checkEdges(obstacles, s1, v0)
        ?? checkLine(line.withHistory(c.historyLine), [...c.history, ...obstacles], Math.max(this.startT, t0 - 1.0), t1);
      if (why) return fail(why);
    }
    return { plan, out, t1, s1, obstacles, coins: coins.coins, line };
  }

  private commit(b: Built, index: number, area: AreaId, decorRng: Sfc32, rerolls: number, fallback: boolean,
    gateway: Segment['gateway'], rng: Sfc32): void {
    const c = this.cur;
    const t0 = c.t, s0 = c.s, t1 = b.t1, s1 = b.s1;
    const tier: Tier = b.plan.tier;
    const decor: Decor[] = [];
    emitDecor(decor, s0, s1, decorRng, area);
    const safe: SafeKey[] = b.line.keys(t1);
    const seg: Segment = {
      index, templateId: b.plan.id === 'GATEWAY' && gateway ? `GW_${gateway}` : b.plan.id, area, tier,
      t0, t1, s0, s1, mirror: !!b.out.mirror, rerolls, fallback,
    };
    if (gateway) seg.gateway = gateway;
    this.segs.push(seg);
    // Chunk buckets: an obstacle is listed in every chunk its s-range overlaps (sorted by s).
    const ci = (s: number) => Math.floor(s / CHUNK_LEN);
    for (let i = ci(s0); i <= ci(Math.max(s0, s1 - 1e-6)); i++) this.bucket(i).segments.push(index);
    const touched = new Set<number>();
    for (const ob of b.obstacles) {
      this.internals.obstacleById.set(ob.id, ob);
      for (const e of ob.edges) this.internals.edgeById.set(e.id, e);
      for (let i = ci(ob.s); i <= ci(ob.s + Math.max(0, ob.len - 1e-6)); i++) { this.bucket(i).obstacles.push(ob); touched.add(i); }
    }
    for (const i of touched) this.chunks.get(i)!.obstacles.sort((u, v) => u.s - v.s || u.id - v.id);
    for (const coin of b.coins) {
      this.bucket(ci(coin.p.s)).coins.push(coin);
      this.coinsTotal++;
      if (coin.line === 'trick') this.coinsTrick++;
    }
    for (const d of decor) this.bucket(ci(d.s)).decor.push(d);
    for (const k of safe) this.bucket(ci(k.s)).safe.push(k);
    // Advance the cursor.
    const aStart = c.aClock;
    if (tier > 0) c.aClock += t1 - t0;
    if (b.out.fullWidth) {
      const fw = b.obstacles.find((o) => o.tags & ObTag.FullWidth);
      c.hazardA = aStart + (fw ? Math.max(0, tAt(fw.s) - t0) : 0);
      c.fwTargetA = nextFullWidthTarget(c.hazardA, phaseAt(t1), rng);
    }
    if (b.out.gate) {
      const rowT = b.out.gateT ?? t1;
      c.gateDueT = rowT + GEN.gate.gap[phaseAt(rowT)];
      c.lastGateX = b.out.gateX ?? [];
    }
    if (b.plan.reason === 'breather' || b.plan.id === 'GATEWAY') {
      const br = GEN.breather[phaseAt(t1)] ?? GEN.breather.warm!;
      c.breatherDueT = t1 + rng.range(br.every[0], br.every[1]);
    }
    const lastAction = b.line.actions[b.line.actions.length - 1];
    if (lastAction) c.last = { t: lastAction.t, dx: lastAction.dx };
    c.t = t1; c.s = s1; c.safeX = b.line.x; c.area = area; c.lastTier = tier;
    c.history = [...c.history, ...b.obstacles].filter((o) => o.kind !== 'curb' && o.s + o.len >= s1 - HISTORY_M);
    c.historyLine = b.line.tail(t1 - HISTORY_SEC, c.historyLine);
  }
}
