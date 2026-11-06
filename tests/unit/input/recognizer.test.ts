// Recognizer traces (TECH §7.4, DESIGN §4.2): boundaries, labels, misfire traces, arc compensation, recoil,
// re-fire, multi-touch ownership and pointercancel.
import { describe, expect, it } from 'vitest';
import { arcCompensate, sectorOfAngle, DEFAULT_RECOGNIZER } from '../../../src/input/recognizer';
import { makeRec, run, steerSum, swipes, kinds, Trace, W, H } from './trace';

const CX = W / 2, CY = H * 0.55;

describe('tap / hold / drag boundaries', () => {
  it('HOLD at 200 ms still: 199 ms no, 201 ms yes (stamped at down + 200)', () => {
    const r1 = makeRec();
    r1.feed({ id: 1, tMs: 1000, x: CX, y: CY, phase: 'down' });
    expect(r1.tick(1199)).toEqual([]);
    const r2 = makeRec();
    r2.feed({ id: 1, tMs: 1000, x: CX, y: CY, phase: 'down' });
    expect(r2.tick(1201)).toEqual([{ k: 'holdStart', tMs: 1200 }]);
    expect(r2.tick(1300)).toEqual([]);                    // fires once
  });

  it('TAP: still release at 349 ms is a tap, at 351 ms is not', () => {
    expect(kinds(run(makeRec(), new Trace(1, 0, CX, CY).rest(349).up().samples))).toEqual(['press+', 'holdStart', 'tap', 'holdEnd', 'press-']);
    expect(kinds(run(makeRec(), new Trace(1, 0, CX, CY).rest(351).up().samples))).toEqual(['press+', 'holdStart', 'holdEnd', 'press-']);
    expect(kinds(run(makeRec(), new Trace(1, 0, CX, CY).rest(120).up().samples))).toEqual(['press+', 'tap', 'press-']);
  });

  it('long tap (W1a): a still release 350–400 ms after down (600 at the design target) marks its holdEnd `release`; a drag, a cancel or a longer press do not', () => {
    const holdEnd = (ms: number, end: 'up' | 'cancel' = 'up', longTapMaxMs?: number) => {
      const tr = new Trace(1, 0, CX, CY).rest(ms);
      const g = run(makeRec(longTapMaxMs ? { longTapMaxMs } : {}), (end === 'up' ? tr.up() : tr.cancel()).samples);
      return g.find((x) => x.k === 'holdEnd') as { release?: true } | undefined;
    };
    expect(DEFAULT_RECOGNIZER.longTapMaxMs).toBe(400);
    expect(holdEnd(351)?.release).toBe(true);
    expect(holdEnd(400)?.release).toBe(true);
    expect(holdEnd(401)?.release).toBeUndefined();                         // the e2e priming touch (≥ 400 ms + delivery)
    expect(holdEnd(600, 'up', 600)?.release).toBe(true);
    expect(holdEnd(601, 'up', 600)?.release).toBeUndefined();
    expect(holdEnd(300)?.release).toBeUndefined();                        // ≤ 350 ms is a real tap
    expect(holdEnd(380, 'cancel')?.release).toBeUndefined();
    expect(kinds(run(makeRec(), new Trace(1, 0, CX, CY).rest(380).up().samples))).toEqual(['press+', 'holdStart', 'holdEnd', 'press-']);
    const drag = run(makeRec(), new Trace(1, 0, CX, CY).rest(250).move(12, 0, 40).rest(100).up().samples);
    expect(drag.some((x) => x.k === 'holdEnd' && (x as { release?: true }).release)).toBe(false);
  });

  it('SLOP: 9 px of travel stays still (tap), 11 px is a DRAG (steering from touch-down)', () => {
    const still = run(makeRec(), new Trace(1, 0, CX, CY).move(9, 0, 60).up().samples);
    expect(kinds(still)).toEqual(['press+', 'tap', 'press-']);
    expect(steerSum(still)).toBe(0);
    const drag = run(makeRec(), new Trace(1, 0, CX, CY).move(11, 0, 60).rest(240).up().samples);
    expect(kinds(drag)).toEqual(['press+', 'press-']);         // lifted at 300 ms: a drag, not a tap
    expect(steerSum(drag)).toBeCloseTo(11, 9);              // no motion lost below the slop
  });

  it('sloppy tap (G0): a jab that drifts past SLOP but < 20 px (< 15 px sideways), no swipe, lifted ≤ 250 ms, is a tap', () => {
    const tapOf = (dx: number, dy: number, ms: number, hold = 0) =>
      kinds(run(makeRec(), new Trace(1, 0, CX, CY).move(dx, dy, ms).rest(hold).up().samples)).includes('tap');
    expect(tapOf(11, 0, 60)).toBe(true);                     // 11 px sideways drift in 60 ms
    expect(tapOf(9, -8, 90)).toBe(true);                     // 12 px up-right
    expect(tapOf(4, -18, 90)).toBe(true);                    // 18 px upward
    expect(tapOf(12, -14, 100)).toBe(true);                  // 18.4 px, 12 px sideways
    expect(tapOf(16, 0, 90)).toBe(false);                    // 16 px sideways: a steering nudge
    expect(tapOf(12, -17, 100)).toBe(false);                 // 20.8 px: too far
    expect(tapOf(11, 0, 60, 200)).toBe(false);               // lifted at 260 ms
    const steer = run(makeRec(), new Trace(1, 0, CX, CY).move(12, 0, 80).up().samples);
    expect(steerSum(steer)).toBeCloseTo(12, 9);              // the drift still steered
  });

  it('a HOLD released at 300 ms emits both holdEnd and tap; a HOLD that moves 12 px becomes a DRAG', () => {
    expect(kinds(run(makeRec(), new Trace(1, 0, CX, CY).rest(300).up().samples))).toEqual(['press+', 'holdStart', 'tap', 'holdEnd', 'press-']);
    const g = run(makeRec(), new Trace(1, 0, CX, CY).rest(250).move(12, 0, 40).rest(100).up().samples);
    expect(kinds(g)).toEqual(['press+', 'holdStart', 'holdEnd', 'press-']);
    expect(steerSum(g)).toBeCloseTo(12, 9);                // it may become the steering owner (gain 1.0)
  });

  it('a second-finger tap is a tap while the first finger steers', () => {
    const a = new Trace(1, 0, 100, CY).move(60, 0, 300, 16);
    const b = new Trace(2, 120, 300, CY * 0.8).rest(90).up();
    const g = run(makeRec(), [...a.samples, ...b.samples]);
    expect(g.filter((x) => x.k === 'tap')).toHaveLength(1);
    expect(steerSum(g)).toBeCloseTo(60, 6);
  });

  it('dead zone: touch-starts in the bottom safeBottom + 12 px are ignored', () => {
    const r = makeRec({ screenH: H, deadZoneBottomPx: 34 + 12 });
    expect(run(r, new Trace(1, 0, CX, H - 30).rest(100).up().samples)).toEqual([]);
    expect(kinds(run(r, new Trace(2, 500, CX, H - 60).rest(100).up().samples))).toEqual(['press+', 'tap', 'press-']);
  });
});

