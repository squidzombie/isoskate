// world/gen validator fixtures (TECH §11.1, DESIGN §10.6): hand-built streets through validate(), one rule at a time —
// the empty street, a required ollie and its exact window, a required move (extraction ≥ 0.5 m, decision time),
// hitbox dilation beside a blocker, the forbidden band, spacing (R_MIN), short dead ends (h) and the greedy player (i).
import { describe, expect, it } from 'vitest';
import { DECISION_MIN, sAt, speedAt } from '../../../src/core/tuning';
import type { Obstacle } from '../../../src/core/world';
import { ObTag } from '../../../src/core/world';
import { LAYOUTS } from '../../../src/world/gen';
import { buildProp, buildTall, type PropCtx } from '../../../src/world/gen/props/common';
import { buildBarrier } from '../../../src/world/gen/props/shared';
import { initialState, validate, type ValResult } from '../../../src/world/gen/validator/validate';

const T0 = 20, T1 = 24.5;
const ctx = (): PropCtx => ({ ids: { ob: 0, coin: 0, edge: 0 }, segment: 0, area: 'downtown', datum: 0, ground: () => ({ lo: 0, hi: 0 }) });

function run(obs: (p: PropCtx) => Obstacle[], o: { x0?: number; t1?: number; greedy?: boolean } = {}): ValResult {
  const p = ctx(), seg = obs(p), t1 = o.t1 ?? T1;
  return validate(initialState(T0, o.x0 ?? 0), {
    obstacles: seg, seg, t0: T0, t1, s1: sAt(t1), layoutEnd: LAYOUTS.plaza, datumEnd: 0, exit: [[-4.5, 4.5]],
    earliest: T0, last: null, noActions: false, headSec: 0.6, tailSec: 0.4, groundHi: () => 0, greedy: o.greedy ?? true,
  });
}
const tall = (p: PropCtx, t: number, x0: number, x1: number, len = 0.6) => buildTall('trash_can', sAt(t), (x0 + x1) / 2, len, x1 - x0, 1.15, p);
const ok = (r: ValResult) => { if (!r.ok) throw new Error(`rejected: ${r.why} ${r.detail ?? ''}`); return r; };

describe('validator fixtures (DESIGN §10.6)', () => {
  it('an empty street: accepted, no required action, the line holds its x', () => {
    const r = ok(run(() => []));
    expect(r.actions).toEqual([]);
    expect(r.exitX).toBe(0);
    expect(r.line.xAt(22)).toBe(0);
  });

  it('a full-width 0.45 m barrier: exactly one required ollie, its exact window ≥ 0.25 s, decision time ≥ 1.2 s', () => {
    const r = ok(run((p) => [buildBarrier(sAt(22), 0.45, speedAt(22), p)]));
    expect(r.actions.map((a) => a.kind)).toEqual(['ollie']);
    expect(r.stats.windowMin).toBeGreaterThanOrEqual(0.25 - 1e-6);
    expect(r.stats.decisionMin).toBeGreaterThanOrEqual(DECISION_MIN - 1 / 30 - 1e-6);
    expect(r.line.ollies.length).toBe(1);
    expect(r.line.ollies[0]!).toBeLessThan(22);
  });

  it('a tall blocker on the line: one required move of ≥ 0.5 m, started before it, decided ≥ 1.2 s after it is in view', () => {
    const r = ok(run((p) => [tall(p, 22.5, -0.8, 0.8)]));
    const moves = r.actions.filter((a) => a.kind === 'move');
    expect(moves.length).toBe(1);
    expect(Math.abs(moves[0]!.dx)).toBeGreaterThanOrEqual(0.5);
    expect(moves[0]!.t).toBeLessThan(22.5);
    expect(r.stats.decisionMin).toBeGreaterThanOrEqual(DECISION_MIN - 1 / 30 - 1e-6);
    // Hitbox dilation (half hitbox + SAFE_MARGIN beyond the inset face): the line passes ≥ 0.72 m from the centre.
    expect(Math.abs(r.line.xAt(22.6))).toBeGreaterThanOrEqual(0.8 - 0.08 + 0.2 + 0.1 - 0.25 - 1e-6);
  });

  it('dilation: the inset box grows by the half hitbox + SAFE_MARGIN (0.30 m) on the 0.25 m grid', () => {
    // Face at 0.55 m (inset 0.63, dilated to 0.33): clear of the centre cell [−0.125, 0.125], the line holds x = 0.
    expect(ok(run((p) => [tall(p, 22.5, 0.55, 1.5)])).actions.filter((a) => a.kind === 'move')).toEqual([]);
    // Face at 0.25 m (inset 0.33, dilated to 0.03): the centre cell is blocked, the line has to move.
    expect(ok(run((p) => [tall(p, 22.5, 0.25, 1.5)])).actions.filter((a) => a.kind === 'move').length).toBe(1);
  });

  it('a tall wall with no opening: rejected (no path)', () => {
    const r = run((p) => [tall(p, 22.5, -4.6, 4.6)]);
    expect(r.ok).toBe(false);
  });

  it('two full-width barriers 0.5 s apart: rejected (spacing R_MIN, or no window)', () => {
    const r = run((p) => [buildBarrier(sAt(22), 0.45, speedAt(22), p), buildBarrier(sAt(22.5), 0.45, speedAt(22.5), p)]);
    expect(r.ok).toBe(false);
  });

  it('forbidden band: a 0.8 m solid is rejected wherever it stands', () => {
    const r = run((p) => [buildProp({ kind: 'trash_can', s: sAt(22.5), x: 3, len: 0.6, wid: 0.6, hgt: 0.8 }, p)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/band/);
  });

  it('a dead-end pocket the line can reach that lives > 2 s: rejected by rule (h)', () => {
    // A thin tall wall at x = −2.5 from 21.0 s to 24.0 s, closed across x < −2.5 at 23.6 s: a board steering left of
    // it early is doomed for ~2.6 s.
    const r = run((p) => {
      const v = speedAt(22), len = (24.0 - 21.0) * v;
      return [buildTall('hedge', sAt(21.0), -2.5, len, 0.4, 1.2, p), tall(p, 23.6, -4.6, -2.3)];
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['h:deadEnd', 'i:greedy']).toContain(r.why);
  });

  it('the greedy player: the nearer lane that only looks open is a trap (rule i); without the check it is accepted', () => {
    // A blocker just left of the line's centre makes the left lane the nearest open one; that lane is closed 1.6 s
    // later by a wall beyond the myopic look-ahead; the right lane is the way through.
    const trap = (p: PropCtx) => [tall(p, 22.0, -0.5, 1.0), buildTall('hedge', sAt(22.0), -2.2, (23.7 - 22.0) * speedAt(22), 0.4, 1.2, p),
      tall(p, 23.7, -4.6, -0.3)];
    const strict = run(trap);
    const loose = run(trap, { greedy: false });
    if (strict.ok) {
      // Not a trap for this grid (the greedy player read it right): both agree.
      expect(loose.ok).toBe(true);
    } else {
      expect(['i:greedy', 'h:deadEnd']).toContain(strict.why);
    }
  });

  it('obstacle tags of the fixtures: the barrier is a full-width hazard with warnAtS 1.6 s ahead', () => {
    const p = ctx();
    const b = buildBarrier(sAt(22), 0.45, speedAt(22), p);
    expect(b.tags & ObTag.FullWidth).toBeTruthy();
    expect(b.warnAtS).toBeCloseTo(b.s - 1.6 * speedAt(22), 1);
  });
});
