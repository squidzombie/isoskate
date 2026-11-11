// sim/grind.ts: capture, riding an edge, switches and the exits (TECH §6.6; DESIGN §6.2, §6.3). Capture conditions
// FROZEN in M0. Capture (air only): board centre s ∈ [a.s − CAPTURE_LEAD, b.s] (the board's front half reaches the
// edge start; u clamps to 0), |dx| ≤ CAPTURE.lat (curb-class pickOnly edges: ≤ latPickOnly and only with a pick made
// in their window), board bottom ∈ [top − below, top + above] and vy ≤ vyMax. The snap onto the edge eases over
// snapT. Flip and spin progress are judged as a landing. Grind id: the pick swipes (table lookup), else 50-50.
// Perfect Lock: the last pick within ±GRIND.perfectLock of lock. A pick in the 0.12 s after lock still changes it.
// Switches (≥ 0.25 s after lock, ↓ ← → ↙ ↘ and their doubles, at most 2 per edge) close the grind so far as one trick
// and start the new one as another (a new link). Exit at the edge end with an auto-hop (endHopVy), or pop out
// (TAP / ↑ = full pop, +50 Pop-out; ↗ ↖ = 180 Out). Steering is ignored while grinding.
// GP request (docs/core-requests.md, RULES.popOutSkipsOwnEdge): after a pop-out the magnet skips the edge left, and
// capture skips the obstacle's edges when its top is landable, unless the player steered toward it.
import type { Dir8, GrindId } from '../core/ids';
import type { ComboEntry } from '../core/sim';
import type { GrindDef } from '../core/tricks';
import type { GrindEdge, Obstacle } from '../core/world';
import { CAPTURE, DT, GRIND, LAND, MAGNET } from '../core/tuning';
import {
  RULES, SCORE, addBonus, addLink, addTrick, bank, finishTrick, liveTrick, pauseWindow, refreshHeat, retarget,
} from '../tricks';
import { modeOf, type Ctx } from './state';
import { CAPTURE_LEAD, edgeU, edgeX, edgeY } from './predict';
import { judge, scoreAir } from './landing';
import { endGrab, isHalfSpin, pop, takeOff } from './air';
import { airEndsOn } from './bonus';

const easeOut = (u: number) => 1 - (1 - u) ** 3;

/** A grind switch event. `late`: a pick in the 0.12 s after lock re-picked the grind just locked (not a switch: no
 *  switch cue or popup; the grind's name changes). GP request in docs/core-requests.md (an optional field). */
export interface GrindSwitchEventExt { t: 'grindSwitch'; tick: number; from: GrindId; to: GrindId; late?: true }

function defOf(k: Pick<Ctx, 'tables'>, id: GrindId): GrindDef {
  const ds = k.tables.grinds;
  for (let i = 0; i < ds.length; i++) if (ds[i]!.id === id) return ds[i]!;
  return ds[0]!;
}

/** Points of the running part so far (entry + perSec·t since the part began; a part a gateway bank cut pays no entry
 *  points again). */
function partPts(k: Ctx, id: GrindId, t: number): number {
  const def = defOf(k, id);
  return (k.st.timedCarry ? 0 : def.entry) + def.perSec * (t - k.st.grindPartT0);
}

/** The running grind part's combo entry. */
function runningEntry(k: Ctx): ComboEntry | undefined {
  const st = k.st, g = st.cur.grind;
  const e = g && st.grindSnap.entry >= 0 ? st.score.combo.entries[st.grindSnap.entry] : undefined;
  return e && g && e.id === g.id ? e : undefined;
}

/** The running grind's combo entry (before a gateway bank: sim/pickups.ts carries it over). */
export function grindEntryNow(k: Ctx): ComboEntry | undefined { return k.st.cur.mode === 'grind' ? runningEntry(k) : undefined; }

/** A gateway bank cut the running grind (its part so far is in the banked combo): the rest scores into a new combo,
 *  as a flip still rotating does (DESIGN §13.2), without its entry points or a second link. */
