// world/gen/templates/util.ts: small helpers shared by the template scripts.
import { clamp, round1cm } from '../../../core/math';
import { sAt, speedAt, tAt } from '../../../core/tuning';
import type { Obstacle } from '../../../core/world';
import { GEN } from '../gen.config';
import { buildBench, buildFlatbar, buildPad } from '../props/shared';
import type { TemplateCtx } from './types';

export const sOf = (t: number): number => round1cm(sAt(t));
/** Metres covered in `sec` seconds from run time t. */
export const lenSec = (t: number, sec: number): number => sAt(t + sec) - sAt(t);
export const vAt = (t: number): number => speedAt(t);
/** Time of an s. */
export const tOf = (s: number): number => tAt(s);
/** Earliest time a forced hazard's response may start: the head rule and the spacing from the previous action. */
export const actFrom = (c: TemplateCtx): number => Math.max(c.t0 + GEN.noActionHead, c.earliest);
/** First time content may stand in the street (non-forcing trick elements): just after the head window. */
export const contentFrom = (c: TemplateCtx): number => c.t0 + GEN.noActionHead;
/** The template end: `pad` seconds after the last obstacle ends (the tail rule needs ≥ 0.4 s of nothing to do). */
export function endAfter(c: TemplateCtx, pad = 0.6): number {
  let sEnd = sAt(c.t0) + 0.1;
  for (const o of c.obstacles) sEnd = Math.max(sEnd, o.s + o.len);
  return tAt(sEnd) + pad;
}
export const side = (c: TemplateCtx): 1 | -1 => (c.rng.chance(0.5) ? 1 : -1);
/** Push and return (chainable placement). */
export function put<T extends Obstacle>(c: TemplateCtx, ob: T): T { c.obstacles.push(ob); return ob; }
/** Coins along every non-pickOnly edge of an obstacle (or the first `n`). */
export function edgeCoins(c: TemplateCtx, ob: Obstacle, n = 1): void {
  for (const e of ob.edges.slice(0, n)) c.coins.edge(e);
}
/** The road half-width of the area layout (|x| of the curbs, or the corridor when curb-free). */
export const roadHalf = (c: TemplateCtx): number => c.layout.curbX ?? 4.2;

/** (G1 flow) A template's second beat: one more trick element after its main one, so a line chains (grind → manual,
 *  grind → hop → grind) instead of ending in empty road. `after` is the obstacle the rider leaves (its edges' exit
 *  zones: a crash-faced beat starts ≥ GEN.beat.clearSec after its end or ≥ 1.8 m to the side; a pad's bump top is no
 *  crash face, so it may follow at once). Chance GEN.beat.chance; returns the beat or null. */
export function secondBeat(c: TemplateCtx, after: Obstacle): Obstacle | null {
  if (!c.rng.chance(GEN.beat.chance)) return null;
  const rh = (c.layout.lip ? 2.6 : roadHalf(c)) - 0.7;
  const tEnd = tAt(after.s + after.len);
  const ex = clamp(after.x, -rh, rh);
  const kind = c.rng.weighted(GEN.beat.kinds[c.area] ?? GEN.beat.kinds.downtown!);
  if (kind === 'pad') {
    const x = round1cm(clamp(ex + c.rng.range(-0.6, 0.6), -rh + 0.3, rh - 0.3));
    const pad = put(c, buildPad(sOf(tEnd + c.rng.range(GEN.beat.padAfter[0], GEN.beat.padAfter[1])), x, clamp(c.v * c.rng.range(0.4, 0.55), 3, 6), c.props));
    c.coins.string(pad.s + 0.4, pad.s + pad.len - 0.4, x, c.datum + 0.15 + GEN.coins.padUp, c.v);
    return pad;
  }
  // A bench / flat bar 1.8–2.6 m to the side of the exit (toward the centre when there is no room outside).
  let x = ex + (c.rng.chance(0.5) ? 1 : -1) * c.rng.range(1.8, 2.6);
  if (Math.abs(x) > rh) x = ex - Math.sign(x - ex) * Math.abs(x - ex);
  if (Math.abs(x) > rh) return null;
  const tA = tEnd + c.rng.range(GEN.beat.sideAfter[0], GEN.beat.sideAfter[1]);
  const ob = kind === 'bench' ? buildBench(sOf(tA), round1cm(x), c.props)
    : buildFlatbar(sOf(tA), round1cm(x), round1cm(clamp(c.v * c.rng.range(0.6, 1.0), 3, 10)), round1cm(c.rng.range(0.35, 0.42)), c.props);
  put(c, ob);
  c.coins.edge(ob.edges[0]!);
  return ob;
}
