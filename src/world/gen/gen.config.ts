// world/gen/gen.config.ts: every generator tunable (DESIGN §10, §11, §22). Fairness floors (R_MIN, height bands,
// look-ahead) live in core/tuning.ts; this file holds the difficulty curve and placement rates. WG (W1b) owns it.
// Density figures are targets for measured outputs; the floors are hard rules.

export type PhaseId = 'opening' | 'warm' | 'build' | 'plateau';
export type Tier = 0 | 1 | 2 | 3 | 4;

/** Difficulty phases by run time (DESIGN §11). */
export const PHASES: readonly { id: PhaseId; t0: number }[] = [
  { id: 'opening', t0: 0 }, { id: 'warm', t0: 45 }, { id: 'build', t0: 90 }, { id: 'plateau', t0: 150 },
];

export const GEN = {
  /** Tier weights per phase (DESIGN §11). The opening is T1 only (the gate scheduler adds the A1/A2 gates). */
  tierWeights: {
    opening: [[1, 1]], warm: [[1, 60], [2, 40]], build: [[1, 25], [2, 50], [3, 25]],
    plateau: [[1, 15], [2, 40], [3, 35], [4, 10]],
  } as Record<PhaseId, readonly (readonly [Tier, number])[]>,
  /** Weights of the freely drawn templates (A3 hazards, gates and breathers are scheduled, see below). */
  templateWeights: { DT_LEDGE: 4, DT_BENCHES: 3, S_BARRIER: 1, S_TRENCH: 1, S_GATE: 2, S_OPEN: 0.5 } as Record<string, number>,
  /** A3: a full-width hazard (S_BARRIER / S_TRENCH) every [min, max] seconds of non-T0 time (DESIGN §10.7). */
  a3: { opening: [12, 16], other: [8, 12] } as Record<'opening' | 'other', readonly [number, number]>,
  /** Seconds a scheduled template may start before its due time (its hazard sits ~1–1.5 s into the template). */
  scheduleLead: 2.5,
  /** M0 stand-in for A1 (column rule) and A2 (wander): an S_GATE (tall row, opening ≥ 3 m from the previous safe x)
   *  at least every `period` seconds of non-T0 time; the first one right after the Roll-out. TODO(WG): column fillers. */
  gate: { first: [0, 0.5] as readonly [number, number],
    period: { opening: 5.5, warm: 5.5, build: 4.5, plateau: 4 } as Record<PhaseId, number> },
  /** Breathers (S_OPEN, T0) per phase: every `every` seconds, lasting `dur` (DESIGN §11). Opening: none (the
   *  Roll-out and the Greenway gateway are its breathers). */
  breather: { warm: { every: [30, 30], dur: 5 }, build: { every: [30, 30], dur: 4 }, plateau: { every: [20, 30], dur: 4 } } as
    Partial<Record<PhaseId, { every: readonly [number, number]; dur: number }>>,
  /** S_OPEN length when drawn freely, and the shortest cut-down filler (DESIGN §10.5). */
  open: { dur: [3, 5] as readonly [number, number], minFiller: 0.5 },
  /** Re-rolls before the constructive fallback (DESIGN §10.6.7). */
  rerolls: 6,
  /** Shortest time left before a gateway in which a non-filler template is tried. */
  minTemplateSec: 1.8,
  /** Safe-line lateral rate (m/s): the validator's ground reach, 0.70 · V_LAT_MAX (DESIGN §10.6). */
  safeRate: 0.7 * 5.5,
  /** Safe line arrives at a gap this long before the hitbox front meets it. */
  arriveMargin: 0.35,
  /** Coins (DESIGN §10.8). */
  coins: { stringSec: 0.12, stringMin: 5, stringMax: 8, edgeUp: 0.35, arcUp: 0.25, groundY: 0.5, breatherAmp: 1.4, waveCount: 5 },
  /** Chance that a freely drawn S_OPEN carries a flat bar (trick line) instead of a breather wave. */
  openFlatbar: 0.6,
  /** No required action in the first / last seconds of a template (DESIGN §10.5). */
  noActionHead: 0.6, noActionTail: 0.4,
  /** First required action after a startT spawn (seconds). */
  spawnGrace: 1.5,
} as const;
