// ui/hints.ts: the first-runs hint (DESIGN §12.3, §12.5; TECH §9). game/onboarding.ts decides WHEN (hud.hint(id));
// this file decides HOW it looks:
//   - a text chip, position: fixed ~13% above the bottom, pointer-events: none, never a touch target (no data-hud);
//   - touch, two thumbs (the default controls, DESIGN §4.1): two "rest here" rings 10–16% from the bottom, one on
//     each side, labelled STEER (left; right with Swap sides) and TRICKS. The steering ring holds a ghost thumb with a
//     short ↔ arrow, the trick ring a ghost thumb that acts tap / flick / hold; the hint's own side acts, the other
//     rests faintly. A zone cue (two soft pads and a faint midline in the bottom band, below the skater and never in
//     the look-ahead zone) shows the split for the first ZONE_CUE.sec of the first runs and of a session's first run;
//   - touch, one thumb (classic): one ring in the middle with one ghost thumb (the G0 look);
//   - keys (fine pointer): chunky key caps in the chip instead ("[A] [D] TO STEER").
// Everything is transform / opacity / class toggles; nothing here reads layout.
import { h, setText } from './h';
import { REST_MARK_SEC, ZONE_CUE } from './ui.config';

export type Gesture = 'drag' | 'tap' | 'swipeL' | 'swipeD' | 'swipeUR' | 'hold';
/** Which thumb a hint is about in the two-thumb layout. */
export type HintSide = 'steer' | 'trick';
export interface HintText {
  /** One-thumb touch wording (the G0 chips). */
  touch: string;
  /** Two-thumb touch wording: {S} is the steering side, {T} the trick side ("LEFT" / "RIGHT", swapped by Swap sides). */
  twoThumb: string;
  side: HintSide;
  keys: string; caps: readonly string[]; keysLabel: string; gesture: Gesture;
}

/** Hint texts by core HintId: `touch` / `twoThumb` wording on coarse pointers, `keys` wording (and caps) on fine ones. */
export const HINT_TEXT: Readonly<Record<string, HintText>> = {
  drag: { touch: 'DRAG TO STEER', twoThumb: 'DRAG {S} THUMB TO STEER', side: 'steer', keys: 'A / D TO STEER', caps: ['A', 'D'], keysLabel: 'TO STEER', gesture: 'drag' },
  tap: { touch: 'TAP TO OLLIE', twoThumb: 'TAP {T} TO OLLIE', side: 'trick', keys: 'SPACE TO OLLIE', caps: ['SPACE'], keysLabel: 'TO OLLIE', gesture: 'tap' },
  grind: { touch: 'OLLIE ONTO THE LEDGE', twoThumb: 'OLLIE ONTO THE LEDGE', side: 'trick', keys: 'OLLIE ONTO THE LEDGE', caps: ['SPACE'], keysLabel: 'ONTO THE LEDGE', gesture: 'tap' },
  pick: { touch: 'SWIPE ↓ INTO THE RAIL', twoThumb: 'SWIPE ↓ INTO THE RAIL', side: 'trick', keys: '↓ INTO THE RAIL', caps: ['↓'], keysLabel: 'INTO THE RAIL', gesture: 'swipeD' },
  flip: { touch: 'FLICK ← IN THE AIR', twoThumb: 'FLICK ← ON THE {T}', side: 'trick', keys: '← IN THE AIR', caps: ['←'], keysLabel: 'IN THE AIR', gesture: 'swipeL' },
  avoid: { touch: 'STEER AROUND TALL STUFF', twoThumb: 'STEER AROUND TALL STUFF', side: 'steer', keys: 'STEER AROUND TALL STUFF', caps: ['A', 'D'], keysLabel: 'AROUND TALL STUFF', gesture: 'drag' },
  manual: { touch: 'HOLD TO MANUAL', twoThumb: 'HOLD {T} TO MANUAL', side: 'trick', keys: 'HOLD S TO MANUAL', caps: ['S'], keysLabel: 'HOLD TO MANUAL', gesture: 'hold' },
  transfer: { touch: 'OLLIE TO THE NEXT RAIL', twoThumb: 'OLLIE TO THE NEXT RAIL', side: 'trick', keys: 'OLLIE TO THE NEXT RAIL', caps: ['SPACE'], keysLabel: 'TO THE NEXT RAIL', gesture: 'tap' },
  spin: { touch: 'SWIPE ↗ TO SPIN', twoThumb: 'SWIPE ↗ TO SPIN', side: 'trick', keys: '↑ + → TO SPIN', caps: ['↑', '→'], keysLabel: 'TO SPIN', gesture: 'swipeUR' },
  pit: { touch: 'OLLIE THE TRENCH', twoThumb: 'OLLIE THE TRENCH', side: 'trick', keys: 'OLLIE THE TRENCH', caps: ['SPACE'], keysLabel: 'THE TRENCH', gesture: 'tap' },
};

export type Controls = 'two' | 'one';

/** The touch wording of a hint for the current controls. */
export function touchText(t: HintText, controls: Controls, swapSides: boolean): string {
  if (controls === 'one') return t.touch;
  const steer = swapSides ? 'RIGHT' : 'LEFT', trick = swapSides ? 'LEFT' : 'RIGHT';
  return t.twoThumb.replace('{S}', steer).replace('{T}', trick);
}

