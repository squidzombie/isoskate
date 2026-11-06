// WA (W2a) vfx/: the particle ring buffer (cap per quality tier, oldest overwritten, look-ahead alpha cap) and the
// bank-timer arc / perfect ring (hidden through their materials so their geometry is registered from the first frame).
import type { MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { GfxContext } from '../../../src/core/view';
import { Particles, SHAPE, type Spawn } from '../../../src/vfx/particles';
import { Rings } from '../../../src/vfx/rings';
import { VFX } from '../../../src/vfx/vfx.config';

const ctx = {} as GfxContext;   // Particles only keys the shared uniforms by the context object
const puff = (s: number, life = 1, alpha = 0.6): Spawn => ({ s, x: 0, y: 0.5, vs: 0, vx: 0, vy: 0, life, size: 0.2, color: 0xffffff, alpha, shape: SHAPE.puff });
type Internals = { aCol: Float32Array; aPos: Float32Array; geo: { instanceCount: number } };

describe('particles', () => {
  it('a ring buffer: never more than the cap alive, the oldest slot is overwritten when full', () => {
    const p = new Particles(ctx, 8);
    for (let i = 0; i < 20; i++) p.spawn(puff(i));
    expect(p.alive).toBe(8);
    p.update(0.01, 0, () => 1);
    const g = p as unknown as Internals;
    expect(g.geo.instanceCount).toBe(8);
    // The survivors are the last 8 spawned (s = 12 … 19); track z = −(s − origin).
    const zs = Array.from({ length: 8 }, (_, k) => -g.aPos[k * 3 + 2]!).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(12, 5);
    expect(zs[7]).toBeCloseTo(19, 5);
  });

  it('the quality cap shrinks the live set; particles die at the end of their life', () => {
    const p = new Particles(ctx, 300);
    p.setCap(VFX.cap.low);
    for (let i = 0; i < 400; i++) p.spawn(puff(i, 0.3));
    expect(p.alive).toBe(VFX.cap.low);
    p.update(0.2, 0, () => 1);
    expect(p.alive).toBe(VFX.cap.low);
    p.update(0.2, 0, () => 1);
    expect(p.alive).toBe(0);
    expect((p as unknown as Internals).geo.instanceCount).toBe(0);
  });

  it('the look-ahead alpha cap limits every particle in that zone (DESIGN §18.4: ≤ 25%)', () => {
    const p = new Particles(ctx, 16);
    for (let i = 0; i < 10; i++) p.spawn(puff(i * 3, 2, 0.9));
    p.update(0.01, 0, (s) => (s > 10 ? VFX.lookAheadAlpha : 1));
    const g = p as unknown as Internals;
    for (let k = 0; k < g.geo.instanceCount; k++) {
      const s = -g.aPos[k * 3 + 2]!, a = g.aCol[k * 4 + 3]!;
      if (s > 10) expect(a).toBeLessThanOrEqual(VFX.lookAheadAlpha + 1e-6);
      else expect(a).toBeGreaterThan(VFX.lookAheadAlpha);
    }
  });
});

describe('rings', () => {
  it('bank arc: shown while a combo banks, hidden through its material (the mesh stays registered)', () => {
    const r = new Rings();
    const mat = r.arc.material as MeshBasicMaterial;
    expect(r.arc.visible).toBe(true);
    expect(mat.visible).toBe(false);
    r.updateArc(true, 1.2, 0, 0, 0, 1 / 60);
    expect(mat.visible).toBe(true);
    const cream = mat.color.clone();
    r.updateArc(true, 0.1, 0, 0, 0, 1 / 60);          // nearly expired: toward coral
    expect(mat.color.equals(cream)).toBe(false);
    r.updateArc(false, 0, 0, 0, 0, 1 / 60);
    expect(mat.visible).toBe(false);
    expect(r.arc.visible).toBe(true);
  });

  it('perfect ring: grows and fades over its life, then hides', () => {
    const r = new Rings();
    const mat = r.perfect.material as MeshBasicMaterial;
    r.triggerPerfect();
    r.updatePerfect(0, 0, 0, 0.05);
    expect(mat.visible).toBe(true);
    const s0 = r.perfect.scale.x, a0 = mat.opacity;
    r.updatePerfect(0, 0, 0, 0.1);
    expect(r.perfect.scale.x).toBeGreaterThan(s0);
    expect(mat.opacity).toBeLessThan(a0);
    r.updatePerfect(0, 0, 0, VFX.perfectRing.life);
    expect(mat.visible).toBe(false);
  });
});
