// ui/modal.ts: one modal at a time over the current screen (the rewards modal, the crate reveal, Back up / Restore,
// confirmations). It lives in #screens, takes the touches it covers, and Esc closes a dismissable one before the
// App sees the key (capture listener). Motion: transform/opacity only.
import { h } from './h';
import type { Modal } from './screens/common';

export function createModal(host: HTMLElement): Modal & { readonly layer: HTMLElement } {
  const card = h('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true' });
  const layer = h('div', { class: 'modal-layer' }, card);
  layer.inert = true;
  host.append(layer);
  let onClose: (() => void) | undefined;
  let dismissable = true;
  let isOpen = false;
  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    layer.className = 'modal-layer';
    layer.inert = true;
    const f = onClose; onClose = undefined;
    f?.();
  };
  layer.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === layer && dismissable) close(); });
  layer.addEventListener('pointerdown', (e) => e.stopPropagation());
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (!isOpen || e.code !== 'Escape') return;
      e.stopImmediatePropagation(); e.preventDefault();
      if (dismissable) close();
    }, true);
  }
  return {
    layer,
    get open() { return isOpen; },
    show(content, o = {}) {
      if (isOpen) { const f = onClose; onClose = undefined; f?.(); }
      card.className = `modal-card ${o.cls ?? ''}`;
      layer.className = `modal-layer on ${o.cls ? `${o.cls}-layer` : ''}`;
      card.replaceChildren(content);
      onClose = o.onClose;
      dismissable = o.dismissable ?? true;
      isOpen = true;
      layer.inert = false;
    },
    close,
  };
}
