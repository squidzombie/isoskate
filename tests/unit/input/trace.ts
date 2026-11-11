// Synthetic pointer traces for the recognizer tests (TECH §7.4). Times in ms, positions in CSS px (390 px screen).
import type { Gesture, PointerSample } from '../../../src/core/input';
import { createRecognizerImpl, type Recognizer, type RecognizerConfigExt } from '../../../src/input/recognizer';

export const W = 390, H = 844;
/** The one-thumb grammar (Settings "One thumb (classic)"): every touch can steer and trick. recognizer.test.ts and the
 *  G0 traces are its tests; the two-thumb layout (the default) is tested in twothumb.test.ts with `makeRec2`. */
export const ONE_THUMB: Partial<RecognizerConfigExt> = { controls: 'one' };
export const makeRec = (cfg: Partial<RecognizerConfigExt> = {}): Recognizer => createRecognizerImpl({ screenW: W, ...ONE_THUMB, ...cfg });
/** The two-thumb layout (the default): steering zone on the left half, trick zone on the right. */
export const makeRec2 = (cfg: Partial<RecognizerConfigExt> = {}): Recognizer => createRecognizerImpl({ screenW: W, controls: 'two', ...cfg });

/** Builds a trace for one pointer: `at` moves the clock, `to` moves the finger in steps of `stepMs`. */
export class Trace {
  readonly samples: PointerSample[] = [];
  t: number; x: number; y: number;
  constructor(readonly id: number, t: number, x: number, y: number) {
    this.t = t; this.x = x; this.y = y;
    this.samples.push({ id, tMs: t, x, y, phase: 'down' });
  }
  /** Straight line to (+dx, +dy) over `ms`, one sample every `stepMs`. */
  move(dx: number, dy: number, ms: number, stepMs = 8): this {
    const n = Math.max(1, Math.round(ms / stepMs));
    const x0 = this.x, y0 = this.y, t0 = this.t;
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      this.x = x0 + dx * u; this.y = y0 + dy * u; this.t = t0 + ms * u;
      this.samples.push({ id: this.id, tMs: this.t, x: this.x, y: this.y, phase: 'move' });
    }
    return this;
  }
  /** Velocity form: `speed` px/ms at `angleDeg` (0 = right, 90 = up) for `ms`. */
  flick(speed: number, angleDeg: number, ms: number, stepMs = 8): this {
    const a = (angleDeg * Math.PI) / 180;
    return this.move(Math.cos(a) * speed * ms, -Math.sin(a) * speed * ms, ms, stepMs);
  }
  /** Finger parked for `ms` (no samples, as on real hardware), optionally with ±tremor px samples. */
  rest(ms: number, tremor = 0, stepMs = 16): this {
    if (!tremor) { this.t += ms; return this; }
    const x0 = this.x, y0 = this.y, t0 = this.t, n = Math.floor(ms / stepMs);
    for (let i = 1; i <= n; i++) {
      const s = i % 2 ? 1 : -1;
      this.samples.push({ id: this.id, tMs: t0 + i * stepMs, x: x0 + s * tremor, y: y0 - s * tremor * 0.5, phase: 'move' });
    }
    this.t = t0 + ms;
    this.samples.push({ id: this.id, tMs: this.t, x: x0, y: y0, phase: 'move' });
    return this;
  }
  up(): this { this.samples.push({ id: this.id, tMs: this.t, x: this.x, y: this.y, phase: 'up' }); return this; }
  cancel(): this { this.samples.push({ id: this.id, tMs: this.t, x: this.x, y: this.y, phase: 'cancel' }); return this; }
}

/** Feeds samples in time order (stable), with a tick() every frame like the game loop. */
export function run(rec: Recognizer, samples: readonly PointerSample[], tickEveryMs = 16.667): Gesture[] {
  const sorted = [...samples].sort((a, b) => a.tMs - b.tMs);
  const out: Gesture[] = [];
  let nextTick = sorted.length ? sorted[0]!.tMs : 0;
  for (const s of sorted) {
    while (nextTick < s.tMs) { out.push(...rec.tick(nextTick)); nextTick += tickEveryMs; }
    out.push(...rec.feed(s));
  }
  return out;
}

export const swipes = (g: readonly Gesture[]) => g.filter((x): x is Extract<Gesture, { k: 'swipe' }> => x.k === 'swipe');
export const kinds = (g: readonly Gesture[]) => g.filter((x) => x.k !== 'steer').map((x) => (x.k === 'press' ? `press${x.down ? '+' : '-'}` : x.k));
export const steerSum = (g: readonly Gesture[]) => g.reduce((a, x) => a + (x.k === 'steer' ? x.dxPx : 0), 0);
