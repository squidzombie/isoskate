import { describe, expect, it } from 'vitest';
import { sAt, speedAt, tAt, V_MAX, V_START } from '../../../src/core/tuning';

describe('speed schedule (TECH §6.2, ROADMAP G0)', () => {
  it('holds 7.0 m/s up to t = 20', () => {
    expect(speedAt(0)).toBe(V_START);
    expect(speedAt(10)).toBe(7.0);
    expect(speedAt(20)).toBe(7.0);
  });
  it('is 8.99 ± 0.05 at t = 90 (closed form 7 + 3.5·smoothstep = 8.9516)', () => {
    // ROADMAP G0 / DESIGN §11 print 8.99; the frozen formula (and every other DESIGN table: s(90) = 682,
    // 8.7 at 1:23, 10.1 at 2:02) gives 8.9516. See docs/core-requests.md, INT (M0-core) fixes.
    expect(speedAt(90)).toBeCloseTo(8.99, 1);
    expect(speedAt(90)).toBeCloseTo(8.9516, 3);
  });
  it('is 10.5 for t ≥ 150 and never exceeds it', () => {
    expect(speedAt(150)).toBe(V_MAX);
    expect(speedAt(151)).toBe(10.5);
    expect(speedAt(3600)).toBe(10.5);
  });
  it('is monotone non-decreasing', () => {
    let prev = speedAt(0);
    for (let t = 0; t <= 200; t += 0.05) {
      const v = speedAt(t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });
  it('matches the DESIGN §5.1 distance examples', () => {
    expect(sAt(8)).toBeCloseTo(56, 6);
    expect(sAt(45)).toBeCloseTo(318, 0);
    expect(sAt(60)).toBeCloseTo(431, 0);
    expect(sAt(90)).toBeCloseTo(682, 0);
    expect(sAt(150)).toBeCloseTo(1277.5, 6);
    expect(sAt(165)).toBeCloseTo(1435, 6);
  });
  it('sAt is the integral of speedAt (numerical check)', () => {
    let s = 0;
    const h = 0.001;
    for (let t = 0; t < 200; t += h) s += speedAt(t + h / 2) * h;
    expect(s).toBeCloseTo(sAt(200), 2);
  });
  it('tAt inverts sAt within 1e-6 everywhere', () => {
    for (let t = 0; t <= 400; t += 0.37) expect(Math.abs(tAt(sAt(t)) - t)).toBeLessThan(1e-6);
    for (const t of [20, 20.0001, 85, 149.9999, 150]) expect(Math.abs(tAt(sAt(t)) - t)).toBeLessThan(1e-6);
  });
});
