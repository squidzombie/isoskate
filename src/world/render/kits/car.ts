// world/render/kits/car.ts: the RECLAIM vehicle builder (DESIGN §18.5, THEME §3.3). One parametric low-poly vehicle per
// body (sedan, estate, pickup, SUV, taxi, kei van, panel van, camper, box truck, shuttle bus, street sweeper), stretched
// to fill its box (long axis along s, axis-aligned, no yaw), the rear toward the camera unless nosed in.
// The plan view carries the read (the portrait camera mostly sees roofs): the paint top colour on the roof, bonnet and
// boot, framed front and back by dark glass with one sky streak per pane; four tyre nubs at the box corners (the body
// is inset between the arches); mirrors inside the 0.05 m overhang; one accent stripe along bonnet and roof. No chrome
// anywhere: ink bumpers, dark hubs, no bright trim; static vehicles are unlit (matte taillights). Helper machines
// (movers) are clean and carry the sensor dome and the two-tone band. Wear (roof moss at the edges, ink rust on the
// sills, ivy up one arch, weeds under the car, the cat) goes through DRESSER, so the dressing rules hold.
// Kits draw straight into pooled buffers: no allocation per vehicle.
import { CAMERA } from '../../../core/tuning';
import { Dress, isVehicle, type VehicleBody } from '../../../core/skins';
import type { Obstacle } from '../../../core/world';
import { HAZARD, RECLAIM, mixHex, shade } from '../palette';
import { signRect } from '../textures/signs';
import { FACE, FX, type Kit } from '../writer';
import { contact, type KitCtx } from './common';
import { DRESSER, foliageFor, mossOn, rustOn, type DressRole } from './dress';

/** Ink side colours of hazard vehicles (the body family; the top face is the paint). */
export const CAR_BODIES = [0x1c1430, 0x141a2e, 0x1d1420, 0x122220, 0x221830, 0x17142a] as const;
type Target = Kit['t'];
const TYRE = 0x171221, LENS = 0x3c3a52, CURTAIN = 0x5e5248, HELPER_DOME = 0x8a8fb0;
/** Neon vehicles' body glow, × the Neon hazard glow (Phase B, the contrast gate). */
const NEON_VEHICLE_GLOW = 1.35;

export interface VehicleSpec {
  body: VehicleBody;
  x0: number; x1: number; s0: number; s1: number; y: number; h: number;
  /** Paint top (roof, bonnet, boot lid). */
  paint: number;
  /** Side colour (the ink family on hazards; Neon: the inverted body). */
  side: number;
  /** Accent stripe along bonnet and roof (−1: none). */
  stripe: number;
  /** In-corridor hazard (noFog, matte; dressing through DRESSER). */
  hazard: boolean;
  /** Neon inverted look: glowing body, emissive rim on the roof's camera edge and the belt. */
  inverted?: boolean; rim?: number; glow?: number;
  /** Front toward the camera (−s); otherwise the rear shows. */
  nosedIn?: boolean;
  /** Faded livery from the sign atlas (`b:area:i`) on both flanks and the rear (vans, trucks, the bus). */
  livery?: string | null;
  /** Helper machine: the two-tone band colour (HAZARD[area].accent2) and the sensor dome; −1 / undefined: none. */
  helper?: number;
  /** The reversing car's telegraph: steady reverse lights. */
  reverseLights?: boolean;
  /** The cat on the roof (life accent): grey tabby in the corridor, ginger on decor. */
  cat?: 'tabby' | 'ginger' | null;
}

// ── frame: u runs along the vehicle from its rear (0) to its front (L); nosed in, the rear is the far end ──────
let K: Kit = null as unknown as Kit;
let S0 = 0, S1 = 0, FLIP = false, FLAGS = 0, GLOW = 0, DRESS_ON = false, T0: Target = 'o';
const S = (u: number) => (FLIP ? S1 - u : S0 + u);
const swapFB = (f: number) => (f & ~(FACE.front | FACE.back)) | (f & FACE.front ? FACE.back : 0) | (f & FACE.back ? FACE.front : 0);
/** Box over a u-range: FACE.front faces the rear (−u), FACE.back the front. */
function bx(xa: number, ya: number, ua: number, xb: number, yb: number, ub: number, faces: number = FACE.sides5): void {
  let sa = S(ua), sb = S(ub);
  if (sa > sb) { const t = sa; sa = sb; sb = t; }
  K.box(xa, ya, sa, xb, yb, sb, FLIP ? swapFB(faces) : faces);
}
function ch(xa: number, ya: number, ua: number, xb: number, yb: number, ub: number, c: number, top: number): void {
  let sa = S(ua), sb = S(ub);
  if (sa > sb) { const t = sa; sa = sb; sb = t; }
  K.chamfer(xa, ya, sa, xb, yb, sb, c, top);
}
/** Quad a-b-c-d, CCW seen from its front in the unflipped frame. */
function qd(ax: number, ay: number, au: number, bxx: number, by: number, bu: number, cx: number, cy: number, cu: number, dx: number, dy: number, du: number): void {
  if (!FLIP) K.quad(ax, ay, S(au), bxx, by, S(bu), cx, cy, S(cu), dx, dy, S(du));
  else K.quad(dx, dy, S(du), cx, cy, S(cu), bxx, by, S(bu), ax, ay, S(au));
}
/** A dressing box through DRESSER (never on decor vehicles). */
function dbx(role: DressRole, xa: number, ya: number, ua: number, xb: number, yb: number, ub: number, faces: number = FACE.sides5): void {
  if (!DRESS_ON) return;
  let sa = S(ua), sb = S(ub);
  if (sa > sb) { const t = sa; sa = sb; sb = t; }
  DRESSER.box(K, role, xa, ya, sa, xb, yb, sb, FLIP ? swapFB(faces) : faces);
}
const paintBrush = (hex: number) => K.lit(0, 0, FLAGS, GLOW).col(hex);
const flat = (hex: number) => K.lit(0, 0, FLAGS).col(hex);

