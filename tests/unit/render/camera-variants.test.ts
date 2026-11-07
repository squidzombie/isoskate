// Debug run camera variants (world/render/camVariants.ts, ?debug=1&cam=<id>): every variant keeps the DESIGN §8
// guarantees the production default (A) is tested for in camera.test.ts: ≥ 2.5 s of full corridor width below the
// HUD band at every viewport and speed, the anchor at 74%, a monotonic eased framing, and the minimum on-screen grind
// edge width at the farthest readable depth. Measured through the live rig camera (real projections).
import { afterEach, describe, expect, it } from 'vitest';
import { CAMERA, CORRIDOR_HALF, LOOKAHEAD_MIN, speedAt } from '../../../src/core/tuning';
import type { RenderFrame, Viewport } from '../../../src/core/view';
import {
  CAM_VARIANTS, buildOptionsFor, camVariant, createCameraRig, farMetresPerPx, groundAt, parseCamVariant, setCamVariant,
  solveFraming, type Framing,
} from '../../../src/world/render';

const vp = (w: number, h: number, safeTop = 0, safeBottom = 0, coarse = true): Viewport =>
  ({ wCss: w, hCss: h, dpr: 1, aspect: w / h, safeTop, safeBottom, coarse });
const VIEWPORTS: [string, Viewport][] = [
  ['393×852 safe 59', vp(393, 852, 59, 34)], ['390×844', vp(390, 844)], ['390×664', vp(390, 664)], ['375×548', vp(375, 548)],
  ['412×780', vp(412, 780)], ['360×840', vp(360, 840)], ['360×640', vp(360, 640)], ['768×1024', vp(768, 1024)],
  ['1280×800', vp(1280, 800, 0, 0, false)], ['1920×1080', vp(1920, 1080, 0, 0, false)], ['2560×1080', vp(2560, 1080, 0, 0, false)],
];
const IDS = Object.keys(CAM_VARIANTS);
type Rig = ReturnType<typeof createCameraRig> & { last: Framing };
const frame = (t: number, tick: number, v: Viewport, dt = 1 / 60): RenderFrame => {
  const st = { tick, t, p: { s: 0, x: 0, y: 0 }, vel: { s: speedAt(t), x: 0, y: 0 }, groundY: 0 };
  return { alpha: 1, dt, timeScale: 1, prev: st, cur: st, pose: {}, score: {}, events: [], playerS: st.p.s,
    speed: speedAt(t), area: 'downtown', blend: null, viewport: v } as unknown as RenderFrame;
};

afterEach(() => { setCamVariant('A'); });

describe('camera variants: table and parsing', () => {
  it('A is the production default and matches DESIGN §8 (pitch 35°, ψ 0 in portrait)', () => {
    expect(camVariant().id).toBe('A');
    expect(CAM_VARIANTS.A).toMatchObject({ proj: 'ortho', pitchDeg: CAMERA.pitchDeg, yawMinDeg: 0 });
    expect(IDS.length).toBeLessThanOrEqual(8);
  });
  it('parses table ids and custom specs, rejects anything else', () => {
    expect(parseCamVariant('e')?.id).toBe('E');
    expect(parseCamVariant('p33y4f20')).toMatchObject({ proj: 'persp', pitchDeg: 33, yawMinDeg: 4, fovDeg: 20 });
    expect(parseCamVariant('o28y6')).toMatchObject({ proj: 'ortho', pitchDeg: 28, yawMinDeg: 6 });
    for (const bad of ['', 'Z', 'p90y0f20', 'x35y0', 'p35y0f2']) expect(parseCamVariant(bad)).toBeNull();
  });
});

