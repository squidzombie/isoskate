// W1a: near miss, gaps, landmarks, knockables, the soft-wall bump, the edge nudge, the Lesson rewind and pose().
import { describe, expect, it } from 'vitest';
import type { GrindId } from '../../../src/core/ids';
import type { PoseId } from '../../../src/core/view';
import type { SkaterPose } from '../../../src/core/view';
import { DT, LAND, NEAR_MISS, REWIND, sAt } from '../../../src/core/tuning';
import type { Obstacle } from '../../../src/core/world';
import { SCORE, TRICKS } from '../../../src/tricks';
import { box, frame, pit, rail } from './fixtures';
import { all, first, make, place, run } from './drive';

const bin = (x: number, s = 12) => box({ s, x, len: 0.6, wid: 0.6, hgt: 1.15, top: 'crash' });

describe('near miss (DESIGN §7)', () => {
  it('passing within 0.35 m of a crash face pays +25 outside a combo (banked), +75 inside and refreshes the window', () => {
    // Bin body x ∈ [0.5, 1.1], inset face at 0.58; the hitbox edge at x + 0.2.
    const solo = make([bin(0.8)]);
    place(solo, { x: 0.58 - 0.2 - (NEAR_MISS.lat - 0.05) });
    const ev = run(solo, 150);
    expect(all(ev, 'nearMiss')).toHaveLength(1);
    expect(first(ev, 'nearMiss')!.side).toBe(1);
    expect(all(ev, 'bonus').map((b) => `${b.id}:${b.pts}`)).toEqual([`nearMiss:${SCORE.bonus.nearMissSolo}`]);
    expect(solo.score.bonusPts).toBe(SCORE.bonus.nearMissSolo);
    expect(solo.score.combo.active).toBe(false);                       // it does not start a combo

    const far = make([bin(0.8)]);
    place(far, { x: 0.58 - 0.2 - (NEAR_MISS.lat + 0.05) });
    expect(all(run(far, 150), 'nearMiss')).toHaveLength(0);

    // Inside a combo: an ollie lands just before the bin, so the link window is running while the bin passes.
    const combo = make([bin(0.8, 9)]);
    place(combo, { x: 0.58 - 0.2 - 0.2 });
    let windowAtPay = -1;
    const ev2 = run(combo, 150, (i, s, last) => {
      if (last.some((e) => e.t === 'nearMiss')) windowAtPay = s.score.combo.window;
      return i === 20 ? { tap: true } : {};
    });
    expect(all(ev2, 'bonus').filter((b) => b.id === 'nearMiss').map((b) => b.pts)).toEqual([SCORE.bonus.nearMissCombo]);
    expect(windowAtPay).toBeCloseTo(SCORE.linkWindow - DT, 6);        // refreshed on the paying tick (then ticked once)
  });

  it('clearing a crash top by < 0.20 m pays; a side bump on it does not', () => {
    // A 0.45 m barrier (inset top 0.42 + … ) cleared by a flat ollie whose board passes just above it.
    let paid = 0, tries = 0;
    for (let k = 40; k <= 70; k++) {
      const sim = make([box({ s: 10, x: 0, len: 0.4, wid: 3, hgt: 0.9 - 0.08, top: 'crash', kind: 'barrier_low' })]);
      const ev = run(sim, 160, (i) => (i === k ? { tap: true } : {}));
      if (first(ev, 'crash')) continue;
      tries++;
      if (first(ev, 'nearMiss')) paid++;
    }
    expect(tries).toBeGreaterThan(0);
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThan(tries);
    const bump = make([box({ s: 3, x: 1.4, len: 30, wid: 0.6, hgt: 1.3, top: 'crash' })]);
    const ev = run(bump, 300, (i) => (i >= 60 && i < 70 ? { steerDx: 0.3 } : {}));
    expect(all(ev, 'bump').length).toBeGreaterThan(0);
    expect(all(ev, 'nearMiss')).toHaveLength(0);
  });
});

