// world/gen/schedule.ts: what the next segment is (DESIGN §10.5, §10.7, §11): gateways at their timeline times,
// cut-down fillers before them, the A3 full-width hazard scheduler, the M0 gate scheduler (A1/A2 stand-in, by deadline:
// see GEN.gate), breathers, and the tier-weighted draw. Pure functions of the cursor and the layout RNG.
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

/** The A3 full-width hazard (S_BARRIER, or S_TRENCH when enabled). */
export const a3Plan = (c: GenCursor, rng: Sfc32, tier: Tier): Plan =>
  ({ id: rng.chance(0.5) && c.trench ? 'S_TRENCH' : 'S_BARRIER', tier, reason: 'a3' });

const durMax = (id: TemplateId): number => GEN.durMax[id] ?? GEN.open.dur[1];

/** Seconds from now in which the next gate segment must start (GEN.gate): its row by the deadline, and before the
 *  gateway [gwStart, gwEnd) when the deadline falls inside it or too soon after it. */
export function gateRoom(c: GenCursor, gwStart: number, gwEnd: number): number {
  const startBy = c.gateDueT - GEN.gate.lead;
  if (startBy >= gwEnd || startBy <= gwStart - GEN.gate.fit) return startBy - c.t;
  return gwStart - GEN.gate.fit - c.t;
}

/** The template for the next segment (before validation). `left` = seconds until the next gateway starts, `room` =
 *  seconds before the next gate segment must start (gateRoom). Only templates that end in time are drawn; when none
 *  does, the gate (if it fits before the gateway; else a filler, and the gate comes right after the gateway). */
export function planSegment(c: GenCursor, phase: PhaseId, rng: Sfc32, left: number, room: number): Plan {
  if (left < GEN.minTemplateSec) return { id: 'S_OPEN', tier: 0, dur: left, reason: 'filler' };
  const tier = drawTier(phase, rng, c.lastTier);
  const gateFits = left >= GEN.gate.fit;
  const gate: Plan = { id: 'S_GATE', tier: Math.max(2, tier) as Tier, reason: 'gate' };
  const limit = gateFits ? room : left;
  if (c.aClock + 1.2 >= c.fwTargetA) {
    // A3 is due: it goes first when it fits, or when its own clock is the tighter one (the a3 rejection's bound).
    const a3Slack = c.hazardA + a3Range(phase)[1] - GEN.a3Lead - c.aClock;
    if (durMax('S_BARRIER') <= limit || a3Slack < room) return a3Plan(c, rng, Math.max(1, Math.min(tier, 2)) as Tier);
  }
  const br = GEN.breather[phase];
  if (br && c.t >= c.breatherDueT && br.dur <= limit) return { id: 'S_OPEN', tier: 0, dur: br.dur, reason: 'breather' };
  const allowFw = c.aClock + 1.0 >= c.hazardA + a3Range(phase)[0];
  const items: [TemplateId, number][] = [];
  for (const id of DRAWN) {
    const tpl = TEMPLATES[id];
    if (id !== 'S_OPEN' && !tpl.tiers.includes(tier)) continue;
    if ((id === 'S_BARRIER' || id === 'S_TRENCH') && !allowFw) continue;
    if (id === 'S_TRENCH' && !c.trench) continue;
    if (id !== 'S_GATE' && durMax(id) > limit) continue;
    items.push([id, GEN.templateWeights[id] ?? 0]);
  }
  if (!items.length) return gateFits ? gate : { id: 'S_OPEN', tier: 0, dur: left, reason: 'filler' };
  const id = rng.weighted(items);
  return { id, tier: id === 'S_OPEN' ? 0 : tier, reason: 'draw' };
}
