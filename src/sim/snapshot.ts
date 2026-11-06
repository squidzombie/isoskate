// sim/snapshot.ts: snapshot / restore / hash (TECH §6.7). A snapshot is a structuredClone of the internal state; the
// WorldGen memo is not included (it is a deterministic function of the run config).
import type { SimSnapshot } from '../core/sim';
import type { SimState } from './state';

export const takeSnapshot = (st: SimState): SimSnapshot => structuredClone(st) as unknown as SimSnapshot;
export const readSnapshot = (s: SimSnapshot): SimState => structuredClone(s as unknown as SimState);

const MODES = ['roll', 'air', 'grind', 'manual', 'crashed'] as const;
const CAUSES = ['slam', 'badLanding', 'fall', 'splash'] as const;

/** FNV-1a over the quantized state: tick, position, velocity, target, mode, trick timers and score fields. */
export function hashState(st: Readonly<SimState>): number {
  const c = st.cur, sc = st.score;
  let h = 0x811c9dc5;
  const word = (v: number) => {
    for (let i = 0; i < 4; i++) { h ^= (v >>> (8 * i)) & 0xff; h = Math.imul(h, 0x01000193); }
  };
  const q = (v: number) => word(Math.round(v * 1e6) | 0);
  word(c.tick);
  q(c.p.s); q(c.p.x); q(c.p.y); q(c.vel.x); q(c.vel.y); q(c.targetX);
  word(MODES.indexOf(c.mode)); word(c.layer); q(c.groundY); q(c.airT); q(c.wobble);
  q(c.flip ? c.flip.t : -1); q(c.spin ? c.spin.t : -1); q(c.grind ? c.grind.u : -1); q(c.manual ? c.manual.t : -1);
  word(c.grind ? c.grind.edgeId : -1); word(c.magnetEdge ?? -1); word(c.magnetCancelled ? 1 : 0); word(c.fakie ? 1 : 0);
  word(sc.total); word(sc.trickPts); word(sc.bonusPts); word(sc.coins); word(sc.coinPayouts);
  word(sc.combo.links); word(sc.combo.pending); q(sc.combo.window); q(sc.combo.heat);
  word(c.crash ? CAUSES.indexOf(c.crash.cause) : -1);
  return h >>> 0;
}
