// world/render/kits/buildings.ts: backdrop decor (DESIGN §18.5 building recipe, §18.6 area kits): city buildings,
// suburban gable houses, ribbed dock warehouses, slim Neon towers, cross-street end walls, container stacks, cranes,
// the Harbor Bridge truss, the Underpass tunnel, water, the city glow, and shadow-only casters.
// Buildings stand outside the corridor (street face at |x| ≥ 5): in portrait they are mostly seen through their long
// shadows and at the screen edges at top speed; in landscape and in the Title / Locker perspective view their
// facades show (windows from the window-lit ratio, ground-floor shopfronts, awnings and brand boards).
// Building bodies go to the 'b' mesh (it casts); windows and lit signs to 'e'; awnings and clutter to 'b' too.
import { DECOR_BRANDS, NEON_SIGN_WORDS } from '../../../core/decor';
import type { AreaId } from '../../../core/ids';
import type { Decor } from '../../../core/world';
import { ACCENTS, COLORS, mixHex, shade } from '../palette';
import { PAT } from '../textures/ground';
import { signRect } from '../textures/signs';
import { FACE, FX, type Kit } from '../writer';
import { rnd, type KitCtx } from './common';

export const num = (d: Decor, k: string, def: number) => { const v = d.params?.[k]; return v === undefined || !Number.isFinite(v) ? def : v; };

const FACADES: Readonly<Record<AreaId, readonly number[]>> = {
  downtown: [0xd9765a, 0xc9a15a, 0xe8d2b0, 0x3e8e8a, 0xb5645a, 0xe8b38f, 0x9c7bb0, 0xc4473d],
  suburbs: [0xf3e7d3, 0xe7d0b0, 0xcfe0ec, 0xf2dcc8, 0xd8e6d0],
  docks: [0x8a8fa0, 0xb5552f, 0x2f5d7c, 0x5e8c6a, 0x9c8f80],
  neon: [0x3a3366, 0x2e2a52, 0x463a6e, 0x2a2648],
};

/** Paints a painted brand board (lit material) with a sign-atlas key. */
export function board(K: Kit, key: string, x0: number, x1: number, y0: number, y1: number, s: number, normalX = 0): void {
  const r = signRect(key);
  const uv = [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1] as const;
  K.col(0xffffff);
  if (normalX === 0) K.quad(x0, y0, s, x1, y0, s, x1, y1, s, x0, y1, s, uv);
  else if (normalX > 0) K.quad(x0, y0, s, x0, y0, x1, x0, y1, x1, x0, y1, s, uv);    // a face looking +x: x0 = plane x, s..x1 along s
  else K.quad(x0, y0, x1, x0, y0, s, x0, y1, s, x0, y1, x1, uv);                     // a face looking −x
}

/** Window grid on a facade. `plane` is 'front' (faces −s at s = sFace, spans x0..x1) or 'side' (faces `dir`·x at
 *  x = xFace, spans s0..s1). Windows go to the emissive mesh with a per-window random (window-lit ratio). */
function windows(c: KitCtx, seed: number, plane: 'front' | 'side', a0: number, a1: number, face: number, dir: number,
  y0: number, y1: number, cell: number, warm: number, flags: number): void {
  const K = c.K;
  const floors = Math.max(1, Math.floor((y1 - y0) / 3.2)), fh = (y1 - y0) / floors;
  const cols = Math.max(1, Math.floor((a1 - a0) / cell)), cw = (a1 - a0) / cols;
  K.to('e');
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < cols; i++) {
      const r = rnd(seed, f, i);
      K.glowing(1.35, r, flags).col(mixHex(warm, 0xfff1c9, rnd(seed, i, f, 7) * 0.6));
      const ya = y0 + f * fh + fh * 0.3, yb = ya + fh * 0.5, ua = a0 + i * cw + cw * 0.22, ub = ua + cw * 0.56;
      if (plane === 'front') K.quad(ua, ya, face - 0.03, ub, ya, face - 0.03, ub, yb, face - 0.03, ua, yb, face - 0.03);
      else if (dir < 0) K.quad(face - 0.03, ya, ub, face - 0.03, ya, ua, face - 0.03, yb, ua, face - 0.03, yb, ub);
      else K.quad(face + 0.03, ya, ua, face + 0.03, ya, ub, face + 0.03, yb, ub, face + 0.03, yb, ua);
    }
  }
  K.to('b');
}

