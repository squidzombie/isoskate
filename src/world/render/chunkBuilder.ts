// world/render/chunkBuilder.ts: one chunk → the 5 merged meshes (TECH §8.6) written straight into pooled buffers
// through the Kit brush (writer.ts): the street base, every obstacle (kits/), every decor record (kits/decor.ts,
// kits/buildings.ts), plus the instanced-layer records it emits (decals, lantern spheres) and the ambient emitters.
// Geometry is chunk-local: x = x, y = y, z = −(s − chunk.s0) (≤ 32 m, plus the overhang of compact props and decor
// anchored in this chunk), so the view rebases with group.position.z.
import type { AreaId } from '../../core/ids';
import { hash32 } from '../../core/rng';
import type { AreaBlend, Chunk, GroundSlab } from '../../core/world';
import { HEIGHT } from '../../core/tuning';
import { ambientOf, drawDecor, type AmbientRec } from './kits/decor';
import { DEFAULT_BUILD, setArea, type BuildOptions, type DecalRec, type KitCtx, type LanternRec } from './kits/common';
import { drawObstacle } from './kits/index';
import { streetBase } from './kits/shared';
import { HAZARD, LOOK, blendWeight, mixHex } from './palette';
import { Kit, type KitTargets } from './writer';

export { DEFAULT_BUILD, type BuildOptions } from './kits/common';

/** Height class of a solid relative to its local ground (DESIGN §5.5). */
export function heightClass(top: number, ground: number): 'bump' | 'low' | 'forbidden' | 'tall' {
  const h = top - ground;
  if (h <= HEIGHT.bumpMax) return 'bump';
  if (h <= HEIGHT.lowMax) return 'low';
  if (h < HEIGHT.tallMin) return 'forbidden';
  return 'tall';
}

export interface AreaSource { areaAt(s: number): { area: AreaId; blend: AreaBlend | null } }
export interface ChunkBuildOut { decals: DecalRec[]; lanterns: LanternRec[]; ambient: AmbientRec[]; far: number }

/** Builds chunk `ch` into the targets. `first`: the first chunk built for this run (draws compact bodies anchored
 *  before it). `glowCards`: the per-chunk glow-card cap (TECH §8.4, per quality tier). */
export function buildChunk(ch: Chunk, w: KitTargets, areas: AreaSource, opts: Readonly<BuildOptions> = DEFAULT_BUILD,
  glowCards = 40, first = false): ChunkBuildOut {
  const K = new Kit(w).chunk(ch.s0);
  const out: ChunkBuildOut = { decals: [], lanterns: [], ambient: [], far: ch.s0 + ch.len };
  const c: KitCtx = {
    K, area: ch.area, hz: HAZARD[ch.area], s0: ch.s0, s1: ch.s0 + ch.len, opts, glowLeft: glowCards,
    areaAt: (s) => areas.areaAt(s).area,
    lookAt: (s) => lookAreaAt(areas, s),
    groundAt: (s, x) => groundSlab(ch, s, x)?.y0 ?? 0,
    surfaceAt: (s, x) => groundSlab(ch, s, x)?.surface ?? null,
    decal: (d) => { out.decals.push(d); },
    lantern: (l) => { out.lanterns.push(l); },
  };
  streetBase(c, ch, (s) => roadAt(areas, s));
  for (const ob of ch.obstacles) out.far = Math.max(out.far, drawObstacle(c, ob, ch.index, first));
  for (const d of ch.decor) {
    setArea(c, areas.areaAt(d.s).area);
    drawDecor(c, d);
    const a = ambientOf(d);
    if (a) out.ambient.push(a);
    out.far = Math.max(out.far, d.s + (d.params?.d ?? d.params?.len ?? 4));
  }
  return out;
}

/** The highest flat ground slab (solid-free obstacles: sidewalks, plazas, aprons, below 0.5 m) at (s, x). */
function groundSlab(ch: Chunk, s: number, x: number): GroundSlab | null {
  let best: GroundSlab | null = null;
  for (const ob of ch.obstacles) {
    if (ob.solids.length) continue;
    for (const sl of ob.slabs) if (sl.kind === 'flat' && sl.s0 <= s && sl.s1 > s && sl.x0 <= x && sl.x1 >= x && sl.y0 < 0.5 && (!best || sl.y0 > best.y0)) best = sl;
  }
  return best;
}

/** The preset that dominates at s: the blend's `to` past its middle (DESIGN §18.1 8 s window), else the area. */
export function lookAreaAt(areas: AreaSource, s: number): AreaId {
  const a = areas.areaAt(s);
  if (!a.blend) return a.area;
  return blendWeight(a.blend) >= 0.5 ? a.blend.to : a.blend.from;
}
/** Road colour at s: the dominant preset's road, switched over a short ramp in the middle of the gateway window
 *  (inside the gateway piece), so the hazards on it always match their look (ink on asphalt, inverted on wet). */
export function roadAt(areas: AreaSource, s: number): number {
  const a = areas.areaAt(s);
  if (!a.blend) return LOOK[a.area].road;
  const k = Math.min(1, Math.max(0, (blendWeight(a.blend) - 0.5) * 8 + 0.5));
  return mixHex(LOOK[a.blend.from].road, LOOK[a.blend.to].road, k);
}

/** A content hash of a chunk (what the build reads), for the Roll-out cache: identical chunks reuse their meshes. */
export function chunkHash(ch: Chunk, areas: AreaSource, key: number): number {
  let h = hash32(ch.index, Math.round(ch.s0 * 100), key, ch.obstacles.length, ch.decor.length, ch.coins.length);
  const f = (v: number) => Math.round(v * 100);
  for (const o of ch.obstacles) {
    h = hash32(h, o.id, o.kind.length, o.kind.charCodeAt(0), o.kind.charCodeAt(o.kind.length - 1), f(o.s), f(o.x), f(o.len), f(o.wid), f(o.hgt), o.variant, o.area.charCodeAt(0));
    for (const so of o.solids) h = hash32(h, f(so.box.s0), f(so.box.s1), f(so.box.x0), f(so.box.x1), f(so.box.y1));
    for (const sl of o.slabs) h = hash32(h, f(sl.s0), f(sl.s1), f(sl.x0), f(sl.x1), f(sl.y0), f(sl.y1));
    for (const e of o.edges) h = hash32(h, f(e.a.s), f(e.b.s), f(e.a.x), f(e.a.y));
    for (const p of o.pits) h = hash32(h, f(p.s0), f(p.s1), f(p.x0), f(p.x1));
  }
  for (const d of ch.decor) {
    h = hash32(h, d.kind.length, d.kind.charCodeAt(0), d.kind.charCodeAt(d.kind.length - 1), f(d.s), f(d.x), f(d.y), d.variant, f(d.rotY));
    if (d.params) for (const [k, v] of Object.entries(d.params)) h = hash32(h, k.charCodeAt(0), k.length, f(v));
  }
  for (const c of ch.coins) h = hash32(h, c.id, f(c.p.s), f(c.p.x), f(c.p.y));
  for (let s = ch.s0; s < ch.s0 + ch.len; s += 8) { const a = areas.areaAt(s); h = hash32(h, a.area.charCodeAt(0), f(a.blend?.u ?? -1)); }
  return h;
}
