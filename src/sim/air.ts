// sim/air.ts: take-off, flips, spins, the Indy grab and ballistic flight (TECH §6.3 step 5 air, §6.5; DESIGN §5.4,
// §6.1, §6.1a). Gravity is integrated exactly (y += vy·DT − ½G·DT², vy −= G·DT), so a flat ollie is airborne for
// exactly 2·V_POP/G = 0.600 s (36 ticks, the pop tick included) with apex V_POP²/2G = 0.99 m at every speed.
//  - Flips: progress p = t/dur (linear: what landing is judged on); the board shows an ease-out from the angle it had
//    at the last upgrade (angle0 / t0), so an upgrade never jumps. A separate flip after one finished is a Double-up.
//  - Spins: FS / BS 180 from a pop (ground ↗ ↖) or a 180 Out; a repeat of the diagonal while < 60 % done upgrades it to
//    360 (the pose eases on from the yaw it had). A 180 that finishes lands fakie.
//  - Indy grab: HOLD (or Q) with ≥ 0.25 s of air left, 100 + 150/s for up to 1.0 s, released 0.12 s before touchdown
//    or capture; still held at touchdown it rolls into a manual (sim/landing.ts).
//  - Keyboard amend: the trick the last arrow started becomes its diagonal version in place (ollie → spin ollie,
//    kickflip → varial kickflip, pop-out → 180 Out).
import type { Dir8, FlipId, SpinId } from '../core/ids';
import type { SkaterMode } from '../core/sim';
import { DT, G, GRAB, JUMP_BUFFER, POP_BLEED, V_POP } from '../core/tuning';
import { SCORE, addBonus, addTrick, pauseWindow, recompute, refreshHeat } from '../tricks';
import { freshAir, type Ctx, type StartExt } from './state';

const EPS = 1e-9;
const easeOut = (u: number) => 1 - (1 - u) ** 3;

/** Every air starts here: a fresh AirExt with where it started (gaps, transfers, dropH). */
export function beginAir(k: Ctx, reason: 'pop' | 'rollOff' | 'grindEnd'): void {
  const st = k.st, c = st.cur;
  const fromOb = c.mode === 'grind' && c.grind ? c.grind.obstacleId : st.groundOb;
  c.mode = 'air';
  c.airT = 0;
  c.flip = null; c.spin = null; c.grab = null; c.flipsThisAir = 0; c.airTricks.length = 0;
  st.air = freshAir();
  st.air.reason = reason;
  st.air.takeoffY = c.p.y; st.air.takeoffS = c.p.s; st.air.takeoffX = c.p.x;
  st.air.fromOb = fromOb;
}

