// world/render/kits/downtown.ts: Downtown Plaza kinds (DESIGN §10.3, §18.6 kit: granite ledges, planters, palms in
// planters, café umbrellas, bike racks, bollards, news kiosks, a low fountain, parked cars). The same builders skin
// the kinds when they appear in other areas (the obstacle's area picks colours through KitCtx.hz / area).
import type { Obstacle } from '../../../core/world';
import { COLORS, shade } from '../palette';
import { PAT } from '../textures/ground';
import { FACE, FX } from '../writer';
import { CAR_BODIES, drawCar } from './car';
import { contact, rnd, type KitCtx } from './common';
import { accent, body, inChunk, rim, rimPost, type KitDef, type KitFn } from './shared';

const HZ = FX.noFog | FX.matte;
type Box = Obstacle['solids'][number]['box'];
const boxOf = (ob: Obstacle): Box | undefined => ob.solids[0]?.box;

/** Granite ledge (long, landable): a chamfered granite block; its camera-facing end is a darker block end with a
 *  cream lip along the top front edge (G0 review: the ledge end reads as an end, the top as a rideable surface). */
export const ledge: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const stone = c.area === 'neon' ? 0x8a809e : c.area === 'suburbs' ? 0xb7a89c : c.area === 'docks' ? 0xa79c90 : 0xb9a9a0;
  K.lit(PAT.pavers).col(stone);
  K.chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.035);
  for (const [s, front] of [[b.s0, true], [b.s1, false]] as const) {
    if (!inChunk(c, front ? s : s - 0.001)) continue;
    const s0 = front ? s - 0.01 : s - 0.12, s1 = front ? s + 0.12 : s + 0.01;
    K.lit(0).col(shade(stone, -0.5)).box(b.x0 - 0.005, b.y0, s0, b.x1 + 0.005, b.y1 - 0.03, s1, front ? FACE.front | FACE.left | FACE.right : FACE.back);
    if (front) K.lit(0, 0, FX.noFog, 0.15).col(COLORS.edgeCream).box(b.x0, b.y1 - 0.035, s - 0.012, b.x1, b.y1 + 0.004, s + 0.03, FACE.front | FACE.top);
  }
  if (c.area === 'neon') rim(c, b.x0, b.x1, b.y1 - 0.035, b.s0);
  contact(c, b.x0, b.x1, Math.max(b.s0, c.s0), Math.min(b.s1, c.s1), b.y0 + 0.01, 0.45, 0.2);
};

/** Planter 3.0 × 1.5 × 0.5 (landable rim): a stone box, recessed soil with low flowers. */
export const planter: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob) ?? { x0: ob.x - ob.wid / 2, x1: ob.x + ob.wid / 2, s0: ob.s, s1: ob.s + ob.len, y0: 0, y1: ob.hgt };
  const stone = c.area === 'neon' ? 0x8a809e : 0xc4b2a6, rimW = 0.16;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.5, 0.25);
  K.lit(PAT.pavers).col(stone).chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.03);
  K.lit(PAT.soil).col(0x5a4232).box(b.x0 + rimW, b.y1 - 0.04, b.s0 + rimW, b.x1 - rimW, b.y1 + 0.004, b.s1 - rimW, FACE.top);
  const cols = c.area === 'neon' ? [0xffb7d0, 0xff3fa4, 0x7ee0b5] : [0xf4d58d, 0xd9765a, 0xfff4e3, 0x9c7bb0];
  for (let i = 0; i < 9; i++) {
    const u = rnd(ob.id, i, 1), v = rnd(ob.id, i, 2);
    const x = b.x0 + rimW + 0.1 + u * (b.x1 - b.x0 - 2 * rimW - 0.2), s = b.s0 + rimW + 0.1 + v * (b.s1 - b.s0 - 2 * rimW - 0.2);
    K.lit(0).col(0x5f7f4a).sphere(x, b.y1 + 0.04, s, 0.1, 5, 3, 0.6);
    K.col(cols[i % cols.length]!).sphere(x + 0.03, b.y1 + 0.1, s - 0.02, 0.045, 4, 2);
  }
};