describe('swipe detection and labels', () => {
  it('≥ 32 px within 80 ms fires; 0.35 px/ms (28 px per 80 ms) does not', () => {
    expect(swipes(run(makeRec(), new Trace(1, 0, CX, CY).flick(0.5, 90, 120).up().samples))).toHaveLength(1);
    expect(swipes(run(makeRec(), new Trace(1, 0, CX, CY).flick(0.35, 90, 300).rest(200).up().samples))).toHaveLength(0);
  });

  it('a swipe during a drag: steer label, window swipeDx, not fast at 0.5 px/ms', () => {
    // Steering stroke: 300 ms slow drag right (0.2 px/ms), then a 0.5 px/ms push right.
    const g = run(makeRec(), new Trace(1, 0, 100, CY).flick(0.2, 0, 300).flick(0.5, 0, 120).up().samples);
    const s = swipes(g);
    expect(s).toHaveLength(1);
    expect(s[0]!.dir).toBe('r');
    expect(s[0]!.steer).toBe(true);
    expect(s[0]!.fast).toBe(false);
    expect(s[0]!.fromRest).toBe(false);
    // The window's dx: 80 ms ending at the fire time, part slow and part fast.
    expect(s[0]!.dxPx).toBeGreaterThan(30);
    expect(s[0]!.dxPx).toBeLessThan(40);
  });

  it('a fresh flick (≤ 150 ms old) is not `steer`, is `fast` at ≥ 0.75 px/ms and its swipeDx counts from touch-down', () => {
    const g = run(makeRec(), new Trace(1, 0, 250, CY).flick(1.2, 180, 60).up().samples);
    const s = swipes(g);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ dir: 'l', steer: false, fast: true });
    const firedAt = s[0]!.tMs;
    expect(s[0]!.dxPx).toBeCloseTo(-1.2 * firedAt, 6);     // all dx since touch-down
  });

  it('a non-owner touch contributes no steering, so its swipeDx is 0', () => {
    const a = new Trace(1, 0, 80, CY).move(40, 0, 400, 16);
    const b = new Trace(2, 100, 300, CY).rest(80).flick(1.2, 90, 60).up();
    const s = swipes(run(makeRec(), [...a.samples, ...b.samples]));
    expect(s.map((x) => x.dir)).toEqual(['u']);
    expect(s[0]!.dxPx).toBe(0);
    expect(s[0]!.steer).toBe(false);
  });

  it('lift-off swipe: ≥ 24 px in the last 80 ms on lift', () => {
    const s = swipes(run(makeRec(), new Trace(1, 0, CX, CY).rest(100).flick(0.35, 90, 80).up().samples));
    expect(s).toHaveLength(1);
    expect(s[0]!.dir).toBe('u');
    expect(s[0]!.tMs).toBe(180);
    // A thumb that stopped before lifting does not swipe.
    expect(swipes(run(makeRec(), new Trace(1, 0, CX, CY).rest(100).flick(0.35, 90, 80).rest(120).up().samples))).toHaveLength(0);
  });
});

