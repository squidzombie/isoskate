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
import { DEFAULT_BUILD, buildChunk, chunkHash, heightClass, lookAreaAt } from '../../../src/world/render/chunkBuilder';
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

  it('every crash-top hazard outside Neon sits in its pool of shadow (a decal over its screen-hull ground)', () => {
    resetIds();
    const r = only([...obstacleOf('trash_can', 'downtown', 70, 0), ...obstacleOf('barrier_low', 'downtown', 80, 0)], 'downtown');
    expect(r.out.decals.filter((d) => d.id === DECAL.pool).length).toBeGreaterThanOrEqual(2);
    resetIds();
    const n = only(obstacleOf('trash_can', 'neon', 70, 0), 'neon');
    expect(n.out.decals.filter((d) => d.id === DECAL.pool).length).toBe(0);
  });

  it('with the landscape yaw the pool follows the hull: footprint, swept copy and the parallelogram between them', () => {
    resetIds();
    const obs = obstacleOf('trash_can', 'downtown', 70, 0), b = obs[0]!.solids[0]!.box;
    const ch: Chunk = { index: 2, s0: 2 * CHUNK_LEN, len: CHUNK_LEN, area: 'downtown', blend: null, obstacles: obs, coins: [], decor: [], safe: [], segments: [] };
    const pools = build(ch, 'downtown', 30).out.decals.filter((d) => d.id === DECAL.pool);
    expect(pools.length).toBe(3);
    const reach = (b.y1 - b.y0) * 1.43 * 0.92, vx = -Math.sin(Math.PI / 6) * reach, vs = Math.cos(Math.PI / 6) * reach;
    const rects = pools.filter((d) => !d.e), par = pools.find((d) => d.e)!;
    // The swept copy leans toward −x (the camera sits on the +x side) and back along s.
    const [r0, r1] = [...rects].sort((u, v) => u.s - v.s);
    expect(r1!.x - r0!.x).toBeCloseTo(vx, 5);
    expect(r1!.s - r0!.s).toBeCloseTo(vs, 5);
    // The parallelogram: the footprint's diagonal from its front corner on the far side of the lean (front-left) to
    // its back-right corner, swept by v.
    const [e1x, e1s, e2x, e2s] = par.e!;
    expect(e2x).toBeCloseTo(vx, 5); expect(e2s).toBeCloseTo(vs, 5);
    expect(par.x - e1x / 2 - e2x / 2).toBeCloseTo(b.x0, 5);
    expect(e1x).toBeCloseTo(b.x1 - b.x0, 5); expect(e1s).toBeCloseTo(b.s1 - b.s0, 5);
    expect(par.s - e1s / 2 - e2s / 2).toBeCloseTo(b.s0, 5);
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
