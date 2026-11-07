// world/render/kits/decor.ts: renderers for every DECOR_KINDS entry (core/decor.ts, TECH §4.14). Backdrop kinds are in
// buildings.ts; here the side band (street furniture just outside the corridor, camera-facing faces in portrait),
// the overhead spans (lantern strings as instanced emissive spheres, wires, the maglev's two edge beams; all ≥ 3.2 m
// and thin), the ground decals (instanced quads with polygonOffset) and the ambient emitters (registered for vfx/).
// Decor never uses chevrons or the cream grind-edge colour (DESIGN §18.4). Camera-side (+x) tall decor carries the
// `near` flag: hidden in landscape (ψ > 0), where it would stand over the corridor on screen (DESIGN §8).
import { DECOR_BRANDS, DECOR_KINDS, NEON_SIGN_WORDS, isDecorKind, type DecorKind } from '../../../core/decor';
import type { AreaId } from '../../../core/ids';
import type { Decor } from '../../../core/world';
import { OCCLUSION } from '../render.config';
import { ACCENTS, shade } from '../palette';
import { PAT } from '../textures/ground';
import { DECAL, type DecalId } from '../textures/decals';
import { signRect } from '../textures/signs';
import { FACE, FX } from '../writer';
import { CAR_BODIES, drawCar } from './car';
import { rnd, surfaceLook, type KitCtx } from './common';
import { awningAt, bladeSignAt, board, bridgeTruss, building, cityGlow, containerStack, crane, endWall, house, num, shadowCaster,
  tower, tunnel, warehouse, water } from './buildings';
import { glowCard, litSign } from './neon';

export type DecorFn = (c: KitCtx, d: Decor) => void;
/** Ambient emitters (petals, leaves, steam, sprinklers, train passes) found while building; vfx/ and the view read them. */
export interface AmbientRec { kind: 'petals' | 'leaves' | 'steam' | 'sprinkler' | 'train'; s: number; x: number; y: number; len: number; rate: number; p: Readonly<Record<string, number>> }

const inward = (d: Decor) => -(Math.sign(d.x) || 1);
const nearOf = (d: Decor) => (d.x > 0 ? FX.near : 0);

// ── side band ────────────────────────────────────────────────────────────────────────────────────────────────────
const streetLamp: DecorFn = (c, d) => {
  const K = c.K, area = c.areaAt(d.s), h = num(d, 'h', 5) * (d.scale || 1), inw = inward(d), nf = nearOf(d);
  const arm = Math.max(0, Math.min(num(d, 'arm', 0.8), Math.abs(d.x) - 4.6));
  K.reset().to('b').lit(0, 0, nf);
  const pole = area === 'downtown' ? 0x2b2140 : area === 'docks' ? 0x5a5470 : area === 'neon' ? 0x3a3058 : 0x6a6478;
  K.col(pole).cyl(d.x, d.s, d.y, d.y + 0.4, 0.11, 6, true);
  K.cyl(d.x, d.s, d.y + 0.4, d.y + h, 0.06, 6, false);
  const hx = d.x + inw * arm;
  if (arm > 0.05) K.bar(d.x, d.y + h - 0.05, d.s, hx, d.y + h - 0.05, d.s, 0.03);
  if (area === 'downtown') K.col(0xc9a15a).cyl(d.x, d.s, d.y + 0.9, d.y + 1.0, 0.08, 6, false);
  // Head: DT ornate lantern, SB simple cobra head, Docks floodlight block, Neon paper lantern top.
  const lampCol = area === 'neon' ? 0xff5a3c : area === 'docks' ? 0xfff1c9 : 0xffd39a;
  K.col(pole);
  if (area === 'downtown') { K.frustum(hx, d.s, d.y + h - 0.55, d.y + h - 0.45, 0.12, 0.2, 6, false); K.frustum(hx, d.s, d.y + h, d.y + h + 0.18, 0.22, 0.04, 6, true); }
  else if (area === 'docks') K.box(hx - 0.3, d.y + h - 0.1, d.s - 0.2, hx + 0.3, d.y + h + 0.15, d.s + 0.2);
  else K.box(hx - 0.22, d.y + h - 0.08, d.s - 0.12, hx + 0.22, d.y + h + 0.04, d.s + 0.12);
  K.to('e').glowing(num(d, 'lit', 1) * 1.6, -1, nf).col(lampCol);
  if (area === 'downtown') K.cyl(hx, d.s, d.y + h - 0.45, d.y + h, 0.16, 6, false);
  else if (area === 'neon') K.sphere(hx, d.y + h - 0.3, d.s, 0.2, 6, 4, 1.25);
  else K.box(hx - 0.2, d.y + h - 0.12, d.s - 0.1, hx + 0.2, d.y + h - 0.08, d.s + 0.1, FACE.sides5 | FACE.bottom);
  K.to('b');
  glowCard(c, hx, d.y + h - 0.3, d.s - 0.2, 1.4, 1.4, lampCol, 0.55, nf);
};

