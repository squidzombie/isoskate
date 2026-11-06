// world/gen/templates/index.ts: the template registry. WG adds the area templates here (templates/<area>.ts).
import type { Template, TemplateId } from './types';
import { S_BARRIER, S_GATE, S_OPEN, S_TRENCH } from './shared';
import { DT_BENCHES, DT_LEDGE } from './downtown';
import { GATEWAY, ROLLOUT } from '../lesson';

export const TEMPLATES: Readonly<Record<TemplateId, Template>> = {
  ROLLOUT, GATEWAY, S_OPEN, S_BARRIER, S_TRENCH, S_GATE, DT_LEDGE, DT_BENCHES,
};
/** Templates drawn freely by tier weight (A3 hazards, gates and breathers are also scheduled). */
export const DRAWN: readonly TemplateId[] = ['DT_LEDGE', 'DT_BENCHES', 'S_BARRIER', 'S_TRENCH', 'S_GATE', 'S_OPEN'];
export type { Template, TemplateCtx, TemplateId, TemplateOut } from './types';
