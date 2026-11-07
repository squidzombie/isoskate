// The Title → run dive (owner request; game/dive.ts, game/app.ts): the clock hands over exactly once (end or skip),
// cancel never hands over, reduced motion is a 0.3 s fade, the timeline covers the cut with an opaque wash; the App
// dives only from TAP TO ROLL / Space on the Title, and every other start (instant retry, ROLL AGAIN, Restart, debug)
// goes straight to a live run; a tap or key mid-dive skips it, Home cancels it, a hidden tab pauses the live run.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BoardLook } from '../../../src/core/cosmetics';
import type { UiIntent } from '../../../src/core/ui';
import { App, type AppDeps } from '../../../src/game/app';
import { DIVE, DiveClock, diveShape, type DiveView } from '../../../src/game/dive';
import { boardFollower } from '../../../src/game/titleBoard';

describe('DiveClock', () => {
  it('ends after DIVE.sec and hands over exactly once', () => {
    let n = 0;
    const c = new DiveClock(false, () => n++);
    expect(c.dur).toBe(DIVE.sec);
    for (let i = 0; i < 200; i++) c.tick(1 / 60);
    expect(n).toBe(1);
    expect(c.active).toBe(false);
    expect(c.ended).toBe(true);
    c.skip(); c.tick(1);
    expect(n).toBe(1);
  });
  it('skip hands over at once, once; cancel never hands over', () => {
    let n = 0;
    const c = new DiveClock(false, () => n++);
    c.tick(0.3); c.skip(); c.skip(); c.tick(5);
    expect(n).toBe(1);
    let m = 0;
    const d = new DiveClock(false, () => m++);
    d.tick(0.2); d.cancel(); d.tick(5); d.skip();
    expect(m).toBe(0);
    expect(d.active).toBe(false);
  });
  it('keeps to the wall clock, but a stalled frame jumps it at most 0.5 s', () => {
    const c = new DiveClock(false, () => undefined);
    c.tick(2);
    expect(c.t).toBeCloseTo(0.5, 6);
    expect(c.active).toBe(true);
  });
  it('reduced motion: a 0.3 s flat fade, no camera motion', () => {
    let n = 0;
    const c = new DiveClock(true, () => n++);
    expect(c.dur).toBe(DIVE.reducedSec);
    c.tick(0.1);
    const v = c.shape();
    expect(v.flat).toBe(1);
    expect(v.phase).toBe('space');
    c.tick(0.1);
    expect(c.shape().phase).toBe('world');
    c.tick(0.11);
    expect(n).toBe(1);
  });
  it('hold freezes the clock (tools)', () => {
    let n = 0;
    const c = new DiveClock(false, () => n++);
    c.hold = 0.9; c.tick(0.016); c.tick(1);
    expect(c.t).toBeCloseTo(0.9, 6);
    expect(n).toBe(0);
  });
});

describe('diveShape', () => {
  const out: DiveView = { phase: 'space', u: 0, v: 0, cover: 0, hole: -1, flat: 0 };
  it('space until switchSec, world after; the wash is opaque across the cut and gone at the end', () => {
    expect(diveShape(0, false, out).cover).toBe(0);
    expect(diveShape(DIVE.switchSec - 1e-3, false, out).phase).toBe('space');
    expect(out.cover).toBeGreaterThan(0.99);
    expect(diveShape(DIVE.switchSec + 1e-3, false, out).phase).toBe('world');
    expect(out.cover).toBe(1);
    expect(out.hole).toBeLessThan(-0.6);                  // closed at the cut
    diveShape(DIVE.sec, false, out);
    expect(out.v).toBe(1);
    expect(out.hole).toBeGreaterThan(1.5);                // open past every corner of the screen
  });
  it('progress is monotonic', () => {
    let lastU = -1, lastV = -1, lastHole = -9;
    for (let t = 0; t <= DIVE.sec; t += 0.01) {
      diveShape(t, false, out);
      expect(out.u).toBeGreaterThanOrEqual(lastU); expect(out.v).toBeGreaterThanOrEqual(lastV);
      if (out.phase === 'world') { expect(out.hole).toBeGreaterThanOrEqual(lastHole); lastHole = out.hole; }
      lastU = out.u; lastV = out.v;
    }
  });
});

