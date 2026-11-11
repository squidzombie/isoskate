// debug/bots/trick.ts: the trick bot (TECH §11.2), greedy and without latency. It rides the safe bot's plan, and:
//  - steers to grindable edges on TrickLine obstacles it can reach (the edge's x before its entry, a take-off timed
//    so the board comes down through the edge just after its start), then rides the grind out;
//  - in the pick window, picks the grind with the best entry value;
//  - in the air, flicks the highest-value flip whose full chain (repeat swipes for doubles and triples) completes
//    before touchdown, or turns a planned ollie into a spin ollie (upgraded to a 360 when it fits);
//  - (G1) keeps a combo going between the plan's ollies the way a player does: in the link window it pops an extra
//    flip when the plan holds its line and the air path is clear for 1.2 s, else it manuals (window and heat paused)
//    up to the plan's next ollie when that comes within the manual budget;
//  - (G1) rides the optional 2.0 m decks (skywalk, Harbor Bridge) up their incline and pops off the end when the
//    landing is clear: the air a triple flip needs (DESIGN §10.11 feasibility).
// It is used for feasibility (doubles, triples, the 360 spin), score ratios, trick-line safety and combo durations.
import type { Dir8 } from '../../core/ids';
import type { InputFrame } from '../../core/input';
import { Sfc32, hash32 } from '../../core/rng';
import type { Sim } from '../../core/sim';
import { DT, FLIP_UPGRADE_MAX_PROGRESS, G, LATE_FLIP_CUTOFF, MANUAL, SPIN_UPGRADE_MAX_PROGRESS, V_LAT_MAX, V_POP, sAt, tAt } from '../../core/tuning';
import { ObTag, type GrindEdge, type Obstacle } from '../../core/world';
import { SCORE, TRICKS } from '../../tricks';
import { SafeLine, checkPath } from '../../world/gen';
import { SafeBot } from './safe';

export interface TrickBotOptions { seed?: number; spinShare?: number; grindShare?: number; chain?: boolean; decks?: boolean }

/** Combo keeping (G1): an extra pop needs the plan's x steady and nothing in the air path for `clearSec`, and no
 *  planned ollie within `planGap` s; a bridging manual starts in the window's last `manualAt` s when the plan's next
 *  ollie comes within `manualMax` s. */
const CHAIN = { popAfter: 0.15, clearSec: 1.2, planGap: 1.3, steady: 0.35, manualAt: 0.3, manualMax: 1.4,
  /** Chance a landing is followed by an extra pop (decided once per touchdown) and the flip picked from the best
   *  `pickOf` that fit: a good player, not a frame-perfect one (DESIGN §13.7: good play 20–35k pts/min; a pop after
   *  every landing chains whole area visits at ×30, ~270k/min). */
  popChance: 0.6, pickOf: 5 } as const;

interface Chain { inputs: Dir8[]; dur: number; points: number }

/** Every flip as the swipe chain that reaches it (a base flip and its repeat-swipe upgrades). */
const CHAINS: readonly Chain[] = TRICKS.flips.map((f) => {
  const inputs: Dir8[] = [...f.input];
  return { inputs, dur: f.dur, points: f.points };
}).sort((a, b) => b.points - a.points);

const swipe = (d: Dir8): Partial<InputFrame> => ({ swipe: d, swipeFast: true, swipeDx: 0, swipeSteer: false, swipeFromRest: false });

interface Attempt { edge: GrindEdge; obstacle: number; x: number; tTake: number; tEntry: number; line: SafeLine }
/** A deck ride: steer to x before the incline, hold it, pop at tPop (just before the deck end) when `pop`. */
interface DeckRide { obstacle: number; x: number; tIncline: number; tPop: number; tEnd: number; pop: boolean }

export class TrickBot {
  readonly safe: SafeBot;
  private readonly rng: Sfc32;
  private readonly spinShare: number; private readonly grindShare: number;
  private chain: Dir8[] = [];                       // remaining swipes of the flip in progress
  private nextSwipe = 0;
  private spinUp: Dir8 | null = null;
  private attempt: Attempt | null = null;
  private tried = new Set<number>();
  private offPlan = false;
  private lastMode = 'roll';
  private readonly chainOn: boolean; private readonly decksOn: boolean;
  private deck: DeckRide | null = null;
  private deckAir = false;
  private triedDecks = new Set<number>();
  private popWanted = false;                        // this touchdown's extra-pop roll
  /** Grind attempts and captures, extra pops, bridging manuals and deck pops (harness). */
  attempts = 0; grinds = 0; pops = 0; manuals = 0; deckPops = 0;

