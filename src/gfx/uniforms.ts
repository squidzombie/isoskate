// gfx/uniforms.ts (WA, W2a): uniforms shared by every world, vfx and skater material of one GfxContext.
// One object per context (DESIGN §18.8 "40% desaturate through a shared material uniform", TECH §8.6 `uDesat`):
// a material that wants to follow the crash grading puts `sharedUniforms(ctx).uDesat` (the same object, not a copy)
// into its uniforms. world/render drives the values every frame; nothing else writes them.
//   uDesat     0..1   crash desaturation (0.4 during the crash slow-mo), applied in output colour space
//   uTime      s      render time (sway, flicker, ripples), wraps every 600 s
//   uHaze*            haze colour (sRGB, linear-free mix in output space), strength, and where it starts
//   uRes       px     drawing-buffer size (screen-space haze, Bayer x-ray, sky glow band)
//   uEmis             emissive scale (neon, windows, rims: blue hour → 1.0)
//   uWindowLit 0..1   share of lit windows (golden 0.2 → blue hour 0.6)
//   uGlow      0..1   glow-card strength (neon glow toward blue hour)
//   uHideNear  0/1    unused since @cam (world/render/camera.ts RIG_UNIFORMS.uCut clips camera-side decor instead)
//   uWarn      0..1   the full-width hazard warning flash (chevrons)
//   uSky*             sky gradient (zenith, mid, horizon; linear) for puddles, water and shop glass
import type { IUniform } from 'three';
import { Color, Vector2 } from 'three';
import type { GfxContext } from '../core/view';

export interface SharedUniforms {
  uDesat: IUniform<number>;
  uTime: IUniform<number>;
  uHaze: IUniform<Color>;
  uHazeAmt: IUniform<number>;
  /** Screen-space mode: haze starts at this fraction of the frame height from the bottom (0.7 = the far 30%). */
  uHazeY0: IUniform<number>;
  /** 0 = screen-space haze (ortho run camera), 1 = distance haze (perspective menu cameras). */
  uHazeMode: IUniform<number>;
  uHazeNear: IUniform<number>;
  uHazeFar: IUniform<number>;
  uRes: IUniform<Vector2>;
  uEmis: IUniform<number>;
  uWindowLit: IUniform<number>;
  uGlow: IUniform<number>;
  uHideNear: IUniform<number>;
  /** 0..1 full-width hazard warning flash (chevrons, the holo gate's light bar; ≤ 2 Hz over 1.6 s, DESIGN §9). */
  uWarn: IUniform<number>;
  uSkyZenith: IUniform<Color>;
  uSkyMid: IUniform<Color>;
  uSkyHorizon: IUniform<Color>;
}

const PER_CTX = new WeakMap<GfxContext, SharedUniforms>();

/** The shared uniform object of a context (created on first use). Put its members into material uniforms by
 *  reference: `shader.uniforms.uDesat = sharedUniforms(ctx).uDesat`. */
export function sharedUniforms(ctx: GfxContext): SharedUniforms {
  let u = PER_CTX.get(ctx);
  if (!u) {
    u = {
      uDesat: { value: 0 }, uTime: { value: 0 },
      uHaze: { value: new Color(0xf4c49a) }, uHazeAmt: { value: 0.3 }, uHazeY0: { value: 0.7 },
      uHazeMode: { value: 0 }, uHazeNear: { value: 30 }, uHazeFar: { value: 140 },
      uRes: { value: new Vector2(390, 844) },
      uEmis: { value: 1 }, uWindowLit: { value: 0.2 }, uGlow: { value: 0 }, uHideNear: { value: 0 }, uWarn: { value: 0 },
      uSkyZenith: { value: new Color(0x8e7cc3) }, uSkyMid: { value: new Color(0xf2a37b) }, uSkyHorizon: { value: new Color(0xffd9a0) },
    };
    PER_CTX.set(ctx, u);
  }
  return u;
}

/** GLSL for the shared grading tail: haze (screen-space or by distance, skipped when `noFog`) then the crash
 *  desaturation. Expects `gl_FragColor` in output colour space and `vViewPosition` (view-space position, negated). */
export const GRADING_PARS = /* glsl */`
uniform float uDesat;
uniform vec3 uHaze;
uniform float uHazeAmt;
uniform float uHazeY0;
uniform float uHazeMode;
uniform float uHazeNear;
uniform float uHazeFar;
uniform vec2 uRes;
vec3 dlGrade(vec3 c, float noFog, float viewDist) {
  float sy = gl_FragCoord.y / max(1.0, uRes.y);
  float h = uHazeMode < 0.5 ? smoothstep(uHazeY0, 1.0, sy) : smoothstep(uHazeNear, uHazeFar, viewDist);
  c = mix(c, uHaze, uHazeAmt * h * (1.0 - noFog));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(c, vec3(l), uDesat);
}
`;
