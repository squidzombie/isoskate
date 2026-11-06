import { defineConfig } from 'vitest/config';
import { buildStamp } from './vite.config';

export default defineConfig({
  define: { __BUILD__: JSON.stringify(buildStamp('development')) },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/bots/**/*.test.ts'],
    pool: 'threads',
    maxWorkers: 2,
  },
});
