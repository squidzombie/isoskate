// The RECLAIM vehicle builder (kits/car.ts; DESIGN §18.5, THEME §3.3, the "where they stopped" render track). Every body
// in both facings, ink and Neon: the end the camera sees differs front vs rear (headlamps and grille vs taillights; Neon
// lenses with the rim between them vs the steady red rim), the cabin sits rearward so the roof alone shows the facing,
// the triangle budgets per body hold, nothing is cream or chrome in any paint or with flowers, the life budget holds per
// variant (flowers ≤ 4% of the top view, never in Neon), nothing opaque rises above the x-ray cap (glass and liveries
// included, van_across too), and the wheels stand on the highest ground under them. Node only (no WebGL).
import { describe, expect, it } from 'vitest';
import type { AreaId, PropKind } from '../../../src/core/ids';
import { CAR_PAINTS, Dress, propSkin, type VehicleBody } from '../../../src/core/skins';
import { CAMERA } from '../../../src/core/tuning';
import type { Obstacle } from '../../../src/core/world';
import { CABIN, CABIN_INSET, WHEEL_LIFT_MAX, drawVehicle, noseTowardCamera, vanAcrossKit, vehicleKit, type VehicleSpec } from '../../../src/world/render/kits/car';
import type { KitCtx } from '../../../src/world/render/kits/common';
import { BLOOM, DRESS, DRESSER, signatureLike } from '../../../src/world/render/kits/dress';
import { HAZARD, RECLAIM, contrastRatio, relLum } from '../../../src/world/render/palette';
import { GeoPool, type PooledGeo } from '../../../src/world/render/pools';
import { WARMUP_VEHICLES, warmupChunk } from '../../../src/world/render/warmup';
import { GeoWriter, Kit, srgbToLinear, type KitTargets } from '../../../src/world/render/writer';
import { AREAS, prop } from './fixtures';

type T = keyof KitTargets;
const TARGETS: readonly T[] = ['o', 'x', 'e', 'g', 'b'];
type Size = 'car' | 'van' | 'big';
/** Every body at its in-corridor box (len along s, wid, hgt) and its budget class (THEME §3.3: cars ≤ 700 triangles,
 *  vans ≤ 800, truck and bus ≤ 1,000; the sweeper counts as a van). */
const BODIES: readonly (readonly [VehicleBody, number, number, number, Size])[] = [
  ['sedan', 4.4, 1.8, 1.4, 'car'], ['estate', 4.4, 1.8, 1.4, 'car'], ['pickup', 4.4, 1.8, 1.4, 'car'], ['suv', 4.4, 1.8, 1.5, 'car'],
  ['taxi', 4.4, 1.8, 1.4, 'car'], ['kei_van', 4.6, 1.9, 1.9, 'van'], ['panel_van', 4.6, 1.9, 1.9, 'van'], ['camper', 4.6, 1.9, 1.9, 'van'],
  ['sweeper', 4.2, 1.8, 1.4, 'van'], ['box_truck', 6.1, 2.4, 2.6, 'big'], ['shuttle_bus', 6.1, 2.4, 2.6, 'big']];
const BUDGET: Readonly<Record<Size, number>> = { car: 700, van: 800, big: 1000 };
const FULL_DRESS = Dress.Moss | Dress.Rust | Dress.Ivy | Dress.Cat | Dress.Livery | BLOOM;

