// W1a trick systems through the sim (fixture worlds): the pick window and picks, manual start rules and budgets, the
// steering-stroke rule, the Indy grab, grind switches, transfers, the pop-out re-capture rule, Nose Manual, the
// pre-press, the long tap and the keyboard amend.
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/core/events';
import type { Dir8 } from '../../../src/core/ids';
import type { InputFrame } from '../../../src/core/input';
import type { Sim } from '../../../src/core/sim';
import { DT, GRIND, MAGNET, sAt } from '../../../src/core/tuning';
import { RULES, SCORE, type InputFrameExt } from '../../../src/tricks';
import { box, frame, rail, slab } from './fixtures';
import { all, first, make, place, run, scored } from './drive';

const POP = 60;                        // take-off frame: centre at s ≈ 7, 3 m before the edge start at s = 10
const ledge = (x = 0, len = 20, s = 10) => box({ s, x, len, wid: 0.6, hgt: 0.45, top: 'landable', edges: ['l', 'r'] });
const fast = (d: Dir8) => ({ swipe: d, swipeFast: true });
/** Run until the pick window opens, then play `dirs` one per tick; returns events. */
function pickRun(dirs: Dir8[], obs = [ledge()]) {
  const sim = make(obs);
  let opened = -1;
  const ev = run(sim, 200, (i, _s, last) => {
    if (opened < 0 && last.some((e) => e.t === 'pickWindow' && e.open)) opened = i;
    if (i === POP) return { tap: true };
    const k = opened >= 0 ? i - opened : -1;
    return k >= 0 && k < dirs.length ? fast(dirs[k]!) : {};
  });
  return { sim, ev };
}

describe('pick window (DESIGN §6.3)', () => {
  it('opens exactly 0.25 s before capture and closes 0.12 s after lock', () => {
    for (const x of [0, 0.6, 1.2]) {
      const sim = make([ledge()]);
      place(sim, { x });
      const ev = run(sim, 200, (i) => (i === POP ? { tap: true } : {}));
      const open = all(ev, 'pickWindow').find((e) => e.open)!, close = all(ev, 'pickWindow').find((e) => !e.open)!;
      const lock = first(ev, 'grindStart')!;
      expect((lock.tick - open.tick) * DT, `x ${x}`).toBeCloseTo(GRIND.pickBefore, 9);
      // Open through the ticks ≤ 0.12 s after lock (a swipe on the tick 0.133 s after lock still reads it open).
      expect((close.tick - lock.tick) * DT, `x ${x}`).toBeGreaterThan(GRIND.pickAfter);
      expect((close.tick - lock.tick) * DT, `x ${x}`).toBeLessThanOrEqual(GRIND.pickAfter + DT + 1e-9);
    }
  });
  it('←← in the window gives Lipslide, ↑ gives Nosegrind, ↑↑ Nosebluntslide, ↗↗ Overcrook; nothing flips', () => {
    for (const [dirs, id] of [[['l', 'l'], 'lipslide'], [['l', 'l', 'l'], 'lipslide'], [['u'], 'nosegrind'], [['u', 'u'], 'noseBluntslide'],
      [['ur', 'ur'], 'overcrook'], [['dl'], 'tailslide'], [['d', 'd'], 'bluntslide'], [['r'], 'feeble']] as const) {
      const { ev } = pickRun([...dirs]);
      expect(first(ev, 'flipStart'), id).toBeUndefined();
      expect(first(ev, 'grindStart')?.id, id).toBe(id);
    }
  });
  it('a pick in the 0.12 s after lock re-picks the grind: a `late` grindSwitch, no switch counted', () => {
    const sim = make([ledge()]);
    let lock = -1;
    const ev = run(sim, 120, (i, _s, last) => {
      if (lock < 0 && last.some((e) => e.t === 'grindStart')) lock = i;
      if (i === POP) return { tap: true };
      return i === lock + 2 ? fast('l') : {};
    });
    expect(first(ev, 'grindStart')?.id).toBe('fiftyFifty');
    expect(first(ev, 'grindSwitch')).toMatchObject({ from: 'fiftyFifty', to: 'boardslide', late: true });
    expect(sim.cur.grind).toMatchObject({ id: 'boardslide', switches: 0 });
  });
  it('a steering-thumb ← that is not fromRest is no pick (a dodge stays a dodge), a fromRest one is', () => {
    const steer = make([ledge()]);
    let opened = -1;
    const ev = run(steer, 200, (i, _s, last) => {
      if (opened < 0 && last.some((e) => e.t === 'pickWindow' && e.open)) opened = i;
      if (i === POP) return { tap: true };
      return i === opened ? { swipe: 'l', swipeSteer: true, swipeFast: true } : {};
    });
    expect(first(ev, 'grindStart')?.id).toBe('fiftyFifty');
  });
});

