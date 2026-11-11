// world/gen/coins.ts: coin placement (DESIGN §10.8). Strings of 5–8 coins spaced 0.12 s·v apart: along grind edges at
// edge top + 0.35 (sloped edges followed), along flat-ollie arcs at parabola + 0.25 from the validator's take-off,
// on manual pads and decks at + 0.35, and free wave strings on breathers and gateways. Gold Stacks (10) mark hard
// lines (T3+, transfers, high rails, Neon elevated). All positions are rounded to 1 cm. A5 (≥ 75 % on trick lines,
// ≤ 10 % on the safe line outside breathers, no ground string held at one x for > 1.5 s) is measured in GenStats and
// the static asserts.
import { round1cm } from '../../core/math';
import { G, V_POP, sAt, speedAt, tAt } from '../../core/tuning';
import type { Coin, GrindEdge } from '../../core/world';
import { GEN } from './gen.config';
import type { IdCounters } from './props/common';

export class CoinWriter {
  readonly coins: Coin[] = [];
  constructor(private readonly ids: IdCounters) {}

  add(s: number, x: number, y: number, line: Coin['line'], value: 1 | 10 = 1): void {
    this.coins.push({ id: ++this.ids.coin, p: { s: round1cm(s), x: round1cm(x), y: round1cm(y) }, value, line });
  }
  /** A straight string from sA to sB at (x, y), 5–8 coins about 0.12 s·v apart. */
  string(sA: number, sB: number, x: number, y: number, v: number, line: Coin['line'] = 'trick'): void {
    const step = GEN.coins.stringSec * v;
    const n = Math.max(GEN.coins.stringMin, Math.min(GEN.coins.stringMax, Math.floor((sB - sA) / step) + 1));
    const d = n > 1 ? (sB - sA) / (n - 1) : 0;
    for (let k = 0; k < n; k++) this.add(sA + k * d, x, y, line);
  }
  /** Coins along a grind edge (top + 0.35), inset from its ends; follows sloped edges (stair rails, hubbas). */
  edge(e: GrindEdge, fromSec = 0.25, toSec = 0.2): void {
    const v = speedAt(tAt(e.a.s));
    const sA = e.a.s + fromSec * v, sB = e.b.s - toSec * v;
    if (sB - sA < 0.5) return;
    const step = GEN.coins.stringSec * v;
    const n = Math.max(GEN.coins.stringMin, Math.min(GEN.coins.stringMax, Math.floor((sB - sA) / step) + 1));
    const d = n > 1 ? (sB - sA) / (n - 1) : 0;
    for (let k = 0; k < n; k++) {
      const s = sA + k * d, u = (s - e.a.s) / Math.max(1e-6, e.b.s - e.a.s);
      this.add(s, e.a.x + (e.b.x - e.a.x) * u, e.a.y + (e.b.y - e.a.y) * u + GEN.coins.edgeUp, 'trick');
    }
  }
  /** A flat-ollie arc taking off at tTake from ground y0 (parabola + 0.25), 5 coins over the air. */
  arc(tTake: number, x: number, y0: number, line: Coin['line'] = 'trick', n = 5): void {
    const air = (2 * V_POP) / G;
    for (let k = 1; k <= n; k++) {
      const tau = (k / (n + 1)) * air;
      this.add(sAt(tTake + tau), x, y0 + V_POP * tau - 0.5 * G * tau * tau + GEN.coins.arcUp, line);
    }
  }
  /** A free wave string (breathers, gateways): x = centre + amp·sin, kept inside ±2.8. */
  wave(t0: number, t1: number, xc: number, amp: number, phase: number, y: number = GEN.coins.groundY): void {
    const n = GEN.coins.waveCount;
    for (let k = 0; k < n; k++) {
      const t = t0 + ((k + 0.5) / n) * (t1 - t0);
      const x = Math.max(-2.8, Math.min(2.8, xc + amp * Math.sin(phase + k * 0.9)));
      this.add(sAt(t), x, y, 'breather');
    }
  }
  /** A Gold Stack (value 10) at a hard line's apex or end. */
  gold(s: number, x: number, y: number): void { this.add(s, x, y, 'trick', 10); }
}
