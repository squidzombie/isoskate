// world/render/title/earthTexture.ts: the Title's procedural Earth, baked on the CPU into equirect byte arrays in
// idle slices (TECH §8.4: ≤ 4 ms each, so no Title frame ever hitches). Two maps, both in the texture layout of
// three's SphereGeometry (memory row 0 = the south pole, column u → phi = 2πu, x = −cos phi, z = sin phi):
//   colour (RGBA8): RGB = day albedo (deep teal seas, green reclaimed continents, soft warm ice caps);
//                   A   = 0 on water, 128…255 on land, where 128 + 127·lights holds the few warm night lights.
//   clouds (R8):    soft drifting cloud cover.
//   puff (R8):      a square full-range cloud noise for the dive's wash (not tiled: the wash samples one window).
// The run's start city is a coastal cluster of lights at `city` (an Earth-local unit vector): land is pulled up there.
import { Noise3 } from './noise';

export const EARTH_TEX = { w: 1024, h: 512, cloudW: 512, cloudH: 256, puff: 256, seed: 0xd5c1a9, sliceMs: 4 } as const;

const smooth = (a: number, b: number, x: number) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Palette (display sRGB, 0–255). */
const C = {
  deep: [12, 52, 70], mid: [19, 86, 100], shallow: [44, 136, 134],
  forest: [44, 100, 58], lush: [78, 142, 68], meadow: [126, 166, 82], olive: [140, 132, 84], rock: [178, 164, 136],
  ice: [236, 234, 226],
} as const;

export interface EarthBakeOptions { w?: number; h?: number; cloudW?: number; cloudH?: number; puff?: number; seed?: number; city: readonly [number, number, number] }

/** Texels per unit of work: the slice clock is read after every unit, so even a cold (unoptimised) first slice stays
 *  near its budget. */
const UNIT = 32;

export class EarthBaker {
  readonly w: number; readonly h: number; readonly cw: number; readonly ch: number; readonly pw: number;
  readonly color: Uint8Array;
  readonly clouds: Uint8Array;
  readonly puff: Uint8Array;
  /** Slices run so far, the longest one and the total (ms). */
  slices = 0; maxSliceMs = 0; totalMs = 0;
  /** Work cursor: pass 0 = half-resolution fields, 1 = colour, 2 = clouds, 3 = puff, 4 = done; `at` = texel index. */
  private pass = 0;
  private at = 0;
  private readonly land: Noise3;
  private readonly detail: Noise3;
  private readonly sky: Noise3;
  /** Half-resolution fields (w/2 × h/2): elevation, moisture and town density, bilinearly read by the colour pass. */
  private readonly fw: number; private readonly fh: number;
  private readonly E: Float32Array; private readonly M: Float32Array; private readonly T: Float32Array;
  private readonly city: readonly [number, number, number];

  constructor(o: EarthBakeOptions) {
    this.w = o.w ?? EARTH_TEX.w; this.h = o.h ?? EARTH_TEX.h;
    this.cw = o.cloudW ?? EARTH_TEX.cloudW; this.ch = o.cloudH ?? EARTH_TEX.cloudH; this.pw = o.puff ?? EARTH_TEX.puff;
    const seed = o.seed ?? EARTH_TEX.seed;
    this.land = new Noise3(seed); this.detail = new Noise3(seed ^ 0x5bd1e995); this.sky = new Noise3(seed ^ 0x27d4eb2f);
    this.color = new Uint8Array(this.w * this.h * 4);
    this.clouds = new Uint8Array(this.cw * this.ch);
    this.puff = new Uint8Array(this.pw * this.pw);
    this.fw = Math.max(2, this.w >> 1); this.fh = Math.max(2, this.h >> 1);
    const n = this.fw * this.fh;
    this.E = new Float32Array(n); this.M = new Float32Array(n); this.T = new Float32Array(n);
    this.city = o.city;
  }

  get done(): boolean { return this.pass >= 4; }
  /** 0…1 over the three passes (weighted by their cost). */
  get progress(): number {
    if (this.done) return 1;
    const sizes = [this.fw * this.fh * 3, this.w * this.h, this.cw * this.ch * 2, this.pw * this.pw * 2];
    let doneW = 0, all = 0;
    sizes.forEach((sz, i) => { all += sz; if (i < this.pass) doneW += sz; });
    const n = [this.fw * this.fh, this.w * this.h, this.cw * this.ch, this.pw * this.pw][this.pass]!;
    return (doneW + (sizes[this.pass]! * this.at) / n) / all;
  }

