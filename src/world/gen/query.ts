// world/gen/query.ts: WorldQuery over the chunk lists (TECH §5.3).
//  - obstacles(s0, s1): each obstacle is listed in every chunk it overlaps; it is reported only from the first scanned
//    chunk that lists it (max(chunk(ob.s), chunk(s0))), so the result needs no de-dup set and stays sorted by s.
//  - groundAt(s, x, yMax): the highest slab top ≤ yMax covering (s, x) (stairs / inclines interpolate y0 → y1); if
//    none, a pit at its lip level (pit level = lip level); otherwise the implicit M0 street datum, y = 0 asphalt.
import { clamp } from '../../core/math';
import { CHUNK_LEN, tAt } from '../../core/tuning';
import type { AreaId, GatewayId } from '../../core/ids';
import type { Coin, GrindEdge, GroundHit, GroundSlab, Obstacle, Pit, WorldGen, WorldQuery } from '../../core/world';
import { areaGatewayInto } from './areas';
import { GEN_INTERNALS } from './generator';

/** Allocation-free variants of the WorldQuery calls the sim makes every tick (TECH §6.3 "Allocation: none per tick").
 *  Not part of the contract: the sim looks them up with fastQueryOf(world) and falls back to the contract methods
 *  (fixture worlds). Results are written into the caller's scratch and are valid until its next call. */
export interface FastQuery {
  obstaclesInto(s0: number, s1: number, out: Obstacle[]): Obstacle[];
  coinsInto(s0: number, s1: number, out: Coin[]): Coin[];
  groundInto(s: number, x: number, yMax: number, out: GroundHit): GroundHit;
  areaGatewayInto(s: number, out: { area: AreaId; gateway: GatewayId | null }): void;
}
const FAST = new WeakMap<WorldQuery, FastQuery>();
export const fastQueryOf = (w: WorldQuery): FastQuery | undefined => FAST.get(w);

/** Height of a slab's surface at s (stairs and inclines interpolate y0 → y1). */
export function slabYAt(sl: GroundSlab, s: number): number {
  if (sl.y0 === sl.y1) return sl.y0;
  const u = clamp((s - sl.s0) / (sl.s1 - sl.s0), 0, 1);
  return sl.y0 + (sl.y1 - sl.y0) * u;
}

/** The implicit street datum (frozen object: callers must not mutate GroundHits). */
export const STREET: Readonly<GroundHit> = Object.freeze({ y: 0, layer: 0, surface: 'asphalt', slab: null, pit: null });

export function createWorldQueryImpl(gen: WorldGen): WorldQuery {
  const internals = GEN_INTERNALS.get(gen);
  const ci = (s: number) => Math.floor(s / CHUNK_LEN);

  // The *Into variants fill by index and trim once: `out.length = 0` would drop the backing store every call.
  function obstaclesInto(s0: number, s1: number, out: Obstacle[]): Obstacle[] {
    let n = 0;
    const c0 = ci(s0);
    for (let i = c0; i <= ci(s1); i++) {
      for (const ob of gen.chunk(i).obstacles) {
        if (ob.s >= s1 || ob.s + ob.len <= s0) continue;
        if (Math.max(ci(ob.s), c0) !== i) continue;     // reported from its first scanned chunk only
        out[n++] = ob;
      }
    }
    if (out.length !== n) out.length = n;
    return out;
  }
  const obstacles = (s0: number, s1: number): readonly Obstacle[] => obstaclesInto(s0, s1, []);

  function groundInto(s: number, x: number, yMax: number, out: GroundHit): GroundHit {
    let best: GroundSlab | null = null, bestY = -Infinity;
    let pit: Pit | null = null;
    for (const ob of gen.chunk(ci(s)).obstacles) {
      if (ob.s > s || ob.s + ob.len < s) continue;
      for (const sl of ob.slabs) {
        if (s < sl.s0 || s >= sl.s1 || x < sl.x0 || x > sl.x1) continue;
        const y = slabYAt(sl, s);
        if (y <= yMax + 1e-9 && y > bestY) { best = sl; bestY = y; }
      }
      if (!pit) for (const p of ob.pits) if (s >= p.s0 && s < p.s1 && x >= p.x0 && x <= p.x1) { pit = p; break; }
    }
    if (best) { out.y = bestY; out.layer = best.layer; out.surface = best.surface; out.slab = best; out.pit = null; }
    else if (pit) { out.y = pit.lipY; out.layer = 0; out.surface = 'asphalt'; out.slab = null; out.pit = pit; }
    else { out.y = 0; out.layer = 0; out.surface = 'asphalt'; out.slab = null; out.pit = null; }
    return out;
  }

  function coinsInto(s0: number, s1: number, out: Coin[]): Coin[] {
    let n = 0;
    for (let i = ci(s0); i <= ci(s1); i++) for (const c of gen.chunk(i).coins) if (c.p.s >= s0 && c.p.s < s1) out[n++] = c;
    if (out.length !== n) out.length = n;
    return out;
  }

  const query: WorldQuery = {
    obstacles,
    groundAt(s, x, yMax) {
      const g = groundInto(s, x, yMax, { y: 0, layer: 0, surface: 'asphalt', slab: null, pit: null });
      return g.slab || g.pit ? g : STREET as GroundHit;
    },
    edgesNear(s0, s1, x, range) {
      const out: GrindEdge[] = [];
      for (const ob of obstacles(s0, s1)) {
        for (const e of ob.edges) {
          if (e.b.s < s0 || e.a.s > s1) continue;
          // Closest lateral offset over the overlap (edges are straight, so it is at an end of the overlap).
          const span = e.b.s - e.a.s;
          const xa = span > 1e-9 ? e.a.x + (e.b.x - e.a.x) * clamp((Math.max(s0, e.a.s) - e.a.s) / span, 0, 1) : e.a.x;
          const xb = span > 1e-9 ? e.a.x + (e.b.x - e.a.x) * clamp((Math.min(s1, e.b.s) - e.a.s) / span, 0, 1) : e.b.x;
          const d = (xa - x) * (xb - x) <= 0 ? 0 : Math.min(Math.abs(xa - x), Math.abs(xb - x));
          if (d <= range) out.push(e);
        }
      }
      return out;
    },
    coins: (s0, s1) => coinsInto(s0, s1, []),
    moverOffset(ob, playerS) {
      const m = ob.mover;
      if (!m) return 0;
      return m.dxTotal * clamp((playerS - m.sStart) / (m.sEnd - m.sStart), 0, 1);
    },
    edge: (id) => internals?.edgeById.get(id),
    obstacle: (id) => internals?.obstacleById.get(id),
  };
  if (internals) {
    const startArea = gen.areaAt(0).area;                 // run time 0 is always in the start area
    FAST.set(query, { obstaclesInto, coinsInto, groundInto,
      areaGatewayInto: (s, out) => areaGatewayInto(tAt(s), startArea, out) });
  }
  return query;
}
