// world/render/render.config.ts: world-art tunables (DESIGN §22: WA owns world/render; colours live in palette.ts).
import type { QualityTier } from '../../core/ids';

export const RENDER = {
  /** Direct-sun scale on hazard bodies (fx flag `matte`): a sun-lit ink front stays dark enough for the 2.5:1 gate
   *  (DESIGN §18.4) while the top, lit by the sky, still reads lighter than the front. */
  matte: 0.28,
  /** Haze over the far 30% of the frame (DESIGN §18.3: ≤ 35%); menus use distance haze (near → far, m). */
  hazeY0: 0.7, hazeMenuNear: 28, hazeMenuFar: 150, hazeMenuAmt: 0.85,
  /** Emissive scale: golden → blue hour (DESIGN §18.2 neon 1.5–2.5 rolls off under ACES; this scales the authored k). */
  emisMin: 0.55, emisMax: 1.0,
  /** Glow cards strength: golden → blue hour. */
  glowMin: 0.12, glowMax: 1.0,
  /** Ground pattern repeat, m (CHUNK_LEN is a multiple, TECH §8.2). */
  patternRepeat: 4,
} as const;

/** The chunk window (TECH §8.6): built ≥ 2 chunks before visible; a chunk whose drawn content (a long building, a
 *  skywalk) still reaches the screen is kept past the CHUNK_WINDOW until it does not (keepBehindM behind the player),
 *  and never more than maxBehind chunks back. Live chunks rebuild when the stripe width changes by rebuildFrac or the
 *  camera yaw (hazard pools follow it) by rebuildYawDeg. */
export const STREAM = { buildBudgetMs: 4, keepBehindM: 14, maxBehind: 3, rebuildFrac: 0.1, rebuildYawDeg: 1 } as const;

/** Per-tier world settings (TECH §8.9): glow cards per chunk, particle cap (vfx reads it), shadow map size. */
export const QUALITY: Readonly<Record<QualityTier, { glowCards: number; particles: number; shadow: number; dpr: number }>> = {
  low: { glowCards: 20, particles: 150, shadow: 0, dpr: 1.0 },
  med: { glowCards: 40, particles: 300, shadow: 1024, dpr: 1.5 },
  high: { glowCards: 40, particles: 300, shadow: 2048, dpr: 2.0 },
};

/** Auto-adjust (TECH §8.9): measures CPU work (sim + render submit) and missed vsyncs, never frame intervals alone. */
export const AUTO_QUALITY = {
  window: 180,                 // frames in the rolling window (3 s at 60 fps)
  dropP95Ms: 12,               // drop one tier: p95 work > 12 ms for the window …
  missFrac: 0.1, missP95Ms: 8, // … or > 10% missed vsyncs while p95 work > 8 ms
  missFactor: 1.5,             // a missed vsync: interval > 1.5 × the median interval
  raiseAfterS: 10, raiseP95Ms: 6,   // raise once per run after 10 s of p95 < 6 ms and no misses
} as const;

/** Camera effects (DESIGN §8 shake table; m and s). Grinding jitter is continuous while grinding. */
export const SHAKE = {
  crash: { amp: 0.25, dur: 0.35 },
  bigLanding: { amp: 0.06, dur: 0.12, minDrop: 1.0 },
  grindLock: { amp: 0.03, dur: 0.05 },
  grinding: 0.01,
  perfectPunch: { zoom: 0.02, dur: 0.15 },
} as const;

/** Crash grading (DESIGN §9 / §18.8): 40% desaturate, eased in, cleared on the next run. */
export const CRASH_LOOK = { desat: 0.4, easeIn: 0.15, flashSec: 0.6, outline: 0.04 } as const;

/** Contact shadow under the board (DESIGN §8): blob on light ground, additive cyan glow on dark ground. */
export const CONTACT_SHADOW = {
  size: [0.9, 1.1] as const, opacity: [0.6, 0.25] as const, glowOpacity: 0.5, glowGroundLum: 0.06, fadeHeight: 2,
} as const;
