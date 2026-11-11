// tests/unit/render/fixtures.ts: synthetic world content built from the core types (WG builds the real thing in
// parallel). Obstacles follow DESIGN §10.3 sizes and the M0 builder conventions (world/gen/props/common.ts: anchor
// front-centre at local ground, T kinds landable with a top slab, K kinds knock, else crash; tall = top − ground ≥ 1.15;
// edges ≤ STEP_UP above ground are pick-only), decor follows core/decor.ts conventions. Used by the gallery page and
// the unit tests (every PropKind × area, every DECOR_KINDS entry).
import { DECOR_BRANDS, DECOR_KINDS, NEON_SIGN_WORDS, type DecorKind } from '../../../src/core/decor';
import type { AreaId, EdgeKind, EdgeMaterial, GatewayId, PropKind, Surface } from '../../../src/core/ids';
import { CHUNK_LEN } from '../../../src/core/tuning';
import type { AreaBlend, Chunk, Coin, Decor, GrindEdge, GroundSlab, Obstacle, Pit, Solid, WorldGen } from '../../../src/core/world';
import { ObTag } from '../../../src/core/world';

export const AREAS: readonly AreaId[] = ['downtown', 'suburbs', 'docks', 'neon'];
export const ALL_PROP_KINDS: readonly PropKind[] = [
  'curb', 'flatbar', 'bench', 'manual_pad', 'trash_can', 'cone', 'barrier_low', 'trench', 'stairs', 'handrail', 'hubba', 'incline', 'terrace', 'filler', 'van_across',
  'granite_ledge', 'planter', 'planter_tree', 'fountain', 'bollard_row', 'kiosk', 'parked_car', 'bike_rack', 'cafe_set', 'news_box', 'crosswalk_car',
  'garden_wall', 'hedge', 'picket_fence', 'mailbox', 'wheelie_bins', 'parked_van', 'porch_steps', 'yard_table', 'crate_stack', 'speed_hump', 'hoop_pole', 'bus_shelter', 'backout_car',
  'container', 'pallet_1', 'pallet_2', 'pallet_3', 'pallet_tall', 'ibeam', 'loading_dock', 'drum_cluster', 'spool_standing', 'spool_lying', 'mooring_bollard', 'dock_lip', 'rail_track', 'forklift',
  'guard_rail', 'vending_bank', 'viaduct_pillar', 'holo_gate', 'cherry_planter', 'food_cart', 'bike_row', 'skywalk', 'a_frame_sign', 'lantern_stand', 'neon_curb', 'delivery_robot',
];
const LANDABLE = new Set<PropKind>(['granite_ledge', 'bench', 'planter', 'planter_tree', 'garden_wall', 'crate_stack', 'manual_pad', 'pallet_2', 'pallet_3',
  'loading_dock', 'skywalk', 'hubba', 'curb', 'neon_curb', 'cherry_planter', 'terrace']);
const KNOCK = new Set<PropKind>(['cone', 'a_frame_sign']);

let nextId = 1, nextEdge = 1;
export function resetIds(): void { nextId = 1; nextEdge = 1; }

interface Spec { kind: PropKind; area: AreaId; s: number; x: number; len: number; wid: number; hgt: number; ground?: number;
  edges?: { side: -1 | 0 | 1; kind: EdgeKind; material: EdgeMaterial }[]; tags?: number; params?: Record<string, number>; variant?: number; surface?: Surface }

