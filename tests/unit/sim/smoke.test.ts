// Sim smoke tests on the real generator, including the invariants tests/e2e/smoke.spec.ts relies on
// (docs/core-requests.md): a straight run slams before tick 400 for seeds 1–3 (the 3.5 s Roll-out chain), and a god
// run has obstacles in the next 40 m at tick 600 (seed 1).
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/core/events';
import { EMPTY_FRAME, type InputFrame } from '../../../src/core/input';
import { sAt, speedAt } from '../../../src/core/tuning';
import { createSim } from '../../../src/sim';
import { TRICKS } from '../../../src/tricks';

const cfg = (seed: number) => ({ runId: `r${seed}`, seed, mode: 'normal' as const, firstRuns: false, bestDist: 0 });
const f = (p: Partial<InputFrame> = {}): InputFrame => ({ ...EMPTY_FRAME, ...p });

describe('sim on generated streets', () => {
  it('rolls on the closed-form schedule', () => {
    const sim = createSim(TRICKS);
    sim.reset({ ...cfg(1), god: true });
    for (let i = 0; i < 600; i++) sim.step(f());
    expect(sim.cur.tick).toBe(600);
    expect(sim.cur.p.s).toBeCloseTo(sAt(10), 9);
    expect(sim.cur.vel.s).toBe(speedAt(10));
  });

  it.each([1, 2, 3])('a straight run with no input slams on the Roll-out chain before tick 400 (seed %d)', (seed) => {
    const sim = createSim(TRICKS);
    sim.reset(cfg(seed));
    let crash: Extract<GameEvent, { t: 'crash' }> | null = null;
    for (let i = 0; i < 400 && !crash; i++) for (const e of sim.step(f())) if (e.t === 'crash') crash = e;
    expect(crash?.cause).toBe('slam');
    expect(crash!.kind).toBe('barrier_low');
    expect(crash!.tick).toBeLessThan(400);
    expect(sim.cur.mode).toBe('crashed');
    expect(sim.result().crash?.cause).toBe('slam');
    expect(sim.result().crash?.state).toBe('roll');
  });

  it('a god run logs crashes without applying them and has obstacles ahead at tick 600 (seed 1)', () => {
    const sim = createSim(TRICKS);
    sim.reset({ ...cfg(1), god: true });
    const crashes: GameEvent[] = [];
    for (let i = 0; i < 600; i++) for (const e of sim.step(f())) if (e.t === 'crash') crashes.push(e);
    expect(sim.cur.mode).not.toBe('crashed');
    expect(crashes.length).toBeGreaterThan(0);
    expect(crashes.every((e) => e.t === 'crash' && e.god)).toBe(true);
    const s = sim.cur.p.s;
    expect(sim.world.obstacles(s, s + 40).filter((o) => o.kind !== 'curb').length).toBeGreaterThan(0);
  });

  it('a tap ollies on the street and the run emits runStart first', () => {
    const sim = createSim(TRICKS);
    sim.reset(cfg(1));
    const ev = [...sim.step(f()), ...sim.step(f({ tap: true }))];
    expect(ev[0]!.t).toBe('runStart');
    expect(ev.map((e) => e.t)).toContain('ollie');
    expect(sim.cur.mode).toBe('air');
  });
});
