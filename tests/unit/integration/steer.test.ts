// Direct touch steering (owner playtest @steer; DESIGN §4.2, §5.2, row 67): human-like thumb traces through the real
// recognizer and frame binning into the real sim. The skater moves while the thumb moves and stops promptly when the
// thumb stops or lifts: STEER_LEAD_MAX caps how far the target may lead the skater, a thumb that outruns the skater
// drives it at up to STEER_FAST.vMax, and the release brake (STEER_BRAKE) stops it when that thumb stops. Before
// @steer a quick 60–120 px slide threw the target 2.5–5 m ahead and the skater kept sliding 2.3–3.6 m (0.45–0.8 s)
// after the thumb had stopped. Keys (steerAxis) and absolute-target drivers (the bots) never meet the cap, the fast
// thumb or the brake.
import { describe, expect, it } from 'vitest';
import type { InputFrame, PointerSample } from '../../../src/core/input';
import type { Sim, SimSnapshot } from '../../../src/core/sim';
import { DT, STEER_BRAKE, STEER_FAST, STEER_LEAD_MAX, V_LAT_MAX } from '../../../src/core/tuning';
import type { Ctx } from '../../../src/sim/state';
import { applySteer, noteAssist } from '../../../src/sim/kinematics';
import { InputPipeline } from '../../../src/input/pipeline';
import { createSim } from '../../../src/sim';
import { TRICKS } from '../../../src/tricks';
import { fixtureWorld, frame, runCfg } from '../sim/fixtures';
import { H, Trace, W } from '../input/trace';

const TICK_MS = DT * 1000;
const M_PER_PX = 9 / (0.55 * W);
const T0 = 400;                                    // the slide starts here (ms); the thumb went down 120 ms earlier

/** One thumb: down, still for 120 ms, then a minimum-jerk slide of dx px over ms (samples every stepMs, ±jitter ms),
 *  then lifted, or resting with sensor jitter (±0.25 px every 16 ms) or a slow ±1 px drift (`drift`). */
function slide(dx: number, ms: number, o: { lift?: boolean; stepMs?: number; jitter?: number; drift?: boolean } = {}): PointerSample[] {
  const step = o.stepMs ?? 8, x0 = 200, y = 640;
  const s: PointerSample[] = [{ id: 1, tMs: T0 - 120, x: x0, y, phase: 'down' }];
  const n = Math.max(1, Math.round(ms / step));
  let x = x0, seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let i = 1; i <= n; i++) {
    const u = i / n, p = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
    x = x0 + dx * p;
    s.push({ id: 1, tMs: T0 + ms * u + (o.jitter ? rnd() * 2 * o.jitter : 0), x, y: y - Math.abs(dx) * 0.1 * p, phase: 'move' });
  }
  const yEnd = y - Math.abs(dx) * 0.1;
  if (o.lift) s.push({ id: 1, tMs: T0 + ms + 1, x, y: yEnd, phase: 'up' });
  else {
    for (let t = 16, j = 1; t < 1500; t += 16, j = -j) {
      s.push({ id: 1, tMs: T0 + ms + t, x: x + (o.drift ? Math.sin(t * 0.0082) : 0.25 * j), y: yEnd, phase: 'move' });
    }
  }
  return s;
}

/** Steps a flat-street run with the trace; `pop` taps an ollie 30 ms before the slide; `steerOnly` keeps only the
 *  steering (an air slide is then measured as steering, not as a flip). Returns x per tick and the stop tick. */
function ride(samples: PointerSample[], endMs: number, o: { pop?: boolean; ticks?: number } = {}) {
  const sim = createSim(TRICKS, fixtureWorld([]));
  sim.reset(runCfg({ startT: 0 }));
  const pipe = new InputPipeline(() => W, { screenW: W, screenH: H, k: 1 });
  pipe.schedule(samples);
  const xs: number[] = [], modes: string[] = [], vxs: number[] = [];
  let stop = -1, popped = false;
  for (let i = 0; i < (o.ticks ?? 150); i++) {
    const end = (i + 1) * TICK_MS;
    let f: InputFrame = pipe.frame(end);
    if (o.pop) {
      f = { ...frame(), steerDx: f.steerDx };
      if (!popped && end >= T0 - 30) { f.tap = true; popped = true; }
    }
    sim.step(f);
    xs.push(sim.cur.p.x); modes.push(sim.cur.mode); vxs.push(sim.cur.vel.x);
    if (stop < 0 && end >= endMs) stop = i;
  }
  return { xs, modes, vxs, stop, sim };
}

