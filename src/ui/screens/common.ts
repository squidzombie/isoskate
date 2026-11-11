// ui/screens/common.ts: the screen contract inside ui/ and the shared builders (DESIGN §17.4 UI style). Each screen
// builds its <section data-screen> once; show() updates text and classes only.
import type { AppEvent } from '../../core/events';
import type { Rarity, ScreenId } from '../../core/ids';
import type { CosmeticItem } from '../../core/cosmetics';
import type { MetaApi, RunRewards } from '../../core/meta';
import type { MonetizationProvider } from '../../core/platform';
import type { SaveV1 } from '../../core/save';
import type { RunResult } from '../../core/sim';
import type { UiIntent } from '../../core/ui';
import type { MetaExt } from '../../meta';
import { itemArt } from '../art';
import { h, type Child } from '../h';
import { icon } from '../icons';
import type { Lofi } from '../overlay';

/** show() params: the UiApi params plus what ui/ tracks itself (crash cause, lost combo, session best). */
export interface ScreenParams {
  result?: RunResult; rewards?: RunRewards; rotate?: boolean;
  cause?: string; lost?: number; best?: number;
  settings?: Readonly<SaveV1['settings']>;
}
export interface Screen {
  readonly id: ScreenId; readonly el: HTMLElement;
  show(p: ScreenParams): void;
  /** Called when another screen replaces this one. */
  hide?(): void;
}
export type Raise = (i: UiIntent) => void;
export type Sfx = 'tap' | 'back' | 'toggle' | 'error';

export interface Modal {
  readonly open: boolean;
  show(content: HTMLElement, o?: { cls?: string; onClose?: () => void; dismissable?: boolean }): void;
  close(): void;
}

/** Live services a screen may use (attach() provides meta and the app bus). */
export interface ScreenCtx {
  raise: Raise;
  meta(): MetaApi | null;
  ext(): MetaExt | null;
  emit(e: AppEvent): void;
  sfx(s: Sfx): void;
  /** Menu-to-menu navigation through the App (Home first when the App only opens screens from Title / Results). */
  go(screen: ScreenId): void;
  current(): ScreenId;
  modal: Modal;
  toast(text: string, ms?: number): void;
  lofi: Lofi;
  monetization(): MonetizationProvider;
  coarse(): boolean;
}

/** A real <button> (≥ 56 px hit area via CSS) that plays the UI tap and raises an intent or runs a handler. */
export function btn(label: Child | Child[], intent: UiIntent | (() => void), ctx: Pick<ScreenCtx, 'raise' | 'sfx'>, cls = '', aria?: string, sfx: Sfx | null = 'tap'): HTMLButtonElement {
  const kids = Array.isArray(label) ? label : [label];
  return h('button', { type: 'button', class: cls, 'aria-label': aria, onclick: (e: Event) => {
    e.stopPropagation();
    if (sfx) ctx.sfx(sfx);
    if (typeof intent === 'function') intent(); else ctx.raise(intent);
  } }, ...kids);
}

export const section = (id: ScreenId, cls: string, ...children: Child[]) =>
  h('section', { class: `screen ${cls}`, dataset: { screen: id } }, ...children);

/** Fine pointer (desktop): show key hints. Evaluated when a screen opens, never per frame. */
export const finePointer = () => typeof matchMedia === 'function' && !matchMedia('(pointer: coarse)').matches;

export const RARITY_LABEL: Readonly<Record<Rarity, string>> = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' };
export const SLOT_LABEL = { skater: 'Skaters', board: 'Boards', helmet: 'Helmets' } as const;

/** Coin amount with the coin glyph. */
export const coinTag = (n: number | string, cls = '') => h('span', { class: `coins-tag ${cls}` }, h('i', { class: 'coin-dot', 'aria-hidden': 'true' }), String(n));
export const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');

/** An item card: art, a rarity band with its text label (Rare blue and Epic violet are easy to confuse), the name and
 *  a footer (price, "EQUIPPED", "NEW"). */
export function itemCard(it: CosmeticItem, footer: Child, o: { onClick?: () => void; badge?: string | null; selected?: boolean; dim?: boolean } = {}): HTMLButtonElement {
  const img = h('img', { class: 'card-art', alt: '', draggable: 'false', decoding: 'async' });
  img.src = itemArt(it);
  return h('button', { type: 'button', class: `card r-${it.rarity}${o.selected ? ' sel' : ''}${o.dim ? ' dim' : ''}`, dataset: { item: it.id },
    'aria-label': `${it.name}, ${RARITY_LABEL[it.rarity].toLowerCase()}`, onclick: (e: Event) => { e.stopPropagation(); o.onClick?.(); } },
  h('span', { class: 'card-band' }, RARITY_LABEL[it.rarity]),
  img,
  h('span', { class: 'card-name' }, it.name),
  h('span', { class: 'card-foot' }, footer),
  o.badge ? h('span', { class: 'card-badge' }, o.badge) : null);
}

/** A horizontal progress bar (transform-only fill). */
export function bar(cls = ''): { el: HTMLElement; set(u: number): void } {
  const fill = h('i', null);
  const el = h('div', { class: `bar ${cls}` }, fill);
  return { el, set(u) { fill.style.transform = `scaleX(${Math.max(0, Math.min(1, u)).toFixed(3)})`; } };
}

/** Screen header: title, optional coin balance, and a Back button (Back / Esc / back gesture all go Home or to Pause). */
export function header(title: string, ctx: Pick<ScreenCtx, 'raise' | 'sfx'>, coins?: HTMLElement): HTMLElement {
  return h('header', { class: 'scr-head' },
    btn([icon('back', 'chev'), 'Back'], { k: 'home' }, ctx, 'back-btn', undefined, 'back'),
    h('h2', null, title),
    coins ?? h('span', { class: 'head-pad' }));
}
