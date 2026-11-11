// world/render/kits/suburbs.ts: Suburbs kinds (DESIGN §10.3, §18.6; RECLAIM skins): brick garden walls with moss and
// ivy, crisp box hedges on brick bases, weathered pickets with climbing roses (the one bloom accent on a crash
// object, fence faces only), rusty mailboxes with a nest in the open flap, bin pairs or a compact dumpster, parked
// vans (the vehicle builder), patina porch rails, the potting bench, weathered crates, faded humps, an ivy hoop pole
// with a sparrow on the rim and a bus shelter with a tree through its roof. Tall hazards stay ink-dark with one
// accent. Dressing goes through DRESSER.
import { CAMERA } from '../../../core/tuning';
import { Dress } from '../../../core/skins';
import type { Obstacle } from '../../../core/world';
import { COLORS, RECLAIM, fadePaint, shade } from '../palette';
import { PAT } from '../textures/ground';
import { signRect } from '../textures/signs';
import { FACE, FX } from '../writer';
import { vehicleKit } from './car';
import { contact, rnd } from './common';
import { DRESSER, mossOn } from './dress';
import { body, dress, dressBrush, inChunk, ivyPost, leaf, leafPatch, mossPatch, rim, riserMoss, rustPatch, sapling, type KitDef, type KitFn } from './shared';

const HZ = FX.noFog | FX.matte;
const boxOf = (ob: Obstacle) => ob.solids[0]?.box;

/** Garden wall (long, landable): a brick wall with moss in the joints and ivy low on its faces (≥ 0.3 m under the
 *  waxed coping), under a mid-value coping stone (never near-white: the cream coping is the only bright line). */
const gardenWall: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const brick = 0xb5645a;
  K.lit(PAT.brickWall).col(brick).box(b.x0 + 0.02, b.y0, b.s0, b.x1 - 0.02, b.y1 - 0.06, b.s1);
  K.lit(0).col(0xa3968a).chamfer(b.x0 - 0.02, b.y1 - 0.06, b.s0 - 0.02, b.x1 + 0.02, b.y1, b.s1 + 0.02, 0.015);
  if (inChunk(c, b.s0)) K.lit(0, 0, FX.noFog, 0.15).col(COLORS.edgeCream).box(b.x0, b.y1 - 0.03, b.s0 - 0.03, b.x1, b.y1 + 0.004, b.s0, FACE.front | FACE.top);
  const a = Math.max(b.s0, c.s0), z = Math.min(b.s1, c.s1), ivyTop = b.y1 - 0.31;
  for (let s = Math.ceil(a / 1.8) * 1.8 + 0.2, i = 0; s < z - 0.6; s += 1.8, i++) {
    mossPatch(c, brick, b.x0 + 0.016, b.y0, s, b.x0 + 0.02, b.y0 + (b.y1 - b.y0) * 0.35, s + 0.6, FACE.left);
    if (DRESSER.has(Dress.Ivy) && ivyTop > b.y0 + 0.06 && i % 2 === 0) {
      leafPatch(c, ob, b.x0 - 0.01, b.x0 + 0.02, s + 0.1, s + 0.9, b.y0, ivyTop, 3, ob.id * 13 + i, FACE.left | FACE.top | FACE.front);
      leafPatch(c, ob, b.x1 - 0.02, b.x1 + 0.01, s + 0.9, s + 1.6, b.y0, ivyTop, 2, ob.id * 13 + i + 7, FACE.right | FACE.top | FACE.front);
    }
  }
  contact(c, b.x0, b.x1, a, z, b.y0 + 0.01, 0.4, 0.2);
};

/** Hedge (long, tall): a crisp box-clipped hedge (ink-green body, a lit-side top) on a 0.25 m dark brick base, x-ray
 *  above CAMERA.xrayCapY. The box silhouette stays sharp: a shaggy hedge reads soft enough to ride through. */
