// Two-thumb controls (owner playtest; DESIGN §4.1–4.2): the screen splits at splitFrac (0.5) of the width. A touch that
// goes down in the steering zone (left; right with swapSides) only steers, one that goes down in the trick zone only
// taps / swipes / holds and never steers, each for its whole life. One thumb (classic), mouse and pen keep the
// one-thumb grammar (recognizer.test.ts).
import { describe, expect, it } from 'vitest';
import type { Gesture, PointerSample } from '../../../src/core/input';
import { InputPipeline } from '../../../src/input/pipeline';
import { DEFAULT_RECOGNIZER, roleOf } from '../../../src/input/recognizer';
import { H, kinds, makeRec, makeRec2, run, steerSum, swipes, Trace, W } from './trace';

const LX = W * 0.25, RX = W * 0.75, Y = H * 0.75;
const tricky = (g: readonly Gesture[]) => g.filter((x) => x.k !== 'steer');

describe('zones', () => {
  it('two thumbs is the default; the split is the vertical midline (x on the line is the right)', () => {
    expect(DEFAULT_RECOGNIZER.controls).toBe('two');
    expect(DEFAULT_RECOGNIZER.swapSides).toBe(false);
    expect(DEFAULT_RECOGNIZER.splitFrac).toBe(0.5);
    const cfg = { ...DEFAULT_RECOGNIZER, screenW: W };
    expect(roleOf(0, 'touch', cfg)).toBe('steer');
    expect(roleOf(W / 2 - 0.01, undefined, cfg)).toBe('steer');
    expect(roleOf(W / 2, undefined, cfg)).toBe('trick');
    expect(roleOf(W, 'touch', cfg)).toBe('trick');
    expect(roleOf(100, 'touch', { ...cfg, swapSides: true })).toBe('trick');
    expect(roleOf(300, 'touch', { ...cfg, swapSides: true })).toBe('steer');
    expect(roleOf(150, 'touch', { ...cfg, splitFrac: 0.35 })).toBe('trick');
    expect(roleOf(100, 'touch', { ...cfg, controls: 'one' })).toBe('both');
    expect(roleOf(100, 'mouse', cfg)).toBe('both');
    expect(roleOf(300, 'pen', cfg)).toBe('both');
    expect(roleOf(240, 'touch', { ...cfg, screenW: 0, k: 1.3 })).toBe('steer');   // unknown width: 390·k
  });
});

