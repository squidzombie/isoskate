// sim/magnet.ts: air magnet, ground align and the grind pick window (TECH §6.6; DESIGN §6.3). FROZEN in M0.
// The magnet and the ground align steer only by moving targetX (never by adding acceleration), so the player's
// steering and the magnet never fight: the normal lateral controller carries the skater in.
//  - Magnet: in the air, toward the predicted non-pickOnly candidate edge (min lateral offset at its crossing):
//    rate = rateMax · clamp((range − |dx|)/(range − inner), 0, 1); after leaving an edge (transferArmed) the transfer
//    range/rate. Cancelled for the rest of the jump by ≥ cancelDragM of net steering away from the edge, counting only
//    steering that consumed swipes did not remove.
//  - Ground align: rolling on a collision course with a non-pickOnly grindable 0.2–1.0 s ahead → targetX eases
//    toward its nearest edge axis at ≤ 1.5 m/s. It never creates a collision course.
//  - Pick window: opens when the predicted capture is ≤ GRIND.pickBefore away and closes GRIND.pickAfter after lock
//    (or when the capture is no longer predicted). While open, interpret turns every swipe into a pick.
import type { Dir8 } from '../core/ids';
import { approach, clamp } from '../core/math';
import { DT, FACE_INSET, GRIND, GROUND_ALIGN, HITBOX, MAGNET, STEP_UP, TARGET_X_MAX } from '../core/tuning';
import type { Ctx } from './state';
import { edgeX } from './predict';

export function magnet(k: Ctx, applied: number): void {
  const st = k.st, c = st.cur, pr = st.pred;
  if (c.mode !== 'air' || c.magnetCancelled || pr.magnetEdge < 0) { c.magnetEdge = null; return; }
  const dx = pr.magnetX - c.p.x;
  if (Math.abs(dx) > 1e-6) st.air.steerAway -= Math.sign(dx) * applied;
  if (st.air.steerAway >= MAGNET.cancelDragM - 1e-9) { c.magnetCancelled = true; c.magnetEdge = null; return; }
  const range = c.transferArmed ? MAGNET.transferRange : MAGNET.range;
  const rateMax = c.transferArmed ? MAGNET.transferRate : MAGNET.rateMax;
  const rate = rateMax * clamp((range - Math.abs(dx)) / (range - MAGNET.inner), 0, 1);
  c.targetX = clamp(approach(c.targetX, pr.magnetX, rate * DT), -TARGET_X_MAX, TARGET_X_MAX);
  c.magnetEdge = pr.magnetEdge;
}

export function groundAlign(k: Ctx): void {
  const c = k.st.cur;
  if (c.mode !== 'roll') return;
  const front = c.p.s + HITBOX.l / 2, vs = c.vel.s;
  const hx0 = c.p.x - HITBOX.w / 2, hx1 = c.p.x + HITBOX.w / 2;
  let best = Infinity, axis = 0;
  for (const ob of k.obs) {
    if (!ob.edges.length) continue;
    const tHit = (ob.s + FACE_INSET - front) / vs;
    if (tHit < GROUND_ALIGN.tMin || tHit > GROUND_ALIGN.tMax || tHit >= best) continue;
    let course = false;
    for (const so of ob.solids) {
      const b = so.box;
      if (b.y1 - c.p.y <= STEP_UP) continue;                  // a bump or a skim: no collision course
      if (hx1 > b.x0 + FACE_INSET && hx0 < b.x1 - FACE_INSET) { course = true; break; }
    }
    if (!course) continue;
    let near = Infinity;
    for (const e of ob.edges) {
      if (e.pickOnly) continue;
      const ex = edgeX(e, Math.max(c.p.s, e.a.s));
      if (Math.abs(ex - c.p.x) < Math.abs(near - c.p.x)) near = ex;
    }
    if (near === Infinity) continue;
    best = tHit; axis = near;
  }
  if (best !== Infinity) c.targetX = clamp(approach(c.targetX, axis, GROUND_ALIGN.rateMax * DT), -TARGET_X_MAX, TARGET_X_MAX);
}

function closeWindow(k: Ctx): void {
  const st = k.st, c = st.cur, pk = st.pick;
  if (!pk.open) return;
  k.ev.push({ t: 'pickWindow', tick: c.tick, edgeId: pk.edgeId, open: false });
  pk.open = false; pk.dirs.length = 0; pk.tick = -1;
  c.pickWindow = null;
}

export function updatePickWindow(k: Ctx): void {
  const st = k.st, c = st.cur, pk = st.pick, pr = st.pred;
  if (c.mode === 'grind' && c.grind) {
    if (pk.open && (c.tick - c.grind.lockTick) * DT > GRIND.pickAfter + 1e-9) closeWindow(k);
    return;
  }
  if (c.mode !== 'air') { closeWindow(k); return; }
  const due = pr.captureEdge >= 0 && pr.tCapture <= GRIND.pickBefore + 1e-9;
  if (!due) { closeWindow(k); return; }
  if (!pk.open) {
    pk.open = true; pk.edgeId = pr.captureEdge; pk.dirs.length = 0; pk.tick = -1;
    k.ev.push({ t: 'pickWindow', tick: c.tick, edgeId: pk.edgeId, open: true });
  } else pk.edgeId = pr.captureEdge;
  c.pickWindow = { edgeId: pk.edgeId, tCapture: c.t + pr.tCapture };
}

/** A swipe inside the window: a repeat of the same direction makes a double (←← Lipslide); a new one replaces it. */
export function addPick(k: Ctx, dir: Dir8): void {
  const pk = k.st.pick;
  if (pk.dirs.length > 0 && pk.dirs[0] === dir && pk.dirs.length < 2) pk.dirs.push(dir);
  else { pk.dirs.length = 0; pk.dirs.push(dir); }
  pk.tick = k.st.cur.tick;
}