describe('misfire traces (Mobile review)', () => {
  it('one long 90 px / 130 ms flick fires once, not twice', () => {
    for (const startRest of [0, 120]) {
      const s = swipes(run(makeRec(), new Trace(1, 0, 300, CY).rest(startRest).move(-90, 0, 130).up().samples));
      expect(s.map((x) => x.dir), `rest ${startRest}`).toEqual(['l']);
    }
  });

  it('a lift right after a fire adds no third swipe', () => {
    // Flick-flick (a double), lift 20 ms after the second fire while still moving.
    const tr = new Trace(1, 0, 320, CY).rest(100).flick(1.4, 180, 40).rest(70).flick(1.4, 180, 40).up();
    const s = swipes(run(makeRec(), tr.samples));
    expect(s.map((x) => x.dir)).toEqual(['l', 'l']);
  });

  it('a corrective air drag at 0.4–0.7 px/ms on the steering stroke is `steer` and not `fast`', () => {
    for (const v of [0.45, 0.55, 0.7]) {
      const tr = new Trace(1, 0, 150, CY).flick(0.25, 0, 300).flick(v, 180, 140).up();
      const s = swipes(run(makeRec(), tr.samples));
      expect(s.length, `v ${v}`).toBeGreaterThanOrEqual(1);
      for (const x of s) expect(x, `v ${v}`).toMatchObject({ steer: true, fast: false, fromRest: false });
    }
  });

  it('a hard flick from a thumb that is already steering is `steer` and `fast` (60 and 120 Hz sampling)', () => {
    // The steering-stroke rule (DESIGN §4.3) accepts these only when `fast` or `fromRest`: a one-thumb ollie / flip.
    for (const step of [16.7, 8]) {
      for (const v of [0.8, 1.0, 1.5, 2.0]) {
        const up = swipes(run(makeRec(), new Trace(1, 0, 150, CY).flick(0.2, 0, 400, step).flick(v, 90, 80, step).up().samples));
        expect(up, `↑ ${v} px/ms @ ${step} ms`).toHaveLength(1);
        expect(up[0], `↑ ${v} px/ms @ ${step} ms`).toMatchObject({ dir: 'u', steer: true, fast: true, fromRest: false });
      }
      for (const v of [0.8, 1.0, 1.5]) {
        const ul = swipes(run(makeRec(), new Trace(1, 0, 150, CY).flick(0.2, 0, 400, step).flick(v, 135, 80, step).up().samples));
        expect(ul[0], `↖ ${v} px/ms @ ${step} ms`).toMatchObject({ dir: 'ul', steer: true, fast: true });
        const dn = swipes(run(makeRec(), new Trace(1, 0, 150, 300).flick(0.3, 0, 400, step).flick(v, 270, 80, step).up().samples));
        expect(dn[0], `↓ ${v} px/ms @ ${step} ms`).toMatchObject({ dir: 'd', steer: true, fast: true });
      }
    }
    // An accelerating flick (speed ramping up to 1.0 px/ms) after steering is fast too.
    const ramp = new Trace(1, 0, 150, CY).flick(0.2, 0, 400, 16.7);
    for (let i = 1; i <= 6; i++) ramp.flick(Math.min(1, i / 3), 90, 16.7, 16.7);
    expect(swipes(run(makeRec(), ramp.up().samples))[0]).toMatchObject({ dir: 'u', steer: true, fast: true });
  });

  it('a flick that eases into a slower drag fires once (the dip never rises again), also on lift', () => {
    for (const [v1, ms1, v2, ms2] of [[1.0, 60, 0.45, 250], [1.2, 50, 0.5, 200], [1.4, 40, 0.6, 300]] as const) {
      const s = swipes(run(makeRec(), new Trace(1, 0, 330, CY).flick(v1, 180, ms1).flick(v2, 180, ms2).up().samples));
      expect(s.map((x) => x.dir), `${v1} → ${v2}`).toEqual(['l']);
    }
    // A deliberate second flick out of the slow drag (it rises again) still fires: a double.
    const dbl = new Trace(1, 0, 360, CY).flick(1.0, 180, 60).flick(0.45, 180, 60).flick(1.2, 180, 50).up();
    expect(swipes(run(makeRec(), dbl.samples)).map((x) => x.dir)).toEqual(['l', 'l']);
  });

  it('a parked-then-flicked thumb is `fromRest` (also with ±2 px tremor)', () => {
    for (const tremor of [0, 2]) {
      const tr = new Trace(1, 0, 150, CY).flick(0.3, 0, 300).rest(110, tremor).flick(1.2, 180, 60).up();
      const s = swipes(run(makeRec(), tr.samples));
      expect(s.length, `tremor ${tremor}`).toBe(1);
      expect(s[0], `tremor ${tremor}`).toMatchObject({ dir: 'l', steer: true, fromRest: true, fast: true });
    }
    // Without the park it is not fromRest.
    const s = swipes(run(makeRec(), new Trace(1, 0, 150, CY).flick(0.3, 0, 300).flick(1.2, 180, 60).up().samples));
    expect(s.at(-1)).toMatchObject({ dir: 'l', fromRest: false });
  });

  it('a still park (no samples, as on hardware) of ~60 ms is enough at 60 and 120 Hz; 40 ms is not (DESIGN §4.2)', () => {
    // The first flick sample after a sample-less park is fast: the gap itself was the rest (review: it needed ~110 ms).
    const go = (park: number, step: number) => swipes(run(makeRec(),
      new Trace(1, 0, 150, CY).flick(0.3, 0, 320, step).rest(park).flick(1.2, 180, 64, step).up().samples))[0];
    for (const step of [16, 8]) {
      expect(go(70, step), `70 ms @ ${step}`).toMatchObject({ dir: 'l', steer: true, fromRest: true, fast: true });
      expect(go(40, step), `40 ms @ ${step}`).toMatchObject({ dir: 'l', steer: true, fromRest: false });
    }
  });
});