const tree: DecorFn = (c, d) => {
  const K = c.K, area = c.areaAt(d.s), sc = d.scale || 1, nf = nearOf(d);
  const crown = num(d, 'crown', 1.6) * sc, trunkH = num(d, 'trunkH', 2.6) * sc, species = num(d, 'species', area === 'downtown' ? 1 : 0);
  const sway = num(d, 'sway', 0.3);
  // Keep the crown outside the corridor edge (decor never overhangs |x| < 4.6).
  const cx = Math.sign(d.x) * Math.max(Math.abs(d.x), 4.6 + crown * 0.85);
  K.reset().to('b').lit(0, 0, nf).col(0x4a3530);
  if (species === 1) {
    K.lit(0, 0, nf).col(0xb3a194).box(d.x - 0.45, d.y, d.s - 0.45, d.x + 0.45, d.y + 0.5, d.s + 0.45);
    K.lit(0, 0, nf).col(0x6b4e3a).frustum(d.x, d.s, d.y + 0.5, d.y + trunkH + 1.6, 0.16, 0.1, 6, false);
    K.lit(0, sway * 2, nf).col(0x4f7a46);
    const top = d.y + trunkH + 1.6;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd(d.s, d.x) * 2, dx = Math.cos(a), ds = Math.sin(a), L = crown * 0.9;
      K.quad(d.x, top + 0.1, d.s, d.x + dx * 0.25 - ds * 0.14, top + 0.15, d.s + ds * 0.25 + dx * 0.14, d.x + dx * L, top - 0.5, d.s + ds * L, d.x + dx * 0.25 + ds * 0.14, top + 0.15, d.s + ds * 0.25 - dx * 0.14);
    }
    return;
  }
  K.frustum(d.x, d.s, d.y, d.y + trunkH, 0.14 * sc, 0.1 * sc, 6, false);
  const leaf = area === 'suburbs' ? [0x7f9a5a, 0x9db36b, 0xc9a15a] : [0x6f8f4e, 0x86a05a];
  if (species === 2) {
    for (let k = 0; k < 3; k++) K.lit(0, sway, nf).col(shade(0x3f6a48, k * 0.06)).frustum(cx, d.s, d.y + trunkH * 0.6 + k * crown * 0.6, d.y + trunkH * 0.6 + (k + 1.4) * crown * 0.6, crown * (1 - k * 0.25), 0.05, 7, false);
    return;
  }
  for (let i = 0; i < 4; i++) {
    const r = crown * (0.55 + 0.2 * rnd(d.s, i));
    K.lit(0, sway, nf).col(leaf[i % leaf.length]!).sphere(cx + (rnd(d.s, i, 1) - 0.5) * crown * 0.7, d.y + trunkH + r * 0.5 + rnd(d.s, i, 2) * crown * 0.5,
      d.s + (rnd(d.s, i, 3) - 0.5) * crown * 0.7, r, 6, 4, 0.85);
  }
};

const cherryTree: DecorFn = (c, d) => {
  const K = c.K, sc = d.scale || 1, nf = nearOf(d);
  const crown = num(d, 'crown', 1.5) * sc, trunkH = num(d, 'trunkH', 2.8) * sc;
  const cx = Math.sign(d.x) * Math.max(Math.abs(d.x), 4.6 + crown * 0.85);
  K.reset().to('b').lit(0, 0, nf).col(0x3a2a3e).frustum(d.x, d.s, d.y, d.y + trunkH, 0.14, 0.09, 6, false);
  K.bar(d.x, d.y + trunkH * 0.8, d.s, cx, d.y + trunkH + 0.2, d.s, 0.06);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    K.lit(0, 0.4, nf, 0.22).col(i % 2 ? 0xffb7d0 : 0xf59bbe).sphere(cx + Math.cos(a) * crown * 0.55, d.y + trunkH + 0.3 + rnd(d.s, i) * 0.6, d.s + Math.sin(a) * crown * 0.5, crown * 0.42, 5, 3);
  }
  K.lit(0, 0.4, nf, 0.22).col(0xffc9dc).sphere(cx, d.y + trunkH + 0.8, d.s, crown * 0.55, 6, 4);
  c.decal({ id: DECAL.petals, x: d.x, y: d.y + 0.006, s: d.s, w: crown * 2, len: crown * 2, rot: rnd(d.s) * 6, color: 0xffb7d0, alpha: 0.9, kind: 0 });
};

const hedgeRound: DecorFn = (c, d) => {
  const K = c.K, r = num(d, 'r', 0.7) * (d.scale || 1), sq = num(d, 'squash', 0.85);
  K.reset().to('b').lit(PAT.grass, 0.1, nearOf(d)).col(0x5f7f4a).sphere(d.x, d.y + r * sq, d.s, r, 7, 4, sq);
  K.col(0x7f9a5a).sphere(d.x + 0.1, d.y + r * sq * 1.35, d.s - 0.1, r * 0.55, 5, 3, sq);
};

const fenceRun: DecorFn = (c, d) => {
  const K = c.K, len = num(d, 'len', 8), h = num(d, 'h', 1.0), style = num(d, 'style', 0), nf = nearOf(d);
  K.reset().to('b');
  if (style === 1) { K.lit(PAT.grass, 0, nf).col(0x4f6e44).chamfer(d.x - 0.3, d.y, d.s, d.x + 0.3, d.y + h, d.s + len, 0.12, 0x6f8f4e); return; }
  if (style === 2) { K.lit(PAT.brickWall, 0, nf).col(0xc9a48a).box(d.x - 0.15, d.y, d.s, d.x + 0.15, d.y + h, d.s + len); K.lit(0, 0, nf).col(0xe3d9cc).box(d.x - 0.18, d.y + h, d.s, d.x + 0.18, d.y + h + 0.06, d.s + len); return; }
  K.lit(0, 0, nf).col(0xf7efe3);
  K.box(d.x - 0.03, d.y + 0.25, d.s, d.x + 0.03, d.y + 0.32, d.s + len); K.box(d.x - 0.03, d.y + h - 0.3, d.s, d.x + 0.03, d.y + h - 0.23, d.s + len);
  for (let s = d.s + 0.05; s < d.s + len - 0.05; s += 0.16) {
    K.box(d.x - 0.015, d.y, s, d.x + 0.015, d.y + h - 0.08, s + 0.09);
    K.tri(d.x, d.y + h - 0.08, s, d.x, d.y + h - 0.08, s + 0.09, d.x, d.y + h, s + 0.045);
  }
};

const lowWall: DecorFn = (c, d) => {
  const K = c.K, len = num(d, 'len', 6), h = num(d, 'h', 0.5);
  K.reset().to('b').lit(PAT.pavers, 0, nearOf(d)).col(0xc4b2a6).chamfer(d.x - 0.2, d.y, d.s, d.x + 0.2, d.y + h, d.s + len, 0.03);
};

/** The lowest point of a decor element hung on a facade or a post (awning, blade sign, banner): `y` is the surface
 *  it hangs from (core/decor.ts field conventions, one definition since G1) and the kind's `mount` param is its
 *  height above it; HUNG holds the documented defaults. */
export const HUNG = { awning: 2.4, blade: 2.6, banner: 3.0 } as const;
const hungY = (_c: KitCtx, d: Decor, mount: number): number => d.y + num(d, 'mount', mount);

const awning: DecorFn = (c, d) => {
  const area = c.areaAt(d.s), w = num(d, 'w', 4), depth = num(d, 'depth', 1.0);
  const face = Math.sign(d.x) * (Math.abs(d.x) + depth);
  // awningAt draws the canopy down 0.5 m from yTop and its valance 0.25 m below that.
  awningAt(c, face, d.s, d.s + w, hungY(c, d, HUNG.awning) + 0.75, area, num(d, 'color', d.variant), nearOf(d), depth);
};

