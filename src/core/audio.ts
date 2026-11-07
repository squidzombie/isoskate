// core/audio.ts (TECH §4.10). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
import type { AreaId, EdgeMaterial, Surface } from './ids';
import type { Bus } from './bus';
import type { AppEvent, GameEvent } from './events';
export type SfxId = 'pop' | 'whoosh' | 'catch' | 'land' | 'sketchy' | 'perfect' | 'perfectLock' | 'stair'
  | 'bump' | 'knock' | 'coin' | 'nearMiss' | 'hazardTick' | 'comboBank' | 'comboLost' | 'crash' | 'newBest'
  | 'newArea' | 'grindEntry' | 'grindExit' | 'uiTap' | 'uiBack' | 'uiToggle' | 'uiError' | 'purchase'
  | 'levelUp' | 'crateShake' | 'crateOpen' | 'revealCommon' | 'revealRare' | 'revealEpic' | 'revealLegendary'
  | 'spin' | 'revert' | 'pickChime' | 'rewind' | 'needle' | 'grindSwitch'   // internal cues, added @G0
  | 'birdFlutter' | 'reverseChirp';   // RECLAIM ambience one-shots (perched birds take off; the self-parking car reverses), added @theme T5
export interface AudioEngine {
  unlock(): Promise<boolean>; readonly unlocked: boolean;
  suspend(): void; resume(): void;
  setVolumes(v: { music: number; sfx: number }): void;
  setScene(s: 'menu' | 'run' | 'paused' | 'results'): void;
  music: {
    start(area: AreaId, seed: number): void;
    setArea(a: AreaId, gatewaySec: number): void;   // pivot bar + crossfade at the next bar line
    setIntensity(level: 0 | 1 | 2 | 3): void;
    setComboFilter(mult: number): void;             // 800 Hz at ×1 → 8 kHz at ×10+
    tapeStop(): void; duck(db: number, sec: number): void; stop(): void;
    clock(): { bpm: number; nextSixteenthAt: number };   // AudioContext time
  };
  roll(speed01: number, surface: Surface, airborne: boolean, manual: boolean): void;  // every frame
  grind(active: boolean, material: EdgeMaterial | null, slide: boolean): void;      // every frame
  sfx(id: SfxId, o?: { pan?: number; pitch?: number; gain?: number; intensity?: number }): void;
  note(seq: number): void;                           // musical feedback, quantized ≤ 40 ms
  /** Event bindings live inside audio/; returns an unsubscribe function. */
  attach(game: Bus<GameEvent>, app: Bus<AppEvent>): () => void;
  stats(): { voices: number; contextState: string; scene: string; intensity: number };
}
