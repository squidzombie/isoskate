// world/render/kits/suburbs.ts: Suburbs kinds (DESIGN §10.3, §18.6 kit: picket fences, round hedges, mailboxes,
// driveway curbs, parked cars, bins, hoops, a bus shelter). Tall hazards stay ink-dark with one saturated accent
// (the fence's picket-white caps, the mailbox flag, the bin lids), so they read against the light sidewalks.
import type { Obstacle } from '../../../core/world';
import { COLORS, shade } from '../palette';
import { PAT } from '../textures/ground';
import { signRect } from '../textures/signs';
import { FACE, FX } from '../writer';
import { contact, rnd } from './common';
import { parkedCar } from './downtown';
import { accent, body, inChunk, rim, type KitDef, type KitFn } from './shared';

const HZ = FX.noFog | FX.matte;
const boxOf = (ob: Obstacle) => ob.solids[0]?.box;

/** Garden wall (long, landable): a brick wall with a light coping stone. */
const gardenWall: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  K.lit(PAT.brickWall).col(0xb5645a).box(b.x0 + 0.02, b.y0, b.s0, b.x1 - 0.02, b.y1 - 0.06, b.s1);
  K.lit(0).col(0xe3d9cc).chamfer(b.x0 - 0.02, b.y1 - 0.06, b.s0 - 0.02, b.x1 + 0.02, b.y1, b.s1 + 0.02, 0.015);
  if (inChunk(c, b.s0)) K.lit(0, 0, FX.noFog, 0.15).col(COLORS.edgeCream).box(b.x0, b.y1 - 0.03, b.s0 - 0.03, b.x1, b.y1 + 0.004, b.s0, FACE.front | FACE.top);
  contact(c, b.x0, b.x1, Math.max(b.s0, c.s0), Math.min(b.s1, c.s1), b.y0 + 0.01, 0.4, 0.2);
};

/** Hedge (long, tall): a dark clipped hedge bulk with a lumpy lighter top, x-ray above 1.6 m. */
const hedge: KitFn = (c, ob) => {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box;
    K.capY = b.y0 + 1.6;
    K.lit(PAT.grass, 0, HZ).col(0x1b2b22);
    K.chamfer(b.x0, b.y0, b.s0, b.x1, b.y1 - 0.1, b.s1, 0.12, 0x2a4232);
    for (let s = Math.max(b.s0, c.s0) + 0.35; s < Math.min(b.s1, c.s1) - 0.2; s += 0.7) {
      K.lit(PAT.grass, 0.2, HZ).col(0x2a4232).sphere((b.x0 + b.x1) / 2, b.y1 - 0.12, s, (b.x1 - b.x0) * 0.55, 5, 3, 0.45, 0.42);
    }
    K.capY = null;
    contact(c, b.x0, b.x1, Math.max(b.s0, c.s0), Math.min(b.s1, c.s1), b.y0 + 0.01, 0.55, 0.2);
  }
};

/** Picket fence (long, tall): dark-stained pickets with picket-white pointed caps and two rails. */
const picketFence: KitFn = (c, ob) => {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box, xm = (b.x0 + b.x1) / 2;
    K.capY = b.y0 + 1.6;
    const a = Math.max(b.s0, c.s0), z = Math.min(b.s1, c.s1);
    body(c, 0x1d1628);
    K.box(xm - 0.015, b.y0, a, xm + 0.015, b.y1 - 0.15, z, FACE.sides5);
    body(c, 0x2a2238);
    K.box(xm - 0.04, b.y0 + 0.25, a, xm + 0.04, b.y0 + 0.33, z, FACE.sides5);
    K.box(xm - 0.04, b.y1 - 0.4, a, xm + 0.04, b.y1 - 0.32, z, FACE.sides5);
    K.lit(0, 0, HZ).col(0xf7efe3).box(xm - 0.041, b.y1 - 0.39, a, xm + 0.041, b.y1 - 0.375, z, FACE.top);
    for (let s = Math.ceil(a / 0.16) * 0.16; s < z - 0.06; s += 0.16) {
      body(c, 0x2a2238); K.box(xm - 0.02, b.y0, s, xm + 0.02, b.y1 - 0.1, s + 0.09);
      body(c, c.hz.top); K.box(xm - 0.021, b.y1 - 0.1, s, xm + 0.021, b.y1, s + 0.09);
    }
    K.capY = null;
    contact(c, b.x0 - 0.05, b.x1 + 0.05, a, z, b.y0 + 0.01, 0.45, 0.15);
  }
};

