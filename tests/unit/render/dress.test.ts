// kits/dress.ts: the RECLAIM dressing rules (DESIGN §18.4 rules 1–10) and the life-accent accounting. The last block
// draws every kit for every skin it can take (every distinct body × dressing set, over the variants) and checks the
// per-variant life budget (≤ 10% of the top-view silhouette, rule 6), that the dresser had nothing to refuse, and
// that helper machines carry no wear (rule 9). Node only (no WebGL).
import { describe, expect, it } from 'vitest';
import type { AreaId, PropKind } from '../../../src/core/ids';
import { Dress, WEAR_MASK, propSkin } from '../../../src/core/skins';
import { CHUNK_LEN } from '../../../src/core/tuning';
import { ObTag, type Chunk, type GrindEdge, type Obstacle } from '../../../src/core/world';
import { DEFAULT_BUILD, buildChunk } from '../../../src/world/render/chunkBuilder';
import {
  BLOOM_TOP_KINDS, DRESS, DRESSER, Dresser, clearOfEdges, edgeBandDecalOk, flatWeedOk, foliageFor, inCleanCore, isIsolatedFiller,
  lumMatched, mayAnimateEmissive, mossOn, riseCap, rustOn, signatureLike, unionArea, vegOk,
} from '../../../src/world/render/kits/dress';
import { COLORS, HAZARD, LOOK, RECLAIM, contrastRatio, relLum } from '../../../src/world/render/palette';
import { GeoPool } from '../../../src/world/render/pools';
import { GeoWriter, Kit, type KitTargets } from '../../../src/world/render/writer';
import { ALL_PROP_KINDS, AREAS, obstacleOf, prop, resetIds } from './fixtures';

type T = keyof KitTargets;
const TARGETS: readonly T[] = ['o', 'x', 'e', 'g', 'b'];
function build(obs: Obstacle[], area: AreaId): void {
  const pools = Object.fromEntries(TARGETS.map((t) => [t, new GeoPool(256)])) as Record<T, GeoPool>;
  const w = Object.fromEntries(TARGETS.map((t) => [t, new GeoWriter()])) as unknown as KitTargets;
  for (const t of TARGETS) w[t].begin(pools[t].acquire());
  const ch: Chunk = { index: 2, s0: 2 * CHUNK_LEN, len: CHUNK_LEN, area, blend: null, obstacles: obs, coins: [], decor: [], safe: [], segments: [] };
  buildChunk(ch, w, { areaAt: () => ({ area, blend: null }) }, { ...DEFAULT_BUILD }, 40, true);
  for (const t of TARGETS) w[t].end();
}
const edge = (s0: number, s1: number, x: number, y: number): GrindEdge =>
  ({ id: 1, obstacleId: 1, a: { s: s0, x, y }, b: { s: s1, x, y }, kind: 'ledge', material: 'stone', layer: 0, pickOnly: false });
/** A Kit that records boxes instead of writing geometry. */
function fakeKit(): { K: Kit; boxes: number[][] } {
  const boxes: number[][] = [];
  const K = { box: (...a: number[]) => { boxes.push(a.slice(0, 6)); } } as unknown as Kit;
  return { K, boxes };
}

