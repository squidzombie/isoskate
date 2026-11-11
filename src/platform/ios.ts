// platform/ios.ts: mobile hygiene (TECH §10.1, DESIGN §4.5). touch-action:none is set in CSS on #play only; this adds
// the non-passive touchmove preventDefault fallback and the long-press context-menu blocker on #play ONLY (so the
// Shop, Locker and Trick Book still scroll), and blocks pinch (gesturestart) and double-tap zoom page-wide.
export function installTouchHygiene(play: HTMLElement): () => void {
  const block = (e: Event) => { if (e.cancelable) e.preventDefault(); };
  const opts = { passive: false } as AddEventListenerOptions;
  play.addEventListener('touchmove', block, opts);
  play.addEventListener('contextmenu', block, opts);
  document.addEventListener('gesturestart', block, opts);
  document.addEventListener('dblclick', block, opts);
  return () => {
    play.removeEventListener('touchmove', block);
    play.removeEventListener('contextmenu', block);
    document.removeEventListener('gesturestart', block);
    document.removeEventListener('dblclick', block);
  };
}

/** Run start: blur any focused button so Space can't re-click it (TECH §7.3). */
export function blurActive(): void {
  const a = typeof document !== 'undefined' ? document.activeElement : null;
  if (a && typeof (a as HTMLElement).blur === 'function') (a as HTMLElement).blur();
}

/** The Android browser (not installed, not iOS): the first TAP TO ROLL may go fullscreen (TECH §10.2). Feature-detected;
 *  failures are ignored. Returns true when a request was made. Wired by INT in M4 (docs/core-requests.md). */
export function maybeFullscreen(doc: Document = document, nav: Navigator = navigator): boolean {
  const ua = nav.userAgent || '';
  const standalone = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  const el = doc.documentElement as HTMLElement & { requestFullscreen?: (o?: FullscreenOptions) => Promise<void> };
  if (!/Android/i.test(ua) || /iPhone|iPad|iPod/i.test(ua) || standalone || doc.fullscreenElement || typeof el.requestFullscreen !== 'function') return false;
  try { void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined); } catch { return false; }
  return true;
}