/** Mailbox 0.4 × 0.4 × 1.2 (tall): a post with a rounded box and a raised red flag (the accent). */
const mailbox: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2, g = b.y0, top = b.y1;
  contact(c, b.x0, b.x1, b.s0, b.s1, g + 0.01, 0.6, 0.25);
  // A dark brick pillar (fills the silhouette) carrying the mailbox.
  K.lit(PAT.brickWall, 0, HZ).col(c.hz.inverted ? c.hz.body : 0x2a1820).box(b.x0, g, b.s0, b.x1, top - 0.38, b.s1);
  body(c, c.hz.top); K.box(b.x0 - 0.02, top - 0.4, b.s0 - 0.02, b.x1 + 0.02, top - 0.35, b.s1 + 0.02);
  body(c); K.box(b.x0 + 0.03, top - 0.35, b.s0, b.x1 - 0.03, top - 0.12, b.s1);
  body(c, c.hz.inverted ? c.hz.top : 0x2c2342); K.hcyl('s', x, top - 0.12, 0, b.s0, b.s1, (b.x1 - b.x0) / 2 - 0.03, 6, true);
  K.lit(0, 0, HZ).col(0xc4473d).box(b.x1 - 0.03, top - 0.3, s, b.x1, top - 0.02, s + 0.03);
  K.box(b.x1 - 0.03, top - 0.08, s - 0.1, b.x1, top - 0.02, s + 0.03);
  rim(c, b.x0, b.x1, top, b.s0);
};

/** Wheelie bins (a pair, tall): dark bins on wheels with coloured lids (the area accents). */
const wheelieBins: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const n = 2, w = (b.x1 - b.x0) / n;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.62, 0.25);
  for (let i = 0; i < n; i++) {
    const x0 = b.x0 + i * w + 0.03, x1 = x0 + w - 0.06;
    body(c);
    K.quad(x0, b.y0 + 0.06, b.s0 + 0.04, x1, b.y0 + 0.06, b.s0 + 0.04, x1 + 0.02, b.y1 - 0.08, b.s0, x0 - 0.02, b.y1 - 0.08, b.s0);
    K.box(x0, b.y0 + 0.06, b.s0 + 0.04, x1, b.y1 - 0.08, b.s1);
    body(c, c.hz.top); K.box(x0 - 0.03, b.y1 - 0.08, b.s0 - 0.03, x1 + 0.03, b.y1, b.s1, FACE.sides5);
    K.lit(0, 0, HZ).col(accent(c.area, i === 0 ? 2 : 0)).box(x0 - 0.031, b.y1 - 0.08, b.s0 - 0.031, x1 + 0.031, b.y1 - 0.05, b.s0 + 0.04, FACE.front | FACE.left | FACE.right);
    body(c, 0x120c1e); for (const xx of [x0 + 0.06, x1 - 0.06]) K.hcyl('x', 0, b.y0 + 0.07, b.s1 - 0.1, xx - 0.03, xx + 0.03, 0.07, 6, true);
    rim(c, x0, x1, b.y1, b.s0);
  }
};

