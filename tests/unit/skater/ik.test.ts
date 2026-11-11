import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { flexForReach, frameAlong, reachForFlex, solveTwoBone } from '../../../src/skater/ik';

describe('2-bone IK', () => {
  it('reaches reachable targets exactly, with the segment lengths kept', () => {
    const root = new Vector3(0, 1, 0), mid = new Vector3(), end = new Vector3();
    for (const t of [[0.1, 0.35, 0.2], [0.3, 0.6, -0.1], [-0.2, 0.4, 0.05], [0, 0.4, 0.1]]) {
      const target = new Vector3(...(t as [number, number, number]));
      const r = solveTwoBone(root, target, new Vector3(1, 0, 0), 0.36, 0.34, mid, end);
      expect(r.clamped).toBe(false);
      expect(end.distanceTo(target)).toBeLessThan(1e-6);
      expect(mid.distanceTo(root)).toBeCloseTo(0.36, 6);
      expect(mid.distanceTo(end)).toBeCloseTo(0.34, 6);
      expect(mid.x).toBeGreaterThan(Math.min(root.x, target.x) - 1e-9);    // bends toward the pole (+x)
    }
  });
  it('clamps unreachable targets along the line and reports it', () => {
    const root = new Vector3(), mid = new Vector3(), end = new Vector3();
    const r = solveTwoBone(root, new Vector3(0, -2, 0), new Vector3(1, 0, 0), 0.36, 0.34, mid, end);
    expect(r.clamped).toBe(true);
    expect(end.length()).toBeCloseTo(0.7, 3);
    expect(end.y).toBeLessThan(0);
  });
  it('flex and reach are inverse', () => {
    for (const deg of [0.5, 15, 55, 85, 120]) expect(flexForReach(0.36, 0.34, reachForFlex(0.36, 0.34, deg))).toBeCloseTo(deg, 4);
    expect(reachForFlex(0.36, 0.34, 0)).toBeCloseTo(0.7, 6);
  });
  it('frameAlong points local −y along the direction with +x toward the pole', () => {
    const q = new Quaternion(), dir = new Vector3(0.3, -1, 0.2).normalize(), fwd = new Vector3(1, 0, 0);
    frameAlong(dir, fwd, q);
    expect(new Vector3(0, -1, 0).applyQuaternion(q).distanceTo(dir)).toBeLessThan(1e-6);
    const x = new Vector3(1, 0, 0).applyQuaternion(q);
    expect(x.dot(dir)).toBeCloseTo(0, 6);
    expect(x.dot(fwd)).toBeGreaterThan(0.9);
  });
});
