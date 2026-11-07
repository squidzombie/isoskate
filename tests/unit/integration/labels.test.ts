// G0 integration: the real recognizer's swipe labels (fast / fromRest / steer, M0-io) through the real frame binning
// into the real sim (M0-sim), as DESIGN §4.3 intends (steering-stroke rule):
//   - a steering thumb that weaves fast left and right in the air never fires a kickflip or heelflip;
//   - a hard ↑ flick from a thumb that is already steering pops an ollie on the ground;
//   - a steering thumb that parks, then flicks ← in the air, kickflips (fromRest);
//   - a hard ↓ from a steering thumb (still moving) pop shove-its in the air;
//   - a fresh second-finger flick ← in the air kickflips.
// G0 review amendments (DESIGN §4.2 owner sectors, §4.3 fresh steering strokes, §4.4 rule 2 ground pops):
//   - a fast fresh dodge that rises 32° stays a dodge (no ↗ pop); one that rises 40° pops a FS 180 and keeps its dodge;
//   - a steering thumb that flicks 34° up-right while dodging does not pop;
//   - a fresh medium-speed sideways stroke in the air is steering, not a heelflip; a hard fresh flick still flips.
// Pops use a second-finger tap, so the steering thumb stays down through the whole trace. These are the one-thumb
// grammar's traces (Settings "One thumb (classic)", `controls: 'one'`); the two-thumb layout is in twothumb.test.ts.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/core/events';
import { DT } from '../../../src/core/tuning';
import { InputPipeline } from '../../../src/input/pipeline';
import { createSim } from '../../../src/sim';
import { TRICKS } from '../../../src/tricks';
import { fixtureWorld, runCfg } from '../sim/fixtures';
import { H, ONE_THUMB, Trace, W } from '../input/trace';

const TICK_MS = DT * 1000;

/** A flat street, the real pipeline (390×844 screen, k = 1) and a run that has rolled for 0.5 s. Traces are given in
 *  ms relative to `base` (the clock when the rig is ready); `until(ms)` steps the sim to that time. `steerOnly` drops
 *  every swipe from the frames: the same trace as pure steering, the reference for "the stroke is only steering";
 *  `tapMs` adds a tap to the frame at that time (a plain ollie on the tick a swipe popped, as a reference). */
