// ui/overlay.ts: the lo-fi overlay in #lofi (DESIGN §18.9; DOM, pointer-events:none).
//   Grain: a 128² tile baked once to a canvas at boot, shown at plain alpha 0.05 (no blend modes: expensive on mobile
//   GPUs), moved by transform at 8 fps. Off on the low tier; static with reduced motion.
//   Vignette: radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(43,33,64,.35)).
//   Neon only: 2 px scanlines at 4% opacity.
//   "Reduce effects" removes the whole overlay.
import { h } from './h';
import { LOFI } from './ui.config';

export { LOFI };

export interface LofiState { effects: boolean; reducedMotion: boolean; tier: 'low' | 'med' | 'high'; neon: boolean; visible: boolean }
export interface Lofi { set(p: Partial<LofiState>): void; readonly state: Readonly<LofiState> }

/** Bakes the grain tile: deterministic value noise in ink/paper, as a data URL. */
export function bakeGrain(size: number = LOFI.tile): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    if (!x) return null;
    const img = x.createImageData(size, size);
    let s = 0x2b2140;
    for (let i = 0; i < img.data.length; i += 4) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const v = (s >>> 0) / 4294967296;
      const light = v > 0.5;
      img.data[i] = light ? 255 : 43; img.data[i + 1] = light ? 244 : 33; img.data[i + 2] = light ? 227 : 64;
      img.data[i + 3] = Math.round(Math.abs(v - 0.5) * 2 * 255);
    }
    x.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  } catch { return null; }
}

export function createLofi(el: HTMLElement | null): Lofi {
  const state: LofiState = { effects: true, reducedMotion: false, tier: 'med', neon: false, visible: true };
  if (!el) return { set(p) { Object.assign(state, p); }, state };
  const grain = h('div', { class: 'lofi-grain' });
  const vignette = h('div', { class: 'lofi-vignette' });
  const scan = h('div', { class: 'lofi-scan' });
  el.replaceChildren(grain, vignette, scan);
  const url = bakeGrain();
  if (url) grain.style.backgroundImage = `url(${url})`;
  let timer: ReturnType<typeof setInterval> | null = null;
  let seed = 1;
  const jitter = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const dx = seed % LOFI.tile, dy = (seed >>> 8) % LOFI.tile;
    grain.style.transform = `translate3d(${-dx}px, ${-dy}px, 0)`;
  };
  const reduced = () => state.reducedMotion || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const apply = () => {
    const on = state.effects;
    el.classList.toggle('on', on);
    const grainOn = on && state.tier !== 'low' && !!url;
    grain.style.display = grainOn ? '' : 'none';
    scan.style.display = on && state.neon ? '' : 'none';
    const move = grainOn && !reduced() && state.visible;
    if (move && !timer) timer = setInterval(jitter, 1000 / LOFI.fps);
    else if (!move && timer) { clearInterval(timer); timer = null; }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { state.visible = document.visibilityState !== 'hidden'; apply(); });
  apply();
  return { set(p) { Object.assign(state, p); apply(); }, state };
}
