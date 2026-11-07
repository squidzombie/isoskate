// ui/format.ts: number and name formatting shared by the HUD and the screens (pure, unit-tested).
import type { AreaId, TrickId } from '../core/ids';
import type { CrashCause, PropKind } from '../core/ids';
import { newSkin, propSkin } from '../core/skins';
import type { Obstacle } from '../core/world';
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

/** Kinds whose drawn object varies by roll (core/skins propSkin): the generic noun when the obstacle is unknown. */
const GENERIC: Partial<Record<PropKind, readonly [noun: string, plural: boolean]>> = {
  parked_car: ['car', false], parked_van: ['van', false], container: ['container', false], wheelie_bins: ['bins', true],
  bike_rack: ['bike rack', false] };
const SKIN = newSkin();
/** The obstacle fields that pick its skin (the kits draw the same skin from the same fields). */
export type SkinRef = Pick<Obstacle, 'id' | 'variant' | 'hgt'>;
/** The plain crash noun of what was drawn (THEME §9; core/skins `propSkin`, shared with the kits): "van", "bins",
 *  "barrier" / "log" / "pipe" / "holo gate", "gap" / "ditch" / "trench". Pass the obstacle for the exact skin. */
export function kindNoun(k: PropKind | null, area: AreaId = 'downtown', ob?: SkinRef): { noun: string; plural: boolean } {
  if (!k) return { noun: 'something', plural: false };
  const g = ob ? undefined : GENERIC[k];
  if (g) return { noun: g[0], plural: g[1] };
  const s = propSkin(k, area, ob?.id ?? 0, ob?.variant ?? 0, ob?.hgt ?? 1.4, SKIN);
  return { noun: s.noun || k.replace(/_/g, ' '), plural: s.plural };
}
export const kindName = (k: PropKind | null, area?: AreaId, ob?: SkinRef) => kindNoun(k, area, ob).noun;
/** "a van", "an ibeam"; plurals take no article ("bins"). */
export const withArticle = (noun: string, plural = false) => (plural ? noun : `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`);

/** Low props you clear with an ollie (≤ 0.6 m, DESIGN §5.5); a slam into one teaches the ollie. */
const JUMP_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(['curb', 'flatbar', 'cone', 'barrier_low', 'trench', 'stairs', 'handrail',
  'hubba', 'incline', 'terrace', 'speed_hump', 'porch_steps', 'pallet_1', 'spool_lying', 'dock_lip', 'rail_track', 'neon_curb',
  'holo_gate']);
/** Low props with a grindable top: their end face is what you hit. */
const GRIND_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(['granite_ledge', 'bench', 'manual_pad', 'garden_wall', 'guard_rail']);

/** One-line crash cause that teaches (DESIGN §9; THEME §9): "Clipped a van — steer around it", "Hit the log — tap to
 *  ollie it", "Dropped into the gap — ollie it or take the plank", "Flip 62% done — flick earlier". The noun names what
 *  was drawn: pass the run's area and the obstacle (looked up by `obstacleId`) for its exact skin. */
export function crashCause(e: { cause: CrashCause; kind: PropKind | null; flipProgress: number; spinProgress: number },
  area: AreaId = 'downtown', ob?: SkinRef): string {
  const { noun, plural } = kindNoun(e.kind, area, ob);
  const it = plural ? 'them' : 'it';
  if (e.cause === 'badLanding' && (e.flipProgress > 0 || e.spinProgress > 0)) {
    const flip = e.flipProgress > 0 && (e.spinProgress <= 0 || e.flipProgress <= e.spinProgress);
    const p = Math.round(100 * (flip ? e.flipProgress : e.spinProgress));
    return `${flip ? 'Flip' : 'Spin'} ${p}% done — flick earlier`;
  }
  if (e.cause === 'badLanding') return e.kind ? `Landed on ${withArticle(noun, plural)}` : 'Bailed the landing';
  if (e.cause === 'fall') return `Dropped into the ${e.kind ? noun : kindName('trench', area)} — ollie it or take the plank`;
  if (e.cause === 'splash') return `Splashed into the ${e.kind === 'fountain' || (!e.kind && area === 'downtown') ? 'fountain' : area === 'docks' ? 'harbor' : 'water'}`;
  if (e.kind && JUMP_KINDS.has(e.kind)) return `Hit the ${noun} — tap to ollie ${it}`;
  if (e.kind && GRIND_KINDS.has(e.kind)) return `Hit the ${noun} end — ollie onto ${it}`;
  if (!e.kind) return 'Clipped something — steer around it';
  return `Clipped ${withArticle(noun, plural)} — steer around ${it}`;
}