  constructor(o: TrickBotOptions = {}) {
    this.rng = new Sfc32(hash32(o.seed ?? 1, 0x791c));
    this.safe = new SafeBot({ seed: hash32(o.seed ?? 1, 0x791d), latency: 0, jitter: 0 });
    this.spinShare = o.spinShare ?? 0.3; this.grindShare = o.grindShare ?? 0.8;
    this.chainOn = o.chain ?? true; this.decksOn = o.decks ?? true;
  }

  /** An optional 2.0 m deck whose incline starts 0.6–2.0 s ahead and is reachable from x. */
  private findDeck(sim: Sim, tNow: number): DeckRide | null {
    const c = sim.cur;
    for (const ob of sim.world.obstacles(sAt(tNow + 0.6), sAt(tNow + 2.0))) {
      if (!(ob.tags & ObTag.Elevated) || this.triedDecks.has(ob.id)) continue;
      const inc = ob.slabs.find((sl) => sl.layer === 1 && sl.kind === 'incline');
      const top = ob.slabs.find((sl) => sl.layer === 1 && sl.kind === 'flat');
      if (!inc || !top || top.y1 - c.groundY < 1.6) continue;
      const tI = tAt(inc.s0);
      if (tI < tNow + 0.6 || tI > tNow + 2.0) continue;
      const x = Math.round(((top.x0 + top.x1) / 2) * 100) / 100;
      if (Math.abs(x - c.p.x) > 0.7 * V_LAT_MAX * (tI - tNow - 0.2)) continue;
      const line = new SafeLine(tNow, c.p.x);
      line.moveTo(x, tNow + 0.05, 0.7 * V_LAT_MAX);
      const hit = checkPath(line, sim.world.obstacles(c.p.s - 2, inc.s0 + 0.5).filter((o) => o.id !== ob.id), tNow, tI, 0);
      if (hit) continue;
      const tEnd = tAt(top.s1);
      // Pop off the end only when the longer flight (≈ 0.82 s from 2.0 m) lands on open road at the deck's x.
      const h = top.y1 - c.groundY, tau = (V_POP + Math.sqrt(V_POP * V_POP + 2 * G * h)) / G;
      const sLand = sAt(tEnd + tau);
      const pop = !sim.world.obstacles(top.s1, sLand + 4).some((o) => o.id !== ob.id && blocks(o, x, top.s1, sLand + 4, c.groundY));
      return { obstacle: ob.id, x, tIncline: tI, tPop: Math.round((tEnd - 0.1) / DT) * DT, tEnd, pop };
    }
    return null;
  }

  /** Can the board pop a flip now and land clear, without leaving the plan (combo keeping)? */
  private canPop(sim: Sim, tNow: number): boolean {
    const c = sim.cur;
    if (this.safe.nextTap(tNow - 0.05) < tNow + CHAIN.planGap) return false;
    for (let t = tNow; t <= tNow + 0.9 + 1e-9; t += 0.1) if (Math.abs(this.safe.planX(t) - c.p.x) > CHAIN.steady) return false;
    const g = sim.world.groundAt(c.p.s, c.p.x, c.p.y + 0.2);
    if (g.layer !== 0 || (g.slab && g.slab.kind !== 'flat')) return false;
    const line = new SafeLine(tNow, c.p.x);
    line.ollie(Math.round(tNow / DT) * DT);
    return checkPath(line, sim.world.obstacles(c.p.s - 2, sAt(tNow + CHAIN.clearSec) + 2), tNow, tNow + CHAIN.clearSec, 0) === null;
  }

