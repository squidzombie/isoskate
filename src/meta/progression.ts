// meta/progression.ts: XP, levels and the level track (DESIGN §14.2). Pure functions over plain data.
//   xpToNext(L) = round(60·L^1.5 + 90) up to L29, then a flat 10,000.
//   Run XP = floor(score/50) + floor(distance/10) + 50 per new Trick Book entry (25 in runs 1–3)
//            + 150 per area first reached through a gateway + 100 for a New Best (not on run 1).
//   Onboarding cap: in runs 1–3 one results screen grants at most one level-up; the overflow is held and added at
//   the start of the next results, so runs 1, 2, 3 end at Levels 2, 3, 4 for typical XP.
import type { Reward } from '../core/meta';
import { BEYOND_30, LEVEL_REWARDS, XP, type LevelGrant } from './economy.config';

export function xpToNext(level: number): number {
  const L = Math.max(1, Math.floor(level));
  return L >= XP.flatFrom ? XP.flatAfter30 : Math.round(XP.curveMul * L ** XP.curveExp + XP.curveAdd);
}

/** Total XP needed to reach `level` from Level 1. */
export function xpToReach(level: number): number {
  let t = 0;
  for (let L = 1; L < level; L++) t += xpToNext(L);
  return t;
}

export interface XpState { total: number; level: number; intoLevel: number; held: number }
export interface XpStep extends XpState { levelsGained: number[]; intoBefore: number; toNextBefore: number }

/** Adds a run's XP. `capped` (runs 1–3): at most one level-up, the rest goes to `held`. Uncapped, the held XP is
 *  released first and every threshold crossed is a level. */
export function addXp(x: Readonly<XpState>, gained: number, capped: boolean): XpStep {
  const g = Math.max(0, Math.floor(gained));
  let level = Math.max(1, Math.floor(x.level));
  let pool = Math.max(0, x.intoLevel) + Math.max(0, x.held) + g;
  const levelsGained: number[] = [];
  let held = 0;
  if (capped) {
    const need = xpToNext(level);
    if (pool >= need) { level++; levelsGained.push(level); held = pool - need; pool = 0; }
  } else {
    while (pool >= xpToNext(level)) { pool -= xpToNext(level); level++; levelsGained.push(level); }
  }
  return {
    total: x.total + g, level, intoLevel: pool, held, levelsGained,
    intoBefore: Math.max(0, x.intoLevel), toNextBefore: xpToNext(Math.max(1, x.level)),
  };
}

/** Is the onboarding cap active for the run with this 1-based index? */
export const cappedRun = (runIndex: number) => runIndex >= 1 && runIndex <= XP.capRuns;

/** The grants for reaching `level` (L1–L30 from the table; beyond: coins, a Pro Crate every 5th, a star every 10th). */
export function levelGrants(level: number): readonly LevelGrant[] {
  const t = LEVEL_REWARDS[level];
  if (t) return t;
  if (level <= 30) return [];
  const out: LevelGrant[] = [{ kind: 'coins', amount: BEYOND_30.coins }];
  if (level % BEYOND_30.proCrateEvery === 0) out.push({ kind: 'crate', tier: 'pro', count: 1 });
  if (level % BEYOND_30.starEvery === 0) out.push({ kind: 'badge', id: `star${level}` });
  return out;
}

/** The reward a grant shows as before it is applied (item duplicates are resolved by the caller). */
export function grantPreview(g: LevelGrant, level: number): Reward | null {
  switch (g.kind) {
    case 'coins': return { kind: 'coins', amount: g.amount, source: `Level ${level}` };
    case 'item': return { kind: 'item', id: g.id, duplicateCoins: 0 };
    case 'crate': return g.forced ? { kind: 'crate', tier: g.tier, count: g.count, forced: g.forced } : { kind: 'crate', tier: g.tier, count: g.count };
    case 'title': return { kind: 'title', name: g.name };
    case 'badge': return { kind: 'badge', id: g.id };
    default: return null;
  }
}

export interface RunXpInput {
  score: number; distance: number; newTricks: number; newAreas: number; newBest: boolean; runIndex: number;
}
export interface RunXp { score: number; distance: number; tricks: number; areas: number; best: number; total: number }

export function runXp(i: RunXpInput): RunXp {
  const score = Math.floor(Math.max(0, i.score) / XP.scoreDiv);
  const distance = Math.floor(Math.max(0, i.distance) / XP.distDiv);
  const tricks = i.newTricks * (cappedRun(i.runIndex) ? XP.trickBookEntryOnboarding : XP.trickBookEntry);
  const areas = i.newAreas * XP.newArea;
  const best = i.newBest && i.runIndex > 1 ? XP.newBest : 0;
  return { score, distance, tricks, areas, best, total: score + distance + tricks + areas + best };
}
