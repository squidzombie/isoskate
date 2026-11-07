// Two-thumb controls through the real recognizer, frame binning and sim (owner playtest; DESIGN §4.1–4.4): the left
// thumb only steers, the right thumb only tricks, both at once work. The new phone player's checks: a fast dodge on
// the left never flips or pops, a flick on the right never yanks the skater sideways, steering while flipping keeps
// every pixel of the steering. The skilled player's: doubles, spins, grabs and manuals stay where they were.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/core/events';
import { DT } from '../../../src/core/tuning';
import { steerMetresPerPx } from '../../../src/input/frames';
import { InputPipeline } from '../../../src/input/pipeline';
import { createSim } from '../../../src/sim';
import { TRICKS } from '../../../src/tricks';
import { fixtureWorld, runCfg } from '../sim/fixtures';
import { H, Trace, W } from '../input/trace';

const TICK_MS = DT * 1000;
const LX = W * 0.25, RX = W * 0.75, Y = H * 0.75;
const M = steerMetresPerPx(W);

/** A flat street, the real pipeline with the default two-thumb layout (390×844, k = 1), rolled for 0.5 s. */
function rig(cfg: { swapSides?: boolean; controls?: 'one' | 'two' } = {}) {
  const sim = createSim(TRICKS, fixtureWorld([]));
  sim.reset(runCfg({ startT: 2 }));
  const pipe = new InputPipeline(() => W, { screenW: W, screenH: H, k: 1, deadZoneBottomPx: 12, ...cfg });
  let clock = 0, base = 0;
  const events: GameEvent[] = [];
  const until = (ms: number) => {
    while (clock < base + ms && sim.cur.mode !== 'crashed') {
      clock += TICK_MS;
      for (const e of sim.step(pipe.frame(clock))) events.push({ ...e, tick: clock - base } as GameEvent);
    }
  };
  until(500);
  base = clock;
  const play = (...ts: Trace[]) => { for (const t of ts) pipe.schedule(t.samples, base); };
  return { sim, events, until, play };
}
const ids = (ev: readonly GameEvent[], t: GameEvent['t']) => ev.filter((e) => e.t === t).map((e) => (e as { id?: string }).id ?? e.t);
const ollies = (ev: readonly GameEvent[]) => ev.filter((e) => e.t === 'ollie');
/** A right-thumb tap at `ms` (released 60 ms later: the ollie fires on the lift). */
const tapR = (ms: number, id = 9) => new Trace(id, ms, RX, Y - 40).rest(60).up();

