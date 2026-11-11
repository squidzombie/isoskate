// tests/unit/render/gallery.ts: the WA gallery page (served by Vite; driven by gallery.mjs). Builds synthetic chunks
// from core types (fixtures.ts) and renders them through the REAL WorldView, camera rig, VFX and skater view, at the
// page's viewport. Scenes (query string):
//   ?scene=props&area=neon&page=0     every PropKind skinned for the area, a page at a time (labels on each)
//   ?scene=decor&area=docks&page=0    every DECOR_KINDS entry listed for the area (both sides)
//   ?scene=street&area=suburbs        a dense street vignette (what a WG segment will look like)
//   ?scene=street&area=docks&to=neon&u=0.5   the same vignette across a gateway blend
//   ?scene=vehicles&area=suburbs&page=0  every vehicle body the area shows, each in both facings: the oncoming lane
//                                     (x < 0, nose toward the camera) beside the near lane (x > 0, rear toward it)
//     &paints=1   cycle every RECLAIM.carPaint key over the cars;  &bloom=1  flowers in every pickup bed (previews of
//                 skin bits core may not roll yet: test-only, through DRESSER)
//   &zoom=3&fs=6&fx=-1.3&fy=0.7   a close-up: the run frame cropped around the world point (S0 + fs, fx, fy)
//   &cam=run|title|locker  &speed=7   camera mode and framing speed;  &t=…  run time for the speed schedule
// window.__gallery: { ready, label, stats, contrast() } — contrast() runs the real gate (debug/contrast.ts).
import { Vector3, type PerspectiveCamera } from 'three';
import { DECOR_KINDS, type DecorKind } from '../../../src/core/decor';
import type { AreaId, PropKind } from '../../../src/core/ids';
import { Dress, propSkin, type VehicleBody } from '../../../src/core/skins';
import type { ScoreState, SkaterState } from '../../../src/core/sim';
import { CHUNK_LEN } from '../../../src/core/tuning';
import type { CameraMode, RenderFrame, Viewport } from '../../../src/core/view';
import type { AreaBlend, Chunk, Coin, Decor, Obstacle } from '../../../src/core/world';
import { measureContrast } from '../../../src/debug/contrast';
import { DEFAULT_LOADOUT } from '../../../src/content';
import { createGfx, originOf, readViewport } from '../../../src/gfx';
import { readWorldPoints } from '../../../src/gfx/silhouette';
import { SkaterViewImpl, basePose } from '../../../src/skater';
import { createVfx } from '../../../src/vfx';
import { createCameraRig, createWorldView } from '../../../src/world/render';
import { noseTowardCamera } from '../../../src/world/render/kits/car';
import { BLOOM, DRESSER } from '../../../src/world/render/kits/dress';
import { RECLAIM } from '../../../src/world/render/palette';
import { AREAS, ALL_PROP_KINDS, decorOf, fakeGen, obstacleOf, place, resetIds } from './fixtures';

const q = new URLSearchParams(location.search);
const scene = q.get('scene') ?? 'street';
const area = (q.get('area') as AreaId | null) ?? 'downtown';
const to = q.get('to') as AreaId | null;
const u = Number(q.get('u') ?? 0.5);
const page = Number(q.get('page') ?? 0);
const cam = (q.get('cam') as CameraMode | null) ?? 'run';
const speed = Number(q.get('speed') ?? 7);
const quality = (q.get('quality') as 'low' | 'med' | 'high' | null) ?? 'high';
const labels = q.get('labels') !== '0';
const skip = new Set((q.get('no') ?? '').split(',').filter(Boolean));
const S0 = 64;                       // the player's s (chunk 2), content ahead of it

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const gfx = createGfx(canvas, quality);
const vp: Viewport = readViewport(gfx.renderer.getPixelRatio());
gfx.renderer.setSize(vp.wCss, vp.hCss, false);
const world = createWorldView(gfx);
const rig = createCameraRig();
rig.setMode(cam);
const vfx = createVfx(gfx);
const skater = new SkaterViewImpl(gfx);
skater.setLoadout(DEFAULT_LOADOUT);
gfx.scene.add(skater.object3d);

