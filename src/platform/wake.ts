// platform/wake.ts: screen Wake Lock during runs (TECH §10.2), feature-detected; failures are ignored.
interface WakeLockSentinelLike { release(): Promise<void>; released?: boolean }

export function createWakeLock(): { request(): void; release(): void } {
  let sentinel: WakeLockSentinelLike | null = null;
  let want = false;
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } };
  return {
    request() {
      want = true;
      if (!nav.wakeLock || (sentinel && !sentinel.released)) return;
      nav.wakeLock.request('screen').then((s) => { if (want) sentinel = s; else void s.release(); }).catch(() => undefined);
    },
    release() {
      want = false;
      const s = sentinel; sentinel = null;
      if (s) void s.release().catch(() => undefined);
    },
  };
}