const hedge: KitFn = (c, ob) => {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box, base = b.y0 + 0.25;
    K.capY = b.y0 + CAMERA.xrayCapY;
    K.lit(PAT.brickWall, 0, HZ).col(c.hz.inverted ? c.hz.body : 0x2a1820);
    K.box(b.x0 + 0.02, b.y0, Math.max(b.s0, c.s0 - 1), b.x1 - 0.02, base, Math.min(b.s1, c.s1 + 1), FACE.front | FACE.back | FACE.left | FACE.right | FACE.top);
    K.lit(PAT.grass, 0, HZ, c.hz.inverted ? c.hz.glow : 0).col(c.hz.inverted ? RECLAIM.neonHazardMoss : RECLAIM.hazardFoliage);
    K.chamfer(b.x0, base, b.s0, b.x1, b.y1, b.s1, 0.05, c.hz.inverted ? RECLAIM.neonHazardMossTop : RECLAIM.hazardFoliageLit);
    K.capY = null;
    contact(c, b.x0, b.x1, Math.max(b.s0, c.s0), Math.min(b.s1, c.s1), b.y0 + 0.01, 0.55, 0.2);
  }
};

/** Picket fence (long, tall): ink-dark weathered pickets with clean tops and two rails (never white), climbing roses
 *  (#E98BA6) on the street-side fence face only: the one bloom accent on a crash object. */
const picketFence: KitFn = (c, ob) => {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box, xm = (b.x0 + b.x1) / 2;
    K.capY = b.y0 + CAMERA.xrayCapY;
    const a = Math.max(b.s0, c.s0), z = Math.min(b.s1, c.s1);
    body(c, 0x1d1628);
    K.box(xm - 0.015, b.y0, a, xm + 0.015, b.y1 - 0.15, z, FACE.sides5);
    body(c, 0x2a2238);
    K.box(xm - 0.04, b.y0 + 0.25, a, xm + 0.04, b.y0 + 0.33, z, FACE.sides5);
    K.box(xm - 0.04, b.y1 - 0.4, a, xm + 0.04, b.y1 - 0.32, z, FACE.sides5);
    for (let s = Math.ceil(a / 0.24) * 0.24; s < z - 0.08; s += 0.24) {
      body(c, 0x2a2238); K.box(xm - 0.02, b.y0 + 0.2, s, xm + 0.02, b.y1 - 0.1, s + 0.11, FACE.front | FACE.left | FACE.right);
      body(c, c.hz.top); K.box(xm - 0.021, b.y1 - 0.1, s, xm + 0.021, b.y1, s + 0.11, FACE.top | FACE.front | FACE.left | FACE.right);
    }
    K.capY = null;
    // Climbing roses on the street-side face (rule 3: fence faces only), each in its ink leaves.
    if (DRESSER.has(Dress.Roses)) {
      const street = xm > 0 ? -1 : 1, fx = xm + street * 0.042, face = street < 0 ? FACE.left : FACE.right;
      const xa = Math.min(fx, fx + street * 0.025), xb = Math.max(fx, fx + street * 0.025);
      for (let s = Math.ceil(a / 0.85) * 0.85 + 0.2, i = 0; s < z - 0.3; s += 0.85, i++) {
        const y = b.y0 + 0.36 + 0.3 * rnd(ob.id, s, 1);
        dress(c, 'foliage', leaf(c, i % 2 === 1), xa, y - 0.08, s - 0.12, xb, y + 0.12, s + 0.14, face | FACE.top | FACE.front);
        dressBrush(c, RECLAIM.rose);
        DRESSER.box(K, 'life', xa - street * 0.006, y + 0.02, s - 0.04, xb + street * 0.006, y + 0.08, s + 0.02, face | FACE.top | FACE.front);
        if (rnd(ob.id, s, 2) > 0.5) DRESSER.box(K, 'life', xa - street * 0.006, y - 0.05, s + 0.05, xb + street * 0.006, y, s + 0.1, face | FACE.top | FACE.front);
      }
    }
    contact(c, b.x0 - 0.05, b.x1 + 0.05, a, z, b.y0 + 0.01, 0.45, 0.15);
  }
};

