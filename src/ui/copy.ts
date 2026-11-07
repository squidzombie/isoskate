// ui/copy.ts: the RECLAIM player-facing lines (THEME §9 "Copy and naming"): calm and plain, never why people left.
// tests/unit/ui/copy.test.ts greps every player-facing string table (this file, the crash lines, hints, the screens,
// the catalog names) for the §9 banned words. The store text lives in docs/STORE.md (never in the bundle).
import type { AreaId } from '../core/ids';

/** The Title line (THEME §9). */
export const TAGLINE = 'The city’s quiet. The streets are yours.';
/** Loading lines, one at a time, wherever the game makes the player wait (THEME §9). DEV has no wait yet; the boot
 *  screen of the Earth Title (pkg/title, `BOOT_LINES`) takes them at its merge. The Title tagline is in screens/title.ts. */
export const LOADING_LINES = ['Waxing the ledges…', 'Shooing a cat off the car…', 'Listening for birds…', 'Finding the smoothest street…'] as const;
/** Empty states (THEME §9). */
export const EMPTY = { trickBook: 'No tricks yet. The streets are waiting.', noRuns: 'The city’s all yours.' } as const;
/** Postcard and arrival subtitles (THEME §9); the area names and ids stay. */
export const AREA_SUBTITLES: Readonly<Record<AreaId, string>> = {
  downtown: 'the quiet plaza', suburbs: 'wildflower lanes', docks: 'the seagrass harbor', neon: 'the night-owl lights',
};
