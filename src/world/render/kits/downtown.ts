// world/render/kits/downtown.ts: Downtown Plaza kinds (DESIGN §10.3, §18.6; RECLAIM skins): granite ledges with moss in
// the joints, wildflower planters, a fig that outgrew its planter, the lily-pad fountain, ivy-wound bollards, the
// shuttered kiosk with a tree through its awning, parked cars (the vehicle builder), rusty bikes or nested carts, the
// café table under a faded umbrella and the faded news box. The same builders skin the kinds when they appear in
// other areas (the obstacle's area picks colours through KitCtx.hz / area). Dressing goes through DRESSER.
import { CAMERA } from '../../../core/tuning';
import { Dress } from '../../../core/skins';
import type { Obstacle } from '../../../core/world';
import { COLORS, RECLAIM, fadePaint, shade } from '../palette';
import { PAT } from '../textures/ground';
import { FACE, FX } from '../writer';
import { vehicleKit } from './car';
import { contact, rnd, type KitCtx } from './common';
import { DRESSER, clearOfEdges, mossOn } from './dress';
import { body, dress, dressBrush, inChunk, ivyPost, leaf, leafPatch, mossPatch, rim, rimPost, rustPatch, sapling, type KitDef, type KitFn } from './shared';

const HZ = FX.noFog | FX.matte;
type Box = Obstacle['solids'][number]['box'];
const boxOf = (ob: Obstacle): Box | undefined => ob.solids[0]?.box;

/** Granite ledge (long, landable): a chamfered granite block with moss in the face joints, ivy trailing low on its end
 *  faces and a clean top band beside the waxed coping; its camera-facing end is a darker block end with a cream lip
 *  along the top front edge (G0 review: the ledge end reads as an end, the top as a rideable surface). */
export const ledge: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const stone = c.area === 'neon' ? 0x8a809e : c.area === 'suburbs' ? 0xb7a89c : c.area === 'docks' ? 0xa79c90 : 0xb9a9a0;
  K.lit(PAT.pavers).col(stone);
  K.chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.035);
  for (const [s, front] of [[b.s0, true], [b.s1, false]] as const) {
    if (!inChunk(c, front ? s : s - 0.001)) continue;
    const s0 = front ? s - 0.01 : s - 0.12, s1 = front ? s + 0.12 : s + 0.01, end = shade(stone, -0.5);
    K.lit(0).col(end).box(b.x0 - 0.005, b.y0, s0, b.x1 + 0.005, b.y1 - 0.03, s1, front ? FACE.front | FACE.left | FACE.right : FACE.back);
    if (front) {
      K.lit(0, 0, FX.noFog, 0.15).col(COLORS.edgeCream).box(b.x0, b.y1 - 0.035, s - 0.012, b.x1, b.y1 + 0.004, s + 0.03, FACE.front | FACE.top);
      // Ivy trailing low on the end face (≥ 0.3 m under the waxed edges).
      if (DRESSER.has(Dress.Ivy)) leafPatch(c, ob, b.x0, b.x1, s - 0.03, s - 0.01, b.y0, Math.min(b.y0 + 0.16, b.y1 - 0.31), 3, ob.id * 7 + 1, FACE.front | FACE.top);
    }
  }
  // Moss in the vertical face joints (every 1.2 m, on both long faces) and along the foot.
  const a = Math.max(b.s0, c.s0), z = Math.min(b.s1, c.s1), h = b.y1 - b.y0;
  for (let s = Math.ceil((a + 0.3) / 1.2) * 1.2; s < z - 0.3; s += 1.2) {
    mossPatch(c, stone, b.x0 - 0.004, b.y0, s, b.x0, b.y1 - 0.08, s + 0.035, FACE.left);
    mossPatch(c, stone, b.x0 - 0.004, b.y0, s - 0.3, b.x0, b.y0 + h * 0.18, s + 0.25, FACE.left);
  }
  if (c.area === 'neon') rim(c, b.x0, b.x1, b.y1 - 0.035, b.s0);
  contact(c, b.x0, b.x1, a, z, b.y0 + 0.01, 0.45, 0.2);
};

