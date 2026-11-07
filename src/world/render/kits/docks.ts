// world/render/kits/docks.ts: Industrial Docks kinds (DESIGN §10.3, §18.6 kit: stacked containers, loading docks,
// pallets, drums, cable spools, mooring bollards, the dock lip, embedded rail tracks). The apron is light concrete,
// so the container colours can stay deep (rust, container blue, patina) and still clear the gate.
import type { Obstacle } from '../../../core/world';
import { COLORS, mixHex, shade } from '../palette';
import { PAT } from '../textures/ground';
import { FACE, FX } from '../writer';
import { contact, lightGroundAt, rnd } from './common';
import { body, inChunk, rim, type KitDef, type KitFn } from './shared';

const HZ = FX.noFog | FX.matte;
const boxOf = (ob: Obstacle) => ob.solids[0]?.box;
const CONTAINER = [0x2a100c, 0x0b1622, 0x0f1d16, 0x200e16, 0x20180a] as const;

/** Shipping container 6.1 × 2.4 × 2.6 (tall, x-ray above 1.6): a ribbed box with corner posts and doors (locking
 *  bars) on the camera-facing end. */
export const container: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const col = c.hz.inverted ? c.hz.body : CONTAINER[(ob.id + ob.variant) % CONTAINER.length]!;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.7, 0.3);
  K.capY = b.y0 + 1.6;
  K.lit(PAT.ribsV, 0, HZ, c.hz.inverted ? c.hz.glow : 0).col(col).box(b.x0 + 0.04, b.y0, b.s0 + 0.04, b.x1 - 0.04, b.y1 - 0.04, b.s1 - 0.04);
  // The roof a clear value step above the ink sides, so the box reads as a volume (G1 review).
  K.lit(0, 0, HZ).col(c.hz.inverted ? shade(col, 0.12) : mixHex(col, c.hz.top, 0.65)).box(b.x0, b.y1 - 0.06, b.s0, b.x1, b.y1, b.s1, FACE.top | FACE.front | FACE.back | FACE.left | FACE.right);
  K.col(shade(col, -0.35));
  for (const [x, s] of [[b.x0, b.s0], [b.x1 - 0.1, b.s0], [b.x0, b.s1 - 0.1], [b.x1 - 0.1, b.s1 - 0.1]] as const) K.box(x, b.y0, s, x + 0.1, b.y1 - 0.06, s + 0.1);
  // Doors on the camera face: two leaves, four vertical locking bars, a white stencil code.
  const xm = (b.x0 + b.x1) / 2;
  K.col(shade(col, -0.18)).box(xm - 0.015, b.y0 + 0.1, b.s0 + 0.02, xm + 0.015, b.y1 - 0.12, b.s0 + 0.04, FACE.front);
  K.col(0x8a8fa0);
  for (const dx of [-0.8, -0.35, 0.35, 0.8]) K.box(xm + dx - 0.02, b.y0 + 0.1, b.s0 + 0.015, xm + dx + 0.02, b.y1 - 0.15, b.s0 + 0.04, FACE.front);
  K.col(0xf3e3c3).box(b.x0 + 0.25, b.y1 - 0.45, b.s0 + 0.012, b.x0 + 0.75, b.y1 - 0.38, b.s0 + 0.02, FACE.front);
  rim(c, b.x0, b.x1, b.y1, b.s0);
  K.capY = null;
};

/** Pallets (1.2 × 1.0): 0.15 (bump) / 0.30 / 0.45 (low, landable) / 1.20 (tall: a wrapped stack, dark). */
const pallet: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob) ?? { x0: ob.x - ob.wid / 2, x1: ob.x + ob.wid / 2, s0: ob.s, s1: ob.s + ob.len, y0: 0, y1: ob.hgt };
  const h = b.y1 - b.y0;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, h > 1 ? 0.65 : 0.45, 0.2);
  if (ob.kind === 'pallet_tall') {
    const wood = 0x3a2a24;
    body(c, wood); K.box(b.x0, b.y0, b.s0, b.x1, b.y0 + 0.14, b.s1);
    body(c, 0x262033); K.chamfer(b.x0 + 0.03, b.y0 + 0.14, b.s0 + 0.03, b.x1 - 0.03, b.y1, b.s1 - 0.03, 0.06, c.hz.top);
    K.lit(0, 0, HZ).col(c.hz.accent).box(b.x0 + 0.02, b.y1 - 0.5, b.s0 + 0.02, b.x1 - 0.02, b.y1 - 0.43, b.s1 - 0.02, FACE.front | FACE.left | FACE.right);
    rim(c, b.x0, b.x1, b.y1, b.s0);
    return;
  }
  const n = Math.max(1, Math.round(h / 0.15)), lh = h / n, wood = 0xb08458;
  for (let k = 0; k < n; k++) {
    const ya = b.y0 + k * lh, yb = ya + lh;
    K.lit(0).col(shade(wood, -0.4));
    for (const xx of [b.x0 + 0.02, (b.x0 + b.x1) / 2 - 0.06, b.x1 - 0.14]) K.box(xx, ya, b.s0 + 0.02, xx + 0.12, yb - 0.03, b.s1 - 0.02);
    K.lit(PAT.planks).col(shade(wood, (k % 2) * 0.08 - 0.04)).box(b.x0, yb - 0.03, b.s0, b.x1, yb, b.s1);
  }
};