describe('two thumbs → sim', () => {
  it('a hard left dodge in the air, in any direction, never flips; all of it steers', () => {
    for (const a of [180, 0, 160, 20, 200, 340, 90, 270]) {
      const r = rig();
      const dodge = new Trace(1, 200, LX, Y).flick(1.4, a, 70).rest(200).up();          // fresh, fast, mid-air
      r.play(tapR(0), dodge);
      r.until(1300);
      expect(ollies(r.events), `${a}°`).toHaveLength(1);
      expect(ids(r.events, 'flipStart'), `${a}°`).toEqual([]);
      expect(r.sim.cur.targetX, `${a}°`).toBeCloseTo((dodge.x - LX) * M, 6);
    }
    // Control: the one-thumb grammar reads that same fresh fast stroke as a kickflip (and gives its dx back).
    const one = rig({ controls: 'one' });
    one.play(tapR(0), new Trace(1, 200, LX, Y).flick(1.4, 180, 70).rest(200).up());
    one.until(1300);
    expect(ids(one.events, 'flipStart')).toEqual(['kickflip']);
  });

  it('a hard left dodge on the ground rising 40° (or straight up) never pops; a resting left thumb never manuals', () => {
    for (const a of [40, 140, 90]) {
      const r = rig();
      r.play(new Trace(1, 0, LX, Y).flick(1.0, a, 90).rest(150).up());
      r.until(1100);
      expect(ollies(r.events), `${a}°`).toEqual([]);
      expect(ids(r.events, 'spinStart'), `${a}°`).toEqual([]);
    }
    const rest = rig();
    rest.play(tapR(0), new Trace(1, 650, LX, Y).rest(900).up());                       // rests from just after landing
    rest.until(1800);
    expect(ids(rest.events, 'manualStart')).toEqual([]);
  });

  it('a right flick ← in the air kickflips and moves nothing sideways', () => {
    const r = rig();
    r.play(tapR(0), new Trace(2, 200, RX, Y).flick(1.2, 180, 60).up());
    r.until(1300);
    expect(ids(r.events, 'flipStart')).toEqual(['kickflip']);
    expect(r.sim.cur.targetX).toBe(0);
  });

  it('a slow right flick (0.45 px/ms, which the one-thumb grammar would read as steering) still kickflips', () => {
    const r = rig();
    r.play(tapR(0), new Trace(2, 180, RX, Y).move(-20, 0, 200).flick(0.45, 180, 90).up());
    r.until(1300);
    expect(ids(r.events, 'flipStart')).toEqual(['kickflip']);
    expect(r.sim.cur.targetX).toBe(0);
  });

  it('both at once: a left drag through the air and a right flick give the flip AND every pixel of the steering', () => {
    const r = rig();
    const left = new Trace(1, 0, LX, Y).move(-30, 0, 150).move(90, 0, 350).rest(100).up();
    r.play(left, tapR(60), new Trace(2, 260, RX, Y).flick(1.3, 180, 60).up());
    r.until(1300);
    expect(ids(r.events, 'flipStart')).toEqual(['kickflip']);
    expect(r.sim.cur.targetX).toBeCloseTo(60 * M, 6);
  });

  it('a right flick-flick in the air is a double; ↗ on the ground pops a FS 180 while the left keeps steering', () => {
    const dbl = rig();
    dbl.play(tapR(0), new Trace(2, 180, RX, Y).flick(1.3, 180, 50).rest(40).flick(1.3, 180, 50).up());
    dbl.until(1300);
    expect(ids(dbl.events, 'flipStart')).toEqual(['kickflip']);
    expect(dbl.events.filter((e) => e.t === 'flipUpgrade').map((e) => (e as { to: string }).to)).toEqual(['doubleKickflip']);
    const spin = rig();
    const left = new Trace(1, 0, LX, Y).move(50, 0, 400).up();
    spin.play(left, new Trace(2, 100, RX - 60, Y).flick(1.0, 45, 60).up());
    spin.until(900);
    expect(ids(spin.events, 'spinStart')).toEqual(['fs180']);
    expect(spin.sim.cur.targetX).toBeCloseTo(50 * M, 6);
  });

  it('a right HOLD in the air grabs; a left one never does', () => {
    const right = rig();
    right.play(tapR(0), new Trace(2, 120, RX, Y).rest(320).up());
    right.until(1300);
    expect(ids(right.events, 'grabStart')).toEqual(['indy']);
    const left = rig();
    left.play(tapR(0), new Trace(1, 120, LX, Y).rest(320).up());
    left.until(1300);
    expect(ids(left.events, 'grabStart')).toEqual([]);
  });

  it('a right thumb resting after a landing manuals (after 0.30 s) while the left steers, as the second finger did', () => {
    const r = rig();
    r.play(tapR(0));
    r.until(700);
    const landT = r.events.find((e) => e.t === 'land')!.tick;
    r.play(new Trace(4, landT + 30, RX, Y).rest(500).up(), new Trace(1, landT, LX, Y).move(40, 0, 300).up());
    r.until(landT + 700);
    expect(ids(r.events, 'manualStart').length).toBe(1);
  });

  it('swap sides: the right thumb steers and the left tricks', () => {
    const r = rig({ swapSides: true });
    const right = new Trace(1, 200, RX, Y).flick(1.4, 180, 70).rest(100).up();
    r.play(new Trace(9, 0, LX, Y).rest(60).up(), right, new Trace(2, 250, LX, Y - 30).flick(1.2, 0, 60).up());
    r.until(1300);
    expect(ollies(r.events)).toHaveLength(1);
    expect(ids(r.events, 'flipStart')).toEqual(['heelflip']);
    expect(r.sim.cur.targetX).toBeCloseTo((right.x - RX) * M, 6);
  });
});
