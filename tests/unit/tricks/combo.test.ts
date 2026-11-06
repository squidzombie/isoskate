// Combo and scoring basics (DESIGN §13.1–§13.4, M0 scope): per-trick rounding, links (ollies add none), the link
// window and heat, bank on window / heat / sketchy / gateway, lose on crash, decay, variety, the ×30 cap.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/core/events';
import type { ScoreState } from '../../../src/core/sim';
import { DT } from '../../../src/core/tuning';
import { SCORE, addBonus, addTrick, bank, comboCoins, comboValue, decayFactor, emptyCombo, lose, multiplierOf, openWindow,
  tickCombo, varietyOf } from '../../../src/tricks';

const score = (): ScoreState => ({ total: 0, trickPts: 0, distancePts: 0, bonusPts: 0, combo: emptyCombo(), bestCombo: 0,
  maxLinks: 0, lostCombo: 0, coins: 0, coinPayouts: 0, recent: [], tricks: {}, longestGrind: 0, areasReached: [],
  furthestArea: 'downtown', maxSpeed: 0 });

describe('combo', () => {
  it('the worked example arithmetic (DESIGN §13.6): 1,093 × 4 × 1.15 = 5,028 with per-trick rounding', () => {
    const sc = score(), ev: GameEvent[] = [];
    addTrick(sc, ev, 1, 'air', 'ollie', 50, { link: false, minFactor: 0.5 });
    addTrick(sc, ev, 2, 'grind', 'fiftyFifty', 100 + 150 * 1.2, { link: true });
    addTrick(sc, ev, 3, 'air', 'kickflip', 150, { link: true, mod: SCORE.mod.perfect });
    addBonus(sc, ev, 3, 'air', 'popOut', 'Pop-out', 50, true);
    addTrick(sc, ev, 4, 'manual', 'manual', 75 + 100 * 1.5, { link: true });
    addTrick(sc, ev, 5, 'air', 'ollie', 50, { link: false, minFactor: 0.5 });       // decayed ×0.7
    addTrick(sc, ev, 6, 'grind', 'boardslide', 125 + 175 * 0.8, { link: true });
    const c = sc.combo;
    expect(c.entries.map((e) => e.pts)).toEqual([50, 280, 188, 225, 35, 265]);
    expect(c.links).toBe(4);
    expect(c.uniqueNames).toBe(5);
    expect(comboValue(c)).toBe(5028);
    bank(sc, ev, 7, 'window');
    expect(sc.trickPts).toBe(5028);
    expect(sc.coinPayouts).toBe(comboCoins(5028));
    expect(comboCoins(5028)).toBe(4);
    expect(ev.at(-1)).toMatchObject({ t: 'comboBanked', total: 5028, links: 4, reason: 'window' });
  });

  it('ollies add no link; the link window banks after 0.75 s of rolling; heat banks 2.5 s after the last link', () => {
    const sc = score(), ev: GameEvent[] = [];
    addTrick(sc, ev, 1, 'air', 'ollie', 50, { link: false });
    expect(sc.combo.links).toBe(0);
    expect(multiplierOf(0)).toBe(1);
    openWindow(sc);
    let ticks = 0;
    while (sc.combo.active && ticks < 100) { tickCombo(sc, ev, ticks, 'roll'); ticks++; }
    expect(ticks * DT).toBeCloseTo(0.75, 1);
    expect(ev.at(-1)).toMatchObject({ t: 'comboBanked', reason: 'window', total: 50 });

    addTrick(sc, ev, 200, 'air', 'kickflip', 150, { link: true });
    ticks = 0;
    while (sc.combo.active && ticks < 400) { tickCombo(sc, ev, ticks, 'air'); ticks++; }
    expect(ticks * DT).toBeCloseTo(SCORE.heat, 1);
    expect(ev.at(-1)).toMatchObject({ t: 'comboBanked', reason: 'heat' });
  });

  it('heat pauses in grinds and manuals; a crash loses the unbanked combo', () => {
    const sc = score(), ev: GameEvent[] = [];
    addTrick(sc, ev, 1, 'grind', 'fiftyFifty', 100, { link: true });
    for (let i = 0; i < 600; i++) tickCombo(sc, ev, i, 'grind');
    expect(sc.combo.active).toBe(true);
    expect(sc.combo.heat).toBeCloseTo(SCORE.heat, 9);
    lose(sc, ev, 700);
    expect(sc.combo.active).toBe(false);
    expect(sc.lostCombo).toBe(100);
    expect(ev.at(-1)).toMatchObject({ t: 'comboLost', total: 100 });
  });

  it('decay 1.0 / 0.7 / 0.45 / 0.25 / 0.1 over the last 10 tricks, ollies floored at 0.5, manuals exempt', () => {
    expect([0, 1, 2, 3, 4, 7].map((n) => decayFactor(Array(n).fill('kickflip'), 'kickflip'))).toEqual([1, 0.7, 0.45, 0.25, 0.1, 0.1]);
    expect(decayFactor(Array(5).fill('ollie'), 'ollie', 0.5)).toBe(0.5);
    expect(decayFactor(Array(5).fill('manual'), 'manual')).toBe(1);
    const sc = score(), ev: GameEvent[] = [];
    for (let i = 0; i < 4; i++) addTrick(sc, ev, i, 'air', 'kickflip', 150, { link: true });
    expect(sc.combo.links).toBe(3);                    // the 3rd (×0.45) still links; the 4th (×0.25) does not
  });

  it('variety +5 % per unique name beyond 2 (cap +50 %), multiplier cap ×30, bonus outside a combo banks directly', () => {
    expect(varietyOf(2)).toBe(0);
    expect(varietyOf(5)).toBeCloseTo(0.15, 12);
    expect(varietyOf(40)).toBe(0.5);
    expect(multiplierOf(45)).toBe(30);
    const sc = score(), ev: GameEvent[] = [];
    addBonus(sc, ev, 1, 'roll', 'knock', 'Knock', 10, false);
    expect(sc.bonusPts).toBe(10);
    expect(sc.combo.active).toBe(false);
  });
});