/** The generic builder (mirrors world/gen/props/common.ts buildProp). */
export function prop(sp: Spec): Obstacle {
  const g = sp.ground ?? 0, s0 = sp.s, s1 = sp.s + sp.len, x0 = sp.x - sp.wid / 2, x1 = sp.x + sp.wid / 2, top = g + sp.hgt;
  const topType: Solid['top'] = LANDABLE.has(sp.kind) ? 'landable' : KNOCK.has(sp.kind) ? 'knock' : 'crash';
  const id = nextId++;
  const solids: Solid[] = [], slabs: GroundSlab[] = [], edges: GrindEdge[] = [];
  if (sp.hgt > 0.18 || topType !== 'landable') solids.push({ box: { s0, s1, x0, x1, y0: g, y1: top }, top: topType, tall: sp.hgt >= 1.15 });
  if (topType === 'landable') slabs.push({ s0, s1, x0, x1, y0: top, y1: top, layer: 0, surface: sp.surface ?? 'granite', kind: 'flat' });
  for (const e of sp.edges ?? []) {
    const ex = e.side < 0 ? x0 : e.side > 0 ? x1 : sp.x;
    edges.push({ id: nextEdge++, obstacleId: id, a: { s: s0, x: ex, y: top }, b: { s: s1, x: ex, y: top }, kind: e.kind, material: e.material, layer: 0, pickOnly: sp.hgt <= 0.18 });
  }
  let tags = sp.tags ?? 0;
  if (edges.length) tags |= ObTag.Grindable;
  return { id, kind: sp.kind, area: sp.area, segment: 0, s: s0, x: sp.x, len: sp.len, wid: sp.wid, hgt: sp.hgt, rotY: 0, mirror: false, variant: sp.variant ?? 0,
    solids, slabs, pits: [], edges, tags, ...(sp.params ? { params: sp.params } : {}) };
}

/** Sidewalk + curb on one side (M0 layout: road −3…+3, sidewalks at +0.15 to ±4.5) over [s0, s1). */
export function curb(area: AreaId, side: -1 | 1, s0: number, s1: number, kind: 'curb' | 'neon_curb' = 'curb'): Obstacle {
  const xIn = 3 * side, xOut = 4.5 * side, id = nextId++;
  const surface: Surface = area === 'neon' ? 'tile' : 'concrete';
  return { id, kind, area, segment: 0, s: s0, x: (xIn + xOut) / 2, len: s1 - s0, wid: 1.5, hgt: 0.15, rotY: 0, mirror: false, variant: 0, solids: [], pits: [], tags: ObTag.Grindable,
    slabs: [{ s0, s1, x0: Math.min(xIn, xOut), x1: Math.max(xIn, xOut), y0: 0.15, y1: 0.15, layer: 0, surface, kind: 'flat' }],
    edges: [{ id: nextEdge++, obstacleId: id, a: { s: s0 + 0.5, x: xIn, y: 0.15 }, b: { s: s1 - 0.5, x: xIn, y: 0.15 }, kind: 'curb', material: 'concrete', layer: 0, pickOnly: true }] };
}

