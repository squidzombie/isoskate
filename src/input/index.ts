// input/: pointer, keyboard (and later gamepad) → one InputFrame per sim tick. Public surface (TECH §4.13).
//   recognizer.ts  pure per-touch gesture recognizer (DESIGN §4.2): createRecognizer
//   keyboard.ts    presets A/B with the 80 ms diagonal amend (DESIGN §4.6)
//   frames.ts      timestamped gesture queue → InputFrame per tick (binning, one swipe per tick)
//   pipeline.ts    recognizer + keyboard + frames without DOM (debug API, bots)
//   pointer.ts     DOM pointer binding on #play (capture, coalesced events)
import type { GestureRecognizer, InputFrame, InputSource, PointerSample, RecognizerConfig } from '../core/input';
import { EMPTY_FRAME } from '../core/input';
import { clamp } from '../core/math';
import { SENSITIVITY_MAX, SENSITIVITY_MIN } from './frames';
import { InputPipeline } from './pipeline';
import { bindPointer } from './pointer';
import { createRecognizerImpl, type RecognizerConfigExt } from './recognizer';

/** The DOM input source: `inject` (core InputSource.inject?, added @G0) is always present, plus the live pipeline. */
export interface InjectableInput extends InputSource {
  inject(samples: readonly PointerSample[], atMs?: number): void;
  /** The live pipeline (debug tooling: tuning panel, overlays). */
  readonly pipeline: InputPipeline;
}
export const isInjectable = (s: InputSource): s is InjectableInput => typeof (s as Partial<InjectableInput>).inject === 'function';

/** `k = clamp(screenW / 390, 0.85, 1.3)`: every recognizer threshold in px is scaled by it (DESIGN units). */
export const kForWidth = (screenW: number) => clamp(screenW / 390, 0.85, 1.3);

/** `screenH` (optional, added @G1): the cached viewport height, so a touch-down never reads layout (TECH §9; MU's
 *  layout guard counted window.innerHeight on every down). Without it the recognizer falls back to innerHeight. */
export function createInput(el: HTMLElement, opts: { screenW: () => number; safeBottom: () => number; screenH?: () => number }): InputSource {
  const pipe = new InputPipeline(opts.screenW);
  const cfg = pipe.rec.config;
  let enabled = false;
  const anyListeners = new Set<() => void>();
  /** Screen metrics follow the live viewport (rotation, toolbars): k, arc compensation width, dead zone. */
  const syncMetrics = () => {
    const w = opts.screenW();
    cfg.k = kForWidth(w);
    cfg.screenW = w;
    cfg.screenH = opts.screenH ? opts.screenH() : typeof window !== 'undefined' ? window.innerHeight : 0;
    cfg.deadZoneBottomPx = opts.safeBottom() + 12;
  };
  syncMetrics();
  const pointer = bindPointer(el, (s) => { if (s.phase === 'down') syncMetrics(); pipe.feed(s); }, () => enabled);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!pipe.keys.isGameKey(e.code)) return;
    if (enabled) e.preventDefault();
    pipe.keyDown(e.code, e.timeStamp, e.repeat, enabled);
  };
  const onKeyUp = (e: KeyboardEvent) => pipe.keyUp(e.code);
  const onBlur = () => pipe.keys.clear();
  const onAny = () => { for (const f of anyListeners) f(); };
  const ACTIVATION = ['pointerup', 'touchend', 'click', 'keydown'] as const;   // user activation (audio unlock)

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  for (const t of ACTIVATION) window.addEventListener(t, onAny, { capture: true, passive: true });

  const source: InjectableInput = {
    pipeline: pipe,
    frame(tickEndMs: number): InputFrame {
      const f = pipe.frame(tickEndMs);
      return enabled ? f : { ...EMPTY_FRAME };
    },
    setEnabled(on: boolean) {
      if (on === enabled) return;
      enabled = on;
      pipe.reset();
      pointer.forget();
    },
    setSensitivity(mult: number) { pipe.frames.sensitivity = clamp(mult, SENSITIVITY_MIN, SENSITIVITY_MAX); },
    setPreset(p: 'A' | 'B') { pipe.keys.preset = p; pipe.keys.clear(); },
    setSimpleTricks(on: boolean) { cfg.simpleTricks = on; },
    onAnyInput(f: () => void) { anyListeners.add(f); return () => { anyListeners.delete(f); }; },
    inject(samples, atMs) {
      if (!samples.length) return;
      syncMetrics();
      pipe.schedule(samples, (atMs ?? performance.now()) - samples[0]!.tMs);
    },
    dispose() {
      pointer.dispose();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      for (const t of ACTIVATION) window.removeEventListener(t, onAny, { capture: true });
      anyListeners.clear();
    },
  };
  return source;
}

/** Pure recognizer (no DOM): also used by the thumb bot on synthetic traces (`cfg.screenW` / `screenH` included). */
export function createRecognizer(cfg?: Partial<RecognizerConfig>): GestureRecognizer {
  return createRecognizerImpl(cfg as Partial<RecognizerConfigExt> | undefined);
}

export { DEFAULT_RECOGNIZER, RECOGNIZER_INTERNALS, arcCompensate, directionOf, screenAngle, sectorOf, sectorOfAngle,
  type HoldEndExt, type Recognizer, type RecognizerConfigExt } from './recognizer';
export { FrameBuilder, NO_KEYS, steerMetresPerPx, type KeyEdge, type KeyLevels } from './frames';
export { KEY_AMEND_MS, KeyboardMapper, diagonalOf, type KeyPreset } from './keyboard';
export { InputPipeline } from './pipeline';
