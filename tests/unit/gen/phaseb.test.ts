// Phase B (theme T8, THEME §3.4, DESIGN §10.4 Phase B note): cars as the main blocker. Measured on the generated
// street (24 seeds × 3.2 km): the car share of tall blockers per area, a car early in every Downtown run, the
// parked rows' rules (one side, an empty bay apart, all one way), and every van's bay and loading entrance.
import { describe, expect, it } from 'vitest';
import type { AreaId } from '../../../src/core/ids';
import { isVehicle, propSkin } from '../../../src/core/skins';
import { tAt } from '../../../src/core/tuning';
import type { Decor, Obstacle } from '../../../src/core/world';
import { createWorldGen, createWorldQuery, Generator } from '../../../src/world/gen';
import { rowGap } from '../../../src/world/gen/props/shared';

const SEEDS = Array.from({ length: 24 }, (_, i) => (i + 1) * 7919), S_END = 3200;
const TARGET: Record<AreaId, number> = { downtown: 0.35, suburbs: 0.35, docks: 0.2, neon: 0.15 };
const PARKED = new Set(['DT_PARKED_ROW', 'SB_DRIVEWAY_ROW', 'IN_LOADING_ROW', 'NE_TAXI_RANK']);
const isCar = (o: Obstacle) => { const k = propSkin(o.kind, o.area, o.id, o.variant, o.hgt); return isVehicle(k.body) && k.body !== 'sweeper'; };

interface Run { obs: readonly Obstacle[]; decor: Decor[]; gen: Generator }
const runs: Run[] = SEEDS.map((seed) => {
  const gen = createWorldGen({ seed, mode: 'normal' }) as Generator;
  gen.ensure(S_END + 200);
  const decor: Decor[] = [];
  for (let i = 0; i * 32 < S_END; i++) decor.push(...gen.chunk(i).decor);
  return { gen, obs: createWorldQuery(gen).obstacles(0, S_END), decor };
});

describe('Phase B: cars as the main blocker (theme T8)', () => {
  it('car share of tall blockers per area meets THEME §3.4 (DT/SB ≥ 35 %, IN ≥ 20 %, NE ≥ 15 %)', () => {
    const tall: Record<string, number> = {}, cars: Record<string, number> = {};
    for (const { obs } of runs) for (const o of obs) {
      const b = o.solids[0];
      if (!b || !b.tall || b.top !== 'crash') continue;
      tall[o.area] = (tall[o.area] ?? 0) + 1;
      if (isCar(o)) cars[o.area] = (cars[o.area] ?? 0) + 1;
    }
    for (const a of Object.keys(TARGET) as AreaId[]) expect((cars[a] ?? 0) / tall[a]!, a).toBeGreaterThanOrEqual(TARGET[a]);
  }, 120_000);

  it('every Downtown run shows a car within 150 m after the Roll-out', () => {
    for (const { gen, obs } of runs) {
      const ro = gen.segments().find((sg) => sg.templateId === 'ROLLOUT')!;
      expect(obs.some((o) => o.area === 'downtown' && o.s >= ro.s1 && o.s < ro.s1 + 150 && isCar(o))).toBe(true);
    }
  });

  it('parked rows: one side, an empty bay apart (out of the 35° shadow), all facing the same way', () => {
    let rows = 0;
    for (const { gen, obs } of runs) for (const sg of gen.segments()) {
      if (!PARKED.has(sg.templateId) || sg.s1 > S_END) continue;
      const cars = obs.filter((o) => o.segment === sg.index && isCar(o)).sort((p, q) => p.s - q.s);
      if (cars.length < 2) continue;
      rows++;
      expect(new Set(cars.map((o) => Math.sign(o.x))).size, sg.templateId).toBe(1);
      expect(new Set(cars.map((o) => propSkin(o.kind, o.area, o.id, o.variant, o.hgt).nosedIn)).size, sg.templateId).toBe(1);
      for (let i = 1; i < cars.length; i++) {
        const gap = cars[i]!.s - (cars[i - 1]!.s + cars[i - 1]!.len);
        expect(gap, sg.templateId).toBeGreaterThanOrEqual(Math.max(0.6, rowGap(cars[i - 1]!.hgt) - 0.02));
      }
      for (const o of cars) expect(Math.abs(o.x), sg.templateId).toBeGreaterThan(1.0);       // never in the centre lanes
    }
    expect(rows).toBeGreaterThan(40);
  });

  it('every van_across noses into the corridor edge, over a perpendicular bay, its loading entrance beside it (not Neon)', () => {
    let vans = 0;
    for (const { obs, decor } of runs) for (const o of obs) {
      if (o.kind !== 'van_across' || o.s + o.len > S_END - 40) continue;
      vans++;
      const b = o.solids[0]!.box;
      expect(Math.max(Math.abs(b.x0), Math.abs(b.x1))).toBeCloseTo(4.5, 2);
      expect(o.area === 'docks' ? o.x < 0 : true, 'Docks vans are on the dock side').toBe(true);
      const near = decor.filter((d) => Math.abs(d.s - (o.s - 0.4)) < 0.2 || Math.abs(d.s - (o.s - 0.5)) < 0.2);
      expect(near.some((d) => d.kind === 'parking_bay' && d.params?.perp === 1)).toBe(true);
      const entrance = near.some((d) => d.kind === 'end_wall' && d.params?.style === 4 && Math.sign(d.x) === Math.sign(o.x));
      expect(entrance, `${o.area} @${tAt(o.s).toFixed(1)}`).toBe(o.area !== 'neon');
    }
    expect(vans).toBeGreaterThan(100);
  });
});