/** A sloped glass pane from the belt (ua) to the top (ub), xa..xb at the belt and inset `ri` at the top: rear glass
 *  when ua < ub, windscreen when ua > ub. One sky streak, 8% of the pane, lifted off the glass. */
function pane(xa: number, xb: number, belt: number, ua: number, top: number, ub: number, ri: number): void {
  flat(RECLAIM.glass);
  if (ua < ub) qd(xa, belt, ua, xb, belt, ua, xb - ri, top, ub, xa + ri, top, ub);
  else qd(xb, belt, ua, xa, belt, ua, xa + ri, top, ub, xb - ri, top, ub);
  const W = xb - xa, lo = (a: number) => xa + a * W, hi = (a: number) => xa + ri + a * (W - 2 * ri);
  const y0 = belt + 0.01, y1 = top - 0.01;
  flat(RECLAIM.skyStreak);
  if (ua < ub) qd(lo(0.24), y0, ua - 0.006, lo(0.32), y0, ua - 0.006, hi(0.46), y1, ub - 0.006, hi(0.38), y1, ub - 0.006);
  else qd(lo(0.68), y0, ua + 0.006, lo(0.6), y0, ua + 0.006, hi(0.46), y1, ub + 0.006, hi(0.54), y1, ub + 0.006);
}
/** Side glass of a glasshouse (both flanks), ua..ub at the belt to uc..ud at the top. */
function sideGlass(xa: number, xb: number, belt: number, ua: number, ub: number, top: number, uc: number, ud: number, ri: number): void {
  flat(RECLAIM.glass);
  qd(xb, belt, ua, xb, belt, ub, xb - ri, top, ud, xb - ri, top, uc);
  qd(xa, belt, ub, xa, belt, ua, xa + ri, top, uc, xa + ri, top, ud);
}
/** One axle: low tyres (bottom flattened, the tread reaching the box sides: the tyre nubs) and dark hubs. */
function axle(x0: number, x1: number, y: number, R: number, u: number): void {
  const s = S(u), w = 0.24, yc = y + R - 0.03;
  flat(TYRE);
  K.hcyl('x', 0, yc, s, x0, x0 + w, R, 8, true);
  K.hcyl('x', 0, yc, s, x1 - w, x1, R, 8, true);
  flat(RECLAIM.hub);
  K.hcyl('x', 0, yc, s, x0 - 0.004, x0 + 0.01, R * 0.5, 6, true);
  K.hcyl('x', 0, yc, s, x1 - 0.01, x1 + 0.004, R * 0.5, 6, true);
}
/** Dark lips over the tyres on both flanks. */
function arches(xa: number, xb: number, y: number, R: number, ua: number, ub: number, side: number): void {
  flat(shade(side, -0.25));
  pair(xa - 0.01, xb + 0.01, 0.03, y, ua - R - 0.06, y + 0.07, ua + R + 0.06, FACE.sides5);
  pair(xa - 0.01, xb + 0.01, 0.03, y, ub - R - 0.06, y + 0.07, ub + R + 0.06, FACE.sides5);
}
/** Ink bumpers at both ends; at the rear matte taillights (a mover's steady reverse lights inside them), at the front
 *  dull lenses. `ly0..ly1`: the light band. */
