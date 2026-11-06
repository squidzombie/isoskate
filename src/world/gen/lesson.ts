// world/gen/lesson.ts: the fixed opening segments (DESIGN §12.3, §12.4).
// The Roll-out is the first 9 s of the Lesson Line, identical every run (no seed involved): carve the coin S-curve,
// ollie the full-width parking chain at 3.5 s (the first required action), grind the granite ledge at x = +2 from 6 s.
// It ends on the 64 m chunk boundary (t ≈ 9.14 s) so its two chunks are byte-identical on every run (renderer cache).
// TODO(WG): the 40 s Lesson Line table (mode 'lesson'); M0 plays the Roll-out in both modes.
import { CHUNK_LEN, tAt, sAt } from '../../core/tuning';
import { ObTag } from '../../core/world';
import { GEN } from './gen.config';
import { buildLedge } from './props/downtown';
import { buildBarrier } from './props/shared';
import type { Template, TemplateCtx, TemplateOut } from './templates/types';

export const ROLLOUT_END_S = 2 * CHUNK_LEN;
export const ROLLOUT_CHAIN_T = 3.5, ROLLOUT_CHAIN_H = 0.35;
export const ROLLOUT_LEDGE = { t0: 6.0, t1: 8.4, x: 2.0 } as const;
/** Seed of the Roll-out's decor stream (fixed, so the Roll-out looks the same every run). */
export const ROLLOUT_DECOR_SEED = 0x0d05c1a2;

export const ROLLOUT: Template = {
  id: 'ROLLOUT', tiers: [0],
  build(c: TemplateCtx): TemplateOut {
    const v = c.v;
    // 0–3 s: an S-curve of 8 coins to carve through.
    for (let k = 0; k < 8; k++) c.coins.add(sAt(0.6 + k * 0.3), 1.6 * Math.sin(k * 0.8), GEN.coins.groundY, 'breather');
    // 3.5 s: the parking chain, ollied from the centre line (take-off 0.3 s before its middle passes under the board).
    const sChain = sAt(ROLLOUT_CHAIN_T);
    const tTake = tAt(sChain + 0.3) - 0.3;
    c.obstacles.push(buildBarrier(sChain, ROLLOUT_CHAIN_H, v, c.props));
    c.line.ollie(tTake);
    c.coins.arc(tTake, 0, 0);
    // 6–8.4 s: a granite ledge at x = +2 (magnet range from the centre line), coins on top.
    const sL = sAt(ROLLOUT_LEDGE.t0), len = sAt(ROLLOUT_LEDGE.t1) - sL;
    const ledge = buildLedge(sL, ROLLOUT_LEDGE.x, len, c.props, 0, ObTag.TrickLine);
    c.obstacles.push(ledge);
    c.coins.edge(sAt(ROLLOUT_LEDGE.t0 + 0.3), sAt(ROLLOUT_LEDGE.t1 - 0.2), ROLLOUT_LEDGE.x, 0.45, v);
    return { t1: tAt(ROLLOUT_END_S) };
  },
};

/** A gateway (T0, 4 s): no required actions, a free wave string (DESIGN §12.2). Area kits arrive with WG/WA. */
export const GATEWAY: Template = {
  id: 'GATEWAY', tiers: [0],
  build(c: TemplateCtx): TemplateOut {
    const t1 = Math.min(c.t0 + (c.dur ?? 4), c.maxT1);
    c.coins.wave(c.t0 + 0.3, t1 - 0.3, c.line.x, GEN.coins.breatherAmp, c.coinRng.range(0, 6.28));
    return { t1 };
  },
};