/** Mailbox 0.4 × 0.4 × 1.2 (tall): a dark brick post carrying a rusty mailbox whose front flap hangs open on a bird's
 *  nest, a faded flag and ink ivy up the post. */
const mailbox: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2, g = b.y0, top = b.y1, r = (b.x1 - b.x0) / 2 - 0.03;
  contact(c, b.x0, b.x1, b.s0, b.s1, g + 0.01, 0.6, 0.25);
  K.lit(PAT.brickWall, 0, HZ).col(c.hz.inverted ? c.hz.body : 0x2a1820).box(b.x0, g, b.s0, b.x1, top - 0.38, b.s1);
  body(c, c.hz.top); K.box(b.x0 - 0.02, top - 0.4, b.s0 - 0.02, b.x1 + 0.02, top - 0.35, b.s1 + 0.02);
  const tin = c.hz.inverted ? c.hz.body : 0x3a2018;
  body(c, tin); K.box(b.x0 + 0.03, top - 0.35, b.s0 + 0.03, b.x1 - 0.03, top - 0.12, b.s1);
  body(c, c.hz.inverted ? c.hz.top : 0x2c1c20); K.hcyl('s', x, top - 0.12, 0, b.s0 + 0.03, b.s1, r, 6, true);
  // The open flap: the dark mouth, the flap hanging down from its sill, a nest inside.
  K.lit(0, 0, HZ).col(0x0e0a14).box(b.x0 + 0.06, top - 0.32, b.s0 + 0.02, b.x1 - 0.06, top - 0.06, b.s0 + 0.03, FACE.front);
  body(c, tin); K.box(b.x0 + 0.04, top - 0.56, b.s0 - 0.01, b.x1 - 0.04, top - 0.34, b.s0 + 0.02, FACE.front | FACE.left | FACE.right | FACE.top);
  if (DRESSER.has(Dress.Nest)) {
    K.lit(0, 0, HZ).col(0x4a3a2c).sphere(x, top - 0.28, b.s0 + 0.1, 0.1, 6, 3, 0.45);
  }
  K.lit(0, 0, HZ).col(c.hz.inverted ? 0xc4473d : fadePaint(0xc4473d)).box(b.x1 - 0.03, top - 0.3, s, b.x1, top - 0.02, s + 0.03);
  K.box(b.x1 - 0.03, top - 0.08, s - 0.1, b.x1, top - 0.02, s + 0.03);
  rim(c, b.x0, b.x1, top, b.s0);
  if (DRESSER.has(Dress.Ivy)) {
    leafPatch(c, ob, b.x0 - 0.01, b.x0 + 0.2, b.s0 - 0.012, b.s0 + 0.01, g, top - 0.45, 4, ob.id * 5 + 3, FACE.front | FACE.top | FACE.left);
  }
};

/** Wheelie bins (tall): a bin pair on wheels with moss-coloured lids and ink ferns at the base, or a compact dumpster,
 *  lid closed, with an ink shrub up its side. The isolated filler may grow its sapling. */