describe('left (steering) thumb: steers, never tricks', () => {
  it('a still touch of any length is nothing: no tap, no long tap, no hold, no press', () => {
    for (const ms of [60, 120, 300, 349, 450, 600, 900, 2000]) {
      const g = run(makeRec2(), new Trace(1, 0, LX, Y).rest(ms).up().samples);
      expect(g, `${ms} ms`).toEqual([]);
    }
    // ... with ±2 px tremor too, and a cancel
    expect(run(makeRec2(), new Trace(1, 0, LX, Y).rest(500, 2).up().samples).filter((x) => x.k !== 'steer')).toEqual([]);
    expect(run(makeRec2(), new Trace(1, 0, LX, Y).rest(250).cancel().samples)).toEqual([]);
  });

  it('a sloppy jab (14 px in 60 ms) steers its drift and is no tap', () => {
    const g = run(makeRec2(), new Trace(1, 0, LX, Y).move(11, -8, 60).up().samples);
    expect(tricky(g)).toEqual([]);
    expect(steerSum(g)).toBeCloseTo(11, 9);
  });

  it('a hard flick in any of the 8 directions (fresh, from rest, or mid-steer) is steering only, at gain 1.0', () => {
    for (let a = 0; a < 360; a += 45) {
      for (const pre of ['fresh', 'parked', 'steering'] as const) {
        const tr = new Trace(1, 0, LX, Y);
        if (pre === 'parked') tr.move(20, 0, 120).rest(150);
        if (pre === 'steering') tr.move(-30, 0, 200);
        tr.flick(1.4, a, 70).rest(30).flick(1.4, a, 60).up();          // flick-flick: a double in the trick zone
        const g = run(makeRec2(), tr.samples);
        expect(tricky(g), `${a}° ${pre}`).toEqual([]);
        expect(steerSum(g), `${a}° ${pre}`).toBeCloseTo(tr.x - LX, 6);
      }
    }
  });

  it('a lift-off flick is no swipe; lifting holds the line (no steer after the up)', () => {
    const g = run(makeRec2(), new Trace(1, 0, LX, Y).move(40, 0, 300).flick(0.6, 180, 50).up().samples);
    expect(swipes(g)).toEqual([]);
    expect(g.at(-1)!.k).toBe('steer');
    expect(steerSum(g)).toBeCloseTo(10, 6);
  });

  it('steering starts at SLOP and counts from touch-down (9 px is nothing, 11 px steers all 11)', () => {
    expect(run(makeRec2(), new Trace(1, 0, LX, Y).move(9, 0, 60).rest(100).up().samples)).toEqual([]);
    expect(steerSum(run(makeRec2(), new Trace(1, 0, LX, Y).move(11, 0, 60).up().samples))).toBeCloseTo(11, 9);
  });

  it('sliding across the midline keeps the role: still steering, still no tricks', () => {
    const g = run(makeRec2(), new Trace(1, 0, W * 0.4, Y).move(150, 0, 200).rest(300).flick(1.3, 90, 60).up().samples);
    expect(tricky(g)).toEqual([]);
    expect(steerSum(g)).toBeCloseTo(150 + 1.3 * 60 * Math.cos(Math.PI / 2), 6);
  });

  it('several left touches: the first that drags owns steering; the others never tap, and steering passes to the next one that becomes a DRAG', () => {
    const owner = new Trace(1, 0, LX, Y).move(30, 0, 150).rest(200).up();               // lifts at 350 ms
    const other = new Trace(2, 100, LX - 40, Y - 60).move(-20, 0, 100).rest(300).up();  // a DRAG already, still after 200 ms
    const tapper = new Trace(3, 120, LX + 20, Y + 40).rest(80).up();
    const next = new Trace(4, 450, LX, Y).move(-12, 0, 60).up();                         // becomes a DRAG after the lift
    const g = run(makeRec2(), [...owner.samples, ...other.samples, ...tapper.samples, ...next.samples]);
    expect(tricky(g)).toEqual([]);
    expect(steerSum(g)).toBeCloseTo(30 - 12, 6);
  });

  it('hand-over: when the owner lifts, a left DRAG already down takes steering on its next move, from where it is', () => {
    // A grip contact drags first and owns steering; the real thumb lands and drags while it is down (no steering yet).
    const grip = new Trace(1, 0, 8, Y).move(12, 0, 60).rest(240).up();                  // lifts at 300 ms
    const thumb = new Trace(2, 100, LX, Y).move(-20, 0, 100).rest(140).move(36, 0, 120).rest(100).up();
    const g = run(makeRec2(), [...grip.samples, ...thumb.samples]);
    expect(tricky(g)).toEqual([]);
    // The grip's 12 px, then only the thumb's motion after the grip let go (still at the lift, then 36 px from 340 ms).
    expect(steerSum(g)).toBeCloseTo(12 + 36, 6);
    // A still contact that dragged earlier never takes over: lifting the owner holds the line.
    const still = run(makeRec2(), [...new Trace(1, 0, LX, Y).move(30, 0, 100).rest(100).up().samples,
      ...new Trace(2, 50, LX - 60, Y).move(-15, 0, 60).rest(600, 0).up().samples]);
    expect(steerSum(still)).toBeCloseTo(30, 6);
    // One thumb keeps "the next touch that becomes a DRAG" (no hand-over to a DRAG already down).
    const one = run(makeRec(), [...grip.samples, ...thumb.samples]);
    expect(steerSum(one)).toBeCloseTo(12, 6);
  });

  it('pointercancel frees steering for the next left touch that drags', () => {
    const g = run(makeRec2(), [...new Trace(1, 0, LX, Y).move(20, 0, 100).cancel().samples,
      ...new Trace(2, 200, LX, Y).move(-30, 0, 100).up().samples]);
    expect(steerSum(g)).toBeCloseTo(-10, 6);
    expect(tricky(g)).toEqual([]);
  });
});

