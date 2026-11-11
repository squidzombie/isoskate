import { defineConfig } from 'vitest/config';
import { buildStamp } from './vite.config';

export default defineConfig({
  define: { __BUILD__: JSON.stringify(buildStamp('development')) },
  test: {
    environment: 'node',
    // Unit tests plus bots.quick only; the gate bot suites run with `npm run test:bots` (vitest.bots.config.ts).
    include: ['tests/unit/**/*.test.ts', 'tests/bots/quick*.test.ts'],
    pool: 'threads',
    maxWorkers: 2,
    // CPU-bound checks (golden hashes over 3 km, the 2-minute replay, bots.quick) take 1–5 s alone; their limit is not a
    // timing gate (the benches are), and 4 cores are shared with the screenshot and e2e runs (G1).
    testTimeout: 30_000,
  },
});
