// Kits and decor renderers (W2a): every PropKind has a kit and builds in every area skin within the triangle budget;
// hazards carry the noFog flag and follow the value hierarchy (ink bodies, inverted Neon bodies with an emissive rim);
// grind edges are a cream stripe over a wider ink underline; full-width hazards carry amber chevrons; every
// DECOR_KINDS entry renders (or registers an ambient emitter) without the cream edge or chevron colours, overhead
// decor stays ≥ 3.2 m, signs keep their inner edge at |x| ≥ 4.9. Node only (no WebGL).
import { describe, expect, it } from 'vitest';
import { DECOR_KINDS, NEON_SIGN_WORDS, type DecorKind } from '../../../src/core/decor';
import type { AreaId, PropKind } from '../../../src/core/ids';
import { CHUNK_LEN } from '../../../src/core/tuning';
import type { Chunk, Obstacle } from '../../../src/core/world';
import { ObTag } from '../../../src/core/world';
import { DEFAULT_BUILD, LOOK_SWITCH, buildChunk, chunkHash, heightClass, lookAreaAt, lookSwitch } from '../../../src/world/render/chunkBuilder';
import { CONTACT_PAD } from '../../../src/world/render/kits/common';
import { KITS } from '../../../src/world/render/kits/index';
import { DECOR_RENDERERS } from '../../../src/world/render/kits/decor';
import { COLORS, HAZARD } from '../../../src/world/render/palette';
import { GeoPool, type PooledGeo } from '../../../src/world/render/pools';
import { DECAL } from '../../../src/world/render/textures/decals';
import { SIGN_RECTS, glyphCheck } from '../../../src/world/render/textures/signs';
import { GeoWriter, srgbToLinear, type KitTargets } from '../../../src/world/render/writer';
import { ALL_PROP_KINDS, AREAS, decorOf, emptyChunk, obstacleOf, place, resetIds } from './fixtures';

type T = keyof KitTargets;
const TARGETS: readonly T[] = ['o', 'x', 'e', 'g', 'b'];
const lin = (hex: number) => [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)] as const;
const isCol = (g: PooledGeo, i: number, hex: number) => { const [r, gg, b] = lin(hex); return Math.abs(g.col[i * 3]! - r) < 1e-5 && Math.abs(g.col[i * 3 + 1]! - gg) < 1e-5 && Math.abs(g.col[i * 3 + 2]! - b) < 1e-5; };
const src = (area: AreaId) => ({ areaAt: () => ({ area, blend: null }) });

function build(ch: Chunk, area: AreaId, yawDeg = 0) {
  const pools = Object.fromEntries(TARGETS.map((t) => [t, new GeoPool(256)])) as Record<T, GeoPool>;
  const w = Object.fromEntries(TARGETS.map((t) => [t, new GeoWriter()])) as unknown as KitTargets;
  for (const t of TARGETS) w[t].begin(pools[t].acquire());
  const out = buildChunk(ch, w, src(area), { ...DEFAULT_BUILD, yawDeg }, 40, true);
  let tris = 0;
  for (const t of TARGETS) tris += w[t].tris;
  const g = Object.fromEntries(TARGETS.map((t) => [t, w[t].end()])) as Record<T, PooledGeo>;
  return { g, out, tris };
}
/** A chunk holding just `obs` (no curbs), built for `area`. */
function only(obs: Obstacle[], area: AreaId): ReturnType<typeof build> {
  const ch: Chunk = { index: 2, s0: 2 * CHUNK_LEN, len: CHUNK_LEN, area, blend: null, obstacles: obs, coins: [], decor: [], safe: [], segments: [] };
  return build(ch, area);
}
const baseline = (area: AreaId) => only([], area).tris;

