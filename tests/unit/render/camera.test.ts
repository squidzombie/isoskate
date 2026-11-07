// Camera framing solver table (TECH §8.3, DESIGN §8, decision row 73). Owned by INT in M0, then WA; @cam made the
// telephoto perspective camera the production default (pitch 34°, portrait yaw 9°, window FOV 24°, D solved).
// The guarantees: ≥ 2.5 s of the full corridor width below the HUD band at every supported viewport (9:21 to 21:9,
// toolbars and safe areas included) and speed, the skater ground point at 74%, D only grows within a run, the
// minimum on-screen sizes (skater, grind edges, coins), the resting thumb clear of the skater, and a top of screen
// that stays inside the chunk window.
import { describe, expect, it } from 'vitest';
import { CAMERA, CHUNK_LEN, CHUNK_WINDOW, CORRIDOR_HALF, LOOKAHEAD_MIN, speedAt } from '../../../src/core/tuning';
import type { RenderFrame, Viewport } from '../../../src/core/view';
import {
  buildOptionsFor, camVariant, coinFloorOf, createCameraRig, edgeHalfAt, framePx, groundAt, solveFraming, type Framing,
} from '../../../src/world/render';

const vp = (w: number, h: number, safeTop = 0, safeBottom = 0, coarse = true): Viewport =>
  ({ wCss: w, hCss: h, dpr: 1, aspect: w / h, safeTop, safeBottom, coarse });

// DESIGN §8 results table: [viewport, D at 7.0, H at 7.0 (frame height at the skater's depth, tanH·D), look-ahead at
// 7.0, D at 10.5, H at 10.5, look-ahead at 10.5]. D is solved for the worst lateral follow (15% of |x| ≤ 4.5 m), so
// the look-ahead with the skater in the middle is a little over the 2.6 s target.
const TABLE: [string, Viewport, number, number, number, number, number, number][] = [
  ['393×852 safe 59 (installed iPhone)', vp(393, 852, 59, 34), 57.25, 24.34, 2.76, 60.27, 25.62, 2.77],
  ['390×844 full screen', vp(390, 844), 57.14, 24.29, 2.76, 60.14, 25.57, 2.77],
  ['390×664 Safari toolbars', vp(390, 664), 43.73, 18.59, 2.91, 45.44, 19.32, 2.93],
  ['375×548 iPhone SE in Safari', vp(375, 548), 36.78, 15.64, 3.13, 37.86, 16.10, 2.66],
  ['412×780 Android Chrome', vp(412, 780), 49.26, 20.94, 2.83, 51.48, 21.89, 2.84],
  ['360×640 (9:16)', vp(360, 640), 45.91, 19.52, 2.87, 47.82, 20.33, 2.88],
  ['1280×800 desktop (ψ 30°)', vp(1280, 800, 0, 0, false), 23.79, 10.11, 2.66, 32.73, 13.91, 2.64],
];
const EXTRA: [string, Viewport][] = [
  ['360×840 (9:21)', vp(360, 840)], ['768×1024 tablet portrait', vp(768, 1024)], ['1920×1080', vp(1920, 1080, 0, 0, false)],
  ['2560×1080 (21:9)', vp(2560, 1080, 0, 0, false)], ['412×915', vp(412, 915)], ['430×932 safe 59', vp(430, 932, 59, 34)],
];
const ALL: [string, Viewport][] = [...TABLE.map(([n, x]) => [n, x] as [string, Viewport]), ...EXTRA];
const PHONES = ALL.filter(([, v]) => v.aspect < 0.75);
const SPEEDS = [7.0, 7.5, 8.0, 9.0, 10.0, 10.5];
/** DESIGN §8 skater scale: about 1.48 m of frame height at the skater's depth. */
const skaterPx = (f: Framing, v: Viewport) => (1.48 * v.hCss) / f.H;
type Rig = ReturnType<typeof createCameraRig> & { last: Framing };
const frame = (t: number, tick: number, v: Viewport, dt = 1 / 60, x = 0): RenderFrame => {
  const st = { tick, t, p: { s: 0, x, y: 0 }, vel: { s: speedAt(t), x: 0, y: 0 }, groundY: 0 };
  return { alpha: 1, dt, timeScale: 1, prev: st, cur: st, pose: {}, score: {}, events: [], playerS: st.p.s,
    speed: speedAt(t), area: 'downtown', blend: null, viewport: v } as unknown as RenderFrame;
};

