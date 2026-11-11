// platform/wake.ts: screen Wake Lock during runs (TECH §10.2, DESIGN §17.3), feature-detected; failures are ignored.
// Requested at run start and on resume, released on pause, crash and results. The browser drops the lock when the page
// is hidden; a released sentinel is forgotten so the next request() re-acquires it.
interface WakeLockSentinelLike { release(): Promise<void>; released?: boolean; addEventListener?(t: 'release', f: () => void): void }
interface WakeLockLike { request(type: 'screen'): Promise<WakeLockSentinelLike> }

export function createWakeLock(nav: { wakeLock?: WakeLockLike } | undefined =
  typeof navigator !== 'undefined' ? (navigator as unknown as { wakeLock?: WakeLockLike }) : undefined): { request(): void; release(): void; readonly held: boolean } {
  let sentinel: WakeLockSentinelLike | null = null;
  let want = false, pending = false;
  return {
    get held() { return !!sentinel && !sentinel.released; },
    request() {
      want = true;
      if (!nav?.wakeLock || pending || (sentinel && !sentinel.released)) return;
      pending = true;
      nav.wakeLock.request('screen').then((s) => {
        pending = false;
        if (!want) { void s.release().catch(() => undefined); return; }
        sentinel = s;
        s.addEventListener?.('release', () => { if (sentinel === s) sentinel = null; });
      }).catch(() => { pending = false; });
    },
    release() {
      want = false;
      const s = sentinel; sentinel = null;
      if (s && !s.released) void s.release().catch(() => undefined);
    },
  };
}
