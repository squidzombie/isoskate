// audio/bindings.ts: what every GameEvent and AppEvent sounds like (DESIGN §9 juice table, §19.3). One row per event
// kind, typed exhaustively, so adding a kind to core/events.ts fails the typecheck here until it is given a sound or
// marked silent. `cues` lists every cue a row may play (the bindings test checks each handler stays inside it).
import type { AppEvent, GameEvent } from '../core/events';
import type { AreaId, EdgeMaterial, FlipId } from '../core/ids';
import type { Bus } from '../core/bus';
import { FEEDBACK, GATEWAY_TO, INTENSITY, LEVEL_UP } from './mix.config';
import type { Cue } from './engine';
import type { CueOpts } from './sfx/oneshots';

/** What the bindings drive. AudioCore implements it; the tests use a recorder. */
export interface AudioSink {
  cue(id: Cue, o?: CueOpts, at?: number): void;
  note(seq: number, o?: { gain?: number; degreeOffset?: number }): void;
  coin(tick: number, value: number): void;
  runStart(): void;
  areaEnter(area: AreaId): void;
  setArea(area: AreaId, gatewaySec: number): void;
  setIntensity(level: number): void;
  setComboFilter(mult: number): void;
  tapeStop(): void;
  duck(db: number, sec: number): void;
  /** AudioContext time (for cues scheduled ahead, e.g. the catch at the end of a flip). */
  now(): number;
}
/** Per-attach memory the handlers share (the material of the grind in progress, the last feedback degree). */
export interface BindState { material: EdgeMaterial | null; seq: number }
export interface Binding<E> {
  /** Every cue this row may play; [] = silent (musical actions only, or nothing). */
  readonly cues: readonly Cue[];
  readonly doc: string;
  on(e: E, s: AudioSink, st: BindState): void;
}
export type GameBindings = { readonly [K in GameEvent['t']]: Binding<Extract<GameEvent, { t: K }>> };
export type AppBindings = { readonly [K in AppEvent['t']]: Binding<Extract<AppEvent, { t: K }>> };

const SHOVE: ReadonlySet<FlipId> = new Set<FlipId>(['popShuvit', 'shuvit360']);
const LAYERED: ReadonlySet<FlipId> = new Set<FlipId>(['treFlip', 'laserFlip']);
const silent = (doc: string) => ({ cues: [] as const, doc, on: () => undefined });

