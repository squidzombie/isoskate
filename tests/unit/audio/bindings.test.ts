// Bindings (TECH §11.1): every GameEvent and AppEvent kind has a row, each row plays only the cues it declares
// (silent rows play none), and the musical actions happen (tape stop on a real crash, never on a god-mode one).
import { describe, expect, it } from 'vitest';
import type { AppEvent, GameEvent } from '../../../src/core/events';
import { createBus } from '../../../src/core/bus';
import type { SfxId } from '../../../src/core/audio';
import { APP_BINDINGS, GAME_BINDINGS, bindAll, type AudioSink, type BindState } from '../../../src/audio/bindings';
import type { RunResult } from '../../../src/core/sim';

const p = { s: 0, x: 0, y: 0 };
const result = {} as RunResult;
/** One sample event per GameEvent kind. `Record<GameEvent['t'], …>` makes the list exhaustive at compile time. */
const GAME_SAMPLES: { [K in GameEvent['t']]: Extract<GameEvent, { t: K }>[] } = {
  runStart: [{ t: 'runStart', tick: 1, seed: 1, mode: 'normal' }],
  ollie: [{ t: 'ollie', tick: 2, from: 'roll', linked: false }, { t: 'ollie', tick: 2, from: 'grind', linked: true }],
  airborne: [{ t: 'airborne', tick: 2, reason: 'pop' }],
  flipStart: [{ t: 'flipStart', tick: 3, id: 'kickflip', dur: 0.36 }, { t: 'flipStart', tick: 3, id: 'popShuvit', dur: 0.3 }, { t: 'flipStart', tick: 3, id: 'treFlip', dur: 0.42 }],
  flipUpgrade: [{ t: 'flipUpgrade', tick: 4, from: 'kickflip', to: 'treFlip' }],
  spinStart: [{ t: 'spinStart', tick: 3, id: 'fs180', dur: 0.4, out: false }, { t: 'spinStart', tick: 3, id: 'bs360', dur: 0.6, out: true }],
  spinUpgrade: [{ t: 'spinUpgrade', tick: 4, from: 'fs180', to: 'fs360' }],
  revert: [{ t: 'revert', tick: 5 }],
  grabStart: [{ t: 'grabStart', tick: 5, id: 'indy' }],
  grabEnd: [{ t: 'grabEnd', tick: 6, id: 'indy', dur: 0.3 }],
  land: [{ t: 'land', tick: 7, airT: 0.6, dropH: 0, quality: 'clean', surface: 'asphalt' }, { t: 'land', tick: 7, airT: 0.6, dropH: 1.2, quality: 'perfect', surface: 'wood' },
    { t: 'land', tick: 7, airT: 0.6, dropH: 0.4, quality: 'sketchy', surface: 'concrete' }],
  pickWindow: [{ t: 'pickWindow', tick: 8, edgeId: 1, open: true }, { t: 'pickWindow', tick: 9, edgeId: 1, open: false }],
  grindStart: [{ t: 'grindStart', tick: 9, id: 'fiftyFifty', edgeId: 1, material: 'metal', perfect: false, transfer: false },
    { t: 'grindStart', tick: 9, id: 'boardslide', edgeId: 2, material: 'wood', perfect: true, transfer: true }],
  grindSwitch: [{ t: 'grindSwitch', tick: 10, from: 'fiftyFifty', to: 'smith' }],
  grindEnd: [{ t: 'grindEnd', tick: 11, id: 'smith', dur: 0.8, exit: 'pop' }],
  manualStart: [{ t: 'manualStart', tick: 12, kind: 'manual' }],
  manualEnd: [{ t: 'manualEnd', tick: 13, kind: 'manual', dur: 1, reason: 'budget' }],
  trickScored: [{ t: 'trickScored', tick: 14, id: 'kickflip', pts: 100, factor: 1, link: true, comboPts: 100, links: 4, seq: 3 }],
  bonus: [{ t: 'bonus', tick: 15, id: 'nearMiss', name: 'CLOSE!', pts: 25 }],
  comboBanked: [{ t: 'comboBanked', tick: 16, total: 5028, links: 6, variety: 0.1, coins: 3, reason: 'gateway', durSec: 9 }],
  comboLost: [{ t: 'comboLost', tick: 17, total: 900 }],
  coin: [{ t: 'coin', tick: 18, id: 1, value: 1, p, chain: 0 }, { t: 'coin', tick: 30, id: 2, value: 10, p, chain: 1 }],
  nearMiss: [{ t: 'nearMiss', tick: 19, obstacleId: 3, side: -1 }],
  bump: [{ t: 'bump', tick: 20, side: 1, kind: 'wall' }],
  knock: [{ t: 'knock', tick: 21, obstacleId: 4 }],
  hazardWarn: [{ t: 'hazardWarn', tick: 22, obstacleId: 5, kind: 'barrier_low', inSec: 1.6 }],
  stairStep: [{ t: 'stairStep', tick: 23 }],
  surface: [{ t: 'surface', tick: 24, surface: 'wood' }],
  areaEnter: [{ t: 'areaEnter', tick: 1, area: 'downtown', firstThisRun: true }, { t: 'areaEnter', tick: 2700, area: 'suburbs', firstThisRun: true }],
  gatewayEnter: [{ t: 'gatewayEnter', tick: 2400, gateway: 'greenway' }],
  landmark: [{ t: 'landmark', tick: 25, name: 'Clock Tower' }],
  bestPassed: [{ t: 'bestPassed', tick: 26, dist: 900 }],
  speedTier: [{ t: 'speedTier', tick: 27, tier: 1 }, { t: 'speedTier', tick: 28, tier: 2 }, { t: 'speedTier', tick: 29, tier: 3 }],
  crash: [{ t: 'crash', tick: 30, cause: 'slam', obstacleId: 1, kind: 'trash_can', speed: 9, state: 'roll', flipProgress: 0, spinProgress: 0 }],
  rewind: [{ t: 'rewind', tick: 31, toTick: 1 }],
  runEnd: [{ t: 'runEnd', tick: 32, result }],
};
const APP_SAMPLES: { [K in AppEvent['t']]: Extract<AppEvent, { t: K }>[] } = {
  screen: [{ t: 'screen', screen: 'results', from: 'crash' }],
  pause: [{ t: 'pause' }], resume: [{ t: 'resume' }],
  hint: [{ t: 'hint', hint: 'tap', show: true }],
  levelUp: [{ t: 'levelUp', level: 5 }],
  itemGranted: [{ t: 'itemGranted', id: 'bd_x', rarity: 'rare', duplicateCoins: 0 }],
  coinsChanged: [{ t: 'coinsChanged', coins: 10, delta: 1 }],
  crateShake: [{ t: 'crateShake', n: 1 }, { t: 'crateShake', n: 3 }],
  crateReveal: (['common', 'rare', 'epic', 'legendary'] as const).map((rarity) => ({ t: 'crateReveal' as const, tier: 'street' as const, rarity, dup: false })),
  purchase: [{ t: 'purchase', id: 'bd_x', price: 500 }],
  settings: [{ t: 'settings', key: 'music' }],
  ui: (['tap', 'back', 'toggle', 'error'] as const).map((sfx) => ({ t: 'ui' as const, sfx })),
  quality: [{ t: 'quality', tier: 'low' }],
  contextLost: [{ t: 'contextLost' }], contextRestored: [{ t: 'contextRestored' }],
};

