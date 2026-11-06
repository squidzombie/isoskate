// world/gen/props/suburbs.ts: Suburbs builders (DESIGN §10.3): garden walls (grind / manual tops), hedges and picket
// fences that narrow the street (tall, side bump only), mailboxes and wheelie-bin pairs (fillers). Parked cars and vans
// come from props/downtown.ts (buildParkedCar, area-sized).
import type { Obstacle } from '../../../core/world';
import { ObTag } from '../../../core/world';
import { buildProp, buildTall, lowGround, type PropCtx } from './common';

/** Garden wall 3–10 × 0.4 × 0.50: landable top, both long edges grindable. */
export function buildGardenWall(s: number, x: number, len: number, p: PropCtx, tags: number = ObTag.TrickLine, landmark?: string): Obstacle {
  return buildProp({ kind: 'garden_wall', s, x, len: Math.max(3, len), wid: 0.4, hgt: 0.5, ground: lowGround(x, 0.4, p), tags,
    surface: 'concrete', landmark, edges: [{ side: -1, kind: 'ledge', material: 'concrete' }, { side: 1, kind: 'ledge', material: 'concrete' }] }, p);
}

/** Hedge or picket fence along s (0.4 wide, 1.2–1.4 tall): narrows the street; its faces are side bumps. */
export function buildHedge(s: number, x: number, len: number, p: PropCtx, picket = false, variant = 0): Obstacle {
  return buildTall(picket ? 'picket_fence' : 'hedge', s, x, len, 0.4, picket ? 1.2 : 1.35, p, { variant });
}

export const buildMailbox = (s: number, x: number, p: PropCtx, variant = 0) => buildTall('mailbox', s, x, 0.4, 0.4, 1.2, p, { variant });
/** A wheelie-bin pair: 0.7 along s × 1.5 across (DESIGN §10.3). */
export const buildBins = (s: number, x: number, p: PropCtx, variant = 0) => buildTall('wheelie_bins', s, x, 0.7, 1.5, 1.2, p, { variant });