const lin = (hex: number) => [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)] as const;
const isCol = (g: PooledGeo, i: number, hex: number) => { const [r, gg, b] = lin(hex); return Math.abs(g.col[i * 3]! - r) < 1e-5 && Math.abs(g.col[i * 3 + 1]! - gg) < 1e-5 && Math.abs(g.col[i * 3 + 2]! - b) < 1e-5; };
const toHex = (g: PooledGeo, i: number) => {
  const c = (v: number) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  return (c(g.col[i * 3]!) << 16) | (c(g.col[i * 3 + 1]!) << 8) | c(g.col[i * 3 + 2]!);
};
function targets(): { K: Kit; w: KitTargets } {
  const w = Object.fromEntries(TARGETS.map((t) => [t, new GeoWriter()])) as unknown as KitTargets;
  for (const t of TARGETS) w[t].begin(new GeoPool(64).acquire());
  return { K: new Kit(w), w };
}
interface Opts { nosedIn?: boolean; inverted?: boolean; dress?: number; cap?: boolean; paint?: number; kind?: PropKind; area?: AreaId }
/** Draws one hazard vehicle of `body` at its box (s 0..L, centred on x 0) with the given skin bits through DRESSER. */
function draw(body: VehicleBody, L: number, W: number, H: number, o: Opts = {}) {
  const { K, w } = targets();
  const ob = prop({ kind: o.kind ?? 'parked_car', area: o.area ?? (o.inverted ? 'neon' : 'downtown'), s: 0, x: 0, len: L, wid: W, hgt: H });
  DRESSER.begin(ob);
  DRESSER.skin.dress = o.dress ?? 0;
  if (o.cap) K.capY = CAMERA.xrayCapY;
  const box = vanBox(body);
  const v: VehicleSpec = {
    body, x0: -W / 2, x1: W / 2, s0: 0, s1: L, y: 0, h: H, hazard: true, nosedIn: !!o.nosedIn,
    paint: o.inverted ? 0x8a80c0 : o.paint ?? RECLAIM.carPaint.teal, side: o.inverted ? RECLAIM.neonCarBody[0]! : 0x1c1430,
    stripe: o.inverted ? -1 : HAZARD.downtown.accent, inverted: !!o.inverted, rim: HAZARD.neon.rim, glow: o.inverted ? 2.2 : 0,
    livery: box && (o.dress ?? 0) & Dress.Livery ? 'b:docks:0' : null, cat: o.inverted ? null : 'tabby',
  };
  drawVehicle(K, v);
  const life = DRESSER.lifeArea, sil = DRESSER.silhouetteArea(), refused = DRESSER.refused;
  DRESSER.end();
  let tris = 0;
  for (const t of TARGETS) tris += w[t].tris;
  const g = Object.fromEntries(TARGETS.map((t) => [t, w[t].end()])) as Record<T, PooledGeo>;
  return { g, tris, life, sil, refused };
}
const vanBox = (b: VehicleBody) => ['kei_van', 'panel_van', 'camper', 'box_truck', 'shuttle_bus'].includes(b);
/** Colours on faces turned to the camera (normal toward −s) within `depth` m of the box's camera end (s ≤ depth). */
function cameraEnd(g: PooledGeo, depth = 0.12): number[] {
  const out: number[] = [];
  for (let i = 0; i < g.count; i++) if (g.nrm[i * 3 + 2]! > 0.9 && -g.pos[i * 3 + 2]! <= depth) out.push(toHex(g, i));
  return out;
}

