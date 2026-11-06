// world/gen/generator.ts: the segment pipeline (TECH §5.1):
//   plan (schedule.ts: Roll-out / Lesson Line, gateways, fillers, payback, A3, wander, breathers, tier draw)
//   → instantiate the template with the layout RNG (obstacles in track space, 1 cm rounding, trick coins)
//   → street base (area layout, datum, curb / lip edges cut around blockers)
//   → validate (validator/validate.ts: rules a–i, exact ollie windows, the committed safe line)
//   → A2 wander wall when overdue, A1 column fillers outside the line, each followed by re-validation
//   → accept | re-roll ×6 (the last ones drop the hardest element) | constructive fallback
//   → commit: coins (arcs over required ollies), decor (decor RNG), SafeKeys, 32 m chunk buckets; advance the cursor.
// Generation is strictly in order and reads no clock; the same seed gives the same street everywhere.
import type { AreaId, GatewayId, HintId } from '../../core/ids';
import { clamp, round1cm } from '../../core/math';
import { Sfc32, streamSeed } from '../../core/rng';
import { CHUNK_LEN, DT, ROLLOUT_SEC, LESSON_SEC, T_SHIFT, sAt, speedAt, tAt } from '../../core/tuning';
import type { Chunk, Coin, Decor, GenStats, GrindEdge, Obstacle, SafeKey, Segment, WorldGen, WorldGenConfig } from '../../core/world';
import { ObTag } from '../../core/world';
import { areaAtTime } from './areas';
import { COLS, a1Period, a2Period, coverColumns, trackWander } from './antistraight';
import { CoinWriter } from './coins';
import type { GenCursor } from './cursor';
import { emitDecor } from './decor';
import { GEN, GEN_FLAGS, type PhaseId, type Tier } from './gen.config';
import { LESSON_PARTS, ROLLOUT, ROLLOUT_DECOR_SEED } from './lesson';
import type { PropCtx } from './props/common';
import { buildFiller, fillerKinds } from './props/shared';
import { LAYOUTS, LIP, bandRange, buildLipBody, buildLipEdges, buildStreet, type StreetLayout } from './props/street';
import type { SafeLine } from './safe';
import { a3Range, gatewayWindow, nextFullWidthDue, phaseAt, planSegment, type Plan } from './schedule';
import { GATEWAYS, TEMPLATES, type Template, type TemplateCtx, type TemplateOut } from './templates';
import { gateOpenings as gateOpeningsFor, gateRow } from './templates/shared';
import { spacingAfter } from './validator/sweep';
import { initialState, validate, type ValResult } from './validator/validate';

/** Internal lookups shared with world/gen/query.ts (not part of the contract). */
export interface GenInternals {
  obstacleById: Map<number, Obstacle>;
  edgeById: Map<number, GrindEdge>;
}
export const GEN_INTERNALS = new WeakMap<WorldGen, GenInternals>();

/** Development hook (tests): called on every rejected attempt. */
export const GEN_DEBUG: { onReject: ((info: { index: number; t0: number; tpl: string; tier: number; attempt: number; why: string }) => void) | null;
  onCommit: ((info: { index: number; t0: number; tpl: string; reason: string; gateRoom: number; gateDue: number }) => void) | null } = { onReject: null, onCommit: null };

/** Seconds of obstacles kept behind a segment end for the next validation window. */
const HISTORY_KEEP_SEC = 3.2;

interface Built {
  plan: Plan; out: TemplateOut; t1: number; s1: number; layout: StreetLayout; datumEnd: number;
  obstacles: Obstacle[]; coins: CoinWriter; res: Extract<ValResult, { ok: true }>;
  t0Stretch: boolean; fullWidthA: number | null; lastTall: Float64Array; wander: GenCursor['wander']; mirror: boolean;
  driveways: [number, number, number][];
  gateX?: number[]; gateT?: number;
}

const LESSON_TPL = (i: number): Template => ({
  id: 'LESSON', area: 'fixed', tiers: [1], durMax: 5, mirror: false,
  build(c: TemplateCtx): TemplateOut { LESSON_PARTS[i]!.build(c); return { t1: LESSON_PARTS[i]!.to }; },
});

export class Generator implements WorldGen {
  readonly seed: number;
  readonly mode: 'lesson' | 'normal';
  private readonly startT: number;
  private readonly startArea: AreaId;
  private readonly rollout: boolean;
  private readonly lesson: boolean;
  private readonly trench: boolean;
  private readonly segs: Segment[] = [];
  private readonly chunks = new Map<number, Chunk>();
  private released = -1;
  readonly cur: GenCursor;
  private rerolls = 0;
  private fallbacks = 0;
  private replans = 0;
  private readonly rejections: Record<string, number> = {};
  private coinsTotal = 0;
  private coinsTrick = 0;
  private readonly decorState = { nextEndWall: 0, backNext: [0, 0] as [number, number] };
  /** Validator stats of the committed segments (static asserts read them). */
  readonly valStats = { decisionMin: Infinity, windowMin: Infinity, deadEndMax: 0, actions: 0, fillers: 0, walls: 0 };
  readonly internals: GenInternals = { obstacleById: new Map(), edgeById: new Map() };

