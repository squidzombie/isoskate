// Hand-built worlds for sim tests (TECH §4.5 SimDeps, ROADMAP W1a): obstacles injected with createSim(tables, { makeWorld }).
// The WorldQuery here is a plain linear implementation of the core/world.ts contract, independent of world/gen.
import type { PropKind } from '../../../src/core/ids';
import { EMPTY_FRAME, type InputFrame } from '../../../src/core/input';
import type { RunConfig, SimDeps } from '../../../src/core/sim';
import type { Chunk, Coin, GrindEdge, GroundHit, GroundSlab, Obstacle, Pit, WorldGen, WorldQuery } from '../../../src/core/world';
import { CHUNK_LEN, STEP_UP, sAt } from '../../../src/core/tuning';

export const frame = (p: Partial<InputFrame> = {}): InputFrame => ({ ...EMPTY_FRAME, ...p });
export const runCfg = (o: Partial<RunConfig> = {}): RunConfig => ({ runId: 'test', seed: 1, mode: 'normal', firstRuns: false, bestDist: 0, ...o });

let nextId = 1000;
let nextEdge = 5000;
const base = (kind: PropKind, s: number, x: number, len: number, wid: number, hgt: number): Obstacle => ({
  id: ++nextId, kind, area: 'downtown', segment: 0, s, x, len, wid, hgt, rotY: 0, mirror: false, variant: 0,
  solids: [], slabs: [], pits: [], edges: [], tags: 0,
});

/** A box solid. Landable boxes also get their top slab (a raised slab with a body, TECH §4.3). */
export function box(o: { kind?: PropKind; s: number; x: number; len: number; wid: number; hgt: number;
  top: 'landable' | 'crash' | 'knock'; y0?: number; edges?: ('l' | 'r' | 'c')[]; pickOnly?: boolean }): Obstacle {
  const y0 = o.y0 ?? 0, top = y0 + o.hgt;
  const ob = base(o.kind ?? (o.top === 'landable' ? 'granite_ledge' : o.top === 'knock' ? 'cone' : 'trash_can'), o.s, o.x, o.len, o.wid, o.hgt);
  const b = { s0: o.s, s1: o.s + o.len, x0: o.x - o.wid / 2, x1: o.x + o.wid / 2, y0, y1: top };
  ob.solids.push({ box: b, top: o.top, tall: o.hgt >= 1.15 });
  if (o.top === 'landable') ob.slabs.push({ s0: b.s0, s1: b.s1, x0: b.x0, x1: b.x1, y0: top, y1: top, layer: 0, surface: 'granite', kind: 'flat' });
  for (const side of o.edges ?? []) {
    const ex = side === 'l' ? b.x0 : side === 'r' ? b.x1 : o.x;
    ob.edges.push({ id: ++nextEdge, obstacleId: ob.id, a: { s: b.s0, x: ex, y: top }, b: { s: b.s1, x: ex, y: top },
      kind: 'ledge', material: 'stone', layer: 0, pickOnly: o.pickOnly ?? o.hgt <= STEP_UP });
  }
  return ob;
}

/** A rideable slab with no body (a step ≤ STEP_UP, a pad, a sidewalk). */
export function slab(o: { s: number; len: number; x0: number; x1: number; y: number; y1?: number;
  kind?: GroundSlab['kind']; steps?: number; edge?: 'l' | 'r' }): Obstacle {
  const ob = base(o.kind === 'stairs' ? 'stairs' : 'manual_pad', o.s, (o.x0 + o.x1) / 2, o.len, o.x1 - o.x0, Math.max(o.y, o.y1 ?? o.y));
  const sl: GroundSlab = { s0: o.s, s1: o.s + o.len, x0: o.x0, x1: o.x1, y0: o.y, y1: o.y1 ?? o.y, layer: 0,
    surface: 'concrete', kind: o.kind ?? 'flat' };
  if (o.steps !== undefined) sl.steps = o.steps;
  ob.slabs.push(sl);
  if (o.edge) {
    const ex = o.edge === 'l' ? o.x0 : o.x1;
    ob.edges.push({ id: ++nextEdge, obstacleId: ob.id, a: { s: o.s, x: ex, y: o.y }, b: { s: o.s + o.len, x: ex, y: o.y },
      kind: 'curb', material: 'concrete', layer: 0, pickOnly: o.y <= STEP_UP });
  }
  return ob;
}

