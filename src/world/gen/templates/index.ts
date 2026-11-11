// world/gen/templates/index.ts: the template registry (DESIGN §10.4 v1 set: 9 shared, 6 per area, 4 gateways, the
// Roll-out and the Lesson Line parts), plus the Phase B parked rows (theme T8, one per area). The 20 non-v1 templates are
// M5 stretch.
import type { AreaId } from '../../../core/ids';
import type { Tier } from '../gen.config';
import { ROLLOUT } from '../lesson';
import { DT_BENCHES, DT_BIG7, DT_LEDGE, DT_PLANTERS, DT_RUSH, DT_TERRACE } from './downtown';
import { IN_BEAM, IN_CHANNEL, IN_DOCK_UP, IN_GAUNTLET, IN_LIP, IN_PALLETS } from './docks';
import { GW_greenway, GW_harborBridge, GW_levelCrossing, GW_underpass } from './gateways';
import { NE_GAUNTLET, NE_PILLARS, NE_RAIL, NE_SAKURA, NE_SKYWALK, NE_VENDING } from './neon';
import { DT_PARKED_ROW, IN_LOADING_ROW, NE_TAXI_RANK, SB_DRIVEWAY_ROW } from './parked';
import { S_BARRIER, S_CONES, S_GATE, S_INCLINE_UP, S_LADDER, S_OPEN, S_PADS, S_STAIRS, S_TRENCH } from './shared';
import { SB_BINDAY, SB_DRIVEWAYS, SB_HILL, SB_PICKET, SB_SCOOPS, SB_WALL } from './suburbs';
import type { Template, TemplateId } from './types';

export const SHARED: readonly Template[] = [S_OPEN, S_CONES, S_TRENCH, S_BARRIER, S_LADDER, S_GATE, S_PADS, S_STAIRS, S_INCLINE_UP];
export const AREA_TEMPLATES: Readonly<Record<AreaId, readonly Template[]>> = {
  downtown: [DT_LEDGE, DT_BENCHES, DT_PLANTERS, DT_TERRACE, DT_RUSH, DT_BIG7, DT_PARKED_ROW],
  suburbs: [SB_WALL, SB_HILL, SB_DRIVEWAYS, SB_BINDAY, SB_PICKET, SB_SCOOPS, SB_DRIVEWAY_ROW],
  docks: [IN_BEAM, IN_LIP, IN_PALLETS, IN_CHANNEL, IN_DOCK_UP, IN_GAUNTLET, IN_LOADING_ROW],
  neon: [NE_RAIL, NE_PILLARS, NE_VENDING, NE_SAKURA, NE_SKYWALK, NE_GAUNTLET, NE_TAXI_RANK],
};
export const GATEWAYS = { greenway: GW_greenway, levelCrossing: GW_levelCrossing, harborBridge: GW_harborBridge, underpass: GW_underpass } as const;

export const TEMPLATES: Readonly<Partial<Record<TemplateId, Template>>> = Object.fromEntries(
  [ROLLOUT, ...SHARED, ...Object.values(AREA_TEMPLATES).flat(), ...Object.values(GATEWAYS)].map((t) => [t.id, t]));

/** Shared templates that are drawn by tier weight (A3 hazards, wander gates, breathers and paybacks are scheduled). */
export const DRAWN_SHARED: readonly Template[] = [S_CONES, S_LADDER, S_GATE, S_PADS, S_STAIRS];
/** Tier-parametric shared templates used when an area has no v1 template of the drawn tier (DESIGN §10.4). */
export const TIER_FALLBACK: readonly Template[] = [S_GATE, S_STAIRS, S_TRENCH, S_BARRIER];

export const templatesFor = (area: AreaId, tier: Tier): Template[] =>
  [...AREA_TEMPLATES[area], ...DRAWN_SHARED].filter((t) => t.tiers.includes(tier) && !(t.id === 'S_STAIRS' && area === 'docks' && tier >= 2));

export type { Template, TemplateCtx, TemplateId, TemplateOut } from './types';
