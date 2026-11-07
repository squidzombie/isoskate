// world/render/kits/common.ts: what every kit draws with (KitCtx), plus the shared readability pieces: grind edges
// (cream top stripe over a wider ink underline, DESIGN §18.4), safety chevrons, contact shadows, ground slabs by
// surface and pits that read as holes (lit lip, visible far wall, darker floor).
// Kits draw in TRACK space: the brush frame is the track origin (x, y, s), the Kit maps to chunk-local axes.
import { CAMERA } from '../../../core/tuning';
import type { AreaId, Surface } from '../../../core/ids';
import { lerp } from '../../../core/math';
import { hash32 } from '../../../core/rng';
import type { GrindEdge, GroundSlab, Obstacle, Pit } from '../../../core/world';
import { ObTag } from '../../../core/world';
import { COLORS, HAZARD, NEON_SURFACE, PAD_TOP, SURFACE_COLOR, shade, type HazardLook } from '../palette';
import { PAT, type PatternId } from '../textures/ground';
import { DECAL, type DecalId } from '../textures/decals';
import { RENDER } from '../render.config';
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
  /** Contact shadows drawn so far (the dispatcher adds default ones under solids a kit left without). */
  contacts: number;
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
 *  touches it). Drawn in every chunk the edge overlaps, clipped to the chunk. Both are `stripe`s: under the
 *  perspective run camera the lit material widens them per view depth to a constant on-screen width (the cream
 *  CAMERA.minEdgePx × EDGE_WIDEN.px, the ink VIEW.inkPadPx beside it; camera.ts edgeWidening), so near edges do not
 *  grow fat and far ones never drop under the floor. The ink band reaches 0.06 m down the faces, so the cream lip
 *  borders ink on every side the camera sees (DESIGN §18.4 "the pair reads" from any angle). */
/** The cream lip's palette-tinted emissive add (DESIGN §18.4), under the grind signature's fixed sheen and glint (fx
 *  flag `grind`, RENDER.grind). @cam raised it 0.2 → 0.45 without the sheen: the perspective camera often sees the
 *  ink underline run into a cast shadow on the road, so the cream alone must clear 1.8:1 against a sunlit road or
 *  kerb; with the sheen on top 0.2 (the G1 tune value) keeps the coping cream rather than white (G1b merge). */
export const EDGE_CREAM_EMIS = 0.2;
export function grindEdge(c: KitCtx, e: GrindEdge): void {
  const K = c.K;
  if (e.b.s <= c.s0 || e.a.s >= c.s1) return;
  // (G1 grind signature: the coping is RENDER.grind.halfW × the minimum on-screen stripe, the same in every area:
  // view.ts buildOptionsFor scales an ortho build, camera.ts edgeWidening the perspective widening)
  const hw = c.opts.edgeHalfW, ink = hw + c.opts.inkPad;
  K.reset(); K.clip0 = c.s0; K.clip1 = c.s1;
  K.lit(0, 0, FX.noFog);
  // The ink top sits above any top face that meets the edge (a curb stone band at +0.008, a bench or ledge top), so
  // its pad shows on both sides of the cream lip (and on a sidewalk or deck surface the edge borders, G1).
  K.col(COLORS.ink).stripe(e.a.x, e.a.y, e.a.s, e.b.x, e.b.y, e.b.s, ink, -0.07, 0.011, 2);
  K.col(COLORS.edgeCream).lit(0, 0, FX.noFog | FX.grind, EDGE_CREAM_EMIS).stripe(e.a.x, e.a.y, e.a.s - 0.004, e.b.x, e.b.y, e.b.s + 0.004, hw, -0.012, 0.017, 1);
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

/** Soft contact shadow under a footprint (DESIGN §18.4: contact shadows under every obstacle): the footprint grown by
 *  CONTACT_PAD (less in front, where the sun-from-behind casts nothing), soft edges, α ≤ CONTACT_PAD.alphaMax. `grow`
 *  reaches further behind (+s), where a tall prop's cast shadow starts. Counted in `c.contacts`. */
export function contact(c: KitCtx, x0: number, x1: number, s0: number, s1: number, y: number, alpha: number = CONTACT_PAD.alpha, grow = 0): void {
  c.contacts++;
  const a = Math.min(alpha, CONTACT_PAD.alphaMax);
  if (a <= 0) return;
  const p = CONTACT_PAD, f0 = s0 - p.front, f1 = s1 + p.back + grow;
  c.decal({ id: DECAL.contact, x: (x0 + x1) / 2, y, s: (f0 + f1) / 2, w: x1 - x0 + 2 * p.side, len: f1 - f0, rot: 0, color: COLORS.ink, alpha: a, kind: 0 });
}
/** Contact-shadow growth around a footprint (m) and its opacity (reviewed at G1: a believable shadow, never a pool). */
export const CONTACT_PAD = { side: 0.12, front: 0.05, back: 0.15, alpha: 0.5, alphaMax: 0.5 } as const;

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
  // (G1: an elevated tiled deck, the skywalk or the Harbor Bridge, is a mid-value plate under the golden / sunset light:
  // the light plaza tile there read as a blown-out light bar beside the hazards and the grind edges)
  const deck = sl.layer === 1 && sl.surface === 'tile' && c.lookAt((sl.s0 + sl.s1) / 2) !== 'neon';
  const col = colorOverride ?? (deck ? COLORS.deckTile : look.color);
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
  if (isFull(ob) && p.x1 - p.x0 > 2) groundChevrons(c, p.x0, p.x1, p.s0 - 0.38, p.s0 - 0.06, p.lipY);
  K.reset();
}

/** A warning band on the ground across x0..x1 between sA and sB (sA < sB), at ground height y (or the ground under
 *  each part when y is omitted): an ink band with slanted amber chevrons (DESIGN §18.4 full-width hazards), noFog,
 *  flashing with the hazard warning. */
export function groundChevrons(c: KitCtx, x0: number, x1: number, sA: number, sB: number, y?: number): void {
  const K = c.K, t = K.t;
  const cuts = [x0];
  for (const b of [-4.5, -3, 3, 4.5]) if (b > x0 + 0.05 && b < x1 - 0.05) cuts.push(b);
  cuts.push(x1);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i]!, b = cuts[i + 1]!, g = (y ?? c.groundAt((sA + sB) / 2, (a + b) / 2)) + 0.004;
    K.to('o').lit(0, 0, FX.noFog | FX.matte).col(COLORS.ink).box(a, g - 0.05, sA, b, g, sB, FACE.top);
    K.col(COLORS.chevron).lit(0, 0, FX.noFog | WARN);
    const d = sB - sA, slant = d * 0.45;
    for (let x = a + 0.08; x + 0.28 + slant < b - 0.02; x += 0.6) {
      K.quad(x, g + 0.002, sA + 0.04, x + 0.28, g + 0.002, sA + 0.04, x + 0.28 + slant, g + 0.002, sB - 0.04, x + slant, g + 0.002, sB - 0.04);
    }
  }
  K.to(t);
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
    if (so.tall) K.capY = b.y0 + CAMERA.xrayCapY;
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
    slab(c, sl, overPit ? 0.004 : 0, ob.kind === 'manual_pad' ? PAD_TOP[c.lookAt((sl.s0 + sl.s1) / 2)] : undefined);
  }
}
