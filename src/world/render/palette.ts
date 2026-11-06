// world/render/palette.ts: the grey-box colours (DESIGN §22: palette presets live here). The readability colours
// (ink, cream grind edge, chevrons, coin gold) are part of the readability contract (DESIGN §18.4) and stay the same
// in every area; the ground and decor tints are the M0 stand-ins for the per-area presets.
// TODO(WA): the four area presets with the 8 s gateway blends (DESIGN §18.1) and GfxContext.palette() routing.
import type { Surface } from '../../core/ids';

export const COLORS = {
  asphalt: 0x79728a, verge: 0xcdb8a3, pit: 0x2f2742, water: 0x4f6a8f,
  /** Pit read (G0 review): the far wall catching the light, the floor shadow under the near lip. */
  pitWall: 0x6a5a8c, pitShadow: 0x1c1530,
  bump: 0xcfc3b8, lowLandable: 0xa99cc0, lowCrash: 0x2b2140, chevron: 0xf2b630, knock: 0xff8a5b,
  forbidden: 0xff00ff, tall: 0x2b2140, tallTop: 0x352a4c, tallAccent: 0xd9765a,
  edgeCream: 0xfff1d6, ink: 0x2b2140,
  /** DESIGN §18.1 / §18.8: coins are emissive #FFC94A (drawn unlit and not tone-mapped, so they stay gold). */
  coin: 0xffc94a,
  lampHead: 0xffd39a, pole: 0x4a3b6b, foliage: 0x7f9a5a,
  building: [0xd9765a, 0xc9a15a, 0xf3e3c3, 0x3e8e8a, 0xb5645a, 0xe8b38f, 0x9c7bb0, 0xc4473d],
  side: [0xb5645a, 0x3e8e8a, 0xc9a15a, 0x9c7bb0],
} as const;

/** Ground colours by surface (DESIGN §18.1). */
export const SURFACE_COLOR: Readonly<Record<Surface, number>> = {
  asphalt: 0x79728a, wetAsphalt: 0x352f55, concrete: 0xd9c3ae, tile: 0xd7c4b5, granite: 0xb9a9a0, wood: 0xa9744f,
  metal: 0x9ba3b5, grass: 0x9db36b,
};

/** Contact shadow colour (dark blob on light ground) and the cyan contact glow on dark ground (DESIGN §8). */
export const CONTACT = { shadowRgb: '43,33,64', glow: 0x3ff2ff } as const;
