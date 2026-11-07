// world/render/title/noise.ts: a small seeded 3D value noise and fbm for the Title's procedural Earth (TECH §8.6
// budgets: no allocation per call). Value noise on a 256-period lattice with a cubic fade; each fbm octave turns the
// domain by a fixed rotation so the lattice axes never line up into visible grid seams on the globe.
import { Sfc32 } from '../../../core/rng';

/** A fixed rotation (about (1, 2, 3), ~37°) applied between octaves. */
const R = [0.80, -0.36, 0.48, 0.48, 0.86, -0.17, -0.35, 0.36, 0.86] as const;

export class Noise3 {
  private readonly perm = new Uint8Array(512);
  private readonly val = new Float32Array(256);

  constructor(seed: number) {
    const rng = new Sfc32(seed);
    const p = this.perm;
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng.float() * (i + 1)); const t = p[i]!; p[i] = p[j]!; p[j] = t; }
    for (let i = 0; i < 256; i++) { p[i + 256] = p[i]!; this.val[i] = rng.float() * 2 - 1; }
  }

  /** Value noise in [-1, 1]. */
  at(x: number, y: number, z: number): number {
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    const tx = x - fx, ty = y - fy, tz = z - fz;
    const X = fx & 255, Y = fy & 255, Z = fz & 255;
    const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty), w = tz * tz * (3 - 2 * tz);
    const p = this.perm, g = this.val;
    const a = p[X]! + Y, b = p[X + 1]! + Y;
    const aa = p[a]! + Z, ab = p[a + 1]! + Z, ba = p[b]! + Z, bb = p[b + 1]! + Z;
    const x00 = g[p[aa]!]! + (g[p[ba]!]! - g[p[aa]!]!) * u;
    const x10 = g[p[ab]!]! + (g[p[bb]!]! - g[p[ab]!]!) * u;
    const x01 = g[p[aa + 1]!]! + (g[p[ba + 1]!]! - g[p[aa + 1]!]!) * u;
    const x11 = g[p[ab + 1]!]! + (g[p[bb + 1]!]! - g[p[ab + 1]!]!) * u;
    const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }

  /** Fractal sum of `oct` octaves (lacunarity 2.03, gain `gain`), normalised to about [-1, 1]. */
  fbm(x: number, y: number, z: number, oct: number, gain = 0.5): number {
    let sum = 0, amp = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * this.at(x, y, z);
      norm += amp;
      amp *= gain;
      const nx = (R[0] * x + R[1] * y + R[2] * z) * 2.03 + 17.1;
      const ny = (R[3] * x + R[4] * y + R[5] * z) * 2.03 - 5.3;
      const nz = (R[6] * x + R[7] * y + R[8] * z) * 2.03 + 9.7;
      x = nx; y = ny; z = nz;
    }
    return sum / norm;
  }
}
