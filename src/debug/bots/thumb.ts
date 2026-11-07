// debug/bots/thumb.ts: the thumb bot (TECH §11.2). It renders the safe bot's plan as pointer traces and feeds them
// through the real gesture recognizer (input/index.ts createRecognizer) and frame binning (FrameBuilder), so the sim
// sees exactly what a phone would send:
//  - one steering thumb, down for the whole run, that became a DRAG right away; it follows the plan's x smoothed by a
//    bell-shaped kernel (minimum-jerk-like velocity), rests between moves and carries ±3 px of slow tremor;
//  - taps by a second finger, 60–260 ms long (uniform; capped at 190 ms where a HOLD would start a manual: an open
//    combo window or a prop top under the board), never pressed down in the pre-press window before a touchdown;
//  - 0.25 s of total latency (the plan is decided 0.27 s ahead; a tap fires on its finger's lift).
// It asks for no tricks, so any flipStart / spinStart / grabStart / manualStart is unintended.
import type { InputFrame, PointerSample } from '../../core/input';
import { Sfc32, hash32 } from '../../core/rng';
import type { Sim } from '../../core/sim';
import { DT, V_LAT_MAX } from '../../core/tuning';
import { FrameBuilder, createRecognizer, steerMetresPerPx } from '../../input';
import { SafeBot } from './safe';

const SCREEN_W = 390, SCREEN_H = 844;
const THUMB_Y = 640, TAP_X = 300, TAP_Y = 560;
const TREMOR_PX = 3;
/** Bell kernel half-width (s) and taps per side: smooths the plan's corners into human-like strokes. */
const KERNEL_HALF = 0.1, KERNEL_N = 6;
const KERNEL = (() => {
  const w: number[] = [];
  for (let i = -KERNEL_N; i <= KERNEL_N; i++) { const u = i / (KERNEL_N + 1); w.push(Math.cos((u * Math.PI) / 2) ** 2); }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / sum);
})();

export interface ThumbOptions { seed?: number; latency?: number }

export class ThumbBot {
  readonly safe: SafeBot;
  private readonly rec = createRecognizer({ screenW: SCREEN_W, screenH: SCREEN_H, deadZoneBottomPx: 46, k: 1 });
  private readonly frames = new FrameBuilder(() => SCREEN_W);
  private readonly m = steerMetresPerPx(SCREEN_W);
  private readonly rng: Sfc32;
  private readonly queue: PointerSample[] = [];
  private started = false;
  private thumbX = SCREEN_W / 2;                    // the steering thumb's last scheduled x (px, without tremor)
  private steerX = 0;                               // targetX that the scheduled moves will produce
  private desired = 0;
  private readonly tremor: [number, number, number, number];
  private lastLand = -1;
  private readonly expect: { t: number; x: number }[] = [];   // targetX the scheduled moves give at each tick
  /** Taps sent (lift times) and their durations, for the harness. */
  taps = 0;

  constructor(o: ThumbOptions = {}) {
    this.rng = new Sfc32(hash32(o.seed ?? 1, 0x7b0b));
    this.safe = new SafeBot({ seed: hash32(o.seed ?? 1, 0x7b0c), latency: o.latency ?? 0.27, lazy: false });
    this.tremor = [this.rng.float() * 6.28, this.rng.float() * 6.28, 0.6 + this.rng.float() * 0.4, 1.6 + this.rng.float() * 0.8];
  }

