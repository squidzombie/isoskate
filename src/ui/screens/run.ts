// ui/screens/run.ts: the run overlays (DESIGN §17.2):
//   Crash  — "BAILED!" sticker, ONE cause line that teaches, the lost combo struck through, "Tap to roll again" from
//            0.6 s. It never takes pointer events, so the retry touch reaches #play and game/app.ts.
//   Pause  — Resume / Restart / Settings / Home, the key list on desktop, and the "Rotate to portrait" card.
import { fmtScore } from '../format';
import { isMetaExt } from '../../meta';
import { h, setText } from '../h';
import { btn, finePointer, section, type Screen, type ScreenCtx } from './common';

export function crashScreen(): Screen {
  const cause = h('div', { class: 'cause' }, '');
  const lost = h('div', { class: 'lost' }, h('s', null, ''), h('span', null, ' lost'));
  const tap = h('div', { class: 'tap' }, 'TAP TO ROLL AGAIN');
  const el = section('crash', 'clear crash', h('div', { class: 'sticker' }, 'BAILED!'), cause, lost, tap);
  let flip = false;
  return {
    id: 'crash', el,
    show(p) {
      setText(cause, p.cause ?? '');
      cause.style.display = p.cause ? '' : 'none';
      setText(lost.firstChild as HTMLElement, p.lost ? `−${fmtScore(p.lost)}` : '');
      lost.style.display = p.lost ? '' : 'none';
      // Restart the 0.6 s reveal and the sticker slap by swapping animation classes (no layout read).
      flip = !flip;
      el.classList.toggle('a', flip); el.classList.toggle('b', !flip);
    },
  };
}

export function pauseScreen(ctx: ScreenCtx): Screen {
  const title = h('h2', null, 'PAUSED');
  const note = h('div', { class: 'note' }, '');
  const phone = h('div', { class: 'phone', 'aria-hidden': 'true' }, h('i'));
  const keys = h('div', { class: 'keys' });
  // The key list of the preset in use (DESIGN §4.6): A = A/D + arrows, B = ←/→ + IJKL/UONM.
  const KEYS: Readonly<Record<'A' | 'B', readonly (readonly [string, string])[]>> = {
    A: [['A D', 'steer'], ['Space', 'ollie'], ['← → ↑ ↓', 'flip · spin · pick'], ['S', 'manual'], ['Q', 'grab'], ['Esc', 'pause']],
    B: [['← →', 'steer'], ['Space', 'ollie'], ['I J K L', 'flip · spin · pick'], ['U O N M', 'diagonals'], ['Shift', 'manual'], ['Q', 'grab'], ['Esc', 'pause']],
  };
  let keysFor: 'A' | 'B' | null = null;
  const fillKeys = (preset: 'A' | 'B') => {
    if (preset === keysFor) return;
    keysFor = preset;
    keys.replaceChildren(...KEYS[preset].map(([k, v]) => h('div', { class: 'keyrow' }, h('kbd', null, k), h('span', null, v))));
  };
  const resume = btn('Resume', { k: 'resume' }, ctx, 'primary big');
  const card = h('div', { class: 'pause-card' },
    phone, title, note, resume,
    h('div', { class: 'row' }, btn('Restart', { k: 'restart' }, ctx), btn('Home', { k: 'home' }, ctx, '', undefined, 'back')),
    btn('Settings', { k: 'open', screen: 'settings' }, ctx, 'small'), keys);
  const el = section('pause', 'dim pause', card);
  return {
    id: 'pause', el,
    show(p) {
      setText(title, p.rotate ? 'ROTATE TO PORTRAIT' : 'PAUSED');
      setText(note, p.rotate ? 'Dusklane plays in portrait. Turn your phone upright, then tap Resume.' : 'Take a breath. Your run waits right here.');
      card.classList.toggle('rotate', !!p.rotate);
      phone.style.display = p.rotate ? '' : 'none';
      keys.style.display = finePointer() && !p.rotate ? '' : 'none';
      const m = ctx.meta();
      fillKeys(isMetaExt(m) && m.data.settings.keyPreset === 'B' ? 'B' : 'A');
    },
  };
}
