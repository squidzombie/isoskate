// world/render/kits/docks.ts: Industrial Docks kinds (DESIGN §10.3, §18.6; RECLAIM skins): rusty containers with ink
// vines down the doors (or a box truck / staff shuttle from the vehicle builder), sun-greyed pallets with grass between
// the slats, rusty beams with a polished top, mossy loading docks, rusty drums with moss lids and morning-glory vines,
// vine-wrapped spools, mooring bollards with a frayed rope and a resting grey-backed gull, the waxed dock lip, dull
// rails and the clean autonomous forklift. The apron is light concrete, so the container colours can stay deep.
// Dressing goes through DRESSER.
import { CAMERA } from '../../../core/tuning';
import { Dress, isVehicle } from '../../../core/skins';
import type { Obstacle } from '../../../core/world';
import { RECLAIM, fadePaint, mixHex, shade } from '../palette';
import { PAT } from '../textures/ground';
import { FACE, FX } from '../writer';
import { vehicleKit } from './car';
import { contact, rnd } from './common';
import { DRESSER, mossOn } from './dress';
import { body, dress, dressBrush, helperBand, inChunk, leaf, leafPatch, mossPatch, rim, rustPatch, sapling, type KitDef, type KitFn } from './shared';

const HZ = FX.noFog | FX.matte;
const boxOf = (ob: Obstacle) => ob.solids[0]?.box;
const CONTAINER = [0x2a100c, 0x0b1622, 0x0f1d16, 0x200e16, 0x20180a] as const;
const SUN_GREY = 0x9a8f80;

/** Shipping container 6.1 × 2.4 × 2.6 (tall, x-ray above CAMERA.xrayCapY): a ribbed box with corner posts and doors
 *  (locking bars) on the camera end, rust on the doors and ink vines hanging down them. 25% of them are a box truck in
 *  faded Brindle Freight livery and 15% a staff shuttle bus in Saltwick Shipping livery (the vehicle builder). */
export const container: KitFn = (c, ob) => {
  if (isVehicle(DRESSER.skin.body)) { vehicleKit(c, ob); return; }
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const col = c.hz.inverted ? c.hz.body : CONTAINER[(ob.id + ob.variant) % CONTAINER.length]!;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.7, 0.3);
  K.capY = b.y0 + CAMERA.xrayCapY;
  K.lit(PAT.ribsV, 0, HZ, c.hz.inverted ? c.hz.glow : 0).col(col).box(b.x0 + 0.04, b.y0, b.s0 + 0.04, b.x1 - 0.04, b.y1 - 0.04, b.s1 - 0.04);
  // The roof a clear value step above the ink sides, so the box reads as a volume (G1 review).
  K.lit(0, 0, HZ).col(c.hz.inverted ? shade(col, 0.12) : mixHex(col, c.hz.top, 0.65)).box(b.x0, b.y1 - 0.06, b.s0, b.x1, b.y1, b.s1, FACE.top | FACE.front | FACE.back | FACE.left | FACE.right);
  K.col(shade(col, -0.35));
  for (const [x, s] of [[b.x0, b.s0], [b.x1 - 0.1, b.s0], [b.x0, b.s1 - 0.1], [b.x1 - 0.1, b.s1 - 0.1]] as const) K.box(x, b.y0, s, x + 0.1, b.y1 - 0.06, s + 0.1);
  // Doors on the camera face: two leaves, four vertical locking bars, a faded stencil code.
  const xm = (b.x0 + b.x1) / 2;
  K.col(shade(col, -0.18)).box(xm - 0.015, b.y0 + 0.1, b.s0 + 0.02, xm + 0.015, b.y1 - 0.12, b.s0 + 0.04, FACE.front);
  K.col(0x6a6470);
  for (const dx of [-0.8, -0.35, 0.35, 0.8]) K.box(xm + dx - 0.02, b.y0 + 0.1, b.s0 + 0.015, xm + dx + 0.02, b.y1 - 0.15, b.s0 + 0.04, FACE.front);
  K.col(0x7a7064).box(b.x0 + 0.25, b.y1 - 0.45, b.s0 + 0.012, b.x0 + 0.75, b.y1 - 0.38, b.s0 + 0.02, FACE.front);
  rim(c, b.x0, b.x1, b.y1, b.s0);
  // Rust on the door leaves; ink vines hanging down the doors from the roof edge.
  rustPatch(c, col, xm - 0.75, b.y0 + 0.2, b.s0 + 0.008, xm - 0.4, b.y0 + 0.75, b.s0 + 0.014, FACE.front);
  if (DRESSER.has(Dress.Ivy)) for (let i = 0; i < 4; i++) {
    const x = b.x0 + 0.3 + (b.x1 - b.x0 - 0.6) * rnd(ob.id, i, 2), len = 0.5 + 1.1 * rnd(ob.id, i, 3);
    dress(c, 'foliage', leaf(c, i % 2 === 1), x - 0.06, b.y1 - 0.06 - len, b.s0 - 0.01, x + 0.06, b.y1 - 0.04, b.s0 + 0.012, FACE.front | FACE.left | FACE.right);
  }
  K.capY = null;
};

