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
import { ACCENTS, RECLAIM, fadePaint, mixHex, shade } from '../palette';
import { PAT } from '../textures/ground';
import { DECAL, type DecalId } from '../textures/decals';
import { signRect } from '../textures/signs';
import { RENDER } from '../render.config';
import { FACE, FX } from '../writer';
import { CAR_BODIES, drawCar } from './car';
import { rnd, surfaceLook, type KitCtx } from './common';
import { FLORA, awningAt, bladeSignAt, board, bridgeTruss, building, cityGlow, containerStack, crane, crownAt, endWall, fern, house, hz, num, opt,
  shadowCaster, tower, tunnel, wallDrape, warehouse, water } from './buildings';
import { glowCard, litSign } from './neon';

export type DecorFn = (c: KitCtx, d: Decor) => void;
/** Ambient emitters (petals, leaves, steam, sprinklers, train passes) found while building; vfx/ and the view read them. */
export interface AmbientRec { kind: 'petals' | 'leaves' | 'steam' | 'sprinkler' | 'train'; s: number; x: number; y: number; len: number; rate: number; p: Readonly<Record<string, number>> }

const inward = (d: Decor) => -(Math.sign(d.x) || 1);
const nearOf = (d: Decor) => (d.x > 0 ? FX.near : 0);

// ── RECLAIM dressing for the side band (theme §4; render-side, hash-derived when the new params are absent) ───────
/** Street lamps switched on at dusk by area (theme §4: DT 0%, SB 20%, IN 40%, NE 60%), steady once on. */
export const LAMPS_LIT: Readonly<Record<string, number>> = { downtown: 0, suburbs: 0.2, docks: 0.4, neon: 0.6 };
/** Neon signs still live (theme §4: of the signs that remain, 70% are lit; the rest are dead tubes). */
export const SIGNS_LIVE = 0.7;
/** Weathered grey for what used to be painted cream or white (pickets, posts, backboards): never the grind cream. */
const WEATHERED = 0xb9b1a6;
/** An ivy spiral up a post: short leafy quads winding around it (side band only). */
function postIvy(c: KitCtx, d: Decor, x: number, s: number, y0: number, y1: number, r: number): void {
  // Densest at the foot, thinning upward; overlapping leaf clumps winding round the post (no gaps: not a stripe).
  const K = c.K, f = FLORA[c.areaAt(d.s)], nf = nearOf(d), n = Math.max(2, Math.round((y1 - y0) / 0.32));
  for (let i = 0; i < n; i++) {
    const u = i / n, a = i * 2.3 + hz(d, 61) * 6, y = y0 + u * (y1 - y0), q = 0.09 * (1.25 - 0.6 * u);
    // (on the pole's outer half only, so no leaf reaches inside |x| 4.6)
    const dx = Math.abs(Math.cos(a)) * (Math.sign(x) || 1) * (r + q * 0.5), ds = Math.sin(a) * (r + q * 0.5);
    // Low-poly leaf clusters (8-tri diamonds, a second one at the foot): organic up close, a collar from the run camera.
    K.lit(0, 0.15, nf).col(f.ivy[i % f.ivy.length]!).sphere(x + dx, y + 0.14, s + ds, q * 1.15, 4, 2, 1.6);
    if (i < 2) K.col(f.ivy[(i + 1) % f.ivy.length]!).sphere(x + dx * 0.6, y + 0.3, s - ds * 0.6, q * 0.9, 4, 2, 1.5);
  }
}
/** A grass tuft at a foot (3 blades each side, solid). */
function tuft(c: KitCtx, d: Decor, x: number, s: number, h: number): void {
  const K = c.K, f = FLORA[c.areaAt(d.s)], nf = nearOf(d);
  K.lit(0, 0.4, nf).col(f.leaf[1 % f.leaf.length]!);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + hz(d, 62), dx = Math.cos(a) * 0.12, ds = Math.sin(a) * 0.12;
    K.tri(x - 0.05, d.y, s, x + 0.05, d.y, s, x + dx, d.y + h, s + ds);
    K.tri(x + 0.05, d.y, s, x - 0.05, d.y, s, x + dx, d.y + h, s + ds);
  }
}

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
  if (area === 'downtown') K.col(RECLAIM.patina).cyl(d.x, d.s, d.y + 0.9, d.y + 1.0, 0.08, 6, false);
  // RECLAIM: ivy up the pole, a vine from the arm (beyond the corridor), a solar cap on the head; lit by area.
  const lit = opt(d, 'lit', 63, (q) => (q < (LAMPS_LIT[area] ?? 0) ? 1 : 0));
  postIvy(c, d, d.x, d.s, d.y + 0.4, d.y + Math.min(h * 0.55, 2.6), 0.07);
  if (opt(d, 'vine', 64, (q) => (q < 0.5 ? 1 : 0)) > 0 && arm > 0.3) {
    K.lit(PAT.grass, 0.4, nf).col(FLORA[area].ivy[1]!).box(hx - inw * 0.1 - 0.05, d.y + h - 1.4, d.s - 0.05, hx - inw * 0.1 + 0.05, d.y + h - 0.05, d.s + 0.05);
  }
  // Head: DT ornate lantern, SB simple cobra head, Docks floodlight block, Neon paper lantern top.
  const lampCol = area === 'neon' ? 0xff5a3c : area === 'docks' ? 0xfff1c9 : 0xffd39a;
  K.col(pole);
  if (area === 'downtown') { K.frustum(hx, d.s, d.y + h - 0.55, d.y + h - 0.45, 0.12, 0.2, 6, false); K.frustum(hx, d.s, d.y + h, d.y + h + 0.18, 0.22, 0.04, 6, true); }
  else if (area === 'docks') K.box(hx - 0.3, d.y + h - 0.1, d.s - 0.2, hx + 0.3, d.y + h + 0.15, d.s + 0.2);
  else K.box(hx - 0.22, d.y + h - 0.08, d.s - 0.12, hx + 0.22, d.y + h + 0.04, d.s + 0.12);
  K.lit(0, 0, nf).col(0x1e2a4e).box(hx - 0.16, d.y + h + (area === 'downtown' ? 0.18 : 0.15), d.s - 0.1, hx + 0.16, d.y + h + (area === 'downtown' ? 0.21 : 0.18), d.s + 0.1, FACE.top | FACE.front);
  if (lit > 0) K.to('e').glowing(lit * 1.6, -1, nf).col(lampCol); else K.lit(0, 0, nf).col(0x5a5468);
  if (area === 'downtown') K.cyl(hx, d.s, d.y + h - 0.45, d.y + h, 0.16, 6, false);
  else if (area === 'neon') K.sphere(hx, d.y + h - 0.3, d.s, 0.2, 6, 4, 1.25);
  else K.box(hx - 0.2, d.y + h - 0.12, d.s - 0.1, hx + 0.2, d.y + h - 0.08, d.s + 0.1, FACE.sides5 | FACE.bottom);
  K.to('b');
  if (lit > 0) glowCard(c, hx, d.y + h - 0.3, d.s - 0.2, 1.4, 1.4, lampCol, 0.55, nf);
};

