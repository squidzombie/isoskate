// world/gen (W1b): golden chunk hashes, determinism, the area timeline and gateways, the Roll-out and the Lesson Line,
// the v1 template set and landmarks, curb grind exits, tall blockers, gate rows, height bands, R_MIN spacing along
// SafeKeys, A3 full-width scheduling, startT semantics, decor, coins and generator health. The 100-seed static
// asserts are tests/bots/gate.static.test.ts.
import { describe, expect, it } from 'vitest';
import { hash32 } from '../../../src/core/rng';
import { CHUNK_LEN, HEIGHT, R_MIN, T_SHIFT, sAt, speedAt, tAt } from '../../../src/core/tuning';
import type { Chunk, SafeKey, WorldGen } from '../../../src/core/world';
import { ObTag } from '../../../src/core/world';
import { AREA_TEMPLATES, createWorldGen, createWorldQuery, GATEWAYS, GEN, GEN_FLAGS, gatewayWindow, LESSON_PARTS, rMinAt, ROLLOUT_CHAIN_T,
  ROLLOUT_END_S, SHARED } from '../../../src/world/gen';
import { DECOR_KINDS } from '../../../src/core/decor';
import { insetOf } from '../../../src/sim';
import { checkPath } from '../../../src/world/gen/validator/path';
import { SafeLine } from '../../../src/world/gen/safe';

const cm = (v: number) => Math.round(v * 100);
function hashChunk(c: Chunk, h: number): number {
  const w = (...v: number[]) => { h = hash32(h, ...v); };
  w(c.index, c.obstacles.length, c.coins.length, c.safe.length, c.decor.length);
  for (const o of c.obstacles) {
    w(o.id, o.kind.length, o.kind.charCodeAt(0), cm(o.s), cm(o.x), cm(o.len), cm(o.wid), cm(o.hgt), o.tags);
    for (const so of o.solids) w(cm(so.box.s0), cm(so.box.s1), cm(so.box.x0), cm(so.box.x1), cm(so.box.y0), cm(so.box.y1), so.top.length);
    for (const sl of o.slabs) w(cm(sl.s0), cm(sl.s1), cm(sl.x0), cm(sl.x1), cm(sl.y0), cm(sl.y1));
    for (const p of o.pits) w(cm(p.s0), cm(p.s1), cm(p.x0), cm(p.x1), cm(p.lipY));
    for (const e of o.edges) w(e.id, cm(e.a.s), cm(e.a.x), cm(e.a.y), cm(e.b.s), cm(e.b.x), e.pickOnly ? 1 : 0);
  }
  for (const k of c.coins) w(k.id, cm(k.p.s), cm(k.p.x), cm(k.p.y), k.value);
  for (const k of c.safe) w(Math.round(k.t * 1000), cm(k.x), k.action ? 1 : 0);
  for (const d of c.decor) w(d.kind.length, cm(d.s), cm(d.x), d.variant);
  return h;
}
/** A generator built with GEN_FLAGS.trench forced (the flag is read once, at construction). */
function genWith(trench: boolean, cfg: Parameters<typeof createWorldGen>[0]): WorldGen {
  const was = GEN_FLAGS.trench;
  GEN_FLAGS.trench = trench;
  try { return createWorldGen(cfg); } finally { GEN_FLAGS.trench = was; }
}
function worldHash(seed: number, chunks: number, o: { startT?: number; trench?: boolean } = {}): number {
  const { trench, ...rest } = o;
  const gen = genWith(trench ?? GEN_FLAGS.trench, { seed, mode: 'normal', ...rest });
  let h = 0x9e3779b9 | 0;
  const first = Math.floor(sAt(o.startT ?? 0) / CHUNK_LEN);
  for (let i = first; i < first + chunks; i++) h = hashChunk(gen.chunk(i), h);
  return h >>> 0;
}
function keysOf(gen: WorldGen, s1: number): SafeKey[] {
  const out: SafeKey[] = [];
  for (let i = 0; i * CHUNK_LEN < s1; i++) out.push(...gen.chunk(i).safe);
  return out.sort((a, b) => a.t - b.t);
}
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('world/gen determinism', () => {
  it('golden chunk hashes (100 chunks ≈ 3.2 km) for 3 seeds, S_TRENCH off and on (the default since G0)', () => {
    // Update deliberately when the generator changes (TECH §5.4).
    expect(GEN_FLAGS.trench).toBe(true);
    expect([1, 2, 3].map((s) => worldHash(s, 100, { trench: false }))).toEqual(GOLDEN);
    expect([1, 2, 3].map((s) => worldHash(s, 100, { trench: true }))).toEqual(GOLDEN_TRENCH);
  });
  it('the same seed gives the same street, whatever order the chunks are asked for', () => {
    const a = createWorldGen({ seed: 7, mode: 'normal' });
    const b = createWorldGen({ seed: 7, mode: 'normal' });
    b.chunk(20);                                     // jump ahead first: generation is strictly in order anyway
    let ha = 0, hb = 0;
    for (let i = 0; i <= 20; i++) { ha = hashChunk(a.chunk(i), ha); hb = hashChunk(b.chunk(i), hb); }
    expect(ha).toBe(hb);
    expect(worldHash(7, 40)).not.toBe(worldHash(8, 40));
  });
  it('the Roll-out chunks are identical on every run (no seed involved)', () => {
    const h = (seed: number) => { const g = createWorldGen({ seed, mode: 'normal' }); return hashChunk(g.chunk(1), hashChunk(g.chunk(0), 0)); };
    const ref = h(1);
    for (const seed of [2, 3, 99, 123456]) expect(h(seed)).toBe(ref);
    const g = createWorldGen({ seed: 5, mode: 'normal' });
    g.chunk(2);
    expect(g.segments()[0]!.templateId).toBe('ROLLOUT');
    expect(g.segments()[0]!.s1).toBeCloseTo(ROLLOUT_END_S, 9);
  });
});

