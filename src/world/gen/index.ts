// world/gen/: procedural street generation and world queries (WG). Public surface (TECH §4.13).
// The pipeline is TECH §5.1: areas (timeline) · lesson (Roll-out, Lesson Line) · schedule (what comes next) ·
// templates/* (parametric scripts) · props/* (physical builders, street base) · validator/* (the fairness proof:
// grid, sweep, rules, path, validate) · antistraight (A1–A3) · coins · decor (DECOR_KINDS from core) · query ·
// planner (the validator's planner for bots).
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
export { rMinAt, spacingAfter } from './validator/sweep';
export { insetOf, checkPath } from './validator/path';
export { SafeLine } from './safe';
export { ROLLOUT_END_S, ROLLOUT_CHAIN_T, ROLLOUT_LEDGE, LESSON_PARTS } from './lesson';
export { LAYOUTS, BAND_CODE, LIP, type StreetLayout } from './props/street';
export { COLS, covers, colRange } from './antistraight';
export { AREA_TEMPLATES, SHARED, GATEWAYS, TEMPLATES } from './templates';
export { Generator } from './generator';
export { plan as planLine, type PlanInput, type PlanOutput } from './planner';
