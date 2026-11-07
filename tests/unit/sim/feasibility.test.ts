// ROADMAP W1a acceptance, feasibility at 7 and 10.5 m/s (DESIGN §6.1 "What fits where"):
//  - every single flip, the 360 Shove-it, the Tre Flip and a 360 spin land clean from a flat ollie with the swipe at
//    +0.18 s (the tick that contains take-off + 0.18 s: the pop tick integrates its own DT, so take-off is the start of
//    that tick; the next tick, +0.19 s, is checked too for every flip);
//  - doubles land clean off a 0.30 m rail pop (pop out of a 50-50, steering away);
//  - triples land clean off a 2.0 m drop.
// Repeat swipes for the upgrades follow 0.10 s apart, like a deliberate flick-flick.
import { describe, expect, it } from 'vitest';
import type { Dir8 } from '../../../src/core/ids';
import type { Sim } from '../../../src/core/sim';
import { DT, sAt } from '../../../src/core/tuning';
import { box, rail } from './fixtures';
import { all, first, make, place, run } from './drive';

const T_SWIPE = 10;                         // ticks after the pop tick: the tick containing take-off + 0.18 s
const GAP = 6;                              // ticks between repeat swipes (0.10 s)

/** Pop at `pop`, then the swipes at pop + at[i]. Returns the land quality (or the crash cause) and the tricks. */
function airTricks(sim: Sim, pop: number, swipes: { at: number; dir: Dir8 }[], extra: (i: number) => object = () => ({})) {
  const ev = run(sim, pop + 120, (i) => {
    const s = swipes.find((w) => pop + w.at === i);
    return { ...(i === pop ? { tap: true } : {}), ...(s ? { swipe: s.dir, swipeFast: true } : {}), ...extra(i) };
  });
  const land = first(ev, 'land');
  return { result: first(ev, 'crash')?.cause ?? land?.quality ?? 'none', flips: all(ev, 'flipStart').map((e) => e.id),
    ups: all(ev, 'flipUpgrade').map((e) => e.to), spins: [...all(ev, 'spinStart').map((e) => e.id), ...all(ev, 'spinUpgrade').map((e) => e.to)],
    ev };
}

const SINGLES: [string, Dir8[]][] = [
  ['popShuvit', ['d']], ['kickflip', ['l']], ['heelflip', ['r']], ['impossible', ['u']], ['varialKickflip', ['dl']],
  ['varialHeelflip', ['dr']], ['hardflip', ['ul']], ['inwardHeelflip', ['ur']], ['shuvit360', ['d', 'd']], ['treFlip', ['dl', 'dl']],
];

