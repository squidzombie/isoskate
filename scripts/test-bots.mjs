#!/usr/bin/env node
// `npm run test:bots [-- --release] [vitest args]` (TECH §11.2). Vitest rejects unknown flags, so `--release` becomes
// BOTS_RELEASE=1 for the suites to read (fresh seeds, doubled counts); everything else is passed to vitest.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const release = args.includes('--release');
const rest = args.filter((a) => a !== '--release');
const r = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--config', 'vitest.bots.config.ts', ...rest],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...(release ? { BOTS_RELEASE: '1' } : {}) } });
process.exit(r.status ?? 1);
