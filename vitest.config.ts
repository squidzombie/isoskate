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
  },
});
