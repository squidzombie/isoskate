// tricks/interpret.ts: what a gesture means in the current skater state (DESIGN §4.3, §4.4, §4.6; TECH §6.3 step 3).
// Pure: (state view, InputFrame) → Intent[]. The sim applies the intents (sim/step.ts) and owns every side effect.
//
// The steering-stroke rule decides whether a swipe is a trick swipe at all (swipeCounts); a swipe that does not count is
// plain steering (it was already applied; nothing is cancelled). Then, per state, the ordered conflict rules:
//   1 pick window first: every counted swipe is a pick (↑ included); no late cutoff, no upgrades;
//   2 swipe cancel: the sim subtracts swipeDx for intents marked `air: true` (flips, upgrades, air picks); pops keep it;
//   3 resting thumb vs manual: a ground HOLD manuals only in the link window or on a pad / ledge top, and only after
//     RULES.manualHoldSec of stillness; a TAP (or a long tap) is an ollie, also out of a manual;
//   4 pop bleed: no air swipe in the first 70 ms after a pop (keyboard amends excepted: they edit the trick just
//     started);
//   5 too-late flips: < 0.15 s of air left → ignored (↑ becomes a buffered ollie);
//   6 upgrade refusal: an upgrade that could not reach p = 0.55 in the air left is refused (the trick continues);
//   7 re-anchor: done by the sim when it takes lateral control.
// Keyboard amend (preset A): a diagonal flagged swipeAmend converts the trick the previous arrow started ≤ 80 ms ago
// while it is < 25 % done (↑ then → = FS 180 ollie, ← then ↓ = Varial Kickflip); otherwise it is an ordinary swipe.
import type { Dir8, FlipId, GrindId, ManualId, SpinId } from '../core/ids';
import type { InputFrame } from '../core/input';
import type { SkaterMode } from '../core/sim';
import type { TrickTables } from '../core/tricks';
import {
  DT, FLIP_UPGRADE_MAX_PROGRESS, GRAB, GRIND, JUMP_BUFFER, KEY_DIAG_AMEND, LAND, LATE_FLIP_CUTOFF, SPIN_UPGRADE_MAX_PROGRESS,
} from '../core/tuning';
import { RULES } from './score.config';

/** InputFrame plus the GP extension filed in docs/core-requests.md (GP): `longTap`, a still touch released after the
 *  350 ms tap limit but ≤ RecognizerConfigExt.longTapMaxMs after it went down (a HOLD that never moved). It reads as
 *  a TAP wherever the hold started nothing. */
export interface InputFrameExt extends InputFrame { longTap?: boolean }

export type Intent =
  | { k: 'ollie'; air: false }                                   // roll / manual / coyote pop (linked from a manual)
  | { k: 'spinOllie'; dir: 'ur' | 'ul'; air: false }             // pop + FS / BS 180
  | { k: 'flip'; id: FlipId; air: true }
  | { k: 'flipUpgrade'; to: FlipId; air: true }
  | { k: 'spinUpgrade'; to: SpinId; air: true }
  | { k: 'pick'; dir: Dir8; amend: boolean; air: boolean }       // grind pick (in the air, or in the 0.12 s after lock)
  | { k: 'switch'; to: GrindId; inPlace: boolean; air: false }   // grind switch (inPlace: re-targets the last switch)
  | { k: 'popOut'; air: false }
  | { k: 'spinOut'; dir: 'ur' | 'ul'; air: false }
  | { k: 'manualStart'; src: 'hold' | 'key'; air: false }
  | { k: 'noseManual'; air: false }
  | { k: 'grabStart'; air: false }
  | { k: 'grabEnd'; air: false }
  | { k: 'bufferOllie'; air: false }
  | { k: 'amend'; dir: Dir8; air: boolean };                     // keyboard: convert the trick the last arrow started

/** What the last swipe started, for the keyboard amend (DESIGN §4.6). */
export interface AmendView {
  kind: 'ollie' | 'popOut' | 'flip' | 'pick' | 'switch';
  age: number;                     // seconds since it started
  progress: number;                // 0..1 of the trick it started (an ollie / pop-out / pick / switch: 0)
}

