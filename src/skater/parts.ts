// skater/parts.ts: low-poly primitives and the part builder that merges them into one rigid-skinned geometry
// (TECH §8.5: every vertex weighted 1.0 to one bone; vertex colours plus atlas UVs).
//
// Attributes: position, normal, color, uv, skinIndex/skinWeight (skinned builds), aEmit (x: self-glow weight,
// y: fx-colour weight; materials.ts), aOutline (smoothed inflate direction × per-part outline factor; outline.ts).
// Parts with an outline come first, so the outline twin draws the same buffers with a shorter draw range.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion,
  SphereGeometry, Uint16BufferAttribute, Vector3,
} from 'three';
import type { Hex } from '../core/cosmetics';

/** UV mapping of a part into its texture atlas: a solid texel, or a projection into a rectangle (0..1 units). */
export type UvMap =
  | { kind: 'keep' }                                                                   // the geometry's own uv
  | { kind: 'solid'; u: number; v: number }
  | { kind: 'cyl'; rect: readonly [number, number, number, number]; u0?: number }      // around local y; u0 = phase
  | { kind: 'front'; rect: readonly [number, number, number, number]; r: number; back: readonly [number, number, number, number] }
  | { kind: 'planarY'; rect: readonly [number, number, number, number] }                // top-down (x → u, z → v)
  | { kind: 'planarZ'; rect: readonly [number, number, number, number] }                // side (x → u, y → v)
  | { kind: 'sphere'; rect: readonly [number, number, number, number] };              // azimuth / elevation

export interface PartOpts {
  color: Hex;
  bone?: number;
  uv?: UvMap;
  /** [self-glow, fx-colour] emission weights. */
  emit?: readonly [number, number];
  /** Outline factor: 1 = full ink width, 0 = no outline (detail parts). */
  outline?: number;
  /** Per-vertex colour override from the part-local position. */
  colorAt?: (p: Vector3) => Hex | null;
}

interface Part { g: BufferGeometry; o: PartOpts }

const tmpC = new Color(), tmpV = new Vector3(), tmpN = new Vector3(), ROT = new Matrix4();

/** Collects parts and merges them (outlined parts first). */
export class PartBuilder {
  private parts: Part[] = [];
  constructor(readonly skinned: boolean, readonly defaultUv: UvMap) {}