describe('kits', () => {
  it('every PropKind has a kit', () => {
    for (const k of ALL_PROP_KINDS) expect(KITS[k], k).toBeDefined();
  });

  for (const area of AREAS) {
    it(`every PropKind builds in the ${area} skin within the triangle budget (≤ 400, cars ≤ 1,500, long kinds per chunk)`, () => {
      const base = baseline(area);
      for (const kind of ALL_PROP_KINDS) {
        resetIds();
        const obs = obstacleOf(kind, area, 2 * CHUNK_LEN + 6, kind === 'guard_rail' ? 3 : 1);
        const r = only(obs, area);
        const tris = r.tris - base;
        expect(tris, `${area} ${kind}`).toBeGreaterThan(0);
        const car = ['parked_car', 'parked_van', 'crosswalk_car', 'backout_car', 'forklift'].includes(kind);
        const big = ['fountain', 'bollard_row', 'bike_rack', 'bike_row', 'skywalk', 'vending_bank', 'drum_cluster', 'picket_fence', 'barrier_low', 'holo_gate', 'terrace', 'stairs', 'handrail', 'hubba', 'trench', 'cherry_planter', 'planter', 'planter_tree', 'food_cart', 'loading_dock', 'hedge', 'yard_table', 'cafe_set', 'kiosk', 'container', 'bus_shelter'].includes(kind);
        expect(tris, `${area} ${kind}`).toBeLessThanOrEqual(car ? 1500 : big ? 900 : 400);
      }
    });
  }

  it('hazard bodies skip the haze (noFog) and use the ink value; Neon inverts with a glowing body and an emissive rim', () => {
    for (const area of AREAS) {
      resetIds();
      const obs = obstacleOf('trash_can', area, 2 * CHUNK_LEN + 6, 0);
      const { g } = only(obs, area);
      const b = obs[0]!.solids[0]!.box, s0 = 2 * CHUNK_LEN;
      let inside = 0, fogged = 0, glow = 0;
      for (let i = 0; i < g.o.count; i++) {
        const x = g.o.pos[i * 3]!, y = g.o.pos[i * 3 + 1]!, s = s0 - g.o.pos[i * 3 + 2]!;
        if (x < b.x0 - 0.05 || x > b.x1 + 0.05 || y < b.y0 + 0.02 || y > b.y1 + 0.05 || s < b.s0 - 0.05 || s > b.s1 + 0.05) continue;
        inside++;
        if (!(Math.round(g.o.fx[i * 4 + 2]!) & 1)) fogged++;
        if (g.o.fx[i * 4 + 3]! > 0) glow++;
      }
      expect(inside, area).toBeGreaterThan(50);
      expect(fogged, area).toBe(0);
      if (HAZARD[area].inverted) {
        expect(glow, area).toBeGreaterThan(inside / 2);
        let rim = 0;
        for (let i = 0; i < g.e.count; i++) if (isCol(g.e, i, HAZARD.neon.rim)) rim++;
        expect(rim, 'Neon rim').toBeGreaterThan(0);
      } else {
        let ink = 0;
        for (let i = 0; i < g.o.count; i++) if (isCol(g.o, i, HAZARD[area].body)) ink++;
        expect(ink, area).toBeGreaterThan(inside / 4);
      }
    }
  });

  it('grind edges: a cream stripe (noFog) above a wider ink underline, clipped to the chunk', () => {
    resetIds();
    const obs = obstacleOf('granite_ledge', 'downtown', 2 * CHUNK_LEN + 28, 2);   // 8 m: crosses into the next chunk
    const { g } = only(obs, 'downtown');
    const cream: number[][] = [], ink: number[][] = [];
    for (let i = 0; i < g.o.count; i++) {
      const p = [g.o.pos[i * 3]!, g.o.pos[i * 3 + 1]!, g.o.pos[i * 3 + 2]!];
      if (isCol(g.o, i, COLORS.edgeCream) && p[1]! > 0.44) { cream.push(p); expect(Math.round(g.o.fx[i * 4 + 2]!) & 1).toBe(1); }
      if (isCol(g.o, i, COLORS.ink) && p[0]! < 1.8 && p[0]! > 1.5) ink.push(p);
    }
    expect(cream.length).toBeGreaterThan(0);
    for (const p of cream) expect(-p[2]!).toBeLessThanOrEqual(CHUNK_LEN + 1e-6);
    const left = cream.filter((p) => p[0]! < 2);
    const cw = Math.max(...left.map((p) => p[0]!)) - Math.min(...left.map((p) => p[0]!));
    const iw = Math.max(...ink.map((p) => p[0]!)) - Math.min(...ink.map((p) => p[0]!));
    expect(iw).toBeGreaterThan(cw);
  });

  it('full-width hazards carry amber chevrons in every area (the holo gate on its solid base)', () => {
    for (const area of AREAS) for (const v of [0, 1]) {
      resetIds();
      const { g } = only(obstacleOf(area === 'neon' ? 'holo_gate' : 'barrier_low', area, 2 * CHUNK_LEN + 6, 0, v), area);
      let amber = 0;
      for (let i = 0; i < g.o.count; i++) if (isCol(g.o, i, COLORS.chevron)) amber++;
      expect(amber, `${area} v${v}`).toBeGreaterThan(20);
    }
  });

  it('every obstacle stands in a soft contact shadow: its footprint plus a small pad, α ≤ 0.5, never a pool', () => {
    for (const area of AREAS) {
      for (const kind of ['trash_can', 'barrier_low', 'news_box', 'parked_car', 'container', 'vending_bank', 'bench'] as PropKind[]) {
        resetIds();
        const obs = obstacleOf(kind, area, 70, 0);
        const r = only(obs, area);
        const shadows = r.out.decals.filter((d) => d.id === DECAL.contact);
        expect(shadows.length, `${kind} in ${area}`).toBeGreaterThan(0);
        for (const d of shadows) expect(d.alpha).toBeLessThanOrEqual(CONTACT_PAD.alphaMax);
        // Inside the obstacle's footprint grown by the pad (the gate's ground ring around a hazard stays ground).
        let x0 = Infinity, x1 = -Infinity, s0 = Infinity, s1 = -Infinity;
        for (const o of obs) for (const so of o.solids) { x0 = Math.min(x0, so.box.x0); x1 = Math.max(x1, so.box.x1); s0 = Math.min(s0, so.box.s0); s1 = Math.max(s1, so.box.s1); }
        for (const d of shadows) {
          expect(d.x - d.w / 2).toBeGreaterThanOrEqual(x0 - CONTACT_PAD.side - 1e-6);
          expect(d.x + d.w / 2).toBeLessThanOrEqual(x1 + CONTACT_PAD.side + 1e-6);
          expect(d.s - d.len / 2).toBeGreaterThanOrEqual(s0 - CONTACT_PAD.front - 1e-6);
          expect(d.s + d.len / 2).toBeLessThanOrEqual(s1 + CONTACT_PAD.back + 0.3 + 1e-6);
        }
      }
    }
  });
  it('gateway blends switch the road and the hazard looks at one s, moved off every obstacle (its own area\'s look kept)', () => {
    resetIds();
    // A docks → neon blend whose weight crosses 0.5 at s = 76, a Neon vending bank straddling it, a docks drum before it.
    const blendAt = (s: number) => { const u = Math.min(1, Math.max(0, 0.5 + (s - 76) / 60)); return { area: (u < 0.5 ? 'docks' : 'neon') as AreaId, blend: { from: 'docks' as AreaId, to: 'neon' as AreaId, u } }; };
    const obs = [...obstacleOf('vending_bank', 'neon', 75.6, -1.5), ...obstacleOf('drum_cluster', 'docks', 70, 1.5)];
    const ch: Chunk = { index: 2, s0: 2 * CHUNK_LEN, len: CHUNK_LEN, area: 'docks', blend: null, obstacles: obs, coins: [], decor: [], safe: [], segments: [] };
    const sw = lookSwitch(ch, { areaAt: blendAt })!;
    expect(sw.from).toBe('docks'); expect(sw.to).toBe('neon');
    // The Neon bank keeps the Neon look (the switch comes before it); the docks drum keeps the docks look.
    expect(sw.s).toBeLessThanOrEqual(75.6 - LOOK_SWITCH.margin + 1e-6);
    expect(sw.s).toBeGreaterThanOrEqual(70 + obs[1]!.len + LOOK_SWITCH.margin - 1e-6);
    // No blend: no switch.
    expect(lookSwitch(ch, src('docks'))).toBeNull();
  });
  it('the street base follows the datum: after a full-width drop the road and verges sit at the lowered ground', () => {
    // world/gen's street base after a 0.85 m terrace drop: the road band at −0.85, sidewalks at −0.70.
    const band = (x0: number, x1: number, y: number, b: number): Obstacle => ({ id: 900 + b + x0, kind: 'curb', area: 'downtown', segment: 0, s: 64, x: (x0 + x1) / 2,
      len: 32, wid: x1 - x0, hgt: 0, rotY: 0, mirror: false, variant: 0, solids: [], pits: [], edges: [], tags: 0, params: { band: b },
      slabs: [{ s0: 64, s1: 96, x0, x1, y0: y, y1: y, layer: 0, surface: b === 1 ? 'concrete' : 'asphalt', kind: 'flat' }] });
    const r = only([band(-4.5, -3, -0.7, 1), band(-3, 3, -0.85, 0), band(3, 4.5, -0.7, 1)], 'downtown');
    const o = r.g.o;
    let roadTop = -Infinity, vergeTop = -Infinity;
    for (let t = 0; t < o.count; t += 3) {         // triangle centroids (boxes have vertices at their corners only)
      const x = (o.pos[t * 3]! + o.pos[t * 3 + 3]! + o.pos[t * 3 + 6]!) / 3, y = (o.pos[t * 3 + 1]! + o.pos[t * 3 + 4]! + o.pos[t * 3 + 7]!) / 3;
      if (Math.abs(x) < 2.9) roadTop = Math.max(roadTop, y);
      if (Math.abs(x) > 6) vergeTop = Math.max(vergeTop, y);
    }
    expect(roadTop).toBeCloseTo(-0.85, 2);
    expect(vergeTop).toBeCloseTo(-0.7, 2);
  });
  it('a dense street chunk stays inside the per-chunk triangle budget (≤ 12k)', () => {
    for (const area of AREAS) {
      resetIds();
      const chunks = new Map<number, Chunk>();
      const obs = (['barrier_low', 'trash_can', 'bench', 'flatbar', 'trench'] as PropKind[]).flatMap((k, i) => obstacleOf(k, area, 2 * CHUNK_LEN + 2 + i * 6, i % 2 ? 2 : -2));
      const decor = (Object.keys(DECOR_KINDS) as DecorKind[]).filter((k) => (DECOR_KINDS[k].areas as readonly string[]).includes(area))
        .map((k, i) => decorOf(k, area, 2 * CHUNK_LEN + (i % 30), i % 2 ? 1 : -1, i));
      place(chunks, () => area, obs, decor);
      const r = build(chunks.get(2)!, area);
      expect(r.tris, area).toBeLessThan(12000);
    }
  });

  it('height classes (DESIGN §5.5)', () => {
    expect(heightClass(0.18, 0)).toBe('bump'); expect(heightClass(0.19, 0)).toBe('low'); expect(heightClass(0.6, 0)).toBe('low');
    expect(heightClass(0.61, 0)).toBe('forbidden'); expect(heightClass(1.14, 0)).toBe('forbidden'); expect(heightClass(1.15, 0)).toBe('tall');
  });
});

