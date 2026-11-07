// Quality auto-adjust (TECH §8.9): measures CPU work, not intervals; drops on sustained heavy work or missed vsyncs
// with real work; raises at most once per run after 10 s of light work; a capped 33 ms display never drops a tier.
import { describe, expect, it } from 'vitest';
import { AutoQuality } from '../../../src/world/render/quality';
import { QUALITY } from '../../../src/world/render/render.config';

const run = (q: AutoQuality, n: number, work: number, iv: number) => { let last: string | null = null; for (let i = 0; i < n; i++) { const t = q.frame(work, iv); if (t) last = t; } return last; };

describe('AutoQuality', () => {
  it('tiers: DPR caps, shadow maps and particle / glow caps (TECH §8.9)', () => {
    expect(QUALITY.low).toMatchObject({ dpr: 1, shadow: 0, particles: 150, glowCards: 20 });
    expect(QUALITY.med).toMatchObject({ dpr: 1.5, shadow: 1024, particles: 300, glowCards: 40 });
    expect(QUALITY.high).toMatchObject({ dpr: 2, shadow: 2048, particles: 300, glowCards: 40 });
  });
  it('drops one tier after 3 s of p95 work > 12 ms', () => {
    const q = new AutoQuality('high');
    expect(run(q, 120, 14, 16.7)).toBeNull();            // 2 s: not yet
    expect(run(q, 90, 14, 16.7)).toBe('med');
    expect(q.tier).toBe('med');
  });
  it('drops on > 10% missed vsyncs only when the work is real (p95 > 8 ms)', () => {
    const q = new AutoQuality('med');
    const frames = (work: number) => { let r: string | null = null; for (let i = 0; i < 400; i++) { const t = q.frame(work, i % 5 === 0 ? 40 : 16.7); if (t) r = t; } return r; };
    expect(frames(4)).toBeNull();                       // missed frames but light work: someone else's fault
    expect(frames(9)).toBe('low');
  });
  it('a stable 33 ms display with low work (Low Power Mode, battery saver) never drops', () => {
    const q = new AutoQuality('med');
    expect(run(q, 2000, 5, 33.3)).not.toBe('low');
    expect(q.tier).not.toBe('low');
  });
  it('raises one tier at most once per run after 10 s of light work', () => {
    const q = new AutoQuality('low');
    expect(run(q, 700, 3, 16.7)).toBe('med');
    expect(run(q, 1400, 3, 16.7)).toBeNull();            // once per run
    q.resetRun();
    expect(run(q, 700, 3, 16.7)).toBe('high');
    expect(run(q, 1400, 3, 16.7)).toBeNull();            // already at the top
  });
});