/** After the thumb stopped (or lifted): travel (from x at the stop to the final x, less what the resting thumb itself
 *  drifted since: that is steering), overshoot past the final x, seconds until x stays within 0.1 m of its final
 *  value, and the furthest travel while still airborne. */
function after(r: ReturnType<typeof ride>, samples: readonly PointerSample[] = []) {
  const moves = samples.filter((p) => p.phase === 'move');
  const slideEnd = moves.length ? [...moves].reverse().find((p) => p.tMs <= (r.stop + 1) * TICK_MS)!.x : 0;
  const drift = moves.length ? (moves.at(-1)!.x - slideEnd) * M_PER_PX : 0;
  const xStop = r.xs[r.stop]!, fin = r.xs.at(-1)!, dir = Math.sign(fin - r.xs[0]!) || 1;
  let max = -Infinity, last = r.stop, airMax = -Infinity;
  for (let i = r.stop; i < r.xs.length; i++) {
    max = Math.max(max, dir * r.xs[i]!);
    if (Math.abs(r.xs[i]! - fin) > 0.1) last = i;
    if (r.modes[i] === 'air') airMax = Math.max(airMax, dir * (r.xs[i]! - xStop));
  }
  return { disp: fin, travel: dir * (fin - drift - xStop), over: max - dir * fin, settle: (last - r.stop) * DT, airTravel: airMax };
}

const QUICK: [number, number][] = [[60, 120], [90, 180], [120, 250], [-120, 250]];

