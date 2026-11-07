// Sim basics (TECH §11.1, ROADMAP M0 item 11): airtime, apex, line change, speed, soft walls, step-up, skim and crash
// tops, side bumps, pits at lip level, sticky stairs, landing bands, coyote and jump buffer. Hand-built fixture worlds;
// InputFrames are constructed directly (core/input.ts).
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/core/events';
import type { InputFrame } from '../../../src/core/input';
import type { Sim, SimSnapshot } from '../../../src/core/sim';
import { DT, FACE_INSET, V_POP, sAt, speedAt } from '../../../src/core/tuning';
import type { Obstacle } from '../../../src/core/world';
import { createSim } from '../../../src/sim';
import { TRICKS } from '../../../src/tricks';
import { box, fixtureWorld, frame, pit, runCfg, slab } from './fixtures';

function make(obs: Obstacle[], startT = 0, o: Parameters<typeof runCfg>[0] = {}): Sim {
  const sim = createSim(TRICKS, fixtureWorld(obs));
  sim.reset(runCfg({ startT, ...o }));
  return sim;
}
/** Test backdoor through the opaque snapshot: put the skater somewhere (cur and prev). */
function place(sim: Sim, p: { x?: number; y?: number; targetX?: number }): void {
  const s = sim.snapshot() as unknown as { cur: { p: { x: number; y: number }; targetX: number; groundY: number };
    prev: { p: { x: number; y: number }; targetX: number; groundY: number } };
  for (const st of [s.cur, s.prev]) {
    if (p.x !== undefined) { st.p.x = p.x; st.targetX = p.targetX ?? p.x; }
    if (p.y !== undefined) { st.p.y = p.y; st.groundY = p.y; }
  }
  sim.restore(s as unknown as SimSnapshot);
}
function run(sim: Sim, n: number, f: (i: number) => Partial<InputFrame> = () => ({})): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < n && sim.cur.mode !== 'crashed'; i++) out.push(...sim.step(frame(f(i))));
  return out;
}
const kinds = (ev: readonly GameEvent[]) => ev.map((e) => e.t);
const crashOf = (ev: readonly GameEvent[]) => ev.find((e): e is Extract<GameEvent, { t: 'crash' }> => e.t === 'crash');

describe('speed and air', () => {
  it.each([[0, 7.0], [160, 10.5]])('flat ollie airtime 0.600 s ± 1 tick and apex 0.99 m (startT %d → %d m/s)', (startT, v) => {
    const sim = make([], startT);
    run(sim, 5);
    expect(sim.cur.vel.s).toBeCloseTo(v, 9);
    const ev = sim.step(frame({ tap: true }));
    expect(kinds(ev)).toContain('ollie');
    let ticks = 1, apex = sim.cur.p.y;
    const land: GameEvent[] = [];
    while (sim.cur.mode === 'air' && ticks < 120) { land.push(...sim.step(frame())); ticks++; apex = Math.max(apex, sim.cur.p.y); }
    expect(Math.abs(ticks * DT - 0.6)).toBeLessThanOrEqual(DT + 1e-9);
    expect(Math.abs(apex - 0.99)).toBeLessThanOrEqual(0.01);
    const l = land.find((e) => e.t === 'land') as Extract<GameEvent, { t: 'land' }>;
    expect(l.airT).toBeCloseTo(0.6, 9);
    expect(l.quality).toBe('clean');
  });

  it('follows the closed-form speed schedule: 7.0 at 20 s, 8.95 at 90 s, 10.5 from 150 s', () => {
    for (const [t, v] of [[20, 7.0], [90, 8.9515], [150, 10.5], [200, 10.5]] as const) {
      const sim = make([], t - 1);
      run(sim, 60);
      expect(sim.cur.t).toBeCloseTo(t, 9);
      expect(sim.cur.vel.s).toBeCloseTo(speedAt(t), 12);
      expect(sim.cur.vel.s).toBeCloseTo(v, 3);
      expect(sim.cur.p.s).toBeCloseTo(sAt(t), 9);
    }
    expect(Math.abs(speedAt(90) - 8.99)).toBeLessThan(0.05);
  });

  it.each([[0], [160]])('a 2 m line change settles (within 0.1 m) in ≤ 0.50 s (startT %d)', (startT) => {
    const settle = (dx: number) => {
      const sim = make([], startT);
      const xs: number[] = [];
      run(sim, 150, (i) => (i === 0 ? { steerDx: dx } : {}));
      // Re-run recording x (run() stops on crash only; record via a second sim to keep it simple).
      const s2 = make([], startT);
      for (let i = 0; i < 150; i++) { s2.step(frame(i === 0 ? { steerDx: dx } : {})); xs.push(s2.cur.p.x); }
      let last = -1;
      for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i]! - dx) > 0.1) last = i;
      return (last + 1) * DT;
    };
    expect(settle(2)).toBeLessThanOrEqual(0.5);
    expect(settle(1)).toBeLessThanOrEqual(0.35);
    expect(settle(3)).toBeLessThanOrEqual(0.75);
  });

  it('soft walls keep the skater inside the corridor', () => {
    const sim = make([]);
    let maxX = 0;
    for (let i = 0; i < 240; i++) { sim.step(frame({ steerDx: i < 10 ? 2 : 0 })); maxX = Math.max(maxX, sim.cur.p.x); }
    expect(maxX).toBeLessThanOrEqual(4.5);
    expect(sim.cur.targetX).toBeCloseTo(4.3, 9);
    expect(sim.cur.p.x).toBeGreaterThan(4.1);
    expect(sim.cur.p.x).toBeLessThanOrEqual(4.31);
  });
});

