// game/: app flow, loop, wiring and run sessions (INT). Entry point for main.ts.
import { checkCompat } from '../platform';
import { wire, type Game } from './wiring';

/** Boot: browser checks (TECH §10.8), then wire everything and show the Title. */
export function boot(root: HTMLElement | null = document.getElementById('app')): Game | null {
  if (!root) throw new Error('#app missing');
  const compat = checkCompat();
  if (!compat.ok) {
    const card = document.getElementById('boot-fail');
    if (card) {
      card.textContent = `This browser is too old for Dusklane (missing ${compat.missing.join(', ')}). Try a current Safari, Chrome, Edge or Firefox.`;
      card.style.display = 'flex';
    }
    return null;
  }
  return wire(root);
}
