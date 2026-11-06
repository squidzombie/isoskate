// ui/hud.ts: M0 debug HUD in the 56 px band (+ safe-area top): score + distance, combo pill + last trick, coins and
// the pause button (48 px visible, 56 px hit area). Text writes at most 15 Hz and only on change; no layout reads.
// TODO(MU): DESIGN §13.8 HUD (roll-up, abbreviation, bank-timer ring, popups beside the skater, hints).
import type { HudApi, UiIntent } from '../core/ui';
import type { ScoreState, SkaterState } from '../core/sim';
import { h, setText } from './h';

export function fmtScore(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  return Math.round(n).toLocaleString('en-US');
}

export function createHud(root: HTMLElement, raise: (i: UiIntent) => void): HudApi & { lastTrick(name: string): void } {
  const score = h('div', { class: 'hud-score' }, '0');
  const dist = h('div', { class: 'hud-dist' }, '0 m');
  const combo = h('div', { class: 'hud-combo' }, '');
  const trick = h('div', { class: 'hud-trick' }, '');
  const coins = h('div', { class: 'hud-coins' }, '0');
  const pause = h('button', { class: 'hud-pause', 'aria-label': 'Pause', type: 'button',
    onpointerdown: (e: Event) => e.stopPropagation(),
    onclick: (e: Event) => { e.stopPropagation(); (e.currentTarget as HTMLElement).blur(); raise({ k: 'pause' }); } },
  h('span', null, 'II'));
  root.replaceChildren(
    h('div', { class: 'hud-left' }, score, dist),
    h('div', { class: 'hud-mid' }, combo, trick),
    h('div', { class: 'hud-right' }, coins, pause),
  );
  let acc = 1;
  let trickTtl = 0;
  return {
    show(on: boolean) { root.classList.toggle('on', on); },
    update(sc: Readonly<ScoreState>, cur: Readonly<SkaterState>, dt: number, _anchor: { x: number; y: number }) {
      acc += dt;
      trickTtl -= dt;
      if (acc < 1 / 15) return;
      acc = 0;
      setText(score, fmtScore(sc.total));
      setText(dist, `${Math.floor(sc.distancePts)} m · ${cur.vel.s.toFixed(1)} m/s`);
      setText(coins, `● ${sc.coins}`);
      const c = sc.combo;
      combo.classList.toggle('on', c.active);
      if (c.active) setText(combo, `${fmtScore(c.pending)} × ${Math.max(1, c.links)}`);
      if (trickTtl <= 0) setText(trick, '');
    },
    hint(_id: string | null) { /* TODO(MU): hint component */ },
    lastTrick(name: string) { setText(trick, name); trickTtl = 1.2; },
  };
}