/** Flat flower carpet on a planter bed (rule 3: a landable / grindable planter top; rule 2: at rim level −0.02 m),
 *  leaf boxes kept ≥ 0.3 m from every grind edge (rule 5), wildflower dots as life accents (rule 6). Poppies only at
 *  |x| ≥ 4.6. Neon beds use the dark night leaf with cherry-pink and lilac blooms. */
function bedCarpet(c: KitCtx, ob: Obstacle, x0: number, x1: number, s0: number, s1: number, y: number): void {
  if (!DRESSER.has(Dress.Flowers) && ob.kind === 'planter') return;
  const K = c.K, neon = c.area === 'neon';
  const leafA = neon ? RECLAIM.nightMoss : RECLAIM.ivyDeep, leafB = neon ? RECLAIM.nightLeaf : RECLAIM.moss;
  const blooms = neon ? [0xffb7d0, RECLAIM.flowers.lilac, 0xf59bbe]
    : Math.abs((x0 + x1) / 2) >= 4.6 ? [RECLAIM.flowers.pink, RECLAIM.flowers.lilac, RECLAIM.flowers.cornflower, RECLAIM.flowers.poppy]
      : [RECLAIM.flowers.pink, RECLAIM.flowers.lilac, RECLAIM.flowers.cornflower];
  const nx = Math.max(1, Math.round((x1 - x0) / 0.45)), ns = Math.max(1, Math.round((s1 - s0) / 0.45));
  const cw = (x1 - x0) / nx, cl = (s1 - s0) / ns;
  let k = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ns; j++, k++) {
    const u = rnd(ob.id, k, 11), v = rnd(ob.id, k, 12);
    const ax = x0 + i * cw + cw * 0.08 * u, bx = x0 + (i + 1) * cw - cw * 0.08 * v, as = s0 + j * cl + cl * 0.1 * v, bs = s0 + (j + 1) * cl - cl * 0.1 * u;
    if (!clearOfEdges(ax, bx, as, bs, y - 0.02, y, ob.edges)) continue;
    K.lit(PAT.soil, 0.3).col((i + j) % 2 ? leafA : leafB);
    if (!DRESSER.box(K, 'foliage', ax, y - 0.02, as, bx, y, bs, FACE.top)) continue;
    if (v < 0.35) continue;
    // One or two bloom dots per leaf patch (flush with the carpet).
    K.lit(0).col(blooms[k % blooms.length]!);
    const fx = ax + (bx - ax) * (0.2 + 0.5 * u), fs = as + (bs - as) * (0.2 + 0.5 * v);
    DRESSER.box(K, 'life', fx, y - 0.01, fs, fx + 0.09, y + 0.0005, fs + 0.09, FACE.top);
    if (u > 0.6) DRESSER.box(K, 'life', fx - 0.12, y - 0.01, fs + 0.1, fx - 0.04, y + 0.0005, fs + 0.18, FACE.top);
  }
}

/** Planter 3.0 × 1.5 × 0.5 (landable, grindable long rims): a stone box with a recessed bed under a flat wildflower
 *  carpet. */
export const planter: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob) ?? { x0: ob.x - ob.wid / 2, x1: ob.x + ob.wid / 2, s0: ob.s, s1: ob.s + ob.len, y0: 0, y1: ob.hgt };
  const stone = c.area === 'neon' ? 0x8a809e : 0xc4b2a6, rimW = 0.16;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.5, 0.25);
  K.lit(PAT.pavers).col(stone).chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.03);
  K.lit(PAT.soil).col(0x4e3a2c).box(b.x0 + rimW, b.y1 - 0.05, b.s0 + rimW, b.x1 - rimW, b.y1 - 0.03, b.s1 - rimW, FACE.top);
  bedCarpet(c, ob, b.x0 + rimW + 0.02, b.x1 - rimW - 0.02, b.s0 + rimW + 0.04, b.s1 - rimW - 0.04, b.y1 - 0.02);
  // Moss low on the planter's camera face.
  mossPatch(c, stone, b.x0 + 0.2, b.y0, b.s0 - 0.004, b.x0 + 0.65, b.y0 + 0.12, b.s0, FACE.front);
};

