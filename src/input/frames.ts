// input/frames.ts: timestamped gesture queue → one InputFrame per sim tick (TECH §6.1 input binning, §7.1).
// steer px → metres via S = 9 / (0.55·screenWidthPx) × sensitivity.
import type { Dir8 } from '../core/ids';
import type { Gesture, InputFrame } from '../core/input';
import { EMPTY_FRAME } from '../core/input';

export interface KeyLevels { steerAxis: number; manualKey: boolean; grab: boolean }
export interface KeyEdge { tMs: number; tap?: boolean; swipe?: Dir8; amend?: boolean }

export class FrameBuilder {
  private queue: Gesture[] = [];
  private keyEdges: KeyEdge[] = [];
  private hold = false;
  private pressCount = 0;
  sensitivity = 1;
  constructor(private readonly screenW: () => number) {}

  push(g: Gesture): void { this.queue.push(g); }
  pushKey(e: KeyEdge): void { this.keyEdges.push(e); }
  clear(): void { this.queue.length = 0; this.keyEdges.length = 0; this.hold = false; this.pressCount = 0; }

  /** Collect everything with tMs ≤ tickEndMs. Only one swipe per tick; later swipes wait for the next tick. */
  frame(tickEndMs: number, keys: KeyLevels): InputFrame {
    const f: InputFrame = { ...EMPTY_FRAME };
    const mPerPx = (9 / (0.55 * Math.max(1, this.screenW()))) * this.sensitivity;
    let i = 0;
    for (; i < this.queue.length; i++) {
      const g = this.queue[i]!;
      if (g.tMs > tickEndMs) break;
      if (g.k === 'swipe' && f.swipe) break;
      switch (g.k) {
        case 'steer': f.steerDx += g.dxPx * mPerPx; break;
        case 'tap': f.tap = true; break;
        case 'swipe': f.swipe = g.dir; f.swipeDx = g.dxPx * mPerPx; f.swipeFast = g.fast; f.swipeFromRest = g.fromRest; f.swipeSteer = g.steer; break;
        case 'holdStart': this.hold = true; break;
        case 'holdEnd': this.hold = false; break;
        case 'press': this.pressCount = Math.max(0, this.pressCount + (g.down ? 1 : -1)); break;
      }
    }
    this.queue.splice(0, i);
    let j = 0;
    for (; j < this.keyEdges.length; j++) {
      const e = this.keyEdges[j]!;
      if (e.tMs > tickEndMs) break;
      if (e.swipe && f.swipe) break;
      if (e.tap) f.tap = true;
      if (e.swipe) { f.swipe = e.swipe; f.swipeFast = true; f.swipeAmend = !!e.amend; }
    }
    this.keyEdges.splice(0, j);
    f.steerAxis = keys.steerAxis;
    f.hold = this.hold;
    f.manualKey = keys.manualKey;
    f.press = this.pressCount > 0 || keys.manualKey;
    f.grab = keys.grab;
    return f;
  }
}
