// audio.spec (TECH §11.3, ROADMAP W3b): a real tap on the Title unlocks audio (context running), and a 2-minute
// god-mode run with scripted gestures keeps the voice count ≤ 32 with the main-thread audio cost ≤ 0.3 ms per frame.
import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __skate?: import('../../src/core/debug').DebugAPI;
    __skateAudio?: import('../../src/audio').AudioDebug;
    __auLog?: { voices: number[]; states: string[]; intensity: number[]; gestures: number };
  }
}

async function boot(page: Page, errors: string[]): Promise<void> {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug=1&quality=low');
  await page.waitForFunction(() => !!window.__skate && !!window.__skateAudio);
}

test('a tap on the Title unlocks audio: unlocked and the context is running', async ({ page }, info) => {
  const errors: string[] = [];
  await boot(page, errors);
  expect(await page.evaluate(() => window.__skate!.audio().unlocked)).toBe(false);
  const vp = page.viewportSize()!;
  if (info.project.use.hasTouch) await page.touchscreen.tap(vp.width / 2, vp.height * 0.45);
  else await page.mouse.click(vp.width / 2, vp.height * 0.45);
  await expect.poll(() => page.evaluate(() => window.__skate!.audio().unlocked), { timeout: 5000 }).toBe(true);
  const st = await page.evaluate(() => window.__skateAudio!.stats());
  expect(st.contextState).toBe('running');
  expect(st.scene).toBe('run');
  await expect.poll(() => page.evaluate(() => window.__skateAudio!.stats().playing), { timeout: 3000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('2-minute god-mode run with gestures: voices ≤ 32, audio main-thread cost ≤ 0.3 ms per frame', async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, 'runs once, on the mobile project');
  const SEC = Number(process.env.AUDIO_RUN_SEC ?? 120);
  test.setTimeout((SEC + 60) * 1000);
  const errors: string[] = [];
  await boot(page, errors);
  const vp = page.viewportSize()!;
  await page.touchscreen.tap(vp.width / 2, vp.height * 0.45);
  await expect.poll(() => page.evaluate(() => window.__skate!.audio().unlocked), { timeout: 5000 }).toBe(true);
  await page.evaluate(() => {
    window.__skate!.start({ seed: 1, god: true });
    const log = { voices: [] as number[], states: [] as string[], intensity: [] as number[], gestures: 0 };
    window.__auLog = log;
    const swipes = ['l', 'r', 'd', 'u', 'ul', 'ur', 'dl', 'dr'];
    let k = 0;
    // A trick bot stand-in: ollie, then a flick in the air, every 0.7 s; a steer now and then; sample every 100 ms.
    setInterval(() => {
      const api = window.__skate!;
      api.gesture('tap');
      setTimeout(() => api.gesture({ swipe: swipes[k++ % swipes.length]! }), 120);
      if (k % 3 === 0) setTimeout(() => api.gesture({ steerDx: k % 2 ? 1.5 : -1.5 }), 400);
      log.gestures++;
    }, 700);
    setInterval(() => {
      const s = window.__skateAudio!.stats();
      log.voices.push(s.voices); log.states.push(s.contextState); log.intensity.push(s.intensity);
    }, 100);
  });
  await page.waitForTimeout(SEC * 1000);
  const r = await page.evaluate(() => ({ log: window.__auLog!, perf: window.__skateAudio!.perf(), stats: window.__skateAudio!.stats(),
    events: window.__skate!.events().map((e) => e.t) }));
  const maxVoices = Math.max(...r.log.voices);
  console.log(`audio.spec: ${r.log.voices.length} samples, max voices ${maxVoices} (pool peak ${r.stats.peak}), intensity ${Math.max(...r.log.intensity)}, ` +
    `gestures ${r.log.gestures}, frames ${r.perf.frames}, audio ms/frame avg ${r.perf.msPerFrame.toFixed(3)} p95 ${r.perf.p95.toFixed(3)} max ${r.perf.max.toFixed(2)}, tick ${r.perf.tickMs.toFixed(3)} ms`);
  expect(r.log.voices.length).toBeGreaterThan(SEC * 5);
  expect(maxVoices).toBeLessThanOrEqual(32);
  expect(r.stats.peak).toBeLessThanOrEqual(32);
  expect(maxVoices).toBeGreaterThan(4);                       // the music and the beds were really playing
  expect(r.log.states.every((s) => s === 'running')).toBe(true);
  expect(r.events).toContain('ollie');
  expect(r.perf.frames).toBeGreaterThan(SEC * 5);
  expect(r.perf.msPerFrame).toBeLessThanOrEqual(0.3);
  expect(errors).toEqual([]);
});