describe('gaps and landmarks (DESIGN §13.3)', () => {
  it('a trench cleared in the air pays its gap once, inside the combo, without a link; rolling the plank does not', () => {
    const trench = (): Obstacle => { const o = pit({ s: 14, len: 2.0 }); o.gap = { name: 'Trench Gap', pts: 200 }; return o; };
    const sim = make([trench()]);
    const kTake = Math.round(((14 + 1.0) / 7 - 0.3) / DT) - 1;
    const ev = run(sim, 260, (i) => (i === kTake ? { tap: true } : {}));
    const gap = all(ev, 'bonus').filter((b) => b.id === 'gap');
    expect(gap.map((b) => `${b.name}:${b.pts}`)).toEqual(['Trench Gap:200']);
    expect(first(ev, 'comboBanked')).toMatchObject({ links: 0, total: Math.round((50 + 200) * 1) });
  });
  it('a hop from one obstacle to another pays the tagged gap (Ledge Hop); a landmark pays once per visit', () => {
    const a = box({ s: 10, x: 0, len: 6, wid: 0.6, hgt: 0.45, top: 'landable', edges: ['l', 'r'] });
    const b = box({ s: 18.5, x: 0, len: 8, wid: 0.6, hgt: 0.45, top: 'landable', edges: ['l', 'r'] });
    b.gap = { name: 'Ledge Hop', pts: 200, fromObstacle: a.id };
    b.landmark = 'Amberlane Seven';
    const sim = make([a, b]);
    let lock = -1;
    const ev = run(sim, 300, (i, _s, last) => {
      if (lock < 0 && last.some((e) => e.t === 'grindStart')) lock = i;
      if (i === 60) return { tap: true };
      return lock >= 0 && i === lock + 42 ? { tap: true } : {};
    });
    const g = all(ev, 'grindStart');
    expect(g).toHaveLength(2);
    expect(g[1]!.transfer).toBe(true);
    expect(all(ev, 'bonus').map((x) => `${x.id}:${x.pts}`)).toEqual(['popOut:50', 'gap:200', 'landmark:300', 'transfer:250']);
    expect(all(ev, 'landmark').map((x) => x.name)).toEqual(['Amberlane Seven']);
  });
  it('knocking a cone pays +10 outside the combo and never slows', () => {
    const sim = make([box({ s: 10, x: 0, len: 0.3, wid: 0.3, hgt: 0.5, top: 'knock' })]);
    const ev = run(sim, 120);
    expect(all(ev, 'knock')).toHaveLength(1);
    expect(sim.score.bonusPts).toBe(SCORE.bonus.knock);
    expect(sim.cur.vel.s).toBeCloseTo(7, 9);
  });
});

describe('landing details (DESIGN §7)', () => {
  it('the edge nudge: a centre landing within 0.15 m of a raised top\'s side edge is moved onto the top', () => {
    const sim = make([box({ s: 8, x: 0, len: 20, wid: 1.0, hgt: 0.3, top: 'landable' })]);
    place(sim, { x: -0.45 });
    const ev = run(sim, 120, (i) => (i === 40 ? { tap: true } : {}));
    expect(first(ev, 'land')!.surface).toBe('granite');
    expect(sim.cur.p.x).toBeCloseTo(-0.5 + LAND.edgeNudge, 6);
    expect(sim.cur.targetX).toBeCloseTo(-0.5 + LAND.edgeNudge, 6);
  });
  it('touching the soft wall is a harmless bump with a wobble, once per contact', () => {
    const sim = make([]);
    const ev = run(sim, 240, (i) => ({ steerDx: i < 10 ? 2 : 0 }));
    expect(all(ev, 'bump').map((b) => `${b.kind}:${b.side}`)).toEqual(['wall:1']);
    expect(first(ev, 'crash')).toBeUndefined();
  });
});

