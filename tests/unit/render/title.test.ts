// The Title's space scene (world/render/title/): the floating board spins at a constant rate (owner direction: no
// easing, no lingering on a face) and keeps that speed into the dive; the construction bakes nothing (boot never waits
// on the Earth maps), the bake lands preview → clouds → colour, each in its own slices; the cloud map stores the field
// before its threshold, so a coarse map still magnifies into soft clouds.
import { describe, expect, it } from 'vitest';
import type { Viewport } from '../../../src/core/view';
import { CLOUD_EDGE, EarthBaker } from '../../../src/world/render/title/earthTexture';
import { TITLE_SCENE, TitleScene } from '../../../src/world/render/title/space';

const vp: Viewport = { wCss: 390, hCss: 844, dpr: 2, aspect: 390 / 844, safeTop: 0, safeBottom: 0, coarse: true } as Viewport;
const TAU = 2 * Math.PI;
const spinOf = (s: TitleScene) => s.boardSlot.parent!.rotation.y;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
type Diving = { beginDive(): void; spaceDive(u: number): void };

describe('TitleScene', () => {
  it('the board spins at one constant angular speed (equal steps, equal turns), one turn per spinSec', () => {
    const s = new TitleScene();
    const dt = 1 / 30, w = TAU / TITLE_SCENE.board.spinSec;
    s.update(dt, vp);
    let prev = spinOf(s);
    for (let i = 0; i < 30 * 12; i++) {                     // more than a full turn, through every face
      s.update(dt, vp);
      const th = spinOf(s);
      expect(wrap(th - prev)).toBeCloseTo(w * dt, 9);
      prev = th;
    }
  });
  it('the angular velocity is the same at every phase of a full turn, whatever the frame times (no easing, no linger)', () => {
    const s = new TitleScene();
    const w = TAU / TITLE_SCENE.board.spinSec;
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
    s.update(1 / 60, vp);
    let prev = spinOf(s), turned = 0, n = 0;
    const rates: number[] = [];
    while (turned < TAU * 1.05) {                           // a full turn and a bit, in uneven frames (8–50 ms)
      const dt = 0.008 + 0.042 * rnd();
      s.update(dt, vp);
      const th = spinOf(s), step = wrap(th - prev);
      rates.push(step / dt); turned += step; prev = th; n++;
    }
    expect(n).toBeGreaterThan(200);
    for (const r of rates) expect(r).toBeCloseTo(w, 6);     // rad/s at every phase: the graphic face, edge-on, the back
    expect(Math.max(...rates) - Math.min(...rates)).toBeLessThan(1e-6);
  });
  it('the dive keeps the spin going at the tap (no stop), its tumble adds on top', () => {
    const s = new TitleScene(), d = s as unknown as Diving;
    const dt = 1 / 60, w = TAU / TITLE_SCENE.board.spinSec;
    for (let i = 0; i < 40; i++) s.update(dt, vp);
    const before = spinOf(s);
    d.beginDive();
    s.update(dt, vp);
    const u = dt / 0.7;
    d.spaceDive(u);
    expect(wrap(spinOf(s) - before)).toBeCloseTo(w * dt + 7 * u * u, 9);
  });
  it('constructs without baking; the bake lands the preview, then the full clouds, then the full colour', () => {
    let step: ((budgetMs: number) => boolean) | null = null;
    const s = new TitleScene();
    expect(s.bake.slices).toBe(0);
    expect(s.bake.previewAt).toBe(-1);
    s.startBake(() => true, (f) => { step = f; });
    let n = 0;
    while (!step!(3) && n < 100_000) n++;
    const b = s.bake;
    expect(b.done).toBe(true);
    expect(b.previewAt).toBeGreaterThan(0);
    expect(b.cloudsAt).toBeGreaterThanOrEqual(b.previewAt);
    expect(b.uploadedAt).toBeGreaterThanOrEqual(b.cloudsAt);
    expect(b.slices).toBeGreaterThan(20);                  // sliced, not one block
  });
  it('the bake holds while the space backdrop is not drawn', () => {
    let step: ((budgetMs: number) => boolean) | null = null;
    const s = new TitleScene();
    s.startBake(() => false, (f) => { step = f; });
    for (let i = 0; i < 50; i++) step!(3);
    expect(s.bake.slices).toBe(0);
  });
});

describe('EarthBaker', () => {
  it('stores the cloud field before its threshold: soft values across the edge, a plausible cover', () => {
    const b = new EarthBaker({ cloudW: 128, cloudH: 64, w: 64, h: 32, puff: 16, city: [0, 0, 1] });
    b.bakeAll();
    const lo = CLOUD_EDGE[0] * 255, hi = CLOUD_EDGE[1] * 255;
    let edge = 0, cover = 0;
    for (const v of b.clouds) { if (v > lo && v < hi) edge++; if (v >= (lo + hi) / 2) cover++; }
    expect(edge / b.clouds.length).toBeGreaterThan(0.2);   // not a binary mask
    expect(cover / b.clouds.length).toBeGreaterThan(0.1);
    expect(cover / b.clouds.length).toBeLessThan(0.75);
  });
  it('bakes the clouds first, then the wash noise, then the colour', () => {
    const b = new EarthBaker({ cloudW: 64, cloudH: 32, w: 64, h: 32, puff: 16, city: [0, 0, 1] });
    const order: string[] = [];
    let t = 0;
    while (!b.done) {
      b.step(0.5, () => (t += 0.1));
      if (b.cloudsDone && !order.includes('clouds')) order.push('clouds');
      if (b.puffDone && !order.includes('puff')) order.push('puff');
      if (b.colorDone && !order.includes('color')) order.push('color');
    }
    expect(order).toEqual(['clouds', 'puff', 'color']);
  });
});
