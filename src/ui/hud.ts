// ui/hud.ts: the run HUD (DESIGN §13.8, §9; TECH §9).
//   Band: ≤ 56 px + safe-area top (the camera solver excludes exactly that), on an ink scrim so cream digits read over
//   the light sidewalk. Columns are pure arithmetic (ui/fit.ts hudColumns), so nothing can overlap at 320–390 px:
//     left   banked total (26·k px tabular digits, rolling up over 0.3 s, abbreviated from 1M) + "DIST 412 m" below;
//     middle the combo pill "1,093 × 4" (cream → amber ×5 → coral ×10 → magenta ×20, bumps on each link) with a thin
//            bank-timer ring, the last trick name only below it, and the instant-retry reward toast;
//     right  coins and the pause button (48 px visible, 56 px hit area; the only touch target).
//   Near the skater: at most one popup (ui/popups.ts). Below the band, briefly: the bank float ("+5,028", "SET
//   BANKED!"), the speed-tier stamp (CRUISE / FLOW / FULL SEND) and the area card ("SUBURBS · +500 NEW GROUND").
//   Thumb zone: only the first-runs hint (ui/hints.ts: the chip, the rest rings and the two-thumb zone cue).
// Rules: text is written only when it changes, in one batch at most 15 times a second (wall clock); per-frame work is
// transform/opacity/class toggles only; no layout reads during a run (fonts are measured on a canvas). Every band
// piece carries data-hud="score|dist|combo|trick|coins|pause" (shots --hud, smoke.spec and ui.spec measure them).
import type { GameEvent } from '../core/events';
import type { ScoreState, SkaterState } from '../core/sim';
import type { HudApi, UiIntent } from '../core/ui';
import { areaName, fmtScore, fmtShort, trickName } from './format';
import { AREA_SUBTITLES } from './copy';
import { fitPx, hudColumns, UI_FONT, type HudColumns } from './fit';
import { h, setText } from './h';
import { createHints, type Hints } from './hints';
import { createPopups, type PopupKind, type Popups } from './popups';
import { HUD_LAYOUT, HUD_TIMING } from './ui.config';

export { HUD_TIMING };
const SPEED_STAMP = ['', 'CRUISE', 'FLOW', 'FULL SEND'] as const;

/** HUD layout preview values (debug `__skate.ext.hud`). */
export interface HudPreviewValues { score?: number; dist?: number; speed?: number; combo?: number; links?: number; coins?: number; trick?: string }

export interface HudStats { batches: number; textWrites: number; minBatchGapMs: number; lastBatchAt: number }

export interface HudExt extends HudApi {
  /** Ticker under the combo pill: the last trick name only (`decayed` > 0 shows "KICKFLIP ×0.45" in grey). */
  lastTrick(name: string, decayed?: number): void;
  /** One popup beside the skater (replaces the visible one). `predicted` popups turn coral on a bad predicted landing. */
  popup(text: string, kind: PopupKind, predicted?: boolean): void;
  /** Debug: freeze the HUD on fake values (null = live again). */
  preview(v: HudPreviewValues | null): void;
  /** Game events the HUD reacts to (popups, floats, stamps, cards). */
  onGame(e: GameEvent): void;
  /** The instant-retry reward toast in the band ("+34 coins · +410 XP · Level 6!"), gone by 3.0 s. */
  rewardToast(text: string): void;
  setFirstRuns(on: boolean): void;
  /** Touch controls (Settings): the hints show two thumbs (left steers, right tricks; mirrored by swapSides) or one. */
  setControls(controls: 'two' | 'one', swapSides: boolean): void;
  /** Re-measure after a resize or a font load (allowed layout read, never per frame). */
  relayout(vw: number, safeL: number, safeR: number): void;
  readonly hints: Hints;
  stats(): HudStats;
}

/** Combo pill tier by links (DESIGN §9 "Combo build"). */
export const comboTier = (links: number) => (links >= 20 ? 'x20' : links >= 10 ? 'x10' : links >= 5 ? 'x5' : 'x1');

