// world/gen/schedule.ts: what the next segment is (DESIGN §10.5, §10.7, §11, §12): the Roll-out / Lesson Line, the
// gateways at their timeline times, cut-down fillers before them, datum payback (S_INCLINE_UP), the A3 full-width
// hazard scheduler, a forced wander when A2 is overdue, breathers, and the tier-weighted draw (area v1 templates plus
// the drawn shared ones; the tier-parametric shared templates when an area has none of that tier). Pure functions of
// the cursor and the layout RNG.
import type { AreaId, GatewayId } from '../../core/ids';
import type { Sfc32 } from '../../core/rng';
import { FIRST_VISIT_SEC, GATEWAY_AFTER, GATEWAY_SEC, VISIT_SEC, areaAtTime } from './areas';
import type { GenCursor } from './cursor';
import { GEN, GEN_FLAGS, PHASES, type PhaseId, type Tier } from './gen.config';
import { AREA_TEMPLATES, TEMPLATES, TIER_FALLBACK, templatesFor, type Template } from './templates';

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

/** Next A3 due time (A-clock), drawn after a hazard at A-time `a`. */
export function nextFullWidthDue(a: number, phase: PhaseId, rng: Sfc32): number {
  const [lo, hi] = a3Range(phase);
  return a + rng.range(lo, hi - 1.5);
}

export function drawTier(phase: PhaseId, rng: Sfc32, lastTier: Tier): Tier {
  if (lastTier === 4) return 1;                                    // T4 never follows T4 (DESIGN §10.5)
  return rng.weighted(GEN.tierWeights[phase]);
}

export type PlanReason = 'rollout' | 'lesson' | 'gateway' | 'filler' | 'payback' | 'a3' | 'wander' | 'breather' | 'draw';
/** a3: the gate segment also carries the A3 full-width hazard (both deadlines at once). */
export interface Plan { tpl: Template; tier: Tier; dur?: number; reason: PlanReason; a3?: boolean }

/** The A3 hazard: S_TRENCH (when enabled) or S_BARRIER (area skins). */
export function a3Plan(rng: Sfc32, tier: Tier, trench: boolean): Plan {
  const useTrench = trench && rng.chance(0.5);
  return { tpl: TEMPLATES[useTrench ? 'S_TRENCH' : 'S_BARRIER']!, tier: (useTrench ? Math.max(1, Math.min(3, tier)) : Math.max(1, Math.min(2, tier))) as Tier, reason: 'a3' };
}

export interface PlanEnv {
  area: AreaId; phase: PhaseId; t: number;
  /** Seconds until the next gateway starts, and until the area visit ends (the same in v1). */
  left: number;
  trench: boolean;
  /** Seconds from t in which the next gate segment must start (generator.gateLatestStart). */
  gateRoom: number;
  /** A previous attempt asked for this instead. */
  force?: 'wander' | 'a3' | 'filler' | 'easy';
}

/** The template for the next procedural segment (before instantiation and validation). */
export function planSegment(c: GenCursor, env: PlanEnv, rng: Sfc32): Plan {
  const { area, phase, left } = env;
  const open = TEMPLATES.S_OPEN!;
  if (left < GEN.minTemplateSec) return { tpl: open, tier: 0, dur: left, reason: 'filler' };
  if (env.force === 'filler') return { tpl: open, tier: 0, dur: Math.min(left, GEN.open.dur[0]), reason: 'filler' };
  if (c.datum < -1e-6 && left <= GEN.datum.paybackSec) return { tpl: TEMPLATES.S_INCLINE_UP!, tier: 0, reason: 'payback' };
  const tier = drawTier(phase, rng, c.lastTier);
  const clocks = env.t >= c.clockFromT - 1e-9;
  const gate = TEMPLATES.S_GATE!;
  // The gate row (A1 / A2 / straight-bot guarantee) by its deadline; an A3 hazard first when its own clock is tighter.
  // Rows overlay the templates at their deadline; a gate segment only when the deadline is (almost) now.
  const gateNow = env.force === 'wander' || env.gateRoom < 0.6;
  const a3MaxLeft = c.lastFwA + a3Range(phase)[1] - c.aClock;
  // A3 is due early enough that a gate segment (≈ 3 s) may still go first and the hazard (≈ 1.2 s into its own
  // template) lands by the A3 maximum.
  // Before a gateway (T0: the A-clock pauses) the last slot that fits a hazard takes it when the A3 maximum would
  // otherwise fall soon after the gateway.
  const preGw = left < 9.0 && a3MaxLeft < left + GEN.a3Lead;
  const a3Due = clocks && (env.force === 'a3' || c.aClock + 0.5 >= c.fwDueA || a3MaxLeft < GEN.a3Lead || preGw) && left >= 2.4;
  if (a3Due && env.gateRoom >= 2.4) return a3Plan(rng, tier, env.trench);
  if (clocks && (gateNow || a3Due) && left >= gate.durMax) {
    // Both due: the gate segment carries the hazard in its approach when there is room for both.
    const both = a3Due && left >= gate.durMax + 1.2;
    return { tpl: gate, tier: Math.max(2, tier) as Tier, reason: 'wander', ...(both ? { a3: true } : {}) };
  }
  if (a3Due) return a3Plan(rng, tier, env.trench);
  const br = GEN.breather[phase];
  if (br && env.t >= c.breatherDueT && br.dur + 0.5 <= left) {
    const tpl = TEMPLATES[(GEN.breatherTemplate[area] ?? 'S_OPEN') as 'S_OPEN'] ?? open;
    return { tpl, tier: 0, dur: tpl === open ? br.dur : undefined, reason: 'breather' };
  }
  // A full-width hazard drawn early only after the A3 minimum.
  const allowFw = c.aClock + 1.0 >= c.lastFwA + a3Range(phase)[0];
  const a3Max = c.lastFwA + a3Range(phase)[1] - c.aClock;
  const room = left;
  const fits = (t: Template) => t.durMax <= room && (t.fullWidth ? allowFw : t.durMax + 1.6 <= a3Max || !clocks)
    && (t.fromT === undefined || env.t >= t.fromT)
    && (!t.drop || (c.datum - t.drop >= GEN.datum.min - 1e-6 && left >= GEN.datum.dropRoomSec));
  const pick = (list: readonly Template[]): Template | null => {
    const items = list.filter(fits).map((t) => [t, GEN.weights[t.id] ?? 1] as const).filter(([, w]) => w > 0);
    return items.length ? rng.weighted(items) : null;
  };
  let tpl = pick(templatesFor(area, tier));
  let tTier = tier;
  if (!tpl) tpl = pick(TIER_FALLBACK.filter((t) => t.tiers.includes(tier) && (GEN.weights[t.id] ?? 1) > 0 || (t.id === 'S_GATE' && tier >= 2)));
  if (!tpl) { tTier = 1; tpl = pick(templatesFor(area, 1)); }
  if (!tpl) {
    if (clocks && left >= gate.durMax && env.gateRoom < 4) return { tpl: gate, tier: Math.max(2, tier) as Tier, reason: 'wander' };
    return { tpl: open, tier: 0, dur: Math.max(GEN.open.minFiller, Math.min(room, GEN.open.dur[0])), reason: 'filler' };
  }
  if (!tpl.tiers.includes(tTier)) tTier = tpl.tiers.reduce((a, b) => (Math.abs(b - tier) < Math.abs(a - tier) ? b : a));
  void AREA_TEMPLATES; void GEN_FLAGS;
  return { tpl, tier: tTier, reason: 'draw' };
}