/** Building recipe: base + setbacks + darker cornice + windows + shopfront, awning, brand board + roof clutter. */
export function building(c: KitCtx, d: Decor): void {
  const K = c.K, area = c.areaAt(d.s);
  const sc = d.scale || 1, out = Math.sign(d.x) || 1, xin = d.x;
  const w = num(d, 'w', 8) * sc, dd = num(d, 'd', 14) * sc, h = num(d, 'h', 14) * sc;
  const x0 = Math.min(xin, xin + out * w), x1 = Math.max(xin, xin + out * w), s0 = d.s, s1 = d.s + dd, y = d.y;
  const pal = FACADES[area];
  const tint = num(d, 'tint', (rnd(d.s, d.x, 3) - 0.5) * 0.08);
  const wall = shade(pal[(num(d, 'facade', d.variant)) % pal.length]!, tint);
  const near = d.x > 0 ? FX.near : 0;
  const cast = d.castShadow ? 0 : 0;
  void cast;
  K.reset().to('b').lit(area === 'docks' ? PAT.ribsV : area === 'neon' ? 0 : PAT.brickWall, 0, near);
  K.col(wall).box(x0, y, s0, x1, y + h, s1);
  // Cornice (darker band with a 0.15 m overhang).
  if (num(d, 'cornice', 1)) K.lit(0, 0, near).col(shade(wall, -0.3)).box(x0 - 0.15, y + h - 0.45, s0 - 0.15, x1 + 0.15, y + h, s1 + 0.15, FACE.sides5);
  // Setbacks on the roof, away from the street.
  const sb = num(d, 'setbacks', 1);
  for (let k = 0; k < sb; k++) {
    const f = 0.55 - k * 0.15, hh = 2.5 + rnd(d.s, k) * 3;
    const xa = out > 0 ? x0 + w * (0.25 + k * 0.1) : x0 + w * (0.25 - k * 0.1), xb = xa + w * f;
    K.lit(0, 0, near).col(shade(wall, -0.08)).box(Math.min(xa, xb), y + h, s0 + dd * 0.2, Math.max(xa, xb), y + h + hh, s1 - dd * 0.25);
  }
  // Roof clutter: water tank, AC boxes, antennas.
  const clutter = num(d, 'clutter', 3);
  if (clutter & 1) {
    const tx = xin + out * w * 0.7, ts = s0 + dd * 0.7;
    K.lit(0, 0, near).col(0x5a4636).cyl(tx, ts, y + h, y + h + 1.2, 0.08, 4, false);
    K.lit(PAT.planks, 0, near).col(0x8a6a4e).cyl(tx, ts, y + h + 1.2, y + h + 2.6, 0.9, 8, false);
    K.col(0x4a3b6b).frustum(tx, ts, y + h + 2.6, y + h + 3.2, 0.95, 0.1, 8, false);
  }
  if (clutter & 2) for (let k = 0; k < 2; k++) K.lit(0, 0, near).col(0xb9b3c2).box(xin + out * (1 + k * 1.6), y + h, s0 + 1 + k * 2.5, xin + out * (2.1 + k * 1.6), y + h + 0.8, s0 + 2 + k * 2.5);
  if (clutter & 4) K.lit(0, 0, near).col(0x2b2140).box(xin + out * 2, y + h, s1 - 2, xin + out * 2.06, y + h + 3.5, s1 - 1.94);
  // Windows: street face (toward the corridor) and the camera-facing front, above the ground floor.
  const flags = near;
  const warm = area === 'neon' ? 0xffd39a : 0xffc98a;
  const lit = num(d, 'lit', 0);
  windows(c, (d.s * 13 + d.x * 7) | 0, 'side', s0 + 0.5, s1 - 0.5, xin, -out, y + 3.6, y + h - 0.6, 2.6, warm, flags);
  windows(c, (d.s * 17 + d.x * 5) | 0, 'front', x0 + 0.4, x1 - 0.4, s0, 0, y + 3.6, y + h - 0.6, 2.6, warm, flags);
  void lit;
  // Ground floor: a lit shopfront band on the street face and the front, a brand board above it, an awning.
  K.to('e').glowing(1.15, rnd(d.s, d.x, 11) * 0.7, flags).col(area === 'neon' ? 0xffb7d0 : 0xffd9a0);
  if (out > 0) K.quad(xin - 0.04, y + 0.3, s1 - 0.6, xin - 0.04, y + 0.3, s0 + 0.6, xin - 0.04, y + 2.6, s0 + 0.6, xin - 0.04, y + 2.6, s1 - 0.6);
  else K.quad(xin + 0.04, y + 0.3, s0 + 0.6, xin + 0.04, y + 0.3, s1 - 0.6, xin + 0.04, y + 2.6, s1 - 0.6, xin + 0.04, y + 2.6, s0 + 0.6);
  K.quad(x0 + 0.6, y + 0.3, s0 - 0.04, x1 - 0.6, y + 0.3, s0 - 0.04, x1 - 0.6, y + 2.6, s0 - 0.04, x0 + 0.6, y + 2.6, s0 - 0.04);
  K.to('b');
  const brand = num(d, 'brand', -1);
  const brands = DECOR_BRANDS[area];
  if (brand >= 0 && brands.length) {
    const key = area === 'neon' ? `b:neon:${brand % brands.length}` : `b:${area}:${brand % brands.length}`;
    K.lit(0, 0, flags);
    board(K, key, x0 + 0.5, Math.min(x1 - 0.5, x0 + 0.5 + Math.min(6, w - 1)), y + 2.75, y + 3.45, s0 - 0.06);
  }
  if (num(d, 'awning', 1)) awningAt(c, xin, s0 + 1, s1 - 1, y + 2.6, area, d.variant, flags);
}

