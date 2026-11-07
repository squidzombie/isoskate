// debug/bots/registry.ts: the bot registry behind `__skate.bot(kind)` and tests/bots (TECH §11.2). A bot is asked
// for one frame per tick, before step, and drives the sim only through InputFrames.
//   safe         planner on the 2.5 s view as seen 0.25 s ago, 0.15 s input latency, ±0.05 s tap jitter (safe.ts)
//   myopic       greedy 1.5 s look-ahead as seen 0.35 s ago, no plan (myopic.ts)
//   thumb        the safe plan rendered as pointer traces through the real recognizer (thumb.ts): two thumbs by
//                default (left steers, right taps / flicks), `layout: 'one'` the one-thumb profile
//   conformance  follows the committed SafeKeys exactly (follower.ts)
//   straight     holds lane opts.lane and ollies every full-width hazard (straight.ts)
//   trick        greedy trick lines, flips, spins and grinds on top of the safe plan (trick.ts)
import type { InputFrame } from '../../core/input';
import type { Sim } from '../../core/sim';
import { SafeKeyFollower } from './follower';
import { MyopicBot } from './myopic';
import { SafeBot } from './safe';
import { StraightBot } from './straight';
import { ThumbBot } from './thumb';
import { TrickBot } from './trick';

export type BotKind = 'safe' | 'myopic' | 'thumb' | 'straight' | 'trick' | 'conformance';
export interface BotOptions { lane?: number; reaction?: number; seed?: number;
  /** Thumb bot: Settings "Touch controls" (two thumbs by default, DESIGN §4.1), and the recognizer grammar it is
   *  read with (default: the same; the thumb gate's control reads two-thumb traces with the one-thumb grammar). */
  layout?: 'two' | 'one'; grammar?: 'two' | 'one' }
export interface Bot { frame(sim: Sim): Partial<InputFrame> }
export type BotFactory = (opts: BotOptions) => Bot;

export const BOTS: Partial<Record<BotKind, BotFactory>> = {
  safe: (o) => new SafeBot({ seed: o.seed ?? 1, ...(o.reaction !== undefined ? { reaction: o.reaction } : {}) }),
  myopic: (o) => new MyopicBot({ seed: o.seed ?? 1 }),
  thumb: (o) => new ThumbBot({ seed: o.seed ?? 1, ...(o.layout ? { layout: o.layout } : {}), ...(o.grammar ? { grammar: o.grammar } : {}) }),
  trick: (o) => new TrickBot({ seed: o.seed ?? 1 }),
  conformance: () => new SafeKeyFollower(),
  straight: (o) => new StraightBot(o.lane ?? 0),
};
