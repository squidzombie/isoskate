// input/pipeline.ts: recognizer + keyboard mapper + frame builder, with no DOM. The DOM InputSource (index.ts), the
// debug API (`__skate.pointer`, manual stepping) and bots all drive this same pipeline, so a synthetic trace and a
// real thumb produce identical InputFrames.
import type { InputFrame, PointerSample } from '../core/input';
import { FrameBuilder } from './frames';
import { KeyboardMapper } from './keyboard';
import { createRecognizerImpl, type Recognizer, type RecognizerConfigExt } from './recognizer';

export class InputPipeline {
  readonly rec: Recognizer;
  readonly frames: FrameBuilder;
  readonly keys = new KeyboardMapper();
  private readonly scheduled: PointerSample[] = [];

  constructor(screenW: () => number, cfg?: Partial<RecognizerConfigExt>) {
    this.rec = createRecognizerImpl(cfg);
    this.frames = new FrameBuilder(screenW);
  }

  /** A live sample (DOM): fed now; its gestures are binned by their timestamps. */
  feed(s: PointerSample): void { this.frames.pushAll(this.rec.feed(s)); }

  /** Synthetic samples, fed when due inside frame(), so HOLD timing and binning match a real touch.
   *  `offsetMs` is added to every tMs (anchors a relative trace to the clock frame() is called with). */
  schedule(samples: readonly PointerSample[], offsetMs = 0): void {
    for (const s of samples) {
      const e = { ...s, tMs: s.tMs + offsetMs };
      let i = this.scheduled.length;
      while (i > 0 && this.scheduled[i - 1]!.tMs > e.tMs) i--;
      this.scheduled.splice(i, 0, e);
    }
  }

  /** A key down. `edges` false (input disabled) only updates the held set. */
  keyDown(code: string, tMs: number, repeat = false, edges = true): void {
    for (const e of this.keys.down(code, tMs, repeat, edges)) this.frames.pushKey(e);
  }
  keyUp(code: string): void { this.keys.up(code); }

  /** One sim tick's frame: due synthetic samples, time-based recognizer transitions, then binning. */
  frame(tickEndMs: number): InputFrame {
    while (this.scheduled.length && this.scheduled[0]!.tMs <= tickEndMs) this.feed(this.scheduled.shift()!);
    this.frames.pushAll(this.rec.tick(tickEndMs));
    return this.frames.frame(tickEndMs, this.keys.levels());
  }

  /** True while synthetic samples or gestures are still queued. */
  get busy(): boolean { return this.scheduled.length > 0 || this.frames.pending > 0; }

  /** Forget touches, queued gestures and synthetic samples (held keys stay: they are physical state). */
  reset(): void { this.rec.reset(); this.frames.clear(); this.scheduled.length = 0; }
}