/** An awning on a facade at x = xFace over [s0, s1] (reach toward the street, its outer tip at |x| ≥ 4.6). */
export function awningAt(c: KitCtx, xFace: number, s0: number, s1: number, yTop: number, area: AreaId, variant: number, flags: number, reach = 1.0): void {
  const K = c.K, inward = -(Math.sign(xFace) || 1);
  const r = Math.max(0, Math.min(reach, Math.abs(xFace) - 4.6));
  if (r < 0.15 || s1 - s0 < 0.5) return;
  const tip = xFace + inward * r, acc = ACCENTS[area][variant % ACCENTS[area].length]!;
  const st = signRect('stripe');
  K.lit(0, 0, flags).col(acc);
  const uv = [st.u0, st.v0, st.u1 * 0 + st.u0 + (st.u1 - st.u0) * Math.max(1, (s1 - s0) / 1.2), st.v0, st.u1, st.v1, st.u0, st.v1] as const;
  void uv;
  // Sloped canopy (two-sided look: top and a valance facing the camera).
  if (inward > 0) K.quad(xFace, yTop, s0, xFace, yTop, s1, tip, yTop - 0.5, s1, tip, yTop - 0.5, s0);
  else K.quad(xFace, yTop, s1, xFace, yTop, s0, tip, yTop - 0.5, s0, tip, yTop - 0.5, s1);
  K.col(shade(acc, -0.15)).box(Math.min(tip, tip + inward * 0.02), yTop - 0.75, s0, Math.max(tip, tip + inward * 0.02), yTop - 0.5, s1, FACE.front | FACE.left | FACE.right | FACE.back);
  // Stripes on the canopy top.
  K.col(0xfff4e3);
  for (let s = s0 + 0.15; s < s1 - 0.3; s += 0.6) {
    if (inward > 0) K.quad(xFace, yTop + 0.005, s, xFace, yTop + 0.005, s + 0.3, tip, yTop - 0.495, s + 0.3, tip, yTop - 0.495, s);
    else K.quad(xFace, yTop + 0.005, s + 0.3, xFace, yTop + 0.005, s, tip, yTop - 0.495, s, tip, yTop - 0.495, s + 0.3);
  }
}

/** Suburban gable house, seen mostly as a roof and its shadow; porch toward the street. */
export function house(c: KitCtx, d: Decor): void {
  const K = c.K, out = Math.sign(d.x) || 1, sc = d.scale || 1;
  const w = num(d, 'w', 9) * sc, dd = num(d, 'd', 10) * sc, h = num(d, 'h', 3.2) * sc, rh = num(d, 'roofH', 2.4) * sc;
  const x0 = Math.min(d.x, d.x + out * w), x1 = Math.max(d.x, d.x + out * w), s0 = d.s, s1 = d.s + dd, y = d.y;
  const near = d.x > 0 ? FX.near : 0;
  const wall = FACADES.suburbs[d.variant % FACADES.suburbs.length]!;
  const roof = ACCENTS.suburbs[num(d, 'roof', 4) % 5]!;
  const roofCol = roof === 0xf7efe3 ? 0xb5645a : roof;
  K.reset().to('b').lit(0, 0, near).col(wall).box(x0, y, s0, x1, y + h, s1);
  // Gable roof: ridge along s, eaves overhang.
  const xm = (x0 + x1) / 2, eave = 0.4;
  K.lit(PAT.ribsH, 0, near).col(shade(roofCol, -0.1));
  K.quad(x0 - eave, y + h - 0.2, s0 - eave, xm, y + h + rh, s0 - eave, xm, y + h + rh, s1 + eave, x0 - eave, y + h - 0.2, s1 + eave);
  K.quad(xm, y + h + rh, s0 - eave, x1 + eave, y + h - 0.2, s0 - eave, x1 + eave, y + h - 0.2, s1 + eave, xm, y + h + rh, s1 + eave);
  K.lit(0, 0, near).col(wall);
  K.tri(x0, y + h, s0, x1, y + h, s0, xm, y + h + rh - 0.2, s0);
  K.tri(x1, y + h, s1, x0, y + h, s1, xm, y + h + rh - 0.2, s1);
  // Windows and a door on the street side, a porch roof.
  const streetX = d.x;
  for (let i = 0; i < 3; i++) {
    const s = s0 + dd * (0.2 + i * 0.3);
    K.to('e').glowing(1.2, rnd(d.s, i, 5), near).col(0xffd9a0);
    if (out > 0) K.quad(streetX - 0.03, y + 1.0, s + 0.8, streetX - 0.03, y + 1.0, s, streetX - 0.03, y + 2.2, s, streetX - 0.03, y + 2.2, s + 0.8);
    else K.quad(streetX + 0.03, y + 1.0, s, streetX + 0.03, y + 1.0, s + 0.8, streetX + 0.03, y + 2.2, s + 0.8, streetX + 0.03, y + 2.2, s);
    K.to('b');
  }
  if (num(d, 'porch', 1)) K.lit(0, 0, near).col(0xf7efe3).box(Math.min(streetX, streetX - out * 1.2), y + 2.4, s0 + dd * 0.35, Math.max(streetX, streetX - out * 1.2), y + 2.55, s0 + dd * 0.65);
  if (num(d, 'garage', 0)) {
    const ga = d.x, gb = d.x + out * w * 0.55;
    K.lit(0, 0, near).col(shade(wall, -0.1)).box(Math.min(ga, gb), y, s1, Math.max(ga, gb), y + h * 0.8, s1 + 4);
  }
}

