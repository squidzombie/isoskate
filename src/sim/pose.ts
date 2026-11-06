// sim/pose.ts: deterministic visual targets for the current state (core/view.ts SkaterPose). The views smooth them.
// TODO(GP W1a): every PoseId (grab, sketchy, noseManual), per-grind body yaw for all 13 grinds, manual kinds.
import type { GrindId } from '../core/ids';
import { clamp } from '../core/math';
import { hash32 } from '../core/rng';
import type { SkaterPose } from '../core/view';
import { DT } from '../core/tuning';
import type { SimState } from './state';
import type { TrickTables } from '../core/tricks';
import { flipShown } from './air';

const DEG = Math.PI / 180;
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;

/** Body yaw (deg) per grind contact: slides sit across the edge, truck grinds along it. */
const GRIND_BODY_YAW: Partial<Record<GrindId, number>> = { boardslide: 90, lipslide: -90, noseslide: 90, tailslide: -90,
  bluntslide: 90, noseBluntslide: -90, feeble: 20, smith: -20, crooked: 15, overcrook: -15 };

export function poseOf(st: Readonly<SimState>, tables: TrickTables): SkaterPose {
  const c = st.cur, pv = st.prev;
  const heading = Math.atan2(c.vel.x, c.vel.s);
  const latAccel = (c.vel.x - pv.vel.x) / DT;
  let board = { roll: 0, yaw: 0, pitch: 0 };
  if (c.flip) {
    const def = tables.flips.find((d) => d.id === c.flip!.id);
    if (def) board = flipShown(c.flip.t, c.flip.dur, c.flip.t0, st.flipFrom, def.rot);
  }
  if (c.mode === 'manual') board.pitch = c.manual?.kind === 'noseManual' ? -12 : 12;
  const sd = c.spin && tables.spins.find((d) => d.id === c.spin!.id);
  const spinYaw = sd && c.spin ? sd.yaw * easeOutCubic(Math.min(1, c.spin.t / c.spin.dur)) : 0;
  const air = c.mode === 'air';
  const landing = c.tick - st.landTick < 6;
  let pose: SkaterPose['pose'];
  if (c.mode === 'crashed') pose = 'crash';
  else if (c.mode === 'grind') pose = 'grind';
  else if (c.mode === 'manual') pose = c.manual?.kind === 'noseManual' ? 'noseManual' : 'manual';
  else if (air) pose = c.flip && c.flip.t < c.flip.dur ? 'flip' : c.airT < 0.06 ? 'pop' : 'tuck';
  else if (c.wobble > 0.15) pose = 'sketchy';
  else if (landing) pose = 'land';
  else pose = Math.abs(latAccel) > 8 ? 'carve' : 'roll';
  return {
    mode: c.mode, pose,
    grindId: c.grind ? c.grind.id : null,
    manualKind: c.manual ? c.manual.kind : null,
    heading, lean: clamp(0.8 * heading, -25 * DEG, 25 * DEG), latAccel,
    crouch: air ? 0.6 : c.mode === 'grind' ? 0.45 : landing ? 0.5 : 0.2,
    board,
    bodyYaw: c.grind ? GRIND_BODY_YAW[c.grind.id] ?? 0 : 0,
    spinYaw, fakie: c.fakie,
    height: Math.max(0, c.p.y - c.groundY), airT: c.airT, wobble: clamp(c.wobble / 0.3, 0, 1),
    landImpulse: c.tick === st.landTick ? clamp(0.4 + st.landDrop / 2, 0, 1) : 0,
    crash: c.crash ? { t: (c.tick - c.crash.tick) * DT, seed: hash32(st.cfg.seed, c.crash.tick) } : null,
  };
}
