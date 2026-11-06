// debug/bots/safe.ts: the safe bot ("human", DESIGN §10.11, TECH §11.2). It plans with the validator's planner
// (world/gen planLine: the same grid, F / B passes and minimum-action DP) on what was inside the guaranteed 2.5 s
// view 0.25 s ago (observation delay), re-planning every 6 ticks. Its inputs reach the sim 0.15 s late (a delay line
// of decided frames), taps carry ±0.05 s of seeded jitter and the steering target moves at most 85 % of V_LAT_MAX.
// Steering puts targetX on the plan's x a little ahead of the tick the input lands on (the controller lags it).
// A re-plan starts where the board will be when its first input lands: on the ground, after any tap already sent.
import type { InputFrame } from '../../core/input';
import { Sfc32, hash32 } from '../../core/rng';
import type { Sim } from '../../core/sim';
import { DT, LOOKAHEAD_MIN, V_LAT_MAX, sAt } from '../../core/tuning';
import { planLine } from '../../world/gen';
import { polyAt } from './util';

export interface SafeBotOptions {
  seed?: number;
  /** Observation delay (s): plans on what was visible this long ago. */
  reaction?: number;
  /** Input latency (s). */
  latency?: number;
  /** Tap timing jitter (±s). */
  jitter?: number;
  /** Fraction of V_LAT_MAX the steering target may move at. */
  latFrac?: number;
  /** Re-plan period (ticks). */
  every?: number;
  /** Steering lead over the landing tick (s): the lateral controller lags targetX. */
  lead?: number;
}

/** A tap: its tick (run time), the planned touch-down and the tick the plan asked for (before jitter). */
interface Tap { t: number; land: number; planned: number }

/** The safe bot's decision for one tick (before the latency delay line). */
export interface Decision { targetX: number; tap: boolean }

export class SafeBot {
  readonly reaction: number; readonly latency: number; readonly jitter: number; readonly latFrac: number;
  readonly every: number; readonly lead: number;
  private pts: { t: number; x: number }[] = [];
  private taps: Tap[] = [];                         // the current plan's taps (planned ticks)
  private pending: Tap[] = [];                      // decided, not yet sent
  private sent: Tap[] = [];                         // in the delay line or already applied (kept until landed)
  private readonly delay: Decision[] = [];
  private readonly rng: Sfc32;
  private tick = 0;
  private sincePlan = 1e9;
  private desired = Number.NaN;
  private dir: -1 | 0 | 1 = 0;
  /** Plans made / failed (no viable line in view). */
  plans = 0; failures = 0;
  /** Planner time (ms), for the harness. */
  planMs = 0;

  constructor(o: SafeBotOptions = {}) {
    this.reaction = o.reaction ?? 0.25; this.latency = o.latency ?? 0.15; this.jitter = o.jitter ?? 0.05;
    this.latFrac = o.latFrac ?? 0.85; this.every = o.every ?? 6; this.lead = o.lead ?? 0.1;
    this.rng = new Sfc32(hash32(o.seed ?? 1, 0x5afe));
  }

  /** Forget the plan (the trick bot left it): the next re-plan starts from the board. */
  reset(): void { this.pts = []; this.taps = []; this.pending = []; this.sent = []; this.delay.length = 0; this.sincePlan = 1e9; this.desired = Number.NaN; }

  /** The plan's x at run time t (the thumb bot renders it). */
  planX(t: number): number { return polyAt(this.pts, t); }

  /** Decide the input for the tick `latency` from now (call once per tick, before step). */
  decide(sim: Sim): Decision {
    const c = sim.cur;
    const tNow = c.t + DT;                            // the tick about to be stepped
    const tLand = tNow + this.latency;                // the tick this decision lands on
    if (Number.isNaN(this.desired)) this.desired = c.targetX;
    if (++this.sincePlan >= this.every || !this.pts.length) { this.sincePlan = 0; this.replan(sim, tNow); }
    const want = this.pts.length ? polyAt(this.pts, tLand + this.lead) : c.targetX;
    const maxStep = this.latFrac * V_LAT_MAX * DT;
    this.desired += Math.max(-maxStep, Math.min(maxStep, want - this.desired));
    let tap = false;
    while (this.pending.length && this.pending[0]!.t <= tLand + DT / 2) {
      const p = this.pending.shift()!;
      if (p.t >= tLand - DT / 2) { tap = true; this.sent.push(p); }
    }
    this.sent = this.sent.filter((p) => p.land > tNow - 0.5);
    this.tick++;
    return { targetX: this.desired, tap };
  }

