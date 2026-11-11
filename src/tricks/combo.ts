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
  /** The rest of a grind / manual that a gateway bank cut (sim/grind.ts, sim/manual.ts carryTimed): it keeps this
   *  decay factor and is not counted again (no repetition-window entry, no trick count). */
  carryFactor?: number;
}

/** Score one trick into the combo (starting one if needed). Returns the entry (grinds/manuals update it later). */
export function addTrick(sc: ScoreState, ev: GameEvent[], tick: number, mode: SkaterMode, id: TrickId, base: number,
  o: TrickOpts): ComboEntry {
  begin(sc, tick);
  const c = sc.combo;
  const carry = o.carryFactor !== undefined;
  const factor = carry ? o.carryFactor! : decayFactor(sc.recent, id, o.minFactor ?? 0);
  const mod = o.mod ?? 1;
  const link = o.link && factor >= SCORE.decay.noLinkBelow;
  const entry: ComboEntry = { id, pts: trickPoints(base, mod, factor), factor, mod, link };
  c.entries.push(entry);
  if (link) c.links++;
  if (!carry) {
    sc.recent.push(id);
    if (sc.recent.length > SCORE.decay.window) sc.recent.shift();
    sc.tricks[id] = (sc.tricks[id] ?? 0) + 1;
  }
  recompute(sc, mode);
  if (o.emit !== false) emitScored(sc, ev, tick, entry);
  return entry;
}

/** Running points of a timed trick (grind / manual) while it is ridden: the combo's pending value counts up every tick
 *  (tickCombo recomputes it), and a gateway bank mid-trick banks the part ridden so far. trickScored waits for the
 *  end (finishTrick). */
export function liveTrick(entry: ComboEntry, base: number): void { entry.pts = trickPoints(base, entry.mod, entry.factor); }

/** Final points of a timed trick (grind / manual) once its duration is known. */
export function finishTrick(sc: ScoreState, ev: GameEvent[], tick: number, mode: SkaterMode, entry: ComboEntry, base: number): void {
  entry.pts = trickPoints(base, entry.mod, entry.factor);
  recompute(sc, mode);
  if (sc.combo.entries.includes(entry)) emitScored(sc, ev, tick, entry);
}

/** Re-target a link-capable entry to another trick in place (a late grind pick, a switch's double or amend): its
 *  decay factor, link and repetition window entry follow the new id (DESIGN §13.4: grinds decay per type). */
export function retarget(sc: ScoreState, entry: ComboEntry, id: TrickId, base: number, mod: number): void {
  if (entry.id === id) return;
  const c = sc.combo, old = entry.id;
  const i = sc.recent.lastIndexOf(old);
  if (i >= 0) sc.recent.splice(i, 1);
  const factor = decayFactor(sc.recent, id);
  if (i >= 0) sc.recent.splice(i, 0, id);
  sc.tricks[old] = Math.max(0, (sc.tricks[old] ?? 1) - 1);
  sc.tricks[id] = (sc.tricks[id] ?? 0) + 1;
  const link = factor >= SCORE.decay.noLinkBelow;
  if (entry.link !== link) c.links += link ? 1 : -1;
  entry.id = id; entry.factor = factor; entry.mod = mod; entry.link = link;
  entry.pts = trickPoints(base, mod, factor);
  recompute(sc, 'grind');
}

function emitScored(sc: ScoreState, ev: GameEvent[], tick: number, e: ComboEntry): void {
  const c = sc.combo;
  ev.push({ t: 'trickScored', tick, id: e.id, pts: e.pts, factor: e.factor, link: e.link, comboPts: c.pending,
    links: c.links, seq: Math.max(0, c.entries.indexOf(e)) });
}

/** A link without a trick entry (linked Revert, Transfer). `heat`: it also refreshes the combo heat. */
export function addLink(sc: ScoreState, mode: SkaterMode, heat = false): void {
  if (!sc.combo.active) return;
  sc.combo.links++;
  if (heat) sc.combo.heat = SCORE.heat;
  recompute(sc, mode);
}

/** Flat bonus: inside a combo it joins the flat sum; outside it banks directly into bonusPts. */
export function addBonus(sc: ScoreState, ev: GameEvent[], tick: number, mode: SkaterMode, id: BonusId, name: string,
  pts: number, inCombo: boolean): void {
  if (inCombo) { begin(sc, tick); sc.combo.flat += pts; recompute(sc, mode); } else { sc.bonusPts += pts; }
  ev.push({ t: 'bonus', tick, id, name, pts });
}

/** A link-adding trick started: refresh the heat. With `id`, a trick that would be decayed below the link floor
 *  (SCORE.decay.noLinkBelow) adds no link, so it does not refresh the heat either: repeating one trick cannot keep a
 *  combo alive (DESIGN §13.2, §13.4). */
export function refreshHeat(sc: ScoreState, id?: TrickId): void {
  if (!sc.combo.active) return;
  if (id !== undefined && decayFactor(sc.recent, id) < SCORE.decay.noLinkBelow) return;
  sc.combo.heat = SCORE.heat;
}

/** Ground touchdown / manual end: the link window (re)starts. */
export function openWindow(sc: ScoreState): void { if (sc.combo.active) sc.combo.window = SCORE.linkWindow; }

/** Near miss: refreshes a running link window (rolling); a paused one (air, grind, manual) restarts on its own. Never
 *  the heat (DESIGN §13.2). */
export function refreshWindow(sc: ScoreState): void { if (sc.combo.active && sc.combo.window >= 0) sc.combo.window = SCORE.linkWindow; }

/** Air, grind, manual: the window is paused. */
export function pauseWindow(sc: ScoreState): void { if (sc.combo.active) sc.combo.window = -1; }

/** One tick of combo time. Heat runs while rolling or airborne (and in a manual when `manualHeat`: a back-to-back
 *  manual, RULES.backToBackManualPausesHeat); the window only while rolling. Heat that runs out in a grind or a manual
 *  banks the combo when it ends. */
export function tickCombo(sc: ScoreState, ev: GameEvent[], tick: number, mode: SkaterMode, manualHeat = false): void {
  const c = sc.combo;
  if (!c.active) return;
  if (mode === 'roll' || mode === 'air' || (mode === 'manual' && manualHeat)) c.heat = Math.max(0, c.heat - DT);
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
  c.active = false; c.entries.length = 0; c.flat = 0; c.links = 0; c.manualLinked = false; c.manualCount = 0;
  c.window = -1; c.heat = SCORE.heat; c.bankIn = 0; c.pending = 0; c.uniqueNames = 0;
}
