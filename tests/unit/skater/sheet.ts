// tests/unit/skater/sheet.ts: the SK contact-sheet page (served by Vite; driven by sheet.mjs). Renders cells with
// the real renderer (src/gfx: ACES, toon materials, golden sun from behind-left, shadows) over the mid-value
// asphalt, one skater per cell, each cell framed by a camera like the run camera (ortho, pitch 35°, ψ = 0) so the
// skater is `px` CSS px tall, or the Locker perspective camera (FOV 35°, 1.4 m high) for the showcase sheet.
//   ?sheet=items&px=60    all 40 items on the starter loadout (boards mid-kickflip so the graphic shows)
//   ?sheet=poses&px=90    the pose strip from synthetic SkaterPose objects
//   ?sheet=showcase       Locker turntable views of six loadouts
import {
  Mesh, MeshLambertMaterial, OrthographicCamera, PerspectiveCamera, PlaneGeometry, type Camera, Vector3,
} from 'three';
import { CATALOG, DEFAULT_LOADOUT } from '../../../src/content';
import type { Loadout } from '../../../src/core/cosmetics';
import type { GrindId } from '../../../src/core/ids';
import type { ScoreState, SkaterState } from '../../../src/core/sim';
import type { RenderFrame, SkaterPose, Viewport } from '../../../src/core/view';
import { createGfx, getSun } from '../../../src/gfx';
import { SkaterViewImpl, basePose } from '../../../src/skater';

const q = new URLSearchParams(location.search);
const sheet = q.get('sheet') ?? 'items';
const px = Number(q.get('px') ?? 60);
const yawDeg = Number(q.get('yaw') ?? 0);
const DPR = Number(q.get('dpr') ?? 1);
const ZOOM = Number(q.get('zoom') ?? 1);                  // review aid: nearest-neighbour upscale of the whole sheet

interface Cell { label: string; loadout: Loadout; pose: SkaterPose; x?: number; showcase?: { t: number; yaw: number }; dtSteps?: number }

