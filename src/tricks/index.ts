// tricks/: trick definitions, gesture interpretation, combo and scoring (GP). Public surface (TECH §4.13).
// M0: only the tables. interpret.ts / combo.ts / scoring.ts / score.config.ts arrive with M0-sim and W1a.
import type { TrickTables } from '../core/tricks';
import { TRICK_TABLES } from './defs';

export const TRICKS: TrickTables = TRICK_TABLES;
export { FLIPS, SPINS, GRINDS, MANUALS, GRABS } from './defs';
