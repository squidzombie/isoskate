// input/recognizer.ts: the per-touch gesture recognizer (DESIGN §4.2, TECH §7.2). Pure: no DOM and no clocks; time
// comes only from the samples (and from tick()). The thumb bot runs this exact code on synthetic traces.
//
// Per pointer: PENDING (travel < SLOP) → HOLD at 200 ms still, or DRAG once travel ≥ SLOP (permanent).
//   - Release while still and ≤ 350 ms after down → tap (also from HOLD, which then also ends the hold); a sloppy tap
//     (see the G0 amendments below) is a tap too.
//   - HOLD that moves ≥ SLOP → holdEnd, then DRAG. `cancel` → no tap or swipe, ends the hold, frees steering.
//   - Steering: only the steering owner (the first touch to become a DRAG) emits `steer`, counted from touch-down.
//     When the owner lifts or cancels, the next touch that becomes a DRAG takes ownership.
//   - press: level for every non-DRAG touch; dropped when the touch becomes a DRAG.
// Swipes (inside a DRAG): ≥ 32·k px within the 80 ms window, or on lift with ≥ 24·k px in the last 80 ms. Labels:
//   fast (≥ 0.75·k px/ms: the flick's speed since it started moving, or the thumb's speed right now, whichever is
//   higher, so a hard flick from a thumb that is already steering reads fast even though the 80 ms window still
//   holds slow steering), fromRest (parked < 0.15·k px/ms for ≥ 60 ms right before the flick), steer (the steering
//   owner, older than 150 ms). Direction: arc compensation then 8 sectors (cardinals ±30°, diagonals ±15°; Simple
//   tricks snaps diagonals to cardinals). After a fire: a 150 ms recoil mask (motion within ±60° of the opposite
//   direction is invisible to swipe detection; steering stays live), re-fire only after 90 ms, 32·k px from the fire
//   point and a speed dip below 50% of the flick's peak followed by a new rise (back to ≥ twice the trough and at
//   least the lift-off swipe speed), and no lift-off swipe for 150 ms. The rise is what makes the dip a "dip": a flick
//   that eases into a slower drag dips but never rises, so it fires once (a deliberate flick-flick fires twice).
// `dxPx` of a swipe is the steering that stroke contributed: 0 for a non-owner touch; for the owner, the window's dx,
// or all dx since touch-down when the stroke is ≤ 150 ms old.
// G0 amendments (DESIGN §4.2, playtest review):
//   - Owner sectors: a swipe from the steering owner uses narrow diagonals (±ownerDiagonalHalfDeg, cardinals widen to
//     fill) unless it is a flick from a parked thumb that had not steered before it, so a dodge that rises 30–35°
//     stays sideways steering instead of a ↗/↖ pop. Parked-then-flicked thumbs and other fingers keep ±15°.
//   - Sloppy tap: a touch that drifted past SLOP but stayed within sloppyTapMaxPx of its start (and sloppyTapMaxDxPx
//     sideways), fired no swipe and lifted ≤ sloppyTapMs after touch-down is also a tap (its drift already steered).
// W1a (GP) amendment, the open G0 item "a 350–600 ms press does nothing": a still touch lifted after tapMaxMs but
// ≤ longTapMaxMs after touch-down (a HOLD that never moved) ends its hold with `release: true` (HoldEndExt). It is not
// a `tap` (the 349 / 351 ms boundary stays); the frame builder turns it into InputFrame `longTap` and the sim reads it
// as a TAP wherever the hold started nothing (tricks/interpret.ts). Core `longTap` / `holdEnd.release` since G1 (GP
// request 1); 600 ms, the design value, since tests/e2e/touch.spec.ts's pipeline-priming touch holds ≥ 700 ms.
import type { Dir8 } from '../core/ids';
import type { Gesture, GestureRecognizer, PointerSample, RecognizerConfig } from '../core/input';

/** RecognizerConfig with the screen metrics required (core has them optional since G0; the live config always holds
 *  numbers, so the recognizer never tests for undefined). */
