// ROADMAP W1a acceptance: the DESIGN §13.6 worked example played through the real sim on a fixture street scores
// exactly 5,028, and ollie spam (30 ollies) stays at ×1 and banks within 2.5 s of the last link-adding trick.
//   Ollie 50 · 50-50 1.2 s 280 · Pop-out Kickflip Perfect 188 + Pop-out 50 · Manual 1.5 s 225 · Ollie (×0.7) 35 ·
//   Boardslide 0.8 s 265 → 1,093 × 4 links × 1.15 (5 names) = 5,028.
// Ledge A carries the 50-50, the pop-out kickflip lands on its top, the manual runs there and the ollie leaves its
// end for ledge B (Boardslide picked early, so no Perfect Lock), which ends after exactly 48 ticks of grinding.
// Ledge B's position and length are found by replaying the same inputs (the run up to them is identical).
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/core/events';
import type { Sim } from '../../../src/core/sim';
import { DT, sAt } from '../../../src/core/tuning';
import { SCORE } from '../../../src/tricks';
import { box } from './fixtures';
import { all, first, make, run, scored, type Drive } from './drive';

const POP = 60;
const ledge = (s: number, len: number) => box({ s, x: 0, len, wid: 0.6, hgt: 0.45, top: 'landable', edges: ['l', 'r'] });

interface Plan { lock: number; popOut: number; flip: number; land: number; manual: number; ollie: number }
/** The scripted inputs, keyed on the events as they happen. */
function script(flipAfter: number) {
  const p: Plan = { lock: -1, popOut: -1, flip: -1, land: -1, manual: -1, ollie: -1 };
  let pickOpenSeen = false, picked = false;
  const drive: Drive = (i, sim, last) => {
    for (const e of last) {
      if (e.t === 'grindStart' && p.lock < 0) { p.lock = i - 1; p.popOut = p.lock + 73; }
      if (e.t === 'land' && p.land < 0 && p.popOut >= 0) { p.land = i - 1; p.manual = i; p.ollie = p.manual + 90; }
      if (e.t === 'pickWindow' && e.open && p.ollie >= 0 && i > p.ollie) pickOpenSeen = true;
    }
    if (i === POP) return { tap: true };
    if (i === p.popOut) { p.flip = i + flipAfter; return { tap: true }; }
    if (i === p.flip) return { swipe: 'l', swipeFast: true };
    if (p.manual >= 0 && i >= p.manual && i < p.ollie) return { manualKey: true, press: true };
    if (i === p.ollie) return { tap: true };
    if (pickOpenSeen && !picked) { picked = true; return { swipe: 'l', swipeFast: true }; }
    void sim;
    return {};
  };
  return { p, drive };
}

function play(aEnd: number, bS: number, bLen: number, flipAfter = 15): { sim: Sim; ev: GameEvent[]; p: Plan } {
  const sim = make([ledge(10, aEnd - 10), ledge(bS, bLen)]);
  const { p, drive } = script(flipAfter);
  const ev = run(sim, 900, drive);
  return { sim, ev, p };
}

describe('DESIGN §13.6 worked example through the sim', () => {
  it('scores exactly 5,028', () => {
    // Pass 1: where is the skater when it ollies off ledge A's top? (A long, B far away.)
    const p1 = play(200, 400, 10);
    expect(p1.p.ollie).toBeGreaterThan(0);
    const sOllie = sAt((p1.p.ollie + 1) * DT);
    // Pass 2: A ends 1 m after the ollie, B starts where the arc comes down onto it. Find B's lock tick.
    const bS = sOllie + 3.0, aEnd = sOllie + 1.0;
    const p2 = play(aEnd, bS, 30);
    const lockB = all(p2.ev, 'grindStart')[1]!;
    expect(lockB.id).toBe('boardslide');
    // Pass 3: B's edge ends so that the boardslide lasts exactly 48 ticks (0.8 s), ending with the auto-hop.
    const endS = sAt((lockB.tick + 48) * DT) - 1e-3;
    const { ev } = play(aEnd, bS, endS - bS);
    const grinds = all(ev, 'grindEnd');
    expect(grinds.map((g) => [g.id, Math.round(g.dur / DT), g.exit])).toEqual([['fiftyFifty', 72, 'pop'], ['boardslide', 48, 'end']]);
    expect(first(ev, 'land')!.quality).toBe('perfect');
    expect(all(ev, 'manualEnd').map((m) => [m.kind, Math.round(m.dur / DT), m.reason])).toEqual([['manual', 90, 'pop']]);
    expect(scored(ev)).toEqual(['ollie:50', 'fiftyFifty:280', 'kickflip:188', 'manual:225', 'ollie:35', 'boardslide:265']);
    expect(all(ev, 'bonus').map((b) => `${b.id}:${b.pts}`)).toEqual(['popOut:50']);
    const banked = all(ev, 'comboBanked');
    expect(banked).toHaveLength(1);
    expect(banked[0]).toMatchObject({ total: 5028, links: 4, reason: 'window', coins: 4 });
    expect(banked[0]!.variety).toBeCloseTo(0.15, 12);
    expect(first(ev, 'crash')).toBeUndefined();
  });
});

describe('ollie spam', () => {
  it('30 ollies in a row stay at ×1 and bank within 2.5 s of the last link-adding trick', () => {
    // A kickflip on the first ollie, then 29 plain ollies, each tapped in the last 0.15 s of air (the jump buffer).
    const sim = make([]);
    let ollies = 0, flipTick = -1;
    const ev = run(sim, 60 * 30, (i, s, last) => {
      ollies += last.filter((e) => e.t === 'ollie').length;
      if (i === 10) return { tap: true };
      if (i === 20 && flipTick < 0) { flipTick = s.cur.tick + 1; return { swipe: 'l', swipeFast: true }; }
      if (ollies < 30 && s.cur.mode === 'air' && s.cur.airLeft <= 0.1) return { tap: true };
      return {};
    });
    expect(all(ev, 'ollie')).toHaveLength(30);
    const banks = all(ev, 'comboBanked');
    expect(banks.length).toBeGreaterThan(5);
    for (const b of banks) expect(Math.max(1, b.links)).toBe(1);
    // The first combo (kickflip + ollies) banks on heat, 2.5 s after the kickflip started.
    expect(banks[0]!.reason).toBe('heat');
    expect((banks[0]!.tick - flipTick) * DT).toBeLessThanOrEqual(SCORE.heat + DT);
    // Every later combo is ollies only: no link-adding trick at all, so it banks 2.5 s after it began.
    for (let i = 1; i < banks.length; i++) {
      expect(banks[i]!.reason).toBe('heat');
      expect(banks[i]!.durSec).toBeLessThanOrEqual(SCORE.heat + DT);
    }
  });
});
