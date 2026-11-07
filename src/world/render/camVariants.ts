// world/render/camVariants.ts: the run camera spec. Production runs `P`, built from core/tuning.ts CAMERA (DESIGN §8,
// decision row 67): a telephoto perspective camera, pitch 34°, yaw 9° on every portrait screen rising linearly to
// 30° at aspect ≥ 1.25, window FOV 24°, the camera distance D solved per frame. Debug builds can pick another spec
// with `?debug=1&cam=<id>` at boot (platform/env.ts readFlags → game/wiring.ts), before any world material compiles;
// it stays fixed for the page:
//   A                    the pre-@cam production camera (ortho, pitch 35°, yaw 0° in portrait), for comparisons
//   o<pitch>y<yaw>       an ortho spec (the smallest ortho height H that fits the required region)
//   p<pitch>y<yaw>f<fov> a perspective spec, e.g. p35y0f22 (the prototype's E)
// Yaw is `yawMinDeg` up to aspect CAMERA.yawAspect0 and rises linearly to CAMERA.yawMaxDeg (30°) at aspect ≥ 1.25.
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
  P: v('P', `persp p${CAMERA.pitchDeg} y${CAMERA.yawMinDeg} fov${CAMERA.fovDeg} (production)`, CAMERA.proj, CAMERA.pitchDeg, CAMERA.yawMinDeg, CAMERA.fovDeg),
  A: v('A', 'ortho p35 y0 (before @cam)', 'ortho', 35, 0),
};
export const DEFAULT_CAM_VARIANT = CAM_VARIANTS.P!;

let active: CamVariant = DEFAULT_CAM_VARIANT;

/** Parses a table id or a custom spec (see the header); null when it is neither. */
export function parseCamVariant(spec: string): CamVariant | null {
  const t = CAM_VARIANTS[spec.toUpperCase()];
  if (t) return t;
  const m = /^([op])(\d+(?:\.\d+)?)y(\d+(?:\.\d+)?)(?:f(\d+(?:\.\d+)?))?$/i.exec(spec);
  if (!m) return null;
  const pitch = Number(m[2]), yaw = Number(m[3]), fov = m[4] ? Number(m[4]) : CAMERA.fovDeg;
  if (!(pitch >= 15 && pitch <= 60) || !(yaw >= 0 && yaw <= 30) || !(fov >= 8 && fov <= 60)) return null;
  const persp = m[1]!.toLowerCase() === 'p';
  return v(spec, persp ? `persp p${pitch} y${yaw} fov${fov}` : `ortho p${pitch} y${yaw}`, persp ? 'persp' : 'ortho', pitch, yaw, persp ? fov : 0);
}

/** Debug only (game/wiring.ts, `?debug=1&cam=`; tests): call before the world view and its materials are created. */
export function setCamVariant(spec: string | CamVariant): CamVariant | null {
  const c = typeof spec === 'string' ? parseCamVariant(spec) : spec;
  if (c) active = c;
  return c;
}
export const camVariant = (): CamVariant => active;
