// world/gen/schedule.ts: what the next segment is (DESIGN §10.5, §10.7, §11, §12): the Roll-out / Lesson Line, the
// gateways at their timeline times, cut-down fillers before them, datum payback (S_INCLINE_UP), the A3 full-width
// hazard scheduler, the anti-straight row by its deadline (rows.ts), breathers, and the tier-weighted draw (area v1
// templates plus the drawn shared ones; the tier-parametric shared templates when an area has none of that tier).
// Pure functions of the cursor and the layout RNG.
import type { AreaId, GatewayId } from '../../core/ids';
import type { Sfc32 } from '../../core/rng';
import { FIRST_VISIT_SEC, GATEWAY_AFTER, GATEWAY_SEC, VISIT_SEC, areaAtTime } from './areas';
import type { GenCursor } from './cursor';
import { GEN, PHASES, type PhaseId, type Tier } from './gen.config';
import { TEMPLATES, TIER_FALLBACK, templatesFor, type Template } from './templates';

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
/** a3: the gate segment also carries the A3 full-width hazard (both deadlines at once). slip: a long template drawn
 *  when the row is not yet due: no row overlay, the row follows it (the deadline slips by ≤ its length). */
export interface Plan { tpl: Template; tier: Tier; dur?: number; reason: PlanReason; a3?: boolean; slip?: boolean }

/** The A3 hazard: S_TRENCH (when enabled) or S_BARRIER (area skins); in Neon from T3 on, sometimes NE_GAUNTLET (its
 *  holo gate is the full-width hazard, after the rail transfer). */
