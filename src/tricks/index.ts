// tricks/: trick definitions, gesture interpretation, combo and scoring (GP). Public surface (TECH §4.13).
// The sim imports everything it needs from here (lint: no reaching into tricks/ internals).
import type { TrickTables } from '../core/tricks';
import { TRICK_TABLES } from './defs';

export const TRICKS: TrickTables = TRICK_TABLES;
export { FLIPS, SPINS, GRINDS, MANUALS, GRABS } from './defs';
export { POINTS, RULES, SCORE } from './score.config';
export { emptyView, interpret, swipeCounts, type AmendView, type InputFrameExt, type Intent, type InterpretView } from './interpret';
export {
  addBonus, addLink, addTrick, bank, emptyCombo, finishTrick, liveTrick, lose, openWindow, pauseWindow, recompute, refreshHeat,
  refreshWindow, retarget,
  tickCombo, type BankReason, type TrickOpts,
} from './combo';
export { comboCoins, comboValue, decayFactor, multiplierOf, trickPoints, uniqueNamesOf, varietyOf } from './scoring';
