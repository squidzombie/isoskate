// world/render/chunkBuilder.ts: the M0 grey-box chunk builder (ROADMAP M0 item 7). One chunk → merged, flat-shaded,
// vertex-coloured geometry written straight into pooled buffers (no per-box BufferGeometry, no merge pass):
//   - street base, verges and every GroundSlab by surface (stairs as steps, inclines as wedges), pits as dark recesses
//   - solids as boxes coloured by height class (DESIGN §5.5): bump, low landable, low crash (ink), tall (ink body,
//     lighter top, one accent band on the camera face), knock (coral), forbidden band (magenta: a generator bug)
//   - full-width low hazards get safety chevrons (amber / ink)
//   - grind edges: a cream top stripe over a wider ink underline (DESIGN §18.4), widened to stay ≥ minEdgePx on screen
//   - decor as tinted boxes per zone (decor never uses chevrons or the cream edge colour)
// Geometry is chunk-local: x = x, y = y, z = −(s − chunk.s0) (≤ 32 m), so the view rebases with group.position.z.
// Faces: every box writes 5 faces (no bottom); the camera never sees a bottom face and the light is above.
import { Vector3 } from 'three';
import { DECOR_KINDS, isDecorKind } from '../../core/decor';
import { lerp } from '../../core/math';
import { CORRIDOR_HALF, HEIGHT } from '../../core/tuning';
import type { Chunk, Decor, GrindEdge, GroundSlab, Obstacle } from '../../core/world';
import { ObTag } from '../../core/world';
import { COLORS, SURFACE_COLOR } from './palette';
import type { PooledGeo } from './pools';

export { COLORS, SURFACE_COLOR } from './palette';

/** Height class of a solid relative to its local ground (DESIGN §5.5). */
export function heightClass(top: number, ground: number): 'bump' | 'low' | 'forbidden' | 'tall' {
  const h = top - ground;
  if (h <= HEIGHT.bumpMax) return 'bump';
  if (h <= HEIGHT.lowMax) return 'low';
  if (h < HEIGHT.tallMin) return 'forbidden';
  return 'tall';
}

/** Colour of a solid by top type and height class. */
export function solidColor(top: 'landable' | 'crash' | 'knock', y0: number, y1: number): number {
  const cls = heightClass(y1, y0);
  if (top === 'knock') return COLORS.knock;
  if (cls === 'bump') return COLORS.bump;
  if (cls === 'forbidden') return COLORS.forbidden;
  if (cls === 'tall') return COLORS.tall;
  return top === 'landable' ? COLORS.lowLandable : COLORS.lowCrash;
}

// Hexahedron corner index: bit0 = right (x1), bit1 = top, bit2 = near (z1, toward the camera).
// Faces as CCW quads (outward normals): top, near, far, right, left. The bottom is never drawn.
const FACES: readonly (readonly [number, number, number, number])[] = [[6, 7, 3, 2], [4, 5, 7, 6], [1, 0, 2, 3], [5, 1, 3, 7], [0, 4, 6, 2]];
export const VERTS_PER_BOX = FACES.length * 6;

/** Writes flat-shaded, vertex-coloured hexahedra into a PooledGeo. */
export class GeoWriter {
  private g: PooledGeo | null = null;
  readonly min = new Vector3();
  readonly max = new Vector3();
  private readonly c = new Float64Array(24);
  private r = 1; private gr = 1; private b = 1;
  boxes = 0;

  begin(g: PooledGeo): this {
    this.g = g; g.count = 0; this.boxes = 0;
    this.min.set(Infinity, Infinity, Infinity); this.max.set(-Infinity, -Infinity, -Infinity);
    return this;
  }
  end(): PooledGeo { const g = this.g!; g.commit(this.min, this.max); this.g = null; return g; }
  get count(): number { return this.g?.count ?? 0; }

