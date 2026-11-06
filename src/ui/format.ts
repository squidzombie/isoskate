// ui/format.ts: number and name formatting shared by the HUD and the screens (pure, unit-tested).
import type { AreaId, TrickId } from '../core/ids';
import type { CrashCause, PropKind } from '../core/ids';
import { TRICKS } from '../tricks';

/** Score: thousands separators, abbreviated from 1M ("1.2M", "12M"). */
export function fmtScore(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  return v.toLocaleString('en-US');
}
/** Compact count for tight HUD slots: "9,999", then "12.3k", "123k", "1.2M". */
export function fmtShort(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v < 10000) return v.toLocaleString('en-US');
  if (v < 1e6) return `${(v / 1000).toFixed(v < 1e5 ? 1 : 0).replace(/\.0$/, '')}k`;
  return fmtScore(v);
}

const NAMES = new Map<string, string>([['ollie', 'Ollie']]);
for (const list of [TRICKS.flips, TRICKS.spins, TRICKS.grinds, TRICKS.manuals, TRICKS.grabs]) for (const d of list) NAMES.set(d.id, d.name);
/** Display name of a trick ("Kickflip", "50-50", "FS 180"); unknown ids are split from camelCase. */
export function trickName(id: TrickId | string): string {
  return NAMES.get(id) ?? id.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

const AREA_NAMES: Readonly<Record<AreaId, string>> = { downtown: 'Downtown', suburbs: 'Suburbs', docks: 'Docks', neon: 'Neon City' };
export const areaName = (a: AreaId) => AREA_NAMES[a];

const KIND_NAMES: Partial<Record<PropKind, string>> = { trash_can: 'bin', barrier_low: 'barrier', parked_car: 'car', granite_ledge: 'ledge',
  wheelie_bins: 'bin', crosswalk_car: 'car', backout_car: 'car', parked_van: 'van', drum_cluster: 'drum', delivery_robot: 'robot' };
export const kindName = (k: PropKind | null) => (k ? KIND_NAMES[k] ?? k.replace(/_/g, ' ') : 'something');

/** One-line crash cause (DESIGN §9): "Clipped a bin", "Flip 62% done — flick earlier", "Landed on a car". */
export function crashCause(e: { cause: CrashCause; kind: PropKind | null; flipProgress: number; spinProgress: number }): string {
  const kind = kindName(e.kind);
  if (e.cause === 'badLanding' && (e.flipProgress > 0 || e.spinProgress > 0)) {
    const flip = e.flipProgress > 0 && (e.spinProgress <= 0 || e.flipProgress <= e.spinProgress);
    const p = Math.round(100 * (flip ? e.flipProgress : e.spinProgress));
    return `${flip ? 'Flip' : 'Spin'} ${p}% done — flick earlier`;
  }
  if (e.cause === 'badLanding') return `Landed on a ${kind}`;
  if (e.cause === 'fall') return 'Fell in the trench';
  if (e.cause === 'splash') return 'Splashed into the water';
  return `Clipped a ${kind}`;
}
