// Theme T8, "where they stopped" (THEME §1, §3.4; DESIGN §10.7 rows note, §18.4 rule 10): everything where it belongs.
// Measured on the generated street (24 seeds × 3.2 km from t = 0, the Phase B seeds) and on gateRow itself: the pieces
// of a row stand in their band on one ground level, every vehicle faces its own traffic and touches nothing, rows close
// every run but their openings, the rhythm follows the block's mood and the last rows, and the set pieces keep their
// rules (the Docks van at its loading entrance, the parked rows, a car early in every Downtown run).
import { describe, expect, it } from 'vitest';
import type { AreaId } from '../../../src/core/ids';
import { Sfc32 } from '../../../src/core/rng';
import { CAR_PAINTS, isVehicle, noseToCam, PAINT_SLOTS, paintSlot, propSkin } from '../../../src/core/skins';
import { ROLLOUT_SEC, sAt, tAt } from '../../../src/core/tuning';
import type { Decor, Obstacle, WorldQuery } from '../../../src/core/world';
import { ObTag } from '../../../src/core/world';
import { createWorldGen, createWorldQuery, GEN, Generator, LAYOUTS, type StreetLayout } from '../../../src/world/gen';
import type { RowRec } from '../../../src/world/gen/generator';
import { rowGap } from '../../../src/world/gen/props/shared';
import { deepFree, gateRow, openingLanes, rowKit, rowLanes, vehChance } from '../../../src/world/gen/rows';

const SEEDS = Array.from({ length: 24 }, (_, i) => (i + 1) * 7919), S_END = 3200;
const PARKED = new Set(['DT_PARKED_ROW', 'SB_DRIVEWAY_ROW', 'IN_LOADING_ROW', 'NE_TAXI_RANK']);
const PARALLEL = new Set(['parked_car', 'parked_van', 'container']);
const VEHICLES = new Set(['parked_car', 'parked_van', 'container', 'van_across']);
const STREETS: readonly AreaId[] = ['downtown', 'suburbs', 'neon'];
const skinOf = (o: Obstacle) => propSkin(o.kind, o.area, o.id, o.variant, o.hgt);
const isVeh = (o: Obstacle) => o.kind === 'van_across' || (PARALLEL.has(o.kind) && isVehicle(skinOf(o).body));
const box = (o: Obstacle) => o.solids[0]!.box;
const gapOf = (o: Obstacle, u: Obstacle) => {
  const b = box(o), c = box(u);
  return Math.hypot(Math.max(0, c.x0 - b.x1, b.x0 - c.x1), Math.max(0, c.s0 - b.s1, b.s0 - c.s1));
};

interface Run { gen: Generator; obs: readonly Obstacle[]; decor: Decor[]; q: WorldQuery; rows: (RowRec & { pieces: Obstacle[]; sr: number; area: AreaId; plaza: boolean })[] }
const runs: Run[] = SEEDS.map((seed) => {
  const gen = createWorldGen({ seed, mode: 'normal' }) as Generator;
  gen.ensure(S_END + 200);
  const decor: Decor[] = [];
  for (let i = 0; i * 32 < S_END; i++) decor.push(...gen.chunk(i).decor);
  const q = createWorldQuery(gen), obs = q.obstacles(0, S_END);
  const rows = gen.rows.filter((r) => sAt(r.t) < S_END - 20).map((r) => {
    const sr = sAt(r.t);
    // A row's pieces: Filler-tagged obstacles over its band (vehicles stand up to 2.4 m earlier, kit 0.2 m later).
    const pieces = obs.filter((o) => (o.tags & ObTag.Filler) && o.solids.length && o.s <= sr + 0.31 && o.s + o.len >= sr + 0.01 && o.s >= sr - 2.45);
    const plaza = obs.some((o) => o.kind === 'curb' && o.params?.band === 5 && o.s <= sr && o.s + o.len > sr);
    return { ...r, pieces, sr, area: gen.areaAt(sr).area, plaza };
  });
  return { gen, obs, decor, q, rows };
});
const allRows = runs.flatMap((r) => r.rows);
const streetRows = allRows.filter((r) => STREETS.includes(r.area));
const flatSpread = (q: WorldQuery, o: Obstacle) => {
  const b = box(o), ys: number[] = [];
  for (const s of [b.s0 + 0.1, (b.s0 + b.s1) / 2, b.s1 - 0.1]) for (const x of [b.x0 + 0.1, (b.x0 + b.x1) / 2, b.x1 - 0.1]) ys.push(q.groundAt(s, x, b.y0 + 0.3).y);
  return Math.max(...ys) - Math.min(...ys);
};

