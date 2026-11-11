// core/skins.ts: the RECLAIM skin chooser (DESIGN §10.3 skin notes, §18.5 vehicle builder, §9 crash nouns).
// Deterministic, every kind × area has a plain noun, the shares and dressing flags follow the spec.
import { describe, expect, it } from 'vitest';
import { DECOR_BRANDS } from '../../../src/core/decor';
import { AREA_ORDER, type AreaId, type PropKind } from '../../../src/core/ids';
import {
  CAR_PAINTS, Dress, MOVER_KINDS, SAPLING_KINDS, WEAR_MASK, isVehicle, newSkin, propSkin, type PropSkin,
} from '../../../src/core/skins';
import { ALL_PROP_KINDS } from '../render/fixtures';

const N = 4000;
const many = (kind: PropKind, area: AreaId, h = 1.4): PropSkin[] => Array.from({ length: N }, (_, i) => propSkin(kind, area, i + 1, i % 3, h));
const share = (xs: PropSkin[], f: (s: PropSkin) => boolean) => xs.filter(f).length / xs.length;
/** DESIGN §9: banned in all player-facing text (the crash noun is player-facing). Plus §3: nouns are plain. */
const BANNED = /zombie|apocalyp|outbreak|infected|quarantine|evacuat|survivor|\blast\b|remains|abandon|nature is healing|overgrown|mossy|dusklane/i;