/** Planter with a tree (DT: a fig that outgrew its planter): the planter, the trunk (the tall crash solid, x-ray
 *  above CAMERA.xrayCapY) with ridged bark on the same box, roots ≥ 0.3 m inside the rim, and a fuller broadleaf crown
 *  inside the old crown envelope (radius ≤ 1.3 m, top ≤ trunk + 0.5 m). */
export const planterTree: KitFn = (c, ob) => {
  const K = c.K;
  const rimBox = ob.solids.find((so) => !so.tall)?.box, trunk = ob.solids.find((so) => so.tall)?.box;
  if (rimBox) planter(c, { ...ob, solids: [{ box: rimBox, top: 'landable', tall: false }] });
  if (!trunk) return;
  const x = (trunk.x0 + trunk.x1) / 2, s = (trunk.s0 + trunk.s1) / 2, r = (trunk.x1 - trunk.x0) / 2;
  K.capY = trunk.y0 + CAMERA.xrayCapY;
  // The trunk is the crash solid: the hazard body (ink, or the inverted Neon body with its emissive rim).
  const bark = c.hz.inverted ? c.hz.top : c.hz.body;
  body(c, bark);
  K.frustum(x, s, trunk.y0, trunk.y1, r, r * 0.75, 7, false);
  rimPost(c, x, s, r * 0.9, trunk.y0 + 0.15, trunk.y0 + 1.5, trunk.y0 + 1.2);
  // Roots on the bed (≥ 0.3 m inside the rim, under its level).
  if (rimBox) {
    const ry = rimBox.y1 - 0.02;
    for (let i = 0; i < 2; i++) {
      const a = Math.PI * (0.25 + 1.1 * i), dx = Math.cos(a), ds = Math.sin(a);
      const ex = Math.max(rimBox.x0 + 0.35, Math.min(rimBox.x1 - 0.35, x + dx * (r + 0.22)));
      dress(c, 'foliage', 0x1e1626, Math.min(x + dx * r, ex) - 0.03, ry - 0.03, Math.min(s + ds * r, s + ds * (r + 0.22)) - 0.03,
        Math.max(x + dx * r, ex) + 0.03, ry - 0.002, Math.max(s + ds * r, s + ds * (r + 0.22)) + 0.03, FACE.top | FACE.left | FACE.right | FACE.front);
    }
  }
  const top = trunk.y1;
  if (c.area === 'downtown' || c.area === 'suburbs' || c.area === 'docks') {
    // Broadleaf crown: clustered low-poly lobes in ink-green with lit-side highlights.
    const lobes = 6;
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + rnd(ob.id, i, 4) * 0.5, d = 0.55 + 0.25 * rnd(ob.id, i, 5);
      K.lit(0, 0.6, FX.matte).col(i % 2 ? RECLAIM.hazardFoliage : 0x203626);
      K.sphere(x + Math.cos(a) * d, top - 0.05 + rnd(ob.id, i, 6) * 0.2, s + Math.sin(a) * d, 0.48, 6, 3, 0.7);
    }
    K.lit(0, 0.6, FX.matte).col(RECLAIM.hazardFoliageLit).sphere(x - 0.1, top + 0.22, s + 0.05, 0.55, 6, 3, 0.55);
    K.lit(0, 0.6, FX.matte).col(0x30503a).sphere(x + 0.25, top + 0.3, s + 0.3, 0.3, 5, 3, 0.5);
  } else {
    const leafCol = c.area === 'neon' ? 0xffb7d0 : 0x22381f;
    K.lit(0, 0.5, FX.matte).col(leafCol);
    for (let i = 0; i < 4; i++) K.sphere(x + (rnd(ob.id, i) - 0.5) * 0.8, top + 0.4 + rnd(ob.id, i, 3) * 0.4, s + (rnd(ob.id, i, 5) - 0.5) * 0.8, 0.55, 6, 4);
  }
  K.capY = null;
};

/** Fountain: a granite basin rim (landable, grindable) around a water pit (splash). The water stays blue; flat lily
 *  pads (#4A6E45) sit in the basin corners, ≥ 0.3 m from the rim, on ≤ 30% of it, no blooms; a low spout bubbles in a
 *  muted blue (never near-white: nothing but the coping is). */