/** The slice of skater state interpretation depends on. */
export interface InterpretView {
  mode: SkaterMode;
  airLeft: number;                 // predicted seconds to touchdown or capture
  popBleed: number;                // seconds left of the post-pop swipe dead time
  coyote: number;                  // seconds left to ollie after rolling off an edge
  flip: { id: FlipId; t: number; dur: number } | null;
  spin: { id: SpinId; t: number; dur: number } | null;
  grab: boolean;                   // an Indy grab is held
  grabbed: boolean;                // a grab already happened in this air (one per air)
  pickOpen: boolean;               // grind pick window (also the 0.12 s after lock)
  comboWindow: number;             // link window seconds left (−1 paused / no combo)
  onTop: boolean;                  // rolling on a manual pad or a raised landable top
  manual: { kind: ManualId; switched: boolean; fromHold: boolean } | null;
  manualLatched: boolean;          // the hold / key that started the last manual is still down (no auto-restart)
  pressAge: number;                // seconds the current press has been down (−1: none)
  grind: { id: GrindId; sinceLock: number; switches: number; sinceSwitch: number; lastSwitchDir: Dir8 | null } | null;
  amend: AmendView | null;
}

export const emptyView = (): InterpretView => ({ mode: 'roll', airLeft: 0, popBleed: 0, coyote: 0, flip: null, spin: null,
  grab: false, grabbed: false, pickOpen: false, comboWindow: -1, onTop: false, manual: null, manualLatched: false,
  pressAge: -1, grind: null, amend: null });

const POP_DIRS: readonly Dir8[] = ['u', 'ur', 'ul'];
const SIDEWAYS: readonly Dir8[] = ['l', 'r', 'ul', 'ur', 'dl', 'dr'];
const SWITCH_DIRS: readonly Dir8[] = ['d', 'l', 'r', 'dl', 'dr'];
const EPS = 1e-9;

/** Steering-stroke rule (DESIGN §4.3): does this swipe count as a trick swipe in `mode`?
 *  - `steer` swipes (the steering thumb, mid-stroke): air and grind ← → only `fromRest`, other directions `fast` or
 *    `fromRest`; on the ground (roll, manual) only ↑ ↗ ↖ with `fast` or `fromRest`, other directions never.
 *  - fresh steering strokes (G0: the owner ≤ 150 ms old, swipeDx ≠ 0; other touches and keys carry 0) count in a
 *    direction with a sideways component only if `fast` or `fromRest`; ↑ and ↓ keep the normal threshold.
 *  Grinds ignore steering, so there a sideways swipe from a still-steering thumb could only be an accidental switch:
 *  they use the air rule. */
export function swipeCounts(mode: SkaterMode, f: Readonly<InputFrame>): boolean {
  const d = f.swipe;
  if (!d) return false;
  if (!f.swipeSteer) return f.swipeDx === 0 || !SIDEWAYS.includes(d) || f.swipeFast || f.swipeFromRest;
  if (mode === 'roll' || mode === 'manual') return POP_DIRS.includes(d) && (f.swipeFast || f.swipeFromRest);
  if (d === 'l' || d === 'r') return f.swipeFromRest;
  return f.swipeFast || f.swipeFromRest;
}

const isDiag = (d: Dir8) => d.length === 2;

/** The keyboard amend applies: a diagonal flagged swipeAmend while the trick the last arrow started is ≤ 80 ms old
 *  (the keyboard measured that on key timestamps; here one tick of binning is allowed on top) and < 25 % done (what
 *  it converts into is checked per state). */
function amendable(v: Readonly<InterpretView>, f: Readonly<InputFrame>): boolean {
  return !!f.swipeAmend && !!f.swipe && isDiag(f.swipe) && !!v.amend
    && v.amend.age <= KEY_DIAG_AMEND.ms / 1000 + DT + EPS && v.amend.progress < KEY_DIAG_AMEND.maxProgress;
}

/** A single flip whose input is exactly [dir]. */
const flipFor = (t: TrickTables, dir: Dir8) => t.flips.find((d) => d.input.length === 1 && d.input[0] === dir);
/** A single grind pick whose input is exactly [dir], and the double [dir, dir]. */
const grindFor = (t: TrickTables, dir: Dir8) => t.grinds.find((d) => d.input.length === 1 && d.input[0] === dir);
const grindDouble = (t: TrickTables, dir: Dir8) => t.grinds.find((d) => d.input.length === 2 && d.input[0] === dir && d.input[1] === dir);