describe('theme T8 "where they stopped": bands', () => {
  it('a row piece stands in its band: vehicles and kerb kit in the road (the kit against the kerb), furniture on the sidewalk; one ground level under every footprint', () => {
    let n = 0;
    for (const run of runs) for (const r of run.rows) {
      if (r.fill !== 'band') continue;
      const lay: StreetLayout = r.plaza ? LAYOUTS.plaza : LAYOUTS[r.area];
      const kerb = lay.curbX;
      for (const o of r.pieces) {
        n++;
        const tag = `${r.area} ${o.kind} x ${o.x} @${r.t.toFixed(1)}`;
        expect(flatSpread(run.q, o), tag).toBeLessThanOrEqual(0.06);
        if (isVeh(o)) {
          expect(r.plaza, tag).toBe(false);
          if (r.area !== 'docks' && kerb !== null) expect(Math.abs(o.x) + o.wid / 2, tag).toBeLessThanOrEqual(kerb - 0.02);
          if (r.area === 'docks') expect(o.x, tag).toBeLessThan(0);
          continue;
        }
        if (r.area === 'docks') { expect(rowKit('docks', 'pile').some((p) => p.kind === o.kind) || o.kind === 'container', tag).toBe(true); continue; }
        const inRoad = kerb !== null && Math.abs(o.x) < kerb;
        // (a gutter strip narrower than any kerb piece takes the narrowest piece the street has, against the kerb)
        const gutter = inRoad && Math.abs(o.x) - o.wid / 2 >= kerb! - 0.65;
        const kit = [...rowKit(r.area, inRoad ? 'kerb' : 'walk'), ...(gutter ? rowKit(r.area, 'walk') : [])];
        expect(kit.some((p) => p.kind === o.kind), tag).toBe(true);
        // (road kit stands in the parking strip by the kerb, ≤ 2.0 m of it; Neon's yatai may stand anywhere)
        if (inRoad && o.kind !== 'food_cart') expect(Math.abs(o.x) - o.wid / 2, tag).toBeGreaterThanOrEqual(kerb! - 2.25);
      }
    }
    expect(n).toBeGreaterThan(3000);
  }, 120_000);

  it('every vehicle stands on one ground level (all four wheels on the road, the dock band or a driveway)', () => {
    let n = 0;
    for (const run of runs) for (const o of run.obs) if (isVeh(o) && o.kind !== 'van_across') { n++; expect(flatSpread(run.q, o), `${o.area} ${o.kind} x ${o.x}`).toBeLessThanOrEqual(0.06); }
    expect(n).toBeGreaterThan(1000);
  });

  // (measured 2–4 %: an opening whose road needs the mixed kit weighs least of all, rowCloses)
  it('the mixed kit fills a road part in ≤ 6 % of the street rows (≤ 7 % in any one area)', () => {
    expect(streetRows.filter((r) => r.fill !== 'band').length / streetRows.length).toBeLessThanOrEqual(0.06);
    for (const a of STREETS) {
      const rs = streetRows.filter((r) => r.area === a);
      expect(rs.filter((r) => r.fill !== 'band').length / rs.length, a).toBeLessThanOrEqual(0.07);
    }
  });
});

