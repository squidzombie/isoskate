// sim/predict.ts: the airLeft prediction (TECH §6.5). Each air tick, integrate the current arc forward with DT
// (≤ 90 steps) against groundAt, and find the soonest predicted grind capture along it (TECH §6.6 capture bands).
// Used for the late-flip cutoff, upgrade refusal, the jump buffer, the pick window, the magnet candidate, dropH and
// the HUD's predicted-landing tint. Lateral position is held at the current x (the magnet and steering may still
// move it; the prediction is refreshed every tick).
import type { GrindEdge } from '../core/world';
import { CAPTURE, DT, G, MAGNET, sAt } from '../core/tuning';
import type { Ctx } from './state';

export const PREDICT_MAX_STEPS = 90;

export const edgeU = (e: GrindEdge, s: number): number => (e.b.s - e.a.s > 1e-9 ? Math.min(1, Math.max(0, (s - e.a.s) / (e.b.s - e.a.s))) : 0);
export const edgeX = (e: GrindEdge, s: number): number => e.a.x + (e.b.x - e.a.x) * edgeU(e, s);
export const edgeY = (e: GrindEdge, s: number): number => e.a.y + (e.b.y - e.a.y) * edgeU(e, s);

/** Lateral reach for capture prediction: curb-class edges 0.6 m (no magnet); others the magnet range (or 0.9 when
 *  the magnet is cancelled). */
export function captureReach(e: GrindEdge, magnet: boolean, transfer: boolean): number {
  if (e.pickOnly) return CAPTURE.latPickOnly;
  if (!magnet) return CAPTURE.lat;
  return transfer ? MAGNET.transferRange : MAGNET.range;
}

/** First tick offset j (0 = now) at which the arc is inside the edge's capture band, or −1. */
function captureStep(e: GrindEdge, s0t: number, y0: number, vy0: number, jMax: number, sNow: number): number {
  for (let j = 0; j <= jMax; j++) {
    const tau = j * DT;
    const s = j === 0 ? sNow : sAt(s0t + tau);
    if (s < e.a.s) continue;
    if (s > e.b.s) return -1;
    const vy = vy0 - G * tau;
    if (vy > CAPTURE.vyMax) continue;
    const y = y0 + vy0 * tau - 0.5 * G * tau * tau;
    const ey = edgeY(e, s);
    if (y <= ey + CAPTURE.above && y >= ey - CAPTURE.below) return j;
    if (y < ey - CAPTURE.below) return -1;
  }
  return -1;
}

export function predict(k: Ctx): void {
  const st = k.st, c = st.cur, pr = st.pred;
  pr.captureEdge = -1; pr.tCapture = Infinity; pr.magnetEdge = -1;
  if (c.mode !== 'air') { pr.tLand = 0; pr.landY = c.groundY; c.airLeft = 0; c.dropH = 0; return; }
  // Touchdown: first step whose board bottom is at or below the ground it was above.
  let yPrev = c.p.y, tLand = PREDICT_MAX_STEPS * DT, landY = c.groundY, jLand = PREDICT_MAX_STEPS;
  for (let j = 1; j <= PREDICT_MAX_STEPS; j++) {
    const tau = j * DT;
    const y = c.p.y + c.vel.y * tau - 0.5 * G * tau * tau;
    const g = k.world.groundAt(sAt(c.t + tau), c.p.x, yPrev + 1e-6);
    if (y <= g.y + 1e-9) { tLand = tau; landY = g.y; jLand = j; break; }
    yPrev = y;
  }
  pr.tLand = tLand; pr.landY = landY;
  // Capture candidates along the arc.
  const magnet = !c.magnetCancelled;
  let bestDx = Infinity, tAir = tLand;
  for (const ob of k.obs) {
    for (const e of ob.edges) {
      if (e.b.s < c.p.s || e.a.s > c.p.s + c.vel.s * tLand + 0.5) continue;
      const sRef = Math.max(c.p.s, e.a.s);
      const dx = Math.abs(edgeX(e, sRef) - c.p.x);
      if (dx > captureReach(e, magnet, c.transferArmed)) continue;
      const j = captureStep(e, c.t, c.p.y, c.vel.y, jLand, c.p.s);
      if (j < 0) continue;
      const tc = j * DT;
      if (tc < pr.tCapture) { pr.tCapture = tc; pr.captureEdge = e.id; }
      if (!e.pickOnly) {
        if (magnet && dx < bestDx) { bestDx = dx; pr.magnetEdge = e.id; pr.magnetX = edgeX(e, sAt(c.t + tc)); }
        if ((magnet || dx <= CAPTURE.lat) && tc < tAir) tAir = tc;
      }
    }
  }
  c.airLeft = tAir;
  c.dropH = st.air.takeoffY - landY;
}