/** Pallets (1.2 × 1.0): 0.15 (bump) / 0.30 / 0.45 (low, landable): sun-greyed, grass between the slats below the top
 *  surface; 1.20 (tall): a stack in faded wrap with an ink fern at its base (the isolated filler may grow its
 *  sapling). */
const pallet: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob) ?? { x0: ob.x - ob.wid / 2, x1: ob.x + ob.wid / 2, s0: ob.s, s1: ob.s + ob.len, y0: 0, y1: ob.hgt };
  const h = b.y1 - b.y0;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, h > 1 ? 0.65 : 0.45, 0.2);
  if (ob.kind === 'pallet_tall') {
    body(c, 0x3a2a24); K.box(b.x0, b.y0, b.s0, b.x1, b.y0 + 0.14, b.s1);
    body(c, 0x262033); K.chamfer(b.x0 + 0.03, b.y0 + 0.14, b.s0 + 0.03, b.x1 - 0.03, b.y1, b.s1 - 0.03, 0.06, c.hz.top);
    K.lit(0, 0, HZ).col(c.hz.inverted ? c.hz.accent : fadePaint(c.hz.accent2)).box(b.x0 + 0.02, b.y1 - 0.5, b.s0 + 0.02, b.x1 - 0.02, b.y1 - 0.45, b.s1 - 0.02, FACE.front | FACE.left | FACE.right);
    rim(c, b.x0, b.x1, b.y1, b.s0);
    if (DRESSER.has(Dress.Ivy)) {
      dress(c, 'foliage', leaf(c), b.x0 - 0.03, b.y0, b.s0 - 0.04, b.x0 + 0.28, b.y0 + 0.24, b.s0 + 0.12);
    }
    sapling(c, (b.x0 + b.x1) / 2, b.s0, b.s1, 0.3, b.y1);
    return;
  }
  const n = Math.max(1, Math.round(h / 0.15)), lh = h / n;
  for (let k = 0; k < n; k++) {
    const ya = b.y0 + k * lh, yb = ya + lh;
    K.lit(0).col(shade(SUN_GREY, -0.4));
    for (const xx of [b.x0 + 0.02, (b.x0 + b.x1) / 2 - 0.06, b.x1 - 0.14]) K.box(xx, ya, b.s0 + 0.02, xx + 0.12, yb - 0.03, b.s1 - 0.02);
    K.lit(PAT.planks).col(shade(SUN_GREY, (k % 2) * 0.08 - 0.04)).box(b.x0, yb - 0.03, b.s0, b.x1, yb, b.s1);
  }
  // Grass in the gap between the bottom blocks (below the top surface).
  if (DRESSER.has(Dress.Ivy)) {
    K.lit(0).col(RECLAIM.seagrass);
    DRESSER.box(K, 'foliage', b.x0 + 0.16, b.y0, b.s0 - 0.02, b.x0 + 0.42, b.y0 + Math.min(0.1, lh - 0.04), b.s0 + 0.2, FACE.top | FACE.front);
  }
};

