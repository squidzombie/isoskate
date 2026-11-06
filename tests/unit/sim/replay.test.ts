// Determinism (TECH §6.7, ROADMAP G0): replaying a recorded 2-minute input gives identical per-tick hashes, and
// snapshot → restore → the same hash (also into a fresh Sim, also mid-air and mid-grind).
import { describe, expect, it } from 'vitest';
import type { Dir8 } from '../../../src/core/ids';
import { EMPTY_FRAME, type InputFrame } from '../../../src/core/input';
import { Sfc32 } from '../../../src/core/rng';
import type { RunConfig, Sim } from '../../../src/core/sim';
import { SIM_HZ } from '../../../src/core/tuning';
import { BOTS } from '../../../src/debug/bots';
import { createSim } from '../../../src/sim';
import { TRICKS } from '../../../src/tricks';
import { copySkater, initSkater } from '../../../src/sim/state';
import type { SkaterState } from '../../../src/core/sim';
import { box, fixtureWorld, frame } from './fixtures';

const TWO_MIN = 120 * SIM_HZ;
const cfg = (o: Partial<RunConfig> = {}): RunConfig => ({ runId: 'replay', seed: 42, mode: 'normal', firstRuns: false, bestDist: 0, ...o });

/** Record a 2-minute input: the SafeKey follower plus seeded taps, swipes, holds and steering noise. */
function record(c: RunConfig): InputFrame[] {
  const sim = createSim(TRICKS);
  sim.reset(c);
  const bot = BOTS.safe!({ seed: c.seed });
  const rng = new Sfc32(1234);
  const dirs: Dir8[] = ['l', 'r', 'd', 'u', 'ur', 'ul', 'dl', 'dr'];
  const frames: InputFrame[] = [];
  for (let i = 0; i < TWO_MIN; i++) {
    const fr: InputFrame = { ...EMPTY_FRAME, ...bot.frame(sim) };
    fr.steerDx += (rng.float() - 0.5) * 0.02;
    if (rng.chance(1 / 90)) fr.tap = true;
    if (rng.chance(1 / 70)) { fr.swipe = rng.pick(dirs); fr.swipeFast = rng.chance(0.7); fr.swipeDx = (rng.float() - 0.5) * 0.3; }
    fr.hold = fr.press = (i % 400) > 380;
    frames.push(fr);
    sim.step(fr);
  }
  return frames;
}
function replay(c: RunConfig, frames: readonly InputFrame[]): { hashes: number[]; events: number; sim: Sim } {
  const sim = createSim(TRICKS);
  sim.reset(c);
  const hashes: number[] = [];
  let events = 0;
  for (const fr of frames) { events += sim.step(fr).length; hashes.push(sim.hash()); }
  return { hashes, events, sim };
}

describe('prev ← cur copy (sim/state.ts copySkater)', () => {
  it('copies every SkaterState field by value, and reuses its sub-state objects without aliasing the source', () => {
    const src = initSkater(12.5) as SkaterState;
    let k = 1;
    for (const key of Object.keys(src) as (keyof SkaterState)[]) {
      const v = src[key] as unknown;
      if (typeof v === 'number') (src as unknown as Record<string, unknown>)[key] = v + k++ * 0.37;
      else if (typeof v === 'boolean') (src as unknown as Record<string, unknown>)[key] = !v;
    }
    src.mode = 'air'; src.surface = 'wood'; src.magnetEdge = 7; src.airTricks.push('ollie', 'kickflip');
    src.flip = { id: 'kickflip', t: 0.1, dur: 0.3, upgrades: 0, airLeftAtStart: 0.4, angle0: 0, t0: 0 };
    src.spin = { id: 'fs180', t: 0.05, dur: 0.3, upgrades: 0, startTick: 3, linked: true };
    src.pickWindow = { edgeId: 3, tCapture: 13.1 };
    const dst = initSkater(0) as SkaterState;
    copySkater(dst, src);
    expect(JSON.parse(JSON.stringify(dst))).toEqual(JSON.parse(JSON.stringify(src)));
    expect(dst.flip).not.toBe(src.flip);
    const flipObj = dst.flip;
    src.flip.t = 0.2;
    copySkater(dst, src);
    expect(dst.flip).toBe(flipObj);                       // reused, not reallocated
    expect(dst.flip!.t).toBe(0.2);
    src.flip = null;
    copySkater(dst, src);
    expect(dst.flip).toBeNull();
    expect(JSON.parse(JSON.stringify(dst))).toEqual(JSON.parse(JSON.stringify(src)));
  });
});