describe('decor renderers', () => {
  it('every DECOR_KINDS entry has a renderer', () => {
    for (const k of Object.keys(DECOR_KINDS)) expect(DECOR_RENDERERS[k as DecorKind], k).toBeTypeOf('function');
  });

  for (const kind of Object.keys(DECOR_KINDS) as DecorKind[]) {
    it(`${kind}: renders in every listed area, never with the cream edge or chevron colours, within its zone limits`, () => {
      const def = DECOR_KINDS[kind];
      const areas = (def.areas as readonly string[]).filter((a): a is AreaId => (AREAS as readonly string[]).includes(a));
      for (const area of areas.length ? areas : (['downtown'] as AreaId[])) {
        for (const side of [-1, 1] as const) {
          const ch = emptyChunk(2, area);
          ch.obstacles = [];
          ch.decor = [decorOf(kind, area, 2 * CHUNK_LEN + 4, side, 3)];
          const { g, out, tris } = build(ch, area);
          const base = baseline(area);
          if (def.zone === 'ambient') { expect(out.ambient.length + (kind === 'maglev_train' ? 1 : 0)).toBeGreaterThan(0); continue; }
          expect(tris - base + out.decals.length + out.lanterns.length, `${kind} ${area}`).toBeGreaterThan(0);
          for (const t of TARGETS) for (let i = 0; i < g[t].count; i++) {
            expect(isCol(g[t], i, COLORS.edgeCream), `${kind}: cream edge colour`).toBe(false);
            expect(isCol(g[t], i, COLORS.chevron), `${kind}: chevron amber`).toBe(false);
          }
          if (def.zone === 'overhead') {
            let minY = Infinity;
            for (const t of TARGETS) for (let i = 0; i < g[t].count; i++) {
              const x = g[t].pos[i * 3]!;
              if (Math.abs(x) < 4.5) minY = Math.min(minY, g[t].pos[i * 3 + 1]!);
            }
            for (const l of out.lanterns) minY = Math.min(minY, l.y - l.r * 1.25);
            expect(minY, kind).toBeGreaterThanOrEqual(3.2 - 0.25);
          }
          if (kind === 'blade_sign' || kind === 'billboard' || kind === 'holo_billboard') {
            for (const t of ['e', 'b'] as const) for (let i = 0; i < g[t].count; i++) {
              const y = g[t].pos[i * 3 + 1]!;
              if (y > 2.2) expect(Math.abs(g[t].pos[i * 3]!), kind).toBeGreaterThanOrEqual(4.9 - 0.04);
            }
          }
        }
      }
    });
  }
});