/** I-beam (long, low, grindable): flanges and web in steel, rusty ends. */
const ibeam: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const xm = (b.x0 + b.x1) / 2, w = b.x1 - b.x0;
  // A narrow grindable hazard is mostly its cream edge on screen: on dark ground the steel is bright (the whole beam
  // reads light), on light ground dark (the beam reads as one dark bar).
  const lightGround = lightGroundAt(c, b.s0 + 0.5, xm);
  if (!lightGround) {
    K.lit(PAT.plate, 0, FX.noFog, 0.9).col(0xe8ecf4).box(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1);
    return;
  }
  K.lit(PAT.plate, 0, HZ).col(0x241e30);
  K.box(b.x0, b.y0, b.s0, b.x1, b.y0 + 0.04, b.s1);
  K.box(xm - w * 0.12, b.y0 + 0.04, b.s0, xm + w * 0.12, b.y1 - 0.04, b.s1);
  K.lit(0, 0, HZ).col(0x3a3348).box(b.x0, b.y1 - 0.04, b.s0, b.x1, b.y1, b.s1);
  for (const s of [b.s0, b.s1 - 0.05]) if (inChunk(c, s)) K.lit(0, 0, HZ).col(0x7a3a24).box(b.x0, b.y0, s, b.x1, b.y1 - 0.04, s + 0.05, FACE.front | FACE.back);
};

/** Loading dock (layer L1, 1.2 m): a concrete deck with a steel edge (grindable, drawn by the dispatcher), rubber
 *  bumpers and ribs on its side face; the incline and the deck are slabs. */
const loadingDock: KitFn = (c, ob) => {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box;
    K.lit(PAT.apron).col(0xb8aa98).box(b.x0, b.y0, b.s0, b.x1, b.y1 - 0.05, b.s1, FACE.front | FACE.back | FACE.left | FACE.right);
    K.lit(PAT.plate).col(0x9ba3b5).box(b.x0, b.y1 - 0.05, b.s0, b.x1, b.y1, b.s1, FACE.front | FACE.left | FACE.right);
    const open = Math.abs(b.x0) < Math.abs(b.x1) ? b.x0 : b.x1;
    for (let s = Math.ceil(Math.max(b.s0, c.s0) / 2.5) * 2.5; s < Math.min(b.s1, c.s1) - 0.3; s += 2.5) {
      K.lit(0, 0, FX.noFog).col(0x1d1726).box(open - 0.06, b.y1 - 0.5, s, open + 0.06, b.y1 - 0.15, s + 0.3);
    }
  }
  for (const sl of ob.slabs) {
    const y = Math.max(sl.y0, sl.y1);
    if (sl.kind === 'flat' && y > 0.5) K.lit(PAT.apron).col(0xc2b4a2).box(sl.x0, y - 0.005, Math.max(sl.s0, c.s0), sl.x1, y + 0.003, Math.min(sl.s1, c.s1), FACE.top);
  }
};