export function carryGrind(k: Ctx, was: ComboEntry): void {
  const st = k.st, g = st.cur.grind, sc = st.score;
  if (!g) return;
  st.grindPartT0 = g.t;
  st.timedCarry = true;
  const e = addTrick(sc, k.ev, st.cur.tick, 'grind', g.id, 0, { link: false, emit: false, mod: was.mod, carryFactor: was.factor });
  st.grindSnap.entry = sc.combo.entries.indexOf(e);
  pauseWindow(sc);
}

/** The grind a set of picks selects: exact table match, else the first pick alone, else null. */
export function grindForPicks(k: Pick<Ctx, 'tables'>, dirs: readonly string[]): GrindId | null {
  if (!dirs.length) return null;
  const exact = k.tables.grinds.find((d) => d.input.length === dirs.length && d.input.every((x, i) => x === dirs[i]));
  if (exact) return exact.id;
  const one = k.tables.grinds.find((d) => d.input.length === 1 && d.input[0] === dirs[0]);
  return one ? one.id : null;
}

/** Does a crash-top body sit under this edge (a rail, a beam)? Then landing on it would bail, so re-capture stays. */
function crashUnder(ob: Obstacle, e: GrindEdge, s: number): boolean {
  const ex = edgeX(e, s), ey = edgeY(e, s);
  for (const so of ob.solids) {
    const b = so.box;
    if (so.top === 'crash' && ex >= b.x0 - 0.05 && ex <= b.x1 + 0.05 && Math.abs(b.y1 - ey) < 0.1) return true;
  }
  return false;
}

/** RULES.popOutSkipsOwnEdge: should the magnet (`magnet`) or capture skip edge `e` after a pop-out from its obstacle? */
export function popSkip(k: Ctx, e: GrindEdge, magnet: boolean): boolean {
  const a = k.st.air, c = k.st.cur;
  if (!RULES.popOutSkipsOwnEdge || a.popOb < 0 || e.obstacleId !== a.popOb || c.mode !== 'air') return false;
  const s = Math.max(c.p.s, e.a.s);
  const toward = Math.sign(edgeX(e, s) - a.popX);
  if (toward !== 0 && a.steerNet * toward >= MAGNET.cancelDragM - 1e-9) return false;   // steering toward it
  const ob = k.world.obstacle(e.obstacleId);
  if (!ob || crashUnder(ob, e, s)) return magnet && e.id === a.popEdge;                // rails: capture stays
  return true;
}

/** Air tick: lock onto the best edge whose capture conditions hold now. Returns true on capture. */
export function tryCapture(k: Ctx): boolean {
  const st = k.st, c = st.cur;
  if (c.mode !== 'air' || c.vel.y > CAPTURE.vyMax) return false;
  let best: GrindEdge | null = null, bestDx = Infinity;
  for (const ob of k.obs) {
    if (st.ghosted.has(ob.id)) continue;
    for (const e of ob.edges) {
      if (c.p.s < e.a.s - CAPTURE_LEAD || c.p.s > e.b.s) continue;
      const dx = Math.abs(edgeX(e, c.p.s) - c.p.x);
      if (dx > (e.pickOnly ? CAPTURE.latPickOnly : CAPTURE.lat)) continue;
      const ey = edgeY(e, c.p.s);
      if (c.p.y > ey + CAPTURE.above || c.p.y < ey - CAPTURE.below) continue;
      if (e.pickOnly && !(st.pick.dirs.length > 0 && grindForPicks(k, st.pick.dirs))) continue;
      if (popSkip(k, e, false)) continue;
      if (dx < bestDx) { bestDx = dx; best = e; }
    }
  }
  if (!best) return false;
  lock(k, best);
  return modeOf(c) === 'grind';
}

