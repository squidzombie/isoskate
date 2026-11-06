// Magnet, capture, pick window and grind exits (TECH §6.6, frozen in M0). Fixture worlds, InputFrames built directly.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/core/events';
import type { InputFrame } from '../../../src/core/input';
import type { Sim, SimSnapshot } from '../../../src/core/sim';
import { DT, GRIND, HITBOX, MAGNET, V_POP, sAt } from '../../../src/core/tuning';
import type { Obstacle } from '../../../src/core/world';
import { createSim } from '../../../src/sim';
import { TRICKS } from '../../../src/tricks';
import { box, fixtureWorld, frame, rail, runCfg, slab } from './fixtures';

const ledge = (x: number) => box({ s: 10, x, len: 20, wid: 0.6, hgt: 0.45, top: 'landable', edges: ['l', 'r'] });
function make(obs: Obstacle[], x0: number, startT = 0): Sim {
  const sim = createSim(TRICKS, fixtureWorld(obs));
  sim.reset(runCfg({ startT }));
  const s = sim.snapshot() as unknown as { cur: { p: { x: number }; targetX: number }; prev: { p: { x: number }; targetX: number } };
  for (const st of [s.cur, s.prev]) { st.p.x = x0; st.targetX = x0; }
  sim.restore(s as unknown as SimSnapshot);
  return sim;
}
type Drive = (i: number, sim: Sim, ev: readonly GameEvent[]) => Partial<InputFrame>;
function run(sim: Sim, n: number, drive: Drive = () => ({})): GameEvent[] {
  const out: GameEvent[] = [];
  let last: readonly GameEvent[] = [];
  for (let i = 0; i < n && sim.cur.mode !== 'crashed'; i++) { last = sim.step(frame(drive(i, sim, last))).slice(); out.push(...last); }
  return out;
}
const first = <K extends GameEvent['t']>(ev: GameEvent[], t: K) => ev.find((e): e is Extract<GameEvent, { t: K }> => e.t === t);
const POP = 60;   // take-off frame: centre at s ≈ 7, 3 m before the edge start

describe('air magnet (moves targetX only)', () => {
  it('pulls targetX toward the edge at ≤ 3 m/s and captures a 50-50', () => {
    const sim = make([ledge(2)], 0.6);
    let maxRate = 0, prevT = sim.cur.targetX;
    const ev = run(sim, 200, (i, s) => {
      if (s.cur.mode === 'air') maxRate = Math.max(maxRate, Math.abs(s.cur.targetX - prevT) / DT);
      prevT = s.cur.targetX;
      return i === POP ? { tap: true } : {};
    });
    expect(maxRate).toBeGreaterThan(0.5);
    expect(maxRate).toBeLessThanOrEqual(MAGNET.rateMax + 1e-6);
    const g = first(ev, 'grindStart');
    expect(g?.id).toBe('fiftyFifty');
    expect(first(ev, 'crash')).toBeUndefined();
  });

  it('is cancelled by ≥ 15 px of drag away from the edge, but not by steering a consumed swipe removed', () => {
    const away = make([ledge(2)], 0.6);
    const ev = run(away, 200, (i) => (i === POP ? { tap: true } : i > POP && i <= POP + 8 ? { steerDx: -0.09 } : {}));
    expect(away.cur.magnetCancelled || !first(ev, 'grindStart')).toBe(true);
    expect(first(ev, 'grindStart')).toBeUndefined();

    const flick = make([ledge(2)], 0.6);
    const ev2 = run(flick, 200, (i) => (i === POP ? { tap: true }
      : i === POP + 8 ? { steerDx: -0.7, swipe: 'l', swipeDx: -0.7, swipeFast: true } : {}));
    expect(first(ev2, 'flipStart')?.id).toBe('kickflip');
    expect(first(ev2, 'grindStart')).toBeDefined();          // "Kickflip to Boardslide" never cancels itself
  });
});

