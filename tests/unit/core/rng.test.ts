import { describe, expect, it } from 'vitest';
import { hash32, Sfc32, streamSeed } from '../../../src/core/rng';

describe('hash32', () => {
  it('is a deterministic uint32 that depends on every input and its order', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1));
    expect(hash32(1, 2)).not.toBe(hash32(1, 2, 0));
    for (const v of [hash32(), hash32(0), hash32(-1), hash32(0xffffffff, 7)]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
  });
  it('golden values (changing these changes every generated street)', () => {
    expect([hash32(0), hash32(1), hash32(1, 0, 0), hash32(12345, 6, 2)]).toMatchInlineSnapshot(`
      [
        3946461486,
        2421920776,
        2261504946,
        415933520,
      ]
    `);
  });
  it('separates streams', () => {
    const set = new Set(['layout', 'coins', 'decor', 'movers'].map((k) => streamSeed(42, 3, k as 'layout')));
    expect(set.size).toBe(4);
  });
});

describe('Sfc32', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = new Sfc32(1), b = new Sfc32(1), c = new Sfc32(2);
    const sa = Array.from({ length: 8 }, () => a.next());
    const sb = Array.from({ length: 8 }, () => b.next());
    const sc = Array.from({ length: 8 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });
  it('golden sequence for seed 1', () => {
    const r = new Sfc32(1);
    expect(Array.from({ length: 4 }, () => r.next())).toMatchInlineSnapshot(`
      [
        527674366,
        3325065232,
        575049627,
        2889462986,
      ]
    `);
  });
  it('float/range/int/chance stay in range', () => {
    const r = new Sfc32(7);
    for (let i = 0; i < 5000; i++) {
      const f = r.float(); expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(1);
      const x = r.range(-2, 3); expect(x).toBeGreaterThanOrEqual(-2); expect(x).toBeLessThan(3);
      const n = r.int(1, 6); expect(Number.isInteger(n)).toBe(true); expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(6);
      expect(typeof r.chance(0.5)).toBe('boolean');
    }
  });
  it('int covers both ends and is roughly uniform', () => {
    const r = new Sfc32(99);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60000; i++) counts[r.int(0, 5)]!++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(500);
  });
  it('pick and weighted respect the inputs', () => {
    const r = new Sfc32(3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(r.pick(['a', 'b', 'c']));
    expect(seen).toEqual(new Set(['a', 'b', 'c']));
    let heavy = 0;
    for (let i = 0; i < 10000; i++) if (r.weighted([['x', 9], ['y', 1], ['z', 0]] as const) === 'x') heavy++;
    expect(heavy / 10000).toBeGreaterThan(0.87);
    expect(heavy / 10000).toBeLessThan(0.93);
    for (let i = 0; i < 1000; i++) expect(r.weighted([['x', 1], ['z', 0]] as const)).toBe('x');
  });
  it('getState/setState round-trips the stream', () => {
    const r = new Sfc32(5);
    r.next(); r.next();
    const st = r.getState();
    const after = [r.next(), r.next(), r.next()];
    const q = new Sfc32(0);
    q.setState(st);
    expect([q.next(), q.next(), q.next()]).toEqual(after);
    expect(structuredClone(st)).toEqual(st);
  });
});