/** Drum cluster (tall): 2–5 drums on a skid; ribbed, two accent colours. */
const drumCluster: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.65, 0.25);
  body(c, 0x3a2a24); K.box(b.x0, b.y0, b.s0, b.x1, b.y0 + 0.1, b.s1);
  const r = 0.29, nx = Math.max(1, Math.floor((b.x1 - b.x0) / (2 * r + 0.02))), ns = Math.max(1, Math.floor((b.s1 - b.s0) / (2 * r + 0.02)));
  for (let i = 0; i < nx; i++) for (let j = 0; j < ns; j++) {
    const x = b.x0 + (i + 0.5) * ((b.x1 - b.x0) / nx), s = b.s0 + (j + 0.5) * ((b.s1 - b.s0) / ns);
    const col = c.hz.inverted ? c.hz.body : (i + j + ob.id) % 3 === 0 ? 0x2e1212 : (i + j) % 2 ? 0x121a2c : 0x170f24;
    body(c, col); K.cyl(x, s, b.y0 + 0.1, b.y1 - 0.02, r, 9, false);
    K.lit(0, 0, HZ, c.hz.glow).col(c.hz.accent).cyl(x, s, b.y0 + 0.5, b.y0 + 0.525, r + 0.01, 9, false);
    body(c, c.hz.top); K.cyl(x, s, b.y1 - 0.02, b.y1, r - 0.02, 9, true);
  }
  rim(c, b.x0, b.x1, b.y1, b.s0);
};

/** Cable spools: standing (tall, 1.2 Ø: flanges top and bottom, a wound core) and lying (low, crash round top). */
const spool: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.6, 0.2);
  const wood = 0x4a3428;
  if (ob.kind === 'spool_standing') {
    const R = Math.min(b.x1 - b.x0, b.s1 - b.s0) / 2;
    body(c, wood); K.cyl(x, s, b.y0, b.y0 + 0.08, R, 12, true);
    body(c, 0x1d1726); K.cyl(x, s, b.y0 + 0.08, b.y1 - 0.08, R * 0.7, 12, false);
    body(c, c.hz.top); K.cyl(x, s, b.y1 - 0.08, b.y1, R, 12, true);
    K.lit(0, 0, HZ).col(c.hz.accent).cyl(x, s, b.y0 + 0.5, b.y0 + 0.56, R * 0.71, 12, false);
  } else {
    const r = (b.y1 - b.y0) / 2;
    body(c, wood); K.hcyl('x', 0, b.y0 + r, s, b.x0, b.x0 + 0.08, r, 10, true); K.hcyl('x', 0, b.y0 + r, s, b.x1 - 0.08, b.x1, r, 10, true);
    body(c, 0x1d1726); K.hcyl('x', 0, b.y0 + r, s, b.x0 + 0.08, b.x1 - 0.08, r * 0.75, 10, false);
    K.lit(0, 0, HZ).col(c.hz.accent).hcyl('x', 0, b.y0 + r, s, b.x0 + 0.08, b.x0 + 0.11, r * 1.01, 10, false);
  }
  rim(c, b.x0, b.x1, b.y1, b.s0);
};
function chevronsLite(c: Parameters<KitFn>[0], x0: number, x1: number, y0: number, y1: number, s: number): void {
  const K = c.K;
  K.lit(0, 0, HZ).col(COLORS.chevron);
  for (let x = x0; x < x1 - 0.1; x += 0.3) K.quad(x, y0, s, x + 0.1, y0, s, x + 0.16, y1, s, x + 0.06, y1, s);
}

/** Mooring bollard 0.5 Ø × 1.15 (tall): a cast-iron bollard with a flared head and a chain post. */
const mooring: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2, r = (b.x1 - b.x0) / 2;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.6, 0.2);
  body(c); K.frustum(x, s, b.y0, b.y0 + 0.15, r, r * 0.8, 9, false);
  K.cyl(x, s, b.y0 + 0.15, b.y1 - 0.25, r * 0.72, 9, false);
  body(c); K.frustum(x, s, b.y1 - 0.25, b.y1 - 0.1, r * 0.72, r * 1.0, 9, false);
  body(c, c.hz.top); K.cyl(x, s, b.y1 - 0.1, b.y1, r * 1.0, 9, true);
  K.lit(0, 0, HZ, c.hz.glow).col(c.hz.accent).cyl(x, s, b.y0 + 0.55, b.y0 + 0.58, r * 0.74, 9, false);
};

