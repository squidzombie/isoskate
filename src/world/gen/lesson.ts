// world/gen/lesson.ts: the fixed opening segments (DESIGN §12.3, §12.4). No seed involved: identical on every run.
// The Roll-out is the first 9 s of the Lesson Line: carve the coin S-curve, ollie the full-width parking chain at
// 3.5 s (the first required action), grind the granite ledge at x = +2 from 6 s. It ends on the 64 m chunk boundary
// (t ≈ 9.14 s) so its two chunks are byte-identical on every run (renderer cache). game/onboarding.ts times its
// first-run hints from ROLLOUT_CHAIN_T and ROLLOUT_LEDGE (keep their meaning).
// The Lesson Line (mode 'lesson', DESIGN §12.3) continues to 40 s with one fixed part per lesson row; each teaching
// obstacle carries its HintId. The Greenway gateway follows at 40 s.
import { round1cm } from '../../core/math';
import { CHUNK_LEN, LESSON_SEC, sAt, speedAt, tAt } from '../../core/tuning';
import { ObTag } from '../../core/world';
import { GEN, GEN_FLAGS } from './gen.config';
import { buildLedge, buildParkedCar, buildPlanter } from './props/downtown';
import { buildBarrier, buildBench, buildFlatbar, buildHandrail, buildIncline, buildPad, buildTerrace, buildTrench,
  stairDrop, STAIR } from './props/shared';
import type { Template, TemplateCtx, TemplateOut } from './templates/types';
import { edgeCoins, put, sOf } from './templates/util';

export const ROLLOUT_END_S = 2 * CHUNK_LEN;
export const ROLLOUT_CHAIN_T = 3.5, ROLLOUT_CHAIN_H = 0.35;
export const ROLLOUT_LEDGE = { t0: 6.0, t1: 8.4, x: 2.0 } as const;
/** Seed of the Roll-out's decor stream (fixed, so the Roll-out looks the same every run). */
export const ROLLOUT_DECOR_SEED = 0x0d05c1a2;

const lessonOnly = (c: TemplateCtx) => c.id === 'LESSON';

export const ROLLOUT: Template = {
  id: 'ROLLOUT', area: 'fixed', tiers: [0], durMax: 9.2, mirror: false,
  build(c: TemplateCtx): TemplateOut {
    // 0–3 s: an S-curve of 8 coins to carve through.
    for (let k = 0; k < 8; k++) c.coins.add(sAt(0.6 + k * 0.3), 1.6 * Math.sin(k * 0.8), GEN.coins.groundY, 'breather');
    // 3.5 s: the parking chain (full width, 0.35 m).
    const sChain = sAt(ROLLOUT_CHAIN_T);
    const chain = put(c, buildBarrier(sChain, ROLLOUT_CHAIN_H, speedAt(ROLLOUT_CHAIN_T), c.props));
    chain.params = { ...chain.params, chain: 1 };
    if (lessonOnly(c)) c.hint(chain, 'tap');
    // 6–8.4 s: a granite ledge at x = +2 (magnet range from the centre line), coins on top.
    const sL = sAt(ROLLOUT_LEDGE.t0), len = sAt(ROLLOUT_LEDGE.t1) - sL;
    const ledge = put(c, buildLedge(sL, ROLLOUT_LEDGE.x, len, c.props, ObTag.TrickLine));
    if (lessonOnly(c)) c.hint(ledge, 'grind');
    c.coins.string(sAt(ROLLOUT_LEDGE.t0 + 0.3), sAt(ROLLOUT_LEDGE.t1 - 0.2), ROLLOUT_LEDGE.x, 0.45 + GEN.coins.edgeUp, speedAt(6));
    return { t1: tAt(ROLLOUT_END_S) };
  },
};

/** One fixed Lesson Line part: [from, to) in run time and its builder. */
interface LessonPart { to: number; build(c: TemplateCtx): void }

