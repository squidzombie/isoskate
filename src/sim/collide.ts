// sim/collide.ts: solid contacts (TECH §6.4; DESIGN §7 contact rules). FROZEN in M0: the validator (world/gen)
// prunes with exactly these rules, so W1a must not change them without an approved core-requests.md entry.
//  - Skater box HITBOX 0.40 × 0.70 × 1.50: s ± 0.35, x ± 0.20, board bottom y … y + 1.5.
//  - Crash faces are solids inset by FACE_INSET on every face (clamped to a quarter of the extent per axis, so a
//    0.05 m rail keeps a body).
//  - Swept classification at the first contact: the axis that started overlapping last (slab method, prev → cur).
//      from above (prev board bottom ≥ inset top): landable → lands on the top; crash → badLanding; knock → knock.
//        After rolling off a top's side (centre outside it), its body pushes the board out sideways instead.
//      lateral: side bump (push out at SIDE_BUMP_V, wobble 0.3, re-anchor targetX, `bump`); knock → knock.
//      frontal: knock → knock; crash → slam whenever the board is below the top (crash tops never skim);
//               landable with top − boardBottom ≤ STEP_UP → skim (y := top, airborne keeps vy ≥ 0, `bump`); else slam.
//  - God mode: crashes are emitted with god: true and the obstacle is passed through from then on.
import type { GroundHit, Obstacle, Solid } from '../core/world';
import { HITBOX, SIDE_BUMP_V, STEP_UP } from '../core/tuning';
import { insetOf } from '../world/gen';
import { BUMP_WOBBLE } from './consts';
import { SCORE, addBonus } from '../tricks';
import { modeOf, type Ctx } from './state';
import { touchdown } from './landing';
import { endManual } from './manual';

/** Inset of one axis: FACE_INSET, but never more than a quarter of the extent (one definition, shared with the
 *  validator: world/gen validator/path.ts). */
export { insetOf };

/** The inset crash box of a solid (scratch-free: plain numbers in a reused object). */
export interface Box { s0: number; s1: number; x0: number; x1: number; y0: number; y1: number }
export function insetBox(so: Solid, out: Box): Box {
  const b = so.box;
  const is = insetOf(b.s1 - b.s0), ix = insetOf(b.x1 - b.x0), iy = insetOf(b.y1 - b.y0);
  out.s0 = b.s0 + is; out.s1 = b.s1 - is; out.x0 = b.x0 + ix; out.x1 = b.x1 - ix; out.y0 = b.y0; out.y1 = b.y1 - iy;
  return out;
}