// ── content ─────────────────────────────────────────────────────────────────────────────────────────────────────
resetIds();
const chunks = new Map<number, Chunk>();
const blendAt = (s: number): { area: AreaId; blend: AreaBlend | null } => {
  if (!to) return { area, blend: null };
  // The palette window (8 s ≈ 60 m) centred on the vignette: u at the player, ramping along s.
  const uu = Math.min(1, Math.max(0, u + (s - S0 - 12) / 60));
  return { area: uu < 0.5 ? area : to, blend: { from: area, to, u: uu } };
};
const areaFn = (s: number) => blendAt(s).area;
const tags: { s: number; x: number; y: number; text: string }[] = [];
const coins: Coin[] = [];
let coinId = 1;
const coinAt = (s: number, x: number, y: number) => coins.push({ id: coinId++, p: { s, x, y }, value: 1, line: 'trick' });

const kindsFor = (a: AreaId): PropKind[] => {
  const shared: PropKind[] = ['barrier_low', 'trench', 'trash_can', 'cone', 'flatbar', 'bench', 'manual_pad', 'stairs', 'handrail', 'hubba', 'incline', 'terrace', 'filler', 'curb'];
  const own: Record<AreaId, PropKind[]> = {
    downtown: ['granite_ledge', 'planter', 'planter_tree', 'fountain', 'bollard_row', 'kiosk', 'parked_car', 'bike_rack', 'cafe_set', 'news_box', 'crosswalk_car'],
    suburbs: ['hedge', 'garden_wall', 'picket_fence', 'mailbox', 'wheelie_bins', 'parked_car', 'parked_van', 'porch_steps', 'yard_table', 'crate_stack', 'speed_hump', 'hoop_pole', 'bus_shelter', 'backout_car'],
    docks: ['container', 'pallet_1', 'pallet_2', 'pallet_3', 'pallet_tall', 'ibeam', 'loading_dock', 'drum_cluster', 'spool_standing', 'spool_lying', 'mooring_bollard', 'dock_lip', 'rail_track', 'forklift'],
    neon: ['guard_rail', 'vending_bank', 'viaduct_pillar', 'holo_gate', 'cherry_planter', 'food_cart', 'bike_row', 'skywalk', 'a_frame_sign', 'lantern_stand', 'neon_curb', 'delivery_robot'],
  };
  return [...own[a], ...shared];
};

function propsScene(): void {
  const list = kindsFor(area);
  const perPage = 9;
  const kinds = list.slice(page * perPage, page * perPage + perPage);
  const obs: Obstacle[] = [];
  // A 3 × 3 grid ahead of the player; full-width kinds take a whole row.
  let row = 0, col = 0;
  const rowS = (r: number) => S0 + 4 + r * 7.5;
  for (const k of kinds) {
    const full = ['barrier_low', 'holo_gate', 'trench', 'terrace', 'speed_hump', 'rail_track', 'bollard_row', 'viaduct_pillar'].includes(k);
    if (full && col > 0) { row++; col = 0; }
    const x = full ? (k === 'trench' ? 1.2 : 0) : [-2.3, 0, 2.3][col]!;
    const s = rowS(row);
    const list2 = obstacleOf(k, area, s, k === 'guard_rail' || k === 'dock_lip' || k === 'curb' || k === 'neon_curb' ? (col === 0 ? -3 : 3) : x, page);
    obs.push(...list2);
    tags.push({ s: s - 0.6, x, y: 0, text: k });
    if (full) { row++; col = 0; } else if (++col === 3) { row++; col = 0; }
  }
  // shade=1: the whole street in a building's shadow (the gate's worst case: ink hazards vs shadowed asphalt).
  const decor: Decor[] = q.get('shade') === '1'
    ? [0, 1, 2, 3, 4].map((k) => ({ kind: 'shadow_caster', s: S0 - 40 + k * 24, x: -6, y: 0, rotY: 0, scale: 1, variant: 0, castShadow: true, params: { w: 10, d: 24, h: 40 } }))
    : [];
  place(chunks, areaFn, obs, decor);
}