export interface RecognizerConfigExt extends RecognizerConfig {
  /** Diagonal half-angle for swipes from the steering owner that are not `fromRest` (cardinals get 45° − this). */
  ownerDiagonalHalfDeg: number;
  /** Sloppy tap: lifted ≤ this many ms after touch-down ... */
  sloppyTapMs: number;
  /** Long tap: a still touch lifted ≤ this many ms after touch-down (and after tapMaxMs) marks its holdEnd `release`
   *  (600, DESIGN §4.2; applied @G1). */
  longTapMaxMs: number;
  /** ... having never moved more than this from the touch-down point (·k) ... */
  sloppyTapMaxPx: number;
  /** ... nor more than this sideways (·k: ≤ ~0.6 m of steering), and no swipe fired. */
  sloppyTapMaxDxPx: number;
  /** Screen width in CSS px: arc compensation applies to strokes starting in the outer `arcOuterFrac` of it.
   *  0 = unknown → 390·k. The DOM binding keeps it live. */
  screenW: number;
  /** Screen height in CSS px: touch-starts below `screenH − deadZoneBottomPx` are ignored. 0 = no dead zone. */
  screenH: number;
}

export const DEFAULT_RECOGNIZER: Readonly<RecognizerConfigExt> = {
  slopPx: 10, tapMaxMs: 350, holdMs: 200,
  swipeWindowMs: 80, swipeMinPx: 32, fastMinPx: 60,
  liftSwipeMinPx: 24, liftSuppressMs: 150,
  recoilMs: 150, recoilDeg: 60,
  refireMs: 90, refireDip: 0.5,
  restSpeed: 0.15, restMs: 60, steerStrokeMs: 150,
  cardinalHalfDeg: 30, diagonalHalfDeg: 15,
  arcCompDeg: 8, arcOuterFrac: 0.4,
  simpleTricks: false,
  deadZoneBottomPx: 12,
  k: 1,
  screenW: 0, screenH: 0,
  ownerDiagonalHalfDeg: 10,
  sloppyTapMs: 250, sloppyTapMaxPx: 20, sloppyTapMaxDxPx: 15,
  longTapMaxMs: 600,
};

/** holdEnd of a still touch lifted tapMaxMs–longTapMaxMs after touch-down (core Gesture plus `release`; GP request). */
export interface HoldEndExt { k: 'holdEnd'; tMs: number; release?: true }

/** Measurement windows (how the grammar's speeds are measured, not grammar tunables): the speed used for the
 *  re-fire peak and dip; the speed used for rest detection (longer, so ±3 px of thumb tremor still reads as
 *  parked); how much history each touch keeps. */
export const RECOGNIZER_INTERNALS = { speedWinMs: 24, restWinMs: 40, trailMs: 400 } as const;

const DEG = 180 / Math.PI;
const CARDINALS: readonly [Dir8, number][] = [['r', 0], ['u', 90], ['l', 180], ['d', 270]];
const DIAGONALS: readonly [Dir8, number][] = [['ur', 45], ['ul', 135], ['dl', 225], ['dr', 315]];
const angDist = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Screen angle in degrees, 0 = right, 90 = up (screen y grows downward), in [0, 360). */
export const screenAngle = (dx: number, dy: number) => ((Math.atan2(-dy, dx) * DEG) + 360) % 360;

/** Arc compensation (DESIGN §4.2): a stroke starting in the outer `arcOuterFrac` of the width (either side) and
 *  within 45° of horizontal is rotated `arcCompDeg` toward horizontal (a sideways thumb swipe arcs upward). */
export function arcCompensate(angle: number, startX: number,
  cfg: Pick<RecognizerConfigExt, 'arcCompDeg' | 'arcOuterFrac' | 'screenW' | 'k'>): number {
  const w = cfg.screenW > 0 ? cfg.screenW : 390 * cfg.k;
  const outer = startX <= cfg.arcOuterFrac * w || startX >= (1 - cfg.arcOuterFrac) * w;
  if (!outer) return angle;
  const h = angle <= 90 ? 0 : angle < 270 ? 180 : 360;          // nearest horizontal axis
  const off = angle - h;                                          // signed offset from it, |off| ≤ 90
  if (Math.abs(off) > 45) return angle;
  const rot = Math.min(cfg.arcCompDeg, Math.abs(off));
  return (h + off - Math.sign(off) * rot + 360) % 360;
}