const bladeSign: DecorFn = (c, d) => {
  const area = c.areaAt(d.s) === 'neon' ? 'neon' : 'downtown';
  const h = num(d, 'h', 3), w = num(d, 'w', 0.6), word = num(d, 'word', -1), brand = num(d, 'brand', d.variant);
  const brands = DECOR_BRANDS[area].length;
  const pick = area === 'neon' && word >= 0 ? brands + (word % NEON_SIGN_WORDS.length) : Math.max(0, brand) % brands;
  const xFace = Math.sign(d.x) * Math.max(Math.abs(d.x) + w, 4.9 + w);
  bladeSignAt(c, xFace, d.s, hungY(c, d, HUNG.blade), h, w, pick, area, nearOf(d));
};

const banner: DecorFn = (c, d) => {
  const K = c.K, area = c.areaAt(d.s), h = num(d, 'h', 1.2), col = ACCENTS[area][num(d, 'color', d.variant) % ACCENTS[area].length]!;
  const x = d.x + inward(d) * 0.05, y0 = hungY(c, d, HUNG.banner);
  K.reset().to('b').lit(0, 0.4, nearOf(d)).col(col);
  K.quad(x - 0.3, y0, d.s - 0.02, x + 0.3, y0, d.s - 0.02, x + 0.3, y0 + h, d.s - 0.02, x - 0.3, y0 + h, d.s - 0.02);
  K.col(shade(col, 0.4)).quad(x - 0.22, y0 + h * 0.6, d.s - 0.025, x + 0.22, y0 + h * 0.6, d.s - 0.025, x + 0.22, y0 + h * 0.75, d.s - 0.025, x - 0.22, y0 + h * 0.75, d.s - 0.025);
};

const billboard: DecorFn = (c, d) => {
  const K = c.K, area = c.areaAt(d.s), w = num(d, 'w', 5), h = num(d, 'h', 2.5), pole = num(d, 'pole', 3), nf = nearOf(d);
  const xi = Math.sign(d.x) * Math.max(4.9, Math.abs(d.x)), xo = xi + Math.sign(d.x) * w;
  const x0 = Math.min(xi, xo), x1 = Math.max(xi, xo), y0 = d.y + pole;
  K.reset().to('b').lit(0, 0, nf).col(0x3a3052);
  for (const x of [x0 + w * 0.25, x1 - w * 0.25]) K.box(x - 0.1, d.y, d.s + 0.1, x + 0.1, y0, d.s + 0.3);
  K.col(0x2b2140).box(x0 - 0.1, y0 - 0.1, d.s, x1 + 0.1, y0 + h + 0.1, d.s + 0.2);
  const key = area === 'neon' ? 'holo:0' : `bb:${area === 'suburbs' || area === 'docks' ? area : 'downtown'}:${(Math.max(0, num(d, 'brand', d.variant))) % 2}`;
  K.lit(0, 0, nf);
  board(K, key, x0, x1, y0, y0 + h, d.s - 0.005);
  K.col(0x5a4a6a).box(x0, y0 - 0.25, d.s - 0.4, x1, y0 - 0.15, d.s);
};

const holoBillboard: DecorFn = (c, d) => {
  const K = c.K, w = num(d, 'w', 3.5), h = num(d, 'h', 2.5), pole = num(d, 'pole', 3.5), nf = nearOf(d);
  const xi = Math.sign(d.x) * Math.max(4.9, Math.abs(d.x)), xo = xi + Math.sign(d.x) * w;
  const x0 = Math.min(xi, xo), x1 = Math.max(xi, xo), y0 = d.y + pole;
  K.reset().to('b').lit(0, 0, nf).col(0x2a2648).cyl((x0 + x1) / 2, d.s + 0.1, d.y, y0, 0.12, 6, false);
  K.box(x0, y0 - 0.12, d.s, x1, y0, d.s + 0.2);
  litSign(c, `holo:${(d.variant + Math.max(0, num(d, 'brand', 0))) % 4}`, x0, x1, y0, y0 + h, d.s, 1.8, num(d, 'flicker', 1) ? 1 : 0, nf);
  glowCard(c, (x0 + x1) / 2, y0 + h / 2, d.s - 0.1, w * 1.4, h * 1.4, 0x8a5cff, 0.45, nf);
};

const vendingMachine: DecorFn = (c, d) => {
  const K = c.K, n = Math.max(1, Math.min(4, num(d, 'count', 2))), nf = nearOf(d);
  const xa = Math.sign(d.x) * Math.max(4.6, Math.abs(d.x)), xb = xa + Math.sign(d.x) * 0.9;
  K.reset().to('b');
  for (let i = 0; i < n; i++) {
    const s = d.s + i * 1.02;
    K.lit(0, 0, nf).col(i % 2 ? 0x8f86c4 : 0x7a6fb0).chamfer(Math.min(xa, xb), d.y, s, Math.max(xa, xb), d.y + 1.8, s + 0.98, 0.04, 0x9489c8);
    // Lit front facing the camera (−s face of each machine) and on the street face.
    litSign(c, `vend:${(i + d.variant) % 4}`, Math.min(xa, xb) + 0.1, Math.max(xa, xb) - 0.1, d.y + 0.6, d.y + 1.65, s - 0.01, 1.5, 0, nf);
  }
  glowCard(c, (xa + xb) / 2, d.y + 1.1, d.s - 0.15, 1.6, 2, 0xbff9ff, 0.4, nf);
};

