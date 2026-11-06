// tricks/combo.ts: combo bookkeeping over ScoreState (DESIGN §13.2). Pure functions: they mutate the ScoreState they
// are given and push GameEvents into the sink; the sim decides when to call them.
//  - any scored trick starts a combo (an ollie included);
//  - links come from link-adding tricks (flips, spins, grinds, manual once, transfers, linked reverts), never ollies;
//  - link window (0.75 s) runs only while rolling; combo heat (2.5 s) runs while rolling or airborne;
//  - bank on window / heat expiry, sketchy landing or gateway; lose on crash.
import type { BonusId, TrickId } from '../core/ids';
import type { GameEvent } from '../core/events';
import type { ComboEntry, ComboState, ScoreState, SkaterMode } from '../core/sim';
import { DT } from '../core/tuning';
import { SCORE } from './score.config';
import { comboCoins, comboValue, decayFactor, trickPoints, uniqueNamesOf, varietyOf } from './scoring';

export type BankReason = 'window' | 'heat' | 'sketchy' | 'gateway';

export function emptyCombo(): ComboState {
  return { active: false, entries: [], flat: 0, links: 0, manualLinked: false, manualCount: 0, window: -1,
    heat: SCORE.heat, bankIn: 0, startTick: 0, pending: 0, uniqueNames: 0 };
}

function begin(sc: ScoreState, tick: number): void {
  const c = sc.combo;
  if (c.active) return;
  c.active = true; c.entries.length = 0; c.flat = 0; c.links = 0; c.manualLinked = false; c.manualCount = 0;
  c.window = -1; c.heat = SCORE.heat; c.startTick = tick; c.pending = 0; c.uniqueNames = 0;
}

/** Re-derive pending value, unique names and the bank-timer value. */
export function recompute(sc: ScoreState, mode: SkaterMode): void {
  const c = sc.combo;
  if (!c.active) { c.pending = 0; c.bankIn = 0; c.uniqueNames = 0; return; }
  c.uniqueNames = uniqueNamesOf(c.entries);
  c.pending = comboValue(c);
  c.bankIn = mode === 'roll' && c.window >= 0 ? Math.min(c.heat, c.window) : c.heat;
}

export interface TrickOpts {
  /** Adds a link (subject to the decay floor). */
  link: boolean;
  /** Product of landing / lock modifiers (Perfect, sketchy, Double-up …). */
  mod?: number;
  /** Floor for the decay factor (ollies: TrickTables.ollie.minFactor). */
  minFactor?: number;
  /** Emit trickScored now (grinds and manuals emit when they end, via finishTrick). */
  emit?: boolean;
}

/** Score one trick into the combo (starting one if needed). Returns the entry (grinds/manuals update it later). */
export function addTrick(sc: ScoreState, ev: GameEvent[], tick: number, mode: SkaterMode, id: TrickId, base: number,
  o: TrickOpts): ComboEntry {
  begin(sc, tick);
  const c = sc.combo;
  const factor = decayFactor(sc.recent, id, o.minFactor ?? 0);
  const mod = o.mod ?? 1;
  const link = o.link && factor >= SCORE.decay.noLinkBelow;
  const entry: ComboEntry = { id, pts: trickPoints(base, mod, factor), factor, mod, link };
  c.entries.push(entry);
  if (link) c.links++;
  sc.recent.push(id);
  if (sc.recent.length > SCORE.decay.window) sc.recent.shift();
  sc.tricks[id] = (sc.tricks[id] ?? 0) + 1;
  recompute(sc, mode);
  if (o.emit !== false) emitScored(sc, ev, tick, entry);
  return entry;
}

/** Final points of a timed trick (grind / manual) once its duration is known. */
export function finishTrick(sc: ScoreState, ev: GameEvent[], tick: number, mode: SkaterMode, entry: ComboEntry, base: number): void {
  entry.pts = trickPoints(base, entry.mod, entry.factor);
  recompute(sc, mode);
  if (sc.combo.entries.includes(entry)) emitScored(sc, ev, tick, entry);
}

function emitScored(sc: ScoreState, ev: GameEvent[], tick: number, e: ComboEntry): void {
  const c = sc.combo;
  ev.push({ t: 'trickScored', tick, id: e.id, pts: e.pts, factor: e.factor, link: e.link, comboPts: c.pending,
    links: c.links, seq: Math.max(0, c.entries.indexOf(e)) });
}

/** A link without a trick entry (linked Revert, Transfer). */
export function addLink(sc: ScoreState, mode: SkaterMode): void {
  if (!sc.combo.active) return;
  sc.combo.links++;
  recompute(sc, mode);
}

/** Flat bonus: inside a combo it joins the flat sum; outside it banks directly into bonusPts. */
export function addBonus(sc: ScoreState, ev: GameEvent[], tick: number, mode: SkaterMode, id: BonusId, name: string,
  pts: number, inCombo: boolean): void {
  if (inCombo) { begin(sc, tick); sc.combo.flat += pts; recompute(sc, mode); } else { sc.bonusPts += pts; }
  ev.push({ t: 'bonus', tick, id, name, pts });
}

/** A link-adding trick started: refresh the heat. */
export function refreshHeat(sc: ScoreState): void { if (sc.combo.active) sc.combo.heat = SCORE.heat; }

/** Ground touchdown / manual end: the link window (re)starts. */
export function openWindow(sc: ScoreState): void { if (sc.combo.active) sc.combo.window = SCORE.linkWindow; }

/** Air, grind, manual: the window is paused. */
export function pauseWindow(sc: ScoreState): void { if (sc.combo.active) sc.combo.window = -1; }

/** One tick of combo time. Heat runs while rolling or airborne; the window only while rolling. */
export function tickCombo(sc: ScoreState, ev: GameEvent[], tick: number, mode: SkaterMode): void {
  const c = sc.combo;
  if (!c.active) return;
  if (mode === 'roll' || mode === 'air') c.heat -= DT;
  if (mode === 'roll' && c.window >= 0) c.window = Math.max(0, c.window - DT);
  if (mode === 'roll' && c.window === 0) bank(sc, ev, tick, 'window');
  else if (c.heat <= 1e-9 && mode !== 'grind' && mode !== 'manual') bank(sc, ev, tick, 'heat');
  else recompute(sc, mode);
}

export function bank(sc: ScoreState, ev: GameEvent[], tick: number, reason: BankReason): void {
  const c = sc.combo;
  if (!c.active) return;
  const total = comboValue(c);
  const coins = comboCoins(total);
  sc.trickPts += total;
  sc.coinPayouts += coins;
  sc.bestCombo = Math.max(sc.bestCombo, total);
  sc.maxLinks = Math.max(sc.maxLinks, c.links);
  const variety = varietyOf(uniqueNamesOf(c.entries));
  ev.push({ t: 'comboBanked', tick, total, links: c.links, variety, coins, reason, durSec: (tick - c.startTick) * DT });
  reset(c);
}

/** Crash: the unbanked combo is lost. */
export function lose(sc: ScoreState, ev: GameEvent[], tick: number): void {
  const c = sc.combo;
  if (!c.active) return;
  const total = comboValue(c);
  sc.lostCombo = total;
  ev.push({ t: 'comboLost', tick, total });
  reset(c);
}

function reset(c: ComboState): void {
  c.active = false; c.entries = []; c.flat = 0; c.links = 0; c.manualLinked = false; c.manualCount = 0;
  c.window = -1; c.heat = SCORE.heat; c.bankIn = 0; c.pending = 0; c.uniqueNames = 0;
}
