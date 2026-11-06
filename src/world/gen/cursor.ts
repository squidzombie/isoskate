// world/gen/cursor.ts: the generator's carried state between segments (TECH §5.1 GenCursor, M0 subset).
// WG grows it to the full cursor (history planes, exit set, A1 per-column clocks, …).
import type { AreaId } from '../../core/ids';
import type { Obstacle } from '../../core/world';
import type { Tier } from './gen.config';
import type { IdCounters } from './props/common';
import type { LineTail } from './safe';

export interface GenCursor {
  segIndex: number;
  t: number; s: number;
  area: AreaId;
  /** Safe-line x at the end of the last segment. */
  safeX: number;
  /** Last required action (spacing rule b across boundaries). */
  last: { t: number; dx: number } | null;
  /** No required action before this time (spawn grace after a startT start). */
  firstActionT: number;
  /** Non-T0 seconds since the clocks started (9 s, or startT); A1–A3 clocks pause in T0. */
  aClock: number;
  /** A-time of the last full-width hazard, and the target A-time of the next one (A3). */
  hazardA: number; fwTargetA: number;
  /** A1/A2 stand-in: run time by which the next gate's row must come (the last row + GEN.gate.gap), and the last
   *  gate's opening centres. */
  gateDueT: number; lastGateX: number[];
  /** S_TRENCH allowed (GEN_FLAGS.trench at construction). */
  trench: boolean;
  /** Run time the next breather is due. */
  breatherDueT: number;
  lastTier: Tier;
  ids: IdCounters;
  /** Obstacles and safe-line tail near the last segment end: the history window of the next validation. */
  history: Obstacle[];
  historyLine: LineTail | null;
}
