// core/ui.ts (TECH §4.12). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
import type { AreaId, ItemId, ScreenId } from './ids';
import type { RunRewards, MetaApi } from './meta';
import type { RunResult, ScoreState, SkaterState } from './sim';
import type { Bus } from './bus';
import type { SaveV1 } from './save';
import type { AppEvent, GameEvent } from './events';
export interface HudApi {
  show(on: boolean): void;
  /** anchor = the skater's projected CSS position (CameraRig.project), for popups beside/below the skater. */
  update(score: Readonly<ScoreState>, cur: Readonly<SkaterState>, dt: number, anchor: { x: number; y: number }): void;   // ≤ 15 Hz text writes
  hint(id: string | null): void;
}
export interface UiApi {
  readonly hud: HudApi;
  show(screen: ScreenId, params?: { result?: RunResult; rewards?: RunRewards; rotate?: boolean;   // rotate: landscape card on Pause
    settings?: Readonly<SaveV1['settings']> }): void;                                             // Settings: current values (added @G0)
  readonly current: ScreenId;
  toast(text: string, ms?: number): void;
  attach(game: Bus<GameEvent>, app: Bus<AppEvent>, meta: MetaApi): () => void;
  /** UI raises intents; game/app.ts decides what happens. */
  onIntent(f: (i: UiIntent) => void): () => void;
}
export type UiIntent =
  | { k: 'play'; startArea?: AreaId } | { k: 'retry' } | { k: 'pause' } | { k: 'resume' } | { k: 'home' } | { k: 'restart' }
  | { k: 'open'; screen: ScreenId } | { k: 'settings'; key: string; value: unknown } | { k: 'rewarded'; placement: string }
  | { k: 'preview'; id: ItemId | null }                 // shop / locker try-on on the turntable
  | { k: 'turntable'; dYaw: number }                    // Locker drag-to-rotate
  | { k: 'backup' } | { k: 'restore'; json: string };   // Settings: export() / import()