/** Interpret one frame. Intents are pushed into `out` (cleared first) and returned. */
export function interpret(v: Readonly<InterpretView>, f: Readonly<InputFrameExt>, tables: TrickTables, out: Intent[]): Intent[] {
  out.length = 0;
  switch (v.mode) {
    case 'crashed': return out;
    case 'roll': return ground(v, f, out);
    case 'manual': return manual(v, f, out);
    case 'air': return air(v, f, tables, out);
    case 'grind': return grind(v, f, tables, out);
  }
}

function pops(d: Dir8 | null, out: Intent[]): boolean {
  if (d === 'u') { out.push({ k: 'ollie', air: false }); return true; }
  if (d === 'ur' || d === 'ul') { out.push({ k: 'spinOllie', dir: d, air: false }); return true; }
  return false;
}

function ground(v: Readonly<InterpretView>, f: Readonly<InputFrameExt>, out: Intent[]): Intent[] {
  if (swipeCounts('roll', f) && pops(f.swipe, out)) return out;
  if (f.tap || f.longTap) { out.push({ k: 'ollie', air: false }); return out; }
  if (v.manualLatched) return out;
  if (f.manualKey) out.push({ k: 'manualStart', src: 'key', air: false });
  else if (f.hold && (v.comboWindow > 0 || v.onTop) && v.pressAge >= RULES.manualHoldSec - EPS) {
    out.push({ k: 'manualStart', src: 'hold', air: false });
  }
  return out;
}

function manual(v: Readonly<InterpretView>, f: Readonly<InputFrameExt>, out: Intent[]): Intent[] {
  if (swipeCounts('manual', f)) {
    if (pops(f.swipe, out)) return out;
    if (f.swipe === 'd' && v.manual && !v.manual.switched) { out.push({ k: 'noseManual', air: false }); return out; }
  }
  // A TAP is a linked ollie (a HOLD released by 350 ms also taps). A long tap (up to 400–600 ms) is one too when this still
  // touch is what started the manual: a nervous long tap never feels like "nothing happened".
  if (f.tap || (f.longTap && v.manual?.fromHold)) out.push({ k: 'ollie', air: false });
  return out;
}

function air(v: Readonly<InterpretView>, f: Readonly<InputFrameExt>, t: TrickTables, out: Intent[]): Intent[] {
  const sw = swipeCounts('air', f) ? f.swipe : null;
  const tapped = f.tap || (!!f.longTap && !v.grab && !v.grabbed);
  // Rule 1: inside the pick window every counted swipe is a pick (↑ included); nothing else applies to it.
  if (sw && v.pickOpen) {
    out.push({ k: 'pick', dir: sw, amend: amendable(v, f) && v.amend!.kind === 'pick', air: true });
    if (tapped && v.airLeft <= JUMP_BUFFER + EPS) out.push({ k: 'bufferOllie', air: false });   // discarded at capture
    return out;
  }
  // Coyote time: still a ground pop.
  if (v.coyote > 0) {
    if (tapped) { out.push({ k: 'ollie', air: false }); return out; }
    if (sw && swipeCounts('roll', f) && pops(sw, out)) return out;
  }
  // Grab: a HOLD (or Q) with ≥ 0.25 s of air left, once per air, not while a flip is rotating. The manual key never
  // grabs (it only arms the pre-press manual). Releasing ends it (the sim also auto-releases before touchdown).
  const held = f.hold || f.grab;
  const flipping = !!v.flip && v.flip.t < v.flip.dur - EPS;
  if (v.grab && !held) out.push({ k: 'grabEnd', air: false });
  else if (!v.grab && held && !v.grabbed && !flipping && v.airLeft >= GRAB.minAirLeft - EPS) out.push({ k: 'grabStart', air: false });
  // Jump buffer: a tap in the last 0.15 s of air ollies on touchdown.
  if (tapped && v.airLeft <= JUMP_BUFFER + EPS) out.push({ k: 'bufferOllie', air: false });
  if (!sw) return out;
  // Keyboard amend: it edits the trick just started, so it is checked before the pop bleed.
  if (amendable(v, f) && amendIn(v, t, sw)) { out.push({ k: 'amend', dir: sw, air: v.amend!.kind === 'flip' }); return out; }
  // Rule 4: pop bleed.
  if (v.popBleed > 0) return out;
  // Rule 5: too late to flip. ↑ becomes a buffered ollie instead.
  if (v.airLeft < LATE_FLIP_CUTOFF - EPS) {
    if (sw === 'u' && v.airLeft <= JUMP_BUFFER + EPS && !tapped) out.push({ k: 'bufferOllie', air: false });
    return out;
  }
  // Spin upgrade: a repeat of the spin's own diagonal while it is < 60 % done (rule 6: refused if the 360 could not
  // reach p = 0.55). Once the spin is 60 % done its diagonal is an ordinary flip swipe (Hardflip / Inward Heelflip).
  if (v.spin && v.spin.t < v.spin.dur - EPS && (sw === 'ur' || sw === 'ul')) {
    const cur = t.spins.find((d) => d.id === v.spin!.id);
    if (cur && cur.input === sw && v.spin.t / v.spin.dur < SPIN_UPGRADE_MAX_PROGRESS - EPS) {
      const up = t.spins.find((d) => d.upgradeOf === v.spin!.id && d.input === sw);
      if (up && (v.spin.t + v.airLeft) / up.dur >= LAND.sketchy - EPS) out.push({ k: 'spinUpgrade', to: up.id, air: true });
      return out;
    }
  }
  if (flipping) {
    // A flip is rotating: only a same-direction repeat can upgrade it (rule 6: a refusal keeps the current flip).
    const f0 = v.flip!;
    const up = t.flips.find((d) => d.upgradeOf === f0.id && d.input[d.input.length - 1] === sw);
    if (up && f0.t / f0.dur < FLIP_UPGRADE_MAX_PROGRESS - EPS && (f0.t + v.airLeft) / up.dur >= LAND.sketchy - EPS) {
      out.push({ k: 'flipUpgrade', to: up.id, air: true });
    }
    return out;
  }
  const def = flipFor(t, sw);
  if (def) out.push({ k: 'flip', id: def.id, air: true });       // a second one in the same air is a Double-up
  return out;
}

