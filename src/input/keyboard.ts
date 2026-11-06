// input/keyboard.ts: keyboard presets (DESIGN §4.6, TECH §7.3). Pure: fed with key codes and timestamps, so the same
// rules run in unit tests and in the DOM binding (input/index.ts).
//   Preset A (default): A/D steer (steerAxis), Space/W tap, arrows swipe IMMEDIATELY; a second, perpendicular arrow
//     ≤ 80 ms later emits the diagonal with swipeAmend (the sim upgrades the just-started trick in place if it is
//     < 25% done); a repeated arrow repeats (doubles). S (Shift alias) → press + manualKey. Q → grab.
//   Preset B: ←/→ steer, IJKL for the cardinals and U/O/N/M for the diagonals (no amend needed), Space tap,
//     Shift → press + manualKey, Q → grab.
// Key repeat (`repeat`) never produces edges. Esc, Enter and R belong to the app (game/app.ts).
import type { Dir8 } from '../core/ids';
import type { KeyEdge, KeyLevels } from './frames';

export type KeyPreset = 'A' | 'B';
/** The diagonal amend window of preset A (DESIGN §4.6; the sim side is KEY_DIAG_AMEND in core/tuning.ts). */
export const KEY_AMEND_MS = 80;

const ARROWS: Readonly<Record<string, Dir8>> = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r' };
const PRESET_B_DIRS: Readonly<Record<string, Dir8>> = {
  KeyI: 'u', KeyK: 'd', KeyJ: 'l', KeyL: 'r', KeyU: 'ul', KeyO: 'ur', KeyN: 'dl', KeyM: 'dr',
};
const SHIFT = ['ShiftLeft', 'ShiftRight'];
const GAME_KEYS: Readonly<Record<KeyPreset, ReadonlySet<string>>> = {
  A: new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'Space', ...SHIFT, ...Object.keys(ARROWS)]),
  B: new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyQ', ...SHIFT, ...Object.keys(PRESET_B_DIRS)]),
};

/** The diagonal formed by two perpendicular cardinals, or null. */
export function diagonalOf(a: Dir8, b: Dir8): Dir8 | null {
  const v = (d: Dir8) => (d === 'u' || d === 'd' ? d : null);
  const h = (d: Dir8) => (d === 'l' || d === 'r' ? d : null);
  const vert = v(a) ?? v(b), hor = h(a) ?? h(b);
  if (!vert || !hor || (v(a) && v(b)) || (h(a) && h(b))) return null;
  return `${vert}${hor}` as Dir8;
}

export class KeyboardMapper {
  preset: KeyPreset = 'A';
  private readonly held = new Set<string>();
  private last: { dir: Dir8; tMs: number; amended: boolean } | null = null;

  /** Is `code` a game key of the current preset (the DOM binding preventDefaults these during a run)? */
  isGameKey(code: string): boolean { return GAME_KEYS[this.preset].has(code); }

  /** Key down. Returns the edges it produces (none for repeats, non-game keys or when `edges` is false). The held
   *  set is always updated, so levels are right when input is re-enabled while a key is down. */
  down(code: string, tMs: number, repeat = false, edges = true): KeyEdge[] {
    if (!this.isGameKey(code)) return [];
    this.held.add(code);
    if (repeat || !edges) return [];
    if (this.preset === 'A') {
      if (code === 'Space' || code === 'KeyW') return [{ tMs, tap: true }];
      const dir = ARROWS[code];
      if (!dir) return [];
      const l = this.last;
      if (l && !l.amended && tMs - l.tMs <= KEY_AMEND_MS) {
        const diag = diagonalOf(l.dir, dir);
        if (diag) { l.amended = true; return [{ tMs, swipe: diag, amend: true }]; }
      }
      this.last = { dir, tMs, amended: false };
      return [{ tMs, swipe: dir }];
    }
    if (code === 'Space') return [{ tMs, tap: true }];
    const dir = PRESET_B_DIRS[code];
    return dir ? [{ tMs, swipe: dir }] : [];
  }

  up(code: string): void { this.held.delete(code); }
  /** Window blur: keyups may never arrive. */
  clear(): void { this.held.clear(); this.last = null; }

  levels(): KeyLevels {
    const h = this.held;
    const shift = h.has('ShiftLeft') || h.has('ShiftRight');
    if (this.preset === 'A') {
      return { steerAxis: (h.has('KeyD') ? 1 : 0) - (h.has('KeyA') ? 1 : 0), manualKey: shift || h.has('KeyS'), grab: h.has('KeyQ') };
    }
    return { steerAxis: (h.has('ArrowRight') ? 1 : 0) - (h.has('ArrowLeft') ? 1 : 0), manualKey: shift, grab: h.has('KeyQ') };
  }
}