export const GAME_BINDINGS: GameBindings = {
  runStart: { cues: [], doc: 'music: reset start area, speed level, combo filter, coin climb; needle drop after a tape stop', on: (_e, s) => s.runStart() },
  ollie: { cues: ['pop'], doc: 'pop: noise click + wood knock + grip scrape', on: (e, s) => s.cue('pop', { gain: e.from === 'roll' ? 1 : 0.85 }) },
  airborne: silent('the roll layer fades in 40 ms and the wheel whir starts (audio.roll airborne=true)'),
  flipStart: {
    cues: ['whoosh', 'catch'], doc: 'whoosh over 60% of the flip (shove-its pan, tre/laser layer two sweeps), grip-tap catch at the end',
    on: (e, s) => {
      s.cue('whoosh', { dur: e.dur, variant: SHOVE.has(e.id) ? 'shove' : LAYERED.has(e.id) ? 'tre' : '' });
      s.cue('catch', { gain: 0.8 }, s.now() + e.dur);
    },
  },
  flipUpgrade: { cues: ['whoosh'], doc: 'a short, brighter extra sweep', on: (e, s) => s.cue('whoosh', { dur: 0.22, gain: 0.6, pitch: 1.15, variant: SHOVE.has(e.to) ? 'shove' : '' }) },
  spinStart: { cues: ['spin'], doc: 'low swish panned with the spin direction', on: (e, s) => s.cue('spin', { dur: e.dur, side: e.id.startsWith('fs') ? 1 : -1 }) },
  spinUpgrade: { cues: ['spin'], doc: 'a second, higher swish', on: (e, s) => s.cue('spin', { dur: 0.3, gain: 0.7, pitch: 1.1, side: e.to.startsWith('fs') ? 1 : -1 }) },
  revert: { cues: ['revert'], doc: 'revert scuff', on: (_e, s) => s.cue('revert') },
  grabStart: { cues: ['catch'], doc: 'soft grip tap', on: (_e, s) => s.cue('catch', { gain: 0.6, pitch: 0.9 }) },
  grabEnd: silent('the landing carries it'),
  land: {
    cues: ['land', 'sketchy', 'perfect'], doc: 'two knocks + thud (bigger drops +4 dB, −20% pitch); sketchy scuff; perfect double clack + chord chime',
    on: (e, s) => s.cue(e.quality === 'clean' ? 'land' : e.quality, { drop: e.dropH }),
  },
  pickWindow: { cues: ['pickChime'], doc: 'soft chime when the pick window opens (closing is silent)', on: (e, s) => { if (e.open) s.cue('pickChime'); } },
  grindStart: {
    cues: ['grindEntry', 'perfectLock'], doc: 'material entry hit (metal FM clank, concrete thump, wood knock); Perfect Lock adds a bright ring. The loop is audio.grind()',
    on: (e, s, st) => {
      st.material = e.material;
      s.cue('grindEntry', { material: e.material, gain: e.transfer ? 0.8 : 1 });
      if (e.perfect) s.cue('perfectLock', { material: e.material });
    },
  },
  grindSwitch: { cues: ['grindSwitch'], doc: 'a lighter re-entry hit on the same material', on: (_e, s, st) => s.cue('grindSwitch', { material: st.material }) },
  grindEnd: { cues: ['grindExit'], doc: 'short scrape release', on: (e, s, st) => { s.cue('grindExit', { material: st.material, gain: e.exit === 'pop' ? 0.7 : 1 }); st.material = null; } },
  manualStart: { cues: ['catch'], doc: 'tail tap', on: (_e, s) => s.cue('catch', { gain: 0.5, pitch: 0.8 }) },
  manualEnd: silent('the roll layer returns to 4 wheels (audio.roll manual=false)'),
  trickScored: {
    cues: [], doc: 'musical feedback note(seq), quantized ≤ 40 ms; the combo filter follows max(1, links)',
    on: (e, s, st) => { st.seq = e.seq; s.note(e.seq); s.setComboFilter(Math.max(1, e.links)); },
  },
  bonus: { cues: [], doc: 'a quieter grace note a third above the last feedback note', on: (_e, s, st) => s.note(st.seq, { gain: FEEDBACK.graceGain, degreeOffset: 2 }) },
  comboBanked: {
    cues: ['comboBank'], doc: 'arpeggio of the current chord (gateway: + an octave); the combo filter closes back to ×1',
    on: (e, s, st) => { s.cue('comboBank', { variant: e.reason === 'gateway' ? 'gateway' : '' }); s.setComboFilter(1); st.seq = 0; },
  },
  comboLost: { cues: ['comboLost'], doc: 'descending minor third', on: (_e, s, st) => { s.cue('comboLost'); s.setComboFilter(1); st.seq = 0; } },
  coin: { cues: ['coin'], doc: 'coin chime climbing the pentatonic within 1.5 s; 10-coins add a sparkle', on: (e, s) => s.coin(e.tick, e.value) },
  nearMiss: { cues: ['nearMiss'], doc: 'band-pass sweep 3 → 1 kHz panned to the obstacle side', on: (e, s) => s.cue('nearMiss', { side: e.side }) },
  bump: { cues: ['bump'], doc: 'side scuff + thud, panned', on: (e, s) => s.cue('bump', { side: e.side }) },
  knock: { cues: ['knock'], doc: 'plastic tock + rattle', on: (_e, s) => s.cue('knock') },
  hazardWarn: { cues: ['hazardTick'], doc: 'wood-block tick 1.6 s before a full-width hazard, never quantized', on: (_e, s) => s.cue('hazardTick') },
  stairStep: { cues: ['stair'], doc: '25 ms knock per step', on: (_e, s) => s.cue('stair') },
  surface: silent('the roll layer switches surface (audio.roll surface)'),
  areaEnter: {
    cues: ['newArea'], doc: 'music follows the area (pivot if no gateway did it); first visit after the start gets a soft swell',
    on: (e, s) => { s.areaEnter(e.area); if (e.firstThisRun && e.tick > 1) s.cue('newArea'); },
  },
  gatewayEnter: { cues: [], doc: "music: one bar of the next key's V7, then the new song at the next bar line", on: (e, s) => s.setArea(GATEWAY_TO[e.gateway], 4) },
  landmark: silent('the landmark bonus event plays its grace note'),
  bestPassed: { cues: ['newBest'], doc: 'vocal-chop style flourish', on: (_e, s) => s.cue('newBest') },
  speedTier: { cues: [], doc: 'music intensity: FLOW (tier ≥ 2) brings level 2', on: (e, s) => s.setIntensity(e.tier >= INTENSITY.flowTier ? 2 : 1) },
  crash: {
    cues: ['crash'], doc: 'noise burst + thump + board clatter, then the tape stop; god-mode crashes are logged only, silent',
    on: (e, s) => { if (e.god) return; s.cue('crash'); s.tapeStop(); },
  },
  rewind: { cues: ['rewind'], doc: 'tape-rewind chirp', on: (_e, s) => s.cue('rewind') },
  runEnd: silent('the crash already sounded; Results brings the music back at level 0 (setScene)'),
};