describe('the production run camera', () => {
  it('is the perspective spec of CAMERA (pitch 34°, portrait yaw 9°, FOV 24°)', () => {
    expect(camVariant()).toMatchObject({ id: 'P', proj: 'persp', pitchDeg: 34, yawMinDeg: 9, fovDeg: 24 });
    expect(CAMERA).toMatchObject({ proj: 'persp', pitchDeg: 34, yawMinDeg: 9, fovDeg: 24, anchorFromTop: 0.74, xrayCapY: 1.2 });
  });
});

describe('framing solver: DESIGN §8 table', () => {
  for (const [name, v, d7, h7, l7, d105, h105, l105] of TABLE) {
    it(name, () => {
      const a = solveFraming(7.0, v), b = solveFraming(10.5, v);
      expect(a.proj).toBe('persp');
      expect(Math.abs(a.D - d7), `D @7 ${a.D}`).toBeLessThanOrEqual(0.1);
      expect(Math.abs(b.D - d105), `D @10.5 ${b.D}`).toBeLessThanOrEqual(0.1);
      expect(Math.abs(a.H - h7)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(b.H - h105)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(a.lookAheadSec - l7)).toBeLessThanOrEqual(0.03);
      expect(Math.abs(b.lookAheadSec - l105)).toBeLessThanOrEqual(0.03);
      expect(a.hudTop).toBeCloseTo((v.safeTop + 56) / v.hCss, 9);
      expect(a.anchorY).toBe(0.74);
    });
  }
});

describe('look-ahead guarantee: ≥ 2.5 s of full corridor width below the HUD band', () => {
  for (const [name, v] of ALL) {
    it(name, () => {
      for (const speed of SPEEDS) expect(solveFraming(speed, v).lookAheadSec, `${speed} m/s`).toBeGreaterThanOrEqual(LOOKAHEAD_MIN);
    });
  }
  it('the rig: the corners of the 2.5 s corridor are on screen below the HUD band, the anchor at 74%, at every viewport', () => {
    for (const [name, v] of ALL) {
      for (const t of [0, 60, 160]) for (const x of [-4.3, 0, 4.3]) {
        const rig = createCameraRig() as Rig;
        rig.update(frame(t, 60 * t + 1, v, 1 / 60, x));
        const speed = speedAt(t), hudY = v.safeTop + CAMERA.hudPx - 0.5;
        expect(rig.project({ s: 0, x: rig.last.yawDeg > 0 ? CAMERA.latFollow * x : 0, y: 0 }).y / v.hCss, `${name} anchor`).toBeCloseTo(CAMERA.anchorFromTop, 3);
        for (const s of [-CAMERA.behind, 2.5 * speed]) for (const cx of [-CORRIDOR_HALF, CORRIDOR_HALF]) {
          const p = rig.project({ s, x: cx, y: 0 }), at = `${name} t${t} skater x ${x}: s ${s.toFixed(1)} x ${cx}`;
          expect(p.x, at).toBeGreaterThanOrEqual(-0.5);
          expect(p.x, at).toBeLessThanOrEqual(v.wCss + 0.5);
          expect(p.y, at).toBeGreaterThanOrEqual(hudY);
          expect(p.y, at).toBeLessThanOrEqual(v.hCss + 0.5);
        }
        expect(rig.last.lookAheadSec, name).toBeGreaterThanOrEqual(LOOKAHEAD_MIN);
      }
    }
  });
});