/** Ribbed dock warehouse with a roller door toward the street and a painted sign band. */
export function warehouse(c: KitCtx, d: Decor): void {
  const K = c.K, out = Math.sign(d.x) || 1, sc = d.scale || 1;
  const w = num(d, 'w', 16) * sc, dd = num(d, 'd', 24) * sc, h = num(d, 'h', 9) * sc;
  const x0 = Math.min(d.x, d.x + out * w), x1 = Math.max(d.x, d.x + out * w), s0 = d.s, s1 = d.s + dd, y = d.y;
  const near = d.x > 0 ? FX.near : 0;
  const col = ACCENTS.docks[num(d, 'color', d.variant) % ACCENTS.docks.length]!;
  K.reset().to('b').lit(PAT.ribsV, 0, near).col(col).box(x0, y, s0, x1, y + h, s1);
  K.lit(PAT.ribsH, 0, near).col(shade(col, -0.25)).quad(x0 - 0.3, y + h, s0 - 0.3, (x0 + x1) / 2, y + h + 1.6, s0 - 0.3, (x0 + x1) / 2, y + h + 1.6, s1 + 0.3, x0 - 0.3, y + h, s1 + 0.3);
  K.quad((x0 + x1) / 2, y + h + 1.6, s0 - 0.3, x1 + 0.3, y + h, s0 - 0.3, x1 + 0.3, y + h, s1 + 0.3, (x0 + x1) / 2, y + h + 1.6, s1 + 0.3);
  K.lit(0, 0, near).col(col).tri(x0, y + h, s0, x1, y + h, s0, (x0 + x1) / 2, y + h + 1.6, s0);
  if (num(d, 'door', 1)) {
    const sm = (s0 + s1) / 2;
    K.lit(PAT.ribsH, 0, near).col(0x9c9aa8);
    if (out > 0) K.quad(d.x - 0.04, y, sm + 2.5, d.x - 0.04, y, sm - 2.5, d.x - 0.04, y + 4.5, sm - 2.5, d.x - 0.04, y + 4.5, sm + 2.5);
    else K.quad(d.x + 0.04, y, sm - 2.5, d.x + 0.04, y, sm + 2.5, d.x + 0.04, y + 4.5, sm + 2.5, d.x + 0.04, y + 4.5, sm - 2.5);
  }
  const brand = num(d, 'brand', -1);
  if (brand >= 0) { K.lit(0, 0, near); board(K, `b:docks:${brand % DECOR_BRANDS.docks.length}`, x0 + 1, Math.min(x1 - 1, x0 + 8), y + h - 2.2, y + h - 0.6, s0 - 0.05); }
  windows(c, (d.s * 3) | 0, 'front', x0 + 1, x1 - 1, s0, 0, y + h - 3.2, y + h - 0.2, 2.2, 0xffc98a, near);
}