describe('Lesson rewind (RunConfig.rewinds, TECH §6.7)', () => {
  it('a crash rewinds ≥ 1.5 s, at most `rewinds` times, then crashes normally', () => {
    const sim = make([bin(0, 30), bin(0, 70)], { rewinds: 3, mode: 'lesson' });
    const ev = run(sim, 60 * 40);
    const rw = all(ev, 'rewind');
    expect(rw.length).toBe(REWIND.max);
    for (const r of rw) {
      expect((r.tick - r.toTick) * DT).toBeGreaterThanOrEqual(REWIND.sec - 1e-9);
      expect((r.tick - r.toTick) * DT).toBeLessThanOrEqual(REWIND.sec + REWIND.snapEveryTicks * DT + 1e-9);
      expect(r).toMatchObject({ cause: 'slam', kind: 'trash_can' });
    }
    expect(all(ev, 'crash').filter((c) => !c.god)).toHaveLength(1);    // the 4th crash is real
    expect(sim.cur.mode).toBe('crashed');
    expect(first(ev, 'runEnd')).toBeDefined();
  });
  it('snapshot → restore replays a rewind exactly (the ring travels with the snapshot), also into a fresh sim', () => {
    const a = make([bin(0, 30)], { rewinds: 2 });
    run(a, 200);                                                       // the bin is hit at ≈ tick 257
    const snap = a.snapshot();
    const play = (sim: typeof a) => { const h: number[] = [], k: string[] = []; for (let i = 0; i < 200; i++) { for (const e of sim.step(frame())) k.push(e.t); h.push(sim.hash()); } return { h, k }; };
    const one = play(a);
    expect(one.k).toContain('rewind');
    a.restore(snap);
    expect(play(a)).toEqual(one);
    const b = make([bin(0, 30)], { rewinds: 2 });
    b.restore(structuredClone(snap));
    expect(play(b)).toEqual(one);
  });

  it('a rewound run steers around the hazard and goes on; without rewinds the same crash ends the run', () => {
    const sim = make([bin(0, 30)], { rewinds: 1 });
    let rewound = false;
    const ev = run(sim, 60 * 8, (_i, _s, last) => {
      if (last.some((e) => e.t === 'rewind')) rewound = true;
      return rewound ? { steerDx: 0.05 } : {};
    });
    expect(all(ev, 'rewind')).toHaveLength(1);
    expect(sim.cur.mode).not.toBe('crashed');
    const plain = make([bin(0, 30)]);
    run(plain, 60 * 8);
    expect(plain.cur.mode).toBe('crashed');
  });
});

