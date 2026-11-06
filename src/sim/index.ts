// sim/: the deterministic 60 Hz skater simulation (GP). Public surface (TECH §4.13).
// M0 stub: a kinematic roller (stub.ts). M0-sim/GP replace the internals; the factory signature is frozen.
import type { Sim, SimDeps } from '../core/sim';
import type { TrickTables } from '../core/tricks';
import { StubSim } from './stub';

export function createSim(tables: TrickTables, deps?: SimDeps): Sim {
  return new StubSim(tables, deps);
}
