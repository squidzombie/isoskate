// world/gen/schedule.ts: what the next segment is (DESIGN §10.5, §10.7, §11): gateways at their timeline times,
// cut-down fillers before them, the A3 full-width hazard scheduler, the M0 gate scheduler (A1/A2 stand-in),
// breathers, and the tier-weighted draw. Pure functions of the cursor and the layout RNG.
import type { Sfc32 } from '../../core/rng';
import { FIRST_VISIT_SEC, GATEWAY_AFTER, GATEWAY_SEC, VISIT_SEC, areaAtTime } from './areas';
import type { GatewayId, AreaId } from '../../core/ids';
import { GEN, PHASES, type PhaseId, type Tier } from './gen.config';
import { DRAWN, TEMPLATES, type TemplateId } from './templates';
import type { GenCursor } from './cursor';

export function phaseAt(t: number): PhaseId {
  let p: PhaseId = 'opening';
  for (const ph of PHASES) if (t >= ph.t0) p = ph.id;
  return p;
}

/** The gateway window that contains t, or the next one after t (the timeline is fixed in run time, DESIGN §12.1). */
export function gatewayWindow(t: number, startArea: AreaId): { start: number; end: number; id: GatewayId } {
  const loop = VISIT_SEC + GATEWAY_SEC;
  let k = Math.max(0, Math.floor((t - FIRST_VISIT_SEC) / loop));
  let start = FIRST_VISIT_SEC + k * loop;
  if (t >= start + GATEWAY_SEC - 1e-9) { k++; start += loop; }
  const area = areaAtTime(start + 1e-6, startArea).area;
  return { start, end: start + GATEWAY_SEC, id: GATEWAY_AFTER[area] };
}

export function a3Range(phase: PhaseId): readonly [number, number] { return phase === 'opening' ? GEN.a3.opening : GEN.a3.other; }

/** Next A3 target (A-clock time of the next full-width hazard), drawn after a hazard at A-time `hazardA`. */
export function nextFullWidthTarget(hazardA: number, phase: PhaseId, rng: Sfc32): number {
  const [lo, hi] = a3Range(phase);
  return hazardA + rng.range(lo, hi - 1.5);
}

export function drawTier(phase: PhaseId, rng: Sfc32, lastTier: Tier): Tier {
  if (lastTier === 4) return 1;                                    // T4 never follows T4 (DESIGN §10.5)
  return rng.weighted(GEN.tierWeights[phase]);
}

export interface Plan { id: TemplateId; tier: Tier; dur?: number; reason: 'rollout' | 'gateway' | 'filler' | 'a3' | 'gate' | 'breather' | 'draw' }

/** The template for the next segment (before validation). `left` = seconds until the next gateway starts. */
export function planSegment(c: GenCursor, phase: PhaseId, rng: Sfc32, left: number): Plan {
  if (left < GEN.minTemplateSec) return { id: 'S_OPEN', tier: 0, dur: left, reason: 'filler' };
  const tier = drawTier(phase, rng, c.lastTier);
  if (c.aClock + 1.2 >= c.fwTargetA) {
    return { id: rng.chance(0.5) ? 'S_BARRIER' : 'S_TRENCH', tier: Math.max(1, Math.min(tier, 2)) as Tier, reason: 'a3' };
  }
  if (c.aClock + 0.6 >= c.gateTargetA) return { id: 'S_GATE', tier: Math.max(2, tier) as Tier, reason: 'gate' };
  const br = GEN.breather[phase];
  if (br && c.t >= c.breatherDueT) return { id: 'S_OPEN', tier: 0, dur: br.dur, reason: 'breather' };
  const allowFw = c.aClock + 1.0 >= c.hazardA + a3Range(phase)[0];
  const items: [TemplateId, number][] = [];
  for (const id of DRAWN) {
    const tpl = TEMPLATES[id];
    if (id === 'S_OPEN') { items.push([id, GEN.templateWeights[id] ?? 0]); continue; }
    if (!tpl.tiers.includes(tier)) continue;
    if ((id === 'S_BARRIER' || id === 'S_TRENCH') && !allowFw) continue;
    items.push([id, GEN.templateWeights[id] ?? 0]);
  }
  const id = rng.weighted(items);
  return { id, tier: id === 'S_OPEN' ? 0 : tier, reason: 'draw' };
}
