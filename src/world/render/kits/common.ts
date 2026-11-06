// world/render/kits/common.ts: what every kit draws with (KitCtx), plus the shared readability pieces: grind edges
// (cream top stripe over a wider ink underline, DESIGN §18.4), safety chevrons, contact shadows, ground slabs by
// surface and pits that read as holes (lit lip, visible far wall, darker floor).
// Kits draw in TRACK space: the brush frame is the track origin (x, y, s), the Kit maps to chunk-local axes.
import type { AreaId, Surface } from '../../../core/ids';
import { lerp } from '../../../core/math';
import { hash32 } from '../../../core/rng';
import type { GrindEdge, GroundSlab, Obstacle, Pit } from '../../../core/world';
import { ObTag } from '../../../core/world';
import { COLORS, HAZARD, NEON_SURFACE, SURFACE_COLOR, shade, type HazardLook } from '../palette';
import { PAT, type PatternId } from '../textures/ground';
import { DECAL, type DecalId } from '../textures/decals';
import { FACE, FX, type Kit } from '../writer';

/** Edge stripe widths (m): cream half-width ≥ CAMERA.minEdgePx / 2 on screen at the widest framing, ink pad beside. */
/** Per-viewport build settings: grind-edge stripe half-width and ink pad (m, from CAMERA.minEdgePx at the framing
 *  scale) and the run camera yaw (deg, yawForAspect), which sets where a hazard's screen hull falls on the ground. */
export interface BuildOptions { edgeHalfW: number; inkPad: number; yawDeg: number }
export const DEFAULT_BUILD: Readonly<BuildOptions> = { edgeHalfW: 0.035, inkPad: 0.02, yawDeg: 0 };

/** One decal instance (the global instanced decal layer, decals.ts). Track space; rot about +y (rad). */
export interface DecalRec {
  id: DecalId; x: number; y: number; s: number; w: number; len: number; rot: number; color: number; alpha: number; kind: 0 | 1 | 2;
  /** A parallelogram instead of the w × len rectangle: its edge vectors (e1x, e1s, e2x, e2s), centred on (x, s);
   *  texture u runs along e1, v along e2. */
  e?: readonly [number, number, number, number];
}
/** One lantern sphere (the global instanced lantern layer). */
export interface LanternRec { x: number; y: number; s: number; r: number; color: number; phase: number; glow: number }

export interface KitCtx {
  readonly K: Kit;
  area: AreaId;
  hz: HazardLook;
  /** Chunk s-range [s0, s1). */
  s0: number; s1: number;
  opts: BuildOptions;
  /** Glow cards still allowed in this chunk (TECH §8.4: ≤ 40, 20 on low). */
  glowLeft: number;
  /** Area at a track s (gateway blends switch kits along the street). */
  areaAt(s: number): AreaId;
  /** The area whose palette dominates at s (the `to` preset past the middle of a gateway blend): hazards take their
   *  look from it, so an ink hazard never meets the blue-hour light and an inverted one never meets the golden. */
  lookAt(s: number): AreaId;
  /** Top of the flat ground slabs (sidewalks, plazas) at (s, x) in this chunk, else the street datum 0. */
  groundAt(s: number, x: number): number;
  /** Surface of the highest flat slab at (s, x) (null: the implicit road). */
  surfaceAt(s: number, x: number): Surface | null;
  decal(d: DecalRec): void;
  lantern(l: LanternRec): void;
}

/** Deterministic per-object random in [0, 1) from integers. */
export const rnd = (...k: number[]) => (hash32(...k.map((v) => Math.round(v * 100))) >>> 0) / 4294967296;

export const isFull = (ob: Obstacle) => (ob.tags & ObTag.FullWidth) !== 0;
/** Is the ground at (s, x) a light surface (sidewalk, apron, plaza) rather than the dark road? */
export const lightGroundAt = (c: KitCtx, s: number, x: number) => {
  const sf = c.surfaceAt(s, x);
  return sf !== null && sf !== 'asphalt' && sf !== 'wetAsphalt' && sf !== 'grass' && c.lookAt(s) !== 'neon';
};
export function setArea(c: KitCtx, area: AreaId): void { c.area = area; c.hz = HAZARD[area]; }

/** Surface colour and ground pattern for a slab surface in an area. */
export function surfaceLook(surface: Surface, area: AreaId): { color: number; pat: PatternId } {
  const neon = area === 'neon';
  const color = (neon ? NEON_SURFACE[surface] : undefined) ?? SURFACE_COLOR[surface] ?? COLORS.asphalt;
  const pat: PatternId = surface === 'asphalt' ? (neon ? PAT.wet : PAT.asphalt) : surface === 'wetAsphalt' ? PAT.wet
    : surface === 'concrete' ? (area === 'docks' ? PAT.apron : PAT.slabs) : surface === 'tile' ? PAT.tile
      : surface === 'granite' ? PAT.pavers : surface === 'wood' ? PAT.planks : surface === 'metal' ? PAT.plate : PAT.grass;
  return { color, pat };
}