export const fountain: KitFn = (c, ob) => {
  const K = c.K;
  const stone = c.area === 'neon' ? 0x8a809e : 0xc4b2a6;
  for (const so of ob.solids) {
    const b = so.box;
    K.lit(PAT.pavers).col(stone).chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.03);
  }
  const p = ob.pits[0];
  if (!p) return;
  const x = (p.x0 + p.x1) / 2, s = (p.s0 + p.s1) / 2, wy = p.lipY - 0.12;
  K.lit(0).col(shade(stone, -0.2)).cyl(x, s, p.lipY - 0.3, p.lipY + 0.12, 0.22, 8, true);
  K.lit(0, 0, 0, 0.25).col(0x7f9fbe).frustum(x, s, p.lipY + 0.12, p.lipY + 0.2, 0.18, 0.06, 6, true);
  // Lily pads: clusters in two opposite corners, inset 0.3 m from the rim.
  const W = p.x1 - p.x0, L = p.s1 - p.s0, basin = W * L;
  let covered = 0;
  for (let k = 0; k < 2; k++) {
    const cx = k ? p.x1 - 0.3 : p.x0 + 0.3, cs = k ? p.s0 + 0.3 : p.s1 - 0.3, dir = k ? -1 : 1;
    for (let i = 0; i < 4; i++) {
      const r = 0.1 + 0.07 * rnd(ob.id, k * 4 + i, 9);
      const px = cx + dir * (r + 0.32 * rnd(ob.id, i, k + 1)), ps = cs - dir * (r + 0.32 * rnd(ob.id, i, k + 3));
      if (px - r < p.x0 + 0.3 || px + r > p.x1 - 0.3 || ps - r < p.s0 + 0.3 || ps + r > p.s1 - 0.3) continue;
      if (covered + Math.PI * r * r > basin * 0.3) break;
      covered += Math.PI * r * r;
      K.lit(0).col(i % 2 ? RECLAIM.lilyPad : shade(RECLAIM.lilyPad, -0.12)).cyl(px, ps, wy + 0.002, wy + 0.006, r, 7, true, r, i * 0.3);
    }
  }
};

/** Bollard row (tall): one ink bollard per solid with an ivy spiral and a moss-coloured cap (luminance-matched); in
 *  the Neon look the accent band and the rim. */
export const bollards: KitFn = (c, ob) => {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box, x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2, r = Math.min(b.x1 - b.x0, b.s1 - b.s0) / 2;
    contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.6, 0.2);
    body(c); K.cyl(x, s, b.y0, b.y1 - 0.08, r, 8, false);
    if (c.hz.inverted) K.lit(0, 0, HZ, c.hz.glow).col(c.hz.accent).cyl(x, s, b.y1 - 0.28, b.y1 - 0.25, r + 0.01, 8, false);
    dressBrush(c, DRESSER.has(Dress.Moss) ? mossOn(c.hz.top) : c.hz.top); K.frustum(x, s, b.y1 - 0.08, b.y1, r, r * 0.6, 8, true);
    rim(c, x - r, x + r, b.y1 - 0.08, b.s0);
    ivyPost(c, ob, x, s, r, b.y0 + 0.05, b.y1 - 0.2, 4);
  }
};

/** News kiosk 1.6 × 1.6 × 2.4 (tall): a shuttered booth (a faded roller shutter on the camera face), a faded awning,
 *  a tree growing up its side and out through the roof as a flat ink-green crown cap (≤ +0.05 m, inside the
 *  footprint); x-ray above CAMERA.xrayCapY (1.2 m). */