describe('Roll-out (DESIGN §12.4)', () => {
  it('a full-width chain at 3.5 s, then a grindable ledge at x = +2 from 6 s; coins on the S-curve and the ledge', () => {
    const gen = createWorldGen({ seed: 11, mode: 'normal' });
    const w = createWorldQuery(gen);
    const obs = w.obstacles(0, ROLLOUT_END_S).filter((o) => o.kind !== 'curb');
    const chain = obs.find((o) => o.kind === 'barrier_low')!;
    expect(chain.s).toBeCloseTo(sAt(ROLLOUT_CHAIN_T), 2);
    expect(chain.tags & ObTag.FullWidth).toBeTruthy();
    expect(chain.hgt).toBe(0.35);
    expect(chain.warnAtS).toBeCloseTo(chain.s - 1.6 * 7, 2);
    const ledge = obs.find((o) => o.kind === 'granite_ledge')!;
    expect(ledge.x).toBe(2);
    expect(ledge.s).toBeCloseTo(sAt(6), 2);
    expect(ledge.edges.every((e) => !e.pickOnly)).toBe(true);
    expect(w.coins(0, sAt(3)).length).toBe(8);
    expect(w.coins(ledge.s, ledge.s + ledge.len).length).toBeGreaterThanOrEqual(5);
    const keys = keysOf(gen, ROLLOUT_END_S).filter((k) => k.t < tAt(ROLLOUT_END_S));
    expect(keys.filter((k) => k.action === 'ollie').length).toBe(1);
  });
});