// ── grind edges ─────────────────────────────────────────────────────────────────────────────────────────────────
/** Cream top stripe over a wider ink underline, following the edge's slope and lateral drift (noFog: the haze never
 *  touches it). Drawn in every chunk the edge overlaps, clipped to the chunk. */
export function grindEdge(c: KitCtx, e: GrindEdge): void {
  const K = c.K;
  if (e.b.s <= c.s0 || e.a.s >= c.s1) return;
  const hw = c.opts.edgeHalfW, ink = hw + c.opts.inkPad;
  K.reset(); K.clip0 = c.s0; K.clip1 = c.s1;
  K.lit(0, 0, FX.noFog);
  K.col(COLORS.ink).beam(e.a.x, e.a.y, e.a.s, e.b.x, e.b.y, e.b.s, ink, -0.05, 0.006);
  K.col(COLORS.edgeCream).lit(0, 0, FX.noFog, 0.2).beam(e.a.x, e.a.y, e.a.s - 0.004, e.b.x, e.b.y, e.b.s + 0.004, hw, -0.02, 0.014);
  K.reset();
}
export function edgesOf(c: KitCtx, ob: Obstacle): void { for (const e of ob.edges) grindEdge(c, e); }

// ── chevrons, contact shadows ───────────────────────────────────────────────────────────────────────────────────
/** Safety chevrons (amber / ink, DESIGN §18.4) on a camera-facing face at s (front plane), x0..x1, y0..y1: diagonal
 *  amber parallelograms over the ink face. `duty` = amber share of the band. flag 16: flashes with the hazard warning. */
export function chevrons(c: KitCtx, x0: number, x1: number, y0: number, y1: number, s: number, pitch = 0.5, duty = 0.4): void {
  const K = c.K, h = y1 - y0, slant = h * 0.6, w = pitch * duty;
  K.col(COLORS.chevron).lit(0, 0, FX.noFog | FX.matte | WARN, 0);
  for (let x = x0 - slant; x < x1; x += pitch) {
    // Clip each parallelogram to [x0, x1].
    const a0 = Math.max(x0, x), a1 = Math.min(x1, x + w), b0 = Math.max(x0, x + slant), b1 = Math.min(x1, x + slant + w);
    if (a1 - a0 < 0.005 && b1 - b0 < 0.005) continue;
    K.quad(Math.min(a0, a1), y0, s - 0.004, Math.max(a0, a1), y0, s - 0.004, Math.max(b0, b1), y1, s - 0.004, Math.min(b0, b1), y1, s - 0.004);
  }
}
/** fx flag: flashes with the 1.6 s full-width hazard warning (DESIGN §9). */
export const WARN = 16;

/** Soft contact shadow under a footprint (DESIGN: contact shadows under every obstacle). `grow` reaches past the
 *  footprint behind it (+s), where the obstacle's own screen hull covers the ground. */
export function contact(c: KitCtx, x0: number, x1: number, s0: number, s1: number, y: number, alpha = 0.55, grow = 0): void {
  // Kept inside the footprint laterally and in front (the gate's ring around a hazard stays clean ground); it may
  // reach behind the obstacle (+s), which its own screen hull covers.
  if (alpha <= 0) return;
  const len = s1 - s0 + grow;
  c.decal({ id: DECAL.contact, x: (x0 + x1) / 2, y, s: s0 + len / 2, w: (x1 - x0) * 1.04, len, rot: 0, color: COLORS.ink, alpha, kind: 0 });
}

/** The dark pool a low, see-through full-width hazard sits in (the parking chain, the hedge strip): its shadow on
 *  the ground it stands on, laid over the ground inside the hazard's screen hull (from its front face to h·cot 35°
 *  behind its back) so the hazard reads as one dark silhouette across the street (DESIGN §18.4 gate). Split by the
 *  ground under it (road / sidewalk bands). */