const tree: DecorFn = (c, d) => {
  const K = c.K, area = c.areaAt(d.s), sc = d.scale || 1, nf = nearOf(d);
  const crown = num(d, 'crown', 1.6) * sc, trunkH = num(d, 'trunkH', 2.6) * sc, sway = num(d, 'sway', 0.3);
  // RECLAIM species (theme §4): 3 plane, 4 fig (Downtown), 5 birch (Suburbs). Today's WG emits 1 (palm) in Downtown
  // and 0 elsewhere: Downtown becomes a third each palm, plane and fig, a third of the Suburbs trees birches.
  const sp0 = num(d, 'species', area === 'downtown' ? 1 : 0), hs = hz(d, 65);
  const species = area === 'downtown' && sp0 === 1 ? (hs < 1 / 3 ? 1 : hs < 2 / 3 ? 3 : 4) : area === 'suburbs' && sp0 === 0 && hs < 1 / 3 ? 5 : sp0;
  const fl = FLORA[area];
  // Keep the crown outside the corridor edge (decor never overhangs |x| < 4.6).
  const cx = Math.sign(d.x) * Math.max(Math.abs(d.x), 4.6 + crown * 0.85);
  K.reset().to('b').lit(0, 0, nf).col(0x4a3530);
  if (species === 1) {
    K.lit(0, 0, nf).col(0xb3a194).box(d.x - 0.45, d.y, d.s - 0.45, d.x + 0.45, d.y + 0.5, d.s + 0.45);
    K.lit(0, 0, nf).col(0x6b4e3a).frustum(d.x, d.s, d.y + 0.5, d.y + trunkH + 1.6, 0.16, 0.1, 6, false);
    K.lit(0, sway * 2, nf).col(fl.leaf[0]!);
    const top = d.y + trunkH + 1.6;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd(d.s, d.x) * 2, dx = Math.cos(a), ds = Math.sin(a), L = crown * 0.9;
      K.quad(d.x, top + 0.1, d.s, d.x + dx * 0.25 - ds * 0.14, top + 0.15, d.s + ds * 0.25 + dx * 0.14, d.x + dx * L, top - 0.5, d.s + ds * L, d.x + dx * 0.25 + ds * 0.14, top + 0.15, d.s + ds * 0.25 - dx * 0.14);
    }
    return;
  }
  if (species === 3 || species === 4 || species === 5) {
    // Plane: a tall pale-barked trunk, a broad crown. Fig: a short thick trunk, a wide low dense crown. Birch: a slim
    // grey trunk and a light, taller oval crown. Solid lumps (no cards), crowns kept outside the corridor.
    const [bark, tr, th, r, lumps, cols] = species === 3 ? [0x8a7d6a, 0.16, trunkH + 0.8, crown * 1.15, 5, fl.leaf] as const
      : species === 4 ? [0x6b5a4a, 0.24, trunkH * 0.75, crown * 1.3, 6, [fl.leaf[0]!, 0x3f6b3a, fl.leaf[2]!]] as const
      : [0xa39d94, 0.09, trunkH + 0.6, crown * 0.85, 4, [RECLAIM.newLeaf, fl.leaf[1]!]] as const;
    const ccx = Math.sign(d.x) * Math.max(Math.abs(d.x), 4.6 + r * 0.85);
    K.col(bark).frustum(d.x, d.s, d.y, d.y + th, tr * sc, tr * 0.6 * sc, 6, false);
    if (Math.abs(ccx - d.x) > 0.2) K.bar(d.x, d.y + th * 0.85, d.s, ccx, d.y + th + 0.2, d.s, 0.06);
    crownAt(K, ccx, d.y + th + r * 0.45, d.s, r, cols, (d.s * 19 + d.x * 7) | 0, nf, lumps, sway);
    if (species === 5) crownAt(K, ccx, d.y + th + r * 1.2, d.s, r * 0.7, cols, (d.s * 23) | 0, nf, 2, sway);
    return;
  }
  K.frustum(d.x, d.s, d.y, d.y + trunkH, 0.14 * sc, 0.1 * sc, 6, false);
  const leaf = area === 'neon' ? fl.leaf : area === 'suburbs' ? [0x7f9a5a, 0x9db36b, RECLAIM.newLeaf] : [0x6f8f4e, 0x86a05a, fl.leaf[1]!];
  if (species === 2) {
    for (let k = 0; k < 3; k++) K.lit(0, sway, nf).col(shade(0x3f6a48, k * 0.06)).frustum(cx, d.s, d.y + trunkH * 0.6 + k * crown * 0.6, d.y + trunkH * 0.6 + (k + 1.4) * crown * 0.6, crown * (1 - k * 0.25), 0.05, 7, false);
    return;
  }
  // Fuller, wilder crowns (inside today's crown range): five lumps instead of four.
  for (let i = 0; i < 5; i++) {
    const r = crown * (0.5 + 0.2 * rnd(d.s, i));
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
  // RECLAIM: shaggy (two wild lumps), 1 in 3 a flowering buddleia (lilac spikes; decor, so blooms are fine).
  K.col(0x6f8f4e).sphere(d.x - r * 0.45, d.y + r * sq * 1.2, d.s + r * 0.3, r * 0.4, 5, 3, 1);
  K.sphere(d.x + r * 0.35, d.y + r * sq * 1.25, d.s + r * 0.4, r * 0.35, 5, 3, 1);
  if (opt(d, 'bloom', 66, (q) => (q < 1 / 3 ? 1 : 0)) > 0) for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + hz(d, 67) * 3;
    K.lit(0, 0.2, nearOf(d)).col(0xb79ad8).frustum(d.x + Math.cos(a) * r * 0.5, d.s + Math.sin(a) * r * 0.5, d.y + r * sq * 1.5, d.y + r * sq * 1.5 + 0.45, 0.09, 0.02, 4, false);
  }
};

