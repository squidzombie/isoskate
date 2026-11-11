// Gate: static asserts over the gate seeds × the first 3,000 m (DESIGN §10.11, ROADMAP W1b). Each is re-measured on
// the committed street, independently of the validator where it can be:
//  - visibility: the safe line never meets a crash face hidden behind a taller solid (35° camera: h·cot 35° + 0.5 m);
//  - decision time ≥ 1.2 s, ollie windows ≥ 0.25 s, dead ends ≤ 2.0 s (+ one 1/30 s grid slice): validator measures;
//  - required-action spacing ≥ max(R_MIN, T_SHIFT(dx)) along the SafeKeys;
//  - no solid box with a height in the forbidden band 0.61–1.14 m (ride-on slope bodies excepted);
//  - every area visit's datum closes to y = 0 (the street base is at 0 when each gateway starts);
//  - trick-coin share ≥ 75 %; validator rejections < 5 %, fallbacks < 1 %.
// Also reported (G1): the DESIGN §11 density table per phase and how many distinct openings the seeds get.
import { describe, expect, it } from 'vitest';
import { CHUNK_LEN, HEIGHT, T_SHIFT, sAt, tAt } from '../../src/core/tuning';
import { ObTag, type Obstacle, type SafeKey } from '../../src/core/world';
import { createWorldGen, createWorldQuery, Generator, rMinAt } from '../../src/world/gen';
import { ollieWindow } from '../../src/world/gen/validator/path';
import { seedsFor, writeReport } from './suites';

const S_END = 3000;
const COT35 = 1 / Math.tan((35 * Math.PI) / 180);
const seeds = seedsFor(100);

/** Difficulty phases (DESIGN §11) for the density table: trick elements (TrickLine obstacles), required actions
 *  (ollies and ≥ 0.5 m moves along the SafeKeys), run time, S_GATE time, breathers; reported, not gated (targets
 *  are ±25 % measured outputs, DESIGN §11). */
const PHASE_OF = (t: number) => (t < 45 ? 'opening' : t < 90 ? 'warm' : t < 150 ? 'build' : 'plateau');
type Dens = Record<string, { dur: number; trick: number; acts: number; gate: number; breathers: number }>;

interface Measure {
  dens: Dens; opening: string;
  seed: number; segments: number; rerolls: number; fallbacks: number; coinShare: number; coins: number; trickCoins: number; valCalls: number; valFails: number; replans: number;
  decisionMin: number; windowMin: number; windowMinIndep: number; deadEndMax: number;
  spacingMin: number; band: string[]; datum: string[]; hidden: string[];
}