/** Planter with a tree: the planter, a tall trunk (crash, x-ray above 1.6 m) and a compact crown. Downtown: a palm. */
export const planterTree: KitFn = (c, ob) => {
  const K = c.K;
  const rimBox = ob.solids.find((so) => !so.tall)?.box, trunk = ob.solids.find((so) => so.tall)?.box;
  if (rimBox) planter(c, { ...ob, solids: [{ box: rimBox, top: 'landable', tall: false }] });
  if (!trunk) return;
  const x = (trunk.x0 + trunk.x1) / 2, s = (trunk.s0 + trunk.s1) / 2, r = (trunk.x1 - trunk.x0) / 2;
  K.capY = trunk.y0 + 1.6;
  // The trunk is the crash solid: the hazard body (ink, or the inverted Neon body with its emissive rim).
  body(c, c.hz.inverted ? c.hz.top : c.hz.body);       // Neon: the lighter inverted value (Neon targets 3:1)
  K.frustum(x, s, trunk.y0, trunk.y1, r, r * 0.75, 7, false);
  rimPost(c, x, s, r * 0.9, trunk.y0 + 0.15, trunk.y0 + 1.5, trunk.y0 + 1.2);
  const palm = c.area === 'downtown';
  const top = trunk.y1;
  if (palm) {
    K.lit(0, 0.6, FX.matte).col(0x1c301e);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, dx = Math.cos(a), ds = Math.sin(a);
      K.quad(x, top + 0.1, s, x + dx * 0.25 - ds * 0.12, top + 0.15, s + ds * 0.25 + dx * 0.12, x + dx * 1.3, top - 0.35, s + ds * 1.3, x + dx * 0.25 + ds * 0.12, top + 0.15, s + ds * 0.25 - dx * 0.12);
    }
    K.lit(0).col(0x6b4e3a).sphere(x, top + 0.05, s, 0.16, 5, 3);
  } else {
    const leaf = c.area === 'neon' ? 0xffb7d0 : 0x22381f;
    K.lit(0, 0.5, FX.matte).col(leaf);
    for (let i = 0; i < 4; i++) K.sphere(x + (rnd(ob.id, i) - 0.5) * 0.8, top + 0.4 + rnd(ob.id, i, 3) * 0.4, s + (rnd(ob.id, i, 5) - 0.5) * 0.8, 0.55, 6, 4);
  }
  K.capY = null;
};

/** Fountain: a granite basin rim (landable, grindable) around a water pit (splash), with a centre spout. */
export const fountain: KitFn = (c, ob) => {
  const K = c.K;
  const stone = c.area === 'neon' ? 0x8a809e : 0xc4b2a6;
  for (const so of ob.solids) {
    const b = so.box;
    K.lit(PAT.pavers).col(stone).chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.03);
  }
  const p = ob.pits[0];
  if (p) {
    const x = (p.x0 + p.x1) / 2, s = (p.s0 + p.s1) / 2;
    K.lit(0).col(shade(stone, -0.2)).cyl(x, s, p.lipY - 0.3, p.lipY + 0.25, 0.22, 8, true);
    K.lit(0, 0, 0, 0.6).col(0xd8ecf2).frustum(x, s, p.lipY + 0.25, p.lipY + 0.75, 0.08, 0.03, 6, true);
    K.lit(0, 0, 0, 0.4).col(0xd8ecf2).frustum(x, s, p.lipY + 0.25, p.lipY + 0.4, 0.4, 0.12, 8, false);
  }
};

/** Bollard row (tall): one bollard per solid, an ink post with a lighter cap and a brass accent band. */
export const bollards: KitFn = (c, ob) => {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box, x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2, r = Math.min(b.x1 - b.x0, b.s1 - b.s0) / 2;
    contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.6, 0.2);
    body(c); K.cyl(x, s, b.y0, b.y1 - 0.08, r, 8, false);
    K.lit(0, 0, HZ, c.hz.glow).col(c.hz.inverted ? c.hz.accent : 0xc9a15a).cyl(x, s, b.y1 - 0.28, b.y1 - 0.25, r + 0.01, 8, false);
    body(c, c.hz.top); K.frustum(x, s, b.y1 - 0.08, b.y1, r, r * 0.6, 8, true);
    rim(c, x - r, x + r, b.y1 - 0.08, b.s0);
  }
};

