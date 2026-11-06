#!/usr/bin/env node
// scripts/shots.mjs: screenshots for visual review (TECH §11.4). Output: artifacts/shots/*.png
//
//   node scripts/shots.mjs [--seed N] [--ticks a,b,c] [--no-build]       basic mode (M0)
//   node scripts/shots.mjs --cosmetics | --contrast | --hud | --audio     TODO(M0-io): the other modes
//
// Uses the preview server on $PORT (default 5173) if one is already up; otherwise builds (unless --no-build) and
// starts `vite preview` itself. Chromium comes from /opt/pw-browsers (never `playwright install`).
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const { chromium } = await import('@playwright/test');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'artifacts', 'shots');
const PORT = Number(process.env.PORT ?? 5173);
const BASE = `http://127.0.0.1:${PORT}`;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const seed = Number(opt('seed', '1'));
const ticksList = opt('ticks', '60,330,600').split(',').map(Number).filter((n) => n >= 0);

for (const mode of ['cosmetics', 'contrast', 'hud', 'audio']) {
  if (flag(mode)) {
    console.error(`shots: --${mode} is not implemented yet (TODO(M0-io)). Failing so no gate mistakes it for a pass.`);
    process.exit(1);
  }
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '390x664', width: 390, height: 664, mobile: true },
  { name: '1280x800', width: 1280, height: 800, mobile: false },
];

async function up() {
  try { const r = await fetch(`${BASE}/`); return r.ok; } catch { return false; }
}

let server = null;
if (!(await up())) {
  if (!flag('no-build')) execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  // Spawn vite's own entry with this node (not npx), so killing it really stops the server.
  server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORT),
    '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(PORT) } });
  const t0 = Date.now();
  while (!(await up())) {
    if (Date.now() - t0 > 30000) { server.kill(); throw new Error(`preview server did not start on ${PORT}`); }
    await new Promise((r) => setTimeout(r, 200));
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ARGS });
const report = [];
let failed = false;
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.mobile, hasTouch: vp.mobile,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/?debug=1&seed=${seed}`);
    await page.waitForFunction(() => !!window.__skate, null, { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `title-${vp.name}.png`) });
    await page.evaluate((s) => { window.__skate.start({ seed: s, god: true }); window.__skate.manual(true); }, seed);
    let done = 0;
    for (const ticks of ticksList) {
      const snap = await page.evaluate((n) => window.__skate.step(n), ticks - done);
      done = ticks;
      await page.waitForTimeout(120);                 // let the rAF loop composite the frame
      const file = `run-${vp.name}-t${String(ticks).padStart(4, '0')}.png`;
      await page.screenshot({ path: join(OUT, file) });
      const cam = await page.evaluate(() => window.__skate.camera());
      report.push({ file, tick: snap.tick, s: +snap.p.s.toFixed(2), x: +snap.p.x.toFixed(2), speed: +snap.speed.toFixed(2),
        H: +cam.H.toFixed(2), yawDeg: +cam.yawDeg.toFixed(1), lookAheadSec: +cam.lookAheadSec.toFixed(2) });
    }
    if (errors.length) { failed = true; console.error(`[${vp.name}] console errors:\n  ${errors.join('\n  ')}`); }
    await context.close();
  }
} finally {
  await browser.close();
  server?.kill();
}
writeFileSync(join(OUT, 'shots.json'), JSON.stringify(report, null, 2));
for (const r of report) console.log(`${r.file}  tick ${r.tick}  s ${r.s}  v ${r.speed}  H ${r.H}  yaw ${r.yawDeg}  look ${r.lookAheadSec}s`);
console.log(`shots: ${report.length + VIEWPORTS.length} PNGs in ${OUT}`);
process.exit(failed ? 1 : 0);