function decorScene(): void {
  const kinds = (Object.keys(DECOR_KINDS) as DecorKind[]).filter((k) => (DECOR_KINDS[k].areas as readonly string[]).includes(area));
  const perPage = 12;
  const list = kinds.slice(page * perPage, page * perPage + perPage);
  const decor: Decor[] = [];
  list.forEach((k, i) => {
    const s = S0 + 2 + Math.floor(i / 2) * 5, side: -1 | 1 = i % 2 ? 1 : -1;
    decor.push(decorOf(k, area, s, side, i));
    tags.push({ s, x: side * 3.6, y: 0.2, text: k });
  });
  place(chunks, areaFn, [], decor);
}

/** A dense street vignette per area: what a WG segment will look like (obstacles + decor + coins). */
function streetScene(): void {
  const obs: Obstacle[] = [], decor: Decor[] = [];
  const A = (s: number) => areaFn(s);
  const O = (k: PropKind, s: number, x: number, v = 0) => obs.push(...obstacleOf(k, A(s), s, x, v));
  const D = (k: DecorKind, s: number, side: -1 | 1, v = 0, over: Partial<Decor> = {}) => {
    if (skip.has(k) || !(DECOR_KINDS[k].areas as readonly string[]).includes(A(s))) return;
    const d = decorOf(k, A(s), s, side, v);
    decor.push({ ...d, ...over, params: { ...d.params, ...(over.params ?? {}) } });
  };
  const base = S0 - 34;
  // Backdrop both sides along the whole stretch: buildings / houses / warehouses / towers, gaps every block.
  for (let s = base; s < S0 + 70; s += 16) {
    for (const side of [-1, 1] as const) {
      // The sun side (left) gets shorter blocks with cross-street gaps that stripe the street (as WG's M0 decor does).
      if (side < 0 && Math.floor(s / 16) % 2 === 1) continue;
      const a = A(s);
      const k: DecorKind = a === 'suburbs' ? 'house' : a === 'docks' ? (side > 0 ? 'container_stack' : 'warehouse') : a === 'neon' ? 'tower' : 'building';
      D(k, s + (side > 0 ? 3 : 0), side, Math.floor(s / 16) + (side > 0 ? 3 : 0), k === 'house' ? {} : { params: { d: 12, h: 9 + ((s / 16) % 3) * 5 } });
      if (side < 0) D('shadow_caster', s + 8, -1, Math.floor(s) % 4, { x: -11 });
    }
  }
  if (A(S0) === 'docks' || to === 'docks') D('water', S0 - 30, 1, 0, { params: { len: 100 } });
  if (A(S0) === 'docks') D('crane', S0 + 30, 1);
  // Side band: lamps, trees, furniture, signs, awnings.
  for (let s = base; s < S0 + 60; s += 9) {
    const a = A(s);
    D('street_lamp', s, -1); D('street_lamp', s + 4.5, 1);
    if (a === 'downtown') { D('awning', s + 2, -1, s); D('blade_sign', s + 6, 1, s); D('tree', s + 7, -1); D('cafe_umbrella', s + 3, 1, s); D('bike_parked', s + 1, 1); }
    if (a === 'suburbs') { D('tree', s + 2, -1, s); D('hedge_round', s + 6, 1); D('mailbox_post', s + 3, 1, s); D('bin_pair', s + 7, -1, s); D('fence_run', s, 1); }
    if (a === 'docks') { D('chain_link', s, -1); D('pallet_pile', s + 3, -1); D('drum_pile', s + 6, -1, s); D('utility_pole', s + 2, 1); }
    if (a === 'neon') { D('blade_sign', s + 1, -1, s); D('blade_sign', s + 5, 1, s + 3); D('vending_machine', s + 3, -1, s); D('paper_lantern', s + 7, 1, s); D('holo_billboard', s + 2, 1, s); D('cherry_tree', s + 6, -1); D('food_cart', s + 8, 1, s); }
  }
  // Overhead: lantern strings (Neon, Downtown) and wires.
  for (let s = base + 13; s < S0 + 60; s += 14) {
    const a = A(s);
    if (a === 'neon' || a === 'downtown') D('lantern_string', s, 1, s, { y: 3.6 }); else D('overhead_wire', s, 1, 0, { y: 4.2 });
  }
  if (A(S0) === 'neon') D('maglev_beam', S0 - 30, 1, 0, { x: -2.4, params: { len: 100 } });
  // Ground: lane dashes, a crosswalk, manholes, cracks, puddles.
  for (let s = base; s < S0 + 64; s += 32) D('lane_dash', s, 1, 0, { x: 0, params: { len: 32 } });
  D('crosswalk', S0 + 26, 1, 0, { x: 0 });
  for (let s = base + 3; s < S0 + 60; s += 7) { D('manhole', s, (s % 2 ? -1 : 1), 0, { x: s % 2 ? -1.4 : 1.6 }); D('crack', s + 3, 1, 1, { x: -0.6 + (s % 3) }); }
  D('puddle', S0 + 6, 1, 0, { x: 1.2 }); D('puddle', S0 + 15, -1, 1, { x: -1.8 }); D('oil_stain', S0 + 11, 1, 0, { x: 0.4 });
  if (A(S0) === 'neon') { D('steam_vent', S0 + 9, 1, 0, { x: 2.5 }); D('petal_scatter', S0 + 4, -1, 0, { x: -2 }); }
  if (A(S0) === 'suburbs') { D('leaf_scatter', S0 + 5, -1, 0, { x: -2 }); D('driveway', S0 + 12, 1); }
  D('end_wall', S0 + 40, -1, 2); D('end_wall', S0 + 44, 1, 3);
  // Obstacles: a representative mix per area (ledge line, a tall gate row, a full-width hazard, a car, benches).
  const a0 = A(S0 + 10);
  // The area kit's obstacles belong to a0 (one segment straddling the blend, as world/gen emits them).
  const OA = (k: PropKind, s: number, x: number, v = 0) => obs.push(...obstacleOf(k, a0, s, x, v));
  O('barrier_low', S0 + 5, 0, 0);
  if (a0 === 'downtown') { OA('granite_ledge', S0 + 9, 2.2); OA('parked_car', S0 + 10, -2.4); OA('bench', S0 + 19, 2.2); OA('bollard_row', S0 + 22, 0); OA('planter_tree', S0 + 25, -1.8); OA('news_box', S0 + 25, 1.5); }
  if (a0 === 'suburbs') { OA('garden_wall', S0 + 9, 2.2); OA('parked_van', S0 + 10, -2.3); OA('wheelie_bins', S0 + 19, -0.6); OA('mailbox', S0 + 19, 1.4); OA('hedge', S0 + 24, -3.6); OA('crate_stack', S0 + 22, 2.4); }
  if (a0 === 'docks') { OA('container', S0 + 9, -2.6); OA('ibeam', S0 + 10, 1.8); OA('drum_cluster', S0 + 19, 0.4); OA('pallet_3', S0 + 21, -0.8); OA('pallet_tall', S0 + 23, 2.3); OA('dock_lip', S0 - 20, 4.35); }
  if (a0 === 'neon') { OA('guard_rail', S0 + 8, 3); OA('vending_bank', S0 + 10, -2.2); OA('food_cart', S0 + 19, 0.8); OA('lantern_stand', S0 + 22, -2.3); OA('cherry_planter', S0 + 25, 2.3); OA('bike_row', S0 + 26, -0.6); }
  O('trench', S0 + 30, -1.2);
  for (let k = 0; k < 6; k++) coinAt(S0 + 9.5 + k * 1.2, 2.2, 0.75);
  for (let k = 0; k < 5; k++) coinAt(S0 + 2 + k * 0.6, Math.sin(k) * 0.8, 0.5);
  place(chunks, areaFn, obs, decor, coins);
}

