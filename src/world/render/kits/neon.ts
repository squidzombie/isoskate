// world/render/kits/neon.ts: Neon City (Hoshimachi Ward, invented) kinds (DESIGN §10.3, §18.6): guard rails with a
// cyan body glow and the standard cream grind edge, vending banks with lit fronts facing the camera, viaduct pillars
// (x-ray above 1.6 m), cherry planters, food carts with paper lanterns, bike rows, the skywalk deck, A-frame signs,
// lantern stands, glowing neon curbs and the delivery robot. Hazards use the inverted body (#7A6FB0) with an emissive
// magenta / lantern-red rim (DESIGN §18.4). Only invented brands and the reviewed sign words appear.
import { NEON_SIGN_WORDS } from '../../../core/decor';
import type { Obstacle } from '../../../core/world';
import { mixHex, shade } from '../palette';
import { PAT } from '../textures/ground';
import { signRect } from '../textures/signs';
import { FACE, FX } from '../writer';
import { contact, rnd, type KitCtx } from './common';
import { planter } from './downtown';
import { accent, body, inChunk, rim, rimPost, type KitDef, type KitFn } from './shared';

const HZ = FX.noFog | FX.matte;
const boxOf = (ob: Obstacle) => ob.solids[0]?.box;
/** Lit parts of a Neon hazard drawn in an ink look (a gateway, DESIGN §18.4): dimmed, so the silhouette stays dark. */
const litK = (c: KitCtx, k: number) => (c.hz.inverted ? k : k * 0.4);

/** A lit sign quad from the sign atlas on the emissive target (front face toward −s). */
export function litSign(c: KitCtx, key: string, x0: number, x1: number, y0: number, y1: number, s: number, k = 1.6, anim = 0, flags = 0): void {
  const K = c.K, r = signRect(key), t = K.t;
  K.to('e').glowing(k, -1, FX.noFog | flags, anim).col(0xffffff);
  K.quad(x0, y0, s, x1, y0, s, x1, y1, s, x0, y1, s, [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1]);
  K.to(t);
}
/** An additive glow card (fx.w carries the flag bits: FX.near hides it with the decor it belongs to). */
export function glowCard(c: KitCtx, x: number, y: number, s: number, w: number, h: number, hex: number, k = 0.6, flags = 0): void {
  if (c.glowLeft <= 0) return;
  c.glowLeft--;
  c.K.col(hex).fxs(0, 0, k, flags).card(x, y, s, w, h);
}

/** Guard rail (long, low, grindable) at x = ±3.0: posts, a rail body with a cyan glow strip (the cream edge on top
 *  is drawn by the dispatcher); end posts are crash faces. */
const guardRail: KitFn = (c, ob) => {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box, xm = (b.x0 + b.x1) / 2, len = b.s1 - b.s0, n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= n; i++) {
      const s = b.s0 + 0.05 + (len - 0.1) * (i / n);
      if (!inChunk(c, s)) continue;
      body(c, 0x4a4278); K.box(xm - 0.04, b.y0, s - 0.04, xm + 0.04, b.y1 - 0.06, s + 0.04, FACE.sides5 & ~FACE.top);
    }
    K.lit(0, 0, FX.noFog).col(0x6a62a0).box(xm - 0.035, b.y1 - 0.12, b.s0, xm + 0.035, b.y1 - 0.02, b.s1, FACE.front | FACE.back | FACE.left | FACE.right);
    K.to('e').glowing(1.5, -1, FX.noFog).col(0x3ff2ff);
    const side = xm < 0 ? FACE.right : FACE.left;
    K.box(xm - 0.037, b.y1 - 0.1, b.s0 + 0.02, xm + 0.037, b.y1 - 0.065, b.s1 - 0.02, side | FACE.front);
    K.to('o');
  }
};

/** Vending bank 0.8 × (1.0 per machine) × 1.8 (tall): machines side by side (along x), lit fronts facing the camera,
 *  the inverted body with a magenta rim, x-ray above 1.6 m. */