describe('touch steering stops when the thumb stops or lifts (DESIGN §4.2, owner playtest @steer)', () => {
  it.each(QUICK)('a quick %d px slide in %d ms: the skater stops within 0.35 m of where the thumb stopped, lifted or resting', (dx, ms) => {
    for (const o of [{ lift: true }, { lift: false }, { lift: false, drift: true }, { lift: true, stepMs: 1000 / 60, jitter: 3 }]) {
      const trace = slide(dx, ms, o);
      const a = after(ride(trace, T0 + ms), trace);
      const tag = JSON.stringify(o);
      expect(a.travel, tag).toBeLessThanOrEqual(0.35);
      expect(a.travel, tag).toBeGreaterThan(0.1);                      // a short, quick settle: not a dead stop either
      expect(a.over, tag).toBeLessThanOrEqual(o.lift ? 0.01 : 0.05);  // no overshoot (a resting thumb jitters or drifts)
      expect(a.settle, tag).toBeLessThanOrEqual(0.1);
      expect(Math.abs(a.disp), tag).toBeGreaterThan(0.4);              // the slide still dodged
    }
  });

  it.each(QUICK)('in the air, a quick %d px slide in %d ms stops within 0.5 m and does not float past', (dx, ms) => {
    const r = ride(slide(dx, ms, { lift: true }), T0 + ms, { pop: true });
    expect(r.modes[r.stop]).toBe('air');
    const a = after(r);
    expect(a.airTravel).toBeLessThanOrEqual(0.5);
    expect(a.travel).toBeLessThanOrEqual(0.5);
    expect(a.over).toBeLessThanOrEqual(0.01);
  });

  it('a flick is a short hop, not a throw (40 px in 50 ms, then lift: 1.7 m before @steer)', () => {
    const a = after(ride(slide(40, 50, { lift: true }), T0 + 50));
    expect(a.disp).toBeGreaterThan(0.15);
    expect(a.disp).toBeLessThan(0.5);
    expect(a.travel).toBeLessThanOrEqual(0.35);
  });

  it.each([[500], [600], [700], [1000]])('a 2 m dodge drawn as a human-speed drag (48 px in %d ms) ends at about 2 m and settles within 0.1 m in ≤ 0.5 s', (ms) => {
    for (const lift of [true, false]) {
      const a = after(ride(slide(48, ms, { lift }), T0 + ms, { ticks: 160 }));
      expect(Math.abs(a.disp - 48 * M_PER_PX), `${ms} ms lift ${lift}`).toBeLessThanOrEqual(0.15);
      expect(a.settle).toBeLessThanOrEqual(0.5);
      expect(a.settle).toBeLessThanOrEqual(0.05);                     // measured: settled as the drag ends
    }
  });

  // Measured (fix pass): before the fast thumb these went 0.45 / 0.72 / 1.0 m (the plain 5.5 m/s cap), and before
  // @steer 2.5 / 3.8 / 4.3 m with a 2.3–3.6 m slide after the lift.
  it.each([[60, 120, 0.55], [90, 180, 0.85], [120, 250, 1.2]])('a quick %d px slide in %d ms is a dodge of at least %d m (the thumb outran the skater: it ran faster than V_LAT_MAX)', (dx, ms, min) => {
    const r = ride(slide(dx, ms, { lift: true }), T0 + ms);
    const a = after(r);
    expect(a.disp).toBeGreaterThan(min);
    expect(a.travel).toBeLessThanOrEqual(0.35);
    const vMax = Math.max(...r.vxs.map(Math.abs));
    expect(vMax).toBeGreaterThan(V_LAT_MAX + 0.5);
    expect(vMax).toBeLessThanOrEqual(STEER_FAST.vMax + 1e-9);
  });

  it('a slow input rate (one sample every 40–67 ms, a busy phone without coalesced events) is a smooth drag, not a stutter', () => {
    // 200 px in 600 ms at constant speed, then lift; the stop window grows with the gaps between samples.
    const drag = (stepMs: number) => {
      const t = new Trace(1, T0 - 120, 200, 640).rest(120).move(200, 0, 600, stepMs).up();
      const r = ride(t.samples, T0 + 600);
      return { disp: r.xs.at(-1)! - r.xs[0]!, travel: after(r).travel };
    };
    const ref = drag(8);
    for (const stepMs of [40, 50, 1000 / 15]) {
      const d = drag(stepMs);
      expect(d.disp, `${stepMs} ms`).toBeGreaterThan(0.9 * ref.disp);
      expect(d.travel, `${stepMs} ms`).toBeLessThanOrEqual(0.6);
    }
    expect(ref.travel).toBeLessThanOrEqual(0.35);
  });

  it('a 2 m dodge with a quick thumb (0.5 px/ms) kept moving until the skater gets there completes in ≤ 0.5 s', () => {
    // Closed loop: a thumb that slides at 0.5 px/ms (21 m/s, far faster than the skater) while the skater is more
    // than 0.35 m short of 2 m, then stops dead and rests (the worst case: no deceleration at all); one sample per
    // 8 ms, fed as it happens.
    const sim = createSim(TRICKS, fixtureWorld([]));
    sim.reset(runCfg({ startT: 0 }));
    const pipe = new InputPipeline(() => W, { screenW: W, screenH: H, k: 1 });
    let thumbX = 200, tSample = T0 - 120, moving = true, stopMs = 0;
    pipe.schedule([{ id: 1, tMs: tSample, x: thumbX, y: 640, phase: 'down' }]);
    tSample = T0;
    const xs: number[] = [];
    for (let i = 0; i < 120; i++) {
      const end = (i + 1) * TICK_MS;
      if (moving && end >= T0 && sim.cur.p.x >= 2 - 0.35) { moving = false; stopMs = end; }
      const batch: PointerSample[] = [];
      for (; tSample <= end; tSample += 8) {
        if (tSample < T0) continue;
        if (moving) thumbX += 0.5 * 8;
        batch.push({ id: 1, tMs: tSample, x: thumbX, y: 640, phase: 'move' });
      }
      pipe.schedule(batch);
      sim.step(pipe.frame(end));
      xs.push(sim.cur.p.x);
    }
    let last = -1;
    for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i]! - 2) > 0.1) last = i;
    const done = (last + 1) * DT - T0 / 1000;
    expect(stopMs).toBeGreaterThan(T0);
    expect(Math.abs(xs.at(-1)! - 2)).toBeLessThanOrEqual(0.1);
    expect(done).toBeLessThanOrEqual(0.5);                            // the line-change capability is unchanged
  });
});

