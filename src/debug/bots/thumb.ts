// debug/bots/thumb.ts: the thumb bot (TECH §11.2). It renders the safe bot's plan as pointer traces and feeds them
// through the real gesture recognizer (input/index.ts createRecognizer) and frame binning (FrameBuilder), so the sim
// sees exactly what a phone would send. Two profiles, one per Settings "Touch controls" choice (DESIGN §4.1):
//
// `layout: 'two'` (the default): two thumbs.
//  - The LEFT thumb only steers: it lands on the left half and slides past the slop at once, follows the plan's x
//    smoothed by a bell-shaped kernel (minimum-jerk-like velocity), rests between moves and carries ±3 px of slow
//    tremor. Human jerk on top: every 1.2–3.5 s a nervous twitch out and back, straight up or down (34–50 px at
//    0.8–1.6 px/ms), and in the air of half of its ollies a hard sideways dodge (34–44 px at 1.2–1.6 px/ms, ±10°):
//    the strokes a one-thumb grammar reads as ollies, impossible flips, shove-its or kickflips; and a re-grip (lift,
//    then down again near home) when it has wandered more than REGRIP_PX from home at a calm moment of the plan, or
//    at once when it reaches a screen edge.
//  - The RIGHT thumb only tricks: the plan's ollies as taps, 60–260 ms long (uniform; capped at 190 ms where a HOLD
//    would start a manual: an open combo window or a prop top under the board), never pressed down in the pre-press
//    window before a touchdown; on flat ground about a third of them as ↑ flicks instead (40–70 px at 0.9–1.6 px/ms,
//    within ±25° of vertical: the ollie fires on recognition).
//  - `rest: true` (a measured habit, not a gate profile): after every tap or flick the right thumb comes back down on
//    the glass 80–300 ms later and stays there, still, until it lifts 30–80 ms before the next tap. A still trick
//    thumb is a HOLD (DESIGN §4.4 rule 3): a grab when it lands early in an ollie's air, a pre-press or a held grab
//    becoming a manual on landing, a manual in a combo's link window; and a rest lifted ≤ 600 ms after it went down
//    reads as a (long) tap. The gate holds it to 0 crashes, flips and spins, and reports its grab and manual rates
//    (the design trade-off of two thumbs) instead of gating them.
// `layout: 'one'`: the one-thumb grammar (the G1 bot, unchanged): one steering thumb in the middle, down for the whole
//  run (plan tracking and tremor, no twitches or re-grips), and second-finger taps at the right.
// Both: 0.25 s of total latency (the plan is decided 0.27 s ahead; a tap fires on its finger's lift). The plan asks for
// no tricks, so any flipStart / spinStart / grabStart / manualStart is unintended.
import type { GestureRecognizer, InputFrame, PointerSample } from '../../core/input';
import { Sfc32, hash32 } from '../../core/rng';
import type { Sim } from '../../core/sim';
import { DT, V_LAT_MAX } from '../../core/tuning';
import { FrameBuilder, createRecognizer, steerMetresPerPx } from '../../input';
import { SafeBot } from './safe';

const SCREEN_W = 390, SCREEN_H = 844;
const TREMOR_PX = 3;
/** Thumb homes (CSS px). One thumb: the steering thumb in the middle and second-finger taps at the right (the G1
 *  bot). Two thumbs: the left thumb a quarter in from the left edge, the right one a quarter in from the right. */
const HOME = {
  one: { steerX: SCREEN_W / 2, steerY: 640, tapX: 300, tapY: 560 },
  two: { steerX: SCREEN_W * 0.25, steerY: 650, tapX: SCREEN_W * 0.75, tapY: 620 },
} as const;
/** Two thumbs: re-grip when the left thumb is this far from home (px) and the plan is calm, or within EDGE_PX of a
 *  screen edge whatever the plan does. */
const REGRIP_PX = 40, EDGE_PX = 14;
/** Bell kernel half-width (s) and taps per side: smooths the plan's corners into human-like strokes. */
const KERNEL_HALF = 0.1, KERNEL_N = 6;
const KERNEL = (() => {
  const w: number[] = [];
  for (let i = -KERNEL_N; i <= KERNEL_N; i++) { const u = i / (KERNEL_N + 1); w.push(Math.cos((u * Math.PI) / 2) ** 2); }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / sum);
})();

export type ThumbLayout = 'two' | 'one';
export interface ThumbOptions {
  seed?: number; latency?: number; layout?: ThumbLayout;
  /** The recognizer's grammar (default: the layout's). The gate's control reads two-thumb traces with 'one'. */
  grammar?: ThumbLayout;
  /** Two thumbs: the right thumb rests on the glass between tricks (see the header; its grabs / manuals are measured). */
  rest?: boolean;
}

