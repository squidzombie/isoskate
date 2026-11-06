import { describe, expect, it } from 'vitest';
import { AREA_ORDER } from '../../../src/core/ids';
import { DECOR_BRANDS, DECOR_KINDS, DECOR_LIMITS, isDecorKind, NEON_SIGN_WORDS } from '../../../src/core/decor';

describe('DECOR_KINDS vocabulary', () => {
  const kinds = Object.entries(DECOR_KINDS);
  it('documents every kind and every param', () => {
    expect(kinds.length).toBeGreaterThan(40);
    for (const [k, def] of kinds) {
      expect(k).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(def.doc.length, k).toBeGreaterThan(8);
      expect(def.areas.length, k).toBeGreaterThan(0);
      for (const [p, doc] of Object.entries(def.params)) expect((doc as string).length, `${k}.${p}`).toBeGreaterThan(2);
    }
  });
  it('covers all four areas with identity kinds', () => {
    for (const a of AREA_ORDER) expect(kinds.filter(([, d]) => (d.areas as readonly string[]).includes(a)).length, a).toBeGreaterThan(10);
    for (const k of ['building', 'shadow_caster', 'lantern_string', 'blade_sign', 'billboard', 'holo_billboard', 'end_wall',
      'maglev_beam', 'puddle', 'tree', 'street_lamp', 'vending_machine', 'crane', 'container_stack', 'tower', 'house', 'warehouse'])
      expect(isDecorKind(k), k).toBe(true);
    expect(isDecorKind('toString')).toBe(false);
  });
  it('exposes placement limits, brands and the reviewed sign words', () => {
    expect(DECOR_LIMITS.overheadMinY).toBe(3.2);
    expect(DECOR_LIMITS.signInnerMinX).toBe(4.9);
    for (const a of AREA_ORDER) expect(DECOR_BRANDS[a].length).toBeGreaterThanOrEqual(4);
    expect(NEON_SIGN_WORDS).toHaveLength(10);
  });
});
