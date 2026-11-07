// vfx/vfx.config.ts: VFX tunables (DESIGN §9, §18.8). Colours are sRGB hex.
export const VFX = {
  cap: { low: 150, med: 300, high: 300 },
  sparks: { rate: 40, life: [0.25, 0.45] as const, speed: [2, 4] as const, gravity: 9.8, metal: [0xffe7a3, 0xff8a3d] as const, neon: [0x7ff8ff, 0x3ff2ff] as const },
  dust: { ledgeRate: 12, woodRate: 8, ledge: 0xd9c3ae, wood: 0xc89b6d },
  land: { puffs: 10, r0: 0.2, r1: 0.7, life: 0.35, alpha: 0.6 },
  pop: { puffs: 6, life: 0.3, alpha: 0.45 },
  perfectRing: { life: 0.25, r0: 0.3, r1: 1.0, color: 0xffc94a },
  coin: { stars: 6, life: 0.4, speed: 2.4, color: 0xffe27a },
  crashStars: { n: 5, life: 1.1, r: 0.32, color: 0xfff1c9 },
  // (G1: peach, not the grind cream #FFF1D6, which only grindable edges use, DESIGN §18.4)
  speedLines: { from: 9.0, alpha: 0.15, rate: 18, len: [2.5, 5] as const, color: 0xffd2b0, xMin: 4.7, xMax: 7.5 },
  // RECLAIM (theme §4): leaves mix fresh green and russet, never gold (gold is the coins').
  ambient: { rate: 6, petal: 0xffb7d0, leaf: [0xa8c66c, 0xb86a3e, 0x8fa85a] as const },
  /** RECLAIM critters (theme §4, §11; vfx/critters.ts): ≤ 30 alive besides perched birds; birds take off when the
   *  skater passes under them or a landing is within `birdLand` m; drips ≤ 40 alive (particle pool). Colours never
   *  yellow, gold or white; perched birds no lighter than #A6A3A8. */
  critters: {
    cap: 30, birdLand: 6, birdPass: 1.5,
    bird: { size: [0.28, 0.34, 0.42] as const, color: [0x8a7a6a, 0x8e8c98, 0xa6a3a8] as const },
    butterfly: [0xb79ad8, 0x9db4c8] as const, seed: 0xa39a8e, seedAlpha: 0.35, moth: 0x9c94b0, dragonfly: 0x4e8a96,
    drip: 0xa8c0e8, ripple: 0xc8d4f0, dripsMax: 40,
  },
  bankArc: { r: 0.62, width: 0.07, segments: 40, cream: 0xfff1d6, coral: 0xff5e6c, pulseLast: 0.25 },
  /** Upper two-thirds of the screen is the look-ahead zone: VFX there stay ≤ 25% alpha (DESIGN §18.4). */
  lookAheadAlpha: 0.25,
} as const;