const wheelieBins: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.62, 0.25);
  const lid = DRESSER.has(Dress.Moss) ? mossOn(c.hz.top) : c.hz.top;
  if (DRESSER.skin.body === 'dumpster') {
    const g = b.y0, top = b.y1, w = b.x1 - b.x0;
    body(c); K.quad(b.x0 + 0.06, g + 0.12, b.s0 + 0.08, b.x1 - 0.06, g + 0.12, b.s0 + 0.08, b.x1 - 0.02, top - 0.1, b.s0 + 0.01, b.x0 + 0.02, top - 0.1, b.s0 + 0.01);
    K.box(b.x0 + 0.04, g + 0.12, b.s0 + 0.08, b.x1 - 0.04, top - 0.1, b.s1, FACE.left | FACE.right | FACE.back);
    // Lid (closed, two leaves) and the lifting pockets.
    body(c, c.hz.top); K.box(b.x0, top - 0.1, b.s0, b.x0 + w / 2 - 0.01, top - 0.04, b.s1, FACE.sides5);
    K.box(b.x0 + w / 2 + 0.01, top - 0.1, b.s0, b.x1, top - 0.04, b.s1, FACE.sides5);
    dressBrush(c, lid); K.box(b.x0 + 0.04, top - 0.04, b.s0 + 0.04, b.x1 - 0.04, top, b.s1 - 0.04, FACE.top | FACE.front);
    body(c, 0x120c1e);
    for (const xx of [b.x0 + 0.2, b.x1 - 0.32]) K.box(xx, top - 0.42, b.s0 - 0.01, xx + 0.12, top - 0.32, b.s0 + 0.06, FACE.front | FACE.top);
    for (const xx of [b.x0 + 0.12, b.x1 - 0.12]) K.hcyl('x', 0, g + 0.07, b.s1 - 0.12, xx - 0.03, xx + 0.03, 0.07, 6, true);
    rim(c, b.x0, b.x1, top, b.s0);
    if (DRESSER.has(Dress.Ivy)) leafPatch(c, ob, b.x1 - 0.02, b.x1 + 0.02, b.s0 + 0.05, b.s1 - 0.05, g, top - 0.25, 5, ob.id * 11 + 1, FACE.right | FACE.top | FACE.front);
    sapling(c, b.x0 + w * 0.3, b.s0, b.s1, Math.min(w * 0.3, 0.3), top);
    return;
  }
  const n = 2, w = (b.x1 - b.x0) / n;
  for (let i = 0; i < n; i++) {
    const x0 = b.x0 + i * w + 0.03, x1 = x0 + w - 0.06;
    body(c);
    K.quad(x0, b.y0 + 0.06, b.s0 + 0.04, x1, b.y0 + 0.06, b.s0 + 0.04, x1 + 0.02, b.y1 - 0.08, b.s0, x0 - 0.02, b.y1 - 0.08, b.s0);
    K.box(x0, b.y0 + 0.06, b.s0 + 0.04, x1, b.y1 - 0.08, b.s1);
    dressBrush(c, lid); K.box(x0 - 0.03, b.y1 - 0.08, b.s0 - 0.03, x1 + 0.03, b.y1, b.s1, FACE.sides5);
    K.lit(0, 0, HZ, c.hz.glow).col(c.hz.inverted ? c.hz.accent : fadePaint(i === 0 ? 0x5e8c6a : 0x8fb8de)).box(x0 - 0.031, b.y1 - 0.08, b.s0 - 0.031, x1 + 0.031, b.y1 - 0.06, b.s0 + 0.04, FACE.front | FACE.left | FACE.right);
    body(c, 0x120c1e); for (const xx of [x0 + 0.06, x1 - 0.06]) K.hcyl('x', 0, b.y0 + 0.07, b.s1 - 0.1, xx - 0.03, xx + 0.03, 0.07, 6, true);
    rim(c, x0, x1, b.y1, b.s0);
  }
  if (DRESSER.has(Dress.Ivy)) {
    leafPatch(c, ob, b.x0, b.x0 + w * 0.8, b.s0 - 0.04, b.s0 + 0.1, b.y0, b.y0 + 0.28, 3, ob.id * 17 + 2, FACE.front | FACE.top | FACE.left | FACE.right);
    leafPatch(c, ob, b.x1 - w * 0.5, b.x1, b.s0 - 0.04, b.s0 + 0.12, b.y0, b.y0 + 0.2, 2, ob.id * 17 + 5, FACE.front | FACE.top | FACE.right);
  }
  sapling(c, b.x0 + w / 2, b.s0, b.s1, Math.min(w / 2 - 0.03, 0.3), b.y1);
};

/** Porch steps (side drop of 2 steps, 0.34 m) with a 0.55 rail: the steps are slabs (moss on the risers); here the
 *  patina posts and rail (the waxed top strip is the dispatcher's grind edge). */