  frame(sim: Sim): Partial<InputFrame> {
    const c = sim.cur;
    if (c.mode === 'crashed') return {};
    this.delay.push(this.decide(sim));
    const n = Math.round(this.latency / DT);
    if (this.delay.length <= n) return {};
    const d = this.delay.shift()!;
    const f: Partial<InputFrame> = { tap: d.tap };
    if (c.mode !== 'grind') f.steerDx = d.targetX - c.targetX;
    return f;
  }

  private replan(sim: Sim, tNow: number): void {
    const c = sim.cur;
    if (c.mode === 'grind') return;
    const lat = this.latency;
    const phase = phaseOf(sim);
    // The plan starts on the ground when its first input lands, after every tap already sent has touched down.
    let t0 = tNow + lat;
    for (const p of this.sent) t0 = Math.max(t0, p.land + DT);
    if (c.mode === 'air') t0 = Math.max(t0, tNow + c.airLeft + DT);
    t0 = phase + Math.ceil((t0 - phase) / DT - 1e-9) * DT;
    const x0 = this.pts.length ? polyAt(this.pts, t0) : c.p.x;
    // What was visible `reaction` ago: the guaranteed view (LOOKAHEAD_MIN of run time ahead).
    const tSeen = tNow - this.reaction;
    const horizon = tSeen + LOOKAHEAD_MIN - t0;
    if (horizon < 0.6) return;
    const sEnd = sAt(tSeen + LOOKAHEAD_MIN);
    const obs = sim.world.obstacles(sAt(t0) - 4, sEnd).filter((o) => o.s < sEnd);
    const w0 = performance.now();
    const p = planLine({ t: t0, x: Math.max(-4.25, Math.min(4.25, x0)), horizon, obstacles: obs, phase, dir: this.dir, refine: true });
    this.planMs += performance.now() - w0;
    this.plans++;
    if (!p) { this.failures++; this.commit(tNow); return; }
    this.taps = p.ollies.map((t, i) => ({ t, land: p.lands[i]!, planned: t }));
    this.pts = [...this.pts.filter((q) => q.t < t0 - 1e-9), ...p.pts];
    let k = 1;
    while (k + 1 < p.pts.length && Math.abs(p.pts[k + 1]!.x - p.pts[k]!.x) < 1e-6) k++;
    this.dir = k + 1 < p.pts.length ? (Math.sign(p.pts[k + 1]!.x - p.pts[k]!.x) as -1 | 1) : 0;
    this.commit(tNow);
  }

  /** The plan's taps up to the next re-plan become decisions (with jitter); later ones wait for the next plan. */
  private commit(tNow: number): void {
    const lat = this.latency;
    const from = tNow + lat - DT / 2, until = tNow + lat + this.every * DT - DT / 2;
    // Taps decided in an earlier window (jitter may have moved them past it) stay decided.
    this.pending = this.pending.filter((q) => q.planned < from);
    for (const tp of this.taps) {
      // A tap the new plan moved just before this window (re-plans jitter by a tick) is sent at the earliest tick.
      if (tp.t < from - 0.1) continue;
      if (tp.t > until) break;
      if ([...this.sent, ...this.pending].some((q) => Math.abs(q.planned - tp.t) < 0.2)) continue;
      const j = Math.round(((this.rng.float() * 2 - 1) * this.jitter) / DT) * DT;
      const t = Math.max(tNow + lat, tp.t + j);
      this.pending.push({ t, land: tp.land + (t - tp.t), planned: tp.t });
      this.pending.sort((a, b) => a.t - b.t);
    }
  }
}

/** Sim tick phase: ticks happen at phase + n·DT (run time). */
export const phaseOf = (sim: Sim): number => sim.cur.t - sim.cur.tick * DT;
