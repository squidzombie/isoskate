// Kit primitives (world/render/writer.ts): every triangle faces outward (its stored normal agrees with its winding
// and points away from the primitive's centre), mirrored frames keep that, the x-ray split and the s clip work.
import { describe, expect, it } from 'vitest';
import { GeoWriter, Kit, FACE } from '../../../src/world/render/writer';
import { GeoPool, type PooledGeo } from '../../../src/world/render/pools';

function kit() {
  const pool = new GeoPool(64);
  const w = { o: new GeoWriter(), x: new GeoWriter(), e: new GeoWriter(), g: new GeoWriter(), b: new GeoWriter() };
  for (const k of Object.values(w)) k.begin(pool.acquire());
  const K = new Kit(w).chunk(0).frame(0, 0, 0).reset().col(0x808080);
  return { K, w, end: () => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v.end()])) as Record<string, PooledGeo> };
}
/** Checks winding vs stored normal and outwardness vs `c` (chunk-local centre). Returns the triangle count. */
function outward(g: PooledGeo, c: [number, number, number], allowFlat = false): number {
  let n = 0;
  for (let t = 0; t < g.count; t += 3) {
    const P = (k: number) => [g.pos[(t + k) * 3]!, g.pos[(t + k) * 3 + 1]!, g.pos[(t + k) * 3 + 2]!];
    const [a, b, cc] = [P(0), P(1), P(2)];
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], v = [cc[0]! - a[0]!, cc[1]! - a[1]!, cc[2]! - a[2]!];
    const wn = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const sn = [g.nrm[t * 3]!, g.nrm[t * 3 + 1]!, g.nrm[t * 3 + 2]!];
    expect(wn[0]! * sn[0]! + wn[1]! * sn[1]! + wn[2]! * sn[2]!).toBeGreaterThan(0);
    const m = [(a[0]! + b[0]! + cc[0]!) / 3 - c[0], (a[1]! + b[1]! + cc[1]!) / 3 - c[1], (a[2]! + b[2]! + cc[2]!) / 3 - c[2]];
    const d = m[0]! * sn[0]! + m[1]! * sn[1]! + m[2]! * sn[2]!;
    if (allowFlat) expect(d).toBeGreaterThanOrEqual(-1e-6); else expect(d).toBeGreaterThan(-1e-6);
    n++;
  }
  return n;
}

describe('Kit primitives face outward', () => {
  for (const mirror of [false, true]) {
    for (const yaw of [0, Math.PI / 2, 0.7]) {
      it(`box, chamfer, cyl, frustum, cone, hcyl, sphere, bar (mirror ${mirror}, yaw ${yaw.toFixed(2)})`, () => {
        const { K, end } = kit();
        K.frame(1, 0, 5, yaw, mirror);
        // Each primitive centred at prop (0, 0.5, 0) → chunk (1, 0.5, −5).
        const cases: [string, () => void][] = [
          ['box', () => K.box(-0.5, 0, -0.5, 0.5, 1, 0.5, FACE.all)],
          ['chamfer', () => K.chamfer(-0.5, 0, -0.5, 0.5, 1, 0.5, 0.1)],
          ['cyl', () => K.cyl(0, 0, 0, 1, 0.4, 8)],
          ['frustum', () => K.frustum(0, 0, 0, 1, 0.5, 0.3, 7)],
          ['cone', () => K.frustum(0, 0, 0, 1, 0.5, 0, 6)],
          ['hcyl s', () => K.hcyl('s', 0, 0.5, 0, -0.5, 0.5, 0.3, 6)],
          ['hcyl x', () => K.hcyl('x', 0, 0.5, 0, -0.5, 0.5, 0.3, 6)],
          ['sphere', () => K.sphere(0, 0.5, 0, 0.5, 7, 5)],
          ['bar', () => K.bar(-0.5, 0.5, -0.3, 0.5, 0.5, 0.3, 0.05)],
        ];
        for (const [, draw] of cases) draw();
        const g = end();
        expect(outward(g.o!, [1, 0.5, -5])).toBeGreaterThan(100);
      });
    }
  }
});

describe('Kit splits and clips', () => {
  it('capY sends the part of a box above the cap to the x-ray target', () => {
    const { K, end } = kit();
    K.capY = 1.6;
    K.box(-0.3, 0, 0, 0.3, 2.4, 0.6);
    K.cyl(2, 0, 0, 2.0, 0.3, 6);
    const g = end();
    expect(g.x!.count).toBeGreaterThan(0);
    let maxO = -Infinity, minX = Infinity;
    for (let i = 0; i < g.o!.count; i++) maxO = Math.max(maxO, g.o!.pos[i * 3 + 1]!);
    for (let i = 0; i < g.x!.count; i++) minX = Math.min(minX, g.x!.pos[i * 3 + 1]!);
    expect(maxO).toBeCloseTo(1.6, 6);
    expect(minX).toBeCloseTo(1.6, 6);
  });
  it('clip keeps boxes and beams inside [clip0, clip1) along s', () => {
    const { K, end } = kit();
    K.chunk(32).frame(0, 0, 20);
    K.clip0 = 32; K.clip1 = 64;
    K.box(-0.3, 0, 0, 0.3, 0.5, 30);
    K.beam(0, 0.5, 0, 0, 0.5, 60, 0.03, -0.02, 0.01);
    const g = end();
    for (let i = 0; i < g.o!.count; i++) {
      const s = 32 - g.o!.pos[i * 3 + 2]!;
      expect(s).toBeGreaterThanOrEqual(32 - 1e-6);
      expect(s).toBeLessThanOrEqual(64 + 1e-6);
    }
  });
});