const fenceRun: DecorFn = (c, d) => {
  const K = c.K, len = num(d, 'len', 8), h = num(d, 'h', 1.0), style = num(d, 'style', 0), nf = nearOf(d);
  K.reset().to('b');
  if (style === 1) { K.lit(PAT.grass, 0, nf).col(0x4f6e44).chamfer(d.x - 0.3, d.y, d.s, d.x + 0.3, d.y + h, d.s + len, 0.12, 0x6f8f4e); return; }
  if (style === 2) {
    K.lit(PAT.brickWall, 0, nf).col(0xc9a48a).box(d.x - 0.15, d.y, d.s, d.x + 0.15, d.y + h, d.s + len);
    // RECLAIM: a moss cap (decor wall, light moss) on most of its length.
    K.lit(PAT.grass, 0, nf).col(hz(d, 68) < 0.6 ? 0x8fa77a : 0xb7a898).box(d.x - 0.18, d.y + h, d.s, d.x + 0.18, d.y + h + 0.06, d.s + len);
    return;
  }
  // (G1: a painted blue-grey picket, not cream: its long rails along the street must not read as a grind rail;
  // RECLAIM: weathered grey #8E98A0, 2.78:1 against cream, with climbing roses on the Suburbs fences.)
  if (c.areaAt(d.s) === 'suburbs' && opt(d, 'roses', 69, (q) => (q < 0.5 ? 1 : 0)) > 0) {
    const cover = 0.3 + 0.3 * hz(d, 70);
    wallDrape(K, 'side', inward(d), d.x + inward(d) * 0.03, d.s + 0.2, d.s + len - 0.2, d.y + h, d.y, cover, FLORA.suburbs.ivy, (d.s * 3) | 0, nf, 5, PAT.grass, true);
    for (let i = 0; i < Math.round(len * cover * 1.5); i++) {
      const s = d.s + 0.3 + rnd(d.s, i, 71) * (len - 0.6), y = d.y + 0.3 + rnd(d.s, i, 72) * (h - 0.5), x = d.x + inward(d) * 0.08;
      K.lit(0, 0, nf).col(RECLAIM.rose).box(x - 0.04, y, s, x + 0.04, y + 0.08, s + 0.08);
    }
  }
  K.lit(0, 0, nf).col(RECLAIM.pickets);
  K.box(d.x - 0.03, d.y + 0.25, d.s, d.x + 0.03, d.y + 0.32, d.s + len); K.box(d.x - 0.03, d.y + h - 0.3, d.s, d.x + 0.03, d.y + h - 0.23, d.s + len);
  for (let s = d.s + 0.05; s < d.s + len - 0.05; s += 0.16) {
    K.box(d.x - 0.015, d.y, s, d.x + 0.015, d.y + h - 0.08, s + 0.09);
    K.tri(d.x, d.y + h - 0.08, s, d.x, d.y + h - 0.08, s + 0.09, d.x, d.y + h, s + 0.045);
  }
};

const lowWall: DecorFn = (c, d) => {
  const K = c.K, len = num(d, 'len', 6), h = num(d, 'h', 0.5);
  K.reset().to('b').lit(PAT.pavers, 0, nearOf(d)).col(0xc4b2a6).chamfer(d.x - 0.2, d.y, d.s, d.x + 0.2, d.y + h, d.s + len, 0.03);
  // RECLAIM: mossy low walls (decor at |x| ≥ 4.6): a moss cap over most of the top.
  if (opt(d, 'moss', 73, (q) => (q < 0.7 ? 1 : 0)) > 0) K.lit(PAT.grass, 0, nearOf(d)).col(0x8fa77a).box(d.x - 0.17, d.y + h, d.s + 0.2, d.x + 0.17, d.y + h + 0.025, d.s + len * (0.5 + 0.45 * hz(d, 74)), FACE.top | FACE.front | FACE.left | FACE.right);
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
  bladeSignAt(c, xFace, d.s, hungY(c, d, HUNG.blade), h, w, pick, area, nearOf(d), opt(d, 'live', 75, (q) => (q < SIGNS_LIVE ? 1 : 0)) > 0);
};

const banner: DecorFn = (c, d) => {
  const K = c.K, area = c.areaAt(d.s), h = num(d, 'h', 1.2), raw = ACCENTS[area][num(d, 'color', d.variant) % ACCENTS[area].length]!;
  const col = area === 'neon' ? raw : fadePaint(raw);
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
  // RECLAIM: faded brand art (textures/signs.ts paints it faded, peeling at the corners) on a grey board.
  K.col(area === 'neon' ? 0x2b2140 : RECLAIM.peeledBoard).box(x0 - 0.1, y0 - 0.1, d.s, x1 + 0.1, y0 + h + 0.1, d.s + 0.2);
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
  // RECLAIM: 70% live (the 0.2 Hz hue drift stays, the rare flicker is gone: materials.ts), the rest dead tubes.
  const key = `holo:${(d.variant + Math.max(0, num(d, 'brand', 0))) % 4}`;
  if (opt(d, 'live', 75, (q) => (q < SIGNS_LIVE ? 1 : 0)) > 0) {
    litSign(c, key, x0, x1, y0, y0 + h, d.s, 1.8, 1, nf);
    glowCard(c, (x0 + x1) / 2, y0 + h / 2, d.s - 0.1, w * 1.4, h * 1.4, 0x8a5cff, 0.45, nf);
  } else {
    const r = signRect(key);
    K.to('e').glowing(0.5, -1, nf).col(RECLAIM.deadTube).quad(x0, y0, d.s, x1, y0, d.s, x1, y0 + h, d.s, x0, y0 + h, d.s, [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1]);
    K.to('b');
  }
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
  // RECLAIM: the night-owl lights glow steady; moss-coloured tops, a vine down the outer side.
  K.lit(PAT.grass, 0, nf).col(RECLAIM.nightMoss).box(Math.min(xa, xb) + 0.03, d.y + 1.8, d.s + 0.05, Math.max(xa, xb) - 0.03, d.y + 1.83, d.s + n * 1.02 - 0.1, FACE.top);
  wallDrape(K, 'front', 0, d.s - 0.02, Math.max(xa, xb) - 0.35, Math.max(xa, xb) - 0.05, d.y + 1.8, d.y + 0.6, 0.9, FLORA.neon.ivy, (d.s * 3) | 0, nf, 2);
};

