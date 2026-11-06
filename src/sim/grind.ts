// sim/grind.ts: capture, riding an edge and the exits (TECH §6.6; DESIGN §6.2, §6.3). Capture conditions FROZEN in M0.
// Capture (air only): board centre s ∈ [a.s − CAPTURE_LEAD, b.s] (the board's front half reaches the edge start; u
// clamps to 0), |dx| ≤ CAPTURE.lat (curb-class pickOnly edges: ≤ latPickOnly and only with a pick made in their
// window), board bottom ∈ [top − below, top + above] and vy ≤ vyMax. The snap onto the edge eases over snapT. Flip and
// spin progress are judged as a landing. Grind id: the pick swipes (table lookup), else 50-50. Perfect Lock: the last
// pick within ±GRIND.perfectLock of lock. Exit at the edge end with an auto-hop (endHopVy), or pop out (TAP / ↑ = full
// pop, +50 Pop-out; ↗ ↖ = 180 Out). Steering is ignored while grinding.
import type { GrindId } from '../core/ids';
import type { GrindEdge } from '../core/world';
import { CAPTURE, DT, GRIND, LAND } from '../core/tuning';
import { SCORE, addBonus, addLink, addTrick, bank, finishTrick, pauseWindow, refreshHeat } from '../tricks';
import { modeOf, type Ctx } from './state';
import { CAPTURE_LEAD, edgeU, edgeX, edgeY } from './predict';
import { judge, scoreAir } from './landing';
import { pop, takeOff } from './air';

const easeOut = (u: number) => 1 - (1 - u) ** 3;

/** The grind a set of picks selects: exact table match, else the first pick alone, else null. */
export function grindForPicks(k: Ctx, dirs: readonly string[]): GrindId | null {
  if (!dirs.length) return null;
  const exact = k.tables.grinds.find((d) => d.input.length === dirs.length && d.input.every((x, i) => x === dirs[i]));
  if (exact) return exact.id;
  const one = k.tables.grinds.find((d) => d.input.length === 1 && d.input[0] === dirs[0]);
  return one ? one.id : null;
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
      if (dx < bestDx) { bestDx = dx; best = e; }
    }
  }
  if (!best) return false;
  lock(k, best);
  return modeOf(c) === 'grind';
}

function lock(k: Ctx, e: GrindEdge): void {
  const st = k.st, c = st.cur, sc = st.score;
  const j = judge(k);
  if (j.quality === 'bail') { k.crash('badLanding', null); if (c.mode === 'crashed') return; }
  const q = j.quality === 'bail' ? 'clean' : j.quality;
  scoreAir(k, q);
  if (q === 'sketchy') { bank(sc, k.ev, c.tick, 'sketchy'); c.wobble = Math.max(c.wobble, LAND.sketchyWobble); }
  const picked = grindForPicks(k, st.pick.dirs);
  const id: GrindId = picked ?? 'fiftyFifty';
  const perfect = !!picked && st.pick.tick >= 0 && Math.abs(c.tick - st.pick.tick) * DT <= GRIND.perfectLock + 1e-9;
  const transfer = c.transferArmed && st.air.fromEdgeOb >= 0 && st.air.fromEdgeOb !== e.obstacleId;
  const ex = edgeX(e, c.p.s), ey = edgeY(e, c.p.s);
  st.grindSnap.dx = c.p.x - ex; st.grindSnap.dy = c.p.y - ey;
  c.mode = 'grind';
  c.grind = { edgeId: e.id, obstacleId: e.obstacleId, id, u: edgeU(e, c.p.s), t: 0, lockTick: c.tick, perfect, switches: 0, transfer };
  c.vel.y = 0;
  c.targetX = ex;                                          // re-anchor: the sim takes lateral control
  c.flip = null; c.spin = null; c.flipsThisAir = 0; c.airTricks.length = 0; c.airT = 0; c.airLeft = 0;
  c.magnetEdge = null; c.transferArmed = false;
  c.jumpBuffer = 0;                                        // a buffered TAP is discarded at capture (DESIGN §6.3)
  const def = k.tables.grinds.find((d) => d.id === id)!;
  refreshHeat(sc);
  const entry = addTrick(sc, k.ev, c.tick, 'grind', id, def.entry, { link: true, mod: perfect ? SCORE.mod.perfectLock : 1, emit: false });
  st.grindSnap.entry = sc.combo.entries.indexOf(entry);
  pauseWindow(sc);
  if (transfer) {
    addBonus(sc, k.ev, c.tick, 'grind', 'transfer', 'Transfer', SCORE.bonus.transfer, true);
    addLink(sc, 'grind');
  }
  k.ev.push({ t: 'grindStart', tick: c.tick, id, edgeId: e.id, material: e.material, perfect, transfer });
}

/** A pick made in the 0.12 s after lock changes the grind (DESIGN §6.3: the window lasts until 0.12 s after lock). */
export function latePick(k: Ctx): void {
  const st = k.st, c = st.cur, g = c.grind;
  if (!g) return;
  const id = grindForPicks(k, st.pick.dirs);
  if (!id || id === g.id) return;
  const def = k.tables.grinds.find((d) => d.id === id)!;
  const perfect = Math.abs(c.tick - g.lockTick) * DT <= GRIND.perfectLock + 1e-9;
  k.ev.push({ t: 'grindSwitch', tick: c.tick, from: g.id, to: id });
  g.id = id; g.perfect = perfect;
  const entry = st.score.combo.entries[st.grindSnap.entry];
  if (entry) { entry.id = id; entry.mod = perfect ? SCORE.mod.perfectLock : 1; entry.pts = Math.round(def.entry * entry.mod * entry.factor); }
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
  if (c.p.s >= e.b.s) endGrind(k, 'end');
}

/** Finish the grind entry (entry + perSec·dur) and leave the edge: 'end' hops, 'pop' is a full pop out. */
export function endGrind(k: Ctx, exit: 'end' | 'pop', spinDir: 'ur' | 'ul' | null = null): void {
  const st = k.st, c = st.cur, sc = st.score, g = c.grind;
  if (!g) return;
  const def = k.tables.grinds.find((d) => d.id === g.id)!;
  const entry = sc.combo.entries[st.grindSnap.entry];
  if (entry && entry.id === g.id) finishTrick(sc, k.ev, c.tick, 'grind', entry, def.entry + def.perSec * g.t);
  sc.longestGrind = Math.max(sc.longestGrind, g.t);
  k.ev.push({ t: 'grindEnd', tick: c.tick, id: g.id, dur: g.t, exit });
  st.grindSnap.entry = -1;
  c.targetX = c.p.x;
  c.vel.x = 0;
  if (c.fakie) c.fakie = false;                       // a 180 into a grind reverts silently on exit
  if (exit === 'pop') {
    pop(k, 'grind', spinDir);
    c.grind = null;
    if (!spinDir) addBonus(sc, k.ev, c.tick, 'air', 'popOut', 'Pop-out', SCORE.bonus.popOut, true);
  } else {
    const ob = g.obstacleId;
    takeOff(k, 'grindEnd', GRIND.endHopVy);
    st.air.fromEdgeOb = ob;
    c.grind = null;
    k.ev.push({ t: 'airborne', tick: c.tick, reason: 'grindEnd' });
  }
  c.transferArmed = true;
}
