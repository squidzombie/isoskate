// debug/bots/follower.ts: the SafeKey follower (ROADMAP M0: bot('safe')). It reads the SafeKeys the generator
// committed (world/gen safe.ts semantics: a polyline in run time, 'ollie' keys at take-off) and drives the real sim
// only through InputFrames: steerDx puts targetX on the line's x `lead` seconds ahead (the lateral controller lags
// it by about 1/STEER_P), and a tap on the tick nearest each ollie key. Deterministic, no latency or jitter.
// Since W1b BOTS.safe is WG's planner bot (0.25 s observation delay, latency, jitter; TECH §11.2); this follower
// is BOTS.conformance and records the sim fixtures and the sim bench.
import type { InputFrame } from '../../core/input';
import type { Sim } from '../../core/sim';
import { CHUNK_LEN, DT } from '../../core/tuning';
import type { SafeKey } from '../../core/world';

export interface FollowerOptions { lead?: number }

/** x of the SafeKey polyline at time t (keys sorted by t; clamped at the ends). */
export function keyX(keys: readonly SafeKey[], t: number): number {
  if (!keys.length) return 0;
  let lo = 0, hi = keys.length - 1;
  if (t <= keys[0]!.t) return keys[0]!.x;
  if (t >= keys[hi]!.t) return keys[hi]!.x;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (keys[m]!.t <= t) lo = m; else hi = m; }
  const a = keys[lo]!, b = keys[hi]!;
  return b.t - a.t > 1e-9 ? a.x + (b.x - a.x) * ((t - a.t) / (b.t - a.t)) : b.x;
}

export class SafeKeyFollower {
  private keys: SafeKey[] = [];
  private chunkLoaded = Number.NaN;
  private lastTap = -Infinity;
  private readonly lead: number;
  constructor(o: FollowerOptions = {}) { this.lead = o.lead ?? 0.1; }

  /** Keys of the chunks around s (the previous one for interpolation, three ahead). */
  private load(sim: Sim, s: number): void {
    const ci = Math.floor(s / CHUNK_LEN);
    if (ci === this.chunkLoaded) return;
    this.chunkLoaded = ci;
    const keys: SafeKey[] = [];
    for (let i = Math.max(0, ci - 1); i <= ci + 3; i++) for (const k of sim.gen.chunk(i).safe) keys.push(k);
    keys.sort((a, b) => a.t - b.t);
    this.keys = keys;
  }

  frame(sim: Sim): Partial<InputFrame> {
    const c = sim.cur;
    if (c.mode === 'crashed') return {};
    this.load(sim, c.p.s);
    const tNext = c.t + DT;                         // the tick this frame will be stepped as
    const f: Partial<InputFrame> = {};
    if (c.mode !== 'grind') f.steerDx = keyX(this.keys, tNext + this.lead) - c.targetX;
    for (const k of this.keys) {
      if (k.action !== 'ollie' || k.t <= this.lastTap + 1e-6) continue;
      if (Math.abs(k.t - tNext) <= DT / 2 + 1e-9) { f.tap = true; this.lastTap = k.t; break; }
      if (k.t > tNext + DT) break;
    }
    return f;
  }
}
