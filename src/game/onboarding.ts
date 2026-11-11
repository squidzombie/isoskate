// game/onboarding.ts: interim first-runs hints (G0 review; DESIGN §12.5, decision row 59). Runs 1–3 that start at
// t = 0 get three text chips on the Roll-out, timed from its fixed layout (world/gen ROLLOUT_*); with two thumbs on
// touch (the default, DESIGN §4.1) ui/hints.ts words them for the zones and draws the STEER / TRICKS rings:
//   - "DRAG LEFT THUMB TO STEER" ("DRAG TO STEER" with one thumb) from 0.3 s until the player has steered 0.6 m (or
//     the tap hint takes over);
//   - "TAP RIGHT TO OLLIE" ("TAP TO OLLIE") 1.2 s before the 3.5 s chain, until an ollie (or the chain is passed);
//   - "OLLIE ONTO THE LEDGE" after the chain, until a grind starts (or the ledge is passed).
// Two-thumb re-teach (owner playtest, §24 row 71): a profile that played before the two-thumb controls (sanitize marks
// it: onboarding.twoThumbIntro = -1) gets the same chips once more, in its next normal run on a touch screen with two
// thumbs; the run is recorded in twoThumbIntro so the UI shows the rings and the "new controls" toasts for that run.
// A crash clears the chip. M4 replaces this with the Lesson Line hints (ghost thumb, key caps, rest mark, rewinds,
// re-arming after a 3-run crash streak) in this same file; the hint ids are core HintIds.
import type { Bus } from '../core/bus';
import type { GameEvent } from '../core/events';
import type { HintId } from '../core/ids';
import type { SkaterState } from '../core/sim';
import type { SaveStore } from '../core/save';
import type { HudApi } from '../core/ui';
import { ROLLOUT_CHAIN_T, ROLLOUT_LEDGE } from '../world/gen';

export const FIRST_RUN_HINTS = {
  runs: 3,                     // runsStarted ≤ this (it is incremented when the run starts)
  dragFrom: 0.3, steeredM: 0.6,
  tapLead: 1.2, tapAfter: 0.3, // relative to ROLLOUT_CHAIN_T
  grindLead: 1.4, grindAfter: 0.4,   // relative to ROLLOUT_LEDGE.t0
} as const;

export interface FirstRunOptions {
  /** The two-thumb re-teach reads and marks onboarding.twoThumbIntro (absent: no re-teach). */
  save?: Pick<SaveStore, 'data' | 'mutate'>;
  /** A touch (coarse) pointer: the re-teach is about thumbs, so keyboard and mouse players never get it. */
  touch?: () => boolean;
}

/** Is `runsStarted` the run that re-teaches the two-thumb controls (the UI shows the rings and toasts for it)? */
export const isTwoThumbIntroRun = (ob: { runsStarted: number; twoThumbIntro?: number }): boolean =>
  ob.runsStarted > FIRST_RUN_HINTS.runs && ob.twoThumbIntro === ob.runsStarted;

export class FirstRunHints {
  private armed = false;
  private done = new Set<HintId>();
  private shown: HintId | null = null;
  private readonly offs: (() => void)[];

  constructor(private readonly hud: HudApi, bus: Bus<GameEvent>, private readonly o: FirstRunOptions = {}) {
    this.offs = [
      bus.on('ollie', () => this.done.add('tap')),
      bus.on('grindStart', () => this.done.add('grind')),
      bus.on('crash', (e) => { if (!e.god) this.stop(); }),
    ];
  }

  /** At run start: arm for the first runs of a profile on a normal t = 0 start (and once for the two-thumb re-teach). */
  start(runsStarted: number, startT: number, god: boolean): void {
    this.done.clear();
    const normal = startT === 0 && !god, first = runsStarted <= FIRST_RUN_HINTS.runs;
    const intro = normal && !first && this.introDue();
    if (intro) this.o.save!.mutate((s) => { s.onboarding.twoThumbIntro = runsStarted; });
    this.armed = normal && (first || intro);
    this.set(null);
  }

  /** The re-teach is due: an old profile, two thumbs selected, on a touch screen. */
  private introDue(): boolean {
    const d = this.o.save?.data;
    return !!d && d.onboarding.twoThumbIntro === -1 && (d.settings.controls ?? 'two') === 'two' && (this.o.touch?.() ?? false);
  }

  stop(): void { this.armed = false; this.set(null); }

  /** Every rendered frame of a run (`t` = run time, s). */
  update(t: number, cur: Readonly<SkaterState>): void {
    if (!this.armed) return;
    const H = FIRST_RUN_HINTS;
    if (Math.abs(cur.targetX) >= H.steeredM || Math.abs(cur.p.x) >= H.steeredM) this.done.add('drag');
    let want: HintId | null = null;
    if (t >= ROLLOUT_LEDGE.t0 - H.grindLead && t < ROLLOUT_LEDGE.t0 + H.grindAfter) want = this.done.has('grind') ? null : 'grind';
    else if (t >= ROLLOUT_CHAIN_T - H.tapLead && t < ROLLOUT_CHAIN_T + H.tapAfter) want = this.done.has('tap') ? null : 'tap';
    else if (t >= H.dragFrom && t < ROLLOUT_CHAIN_T - H.tapLead) want = this.done.has('drag') ? null : 'drag';
    if (t >= ROLLOUT_LEDGE.t0 + H.grindAfter) this.armed = false;
    this.set(want);
  }

  dispose(): void { for (const off of this.offs) off(); }

  private set(id: HintId | null): void {
    if (id === this.shown) return;
    this.shown = id;
    this.hud.hint(id);
  }
}