  /** Bakes until `budgetMs` has passed (the clock is read every UNIT texels); true once both maps are complete. */
  step(budgetMs: number, now: () => number): boolean {
    if (this.done) return true;
    const t0 = now();
    do this.unit(); while (!this.done && now() - t0 < budgetMs);
    const ms = now() - t0;
    this.slices++; this.totalMs += ms; this.maxSliceMs = Math.max(this.maxSliceMs, ms);
    return this.done;
  }

  /** Everything at once (tests and tools). */
  bakeAll(): void { while (!this.done) this.unit(); }

  private unit(): void {
    const n = this.pass === 0 ? this.fw * this.fh : this.pass === 1 ? this.w * this.h : this.pass === 2 ? this.cw * this.ch : this.pw * this.pw;
    const end = Math.min(n, this.at + UNIT);
    for (let k = this.at; k < end; k++) {
      if (this.pass === 0) this.field(k); else if (this.pass === 1) this.texel(k); else if (this.pass === 2) this.cloud(k); else this.puffAt(k);
    }
    this.at = end;
    if (end >= n) { this.pass++; this.at = 0; }
  }

  /** Continent field at a unit-sphere point: > 0 is land (about a third of the globe), larger inland. */
  elevation(x: number, y: number, z: number): number {
    const n = this.land;
    const wv = n.fbm(x * 1.9 + 3.1, y * 1.9 - 1.7, z * 1.9 + 0.4, 2);
    const qx = x + 0.32 * wv, qy = y - 0.22 * wv, qz = z + 0.27 * wv;
    let e = n.fbm(qx * 1.55, qy * 1.55, qz * 1.55, 5, 0.52) - 0.06;
    // The start city sits on a coast: a soft rise of land under it, with a bay on its sunward side.
    const c = this.city, d = 1 - (x * c[0] + y * c[1] + z * c[2]);           // ≈ angle² / 2
    e += 0.26 * Math.exp(-d / 0.012) - 0.07 * Math.exp(-d / 0.0015);
    return e - 0.05 * y * y;                                                  // a little less land toward the poles
  }

  /** Half-resolution fields at texel k (texel centres of the SphereGeometry layout). */
  private field(k: number): void {
    const fw = this.fw, i = k % fw, j = (k - i) / fw;
    const lat = -Math.PI / 2 + (Math.PI * (j + 0.5)) / this.fh, ph = (2 * Math.PI * (i + 0.5)) / fw;
    const cl = Math.cos(lat), y = Math.sin(lat), x = -Math.cos(ph) * cl, z = Math.sin(ph) * cl;
    this.E[k] = this.elevation(x, y, z);
    this.M[k] = this.detail.at(x * 5.3 + 1.1, y * 5.3, z * 5.3 - 2.2);
    this.T[k] = this.detail.at(x * 7.0 - 4.0, y * 7.0 + 2.0, z * 7.0);
  }

  /** Bilinear read of a half-resolution field at full-resolution texel (i, j) (wraps in longitude). */
  private sample(f: Float32Array, i: number, j: number): number {
    const fw = this.fw, fh = this.fh;
    const u = ((i + 0.5) * fw) / this.w - 0.5, v = Math.min(fh - 1, Math.max(0, ((j + 0.5) * fh) / this.h - 0.5));
    const i0 = Math.floor(u), j0 = Math.floor(v), tu = u - i0, tv = v - j0;
    const a = ((i0 % fw) + fw) % fw, b = (a + 1) % fw, j1 = Math.min(fh - 1, j0 + 1);
    const r0 = f[j0 * fw + a]! + (f[j0 * fw + b]! - f[j0 * fw + a]!) * tu;
    const r1 = f[j1 * fw + a]! + (f[j1 * fw + b]! - f[j1 * fw + a]!) * tu;
    return r0 + (r1 - r0) * tv;
  }