/** Road marks at real scale (owner note 8): lane paint, a crosswalk with the road arrows that lead to it, manholes,
 *  kerb drains and the Neon after-rain vents, as WG emits them (the arrow and drain params are the generator's). */
function marksScene(): void {
  const D = (kind: DecorKind, s: number, x: number, params: Record<string, number> = {}): Decor =>
    ({ kind, s, x, y: 0, rotY: 0, scale: 1, variant: 0, castShadow: false, params });
  const decor: Decor[] = [D('lane_dash', S0 - 8, 0, { len: 64, dash: 3, gap: 3, color: area === 'suburbs' ? 1 : 0 })];
  if (area === 'downtown') decor.push(D('parking_bay', S0 - 8, -2.5, { len: 64, bays: 12 }));
  decor.push(D('crosswalk', S0 + 21, 0, { len: 3, w: 6, scramble: area === 'neon' ? 1 : 0 }));
  decor.push(D('road_arrow', S0 + 6, -1.1, { kind: area === 'docks' ? 3 : 0 }), D('road_arrow', S0 + 13, 0.3, { kind: 1 }), D('road_arrow', S0 + 17, 1.7, { kind: 3 }));
  for (const [i, r] of [0.4, 0.9, 1.4].entries()) decor.push(D('manhole', S0 + 3 + i * 6, i % 2 ? 2.2 : -2.6, { r }));
  decor.push(D('drain', S0 + 9, 3.0), D('drain', S0 + 16, -3.0), D('steam_vent', S0 + 11, -1.4, { rate: 2 }));
  decor.push(D('oil_stain', S0 + 26, 1.5, { r: 0.6 }), D('crack', S0 + 28, -1.8, { len: 1.6 }), D('puddle', S0 + 24, -2.2, { w: 0.9, len: 1.4 }));
  place(chunks, areaFn, [], decor);
}

