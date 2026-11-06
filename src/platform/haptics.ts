// platform/haptics.ts: navigator.vibrate when supported and enabled (TECH §10.4). Every pulse ≥ 15 ms and at most
// one per 120 ms. A native bridge replaces this later with no call-site changes.
import type { Haptics } from '../core/platform';

export function createHapticsImpl(): Haptics {
  let last = -Infinity;
  const can = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  return {
    enabled: true,
    pulse(pattern: number | number[]) {
      if (!this.enabled || !can) return;
      const now = performance.now();
      if (now - last < 120) return;
      last = now;
      const p = Array.isArray(pattern) ? pattern.map((v, i) => (i % 2 === 0 ? Math.max(15, v) : v)) : Math.max(15, pattern);
      try { navigator.vibrate(p); } catch { /* ignored */ }
    },
  };
}
