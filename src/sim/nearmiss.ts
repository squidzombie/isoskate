// sim/nearmiss.ts: Near Miss (DESIGN §7, §13.3; TECH §6.4). Every crash-top obstacle the board passes: if it came
// within NEAR_MISS.lat laterally of a crash face, or cleared a crash top by less than NEAR_MISS.vert, and never touched
// it, it pays once when the board has passed its far end. Inside a combo +75 (flat) and the link window refreshes
// (never the heat, no link); outside a combo +25, banked directly (it does not start a combo).
import { HITBOX, NEAR_MISS } from '../core/tuning';
import { SCORE, addBonus, refreshWindow } from '../tricks';
import { insetBox, type Box } from './collide';
import { NEAR_CAP, type Ctx } from './state';

const I: Box = { s0: 0, s1: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
const HW = HITBOX.w / 2, HL = HITBOX.l / 2;
const EPS = 1e-9;

function slot(k: Ctx, id: number): number {
  const ids = k.st.near.ids;
  for (let i = 0; i < ids.length; i++) if (ids[i] === id) return i;
  return -1;
}

function add(k: Ctx, id: number, sEnd: number, side: number, contact: boolean): void {
  const n = k.st.near;
  if (n.ids.length >= NEAR_CAP) return;
  n.ids.push(id); n.sEnd.push(sEnd); n.side.push(side); n.contact.push(contact);
}

function remove(k: Ctx, i: number): void {
  const n = k.st.near, last = n.ids.length - 1;
  n.ids[i] = n.ids[last]!; n.sEnd[i] = n.sEnd[last]!; n.side[i] = n.side[last]!; n.contact[i] = n.contact[last]!;
  n.ids.length = last; n.sEnd.length = last; n.side.length = last; n.contact.length = last;
}

/** collide(): the board touched this obstacle (a side bump): no near miss for it. */
export function nearTouch(k: Ctx, obstacleId: number, sEnd: number): void {
  const i = slot(k, obstacleId);
  if (i >= 0) k.st.near.contact[i] = true;
  else add(k, obstacleId, sEnd, 1, true);
}

/** One tick, after collisions. */
export function nearMiss(k: Ctx): void {
  const st = k.st, c = st.cur, n = st.near;
  if (c.mode === 'crashed') return;
  const hs0 = c.p.s - HL, hs1 = c.p.s + HL, hx0 = c.p.x - HW, hx1 = c.p.x + HW, hy0 = c.p.y;
  const grindOb = c.grind ? c.grind.obstacleId : -1;
  for (const ob of k.obs) {
    if (ob.s > hs1 + 0.5 || ob.s + ob.len < hs0 - 0.5 || ob.id === grindOb || st.ghosted.has(ob.id) || st.knocked.has(ob.id)) continue;
    if (slot(k, ob.id) >= 0) continue;
    let close = false, sEnd = -Infinity, cx = 0;
    for (const so of ob.solids) {
      if (so.top !== 'crash') continue;
      insetBox(so, I);
      sEnd = Math.max(sEnd, I.s1);
      if (hs1 <= I.s0 || hs0 >= I.s1) continue;          // not alongside it yet / any more
      const lat = Math.max(I.x0 - hx1, hx0 - I.x1);
      if ((lat > 0 && lat <= NEAR_MISS.lat + EPS) || (lat <= 0 && hy0 >= I.y1 && hy0 - I.y1 <= NEAR_MISS.vert + EPS)) {
        close = true; cx = (I.x0 + I.x1) / 2;
      }
    }
    if (close) add(k, ob.id, sEnd, cx >= c.p.x ? 1 : -1, false);
  }
  for (let i = n.ids.length - 1; i >= 0; i--) {
    if (hs0 < n.sEnd[i]! - EPS) continue;
    const id = n.ids[i]!, side = n.side[i]! < 0 ? -1 : 1, touched = n.contact[i]!;
    remove(k, i);
    if (touched) continue;
    const sc = st.score;
    k.ev.push({ t: 'nearMiss', tick: c.tick, obstacleId: id, side });
    if (sc.combo.active) {
      addBonus(sc, k.ev, c.tick, c.mode, 'nearMiss', 'Near Miss', SCORE.bonus.nearMissCombo, true);
      refreshWindow(sc);
    } else addBonus(sc, k.ev, c.tick, c.mode, 'nearMiss', 'Near Miss', SCORE.bonus.nearMissSolo, false);
  }
}
