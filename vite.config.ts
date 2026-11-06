import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Build stamp injected as `__BUILD__` (core/ids.ts). Also defined in vitest.config.ts. */
export function buildStamp(mode: string): { version: string; hash: string; mode: 'development' | 'production' | 'single' } {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  let hash = 'nogit';
  try { hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no git */ }
  const m = mode === 'single' ? 'single' : mode === 'development' ? 'development' : 'production';
  return { version: pkg.version, hash, mode: m };
}

const port = Number(process.env.PORT ?? 5173);

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  const plugins: Plugin[] = [];
  // Single-file build (M4): everything inlined into dist-single/index.html. Stubbed config only in M0.
  if (single) plugins.push(viteSingleFile());
  return {
    base: './',
    define: { __BUILD__: JSON.stringify(buildStamp(mode)) },
    plugins,
    server: { port, strictPort: true, host: '127.0.0.1' },
    preview: { port, strictPort: true, host: '127.0.0.1' },
    build: {
      target: ['es2020', 'safari15'],
      outDir: single ? 'dist-single' : 'dist',
      sourcemap: single ? false : 'hidden',
      assetsInlineLimit: single ? Number.MAX_SAFE_INTEGER : 4096,
      cssCodeSplit: !single,
      chunkSizeWarningLimit: 1200,
    },
  };
});