export function a3Plan(rng: Sfc32, tier: Tier, trench: boolean, area?: AreaId, left = Infinity): Plan {
  const g = TEMPLATES.NE_GAUNTLET!;
  if (area === 'neon' && tier >= 3 && left >= g.durMax && rng.chance(GEN.a3Gauntlet)) return { tpl: g, tier: 4, reason: 'a3' };
  const useTrench = trench && rng.chance(GEN.a3Trench);
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

/** The template for the next procedural segment (before instantiation and validation). Priorities: the cut-down
 *  filler before a gateway, datum payback, the A3 hazard (from its minimum, by its maximum), the anti-straight row
 *  (by its deadline: overlaid on the template that holds it, else an S_GATE), a due breather (when the row can still
 *  follow it in time), then the tier-weighted draw. */
export function planSegment(c: GenCursor, env: PlanEnv, rng: Sfc32): Plan {
  const { area, phase, left } = env;
  const open = TEMPLATES.S_OPEN!;
  if (left < GEN.minTemplateSec) return { tpl: open, tier: 0, dur: left, reason: 'filler' };
  if (env.force === 'filler') return { tpl: open, tier: 0, dur: Math.min(left, GEN.open.dur[0]), reason: 'filler' };
  if (c.datum < -1e-6 && left <= GEN.datum.paybackSec) return { tpl: TEMPLATES.S_INCLINE_UP!, tier: 0, reason: 'payback' };
  const tier = drawTier(phase, rng, c.lastTier);
  const clocks = env.t >= c.clockFromT - 1e-9;
  const gate = TEMPLATES.S_GATE!;
  // The row is due now (S_GATE) when the next one can start no later; the first segment of a run (after the Roll-out,
  // or at a startT) is a gate whose row opens at the line, inside the spawn grace.
  const gateNow = env.force === 'wander' || env.gateRoom < 0.6 || (clocks && !Number.isFinite(c.lastRowT) && env.t < c.clockFromT + 0.5);
  // A3 (DESIGN §10.7): a full-width hazard every [min, max] of A-time; never before the minimum (the hazard stands
  // ~1 s into its template); due at its drawn time or when a drawn template could overrun the maximum. Before a
  // gateway (T0: the clock pauses) the last slot that fits takes it when the maximum would fall soon after it.
  const [a3Lo, a3Hi] = a3Range(phase);
  const a3MaxLeft = c.lastFwA + a3Hi - c.aClock;
  const a3Min = c.aClock + 1.0 >= c.lastFwA + a3Lo;
  const preGw = left < GEN.a3PreGwLeft && a3MaxLeft - left < GEN.a3PreGw;
  // (the last slot before a gateway may come up to a3PreGwEarly s before the minimum, or the maximum would fall in it)
  const preGwOK = preGw && c.aClock + 1.0 >= c.lastFwA + a3Lo - GEN.a3PreGwEarly;
  const a3Due = clocks && left >= 2.4 && (env.force === 'a3' || preGwOK || (a3Min && (c.aClock + 0.5 >= c.fwDueA || a3MaxLeft < GEN.a3Lead)));
  if (a3Due && env.gateRoom >= 2.4) return a3Plan(rng, tier, env.trench, area, Math.min(left, env.gateRoom + 2.3));
  if (clocks && (gateNow || a3Due) && left >= gate.durMax) {
    // Both due: the gate segment carries the hazard in its approach when there is room for both.
    // (Not in a run's first 12 s: its first rows must stand on time for the straight-bot guarantee.)
    const both = a3Due && left >= gate.durMax + 1.2 && env.t >= c.clockFromT + GEN.gate.combineAfter;
    return { tpl: gate, tier: Math.max(2, tier) as Tier, reason: 'wander', ...(both ? { a3: true } : {}) };
  }
  if (a3Due) return a3Plan(rng, tier, env.trench, area, Math.min(left, env.gateRoom + 2.3));
  // A due breather (T0: the A-clocks pause; the row comes right after it).
  const br = GEN.breather[phase];
  if (br && env.t >= c.breatherDueT && br.dur + 0.5 <= left && !gateNow) {
    const tpl = TEMPLATES[(GEN.breatherTemplate[area] ?? 'S_OPEN') as 'S_OPEN'] ?? open;
    return { tpl, tier: 0, dur: tpl === open ? br.dur : undefined, reason: 'breather' };
  }
  // The draw. A template longer than the room before the row must start hosts no row: it may slip the row deadline
  // by ≤ its length (after the opening phase and a run's first 12 s, whose rows the straight-bot guarantees need on
  // time, and not right before a gateway) when the row is not due yet. A full-width hazard only after the A3 minimum.
  const slip = (t: Template) => clocks && t.durMax > env.gateRoom + GEN.gate.slipPad;
  const slipOK = (t: Template) => phase !== 'opening' && env.t >= c.clockFromT + GEN.gate.combineAfter && env.gateRoom >= 0.6
    && left >= t.durMax + GEN.gate.slipGwRoom;
  const fits = (t: Template) => t.durMax <= left && (!slip(t) || slipOK(t)) && (t.fullWidth ? a3Min : t.durMax + 1.6 <= a3MaxLeft || !clocks)
    && (t.fromT === undefined || env.t >= t.fromT)
    && (!t.drop || (c.datum - t.drop >= GEN.datum.min - 1e-6 && left >= GEN.datum.dropRoomSec));
  // An area's landmark not seen yet this visit is drawn more often (DESIGN §10.4: each area's landmark is v1 content).
  const w8 = (t: Template) => (GEN.weights[t.id] ?? 1) * (!c.landmarkDone && GEN.landmarks[area] === t.id ? GEN.landmarkBoost : 1);
  const pick = (list: readonly Template[]): Template | null => {
    const items = list.filter(fits).map((t) => [t, w8(t)] as const).filter(([, w]) => w > 0);
    return items.length ? rng.weighted(items) : null;
  };
  let tpl = pick(templatesFor(area, tier));
  let tTier = tier;
  if (!tpl) tpl = pick(TIER_FALLBACK.filter((t) => t.tiers.includes(tier) && ((GEN.weights[t.id] ?? 1) > 0 || (t.id === 'S_GATE' && tier >= 2))));
  if (!tpl) { tTier = 1; tpl = pick(templatesFor(area, 1)); }
  if (!tpl) {
    if (clocks && left >= gate.durMax && env.gateRoom < 4) return { tpl: gate, tier: Math.max(2, tier) as Tier, reason: 'wander' };
    return { tpl: open, tier: 0, dur: Math.max(GEN.open.minFiller, Math.min(left, GEN.open.dur[0])), reason: 'filler' };
  }
  if (!tpl.tiers.includes(tTier)) tTier = tpl.tiers.reduce((a, b) => (Math.abs(b - tier) < Math.abs(a - tier) ? b : a));
  return { tpl, tier: tTier, reason: 'draw', ...(slip(tpl) ? { slip: true } : {}) };
}
