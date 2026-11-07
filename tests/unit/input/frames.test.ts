// Keyboard presets, frame binning and the DOM-free pipeline (TECH §7.3, §7.4, §6.1).
import { describe, expect, it } from 'vitest';
import type { Gesture } from '../../../src/core/input';
import { FrameBuilder, steerMetresPerPx } from '../../../src/input/frames';
import { diagonalOf, KeyboardMapper } from '../../../src/input/keyboard';
import { InputPipeline } from '../../../src/input/pipeline';
import { ONE_THUMB, Trace } from './trace';

describe('keyboard preset A', () => {
  it('a cardinal fires on keydown with no delay', () => {
    const k = new KeyboardMapper();
    expect(k.down('ArrowLeft', 1000)).toEqual([{ tMs: 1000, swipe: 'l' }]);
  });
  it('a second arrow at 60 ms gives an amend (the diagonal); at 90 ms a separate swipe', () => {
    const a = new KeyboardMapper();
    a.down('ArrowUp', 1000);
    expect(a.down('ArrowRight', 1060)).toEqual([{ tMs: 1060, swipe: 'ur', amend: true }]);
    const b = new KeyboardMapper();
    b.down('ArrowLeft', 1000);
    expect(b.down('ArrowDown', 1090)).toEqual([{ tMs: 1090, swipe: 'd' }]);
    const c = new KeyboardMapper();
    c.down('ArrowLeft', 1000);
    expect(c.down('ArrowDown', 1080)).toEqual([{ tMs: 1080, swipe: 'dl', amend: true }]);   // 80 ms is inside
  });
  it('a repeated arrow repeats (doubles); opposite arrows never amend; one amend per trick', () => {
    const k = new KeyboardMapper();
    k.down('ArrowLeft', 0);
    expect(k.down('ArrowLeft', 40)).toEqual([{ tMs: 40, swipe: 'l' }]);
    expect(k.down('ArrowRight', 60)).toEqual([{ tMs: 60, swipe: 'r' }]);
    const m = new KeyboardMapper();
    m.down('ArrowUp', 0); m.down('ArrowRight', 30);
    expect(m.down('ArrowLeft', 50)).toEqual([{ tMs: 50, swipe: 'l' }]);
  });
  it('key repeat never makes edges; Space/W tap; A/D axis; S and Shift are manual; Q grabs', () => {
    const k = new KeyboardMapper();
    expect(k.down('Space', 0)).toEqual([{ tMs: 0, tap: true }]);
    expect(k.down('Space', 30, true)).toEqual([]);
    expect(k.down('KeyW', 50)).toEqual([{ tMs: 50, tap: true }]);
    k.down('KeyD', 60);
    expect(k.levels()).toEqual({ steerAxis: 1, manualKey: false, grab: false });
    k.down('KeyA', 70);
    expect(k.levels().steerAxis).toBe(0);
    k.up('KeyD');
    expect(k.levels().steerAxis).toBe(-1);
    k.down('KeyS', 80); k.down('KeyQ', 80);
    expect(k.levels()).toEqual({ steerAxis: -1, manualKey: true, grab: true });
    k.up('KeyS'); k.down('ShiftLeft', 90);
    expect(k.levels().manualKey).toBe(true);
    expect(k.isGameKey('Escape')).toBe(false);
    expect(k.isGameKey('Enter')).toBe(false);
    expect(k.down('KeyR', 100)).toEqual([]);
  });
  it('held keys are tracked while edges are off (levels survive a pause), and blur clears them', () => {
    const k = new KeyboardMapper();
    expect(k.down('KeyD', 0, false, false)).toEqual([]);
    expect(k.levels().steerAxis).toBe(1);
    k.clear();
    expect(k.levels().steerAxis).toBe(0);
  });
  it('preset B: ←/→ steer, IJKL + U/O/N/M directions, Shift manual', () => {
    const k = new KeyboardMapper();
    k.preset = 'B';
    expect(k.down('KeyO', 0)).toEqual([{ tMs: 0, swipe: 'ur' }]);
    expect(k.down('KeyU', 10)).toEqual([{ tMs: 10, swipe: 'ul' }]);
    expect(k.down('KeyJ', 20)).toEqual([{ tMs: 20, swipe: 'l' }]);
    expect(k.down('ArrowLeft', 30)).toEqual([]);
    expect(k.levels().steerAxis).toBe(-1);
    k.down('KeyS', 40);
    expect(k.levels().manualKey).toBe(false);
    k.down('ShiftRight', 50);
    expect(k.levels().manualKey).toBe(true);
  });
  it('diagonalOf', () => {
    expect(diagonalOf('u', 'r')).toBe('ur');
    expect(diagonalOf('l', 'd')).toBe('dl');
    expect(diagonalOf('l', 'r')).toBeNull();
    expect(diagonalOf('u', 'u')).toBeNull();
  });
});