/** 8 screen-space sectors: cardinals ±cardinalHalfDeg (the edge belongs to the cardinal), diagonals ±diagonalHalfDeg.
 *  `simpleTricks` snaps a diagonal to the nearest cardinal (an exact 45° tie goes to the vertical one). */
export function sectorOfAngle(angle: number, cfg: Pick<RecognizerConfig, 'cardinalHalfDeg' | 'diagonalHalfDeg' | 'simpleTricks'>): Dir8 {
  let bestC: Dir8 = 'r', dc = Infinity;
  for (const [d, c] of CARDINALS) {
    const x = angDist(angle, c);
    if (x < dc - 1e-9 || (Math.abs(x - dc) <= 1e-9 && (d === 'u' || d === 'd'))) { dc = x; bestC = d; }
  }
  if (dc <= cfg.cardinalHalfDeg + 1e-9 || cfg.simpleTricks) return bestC;
  let bestD: Dir8 = 'ur', dd = Infinity;
  for (const [d, c] of DIAGONALS) { const x = angDist(angle, c); if (x < dd) { dd = x; bestD = d; } }
  if (dd <= cfg.diagonalHalfDeg + 1e-9) return bestD;
  return dc / cfg.cardinalHalfDeg <= dd / cfg.diagonalHalfDeg ? bestC : bestD;   // only if the sectors leave gaps
}

/** Direction of a displacement (screen px) without arc compensation. */
export function sectorOf(dx: number, dy: number, cfg: Pick<RecognizerConfig, 'cardinalHalfDeg' | 'diagonalHalfDeg' | 'simpleTricks'>): Dir8 {
  return sectorOfAngle(screenAngle(dx, dy), cfg);
}

/** Direction of a stroke: arc compensation from its start x, then the sectors. `narrow`: the steering owner's
 *  not-from-rest sectors (diagonals ±ownerDiagonalHalfDeg). */
export function directionOf(dx: number, dy: number, startX: number, cfg: RecognizerConfigExt, narrow = false): Dir8 {
  const a = arcCompensate(screenAngle(dx, dy), startX, cfg);
  if (!narrow || cfg.simpleTricks) return sectorOfAngle(a, cfg);
  const dh = Math.min(cfg.diagonalHalfDeg, cfg.ownerDiagonalHalfDeg);
  return sectorOfAngle(a, { cardinalHalfDeg: 45 - dh, diagonalHalfDeg: dh, simpleTricks: false });
}

interface Sample { t: number; x: number; y: number; fx: number; fy: number }   // raw and recoil-filtered position

interface Touch {
  id: number; downMs: number; x0: number; y0: number;
  t: number; x: number; y: number; fx: number; fy: number;
  state: 'pending' | 'hold' | 'drag';
  press: boolean;
  maxD: number; maxDx: number;        // farthest from the touch-down point (any direction / sideways), for sloppy taps
  dragMs: number;                      // when it became a DRAG (Infinity before)
  trail: Sample[];
  steerX: number;
  // swipe bookkeeping
  fires: number; lastFireMs: number; fireFx: number; fireFy: number; fireUx: number; fireUy: number;
  peak: number; dipped: boolean; trough: number; rose: boolean;
  // rest bookkeeping (fromRest): parked while the filtered speed stays under restSpeed
  moving: boolean; restStart: number; lastRestLen: number; motionStart: number;
}

/** Linear interpolation of the trail at time t (clamped to the first/last sample). */
function at(tr: readonly Sample[], t: number, filtered: boolean): [number, number] {
  const pick = (s: Sample): [number, number] => (filtered ? [s.fx, s.fy] : [s.x, s.y]);
  const first = tr[0]!;
  if (t <= first.t) return pick(first);
  for (let i = tr.length - 1; i > 0; i--) {
    const b = tr[i]!, a = tr[i - 1]!;
    if (t < a.t) continue;
    if (t >= b.t) return pick(b);
    const u = (t - a.t) / Math.max(1e-9, b.t - a.t);
    const [ax, ay] = pick(a), [bx, by] = pick(b);
    return [ax + (bx - ax) * u, ay + (by - ay) * u];
  }
  return pick(first);
}

export type Recognizer = GestureRecognizer & { readonly config: RecognizerConfigExt };

