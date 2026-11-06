// world/gen/: procedural street generation and world queries (WG). Public surface (TECH §4.13).
// M0 stub: flat Downtown street with grey-box templates; see generator.ts for what M0-sim and WG replace.
import type { WorldGen, WorldGenConfig, WorldQuery } from '../../core/world';
import { StubWorldGen } from './generator';
import { createWorldQueryImpl } from './query';

export function createWorldGen(cfg: WorldGenConfig): WorldGen {
  return new StubWorldGen(cfg);
}

export function createWorldQuery(gen: WorldGen): WorldQuery {
  return createWorldQueryImpl(gen);
}

export { areaAtTime, GATEWAY_AFTER, LOOP_SEC } from './areas';
export { slabYAt } from './query';