/** One obstacle of `kind` in `area` anchored at (s, x) with DESIGN §10.3 sizes. */
export function obstacleOf(kind: PropKind, area: AreaId, s: number, x: number, variant = 0): Obstacle[] {
  const P = (o: Omit<Spec, 'kind' | 'area' | 's' | 'x'> & { s?: number; x?: number }) => prop({ kind, area, s, x, variant, ...o });
  const ground = Math.abs(x) >= 3 ? 0.15 : 0;
  switch (kind) {
    case 'curb': return [curb(area, x < 0 ? -1 : 1, s, s + 12)];
    case 'neon_curb': return [curb(area, x < 0 ? -1 : 1, s, s + 12, 'neon_curb')];
    case 'flatbar': return [P({ len: 6, wid: 0.05, hgt: 0.4, edges: [{ side: 0, kind: 'rail', material: area === 'neon' ? 'neon' : 'metal' }], tags: ObTag.TrickLine })];
    case 'bench': return [P({ len: 2, wid: 0.5, hgt: 0.45, edges: [{ side: -1, kind: 'bench', material: 'stone' }, { side: 1, kind: 'bench', material: 'stone' }], surface: 'wood' })];
    case 'manual_pad': return [P({ len: 4, wid: 1.2, hgt: 0.15, edges: [{ side: -1, kind: 'curb', material: 'concrete' }, { side: 1, kind: 'curb', material: 'concrete' }], surface: 'concrete' })];
    case 'trash_can': case 'filler': return [P({ len: 0.6, wid: 0.6, hgt: 1.15, ground })];
    case 'cone': return [P({ len: 0.3, wid: 0.3, hgt: 0.5, tags: ObTag.Knockable })];
    case 'barrier_low': case 'holo_gate': {
      const ob = P({ x: 0, len: 0.6, wid: 9, hgt: variant % 2 ? 0.5 : 0.35, tags: ObTag.FullWidth | ObTag.Required, params: variant >= 2 ? { slotX: 1.2, slotW: 2 } : {} });
      if (variant >= 2) { const b = ob.solids[0]!.box; ob.solids = [{ ...ob.solids[0]!, box: { ...b, x1: 0.2 } }, { ...ob.solids[0]!, box: { ...b, x0: 2.2 } }]; }
      return [ob];
    }
    case 'trench': {
      const len = 2.6, ob = P({ x: 0, len, wid: 9, hgt: 0, tags: ObTag.FullWidth | ObTag.Required, params: { plankX: x, plankW: 1.2, depth: 0.6 } });
      ob.solids = [];
      const pits: Pit[] = [[-4.5, -3, 0.15], [-3, 3, 0], [3, 4.5, 0.15]].map(([x0, x1, lip]) => ({ s0: s, s1: s + len, x0: x0!, x1: x1!, lipY: lip!, depth: 0.6, cause: 'fall' as const }));
      ob.pits = pits;
      ob.slabs = [{ s0: s, s1: s + len, x0: x - 0.6, x1: x + 0.6, y0: 0, y1: 0, layer: 0, surface: 'wood', kind: 'flat' }];
      return [ob];
    }
    case 'stairs': case 'terrace': {
      const full = kind === 'terrace', n = full ? 5 : 3, drop = 0.17 * n, len = 0.3 * n;
      const x0 = full ? -4.5 : x - 1.2, x1 = full ? 4.5 : x + 1.2;
      const id = nextId++;
      const ob: Obstacle = { id, kind, area, segment: 0, s, x: full ? 0 : x, len: len + 3, wid: x1 - x0, hgt: drop, rotY: 0, mirror: false, variant, solids: [], pits: [], edges: [], tags: full ? ObTag.FullWidth : 0,
        slabs: [{ s0: s - 3, s1: s, x0, x1, y0: drop, y1: drop, layer: 0, surface: 'concrete', kind: 'flat' },
          { s0: s, s1: s + len, x0, x1, y0: drop, y1: 0, layer: 0, surface: 'concrete', kind: 'stairs', steps: n }] };
      if (!full) ob.solids.push({ box: { s0: s - 3, s1: s + len, x0, x1, y0: 0, y1: drop }, top: 'landable', tall: false });
      return [ob];
    }
    case 'handrail': case 'hubba': {
      const n = 5, drop = 0.85, len = 1.5, id = nextId++, hub = kind === 'hubba';
      const off = hub ? 0.45 : 0.6, w = hub ? 0.6 : 0.05;
      const e: GrindEdge = { id: nextEdge++, obstacleId: id, a: { s: s - 0.5, x, y: drop + off }, b: { s: s + len, x, y: off }, kind: hub ? 'hubba' : 'rail', material: hub ? 'stone' : 'metal', layer: 0, pickOnly: false };
      return [{ id, kind, area, segment: 0, s: s - 0.5, x, len: len + 0.5, wid: w, hgt: off, rotY: 0, mirror: false, variant, pits: [], tags: ObTag.Grindable,
        // A hubba is one landable block; a handrail is stepped crash solids under its rail (as world/gen builds it).
        solids: hub ? [{ box: { s0: s - 0.5, s1: s + len, x0: x - w / 2, x1: x + w / 2, y0: 0, y1: drop + off }, top: 'landable', tall: false }]
          : [{ box: { s0: s - 0.5, s1: s, x0: x - w / 2, x1: x + w / 2, y0: drop, y1: drop + off }, top: 'crash' as const, tall: false },
            ...[0, 1, 2].map((k) => ({ box: { s0: s + (k * len) / 3, s1: s + ((k + 1) * len) / 3, x0: x - w / 2, x1: x + w / 2, y0: drop * (1 - (k + 1) / 3),
              y1: drop + off - (drop * (0.5 + ((k + 0.5) * len) / 3)) / (len + 0.5) }, top: 'crash' as const, tall: false }))],
        slabs: [{ s0: s - 3, s1: s, x0: x - 1.6, x1: x + 1.6, y0: drop, y1: drop, layer: 0, surface: 'concrete', kind: 'flat' },
          { s0: s, s1: s + len, x0: x - 1.6, x1: x + 1.6, y0: drop, y1: 0, layer: 0, surface: 'concrete', kind: 'stairs', steps: n }], edges: [e] }];
    }
    case 'incline': {
      const id = nextId++;
      return [{ id, kind, area, segment: 0, s, x, len: 8, wid: 3, hgt: 0.8, rotY: 0, mirror: false, variant, solids: [], pits: [], edges: [], tags: 0,
        slabs: [{ s0: s, s1: s + 8, x0: x - 1.5, x1: x + 1.5, y0: 0, y1: 0.8, layer: 0, surface: 'concrete', kind: 'incline' }] }];
    }
    case 'granite_ledge': return [P({ len: 8, wid: 0.6, hgt: 0.45, edges: [{ side: -1, kind: 'ledge', material: 'stone' }, { side: 1, kind: 'ledge', material: 'stone' }], tags: ObTag.TrickLine })];
    case 'planter': return [P({ len: 3, wid: 1.5, hgt: 0.5, edges: [{ side: -1, kind: 'rim', material: 'stone' }, { side: 1, kind: 'rim', material: 'stone' }] })];
    case 'planter_tree': case 'cherry_planter': {
      const l = kind === 'planter_tree' ? 3 : 2.4, w = kind === 'planter_tree' ? 1.5 : 1.2, ob = P({ len: l, wid: w, hgt: 0.5, edges: [{ side: -1, kind: 'rim', material: 'stone' }, { side: 1, kind: 'rim', material: 'stone' }] });
      const th = kind === 'planter_tree' ? 2.6 : 2.8;
      ob.solids.push({ box: { s0: s + l / 2 - 0.15, s1: s + l / 2 + 0.15, x0: x - 0.15, x1: x + 0.15, y0: 0.5, y1: 0.5 + th }, top: 'crash', tall: true });
      return [ob];
    }
    case 'fountain': {
      const id = nextId++, L = 4, W = 3.2, rw = 0.3, h = 0.4, x0 = x - W / 2, x1 = x + W / 2;
      const box = (a: number, b: number, c: number, d: number): Solid => ({ box: { s0: a, s1: b, x0: c, x1: d, y0: 0, y1: h }, top: 'landable', tall: false });
      return [{ id, kind, area, segment: 0, s, x, len: L, wid: W, hgt: h, rotY: 0, mirror: false, variant, tags: ObTag.Grindable,
        solids: [box(s, s + rw, x0, x1), box(s + L - rw, s + L, x0, x1), box(s, s + L, x0, x0 + rw), box(s, s + L, x1 - rw, x1)],
        slabs: [], pits: [{ s0: s + rw, s1: s + L - rw, x0: x0 + rw, x1: x1 - rw, lipY: 0, depth: 0.35, cause: 'splash' }],
        edges: [{ id: nextEdge++, obstacleId: id, a: { s, x: x0, y: h }, b: { s: s + L, x: x0, y: h }, kind: 'rim', material: 'stone', layer: 0, pickOnly: false }] }];
    }
    case 'bollard_row': {
      const id = nextId++, solids: Solid[] = [];
      for (let k = 0; k < 6; k++) { if (k === 2) continue; const bx = -4 + k * 1.6; solids.push({ box: { s0: s, s1: s + 0.25, x0: bx - 0.125, x1: bx + 0.125, y0: 0, y1: 1.15 }, top: 'crash', tall: true }); }
      return [{ id, kind, area, segment: 0, s, x: 0, len: 0.25, wid: 8.25, hgt: 1.15, rotY: 0, mirror: false, variant, solids, slabs: [], pits: [], edges: [], tags: 0 }];
    }
    case 'kiosk': return [P({ len: 1.6, wid: 1.6, hgt: 2.4 })];
    case 'parked_car': case 'crosswalk_car': case 'backout_car': return [P({ len: kind === 'crosswalk_car' ? 4.2 : 4.4, wid: 1.8, hgt: 1.4 })];
    case 'parked_van': return [P({ len: 4.6, wid: 1.9, hgt: 1.9 })];
    case 'van_across': return [P({ len: 1.8, wid: 4.4, hgt: 1.4 })];
    case 'bike_rack': return [P({ len: 2.4, wid: 0.7, hgt: 1.15 })];
    case 'cafe_set': return [P({ len: 1.2, wid: 1.2, hgt: 1.2 })];
    case 'news_box': return [P({ len: 0.5, wid: 0.5, hgt: 1.15, ground })];
    case 'garden_wall': return [P({ len: 6, wid: 0.4, hgt: 0.5, edges: [{ side: -1, kind: 'ledge', material: 'stone' }, { side: 1, kind: 'ledge', material: 'stone' }], surface: 'concrete' })];
    case 'hedge': return [P({ len: 8, wid: 0.4, hgt: 1.3 })];
    case 'picket_fence': return [P({ len: 8, wid: 0.4, hgt: 1.2 })];
    case 'mailbox': return [P({ len: 0.4, wid: 0.4, hgt: 1.2, ground })];
    case 'wheelie_bins': return [P({ len: 0.7, wid: 1.5, hgt: 1.2, ground })];
    case 'porch_steps': {
      const id = nextId++, sx = x;
      return [{ id, kind, area, segment: 0, s, x: sx, len: 2.4, wid: 1.6, hgt: 0.34, rotY: 0, mirror: false, variant, pits: [], tags: ObTag.Grindable,
        solids: [{ box: { s0: s, s1: s + 1.2, x0: sx - 0.8, x1: sx + 0.8, y0: 0, y1: 0.34 }, top: 'landable', tall: false }],
        slabs: [{ s0: s, s1: s + 1.2, x0: sx - 0.8, x1: sx + 0.8, y0: 0.34, y1: 0.34, layer: 0, surface: 'wood', kind: 'flat' },
          { s0: s + 1.2, s1: s + 1.8, x0: sx - 0.8, x1: sx + 0.8, y0: 0.34, y1: 0, layer: 0, surface: 'wood', kind: 'stairs', steps: 2 }],
        edges: [{ id: nextEdge++, obstacleId: id, a: { s: s + 0.1, x: sx + 0.8, y: 0.89 }, b: { s: s + 1.8, x: sx + 0.8, y: 0.55 }, kind: 'rail', material: 'wood', layer: 0, pickOnly: false }] }];
    }
    case 'yard_table': return [P({ len: 2, wid: 0.8, hgt: 1.15 })];
    case 'crate_stack': return [P({ len: 0.6, wid: 0.4, hgt: 0.3, surface: 'wood' })];
    case 'speed_hump': { const ob = P({ x: 0, len: 3, wid: 9, hgt: 0.08 }); ob.solids = []; return [ob]; }
    case 'hoop_pole': return [P({ len: 0.2, wid: 0.2, hgt: 3, ground })];
    case 'bus_shelter': return [P({ len: 1.6, wid: 3, hgt: 2.4, ground })];
    case 'container': return [P({ len: 6.1, wid: 2.4, hgt: 2.6 })];
    case 'pallet_1': return [(() => { const o = P({ len: 1.2, wid: 1.0, hgt: 0.15 }); o.solids = []; return o; })()];
    case 'pallet_2': return [P({ len: 1.2, wid: 1.0, hgt: 0.3, surface: 'wood' })];
    case 'pallet_3': return [P({ len: 1.2, wid: 1.0, hgt: 0.45, surface: 'wood' })];
    case 'pallet_tall': return [P({ len: 1.2, wid: 1.0, hgt: 1.2 })];
    case 'ibeam': return [P({ len: 8, wid: 0.2, hgt: 0.4, edges: [{ side: 0, kind: 'rail', material: 'metal' }], tags: ObTag.TrickLine })];
    case 'loading_dock': {
      const ob = P({ len: 12, wid: 2.5, hgt: 1.2, surface: 'concrete', edges: [{ side: 1, kind: 'ledge', material: 'metal' }] });
      ob.slabs.unshift({ s0: s - 8, s1: s, x0: x - 1.25, x1: x + 1.25, y0: 0, y1: 1.2, layer: 1, surface: 'concrete', kind: 'incline' });
      return [ob];
    }
    case 'drum_cluster': return [P({ len: 1.3, wid: 1.3, hgt: 1.15 })];
    case 'spool_standing': return [P({ len: 1.2, wid: 1.2, hgt: 1.2 })];
    case 'spool_lying': return [P({ len: 0.8, wid: 1.0, hgt: 0.5 })];
    case 'mooring_bollard': return [P({ len: 0.5, wid: 0.5, hgt: 1.15 })];
    case 'dock_lip': return [P({ x: 4.35, len: 14, wid: 0.3, hgt: 0.3, edges: [{ side: -1, kind: 'lip', material: 'concrete' }] })];
    case 'rail_track': { const o = P({ x: 0, len: 1.8, wid: 9, hgt: 0.02 }); o.solids = []; return [o]; }
    case 'forklift': return [P({ len: 2.5, wid: 1.2, hgt: 2.1 })];
    case 'guard_rail': return [P({ x: x < 0 ? -3 : 3, len: 12, wid: 0.06, hgt: 0.5, edges: [{ side: 0, kind: 'rail', material: 'neon' }], tags: ObTag.TrickLine })];
    case 'vending_bank': return [P({ len: 0.8, wid: 3, hgt: 1.8 })];
    case 'viaduct_pillar': return [P({ x: 0, len: 1.2, wid: 1.2, hgt: 6 })];
    case 'food_cart': return [P({ len: 2, wid: 1.2, hgt: 2.2 })];
    case 'bike_row': return [P({ len: 6, wid: 0.6, hgt: 1.15 })];
    case 'skywalk': {
      const id = nextId++, x0 = x - 1.5, x1 = x + 1.5, y = 2;
      return [{ id, kind, area, segment: 0, s, x, len: 30, wid: 3, hgt: 2, rotY: 0, mirror: false, variant, pits: [], tags: ObTag.Grindable | ObTag.Elevated,
        solids: [{ box: { s0: s + 8, s1: s + 30, x0, x1, y0: 0, y1: y }, top: 'landable', tall: true }],
        slabs: [{ s0: s, s1: s + 8, x0, x1, y0: 0, y1: y, layer: 1, surface: 'tile', kind: 'incline' }, { s0: s + 8, s1: s + 30, x0, x1, y0: y, y1: y, layer: 1, surface: 'tile', kind: 'flat' }],
        edges: [{ id: nextEdge++, obstacleId: id, a: { s: s + 8.5, x: x0 + 0.05, y: y + 0.5 }, b: { s: s + 29.5, x: x0 + 0.05, y: y + 0.5 }, kind: 'rail', material: 'neon', layer: 1, pickOnly: false },
          { id: nextEdge++, obstacleId: id, a: { s: s + 8.5, x: x1 - 0.05, y: y + 0.5 }, b: { s: s + 29.5, x: x1 - 0.05, y: y + 0.5 }, kind: 'rail', material: 'neon', layer: 1, pickOnly: false }] }];
    }
    case 'a_frame_sign': return [P({ len: 0.4, wid: 0.5, hgt: 0.55, tags: ObTag.Knockable })];
    case 'lantern_stand': return [P({ len: 0.4, wid: 0.4, hgt: 1.6, ground })];
    case 'delivery_robot': return [P({ len: 0.7, wid: 0.6, hgt: 1.15 })];
  }
  return [];
}