  /** A grindable TrickLine edge whose entry is 0.7–1.6 s ahead and reachable from x. */
  private findEdge(sim: Sim, tNow: number): Attempt | null {
    const c = sim.cur;
    for (const ob of sim.world.obstacles(sAt(tNow + 0.7), sAt(tNow + 1.6))) {
      if (!(ob.tags & ObTag.TrickLine) || this.tried.has(ob.id)) continue;
      for (const e of ob.edges) {
        if (e.pickOnly) continue;
        const tEntry = tAt(e.a.s);
        if (tEntry < tNow + 0.7 || tEntry > tNow + 1.6 || e.b.s - e.a.s < 2.5) continue;
        const h = e.a.y - c.groundY;
        if (h < 0.1 || h > 0.85) continue;
        // Time from take-off until the board descends through the edge height.
        const tauD = (V_POP + Math.sqrt(V_POP * V_POP - 2 * G * h)) / G;
        const tTake = tEntry + 0.08 - tauD;
        if (tTake < tNow + 0.15) continue;
        const x = e.a.x;
        if (Math.abs(x - c.p.x) > 0.7 * V_LAT_MAX * (tTake - tNow - 0.15)) continue;
        // The approach (steer to the edge's x, ollie) must meet nothing before the capture.
        const line = new SafeLine(tNow, c.p.x);
        line.moveTo(x, tNow + 0.05, 0.7 * V_LAT_MAX);
        line.ollie(Math.round(tTake / DT) * DT);
        const hit = checkPath(line, sim.world.obstacles(c.p.s - 2, sAt(tEntry + 0.5)), tNow, tEntry - 0.05, 0);
        if (hit && hit !== 'path:capture') continue;
        return { edge: e, obstacle: ob.id, x, tTake: Math.round(tTake / DT) * DT, tEntry, line };
      }
    }
    return null;
  }

