// ui/icons.ts: tiny inline SVG icons (no emoji: phones and headless builds render them inconsistently, and they
// carry no ink outline). Static strings only; `icon(name)` returns a span the caller places.
const S = (body: string) => `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  play: S('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  shirt: S('<path d="M8 3.5 3.5 6.5 5.5 10.5 7.5 9.5V20.5h9V9.5l2 1 2-4L16 3.5a4 4 0 0 1-8 0z" fill="currentColor" fill-opacity=".18"/>'),
  board: S('<rect x="2.5" y="8" width="19" height="8" rx="4" fill="currentColor" fill-opacity=".18"/><circle cx="7" cy="18.5" r="1.6" fill="currentColor"/><circle cx="17" cy="18.5" r="1.6" fill="currentColor"/>'),
  gift: S('<rect x="3.5" y="9" width="17" height="11.5" rx="2" fill="currentColor" fill-opacity=".18"/><path d="M2.5 9h19M12 9v11.5M12 9c-2-4.5-6.5-4-6 -1.2.4 1.6 6 1.2 6 1.2zm0 0c2-4.5 6.5-4 6-1.2-.4 1.6-6 1.2-6 1.2z"/>'),
  star: S('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor" fill-opacity=".18"/>'),
  gear: S('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9"/><circle cx="12" cy="12" r="6.4"/>'),
  heart: S('<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>'),
  heartFull: S('<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="currentColor"/>'),
  lock: S('<rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" fill-opacity=".18"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  back: S('<path d="M15 5 8 12l7 7"/>'),
  home: S('<path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5"/>'),
  retry: S('<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19.5 4v4.5H15"/>'),
} as const;
export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = 'ico'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name];
  return s;
}
