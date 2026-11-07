// Road marks at real scale and with real road logic (RECLAIM T2, owner playtest note 8): arrows point the way the
// skater rides, centred in a lane before a crossing (never backwards, sideways or on a lane line, and none without a
// crossing); manhole covers 0.6–0.75 m; kerb drains 0.4 × 0.6 m in the gutter against the kerb. Checked on fixture
// chunks and on real WG content (3 seeds, every area).
import { describe, expect, it } from 'vitest';
import type { AreaId } from '../../../src/core/ids';
import { CHUNK_LEN, sAt } from '../../../src/core/tuning';
import type { Chunk, Decor } from '../../../src/core/world';
import { createWorldGen } from '../../../src/world/gen';
import { DEFAULT_BUILD, buildChunk } from '../../../src/world/render/chunkBuilder';
import type { DecalRec } from '../../../src/world/render/kits/common';
import { ARROW, STREET_FIXTURE } from '../../../src/world/render/kits/decor';
import { GeoPool } from '../../../src/world/render/pools';
import { DECAL } from '../../../src/world/render/textures/decals';
import { GeoWriter, type KitTargets } from '../../../src/world/render/writer';
import { decorOf, emptyChunk } from './fixtures';

const TARGETS = ['o', 'x', 'e', 'g', 'b'] as const;
type T = (typeof TARGETS)[number];
const pools = Object.fromEntries(TARGETS.map((t) => [t, new GeoPool(256)])) as Record<T, GeoPool>;
const w = Object.fromEntries(TARGETS.map((t) => [t, new GeoWriter()])) as unknown as KitTargets;
function decals(ch: Chunk, areaAt: (s: number) => AreaId): DecalRec[] {
  for (const t of TARGETS) w[t].begin(pools[t].acquire());
  const out = buildChunk(ch, w, { areaAt: (s) => ({ area: areaAt(s), blend: null }) }, DEFAULT_BUILD, 40, true);
  for (const t of TARGETS) pools[t].release(w[t].end());
  return out.decals;
}
const D = (kind: Decor['kind'], s: number, x: number, params: Record<string, number> = {}): Decor =>
  ({ kind, s, x, y: 0, rotY: 0, scale: 1, variant: 0, castShadow: false, params });
const isArrow = (d: DecalRec) => d.id === DECAL.arrowS || d.id === DECAL.arrowL || d.id === DECAL.arrowR || d.id === DECAL.slow;

describe('road arrows follow road logic (owner note 8)', () => {
  const S = 2 * CHUNK_LEN;
  for (const area of ['downtown', 'suburbs', 'neon'] as const) {
    it(`${area}: one arrow per crossing, ahead-pointing, centred in a lane, before the crossing`, () => {
      for (let k = 0; k < 4; k++) for (const x of [-2, -0.2, 0, 1.3, 2]) {
        const ch = emptyChunk(2, area);
        ch.decor = [D('lane_dash', S, 0, { len: CHUNK_LEN, dash: 3, gap: 3, color: area === 'suburbs' ? 1 : 0 }),
          D('crosswalk', S + 20, 0, { len: 3, w: 6 }), D('road_arrow', S + 5, x, { kind: k }), D('road_arrow', S + 25, -x, { kind: (k + 1) % 4 })];
        const arrows = decals(ch, () => area).filter(isArrow);
        expect(arrows.length, `${area} kind ${k} x ${x}`).toBe(1);
        const a = arrows[0]!;
        expect(a.rot, 'points +s (never backwards or sideways)').toBe(0);
        expect(a.id === DECAL.arrowL || a.id === DECAL.arrowR, 'no turn arrows on a street with no turn').toBe(false);
        expect(a.id === DECAL.slow, 'SLOW only for kind 3').toBe(k === 3);
        // Kerb at |x| 3.0 in the fixture: the paint stays inside one lane, clear of the centre line and the kerb.
        const half = (a.id === DECAL.slow ? ARROW.slowW : ARROW.w) / 2;
        expect(Math.abs(a.x) - half, 'clear of the centre line').toBeGreaterThan(0.3);
        expect(Math.abs(a.x) + half, 'inside the kerb').toBeLessThan(3.0);
        if (area === 'suburbs') expect(a.x, 'two-way street: the right-hand lane only').toBeGreaterThan(0);
        expect(a.s).toBeLessThan(S + 20 - 2);
        expect(a.s).toBeGreaterThan(S + 20 - 10);
      }
    });
  }
  it('no crossing in the chunk: no arrow', () => {
    const ch = emptyChunk(2, 'downtown');
    ch.decor = [D('road_arrow', S + 5, 1, { kind: 0 }), D('road_arrow', S + 15, -1, { kind: 3 })];
    expect(decals(ch, () => 'downtown').filter(isArrow)).toHaveLength(0);
  });
  it('real WG content: every painted arrow points ahead from a lane centre inside the road (3 seeds × 4 areas)', () => {
    let n = 0;
    for (const seed of [3, 7, 11]) for (const startT of [163, 202, 241, 280]) {
      const gen = createWorldGen({ seed, mode: 'normal', startT });
      const i0 = Math.floor(sAt(startT) / CHUNK_LEN);
      for (let i = i0; i < i0 + 20; i++) {
        const ch = gen.chunk(i);
        for (const a of decals(ch, (s) => gen.areaAt(s).area).filter(isArrow)) {
          n++;
          expect(a.rot).toBe(0);
          expect(Math.abs(a.x)).toBeGreaterThan(0.8);
          expect(Math.abs(a.x)).toBeLessThan(2.6);
        }
      }
    }
    expect(n, 'some arrows are painted').toBeGreaterThan(0);
  });
});

describe('street fixtures at real scale (owner note 8)', () => {
  const S = 2 * CHUNK_LEN;
  it('manhole covers are 0.6–0.75 m whatever the r param', () => {
    for (const area of ['downtown', 'suburbs', 'docks', 'neon'] as const) for (const r of [0.4, 0.9, 1.4]) {
      const ch = emptyChunk(2, area);
      ch.decor = [{ ...decorOf('manhole', area, S + 6, -1), x: -1.2, params: { r } }];
      const m = decals(ch, () => area).filter((d) => d.id >= DECAL.manGrid && d.id <= DECAL.manFlower);
      expect(m).toHaveLength(1);
      const dia = m[0]!.w * 0.94;
      expect(dia).toBeGreaterThanOrEqual(STREET_FIXTURE.manholeMin - 1e-6);
      expect(dia).toBeLessThanOrEqual(STREET_FIXTURE.manholeMax + 1e-6);
    }
  });
  it('kerb drains are 0.4 × 0.6 m in the gutter against the kerb (and the Neon vents with them)', () => {
    for (const [area, kind] of [['downtown', 'drain'], ['suburbs', 'drain'], ['neon', 'steam_vent']] as const) for (const x of [-3, 3, -0.5]) {
      const ch = emptyChunk(2, area);
      ch.decor = [D(kind, S + 8, x)];
      const g = decals(ch, () => area).filter((d) => d.id === DECAL.drain);
      expect(g).toHaveLength(1);
      expect(g[0]!.w).toBeCloseTo(0.4, 5);
      expect(g[0]!.len).toBeCloseTo(0.6, 5);
      // The fixture kerb is at |x| 3.0: the grate's outer edge stays within 0.1 m of it, on the road side.
      expect(3.0 - (Math.abs(g[0]!.x) + g[0]!.w / 2)).toBeGreaterThanOrEqual(0);
      expect(3.0 - (Math.abs(g[0]!.x) + g[0]!.w / 2)).toBeLessThan(0.1);
    }
  });
});
