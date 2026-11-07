// ui/ pure HUD rules (DESIGN §13.8, §17.4): the band columns never overlap and fit the worst-case texts at 320, 360
// and 390 px; popups last ≤ 0.5 s with the 120 ms 0.6 → 1.1 → 1 pop; every core HintId has touch and key wording.
import { describe, expect, it } from 'vitest';
import { fitPx, hudColumns } from '../../../src/ui/fit';
import { HINT_TEXT, REST_MARK_SEC } from '../../../src/ui/hints';
import { popupCurve, POPUP } from '../../../src/ui/popups';
import { HUD_LAYOUT } from '../../../src/ui/ui.config';
import { HUD_TIMING } from '../../../src/ui/hud';
import { fmtScore, fmtShort } from '../../../src/ui/format';
import { HINT_IDS } from '../../../src/save';

describe('HUD band columns', () => {
  for (const vw of [320, 360, 390, 430, 1280]) {
    it(`${vw} px: left + middle + right + gaps + padding = the width, every column positive`, () => {
      const c = hudColumns(vw);
      const sum = c.padL + c.leftW + c.gap + c.midW + c.gap + c.rightW + c.padR;
      expect(sum).toBeLessThanOrEqual(vw + 0.01);
      expect(c.midW).toBeGreaterThan(60);
      expect(c.rightW).toBeGreaterThanOrEqual(56 + c.coinW);          // the 56 px pause hit area stays whole
    });
  }
  it('safe-area insets shrink the middle column, never the pause button', () => {
    const a = hudColumns(390), b = hudColumns(390, 20, 20);
    expect(b.midW).toBe(a.midW - 40);
    expect(b.rightW).toBe(a.rightW);
  });
  it('worst-case texts fit their column at the base size or after fitting (estimate without a canvas)', () => {
    for (const vw of [320, 360, 390]) {
      const c = hudColumns(vw);
      // Score: 7 characters at most thanks to the 1M abbreviation.
      expect(fmtScore(999_999).length).toBe(7);
      expect(fmtScore(12_345_678)).toBe('12M');
      const s = fitPx('999,999', 'Nunito', 900, 26 * c.k, 14, c.leftW);
      expect(s).toBeGreaterThanOrEqual(14);
      const pill = `${fmtShort(98_765)} × 24`;
      expect(fitPx(pill, 'Nunito', 900, 15 * c.k, 9, c.midW - 20)).toBeGreaterThanOrEqual(9);
      expect(fitPx(fmtShort(98_765), 'Nunito', 900, 17 * c.k, 10, c.coinW - 17 * c.k - HUD_LAYOUT.coinChip)).toBeGreaterThanOrEqual(10);
    }
  });
  it('text writes are batched at ≤ 15 Hz', () => {
    expect(HUD_TIMING.textHz).toBeLessThanOrEqual(15);
    expect(HUD_TIMING.rewardSec + 0.2).toBeLessThanOrEqual(3.0);     // the reward toast is gone by 3.0 s
  });
});

describe('popups', () => {
  it('scale 0.6 → 1.1 → 1 within 120 ms, fully gone by 0.5 s', () => {
    expect(popupCurve(0).scale).toBeCloseTo(0.6, 5);
    expect(popupCurve(0.06).scale).toBeCloseTo(1.1, 5);
    expect(popupCurve(0.12).scale).toBeCloseTo(1, 5);
    expect(popupCurve(0.2).alpha).toBe(1);
    expect(popupCurve(0.4).alpha).toBeGreaterThan(0);
    expect(popupCurve(POPUP.sec).alpha).toBe(0);
    expect(POPUP.sec).toBeLessThanOrEqual(0.5);
    expect(POPUP.pool).toBe(4);
  });
});

describe('hints', () => {
  it('every core HintId has touch wording, key caps and a ghost gesture', () => {
    for (const id of HINT_IDS) {
      const t = HINT_TEXT[id];
      expect(t, id).toBeDefined();
      expect(t!.touch.length).toBeGreaterThan(3);
      expect(t!.keys.length).toBeGreaterThan(3);
      expect(t!.caps.length).toBeGreaterThan(0);
      expect(['drag', 'tap', 'swipeL', 'swipeD', 'swipeUR', 'hold']).toContain(t!.gesture);
    }
    // The G0 wording stays (game/onboarding.ts drives these three in runs 1–3).
    expect(HINT_TEXT.drag).toMatchObject({ touch: 'DRAG TO STEER', keys: 'A / D TO STEER' });
    expect(HINT_TEXT.tap).toMatchObject({ touch: 'TAP TO OLLIE', keys: 'SPACE TO OLLIE' });
    expect(HINT_TEXT.grind!.touch).toBe('OLLIE ONTO THE LEDGE');
    expect(REST_MARK_SEC).toBeGreaterThan(0);
  });
});
