// world/gen/templates/types.ts: the template interface. A template is a parametric script (DESIGN §10.4): given the
// cursor state it instantiates obstacles (track space, 1 cm rounding), its trick-line coins and gap tags, and its
// duration. The safe line is "auto": the validator computes it (DESIGN §10.6). Times are absolute run times; seconds
// convert to metres only through sAt / speedAt. x is written in template space and mirrored with X() (the whole
// template mirrors unless `mirror: false`, e.g. everything in the Docks, whose lip is on the right).
import type { AreaId, GatewayId, HintId } from '../../../core/ids';
import type { Sfc32 } from '../../../core/rng';
import type { Obstacle } from '../../../core/world';
import type { CoinWriter } from '../coins';
import type { PhaseId, Tier } from '../gen.config';
import type { PropCtx } from '../props/common';
import type { StreetLayout } from '../props/street';

export type TemplateId =
  | 'ROLLOUT' | 'LESSON' | 'GW_greenway' | 'GW_levelCrossing' | 'GW_harborBridge' | 'GW_underpass'
  | 'S_OPEN' | 'S_CONES' | 'S_TRENCH' | 'S_BARRIER' | 'S_LADDER' | 'S_GATE' | 'S_PADS' | 'S_STAIRS' | 'S_INCLINE_UP'
  | 'DT_LEDGE' | 'DT_BENCHES' | 'DT_PLANTERS' | 'DT_TERRACE' | 'DT_RUSH' | 'DT_BIG7'
  | 'SB_WALL' | 'SB_HILL' | 'SB_DRIVEWAYS' | 'SB_BINDAY' | 'SB_PICKET' | 'SB_SCOOPS'
  | 'IN_BEAM' | 'IN_LIP' | 'IN_PALLETS' | 'IN_CHANNEL' | 'IN_DOCK_UP' | 'IN_GAUNTLET'
  | 'NE_RAIL' | 'NE_PILLARS' | 'NE_VENDING' | 'NE_SAKURA' | 'NE_SKYWALK' | 'NE_GAUNTLET'
  | 'DT_PARKED_ROW' | 'SB_DRIVEWAY_ROW' | 'IN_LOADING_ROW' | 'NE_TAXI_RANK'   // Phase B parked rows (theme T8)
  | 'FALLBACK';

export interface TemplateCtx {
  readonly id: TemplateId;
  readonly t0: number;
  readonly v: number;                    // speedAt(t0)
  readonly tier: Tier;
  readonly phase: PhaseId;
  readonly area: AreaId;
  readonly gateway: GatewayId | null;
  readonly layout: StreetLayout;
  readonly datum: number;
  readonly rng: Sfc32;                   // layout stream
  readonly coinRng: Sfc32;               // coins stream
  readonly m: 1 | -1;                    // mirror sign
  /** Mirror a template-space x (m·x, 1 cm). */
  X(x: number): number;
  /** Latest end time (the next gateway starts there); Infinity if none. */
  readonly maxT1: number;
  /** Forced duration (fillers, breathers); undefined = the template's own. */
  readonly dur?: number;
  /** The previous segment's safe exit x, and the safe x of the last A2 wander (a forced wander must leave it ≥ 3 m). */
  readonly safeX: number;
  readonly wanderFrom: number;
  /** A1: seconds of non-T0 time left before the column at x must meet a tall blocker (gates open where it is late). */
  colLeft(x: number): number;
  /** The lanes a straight roller passed the last anti-straight row through (the next row's must be disjoint). */
  readonly lastGateOpen: readonly (readonly [number, number])[];
  /** S_GATE: also carry the A3 full-width hazard in the approach (both deadlines due at once). */
  readonly a3?: boolean;
  /** Earliest time a required action may start (spacing from the previous one, spawn grace). */
  readonly earliest: number;
  /** Re-roll index (0 = first try); ≥ GEN.easyFrom: the "drop the hardest element" retries. */
  readonly attempt: number;
  readonly props: PropCtx;
  /** A PropCtx at another datum (after a full-width drop in this template). */
  propsAt(datum: number): PropCtx;
  readonly coins: CoinWriter;
  readonly obstacles: Obstacle[];
  /** [s0, s1) intervals without street base (pits, stairs, inclines: the template lays that ground itself). */
  readonly cuts: [number, number][];
  /** Driveway curb cuts [s0, s1, side] (Suburbs). */
  readonly driveways: [number, number, number][];
  /** Datum changes inside the template: from s on the street base is at `datum` (full-width drops, paybacks). */
  readonly datumAt: { s: number; datum: number }[];
  /** Lesson Line: the hint an obstacle teaches. */
  hint(ob: Obstacle, h: HintId): Obstacle;
}

export interface TemplateOut {
  t1: number;
  mirror?: boolean;
  /** Carries a full-width hazard (A3), with its contact time. */
  fullWidth?: boolean;
  /** Exit lateral sets that must be open at the end (default the whole corridor). */
  exit?: [number, number][];
  /** Street layout override for the segment (Downtown plazas, gateways). */
  layout?: StreetLayout;
  /** No curb grind edges (gateways that fade the curbs out). */
  noCurbEdges?: boolean;
  /** The segment is a T0 stretch (no required actions; A clocks paused). */
  t0Stretch?: boolean;
  /** Hints for the validator's line (DP guides): where the line should pass, e.g. a gate opening's centre. */
  guides?: { t0: number; t1: number; x0: number; x1: number }[];
  /** S_GATE: its row's opening centres and the run time the board reaches it. */
  gateX?: number[]; gateT?: number;
  /** Docks lip edges: false = none this segment; a range (and landmark) = this run instead of the default ones. */
  lip?: false | { s0: number; s1: number; landmark?: string };
}

export interface Template {
  readonly id: TemplateId;
  readonly area: AreaId | 'shared' | 'fixed';
  readonly tiers: readonly Tier[];
  /** Planning estimate of the longest duration (s): the scheduler only draws what fits. */
  readonly durMax: number;
  readonly mirror: boolean;
  /** Drawn only from this run time (NE_SKYWALK: T3+, i.e. from 90 s). */
  readonly fromT?: number;
  /** Lowers the datum by this much (full-width drops): drawn only when it can be paid back. */
  readonly drop?: number;
  /** Carries a full-width hazard (A3 accounting while drawing). */
  readonly fullWidth?: boolean;
  /** Forces a ≥ 3 m wander (A2). */
  readonly wander?: boolean;
  build(ctx: TemplateCtx): TemplateOut | null;
}