export const LESSON_PARTS: readonly LessonPart[] = [
  // 9.1–13.6: two bench pairs at x = −2; the pick swipe as the edge glows.
  { to: 13.6, build(c) {
    let prev = -1;
    for (const t of [10.0, 10.45, 11.7, 12.15]) {
      const b = put(c, buildBench(sOf(t), -2.0, c.props));
      if (prev >= 0) b.gap = { name: 'Bench Hop', pts: 200, fromObstacle: prev };
      prev = b.id;
      if (t === 10.0) c.hint(b, 'pick');
    }
    c.coins.string(sOf(10.1), sOf(12.4), -2.0, 0.45 + GEN.coins.edgeUp, speedAt(11));
  } },
  // 13.6–17.6: a parked car centre-right; the left ledge continues.
  { to: 17.6, build(c) {
    const car = put(c, buildParkedCar(sOf(14.6), 1.0, c.props, 2));
    c.hint(car, 'avoid');
    const ledge = put(c, buildLedge(sOf(14.2), -2.4, speedAt(14) * 2.2, c.props));
    edgeCoins(c, ledge);
  } },
  // 17.6–21.8: a 5-stair terrace (−0.85) with a centre handrail; flick in the air down it.
  { to: 21.8, build(c) {
    const s = sOf(18.6), len = 5 * STAIR.tread, drop = stairDrop(5);
    const ter = put(c, buildTerrace(s, 5, c.props));
    c.hint(ter, 'flip');
    c.cuts.push([s, s + len]);
    c.datumAt.push({ s: s + len, datum: -drop });
    const rail = put(c, buildHandrail(s, len, 0, 0, drop, c.props));
    c.coins.edge(rail.edges[1]!, 0.02, 0.02);
  } },
  // 21.8–25.8: 3 manual pads (hold = manual).
  { to: 25.8, build(c) {
    const p = c.propsAt(-stairDrop(5));
    for (const [k, t] of [22.5, 23.4, 24.3].entries()) {
      const pad = put(c, buildPad(sOf(t), -1.6, 4.0, p));
      if (k === 0) c.hint(pad, 'manual');
      c.coins.string(pad.s + 0.4, pad.s + pad.len - 0.4, -1.6, -stairDrop(5) + 0.15 + GEN.coins.padUp, speedAt(t));
    }
  } },
  // 25.8–29.8: a rail ladder (transfers).
  { to: 29.8, build(c) {
    const p = c.propsAt(-stairDrop(5));
    let prev = -1;
    for (const [k, x] of [-2.5, 0, 2.5].entries()) {
      const bar = put(c, buildFlatbar(sOf(26.5 + k * 0.75), x, speedAt(27) * 1.05, 0.4, p));
      if (prev >= 0) bar.gap = { name: 'Ladder Transfer', pts: 250, fromObstacle: prev };
      if (k === 1) c.hint(bar, 'transfer');
      prev = bar.id;
      edgeCoins(c, bar);
    }
  } },
  // 29.8–32.8: the 1:10 incline back up 0.85 m (datum payback), coins on the crest; FS 180 on the flat crest.
  { to: 32.8, build(c) {
    const p = c.propsAt(-stairDrop(5));
    const s = sOf(30.2), len = stairDrop(5) / GEN.datum.slope;
    const inc = put(c, buildIncline(s, len, stairDrop(5), p));
    c.hint(inc, 'spin');
    c.cuts.push([s, s + len]);
    c.datumAt.push({ s: s + len, datum: 0 });
    for (let k = 0; k < 5; k++) c.coins.add(s + len + 1.0 + k * 0.9, 0, GEN.coins.groundY, 'breather');
  } },
  // 32.8–36.0: the first full-width pit, with a plank.
  { to: 36.0, build(c) {
    const t = 33.6, s = sOf(t), v = speedAt(t);
    if (GEN_FLAGS.trench) {
      const len = round1cm(0.25 * v);
      const tr = put(c, buildTrench(s, len, [0], v, c.props, GEN.trench.depth, c.layout.bands));
      c.hint(tr, 'pit');
      c.cuts.push([s, s + len]);
      c.coins.arc(tAt(s + len / 2) - 0.3, -2.0, 0);
    } else c.hint(put(c, buildBarrier(s, 0.4, v, c.props)), 'pit');
  } },
  // 36.0–40.0: ledge → bench hop → planter rim mini-line (double coins), then the gateway banks it for you.
  { to: LESSON_SEC, build(c) {
    const l = put(c, buildLedge(sOf(36.6), 2.0, speedAt(36.6) * 0.9, c.props));
    const b = put(c, buildBench(sOf(37.9), 2.0, c.props));
    b.gap = { name: 'Ledge to Bench', pts: 200, fromObstacle: l.id };
    const p = put(c, buildPlanter(sOf(38.7), 2.0, false, c.props));
    p.gap = { name: 'Bench to Planter', pts: 250, fromObstacle: b.id };
    for (const o of [l, b, p]) { edgeCoins(c, o); }
    c.coins.gold(p.s + p.len - 0.5, 2.0, 0.5 + 0.6);
  } },
];

/** The Lesson Line after the Roll-out: one segment per part, in order (the generator passes the part index). */
export function lessonPart(index: number): LessonPart | undefined { return LESSON_PARTS[index]; }
