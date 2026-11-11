// platform/visibility.ts: auto-pause triggers (TECH §10.2): visibilitychange (hidden), pagehide and blur.
export type HideReason = 'hidden' | 'pagehide' | 'blur';

export function onHide(f: (reason: HideReason) => void): () => void {
  const vis = () => { if (document.visibilityState === 'hidden') f('hidden'); };
  const ph = () => f('pagehide');
  const bl = () => f('blur');
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('pagehide', ph);
  window.addEventListener('blur', bl);
  return () => {
    document.removeEventListener('visibilitychange', vis);
    window.removeEventListener('pagehide', ph);
    window.removeEventListener('blur', bl);
  };
}

export function onShow(f: () => void): () => void {
  const vis = () => { if (document.visibilityState === 'visible') f(); };
  document.addEventListener('visibilitychange', vis);
  return () => document.removeEventListener('visibilitychange', vis);
}
