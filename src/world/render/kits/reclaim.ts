// world/render/kits/reclaim.ts: the RECLAIM decor kinds (theme §4 "New decor kinds", §6 vistas; T3). Nature moving
// back in, under the dressing rules (kits/dress.ts, DESIGN §18.4): the clean core |x| ≤ 3.6 gets none of it; flat weed,
// moss and root decals in the edge band 3.6–4.5 stay ≤ 1.3:1 against the surface and ≥ 0.3 m from every grind edge;
// 3D plants grow only at |x| ≥ 4.6 in solid low-poly triangles (no cards, no discard), in the area's flora (DT, SB and
// Docks decor foliage at L ≥ 0.10, Neon dark). Nothing here is cream, near-white or chrome, and nothing flickers.
// Perched birds and the critters are drawn by vfx/critters.ts (they take off), so here they are ambient records only.
import { DECOR_BRANDS } from '../../../core/decor';
import type { Decor } from '../../../core/world';
import { RECLAIM, contrastRatio, relLum, shade, withLum } from '../palette';
import { DECAL, type DecalId } from '../textures/decals';
import { signRect } from '../textures/signs';
import { FACE, FX, type Kit } from '../writer';
import { FLORA, building, crane, crownAt, fern, hz, num, tower } from './buildings';
import { rnd, surfaceLook, type KitCtx } from './common';
import { DRESS, clearOfEdges } from './dress';

type Fn = (c: KitCtx, d: Decor) => void;
const nearOf = (d: Decor) => (d.x > 0 ? FX.near : 0);
const sideOf = (d: Decor): -1 | 1 => (num(d, 'side', Math.sign(d.x) || 1) < 0 ? -1 : 1);
/** Flower colours of the side band: never yellow-gold (coins), never white (grind); Neon has none at street level. */
const BLOOMS = [RECLAIM.flowers.pink, RECLAIM.flowers.lilac, RECLAIM.flowers.cornflower, RECLAIM.flowers.poppy] as const;

/** A flat decal of the edge band, luminance-matched to the surface under it (rule 7: ≤ 1.3:1; darker, like growth),
 *  skipped where it would come within 0.3 m of a grind edge (rule 5). */
function bandDecal(c: KitCtx, id: DecalId, hex: number, x: number, s: number, w: number, len: number, rot: number, alpha: number): void {
  const y = c.groundAt(s, x);
  if (!clearOfEdges(x - w / 2, x + w / 2, s - len / 2, s + len / 2, y - 0.5, y + 0.5, c.edges)) return;
  const sf = surfaceLook(c.surfaceAt(s, x) ?? 'asphalt', c.areaAt(s)).color;
  const L = Math.max(0, (relLum(sf) + 0.05) / BAND_RATIO - 0.05);
  const col = contrastRatio(hex, sf) <= BAND_RATIO ? hex : withLum(hex, L);
  c.decal({ id, x, y: y + 0.006, s, w, len, rot, color: col, alpha, kind: 0 });
}
/** Edge-band decals sit at this contrast against their surface at most (≤ DRESS.edgeBandMaxContrast 1.3). */
export const BAND_RATIO = 1.25;
const bandX = (x: number, half: number) => (Math.sign(x) || 1) * Math.min(DRESS.edgeBand - half, Math.max(DRESS.core + half, Math.abs(x)));