describe('area timeline and gateways (DESIGN §12.1)', () => {
  it('gateway segments at 40, 79, 118, 157 s; Suburbs at 44 s, Docks at 83 s, Neon at 122 s', () => {
    const gen = createWorldGen({ seed: 3, mode: 'normal' });
    gen.ensure(sAt(200));
    const gws = gen.segments().filter((s) => s.gateway && s.t0 < 190);
    expect(gws.map((s) => [s.gateway, Math.round(s.t0 * 1000) / 1000, Math.round(s.t1 * 1000) / 1000])).toEqual([
      ['greenway', 40, 44], ['levelCrossing', 79, 83], ['harborBridge', 118, 122], ['underpass', 157, 161],
    ]);
    for (const s of gws) expect(s.tier).toBe(0);
    expect(gen.areaAt(sAt(43.9)).area).toBe('downtown');
    expect(gen.areaAt(sAt(44.1)).area).toBe('suburbs');
    expect(gen.areaAt(sAt(83.1)).area).toBe('docks');
    expect(gen.areaAt(sAt(122.1)).area).toBe('neon');
    expect(gen.areaAt(sAt(161.1)).area).toBe('downtown');
    expect(gatewayWindow(10, 'downtown')).toEqual({ start: 40, end: 44, id: 'greenway' });
    // Segments tile time without gaps; no segment straddles a gateway boundary.
    const segs = gen.segments();
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.t0).toBeCloseTo(segs[i - 1]!.t1, 9);
  });
});