const porchSteps: KitFn = (c, ob) => {
  const K = c.K;
  for (const e of ob.edges) {
    for (const [s, y] of [[e.a.s, e.a.y], [e.b.s, e.b.y]] as const) {
      if (!inChunk(c, s)) continue;
      body(c, 0x3a4a3a); K.box(e.a.x - 0.03, y - 0.55, s - 0.03, e.a.x + 0.03, y, s + 0.03);
    }
    K.lit(0, 0, FX.noFog).col(RECLAIM.patinaRail).beam(e.a.x, e.a.y, e.a.s, e.b.x, e.b.y, e.b.s, 0.03, -0.05, -0.012);
  }
  for (const sl of ob.slabs) riserMoss(c, ob, sl);
};

/** Potting bench 2.0 × 0.8 × 1.15 (tall): an ink bench with a back board and a shelf, terracotta pots on the top and
 *  the shelf (nothing above the pot rims) and ink trailing plants down the side faces. */
const yardTable: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const g = b.y0, top = g + 0.75, shelf = Math.min(b.y1 - 0.2, top + 0.2), clay = 0x8a4a34;
  contact(c, b.x0, b.x1, b.s0, b.s1, g + 0.01, 0.6, 0.3);
  body(c);
  for (const [x, s] of [[b.x0 + 0.05, b.s0 + 0.05], [b.x1 - 0.1, b.s0 + 0.05], [b.x0 + 0.05, b.s1 - 0.1], [b.x1 - 0.1, b.s1 - 0.1]] as const) K.box(x, g, s, x + 0.05, top - 0.04, s + 0.05);
  const plank = c.hz.inverted ? c.hz.top : 0x8a6a50;
  body(c, plank); K.box(b.x0, top - 0.04, b.s0, b.x1, top, b.s1);
  body(c, 0x22182e); K.box(b.x0 + 0.05, top, b.s1 - 0.08, b.x1 - 0.05, b.y1, b.s1);
  body(c, plank); K.box(b.x0 + 0.05, shelf - 0.03, b.s1 - 0.32, b.x1 - 0.05, shelf, b.s1 - 0.08);
  // Pots: a row on the top (toward the camera) and a row on the shelf; empty above the rims.
  const n = Math.max(2, Math.floor((b.x1 - b.x0 - 0.2) / 0.36));
  for (let i = 0; i < n; i++) {
    const x = b.x0 + 0.18 + i * ((b.x1 - b.x0 - 0.36) / Math.max(1, n - 1)), r = 0.09 + 0.03 * rnd(ob.id, i, 1);
    body(c, clay); K.frustum(x, b.s0 + 0.25, top, top + 0.17, r * 0.8, r, 8, true);
    body(c, shade(clay, -0.3)); K.cyl(x, b.s0 + 0.25, top + 0.15, top + 0.172, r * 0.85, 8, true);
    if (i % 2 === 0) { body(c, clay); K.frustum(x + 0.1, b.s1 - 0.2, shelf, Math.min(b.y1, shelf + 0.14), r * 0.65, r * 0.85, 7, true); }
  }
  // Ink trailing plants down the camera face and one side.
  if (DRESSER.has(Dress.Ivy)) {
    leafPatch(c, ob, b.x0 + 0.1, b.x0 + 0.7, b.s0 - 0.03, b.s0, top - 0.42, top - 0.02, 4, ob.id * 19 + 1, FACE.front | FACE.left | FACE.right);
    leafPatch(c, ob, b.x1 - 0.03, b.x1 + 0.01, b.s0 + 0.1, b.s1 - 0.1, top - 0.5, top - 0.02, 3, ob.id * 19 + 4, FACE.right | FACE.front);
  }
};

/** Crate stack 0.6 × 0.4 × 0.30 (low, landable): weathered crates (landable tops are not ink) with grass at the base
 *  only. */