function endsAndLights(xa: number, xb: number, deck: number, ly0: number, ly1: number, L: number, v: VehicleSpec): void {
  flat(RECLAIM.bumper);
  bx(xa - 0.02, deck - 0.08, 0, xb + 0.02, deck + 0.1, 0.07, FACE.top | FACE.front | FACE.left | FACE.right);
  bx(xa - 0.02, deck - 0.08, L - 0.07, xb + 0.02, deck + 0.1, L, FACE.top | FACE.back | FACE.left | FACE.right);
  const lw = Math.min(0.24, (xb - xa) * 0.16);
  flat(RECLAIM.taillight);
  pair(xa + 0.04, xb - 0.04, lw, ly0, 0.012, ly1, 0.03, FACE.front);
  if (v.reverseLights) {
    K.to('e').glowing(1.2, -1, FX.noFog).col(0xf0c890);
    pair(xa + 0.06, xb - 0.06, lw * 0.4, ly0 + 0.02, 0.006, ly1 - 0.02, 0.012, FACE.front);
    K.to(T0);
  }
  flat(LENS);
  pair(xa + 0.05, xb - 0.05, lw, ly0 + 0.02, L - 0.03, ly1, L - 0.012, FACE.back);
}
/** Mirrors at the windscreen base, inside the footprint (the body is inset 0.07 m). */
function mirrors(x0: number, x1: number, belt: number, u: number): void {
  flat(RECLAIM.bumper);
  pair(x0 + 0.005, x1 - 0.005, 0.095, belt + 0.02, u, belt + 0.12, u + 0.12);
}
/** The accent stripe (0.10 m) along a run of top faces at y (a life accent). */
function stripe(v: VehicleSpec, xm: number, y: number, ua: number, ub: number): void {
  if (v.stripe < 0 || ub <= ua) return;
  K.lit(0, 0, FLAGS, GLOW * 0.5).col(v.stripe);
  if (DRESS_ON) dbx('life', xm - 0.05, y - 0.004, ua, xm + 0.05, y + 0.002, ub, FACE.top);
  else bx(xm - 0.05, y - 0.004, ua, xm + 0.05, y + 0.002, ub, FACE.top);
}
/** An opaque paint plate just under the x-ray cap: through the 50% screen door of the roof above it the roof still
 *  reads as paint instead of the ground showing through. */
function capPlate(v: VehicleSpec, xa: number, xb: number, ua: number, ub: number): void {
  const cap = K.capY;
  if (cap === null || cap >= v.y + v.h - 0.02 || ub <= ua) return;
  paintBrush(v.paint);
  bx(xa, cap - 0.014, ua, xb, cap - 0.004, ub, FACE.top);
}
/** Roof moss (≤ 20% of roof and bonnet: edge patches on the rear half of the roof and the bonnet corners, never on
 *  glass), ink rust on the sills, ivy up one arch and weeds under the car. Hazard vehicles only, through DRESSER.
 *  Roof xa..xb × ra..rb at roofY; bonnet ba..bb at bonnetY (bb ≤ ba: none). */
