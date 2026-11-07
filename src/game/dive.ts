// game/dive.ts: the Title → run dive (owner request, DESIGN §17.1 "tap"): TAP TO ROLL pushes the camera into the Earth
// at the run's start city, through a warm cloud wash, and out at the run camera's starting pose. This file is the
// clock (start, skip, the hand-over exactly once) and the timeline the title scene draws from; it knows nothing
// about three. Reduced motion (the OS setting, Settings › Reduce motion or Reduce effects) is a 0.3 s fade instead.
//   0 ────────── space (push toward the city, wash rises) ── switchSec ── world (descent onto the street, wash opens) ── sec
export const DIVE = {
  /** Whole dive and the moment the world replaces space under a fully opaque wash. */
  sec: 1.45, switchSec: 0.7,
  /** Space phase: the wash rises over this fraction of it (cloud layer reached). */
  washIn: [0.44, 0.88] as const,
  /** World phase: the wash opens from the centre over this fraction of it. */
  washOut: [0.04, 0.62] as const,
  /** Reduced motion: a plain fade to the wash colour and back. */
  reducedSec: 0.3,
} as const;

/** What the title scene needs to draw one dive frame. */
export interface DiveView {
  phase: 'space' | 'world';
  /** Space-phase progress 0…1 (1 for the world phase). */
  u: number;
  /** World-phase progress 0…1 (0 during the space phase). */
  v: number;
  /** Wash coverage 0…1 (1 = opaque). */
  cover: number;
  /** Radius of the clear hole the wash opens (screen units of the short side; < 0 = closed). */
  hole: number;
  /** 1 = reduced motion: a flat fade, no camera motion. */
  flat: number;
}

const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The dive timeline at `t` seconds (pure; writes into `out`). */
export function diveShape(t: number, reduced: boolean, out: DiveView): DiveView {
  if (reduced) {
    const half = DIVE.reducedSec / 2;
    out.phase = t < half ? 'space' : 'world';
    out.u = Math.min(1, t / half); out.v = Math.max(0, Math.min(1, (t - half) / half));
    out.cover = t < half ? ss(0, 1, t / half) : 1 - ss(0, 1, (t - half) / half);
    out.hole = -1; out.flat = 1;
    return out;
  }
  out.flat = 0;
  if (t < DIVE.switchSec) {
    const u = Math.max(0, t / DIVE.switchSec);
    out.phase = 'space'; out.u = u; out.v = 0;
    out.cover = ss(DIVE.washIn[0], DIVE.washIn[1], u);
    out.hole = -1;
  } else {
    const v = Math.min(1, (t - DIVE.switchSec) / (DIVE.sec - DIVE.switchSec));
    out.phase = 'world'; out.u = 1; out.v = v;
    out.cover = 1;
    out.hole = -0.7 + 2.4 * ss(DIVE.washOut[0], DIVE.washOut[1], v);
  }
  return out;
}

/** The dive's clock: `tick(dt)` advances it, `skip()` jumps to the end; `onEnd` (the hand-over to the live run) runs
 *  exactly once, whichever comes first. `cancel()` stops it without a hand-over (the App left for another screen). */
export class DiveClock {
  t = 0;
  readonly dur: number;
  private state: 'running' | 'ended' | 'cancelled' = 'running';
  private readonly view: DiveView = { phase: 'space', u: 0, v: 0, cover: 0, hole: -1, flat: 0 };

  constructor(readonly reduced: boolean, private readonly onEnd: () => void) {
    this.dur = reduced ? DIVE.reducedSec : DIVE.sec;
  }

  get active(): boolean { return this.state === 'running'; }
  get ended(): boolean { return this.state === 'ended'; }

  /** Tools (shots, title.spec): freeze the dive at `t` seconds (null resumes it). */
  hold: number | null = null;

  /** Advances by dt seconds (clamped to a 0.1 s step, like the loop); hands over when the dive is complete. */
  tick(dt: number): void {
    if (this.state !== 'running') return;
    if (this.hold !== null) { this.t = Math.min(this.dur - 1e-3, Math.max(0, this.hold)); return; }
    this.t += Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
    if (this.t >= this.dur) this.end();
  }

  /** Any tap during the dive: straight to the run. */
  skip(): void { if (this.state === 'running') this.end(); }

  cancel(): void { if (this.state === 'running') this.state = 'cancelled'; }

  /** The timeline at the current time (a shared object, valid until the next call). */
  shape(): DiveView { return diveShape(this.t, this.reduced, this.view); }

  private end(): void {
    this.t = this.dur;
    this.state = 'ended';
    this.onEnd();
  }
}
