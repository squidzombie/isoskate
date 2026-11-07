// world/render/camVariants.ts: debug-only run camera variants (prototype for the portrait "reads flat" problem,
// DESIGN §8 / §23 item 1). The production default is variant A (DESIGN §8 as written: ortho, pitch 35°, ψ = 0° in
// portrait rising to 30° at aspect ≥ 1.25). Another variant is chosen only by `?debug=1&cam=<id>` at boot
// (platform/env.ts readFlags → game/wiring.ts), before any world material compiles, and stays fixed for the page.
//
//   proj 'ortho'  the DESIGN §8 solver with this pitch and portrait yaw (smallest ortho height H)
//   proj 'persp'  a telephoto perspective camera on the same view direction, `D` metres from the skater's ground
//                 point, with an off-axis window (the skater's ground point stays at 74% from the top): the solver
//                 keeps the window's vertical tangent span at 2·tan(fov/2) and picks the smallest D that fits the
//                 required region (camera.ts solvePersp)
// Yaw is `yawMinDeg` up to aspect 0.75 and rises linearly to CAMERA.yawMaxDeg (30°) at aspect ≥ 1.25, as today.
// Custom specs for exploration: `o<pitch>y<yaw>` (ortho) and `p<pitch>y<yaw>f<fov>` (perspective), e.g. p35y0f24.
import { CAMERA } from '../../core/tuning';

export type CamProj = 'ortho' | 'persp';
export interface CamVariant {
  readonly id: string; readonly label: string; readonly proj: CamProj;
  readonly pitchDeg: number;
  /** Yaw at aspect ≤ CAMERA.yawAspect0 (every portrait phone). */
  readonly yawMinDeg: number;
  /** Perspective only: the window's vertical field of view (2·atan of half its tangent span), degrees. */
  readonly fovDeg: number;
}

const v = (id: string, label: string, proj: CamProj, pitchDeg: number, yawMinDeg: number, fovDeg = 0): CamVariant =>
  ({ id, label, proj, pitchDeg, yawMinDeg, fovDeg });

export const CAM_VARIANTS: Readonly<Record<string, CamVariant>> = {
  A: v('A', 'ortho p35 y0 (baseline)', 'ortho', CAMERA.pitchDeg, CAMERA.yawMinDeg),
  B: v('B', 'ortho p30 y8', 'ortho', 30, 8),
  C: v('C', 'ortho p35 y12', 'ortho', 35, 12),
  D: v('D', 'ortho p27 y0', 'ortho', 27, 0),
  E: v('E', 'persp p35 y0 fov22', 'persp', 35, 0, 22),
  F: v('F', 'persp p35 y6 fov22', 'persp', 35, 6, 22),
  G: v('G', 'persp p30 y0 fov22', 'persp', 30, 0, 22),
  H: v('H', 'persp p33 y0 fov30', 'persp', 33, 0, 30),
};
export const DEFAULT_CAM_VARIANT = CAM_VARIANTS.A!;

let active: CamVariant = DEFAULT_CAM_VARIANT;

/** Parses a table id or a custom spec (see the header); null when it is neither. */
export function parseCamVariant(spec: string): CamVariant | null {
  const t = CAM_VARIANTS[spec.toUpperCase()];
  if (t) return t;
  const m = /^([op])(\d+(?:\.\d+)?)y(\d+(?:\.\d+)?)(?:f(\d+(?:\.\d+)?))?$/i.exec(spec);
  if (!m) return null;
  const pitch = Number(m[2]), yaw = Number(m[3]), fov = m[4] ? Number(m[4]) : 24;
  if (!(pitch >= 15 && pitch <= 60) || !(yaw >= 0 && yaw <= 30) || !(fov >= 8 && fov <= 60)) return null;
  const persp = m[1]!.toLowerCase() === 'p';
  return v(spec, persp ? `persp p${pitch} y${yaw} fov${fov}` : `ortho p${pitch} y${yaw}`, persp ? 'persp' : 'ortho', pitch, yaw, persp ? fov : 0);
}

/** Debug only (game/wiring.ts, `?debug=1&cam=`): call before the world view and its materials are created. */
export function setCamVariant(spec: string | CamVariant): CamVariant | null {
  const c = typeof spec === 'string' ? parseCamVariant(spec) : spec;
  if (c) active = c;
  return c;
}
export const camVariant = (): CamVariant => active;
export const isDefaultCam = (): boolean => active === DEFAULT_CAM_VARIANT;