const weedEdge: Fn = (c, d) => {
  const len = num(d, 'len', 3), dens = num(d, 'density', 0.6), area = c.areaAt(d.s), fl = FLORA[area];
  const x = bandX(d.x, 0.3), n = Math.max(1, Math.round(len / 1.2));
  for (let i = 0; i < n; i++) {
    if (rnd(d.s, i, 31) > 0.35 + dens * 0.65) continue;
    bandDecal(c, i % 2 ? DECAL.weedB : DECAL.weedA, fl.moss[i % fl.moss.length]!, x, d.s + (i + 0.5) * (len / n), 0.6, len / n, 0, 0.85);
  }
  // Flower dots only beyond the corridor edge (|x| ≥ 4.6), never in Neon's street band.
  const fw = num(d, 'flowers', 0);
  if (fw > 0 && area !== 'neon') {
    const fx = (Math.sign(x) || 1) * (DRESS.veg + 0.25);
    for (let i = 0; i < n; i++) if (rnd(d.s, i, 32) < fw) {
      const s = d.s + (i + 0.5) * (len / n);
      c.decal({ id: DECAL.flowers, x: fx, y: c.groundAt(s, fx) + 0.007, s, w: 0.5, len: 0.9, rot: 0, color: BLOOMS[(i + d.variant) % 3]!, alpha: 0.9, kind: 0 });
    }
  }
};
const mossPatch: Fn = (c, d) => {
  const r = Math.min(1.5, Math.max(0.3, num(d, 'r', 0.8))), lichen = num(d, 'tint', 0) > 0, fl = FLORA[c.areaAt(d.s)];
  const x = (Math.sign(d.x) || 1) * Math.max(Math.abs(d.x), DRESS.core + r);   // the whole patch beyond the clean core
  bandDecal(c, lichen ? DECAL.lichen : rnd(d.s, 33) < 0.5 ? DECAL.mossA : DECAL.mossB, lichen ? 0x8f9a7a : fl.moss[d.variant % fl.moss.length]!, x, d.s, r * 2, r * 2, rnd(d.s, 34) * 6.28, 0.8);
};
const rootLift: Fn = (c, d) => {
  const len = num(d, 'len', 1.4), x = bandX(sideOf(d) * Math.max(Math.abs(d.x), 4.0), 0.35);
  bandDecal(c, DECAL.rootLift, 0x5a4a3e, x, d.s + len / 2, 0.7, len, 0, 0.8);
};

