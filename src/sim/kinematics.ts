// sim/kinematics.ts: time, the steering target and lateral motion (TECH §6.3 steps 1, 2 and 4; DESIGN §4.2, §5.2, §5.3).
// Forward motion is closed-form: p.s = sAt(t), vel.s = speedAt(t) every tick (no drift). Laterally a P-controller
// toward targetX with the state's acceleration limit, plus the soft-wall spring. Nothing else adds lateral
// acceleration: the magnet and ground align move targetX (sim/magnet.ts). Touch steering is direct (@steer): its target
// never leads the skater by more than STEER_LEAD_MAX, and the release brake stops a skater whose thumb outran it as
// soon as the thumb stops or lifts (STEER_BRAKE). Keys, bots, the magnet and re-anchors never meet either.
import type { InputFrame } from '../core/input';
import { approach, clamp } from '../core/math';
import {
  A_LAT_AIR, A_LAT_GROUND, CORRIDOR_HALF, DT, SOFT_WALL_K, SOFT_WALL_X, STEER_BRAKE, STEER_GAIN, STEER_LEAD_MAX, STEER_P,
  TARGET_X_MAX, V_LAT_MAX,
  sAt, speedAt,
} from '../core/tuning';
import type { Ctx } from './state';

export function advanceTime(k: Ctx): void {
  const c = k.st.cur;
  c.tick++;
  c.t = k.st.startT + c.tick * DT;
  c.vel.s = speedAt(c.t);
  c.p.s = sAt(c.t);
}

/** targetX += steerDx·gain + steerAxis·V_LAT_MAX·DT·gain, clamped. Touch steering (steerDx) never pushes targetX more
 *  than STEER_LEAD_MAX ahead of the skater in its direction, and never pulls back a target that was already further
 *  (the magnet or ground align moved it); then the release brake (STEER_BRAKE). Returns the applied steering (m): the
 *  brake's drop of targetX is not steering (magnet cancel and steerNet count only the player's steering). */
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
  if (gain > 0) releaseBrake(k, sd, dir, clipped || f.steerAxis !== 0);
  return applied;
}

/** The release brake (core/tuning.ts STEER_BRAKE, DESIGN §4.2): a drag that put targetX ≥ armLead ahead of the skater
 *  arms it; when that thumb stops or lifts (net steering over this tick and the last < stopM in the armed direction:
 *  one tick without samples is not a stop), targetX drops to at most restLead ahead of the skater (or its stopping
 *  distance at the brake deceleration, if longer) and lateral() decelerates at that rate until the skater stops or
 *  the thumb drives it again (a key, or a drag that outruns it). */
function releaseBrake(k: Ctx, sd: number, dir: number, steering: boolean): void {
  const c = k.st.cur, s = k.st.steer, B = STEER_BRAKE;
  const moved = Math.abs(sd) < B.jitterM ? 0 : sd;   // a resting thumb's jitter is no motion
  const net = moved + s.prevSd;                       // nor is one tick without samples: two ticks decide
  s.prevSd = moved;
  if (steering) s.braking = false;
  if (dir !== 0 && (c.targetX - c.p.x) * dir >= B.armLead) { s.armed = dir; s.braking = false; }
  const side = s.armed;
  if (side === 0 || net * side >= B.stopM) return;
  s.armed = 0;
  if (c.mode === 'air' && c.magnetEdge !== null) return;    // the magnet is carrying the board onto an edge
  const v = c.vel.x;
  if (v * side <= 0) return;
  const aB = c.mode === 'air' ? B.air : B.ground;
  const keep = Math.max((v * v) / (2 * aB), Math.min((c.targetX - c.p.x) * side, B.restLead));
  const rest = c.p.x + side * keep;
  if ((c.targetX - rest) * side > 0) c.targetX = clamp(rest, -TARGET_X_MAX, TARGET_X_MAX);
  s.braking = true;
}

/** Move targetX by dx (swipe cancel, magnet), clamped. */
export function nudgeTarget(k: Ctx, dx: number): void {
  const c = k.st.cur;
  c.targetX = clamp(c.targetX + dx, -TARGET_X_MAX, TARGET_X_MAX);
}

/** Lateral P-controller + soft walls (roll, manual, air). Grinds and crashes don't steer. While the release brake runs,
 *  slowing down uses the brake deceleration (never speeding up, never reversing). */
export function lateral(k: Ctx): void {
  const c = k.st.cur, s = k.st.steer;
  if (c.mode === 'grind' || c.mode === 'crashed') { s.armed = 0; s.braking = false; s.prevSd = 0; return; }
  const a = c.mode === 'air' ? A_LAT_AIR : A_LAT_GROUND;
  const desired = clamp(STEER_P * (c.targetX - c.p.x), -V_LAT_MAX, V_LAT_MAX);
  const v = c.vel.x;
  if (s.braking && desired * v < v * v) {
    const aB = Math.max(a, c.mode === 'air' ? STEER_BRAKE.air : STEER_BRAKE.ground);
    c.vel.x = approach(v, desired * v > 0 ? desired : 0, aB * DT);
  } else c.vel.x = approach(v, desired, a * DT);
  if (s.braking && Math.abs(c.vel.x) < 0.05) s.braking = false;
  const over = Math.abs(c.p.x) - SOFT_WALL_X;
  if (over > 0) c.vel.x -= Math.sign(c.p.x) * SOFT_WALL_K * over * DT;
  c.p.x += c.vel.x * DT;
  if (c.p.x > CORRIDOR_HALF) { c.p.x = CORRIDOR_HALF; c.vel.x = Math.min(0, c.vel.x); }
  if (c.p.x < -CORRIDOR_HALF) { c.p.x = -CORRIDOR_HALF; c.vel.x = Math.max(0, c.vel.x); }
}

/** Per-tick countdowns. */
export function timers(k: Ctx): void {
  const c = k.st.cur;
  c.popBleed = Math.max(0, c.popBleed - DT);
  c.wobble = Math.max(0, c.wobble - DT);
  c.coyote = Math.max(0, c.coyote - DT);
  c.jumpBuffer = Math.max(0, c.jumpBuffer - DT);
}