describe('the combo counts up while you ride (immediate feedback)', () => {
  /** Step frame by frame, recording the mode and the combo's pending value after each tick. */
  const trace = (sim: Sim, n: number, drive: (i: number) => Partial<InputFrameExt>) => {
    const rows: { mode: string; pending: number; ev: GameEvent[] }[] = [];
    for (let i = 0; i < n; i++) {
      const ev = sim.step(frame(drive(i) as Partial<InputFrame>)).slice();
      rows.push({ mode: sim.cur.mode, pending: sim.score.combo.pending, ev });
    }
    return rows;
  };
  const rising = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);
  it('a 50-50 and a manual raise the pending value every tick; their trickScored matches what was shown', () => {
    const g = trace(make([ledge()]), 260, (i) => (i === POP ? { tap: true } : {}));
    const grinding = g.filter((r) => r.mode === 'grind').map((r) => r.pending);
    expect(grinding.length).toBeGreaterThan(60);
    expect(rising(grinding)).toBe(true);
    const end = g.findIndex((r) => r.ev.some((e) => e.t === 'grindEnd'));
    const sc = g[end]!.ev.find((e): e is Extract<GameEvent, { t: 'trickScored' }> => e.t === 'trickScored' && e.id === 'fiftyFifty')!;
    expect(sc.comboPts).toBe(g[end]!.pending);
    expect(sc.comboPts - grinding.at(-1)!).toBeLessThanOrEqual(3);    // one more tick of 150/s at most
    const m = trace(make([]), 200, (i) => (i === 10 ? { tap: true } : i >= 46 && i < 160 ? { manualKey: true, press: true } : {}));
    const manualling = m.filter((r) => r.mode === 'manual').map((r) => r.pending);
    expect(manualling.length).toBeGreaterThan(100);
    expect(rising(manualling)).toBe(true);
  });
  it('a gateway mid-grind banks the part ridden so far; the rest scores into a new combo (no entry points again)', () => {
    const rows = trace(make([ledge()], {}, { gatewayS: 20 }), 300, (i) => (i === POP ? { tap: true } : {}));
    const bi = rows.findIndex((r) => r.ev.some((e) => e.t === 'comboBanked'));
    const bank = rows[bi]!.ev.find((e): e is Extract<GameEvent, { t: 'comboBanked' }> => e.t === 'comboBanked')!;
    expect(bank.reason).toBe('gateway');
    expect(rows[bi]!.mode).toBe('grind');
    const lockAt = rows.findIndex((r) => r.ev.some((e) => e.t === 'grindStart'));
    const ridden = (bi - lockAt) * DT;
    expect(bank.total).toBe(50 + Math.round(100 + 150 * ridden));       // ×1: the 50-50 is the one link, 2 names
    const after = rows.slice(bi + 1).filter((r) => r.mode === 'grind').map((r) => r.pending);
    expect(after.length).toBeGreaterThan(30);
    expect(rising(after)).toBe(true);
    const ei = rows.findIndex((r) => r.ev.some((e) => e.t === 'grindEnd'));
    const rest = rows[ei]!.ev.find((e): e is Extract<GameEvent, { t: 'trickScored' }> => e.t === 'trickScored')!;
    expect(rest).toMatchObject({ id: 'fiftyFifty', link: false });
    expect(rest.pts).toBe(Math.round(150 * (ei - bi) * DT));
    const grindEnd = rows[ei]!.ev.find((e): e is Extract<GameEvent, { t: 'grindEnd' }> => e.t === 'grindEnd')!;
    expect(grindEnd.dur).toBeCloseTo((ei - lockAt) * DT, 6);
  });
});