  constructor(cfg: WorldGenConfig) {
    this.seed = cfg.seed >>> 0;
    this.mode = cfg.mode;
    this.startT = Math.max(0, cfg.startT ?? 0);
    this.startArea = cfg.startArea ?? 'downtown';
    this.rollout = this.startT === 0;
    this.lesson = this.mode === 'lesson' && this.rollout;
    this.trench = GEN_FLAGS.trench;
    const rng = new Sfc32(streamSeed(this.seed, -1, 'layout'));
    const clockFromT = this.lesson ? LESSON_SEC + 4 : this.rollout ? ROLLOUT_SEC : this.startT;
    const br = GEN.breather.warm!;
    this.cur = {
      seed: this.seed, segIndex: 0, t: this.startT, s: sAt(this.startT), area: this.startArea, startArea: this.startArea,
      datum: 0, safeX: 0, val: initialState(this.startT, 0), last: null,
      firstActionT: this.rollout ? 0 : this.startT + GEN.spawnGrace,
      clockFromT, aClock: 0, lastTall: new Float64Array(COLS), wander: { lo: 0, hi: 0, lastA: 0 },
      // The first gate comes right after the Roll-out / the spawn grace (DESIGN §10.7 straight-bot guarantees).
      gateDueT: clockFromT + (this.rollout ? 1.6 : GEN.spawnGrace + 1.6), lastGateX: [],
      lastFwA: 0, fwDueA: nextFullWidthDue(0, phaseAt(clockFromT), rng),
      breatherDueT: Math.max(45, this.startT) + rng.range(br.every[0], br.every[1]) / 2,
      lastTier: 0, areaSegs: 0, lessonPart: 0, ids: { ob: 0, coin: 0, edge: 0 }, history: [], persistent: [],
    };
    this.decorState.nextEndWall = sAt(this.startT) + 20;
    this.decorState.backNext = [sAt(this.startT), sAt(this.startT)];
    GEN_INTERNALS.set(this, this.internals);
  }

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
    const area = areaAtTime(t0 + 1e-6, this.startArea).area;
    if (area !== c.area) { c.area = area; c.areaSegs = 0; }
    const phase = phaseAt(t0);
    const isRollout = index === 0 && this.rollout;
    const isLesson = !isRollout && this.lesson && c.lessonPart < LESSON_PARTS.length;
    const decorRng = new Sfc32(isRollout ? ROLLOUT_DECOR_SEED : streamSeed(this.seed, index, 'decor'));
    const fixed = isRollout || isLesson || inGw;
    const left = (inGw ? gw.end : gw.start) - t0;
    let plan: Plan = isRollout ? { tpl: ROLLOUT, tier: 0, reason: 'rollout' }
      : isLesson ? { tpl: LESSON_TPL(c.lessonPart), tier: 1, reason: 'lesson' }
      : inGw ? { tpl: GATEWAYS[gw.id], tier: 0, dur: gw.end - t0, reason: 'gateway' }
      : planSegment(c, { area, phase, t: t0, left, trench: this.trench, gateRoom: this.gateLatestStart(t0) - t0 }, rng);
    const maxT1 = isRollout ? Infinity : isLesson ? LESSON_PARTS[c.lessonPart]!.to + 1e-6 : inGw ? gw.end : gw.start;
    let built: Built | null = null, rerolls = 0;
    for (let attempt = 0; attempt <= GEN.rerolls; attempt++) {
      const r = this.tryBuild(plan, index, area, inGw ? gw.id : null, rng, coinRng, maxT1, attempt, fixed, false);
      if (typeof r !== 'string') { built = r; break; }
      // Scheduling re-plans (no room for the gate row, does not fit) are counted apart from validator rejections.
      const sched = r === 'gate' || r === 'fit' || r === 'tpl';
      this.rejections[sched ? `replan:${r}` : r] = (this.rejections[sched ? `replan:${r}` : r] ?? 0) + 1;
      GEN_DEBUG.onReject?.({ index, t0, tpl: plan.tpl.id, tier: plan.tier, attempt, why: r });
      if (!sched) rerolls++;
      else this.replans++;
      if (fixed) continue;
      // Re-plan on scheduling failures; otherwise re-roll the same plan (jitter, mirror, shift).
      if (r === 'fit' && plan.reason !== 'filler') plan = planSegment(c, { area, phase, t: t0, left, trench: this.trench, gateRoom: this.gateLatestStart(t0) - t0, force: 'filler' }, rng);
      else if (r === 'gate' || r === 'fit:gate') plan = planSegment(c, { area, phase, t: t0, left, trench: this.trench, gateRoom: this.gateLatestStart(t0) - t0, force: 'wander' }, rng);
      else if (r === 'a3') plan = planSegment(c, { area, phase, t: t0, left, trench: this.trench, gateRoom: this.gateLatestStart(t0) - t0, force: 'a3' }, rng);
      else if (attempt === 2 && plan.reason === 'draw') plan = planSegment(c, { area, phase, t: t0, left, trench: this.trench, gateRoom: this.gateLatestStart(t0) - t0 }, rng);
    }
    let fallback = false;
    if (!built) {
      fallback = true;
      this.fallbacks++;
      const a3Over = c.aClock + 2.5 > c.lastFwA + a3Range(phase)[1] && t0 >= c.clockFromT && left >= 2.4;
      const fb: Plan = a3Over ? { tpl: TEMPLATES.S_BARRIER!, tier: 1, reason: 'a3' }
        : { tpl: TEMPLATES.S_OPEN!, tier: 0, dur: clamp(left, GEN.open.minFiller, 2.5), reason: 'filler' };
      const r = fixed ? null : this.tryBuild(fb, index, area, inGw ? gw.id : null, rng, coinRng, maxT1, GEN.rerolls + 1, false, false);
      built = r && typeof r !== 'string' ? r : null;
      if (!built) {
        const bare: Plan = fixed ? plan : { tpl: TEMPLATES.S_OPEN!, tier: 0, dur: clamp(left, GEN.open.minFiller, 2.5), reason: 'filler' };
        let r2 = this.tryBuild(bare, index, area, inGw ? gw.id : null, rng, coinRng, maxT1, GEN.rerolls + 2, fixed, true);
        if (typeof r2 === 'string') {
          this.rejections['emergency'] = (this.rejections['emergency'] ?? 0) + 1;
          r2 = this.tryBuild(bare, index, area, inGw ? gw.id : null, rng, coinRng, maxT1, GEN.rerolls + 3, fixed, true);
        }
        if (typeof r2 === 'string') throw new Error(`world/gen: segment ${index} at t=${t0.toFixed(2)} cannot be built (${r2})`);
        built = r2;
      }
    }
    this.rerolls += rerolls;
    GEN_DEBUG.onCommit?.({ index, t0, tpl: built.plan.tpl.id, reason: built.plan.reason, gateRoom: this.gateLatestStart(t0) - t0, gateDue: c.gateDueT });
    this.commit(built, index, area, inGw ? gw.id : null, decorRng, rerolls, fallback, phase, inGw ? gw.end : gw.start, rng);
  }

  private makeProps(index: number, area: AreaId, layout: StreetLayout, datum: number): PropCtx {
    const c = this.cur;
    // The Docks lip (a 0.30 m body beside the outer band) counts as ground a board can ride beside a blocker.
    return { ids: c.ids, segment: index, area, datum,
      ground: (x0: number, x1: number) => {
        const r = bandRange(layout, x0, x1);
        return layout.lip && x1 > LIP.x0 ? { lo: r.lo, hi: Math.max(r.hi, LIP.h) } : r;
      } };
  }

  private tryBuild(plan: Plan, index: number, area: AreaId, gateway: GatewayId | null, rng: Sfc32, coinRng: Sfc32, maxT1: number,
    attempt: number, fixed: boolean, bare: boolean): Built | string {
    const c = this.cur;
    const t0 = c.t, s0 = c.s;
    const ids0 = { ...c.ids };
    const fail = (why: string) => { Object.assign(c.ids, ids0); return why; };
    const phase = phaseAt(t0);
    const tpl = plan.tpl;
    const t0Stretch0 = plan.tier === 0;
    let layout: StreetLayout = gateway ? LAYOUTS[gateway] : LAYOUTS[area];
    if (area === 'downtown' && !gateway && !fixed && !t0Stretch0 && c.areaSegs % GEN.plazaEvery === GEN.plazaEvery - 1) layout = LAYOUTS.plaza;
    const m: 1 | -1 = tpl.mirror && area !== 'docks' && rng.chance(0.5) ? -1 : 1;
    const props = this.makeProps(index, area, layout, c.datum);
    const coins = new CoinWriter(c.ids);
    const obstacles: Obstacle[] = [];
    const cuts: [number, number][] = [];
    const driveways: [number, number, number][] = [];
    const datumAt: { s: number; datum: number }[] = [];
    const earliest = Math.max(c.firstActionT, c.last ? c.last.t + spacingAfter(c.last.t, c.last.dx) : -Infinity);
    const ctx: TemplateCtx = {
      id: tpl.id, t0, v: speedAt(t0), tier: plan.tier, phase, area, gateway, layout, datum: c.datum, rng, coinRng, m,
      X: (x: number) => round1cm(m * x), maxT1, ...(plan.dur !== undefined ? { dur: plan.dur } : {}),
      safeX: c.safeX, wanderFrom: (c.wander.lo + c.wander.hi) / 2, earliest, attempt: bare ? GEN.easyFrom : attempt,
      colLeft: (x: number) => { const k = Math.max(0, Math.min(COLS - 1, Math.floor((x + 4.5) / GEN.a1.colW))); return c.lastTall[k]! + a1Period(phase) - c.aClock; },
      lastGateX: c.lastGateX, ...(plan.a3 ? { a3: true } : {}),
      props, propsAt: (d: number) => this.makeProps(index, area, layout, d), coins, obstacles, cuts, driveways, datumAt,
      hint: (ob: Obstacle, h: HintId) => { ob.hint = h; return ob; },
    };
    const out = tpl.build(ctx);
    if (!out) return fail('tpl');
    let t1 = plan.dur !== undefined && (tpl.id === 'S_OPEN' || tpl.id.startsWith('GW_')) ? Math.min(out.t1, t0 + plan.dur) : out.t1;
    if (t1 > maxT1 + 1e-6) return fail('fit');
    if (t1 - t0 < 0.3) {
      if (maxT1 - t0 < 0.3 + 1e-6) t1 = maxT1; else return fail('short');
    }
    if (out.layout) layout = out.layout;

    // T0 stretches carry no required actions (the Roll-out is T0 for the clocks but teaches the chain ollie).
    const t0Stretch = !!out.t0Stretch || (t0Stretch0 && !fixed);
    const s1 = sAt(t1);
    const datumEnd = datumAt.length ? datumAt[datumAt.length - 1]!.datum : c.datum;
    // Suburbs: driveway curb cuts every 1.5–2 s (alternating sides) where the template left the curb free.
    if (layout.id === 'suburbs') {
      for (let t = t0 + rng.range(0.3, 1.0); t < t1 - 0.5; t += rng.range(GEN.driveway.every[0], GEN.driveway.every[1])) {
        const sd = rng.chance(0.5) ? -1 : 1, s = sAt(t);
        if (driveways.some((d) => d[2] === sd && d[1] > s - 2 && d[0] < s + GEN.driveway.w + 2)) continue;
        driveways.push([round1cm(s), round1cm(s + GEN.driveway.w), sd]);
      }
    }
    const v0 = speedAt(t0);
    const noEdges: [number, number, number][] = [];
    const base = (obs: readonly Obstacle[]): Obstacle[] => {
      const out2: Obstacle[] = [];
      const steps = [{ s: s0, datum: c.datum }, ...datumAt];
      for (let k = 0; k < steps.length; k++) {
        const a = Math.max(s0, steps[k]!.s), b = k + 1 < steps.length ? steps[k + 1]!.s : s1;
        if (b - a < 0.02) continue;
        out2.push(...buildStreet(layout, a, b, this.makeProps(index, area, layout, steps[k]!.datum),
          { cuts, driveways, obstacles: [...obs, ...c.persistent], v: v0, noCurbEdges: out.noCurbEdges, noEdges }));
      }
      if (layout.lip && out.lip !== false) {
        const r = out.lip ? { from: out.lip.s0, to: out.lip.s1, landmark: out.lip.landmark, tags: ObTag.TrickLine | ObTag.Grindable, noEdges } : { noEdges };
        const lip = buildLipEdges(s0, s1, props, [...obs, ...c.persistent], v0, r);
        if (lip) out2.push(lip);
      }
      return out2;
    };
    // The Docks lip body: one per visit, created with the visit's first segment.
    const persistentNew: Obstacle[] = [];
    if (layout.lip && !c.persistent.some((o) => o.kind === 'dock_lip' && o.s <= s0 + 30 && o.s + o.len >= s1 - 1e-6)) {
      const gwNext = gatewayWindow(t0, this.startArea);
      // The lip starts 0.8 s into the visit, so a board hugging the right wall out of the gateway steers off first.
      persistentNew.push(buildLipBody(round1cm(s0 + 0.8 * v0), sAt(gwNext.start), props));
    }
    const groundHi = (x0: number, x1: number, s: number) => {
      let d = c.datum;
      for (const st of datumAt) if (s >= st.s - 0.5) d = st.datum;
      return Math.max(d, c.datum) + bandRange(layout, x0, x1).hi;
    };
    // The segment before a gateway ends in its central corridor (gateways are T0: no required move inside them).
    const gwNextStart = gatewayWindow(t0, this.startArea).start;
    const intoGw = !gateway && Math.abs(t1 - gwNextStart) < 1e-6;
    const exit = intoGw ? (out.exit ?? [[-4.5, 4.5]]).map(([a, b]) => [Math.max(a, -GEN.gwEntry), Math.min(b, GEN.gwEntry)] as [number, number]).filter(([a, b]) => b > a)
      : out.exit ?? [[-4.5, 4.5]];
    // No base edge may end in the 2.2 s before a gate row: its exit zone would face the row far from the openings.
    const rowBan = (tr: number): [number, number, number] => [round1cm(sAt(tr - GEN.gate.edgeBan)), round1cm(sAt(tr) + 0.3), Number.NaN];
    if (out.gateT !== undefined) noEdges.push(rowBan(out.gateT));
    const run = (obs: Obstacle[], guides?: readonly { t0: number; t1: number; x0: number; x1: number }[]): ValResult => {
      for (let k = 0; ; k++) {
        const r = run1(obs, guides);
        // A base curb / lip edge that fails rule (d) (its exit zone faces a blocker or no viable state): trim it, retry.
        if (r.ok || !r.edge || k >= 4) return r;
        GEN_DEBUG.onReject?.({ index, t0, tpl: tpl.id, tier: plan.tier, attempt, why: `  trim ${r.why} ${r.detail ?? ''}` });
        noEdges.push([r.edge.s0, r.edge.s1, r.edge.x]);
      }
    };
    const run1 = (obs: Obstacle[], guides?: readonly { t0: number; t1: number; x0: number; x1: number }[]): ValResult => {
      const seg = [...obs, ...persistentNew, ...base(obs)];
      const win = [...c.history, ...c.persistent.filter((o) => o.s + o.len > s0 - 30 && o.s < s1 + 30), ...seg];
      return validate(c.val, {
        obstacles: win, seg, t0, t1, s1, layoutEnd: layout, datumEnd, exit,
        earliest: Math.max(c.firstActionT, t0), last: c.last, noActions: t0Stretch,
        headSec: fixed ? 0.3 : GEN.noActionHead, tailSec: fixed ? 0.2 : GEN.noActionTail,
        groundHi, greedy: true, guides: [...(out.guides ?? []), ...(guides ?? [])], relax: bare && attempt > GEN.rerolls + 2,
      });
    };
    // A-clock mapping for this segment (clocks pause in T0 and before clockFromT).
    const clocks = !t0Stretch && !bare && !fixed;
    const tc0 = Math.max(t0, c.clockFromT);
    const aOf = (t: number) => c.aClock + (clocks ? Math.max(0, t - tc0) : 0);
    const tOfA = (a: number) => tc0 + (a - c.aClock);
    const aEnd = aOf(t1);
    // A3: a full-width hazard at least every a3 max of non-T0 time.
    const fw = obstacles.find((o) => o.tags & ObTag.FullWidth);
    const fullWidthA = fw ? aOf(tAt(fw.s)) : null;
    if (clocks && t1 > c.clockFromT && !fw && plan.reason === 'draw' && aEnd > c.lastFwA + a3Range(phase)[1] + 0.5) return fail('a3');
    // Gate row (A1 / A2 / straight-bot guarantee) due inside this template: overlay one at the deadline. It goes into
    // the last template that can hold it before the deadline (the next one could not host it in time).
    let gateX: number[] | undefined = out.gateX, gateT: number | undefined = out.gateT;
    const wantRow = clocks && tpl.id !== 'S_GATE' && !plan.slip && t1 > c.gateDueT - (GEN.gate.lead + 1.4);
    let got: ValResult | null = null;
    // Row slots: times in the deadline window where the row can stand (beside the template's obstacles, never across
    // pits, slopes, or a grind edge's end: exit zone, rail-end rule).
    const slots: { tr: number; keepOut: [number, number][] }[] = [];
    // A row whose opening is at the line needs no move (the line already left the last row's openings); otherwise
    // the line needs a ≥ 3 m move before the row, after the head window and the last action's spacing.
    const lastP = c.lastGateX;
    const atLine = (x: number) => Math.abs(x) <= GEN.gate.maxC && lastP.every((p) => Math.abs(x - p) >= GEN.gate.apart + 0.2);
    const tLoAt = Math.max(t0 + GEN.noActionHead, earliest) + 0.5;
    const tLoMove = Math.max(t0 + GEN.noActionHead, earliest) + T_SHIFT(GEN.gate.shift[0]) + 0.35;
    const tHiRow = Math.min(c.gateDueT, t1 - 0.45);
    if (wantRow) {
      const tLo = atLine(c.safeX) ? tLoAt : tLoMove;
      for (let tr = tHiRow; tr >= tLo && slots.length < 3; tr -= 0.25) {
        const sr = sAt(tr), vr = speedAt(tr);
        const keepOut: [number, number][] = [];
        let bad = false;
        for (const o of obstacles) {
          if (o.kind === 'curb' || o.kind === 'dock_lip' || o.s > sr + 2.0 || o.s + o.len < sr - Math.max(2.5, vr * 1.1 + 0.3)) continue;
          if (o.edges.some((e) => e.b.s > sr - vr * 1.1 && e.b.s < sr + 1.0)) { bad = true; break; }
          if (o.s + o.len < sr - 2.5) continue;
          if (o.pits.length || o.slabs.some((sl) => sl.kind !== 'flat' || sl.layer === 1)) { bad = true; break; }
          for (const so of o.solids) keepOut.push([so.box.x0, so.box.x1]);
        }
        if (!bad) slots.push({ tr, keepOut });
      }
    }
    // Without a row here, the next one comes in the next segment (or after the gateway): too late → a gate instead.
    const rowLate = (): boolean => {
      const gw = gatewayWindow(t1 - 1e-6, this.startArea);
      const nextRow = (gw.start - t1 < GEN.gate.fit && t1 < gw.end) ? gw.end + GEN.gate.lead : t1 + GEN.gate.lead;
      return nextRow > c.gateDueT + 0.3;
    };
    if (wantRow && !slots.length && GEN_DEBUG.onReject) {
      GEN_DEBUG.onReject({ index, t0, tpl: tpl.id, tier: plan.tier, attempt, why: `  detail noslot t0=${t0.toFixed(2)} t1=${t1.toFixed(2)} hi=${tHiRow.toFixed(2)} due=${c.gateDueT.toFixed(2)} late=${rowLate()}` });
    }
    if (wantRow && !slots.length && rowLate()) return fail('gate');
    const tryRows = (xAt: (t: number) => number, from: number, maxTries: number): boolean => {
      for (let k = Math.max(0, from); k < Math.min(slots.length, Math.max(0, from) + maxTries); k++) {
        const { tr, keepOut } = slots[k]!;
        const sr = sAt(tr);
        const gt = Math.max(2, plan.tier) as Tier;
        const x0 = xAt(tr - 0.7);
        const w = GEN.gate.width[gt];
        const clear = (x: number) => !keepOut.some(([a, b]) => x + w / 2 > a && x - w / 2 < b);
        const centres = atLine(x0) && clear(round1cm(x0)) ? [round1cm(x0)] : tr >= tLoMove ? gateOpeningsFor(rng, x0, c.lastGateX, gt, keepOut) : null;
        if (!centres) continue;
        const row = gateRow(round1cm(sr), centres, GEN.gate.width[gt], props, rng, keepOut);
        const guide = [{ t0: tr - 0.45, t1: tr + 0.15, x0: centres[0]! - 0.25, x1: centres[0]! + 0.25 }];
        const nb = noEdges.length;
        noEdges.push(rowBan(tr));
        const r2 = run([...obstacles, ...row], guide);
        if (!r2.ok) { noEdges.length = nb; GEN_DEBUG.onReject?.({ index, t0, tpl: tpl.id, tier: plan.tier, attempt, why: `  detail overlay@${tr.toFixed(2)} ${r2.why} ${r2.detail ?? ''}` }); continue; }
        obstacles.push(...row); got = r2; gateX = centres; gateT = tr;
        GEN_DEBUG.onReject?.({ index, t0, tpl: tpl.id, tier: plan.tier, attempt, why: `  detail overlay-ok ${from}/${k}` });
        return true;
      }
      return false;
    };
    // First try: openings chosen from the entry line x, validated with the template in one pass.
    let placed = wantRow && tryRows(() => c.safeX, -1, 1);
    // A failed row with no later chance: the gate segment replaces this template (rows inside the template's own
    // line rarely fit where the entry-x row did not, so that retry is not worth its validations).
    if (wantRow && !placed && rowLate()) return fail('gate');
    if (!got) {
      const r0 = run(obstacles);
      if (!r0.ok) { if (GEN_DEBUG.onReject && r0.detail) GEN_DEBUG.onReject({ index, t0, tpl: tpl.id, tier: plan.tier, attempt, why: `  detail ${r0.detail}` }); return fail(r0.why); }
      got = r0;
    }
    if (wantRow && !placed) {
      GEN_DEBUG.onReject?.({ index, t0, tpl: tpl.id, tier: plan.tier, attempt, why: '  detail overlay none' });
      if (rowLate()) return fail('gate');
    }
    let res = got as ValResult;
    if (!res.ok) return fail(res.why);
    let wander = c.wander;
    let walls = 0;
    const fillers = 0;
    if (clocks && t1 > c.clockFromT) {
      // A2 (DESIGN §10.7): the line's lateral range reaches 3 m at least once per period. Gates (by deadline) force
      // the wanders; a template that would still leave the period without one gets a 6 m wander wall at the deadline
      // when it fits (best effort: never a rejection, the measured gap is reported).
      const P2 = a2Period(phase);
      let w = trackWander(res.line, t0, t1, c.wander, aOf);
      if (aEnd - w.lastA > P2 + 1e-6) {
        const tw = this.wallTime(res.line, obstacles, t0, Math.min(t1 - 0.5, tOfA(c.wander.lastA + P2)));
        if (tw !== null) {
          const trial = [...obstacles, ...this.wanderWall(tw, res.line.xAt(tw), props)];
          const r2 = run(trial);
          if (r2.ok) { obstacles.length = 0; obstacles.push(...trial); res = r2; walls++; w = trackWander(res.line, t0, t1, c.wander, aOf); }
        }
      }
      wander = w;
    }
    // A1 bookkeeping (measured): the last tall cover of each column, on the A-clock.
    const lastTall = Float64Array.from(c.lastTall);
    coverColumns(lastTall, obstacles, area, clocks ? (s) => aOf(tAt(s)) : () => c.aClock);
    this.valStats.fillers += fillers; this.valStats.walls += walls;
    const all = [...obstacles, ...persistentNew, ...base(obstacles)];
    return { plan, out, t1, s1, layout, datumEnd, obstacles: all, coins, res, t0Stretch, fullWidthA, lastTall, wander,
      mirror: m < 0, driveways, gateX, gateT };
  }

  /** The latest start of the next gate segment: its row by the deadline, and before the gateway when the deadline
   *  falls inside it or too soon after it (the gate then comes first). */
  gateLatestStart(t: number): number {
    const c = this.cur;
    const gw = gatewayWindow(t, this.startArea);
    const startBy = c.gateDueT - GEN.gate.lead;
    if (startBy >= gw.end || startBy <= gw.start - GEN.gate.fit) return startBy;
    // The deadline falls in (or just before) a gateway: the gate comes before it.
    return gw.start - GEN.gate.fit;
  }

  /** The latest time ≤ tLatest a wander wall can stand (head window, spacing from the line's previous action). */
  private wallTime(line: SafeLine, obs: readonly Obstacle[], t0: number, tLatest: number): number | null {
    const c = this.cur;
    const earliest = Math.max(t0 + GEN.noActionHead, c.last ? c.last.t + spacingAfter(c.last.t, c.last.dx) : -Infinity) + T_SHIFT(3.3) + 0.2;
    for (let t = tLatest; t >= earliest; t -= 0.15) {
      const s = sAt(t);
      if (obs.some((o) => o.s < s + 2.5 && o.s + o.len > s - 2.5 && (o.solids.length || o.pits.length))) continue;
      void line;
      return t;
    }
    return null;
  }

  /** A 6 m wall of area fillers centred on the line x (A2 overdue, DESIGN §10.6.7): the line must move ≥ 3 m. */
  private wanderWall(t: number, x: number, p: PropCtx): Obstacle[] {
    const xc = x;
    const f = fillerKinds(p.area)[0]!;
    const out: Obstacle[] = [];
    const a = Math.max(-4.5, xc - 3.0), b = Math.min(4.5, xc + 3.0);
    const pitch = f.wid + 0.1, n = Math.max(1, Math.ceil((b - a - f.wid) / pitch) + 1);
    const step = n > 1 ? (b - a - f.wid) / (n - 1) : 0;
    for (let k = 0; k < n; k++) out.push(buildFiller(round1cm(sAt(t)), round1cm(a + f.wid / 2 + k * step), false, p, k % 3));
    return out;
  }

  private commit(b: Built, index: number, area: AreaId, gateway: GatewayId | null, decorRng: Sfc32, rerolls: number,
    fallback: boolean, phase: PhaseId, areaEndT: number, rng: Sfc32): void {
    const c = this.cur;
    const t0 = c.t, s0 = c.s, t1 = b.t1, s1 = b.s1;
    const tier: Tier = b.plan.tier;
    const res = b.res;
    // Coins: the template's trick coins, plus an arc over every required ollie of the safe line (trick: "air arcs over
    // gaps and hazards", DESIGN §10.7 A5).
    for (const a of res.actions) {
      if (a.kind !== 'ollie' || a.t < t0 || a.t >= t1) continue;
      const ob = b.obstacles.find((o) => (o.tags & ObTag.FullWidth) && Math.abs(tAt(o.s + o.len / 2) - (a.t + 0.3)) < 0.6);
      const y0 = groundY(b.obstacles, sAt(a.t), a.x, c.datum);
      if (ob || b.coins.coins.length < 12) b.coins.arc(a.t - DT, a.x, y0);
    }
    const decor: Decor[] = [];
    const denv = { area, gateway, s0, s1, datum: Math.max(c.datum, b.datumEnd), driveways: b.driveways,
      nextEndWall: this.decorState.nextEndWall, backNext: this.decorState.backNext, areaEndS: sAt(areaEndT) };
    emitDecor(decor, denv, decorRng);
    this.decorState.nextEndWall = denv.nextEndWall;
    const safe: SafeKey[] = res.line.keys(t1);
    const seg: Segment = {
      index, templateId: b.plan.tpl.id === 'LESSON' ? `LESSON_${c.lessonPart}` : b.plan.tpl.id, area, tier,
      t0, t1, s0, s1, mirror: b.mirror, rerolls, fallback,
    };
    if (gateway) seg.gateway = gateway;
    this.segs.push(seg);
    const ci = (s: number) => Math.floor(s / CHUNK_LEN);
    for (let i = ci(s0); i <= ci(Math.max(s0, s1 - 1e-6)); i++) this.bucket(i).segments.push(index);
    const touched = new Set<number>();
    for (const ob of b.obstacles) {
      this.internals.obstacleById.set(ob.id, ob);
      for (const e of ob.edges) this.internals.edgeById.set(e.id, e);
      for (let i = ci(ob.s); i <= ci(ob.s + Math.max(0, ob.len - 1e-6)); i++) { this.bucket(i).obstacles.push(ob); touched.add(i); }
    }
    for (const i of touched) this.chunks.get(i)!.obstacles.sort((u, v) => u.s - v.s || u.id - v.id);
    for (const coin of b.coins.coins) {
      this.bucket(ci(coin.p.s)).coins.push(coin);
      this.coinsTotal += coin.value === 10 ? 1 : 1;
      if (coin.line === 'trick') this.coinsTrick++;
    }
    for (const d of decor) this.bucket(ci(d.s)).decor.push(d);
    for (const k of safe) this.bucket(ci(k.s)).safe.push(k);
    // Validator stats.
    const vs = this.valStats;
    vs.decisionMin = Math.min(vs.decisionMin, res.stats.decisionMin);
    vs.windowMin = Math.min(vs.windowMin, res.stats.windowMin);
    vs.deadEndMax = Math.max(vs.deadEndMax, res.stats.deadEndMax);
    vs.actions += res.stats.actions;
    // Advance the cursor.
    const clocks = !b.t0Stretch && t1 > c.clockFromT;
    if (clocks) c.aClock += t1 - Math.max(t0, c.clockFromT);
    if (b.fullWidthA !== null && t1 > c.clockFromT) {
      c.lastFwA = b.fullWidthA;
      c.fwDueA = nextFullWidthDue(c.lastFwA, phaseAt(t1), rng);
    }
    c.lastTall = b.lastTall;
    c.wander = b.wander;
    if (b.gateX) {
      const rowT = b.gateT ?? t1;
      c.gateDueT = rowT + GEN.gate.gap[phaseAt(rowT)];
      c.lastGateX = b.gateX;
    }
    if (b.plan.reason === 'breather' || gateway) {
      const br = GEN.breather[phaseAt(t1)] ?? GEN.breather.warm!;
      c.breatherDueT = t1 + (br.every[0] + br.every[1]) / 2;
    }
    const lastAction = res.actions[res.actions.length - 1];
    if (lastAction) c.last = { t: lastAction.t, dx: lastAction.dx };
    c.t = t1; c.s = s1; c.datum = b.datumEnd; c.safeX = res.exitX; c.val = res.next; c.lastTier = tier;
    if (!gateway) c.areaSegs++;
    if (b.plan.reason === 'lesson') c.lessonPart++;
    const keepFrom = sAt(t1 - HISTORY_KEEP_SEC) - 2;
    c.history = [...c.history, ...b.obstacles].filter((o) => o.kind !== 'dock_lip' || !(o.params?.body))
      .filter((o) => o.s + o.len >= keepFrom);
    for (const o of b.obstacles) if (o.kind === 'dock_lip' && o.params?.body) c.persistent.push(o);
    c.persistent = c.persistent.filter((o) => o.s + o.len > s1 - 40);
    void phase;
  }
}


/** Highest datum slab (street base, terrace, plank) under (s, x) among a segment's obstacles. */
function groundY(obs: readonly Obstacle[], s: number, x: number, dflt: number): number {
  let best = -Infinity;
  for (const o of obs) for (const sl of o.slabs) {
    if (sl.layer !== 0 || s < sl.s0 || s >= sl.s1 || x < sl.x0 || x > sl.x1) continue;
    if (o.kind !== 'curb' && o.kind !== 'terrace' && o.kind !== 'incline' && o.kind !== 'trench') continue;
    const y = sl.y0 === sl.y1 ? sl.y0 : sl.y0 + (sl.y1 - sl.y0) * ((s - sl.s0) / (sl.s1 - sl.s0));
    if (y > best) best = y;
  }
  return best > -Infinity ? best : dflt;
}
export type { Coin };