  frame(sim: Sim): Partial<InputFrame> {
    const c = sim.cur;
    if (c.mode === 'crashed') return {};
    const tNow = c.t + DT;
    const f: Partial<InputFrame> = {};
    if (c.mode === 'grind' && this.lastMode !== 'grind') this.grinds++;
    // (a touchdown: roll once whether this landing gets an extra pop)
    if (c.mode === 'roll' && this.lastMode !== 'roll' && this.lastMode !== 'manual') this.popWanted = this.rng.float() < CHAIN.popChance;
    this.lastMode = c.mode;
    if (c.mode === 'grind') { this.offPlan = true; return f; }
    // A deck ride: hold the deck's x up the incline and along the deck, pop off the end (or roll off).
    const dk = this.deck;
    if (dk) {
      if (c.mode === 'air' && tNow > dk.tEnd - 0.2) { this.deck = null; this.deckAir = true; this.offPlan = true; }
      else if (tNow > dk.tEnd + 0.5 || (c.mode === 'roll' && tNow > dk.tIncline + 0.4 && c.p.y - c.groundY < 0.05 && sim.world.groundAt(c.p.s, c.p.x, c.p.y + 0.2).layer === 0)) {
        this.deck = null; this.offPlan = true;                       // (missed the incline: back to the plan)
      }
      else {
        f.steerDx = dk.x - c.targetX;
        if (dk.pop && c.mode === 'roll' && Math.abs(tNow - dk.tPop) <= DT / 2 + 1e-9) { f.tap = true; this.deckPops++; }
        return f;
      }
    }
    // Off the edge (or back on the ground) after leaving the plan: re-plan from the board (in the air from its landing).
    if (this.offPlan && !this.attempt && (c.mode === 'roll' || c.mode === 'air')) { this.offPlan = false; this.safe.reset(); }
    if (c.mode === 'roll' && this.deckAir) this.deckAir = false;
    // Pick window: the best entry value among the directions (a single swipe).
    if (c.mode === 'air' && c.pickWindow) return { ...swipe('dr'), steerDx: 0 };
    const d = this.safe.decide(sim);
    if (this.decksOn && !this.attempt && c.mode === 'roll') {
      const r = this.findDeck(sim, tNow);
      if (r) { this.deck = r; this.triedDecks.add(r.obstacle); this.offPlan = true; f.steerDx = r.x - c.targetX; return f; }
    }
    // A grind attempt in progress: hold the edge's x, take off on time.
    if (!this.attempt && c.mode === 'roll' && this.rng.float() < this.grindShare / 30) {
      const a = this.findEdge(sim, tNow);
      if (a) { this.attempt = a; this.tried.add(a.obstacle); this.attempts++; this.offPlan = true; }
    }
    const a = this.attempt;
    if (a) {
      f.steerDx = a.line.xAt(tNow + 0.1) - c.targetX;
      if (c.mode === 'roll' && Math.abs(tNow - a.tTake) <= DT / 2 + 1e-9) f.tap = true;
      if (tNow > a.tEntry + 0.6 || (c.mode === 'roll' && tNow > a.tTake + 0.1)) this.attempt = null;
      return f;
    }
    f.steerDx = d.targetX - c.targetX;
    if (c.mode === 'roll' || c.mode === 'manual') {
      this.chain = []; this.spinUp = null;
      if (d.tap) {
        // A spin ollie instead of the planned tap, sometimes (not from a manual: a diagonal there is a spin, not a pop).
        if (c.mode === 'roll' && this.rng.float() < this.spinShare) { const dir: Dir8 = this.rng.float() < 0.5 ? 'ur' : 'ul'; this.spinUp = dir; return { ...f, ...swipe(dir) }; }
        f.tap = true;
        return f;
      }
      const cb = sim.score.combo;
      if (this.chainOn && cb.active) {
        // Keep the combo: a bridging manual runs until the plan's next ollie.
        if (c.mode === 'manual') { f.manualKey = true; return f; }
        if (this.popWanted && cb.window > 0 && cb.window <= SCORE.linkWindow - CHAIN.popAfter && this.canPop(sim, tNow)) {
          this.popWanted = false;
          this.pops++; this.offPlan = true; f.tap = true; return f;
        }
        const next = this.safe.nextTap(tNow);
        const budget = MANUAL.budgets[Math.min(cb.manualCount, MANUAL.budgets.length - 1)] ?? MANUAL.budgetFloor;
        if (cb.window > 0 && cb.window <= CHAIN.manualAt && next - tNow <= Math.min(CHAIN.manualMax, budget - 0.2)) { this.manuals++; f.manualKey = true; return f; }
      }
      return f;
    }
    if (c.mode === 'air') {
      // Spin upgrade (180 → 360) while < 60 % done, if the 360 completes before touchdown.
      if (c.spin && this.spinUp && c.popBleed <= 0) {
        const up = TRICKS.spins.find((s) => s.upgradeOf === c.spin!.id);
        if (up && c.spin.t / c.spin.dur < SPIN_UPGRADE_MAX_PROGRESS - 0.1 && c.spin.t + c.airLeft >= up.dur + 0.03) { this.spinUp = null; return { ...f, ...swipe(up.input) }; }
        if (c.spin.t / c.spin.dur >= SPIN_UPGRADE_MAX_PROGRESS) this.spinUp = null;
        return f;
      }
      if (c.popBleed > 0 || c.spin) return f;
      if (this.chain.length) {
        if (tNow >= this.nextSwipe && c.flip && c.flip.t / c.flip.dur < FLIP_UPGRADE_MAX_PROGRESS - 0.05) {
          const dir = this.chain.shift()!;
          this.nextSwipe = tNow + 2 * DT;
          return { ...f, ...swipe(dir) };
        }
        if (c.flip && c.flip.t / c.flip.dur >= FLIP_UPGRADE_MAX_PROGRESS) this.chain = [];
        return f;
      }
      if (!c.flip && c.flipsThisAir === 0 && c.airLeft > LATE_FLIP_CUTOFF + 0.05) {
        // Clean: the air left at the swipe covers ≥ 80 % of the chain (DESIGN §5.6; ≥ 55 % lands sketchy).
        // One of the three best that fit (variety: doubles, lasers, tres …).
        const fits = CHAINS.filter((ch) => ch.dur * 0.8 + (ch.inputs.length - 1) * 2 * DT <= c.airLeft).slice(0, this.chainOn ? CHAIN.pickOf : 3);
        // (a deck pop: the best that fits, so the long air flies the triple)
        const fit = fits.length ? fits[this.deckAir ? 0 : Math.min(fits.length - 1, Math.floor(this.rng.float() * fits.length))] : undefined;
        if (fit) {
          this.chain = fit.inputs.slice(1);
          this.nextSwipe = tNow + 2 * DT;
          return { ...f, ...swipe(fit.inputs[0]!) };
        }
      }
    }
    return f;
  }
}

/** Does obstacle o put a solid or pit in the board's way at x over [s0, s1] (anything above a bump from ground y)? */
function blocks(o: Obstacle, x: number, s0: number, s1: number, y: number): boolean {
  for (const so of o.solids) {
    const b = so.box;
    if (b.s1 < s0 || b.s0 > s1 || b.x1 < x - 0.8 || b.x0 > x + 0.8 || so.top === 'knock') continue;
    if (b.y1 > y + 0.18) return true;
  }
  return o.pits.some((p) => p.s1 > s0 && p.s0 < s1 && p.x1 > x - 0.8 && p.x0 < x + 0.8);
}
