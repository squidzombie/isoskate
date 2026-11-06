// input/recognizer.ts: per-pointer gesture recognizer, pure (no DOM, no clocks; time comes from the samples).
// M0 stub: PENDING → HOLD (200 ms still) or DRAG (≥ SLOP, permanent); TAP on a still release ≤ 350 ms;
// steering from the first DRAG touch; a basic swipe detector (≥ 32·k px inside 80 ms, one fire per 90 ms, 8 sectors).
// TODO(M0-io/GP): the full DESIGN §4.2 grammar: fromRest/steer labels, arc compensation, recoil mask, re-fire dip,
// lift-off swipes and their suppression, swipeDx since touch-down, simpleTricks, dead zone, misfire traces (§7.4).
import type { Dir8 } from '../core/ids';
import type { Gesture, GestureRecognizer, PointerSample, RecognizerConfig } from '../core/input';

export const DEFAULT_RECOGNIZER: Readonly<RecognizerConfig> = {
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
};

interface Touch {
  id: number; downMs: number; x0: number; y0: number; x: number; y: number;
  state: 'pending' | 'hold' | 'drag';
  trail: { t: number; x: number; y: number }[];
  lastFireMs: number; fireX: number; fireY: number;
}

/** 8 screen-space sectors (screen y grows downward): cardinals ±cardinalHalfDeg, the diagonals take the rest. */
export function sectorOf(dx: number, dy: number, cfg: Pick<RecognizerConfig, 'cardinalHalfDeg' | 'simpleTricks'>): Dir8 {
  const a = (((Math.atan2(-dy, dx) * 180) / Math.PI) + 360) % 360;   // 0 = right, 90 = up
  const dist = (b: number) => Math.abs(((a - b + 540) % 360) - 180);
  const cardinals: [Dir8, number][] = [['r', 0], ['u', 90], ['l', 180], ['d', 270]];
  for (const [d, c] of cardinals) if (dist(c) <= cfg.cardinalHalfDeg) return d;
  if (cfg.simpleTricks) return cardinals.reduce((best, c) => (dist(c[1]) < dist(best[1]) ? c : best))[0];
  return a < 90 ? 'ur' : a < 180 ? 'ul' : a < 270 ? 'dl' : 'dr';
}

export function createRecognizerImpl(partial?: Partial<RecognizerConfig>): GestureRecognizer {
  const config: RecognizerConfig = { ...DEFAULT_RECOGNIZER, ...partial };
  const touches = new Map<number, Touch>();
  let owner: number | null = null;

  function swipeCheck(t: Touch, out: Gesture[], nowMs: number): void {
    const k = config.k;
    while (t.trail.length > 1 && nowMs - t.trail[0]!.t > config.swipeWindowMs) t.trail.shift();
    const first = t.trail[0]!;
    const dx = t.x - first.x, dy = t.y - first.y;
    const dist = Math.hypot(dx, dy);
    if (dist < config.swipeMinPx * k) return;
    if (nowMs - t.lastFireMs < config.refireMs) return;
    if (Math.hypot(t.x - t.fireX, t.y - t.fireY) < config.swipeMinPx * k) return;
    t.lastFireMs = nowMs; t.fireX = t.x; t.fireY = t.y;
    out.push({ k: 'swipe', tMs: nowMs, dir: sectorOf(dx, dy, config), dxPx: dx, fast: dist >= config.fastMinPx * k,
      fromRest: false, steer: owner === t.id && nowMs - t.downMs > config.steerStrokeMs });
  }

  return {
    config,
    feed(s: PointerSample): Gesture[] {
      const out: Gesture[] = [];
      if (s.phase === 'down') {
        touches.set(s.id, { id: s.id, downMs: s.tMs, x0: s.x, y0: s.y, x: s.x, y: s.y, state: 'pending',
          trail: [{ t: s.tMs, x: s.x, y: s.y }], lastFireMs: -Infinity, fireX: s.x, fireY: s.y });
        out.push({ k: 'press', tMs: s.tMs, down: true });
        return out;
      }
      const t = touches.get(s.id);
      if (!t) return out;
      if (s.phase === 'move') {
        const px = t.x;
        t.x = s.x; t.y = s.y;
        t.trail.push({ t: s.tMs, x: s.x, y: s.y });
        if (t.state !== 'drag' && Math.hypot(s.x - t.x0, s.y - t.y0) >= config.slopPx) {
          if (t.state === 'hold') out.push({ k: 'holdEnd', tMs: s.tMs });
          t.state = 'drag';
          out.push({ k: 'press', tMs: s.tMs, down: false });
          if (owner === null) { owner = t.id; out.push({ k: 'steer', tMs: s.tMs, dxPx: s.x - t.x0 }); }
        } else if (t.state === 'drag' && owner === t.id) {
          out.push({ k: 'steer', tMs: s.tMs, dxPx: s.x - px });
        }
        if (t.state === 'drag') swipeCheck(t, out, s.tMs);
        return out;
      }
      // up / cancel
      if (s.phase === 'up' && t.state !== 'drag' && s.tMs - t.downMs <= config.tapMaxMs) out.push({ k: 'tap', tMs: s.tMs });
      if (t.state === 'hold') out.push({ k: 'holdEnd', tMs: s.tMs });
      if (t.state !== 'drag') out.push({ k: 'press', tMs: s.tMs, down: false });
      if (owner === t.id) owner = null;
      touches.delete(s.id);
      return out;
    },
    tick(nowMs: number): Gesture[] {
      const out: Gesture[] = [];
      for (const t of touches.values()) {
        if (t.state === 'pending' && nowMs - t.downMs >= config.holdMs) { t.state = 'hold'; out.push({ k: 'holdStart', tMs: t.downMs + config.holdMs }); }
      }
      return out;
    },
    reset() { touches.clear(); owner = null; },
  };
}
