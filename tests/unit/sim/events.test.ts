// ROADMAP W1a: every GameEvent kind is emitted where specified. A god run on the real generator (SafeKey follower,
// starting before the Suburbs gateway) plus fixture scenarios for the rest; the union must hold every kind of
// core/events.ts GameEvent.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/core/events';
import { EMPTY_FRAME } from '../../../src/core/input';
import { createSim } from '../../../src/sim';
import { TRICKS } from '../../../src/tricks';
import { BOTS } from '../../../src/debug/bots';
import { box, pit, slab } from './fixtures';
import { make, place, run } from './drive';

const ALL_KINDS: readonly GameEvent['t'][] = ['runStart', 'ollie', 'airborne', 'flipStart', 'flipUpgrade', 'spinStart',
  'spinUpgrade', 'revert', 'grabStart', 'grabEnd', 'land', 'pickWindow', 'grindStart', 'grindSwitch', 'grindEnd',
  'manualStart', 'manualEnd', 'trickScored', 'bonus', 'comboBanked', 'comboLost', 'coin', 'nearMiss', 'bump', 'knock',
  'hazardWarn', 'stairStep', 'surface', 'areaEnter', 'gatewayEnter', 'landmark', 'bestPassed', 'speedTier', 'crash',
  'rewind', 'runEnd'];

describe('GameEvent coverage', () => {
  it('every kind is emitted by some scenario', () => {
    const seen = new Set<GameEvent['t']>();
    const add = (ev: readonly GameEvent[]) => { for (const e of ev) seen.add(e.t); };

    // Real generator: the Downtown → Suburbs gateway at 0:44, speed tiers, coins, hazard warnings, the BEST line.
    const sim = createSim(TRICKS);
    sim.reset({ runId: 'ev', seed: 1, mode: 'normal', firstRuns: false, bestDist: 60, startT: 30, god: true });
    const bot = BOTS.safe!({ seed: 1 });
    for (let i = 0; i < 60 * 25; i++) add(sim.step({ ...EMPTY_FRAME, ...bot.frame(sim) }));
    sim.reset({ runId: 'ev2', seed: 2, mode: 'normal', firstRuns: false, bestDist: 0, startT: 64, god: true });   // 8.0 m/s
    for (let i = 0; i < 60 * 4; i++) add(sim.step({ ...EMPTY_FRAME }));

    // Fixture scenarios.
    const ledge = box({ s: 10, x: 0, len: 30, wid: 0.6, hgt: 0.45, top: 'landable', edges: ['l', 'r'] });
    ledge.landmark = 'Corner Scoops wall';
    let lock = -1;
    add(run(make([ledge]), 300, (i, _s, last) => {                  // 50-50, switch, pop-out 180, revert, landmark
      if (lock < 0 && last.some((e) => e.t === 'grindStart')) lock = i;
      if (i === 60) return { tap: true };
      if (lock >= 0 && i === lock + 20) return { swipe: 'l', swipeFast: true };
      if (lock >= 0 && i === lock + 50) return { swipe: 'ul', swipeFast: true };
      return {};
    }));
    add(run(make([]), 200, (i) => (i === 5 ? { swipe: 'ur', swipeFast: true } : i === 12 ? { swipe: 'ur', swipeFast: true }
      : i === 50 ? { tap: true } : i === 60 ? { swipe: 'l', swipeFast: true } : i === 66 ? { swipe: 'l', swipeFast: true }
      : i === 100 ? { tap: true } : i >= 103 && i < 125 ? { hold: true, press: true } : {})));   // spin upgrade, flip upgrade, grab
    add(run(make([]), 200, (i) => (i === 5 ? { tap: true } : i >= 41 && i < 120 ? { manualKey: true, press: true } : {})));
    add(run(make([box({ s: 10, x: 0, len: 0.3, wid: 0.3, hgt: 0.5, top: 'knock' })]), 120));
    const bin = box({ s: 12, x: 0.8, len: 0.6, wid: 0.6, hgt: 1.15, top: 'crash' });
    const near = make([bin]);
    place(near, { x: 0.1 });
    add(run(near, 150));
    add(run(make([slab({ s: 10, len: 3, x0: -4.5, x1: 4.5, y: 0, y1: -0.85, kind: 'stairs', steps: 5 }),
      slab({ s: 13, len: 30, x0: -4.5, x1: 4.5, y: -0.85 })]), 200));
    add(run(make([box({ s: 3, x: 1.4, len: 30, wid: 0.6, hgt: 1.3, top: 'crash' })]), 300, (i) => (i >= 60 && i < 70 ? { steerDx: 0.3 } : {})));
    add(run(make([pit({ s: 30, len: 2 })], { rewinds: 1 }), 400, (i) => (i === 5 ? { tap: true } : {})));   // rewind, then the real fall
    add(run(make([box({ s: 12, x: 0, len: 0.6, wid: 2, hgt: 0.5, top: 'crash' })]), 200, (i) => (i === 60 ? { tap: true } : {})));   // combo lost

    const missing = ALL_KINDS.filter((k) => !seen.has(k));
    expect(missing).toEqual([]);
  });
});
