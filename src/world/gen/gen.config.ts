// world/gen/gen.config.ts: every generator tunable (DESIGN §10, §11, §22). Fairness floors (R_MIN, height bands,
// look-ahead, the validator's reach and margins) live in core/tuning.ts; this file holds the difficulty curve, the
// anti-straight periods, template weights and placement rates. WG owns it.
// Density figures are targets for measured outputs (DESIGN §11: ±25 %); the floors are hard rules.
import type { AreaId } from '../../core/ids';

export type PhaseId = 'opening' | 'warm' | 'build' | 'plateau';
export type Tier = 0 | 1 | 2 | 3 | 4;

/** Difficulty phases by run time (DESIGN §11). */
export const PHASES: readonly { id: PhaseId; t0: number }[] = [
  { id: 'opening', t0: 0 }, { id: 'warm', t0: 45 }, { id: 'build', t0: 90 }, { id: 'plateau', t0: 150 },
];

export const GEN = {
  /** Tier weights per phase (DESIGN §11). The opening is T1 only (A2 wander gates are scheduled on top). */
  tierWeights: {
    opening: [[1, 1]], warm: [[1, 60], [2, 40]], build: [[1, 25], [2, 50], [3, 25]],
    plateau: [[1, 15], [2, 40], [3, 35], [4, 10]],
  } as Record<PhaseId, readonly (readonly [Tier, number])[]>,
  /** Template weights inside a drawn tier (area templates and the shared ones; DESIGN §10.4 v1 set). A template is
   *  only drawn in its own area (shared ones anywhere) and at its tiers. */
  weights: {
    S_CONES: 1.0, S_TRENCH: 0, S_BARRIER: 0, S_LADDER: 1.2, S_GATE: 0.6, S_PADS: 1.0, S_STAIRS: 0.8,
    DT_LEDGE: 3, DT_BENCHES: 2.5, DT_PLANTERS: 2.5, DT_TERRACE: 1.5, DT_RUSH: 2.5, DT_BIG7: 1.2,
    SB_WALL: 3, SB_HILL: 0, SB_DRIVEWAYS: 2.5, SB_BINDAY: 2.5, SB_PICKET: 2.5, SB_SCOOPS: 2,
    IN_BEAM: 3, IN_LIP: 3, IN_PALLETS: 2.5, IN_CHANNEL: 2.5, IN_DOCK_UP: 2, IN_GAUNTLET: 2,
    NE_RAIL: 3, NE_PILLARS: 2.5, NE_VENDING: 2.5, NE_SAKURA: 2.5, NE_SKYWALK: 1.6, NE_GAUNTLET: 2,
  } as Record<string, number>,
  /** Area breathers drawn instead of S_OPEN when a breather is due (SB_HILL in the Suburbs). */
  breatherTemplate: { suburbs: 'SB_HILL' } as Partial<Record<AreaId, string>>,
  /** A1 column rule (DESIGN §10.7): every 0.5 m column meets a tall blocker at least once per period of non-T0 time. */
  a1: { period: { opening: 8, warm: 6, build: 5, plateau: 4 } as Record<PhaseId, number>, colW: 0.5,
    /** Plan fillers for columns due before the segment end plus this (the next head window + slack). */
    lookahead: 1.0,
    /** At clock start the column deadlines are staggered over [stagger·P, P] (the load spreads over segments). */
    stagger: 0.45,
    /** Columns due within this fraction of a period after the segment end get a filler early when one fits. */
    early: 0.5,
    /** Lateral clearance of a filler from the safe line (beyond its half width + half hitbox), and from other bodies. */
    clearLine: 0.55, clearBody: 0.35, tries: 5 },
  /** A2 wander rule: the safe line shifts ≥ 3 m at least once per period (same periods as A1). */
  a2: { shift: 3.0, period: { opening: 8, warm: 6, build: 5, plateau: 4 } as Record<PhaseId, number>,
    /** A forced wander gate is scheduled when the deadline is this close at a segment start (a wander wall needs
     *  the head window plus a 3.3 m move: ~1.9 s); otherwise walls go into the templates. */
    gateAt: 1.9 },
  /** A3: a full-width hazard (S_BARRIER / S_TRENCH area skin) every [min, max] seconds of non-T0 time. */
  a3: { opening: [12, 16], other: [8, 12] } as Record<'opening' | 'other', readonly [number, number]>,
  /** S_GATE (DESIGN §10.4): openings 2.5 / 2.2 / 2.0 m by tier, ≥ 3 m (≤ 3.6 m) from the last wander's safe x. */
  gate: { width: { 0: 2.5, 1: 2.5, 2: 2.5, 3: 2.2, 4: 2.0 } as Record<Tier, number>, maxC: 3.3, shift: [3.2, 4.4] as readonly [number, number],
    second: { 2: 0.6, 3: 0.3 } as Partial<Record<Tier, number>>, secondOff: [3.6, 6.6] as readonly [number, number], lead: 2.3,
    /** Consecutive rows ≤ gap seconds apart (run time, T0 included): a straight lane passes at most one of two rows
     *  (openings ≥ `apart` from the last row's), so every lane dies within two rows (DESIGN §10.7 guarantees). */
    gap: { opening: 8.0, warm: 6.5, build: 5.5, plateau: 5 } as Record<PhaseId, number>, apart: 2.4,
    /** Planning: the shortest gate segment. */
    fit: 2.6 },
  /** S_TRENCH: gap per tier (s·v, DESIGN §10.3 0.25 / 0.30 / 0.35) and the plank offset from the safe x per tier. */
  trench: { gapSec: { 0: 0.25, 1: 0.25, 2: 0.30, 3: 0.33, 4: 0.33 } as Record<Tier, number>,
    plankOff: { 0: [0, 1], 1: [0, 1], 2: [1, 2], 3: [1.5, 2.5], 4: [1.5, 2.5] } as Record<Tier, readonly [number, number]>, depth: 0.6 },
  /** Breathers (S_OPEN, T0) per phase: every `every` seconds, lasting `dur` (DESIGN §11). Gateways count. */
  breather: { warm: { every: [30, 30], dur: 5 }, build: { every: [30, 30], dur: 4 }, plateau: { every: [20, 30], dur: 4 } } as
    Partial<Record<PhaseId, { every: readonly [number, number]; dur: number }>>,
  /** S_OPEN length when drawn freely, and the shortest cut-down filler (DESIGN §10.5). */
  open: { dur: [3, 5] as readonly [number, number], minFiller: 0.6, flatbar: 0.6 },
  /** Re-rolls before the constructive fallback (DESIGN §10.6.7); from `easyFrom` on the template drops its hardest
   *  element. */
  rerolls: 6, easyFrom: 4,
  /** Shortest time left before a gateway in which a template is tried (else a cut-down S_OPEN fills it). */
  minTemplateSec: 1.9,
  /** No required action in the first / last seconds of a template (DESIGN §10.5). */
  noActionHead: 0.6, noActionTail: 0.4,
  /** First required action after a startT spawn (seconds). */
  spawnGrace: 1.5,
  /** Datum (DESIGN §10.10): net elevation within ±2.4 m; S_INCLINE_UP pays a drop back with ≤ 15 s of the area left,
   *  and a full-width drop is drawn only when that payback still fits before the area ends. */
  datum: { min: -2.4, paybackSec: 15, dropRoomSec: 22, slope: 0.1 },
  /** Downtown: every 3rd segment is a curb-free granite plaza (DESIGN §10.2). Suburbs: driveway cuts every 1.5–2 s. */
  plazaEvery: 3, driveway: { every: [1.5, 2.0] as readonly [number, number], w: 3.0 },
  /** Coins (DESIGN §10.8). Gold Stacks on hard lines from T3 (and transfers, high rails, Neon elevated). */
  coins: { stringSec: 0.12, stringMin: 5, stringMax: 8, edgeUp: 0.35, arcUp: 0.25, padUp: 0.35, groundY: 0.5,
    breatherAmp: 1.4, waveCount: 6, goldFromTier: 3 },
} as const;

/** Generator switches, read once per Generator (at createWorldGen). Mutable on purpose: tests force both settings.
 *  - trench: S_TRENCH in the A3 slots (and Lesson Line pit). ON since G0: the views draw `Obstacle.pits` and planks.
 *    Off, every A3 slot is an S_BARRIER and the Lesson Line's trench becomes a barrier (docs/core-requests.md). */
export const GEN_FLAGS: { trench: boolean } = { trench: true };
