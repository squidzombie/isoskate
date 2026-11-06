// Grey-box chunk builder, pools and the streaming WorldView (ROADMAP M0 item 7). Node only: no WebGL needed.
import { describe, expect, it } from 'vitest';
import { Scene, Texture } from 'three';
import type { GameEvent } from '../../../src/core/events';
import { CAMERA, CHUNK_LEN, ORIGIN_REBASE } from '../../../src/core/tuning';
import type { GfxContext, RenderFrame, Viewport } from '../../../src/core/view';
import type { Chunk, Coin, Obstacle, WorldGen } from '../../../src/core/world';
import { ObTag } from '../../../src/core/world';
import { GOLDEN } from '../../../src/gfx';
import { buildOptionsFor, createWorldView, heightClass, solveFraming, type GreyboxView } from '../../../src/world/render';
import { buildChunk, COLORS, GeoWriter, srgbToLinear, VERTS_PER_BOX } from '../../../src/world/render/chunkBuilder';
import { GeoPool } from '../../../src/world/render/pools';

const vp = (w: number, h: number, safeTop = 0): Viewport => ({ wCss: w, hCss: h, dpr: 1, aspect: w / h, safeTop, safeBottom: 0, coarse: true });

function ob(p: Partial<Obstacle> & Pick<Obstacle, 'id' | 'kind' | 's'>): Obstacle {
  return { area: 'downtown', segment: 0, x: 0, len: 1, wid: 1, hgt: 0.5, rotY: 0, mirror: false, variant: 0,
    solids: [], slabs: [], pits: [], edges: [], tags: 0, ...p };
}
/** A busy test chunk: a full-width barrier, a tall bin, a ledge with two edges, a sidewalk slab, stairs, a pit, coins. */
function chunk(i: number): Chunk {
  const s0 = i * CHUNK_LEN, id = i * 100;
  const obstacles: Obstacle[] = [
    ob({ id: id + 1, kind: 'barrier_low', s: s0 + 4, tags: ObTag.FullWidth,
      solids: [{ box: { s0: s0 + 4, s1: s0 + 4.6, x0: -4.5, x1: 4.5, y0: 0, y1: 0.45 }, top: 'crash', tall: false }] }),
    ob({ id: id + 2, kind: 'trash_can', s: s0 + 10,
      solids: [{ box: { s0: s0 + 10, s1: s0 + 10.6, x0: -1.3, x1: -0.7, y0: 0, y1: 1.15 }, top: 'crash', tall: true }] }),
    ob({ id: id + 3, kind: 'granite_ledge', s: s0 + 14,
      solids: [{ box: { s0: s0 + 14, s1: s0 + 22, x0: 1.7, x1: 2.3, y0: 0, y1: 0.45 }, top: 'landable', tall: false }],
      slabs: [{ s0: s0 + 14, s1: s0 + 22, x0: 1.7, x1: 2.3, y0: 0.45, y1: 0.45, layer: 0, surface: 'granite', kind: 'flat' }],
      edges: [{ id: id + 1, obstacleId: id + 3, a: { s: s0 + 14, x: 1.7, y: 0.45 }, b: { s: s0 + 22, x: 1.7, y: 0.45 }, kind: 'ledge', material: 'stone', layer: 0, pickOnly: false },
        { id: id + 2, obstacleId: id + 3, a: { s: s0 + 14, x: 2.3, y: 0.45 }, b: { s: s0 + 40, x: 2.3, y: 0.45 }, kind: 'ledge', material: 'stone', layer: 0, pickOnly: false }] }),
    ob({ id: id + 4, kind: 'curb', s: s0,
      slabs: [{ s0, s1: s0 + 32, x0: 3, x1: 4.5, y0: 0.15, y1: 0.15, layer: 0, surface: 'concrete', kind: 'flat' }] }),
    ob({ id: id + 5, kind: 'stairs', s: s0 + 24,
      slabs: [{ s0: s0 + 24, s1: s0 + 27, x0: -4, x1: -2, y0: 0.6, y1: 0, layer: 0, surface: 'concrete', kind: 'stairs', steps: 4 }] }),
    ob({ id: id + 6, kind: 'trench', s: s0 + 28, pits: [{ s0: s0 + 28, s1: s0 + 29, x0: -4.5, x1: 4.5, lipY: 0, depth: 0.5, cause: 'fall' }] }),
  ];
  const coins: Coin[] = [0, 1, 2, 3].map((k) => ({ id: i * 10 + k, p: { s: s0 + 2 + k * 6, x: 0, y: 0.5 }, value: 1, line: 'safe' }));
  return { index: i, s0, len: CHUNK_LEN, area: 'downtown', blend: null, obstacles, coins, safe: [], segments: [],
    decor: [{ kind: 'building', s: s0 + 2, x: 5.2, y: 0.15, rotY: 0, scale: 1, variant: 1, castShadow: true, params: { w: 8, d: 14, h: 12 } },
      { kind: 'street_lamp', s: s0 + 8, x: -4.75, y: 0.15, rotY: 0, scale: 1, variant: 0, castShadow: true }] };
}