/** Slim Neon tower (8–14 storeys): emissive window dots, vertical blade signs on the street face, a roof crown. */
export function tower(c: KitCtx, d: Decor): void {
  const K = c.K, out = Math.sign(d.x) || 1, sc = d.scale || 1;
  const w = num(d, 'w', 8) * sc, dd = num(d, 'd', 9) * sc, h = num(d, 'floors', 11) * 3.2 * sc;
  const x0 = Math.min(d.x, d.x + out * w), x1 = Math.max(d.x, d.x + out * w), s0 = d.s, s1 = d.s + dd, y = d.y;
  const near = d.x > 0 ? FX.near : 0;
  const wall = FACADES.neon[d.variant % FACADES.neon.length]!;
  K.reset().to('b').lit(0, 0, near).col(wall).box(x0, y, s0, x1, y + h, s1);
  K.col(shade(wall, -0.25)).box(x0 - 0.2, y + h - 0.5, s0 - 0.2, x1 + 0.2, y + h, s1 + 0.2, FACE.sides5);
  const acc = ACCENTS.neon[num(d, 'accent', d.variant) % ACCENTS.neon.length]!;
  K.to('e').glowing(1.6, -1, near).col(acc).box(x0 - 0.22, y + h - 0.28, s0 - 0.22, x1 + 0.22, y + h - 0.2, s1 + 0.22, FACE.front | FACE.left | FACE.right);
  K.to('b');
  windows(c, (d.s * 7 + d.x) | 0, 'side', s0 + 0.4, s1 - 0.4, d.x, -out, y + 3.4, y + h - 0.6, 1.4, 0xbfd8ff, near);
  windows(c, (d.s * 11 + d.x) | 0, 'front', x0 + 0.4, x1 - 0.4, s0, 0, y + 3.4, y + h - 0.6, 1.4, 0xffd39a, near);
  // Ground floor shopfront (lit) and blade signs hung perpendicular to the street face.
  K.to('e').glowing(1.4, -1, near).col(0xffb7d0);
  K.quad(x0 + 0.4, y + 0.3, s0 - 0.04, x1 - 0.4, y + 0.3, s0 - 0.04, x1 - 0.4, y + 2.8, s0 - 0.04, x0 + 0.4, y + 2.8, s0 - 0.04);
  K.to('b');
  const n = num(d, 'bladeSigns', 1);
  for (let k = 0; k < n; k++) bladeSignAt(c, d.x - out * 0.05, s0 + 1.5 + k * 3.2, y + 4 + k * 2.5, 3.2, 0.6, (d.variant + k) % (DECOR_BRANDS.neon.length + NEON_SIGN_WORDS.length), 'neon', near);
}

/** A vertical blade sign at the facade x, hanging perpendicular (its faces look ±s: the camera sees the front). */
export function bladeSignAt(c: KitCtx, xFace: number, s: number, y0: number, h: number, wd: number, pick: number, area: AreaId, flags: number): void {
  const K = c.K, inward = -(Math.sign(xFace) || 1);
  const xa = xFace, xb = xFace + inward * wd;
  // Keep the inner edge at |x| ≥ 4.9 (DESIGN §8).
  const lim = 4.9 * (Math.sign(xFace) || 1);
  const xi = Math.abs(xb) < 4.9 ? lim : xb;
  const x0 = Math.min(xa, xi), x1 = Math.max(xa, xi);
  if (x1 - x0 < 0.15) return;
  K.to('b').lit(0, 0, flags).col(0x2b2140).box(x0 - 0.03, y0 - 0.05, s - 0.08, x1 + 0.03, y0 + h + 0.05, s + 0.08);
  K.col(0x4a3b6b).box(Math.min(xa, xa - inward * 0.0) - 0.02, y0 + h - 0.1, s - 0.03, Math.max(xa, xa) + 0.02, y0 + h + 0.25, s + 0.03);
  const brands = DECOR_BRANDS[area].length;
  const neon = area === 'neon';
  const key = neon ? (pick < brands ? `t:neon:${pick}` : `wt:${(pick - brands) % NEON_SIGN_WORDS.length}`) : `t:downtown:${pick % DECOR_BRANDS.downtown.length}`;
  const r = signRect(key);
  if (neon) {
    K.to('e').glowing(1.8, -1, flags).col(0xffffff);
    K.quad(x0, y0, s - 0.085, x1, y0, s - 0.085, x1, y0 + h, s - 0.085, x0, y0 + h, s - 0.085, [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1]);
    K.to('b');
    if (c.glowLeft > 0) { c.glowLeft--; K.col(pick % 2 ? 0xff3fa4 : 0x3ff2ff).fxs(0, 0, 0.5, 0).card((x0 + x1) / 2, y0 + h / 2, s - 0.15, (x1 - x0) * 2.4, h * 1.3); }
  } else {
    K.lit(0, 0, flags);
    board(K, key, x0, x1, y0, y0 + h, s - 0.085);
  }
}

/** Cross-street end wall (every 8–12 s): a corner shopfront, pastel ribbed shutters (Neon), warehouse doors (Docks)
 *  or a house front (Suburbs), facing the camera; its inner edge at |x| ≥ 4.6. */
