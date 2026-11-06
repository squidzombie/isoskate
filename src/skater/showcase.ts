// skater/showcase.ts: the Locker / Shop turntable loop (TECH §8.5): a slow idle, then every SHOWCASE.loop seconds a
// small trick preview (kickflip, pop shove-it, heelflip, BS 180, Indy grab), driven through the same rig as a run
// by synthetic SkaterPose targets. Pure: a function of the showcase clock.
import type { SkaterPose } from '../core/view';
import { SHOWCASE } from './skater.config';

const easeOut = (u: number) => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;

/** A neutral pose to start from (also used by the contact sheets). */
export function basePose(over: Partial<SkaterPose> = {}): SkaterPose {
  return {
    mode: 'roll', pose: 'roll', grindId: null, manualKind: null, heading: 0, lean: 0, latAccel: 0, crouch: 0.2,
    board: { roll: 0, yaw: 0, pitch: 0 }, bodyYaw: 0, spinYaw: 0, fakie: false, height: 0, airT: 0, wobble: 0,
    landImpulse: 0, crash: null, ...over,
  };
}

const TRICKS = ['kickflip', 'popShuvit', 'heelflip', 'bs180', 'indy'] as const;
const scratch = basePose();
const result = { pose: scratch, hop: 0, landed: 0, trick: TRICKS[0] as string };

/** Resets the shared scratch pose in place (no allocation per frame). */
function reset(p: SkaterPose): void {
  p.mode = 'roll'; p.pose = 'showcase'; p.grindId = null; p.manualKind = null; p.heading = 0; p.lean = 0; p.latAccel = 0;
  p.crouch = 0.1; p.board.roll = 0; p.board.yaw = 0; p.board.pitch = 0; p.bodyYaw = 0; p.spinYaw = 0; p.fakie = false;
  p.height = 0; p.airT = 0; p.wobble = 0; p.landImpulse = 0; p.crash = null;
}

/** The showcase pose at time t (seconds since showcase mode started); `prevT` detects the landing frame. The result
 *  (and its pose) is a shared scratch object, valid until the next call. */
export function showcasePose(t: number, prevT = t): { pose: SkaterPose; hop: number; landed: number; trick: string } {
  const S = SHOWCASE, L = S.loop, k = Math.floor(t / L), u = t - k * L, trick = TRICKS[((k % TRICKS.length) + TRICKS.length) % TRICKS.length]!;
  const p = scratch;
  reset(p);
  let hop = 0, landed = 0;
  const POP = S.popAt, air = S.air, landT = POP + S.popDur + air;
  if (u >= POP && u < POP + S.popDur) { p.pose = 'pop'; p.mode = 'air'; }
  else if (u >= POP + S.popDur && u < landT) {
    const a = (u - POP - S.popDur) / air;
    hop = 4 * S.hop * a * (1 - a);
    p.mode = 'air'; p.airT = u - POP; p.height = hop;
    const fu = easeOut((u - POP - S.popDur) / (air * 0.62));
    switch (trick) {
      case 'kickflip': p.pose = 'flip'; p.board.roll = 360 * fu; break;
      case 'heelflip': p.pose = 'flip'; p.board.roll = -360 * fu; break;
      case 'popShuvit': p.pose = 'flip'; p.board.yaw = 180 * fu; break;
      case 'bs180': p.pose = 'tuck'; p.spinYaw = 180 * fu; break;
      case 'indy': p.pose = a > 0.15 && a < 0.8 ? 'grab' : 'tuck'; break;
    }
    if (fu >= 1 && trick !== 'bs180') { p.board.roll = 0; p.board.yaw = 0; }
  } else if (u >= landT && u < landT + S.landDur) {
    p.pose = 'land';
    if (trick === 'bs180') p.fakie = true;
    if (prevT - k * L < landT) landed = 1;
  } else if (trick === 'bs180' && u >= landT + S.landDur && u < landT + S.landDur + S.fakieHold) {
    p.fakie = true;                                       // ride fakie a moment, then revert
  }
  result.hop = hop; result.landed = landed; result.trick = trick;
  return result;
}
