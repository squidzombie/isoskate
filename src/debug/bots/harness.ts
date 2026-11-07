// debug/bots/harness.ts: the headless bot harness (TECH §11.2). The real createSim (which builds the real world
// generator) at full speed, one bot frame per tick, nothing but InputFrames into the sim. Returns what the gate suites
// and scripts/bot-report.mjs need: the crash (seed, tick, cause, surrounding segments), trick events the plan did not
// ask for (thumb bot), banked combos (score, duration), score and generator stats.
import type { GameEvent } from '../../core/events';
import { EMPTY_FRAME } from '../../core/input';
import type { RunConfig, Sim } from '../../core/sim';
import type { GenStats } from '../../core/world';
import { createSim } from '../../sim';
import { TRICKS } from '../../tricks';
import { GEN_FLAGS } from '../../world/gen';
import { BOTS, type BotKind, type BotOptions } from './registry';

export interface BotCrash { cause: string; kind: string | null; t: number; tick: number; x: number; y: number; mode: string; segs: string }
export interface BotRun {
  kind: BotKind; seed: number; startT: number;
  /** Ticks stepped and the run time reached. */
  ticks: number; t: number; survivedSec: number;
  crash: BotCrash | null;
  events: Partial<Record<GameEvent['t'], number>>;
  /** Trick starts nobody asked for (thumb bot: any flip / spin / grab / manual start). */
  unintended: { t: number; ev: string }[];
  combos: { total: number; links: number; durSec: number }[];
  score: number; trickPts: number; distancePts: number;
  gen: GenStats;
  /** Wall time (ms) of the whole run. */
  wallMs: number;
  sim: Sim;
}
export interface RunOptions {
  ticks: number; startT?: number; bot?: BotOptions; trench?: boolean; mode?: 'normal' | 'lesson';
  /** Stop at the first crash (default true). */
  stopOnCrash?: boolean;
}

const UNINTENDED: readonly GameEvent['t'][] = ['flipStart', 'spinStart', 'grabStart', 'manualStart'];

export function runBot(kind: BotKind, seed: number, o: RunOptions): BotRun {
  const w0 = performance.now();
  const sim = createSim(TRICKS);
  const cfg: RunConfig = { runId: `bot-${kind}-${seed}`, seed, mode: o.mode ?? 'normal', firstRuns: false, bestDist: 0 };
  if (o.startT !== undefined) cfg.startT = o.startT;
  // The generator reads GEN_FLAGS when the sim builds its world in reset().
  const was = GEN_FLAGS.trench;
  GEN_FLAGS.trench = o.trench ?? was;
  try { sim.reset(cfg); } finally { GEN_FLAGS.trench = was; }
  const make = BOTS[kind];
  if (!make) throw new Error(`bot '${kind}' is not implemented`);
  const bot = make({ seed, ...o.bot });
  const events: BotRun['events'] = {};
  const unintended: BotRun['unintended'] = [];
  const combos: BotRun['combos'] = [];
  let crash: BotCrash | null = null, n = 0;
  const stop = o.stopOnCrash ?? true;
  const t0 = sim.cur.t;
  for (; n < o.ticks && !(crash && stop); n++) {
    for (const e of sim.step({ ...EMPTY_FRAME, ...bot.frame(sim) })) {
      events[e.t] = (events[e.t] ?? 0) + 1;
      if (UNINTENDED.includes(e.t)) unintended.push({ t: sim.cur.t, ev: e.t });
      if (e.t === 'comboBanked') combos.push({ total: e.total, links: e.links, durSec: e.durSec });
      if (e.t === 'crash' && !e.god && !crash) {
        const c = sim.cur;
        const segs = sim.gen.segments().filter((s) => s.t1 >= c.t - 3 && s.t0 <= c.t + 1)
          .map((s) => `${s.templateId}/T${s.tier}@${s.t0.toFixed(2)}`).join(' ');
        crash = { cause: e.cause, kind: e.kind, t: c.t, tick: c.tick, x: c.p.x, y: c.p.y, mode: sim.prev.mode, segs };
      }
    }
  }
  const sc = sim.score;
  return {
    kind, seed, startT: t0, ticks: n, t: sim.cur.t, survivedSec: (crash ? crash.t : sim.cur.t) - t0,
    crash, events, unintended, combos,
    score: sc.total, trickPts: sc.trickPts, distancePts: sc.distancePts,
    gen: sim.gen.stats(), wallMs: performance.now() - w0, sim,
  };
}

export const describeCrash = (r: BotRun): string => r.crash
  ? `${r.crash.cause} on ${r.crash.kind} at t=${r.crash.t.toFixed(2)} (tick ${r.crash.tick}) x=${r.crash.x.toFixed(2)} y=${r.crash.y.toFixed(2)} [${r.crash.segs}]`
  : 'alive';
