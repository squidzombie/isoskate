// ui/hud.ts: the M0 debug HUD (DESIGN §13.8 at stub fidelity; MU replaces it in W3a).
//   Band: 56 px + safe-area top (the camera solver excludes exactly that). Top-left score (26·k px, abbreviated from
//   1M) with distance below (12·k px); top-centre the combo pill "1,240 × 6" (cream → amber ×5 → coral ×10 →
//   magenta ×20, bumps on each link) with the last trick name below; top-right coins and the pause button (48 px
//   visible, 56 px hit area). pointer-events:none except the pause button.
//   Popup: at most one at a time, beside the skater (CameraRig.project anchor), ≤ 0.5 s (scale 0.6 → 1.1 → 1 in
//   120 ms, then fade), coloured by type, coral while the predicted landing would be sketchy or a bail.
// Text is written only when it changes and at most 15 Hz; per-frame work is transform/opacity only; no layout reads.
// Every piece carries data-hud="…" (shots --hud and ui.spec measure those).
import { LAND } from '../core/tuning';
import type { ScoreState, SkaterState } from '../core/sim';
import type { HudApi, UiIntent } from '../core/ui';
import { fmtScore, fmtShort } from './format';
import { h, setText } from './h';

export type PopupKind = 'flip' | 'grind' | 'manual' | 'gap' | 'perfect' | 'sketchy' | 'bonus';
const POPUP_COLOR: Readonly<Record<PopupKind, string>> = {
  flip: '#FFE3A3', grind: '#8FE3FF', manual: '#C3A8FF', gap: '#FF9E7A', perfect: '#FFC94A', sketchy: '#C9C2B8', bonus: '#7EE0B5',
};
const CORAL = '#FF5E6C';
export const HUD_TIMING = { textHz: 15, popupSec: 0.5, trickHoldSec: 1.6, trickMinPx: 8 } as const;

/** HUD layout preview values (debug `__skate.ext.hud`). */
export interface HudPreviewValues { score?: number; dist?: number; speed?: number; combo?: number; links?: number; coins?: number; trick?: string }

export interface HudExt extends HudApi {
  /** Ticker under the combo pill: the last trick name only. */
  lastTrick(name: string): void;
  /** One popup beside the skater (replaces the visible one). `predicted` popups turn coral on a bad predicted landing. */
  popup(text: string, kind: PopupKind, predicted?: boolean): void;
  /** Debug: freeze the HUD on fake values (null = live again). */
  preview(v: HudPreviewValues | null): void;
}

/** Combo pill tier by links (DESIGN §9 "Combo build"). */
export const comboTier = (links: number) => (links >= 20 ? 'x20' : links >= 10 ? 'x10' : links >= 5 ? 'x5' : 'x1');

/** Would the current flip/spin land sketchy or bail if nothing changes (DESIGN §13.8 popup tint)? */
export function badLandingPredicted(cur: Readonly<SkaterState>): boolean {
  if (cur.mode !== 'air') return false;
  const p = (r: { t: number; dur: number } | null) => (r ? Math.min(1, (r.t + Math.max(0, cur.airLeft)) / Math.max(1e-6, r.dur)) : 1);
  return Math.min(p(cur.flip), p(cur.spin)) < LAND.snap;
}