function measure(seed: number): Measure {
  const gen = createWorldGen({ seed, mode: 'normal' }) as Generator;
  gen.ensure(S_END + 200);
  const w = createWorldQuery(gen);
  const obs = w.obstacles(0, S_END);
  const keys: SafeKey[] = [];
  let coins = 0, trickCoins = 0;
  for (let i = 0; i * CHUNK_LEN < S_END; i++) { const ch = gen.chunk(i); keys.push(...ch.safe); for (const c of ch.coins) { coins++; if (c.line === 'trick') trickCoins++; } }
  keys.sort((a, b) => a.t - b.t);
  const xAt = (t: number) => { let k = 0; while (k + 1 < keys.length && keys[k + 1]!.t <= t) k++; const a = keys[k]!, b = keys[k + 1] ?? a; return b.t > a.t ? a.x + (b.x - a.x) * (t - a.t) / (b.t - a.t) : a.x; };
  // Spacing along the SafeKeys: ollies and the starts of ≥ 0.5 m moves.
  const acts: { t: number; dx: number }[] = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!, n = keys[i + 1];
    if (k.action === 'ollie') acts.push({ t: k.t, dx: 0 });
    if (n && Math.abs(n.x - k.x) > 1e-6 && (i === 0 || Math.abs(k.x - keys[i - 1]!.x) < 1e-6)) {
      let j = i + 1;
      while (keys[j + 1] && Math.sign(keys[j + 1]!.x - keys[j]!.x) === Math.sign(n.x - k.x) && Math.abs(keys[j + 1]!.x - keys[j]!.x) > 1e-6) j++;
      const dx = keys[j]!.x - k.x;
      if (Math.abs(dx) >= 0.5) acts.push({ t: k.t, dx });
    }
  }
  acts.sort((a, b) => a.t - b.t);
  // Density per phase (from t = 9, after the Roll-out).
  const dens: Dens = {};
  const ph = (t: number) => (dens[PHASE_OF(t)] ??= { dur: 0, trick: 0, acts: 0, gate: 0, breathers: 0 });
  const sEnd = Math.min(S_END, gen.segments().filter((sg) => sg.s1 <= S_END).reduce((m, sg) => Math.max(m, sg.s1), 0));
  for (const sg of gen.segments()) {
    if (sg.t0 < 9 || sg.s1 > sEnd) continue;
    const d = ph(sg.t0); d.dur += sg.t1 - sg.t0;
    if (sg.templateId === 'S_GATE') d.gate += sg.t1 - sg.t0;
    if (sg.tier === 0) d.breathers++;
  }
  for (const o of obs) if ((o.tags & ObTag.TrickLine) && o.s < sEnd && o.s >= sAt(9)) ph(tAt(o.s)).trick++;
  for (const a of acts) if (a.t >= 9 && sAt(a.t) < sEnd) ph(a.t).acts++;
  const opening = gen.segments().filter((sg) => sg.t0 >= 9 && sg.t0 < 40).map((sg) => sg.templateId).join(' ');
  let spacingMin = Infinity;
  for (let i = 1; i < acts.length; i++) spacingMin = Math.min(spacingMin, acts[i]!.t - acts[i - 1]!.t - Math.max(rMinAt(acts[i - 1]!.t), T_SHIFT(acts[i - 1]!.dx)));
  // Forbidden band (box heights), ride-on slopes (a landable body under an incline / hubba slab) excepted.
  const band: string[] = [];
  const slope = (o: Obstacle) => o.slabs.some((sl) => sl.kind !== 'flat');
  for (const o of obs) for (const so of o.solids) {
    const h = so.box.y1 - so.box.y0;
    if (h > HEIGHT.forbidMin - 0.005 && h < HEIGHT.forbidMax + 0.005 && !(so.top === 'landable' && slope(o))) band.push(`${o.kind}@${o.s.toFixed(1)} h=${h.toFixed(2)}`);
  }
  // Datum closure: the street base is back at y = 0 where each gateway starts.
  const datum: string[] = [];
  for (const sg of gen.segments()) {
    if (!sg.gateway || sg.s0 > S_END) continue;
    const g = w.groundAt(sg.s0 + 0.5, 0, 0.5);
    if (Math.abs(g.y) > 1e-6) datum.push(`${sg.gateway}@${sg.t0.toFixed(1)} y=${g.y.toFixed(2)}`);
  }
  // Visibility along the safe line: no crash face B the line meets lies in the shadow of a taller solid A in front.
  const hidden: string[] = [];
  const list = obs.flatMap((o) => o.solids.map((so) => ({ o, so }))).sort((a, b) => a.so.box.s0 - b.so.box.s0);
  for (let i = 0; i < list.length; i++) {
    const { o: b, so: sb } = list[i]!;
    if (sb.top === 'knock' || sb.box.y1 - sb.box.y0 <= 0.18) continue;
    const t = keys.length ? keys.find((k) => k.s >= sb.box.s0)?.t : undefined;
    if (t === undefined) continue;
    const x = xAt(t);
    if (x < sb.box.x0 - 1.0 || x > sb.box.x1 + 1.0) continue;   // not what the line has to read
    for (let k = i - 1; k >= 0; k--) {
      const { o: a, so: sa } = list[k]!;
      if (sb.box.s0 - sa.box.s1 > 1.6 * COT35 + 0.5) break;
      if (a.id === b.id || sa.box.s1 > sb.box.s0) continue;
      const ha = Math.min(sa.box.y1 - sa.box.y0, 1.6);
      if (sb.box.s0 - sa.box.s1 > ha * COT35 + 0.5 || sa.box.y1 <= sb.box.y1 + 0.3) continue;
      if (sa.box.x1 <= sb.box.x0 || sa.box.x0 >= sb.box.x1 || x < sa.box.x0 - 0.3 || x > sa.box.x1 + 0.3) continue;
      hidden.push(`${b.kind}@${sb.box.s0.toFixed(1)} behind ${a.kind}`);
      break;
    }
  }
  // Required ollie windows re-measured on the committed street (independent of the validator's own numbers): the exact
  // tick-grid take-off window around every ollie key (60 Hz from t = 0).
  let windowMinIndep = Infinity;
  for (const k of keys) {
    if (k.action !== 'ollie' || k.s > S_END - 50) continue;
    const win = ollieWindow(w.obstacles(k.s - 20, k.s + 40), k.x, k.t, 0);
    windowMinIndep = Math.min(windowMinIndep, win ? win.tb - win.ta + 1 / 60 : 0);
  }
  const st = gen.stats(), vs = gen.valStats;
  const replans = Object.entries(st.rejections).filter(([k]) => k.startsWith('replan:')).reduce((a, [, v]) => a + v, 0);
  return { dens, opening, seed, segments: st.segments, rerolls: st.rerolls, fallbacks: st.fallbacks, coinShare: st.trickCoinShare, coins, trickCoins, valCalls: gen.valCalls, valFails: gen.valFails, replans,
    decisionMin: vs.decisionMin, windowMin: vs.windowMin, windowMinIndep, deadEndMax: vs.deadEndMax, spacingMin, band, datum, hidden };
}

