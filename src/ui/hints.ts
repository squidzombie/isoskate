// ui/hints.ts: the first-runs hint (DESIGN §12.3, §12.5; TECH §9). game/onboarding.ts decides WHEN (hud.hint(id));
// this file decides HOW it looks:
//   - a text chip, position: fixed ~13% above the bottom, pointer-events: none, never a touch target (no data-hud);
//   - touch: a ghost thumb inside a faint "rest here" ring 10–16% from the bottom (runs 1–3), below the skater so a
//     resting thumb doesn't cover it; the ghost acts the gesture (drag, tap, flick, hold) with transform/opacity only;
//   - keys (fine pointer): chunky key caps in the chip instead ("[A] [D] TO STEER").
import { h, setText } from './h';
import { REST_MARK_SEC } from './ui.config';

export type Gesture = 'drag' | 'tap' | 'swipeL' | 'swipeD' | 'swipeUR' | 'hold';
export interface HintText { touch: string; keys: string; caps: readonly string[]; keysLabel: string; gesture: Gesture }

/** Hint texts by core HintId: `touch` wording on coarse pointers, `keys` wording (and caps) on fine pointers. */
export const HINT_TEXT: Readonly<Record<string, HintText>> = {
  drag: { touch: 'DRAG TO STEER', keys: 'A / D TO STEER', caps: ['A', 'D'], keysLabel: 'TO STEER', gesture: 'drag' },
  tap: { touch: 'TAP TO OLLIE', keys: 'SPACE TO OLLIE', caps: ['SPACE'], keysLabel: 'TO OLLIE', gesture: 'tap' },
  grind: { touch: 'OLLIE ONTO THE LEDGE', keys: 'OLLIE ONTO THE LEDGE', caps: ['SPACE'], keysLabel: 'ONTO THE LEDGE', gesture: 'tap' },
  pick: { touch: 'SWIPE ↓ INTO THE RAIL', keys: '↓ INTO THE RAIL', caps: ['↓'], keysLabel: 'INTO THE RAIL', gesture: 'swipeD' },
  flip: { touch: 'FLICK ← IN THE AIR', keys: '← IN THE AIR', caps: ['←'], keysLabel: 'IN THE AIR', gesture: 'swipeL' },
  avoid: { touch: 'STEER AROUND TALL STUFF', keys: 'STEER AROUND TALL STUFF', caps: ['A', 'D'], keysLabel: 'AROUND TALL STUFF', gesture: 'drag' },
  manual: { touch: 'HOLD TO MANUAL', keys: 'HOLD S TO MANUAL', caps: ['S'], keysLabel: 'HOLD TO MANUAL', gesture: 'hold' },
  transfer: { touch: 'OLLIE TO THE NEXT RAIL', keys: 'OLLIE TO THE NEXT RAIL', caps: ['SPACE'], keysLabel: 'TO THE NEXT RAIL', gesture: 'tap' },
  spin: { touch: 'SWIPE ↗ TO SPIN', keys: '↑ + → TO SPIN', caps: ['↑', '→'], keysLabel: 'TO SPIN', gesture: 'swipeUR' },
  pit: { touch: 'OLLIE THE TRENCH', keys: 'OLLIE THE TRENCH', caps: ['SPACE'], keysLabel: 'THE TRENCH', gesture: 'tap' },
};

export { REST_MARK_SEC };

export interface Hints {
  readonly els: readonly HTMLElement[];
  readonly current: string | null;
  set(id: string | null): void;
  /** Every HUD frame (state toggles only on change; no layout reads). */
  update(t: number, crashed?: boolean): void;
  setFirstRuns(on: boolean): void;
  hide(): void;
}

export function createHints(coarse: () => boolean, onShown?: (id: string) => void): Hints {
  const text = h('span', { class: 'hint-text' }, '');
  const caps = h('span', { class: 'hint-caps' });
  const chip = h('div', { class: 'hud-hint', 'data-hint': '', role: 'status' }, caps, text);
  const ghost = h('i', { class: 'ghost-thumb', 'aria-hidden': 'true' });
  const rest = h('div', { class: 'rest-mark', 'aria-hidden': 'true' }, h('span', null, 'REST HERE'), ghost);
  let id: string | null = null, firstRuns = false, restOn = false, touch = true;
  const setRest = (on: boolean) => { if (on !== restOn) { restOn = on; rest.classList.toggle('on', on); chip.classList.toggle('raised', on); } };
  const hints: Hints = {
    els: [rest, chip],
    get current() { return id; },
    set(next) {
      if (next === id) return;
      id = next;
      const t = next ? HINT_TEXT[next] : undefined;
      if (t) {
        touch = coarse();
        caps.replaceChildren(...(touch ? [] : t.caps.map((c) => h('kbd', { class: c.length > 1 ? 'wide' : '' }, c))));
        setText(text, touch ? t.touch : t.caps.length ? t.keysLabel : t.keys);
        chip.dataset.hint = next!;
        rest.dataset.gesture = t.gesture;
        onShown?.(next!);
      }
      chip.classList.toggle('on', !!t);
      chip.classList.toggle('keys', !!t && !touch);
      ghost.classList.toggle('on', !!t && touch);
    },
    update(t, crashed = false) { setRest(!crashed && firstRuns && touch && (id !== null || t < REST_MARK_SEC)); },
    setFirstRuns(on) { firstRuns = on; touch = coarse(); if (!on) setRest(false); },
    hide() { hints.set(null); setRest(false); },
  };
  return hints;
}
