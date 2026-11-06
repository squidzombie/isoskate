// gfx/palette.ts: the M0 palette constant (DESIGN §18.1 "Golden", Downtown). One sample for every area.
// TODO(WA): world/render/palette.ts presets for all four areas with the 8 s gateway blends; INT routes
// GfxContext.palette() to it at G1.
import type { PaletteSample } from '../core/view';

export const GOLDEN: Readonly<PaletteSample> = {
  zenith: 0x8e7cc3, mid: 0xf2a37b, horizon: 0xffd9a0, sun: 0xfff1c9, sunGlow: 0xffc27a, fog: 0xf4c49a,
  hemiSky: 0xffd7b0, hemiGround: 0x6b4e8c, sunColor: 0xffc48a, sunIntensity: 2.4, sunElevDeg: 22,
  exposure: 1.05, windowLit: 0.2, neonGlow: 0,
};