/** Air amend targets: an ollie / pop-out becomes a spin ollie / 180 Out (↗ ↖), a flip becomes the diagonal's flip. */
function amendIn(v: Readonly<InterpretView>, t: TrickTables, dir: Dir8): boolean {
  const a = v.amend!;
  if (a.kind === 'ollie' || a.kind === 'popOut') return (dir === 'ur' || dir === 'ul') && !v.spin;
  if (a.kind === 'flip') return !!flipFor(t, dir) && !!v.flip;
  return false;
}

function grind(v: Readonly<InterpretView>, f: Readonly<InputFrameExt>, t: TrickTables, out: Intent[]): Intent[] {
  const g = v.grind;
  const sw = swipeCounts('grind', f) ? f.swipe : null;
  if (sw && v.pickOpen) { out.push({ k: 'pick', dir: sw, amend: amendable(v, f) && v.amend!.kind === 'pick', air: false }); return out; }
  if (f.tap || f.longTap) { out.push({ k: 'popOut', air: false }); return out; }
  if (!sw || !g) return out;
  if (sw === 'u') { out.push({ k: 'popOut', air: false }); return out; }
  if (sw === 'ur' || sw === 'ul') { out.push({ k: 'spinOut', dir: sw, air: false }); return out; }
  if (!SWITCH_DIRS.includes(sw) || g.sinceLock < GRIND.switchAfter - EPS) return out;
  // Keyboard amend of the switch just made: re-target it to the diagonal (no extra switch).
  if (amendable(v, f) && v.amend!.kind === 'switch') {
    const d = grindFor(t, sw);
    if (d && d.id !== g.id) { out.push({ k: 'switch', to: d.id, inPlace: true, air: false }); return out; }
  }
  // A repeat of the last switch's direction soon after it: the double, in place.
  if (g.switches > 0 && g.lastSwitchDir === sw && g.sinceSwitch <= RULES.switchDoubleSec + EPS) {
    const dbl = grindDouble(t, sw);
    if (dbl && dbl.id !== g.id) out.push({ k: 'switch', to: dbl.id, inPlace: true, air: false });
    return out;
  }
  if (g.switches >= GRIND.maxSwitches || (g.switches > 0 && g.sinceSwitch < RULES.switchDoubleSec - EPS)) return out;
  const single = grindFor(t, sw);
  if (!single) return out;
  // Already on that direction's grind (picked ← = Boardslide, then ←): the double.
  const to = single.id === g.id ? grindDouble(t, sw)?.id : single.id;
  if (to && to !== g.id) out.push({ k: 'switch', to, inPlace: false, air: false });
  return out;
}
