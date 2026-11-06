#!/usr/bin/env node
// SK contact sheets (W2b): serves tests/unit/skater/sheet.html with Vite on $PORT (SK uses 5183) and saves PNGs to
// artifacts/sheets/: the 40-item grid at ~60 px and ~31 px (SE in Safari at top speed), the pose strip, and the
// Locker turntable. Prints the measured budgets (draw calls, triangles, loadout switch ms).
//   PORT=5183 node tests/unit/skater/sheet.mjs [--only items60,poses] [--area neon]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const { chromium } = await import('@playwright/test');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'artifacts', 'sheets');
const PORT = Number(process.env.PORT ?? 5183);
const BASE = `http://127.0.0.1:${PORT}`;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const only = opt('only', '')?.split(',').filter(Boolean) ?? [];
const area = opt('area', 'downtown');

const SHEETS = [
  { name: 'items60', q: 'sheet=items&px=60&switch=1' },
  { name: 'items31', q: 'sheet=items&px=31' },
  { name: 'items31-zoom3', q: 'sheet=items&px=31&zoom=3' },
  { name: 'items31-dpr15', q: 'sheet=items&px=31&dpr=1.5&zoom=2' },
  { name: 'poses', q: 'sheet=poses&px=90&cols=11' },
  { name: 'poses60', q: 'sheet=poses&px=60&cols=11' },
  { name: 'showcase', q: 'sheet=showcase' },
  { name: 'boards', q: 'sheet=boards' },
  { name: 'heads', q: 'sheet=heads' },
  { name: 'heads-back', q: 'sheet=heads&yaw=180' },
  { name: 'showcase-back', q: 'sheet=showcase&yaw=180' },
  // Blue hour on the wet neon asphalt (DESIGN §18.1, §18.4): dark outfits must keep an edge.
  { name: 'items31-neon', q: 'sheet=items&px=31&zoom=3', area: 'neon' },
  { name: 'poses60-neon', q: 'sheet=poses&px=60&cols=11', area: 'neon' },
].filter((s) => !only.length || only.includes(s.name));

async function up() { try { const r = await fetch(`${BASE}/tests/unit/skater/sheet.html`); return r.ok; } catch { return false; } }

let server = null;
if (!(await up())) {
  server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(PORT) } });
  const t0 = Date.now();
  while (!(await up())) {
    if (Date.now() - t0 > 30000) { server.kill(); throw new Error(`vite did not start on ${PORT}`); }
    await new Promise((r) => setTimeout(r, 200));
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ARGS });
const report = {};
let failed = false;
try {
  for (const s of SHEETS) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/tests/unit/skater/sheet.html?${s.q}&area=${s.area ?? area}`);
    await page.waitForFunction(() => window.__sheet?.done === true, null, { timeout: 120000 });
    const info = await page.evaluate(() => window.__sheet);
    const size = { w: Math.ceil(info.width), h: Math.ceil(info.height) };
    await page.setViewportSize({ width: Math.min(4000, size.w), height: Math.min(4000, size.h) });
    const file = join(OUT, `${s.name}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size.w, height: size.h } });
    report[s.name] = { ...info, errors };
    console.log(`${s.name}: ${file}  calls ≤ ${info.maxCalls}, tris ≤ ${info.maxTris}, switch p50 ${info.switchMs.p50.toFixed(1)} / p95 ${info.switchMs.p95.toFixed(1)} / max ${Math.max(info.switchMs.first, info.switchMs.again).toFixed(1)} ms${errors.length ? `, ${errors.length} console errors` : ''}`);
    for (const e of errors.slice(0, 5)) console.log(`  error: ${e}`);
    if (errors.length) failed = true;
    const sr = info.switchRender;
    if (sr) {
      // The first frame after a switch uploads the redrawn canvas. Under SwiftShader that upload rasterises the 2D
      // canvas in software (by slot: board ≫ skater ≈ helmet), so its p95 is reported, not gated; a real GPU copies it.
      console.log(`  switch + first render: set p95 ${sr.setP95.toFixed(1)} ms; first frame over a plain one (${sr.plainP50.toFixed(1)} ms): p50 ${sr.overP50.toFixed(1)} / p95 ${sr.overP95.toFixed(1)} / max ${sr.overMax.toFixed(1)} ms (p50 by slot: skater ${sr.over_skater.toFixed(1)}, board ${sr.over_board.toFixed(1)}, helmet ${sr.over_helmet.toFixed(1)}); shader programs ${sr.programs0} -> ${sr.programs1}`);
      if (sr.programs1 !== sr.programs0) { console.log('  FAIL: a loadout switch compiled a shader program'); failed = true; }
      if (sr.setP95 + sr.overP50 > 30) { console.log('  FAIL: a typical switch (set p95 + first-frame p50) is over 30 ms'); failed = true; }
    }
    await page.close();
  }
} finally {
  await browser.close();
  if (server) server.kill();
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
