// tricks/score.config.ts: every scoring tunable (DESIGN §13, §22). Trick base points live in tricks/defs.ts
// (TrickTables); everything that modifies, links, decays or banks them lives here. GP (W1a) owns the tuning.

export const SCORE = {
  /** After a ground touchdown, seconds to pop or start a manual again (DESIGN §13.2). Paused in air/grind/manual. */
  linkWindow: 0.75,
  /** A link-adding trick must start within this many seconds of the previous one, or the combo banks. */
  heat: 2.5,
  /** Multiplier = max(1, links), capped. */
  multCap: 30,
  /** variety = min(cap, perName · max(0, uniqueNames − free)). */
  variety: { perName: 0.05, free: 2, cap: 0.5 },
  /** Repetition decay over the last `window` tricks of the run (DESIGN §13.4). */
  decay: { window: 10, factors: [1.0, 0.7, 0.45, 0.25, 0.1] as readonly number[], noLinkBelow: 0.45 },
  /** Multiplicative modifiers on a trick's points (DESIGN §13.1). */
  mod: { perfect: 1.25, perfectLock: 1.25, doubleUp: 1.5, sketchy: 0.5 },
  /** Flat bonuses (DESIGN §13.3). Inside a combo they add to the flat sum; outside they bank directly. */
  bonus: { nearMissCombo: 75, nearMissSolo: 25, transfer: 250, popOut: 50, spinOut: 100, revert: 50, landmark: 300,
    newGround: 500, knock: 10 },
  /** Coin payout of a banked combo: floor(sqrt(total / div)) (DESIGN §13.6). */
  comboCoinDiv: 250,
  /** Distance points per metre, banked continuously, never multiplied (DESIGN §13.5). */
  distancePerM: 1,
} as const;
