// skater/rig.ts: the DESIGN §18.5 bone hierarchy and its rest offsets per look (height scale and build).
//
//   root (board contact; yaw = heading, roll = carve lean)
//   ├─ board (deck centre; flips rotate here)
//   └─ hips (y = crouch) ─ hem (coat hem sway)
//      ├─ spine → chest → neck → head (face, hair) → helmet (socket)
//      │          ├─ shoulderL → elbowL → handL
//      │          └─ shoulderR → elbowR → handR
//      ├─ hipL → kneeL → ankleL (shoe)
//      └─ hipR → kneeR → ankleR (shoe)
//
// Frames: the root frame is track space at the board bottom (x right, y up, −z = travel). The body frame (hips and
// below) faces +x for regular stance (left side toward the nose); goofy stance turns the body 180° on the board.
// Every bone's rest orientation is the identity, so a limb part hangs along the bone's local −y.
import { Bone, Matrix4, Skeleton } from 'three';
import type { SkaterLook } from '../core/cosmetics';
import { BOARD, BODY } from './skater.config';

export const BONES = ['root', 'board', 'hips', 'hem', 'spine', 'chest', 'neck', 'head', 'helmet',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR',
  'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'] as const;
export type BoneName = (typeof BONES)[number];
export const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;
export const BONE_PARENT: Readonly<Record<BoneName, BoneName | null>> = {
  root: null, board: 'root', hips: 'root', hem: 'hips', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  helmet: 'head', shoulderL: 'chest', elbowL: 'shoulderL', handL: 'elbowL', shoulderR: 'chest', elbowR: 'shoulderR',
  handR: 'elbowR', hipL: 'hips', kneeL: 'hipL', ankleL: 'kneeL', hipR: 'hips', kneeR: 'hipR', ankleR: 'kneeR',
};

/** Look-dependent body dimensions (metres): DESIGN §18.5 proportions × heightScale, widths × build. */
export interface RigDims {
  h: number; w: number;
  headR: number; headUp: number; neck: number; spineUp: number; chestUp: number; neckUp: number;
  shoulderUp: number; shoulderHalf: number; upperArm: number; foreArm: number;
  hipHalf: number; hipDown: number; thigh: number; shin: number; ankleUp: number;
  /** Hips height above the deck top with straight legs and the feet at the stance targets. */
  standHips: number;
}

export function rigDims(look: Pick<SkaterLook, 'heightScale' | 'build' | 'kind'>): RigDims {
  const h = look.heightScale, w = BODY.build[look.build];
  const thigh = BODY.thigh * h, shin = BODY.shin * h, hipHalf = BODY.hipHalf * w, hipDown = BODY.hipDown * h;
  const spread = (BOARD.backZ - BOARD.frontZ) / 2 - hipHalf;
  const legV = Math.sqrt(Math.max(0, (thigh + shin) ** 2 - spread * spread));
  return {
    h, w,
    headR: BODY.headR * (look.kind === 'robot' ? 1.02 : 1),  // the head keeps its size (chunky, big-headed)
    headUp: BODY.headUp, neck: BODY.neck * h,
    spineUp: BODY.spineUp * h, chestUp: BODY.chestUp * h, neckUp: (BODY.torso - BODY.spineUp - BODY.chestUp) * h,
    shoulderUp: BODY.shoulderUp * h, shoulderHalf: BODY.shoulderHalf * w,
    upperArm: BODY.upperArm * h, foreArm: BODY.foreArm * h,
    hipHalf, hipDown, thigh, shin, ankleUp: BODY.ankleUp,
    standHips: BODY.ankleUp + legV + hipDown,
  };
}

/** Rest offset of every bone from its parent (bone-local, identity rest rotation). */
export function restOffsets(d: RigDims): Record<BoneName, [number, number, number]> {
  const deckTop = BOARD.deckY + BOARD.depth / 2;
  return {
    root: [0, 0, 0], board: [0, BOARD.deckY, 0], hips: [0, deckTop + d.standHips, 0], hem: [0, -0.02 * d.h, 0],
    spine: [0, d.spineUp, 0], chest: [0, d.chestUp, 0], neck: [0, d.neckUp, 0], head: [0, d.neck, 0],
    helmet: [0, d.headUp, 0],
    shoulderL: [0, d.shoulderUp, -d.shoulderHalf], elbowL: [0, -d.upperArm, 0], handL: [0, -d.foreArm, 0],
    shoulderR: [0, d.shoulderUp, d.shoulderHalf], elbowR: [0, -d.upperArm, 0], handR: [0, -d.foreArm, 0],
    hipL: [0, -d.hipDown, -d.hipHalf], kneeL: [0, -d.thigh, 0], ankleL: [0, -d.shin, 0],
    hipR: [0, -d.hipDown, d.hipHalf], kneeR: [0, -d.thigh, 0], ankleR: [0, -d.shin, 0],
  };
}

export interface Rig {
  readonly bones: readonly Bone[];
  readonly bone: Readonly<Record<BoneName, Bone>>;
  readonly skeleton: Skeleton;
}

/** Builds the bone tree once. Bone inverses are identity: parts are authored in bone-local space, so the skinned
 *  position is simply boneMatrixWorld × position (the meshes bind with an identity bind matrix). */
export function createRig(): Rig {
  const bone = {} as Record<BoneName, Bone>;
  for (const n of BONES) { const b = new Bone(); b.name = n; bone[n] = b; }
  for (const n of BONES) { const p = BONE_PARENT[n]; if (p) bone[p].add(bone[n]); }
  const bones = BONES.map((n) => bone[n]);
  const skeleton = new Skeleton(bones, bones.map(() => new Matrix4()));
  return { bones, bone, skeleton };
}

/** Moves every bone to its rest offset for `d` and clears rotations (loadout switch). */
export function applyRest(rig: Rig, d: RigDims): void {
  const r = restOffsets(d);
  for (const n of BONES) {
    const b = rig.bone[n], o = r[n];
    b.position.set(o[0], o[1], o[2]);
    b.quaternion.identity();
    b.scale.set(1, 1, 1);
  }
}
