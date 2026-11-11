// world/gen/safe.ts: the safe line of a segment, built constructively by its template and checked by the validator.
// SafeKey semantics (what bots, the debug overlay and coin placement rely on):
//  - keys are the polyline vertices of the safe line in run time t, sorted by t; x is linear between consecutive keys;
//  - a key with action 'ollie' marks the take-off: tap on the tick whose time is nearest to key.t;
//  - there is a key at every vertex, every ollie, and at least every KEY_EVERY seconds.
// Required actions (DESIGN §10.6.4): every ollie (at take-off) and every lateral move of ≥ 0.5 m (at its start).
import { round1cm } from '../../core/math';
import { SAFE_LATERAL_FRACTION, V_LAT_MAX, sAt } from '../../core/tuning';
import type { SafeKey } from '../../core/world';

export const KEY_EVERY = 0.5;
export const MOVE_MIN = 0.5;

/** The last seconds of the safe line, carried across segments for validation. */
export interface LineTail { pts: { t: number; x: number }[]; ollies: number[] }

export interface RequiredAction { t: number; kind: 'ollie' | 'move'; dx: number; x: number }

export class SafeLine {
  /** Vertices (t, x). */
  readonly pts: { t: number; x: number }[] = [];
  readonly ollies: number[] = [];
  readonly actions: RequiredAction[] = [];
  constructor(t0: number, x0: number) { this.pts.push({ t: t0, x: x0 }); }

  get t(): number { return this.pts[this.pts.length - 1]!.t; }
  get x(): number { return this.pts[this.pts.length - 1]!.x; }

  /** Hold the current x until t. */
  hold(t: number): this {
    if (t > this.t + 1e-9) this.pts.push({ t, x: this.x });
    return this;
  }
  /** Hold until tStart, then move to x at the safe rate. Returns the arrival time. */
  moveTo(x: number, tStart: number, rate: number = SAFE_LATERAL_FRACTION.ground * V_LAT_MAX): number {
    this.hold(tStart);
    const dx = x - this.x;
    if (Math.abs(dx) < 1e-6) return this.t;
    const t0 = this.t, t1 = t0 + Math.abs(dx) / rate;
    if (Math.abs(dx) >= MOVE_MIN) this.actions.push({ t: t0, kind: 'move', dx, x });
    this.pts.push({ t: t1, x });
    return t1;
  }
  /** An ollie taking off at t (holds until then). */
  ollie(t: number): this {
    this.hold(t);
    this.ollies.push(t);
    this.actions.push({ t, kind: 'ollie', dx: 0, x: this.x });
    return this;
  }
  /** This line preceded by the tail of the previous segments' line (validation history window). */
  withHistory(h: LineTail | null): SafeLine {
    if (!h || !h.pts.length) return this;
    const m = new SafeLine(h.pts[0]!.t, h.pts[0]!.x);
    m.pts.length = 0;
    for (const p of h.pts) if (p.t < this.pts[0]!.t - 1e-9) m.pts.push(p);
    for (const p of this.pts) m.pts.push(p);
    for (const o of h.ollies) m.ollies.push(o);
    for (const o of this.ollies) m.ollies.push(o);
    return m;
  }
  /** The part of this line from t on (kept by the cursor for the next segment's validation). */
  tail(t: number, prev: LineTail | null): LineTail {
    const pts = [...(prev?.pts ?? []), ...this.pts].filter((p) => p.t >= t - 1e-9);
    const before = [...(prev?.pts ?? []), ...this.pts].filter((p) => p.t < t - 1e-9);
    if (before.length) pts.unshift(before[before.length - 1]!);
    return { pts, ollies: [...(prev?.ollies ?? []), ...this.ollies].filter((o) => o >= t - 1.0) };
  }
  /** Polyline x at time t (clamped to the ends). */
  xAt(t: number): number { return polyX(this.pts, t); }

  /** The SafeKeys for [t0, t1]: vertices, ollies and a key every KEY_EVERY seconds (1 cm rounding). */
  keys(t1: number): SafeKey[] {
    this.hold(t1);
    const ts = new Set<number>();
    for (const p of this.pts) ts.add(p.t);
    const t0 = this.pts[0]!.t;
    for (let t = t0; t < t1 - 1e-9; t += KEY_EVERY) ts.add(t);
    for (const t of this.ollies) ts.add(t);
    const out: SafeKey[] = [];
    let last = -Infinity;
    for (const t of [...ts].sort((a, b) => a - b)) {
      if (t > t1 + 1e-9) continue;
      // (one key per instant: a vertex or grid time a float hair from an ollie's would key that ollie twice)
      if (t - last < 1e-9) { if (this.ollies.some((o) => Math.abs(o - t) < 1e-9)) out[out.length - 1]!.action = 'ollie'; continue; }
      last = t;
      const k: SafeKey = { t, s: round1cm(sAt(t)), x: round1cm(this.xAt(t)) };
      if (this.ollies.some((o) => Math.abs(o - t) < 1e-9)) k.action = 'ollie';
      out.push(k);
    }
    return out;
  }
}

/** Linear interpolation over (t, x) vertices sorted by t. */
export function polyX(pts: readonly { t: number; x: number }[], t: number): number {
  if (!pts.length) return 0;
  if (t <= pts[0]!.t) return pts[0]!.x;
  for (let i = 1; i < pts.length; i++) {
    const b = pts[i]!;
    if (t <= b.t) {
      const a = pts[i - 1]!;
      return b.t - a.t > 1e-9 ? a.x + (b.x - a.x) * ((t - a.t) / (b.t - a.t)) : b.x;
    }
  }
  return pts[pts.length - 1]!.x;
}