  private texel(k: number): void {
    const w = this.w, i = k % w, j = (k - i) / w, o = k * 4, out = this.color;
    const lat = -Math.PI / 2 + (Math.PI * (j + 0.5)) / this.h, ph = (2 * Math.PI * (i + 0.5)) / w;
    const cl = Math.cos(lat), y = Math.sin(lat), x = -Math.cos(ph) * cl, z = Math.sin(ph) * cl;
    const dn = this.detail, c = this.city;
    // Full-resolution coastline detail over the half-resolution continents.
    const e = this.sample(this.E, i, j) + 0.04 * dn.at(x * 26 + 3.0, y * 26, z * 26 - 1.0);
    let r: number, g: number, b: number, a = 0;
    if (e < 0) {
      const d = -e;
      const t1 = smooth(0, 0.07, d), t2 = smooth(0.07, 0.32, d);
      r = mix(mix(C.shallow[0], C.mid[0], t1), C.deep[0], t2);
      g = mix(mix(C.shallow[1], C.mid[1], t1), C.deep[1], t2);
      b = mix(mix(C.shallow[2], C.mid[2], t1), C.deep[2], t2);
    } else {
      const m = this.sample(this.M, i, j);                                   // moisture: forest ↔ meadow
      const hi = smooth(0.2, 0.42, e + 0.08 * m);                            // highlands
      const coast = 1 - smooth(0, 0.05, e);
      const tf = smooth(-0.35, 0.45, m);
      r = mix(C.lush[0], C.forest[0], tf); g = mix(C.lush[1], C.forest[1], tf); b = mix(C.lush[2], C.forest[2], tf);
      const tm = smooth(0.25, 0.75, -m) * 0.8;
      r = mix(r, C.meadow[0], tm); g = mix(g, C.meadow[1], tm); b = mix(b, C.meadow[2], tm);
      r = mix(r, C.meadow[0], coast * 0.5); g = mix(g, C.meadow[1], coast * 0.5); b = mix(b, C.meadow[2], coast * 0.5);
      r = mix(r, C.olive[0], hi * 0.75); g = mix(g, C.olive[1], hi * 0.75); b = mix(b, C.olive[2], hi * 0.75);
      const pk = smooth(0.42, 0.55, e);
      r = mix(r, C.rock[0], pk); g = mix(g, C.rock[1], pk); b = mix(b, C.rock[2], pk);
      // Night lights: a few towns, mostly near coasts; the start city is a brighter cluster.
      let L = 0;
      const town = this.sample(this.T, i, j);
      if (town > 0.3) {
        const dots = dn.at(x * 70 + 9.0, y * 70, z * 70 - 3.0);
        L = smooth(0.3, 0.6, town) * smooth(0.25, 0.7, dots) * (0.35 + 0.65 * coast) * 0.7;
      }
      const dc = 1 - (x * c[0] + y * c[1] + z * c[2]);
      if (dc < 0.0016) {
        const dots = dn.at(x * 160 - 2.0, y * 160 + 5.0, z * 160);
        L = Math.max(L, (1 - dc / 0.0016) * (0.55 + 0.45 * smooth(-0.2, 0.5, dots)));
      }
      a = 128 + Math.round(127 * Math.min(1, L));
    }
    // Ice caps, warm white, frayed by the continent noise.
    const ice = smooth(0.86, 0.93, Math.abs(y) + 0.05 * e);
    if (ice > 0) { r = mix(r, C.ice[0], ice); g = mix(g, C.ice[1], ice); b = mix(b, C.ice[2], ice); }
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  }

  private cloud(k: number): void {
    const w = this.cw, i = k % w, j = (k - i) / w, n = this.sky;
    const lat = -Math.PI / 2 + (Math.PI * (j + 0.5)) / this.ch, ph = (2 * Math.PI * (i + 0.5)) / w;
    const cl = Math.cos(lat), y = Math.sin(lat), x = -Math.cos(ph) * cl, z = Math.sin(ph) * cl;
    // Banded like real weather: fewer clouds in the subtropics, more at mid latitudes.
    const band = 0.55 + 0.45 * Math.cos(lat * 4.2);
    const wv = n.at(x * 2.2, y * 2.2 + 7.0, z * 2.2);
    const v = n.fbm((x + 0.45 * wv) * 2.6, (y + 0.2 * wv) * 4.2, (z - 0.4 * wv) * 2.6, 5, 0.55);
    this.clouds[k] = Math.round(255 * smooth(0.02, 0.42, v + 0.22 * band - 0.18));
  }

  /** Billowy full-range noise (ridged a little toward the bright side) on a plane. */
  private puffAt(k: number): void {
    const w = this.pw, i = k % w, j = (k - i) / w, n = this.sky;
    const x = (i / w) * 5.0, y = (j / w) * 5.0;
    const v = n.fbm(x, y, 3.7, 4, 0.55);
    const b = 1 - Math.abs(n.at(x * 1.7 + 11.0, y * 1.7, 9.1));
    this.puff[k] = Math.round(255 * smooth(-0.55, 0.6, v + 0.25 * b - 0.1));
  }
}
