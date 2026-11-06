// skater/poses.ts: pose targets (DESIGN §18.5). A pure function of the sim's SkaterPose: every PoseId, GrindId and
// ManualId resolves to a named table entry, so the view never has an undefined pose (tests/unit/skater/poses.test).
//
// Targets are authored for regular stance in "semantic" body terms (toward the toes, toward the nose, front arm,
// back arm); the animator mirrors them for goofy. Angles in degrees, lengths in metres.
import type { GrindId, ManualId } from '../core/ids';
import type { PoseId, SkaterPose } from '../core/view';
import { POSE, SPRING } from './skater.config';

/** Spring-blended channels (all numbers). */
export interface PoseChannels {
  knee: number;            // flexion of the reference (less lifted) leg; sets the hip height through the legs
  hipDrop: number;         // hips lowered beyond what `knee` gives
  hipX: number;            // hips toward the toes (+) / heels (−)
  hipZ: number;            // hips toward the nose (+) / tail (−): weight over a truck
  liftF: number; liftB: number;   // front / back foot above the deck
  spineBend: number;       // forward bend toward the toes
  spineTwist: number;      // twist toward the nose
  spineSide: number;       // lean toward the nose
  chestTwist: number;      // upper-body twist toward the nose (open shoulders)
  headTurn: number;        // look toward the nose (travel)
  headNod: number;         // chin down
  fAbd: number; fFlex: number; fElbow: number;   // front arm: out from the side, forward, elbow
  bAbd: number; bFlex: number; bElbow: number;   // back arm
  bPitch: number; bYaw: number; bRoll: number;   // board offsets on top of pose.board (grind / manual / pop)
  sink: number;            // rig lowered onto a grind edge (truck or deck contact)
  rigYaw: number;          // whole-rig yaw (slides: deck yaw 90°, torso faces down the rail)
  stretch: number;         // y squash / stretch
  grab: number;            // 0..1: back hand reaches the toeside edge between the feet (Indy)
  lean: number;            // root roll, deg (carve)
  swayAmp: number;         // arm sway amplitude (manual), deg
  windmill: number;        // 0..1 arm windmill (sketchy)
  bobAmp: number;          // rolling bob amplitude, m
  breathe: number;         // idle breathing / sway amplitude, 0..1
}
export interface PoseTarget extends PoseChannels {
  /** Spring ω for this target (rad/s). */
  omega: number;
  /** The table entry used, e.g. 'grind:boardslide' (coverage test, debugging). */
  entry: string;
}
export const CHANNELS = ['knee', 'hipDrop', 'hipX', 'hipZ', 'liftF', 'liftB', 'spineBend', 'spineTwist', 'spineSide',
  'chestTwist', 'headTurn', 'headNod', 'fAbd', 'fFlex', 'fElbow', 'bAbd', 'bFlex', 'bElbow', 'bPitch', 'bYaw', 'bRoll',
  'sink', 'rigYaw', 'stretch', 'grab', 'lean', 'swayAmp', 'windmill', 'bobAmp', 'breathe'] as const satisfies readonly (keyof PoseChannels)[];

export const NEUTRAL: Readonly<PoseChannels> = {
  knee: 10, hipDrop: 0, hipX: 0, hipZ: 0, liftF: 0, liftB: 0, spineBend: 4, spineTwist: 0, spineSide: 0, chestTwist: 8,
  headTurn: 0, headNod: 4, fAbd: 12, fFlex: 4, fElbow: 12, bAbd: 12, bFlex: -4, bElbow: 12,
  bPitch: 0, bYaw: 0, bRoll: 0, sink: 0, rigYaw: 0, stretch: 1, grab: 0, lean: 0, swayAmp: 0, windmill: 0,
  bobAmp: 0, breathe: 0,
};

type Partial2 = Partial<PoseChannels>;
const P = POSE;

/** Rolling stance shared by the ground poses. The shoulders open toward the nose (a real cruising stance, and the
 *  run camera behind the skater then sees a back and two arms instead of a thin profile). */
const ROLL: Partial2 = {
  knee: P.roll.knee, hipDrop: 0, spineBend: 10, spineTwist: P.roll.spineTwist, chestTwist: P.roll.chestTwist,
  headTurn: P.roll.headTurn, headNod: 8,
  fAbd: P.roll.armAbd, fFlex: P.roll.armFlex, fElbow: 22, bAbd: P.roll.armAbd, bFlex: -P.roll.armFlex, bElbow: 20, bobAmp: P.roll.bobAmp,
};