describe('propSkin', () => {
  it('is deterministic and writes into `out` without allocating', () => {
    const out = newSkin();
    for (const kind of ALL_PROP_KINDS) for (const area of AREA_ORDER) for (let id = 1; id < 40; id++) {
      const a = propSkin(kind, area, id, id % 3, 1.5);
      const b = propSkin(kind, area, id, id % 3, 1.5, out);
      expect(b).toBe(out);
      expect(b).toEqual(a);
    }
  });

  it('gives every kind in every area a plain, non-empty crash noun', () => {
    for (const kind of ALL_PROP_KINDS) for (const area of AREA_ORDER) for (let id = 1; id < 60; id++) {
      const s = propSkin(kind, area, id, 0, 1.5);
      expect(s.noun.length, `${kind}/${area}`).toBeGreaterThan(1);
      expect(s.noun, `${kind}/${area}`).not.toMatch(BANNED);
      expect(s.noun).not.toContain('_');
      expect(s.plural).toBe(/s$/.test(s.noun) && s.noun !== 'bus');
    }
  });

  it('names the full-width hazards per area (DESIGN §9: barrier / log / pipe / holo gate; gap / ditch / gap / trench)', () => {
    const bar = AREA_ORDER.map((a) => propSkin('barrier_low', a, 7, 0, 0.5));
    expect(bar.map((s) => s.noun)).toEqual(['barrier', 'log', 'pipe', 'holo gate']);
    expect(bar.map((s) => s.body)).toEqual(['barrier_board', 'log', 'pipe', 'holo_gate']);
    expect(propSkin('holo_gate', 'neon', 3, 1, 0.5).noun).toBe('holo gate');
    expect(AREA_ORDER.map((a) => propSkin('trench', a, 7, 0, 0).noun)).toEqual(['gap', 'ditch', 'gap', 'trench']);
  });

  it('covers the §9 crash lines: van, bin, truck, vending machine, barrier, log, holo gate', () => {
    const nouns = new Set<string>();
    for (const kind of ALL_PROP_KINDS) for (const area of AREA_ORDER) for (let id = 1; id < 200; id++) nouns.add(propSkin(kind, area, id, 0, 1.5).noun);
    for (const n of ['van', 'bin', 'truck', 'vending machine', 'barrier', 'log', 'holo gate', 'car', 'pickup', 'gap', 'ditch']) expect(nouns.has(n), n).toBe(true);
  });

  it('parks cars: sedan / estate / pickup (+ SUV at h ≥ 1.5), six paints, 30% nosed in, a cat on 1 in 8 sedans and estates', () => {
    const low = many('parked_car', 'downtown', 1.4), high = many('parked_car', 'suburbs', 1.5);
    expect(low.every((s) => ['sedan', 'estate', 'pickup'].includes(s.body))).toBe(true);
    expect(share(high, (s) => s.body === 'suv')).toBeGreaterThan(0.18);
    for (const s of [...low, ...high]) {
      expect(isVehicle(s.body)).toBe(true);
      expect(s.noun).toBe(s.body === 'pickup' ? 'pickup' : 'car');
      expect(CAR_PAINTS).toContain(s.paint);
      if (s.dress & Dress.Cat) expect(['sedan', 'estate']).toContain(s.body);
      expect(s.dress & Dress.Clean).toBe(0);
    }
    for (const p of CAR_PAINTS) expect(share(low, (s) => s.paint === p)).toBeGreaterThan(0.8 / CAR_PAINTS.length);
    expect(share(low, (s) => s.nosedIn)).toBeCloseTo(0.3, 1);
    const sedans = low.filter((s) => s.body === 'sedan' || s.body === 'estate');
    expect(share(sedans, (s) => (s.dress & Dress.Cat) !== 0)).toBeCloseTo(1 / 8, 1);
  });

  it('keeps cats out of Neon (taxis) and off vans, trucks and movers', () => {
    for (const kind of ALL_PROP_KINDS) for (const area of AREA_ORDER) for (let id = 1; id < 300; id++) {
      const s = propSkin(kind, area, id, id % 3, 1.5);
      if (s.dress & Dress.Cat) { expect(area).not.toBe('neon'); expect(['sedan', 'estate']).toContain(s.body); expect(kind).toBe('parked_car'); }
    }
    expect(many('parked_car', 'neon').every((s) => s.body === 'taxi' && s.paint === null && !(s.dress & Dress.Cat))).toBe(true);
  });

  it('splits Docks containers 60 / 25 / 15 into containers, Brindle Freight trucks and the Saltwick Shipping shuttle', () => {
    const xs = many('container', 'docks', 2.6);
    expect(share(xs, (s) => s.body === 'container')).toBeCloseTo(0.6, 1);
    expect(share(xs, (s) => s.body === 'box_truck')).toBeCloseTo(0.25, 1);
    expect(share(xs, (s) => s.body === 'shuttle_bus')).toBeCloseTo(0.15, 1);
    for (const s of xs) {
      if (s.body === 'box_truck') { expect(s.noun).toBe('truck'); expect(DECOR_BRANDS.docks[s.livery]).toBe('Brindle Freight'); }
      if (s.body === 'shuttle_bus') { expect(s.noun).toBe('bus'); expect(DECOR_BRANDS.docks[s.livery]).toBe('Saltwick Shipping'); }
      if (s.body === 'container') { expect(s.noun).toBe('container'); expect(s.livery).toBe(-1); }
    }
  });

  it('gives vans a panel / camper split with a valid DECOR_BRANDS livery on panel vans', () => {
    const xs = many('parked_van', 'suburbs', 1.9);
    expect(share(xs, (s) => s.body === 'panel_van')).toBeCloseTo(0.55, 1);
    for (const s of xs) {
      expect(s.noun).toBe('van');
      if (s.body === 'panel_van') expect(DECOR_BRANDS.suburbs[s.livery]).toBeDefined(); else expect(s.livery).toBe(-1);
    }
    for (let id = 1; id < 100; id++) expect(DECOR_BRANDS.suburbs[propSkin('bus_shelter', 'suburbs', id, 0, 2.4).livery]).toBeDefined();
  });

  it('keeps helper machines clean: no moss, rust, plants or animals, slate paint on the car movers (rule 9)', () => {
    for (const kind of MOVER_KINDS) for (const area of AREA_ORDER) for (let id = 1; id < 200; id++) {
      const s = propSkin(kind, area, id, id % 3, 1.4);
      expect(s.dress & Dress.Clean, kind).toBeTruthy();
      expect(s.dress & WEAR_MASK, kind).toBe(0);
    }
    expect(propSkin('crosswalk_car', 'downtown', 1, 0, 1.4)).toMatchObject({ body: 'sweeper', paint: 'slate', noun: 'street sweeper' });
    expect(propSkin('backout_car', 'suburbs', 1, 0, 1.4)).toMatchObject({ body: 'sedan', paint: 'slate', noun: 'reversing car', nosedIn: false });
  });

  it('rolls the filler sapling 1 in 4 on lidded column fillers only, never in Neon (rule 2 exception)', () => {
    for (const kind of ALL_PROP_KINDS) for (const area of AREA_ORDER) {
      const xs = many(kind, area, 1.15);
      const sap = share(xs, (s) => (s.dress & Dress.Sapling) !== 0);
      if (SAPLING_KINDS.has(kind) && area !== 'neon') expect(sap, `${kind}/${area}`).toBeCloseTo(0.25, 1);
      else expect(sap, `${kind}/${area}`).toBe(0);
    }
  });

  it('puts flowers on top faces of planters only, crown caps on the kiosk and bus shelter only, roses on pickets only', () => {
    for (const kind of ALL_PROP_KINDS) for (const area of AREA_ORDER) for (let id = 1; id < 50; id++) {
      const d = propSkin(kind, area, id, 0, 1.5).dress;
      if (d & Dress.Flowers) expect(kind).toBe('planter');
      if (d & Dress.Crown) expect(['kiosk', 'bus_shelter']).toContain(kind);
      if (d & Dress.Roses) expect(kind).toBe('picket_fence');
    }
  });

  it('splits bike racks into bikes and carts, wheelie bins into a bin pair and a dumpster', () => {
    const racks = many('bike_rack', 'downtown', 1.15), bins = many('wheelie_bins', 'suburbs', 1.2);
    expect(share(racks, (s) => s.body === 'carts')).toBeCloseTo(0.5, 1);
    expect(share(bins, (s) => s.body === 'dumpster')).toBeCloseTo(0.5, 1);
    for (const s of racks) expect(s.noun).toBe(s.body === 'carts' ? 'carts' : 'bike rack');
    for (const s of bins) expect(s.noun).toBe(s.body === 'dumpster' ? 'dumpster' : 'bins');
  });
});