export interface HudOptions {
  raise: (i: UiIntent) => void;
  coarse: () => boolean;
  now?: () => number;
  onHint?: (id: string) => void;
}

export function createHud(root: HTMLElement, o: HudOptions): HudExt {
  const now = o.now ?? (() => performance.now());
  const score = h('div', { class: 'hud-score', 'data-hud': 'score' }, '0');
  const dist = h('div', { class: 'hud-dist', 'data-hud': 'dist' }, '0 m');
  const comboText = h('span', { class: 'pill-text' }, '');
  const ring = h('i', { class: 'pill-ring', 'aria-hidden': 'true' });
  const combo = h('div', { class: 'hud-combo', 'data-hud': 'combo' }, comboText, ring);
  const trick = h('div', { class: 'hud-trick', 'data-hud': 'trick' }, '');
  const reward = h('div', { class: 'hud-reward', 'aria-live': 'polite' }, '');
  const coinIcon = h('i', { class: 'coin-dot', 'aria-hidden': 'true' });
  const coinText = h('span', null, '0');
  const coins = h('div', { class: 'hud-coins', 'data-hud': 'coins' }, coinIcon, coinText);
  const pause = h('button', { class: 'hud-pause', 'aria-label': 'Pause', type: 'button', 'data-hud': 'pause',
    onpointerdown: (e: Event) => e.stopPropagation(),
    onclick: (e: Event) => { e.stopPropagation(); (e.currentTarget as HTMLElement).blur(); o.raise({ k: 'pause' }); } },
  h('span', { 'aria-hidden': 'true' }, h('i'), h('i')));
  const band = h('div', { class: 'hud-band' },
    h('div', { class: 'hud-left' }, score, dist),
    h('div', { class: 'hud-mid' }, combo, trick, reward),
    h('div', { class: 'hud-right' }, coins, pause));
  const floatEl = h('div', { class: 'hud-float', 'aria-hidden': 'true' }, '');
  const stamp = h('div', { class: 'hud-stamp', 'aria-hidden': 'true' }, '');
  const cardTitle = h('b', null, ''), cardSub = h('span', null, '');
  const card = h('div', { class: 'hud-card', 'aria-hidden': 'true' }, cardTitle, cardSub);
  const popups: Popups = createPopups();
  const hints = createHints(o.coarse, o.onHint);
  root.replaceChildren(band, floatEl, stamp, card, ...popups.els, ...hints.els);

  // Layout (arithmetic only). `vw` and the insets are refreshed by relayout() on resize, never read per frame.
  let cols: HudColumns = hudColumns(390);
  let vw = 390;
  const fitCache = new Map<string, number>();
  const applyCols = () => {
    band.style.setProperty('--hud-l', `${cols.leftW}px`);
    band.style.setProperty('--hud-m', `${cols.midW}px`);
    band.style.setProperty('--hud-r', `${cols.rightW}px`);
    band.style.setProperty('--hud-coin', `${cols.coinW}px`);
    band.style.paddingLeft = `${cols.padL}px`;
    band.style.paddingRight = `${cols.padR}px`;
    fitCache.clear();
  };
  const fit = (el: HTMLElement, text: string, family: string, weight: number, base: number, min: number, maxW: number) => {
    const key = `${el.className}|${base}|${maxW}|${text}`;
    let px = fitCache.get(key);
    if (px === undefined) { px = fitPx(text, family, weight, base, min, maxW); if (fitCache.size > 300) fitCache.clear(); fitCache.set(key, px); }
    const v = px >= base ? '' : `${px}px`;
    if (el.style.fontSize !== v) el.style.fontSize = v;
  };
  /** The trick ticker (BRAND §2.4: Nunito 900 caps, `letter-spacing: .04em`, fitted with that tracking). The decay
   *  factor is dropped when the whole line would go under the 11 px floor: the grey colour still says it decayed. */
  const setTrick = (txt: string, name: string) => {
    const base = Math.max(HUD_LAYOUT.trickPx, HUD_LAYOUT.trickPx * cols.k);
    const room = (t: string) => cols.midW - t.length * HUD_LAYOUT.trickTrack * base;
    let t = txt;
    if (t !== name && fitPx(t.toUpperCase(), UI_FONT, 900, base, 0, room(t)) < HUD_LAYOUT.trickPx) t = name;
    write(trick, t);
    fit(trick, t.toUpperCase(), UI_FONT, 900, base, HUD_TIMING.trickMinPx, room(t));
  };

  // State.
  let preview: HudPreviewValues | null = null, force = false;
  let lastBatch = -1e9, batches = 0, textWrites = 0, minGap = Infinity;
  let shownScore = 0, rollFrom = 0, rollTo = 0, rollT0 = 0;
  let trickLabel = '', trickDecayed = 0, trickTtl = 0, trickDirty = false;
  let lastLinks = -1, bumpFlip = false, lastTier = '', comboOn = false, ringWarn = false, ringScale = -1;
  // The bank-timer ring is normalised by the longest bankIn seen since the last link (no scoring constants needed).
  let ringLinks = -1, ringMax = 0;
  let floatText: string | null = null, stampText: string | null = null, cardText: [string, string] | null = null, rewardText: string | null = null;
  const flip: Record<string, boolean> = {};
  let rewardUntil = Infinity;                     // wall clock: "gone by 3.0 s" is real time, even on slow frames
  let rewardTimer: ReturnType<typeof setTimeout> | null = null;
  const hideReward = () => {
    if (rewardTimer !== null) { clearTimeout(rewardTimer); rewardTimer = null; }
    rewardUntil = Infinity; reward.classList.remove('on'); band.classList.remove('rewarding');
  };
  /** Restarts a CSS animation without a layout read: alternate between two identical keyframe classes. */
  const restart = (el: HTMLElement, cls: string) => {
    flip[cls] = !flip[cls];
    el.classList.remove(`${cls}-a`, `${cls}-b`);
    el.classList.add(`${cls}-${flip[cls] ? 'a' : 'b'}`);
  };
  const write = (el: HTMLElement, text: string) => { if (el.textContent !== text) { el.textContent = text; textWrites++; } };

  const batch = (sc: Readonly<ScoreState>, t: number) => {
    const v = preview;
    // Score rolls up over 0.3 s.
    const target = Math.max(0, Math.round(v?.score ?? sc.total));
    if (target !== rollTo) { rollFrom = shownScore; rollTo = target; rollT0 = t; }
    const u = v ? 1 : Math.min(1, (t - rollT0) / (HUD_TIMING.rollSec * 1000));
    shownScore = Math.round(rollFrom + (rollTo - rollFrom) * u);
    write(score, fmtScore(shownScore));
    fit(score, fmtScore(rollTo), UI_FONT, 900, HUD_LAYOUT.scorePx * cols.k, HUD_LAYOUT.scoreMinPx, cols.leftW);
    const d = Math.floor(v?.dist ?? sc.distancePts);
    write(dist, `${d < 1e5 ? fmtScore(d) : fmtShort(d)} m`);
    const coinStr = fmtShort(v?.coins ?? sc.coins + sc.coinPayouts);
    write(coinText, coinStr);
    fit(coinText, coinStr, UI_FONT, 900, HUD_LAYOUT.coinPx * cols.k, HUD_LAYOUT.coinMinPx, cols.coinW - HUD_LAYOUT.coinPx * cols.k - HUD_LAYOUT.coinChip);
    // Combo pill.
    const active = v ? (v.combo ?? 0) > 0 : sc.combo.active;
    if (active !== comboOn) { comboOn = active; combo.classList.toggle('on', active); if (active) combo.classList.remove('lost'); }
    if (active) {
      const links = Math.max(1, v?.links ?? sc.combo.links);
      const txt = `${fmtShort(v?.combo ?? sc.combo.pending)} × ${links}`;
      write(comboText, txt);
      fit(comboText, txt, UI_FONT, 900, HUD_LAYOUT.comboPx * cols.k, HUD_LAYOUT.comboMinPx, cols.midW - HUD_LAYOUT.comboPad);
      const tier = comboTier(links);
      if (tier !== lastTier) { combo.dataset.tier = tier; lastTier = tier; }
      if (links !== lastLinks && lastLinks >= 0) { bumpFlip = !bumpFlip; combo.style.animationName = bumpFlip ? 'hud-bump-a' : 'hud-bump-b'; }
      lastLinks = links;
    } else lastLinks = -1;
    // Trick ticker: the last trick only; decayed names in grey with their factor.
    if (v?.trick !== undefined) setTrick(v.trick, v.trick);
    else if (trickDirty) {
      trickDirty = false;
      trick.classList.toggle('decayed', trickDecayed > 0);
      setTrick(trickDecayed > 0 ? `${trickLabel} ×${trickDecayed}` : trickLabel, trickLabel);
    } else if (trickTtl <= 0 && !active && trick.textContent) write(trick, '');
    // One-shot texts queued by events.
    if (popups.flushText()) textWrites++;
    if (floatText !== null) { write(floatEl, floatText); floatText = null; restart(floatEl, 'fl'); }
    if (stampText !== null) { write(stamp, stampText); stampText = null; restart(stamp, 'st'); }
    if (cardText !== null) { write(cardTitle, cardText[0]); write(cardSub, cardText[1]); cardText = null; restart(card, 'cd'); }
    if (rewardText !== null) {
      write(reward, rewardText); rewardText = null; reward.classList.add('on'); band.classList.add('rewarding'); rewardUntil = t + HUD_TIMING.rewardSec * 1000;
      // Also a timer: "gone by 3.0 s" must hold through a long frame (the first frames of a run build chunks), so the
      // hide never waits for the next HUD update (G1: SwiftShader frames of 0.3–1 s left it on past 3 s).
      if (rewardTimer !== null) clearTimeout(rewardTimer);
      rewardTimer = setTimeout(hideReward, HUD_TIMING.rewardSec * 1000);
    }
  };

  /** Clears the transient pieces under the band (bank float, speed stamp, area card) and the popup. */
  const clearTransients = () => {
    popups.clear();
    floatText = stampText = null; cardText = null;
    floatEl.classList.remove('fl-a', 'fl-b'); stamp.classList.remove('st-a', 'st-b'); card.classList.remove('cd-a', 'cd-b');
  };
  const resetRun = () => {
    shownScore = rollFrom = rollTo = 0; trickLabel = ''; trickDecayed = 0; trickTtl = 0; trickDirty = true;
    lastLinks = -1; lastTier = ''; comboOn = false; combo.classList.remove('on', 'lost'); ringLinks = -1; ringMax = 0;
    clearTransients();
    force = true;
  };

  const hud: HudExt = {
    hints,
    show(on: boolean) {
      root.classList.toggle('on', on);
      if (!on) { popups.clear(); hints.hide(); hideReward(); }
      else force = true;
    },
    update(sc, cur: Readonly<SkaterState>, dt, anchor) {
      // Per frame: transform / opacity / class toggles only.
      popups.update(dt, anchor, cur, vw);
      hints.update(cur.t, cur.mode === 'crashed');
      trickTtl -= dt;
      const live = comboOn && !preview;
      if (live) {
        if (sc.combo.links !== ringLinks) { ringLinks = sc.combo.links; ringMax = 0; }
        if (sc.combo.bankIn > ringMax) ringMax = sc.combo.bankIn;
      } else ringLinks = -1;
      const q = live && ringMax > 0 ? Math.round(Math.max(0, Math.min(1, sc.combo.bankIn / ringMax)) * 100) / 100 : 0;
      if (q !== ringScale) { ringScale = q; ring.style.transform = `scaleX(${q})`; }
      const warn = live && sc.combo.bankIn < HUD_TIMING.bankWarnSec;
      if (warn !== ringWarn) { ringWarn = warn; combo.classList.toggle('warn', warn); }
      // Text: one batch at most 15 times a second (wall clock).
      const t = now();
      if (t >= rewardUntil) hideReward();
      const gap = t - lastBatch;
      if (!force && gap < 1000 / HUD_TIMING.textHz - 0.5) return;
      if (!force && batches > 0) minGap = Math.min(minGap, gap);
      force = false;
      lastBatch = t;
      batches++;
      batch(sc, t);
    },
    hint(id: string | null) { hints.set(id); },
    lastTrick(name: string, decayed = 0) { trickLabel = name; trickDecayed = decayed; trickTtl = HUD_TIMING.trickHoldSec; trickDirty = true; },
    popup(text, kind, predicted = false) { popups.show(text, kind, predicted); },
    preview(p) { preview = p; force = true; trickDirty = !p; },
    rewardToast(text) { rewardText = text; force = true; },
    setFirstRuns(on) { hints.setFirstRuns(on); },
    setControls(controls, swapSides) { hints.setControls(controls, swapSides); },
    relayout(w, sl, sr) { vw = w; cols = hudColumns(w, sl, sr); applyCols(); force = true; },
    stats: () => ({ batches, textWrites, minBatchGapMs: minGap, lastBatchAt: lastBatch }),
    onGame(e) {
      switch (e.t) {
        case 'runStart': resetRun(); break;
        case 'trickScored':
          if (e.id !== 'ollie') hud.lastTrick(trickName(e.id).toUpperCase(), e.factor < 0.999 ? Math.round(e.factor * 100) / 100 : 0);
          break;
        case 'flipStart': hud.popup(trickName(e.id), 'flip', true); break;
        case 'flipUpgrade': hud.popup(trickName(e.to), 'flip', true); break;
        case 'spinStart': hud.popup(e.out ? `${trickName(e.id)} OUT` : trickName(e.id), 'flip', true); break;
        case 'spinUpgrade': hud.popup(trickName(e.to), 'flip', true); break;
        // Grinds and manuals score at their end: the last-trick label follows their start and every switch, so a long
        // grind never shows the trick before it (G1, GP review #13). The trickScored at the end adds the decay.
        case 'grindStart':
          hud.popup(e.perfect ? 'PERFECT LOCK' : e.transfer ? `TRANSFER · ${trickName(e.id)}` : trickName(e.id), e.transfer ? 'gap' : 'grind');
          hud.lastTrick(trickName(e.id).toUpperCase());
          break;
        case 'grindSwitch': hud.popup(trickName(e.to), 'grind'); hud.lastTrick(trickName(e.to).toUpperCase()); break;
        case 'manualStart': hud.popup(trickName(e.kind), 'manual'); hud.lastTrick(trickName(e.kind).toUpperCase()); break;
        case 'grabStart': hud.popup(trickName(e.id), 'flip'); break;
        case 'revert': hud.popup('REVERT', 'bonus'); break;
        case 'land': if (e.quality === 'perfect') hud.popup('PERFECT', 'perfect'); else if (e.quality === 'sketchy') hud.popup('SKETCHY', 'sketchy'); break;
        case 'nearMiss': hud.popup('CLOSE!', 'bonus'); break;
        case 'bonus':
          if (e.id === 'newGround' || e.id === 'knock' || e.id === 'nearMiss') break;
          hud.popup(`${e.name.toUpperCase()} +${e.pts}`, e.id === 'gap' || e.id === 'transfer' ? 'gap' : 'bonus');
          break;
        case 'comboBanked':
          floatText = `${e.reason === 'gateway' ? 'SET BANKED! ' : ''}+${fmtScore(e.total)}${e.coins > 0 ? `  +${e.coins}●` : ''}`;
          restart(score, 'bk');
          break;
        case 'comboLost': combo.classList.add('lost'); break;
        case 'coin': restart(coinIcon, 'cp'); break;
        case 'speedTier': if (e.tier > 0) stampText = SPEED_STAMP[e.tier]; break;
        case 'areaEnter': if (e.tick > 1) cardText = [areaName(e.area).toUpperCase(), e.firstThisRun ? '+500 NEW GROUND' : AREA_SUBTITLES[e.area].toUpperCase()]; break;   // revisits: the THEME §9 subtitle
        case 'crash': if (!e.god) { clearTransients(); hints.hide(); } break;   // BAILED! gets the screen to itself
        default: break;
      }
    },
  };
  applyCols();
  return hud;
}

export { fmtScore, setText };
export { badLandingPredicted } from './popups';