describe('minimum sizes and the resting thumb (DESIGN §8, §18.4)', () => {
  it('skater ≥ 40 px at 390×844 at 10.5 m/s, never < 30 px (375×548 included); every phone ≥ 40', () => {
    expect(skaterPx(solveFraming(10.5, vp(390, 844)), vp(390, 844))).toBeGreaterThanOrEqual(40);
    expect(skaterPx(solveFraming(10.5, vp(375, 548)), vp(375, 548))).toBeGreaterThanOrEqual(30);
    for (const [name, v] of PHONES) for (const sp of SPEEDS) expect(skaterPx(solveFraming(sp, v), v), `${name} @ ${sp}`).toBeGreaterThanOrEqual(40);
  });
  it('a 1 m hazard 2.5 s ahead stands ≥ 20 px on every phone at every speed (perspective: it grows as it nears)', () => {
    for (const [name, v] of PHONES) for (const sp of SPEEDS) {
      const f = solveFraming(sp, v), at = (s: number) => Math.abs(framePx(f, v, s, 0, 1).y - framePx(f, v, s, 0, 0).y);
      expect(at(2.5 * sp), `${name} @ ${sp}`).toBeGreaterThanOrEqual(20);
      expect(at(1.0 * sp), `${name} @ ${sp}: nearer is bigger`).toBeGreaterThan(at(2.5 * sp));
    }
  });
  it('grind edges ≥ 2.5 px across the stripe and coins ≥ 12 px, on the HUD line (the farthest readable ground) and nearer', () => {
    for (const [name, v] of ALL) {
      const rig = createCameraRig() as Rig;
      rig.update(frame(160, 9601, v));
      const f = rig.last, k = coinFloorOf(solveFraming(10.5, v), v);
      expect(buildOptionsFor(v).edgeHalfW, 'perspective builds the physical stripe').toBeCloseTo(0.035, 6);
      const hud = groundAt(f, f.xCentre, (f.anchorY - f.hudTop) * f.tanH);
      const DEG = Math.PI / 180, cosT = Math.cos(f.pitchDeg * DEG), cosP = Math.cos(f.yawDeg * DEG), sinP = Math.sin(f.yawDeg * DEG);
      for (const s of [hud.s, hud.s / 2, 0, -1]) for (const x0 of [-4.3, 0, 4.3]) {
        // The stripe as the lit material widens it at its own view depth (camera.ts edgeHalfAt / materials VERT_EDGE).
        const depth = f.D + s * cosT * cosP - x0 * cosT * sinP, half = edgeHalfAt(f, v, depth).cream, w = 2 * half;
        const a = rig.project({ s, x: x0 - w / 2, y: 0 }), b = rig.project({ s, x: x0 + w / 2, y: 0 });
        const t = rig.project({ s: s + 1, x: x0 - w / 2, y: 0 }), tl = Math.hypot(t.x - a.x, t.y - a.y);
        const px = Math.abs((b.x - a.x) * (t.y - a.y) - (b.y - a.y) * (t.x - a.x)) / tl;
        expect(px, `${name} s ${s.toFixed(1)} x ${x0}: edge ${px.toFixed(2)} px`).toBeGreaterThanOrEqual(CAMERA.minEdgePx - 0.05);
        // Constant on screen where the floor widens it: never fat near the skater (≤ 4 px; pre-@cam near edges reached
        // 4.5). Where the physical 7 cm is wider (a tablet up close), the physical width stays.
        if (half > 0.035 + 1e-9) expect(px, `${name} s ${s.toFixed(1)} x ${x0}: edge ${px.toFixed(2)} px`).toBeLessThanOrEqual(4);
        // A coin (0.32 m) floored per depth (view.ts coinFloorOf / layers.ts COIN_DEPTH_K), measured across x.
        const d = 0.32 * Math.max(1, k * depth);
        const c0 = rig.project({ s, x: x0 - d / 2, y: 0.4 }), c1 = rig.project({ s, x: x0 + d / 2, y: 0.4 });
        expect(Math.hypot(c1.x - c0.x, c1.y - c0.y) / cosP, `${name} coin s ${s.toFixed(1)} x ${x0}`).toBeGreaterThanOrEqual(CAMERA.minCoinPx - 0.1);
      }
    }
  });
  it('the resting thumb (bottom 22%) never covers the skater: the board and the skater stand above the band', () => {
    for (const [name, v] of PHONES) {
      const rig = createCameraRig() as Rig;
      rig.update(frame(160, 9601, v));
      for (const y of [0, 0.75, 1.5]) for (const ds of [-0.4, 0.4]) {
        expect(rig.project({ s: ds, x: 0, y }).y / v.hCss, `${name} y ${y}`).toBeLessThan(0.78);
      }
    }
  });
  it('the top of the screen stays inside the chunk window (≥ 92 m built ahead) at every viewport and speed', () => {
    const built = CHUNK_LEN * CHUNK_WINDOW.ahead - 4;
    for (const [name, v] of ALL) for (const sp of SPEEDS) {
      const f = solveFraming(sp, v), half = (v.aspect * f.tanH) / 2;
      for (const u of [f.xCentre - half, f.xCentre, f.xCentre + half]) {
        expect(groundAt(f, u, f.anchorY * f.tanH, 400).s, `${name} @ ${sp}`).toBeLessThan(built - CHUNK_LEN / 2);
      }
    }
  });
});

