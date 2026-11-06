// platform/: browser and device glue (INT; monetization.ts is MU). Public surface (TECH §4.13).
import type { Haptics, MonetizationProvider } from '../core/platform';
import { createHapticsImpl } from './haptics';
import { createMonetizationImpl } from './monetization';

export function createMonetization(flags: { fakeAds: boolean }): MonetizationProvider {
  return createMonetizationImpl(flags);
}

export function createHaptics(): Haptics {
  return createHapticsImpl();
}

export { readFlags, isTouchDevice, type Flags } from './env';
export { installTouchHygiene, blurActive } from './ios';
export { onHide, onShow, type HideReason } from './visibility';
export { createBackGuard, type BackGuard } from './history';
export { checkCompat, supportsInert } from './compat';
export { createWakeLock } from './wake';
export { registerServiceWorker } from './pwa';
export { drawIcon } from './icon';
export { NullProvider } from './monetization';