/** A pit across [x0, x1] (default full width), lip level `lipY` (TECH §4.3: pit level = lip level). */
export function pit(o: { s: number; len: number; x0?: number; x1?: number; lipY?: number; cause?: Pit['cause'] }): Obstacle {
  const x0 = o.x0 ?? -4.5, x1 = o.x1 ?? 4.5;
  const ob = base('trench', o.s, (x0 + x1) / 2, o.len, x1 - x0, 0);
  ob.pits.push({ s0: o.s, s1: o.s + o.len, x0, x1, lipY: o.lipY ?? 0, depth: 0.6, cause: o.cause ?? 'fall' });
  ob.tags = 1;
  return ob;
}

/** A thin rail on posts: a crash-top solid with one centre edge. */
export function rail(o: { s: number; x: number; len: number; hgt: number }): Obstacle {
  return box({ kind: 'flatbar', s: o.s, x: o.x, len: o.len, wid: 0.05, hgt: o.hgt, top: 'crash', edges: ['c'], pickOnly: false });
}

/** s where the skater centre is at run time t (on the speed schedule). */
export const sAtT = (t: number): number => sAt(t);

/** `gatewayS`: a Greenway gateway from that s on (a gateway bank there), else none. */
export function fixtureWorld(obstacles: Obstacle[], coins: Coin[] = [], o: { gatewayS?: number } = {}): SimDeps {
  const sorted = obstacles.slice().sort((a, b) => a.s - b.s);
  const edgeById = new Map<number, GrindEdge>();
  for (const ob of sorted) for (const e of ob.edges) edgeById.set(e.id, e);
  const STREET: GroundHit = { y: 0, layer: 0, surface: 'asphalt', slab: null, pit: null };
  const yAt = (sl: GroundSlab, s: number) => sl.y0 === sl.y1 ? sl.y0 : sl.y0 + (sl.y1 - sl.y0) * Math.min(1, Math.max(0, (s - sl.s0) / (sl.s1 - sl.s0)));
  return {
    makeWorld(cfg) {
      const gen: WorldGen = {
        seed: cfg.seed, mode: cfg.mode,
        ensure: () => true,
        chunk(i: number): Chunk {
          const s0 = i * CHUNK_LEN;
          return { index: i, s0, len: CHUNK_LEN, area: 'downtown', blend: null, segments: [], decor: [], safe: [],
            obstacles: sorted.filter((o) => o.s < s0 + CHUNK_LEN && o.s + o.len >= s0),
            coins: coins.filter((c) => c.p.s >= s0 && c.p.s < s0 + CHUNK_LEN) };
        },
        release: () => {},
        segments: () => [],
        areaAt: (s: number) => ({ area: 'downtown', blend: null, gateway: o.gatewayS !== undefined && s >= o.gatewayS ? 'greenway' : null, first: true }),
        stats: () => ({ segments: 0, rerolls: 0, fallbacks: 0, rejections: {}, trickCoinShare: 1, msPerSegment: 0 }),
      };
      const world: WorldQuery = {
        obstacles: (s0, s1) => sorted.filter((o) => o.s < s1 && o.s + o.len > s0),
        groundAt(s, x, yMax) {
          let best: GroundHit | null = null;
          for (const ob of sorted) for (const sl of ob.slabs) {
            if (s < sl.s0 || s >= sl.s1 || x < sl.x0 || x > sl.x1) continue;
            const y = yAt(sl, s);
            if (y <= yMax + 1e-9 && (!best || y > best.y)) best = { y, layer: sl.layer, surface: sl.surface, slab: sl, pit: null };
          }
          if (best) return best;
          for (const ob of sorted) for (const p of ob.pits) {
            if (s >= p.s0 && s < p.s1 && x >= p.x0 && x <= p.x1) return { y: p.lipY, layer: 0, surface: 'asphalt', slab: null, pit: p };
          }
          return STREET;
        },
        edgesNear: (s0, s1, x, range) => [...edgeById.values()].filter((e) => e.b.s >= s0 && e.a.s <= s1 && Math.abs(e.a.x - x) <= range),
        coins: (s0, s1) => coins.filter((c) => c.p.s >= s0 && c.p.s < s1),
        moverOffset: () => 0,
        edge: (id) => edgeById.get(id),
        obstacle: (id) => sorted.find((o) => o.id === id),
      };
      return { gen, world };
    },
  };
}