function wear(v: VehicleSpec, xa: number, xb: number, deck: number, roofY: number, ra: number, rb: number,
  bonnetY: number, ba: number, bb: number, archU: number, sideA: number, sideB: number): void {
  if (!DRESS_ON) return;
  const L = v.s1 - v.s0;
  if (DRESSER.has(Dress.Moss) && !v.inverted) {
    const rw = xb - xa, rl = rb - ra;
    K.lit(0, 0, FLAGS).col(mossOn(v.paint));
    dbx('wear', xa, roofY, ra, xa + rw * 0.18, roofY + 0.003, ra + rl * 0.42, FACE.top);
    dbx('wear', xb - rw * 0.14, roofY, ra + rl * 0.08, xb, roofY + 0.003, ra + rl * 0.3, FACE.top);
    if (bb > ba) {
      const bl = bb - ba;
      dbx('wear', xa, bonnetY, bb - bl * 0.3, xa + rw * 0.22, bonnetY + 0.003, bb - 0.02, FACE.top);
      dbx('wear', xb - rw * 0.18, bonnetY, bb - bl * 0.22, xb, bonnetY + 0.003, bb - 0.02, FACE.top);
    }
  }
  if (DRESSER.has(Dress.Rust)) {
    K.lit(0, 0, FLAGS).col(rustOn(v.side));
    dbx('wear', sideA - 0.004, deck, L * 0.3, sideA, deck + 0.07, L * 0.62, FACE.left);
    dbx('wear', sideB, deck, L * 0.38, sideB + 0.004, deck + 0.07, L * 0.66, FACE.right);
  }
  if (DRESSER.has(Dress.Ivy)) {
    const area = v.inverted ? 'neon' : 'downtown', leaf = foliageFor(area, true), lit = foliageFor(area, true, true);
    K.lit(0, 0.4, FLAGS, GLOW).col(leaf);
    // Ivy up one wheel arch (the left flank) and weeds under the body between the wheels.
    dbx('foliage', sideA - 0.012, v.y + 0.05, archU - 0.32, sideA, deck + 0.32, archU - 0.12, FACE.left | FACE.top | FACE.front);
    dbx('foliage', sideA - 0.012, deck + 0.1, archU - 0.16, sideA, deck + 0.42, archU - 0.04, FACE.left | FACE.top);
    K.col(lit);
    dbx('foliage', sideA - 0.016, deck + 0.24, archU - 0.26, sideA - 0.004, deck + 0.36, archU - 0.16, FACE.left | FACE.top | FACE.front);
    K.col(leaf);
    dbx('foliage', sideA + 0.2, v.y, L * 0.36, sideA + 0.55, v.y + 0.12, L * 0.44, FACE.top | FACE.front | FACE.left);
    dbx('foliage', sideB - 0.6, v.y, L * 0.5, sideB - 0.25, v.y + 0.1, L * 0.56, FACE.top | FACE.front | FACE.right);
  }
}
/** The cat loaf on the roof (≤ +0.22 m, a life accent; never in Neon, never on movers). */
function cat(v: VehicleSpec, xm: number, roofY: number, ra: number, rb: number): void {
  if (!v.cat || v.inverted || !DRESS_ON || !DRESSER.has(Dress.Cat)) return;
  const tabby = v.cat === 'tabby', fur = tabby ? RECLAIM.tabby[0] : RECLAIM.ginger, band = tabby ? RECLAIM.tabby[1] : shade(RECLAIM.ginger, 0.12);
  const u = ra + (rb - ra) * 0.55, x = xm + 0.12;
  K.lit(0, 0, FLAGS).col(fur);
  dbx('cat', x - 0.11, roofY, u - 0.19, x + 0.11, roofY + 0.13, u + 0.17);
  K.col(band);
  dbx('cat', x - 0.112, roofY + 0.06, u - 0.08, x + 0.112, roofY + 0.132, u - 0.04, FACE.top | FACE.left | FACE.right);
  dbx('cat', x - 0.112, roofY + 0.06, u + 0.02, x + 0.112, roofY + 0.132, u + 0.06, FACE.top | FACE.left | FACE.right);
  K.col(fur);
  // Head toward the rear, two ears, the tail curled along the flank.
  dbx('cat', x - 0.07, roofY + 0.04, u - 0.3, x + 0.07, roofY + 0.17, u - 0.18);
  dbx('cat', x - 0.06, roofY + 0.17, u - 0.27, x - 0.025, roofY + 0.21, u - 0.23);
  dbx('cat', x + 0.025, roofY + 0.17, u - 0.27, x + 0.06, roofY + 0.21, u - 0.23);
  dbx('cat', x + 0.11, roofY, u - 0.12, x + 0.16, roofY + 0.04, u + 0.16, FACE.top | FACE.right | FACE.front);
}
/** Helper-machine motif: a two-tone band along both flanks (life accents, side faces only) and a small rounded sensor
 *  dome on the roof at domeU (it never rises above the box). */
function helperMotif(v: VehicleSpec, xa: number, xb: number, y: number, domeU: number, roofY: number): void {
  if (v.helper === undefined || v.helper < 0) return;
  const L = v.s1 - v.s0;
  for (let k = 0; k < 2; k++) {
    K.lit(0, 0, FLAGS, GLOW).col(k ? shade(v.helper, -0.35) : v.helper);
    const y0 = k ? y - 0.05 : y, y1 = k ? y : y + 0.06;
    dbx('life', xa - 0.006, y0, 0.2, xa, y1, L - 0.2, FACE.left);
    dbx('life', xb, y0, 0.2, xb + 0.006, y1, L - 0.2, FACE.right);
  }
  flat(HELPER_DOME);
  K.sphere((xa + xb) / 2, roofY - 0.012, S(domeU), 0.1, 6, 3, Math.max(0.1, Math.min(0.6, (v.y + v.h - roofY + 0.008) / 0.1)));
}
/** Faded livery from the sign atlas on both flanks (u-range ua..ub, read the right way round from either side). */
function liveryOn(key: string, xa: number, xb: number, ya: number, yb: number, ua: number, ub: number, dim: number): void {
  const r = signRect(key), uv = [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1] as const;
  const sa = Math.min(S(ua), S(ub)), sb = Math.max(S(ua), S(ub));
  K.lit(0, 0, FLAGS).col(dim);
  K.quad(xa - 0.006, ya, sb, xa - 0.006, ya, sa, xa - 0.006, yb, sa, xa - 0.006, yb, sb, uv);
  K.quad(xb + 0.006, ya, sa, xb + 0.006, ya, sb, xb + 0.006, yb, sb, xb + 0.006, yb, sa, uv);
}
const mirrorLR = (f: number) => (f & ~(FACE.left | FACE.right)) | (f & FACE.left ? FACE.right : 0) | (f & FACE.right ? FACE.left : 0);
/** Two boxes mirrored about the centre line: [xa, xa + w] and [xb − w, xb] (left / right faces swap). */
function pair(xa: number, xb: number, w: number, ya: number, ua: number, yb: number, ub: number, faces: number = FACE.sides5): void {
  bx(xa, ya, ua, xa + w, yb, ub, faces);
  bx(xb - w, ya, ua, xb, yb, ub, mirrorLR(faces));
}
/** Neon rim (emissive) along the roof's rear edge and the rear belt. */
function neonRim(v: VehicleSpec, xa: number, xb: number, roofY: number, ra: number, belt: number): void {
  if (!v.inverted || !v.rim) return;
  K.to('e').glowing(1.6, -1, FX.noFog).col(v.rim);
  bx(xa, roofY - 0.012, ra - 0.03, xb, roofY + 0.004, ra, FACE.top | FACE.front);
  bx(v.x0 + 0.08, belt - 0.02, 0.02, v.x1 - 0.08, belt + 0.004, 0.07, FACE.top | FACE.front);
  K.to(T0);
}
const DIM_LIVERY = 0x433c4e, DIM_LIVERY_LIT = 0x9a8e9a;

