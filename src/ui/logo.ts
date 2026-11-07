// ui/logo.ts: the wordmark (BRAND §3), shared by the Title and the boot screen. GAME_NAME in Bungee caps as two
// stacked layers, both aria-hidden (the h1 carries the name): an ink outline under, the moon-cream to sea-glass fill
// over (one text layer cannot carry a gradient fill and a stroke), and the O filled with the Earth. The logo never
// shows in a fallback face: it stays hidden (`fonts-pending`) until Bungee has loaded, or 1.2 s at most (one read at
// boot, outside the run).
import { GAME_NAME } from '../core/ids';
import { h } from './h';

const pending = new Set<HTMLElement>();
let released = false, started = false;

function release(): void {
  released = true;
  for (const el of pending) el.classList.remove('fonts-pending');
  pending.clear();
}

function holdForFont(el: HTMLElement): void {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (released || !fonts?.load) return;
  el.classList.add('fonts-pending');
  pending.add(el);
  if (started) return;
  started = true;
  setTimeout(release, 1200);
  fonts.load('400 50px Bungee').then(release, release);
}

export function logoEl(extra = ''): HTMLElement {
  const up = GAME_NAME.toUpperCase(), i = up.indexOf('O');
  const word = (layer: string) => h('span', { class: `logo-w ${layer}`, 'aria-hidden': 'true' },
    ...(i < 0 ? [up] : [up.slice(0, i), h('span', { class: 'o' }, 'O'), up.slice(i + 1)]));
  const el = h('h1', { class: `logo ${extra}`.trim(), 'aria-label': GAME_NAME }, word('logo-ink'), word('logo-fill'));
  holdForFont(el);
  return el;
}