const lin = (hex: number) => [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
function verticesOfColor(w: { pos: Float32Array; col: Float32Array; count: number }, hex: number): number[][] {
  const [r, g, b] = lin(hex), out: number[][] = [];
  for (let i = 0; i < w.count; i++) {
    if (Math.abs(w.col[i * 3]! - r!) < 1e-6 && Math.abs(w.col[i * 3 + 1]! - g!) < 1e-6 && Math.abs(w.col[i * 3 + 2]! - b!) < 1e-6) {
      out.push([w.pos[i * 3]!, w.pos[i * 3 + 1]!, w.pos[i * 3 + 2]!]);
    }
  }
  return out;
}

describe('GeoWriter', () => {
  it('a box is 5 flat faces (no bottom) with outward, CCW-consistent normals', () => {
    const pool = new GeoPool(64), w = new GeoWriter();
    w.begin(pool.acquire());
    w.box(-1, 0, -2, 1, 0.5, 2, COLORS.ink);
    const g = w.end();
    expect(g.count).toBe(VERTS_PER_BOX);
    for (let t = 0; t < g.count; t += 3) {
      const p = (k: number) => [g.pos[(t + k) * 3]!, g.pos[(t + k) * 3 + 1]!, g.pos[(t + k) * 3 + 2]!];
      const [a, b, c] = [p(0), p(1), p(2)];
      const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const sn = [g.nrm[t * 3]!, g.nrm[t * 3 + 1]!, g.nrm[t * 3 + 2]!];
      expect(n[0]! * sn[0]! + n[1]! * sn[1]! + n[2]! * sn[2]!).toBeGreaterThan(0);
      expect(sn[1]).toBeGreaterThanOrEqual(0);           // never a bottom face
    }
    expect(g.geo.drawRange.count).toBe(VERTS_PER_BOX);
    expect(g.geo.boundingSphere!.radius).toBeCloseTo(Math.hypot(2, 0.5, 4) / 2, 6);
  });

  it('grows past its capacity without losing what was written', () => {
    const pool = new GeoPool(32), w = new GeoWriter();
    w.begin(pool.acquire());
    for (let i = 0; i < 20; i++) w.box(i, 0, 0, i + 0.5, 1, 1, COLORS.bump);
    const g = w.end();
    expect(g.count).toBe(20 * VERTS_PER_BOX);
    expect(g.cap).toBeGreaterThanOrEqual(g.count);
    expect(g.pos[0]).toBe(0);
    expect(Math.max(...g.pos.subarray(0, g.count * 3).filter((_, i) => i % 3 === 0))).toBeCloseTo(19.5, 6);
  });
});

describe('chunk builder', () => {
  const build = () => {
    const pool = new GeoPool(), main = new GeoWriter(), near = new GeoWriter();
    main.begin(pool.acquire()); near.begin(pool.acquire());
    buildChunk(chunk(0), main, near, buildOptionsFor(vp(390, 844)));
    return { main: main.end(), near: near.end() };
  };

  it('height classes (DESIGN §5.5)', () => {
    expect(heightClass(0.18, 0)).toBe('bump');
    expect(heightClass(0.19, 0)).toBe('low');
    expect(heightClass(0.60, 0)).toBe('low');
    expect(heightClass(0.61, 0)).toBe('forbidden');
    expect(heightClass(1.14, 0)).toBe('forbidden');
    expect(heightClass(1.15, 0)).toBe('tall');
  });

  it('colours: ink crash hazards, landable lilac, chevrons on the full-width barrier, a tall accent band', () => {
    const { main } = build();
    expect(verticesOfColor(main, COLORS.lowCrash).length).toBeGreaterThan(0);
    expect(verticesOfColor(main, COLORS.lowLandable).length).toBeGreaterThan(0);
    const chev = verticesOfColor(main, COLORS.chevron).length / VERTS_PER_BOX;     // ~1 per 0.9 m across 9 m
    expect(chev).toBeGreaterThanOrEqual(9);
    expect(Number.isInteger(chev)).toBe(true);
    expect(verticesOfColor(main, COLORS.tallAccent).length).toBe(VERTS_PER_BOX);
    expect(verticesOfColor(main, COLORS.forbidden).length).toBe(0);
  });

  it('grind edges: a cream stripe on top of a wider ink underline, clipped to the chunk', () => {
    const { main } = build();
    const cream = verticesOfColor(main, COLORS.edgeCream);
    expect(cream.length).toBe(2 * VERTS_PER_BOX);
    const topY = Math.max(...cream.map((p) => p[1]!));
    expect(topY).toBeGreaterThan(0.45);
    const zs = cream.map((p) => p[2]!);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-CHUNK_LEN - 1e-6);           // the 26 m edge is clipped at 32 m
    const left = cream.filter((p) => p[0]! < 2);
    const creamW = Math.max(...left.map((p) => p[0]!)) - Math.min(...left.map((p) => p[0]!));
    const ink = verticesOfColor(main, COLORS.ink).filter((p) => p[0]! > 1.5 && p[0]! < 1.9);
    const inkW = Math.max(...ink.map((p) => p[0]!)) - Math.min(...ink.map((p) => p[0]!));
    expect(inkW).toBeGreaterThan(creamW);
    expect(Math.max(...ink.map((p) => p[1]!))).toBeLessThan(topY);
  });

  it('edges stay ≥ minEdgePx wide on screen at every viewport, even fully zoomed out (10.5 m/s)', () => {
    for (const v of [vp(390, 844), vp(390, 664), vp(375, 548), vp(393, 852, 59), vp(1280, 800)]) {
      const o = buildOptionsFor(v);
      const px = (2 * o.edgeHalfW * v.hCss) / solveFraming(10.5, v).H;
      expect(px, `${v.wCss}×${v.hCss}`).toBeGreaterThanOrEqual(CAMERA.minEdgePx - 1e-9);
    }
  });

  it('stays inside the per-chunk triangle budget (≤ 12k) and puts camera-side tall decor in `near`', () => {
    const { main, near } = build();
    expect((main.count + near.count) / 3).toBeLessThan(12000);
    expect(near.count).toBeGreaterThan(0);              // the building at x = +5.2
    expect(verticesOfColor(main, COLORS.pole).length).toBeGreaterThan(0);   // the lamp at x = −4.75 stays in main
  });
});