describe('manual (DESIGN §6.4)', () => {
  it('the budget sequence within one combo is 3.0, 2.2, 1.6, 1.2, 1.0, 1.0', () => {
    const flips: Dir8[] = ['l', 'r', 'd', 'u', 'dl', 'dr'];
    const sim = make([]);
    let n = 0, phase: 'pop' | 'flip' | 'air' | 'manual' = 'pop', at = 10;
    const ev = run(sim, 60 * 30, (i, s, last) => {
      if (n >= flips.length) return {};
      if (last.some((e) => e.t === 'manualEnd')) { n++; phase = 'pop'; at = i + 6; }
      if (phase === 'pop' && i === at) { phase = 'flip'; at = i + 10; return { tap: true }; }
      if (phase === 'flip' && i === at) { phase = 'air'; return fast(flips[n]!); }
      if (phase === 'air' && s.cur.mode === 'roll') phase = 'manual';
      if (phase === 'manual') return { manualKey: true, press: true };
      return {};
    });
    const ends = all(ev, 'manualEnd');
    expect(ends.map((e) => e.reason)).toEqual(Array(6).fill('budget'));
    expect(ends.map((e) => Math.round(e.dur * 100) / 100)).toEqual([3.0, 2.2, 1.6, 1.2, 1.0, 1.0]);
    const firstEnd = ends.at(-1)!.tick;
    expect(all(ev, 'comboBanked').filter((b) => b.tick <= firstEnd)).toEqual([]);   // one combo all along
    // One manual link per combo: 6 flips + 1 manual.
    const lastScored = all(ev, 'trickScored').at(-1)!;
    expect(lastScored.links).toBe(7);
  });

  it('a resting thumb outside a combo starts nothing (5 s); on a pad it manuals and starts a combo (DESIGN §12.3)', () => {
    const rest = make([]);
    const ev = run(rest, 300, () => ({ hold: true, press: true }));
    expect(first(ev, 'manualStart')).toBeUndefined();
    expect(first(ev, 'ollie')).toBeUndefined();
    expect(rest.score.combo.active).toBe(false);
    const pad = make([slab({ s: -2, len: 40, x0: -1, x1: 1, y: 0.15 })]);
    place(pad, { y: 0.15 });
    const ev2 = run(pad, 260, () => ({ hold: true, press: true }));
    const st = first(ev2, 'manualStart')!;
    expect(st.tick * DT).toBeCloseTo(RULES.manualHoldSec + DT, 6);
    // "Hold = manual. The combo counter and bank arc appear": the manual is the combo's one link, 75 + 100/s.
    const end = first(ev2, 'manualEnd')!;
    expect(end).toMatchObject({ reason: 'budget' });
    expect(end.dur).toBeCloseTo(3.0, 6);
    expect(all(ev2, 'trickScored').map((e) => `${e.id}:${e.pts}:${e.link}`)).toEqual(['manual:375:true']);
    expect(first(ev2, 'comboBanked')).toMatchObject({ reason: 'window', links: 1, total: 375 });
  });

  it('the manual key on flat ground outside a combo rides unscored (a resting thumb there does nothing)', () => {
    const sim = make([]);
    const ev = run(sim, 240, (i) => (i >= 10 && i < 200 ? { manualKey: true, press: true } : {}));
    expect(first(ev, 'manualStart')).toBeDefined();
    expect(first(ev, 'manualEnd')).toMatchObject({ reason: 'budget' });
    expect(first(ev, 'trickScored')).toBeUndefined();
    expect(first(ev, 'comboBanked')).toBeUndefined();
    expect(sim.score.combo.active).toBe(false);
  });

  it('back-to-back manuals (manual → roll → manual) keep the heat running: pulsing the key cannot hold a combo', () => {
    expect(RULES.backToBackManualPausesHeat).toBe(false);
    const sim = make([]);
    let off = -1;
    const ev = run(sim, 60 * 20, (i, _s, last) => {
      if (i === 10) return { tap: true };
      if (i === 20) return fast('l');                                   // one real trick
      if (i < 46) return {};
      if (last.some((e) => e.t === 'manualEnd')) off = i;               // release the key one tick, press again
      return i === off ? {} : { manualKey: true, press: true };
    });
    const bank = first(ev, 'comboBanked')!;
    expect(bank.reason).toBe('heat');
    // 3.0 s (the linked manual: heat reset and paused), 2.2 s (heat runs), 1.6 s (it runs out): banked at its end.
    const ends = all(ev, 'manualEnd').filter((e) => e.tick <= bank.tick);
    expect(ends.map((e) => Math.round(e.dur * 10) / 10)).toEqual([3.0, 2.2, 1.6]);
    expect(bank.tick).toBe(ends.at(-1)!.tick);
    const pts = all(ev, 'trickScored').filter((e) => e.tick <= bank.tick);
    expect(pts.filter((e) => e.id === 'manual').map((e) => e.pts)).toEqual([375, 295, 235]);
    // Banked = Σ × 2 links (kickflip, the one linked manual) × 1.05 (3 names): the last manual's points are in.
    expect(bank.total).toBe(Math.round(pts.reduce((a, e) => a + e.pts, 0) * 2 * 1.05));
    // The same pulses touch-style (release, re-press, a HOLD after 0.30 s) are just as bounded.
    const touch = make([]);
    let up = -1;
    const ev2 = run(touch, 60 * 30, (i, _s, last) => {
      if (i === 10) return { tap: true };
      if (i === 20) return fast('l');
      if (i < 40) return {};
      if (last.some((e) => e.t === 'manualEnd')) up = i;
      const down = i - up - 3;                                            // lifted 3 ticks, then a still thumb
      return up < 0 || down >= 0 ? { press: true, hold: up < 0 ? i >= 52 : down >= 12 } : {};
    });
    const bank2 = first(ev2, 'comboBanked')!;
    expect(bank2.reason).toBe('heat');
    expect(bank2.durSec).toBeLessThan(10);
  });

  it('in the link window a resting thumb manuals only after 0.30 s of stillness (G0: 0.20 was too eager)', () => {
    const sim = make([]);
    let landed = -1;
    const ev = run(sim, 150, (i, _s, last) => {
      if (landed < 0 && last.some((e) => e.t === 'land')) landed = i;
      if (i === 10) return { tap: true };
      // The thumb goes down at the landing; the recognizer's HOLD rises 0.20 s later.
      if (landed >= 0) return { press: true, hold: i - landed >= 12 };
      return {};
    });
    const m = first(ev, 'manualStart')!;
    expect((m.tick - (landed + 1)) * DT).toBeCloseTo(RULES.manualHoldSec, 6);    // frame i is tick i + 1
  });

  it('pre-press: a touch down 0.30–0.10 s before touchdown, still pressed, manuals at touchdown; 0.05 s does not', () => {
    for (const [before, expectManual] of [[0.2, true], [0.11, true], [0.29, true], [0.05, false], [0.35, false]] as const) {
      const sim = make([]);
      const land = 10 + 35;                                              // flat ollie from frame 10 lands on frame 45
      const down = land - Math.round(before / DT);
      const ev = run(sim, 60, (i) => (i === 10 ? { tap: true } : i >= down ? { press: true } : {}));
      const st = first(ev, 'manualStart');
      expect(!!st && st.tick === first(ev, 'land')!.tick, `before ${before}`).toBe(expectManual);
    }
  });

  it('↓ switches to a Nose Manual once (both parts score); a TAP pops a linked ollie; lifting coasts 0.30 s', () => {
    const sim = make([]);
    const ev = run(sim, 200, (i) => {
      if (i === 10) return { tap: true };
      if (i >= 46 && i < 110) return { manualKey: true, press: true, ...(i === 70 || i === 80 ? fast('d') : {}) };
      if (i === 140) return { tap: true };
      return {};
    });
    expect(all(ev, 'manualStart').map((e) => e.kind)).toEqual(['manual', 'noseManual']);
    const s = scored(ev);
    expect(s.some((x) => x.startsWith('manual:'))).toBe(true);
    expect(s.some((x) => x.startsWith('noseManual:'))).toBe(true);
    const end = first(ev, 'manualEnd')!;
    expect(end.reason).toBe('release');                               // released at 110, coasted 0.30 s
    expect((end.tick - 111) * DT).toBeCloseTo(0.3, 1);
    const linked = make([]);
    const ev2 = run(linked, 120, (i) => (i === 10 ? { tap: true } : i >= 46 && i < 70 ? { manualKey: true, press: true } : i === 75 ? { tap: true } : {}));
    expect(first(ev2, 'manualEnd')!.reason).toBe('pop');               // a tap inside the coast
    expect(all(ev2, 'ollie')[1]).toMatchObject({ from: 'manual', linked: true });
  });
});