describe('textures', () => {
  it('the sign atlas packs every entry inside 1024² (brands of every area, the reviewed words, holo panels)', () => {
    for (const area of AREAS) expect(SIGN_RECTS.get(`b:${area}:0`)).toBeDefined();
    for (let i = 0; i < NEON_SIGN_WORDS.length; i++) { expect(SIGN_RECTS.get(`w:${i}`)).toBeDefined(); expect(SIGN_RECTS.get(`wt:${i}`)).toBeDefined(); }
    for (const r of SIGN_RECTS.values()) { expect(r.u0).toBeGreaterThanOrEqual(0); expect(r.u1).toBeLessThanOrEqual(1); expect(r.v0).toBeGreaterThanOrEqual(0); expect(r.v1).toBeLessThanOrEqual(1); }
  });
  it('measureText / pixel fallback: missing glyphs (tofu or no ink) fall back to pictograms', () => {
    const tofu = new Uint8Array(64).fill(0); for (let k = 3; k < 64; k += 8) tofu[k] = 255;
    const glyph = new Uint8Array(64).fill(0); for (let k = 3; k < 64; k += 4) glyph[k] = k % 3 ? 255 : 0;
    expect(glyphCheck([glyph], tofu, [20])).toBe(true);
    expect(glyphCheck([tofu], tofu, [20])).toBe(false);                 // same pixels as the unassigned codepoint
    expect(glyphCheck([new Uint8Array(64)], tofu, [20])).toBe(false);   // no ink
    expect(glyphCheck([glyph], tofu, [0])).toBe(false);                 // measures 0 px
  });
});