describe('contacts (frozen, TECH §6.4)', () => {
  it('a 0.18 m step is a bump; a 0.19 m landable body is a frontal slam; a 0.18 m landable body skims', () => {
    const step = make([slab({ s: 10, len: 20, x0: -1, x1: 1, y: 0.18 })]);
    run(step, 180);
    expect(step.cur.mode).toBe('roll');
    expect(step.cur.p.y).toBeCloseTo(0.18, 9);

    const wall = make([box({ s: 10, x: 0, len: 2, wid: 2, hgt: 0.19, top: 'landable' })]);
    const ev = run(wall, 180);
    expect(crashOf(ev)?.cause).toBe('slam');

    const low = make([box({ s: 10, x: 0, len: 2, wid: 2, hgt: 0.18, top: 'landable' })]);
    const ev2 = run(low, 180);
    expect(crashOf(ev2)).toBeUndefined();
    expect(kinds(ev2)).toContain('bump');
  });

  it('skims onto a landable top ≤ STEP_UP above the board; the same crash top slams', () => {
    for (const [top, expectCrash] of [['landable', false], ['crash', true]] as const) {
      const sim = make([slab({ s: -5, len: 40, x0: -3, x1: 3, y: 0.30 }), box({ s: 12, x: 0, len: 3, wid: 2, hgt: 0.45, top })]);
      place(sim, { y: 0.30 });
      const ev = run(sim, 150);
      expect(!!crashOf(ev), top).toBe(expectCrash);
      if (expectCrash) expect(crashOf(ev)!.cause).toBe('slam');
      else expect(kinds(ev)).toContain('bump');
    }
  });

  it('a crash top 0.05 m above the board (inset face) is a slam; above the inset face there is no contact', () => {
    const board = 0.30;
    const mk = (hgt: number, top: 'crash' | 'landable') => {
      const sim = make([slab({ s: -5, len: 40, x0: -3, x1: 3, y: board }), box({ s: 12, x: 0, len: 1, wid: 2, hgt, top, y0: 0 })]);
      place(sim, { y: board });
      return run(sim, 150);
    };
    expect(crashOf(mk(board + FACE_INSET + 0.05, 'crash'))?.cause).toBe('slam');
    expect(crashOf(mk(board + FACE_INSET + 0.05, 'landable'))).toBeUndefined();   // the landable one skims
    expect(crashOf(mk(board + FACE_INSET - 0.02, 'crash'))).toBeUndefined();      // board above the inset top
  });

  it.each([[0], [160]])('a flat ollie never clears a 1.15 m crash-top bin, at any take-off tick (startT %d)', (startT) => {
    const sBin = sAt(startT + 3);
    let crashes = 0, tries = 0;
    for (let k = 60; k <= 180; k += 2) {
      const sim = make([box({ s: sBin, x: 0, len: 0.6, wid: 0.6, hgt: 1.15, top: 'crash' })], startT);
      const ev = run(sim, 260, (i) => (i === k ? { tap: true } : {}));
      tries++;
      if (crashOf(ev)) crashes++;
    }
    expect(crashes).toBe(tries);
  });

  it('side contact is a bump: pushed out, re-anchored, no crash', () => {
    const sim = make([box({ s: 3, x: 1.4, len: 60, wid: 0.6, hgt: 1.3, top: 'crash' })]);
    const ev = run(sim, 300, (i) => (i >= 60 && i < 70 ? { steerDx: 0.3 } : {}));
    expect(crashOf(ev)).toBeUndefined();
    const bumps = ev.filter((e) => e.t === 'bump') as Extract<GameEvent, { t: 'bump' }>[];
    expect(bumps.length).toBeGreaterThan(0);
    expect(bumps[0]!.side).toBe(-1);
    expect(sim.cur.p.x).toBeLessThanOrEqual(1.1 + FACE_INSET - 0.2 + 1e-6);
  });

  it.each([0.02, 0.05, 1.0])('drifting off a ledge top sideways (steerAxis %d) drops once: one airborne, one landing, no bump', (axis) => {
    const sim = make([box({ s: -2, x: 0, len: 60, wid: 0.6, hgt: 0.45, top: 'landable' })]);
    place(sim, { x: 0, y: 0.45 });
    const ev = run(sim, 300, (i) => (i > 10 ? { steerAxis: axis } : {}));
    expect(crashOf(ev)).toBeUndefined();
    expect(ev.filter((e) => e.t === 'airborne').length).toBe(1);
    expect(ev.filter((e) => e.t === 'land').length).toBe(1);
    expect(ev.filter((e) => e.t === 'bump' && e.kind !== 'wall').length).toBe(0);   // steerAxis 1 reaches the soft wall
    expect(sim.cur.p.y).toBe(0);
  });

  it('rolling onto a pit falls (pit level = lip level); an ollie across lands safely past the far edge', () => {
    const roll = make([pit({ s: 14, len: 2.0 })]);
    const ev = run(roll, 200);
    expect(crashOf(ev)?.cause).toBe('fall');
    expect(roll.result().crash?.cause).toBe('fall');

    const jump = make([pit({ s: 14, len: 2.0 })]);
    const kTake = Math.round(((14 + 1.0) / 7 - 0.3) / DT) - 1;         // centre over the pit's middle at the apex
    const ev2 = run(jump, 260, (i) => (i === kTake ? { tap: true } : {}));
    expect(crashOf(ev2)).toBeUndefined();
    expect(jump.cur.p.s).toBeGreaterThan(20);
  });

  it('stairs are sticky: rolling down follows the slope with stair steps, never airborne', () => {
    const sim = make([
      slab({ s: 10, len: 3, x0: -4.5, x1: 4.5, y: 0, y1: -0.85, kind: 'stairs', steps: 5 }),
      slab({ s: 13, len: 30, x0: -4.5, x1: 4.5, y: -0.85 }),
    ]);
    const ev = run(sim, 200);
    expect(kinds(ev)).not.toContain('airborne');
    expect(ev.filter((e) => e.t === 'stairStep').length).toBeGreaterThanOrEqual(4);
    expect(sim.cur.p.y).toBeCloseTo(-0.85, 9);
  });
});

