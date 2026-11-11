// tricks/scoring.ts: pure scoring arithmetic (DESIGN §13.1–§13.4). No state, no events.
import type { TrickId } from '../core/ids';
import type { ComboEntry, ComboState } from '../core/sim';
import { SCORE } from './score.config';

/** Repetition factor of `id` given the run's recent-trick window (oldest first). Manuals are exempt (factor 1);
 *  `minFactor` floors it (ollies never drop below TrickTables.ollie.minFactor). */
export function decayFactor(recent: readonly TrickId[], id: TrickId, minFactor = 0): number {
  if (id === 'manual' || id === 'noseManual') return 1;
  let n = 0;
  const from = Math.max(0, recent.length - SCORE.decay.window);
  for (let i = from; i < recent.length; i++) if (recent[i] === id) n++;
  const f = SCORE.decay.factors;
  return Math.max(minFactor, f[Math.min(n, f.length - 1)]!);
}

/** A trick's points after its modifiers and decay, rounded before summing (DESIGN §13.1). */
export const trickPoints = (base: number, mod: number, factor: number): number => Math.round(base * mod * factor);

export const multiplierOf = (links: number): number => Math.min(SCORE.multCap, Math.max(1, links));

export const varietyOf = (uniqueNames: number): number =>
  Math.min(SCORE.variety.cap, SCORE.variety.perName * Math.max(0, uniqueNames - SCORE.variety.free));

export function uniqueNamesOf(entries: readonly ComboEntry[]): number {
  let n = 0;
  for (let i = 0; i < entries.length; i++) {
    let seen = false;
    for (let j = 0; j < i; j++) if (entries[j]!.id === entries[i]!.id) { seen = true; break; }
    if (!seen) n++;
  }
  return n;
}

/** banked = round((Σ entry pts + flat) × min(30, max(1, links)) × (1 + variety)) (DESIGN §13.2). */
export function comboValue(c: Readonly<ComboState>): number {
  let sum = c.flat;
  for (const e of c.entries) sum += e.pts;
  return Math.round(sum * multiplierOf(c.links) * (1 + varietyOf(c.uniqueNames)));
}

export const comboCoins = (total: number): number => Math.floor(Math.sqrt(Math.max(0, total) / SCORE.comboCoinDiv));
