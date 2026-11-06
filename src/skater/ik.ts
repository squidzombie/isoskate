// skater/ik.ts: analytic 2-bone IK (DESIGN §18.5: legs toward foot targets on the deck; the Indy grab's hand).
// Pure math on three.js vectors; no allocation per call (scratch vectors are module-level).
import { Matrix4, Quaternion, Vector3 } from 'three';

const u = new Vector3(), v = new Vector3(), tmp = new Vector3();
const X = new Vector3(), Y = new Vector3(), Z = new Vector3(), M = new Matrix4();

export interface TwoBoneResult {
  /** Distance root → target before clamping. */
  dist: number;
  /** True when the target was out of reach (too far or too close) and the chain was clamped. */
  clamped: boolean;
}

/**
 * Solves a 2-bone chain root → mid → end with segment lengths a and b so that `end` reaches `target` (or the
 * closest reachable point along the root → target line). The middle joint bends toward `pole` (any vector; only its
 * component perpendicular to root → target matters). Writes the joint positions into outMid / outEnd.
 */
export function solveTwoBone(root: Vector3, target: Vector3, pole: Vector3, a: number, b: number,
  outMid: Vector3, outEnd: Vector3): TwoBoneResult {
  u.subVectors(target, root);
  const dist = u.length();
  const minD = Math.abs(a - b) + 1e-4, maxD = a + b - 1e-4;
  const d = Math.min(maxD, Math.max(minD, dist));
  if (dist > 1e-6) u.multiplyScalar(1 / dist); else u.set(0, -1, 0);
  // Bend plane: the pole without its component along u (fallback: any perpendicular).
  v.copy(pole).addScaledVector(u, -pole.dot(u));
  if (v.lengthSq() < 1e-10) { v.set(1, 0, 0).addScaledVector(u, -u.x); if (v.lengthSq() < 1e-10) v.set(0, 0, 1); }
  v.normalize();
  const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  outMid.copy(root).addScaledVector(u, a * cosA).addScaledVector(v, a * sinA);
  outEnd.copy(root).addScaledVector(u, d);
  return { dist, clamped: dist < minD || dist > maxD };
}

/**
 * Rotation of a bone frame whose local −y points along `dir` (from the joint toward its child) and whose local +x
 * is as close as possible to `fwd` (the hinge's bend direction). Both inputs are in the same parent space.
 */
export function frameAlong(dir: Vector3, fwd: Vector3, out: Quaternion): Quaternion {
  Y.copy(dir).multiplyScalar(-1).normalize();
  X.copy(fwd).addScaledVector(Y, -fwd.dot(Y));
  if (X.lengthSq() < 1e-10) { tmp.set(0, 0, 1); X.crossVectors(Y, tmp); if (X.lengthSq() < 1e-10) X.set(1, 0, 0); }
  X.normalize();
  Z.crossVectors(X, Y);
  M.makeBasis(X, Y, Z);
  return out.setFromRotationMatrix(M);
}

/** Knee (or elbow) flexion in degrees for a chain of lengths a, b whose ends are `d` apart. */
export function flexForReach(a: number, b: number, d: number): number {
  const c = Math.min(1, Math.max(-1, (a * a + b * b - d * d) / (2 * a * b)));
  return 180 - (Math.acos(c) * 180) / Math.PI;
}

/** Root → end distance of a chain of lengths a, b at a joint flexion of `deg` (0 = straight). */
export function reachForFlex(a: number, b: number, deg: number): number {
  const k = ((180 - deg) * Math.PI) / 180;
  return Math.sqrt(Math.max(0, a * a + b * b - 2 * a * b * Math.cos(k)));
}
