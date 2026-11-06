// debug/bots/: test bots that drive the real Sim through InputFrames (WG; M0-sim ships the SafeKey follower).
// The registry is what `__skate.bot(kind)` and tests/bots use. A bot is asked for one frame per tick, before step.
// TODO(M0-sim): 'safe' = SafeKey follower (ROADMAP M0). TODO(WG): planner, safe, myopic, thumb, straight, trick,
// conformance, harness (TECH §11.2).
import type { InputFrame } from '../../core/input';
import type { Sim } from '../../core/sim';

export type BotKind = 'safe' | 'myopic' | 'thumb' | 'straight' | 'trick' | 'conformance';
export interface BotOptions { lane?: number; reaction?: number; seed?: number }
export interface Bot { frame(sim: Sim): Partial<InputFrame> }
export type BotFactory = (opts: BotOptions) => Bot;

export const BOTS: Partial<Record<BotKind, BotFactory>> = {};