/** News kiosk 1.6 × 1.6 × 2.4 (tall): a green-ink booth with an awning toward the camera, magazine racks on the
 *  camera face, a roof cornice; x-ray above 1.6 m. */
export const kiosk: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const shell = c.hz.inverted ? c.hz.body : 0x1f2e2c;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.65, 0.3);
  K.capY = b.y0 + 1.6;
  body(c, shell); K.box(b.x0 + 0.05, b.y0, b.s0 + 0.05, b.x1 - 0.05, b.y1 - 0.25, b.s1 - 0.05);
  body(c, c.hz.top); K.chamfer(b.x0 - 0.05, b.y1 - 0.25, b.s0 - 0.05, b.x1 + 0.05, b.y1, b.s1 + 0.05, 0.05);
  // Magazine rack: rows of small covers on the camera face (accents).
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5; i++) {
      K.lit(0, 0, HZ).col(accent(c.area, row * 5 + i + ob.id));
      const x = b.x0 + 0.15 + i * ((b.x1 - b.x0 - 0.3) / 5);
      K.box(x, b.y0 + 0.5 + row * 0.25, b.s0 + 0.02, x + 0.2, b.y0 + 0.68 + row * 0.25, b.s0 + 0.05, FACE.front | FACE.top);
    }
  }
  // Awning (striped) over the camera face.
  K.lit(0, 0, HZ).col(c.hz.accent).uv(-1, -1);
  K.quad(b.x0 - 0.05, b.y1 - 0.45, b.s0 - 0.45, b.x1 + 0.05, b.y1 - 0.45, b.s0 - 0.45, b.x1 + 0.05, b.y1 - 0.25, b.s0 + 0.05, b.x0 - 0.05, b.y1 - 0.25, b.s0 + 0.05);
  rim(c, b.x0, b.x1, b.y1, b.s0 - 0.05);
  K.capY = null;
};

/** Parked car (tall): the low-poly car, dark body per variant, the area accent stripe. */
export const parkedCar: KitFn = (c, ob) => {
  const b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.7, 0.3);
  c.K.capY = b.y0 + 1.6;
  drawCar(c.K, { x0: b.x0, x1: b.x1, s0: b.s0, s1: b.s1, y: b.y0, h: b.y1 - b.y0, hazard: true,
    body: c.hz.inverted ? c.hz.body : CAR_BODIES[(ob.variant + ob.id) % CAR_BODIES.length]!, accent: c.hz.accent,
    van: ob.kind === 'parked_van' || b.y1 - b.y0 > 1.7, inverted: c.hz.inverted, rim: c.hz.rim, glow: c.hz.glow });
  c.K.capY = null;
};

/** Bike rack 2.4 × 0.7 × 1.15 (tall, with bikes): ink hoops on a rail and two bikes with chunky wheels. */
export const bikeRack: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.6, 0.3);
  const xm = (b.x0 + b.x1) / 2, top = b.y1;
  body(c); K.box(b.x0 + 0.05, b.y0, b.s0, b.x1 - 0.05, b.y0 + 0.06, b.s1);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const s = b.s0 + 0.3 + i * ((b.s1 - b.s0 - 0.6) / (n - 1));
    body(c); K.box(b.x0 + 0.08, b.y0, s - 0.03, b.x0 + 0.13, top - 0.3, s + 0.03); K.box(b.x1 - 0.13, b.y0, s - 0.03, b.x1 - 0.08, top - 0.3, s + 0.03);
    K.box(b.x0 + 0.08, top - 0.36, s - 0.03, b.x1 - 0.08, top - 0.3, s + 0.03);
  }
  // Bikes standing along s: wheel discs (facing ±x) and a frame triangle; dark with an accent frame.
  for (const [k, xb] of [[0, xm - 0.15], [1, xm + 0.15]] as const) {
    const s0 = b.s0 + 0.25 + k * 0.2, s1 = s0 + 1.1 + 0.4;
    body(c, 0x150f1f);
    for (const ws of [s0 + 0.3, s1 - 0.3]) K.hcyl('x', 0, b.y0 + 0.33, ws, xb - 0.025, xb + 0.025, 0.31, 8, true);
    K.lit(0, 0, HZ).col(accent(c.area, ob.id + k));
    K.bar(xb, b.y0 + 0.36, s0 + 0.3, xb, top - 0.1, s0 + 0.75, 0.025);
    K.bar(xb, top - 0.1, s0 + 0.75, xb, b.y0 + 0.36, s1 - 0.3, 0.025);
    K.bar(xb, top - 0.12, s0 + 0.6, xb, top - 0.08, s1 - 0.45, 0.025);
  }
};