export const kiosk: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const shell = c.hz.inverted ? c.hz.body : 0x1f2e2c;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.65, 0.3);
  K.capY = b.y0 + CAMERA.xrayCapY;
  body(c, shell); K.box(b.x0 + 0.05, b.y0, b.s0 + 0.05, b.x1 - 0.05, b.y1 - 0.25, b.s1 - 0.05);
  body(c, c.hz.top); K.chamfer(b.x0 - 0.05, b.y1 - 0.25, b.s0 - 0.05, b.x1 + 0.05, b.y1, b.s1 + 0.05, 0.05);
  // Roller shutter: slats on the camera face.
  const slat = c.hz.inverted ? shade(c.hz.body, -0.1) : 0x2c2a34;
  for (let y = b.y0 + 0.35; y < b.y1 - 0.75; y += 0.14) { body(c, slat); K.box(b.x0 + 0.12, y, b.s0 + 0.03, b.x1 - 0.12, y + 0.06, b.s0 + 0.05, FACE.front | FACE.top); }
  // Awning (faded stripe colour) over the camera face; never torn.
  K.lit(0, 0, HZ).col(c.hz.inverted ? c.hz.accent : fadePaint(c.hz.accent)).uv(-1, -1);
  K.quad(b.x0 - 0.05, b.y1 - 0.45, b.s0 - 0.45, b.x1 + 0.05, b.y1 - 0.45, b.s0 - 0.45, b.x1 + 0.05, b.y1 - 0.25, b.s0 + 0.05, b.x0 - 0.05, b.y1 - 0.25, b.s0 + 0.05);
  rim(c, b.x0, b.x1, b.y1, b.s0 - 0.05);
  K.capY = null;
  if (!DRESSER.has(Dress.Crown)) return;
  // The tree: a trunk up the far-side corner of the right face, out through the roof as a flat crown cap.
  K.capY = b.y0 + CAMERA.xrayCapY;
  const tx = b.x1 - 0.04, ts = b.s1 - 0.4;
  dress(c, 'foliage', 0x241a16, tx - 0.07, b.y0, ts - 0.08, tx + 0.05, b.y1 - 0.02, ts + 0.08, FACE.front | FACE.right | FACE.left);
  dress(c, 'foliage', leaf(c), b.x0 + 0.1, b.y1, b.s0 + 0.35, b.x1 + 0.05, b.y1 + 0.03, b.s1 + 0.05, FACE.top | FACE.front | FACE.left | FACE.right);
  dress(c, 'foliage', leaf(c, true), b.x0 + 0.5, b.y1 + 0.02, b.s0 + 0.55, b.x1 - 0.1, b.y1 + 0.05, b.s1 - 0.15, FACE.top | FACE.front | FACE.left | FACE.right);
  K.capY = null;
};

/** Parked car (tall): the vehicle builder (kits/car.ts), body / paint / dressing from the obstacle's skin. */
export const parkedCar: KitFn = vehicleKit;

/** Bike rack 2.4 × 0.7 × 1.15 (tall): either rusty bikes in an ink rack with ink vines through the wheels, or a row of
 *  nested shopping carts in ink (no silver wire, nothing in the baskets) with ink vines up their sides. */
