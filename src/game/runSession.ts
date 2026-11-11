// game/runSession.ts: run id and seed are drawn here, outside the sim, at run start (DESIGN §10.1).
import type { AreaId } from '../core/ids';
import type { SaveStore } from '../core/save';
import type { RunConfig } from '../core/sim';

export interface StartOptions {
  seed?: number; mode?: 'lesson' | 'normal'; startT?: number; startArea?: AreaId; god?: boolean; firstRuns?: boolean;
}

function random32(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') return c.getRandomValues(new Uint32Array(1))[0]!;
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

export interface RunSession { next(o?: StartOptions): RunConfig; readonly count: number }

/** `fixedSeed` comes from ?seed=N. Each run gets a fresh 32-bit seed (unless fixed) and a unique run id. */
export function createRunSession(save: SaveStore, fixedSeed: number | null): RunSession {
  let count = 0;
  return {
    get count() { return count; },
    next(o: StartOptions = {}): RunConfig {
      count++;
      const seed = (o.seed ?? fixedSeed ?? random32()) >>> 0;
      const runId = `${Date.now().toString(36)}-${random32().toString(36)}-${count}`;
      const cfg: RunConfig = {
        runId, seed, mode: o.mode ?? 'normal',
        firstRuns: o.firstRuns ?? save.data.onboarding.runsStarted < 3,
        bestDist: save.data.stats.bestDist,
      };
      if (o.startT !== undefined) cfg.startT = o.startT;
      if (o.startArea !== undefined) cfg.startArea = o.startArea;
      if (o.god) cfg.god = true;
      return cfg;
    },
  };
}
