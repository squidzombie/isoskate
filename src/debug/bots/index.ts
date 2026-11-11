// debug/bots/: test bots that drive the real Sim through InputFrames (TECH §11.2, WG). The registry (registry.ts) is
// what `__skate.bot(kind)` and tests/bots use; harness.ts runs a bot headless at full speed.
export { BOTS, type Bot, type BotFactory, type BotKind, type BotOptions } from './registry';
export { SafeKeyFollower, keyX } from './follower';
export { MyopicBot } from './myopic';
export { SafeBot } from './safe';
export { StraightBot } from './straight';
export { ThumbBot } from './thumb';
export { TrickBot } from './trick';
export { describeCrash, runBot, type BotCrash, type BotRun, type RunOptions } from './harness';