/** I-beam (long, low, grindable): rusty flanges and web, darker rusty ends; the polished top is the dispatcher's waxed
 *  grind edge (the only bright line on it). */
const ibeam: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const xm = (b.x0 + b.x1) / 2, w = b.x1 - b.x0, rust = c.hz.inverted ? 0x6a62a0 : 0x6e3c28;
  K.lit(PAT.plate, 0, HZ).col(rust);
  K.box(b.x0, b.y0, b.s0, b.x1, b.y0 + 0.04, b.s1);
  K.box(xm - w * 0.12, b.y0 + 0.04, b.s0, xm + w * 0.12, b.y1 - 0.04, b.s1);
  K.lit(0, 0, HZ).col(shade(rust, 0.08)).box(b.x0, b.y1 - 0.04, b.s0, b.x1, b.y1, b.s1);
  for (const s of [b.s0, b.s1 - 0.05]) if (inChunk(c, s)) K.lit(0, 0, HZ).col(shade(rust, -0.35)).box(b.x0, b.y0, s, b.x1, b.y1 - 0.04, s + 0.05, FACE.front | FACE.back);
};

/** Loading dock (layer L1, 1.2 m): a concrete deck with moss on its face, rubber bumpers and ribs on its side, a steel
 *  edge (the waxed grind edge, dispatcher); the incline and the deck are slabs. */
const loadingDock: KitFn = (c, ob) => {
  const K = c.K, face = 0xb8aa98;
  for (const so of ob.solids) {
    const b = so.box;
    K.lit(PAT.apron).col(face).box(b.x0, b.y0, b.s0, b.x1, b.y1 - 0.05, b.s1, FACE.front | FACE.back | FACE.left | FACE.right);
    K.lit(PAT.plate).col(0x8f97a8).box(b.x0, b.y1 - 0.05, b.s0, b.x1, b.y1, b.s1, FACE.front | FACE.left | FACE.right);
    const open = Math.abs(b.x0) < Math.abs(b.x1) ? b.x0 : b.x1, dir = open === b.x0 ? -1 : 1;
    for (let s = Math.ceil(Math.max(b.s0, c.s0) / 2.5) * 2.5; s < Math.min(b.s1, c.s1) - 0.3; s += 2.5) {
      K.lit(0, 0, FX.noFog).col(0x1d1726).box(open - 0.06, b.y1 - 0.5, s, open + 0.06, b.y1 - 0.15, s + 0.3);
      // Moss low on the face between the bumpers.
      mossPatch(c, face, dir < 0 ? open - 0.004 : open, b.y0, s + 0.6, dir < 0 ? open : open + 0.004, b.y0 + (b.y1 - b.y0) * 0.4, s + 1.7, dir < 0 ? FACE.left : FACE.right);
    }
  }
  for (const sl of ob.slabs) {
    const y = Math.max(sl.y0, sl.y1);
    if (sl.kind === 'flat' && y > 0.5) K.lit(PAT.apron).col(0xc2b4a2).box(sl.x0, y - 0.005, Math.max(sl.s0, c.s0), sl.x1, y + 0.003, Math.min(sl.s1, c.s1), FACE.top);
  }
};

/** Drum cluster (tall): rusty drums on a skid, moss-coloured lids (luminance-matched), a rust band, ink morning-glory
 *  vines on the sides (no flowers); the isolated filler may grow its sapling. */