/** The vehicle builder's bodies for an area, a page of four rows at a time: [kind, body, height]. */
const VEHICLE_ROWS: Readonly<Record<AreaId, readonly (readonly (readonly [PropKind, VehicleBody, number])[])[]>> = {
  downtown: [
    [['parked_car', 'sedan', 1.4], ['parked_car', 'estate', 1.4], ['parked_car', 'pickup', 1.4], ['parked_car', 'suv', 1.5]],
    [['parked_van', 'panel_van', 1.9], ['parked_van', 'camper', 1.9], ['container', 'box_truck', 2.6], ['container', 'shuttle_bus', 2.6]],
    [['crosswalk_car', 'sweeper', 1.4], ['backout_car', 'sedan', 1.4], ['van_across', 'panel_van', 1.4]],
  ],
  suburbs: [
    [['parked_car', 'sedan', 1.4], ['parked_car', 'estate', 1.4], ['parked_car', 'pickup', 1.5], ['parked_car', 'suv', 1.5]],
    [['parked_van', 'panel_van', 1.9], ['parked_van', 'camper', 1.9], ['backout_car', 'sedan', 1.4], ['van_across', 'panel_van', 1.4]],
  ],
  docks: [
    [['container', 'box_truck', 2.6], ['container', 'shuttle_bus', 2.6], ['parked_van', 'panel_van', 1.9], ['van_across', 'panel_van', 1.4]],
    [['parked_car', 'pickup', 1.4], ['parked_car', 'estate', 1.4], ['parked_van', 'camper', 1.9], ['parked_car', 'sedan', 1.4]],
  ],
  neon: [
    [['parked_car', 'taxi', 1.4], ['parked_van', 'kei_van', 1.9], ['container', 'box_truck', 2.6], ['container', 'shuttle_bus', 2.6]],
    [['parked_car', 'taxi', 1.4], ['van_across', 'kei_van', 1.4]],
  ],
};
const PAINT_KEYS = Object.keys(RECLAIM.carPaint) as (keyof typeof RECLAIM.carPaint)[];
let paintPick = 0;
if (q.get('paints') === '1' || q.get('bloom') === '1') {
  // Test-only previews of skin bits core may not roll yet (every paint key; Dress bit BLOOM in pickup beds).
  const begin = DRESSER.begin.bind(DRESSER);
  DRESSER.begin = (ob, s0, s1, iso) => {
    const sk = begin(ob, s0, s1, iso);
    if (q.get('paints') === '1' && sk.paint !== null && !(sk.dress & Dress.Clean)) {
      (sk as { paint: string }).paint = PAINT_KEYS[(ob.id + paintPick) % PAINT_KEYS.length]!;
    }
    if (q.get('bloom') === '1' && sk.body === 'pickup' && ob.area !== 'neon') sk.dress |= BLOOM;
    return sk;
  };
}