/** A twitch of the steering thumb: out along (ux, uy) by `amp` px at `speed` px/ms, a short stop, and back. */
interface Twitch { t0: number; amp: number; speed: number; pause: number; ux: number; uy: number }

export class ThumbBot {
  readonly safe: SafeBot;
  readonly layout: ThumbLayout;
  private readonly rec: GestureRecognizer;
  private readonly frames = new FrameBuilder(() => SCREEN_W);
  private readonly m = steerMetresPerPx(SCREEN_W);
  private readonly rng: Sfc32;
  /** Twitches, re-grips and flicks draw from their own stream, so the one-thumb profile draws exactly the G1 numbers. */
  private readonly jrng: Sfc32;
  private readonly home: (typeof HOME)[ThumbLayout];
  private readonly queue: PointerSample[] = [];
  private started = false;
  private thumbId = 1;                              // the steering thumb's pointer id (a re-grip is a new touch)
  private thumbX: number;                           // the steering thumb's last scheduled x (px, without tremor)
  private steerX = 0;                               // targetX that the scheduled moves will produce
  private desired = 0;
  private readonly tremor: [number, number, number, number];
  private lastLand = -1;
  private readonly expect: { t: number; x: number }[] = [];   // targetX the scheduled moves give at each tick
  private twitch: Twitch | null = null;
  private nextTwitch: number;
  private liftedUntil = -1;                         // re-grip: the thumb is off the glass until this time (s)
  private tapId = 100;
  private airDodgeAt = Infinity;                    // two thumbs: a sideways dodge planned in the air of our ollie
  private readonly restOn: boolean;
  private readonly rrng: Sfc32;                     // the resting right thumb's own stream (the gate profiles never draw it)
  private resting: { id: number; downMs: number } | null = null;
  /** Taps and ↑ flicks sent (trick thumb), twitches and re-grips (steering thumb), rests (`rest`), for the harness. */
  taps = 0; flicks = 0; twitches = 0; regrips = 0; rests = 0;
  /** The steering thumb's x range (px), for the harness. */
  minX = Infinity; maxX = -Infinity;

  constructor(o: ThumbOptions = {}) {
    this.layout = o.layout ?? 'two';
    this.home = HOME[this.layout];
    this.thumbX = this.home.steerX;
    this.rec = createRecognizer({ screenW: SCREEN_W, screenH: SCREEN_H, deadZoneBottomPx: 46, k: 1, controls: o.grammar ?? this.layout });
    this.rng = new Sfc32(hash32(o.seed ?? 1, 0x7b0b));
    this.safe = new SafeBot({ seed: hash32(o.seed ?? 1, 0x7b0c), latency: o.latency ?? 0.27, lazy: false });
    this.tremor = [this.rng.float() * 6.28, this.rng.float() * 6.28, 0.6 + this.rng.float() * 0.4, 1.6 + this.rng.float() * 0.8];
    this.jrng = new Sfc32(hash32(o.seed ?? 1, 0x7b0d));
    this.nextTwitch = 1 + this.jrng.float() * 2;
    this.restOn = this.layout === 'two' && !!o.rest;
    this.rrng = new Sfc32(hash32(o.seed ?? 1, 0x7b0e));
  }

  /** `rest`: the resting right thumb lifts 30–80 ms before a tap that goes down at `downMs` (or never comes down). */
  private liftRest(downMs: number, nowMs: number): void {
    const r = this.resting;
    if (!r) return;
    this.resting = null;
    const upMs = Math.max(nowMs, downMs - 30 - this.rrng.float() * 50);
    if (r.downMs >= upMs - 1) {                   // it had not come down yet: it never does
      const i = this.queue.findIndex((q) => q.id === r.id);
      if (i >= 0) this.queue.splice(i, 1);
      this.rests--;
      return;
    }
    this.push({ id: r.id, tMs: upMs, x: this.home.tapX, y: this.home.tapY + 2, phase: 'up' });
  }

