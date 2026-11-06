// tricks/score.config.ts: every scoring number (DESIGN §13, §22): the trick base points (POINTS, from which
// tricks/defs.ts builds the TrickTables), and everything that modifies, links, decays or banks them (SCORE). Plus the
// trick-rule timings of DESIGN §6 that core/tuning.ts does not hold (core is frozen; GP's W1a rule tunables: RULES).

/** Base points of every trick (DESIGN §6.1, §6.1a, §6.2, §6.4, §13.1); tricks/defs.ts builds the TrickTables from
 *  them. Grinds, manuals and the grab pay entry + perSec · seconds (the grab for at most maxDur). */
export const POINTS = {
  ollie: 50, ollieMinFactor: 0.5,
  flips: { popShuvit: 100, kickflip: 150, heelflip: 150, impossible: 200, shuvit360: 200, varialKickflip: 250,
    varialHeelflip: 250, hardflip: 300, inwardHeelflip: 300, treFlip: 350, laserFlip: 400, doubleKickflip: 400,
    doubleHeelflip: 400, tripleKickflip: 650, tripleHeelflip: 650 },
  spins: { fs180: 150, bs180: 150, fs360: 350, bs360: 350 },
  grinds: { fiftyFifty: [100, 150], fiveO: [100, 175], nosegrind: [125, 175], boardslide: [125, 175],
    lipslide: [150, 200], noseslide: [150, 225], tailslide: [150, 225], feeble: [200, 250], smith: [200, 250],
    crooked: [200, 250], overcrook: [225, 275], bluntslide: [250, 300], noseBluntslide: [250, 300] },
  manuals: { manual: [75, 100], noseManual: [100, 125] },
  grabs: { indy: { entry: 100, perSec: 150, maxDur: 1.0 } },
} as const;

export const SCORE = {
  /** After a ground touchdown, seconds to pop or start a manual again (DESIGN §13.2). Paused in air/grind/manual. */
  linkWindow: 0.75,
  /** A link-adding trick must start within this many seconds of the previous one, or the combo banks. */
  heat: 2.5,
  /** Multiplier = max(1, links), capped. */
  multCap: 30,
  /** variety = min(cap, perName · max(0, uniqueNames − free)). */
  variety: { perName: 0.05, free: 2, cap: 0.5 },
  /** Repetition decay over the last `window` tricks of the run (DESIGN §13.4). A trick whose factor is below
   *  `noLinkBelow` adds no link and, when it starts, does not refresh the heat. */
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

/** Trick-rule timings and switches (DESIGN §4.3, §6) added in W1a. Seconds unless noted. */
export const RULES = {
  /** A still thumb on the ground starts a manual (inside the link window, or on a pad / ledge top) only once its touch
   *  has been down this long: 0.1 s after the recognizer's HOLD, so a thumb that just came to rest after a landing
   *  does not manual at once (G0 review: 0.2 s was too eager). The manual key starts at once. */
  manualHoldSec: 0.30,
  /** Grind switches: a repeat of the last switch's direction within this time upgrades that switch in place to the
   *  double (← then ← → Lipslide) without counting a second switch; a different switch must wait this long. */
  switchDoubleSec: 0.25,
  /** A gap tagged on the obstacle the air started from (Dock Drop, Skywalk Drop, Bridge Drop) pays only when the
   *  landing is at least this much lower than the take-off. */
  dropGapMinH: 0.5,
  /** After popping out of a grind (TAP / ↑ / 180 Out) the magnet skips the edge you left, and capture skips every
   *  edge of that obstacle when its top is landable (a ledge or a bench), unless you steered toward it by at least
   *  MAGNET.cancelDragM this jump. Rails keep re-capture under the board, because their tops are crash tops.
   *  Filed in docs/core-requests.md (GP): the magnet and capture are frozen since M0; false restores M0. */
  popOutSkipsOwnEdge: true,
  /** DESIGN §6.4 pauses the heat in every manual. A manual started without leaving the ground since the previous
   *  manual (manual → roll → manual: release and re-press, or pulse the manual key) keeps the heat running instead,
   *  unless it is the combo's one linked manual: otherwise back-to-back 1.0 s manuals hold a combo for a whole area
   *  visit without a real trick (DESIGN §13.2). If the heat runs out in it, the combo banks when the manual ends.
   *  The first manual after every touchdown still pauses it, so the 3.0 / 2.2 / 1.6 … budgets stay usable between
   *  real tricks. Filed for the design owner in docs/core-requests.md (GP 7); true restores DESIGN §6.4 exactly. */
  backToBackManualPausesHeat: false,
  /** Pose: ticks a revert keeps `fakie` visible after the touchdown, so the view sees the 180 land fakie and pivot. */
  revertPoseTicks: 3,
  /** Pose: ticks after a touchdown that read as the 'land' pose. */
  landPoseTicks: 6,
} as const;