const foodCartSide: DecorFn = (c, d) => {
  const K = c.K, nf = nearOf(d);
  const xa = Math.sign(d.x) * Math.max(4.6, Math.abs(d.x)), xb = xa + Math.sign(d.x) * 1.2;
  const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), s0 = d.s, s1 = d.s + 2;
  K.reset().to('b').lit(0, 0, nf).col(0x6a3a30).box(x0, d.y + 0.2, s0, x1, d.y + 0.95, s1);
  K.col(0x2b2140); for (const s of [s0 + 0.3, s1 - 0.3]) K.hcyl('x', 0, d.y + 0.22, s, x0 - 0.02, x0 + 0.04, 0.22, 8, true);
  K.to('e').glowing(num(d, 'glow', 1) * 1.3, -1, nf).col(0xffd39a).box(x0 + 0.05, d.y + 0.78, s0 - 0.01, x1 - 0.05, d.y + 0.92, s0, FACE.front);
  K.to('b');
  K.lit(0, 0, nf).col(0xc4473d);
  for (let i = 0; i < 3; i++) K.box(x0 + i * 0.4 + 0.02, d.y + 1.55, s0 - 0.02, x0 + (i + 1) * 0.4 - 0.02, d.y + 1.95, s0, FACE.front);
  const word = num(d, 'word', -1), brand = num(d, 'brand', -1);
  if (word >= 0 || brand >= 0) litSign(c, word >= 0 ? `w:${word % NEON_SIGN_WORDS.length}` : `b:neon:${brand % DECOR_BRANDS.neon.length}`, x0 + 0.05, x1 - 0.05, d.y + 1.6, d.y + 1.9, s0 - 0.03, 1.2, 0, nf);
  K.lit(0, 0, nf).col(0x3a2a3e).box(x0 - 0.1, d.y + 1.95, s0 - 0.1, x1 + 0.1, d.y + 2.05, s1 + 0.1);
  K.to('e').glowing(1.6, -1, nf).col(0xff5a3c).sphere((x0 + x1) / 2, d.y + 2.3, (s0 + s1) / 2, 0.2, 7, 4, 1.3);
  K.to('b');
  glowCard(c, (x0 + x1) / 2, d.y + 1, s0 - 0.15, 2, 1.4, 0xffb07a, 0.4, nf);
};

const paperLantern: DecorFn = (c, d) => {
  const K = c.K, h = num(d, 'h', 1.6), nf = nearOf(d), red = d.variant % 2 === 0;
  K.reset().to('b').lit(0, 0, nf).col(0x2b2140).cyl(d.x, d.s, d.y, d.y + h - 0.5, 0.035, 5, false);
  K.to('e').glowing(num(d, 'glow', 1.2) * 1.3, -1, nf).col(red ? 0xff5a3c : 0xffd39a).cyl(d.x, d.s, d.y + h - 0.5, d.y + h, 0.18, 8, true);
  K.to('b');
  glowCard(c, d.x, d.y + h - 0.25, d.s - 0.2, 1.1, 1.1, red ? 0xff5a3c : 0xffd39a, 0.5, nf);
};

const cafeUmbrella: DecorFn = (c, d) => {
  const K = c.K, r = num(d, 'r', 1.1), nf = nearOf(d), col = ACCENTS.downtown[num(d, 'color', d.variant) % 5]!;
  const x = Math.sign(d.x) * Math.max(Math.abs(d.x), 4.6 + r);
  K.reset().to('b').lit(0, 0, nf).col(0x2b2140).cyl(x, d.s, d.y, d.y + 0.72, 0.04, 5, false);
  K.col(0xe8d6c2).cyl(x, d.s, d.y + 0.72, d.y + 0.76, 0.4, 8, true);
  K.col(0x2b2140).cyl(x, d.s, d.y + 0.76, d.y + 2.3, 0.025, 5, false);
  for (let i = 0; i < 8; i++) {
    K.col(i % 2 ? col : 0xfff4e3);
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
    K.tri(x, d.y + 2.5, d.s, x + Math.cos(a0) * r, d.y + 2.15, d.s + Math.sin(a0) * r, x + Math.cos(a1) * r, d.y + 2.15, d.s + Math.sin(a1) * r);
  }
};

const hydrant: DecorFn = (c, d) => {
  const K = c.K, nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0xc4473d).cyl(d.x, d.s, d.y, d.y + 0.55, 0.11, 7, false);
  K.frustum(d.x, d.s, d.y + 0.55, d.y + 0.7, 0.12, 0.05, 7, true);
  K.hcyl('x', 0, d.y + 0.38, d.s, d.x - 0.18, d.x + 0.18, 0.05, 5, true);
};

const parkingMeter: DecorFn = (c, d) => {
  const K = c.K, nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0x4a4458).cyl(d.x, d.s, d.y, d.y + 1.1, 0.03, 5, false);
  K.col(0x6a6478).box(d.x - 0.1, d.y + 1.1, d.s - 0.06, d.x + 0.1, d.y + 1.4, d.s + 0.06);
  K.to('e').glowing(0.9, -1, nf).col(0x7ee0b5).box(d.x - 0.06, d.y + 1.25, d.s - 0.065, d.x + 0.06, d.y + 1.33, d.s - 0.06, FACE.front);
  K.to('b');
};

const signPost: DecorFn = (c, d) => {
  const K = c.K, h = num(d, 'h', 2.6), kind = num(d, 'kind', 0), nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0x6a6478).cyl(d.x, d.s, d.y, d.y + h, 0.035, 5, false);
  K.lit(0, 0, nf);
  if (kind === 0) board(K, `street:${(d.variant + Math.round(d.s)) % 6}`, d.x - 0.5, d.x + 0.5, d.y + h - 0.25, d.y + h, d.s - 0.05);
  else if (kind === 1) board(K, 'picto:round', d.x - 0.3, d.x + 0.3, d.y + h - 0.6, d.y + h, d.s - 0.05);
  else if (kind === 2) board(K, 'picto:arrow', d.x - 0.3, d.x + 0.3, d.y + h - 0.6, d.y + h, d.s - 0.05);
  else board(K, 'picto:bus', d.x - 0.3, d.x + 0.3, d.y + h - 0.6, d.y + h, d.s - 0.05);
};

const trafficLight: DecorFn = (c, d) => {
  const K = c.K, h = num(d, 'h', 4), st = num(d, 'state', 2), nf = nearOf(d), inw = inward(d);
  const hx = d.x + inw * Math.max(0, Math.min(0.6, Math.abs(d.x) - 4.6));
  K.reset().to('b').lit(0, 0, nf).col(0x3a3052).cyl(d.x, d.s, d.y, d.y + h, 0.07, 6, false);
  K.bar(d.x, d.y + h - 0.1, d.s, hx, d.y + h - 0.1, d.s, 0.04);
  K.col(0x2b2140).box(hx - 0.16, d.y + h - 1.0, d.s - 0.12, hx + 0.16, d.y + h, d.s + 0.12);
  const cols = [0xff5a3c, 0xe6ad3a, 0x7ee0b5];
  K.to('e');
  for (let i = 0; i < 3; i++) K.glowing(i === st ? 1.8 : 0.15, -1, nf).col(cols[i]!).box(hx - 0.09, d.y + h - 0.3 - i * 0.3, d.s - 0.125, hx + 0.09, d.y + h - 0.14 - i * 0.3, d.s - 0.12, FACE.front);
  K.to('b');
};

