// debug/bots/myopic.ts: the myopic bot (DESIGN §10.11, TECH §11.2), a greedy player with no plan. Every 0.1 s on
// the ground it heads for the nearest 0.25 m lane whose next 1.5 s, as seen 0.35 s ago, holds nothing it cannot
// ollie (tall solids, and low ones or pits longer than 0.4 s); it ollies low obstacles and full-width hazards in its
// lane with the arc's apex over their middle (±0.08 s seeded jitter); its steering target moves at 75 % of V_LAT_MAX.
// It may crash: the gate is its median survival from the plateau. The generator runs the deterministic grid version
// of the same player as validator rule (i) (world/gen/validator/sweep.ts greedyCheck).
import type { InputFrame } from '../../core/input';
import { Sfc32, hash32 } from '../../core/rng';
import type { Sim } from '../../core/sim';
import { DT, G, HEIGHT, HITBOX, STEP_UP, VALIDATOR, V_LAT_MAX, V_POP, sAt, tAt } from '../../core/tuning';
import type { Obstacle } from '../../core/world';

const MY = VALIDATOR.myopic;
/** Seconds from take-off to the apex of a flat ollie. */
const APEX = V_POP / G;
/** Longest block it ollies (s of run time in its lane). */
const LONG = 0.4;
/** Lanes: x = −4.25 … 4.25 every 0.25 m. */
const LANES = Array.from({ length: 35 }, (_, i) => -4.25 + 0.25 * i);

export interface MyopicOptions { seed?: number; jitter?: number; latFrac?: number }

interface Block { t0: number; t1: number; x0: number; x1: number; tall: boolean }

export class MyopicBot {
  private readonly rng: Sfc32;
  private readonly jitter: number; private readonly latFrac: number;
  private target = Number.NaN;
  private desired = Number.NaN;
  private tick = 0;
  private tapAt = -1;
  private handled = -1;                              // t1 of the block the last ollie was for

  constructor(o: MyopicOptions = {}) {
    this.rng = new Sfc32(hash32(o.seed ?? 1, 0x3109));
    this.jitter = o.jitter ?? 0.08; this.latFrac = o.latFrac ?? MY.latFrac;
  }

  /** Ground hazards (what a rolling board at ground y would touch) in [tA, tB] of run time. */
  private blocks(sim: Sim, tA: number, tB: number, gy: number): Block[] {
    const out: Block[] = [];
    const obs: readonly Obstacle[] = sim.world.obstacles(sAt(tA), sAt(tB));
    const sB = sAt(tB);
    for (const ob of obs) {
      if (ob.s > sB) continue;
      for (const so of ob.solids) {
        if (so.top === 'knock') continue;
        const b = so.box;
        if (b.s0 > sB) continue;
        const thr = so.top === 'crash' ? b.y1 : b.y1 - STEP_UP;
        if (thr <= gy + 0.02 || b.y0 >= gy + HITBOX.h) continue;
        const tall = so.tall || b.y1 - b.y0 > HEIGHT.lowMax + 0.05 || b.y1 - gy > HEIGHT.lowMax + 0.1;
        out.push({ t0: tAt(b.s0 - HITBOX.l / 2), t1: tAt(b.s1 + HITBOX.l / 2), x0: b.x0, x1: b.x1, tall });
      }
      for (const p of ob.pits) {
        if (p.s0 > sB) continue;
        // A plank over the pit (a slab at lip level covering a lane) is ground, not a hazard.
        const planks = ob.slabs.filter((sl) => sl.s0 <= p.s0 + 0.01 && sl.s1 >= p.s1 - 0.01 && sl.x1 > p.x0 && sl.x0 < p.x1);
        let x = p.x0;
        for (const pl of [...planks].sort((a, b) => a.x0 - b.x0)) {
          if (pl.x0 > x) out.push({ t0: tAt(p.s0), t1: tAt(p.s1), x0: x, x1: pl.x0, tall: false });
          x = Math.max(x, pl.x1);
        }
        if (x < p.x1) out.push({ t0: tAt(p.s0), t1: tAt(p.s1), x0: x, x1: p.x1, tall: false });
      }
    }
    return out;
  }

  frame(sim: Sim): Partial<InputFrame> {
    const c = sim.cur;
    if (c.mode === 'crashed') return {};
    const tNow = c.t + DT;
    if (Number.isNaN(this.desired)) { this.desired = c.targetX; this.target = c.p.x; }
    const f: Partial<InputFrame> = {};
    const ground = c.mode === 'roll' || c.mode === 'manual';
    const half = HITBOX.w / 2 + 0.1;
    if (ground && this.tick % 6 === 0) {
      // The visible window as seen `reaction` ago.
      const tB = tNow - MY.reaction + MY.lookSec;
      const bl = this.blocks(sim, tNow, tB, c.groundY);
      let best = Number.NaN, bd = Infinity;
      for (const x of LANES) {
        const open = !bl.some((b) => b.t1 > tNow && b.t0 < tB && x + half > b.x0 && x - half < b.x1 && (b.tall || b.t1 - b.t0 > LONG));
        if (open && Math.abs(x - c.p.x) < bd - 1e-9) { bd = Math.abs(x - c.p.x); best = x; }
      }
      if (!Number.isNaN(best)) this.target = best;
    }
    // Ollie: the first ollie-able block in its lane ahead, apex over its middle.
    if (ground && this.tapAt < 0) {
      const bl = this.blocks(sim, tNow, tNow + 0.9, c.groundY)
        .filter((b) => b.t1 > tNow && c.p.x + half > b.x0 && c.p.x - half < b.x1 && b.t0 > this.handled)
        .sort((a, b) => a.t0 - b.t0);
      const b = bl[0];
      if (b && !b.tall && b.t1 - b.t0 <= LONG + 0.2) {
        const j = Math.round(((this.rng.float() * 2 - 1) * this.jitter) / DT) * DT;
        this.tapAt = Math.max(tNow, (b.t0 + b.t1) / 2 - APEX + DT + j);
        this.handled = b.t0;
      }
    }
    if (this.tapAt >= 0 && tNow >= this.tapAt - DT / 2) { f.tap = ground; this.tapAt = -1; }
    const maxStep = this.latFrac * V_LAT_MAX * DT;
    this.desired += Math.max(-maxStep, Math.min(maxStep, this.target - this.desired));
    if (c.mode !== 'grind') f.steerDx = this.desired - c.targetX;
    this.tick++;
    return f;
  }
}