describe('binning (FrameBuilder)', () => {
  const tap = (tMs: number): Gesture => ({ k: 'tap', tMs });
  const sw = (tMs: number, dir: 'l' | 'r'): Gesture => ({ k: 'swipe', tMs, dir, dxPx: 0, fast: true, fromRest: false, steer: false });
  it('a gesture at t lands in the tick whose due time is ≥ t', () => {
    const fb = new FrameBuilder(() => 390);
    fb.push(tap(100));
    expect(fb.frame(99.9).tap).toBe(false);
    expect(fb.frame(100).tap).toBe(true);
    expect(fb.frame(116.7).tap).toBe(false);
  });
  it('one swipe per tick: the second waits for the next tick', () => {
    const fb = new FrameBuilder(() => 390);
    fb.push(sw(10, 'l')); fb.push(sw(12, 'r'));
    expect(fb.frame(16).swipe).toBe('l');
    expect(fb.frame(33).swipe).toBe('r');
  });
  it('steering px → metres with S = 9 / (0.55·W) × sensitivity; swipeDx uses the same scale', () => {
    const fb = new FrameBuilder(() => 390);
    fb.sensitivity = 1.5;
    fb.push({ k: 'steer', tMs: 1, dxPx: 10 }); fb.push({ k: 'steer', tMs: 2, dxPx: 5 });
    fb.push({ k: 'swipe', tMs: 3, dir: 'r', dxPx: 20, fast: false, fromRest: true, steer: true });
    const f = fb.frame(16);
    expect(f.steerDx).toBeCloseTo(15 * steerMetresPerPx(390, 1.5), 12);
    expect(f.swipeDx).toBeCloseTo(20 * steerMetresPerPx(390, 1.5), 12);
    expect(f).toMatchObject({ swipe: 'r', swipeFast: false, swipeFromRest: true, swipeSteer: true });
    expect(steerMetresPerPx(390)).toBeCloseTo(0.042, 3);
  });
  it('hold and press are levels (counted over touches); manualKey implies press', () => {
    const fb = new FrameBuilder(() => 390);
    fb.pushAll([{ k: 'press', tMs: 0, down: true }, { k: 'press', tMs: 1, down: true }, { k: 'holdStart', tMs: 5 }]);
    expect(fb.frame(16)).toMatchObject({ press: true, hold: true });
    fb.pushAll([{ k: 'press', tMs: 20, down: false }]);
    expect(fb.frame(33).press).toBe(true);
    fb.pushAll([{ k: 'press', tMs: 40, down: false }, { k: 'holdEnd', tMs: 40 }]);
    expect(fb.frame(50)).toMatchObject({ press: false, hold: false });
    expect(fb.frame(66, { steerAxis: 0, manualKey: true, grab: false })).toMatchObject({ press: true, manualKey: true });
  });
  it('a holdStart stamped by tick() is ordered before later live gestures', () => {
    const fb = new FrameBuilder(() => 390);
    fb.push(tap(230));
    fb.push({ k: 'holdStart', tMs: 200 });
    expect(fb.frame(210).hold).toBe(true);
  });
});