describe('what the cap and the brake never touch', () => {
  const mk = (): Sim => { const sim = createSim(TRICKS, fixtureWorld([])); sim.reset(runCfg({ startT: 0 })); return sim; };

  it('keys: steerAxis moves targetX at V_LAT_MAX however far it leads, and releasing the key holds that line', () => {
    const sim = mk();
    const n = 24;                                                      // 0.4 s held
    let maxLead = 0;
    for (let i = 0; i < 90; i++) {
      const t0 = sim.cur.targetX;
      sim.step(frame({ steerAxis: i < n ? 1 : 0 }));
      if (i < n) expect(sim.cur.targetX - t0).toBeCloseTo(V_LAT_MAX * DT, 12);
      maxLead = Math.max(maxLead, sim.cur.targetX - sim.cur.p.x);
    }
    expect(maxLead).toBeGreaterThan(STEER_BRAKE.restLead + 0.15);        // a brake would have cut that short
    expect(Math.abs(sim.cur.vel.x)).toBeLessThanOrEqual(V_LAT_MAX);
    expect(sim.cur.targetX).toBeCloseTo(n * V_LAT_MAX * DT, 9);
    expect(sim.cur.p.x).toBeCloseTo(n * V_LAT_MAX * DT, 2);              // no brake: it went all the way
  });

  it('an absolute-target driver (the bots: targetX on a plan moving at ≤ 0.85·V_LAT_MAX) is followed exactly', () => {
    const sim = mk();
    let desired = 0;
    for (let i = 0; i < 150; i++) {
      // A 3 m move at the safe bot's rate, a hold, and back 2 m: its corners are abrupt "stops" of the target.
      const goal = i < 90 ? 3 : 1;
      desired += Math.max(-0.85 * V_LAT_MAX * DT, Math.min(0.85 * V_LAT_MAX * DT, goal - desired));
      sim.step(frame({ steerDx: desired - sim.cur.targetX }));
      expect(sim.cur.targetX).toBeCloseTo(desired, 12);
      expect(Math.abs(sim.cur.targetX - sim.cur.p.x)).toBeLessThan(STEER_LEAD_MAX);
    }
    expect(sim.cur.p.x).toBeCloseTo(1, 1);
  });

  it('a bot-style target through a hop (the air lags it further: up to 0.66 m ahead in the thumb bot\'s gate runs) is followed exactly', () => {
    // An ollie, then a 3 m move at the thumb bot's rate (0.85·V_LAT_MAX) that starts in the air, where A_LAT_AIR lets
    // the target get further ahead than on the ground; it never reaches the cap, so nothing caps, speeds up or brakes it.
    const sim = mk();
    let desired = 0, maxLead = 0, maxV = 0;
    for (let i = 0; i < 150; i++) {
      const goal = i < 4 ? 0 : i < 100 ? 3 : 2.4;
      desired += Math.max(-0.85 * V_LAT_MAX * DT, Math.min(0.85 * V_LAT_MAX * DT, goal - desired));
      sim.step(frame({ steerDx: desired - sim.cur.targetX, tap: i === 2 }));
      expect(sim.cur.targetX).toBeCloseTo(desired, 12);
      maxLead = Math.max(maxLead, Math.abs(sim.cur.targetX - sim.cur.p.x));
      maxV = Math.max(maxV, Math.abs(sim.cur.vel.x));
      if (i === 30) expect(sim.cur.mode).toBe('air');
    }
    expect(maxLead).toBeGreaterThan(0.6);                              // a 0.6 m arming lead would have braked it
    expect(maxLead).toBeLessThan(STEER_LEAD_MAX);
    expect(maxV).toBeLessThanOrEqual(V_LAT_MAX);
    expect(sim.cur.p.x).toBeCloseTo(2.4, 1);
  });

  it('the release brake keeps what ground align or the magnet added since it armed', () => {
    const sim = mk();
    for (let i = 0; i < 8; i++) sim.step(frame({ steerDx: 0.3 }));    // a thumb far faster than the skater: armed
    const k = sim as unknown as Ctx, c = k.st.cur;
    expect(k.st.steer.armed).toBe(1);
    c.targetX += 0.12; noteAssist(k, 0.12);                             // what step 4's assist would do
    applySteer(k, frame()); applySteer(k, frame());                     // the thumb stops: the brake fires
    expect(k.st.steer.brake).toBeGreaterThan(0);
    expect(c.targetX - c.p.x).toBeCloseTo(STEER_BRAKE.restLead + 0.12, 9);
  });

  it('a drag never pushes the target more than STEER_LEAD_MAX ahead, and a snapshot taken mid-brake replays exactly', () => {
    const sim = mk();
    const drive = (i: number) => frame({ steerDx: i < 20 ? 0.3 : 0 });   // 18 m/s for 0.33 s, then a dead stop
    let snap: SimSnapshot | null = null;
    const xs: number[] = [];
    for (let i = 0; i < 60; i++) {
      sim.step(drive(i));
      if (i < 20) expect(sim.cur.targetX - sim.cur.p.x).toBeLessThanOrEqual(STEER_LEAD_MAX + 1e-9);
      if (i === 22) snap = sim.snapshot();
      if (i > 22) xs.push(sim.cur.p.x);
    }
    sim.restore(snap!);
    for (let i = 23; i < 60; i++) { sim.step(drive(i)); expect(sim.cur.p.x).toBe(xs[i - 23]); }
  });
});