export function hazardPool(c: KitCtx, x0: number, x1: number, s0: number, s1: number, h: number, alpha = 0.95): void {
  // The hull's ground: the footprint swept along the camera's screen-up direction on the ground, (−sin yaw, cos yaw)
  // (camera.ts screenX), by h·cot(pitch) (trimmed 8% so the pool never shows above the hull top).
  const reach = h * 1.43 * 0.92, yaw = (c.opts.yawDeg * Math.PI) / 180;
  const vx = -Math.sin(yaw) * reach, vs = Math.cos(yaw) * reach;
  const cuts = [x0];
  for (const b of [-4.5, -3, -2.6, 2.6, 3, 4.5]) if (b > x0 + 0.05 && b < x1 - 0.05) cuts.push(b);
  cuts.push(x1);
  const put = (x: number, s: number, w: number, len: number, e?: readonly [number, number, number, number]) => {
    const y = c.groundAt(s, x) + 0.012;
    c.decal({ id: DECAL.pool, x, y, s, w, len, rot: 0, color: 0x1a1428, alpha, kind: 0, ...(e ? { e } : {}) });
  };
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i]!, b = cuts[i + 1]!;
    if (Math.abs(vx) < 0.02) {
      // Portrait (yaw 0): one rectangle from the front edge to the swept back edge.
      const back = s1 + vs, sm = (s0 + back) / 2;
      const y = c.groundAt(Math.min(sm, s0 + 0.1), (a + b) / 2) + 0.012;
      c.decal({ id: DECAL.pool, x: (a + b) / 2, y, s: (s0 - 0.04 + back) / 2, w: b - a + 0.01, len: back - s0 + 0.04, rot: 0, color: 0x1a1428, alpha, kind: 0 });
      continue;
    }
    // Yawed: hull(R ∪ R+v) = R ∪ (R+v) ∪ the sweep of R's diagonal across v (front corner on the far side of the
    // lean → back corner on the near side).
    const W = b - a, L = s1 - s0;
    put((a + b) / 2, (s0 + s1) / 2, W + 0.01, L + 0.04);
    put((a + b) / 2 + vx, (s0 + s1) / 2 + vs, W + 0.01, L + 0.04);
    const fx = vx < 0 ? a : b, d1x = vx < 0 ? W : -W;           // the diagonal from the front corner opposite the lean
    put(fx + d1x / 2 + vx / 2, s0 + L / 2 + vs / 2, 1, 1, [d1x, L, vx, vs]);
  }
}

/** Ground under an obstacle footprint (road 0 or sidewalk 0.15 in M0; the lowest solid bottom otherwise). */
export function groundOf(ob: Obstacle): number {
  let g = Infinity;
  for (const so of ob.solids) g = Math.min(g, so.box.y0);
  for (const sl of ob.slabs) g = Math.min(g, sl.y0, sl.y1);
  return Number.isFinite(g) ? g : 0;
}

// ── slabs and pits ─────────────────────────────────────────────────────────────────────────────────────────────
/** A ground slab by surface (stairs as steps with lighter nosings, inclines as wedges), clipped to the chunk. */
export function slab(c: KitCtx, sl: GroundSlab, lift = 0, colorOverride?: number): void {
  const K = c.K;
  if (sl.s1 <= c.s0 || sl.s0 >= c.s1) return;
  const look = surfaceLook(sl.surface, c.lookAt((sl.s0 + sl.s1) / 2));
  const col = colorOverride ?? look.color;
  K.reset(); K.clip0 = c.s0; K.clip1 = c.s1;
  K.lit(look.pat).col(col);
  const bottom = Math.min(sl.y0, sl.y1, 0) - 0.3;
  if (sl.kind === 'stairs' && sl.steps && sl.steps > 1) {
    const n = sl.steps, len = (sl.s1 - sl.s0) / n, down = sl.y1 < sl.y0;
    for (let i = 0; i < n; i++) {
      const a = sl.s0 + i * len;
      const y = lerp(sl.y0, sl.y1, down ? (i + 1) / n : i / n) + lift;
      const yPrev = lerp(sl.y0, sl.y1, down ? i / n : (i + 1) / n);
      void yPrev;
      K.lit(look.pat).col(col).box(sl.x0, bottom, a, sl.x1, y, a + len);
      // Nosing: a lighter strip at the step edge the rider sees (the camera-facing riser top on an upward flight,
      // the far edge of each tread on a downward one).
      const ns = down ? a + len - 0.05 : a;
      K.lit(0).col(shade(col, 0.22)).box(sl.x0, y, ns, sl.x1, y + 0.008, ns + 0.05, FACE.top);
    }
    K.reset();
    return;
  }
  K.wedge(sl.x0, sl.x1, sl.s0, sl.s1, bottom, sl.y0 + lift, sl.y1 + lift);
  K.reset();
}

/** A pit that reads as a hole (G0 review): darker floor at lipY − depth, a lit far wall facing the camera, dark side
 *  walls, a light lip along the near and far edges, and amber / ink chevrons along the near lip on the road (the
 *  full-width warning). `water` pits (fountains) get a water surface instead. The street base is cut around pits. */
