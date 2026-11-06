// platform/ios.ts: mobile hygiene (TECH §10.1). touch-action:none is set in CSS on #play only; this adds the
// non-passive touchmove blocker on #play only (so other screens still scroll) and blocks pinch gestures.
export function installTouchHygiene(play: HTMLElement): () => void {
  const block = (e: Event) => { if (e.cancelable) e.preventDefault(); };
  play.addEventListener('touchmove', block, { passive: false });
  document.addEventListener('gesturestart', block, { passive: false } as AddEventListenerOptions);
  document.addEventListener('dblclick', block, { passive: false });
  return () => {
    play.removeEventListener('touchmove', block);
    document.removeEventListener('gesturestart', block);
    document.removeEventListener('dblclick', block);
  };
}

/** Run start: blur any focused button so Space can't re-click it (TECH §7.3). */
export function blurActive(): void {
  const a = document.activeElement;
  if (a instanceof HTMLElement) a.blur();
}
