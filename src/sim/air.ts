// sim/air.ts: take-off, flips, spins and ballistic flight (TECH §6.3 step 5 air, §6.5; DESIGN §5.4, §6.1, §6.1a).
// Gravity is integrated exactly (y += vy·DT − ½G·DT², vy −= G·DT), so a flat ollie is airborne for exactly
// 2·V_POP/G = 0.600 s (36 ticks, the pop tick included) with apex V_POP²/2G = 0.99 m at every speed.
import type { FlipId, SpinId } from '../core/ids';
import type { SkaterMode } from '../core/sim';
import { DT, G, JUMP_BUFFER, POP_BLEED, V_POP } from '../core/tuning';
import { SCORE, addBonus, addTrick, pauseWindow, refreshHeat } from '../tricks';
import { freshAir, type Ctx } from './state';

/** Shared take-off bookkeeping: every air starts with a fresh AirExt. */
export function takeOff(k: Ctx, reason: 'pop' | 'rollOff' | 'grindEnd', vy: number): void {
  const st = k.st, c = st.cur;
  c.mode = 'air';
  c.vel.y = vy;
  c.airT = 0;
  c.coyote = 0;
  c.flip = null; c.spin = null; c.flipsThisAir = 0; c.airTricks.length = 0;
  c.magnetEdge = null; c.magnetCancelled = false;
  st.air = freshAir();
  st.air.reason = reason;
  st.air.takeoffY = c.p.y;
  st.flipFrom.roll = 0; st.flipFrom.yaw = 0; st.flipFrom.pitch = 0;
  pauseWindow(st.score);
}

/** A full pop (V_POP) from the ground, a manual, coyote time or a grind (pop out). Scores the ollie unless it pops
 *  out of a grind (scored as a Pop-out / 180 Out bonus by sim/grind.ts). */
export function pop(k: Ctx, from: SkaterMode, spinDir: 'ur' | 'ul' | null): void {
  const st = k.st, c = st.cur;
  const linked = st.score.combo.active;
  const fromEdge = from === 'grind' && c.grind ? c.grind.obstacleId : -1;
  takeOff(k, 'pop', V_POP);
  c.popBleed = POP_BLEED;
  c.jumpBuffer = 0;
  st.air.fromEdgeOb = fromEdge;
  k.ev.push({ t: 'ollie', tick: c.tick, from, linked }, { t: 'airborne', tick: c.tick, reason: 'pop' });
  if (from !== 'grind') {
    addTrick(st.score, k.ev, c.tick, 'air', 'ollie', k.tables.ollie.points, { link: false, minFactor: k.tables.ollie.minFactor });
    c.airTricks.push('ollie');
  }
  if (spinDir) startSpin(k, spinDir, from === 'grind');
}

export function startFlip(k: Ctx, id: FlipId): void {
  const st = k.st, c = st.cur;
  const def = k.tables.flips.find((d) => d.id === id);
  if (!def) return;
  if (c.flip) st.air.doneFlips.push({ id: c.flip.id, doubleUp: st.air.flipDoubleUp });   // previous one finished
  c.flipsThisAir++;
  st.air.flipDoubleUp = c.flipsThisAir >= 2;
  c.flip = { id, t: 0, dur: def.dur, upgrades: 0, airLeftAtStart: c.airLeft, angle0: 0, t0: 0 };
  st.flipFrom.roll = 0; st.flipFrom.yaw = 0; st.flipFrom.pitch = 0;
  c.airTricks.push(id);
  refreshHeat(st.score);
  k.ev.push({ t: 'flipStart', tick: c.tick, id, dur: def.dur });
}