function vehiclesScene(): void {
  const rows = VEHICLE_ROWS[area][Math.min(page, VEHICLE_ROWS[area].length - 1)]!;
  const obs: Obstacle[] = [];
  let id = 7000, s = S0 + 4;
  for (const [kind, body, h] of rows) {
    const across = kind === 'van_across';
    for (const x of across ? [-2.3, 2.3] : [-1.35, 1.35]) {
      // The skin through propSkin: the first (id, variant) whose body and facing (its lane's: the oncoming lane shows
      // its nose) are the wanted ones.
      const nose = !across && noseTowardCamera(area, x);
      let hit: [number, number] | null = null;
      for (const facing of [true, false]) for (let i = id; i < id + 20000 && !hit; i++) for (let v = 0; v < 4 && !hit; v++) {
        const sk = propSkin(kind, area, i, v, h);
        if (sk.body === body && (across || !facing || sk.nosedIn === nose)) hit = [i, v];       // movers never nose in
      }
      if (!hit) throw new Error(`no ${kind} ${body} skin in ${area}`);
      id = hit[0] + 1;
      const o = obstacleOf(kind, area, s, x, hit[1])[0]!;
      o.id = hit[0]; o.variant = hit[1]; o.hgt = h;
      for (const so of o.solids) so.box.y1 = so.box.y0 + h;
      obs.push(o);
      tags.push({ s: s - 0.5, x, y: 0, text: `${body}${across ? '' : nose ? ' ▼nose' : ' ▲rear'}` });
    }
    s += (rows.some((r) => r[0] === 'container') ? 8.5 : 7);
  }
  paintPick = Number(q.get('paintShift') ?? 0);
  place(chunks, areaFn, obs, []);
}

if (scene === 'props') propsScene(); else if (scene === 'decor') decorScene(); else if (scene === 'marks') marksScene();
else if (scene === 'vehicles') vehiclesScene(); else streetScene();
const gen = fakeGen(chunks, (s) => blendAt(s));
world.attach(gen);

// ── frame ───────────────────────────────────────────────────────────────────────────────────────────────────────
const cur = { tick: 600, t: 30, p: { s: S0, x: 0, y: 0 }, vel: { s: speed, x: 0, y: 0 }, targetX: 0, mode: 'roll', layer: 0, groundY: 0,
  surface: area === 'neon' ? 'wetAsphalt' : 'asphalt', airT: 0, airLeft: 0, dropH: 0, coyote: 0, jumpBuffer: 0, popBleed: 0, flip: null, flipsThisAir: 0,
  airTricks: [], spin: null, fakie: false, grind: null, pickWindow: null, magnetEdge: null, magnetCancelled: false, transferArmed: false, manual: null,
  grab: null, pressRiseTick: -1, wobble: 0, crash: null } as unknown as SkaterState;
const score = { total: 0, combo: { active: false, bankIn: 0, entries: [], links: 0, pending: 0 } } as unknown as ScoreState;
const pose = basePose({ pose: cam === 'run' ? 'roll' : 'idle' });
const frame = (): RenderFrame => {
  const a = blendAt(S0);
  return { alpha: 1, dt: 1 / 60, timeScale: 1, prev: cur, cur, pose, score, events: [], playerS: S0, speed, area: a.area, blend: a.blend, viewport: vp };
};
const zoom = Number(q.get('zoom') ?? 1);
function renderOnce(): void {
  const f = frame();
  for (let i = 0; i < 10; i++) world.update(f);
  skater.update(f);
  vfx.update(f);
  rig.update(f);
  if (zoom > 1 && cam === 'run') {
    // A close-up of the run frame: the same camera, its view window cropped around the focus point.
    const c = rig.camera as PerspectiveCamera, view = c.view;
    const p = rig.project({ s: S0 + Number(q.get('fs') ?? 6), x: Number(q.get('fx') ?? 0), y: Number(q.get('fy') ?? 0.7) });
    if (view) {
      const w = view.width / zoom, h = view.height / zoom;
      const ox = view.offsetX + (p.x / vp.wCss) * view.width - w / 2, oy = view.offsetY + (p.y / vp.hCss) * view.height - h / 2;
      c.setViewOffset(view.fullWidth, view.fullHeight, ox, oy, w, h);
    }
  }
  gfx.renderer.render(gfx.scene, rig.camera);
}
renderOnce(); renderOnce();

// Labels at the props (CSS px, projected with the rig).
const tagsEl = document.getElementById('tags')!;
if (labels && cam === 'run' && zoom <= 1) for (const t of tags) {
  const p = rig.project({ s: t.s, x: t.x, y: t.y });
  const el = document.createElement('div');
  el.textContent = t.text; el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
  tagsEl.appendChild(el);
}
document.getElementById('label')!.textContent = `${scene} ${area}${to ? `→${to} ${u}` : ''} p${page} ${cam} v${speed} ${vp.wCss}×${vp.hCss}`;