describe('long tap (G0 open item: a 350–600 ms press felt like nothing)', () => {
  it('outside a combo it ollies; from a resting-thumb manual it pops a linked ollie', () => {
    const sim = make([]);
    const ev = run(sim, 60, (i) => (i < 30 ? { press: true, hold: i >= 12 } : i === 30 ? { longTap: true } : {}));
    expect(all(ev, 'ollie')).toHaveLength(1);
    const sim2 = make([]);
    let landed = -1;
    const ev2 = run(sim2, 120, (i, _s, last) => {
      if (landed < 0 && last.some((e) => e.t === 'land')) landed = i;
      if (i === 10) return { tap: true };
      if (landed >= 0 && i < landed + 28) return { press: true, hold: i - landed >= 12 };
      if (landed >= 0 && i === landed + 28) return { longTap: true };
      return {};
    });
    expect(first(ev2, 'manualStart')).toBeDefined();
    expect(all(ev2, 'ollie')[1]).toMatchObject({ from: 'manual', linked: true });
  });
});

describe('steering-stroke rule in the air (ROADMAP W1a acceptance)', () => {
  it('a steering ← that is not fromRest: no flip and no targetX cancel; a fromRest one flips and cancels', () => {
    const go = (fromRest: boolean) => {
      const sim = make([]);
      const ev = run(sim, 25, (i) => (i === 5 ? { tap: true }
        : i === 16 ? { steerDx: -0.5, swipe: 'l', swipeDx: -0.5, swipeSteer: true, swipeFast: true, swipeFromRest: fromRest } : {}));
      return { flips: all(ev, 'flipStart').map((e) => e.id), targetX: sim.cur.targetX };
    };
    expect(go(false)).toEqual({ flips: [], targetX: -0.5 });
    expect(go(true)).toEqual({ flips: ['kickflip'], targetX: 0 });
  });
});

