// world/render/warmup.ts: idle-time warm-up of the kit code (TECH §8.6 prop library at boot; DESIGN §18.5 "built once at
// boot"). The kits write straight into pooled buffers instead of keeping per-kind geometry, so what is worth doing at
// boot is running every kit and decor renderer once, per area skin, while nothing else happens: the JIT then compiles
// them before a run streams its first dense chunk, and the first Neon chunk of a run is not the first Neon chunk ever
// built. One synthetic chunk per area (every PropKind, low and tall, plus every decor kind of the area), built into
// scratch buffers in an idle callback and thrown away. Never called in a frame.
import { DECOR_KINDS, type DecorKind } from '../../core/decor';
import { AREA_ORDER, type AreaId, type PropKind } from '../../core/ids';
import { CHUNK_LEN } from '../../core/tuning';
import type { Chunk, Decor, Obstacle } from '../../core/world';
import { buildChunk, type AreaSource } from './chunkBuilder';
import { KITS } from './kits/index';
import { GeoPool } from './pools';
import { GeoWriter, type KitTargets } from './writer';

const T = ['o', 'x', 'e', 'g', 'b'] as const;

/** A synthetic chunk exercising every kit and every decor renderer of `area` (geometry is not meant to look right). */
export function warmupChunk(area: AreaId, index = -40): Chunk {
  const s0 = index * CHUNK_LEN, obstacles: Obstacle[] = [], decor: Decor[] = [];
  let id = -900000 - AREA_ORDER.indexOf(area) * 10000, edge = id;
  const kinds = Object.keys(KITS) as PropKind[];
  kinds.forEach((kind, i) => {
    for (const h of [0.45, 1.2]) {
      const s = s0 + 0.5 + ((i * 2 + (h > 1 ? 1 : 0)) % 24) * 1.3, x = -3 + ((i * 7) % 7);
      const box = { s0: s, s1: s + 1.2, x0: x - 0.5, x1: x + 0.5, y0: 0, y1: h };
      const oid = id--;
      obstacles.push({ id: oid, kind, area, segment: -1, s, x, len: 1.2, wid: 1, hgt: h, rotY: 0, mirror: false, variant: i,
        solids: [{ box, top: 'crash', tall: h >= 1.15 }],
        slabs: [{ s0: s, s1: s + 1.2, x0: x - 0.5, x1: x + 0.5, y0: h, y1: kind === 'stairs' || kind === 'incline' ? 0 : h, layer: 0,
          surface: 'concrete', kind: kind === 'stairs' || kind === 'terrace' ? 'stairs' : kind === 'incline' ? 'incline' : 'flat', steps: 3 }],
        pits: kind === 'trench' ? [{ s0: s, s1: s + 1.2, x0: -4.5, x1: 4.5, lipY: 0, depth: 0.6, cause: 'fall' }] : [],
        edges: [{ id: edge--, obstacleId: oid, a: { s, x, y: h }, b: { s: s + 1.2, x, y: h }, kind: 'rail', material: 'metal', layer: 0, pickOnly: false }],
        tags: kind === 'barrier_low' || kind === 'holo_gate' || kind === 'trench' ? 1 : 0 });
    }
  });
  (Object.keys(DECOR_KINDS) as DecorKind[]).forEach((kind, i) => {
    if (!(DECOR_KINDS[kind].areas as readonly string[]).includes(area)) return;
    const side = i % 2 ? 1 : -1;
    decor.push({ kind, s: s0 + 1 + (i % 28), x: side * 6, y: 0.15, rotY: 0, scale: 1, variant: i, castShadow: DECOR_KINDS[kind].castShadow });
  });
  return { index, s0, len: CHUNK_LEN, area, blend: null, obstacles, decor, coins: [], safe: [], segments: [] };
}

/** Builds the warm-up chunk of `area` into scratch buffers (a few ms the first time, sub-ms once warm). */
export function warmupArea(area: AreaId): number {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const w = Object.fromEntries(T.map((t) => [t, new GeoWriter()])) as unknown as KitTargets;
  const pools = T.map(() => new GeoPool(2048));
  T.forEach((t, i) => w[t].begin(pools[i]!.acquire()));
  const src: AreaSource = { areaAt: () => ({ area, blend: null }) };
  buildChunk(warmupChunk(area), w, src, undefined, 40, true);
  T.forEach((t, i) => { pools[i]!.release(w[t].end()); pools[i]!.dispose(); });
  return (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
}

/** Schedules one area per idle callback (no-op without requestIdleCallback / setTimeout, e.g. in node tests). */
export function scheduleWarmup(done?: (ms: number[]) => void): void {
  const g = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; document?: unknown };
  if (!g.document) return;
  const idle = g.requestIdleCallback ? (f: () => void) => g.requestIdleCallback!(f, { timeout: 2000 }) : (f: () => void) => setTimeout(f, 50);
  const ms: number[] = [];
  const next = (i: number) => {
    if (i >= AREA_ORDER.length) { done?.(ms); return; }
    idle(() => { try { ms.push(warmupArea(AREA_ORDER[i]!)); } catch { /* a warm-up never breaks the game */ } next(i + 1); });
  };
  next(0);
}