export const vendingBank: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const n = Math.max(1, Math.round((b.x1 - b.x0) / 1.0)), w = (b.x1 - b.x0) / n;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.35, 0.15);
  K.capY = b.y0 + 1.6;
  for (let i = 0; i < n; i++) {
    const x0 = b.x0 + i * w + 0.02, x1 = x0 + w - 0.04;
    body(c, i % 2 ? c.hz.body : shade(c.hz.body, -0.08));
    K.chamfer(x0, b.y0, b.s0 + 0.02, x1, b.y1, b.s1, 0.04, c.hz.top);
    litSign(c, `vend:${(ob.id + i) % 4}`, x0 + 0.08, x1 - 0.08, b.y0 + 0.55, b.y1 - 0.12, b.s0 + 0.01, litK(c, 1.45));
    K.lit(0, 0, HZ).col(0x2b2140).box(x0 + 0.12, b.y0 + 0.12, b.s0 + 0.005, x1 - 0.12, b.y0 + 0.4, b.s0 + 0.02, FACE.front);
    rim(c, x0, x1, b.y1, b.s0 + 0.02);
  }
  if (c.hz.inverted) glowCard(c, (b.x0 + b.x1) / 2, b.y0 + 1.1, b.s0 - 0.05, b.x1 - b.x0 + 0.6, 1.8, 0xbff9ff, 0.35);
  K.capY = null;
};

/** Viaduct pillar 1.2 × 1.2 × 6.0 (tall, x-ray above 1.6): a concrete column with a lit strip and a cap that carries
 *  the maglev beams. */
const viaductPillar: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.35, 0.15);
  K.capY = b.y0 + 1.6;
  body(c); K.chamfer(b.x0, b.y0, b.s0, b.x1, b.y1 - 0.4, b.s1, 0.06, c.hz.top);
  body(c, c.hz.top); K.box(b.x0 - 0.2, b.y1 - 0.4, b.s0 - 0.2, b.x1 + 0.2, b.y1, b.s1 + 0.2);
  K.to('e').glowing(1.4, -1, FX.noFog).col(c.hz.rim).box((b.x0 + b.x1) / 2 - 0.05, b.y0 + 0.3, b.s0 - 0.01, (b.x0 + b.x1) / 2 + 0.05, b.y1 - 0.6, b.s0, FACE.front);
  K.to('o');
  rim(c, b.x0, b.x1, b.y0 + 1.2, b.s0);
  K.capY = null;
};

/** Cherry planter 2.4 × 1.2 × 0.5 with a trunk (tall): the planter rim, a dark trunk, a blossom crown of clustered
 *  icosahedra (#FFB7D0 / #F59BBE) above the x-ray cap. */
const cherryPlanter: KitFn = (c, ob) => {
  const K = c.K;
  const rimBox = ob.solids.find((so) => !so.tall)?.box, trunk = ob.solids.find((so) => so.tall)?.box;
  if (rimBox) planter(c, { ...ob, solids: [{ box: rimBox, top: 'landable', tall: false }] });
  if (!trunk) return;
  const x = (trunk.x0 + trunk.x1) / 2, s = (trunk.s0 + trunk.s1) / 2, r = (trunk.x1 - trunk.x0) / 2;
  K.capY = trunk.y0 + 1.6;
  // The trunk is the crash solid: the inverted body with its emissive rim (ink outside the Neon look).
  body(c, c.hz.inverted ? c.hz.top : c.hz.body); K.frustum(x, s, trunk.y0, trunk.y1, r, r * 0.7, 7, false);
  rimPost(c, x, s, r * 0.9, trunk.y0 + 0.15, trunk.y0 + 1.5, trunk.y0 + 1.2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    K.lit(0, 0.5, 0, 0.25).col(i % 2 ? 0xffb7d0 : 0xf59bbe);
    K.sphere(x + Math.cos(a) * 0.55, trunk.y1 + 0.2 + rnd(ob.id, i) * 0.4, s + Math.sin(a) * 0.45, 0.42, 5, 3);
  }
  K.lit(0, 0.5, 0, 0.25).col(0xffc9dc).sphere(x, trunk.y1 + 0.65, s, 0.5, 6, 4);
  K.capY = null;
};

/** Food cart 2.0 × 1.2 × 2.2 (tall): a yatai-style cart, its lit counter and noren facing the camera, a roof, and a
 *  paper lantern on top; x-ray above 1.6 m. */
