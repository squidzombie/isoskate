// core/tuning.ts: values from DESIGN §5, §6, §7, §8 and §10.6. Single source of truth (TECH §4.2).
// FROZEN CONTRACT: change only via docs/core-requests.md.
import { clamp, smoothstep } from './math';

export const SIM_HZ = 60, DT = 1 / 60;
export const V_START = 7.0, V_MAX = 10.5, RAMP_T0 = 20, RAMP_T1 = 150;

/** v(t) = 7 + 3.5·smoothstep(20, 150, t) (TECH §6.2). */
export function speedAt(t: number): number {
  return V_START + (V_MAX - V_START) * smoothstep(RAMP_T0, RAMP_T1, t);
}

const RAMP_LEN = RAMP_T1 - RAMP_T0;                                   // 130 s
const RAMP_GAIN = (V_MAX - V_START) * RAMP_LEN;                       // 455 m
const S_RAMP0 = V_START * RAMP_T0;                                    // sAt(20) = 140 m
const S_RAMP1 = V_START * RAMP_T1 + RAMP_GAIN / 2;                    // sAt(150) = 1277.5 m

/** Closed-form distance (TECH §6.2):
 *  s(t) = 7t (t ≤ 20); 7t + 455·(u³ − u⁴/2) with u = (t − 20)/130 (20 < t ≤ 150); 7t + 227.5 + 3.5·(t − 150) (t > 150). */
export function sAt(t: number): number {
  if (t <= RAMP_T0) return V_START * t;
  if (t <= RAMP_T1) {
    const u = (t - RAMP_T0) / RAMP_LEN;
    return V_START * t + RAMP_GAIN * (u * u * u - (u * u * u * u) / 2);
  }
  return V_START * t + RAMP_GAIN / 2 + (V_MAX - V_START) * (t - RAMP_T1);
}

/** Inverse of sAt: piecewise; Newton (≤ 6 iterations) on the middle piece. */
export function tAt(s: number): number {
  if (s <= S_RAMP0) return s / V_START;
  if (s >= S_RAMP1) return RAMP_T1 + (s - S_RAMP1) / V_MAX;
  // s(t) is convex on the ramp (speed rises), so Newton from the right of the root converges monotonically.
  let t = clamp(RAMP_T0 + (s - S_RAMP0) / V_START, RAMP_T0, RAMP_T1);
  for (let i = 0; i < 6; i++) {
    const f = sAt(t) - s;
    t = clamp(t - f / speedAt(t), RAMP_T0, RAMP_T1);
    if (Math.abs(f) < 1e-10) break;
  }
  return t;
}
export const SPEED_TIERS = [8.0, 9.0, 10.5] as const;   // tier 1/2/3 thresholds: events, HUD stamps, audio layer, speed lines
export const G = 22, V_POP = 6.6, T_AIR_FLAT = 0.6;
export const CORRIDOR_HALF = 4.5, SOFT_WALL_X = 4.2, SOFT_WALL_K = 60, TARGET_X_MAX = 4.3;
export const V_LAT_MAX = 5.5, A_LAT_GROUND = 40, A_LAT_AIR = 16, STEER_P = 10;
/** Touch steering (DESIGN §4.2, §5.2, row 72; owner playtest @steer: a quick slide or flick ran metres ahead of the
 *  skater, which kept sliding for up to 0.8 s after the thumb had stopped or lifted). Touch `steerDx` never puts targetX
 *  more than STEER_LEAD_MAX ahead of the skater in its direction (a thumb faster than the skater loses the excess, so
 *  the skater moves while the thumb moves) and never pulls back a target the magnet or ground align moved further. The
 *  cap is above V_LAT_MAX / STEER_P (0.55 m), so a drag still commands full lateral speed, and above every bot's lead
 *  (≤ 0.66 m measured), so no bot ever meets it. Keys (steerAxis) are never capped. Added @steer. */
