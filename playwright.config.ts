import { defineConfig, devices } from '@playwright/test';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const port = Number(process.env.PORT ?? 5173);
const baseURL = `http://127.0.0.1:${port}`;

/** SwiftShader WebGL in headless Chromium (no GPU on CI or agent machines). */
export const CHROMIUM_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL,
    launchOptions: { args: CHROMIUM_ARGS },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: devices['Pixel 7']?.userAgent,
      },
    },
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    // Always serve a fresh build: e2e runs against the production bundle (TECH §11.3).
    command: process.env.E2E_NO_BUILD ? 'npm run preview' : 'npm run build && npm run preview',
    url: baseURL,
    reuseExistingServer: !!process.env.E2E_REUSE,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