export const foodCart: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.35, 0.15);
  K.capY = b.y0 + 1.6;
  const g = b.y0, counter = g + 0.95;
  body(c); K.box(b.x0 + 0.05, g + 0.15, b.s0 + 0.05, b.x1 - 0.05, counter, b.s1 - 0.05);
  body(c, 0x161029); for (const x of [b.x0 + 0.25, b.x1 - 0.25]) K.hcyl('x', 0, g + 0.2, (b.s0 + b.s1) / 2, x - 0.04, x + 0.04, 0.2, 8, true);
  K.to('e').glowing(litK(c, 1.3), -1, FX.noFog).col(0xffd39a).box(b.x0 + 0.12, counter - 0.18, b.s0 + 0.04, b.x1 - 0.12, counter - 0.04, b.s0 + 0.05, FACE.front);
  K.to('o');
  body(c, c.hz.top); K.chamfer(b.x0, counter, b.s0, b.x1, counter + 0.06, b.s1, 0.02);
  body(c); for (const x of [b.x0 + 0.05, b.x1 - 0.1]) K.box(x, counter, b.s0 + 0.1, x + 0.05, b.y1 - 0.25, b.s0 + 0.15);
  // Noren curtain: lantern-red panels across the front with a word or brand.
  const word = ob.variant % (NEON_SIGN_WORDS.length + 1);
  K.lit(0, 0, HZ, c.hz.inverted ? 0.35 : 0).col(c.hz.inverted ? 0xc4473d : mixHex(0xc4473d, c.hz.body, 0.6));
  for (let i = 0; i < 4; i++) {
    const x0 = b.x0 + 0.1 + i * ((b.x1 - b.x0 - 0.2) / 4);
    K.box(x0 + 0.01, b.y1 - 0.65, b.s0 + 0.08, x0 + (b.x1 - b.x0 - 0.2) / 4 - 0.01, b.y1 - 0.3, b.s0 + 0.1, FACE.front);
  }
  if (word > 0 && c.hz.inverted) litSign(c, `w:${word - 1}`, b.x0 + 0.2, b.x1 - 0.2, b.y1 - 0.62, b.y1 - 0.34, b.s0 + 0.07, 1.2);
  body(c, c.hz.top); K.box(b.x0 - 0.12, b.y1 - 0.3, b.s0 - 0.12, b.x1 + 0.12, b.y1 - 0.22, b.s1 + 0.12);
  // Paper lantern on top.
  K.to('e').glowing(litK(c, 1.7), -1, FX.noFog).col(0xff5a3c).sphere((b.x0 + b.x1) / 2, b.y1 - 0.02, (b.s0 + b.s1) / 2, 0.2, 7, 4, 1.3);
  K.to('o');
  if (c.hz.inverted) glowCard(c, (b.x0 + b.x1) / 2, counter, b.s0 - 0.1, b.x1 - b.x0 + 0.8, 1.2, 0xffb07a, 0.4);
  rim(c, b.x0, b.x1, counter + 0.06, b.s0);
  K.capY = null;
};

/** Bike row 4–8 × 0.6 × 1.15 (tall strip): bikes in a row (along x), dark frames with neon accents. */
const bikeRow: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.35, 0.15);
  const alongS = b.s1 - b.s0 > b.x1 - b.x0;
  const n = Math.max(2, Math.floor((alongS ? b.s1 - b.s0 : b.x1 - b.x0) / 0.5));
  body(c); K.box(b.x0, b.y0, b.s0, b.x1, b.y0 + 0.05, b.s1);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    K.lit(0, 0, HZ).col(accent(c.area, i + ob.id));
    if (alongS) {
      const s = b.s0 + u * (b.s1 - b.s0), xm = (b.x0 + b.x1) / 2;
      K.hcyl('s', xm - 0.25, b.y0 + 0.32, 0, s - 0.02, s + 0.02, 0.3, 8, true);
      K.hcyl('s', xm + 0.25, b.y0 + 0.32, 0, s - 0.02, s + 0.02, 0.3, 8, true);
      body(c, c.hz.body); K.bar(xm - 0.25, b.y0 + 0.4, s, xm + 0.25, b.y1 - 0.1, s, 0.03);
    } else {
      const x = b.x0 + u * (b.x1 - b.x0), sm = (b.s0 + b.s1) / 2;
      K.hcyl('x', 0, b.y0 + 0.32, sm - 0.25, x - 0.02, x + 0.02, 0.3, 8, true);
      K.hcyl('x', 0, b.y0 + 0.32, sm + 0.25, x - 0.02, x + 0.02, 0.3, 8, true);
      body(c, c.hz.body); K.bar(x, b.y0 + 0.4, sm - 0.25, x, b.y1 - 0.1, sm + 0.2, 0.03);
    }
  }
  rim(c, b.x0, b.x1, b.y0 + 0.05, b.s0);
};

