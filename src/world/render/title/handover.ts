// world/render/title/handover.ts: the world half of the Title dive. The camera drops out of the cloud wash high above
// the start street and settles into EXACTLY the run camera's first pose, whatever that camera is (the M1 orthographic
// rig, or a perspective one). Each frame it reads the run rig's camera after its solve (position, quaternion,
// projection) and draws the world with a projection that blends, in clip space, from a descending perspective camera
// to that camera's view-projection: both are normalised so the run's focus point (the rider) has w = 1, so the blend
// is a proper projective map at every step (lines stay lines, depth order holds) and at v = 1 it is the run camera's
// own matrix up to a homogeneous scale. The view matrix is the run camera's throughout, so view-space effects (haze)
// already look like the run. No allocation per frame.
import { type Camera, Matrix4, OrthographicCamera, PerspectiveCamera, Quaternion, Vector3, Vector4 } from 'three';

export const HANDOVER = {
  /** Start distance from the focus along the view (m) and the descending camera's vertical FOV. */
  startDist: 150, fovDeg: 40,
  /** Extra yaw (deg) at the top that unwinds on the way down: a gentle spiral. */
  yawDeg: 24,
  /** Progress windows: orientation from top-down to the run camera's, then the clip-space blend into it. */
  orient: [0, 0.9] as const, blend: [0.42, 1] as const,
} as const;

const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const DEG = Math.PI / 180;
const UP = new Vector3(0, 1, 0), DOWN = new Vector3(0, -1, 0), ZERO = new Vector3();

export class HandoverCamera {
  readonly persp = new PerspectiveCamera(HANDOVER.fovDeg, 1, 0.5, 2000);
  readonly ortho = new OrthographicCamera(-1, 1, 1, -1, 0.5, 2000);
  /** The blend weight of the last frame (0 = the descending camera, 1 = the run camera). */
  blend = 0;
  private readonly vpT = new Matrix4(); private readonly inv = new Matrix4();
  private readonly vpA = new Matrix4(); private readonly m = new Matrix4(); private readonly shift = new Matrix4();
  private readonly look = new Matrix4();
  private readonly qT = new Quaternion(); private readonly qD = new Quaternion(); private readonly qY = new Quaternion();
  private readonly qA = new Quaternion();
  private readonly fT = new Vector3(); private readonly h = new Vector3(); private readonly fA = new Vector3();
  private readonly pA = new Vector3(); private readonly p0 = new Vector3(); private readonly p1 = new Vector3();
  private readonly posT = new Vector3(); private readonly one = new Vector3(1, 1, 1);
  private readonly c4 = new Vector4();
  private readonly lens = new PerspectiveCamera(HANDOVER.fovDeg, 1, 0.5, 2000);

  constructor() { this.persp.matrixWorldAutoUpdate = true; this.ortho.matrixWorldAutoUpdate = true; }

  /** The camera to draw the world with at world-phase progress v (0…1). `target`: the run rig's camera, already
   *  solved this frame; `focus`: the rider's world position; `aspect`: viewport width / height. */
  at(v: number, target: Camera, focus: Vector3, aspect: number): Camera {
    const T = target as Camera & { isOrthographicCamera?: boolean };
    T.updateMatrixWorld();
    this.vpT.multiplyMatrices(T.projectionMatrix, T.matrixWorldInverse);
    // The focus under the run camera: its clip w, NDC, and the world height of the run frame at its depth.
    const c = this.c4.set(focus.x, focus.y, focus.z, 1).applyMatrix4(this.vpT);
    const wT = Math.max(1e-6, c.w), nx = c.x / wT, ny = c.y / wT, nz = c.z / wT;
    this.inv.copy(this.vpT).invert();
    this.p1.set(nx, ny + 0.5, nz).applyMatrix4(this.inv);
    this.p0.set(nx, ny - 0.5, nz).applyMatrix4(this.inv);
    const frameT = 2 * this.p1.distanceTo(this.p0);
    // The descending camera: from top-down (screen up = the street ahead, plus an unwinding yaw) to the run camera's
    // orientation, falling along its own view axis toward the focus; the focus slides to where the run camera has it.
    T.getWorldQuaternion(this.qT);
    this.fT.set(0, 0, -1).applyQuaternion(this.qT);
    this.h.set(this.fT.x, 0, this.fT.z);
    if (this.h.lengthSq() < 1e-8) this.h.set(0, 0, -1);
    this.h.normalize();
    this.look.lookAt(ZERO, DOWN, this.h);
    this.qD.setFromRotationMatrix(this.look);
    const k = ss(HANDOVER.orient[0], HANDOVER.orient[1], v);
    this.qY.setFromAxisAngle(UP, HANDOVER.yawDeg * DEG * (1 - k));
    this.qD.premultiply(this.qY);
    this.qA.slerpQuaternions(this.qD, this.qT, k);
    this.fA.set(0, 0, -1).applyQuaternion(this.qA);
    const tanH = Math.tan((HANDOVER.fovDeg * DEG) / 2);
    const Lend = Math.max(0.5, frameT / (2 * tanH));
    const vv = Math.min(1, Math.max(0, v)), e = vv * vv * (3 - 2 * vv) * 0.55 + (1 - (1 - vv) ** 3) * 0.45;
    const L = Lend * Math.pow(Math.max(1, HANDOVER.startDist / Lend), 1 - e);
    this.pA.copy(focus).addScaledVector(this.fA, -L);
    this.m.compose(this.pA, this.qA, this.one).invert();                  // view matrix of the descending camera
    const lens = this.lens;
    lens.fov = HANDOVER.fovDeg; lens.aspect = aspect; lens.near = Math.max(0.3, L * 0.02); lens.far = L + 600;
    lens.updateProjectionMatrix();
    this.shift.makeTranslation(nx * k, ny * k, 0);
    this.vpA.multiplyMatrices(this.shift, lens.projectionMatrix).multiply(this.m);
    const wA = Math.max(1e-6, this.c4.set(focus.x, focus.y, focus.z, 1).applyMatrix4(this.vpA).w);
    const b = ss(HANDOVER.blend[0], HANDOVER.blend[1], v);
    this.blend = b;
    const ea = this.vpA.elements, eb = this.vpT.elements, out = this.m.elements, ka = (1 - b) / wA, kb = b / wT;
    for (let i = 0; i < 16; i++) out[i] = ea[i]! * ka + eb[i]! * kb;
    // Draw with the run camera's view (position, quaternion) and P = M · V_T⁻¹; the camera class follows the run
    // camera's once it dominates (the ortho flag picks the shading view vector).
    const cam = b > 0.5 && T.isOrthographicCamera ? this.ortho : this.persp;
    T.getWorldPosition(this.posT);
    cam.position.copy(this.posT); cam.quaternion.copy(this.qT); cam.updateMatrixWorld();
    cam.projectionMatrix.multiplyMatrices(this.m, cam.matrixWorld);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    // Size proxies for per-object screen-size code (the riders' outline width): the frame height at the focus.
    const frameNow = (1 - b) * 2 * L * tanH + b * frameT;
    if (cam === this.persp) this.persp.fov = (2 * Math.atan(frameNow / (2 * Math.max(0.1, this.posT.distanceTo(focus))))) / DEG;
    else { this.ortho.top = frameNow / 2; this.ortho.bottom = -frameNow / 2; this.ortho.zoom = 1; }
    return cam;
  }
}
