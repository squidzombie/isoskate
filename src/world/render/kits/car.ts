// world/render/kits/car.ts: one low-poly car / van model (≤ ~220 triangles), parametric in length, width and height,
// drawn along +s with its rear (taillights) toward the camera. Used by parked_car, parked_van, crosswalk_car,
// backout_car and the parked_car_side decor. Hazard cars are dark (DESIGN §18.4: ink-dark body, one accent), with a
// slightly lighter roof so the volume reads; windows are dark glass that picks up the sky tint.
import { shade } from '../palette';
import { FACE, FX, type Kit } from '../writer';

export const CAR_BODIES = [0x1c1430, 0x141a2e, 0x1d1420, 0x122220, 0x221830, 0x17142a] as const;

export interface CarSpec {
  x0: number; x1: number; s0: number; s1: number; y: number; h: number;
  body: number; accent: number; van?: boolean; hazard?: boolean; inverted?: boolean; rim?: number; glow?: number;
}

export function drawCar(K: Kit, c: CarSpec): void {
  const { x0, x1, s0, s1, y, h } = c;
  const W = x1 - x0, L = s1 - s0, xm = (x0 + x1) / 2;
  const flags = c.hazard ? FX.noFog | FX.matte : 0;
  const wheelR = Math.min(0.33, h * 0.24), deck = y + wheelR * 1.25, belt = y + h * (c.van ? 0.5 : 0.58);
  // Wheels (4, dark), seen from the camera as dark blocks under the body.
  K.lit(0, 0, flags).col(0x171221);
  for (const ws of [s0 + L * 0.18, s1 - L * 0.2]) {
    K.hcyl('x', 0, y + wheelR, ws, x0 + 0.02, x0 + 0.24, wheelR, 7, true);
    K.hcyl('x', 0, y + wheelR, ws, x1 - 0.24, x1 - 0.02, wheelR, 7, true);
  }
  // Lower body with bumpers.
  const glow = c.glow ?? 0;
  K.lit(0, 0, flags, glow).col(c.body);
  K.chamfer(x0 + 0.03, deck - 0.12, s0 + 0.05, x1 - 0.03, belt, s1 - 0.05, 0.08, shade(c.body, 0.12));
  K.col(shade(c.body, -0.3)).box(x0 + 0.06, deck - 0.2, s0, x1 - 0.06, deck + 0.05, s0 + 0.06, FACE.top | FACE.front | FACE.left | FACE.right);
  K.box(x0 + 0.06, deck - 0.2, s1 - 0.06, x1 - 0.06, deck + 0.05, s1, FACE.top | FACE.back | FACE.left | FACE.right);
  // Accent stripe along the flanks and across the camera-facing rear.
  K.lit(0, 0, flags).col(c.accent);
  K.box(x0 + 0.02, belt - 0.16, s0 + 0.06, x0 + 0.035, belt - 0.1, s1 - 0.06, FACE.left);
  K.box(x1 - 0.035, belt - 0.16, s0 + 0.06, x1 - 0.02, belt - 0.1, s1 - 0.06, FACE.right);
  K.box(x0 + 0.1, belt - 0.16, s0 + 0.04, x1 - 0.1, belt - 0.1, s0 + 0.05, FACE.front);
  // Cabin: a tapered prism (glass sides) with a roof.
  const top = y + h, ri = c.van ? 0.08 : 0.16;
  const ca = c.van ? s0 + L * 0.05 : s0 + L * 0.24, cb = c.van ? s1 - L * 0.12 : s1 - L * 0.22;
  const ra = c.van ? ca + 0.05 : ca + L * 0.12, rb = c.van ? cb - 0.25 : cb - L * 0.1;
  const glass = c.hazard && !c.inverted ? 0x18142c : 0x3c3a62, roof = c.inverted ? shade(c.body, 0.15) : shade(c.body, 0.12);
  K.lit(0, 0, flags, glow * 0.5).col(glass);
  K.quad(x0 + 0.08, belt, ca, x1 - 0.08, belt, ca, x1 - 0.08 - ri, top - 0.04, ra, x0 + 0.08 + ri, top - 0.04, ra);    // rear window (camera)
  K.quad(x1 - 0.08, belt, cb, x0 + 0.08, belt, cb, x0 + 0.08 + ri, top - 0.04, rb, x1 - 0.08 - ri, top - 0.04, rb);    // windscreen
  K.quad(x1 - 0.08, belt, ca, x1 - 0.08, belt, cb, x1 - 0.08 - ri, top - 0.04, rb, x1 - 0.08 - ri, top - 0.04, ra);    // right side
  K.quad(x0 + 0.08, belt, cb, x0 + 0.08, belt, ca, x0 + 0.08 + ri, top - 0.04, ra, x0 + 0.08 + ri, top - 0.04, rb);    // left side
  K.lit(0, 0, flags, glow).col(roof).box(x0 + 0.06 + ri, top - 0.06, ra - 0.03, x1 - 0.06 - ri, top, rb + 0.03, FACE.top | FACE.front | FACE.back | FACE.left | FACE.right);
  // Pillars between the windows (body colour) so the cabin reads as a car, not a box.
  K.col(c.body);
  K.quad(xm - 0.05, belt, ca - 0.002, xm + 0.05, belt, ca - 0.002, xm + 0.05, top - 0.05, ra - 0.002, xm - 0.05, top - 0.05, ra - 0.002);
  // Taillights (emissive red) on the camera-facing rear; headlights at the far end.
  K.to('e').glowing(1.3, -1, FX.noFog).col(0xff5a3c);
  K.box(x0 + 0.08, belt - 0.2, s0 + 0.03, x0 + 0.26, belt - 0.14, s0 + 0.05, FACE.front);
  K.box(x1 - 0.26, belt - 0.2, s0 + 0.03, x1 - 0.08, belt - 0.14, s0 + 0.05, FACE.front);
  K.col(0xfff1c9).glowing(0.9, -1, FX.noFog);
  K.box(x0 + 0.1, belt - 0.24, s1 - 0.05, x0 + 0.34, belt - 0.14, s1 - 0.03, FACE.back);
  K.box(x1 - 0.34, belt - 0.24, s1 - 0.05, x1 - 0.1, belt - 0.14, s1 - 0.03, FACE.back);
  if (c.inverted && c.rim) {
    K.col(c.rim).glowing(1.6, -1, FX.noFog);
    K.box(x0 + 0.06 + ri, top - 0.012, ra - 0.03, x1 - 0.06 - ri, top + 0.006, ra, FACE.top | FACE.front);
    K.box(x0 + 0.03, belt - 0.02, s0 + 0.03, x1 - 0.03, belt + 0.008, s0 + 0.07, FACE.top | FACE.front);
  }
  K.to('o');
  void W;
}
