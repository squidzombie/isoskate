// input/frames.ts: timestamped gesture and key-edge queues → one InputFrame per sim tick (TECH §6.1 input binning,
// §7.1). Everything with tMs ≤ tickEndMs lands in that tick. At most one swipe per tick: a second swipe (and everything
// queued after it) waits for the next tick, so a fast double flick still reaches the sim as two swipes.
// Steering px → metres via S = 9 / (0.55·screenWidthPx) × sensitivity (DESIGN §4.2). A holdEnd marked `release` (a
// still touch lifted 350–600 ms after touch-down) sets the frame's `longTap` (InputFrameExt, GP request).
import type { Dir8 } from '../core/ids';
import type { Gesture } from '../core/input';
import { EMPTY_FRAME } from '../core/input';
import type { InputFrameExt } from '../tricks';
import type { HoldEndExt } from './recognizer';

/** Metres of steering per CSS px of drag (sensitivity applied). */
export const steerMetresPerPx = (screenW: number, sensitivity = 1) => (9 / (0.55 * Math.max(1, screenW))) * sensitivity;
export const SENSITIVITY_MIN = 0.6, SENSITIVITY_MAX = 1.6;

/** Keyboard (or gamepad) level state, sampled once per tick. */
export interface KeyLevels { steerAxis: number; manualKey: boolean; grab: boolean }
export const NO_KEYS: Readonly<KeyLevels> = { steerAxis: 0, manualKey: false, grab: false };
/** A keyboard edge: Space/W tap, or an arrow swipe (`amend`: the 80 ms diagonal amend of preset A). */
export interface KeyEdge { tMs: number; tap?: boolean; swipe?: Dir8; amend?: boolean }

export class FrameBuilder {
  private readonly queue: Gesture[] = [];
  private readonly keyEdges: KeyEdge[] = [];
  private holds = 0;
  private presses = 0;
  sensitivity = 1;
  constructor(private readonly screenW: () => number) {}

  /** Queues a gesture, keeping the queue sorted by time (stable): a HOLD stamped by tick() can be older than live
   *  gestures already queued for a later tick. */
  push(g: Gesture): void {
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1]!.tMs > g.tMs) i--;
    this.queue.splice(i, 0, g);
  }
  pushAll(gs: readonly Gesture[]): void { for (const g of gs) this.push(g); }
  pushKey(e: KeyEdge): void { this.keyEdges.push(e); }
  /** Drops everything queued and every level (run start, pause, setEnabled). */
  clear(): void { this.queue.length = 0; this.keyEdges.length = 0; this.holds = 0; this.presses = 0; }
  get pending(): number { return this.queue.length + this.keyEdges.length; }

  /** Collects everything with tMs ≤ tickEndMs into one frame (called once per sim tick). */
  frame(tickEndMs: number, keys: Readonly<KeyLevels> = NO_KEYS): InputFrameExt {
    const f: InputFrameExt = { ...EMPTY_FRAME };
    const m = steerMetresPerPx(this.screenW(), this.sensitivity);
    let i = 0;
    for (; i < this.queue.length; i++) {
      const g = this.queue[i]!;
      if (g.tMs > tickEndMs || (g.k === 'swipe' && f.swipe)) break;
      switch (g.k) {
        case 'steer': f.steerDx += g.dxPx * m; break;
        case 'tap': f.tap = true; break;
        case 'swipe':
          f.swipe = g.dir; f.swipeDx = g.dxPx * m; f.swipeFast = g.fast; f.swipeFromRest = g.fromRest; f.swipeSteer = g.steer;
          break;
        case 'holdStart': this.holds++; break;
        case 'holdEnd': this.holds = Math.max(0, this.holds - 1); if ((g as HoldEndExt).release) f.longTap = true; break;
        case 'press': this.presses = Math.max(0, this.presses + (g.down ? 1 : -1)); break;
      }
    }
    this.queue.splice(0, i);
    let j = 0;
    for (; j < this.keyEdges.length; j++) {
      const e = this.keyEdges[j]!;
      if (e.tMs > tickEndMs || (e.swipe && f.swipe)) break;
      if (e.tap) f.tap = true;
      if (e.swipe) { f.swipe = e.swipe; f.swipeFast = true; f.swipeAmend = !!e.amend; }
    }
    this.keyEdges.splice(0, j);
    f.steerAxis = keys.steerAxis;
    f.hold = this.holds > 0;
    f.manualKey = keys.manualKey;
    f.press = this.presses > 0 || keys.manualKey;
    f.grab = keys.grab;
    return f;
  }
}