export function pit(c: KitCtx, p: Pit, ob: Obstacle): void {
  const K = c.K;
  if (p.s1 <= c.s0 || p.s0 >= c.s1) return;
  K.reset(); K.clip0 = c.s0; K.clip1 = c.s1;
  const d = Math.max(0.2, p.depth), floor = p.lipY - d, area = c.areaAt(p.s0);
  if (p.cause === 'splash') {
    K.lit(0, 0, FX.noFog).col(COLORS.water).box(p.x0, floor, p.s0, p.x1, p.lipY - 0.12, p.s1, FACE.top);
    K.col(shade(COLORS.water, -0.3)).box(p.x0, floor, p.s1 - 0.02, p.x1, p.lipY, p.s1, FACE.front);
    K.reset();
    return;
  }
  const wall = area === 'docks' ? 0x5a5470 : area === 'neon' ? 0x4b4278 : COLORS.pitWall;
  K.lit(0, 0, FX.noFog);
  K.col(COLORS.pitFloor).box(p.x0, floor - 0.05, p.s0, p.x1, floor, p.s1, FACE.top);
  // Floor shadow under the near lip (the part of the floor the near wall shades).
  K.col(COLORS.pitShadow).box(p.x0, floor, p.s0, p.x1, floor + 0.004, p.s0 + Math.min(0.5, (p.s1 - p.s0) * 0.3), FACE.top);
  // Far wall (camera-facing, catches the light) with a darker band at its foot; side walls.
  K.col(wall).box(p.x0, floor, p.s1 - 0.02, p.x1, p.lipY, p.s1, FACE.front);
  K.col(shade(wall, -0.35)).box(p.x0, floor, p.s1 - 0.024, p.x1, floor + d * 0.3, p.s1 - 0.02, FACE.front);
  K.col(shade(wall, -0.25)).box(p.x0, floor, p.s0, p.x0 + 0.02, p.lipY, p.s1, FACE.right);
  K.col(shade(wall, -0.25)).box(p.x1 - 0.02, floor, p.s0, p.x1, p.lipY, p.s1, FACE.left);
  // Lit lips: the near lip's top edge and the far lip (both read as edges of a hole, not paint).
  K.col(COLORS.pitLip).box(p.x0, p.lipY - 0.04, p.s0 - 0.06, p.x1, p.lipY + 0.006, p.s0, FACE.top | FACE.back);
  K.col(COLORS.pitLip).box(p.x0, p.lipY - 0.04, p.s1, p.x1, p.lipY + 0.006, p.s1 + 0.06, FACE.top | FACE.front);
  // Full-width warning chevrons on the road along the near lip.
  if (isFull(ob) && p.x1 - p.x0 > 2) {
    const s = p.s0 - 0.38;
    K.lit(0, 0, FX.noFog).col(COLORS.ink).box(p.x0, p.lipY - 0.05, s, p.x1, p.lipY + 0.004, p.s0 - 0.06, FACE.top);
    K.col(COLORS.chevron).lit(0, 0, FX.noFog | WARN);
    for (let x = p.x0 + 0.1; x < p.x1 - 0.32; x += 0.7) {
      K.quad(x, p.lipY + 0.006, s + 0.04, x + 0.3, p.lipY + 0.006, s + 0.04, x + 0.48, p.lipY + 0.006, p.s0 - 0.1, x + 0.18, p.lipY + 0.006, p.s0 - 0.1);
    }
  }
  K.reset();
}

/** Grey-box fallback for kinds without a kit (and the forbidden-band warning colour): solids by height class. */
export function solidsFallback(c: KitCtx, ob: Obstacle): void {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box, h = b.y1 - b.y0;
    if (b.s0 >= c.s1 || b.s1 <= c.s0) continue;
    K.reset();
    const hazard = so.top === 'crash';
    const col = so.top === 'knock' ? COLORS.knock : h > 0.6 && h < 1.15 ? COLORS.forbidden : hazard ? c.hz.body : COLORS.lowLandable;
    K.lit(0, 0, hazard ? FX.noFog | FX.matte : 0).col(col);
    if (so.tall) K.capY = b.y0 + 1.6;
    K.chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.03, hazard ? c.hz.top : shade(col, 0.15));
  }
  K.reset();
}

/** Draws the obstacle's slabs (those not covered by a body) and pits. */
export function groundOfObstacle(c: KitCtx, ob: Obstacle, skipFlatUnderSolids = true): void {
  for (const p of ob.pits) pit(c, p, ob);
  for (const sl of ob.slabs) {
    if (skipFlatUnderSolids && ob.solids.length && sl.kind === 'flat' && ob.solids.some((so) => so.box.y1 >= sl.y0 - 1e-3 && so.box.x0 <= sl.x0 + 1e-3 && so.box.x1 >= sl.x1 - 1e-3)) continue;
    const overPit = ob.pits.some((p) => sl.s0 < p.s1 && sl.s1 > p.s0 && sl.x0 < p.x1 && sl.x1 > p.x0);
    slab(c, sl, overPit ? 0.004 : 0);
  }
}