describe('vehicle builder: every body, both facings, ink and Neon', () => {
  it('stays inside the per-body triangle budget with every dressing on (cars ≤ 700, vans ≤ 800, truck and bus ≤ 1,000)', () => {
    for (const [body, L, W, H, size] of BODIES) for (const nosedIn of [false, true]) for (const inverted of [false, true]) {
      const r = draw(body, L, W, H, { nosedIn, inverted, dress: FULL_DRESS, cap: true });
      expect(r.tris, `${body} ${nosedIn ? 'nose' : 'rear'}${inverted ? ' neon' : ''}`).toBeLessThanOrEqual(BUDGET[size]);
      expect(r.tris).toBeGreaterThan(200);
    }
  });

  it('the end facing the camera reads front (headlamps, grille) or rear (taillights) for every body', () => {
    for (const [body, L, W, H] of BODIES) {
      const front = cameraEnd(draw(body, L, W, H, { nosedIn: true }).g.o), rear = cameraEnd(draw(body, L, W, H).g.o);
      expect(front.includes(RECLAIM.headlamp), `${body} nosed in: headlamps`).toBe(true);
      expect(front.includes(RECLAIM.taillight), `${body} nosed in: no taillights`).toBe(false);
      expect(rear.includes(RECLAIM.taillight), `${body} rear: taillights`).toBe(true);
      expect(rear.includes(RECLAIM.headlamp), `${body} rear: no headlamps`).toBe(false);
    }
  });

  it('cars: the rear taillights wrap 0.05 m onto the top; the front lamps sit under the bonnet edge', () => {
    for (const [body, L, W, H, size] of BODIES) {
      if (size !== 'car') continue;
      const { g } = draw(body, L, W, H);
      let wrap = 0;
      for (let i = 0; i < g.o.count; i++) {
        if (!isCol(g.o, i, RECLAIM.taillight) || g.o.nrm[i * 3 + 1]! < 0.9) continue;
        const s = -g.o.pos[i * 3 + 2]!;
        expect(s, body).toBeLessThanOrEqual(0.09);
        wrap = Math.max(wrap, s);
      }
      expect(wrap, `${body}: taillight top`).toBeGreaterThanOrEqual(0.075);
    }
  });

  it('Neon: in front the rim breaks for dark lenses; across the rear a steady red rim; never time-varying', () => {
    for (const [body, L, W, H] of BODIES) {
      const nose = draw(body, L, W, H, { nosedIn: true, inverted: true }), rear = draw(body, L, W, H, { inverted: true });
      expect(cameraEnd(nose.g.o).includes(RECLAIM.headlamp), `${body}: no warm lamps in Neon`).toBe(false);
      expect(cameraEnd(nose.g.e).includes(HAZARD.neon.rim), `${body}: front rim`).toBe(true);
      expect(cameraEnd(nose.g.e).includes(RECLAIM.neonTail), `${body}: no red in front`).toBe(false);
      expect(cameraEnd(rear.g.e).includes(RECLAIM.neonTail), `${body}: red rim behind`).toBe(true);
      expect(cameraEnd(rear.g.o).includes(RECLAIM.taillight), `${body}: the rim is the taillight`).toBe(false);
      for (const r of [nose, rear]) for (let i = 0; i < r.g.e.count; i++) expect(r.g.e.fx[i * 4 + 3], body).toBe(0);
      // The front rim has a gap where each lamp sits (the lamp's centre line has no rim in front of it).
      let underLamp = 0;
      const lampX = -W / 2 + 0.07 + 0.1;
      for (let i = 0; i < nose.g.e.count; i++) {
        if (!isCol(nose.g.e, i, HAZARD.neon.rim) || -nose.g.e.pos[i * 3 + 2]! > 0.1) continue;
        if (Math.abs(nose.g.e.pos[i * 3]! - lampX) < 0.05) underLamp++;
      }
      expect(underLamp, `${body}: rim gap at the lamp`).toBe(0);
    }
  });

  it('the cabin sits rearward: a bonnet longer than the boot, a windscreen longer than the rear glass, the roof behind the middle', () => {
    for (const [b, [g0, r0, r1, g1]] of Object.entries(CABIN)) {
      expect(1 - g1, `${b}: bonnet vs boot`).toBeGreaterThan(g0 > 0.3 ? 0.18 : g0);
      expect(g1 - r1, `${b}: windscreen vs rear glass`).toBeGreaterThan(r0 - g0);
      if (b !== 'pickup') expect((r0 + r1) / 2, `${b}: roof centre`).toBeLessThanOrEqual(0.45);
      else expect(g0, 'pickup: the bed is the rear').toBeGreaterThanOrEqual(0.4);
    }
    expect(CABIN_INSET).toBeGreaterThanOrEqual(0.1); expect(CABIN_INSET).toBeLessThanOrEqual(0.12);
    // Rendered: the paint roof's centre lies behind the box middle, on the side away from the nose.
    for (const [body, L, W, H, size] of BODIES) {
      if (size !== 'car' || body === 'pickup') continue;
      for (const nosedIn of [false, true]) {
        const { g } = draw(body, L, W, H, { nosedIn });
        let top = -Infinity;
        for (const t of ['o', 'x'] as const) for (let i = 0; i < g[t].count; i++) if (isCol(g[t], i, RECLAIM.carPaint.teal) && g[t].nrm[i * 3 + 1]! > 0.9) top = Math.max(top, g[t].pos[i * 3 + 1]!);
        let sum = 0, n = 0;
        for (const t of ['o', 'x'] as const) for (let i = 0; i < g[t].count; i++) {
          if (!isCol(g[t], i, RECLAIM.carPaint.teal) || g[t].nrm[i * 3 + 1]! < 0.9 || Math.abs(g[t].pos[i * 3 + 1]! - top) > 1e-4) continue;
          sum += -g[t].pos[i * 3 + 2]!; n++;
        }
        const off = sum / n - L / 2;
        expect(nosedIn ? off : -off, `${body} ${nosedIn ? 'nose' : 'rear'}: roof toward the rear`).toBeGreaterThanOrEqual(0.05 * L);
      }
    }
  });

  it('no cream, near-white or chrome on any body in any paint, facing, look or dressing (rule 5)', () => {
    expect(signatureLike(RECLAIM.headlamp)).toBe(false);
    for (const [body, L, W, H] of BODIES) for (const paint of Object.values(RECLAIM.carPaint)) for (const nosedIn of [false, true]) {
      for (const inverted of paint === RECLAIM.carPaint.teal ? [false, true] : [false]) {
        const { g } = draw(body, L, W, H, { nosedIn, inverted, paint, dress: FULL_DRESS, cap: true });
        for (const t of TARGETS) for (let i = 0; i < g[t].count; i++) {
          const hex = toHex(g[t], i);
          if (signatureLike(hex)) expect.fail(`${body} ${paint.toString(16)}: ${hex.toString(16)} reads as the grind signature`);
        }
      }
    }
  });

  it('life accents ≤ 10% of the top view per variant; flowers ≤ 4% in pickup beds (never in Neon), below the rim', () => {
    for (const [body, L, W, H] of BODIES) for (const inverted of [false, true]) {
      const r = draw(body, L, W, H, { inverted, dress: FULL_DRESS, cap: true, kind: vanBox(body) ? 'parked_van' : 'parked_car' });
      expect(r.life / r.sil, body).toBeLessThanOrEqual(DRESS.lifeBudget);
      expect(r.refused, body).toBe(0);
    }
    for (const inverted of [false, true]) {
      const flowers = draw('pickup', 4.4, 1.8, 1.4, { inverted, dress: FULL_DRESS }), none = draw('pickup', 4.4, 1.8, 1.4, { inverted, dress: FULL_DRESS & ~BLOOM });
      const share = (flowers.life - none.life) / flowers.sil;
      if (inverted) expect(share, 'no flowers in Neon').toBe(0);
      else { expect(share).toBeGreaterThan(0.005); expect(share).toBeLessThanOrEqual(0.04); }
      // Every flower head stays below the bed rim (the belt) and inside the bed.
      const F = Object.values(RECLAIM.flowers), belt = 1.4 * 0.56;
      for (let i = 0; i < flowers.g.o.count; i++) {
        if (!F.some((c) => isCol(flowers.g.o, i, c))) continue;
        expect(flowers.g.o.pos[i * 3 + 1]!).toBeLessThan(belt);
        expect(-flowers.g.o.pos[i * 3 + 2]!).toBeLessThan(4.4 * CABIN.pickup[0]);
        expect(isCol(flowers.g.o, i, RECLAIM.flowers.poppy), 'no poppy in the corridor').toBe(false);
      }
    }
  });

  it('nothing opaque rises above the x-ray cap (glass and liveries are split there); a paint plate sits under it', () => {
    for (const [body, L, W, H] of BODIES) for (const nosedIn of [false, true]) {
      const { g } = draw(body, L, W, H, { nosedIn, dress: FULL_DRESS, cap: true, kind: vanBox(body) ? 'parked_van' : 'parked_car' });
      let xr = 0, plate = 0;
      for (let i = 0; i < g.o.count; i++) {
        expect(g.o.pos[i * 3 + 1]!, `${body}: opaque above the cap`).toBeLessThanOrEqual(CAMERA.xrayCapY + 1e-3);
        if (isCol(g.o, i, RECLAIM.carPaint.teal) && Math.abs(g.o.pos[i * 3 + 1]! - (CAMERA.xrayCapY - 0.004)) < 1e-3) plate++;
      }
      for (let i = 0; i < g.x.count; i++) if (g.x.pos[i * 3 + 1]! > CAMERA.xrayCapY) xr++;
      expect(xr, body).toBeGreaterThan(0);
      if (H > CAMERA.xrayCapY + 0.05) expect(plate, `${body}: cap plate`).toBeGreaterThan(0);
    }
  });
});

