// ui/ pure helpers: number formats, trick names, the crash cause line and the HUD rules (DESIGN §9, §13.8).
import { describe, expect, it } from 'vitest';
import type { SkaterState } from '../../../src/core/sim';
import { crashCause, fmtScore, fmtShort, trickName } from '../../../src/ui/format';
import { badLandingPredicted, comboTier } from '../../../src/ui/hud';

describe('formats', () => {
  it('score: separators, abbreviated from 1M', () => {
    expect(fmtScore(0)).toBe('0');
    expect(fmtScore(5028)).toBe('5,028');
    expect(fmtScore(999_999)).toBe('999,999');
    expect(fmtScore(1_000_000)).toBe('1M');
    expect(fmtScore(1_234_567)).toBe('1.2M');
    expect(fmtScore(12_345_678)).toBe('12M');
    expect(fmtScore(-5)).toBe('0');
  });
  it('short counts for tight HUD slots', () => {
    expect(fmtShort(9999)).toBe('9,999');
    expect(fmtShort(12_345)).toBe('12.3k');
    expect(fmtShort(123_456)).toBe('123k');
    expect(fmtShort(2_500_000)).toBe('2.5M');
  });
  it('trick names come from the trick tables', () => {
    expect(trickName('ollie')).toBe('Ollie');
    expect(trickName('kickflip')).toBe('Kickflip');
    expect(trickName('treFlip')).toBe('360 Flip');
    expect(trickName('someNewTrick')).toBe('Some New Trick');
  });
});

describe('crash cause line (DESIGN §9)', () => {
  const e = (o: Partial<Parameters<typeof crashCause>[0]>) => crashCause({ cause: 'slam', kind: null, flipProgress: 0, spinProgress: 0, ...o });
  it('one line per cause', () => {
    expect(e({ cause: 'slam', kind: 'trash_can' })).toBe('Clipped a bin — steer around it');
    expect(e({ cause: 'slam', kind: 'news_box' })).toBe('Clipped a news box — steer around it');
    expect(e({ cause: 'slam', kind: 'barrier_low' })).toBe('Hit the barrier — tap to ollie it');
    expect(e({ cause: 'slam', kind: 'granite_ledge' })).toBe('Hit the ledge end — ollie onto it');
    expect(e({ cause: 'badLanding', kind: 'parked_car' })).toBe('Landed on a car');
    expect(e({ cause: 'badLanding', flipProgress: 0.62 })).toBe('Flip 62% done — flick earlier');
    expect(e({ cause: 'badLanding', spinProgress: 0.4 })).toBe('Spin 40% done — flick earlier');
    expect(e({ cause: 'fall' })).toBe('Dropped into the gap — ollie it or take the plank');   // THEME §9 (Downtown: gap)
    expect(e({ cause: 'badLanding' })).toBe('Bailed the landing');
    expect(e({ cause: 'slam', kind: 'forklift' })).toBe('Clipped a forklift — steer around it');
  });
});

describe('HUD rules', () => {
  it('combo pill tiers: cream → amber ×5 → coral ×10 → magenta ×20', () => {
    expect([1, 4, 5, 9, 10, 19, 20, 30].map(comboTier)).toEqual(['x1', 'x1', 'x5', 'x5', 'x10', 'x10', 'x20', 'x20']);
  });
  it('popup turns coral when the flip would not reach the snap band before touchdown', () => {
    const st = (flipT: number, airLeft: number) => ({ mode: 'air', airLeft, spin: null,
      flip: { id: 'kickflip', t: flipT, dur: 0.32, upgrades: 0, airLeftAtStart: 0.5, angle0: 0, t0: 0 } }) as unknown as SkaterState;
    expect(badLandingPredicted(st(0.1, 0.3))).toBe(false);     // (0.1 + 0.3) / 0.32 ≥ 1
    expect(badLandingPredicted(st(0.05, 0.15))).toBe(true);     // 0.2 / 0.32 = 0.62 < 0.80
    expect(badLandingPredicted({ ...st(0, 0), mode: 'roll' } as SkaterState)).toBe(false);
  });
});