describe('streaming WorldView', () => {
  const fakeCtx = (): GfxContext => ({ renderer: { info: { render: { calls: 0 } } } as unknown as GfxContext['renderer'],
    scene: new Scene(), quality: 'med', palette: () => GOLDEN, canvasTexture: () => new Texture() });
  const fakeGen = (): WorldGen => ({ seed: 1, mode: 'normal', ensure: () => true, chunk, release: () => undefined, segments: () => [],
    areaAt: () => ({ area: 'downtown', blend: null, gateway: null, first: false }), stats: () => ({ segments: 0, rerolls: 0, fallbacks: 0, rejections: {}, trickCoinShare: 0, msPerSegment: 0 }) });
  const frame = (s: number, events: GameEvent[] = []): RenderFrame => {
    const st = { tick: 0, t: s / 7, p: { s, x: 0, y: 0 }, vel: { s: 7, x: 0, y: 0 }, groundY: 0, surface: 'asphalt' };
    return { alpha: 1, dt: 1 / 60, timeScale: 1, prev: st, cur: st, pose: {}, score: {}, events, playerS: s, speed: 7,
      area: 'downtown', blend: null, viewport: vp(390, 844) } as unknown as RenderFrame;
  };

  it('keeps the 1-behind / 3-ahead window, one build per frame, and rebases at 512 m', () => {
    const ctx = fakeCtx(), view = createWorldView(ctx) as GreyboxView;
    view.attach(fakeGen());
    for (let k = 0; k < 5; k++) view.update(frame(40));
    expect(view.debugInfo().chunks).toEqual([0, 1, 2, 3, 4]);
    view.update(frame(80));                             // chunk 2: window 1..5, one new build (5), chunk 0 released
    expect(view.debugInfo().chunks).toEqual([1, 2, 3, 4, 5]);
    for (let k = 0; k < 5; k++) view.update(frame(ORIGIN_REBASE + 10));
    const info = view.debugInfo();
    expect(info.originS).toBe(ORIGIN_REBASE);
    const world = ctx.scene.getObjectByName('world')!;
    for (const g of world.children) {
      const i = Number(g.name.replace('chunk', ''));
      expect(g.position.z).toBeCloseTo(-(i * CHUNK_LEN - ORIGIN_REBASE), 9);
    }
  });

  it('pools: streaming 3 km allocates no new buffers after warm-up', () => {
    const view = createWorldView(fakeCtx()) as GreyboxView;
    view.attach(fakeGen());
    let s = 0;
    for (; s < 400; s += 2) view.update(frame(s));
    const warm = view.debugInfo().geosCreated;
    for (; s < 3000; s += 2) view.update(frame(s));
    expect(view.debugInfo().geosCreated).toBe(warm);
    expect(view.debugInfo().coinSlotsUsed).toBeLessThanOrEqual(5 * 4);
    view.attach(fakeGen());                             // new run: everything back in the pool
    expect(view.debugInfo().chunks).toEqual([]);
    expect(view.debugInfo().coinSlotsUsed).toBe(0);
  });

  it('collected coins are hidden (and stay hidden when their chunk is rebuilt)', () => {
    const ctx = fakeCtx(), view = createWorldView(ctx) as GreyboxView;
    view.attach(fakeGen());
    for (let k = 0; k < 5; k++) view.update(frame(1));
    view.update(frame(1, [{ t: 'coin', tick: 1, id: 0, value: 1, p: { s: 2, x: 0, y: 0.5 }, chain: 1 }]));
    const coins = ctx.scene.getObjectByName('coins') as unknown as { count: number; instanceMatrix: { array: Float32Array } };
    const scales: number[] = [];
    for (let k = 0; k < coins.count; k++) scales.push(Math.abs(coins.instanceMatrix.array[k * 16]!));
    expect(scales.filter((x) => x === 0).length).toBeGreaterThanOrEqual(1);
    view.rebuildGPU();
    for (let k = 0; k < 6; k++) view.update(frame(1));
    const after: number[] = [];
    for (let k = 0; k < coins.count; k++) after.push(Math.abs(coins.instanceMatrix.array[k * 16]!));
    expect(after.filter((x) => x > 0).length).toBe(scales.filter((x) => x > 0).length);
  });
});