export function endWall(c: KitCtx, d: Decor): void {
  const K = c.K, area = c.areaAt(d.s), out = Math.sign(d.x) || 1, sc = d.scale || 1;
  const w = num(d, 'w', 9) * sc, h = num(d, 'h', 8) * sc, depth = 1.2;
  const xin = Math.sign(d.x) * Math.max(4.6, Math.abs(d.x));
  const x0 = Math.min(xin, xin + out * w), x1 = Math.max(xin, xin + out * w), s0 = d.s, y = d.y;
  const near = d.x > 0 ? FX.near : 0;
  const style = num(d, 'style', area === 'neon' ? 1 : area === 'docks' ? 2 : area === 'suburbs' ? 3 : 0);
  const wall = shade(FACADES[area][d.variant % FACADES[area].length]!, -0.05);
  K.reset().to('b').lit(area === 'neon' ? 0 : PAT.brickWall, 0, near).col(wall).box(x0, y, s0, x1, y + h, s0 + depth);
  K.lit(0, 0, near).col(shade(wall, -0.3)).box(x0 - 0.1, y + h - 0.3, s0 - 0.15, x1 + 0.1, y + h, s0 + depth, FACE.sides5);
  if (style === 1) {
    const bays = Math.max(1, Math.min(6, num(d, 'shutters', 3))), bw = (x1 - x0 - 0.4) / bays;
    const pastel = [0xa8d8c8, 0xf4c2d0, 0xc8c0f0, 0xf6e2a8, 0xb8d4f0];
    for (let i = 0; i < bays; i++) {
      K.lit(PAT.ribsH, 0, near).col(pastel[(i + d.variant) % pastel.length]!);
      K.quad(x0 + 0.2 + i * bw + 0.05, y + 0.05, s0 - 0.02, x0 + 0.2 + (i + 1) * bw - 0.05, y + 0.05, s0 - 0.02, x0 + 0.2 + (i + 1) * bw - 0.05, y + 2.8, s0 - 0.02, x0 + 0.2 + i * bw + 0.05, y + 2.8, s0 - 0.02);
    }
    const word = num(d, 'word', -1), brand = num(d, 'brand', -1);
    const key = word >= 0 ? `w:${word % NEON_SIGN_WORDS.length}` : `b:neon:${Math.max(0, brand) % DECOR_BRANDS.neon.length}`;
    const r = signRect(key);
    K.to('e').glowing(1.8, -1, near).col(0xffffff);
    K.quad(x0 + 0.5, y + 3.1, s0 - 0.03, x0 + 0.5 + Math.min(5, x1 - x0 - 1), y + 3.1, s0 - 0.03, x0 + 0.5 + Math.min(5, x1 - x0 - 1), y + 4.3, s0 - 0.03, x0 + 0.5, y + 4.3, s0 - 0.03, [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1]);
    K.to('b');
    if (c.glowLeft > 0) { c.glowLeft--; K.col(0xff3fa4).fxs(0, 0, 0.45, 0).card(x0 + 0.5 + Math.min(2.5, (x1 - x0 - 1) / 2), y + 3.7, s0 - 0.1, Math.min(6, x1 - x0), 2.2); }
  } else if (style === 2) {
    K.lit(PAT.ribsH, 0, near).col(0x9c9aa8).quad(x0 + 0.6, y, s0 - 0.02, x0 + 4.4, y, s0 - 0.02, x0 + 4.4, y + 4, s0 - 0.02, x0 + 0.6, y + 4, s0 - 0.02);
    const brand = num(d, 'brand', d.variant);
    K.lit(0, 0, near); board(K, `b:docks:${brand % DECOR_BRANDS.docks.length}`, x0 + 0.6, Math.min(x1 - 0.4, x0 + 6), y + 4.6, y + 5.8, s0 - 0.03);
  } else if (style === 3) {
    K.lit(0, 0, near).col(0xf7efe3).box(x0 + 1, y, s0 - 0.1, x0 + 2, y + 2.1, s0);
    K.to('e').glowing(1.1, rnd(d.s, 2), near).col(0xffd9a0);
    K.quad(x0 + 2.6, y + 1, s0 - 0.03, x0 + 4.2, y + 1, s0 - 0.03, x0 + 4.2, y + 2.2, s0 - 0.03, x0 + 2.6, y + 2.2, s0 - 0.03);
    K.to('b');
  } else {
    K.to('e').glowing(1.2, -1, near).col(0xffd9a0);
    K.quad(x0 + 0.4, y + 0.3, s0 - 0.03, x1 - 0.4, y + 0.3, s0 - 0.03, x1 - 0.4, y + 2.6, s0 - 0.03, x0 + 0.4, y + 2.6, s0 - 0.03);
    K.to('b');
    const brand = num(d, 'brand', d.variant);
    K.lit(0, 0, near); board(K, `b:${area}:${brand % DECOR_BRANDS[area].length}`, x0 + 0.4, Math.min(x1 - 0.4, x0 + 5.5), y + 2.8, y + 3.6, s0 - 0.04);
    awningAt(c, xin, s0 - 1.2, s0 - 0.1, y + 2.6, area, d.variant, near, 0.01);
  }
  windows(c, (d.s * 5 + d.x) | 0, 'front', x0 + 0.5, x1 - 0.5, s0, 0, y + 4.6, y + h - 0.4, 2.4, 0xffc98a, near);
}