const foodCartSide: DecorFn = (c, d) => {
  const K = c.K, nf = nearOf(d);
  const xa = Math.sign(d.x) * Math.max(4.6, Math.abs(d.x)), xb = xa + Math.sign(d.x) * 1.2;
  const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), s0 = d.s, s1 = d.s + 2;
  K.reset().to('b').lit(0, 0, nf).col(0x6a3a30).box(x0, d.y + 0.2, s0, x1, d.y + 0.95, s1);
  K.col(0x2b2140); for (const s of [s0 + 0.3, s1 - 0.3]) K.hcyl('x', 0, d.y + 0.22, s, x0 - 0.02, x0 + 0.04, 0.22, 8, true);
  K.to('e').glowing(num(d, 'glow', 1) * 1.3, -1, nf).col(0xffd39a).box(x0 + 0.05, d.y + 0.78, s0 - 0.01, x1 - 0.05, d.y + 0.92, s0, FACE.front);
  K.to('b');
  K.lit(0, 0, nf).col(0xb5625a);
  for (let i = 0; i < 3; i++) K.box(x0 + i * 0.4 + 0.02, d.y + 1.55, s0 - 0.02, x0 + (i + 1) * 0.4 - 0.02, d.y + 1.95, s0, FACE.front);
  const word = num(d, 'word', -1), brand = num(d, 'brand', -1);
  // (RECLAIM theme §1: 出口 and 薬局 never appear on a live sign; the cart shows its brand instead.)
  const w2 = word % NEON_SIGN_WORDS.length === 5 || word % NEON_SIGN_WORDS.length === 9 ? -1 : word;
  if (w2 >= 0 || brand >= 0 || word >= 0) litSign(c, w2 >= 0 ? `w:${w2 % NEON_SIGN_WORDS.length}` : `b:neon:${Math.max(0, brand) % DECOR_BRANDS.neon.length}`, x0 + 0.05, x1 - 0.05, d.y + 1.6, d.y + 1.9, s0 - 0.03, 1.2, 0, nf);
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
  const K = c.K, r = num(d, 'r', 1.1), nf = nearOf(d), col = fadePaint(ACCENTS.downtown[num(d, 'color', d.variant) % 5]!);
  const x = Math.sign(d.x) * Math.max(Math.abs(d.x), 4.6 + r);
  K.reset().to('b').lit(0, 0, nf).col(0x2b2140).cyl(x, d.s, d.y, d.y + 0.72, 0.04, 5, false);
  K.col(WEATHERED).cyl(x, d.s, d.y + 0.72, d.y + 0.76, 0.4, 8, true);
  K.col(0x2b2140).cyl(x, d.s, d.y + 0.76, d.y + 2.3, 0.025, 5, false);
  for (let i = 0; i < 8; i++) {
    K.col(i % 2 ? col : mixHex(col, 0xe8dccb, 0.55));
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
    K.tri(x, d.y + 2.5, d.s, x + Math.cos(a0) * r, d.y + 2.15, d.s + Math.sin(a0) * r, x + Math.cos(a1) * r, d.y + 2.15, d.s + Math.sin(a1) * r);
  }
};

const hydrant: DecorFn = (c, d) => {
  const K = c.K, nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0xb5625a).cyl(d.x, d.s, d.y, d.y + 0.55, 0.11, 7, false);
  K.frustum(d.x, d.s, d.y + 0.55, d.y + 0.7, 0.12, 0.05, 7, true);
  K.hcyl('x', 0, d.y + 0.38, d.s, d.x - 0.18, d.x + 0.18, 0.05, 5, true);
  // RECLAIM: a rust collar and grass at the foot (scenery).
  K.col(RECLAIM.rust).cyl(d.x, d.s, d.y + 0.02, d.y + 0.12, 0.125, 7, false);
  tuft(c, d, d.x + 0.12, d.s - 0.1, 0.35); tuft(c, d, d.x - 0.14, d.s + 0.08, 0.28);
};

const parkingMeter: DecorFn = (c, d) => {
  const K = c.K, nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0x4a4458).cyl(d.x, d.s, d.y, d.y + 1.1, 0.03, 5, false);
  K.col(0x6a6478).box(d.x - 0.1, d.y + 1.1, d.s - 0.06, d.x + 0.1, d.y + 1.4, d.s + 0.06);
  // RECLAIM: the meter's screen is dark; rust at the head, ivy up the post.
  K.col(0x2b2140).box(d.x - 0.06, d.y + 1.25, d.s - 0.065, d.x + 0.06, d.y + 1.33, d.s - 0.06, FACE.front);
  K.col(RECLAIM.rustDeep).box(d.x - 0.105, d.y + 1.1, d.s - 0.065, d.x + 0.105, d.y + 1.16, d.s + 0.065);
  postIvy(c, d, d.x, d.s, d.y + 0.05, d.y + 0.9, 0.03);
};

const signPost: DecorFn = (c, d) => {
  const K = c.K, h = num(d, 'h', 2.6), kind = num(d, 'kind', 0), nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0x6a6478).cyl(d.x, d.s, d.y, d.y + h, 0.035, 5, false);
  if (hz(d, 76) < 0.6) postIvy(c, d, d.x, d.s, d.y, d.y + h * 0.6, 0.035);
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
  // RECLAIM: traffic lights are dark (lenses only), with a bird's nest on the head; `state` is kept for later use.
  const cols = [0xff5a3c, 0xe6ad3a, 0x7ee0b5];
  void st;
  K.to('e');
  for (let i = 0; i < 3; i++) K.glowing(0.15, -1, nf).col(cols[i]!).box(hx - 0.09, d.y + h - 0.3 - i * 0.3, d.s - 0.125, hx + 0.09, d.y + h - 0.14 - i * 0.3, d.s - 0.12, FACE.front);
  K.to('b');
  K.lit(0, 0, nf).col(0x6b5a44).frustum(hx, d.s, d.y + h, d.y + h + 0.12, 0.13, 0.2, 6, true);
};

