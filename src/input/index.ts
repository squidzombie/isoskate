// input/: pointer, keyboard and gamepad → InputFrame per tick (GP; M0-io in P2). Public surface (TECH §4.13).
import type { GestureRecognizer, InputSource, RecognizerConfig } from '../core/input';
import { createDomInput } from './dom';
import { createRecognizerImpl } from './recognizer';

export function createInput(el: HTMLElement, opts: { screenW: () => number; safeBottom: () => number }): InputSource {
  return createDomInput(el, opts);
}

/** Pure recognizer (no DOM): also used by the thumb bot on synthetic traces. */
export function createRecognizer(cfg?: Partial<RecognizerConfig>): GestureRecognizer {
  return createRecognizerImpl(cfg);
}

export { DEFAULT_RECOGNIZER, sectorOf } from './recognizer';
export { FrameBuilder } from './frames';