// The real contrast gate on this frame (debug/contrast.ts) through a host that exposes only what it reads.
const allObs = (): Obstacle[] => { const m = new Map<number, Obstacle>(); for (const c of chunks.values()) for (const o of c.obstacles) m.set(o.id, o); return [...m.values()].sort((a, b) => a.s - b.s); };
const host = {
  loop: { renderNow: renderOnce },
  gfx, cameraRig: rig, skater,
  camera: () => ({ H: 0, yawDeg: 0, lookAheadSec: 2.6, aspect: vp.aspect }),
  sim: () => ({ cur, world: { obstacles: (s0: number, s1: number) => allObs().filter((o) => o.s + o.len >= s0 && o.s <= s1), coins: () => coins,
    // WorldQuery.groundAt for the gate's silhouette test: the highest slab top ≤ yMax under (s, x), else the datum.
    groundAt: (s: number, x: number, yMax: number) => {
      let y = 0;
      for (const o of allObs()) for (const sl of o.slabs) {
        if (s < sl.s0 || s >= sl.s1 || x < sl.x0 || x > sl.x1) continue;
        const top = sl.y0 + (sl.y1 - sl.y0) * ((s - sl.s0) / Math.max(1e-6, sl.s1 - sl.s0));
        if (top <= yMax && top > y) y = top;
      }
      return { y, surface: 'asphalt', layer: 0, slab: null, pit: null };
    } } }),
};
const w = world as unknown as { debugInfo(): Record<string, unknown> };
const v = new Vector3();
void v;
(window as unknown as { __gallery: unknown }).__gallery = {
  ready: true,
  label: document.getElementById('label')!.textContent,
  stats: () => ({ calls: gfx.renderer.info.render.calls, tris: gfx.renderer.info.render.triangles, ...w.debugInfo() }),
  contrast: () => measureContrast(host as never),
  kinds: { props: ALL_PROP_KINDS.length, areas: AREAS.length, chunk: CHUNK_LEN },
  /** Debug: the frame with every crash solid's silhouette pixels (world point inside its box) tinted red. */
  mask: (): string => {
    renderOnce();
    const el = gfx.renderer.domElement, W = el.width, H = el.height;
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const x2 = c2.getContext('2d')!;
    x2.drawImage(el, 0, 0);
    const img = x2.getImageData(0, 0, W, H);
    const wp = readWorldPoints(gfx.renderer, gfx.scene, rig.camera, W, H);
    if (!wp) return '';
    const o = originOf(S0), boxes = allObs().flatMap((ob) => ob.solids.filter((so) => so.top === 'crash').map((so) => so.box));
    for (let i = 0; i < W * H; i++) {
      const x = wp.xyz[i * 3]!, y = wp.xyz[i * 3 + 1]!, s = o - wp.xyz[i * 3 + 2]!;
      if (Number.isNaN(x)) continue;
      if (boxes.some((b) => x >= b.x0 - 0.05 && x <= b.x1 + 0.05 && s >= b.s0 - 0.05 && s <= b.s1 + 0.05 && y >= b.y0 + 0.025 && y <= b.y1 + 0.05)
        && y >= host.sim().world.groundAt(s, x, y + 0.01).y + 0.025) {
        img.data[i * 4] = (img.data[i * 4]! + 255) / 2; img.data[i * 4 + 1] = img.data[i * 4 + 1]! / 2; img.data[i * 4 + 2] = img.data[i * 4 + 2]! / 2;
      }
    }
    x2.putImageData(img, 0, 0);
    return c2.toDataURL('image/png');
  },
  /** Debug: visible meshes with their world bounds. */
  objects: () => {
    const out: { name: string; min: number[]; max: number[] }[] = [];
    gfx.scene.traverseVisible((o) => {
      const m = o as import('three').Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
      out.push({ name: m.name || m.type, min: b.min.toArray().map((x) => +x.toFixed(1)), max: b.max.toArray().map((x) => +x.toFixed(1)) });
    });
    return out;
  },
};