const drumCluster: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.65, 0.25);
  body(c, 0x3a2a24); K.box(b.x0, b.y0, b.s0, b.x1, b.y0 + 0.1, b.s1);
  const r = 0.29, nx = Math.max(1, Math.floor((b.x1 - b.x0) / (2 * r + 0.02))), ns = Math.max(1, Math.floor((b.s1 - b.s0) / (2 * r + 0.02)));
  const lid = DRESSER.has(Dress.Moss) ? mossOn(c.hz.top) : c.hz.top;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ns; j++) {
    const x = b.x0 + (i + 0.5) * ((b.x1 - b.x0) / nx), s = b.s0 + (j + 0.5) * ((b.s1 - b.s0) / ns);
    const col = c.hz.inverted ? c.hz.body : (i + j + ob.id) % 3 === 0 ? 0x2e1212 : (i + j) % 2 ? 0x121a2c : 0x170f24;
    body(c, col); K.cyl(x, s, b.y0 + 0.1, b.y1 - 0.02, r, 9, false);
    K.lit(0, 0, HZ, c.hz.glow).col(c.hz.inverted ? c.hz.accent : c.hz.accent2).cyl(x, s, b.y0 + 0.5, b.y0 + 0.525, r + 0.01, 9, false);
    dressBrush(c, lid); K.cyl(x, s, b.y1 - 0.02, b.y1, r - 0.02, 9, true);
  }
  rim(c, b.x0, b.x1, b.y1, b.s0);
  if (DRESSER.has(Dress.Ivy)) {
    leafPatch(c, ob, b.x0 + 0.1, b.x0 + (b.x1 - b.x0) * 0.45, b.s0 - 0.02, b.s0 + 0.03, b.y0, b.y1 - 0.45, 3, ob.id * 29 + 4, FACE.front | FACE.top | FACE.left | FACE.right);
  }
  sapling(c, b.x0 + (b.x1 - b.x0) / (2 * nx), b.s0, b.s1, Math.min(r, 0.3), b.y1);
};

/** Cable spools: standing (tall, 1.2 Ø: flanges top and bottom, a wound core wrapped in ink vines) and lying (low,
 *  crash round top, grass at its base). */
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
    K.lit(0, 0, HZ).col(c.hz.inverted ? c.hz.accent : c.hz.accent2).cyl(x, s, b.y0 + 0.5, b.y0 + 0.56, R * 0.71, 12, false);
    if (DRESSER.has(Dress.Ivy)) for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.05 + 0.22 * i), px = x + Math.cos(a) * R * 0.72, ps = s + Math.sin(a) * R * 0.72, y = b.y0 + 0.12 + (b.y1 - b.y0 - 0.32) * ((i * 0.37) % 1);
      dress(c, 'foliage', leaf(c, i % 2 === 1), px - 0.07, y, ps - 0.07, px + 0.07, y + 0.16, ps + 0.07);
    }
  } else {
    const r = (b.y1 - b.y0) / 2;
    body(c, wood); K.hcyl('x', 0, b.y0 + r, s, b.x0, b.x0 + 0.08, r, 10, true); K.hcyl('x', 0, b.y0 + r, s, b.x1 - 0.08, b.x1, r, 10, true);
    body(c, 0x1d1726); K.hcyl('x', 0, b.y0 + r, s, b.x0 + 0.08, b.x1 - 0.08, r * 0.75, 10, false);
    K.lit(0, 0, HZ).col(c.hz.inverted ? c.hz.accent : c.hz.accent2).hcyl('x', 0, b.y0 + r, s, b.x0 + 0.08, b.x0 + 0.11, r * 1.01, 10, false);
    if (DRESSER.has(Dress.Ivy)) {
      K.lit(0).col(RECLAIM.seagrass);
      DRESSER.box(K, 'foliage', b.x0 + 0.1, b.y0, b.s0 - 0.03, b.x0 + 0.45, b.y0 + 0.08, b.s0 + 0.12, FACE.top | FACE.front);
    }
  }
  rim(c, b.x0, b.x1, b.y1, b.s0);
};

/** Mooring bollard 0.5 Ø × 1.15 (tall): a cast-iron bollard with a flared head, a frayed rope round its neck and a
 *  resting grey-backed gull on top (≤ +0.22 m; its lightest tone #A6A3A8). */
