// tricks/interpret.ts: what a gesture means in the current skater state (DESIGN §4.3, §4.4; TECH §6.3 step 3).
// Pure: (state view, InputFrame) → Intent[]. The sim applies the intents. M0 covers the minimum trick set:
// ollie (TAP / ↑), coyote ollie, jump buffer, spin ollies (↗ ↖) and their 360 upgrade, single flips with their
// repeat upgrades (table driven), grind picks in the pick window, pop out / 180 Out, manual start.
// Conflict rules applied here, in order: 1 pick window first, steering-stroke rule, 4 pop bleed, 5 late-flip cutoff,
// 6 upgrade refusal. Rule 2 (swipe cancel) is applied by the sim for intents with `swipe: true`.
// TODO(GP W1a): grind switches, nose manual, manual end exits, grabs, keyboard amend, double-swipe picks beyond 2,
// the exhaustive (state × gesture × label) table test.
import type { Dir8, FlipId, SpinId } from '../core/ids';
import type { InputFrame } from '../core/input';
import type { SkaterMode } from '../core/sim';
import type { TrickTables } from '../core/tricks';
import { FLIP_UPGRADE_MAX_PROGRESS, JUMP_BUFFER, LAND, LATE_FLIP_CUTOFF, SPIN_UPGRADE_MAX_PROGRESS } from '../core/tuning';

export type Intent =
  | { k: 'ollie'; swipe: boolean }                       // roll / manual / coyote pop
  | { k: 'spinOllie'; dir: 'ur' | 'ul'; swipe: true }    // pop + FS/BS 180
  | { k: 'flip'; id: FlipId; swipe: true }
  | { k: 'flipUpgrade'; to: FlipId; swipe: true }
  | { k: 'spinUpgrade'; to: SpinId; swipe: true }
  | { k: 'pick'; dir: Dir8; swipe: true }
  | { k: 'popOut'; swipe: boolean }
  | { k: 'spinOut'; dir: 'ur' | 'ul'; swipe: true }
  | { k: 'manualStart' }
  | { k: 'bufferOllie' };

/** The slice of skater state interpretation depends on. */
export interface InterpretView {
  mode: SkaterMode;
  airLeft: number;                 // predicted seconds to touchdown or capture
  popBleed: number;                // seconds left of the post-pop swipe dead time
  coyote: number;                  // seconds left to ollie after rolling off an edge
  flip: { id: FlipId; t: number; dur: number } | null;
  spin: { id: SpinId; t: number; dur: number } | null;
  pickOpen: boolean;               // grind pick window (also the 0.12 s after lock)
  comboWindow: number;             // link window seconds left (−1 paused / no combo)
  onTop: boolean;                  // rolling on a manual pad or ledge top
  manual: boolean;                 // a manual is active
  manualLatched: boolean;          // the hold / key that started the last manual is still down (no auto-restart)
}

const POP_DIRS: readonly Dir8[] = ['u', 'ur', 'ul'];

/** Steering-stroke rule (DESIGN §4.3): a swipe labelled `steer` counts only when it was clearly meant. */
export function swipeCounts(mode: SkaterMode, f: Readonly<InputFrame>): boolean {
  if (!f.swipe || !f.swipeSteer) return true;
  const d = f.swipe;
  if (mode === 'air') return d === 'l' || d === 'r' ? f.swipeFromRest : f.swipeFast || f.swipeFromRest;
  if (mode === 'roll' || mode === 'manual') return POP_DIRS.includes(d) && (f.swipeFast || f.swipeFromRest);
  return f.swipeFast || f.swipeFromRest;
}