const utilityPole: DecorFn = (c, d) => {
  const K = c.K, h = num(d, 'h', 8), arms = num(d, 'arms', 2), nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0x5a4636).cyl(d.x, d.s, d.y, d.y + h, 0.12, 6, true);
  K.col(0x4a3a2e);
  for (let k = 0; k < arms; k++) K.box(d.x - 0.9, d.y + h - 0.6 - k * 0.7, d.s - 0.06, d.x + 0.9, d.y + h - 0.48 - k * 0.7, d.s + 0.06);
  K.col(0xd8cfc0); for (let k = 0; k < arms; k++) for (const dx of [-0.8, -0.3, 0.3, 0.8]) K.box(d.x + dx - 0.04, d.y + h - 0.48 - k * 0.7, d.s - 0.04, d.x + dx + 0.04, d.y + h - 0.38 - k * 0.7, d.s + 0.04);
  K.col(0x6a6478).cyl(d.x - 0.2 * Math.sign(d.x), d.s + 0.25, d.y + h - 2.4, d.y + h - 1.7, 0.22, 7, true);
  postIvy(c, d, d.x, d.s, d.y, d.y + h * (0.3 + 0.3 * hz(d, 77)), 0.12);
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
    // RECLAIM: overgrown, grass up through the wheels.
    tuft(c, d, d.x - 0.3, s, 0.45); tuft(c, d, d.x + 0.32, s, 0.38);
  }
};

const pottedPlant: DecorFn = (c, d) => {
  const K = c.K, h = num(d, 'h', 0.9), nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0xb5645a).frustum(d.x, d.s, d.y, d.y + h * 0.4, 0.22, 0.28, 7, true);
  K.lit(0, 0.3, nf).col(0x5f7f4a).sphere(d.x, d.y + h * 0.65, d.s, h * 0.35, 6, 4, 1);
  K.col(0x7f9a5a).sphere(d.x + 0.1, d.y + h * 0.85, d.s - 0.05, h * 0.2, 5, 3, 1);
  // RECLAIM: bursting, spilling up to 0.3 m over the rim, with a few flowers (scenery).
  const f = FLORA[c.areaAt(d.s)];
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + hz(d, 78) * 3; K.col(f.leaf[i % f.leaf.length]!).sphere(d.x + Math.cos(a) * 0.3, d.y + h * 0.45, d.s + Math.sin(a) * 0.3, 0.16, 5, 3, 0.8); }
  if (c.areaAt(d.s) !== 'neon') K.col(hz(d, 79) < 0.5 ? 0xe98ba6 : 0xb79ad8).box(d.x - 0.05, d.y + h * 0.98, d.s - 0.12, d.x + 0.05, d.y + h * 1.04, d.s - 0.02);
};

const mailboxPost: DecorFn = (c, d) => {
  const K = c.K, nf = nearOf(d), col = ACCENTS.suburbs[num(d, 'color', d.variant) % 5]!;
  K.reset().to('b').lit(0, 0, nf).col(WEATHERED).box(d.x - 0.04, d.y, d.s - 0.04, d.x + 0.04, d.y + 1.0, d.s + 0.04);
  K.col(fadePaint(col)).box(d.x - 0.13, d.y + 1.0, d.s - 0.25, d.x + 0.13, d.y + 1.2, d.s + 0.25);
  K.hcyl('s', d.x, d.y + 1.2, 0, d.s - 0.25, d.s + 0.25, 0.13, 6, true);
  K.col(0xb5625a).box(d.x + 0.13, d.y + 1.05, d.s, d.x + 0.15, d.y + 1.4, d.s + 0.05);
  // RECLAIM: a nest on 1 in 3 mailboxes (Suburbs), ivy up the post.
  if (opt(d, 'nest', 80, (q) => (q < 1 / 3 ? 1 : 0)) > 0) K.col(0x6b5a44).frustum(d.x, d.s, d.y + 1.33, d.y + 1.43, 0.1, 0.15, 6, true);
  postIvy(c, d, d.x, d.s, d.y, d.y + 0.7, 0.04);
};

const binPair: DecorFn = (c, d) => {
  const K = c.K, n = Math.max(1, Math.min(3, num(d, 'count', 2))), nf = nearOf(d), lid = ACCENTS.suburbs[num(d, 'color', d.variant) % 5]!;
  K.reset().to('b');
  for (let i = 0; i < n; i++) {
    const s = d.s + i * 0.72;
    K.lit(0, 0, nf).col(0x3a5a48).box(d.x - 0.3, d.y + 0.05, s, d.x + 0.3, d.y + 1.0, s + 0.66);
    K.col(fadePaint(i % 2 ? 0xb07a66 : lid)).box(d.x - 0.33, d.y + 1.0, s - 0.03, d.x + 0.33, d.y + 1.08, s + 0.69);
  }
};

const hoop: DecorFn = (c, d) => {
  const K = c.K, h = num(d, 'h', 3.05), nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0x6a6478).cyl(d.x, d.s, d.y, d.y + h + 0.6, 0.06, 6, true);
  K.col(WEATHERED).box(d.x - 0.6, d.y + h, d.s - 0.15, d.x + 0.6, d.y + h + 0.75, d.s - 0.1);
  postIvy(c, d, d.x, d.s, d.y, d.y + 1.6, 0.06);
  K.lit(0, 0, nf);
  K.col(0xc4473d).box(d.x - 0.2, d.y + h + 0.15, d.s - 0.155, d.x + 0.2, d.y + h + 0.4, d.s - 0.15, FACE.front);
  K.col(0xff8a5b).cyl(d.x, d.s - 0.4, d.y + h, d.y + h + 0.03, 0.22, 8, false);
};

const parkedCarSide: DecorFn = (c, d) => {
  const van = num(d, 'van', 0) === 1, L = van ? 4.6 : 4.4, W = 1.85, H = van ? 1.9 : 1.45;
  const xa = Math.sign(d.x) * Math.max(4.6, Math.abs(d.x)), xb = xa + Math.sign(d.x) * W;
  // RECLAIM: sun-faded mid-value paints, never ink, no chrome (the T1 vehicle builder replaces the body).
  const cars = RECLAIM.decorCarPaint;
  const body = cars[Math.floor(num(d, 'color', rnd(d.s, d.x)) * cars.length) % cars.length] ?? CAR_BODIES[0]!;
  c.K.reset().to('b').lit(0, 0, nearOf(d));
  drawCar(c.K, { x0: Math.min(xa, xb), x1: Math.max(xa, xb), s0: d.s, s1: d.s + L, y: d.y, h: H, body, accent: RECLAIM.bumper, van });
  c.K.to('b');
};

