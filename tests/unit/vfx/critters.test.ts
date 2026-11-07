// vfx/critters.ts (RECLAIM theme §4, §11; T4): side bands only, never in the top third, birds no lighter than the gull,
// no yellow, gold or white critter, a bounded pool, and the perched birds re-listed per frame.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, type InstancedBufferGeometry } from 'three';
import type { GfxContext } from '../../../src/core/view';
import { CRIT, Critters } from '../../../src/vfx/critters';
import { VFX } from '../../../src/vfx';
import { RECLAIM, relLum } from '../../../src/world/render/palette';

const ctx = {} as GfxContext;
const noCut = { x: 0, z: 0, w: 0 };
const count = (c: Critters) => (c.mesh.geometry as InstancedBufferGeometry).instanceCount;
/** A run-like camera: behind and above the skater at s = 0, pitched down 34°, looking up the street (−z). */
function runCam(): PerspectiveCamera {
  const cam = new PerspectiveCamera(24, 390 / 844, 0.5, 400);
  cam.position.set(0, 28, 42);
  cam.lookAt(0, 0, -6);
  cam.updateMatrixWorld();
  return cam;
}
const hsv = (hex: number) => {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const h = d === 0 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: mx ? d / mx : 0, v: mx };
};

describe('critters', () => {
  it('a wandering critter never crosses into the corridor (|x| ≥ 4.7)', () => {
    const c = new Critters(ctx);
    for (let i = 0; i < 20; i++) c.spawn({ s: i, x: i % 2 ? 4.8 : -4.8, y: 1, vs: 0, vx: i % 2 ? -3 : 3, vy: 0, life: 4, size: 0.2, shape: CRIT.butterfly, color: 0xb79ad8, alpha: 1, wander: 1 });
    const pos = c.mesh.geometry.getAttribute('aPos').array as Float32Array;
    for (let f = 0; f < 120; f++) {
      c.update(1 / 60, f / 60, 0, null, noCut);
      for (let k = 0; k < count(c); k++) expect(Math.abs(pos[k * 3]!)).toBeGreaterThanOrEqual(4.7 - 1e-6);
    }
  });
  it('the top third of the screen hides critters (and the perched birds); near the skater they show', () => {
    const c = new Critters(ctx), cam = runCam();
    c.perched(2, -4.8, 1.2, 0.3, 0x8a7a6a, 1);          // beside the skater: shows
    c.update(1 / 60, 0, 0, cam, noCut);
    expect(count(c)).toBe(1);
    c.perched(60, -4.8, 6.2, 0.3, 0x8a7a6a, 1);         // far up the street on a wire: the top third
    c.update(1 / 60, 0, 0, cam, noCut);
    expect(count(c)).toBe(0);
    c.update(1 / 60, 0, 0, cam, noCut);                  // re-listed per frame: nothing left over
    expect(count(c)).toBe(0);
  });
  it('the camera-side cut plane hides a +x critter that would stand over the corridor on screen', () => {
    const c = new Critters(ctx);
    c.perched(2, 5.0, 3.0, 0.3, 0x8a7a6a, 1);
    c.update(1 / 60, 0, 0, runCam(), { x: 4.6, z: 1, w: 1 });
    expect(count(c)).toBe(0);
  });
  it('the pool is bounded and reuses free slots first', () => {
    const c = new Critters(ctx, 8);
    for (let i = 0; i < 30; i++) c.spawn({ s: 0, x: 5, y: 1, vs: 0, vx: 0, vy: 0, life: 1, size: 0.1, shape: CRIT.seed, color: RECLAIM.seeds, alpha: 0.35 });
    expect(c.alive).toBe(8);
    c.update(2, 0, 0, null, noCut);
    expect(c.alive).toBe(0);
  });
  it('colours: never yellow-gold or white; birds no lighter than the gull #A6A3A8; seeds ≤ 35% alpha', () => {
    const K = VFX.critters;
    const all = [...K.bird.color, ...K.butterfly, K.seed, K.moth, K.dragonfly];
    for (const c of all) {
      const { h, s, v } = hsv(c);
      expect(h >= 38 && h <= 66 && s > 0.35, `#${c.toString(16)} gold`).toBe(false);
      expect(s < 0.12 && v > 0.85, `#${c.toString(16)} white`).toBe(false);
    }
    for (const c of K.bird.color) expect(relLum(c)).toBeLessThanOrEqual(relLum(RECLAIM.animalMax) + 1e-9);
    expect(K.seedAlpha).toBeLessThanOrEqual(0.35);
    expect(K.cap + K.dripsMax).toBeLessThanOrEqual(70);
    for (const c of VFX.ambient.leaf) expect(hsv(c).h >= 38 && hsv(c).h <= 66 && hsv(c).s > 0.35, `leaf #${c.toString(16)}`).toBe(false);
  });
});
