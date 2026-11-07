// game/onboarding.ts first-runs hints (G0 review): the real sim on the Roll-out (seed-independent), a fake HUD.
import { describe, expect, it } from 'vitest';
import { createBus } from '../../../src/core/bus';
import type { GameEvent } from '../../../src/core/events';
import { EMPTY_FRAME, type InputFrame } from '../../../src/core/input';
import type { HudApi } from '../../../src/core/ui';
import type { SaveV1 } from '../../../src/core/save';
import { FirstRunHints, isTwoThumbIntroRun, type FirstRunOptions } from '../../../src/game/onboarding';
import { makeDefaults } from '../../../src/save/defaults';
import { createSim } from '../../../src/sim';
import { TRICKS } from '../../../src/tricks';

function ride(runs: number, input: (t: number) => Partial<InputFrame> = () => ({}), opts: FirstRunOptions = {}) {
  const shown: { t: number; id: string | null }[] = [];
  const hud = { show() {}, update() {}, hint(id: string | null) { shown.push({ t, id }); } } as HudApi;
  const bus = createBus<GameEvent>();
  const hints = new FirstRunHints(hud, bus, opts);
  const sim = createSim(TRICKS);
  sim.reset({ runId: 'h', seed: 1, mode: 'normal', firstRuns: true, bestDist: 0 });
  let t = 0;
  hints.start(runs, 0, false);
  for (let i = 0; i < 9 * 60 && sim.cur.mode !== 'crashed'; i++) {
    for (const e of sim.step({ ...EMPTY_FRAME, ...input(sim.cur.t) })) bus.emit(e);
    t = sim.cur.t;
    hints.update(t, sim.cur);
  }
  return shown.filter((s) => s.id !== null).map((s) => `${s.id}@${s.t.toFixed(1)}`);
}

describe('first-runs hints', () => {
  it('a player who does nothing: steer, then ollie, until the chain crash clears it', () => {
    expect(ride(1)).toEqual(['drag@0.3', 'tap@2.3']);
  });
  it('a player who steers and taps on cue sees each hint go once it is done', () => {
    const shown = ride(2, (t) => (t > 0.5 && t < 0.8 ? { steerDx: 0.05 } : t > 3.15 && t < 3.17 ? { tap: true } : {}));
    expect(shown[0]).toBe('drag@0.3');
    expect(shown).toContain('tap@2.3');
    expect(shown.at(-1)).toBe('grind@4.6');
  });
  it('a player who has steered before the hint is due never sees it', () => {
    expect(ride(1, (t) => (t < 0.2 ? { steerDx: 0.06 } : {}))[0]).toBe('tap@2.3');
  });
  it('run 4 and later get none', () => {
    expect(ride(4)).toEqual([]);
  });
});

describe('two-thumb re-teach (a profile from before the two-thumb controls)', () => {
  /** A save as sanitize leaves an old profile: runsStarted 10 (after this run's increment), the re-teach due. */
  const oldSave = (patch: (d: SaveV1) => void = () => {}) => {
    const data = makeDefaults(0, 1);
    data.onboarding.runsStarted = 10; data.onboarding.twoThumbIntro = -1;
    patch(data);
    return { data, mutate(f: (s: SaveV1) => void) { f(data); } };
  };
  it('its next touch run with two thumbs gets the first-runs chips once, and the run is recorded', () => {
    const save = oldSave();
    expect(ride(10, () => ({}), { save, touch: () => true })).toEqual(['drag@0.3', 'tap@2.3']);
    expect(save.data.onboarding.twoThumbIntro).toBe(10);
    expect(isTwoThumbIntroRun(save.data.onboarding)).toBe(true);
    save.data.onboarding.runsStarted = 11;
    expect(isTwoThumbIntroRun(save.data.onboarding)).toBe(false);
    expect(ride(11, () => ({}), { save, touch: () => true })).toEqual([]);
  });
  it('not on a keyboard / mouse screen, not with One thumb, not when nothing is due; it stays due until a touch run', () => {
    const save = oldSave();
    expect(ride(10, () => ({}), { save, touch: () => false })).toEqual([]);
    expect(save.data.onboarding.twoThumbIntro).toBe(-1);
    const one = oldSave((d) => { d.settings.controls = 'one'; });
    expect(ride(10, () => ({}), { save: one, touch: () => true })).toEqual([]);
    expect(one.data.onboarding.twoThumbIntro).toBe(-1);
    const fresh = oldSave((d) => { d.onboarding.twoThumbIntro = 0; });
    expect(ride(10, () => ({}), { save: fresh, touch: () => true })).toEqual([]);
  });
});
