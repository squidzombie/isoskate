// world/render/quality.ts: quality tiers with work-time auto-adjust (TECH §8.9). Pure and unit-tested: feed it one
// sample per rendered frame (CPU work = sim + render submit, ms; the interval since the previous frame, ms).
//   - drop one tier: p95 work > 12 ms over a 3 s window, or > 10% missed vsyncs while p95 work > 8 ms;
//   - raise one tier, at most once per run, after 10 s of p95 work < 6 ms and no missed vsync;
//   - a missed vsync is an interval > 1.5 × the median interval, so a stable ~33 ms display (iOS Low Power Mode,
//     battery saver) with low work never drops a tier;
//   - a settings override disables auto (the view stops calling it).
import type { QualityTier } from '../../core/ids';
import { AUTO_QUALITY } from './render.config';

const TIERS: readonly QualityTier[] = ['low', 'med', 'high'];

export class AutoQuality {
  tier: QualityTier;
  private readonly work: number[] = [];
  private readonly iv: number[] = [];
  private windowMs = 0;
  private goodMs = 0;
  private raised = false;
  private readonly sorted: number[] = [];

  constructor(start: QualityTier, private readonly cfg = AUTO_QUALITY) { this.tier = start; }

  /** New run: the one-raise-per-run allowance comes back; the window restarts. */
  resetRun(): void { this.raised = false; this.clear(); }
  clear(): void { this.work.length = 0; this.iv.length = 0; this.windowMs = 0; this.goodMs = 0; }

  /** One frame. Returns the new tier when it changes, else null. */
  frame(workMs: number, intervalMs: number): QualityTier | null {
    const c = this.cfg;
    this.work.push(workMs); this.iv.push(intervalMs); this.windowMs += intervalMs;
    while (this.work.length > c.window) { this.windowMs -= this.iv[0]!; this.work.shift(); this.iv.shift(); }
    if (this.work.length < 30) return null;
    const p95 = this.quantile(this.work, 0.95), med = this.quantile(this.iv, 0.5);
    let miss = 0;
    for (const v of this.iv) if (v > c.missFactor * med) miss++;
    const missFrac = miss / this.iv.length;
    const full = this.windowMs >= 3000;
    const idx = TIERS.indexOf(this.tier);
    if (full && idx > 0 && (p95 > c.dropP95Ms || (missFrac > c.missFrac && p95 > c.missP95Ms))) return this.set(TIERS[idx - 1]!);
    if (p95 < c.raiseP95Ms && miss === 0) this.goodMs += intervalMs; else this.goodMs = 0;
    if (!this.raised && idx < TIERS.length - 1 && this.goodMs >= c.raiseAfterS * 1000) { this.raised = true; return this.set(TIERS[idx + 1]!); }
    return null;
  }

  private set(t: QualityTier): QualityTier { this.tier = t; this.clear(); return t; }
  private quantile(v: readonly number[], q: number): number {
    const s = this.sorted; s.length = 0;
    for (const x of v) s.push(x);
    s.sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
  }
}