describe('right (trick) thumb: tricks, never steers', () => {
  it('tap, nervous tap, sloppy tap, long tap and hold are unchanged', () => {
    expect(kinds(run(makeRec2(), new Trace(1, 0, RX, Y).rest(120).up().samples))).toEqual(['press+', 'tap', 'press-']);
    expect(kinds(run(makeRec2(), new Trace(1, 0, RX, Y).rest(300).up().samples))).toEqual(['press+', 'holdStart', 'tap', 'holdEnd', 'press-']);
    expect(kinds(run(makeRec2(), new Trace(1, 0, RX, Y).move(11, -8, 60).up().samples))).toEqual(['press+', 'press-', 'tap']);
    const long = run(makeRec2(), new Trace(1, 0, RX, Y).rest(450).up().samples);
    expect(long.find((x) => x.k === 'holdEnd')).toMatchObject({ release: true });
    expect(kinds(run(makeRec2(), new Trace(1, 0, RX, Y).rest(900).up().samples))).toEqual(['press+', 'holdStart', 'holdEnd', 'press-']);
  });

  it('a long slow drag steers nothing and fires nothing', () => {
    const g = run(makeRec2(), new Trace(1, 0, RX, Y).move(-120, 0, 1200).rest(50).up().samples);
    expect(g.filter((x) => x.k === 'steer')).toEqual([]);
    expect(swipes(g)).toEqual([]);
  });

  it('every swipe carries dxPx 0 and steer false, and keeps fast / fromRest', () => {
    const fresh = swipes(run(makeRec2(), new Trace(1, 0, RX, Y).flick(1.2, 180, 60).up().samples));
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ dir: 'l', dxPx: 0, steer: false, fast: true });
    // An old stroke (the one-thumb grammar would label it `steer` and narrow its diagonals) is a plain swipe here.
    const old = swipes(run(makeRec2(), new Trace(1, 0, RX - 30, Y).move(-30, 0, 300).rest(100).flick(1.0, 270, 60).up().samples));
    expect(old.map((s) => [s.dir, s.dxPx, s.steer, s.fromRest])).toEqual([['d', 0, false, true]]);
  });

  it('normal sectors (no owner narrowing): a 34° flick from the inner area is ↗, and arc compensation still applies in the outer 40%', () => {
    const at = (x: number, a: number) => swipes(run(makeRec2(), new Trace(1, 0, x, Y).move(-30, 0, 250).flick(1.0, a, 70).up().samples))[0]?.dir;
    expect(at(W * 0.58, 34)).toBe('ur');                     // one thumb: the steering owner's 34° is →
    expect(at(W * 0.58, 26)).toBe('r');
    // arc compensation for a stroke starting at 0.8·W: a leftward stroke rising 28° is ←, not ↖
    const arc = swipes(run(makeRec2(), new Trace(1, 0, W * 0.8, Y).flick(1.0, 152, 70).up().samples))[0];
    expect(arc?.dir).toBe('l');
  });

  it('re-fire (doubles), recoil and the lift-off rule are unchanged', () => {
    const dbl = swipes(run(makeRec2(), new Trace(1, 0, RX, Y).flick(1.2, 180, 60).rest(40).flick(1.2, 180, 60).up().samples));
    expect(dbl.map((s) => s.dir)).toEqual(['l', 'l']);
    const long = swipes(run(makeRec2(), new Trace(1, 0, RX, Y).flick(0.7, 180, 130).up().samples));   // one 90 px flick
    expect(long).toHaveLength(1);
    const recoil = swipes(run(makeRec2(), new Trace(1, 0, RX, Y).flick(1.2, 0, 50).flick(1.0, 180, 50).up().samples));
    expect(recoil.map((s) => s.dir)).toEqual(['r']);
  });

  it('sliding across the midline keeps the role: never steers', () => {
    const g = run(makeRec2(), new Trace(1, 0, W * 0.6, Y).move(-200, 0, 400).up().samples);
    expect(g.filter((x) => x.k === 'steer')).toEqual([]);
  });

  it('a right drag never takes steering, even with no left thumb; a left touch that drags later owns it', () => {
    const g = run(makeRec2(), [...new Trace(1, 0, RX, Y).move(-60, 0, 400).rest(400).up().samples,
      ...new Trace(2, 200, LX, Y).move(25, 0, 100).up().samples]);
    expect(steerSum(g)).toBeCloseTo(25, 6);
  });
});

describe('both thumbs at once', () => {
  it('left steers while right taps, flicks and holds: every right gesture arrives, all left motion steers', () => {
    const left = new Trace(1, 0, LX, Y).move(-40, 0, 300).move(70, 4, 400).flick(1.5, 0, 60).move(-20, 0, 300).up();
    const right = new Trace(2, 150, RX, Y - 30).rest(90).up();
    const flick = new Trace(3, 450, RX, Y).rest(40).flick(1.3, 180, 60).rest(30).flick(1.3, 180, 60).up();
    const hold = new Trace(4, 900, RX + 10, Y).rest(500).up();
    const g = run(makeRec2(), [...left.samples, ...right.samples, ...flick.samples, ...hold.samples]);
    expect(steerSum(g)).toBeCloseTo(left.x - LX, 6);
    expect(g.filter((x) => x.k === 'tap')).toHaveLength(1);
    const sw = swipes(g);
    expect(sw.map((s) => [s.dir, s.dxPx, s.steer])).toEqual([['l', 0, false], ['l', 0, false]]);
    expect(g.filter((x) => x.k === 'holdStart')).toHaveLength(1);
  });

  it('swap sides mirrors the zones', () => {
    const g = run(makeRec2({ swapSides: true }), [...new Trace(1, 0, RX, Y).move(-50, 0, 200).flick(1.4, 180, 60).up().samples,
      ...new Trace(2, 100, LX, Y).rest(100).up().samples]);
    expect(steerSum(g)).toBeCloseTo(-50 - 1.4 * 60, 6);
    expect(swipes(g)).toEqual([]);
    expect(g.filter((x) => x.k === 'tap')).toHaveLength(1);
  });
});

