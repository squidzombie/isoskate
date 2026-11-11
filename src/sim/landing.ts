// sim/landing.ts: touchdown and capture judgement (TECH §6.5; DESIGN §7). Bands FROZEN in M0.
// Rotation progress p = the worse of the rotating flip and spin (finished ones count 1):
//   p = 1      → clean; Perfect if every rotation finished in the air and the last within LAND.perfectLast before touchdown
//   p ≥ 0.80   → clean (the rest snaps in 0.06 s, never Perfect)
//   p ≥ 0.55   → sketchy (0.40 in the first runs): that air's tricks ×0.5, wobble, the combo banks at once
//   otherwise  → bail = crash 'badLanding'
// Carve angle, landing yaw and drop height never cause a crash. On a ground touchdown: a 180 lands fakie and reverts
// (+50, +1 link if the spin linked); the board centre within LAND.edgeNudge of a raised top's side edge is nudged
// onto the top; a pre-press (the press went down 0.30–0.10 s before touchdown and is still down) or a grab still held
// rolls into a manual; a buffered tap ollies at once; gaps and landmarks pay (sim/bonus.ts).
import type { GroundHit, GroundSlab } from '../core/world';
import { DT, LAND, MANUAL } from '../core/tuning';
import { SCORE, addBonus, addLink, addTrick, bank, openWindow } from '../tricks';
import type { Ctx } from './state';
import { setGround } from './ground';
import { isHalfSpin, pop } from './air';
import { airEndsOn } from './bonus';
import { startManual } from './manual';

export type Quality = 'clean' | 'perfect' | 'sketchy' | 'bail';

const EPS = 1e-9;

/** Judge the rotations of the current air at this tick. */
export function judge(k: Ctx): { p: number; quality: Quality } {
  const st = k.st, c = st.cur;
  const pf = c.flip ? Math.min(1, c.flip.t / c.flip.dur) : 1;
  const ps = c.spin ? Math.min(1, c.spin.t / c.spin.dur) : 1;
  const p = Math.min(pf, ps);
  const bail = st.cfg.firstRuns ? LAND.sketchyFirstRuns : LAND.sketchy;
  let quality: Quality;
  if (p >= 1 - EPS) {
    const rotated = !!c.flip || !!c.spin;
    quality = rotated && st.air.lastDoneTick >= 0 && (c.tick - st.air.lastDoneTick) * DT <= LAND.perfectLast + EPS ? 'perfect' : 'clean';
  } else if (p >= LAND.snap - EPS) quality = 'clean';
  else if (p >= bail - EPS) quality = 'sketchy';
  else quality = 'bail';
  return { p, quality };
}

/** Score this air's flips, grab and spin with the landing modifiers (the ollie was scored at the pop). */
export function scoreAir(k: Ctx, quality: Quality): void {
  const st = k.st, c = st.cur, sc = st.score;
  const land = quality === 'perfect' ? SCORE.mod.perfect : quality === 'sketchy' ? SCORE.mod.sketchy : 1;
  const flips = st.air.doneFlips;
  if (c.flip) flips.push({ id: c.flip.id, doubleUp: st.air.flipDoubleUp });
  for (const f of flips) {
    const def = k.tables.flips.find((d) => d.id === f.id);
    if (def) addTrick(sc, k.ev, c.tick, c.mode, def.id, def.points, { link: true, mod: land * (f.doubleUp ? SCORE.mod.doubleUp : 1) });
  }
  flips.length = 0;
  if (st.air.grabbed) {
    const def = k.tables.grabs[0];
    const dur = c.grab ? c.grab.t : st.air.grabDur;
    if (def) addTrick(sc, k.ev, c.tick, c.mode, def.id, def.entry + def.perSec * Math.min(dur, def.maxDur), { link: true, mod: land });
  }
  if (c.spin) {
    const def = k.tables.spins.find((d) => d.id === c.spin!.id);
    if (def) {
      const e = addTrick(sc, k.ev, c.tick, c.mode, def.id, def.points, { link: true, mod: land });
      c.spin.linked = e.link;
    }
  }
}

/** The obstacle that owns a slab and has a landable body under it (a raised top), else null. */
function raisedTop(k: Ctx, slab: GroundSlab): boolean {
  const top = Math.max(slab.y0, slab.y1);
  for (const ob of k.obs) {
    let owns = false;
    for (const sl of ob.slabs) if (sl === slab) { owns = true; break; }
    if (!owns) continue;
    for (const so of ob.solids) if (so.top === 'landable' && Math.abs(so.box.y1 - top) < 1e-6) return true;
    return false;
  }
  return false;
}