function lock(k: Ctx, e: GrindEdge): void {
  const st = k.st, c = st.cur, sc = st.score;
  if (c.grab) endGrab(k);
  const j = judge(k);
  if (j.quality === 'bail') { k.crash('badLanding', null); if (c.mode === 'crashed') return; }
  const q = j.quality === 'bail' ? 'clean' : j.quality;
  scoreAir(k, q);
  airEndsOn(k, e.obstacleId, c.p.y);
  if (q === 'sketchy') { bank(sc, k.ev, c.tick, 'sketchy'); c.wobble = Math.max(c.wobble, LAND.sketchyWobble); }
  // A 180 still rotating at capture snaps round: the grind is ridden fakie (visual) and reverts silently on exit.
  if (c.spin && c.spin.t < c.spin.dur - 1e-9 && isHalfSpin(k, c.spin.id)) c.fakie = !c.fakie;
  const picked = grindForPicks(k, st.pick.dirs);
  const id: GrindId = picked ?? 'fiftyFifty';
  const perfect = !!picked && st.pick.tick >= 0 && Math.abs(c.tick - st.pick.tick) * DT <= GRIND.perfectLock + 1e-9;
  const transfer = c.transferArmed && st.air.fromEdgeOb >= 0 && st.air.fromEdgeOb !== e.obstacleId;
  const ex = edgeX(e, c.p.s), ey = edgeY(e, c.p.s);
  st.grindSnap.dx = c.p.x - ex; st.grindSnap.dy = c.p.y - ey;
  c.mode = 'grind';
  c.grind = { edgeId: e.id, obstacleId: e.obstacleId, id, u: edgeU(e, c.p.s), t: 0, lockTick: c.tick, perfect, switches: 0, transfer };
  st.grindPartT0 = 0;
  st.timedCarry = false;
  st.sw.tick = -1; st.sw.dir = null;
  c.vel.y = 0;
  c.targetX = ex;                                          // re-anchor: the sim takes lateral control
  c.flip = null; c.spin = null; c.flipsThisAir = 0; c.airTricks.length = 0; c.airT = 0; c.airLeft = 0;
  c.magnetEdge = null; c.transferArmed = false;
  c.jumpBuffer = 0;                                        // a buffered TAP is discarded at capture (DESIGN §6.3)
  const def = defOf(k, id);
  refreshHeat(sc, id);
  const entry = addTrick(sc, k.ev, c.tick, 'grind', id, def.entry, { link: true, mod: perfect ? SCORE.mod.perfectLock : 1, emit: false });
  st.grindSnap.entry = sc.combo.entries.indexOf(entry);
  pauseWindow(sc);
  if (transfer) {
    addBonus(sc, k.ev, c.tick, 'grind', 'transfer', 'Transfer', SCORE.bonus.transfer, true);
    addLink(sc, 'grind', true);
  }
  k.ev.push({ t: 'grindStart', tick: c.tick, id, edgeId: e.id, material: e.material, perfect, transfer });
}

/** A pick made in the 0.12 s after lock changes the grind (DESIGN §6.3: the window lasts until 0.12 s after lock). */
export function latePick(k: Ctx): void {
  const st = k.st, c = st.cur, g = c.grind;
  if (!g) return;
  const id = grindForPicks(k, st.pick.dirs);
  if (!id || id === g.id) return;
  const def = defOf(k, id);
  const perfect = Math.abs(c.tick - g.lockTick) * DT <= GRIND.perfectLock + 1e-9;
  const late: GrindSwitchEventExt = { t: 'grindSwitch', tick: c.tick, from: g.id, to: id, late: true };
  k.ev.push(late);
  const entry = runningEntry(k);
  g.id = id; g.perfect = perfect;
  if (entry) retarget(st.score, entry, id, def.entry, perfect ? SCORE.mod.perfectLock : 1);
}

/** A grind switch (DESIGN §6.3): the grind so far scores as one trick, the new one starts as another (a new link).
 *  `inPlace` re-targets the switch just made (its double, or a keyboard amend) without counting another switch. */