// ── bodies ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** A car (sedan, estate, pickup, SUV, taxi): an ink lower body with the paint on its shoulders, boot and bonnet, and a
 *  glasshouse whose paint roof is framed front and back by dark glass. */
function car(v: VehicleSpec, L: number): void {
  const { x0, x1, y, h } = v, b = v.body;
  const xa = x0 + 0.07, xb = x1 - 0.07, xm = (x0 + x1) / 2;
  const R = Math.min(0.33, h * 0.23), deck = y + R * 0.72;
  const suv = b === 'suv', taxi = b === 'taxi', pickup = b === 'pickup', estate = b === 'estate';
  const belt = y + h * (suv ? 0.6 : 0.56), roofY = y + h - (taxi ? 0.17 : 0) - 0.006, ri = suv ? 0.1 : 0.15;
  // Glasshouse stations (u): rear glass from g0 (belt) to r0 (roof); windscreen from r1 (roof) to g1 (belt).
  const g0 = L * (pickup ? 0.42 : estate || suv ? 0.03 : 0.21), r0 = L * (pickup ? 0.45 : estate || suv ? 0.1 : 0.34);
  const r1 = L * (pickup ? 0.66 : suv ? 0.68 : 0.62), g1 = L * (pickup ? 0.79 : suv ? 0.8 : 0.78);
  const ua = L * 0.19, ub = L * 0.8;
  axle(x0, x1, y, R, ua); axle(x0, x1, y, R, ub);
  paintBrush(v.side);
  if (pickup) {
    // Cab and bonnet ahead of the open bed; the bed walls carry the paint rim, the floor is ink.
    ch(xa, deck, g0 - 0.02, xb, belt, L - 0.03, 0.05, v.paint);
    paintBrush(v.side);
    bx(xa, deck, 0.05, xb, deck + 0.18, g0 - 0.02, FACE.front | FACE.left | FACE.right);
    pair(xa, xb, 0.07, deck + 0.18, 0.05, belt, g0 - 0.02, FACE.front | FACE.left | FACE.right);
    bx(xa + 0.07, deck + 0.18, 0.05, xb - 0.07, belt, 0.12, FACE.front | FACE.top);
    paintBrush(v.paint);
    pair(xa, xb, 0.07, belt - 0.004, 0.05, belt, g0 - 0.02, FACE.top);
    paintBrush(shade(v.side, 0.06));
    bx(xa + 0.07, deck + 0.17, 0.12, xb - 0.07, deck + 0.18, g0 - 0.02, FACE.top);
    // Ink shrubs in the bed, below the rim.
    if (DRESS_ON && DRESSER.has(Dress.Ivy)) {
      const area = v.inverted ? 'neon' : 'downtown';
      K.lit(0, 0.5, FLAGS, GLOW).col(foliageFor(area, true));
      dbx('foliage', xa + 0.12, deck + 0.18, g0 * 0.35, xm + 0.1, belt - 0.06, g0 * 0.7);
      K.col(foliageFor(area, true, true));
      dbx('foliage', xm - 0.05, deck + 0.18, g0 * 0.55, xb - 0.14, belt - 0.1, g0 - 0.1);
    }
  } else ch(xa, deck, 0.03, xb, belt, L - 0.03, 0.06, v.paint);
  arches(xa, xb, deck + R * 0.6, R, ua, ub, v.side);
  endsAndLights(xa, xb, deck, belt - 0.2, belt - 0.08, L, v);
  // Glasshouse.
  const ga = xa + 0.06, gb = xb - 0.06;
  pane(ga, gb, belt, g0, roofY, r0, ri);
  pane(ga, gb, belt, g1, roofY, r1, ri);
  sideGlass(ga, gb, belt, g0, g1, roofY, r0, r1, ri);
  // Pillars (side colour) split the side glass into windows.
  paintBrush(v.side);
  const pu = (r0 + r1) / 2;
  qd(gb + 0.002, belt, pu - 0.05, gb + 0.002, belt, pu + 0.05, gb - ri + 0.002, roofY, pu + 0.05, gb - ri + 0.002, roofY, pu - 0.05);
  qd(ga - 0.002, belt, pu + 0.05, ga - 0.002, belt, pu - 0.05, ga + ri - 0.002, roofY, pu - 0.05, ga + ri - 0.002, roofY, pu + 0.05);
  // Roof: the paint top (a box, so the x-ray cap takes it like every tall solid), with the plate under the cap.
  paintBrush(v.paint);
  bx(ga + ri - 0.01, roofY - 0.05, r0 - 0.02, gb - ri + 0.01, roofY, r1 + 0.02);
  capPlate(v, ga + ri * 0.75, gb - ri * 0.75, r0 - 0.02, r1 + 0.02);
  if (estate || suv) {
    // Empty roof rails (ink): nothing on them.
    flat(RECLAIM.bumper);
    bx(ga + ri + 0.04, roofY, r0 + 0.08, ga + ri + 0.08, Math.min(y + h, roofY + 0.005), r1 - 0.08, FACE.top);
    bx(gb - ri - 0.08, roofY, r0 + 0.08, gb - ri - 0.04, Math.min(y + h, roofY + 0.005), r1 - 0.08, FACE.top);
  }
  if (taxi) {
    // The roof sign: a plain, unlit, textless shape inside the box height.
    paintBrush(shade(v.side, 0.18));
    const su = (r0 + r1) / 2;
    bx(xm - 0.22, roofY, su - 0.1, xm + 0.22, Math.min(y + h, roofY + 0.15), su + 0.1);
  }
  mirrors(x0, x1, belt, g1 - 0.06);
  stripe(v, xm, belt, g1 + 0.06, L - 0.12);
  stripe(v, xm, roofY, r0 + 0.02, r1);
  if (!pickup) stripe(v, xm, belt, 0.12, g0 - 0.04);
  wear(v, ga + ri, gb - ri, deck, roofY, r0, r1, belt, g1 + 0.04, L - 0.06, ub, xa, xb);
  cat(v, xm, roofY, r0, r1);
  helperMotif(v, xa, xb, belt - 0.12, (r0 + r1) / 2, roofY);
  neonRim(v, ga + ri, gb - ri, roofY, r0, belt);
}