/** Dock lip (long, 0.30, grindable inner edge): a concrete lip with a safety-yellow stripe on its top outer half. */
const dockLip: KitFn = (c, ob) => {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box;
    // The signature long grind: a pale concrete lip (bright against the harbour water beyond it) with a safety stripe
    // along its outer top and dark mooring cleats.
    K.lit(PAT.apron, 0, FX.noFog, 0.15).col(0xe6dccc).chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.03);
    K.lit(0, 0, FX.noFog, 0.1).col(0xf2d064).box((b.x0 + b.x1) / 2 + 0.05, b.y1 - 0.004, b.s0, b.x1 - 0.02, b.y1 + 0.004, b.s1, FACE.top);
    for (let s = Math.ceil(Math.max(b.s0, c.s0) / 6) * 6; s < Math.min(b.s1, c.s1); s += 6) {
      K.lit(0).col(0x1d1726).cyl(b.x1 - 0.08, s, b.y1, b.y1 + 0.08, 0.06, 6, true);
    }
  }
};

/** Rail track (flush, bump): two steel rails on sleepers in gravel. */
const railTrack: KitFn = (c, ob) => {
  const K = c.K;
  const a = Math.max(ob.s, c.s0), z = Math.min(ob.s + ob.len, c.s1);
  const x0 = ob.x - ob.wid / 2, x1 = ob.x + ob.wid / 2;
  K.lit(PAT.gravel).col(0x8c8278).box(x0, -0.05, a, x1, 0.004, z, FACE.top);
  K.lit(0).col(0x5a4a40);
  const across = ob.wid > ob.len;
  if (across) {
    for (let x = x0 + 0.2; x < x1; x += 0.6) K.box(x, 0, a + 0.05, x + 0.22, 0.008, z - 0.05, FACE.top);
    K.lit(0).col(0xb7bccb);
    for (const s of [a + 0.35, z - 0.35]) K.box(x0, 0.006, s - 0.035, x1, 0.016, s + 0.035, FACE.top | FACE.front);
  } else {
    for (let s = Math.ceil(a / 0.6) * 0.6; s < z; s += 0.6) K.box(x0 + 0.05, 0, s, x1 - 0.05, 0.008, s + 0.22, FACE.top);
    K.lit(0).col(0xb7bccb);
    for (const x of [ob.x - 0.72, ob.x + 0.72]) K.box(x - 0.035, 0.006, a, x + 0.035, 0.016, z, FACE.top | FACE.front);
  }
};

/** Forklift (tall, stretch mover): a body with a cab cage, the mast and forks, and an amber beacon. */
const forklift: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.7, 0.3);
  K.capY = b.y0 + 1.6;
  body(c, 0x3a3020); K.chamfer(b.x0, b.y0 + 0.2, b.s0 + 0.5, b.x1, b.y0 + 1.1, b.s1, 0.05, c.hz.top);
  body(c); for (const x of [b.x0 + 0.05, b.x1 - 0.1]) for (const s of [b.s0 + 0.55, b.s1 - 0.1]) K.box(x, b.y0 + 1.1, s, x + 0.05, b.y1 - 0.1, s + 0.05);
  body(c, c.hz.top); K.box(b.x0, b.y1 - 0.1, b.s0 + 0.5, b.x1, b.y1, b.s1);
  body(c); K.box(b.x0 + 0.15, b.y0, b.s0 + 0.35, b.x1 - 0.15, b.y1 - 0.2, b.s0 + 0.45);
  K.lit(0, 0, HZ).col(c.hz.accent).box(b.x0 + 0.2, b.y0 + 0.05, b.s0, b.x0 + 0.35, b.y0 + 0.1, b.s0 + 0.4); K.box(b.x1 - 0.35, b.y0 + 0.05, b.s0, b.x1 - 0.2, b.y0 + 0.1, b.s0 + 0.4);
  K.to('e').glowing(1.6, -1, FX.noFog, 2).col(0xf2b630).cyl((b.x0 + b.x1) / 2, (b.s0 + b.s1) / 2 + 0.6, b.y1, b.y1 + 0.12, 0.07, 6, true);
  K.to('o');
  K.capY = null;
  void rnd;
};

export const DOCKS_KITS: Readonly<Partial<Record<Obstacle['kind'], KitDef>>> = {
  container: { draw: container }, pallet_1: { draw: pallet }, pallet_2: { draw: pallet }, pallet_3: { draw: pallet },
  pallet_tall: { draw: pallet }, ibeam: { draw: ibeam, long: true }, loading_dock: { draw: loadingDock, long: true },
  drum_cluster: { draw: drumCluster }, spool_standing: { draw: spool }, spool_lying: { draw: spool },
  mooring_bollard: { draw: mooring }, dock_lip: { draw: dockLip, long: true }, rail_track: { draw: railTrack, long: true },
  forklift: { draw: forklift },
};