describe('yaw and rotate rules', () => {
  it('ψ = 9° for every portrait screen row (aspect ≤ 0.75)', () => {
    for (const [, v] of PHONES) expect(solveFraming(7, v).yawDeg).toBe(9);
    expect(solveFraming(7, vp(768, 1024)).yawDeg).toBe(9);
  });
  it('ψ = 30° at aspect ≥ 1.25, linear in between', () => {
    expect(solveFraming(7, vp(1280, 800, 0, 0, false)).yawDeg).toBe(30);
    expect(solveFraming(7, vp(1000, 1000, 0, 0, false)).yawDeg).toBeCloseTo(19.5, 9);
  });
  it('rotate card for a coarse-pointer phone in landscape only', () => {
    expect(solveFraming(7, vp(844, 390, 0, 0, true)).rotate).toBe(true);
    expect(solveFraming(7, vp(844, 390, 0, 0, false)).rotate).toBe(false);
    expect(solveFraming(7, vp(1280, 800, 0, 0, true)).rotate).toBe(false);
    expect(solveFraming(7, vp(390, 844)).rotate).toBe(false);
  });
});

describe('camera rig', () => {
  it('D only grows within a run and keeps the look-ahead guarantee while easing', () => {
    const rig = createCameraRig() as Rig;
    const v = vp(390, 664);
    let last = 0;
    for (let tick = 0; tick <= 60 * 200; tick += 6) {
      rig.update(frame(tick / 60, tick, v, 0.1));
      expect(rig.last.D).toBeGreaterThanOrEqual(last - 1e-9);
      expect(rig.last.lookAheadSec).toBeGreaterThanOrEqual(LOOKAHEAD_MIN);
      last = rig.last.D;
    }
  });
  it('eases on game time: large manual steps rendered with dt = 0 keep the look-ahead guarantee', () => {
    // __skate.step(n) renders once through renderNow (dt 0) after n ticks; real time barely passes.
    for (const v of [vp(390, 844), vp(390, 664), vp(375, 548), vp(1280, 800, 0, 0, false)]) {
      const rig = createCameraRig() as Rig;
      for (const tick of [1, 120, 600, 1800, 3600, 5400, 7200, 9000, 12600]) {
        rig.update(frame(tick / 60, tick, v, 0));
        expect(rig.last.lookAheadSec, `${v.wCss}×${v.hCss} tick ${tick}`).toBeGreaterThanOrEqual(LOOKAHEAD_MIN);
      }
    }
  });
  it('projects the skater ground point to 74% from the top; the corridor + margin fills the width behind it', () => {
    const rig = createCameraRig() as Rig;
    const v = vp(390, 844);
    rig.update(frame(5, 300, v));
    expect(rig.project({ s: 0, x: 0, y: 0 }).y / 844).toBeCloseTo(0.74, 3);
    // Width-bound: the near corners of the required region (s − 1.5, x ± 4.8) span most of the width, on screen.
    const l = rig.project({ s: -CAMERA.behind, x: -4.8, y: 0 }), r = rig.project({ s: -CAMERA.behind, x: 4.8, y: 0 });
    expect(Math.min(l.x, r.x)).toBeGreaterThanOrEqual(-0.5);
    expect(Math.max(l.x, r.x)).toBeLessThanOrEqual(390.5);
    expect(Math.max(l.x, r.x) - Math.min(l.x, r.x)).toBeGreaterThan(330);
  });
  it('no roll: a vertical at the skater stays vertical on screen', () => {
    const rig = createCameraRig() as Rig;
    rig.update(frame(160, 9601, vp(390, 844)));
    const a = rig.project({ s: 0, x: 0, y: 0 }), b = rig.project({ s: 0, x: 0, y: 2 });
    expect(Math.abs(b.x - a.x)).toBeLessThan(0.5);
  });
});
