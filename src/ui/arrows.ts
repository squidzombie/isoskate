// ui/arrows.ts: arrows are drawn, never typed (BRAND §2.1): the latin font subset carries ↑ and ↓ but not ← →, ↔ or
// the diagonals, which would fall back to a system font. `withArrows` swaps every arrow character for an inline SVG
// icon in the text's colour, 1 em tall, so hint chips, key caps, toasts and the results goal keep one drawn style.

const SVG = 'http://www.w3.org/2000/svg';
/** Arrow character → the angle it points at (degrees clockwise from →); `both` draws a head at each end. */
const ARROWS: Readonly<Record<string, { deg: number; label: string; both?: true }>> = {
  '→': { deg: 0, label: 'right' }, '↘': { deg: 45, label: 'down right' }, '↓': { deg: 90, label: 'down' }, '↙': { deg: 135, label: 'down left' },
  '←': { deg: 180, label: 'left' }, '↖': { deg: 225, label: 'up left' }, '↑': { deg: 270, label: 'up' }, '↗': { deg: 315, label: 'up right' },
  '↔': { deg: 0, label: 'left or right', both: true },
};
const SPLIT = /([←→↑↓↖↗↘↙↔])/;

/** True when `text` holds an arrow character that `withArrows` would draw. */
export function hasArrow(text: string): boolean { return SPLIT.test(text); }

/** An inline arrow icon (SVG, `currentColor`, class `arr`) pointing like the arrow character `ch`. */
export function arrowIcon(ch: string): SVGSVGElement {
  const a = ARROWS[ch] ?? ARROWS['→']!;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'arr');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', a.label);
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', a.both ? 'M2.5 8h11M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5' : 'M2.5 8h10M8.5 3.5 13 8l-4.5 4.5');
  p.setAttribute('transform', `rotate(${a.deg} 8 8)`);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2.6');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}

/** `text` as nodes, every arrow character drawn as an icon (for `append` / `replaceChildren`). */
export function withArrows(text: string): (string | SVGSVGElement)[] {
  return text.split(SPLIT).filter((s) => s !== '').map((s) => (ARROWS[s] ? arrowIcon(s) : s));
}

/** Sets an element's content to `text` with drawn arrows, only when the text changed. */
export function setArrowText(el: HTMLElement, text: string): void {
  if (el.dataset.text === text && el.childNodes.length) return;
  el.dataset.text = text;
  el.replaceChildren(...withArrows(text));
}
