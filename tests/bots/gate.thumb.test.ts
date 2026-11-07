// Gate: the thumb bot (the safe plan as pointer traces through the real recognizer): 20 seeds × 4 min at the plateau
// (DESIGN §10.11), 0 crashes and 0 unintended tricks (any flip / spin / grab / manual start: the plan asks for none),
// for both Settings "Touch controls" (DESIGN §4.1):
//   - two thumbs (the default): the left thumb steers with tremor, ~100 nervous vertical twitches, sideways dodges in
//     the air and re-grips; the right thumb taps (60–260 ms) and flicks ↑ (±25°) for the ollies;
//   - one thumb (classic): the G1 bot (one steering thumb, second-finger taps).
// A control keeps the gate honest: the two-thumb traces read with the one-thumb grammar must misfire (the twitches and
// air dodges are exactly the strokes the old grammar turned into ollies, impossible flips, shove-its and kickflips).
import { describe, expect, it } from 'vitest';
import { describeCrash, runBot, type BotRun, type ThumbBot } from '../../src/debug/bots';
import { MIN, PLATEAU_T, crashOf, seedsFor, writeReport } from './suites';

const run = (seed: number, layout: 'two' | 'one', grammar?: 'two' | 'one') =>
  runBot('thumb', seed, { ticks: 4 * MIN, startT: PLATEAU_T, bot: { layout, ...(grammar ? { grammar } : {}) } });
const unintendedOf = (runs: readonly BotRun[]) => runs.flatMap((r) => r.unintended.map((u) => ({ seed: r.seed, t: +u.t.toFixed(3), ev: u.ev })));
const gestures = (runs: readonly BotRun[]) => {
  const sum = (k: 'taps' | 'flicks' | 'twitches' | 'regrips') => runs.reduce((a, r) => a + (r.bot as ThumbBot)[k], 0);
  return { taps: sum('taps'), flicks: sum('flicks'), twitches: sum('twitches'), regrips: sum('regrips'),
    thumbX: [Math.min(...runs.map((r) => (r.bot as ThumbBot).minX)), Math.max(...runs.map((r) => (r.bot as ThumbBot).maxX))].map((x) => Math.round(x)) };
};

describe('bots gate: thumb', () => {
  it('two thumbs (default): 0 crashes, 0 unintended tricks on 20 seeds × 4 min from the plateau', () => {
    const runs = seedsFor(20).map((seed) => run(seed, 'two'));
    const unintended = unintendedOf(runs);
    const g = gestures(runs);
    writeReport('thumb', {
      bot: 'thumb', layout: 'two', seeds: runs.length, minutes: 4, startT: PLATEAU_T, crashes: runs.filter((r) => r.crash).map(crashOf), unintended,
      ollies: runs.reduce((a, r) => a + (r.events.ollie ?? 0), 0), ...g,
    });
    expect(runs.filter((r) => r.crash).map((r) => `seed ${r.seed}: ${describeCrash(r)}`)).toEqual([]);
    expect(unintended).toEqual([]);
    expect(g.twitches).toBeGreaterThan(runs.length * 50);          // the model really jerks, flicks and re-grips
    expect(g.flicks).toBeGreaterThan(runs.length);
    expect(g.regrips).toBeGreaterThan(runs.length);
  });

  it('one thumb (classic): 0 crashes, 0 unintended tricks on 20 seeds × 4 min from the plateau', () => {
    const runs = seedsFor(20).map((seed) => run(seed, 'one'));
    const unintended = unintendedOf(runs);
    writeReport('thumb1', {
      bot: 'thumb', layout: 'one', seeds: runs.length, minutes: 4, startT: PLATEAU_T, crashes: runs.filter((r) => r.crash).map(crashOf), unintended,
      ollies: runs.reduce((a, r) => a + (r.events.ollie ?? 0), 0),
    });
    expect(runs.filter((r) => r.crash).map((r) => `seed ${r.seed}: ${describeCrash(r)}`)).toEqual([]);
    expect(unintended).toEqual([]);
  });

  it('control: the two-thumb traces read with the one-thumb grammar misfire (5 seeds)', () => {
    const runs = [1, 2, 3, 4, 5].map((seed) => run(seed, 'two', 'one'));
    const unintended = unintendedOf(runs);
    writeReport('thumb-control', { bot: 'thumb', layout: 'two', grammar: 'one', seeds: runs.length, crashes: runs.filter((r) => r.crash).map(crashOf), unintended });
    expect(unintended.length).toBeGreaterThan(0);
  });
});
