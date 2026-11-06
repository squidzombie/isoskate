// debug/bots/: test bots that drive the real Sim through InputFrames (WG; M0-sim ships the SafeKey follower).
// The registry is what `__skate.bot(kind)` and tests/bots use. A bot is asked for one frame per tick, before step.
// M0: 'safe' and 'conformance' are the SafeKey follower, 'straight' holds a lane (opts.lane, default 0).
// TODO(WG): planner, safe (delayed vision, latency, jitter), myopic, thumb, trick, harness (TECH §11.2).
import type { InputFrame } from '../../core/input';
import type { Sim } from '../../core/sim';
import { SafeKeyFollower } from './follower';
import { StraightBot } from './straight';

export type BotKind = 'safe' | 'myopic' | 'thumb' | 'straight' | 'trick' | 'conformance';
export interface BotOptions { lane?: number; reaction?: number; seed?: number }
export interface Bot { frame(sim: Sim): Partial<InputFrame> }
export type BotFactory = (opts: BotOptions) => Bot;

export const BOTS: Partial<Record<BotKind, BotFactory>> = {
  safe: () => new SafeKeyFollower(),
  conformance: () => new SafeKeyFollower(),
  straight: (o) => new StraightBot(o.lane ?? 0),
};

export { SafeKeyFollower, keyX } from './follower';
export { StraightBot } from './straight';