/** Interpret one frame. Intents are pushed into `out` (cleared first) and returned. */
export function interpret(v: InterpretView, f: Readonly<InputFrame>, tables: TrickTables, out: Intent[]): Intent[] {
  out.length = 0;
  const sw = f.swipe;
  switch (v.mode) {
    case 'crashed': return out;
    case 'grind': {
      if (sw && v.pickOpen) { out.push({ k: 'pick', dir: sw, swipe: true }); return out; }
      if (f.tap) { out.push({ k: 'popOut', swipe: false }); return out; }
      if (sw && swipeCounts('grind', f)) {
        if (sw === 'u') out.push({ k: 'popOut', swipe: true });
        else if (sw === 'ur' || sw === 'ul') out.push({ k: 'spinOut', dir: sw, swipe: true });
        // TODO(GP W1a): ↓ ← → ↙ ↘ grind switches ≥ GRIND.switchAfter after lock.
      }
      return out;
    }
    case 'roll':
    case 'manual': {
      if (sw && swipeCounts(v.mode, f)) {
        if (sw === 'u') { out.push({ k: 'ollie', swipe: true }); return out; }
        if (sw === 'ur' || sw === 'ul') { out.push({ k: 'spinOllie', dir: sw, swipe: true }); return out; }
      }
      if (f.tap) { out.push({ k: 'ollie', swipe: false }); return out; }
      if (v.mode === 'roll' && !v.manual && !v.manualLatched && (f.manualKey || (f.hold && (v.comboWindow > 0 || v.onTop)))) {
        out.push({ k: 'manualStart' });
      }
      return out;
    }
    case 'air': {
      // Rule 1: inside the pick window every swipe is a pick (↑ included); nothing else applies to it.
      if (sw && v.pickOpen) { out.push({ k: 'pick', dir: sw, swipe: true }); if (f.tap) out.push({ k: 'bufferOllie' }); return out; }
      if (v.coyote > 0) {
        if (f.tap) { out.push({ k: 'ollie', swipe: false }); return out; }
        if (sw && swipeCounts('roll', f)) {
          if (sw === 'u') { out.push({ k: 'ollie', swipe: true }); return out; }
          if (sw === 'ur' || sw === 'ul') { out.push({ k: 'spinOllie', dir: sw, swipe: true }); return out; }
        }
      }
      if (f.tap && v.airLeft <= JUMP_BUFFER) out.push({ k: 'bufferOllie' });
      if (!sw || v.popBleed > 0 || !swipeCounts('air', f)) return out;
      // Rule 5: too late to flip. ↑ becomes a buffered ollie instead.
      if (v.airLeft < LATE_FLIP_CUTOFF) {
        if (sw === 'u' && v.airLeft <= JUMP_BUFFER && !f.tap) out.push({ k: 'bufferOllie' });
        return out;
      }
      // Spin upgrade: a repeat of the spin's own diagonal while it is < 60 % done (rule 6: refused if it can't reach 0.55).
      if (v.spin && (sw === 'ur' || sw === 'ul')) {
        const cur = tables.spins.find((d) => d.id === v.spin!.id);
        const up = tables.spins.find((d) => d.upgradeOf === v.spin!.id && d.input === sw);
        if (cur && cur.input === sw) {
          if (up && v.spin.t / v.spin.dur < SPIN_UPGRADE_MAX_PROGRESS && (v.spin.t + v.airLeft) / up.dur >= LAND.sketchy) {
            out.push({ k: 'spinUpgrade', to: up.id, swipe: true });
          }
          return out;
        }
      }
      if (v.flip && v.flip.t < v.flip.dur - 1e-9) {
        // A flip is rotating: only a same-direction repeat can upgrade it (rule 6 refusal keeps the current flip).
        const up = tables.flips.find((d) => d.upgradeOf === v.flip!.id && d.input[d.input.length - 1] === sw);
        if (up && v.flip.t / v.flip.dur < FLIP_UPGRADE_MAX_PROGRESS && (v.flip.t + v.airLeft) / up.dur >= LAND.sketchy) {
          out.push({ k: 'flipUpgrade', to: up.id, swipe: true });
        }
        return out;
      }
      const def = tables.flips.find((d) => d.input.length === 1 && d.input[0] === sw);
      if (def) out.push({ k: 'flip', id: def.id, swipe: true });
      return out;
    }
  }
}
