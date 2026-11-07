// world/render/render.config.ts: world-art tunables (DESIGN §22: WA owns world/render; colours live in palette.ts).
import type { QualityTier } from '../../core/ids';

export const RENDER = {
  /** The grind signature (G1, DESIGN §18.4): every grindable edge's cream-chrome coping (the edge stripe, fx flag
   *  `grind`): a fixed self-lit sheen on all faces (the same in every palette), more on the top face (the polished
   *  coping catching the sky), and a glint band every glintPeriod m travelling along the street. `halfW` scales the
   *  stripe over its minimum on-screen width, `inkW` the ink underline's margin beside it (so the dark line reads on
   *  light sidewalks and pad tops at desktop scale too). */
  /** Overhead decor over the corridor (G1, owner playtest): lantern-string bulbs only beyond |x| ≥ bulbClearX (the
   *  corridor is ±4.5); the wire crossing it is thin and dark. */
  overhead: { bulbClearX: 4.6 },
  grind: { sheen: 0.6, topSheen: 0.4, glint: 0.85, glintPeriod: 8, glintSpeed: 2.2, glintSharp: 24, halfW: 1.25, inkW: 1.0 },
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
export const STREAM = { buildBudgetMs: 4, keepBehindM: 14, maxBehind: 3, rebuildFrac: 0.1, rebuildYawDeg: 1,
  /** Build work per frame for a chunk not on screen yet: the build pauses after the item that crosses it (ms from
   *  the frame start). */
  sliceMs: 1.5,
  /** Chunks' worth of pooled geometry made at boot: 1 behind + 3 ahead + maxBehind kept + 1 building + 3 cached. */
  poolChunks: 11 } as const;

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

/** The sun's shadow box (DESIGN §18.2): the receivers x ±halfX, s from the player − (halfS − centreAhead) to
 *  + (halfS + centreAhead), up to `height` m, fitted in light space. */
export const SHADOW_BOX = { halfX: 10, halfS: 20, centreAhead: 14, height: 3 } as const;

/** Crash grading (DESIGN §9 / §18.8): 40% desaturate, eased in, cleared on the next run. */
export const CRASH_LOOK = { desat: 0.4, easeIn: 0.15, flashSec: 0.6, outline: 0.04 } as const;

/** Contact shadow under the board (DESIGN §8): blob on light ground, additive cyan glow on dark ground. */
export const CONTACT_SHADOW = {
  size: [0.9, 1.1] as const, opacity: [0.6, 0.25] as const, glowOpacity: 0.5, glowGroundLum: 0.06, fadeHeight: 2,
} as const;
