// skater/animator.ts: SkaterPose → bone transforms (DESIGN §18.5, TECH §8.5).
//  - pose targets (poses.ts) blended with critically damped springs (ω 18, 30 for pop and landing);
//  - analytic 2-bone IK for the legs toward the deck (front bolts and tail), and the Indy grab's hand;
//  - the board rotation from pose.board, spins from pose.spinYaw, the fakie pivot, grind and manual offsets;
//  - the land absorb dip, rolling bob, manual arm sway, sketchy windmill, Gus's wave, Lark's coat hem;
//  - the crash: a view-side rigid tumble (seeded spin axis), flailing limbs and the board flying off with its own
//    spin, bouncing with restitution 0.3. A slam bounces back off the obstacle (it never tumbles through it); a bad
//    landing or a fall tumbles forward. The helmet stays on (it rides the head bone);
//  - showcase board display: the rider steps off and holds the deck upright, graphic toward the camera.
// Allocation-free per frame. Deterministic for a given sequence of (dt, pose) inputs.
import { type Bone, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { CrashCause } from '../core/ids';
import { clamp } from '../core/math';
import { Sfc32 } from '../core/rng';
import type { PoseId, SkaterPose } from '../core/view';
import { frameAlong, reachForFlex, solveTwoBone } from './ik';
import { CHANNELS, NEUTRAL, boardFlatness, resolvePose, type PoseChannels, type PoseContext, type PoseTarget } from './poses';
import type { Rig, RigDims } from './rig';
import { BOARD, CRASH, FLIP_VIEW, FX, POSE, SHOWCASE, SPRING } from './skater.config';

const DEG = Math.PI / 180;
const N = CHANNELS.length;
const IDX = Object.fromEntries(CHANNELS.map((c, i) => [c, i])) as Record<keyof PoseChannels, number>;

/** Look-derived inputs of the animator. */
export interface AnimStyle {
  stance: 'regular' | 'goofy';
  upright: boolean;
  dims: RigDims;
  /** Lark's coat hem sways on landings. */
  hemSway: boolean;
  /** Gus waves at the camera on Perfect landings. */
  waves: boolean;
}

/** Per-frame input. */
export interface AnimInput {
  dt: number;
  pose: Readonly<SkaterPose>;
  /** Forward speed (m/s), used for the crash launch. */
  speed: number;
  /** Landing impulse seen this frame (pose.landImpulse or a `land` event), 0 if none. */
  landed: number;
  /** A Perfect landing this frame (Gus's wave). */
  perfect: boolean;
  /** Why the run ended, while `pose.crash` is set (SkaterState.crash.cause): a slam bounces back off the obstacle. */
  crashCause: CrashCause | null;
  /** Showcase board display target: 1 = off the board, holding the deck graphic-out; 0 = riding. */
  display: number;
}

/** Critically damped spring, exact for any dt. Returns the new value; writes the velocity into v[i]. */
function spring(x: Float64Array, v: Float64Array, i: number, target: number, omega: number, dt: number): void {
  const y = x[i]! - target, vi = v[i]!;
  const e = Math.exp(-omega * dt), c = vi + omega * y;
  x[i] = target + (y + c * dt) * e;
  v[i] = (vi - omega * c * dt) * e;
}

/** Smooth seeded noise in about −1..1 (two incommensurate sines). */
const noise = (t: number, a: number, b: number) => 0.62 * Math.sin(2 * Math.PI * t + a) + 0.38 * Math.sin(2 * Math.PI * 1.73 * t + b);

interface CrashSim {
  key: string; t: number; ground: number;
  c: Vector3; cv: Vector3; q0: Quaternion; axis: Vector3; rate: number; angle: number; grounded: boolean; settleT: number;
  /** The lying angle the body settles to, chosen once at the first ground contact. */
  lie: number;
  bp: Vector3; bv: Vector3; bq: Quaternion; baxis: Vector3; brate: number; bgrounded: boolean;
  phase: Float64Array;
}

// Scratch (module-level: no allocation per frame).
const qa = new Quaternion(), qb = new Quaternion(), qc = new Quaternion(), qHips = new Quaternion(), qFootFrame = new Quaternion();
const qThigh = new Quaternion(), qShin = new Quaternion(), qFoot = new Quaternion(), qInv = new Quaternion();
const va = new Vector3(), vb = new Vector3(), vHip = new Vector3(), vKnee = new Vector3(), vAnkle = new Vector3();
const vTarget = new Vector3(), vPole = new Vector3(), vHipsP = new Vector3(), vBoardP = new Vector3();
const e3 = new Euler(0, 0, 0, 'YXZ');
const AX = new Vector3(1, 0, 0), AY = new Vector3(0, 1, 0), AZ = new Vector3(0, 0, 1);
const mA = new Matrix4(), mB = new Matrix4(), vS = new Vector3();
const C_OFF = new Vector3(0, CRASH.centreUp, 0);  // hips → tumble centre (mid torso), hips-local
const vDisp = new Vector3(), qDisp = new Quaternion(), qRideFoot = new Quaternion(), vX = new Vector3(), vY = new Vector3(), vZ = new Vector3();
const DSP = SHOWCASE.display;

const rotY = (q: Quaternion, deg: number) => q.setFromAxisAngle(AY, deg * DEG);
const rotX = (q: Quaternion, deg: number) => q.setFromAxisAngle(AX, deg * DEG);
const rotZ = (q: Quaternion, deg: number) => q.setFromAxisAngle(AZ, deg * DEG);

export class Animator {
  readonly x = new Float64Array(N);
  readonly v = new Float64Array(N);
  /** Seconds of view time (oscillators). */
  time = 0;
  private target: PoseTarget = resolvePose({
    mode: 'roll', pose: 'idle', grindId: null, manualKind: null, heading: 0, lean: 0, latAccel: 0, crouch: 0,
    board: { roll: 0, yaw: 0, pitch: 0 }, bodyYaw: 0, spinYaw: 0, fakie: false, height: 0, airT: 0, wobble: 0,
    landImpulse: 0, crash: null,
  }, { stance: 'regular', upright: false, boardFlat: 1, flipAge: 0 });
  private fakie = 0; private fakieV = 0; private prevFakie = false; private prevSpin = 0;
  private dipT = 99; private dipAmp = 0;
  private flipAge = 0; private lastPose: PoseId = 'idle';
  /** Flip readability blend (FLIP_VIEW): 1 while a flip rotates in the air. */
  private flipVis = 0;
  private hem = 0; private hemV = 0;
  private waveT = 99;
  private crash: CrashSim | null = null;
  private snapNext = true;
  private sketchyAge = 0;
  /** Showcase board display blend (0 riding … 1 holding the deck) and its spring velocity. */
  private dsp = 0; private dspV = 0;
  private readonly pctx: PoseContext = { stance: 'regular', upright: false, boardFlat: 1, flipAge: 0 };

  /** The next update jumps straight to its target (new run, loadout switch, contact sheets). */
  snap(): void { this.snapNext = true; this.crash = null; this.dipT = 99; this.waveT = 99; }

  /** The current board display blend (0..1), for tests and tools. */
  get displayBlend(): number { return this.dsp; }

  /** True while the crash tumble owns the rig. */
  get crashing(): boolean { return this.crash !== null; }

  update(rig: Rig, st: AnimStyle, inp: AnimInput): void {
    const dt = clamp(Number.isFinite(inp.dt) ? inp.dt : 0, 0, 0.1);
    this.time += dt;
    const p = inp.pose;
    if (p.crash) { this.updateCrash(rig, st, inp, dt); return; }
    this.crash = null;

    // Pose target and springs.
    if (p.pose === 'flip') this.flipAge = this.lastPose === 'flip' ? this.flipAge + dt : 0;
    this.lastPose = p.pose;
    const pc = this.pctx;
    pc.stance = st.stance; pc.upright = st.upright; pc.boardFlat = boardFlatness(p.board); pc.flipAge = this.flipAge;
    const tg = resolvePose(p, pc, this.target);
    // From the flip's start until the catch (the same test poses.ts uses for the re-catch).
    const flipping = p.mode === 'air' && p.pose === 'flip' && !(this.flipAge > 0.1 && pc.boardFlat > POSE.flip.catchAt);
    this.flipVis = this.snapNext ? (flipping ? 1 : 0)
      : clamp(this.flipVis + (flipping ? 1 : -1) * FLIP_VIEW.rate * dt, 0, 1);
    // Sketchy: the windmill lasts POSE.sketchy.dur from the sketchy landing, however long the sim holds the pose.
    if (p.pose === 'sketchy') { if (this.sketchyAge > POSE.sketchy.dur) tg.windmill = 0; this.sketchyAge += dt; }
    else this.sketchyAge = 0;
    const snap = this.snapNext;
    for (let i = 0; i < N; i++) {
      const goal = tg[CHANNELS[i]!];
      if (snap) { this.x[i] = goal; this.v[i] = 0; } else spring(this.x, this.v, i, goal, tg.omega, dt);
    }
    // Fakie: a 180 landing snaps (continuous with the spin's end); the revert pivots on a fast spring.
    const fGoal = p.fakie ? 180 : 0;
    if (snap || (p.fakie !== this.prevFakie && Math.abs(this.prevSpin) > 90)) { this.fakie = fGoal; this.fakieV = 0; }
    else {
      const y = this.fakie - fGoal, e = Math.exp(-SPRING.fakiePivot * dt), c = this.fakieV + SPRING.fakiePivot * y;
      this.fakie = fGoal + (y + c * dt) * e; this.fakieV = (this.fakieV - SPRING.fakiePivot * c * dt) * e;
    }
    this.prevFakie = p.fakie; this.prevSpin = p.spinYaw;
    // Showcase board display (its own critically damped spring).
    const dGoal = clamp(inp.display, 0, 1);
    if (snap) { this.dsp = dGoal; this.dspV = 0; }
    else {
      const y = this.dsp - dGoal, e = Math.exp(-DSP.omega * dt), c = this.dspV + DSP.omega * y;
      this.dsp = dGoal + (y + c * dt) * e; this.dspV = (this.dspV - DSP.omega * c * dt) * e;
    }
    // Landing dip, Gus's wave, the coat hem.
    if (inp.landed > 0) { this.dipT = 0; this.dipAmp = clamp(inp.landed, 0.4, 1.5); if (st.hemSway) this.hemV += FX.hemKick * 12 * this.dipAmp; }
    else this.dipT += dt;
    if (inp.perfect && st.waves) this.waveT = 0; else this.waveT += dt;
    {
      const y = this.hem + this.x[IDX.lean]! * 0.4, w = FX.hemOmega;
      const a = -2 * FX.hemDamp * w * this.hemV - w * w * y;    // under-damped: the hem swings and settles
      this.hemV += a * dt; this.hem += this.hemV * dt;
      if (snap) { this.hem = 0; this.hemV = 0; }
    }
    this.snapNext = false;
    this.apply(rig, st, p);
  }

  /** Land absorb (DESIGN §18.5): hip y −0.15 in 80 ms, springing back over 220 ms. */
  private dip(): number {
    const L = POSE.land, t = this.dipT;
    if (t >= L.dipIn + L.dipOut) return 0;
    const u = t < L.dipIn ? Math.sin((Math.PI / 2) * (t / L.dipIn)) : 1 - smooth((t - L.dipIn) / L.dipOut);
    return L.dip * this.dipAmp * u;
  }

  // ── pose → bones ────────────────────────────────────────────────────────────────────────────────────────────
  private apply(rig: Rig, st: AnimStyle, p: Readonly<SkaterPose>): void {
    const ch = (k: keyof PoseChannels) => this.x[IDX[k]]!;
    const b = rig.bone, d = st.dims, t = this.time;
    const sx = st.stance === 'goofy' ? -1 : 1;
    const air = p.mode === 'air';

    // Root: heading, spin (body + board), fakie, slide yaw, carve lean, squash / stretch, bob, grind sink.
    const yaw = -p.heading - sx * (p.spinYaw + ch('rigYaw')) * DEG + this.fakie * DEG;
    e3.set(0, Number.isFinite(yaw) ? yaw : 0, -ch('lean') * DEG, 'YXZ');
    b.root.quaternion.setFromEuler(e3);
    const s = clamp(ch('stretch'), 0.8, 1.2);
    b.root.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    const bob = ch('bobAmp') * Math.sin(2 * Math.PI * POSE.roll.bobHz * t);
    b.root.position.set(0, bob - ch('sink'), 0);

    // Board pivot: flip / shove-it rotation from the sim plus the pose offsets. On the ground a pitched board pivots
    // about the low truck (the board lifts so its wheels stay down).
    const fv = smooth(this.flipVis);
    const bp = p.board.pitch + ch('bPitch'), by = p.board.yaw + ch('bYaw') + FLIP_VIEW.yawDeg * fv, br = p.board.roll + ch('bRoll');
    const ground = !air && p.mode !== 'grind';
    const lift = ground ? BOARD.truckZ * Math.abs(Math.sin(bp * DEG)) : 0;
    b.board.position.set(0, BOARD.deckY + lift - FLIP_VIEW.drop * fv, 0);
    b.board.scale.setScalar(1 + (FLIP_VIEW.scale - 1) * fv);
    e3.set(bp * DEG, -sx * by * DEG, sx * br * DEG, 'YXZ');
    b.board.quaternion.setFromEuler(e3);
    // Foot frame: in the air the feet hover over a "virtual" flat deck (the board flips under them).
    if (air) e3.set(ch('bPitch') * DEG, -sx * ch('bYaw') * DEG, sx * ch('bRoll') * DEG, 'YXZ');
    qFootFrame.setFromEuler(e3);
    vBoardP.set(0, BOARD.deckY + lift, 0);
    // Showcase board display: the deck stands beside the back hand (root +z for both stances), nose up, its graphic
    // facing the camera (the body's front, sx · +x), leaning toward the rider.
    const dsp = smooth(this.dsp);
    if (dsp > 0.001) {
      vX.set(0, 0, sx); vY.set(-sx, 0, 0); vZ.set(0, -1, 0);           // board x → across, y → away from the camera, z → down
      mA.makeBasis(vX, vY, vZ);
      qDisp.setFromRotationMatrix(mA).premultiply(qa.setFromAxisAngle(AX, -DSP.leanDeg * DEG));
      vDisp.set(sx * DSP.x, DSP.lift + BOARD.len / 2, DSP.z);
      b.board.position.lerp(vDisp, dsp);
      b.board.quaternion.slerp(qDisp, dsp);
    }

    // Hips: height from the reference leg's knee flexion, weight shifts, stance yaw (goofy faces −x).
    const liftF = ch('liftF'), liftB = ch('liftB');
    const spread = (BOARD.backZ - BOARD.frontZ) / 2 - d.hipHalf;
    const reach = reachForFlex(d.thigh, d.shin, clamp(ch('knee'), 0, 150));
    const legV = Math.sqrt(Math.max(0.04, reach * reach - spread * spread));
    const breathe = ch('breathe') * 0.006 * Math.sin(2 * Math.PI * POSE.idle.breatheHz * t);
    const hipsY = BOARD.deckY + lift + BOARD.depth / 2 + d.ankleUp + Math.min(liftF, liftB) + legV + d.hipDown
      - ch('hipDrop') - this.dip() + breathe;
    const midZ = (BOARD.frontZ + BOARD.backZ) / 2;
    b.hips.position.set(sx * (ch('hipX') - BOARD.heelShift * 0.4), hipsY, midZ - ch('hipZ'));
    if (dsp > 0.001) {
      // Standing on the ground beside the board: feet ±DSP.feet under the hips.
      const gs = Math.abs(DSP.feet - d.hipHalf);
      const gY = d.ankleUp + Math.sqrt(Math.max(0.04, reach * reach - gs * gs)) + d.hipDown - this.dip() + breathe;
      vDisp.set(0, gY, -ch('hipZ'));
      b.hips.position.lerp(vDisp, dsp);
    }
    rotY(qHips, sx > 0 ? 0 : 180);
    b.hips.quaternion.copy(qHips);
    vHipsP.copy(b.hips.position);

    // Upper body (body frame: +x toward the toes; twist toward the nose = sx · yaw).
    const bend = ch('spineBend'), twist = ch('spineTwist'), side = ch('spineSide') + ch('breathe') * POSE.idle.swayDeg * Math.sin(2 * Math.PI * POSE.idle.breatheHz * 0.5 * t);
    rotY(qa, sx * twist); rotZ(qb, -bend * 0.55); rotX(qc, -sx * side);
    b.spine.quaternion.copy(qa).multiply(qb).multiply(qc);
    rotY(qa, sx * ch('chestTwist')); rotZ(qb, -bend * 0.45);
    b.chest.quaternion.copy(qa).multiply(qb);
    rotZ(b.neck.quaternion, -ch('headNod') * 0.4);
    rotY(qa, sx * (ch('headTurn') - ch('chestTwist') - twist)); rotZ(qb, -ch('headNod') * 0.6);
    b.head.quaternion.copy(qa).multiply(qb);
    b.helmet.quaternion.identity();

    // Arms. The front arm is the one on the nose side: left for regular, right for goofy.
    const sway = ch('swayAmp') * Math.sin(2 * Math.PI * POSE.manual.swayHz * t);
    const wm = clamp(ch('windmill'), 0, 1), wmA = 2 * Math.PI * POSE.sketchy.windmillHz * t;
    const front = sx > 0 ? 'L' : 'R', back = sx > 0 ? 'R' : 'L';
    let fAbd = ch('fAbd') + sway, fFlex = ch('fFlex'), fElb = ch('fElbow');
    let bAbd = ch('bAbd') - sway, bFlex = ch('bFlex'), bElb = ch('bElbow');
    if (wm > 0.001) {
      const W = POSE.sketchy;
      fAbd += (W.abd - fAbd) * wm; bAbd += (W.abd - bAbd) * wm;
      fFlex += wm * W.flex * Math.sin(wmA); bFlex += wm * W.flex * Math.sin(wmA + Math.PI);
      fElb += wm * W.elbow * Math.cos(wmA); bElb += wm * W.elbow * Math.cos(wmA + Math.PI);
    }
    if (this.waveT < FX.waveDur) {          // a cheerful wave with the back arm
      const u = Math.sin(Math.PI * Math.min(1, this.waveT / FX.waveDur)), Wv = FX.wave;
      bAbd += (Wv.abd - bAbd) * u; bFlex += (Wv.flex - bFlex) * u;
      bElb = bElb + (Wv.elbow + Wv.wag * Math.sin(this.waveT * Wv.wagRate) - bElb) * u;
    }
    this.arm(rig, front, fAbd, fFlex, fElb);
    this.arm(rig, back, bAbd, bFlex, bElb);
    if (st.hemSway) rotZ(b.hem.quaternion, this.hem); else b.hem.quaternion.identity();

    // Legs: 2-bone IK toward the deck targets (front bolts / tail), feet across the deck.
    this.leg(rig, st, front === 'L' ? 'L' : 'R', BOARD.frontZ, liftF, BOARD.footYawFront, sx, -DSP.feet, DSP.footYaw, dsp);
    this.leg(rig, st, front === 'L' ? 'R' : 'L', BOARD.backZ, liftB, BOARD.footYawBack, sx, DSP.feet, -DSP.footYaw, dsp);

    // Indy grab: the back hand reaches the toeside edge between the feet (blended in by the `grab` channel).
    const g = clamp(ch('grab'), 0, 1);
    if (g > 0.02) {
      vTarget.set(sx * (BOARD.width / 2 + 0.01), BOARD.depth / 2 + 0.03, (BOARD.frontZ + BOARD.backZ) / 2 + 0.02)
        .applyQuaternion(qFootFrame).add(vBoardP);
      this.reachHand(rig, st, back, g, -1, 0.6);
    }
    // Board display: the back hand holds the nose (just above the top end of the upright deck).
    if (dsp > 0.02) {
      vTarget.set(0, BOARD.depth / 2 + 0.05, -(BOARD.len / 2 - 0.03)).applyQuaternion(b.board.quaternion).add(b.board.position);
      this.reachHand(rig, st, back, dsp, -1, 0.35);
    }
  }

  private arm(rig: Rig, side: 'L' | 'R', abd: number, flex: number, elbow: number): void {
    const b = rig.bone, sgn = side === 'L' ? 1 : -1;          // left arm abducts toward −z (Rx +)
    rotX(qa, sgn * abd); rotZ(qb, flex);
    (side === 'L' ? b.shoulderL : b.shoulderR).quaternion.copy(qa).multiply(qb);
    rotZ((side === 'L' ? b.elbowL : b.elbowR).quaternion, Math.max(0, elbow));
    (side === 'L' ? b.handL : b.handR).quaternion.identity();
  }

  /** One leg's IK. `gz`, `gYaw` and `gw`: the standing-on-the-ground target (board display) and its blend weight. */
  private leg(rig: Rig, st: AnimStyle, side: 'L' | 'R', z: number, lift: number, footYaw: number, sx: number,
    gz: number, gYaw: number, gw: number): void {
    const b = rig.bone, d = st.dims;
    const hip = side === 'L' ? b.hipL : b.hipR, knee = side === 'L' ? b.kneeL : b.kneeR, ankle = side === 'L' ? b.ankleL : b.ankleR;
    // Hip joint in the root frame.
    vHip.copy(hip.position).applyQuaternion(qHips).add(vHipsP);
    // Ankle target on the (virtual) deck.
    vTarget.set(-sx * BOARD.heelShift, BOARD.depth / 2 + d.ankleUp + lift, z).applyQuaternion(qFootFrame).add(vBoardP);
    if (gw > 0.001) vTarget.lerp(vb.set(0, d.ankleUp, gz), gw);
    // Knees point toward the toes and slightly out over their own foot.
    vPole.set(1, 0.05, (side === 'L' ? -1 : 1) * 0.18).applyQuaternion(qHips);
    solveTwoBone(vHip, vTarget, vPole, d.thigh, d.shin, vKnee, vAnkle);
    frameAlong(va.subVectors(vKnee, vHip), vPole, qThigh);
    frameAlong(vb.subVectors(vAnkle, vKnee), vPole, qShin);
    hip.quaternion.copy(qInv.copy(qHips).invert()).multiply(qThigh);
    knee.quaternion.copy(qInv.copy(qThigh).invert()).multiply(qShin);
    rotY(qa, (sx > 0 ? 0 : 180) + sx * footYaw);
    qFoot.copy(qFootFrame).multiply(qa);
    if (gw > 0.001) qFoot.slerp(rotY(qRideFoot, (sx > 0 ? 0 : 180) + sx * gYaw), gw);
    ankle.quaternion.copy(qInv.copy(qShin).invert()).multiply(qFoot);
  }

  /** Two-bone IK of one arm toward vTarget (root frame), blended in by `g`; the elbow points back (poleX) and out. */
  private reachHand(rig: Rig, st: AnimStyle, side: 'L' | 'R', g: number, poleX: number, poleOut: number): void {
    const b = rig.bone, d = st.dims;
    const shoulder = side === 'L' ? b.shoulderL : b.shoulderR, elbow = side === 'L' ? b.elbowL : b.elbowR;
    // Shoulder in the root frame: hips → spine → chest → shoulder.
    mA.compose(b.hips.position, b.hips.quaternion, vS.set(1, 1, 1));
    mB.compose(b.spine.position, b.spine.quaternion, vS); mA.multiply(mB);
    mB.compose(b.chest.position, b.chest.quaternion, vS); mA.multiply(mB);
    const chestQ = qc.setFromRotationMatrix(mA);
    vHip.copy(shoulder.position).applyMatrix4(mA);
    vPole.set(poleX, 0, side === 'L' ? -poleOut : poleOut).applyQuaternion(qHips);
    solveTwoBone(vHip, vTarget, vPole, d.upperArm, d.foreArm, vKnee, vAnkle);
    frameAlong(va.subVectors(vKnee, vHip), vb.copy(vPole).multiplyScalar(-1), qThigh);
    frameAlong(va.subVectors(vAnkle, vKnee), vb, qShin);
    qInv.copy(chestQ).invert().multiply(qThigh);
    shoulder.quaternion.slerp(qInv, g);
    qInv.copy(qThigh).invert().multiply(qShin);
    elbow.quaternion.slerp(qInv, g);
  }

  // ── crash tumble ────────────────────────────────────────────────────────────────────────────────────────────
  private updateCrash(rig: Rig, st: AnimStyle, inp: AnimInput, dt: number): void {
    const p = inp.pose, c = p.crash!;
    const key = `${c.seed}`;
    let k = this.crash;
    if (!k || k.key !== key) k = this.crash = this.startCrash(rig, inp, key);
    // The tumble clock: the sim's crash time if it advances, else view time (the sim stops stepping after a crash).
    const tWant = Math.min(CRASH.maxT, Math.max(c.t, k.t + dt));
    const h = CRASH.step;
    while (k.t + h <= tWant) { this.stepCrash(k, h); k.t += h; }
    this.applyCrash(rig, st, k, dt);
    this.snapNext = false;
  }

  private startCrash(rig: Rig, inp: AnimInput, key: string): CrashSim {
    const b = rig.bone, rng = new Sfc32(inp.pose.crash!.seed | 0);
    // Current hips and board transforms in the object frame (root rotation folded in), then the root is reset.
    mA.compose(b.root.position, b.root.quaternion, b.root.scale);
    mB.compose(b.hips.position, b.hips.quaternion, vS.set(1, 1, 1)).premultiply(mA);
    const hipsP = new Vector3(), q0 = new Quaternion();
    mB.decompose(hipsP, q0, vS);
    mB.compose(b.board.position, b.board.quaternion, vS.set(1, 1, 1)).premultiply(mA);
    const bpos = new Vector3(), bq = new Quaternion();
    mB.decompose(bpos, bq, vS);
    const speed = Math.max(0, Number.isFinite(inp.speed) ? inp.speed : 0);
    const ground = -Math.max(0, inp.pose.height);
    const slam = inp.crashCause === 'slam', S = CRASH.slam;
    // Object frame: −z is the travel direction. Rotating about +x tips the top backward (+z).
    const axis = slam
      ? new Vector3(rng.range(0.6, 1), rng.range(-0.3, 0.3), rng.range(-0.55, 0.55)).normalize()
      : new Vector3(rng.range(-1, 1), rng.range(-0.35, 0.35), rng.range(-1, -0.25)).normalize();
    const baxis = new Vector3(rng.range(-0.3, 0.3), rng.range(-1, 1), rng.range(-1, 1)).normalize();
    const phase = new Float64Array(16);
    for (let i = 0; i < phase.length; i++) phase[i] = rng.range(0, Math.PI * 2);
    const c = hipsP.clone().add(va.copy(C_OFF).applyQuaternion(q0));
    const side = rng.range(-0.6, 0.6), bside = rng.range(-1, 1) * CRASH.board.side, rate = rng.range(CRASH.spinMin, CRASH.spinMax);
    const brate = rng.range(CRASH.board.spinMin, CRASH.board.spinMax);
    let cv: Vector3, bv: Vector3, spin = rate;
    if (slam) {
      // Bounce back off the obstacle and up; the spin is timed so the body reaches the ground just short of lying
      // flat on its back (it then settles at 90°, head away from the obstacle).
      cv = new Vector3(side, S.up, clamp(speed * S.back, S.backMin, S.backMax));
      const h0 = Math.max(0, c.y - (ground + CRASH.bodyR)), g = CRASH.gravity;
      const tAir = (S.up + Math.sqrt(S.up * S.up + 2 * g * h0)) / g;
      spin = clamp((S.lieFrac * Math.PI) / 2 / Math.max(0.05, tAir), S.rateMin, S.rateMax);
      bv = new Vector3(bside, CRASH.board.up, clamp(speed * S.board.back, 0.4, S.board.backMax));
    } else {
      cv = new Vector3(side, CRASH.up, -clamp(speed * CRASH.fwdFactor, 0, CRASH.fwdMax));
      bv = new Vector3(bside, CRASH.board.up, -clamp(speed * CRASH.board.fwdFactor, 0, 7));
    }
    const sim: CrashSim = {
      key, t: 0, ground, c, cv, q0, axis, rate: spin, angle: 0, grounded: false, settleT: -1, lie: Math.PI / 2,
      bp: bpos, bv, bq, baxis, brate, bgrounded: false, phase,
    };
    b.root.quaternion.identity(); b.root.position.set(0, 0, 0); b.root.scale.set(1, 1, 1);
    return sim;
  }

  private stepCrash(k: CrashSim, h: number): void {
    const g = CRASH.gravity;
    // Body: a ball of radius bodyR at the mid torso; bounces with restitution 0.3 and friction; the spin slows on the
    // ground and settles lying down (the nearest 90° + n·180° of tumble angle ahead).
    k.cv.y -= g * h;
    k.c.addScaledVector(k.cv, h);
    const floor = k.ground + CRASH.bodyR;
    if (k.c.y < floor) {
      k.c.y = floor;
      if (k.cv.y < 0) k.cv.y = -k.cv.y * CRASH.restitution;
      if (k.cv.y < 0.4) k.cv.y = 0;
      k.cv.x *= CRASH.friction; k.cv.z *= CRASH.friction;
      if (!k.grounded) {
        k.grounded = true; k.rate *= 0.6;
        // Lie at the next 90° + n·180° ahead, unless the body is only just past one (then it falls back onto it).
        k.lie = Math.PI / 2 + Math.ceil((k.angle - Math.PI / 2 - CRASH.lieBack) / Math.PI) * Math.PI;
      }
    }
    if (k.grounded) {
      const lie = k.lie;
      k.rate *= Math.exp(-h / CRASH.settleTau);
      k.angle += (lie - k.angle) * (1 - Math.exp(-h / CRASH.settleTau)) + k.rate * h * 0.3;
      k.cv.x *= Math.exp(-h * 3); k.cv.z *= Math.exp(-h * 3);
      if (k.settleT < 0 && Math.abs(lie - k.angle) < 0.05 && k.cv.lengthSq() < 0.05) k.settleT = k.t;
    } else k.angle += k.rate * h;
    // Board: its own spin and bounces; it comes to rest flat (grip up or down, whichever is nearer).
    k.bv.y -= g * h;
    k.bp.addScaledVector(k.bv, h);
    qa.setFromAxisAngle(k.baxis, k.brate * h);
    k.bq.premultiply(qa).normalize();
    va.set(0, 1, 0).applyQuaternion(k.bq);
    const upY = va.y;
    const rest = upY >= 0 ? BOARD.deckY * upY + 0.105 * (1 - upY) : 0.016 * -upY + 0.105 * (1 + upY);
    const bfloor = k.ground + (k.bgrounded ? rest : CRASH.board.r);
    if (k.bp.y < bfloor) {
      k.bp.y = bfloor;
      if (k.bv.y < 0) k.bv.y = -k.bv.y * CRASH.restitution;
      if (k.bv.y < 0.35) k.bv.y = 0;
      k.bv.x *= CRASH.friction; k.bv.z *= CRASH.friction;
      k.brate *= 0.55;
      k.bgrounded = true;
    }
    if (k.bgrounded && k.bv.y === 0) {
      // Settle flat: keep the heading of the long axis, snap up to ±y.
      vb.set(0, 0, 1).applyQuaternion(k.bq); vb.y = 0;
      if (vb.lengthSq() < 1e-6) vb.set(0, 0, 1);
      vb.normalize();
      qb.setFromUnitVectors(AZ, vb);
      if (upY < 0) qb.multiply(qc.setFromAxisAngle(AZ, Math.PI));
      k.bq.slerp(qb, 1 - Math.exp(-h / 0.12));
      k.brate *= Math.exp(-h / 0.1);
      k.bv.x *= Math.exp(-h * 4); k.bv.z *= Math.exp(-h * 4);
    }
  }

  private applyCrash(rig: Rig, _st: AnimStyle, k: CrashSim, dt: number): void {
    const b = rig.bone, t = k.t, ph = k.phase;
    // The limbs blend from the riding pose into the flail (no pop on the impact frame).
    const limbs = limbBones(rig);
    const blend = k.t >= CRASH.blendIn * 4 ? 1 : 1 - Math.exp(-dt / CRASH.blendIn);
    if (blend < 1) for (let i = 0; i < limbs.length; i++) qSaved[i]!.copy(limbs[i]!.quaternion);
    // Body: rotation about the seeded axis on top of its orientation at the moment of the crash.
    qa.setFromAxisAngle(k.axis, k.angle);
    qHips.copy(qa).multiply(k.q0);
    b.hips.quaternion.copy(qHips);
    b.hips.position.copy(k.c).sub(va.copy(C_OFF).applyQuaternion(qHips));
    b.board.position.copy(k.bp);
    b.board.quaternion.copy(k.bq);
    b.board.scale.setScalar(1);
    // Limbs flail with 4 Hz noise ±40° (the noise's main partial runs at flailHz), fading once the body has settled.
    const env = k.settleT < 0 ? 1 : Math.exp(-(t - k.settleT) / 0.5);
    const fl = (i: number) => CRASH.flailDeg * env * noise(t * CRASH.flailHz, ph[i]!, ph[i + 1]!);
    rotY(b.spine.quaternion, fl(0) * 0.3);
    rotZ(b.chest.quaternion, -12 + fl(1) * 0.3);
    rotZ(b.neck.quaternion, fl(2) * 0.3);
    rotY(qa, fl(3) * 0.6); rotZ(qb, -10 + fl(4) * 0.4);
    b.head.quaternion.copy(qa).multiply(qb);
    this.arm(rig, 'L', 75 + fl(5), 20 + fl(6) * 1.5, 30 + Math.abs(fl(7)));
    this.arm(rig, 'R', 75 + fl(8), -10 + fl(9) * 1.5, 30 + Math.abs(fl(10)));
    for (const [hip, knee, ankle, j] of [[b.hipL, b.kneeL, b.ankleL, 11], [b.hipR, b.kneeR, b.ankleR, 13]] as const) {
      rotZ(qa, 25 + fl(j) * 1.2); rotX(qb, (hip === b.hipL ? 1 : -1) * (10 + Math.abs(fl(j + 1)) * 0.5));
      hip.quaternion.copy(qa).multiply(qb);
      rotZ(knee.quaternion, -(35 + Math.abs(fl(j + 1))));
      ankle.quaternion.identity();
    }
    b.hem.quaternion.identity();
    if (blend < 1) for (let i = 0; i < limbs.length; i++) limbs[i]!.quaternion.slerpQuaternions(qSaved[i]!, limbs[i]!.quaternion, blend);
  }
}

const LIMB_NAMES = ['spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR',
  'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'] as const;
const qSaved = LIMB_NAMES.map(() => new Quaternion());
const limbCache = new WeakMap<Rig, Bone[]>();
function limbBones(rig: Rig): Bone[] {
  let l = limbCache.get(rig);
  if (!l) { l = LIMB_NAMES.map((n) => rig.bone[n]); limbCache.set(rig, l); }
  return l;
}

function smooth(u: number): number { const c = clamp(u, 0, 1); return c * c * (3 - 2 * c); }

/** Exposed for tests: the neutral channel values. */
export const NEUTRAL_CHANNELS = NEUTRAL;
