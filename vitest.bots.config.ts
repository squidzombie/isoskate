// `npm run test:bots` (TECH §11.2): the merge-gate bot suites under tests/bots/ (WG). `npm test` only runs
// tests/bots/quick*.test.ts (bots.quick). `npm run test:bots -- --release` sets BOTS_RELEASE=1 (scripts/test-bots.mjs).
import { defineConfig } from 'vitest/config';
import { buildStamp } from './vite.config';

export default defineConfig({
  define: { __BUILD__: JSON.stringify(buildStamp('development')) },
  test: {
    environment: 'node',
    include: ['tests/bots/**/*.test.ts'],
    pool: 'threads',
    passWithNoTests: true,
    testTimeout: 20 * 60_000,
    hookTimeout: 5 * 60_000,
  },
});