/** One entry per PoseId (TS checks the table is complete). 'carve', 'grind' and 'manual' are refined below. */
export const POSE_TABLE: Readonly<Record<PoseId, Partial2 & { omega?: number }>> = {
  idle: { knee: P.idle.knee, spineBend: 3, chestTwist: 6, headTurn: 25, fAbd: P.idle.armAbd, bAbd: P.idle.armAbd, breathe: 1 },
  showcase: { knee: P.idle.knee, spineBend: 2, chestTwist: 10, headTurn: 0, headNod: 2, fAbd: 14, fElbow: 18, bAbd: 14, bElbow: 18, breathe: 1 },
  roll: ROLL,
  carve: ROLL,
  pop: {
    ...ROLL, knee: P.pop.backKnee, liftF: P.pop.frontLift, bPitch: P.pop.boardPitch, stretch: P.pop.stretch,
    spineBend: 6, fAbd: 38, fFlex: 25, bAbd: 34, bFlex: -10, bobAmp: 0, omega: SPRING.omegaFast,
  },
  tuck: {
    ...ROLL, knee: P.tuck.knee, liftF: P.tuck.footLift, liftB: P.tuck.footLift, spineBend: 16, headNod: 14,
    fAbd: P.tuck.armAbd, fFlex: 20, fElbow: 35, bAbd: P.tuck.armAbd, bFlex: -15, bElbow: 30, bobAmp: 0,
  },
  flip: {
    ...ROLL, knee: P.tuck.knee, liftF: P.tuck.footLift, liftB: P.tuck.footLift, spineBend: 18, headNod: 22,
    fAbd: 50, fFlex: 25, fElbow: 35, bAbd: 50, bFlex: -15, bElbow: 30, bobAmp: 0,
  },
  grab: {
    ...ROLL, knee: P.grab.knee, liftF: 0.16, liftB: 0.16, spineBend: 26, headNod: 25, grab: 1,
    fAbd: 60, fFlex: 30, fElbow: 30, bobAmp: 0,
  },
  land: {
    ...ROLL, knee: P.land.knee, stretch: P.land.squash, spineBend: 18, fAbd: 34, bAbd: 34, bobAmp: 0,
    omega: SPRING.omegaFast,
  },
  manual: ROLL,
  noseManual: ROLL,
  grind: ROLL,
  sketchy: { ...ROLL, knee: 45, spineBend: 22, stretch: 0.97, windmill: 1, bobAmp: 0, omega: SPRING.omegaFast },
  crash: { knee: 40, spineBend: 30, fAbd: 70, bAbd: 70, bobAmp: 0 },
};

/** Grind and slide poses (DESIGN §18.5). Truck grinds sink the rig onto the hangers, slides onto the deck. */
export const GRIND_POSES: Readonly<Record<GrindId, Partial2>> = {
  fiftyFifty: { knee: P.grind.knee, fAbd: P.grind.armAbd, bAbd: P.grind.armAbd, sink: 0.035 },
  fiveO: { knee: 30, bPitch: 12, hipZ: -0.06, fAbd: 55, bAbd: 50, sink: 0.035 },
  nosegrind: { knee: 30, bPitch: -12, hipZ: 0.06, fAbd: 50, bAbd: 55, sink: 0.035 },
  boardslide: { knee: 34, rigYaw: 90, chestTwist: -18, spineSide: 6, fAbd: 55, bAbd: 55, sink: 0.087 },
  lipslide: { knee: 34, rigYaw: -90, chestTwist: 18, spineSide: -6, fAbd: 55, bAbd: 55, sink: 0.087 },
  noseslide: { knee: 32, rigYaw: 90, bPitch: -10, hipZ: 0.05, fAbd: 50, bAbd: 60, sink: 0.087 },
  tailslide: { knee: 32, rigYaw: 90, bPitch: 10, hipZ: -0.05, fAbd: 60, bAbd: 50, sink: 0.087 },
  crooked: { knee: 34, bYaw: 25, bPitch: -10, hipZ: 0.05, fAbd: 55, bAbd: 45, sink: 0.035 },
  overcrook: { knee: 34, bYaw: -25, bPitch: -10, hipZ: 0.05, fAbd: 45, bAbd: 55, sink: 0.035 },
  smith: { knee: 38, bRoll: 15, bYaw: 20, bPitch: -14, hipZ: -0.05, spineSide: -8, fAbd: 60, bAbd: 40, sink: 0.035 },
  feeble: { knee: 38, bRoll: -15, bYaw: -20, bPitch: -14, hipZ: -0.05, spineSide: -8, fAbd: 40, bAbd: 60, sink: 0.035 },
  bluntslide: { knee: 42, rigYaw: 90, bPitch: 35, hipZ: -0.07, spineBend: 20, fAbd: 60, bAbd: 50, sink: 0.06 },
  noseBluntslide: { knee: 42, rigYaw: 90, bPitch: -35, hipZ: 0.07, spineBend: 20, fAbd: 50, bAbd: 60, sink: 0.06 },
};

/** Manual / Nose Manual: board pitch ±12°, weight over the tail / nose, arms sway 1.2 Hz ±20°. */
export const MANUAL_POSES: Readonly<Record<ManualId, Partial2>> = {
  manual: { knee: 24, bPitch: P.manual.pitch, hipZ: -0.07, spineBend: 6, fAbd: 45, bAbd: 40, swayAmp: P.manual.swayDeg },
  noseManual: { knee: 30, bPitch: -P.manual.pitch, hipZ: 0.07, spineBend: 16, fAbd: 40, bAbd: 45, swayAmp: P.manual.swayDeg },
};