describe('pose() (core/view.ts SkaterPose)', () => {
  const poses = (setup: () => ReturnType<typeof make>, n: number, drive: Parameters<typeof run>[2]) => {
    const sim = setup();
    const out: SkaterPose[] = [];
    run(sim, n, (i, s, last) => { out.push(s.pose()); return drive!(i, s, last); });
    out.push(sim.pose());
    return out;
  };
  it('covers every sim PoseId: roll, carve, pop, tuck, flip, grab, land, manual, noseManual, grind, sketchy, crash', () => {
    const seen = new Set<PoseId>();
    const add = (ps: SkaterPose[]) => ps.forEach((p) => seen.add(p.pose));
    add(poses(() => make([]), 200, (i) => (i === 5 ? { tap: true } : i === 15 ? { swipe: 'l', swipeFast: true } : i === 60 ? { steerDx: 2 } : {})));
    add(poses(() => make([]), 60, (i) => (i === 5 ? { tap: true } : i > 8 && i < 30 ? { hold: true, press: true } : {})));
    add(poses(() => make([]), 200, (i) => (i === 5 ? { tap: true } : i >= 41 && i < 150 ? { manualKey: true, press: true, ...(i === 80 ? { swipe: 'd', swipeFast: true } : {}) } : {})));
    add(poses(() => make([box({ s: 10, x: 0, len: 20, wid: 0.6, hgt: 0.45, top: 'landable', edges: ['l', 'r'] })]), 150, (i) => (i === 60 ? { tap: true } : {})));
    add(poses(() => make([]), 80, (i) => (i === 5 ? { tap: true } : i === 26 ? { swipe: 'l', swipeFast: true } : {})));   // sketchy
    add(poses(() => make([bin(0, 10)]), 120, () => ({})));
    for (const id of ['roll', 'carve', 'pop', 'tuck', 'flip', 'grab', 'land', 'manual', 'noseManual', 'grind', 'sketchy', 'crash'] as PoseId[]) {
      expect(seen.has(id), id).toBe(true);
    }
  });
  it('board rotation is continuous across an upgrade; the Hardflip arcs its pitch; manuals pitch ±12°', () => {
    const ps = poses(() => make([]), 50, (i) => (i === 5 ? { tap: true } : i === 15 || i === 21 ? { swipe: 'l', swipeFast: true } : {}));
    let maxJump = 0;
    for (let i = 1; i < ps.length; i++) {
      if (ps[i]!.pose === 'flip' && ps[i - 1]!.pose === 'flip') maxJump = Math.max(maxJump, Math.abs(ps[i]!.board.roll - ps[i - 1]!.board.roll));
    }
    expect(maxJump).toBeGreaterThan(0);
    expect(maxJump).toBeLessThan(90);                                   // ease-out: the steepest step is ~3× the mean
    expect(Math.max(...ps.map((p) => p.board.roll))).toBeGreaterThan(540);   // on its way to 720 (sketchy from a flat ollie)
    const hard = poses(() => make([]), 40, (i) => (i === 5 ? { tap: true } : i === 15 ? { swipe: 'ul', swipeFast: true } : {}));
    expect(Math.max(...hard.map((p) => p.board.pitch))).toBeGreaterThan(60);
    const man = poses(() => make([]), 80, (i) => (i === 5 ? { tap: true } : i >= 41 ? { manualKey: true, press: true } : {}));
    expect(man.at(-1)!.board.pitch).toBe(12);
  });
  it('spinYaw eases 0 → 180 → (upgrade) 360 without a jump; a finished 180 hands over to fakie, kept through the revert', () => {
    const ps = poses(() => make([]), 50, (i) => (i === 5 ? { swipe: 'ul', swipeFast: true } : i === 10 ? { swipe: 'ul', swipeFast: true } : {}));
    let maxJump = 0;
    for (let i = 1; i < ps.length; i++) if (ps[i]!.spinYaw && ps[i - 1]!.spinYaw) maxJump = Math.max(maxJump, Math.abs(ps[i]!.spinYaw - ps[i - 1]!.spinYaw));
    expect(maxJump).toBeLessThan(40);
    expect(Math.max(...ps.map((p) => p.spinYaw))).toBeGreaterThan(330);
    expect(ps.some((p) => p.fakie)).toBe(false);                        // a 360 lands regular
    const half = poses(() => make([]), 50, (i) => (i === 5 ? { swipe: 'ur', swipeFast: true } : {}));
    const done = half.findIndex((p) => p.fakie);
    expect(done).toBeGreaterThan(0);
    expect(half[done]!.spinYaw).toBe(0);
    expect(Math.abs(half[done - 1]!.spinYaw)).toBeGreaterThan(150);
    expect(half.at(-1)!.fakie).toBe(false);                             // reverted on the ground
  });
  it('every grind has a body yaw; slides sit across the edge', () => {
    for (const g of TRICKS.grinds) {
      const sim = make([box({ s: 10, x: 0, len: 20, wid: 0.6, hgt: 0.45, top: 'landable', edges: ['l', 'r'] })]);
      let opened = -1, pose: SkaterPose | null = null;
      run(sim, 150, (i, s, last) => {
        if (opened < 0 && last.some((e) => e.t === 'pickWindow' && e.open)) opened = i;
        if (s.cur.mode === 'grind' && !pose) pose = s.pose();
        if (i === 60) return { tap: true };
        const k = opened >= 0 ? i - opened : -1;
        return k >= 0 && k < g.input.length ? { swipe: g.input[k]!, swipeFast: true } : {};
      });
      const p = pose as SkaterPose | null;
      expect(p?.grindId, g.id).toBe(g.id as GrindId);
      expect(Math.abs(p!.bodyYaw) === 90, g.id).toBe(g.slide);
    }
  });
});

void rail; void sAt;