  /** Adds `g` (consumed), mapped with its UV projection in part space, then placed by `m` (bone-local). */
  add(g: BufferGeometry, o: PartOpts, m?: Matrix4): this {
    let geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    const map = o.uv ?? this.defaultUv;
    const own = map.kind === 'keep' ? geo.getAttribute('uv') as BufferAttribute | undefined : undefined;
    geo.deleteAttribute('uv');
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const pos = geo.getAttribute('position') as BufferAttribute, n = pos.count;
    // UVs from part-space positions.
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    for (let i = 0; i < n; i++) {
      tmpV.fromBufferAttribute(pos, i);
      if (own) { uv[i * 2] = own.getX(i); uv[i * 2 + 1] = own.getY(i); } else projectUv(map, tmpV, bb.min, bb.max, uv, i);
      const c = o.colorAt?.(tmpV) ?? o.color;
      tmpC.setHex(c);
      col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
    }
    if (!own && (map.kind === 'cyl' || map.kind === 'sphere')) unwrapSeam(uv, map.rect[0], map.rect[2]);
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    // Smoothed inflate directions (normals averaged over coincident positions), before placement.
    const out = new Float32Array(n * 3), f = o.outline ?? 1;
    if (f > 0) {
      // Group coincident vertices by quantized position (0.1 mm), numeric keys, then average their normals.
      const nrm = (geo.getAttribute('normal') as BufferAttribute).array as Float32Array, P = pos.array as Float32Array;
      const group = new Int32Array(n), acc: number[] = [], seen = new Map<number, number[]>();
      for (let i = 0; i < n; i++) {
        const qx = Math.round(P[i * 3]! * 1e4), qy = Math.round(P[i * 3 + 1]! * 1e4), qz = Math.round(P[i * 3 + 2]! * 1e4);
        const h = ((qx * 73856093) ^ (qy * 19349663) ^ (qz * 83492791)) | 0;
        let gi = -1;
        const bucket = seen.get(h);
        if (bucket) for (const g of bucket) { if (acc[g * 6 + 3] === qx && acc[g * 6 + 4] === qy && acc[g * 6 + 5] === qz) { gi = g; break; } }
        if (gi < 0) { gi = acc.length / 6; acc.push(0, 0, 0, qx, qy, qz); if (bucket) bucket.push(gi); else seen.set(h, [gi]); }
        acc[gi * 6] = acc[gi * 6]! + nrm[i * 3]!; acc[gi * 6 + 1] = acc[gi * 6 + 1]! + nrm[i * 3 + 1]!; acc[gi * 6 + 2] = acc[gi * 6 + 2]! + nrm[i * 3 + 2]!;
        group[i] = gi;
      }
      for (let i = 0; i < n; i++) {
        const g = group[i]! * 6;
        tmpN.set(acc[g]!, acc[g + 1]!, acc[g + 2]!);
        if (tmpN.lengthSq() < 1e-12) tmpN.set(nrm[i * 3]!, nrm[i * 3 + 1]!, nrm[i * 3 + 2]!);
        tmpN.normalize().multiplyScalar(f);
        out[i * 3] = tmpN.x; out[i * 3 + 1] = tmpN.y; out[i * 3 + 2] = tmpN.z;
      }
    }
    geo.setAttribute('aOutline', new Float32BufferAttribute(out, 3));
    const em = new Float32Array(n * 2);
    if (o.emit) for (let i = 0; i < n; i++) { em[i * 2] = o.emit[0]; em[i * 2 + 1] = o.emit[1]; }
    geo.setAttribute('aEmit', new Float32BufferAttribute(em, 2));
    if (m) {
      geo.applyMatrix4(m);
      // aOutline is a direction: rotate it with the placement (no translation; scale is uniform-ish).
      const r = ROT.extractRotation(m), a = geo.getAttribute('aOutline') as BufferAttribute;
      for (let i = 0; i < n; i++) {
        tmpN.fromBufferAttribute(a, i);
        const len = tmpN.length();
        if (len > 0) { tmpN.applyMatrix4(r).setLength(len); a.setXYZ(i, tmpN.x, tmpN.y, tmpN.z); }
      }
    }
    this.parts.push({ g: geo, o });
    return this;
  }

  get triangles(): number { return this.parts.reduce((s, p) => s + p.g.getAttribute('position').count / 3, 0); }

  /** Merges everything: outlined parts first. Returns the geometry and the outline twin's vertex count. */
  build(): { geometry: BufferGeometry; outlineVerts: number; tris: number } {
    const lined = this.parts.filter((p) => (p.o.outline ?? 1) > 0), plain = this.parts.filter((p) => (p.o.outline ?? 1) <= 0);
    const order = [...lined, ...plain];
    let total = 0, outlineVerts = 0;
    for (const p of order) total += p.g.getAttribute('position').count;
    for (const p of lined) outlineVerts += p.g.getAttribute('position').count;
    const names = ['position', 'normal', 'color', 'uv', 'aEmit', 'aOutline'] as const;
    const sizes = { position: 3, normal: 3, color: 3, uv: 2, aEmit: 2, aOutline: 3 };
    const arrays = Object.fromEntries(names.map((k) => [k, new Float32Array(total * sizes[k])])) as Record<(typeof names)[number], Float32Array>;
    const skinIndex = this.skinned ? new Uint16Array(total * 4) : null;
    const skinWeight = this.skinned ? new Float32Array(total * 4) : null;
    let off = 0;
    for (const p of order) {
      const g = p.g, n = g.getAttribute('position').count;
      for (const k of names) arrays[k].set((g.getAttribute(k) as BufferAttribute).array as Float32Array, off * sizes[k]);
      if (skinIndex && skinWeight) for (let i = 0; i < n; i++) { skinIndex[(off + i) * 4] = p.o.bone ?? 0; skinWeight[(off + i) * 4] = 1; }
      off += n;
      g.dispose();
    }
    this.parts = [];
    const geo = new BufferGeometry();
    for (const k of names) geo.setAttribute(k, new Float32BufferAttribute(arrays[k], sizes[k]));
    if (skinIndex && skinWeight) {
      geo.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndex, 4));
      geo.setAttribute('skinWeight', new Float32BufferAttribute(skinWeight, 4));
    }
    geo.computeBoundingSphere();
    return { geometry: geo, outlineVerts, tris: total / 3 };
  }
}