  /** Axis-aligned box from min/max corners (chunk-local axes). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    const c = this.c;
    for (let i = 0; i < 8; i++) {
      c[i * 3] = i & 1 ? x1 : x0; c[i * 3 + 1] = i & 2 ? y1 : y0; c[i * 3 + 2] = i & 4 ? z1 : z0;
    }
    this.emit(color);
  }

  /** Slab or wedge: x0..x1, z0 (far) .. z1 (near); the top is at yNear at z1 and yFar at z0. */
  wedge(x0: number, x1: number, z0: number, z1: number, yBot: number, yFar: number, yNear: number, color: number): void {
    if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4) return;
    const c = this.c;
    for (let i = 0; i < 8; i++) {
      const near = (i & 4) !== 0;
      c[i * 3] = i & 1 ? x1 : x0; c[i * 3 + 2] = near ? z1 : z0;
      c[i * 3 + 1] = i & 2 ? Math.max(yBot + 1e-3, near ? yNear : yFar) : yBot;
    }
    this.emit(color);
  }

  /** A straight beam from A (near) to B (far), ±halfW laterally, from yBot to yTop relative to the line. */
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, halfW: number, yBot: number, yTop: number, color: number): void {
    if (Math.abs(az - bz) < 1e-4) return;
    const c = this.c;
    for (let i = 0; i < 8; i++) {
      const near = (i & 4) !== 0;
      const px = near ? ax : bx, py = near ? ay : by, pz = near ? az : bz;
      c[i * 3] = px + (i & 1 ? halfW : -halfW); c[i * 3 + 1] = py + (i & 2 ? yTop : yBot); c[i * 3 + 2] = pz;
    }
    this.emit(color);
  }

  private emit(color: number): void {
    const g = this.g!;
    this.r = ((color >> 16) & 255) / 255; this.gr = ((color >> 8) & 255) / 255; this.b = (color & 255) / 255;
    // Linear vertex colours (three.js treats vertex colours as linear; the palette hexes are sRGB).
    this.r = srgbToLinear(this.r); this.gr = srgbToLinear(this.gr); this.b = srgbToLinear(this.b);
    g.ensure(g.count + VERTS_PER_BOX);
    const c = this.c;
    for (const f of FACES) {
      const [a, b, cc, d] = f;
      // Face normal from the quad's diagonals (exact for planar quads, a fair average for the rest).
      const ux = c[cc * 3]! - c[a * 3]!, uy = c[cc * 3 + 1]! - c[a * 3 + 1]!, uz = c[cc * 3 + 2]! - c[a * 3 + 2]!;
      const vx = c[d * 3]! - c[b * 3]!, vy = c[d * 3 + 1]! - c[b * 3 + 1]!, vz = c[d * 3 + 2]! - c[b * 3 + 2]!;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-12) continue;                               // degenerate face (zero-height wedge end)
      nx /= nl; ny /= nl; nz /= nl;
      this.vert(c, a, nx, ny, nz); this.vert(c, b, nx, ny, nz); this.vert(c, cc, nx, ny, nz);
      this.vert(c, a, nx, ny, nz); this.vert(c, cc, nx, ny, nz); this.vert(c, d, nx, ny, nz);
    }
    this.boxes++;
  }

  private vert(c: Float64Array, i: number, nx: number, ny: number, nz: number): void {
    const g = this.g!, o = g.count * 3;
    const x = c[i * 3]!, y = c[i * 3 + 1]!, z = c[i * 3 + 2]!;
    g.pos[o] = x; g.pos[o + 1] = y; g.pos[o + 2] = z;
    g.nrm[o] = nx; g.nrm[o + 1] = ny; g.nrm[o + 2] = nz;
    g.col[o] = this.r; g.col[o + 1] = this.gr; g.col[o + 2] = this.b;
    g.count++;
    if (x < this.min.x) this.min.x = x; if (y < this.min.y) this.min.y = y; if (z < this.min.z) this.min.z = z;
    if (x > this.max.x) this.max.x = x; if (y > this.max.y) this.max.y = y; if (z > this.max.z) this.max.z = z;
  }
}

export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export interface BuildOptions {
  /** Half-width of the cream edge stripe, m (≥ minEdgePx / 2 on screen at this viewport's widest framing). */
  edgeHalfW: number;
  /** Extra ink on each side of the cream stripe, m. */
  inkPad: number;
}
export const DEFAULT_BUILD: Readonly<BuildOptions> = { edgeHalfW: 0.035, inkPad: 0.02 };

/** Builds one chunk: `main` gets everything; `near` gets the tall decor on the camera side (+x: backdrops, lamps,
 *  trees), which the view draws shadow-only when ψ > 0 (landscape), where it stands over the corridor on screen
 *  (DESIGN §8: no opaque structure over the corridor). Even a lamp does: at ψ = 30° a +x lamp's head lands on the
 *  obstacles 4–8 m ahead (the contrast gate measured a bench edge behind one at 1.76:1). Its shadow still shows. */