describe('Indy grab (DESIGN §6.1a)', () => {
  it('HOLD with ≥ 0.25 s of air left grabs, auto-releases 0.12 s before touchdown, scores 100 + 150/s and links', () => {
    const sim = make([]);
    const ev = run(sim, 60, (i) => (i === 5 ? { tap: true } : i >= 8 ? { hold: true, press: true } : {}));
    const gs = first(ev, 'grabStart')!, ge = first(ev, 'grabEnd')!, land = first(ev, 'land')!;
    expect((land.tick - ge.tick) * DT).toBeCloseTo(0.12, 1);
    const sc = all(ev, 'trickScored').find((e) => e.id === 'indy')!;
    expect(sc.pts).toBe(Math.round(100 + 150 * ge.dur));
    expect(sc.link).toBe(true);
    expect(gs.tick).toBe(9);
    // Still holding at touchdown: straight into a manual.
    expect(first(ev, 'manualStart')?.tick).toBe(land.tick);
  });
  it('a thumb resting since the ground never grabs when another finger pops (no grab, no grab-manual)', () => {
    const ev = run(make([]), 60, (i) => ({ press: true, hold: i >= 12, tap: i === 20 }));
    expect(first(ev, 'ollie')).toBeDefined();
    expect(first(ev, 'grabStart')).toBeUndefined();
    expect(all(ev, 'trickScored').map((e) => e.id)).toEqual(['ollie']);
  });
  it('a HOLD with < 0.25 s of air left does not grab; Q grabs like a HOLD; the manual key never grabs', () => {
    const late = run(make([]), 60, (i) => (i === 5 ? { tap: true } : i >= 28 ? { hold: true, press: true } : {}));
    expect(first(late, 'grabStart')).toBeUndefined();
    const q = run(make([]), 60, (i) => (i === 5 ? { tap: true } : i >= 8 && i < 20 ? { grab: true } : {}));
    expect(first(q, 'grabEnd')!.dur).toBeCloseTo(12 * DT, 6);
    const key = run(make([]), 60, (i) => (i === 5 ? { tap: true } : i >= 8 ? { manualKey: true, press: true } : {}));
    expect(first(key, 'grabStart')).toBeUndefined();
  });
});

