// core/world.ts (TECH §4.3). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
import type { V3, AABB } from './math';
import type { AreaId, GatewayId, Surface, EdgeKind, EdgeMaterial, PropKind, HintId } from './ids';

/** A crash/collision volume. Crash faces are `box` inset by FACE_INSET (the sim applies the inset; it is not stored).
 *  Every raised GroundSlab more than STEP_UP above its neighbours also emits a 'landable' Solid (its body). */
export interface Solid {
  box: AABB;
  top: 'landable' | 'crash' | 'knock';   // T → landable, K → knock, else crash (DESIGN §10.3). 'crash' tops never skim.
  tall: boolean;                          // top − local ground ≥ HEIGHT.tallMin (x-ray cap, A1 column rule)
}
/** A rideable surface. Flat when y0 === y1; stairs and inclines slope linearly along s. */
export interface GroundSlab {
  s0: number; s1: number; x0: number; x1: number;
  y0: number; y1: number;                 // surface height at s0 / s1
  layer: 0 | 1;                           // 0 = datum surface (street, terraces, stairs), 1 = optional deck
  surface: Surface;
  kind: 'flat' | 'stairs' | 'incline';
  steps?: number;
}
/** Pit level = lipY (DESIGN §7): fall when the board centre is over it and boardBottom ≤ lipY + PIT_FALL_EPS.
 *  `depth` is visual only. */
export interface Pit { s0: number; s1: number; x0: number; x1: number; lipY: number; depth: number; cause: 'fall' | 'splash' }
export interface GrindEdge {
  id: number; obstacleId: number;
  a: V3; b: V3;                           // a.s < b.s, |dx/ds| ≤ 0.3, may slope (stair rails, hubbas); never crosses a segment
  kind: EdgeKind; material: EdgeMaterial;
  layer: 0 | 1;
  pickOnly: boolean;                      // curb-class (≤ STEP_UP above local ground): capture only with a pick swipe; no magnet, no align
}
/** Phase-locked mover: lateral offset is a pure function of the PLAYER's s (DESIGN §10.9). */
export interface MoverDef { axis: 'x'; dxTotal: number; sStart: number; sEnd: number; telegraphS: number }

export const ObTag = {
  FullWidth: 1, TrickLine: 2, SafeLine: 4, Required: 8, Knockable: 16, Grindable: 32, Elevated: 64, Filler: 128, Mover: 256,
} as const;

export interface Obstacle {
  id: number; kind: PropKind; area: AreaId; segment: number;
  s: number; x: number;                   // anchor: front-centre at local ground
  len: number; wid: number; hgt: number;
  rotY: 0 | 1 | 2 | 3;                    // visual only; collision geometry below is already in track space
  mirror: boolean; variant: number;
  solids: Solid[]; slabs: GroundSlab[]; pits: Pit[]; edges: GrindEdge[];
  tags: number;                           // ObTag bit set
  mover?: MoverDef;
  gap?: { name: string; pts: number; fromObstacle?: number };
  landmark?: string;
  warnAtS?: number;                       // full-width hazards: s where the 1.6 s warning fires
  params?: Record<string, number>;        // builder parameters the kit needs (steps, machines, slot x, …)
  hint?: HintId;                          // Lesson Line: the hint this obstacle teaches
}
export interface Coin { id: number; p: V3; value: 1 | 10; line: 'trick' | 'safe' | 'breather' }
export interface Decor {
  kind: string;                           // renderer-owned vocabulary (WA), e.g. 'building', 'lantern_string'
  s: number; x: number; y: number; rotY: number; scale: number; variant: number; castShadow: boolean;
  params?: Record<string, number>;
}
export interface SafeKey { t: number; s: number; x: number; action?: 'ollie' }
export interface Segment {
  index: number; templateId: string; area: AreaId; tier: 0 | 1 | 2 | 3 | 4;
  t0: number; t1: number; s0: number; s1: number;
  mirror: boolean; rerolls: number; fallback: boolean; gateway?: GatewayId;
}
export interface AreaBlend { from: AreaId; to: AreaId; u: number }    // u ∈ [0,1] across the 8 s palette window
export interface Chunk {
  index: number; s0: number; len: number;        // len = CHUNK_LEN
  area: AreaId; blend: AreaBlend | null;         // evaluated at chunk centre (renderer re-evaluates per frame)
  obstacles: Obstacle[];                          // every obstacle overlapping [s0, s0+len)
  coins: Coin[]; decor: Decor[]; safe: SafeKey[]; segments: number[];
}
export interface GenStats {
  segments: number; rerolls: number; fallbacks: number; rejections: Record<string, number>;
  trickCoinShare: number; msPerSegment: number;
}
/** startT: no Roll-out, s0 = sAt(startT), phase and A1–A3 clocks start at startT (DESIGN §10.1).
 *  startArea: rotates the area timeline (Start District, M5 stretch); default 'downtown'. */
export interface WorldGenConfig { seed: number; mode: 'lesson' | 'normal'; startT?: number; startArea?: AreaId }
export interface WorldGen {
  readonly seed: number; readonly mode: 'lesson' | 'normal';
  /** Generate segments until coverage ≥ sAhead, or stop after maxSegments (the caller budgets time; world/gen
   *  may not read clocks). Returns true when coverage ≥ sAhead. */
  ensure(sAhead: number, maxSegments?: number): boolean;
  chunk(i: number): Chunk;                        // memoized; generates on demand, strictly in order
  release(beforeIndex: number): void;             // drop chunks/segments behind the player
  segments(): readonly Segment[];
  areaAt(s: number): { area: AreaId; blend: AreaBlend | null; gateway: GatewayId | null; first: boolean };
  stats(): GenStats;
}
export interface GroundHit {
  y: number; layer: 0 | 1; surface: Surface; slab: GroundSlab | null; pit: Pit | null;
}
export interface WorldQuery {
  obstacles(s0: number, s1: number): readonly Obstacle[];       // de-duplicated, sorted by s
  groundAt(s: number, x: number, yMax: number): GroundHit;      // highest slab top ≤ yMax under (s,x); if none, pit with y = pit.lipY
  edgesNear(s0: number, s1: number, x: number, range: number): readonly GrindEdge[];
  coins(s0: number, s1: number): readonly Coin[];
  moverOffset(ob: Obstacle, playerS: number): number;           // lateral offset to add to the obstacle's geometry
  edge(id: number): GrindEdge | undefined;
  obstacle(id: number): Obstacle | undefined;
}