describe('capture and the pick window', () => {
  it('curb-class (pickOnly) edges need a pick: no magnet, no capture without a swipe', () => {
    const pad = () => slab({ s: 10, len: 20, x0: 1.0, x1: 2.2, y: 0.15, edge: 'l' });
    const none = make([pad()], 0.6);
    const ev = run(none, 200, (i) => (i === POP ? { tap: true } : {}));
    expect(first(ev, 'grindStart')).toBeUndefined();
    expect(first(ev, 'land')).toBeDefined();

    const pick = make([pad()], 0.6);
    let opened = -1;
    const ev2 = run(pick, 200, (i, _s, last) => {
      if (opened < 0 && last.some((e) => e.t === 'pickWindow' && e.open)) opened = i;
      return i === POP ? { tap: true } : i === opened ? { swipe: 'd', swipeFast: true } : {};
    });
    expect(opened).toBeGreaterThan(POP);
    expect(first(ev2, 'grindStart')?.id).toBe('fiveO');
  });

  it.each([
    [['u'], 'nosegrind'], [['l'], 'boardslide'], [['l', 'l'], 'lipslide'], [['d'], 'fiveO'],
  ] as const)('every swipe in the window is a pick: %j → %s (no flip)', (dirs, id) => {
    const sim = make([ledge(0)], 0);
    let opened = -1;
    const ev = run(sim, 200, (i, _s, last) => {
      if (opened < 0 && last.some((e) => e.t === 'pickWindow' && e.open)) opened = i;
      if (i === POP) return { tap: true };
      const k = opened >= 0 ? i - opened : -1;
      return k >= 0 && k < dirs.length ? { swipe: dirs[k]!, swipeFast: true } : {};
    });
    expect(first(ev, 'flipStart')).toBeUndefined();
    expect(first(ev, 'grindStart')?.id).toBe(id);
    const open = first(ev, 'pickWindow')!, lock = first(ev, 'grindStart')!;
    expect((lock.tick - open.tick) * DT).toBeLessThanOrEqual(GRIND.pickBefore + DT + 1e-9);
  });

  it.each([[0, 7.0], [160, 10.5]])('a board coming down on the first 0.35 m of a rail grinds, never bails (startT %d, %d m/s)', (startT) => {
    // Sweep every take-off tick from "slams the rail's front" to "grinds": the boundary is slam → grind with no
    // badLanding in between, and some captures happen with the board centre still before the edge start.
    const sR = sAt(startT + 2.0);
    let grinds = 0;
    const out: string[] = [];
    for (let k = 70; k <= 100; k++) {
      const sim = make([rail({ s: sR, x: 0, len: 8, hgt: 0.4 })], 0, startT);
      const ev = run(sim, 200, (i) => (i === k ? { tap: true } : {}));
      const crash = first(ev, 'crash'), g = first(ev, 'grindStart');
      out.push(crash ? crash.cause : g ? 'grind' : 'none');
      if (g) grinds++;
    }
    expect(out).not.toContain('badLanding');
    expect(grinds).toBeGreaterThan(10);
    // Lock with the centre before the start: u = 0, the board rides on from the edge start.
    const sim = make([rail({ s: sR, x: 0, len: 8, hgt: 0.4 })], 0, startT);
    const k0 = out.indexOf('grind') + 70;
    let lockS = NaN;
    run(sim, 200, (i, s, last) => {
      if (Number.isNaN(lockS) && last.some((e) => e.t === 'grindStart')) lockS = s.cur.p.s;
      return i === k0 ? { tap: true } : {};
    });
    expect(lockS).toBeLessThan(sR);
    expect(lockS).toBeGreaterThanOrEqual(sR - HITBOX.l / 2 - 1e-9);
  });

  it('a buffered TAP is discarded at capture (no pop out right after the lock)', () => {
    const lockTick = (() => { const s = make([ledge(0)], 0); return first(run(s, 200, (i) => (i === POP ? { tap: true } : {})), 'grindStart')!.tick; })();
    const sim = make([ledge(0)], 0);
    let buffered = false;
    const ev = run(sim, lockTick + 30, (i, s) => {
      if (s.cur.jumpBuffer > 0) buffered = true;
      return i === POP || s.cur.tick + 1 === lockTick - 4 ? { tap: true } : {};
    });
    expect(buffered).toBe(true);
    expect(first(ev, 'grindStart')!.tick).toBe(lockTick);
    expect(sim.cur.jumpBuffer).toBe(0);
    expect(ev.filter((e) => e.t === 'ollie').length).toBe(1);
    expect(first(ev, 'grindEnd')).toBeUndefined();
    expect(sim.cur.mode).toBe('grind');
  });

  it('Perfect Lock: a pick within ±0.08 s of lock', () => {
    const lockTick = (() => { const s = make([ledge(0)], 0); return first(run(s, 200, (i) => (i === POP ? { tap: true } : {})), 'grindStart')!.tick; })();
    const at = (tick: number) => {
      const s = make([ledge(0)], 0);
      return first(run(s, 200, (i, sim) => (i === POP ? { tap: true } : sim.cur.tick + 1 === tick ? { swipe: 'l', swipeFast: true } : {})), 'grindStart')!;
    };
    expect(at(lockTick - 2).perfect).toBe(true);
    expect(at(lockTick - 12).perfect).toBe(false);
  });
});

describe('grind exits', () => {
  it('auto-hops at the edge end (vy = 2.5) and scores the grind per second', () => {
    const sim = make([ledge(0)], 0);
    let vyAfter = NaN;
    const ev = run(sim, 260, (i, s, last) => {
      if (Number.isNaN(vyAfter) && last.some((e) => e.t === 'grindEnd')) vyAfter = s.cur.vel.y;
      return i === POP ? { tap: true } : {};
    });
    const end = first(ev, 'grindEnd')!;
    expect(end.exit).toBe('end');
    expect(vyAfter).toBeCloseTo(GRIND.endHopVy, 9);
    expect(ev.some((e) => e.t === 'airborne' && e.reason === 'grindEnd')).toBe(true);
    const scored = ev.find((e) => e.t === 'trickScored' && e.id === 'fiftyFifty') as Extract<GameEvent, { t: 'trickScored' }>;
    expect(scored.pts).toBe(Math.round(100 + 150 * end.dur));
  });

  it('a TAP pops out with a full pop and the Pop-out bonus', () => {
    const sim = make([ledge(0)], 0);
    let tapAt = -1;
    const ev = run(sim, 200, (i, s) => {
      if (tapAt < 0 && s.cur.mode === 'grind' && s.cur.grind!.t > 0.3) tapAt = i;
      return i === POP || i === tapAt ? { tap: true } : {};
    });
    const end = first(ev, 'grindEnd')!;
    expect(end.exit).toBe('pop');
    expect(ev.some((e) => e.t === 'bonus' && e.id === 'popOut')).toBe(true);
    expect(ev.some((e) => e.t === 'ollie' && e.from === 'grind')).toBe(true);
    expect(V_POP).toBe(6.6);
  });
});
