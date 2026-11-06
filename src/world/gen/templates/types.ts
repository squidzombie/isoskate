// world/gen/templates/types.ts: the template interface. A template is a parametric script (DESIGN §10.4) that, given
// the cursor state, instantiates obstacles, its safe line (constructively: it knows where its gaps are), its coins and
// its duration. Times are absolute run times; seconds convert to metres only through sAt / speedAt.
import type { AreaId } from '../../../core/ids';
import type { Sfc32 } from '../../../core/rng';
import type { Obstacle } from '../../../core/world';
import type { CoinWriter } from '../coins';
import type { PhaseId, Tier } from '../gen.config';
import type { PropCtx } from '../props/common';
import type { SafeLine } from '../safe';

export type TemplateId = 'ROLLOUT' | 'GATEWAY' | 'S_OPEN' | 'S_BARRIER' | 'S_TRENCH' | 'S_GATE' | 'DT_LEDGE' | 'DT_BENCHES';

export interface TemplateCtx {
  readonly t0: number;
  readonly v: number;                    // speedAt(t0)
  readonly tier: Tier;
  readonly phase: PhaseId;
  readonly area: AreaId;
  readonly rng: Sfc32;                   // layout stream
  readonly coinRng: Sfc32;               // coins stream
  /** Earliest start of this segment's first required action (R_MIN / T_SHIFT spacing, DESIGN §10.6 rule b). */
  readonly earliest: number;
  /** Latest end time (the next gateway starts there); Infinity if none. */
  readonly maxT1: number;
  /** Forced duration (fillers, breathers); undefined = the template's own. */
  readonly dur?: number;
  readonly line: SafeLine;               // starts at (t0, the previous safe x)
  /** Opening centres of the last S_GATE (the next gate's openings keep ≥ GATE_APART away: no lane passes both). */
  readonly lastGateX: readonly number[];
  readonly props: PropCtx;
  readonly coins: CoinWriter;
  readonly obstacles: Obstacle[];
  /** Sidewalk cuts [s0, s1) for full-width pits (the street base is emitted after the template). */
  readonly cuts: [number, number][];
}

export interface TemplateOut {
  t1: number;
  mirror?: boolean;
  /** True when it carries a full-width hazard (A3). */
  fullWidth?: boolean;
  /** True when it is an S_GATE (A1/A2 stand-in), with its opening centres. */
  gate?: boolean;
  gateX?: number[];
  /** Run time the board centre reaches the gate's row (the A1/A2 stand-in deadline counts from it). */
  gateT?: number;
}

export interface Template {
  readonly id: TemplateId;
  readonly tiers: readonly Tier[];
  build(ctx: TemplateCtx): TemplateOut;
}
