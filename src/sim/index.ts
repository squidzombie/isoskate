// sim/: the deterministic 60 Hz skater simulation (GP). Public surface (TECH §4.13).
// Files: step (the Sim and its step order), state, kinematics, ground, air, predict, magnet, grind, manual, landing,
// collide, nearmiss, bonus (gaps, landmarks), pickups, pose, snapshot. Contact, skim, pit, magnet and capture
// behaviour are FROZEN since M0 (TECH §6.3); the one change behind RULES.popOutSkipsOwnEdge is filed in
// docs/core-requests.md (GP).
import type { Sim, SimDeps } from '../core/sim';
import type { TrickTables } from '../core/tricks';
import { SimImpl, type SimDebugInfo } from './step';

export function createSim(tables: TrickTables, deps?: SimDeps): Sim {
  return new SimImpl(tables, deps);
}

/** Debug overlay data of a sim made by createSim (pick window, heat, airLeft, manual budget, rewinds left); null for
 *  any other Sim. Until DebugSnapshot carries it (GP request), the overlay can read it through this. */
export function simDebug(sim: Sim): SimDebugInfo | null { return sim instanceof SimImpl ? sim.debug() : null; }

export type { RewindEventExt, SimDebugInfo } from './step';
export { GRIND_BODY_YAW } from './pose';
export { insetBox, insetOf } from './collide';
export { BUMP_WOBBLE, COIN_CHAIN_TICKS, COIN_VOLUME, MANUAL_END_WOBBLE, PICK_MISS_TICKS, ROLL_OFF_DROP, STICKY_DROP } from './consts';
