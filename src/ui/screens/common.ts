// ui/screens/common.ts: the screen contract inside ui/ and small builders. Each screen builds its
// <section data-screen> once; show() updates text and classes only.
import type { ScreenId } from '../../core/ids';
import type { MetaApi, RunRewards } from '../../core/meta';
import type { SaveV1 } from '../../core/save';
import type { RunResult } from '../../core/sim';
import type { UiIntent } from '../../core/ui';
import { h } from '../h';

/** show() params: the UiApi params plus what ui/ tracks itself (crash cause, lost combo, session best). */
export interface ScreenParams {
  result?: RunResult; rewards?: RunRewards; rotate?: boolean;
  cause?: string; lost?: number; best?: number;
  /** Settings values when the app passes them (requested in docs/core-requests.md); else the stored ones. */
  settings?: Readonly<SaveV1['settings']>;
}
export interface Screen { readonly id: ScreenId; readonly el: HTMLElement; show(p: ScreenParams): void }
export type Raise = (i: UiIntent) => void;
/** Live services a screen may read (attach() provides meta). */
export interface ScreenCtx { raise: Raise; meta(): MetaApi | null }

export const btn = (label: string, intent: UiIntent | (() => void), raise: Raise, cls = '', aria?: string) =>
  h('button', { type: 'button', class: cls, 'aria-label': aria, onclick: (e: Event) => {
    e.stopPropagation();
    if (typeof intent === 'function') intent(); else raise(intent);
  } }, label);

export const section = (id: ScreenId, cls: string, ...children: Parameters<typeof h>[2][]) =>
  h('section', { class: `screen ${cls}`, dataset: { screen: id } }, ...children);

/** Fine pointer (desktop): show key hints. Evaluated when a screen opens, never per frame. */
export const finePointer = () => typeof matchMedia === 'function' && !matchMedia('(pointer: coarse)').matches;