function recorder() {
  const calls: { m: string; a: unknown[] }[] = [];
  const rec = (m: string) => (...a: unknown[]) => { calls.push({ m, a }); };
  const sink: AudioSink = {
    cue: rec('cue') as AudioSink['cue'], note: rec('note'), coin: (tick, value) => { calls.push({ m: 'coin', a: [tick, value] }); calls.push({ m: 'cue', a: ['coin'] }); },
    runStart: rec('runStart'), areaEnter: rec('areaEnter'), setArea: rec('setArea'), setIntensity: rec('setIntensity'),
    setComboFilter: rec('setComboFilter'), tapeStop: rec('tapeStop'), duck: rec('duck'), now: () => 0,
  };
  return { calls, sink, cues: () => calls.filter((c) => c.m === 'cue').map((c) => c.a[0] as string) };
}
const fresh = (): BindState => ({ material: null, seq: 0 });
const SFX_IDS: readonly SfxId[] = ['pop', 'whoosh', 'catch', 'land', 'sketchy', 'perfect', 'perfectLock', 'stair', 'bump', 'knock', 'coin', 'nearMiss',
  'hazardTick', 'comboBank', 'comboLost', 'crash', 'newBest', 'newArea', 'grindEntry', 'grindExit', 'uiTap', 'uiBack', 'uiToggle', 'uiError', 'purchase',
  'levelUp', 'crateShake', 'crateOpen', 'revealCommon', 'revealRare', 'revealEpic', 'revealLegendary'];

