// world/render/palette.ts: every colour the world is drawn with (DESIGN §22: palette presets live here).
//   - PRESETS: the four time-of-day presets (DESIGN §18.1), tied to the areas; `samplePalette` blends two of them over
//     the 8 s gateway window (smoothstep on AreaBlend.u). GfxContext.palette() is routed here (gfx setPaletteSource).
//   - COLORS: the readability contract (DESIGN §18.4): ink, the cream grind edge over its ink underline, safety
//     chevrons, coin gold, pits. These never change with the area.
//   - HAZARD: hazard bodies per area: ink with one saturated accent (Downtown, Suburbs, Docks), the inverted Neon body
//     #7A6FB0 with an emissive magenta / lantern-red rim. The values are tuned against the measured contrast gate
//     (shots --contrast, the gallery), which is the source of truth (DESIGN §18.4).
//   - ACCENTS, SURFACE_COLOR, LOOK: area kit colours (DESIGN §18.1 tables).
// All values are sRGB hex. Vertex colours are converted to linear when written (writer.ts).
import type { AreaId, Surface } from '../../core/ids';
import type { PaletteSample } from '../../core/view';
import type { AreaBlend } from '../../core/world';

/** DESIGN §18.1 presets. windowLit 0.2 at golden → 0.6 at blue hour; neonGlow 0 → 1 toward blue hour. */
export const PRESETS: Readonly<Record<AreaId, Readonly<PaletteSample>>> = {
  downtown: {   // Golden
    zenith: 0x8e7cc3, mid: 0xf2a37b, horizon: 0xffd9a0, sun: 0xfff1c9, sunGlow: 0xffc27a, fog: 0xf4c49a,
    hemiSky: 0xffd7b0, hemiGround: 0x6b4e8c, sunColor: 0xffc48a, sunIntensity: 2.4, sunElevDeg: 22,
    exposure: 1.05, windowLit: 0.2, neonGlow: 0,
  },
  suburbs: {    // Late gold
    zenith: 0x7b8cc8, mid: 0xf5b08a, horizon: 0xffe2ae, sun: 0xfff6d8, sunGlow: 0xffd08a, fog: 0xf2cda6,
    hemiSky: 0xffe0bc, hemiGround: 0x6e5a93, sunColor: 0xffd09a, sunIntensity: 2.3, sunElevDeg: 26,
    exposure: 1.0, windowLit: 0.25, neonGlow: 0,
  },
  docks: {      // Sunset
    zenith: 0x5e5a9e, mid: 0xe8826e, horizon: 0xffb07a, sun: 0xffe0b0, sunGlow: 0xff9466, fog: 0xd99a86,
    hemiSky: 0xf7b79a, hemiGround: 0x5a3f7e, sunColor: 0xff9e6e, sunIntensity: 2.0, sunElevDeg: 12,
    exposure: 1.05, windowLit: 0.38, neonGlow: 0.15,
  },
  neon: {       // Blue hour: the sun has set (the "disc" is the horizon colour with no glow); moon fill
    zenith: 0x1e2350, mid: 0x4b3f86, horizon: 0xc9729a, sun: 0xc9729a, sunGlow: 0x4b3f86, fog: 0x3a3466,
    hemiSky: 0xa69cd8, hemiGround: 0x3b2a5c, sunColor: 0x9aa8ff, sunIntensity: 0.6, sunElevDeg: 30,
    exposure: 1.2, windowLit: 0.6, neonGlow: 1,
  },
};

/** Per-preset extras the PaletteSample does not carry. haze: strength of the far-30% haze (≤ 0.35, DESIGN §18.3). */
/** hemiK / sunK scale the preset light intensities (sun stripes vs the sky fill). Bounded by the gate: shadowed
 *  asphalt must stay ≥ ~0.11 relative luminance so a near-black hazard in a building's shadow still reaches 2.5:1,
 *  sun-lit asphalt ≤ ~0.31 so a cream-topped rail still does (DESIGN §18.4). */