export function switchGrind(k: Ctx, to: GrindId, inPlace: boolean, dir: Dir8 | null): void {
  const st = k.st, c = st.cur, g = c.grind, sc = st.score;
  if (!g || g.id === to || !k.tables.grinds.some((d) => d.id === to)) return;
  const def = defOf(k, to);
  k.ev.push({ t: 'grindSwitch', tick: c.tick, from: g.id, to });
  const entry = runningEntry(k);
  if (inPlace && g.switches > 0) {
    // The double of the switch just made: the part keeps its start.
    if (entry) { retarget(sc, entry, to, def.entry, 1); liveTrick(entry, partPts(k, to, g.t)); }
  } else {
    if (entry) finishTrick(sc, k.ev, c.tick, 'grind', entry, partPts(k, g.id, g.t));
    refreshHeat(sc, to);
    const e = addTrick(sc, k.ev, c.tick, 'grind', to, def.entry, { link: true, emit: false });
    st.grindSnap.entry = sc.combo.entries.indexOf(e);
    st.grindPartT0 = g.t;
    st.timedCarry = false;
    g.switches++;
  }
  g.id = to; g.perfect = false;
  st.sw.tick = c.tick; st.sw.dir = dir;
}

/** One grinding tick: follow the edge (snap eased out), end with an auto-hop at the edge end. */
export function grindStep(k: Ctx): void {
  const st = k.st, c = st.cur, g = c.grind;
  const e = g ? k.world.edge(g.edgeId) : undefined;
  if (!g || !e) { endGrind(k, 'end'); return; }
  g.t += DT;
  g.u = edgeU(e, c.p.s);
  const w = 1 - easeOut(Math.min(1, g.t / CAPTURE.snapT));
  const x = edgeX(e, c.p.s) + st.grindSnap.dx * w;
  c.vel.x = (x - c.p.x) / DT;
  c.p.x = x;
  c.p.y = edgeY(e, c.p.s) + st.grindSnap.dy * w;
  c.groundY = c.p.y;
  c.targetX = x;
  if (c.p.s >= e.b.s) { endGrind(k, 'end'); return; }
  const entry = runningEntry(k);
  if (entry) liveTrick(entry, partPts(k, g.id, g.t));            // the combo pill counts up while you ride
}

/** Finish the grind entry (entry + perSec·dur of its last part) and leave the edge: 'end' hops, 'pop' is a full pop
 *  out (with a FS / BS 180 for a 180 Out). */
export function endGrind(k: Ctx, exit: 'end' | 'pop', spinDir: 'ur' | 'ul' | null = null): void {
  const st = k.st, c = st.cur, sc = st.score, g = c.grind;
  if (!g) return;
  const entry = runningEntry(k);
  if (entry) finishTrick(sc, k.ev, c.tick, 'grind', entry, partPts(k, g.id, g.t));
  st.timedCarry = false;
  sc.longestGrind = Math.max(sc.longestGrind, g.t);
  k.ev.push({ t: 'grindEnd', tick: c.tick, id: g.id, dur: g.t, exit });
  st.grindSnap.entry = -1;
  c.targetX = c.p.x;
  c.vel.x = 0;
  if (c.fakie) c.fakie = false;                       // a 180 into a grind reverts silently on exit
  const edgeId = g.edgeId, ob = g.obstacleId, x = c.p.x;
  if (exit === 'pop') {
    pop(k, 'grind', spinDir);
    if (!spinDir) addBonus(sc, k.ev, c.tick, 'air', 'popOut', 'Pop-out', SCORE.bonus.popOut, true);
    st.air.popEdge = edgeId; st.air.popOb = ob; st.air.popX = x;
  } else {
    takeOff(k, 'grindEnd', GRIND.endHopVy);
    st.air.fromEdgeOb = ob;
    k.ev.push({ t: 'airborne', tick: c.tick, reason: 'grindEnd' });
  }
  c.grind = null;
  c.transferArmed = true;
}