/** Solid grass blades fanned in a small clump (2 triangles each, ≤ 24 per clump), swaying. */
const wildGrass: Fn = (c, d) => {
  const K = c.K, area = c.areaAt(d.s), fl = FLORA[area], nf = nearOf(d);
  const n = Math.min(12, Math.max(3, Math.round(num(d, 'count', 7)))), h = Math.min(0.9, Math.max(0.3, num(d, 'h', 0.6))) * (d.scale || 1);
  const x = (Math.sign(d.x) || 1) * Math.max(Math.abs(d.x), DRESS.veg + 0.15), y = c.groundAt(d.s, x) || d.y;
  const cols = area === 'neon' ? fl.leaf : [fl.leaf[0]!, fl.leaf[1]!, area === 'docks' ? RECLAIM.seagrass : RECLAIM.dryGrass];
  K.reset().to('b');
  const fw = area === 'neon' ? 0 : num(d, 'flowers', 0);
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + hz(d, 70) * 6, r = 0.05 + 0.18 * rnd(d.s, i, 71), bx = x + Math.cos(a) * r * 0.7, bs = d.s + Math.sin(a) * r;
    const hh = h * (0.6 + 0.4 * rnd(d.s, i, 72)), tx = bx + Math.cos(a) * 0.12, ts = bs + Math.sin(a) * 0.12;
    K.lit(0, 0.5, nf).col(cols[i % cols.length]!);
    K.tri(bx - 0.035, y, bs, bx + 0.035, y, bs, tx, y + hh, ts);
    K.tri(bx + 0.035, y, bs, bx - 0.035, y, bs, tx, y + hh, ts);
    if (fw > 0 && rnd(d.s, i, 73) < fw * 0.5) K.col(BLOOMS[i % 4]!).tri(tx - 0.05, y + hh, ts, tx + 0.05, y + hh, ts, tx, y + hh + 0.07, ts);
  }
};
/** A fern clump, or buddleia with lilac bloom spikes (≤ 60 triangles). */
const shrubWild: Fn = (c, d) => {
  const K = c.K, area = c.areaAt(d.s), fl = FLORA[area], nf = nearOf(d), sc = d.scale || 1;
  const r = Math.min(1.2, Math.max(0.4, num(d, 'r', 0.7))) * sc, h = num(d, 'h', r * 1.2) * sc;
  const x = (Math.sign(d.x) || 1) * Math.max(Math.abs(d.x), DRESS.veg + r * 0.8), y = c.groundAt(d.s, x) || d.y;
  K.reset().to('b');
  if (num(d, 'bloom', 0) < 0.5 || area === 'neon') {
    for (let k = 0; k < 3; k++) fern(K, x + (k - 1) * r * 0.35 * (Math.sign(x) || 1), y, d.s + (k - 1) * r * 0.4, h * (0.8 + 0.2 * k % 2), fl.leaf, nf, k - 1);
    return;
  }
  for (let k = 0; k < 2; k++) K.lit(0, 0.3, nf).col(fl.leaf[k]!).sphere(x + (k ? 0.2 : -0.1) * r, y + h * 0.45, d.s + (k ? 0.3 : -0.2) * r, r * 0.6, 5, 3, 1.1);
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + hz(d, 74) * 3, bx = x + Math.cos(a) * r * 0.45, bs = d.s + Math.sin(a) * r * 0.45, by = y + h * 0.75;
    K.col(k % 2 ? RECLAIM.flowers.lilac : shade(RECLAIM.flowers.lilac, -0.12));
    K.tri(bx - 0.08, by, bs, bx + 0.08, by, bs, bx + Math.cos(a) * 0.15, by + 0.4, bs + Math.sin(a) * 0.15);
    K.tri(bx, by, bs - 0.08, bx, by, bs + 0.08, bx + Math.cos(a) * 0.15, by + 0.4, bs + Math.sin(a) * 0.15);
  }
};
/** A young tree out of a sidewalk crack: slim trunk, two lumps of fresh leaves (≤ 80 triangles). */
const sapling: Fn = (c, d) => {
  const K = c.K, area = c.areaAt(d.s), fl = FLORA[area], nf = nearOf(d), h = Math.min(3, Math.max(1, num(d, 'h', 2))) * (d.scale || 1);
  const r = 0.3 + h * 0.15, x = (Math.sign(d.x) || 1) * Math.max(Math.abs(d.x), DRESS.veg + r), y = c.groundAt(d.s, x) || d.y;
  K.reset().to('b').lit(0, 0, nf).col(0x6b5a4a).frustum(x, d.s, y, y + h * 0.75, 0.05, 0.03, 5, false);
  const cols = area === 'neon' ? fl.leaf : [RECLAIM.newLeaf, fl.leaf[1]!];
  K.lit(0, 0.35, nf).col(cols[0]!).sphere(x, y + h * 0.78, d.s, r, 5, 3, 1.1);
  K.col(cols[1]!).sphere(x + r * 0.3 * (Math.sign(x) || 1), y + h * 0.95, d.s + r * 0.25, r * 0.7, 5, 3, 1);
};
/** A rust shopping cart full of wildflowers (scenery: flowers on top are fine). */
const cartPlanter: Fn = (c, d) => {
  const K = c.K, nf = nearOf(d), x = (Math.sign(d.x) || 1) * Math.max(Math.abs(d.x), DRESS.veg + 0.35), y = c.groundAt(d.s, x) || d.y;
  const x0 = x - 0.28, x1 = x + 0.28, s0 = d.s, s1 = d.s + 0.85;
  K.reset().to('b').lit(0, 0, nf).col(RECLAIM.rustDeep);
  K.box(x0, y + 0.45, s0, x1, y + 0.95, s1, FACE.front | FACE.back | FACE.left | FACE.right);
  K.box(x0 + 0.04, y + 0.42, s0 + 0.05, x1 - 0.04, y + 0.46, s1 - 0.05, FACE.top);
  for (const [wx, ws] of [[x0, s0], [x1, s0], [x0, s1], [x1, s1]] as const) K.col(0x2b2140).box(wx - 0.03, y, ws - 0.03, wx + 0.03, y + 0.45, ws + 0.03);
  K.col(RECLAIM.rustDeep).bar(x0, y + 1.0, s1 + 0.1, x1, y + 1.0, s1 + 0.1, 0.04);
  const fl = FLORA[c.areaAt(d.s)], bloom = num(d, 'bloom', 0.8);
  K.lit(0, 0.3, nf).col(fl.leaf[1]!).sphere(x, y + 0.98, (s0 + s1) / 2, 0.36, 5, 3, 0.7);
  for (let k = 0; k < 5; k++) if (rnd(d.s, k, 75) < bloom) {
    const bx = x + (rnd(d.s, k, 76) - 0.5) * 0.45, bs = s0 + 0.15 + rnd(d.s, k, 77) * 0.55, by = y + 1.1 + rnd(d.s, k, 78) * 0.12;
    K.col(BLOOMS[(k + d.variant) % 4]!).sphere(bx, by, bs, 0.08, 4, 2);
  }
};