const crateStack: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const wood = 0xa98a68;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.45, 0.15);
  K.lit(PAT.planks).col(wood).chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.02);
  K.lit(0).col(shade(wood, -0.4));
  K.box(b.x0 - 0.005, b.y0 + 0.02, b.s0 - 0.006, b.x1 + 0.005, b.y0 + 0.05, b.s0, FACE.front);
  K.box(b.x0 - 0.005, b.y1 - 0.05, b.s0 - 0.006, b.x1 + 0.005, b.y1 - 0.02, b.s0, FACE.front);
  if (DRESSER.has(Dress.Ivy)) {
    K.lit(0).col(RECLAIM.moss);
    DRESSER.box(K, 'foliage', b.x0 - 0.03, b.y0, b.s0 - 0.04, b.x0 + 0.2, b.y0 + 0.07, b.s0 + 0.08, FACE.top | FACE.front | FACE.left);
  }
};

/** Speed hump 3.0 × full × 0.08 (bump): a rounded hump with faded chevron stripes. */
const speedHump: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob) ?? { x0: -4.5, x1: 4.5, s0: ob.s, s1: ob.s + ob.len, y0: 0, y1: ob.hgt };
  const sm = (b.s0 + b.s1) / 2, h = Math.max(0.04, b.y1 - b.y0);
  K.lit(PAT.asphalt).col(c.area === 'neon' ? 0x403866 : 0x837a94);
  K.wedge(b.x0, b.x1, b.s0, sm, b.y0 - 0.1, b.y0, b.y0 + h);
  K.wedge(b.x0, b.x1, sm, b.s1, b.y0 - 0.1, b.y0 + h, b.y0);
  K.lit(0).col(fadePaint(0xe0c890));
  for (let x = b.x0 + 0.3; x < b.x1 - 0.4; x += 0.9) K.quad(x, b.y0 + h * 0.55, sm - 0.55, x + 0.35, b.y0 + h * 0.55, sm - 0.55, x + 0.35, b.y0 + h + 0.004, sm, x, b.y0 + h + 0.004, sm);
};

/** Hoop pole 0.2 × 0.2 × 3.0 (tall, x-ray above CAMERA.xrayCapY): a post with ink ivy up it, a backboard facing the
 *  camera and a bare rim (the net long gone) with a sparrow on it (≤ +0.22 m above the rim, warm grey-brown). */
const hoopPole: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.6, 0.2);
  K.capY = b.y0 + CAMERA.xrayCapY;
  body(c); K.box(b.x0, b.y0, b.s0, b.x1, b.y1 - 0.2, b.s1);
  body(c, 0x2a2238); K.box(x - 0.6, b.y1 - 0.75, s - 0.25, x + 0.6, b.y1, s - 0.2);
  K.lit(0, 0, HZ).col(0x6a3a2a).cyl(x, s - 0.45, b.y1 - 0.6, b.y1 - 0.585, 0.2, 8, false);
  K.capY = null;
  if (DRESSER.has(Dress.Bird)) {
    // The sparrow on the rim's camera side: body, head, tail (part of the kit: the rim stands out of the footprint).
    const bx = x + 0.06, bs = s - 0.63, by = b.y1 - 0.585;
    K.capY = b.y0 + CAMERA.xrayCapY;
    K.lit(0, 0, HZ).col(0x7a6656).box(bx - 0.035, by, bs - 0.05, bx + 0.035, by + 0.06, bs + 0.04);
    K.col(0x5e4c40).box(bx - 0.025, by + 0.05, bs - 0.07, bx + 0.025, by + 0.095, bs - 0.025);
    K.capY = null;
  }
  if (DRESSER.has(Dress.Ivy)) leafPatch(c, ob, b.x0 - 0.01, b.x1 + 0.01, b.s0 - 0.012, b.s0 + 0.02, b.y0, b.y0 + 1.1, 5, ob.id * 23 + 1, FACE.front | FACE.left | FACE.right | FACE.top);
};