export const bikeRack: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.6, 0.3);
  const xm = (b.x0 + b.x1) / 2, top = b.y1;
  if (DRESSER.skin.body === 'carts') {
    // Four carts nested along s, the camera-end one the outermost.
    const n = 4, step = (b.s1 - b.s0 - 0.9) / (n - 1), bw = (b.x1 - b.x0) / 2 - 0.04;
    for (let i = n - 1; i >= 0; i--) {
      const s0 = b.s0 + i * step, s1 = s0 + 0.9, yb = b.y0 + 0.42;
      body(c, 0x1c1626); K.box(xm - bw, yb, s0 + 0.05, xm + bw, top - 0.2, s1, FACE.front | FACE.left | FACE.right | FACE.back);
      body(c, 0x0e0a16); K.box(xm - bw + 0.03, top - 0.22, s0 + 0.08, xm + bw - 0.03, top - 0.2, s1 - 0.03, FACE.top);
      body(c, 0x241c30); K.box(xm - bw, top - 0.2, s0, xm + bw, top - 0.15, s0 + 0.05, FACE.front | FACE.top);   // handle
      body(c); K.box(xm - bw + 0.04, b.y0 + 0.06, s0 + 0.15, xm - bw + 0.08, yb, s1 - 0.1, FACE.front | FACE.left);
      K.box(xm + bw - 0.08, b.y0 + 0.06, s0 + 0.15, xm + bw - 0.04, yb, s1 - 0.1, FACE.front | FACE.right);
      body(c, 0x120c1e);
      K.box(xm - bw + 0.02, b.y0, s0 + 0.12, xm - bw + 0.1, b.y0 + 0.08, s0 + 0.22); K.box(xm + bw - 0.1, b.y0, s1 - 0.2, xm + bw - 0.02, b.y0 + 0.08, s1 - 0.1);
    }
    if (DRESSER.has(Dress.Ivy)) {
      leafPatch(c, ob, b.x0 - 0.01, b.x0 + 0.03, b.s0 + 0.4, b.s1 - 0.4, b.y0, top - 0.4, 4, ob.id * 3 + 2, FACE.left | FACE.top | FACE.front);
      leafPatch(c, ob, b.x1 - 0.03, b.x1 + 0.01, b.s0 + 0.6, b.s1 - 0.2, b.y0, top - 0.5, 3, ob.id * 3 + 5, FACE.right | FACE.top | FACE.front);
    }
    return;
  }
  body(c); K.box(b.x0 + 0.05, b.y0, b.s0, b.x1 - 0.05, b.y0 + 0.06, b.s1);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const s = b.s0 + 0.3 + i * ((b.s1 - b.s0 - 0.6) / (n - 1));
    body(c); K.box(b.x0 + 0.08, b.y0, s - 0.03, b.x0 + 0.13, top - 0.3, s + 0.03); K.box(b.x1 - 0.13, b.y0, s - 0.03, b.x1 - 0.08, top - 0.3, s + 0.03);
    K.box(b.x0 + 0.08, top - 0.36, s - 0.03, b.x1 - 0.08, top - 0.3, s + 0.03);
  }
  // Rusty bikes standing along s: wheel discs (facing ±x) and a rust-brown frame; ink vines through the wheels.
  for (const [k, xb] of [[0, xm - 0.15], [1, xm + 0.15]] as const) {
    const s0 = b.s0 + 0.25 + k * 0.2, s1 = s0 + 1.1 + 0.4;
    body(c, 0x150f1f);
    for (const ws of [s0 + 0.3, s1 - 0.3]) K.hcyl('x', 0, b.y0 + 0.33, ws, xb - 0.025, xb + 0.025, 0.31, 8, true);
    body(c, k ? 0x6e3c28 : 0x5a3a2c);
    K.bar(xb, b.y0 + 0.36, s0 + 0.3, xb, top - 0.1, s0 + 0.75, 0.025);
    K.bar(xb, top - 0.1, s0 + 0.75, xb, b.y0 + 0.36, s1 - 0.3, 0.025);
    K.bar(xb, top - 0.12, s0 + 0.6, xb, top - 0.08, s1 - 0.45, 0.025);
    if (DRESSER.has(Dress.Ivy)) {
      dress(c, 'foliage', leaf(c), xb - 0.05, b.y0, s0 + 0.18, xb + 0.05, b.y0 + 0.4, s0 + 0.36);
      dress(c, 'foliage', leaf(c, true), xb - 0.04, b.y0 + 0.1, s1 - 0.42, xb + 0.04, b.y0 + 0.3, s1 - 0.22);
    }
  }
};

/** Café set 1.2 × 1.2 × 1.2 (tall), the umbrella canopy at 2.2 (x-ray above CAMERA.xrayCapY): round table, two
 *  chairs, a faded (never torn) umbrella and an ink-green potted plant under the table. */