/** Box bodies (panel van, camper, kei van, box truck, shuttle bus, street sweeper): an ink lower body with the paint
 *  bonnet, an upper box (ink panels, paint roof) from the rear to u1, and ahead of it either a sloped windscreen with
 *  cab side windows (vans, the bus: a window band) or a glazed cab with its own roof (truck, sweeper). */
function boxy(v: VehicleSpec, L: number): void {
  const { x0, x1, y, h } = v, b = v.body, xa = x0 + 0.07, xb = x1 - 0.07, xm = (x0 + x1) / 2;
  const truck = b === 'box_truck', bus = b === 'shuttle_bus', sw = b === 'sweeper', kei = b === 'kei_van', cab = truck || sw;
  const R = truck || bus ? 0.42 : sw ? 0.26 : Math.min(0.34, h * 0.18), deck = y + R * 0.72, roofY = y + h - 0.006;
  const belt = y + h * (truck ? 0.36 : bus ? 0.4 : kei || sw ? 0.5 : 0.48), ua = L * 0.17, ub = L * 0.83;
  const u1 = L * (truck ? 0.72 : bus ? 0.985 : sw ? 0.56 : kei ? 0.84 : 0.74), top1 = sw ? y + h * 0.82 : roofY;
  const cabTop = sw ? roofY : y + h * 0.74, c0 = u1 + 0.06;
  axle(x0, x1, y, R, ua); axle(x0, x1, y, R, ub);
  if (truck) axle(x0, x1, y, R, ua + 2.05 * R);
  paintBrush(v.side); ch(xa, deck, 0.03, xb, belt, L - 0.03, 0.05, v.paint);
  paintBrush(v.side); ch(xa + 0.02, belt - 0.01, 0.03, xb - 0.02, top1, u1, 0.06, v.paint);
  arches(xa, xb, deck + R * 0.6, R, ua, ub, v.side);
  endsAndLights(xa, xb, deck, belt - 0.22, belt - 0.08, L, v);
  if (cab) {
    pane(xa + 0.08, xb - 0.08, belt, L - 0.06, cabTop - 0.03, L - 0.34, 0.04);
    flat(RECLAIM.glass); bx(xa + 0.05, belt + 0.06, c0, xb - 0.05, cabTop - 0.06, L - 0.3, FACE.left | FACE.right | FACE.front);
    paintBrush(v.paint); bx(xa + 0.03, cabTop - 0.06, c0 - 0.02, xb - 0.03, cabTop, L - 0.28);
  } else {
    pane(xa + 0.04, xb - 0.04, belt, bus ? L - 0.02 : L * (kei ? 0.95 : 0.86), roofY - 0.04, u1, bus ? 0.02 : 0.06);
    flat(RECLAIM.glass); bx(xa + 0.012, belt + 0.12, bus ? 0.5 : u1 - Math.min(0.7, u1 * 0.22), xb - 0.012, roofY - 0.18, u1 - 0.08, FACE.left | FACE.right);
  }
  // The rear: a roller door (truck) or doors with two small dark windows; a hopper door on the sweeper.
  flat(truck ? shade(v.side, 0.1) : RECLAIM.glass);
  if (truck) for (let yy = deck + 0.2; yy < roofY - 0.7; yy += 0.3) bx(xa + 0.1, yy, 0.012, xb - 0.1, yy + 0.04, 0.03, FACE.front);
  else if (!sw) pair(xa + 0.14, xb - 0.14, (xb - xa) / 2 - 0.2, roofY - 0.48, 0.022, roofY - 0.16, 0.03, FACE.front);
  if (b === 'camper') {
    // Curtains drawn in the side windows (nothing in them) and a pop-top seam.
    flat(CURTAIN); bx(xa + 0.008, belt + 0.14, L * 0.2, xb - 0.008, roofY - 0.22, L * 0.52, FACE.left | FACE.right);
    paintBrush(mixHex(v.side, v.paint, 0.5)); bx(xa + 0.012, roofY - 0.12, 0.024, xb - 0.012, roofY - 0.09, u1 - 0.02, FACE.left | FACE.right | FACE.front);
  }
  if (sw) {
    // Side brushes under the front corners, inside the box.
    flat(0x2a2232);
    K.cyl(x0 + 0.28, S(L - 0.32), y, y + 0.05, 0.26, 8, true); K.cyl(x1 - 0.28, S(L - 0.32), y, y + 0.05, 0.26, 8, true);
  }
  if (v.livery) {
    const dim = v.hazard && !v.inverted ? DIM_LIVERY : DIM_LIVERY_LIT, ly = (truck ? deck + 0.5 : belt + 0.12);
    liveryOn(v.livery, xa + 0.02, xb - 0.02, ly, Math.min(top1 - 0.25, ly + u1 * 0.16), u1 * 0.12, u1 * 0.86, dim);
  }
  mirrors(x0, x1, belt, cab ? L - 0.45 : u1 - 0.08);
  stripe(v, xm, top1, 0.15, u1 - 0.1);
  if (cab) stripe(v, xm, cabTop, c0 + 0.1, L - 0.4); else if (!bus) stripe(v, xm, belt, L * 0.88, L - 0.1);
  wear(v, xa + 0.02, xb - 0.02, deck, top1, 0.1, u1 - 0.1, belt, L * 0.88, truck || bus || sw ? 0 : L - 0.05, ub, xa, xb);
  if (sw) capPlate(v, xa + 0.06, xb - 0.06, c0, L - 0.3); else capPlate(v, xa + 0.05, xb - 0.05, 0.08, u1 - 0.04);
  helperMotif(v, xa, xb, belt - 0.1, cab ? (c0 + L) / 2 - 0.15 : u1 * 0.5, cab ? cabTop : roofY);
  neonRim(v, xa + 0.08, xb - 0.08, top1, 0.06, belt);
}