/** One decor record of `kind` (core/decor.ts conventions), placed on the side `side` (−1 left, +1 right). */
export function decorOf(kind: DecorKind, area: AreaId, s: number, side: -1 | 1, variant = 0): Decor {
  const d = (x: number, params: Record<string, number> = {}, y = 0.15, rotY = 0): Decor =>
    ({ kind, s, x, y, rotY, scale: 1, variant, castShadow: DECOR_KINDS[kind].castShadow, params });
  const brand = (variant % DECOR_BRANDS[area].length);
  switch (DECOR_KINDS[kind].zone) {
    case 'backdrop':
      if (kind === 'water') return d(4.6, { len: 32, w: 20, glitter: 0.6 }, -0.8);
      if (kind === 'shadow_caster') return d(side * 10, { w: 6, d: 12, h: 18, shape: variant % 4 });
      if (kind === 'city_glow') return d(side * 12, { w: 30, h: 15, intensity: 0.7 }, 0);
      if (kind === 'end_wall') return d(side * 4.7, { w: 9, h: 9, brand, word: area === 'neon' ? variant % NEON_SIGN_WORDS.length : -1, shutters: 4 });
      if (kind === 'container_stack') return d(side * 6, { cols: 2, rows: 2, runs: 2 });
      if (kind === 'crane') return d(side * 12, { h: 26, boom: 22, side });
      if (kind === 'tower') return d(side * 5.2, { w: 8, d: 10, floors: 12, bladeSigns: 2, accent: variant });
      if (kind === 'house') return d(side * 6, { w: 9, d: 10, h: 3.4, roofH: 2.4, roof: variant % 5, porch: 1, garage: variant % 2 });
      if (kind === 'warehouse') return d(side * 5.4, { w: 14, d: 22, h: 9, brand, color: variant });
      return d(side * 5.2, { w: 8, d: 14, h: 10 + (variant % 3) * 4, brand, setbacks: 1 + (variant % 2), awning: 1, clutter: 7 });
    case 'side':
      if (kind === 'chain_link' || kind === 'fence_run' || kind === 'low_wall') return d(side * 4.75, { len: 10, h: kind === 'low_wall' ? 0.5 : 1.0, style: variant % 3 });
      if (kind === 'bridge_truss') return d(side * 4.8, { len: 30, h: 3, side });
      if (kind === 'tunnel') return d(0, { len: 32, wallX: 5.5, h: 4.5, lightEvery: 4 }, 0);
      if (kind === 'awning') return d(side * 5.2, { w: 4, depth: 0.6, color: variant });
      if (kind === 'blade_sign') return d(side * 5.4, { h: 3, w: 0.6, brand, word: area === 'neon' ? variant % NEON_SIGN_WORDS.length : -1 });
      if (kind === 'billboard' || kind === 'holo_billboard') return d(side * 5.0, { w: 4, h: 2.4, pole: 3, brand, hue: 0.5 });
      if (kind === 'street_lamp') return d(side * 4.75, { h: 5, arm: 0.1 });
      if (kind === 'tree') return d(side * 5.3, { crown: 1.4, trunkH: 2.6, species: area === 'downtown' ? 1 : variant % 3 === 2 ? 2 : 0 });
      if (kind === 'cherry_tree') return d(side * 5.3, { crown: 1.4, trunkH: 2.8 });
      if (kind === 'food_cart') return d(side * 4.7, { brand: -1, word: variant % NEON_SIGN_WORDS.length });
      return d(side * 4.85, { count: 3, h: 1.0 });
    case 'overhead':
      if (kind === 'maglev_beam') return d(0, { len: 32, gap: 1.6 }, 7);
      return d(0, { x0: -5.2, x1: 5.2, sag: 0.6, count: 14, palette: variant % 3 }, 3.6);
    case 'ground':
      if (kind === 'crosswalk') return d(0, { len: 3, w: 6, scramble: area === 'neon' ? 1 : 0 }, 0);
      if (kind === 'lane_dash') return d(0, { len: 24, dash: 3, gap: 3 }, 0);
      if (kind === 'parking_bay') return d(2.5, { len: 12 }, 0);
      if (kind === 'driveway') return d(side * 3, { w: 3 }, 0.15);
      if (kind === 'verge' || kind === 'park_path') return d(side * 4.6, { len: 12, w: 3, surface: 7 }, 0.15);
      return d(side * (1 + (variant % 3)), { len: 1.6, w: 1.0, r: 0.6, kind: variant % 4, tint: area === 'neon' ? 1 + (variant % 2) : 0 }, 0);
    case 'ambient': return d(0, { rate: 6, len: 32 }, 2);
  }
}

