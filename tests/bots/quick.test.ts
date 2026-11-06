// bots.quick (ROADMAP M0 item 11, part of `npm test`): the SafeKey follower never crashes on the M0 templates
// (20 seeds × 2 min from t = 0 with S_TRENCH on, 10 more with the M0 default (off), plus plateau starts), and going
// straight is not viable (DESIGN §10.7: every lane crashes by t ≤ 20 s from t = 0, within 10 s of a plateau start).
// The headless harness (TECH §11.2) is inline: the real createSim + createWorldGen at full speed, bots driving the sim
// only through InputFrames.
import { describe, expect, it } from 'vitest';
import { SIM_HZ } from '../../src/core/tuning';
import type { GameEvent } from '../../src/core/events';
import { EMPTY_FRAME } from '../../src/core/input';
import type { RunConfig, Sim } from '../../src/core/sim';
import { BOTS, type BotKind, type BotOptions } from '../../src/debug/bots';
import { createSim } from '../../src/sim';
import { TRICKS } from '../../src/tricks';
import { GEN_FLAGS } from '../../src/world/gen';
interface BotRun {
  sim: Sim; ticks: number;
  crash: Extract<GameEvent, { t: 'crash' }> | null;
  events: Map<GameEvent['t'], number>;
}

function runBot(kind: BotKind, seed: number, ticks: number,
  o: { startT?: number; bot?: BotOptions; cfg?: Partial<RunConfig>; trench?: boolean } = {}): BotRun {
  const sim = createSim(TRICKS);
  const cfg: RunConfig = { runId: `bot-${kind}-${seed}`, seed, mode: 'normal', firstRuns: false, bestDist: 0, ...o.cfg };
  if (o.startT !== undefined) cfg.startT = o.startT;
  // The sim builds its world in reset(); the generator reads GEN_FLAGS once, there.
  const was = GEN_FLAGS.trench;
  GEN_FLAGS.trench = o.trench ?? was;
  try { sim.reset(cfg); } finally { GEN_FLAGS.trench = was; }
  const bot = BOTS[kind]!({ seed, ...o.bot });
  const events = new Map<GameEvent['t'], number>();
  let crash: BotRun['crash'] = null, n = 0;
  for (; n < ticks && !crash; n++) {
    for (const e of sim.step({ ...EMPTY_FRAME, ...bot.frame(sim) })) {
      events.set(e.t, (events.get(e.t) ?? 0) + 1);
      if (e.t === 'crash' && !e.god) crash = e;
    }
  }
  return { sim, ticks: n, crash, events };
}

function describeCrash(r: BotRun): string {
  if (!r.crash) return 'alive';
  const c = r.sim.cur;
  const segs = r.sim.gen.segments().filter((s) => s.t1 >= c.t - 3 && s.t0 <= c.t + 1)
    .map((s) => `${s.templateId}/T${s.tier}@${s.t0.toFixed(2)}`).join(' ');
  return `${r.crash.cause} on ${r.crash.kind} at t=${c.t.toFixed(2)} x=${c.p.x.toFixed(2)} y=${c.p.y.toFixed(2)} (${segs})`;
}

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('bots.quick', () => {
  it('SafeKey follower: 0 crashes on 20 seeds × 2 min from t = 0 (S_TRENCH on)', () => {
    const crashes: string[] = [];
    let grinds = 0, trenches = 0;
    for (const seed of SEEDS) {
      const r = runBot('safe', seed, 120 * SIM_HZ, { trench: true });
      if (r.crash) crashes.push(`seed ${seed}: ${describeCrash(r)}`);
      expect(r.sim.cur.t).toBeGreaterThan(r.crash ? 0 : 119.9);
      grinds += r.events.get('grindStart') ?? 0;
      trenches += r.sim.gen.segments().filter((sg) => sg.templateId === 'S_TRENCH').length;
      const st = r.sim.gen.stats();
      expect(st.fallbacks, `seed ${seed} fallbacks`).toBeLessThanOrEqual(1);
    }
    expect(crashes).toEqual([]);
    expect(grinds).toBe(0);                       // the safe line never gets captured by an edge
    expect(trenches).toBeGreaterThan(20);
  });

  it('SafeKey follower: 0 crashes on 10 more seeds × 2 min with the M0 default (S_TRENCH off)', () => {
    const crashes: string[] = [];
    for (const seed of SEEDS.slice(0, 10).map((s) => s + 100)) {
      const r = runBot('safe', seed, 120 * SIM_HZ);
      if (r.crash) crashes.push(`seed ${seed}: ${describeCrash(r)}`);
      expect(r.sim.gen.segments().some((sg) => sg.templateId === 'S_TRENCH')).toBe(false);
    }
    expect(crashes).toEqual([]);
  });

  it('SafeKey follower: 0 crashes from plateau starts (startT 150 / 165 / 200, 1 min, S_TRENCH on)', () => {
    const crashes: string[] = [];
    for (const startT of [150, 165, 200]) for (const seed of SEEDS.slice(0, 5)) {
      const r = runBot('safe', seed, 60 * SIM_HZ, { startT, trench: true });
      if (r.crash) crashes.push(`startT ${startT} seed ${seed}: ${describeCrash(r)}`);
    }
    expect(crashes).toEqual([]);
  });

  // Straight lanes, ollieing every full-width hazard. S_TRENCH off is the worst case (a trench kills every lane off
  // its plank; a barrier is ollied).
  it('straight bot: every lane x ∈ {−4 … 4} crashes by t ≤ 20 s (20 seeds)', () => {
    const late: string[] = [];
    let worst = 0;
    for (const seed of SEEDS) for (let lane = -4; lane <= 4; lane++) {
      const r = runBot('straight', seed, 20 * SIM_HZ, { bot: { lane } });
      if (!r.crash) late.push(`seed ${seed} lane ${lane} alive at ${r.sim.cur.t.toFixed(1)} s`);
      else worst = Math.max(worst, r.sim.cur.t);
    }
    expect(late).toEqual([]);
    expect(worst).toBeLessThanOrEqual(20);
  });

  it.each([150, 165])('straight bot from a plateau start (startT %d): every lane crashes within 10 s (20 seeds)', (startT) => {
    const late: string[] = [];
    for (const seed of SEEDS) for (let lane = -4; lane <= 4; lane++) {
      const r = runBot('straight', seed, 10 * SIM_HZ, { startT, bot: { lane } });
      if (!r.crash) late.push(`seed ${seed} lane ${lane}`);
    }
    expect(late).toEqual([]);
  });
});