  private push(s: PointerSample): void {
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1]!.tMs > s.tMs) i--;
    this.queue.splice(i, 0, s);
  }

  /** Slow tremor (px) at time t (s). */
  private shake(t: number): [number, number] {
    const [p, q, f1, f2] = this.tremor;
    return [TREMOR_PX * (0.65 * Math.sin(6.283 * f1 * t + p) + 0.35 * Math.sin(6.283 * f2 * t + q)),
      TREMOR_PX * 0.6 * Math.sin(6.283 * f2 * 0.7 * t + p + q)];
  }

  /** A prop top under the board (a HOLD there starts a manual even without a combo window). */
  private onTop(sim: Sim): boolean {
    const c = sim.cur;
    for (const ob of sim.world.obstacles(c.p.s - 1, c.p.s + 1)) {
      if (ob.kind === 'curb') continue;
      for (const sl of ob.slabs) {
        if (c.p.s >= sl.s0 && c.p.s < sl.s1 && c.p.x >= sl.x0 && c.p.x <= sl.x1 && Math.abs(c.groundY - Math.max(sl.y0, sl.y1)) < 0.25) return true;
      }
    }
    return false;
  }

  frame(sim: Sim): Partial<InputFrame> {
    const c = sim.cur;
    if (c.mode === 'crashed') return {};
    const tNow = c.t + DT;
    const msNow = tNow * 1000;
    if (!this.started) {
      // The steering thumb lands and slides past the slop at once (a DRAG, never a HOLD), then comes back.
      this.started = true;
      this.steerX = c.targetX; this.desired = c.targetX;
      const t0 = msNow - DT * 1000;
      this.push({ id: 1, tMs: t0, x: this.thumbX, y: THUMB_Y, phase: 'down' });
      for (let i = 1; i <= 4; i++) this.push({ id: 1, tMs: t0 + i * 16, x: this.thumbX + 3 * i, y: THUMB_Y, phase: 'move' });
      this.thumbX += 12; this.steerX += 12 * this.m;
    }
    // Drift: the sim clamps targetX at the street edges; keep the bookkeeping on the sim's value.
    let ex: number | null = null;
    while (this.expect.length && this.expect[0]!.t <= c.t + 1e-6) ex = this.expect.shift()!.x;
    if (ex !== null && Math.abs(c.targetX - ex) > 1e-3) {
      // Apply the sim's own change once: the moves still in flight were planned from the old bookkeeping, so their
      // expectations shift by the same amount (else every one of them re-applies it: a delayed loop that diverges).
      const dd = c.targetX - ex;
      this.steerX += dd;
      for (const e of this.expect) e.x += dd;
    }
    const d = this.safe.decide(sim);
    const tLand = tNow + this.safe.latency;
    // Steering: the plan's x, smoothed, rate-limited, then rendered as thumb motion (+ tremor).
    let want = 0;
    for (let i = 0; i < KERNEL.length; i++) want += KERNEL[i]! * this.safe.planX(tLand + this.safe.lead + ((i - KERNEL_N) / KERNEL_N) * KERNEL_HALF);
    const maxStep = 0.85 * V_LAT_MAX * DT;
    this.desired += Math.max(-maxStep, Math.min(maxStep, want - this.desired));
    // (a thumb moves at most at the planned lateral rate: a catch-up after the sim moved targetX itself, a magnet or a
    // side bump, must not become a flick)
    const dxPx = Math.max(-maxStep, Math.min(maxStep, this.desired - this.steerX)) / this.m;
    const [tx, ty] = this.shake(tLand);
    if (Math.abs(dxPx) >= 0.25 || this.queue.length === 0) {
      this.thumbX += dxPx; this.steerX += dxPx * this.m;
    }
    this.push({ id: 1, tMs: tLand * 1000 - 1, x: this.thumbX + tx, y: THUMB_Y + ty, phase: 'move' });
    this.expect.push({ t: tLand, x: this.steerX + tx * this.m });
    // Tap: the second finger lifts on the planned tick.
    if (d.tap) {
      let dur = 0.06 + this.rng.float() * 0.2;
      if (sim.score.combo.window > 0 || sim.score.combo.active || this.onTop(sim)) dur = Math.min(dur, 0.19);
      dur = Math.min(dur, tLand - tNow);
      const land = this.lastLand;
      const down = tLand - dur;
      if (land > 0 && down > land - 0.32 && down < land + 0.02) dur = Math.max(0.06, Math.min(dur, tLand - land - 0.03));
      const jx = (this.rng.float() - 0.5) * 2, jy = (this.rng.float() - 0.5) * 2;
      this.push({ id: 2, tMs: (tLand - dur) * 1000 - 1, x: TAP_X + jx, y: TAP_Y + jy, phase: 'down' });
      this.push({ id: 2, tMs: tLand * 1000 - 1, x: TAP_X + jx, y: TAP_Y + jy, phase: 'up' });
      this.taps++;
      // Touchdown of this ollie (flat-ground estimate; the plan's own landing is in the safe bot).
      this.lastLand = tLand + 0.62;
    }
    // Feed what is due this tick through the recognizer and bin it.
    while (this.queue.length && this.queue[0]!.tMs <= msNow) this.frames.pushAll(this.rec.feed(this.queue.shift()!));
    this.frames.pushAll(this.rec.tick(msNow));
    const f = this.frames.frame(msNow);
    return f;
  }
}