/** Wrapped projections: a triangle straddling the back seam (u jumping from the cell's right edge to its left)
 *  would interpolate across the whole cell. Its low-u corners are moved past the right edge, then clamped. */
function unwrapSeam(uv: Float32Array, u0: number, u1: number): void {
  const span = u1 - u0;
  for (let t = 0; t < uv.length / 6; t++) {
    const a = uv[t * 6]!, b = uv[t * 6 + 2]!, c = uv[t * 6 + 4]!;
    if (Math.max(a, b, c) - Math.min(a, b, c) <= span * 0.5) continue;
    for (let k = 0; k < 3; k++) {
      const i = t * 6 + k * 2;
      if (uv[i]! < u0 + span * 0.5) uv[i] = Math.min(u1, uv[i]! + span);
    }
  }
}

function projectUv(map: UvMap, p: Vector3, min: Vector3, max: Vector3, out: Float32Array, i: number): void {
  let u = 0.5, v = 0.5;
  const span = (a: number, lo: number, hi: number) => (hi - lo > 1e-6 ? (a - lo) / (hi - lo) : 0.5);
  switch (map.kind) {
    case 'keep': out[i * 2] = 0; out[i * 2 + 1] = 0; return;
    case 'solid': out[i * 2] = map.u; out[i * 2 + 1] = map.v; return;
    case 'cyl': {
      // Around local y with +x (the body front) at u = 0.5 + u0.
      const a = Math.atan2(-p.z, p.x) / (2 * Math.PI);
      u = (((a + 0.5 + (map.u0 ?? 0)) % 1) + 1) % 1;
      v = span(p.y, min.y, max.y);
      break;
    }
    case 'front': {
      if (p.x < -0.25 * map.r) {
        // The back of the head: a plain corner of the cell on the same side (no smear across the face).
        const r = map.back;
        out[i * 2] = p.z < 0 ? r[0] : r[2]; out[i * 2 + 1] = r[3]; return;
      }
      u = 0.5 - (p.z / map.r) * 0.5; v = 0.5 + (p.y / map.r) * 0.5;
      break;
    }
    case 'planarY': u = span(p.x, min.x, max.x); v = span(p.z, min.z, max.z); break;
    case 'planarZ': u = span(p.x, min.x, max.x); v = span(p.y, min.y, max.y); break;
    case 'sphere': {
      const l = Math.max(1e-6, p.length());
      u = (((Math.atan2(-p.z, p.x) / (2 * Math.PI) + 0.5) % 1) + 1) % 1;
      v = Math.asin(Math.max(-1, Math.min(1, p.y / l))) / (Math.PI / 2);   // 0 at the equator, 1 at the pole
      v = Math.max(0, v);
      break;
    }
  }
  const r = map.rect;
  out[i * 2] = r[0] + (r[2] - r[0]) * Math.min(1, Math.max(0, u));
  out[i * 2 + 1] = r[1] + (r[3] - r[1]) * Math.min(1, Math.max(0, v));
}

