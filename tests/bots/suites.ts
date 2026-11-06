// tests/bots/suites.ts: shared pieces of the bot suites (TECH §11.2): seed lists (BOTS_RELEASE doubles them with
// fresh seeds), the artifact writer (artifacts/bots/<suite>.json, merged into artifacts/bots.json the same way
// scripts/bot-report.mjs does), and small statistics helpers. Not a test file itself.
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BotRun } from '../../src/debug/bots';

export const RELEASE = process.env.BOTS_RELEASE === '1';
/** Gate seeds: 1…n, or fresh ones (10 001…) at release, twice as many. */
export const seedsFor = (n: number): number[] => Array.from({ length: RELEASE ? 2 * n : n }, (_, i) => (RELEASE ? 10_001 : 1) + i);
export const PLATEAU_T = 150;
export const MIN = 60 * 60;                       // ticks per minute

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ARTIFACTS = join(ROOT, 'artifacts');

/** Writes one suite's report and refreshes artifacts/bots.json (atomic writes: suites run in parallel threads). */
export function writeReport(suite: string, data: unknown): void {
  const dir = join(ARTIFACTS, 'bots');
  mkdirSync(dir, { recursive: true });
  const put = (file: string, body: string) => { const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`; writeFileSync(tmp, body); renameSync(tmp, file); };
  put(join(dir, `${suite}.json`), JSON.stringify({ suite, at: new Date().toISOString(), release: RELEASE, ...(data as object) }, null, 1));
  const merged: Record<string, unknown> = {};
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    try { const j = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { suite?: string }; merged[j.suite ?? f.replace(/\.json$/, '')] = j; } catch { /* a part being written */ }
  }
  put(join(ARTIFACTS, 'bots.json'), JSON.stringify({ generated: new Date().toISOString(), suites: merged }, null, 1));
}

export const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : NaN;
};
export const quantile = (xs: readonly number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]! : NaN;
};

/** The crash list entry for a report. */
export const crashOf = (r: BotRun) => r.crash ? { seed: r.seed, startT: r.startT, tick: r.crash.tick, t: +r.crash.t.toFixed(3), cause: r.crash.cause,
  kind: r.crash.kind, x: +r.crash.x.toFixed(2), segs: r.crash.segs } : null;
/** Generator health of a run (rejections and fallbacks). */
export const genOf = (r: BotRun) => ({ segments: r.gen.segments, rerolls: r.gen.rerolls, fallbacks: r.gen.fallbacks, trickCoinShare: +r.gen.trickCoinShare.toFixed(3) });