export interface AreaLook { haze: number; skyGlow: number; road: number; sunDisc: number; hemiK: number; sunK: number }
export const LOOK: Readonly<Record<AreaId, Readonly<AreaLook>>> = {
  downtown: { haze: 0.3, skyGlow: 0.25, road: 0x7f7890, sunDisc: 1, hemiK: 1.0, sunK: 1.1 },
  suburbs: { haze: 0.28, skyGlow: 0.25, road: 0x777087, sunDisc: 1, hemiK: 1.1, sunK: 0.96 },
  docks: { haze: 0.32, skyGlow: 0.25, road: 0x857c92, sunDisc: 1, hemiK: 1.0, sunK: 1.1 },
  neon: { haze: 0.35, skyGlow: 0.25, road: 0x352f55, sunDisc: 0, hemiK: 1.0, sunK: 1.0 },
};

/** Readability colours (DESIGN §18.4). Kept for every area. */
export const COLORS = {
  asphalt: 0x7f7890, verge: 0xcdb8a3, pit: 0x2f2742, water: 0x4f6a8f,
  /** Pit read (G0 review): the far wall catching the light, the floor shadow under the near lip, the lit lip. */
  pitWall: 0x6a5a8c, pitShadow: 0x1c1530, pitFloor: 0x251d38, pitLip: 0xb7a6c9,
  bump: 0xcfc3b8, lowLandable: 0xa99cc0, lowCrash: 0x2b2140, chevron: 0xf2b630, knock: 0xff8a5b,
  forbidden: 0xff00ff, tall: 0x2b2140, tallTop: 0x352a4c, tallAccent: 0xd9765a,
  edgeCream: 0xfff1d6, ink: 0x2b2140,
  /** DESIGN §18.1 / §18.8: coins are emissive #FFC94A (drawn unlit and not tone-mapped, so they stay gold). */
  coin: 0xffc94a,
  lampHead: 0xffd39a, pole: 0x4a3b6b, foliage: 0x7f9a5a,
  building: [0xd9765a, 0xc9a15a, 0xf3e3c3, 0x3e8e8a, 0xb5645a, 0xe8b38f, 0x9c7bb0, 0xc4473d],
  side: [0xb5645a, 0x3e8e8a, 0xc9a15a, 0x9c7bb0],
  /** Coral crash outline flash (DESIGN §9) and the bank-timer arc ends (DESIGN §18.8). */
  coral: 0xff5e6c, cream: 0xfff1d6, paper: 0xfff4e3,
} as const;

/** Hazard looks per area (DESIGN §18.4): `body` the crash-hazard body, `top` its slightly lighter top (tall props read
 *  as volumes), `accent` the one saturated accent. Neon inverts: a mid-value body with an emissive rim. Tuned against
 *  the measured gate (shots --contrast and the gallery), which is the source of truth. */
export interface HazardLook { body: number; top: number; accent: number; accent2: number; rim: number; rimEmissive: number; inverted: boolean;
  /** Emissive add on the body (Neon: the inverted body glows softly so it stays mid-value under the moon fill). */
  glow: number }
// Ink bodies sit at ~#160F22 (a sun-lit or shadowed ink face must stay ≤ 2.5× darker than asphalt in a building's
// shadow), tops one step lighter, accents thin: the gate leaves ~8–12% of a silhouette for anything lighter.
export const HAZARD: Readonly<Record<AreaId, Readonly<HazardLook>>> = {
  downtown: { body: 0x170f24, top: 0x2c2240, accent: 0xd9765a, accent2: 0x3e8e8a, rim: 0, rimEmissive: 0, inverted: false, glow: 0 },
  suburbs: { body: 0x170f24, top: 0x2c2240, accent: 0x8fb8de, accent2: 0xb5645a, rim: 0, rimEmissive: 0, inverted: false, glow: 0 },
  docks: { body: 0x170f24, top: 0x2c2240, accent: 0xf2b630, accent2: 0xb5552f, rim: 0, rimEmissive: 0, inverted: false, glow: 0 },
  neon: { body: 0x7a6fb0, top: 0x9489c8, accent: 0xff3fa4, accent2: 0xff5a3c, rim: 0xff3fa4, rimEmissive: 1.2, inverted: true, glow: 1.6 },
};