/** DESIGN §7 edge nudge: the board centre within LAND.edgeNudge of a raised top's side edge is moved onto the top
 *  (targetX moves with it, so steering keeps its intent). Never changes which surface the board landed on. */
export function edgeNudge(k: Ctx, x0: number, x1: number): void {
  const c = k.st.cur;
  const m = Math.min(LAND.edgeNudge, (x1 - x0) / 2);
  let nx = c.p.x;
  if (nx < x0 + m) nx = x0 + m;
  else if (nx > x1 - m) nx = x1 - m;
  if (nx === c.p.x) return;
  c.targetX += nx - c.p.x;
  c.p.x = nx;
}

/** Air → ground. `g` is the ground the board touched (a slab top, the street, or a pit at lip level). */
export function touchdown(k: Ctx, g: GroundHit): void {
  const st = k.st, c = st.cur, f = k.f;
  const j = judge(k);
  if (j.quality === 'bail') {
    k.crash('badLanding', null);
    if (c.mode === 'crashed') return;
  }
  const quality = j.quality === 'bail' ? 'clean' : j.quality;    // god mode: logged, landed clean
  const rollOff = st.air.reason === 'rollOff';
  c.p.y = g.y;
  c.vel.y = 0;
  const airT = c.airT, dropH = st.air.takeoffY - g.y;
  if (g.slab && raisedTop(k, g.slab)) edgeNudge(k, g.slab.x0, g.slab.x1);
  c.mode = 'roll';
  setGround(k, g);
  st.landTick = c.tick; st.landDrop = Math.max(0, dropH);
  k.ev.push({ t: 'land', tick: c.tick, airT, dropH, quality, surface: g.surface });
  if (quality === 'sketchy') c.wobble = Math.max(c.wobble, LAND.sketchyWobble);
  const entries0 = st.score.combo.entries.length;
  scoreAir(k, quality);
  airEndsOn(k, st.groundOb, g.y, false);
  const tricked = st.score.combo.entries.length > entries0;          // this air scored a flip, spin or grab
  // Revert: a 180 lands fakie and pivots back on the ground (+50, and +1 link if the spin itself linked). A 180 that
  // had not quite finished snaps round first.
  if (c.spin && c.spin.t < c.spin.dur - EPS && isHalfSpin(k, c.spin.id)) c.fakie = !c.fakie;
  if (c.fakie) {
    c.fakie = false;
    st.revertTick = c.tick;
    k.ev.push({ t: 'revert', tick: c.tick });
    if (st.score.combo.active) {
      addBonus(st.score, k.ev, c.tick, 'roll', 'revert', 'Revert', SCORE.bonus.revert, true);
      if (c.spin?.linked) addLink(st.score, 'roll', true);
    }
  }
  const grabbedToLand = st.air.grabbed && st.air.grabHeldToLand && (f.hold || f.grab || f.press);
  c.flip = null; c.spin = null; c.grab = null; c.flipsThisAir = 0; c.airTricks.length = 0;
  c.airT = 0; c.airLeft = 0; c.dropH = 0;
  c.magnetEdge = null; c.magnetCancelled = false; c.transferArmed = false;
  // The link window (re)starts at a touchdown. A plain roll-off (a step down, a curb) keeps the window that was
  // running, so rolling down steps cannot stretch it; but a trick in that air, or a combo whose window is not running
  // (the combo began in this air: a flip or a drop gap), opens it like any landing.
  if (quality === 'sketchy') bank(st.score, k.ev, c.tick, 'sketchy');
  else if (!rollOff || tricked || st.score.combo.window < 0) openWindow(st.score);
  if (c.jumpBuffer > 0) { c.jumpBuffer = 0; pop(k, 'roll', null); return; }   // buffered tap: ollie on touchdown
  // Pre-press manual: the press went down 0.30–0.10 s before touchdown and is still a press; or a grab held through.
  // The press must have gone down in this air (or on the grind this air left): a tap already under way when the
  // board rolled off a curb is an ollie on its way, not a pre-press (G1, DESIGN §6.4; the thumb bot gate found it).
  const age = c.pressRiseTick >= 0 ? (c.tick - c.pressRiseTick) * DT : -1;
  const pressedInAir = st.air.reason === 'grindEnd' || c.pressRiseTick > st.air.takeoffTick;
  if (f.press && pressedInAir && age >= MANUAL.prePressMin - EPS && age <= MANUAL.prePressMax + EPS) startManual(k, 'prePress');
  else if (grabbedToLand) startManual(k, 'grab');
}