describe('direction: sectors, arc compensation, simple tricks', () => {
  const cfg = DEFAULT_RECOGNIZER;
  it('sector edges: cardinals own ±30°, diagonals ±15°', () => {
    expect(sectorOfAngle(30, cfg)).toBe('r');
    expect(sectorOfAngle(30.5, cfg)).toBe('ur');
    expect(sectorOfAngle(59.5, cfg)).toBe('ur');
    expect(sectorOfAngle(60, cfg)).toBe('u');
    expect(sectorOfAngle(150, cfg)).toBe('l');
    expect(sectorOfAngle(149.5, cfg)).toBe('ul');
    expect(sectorOfAngle(240, cfg)).toBe('d');
    expect(sectorOfAngle(225, cfg)).toBe('dl');
    expect(sectorOfAngle(330, cfg)).toBe('r');
    expect(sectorOfAngle(329, cfg)).toBe('dr');
  });

  it('simple tricks snaps diagonals to the nearest cardinal', () => {
    const s = { ...cfg, simpleTricks: true };
    expect(sectorOfAngle(40, s)).toBe('r');
    expect(sectorOfAngle(50, s)).toBe('u');
    expect(sectorOfAngle(45, s)).toBe('u');
    expect(sectorOfAngle(225 + 4, s)).toBe('d');
    const r = makeRec({ simpleTricks: true });
    expect(swipes(run(r, new Trace(1, 0, CX, CY).rest(80).flick(1.2, 135, 60).up().samples))[0]!.dir).toBe('u');
  });

  it('arc compensation: a right-thumb leftward stroke from x = 0.8·W rising 28° (and 36°) is ←, not ↖', () => {
    expect(arcCompensate(152, 0.8 * W, { ...cfg, screenW: W })).toBeCloseTo(160, 9);
    for (const rise of [28, 36]) {
      const s = swipes(run(makeRec(), new Trace(1, 0, 0.8 * W, CY).rest(80).flick(1.2, 180 - rise, 60).up().samples));
      expect(s[0]!.dir, `rise ${rise}`).toBe('l');
    }
    // The same 36° stroke from the centre (not the outer 40%) is ↖.
    const c = swipes(run(makeRec(), new Trace(1, 0, CX, CY).rest(80).flick(1.2, 144, 60).up().samples));
    expect(c[0]!.dir).toBe('ul');
    // Left side, rightward stroke rising 36° → →; steep strokes (> 45° from horizontal) are untouched.
    expect(swipes(run(makeRec(), new Trace(1, 0, 0.1 * W, CY).rest(80).flick(1.2, 36, 60).up().samples))[0]!.dir).toBe('r');
    expect(arcCompensate(50, 0.1 * W, { ...cfg, screenW: W })).toBe(50);
    expect(arcCompensate(5, 0.1 * W, { ...cfg, screenW: W })).toBe(0);     // never past horizontal
  });
});