/** A fake WorldGen over prebuilt chunks (areaAt from a function). */
export function fakeGen(chunks: Map<number, Chunk>, areaAt: (s: number) => { area: AreaId; blend: AreaBlend | null; gateway?: GatewayId | null }): WorldGen {
  return {
    seed: 1, mode: 'normal',
    ensure: () => true,
    chunk(i: number): Chunk {
      let c = chunks.get(i);
      if (!c) { c = emptyChunk(i, areaAt(i * CHUNK_LEN + 16).area); chunks.set(i, c); }
      return c;
    },
    release: () => {},
    segments: () => [],
    areaAt: (s) => { const a = areaAt(s); return { area: a.area, blend: a.blend, gateway: a.gateway ?? null, first: true }; },
    stats: () => ({ segments: 0, rerolls: 0, fallbacks: 0, rejections: {}, trickCoinShare: 0, msPerSegment: 0 }),
  };
}

export function emptyChunk(i: number, area: AreaId): Chunk {
  const s0 = i * CHUNK_LEN;
  return { index: i, s0, len: CHUNK_LEN, area, blend: null, obstacles: [curb(area, -1, s0, s0 + CHUNK_LEN), curb(area, 1, s0, s0 + CHUNK_LEN)],
    coins: [], decor: [], safe: [], segments: [] };
}

/** Adds an obstacle to every chunk its s-range overlaps (as WG does), decor to its anchor chunk. */
export function place(chunks: Map<number, Chunk>, area: (s: number) => AreaId, obs: readonly Obstacle[], decor: readonly Decor[] = [], coins: readonly Coin[] = []): void {
  const get = (i: number) => { let c = chunks.get(i); if (!c) { c = emptyChunk(i, area(i * CHUNK_LEN + 16)); chunks.set(i, c); } return c; };
  for (const o of obs) {
    let s1 = o.s + o.len;
    for (const sl of o.slabs) s1 = Math.max(s1, sl.s1);
    let s0 = o.s;
    for (const sl of o.slabs) s0 = Math.min(s0, sl.s0);
    for (let i = Math.floor(s0 / CHUNK_LEN); i <= Math.floor((s1 - 1e-6) / CHUNK_LEN); i++) get(i).obstacles.push(o);
  }
  for (const d of decor) get(Math.floor(d.s / CHUNK_LEN)).decor.push(d);
  for (const c of coins) get(Math.floor(c.p.s / CHUNK_LEN)).coins.push(c);
}