function rig(steerOnly = false, tapMs?: number) {
  const sim = createSim(TRICKS, fixtureWorld([]));
  sim.reset(runCfg({ startT: 2 }));
  const pipe = new InputPipeline(() => W, { screenW: W, screenH: H, k: 1, deadZoneBottomPx: 12, ...ONE_THUMB });
  let clock = 0;
  const events: GameEvent[] = [];
  const swipes: { dir: string; fast: boolean; fromRest: boolean; steer: boolean }[] = [];
  const until = (ms: number) => {
    while (clock < base + ms && sim.cur.mode !== 'crashed') {
      clock += TICK_MS;
      const f = pipe.frame(clock);
      if (f.swipe) swipes.push({ dir: f.swipe, fast: f.swipeFast, fromRest: f.swipeFromRest, steer: f.swipeSteer });
      if (steerOnly) { f.swipe = null; f.swipeDx = 0; }
      if (tapMs !== undefined && clock - base === tapMs) f.tap = true;
      for (const e of sim.step(f)) events.push({ ...e, tick: clock - base } as GameEvent);
    }
  };
  let base = 0;
  until(500);
  base = clock;
  const play = (...ts: Trace[]) => { for (const t of ts) pipe.schedule(t.samples, base); };
  /** A key press at `ms` (edges only; levels follow keyDown / keyUp immediately). */
  const key = (code: string, ms: number) => pipe.keyDown(code, base + ms);
  return { sim, events, swipes, until, play, key, pipe };
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

  it('a park of ~70 ms is enough (DESIGN §4.2: parked ≥ 60 ms); a 30 ms hesitation is still steering', () => {
    for (const [park, want] of [[70, ['kickflip']], [30, []]] as const) {
      const r = rig();
      const thumb = new Trace(1, 0, 195, 700).move(50, 0, 300, 16).rest(park).flick(1.0, 180, 70, 16);
      r.play(thumb, tapAt(240));
      r.until(1300);
      expect(r.swipes.at(-1), `park ${park}`).toMatchObject({ dir: 'l', fromRest: park >= 60, steer: true });
      expect(flips(r.events), `park ${park}`).toEqual(want);
    }
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

  /** A fresh dodge on the ground (no pop expected unless it rises far enough). Touch steering is direct (DESIGN §4.2):
   *  the skater moves while the thumb moves and stops soon after, so a quick 80 px stroke is a short dodge, and its
   *  steering is judged against the same trace as pure steering (`steerOnly`). */
  const dodge = (angle: number, speed = 0.83, ms = 96, x0 = 195, steerOnly = false) => {
    const r = rig(steerOnly);
    r.play(new Trace(1, 0, x0, 700).flick(speed, angle, ms).rest(150).up());
    r.until(1100);
    return r;
  };

  it('a fast fresh dodge rising 32° is steering (owner sectors: diagonals ±10°): all of its sideways motion counts', () => {
    const up32 = dodge(32), pure = dodge(32, 0.83, 96, 195, true);
    expect(ollies(up32.events)).toHaveLength(0);
    expect(up32.swipes[0]?.dir).toBe('r');
    expect(up32.sim.cur.p.x).toBeGreaterThan(0.3);
    expect(up32.sim.cur.p.x).toBeCloseTo(pure.sim.cur.p.x, 6);                  // exactly its steering, nothing cancelled
  });

  it('a fast fresh dodge rising 40° pops a FS 180 and keeps the dodge (ground pops cancel no steering)', () => {
    const up40 = dodge(40);
    const spin = up40.events.find((e) => e.t === 'spinStart');
    expect(spin).toMatchObject({ id: 'fs180' });
    // The reference: the same trace as pure steering, popped by a plain tap on the same tick. The pop takes the
    // skater into the air (lower lateral authority) either way; a spin pop that gave any of its stroke's steering back
    // would leave it short of the reference.
    const ref = rig(true, spin!.tick);
    ref.play(new Trace(1, 0, 195, 700).flick(0.83, 40, 96).rest(150).up());
    ref.until(1100);
    expect(ollies(ref.events)[0]?.tick).toBe(spin!.tick);
    expect(up40.sim.cur.p.x).toBeGreaterThan(0.2);
    expect(up40.sim.cur.targetX).toBeCloseTo(ref.sim.cur.targetX, 6);
    expect(up40.sim.cur.p.x).toBeCloseTo(ref.sim.cur.p.x, 6);
  });

  it('a medium-speed fresh dodge (0.5 px/ms) rising 36° does not pop', () => {
    const r = dodge(36, 0.5, 120), pure = dodge(36, 0.5, 120, 195, true);
    expect(ollies(r.events)).toHaveLength(0);
    expect(r.sim.cur.p.x).toBeGreaterThan(0.3);
    expect(r.sim.cur.p.x).toBeCloseTo(pure.sim.cur.p.x, 6);
  });

  it('a steering thumb that flicks 34° up-right while dodging does not pop', () => {
    const trace = () => new Trace(1, 0, 195, 700).move(20, 0, 300).flick(0.9, 34, 80).rest(200).up();
    const r = rig(), pure = rig(true);
    r.play(trace()); pure.play(trace());
    r.until(1100); pure.until(1100);
    expect(r.swipes[0]).toMatchObject({ dir: 'r', steer: true });
    expect(ollies(r.events)).toHaveLength(0);
    expect(r.sim.cur.p.x).toBeGreaterThan(0.8);
    expect(r.sim.cur.p.x).toBeCloseTo(pure.sim.cur.p.x, 6);
  });

  it('in the air, a fresh medium-speed sideways stroke is steering, a hard fresh flick is a flip', () => {
    const trace = () => new Trace(2, 300, 195, 650).flick(0.41, 0, 110).rest(150).up();
    const slow = rig(), pure = rig(true);
    slow.play(tapAt(0), trace()); pure.play(tapAt(0), trace());
    slow.until(1300); pure.until(1300);
    expect(slow.swipes.at(-1)).toMatchObject({ dir: 'r', fast: false, steer: false });
    expect(flips(slow.events)).toEqual([]);
    expect(slow.sim.cur.p.x).toBeGreaterThan(0.25);
    expect(slow.sim.cur.p.x).toBeCloseTo(pure.sim.cur.p.x, 6);
    const hard = rig();
    hard.play(tapAt(0), new Trace(2, 250, 250, 600).flick(1.2, 180, 50).up());
    hard.until(1300);
    expect(flips(hard.events)).toEqual(['kickflip']);
  });

  // ── W1a (GP) traces: the open G0 items, through the real recognizer and frames ──
  it('a 390 ms still press outside a combo pops an ollie on release (it felt like nothing at G0); 700 ms does nothing', () => {
    const mid = rig();
    mid.play(new Trace(3, 0, 200, 500).rest(390).up());
    mid.until(700);
    expect(ollies(mid.events)).toHaveLength(1);
    expect(mid.events.some((e) => e.t === 'manualStart')).toBe(false);
    const long = rig();
    long.play(new Trace(3, 0, 200, 500).rest(700).up());
    long.until(1000);
    expect(ollies(long.events)).toHaveLength(0);
  });

  it('a thumb that comes to rest right after a landing manuals only 0.30 s later, and a tap inside that 0.30 s just ollies', () => {
    const r = rig();
    r.play(tapAt(0));
    r.until(700);                                                    // landed at ≈ 0.6 s
    const landT = r.events.find((e) => e.t === 'land')!.tick;
    r.play(new Trace(4, landT + 30 - 0, 220, 520).rest(500).up());   // ms relative to base: rests 30 ms after landing
    r.until(landT + 600);
    const m = r.events.find((e) => e.t === 'manualStart');
    expect(m).toBeDefined();
    expect(m!.tick - (landT + 30)).toBeGreaterThanOrEqual(290);       // ≥ 0.30 s of stillness
  });

  it('a steering thumb\'s fast ← in the air is no flip and its steering stays; a parked thumb\'s ← kickflips and gives the flick back', () => {
    const steerTrace = () => new Trace(1, 0, 195, 700).move(-30, 0, 200).flick(1.0, 180, 40).rest(100).up();
    const steer = rig(), steerPure = rig(true);
    steer.play(steerTrace(), tapAt(140)); steerPure.play(steerTrace(), tapAt(140));
    steer.until(1200); steerPure.until(1200);
    expect(flips(steer.events)).toEqual([]);
    expect(steer.sim.cur.p.x).toBeLessThan(-0.5);
    expect(steer.sim.cur.p.x).toBeCloseTo(steerPure.sim.cur.p.x, 6);           // all of it steered
    const parkedTrace = () => new Trace(1, 0, 195, 700).move(-30, 0, 200).rest(150).flick(1.0, 180, 40).rest(100).up();
    const parked = rig(), parkedPure = rig(true);
    parked.play(parkedTrace(), tapAt(140)); parkedPure.play(parkedTrace(), tapAt(140));
    parked.until(1200); parkedPure.until(1200);
    expect(flips(parked.events)).toEqual(['kickflip']);
    // The flick's steering was given back (as much of it as was still ahead of the skater): the board ends further
    // right than the same trace steered as pure steering.
    expect(parked.sim.cur.p.x).toBeGreaterThan(parkedPure.sim.cur.p.x + 0.15);
  });

  it('keyboard preset A amend through the real mapper and frames: ↑ then → 60 ms later is a FS 180 ollie; ← then ↓ a Varial', () => {
    const a = rig();
    a.key('ArrowUp', 0); a.key('ArrowRight', 60);
    a.until(900);
    expect(ollies(a.events)).toHaveLength(1);
    expect(a.events.filter((e) => e.t === 'spinStart').map((e) => (e as { id: string }).id)).toEqual(['fs180']);
    const b = rig();
    b.key('Space', 0); b.key('ArrowLeft', 200); b.key('ArrowDown', 260);
    b.until(900);
    expect(flips(b.events)).toEqual(['kickflip']);
    expect(b.events.filter((e) => e.t === 'flipUpgrade').map((e) => (e as { to: string }).to)).toEqual(['varialKickflip']);
    const c = rig();                                                  // 100 ms apart: two separate swipes
    c.key('Space', 0); c.key('ArrowLeft', 200); c.key('ArrowDown', 300);
    c.until(900);
    expect(c.events.some((e) => e.t === 'flipUpgrade')).toBe(false);
  });

  it('keyboard preset B: O on the ground is a FS 180 ollie, N in the air a Varial Kickflip, Shift held manuals', () => {
    const r = rig();
    r.pipe.keys.preset = 'B';
    r.key('KeyO', 0); r.key('KeyN', 200);
    r.until(900);
    expect(r.events.filter((e) => e.t === 'spinStart').map((e) => (e as { id: string }).id)).toEqual(['fs180']);
    expect(flips(r.events)).toEqual(['varialKickflip']);
    r.pipe.keyDown('ShiftLeft', 0, false, false);
    r.until(1200);
    expect(r.events.some((e) => e.t === 'manualStart')).toBe(true);
  });
});

