// world/render/writer.ts: flat-shaded, vertex-coloured geometry written straight into pooled buffers (no per-prop
// BufferGeometry, no merge pass). Two layers:
//   - GeoWriter: one PooledGeo; triangles with the current brush (linear colour, auv, fx) and bounds tracking.
//   - Kit: the multi-target brush every kit draws with. Primitives take prop-space coordinates (x lateral, y up,
//     s forward from the anchor) and a frame (anchor, yaw, mirror) maps them to chunk-local axes
//     (x = x, y = y, z = −(s − chunk.s0), TECH §8.2). Targets are the chunk meshes (TECH §8.6):
//       'o' opaque lit (no discard)   'x' x-ray (Bayer screen door)   'e' emissive (unlit)   'g' glow cards (additive)
//       'b' buildings and shadow casters
//     With `capY` set (in-corridor tall solids), every primitive drawn to 'o' is split at that height: the part above
//     goes to 'x' (DESIGN §8 x-ray cap). With `clip` set (length-parametric pieces drawn once per chunk), boxes and
//     beams are clipped to the chunk's s-range.
// Bottoms of boxes are not drawn unless asked (the run camera never sees one; menu cameras see some overhead parts).
import { Vector3 } from 'three';
import type { PooledGeo } from './pools';

/** fx.z bits of the lit materials ('o', 'x', 'b'). */
export const FX = { noFog: 1, shadowOnly: 2, near: 4, matte: 8 } as const;

export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export class GeoWriter {
  private g: PooledGeo | null = null;
  readonly min = new Vector3();
  readonly max = new Vector3();
  /** Brush: linear colour, atlas uv, fx. */
  r = 1; gr = 1; b = 1;
  u = -1; v = -1;
  f0 = 0; f1 = 0; f2 = 0; f3 = 0;
  tris = 0;

  begin(g: PooledGeo): this {
    this.g = g; g.count = 0; this.tris = 0;
    this.min.set(Infinity, Infinity, Infinity); this.max.set(-Infinity, -Infinity, -Infinity);
    return this;
  }
  end(): PooledGeo { const g = this.g!; g.commit(this.min, this.max); this.g = null; return g; }
  get count(): number { return this.g?.count ?? 0; }
  get active(): boolean { return this.g !== null; }

  reserve(n: number): void { const g = this.g!; g.ensure(g.count + n); }

  /** One vertex with the brush (call reserve first). */
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    const g = this.g!, i = g.count, o3 = i * 3, o2 = i * 2, o4 = i * 4;
    g.pos[o3] = x; g.pos[o3 + 1] = y; g.pos[o3 + 2] = z;
    g.nrm[o3] = nx; g.nrm[o3 + 1] = ny; g.nrm[o3 + 2] = nz;
    g.col[o3] = this.r; g.col[o3 + 1] = this.gr; g.col[o3 + 2] = this.b;
    g.uv[o2] = this.u; g.uv[o2 + 1] = this.v;
    g.fx[o4] = this.f0; g.fx[o4 + 1] = this.f1; g.fx[o4 + 2] = this.f2; g.fx[o4 + 3] = this.f3;
    g.count = i + 1;
    if (x < this.min.x) this.min.x = x; if (y < this.min.y) this.min.y = y; if (z < this.min.z) this.min.z = z;
    if (x > this.max.x) this.max.x = x; if (y > this.max.y) this.max.y = y; if (z > this.max.z) this.max.z = z;
  }
}

type Target = 'o' | 'x' | 'e' | 'g' | 'b';
export type KitTargets = Readonly<Record<Target, GeoWriter>>;
/** Optional per-corner atlas uv of a quad (u0,v0 at corner a … u3,v3 at corner d). */
export type QuadUv = readonly [number, number, number, number, number, number, number, number];

