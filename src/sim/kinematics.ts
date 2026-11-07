// sim/kinematics.ts: time, the steering target and lateral motion (TECH §6.3 steps 1, 2 and 4; DESIGN §4.2, §5.2, §5.3).
// Forward motion is closed-form: p.s = sAt(t), vel.s = speedAt(t) every tick (no drift). Laterally a P-controller
// toward targetX with the state's acceleration limit, plus the soft-wall spring. Nothing else adds lateral
// acceleration: the magnet and ground align move targetX (sim/magnet.ts). Touch steering is direct (@steer): its target
// never leads the skater by more than STEER_LEAD_MAX; a thumb that outruns the skater drives it at up to
// STEER_FAST.vMax, and the release brake stops it as soon as that thumb stops or lifts (STEER_BRAKE). Keys, bots, the
// magnet and re-anchors never meet any of the three.
import type { InputFrame } from '../core/input';
import { approach, clamp } from '../core/math';
import {
  A_LAT_AIR, A_LAT_GROUND, CORRIDOR_HALF, DT, SOFT_WALL_K, SOFT_WALL_X, STEER_BRAKE, STEER_FAST, STEER_GAIN, STEER_LEAD_MAX, STEER_P,
  TARGET_X_MAX, V_LAT_MAX,
  sAt, speedAt,
} from '../core/tuning';
import type { Ctx, SteerExt } from './state';

export function advanceTime(k: Ctx): void {
  const c = k.st.cur;
  c.tick++;
  c.t = k.st.startT + c.tick * DT;
  c.vel.s = speedAt(c.t);
  c.p.s = sAt(c.t);
}

/** targetX += steerDx·gain + steerAxis·V_LAT_MAX·DT·gain, clamped. Touch steering (steerDx) never pushes targetX more
 *  than STEER_LEAD_MAX ahead of the skater in its direction, and never pulls back a target that was already further
 *  (the magnet or ground align moved it); then touchSteer (fast thumb, release brake). Returns the applied steering
 *  (m): the brake's drop of targetX is not steering (magnet cancel and steerNet count only the player's steering). */
export function applySteer(k: Ctx, f: Readonly<InputFrame>): number {
  const c = k.st.cur;
  const gain = STEER_GAIN[c.mode];
  const before = c.targetX;
  const sd = f.steerDx * gain;
  const dir = sd > 0 ? 1 : sd < 0 ? -1 : 0;
  let t = before + sd + f.steerAxis * V_LAT_MAX * DT * gain;
  let clipped = false;
  if (dir !== 0) {
    const lim = c.p.x + dir * STEER_LEAD_MAX;
    const cap = dir > 0 ? Math.max(before, lim) : Math.min(before, lim);
    if ((t - cap) * dir > 0) { t = cap; clipped = true; }
  }
  c.targetX = clamp(t, -TARGET_X_MAX, TARGET_X_MAX);
  const applied = c.targetX - before;
  if (gain > 0) touchSteer(k, sd, dir, clipped, f.steerAxis !== 0);
  return applied;
}

/** Direct touch steering (core/tuning.ts STEER_FAST, STEER_BRAKE; DESIGN §4.2, §5.2). A drag the lead cap held back
 *  (the thumb outran the skater) arms it in that direction: lateral() then runs the skater at up to STEER_FAST.vMax.
 *  When that thumb stops or lifts (its counted steering over the stop window nets < stopM in the armed direction),
 *  the release brake fires once: targetX drops to at most restLead ahead of the skater (or its stopping distance at
 *  the brake deceleration, if longer), plus what the magnet / ground align added since it armed, and lateral()
 *  decelerates at that rate until the skater stops or the thumb outruns it again. A key disarms it. */
