// ui/fit.ts: text fitting without layout reads (TECH §9 "nothing reads layout during a run"). Widths come from a
// 2D canvas `measureText` (no DOM layout), and the HUD column widths are pure arithmetic from the viewport width,
// `k` and the safe insets (read only at boot and on resize), so the HUD can never overlap by construction.
import { HUD_LAYOUT } from './ui.config';

let c2d: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

/** Width in px of `text` in the CSS font shorthand `font` (canvas measure; a char-count estimate without canvas). */
export function measure(text: string, font: string): number {
  const key = `${font}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (c2d === undefined) {
    try { c2d = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null; } catch { c2d = null; }
  }
  let w: number;
  if (c2d) { c2d.font = font; w = c2d.measureText(text).width; }
  else { const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '16'); w = text.length * px * (/Bungee/.test(font) ? 0.78 : 0.58); }
  if (cache.size > 600) cache.clear();
  cache.set(key, w);
  return w;
}
/** Webfonts finished loading: widths measured with the fallback font are stale. */
export function clearMeasureCache(): void { cache.clear(); }

export const UI_FONT = 'Nunito, ui-rounded, system-ui, sans-serif';
export const DISPLAY_FONT = "Bungee, 'Arial Black', Impact, system-ui";

/** The largest font size ≤ basePx (and ≥ minPx) at which `text` fits in maxW (with a 6% safety margin for fallback
 *  fonts and rounding). */
export function fitPx(text: string, family: string, weight: number, basePx: number, minPx: number, maxW: number): number {
  if (!text || maxW <= 0) return basePx;
  const w = measure(text, `${weight} ${basePx}px ${family}`) * 1.06;
  if (w <= maxW) return basePx;
  return Math.max(minPx, Math.floor((basePx * maxW / w) * 10) / 10);
}

export interface HudColumns { padL: number; padR: number; gap: number; leftW: number; midW: number; rightW: number; coinW: number; pause: number; k: number }

/** HUD band columns (DESIGN §13.8): score left (26·k px digits, 7 chars max thanks to the 1M abbreviation), coins
 *  and the 56 px pause hit area right, the combo pill and the trick name in the middle. Pure. */
export function hudColumns(vw: number, safeL = 0, safeR = 0): HudColumns {
  const L = HUD_LAYOUT;
  const k = Math.min(L.kMax, Math.max(L.kMin, vw / L.refW));
  const padL = L.padL + safeL, padR = L.padR + safeR, gap = L.gap, pause = L.pause;
  const leftW = Math.round(L.scorePx * k * L.scoreEm);
  const coinW = Math.round(L.coinPx * k * L.coinEm);
  const rightW = coinW + L.coinGap + pause;
  const midW = Math.max(L.midMin, vw - padL - padR - leftW - rightW - 2 * gap);
  return { padL, padR, gap, leftW, midW, rightW, coinW, pause, k };
}
