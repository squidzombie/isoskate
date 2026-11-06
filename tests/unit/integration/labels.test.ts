// G0 integration: the real recognizer's swipe labels (fast / fromRest / steer, M0-io) through the real frame binning
// into the real sim (M0-sim), as DESIGN §4.3 intends (steering-stroke rule):
//   - a steering thumb that weaves fast left and right in the air never fires a kickflip or heelflip;
//   - a hard ↑ flick from a thumb that is already steering pops an ollie on the ground;
//   - a steering thumb that parks, then flicks ← in the air, kickflips (fromRest);
//   - a hard ↓ from a steering thumb (still moving) pop shove-its in the air;
//   - a fresh second-finger flick ← in the air kickflips.
// Pops use a second-finger tap, so the steering thumb stays down through the whole trace.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/core/events';
import { DT } from '../../../src/core/tuning';
import { InputPipeline } from '../../../src/input/pipeline';
import { createSim } from '../../../src/sim';
import { TRICKS } from '../../../src/tricks';
import { fixtureWorld, runCfg } from '../sim/fixtures';
import { H, Trace, W } from '../input/trace';

const TICK_MS = DT * 1000;

/** A flat street, the real pipeline (390×844 screen, k = 1) and a run that has rolled for 0.5 s. Traces are given in
 *  ms relative to `base` (the clock when the rig is ready); `until(ms)` steps the sim to that time. */
function rig() {
  const sim = createSim(TRICKS, fixtureWorld([]));
  sim.reset(runCfg({ startT: 2 }));
  const pipe = new InputPipeline(() => W, { screenW: W, screenH: H, k: 1, deadZoneBottomPx: 12 });
  let clock = 0;
  const events: GameEvent[] = [];
  const swipes: { dir: string; fast: boolean; fromRest: boolean; steer: boolean }[] = [];
  const until = (ms: number) => {
    while (clock < base + ms && sim.cur.mode !== 'crashed') {
      clock += TICK_MS;
      const f = pipe.frame(clock);
      if (f.swipe) swipes.push({ dir: f.swipe, fast: f.swipeFast, fromRest: f.swipeFromRest, steer: f.swipeSteer });
      for (const e of sim.step(f)) events.push({ ...e, tick: clock - base } as GameEvent);
    }
  };
  let base = 0;
  until(500);
  base = clock;
  const play = (...ts: Trace[]) => { for (const t of ts) pipe.schedule(t.samples, base); };
  return { sim, events, swipes, until, play };
}
const flips = (ev: readonly GameEvent[]) => ev.filter((e): e is Extract<GameEvent, { t: 'flipStart' }> => e.t === 'flipStart').map((e) => e.id);
const ollies = (ev: readonly GameEvent[]) => ev.filter((e) => e.t === 'ollie');
/** A second-finger tap at `ms` (released 60 ms later: the ollie fires on the lift). */
const tapAt = (ms: number) => new Trace(9, ms, 220, 320).rest(60).up();

describe('recognizer labels → sim (DESIGN §4.3 steering-stroke rule)', () => {
  it('a steering thumb weaving fast left and right in the air never flips', () => {
    const r = rig();
    // Steering thumb: drags from 0 ms, keeps moving (never parked), then weaves hard while airborne.
    const thumb = new Trace(1, 0, 195, 700).move(-40, 0, 200).move(60, 0, 240);            // 0.2–0.25 px/ms
    thumb.flick(1.2, 180, 90).flick(1.2, 0, 90).flick(1.2, 180, 90).move(-10, 0, 60);     // 440–770 ms: fast, steer
    r.play(thumb, tapAt(320));
    r.until(420);
    expect(r.sim.cur.mode).toBe('air');
    r.until(1300);
    expect(ollies(r.events)).toHaveLength(1);
    // The weave really produced fast sideways swipes labelled steer (and none from rest) ...
    expect(r.swipes.filter((w) => (w.dir === 'l' || w.dir === 'r') && w.fast && w.steer && !w.fromRest).length).toBeGreaterThan(0);
    // ... and the sim kept them as steering.
    expect(flips(r.events)).toEqual([]);
    expect(r.sim.cur.mode).toBe('roll');
  });

  it('a hard ↑ flick from a thumb that is already steering pops an ollie', () => {
    const r = rig();
    const thumb = new Trace(1, 0, 195, 700).move(-60, 0, 240).flick(1.1, 90, 70).up();     // owner, 240 ms old: steer
    r.play(thumb);
    r.until(380);
    expect(r.swipes).toEqual([{ dir: 'u', fast: true, fromRest: false, steer: true }]);
    expect(ollies(r.events)).toHaveLength(1);
    expect(r.sim.cur.mode).toBe('air');
  });

  it('a steering thumb that parks, then flicks ← in the air, kickflips (fromRest)', () => {
    const r = rig();
    const thumb = new Trace(1, 0, 195, 700).move(50, 0, 220).rest(200).flick(1.0, 180, 70);   // parked 220–420 ms
    r.play(thumb, tapAt(240));
    r.until(1300);
    expect(r.swipes.at(-1)).toMatchObject({ dir: 'l', fromRest: true, steer: true });
    expect(flips(r.events)).toEqual(['kickflip']);
  });

  it('a hard ↓ from a steering thumb that is still moving pop shove-its', () => {
    const r = rig();
    const thumb = new Trace(1, 0, 195, 600).move(-60, 0, 240).move(-30, 0, 120).flick(1.2, 270, 70);
    r.play(thumb, tapAt(240));
    r.until(1300);
    expect(r.swipes.at(-1)).toMatchObject({ dir: 'd', fast: true, fromRest: false, steer: true });
    expect(flips(r.events)).toEqual(['popShuvit']);
  });

  it('a fresh second-finger flick ← in the air kickflips', () => {
    const r = rig();
    r.play(tapAt(0), new Trace(5, 400, 120, 500).flick(0.9, 180, 70).up());
    r.until(1300);
    expect(r.swipes.at(-1)).toMatchObject({ dir: 'l', steer: false });
    expect(flips(r.events)).toEqual(['kickflip']);
  });
});