function touchSteer(k: Ctx, sd: number, dir: number, clipped: boolean, key: boolean): void {
  const c = k.st.cur, s = k.st.steer, B = STEER_BRAKE;
  const moved = Math.abs(sd) < B.jitterM ? 0 : sd;   // a resting thumb's jitter is no motion
  const m = s.moved, g = s.gaps;
  m[3] = m[2]!; m[2] = m[1]!; m[1] = m[0]!; m[0] = moved;
  if (moved !== 0) {                                  // the empty ticks before this sample: the input's cadence
    g[3] = g[2]!; g[2] = g[1]!; g[1] = g[0]!; g[0] = s.idle < B.winMax ? s.idle : 0;
    s.idle = 0;
  } else if (s.idle < B.winMax && ++s.idle === B.winMax) g.fill(0);   // that long is a pause, not the cadence
  if (key) { s.armed = 0; s.brake = 0; return; }
  if (clipped) {
    if (s.armed !== dir) s.assist = 0;
    s.armed = dir; s.brake = 0;
  }
  const side = s.armed;
  if (side === 0) return;
  const win = Math.min(B.winMax, Math.max(2, 1 + Math.max(g[0]!, g[1]!, g[2]!, g[3]!)));
  let net = 0;
  for (let i = 0; i < win; i++) net += m[i]!;
  if (net * side >= B.stopM) return;
  s.armed = 0;
  if (c.mode === 'air' && c.magnetEdge !== null) return;    // the magnet is carrying the board onto an edge
  const v = c.vel.x;
  if (v * side <= 0) return;
  // The state's rate, or more when the skater is fast enough that it would otherwise travel further than `reach`.
  const aB = Math.max(c.mode === 'air' ? B.air : B.ground, (v * v) / (2 * B.reach));
  const keep = Math.max((v * v) / (2 * aB), Math.min((c.targetX - c.p.x) * side, B.restLead));
  const rest = c.p.x + side * (keep + s.assist);
  if ((c.targetX - rest) * side > 0) c.targetX = clamp(rest, -TARGET_X_MAX, TARGET_X_MAX);
  s.brake = aB;
}

/** What the magnet / ground align moved targetX by this tick (step 4): an armed release brake keeps the part that
 *  went its way, so it never pulls back an assist. */
export function noteAssist(k: Ctx, dx: number): void {
  const s = k.st.steer;
  if (s.armed !== 0 && dx * s.armed > 0) s.assist += dx * s.armed;
}

/** Move targetX by dx (swipe cancel, magnet), clamped. */
export function nudgeTarget(k: Ctx, dx: number): void {
  const c = k.st.cur;
  c.targetX = clamp(c.targetX + dx, -TARGET_X_MAX, TARGET_X_MAX);
}

/** Lateral P-controller + soft walls (roll, manual, air). Grinds and crashes don't steer. A thumb that outruns the
 *  skater (STEER_FAST) raises the speed limit to vMax, keeping the lead that commands it at V_LAT_MAX / STEER_P, and
 *  speeds up at its accel on the ground. While the release brake runs, slowing down uses the brake deceleration (never
 *  speeding up, never reversing). */
export function lateral(k: Ctx): void {
  const c = k.st.cur, s = k.st.steer;
  if (c.mode === 'grind' || c.mode === 'crashed') { resetSteer(s); return; }
  const air = c.mode === 'air';
  const fast = s.armed !== 0 && s.brake === 0 && c.magnetEdge === null;
  const vMax = fast ? STEER_FAST.vMax : V_LAT_MAX;
  const kP = fast ? STEER_P * (STEER_FAST.vMax / V_LAT_MAX) : STEER_P;
  let a = air ? A_LAT_AIR : A_LAT_GROUND;
  const desired = clamp(kP * (c.targetX - c.p.x), -vMax, vMax);
  const v = c.vel.x;
  if (fast && !air && desired * s.armed > 0 && desired * v >= v * v) a = Math.max(a, STEER_FAST.accel);
  if (s.brake > 0 && desired * v < v * v) c.vel.x = approach(v, desired * v > 0 ? desired : 0, Math.max(a, s.brake) * DT);
  else c.vel.x = approach(v, desired, a * DT);
  if (s.brake > 0 && Math.abs(c.vel.x) < 0.05) s.brake = 0;
  const over = Math.abs(c.p.x) - SOFT_WALL_X;
  if (over > 0) c.vel.x -= Math.sign(c.p.x) * SOFT_WALL_K * over * DT;
  c.p.x += c.vel.x * DT;
  if (c.p.x > CORRIDOR_HALF) { c.p.x = CORRIDOR_HALF; c.vel.x = Math.min(0, c.vel.x); }
  if (c.p.x < -CORRIDOR_HALF) { c.p.x = -CORRIDOR_HALF; c.vel.x = Math.max(0, c.vel.x); }
}

function resetSteer(s: SteerExt): void {
  s.armed = 0; s.brake = 0; s.idle = STEER_BRAKE.winMax; s.assist = 0; s.moved.fill(0); s.gaps.fill(0);
}

/** Per-tick countdowns. */
export function timers(k: Ctx): void {
  const c = k.st.cur;
  c.popBleed = Math.max(0, c.popBleed - DT);
  c.wobble = Math.max(0, c.wobble - DT);
  c.coyote = Math.max(0, c.coyote - DT);
  c.jumpBuffer = Math.max(0, c.jumpBuffer - DT);
}