describe('landing bands (DESIGN §7)', () => {
  /** Flat ollie on frame 10, kickflip swipe `a` ticks later; returns the landing quality or the crash cause. */
  function flipLanding(a: number, firstRuns = false): { result: string; flipped: boolean } {
    const sim = make([], 0, { firstRuns });
    const ev = run(sim, 90, (i) => (i === 10 ? { tap: true } : i === 10 + a ? { swipe: 'l', swipeFast: true } : {}));
    const land = ev.find((e) => e.t === 'land') as Extract<GameEvent, { t: 'land' }> | undefined;
    return { result: crashOf(ev)?.cause ?? land?.quality ?? 'none', flipped: kinds(ev).includes('flipStart') };
  }
  it('finished in the air: Perfect when the last rotation finished ≤ 0.12 s before touchdown, else clean', () => {
    expect(flipLanding(12).result).toBe('perfect');
    expect(flipLanding(16).result).toBe('perfect');
    expect(flipLanding(6).result).toBe('clean');
  });
  it('p ≥ 0.80 lands clean (snap), 0.55 ≤ p < 0.80 sketchy, p < 0.55 bails', () => {
    expect(flipLanding(19).result).toBe('clean');                // p ≈ 0.89
    expect(flipLanding(23).result).toBe('sketchy');              // p ≈ 0.68
    expect(flipLanding(26).result).toBe('badLanding');           // p ≈ 0.52
    expect(flipLanding(26, true).result).toBe('sketchy');        // first runs: bail floor 0.40
  });
  it('too-late swipes (< 0.15 s of air left) are ignored', () => {
    const r = flipLanding(29);
    expect(r.flipped).toBe(false);
    expect(r.result).toBe('clean');
  });
  it('a sketchy landing banks the combo at once', () => {
    const sim = make([]);
    const ev = run(sim, 90, (i) => (i === 10 ? { tap: true } : i === 33 ? { swipe: 'l', swipeFast: true } : {}));
    const banked = ev.find((e) => e.t === 'comboBanked') as Extract<GameEvent, { t: 'comboBanked' }>;
    expect(banked.reason).toBe('sketchy');
  });
});

