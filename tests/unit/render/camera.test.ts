// Camera framing solver table (TECH §8.3, DESIGN §8). Owned by INT in M0, then WA.
import { describe, expect, it } from 'vitest';
import { LOOKAHEAD_MIN, speedAt } from '../../../src/core/tuning';
import type { RenderFrame, Viewport } from '../../../src/core/view';
import { createCameraRig, solveFraming } from '../../../src/world/render';

const vp = (w: number, h: number, safeTop = 0, safeBottom = 0, coarse = true): Viewport =>
  ({ wCss: w, hCss: h, dpr: 1, aspect: w / h, safeTop, safeBottom, coarse });

// DESIGN §8 results table: [viewport, H at 7.0, look-ahead at 7.0, H at 10.5, look-ahead at 10.5].
const TABLE: [string, Viewport, number, number, number, number][] = [
  ['393×852 safe 59 (installed iPhone)', vp(393, 852, 59, 34), 20.8, 2.94, 27.2, 2.60],
  ['390×844 full screen', vp(390, 844), 20.8, 3.29, 24.4, 2.60],
  ['390×664 Safari toolbars', vp(390, 664), 17.1, 2.60, 25.1, 2.60],
  ['375×548 iPhone SE in Safari', vp(375, 548), 17.6, 2.60, 25.8, 2.60],
  ['412×780 Android Chrome', vp(412, 780), 18.2, 2.83, 24.6, 2.60],
  ['360×640 (9:16)', vp(360, 640), 17.2, 2.60, 25.2, 2.60],
  ['1280×800 desktop (ψ 30°)', vp(1280, 800, 0, 0, false), 16.7, 2.60, 23.5, 2.60],
];
const EXTRA: [string, Viewport][] = [
  ['360×840', vp(360, 840)], ['768×1024 tablet portrait', vp(768, 1024)], ['1920×1080', vp(1920, 1080, 0, 0, false)],
  ['2560×1080 (21:9)', vp(2560, 1080, 0, 0, false)],
];

describe('framing solver: DESIGN §8 table', () => {
  for (const [name, v, h7, l7, h105, l105] of TABLE) {
    it(name, () => {
      const a = solveFraming(7.0, v), b = solveFraming(10.5, v);
      expect(Math.abs(a.H - h7)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(b.H - h105)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(a.lookAheadSec - l7)).toBeLessThanOrEqual(0.03);
      expect(Math.abs(b.lookAheadSec - l105)).toBeLessThanOrEqual(0.03);
      expect(a.hudTop).toBeCloseTo((v.safeTop + 56) / v.hCss, 9);
      expect(a.anchorY).toBe(0.74);
    });
  }
});

describe('look-ahead guarantee: ≥ 2.5 s of full corridor width below the HUD band', () => {
  for (const [name, v] of [...TABLE.map(([n, x]) => [n, x] as [string, Viewport]), ...EXTRA]) {
    it(name, () => {
      for (const speed of [7.0, 8.0, 9.0, 10.5]) expect(solveFraming(speed, v).lookAheadSec).toBeGreaterThanOrEqual(LOOKAHEAD_MIN);
    });
  }
});

describe('yaw and rotate rules', () => {
  it('ψ = 0 for every portrait phone row', () => {
    for (const [, v] of TABLE.slice(0, 6)) expect(solveFraming(7, v).yawDeg).toBe(0);
    expect(solveFraming(7, vp(768, 1024)).yawDeg).toBe(0);
  });
  it('ψ = 30° at aspect ≥ 1.25, linear in between', () => {
    expect(solveFraming(7, vp(1280, 800, 0, 0, false)).yawDeg).toBe(30);
    expect(solveFraming(7, vp(1000, 1000, 0, 0, false)).yawDeg).toBeCloseTo(15, 9);
  });
  it('rotate card for a coarse-pointer phone in landscape only', () => {
    expect(solveFraming(7, vp(844, 390, 0, 0, true)).rotate).toBe(true);
    expect(solveFraming(7, vp(844, 390, 0, 0, false)).rotate).toBe(false);
    expect(solveFraming(7, vp(1280, 800, 0, 0, true)).rotate).toBe(false);
    expect(solveFraming(7, vp(390, 844)).rotate).toBe(false);
  });
});

describe('camera rig', () => {
  const frame = (t: number, tick: number, v: Viewport, dt = 1 / 60): RenderFrame => {
    const st = { tick, t, p: { s: 0, x: 0, y: 0 }, vel: { s: speedAt(t), x: 0, y: 0 }, groundY: 0 };
    return { alpha: 1, dt, timeScale: 1, prev: st, cur: st, pose: {}, score: {}, events: [], playerS: st.p.s,
      speed: speedAt(t), area: 'downtown', blend: null, viewport: v } as unknown as RenderFrame;
  };
  it('H only grows within a run and keeps the look-ahead guarantee while easing', () => {
    const rig = createCameraRig() as ReturnType<typeof createCameraRig> & { last: { H: number; lookAheadSec: number } };
    const v = vp(390, 664);
    let lastH = 0;
    for (let tick = 0; tick <= 60 * 200; tick += 6) {
      rig.update(frame(tick / 60, tick, v, 0.1));
      expect(rig.last.H).toBeGreaterThanOrEqual(lastH - 1e-9);
      expect(rig.last.lookAheadSec).toBeGreaterThanOrEqual(LOOKAHEAD_MIN);
      lastH = rig.last.H;
    }
  });
  it('eases on game time: large manual steps rendered with dt = 0 keep the look-ahead guarantee', () => {
    // __skate.step(n) renders once through renderNow (dt 0) after n ticks; real time barely passes.
    for (const v of [vp(390, 844), vp(390, 664), vp(1280, 800, 0, 0, false)]) {
      const rig = createCameraRig() as ReturnType<typeof createCameraRig> & { last: { H: number; lookAheadSec: number } };
      for (const tick of [1, 120, 600, 1800, 3600, 5400, 7200, 9000, 12600]) {
        rig.update(frame(tick / 60, tick, v, 0));
        expect(rig.last.lookAheadSec, `${v.wCss}×${v.hCss} tick ${tick}`).toBeGreaterThanOrEqual(LOOKAHEAD_MIN);
      }
    }
  });
  it('projects the skater ground point to 74% from the top, centred in portrait', () => {
    const rig = createCameraRig();
    const v = vp(390, 844);
    rig.update(frame(5, 300, v));
    const p = rig.project({ s: 0, x: 0, y: 0 });
    expect(p.x).toBeCloseTo(195, 1);
    expect(p.y / 844).toBeCloseTo(0.74, 3);
    const edge = rig.project({ s: 0, x: 4.8, y: 0 });
    expect(edge.x).toBeCloseTo(390, 0);        // the corridor + margin fills the width (width-bound H)
  });
});