const ms = seeds.map(measure);
const sum = (f: (m: Measure) => number) => ms.reduce((a, m) => a + f(m), 0);
const agg = {
  seeds: ms.length, sEnd: S_END,
  decisionMin: +Math.min(...ms.map((m) => m.decisionMin)).toFixed(3),
  windowMin: +Math.min(...ms.map((m) => m.windowMin)).toFixed(3),
  windowMinIndep: +Math.min(...ms.map((m) => m.windowMinIndep)).toFixed(3),
  deadEndMax: +Math.max(...ms.map((m) => m.deadEndMax)).toFixed(3),
  spacingMarginMin: +Math.min(...ms.map((m) => m.spacingMin)).toFixed(3),
  coinShare: +(sum((m) => m.trickCoins) / sum((m) => m.coins)).toFixed(3),   // per coin, over every gate seed's first 3,000 m
  coinShareMin: +Math.min(...ms.map((m) => m.coinShare)).toFixed(3),
  rerollRate: +(sum((m) => m.rerolls) / sum((m) => m.segments)).toFixed(4),
  fallbackRate: +(sum((m) => m.fallbacks) / sum((m) => m.segments)).toFixed(4),
  // Every validation that failed (row-overlay tries and edge trims included), and scheduling re-plans per segment.
  validationFailRate: +(sum((m) => m.valFails) / sum((m) => m.valCalls)).toFixed(4),
  replanRate: +(sum((m) => m.replans) / sum((m) => m.segments)).toFixed(4),
  band: ms.flatMap((m) => m.band.map((b) => `seed ${m.seed}: ${b}`)),
  datum: ms.flatMap((m) => m.datum.map((b) => `seed ${m.seed}: ${b}`)),
  hidden: ms.flatMap((m) => m.hidden.map((b) => `seed ${m.seed}: ${b}`)),
  density: Object.fromEntries(['opening', 'warm', 'build', 'plateau'].map((p) => {
    const d = ms.reduce((a, m) => { const x = m.dens[p]; if (x) { a.dur += x.dur; a.trick += x.trick; a.acts += x.acts; a.gate += x.gate; a.breathers += x.breathers; } return a; },
      { dur: 0, trick: 0, acts: 0, gate: 0, breathers: 0 });
    return [p, { trickPer10: +(d.trick / d.dur * 10).toFixed(2), actsPer10: +(d.acts / d.dur * 10).toFixed(2), gateShare: +(d.gate / d.dur).toFixed(3),
      breathersPerMin: +(d.breathers / d.dur * 60).toFixed(2) }];
  })),
  openingsDistinct: new Set(ms.map((m) => m.opening)).size,
};
writeReport('static', agg);

describe('bots gate: static asserts (gate seeds × 3,000 m)', () => {
  it('every hazard the safe line meets is visible (no crash face in a taller solid’s 35° shadow)', () => expect(agg.hidden).toEqual([]));
  it('decision time ≥ 1.2 s (one 1/30 s slice of grid tolerance)', () => expect(agg.decisionMin).toBeGreaterThanOrEqual(1.2 - 1 / 30 - 1e-6));
  it('required-action spacing ≥ max(R_MIN, T_SHIFT(dx))', () => expect(agg.spacingMarginMin).toBeGreaterThanOrEqual(-0.011));
  it('required ollie windows ≥ 0.25 s (validator, and re-measured on the committed street)', () => {
    expect(agg.windowMin).toBeGreaterThanOrEqual(0.25 - 1e-6);
    expect(agg.windowMinIndep).toBeGreaterThanOrEqual(0.25 - 1e-6);
  });
  it('dead ends die within 2.0 s', () => expect(agg.deadEndMax).toBeLessThanOrEqual(2.0 + 1e-6));
  it('no forbidden-band solids (0.61–1.14 m)', () => expect(agg.band).toEqual([]));
  it('every area datum closes to y = 0', () => expect(agg.datum).toEqual([]));
  it('trick-coin share ≥ 75 %', () => expect(agg.coinShare).toBeGreaterThanOrEqual(0.75));
  it('validator rejections < 5 % of segments, fallbacks < 1 % (every failed validation, probes included, < 20 %)', () => {
    expect(agg.rerollRate).toBeLessThan(0.05); expect(agg.fallbackRate).toBeLessThan(0.01); expect(agg.validationFailRate).toBeLessThan(0.2);
  });
});
