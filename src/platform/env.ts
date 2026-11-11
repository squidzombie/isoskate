// platform/env.ts: query flags, read once at boot (TECH §3).
import type { QualityTier } from '../core/ids';

export interface Flags {
  debug: boolean; seed: number | null; quality: QualityTier | null; fakeAds: boolean; bot: string | null;
  nosw: boolean; reset: boolean;
  /** Debug builds only: the run camera variant (world/render/camVariants.ts), e.g. ?debug=1&cam=E. */
  cam: string | null;
}

export function readFlags(search: string = typeof location !== 'undefined' ? location.search : ''): Flags {
  const q = new URLSearchParams(search);
  const seed = q.get('seed');
  const quality = q.get('quality');
  return {
    debug: q.get('debug') === '1' || import.meta.env.DEV,
    seed: seed !== null && /^\d+$/.test(seed) ? Number(seed) >>> 0 : null,
    quality: quality === 'low' || quality === 'med' || quality === 'high' ? quality : null,
    fakeAds: q.get('fakeads') === '1',
    bot: q.get('bot'),
    nosw: q.get('nosw') === '1',
    reset: q.get('reset') === '1',
    cam: q.get('cam'),
  };
}

export const isTouchDevice = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