const mooring: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2, r = (b.x1 - b.x0) / 2;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.6, 0.2);
  body(c); K.frustum(x, s, b.y0, b.y0 + 0.15, r, r * 0.8, 9, false);
  K.cyl(x, s, b.y0 + 0.15, b.y1 - 0.25, r * 0.72, 9, false);
  body(c); K.frustum(x, s, b.y1 - 0.25, b.y1 - 0.1, r * 0.72, r * 1.0, 9, false);
  body(c, c.hz.top); K.cyl(x, s, b.y1 - 0.1, b.y1, r * 1.0, 9, true);
  K.lit(0, 0, HZ, c.hz.glow).col(c.hz.inverted ? c.hz.accent : c.hz.accent2).cyl(x, s, b.y0 + 0.55, b.y0 + 0.58, r * 0.74, 9, false);
  // Frayed rope: a loop round the neck and its loose end trailing to the ground on the camera side.
  body(c, 0x5a4a38); K.cyl(x, s, b.y1 - 0.34, b.y1 - 0.29, r * 0.78, 9, false);
  K.bar(x - r * 0.4, b.y1 - 0.32, s - r * 0.7, x - r * 0.9, b.y0 + 0.03, s - r - 0.02, 0.04);
  if (DRESSER.has(Dress.Bird) && !c.hz.inverted) {
    // The gull, resting, facing the street: body, folded darker wings, head, tail.
    const y = b.y1, gs = s + 0.02;
    K.lit(0, 0, HZ).col(RECLAIM.animalMax);
    DRESSER.box(K, 'animal', x - 0.06, y, gs - 0.13, x + 0.06, y + 0.11, gs + 0.1);
    DRESSER.box(K, 'animal', x - 0.04, y + 0.09, gs - 0.17, x + 0.04, y + 0.17, gs - 0.09);
    K.col(0x6e6a70);
    DRESSER.box(K, 'animal', x - 0.065, y + 0.05, gs - 0.06, x + 0.065, y + 0.115, gs + 0.14, FACE.top | FACE.left | FACE.right | FACE.back);
    K.col(0x3a3440);
    DRESSER.box(K, 'animal', x - 0.03, y + 0.06, gs + 0.14, x + 0.03, y + 0.09, gs + 0.2, FACE.top | FACE.left | FACE.right);
  }
};

/** Dock lip (long, 0.30, grindable inner edge): a mid concrete lip (never near-white: its waxed coping is the bright
 *  line) with a faded safety stripe on its outer top and dark mooring cleats. */
const dockLip: KitFn = (c, ob) => {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box;
    K.lit(PAT.apron, 0, FX.noFog, 0.1).col(0xc4b8a6).chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.03);
    K.lit(0, 0, FX.noFog).col(fadePaint(0xd8b85a)).box((b.x0 + b.x1) / 2 + 0.05, b.y1 - 0.004, b.s0, b.x1 - 0.02, b.y1 + 0.004, b.s1, FACE.top);
    for (let s = Math.ceil(Math.max(b.s0, c.s0) / 6) * 6; s < Math.min(b.s1, c.s1); s += 6) {
      K.lit(0).col(0x1d1726).cyl(b.x1 - 0.08, s, b.y1, b.y1 + 0.08, 0.06, 6, true);
    }
  }
};

/** Rail track (flush, bump): two rust-brown rails with a dull steel top (no sheen, never the signature) on sleepers in
 *  gravel. */
