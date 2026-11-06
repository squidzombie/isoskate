// world/gen (M0 minimum): golden chunk hashes, determinism, the area timeline and gateways, the Roll-out, height
// bands, R_MIN spacing along SafeKeys, A3 full-width scheduling, startT semantics, coins and generator health.
import { describe, expect, it } from 'vitest';
import { hash32 } from '../../../src/core/rng';
import { CHUNK_LEN, HEIGHT, R_MIN, T_SHIFT, sAt, speedAt, tAt } from '../../../src/core/tuning';
import type { Chunk, SafeKey, WorldGen } from '../../../src/core/world';
import { ObTag } from '../../../src/core/world';
import { createWorldGen, createWorldQuery, GEN, GEN_FLAGS, gatewayWindow, rMinAt, ROLLOUT_CHAIN_T, ROLLOUT_END_S } from '../../../src/world/gen';
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
  it('golden chunk hashes (100 chunks ≈ 3.2 km) for 3 seeds, S_TRENCH off (the M0 default) and on', () => {
    // Update deliberately when the generator changes (TECH §5.4).
    expect(GEN_FLAGS.trench).toBe(false);
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

  it('curb grinds never carry the board into a blocker: each curb edge ends one exit zone before any crash face or pit', () => {
    let curbEdges = 0;
    for (const g of gens) {
      const w = createWorldQuery(g);
      for (const c of w.obstacles(0, 3000)) for (const e of c.edges) {
        if (c.kind !== 'curb') continue;
        curbEdges++;
        const zone = 0.6 * speedAt(tAt(e.a.s)) - 0.05;
        for (const o of w.obstacles(e.a.s - 1, e.b.s + zone + 1)) {
          if (o.kind === 'curb') continue;
          const near = (x0: number, x1: number) => x1 > e.a.x - 1.5 && x0 < e.a.x + 1.5;
          for (const so of o.solids) {
            if (so.top === 'knock' || (so.top === 'landable' && so.box.y1 - e.a.y <= 0.18) || !near(so.box.x0, so.box.x1)) continue;
            expect(so.box.s1 <= e.a.s || so.box.s0 >= e.b.s + zone, `curb ${e.a.s}–${e.b.s} vs ${o.kind} @${so.box.s0}`).toBe(true);
          }
          for (const p of o.pits) if (near(p.x0, p.x1)) expect(p.s1 <= e.a.s || p.s0 >= e.b.s + zone).toBe(true);
        }
      }
    }
    expect(curbEdges).toBeGreaterThan(200);
  });

  it('tall blockers stand 1.15 m above any ground a board touching them can ride on (road bins beside the curb too)', () => {
    let n = 0;
    const groundHi = (x0: number, x1: number) => (x1 > 3.0 || x0 < -3.0 ? 0.15 : 0);
    for (const g of gens) for (const o of createWorldQuery(g).obstacles(0, 3000)) {
      if (o.kind !== 'trash_can' && o.kind !== 'news_box') continue;
      for (const so of o.solids) { n++; expect(so.box.y1 - groundHi(so.box.x0 - 0.2, so.box.x1 + 0.2)).toBeGreaterThanOrEqual(HEIGHT.tallMin - 1e-9); }
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

  it('gate rows (A1/A2 stand-in) come ≤ GEN.gate.gap apart, plus at most one gateway when the gate could not precede it', () => {
    let rows = 0, worst = 0;
    for (const g of gens) {
      const w = createWorldQuery(g);
      const segs = g.segments();
      const rowsT = segs.filter((s) => s.templateId === 'S_GATE').map((s) => {
        const ob = w.obstacles(s.s0, s.s1).find((o) => o.kind === 'trash_can' || o.kind === 'news_box')!;
        return tAt(ob.s);
      });
      for (let i = 1; i < rowsT.length; i++) {
        const a = rowsT[i - 1]!, b = rowsT[i]!;
        const ph = a < 45 ? 'opening' : a < 90 ? 'warm' : a < 150 ? 'build' : 'plateau';
        const gw = segs.some((s) => s.gateway && s.t0 >= a && s.t0 < b);
        const over = b - a - GEN.gate.gap[ph] - (gw ? 4 + GEN.gate.fit : 0);
        worst = Math.max(worst, over);
      }
      rows += rowsT.length;
    }
    expect(rows).toBeGreaterThan(20 * 50);
    expect(worst).toBeLessThanOrEqual(2.0);      // an A3 hazard may take the slot first (its own deadline): ≤ 1.42 s seen
  });

  it('height bands: no solid top in 0.61–1.14 m; full-width hazards ≤ 0.50 m tall and ≤ 0.6 m long; pits ≤ 0.35 s·v', () => {
    let solids = 0;
    for (const g of gens) {
      const w = createWorldQuery(g);
      for (const o of w.obstacles(0, 3000)) {
        for (const so of o.solids) {
          solids++;
          const h = so.box.y1 - so.box.y0;
          expect(h > HEIGHT.forbidMin - 0.005 && h < HEIGHT.forbidMax + 0.005, `${o.kind} ${h}`).toBe(false);
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

  it('A3: a full-width hazard (barrier or trench) at most every 12 s of non-T0 time in the warm phase and later', () => {
    let worst = 0;
    for (const g of gens) {
      const w = createWorldQuery(g);
      const segs = g.segments();
      // A-clock: non-T0 seconds since 9 s.
      const aAt = (t: number) => { let a = 0; for (const s of segs) { if (s.t0 >= t) break; if (s.tier > 0) a += Math.min(t, s.t1) - s.t0; } return a; };
      const fw = w.obstacles(0, 3000).filter((o) => o.tags & ObTag.FullWidth).map((o) => aAt(tAt(o.s)));
      for (let i = 1; i < fw.length; i++) {
        const gap = fw[i]! - fw[i - 1]!;
        if (tAt(sAt(0)) >= 0 && fw[i - 1]! > 0) worst = Math.max(worst, gap);
      }
    }
    expect(worst).toBeLessThanOrEqual(16.5);
  });

  it('coins: most sit on trick lines; the generator rarely re-rolls and (almost) never falls back', () => {
    let segs = 0, rerolls = 0, fallbacks = 0;
    for (const g of gens) {
      const st = g.stats();
      expect(st.trickCoinShare, 'trick coin share').toBeGreaterThan(0.7);   // A5 (≥ 0.75) is WG's static assert
      segs += st.segments; rerolls += st.rerolls; fallbacks += st.fallbacks;
    }
    expect(rerolls / segs).toBeLessThan(0.1);
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

const GOLDEN = [3721521044, 3146777944, 867771022];
const GOLDEN_TRENCH = [1763372308, 491250573, 291711547];
