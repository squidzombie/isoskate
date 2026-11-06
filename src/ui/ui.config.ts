// ui/ui.config.ts: every UI timing and layout number in one place (DESIGN §13.8, §16.3, §17.3–17.4, §18.9), so
// playtest tuning never hunts through the screens. Pure data; the modules import from here.

/** Run HUD (DESIGN §13.8). Text is batched at ≤ textHz; the reward toast must be gone by 3.0 s. */
export const HUD_TIMING = { textHz: 15, rollSec: 0.3, trickHoldSec: 1.6, trickMinPx: 8, rewardSec: 2.7, bankWarnSec: 0.75 } as const;
/** Popups beside the skater (DESIGN §17.4): one at a time, ≤ 0.5 s, 0.6 → 1.1 → 1 in 120 ms; offsets in CSS px. */
export const POPUP = { sec: 0.5, popIn: 0.12, holdTo: 0.3, dx: 72, dy: -46, pool: 4, edge: 64 } as const;
/** The "rest here" ring stays up this long into runs 1–3 even without a hint (the Roll-out). */
export const REST_MARK_SEC = 9;
/** Crate reveal (DESIGN §16.3): 3 taps, lid + beam, the card rising, the duplicate shatter. */
export const REVEAL = { taps: 3, lidMs: 520, riseMs: 950, coinsMs: 900 } as const;
/** Results tallies (DESIGN §17.2): score 0.8 s, then coins, the XP bar (per level crossed) and the rewards strip. */
export const RESULTS_ANIM = { scoreMs: 800, coinsAt: 450, coinsMs: 700, xpAt: 900, xpMsPerLevel: 650, rewardsAt: 1300 } as const;
/** Lo-fi overlay (DESIGN §18.9): a 128² grain tile at plain alpha 0.05, moved at 8 fps; Neon scanlines at 4%. */
export const LOFI = { tile: 128, alpha: 0.05, fps: 8, scanAlpha: 0.04 } as const;
/** Toasts: default duration and the trick-discovery toast during runs (kept short: it sits over the far street). */
export const TOAST = { defaultMs: 2000, discoveryMs: 1400, maxStacked: 2 } as const;
