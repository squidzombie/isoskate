// Pose coverage (ROADMAP W2b acceptance): every PoseId × GrindId × ManualId (and spin / fakie, both stances, both
// pose styles) resolves to a defined, finite target, and drives the rig without NaN; grinds and manuals each have
// their own entry; the legs reach the deck through IK.
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { GrindId, ManualId } from '../../../src/core/ids';
import type { PoseId, SkaterPose } from '../../../src/core/view';
import { Animator, type AnimStyle } from '../../../src/skater/animator';
import { CHANNELS, GRIND_POSES, MANUAL_POSES, NEUTRAL, POSE_TABLE, boardFlatness, resolvePose } from '../../../src/skater/poses';
import { createRig, applyRest, rigDims } from '../../../src/skater/rig';
import { basePose } from '../../../src/skater/showcase';
import { BOARD } from '../../../src/skater/skater.config';

const POSE_IDS = ['roll', 'carve', 'pop', 'tuck', 'flip', 'grab', 'land', 'manual', 'noseManual', 'grind', 'sketchy',
  'crash', 'idle', 'showcase'] as const satisfies readonly PoseId[];
// Compile-time: the list above is every PoseId.
type Missing = Exclude<PoseId, (typeof POSE_IDS)[number]>;
const noneMissing: Missing extends never ? true : false = true;
const GRIND_IDS = ['fiftyFifty', 'fiveO', 'nosegrind', 'boardslide', 'lipslide', 'noseslide', 'tailslide', 'feeble', 'smith',
  'crooked', 'overcrook', 'bluntslide', 'noseBluntslide'] as const satisfies readonly GrindId[];
const MANUAL_IDS = ['manual', 'noseManual'] as const satisfies readonly ManualId[];
const modeFor = (p: PoseId): SkaterPose['mode'] =>
  p === 'pop' || p === 'tuck' || p === 'flip' || p === 'grab' ? 'air' : p === 'grind' ? 'grind'
    : p === 'manual' || p === 'noseManual' ? 'manual' : p === 'crash' ? 'crashed' : 'roll';

function* combos(): Generator<SkaterPose> {
  for (const pose of POSE_IDS) for (const g of [null, ...GRIND_IDS]) for (const m of [null, ...MANUAL_IDS])
    for (const [spinYaw, fakie] of [[0, false], [-180, true], [360, false], [90, true]] as const) {
      yield basePose({
        pose, mode: modeFor(pose), grindId: g, manualKind: m, spinYaw, fakie,
        board: pose === 'flip' ? { roll: 200, yaw: 90, pitch: 0 } : { roll: 0, yaw: 0, pitch: 0 },
        latAccel: pose === 'carve' ? (spinYaw ? -7 : 7) : 0, lean: pose === 'carve' ? 0.25 : 0,
        crash: pose === 'crash' ? { t: 0.4, seed: 3 } : null, height: pose === 'tuck' ? 0.6 : 0,
      });
    }
}
const style = (stance: 'regular' | 'goofy', upright = false): AnimStyle => ({
  stance, upright, dims: rigDims({ heightScale: 1, build: 'regular', kind: 'human' }), hemSway: true, waves: true,
});