/** Skywalk (layer L1 at +2.0): the deck slab (dispatcher), its side girders and columns, glowing guard rails on
 *  both deck edges (their posts here; the edges are grind lines). */
const skywalk: KitFn = (c, ob) => {
  const K = c.K;
  for (const sl of ob.slabs) {
    const y = Math.max(sl.y0, sl.y1);
    if (sl.kind !== 'flat' || y < 1) continue;
    const a = Math.max(sl.s0, c.s0), z = Math.min(sl.s1, c.s1);
    if (z <= a) continue;
    body(c, 0x4a4278); K.box(sl.x0, y - 0.35, a, sl.x1, y - 0.02, z, FACE.front | FACE.back | FACE.left | FACE.right);
    K.to('e').glowing(1.4, -1, FX.noFog).col(0xff3fa4);
    K.box(sl.x0 - 0.01, y - 0.22, a, sl.x0, y - 0.17, z, FACE.left); K.box(sl.x1, y - 0.22, a, sl.x1 + 0.01, y - 0.17, z, FACE.right);
    K.to('o');
    for (let s = Math.ceil(a / 6) * 6; s < z; s += 6) {
      body(c, 0x3a3366);
      for (const x of [sl.x0 + 0.1, sl.x1 - 0.4]) K.box(x, 0, s, x + 0.3, y - 0.35, s + 0.3);
    }
  }
  for (const e of ob.edges) {
    const len = e.b.s - e.a.s, n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= n; i++) {
      const u = i / n, s = e.a.s + len * u;
      if (!inChunk(c, s)) continue;
      body(c, 0x4a4278); K.box(e.a.x - 0.03, e.a.y - 0.5 + (e.b.y - e.a.y) * u, s - 0.03, e.a.x + 0.03, e.a.y + (e.b.y - e.a.y) * u - 0.04, s + 0.03);
    }
  }
};

/** A-frame sign 0.5 × 0.4 × 0.55 (knock): two boards with a lit word panel. */
const aFrame: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const x0 = b.x0, x1 = b.x1, g = b.y0, top = b.y1, sm = (b.s0 + b.s1) / 2;
  K.lit(0).col(0xff8a5b);
  K.quad(x0, g, b.s0, x1, g, b.s0, x1, top, sm - 0.02, x0, top, sm - 0.02);
  K.quad(x1, g, b.s1, x0, g, b.s1, x0, top, sm + 0.02, x1, top, sm + 0.02);
  if (c.area === 'neon') litSign(c, `w:${ob.id % NEON_SIGN_WORDS.length}`, x0 + 0.05, x1 - 0.05, g + 0.12, top - 0.1, b.s0 + 0.12 * ((top - g - 0.1) / (top - g)) - 0.01, 1.1);
  else K.lit(0).col(0xfff4e3).quad(x0 + 0.06, g + 0.12, b.s0 + 0.03, x1 - 0.06, g + 0.12, b.s0 + 0.03, x1 - 0.06, top - 0.12, sm - 0.06, x0 + 0.06, top - 0.12, sm - 0.06);
};