export function createRecognizerImpl(partial?: Partial<RecognizerConfigExt>): Recognizer {
  const config: RecognizerConfigExt = { ...DEFAULT_RECOGNIZER, ...partial };
  const touches = new Map<number, Touch>();
  const ignored = new Set<number>();
  let owner: number | null = null;

  /** Filtered speed (px/ms) over the trailing `win` ms ending at the touch's latest sample. */
  const speed = (tc: Touch, win: number) => {
    const t0 = Math.max(tc.downMs, tc.t - win);
    const dt = tc.t - t0;
    if (dt <= 0) return 0;
    const [x, y] = at(tc.trail, t0, true);
    return Math.hypot(tc.fx - x, tc.fy - y) / dt;
  };

  /** Time-based transitions up to `now`: PENDING still for holdMs → HOLD (holdStart stamped at down + holdMs). */
  function advance(now: number, out: Gesture[]): void {
    for (const tc of touches.values()) {
      if (tc.state === 'pending' && now - tc.downMs >= config.holdMs) {
        tc.state = 'hold';
        out.push({ k: 'holdStart', tMs: tc.downMs + config.holdMs });
      }
    }
  }

  /** Recoil mask: `(dx, dy)` within ±recoilDeg of the opposite of the last fire, less than recoilMs after it. */
  const inRecoil = (tc: Touch, t: number, dx: number, dy: number) => {
    if (tc.fires === 0 || t - tc.lastFireMs >= config.recoilMs) return false;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return false;
    return (-dx * tc.fireUx - dy * tc.fireUy) / len >= Math.cos(config.recoilDeg / DEG) - 1e-12;
  };

  /** Filtered swipe-window displacement ending at t, and the window start. */
  const windowDisp = (tc: Touch, t: number): [number, number, number] => {
    const ws = Math.max(t - config.swipeWindowMs, tc.downMs);
    const [wx, wy] = at(tc.trail, ws, true);
    return [tc.fx - wx, tc.fy - wy, ws];
  };

  function fire(tc: Touch, t: number, dx: number, dy: number, ws: number, out: Gesture[]): void {
    const k = config.k;
    const [sx] = at(tc.trail, ws, false);
    const isOwner = owner === tc.id;
    let dxPx = 0;
    if (isOwner) dxPx = t - tc.downMs <= config.steerStrokeMs ? tc.x - tc.x0 : tc.x - at(tc.trail, t - config.swipeWindowMs, false)[0];
    // Speed of the flick: displacement over the part of the window in which the thumb was actually moving.
    let flickStart = tc.moving ? Math.max(ws, tc.motionStart) : ws;
    if (t - flickStart < 1) flickStart = ws;
    const [qx, qy] = at(tc.trail, flickStart, true);
    const flickSpeed = Math.hypot(tc.fx - qx, tc.fy - qy) / Math.max(1, t - flickStart);
    // A thumb that was already steering keeps `moving`, so the flick above spans the whole window (slow steering
    // included): the speed right now is what tells a hard flick from a corrective drag.
    const vNow = speed(tc, RECOGNIZER_INTERNALS.speedWinMs);
    const len = Math.hypot(dx, dy);
    const fromRest = (tc.moving ? tc.lastRestLen : tc.t - tc.restStart) >= config.restMs;
    // A steering thumb: the owner, unless this is a parked thumb's first motion (it became a DRAG during this flick).
    const steeredBefore = tc.dragMs < (tc.moving ? tc.motionStart : tc.restStart);
    out.push({
      k: 'swipe', tMs: t, dir: directionOf(dx, dy, sx, config, isOwner && (!fromRest || steeredBefore)), dxPx,
      fast: Math.max(flickSpeed, vNow) >= (config.fastMinPx * k) / config.swipeWindowMs,
      fromRest,
      steer: isOwner && t - tc.downMs > config.steerStrokeMs,
    });
    tc.fires++; tc.lastFireMs = t; tc.fireFx = tc.fx; tc.fireFy = tc.fy;
    tc.fireUx = dx / (len || 1); tc.fireUy = dy / (len || 1);
    tc.peak = vNow; tc.dipped = false; tc.trough = Infinity; tc.rose = false;
  }

  /** Re-fire (and lift-off after a fire) needs the dip and then a new rise (see the header). */
  const rearmed = (tc: Touch) => tc.dipped && tc.rose;

  /** A position sample for an existing touch: recoil filter, slop, steering, rest and peak bookkeeping, swipes. */
  function move(tc: Touch, s: PointerSample, out: Gesture[]): void {
    const k = config.k, t = Math.max(tc.t, s.tMs);
    const dx = s.x - tc.x, dy = s.y - tc.y;
    const prevT = tc.t;
    if (!inRecoil(tc, t, dx, dy)) { tc.fx += dx; tc.fy += dy; }
    tc.x = s.x; tc.y = s.y; tc.t = t;
    tc.trail.push({ t, x: tc.x, y: tc.y, fx: tc.fx, fy: tc.fy });
    while (tc.trail.length > 2 && tc.trail[1]!.t < t - RECOGNIZER_INTERNALS.trailMs) tc.trail.shift();
    tc.maxD = Math.max(tc.maxD, Math.hypot(tc.x - tc.x0, tc.y - tc.y0));
    tc.maxDx = Math.max(tc.maxDx, Math.abs(tc.x - tc.x0));

    // Slop: PENDING/HOLD → DRAG (permanent). The owner's steering counts from the touch-down point.
    if (tc.state !== 'drag' && Math.hypot(tc.x - tc.x0, tc.y - tc.y0) >= config.slopPx * k) {
      if (tc.state === 'hold') out.push({ k: 'holdEnd', tMs: t });
      if (tc.press) { tc.press = false; out.push({ k: 'press', tMs: t, down: false }); }
      tc.state = 'drag';
      tc.dragMs = t;
      if (owner === null) { owner = tc.id; tc.steerX = tc.x0; }
    }
    if (tc.state === 'drag' && owner === tc.id && tc.x !== tc.steerX) {
      out.push({ k: 'steer', tMs: t, dxPx: tc.x - tc.steerX });
      tc.steerX = tc.x;
    }

    // Rest tracking (fromRest). A parked thumb sends no samples (input/pointer.ts feeds every hardware sample,
    // coalesced ones included), so a slow segment since the previous sample means the rest began at that sample, and
    // a gap of more than restWinMs with no sample at all was a rest that ended about one sample interval before this
    // one: a thumb parked 60 ms then flicked hard is `fromRest` even though its first flick sample is fast (DESIGN
    // §4.2; without this it needed ~110 ms at 60 Hz). Tremor samples keep the 40 ms speed window (a dodge's
    // turnaround must not read as a rest).
    const gap = t - prevT;
    if (tc.moving && gap > RECOGNIZER_INTERNALS.restWinMs && tc.trail.length >= 3) {
      const iv = Math.min(RECOGNIZER_INTERNALS.speedWinMs, Math.max(4, prevT - tc.trail[tc.trail.length - 3]!.t));
      tc.lastRestLen = gap - iv; tc.motionStart = t - iv;
    }
    const vr = speed(tc, RECOGNIZER_INTERNALS.restWinMs);
    if (vr < config.restSpeed * k) {
      if (tc.moving) {
        tc.moving = false;
        const seg = Math.hypot(tc.fx - tc.trail[tc.trail.length - 2]!.fx, tc.fy - tc.trail[tc.trail.length - 2]!.fy);
        tc.restStart = seg / Math.max(1, t - prevT) < config.restSpeed * k ? prevT : t;
      }
    } else if (!tc.moving) {
      tc.moving = true; tc.lastRestLen = prevT - tc.restStart; tc.motionStart = prevT;
    }
    // Peak, dip and new rise after the last flick (re-fire rule).
    if (tc.fires > 0 && !tc.rose) {
      const v = speed(tc, RECOGNIZER_INTERNALS.speedWinMs);
      if (!tc.dipped) {
        tc.peak = Math.max(tc.peak, v);
        if (v < config.refireDip * tc.peak) { tc.dipped = true; tc.trough = v; }
      } else {
        tc.trough = Math.min(tc.trough, v);
        if (v >= Math.max(tc.trough / config.refireDip, (config.liftSwipeMinPx * k) / config.swipeWindowMs)) tc.rose = true;
      }
    }

    if (tc.state !== 'drag') return;
    const [wx, wy, ws] = windowDisp(tc, t);
    if (Math.hypot(wx, wy) < config.swipeMinPx * k) return;
    if (tc.fires > 0) {
      if (t - tc.lastFireMs < config.refireMs) return;
      if (Math.hypot(tc.fx - tc.fireFx, tc.fy - tc.fireFy) < config.swipeMinPx * k) return;
      if (!rearmed(tc) || inRecoil(tc, t, wx, wy)) return;
    }
    fire(tc, t, wx, wy, ws, out);
  }

  function end(tc: Touch, t: number, out: Gesture[], lifted = false): void {
    if (tc.state === 'hold') {
      const held = t - tc.downMs;
      const g: HoldEndExt = lifted && held > config.tapMaxMs && held <= config.longTapMaxMs ? { k: 'holdEnd', tMs: t, release: true }
        : { k: 'holdEnd', tMs: t };
      out.push(g);
    }
    if (tc.press) { tc.press = false; out.push({ k: 'press', tMs: t, down: false }); }
    if (owner === tc.id) owner = null;
    touches.delete(tc.id);
  }

  return {
    config,
    feed(s: PointerSample): Gesture[] {
      const out: Gesture[] = [];
      advance(s.tMs, out);
      if (s.phase === 'down') {
        const old = touches.get(s.id);
        if (old) end(old, s.tMs, out);                       // a lost up: treat it as a cancel
        ignored.delete(s.id);
        if (config.screenH > 0 && s.y > config.screenH - config.deadZoneBottomPx) { ignored.add(s.id); return out; }
        touches.set(s.id, {
          id: s.id, downMs: s.tMs, x0: s.x, y0: s.y, t: s.tMs, x: s.x, y: s.y, fx: s.x, fy: s.y,
          state: 'pending', press: true, maxD: 0, maxDx: 0, dragMs: Infinity, trail: [{ t: s.tMs, x: s.x, y: s.y, fx: s.x, fy: s.y }], steerX: s.x,
          fires: 0, lastFireMs: -Infinity, fireFx: s.x, fireFy: s.y, fireUx: 0, fireUy: 0, peak: 0, dipped: false, trough: Infinity, rose: false,
          moving: false, restStart: s.tMs, lastRestLen: 0, motionStart: s.tMs,
        });
        out.push({ k: 'press', tMs: s.tMs, down: true });
        return out;
      }
      if (ignored.has(s.id)) { if (s.phase !== 'move') ignored.delete(s.id); return out; }
      const tc = touches.get(s.id);
      if (!tc) return out;
      if (s.phase === 'cancel') { end(tc, s.tMs, out); return out; }
      if (s.phase === 'move' || s.x !== tc.x || s.y !== tc.y) move(tc, s, out);
      if (s.phase === 'move') return out;
      // up: tap, lift-off swipe, then the end of hold / press / ownership.
      const t = Math.max(tc.t, s.tMs);
      if (tc.state !== 'drag' && t - tc.downMs <= config.tapMaxMs) out.push({ k: 'tap', tMs: t });
      if (tc.state === 'drag' && (tc.fires === 0 || (t - tc.lastFireMs >= config.liftSuppressMs && rearmed(tc)))) {
        const [wx, wy, ws] = windowDisp(tc, t);
        if (Math.hypot(wx, wy) >= config.liftSwipeMinPx * config.k && !inRecoil(tc, t, wx, wy)) fire(tc, t, wx, wy, ws, out);
      }
      // Sloppy tap: a short jab that drifted a little past SLOP (thumbs roll on the glass) is still an ollie.
      if (tc.state === 'drag' && tc.fires === 0 && t - tc.downMs <= config.sloppyTapMs
        && tc.maxD < config.sloppyTapMaxPx * config.k && tc.maxDx < config.sloppyTapMaxDxPx * config.k) out.push({ k: 'tap', tMs: t });
      end(tc, t, out, true);
      return out;
    },
    tick(nowMs: number): Gesture[] {
      const out: Gesture[] = [];
      advance(nowMs, out);
      return out;
    },
    reset() { touches.clear(); ignored.clear(); owner = null; },
  };
}
