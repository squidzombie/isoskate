// world/gen/: procedural street generation and world queries (WG). Public surface (TECH §4.13).
// M0 (M0-sim): area timeline (all 4 areas named, Downtown templates everywhere), the Roll-out, S_OPEN, S_BARRIER,
// S_TRENCH, S_GATE, DT_LEDGE, DT_BENCHES, gateways, A3 + gate scheduling, coins and SafeKeys, and a simple validator
// (height bands, R_MIN spacing along SafeKeys, safe-line path check). WG (W1b) adds the rest of TECH §5.
import type { WorldGen, WorldGenConfig, WorldQuery } from '../../core/world';
import { Generator } from './generator';
import { createWorldQueryImpl } from './query';

export function createWorldGen(cfg: WorldGenConfig): WorldGen {
  return new Generator(cfg);
}

export function createWorldQuery(gen: WorldGen): WorldQuery {
  return createWorldQueryImpl(gen);
}

export { areaAtTime, GATEWAY_AFTER, LOOP_SEC, FIRST_VISIT_SEC, VISIT_SEC, GATEWAY_SEC, BLEND_SEC } from './areas';
export { fastQueryOf, slabYAt, STREET, type FastQuery } from './query';
export { GEN, GEN_FLAGS, PHASES, type PhaseId, type Tier } from './gen.config';
export { gatewayWindow, phaseAt } from './schedule';
export { polyX, KEY_EVERY } from './safe';
export { rMinAt, spacingAfter } from './validator/rules';
export { insetOf } from './validator/path';
export { ROLLOUT_END_S, ROLLOUT_CHAIN_T, ROLLOUT_LEDGE } from './lesson';