const utilityPole: DecorFn = (c, d) => {
  const K = c.K, h = num(d, 'h', 8), arms = num(d, 'arms', 2), nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0x5a4636).cyl(d.x, d.s, d.y, d.y + h, 0.12, 6, true);
  K.col(0x4a3a2e);
  for (let k = 0; k < arms; k++) K.box(d.x - 0.9, d.y + h - 0.6 - k * 0.7, d.s - 0.06, d.x + 0.9, d.y + h - 0.48 - k * 0.7, d.s + 0.06);
  K.col(0xd8cfc0); for (let k = 0; k < arms; k++) for (const dx of [-0.8, -0.3, 0.3, 0.8]) K.box(d.x + dx - 0.04, d.y + h - 0.48 - k * 0.7, d.s - 0.04, d.x + dx + 0.04, d.y + h - 0.38 - k * 0.7, d.s + 0.04);
  K.col(0x6a6478).cyl(d.x - 0.2 * Math.sign(d.x), d.s + 0.25, d.y + h - 2.4, d.y + h - 1.7, 0.22, 7, true);
};

const bikeParked: DecorFn = (c, d) => {
  const K = c.K, n = Math.max(1, Math.min(8, num(d, 'count', 3))), nf = nearOf(d), area = c.areaAt(d.s);
  K.reset().to('b');
  for (let i = 0; i < n; i++) {
    const s = d.s + i * 0.55, col = ACCENTS[area][(i + d.variant) % ACCENTS[area].length]!;
    K.lit(0, 0, nf).col(0x2b2140);
    K.hcyl('s', d.x - 0.32, d.y + 0.31, 0, s - 0.015, s + 0.015, 0.3, 8, true);
    K.hcyl('s', d.x + 0.32, d.y + 0.31, 0, s - 0.015, s + 0.015, 0.3, 8, true);
    K.lit(0, 0, nf).col(col).bar(d.x - 0.32, d.y + 0.35, s, d.x + 0.1, d.y + 0.85, s, 0.022);
    K.bar(d.x + 0.1, d.y + 0.85, s, d.x + 0.32, d.y + 0.35, s, 0.022);
    K.bar(d.x - 0.1, d.y + 0.8, s, d.x + 0.25, d.y + 0.9, s, 0.02);
  }
};

const pottedPlant: DecorFn = (c, d) => {
  const K = c.K, h = num(d, 'h', 0.9), nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0xb5645a).frustum(d.x, d.s, d.y, d.y + h * 0.4, 0.22, 0.28, 7, true);
  K.lit(0, 0.3, nf).col(0x5f7f4a).sphere(d.x, d.y + h * 0.65, d.s, h * 0.35, 6, 4, 1);
  K.col(0x7f9a5a).sphere(d.x + 0.1, d.y + h * 0.85, d.s - 0.05, h * 0.2, 5, 3, 1);
};

const mailboxPost: DecorFn = (c, d) => {
  const K = c.K, nf = nearOf(d), col = ACCENTS.suburbs[num(d, 'color', d.variant) % 5]!;
  K.reset().to('b').lit(0, 0, nf).col(0xf7efe3).box(d.x - 0.04, d.y, d.s - 0.04, d.x + 0.04, d.y + 1.0, d.s + 0.04);
  K.col(col).box(d.x - 0.13, d.y + 1.0, d.s - 0.25, d.x + 0.13, d.y + 1.2, d.s + 0.25);
  K.hcyl('s', d.x, d.y + 1.2, 0, d.s - 0.25, d.s + 0.25, 0.13, 6, true);
  K.col(0xc4473d).box(d.x + 0.13, d.y + 1.05, d.s, d.x + 0.15, d.y + 1.4, d.s + 0.05);
};

const binPair: DecorFn = (c, d) => {
  const K = c.K, n = Math.max(1, Math.min(3, num(d, 'count', 2))), nf = nearOf(d), lid = ACCENTS.suburbs[num(d, 'color', d.variant) % 5]!;
  K.reset().to('b');
  for (let i = 0; i < n; i++) {
    const s = d.s + i * 0.72;
    K.lit(0, 0, nf).col(0x3a5a48).box(d.x - 0.3, d.y + 0.05, s, d.x + 0.3, d.y + 1.0, s + 0.66);
    K.col(i % 2 ? 0xf4d58d : lid).box(d.x - 0.33, d.y + 1.0, s - 0.03, d.x + 0.33, d.y + 1.08, s + 0.69);
  }
};

const hoop: DecorFn = (c, d) => {
  const K = c.K, h = num(d, 'h', 3.05), nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0x6a6478).cyl(d.x, d.s, d.y, d.y + h + 0.6, 0.06, 6, true);
  K.col(0xf7efe3).box(d.x - 0.6, d.y + h, d.s - 0.15, d.x + 0.6, d.y + h + 0.75, d.s - 0.1);
  K.col(0xc4473d).box(d.x - 0.2, d.y + h + 0.15, d.s - 0.155, d.x + 0.2, d.y + h + 0.4, d.s - 0.15, FACE.front);
  K.col(0xff8a5b).cyl(d.x, d.s - 0.4, d.y + h, d.y + h + 0.03, 0.22, 8, false);
};

const parkedCarSide: DecorFn = (c, d) => {
  const van = num(d, 'van', 0) === 1, L = van ? 4.6 : 4.4, W = 1.85, H = van ? 1.9 : 1.45;
  const xa = Math.sign(d.x) * Math.max(4.6, Math.abs(d.x)), xb = xa + Math.sign(d.x) * W;
  const cars = [0xd9765a, 0x8fb8de, 0xf4d58d, 0x9ccfb3, 0xe8d6c2, 0x9c7bb0, 0xc4473d];
  const body = cars[Math.floor(num(d, 'color', rnd(d.s, d.x)) * cars.length) % cars.length] ?? CAR_BODIES[0]!;
  c.K.reset().to('b').lit(0, 0, nearOf(d));
  drawCar(c.K, { x0: Math.min(xa, xb), x1: Math.max(xa, xb), s0: d.s, s1: d.s + L, y: d.y, h: H, body, accent: 0xfff4e3, van });
  c.K.to('b');
};

