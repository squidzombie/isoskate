// debug/bots/trick.ts: the trick bot (TECH §11.2), greedy and without latency. It rides the safe bot's plan, and:
//  - steers to grindable edges on TrickLine obstacles it can reach (the edge's x before its entry, a take-off timed
//    so the board comes down through the edge just after its start), then rides the grind out;
//  - in the pick window, picks the grind with the best entry value;
//  - in the air, flicks the highest-value flip whose full chain (repeat swipes for doubles and triples) completes
//    before touchdown, or turns a planned ollie into a spin ollie (upgraded to a 360 when it fits);
// It is used for feasibility (doubles, triples, the 360 spin), score ratios, trick-line safety and combo durations.
import type { Dir8 } from '../../core/ids';
import type { InputFrame } from '../../core/input';
import { Sfc32, hash32 } from '../../core/rng';
import type { Sim } from '../../core/sim';
import { DT, FLIP_UPGRADE_MAX_PROGRESS, G, LATE_FLIP_CUTOFF, SPIN_UPGRADE_MAX_PROGRESS, V_LAT_MAX, V_POP, sAt, tAt } from '../../core/tuning';
import { ObTag, type GrindEdge } from '../../core/world';
import { FLIPS, SPINS } from '../../tricks';
import { SafeLine, checkPath } from '../../world/gen';
import { SafeBot } from './safe';

export interface TrickBotOptions { seed?: number; spinShare?: number; grindShare?: number }

interface Chain { inputs: Dir8[]; dur: number; points: number }

/** Every flip as the swipe chain that reaches it (a base flip and its repeat-swipe upgrades). */
const CHAINS: readonly Chain[] = FLIPS.map((f) => {
  const inputs: Dir8[] = [...f.input];
  return { inputs, dur: f.dur, points: f.points };
}).sort((a, b) => b.points - a.points);

const swipe = (d: Dir8): Partial<InputFrame> => ({ swipe: d, swipeFast: true, swipeDx: 0, swipeSteer: false, swipeFromRest: false });

interface Attempt { edge: GrindEdge; obstacle: number; x: number; tTake: number; tEntry: number; line: SafeLine }

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
  /** Grind attempts and captures (harness). */
  attempts = 0; grinds = 0;

  constructor(o: TrickBotOptions = {}) {
    this.rng = new Sfc32(hash32(o.seed ?? 1, 0x791c));
    this.safe = new SafeBot({ seed: hash32(o.seed ?? 1, 0x791d), latency: 0, jitter: 0 });
    this.spinShare = o.spinShare ?? 0.3; this.grindShare = o.grindShare ?? 0.8;
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
    this.lastMode = c.mode;
    if (c.mode === 'grind') { this.offPlan = true; return f; }
    // Off the edge (or back on the ground) after leaving the plan: re-plan from the board (in the air from its landing).
    if (this.offPlan && !this.attempt && (c.mode === 'roll' || c.mode === 'air')) { this.offPlan = false; this.safe.reset(); }
    // Pick window: the best entry value among the directions (a single swipe).
    if (c.mode === 'air' && c.pickWindow) return { ...swipe('dr'), steerDx: 0 };
    const d = this.safe.decide(sim);
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
        // A spin ollie instead of the planned tap, sometimes.
        if (this.rng.float() < this.spinShare) { const dir: Dir8 = this.rng.float() < 0.5 ? 'ur' : 'ul'; this.spinUp = dir; return { ...f, ...swipe(dir) }; }
        f.tap = true;
      }
      return f;
    }
    if (c.mode === 'air') {
      // Spin upgrade (180 → 360) while < 60 % done, if the 360 completes before touchdown.
      if (c.spin && this.spinUp && c.popBleed <= 0) {
        const up = SPINS.find((s) => s.upgradeOf === c.spin!.id);
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
        const fits = CHAINS.filter((ch) => ch.dur * 0.8 + (ch.inputs.length - 1) * 2 * DT <= c.airLeft).slice(0, 3);
        const fit = fits.length ? fits[Math.min(fits.length - 1, Math.floor(this.rng.float() * fits.length))] : undefined;
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