export function buildChunk(ch: Chunk, main: GeoWriter, near: GeoWriter, opts: Readonly<BuildOptions> = DEFAULT_BUILD): void {
  const s0 = ch.s0, s1 = ch.s0 + ch.len;
  const z = (s: number) => -(s - s0);
  // Street base under the corridor (slightly below the datum so a generated road slab at y = 0 wins) and verges.
  main.box(-CORRIDOR_HALF, -0.3, z(s1), CORRIDOR_HALF, -0.005, z(s0), COLORS.asphalt);
  main.box(-18, -0.3, z(s1), -CORRIDOR_HALF, 0.15, z(s0), COLORS.verge);
  main.box(CORRIDOR_HALF, -0.3, z(s1), 18, 0.15, z(s0), COLORS.verge);
  for (const ob of ch.obstacles) obstacle(ob, s0, s1, z, main, opts);
  for (const d of ch.decor) decor(d, z, d.x > 0 ? near : main, main);   // camera-side tall decor → near
}

const clipS = (a: number, b: number, c0: number, c1: number): [number, number] | null => {
  const lo = Math.max(a, c0), hi = Math.min(b, c1);
  return hi > lo + 1e-6 ? [lo, hi] : null;
};

function slab(sl: GroundSlab, s0: number, s1: number, z: (s: number) => number, w: GeoWriter, color: number): void {
  const r = clipS(sl.s0, sl.s1, s0, s1);
  if (!r) return;
  const yAt = (s: number) => lerp(sl.y0, sl.y1, (s - sl.s0) / Math.max(1e-6, sl.s1 - sl.s0));
  const bottom = Math.min(sl.y0, sl.y1, 0) - 0.3;
  if (sl.kind === 'stairs' && sl.steps && sl.steps > 1) {
    const n = sl.steps, len = (sl.s1 - sl.s0) / n;
    for (let i = 0; i < n; i++) {
      const a = sl.s0 + i * len, rr = clipS(a, a + len, r[0], r[1]);
      if (!rr) continue;
      const y = lerp(sl.y0, sl.y1, sl.y1 > sl.y0 ? (i + 1) / n : i / n);
      w.box(sl.x0, bottom, z(rr[1]), sl.x1, y, z(rr[0]), color);
    }
    return;
  }
  w.wedge(sl.x0, sl.x1, z(r[1]), z(r[0]), bottom, yAt(r[1]), yAt(r[0]), color);
}

/** Obstacles are listed in every chunk they overlap; geometry is clipped to this chunk's s-range. */
function obstacle(ob: Obstacle, s0: number, s1: number, z: (s: number) => number, w: GeoWriter, opts: Readonly<BuildOptions>): void {
  for (const sl of ob.slabs) {
    if (ob.solids.length && sl.kind === 'flat') continue;      // a solid body already draws this landable top
    slab(sl, s0, s1, z, w, SURFACE_COLOR[sl.surface] ?? COLORS.asphalt);
  }
  for (const p of ob.pits) {
    const r = clipS(p.s0, p.s1, s0, s1);
    if (r) w.box(p.x0, p.lipY - Math.max(0.05, p.depth), z(r[1]), p.x1, p.lipY + 0.004, z(r[0]), p.cause === 'splash' ? COLORS.water : COLORS.pit);
  }
  const fullWidth = (ob.tags & ObTag.FullWidth) !== 0;
  for (const so of ob.solids) {
    const b = so.box;
    const r = clipS(b.s0, b.s1, s0, s1);
    if (!r) continue;
    const cls = heightClass(b.y1, b.y0);
    w.box(b.x0, b.y0, z(r[1]), b.x1, b.y1, z(r[0]), solidColor(so.top, b.y0, b.y1));
    const front = Math.abs(r[0] - b.s0) < 1e-6;
    if (cls === 'tall') {
      // Ink body, a lighter top, one saturated accent band on the camera-facing front face (DESIGN §18.4).
      w.box(b.x0 + 0.02, b.y1, z(r[1]) + 0.02, b.x1 - 0.02, b.y1 + 0.012, z(r[0]) - 0.02, COLORS.tallTop);
      if (front) w.box(b.x0, b.y1 - 0.18, z(r[0]), b.x1, b.y1 - 0.06, z(r[0]) + 0.012, COLORS.tallAccent);
    }
    if (cls === 'low' && so.top === 'crash' && front && (fullWidth || b.x1 - b.x0 > 6)) {
      // Full-width hazard: a slim band of amber / ink safety chevrons along the top of the front face. Slim on
      // purpose: the silhouette's mean luminance (accent included) must stay ≥ 2.5:1 darker than the road.
      for (let x = b.x0 + 0.15; x < b.x1 - 0.3; x += 0.9) w.box(x, b.y1 - 0.13, z(r[0]), x + 0.3, b.y1 - 0.03, z(r[0]) + 0.015, COLORS.chevron);
    }
  }
  for (const e of ob.edges) grindEdge(e, s0, s1, z, w, opts);
}