describe('dressing rule helpers', () => {
  it('unionArea counts overlaps once', () => {
    expect(unionArea([[0, 1, 0, 1]])).toBeCloseTo(1);
    expect(unionArea([[0, 2, 0, 1], [1, 3, 0, 1]])).toBeCloseTo(3);
    expect(unionArea([[0, 3, 0, 3], [1, 2, 1, 2]])).toBeCloseTo(9);          // planter_tree: trunk inside the planter
    expect(unionArea([[0, 1, 0, 1], [2, 3, 0, 1]])).toBeCloseTo(2);
    expect(unionArea([])).toBe(0);
  });

  it('clearOfEdges keeps foliage 0.3 m from a grind edge in 3D (ivy may hang down an end face)', () => {
    const e = [edge(10, 14, 0.3, 0.45)];
    expect(clearOfEdges(0, 0.3, 14, 14.05, 0, 0.1, e)).toBe(true);           // low on the end face
    expect(clearOfEdges(0, 0.3, 14, 14.05, 0, 0.2, e)).toBe(false);          // 0.25 m below the edge
    expect(clearOfEdges(-0.3, 0.3, 11, 12, 0.44, 0.46, e)).toBe(false);      // on the top beside the coping
    expect(clearOfEdges(1.0, 1.4, 11, 12, 0.3, 0.6, e)).toBe(true);          // 0.7 m to the side
    expect(clearOfEdges(0, 0.3, 14.31, 15, 0.4, 0.5, e)).toBe(true);         // past the edge's end
  });

  it('riseCap: nothing above Bump / Low / landable tops; Tall: foliage +0.05, animals +0.22, the sapling +0.6 (rule 2)', () => {
    const low = { box: { s0: 0, s1: 1, x0: 0, x1: 1, y0: 0, y1: 0.5 }, top: 'crash' as const, tall: false };
    const land = { ...low, top: 'landable' as const, tall: true };
    const tall = { ...low, box: { ...low.box, y1: 1.15 }, tall: true };
    for (const r of ['life', 'cat', 'animal', 'foliage', 'wear', 'sapling'] as const) { expect(riseCap(low, r)).toBe(0); expect(riseCap(land, r)).toBe(0); }
    expect(riseCap(tall, 'foliage')).toBe(0.05); expect(riseCap(tall, 'life')).toBe(0.05);
    expect(riseCap(tall, 'animal')).toBe(0.22); expect(riseCap(tall, 'cat')).toBe(0.22);
    expect(riseCap(tall, 'sapling')).toBe(0.6); expect(riseCap(tall, 'wear')).toBe(0);
  });

  it('zones: clean core |x| ≤ 3.6, flat weeds beyond it, 3D vegetation from 4.6 (rule 7)', () => {
    expect(inCleanCore(3.6)).toBe(true); expect(inCleanCore(-3.7)).toBe(false);
    expect(flatWeedOk(3.6)).toBe(false); expect(flatWeedOk(-4.0)).toBe(true);
    expect(vegOk(4.5)).toBe(false); expect(vegOk(-4.6)).toBe(true);
    expect(edgeBandDecalOk(RECLAIM.moss, COLORS.verge)).toBe(false);
    expect(edgeBandDecalOk(0xb9ad98, COLORS.verge)).toBe(true);
  });

  it('flowers bloom on planter tops only; only the telegraphs animate a hazard light (rules 3, 8)', () => {
    expect([...BLOOM_TOP_KINDS].sort()).toEqual(['cherry_planter', 'planter', 'planter_tree']);
    expect(mayAnimateEmissive('forklift', 'docks')).toBe(true);
    expect(mayAnimateEmissive('barrier_low', 'neon')).toBe(true);
    expect(mayAnimateEmissive('barrier_low', 'downtown')).toBe(false);
    expect(mayAnimateEmissive('vending_bank', 'neon')).toBe(false);
    expect(mayAnimateEmissive('food_cart', 'neon')).toBe(false);
  });
});

describe('value rule (rule 4) and signature rule (rule 5)', () => {
  it('moss is luminance-matched to every tabled face, and to any other face by construction', () => {
    const faces = [HAZARD.downtown.top, 0x4a3b6b, ...Object.values(RECLAIM.carPaint), HAZARD.neon.body, HAZARD.neon.top, 0x2b2140, 0x857683, 0x9ba3b5];
    for (const f of faces) expect(lumMatched(mossOn(f), f), f.toString(16)).toBe(true);
    expect(mossOn(HAZARD.downtown.top)).toBe(RECLAIM.hazardMoss);
    expect(mossOn(RECLAIM.carPaint.oxblood)).toBe(RECLAIM.carRoofMoss.oxblood);
    expect(mossOn(HAZARD.neon.top)).toBe(RECLAIM.neonHazardMossTop);
  });

  it('rust is ink rust on ink faces and luminance-matched elsewhere, never crimson', () => {
    expect(rustOn(HAZARD.downtown.body)).toBe(RECLAIM.inkRust);
    const r = rustOn(0x857683);
    expect(lumMatched(r, 0x857683)).toBe(true);
    expect((r >> 16) & 255).toBeGreaterThan(r & 255);                       // warm orange-brown, not blue-red
    expect((r >> 8) & 255).toBeGreaterThan((r & 255) - 1);
  });

  it('foliage: hazards L ≤ 0.05 (Neon: matched to the inverted body), decor L ≥ 0.10, Neon decor ≤ 1.3:1 on wet asphalt', () => {
    for (const a of ['downtown', 'suburbs', 'docks'] as const) {
      for (const lit of [false, true]) {
        expect(relLum(foliageFor(a, true, lit))).toBeLessThanOrEqual(DRESS.hazardFoliageMaxL);
        expect(contrastRatio(foliageFor(a, true, lit), COLORS.asphalt)).toBeGreaterThanOrEqual(2.5);
        expect(relLum(foliageFor(a, false, lit))).toBeGreaterThanOrEqual(DRESS.decorFoliageMinL);
      }
      // The default ink-green holds 2.5:1 on every area's road; the lit-side highlight is only for sun-lit faces.
      expect(contrastRatio(foliageFor(a, true), LOOK[a].road)).toBeGreaterThanOrEqual(2.5);
    }
    expect(lumMatched(foliageFor('neon', true), HAZARD.neon.body)).toBe(true);
    for (const lit of [false, true]) expect(contrastRatio(foliageFor('neon', false, lit), LOOK.neon.road)).toBeLessThanOrEqual(DRESS.neonDecorMaxContrast + 1e-3);
  });

  it('only the cream-chrome coping reads as the signature: no RECLAIM token is cream, near-white or chrome', () => {
    expect(signatureLike(COLORS.edgeCream)).toBe(true);
    expect(signatureLike(0xffffff)).toBe(true);
    expect(signatureLike(0xd8cfc2)).toBe(true);                               // the rejected seed tint
    const tokens: number[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'number' && v > 1) tokens.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    // (fadeTo is a mixing target, the existing verge colour, never drawn on its own)
    walk(Object.fromEntries(Object.entries(RECLAIM).filter(([k]) => k !== 'fadeTo' && k !== 'hazardMossOn')));
    expect(tokens.length).toBeGreaterThan(50);
    for (const t of tokens) expect(signatureLike(t), t.toString(16)).toBe(false);
  });
});