  /** `rest`: the right thumb comes back down 80–300 ms after a tap or flick lifted at `upMs`, still. */
  private comeToRest(upMs: number): void {
    const id = this.tapId++, downMs = upMs + 80 + this.rrng.float() * 220;
    this.push({ id, tMs: downMs, x: this.home.tapX + (this.rrng.float() - 0.5) * 8, y: this.home.tapY + 2, phase: 'down' });
    this.resting = { id, downMs };
    this.rests++;
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

  /** The twitch offset (px) at time t (s): out, a short stop, back. */
  private twitchAt(t: number): [number, number] {
    const w = this.twitch;
    if (!w) return [0, 0];
    const ms = (t - w.t0) * 1000, out = w.amp / w.speed;
    let d = 0;
    if (ms > 0 && ms < out) d = w.amp * (ms / out);
    else if (ms >= out && ms < out + w.pause) d = w.amp;
    else if (ms >= out + w.pause && ms < 2 * out + w.pause) d = w.amp * (1 - (ms - out - w.pause) / out);
    return [w.ux * d, w.uy * d];
  }
  private static twitchEnd(w: Twitch): number { return w.t0 + ((2 * w.amp) / w.speed + w.pause) / 1000; }

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

  /** Two thumbs: the left thumb's human jerk (twitches) and re-grips, scheduled from the tick at `tLand`. */
  private jerk(sim: Sim, tLand: number): void {
    const c = sim.cur;
    if (this.twitch && tLand > ThumbBot.twitchEnd(this.twitch)) this.twitch = null;
    if (this.twitch || tLand < this.liftedUntil + 0.2) return;
    // Re-grip at a calm moment (the plan holds its line for the next 0.6 s and the thumb is on it), or at once, with a
    // quicker lift, when the thumb reaches a screen edge.
    const calm = Math.abs(this.safe.planX(tLand + 0.6) - this.safe.planX(tLand)) < 0.15 && Math.abs(this.desired - this.steerX) < 0.05;
    const edge = this.thumbX < EDGE_PX || this.thumbX > SCREEN_W - EDGE_PX;
    if ((Math.abs(this.thumbX - this.home.steerX) > REGRIP_PX && calm) || edge) {
      const [tx, ty] = this.shake(tLand);
      this.push({ id: this.thumbId, tMs: tLand * 1000 - 1, x: this.thumbX + tx, y: this.home.steerY + ty, phase: 'up' });
      const gap = edge && !calm ? 0.08 + this.jrng.float() * 0.04 : 0.12 + this.jrng.float() * 0.13;
      this.thumbId += 2;
      this.thumbX = this.home.steerX + (this.jrng.float() - 0.5) * 16;
      const t0 = (tLand + gap) * 1000 - 1;
      // Down again and slide past the slop straight up: a DRAG with no sideways motion, so it steers nothing yet.
      this.push({ id: this.thumbId, tMs: t0, x: this.thumbX, y: this.home.steerY + 12, phase: 'down' });
      for (let i = 1; i <= 3; i++) this.push({ id: this.thumbId, tMs: t0 + i * 16, x: this.thumbX, y: this.home.steerY + 12 - 4 * i, phase: 'move' });
      this.liftedUntil = tLand + gap + 0.05;
      this.regrips++;
      return;
    }
    // Half of our ollies get a hard sideways dodge out and back 0.12–0.27 s into their air (the air's low lateral
    // authority turns it into a few cm); every 1.2–3.5 s otherwise a twitch straight up or down, which steers nothing.
    const air = tLand >= this.airDodgeAt;
    if (air) this.airDodgeAt = Infinity;
    else if (c.t < this.nextTwitch) return;
    else this.nextTwitch = c.t + 1.2 + this.jrng.float() * 2.3;
    const side = this.jrng.float() < 0.5 ? -1 : 1, tilt = ((this.jrng.float() - 0.5) * 20 * Math.PI) / 180;
    this.twitch = air
      ? { t0: tLand, amp: 34 + this.jrng.float() * 10, speed: 1.2 + this.jrng.float() * 0.4, pause: this.jrng.float() * 10, ux: side, uy: Math.sin(tilt) }
      : { t0: tLand, amp: 34 + this.jrng.float() * 16, speed: 0.8 + this.jrng.float() * 0.8, pause: 10 + this.jrng.float() * 30, ux: 0, uy: side };
    this.twitches++;
  }

  frame(sim: Sim): Partial<InputFrame> {
    const c = sim.cur;
    if (c.mode === 'crashed') return {};
    const two = this.layout === 'two';
    const H = this.home;
    const tNow = c.t + DT;
    const msNow = tNow * 1000;
    if (!this.started) {
      // The steering thumb lands and slides past the slop at once (a DRAG, never a HOLD), then comes back.
      this.started = true;
      this.steerX = c.targetX; this.desired = c.targetX;
      const t0 = msNow - DT * 1000;
      this.push({ id: this.thumbId, tMs: t0, x: this.thumbX, y: H.steerY, phase: 'down' });
      for (let i = 1; i <= 4; i++) this.push({ id: this.thumbId, tMs: t0 + i * 16, x: this.thumbX + 3 * i, y: H.steerY, phase: 'move' });
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
    if (two) this.jerk(sim, tLand);
    const lifted = tLand < this.liftedUntil;
    if (!lifted) { this.minX = Math.min(this.minX, this.thumbX); this.maxX = Math.max(this.maxX, this.thumbX); }
    // Steering: the plan's x, smoothed, rate-limited, then rendered as thumb motion (+ tremor, + a twitch).
    let want = 0;
    for (let i = 0; i < KERNEL.length; i++) want += KERNEL[i]! * this.safe.planX(tLand + this.safe.lead + ((i - KERNEL_N) / KERNEL_N) * KERNEL_HALF);
    const maxStep = 0.85 * V_LAT_MAX * DT;
    this.desired += Math.max(-maxStep, Math.min(maxStep, want - this.desired));
    // (a thumb moves at most at the planned lateral rate: a catch-up after the sim moved targetX itself, a magnet or a
    // side bump, must not become a flick)
    const dxPx = Math.max(-maxStep, Math.min(maxStep, this.desired - this.steerX)) / this.m;
    const [tx, ty] = this.shake(tLand);
    if (!lifted) {
      if (Math.abs(dxPx) >= 0.25 || this.queue.length === 0) { this.thumbX += dxPx; this.steerX += dxPx * this.m; }
      if (this.twitch) {
        // A fast stroke needs more than one sample per tick: the twitch is drawn 8 ms apart.
        const [ax, ay] = this.twitchAt(tLand - 0.008);
        this.push({ id: this.thumbId, tMs: tLand * 1000 - 9, x: this.thumbX + tx + ax, y: H.steerY + ty + ay, phase: 'move' });
      }
      const [wx, wy] = this.twitchAt(tLand);
      this.push({ id: this.thumbId, tMs: tLand * 1000 - 1, x: this.thumbX + tx + wx, y: H.steerY + ty + wy, phase: 'move' });
      this.expect.push({ t: tLand, x: this.steerX + (tx + wx) * this.m });
    }
    // Tap (or, two thumbs on flat ground, an ↑ flick): the trick finger lifts / fires on the planned tick.
    if (d.tap) {
      let dur = 0.06 + this.rng.float() * 0.2;
      if (sim.score.combo.window > 0 || sim.score.combo.active || this.onTop(sim)) dur = Math.min(dur, 0.19);
      dur = Math.min(dur, tLand - tNow);
      const land = this.lastLand;
      const down = tLand - dur;
      if (land > 0 && down > land - 0.32 && down < land + 0.02) dur = Math.max(0.06, Math.min(dur, tLand - land - 0.03));
      const jx = (this.rng.float() - 0.5) * 2, jy = (this.rng.float() - 0.5) * 2;
      if (this.restOn) this.liftRest(Math.min(tLand - dur, tLand - 0.034 / 0.9) * 1000 - 1, msNow);   // before a tap's or a flick's down
      const id = two ? this.tapId++ : 2;
      if (two && c.mode === 'roll' && !this.onTop(sim) && tLand - 0.06 > land + 0.1 && this.jrng.float() < 0.34) {
        // ↑ within ±25°: ≥ 32 px inside the 80 ms window fires the swipe (the ollie) on recognition, at tLand.
        const a = ((90 + (this.jrng.float() - 0.5) * 50) * Math.PI) / 180, v = 0.9 + this.jrng.float() * 0.7;
        const len = 40 + this.jrng.float() * 30, ux = Math.cos(a), uy = -Math.sin(a);
        const x0 = H.tapX + jx * 6, y0 = H.tapY + jy * 6, t0 = tLand * 1000 - 1 - 34 / v;
        this.push({ id, tMs: t0, x: x0, y: y0, phase: 'down' });
        for (let ms = 8; ms < len / v; ms += 8) this.push({ id, tMs: t0 + ms, x: x0 + ux * v * ms, y: y0 + uy * v * ms, phase: 'move' });
        this.push({ id, tMs: t0 + len / v, x: x0 + ux * len, y: y0 + uy * len, phase: 'up' });
        if (this.restOn) this.comeToRest(t0 + len / v);
        this.flicks++;
      } else {
        this.push({ id, tMs: (tLand - dur) * 1000 - 1, x: H.tapX + jx, y: H.tapY + jy, phase: 'down' });
        this.push({ id, tMs: tLand * 1000 - 1, x: H.tapX + jx, y: H.tapY + jy, phase: 'up' });
        if (this.restOn) this.comeToRest(tLand * 1000 - 1);
        this.taps++;
      }
      // Touchdown of this ollie (flat-ground estimate; the plan's own landing is in the safe bot).
      this.lastLand = tLand + 0.62;
      if (two && this.jrng.float() < 0.5) this.airDodgeAt = tLand + 0.12 + this.jrng.float() * 0.15;
    }
    // Feed what is due this tick through the recognizer and bin it.
    while (this.queue.length && this.queue[0]!.tMs <= msNow) this.frames.pushAll(this.rec.feed(this.queue.shift()!));
    this.frames.pushAll(this.rec.tick(msNow));
    return this.frames.frame(msNow);
  }
}
