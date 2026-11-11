// gfx/canvas.ts: canvas sizing and the live Viewport (TECH §8.1). Layout is read only here, on resize.
import type { Viewport } from '../core/view';

/** Reads the current viewport: CSS size, DPR, aspect, safe areas (from #safe-probe, which carries
 *  env(safe-area-inset-*) as padding) and pointer coarseness. */
export function readViewport(dpr: number): Viewport {
  const wCss = Math.max(1, window.innerWidth);
  const hCss = Math.max(1, window.innerHeight);
  let safeTop = 0, safeBottom = 0;
  const probe = document.getElementById('safe-probe');
  if (probe) {
    const cs = getComputedStyle(probe);
    safeTop = parseFloat(cs.paddingTop) || 0;
    safeBottom = parseFloat(cs.paddingBottom) || 0;
  }
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return { wCss, hCss, dpr, aspect: wCss / hCss, safeTop, safeBottom, coarse };
}

/** Calls `f` after viewport changes settle (visualViewport + window resize, debounced 100 ms). */
export function onViewportChange(f: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; f(); }, 100); };
  window.addEventListener('resize', fire);
  window.visualViewport?.addEventListener('resize', fire);
  window.addEventListener('orientationchange', fire);
  return () => {
    window.removeEventListener('resize', fire);
    window.visualViewport?.removeEventListener('resize', fire);
    window.removeEventListener('orientationchange', fire);
    if (timer) clearTimeout(timer);
  };
}