describe('owner sectors (G0): the steering owner has diagonals ±10° unless a parked thumb flicks first', () => {
  const dirOf = (angle: number, o: { rest?: number; second?: boolean } = {}) => {
    const samples = [];
    if (o.second) samples.push(...new Trace(1, 0, CX, CY + 100).move(40, 0, 100).rest(400).up().samples);   // owner elsewhere
    samples.push(...new Trace(2, 150, CX, CY).rest(o.rest ?? 0).flick(1.0, angle, 60).up().samples);
    return swipes(run(makeRec(), samples)).find((x) => x.tMs >= 150)!.dir;
  };
  it('a fresh owner flick at 34° is →, at 36° and 45° ↗', () => {
    expect(dirOf(34)).toBe('r');
    expect(dirOf(36)).toBe('ur');
    expect(dirOf(45)).toBe('ur');
    expect(dirOf(180 - 34)).toBe('l');
    expect(dirOf(56)).toBe('u');
  });
  it('a parked thumb\'s first flick, or a touch that is not steering, keeps the normal ±15° diagonals', () => {
    expect(dirOf(34, { rest: 80 })).toBe('ur');
    expect(dirOf(34, { second: true })).toBe('ur');
  });
  it('a thumb that steered, parked, then flicks 34° is → (still a steering thumb)', () => {
    const g = run(makeRec(), new Trace(1, 0, CX, CY).move(30, 0, 150).rest(200).flick(1.0, 34, 60).up().samples);
    expect(swipes(g)[0]).toMatchObject({ dir: 'r', fromRest: true, steer: true });
  });
});

