#!/usr/bin/env node
// `node scripts/bot-report.mjs` (TECH §11.2, WG): merges the bot suites' parts (artifacts/bots/<suite>.json, written
// by tests/bots/*.test.ts) into artifacts/bots.json and prints a one-line summary per suite: crash lists with seed and
// tick, the myopic survival distribution, unintended tricks, generator health, score ratios and combo durations.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'artifacts', 'bots');
if (!existsSync(DIR)) { console.error('bot-report: no artifacts/bots/ (run `npm run test:bots` first)'); process.exit(1); }
const suites = {};
for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json'))) {
  try { const j = JSON.parse(readFileSync(join(DIR, f), 'utf8')); suites[j.suite ?? f.replace(/\.json$/, '')] = j; } catch (e) { console.warn(`bot-report: skipping ${f}: ${e.message}`); }
}
mkdirSync(join(ROOT, 'artifacts'), { recursive: true });
writeFileSync(join(ROOT, 'artifacts', 'bots.json'), JSON.stringify({ generated: new Date().toISOString(), suites }, null, 1));
const n = (v) => (Array.isArray(v) ? v.length : v ?? '–');
for (const [name, s] of Object.entries(suites).sort(([a], [b]) => a.localeCompare(b))) {
  const parts = [`${name.padEnd(15)} ${s.at ?? ''}`];
  if (s.seeds !== undefined) parts.push(`seeds ${s.seeds}`);
  if (s.crashes) parts.push(`crashes ${n(s.crashes)}`);
  if (s.medianMin !== undefined) parts.push(`median ${s.medianMin} min (p10 ${s.p10Min}, capped ${s.survivedCap})`);
  if (s.unintended) parts.push(`unintended ${n(s.unintended)}`);
  if (s.alive) parts.push(`alive lanes ${n(s.alive)} worst ${JSON.stringify(s.worstSurvivalSec)}`);
  if (s.plateauStarts) parts.push(`plateau starts ${JSON.stringify(s.plateauStarts)} mid-run ${JSON.stringify(s.midRunSwitch)}`);
  if (s.scorePerMin) parts.push(`score/min trick ${s.scorePerMin.trick} survival ${s.scorePerMin.survival} ratio ${s.scorePerMin.ratio}`);
  if (s.comboSec) parts.push(`combo p95 ${s.comboSec.p95} s`);
  if (s.feasible) parts.push(`feasible ${JSON.stringify(s.feasible)}`);
  if (s.rerollRate !== undefined) parts.push(`rerolls ${(s.rerollRate * 100).toFixed(2)} % fallbacks ${(s.fallbackRate * 100).toFixed(2)} % failed validations ${((s.validationFailRate ?? 0) * 100).toFixed(1)} % re-plans ${((s.replanRate ?? 0) * 100).toFixed(1)} % coins ${s.coinShare} decision ${s.decisionMin} window ${s.windowMin}/${s.windowMinIndep ?? '–'} deadEnd ${s.deadEndMax}`);
  console.log(parts.join(' | '));
  if (s.density) {
    for (const [p, d] of Object.entries(s.density)) console.log(`  density ${p.padEnd(8)} trick elements/10 s ${d.trickPer10}  required actions/10 s ${d.actsPer10}  S_GATE ${(d.gateShare * 100).toFixed(0)} %  breathers/min ${d.breathersPerMin}`);
    if (s.openingsDistinct !== undefined) console.log(`  openings: ${s.openingsDistinct} distinct template sequences (9–40 s) over ${s.seeds} seeds`);
  }
}
console.log(`bot-report: ${Object.keys(suites).length} suites → artifacts/bots.json`);
