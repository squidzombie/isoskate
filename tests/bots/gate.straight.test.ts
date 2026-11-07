// Gate: going straight is not viable (DESIGN §10.7): every lane x ∈ {−4 … 4} crashes by t ≤ 20 s from t = 0, and
// within 10 s of a plateau start (150 and 165), on 20 seeds; the straight bot ollies every full-width hazard.
// Measured beyond the acceptance (the anti-straight rows, rows.ts): plateau starts every 10 s from 150 to 460 s, and a
// rider switching to straight at its current x every 10 s of a safe-bot run. Near a gateway (a 4 s T0 stretch between
// two rows) a lane can live a few seconds longer; the bounds below are the measured ones with a margin.
import { describe, expect, it } from 'vitest';
import { EMPTY_FRAME } from '../../src/core/input';
import { BOTS, runBot } from '../../src/debug/bots';
import { createSim } from '../../src/sim';
import { TRICKS } from '../../src/tricks';
import { seedsFor, writeReport } from './suites';

const LANES = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

describe('bots gate: straight', () => {
  it('straight bot: 100 % of lanes crash by 20 s from t = 0 and within 10 s of startT 150 / 165 (20 seeds)', () => {
    const late: string[] = [];
    const worst: Record<string, number> = {};
    for (const [label, startT, limit] of [['t0', undefined, 20], ['p150', 150, 10], ['p165', 165, 10]] as const) {
      let w = 0;
      for (const seed of seedsFor(20)) for (const lane of LANES) {
        const r = runBot('straight', seed, { ticks: limit * 60, bot: { lane }, ...(startT !== undefined ? { startT } : {}) });
        if (!r.crash) late.push(`${label} seed ${seed} lane ${lane}`);
        else w = Math.max(w, r.survivedSec);
      }
      worst[label] = +w.toFixed(2);
    }
    // Plateau starts 150–460 s (4 seeds × 9 lanes).
    const sweep: number[] = [];
    for (let st = 150; st <= 460; st += 10) for (const seed of seedsFor(4)) for (const lane of LANES) {
      const r = runBot('straight', seed, { ticks: 25 * 60, bot: { lane }, startT: st });
      sweep.push(r.crash ? r.survivedSec : 99);
    }
    // Switching to straight mid-run at the current x, every 10 s of a safe-bot run from the plateau (10 seeds).
    const mid: number[] = [];
    for (const seed of seedsFor(10)) {
      const sim = createSim(TRICKS);
      sim.reset({ runId: `straight-mid-${seed}`, seed, mode: 'normal', firstRuns: false, bestDist: 0, startT: 150 });
      const safe = BOTS.safe!({ seed });
      let nextT = 160;
      while (sim.cur.t < 450 && sim.cur.mode !== 'crashed') {
        if (sim.cur.t >= nextT && sim.cur.mode === 'roll') {
          nextT += 10;
          const snap = sim.snapshot(), x = Math.round(sim.cur.p.x * 10) / 10, T = sim.cur.t;
          const st = BOTS.straight!({ lane: x });
          let dead = false;
          for (let i = 0; i < 25 * 60 && !dead; i++) for (const e of sim.step({ ...EMPTY_FRAME, ...st.frame(sim) })) if (e.t === 'crash' && !e.god) dead = true;
          mid.push(dead ? sim.cur.t - T : 99);
          sim.restore(snap);
        }
        sim.step({ ...EMPTY_FRAME, ...safe.frame(sim) });
      }
    }
    const stat = (xs: number[]) => ({ n: xs.length, over10: xs.filter((v) => v > 10).length, max: +Math.max(...xs).toFixed(2) });
    writeReport('straight', { bot: 'straight', seeds: seedsFor(20).length, lanes: LANES, worstSurvivalSec: worst, alive: late,
      plateauStarts: stat(sweep), midRunSwitch: stat(mid) });
    expect(late).toEqual([]);
    expect(stat(sweep).over10 / sweep.length).toBeLessThanOrEqual(0.03);
    expect(stat(sweep).max).toBeLessThanOrEqual(15);
    expect(stat(mid).over10 / mid.length).toBeLessThanOrEqual(0.10);
    expect(stat(mid).max).toBeLessThanOrEqual(20);
  });
});