const palletPile: DecorFn = (c, d) => {
  const K = c.K, tiers = Math.max(1, Math.min(8, num(d, 'tiers', 4))), n = Math.max(1, Math.min(3, num(d, 'count', 1))), nf = nearOf(d);
  K.reset().to('b');
  for (let k = 0; k < n; k++) for (let t = 0; t < tiers; t++) {
    const s = d.s + k * 1.3, y = d.y + t * 0.15;
    K.lit(PAT.planks, 0, nf).col(shade(0xa8977e, (t % 2) * 0.08 - 0.05)).box(d.x - 0.5, y, s, d.x + 0.5, y + 0.14, s + 1.2);
  }
  // RECLAIM: sun-greyed, grass at the foot and on the top pallet.
  tuft(c, d, d.x - 0.5, d.s + 0.1, 0.4); tuft(c, d, d.x + 0.5, d.s + 1.0, 0.35);
  K.lit(PAT.grass, 0, nf).col(FLORA[c.areaAt(d.s)].moss[0]!).box(d.x - 0.4, d.y + tiers * 0.15, d.s + 0.2, d.x + 0.1, d.y + tiers * 0.15 + 0.02, d.s + 0.8, FACE.top);
};

const drumPile: DecorFn = (c, d) => {
  const K = c.K, n = Math.max(1, Math.min(8, num(d, 'count', 4))), nf = nearOf(d), col = ACCENTS.docks[num(d, 'color', d.variant) % 6]!;
  K.reset().to('b');
  for (let i = 0; i < n; i++) {
    const x = d.x + (i % 2) * 0.62 * Math.sign(d.x), s = d.s + Math.floor(i / 2) * 0.62;
    K.lit(0, 0, nf).col(fadePaint(i % 3 === 0 ? 0x2f5d7c : col)).cyl(x, s, d.y, d.y + 0.9, 0.29, 8, true);
    K.col(RECLAIM.rust).cyl(x, s, d.y + 0.45, d.y + 0.49, 0.3, 8, false);
  }
  // RECLAIM: flowers grow in the first drum (scenery, so blooms on top are fine).
  K.lit(0, 0.3, nf).col(FLORA.docks.leaf[0]!).sphere(d.x, d.y + 0.95, d.s, 0.24, 5, 3, 0.6);
  K.col(0x7fa3e0).box(d.x - 0.06, d.y + 1.04, d.s - 0.05, d.x + 0.04, d.y + 1.1, d.s + 0.05);
};

const gateArm: DecorFn = (c, d) => {
  const K = c.K, h = num(d, 'h', 5), nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0x3a3052).box(d.x - 0.25, d.y, d.s - 0.25, d.x + 0.25, d.y + 1.1, d.s + 0.25);
  // RECLAIM: the arm stands up, faded, wrapped in vines; its lamp is dark (nothing blinks on decor).
  for (let k = 0; k < 6; k++) K.lit(0, 0, nf).col(k % 2 ? 0xb5625a : WEATHERED).box(d.x - 0.06, d.y + 1.1 + k * (h - 1.1) / 6, d.s - 0.06, d.x + 0.06, d.y + 1.1 + (k + 1) * (h - 1.1) / 6, d.s + 0.06);
  K.lit(0, 0, nf).col(0x4a2a2a).box(d.x - 0.08, d.y + 0.8, d.s - 0.26, d.x + 0.08, d.y + 0.95, d.s - 0.25, FACE.front);
  postIvy(c, d, d.x, d.s, d.y + 1.1, d.y + 1.1 + (h - 1.1) * 0.5, 0.07);
};