const items = (): Cell[] => CATALOG.map((it) => {
  const l: Loadout = { ...DEFAULT_LOADOUT, [it.slot]: it.look } as Loadout;
  const pose = it.slot === 'board'
    ? basePose({ mode: 'air', pose: 'flip', board: { roll: 125, yaw: 90, pitch: 0 }, height: 0.55 })
    : basePose({ pose: 'roll' });
  return { label: it.name, loadout: l, pose };
});
const grind = (g: GrindId) => basePose({ mode: 'grind', pose: 'grind', grindId: g, height: 0 });
const poses = (): Cell[] => {
  const L = DEFAULT_LOADOUT;
  const list: [string, SkaterPose, number?][] = [
    ['idle', basePose({ pose: 'idle' })],
    ['carve L', basePose({ pose: 'carve', latAccel: -9, lean: -0.3, heading: -0.18 })],
    ['carve R', basePose({ pose: 'carve', latAccel: 9, lean: 0.3, heading: 0.18 })],
    ['ollie pop', basePose({ mode: 'air', pose: 'pop', height: 0.08 })],
    ['ollie tuck', basePose({ mode: 'air', pose: 'tuck', height: 0.7 })],
    ['kickflip', basePose({ mode: 'air', pose: 'flip', board: { roll: 160, yaw: 0, pitch: 0 }, height: 0.7 })],
    ['heelflip', basePose({ mode: 'air', pose: 'flip', board: { roll: -120, yaw: 0, pitch: 0 }, height: 0.7 })],
    ['shove-it', basePose({ mode: 'air', pose: 'flip', board: { roll: 0, yaw: 110, pitch: 0 }, height: 0.6 })],
    ['indy', basePose({ mode: 'air', pose: 'grab', height: 0.7 })],
    ['FS 180', basePose({ mode: 'air', pose: 'tuck', spinYaw: -100, height: 0.6 })],
    ['50-50', grind('fiftyFifty')],
    ['boardslide', grind('boardslide')],
    ['5-0', grind('fiveO')],
    ['smith', grind('smith')],
    ['crooked', grind('crooked')],
    ['bluntslide', grind('bluntslide')],
    ['manual', basePose({ mode: 'manual', pose: 'manual', manualKind: 'manual' })],
    ['nose manual', basePose({ mode: 'manual', pose: 'noseManual', manualKind: 'noseManual' })],
    ['land', basePose({ pose: 'land', landImpulse: 1 })],
    ['sketchy', basePose({ pose: 'sketchy', wobble: 1 }), 0.2],
    ['crash 0.35s', basePose({ mode: 'crashed', pose: 'crash', crash: { t: 0.35, seed: 11 } })],
    ['crash 1.6s', basePose({ mode: 'crashed', pose: 'crash', crash: { t: 1.6, seed: 11 } })],
  ];
  return list.map(([label, pose, t]) => ({ label, loadout: L, pose, dtSteps: t ? Math.round(t * 60) : 0 }));
};
const showcase = (): Cell[] => {
  const pick = (s: string, b: string, h: string): Loadout => ({
    skater: CATALOG.find((c) => c.id === s)!.look, board: CATALOG.find((c) => c.id === b)!.look, helmet: CATALOG.find((c) => c.id === h)!.look,
  } as Loadout);
  const looks: [string, Loadout][] = [
    ['Juno / Maple / Classic', DEFAULT_LOADOUT],
    ['Rook / Brick / Hard Hat', pick('sk_rook', 'bd_brick_lane', 'hm_hardhat')],
    ['Lark / Palm / Plaid', pick('sk_lark', 'bd_palm_shadow', 'hm_plaid')],
    ['Vesper / Rust / Lantern', pick('sk_vesper', 'bd_rust_rivets', 'hm_lantern')],
    ['Aki / Night Market / Holo', pick('sk_aki', 'bd_night_market', 'hm_holovisor')],
    ['Kettle / Glide / Fishbowl', pick('sk_kettle', 'bd_glide_ring', 'hm_fishbowl')],
    ['Gus / Golden / Sunflower', pick('sk_gus', 'bd_golden_hour', 'hm_sunflower')],
    ['Ines / Koi / Cat Ears', pick('sk_ines', 'bd_koi_current', 'hm_catears')],
  ];
  return looks.map(([label, l], i) => ({ label, loadout: l, pose: basePose({ pose: 'showcase' }), showcase: { t: 1 + i * 0.37, yaw: yawDeg + (i % 2 ? 25 : -20) } }));
};

// Close-ups for review: every board's graphic face-on, every helmet (and skater head) from the front three-quarter.
const boards = (): Cell[] => CATALOG.filter((c) => c.slot === 'board').map((it) => ({
  label: it.name, loadout: { ...DEFAULT_LOADOUT, board: it.look } as Loadout,
  pose: basePose({ mode: 'air', pose: 'flip', board: { roll: 180 - 55 + (yawDeg ? 180 : 0), yaw: 90, pitch: 0 }, height: 0.55 }),
}));
const heads = (): Cell[] => CATALOG.filter((c) => c.slot === 'helmet' || c.slot === 'skater').map((it) => ({
  label: it.name, loadout: { ...DEFAULT_LOADOUT, [it.slot]: it.look } as Loadout, pose: basePose({ pose: 'showcase' }),
  showcase: { t: 1.2, yaw: yawDeg - 25 },
}));
const close = sheet === 'boards' || sheet === 'heads';
const cells = sheet === 'poses' ? poses() : sheet === 'showcase' ? showcase() : sheet === 'boards' ? boards() : sheet === 'heads' ? heads() : items();
const cols = Number(q.get('cols') ?? (sheet === 'items' ? 8 : sheet === 'showcase' ? 4 : sheet === 'boards' ? 4 : sheet === 'heads' ? 6 : 11));
const cellW = Number(q.get('cw') ?? Math.round(sheet === 'showcase' ? 240 : sheet === 'boards' ? 300 : sheet === 'heads' ? 180 : Math.max(46, px * 1.55)));
const cellH = Number(q.get('ch') ?? Math.round(sheet === 'showcase' ? 300 : sheet === 'boards' ? 130 : sheet === 'heads' ? 200 : px * 2.0 + 14));
const rows = Math.ceil(cells.length / cols);
const W = cols * cellW, H = rows * cellH + 18;