/** Porch steps (side drop of 2 steps, 0.34 m) with a 0.55 rail: the steps are slabs; here the posts and the rail. */
const porchSteps: KitFn = (c, ob) => {
  const K = c.K;
  for (const e of ob.edges) {
    for (const [s, y] of [[e.a.s, e.a.y], [e.b.s, e.b.y]] as const) {
      if (!inChunk(c, s)) continue;
      body(c, 0xf7efe3); K.box(e.a.x - 0.03, y - 0.55, s - 0.03, e.a.x + 0.03, y, s + 0.03);
    }
    K.lit(0, 0, FX.noFog).col(0xf7efe3).beam(e.a.x, e.a.y, e.a.s, e.b.x, e.b.y, e.b.s, 0.03, -0.05, -0.012);
  }
};

/** Yard-sale table 2.0 × 0.8 × 1.15 (tall): a dark table loaded with boxes, a lamp and a hand-lettered sign. */
const yardTable: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const g = b.y0, top = g + 0.75;
  contact(c, b.x0, b.x1, b.s0, b.s1, g + 0.01, 0.6, 0.3);
  body(c);
  for (const [x, s] of [[b.x0 + 0.05, b.s0 + 0.05], [b.x1 - 0.1, b.s0 + 0.05], [b.x0 + 0.05, b.s1 - 0.1], [b.x1 - 0.1, b.s1 - 0.1]] as const) K.box(x, g, s, x + 0.05, top - 0.04, s + 0.05);
  body(c, c.hz.top); K.box(b.x0, top - 0.04, b.s0, b.x1, top, b.s1);
  for (let i = 0; i < 4; i++) {
    const x0 = b.x0 + 0.08 + i * ((b.x1 - b.x0 - 0.16) / 4);
    body(c, 0x2a2238);
    K.box(x0, top, b.s0 + 0.15 + (i % 2) * 0.3, x0 + 0.22, top + 0.15 + rnd(ob.id, i) * (b.y1 - top - 0.2), b.s0 + 0.5 + (i % 2) * 0.3);
  }
  K.lit(0, 0, HZ).col(accent(c.area, ob.id)).box(b.x0 + 0.2, top - 0.22, b.s0 - 0.01, b.x0 + 0.45, top - 0.14, b.s0, FACE.front);
};

/** Crate stack 0.6 × 0.4 × 0.30 (low, landable): wooden crates in a warm colour (landable tops are not ink). */
const crateStack: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.45, 0.15);
  K.lit(PAT.planks).col(0xc08a55).chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.02);
  K.lit(0).col(shade(0xc08a55, -0.4));
  K.box(b.x0 - 0.005, b.y0 + 0.02, b.s0 - 0.006, b.x1 + 0.005, b.y0 + 0.05, b.s0, FACE.front);
  K.box(b.x0 - 0.005, b.y1 - 0.05, b.s0 - 0.006, b.x1 + 0.005, b.y1 - 0.02, b.s0, FACE.front);
};

/** Speed hump 3.0 × full × 0.08 (bump): a rounded hump with painted chevron stripes. */
const speedHump: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob) ?? { x0: -4.5, x1: 4.5, s0: ob.s, s1: ob.s + ob.len, y0: 0, y1: ob.hgt };
  const sm = (b.s0 + b.s1) / 2, h = Math.max(0.04, b.y1 - b.y0);
  K.lit(PAT.asphalt).col(c.area === 'neon' ? 0x403866 : 0x837a94);
  K.wedge(b.x0, b.x1, b.s0, sm, b.y0 - 0.1, b.y0, b.y0 + h);
  K.wedge(b.x0, b.x1, sm, b.s1, b.y0 - 0.1, b.y0 + h, b.y0);
  K.lit(0).col(0xf4d58d);
  for (let x = b.x0 + 0.3; x < b.x1 - 0.4; x += 0.9) K.quad(x, b.y0 + h * 0.55, sm - 0.55, x + 0.35, b.y0 + h * 0.55, sm - 0.55, x + 0.35, b.y0 + h + 0.004, sm, x, b.y0 + h + 0.004, sm);
};