export interface PoseContext {
  stance: 'regular' | 'goofy';
  upright: boolean;
  /** 0..1, how flat the board currently is (1 = grip up, square to the body): drives the flip re-catch. */
  boardFlat: number;
  /** Seconds since the current flip started (the feet kick off first, then re-catch). */
  flipAge: number;
}

const tmpTarget = (): PoseTarget => ({ ...NEUTRAL, omega: SPRING.omega, entry: 'idle' });

function assign(out: PoseTarget, src: Partial2): void {
  for (const k of CHANNELS) { const v = src[k]; if (v !== undefined) out[k] = v; }
}

/**
 * The target for one sim pose. `out` is reused (no allocation per frame). Grind and manual entries refine the base
 * ROLL stance; the carve picks toeside / heelside from latAccel and the stance.
 */
export function resolvePose(p: Readonly<SkaterPose>, ctx: PoseContext, out: PoseTarget = tmpTarget()): PoseTarget {
  Object.assign(out, NEUTRAL);
  const base = POSE_TABLE[p.pose] ?? POSE_TABLE.roll;
  assign(out, base);
  out.omega = base.omega ?? SPRING.omega;
  out.entry = p.pose;
  const sx = ctx.stance === 'goofy' ? -1 : 1;
  // Carve lean from the sim (rad), clamped to the DESIGN ±22°; it rolls the whole rig about the travel axis.
  const leanDeg = (p.lean * 180) / Math.PI;
  out.lean = Number.isFinite(leanDeg) ? Math.max(-P.carve.leanMax, Math.min(P.carve.leanMax, leanDeg)) : 0;

  switch (p.pose) {
    case 'carve': {
      // Toeside (+) / heelside (−) from latAccel, mirrored for goofy (the sim's latAccel is world +x).
      const side = Math.sign(p.latAccel) * sx;
      const k = Math.min(1, Math.abs(p.latAccel) / 6);
      if (side > 0) { out.knee = ROLL.knee! + (P.carve.toeKnee - ROLL.knee!) * k; out.spineBend += 8 * k; out.entry = 'carve:toe'; }
      else { out.hipX = -P.carve.heelHipBack * k; out.knee += 6 * k; out.entry = 'carve:heel'; }
      out.chestTwist += -side * P.carve.armCounter * k;
      out.fAbd += 8 * k; out.bAbd += 8 * k;
      break;
    }
    case 'grind': {
      const g = p.grindId ?? 'fiftyFifty';
      assign(out, GRIND_POSES[g] ?? GRIND_POSES.fiftyFifty);
      out.bobAmp = 0;
      out.entry = `grind:${g}`;
      break;
    }
    case 'manual': case 'noseManual': {
      const m: ManualId = p.manualKind ?? (p.pose === 'noseManual' ? 'noseManual' : 'manual');
      assign(out, MANUAL_POSES[m]);
      out.bobAmp = 0;
      // The sim may already carry the manual pitch in pose.board; then the table pitch is not added twice.
      if (Math.abs(p.board.pitch) > 1) out.bPitch = 0;
      out.entry = `manual:${m}`;
      break;
    }
    case 'flip': {
      // Shoulders twist with shove-its; the feet kick off, then re-catch once the board comes back flat (80%).
      const shuv = Math.abs(p.board.yaw) > 1 && Math.abs(p.board.roll) < 1 && Math.abs(p.board.pitch) < 1;
      if (shuv || Math.abs(p.board.yaw) > 1) out.chestTwist += P.flip.shoulderTwist * Math.sign(p.board.yaw || 1);
      if (ctx.flipAge > 0.1 && ctx.boardFlat > P.flip.catchAt) {
        out.liftF = out.liftB = P.flip.catchLift; out.knee = 70; out.entry = 'flip:catch';
      }
      break;
    }
    default: break;
  }
  // A crash carries its own tumble; a grind or manual id with another pose id is ignored (pose id wins).
  if (p.mode === 'air' && p.pose === 'roll') { out.knee = P.tuck.knee * 0.6; out.bobAmp = 0; }   // roll-off fall
  if (ctx.upright) {
    // Gus rides perfectly upright: straighter legs and back, arms closer, head level.
    const u = POSE.upright;
    out.knee = 4 + (out.knee - 4) * u;
    out.spineBend *= u; out.headNod *= u; out.chestTwist *= u;
    out.fAbd *= 0.6; out.bAbd *= 0.6; out.hipX *= u; out.bobAmp *= 0.5;
    out.entry += ':upright';
  }
  return out;
}

/** 0..1 flatness of the board from its eased flip angles (1 = grip up, axis along the deck). */
export function boardFlatness(b: { roll: number; yaw: number; pitch: number }): number {
  const r = (1 + Math.cos((b.roll * Math.PI) / 180)) / 2;
  const p = (1 + Math.cos((b.pitch * Math.PI) / 180)) / 2;
  const y = Math.abs(Math.cos((b.yaw * Math.PI) / 180));
  return r * p * y;
}