export const cafeSet: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2, g = b.y0;
  contact(c, b.x0, b.x1, b.s0, b.s1, g + 0.01, 0.6, 0.3);
  K.capY = g + CAMERA.xrayCapY;
  body(c); K.cyl(x, s, g, g + 0.72, 0.04, 6, false);
  body(c, c.hz.top); K.cyl(x, s, g + 0.72, g + 0.76, 0.42, 10, true);
  for (const dx of [-0.42, 0.42]) {
    body(c); K.box(x + dx - 0.18, g, s - 0.18, x + dx + 0.18, g + 0.46, s + 0.18);
    K.box(x + dx + Math.sign(dx) * 0.14, g + 0.46, s - 0.18, x + dx + Math.sign(dx) * 0.18, b.y1 - 0.05, s + 0.18);
  }
  body(c); K.cyl(x, s, g + 0.76, g + 2.2, 0.025, 5, false);
  const can = c.hz.inverted ? c.hz.accent : fadePaint(c.hz.accent), pale = c.hz.inverted ? 0x9489c8 : 0xa8987e;
  for (let i = 0; i < 8; i++) {
    K.lit(0, 0, HZ).col(i % 2 ? can : pale);
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2, R = 1.05;
    K.tri(x, g + 2.45, s, x + Math.cos(a0) * R, g + 2.12, s + Math.sin(a0) * R, x + Math.cos(a1) * R, g + 2.12, s + Math.sin(a1) * R);
  }
  K.capY = null;
  // Potted plant under the table (below the table top).
  if (DRESSER.has(Dress.Ivy)) {
    body(c, 0x6a3a2c); K.frustum(x, s + 0.12, g, g + 0.2, 0.13, 0.16, 7, true);
    dress(c, 'foliage', leaf(c), x - 0.17, g + 0.2, s - 0.06, x + 0.17, g + 0.48, s + 0.3);
  }
};

/** News box 0.5 × 0.5 × 1.15 (tall): a faded ink box on short legs, a faded header band, a moss-coloured top
 *  (luminance-matched), ink ivy up the legs and sides; the isolated filler may grow its sapling. */
export const newsBox: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const g = b.y0, top = b.y1;
  contact(c, b.x0, b.x1, b.s0, b.s1, g + 0.01, 0.62, 0.25);
  body(c);
  K.box(b.x0 + 0.04, g, b.s0 + 0.04, b.x0 + 0.08, g + 0.25, b.s1 - 0.04); K.box(b.x1 - 0.08, g, b.s0 + 0.04, b.x1 - 0.04, g + 0.25, b.s1 - 0.04);
  K.box(b.x0, g + 0.25, b.s0, b.x1, top - 0.14, b.s1);
  K.lit(0, 0, HZ, c.hz.glow).col(c.hz.inverted ? c.hz.accent : fadePaint(c.hz.accent)).box(b.x0 - 0.005, top - 0.11, b.s0 - 0.005, b.x1 + 0.005, top - 0.07, b.s1 + 0.005, FACE.front | FACE.left | FACE.right);
  dressBrush(c, DRESSER.has(Dress.Moss) ? mossOn(c.hz.top) : c.hz.top); K.box(b.x0 - 0.01, top - 0.04, b.s0 - 0.01, b.x1 + 0.01, top, b.s1 + 0.01);
  body(c, 0x2a2850); K.box(b.x0 + 0.06, g + 0.5, b.s0 - 0.006, b.x1 - 0.06, top - 0.22, b.s0, FACE.front);
  K.lit(0, 0, HZ).col(0x5a5450).box(b.x0 + 0.12, g + 0.56, b.s0 - 0.008, b.x1 - 0.12, g + 0.64, b.s0 - 0.006, FACE.front);
  rim(c, b.x0, b.x1, top, b.s0);
  if (DRESSER.has(Dress.Ivy)) {
    dress(c, 'foliage', leaf(c), b.x0 + 0.02, g, b.s0 + 0.02, b.x0 + 0.1, g + 0.38, b.s0 + 0.12);
    dress(c, 'foliage', leaf(c), b.x1 - 0.1, g, b.s1 - 0.14, b.x1 - 0.02, g + 0.26, b.s1 - 0.04);
  }
  sapling(c, (b.x0 + b.x1) / 2, b.s0, b.s1, (b.x1 - b.x0) / 2, top);
};

export const DOWNTOWN_KITS: Readonly<Partial<Record<Obstacle['kind'], KitDef>>> = {
  granite_ledge: { draw: ledge, long: true }, planter: { draw: planter }, planter_tree: { draw: planterTree },
  fountain: { draw: fountain }, bollard_row: { draw: bollards }, kiosk: { draw: kiosk }, parked_car: { draw: parkedCar },
  bike_rack: { draw: bikeRack }, cafe_set: { draw: cafeSet }, news_box: { draw: newsBox }, crosswalk_car: { draw: vehicleKit },
};