/** A minimal kit context: ground from `groundAt`, decals counted. */
function ctx(K: Kit, area: AreaId, groundAt: (s: number, x: number) => number): KitCtx {
  return { K, area, hz: HAZARD[area], s0: 0, s1: 32, groundAt, decal: () => {}, contacts: 0, edges: [], glowLeft: 40,
    areaAt: () => area, lookAt: () => area, surfaceAt: () => null, lantern: () => {} } as unknown as KitCtx;
}
function kitDraw(kind: PropKind, area: AreaId, s: number, x: number, len: number, wid: number, hgt: number, groundAt: (s: number, x: number) => number) {
  const { K, w } = targets();
  const ob: Obstacle = prop({ kind, area, s, x, len, wid, hgt });
  DRESSER.begin(ob);
  (kind === 'van_across' ? vanAcrossKit : vehicleKit)(ctx(K, area, groundAt), ob);
  DRESSER.end();
  const g = Object.fromEntries(TARGETS.map((t) => [t, w[t].end()])) as Record<T, PooledGeo>;
  let lo = Infinity, hi = -Infinity;
  for (const t of ['o', 'x'] as const) for (let i = 0; i < g[t].count; i++) { lo = Math.min(lo, g[t].pos[i * 3 + 1]!); hi = Math.max(hi, g[t].pos[i * 3 + 1]!); }
  return { g, lo, hi, box: ob.solids[0]!.box };
}

