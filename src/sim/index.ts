// sim/: the deterministic 60 Hz skater simulation (GP). Public surface (TECH §4.13).
// Files: step (the Sim and its step order), state, kinematics, ground, air, predict, magnet, grind, manual, landing,
// collide, pickups, pose, snapshot. Contact, skim, pit, magnet and capture behaviour are FROZEN since M0 (TECH §6.3).
import type { Sim, SimDeps } from '../core/sim';
import type { TrickTables } from '../core/tricks';
import { SimImpl } from './step';

export function createSim(tables: TrickTables, deps?: SimDeps): Sim {
  return new SimImpl(tables, deps);
}

export { insetBox, insetOf } from './collide';
export { BUMP_WOBBLE, COIN_CHAIN_TICKS, COIN_VOLUME, MANUAL_END_WOBBLE, PICK_MISS_TICKS, ROLL_OFF_DROP, STICKY_DROP } from './consts';
