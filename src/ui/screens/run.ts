// ui/screens/run.ts: the run overlays at stub fidelity (DESIGN §17.2): Crash (BAILED! sticker, one cause line, the
// lost combo struck through, "Tap to roll again" from 0.6 s; it never takes pointer events, so the retry touch reaches
// #play and game/app.ts), Pause (Resume, Restart, Home, Settings, the key list on desktop, and the "Rotate to portrait" card),
// and Results (score, NEW BEST, breakdown, coin tally, XP and level, one next goal, a huge ROLL AGAIN in the thumb
// zone, small Locker / Shop / Home).
import { areaName, fmtScore } from '../format';
import { h, setText } from '../h';
import { btn, finePointer, section, type Screen, type ScreenCtx } from './common';

export function crashScreen(): Screen {
  const cause = h('div', { class: 'line cause' }, '');
  const lost = h('s', { class: 'lost' }, '');
  const tap = h('div', { class: 'tap' }, 'TAP TO ROLL AGAIN');
  const el = section('crash', 'clear', h('div', { class: 'sticker' }, 'BAILED!'), cause, lost, tap);
  return {
    id: 'crash', el,
    show(p) {
      setText(cause, p.cause ?? '');
      setText(lost, p.lost ? `−${fmtScore(p.lost)}` : '');
      // Restart the 0.6 s reveal by swapping animation names (no layout read).
      tap.classList.toggle('alt', !tap.classList.contains('alt'));
    },
  };
}

export function pauseScreen(ctx: ScreenCtx): Screen {
  const { raise } = ctx;
  const title = h('h2', null, 'PAUSED');
  const note = h('div', { class: 'line' }, '');
  const phone = h('div', { class: 'phone', 'aria-hidden': 'true' });
  const keys = h('div', { class: 'keys' },
    'A / D steer · Space ollie · arrows flip, spin, pick · S manual · Q grab · Esc pause');
  const el = section('pause', 'dim',
    phone, title, note, btn('Resume', { k: 'resume' }, raise, 'primary'),
    h('div', { class: 'row' }, btn('Restart', { k: 'restart' }, raise), btn('Home', { k: 'home' }, raise)),
    btn('Settings', { k: 'open', screen: 'settings' }, raise, 'small'), keys);
  return {
    id: 'pause', el,
    show(p) {
      setText(title, p.rotate ? 'ROTATE TO PORTRAIT' : 'PAUSED');
      setText(note, p.rotate ? 'Dusklane plays in portrait.' : '');
      phone.style.display = p.rotate ? '' : 'none';
      keys.style.display = finePointer() && !p.rotate ? '' : 'none';
    },
  };
}

export function resultsScreen(ctx: ScreenCtx): Screen {
  const { raise } = ctx;
  const head = h('h2', null, 'RESULTS');
  const score = h('div', { class: 'big' }, '0');
  const cell = (label: string) => { const v = h('b', null, '—'); return [h('div', { class: 'cell' }, h('span', null, label), v), v] as const; };
  const [cTricks, vTricks] = cell('Tricks'), [cDist, vDist] = cell('Distance'), [cCombo, vCombo] = cell('Best combo'), [cArea, vArea] = cell('Furthest');
  const coins = h('div', { class: 'line coins' }, '');
  const xpFill = h('i', null);
  const xpText = h('div', { class: 'line small' }, '');
  const goal = h('div', { class: 'line goal' }, '');
  const el = section('results', 'dim',
    head, score, h('div', { class: 'grid' }, cTricks, cDist, cCombo, cArea), coins,
    h('div', { class: 'xp' }, xpFill), xpText, goal, h('div', { class: 'spacer' }),
    btn('Roll again', { k: 'retry' }, raise, 'primary huge'),
    h('div', { class: 'row' }, btn('Locker', { k: 'open', screen: 'locker' }, raise, 'small'),
      btn('Shop', { k: 'open', screen: 'shop' }, raise, 'small'), btn('Home', { k: 'home' }, raise, 'small')));
  return {
    id: 'results', el,
    show(p) {
      const r = p.result, w = p.rewards;
      setText(head, w?.newBest ? 'NEW BEST!' : 'RESULTS');
      head.classList.toggle('best', !!w?.newBest);
      setText(score, fmtScore(r?.score ?? 0));
      setText(vTricks, r ? fmtScore(r.trickPts) : '—');
      setText(vDist, r ? `${Math.floor(r.distance)} m` : '—');
      setText(vCombo, r ? fmtScore(r.bestCombo) : '—');
      setText(vArea, r ? areaName(r.furthestArea) : '—');
      const c = w?.coins;
      setText(coins, c ? `+${c.total} coins  (${c.pickups} picked · ${c.payouts} combos · ${c.score} score${c.warmup ? ` · ${c.warmup} warm-up` : ''})` : '');
      if (w) {
        const x = w.xp;
        setText(xpText, `+${x.gained} XP · Level ${x.levelAfter}${x.levelAfter > x.levelBefore ? '  LEVEL UP!' : ''}`);
        xpFill.style.transform = `scaleX(${Math.min(1, x.intoLevel / Math.max(1, x.toNext)).toFixed(3)})`;
      } else { setText(xpText, ''); xpFill.style.transform = 'scaleX(0)'; }
      setText(goal, w?.nextGoal.text ?? '');
    },
  };
}