/** Bus shelter 1.6 × 3.0 × 2.4 (tall): two posts, dusty glass sides (every pane in place), a roof with a tree growing
 *  through it (a flat ink-green crown cap ≤ +0.05 m inside the footprint, its trunk at a far corner) and a faded
 *  poster facing the camera. */
const busShelter: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.62, 0.3);
  K.capY = b.y0 + CAMERA.xrayCapY;
  body(c);
  for (const [x, s] of [[b.x0, b.s0], [b.x1 - 0.06, b.s0], [b.x0, b.s1 - 0.06], [b.x1 - 0.06, b.s1 - 0.06]] as const) K.box(x, b.y0, s, x + 0.06, b.y1 - 0.1, s + 0.06);
  K.lit(0, 0, HZ).col(0x403e58);
  K.box(b.x0 + 0.02, b.y0 + 0.3, b.s0 + 0.06, b.x0 + 0.04, b.y1 - 0.2, b.s1 - 0.06, FACE.left | FACE.right);
  K.box(b.x1 - 0.04, b.y0 + 0.3, b.s0 + 0.06, b.x1 - 0.02, b.y1 - 0.2, b.s1 - 0.06, FACE.left | FACE.right);
  body(c, c.hz.top); K.chamfer(b.x0 - 0.1, b.y1 - 0.1, b.s0 - 0.15, b.x1 + 0.1, b.y1, b.s1 + 0.1, 0.03);
  // Back wall (dark) filling the silhouette, with a modest faded poster facing the camera.
  body(c, 0x1d1628); K.box(b.x0 + 0.06, b.y0 + 0.05, b.s1 - 0.12, b.x1 - 0.06, b.y1 - 0.12, b.s1 - 0.08, FACE.front | FACE.top);
  const area = c.area === 'neon' ? 'suburbs' : c.area, k = (DRESSER.skin.livery >= 0 ? DRESSER.skin.livery : ob.id) % 2;
  const r = signRect(`bb:${area}:${k}`);
  K.lit(0, 0, HZ).col(0x5a5262);
  const px0 = b.x0 + (b.x1 - b.x0) * 0.3, px1 = b.x1 - (b.x1 - b.x0) * 0.3;
  K.quad(px0, b.y0 + 0.7, b.s0 - 0.01, px1, b.y0 + 0.7, b.s0 - 0.01, px1, b.y0 + 1.4, b.s0 - 0.01, px0, b.y0 + 1.4, b.s0 - 0.01,
    [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1]);
  if (DRESSER.has(Dress.Crown)) {
    const tx = b.x0 + 0.25, ts = b.s1 - 0.3;
    dress(c, 'foliage', 0x241a16, tx - 0.08, b.y0, ts - 0.08, tx + 0.08, b.y1 - 0.01, ts + 0.08, FACE.front | FACE.left | FACE.right);
    dress(c, 'foliage', leaf(c), b.x0 - 0.05, b.y1, b.s0 + 0.9, b.x1 - 0.2, b.y1 + 0.03, b.s1 + 0.05, FACE.top | FACE.front | FACE.left | FACE.right);
    dress(c, 'foliage', leaf(c, true), b.x0 + 0.15, b.y1 + 0.02, b.s0 + 1.1, b.x1 - 0.35, b.y1 + 0.05, b.s1 - 0.2, FACE.top | FACE.front | FACE.left | FACE.right);
  }
  K.capY = null;
};

export const SUBURBS_KITS: Readonly<Partial<Record<Obstacle['kind'], KitDef>>> = {
  garden_wall: { draw: gardenWall, long: true }, hedge: { draw: hedge, long: true }, picket_fence: { draw: picketFence, long: true },
  mailbox: { draw: mailbox }, wheelie_bins: { draw: wheelieBins }, parked_van: { draw: vehicleKit }, porch_steps: { draw: porchSteps, long: true },
  yard_table: { draw: yardTable }, crate_stack: { draw: crateStack }, speed_hump: { draw: speedHump }, hoop_pole: { draw: hoopPole },
  bus_shelter: { draw: busShelter }, backout_car: { draw: vehicleKit },
};