const palletPile: DecorFn = (c, d) => {
  const K = c.K, tiers = Math.max(1, Math.min(8, num(d, 'tiers', 4))), n = Math.max(1, Math.min(3, num(d, 'count', 1))), nf = nearOf(d);
  K.reset().to('b');
  for (let k = 0; k < n; k++) for (let t = 0; t < tiers; t++) {
    const s = d.s + k * 1.3, y = d.y + t * 0.15;
    K.lit(PAT.planks, 0, nf).col(shade(0xb08458, (t % 2) * 0.08 - 0.05)).box(d.x - 0.5, y, s, d.x + 0.5, y + 0.14, s + 1.2);
  }
};

const drumPile: DecorFn = (c, d) => {
  const K = c.K, n = Math.max(1, Math.min(8, num(d, 'count', 4))), nf = nearOf(d), col = ACCENTS.docks[num(d, 'color', d.variant) % 6]!;
  K.reset().to('b');
  for (let i = 0; i < n; i++) {
    const x = d.x + (i % 2) * 0.62 * Math.sign(d.x), s = d.s + Math.floor(i / 2) * 0.62;
    K.lit(0, 0, nf).col(i % 3 === 0 ? 0x2f5d7c : col).cyl(x, s, d.y, d.y + 0.9, 0.29, 8, true);
    K.col(0xe6ad3a).cyl(x, s, d.y + 0.45, d.y + 0.49, 0.3, 8, false);
  }
};

const gateArm: DecorFn = (c, d) => {
  const K = c.K, h = num(d, 'h', 5), nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0x3a3052).box(d.x - 0.25, d.y, d.s - 0.25, d.x + 0.25, d.y + 1.1, d.s + 0.25);
  for (let k = 0; k < 6; k++) K.lit(0, 0, nf).col(k % 2 ? 0xc4473d : 0xfff4e3).box(d.x - 0.06, d.y + 1.1 + k * (h - 1.1) / 6, d.s - 0.06, d.x + 0.06, d.y + 1.1 + (k + 1) * (h - 1.1) / 6, d.s + 0.06);
  if (num(d, 'lit', 1)) { K.to('e').glowing(1.6, -1, nf, 2).col(0xff5a3c).box(d.x - 0.08, d.y + 0.8, d.s - 0.26, d.x + 0.08, d.y + 0.95, d.s - 0.25, FACE.front); K.to('b'); }
};

const crossingSignal: DecorFn = (c, d) => {
  const K = c.K, nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0x3a3052).cyl(d.x, d.s, d.y, d.y + 3.2, 0.06, 6, false);
  K.col(0xfff4e3);
  K.bar(d.x - 0.5, d.y + 2.8, d.s - 0.05, d.x + 0.5, d.y + 3.3, d.s - 0.05, 0.05);
  K.bar(d.x - 0.5, d.y + 3.3, d.s - 0.05, d.x + 0.5, d.y + 2.8, d.s - 0.05, 0.05);
  K.col(0x2b2140).box(d.x - 0.45, d.y + 2.1, d.s - 0.1, d.x + 0.45, d.y + 2.4, d.s);
  K.to('e');
  K.glowing(1.8, -1, nf, 2).col(0xff5a3c).cyl(d.x - 0.28, d.s - 0.1, d.y + 2.15, d.y + 2.35, 0.11, 7, true);
  K.glowing(1.8, -1, nf, 3).col(0xff5a3c).cyl(d.x + 0.28, d.s - 0.1, d.y + 2.15, d.y + 2.35, 0.11, 7, true);
  K.to('b');
};

const chainLink: DecorFn = (c, d) => {
  const K = c.K, len = num(d, 'len', 10), h = num(d, 'h', 2.0), post = num(d, 'post', 2.5), nf = nearOf(d);
  const x = Math.sign(d.x) * Math.max(4.6, Math.abs(d.x));
  K.reset().to('b').lit(0, 0, nf).col(0x8a8fa0);
  for (let s = d.s; s <= d.s + len + 1e-6; s += post) K.cyl(x, s, d.y, d.y + h, 0.04, 5, true);
  K.box(x - 0.02, d.y + h - 0.05, d.s, x + 0.02, d.y + h, d.s + len);
  // The mesh: a thin dark grid strip (opaque, low value) along the fence line.
  K.col(0x6a6478);
  for (let y = d.y + 0.2; y < d.y + h - 0.1; y += 0.25) K.box(x - 0.006, y, d.s, x + 0.006, y + 0.02, d.s + len, FACE.left | FACE.right | FACE.top);
};

const sprinkler: DecorFn = (c, d) => {
  const K = c.K;
  K.reset().to('b').lit(0, 0, nearOf(d)).col(0x8a8fa0).cyl(d.x, d.s, d.y, d.y + 0.15, 0.05, 6, true);
};

// ── overhead ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Catenary of instanced emissive spheres (#FF5A3C / #FFD39A) across the street, swaying at 0.5 Hz; lowest point
 *  ≥ 3.2 m (DESIGN §8). The wire is a thin dark bar (casts a thin shadow). Wire and bulbs fade over the look-ahead
 *  zone (x-ray target, fx `over`; the lantern layer does the same per bulb; render.config.ts OCCLUSION). */
const lanternString: DecorFn = (c, d) => {
  const K = c.K, x0 = num(d, 'x0', -6), x1 = num(d, 'x1', 6), sag = Math.max(0, num(d, 'sag', 0.6));
  const n = Math.max(6, Math.min(24, num(d, 'count', 12))), pal = num(d, 'palette', 0);
  const yLow = Math.max(3.2, d.y), yEnd = yLow + sag;
  const yAt = (u: number) => yEnd - sag * Math.sin(Math.PI * u);
  K.reset().to('x').lit(0, 0, FX.over).col(0x2b2140);
  const segs = 8;
  for (let k = 0; k < segs; k++) {
    const u0 = k / segs, u1 = (k + 1) / segs;
    K.bar(x0 + (x1 - x0) * u0, yAt(u0) + 0.25, d.s, x0 + (x1 - x0) * u1, yAt(u1) + 0.25, d.s, 0.012);
  }
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const col = pal === 1 ? 0xffd39a : pal === 2 ? 0xff5a3c : i % 2 ? 0xffd39a : 0xff5a3c;
    c.lantern({ x: x0 + (x1 - x0) * u, y: yAt(u) + 0.08, s: d.s, r: 0.13, color: col, phase: u * 3 + rnd(d.s) * 6, glow: 1.6 });
  }
};

