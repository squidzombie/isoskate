// world/gen/cursor.ts: the generator's carried state between segments (TECH §5.1 GenCursor).
import type { AreaId } from '../../core/ids';
import type { Obstacle } from '../../core/world';
import type { Tier } from './gen.config';
import type { IdCounters } from './props/common';
import type { ValState } from './validator/validate';

export interface GenCursor {
  seed: number; segIndex: number;
  t: number; s: number;
  area: AreaId; startArea: AreaId;
  /** Street datum (DESIGN §10.10): 0 except between a full-width drop and its S_INCLINE_UP. */
  datum: number;
  /** The previous segment's safe exit x. */
  safeX: number;
  /** Validator state: history planes, committed exit set E, the line's state at the boundary, tick phase. */
  val: ValState;
  /** Last required action (spacing rule b across boundaries); its run time and lateral move. */
  last: { t: number; dx: number } | null;
  /** No required action before this time (spawn grace after a startT start). */
  firstActionT: number;
  /** The A1–A3 clocks run on non-T0 seconds from `clockFromT` (9 s, the lesson's end, or startT). */
  clockFromT: number; aClock: number;
  /** A1: per 0.5 m column, the A-time of the last tall cover. */
  lastTall: Float64Array;
  /** A2: lateral range since the last wander, and its A-time. */
  wander: { lo: number; hi: number; lastA: number };
  /** Anti-straight rows (straight-bot guarantee, rows.ts): run time the next row is due, the last two rows' run times,
   *  and the board-centre lanes a straight roller passed the last row through (the next row's must be disjoint). */
  gateDueT: number; lastRowT: number; prevRowT: number; lastGateOpen: [number, number][];
  /** A3: A-time of the last full-width hazard, and the A-time the next one is due. */
  lastFwA: number; fwDueA: number;
  /** Run time the next breather is due. */
  breatherDueT: number;
  lastTier: Tier;
  /** Downtown segments this visit (every 3rd is a plaza); has this visit's landmark appeared yet. */
  areaSegs: number; landmarkDone: boolean;
  /** Lesson Line part index (mode 'lesson'). */
  lessonPart: number;
  ids: IdCounters;
  /** Obstacles near the boundary: the history window of the next validation. */
  history: Obstacle[];
  /** Long obstacles spanning many segments (the Docks lip body of a visit). */
  persistent: Obstacle[];
}
