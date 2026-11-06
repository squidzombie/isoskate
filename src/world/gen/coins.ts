// world/gen/coins.ts: coin placement helpers (DESIGN §10.8). Strings of 5–8 coins spaced 0.12 s·v: along grind
// edges at top + 0.35, along flat-ollie arcs at parabola + 0.25 from the validator's take-off, and free wave strings
// on breathers and gateways. All positions are rounded to 1 cm. TODO(WG): Gold Stacks, density targets, A5 checks.
import { round1cm } from '../../core/math';
import { G, V_POP, sAt } from '../../core/tuning';
import type { Coin } from '../../core/world';
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
  /** Coins along an edge's top (edge top + 0.35). */
  edge(sA: number, sB: number, x: number, top: number, v: number): void { this.string(sA, sB, x, top + GEN.coins.edgeUp, v, 'trick'); }
  /** A flat-ollie arc taking off at tTake from ground y0 (parabola + 0.25), 5 coins over the air. */
  arc(tTake: number, x: number, y0: number, line: Coin['line'] = 'trick'): void {
    const air = (2 * V_POP) / G;
    for (let k = 1; k <= 5; k++) {
      const tau = (k / 6) * air;
      this.add(sAt(tTake + tau), x, y0 + V_POP * tau - 0.5 * G * tau * tau + GEN.coins.arcUp, line);
    }
  }
  /** A free wave string (breathers, gateways): x = centre + amp·sin. */
  wave(t0: number, t1: number, xc: number, amp: number, phase: number): void {
    const n = GEN.coins.waveCount;
    for (let k = 0; k < n; k++) {
      const t = t0 + ((k + 0.5) / n) * (t1 - t0);
      const x = Math.max(-2.8, Math.min(2.8, xc + amp * Math.sin(phase + k * 0.9)));
      this.add(sAt(t), x, GEN.coins.groundY, 'breather');
    }
  }
}