const crossingSignal: DecorFn = (c, d) => {
  const K = c.K, nf = nearOf(d);
  K.reset().to('b').lit(0, 0, nf).col(0x3a3052).cyl(d.x, d.s, d.y, d.y + 3.2, 0.06, 6, false);
  K.col(WEATHERED);
  K.bar(d.x - 0.5, d.y + 2.8, d.s - 0.05, d.x + 0.5, d.y + 3.3, d.s - 0.05, 0.05);
  K.bar(d.x - 0.5, d.y + 3.3, d.s - 0.05, d.x + 0.5, d.y + 2.8, d.s - 0.05, 0.05);
  K.col(0x2b2140).box(d.x - 0.45, d.y + 2.1, d.s - 0.1, d.x + 0.45, d.y + 2.4, d.s);
  // RECLAIM: the crossing lamps are dark; ivy up the post.
  K.col(0x4a2a2a).cyl(d.x - 0.28, d.s - 0.1, d.y + 2.15, d.y + 2.35, 0.11, 7, true);
  K.cyl(d.x + 0.28, d.s - 0.1, d.y + 2.15, d.y + 2.35, 0.11, 7, true);
  postIvy(c, d, d.x, d.s, d.y, d.y + 1.8, 0.06);
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
  // RECLAIM: morning glory and ivy woven in from the foot, on the far face (seen through the mesh; nothing leafy
  // inside |x| 4.6), blue blooms (decor).
  const out = -inward(d), cover = opt(d, 'ivy', 24, (q) => 0.3 + 0.4 * q);
  wallDrape(K, 'side', out, x + out * 0.01, d.s + 0.2, d.s + len - 0.2, d.y + h - 0.1, d.y, cover, FLORA[c.areaAt(d.s)].ivy, (d.s * 5) | 0, nf, 7, PAT.grass, true);
  if (c.areaAt(d.s) !== 'neon') for (let i = 0; i < Math.round(len * cover); i++) {
    const s = d.s + 0.3 + rnd(d.s, i, 81) * (len - 0.6), y = d.y + 0.3 + rnd(d.s, i, 82) * (h * 0.6);
    K.lit(0, 0, nf).col(0x7fa3e0).box(x + out * 0.06 - 0.04, y, s, x + out * 0.06 + 0.04, y + 0.08, s + 0.08);
  }
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
    const u = (i + 0.5) / n, x = x0 + (x1 - x0) * u;
    // (G1, owner playtest: a row of bright bulbs across the road read as a low chain to ollie) Bulbs hang only over
    // the sidewalks and facades; over the corridor the string is its thin dark wire.
    if (Math.abs(x) < RENDER.overhead.bulbClearX) continue;
    const col = pal === 1 ? 0xffd39a : pal === 2 ? 0xff5a3c : i % 2 ? 0xffd39a : 0xff5a3c;
    // RECLAIM: 60% of the bulbs switched on (`litRatio`), steady; the others hang as dark paper.
    const lit = rnd(d.s, i, 83) < num(d, 'litRatio', 0.6);
    c.lantern({ x, y: yAt(u) + 0.08, s: d.s, r: 0.13, color: lit ? col : 0x6a5560, phase: u * 3 + rnd(d.s) * 6, glow: lit ? 1.6 : 0.45 });
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
    // RECLAIM: night moss on the top faces only, nothing hangs.
    K.lit(PAT.grass, 0, 0).col(RECLAIM.nightMoss).box(x + dx - 0.07, y + 0.3, d.s + 0.5, x + dx + 0.07, y + 0.315, d.s + len - 0.5, FACE.top);
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
/** RECLAIM: road paint has faded (theme §4, alpha ×0.7). */
const PAINT_FADE = 0.7;
const paintOf = (c: KitCtx, d: Decor) => (c.areaAt(d.s) === 'neon' ? 0xd8d0f0 : 0xede3d3);

/** Road logic for the arrows (owner note 8): an arrow is painted only before a crossing, centred in a lane the skater
 *  travels, pointing the way they ride (+s), never backwards, sideways or on a lane line, one per crossing. WG emits a
 *  chunk's lane paint, bays, crossing and arrow in that order but not always in the same chunk, so each build keeps
 *  what it has seen: the centre-line colour (yellow = two-way: only the right-hand lane is ours), the bay side, the
 *  crossings and the arrows still waiting for one (an arrow with no crossing in its chunk is not painted). */
interface RoadMarks { twoWay: boolean; bay: number; cross: { s: number; claimed: boolean }[]; waiting: { kind: number; s: number; x: number; y: number }[] }
const ROAD = new WeakMap<KitCtx, RoadMarks>();
const roadMarks = (c: KitCtx): RoadMarks => {
  let m = ROAD.get(c);
  if (!m) { m = { twoWay: false, bay: 0, cross: [], waiting: [] }; ROAD.set(c, m); }
  return m;
};
/** Arrow paint size (a real lane arrow is longer; this reads at the run camera's scale). */
export const ARROW = { before: 6, w: 1.0, len: 3.0, slowW: 1.8, slowLen: 1.4 } as const;
/** The kerb line at s on one side: the first |x| where the ground rises onto a sidewalk (WG lays the road as the
 *  datum band and the sidewalks at +0.15: |x| 3.0 Downtown and Neon, 2.6 Suburbs), else the street edge 4.5. */
export function kerbX(c: KitCtx, s: number, side: -1 | 1, datum: number): number {
  // (Every layout's kerb is at |x| ≥ 2.6; scanning from 2.5 keeps a raised prop nearer the middle from reading as one.)
  for (let x = 2.5; x < 4.5; x += 0.1) if (c.groundAt(s, side * x) - datum > 0.08) return x;
  return 4.5;
}
function paintArrow(c: KitCtx, m: RoadMarks, a: { kind: number; s: number; x: number; y: number }, cs: number): void {
  const area = c.areaAt(cs), s = cs - ARROW.before;
  // Two-way streets (the yellow centre line: Suburbs) paint only the right-hand lane, the one the skater rides.
  const side: -1 | 1 = m.twoWay || area === 'suburbs' ? 1 : m.bay !== 0 ? (m.bay > 0 ? -1 : 1) : rnd(cs, a.x, 17) < 0.5 ? -1 : 1;
  const R = kerbX(c, s, side, a.y);
  // The lane centre; Downtown keeps the arrow clear of a parking bay's T marks (|x| 2.0–3.0) on either side.
  const lx = area === 'downtown' ? Math.min(R / 2, R - 1.55) : R / 2;
  const slow = a.kind === 3, ground = c.groundAt(s, side * lx);
  // Fewer if in doubt: no arrow where a prop's slab covers the lane (it would be painted on its top).
  if (ground - a.y > 0.03 || c.groundAt(s - ARROW.len / 2, side * lx) - a.y > 0.03 || c.groundAt(s + ARROW.len / 2, side * lx) - a.y > 0.03) return;
  const y = ground + 0.006;
  c.decal({ id: slow ? DECAL.slow : DECAL.arrowS, x: side * lx, y, s, w: slow ? ARROW.slowW : ARROW.w,
    len: slow ? ARROW.slowLen : ARROW.len, rot: 0, color: area === 'neon' ? 0xd8d0f0 : 0xede3d3, alpha: 0.75 * PAINT_FADE, kind: 0 });
}

const crosswalk: DecorFn = (c, d) => {
  const len = num(d, 'len', 3), w = num(d, 'w', 6), area = c.areaAt(d.s);
  const paint = paintOf(c, d), a = PAINT_FADE;
  if (num(d, 'scramble', area === 'neon' ? 1 : 0)) { dec(c, DECAL.scramble, d, Math.min(w, len * 2), Math.min(w, len * 2), paint, 0.75 * a, 0, 0, d.x, d.s + len / 2); }
  for (let x = d.x - w / 2 + 0.25; x < d.x + w / 2 - 0.2; x += 0.9) dec(c, DECAL.zebra, d, 0.5, len, paint, 0.85 * a, 0, 0, x + 0.25, d.s + len / 2);
  const m = roadMarks(c), cr = { s: d.s, claimed: false };
  m.cross.push(cr);
  const wa = m.waiting.shift();
  if (wa) { cr.claimed = true; paintArrow(c, m, wa, cr.s); }
};
const laneDash: DecorFn = (c, d) => {
  const len = num(d, 'len', 12), dash = num(d, 'dash', 3), gap = num(d, 'gap', 3), yellow = num(d, 'color', 0) !== 0, col = yellow ? 0xf2d064 : 0xede3d3;
  if (Math.abs(d.x) < 0.5) roadMarks(c).twoWay = yellow;
  if (dash <= 0) { dec(c, DECAL.solid, d, 0.12, len, col, 0.8 * PAINT_FADE, 0, 0, d.x, d.s + len / 2); return; }
  for (let s = d.s; s < d.s + len - 0.1; s += dash + gap) dec(c, DECAL.solid, d, 0.12, Math.min(dash, d.s + len - s), col, 0.8 * PAINT_FADE, 0, 0, d.x, s + Math.min(dash, d.s + len - s) / 2);
};
const parkingBay: DecorFn = (c, d) => {
  const len = num(d, 'len', 10), bays = Math.max(1, num(d, 'bays', Math.round(len / 5)));
  roadMarks(c).bay = Math.sign(d.x);
  for (let k = 0; k <= bays; k++) dec(c, DECAL.parkT, d, 1.0, 1.0, 0xede3d3, 0.75 * PAINT_FADE, 0, 0, d.x, d.s + (len * k) / bays);
};
const roadArrow: DecorFn = (c, d) => {
  const m = roadMarks(c), a = { kind: num(d, 'kind', 0), s: d.s, x: d.x, y: d.y };
  const cr = m.cross.find((k) => !k.claimed);
  if (cr) { cr.claimed = true; paintArrow(c, m, a, cr.s); } else m.waiting.push(a);
};
const crack: DecorFn = (c, d) => dec(c, rnd(d.s, d.x) < 0.5 ? DECAL.crack1 : DECAL.crack2, d, num(d, 'len', 1.5), num(d, 'len', 1.5) * 0.7, 0x2b2140, 0.4, rnd(d.s) * 6.28);
const patch: DecorFn = (c, d) => dec(c, DECAL.patch, d, num(d, 'w', 1.2), num(d, 'len', 1.6), c.areaAt(d.s) === 'neon' ? 0x403866 : 0x6a6478, 0.6);
/** Oil stains at half the old frequency (theme §4): the cars have not moved in years. */
const oilStain: DecorFn = (c, d) => { if (rnd(d.s, d.x, 5) < 0.5) dec(c, DECAL.oil, d, num(d, 'r', 0.6) * 2, num(d, 'r', 0.6) * 2, 0x1c1530, 0.45, rnd(d.s) * 6.28); };
/** Real scale (owner note 8): a kerb gully is ~0.4 m across × 0.6 m along the kerb, a manhole cover 0.6–0.75 m. */
export const STREET_FIXTURE = { drainW: 0.4, drainLen: 0.6, gutter: 0.25, manholeMin: 0.6, manholeMax: 0.75 } as const;
/** Kerb drains and the Neon after-rain vents sit in the gutter against the kerb, never mid-lane. */
const gutterX = (c: KitCtx, d: Decor) => { const side: -1 | 1 = d.x < 0 ? -1 : 1; return side * (kerbX(c, d.s, side, d.y) - STREET_FIXTURE.gutter); };
function kerbGrate(c: KitCtx, d: Decor, color: number): void {
  const x = gutterX(c, d);
  c.decal({ id: DECAL.drain, x, y: c.groundAt(d.s, x) + 0.006, s: d.s, w: STREET_FIXTURE.drainW, len: STREET_FIXTURE.drainLen, rot: 0, color, alpha: 0.8, kind: 0 });
}
const drain: DecorFn = (c, d) => kerbGrate(c, d, 0x2b2140);
const manhole: DecorFn = (c, d) => {
  const area = c.areaAt(d.s), dia = STREET_FIXTURE.manholeMin + (STREET_FIXTURE.manholeMax - STREET_FIXTURE.manholeMin) * rnd(d.s, d.x, 41);
  const id = area === 'downtown' ? DECAL.manGrid : area === 'docks' ? DECAL.manAnchor : area === 'neon' ? DECAL.manFlower : DECAL.manPlain;
  // The cell's cover disc is 30/32 of the cell: size the quad so the cover is `dia` across.
  dec(c, id, d, dia / 0.94, dia / 0.94, area === 'neon' ? 0x1a1430 : 0x3a3052, 0.75, 0);
};
const puddle: DecorFn = (c, d) => {
  const tint = num(d, 'tint', c.areaAt(d.s) === 'neon' ? 1 + (d.variant % 2) : 0);
  c.decal({ id: DECAL.puddle, x: d.x, y: d.y + 0.007, s: d.s, w: num(d, 'w', 0.9), len: num(d, 'len', 1.4), rot: d.rotY, color: tint === 1 ? 0xff3fa4 : tint === 2 ? 0x3ff2ff : 0xffffff, alpha: 0.85, kind: 1 });
};
/** RECLAIM: leaves mix fresh green and russet, never gold (gold is the coins'). */
const leafScatter: DecorFn = (c, d) => {
  const r = num(d, 'r', 1);
  dec(c, DECAL.leaves, d, r * 2, r * 2, RECLAIM.newLeaf, 0.8, rnd(d.s) * 6.28);
  dec(c, DECAL.leaves, d, r * 1.5, r * 1.5, RECLAIM.russetLeaf, 0.8, rnd(d.s, 1) * 6.28, 0, d.x + r * 0.25, d.s + r * 0.2);
};
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
  const area = c.areaAt(d.s), look = surfaceLook(surf, area);
  const xa = Math.sign(d.x) * Math.max(4.5, Math.abs(d.x)), xb = xa + Math.sign(d.x) * w;
  // RECLAIM: grass verges become meadow (SB #A9B865, Docks seagrass #7E9A5A, elsewhere #8FA85A).
  const meadow = area === 'suburbs' ? 0xa9b865 : area === 'docks' ? 0x7e9a5a : area === 'neon' ? look.color : 0x8fa85a;
  K.reset().to('o').lit(look.pat).col(surf === 'grass' ? meadow : look.color).box(Math.min(xa, xb), d.y - 0.1, d.s, Math.max(xa, xb), d.y + 0.004, d.s + len, FACE.top);
};
/** Neon after-rain mist rises from the kerb drains (theme §4 `steam_vent`): a drain-sized grate in the gutter. */
const steamVent: DecorFn = (c, d) => kerbGrate(c, d, 0x1a1430);

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
    // RECLAIM (theme §4): after-rain mist from the kerb drains at half the rate; one sprinkler in ten still ticks; the
    // lit maglev carriage passes half as often (every 40 s, was 20).
    case 'steam_vent': return { kind: 'steam', s: d.s, x: Math.sign(d.x || 1) * 2.75, y: d.y, len: 1, rate: num(d, 'rate', 2) * 0.5, p };
    case 'sprinkler': return hz(d, 84) < 0.1 ? { kind: 'sprinkler', s: d.s, x: d.x, y: d.y, len: num(d, 'r', 2), rate: num(d, 'rate', 0.3), p } : null;
    case 'maglev_train': return { kind: 'train', s: d.s, x: d.x, y: d.y, len: num(d, 'len', 40), rate: Math.max(40, num(d, 'period', 20) * 2), p };
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