export function createHud(root: HTMLElement, raise: (i: UiIntent) => void): HudExt {
  const score = h('div', { class: 'hud-score', 'data-hud': 'score' }, '0');
  const dist = h('div', { class: 'hud-dist', 'data-hud': 'dist' }, '0 m');
  const combo = h('div', { class: 'hud-combo', 'data-hud': 'combo' }, '');
  const trick = h('div', { class: 'hud-trick', 'data-hud': 'trick' }, '');
  const coins = h('div', { class: 'hud-coins', 'data-hud': 'coins' }, h('i', { class: 'coin-dot', 'aria-hidden': 'true' }), h('span', null, '0'));
  const coinText = coins.lastChild as HTMLElement;
  const pause = h('button', { class: 'hud-pause', 'aria-label': 'Pause', type: 'button', 'data-hud': 'pause',
    onpointerdown: (e: Event) => e.stopPropagation(),
    onclick: (e: Event) => { e.stopPropagation(); (e.currentTarget as HTMLElement).blur(); raise({ k: 'pause' }); } },
  h('span', { 'aria-hidden': 'true' }, h('i'), h('i')));
  const pop = h('div', { class: 'hud-popup', 'aria-hidden': 'true' }, '');
  root.replaceChildren(
    h('div', { class: 'hud-band' },
      h('div', { class: 'hud-left' }, score, dist),
      h('div', { class: 'hud-mid' }, combo, trick),
      h('div', { class: 'hud-right' }, coins, pause)),
    pop,
  );
  /** The trick name shrinks to fit the middle column (down to HUD_TIMING.trickMinPx; past that it ellipsizes),
   *  measured only when the text changes. */
  const setTrick = (text: string) => {
    if (trick.textContent === text) return;
    trick.textContent = text;
    trick.style.fontSize = '';
    if (!text || typeof getComputedStyle === 'undefined') return;
    const w = trick.clientWidth, sw = trick.scrollWidth;
    if (w > 0 && sw > w) {
      const base = parseFloat(getComputedStyle(trick).fontSize) || 11;
      trick.style.fontSize = `${Math.max(HUD_TIMING.trickMinPx, Math.floor(((base * w) / sw) * 10) / 10)}px`;
    }
  };
  let acc = 1;
  let trickTtl = 0;
  let lastLinks = -1, bumpFlip = false, lastTier = '';
  let preview: HudPreviewValues | null = null;
  // Popup state (animated every frame with transform/opacity only).
  let popT = Infinity, popPredicted = false, popColor = '', popSide = 1;
  let lastAnchorX = 0;
  let vw = typeof window !== 'undefined' ? window.innerWidth : 390;
  if (typeof window !== 'undefined') window.addEventListener('resize', () => { vw = window.innerWidth; });

  const hud: HudExt = {
    show(on: boolean) { root.classList.toggle('on', on); if (!on) { popT = Infinity; pop.style.opacity = '0'; } },
    update(sc: Readonly<ScoreState>, cur: Readonly<SkaterState>, dt: number, anchor: { x: number; y: number }) {
      lastAnchorX = anchor.x;
      // Popup: beside the skater, away from the nearer screen edge.
      if (popT < HUD_TIMING.popupSec) {
        popT += dt;
        const t = popT, k = t < 0.06 ? 0.6 + (0.5 * t) / 0.06 : t < 0.12 ? 1.1 - (0.1 * (t - 0.06)) / 0.06 : 1;
        const a = t < 0.3 ? 1 : Math.max(0, 1 - (t - 0.3) / (HUD_TIMING.popupSec - 0.3));
        const x = anchor.x + popSide * 64, y = anchor.y - 34;
        pop.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${k.toFixed(3)})`;
        pop.style.opacity = a.toFixed(3);
        const c = popPredicted && badLandingPredicted(cur) ? CORAL : popColor;
        if (pop.style.color !== c) pop.style.color = c;
      } else if (pop.style.opacity !== '0') pop.style.opacity = '0';

      acc += dt;
      trickTtl -= dt;
      if (acc < 1 / HUD_TIMING.textHz) return;
      acc = 0;
      const v = preview;
      setText(score, fmtScore(v?.score ?? sc.total));
      setText(dist, `${Math.floor(v?.dist ?? sc.distancePts)} m`);
      setText(coinText, fmtShort(v?.coins ?? sc.coins));
      const active = v ? (v.combo ?? 0) > 0 : sc.combo.active;
      const links = Math.max(1, v?.links ?? sc.combo.links);
      combo.classList.toggle('on', active);
      if (active) {
        setText(combo, `${fmtShort(v?.combo ?? sc.combo.pending)} × ${links}`);
        const tier = comboTier(links);
        if (tier !== lastTier) { combo.dataset.tier = tier; lastTier = tier; }
        if (links !== lastLinks && lastLinks >= 0) { bumpFlip = !bumpFlip; combo.style.animationName = bumpFlip ? 'hud-bump-a' : 'hud-bump-b'; }
        lastLinks = links;
      } else lastLinks = -1;
      if (v?.trick !== undefined) setTrick(v.trick);
      else if (trickTtl <= 0 && !active) setTrick('');
    },
    hint(_id: string | null) { /* TODO(MU): the hint component (DESIGN §12.5) */ },
    lastTrick(name: string) { setTrick(name); trickTtl = HUD_TIMING.trickHoldSec; },
    popup(text: string, kind: PopupKind, predicted = false) {
      setText(pop, text);
      popColor = POPUP_COLOR[kind];
      pop.style.color = popColor;
      popPredicted = predicted;
      popT = 0;
      popSide = lastAnchorX > vw * 0.5 ? -1 : 1;
    },
    preview(p) { preview = p; acc = 1; },
  };
  return hud;
}

export { fmtScore };
