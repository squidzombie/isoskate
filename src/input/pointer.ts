// input/pointer.ts: DOM pointer binding (TECH §7.1): pointerdown/move/up/cancel on #play → PointerSamples, with
// setPointerCapture (a drag that leaves the element keeps reporting) and getCoalescedEvents when present (every
// hardware sample between two frames, with its own timeStamp). event.timeStamp shares performance.now()'s clock, so
// the loop bins each gesture into the tick its timestamp falls in. Mouse drag behaves exactly like touch (primary
// button only); a mouse that moves without a button down is ignored by the recognizer (unknown pointer id).
import type { PointerSample } from '../core/input';

export interface PointerBinding { forget(): void; dispose(): void }

export function bindPointer(el: HTMLElement, sink: (s: PointerSample) => void, enabled: () => boolean): PointerBinding {
  const live = new Set<number>();
  const sample = (e: PointerEvent, phase: PointerSample['phase']): PointerSample =>
    ({ id: e.pointerId, tMs: e.timeStamp, x: e.clientX, y: e.clientY, phase });

  const onDown = (e: PointerEvent) => {
    if (!enabled() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already released pointer */ }
    live.add(e.pointerId);
    sink(sample(e, 'down'));
  };
  const onMove = (e: PointerEvent) => {
    if (!live.has(e.pointerId)) return;
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (list.length > 1) {
      for (const c of list) sink({ id: e.pointerId, tMs: c.timeStamp || e.timeStamp, x: c.clientX, y: c.clientY, phase: 'move' });
    } else sink(sample(e, 'move'));
  };
  const onEnd = (e: PointerEvent) => {
    if (!live.delete(e.pointerId)) return;
    sink(sample(e, e.type === 'pointercancel' ? 'cancel' : 'up'));
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onEnd);
  el.addEventListener('pointercancel', onEnd);
  return {
    /** setEnabled(false) mid-touch (pause): the pipeline was reset, so stop forwarding the touches that are down. */
    forget() { live.clear(); },
    dispose() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
      live.clear();
    },
  };
}