describe.each([[0, 7.0], [160, 10.5]])('feasibility at startT %d (%d m/s)', (startT, v) => {
  it.each(SINGLES)('flat ollie: %s lands clean with the swipe at +0.18 s (and +0.19 s)', (id, dirs) => {
    for (const at of [T_SWIPE, T_SWIPE + 1]) {
      const sim = make([], { startT });
      run(sim, 5);
      expect(sim.cur.vel.s).toBeCloseTo(v, 6);
      const r = airTricks(sim, 0, dirs.map((d, i) => ({ at: at + i * GAP, dir: d })));
      expect([...r.flips, ...r.ups].at(-1), `${id} @${at}`).toBe(id);
      expect(['clean', 'perfect'], `${id} @${at}: ${r.result}`).toContain(r.result);
    }
  });

  it('flat ollie: a 360 spin (↗ pop, ↗ at +0.18 s) lands clean, and so does the BS one', () => {
    for (const [dir, id] of [['ur', 'fs360'], ['ul', 'bs360']] as const) {
      const sim = make([], { startT });
      // The ↗ swipe pops the FS 180 on the ground; the repeat at +0.18 s upgrades it to a 360.
      const ev = run(sim, 120, (i) => (i === 0 ? { swipe: dir, swipeFast: true } : i === T_SWIPE ? { swipe: dir, swipeFast: true } : {}));
      expect(all(ev, 'spinUpgrade').map((e) => e.to)).toEqual([id]);
      expect(['clean', 'perfect']).toContain(first(ev, 'land')!.quality);
      expect(first(ev, 'revert')).toBeUndefined();                      // a 360 lands regular
    }
  });

  it('doubles land clean off a 0.30 m rail pop (and a Laser Flip with the swipe at +0.18 s)', () => {
    const sR = sAt(startT + 1.6);
    for (const [id, dirs] of [['doubleKickflip', ['l', 'l']], ['doubleHeelflip', ['r', 'r']], ['laserFlip', ['dr', 'dr']]] as const) {
      const sim = make([rail({ s: sR, x: 0, len: 12, hgt: 0.30 })], { startT });
      let lock = -1;
      run(sim, 200, (i, _s, last) => {
        if (lock < 0 && last.some((e) => e.t === 'grindStart')) lock = i;
        return i === 60 ? { tap: true } : {};
      });
      expect(lock, id).toBeGreaterThan(0);
      // Replay to the lock + 0.3 s, then pop out and steer away from the rail (pops keep their steering): the steering
      // thumb drags left at a human pace (6 m/s, 1.8 m over 0.3 s) while the other finger flicks the flips.
      const sim2 = make([rail({ s: sR, x: 0, len: 12, hgt: 0.30 })], { startT });
      run(sim2, lock + 18, (i) => (i === 60 ? { tap: true } : {}));
      expect(sim2.cur.mode).toBe('grind');
      const r = airTricks(sim2, 0, dirs.map((d, i) => ({ at: T_SWIPE + i * GAP, dir: d })), (i) => (i >= 1 && i <= 18 ? { steerDx: -0.1 } : {}));
      expect(first(r.ev, 'ollie')?.from).toBe('grind');
      expect([...r.flips, ...r.ups].at(-1)).toBe(id);
      expect(first(r.ev, 'land')!.airT).toBeCloseTo(0.65, 2);
      expect(['clean', 'perfect'], `${id}: ${r.result}`).toContain(r.result);
    }
  });

  it('triples land clean off a 2.0 m drop', () => {
    for (const [id, d] of [['tripleKickflip', 'l'], ['tripleHeelflip', 'r']] as const) {
      const sEnd = sAt(startT + 0.6);
      const sim = make([box({ s: sAt(startT) - 5, x: 0, len: sEnd - sAt(startT) + 5, wid: 3, hgt: 2.0, top: 'landable' })], { startT });
      place(sim, { y: 2.0 });
      const popTick = Math.round(0.55 / DT);
      run(sim, popTick);
      expect(sim.cur.p.y).toBeCloseTo(2.0, 6);
      const r = airTricks(sim, 0, [0, 1, 2].map((i) => ({ at: T_SWIPE + i * GAP, dir: d })));
      expect(r.ups).toEqual([id.replace('triple', 'double'), id]);
      expect(first(r.ev, 'land')!.dropH).toBeCloseTo(2.0, 6);
      expect(['clean', 'perfect'], `${id}: ${r.result}`).toContain(r.result);
    }
  });
});

describe('what does not fit (the risk is real)', () => {
  it('a double from a flat ollie at +0.18 s is sketchy; a triple there is too, and a late third flick is refused', () => {
    const dbl = airTricks(make([]), 0, [{ at: T_SWIPE, dir: 'l' }, { at: T_SWIPE + GAP, dir: 'l' }]);
    expect(dbl.ups).toEqual(['doubleKickflip']);
    expect(dbl.result).toBe('sketchy');
    const tri = airTricks(make([]), 0, [0, 1, 2].map((i) => ({ at: T_SWIPE + i * GAP, dir: 'l' as Dir8 })));
    expect(tri.ups).toEqual(['doubleKickflip', 'tripleKickflip']);    // (t + airLeft) / 0.78 = 0.64 ≥ 0.55: allowed
    expect(tri.result).toBe('sketchy');
    // A kickflip started at +0.21 s: the triple could reach only p ≈ 0.51 → refused, the double continues (sketchy,
    // never a bail).
    const late = airTricks(make([]), 0, [12, 18, 24].map((at) => ({ at, dir: 'l' as Dir8 })));
    expect(late.ups).toEqual(['doubleKickflip']);
    expect(late.result).toBe('sketchy');
  });
});