const railTrack: KitFn = (c, ob) => {
  const K = c.K;
  const a = Math.max(ob.s, c.s0), z = Math.min(ob.s + ob.len, c.s1);
  const x0 = ob.x - ob.wid / 2, x1 = ob.x + ob.wid / 2, rust = 0x5a3424, steel = 0x7d7a80;
  K.lit(PAT.gravel).col(0x8c8278).box(x0, -0.05, a, x1, 0.004, z, FACE.top);
  K.lit(0).col(0x5a4a40);
  const across = ob.wid > ob.len;
  if (across) {
    for (let x = x0 + 0.2; x < x1; x += 0.6) K.box(x, 0, a + 0.05, x + 0.22, 0.008, z - 0.05, FACE.top);
    for (const s of [a + 0.35, z - 0.35]) {
      K.lit(0).col(rust).box(x0, 0.006, s - 0.035, x1, 0.014, s + 0.035, FACE.front);
      K.col(steel).box(x0, 0.006, s - 0.03, x1, 0.016, s + 0.03, FACE.top);
    }
  } else {
    for (let s = Math.ceil(a / 0.6) * 0.6; s < z; s += 0.6) K.box(x0 + 0.05, 0, s, x1 - 0.05, 0.008, s + 0.22, FACE.top);
    for (const x of [ob.x - 0.72, ob.x + 0.72]) {
      K.lit(0).col(rust).box(x - 0.035, 0.006, a, x + 0.035, 0.014, z, FACE.front | FACE.left | FACE.right);
      K.col(steel).box(x - 0.03, 0.006, a, x + 0.03, 0.016, z, FACE.top);
    }
  }
};

/** Forklift (tall, stretch mover): an autonomous forklift still shuffling pallets, clean (no plants, no wear): a body
 *  with a cab cage, the mast and forks, the helper-machine dome and two-tone band, and its amber beacon (the
 *  telegraph). */
const forklift: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.7, 0.3);
  K.capY = b.y0 + CAMERA.xrayCapY;
  body(c, 0x3a3020); K.chamfer(b.x0, b.y0 + 0.2, b.s0 + 0.5, b.x1, b.y0 + 1.1, b.s1, 0.05, c.hz.top);
  body(c); for (const x of [b.x0 + 0.05, b.x1 - 0.1]) for (const s of [b.s0 + 0.55, b.s1 - 0.1]) K.box(x, b.y0 + 1.1, s, x + 0.05, b.y1 - 0.1, s + 0.05);
  body(c, c.hz.top); K.box(b.x0, b.y1 - 0.1, b.s0 + 0.5, b.x1, b.y1, b.s1);
  body(c); K.box(b.x0 + 0.15, b.y0, b.s0 + 0.35, b.x1 - 0.15, b.y1 - 0.2, b.s0 + 0.45);
  body(c, 0x2a2232); K.box(b.x0 + 0.2, b.y0 + 0.05, b.s0, b.x0 + 0.35, b.y0 + 0.1, b.s0 + 0.4); K.box(b.x1 - 0.35, b.y0 + 0.05, b.s0, b.x1 - 0.2, b.y0 + 0.1, b.s0 + 0.4);
  // Helper-machine band (two tones of accent2, flanks only) and the sensor dome on the cage roof.
  helperBand(c, b.x0, b.x1, b.y0 + 0.8, b.s0 + 0.6, b.s1 - 0.1);
  K.lit(0, 0, HZ).col(0x8a8fb0).sphere((b.x0 + b.x1) / 2 - 0.25, b.y1 - 0.005, b.s1 - 0.35, 0.09, 6, 3, 0.4);
  K.to('e').glowing(1.6, -1, FX.noFog, 2).col(0xf2b630).cyl((b.x0 + b.x1) / 2, (b.s0 + b.s1) / 2 + 0.6, b.y1, b.y1 + 0.12, 0.07, 6, true);
  K.to('o');
  K.capY = null;
};

export const DOCKS_KITS: Readonly<Partial<Record<Obstacle['kind'], KitDef>>> = {
  container: { draw: container }, pallet_1: { draw: pallet }, pallet_2: { draw: pallet }, pallet_3: { draw: pallet },
  pallet_tall: { draw: pallet }, ibeam: { draw: ibeam, long: true }, loading_dock: { draw: loadingDock, long: true },
  drum_cluster: { draw: drumCluster }, spool_standing: { draw: spool }, spool_lying: { draw: spool },
  mooring_bollard: { draw: mooring }, dock_lip: { draw: dockLip, long: true }, rail_track: { draw: railTrack, long: true },
  forklift: { draw: forklift },
};
