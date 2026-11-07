// ui/ui.config.ts: every UI timing and layout number in one place (DESIGN §13.8, §16.3, §17.3–17.4, §18.9), so
// playtest tuning never hunts through the screens. Pure data; the modules import from here.

/** Run HUD (DESIGN §13.8). Text is batched at ≤ textHz; the reward toast must be gone by 3.0 s. */
export const HUD_TIMING = { textHz: 15, rollSec: 0.3, trickHoldSec: 1.6, trickMinPx: 9, rewardSec: 2.7, bankWarnSec: 0.75 } as const;
/** HUD band columns (ui/fit.ts hudColumns; DESIGN §13.8): k = vw / 390 clamped; the score column holds 7 glyphs of
 *  26·k px digits (×3.95 em), coins 17·k px (×3.9 em), the pause hit area is 56 px; the middle takes what is left. */
export const HUD_LAYOUT = { kMin: 0.85, kMax: 1.3, refW: 390, padL: 10, padR: 4, gap: 6, pause: 56, scorePx: 26, scoreEm: 3.95,
  coinPx: 17, coinEm: 4.5, coinGap: 2, midMin: 40,
  /** The coin chip's padding + border (hud.css .hud-coins, BRAND §4.4): taken off the text's width. */
  coinChip: 18,
  /** Text fitting (ui/hud.ts): base sizes (× k, as in hud.css) and the smallest a long value may shrink to. */
  comboPx: 15, trickPx: 11, scoreMinPx: 14, coinMinPx: 10, comboMinPx: 9, comboPad: 20 } as const;
/** Popups beside the skater (DESIGN §17.4): one at a time, ≤ 0.5 s, 0.6 → 1.1 → 1 in 120 ms; offsets in CSS px. */
export const POPUP = { sec: 0.5, popIn: 0.12, holdTo: 0.3, dx: 72, dy: -46, pool: 4, edge: 64 } as const;
/** The "rest here" ring stays up this long into runs 1–3 even without a hint (the Roll-out). */
export const REST_MARK_SEC = 9;
/** Crate reveal (DESIGN §16.3): 3 taps, lid + beam, the card rising, the duplicate shatter. */
export const REVEAL = { taps: 3, lidMs: 520, riseMs: 950, coinsMs: 900 } as const;
/** Results tallies (DESIGN §17.2): score 0.8 s, then coins, the XP bar (per level crossed) and the rewards strip. */
export const RESULTS_ANIM = { scoreMs: 800, coinsAt: 450, coinsMs: 700, xpAt: 900, xpMsPerLevel: 650, rewardsAt: 1300,
  /** A crate this run earned (the Level 2 crate) opens its reveal this long after the rewards strip appears. */
  revealDelayMs: 450 } as const;
/** Lo-fi overlay (DESIGN §18.9): a 128² grain tile at plain alpha 0.05, moved at 8 fps; Neon scanlines at 4%. */
export const LOFI = { tile: 128, alpha: 0.05, fps: 8, scanAlpha: 0.04 } as const;
/** Shop "Today's picks" cards: the name size (as in screens.css) and the smallest a long single word ("Stickerbomb"
 *  in a 320 px pick card) may shrink to rather than break mid-word. */
export const PICK_NAME = { px: 11, minPx: 9 } as const;
/** Toasts: default duration and the trick-discovery toast during runs (kept short: it sits over the far street). */
export const TOAST = { defaultMs: 2000, discoveryMs: 1400, maxStacked: 2 } as const;
/** Title: a crate reveal still waiting opens by itself this long after the Title appears (once per session). */
export const TITLE = { revealDelayMs: 600 } as const;
