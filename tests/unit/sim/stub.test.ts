// M0 sim stub: contract smoke tests. M0-sim/GP replace these with tests/unit/sim/* per TECH §11.1.
import { describe, expect, it } from 'vitest';
import { EMPTY_FRAME, type InputFrame } from '../../../src/core/input';
import { sAt, speedAt } from '../../../src/core/tuning';
import { createSim } from '../../../src/sim';
import { TRICKS } from '../../../src/tricks';

const cfg = (seed: number) => ({ runId: `r${seed}`, seed, mode: 'normal' as const, firstRuns: false, bestDist: 0 });
const f = (p: Partial<InputFrame> = {}): InputFrame => ({ ...EMPTY_FRAME, ...p });

describe('sim stub', () => {
  it('rolls on the closed-form schedule', () => {
    const sim = createSim(TRICKS);
    sim.reset({ ...cfg(1), god: true });
    for (let i = 0; i < 600; i++) sim.step(f());
    expect(sim.cur.tick).toBe(600);
    expect(sim.cur.p.s).toBeCloseTo(sAt(10), 9);
    expect(sim.cur.vel.s).toBe(speedAt(10));
  });
  it('a tap ollies: ~0.60 s of air on flat ground', () => {
    const sim = createSim(TRICKS);
    sim.reset({ ...cfg(1), startT: 0 });
    const ev = sim.step(f({ tap: true }));
    expect(ev.map((e) => e.t)).toContain('ollie');
    let air = 1;
    while (sim.cur.mode === 'air' && air < 120) { sim.step(f()); air++; }
    expect(Math.abs(air / 60 - 0.6)).toBeLessThanOrEqual(1 / 60 + 1e-9);
  });
  it('going straight eventually slams into the full-width barrier', () => {
    const sim = createSim(TRICKS);
    sim.reset(cfg(3));
    let crash = null;
    for (let i = 0; i < 60 * 30 && !crash; i++) for (const e of sim.step(f())) if (e.t === 'crash') crash = e;
    expect(crash).not.toBeNull();
    expect(sim.cur.mode).toBe('crashed');
    expect(sim.result().crash).not.toBeNull();
  });
  it('is deterministic and snapshot/restore reproduces the hash', () => {
    const run = () => {
      const sim = createSim(TRICKS);
      sim.reset({ ...cfg(7), god: true });
      const hashes: number[] = [];
      for (let i = 0; i < 900; i++) { sim.step(f({ steerDx: Math.sin(i / 30) * 0.05, tap: i % 97 === 0 })); hashes.push(sim.hash()); }
      return { sim, hashes };
    };
    const a = run(), b = run();
    expect(a.hashes).toEqual(b.hashes);
    const snap = a.sim.snapshot();
    for (let i = 0; i < 120; i++) a.sim.step(f({ steerDx: 0.02 }));
    const h1 = a.sim.hash();
    a.sim.restore(snap);
    for (let i = 0; i < 120; i++) a.sim.step(f({ steerDx: 0.02 }));
    expect(a.sim.hash()).toBe(h1);
  });
});
