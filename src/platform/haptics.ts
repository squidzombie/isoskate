// platform/haptics.ts: navigator.vibrate when supported and enabled (TECH §10.4, DESIGN §9 haptics rules). Every pulse
// is ≥ 15 ms and at most one pulse fires per 120 ms; a no-op where vibrate is missing (iOS web). Which events pulse at
// the Key / All levels is decided at the call sites (M4). A native bridge replaces this later with no call-site changes.
import type { Haptics } from '../core/platform';

export const HAPTIC_RULES = { minPulseMs: 15, minGapMs: 120 } as const;

export function createHapticsImpl(now: () => number = () => performance.now()): Haptics {
  let last = -Infinity;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const can = !!nav && typeof nav.vibrate === 'function';
  const h: Haptics = {
    enabled: true,
    pulse(pattern: number | number[]) {
      if (!h.enabled || !can) return;
      const t = now();
      if (t - last < HAPTIC_RULES.minGapMs) return;
      last = t;
      // Odd entries of a pattern are pauses; only the pulses get the 15 ms floor.
      const p = Array.isArray(pattern) ? pattern.map((v, i) => (i % 2 === 0 ? Math.max(HAPTIC_RULES.minPulseMs, v) : Math.max(0, v)))
        : Math.max(HAPTIC_RULES.minPulseMs, pattern);
      try { nav!.vibrate(p); } catch { /* blocked (no user activation yet, or a policy): ignored */ }
    },
  };
  return h;
}
