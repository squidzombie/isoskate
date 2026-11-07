// sim/bonus.ts: gap and landmark bonuses (DESIGN §13.3). Both are flat bonuses inside the combo (no link, no decay).
//  - Gap (`Obstacle.gap`, tagged by templates), paid once per obstacle per run when an air ends:
//      with `fromObstacle`: the air started on that obstacle (its top or its edge) and ended on this one (landing on its
//        top or locking onto its edge): Ledge Hop, Bench Hop, Planter Gap;
//      without, the air started on this obstacle: a drop (Dock / Skywalk / Bridge Drop), paid when the landing is at
//        least RULES.dropGapMinH lower;
//      without, otherwise: the air spanned the whole obstacle (took off before it, came down past it) over its lateral
//        extent: Trench / Ditch / Plate Gap (not via the plank: rolling on the plank is no air), stair sets, hops.
//  - Landmark (`Obstacle.landmark`): the first trick on the area's landmark per visit (a grind on it, a manual on it, or
//    an air trick that took off from or landed on it), +300. The visit list resets at every area entry.
import { HITBOX } from '../core/tuning';
import { RULES, SCORE, addBonus } from '../tricks';
import type { Ctx } from './state';

/** An air ended on obstacle `landOb` (−1: the street) at height `landY`; `grind`: it ended in a grind lock. */
export function airEndsOn(k: Ctx, landOb: number, landY: number, grind = true): void {
  const st = k.st, c = st.cur, a = st.air;
  for (const ob of k.obstaclesIn(Math.min(a.takeoffS, c.p.s) - 1, c.p.s + 1)) {
    const gp = ob.gap;
    if (!gp || st.gapped.has(ob.id)) continue;
    let paid: boolean;
    if (gp.fromObstacle !== undefined) paid = a.fromOb === gp.fromObstacle && landOb === ob.id;
    else if (a.fromOb === ob.id) paid = a.takeoffY - landY >= RULES.dropGapMinH - 1e-9;
    else {
      const xm = (a.takeoffX + c.p.x) / 2;
      paid = a.takeoffS <= ob.s && c.p.s >= ob.s + ob.len && Math.abs(xm - ob.x) <= ob.wid / 2 + HITBOX.w / 2;
    }
    if (!paid) continue;
    st.gapped.add(ob.id);
    addBonus(st.score, k.ev, c.tick, c.mode, 'gap', gp.name, gp.pts, true);
  }
  const tricked = grind || c.airTricks.some((id) => id !== 'ollie');
  if (tricked) { payLandmark(k, landOb); payLandmark(k, a.fromOb); }
}

/** The first trick on a landmark obstacle this area visit pays the Landmark bonus. */
export function payLandmark(k: Ctx, obId: number): void {
  if (obId < 0) return;
  const st = k.st, ob = k.world.obstacle(obId);
  if (!ob?.landmark || st.landmarksPaid.includes(ob.landmark)) return;
  st.landmarksPaid.push(ob.landmark);
  k.ev.push({ t: 'landmark', tick: st.cur.tick, name: ob.landmark });
  addBonus(st.score, k.ev, st.cur.tick, st.cur.mode, 'landmark', ob.landmark, SCORE.bonus.landmark, true);
}