/** Draws a vehicle body stretched to fill its box (DESIGN §18.5). Opaque parts go to the Kit's current target. */
export function drawVehicle(k: Kit, v: VehicleSpec): void {
  K = k; T0 = k.t; S0 = v.s0; S1 = v.s1; FLIP = !!v.nosedIn;
  FLAGS = v.hazard ? FX.noFog | FX.matte : 0; GLOW = v.inverted ? v.glow ?? 0 : 0;
  DRESS_ON = v.hazard && DRESSER.ob !== null;
  const L = v.s1 - v.s0;
  switch (v.body) {
    case 'sedan': case 'estate': case 'pickup': case 'suv': case 'taxi': car(v, L); break;
    default: boxy(v, L);
  }
  K.to(T0);
}

/** Paint top of a hazard vehicle: the skin's paint (movers slate). */
export const paintOf = (p: keyof typeof RECLAIM.carPaint | null) => RECLAIM.carPaint[p ?? 'slate'];

/** The kit of every vehicle kind (parked_car, parked_van, crosswalk_car, backout_car, and the container's truck and
 *  bus): the body, paint, dressing and livery come from the obstacle's skin (DRESSER.skin, core/skins.ts propSkin).
 *  Neon (and any obstacle in the Neon look) takes the inverted body with its rim; Docks stripes use accent2, so no
 *  amber runs along s. */
export function vehicleKit(c: KitCtx, ob: Obstacle): void {
  const b = ob.solids[0]?.box;
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.7, 0.3);
  c.K.capY = b.y0 + CAMERA.xrayCapY;
  drawVehicle(c.K, hazardSpec(c, ob, b.x0, b.x1, b.s0, b.s1, b.y0, b.y1 - b.y0));
  c.K.capY = null;
}