describe('one thumb, mouse and pen keep the one-thumb grammar', () => {
  const mouse = (tr: Trace, pointerType: PointerSample['pointerType'] = 'mouse') => tr.samples.map((s) => ({ ...s, pointerType }));

  it('controls: one — a left tap is an ollie and a right drag steers', () => {
    expect(kinds(run(makeRec(), new Trace(1, 0, LX, Y).rest(100).up().samples))).toEqual(['press+', 'tap', 'press-']);
    expect(steerSum(run(makeRec(), new Trace(1, 0, RX, Y).move(-40, 0, 300).up().samples))).toBeCloseTo(-40, 6);
  });

  it('a mouse (or pen) taps and steers anywhere with the two-thumb setting on', () => {
    expect(kinds(run(makeRec2(), mouse(new Trace(1, 0, LX, Y).rest(100).up())))).toEqual(['press+', 'tap', 'press-']);
    expect(steerSum(run(makeRec2(), mouse(new Trace(1, 0, RX, Y).move(-40, 0, 300).up())))).toBeCloseTo(-40, 6);
    const pen = swipes(run(makeRec2(), mouse(new Trace(1, 0, RX, Y).move(-40, 0, 300).flick(1.2, 180, 60).up(), 'pen')));
    expect(pen[0]).toMatchObject({ dir: 'l', steer: true });
  });

  it('the role is fixed at touch-down: switching the setting mid-touch changes nothing for touches already down', () => {
    const rec = makeRec2();
    const tr = new Trace(1, 0, LX, Y).rest(100).up();
    rec.feed(tr.samples[0]!);
    rec.config.controls = 'one';
    expect(rec.feed(tr.samples[1]!)).toEqual([]);                 // still the steering thumb: no tap
    expect(kinds(run(rec, new Trace(2, 500, LX, Y).rest(100).up().samples))).toEqual(['press+', 'tap', 'press-']);
  });

  it('the dead zone applies to both zones', () => {
    const rec = makeRec2({ screenH: H, deadZoneBottomPx: 46 });
    expect(run(rec, [...new Trace(1, 0, LX, H - 20).move(40, 0, 200).up().samples, ...new Trace(2, 0, RX, H - 20).rest(80).up().samples])).toEqual([]);
  });
});

describe('pipeline: frames', () => {
  const frames = (p: InputPipeline, n: number) => Array.from({ length: n }, (_, k) => p.frame(((k + 1) * 1000) / 60));
  it('a left drag + a right flick in the same tick: the frame carries the steering and a swipe with swipeDx 0', () => {
    const p = new InputPipeline(() => W);
    p.schedule([...new Trace(1, 0, LX, Y).move(80, 0, 400).up().samples, ...new Trace(2, 200, RX, Y).flick(1.3, 180, 60).up().samples]);
    const f = frames(p, 30);
    const s = f.find((x) => x.swipe)!;
    expect(s).toMatchObject({ swipe: 'l', swipeDx: 0, swipeSteer: false, swipeFast: true });
    expect(s.steerDx).toBeGreaterThan(0);
    expect(f.reduce((a, x) => a + x.steerDx, 0)).toBeCloseTo((80 * 9) / (0.55 * W), 6);
    expect(f.some((x) => x.press && x.steerDx > 0 && !f.some((y) => y.tap))).toBe(true);   // the right touch's press only
  });

  it('a left thumb resting through a whole air never presses or holds (no pre-press manual, no grab)', () => {
    const p = new InputPipeline(() => W);
    p.schedule(new Trace(1, 0, LX, Y).rest(800).up().samples);
    expect(frames(p, 60).some((x) => x.press || x.hold || x.tap || x.longTap)).toBe(false);
  });

  it('determinism: the same two-thumb trace gives identical frames on every replay', () => {
    const once = () => {
      const p = new InputPipeline(() => W);
      p.schedule([...new Trace(1, 3, LX, 520).flick(0.25, 0, 300).rest(90, 2).flick(1.3, 180, 60).up().samples,
        ...new Trace(2, 200, RX, 400).rest(260).up().samples,
        ...new Trace(3, 700, RX - 20, 500).rest(40).flick(1.1, 45, 60).rest(70).flick(1.1, 45, 60).up().samples]);
      return frames(p, 80);
    };
    const a = once();
    expect(once()).toEqual(a);
    expect(a.filter((f) => f.swipe).map((f) => f.swipe)).toEqual(['ur', 'ur']);
    expect(a.filter((f) => f.tap)).toHaveLength(1);
  });
});