/** Café set 1.2 × 1.2 × 1.2 (tall), umbrella canopy at 2.2 (x-ray above 1.6): round table, two chairs, a striped
 *  umbrella. */
export const cafeSet: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2, g = b.y0;
  contact(c, b.x0, b.x1, b.s0, b.s1, g + 0.01, 0.6, 0.3);
  K.capY = g + 1.6;
  body(c); K.cyl(x, s, g, g + 0.72, 0.04, 6, false);
  body(c, c.hz.top); K.cyl(x, s, g + 0.72, g + 0.76, 0.42, 10, true);
  for (const dx of [-0.42, 0.42]) {
    body(c); K.box(x + dx - 0.18, g, s - 0.18, x + dx + 0.18, g + 0.46, s + 0.18);
    K.box(x + dx + Math.sign(dx) * 0.14, g + 0.46, s - 0.18, x + dx + Math.sign(dx) * 0.18, b.y1 - 0.05, s + 0.18);
  }
  body(c); K.cyl(x, s, g + 0.76, g + 2.2, 0.025, 5, false);
  const can = c.hz.inverted ? c.hz.accent : accent(c.area, ob.id);
  for (let i = 0; i < 8; i++) {
    K.lit(0, 0, HZ).col(i % 2 ? can : 0xfff4e3);
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2, R = 1.05;
    K.tri(x, g + 2.45, s, x + Math.cos(a0) * R, g + 2.12, s + Math.sin(a0) * R, x + Math.cos(a1) * R, g + 2.12, s + Math.sin(a1) * R);
  }
  K.capY = null;
};

/** News box 0.5 × 0.5 × 1.15 (tall): an ink box on short legs, a coloured header, a window with a paper inside. */
export const newsBox: KitFn = (c, ob) => {
  const K = c.K, b = boxOf(ob);
  if (!b) return;
  const g = b.y0, top = b.y1;
  contact(c, b.x0, b.x1, b.s0, b.s1, g + 0.01, 0.62, 0.25);
  body(c);
  K.box(b.x0 + 0.04, g, b.s0 + 0.04, b.x0 + 0.08, g + 0.25, b.s1 - 0.04); K.box(b.x1 - 0.08, g, b.s0 + 0.04, b.x1 - 0.04, g + 0.25, b.s1 - 0.04);
  K.box(b.x0, g + 0.25, b.s0, b.x1, top - 0.14, b.s1);
  K.lit(0, 0, HZ, c.hz.glow).col(c.hz.accent).box(b.x0 - 0.005, top - 0.11, b.s0 - 0.005, b.x1 + 0.005, top - 0.07, b.s1 + 0.005, FACE.front | FACE.left | FACE.right);
  body(c, c.hz.top); K.box(b.x0 - 0.01, top - 0.04, b.s0 - 0.01, b.x1 + 0.01, top, b.s1 + 0.01);
  body(c, 0x2a2850); K.box(b.x0 + 0.06, g + 0.5, b.s0 - 0.006, b.x1 - 0.06, top - 0.22, b.s0, FACE.front);
  K.lit(0, 0, HZ).col(0x6a6260).box(b.x0 + 0.12, g + 0.56, b.s0 - 0.008, b.x1 - 0.12, g + 0.64, b.s0 - 0.006, FACE.front);
  rim(c, b.x0, b.x1, top, b.s0);
};

export const DOWNTOWN_KITS: Readonly<Partial<Record<Obstacle['kind'], KitDef>>> = {
  granite_ledge: { draw: ledge, long: true }, planter: { draw: planter }, planter_tree: { draw: planterTree },
  fountain: { draw: fountain }, bollard_row: { draw: bollards }, kiosk: { draw: kiosk }, parked_car: { draw: parkedCar },
  bike_rack: { draw: bikeRack }, cafe_set: { draw: cafeSet }, news_box: { draw: newsBox }, crosswalk_car: { draw: parkedCar },
};
