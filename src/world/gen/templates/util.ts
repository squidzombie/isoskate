// world/gen/templates/util.ts: small helpers shared by the template scripts.
import { round1cm } from '../../../core/math';
import { sAt, speedAt, tAt } from '../../../core/tuning';
import type { Obstacle } from '../../../core/world';
import { GEN } from '../gen.config';
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