/** Shared take-off bookkeeping for a pop or a grind end-hop. */
export function takeOff(k: Ctx, reason: 'pop' | 'rollOff' | 'grindEnd', vy: number): void {
  const st = k.st, c = st.cur;
  beginAir(k, reason);
  c.vel.y = vy;
  c.coyote = 0;
  c.magnetEdge = null; c.magnetCancelled = false;
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

/** Remember what a swipe just started (keyboard amend). */
export function started(k: Ctx, kind: StartExt['kind']): void {
  const st = k.st;
  if (!st.lastStart) st.lastStart = { kind, tick: st.cur.tick };
  else { st.lastStart.kind = kind; st.lastStart.tick = st.cur.tick; }
}

export function startFlip(k: Ctx, id: FlipId): void {
  const st = k.st, c = st.cur;
  const def = k.tables.flips.find((d) => d.id === id);
  if (!def) return;
  if (c.grab) endGrab(k);
  if (c.flip) st.air.doneFlips.push({ id: c.flip.id, doubleUp: st.air.flipDoubleUp });   // previous one finished
  c.flipsThisAir++;
  st.air.flipDoubleUp = c.flipsThisAir >= 2;
  c.flip = { id, t: 0, dur: def.dur, upgrades: 0, airLeftAtStart: c.airLeft, angle0: 0, t0: 0 };
  st.flipFrom.roll = 0; st.flipFrom.yaw = 0; st.flipFrom.pitch = 0;
  c.airTricks.push(id);
  refreshHeat(st.score, id);
  k.ev.push({ t: 'flipStart', tick: c.tick, id, dur: def.dur });
}

/** Same-direction repeat while < 60 % done (or a keyboard amend): keep the current angle, spread the remaining
 *  rotation over the new duration (TECH §6.5). */
export function upgradeFlip(k: Ctx, to: FlipId): void {
  const st = k.st, c = st.cur, f = c.flip;
  const def = k.tables.flips.find((d) => d.id === to);
  const old = f && k.tables.flips.find((d) => d.id === f.id);
  if (!f || !def || !old || f.id === to) return;
  const shown = flipShown(f.t, f.dur, f.t0, st.flipFrom, old.rot);
  st.flipFrom.roll = shown.roll; st.flipFrom.yaw = shown.yaw; st.flipFrom.pitch = shown.pitch;
  k.ev.push({ t: 'flipUpgrade', tick: c.tick, from: f.id, to });
  f.id = to; f.dur = def.dur; f.upgrades++; f.angle0 = shown.roll; f.t0 = f.t;
  const i = c.airTricks.lastIndexOf(old.id);
  if (i >= 0) c.airTricks[i] = to;
}

/** Board rotation shown at flip time t: from (angle at t0) to rot with an ease-out cubic (no jump on upgrade). */
export function flipShown(t: number, dur: number, t0: number, from: { roll: number; yaw: number; pitch: number },
  rot: { roll: number; yaw: number; pitch: number }): { roll: number; yaw: number; pitch: number } {
  const u = dur - t0 > EPS ? Math.min(1, Math.max(0, (t - t0) / (dur - t0))) : 1;
  const e = easeOut(u);
  return { roll: from.roll + (rot.roll - from.roll) * e, yaw: from.yaw + (rot.yaw - from.yaw) * e,
    pitch: from.pitch + (rot.pitch - from.pitch) * e };
}

export function startSpin(k: Ctx, dir: 'ur' | 'ul', out: boolean): void {
  const st = k.st, c = st.cur;
  const def = k.tables.spins.find((d) => d.input === dir && d.upgradeOf === null);
  if (!def) return;
  c.spin = { id: def.id, t: 0, dur: def.dur, upgrades: 0, startTick: c.tick, linked: true };
  st.air.spinOut = out;
  st.air.spinYaw0 = 0; st.air.spinT0 = 0;
  c.airTricks.push(def.id);
  refreshHeat(st.score, def.id);
  k.ev.push({ t: 'spinStart', tick: c.tick, id: def.id, dur: def.dur, out });
  if (out) addBonus(st.score, k.ev, c.tick, 'air', 'spinOut', '180 Out', SCORE.bonus.spinOut, true);
}

/** Spin yaw shown (deg) at spin time t, eased on from the yaw it had at the last upgrade. */
export function spinShown(k: Pick<Ctx, 'st' | 'tables'>, t: number): number {
  const s = k.st.cur.spin;
  const def = s && k.tables.spins.find((d) => d.id === s.id);
  if (!s || !def) return 0;
  const a = k.st.air, span = s.dur - a.spinT0;
  const u = span > EPS ? Math.min(1, Math.max(0, (t - a.spinT0) / span)) : 1;
  return a.spinYaw0 + (def.yaw - a.spinYaw0) * easeOut(u);
}

export function upgradeSpin(k: Ctx, to: SpinId): void {
  const st = k.st, c = st.cur, s = c.spin;
  const def = k.tables.spins.find((d) => d.id === to);
  if (!s || !def) return;
  st.air.spinYaw0 = spinShown(k, s.t); st.air.spinT0 = s.t;
  k.ev.push({ t: 'spinUpgrade', tick: c.tick, from: s.id, to });
  const i = c.airTricks.lastIndexOf(s.id);
  if (i >= 0) c.airTricks[i] = to;
  s.id = to; s.dur = def.dur; s.upgrades++;
}

/** Keyboard amend in the air (DESIGN §4.6): the ollie / pop-out the last arrow started becomes a spin ollie / 180 Out,
 *  the flip it started becomes the diagonal's flip. */
export function amendAir(k: Ctx, dir: Dir8): void {
  const st = k.st, c = st.cur, kind = st.lastStart?.kind;
  if ((kind === 'ollie' || kind === 'popOut') && (dir === 'ur' || dir === 'ul')) {
    if (kind === 'popOut') {
      // The Pop-out bonus becomes the 180 Out bonus (startSpin pays it).
      const sc = st.score;
      if (sc.combo.active) { sc.combo.flat -= SCORE.bonus.popOut; recompute(sc, c.mode); }
    }
    startSpin(k, dir, kind === 'popOut');
    return;
  }
  if (kind === 'flip' && c.flip) {
    const def = k.tables.flips.find((d) => d.input.length === 1 && d.input[0] === dir);
    if (def) upgradeFlip(k, def.id);
  }
}

export function startGrab(k: Ctx): void {
  const st = k.st, c = st.cur, def = k.tables.grabs[0];
  if (!def || c.grab || st.air.grabbed) return;
  c.grab = { id: def.id, t: 0 };
  st.air.grabbed = true;
  c.airTricks.push(def.id);
  refreshHeat(st.score, def.id);
  k.ev.push({ t: 'grabStart', tick: c.tick, id: def.id });
}

/** Release the grab (the hold let go, auto-release before touchdown / capture, or a flip started). */
export function endGrab(k: Ctx): void {
  const st = k.st, c = st.cur, g = c.grab;
  if (!g) return;
  st.air.grabDur = g.t;
  const f = k.f;
  st.air.grabHeldToLand = f.hold || f.grab || f.press;
  k.ev.push({ t: 'grabEnd', tick: c.tick, id: g.id, dur: g.t });
  c.grab = null;
}

/** After the prediction: auto-release the grab GRAB.releaseBefore before touchdown or capture, or at GRAB.maxDur. */
export function grabTick(k: Ctx): void {
  const st = k.st, c = st.cur;
  if (c.grab && (c.airLeft <= GRAB.releaseBefore + EPS || c.grab.t >= GRAB.maxDur - EPS)) endGrab(k);
  if (!c.grab && st.air.grabHeldToLand && !(k.f.hold || k.f.grab || k.f.press)) st.air.grabHeldToLand = false;
}

/** A tap with ≤ JUMP_BUFFER of air left: ollie on touchdown. */
export function bufferOllie(k: Ctx): void { k.st.cur.jumpBuffer = JUMP_BUFFER + DT; }

/** One airborne tick: rotation and grab timers (a rotation started this tick advances too, like the pop), then gravity. */
export function airStep(k: Ctx): void {
  const st = k.st, c = st.cur;
  c.airT += DT;
  const f = c.flip;
  if (f && f.t < f.dur - EPS) {
    f.t = Math.min(f.dur, f.t + DT);
    if (f.t >= f.dur - EPS) st.air.lastDoneTick = c.tick;
  }
  const s = c.spin;
  if (s && s.t < s.dur - EPS) {
    s.t = Math.min(s.dur, s.t + DT);
    if (s.t >= s.dur - EPS) {
      st.air.lastDoneTick = Math.max(st.air.lastDoneTick, c.tick);
      if (isHalfSpin(k, s.id)) c.fakie = !c.fakie;
    }
  }
  if (c.grab) c.grab.t += DT;
  c.p.y += c.vel.y * DT - 0.5 * G * DT * DT;
  c.vel.y -= G * DT;
}

/** A 180 (not a 360): it lands fakie. */
export function isHalfSpin(k: Pick<Ctx, 'tables'>, id: SpinId): boolean {
  const def = k.tables.spins.find((d) => d.id === id);
  return !!def && Math.abs(def.yaw) % 360 === 180;
}