/** Stacked shipping containers as backdrop (6.1 × 2.4 × 2.6 each), long axis along s. */
export function containerStack(c: KitCtx, d: Decor): void {
  const K = c.K, out = Math.sign(d.x) || 1;
  const cols = num(d, 'cols', 2), rows = num(d, 'rows', 2), runs = num(d, 'runs', 1);
  const near = d.x > 0 ? FX.near : 0;
  const pal = [0xb5552f, 0x2f5d7c, 0x5e8c6a, 0xf2b630, 0x8a8fa0, 0x7a2f24];
  K.reset().to('b');
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) for (let k = 0; k < runs; k++) {
    const x = d.x + out * (i * 2.5), s = d.s + k * 6.2, y = d.y + j * 2.62;
    const col = pal[Math.floor(rnd(d.s, i, j, k) * pal.length)]!;
    K.lit(PAT.ribsV, 0, near).col(col).box(Math.min(x, x + out * 2.4), y, s, Math.max(x, x + out * 2.4), y + 2.6, s + 6.1);
    K.lit(0, 0, near).col(shade(col, -0.3)).box(Math.min(x, x + out * 2.4) + 0.3, y + 0.2, s - 0.02, Math.max(x, x + out * 2.4) - 0.3, y + 2.4, s, FACE.front);
  }
}

/** Gantry / harbour crane silhouette with a boom toward the water side; an amber beacon. */
export function crane(c: KitCtx, d: Decor): void {
  const K = c.K, h = num(d, 'h', 28), boom = num(d, 'boom', 25), side = num(d, 'side', Math.sign(d.x) || 1);
  const near = d.x > 0 ? FX.near : 0;
  K.reset().to('b').lit(0, 0, near).col(0xb5552f);
  for (const dx of [-3, 3]) for (const ds of [0, 8]) K.box(d.x + dx - 0.4, d.y, d.s + ds, d.x + dx + 0.4, d.y + h, d.s + ds + 0.8);
  K.box(d.x - 3.4, d.y + h - 1.2, d.s, d.x + 3.4, d.y + h, d.s + 8.8);
  const bx0 = Math.min(d.x, d.x + side * boom), bx1 = Math.max(d.x, d.x + side * boom);
  K.col(0xc9643a).box(bx0, d.y + h + 0.2, d.s + 3.6, bx1, d.y + h + 1.4, d.s + 5.2);
  K.col(0x2b2140).box(d.x - 1.5, d.y + h, d.s + 2.5, d.x + 1.5, d.y + h + 3, d.s + 6);
  if (num(d, 'beacon', 1)) { K.to('e').glowing(1.8, -1, near, 2).col(0xf2b630).cyl(d.x, d.s + 4.2, d.y + h + 3, d.y + h + 3.4, 0.25, 6, true); K.to('b'); }
}

/** Harbor Bridge side girders and truss beyond the corridor edge. */
export function bridgeTruss(c: KitCtx, d: Decor): void {
  const K = c.K, len = num(d, 'len', 32), h = num(d, 'h', 3), side = num(d, 'side', Math.sign(d.x) || 1);
  const x = Math.sign(side) * Math.max(4.7, Math.abs(d.x));
  const near = side > 0 ? FX.near : 0;
  K.reset().to('b').lit(0, 0, near).col(0x5e5a9e);
  K.box(x - 0.15, d.y, d.s, x + 0.15, d.y + 0.35, d.s + len);
  K.box(x - 0.15, d.y + h - 0.3, d.s, x + 0.15, d.y + h, d.s + len);
  for (let s = d.s; s < d.s + len - 0.1; s += 3) {
    K.bar(x, d.y + 0.3, s, x, d.y + h - 0.3, s + 1.5, 0.08);
    K.bar(x, d.y + h - 0.3, s + 1.5, x, d.y + 0.3, s + 3, 0.08);
  }
}

