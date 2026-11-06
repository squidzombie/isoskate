// sim/kinematics.ts: time, the steering target and lateral motion (TECH §6.3 steps 1, 2 and 4; DESIGN §5.2, §5.3).
// Forward motion is closed-form: p.s = sAt(t), vel.s = speedAt(t) every tick (no drift). Laterally a P-controller
// toward targetX with the state's acceleration limit, plus the soft-wall spring. Nothing else adds lateral
// acceleration: the magnet and ground align move targetX (sim/magnet.ts).
import type { InputFrame } from '../core/input';
import { approach, clamp } from '../core/math';
import {
  A_LAT_AIR, A_LAT_GROUND, CORRIDOR_HALF, DT, SOFT_WALL_K, SOFT_WALL_X, STEER_GAIN, STEER_P, TARGET_X_MAX, V_LAT_MAX,
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

/** targetX += steerDx·gain + steerAxis·V_LAT_MAX·DT·gain, clamped. Returns the applied change (m). */
export function applySteer(k: Ctx, f: Readonly<InputFrame>): number {
  const c = k.st.cur;
  const gain = STEER_GAIN[c.mode];
  const before = c.targetX;
  c.targetX = clamp(c.targetX + (f.steerDx + f.steerAxis * V_LAT_MAX * DT) * gain, -TARGET_X_MAX, TARGET_X_MAX);
  return c.targetX - before;
}

/** Move targetX by dx (swipe cancel, magnet), clamped. */
export function nudgeTarget(k: Ctx, dx: number): void {
  const c = k.st.cur;
  c.targetX = clamp(c.targetX + dx, -TARGET_X_MAX, TARGET_X_MAX);
}

/** Lateral P-controller + soft walls (roll, manual, air). Grinds and crashes don't steer. */
export function lateral(k: Ctx): void {
  const c = k.st.cur;
  if (c.mode === 'grind' || c.mode === 'crashed') return;
  const a = c.mode === 'air' ? A_LAT_AIR : A_LAT_GROUND;
  const desired = clamp(STEER_P * (c.targetX - c.p.x), -V_LAT_MAX, V_LAT_MAX);
  c.vel.x = approach(c.vel.x, desired, a * DT);
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
