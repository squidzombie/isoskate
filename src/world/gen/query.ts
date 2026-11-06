// world/gen/query.ts: WorldQuery over the chunk lists (TECH §5.3).
// M0 stub: correct results, simple implementation (allocates small arrays per call).
// TODO(M0-sim/WG): tick-stamped Uint32Array mark table for allocation-free de-duplication.
import { clamp } from '../../core/math';
import { CHUNK_LEN } from '../../core/tuning';
import type { Coin, GrindEdge, GroundHit, GroundSlab, Obstacle, Pit, WorldGen, WorldQuery } from '../../core/world';
import { GEN_INTERNALS } from './generator';

/** Height of a slab's surface at s (stairs and inclines interpolate y0 → y1). */
export function slabYAt(sl: GroundSlab, s: number): number {
  if (sl.y0 === sl.y1) return sl.y0;
  const u = clamp((s - sl.s0) / (sl.s1 - sl.s0), 0, 1);
  return sl.y0 + (sl.y1 - sl.y0) * u;
}

export function createWorldQueryImpl(gen: WorldGen): WorldQuery {
  const internals = GEN_INTERNALS.get(gen);
  const ci = (s: number) => Math.floor(s / CHUNK_LEN);
  const BASE: GroundHit = { y: 0, layer: 0, surface: 'asphalt', slab: null, pit: null };

  function obstacles(s0: number, s1: number): readonly Obstacle[] {
    const seen = new Set<number>();
    const out: Obstacle[] = [];
    for (let i = ci(s0); i <= ci(s1); i++) {
      for (const ob of gen.chunk(i).obstacles) {
        if (seen.has(ob.id) || ob.s >= s1 || ob.s + ob.len <= s0) continue;
        seen.add(ob.id);
        out.push(ob);
      }
    }
    return out.sort((a, b) => a.s - b.s);
  }

  return {
    obstacles,
    groundAt(s, x, yMax) {
      let best: GroundSlab | null = null, bestY = -Infinity;
      let pit: Pit | null = null;
      for (const ob of gen.chunk(ci(s)).obstacles) {
        for (const sl of ob.slabs) {
          if (s < sl.s0 || s >= sl.s1 || x < sl.x0 || x > sl.x1) continue;
          const y = slabYAt(sl, s);
          if (y <= yMax + 1e-9 && y > bestY) { best = sl; bestY = y; }
        }
        for (const p of ob.pits) if (s >= p.s0 && s < p.s1 && x >= p.x0 && x <= p.x1) pit = p;
      }
      if (best) return { y: bestY, layer: best.layer, surface: best.surface, slab: best, pit: null };
      if (pit) return { y: pit.lipY, layer: 0, surface: 'asphalt', slab: null, pit };
      return BASE;                        // M0: the road itself (y = 0) is implicit, not a slab
    },
    edgesNear(s0, s1, x, range) {
      const out: GrindEdge[] = [];
      for (const ob of obstacles(s0, s1)) {
        for (const e of ob.edges) {
          if (e.b.s < s0 || e.a.s > s1) continue;
          const u = clamp((x - e.a.x) / ((e.b.x - e.a.x) || 1), 0, 1);
          const ex = e.a.x === e.b.x ? e.a.x : e.a.x + (e.b.x - e.a.x) * u;
          if (Math.abs(ex - x) <= range) out.push(e);
        }
      }
      return out;
    },
    coins(s0, s1) {
      const out: Coin[] = [];
      for (let i = ci(s0); i <= ci(s1); i++) for (const c of gen.chunk(i).coins) if (c.p.s >= s0 && c.p.s < s1) out.push(c);
      return out;
    },
    moverOffset(ob, playerS) {
      const m = ob.mover;
      if (!m) return 0;
      return m.dxTotal * clamp((playerS - m.sStart) / (m.sEnd - m.sStart), 0, 1);
    },
    edge: (id) => internals?.edgeById.get(id),
    obstacle: (id) => internals?.obstacleById.get(id),
  };
}