// ── primitives (part space; limbs hang along −y from the joint) ───────────────────────────────────────────────
/** Tapered n-sided tube from y = 0 down to y = −len (radius r0 at the top, r1 at the bottom). */
export function tube(r0: number, r1: number, len: number, sides = 6, open = false): BufferGeometry {
  const g = new CylinderGeometry(r0, r1, len, sides, 1, open);
  g.translate(0, -len / 2, 0);
  return g;
}
/** Tube between y0 and y1 (upward), radii at each end. */
export function tubeY(r0: number, r1: number, y0: number, y1: number, sides = 6, open = false): BufferGeometry {
  const g = new CylinderGeometry(r1, r0, Math.abs(y1 - y0), sides, 1, open);
  g.translate(0, (y0 + y1) / 2, 0);
  return g;
}
export function ball(r: number, w = 8, h = 6): BufferGeometry { return new SphereGeometry(r, w, h); }
/** Partial sphere (phi: azimuth start/length, theta: polar start/length, as SphereGeometry). */
export function shell(r: number, w: number, h: number, phi0: number, phiLen: number, th0: number, thLen: number): BufferGeometry {
  return new SphereGeometry(r, w, h, phi0, phiLen, th0, thLen);
}
export function box(w: number, h: number, d: number): BufferGeometry { return new BoxGeometry(w, h, d); }
/** Box from min / max corners. */
export function boxAt(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): BufferGeometry {
  const g = new BoxGeometry(Math.max(1e-3, x1 - x0), Math.max(1e-3, y1 - y0), Math.max(1e-3, z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
/** A 4-sided cone (spike) pointing +y, base at y = 0. */
export function spike(r: number, h: number, sides = 4): BufferGeometry {
  const g = new CylinderGeometry(0, r, h, sides, 1, true);
  g.translate(0, h / 2, 0);
  return g;
}

const M = new Matrix4(), Q = new Matrix4();
/** Placement matrix: translate, then rotate (Euler XYZ, degrees), then scale. */
export function place(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): Matrix4 {
  const d = Math.PI / 180;
  M.makeTranslation(x, y, z);
  Q.makeRotationFromEuler(eulerXYZ(rx * d, ry * d, rz * d));
  M.multiply(Q);
  Q.makeScale(sx, sy, sz);
  return M.multiply(Q).clone();
}
const E = new Euler();
function eulerXYZ(x: number, y: number, z: number): Euler { return E.set(x, y, z, 'XYZ'); }

/** Lighter / darker variant of a hex colour (k > 1 lightens toward white, k < 1 darkens). */
export function shade(hex: Hex, k: number): Hex {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const f = (c: number) => Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k);
  return (Math.min(255, f(r)) << 16) | (Math.min(255, f(g)) << 8) | Math.min(255, f(b));
}
/** Mix two hex colours. */
export function mix(a: Hex, b: Hex, u: number): Hex {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - u) + ((b >> s) & 255) * u);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
/** Relative luminance (0..1) of a hex colour (WCAG). */
export function luminance(hex: Hex): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((hex >> 16) & 255) + 0.7152 * lin((hex >> 8) & 255) + 0.0722 * lin(hex & 255);
}

const BA = new Vector3(), BB = new Vector3(), BD = new Vector3(), BQ = new Quaternion(), BY = new Vector3(0, 1, 0);
/** A box beam from a to b with a square cross-section t (part space). */
export function beam(a: readonly [number, number, number], b: readonly [number, number, number], t: number, t2 = t): BufferGeometry {
  BA.set(a[0], a[1], a[2]); BB.set(b[0], b[1], b[2]);
  BD.subVectors(BB, BA);
  const len = Math.max(1e-4, BD.length());
  const g = new BoxGeometry(t, len, t2);
  BQ.setFromUnitVectors(BY, BD.normalize());
  g.applyQuaternion(BQ);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
