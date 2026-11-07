// The WorldView in node (no WebGL): the streaming window and one build per frame, the first frame of a run, origin
// rebasing, pooled buffers (no allocation in steady state), the Roll-out cache across runs, coin hiding, the crash
// grading (uDesat) and context-loss rebuild. Fake GfxContext: the view only reads renderer.info / domElement.
import { describe, expect, it } from 'vitest';
import { Color, Scene, Texture } from 'three';
import type { GameEvent } from '../../../src/core/events';
import { CHUNK_LEN, ORIGIN_REBASE } from '../../../src/core/tuning';
import type { GfxContext, RenderFrame, Viewport } from '../../../src/core/view';
import type { Chunk } from '../../../src/core/world';
import { GOLDEN, sharedUniforms } from '../../../src/gfx';
import { buildOptionsFor, createWorldView, solveFraming, type WorldViewDebug } from '../../../src/world/render';
import { CAMERA } from '../../../src/core/tuning';
import { emptyChunk, fakeGen, obstacleOf, place, resetIds } from './fixtures';

const vp = (w: number, h: number, safeTop = 0): Viewport => ({ wCss: w, hCss: h, dpr: 1, aspect: w / h, safeTop, safeBottom: 0, coarse: true });
const fakeCtx = (): GfxContext => {
  const scene = new Scene(); scene.background = new Color(0);
  return { renderer: { info: { render: { calls: 0 } }, domElement: { width: 390, height: 844 }, toneMappingExposure: 1 } as unknown as GfxContext['renderer'],
    scene, quality: 'med', palette: () => GOLDEN, canvasTexture: () => new Texture() };
};
function gen(coinsAt: number[] = []) {
  resetIds();
  const chunks = new Map<number, Chunk>();
  const obs = [24, 60, 100, 140].flatMap((s, i) => obstacleOf(i % 2 ? 'trash_can' : 'barrier_low', 'downtown', s, 0));
  place(chunks, () => 'downtown', obs, [], coinsAt.map((s, i) => ({ id: 1000 + i, p: { s, x: 0, y: 0.5 }, value: 1 as const, line: 'safe' as const })));
  return fakeGen(chunks, () => ({ area: 'downtown', blend: null }));
}
const frame = (s: number, events: GameEvent[] = [], view: Viewport = vp(390, 844)): RenderFrame => {
  const st = { tick: Math.round(s * 9), t: s / 7, p: { s, x: 0, y: 0 }, vel: { s: 7, x: 0, y: 0 }, groundY: 0, surface: 'asphalt', mode: 'roll', grind: null };
  return { alpha: 1, dt: 1 / 60, timeScale: 1, prev: st, cur: st, pose: {}, score: { combo: { active: false, bankIn: 0 } }, events, playerS: s, speed: 7,
    area: 'downtown', blend: null, viewport: view } as unknown as RenderFrame;
};