describe('pose table', () => {
  it('lists every PoseId, GrindId and ManualId', () => {
    expect(noneMissing).toBe(true);
    expect(Object.keys(POSE_TABLE).sort()).toEqual([...POSE_IDS].sort());
    expect(Object.keys(GRIND_POSES).sort()).toEqual([...GRIND_IDS].sort());
    expect(Object.keys(MANUAL_POSES).sort()).toEqual([...MANUAL_IDS].sort());
  });
  it('the channel list is exactly the target fields', () => {
    expect([...CHANNELS].sort()).toEqual(Object.keys(NEUTRAL).sort());
  });
  it('every combination resolves to a defined, finite target', () => {
    let n = 0;
    const bad: string[] = [];
    for (const p of combos()) for (const stance of ['regular', 'goofy'] as const) for (const upright of [false, true]) {
      const t = resolvePose(p, { stance, upright, boardFlat: boardFlatness(p.board), flipAge: 0.2 });
      const id = `${p.pose}/${p.grindId}/${p.manualKind}/${p.spinYaw}/${p.fakie}/${stance}/${upright}`;
      for (const k of CHANNELS) if (!Number.isFinite(t[k])) bad.push(`${id} ${k}`);
      if (!(t.omega > 0)) bad.push(`${id} omega`);
      const want = p.pose === 'grind' ? `grind:${p.grindId ?? 'fiftyFifty'}`
        : p.pose === 'manual' || p.pose === 'noseManual' ? `manual:${p.manualKind ?? p.pose}` : p.pose;
      if (!t.entry.startsWith(want)) bad.push(`${id} entry ${t.entry}`);
      n++;
    }
    expect(bad).toEqual([]);
    expect(n).toBe(POSE_IDS.length * 14 * 3 * 4 * 4);
  });
  it('each grind and each manual has its own target', () => {
    const sig = (g: GrindId) => {
      const t = resolvePose(basePose({ pose: 'grind', mode: 'grind', grindId: g }), { stance: 'regular', upright: false, boardFlat: 1, flipAge: 0 });
      return [t.bPitch, t.bYaw, t.bRoll, t.rigYaw, t.hipZ, t.sink, t.knee].map((v) => v.toFixed(3)).join(',');
    };
    expect(new Set(GRIND_IDS.map(sig)).size).toBe(GRIND_IDS.length);
    const m = (k: ManualId) => resolvePose(basePose({ pose: k, mode: 'manual', manualKind: k }), { stance: 'regular', upright: false, boardFlat: 1, flipAge: 0 });
    expect(m('manual').bPitch).toBe(12);
    expect(m('noseManual').bPitch).toBe(-12);
    // Slides yaw the deck 90° (lip: the tail leads); truck grinds stay parallel to the edge.
    const g = (id: GrindId) => resolvePose(basePose({ pose: 'grind', mode: 'grind', grindId: id }), { stance: 'regular', upright: false, boardFlat: 1, flipAge: 0 });
    expect(g('boardslide').rigYaw).toBe(90);
    expect(g('lipslide').rigYaw).toBe(-90);
    expect(g('fiftyFifty').rigYaw).toBe(0);
    expect(g('bluntslide').bPitch).toBe(35);
    expect(g('noseBluntslide').bPitch).toBe(-35);
  });
  it('carve picks toeside / heelside from latAccel and the stance', () => {
    const c = (lat: number, stance: 'regular' | 'goofy') => resolvePose(basePose({ pose: 'carve', latAccel: lat }), { stance, upright: false, boardFlat: 1, flipAge: 0 }).entry;
    expect(c(8, 'regular')).toBe('carve:toe');
    expect(c(-8, 'regular')).toBe('carve:heel');
    expect(c(8, 'goofy')).toBe('carve:heel');
    expect(c(-8, 'goofy')).toBe('carve:toe');
  });
  it('the sim manual pitch is not added twice', () => {
    const t = resolvePose(basePose({ pose: 'manual', mode: 'manual', manualKind: 'manual', board: { roll: 0, yaw: 0, pitch: 12 } }),
      { stance: 'regular', upright: false, boardFlat: 1, flipAge: 0 });
    expect(t.bPitch).toBe(0);
  });
});