export const STEER_LEAD_MAX = 0.8;
/** A thumb that outruns the skater (the cap held its target back) drives it faster than V_LAT_MAX, up to `vMax`, and
 *  speeds it up at `accel` on the ground (the air keeps A_LAT_AIR); while it does, the lead that commands full speed
 *  stays V_LAT_MAX / STEER_P (0.55 m), so the cap keeps 0.25 m of headroom for a tick or two without samples. It only
 *  raises capability (T_SHIFT and the validator assume 0.7·V_LAT_MAX) and never applies to keys, bots or while the
 *  air magnet holds an edge. Ends when the release brake fires. Added @steer (fix pass: quick slides went 0.45–1.1 m;
 *  now 0.6–1.8 m). */
export const STEER_FAST = { vMax: 7.0, accel: 80 } as const;
/** Release brake for touch steering (DESIGN §4.2, §5.2; added @steer). A drag that outran the skater (the cap held it
 *  back) arms it. When that thumb stops or lifts (its steering over the stop window nets < `stopM` in the armed
 *  direction, about 0.7 px; a tick's steering below `jitterM`, about 0.3 px, is a resting thumb's jitter and counts
 *  as none; the window is 2 ticks, or one more than the longest run of empty ticks between the thumb's last few
 *  samples, up to `winMax`, so a slow input rate is not read as a stop), targetX drops to at most `restLead` ahead of
 *  the skater (or its stopping distance at the brake deceleration, if longer) and the skater slows at
 *  max(`ground` / `air`, v²/(2·`reach`)) m/s² until it stops or the thumb drives it again: it stops within about
 *  0.35 m of where the thumb stopped (was 2.3–3.9 m). What the magnet or ground align added since it armed is kept.
 *  Bots never reach the cap, so they never arm it; keys never steer through steerDx. */
export const STEER_BRAKE = { stopM: 0.03, jitterM: 0.012, restLead: 0.2, ground: 66, air: 40, reach: 0.2, winMax: 4 } as const;
export const STEER_GAIN = { roll: 1.0, manual: 1.0, air: 1.0, grind: 0, crashed: 0 } as const;
export const HITBOX = { w: 0.40, l: 0.70, h: 1.50 } as const;
export const FACE_INSET = 0.08, STEP_UP = 0.18, PIT_FALL_EPS = 0.02;   // pit level = lip level (DESIGN §7)
export const HEIGHT = { bumpMax: 0.18, lowMax: 0.60, forbidMin: 0.61, forbidMax: 1.14, tallMin: 1.15,
  fullWidthMaxH: 0.50, fullWidthMaxL: 0.60, pitMaxSec: 0.35 } as const;
export const COYOTE = 0.08, JUMP_BUFFER = 0.15, POP_BLEED = 0.07, LATE_FLIP_CUTOFF = 0.15;
export const LAND = { snap: 0.80, sketchy: 0.55, sketchyFirstRuns: 0.40, perfectLast: 0.12,
  snapTime: 0.06, edgeNudge: 0.15, sketchyWobble: 0.3 } as const;
/** The magnet and ground align steer by moving targetX (never by adding acceleration). */
export const MAGNET = { range: 1.6, inner: 0.4, rateMax: 3.0, transferRange: 2.5, transferRate: 4.5,
  cancelDragM: 15 * 0.042 } as const;   // ≈ 15 px of opposite drag at default sensitivity, after consumed swipes
export const CAPTURE = { lat: 0.9, latPickOnly: 0.6, below: 0.30, above: 0.45, vyMax: 1.5, snapT: 0.08 } as const;
export const GROUND_ALIGN = { tMin: 0.2, tMax: 1.0, rateMax: 1.5 } as const;
export const GRIND = { pickBefore: 0.25, pickAfter: 0.12, perfectLock: 0.08, switchAfter: 0.25,
  maxSwitches: 2, endHopVy: 2.5 } as const;