describe('coyote and jump buffer', () => {
  it('a tap within 0.08 s of rolling off an edge still ollies; later it does not', () => {
    const go = (late: number) => {
      const sim = make([box({ s: -2, x: 0, len: 14, wid: 2, hgt: 1.2, top: 'landable' })]);   // 0.33 s drop
      place(sim, { y: 1.2 });
      const out: GameEvent[] = [];
      let airTick = -1;
      for (let i = 0; i < 120 && sim.cur.mode !== 'crashed'; i++) {
        const tap = airTick >= 0 && i === airTick + late;
        const ev = sim.step(frame({ tap }));
        out.push(...ev);
        if (airTick < 0 && ev.some((e) => e.t === 'airborne')) airTick = i;
      }
      return out.filter((e) => e.t === 'ollie').length;
    };
    expect(go(2)).toBe(1);
    expect(go(8)).toBe(0);
  });
  it('a tap in the last 0.15 s of air ollies on touchdown', () => {
    const sim = make([]);
    const ev = run(sim, 120, (i) => (i === 10 || i === 10 + 30 ? { tap: true } : {}));
    const ollies = ev.filter((e) => e.t === 'ollie');
    expect(ollies.length).toBe(2);
    const land = ev.find((e) => e.t === 'land')!;
    expect(ollies[1]!.tick).toBe(land.tick);
    expect(V_POP).toBe(6.6);
  });
});

describe('manual (M0 minimum, DESIGN §6.4)', () => {
  it('a resting thumb outside a combo starts nothing; HOLD inside the link window manuals for the 3.0 s budget, once', () => {
    const rest = make([]);
    expect(kinds(run(rest, 200, () => ({ hold: true, press: true })))).not.toContain('manualStart');

    const sim = make([]);
    const ev = run(sim, 600, (i) => (i === 10 ? { tap: true } : i >= 47 ? { hold: true, press: true } : {}));
    const starts = ev.filter((e) => e.t === 'manualStart');
    expect(starts.length).toBe(1);
    const end = ev.find((e): e is Extract<GameEvent, { t: 'manualEnd' }> => e.t === 'manualEnd')!;
    expect(end.reason).toBe('budget');
    expect(end.dur).toBeCloseTo(3.0, 1);
    expect(ev.some((e) => e.t === 'trickScored' && e.id === 'manual')).toBe(true);
  });
});