/** Lantern stand 0.4 × 0.4 × 1.6 (tall): a dark post with a lit paper lantern (red or paper). */
const lanternStand: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.35, 0.15);
  K.capY = b.y0 + 1.6;
  // In the Neon look the whole stand reads light on the wet road (the lighter inverted value, a thicker post, caps
  // in the emissive rim colour); in an ink look it stays dark.
  const inv = c.hz.inverted, post = inv ? c.hz.top : c.hz.body;
  body(c, post); K.box(b.x0 + 0.05, b.y0, b.s0 + 0.05, b.x1 - 0.05, b.y0 + 0.06, b.s1 - 0.05);
  K.cyl(x, s, b.y0 + 0.06, b.y1 - 0.5, inv ? 0.06 : 0.04, 6, false);
  const red = ob.id % 2 === 0;
  K.to('e').glowing(litK(c, 1.7), -1, FX.noFog).col(red ? 0xff5a3c : 0xffd39a);
  K.cyl(x, s, b.y1 - 0.5, b.y1 - 0.06, 0.17, 8, false);
  K.to('o');
  if (inv) K.to('e').glowing(1.4, -1, FX.noFog).col(c.hz.rim); else body(c, 0x161029);
  K.cyl(x, s, b.y1 - 0.56, b.y1 - 0.5, 0.19, 8, true); K.cyl(x, s, b.y1 - 0.06, b.y1, 0.19, 8, true);
  K.to('o');
  // A small glow round the lantern only (it never spills over the ground ring the gate reads around the stand).
  if (c.hz.inverted) glowCard(c, x, b.y1 - 0.28, s - 0.2, 0.55, 0.6, red ? 0xff5a3c : 0xffd39a, 0.35);
  rimPost(c, x, s, 0.05, b.y0 + 0.1, b.y1 - 0.6, b.y0 + 0.9);
  K.capY = null;
};

/** Neon curb (bump, curb-class edge): the curb stone with a glowing cyan strip along its road face. */
const neonCurb: KitFn = (c, ob) => {
  const K = c.K;
  for (const sl of ob.slabs) {
    const roadSide = Math.abs(sl.x0) < Math.abs(sl.x1) ? sl.x0 : sl.x1;
    const a = Math.max(sl.s0, c.s0), z = Math.min(sl.s1, c.s1);
    if (z <= a) continue;
    K.lit(0).col(0x9a91b8).box(Math.min(roadSide, roadSide + Math.sign(roadSide) * 0.3), sl.y0 - 0.04, a, Math.max(roadSide, roadSide + Math.sign(roadSide) * 0.3), sl.y0 + 0.008, z, FACE.top);
    K.to('e').glowing(1.5, -1, FX.noFog).col(0x3ff2ff);
    K.box(roadSide - 0.012, sl.y0 - 0.1, a, roadSide + 0.012, sl.y0 - 0.04, z, roadSide < 0 ? FACE.right : FACE.left);
    K.to('o');
  }
};

/** Delivery robot 0.7 × 0.6 × 1.15 (tall, stretch mover): a six-wheeled box with a screen face and a flag mast. */
const robot: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.35, 0.15);
  body(c); K.chamfer(b.x0, b.y0 + 0.12, b.s0, b.x1, b.y0 + 0.6, b.s1, 0.05, c.hz.top);
  body(c, 0x161029); for (const s of [b.s0 + 0.12, (b.s0 + b.s1) / 2, b.s1 - 0.12]) for (const x of [b.x0, b.x1 - 0.06]) K.hcyl('x', 0, b.y0 + 0.1, s, x, x + 0.06, 0.1, 6, true);
  K.to('e').glowing(1.5, -1, FX.noFog).col(0x3ff2ff).box(b.x0 + 0.1, b.y0 + 0.3, b.s0 - 0.005, b.x1 - 0.1, b.y0 + 0.5, b.s0, FACE.front);
  K.to('o');
  body(c); K.box(b.x1 - 0.06, b.y0 + 0.6, (b.s0 + b.s1) / 2, b.x1 - 0.04, b.y1, (b.s0 + b.s1) / 2 + 0.02);
  K.lit(0, 0, HZ).col(0xff8a5b).box(b.x1 - 0.06, b.y1 - 0.18, (b.s0 + b.s1) / 2 + 0.02, b.x1 - 0.04, b.y1, (b.s0 + b.s1) / 2 + 0.25);
  rim(c, b.x0, b.x1, b.y0 + 0.6, b.s0);
  void PAT;
};

export const NEON_KITS: Readonly<Partial<Record<Obstacle['kind'], KitDef>>> = {
  guard_rail: { draw: guardRail, long: true }, vending_bank: { draw: vendingBank }, viaduct_pillar: { draw: viaductPillar },
  cherry_planter: { draw: cherryPlanter }, food_cart: { draw: foodCart }, bike_row: { draw: bikeRow },
  skywalk: { draw: skywalk, long: true }, a_frame_sign: { draw: aFrame }, lantern_stand: { draw: lanternStand },
  neon_curb: { draw: neonCurb, long: true }, delivery_robot: { draw: robot },
};