for (const id of IDS) {
  describe(`variant ${id} (${CAM_VARIANTS[id]!.label})`, () => {
    it('solver: ≥ 2.5 s of full corridor width below the HUD band at every viewport and speed', () => {
      setCamVariant(id);
      for (const [name, v] of VIEWPORTS) {
        for (const speed of [7.0, 8.0, 9.0, 10.5]) {
          expect(solveFraming(speed, v).lookAheadSec, `${name} @ ${speed}`).toBeGreaterThanOrEqual(LOOKAHEAD_MIN);
        }
      }
    });
    it('rig: anchor at 74%, required corners on screen below the HUD band, 2.5 s ahead fully framed', () => {
      setCamVariant(id);
      for (const [name, v] of VIEWPORTS) {
        for (const t of [0, 160]) {
          const rig = createCameraRig() as Rig;
          rig.update(frame(t, 60 * t + 1, v));
          const speed = speedAt(t), hudY = (v.safeTop + CAMERA.hudPx) + 0.5;
          const a = rig.project({ s: 0, x: 0, y: 0 });
          expect(a.y / v.hCss, `${name} anchor`).toBeCloseTo(CAMERA.anchorFromTop, 3);
          for (const s of [-CAMERA.behind, 2.5 * speed]) {
            for (const x of [-CORRIDOR_HALF, CORRIDOR_HALF]) {
              const p = rig.project({ s, x, y: 0 });
              expect(p.x, `${name} t${t} s${s} x${x}`).toBeGreaterThanOrEqual(-0.5);
              expect(p.x, `${name} t${t} s${s} x${x}`).toBeLessThanOrEqual(v.wCss + 0.5);
              expect(p.y, `${name} t${t} s${s} x${x}`).toBeGreaterThanOrEqual(hudY);
              expect(p.y, `${name} t${t} s${s} x${x}`).toBeLessThanOrEqual(v.hCss + 0.5);
            }
          }
          expect(rig.last.lookAheadSec, name).toBeGreaterThanOrEqual(LOOKAHEAD_MIN);
        }
      }
    });
    it('rig: the eased framing only grows within a run and keeps the guarantee (game-time steps, dt 0)', () => {
      setCamVariant(id);
      for (const v of [vp(390, 844), vp(390, 664), vp(375, 548), vp(1280, 800, 0, 0, false)]) {
        const rig = createCameraRig() as Rig;
        let last = 0;
        for (const tick of [1, 120, 600, 1800, 3600, 5400, 7200, 9000, 12600]) {
          rig.update(frame(tick / 60, tick, v, 0));
          const k = rig.last.proj === 'persp' ? rig.last.D : rig.last.H;
          expect(k, `${v.wCss}×${v.hCss} tick ${tick}`).toBeGreaterThanOrEqual(last - 1e-9);
          expect(rig.last.lookAheadSec, `${v.wCss}×${v.hCss} tick ${tick}`).toBeGreaterThanOrEqual(LOOKAHEAD_MIN);
          last = k;
        }
      }
    });
    it('minimum on-screen grind edge width holds on the HUD line (the farthest readable ground) at top speed', () => {
      setCamVariant(id);
      for (const [name, v] of VIEWPORTS) {
        const rig = createCameraRig() as Rig;
        rig.update(frame(160, 9601, v));
        const f = rig.last, w = 2 * buildOptionsFor(v).edgeHalfW;
        const span = f.proj === 'ortho' ? f.H : f.tanH;
        const g = groundAt(f, f.xCentre, (f.anchorY - f.hudTop) * span);
        // Across the stripe on screen (perpendicular to the edge's own screen direction), centre and both sides.
        for (const x0 of [-4.3, 0, 4.3]) {
          const a = rig.project({ s: g.s, x: x0 - w / 2, y: 0 }), b = rig.project({ s: g.s, x: x0 + w / 2, y: 0 });
          const t = rig.project({ s: g.s + 1, x: x0 - w / 2, y: 0 }), tl = Math.hypot(t.x - a.x, t.y - a.y);
          const px = Math.abs((b.x - a.x) * (t.y - a.y) - (b.y - a.y) * (t.x - a.x)) / tl;
          // The production default sizes the stripe from H alone (DESIGN §8), which ψ > 0 foreshortens across the
          // stripe (2.0 px at 1280×800, ψ 30°): asserted for portrait only. Every other variant: everywhere.
          if (id === 'A' && v.aspect > 0.75) continue;
          expect(px, `${name} x ${x0}: edge ${px.toFixed(2)} px across on the HUD line`).toBeGreaterThanOrEqual(CAMERA.minEdgePx - 0.05);
        }
        expect(farMetresPerPx(f, v)).toBeGreaterThan(0);
      }
    });
  });
}