/** Area accents (DESIGN §18.1). Index order is the one DECOR_KINDS `color` params use. */
export const ACCENTS: Readonly<Record<AreaId, readonly number[]>> = {
  downtown: [0xd9765a, 0x3e8e8a, 0xf3e3c3, 0xc9a15a, 0xc4473d],
  suburbs: [0x9ccfb3, 0xf4d58d, 0x8fb8de, 0xf7efe3, 0xb5645a],
  docks: [0xb5552f, 0x2f5d7c, 0xe6ad3a, 0x5e8c6a, 0x8a8fa0, 0x4f6a8f],   // decor safety yellow stays off the chevron amber #F2B630
  neon: [0xff3fa4, 0x3ff2ff, 0xff5a3c, 0xffd39a, 0x8a5cff, 0xffb7d0],
};

/** Ground colours by surface (DESIGN §18.1). */
export const SURFACE_COLOR: Readonly<Record<Surface, number>> = {
  asphalt: 0x7f7890, wetAsphalt: 0x352f55, concrete: 0xd9c3ae, tile: 0xd7c4b5, granite: 0xb9a9a0, wood: 0xa9744f,
  metal: 0x9ba3b5, grass: 0x9db36b,
};
/** Neon surfaces: the tiled sidewalk reads darker and cooler at blue hour (it is lit by the moon fill only). */
export const NEON_SURFACE: Readonly<Partial<Record<Surface, number>>> = { tile: 0x4f4972, concrete: 0x504a72, granite: 0x56507a, asphalt: 0x352f55 };

/** Contact shadow colour (dark blob on light ground) and the cyan contact glow on dark ground (DESIGN §8). */
export const CONTACT = { shadowRgb: '43,33,64', glow: 0x3ff2ff } as const;

// ── blending ────────────────────────────────────────────────────────────────────────────────────────────────────
const KEYS = ['zenith', 'mid', 'horizon', 'sun', 'sunGlow', 'fog', 'hemiSky', 'hemiGround', 'sunColor'] as const;
const NUMS = ['sunIntensity', 'sunElevDeg', 'exposure', 'windowLit', 'neonGlow'] as const;

/** Per-channel sRGB lerp of two hex colours. */
export function mixHex(a: number, b: number, u: number): number {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) + ((((b >> sh) & 255) - ((a >> sh) & 255)) * u));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
/** Lighten (k > 0) toward white or darken (k < 0) toward black, per channel. */
export function shade(hex: number, k: number): number { return k >= 0 ? mixHex(hex, 0xffffff, k) : mixHex(hex, 0x000000, -k); }

/** The blend weight of the `to` preset: smoothstep over the 8 s window (DESIGN §18.1). */
export const blendWeight = (b: AreaBlend | null): number => {
  if (!b) return 0;
  const u = b.u < 0 ? 0 : b.u > 1 ? 1 : b.u;
  return u * u * (3 - 2 * u);
};

/** Palette at (area, blend): the area preset, or the gateway blend between two presets. Writes into `out` (the
 *  module's own sample by default: read it, don't keep it). */
const SAMPLE: PaletteSample = { ...PRESETS.downtown };
export function samplePalette(area: AreaId, blend: AreaBlend | null, out: PaletteSample = SAMPLE): PaletteSample {
  if (!blend || blend.from === blend.to) { Object.assign(out, PRESETS[blend?.to ?? area]); return out; }
  const a = PRESETS[blend.from], b = PRESETS[blend.to], u = blendWeight(blend);
  for (const k of KEYS) out[k] = mixHex(a[k], b[k], u);
  for (const k of NUMS) out[k] = a[k] + (b[k] - a[k]) * u;
  return out;
}
/** The AreaLook extras at (area, blend). */
const LOOK_OUT: AreaLook = { ...LOOK.downtown };
export function sampleLook(area: AreaId, blend: AreaBlend | null, out: AreaLook = LOOK_OUT): AreaLook {
  if (!blend || blend.from === blend.to) { Object.assign(out, LOOK[blend?.to ?? area]); return out; }
  const a = LOOK[blend.from], b = LOOK[blend.to], u = blendWeight(blend);
  out.haze = a.haze + (b.haze - a.haze) * u; out.skyGlow = a.skyGlow + (b.skyGlow - a.skyGlow) * u;
  out.road = mixHex(a.road, b.road, u); out.sunDisc = a.sunDisc + (b.sunDisc - a.sunDisc) * u;
  out.hemiK = a.hemiK + (b.hemiK - a.hemiK) * u; out.sunK = a.sunK + (b.sunK - a.sunK) * u;
  return out;
}