describe('recoil and re-fire', () => {
  it('recoil: the bounce-back within 150 ms (±60° of the opposite direction) is not a swipe', () => {
    const tr = new Trace(1, 0, 200, CY).rest(100).flick(1.3, 0, 45).flick(0.9, 180, 60).rest(100).up();
    const g = run(makeRec(), tr.samples);
    expect(swipes(g).map((x) => x.dir)).toEqual(['r']);
    // Steering stays live through the recoil (the owner's raw motion).
    expect(steerSum(g)).toBeCloseTo(1.3 * 45 - 0.9 * 60, 6);
  });

  it('after the recoil window an opposite flick fires', () => {
    const tr = new Trace(1, 0, 200, CY).rest(100).flick(1.3, 0, 45).rest(170).flick(1.3, 180, 45).up();
    expect(swipes(run(makeRec(), tr.samples)).map((x) => x.dir)).toEqual(['r', 'l']);
  });

  it('re-fire needs ≥ 90 ms, ≥ 32 px from the fire point and a speed dip below 50% of the peak', () => {
    // Deliberate flick-flick with a pause: two swipes (a double).
    const dbl = new Trace(1, 0, 320, CY).rest(100).flick(1.4, 180, 40).rest(60).flick(1.4, 180, 45).rest(60).up();
    expect(swipes(run(makeRec(), dbl.samples)).map((x) => x.dir)).toEqual(['l', 'l']);
    // No dip (constant speed for 200 ms): one swipe.
    const flat = new Trace(1, 0, 360, CY).rest(100).flick(1.2, 180, 200).rest(60).up();
    expect(swipes(run(makeRec(), flat.samples))).toHaveLength(1);
    // A dip but the second flick comes < 90 ms after the first fire: one swipe.
    const quick = new Trace(1, 0, 320, CY).rest(100).flick(1.4, 180, 30).rest(16).flick(1.4, 180, 20).rest(80).up();
    expect(swipes(run(makeRec(), quick.samples))).toHaveLength(1);
  });
});

describe('multi-touch ownership and pointercancel', () => {
  it('the first touch to become a DRAG owns steering; others can tap, swipe or hold', () => {
    const a = new Trace(1, 0, 100, CY).move(50, 0, 400, 16);
    const b = new Trace(2, 50, 300, CY).move(-40, 0, 200, 16).up();
    const g = run(makeRec(), [...a.samples, ...b.samples]);
    expect(steerSum(g)).toBeCloseTo(50, 6);               // only touch 1 steers
  });

  it('pointercancel: no tap or swipe, ends the hold, and steering passes to the next touch that becomes a DRAG', () => {
    const hold = run(makeRec(), new Trace(1, 0, CX, CY).rest(250).cancel().samples);
    expect(kinds(hold)).toEqual(['press+', 'holdStart', 'holdEnd', 'press-']);
    const flickCancel = run(makeRec(), new Trace(1, 0, CX, CY).rest(80).move(-20, 0, 16).cancel().samples);
    expect(swipes(flickCancel)).toHaveLength(0);
    const quick = run(makeRec(), new Trace(1, 0, CX, CY).rest(100).cancel().samples);
    expect(quick.some((x) => x.k === 'tap')).toBe(false);

    const a = new Trace(1, 0, 100, CY).move(30, 0, 100, 16).cancel();
    const b = new Trace(2, 200, 250, CY).move(-40, 0, 160, 16).up();
    const g = run(makeRec(), [...a.samples, ...b.samples]);
    expect(steerSum(g)).toBeCloseTo(30 - 40, 6);           // touch 2 owns steering after the cancel
  });
});
