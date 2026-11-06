// world/gen/decor.ts: decor emission. The vocabulary itself is core/decor.ts (DECOR_KINDS); this module uses it and
// never redefines it (SCHEDULE.md). M0 emits buildings (backdrop + shadow casters) and street lamps on the side band
// for every area. TODO(WG): per-area decor recipes (DESIGN §18.4–18.7), gateway dressing.
import type { AreaId } from '../../core/ids';
import { round1cm } from '../../core/math';
import type { Sfc32 } from '../../core/rng';
import type { Decor } from '../../core/world';
import { DECOR_LIMITS } from '../../core/decor';

export { DECOR_KINDS, DECOR_LIMITS, isDecorKind, type DecorKind } from '../../core/decor';

/** Buildings both sides and street lamps on the sidewalk band, for [s0, s1). The sun is behind-left (DESIGN §18.3):
 *  the −x row casts across the street, so it gets shorter blocks with cross-street gaps that stripe the street. */
export function emitDecor(out: Decor[], s0: number, s1: number, rng: Sfc32, _area: AreaId): void {
  for (const side of [-1, 1] as const) {
    const sunSide = side < 0;
    let s = s0;
    while (s < s1) {
      const d = round1cm(sunSide ? rng.range(6, 12) : rng.range(8, 16));
      const h = round1cm(sunSide ? rng.range(6, 16) : rng.range(8, 22));
      out.push({ kind: 'building', s: round1cm(s), x: side * (DECOR_LIMITS.backdropMinX + 0.2), y: 0.15, rotY: 0, scale: 1,
        variant: rng.int(0, 7), castShadow: true,
        params: { w: round1cm(sunSide ? rng.range(5, 8) : rng.range(6, 10)), d: Math.max(1, Math.min(d, round1cm(s1 - s))), h } });
      s += d + round1cm(sunSide ? rng.range(8, 14) : rng.range(0, 3));
    }
    for (let s2 = Math.ceil(s0 / 14) * 14; s2 < s1; s2 += 14) {
      out.push({ kind: 'street_lamp', s: s2, x: side * 4.75, y: 0.15, rotY: 0, scale: 1, variant: 0, castShadow: true, params: { h: 5 } });
    }
  }
}