export const MANUAL = { budgets: [3.0, 2.2, 1.6, 1.2], budgetFloor: 1.0, coast: 0.30,
  prePressMax: 0.30, prePressMin: 0.10 } as const;   // pre-press touch-down window before touchdown
export const GRAB = { minAirLeft: 0.25, releaseBefore: 0.12, maxDur: 1.0 } as const;
export const FLIP_UPGRADE_MAX_PROGRESS = 0.6, SPIN_UPGRADE_MAX_PROGRESS = 0.6, KEY_DIAG_AMEND = { ms: 80, maxProgress: 0.25 } as const;
export const SIDE_BUMP_V = 3.0, NEAR_MISS = { lat: 0.35, vert: 0.20 } as const;
export const LOOKAHEAD_MIN = 2.5, LOOKAHEAD_TARGET = 2.6, DECISION_MIN = 1.2, HAZARD_WARN_SEC = 1.6;
export const R_MIN: readonly { t: number; sec: number }[] =
  [{ t: 0, sec: 1.6 }, { t: 45, sec: 1.2 }, { t: 90, sec: 1.0 }, { t: 150, sec: 0.9 }];
export const SAFE_LATERAL_FRACTION = { ground: 0.70, air: 0.35 } as const;   // validator reach model
export const T_SHIFT = (dx: number) => 0.35 + Math.abs(dx) / (SAFE_LATERAL_FRACTION.ground * V_LAT_MAX);
export const VALIDATOR = { safeMargin: 0.10, dilateX: HITBOX.w / 2, dilateS: HITBOX.l / 2, exitBand: 2.0,
  deadEndMaxSec: 2.0, ollieWindowRequired: 0.25, ollieWindowOptional: 0.15, historyMinSec: 1.0,
  myopic: { lookSec: 1.5, reaction: 0.35, latFrac: 0.75 } } as const;
export const CAMERA = { pitchDeg: 35, yawMinDeg: 0, yawMaxDeg: 30, yawAspect0: 0.75, yawAspect1: 1.25,
  anchorFromTop: 0.74, hudPx: 56, marginX: 0.3, behind: 1.5, headroom: 0.8, zoomTau: 2.0,
  vertTau: 0.3, latFollow: 0.15, xrayCapY: 1.6, minEdgePx: 2.5, minCoinPx: 12 } as const;
  // hudTop is not a constant: hudTop = (viewport.safeTop + hudPx) / viewport.hCss (§8.3)
export const CHUNK_LEN = 32, GEN_AHEAD_SEC = 12, ORIGIN_REBASE = 512;
export const CHUNK_WINDOW = { behind: 1, ahead: 3 } as const;
export const ROLLOUT_SEC = 9, LESSON_SEC = 40;
/** DESIGN §12.1 area timeline (added @G1, MU request): the first visit lasts 40 s, every later one 35 s, each gateway
 *  4 s. world/gen/areas.ts re-exports them; meta reads them for the Results "next area" goal. */
export const FIRST_VISIT_SEC = 40, VISIT_SEC = 35, GATEWAY_SEC = 4;
export const REWIND = { sec: 1.5, max: 3, snapEveryTicks: 15, ring: 8 } as const;
// Sim tunables moved from sim/consts.ts (applied @G0, docs/core-requests.md M0-sim section).
export const ROLL_OFF_DROP = 0.05, STICKY_DROP = 0.3;                 // TECH §6.3 step 5 (roll-off, sticky slabs)
export const BUMP_WOBBLE = 0.3, MANUAL_END_WOBBLE = 0.3;              // s (side bump TECH §6.4, manual budget end)
export const COIN_VOLUME = { lat: 0.3, fwd: 0.4, vert: 0.7, centreUp: 0.75 } as const;   // DESIGN §10.8
export const COIN_CHAIN_TICKS = 30, PICK_MISS_TICKS = 3;
