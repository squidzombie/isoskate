// debug/bots/straight.ts: the straight bot (TECH §11.2): holds lane x and ollies every full-width hazard at the
// middle of its ollie window (take-off 0.3 s before the board centre passes the hazard's middle). It must crash
// on the tall blockers: going straight is not viable (DESIGN §10.7).
import type { InputFrame } from '../../core/input';
import type { Sim } from '../../core/sim';
import { DT, tAt } from '../../core/tuning';
import { ObTag } from '../../core/world';

export class StraightBot {
  private done = new Set<number>();
  constructor(private readonly lane: number) {}
  frame(sim: Sim): Partial<InputFrame> {
    const c = sim.cur;
    if (c.mode === 'crashed') return {};
    const f: Partial<InputFrame> = { steerDx: this.lane - c.targetX };
    const tNext = c.t + DT;
    for (const ob of sim.world.obstacles(c.p.s, c.p.s + 25)) {
      if (!(ob.tags & ObTag.FullWidth) || this.done.has(ob.id)) continue;
      const tTake = tAt(ob.s + ob.len / 2) - 0.3;
      if (tNext >= tTake - DT / 2) { this.done.add(ob.id); f.tap = true; }
      break;
    }
    return f;
  }
}