/** Cream top stripe over a wider ink underline, following the edge's slope and lateral drift. */
function grindEdge(e: GrindEdge, s0: number, s1: number, z: (s: number) => number, w: GeoWriter, opts: Readonly<BuildOptions>): void {
  const r = clipS(e.a.s, e.b.s, s0, s1);
  if (!r) return;
  const span = Math.max(1e-6, e.b.s - e.a.s);
  const pa = (r[0] - e.a.s) / span, pb = (r[1] - e.a.s) / span;
  const ax = lerp(e.a.x, e.b.x, pa), ay = lerp(e.a.y, e.b.y, pa), bx = lerp(e.a.x, e.b.x, pb), by = lerp(e.a.y, e.b.y, pb);
  const hw = opts.edgeHalfW, ink = hw + opts.inkPad;
  // The stripe sits on the edge line; an edge at a slab border pokes 1 cm above the surface so it never z-fights.
  w.beam(ax, ay, z(r[0]), bx, by, z(r[1]), ink, -0.05, 0.006, COLORS.ink);
  w.beam(ax, ay, z(r[0]) - 0.004, bx, by, z(r[1]) + 0.004, hw, -0.02, 0.014, COLORS.edgeCream);
}

const num = (d: Decor, k: string, def: number) => d.params?.[k] ?? def;

/** Decor as tinted boxes by zone. Backdrop kinds extend away from the corridor from their street face at x.
 *  `w` takes the tall pieces (backdrops, lamps, trees), `main` the low furniture and overhead spans. */
function decor(d: Decor, z: (s: number) => number, w: GeoWriter, main: GeoWriter): void {
  const kind = d.kind;
  const zone = isDecorKind(kind) ? DECOR_KINDS[kind].zone : kind === 'building' ? 'backdrop' : null;
  if (!zone || zone === 'ground' || zone === 'ambient') return;   // decals and emitters: WA
  const out = Math.sign(d.x || 1), sc = d.scale || 1;
  if (zone === 'backdrop') {
    if (kind === 'water' || kind === 'city_glow' || kind === 'shadow_caster') return;
    const wd = num(d, 'w', 8) * sc, dd = num(d, 'd', kind === 'end_wall' ? 1.2 : 14) * sc;
    const h = num(d, 'h', kind === 'tower' ? num(d, 'floors', 11) * 3.2 : 12) * sc;
    const xIn = d.x, xOut = d.x + out * wd;
    const col = COLORS.building[d.variant % COLORS.building.length]!;
    w.box(Math.min(xIn, xOut), d.y, z(d.s + dd), Math.max(xIn, xOut), d.y + h, z(d.s), col);
    return;
  }
  if (zone === 'overhead') {
    // Thin span across the street at its lowest height (≤ 0.3 m thick), only where WG put it.
    const x0 = num(d, 'x0', -6), x1 = num(d, 'x1', 6);
    main.box(Math.min(x0, x1), d.y, z(d.s) - 0.06, Math.max(x0, x1), d.y + 0.06, z(d.s), COLORS.ink);
    return;
  }
  // Side band: lamps, trees and street furniture.
  if (kind === 'street_lamp') {
    const h = num(d, 'h', 5) * sc;
    w.box(d.x - 0.06, d.y, z(d.s) - 0.06, d.x + 0.06, d.y + h, z(d.s) + 0.06, COLORS.pole);
    w.box(d.x - 0.18, d.y + h - 0.2, z(d.s) - 0.18, d.x + 0.18, d.y + h + 0.05, z(d.s) + 0.18, COLORS.lampHead);
  } else if (kind === 'tree' || kind === 'cherry_tree') {
    const tr = num(d, 'trunkH', 2.6) * sc, cr = num(d, 'crown', 1.6) * sc;
    w.box(d.x - 0.1, d.y, z(d.s) - 0.1, d.x + 0.1, d.y + tr, z(d.s) + 0.1, COLORS.pole);
    w.box(d.x - cr * 0.8, d.y + tr, z(d.s) - cr * 0.8, d.x + cr * 0.8, d.y + tr + cr * 1.4, z(d.s) + cr * 0.8, COLORS.foliage);
  } else {
    const len = Math.min(6, num(d, 'len', 0.6)), h = Math.min(3, num(d, 'h', 1.0));
    main.box(d.x - 0.3, d.y, z(d.s + len), d.x + 0.3, d.y + h, z(d.s), COLORS.side[d.variant % COLORS.side.length]!);
  }
}