describe('bindings tables', () => {
  it('cover every GameEvent kind (36) and every AppEvent kind (15)', () => {
    expect(Object.keys(GAME_BINDINGS).sort()).toEqual(Object.keys(GAME_SAMPLES).sort());
    expect(Object.keys(GAME_BINDINGS)).toHaveLength(36);
    expect(Object.keys(APP_BINDINGS).sort()).toEqual(Object.keys(APP_SAMPLES).sort());
    expect(Object.keys(APP_BINDINGS)).toHaveLength(15);
    for (const b of [...Object.values(GAME_BINDINGS), ...Object.values(APP_BINDINGS)]) expect(b.doc.length).toBeGreaterThan(5);
  });

  it('each GameEvent row plays only the cues it declares; silent rows play nothing', () => {
    for (const [kind, evs] of Object.entries(GAME_SAMPLES)) {
      const row = GAME_BINDINGS[kind as GameEvent['t']];
      for (const e of evs) {
        const r = recorder();
        (row.on as (x: GameEvent, s: AudioSink, st: BindState) => void)(e as GameEvent, r.sink, fresh());
        for (const c of r.cues()) expect(row.cues, `${kind} played ${c}`).toContain(c);
        if (row.cues.length === 0) expect(r.cues(), kind).toEqual([]);
      }
    }
  });

  it('each AppEvent row plays only the cues it declares', () => {
    for (const [kind, evs] of Object.entries(APP_SAMPLES)) {
      const row = APP_BINDINGS[kind as AppEvent['t']];
      for (const e of evs) {
        const r = recorder();
        (row.on as (x: AppEvent, s: AudioSink, st: BindState) => void)(e as AppEvent, r.sink, fresh());
        for (const c of r.cues()) expect(row.cues).toContain(c);
        if (row.cues.length === 0) expect(r.cues(), kind).toEqual([]);
      }
    }
  });

  it('every SfxId of the frozen contract is reachable from some event', () => {
    const declared = new Set([...Object.values(GAME_BINDINGS), ...Object.values(APP_BINDINGS)].flatMap((b) => [...b.cues]));
    for (const id of SFX_IDS) expect(declared, id).toContain(id);
  });

  it('musical actions: crash → tape stop (not in god mode), trick → note(seq) + combo filter, bank resets, FLOW → level 2, gateway → next area', () => {
    const game = createBus<GameEvent>(), app = createBus<AppEvent>();
    const r = recorder();
    const off = bindAll(game, app, r.sink);
    game.emit({ t: 'crash', tick: 1, cause: 'slam', obstacleId: null, kind: null, speed: 9, state: 'roll', flipProgress: 0, spinProgress: 0, god: true });
    expect(r.calls).toEqual([]);
    game.emit(GAME_SAMPLES.crash[0]!);
    expect(r.calls.map((c) => c.m)).toEqual(['cue', 'tapeStop']);
    r.calls.length = 0;
    game.emit(GAME_SAMPLES.trickScored[0]!);
    expect(r.calls).toEqual([{ m: 'note', a: [3] }, { m: 'setComboFilter', a: [4] }]);
    game.emit(GAME_SAMPLES.bonus[0]!);
    expect(r.calls[2]).toMatchObject({ m: 'note', a: [3, { degreeOffset: 2 }] });
    r.calls.length = 0;
    game.emit(GAME_SAMPLES.comboBanked[0]!);
    expect(r.calls).toEqual([{ m: 'cue', a: ['comboBank', { variant: 'gateway' }] }, { m: 'setComboFilter', a: [1] }]);
    r.calls.length = 0;
    for (const e of GAME_SAMPLES.speedTier) game.emit(e);
    expect(r.calls.map((c) => c.a[0])).toEqual([1, 2, 2]);
    r.calls.length = 0;
    game.emit(GAME_SAMPLES.gatewayEnter[0]!);
    expect(r.calls).toEqual([{ m: 'setArea', a: ['suburbs', 4] }]);
    r.calls.length = 0;
    game.emit(GAME_SAMPLES.grindStart[0]!);
    game.emit(GAME_SAMPLES.grindSwitch[0]!);
    expect(r.calls[1]).toMatchObject({ m: 'cue', a: ['grindSwitch', { material: 'metal' }] });
    off();
    r.calls.length = 0;
    game.emit(GAME_SAMPLES.ollie[0]!);
    app.emit({ t: 'ui', sfx: 'tap' });
    expect(r.calls).toEqual([]);
  });
});