describe('boardFollower', () => {
  it('pushes a look when the equipped id changes, and only then', () => {
    let id = 'bd_a';
    const looks: string[] = [];
    const look = () => ({ name: id } as unknown as BoardLook);
    const sync = boardFollower(() => id, look, { setLook: (l) => looks.push((l as unknown as { name: string }).name) });
    expect(sync()).toBe(true);
    expect(sync()).toBe(false); expect(sync()).toBe(false);
    id = 'bd_b';
    expect(sync()).toBe(true);
    expect(sync()).toBe(false);
    expect(looks).toEqual(['bd_a', 'bd_b']);
  });
});

// ── App flow with fakes (node: minimal window / document / history stubs for the platform glue) ─────────────────
const G = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};
beforeAll(() => {
  for (const k of ['window', 'document', 'history']) saved[k] = G[k];
  G.window = new EventTarget();
  G.document = Object.assign(new EventTarget(), { visibilityState: 'visible', activeElement: null });
  G.history = { pushState() {}, back() {} };
});
afterAll(() => { for (const k of Object.keys(saved)) G[k] = saved[k]; });

function harness(o: { reduced?: boolean } = {}) {
  const log: string[] = [];
  let intent: ((i: UiIntent) => void) | null = null;
  const root = new EventTarget();
  const play = { classList: { add() {}, remove() {} } };
  const loop = {
    running: false, fast: false, start() {}, stop() {}, resetRun() {},
    setRunning(on: boolean) { if (on && !this.running) log.push('live'); this.running = on; },
  };
  const input = { enabled: false, setEnabled(on: boolean) { this.enabled = on; } };
  const settings = { reducedMotion: false, effects: true };
  const d = {
    root, play, loop, input,
    sim: { reset() {}, gen: {}, cur: { vel: { s: 7 } }, result: () => ({}) },
    ui: { onIntent: (f: (i: UiIntent) => void) => { intent = f; return () => undefined; }, show: (s: string) => log.push(`show:${s}`), hud: { show: (on: boolean) => log.push(`hud:${on}`) } },
    meta: { loadout: () => ({}), catalog: () => [], applyRun: () => null },
    save: { data: { settings, onboarding: { runsStarted: 0 } }, mutate: (f: (s: unknown) => void) => f({ onboarding: { runsStarted: 0 } }), flush() {} },
    audio: { setScene: (s: string) => log.push(`scene:${s}`), sfx: (id: string) => log.push(`sfx:${id}`), suspend() {}, resume() {} },
    analytics: { track() {} },
    worldView: { attach() {} },
    skater: { setLoadout() {}, setMode() {}, setTurntable() {} },
    cameraRig: { setMode() {}, solve: () => ({ rotate: false }) },
    vfx: { clear() {} },
    gameBus: { on: () => () => undefined },
    appBus: { emit() {} },
    session: { next: () => ({ seed: 1 }) },
    viewport: () => ({ wCss: 390, hCss: 844, dpr: 1, aspect: 0.46, safeTop: 0, safeBottom: 0, coarse: true }),
    applySettings() {},
    reducedMotion: () => !!o.reduced,
  };
  const app = new App(d as unknown as AppDeps);
  app.boot();
  const run = (sec: number) => { for (let t = 0; t < sec; t += 1 / 60) app.frame(1 / 60); };
  return { app, log, loop, input, root, raise: (i: UiIntent) => intent!(i), lives: () => log.filter((x) => x === 'live').length };
}