describe('animator', () => {
  it('drives every combination without NaN (both stances)', () => {
    const rig = createRig();
    for (const stance of ['regular', 'goofy'] as const) {
      const st = style(stance);
      applyRest(rig, st.dims);
      const a = new Animator();
      const bad: string[] = [];
      for (const p of combos()) {
        a.update(rig, st, { dt: 1 / 60, pose: p, speed: 7, landed: p.pose === 'land' ? 1 : 0, perfect: p.pose === 'land' });
        for (const b of rig.bones) {
          if (!Number.isFinite(b.position.x + b.position.y + b.position.z) || Math.abs(b.quaternion.length() - 1) > 1e-4) {
            bad.push(`${stance} ${p.pose}/${p.grindId}/${p.manualKind}/${p.spinYaw} ${b.name}`);
          }
        }
      }
      expect(bad).toEqual([]);
    }
  });
  it('IK puts both feet on the deck at the front bolts and the tail (regular: left foot front)', () => {
    for (const stance of ['regular', 'goofy'] as const) for (const pose of ['roll', 'idle', 'carve', 'grind', 'land'] as const) {
      const rig = createRig(), st = style(stance), a = new Animator();
      applyRest(rig, st.dims);
      a.snap();
      a.update(rig, st, { dt: 1 / 60, pose: basePose({ pose, mode: pose === 'grind' ? 'grind' : 'roll', grindId: 'fiftyFifty' }), speed: 7, landed: 0, perfect: false });
      rig.bone.root.updateMatrixWorld(true);
      const root = rig.bone.root.matrixWorld.clone().invert();
      const at = (n: 'ankleL' | 'ankleR') => new Vector3().setFromMatrixPosition(rig.bone[n].matrixWorld).applyMatrix4(root);
      const front = stance === 'regular' ? at('ankleL') : at('ankleR'), back = stance === 'regular' ? at('ankleR') : at('ankleL');
      const deckTop = BOARD.deckY + BOARD.depth / 2 + st.dims.ankleUp;
      expect(front.z, `${stance} ${pose} front z`).toBeCloseTo(BOARD.frontZ, 2);
      expect(back.z, `${stance} ${pose} back z`).toBeCloseTo(BOARD.backZ, 2);
      expect(front.y, `${stance} ${pose} front y`).toBeCloseTo(deckTop, 2);
      expect(back.y, `${stance} ${pose} back y`).toBeCloseTo(deckTop, 2);
      // The heel side is behind the rider: −x for regular (facing +x), +x for goofy.
      expect(Math.sign(front.x)).toBe(stance === 'regular' ? -1 : 1);
    }
  });
  it('flips lift the feet off a flipping board; the board takes pose.board', () => {
    const rig = createRig(), st = style('regular'), a = new Animator();
    applyRest(rig, st.dims);
    a.snap();
    a.update(rig, st, { dt: 1 / 60, pose: basePose({ pose: 'flip', mode: 'air', board: { roll: 180, yaw: 0, pitch: 0 } }), speed: 7, landed: 0, perfect: false });
    const up = new Vector3(0, 1, 0).applyQuaternion(rig.bone.board.quaternion);
    expect(up.y).toBeLessThan(-0.99);                                    // upside down mid-kickflip
    rig.bone.root.updateMatrixWorld(true);
    const ank = new Vector3().setFromMatrixPosition(rig.bone.ankleL.matrixWorld);
    expect(ank.y).toBeGreaterThan(BOARD.deckY + 0.2);                    // feet tucked above the deck
  });
  it('spins and the fakie pivot are continuous (no jump when a 180 lands fakie)', () => {
    const rig = createRig(), st = style('regular'), a = new Animator();
    applyRest(rig, st.dims);
    a.snap();
    const yaw = () => { const f = new Vector3(0, 0, -1).applyQuaternion(rig.bone.root.quaternion); return Math.atan2(f.x, -f.z); };
    let prev: number | null = null;
    const seq: [number, boolean][] = [];
    for (let i = 0; i <= 18; i++) seq.push([180 * Math.min(1, i / 18), false]);
    for (let i = 0; i < 20; i++) seq.push([0, true]);
    for (let i = 0; i < 40; i++) seq.push([0, false]);          // revert pivot
    let maxStep = 0;
    for (const [spinYaw, fakie] of seq) {
      a.update(rig, st, { dt: 1 / 60, pose: basePose({ spinYaw, fakie, mode: spinYaw > 0 && spinYaw < 180 ? 'air' : 'roll', pose: spinYaw > 0 && spinYaw < 180 ? 'tuck' : 'roll' }), speed: 7, landed: 0, perfect: false });
      const y = yaw();
      if (prev !== null) { let d = Math.abs(y - prev); d = Math.min(d, 2 * Math.PI - d); maxStep = Math.max(maxStep, d); }
      prev = y;
    }
    expect(maxStep).toBeLessThan((32 * Math.PI) / 180);           // per-frame steps only: the spin is 10°/frame, the quick revert pivot peaks near 28°
    expect(Math.abs(yaw())).toBeLessThan(0.05);                    // reverted to regular
  });
  it('the crash tumble is deterministic per seed, ends on the ground, and the board flies off', () => {
    const run = (seed: number) => {
      const rig = createRig(), st = style('regular'), a = new Animator();
      applyRest(rig, st.dims);
      a.snap();
      a.update(rig, st, { dt: 1 / 60, pose: basePose(), speed: 9, landed: 0, perfect: false });
      const out: number[][] = [];
      for (let i = 0; i < 180; i++) {
        a.update(rig, st, { dt: 1 / 60, pose: basePose({ mode: 'crashed', pose: 'crash', crash: { t: 0, seed } }), speed: 9, landed: 0, perfect: false });
        out.push([...rig.bone.hips.position.toArray(), ...rig.bone.board.position.toArray(), ...rig.bone.hips.quaternion.toArray()]);
      }
      return { out, rig };
    };
    const a = run(5), b = run(5), c = run(6);
    expect(a.out).toEqual(b.out);
    expect(a.out).not.toEqual(c.out);
    const mid = a.out[30]!, end = a.out[179]!;
    expect(mid[1]!).toBeGreaterThan(end[1]!);                       // up, then down
    expect(end[1]!).toBeGreaterThan(-0.2);                          // never through the ground
    expect(end[1]!).toBeLessThan(0.6);                              // lying down by 3 s
    expect(Math.hypot(end[3]! - 0, end[5]! - 0)).toBeGreaterThan(1); // the board flew off
    expect(end[4]!).toBeGreaterThanOrEqual(0);                      // the board rests on the ground
  });
});