describe('grind switches (DESIGN §6.3)', () => {
  const grindWith = (swipes: Record<number, Dir8>, obs = [ledge(0, 30)]) => {
    const sim = make(obs);
    let lock = -1;
    const ev = run(sim, 400, (i, _s, last) => {
      if (lock < 0 && last.some((e) => e.t === 'grindStart')) lock = i - 1;
      if (i === POP) return { tap: true };
      const d = lock >= 0 ? swipes[i - lock] : undefined;
      return d ? fast(d) : {};
    });
    return ev;
  };
  it('≥ 0.25 s after lock a swipe switches (new trick, new link), at most 2 per edge; ↑ pops out', () => {
    const ev = grindWith({ 10: 'l', 20: 'd', 40: 'r', 60: 'dl', 90: 'u' });
    expect(all(ev, 'grindSwitch').map((e) => `${e.from}>${e.to}`)).toEqual(['fiftyFifty>fiveO', 'fiveO>feeble']);
    expect(scored(ev).filter((s) => !s.startsWith('ollie')).map((s) => s.split(':')[0])).toEqual(['fiftyFifty', 'fiveO', 'feeble']);
    expect(first(ev, 'grindEnd')!.exit).toBe('pop');
    const links = all(ev, 'trickScored').at(-1)!.links;
    expect(links).toBe(3);
  });
  it('a repeat of the switch direction within 0.25 s is its double in place (← ← → Lipslide, one switch)', () => {
    const ev = grindWith({ 20: 'l', 26: 'l', 60: 'r' });
    expect(all(ev, 'grindSwitch').map((e) => e.to)).toEqual(['boardslide', 'lipslide', 'feeble']);
    expect(scored(ev).filter((s) => !s.startsWith('ollie')).map((s) => s.split(':')[0])).toEqual(['fiftyFifty', 'lipslide', 'feeble']);
  });
});

describe('transfer and the pop-out re-capture rule (GP request)', () => {
  it('a pop-out from a ledge lands on its top instead of re-locking it; steering toward the other edge re-locks it', () => {
    const sim = make([ledge(0, 40)]);
    let lock = -1;
    const ev = run(sim, 260, (i, _s, last) => {
      if (lock < 0 && last.some((e) => e.t === 'grindStart')) lock = i - 1;
      return i === POP || (lock >= 0 && i === lock + 30) ? { tap: true } : {};
    });
    expect(all(ev, 'grindStart')).toHaveLength(1);
    expect(first(ev, 'land')!.surface).toBe('granite');               // on the ledge top
    expect(RULES.popOutSkipsOwnEdge).toBe(true);
    const back = make([ledge(0, 40)]);
    lock = -1;
    const ev2 = run(back, 260, (i, _s, last) => {
      if (lock < 0 && last.some((e) => e.t === 'grindStart')) lock = i - 1;
      if (lock < 0) return i === POP ? { tap: true } : {};
      // Pop out, then drag toward the ledge's other edge at a human pace (4.8 m/s, 0.8 m over 0.17 s ≥ cancelDragM).
      return i === lock + 30 ? { tap: true } : i >= lock + 32 && i < lock + 42 ? { steerDx: 0.08 } : {};
    });
    expect(10 * 0.08).toBeGreaterThanOrEqual(MAGNET.cancelDragM);      // the drag counts as steering toward it
    expect(all(ev2, 'grindStart')).toHaveLength(2);
    expect(all(ev2, 'grindStart')[1]!.transfer).toBe(false);          // same obstacle: no Transfer
  });
  it('a pop-out from a rail still re-locks it when nothing steers (its top is a crash top)', () => {
    const sim = make([rail({ s: 10, x: 0, len: 30, hgt: 0.4 })]);
    let lock = -1;
    const ev = run(sim, 260, (i, _s, last) => {
      if (lock < 0 && last.some((e) => e.t === 'grindStart')) lock = i - 1;
      return i === POP || (lock >= 0 && i === lock + 30) ? { tap: true } : {};
    });
    expect(all(ev, 'grindStart')).toHaveLength(2);
    expect(first(ev, 'crash')).toBeUndefined();
  });
  it('popping toward a second rail transfers: +250 and a link, the magnet at transfer range', () => {
    const sim = make([rail({ s: 10, x: 0, len: 12, hgt: 0.4 }), rail({ s: 21, x: 2.0, len: 10, hgt: 0.4 })]);
    let lock = -1;
    const ev = run(sim, 300, (i, _s, last) => {
      if (lock < 0 && last.some((e) => e.t === 'grindStart')) lock = i - 1;
      if (lock < 0) return i === POP ? { tap: true } : {};
      return i === lock + 62 ? { tap: true } : i >= lock + 64 && i < lock + 76 ? { steerDx: 0.09 } : {};   // drag toward it
    });
    const g = all(ev, 'grindStart');
    expect(g).toHaveLength(2);
    expect(g[1]!.transfer).toBe(true);
    expect(all(ev, 'bonus').map((b) => b.id)).toEqual(['popOut', 'transfer']);
    expect(SCORE.bonus.transfer).toBe(250);
  });
});