describe('gateway blends and the Roll-out cache key', () => {
  it('hazards and the road take the dominant preset: the blend\'s `to` past its middle', () => {
    const at = (u: number) => ({ areaAt: () => ({ area: 'docks' as AreaId, blend: { from: 'docks' as AreaId, to: 'neon' as AreaId, u } }) });
    expect(lookAreaAt(at(0.3), 0)).toBe('docks');
    expect(lookAreaAt(at(0.7), 0)).toBe('neon');
  });
  it('the chunk hash is stable for identical content and changes with it', () => {
    resetIds();
    const a = emptyChunk(0, 'downtown'); a.obstacles.push(...obstacleOf('barrier_low', 'downtown', 24, 0));
    resetIds();
    const b = emptyChunk(0, 'downtown'); b.obstacles.push(...obstacleOf('barrier_low', 'downtown', 24, 0));
    expect(chunkHash(a, src('downtown'), 1)).toBe(chunkHash(b, src('downtown'), 1));
    b.obstacles[2]!.s += 0.5;
    expect(chunkHash(a, src('downtown'), 1)).not.toBe(chunkHash(b, src('downtown'), 1));
    expect(chunkHash(a, src('downtown'), 1)).not.toBe(chunkHash(a, src('downtown'), 2));
    expect(ObTag.FullWidth).toBe(1);
  });
});