describe('isolated column fillers (rule 2 exception)', () => {
  const filler = (s: number, x: number, tags: number = ObTag.Filler) => prop({ kind: 'trash_can', area: 'downtown', s, x, len: 0.6, wid: 0.6, hgt: 1.15, tags });
  it('is isolated with no solid within 1 m in x or s', () => {
    const a = filler(80, 1), far = filler(85, -2);
    expect(isIsolatedFiller(a, [a, far])).toBe(true);
  });
  it('is not isolated next to another solid, in a gate row, or when it is not a filler', () => {
    const a = filler(80, 1);
    expect(isIsolatedFiller(a, [a, filler(81.2, 1.2)])).toBe(false);          // 0.6 m behind it
    expect(isIsolatedFiller(a, [a, filler(80, -3)])).toBe(false);             // same row: a gate row of fillers
    const b = filler(80, 1, 0);
    expect(isIsolatedFiller(b, [b])).toBe(false);
  });
});

describe('Dresser.box: clamps, refusals and the life ledger (rules 1, 2, 5, 6, 9)', () => {
  it('clamps a dressing box into the footprint (+0.05 m) and under the rise cap, and counts life', () => {
    resetIds();
    const [bin] = obstacleOf('trash_can', 'downtown', 80, 1);
    const d = new Dresser();
    d.begin(bin!);
    const { K, boxes } = fakeKit();
    const b = bin!.solids[0]!.box;
    expect(d.box(K, 'foliage', b.x0 - 0.3, b.y1 - 0.2, b.s0, b.x0 + 0.1, b.y1 + 0.4, b.s0 + 0.2)).toBe(true);
    expect(boxes[0]![0]).toBeCloseTo(b.x0 - 0.05); expect(boxes[0]![4]).toBeCloseTo(b.y1 + 0.05);
    expect(d.clamped).toBe(1);
    expect(d.box(K, 'cat', b.x0, b.y1, b.s0, b.x0 + 0.1, b.y1 + 0.5, b.s0 + 0.1)).toBe(true);
    expect(boxes[1]![4]).toBeCloseTo(b.y1 + 0.22);
    expect(d.lifeArea).toBeCloseTo(0.01);
    expect(d.lifeRatio()).toBeCloseTo(0.01 / ((b.x1 - b.x0) * (b.s1 - b.s0)));
    d.record = [];
    d.end();
    expect(d.record).toHaveLength(1);
    expect(d.record[0]).toMatchObject({ kind: 'trash_can', refused: 0, clamped: 2 });
  });

  it('refuses wear and plants on helper machines, a sapling the chunk builder did not mark isolated, and foliage at a grind edge', () => {
    resetIds();
    const { K, boxes } = fakeKit();
    const d = new Dresser();
    const [robot] = obstacleOf('delivery_robot', 'neon', 80, 1);
    d.begin(robot!);
    const r = robot!.solids[0]!.box;
    expect(d.has(Dress.Clean)).toBe(true);
    for (const role of ['foliage', 'wear', 'cat', 'animal', 'sapling'] as const) expect(d.box(K, role, r.x0, r.y0, r.s0, r.x1, r.y1, r.s1)).toBe(false);
    expect(d.box(K, 'life', r.x0, r.y1 - 0.1, r.s0, r.x0 + 0.05, r.y1, r.s1)).toBe(true);   // the two-tone band
    expect(d.refused).toBe(5);

    const [ledge] = obstacleOf('granite_ledge', 'downtown', 80, 0);
    d.begin(ledge!);
    const l = ledge!.solids[0]!.box;
    expect(d.box(K, 'foliage', l.x0, l.y1 - 0.05, l.s0 + 1, l.x1, l.y1, l.s0 + 2)).toBe(false);
    expect(d.box(K, 'foliage', l.x0, l.y0, l.s1 - 0.02, l.x1, l.y0 + 0.08, l.s1 + 0.02)).toBe(true);

    let id = 1;
    for (; id < 200; id++) if (propSkin('trash_can', 'downtown', id, 0, 1.15).dress & Dress.Sapling) break;
    const [bin] = obstacleOf('trash_can', 'downtown', 80, 1);
    bin!.id = id;
    const b = bin!.solids[0]!.box;
    d.begin(bin!, -Infinity, Infinity, false);
    expect(d.sapling).toBe(false);
    expect(d.box(K, 'sapling', b.x0, b.y1, b.s1 - 0.1, b.x1, b.y1 + 0.6, b.s1)).toBe(false);
    d.begin(bin!, -Infinity, Infinity, true);
    expect(d.sapling).toBe(true);
    expect(d.box(K, 'sapling', b.x0, b.y1, b.s1 - 0.1, b.x1, b.y1 + 0.9, b.s1)).toBe(true);
    expect(boxes.at(-1)![4]).toBeCloseTo(b.y1 + DRESS.sapling.rise);
  });

  it('clips the silhouette and life of a long kind to the chunk', () => {
    resetIds();
    const [ledge] = obstacleOf('granite_ledge', 'downtown', 70, 0);
    const d = new Dresser();
    d.begin(ledge!);
    const full = d.silhouetteArea();
    d.begin(ledge!, 72, 74);
    const b = ledge!.solids[0]!.box;
    expect(d.silhouetteArea()).toBeCloseTo((b.x1 - b.x0) * 2);
    expect(full).toBeGreaterThan(d.silhouetteArea());
    d.life(b.x0, b.x1, 70, 80);
    expect(d.lifeArea).toBeCloseTo((b.x1 - b.x0) * 2);
  });
});

