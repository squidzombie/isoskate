// world/render/chunkBuilder.ts: one chunk → the 5 merged meshes (TECH §8.6) written straight into pooled buffers
// through the Kit brush (writer.ts): the street base, every obstacle (kits/), every decor record (kits/decor.ts,
// kits/buildings.ts), plus the instanced-layer records it emits (decals, lantern spheres) and the ambient emitters.
// Geometry is chunk-local: x = x, y = y, z = −(s − chunk.s0) (≤ 32 m, plus the overhang of compact props and decor
// anchored in this chunk), so the view rebases with group.position.z.
import type { AreaId } from '../../core/ids';
import { hash32 } from '../../core/rng';
import type { AreaBlend, Chunk, GroundSlab } from '../../core/world';
import { CORRIDOR_HALF, HEIGHT } from '../../core/tuning';
import { camVariant } from './camVariants';
import { DECOR_ZONE, ambientOf, drawDecor, type AmbientRec } from './kits/decor';
import { DEFAULT_BUILD, setArea, type BuildOptions, type DecalRec, type KitCtx, type LanternRec } from './kits/common';
import { drawObstacle } from './kits/index';
import { streetBase } from './kits/shared';
import { HAZARD, LOOK, blendWeight, mixHex } from './palette';
import { FX, Kit, type KitTargets } from './writer';

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
const KITS_BY_TARGETS = new WeakMap<KitTargets, Kit>();
export function buildChunk(ch: Chunk, w: KitTargets, areas: AreaSource, opts: Readonly<BuildOptions> = DEFAULT_BUILD,
  glowCards = 40, first = false): ChunkBuildOut {
  const g = buildChunkSteps(ch, w, areas, opts, glowCards, first);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/** The same build as resumable steps (TECH §8.6 time slicing): it yields after the street base and after every
 *  obstacle and decor record, so the view can spread a chunk that is not on screen yet over frames. The writers stay
 *  begun between steps; nothing else may write to them until it returns. */
export function* buildChunkSteps(ch: Chunk, w: KitTargets, areas: AreaSource, opts: Readonly<BuildOptions> = DEFAULT_BUILD,
  glowCards = 40, first = false): Generator<void, ChunkBuildOut, void> {
  let K = KITS_BY_TARGETS.get(w);
  if (!K) { K = new Kit(w); KITS_BY_TARGETS.set(w, K); }
  K.chunk(ch.s0).frame(0, 0, 0).reset();
  const out: ChunkBuildOut = { decals: [], lanterns: [], ambient: [], far: ch.s0 + ch.len };
  const sw = lookSwitch(ch, areas);
  const c: KitCtx = {
    K, area: ch.area, hz: HAZARD[ch.area], s0: ch.s0, s1: ch.s0 + ch.len, opts, glowLeft: glowCards,
    areaAt: (s) => areas.areaAt(s).area,
    lookAt: (s) => (sw && areas.areaAt(s).blend ? (s < sw.s ? sw.from : sw.to) : lookAreaAt(areas, s)),
    groundAt: (s, x) => groundSlab(ch, s, x)?.y0 ?? 0,
    surfaceAt: (s, x) => groundSlab(ch, s, x)?.surface ?? null,
    decal: (d) => { out.decals.push(d); },
    lantern: (l) => { out.lanterns.push(l); },
    contacts: 0,
  };
  streetBase(c, ch, (s) => (sw && areas.areaAt(s).blend ? LOOK[s < sw.s ? sw.from : sw.to].road : roadAt(areas, s)), sw?.s);
  yield;
  for (const ob of ch.obstacles) { out.far = Math.max(out.far, drawObstacle(c, ob, ch.index, first)); yield; }
  const keep = nearKeep(opts.yawDeg);
  for (const d of ch.decor) {
    setArea(c, areas.areaAt(d.s).area);
    const mark = keep && d.x > 0 && DECOR_ZONE(d.kind) !== 'overhead' && DECOR_ZONE(d.kind) !== 'ground' ? counts(w) : null;
    drawDecor(c, d);
    if (mark) settleNear(w, mark, keep!);
    const a = ambientOf(d);
    if (a) out.ambient.push(a);
    out.far = Math.max(out.far, d.s + (d.params?.d ?? d.params?.len ?? 4));
    yield;
  }
  return out;
}

// ── landscape: only the camera-side decor that would cover the corridor hides ──────────────────────────────────
/** Camera-side (+x) decor hides in landscape (fx `near`, uHideNear) only where it would cover the corridor on screen:
 *  a vertex at (x, y) hides the ground at x − y·sin ψ·cot θ (ψ the landscape yaw, θ the pitch); the decor keeps
 *  drawing when none of its vertices reaches past NEAR.limit (low planters, bins, posts and benches on the verge). */
export const NEAR = { limit: CORRIDOR_HALF - 0.4 } as const;
function nearKeep(yawDeg: number): { k: number } | null {
  if (yawDeg <= 0) return null;
  const yaw = (yawDeg * Math.PI) / 180, th = (camVariant().pitchDeg * Math.PI) / 180;
  return { k: (Math.sin(yaw) * Math.cos(th)) / Math.sin(th) };
}
type Counts = Record<keyof KitTargets, number>;
const TGT: readonly (keyof KitTargets)[] = ['o', 'x', 'e', 'g', 'b'];
function counts(w: KitTargets): Counts { return { o: w.o.count, x: w.x.count, e: w.e.count, g: w.g.count, b: w.b.count }; }
/** Clears the `near` bit on what one decor record just drew when none of it would cover the corridor. */
function settleNear(w: KitTargets, from: Counts, keep: { k: number }): void {
  let covers = false;
  for (const t of TGT) {
    const g = w[t].geo, pos = g?.pos;
    if (!pos) continue;
    for (let i = from[t]; i < w[t].count && !covers; i++) if (pos[i * 3]! - Math.max(0, pos[i * 3 + 1]!) * keep.k < NEAR.limit) covers = true;
    if (covers) return;
  }
  for (const t of TGT) {
    const g = w[t].geo, fx = g?.fx;
    if (!fx) continue;
    const ch = t === 'g' ? 3 : 2;           // glow cards keep their flag bits in fx.w
    for (let i = from[t]; i < w[t].count; i++) { const f = fx[i * 4 + ch]!; if (Math.round(f) & FX.near) fx[i * 4 + ch] = f - FX.near; }
  }
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

/** Where a gateway blend switches the road and the hazard looks (DESIGN §18.4: ink hazards on the light road, the
 *  inverted Neon look on the wet one): the s where the blend weight crosses 0.5, moved off every obstacle of the chunk
 *  (its footprint ± LOOK_SWITCH.margin, the gate's ground ring), toward the side its centre is on, so no hazard
 *  straddles two looks. null when no blend crosses its middle within LOOK_SWITCH.reach of the chunk. */
export const LOOK_SWITCH = { reach: 16, margin: 0.9, maxMove: 24 } as const;
export function lookSwitch(ch: Chunk, areas: AreaSource): { s: number; from: AreaId; to: AreaId } | null {
  const w = (s: number) => { const b = areas.areaAt(s).blend; return b && b.from !== b.to ? blendWeight(b) - 0.5 : NaN; };
  let a = ch.s0 - LOOK_SWITCH.reach, wa = w(a), found = NaN;
  for (let s = a + 1; s <= ch.s0 + ch.len + LOOK_SWITCH.reach; s += 1) {
    const ws = w(s);
    if (wa < 0 && ws >= 0) { let lo = s - 1, hi = s; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (w(m) < 0) lo = m; else hi = m; } found = hi; break; }
    a = s; wa = ws;
  }
  if (!Number.isFinite(found)) return null;
  const b = areas.areaAt(found).blend!;
  let s = found;
  // Only obstacles with solids carry a hazard look (sidewalks and curbs run the whole chunk). An obstacle of the
  // `from` area keeps its own look (the switch comes after it), one of the `to` area likewise (the switch comes
  // before it); any other is kept off the switch on the side of its centre.
  const obs = ch.obstacles.filter((o) => o.solids.length > 0);
  const m = LOOK_SWITCH.margin;
  let lo = -Infinity, hi = Infinity;
  for (const o of obs) {
    if (!isHazard(o)) continue;
    if (o.area === b.from && o.area !== b.to) lo = Math.max(lo, o.s + o.len + m);
    else if (o.area === b.to) hi = Math.min(hi, o.s - m);
  }
  if (lo > hi) lo = -Infinity;            // the arriving area's hazards win a conflict
  s = Math.min(hi, Math.max(lo, s));
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (const o of obs) {
      const o0 = o.s - m, o1 = o.s + o.len + m;
      if (s <= o0 + 1e-6 || s >= o1 - 1e-6) continue;
      const next = o.s + o.len / 2 < found ? o1 : o0;
      s = next > hi ? o0 : next < lo ? o1 : next;
      moved = true;
    }
    if (!moved) break;
  }
  if (Math.abs(s - found) > LOOK_SWITCH.maxMove) s = found;
  return { s, from: b.from, to: b.to };
}

/** An obstacle with a crash solid that is not a thin grindable (rails, beams, lips are read by their grind edges). */
function isHazard(o: Chunk['obstacles'][number]): boolean {
  return o.solids.some((so) => so.top === 'crash' && (Math.min(so.box.x1 - so.box.x0, so.box.s1 - so.box.s0) > 0.35 || o.edges.length === 0));
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
