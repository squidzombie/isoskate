// input/dom.ts: DOM binding: pointer events on the play layer → recognizer → frames; keyboard preset A.
// M0 stub: basic tap/drag/swipe through the stub recognizer, keyboard preset A without the 80 ms amend.
// TODO(M0-io): coalesced events, preset B, the amend rule, gamepad, full §7.3 key handling.
import type { Dir8 } from '../core/ids';
import type { GestureRecognizer, InputFrame, InputSource } from '../core/input';
import { FrameBuilder } from './frames';
import { createRecognizerImpl } from './recognizer';

const ARROWS: Record<string, Dir8> = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r' };
const GAME_KEYS = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createDomInput(el: HTMLElement, opts: { screenW: () => number; safeBottom: () => number }): InputSource {
  const rec: GestureRecognizer = createRecognizerImpl();
  const frames = new FrameBuilder(opts.screenW);
  let enabled = false;
  let preset: 'A' | 'B' = 'A';
  const held = new Set<string>();
  const anyListeners = new Set<() => void>();
  const ignored = new Set<number>();

  const feed = (id: number, tMs: number, x: number, y: number, phase: 'down' | 'move' | 'up' | 'cancel') => {
    for (const g of rec.feed({ id, tMs, x, y, phase })) frames.push(g);
  };
  const onDown = (e: PointerEvent) => {
    if (!enabled) return;
    if (e.pointerType === 'touch' && e.clientY > window.innerHeight - (opts.safeBottom() + 12)) { ignored.add(e.pointerId); return; }
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    feed(e.pointerId, e.timeStamp, e.clientX, e.clientY, 'down');
  };
  const onMove = (e: PointerEvent) => {
    if (!enabled || ignored.has(e.pointerId)) return;
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (list.length) for (const c of list) feed(e.pointerId, c.timeStamp || e.timeStamp, c.clientX, c.clientY, 'move');
    else feed(e.pointerId, e.timeStamp, e.clientX, e.clientY, 'move');
  };
  const onUp = (e: PointerEvent) => {
    if (ignored.delete(e.pointerId) || !enabled) return;
    feed(e.pointerId, e.timeStamp, e.clientX, e.clientY, e.type === 'pointercancel' ? 'cancel' : 'up');
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!enabled || !GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    held.add(e.code);
    if (e.code === 'Space' || e.code === 'KeyW') frames.pushKey({ tMs: e.timeStamp, tap: true });
    const dir = ARROWS[e.code];
    if (dir && preset === 'A') frames.pushKey({ tMs: e.timeStamp, swipe: dir });
  };
  const onKeyUp = (e: KeyboardEvent) => { held.delete(e.code); };
  const onAny = () => { for (const f of anyListeners) f(); };
  const onBlur = () => held.clear();

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  for (const t of ['pointerup', 'touchend', 'click', 'keydown'] as const) window.addEventListener(t, onAny, { capture: true, passive: true });

  return {
    frame(tickEndMs: number): InputFrame {
      for (const g of rec.tick(tickEndMs)) frames.push(g);
      const axis = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
      return frames.frame(tickEndMs, {
        steerAxis: enabled ? axis : 0,
        manualKey: enabled && (held.has('KeyS') || held.has('ShiftLeft') || held.has('ShiftRight')),
        grab: enabled && held.has('KeyQ'),
      });
    },
    setEnabled(on: boolean) {
      if (on === enabled) return;
      enabled = on;
      rec.reset(); frames.clear(); held.clear(); ignored.clear();
    },
    setSensitivity(mult: number) { frames.sensitivity = Math.min(1.6, Math.max(0.6, mult)); },
    setPreset(p: 'A' | 'B') { preset = p; },
    setSimpleTricks(on: boolean) { rec.config.simpleTricks = on; },
    onAnyInput(f: () => void) { anyListeners.add(f); return () => { anyListeners.delete(f); }; },
    dispose() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      for (const t of ['pointerup', 'touchend', 'click', 'keydown'] as const) window.removeEventListener(t, onAny, { capture: true });
      anyListeners.clear();
    },
  };
}