/** The hazard VehicleSpec of an obstacle's skin over the given (prop-frame) box. */
function hazardSpec(c: KitCtx, ob: Obstacle, x0: number, x1: number, s0: number, s1: number, y: number, h: number): VehicleSpec {
  const skin = DRESSER.skin, body: VehicleBody = isVehicle(skin.body) ? skin.body : ob.kind === 'parked_van' || ob.kind === 'van_across' ? 'panel_van' : 'sedan';
  const clean = (skin.dress & Dress.Clean) !== 0, inv = c.hz.inverted;
  const neonBody = RECLAIM.neonCarBody[body === 'taxi' ? 3 : (ob.id + ob.variant) % 3]!;
  return {
    body, x0, x1, s0, s1, y, h,
    // (Neon, Phase B: taxis and kei vans are in-corridor hazards now, beside the lit kerbs and puddles; their roofs take
    // the Neon hazard top, tinted by the body, and a little more glow, so they hold the ≥ 2.5:1 pixel gate)
    paint: inv ? mixHex(c.hz.top, neonBody, 0.25) : paintOf(skin.paint),
    side: inv ? neonBody : CAR_BODIES[(ob.variant + ob.id) % CAR_BODIES.length]!,
    stripe: inv || clean ? -1 : c.hz === HAZARD.docks ? HAZARD.docks.accent2 : c.hz.accent,
    hazard: true, inverted: inv, rim: c.hz.rim, glow: c.hz.glow * (inv ? NEON_VEHICLE_GLOW : 1), nosedIn: skin.nosedIn,
    livery: skin.livery >= 0 ? `b:${ob.area}:${skin.livery}` : null,
    helper: clean ? c.hz.accent2 : -1, reverseLights: ob.kind === 'backout_car', cat: ob.area === 'neon' ? null : 'tabby',
  };
}

/** van_across (Phase B, THEME §3.4): a delivery van nosed into the side loading entrance at the corridor edge it
 *  faces (the sign of x), its tail out into the street. The vehicle builder draws it in a prop frame turned a
 *  quarter about the box centre (its long axis along x, the nose toward the edge); the dresser sees the obstacle in
 *  that frame too, so the dressing rules clamp to the same footprint. */
export function vanAcrossKit(c: KitCtx, ob: Obstacle): void {
  const b = ob.solids[0]?.box;
  if (!b) return;
  contact(c, b.x0, b.x1, b.s0, b.s1, b.y0 + 0.01, 0.7, 0.3);
  const sd = Math.sign(ob.x) || -1, cx = (b.x0 + b.x1) / 2, cs = (b.s0 + b.s1) / 2;
  const hw = (b.s1 - b.s0) / 2, hl = (b.x1 - b.x0) / 2;           // local half width (track s) and half length (x)
  // Local +s → the nose: yaw +90° maps local +s to −x, −90° to +x (Kit.frame).
  const K = c.K, real = DRESSER.ob!, d = DRESSER;
  const local: Obstacle = { ...real, edges: [], solids: real.solids.map((so) => ({ ...so, box: { ...so.box, x0: -hw, x1: hw, s0: -hl, s1: hl } })) };
  const keep = [d.fx0, d.fx1, d.fs0, d.fs1] as const;
  d.ob = local; d.fx0 = -hw; d.fx1 = hw; d.fs0 = -hl; d.fs1 = hl;
  K.frame(cx, 0, cs, sd < 0 ? Math.PI / 2 : -Math.PI / 2);
  drawVehicle(K, { ...hazardSpec(c, ob, -hw, hw, -hl, hl, b.y0, b.y1 - b.y0), nosedIn: false });
  K.frame(0, 0, 0);
  d.ob = real; [d.fx0, d.fx1, d.fs0, d.fs1] = keep;
}

// ── decor vehicles (kits/decor.ts parked_car_side) ─────────────────────────────────────────────────────────────
export interface CarSpec {
  x0: number; x1: number; s0: number; s1: number; y: number; h: number;
  body: number; accent: number; van?: boolean; hazard?: boolean; inverted?: boolean; rim?: number; glow?: number;
}
/** Decor cars parked beyond the verges: the vehicle builder with the given mid-value paint and a darker side, no
 *  stripe (a cream accent would read as the grind signature), unlit, no dressing. */
export function drawCar(k: Kit, c: CarSpec): void {
  drawVehicle(k, {
    body: c.van ? 'panel_van' : 'sedan', x0: c.x0, x1: c.x1, s0: c.s0, s1: c.s1, y: c.y, h: c.h,
    paint: c.body, side: shade(c.body, -0.32), stripe: -1, hazard: !!c.hazard, inverted: c.inverted, rim: c.rim, glow: c.glow,
  });
}