/** Same-direction repeat while < 60 % done: keep the current angle, spread the remaining rotation (TECH §6.5). */
export function upgradeFlip(k: Ctx, to: FlipId): void {
  const st = k.st, c = st.cur, f = c.flip;
  const def = k.tables.flips.find((d) => d.id === to);
  const old = f && k.tables.flips.find((d) => d.id === f.id);
  if (!f || !def || !old) return;
  const shown = flipShown(f.t, f.dur, f.t0, st.flipFrom, old.rot);
  st.flipFrom.roll = shown.roll; st.flipFrom.yaw = shown.yaw; st.flipFrom.pitch = shown.pitch;
  k.ev.push({ t: 'flipUpgrade', tick: c.tick, from: f.id, to });
  f.id = to; f.dur = def.dur; f.upgrades++; f.angle0 = shown.roll; f.t0 = f.t;
  c.airTricks[c.airTricks.length - 1] = to;
  refreshHeat(st.score);
}

/** Board rotation shown at flip time t: from (angle at t0) to rot with an ease-out cubic (no jump on upgrade). */
export function flipShown(t: number, dur: number, t0: number, from: { roll: number; yaw: number; pitch: number },
  rot: { roll: number; yaw: number; pitch: number }): { roll: number; yaw: number; pitch: number } {
  const u = dur - t0 > 1e-9 ? Math.min(1, Math.max(0, (t - t0) / (dur - t0))) : 1;
  const e = 1 - (1 - u) ** 3;
  return { roll: from.roll + (rot.roll - from.roll) * e, yaw: from.yaw + (rot.yaw - from.yaw) * e,
    pitch: from.pitch + (rot.pitch - from.pitch) * e };
}

export function startSpin(k: Ctx, dir: 'ur' | 'ul', out: boolean): void {
  const st = k.st, c = st.cur;
  const def = k.tables.spins.find((d) => d.input === dir && d.upgradeOf === null);
  if (!def) return;
  c.spin = { id: def.id, t: 0, dur: def.dur, upgrades: 0, startTick: c.tick, linked: true };
  st.air.spinOut = out;
  c.airTricks.push(def.id);
  refreshHeat(st.score);
  k.ev.push({ t: 'spinStart', tick: c.tick, id: def.id, dur: def.dur, out });
  if (out) addBonus(st.score, k.ev, c.tick, 'air', 'spinOut', '180 Out', SCORE.bonus.spinOut, true);
}

export function upgradeSpin(k: Ctx, to: SpinId): void {
  const st = k.st, c = st.cur, s = c.spin;
  const def = k.tables.spins.find((d) => d.id === to);
  if (!s || !def) return;
  k.ev.push({ t: 'spinUpgrade', tick: c.tick, from: s.id, to });
  const i = c.airTricks.lastIndexOf(s.id);
  if (i >= 0) c.airTricks[i] = to;
  s.id = to; s.dur = def.dur; s.upgrades++;
  refreshHeat(st.score);
}

/** A tap with ≤ JUMP_BUFFER of air left: ollie on touchdown. */
export function bufferOllie(k: Ctx): void { k.st.cur.jumpBuffer = JUMP_BUFFER + DT; }

/** One airborne tick: rotation timers (a rotation started this tick advances too, like the pop), then gravity. */
export function airStep(k: Ctx): void {
  const st = k.st, c = st.cur;
  c.airT += DT;
  const f = c.flip;
  if (f && f.t < f.dur - 1e-9) {
    f.t = Math.min(f.dur, f.t + DT);
    if (f.t >= f.dur - 1e-9) st.air.lastDoneTick = c.tick;
  }
  const s = c.spin;
  if (s && s.t < s.dur - 1e-9) {
    s.t = Math.min(s.dur, s.t + DT);
    if (s.t >= s.dur - 1e-9) {
      st.air.lastDoneTick = Math.max(st.air.lastDoneTick, c.tick);
      const def = k.tables.spins.find((d) => d.id === s.id);
      if (def && Math.abs(def.yaw) % 360 === 180) c.fakie = !c.fakie;
    }
  }
  c.p.y += c.vel.y * DT - 0.5 * G * DT * DT;
  c.vel.y -= G * DT;
}
