// world/gen/gen.config.ts: every generator tunable (DESIGN §10, §11, §22). Fairness floors (R_MIN, height bands,
// look-ahead) live in core/tuning.ts; this file holds the difficulty curve and placement rates. WG (W1b) owns it.
// Density figures are targets for measured outputs; the floors are hard rules.
import { SAFE_LATERAL_FRACTION, V_LAT_MAX } from '../../core/tuning';

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
  /** Planning estimates of each template's longest duration (s, measured): the scheduler only draws what fits before
   *  the gate deadline; generator.ts still rejects an actual overrun. */
  durMax: { S_GATE: 2.4, DT_LEDGE: 3.5, DT_BENCHES: 3.4, S_BARRIER: 2.1, S_TRENCH: 2.5, S_OPEN: 5.0 } as Record<string, number>,
  /** Weights of the freely drawn templates (A3 hazards, gates and breathers are scheduled, see below; in M0 the gate
   *  scheduler places every S_GATE, so it is not drawn freely). */
  templateWeights: { DT_LEDGE: 4, DT_BENCHES: 3, S_BARRIER: 1, S_TRENCH: 1, S_GATE: 0, S_OPEN: 0.5 } as Record<string, number>,
  /** A3: a full-width hazard (S_BARRIER / S_TRENCH) every [min, max] seconds of non-T0 time (DESIGN §10.7). */
  a3: { opening: [12, 16], other: [8, 12] } as Record<'opening' | 'other', readonly [number, number]>,
  /** A3 hard bound: the next full-width hazard sits about this far into its template, so a non-A3 template must end
   *  this long before the A3 maximum. */
  a3Lead: 1.6,
  /** Seconds a scheduled template may start before its due time (its hazard sits ~1–1.5 s into the template). */
  scheduleLead: 2.5,
  /** M0 stand-in for A1 (column rule) and A2 (wander): an S_GATE (a row of tall blockers, its opening ≥ 3 m from the
   *  previous safe x and ≥ `apart` from the last gate's openings, so no straight lane passes two gates in a row).
   *  Scheduled by deadline in run time: consecutive gate rows are ≤ `gap` seconds apart, T0 stretches included (a
   *  template that would overrun it is replaced by the gate; when the deadline falls in a gateway, the gate comes
   *  before it). The first gate comes right after the Roll-out or the spawn grace, so a straight lane dies by the
   *  second row: ≈ 10.7 + 9 s from t = 0, ≈ 2.8 + 7 s from a plateau start (DESIGN §10.7 straight-bot guarantees).
   *  TODO(WG): replace with the A1 column fillers and the A2 wander rule. */
  gate: { first: [0, 0.5] as readonly [number, number],
    gap: { opening: 9, warm: 9, build: 8, plateau: 7 } as Record<PhaseId, number>,
    /** Planning estimates: seconds from a gate segment's start to its row, and the shortest gate segment. */
    lead: 1.5, fit: 2.6,
    /** Opening width per tier (DESIGN §10.4: 2.5 / 2.2 / 2.0 m), the row's half reach, the max opening centre, the
     *  min distance between consecutive gates' openings, and the preferred shift from the previous safe x. */
    width: { 0: 2.5, 1: 2.5, 2: 2.5, 3: 2.2, 4: 2.0 } as Record<Tier, number>,
    reach: 4.6, maxC: 3.2, apart: 2.4, shift: [3.0, 3.6] as readonly [number, number],
    /** T2: chance of a second opening 3.5–5 m from the first; chance the row is news boxes instead of trash cans. */
    second: 0.4, secondOff: [3.5, 5.0] as readonly [number, number], newsBox: 0.3 },
  /** S_TRENCH: gap length per tier (s·v, DESIGN §10.3 0.25 / 0.30 / 0.35), plank offset from the safe x per tier (m),
   *  plank width and the drawn depth. */
  trench: { gapSec: { 0: 0.25, 1: 0.25, 2: 0.30, 3: 0.35, 4: 0.35 } as Record<Tier, number>,
    plankOff: { 0: [0, 1], 1: [0, 1], 2: [1, 2], 3: [2, 3], 4: [2, 3] } as Record<Tier, readonly [number, number]>,
    plankW: 1.2, depth: 0.6 },
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
  safeRate: SAFE_LATERAL_FRACTION.ground * V_LAT_MAX,
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

/** Generator switches, read once per Generator (at createWorldGen). Mutable on purpose: tests force both settings,
 *  and the G0 gate flips a default with one line.
 *  - trench: S_TRENCH in the A3 slots and the free draw. ON since G0: the grey-box view draws `Obstacle.pits` as dark
 *    recesses with the plank on top (docs/core-requests.md, M0-sim section). Off, every A3 slot is an S_BARRIER. */
export const GEN_FLAGS: { trench: boolean } = { trench: true };
