// ui/popups.ts: trick / bonus popups beside the skater (DESIGN §13.8, §17.4; TECH §9). A pool of 4 elements, ONE
// visible at a time, ≤ 0.5 s in total (scale 0.6 → 1.1 → 1 in 120 ms, then fade), placed beside the projected skater
// toward the screen centre so it never covers the look-ahead, coloured by type and tinted poppy while the predicted
// landing of the trick it names would be Sketchy or a bail. Per frame: transform/opacity only. The text is written
// once per popup, inside the HUD's ≤ 15 Hz text batch.
import { LAND } from '../core/tuning';
import type { SkaterState } from '../core/sim';
import { h } from './h';
import { POPUP } from './ui.config';

export type PopupKind = 'flip' | 'grind' | 'manual' | 'gap' | 'perfect' | 'sketchy' | 'bonus';
/** Fills over the ink stroke (BRAND §4.4): trick names in moon or a light type tint, points and bonuses in amber / sun, the
 *  poppy tint for a landing that would go wrong. Every one is ≥ 4.8:1 against the ink stroke. */
export const POPUP_COLOR: Readonly<Record<PopupKind, string>> = {
  flip: '#FFFDF6', grind: '#9BE7DD', manual: '#CDB9FF', gap: '#FFC870', perfect: '#FFC94A', sketchy: '#D9D2C8', bonus: '#FFB13B',
};
export const CORAL = '#E0674F';
export { POPUP };

/** Would the current flip/spin land sketchy or bail if nothing changes (DESIGN §13.8 popup tint)? */
export function badLandingPredicted(cur: Readonly<SkaterState>): boolean {
  if (cur.mode !== 'air') return false;
  const p = (r: { t: number; dur: number } | null) => (r ? Math.min(1, (r.t + Math.max(0, cur.airLeft)) / Math.max(1e-6, r.dur)) : 1);
  return Math.min(p(cur.flip), p(cur.spin)) < LAND.snap;
}

/** Scale and opacity of a popup `t` seconds after it appeared (pure; unit-tested). */
export function popupCurve(t: number): { scale: number; alpha: number } {
  const a = POPUP.popIn / 2;
  const scale = t < a ? 0.6 + (0.5 * t) / a : t < POPUP.popIn ? 1.1 - (0.1 * (t - a)) / a : 1;
  const alpha = t >= POPUP.sec ? 0 : t < POPUP.holdTo ? 1 : 1 - (t - POPUP.holdTo) / (POPUP.sec - POPUP.holdTo);
  return { scale, alpha: Math.max(0, alpha) };
}

export interface Popups {
  readonly els: readonly HTMLElement[];
  /** Queue a popup (replaces the visible one at the next text batch). */
  show(text: string, kind: PopupKind, predicted?: boolean): void;
  /** Text batch (≤ 15 Hz): returns true if it wrote. */
  flushText(): boolean;
  update(dt: number, anchor: { x: number; y: number }, cur: Readonly<SkaterState>, vw: number): void;
  clear(): void;
}

export function createPopups(): Popups {
  const els = Array.from({ length: POPUP.pool }, () => h('div', { class: 'hud-popup', 'aria-hidden': 'true' }, ''));
  let queued: { text: string; kind: PopupKind; predicted: boolean } | null = null;
  let cur = -1, t = Infinity, predicted = false, color = '', side = 1, coral = false;
  const hideEl = (i: number) => { const e = els[i]; if (e && e.style.opacity !== '0') e.style.opacity = '0'; };
  return {
    els,
    show(text, kind, pred = false) { queued = { text, kind, predicted: pred }; },
    flushText() {
      if (!queued) return false;
      if (cur >= 0) hideEl(cur);
      cur = (cur + 1) % els.length;
      const e = els[cur]!;
      e.textContent = queued.text;
      color = POPUP_COLOR[queued.kind];
      e.style.color = color;
      coral = false;
      predicted = queued.predicted;
      queued = null;
      t = 0;
      return true;
    },
    update(dt, anchor, s, vw) {
      if (cur < 0 || t >= POPUP.sec) { if (cur >= 0) hideEl(cur); return; }
      if (t === 0) side = anchor.x > vw * 0.5 ? -1 : 1;          // toward the screen centre, decided once
      t += dt;
      const e = els[cur]!;
      const { scale, alpha } = popupCurve(t);
      const x = Math.min(vw - POPUP.edge, Math.max(POPUP.edge, anchor.x + side * POPUP.dx));
      e.style.transform = `translate3d(${x.toFixed(1)}px, ${(anchor.y + POPUP.dy).toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      e.style.opacity = alpha.toFixed(3);
      const bad = predicted && badLandingPredicted(s);
      if (bad !== coral) { coral = bad; e.style.color = bad ? CORAL : color; e.classList.toggle('bad', bad); }
    },
    clear() { queued = null; t = Infinity; for (let i = 0; i < els.length; i++) hideEl(i); },
  };
}