const REVEAL = { common: 'revealCommon', rare: 'revealRare', epic: 'revealEpic', legendary: 'revealLegendary' } as const;
const UI = { tap: 'uiTap', back: 'uiBack', toggle: 'uiToggle', error: 'uiError' } as const;

export const APP_BINDINGS: AppBindings = {
  screen: silent('scene changes come through setScene; buttons raise ui events'),
  pause: silent('setScene(paused): level 0, muffled, −4 dB'),
  resume: silent('setScene(run)'),
  hint: silent('hints are visual; a sound would read as a gameplay cue'),
  levelUp: { cues: ['levelUp'], doc: 'Maj9 arpeggio + shimmer, music ducks 3 dB', on: (_e, s) => { s.cue('levelUp'); s.duck(LEVEL_UP.duckDb, LEVEL_UP.duckSec); } },
  itemGranted: silent('the crate reveal or level-up stinger carries it'),
  coinsChanged: silent('pickups and purchases have their own sounds'),
  crateShake: { cues: ['crateShake'], doc: 'cardboard thump, +2 semitones per tap', on: (e, s) => s.cue('crateShake', { n: e.n }) },
  crateReveal: { cues: ['revealCommon', 'revealRare', 'revealEpic', 'revealLegendary'], doc: 'stinger by rarity', on: (e, s) => s.cue(REVEAL[e.rarity]) },
  purchase: { cues: ['purchase'], doc: 'three coin chimes', on: (_e, s) => s.cue('purchase') },
  settings: silent('the toggle or slider raised its own ui event'),
  ui: { cues: ['uiTap', 'uiBack', 'uiToggle', 'uiError'], doc: 'UI blips', on: (e, s) => s.cue(UI[e.sfx]) },
  quality: silent('no sound'),
  contextLost: silent('no sound'),
  contextRestored: silent('no sound'),
};

/** Subscribes the tables to both buses; returns the unsubscribe function. */
export function bindAll(game: Bus<GameEvent>, app: Bus<AppEvent>, s: AudioSink): () => void {
  const st: BindState = { material: null, seq: 0 };
  const offs = [
    game.onAny((e) => (GAME_BINDINGS[e.t] as Binding<GameEvent>).on(e, s, st)),
    app.onAny((e) => (APP_BINDINGS[e.t] as Binding<AppEvent>).on(e, s, st)),
  ];
  return () => { for (const off of offs) off(); };
}