describe('every kit, every skin: life budget per variant, nothing refused, clean machines (rules 6, 9)', () => {
  for (const area of AREAS) {
    it(`${area}: life accents ≤ 10% of each hazard's top-view silhouette`, () => {
      DRESSER.record = [];
      try {
        for (const kind of ALL_PROP_KINDS) {
          // One obstacle per distinct skin (body × dressing set) the kind can take here, over the variants.
          const seen = new Set<string>();
          for (let variant = 0; variant < 4; variant++) for (let id = 1; id < 120; id++) {
            const s = propSkin(kind, area, id, variant, kind === 'parked_car' && area === 'suburbs' ? 1.5 : 1.4);
            const key = `${s.body}|${s.dress}|${variant}`;
            if (seen.has(key)) continue;
            seen.add(key);
            resetIds();
            const obs = obstacleOf(kind as PropKind, area, 2 * CHUNK_LEN + 6, kind === 'dock_lip' ? 4.35 : 1, variant);
            for (const o of obs) if (o.kind === kind) o.id = id;
            build(obs, area);
          }
        }
        const recs = DRESSER.record;
        expect(new Set(recs.map((r) => r.kind)).size).toBeGreaterThan(30);
        for (const r of recs) {
          const tag = `${r.kind}/${r.area}/v${r.variant}/${r.body}`;
          expect(r.ratio, tag).toBeLessThanOrEqual(DRESS.lifeBudget);
          expect(r.refused, tag).toBe(0);
          if (r.dress & Dress.Clean) expect(r.dress & WEAR_MASK, tag).toBe(0);
        }
      } finally { DRESSER.record = null; }
    });
  }
});
