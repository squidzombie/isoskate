// platform/pwa.ts: service worker registration and the update toast (TECH §10.6). Arrives in M4 (INT).
export function registerServiceWorker(_opts: { nosw: boolean; onUpdate: () => void }): void {
  // TODO(M4): register dist/sw.js on https:/localhost, never in an iframe, single mode or with ?nosw=1.
}