const overheadWire: DecorFn = (c, d) => {
  const K = c.K, x0 = num(d, 'x0', -6), x1 = num(d, 'x1', 6), sag = num(d, 'sag', 0.3), n = Math.max(1, Math.min(4, num(d, 'count', 2)));
  const y0 = Math.max(3.2, d.y);
  K.reset().to('x').lit(0, 0, FX.over).col(0x2b2140);
  for (let w = 0; w < n; w++) {
    const ds = w * 0.35, yy = y0 + sag + w * 0.12;
    const segs = 6;
    for (let k = 0; k < segs; k++) {
      const u0 = k / segs, u1 = (k + 1) / segs;
      K.bar(x0 + (x1 - x0) * u0, yy - sag * Math.sin(Math.PI * u0), d.s + ds, x0 + (x1 - x0) * u1, yy - sag * Math.sin(Math.PI * u1), d.s + ds, 0.01);
    }
  }
};

/** Sora Line guideway at y = 7: two thin edge beams (≤ 0.3 m wide), never a deck over the corridor. world/gen lays
 *  it along the median (x = 0); the run camera would see it as two extra lane lines and the train streak across the
 *  skater, so it is drawn hugging the far (−x) facade line (OCCLUSION.maglevX), clear of the corridor on screen. */
export const maglevX = (x: number) => (Math.abs(x) < OCCLUSION.cutX + 1 ? OCCLUSION.maglevX : x);
const maglevBeam: DecorFn = (c, d) => {
  const K = c.K, len = num(d, 'len', 32), y = Math.max(7, d.y), x = maglevX(d.x);
  const gap = x === d.x ? num(d, 'gap', 1.6) : OCCLUSION.maglevGap;
  K.reset();
  for (const dx of [-gap / 2, gap / 2]) {
    K.to('b').lit(0, 0, 0).col(0x3a3466).box(x + dx - 0.07, y, d.s, x + dx + 0.07, y + 0.3, d.s + len, FACE.all);
    // Small signal lights along the outer faces (never a continuous bright line: from the run camera a beam along s
    // projects as a long line, which must not read as a lane marking).
    K.to('e').glowing(1.4, -1, 0);
    // Magenta and paper (cyan is reserved for sparks, rail-body glow and the contact glow, DESIGN §18.4).
    for (let s = d.s + 1; s < d.s + len; s += 4) K.col(s % 8 < 4 ? 0xffd39a : 0xff3fa4).box(x + dx - 0.075, y + 0.1, s, x + dx + 0.075, y + 0.18, s + 0.25, FACE.left | FACE.right | FACE.front | FACE.top);
    K.to('b');
  }
};

// ── ground decals ─────────────────────────────────────────────────────────────────────────────────────────────────
const dec = (c: KitCtx, id: DecalId, d: Decor, w: number, len: number, color: number, alpha: number, rot = d.rotY, kind: 0 | 1 | 2 = 0, x = d.x, s = d.s) =>
  c.decal({ id, x, y: d.y + 0.006, s, w, len, rot, color, alpha, kind });

const crosswalk: DecorFn = (c, d) => {
  const len = num(d, 'len', 3), w = num(d, 'w', 6), area = c.areaAt(d.s);
  const paint = area === 'neon' ? 0xd8d0f0 : 0xede3d3;
  if (num(d, 'scramble', area === 'neon' ? 1 : 0)) { dec(c, DECAL.scramble, d, Math.min(w, len * 2), Math.min(w, len * 2), paint, 0.75, 0, 0, d.x, d.s + len / 2); }
  for (let x = d.x - w / 2 + 0.25; x < d.x + w / 2 - 0.2; x += 0.9) dec(c, DECAL.zebra, d, 0.5, len, paint, 0.85, 0, 0, x + 0.25, d.s + len / 2);
};
const laneDash: DecorFn = (c, d) => {
  const len = num(d, 'len', 12), dash = num(d, 'dash', 3), gap = num(d, 'gap', 3), col = num(d, 'color', 0) ? 0xf2d064 : 0xede3d3;
  if (dash <= 0) { dec(c, DECAL.solid, d, 0.12, len, col, 0.8, 0, 0, d.x, d.s + len / 2); return; }
  for (let s = d.s; s < d.s + len - 0.1; s += dash + gap) dec(c, DECAL.solid, d, 0.12, Math.min(dash, d.s + len - s), col, 0.8, 0, 0, d.x, s + Math.min(dash, d.s + len - s) / 2);
};
const parkingBay: DecorFn = (c, d) => {
  const len = num(d, 'len', 10), bays = Math.max(1, num(d, 'bays', Math.round(len / 5)));
  for (let k = 0; k <= bays; k++) dec(c, DECAL.parkT, d, 1.0, 1.0, 0xede3d3, 0.75, 0, 0, d.x, d.s + (len * k) / bays);
};
const roadArrow: DecorFn = (c, d) => {
  const k = num(d, 'kind', 0), id = k === 1 ? DECAL.arrowL : k === 2 ? DECAL.arrowR : k === 3 ? DECAL.slow : DECAL.arrowS;
  dec(c, id, d, k === 3 ? 2.2 : 1.2, k === 3 ? 1.6 : 2.6, c.areaAt(d.s) === 'neon' ? 0xd8d0f0 : 0xede3d3, 0.75, Math.PI);
};
const crack: DecorFn = (c, d) => dec(c, rnd(d.s, d.x) < 0.5 ? DECAL.crack1 : DECAL.crack2, d, num(d, 'len', 1.5), num(d, 'len', 1.5) * 0.7, 0x2b2140, 0.4, rnd(d.s) * 6.28);
const patch: DecorFn = (c, d) => dec(c, DECAL.patch, d, num(d, 'w', 1.2), num(d, 'len', 1.6), c.areaAt(d.s) === 'neon' ? 0x403866 : 0x6a6478, 0.6);
const oilStain: DecorFn = (c, d) => dec(c, DECAL.oil, d, num(d, 'r', 0.6) * 2, num(d, 'r', 0.6) * 2, 0x1c1530, 0.45, rnd(d.s) * 6.28);
const drain: DecorFn = (c, d) => dec(c, DECAL.drain, d, 0.8, 0.5, 0x2b2140, 0.7, 0);
const manhole: DecorFn = (c, d) => {
  const area = c.areaAt(d.s), r = num(d, 'r', 0.35);
  const id = area === 'downtown' ? DECAL.manGrid : area === 'docks' ? DECAL.manAnchor : area === 'neon' ? DECAL.manFlower : DECAL.manPlain;
  dec(c, id, d, r * 2, r * 2, area === 'neon' ? 0x1a1430 : 0x3a3052, 0.75, 0);
};
const puddle: DecorFn = (c, d) => {
  const tint = num(d, 'tint', c.areaAt(d.s) === 'neon' ? 1 + (d.variant % 2) : 0);
  c.decal({ id: DECAL.puddle, x: d.x, y: d.y + 0.007, s: d.s, w: num(d, 'w', 0.9), len: num(d, 'len', 1.4), rot: d.rotY, color: tint === 1 ? 0xff3fa4 : tint === 2 ? 0x3ff2ff : 0xffffff, alpha: 0.85, kind: 1 });
};
const leafScatter: DecorFn = (c, d) => dec(c, DECAL.leaves, d, num(d, 'r', 1) * 2, num(d, 'r', 1) * 2, 0xd9765a, 0.85, rnd(d.s) * 6.28);
const petalScatter: DecorFn = (c, d) => dec(c, DECAL.petals, d, num(d, 'r', 1) * 2, num(d, 'r', 1) * 2, 0xffb7d0, 0.9, rnd(d.s) * 6.28);
const driveway: DecorFn = (c, d) => {
  const K = c.K, w = num(d, 'w', 3);
  const x0 = Math.sign(d.x) * 2.6, x1 = Math.sign(d.x) * 4.5;
  K.reset().to('o').lit(PAT.slabs).col(0xd2c2b0).box(Math.min(x0, x1), 0.149, d.s, Math.max(x0, x1), 0.158, d.s + w, FACE.top);
};
const parkPath: DecorFn = (c, d) => dec(c, DECAL.solid, d, num(d, 'w', 3), num(d, 'len', 10), 0xc9b89e, 0.55, 0, 0, d.x, d.s + num(d, 'len', 10) / 2);
const verge: DecorFn = (c, d) => {
  const K = c.K, len = num(d, 'len', 10), w = num(d, 'w', 4), si = Math.round(num(d, 'surface', 2));
  const surf = (['asphalt', 'wetAsphalt', 'concrete', 'tile', 'granite', 'wood', 'metal', 'grass'] as const)[Math.max(0, Math.min(7, si))]!;
  const look = surfaceLook(surf, c.areaAt(d.s));
  const xa = Math.sign(d.x) * Math.max(4.5, Math.abs(d.x)), xb = xa + Math.sign(d.x) * w;
  K.reset().to('o').lit(look.pat).col(look.color).box(Math.min(xa, xb), d.y - 0.1, d.s, Math.max(xa, xb), d.y + 0.004, d.s + len, FACE.top);
};
const steamVent: DecorFn = (c, d) => dec(c, DECAL.grate, d, 0.8, 0.8, 0x1a1430, 0.8, 0);