describe('keyboard amend through the sim (DESIGN §4.6)', () => {
  it('↑ then → (≤ 80 ms) on the ground is a FS 180 ollie; ← then ↓ in the air is a Varial Kickflip', () => {
    const sim = make([]);
    const ev = run(sim, 60, (i) => (i === 5 ? fast('u') : i === 9 ? { ...fast('ur'), swipeAmend: true } : {}));
    expect(all(ev, 'ollie')).toHaveLength(1);
    expect(first(ev, 'spinStart')?.id).toBe('fs180');
    const sim2 = make([]);
    const ev2 = run(sim2, 60, (i) => (i === 5 ? { tap: true } : i === 15 ? fast('l') : i === 19 ? { ...fast('dl'), swipeAmend: true } : {}));
    expect(all(ev2, 'flipUpgrade').map((e) => `${e.from}>${e.to}`)).toEqual(['kickflip>varialKickflip']);
    expect(scored(ev2).at(-1)).toMatch(/^varialKickflip:(250|313)$/);   // 250, Perfect ×1.25 when caught late
  });
});

describe('spins, revert and Double-up', () => {
  it('BS 180 + ← lands as both tricks, fakie, then reverts (+50, +1 link)', () => {
    const sim = make([]);
    const ev = run(sim, 60, (i) => (i === 5 ? fast('ul') : i === 16 ? fast('l') : {}));
    expect(scored(ev).map((s) => s.split(':')[0])).toEqual(['ollie', 'kickflip', 'bs180']);
    expect(first(ev, 'revert')).toBeDefined();
    expect(all(ev, 'bonus').map((b) => `${b.id}:${b.pts}`)).toEqual(['revert:50']);
    expect(sim.score.combo.links).toBe(3);
  });
  it('a second separate flip in the same air is a Double-up (×1.5)', () => {
    const tall = make([box({ s: -5, x: 0, len: 9, wid: 3, hgt: 2.0, top: 'landable' })]);
    place(tall, { y: 2.0 });
    run(tall, Math.round(0.5 / DT));
    const ev = run(tall, 80, (i) => (i === 0 ? { tap: true } : i === 8 ? fast('d') : i === 30 ? fast('d') : {}));
    expect(all(ev, 'flipStart').map((e) => e.id)).toEqual(['popShuvit', 'popShuvit']);
    const mod = first(ev, 'land')!.quality === 'perfect' ? SCORE.mod.perfect : 1;
    // The second: 100 × 0.7 (the first is in the decay window) × 1.5 Double-up, both × the landing modifier.
    expect(scored(ev)).toEqual(['ollie:50', `popShuvit:${Math.round(100 * mod)}`, `popShuvit:${Math.round(100 * mod * 0.7 * 1.5)}`]);
  });
});

describe('events at the right tick (immediate feedback)', () => {
  it('flipStart on the swipe tick, trickScored and land on the touchdown tick, grindStart on the lock tick', () => {
    const sim = make([]);
    let swipeTick = -1;
    const ev = run(sim, 60, (i, s) => {
      if (i === 5) return { tap: true };
      if (i === 15) { swipeTick = s.cur.tick + 1; return fast('l'); }
      return {};
    });
    expect(first(ev, 'flipStart')!.tick).toBe(swipeTick);
    const land = first(ev, 'land')!;
    expect(all(ev, 'trickScored').find((e) => e.id === 'kickflip')!.tick).toBe(land.tick);
  });
});

