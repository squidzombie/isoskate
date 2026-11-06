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
const POP = 3.4, POP_DUR = 0.06, LAND_DUR = 0.28;
const scratch = basePose();

/** The showcase pose at time t (seconds since showcase mode started); `prevT` detects the landing frame. */
export function showcasePose(t: number, prevT = t): { pose: SkaterPose; hop: number; landed: number; trick: string } {
  const L = SHOWCASE.loop, k = Math.floor(t / L), u = t - k * L, trick = TRICKS[((k % TRICKS.length) + TRICKS.length) % TRICKS.length]!;
  const p = Object.assign(scratch, basePose({ pose: 'showcase', crouch: 0.1 }));
  p.board = { roll: 0, yaw: 0, pitch: 0 };
  let hop = 0, landed = 0;
  const air = SHOWCASE.air, landT = POP + POP_DUR + air;
  if (u >= POP && u < POP + POP_DUR) { p.pose = 'pop'; p.mode = 'air'; }
  else if (u >= POP + POP_DUR && u < landT) {
    const a = (u - POP - POP_DUR) / air;
    hop = 4 * SHOWCASE.hop * a * (1 - a);
    p.mode = 'air'; p.airT = u - POP; p.height = hop;
    const fu = easeOut((u - POP - POP_DUR) / (air * 0.62));
    switch (trick) {
      case 'kickflip': p.pose = 'flip'; p.board = { roll: 360 * fu, yaw: 0, pitch: 0 }; break;
      case 'heelflip': p.pose = 'flip'; p.board = { roll: -360 * fu, yaw: 0, pitch: 0 }; break;
      case 'popShuvit': p.pose = 'flip'; p.board = { roll: 0, yaw: 180 * fu, pitch: 0 }; break;
      case 'bs180': p.pose = 'tuck'; p.spinYaw = 180 * fu; break;
      case 'indy': p.pose = a > 0.15 && a < 0.8 ? 'grab' : 'tuck'; break;
    }
    if (fu >= 1 && trick !== 'bs180') p.board = { roll: 0, yaw: 0, pitch: 0 };
  } else if (u >= landT && u < landT + LAND_DUR) {
    p.pose = 'land';
    if (trick === 'bs180') p.fakie = true;
    if (prevT - k * L < landT) landed = 1;
  } else if (trick === 'bs180' && u >= landT + LAND_DUR && u < landT + LAND_DUR + 0.6) {
    p.fakie = true;                                       // ride fakie a moment, then revert
  }
  return { pose: p, hop, landed, trick };
}