const I: Box = { s0: 0, s1: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
const HIT: GroundHit = { y: 0, layer: 0, surface: 'asphalt', slab: null, pit: null };
const HW = HITBOX.w / 2, HL = HITBOX.l / 2;

function knock(k: Ctx, ob: Obstacle): void {
  const st = k.st, c = st.cur;
  if (st.knocked.has(ob.id)) return;
  st.knocked.add(ob.id);
  k.ev.push({ t: 'knock', tick: c.tick, obstacleId: ob.id });
  addBonus(st.score, k.ev, c.tick, c.mode, 'knock', 'Knock', SCORE.bonus.knock, false);
}

function topSlab(ob: Obstacle, y: number) {
  for (const sl of ob.slabs) if (Math.abs(Math.max(sl.y0, sl.y1) - y) < 1e-6) return sl;
  return null;
}

export function collide(k: Ctx): void {
  const st = k.st, c = st.cur, pv = st.prev;
  if (c.mode === 'crashed') return;
  const grindOb = c.grind ? c.grind.obstacleId : -1;
  for (const ob of k.obs) {
    if (ob.s > c.p.s + HL + 0.5 || ob.s + ob.len < c.p.s - HL - 0.5) continue;
    if (ob.id === grindOb || st.ghosted.has(ob.id) || st.knocked.has(ob.id)) continue;
    for (const so of ob.solids) {
      insetBox(so, I);
      // Current box (it may have been moved by an earlier contact this tick).
      const hs0 = c.p.s - HL, hs1 = c.p.s + HL, hx0 = c.p.x - HW, hx1 = c.p.x + HW, hy0 = c.p.y, hy1 = c.p.y + HITBOX.h;
      if (!(hs1 > I.s0 && hs0 < I.s1 && hx1 > I.x0 && hx0 < I.x1 && hy1 > I.y0 && hy0 < I.y1)) continue;
      const ps0 = pv.p.s - HL, ps1 = pv.p.s + HL, px0 = pv.p.x - HW, px1 = pv.p.x + HW, py0 = pv.p.y;
      // Entry fraction per axis (−1: that axis was already overlapping at prev).
      const fs = ps1 <= I.s0 ? (I.s0 - ps1) / Math.max(1e-9, hs1 - ps1) : ps0 >= I.s1 ? 1 : -1;
      const fx = px1 <= I.x0 ? (I.x0 - px1) / Math.max(1e-9, hx1 - px1)
        : px0 >= I.x1 ? (px0 - I.x1) / Math.max(1e-9, px0 - hx0) : -1;
      const fy = py0 >= I.y1 ? (py0 - I.y1) / Math.max(1e-9, py0 - hy0) : -1;
      let axis: 's' | 'x' | 'y';
      if (fs < 0 && fx < 0 && fy < 0) {
        // Already inside at prev (e.g. after a snap): resolve along the smallest penetration.
        const penX = Math.min(hx1 - I.x0, I.x1 - hx0), penY = I.y1 - hy0;
        axis = penY <= penX ? 'y' : 'x';
      } else if (fy >= fs && fy >= fx) axis = 'y';
      else if (fs >= fx) axis = 's';
      else axis = 'x';
      const top = so.box.y1;
      if (so.top === 'knock') { knock(k, ob); break; }
      if (axis === 'y') {
        if (so.top === 'crash') { k.crash('badLanding', ob.id); if (modeOf(c) === 'crashed') return; break; }
        const b = so.box;
        // Rolled off this top's side (the centre left it): slide off, don't re-land. Without this, a slow drift off a
        // ledge would land on its top again every few ticks (each a land event), nudged back by the rule below.
        if (c.mode === 'air' && st.air.reason === 'rollOff' && Math.abs(st.air.takeoffY - top) < 1e-6
          && (c.p.x < b.x0 || c.p.x > b.x1)) {
          const out = c.p.x < b.x0 ? -1 : 1;
          c.p.x = out < 0 ? I.x0 - HW - 1e-3 : I.x1 + HW + 1e-3;
          c.targetX = out < 0 ? Math.min(c.targetX, c.p.x) : Math.max(c.targetX, c.p.x);   // re-anchor: no pull back in
          continue;
        }
        // Landable top from above: the board lands on it; the centre is nudged onto the supported side.
        if (c.p.x < b.x0 + 0.02) c.p.x = b.x0 + 0.02;
        if (c.p.x > b.x1 - 0.02) c.p.x = b.x1 - 0.02;
        c.p.y = top;
        const sl = topSlab(ob, top);
        HIT.y = top; HIT.layer = sl?.layer ?? 0; HIT.surface = sl?.surface ?? c.surface; HIT.slab = sl; HIT.pit = null;
        if (c.mode === 'air') { touchdown(k, HIT); if (modeOf(c) === 'crashed') return; } else c.groundY = top;
        continue;
      }
      if (axis === 's') {
        if (so.top === 'landable' && top - c.p.y <= STEP_UP + 1e-9) {
          c.p.y = top;                                     // skim onto the top: never a crash, in any mode
          if (c.mode === 'air') c.vel.y = Math.max(0, c.vel.y);
          else c.groundY = top;
          k.ev.push({ t: 'bump', tick: c.tick, side: c.p.x < (so.box.x0 + so.box.x1) / 2 ? -1 : 1, kind: ob.kind });
          if (c.mode === 'manual') endManual(k, 'bump');
          continue;
        }
        k.crash('slam', ob.id);                            // crash tops never skim
        if (modeOf(c) === 'crashed') return;
        break;
      }
      // Lateral entry: side bump, harmless.
      const side: -1 | 1 = px1 <= I.x0 ? -1 : px0 >= I.x1 ? 1 : c.p.x < (I.x0 + I.x1) / 2 ? -1 : 1;
      c.p.x = side < 0 ? I.x0 - HW - 1e-3 : I.x1 + HW + 1e-3;
      c.vel.x = side * SIDE_BUMP_V;
      c.targetX = c.p.x;
      c.wobble = Math.max(c.wobble, BUMP_WOBBLE);
      k.ev.push({ t: 'bump', tick: c.tick, side, kind: ob.kind });
      if (c.mode === 'manual') endManual(k, 'bump');
    }
  }
}