describe('vehicle kits in the street', () => {
  const sidewalk = (s: number, x: number) => (Math.abs(x) >= 3 ? 0.15 : 0);
  it('wheels stand on the highest ground under them: half on a sidewalk, the whole car lifts; the roof stays at the box top', () => {
    for (const area of AREAS) for (const [kind, x, len, wid, hgt] of [['parked_car', 3.2, 4.4, 1.8, 1.4], ['parked_van', -3.3, 4.6, 1.9, 1.9], ['van_across', 2.3, 1.8, 4.4, 1.4]] as const) {
      const flat = kitDraw(kind, area, 6, x, len, wid, hgt, () => 0), kerb = kitDraw(kind, area, 6, x, len, wid, hgt, sidewalk);
      expect(flat.lo, `${area} ${kind} flat`).toBeLessThan(0.01);
      expect(kerb.lo, `${area} ${kind}: no tyre sinks into the kerb`).toBeGreaterThanOrEqual(0.15 - 0.035);
      expect(kerb.hi, `${area} ${kind}: the roof stays at the box top`).toBeLessThanOrEqual(flat.hi + 1e-3);
      expect(kerb.lo - flat.lo, `${area} ${kind}`).toBeLessThanOrEqual(WHEEL_LIFT_MAX + 1e-3);
    }
  });
  it('van_across: its band above the x-ray cap is screen-doored, with the paint plate under the cap', () => {
    for (const area of AREAS) {
      const { g } = kitDraw('van_across', area, 6, -2.3, 1.8, 4.4, 1.4, () => 0);
      for (let i = 0; i < g.o.count; i++) expect(g.o.pos[i * 3 + 1]!, area).toBeLessThanOrEqual(CAMERA.xrayCapY + 1e-3);
      let xr = 0;
      for (let i = 0; i < g.x.count; i++) if (g.x.pos[i * 3 + 1]! > CAMERA.xrayCapY + 0.05) xr++;
      expect(xr, area).toBeGreaterThan(20);
    }
  });
});

describe('facing, paints and the warm-up', () => {
  it('the oncoming lane shows its nose: traffic keeps right, Hoshimachi keeps left', () => {
    expect(noseTowardCamera('downtown', -1.2)).toBe(true); expect(noseTowardCamera('suburbs', 1.2)).toBe(false);
    expect(noseTowardCamera('neon', 1.2)).toBe(true); expect(noseTowardCamera('neon', -1.2)).toBe(false);
  });
  it('every paint the skin chooser rolls has a top and a roof moss; the cheerful four join the table', () => {
    for (const p of CAR_PAINTS) { expect(RECLAIM.carPaint[p], p).toBeTypeOf('number'); expect(RECLAIM.carRoofMoss[p], p).toBeTypeOf('number'); }
    for (const p of ['cobalt', 'coral', 'plum', 'ochre'] as const) expect(relLum(RECLAIM.carPaint[p]), p).toBeGreaterThanOrEqual(0.075);
    // Headlamps: a mid warm grey, clearly lighter than the ink bodies, far from the cream signature.
    const h = RECLAIM.headlamp, r = (h >> 16) & 255, gg = (h >> 8) & 255, b = h & 255;
    expect(r >= gg && gg >= b).toBe(true);
    expect(relLum(h)).toBeGreaterThanOrEqual(0.1); expect(relLum(h)).toBeLessThanOrEqual(0.2);
    expect(contrastRatio(h, 0x1c1430)).toBeGreaterThanOrEqual(2.5);
    expect(contrastRatio(h, 0xfff8ec)).toBeGreaterThanOrEqual(4);
    const t = RECLAIM.neonTail;
    expect((t >> 16) & 255).toBeGreaterThan(2 * ((t >> 8) & 255));
  });
  it('the warm-up builds every vehicle body the area can show, in every facing it can take', () => {
    for (const area of AREAS) {
      const reach = new Set<string>(), built = new Set<string>();
      for (const [kind, , , hgt] of WARMUP_VEHICLES) for (let id = 1; id < 1500; id++) for (let v = 0; v < 4; v++) {
        const s = propSkin(kind, area, id, v, hgt);
        if (s.body !== 'kit' && s.body !== 'container') reach.add(`${kind}|${s.body}|${s.nosedIn}`);
      }
      for (const o of warmupChunk(area).obstacles) {
        if (o.segment !== -1 || !WARMUP_VEHICLES.some((w) => w[0] === o.kind) || o.len < 1.5) continue;
        const s = propSkin(o.kind, area, o.id, o.variant, o.hgt);
        built.add(`${o.kind}|${s.body}|${s.nosedIn}`);
      }
      for (const k of reach) expect(built.has(k), `${area}: ${k}`).toBe(true);
    }
  });
});