/** Box face corner sets in prop space: (dx, dy, ds) ∈ {0,1}³ for each corner, CCW seen from outside. */
const BOX_FACES: readonly { n: readonly [number, number, number]; c: readonly (readonly [number, number, number])[] }[] = [
  { n: [0, 1, 0], c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },      // top
  { n: [0, 0, -1], c: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] },     // front (toward the camera, −s)
  { n: [0, 0, 1], c: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]] },      // back
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]] },      // right (+x)
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]] },     // left (−x)
  { n: [0, -1, 0], c: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]] },     // bottom (optional)
];
/** Faces to draw: bit per BOX_FACES entry. */
export const FACE = { top: 1, front: 2, back: 4, right: 8, left: 16, bottom: 32, sides5: 31, all: 63 } as const;

export class Kit {
  /** Current target. */
  t: Target = 'o';
  /** X-ray split height in prop space (null: off). */
  capY: number | null = null;
  /** s-range clip in track space for boxes / beams (null: off). */
  clip0 = -Infinity; clip1 = Infinity;
  // Frame: anchor in track space, yaw (rad), mirror; chunk origin.
  private ax = 0; private ay = 0; private as = 0; private c = 1; private sn = 0; private m = 1;
  private s0 = 0;
  // Brush (sRGB hex cache → linear).
  private hex = -1; private lr = 1; private lg = 1; private lb = 1;
  private uvU = -1; private uvV = -1;
  private fx: [number, number, number, number] = [0, 0, 0, 0];
  private readonly tmp = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  constructor(readonly w: KitTargets) {}

  /** Chunk origin (track s at chunk-local z = 0). */
  chunk(s0: number): this { this.s0 = s0; return this; }
  /** Prop frame: anchor (track x, y, s), yaw about +y (rad; 0 = the identity face looks toward −s), mirror x. */
  frame(x: number, y: number, s: number, yaw = 0, mirror = false): this {
    this.ax = x; this.ay = y; this.as = s; this.c = Math.cos(yaw); this.sn = Math.sin(yaw); this.m = mirror ? -1 : 1;
    if (Math.abs(this.c) < 1e-9) this.c = 0; if (Math.abs(this.sn) < 1e-9) this.sn = 0;
    return this;
  }
  /** Resets target, flags, cap and clip (call before each prop). */
  reset(): this {
    this.t = 'o'; this.capY = null; this.clip0 = -Infinity; this.clip1 = Infinity;
    this.fx = [0, 0, 0, 0]; this.uvU = -1; this.uvV = -1;
    return this;
  }
  to(t: Target): this { this.t = t; return this; }
  col(hex: number): this {
    if (hex !== this.hex) {
      this.hex = hex;
      this.lr = srgbToLinear(((hex >> 16) & 255) / 255); this.lg = srgbToLinear(((hex >> 8) & 255) / 255); this.lb = srgbToLinear((hex & 255) / 255);
    }
    return this;
  }
  /** fx channels (material-specific, materials.ts). */
  fxs(a: number, b: number, c: number, d: number): this { this.fx[0] = a; this.fx[1] = b; this.fx[2] = c; this.fx[3] = d; return this; }
  fxAt(i: 0 | 1 | 2 | 3, v: number): this { this.fx[i] = v; return this; }
  get flags(): number { return this.fx[2]; }
  /** Lit materials: ground pattern cell (0 none), sway, flag bits, emissive add. */
  lit(pattern = 0, sway = 0, flags = 0, emissive = 0): this { return this.fxs(pattern, sway, flags, emissive); }
  /** Emissive material: intensity, window rand (−1 none), flag bits, animation kind. */
  glowing(intensity: number, windowRand = -1, flags = 0, anim = 0): this { return this.fxs(intensity, windowRand, flags, anim); }
  /** Atlas uv for following primitives that do not pass their own (−1: none). */
  uv(u: number, v: number): this { this.uvU = u; this.uvV = v; return this; }

  // ── transforms ─────────────────────────────────────────────────────────────────────────────────────────────
  /** Prop space → chunk-local, written into tmp[o..o+2]. */
  private xf(x: number, y: number, s: number, o: number): void {
    const mx = x * this.m;
    const rx = mx * this.c - s * this.sn, rs = mx * this.sn + s * this.c;
    this.tmp[o] = this.ax + rx; this.tmp[o + 1] = this.ay + y; this.tmp[o + 2] = -(this.as + rs - this.s0);
  }
  private get axisAligned(): boolean { return this.sn === 0 && this.c === 1; }