const canvas = document.getElementById('gl') as HTMLCanvasElement;
canvas.width = W * DPR; canvas.height = H * DPR;
canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
const gfx = createGfx(canvas, 'high');
const r = gfx.renderer;
r.setPixelRatio(DPR);
r.setSize(W, H, false);
r.setScissorTest(true);

// Ground: asphalt (DESIGN §18.1), a sidewalk strip and a lane dash for context.
const ground = new Mesh(new PlaneGeometry(400, 400), new MeshLambertMaterial({ color: 0x6b6478 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
gfx.scene.add(ground);
const curb = new Mesh(new PlaneGeometry(1.2, 400), new MeshLambertMaterial({ color: 0xd9c3ae }));
curb.rotation.x = -Math.PI / 2; curb.position.set(-1.6, 0.002, 0); curb.receiveShadow = true;
if (sheet !== 'showcase') gfx.scene.add(curb);

const views = cells.map(() => new SkaterViewImpl(gfx));
for (const v of views) gfx.scene.add(v.object3d);

const vp: Viewport = { wCss: W, hCss: H, dpr: DPR, aspect: W / H, safeTop: 0, safeBottom: 0, coarse: false };
const state = (x: number, y: number): SkaterState => ({ tick: 0, t: 0, p: { s: 0, x, y }, vel: { s: 7, x: 0, y: 0 } } as unknown as SkaterState);
const frame = (pose: SkaterPose, dt: number): RenderFrame => {
  const st = state(0, pose.height);
  return { alpha: 1, dt, timeScale: 1, prev: st, cur: st, pose, score: {} as ScoreState, events: [], playerS: 0, speed: 7,
    area: (q.get('area') as RenderFrame['area']) ?? 'downtown', blend: null, viewport: vp };
};

// Loadout switch timing (real canvases, the first switch per look and a cached switch back).
const switchMs: number[] = [];
cells.forEach((c, i) => {
  const v = views[i]!;
  v.setLoadout(c.loadout);
  switchMs.push(v.lastSwitchMs);
  if (c.showcase) { v.setMode('showcase'); v.setTurntable(c.showcase.yaw); v.setShowcaseTime(c.showcase.t); }
  v.snap();
  v.update(frame(c.pose, 1 / 60));
  for (let k = 0; k < (c.dtSteps ?? 0); k++) v.update(frame(c.pose, 1 / 60));
});
const probe = new SkaterViewImpl(gfx);
const reSwitch: number[] = [];
for (const it of CATALOG) { probe.setLoadout({ ...DEFAULT_LOADOUT, [it.slot]: it.look } as Loadout); reSwitch.push(probe.lastSwitchMs); }

// Cameras.
const pitch = (35 * Math.PI) / 180;
const ortho = new OrthographicCamera(-1, 1, 1, -1, 0.5, 200);
const persp = new PerspectiveCamera(35, cellW / cellH, 0.1, 100);
const sun = getSun(gfx)!;
const target = new Vector3();
function frameCell(i: number): Camera {
  const v = views[i]!;
  v.object3d.getWorldPosition(target);
  if (close) {
    const bone = sheet === 'boards' ? v.rig.bone.board : v.rig.bone.helmet;
    v.object3d.updateMatrixWorld(true);
    bone.getWorldPosition(target);
    persp.aspect = cellW / cellH; persp.fov = 30; persp.updateProjectionMatrix();
    const d = sheet === 'boards' ? 1.75 : 1.15;
    persp.position.set(target.x, target.y + (sheet === 'boards' ? 0.25 : 0.12), target.z + d);
    persp.lookAt(target.x, target.y - (sheet === 'heads' ? 0.12 : 0), target.z);
    // Boards: hide the rider so the deck reads alone.
    if (sheet === 'boards') v.object3d.traverse((o) => { if (o.name.startsWith('skater-body') || o.name.startsWith('skater-helmet') || o.name.startsWith('helmet-')) o.visible = false; });
    return persp;
  }
  if (sheet === 'showcase') {
    persp.aspect = cellW / cellH; persp.updateProjectionMatrix();
    persp.position.set(target.x, 1.3, target.z + 3.4);
    persp.lookAt(target.x, 0.95, target.z);
    return persp;
  }
  // Ortho: a 1.80 m skater spans about 1.8·cos(35°) + footprint·sin(35°) on screen; scale so it is `px` tall.
  const worldPerPx = (1.8 * Math.cos(pitch) + 0.12) / px;
  const h = cellH * worldPerPx, w = cellW * worldPerPx;
  const dir = new Vector3(0, -Math.sin(pitch), -Math.cos(pitch));
  const groundPt = new Vector3(target.x, 0, target.z);
  ortho.position.copy(groundPt).addScaledVector(dir, -60);
  ortho.up.set(0, 1, 0);
  ortho.lookAt(groundPt);
  const anchor = 0.74;                                   // skater ground point 74% from the top (DESIGN §8)
  ortho.left = -w / 2; ortho.right = w / 2; ortho.top = anchor * h; ortho.bottom = -(1 - anchor) * h;
  ortho.near = 1; ortho.far = 200;
  ortho.updateProjectionMatrix();
  return ortho;
}

const wrap = document.getElementById('wrap')!;
wrap.style.transform = `scale(${ZOOM})`;
wrap.style.width = `${W}px`; wrap.style.height = `${H}px`;
const labels = document.getElementById('labels')!;
if (cellW < 70) labels.style.fontSize = '7px';
document.getElementById('title')!.textContent = `${sheet} · ${px}px · dpr ${DPR}`;
for (let i = 0; i < cells.length; i++) {
  const v = views[i]!;
  for (const o of views) o.object3d.visible = o === v;
  const cx = (i % cols) * cellW, cy = Math.floor(i / cols) * cellH + 18;
  const cam = frameCell(i);
  // Sun behind the camera, 35° to the left, golden elevation 22° (as world/render does).
  v.object3d.getWorldPosition(target);
  const elev = (22 * Math.PI) / 180, az = (35 * Math.PI) / 180;
  sun.target.position.set(target.x, 0, target.z);
  sun.position.set(target.x - Math.sin(az) * Math.cos(elev) * 30, Math.sin(elev) * 30, target.z + Math.cos(az) * Math.cos(elev) * 30);
  sun.target.updateMatrixWorld();
  sun.shadow.camera.left = -4; sun.shadow.camera.right = 4; sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
  sun.shadow.camera.updateProjectionMatrix();
  r.setViewport(cx, H - cy - cellH, cellW, cellH);
  r.setScissor(cx, H - cy - cellH, cellW, cellH);
  r.render(gfx.scene, cam);
  const d = document.createElement('div');
  d.style.left = `${cx}px`; d.style.top = `${cy + cellH - 13}px`; d.style.width = `${cellW}px`;
  d.textContent = cellW < 70 ? cells[i]!.label.split(' ')[0]! : cells[i]!.label;
  labels.appendChild(d);
}

const st = views.map((v) => v.stats());
const info = r.info;
(window as unknown as { __views: unknown }).__views = views;
(window as unknown as { __sheet: object }).__sheet = {
  done: true, cells: cells.length, width: W * ZOOM, height: H * ZOOM,
  maxCalls: Math.max(...st.map((s) => s.drawCalls)), maxTris: Math.max(...st.map((s) => s.tris)),
  switchMs: { first: Math.max(...switchMs), firstAvg: switchMs.reduce((a, b) => a + b, 0) / switchMs.length, again: Math.max(...reSwitch) },
  parts: st.map((s, i) => ({ label: cells[i]!.label, ...s.parts, calls: s.drawCalls, tris: s.tris })),
  renderInfo: { calls: info.render.calls, triangles: info.render.triangles },
};
