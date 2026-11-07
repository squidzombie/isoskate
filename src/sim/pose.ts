// sim/pose.ts: deterministic visual targets for the current state (core/view.ts SkaterPose). The views smooth them.
// Pose ids (the sim never produces 'idle' or 'showcase': those are menu poses of the view):
//   crash · grind · manual / noseManual · air: grab (Indy held), flip (a flip rotating), pop (first 0.06 s), tuck ·
//   ground: sketchy (a wobble: sketchy landing, side bump, manual budget end, wall), land (the first ticks after a
//   touchdown), carve (|lateral accel| > 8 m/s²), roll.
// board: the flip rotation (continuous across upgrades and amends) plus the Hardflip's transient pitch arc, or the
// manual's ±12° pitch. spinYaw: the body spin while it rotates (continuous across the 180 → 360 upgrade), 0 once it
// has finished (a finished 180 hands over to `fakie`). fakie: the stance after a 180, kept a few ticks past the revert
// so the view sees the landing fakie and pivots (RULES.revertPoseTicks). bodyYaw: per grind (slides across the edge).
import type { GrindId } from '../core/ids';
import { clamp } from '../core/math';
import { hash32 } from '../core/rng';
import type { SkaterPose } from '../core/view';
import { DT } from '../core/tuning';
import { RULES } from '../tricks';
import type { SimState } from './state';
import type { TrickTables } from '../core/tricks';
import { flipShown, spinShown } from './air';

const DEG = Math.PI / 180;

/** Body yaw (deg) per grind: truck grinds ride along the edge, slides sit across it (DESIGN §6.2). */
export const GRIND_BODY_YAW: Readonly<Record<GrindId, number>> = {
  fiftyFifty: 0, fiveO: 0, nosegrind: 0, feeble: 20, smith: -20, crooked: 15, overcrook: -15,
  boardslide: 90, lipslide: -90, noseslide: 90, tailslide: -90, bluntslide: 90, noseBluntslide: -90,
};
/** Crouch (0..1) per pose. */
const CROUCH: Readonly<Record<SkaterPose['pose'], number>> = {
  roll: 0.2, carve: 0.3, pop: 0.35, tuck: 0.6, flip: 0.6, grab: 0.85, land: 0.5, manual: 0.3, noseManual: 0.3,
  grind: 0.45, sketchy: 0.4, crash: 0, idle: 0.1, showcase: 0.1,
};

export function poseOf(st: Readonly<SimState>, tables: TrickTables): SkaterPose {
  const c = st.cur, pv = st.prev;
  const heading = Math.atan2(c.vel.x, c.vel.s);
  const latAccel = (c.vel.x - pv.vel.x) / DT;
  let board = { roll: 0, yaw: 0, pitch: 0 };
  let flipping = false;
  if (c.flip) {
    const def = tables.flips.find((d) => d.id === c.flip!.id);
    if (def) {
      board = flipShown(c.flip.t, c.flip.dur, c.flip.t0, st.flipFrom, def.rot);
      flipping = c.flip.t < c.flip.dur - 1e-9;
      if (def.pitchArc && flipping) board.pitch += def.pitchArc * Math.sin(Math.PI * Math.min(1, c.flip.t / c.flip.dur));
    }
  }
  if (c.mode === 'manual') board.pitch = c.manual?.kind === 'noseManual' ? -12 : 12;
  const spinning = !!c.spin && c.spin.t < c.spin.dur - 1e-9;
  const spinYaw = spinning ? spinShown({ st: st as SimState, tables }, c.spin!.t) : 0;
  const air = c.mode === 'air';
  const landing = c.tick - st.landTick < RULES.landPoseTicks;
  let pose: SkaterPose['pose'];
  if (c.mode === 'crashed') pose = 'crash';
  else if (c.mode === 'grind') pose = 'grind';
  else if (c.mode === 'manual') pose = c.manual?.kind === 'noseManual' ? 'noseManual' : 'manual';
  else if (air) pose = c.grab ? 'grab' : flipping ? 'flip' : c.airT < 0.06 ? 'pop' : 'tuck';
  else if (c.wobble > 0.15) pose = 'sketchy';
  else if (landing) pose = 'land';
  else pose = Math.abs(latAccel) > 8 ? 'carve' : 'roll';
  const fakie = c.fakie || (st.revertTick >= 0 && c.tick - st.revertTick < RULES.revertPoseTicks && c.mode !== 'crashed');
  return {
    mode: c.mode, pose,
    grindId: c.grind ? c.grind.id : null,
    manualKind: c.manual ? c.manual.kind : null,
    heading, lean: clamp(0.8 * heading, -25 * DEG, 25 * DEG), latAccel,
    crouch: CROUCH[pose],
    board,
    bodyYaw: c.grind ? GRIND_BODY_YAW[c.grind.id] : 0,
    spinYaw, fakie,
    height: Math.max(0, c.p.y - (air ? st.shadowY : c.groundY)), airT: c.airT, wobble: clamp(c.wobble / 0.3, 0, 1),
    landImpulse: c.tick === st.landTick ? clamp(0.4 + st.landDrop / 2, 0, 1) : 0,
    crash: c.crash ? { t: (c.tick - c.crash.tick) * DT, seed: hash32(st.cfg.seed, c.crash.tick) } : null,
  };
}
