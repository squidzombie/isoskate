// sim/landing.ts: touchdown and capture judgement (TECH §6.5; DESIGN §7). FROZEN bands in M0.
// Rotation progress p = the worse of the rotating flip and spin (finished ones count 1):
//   p = 1      → clean; Perfect if every rotation finished in the air and the last within LAND.perfectLast before touchdown
//   p ≥ 0.80   → clean (the rest snaps in 0.06 s, never Perfect)
//   p ≥ 0.55   → sketchy (0.40 in the first runs): that air's tricks ×0.5, wobble, the combo banks at once
//   otherwise  → bail = crash 'badLanding'
// Carve angle, landing yaw and drop height never cause a crash.
import type { GroundHit } from '../core/world';
import { DT, LAND } from '../core/tuning';
import { SCORE, addBonus, addLink, addTrick, bank, openWindow } from '../tricks';
import type { Ctx } from './state';
import { setGround } from './ground';
import { pop } from './air';

export type Quality = 'clean' | 'perfect' | 'sketchy' | 'bail';

/** Judge the rotations of the current air at this tick. */
export function judge(k: Ctx): { p: number; quality: Quality } {
  const st = k.st, c = st.cur;
  const pf = c.flip ? Math.min(1, c.flip.t / c.flip.dur) : 1;
  const ps = c.spin ? Math.min(1, c.spin.t / c.spin.dur) : 1;
  const p = Math.min(pf, ps);
  const bail = st.cfg.firstRuns ? LAND.sketchyFirstRuns : LAND.sketchy;
  let quality: Quality;
  if (p >= 1 - 1e-9) {
    const rotated = !!c.flip || !!c.spin;
    quality = rotated && st.air.lastDoneTick >= 0 && (c.tick - st.air.lastDoneTick) * DT <= LAND.perfectLast + 1e-9 ? 'perfect' : 'clean';
  } else if (p >= LAND.snap - 1e-9) quality = 'clean';
  else if (p >= bail - 1e-9) quality = 'sketchy';
  else quality = 'bail';
  return { p, quality };
}

/** Score this air's flips and spins with the landing modifiers (the ollie was scored at the pop). */
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
  if (c.spin) {
    const def = k.tables.spins.find((d) => d.id === c.spin!.id);
    if (def) {
      const e = addTrick(sc, k.ev, c.tick, c.mode, def.id, def.points, { link: true, mod: land });
      c.spin.linked = e.link;
    }
  }
}

/** Air → ground. `g` is the ground the board touched (a slab top, the street, or a pit at lip level). */
export function touchdown(k: Ctx, g: GroundHit): void {
  const st = k.st, c = st.cur;
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
  c.mode = 'roll';
  setGround(k, g);
  st.landTick = c.tick; st.landDrop = Math.max(0, dropH);
  k.ev.push({ t: 'land', tick: c.tick, airT, dropH, quality, surface: g.surface });
  if (quality === 'sketchy') c.wobble = Math.max(c.wobble, LAND.sketchyWobble);
  scoreAir(k, quality);
  // Revert: a 180 lands fakie and pivots back on the ground (+50, and +1 link if the spin itself linked).
  if (c.fakie) {
    c.fakie = false;
    k.ev.push({ t: 'revert', tick: c.tick });
    if (st.score.combo.active) {
      addBonus(st.score, k.ev, c.tick, 'roll', 'revert', 'Revert', SCORE.bonus.revert, true);
      if (c.spin?.linked) addLink(st.score, 'roll');
    }
  }
  c.flip = null; c.spin = null; c.flipsThisAir = 0; c.airTricks.length = 0;
  c.airT = 0; c.airLeft = 0; c.dropH = 0;
  c.magnetEdge = null; c.magnetCancelled = false; c.transferArmed = false;
  if (quality === 'sketchy') bank(st.score, k.ev, c.tick, 'sketchy');
  else if (!rollOff) openWindow(st.score);
  if (c.jumpBuffer > 0) { c.jumpBuffer = 0; pop(k, 'roll', null); }   // buffered tap: ollie on touchdown
}