  private writer(t: Target): GeoWriter {
    const w = this.w[t];
    w.r = this.lr; w.gr = this.lg; w.b = this.lb;
    w.f0 = this.fx[0]; w.f1 = this.fx[1]; w.f2 = this.fx[2]; w.f3 = this.fx[3];
    return w;
  }

  /** One planar quad a-b-c-d (CCW seen from its front), prop space. Optional per-corner uv and glow fx. */
  quad(ax: number, ay: number, as: number, bx: number, by: number, bs: number, cx: number, cy: number, cs: number,
    dx: number, dy: number, ds: number, uv?: QuadUv, t: Target = this.t): void {
    const w = this.writer(t);
    if (!w.active) return;
    const p = this.tmp;
    this.xf(ax, ay, as, 0); this.xf(bx, by, bs, 3); this.xf(cx, cy, cs, 6); this.xf(dx, dy, ds, 9);
    // Normal from the diagonals (exact for planar quads).
    const ux = p[6]! - p[0]!, uy = p[7]! - p[1]!, uz = p[8]! - p[2]!;
    const vx = p[9]! - p[3]!, vy = p[10]! - p[4]!, vz = p[11]! - p[5]!;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-12) return;
    nx /= nl; ny /= nl; nz /= nl;
    // A mirrored frame flips the winding: keep faces front-facing.
    const order = this.m < 0 ? REV : FWD;
    if (this.m < 0) { nx = -nx; ny = -ny; nz = -nz; }
    w.reserve(6);
    const uu = this.uvU, vv = this.uvV;
    for (const k of order) {
      if (uv) { w.u = uv[k * 2]!; w.v = uv[k * 2 + 1]!; } else { w.u = uu; w.v = vv; }
      w.vert(p[k * 3]!, p[k * 3 + 1]!, p[k * 3 + 2]!, nx, ny, nz);
    }
    w.tris += 2;
  }

  tri(ax: number, ay: number, as: number, bx: number, by: number, bs: number, cx: number, cy: number, cs: number, t: Target = this.t): void {
    const w = this.writer(t);
    if (!w.active) return;
    const p = this.tmp;
    this.xf(ax, ay, as, 0); this.xf(bx, by, bs, 3); this.xf(cx, cy, cs, 6);
    const ux = p[3]! - p[0]!, uy = p[4]! - p[1]!, uz = p[5]! - p[2]!;
    const vx = p[6]! - p[0]!, vy = p[7]! - p[1]!, vz = p[8]! - p[2]!;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-12) return;
    nx /= nl; ny /= nl; nz /= nl;
    if (this.m < 0) { nx = -nx; ny = -ny; nz = -nz; }
    w.reserve(3);
    w.u = this.uvU; w.v = this.uvV;
    const order = this.m < 0 ? TRI_REV : TRI_FWD;
    for (const k of order) w.vert(p[k * 3]!, p[k * 3 + 1]!, p[k * 3 + 2]!, nx, ny, nz);
    w.tris += 1;
  }

  /** Axis-aligned box in prop space. `faces` is a FACE bit set (default: 5 faces, no bottom). Split at capY. */
  box(x0: number, y0: number, s0: number, x1: number, y1: number, s1: number, faces: number = FACE.sides5): void {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || s1 - s0 < 1e-4) return;
    if (this.axisAligned && (this.clip0 > -Infinity || this.clip1 < Infinity)) {
      const lo = Math.max(s0, this.clip0 - this.as), hi = Math.min(s1, this.clip1 - this.as);
      if (hi <= lo + 1e-4) return;
      if (lo > s0 + 1e-6) faces &= ~FACE.front;
      if (hi < s1 - 1e-6) faces &= ~FACE.back;
      s0 = lo; s1 = hi;
    }
    const cap = this.capY;
    if (cap !== null && this.t === 'o' && y1 > cap + 1e-4) {
      if (y0 < cap - 1e-4) { this.boxRaw(x0, y0, s0, x1, cap, s1, faces & ~FACE.top, 'o'); this.boxRaw(x0, cap, s0, x1, y1, s1, faces & ~FACE.bottom, 'x'); }
      else this.boxRaw(x0, y0, s0, x1, y1, s1, faces, 'x');
      return;
    }
    this.boxRaw(x0, y0, s0, x1, y1, s1, faces, this.t);
  }

  private boxRaw(x0: number, y0: number, s0: number, x1: number, y1: number, s1: number, faces: number, t: Target): void {
    const X = [x0, x1], Y = [y0, y1], S = [s0, s1];
    for (let f = 0; f < 6; f++) {
      if (!(faces & (1 << f))) continue;
      const c = BOX_FACES[f]!.c;
      const a = c[0]!, b = c[1]!, cc = c[2]!, d = c[3]!;
      this.quad(X[a[0]]!, Y[a[1]]!, S[a[2]]!, X[b[0]]!, Y[b[1]]!, S[b[2]]!, X[cc[0]]!, Y[cc[1]]!, S[cc[2]]!,
        X[d[0]]!, Y[d[1]]!, S[d[2]]!, undefined, t);
    }
  }

  /** Box whose top has a bevel ring (DESIGN §18.5: chamfered top edges catch the light). `c` = bevel size. */
  chamfer(x0: number, y0: number, s0: number, x1: number, y1: number, s1: number, c: number, topHex?: number): void {
    const cc = Math.min(c, (x1 - x0) / 3, (s1 - s0) / 3, (y1 - y0) / 2);
    if (cc < 0.004) { this.box(x0, y0, s0, x1, y1, s1); return; }
    const yb = y1 - cc;
    this.box(x0, y0, s0, x1, yb, s1, FACE.front | FACE.back | FACE.left | FACE.right);
    const hex = this.hex;
    const t = this.capY !== null && this.t === 'o' && yb >= this.capY ? 'x' as const : this.t;
    // Bevel: four sloped quads, then the top.
    this.quad(x0, yb, s0, x1, yb, s0, x1 - cc, y1, s0 + cc, x0 + cc, y1, s0 + cc, undefined, t);           // front
    this.quad(x1, yb, s1, x0, yb, s1, x0 + cc, y1, s1 - cc, x1 - cc, y1, s1 - cc, undefined, t);           // back
    this.quad(x1, yb, s0, x1, yb, s1, x1 - cc, y1, s1 - cc, x1 - cc, y1, s0 + cc, undefined, t);           // right
    this.quad(x0, yb, s1, x0, yb, s0, x0 + cc, y1, s0 + cc, x0 + cc, y1, s1 - cc, undefined, t);           // left
    if (topHex !== undefined) this.col(topHex);
    this.quad(x0 + cc, y1, s0 + cc, x1 - cc, y1, s0 + cc, x1 - cc, y1, s1 - cc, x0 + cc, y1, s1 - cc, undefined, t);
    this.col(hex);
  }

  /** Vertical n-sided prism (cylinder) at (x, s) from y0 to y1, radius r (rx, rs for an ellipse). */
  cyl(x: number, s: number, y0: number, y1: number, r: number, n = 8, top = true, rs = r, phase = 0.5): void {
    const cap = this.capY;
    if (cap !== null && this.t === 'o' && y1 > cap + 1e-4) {
      if (y0 < cap - 1e-4) { this.cylRaw(x, s, y0, cap, r, rs, n, false, phase, 'o'); this.cylRaw(x, s, cap, y1, r, rs, n, top, phase, 'x'); }
      else this.cylRaw(x, s, y0, y1, r, rs, n, top, phase, 'x');
      return;
    }
    this.cylRaw(x, s, y0, y1, r, rs, n, top, phase, this.t);
  }
  private cylRaw(x: number, s: number, y0: number, y1: number, r: number, rs: number, n: number, top: boolean, phase: number, t: Target): void {
    for (let i = 0; i < n; i++) {
      const a0 = ((i + phase) / n) * Math.PI * 2, a1 = ((i + 1 + phase) / n) * Math.PI * 2;
      const xa = x + Math.cos(a0) * r, sa = s + Math.sin(a0) * rs, xb = x + Math.cos(a1) * r, sb = s + Math.sin(a1) * rs;
      // Prop space (x, y, s) is mirrored against chunk space (z = −s): increasing angle runs clockwise on screen.
      this.quad(xa, y0, sa, xb, y0, sb, xb, y1, sb, xa, y1, sa, undefined, t);
      if (top) this.tri(x, y1, s, xa, y1, sa, xb, y1, sb, t);
    }
  }

  /** Vertical frustum: radius r0 at y0, r1 at y1 (r1 = 0 → a cone). */
  frustum(x: number, s: number, y0: number, y1: number, r0: number, r1: number, n = 8, top = true): void {
    const t = this.capY !== null && this.t === 'o' && (y0 + y1) / 2 > this.capY ? 'x' as const : this.t;
    for (let i = 0; i < n; i++) {
      const a0 = ((i + 0.5) / n) * Math.PI * 2, a1 = ((i + 1.5) / n) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      if (r1 > 1e-4) this.quad(x + c0 * r0, y0, s + s0 * r0, x + c1 * r0, y0, s + s1 * r0, x + c1 * r1, y1, s + s1 * r1, x + c0 * r1, y1, s + s0 * r1, undefined, t);
      else this.tri(x + c0 * r0, y0, s + s0 * r0, x + c1 * r0, y0, s + s1 * r0, x, y1, s, t);
      if (top && r1 > 1e-4) this.tri(x, y1, s, x + c0 * r1, y1, s + s0 * r1, x + c1 * r1, y1, s + s1 * r1, t);
    }
  }

  /** Horizontal prism along s (axis 's') or along x (axis 'x'), centre (x, y, s), radius r, from a to b on the axis. */
  hcyl(axis: 's' | 'x', x: number, y: number, s: number, a: number, b: number, r: number, n = 6, caps = true): void {
    const t = this.capY !== null && this.t === 'o' && y > this.capY ? 'x' as const : this.t;
    for (let i = 0; i < n; i++) {
      const a0 = ((i + 0.5) / n) * Math.PI * 2, a1 = ((i + 1.5) / n) * Math.PI * 2;
      const u0 = Math.cos(a0) * r, v0 = Math.sin(a0) * r, u1 = Math.cos(a1) * r, v1 = Math.sin(a1) * r;
      if (axis === 's') {
        this.quad(x + u1, y + v1, a, x + u0, y + v0, a, x + u0, y + v0, b, x + u1, y + v1, b, undefined, t);
        if (caps) { this.tri(x, y, a, x + u0, y + v0, a, x + u1, y + v1, a, t); this.tri(x, y, b, x + u1, y + v1, b, x + u0, y + v0, b, t); }
      } else {
        this.quad(a, y + v1, s + u1, b, y + v1, s + u1, b, y + v0, s + u0, a, y + v0, s + u0, undefined, t);
        if (caps) { this.tri(a, y, s, a, y + v1, s + u1, a, y + v0, s + u0, t); this.tri(b, y, s, b, y + v0, s + u0, b, y + v1, s + u1, t); }
      }
    }
  }

  /** Low-poly ellipsoid: `n` segments around, `m` rings (default 6 × 4). sy squashes vertically. */
  sphere(x: number, y: number, s: number, r: number, n = 6, m = 4, sy = 1, rs = r): void {
    const t = this.capY !== null && this.t === 'o' && y > this.capY ? 'x' as const : this.t;
    const P = (i: number, j: number, o: 0 | 1 | 2) => {
      const th = (j / m) * Math.PI, ph = ((i + (j % 2) * 0.5) / n) * Math.PI * 2;
      const sr = Math.sin(th);
      return o === 0 ? x + Math.cos(ph) * sr * r : o === 1 ? y + Math.cos(th) * r * sy : s + Math.sin(ph) * sr * rs;
    };
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) {
        const ax = P(i, j, 0), ay = P(i, j, 1), as = P(i, j, 2);
        const bx = P(i + 1, j, 0), by = P(i + 1, j, 1), bs = P(i + 1, j, 2);
        const cx = P(i + 1, j + 1, 0), cy = P(i + 1, j + 1, 1), cs = P(i + 1, j + 1, 2);
        const dx = P(i, j + 1, 0), dy = P(i, j + 1, 1), ds = P(i, j + 1, 2);
        if (j === 0) this.tri(ax, ay, as, dx, dy, ds, cx, cy, cs, t);
        else if (j === m - 1) this.tri(ax, ay, as, dx, dy, ds, bx, by, bs, t);
        else { this.tri(ax, ay, as, cx, cy, cs, bx, by, bs, t); this.tri(ax, ay, as, dx, dy, ds, cx, cy, cs, t); }
      }
    }
  }

  /** Slab or wedge in prop space: x0..x1, s0..s1, top at yNear (s0) and yFar (s1), down to yBot. Clipped. */
  wedge(x0: number, x1: number, s0: number, s1: number, yBot: number, yNear: number, yFar: number): void {
    if (x1 - x0 < 1e-4 || s1 - s0 < 1e-4) return;
    let a = s0, b = s1;
    if (this.axisAligned) { a = Math.max(s0, this.clip0 - this.as); b = Math.min(s1, this.clip1 - this.as); }
    if (b <= a + 1e-4) return;
    const yA = yNear + (yFar - yNear) * ((a - s0) / (s1 - s0)), yB = yNear + (yFar - yNear) * ((b - s0) / (s1 - s0));
    const t = this.t;
    this.quad(x0, yA, a, x1, yA, a, x1, yB, b, x0, yB, b, undefined, t);                                     // top
    if (a <= s0 + 1e-6 && yA > yBot + 1e-4) this.quad(x0, yBot, a, x1, yBot, a, x1, yA, a, x0, yA, a, undefined, t);   // front
    if (b >= s1 - 1e-6 && yB > yBot + 1e-4) this.quad(x1, yBot, b, x0, yBot, b, x0, yB, b, x1, yB, b, undefined, t);   // back
    this.quad(x1, yBot, a, x1, yBot, b, x1, yB, b, x1, yA, a, undefined, t);                                 // right
    this.quad(x0, yBot, b, x0, yBot, a, x0, yA, a, x0, yB, b, undefined, t);                                 // left
  }

  /** A straight beam from A (near) to B (far) along s with lateral drift, ±halfW wide, yBot..yTop around the line.
   *  Clipped to the s-range. */
  beam(ax: number, ay: number, as: number, bx: number, by: number, bs: number, halfW: number, yBot: number, yTop: number): void {
    if (bs - as < 1e-4) return;
    let u0 = 0, u1 = 1;
    if (this.axisAligned) {
      u0 = Math.max(0, (this.clip0 - this.as - as) / (bs - as)); u1 = Math.min(1, (this.clip1 - this.as - as) / (bs - as));
    }
    if (u1 <= u0 + 1e-6) return;
    const L = (u: number, o: 0 | 1 | 2) => (o === 0 ? ax + (bx - ax) * u : o === 1 ? ay + (by - ay) * u : as + (bs - as) * u);
    const x0 = L(u0, 0), y0 = L(u0, 1), s0 = L(u0, 2), x1 = L(u1, 0), y1 = L(u1, 1), s1 = L(u1, 2);
    const t = this.t;
    this.quad(x0 - halfW, y0 + yTop, s0, x0 + halfW, y0 + yTop, s0, x1 + halfW, y1 + yTop, s1, x1 - halfW, y1 + yTop, s1, undefined, t);
    if (u0 <= 1e-6) this.quad(x0 - halfW, y0 + yBot, s0, x0 + halfW, y0 + yBot, s0, x0 + halfW, y0 + yTop, s0, x0 - halfW, y0 + yTop, s0, undefined, t);
    if (u1 >= 1 - 1e-6) this.quad(x1 + halfW, y1 + yBot, s1, x1 - halfW, y1 + yBot, s1, x1 - halfW, y1 + yTop, s1, x1 + halfW, y1 + yTop, s1, undefined, t);
    this.quad(x0 + halfW, y0 + yBot, s0, x1 + halfW, y1 + yBot, s1, x1 + halfW, y1 + yTop, s1, x0 + halfW, y0 + yTop, s0, undefined, t);
    this.quad(x1 - halfW, y1 + yBot, s1, x0 - halfW, y0 + yBot, s0, x0 - halfW, y0 + yTop, s0, x1 - halfW, y1 + yTop, s1, undefined, t);
  }

  /** A thin bar between two arbitrary points (wires, chains, struts): a square tube of half-size h. */
  bar(ax: number, ay: number, as: number, bx: number, by: number, bs: number, h: number): void {
    const dx = bx - ax, dy = by - ay, ds = bs - as, L = Math.hypot(dx, dy, ds);
    if (L < 1e-4) return;
    // Two perpendicular directions: p (horizontal-ish) and q.
    let px = -ds, py = 0, ps = dx;
    let pl = Math.hypot(px, ps);
    if (pl < 1e-6) { px = 1; ps = 0; pl = 1; }
    px /= pl; ps /= pl;
    let qx = dy * ps - ds * py, qy = ds * px - dx * ps, qs = dx * py - dy * px;
    const ql = Math.hypot(qx, qy, qs) || 1; qx /= ql; qy /= ql; qs /= ql;
    const t = this.capY !== null && this.t === 'o' && (ay + by) / 2 > this.capY ? 'x' as const : this.t;
    const C = (sx: number, sy: number, end: 0 | 1, o: 0 | 1 | 2) => {
      const bxp = end ? bx : ax, byp = end ? by : ay, bsp = end ? bs : as;
      return o === 0 ? bxp + (px * sx + qx * sy) * h : o === 1 ? byp + (py * sx + qy * sy) * h : bsp + (ps * sx + qs * sy) * h;
    };
    const sides: [number, number, number, number][] = [[1, 1, -1, 1], [-1, 1, -1, -1], [-1, -1, 1, -1], [1, -1, 1, 1]];
    for (const [a1, a2, b1, b2] of sides) {
      this.quad(C(b1, b2, 0, 0), C(b1, b2, 0, 1), C(b1, b2, 0, 2), C(a1, a2, 0, 0), C(a1, a2, 0, 1), C(a1, a2, 0, 2),
        C(a1, a2, 1, 0), C(a1, a2, 1, 1), C(a1, a2, 1, 2), C(b1, b2, 1, 0), C(b1, b2, 1, 1), C(b1, b2, 1, 2), undefined, t);
    }
  }

  /** A camera-facing card (vertical, facing −s) centred at (x, y, s), w × h, with per-corner glow coords
   *  (fx.x, fx.y ∈ −1..1) for the glow material. */
  card(x: number, y: number, s: number, w: number, h: number): void {
    const wr = this.writer('g');
    if (!wr.active) return;
    const hw = w / 2, hh = h / 2, p = this.tmp;
    const corners: [number, number, number, number][] = [[-1, -1, -hw, -hh], [1, -1, hw, -hh], [1, 1, hw, hh], [-1, 1, -hw, hh]];
    wr.reserve(6);
    for (const k of FWD) {
      const cc = corners[k]!;
      this.xf(x + cc[2], y + cc[3], s, 0);
      wr.f0 = cc[0]; wr.f1 = cc[1];
      wr.u = -1; wr.v = -1;
      wr.vert(p[0]!, p[1]!, p[2]!, 0, 0, 1);
    }
    wr.tris += 2;
  }
}

const FWD = [0, 1, 2, 0, 2, 3] as const;
const REV = [0, 2, 1, 0, 3, 2] as const;
const TRI_FWD = [0, 1, 2] as const;
const TRI_REV = [0, 2, 1] as const;
