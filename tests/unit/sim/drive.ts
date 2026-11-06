// Shared drivers for the W1a sim tests: a fixture-world sim, a placement backdoor (through the opaque snapshot), and a
// frame-by-frame runner whose input callback sees the sim and the previous tick's events.
import type { GameEvent } from '../../../src/core/events';
import type { InputFrame } from '../../../src/core/input';
import type { RunConfig, Sim, SimSnapshot } from '../../../src/core/sim';
import type { Obstacle } from '../../../src/core/world';
import { createSim } from '../../../src/sim';
import { TRICKS, type InputFrameExt } from '../../../src/tricks';
import { fixtureWorld, frame, runCfg } from './fixtures';

export function make(obs: Obstacle[], o: Partial<RunConfig> = {}): Sim {
  const sim = createSim(TRICKS, fixtureWorld(obs));
  sim.reset(runCfg(o));
  return sim;
}

/** Put the skater somewhere (cur and prev): x (and targetX), board height y (and groundY). */
export function place(sim: Sim, p: { x?: number; y?: number; targetX?: number }): void {
  type S = { p: { x: number; y: number }; targetX: number; groundY: number };
  const s = sim.snapshot() as unknown as { cur: S; prev: S };
  for (const st of [s.cur, s.prev]) {
    if (p.x !== undefined) { st.p.x = p.x; st.targetX = p.targetX ?? p.x; }
    if (p.y !== undefined) { st.p.y = p.y; st.groundY = p.y; }
  }
  sim.restore(s as unknown as SimSnapshot);
}

export type Drive = (i: number, sim: Sim, last: readonly GameEvent[]) => Partial<InputFrameExt>;

/** Step n ticks (stops at a crash); `drive(i, sim, lastEvents)` gives frame i. Returns every event. */
export function run(sim: Sim, n: number, drive: Drive = () => ({})): GameEvent[] {
  const out: GameEvent[] = [];
  let last: readonly GameEvent[] = [];
  for (let i = 0; i < n && sim.cur.mode !== 'crashed'; i++) {
    last = sim.step(frame(drive(i, sim, last) as Partial<InputFrame>)).slice();
    out.push(...last);
  }
  return out;
}

export const first = <K extends GameEvent['t']>(ev: readonly GameEvent[], t: K) =>
  ev.find((e): e is Extract<GameEvent, { t: K }> => e.t === t);
export const all = <K extends GameEvent['t']>(ev: readonly GameEvent[], t: K) =>
  ev.filter((e): e is Extract<GameEvent, { t: K }> => e.t === t);
export const scored = (ev: readonly GameEvent[]) => all(ev, 'trickScored').map((e) => `${e.id}:${e.pts}`);