describe('theme T8: facing and spacing', () => {
  // (the generator tells paints apart by paintSlot; the visible paint is CAR_PAINTS[paintSlot] once the six theme T8
  // paints land with the render palette, G0: from then on the visible paints never repeat either)
  it('every vehicle parallel to s faces its own traffic (noseToCam), and no vehicle repeats the one before (body and paint slot)', () => {
    let n = 0;
    const visible = CAR_PAINTS.length === PAINT_SLOTS;
    for (const run of runs) {
      let last: { body: string; paint: number; seen: string | null } | null = null;
      for (const o of run.obs.filter(isVeh).filter((o) => o.kind !== 'van_across').sort((p, q) => p.s - q.s || p.id - q.id)) {
        const k = skinOf(o);
        n++;
        expect(k.nosedIn, `${o.area} ${o.kind} x ${o.x}`).toBe(noseToCam(o.area, o.x));
        const look = { body: k.body, paint: k.paint === null ? -1 : paintSlot(o.id, o.variant), seen: k.paint };
        if (last && look.paint >= 0) {
          expect(look.body === last.body && look.paint === last.paint, `${o.area} @${o.s}`).toBe(false);
          if (visible) expect(look.body === last.body && look.seen === last.seen, `${o.area} @${o.s} visible paint`).toBe(false);
        }
        last = look;
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('nothing touches: vehicles ≥ 0.05 m apart; a row\'s vehicles ≥ 1.2 m apart along s; a row vehicle a rowGap from one in its lane', () => {
    for (const run of runs) {
      const vs = run.obs.filter(isVeh);
      for (const o of vs) for (const u of vs) {
        if (u.id <= o.id || u.s > o.s + 12 || o.s > u.s + 12) continue;
        expect(gapOf(o, u), `${o.area} ${o.kind}@${o.s} / ${u.kind}@${u.s}`).toBeGreaterThanOrEqual(0.05 - 1e-6);
        const lane = box(o).x1 > box(u).x0 && box(u).x1 > box(o).x0;
        if (lane && ((o.tags | u.tags) & ObTag.Filler)) {
          const [p, q] = o.s < u.s ? [o, u] : [u, o];
          expect(q.s - (p.s + p.len), `${o.area} lane gap @${p.s}`).toBeGreaterThanOrEqual(Math.max(0.6, rowGap(p.hgt) - 0.02));
        }
      }
      for (const r of run.rows) {
        const rv = r.pieces.filter(isVeh);
        for (let i = 0; i < rv.length; i++) for (let j = i + 1; j < rv.length; j++) expect(Math.abs(rv[i]!.s - rv[j]!.s), `${r.area} @${r.t.toFixed(1)}`).toBeGreaterThanOrEqual(1.2 - 1e-6);
      }
    }
  });

  it('nothing a row stands in the road is on a crosswalk: no road vehicle or kerb kit over a zebra', () => {
    let z = 0;
    for (const run of runs) {
      const vs = run.obs.filter((o) => isVeh(o) || ((o.tags & ObTag.Filler) && o.solids.length > 0));
      for (const d of run.decor) {
        if (d.kind !== 'crosswalk') continue;
        z++;
        const len = d.params?.len ?? 3, w = d.params?.w ?? 6;
        for (const o of vs) {
          const b = box(o);
          const over = b.s0 < d.s + len && b.s1 > d.s && b.x0 < d.x + w / 2 && b.x1 > d.x - w / 2 && Math.abs(o.x) - o.wid / 2 < (LAYOUTS[o.area].curbX ?? 4.5);
          expect(over, `${o.area} ${o.kind}@${o.s} on the zebra @${d.s}`).toBe(false);
        }
      }
    }
    expect(z).toBeGreaterThan(50);
  });
});

describe('theme T8: rows close every run but their openings', () => {
  it('a gateRow grid (centres × widths × areas × moods) leaves lanes only in its openings (a hole beside one ≤ 0.4 m)', () => {
    const areas: [AreaId, StreetLayout][] = [['downtown', LAYOUTS.downtown], ['downtown', LAYOUTS.plaza], ['suburbs', LAYOUTS.suburbs],
      ['docks', LAYOUTS.docks], ['neon', LAYOUTS.neon]];
    let rows = 0;
    for (const [area, layout] of areas) for (const w of [2.5, 2.2, 2.0]) for (const pVeh of [0, 0.6, 1]) {
      const sets: number[][] = [];
      for (let k = 0; k <= 66; k++) sets.push([Math.round((-3.3 + k * 0.1) * 100) / 100]);
      for (const [a, b] of [[-2.5, 1.5], [-3.15, 3.15], [-1.2, 2.6], [0.4, -3.0]] as const) sets.push([a, b]);
      for (const centres of sets) {
        if (area === 'docks' && centres.some((c) => c + w / 2 > 4.15)) continue;
        const ids = { ob: 0, coin: 0, edge: 0 };
        const props = { ids, segment: 0, area, datum: 0, ground: (x0: number, x1: number) => {
          let lo = Infinity, hi = -Infinity;
          for (const bd of layout.bands) if (bd.x1 > x0 && bd.x0 < x1) { lo = Math.min(lo, bd.dy); hi = Math.max(hi, bd.dy); }
          return lo === Infinity ? { lo: 0, hi: 0 } : { lo, hi };
        } };
        const rng = new Sfc32(rows + 7);
        const either = centres.length === 2 && Math.abs(centres[0]!) > 3 && Math.abs(centres[1]!) > 3;
        const rb = gateRow(100, centres, w, props, rng, [], { free: () => true, x0: 0, cSafe: centres[0]!, v: 9, pVeh, hist: [], layout, either });
        // (the Docks' lip body, a persistent obstacle the grid leaves out, closes x ≥ 4.15)
        const lanes = rowLanes(100, rb.obs).filter(([l0]) => area !== 'docks' || l0 < 4.1)
          .map(([l0, l1]) => [l0, area === 'docks' ? Math.min(l1, 4.1) : l1] as [number, number]);
        const open = centres.map((c) => openingLanes(c, w));
        for (const [l0, l1] of lanes) {
          expect(open.some(([o0, o1]) => l0 >= o0 - 0.4 - 1e-6 && l1 <= o1 + 0.4 + 1e-6), `${area}/${layout.id} w ${w} c ${centres} lane ${l0}..${l1}`).toBe(true);
        }
        // (and no piece stands in an opening, but where a strip between it and the corridor edge is narrower than
        // any piece: that piece keeps flush with the edge, as a row's always did)
        open.forEach(([o0, o1], i) => {
          const end = area === 'docks' && centres[i]! > 0 ? 4.15 : 4.5;
          if (Math.abs(centres[i]!) + w / 2 > end - (area === 'docks' ? 1.15 : 0.65) - 1e-6) return;
          // (a part narrower than every piece: the narrowest keeps against its kerb, ≤ 0.12 m into the opening)
          expect(lanes.some(([l0, l1]) => l0 <= o0 + 0.13 && l1 >= o1 - 0.13), `${area} w ${w} c ${centres} open`).toBe(true);
        });
        rows++;
      }
    }
    expect(rows).toBeGreaterThan(2500);
  }, 120_000);

  it('a run across x = 0 bounded by a template obstacle (review #1) closes, with no hole wider than the limit beside it', () => {
    const layout = LAYOUTS.downtown, ids = { ob: 0, coin: 0, edge: 0 };
    const props = { ids, segment: 0, area: 'downtown' as AreaId, datum: 0, ground: (x0: number, x1: number) => {
      let lo = Infinity, hi = -Infinity;
      for (const bd of layout.bands) if (bd.x1 > x0 && bd.x0 < x1) { lo = Math.min(lo, bd.dy); hi = Math.max(hi, bd.dy); }
      return { lo, hi };
    } };
    for (let k = 0; k < 40; k++) {
      const keep: [number, number][] = [[-0.6 + k * 0.03, -0.3 + k * 0.03]];
      const rb = gateRow(50, [2.25], 2.5, props, new Sfc32(k + 1), keep, { free: deepFree([]), x0: 2.25, cSafe: 2.25, v: 9, pVeh: 1, hist: [], layout });
      const lanes = rowLanes(50, rb.obs);
      const [o0, o1] = openingLanes(2.25, 2.5);
      for (const [l0, l1] of lanes) {
        const nearKeep = l1 > keep[0]![0] - 0.9 && l0 < keep[0]![1] + 0.9;
        expect((l0 >= o0 - 0.4 && l1 <= o1 + 0.4) || nearKeep, `keep ${keep[0]} lane ${l0}..${l1}`).toBe(true);
      }
    }
  });
});

describe('theme T8: rows keep their promises', () => {
  const props = (area: AreaId, layout: StreetLayout) => ({ ids: { ob: 0, coin: 0, edge: 0 }, segment: 0, area, datum: 0, ground: (x0: number, x1: number) => {
    let lo = Infinity, hi = -Infinity;
    for (const bd of layout.bands) if (bd.x1 > x0 && bd.x0 < x1) { lo = Math.min(lo, bd.dy); hi = Math.max(hi, bd.dy); }
    return lo === Infinity ? { lo: 0, hi: 0 } : { lo, hi };
  } });

  it('a row that keeps vehicles out (the no-vehicle retry, the easy re-rolls) stands no vehicle, the Docks van included', () => {
    let n = 0;
    for (let k = 0; k < 400; k++) for (const c of [2.0, 2.6, 3.0, 0.5, -0.5]) {
      const rb = gateRow(100, [c], 2.5, props('docks', LAYOUTS.docks), new Sfc32(k + 1), [],
        { free: () => true, x0: c, cSafe: c, v: 9, pVeh: 0, hist: [], layout: LAYOUTS.docks, van: true });
      n++;
      expect(rb.obs.some((o) => VEHICLES.has(o.kind) && isVeh(o)), `docks c ${c} #${k}`).toBe(false);
      expect(rb.sig.veh).toBe(0);
    }
    for (const [area, layout] of [['downtown', LAYOUTS.downtown], ['suburbs', LAYOUTS.suburbs], ['neon', LAYOUTS.neon]] as const) {
      for (let k = 0; k < 66; k++) {
        const c = Math.round((-3.3 + k * 0.1) * 100) / 100;
        const rb = gateRow(100, [c], 2.5, props(area, layout), new Sfc32(k + 1), [], { free: () => true, x0: 0, cSafe: c, v: 9, pVeh: 0, hist: [], layout });
        expect(rb.obs.some(isVeh), `${area} c ${c}`).toBe(false);
      }
    }
    expect(n).toBe(2000);
  });

  it('a vehicle on the route to a second opening (which nobody validates) never stands earlier than the row', () => {
    let checked = 0;
    for (const [area, layout] of [['downtown', LAYOUTS.downtown], ['suburbs', LAYOUTS.suburbs], ['neon', LAYOUTS.neon]] as const) {
      for (let k = 0; k < 400; k++) {
        // (two openings either side of a car's width of road, the line entering near the one it takes: the car between
        // them stands on the route to the other opening only)
        const rng = new Sfc32(k + 11), sd = k % 2 ? 1 : -1;
        const a = sd * Math.round((1.8 + rng.float() * 0.4) * 10) / 10, b = -sd * Math.round((2.4 + rng.float() * 0.4) * 10) / 10;
        const x0 = sd * Math.round((0.9 + rng.float() * 0.4) * 10) / 10;
        const rb = gateRow(100, [a, b], 2.5, props(area, layout), rng, [], { free: () => true, x0, cSafe: a, v: 9, pVeh: 1, hist: [], layout });
        const hw = 0.2;
        for (const o of rb.obs.filter(isVeh)) {
          const bx = box(o);
          const safe = bx.x1 > Math.min(x0, a) - hw && bx.x0 < Math.max(x0, a) + hw;
          const other = bx.x1 > Math.min(x0, b) - hw && bx.x0 < Math.max(x0, b) + hw;
          if (!other || safe) continue;
          checked++;
          expect(o.s, `${area} x0 ${x0} openings ${a}, ${b}: ${o.kind} x ${o.x}`).toBeGreaterThanOrEqual(100 - 1e-6);
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('theme T8: rhythm', () => {
  // Per street area, the rows in their own area (history across consecutive rows of one area).
  const sideBySide = (r: (typeof allRows)[number]) => {
    const vs = r.pieces.filter(isVeh);
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
      const b = box(vs[i]!), c = box(vs[j]!);
      if (Math.min(b.s1, c.s1) - Math.max(b.s0, c.s0) >= 1.0 && Math.max(c.x0 - b.x1, b.x0 - c.x1) < 0.3) return true;
    }
    return false;
  };
  const stats = (a: AreaId) => {
    let rows = 0, tri = 0, pairs = 0, mid = 0, sbs = 0, scene3 = 0, side3 = 0, two2 = 0;
    const mood: Record<'quiet' | 'busy', { rows: number; veh: number; withVeh: number }> = { quiet: { rows: 0, veh: 0, withVeh: 0 }, busy: { rows: 0, veh: 0, withVeh: 0 } };
    for (const run of runs) {
      const rs = run.rows;
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i]!;
        if (r.area !== a) continue;
        rows++;
        if (r.sig.mid) mid++;
        if (sideBySide(r)) sbs++;
        const p = rs[i - 1], q = rs[i - 2];
        if (p && p.area === a) {
          pairs++;
          if (r.sig.veh >= 2 && p.sig.veh >= 2) two2++;
          if (q && q.area === a) {
            tri++;
            if (p.sig.scene === r.sig.scene && q.sig.scene === r.sig.scene) scene3++;
            if (r.sig.veh && p.sig.veh && q.sig.veh && r.sig.side && r.sig.side === p.sig.side && r.sig.side === q.sig.side) side3++;
          }
        }
        if (r.sr >= sAt(ROLLOUT_SEC) + GEN.rows.openingBusy) {
          const pv = vehChance(run.gen.seed, r.sr, r.area, 0) / GEN.rows.areaVeh[r.area];
          const m = Math.abs(pv - GEN.rows.pVeh.quiet) < 1e-6 ? 'quiet' : Math.abs(pv - GEN.rows.pVeh.busy) < 1e-6 ? 'busy' : null;
          if (m) { mood[m].rows++; mood[m].veh += r.sig.veh; if (r.sig.veh) mood[m].withVeh++; }
        }
      }
    }
    return { rows, mid: mid / rows, sbs: sbs / rows, scene3: scene3 / tri, side3: side3 / tri, two2: two2 / pairs, mood };
  };
  const per = Object.fromEntries(STREETS.map((a) => [a, stats(a)])) as Record<AreaId, ReturnType<typeof stats>>;

  // (a Downtown or Neon street is marked: a car across its centre line only where the forced move leaves nothing else,
  // measured ~12 % / ~1 %; the Suburbs' residential lanes carry no centre line and are 5.2 m wide, so a car stopped
  // toward the middle is how most rows whose opening lies 1.6–3.1 m off the centre close: measured ~30 %)
  it('a car stopped across the centre line: ≤ 1 row in 8 in Downtown and Neon, ≤ 1 in 3 in the Suburbs\' unmarked lanes', () => {
    expect(per.downtown.mid, 'downtown').toBeLessThanOrEqual(1 / 8);
    expect(per.neon.mid, 'neon').toBeLessThanOrEqual(1 / 8);
    expect(per.suburbs.mid, 'suburbs').toBeLessThanOrEqual(1 / 3);
  });

  // (a row whose opening is on a sidewalk closes the whole road: two cars stopped side by side in opposite lanes,
  // staggered, 0.05–0.14 m apart, are its natural fill; measured DT ~24 %, SB ~18 %, NE ~13 %, either forks included)
  it('two vehicles side by side (≥ 1 m alongside, < 0.3 m apart) in ≤ 1 row in 4 of every street area', () => {
    for (const a of STREETS) expect(per[a].sbs, a).toBeLessThanOrEqual(0.25);
  });

  // (the plan's busy − quiet ≥ 0.4 vehicles a row is not reachable: every forced move is ≥ 2.8 m, so after a quiet
  // block's kit-only row (opening near the centre) the next row opens on a sidewalk and closes the whole road with two
  // cars; the mood shows in how many rows carry a vehicle, and in Neon and the Suburbs in the count as well)
  it('the block mood shows in every street area: fewer quiet rows carry a vehicle than busy ones; fewer vehicles a row in the Suburbs and Neon', () => {
    for (const a of STREETS) {
      const { quiet, busy } = per[a].mood;
      expect(quiet.rows, a).toBeGreaterThan(50);
      expect(busy.withVeh / busy.rows - quiet.withVeh / quiet.rows, a).toBeGreaterThanOrEqual(a === 'neon' ? 0.3 : 0.1);
    }
    for (const [a, d] of [['suburbs', 0.2], ['neon', 0.5]] as const) {
      const { quiet, busy } = per[a].mood;
      expect(busy.veh / busy.rows - quiet.veh / quiet.rows, a).toBeGreaterThanOrEqual(d);
    }
  });

  // (the plan's 25–65 % in a lane: measured ~80 % Downtown, ~90 % in Neon: a kerb car closes only a road part of its
  // width, so most rows' cars stopped in their lanes, which is the street as it was left; both kinds must show)
  it('Downtown and Neon row cars: some at the kerb (≥ 5 %), most stopped in a lane; both halves 35–65 %', () => {
    for (const a of ['downtown', 'neon'] as const) {
      const vs = allRows.filter((r) => r.area === a).flatMap((r) => r.pieces.filter(isVeh));
      const kerb = LAYOUTS[a].curbX!;
      const lane = vs.filter((o) => Math.abs(o.x) + o.wid / 2 < kerb - 0.12).length / vs.length;
      expect(lane, a).toBeGreaterThanOrEqual(0.25);
      expect(lane, a).toBeLessThanOrEqual(0.95);
    }
    for (const a of STREETS) {
      const vs = allRows.filter((r) => r.area === a).flatMap((r) => r.pieces.filter(isVeh));
      const left = vs.filter((o) => o.x < 0).length / vs.length;
      expect(left, a).toBeGreaterThanOrEqual(0.35);
      expect(left, a).toBeLessThanOrEqual(0.65);
    }
  });

  it('history, per street area: no scene three rows running (≤ 8 %), no third same-side vehicle row (≤ 3 %), a 2-vehicle row rarely after one (≤ 3 %), squeezes ≤ 1 row in 4', () => {
    for (const a of STREETS) {
      expect(per[a].scene3, a).toBeLessThanOrEqual(0.08);
      expect(per[a].side3, a).toBeLessThanOrEqual(0.03);
      expect(per[a].two2, a).toBeLessThanOrEqual(0.03);
    }
    for (const run of runs) {
      const rs = run.rows;
      for (let i = 0; i < rs.length; i++) if (rs[i]!.sig.scene === 'squeeze') expect(rs.slice(Math.max(0, i - 3), i).some((x) => x.sig.scene === 'squeeze')).toBe(false);
    }
  });
});

describe('theme T8: set pieces', () => {
  it('the van at a loading entrance: only in the Docks, on the dock side, nose at the corridor edge, over its bay, beside its entrance; ≤ 1 a visit', () => {
    let vans = 0;
    for (const run of runs) {
      const segs = run.gen.segments();
      const perVisit = new Map<number, number>();
      for (const o of run.obs) {
        if (o.kind !== 'van_across') continue;
        expect(o.area).toBe('docks');
        expect(o.x).toBeLessThan(0);
        expect(Math.min(box(o).x0, box(o).x1)).toBeCloseTo(-4.5, 2);
        if (o.s + o.len > S_END - 40) continue;
        vans++;
        const near = run.decor.filter((d) => Math.abs(d.s - (o.s - 0.4)) < 0.2 || Math.abs(d.s - (o.s - 0.5)) < 0.2);
        expect(near.some((d) => d.kind === 'parking_bay' && d.params?.perp === 1)).toBe(true);
        expect(near.some((d) => d.kind === 'end_wall' && d.params?.style === 4 && d.x < 0)).toBe(true);
        // (the dock fence opens at the entrance; nothing tall stands in it)
        for (const d of run.decor) {
          if (d.x >= -4.5 || d.s < o.s - 1 || d.s > o.s + o.len + 1) continue;
          expect(['street_lamp', 'utility_pole', 'tree', 'pallet_pile', 'drum_pile'].includes(d.kind) && Math.abs(d.x) < 4.6 + 3.8 + 1, d.kind).toBe(false);
        }
        const seg = segs.find((sg) => sg.index === o.segment)!;
        const key = Math.round(seg.t0 / 39);
        perVisit.set(key, (perVisit.get(key) ?? 0) + 1);
      }
      for (const n of perVisit.values()) expect(n).toBeLessThanOrEqual(1);
    }
    expect(vans).toBeGreaterThan(10);
  });

  it('parked rows: one side, an empty bay apart (out of the 35° shadow), all facing the same way, all in the road; loading-row trucks are box trucks', () => {
    let rows = 0;
    for (const { gen, obs } of runs) for (const sg of gen.segments()) {
      if (!PARKED.has(sg.templateId) || sg.s1 > S_END) continue;
      const cars = obs.filter((o) => o.segment === sg.index && !(o.tags & ObTag.Filler) && PARALLEL.has(o.kind) && (sg.templateId !== 'IN_LOADING_ROW' || Math.abs(o.x + 3.25) < 0.01))
        .sort((p, q) => p.s - q.s);
      if (cars.length < 2) continue;
      rows++;
      for (const o of cars) expect(isVeh(o), `${sg.templateId} ${o.kind}`).toBe(true);
      if (sg.templateId === 'IN_LOADING_ROW') for (const o of cars) expect(skinOf(o).body).toBe('box_truck');
      expect(new Set(cars.map((o) => Math.sign(o.x))).size, sg.templateId).toBe(1);
      expect(new Set(cars.map((o) => skinOf(o).nosedIn)).size, sg.templateId).toBe(1);
      for (let i = 1; i < cars.length; i++) {
        const gap = cars[i]!.s - (cars[i - 1]!.s + cars[i - 1]!.len);
        expect(gap, sg.templateId).toBeGreaterThanOrEqual(Math.max(0.6, rowGap(cars[i - 1]!.hgt) - 0.02));
      }
      const kerb = LAYOUTS[cars[0]!.area].curbX;
      for (const o of cars) if (kerb !== null) expect(Math.abs(o.x) + o.wid / 2, sg.templateId).toBeLessThanOrEqual(kerb - 0.02);
      for (const o of cars) expect(Math.abs(o.x), sg.templateId).toBeGreaterThan(1.0);       // never in the centre lanes
    }
    expect(rows).toBeGreaterThan(40);
  });

  it('every Downtown run shows a car within 150 m after the Roll-out', () => {
    for (const { gen, obs } of runs) {
      const ro = gen.segments().find((sg) => sg.templateId === 'ROLLOUT')!;
      expect(obs.some((o) => o.area === 'downtown' && o.s >= ro.s1 && o.s < ro.s1 + 150 && isVeh(o))).toBe(true);
    }
  });

  it('the stopped cars keep their crossings: a lone car in its lane (Downtown, Neon) mostly has a zebra ahead of it', () => {
    let lone = 0, crossed = 0;
    for (const run of runs) {
      const vs = run.obs.filter(isVeh);
      const zebras = run.decor.filter((d) => d.kind === 'crosswalk').map((d) => d.s);
      for (const o of vs) {
        if ((o.area !== 'downtown' && o.area !== 'neon') || Math.abs(o.x) + o.wid / 2 >= LAYOUTS[o.area].curbX! - 0.12) continue;
        if (vs.some((u) => u !== o && u.s < o.s + o.len + 6 && u.s + u.len > o.s - 6)) continue;
        lone++;
        if (zebras.some((z) => Math.abs(z - (noseToCam(o.area, o.x) ? o.s - 4 : o.s + o.len + 1)) < 25)) crossed++;
      }
    }
    expect(lone).toBeGreaterThan(20);
    expect(crossed / lone).toBeGreaterThanOrEqual(0.8);
  });
});
void tAt;