describe('App: the dive', () => {
  it('TAP TO ROLL dives: the run is prepared, waits, then goes live once at the hand-over', () => {
    const h = harness();
    h.raise({ k: 'play' });
    expect(h.app.current).toBe('run');
    expect(h.app.diving).toBe(true);
    expect(h.app.backdrop).toBe('dive');
    expect(h.loop.running).toBe(false);
    expect(h.input.enabled).toBe(false);
    expect(h.loop.fast).toBe(true);
    expect(h.log).toContain('sfx:dive');
    expect(h.log).toContain('scene:run');
    for (let t = 0; t < DIVE.sec - 0.05; t += 1 / 60) h.app.frame(1 / 60);
    expect(h.lives()).toBe(0);
    for (let t = 0; t < 1; t += 1 / 60) h.app.frame(1 / 60);
    expect(h.lives()).toBe(1);
    expect(h.app.diving).toBe(false);
    expect(h.app.backdrop).toBe('world');
    expect(h.loop.running).toBe(true);
    expect(h.input.enabled).toBe(true);
    expect(h.loop.fast).toBe(false);
    expect(h.log.filter((x) => x === 'hud:true')).toHaveLength(1);
  });
  it('a tap during the dive skips it (its propagation stops at the root: the run input never sees it); a key too', () => {
    const h = harness();
    h.raise({ k: 'play' });
    h.app.frame(0.2);
    const e = new Event('pointerdown');
    let stopped = false;
    e.stopPropagation = () => { stopped = true; };
    h.root.dispatchEvent(e);
    expect(h.app.diving).toBe(false);
    expect(h.lives()).toBe(1);
    expect(stopped).toBe(true);
    const k = harness();
    k.raise({ k: 'play' });
    window.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyA', repeat: false, preventDefault() {} }));
    expect(k.app.diving).toBe(false);
    expect(k.lives()).toBe(1);
  });
  it('reduced motion: the hand-over comes after 0.3 s', () => {
    const h = harness({ reduced: true });
    h.raise({ k: 'play' });
    for (let i = 0; i < 17; i++) h.app.frame(1 / 60);
    expect(h.lives()).toBe(0);
    for (let i = 0; i < 3; i++) h.app.frame(1 / 60);
    expect(h.lives()).toBe(1);
  });
  it('Home mid-dive cancels it: no hand-over, back on the Title backdrop', () => {
    const h = harness();
    h.raise({ k: 'play' });
    h.app.frame(0.3);
    h.raise({ k: 'home' });
    for (let t = 0; t < 3; t += 1 / 60) h.app.frame(1 / 60);
    expect(h.lives()).toBe(0);
    expect(h.app.current).toBe('title');
    expect(h.app.backdrop).toBe('space');
    expect(h.loop.fast).toBe(false);
  });
  it('a hidden tab mid-dive pauses the live run (the dive is finished first)', () => {
    const h = harness();
    h.raise({ k: 'play' });
    h.app.frame(0.3);
    window.dispatchEvent(new Event('blur'));
    expect(h.app.diving).toBe(false);
    expect(h.app.current).toBe('pause');
    expect(h.loop.running).toBe(false);
  });
  it('instant retry, ROLL AGAIN, Restart and debug starts never dive', () => {
    const h = harness();
    h.app.startRun();                                   // debug / __skate.start
    expect(h.app.diving).toBe(false);
    expect(h.loop.running).toBe(true);
    h.app.open('results');
    h.raise({ k: 'retry' });                            // Results › ROLL AGAIN
    expect(h.app.diving).toBe(false);
    expect(h.app.current).toBe('run');
    h.app.pause(false);
    h.raise({ k: 'restart' });                          // Pause › Restart
    expect(h.app.diving).toBe(false);
    expect(h.loop.running).toBe(true);
    h.app.open('results');
    h.raise({ k: 'restart' });
    expect(h.app.diving).toBe(false);
    h.app.open('run');
    expect(h.app.diving).toBe(false);
    expect(h.log).not.toContain('sfx:dive');
  });
  it('only the Title dives: a play intent elsewhere does nothing', () => {
    const h = harness();
    h.app.open('stats');
    h.raise({ k: 'play' });
    expect(h.app.diving).toBe(false);
    expect(h.app.current).toBe('stats');
  });
});