describe('pipeline (recognizer + keyboard + frames, no DOM)', () => {
  /** Steps a pipeline like the 60 Hz loop: tick k is due at t0 + k·16.667 ms. */
  const frames = (p: InputPipeline, n: number, t0 = 0) => Array.from({ length: n }, (_, k) => p.frame(t0 + ((k + 1) * 1000) / 60));

  it('a scheduled synthetic tap is one tap edge in the tick of its release', () => {
    const p = new InputPipeline(() => 390, ONE_THUMB);
    p.schedule(new Trace(1, 0, 200, 400).rest(120).up().samples);
    const f = frames(p, 12);
    expect(f.map((x) => x.tap).indexOf(true)).toBe(7);        // released at 120 ms → the tick due at 133 ms
    expect(f.filter((x) => x.tap)).toHaveLength(1);
    expect(f[2]!.press).toBe(true);
    expect(f[9]!.press).toBe(false);
  });
  it('a scheduled hold reaches the frames at 200 ms, not when the trace was queued', () => {
    const p = new InputPipeline(() => 390, ONE_THUMB);
    p.schedule(new Trace(1, 0, 200, 400).rest(400).up().samples, 1000);
    const f = frames(p, 100, 1000);
    expect(f.findIndex((x) => x.hold)).toBe(11);              // 1200 ms → tick due at 1200.0
    expect(f.filter((x) => x.tap)).toHaveLength(0);
  });
  it('a drag steers and a swipe left in a fresh stroke is not steer', () => {
    const p = new InputPipeline(() => 390, ONE_THUMB);
    p.schedule(new Trace(1, 0, 300, 400).rest(60).flick(1.2, 180, 60).up().samples);
    const f = frames(p, 10);
    const s = f.find((x) => x.swipe);
    expect(s).toMatchObject({ swipe: 'l', swipeSteer: false, swipeFast: true });
    expect(f.reduce((a, x) => a + x.steerDx, 0)).toBeLessThan(-2);
  });
  it('keyboard edges and levels go through the same frames', () => {
    const p = new InputPipeline(() => 390, ONE_THUMB);
    p.keyDown('ArrowUp', 5); p.keyDown('ArrowRight', 40);
    const f0 = p.frame(1000 / 60);
    p.keyDown('KeyD', 41);                                    // levels are sampled live, edges are binned
    const f = [f0, ...frames(p, 3, 1000 / 60)];
    expect(f[0]).toMatchObject({ swipe: 'u', swipeAmend: false, steerAxis: 0 });
    expect(f[2]).toMatchObject({ swipe: 'ur', swipeAmend: true, steerAxis: 1 });
  });
});

describe('determinism', () => {
  it('the same pointer + key trace gives identical InputFrames on every replay (thumb bot, replays)', () => {
    const trace = () => [
      ...new Trace(1, 3, 120, 520).flick(0.25, 0, 300).rest(90, 2).flick(1.3, 180, 60).up().samples,
      ...new Trace(2, 200, 300, 400).rest(260).up().samples,
      ...new Trace(3, 700, 200, 500).rest(40).flick(1.1, 45, 60).rest(70).flick(1.1, 45, 60).up().samples,
    ];
    const runOnce = () => {
      const p = new InputPipeline(() => 390, ONE_THUMB);
      p.schedule(trace());
      p.keyDown('ArrowUp', 900); p.keyDown('ArrowRight', 950);
      return Array.from({ length: 80 }, (_, k) => p.frame(((k + 1) * 1000) / 60));
    };
    const a = runOnce(), b = runOnce();
    expect(b).toEqual(a);
    expect(a.filter((f) => f.swipe).map((f) => f.swipe)).toEqual(expect.arrayContaining(['l', 'ur']));
    expect(a.some((f) => f.tap)).toBe(true);
  });
});

describe('long tap through the pipeline (W1a)', () => {
  it('a still 390 ms press gives one frame with longTap (and no tap); 700 ms gives none', () => {
    const frames = (ms: number) => {
      const p = new InputPipeline(() => 390, ONE_THUMB);
      p.schedule(new Trace(1, 0, 195, 500).rest(ms).up().samples);
      const out = [];
      for (let t = 0; t <= ms + 50; t += 1000 / 60) out.push(p.frame(t));
      return out;
    };
    const a = frames(390);
    expect(a.filter((f) => f.longTap)).toHaveLength(1);
    expect(a.some((f) => f.tap)).toBe(false);
    expect(frames(700).some((f) => f.longTap)).toBe(false);
    expect(frames(200).filter((f) => f.tap)).toHaveLength(1);
  });
});