/** A cat loaf (sitting, tail wrapped): the wildlife cat and the ginger cat on a decor car's roof. */
export function catLoaf(K: Kit, x: number, y: number, s: number, fur: number, flags: number): void {
  K.lit(0, 0, flags).col(fur).sphere(x, y + 0.13, s, 0.17, 6, 4, 0.8);
  K.sphere(x, y + 0.3, s - 0.1, 0.09, 5, 3);
  K.col(shade(fur, -0.15));
  K.tri(x - 0.07, y + 0.35, s - 0.12, x - 0.02, y + 0.35, s - 0.12, x - 0.05, y + 0.42, s - 0.12);
  K.tri(x + 0.02, y + 0.35, s - 0.12, x + 0.07, y + 0.35, s - 0.12, x + 0.05, y + 0.42, s - 0.12);
  K.bar(x + 0.14, y + 0.03, s - 0.1, x + 0.12, y + 0.03, s + 0.14, 0.035);
}
/** One idle animal at |x| ≥ 6 (or a cross street), broadside to the camera so its silhouette reads. */
const wildlife: Fn = (c, d) => {
  const K = c.K, nf = nearOf(d), sp = num(d, 'species', 1) | 0, out = Math.sign(d.x) || 1;
  const x = out * Math.max(6, Math.abs(d.x)), y = c.groundAt(d.s, x) || d.y, s = d.s;
  K.reset().to('b');
  const legs = (xa: number, xb: number, sa: number, sb: number, h: number, w: number, col: number) => {
    K.lit(0, 0, nf).col(col);
    for (const lx of [xa, xb]) for (const ls of [sa, sb]) K.box(lx - w, y, ls - w, lx + w, y + h, ls + w);
  };
  if (sp === 3) { if (c.areaAt(s) !== 'neon') catLoaf(K, x, y, s, hz(d, 80) < 0.5 ? RECLAIM.tabby[0] : RECLAIM.ginger, nf); return; }
  if (sp === 2) {           // grey heron: long legs, S-neck, dagger beak
    legs(x - 0.06, x + 0.06, s, s, 0.62, 0.015, 0x5a5650);
    K.col(RECLAIM.heron).sphere(x, y + 0.75, s, 0.2, 6, 4, 0.7, 0.3);
    K.col(shade(RECLAIM.heron, -0.2)).bar(x - out * 0.25, y + 0.78, s, x - out * 0.42, y + 0.62, s, 0.05);
    K.col(RECLAIM.heron).bar(x + out * 0.15, y + 0.85, s, x + out * 0.2, y + 1.15, s, 0.04);
    K.sphere(x + out * 0.24, y + 1.2, s, 0.06, 5, 3);
    K.col(0x6a6458).bar(x + out * 0.28, y + 1.2, s, x + out * 0.44, y + 1.17, s, 0.015);
    return;
  }
  // Deer (DT, SB; never Neon) or fox: body, legs, neck and head toward +out, ears.
  if (sp === 0 && c.areaAt(s) === 'neon') return;
  const deer = sp === 0, L = deer ? 1.3 : 0.62, H = deer ? 1.25 : 0.42, hb = deer ? 0.5 : 0.18, col = deer ? 0x9a6a48 : RECLAIM.russetLeaf;
  legs(x - L * 0.38, x + L * 0.38, s - 0.08, s + 0.08, H - hb, deer ? 0.03 : 0.025, shade(col, -0.25));
  K.col(col).box(x - L / 2, y + H - hb, s - (deer ? 0.2 : 0.12), x + L / 2, y + H, s + (deer ? 0.2 : 0.12));
  const down = deer && num(d, 'pose', 0) > 0, nx = x + out * L * 0.5, hx = nx + out * (deer ? 0.25 : 0.12), hy = down ? y + 0.25 : y + H + (deer ? 0.45 : 0.08);
  K.bar(nx, y + H - 0.05, s, hx, hy, s, deer ? 0.08 : 0.06);
  const hx2 = hx + out * (deer ? 0.3 : 0.22);
  K.box(Math.min(hx, hx2), hy - 0.08, s - 0.08, Math.max(hx, hx2), hy + 0.08, s + 0.08);
  K.col(shade(col, -0.18));
  for (const e of [-1, 1]) K.tri(hx - 0.03, hy + 0.07, s + e * 0.05, hx + 0.03, hy + 0.07, s + e * 0.05, hx, hy + (deer ? 0.2 : 0.14), s + e * 0.07);
  if (!deer) K.col(col).bar(x - out * L * 0.5, y + H - 0.1, s, x - out * (L * 0.5 + 0.38), y + 0.12, s, 0.08);
};