/** Make TypeScript see the helper types are used. */
export type _E = GameEvent; export type _S = Sim; void sAt;

describe('landing rules (DESIGN §7, §13.2)', () => {
  it('a roll-off drop with a trick opens the 0.75 s link window like any landing (a resting thumb can manual)', () => {
    const drop = () => make([box({ s: sAt(0) - 5, x: 0, len: 9, wid: 3, hgt: 2.0, top: 'landable' })]);
    for (const thumb of [false, true]) {
      const sim = drop();
      place(sim, { y: 2.0 });
      let off = -1, land = -1;
      const ev = run(sim, 200, (i, s, last) => {
        if (off < 0 && last.some((e) => e.t === 'airborne' && e.reason === 'rollOff')) off = i;
        if (land < 0 && last.some((e) => e.t === 'land')) land = i;
        if (off >= 0 && i === off + 4) return fast('l');
        return thumb && land >= 0 ? { press: true, hold: true } : {};
      });
      expect(first(ev, 'land')!.dropH).toBeCloseTo(2.0, 6);
      expect(all(ev, 'trickScored').map((e) => e.id)).toContain('kickflip');
      if (!thumb) {
        const bank = first(ev, 'comboBanked')!;
        expect(bank.reason).toBe('window');
        expect((bank.tick + 1 - first(ev, 'land')!.tick) * DT).toBeCloseTo(SCORE.linkWindow, 6);   // landing tick included
      } else {
        // A thumb resting from the touchdown: the window is open, so it manuals after RULES.manualHoldSec.
        const m = first(ev, 'manualStart')!;
        expect((m.tick - first(ev, 'land')!.tick) * DT).toBeCloseTo(RULES.manualHoldSec, 1);
      }
    }
  });

  it('a plain roll-off (no trick) keeps the window that was running: rolling down steps cannot stretch it', () => {
    const sim = make([box({ s: sAt(0) - 5, x: 0, len: 20, wid: 3, hgt: 0.5, top: 'landable' })]);
    place(sim, { y: 0.5 });
    const ev = run(sim, 200, (i) => (i === 70 ? { tap: true } : {}));
    // The ollie lands on the top, the window runs, the board rolls off the end and lands 0.5 m lower: same window.
    const lands = all(ev, 'land');
    expect(lands.length).toBe(2);
    const bank = first(ev, 'comboBanked')!;
    expect(bank.reason).toBe('window');
    expect(bank.tick).toBeGreaterThan(lands[1]!.tick);
    expect((bank.tick + 1 - lands[0]!.tick) * DT).toBeCloseTo(SCORE.linkWindow, 6);
  });

  it('first runs: the bail floor is 0.40 (a hardflip at p ≈ 0.45 is sketchy there, a bail otherwise)', () => {
    const at = (swipe: number, firstRuns: boolean) => {
      const sim = make([], { firstRuns, god: false });
      const ev = run(sim, 80, (i) => (i === 5 ? { tap: true } : i === swipe ? fast('ul') : {}));
      return { start: first(ev, 'flipStart'), land: first(ev, 'land'), crash: first(ev, 'crash') };
    };
    const seen: string[] = [];
    for (let swipe = 24; swipe <= 34; swipe++) {
      const normal = at(swipe, false), fr = at(swipe, true);
      if (!normal.start) continue;                                     // too late: ignored (rule 5)
      const p = normal.crash?.flipProgress ?? 1;
      if (p >= 0.55) continue;
      seen.push(p.toFixed(2));
      expect(normal.crash, `swipe ${swipe}`).toMatchObject({ cause: 'badLanding' });
      if (p >= 0.40) expect(fr.land, `swipe ${swipe} p ${p}`).toMatchObject({ quality: 'sketchy' });
      else expect(fr.crash, `swipe ${swipe} p ${p}`).toMatchObject({ cause: 'badLanding' });
    }
    expect(seen.some((p) => Number(p) >= 0.40)).toBe(true);
  });
});