describe('replay determinism', () => {
  it('a recorded 2-minute input replays with identical per-tick hashes (god run, every trick path exercised)', () => {
    const c = cfg({ god: true });
    const frames = record(c);
    const a = replay(c, frames), b = replay(c, frames);
    expect(a.hashes.length).toBe(TWO_MIN);
    expect(a.hashes).toEqual(b.hashes);
    expect(a.events).toBe(b.events);
    expect(a.sim.result()).toEqual(b.sim.result());
    expect(new Set(a.hashes).size).toBeGreaterThan(TWO_MIN * 0.99);   // the hash really moves every tick
    expect(a.sim.score.total).toBeGreaterThan(1000);
  });

  it('a recorded 2-minute SafeKey-follower run replays identically and survives', () => {
    const c = cfg({ seed: 9 });
    const sim = createSim(TRICKS);
    sim.reset(c);
    const bot = BOTS.safe!({ seed: 9 });
    const frames: InputFrame[] = [];
    for (let i = 0; i < TWO_MIN; i++) { const fr = { ...EMPTY_FRAME, ...bot.frame(sim) }; frames.push(fr); sim.step(fr); }
    const a = replay(c, frames), b = replay(c, frames);
    expect(a.hashes).toEqual(b.hashes);
    expect(a.sim.cur.mode).not.toBe('crashed');
  });

  it('snapshot → step(n) → hash equals restore → step(n) → hash, also in a fresh Sim', () => {
    const c = cfg({ god: true });
    const frames = record(c);
    const sim = createSim(TRICKS);
    sim.reset(c);
    let checked = 0;
    for (let i = 0; i < 3000; i++) {
      sim.step(frames[i]!);
      if (i % 397 !== 0) continue;
      const snap = sim.snapshot();
      const before = sim.hash();
      const seq = frames.slice(i + 1, i + 121);
      for (const fr of seq) sim.step(fr);
      const h1 = sim.hash();
      sim.restore(snap);
      expect(sim.hash()).toBe(before);
      for (const fr of seq) sim.step(fr);
      expect(sim.hash()).toBe(h1);
      const fresh = createSim(TRICKS);
      fresh.restore(structuredClone(snap));
      for (const fr of seq) fresh.step(fr);
      expect(fresh.hash()).toBe(h1);
      sim.restore(snap);                           // continue the main run from the snapshot point
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('snapshot / restore mid-air and mid-grind (fixture ledge)', () => {
    const deps = fixtureWorld([box({ s: 10, x: 0, len: 25, wid: 0.6, hgt: 0.45, top: 'landable', edges: ['l', 'r'] })]);
    const sim = createSim(TRICKS, deps);
    sim.reset(cfg());
    const seen = new Set<string>();
    const input = (i: number) => frame(i === 60 ? { tap: true } : i === 200 ? { tap: true } : i === 215 ? { swipe: 'l', swipeFast: true } : {});
    for (let i = 0; i < 260; i++) {
      sim.step(input(i));
      const m = sim.cur.mode;
      if ((m === 'air' || m === 'grind') && !seen.has(m + (i > 150 ? 'late' : ''))) {
        seen.add(m + (i > 150 ? 'late' : ''));
        const snap = sim.snapshot();
        const run = () => { for (let j = 1; j <= 40; j++) sim.step(input(i + j)); return sim.hash(); };
        const h1 = run();
        sim.restore(snap);
        expect(run()).toBe(h1);
        sim.restore(snap);
      }
    }
    expect(seen.has('air')).toBe(true);
    expect(seen.has('grind')).toBe(true);
  });
});