/** Underpass: tiled walls with warm sodium light strips and a portal band at the entry (no ceiling over the corridor). */
export function tunnel(c: KitCtx, d: Decor): void {
  const K = c.K, len = num(d, 'len', 32), wx = Math.max(5, num(d, 'wallX', 5.5)), h = num(d, 'h', 4.5), every = num(d, 'lightEvery', 4);
  K.reset().to('b');
  for (const side of [-1, 1] as const) {
    const near = side > 0 ? FX.near : 0;
    const xi = side * wx, xo = side * (wx + 0.6);
    K.lit(PAT.wallTile, 0, near).col(0xd8cfc0).box(Math.min(xi, xo), d.y, d.s, Math.max(xi, xo), d.y + h, d.s + len);
    K.lit(0, 0, near).col(0x6b5a4a).box(Math.min(xi, xo), d.y, d.s, Math.max(xi, xo), d.y + 0.6, d.s + len, side < 0 ? FACE.right | FACE.top : FACE.left | FACE.top);
    K.to('e');
    for (let s = d.s + 1; s < d.s + len; s += every) {
      K.glowing(1.9, -1, near).col(0xffb35c);
      K.box(xi - side * 0.06, d.y + h - 0.9, s, xi, d.y + h - 0.7, s + 1.6, side < 0 ? FACE.right | FACE.front : FACE.left | FACE.front);
      if (c.glowLeft > 0) { c.glowLeft--; K.to('g').col(0xffb35c).fxs(0, 0, 0.7, 0).card(xi - side * 0.6, d.y + h - 1, s + 0.8, 2.2, 1.6); K.to('e'); }
    }
    K.to('b');
    // Portal arch band at the entry: ≥ 4 m up, ≤ 0.6 m deep, only over the side (never a ceiling over the corridor).
    K.lit(0, 0, near).col(0x9c8f80).box(Math.min(xi, side * 4.6), d.y + Math.max(4, h - 0.6), d.s - 0.6, Math.max(xi, side * 4.6), d.y + h + 0.4, d.s);
  }
}

/** Harbour water beyond the dock lip: a sky-tinted plane (the decal layer adds glitter). */
export function water(c: KitCtx, d: Decor): void {
  const K = c.K, len = num(d, 'len', 32), w = num(d, 'w', 20);
  const x0 = Math.max(4.55, d.x), y = d.y;
  K.reset().to('b').lit(0, 0, 0, 0.25).col(COLORS.water).box(x0, y - 0.5, d.s, x0 + w, y, d.s + len, FACE.top);
  c.decal({ id: 1, x: x0 + w / 2, y: y + 0.01, s: d.s + len / 2, w, len, rot: 0, color: 0xffffff, alpha: num(d, 'glitter', 0.5), kind: 2 });
}

/** Additive glow card standing beyond the side buildings ("the city's glow ahead"). */
export function cityGlow(c: KitCtx, d: Decor): void {
  const w = num(d, 'w', 30), h = num(d, 'h', 15), k = num(d, 'intensity', 0.6);
  if (c.glowLeft <= 0) return;
  c.glowLeft--;
  c.K.reset().col(0xff7ab8).fxs(0, 0, k * 0.6, 0).card(d.x, d.y + h / 2, d.s, w, h);
}

/** Shadow-only silhouette: drawn into the shadow map, collapsed in the main pass (box, gable, crown, crane arm). */
export function shadowCaster(c: KitCtx, d: Decor): void {
  const K = c.K, w = num(d, 'w', 6), dd = num(d, 'd', 10), h = num(d, 'h', 12), shape = num(d, 'shape', 0);
  const out = Math.sign(d.x) || 1;
  const x0 = Math.min(d.x, d.x + out * w), x1 = Math.max(d.x, d.x + out * w);
  K.reset().to('b').lit(0, 0, FX.shadowOnly).col(0x4a3b6b);
  if (shape === 2) { K.cyl((x0 + x1) / 2, d.s + dd / 2, d.y, d.y + h * 0.5, 0.2, 5, false); K.sphere((x0 + x1) / 2, d.y + h * 0.7, d.s + dd / 2, Math.max(w, dd) / 2, 6, 4, 0.8); }
  else if (shape === 3) K.box(x0, d.y + h - 1.5, d.s, x1, d.y + h, d.s + Math.min(2, dd));
  else if (shape === 1) { K.box(x0, d.y, d.s, x1, d.y + h * 0.7, d.s + dd); K.quad(x0, d.y + h * 0.7, d.s, (x0 + x1) / 2, d.y + h, d.s, (x0 + x1) / 2, d.y + h, d.s + dd, x0, d.y + h * 0.7, d.s + dd); K.quad((x0 + x1) / 2, d.y + h, d.s, x1, d.y + h * 0.7, d.s, x1, d.y + h * 0.7, d.s + dd, (x0 + x1) / 2, d.y + h, d.s + dd); }
  else K.box(x0, d.y, d.s, x1, d.y + h, d.s + dd);
}