/** Hoop pole 0.2 × 0.2 × 3.0 (tall, x-ray above 1.6): a post, a backboard facing the camera and an orange rim. */
const hoopPole: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.6, 0.2);
  K.capY = b.y0 + 1.6;
  body(c); K.box(b.x0, b.y0, b.s0, b.x1, b.y1 - 0.2, b.s1);
  K.lit(0, 0, HZ).col(c.hz.accent).box(b.x0 - 0.01, b.y0 + 0.9, b.s0 - 0.01, b.x1 + 0.01, b.y0 + 1.0, b.s1 + 0.01);
  body(c, 0x2a2238); K.box(x - 0.6, b.y1 - 0.75, s - 0.25, x + 0.6, b.y1, s - 0.2);
  K.lit(0, 0, HZ).col(0x9a4a32).cyl(x, s - 0.45, b.y1 - 0.6, b.y1 - 0.585, 0.2, 8, false);
  K.capY = null;
};

/** Bus shelter 1.6 × 3.0 × 2.4 (tall): two posts, smoky glass sides, a roof and an ad panel facing the camera. */
const busShelter: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.62, 0.3);
  K.capY = b.y0 + 1.6;
  body(c);
  for (const [x, s] of [[b.x0, b.s0], [b.x1 - 0.06, b.s0], [b.x0, b.s1 - 0.06], [b.x1 - 0.06, b.s1 - 0.06]] as const) K.box(x, b.y0, s, x + 0.06, b.y1 - 0.1, s + 0.06);
  K.lit(0, 0, HZ).col(0x3c3a62);
  K.box(b.x0 + 0.02, b.y0 + 0.3, b.s0 + 0.06, b.x0 + 0.04, b.y1 - 0.2, b.s1 - 0.06, FACE.left | FACE.right);
  K.box(b.x1 - 0.04, b.y0 + 0.3, b.s0 + 0.06, b.x1 - 0.02, b.y1 - 0.2, b.s1 - 0.06, FACE.left | FACE.right);
  body(c, c.hz.top); K.chamfer(b.x0 - 0.1, b.y1 - 0.1, b.s0 - 0.15, b.x1 + 0.1, b.y1, b.s1 + 0.1, 0.03);
  // Ad panel on the camera face (billboard art from the sign atlas).
  const r = signRect(`bb:suburbs:${ob.id % 2}`);
  // Back wall (dark) filling the silhouette, with a modest ad panel facing the camera.
  body(c, 0x1d1628); K.box(b.x0 + 0.06, b.y0 + 0.05, b.s1 - 0.12, b.x1 - 0.06, b.y1 - 0.12, b.s1 - 0.08, FACE.front | FACE.top);
  K.lit(0, 0, HZ).col(0x6a6074);
  const px0 = b.x0 + (b.x1 - b.x0) * 0.3, px1 = b.x1 - (b.x1 - b.x0) * 0.3;
  K.quad(px0, b.y0 + 0.7, b.s0 - 0.01, px1, b.y0 + 0.7, b.s0 - 0.01, px1, b.y0 + 1.4, b.s0 - 0.01, px0, b.y0 + 1.4, b.s0 - 0.01,
    [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1]);
  K.capY = null;
};

export const SUBURBS_KITS: Readonly<Partial<Record<Obstacle['kind'], KitDef>>> = {
  garden_wall: { draw: gardenWall, long: true }, hedge: { draw: hedge, long: true }, picket_fence: { draw: picketFence, long: true },
  mailbox: { draw: mailbox }, wheelie_bins: { draw: wheelieBins }, parked_van: { draw: parkedCar }, porch_steps: { draw: porchSteps, long: true },
  yard_table: { draw: yardTable }, crate_stack: { draw: crateStack }, speed_hump: { draw: speedHump }, hoop_pole: { draw: hoopPole },
  bus_shelter: { draw: busShelter }, backout_car: { draw: parkedCar },
};