describe('validator rules on generated streets (20 seeds × 3,000 m, S_TRENCH on for odd seeds)', () => {
  const gens = SEEDS.map((seed) => { const g = genWith(seed % 2 === 1, { seed, mode: 'normal' }); g.ensure(3000); return g; });

  it('S_TRENCH only when GEN_FLAGS.trench is on; off, every A3 slot is an S_BARRIER', () => {
    const count = (g: WorldGen, id: string) => g.segments().filter((s) => s.templateId === id).length;
    const on = gens.filter((_, i) => i % 2 === 0), off = gens.filter((_, i) => i % 2 === 1);
    expect(on.reduce((n, g) => n + count(g, 'S_TRENCH'), 0)).toBeGreaterThan(50);
    expect(off.reduce((n, g) => n + count(g, 'S_TRENCH'), 0)).toBe(0);
    for (const g of off) expect(createWorldQuery(g).obstacles(0, 3000).every((o) => o.pits.length === 0)).toBe(true);
    expect(off.reduce((n, g) => n + count(g, 'S_BARRIER'), 0)).toBeGreaterThan(on.reduce((n, g) => n + count(g, 'S_BARRIER'), 0));
  });

  it('curb grinds never carry the board into a blocker: no crash face in an edge’s grind sweep or exit zone', () => {
    let curbEdges = 0;
    for (const g of gens) {
      const w = createWorldQuery(g);
      for (const c of w.obstacles(0, 3000)) for (const e of c.edges) {
        if (c.kind !== 'curb') continue;
        curbEdges++;
        const zone = 0.6 * speedAt(tAt(e.b.s)) - 0.05;
        for (const o of w.obstacles(e.a.s - 1, e.b.s + zone + 1)) {
          if (o.kind === 'curb') continue;
          for (const so of o.solids) {
            if (so.top === 'knock' || (so.top === 'landable' && so.box.y1 - e.a.y <= 0.18)) continue;
            const ix = insetOf(so.box.x1 - so.box.x0), is = insetOf(so.box.s1 - so.box.s0);
            // Sweep: the hitbox (±0.2) along the edge; exit zone: ±1.5 m for 0.6 s·v after its end.
            const inSweep = so.box.x1 - ix > e.a.x - 0.2 && so.box.x0 + ix < e.a.x + 0.2 && so.box.s1 - is > e.a.s && so.box.s0 + is < e.b.s;
            const inZone = so.box.x1 > e.b.x - 1.5 && so.box.x0 < e.b.x + 1.5 && so.box.s1 > e.b.s && so.box.s0 < e.b.s + zone;
            expect(inSweep || inZone, `curb ${e.a.s}–${e.b.s} x=${e.a.x} vs ${o.kind} @${so.box.s0}`).toBe(false);
          }
          for (const p of o.pits) if (p.x1 > e.b.x - 1.5 && p.x0 < e.b.x + 1.5) expect(p.s1 <= e.b.s || p.s0 >= e.b.s + zone).toBe(true);
        }
      }
    }
    expect(curbEdges).toBeGreaterThan(200);
  });

  it('tall blockers stand 1.15 m above any ground a board touching them can ride on (sidewalks beside them too)', () => {
    let n = 0;
    for (const g of gens) {
      const w = createWorldQuery(g);
      for (const o of w.obstacles(0, 3000)) {
        if (!(o.tags & ObTag.Filler) && o.kind !== 'trash_can' && o.kind !== 'news_box') continue;
        for (const so of o.solids) {
          if (!so.tall) continue;
          n++;
          // The highest ground (street base, below the blocker's top) a board touching its sides can ride on.
          let reach = -Infinity;
          for (const x of [so.box.x0 - 0.2, so.box.x0 + 0.01, (so.box.x0 + so.box.x1) / 2, so.box.x1 - 0.01, so.box.x1 + 0.2]) {
            reach = Math.max(reach, w.groundAt((so.box.s0 + so.box.s1) / 2, Math.max(-4.49, Math.min(4.49, x)), so.box.y0 + 0.5).y);
          }
          expect(so.box.y1 - reach, `${o.kind} @${o.s}`).toBeGreaterThanOrEqual(HEIGHT.tallMin - 1e-6);
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('decor stays inside the documented parameter ranges (buildings: w 6–14, d 8–30, h 6–40 m)', () => {
    expect(DECOR_KINDS.building.params.w).toContain('6–14');
    let n = 0;
    for (const g of gens) for (let i = 0; i * CHUNK_LEN < 3000; i++) for (const d of g.chunk(i).decor) {
      if (d.kind !== 'building') continue;
      n++;
      const p = d.params as Record<string, number>;
      expect(p.w! >= 6 && p.w! <= 14 && p.d! >= 8 && p.d! <= 30 && p.h! >= 6 && p.h! <= 40, JSON.stringify(p)).toBe(true);
    }
    expect(n).toBeGreaterThan(500);
  });

  it('gate rows (anti-straight) come ≤ GEN.gate.gap apart, plus one gateway (and the gate after it) of slack', () => {
    let rows = 0, worst = -Infinity;
    for (const g of gens) {
      const w = createWorldQuery(g);
      const segs = g.segments();
      // A row: ≥ 3 filler blockers at one s.
      const at = new Map<number, number>();
      for (const o of w.obstacles(0, 3000)) if (o.tags & ObTag.Filler) at.set(o.s, (at.get(o.s) ?? 0) + 1);
      const rowsT = [...at.entries()].filter(([, k]) => k >= 3).map(([s]) => tAt(s)).sort((a, b) => a - b)
        .filter((t, i, a) => i === 0 || t - a[i - 1]! > 0.5);
      for (let i = 1; i < rowsT.length; i++) {
        const a = rowsT[i - 1]!, b = rowsT[i]!;
        if (b > 330) break;
        const ph = a < 45 ? 'opening' : a < 90 ? 'warm' : a < 150 ? 'build' : 'plateau';
        const gw = segs.some((s) => s.gateway && s.t1 > a && s.t0 < b);
        worst = Math.max(worst, b - a - GEN.gate.gap[ph] - (gw ? 4 + GEN.gate.lead + 3.0 : 0));
      }
      rows += rowsT.length;
    }
    expect(rows).toBeGreaterThan(20 * 30);
    expect(worst).toBeLessThanOrEqual(0.6);
  });

  it('height bands: no solid top in 0.61–1.14 m; full-width hazards ≤ 0.50 m tall and ≤ 0.6 m long; pits ≤ 0.35 s·v', () => {
    let solids = 0;
    for (const g of gens) {
      const w = createWorldQuery(g);
      for (const o of w.obstacles(0, 3000)) {
        const rideOn = o.slabs.some((sl) => sl.kind !== 'flat');
        for (const so of o.solids) {
          solids++;
          const h = so.box.y1 - so.box.y0;
          // Ride-on slope bodies (inclines, hubbas: landable tops under a sloped slab) are ramps, not walls.
          if (!(so.top === 'landable' && rideOn)) expect(h > HEIGHT.forbidMin - 0.005 && h < HEIGHT.forbidMax + 0.005, `${o.kind} ${h}`).toBe(false);
          if (o.tags & ObTag.FullWidth) { expect(h).toBeLessThanOrEqual(0.5); expect(so.box.s1 - so.box.s0).toBeLessThanOrEqual(0.6 + 1e-9); }
          if (so.tall) expect(h).toBeGreaterThanOrEqual(HEIGHT.tallMin);
        }
        for (const p of o.pits) expect(p.s1 - p.s0).toBeLessThanOrEqual(0.35 * speedAt(tAt(p.s0)) + 0.011);
      }
    }
    expect(solids).toBeGreaterThan(1000);
  });

  it('R_MIN spacing along the SafeKeys: consecutive required actions ≥ max(R_MIN(t), T_SHIFT(dx))', () => {
    let actions = 0, minGap = Infinity;
    for (const g of gens) {
      const keys = keysOf(g, 3000);
      // Required actions from the keys: ollies, and the start of each lateral move of ≥ 0.5 m.
      const acts: { t: number; dx: number }[] = [];
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]!;
        if (k.action === 'ollie') acts.push({ t: k.t, dx: 0 });
        const n = keys[i + 1];
        if (n && Math.abs(n.x - k.x) > 1e-6 && (i === 0 || Math.abs(k.x - keys[i - 1]!.x) < 1e-6)) {
          let j = i + 1;
          while (keys[j + 1] && Math.sign(keys[j + 1]!.x - keys[j]!.x) === Math.sign(n.x - k.x) && Math.abs(keys[j + 1]!.x - keys[j]!.x) > 1e-6) j++;
          const dx = keys[j]!.x - k.x;
          if (Math.abs(dx) >= 0.5) acts.push({ t: k.t, dx });
        }
      }
      acts.sort((a, b) => a.t - b.t);
      for (let i = 1; i < acts.length; i++) {
        const a = acts[i - 1]!, b = acts[i]!;
        const need = Math.max(rMinAt(a.t), T_SHIFT(a.dx));
        minGap = Math.min(minGap, b.t - a.t - need);
        expect(b.t - a.t, `t=${a.t.toFixed(2)}`).toBeGreaterThanOrEqual(need - 0.011);
      }
      actions += acts.length;
    }
    expect(actions).toBeGreaterThan(20 * 50);
    expect(R_MIN[R_MIN.length - 1]!.sec).toBe(0.9);
    expect(minGap).toBeGreaterThan(-0.011);
  });

  it('A3: a full-width hazard at most every 16 s of non-T0 time in the opening, every 12 s later (+0.5 s)', () => {
    let worst = -Infinity;
    for (const g of gens) {
      const w = createWorldQuery(g);
      const segs = g.segments();
      // A-clock: non-T0 seconds (T0 segments pause it).
      const aAt = (t: number) => { let a = 0; for (const s of segs) { if (s.t0 >= t) break; if (s.tier > 0) a += Math.min(t, s.t1) - s.t0; } return a; };
      const fw = w.obstacles(0, 3000).filter((o) => o.tags & ObTag.FullWidth).map((o) => ({ a: aAt(tAt(o.s)), t: tAt(o.s) }));
      for (let i = 1; i < fw.length; i++) worst = Math.max(worst, fw[i]!.a - fw[i - 1]!.a - (fw[i - 1]!.t < 45 ? 16 : 12));
    }
    expect(worst).toBeLessThanOrEqual(0.5);
  });

  it('coins: most sit on trick lines; the generator rarely re-rolls and (almost) never falls back', () => {
    let segs = 0, rerolls = 0, fallbacks = 0;
    for (const g of gens) {
      const st = g.stats();
      expect(st.trickCoinShare, 'trick coin share').toBeGreaterThanOrEqual(0.75);   // A5
      segs += st.segments; rerolls += st.rerolls; fallbacks += st.fallbacks;
    }
    expect(rerolls / segs).toBeLessThan(0.05);
    expect(fallbacks / segs).toBeLessThan(0.01);
  });
});

describe('startT and the validator path check', () => {
  it('startT: no Roll-out, generation starts at sAt(startT), the first required action waits ≥ 1.5 s', () => {
    const g = createWorldGen({ seed: 4, mode: 'normal', startT: 150 });
    g.ensure(sAt(170));
    const first = g.segments()[0]!;
    expect(first.templateId).not.toBe('ROLLOUT');
    expect(first.s0).toBeCloseTo(sAt(150), 9);
    const keys: SafeKey[] = [];
    for (let i = Math.floor(sAt(150) / CHUNK_LEN); i < Math.floor(sAt(170) / CHUNK_LEN); i++) keys.push(...g.chunk(i).safe);
    const firstAction = keys.filter((k) => k.action === 'ollie' || keys.some((n) => n.t > k.t && n.t < k.t + 0.6 && Math.abs(n.x - k.x) > 0.3))
      .sort((a, b) => a.t - b.t)[0]!;
    expect(firstAction.t).toBeGreaterThanOrEqual(151.5 - 1e-6);
  });
  it('uses the sim inset rule (frozen: FACE_INSET clamped to a quarter of the extent)', () => {
    for (const e of [0.05, 0.3, 0.6, 2]) expect(insetOf(e)).toBe(Math.min(0.08, e / 4));
    // A crash-top box across the line with no ollie fails; an ollie over a 0.5 m barrier passes.
    const line = new SafeLine(10, 0);
    const bar = { id: 1, kind: 'barrier_low' as const, area: 'downtown' as const, segment: 0, s: sAt(11), x: 0, len: 0.6, wid: 9, hgt: 0.5,
      rotY: 0 as const, mirror: false, variant: 0, slabs: [], pits: [], edges: [], tags: ObTag.FullWidth,
      solids: [{ box: { s0: sAt(11), s1: sAt(11) + 0.6, x0: -4.5, x1: 4.5, y0: 0, y1: 0.5 }, top: 'crash' as const, tall: false }] };
    expect(checkPath(line, [bar], 10, 12, 0)).toBe('path:barrier_low');
    const line2 = new SafeLine(10, 0).ollie(tAt(sAt(11) + 0.3) - 0.3);
    for (const sh of [-0.12, 0, 0.12]) expect(checkPath(line2, [bar], 10, 12, sh)).toBeNull();
  });
});


describe('the Lesson Line (DESIGN §12.3) and the v1 template set (§10.4)', () => {
  it('Lesson Line: 0–40 s on a fixed street, every taught element where the table puts it, then the Greenway', () => {
    const gen = createWorldGen({ seed: 42, mode: 'lesson' });
    gen.ensure(sAt(45));
    const w = createWorldQuery(gen);
    const at = (kind: string, t0: number, t1: number) => w.obstacles(sAt(t0), sAt(t1)).filter((o) => o.kind === kind && o.s >= sAt(t0) - 1 && o.s < sAt(t1));
    expect(at('barrier_low', 3, 4).length).toBe(1);                         // 3.5 s: the chain (first required action)
    expect(at('granite_ledge', 5.5, 9).some((o) => o.x === 2)).toBe(true);    // 6–9 s: ledge at x = +2
    expect(at('bench', 9.5, 13).filter((o) => o.x === -2).length).toBe(4);    // 10–13 s: two bench pairs at x = −2
    expect(at('parked_car', 13.6, 17.6).length).toBeGreaterThan(0);          // 14–17 s: a parked car
    const ter = at('terrace', 17.6, 21.8);                                    // 18–21 s: a 5-stair terrace (−0.85 m) …
    expect(ter.length).toBe(1);
    expect(at('handrail', 17.6, 21.8).length).toBeGreaterThan(0);            // … with a handrail
    expect(at('manual_pad', 21.8, 25.8).length).toBe(3);                     // 22–25 s: 3 manual pads
    expect(at('flatbar', 25.8, 29.8).length).toBeGreaterThanOrEqual(3);      // 26–29 s: the rail ladder
    expect(at('incline', 29.8, 32.8).length).toBe(1);                        // 30–32 s: the payback incline
    expect(at('trench', 32.8, 36).length + at('barrier_low', 32.8, 36).length).toBe(1);   // 33–35.5 s: trench + plank
    const segs = gen.segments();
    expect(segs.filter((s) => s.templateId.startsWith('LESSON_')).length).toBeGreaterThanOrEqual(LESSON_PARTS.length);
    expect(segs.find((s) => s.gateway)!.t0).toBe(40);
    // The datum is back at 0 before the gateway (the terrace drop is paid back by the incline).
    expect(w.groundAt(sAt(40) + 0.5, 0, 0.5).y).toBe(0);
  });

  it('every v1 template (9 shared, 6 per area, 4 gateways) is instantiated on 20 seeds; the landmarks appear', () => {
    const seen = new Set<string>(), landmarks = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const g = createWorldGen({ seed, mode: 'normal' });
      g.ensure(sAt(640));
      for (const s of g.segments()) seen.add(s.templateId);
      for (const o of createWorldQuery(g).obstacles(0, sAt(640))) if (o.landmark) landmarks.add(o.landmark);
    }
    const ids = [...SHARED, ...Object.values(AREA_TEMPLATES).flat(), ...Object.values(GATEWAYS)].map((t) => t.id);
    expect(SHARED.length).toBe(9);
    for (const a of Object.values(AREA_TEMPLATES)) expect(a.length).toBe(6);
    expect(ids.filter((id) => !seen.has(id))).toEqual([]);
    for (const l of ['Amberlane Seven', 'Corner Scoops wall', 'Pier 9 lip', 'Sora Line Skywalk']) expect(landmarks.has(l), l).toBe(true);
  });

  it('full-width hazards carry warnAtS (1.6 s ahead); gaps name their obstacle; decor uses only DECOR_KINDS within limits', () => {
    const g = createWorldGen({ seed: 9, mode: 'normal' });
    g.ensure(6000);
    const w = createWorldQuery(g);
    const obs = w.obstacles(0, 6000);
    const fw = obs.filter((o) => o.tags & ObTag.FullWidth);
    expect(fw.length).toBeGreaterThan(20);
    for (const o of fw) expect(o.warnAtS, o.kind).toBeCloseTo(o.s - 1.6 * speedAt(tAt(o.s)), 0);
    const ids = new Set(obs.map((o) => o.id));
    const gaps = obs.filter((o) => o.gap);
    expect(gaps.length).toBeGreaterThan(2);
    for (const o of gaps) if (o.gap!.fromObstacle !== undefined) expect(ids.has(o.gap!.fromObstacle)).toBe(true);
    let decor = 0;
    for (let i = 0; i * CHUNK_LEN < 3000; i++) for (const d of g.chunk(i).decor) {
      decor++;
      expect((DECOR_KINDS as Record<string, unknown>)[d.kind], d.kind).toBeDefined();
      if (d.kind === 'billboard') expect(Math.abs(d.x)).toBeGreaterThanOrEqual(4.9);
    }
    expect(decor).toBeGreaterThan(300);
  });
});

const GOLDEN = [3721521044, 3146777944, 867771022];
const GOLDEN_TRENCH = [1763372308, 491250573, 291711547];