/** The area's one big view (theme §6), once per visit: a far-side block (Docks: the water side) the run camera sees
 *  beside the street. Low enough that its hero element shows on screen as it comes up the street. */
const vista: Fn = (c, d) => {
  const area = c.areaAt(d.s), K = c.K, which = num(d, 'which', ['downtown', 'suburbs', 'docks', 'neon'].indexOf(area)) | 0;
  const nf = nearOf(d), out = Math.sign(d.x) || 1, y = d.y, s0 = d.s, w = num(d, 'w', 10), dd = num(d, 'd', 12);
  const xin = d.x, xa = xin + out * Math.min(3.2, w * 0.35);
  if (which === 0) {
    // The Hotel Amberlane fig: a great fig on the hotel's roof terrace, its roots draped down the street face and front.
    const h = 6.6;
    building(c, { ...d, params: { w, d: dd, h, floors: 2, setbacks: 0, awning: 1, brand: DECOR_BRANDS.downtown.indexOf('Hotel Amberlane'), clutter: 0, roofTree: 0, roofGreen: 1, ivy: 0 } });
    const fs = s0 + Math.min(4, dd * 0.3), f = FLORA.downtown;
    K.reset().to('b').lit(0, 0, nf).col(0x6b5a4a).frustum(xa, fs, y + h, y + h + 2.2, 0.5, 0.32, 7, false);
    crownAt(K, xa, y + h + 3.0, fs, 3.2, [f.leaf[0]!, RECLAIM.ivyDeep, f.leaf[2]!], (s0 * 13) | 0, nf, 7, 0.15);
    K.lit(0, 0, nf).col(0x6b5a4a);
    for (let i = 0; i < 8; i++) {
      const u = rnd(s0, i, 81), drop = 3 + 4 * rnd(s0, i, 82);
      if (i < 4) K.bar(xin - out * 0.04, y + h, fs - 2 + i * 1.3, xin - out * 0.04, y + h - drop, fs - 2.3 + i * 1.3 + u, 0.08);
      else K.bar(xin + out * (0.6 + (i - 4) * 0.8), y + h, s0 - 0.05, xin + out * (0.4 + (i - 4) * 0.8 + u * 0.5), y + h - drop, s0 - 0.05, 0.08);
    }
  } else if (which === 1) {
    // The plain water tower (no lettering) wrapped in vines on a meadow lot; its long shadow stripes the street.
    const tx = xin + out * 3.2, ts = s0 + Math.min(dd / 2, 5), H = 7, tank = 0x9aa3a6, f = FLORA.suburbs;
    K.reset().to('b').lit(0, 0, nf).col(RECLAIM.meadowSuburbs).box(Math.min(xin, xin + out * w), y, s0, Math.max(xin, xin + out * w), y + 0.02, s0 + dd, FACE.top);
    K.col(0x7d858a);
    for (const [dx, ds] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) K.box(tx + dx * 1.5 - 0.12, y, ts + ds * 1.5 - 0.12, tx + dx * 1.5 + 0.12, y + H, ts + ds * 1.5 + 0.12);
    K.bar(tx - 1.5, y + 3, ts - 1.5, tx + 1.5, y + 7, ts - 1.5, 0.06); K.bar(tx + 1.5, y + 3, ts - 1.5, tx - 1.5, y + 7, ts - 1.5, 0.06);
    K.col(tank).cyl(tx, ts, y + H, y + H + 4, 2.3, 12, false);
    K.col(shade(tank, -0.2)).frustum(tx, ts, y + H + 4, y + H + 5, 2.4, 0.25, 12, false);
    for (let i = 0; i < 14; i++) {
      const a = i * 0.9 + 2.2, yy = y + H + 0.2 + rnd(s0, i, 83) * 3.4, r = 0.35 + 0.25 * rnd(s0, i, 84);
      K.col(f.ivy[i % 2]!).lit(0, 0.15, nf).sphere(tx + Math.cos(a) * 2.25, yy, ts + Math.sin(a) * 2.25, r, 5, 3, 1.4);
    }
    for (let i = 0; i < 12; i++) K.col(f.ivy[i % 2]!).sphere(tx + (i % 2 ? 1.5 : -1.5), y + 0.6 + (i >> 1) * 1.5, ts - 1.5, 0.3, 5, 3, 1.5);
    crownAt(K, xin + out * 0.9, y + 0.6, s0 + dd * 0.75, 0.9, f.leaf, (s0 * 7) | 0, nf, 3, 0.2);
  } else if (which === 2) {
    // The heron crane: nearer and taller than the other gantries, a heron's nest on its boom and a tree on its cab.
    crane(c, { ...d, params: { h: 34, boom: 28, side: out, nest: 1, tree: 1 } });
  } else {
    // The open sign: a low block whose camera-facing front carries a big Kumo Mart 24 sign, fully lit, with a single
    // 営業中 underneath.
    tower(c, { ...d, params: { w, d: dd, floors: 3, bladeSigns: 0, lit: -0.1 } });
    const lo = Math.min(xin + out * 0.4, xin + out * (w - 0.4)), hi = Math.max(xin + out * 0.4, xin + out * (w - 0.4)), wm = (lo + hi) / 2;
    const big = signRect(`b:neon:${DECOR_BRANDS.neon.indexOf('Kumo Mart 24')}`), word = signRect('w:4'), z = s0 - 0.06;
    K.reset().to('b').lit(0, 0, nf).col(0x2a2440).box(lo - 0.1, y + 5.3, z - 0.25, hi + 0.1, y + 8.1, z);
    K.to('e').glowing(2.0, -1, nf).col(0xffffff);
    K.quad(lo + 0.15, y + 5.45, z - 0.27, hi - 0.15, y + 5.45, z - 0.27, hi - 0.15, y + 7.95, z - 0.27, lo + 0.15, y + 7.95, z - 0.27, [big.u0, big.v0, big.u1, big.v0, big.u1, big.v1, big.u0, big.v1]);
    K.quad(wm - 1.0, y + 4.1, z - 0.02, wm + 1.0, y + 4.1, z - 0.02, wm + 1.0, y + 4.9, z - 0.02, wm - 1.0, y + 4.9, z - 0.02, [word.u0, word.v0, word.u1, word.v0, word.u1, word.v1, word.u0, word.v1]);
    K.to('b');
    if (c.glowLeft > 0) { c.glowLeft--; K.col(0xff7a4a).fxs(0, 0, 0.4, nf).card(wm, y + 6.7, z - 0.4, hi - lo + 1, 3.4); }
  }
  K.to('b');
};

export const RECLAIM_DECOR: Readonly<Record<'weed_edge' | 'moss_patch' | 'root_lift' | 'wild_grass' | 'shrub_wild' | 'sapling' | 'cart_planter'
  | 'perched_birds' | 'wildlife' | 'critter_emitter' | 'drips' | 'vista', Fn>> = {
  weed_edge: weedEdge, moss_patch: mossPatch, root_lift: rootLift, wild_grass: wildGrass, shrub_wild: shrubWild, sapling, cart_planter: cartPlanter,
  perched_birds: () => {}, wildlife, critter_emitter: () => {}, drips: () => {}, vista,
};
