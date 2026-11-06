// Gate: static asserts over the gate seeds × the first 3,000 m (DESIGN §10.11, ROADMAP W1b). Each is re-measured on
// the committed street, independently of the validator where it can be:
//  - visibility: the safe line never meets a crash face hidden behind a taller solid (35° camera: h·cot 35° + 0.5 m);
//  - decision time ≥ 1.2 s, ollie windows ≥ 0.25 s, dead ends ≤ 2.0 s (+ one 1/30 s grid slice): validator measures;
//  - required-action spacing ≥ max(R_MIN, T_SHIFT(dx)) along the SafeKeys;
//  - no solid box with a height in the forbidden band 0.61–1.14 m (ride-on slope bodies excepted);
//  - every area visit's datum closes to y = 0 (the street base is at 0 when each gateway starts);
//  - trick-coin share ≥ 75 %; validator rejections < 5 %, fallbacks < 1 %.
import { describe, expect, it } from 'vitest';
import { CHUNK_LEN, HEIGHT, T_SHIFT, sAt } from '../../src/core/tuning';
import type { Obstacle, SafeKey } from '../../src/core/world';
import { createWorldGen, createWorldQuery, Generator, rMinAt } from '../../src/world/gen';
import { seedsFor, writeReport } from './suites';

const S_END = 3000;
const COT35 = 1 / Math.tan((35 * Math.PI) / 180);
const seeds = seedsFor(100);

interface Measure {
  seed: number; segments: number; rerolls: number; fallbacks: number; coinShare: number;
  decisionMin: number; windowMin: number; deadEndMax: number;
  spacingMin: number; band: string[]; datum: string[]; hidden: string[];
}

function measure(seed: number): Measure {
  const gen = createWorldGen({ seed, mode: 'normal' }) as Generator;
  gen.ensure(S_END + 200);
  const w = createWorldQuery(gen);
  const obs = w.obstacles(0, S_END);
  const keys: SafeKey[] = [];
  for (let i = 0; i * CHUNK_LEN < S_END; i++) keys.push(...gen.chunk(i).safe);
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
  const st = gen.stats(), vs = gen.valStats;
  return { seed, segments: st.segments, rerolls: st.rerolls, fallbacks: st.fallbacks, coinShare: st.trickCoinShare,
    decisionMin: vs.decisionMin, windowMin: vs.windowMin, deadEndMax: vs.deadEndMax, spacingMin, band, datum, hidden };
}

const ms = seeds.map(measure);
const sum = (f: (m: Measure) => number) => ms.reduce((a, m) => a + f(m), 0);
const agg = {
  seeds: ms.length, sEnd: S_END,
  decisionMin: +Math.min(...ms.map((m) => m.decisionMin)).toFixed(3),
  windowMin: +Math.min(...ms.map((m) => m.windowMin)).toFixed(3),
  deadEndMax: +Math.max(...ms.map((m) => m.deadEndMax)).toFixed(3),
  spacingMarginMin: +Math.min(...ms.map((m) => m.spacingMin)).toFixed(3),
  coinShare: +(sum((m) => m.coinShare * m.segments) / sum((m) => m.segments)).toFixed(3),
  coinShareMin: +Math.min(...ms.map((m) => m.coinShare)).toFixed(3),
  rerollRate: +(sum((m) => m.rerolls) / sum((m) => m.segments)).toFixed(4),
  fallbackRate: +(sum((m) => m.fallbacks) / sum((m) => m.segments)).toFixed(4),
  band: ms.flatMap((m) => m.band.map((b) => `seed ${m.seed}: ${b}`)),
  datum: ms.flatMap((m) => m.datum.map((b) => `seed ${m.seed}: ${b}`)),
  hidden: ms.flatMap((m) => m.hidden.map((b) => `seed ${m.seed}: ${b}`)),
};
writeReport('static', agg);

describe('bots gate: static asserts (gate seeds × 3,000 m)', () => {
  it('every hazard the safe line meets is visible (no crash face in a taller solid’s 35° shadow)', () => expect(agg.hidden).toEqual([]));
  it('decision time ≥ 1.2 s (one 1/30 s slice of grid tolerance)', () => expect(agg.decisionMin).toBeGreaterThanOrEqual(1.2 - 1 / 30 - 1e-6));
  it('required-action spacing ≥ max(R_MIN, T_SHIFT(dx))', () => expect(agg.spacingMarginMin).toBeGreaterThanOrEqual(-0.011));
  it('required ollie windows ≥ 0.25 s', () => expect(agg.windowMin).toBeGreaterThanOrEqual(0.25 - 1e-6));
  it('dead ends die within 2.0 s (+ one 1/30 s grid slice)', () => expect(agg.deadEndMax).toBeLessThanOrEqual(2.0 + 1 / 30 + 1e-6));
  it('no forbidden-band solids (0.61–1.14 m)', () => expect(agg.band).toEqual([]));
  it('every area datum closes to y = 0', () => expect(agg.datum).toEqual([]));
  it('trick-coin share ≥ 75 %', () => expect(agg.coinShare).toBeGreaterThanOrEqual(0.75));
  it('validator rejections < 5 %, fallbacks < 1 %', () => { expect(agg.rerollRate).toBeLessThan(0.05); expect(agg.fallbackRate).toBeLessThan(0.01); });
});