// ── registry ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const DECOR_RENDERERS: Readonly<Record<DecorKind, DecorFn>> = {
  building, house, warehouse, tower, shadow_caster: shadowCaster, container_stack: containerStack, crane, end_wall: endWall,
  chain_link: chainLink, water, bridge_truss: bridgeTruss, tunnel, city_glow: cityGlow,
  street_lamp: streetLamp, tree, cherry_tree: cherryTree, hedge_round: hedgeRound, fence_run: fenceRun, low_wall: lowWall,
  awning, blade_sign: bladeSign, banner, billboard, holo_billboard: holoBillboard, vending_machine: vendingMachine,
  food_cart: foodCartSide, paper_lantern: paperLantern, cafe_umbrella: cafeUmbrella, hydrant, parking_meter: parkingMeter,
  sign_post: signPost, traffic_light: trafficLight, utility_pole: utilityPole, bike_parked: bikeParked, potted_plant: pottedPlant,
  mailbox_post: mailboxPost, bin_pair: binPair, hoop, sprinkler, parked_car_side: parkedCarSide, pallet_pile: palletPile,
  drum_pile: drumPile, gate_arm: gateArm, crossing_signal: crossingSignal,
  lantern_string: lanternString, overhead_wire: overheadWire, maglev_beam: maglevBeam,
  crosswalk, lane_dash: laneDash, parking_bay: parkingBay, road_arrow: roadArrow, crack, patch, oil_stain: oilStain, drain,
  manhole, puddle, leaf_scatter: leafScatter, petal_scatter: petalScatter, driveway, park_path: parkPath, verge, steam_vent: steamVent,
  petal_emitter: () => {}, leaf_emitter: () => {}, maglev_train: () => {},
};

/** The ambient record of an emitter decor (null for other kinds). */
export function ambientOf(d: Decor): AmbientRec | null {
  const p = d.params ?? {};
  switch (d.kind) {
    case 'petal_emitter': return { kind: 'petals', s: d.s, x: d.x, y: d.y, len: num(d, 'len', 32), rate: num(d, 'rate', 6), p };
    case 'leaf_emitter': return { kind: 'leaves', s: d.s, x: d.x, y: d.y, len: num(d, 'len', 32), rate: num(d, 'rate', 6), p };
    case 'steam_vent': return { kind: 'steam', s: d.s, x: d.x, y: d.y, len: 1, rate: num(d, 'rate', 2), p };
    case 'sprinkler': return { kind: 'sprinkler', s: d.s, x: d.x, y: d.y, len: num(d, 'r', 2), rate: num(d, 'rate', 0.3), p };
    case 'maglev_train': return { kind: 'train', s: d.s, x: d.x, y: d.y, len: num(d, 'len', 40), rate: num(d, 'period', 20), p };
    case 'cherry_tree': return num(d, 'petals', 0.5) > 0 ? { kind: 'petals', s: d.s, x: d.x, y: d.y + 3, len: 6, rate: num(d, 'petals', 0.5) * 3, p } : null;
    default: return null;
  }
}

/** Draws one decor record (unknown kinds draw nothing, as in M0). */
export function drawDecor(c: KitCtx, d: Decor): void {
  if (!isDecorKind(d.kind)) return;
  DECOR_RENDERERS[d.kind](c, d);
  c.K.reset();
}
export const DECOR_ZONE = (k: string) => (isDecorKind(k) ? DECOR_KINDS[k].zone : null);
export type { AreaId };