describe('WorldView streaming', () => {
  it('first frame: the three chunks on screen; then at most one build per frame (sliced) up to 1 behind / 3 ahead; rebases at 512 m', () => {
    const ctx = fakeCtx(), view = createWorldView(ctx) as WorldViewDebug;
    view.attach(gen());
    view.update(frame(40));
    expect(view.debugInfo().chunks).toEqual([0, 1, 2]);
    // The chunks ahead are not on screen yet: each one may take a few frames (STREAM.sliceMs), never two per frame.
    let n = 3;
    for (let k = 0; k < 40 && view.debugInfo().chunks.length < 5; k++) {
      view.update(frame(40));
      const m = view.debugInfo().chunks.length;
      expect(m - n).toBeLessThanOrEqual(1);
      n = m;
    }
    expect(view.debugInfo().chunks).toEqual([0, 1, 2, 3, 4]);
    for (let k = 0; k < 40 && !view.debugInfo().chunks.includes(5); k++) view.update(frame(80));
    expect(view.debugInfo().chunks).toEqual([1, 2, 3, 4, 5]);
    for (let k = 0; k < 60; k++) view.update(frame(ORIGIN_REBASE + 10));
    expect(view.debugInfo().originS).toBe(ORIGIN_REBASE);
    const world = ctx.scene.getObjectByName('world')!;
    for (const g of world.children) expect(g.position.z).toBeCloseTo(-(Number(g.name.replace('chunk', '')) * CHUNK_LEN - ORIGIN_REBASE), 9);
  });

  it('pools: streaming 3 km allocates no new buffers after warm-up and a new run returns everything', () => {
    const view = createWorldView(fakeCtx()) as WorldViewDebug;
    view.attach(gen());
    let s = 0;
    for (; s < 600; s += 2) view.update(frame(s));
    const warm = view.debugInfo().geosCreated;
    for (; s < 3000; s += 2) view.update(frame(s));
    expect(view.debugInfo().geosCreated).toBe(warm);
    view.attach(gen());
    expect(view.debugInfo().chunks).toEqual([]);
    expect(view.debugInfo().coinSlotsUsed).toBe(0);
  });

  it('the Roll-out chunks (−1..1) are cached across runs and restored on the first frame of the next run', () => {
    const view = createWorldView(fakeCtx()) as WorldViewDebug;
    view.attach(gen());
    for (let s = 0; s < 200; s += 2) view.update(frame(s));
    expect(view.debugInfo().cached).toEqual(expect.arrayContaining([-1, 0, 1]));
    const built = view.debugInfo().chunksBuilt, hits = view.debugInfo().cacheHits;
    view.attach(gen());                                 // a retry: the same Roll-out content
    view.update(frame(0));
    expect(view.debugInfo().chunks).toEqual([-1, 0, 1]);
    expect(view.debugInfo().cacheHits - hits).toBe(3);
    expect(view.debugInfo().chunksBuilt).toBe(built);
  });

  it('coins: one slot per coin in view, hidden on pickup, released with their chunk', () => {
    const view = createWorldView(fakeCtx()) as WorldViewDebug;
    view.attach(gen([10, 20, 30, 70]));
    for (let k = 0; k < 6; k++) view.update(frame(10));
    expect(view.debugInfo().coinSlotsUsed).toBe(4);
    view.update(frame(10, [{ t: 'coin', tick: 1, id: 1000, value: 1, p: { s: 10, x: 0, y: 0.5 }, chain: 1 }]));
    expect(view.debugInfo().coinSlotsUsed).toBe(4);       // hidden by matrix, slot kept until the chunk goes
  });

  it('a crash desaturates the world through the shared uDesat uniform; the next run clears it; god crashes do not', () => {
    const ctx = fakeCtx(), view = createWorldView(ctx);
    view.attach(gen());
    const u = sharedUniforms(ctx).uDesat;
    view.update(frame(10, [{ t: 'crash', tick: 1, cause: 'slam', obstacleId: null, kind: null, speed: 7, state: 'roll', flipProgress: 0, spinProgress: 0, god: true }]));
    for (let k = 0; k < 30; k++) view.update(frame(10));
    expect(u.value).toBe(0);
    view.update(frame(10, [{ t: 'crash', tick: 1, cause: 'slam', obstacleId: null, kind: null, speed: 7, state: 'roll', flipProgress: 0, spinProgress: 0 }]));
    for (let k = 0; k < 60; k++) view.update(frame(10));
    expect(u.value).toBeCloseTo(0.4, 2);
    view.attach(gen());
    expect(u.value).toBe(0);
  });

  it('rebuildGPU (context restore) rebuilds every chunk from the generator', () => {
    const view = createWorldView(fakeCtx()) as WorldViewDebug;
    view.attach(gen());
    for (let k = 0; k < 6; k++) view.update(frame(50));
    const before = view.debugInfo().chunks;
    view.rebuildGPU();
    expect(view.debugInfo().chunks).toEqual([]);
    for (let k = 0; k < 6; k++) view.update(frame(50));
    expect(view.debugInfo().chunks).toEqual(before);
  });

  it('edges stay ≥ minEdgePx wide on screen at every viewport, even fully zoomed out (10.5 m/s)', () => {
    for (const v of [vp(390, 844), vp(390, 664), vp(375, 548), vp(393, 852, 59), vp(1280, 800)]) {
      const o = buildOptionsFor(v);
      expect((2 * o.edgeHalfW * v.hCss) / solveFraming(10.5, v).H, `${v.wCss}×${v.hCss}`).toBeGreaterThanOrEqual(CAMERA.minEdgePx - 1e-9);
    }
    void emptyChunk;
  });
});