export { REST_MARK_SEC, ZONE_CUE };

export interface Hints {
  readonly els: readonly HTMLElement[];
  readonly current: string | null;
  set(id: string | null): void;
  /** Every HUD frame (state toggles only on change; no layout reads). */
  update(t: number, crashed?: boolean): void;
  /** At every run start: runs 1–3 of the profile get the rings (and the zone cue). */
  setFirstRuns(on: boolean): void;
  /** Touch controls from Settings (read at every run start): two thumbs (the default) or one, and Swap sides. */
  setControls(controls: Controls, swapSides: boolean): void;
  hide(): void;
}

export function createHints(coarse: () => boolean, onShown?: (id: string) => void): Hints {
  const text = h('span', { class: 'hint-text' }, '');
  const caps = h('span', { class: 'hint-caps' });
  const chip = h('div', { class: 'hud-hint', 'data-hint': '', role: 'status' }, caps, text);
  // One thumb: the G0 ring in the middle.
  const ghost = h('i', { class: 'ghost-thumb', 'aria-hidden': 'true' });
  const rest = h('div', { class: 'rest-mark', 'aria-hidden': 'true' }, h('span', null, 'REST HERE'), ghost);
  // Two thumbs: a steering ring (ghost + ↔ arrow) and a trick ring; Swap sides mirrors them.
  const ghostS = h('i', { class: 'ghost-thumb', 'aria-hidden': 'true' });
  const ghostT = h('i', { class: 'ghost-thumb', 'aria-hidden': 'true' });
  const restS = h('div', { class: 'rest-mark two steer', 'data-zone': 'steer', 'aria-hidden': 'true' },
    h('span', null, 'STEER'), h('b', { class: 'steer-arrow' }), ghostS);
  const restT = h('div', { class: 'rest-mark two trick', 'data-zone': 'trick', 'aria-hidden': 'true' }, h('span', null, 'TRICKS'), ghostT);
  const cue = h('div', { class: 'zone-cue', 'aria-hidden': 'true' },
    h('i', { class: 'zone-pad steer' }), h('i', { class: 'zone-mid' }), h('i', { class: 'zone-pad trick' }));
  let id: string | null = null, firstRuns = false, restOn = false, cueOn = false, touch = true, runs = 0;
  let controls: Controls = 'two', swap = false;
  const two = () => controls === 'two';
  const applyRest = () => {
    rest.classList.toggle('on', restOn && !two());
    restS.classList.toggle('on', restOn && two());
    restT.classList.toggle('on', restOn && two());
    chip.classList.toggle('raised', restOn);
  };
  const setRest = (on: boolean) => { if (on !== restOn) { restOn = on; applyRest(); } };
  const setCue = (on: boolean) => { if (on !== cueOn) { cueOn = on; cue.classList.toggle('on', on); } };
  /** The ghosts for the current hint: one thumb acts in the middle, or the hint's side acts and the other rests. */
  const ghosts = (t: HintText | undefined) => {
    const show = !!t && touch;
    ghost.classList.toggle('on', show && !two());
    ghostS.classList.toggle('on', show && two());
    ghostT.classList.toggle('on', show && two());
    ghostS.classList.toggle('idle', !!t && t.side !== 'steer');
    ghostT.classList.toggle('idle', !!t && t.side !== 'trick');
    if (t) {
      rest.dataset.gesture = t.gesture;
      restS.dataset.gesture = t.side === 'steer' ? t.gesture : 'rest';
      restT.dataset.gesture = t.side === 'trick' ? t.gesture : 'rest';
    }
  };
  const hints: Hints = {
    els: [cue, rest, restS, restT, chip],
    get current() { return id; },
    set(next) {
      if (next === id) return;
      id = next;
      const t = next ? HINT_TEXT[next] : undefined;
      if (t) {
        touch = coarse();
        caps.replaceChildren(...(touch ? [] : t.caps.map((c) => h('kbd', { class: c.length > 1 ? 'wide' : '' }, c))));
        setText(text, touch ? touchText(t, controls, swap) : t.caps.length ? t.keysLabel : t.keys);
        chip.dataset.hint = next!;
        onShown?.(next!);
      }
      chip.classList.toggle('on', !!t);
      chip.classList.toggle('keys', !!t && !touch);
      ghosts(t);
    },
    update(t, crashed = false) {
      setRest(!crashed && firstRuns && touch && (id !== null || t < REST_MARK_SEC));
      const cueRun = firstRuns || (ZONE_CUE.firstOfSession && runs === 1);
      setCue(!crashed && touch && two() && cueRun && t < ZONE_CUE.sec);
    },
    setFirstRuns(on) {
      runs++;
      firstRuns = on; touch = coarse();
      if (!on) setRest(false);
    },
    setControls(c, s) {
      if (c === controls && s === swap) return;
      controls = c; swap = s;
      for (const el of [restS, restT, cue]) el.classList.toggle('swap', s);
      applyRest();
      ghosts(id ? HINT_TEXT[id] : undefined);
    },
    hide() { hints.set(null); setRest(false); setCue(false); },
  };
  return hints;
}
