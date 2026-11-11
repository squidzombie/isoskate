#!/usr/bin/env node
// WA gallery (W2a): serves tests/unit/render/gallery.html with Vite on $PORT (WA uses 5187) and saves PNGs to
// artifacts/gallery/: every PropKind per area (pages), every DECOR_KINDS entry per area, a dense street vignette per
// area and per gateway blend, the Title / Locker diorama, at 390×844, 390×664 and 1280×800. Each frame is measured with
// the real contrast gate (debug/contrast.ts) and the world stats; everything lands in artifacts/gallery/report.json.
//   PORT=5187 node tests/unit/render/gallery.mjs [--only street,props] [--vp 390x844] [--area neon] [--no-gate]
// Exits 1 on a console error or on any run-camera view below the contrast gate.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const { chromium } = await import('@playwright/test');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'artifacts', 'gallery');
const PORT = Number(process.env.PORT ?? 5187);
const BASE = `http://127.0.0.1:${PORT}`;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const only = opt('only', '').split(',').filter(Boolean);
const vpOnly = opt('vp', '').split(',').filter(Boolean);
const areaOnly = opt('area', '').split(',').filter(Boolean);
const AREAS = ['downtown', 'suburbs', 'docks', 'neon'].filter((a) => !areaOnly.length || areaOnly.includes(a));
const NEXT = { downtown: 'suburbs', suburbs: 'docks', docks: 'neon', neon: 'downtown' };
const VPS = [{ name: '390x844', w: 390, h: 844, m: true }, { name: '390x664', w: 390, h: 664, m: true }, { name: '1280x800', w: 1280, h: 800, m: false }]
  .filter((v) => !vpOnly.length || vpOnly.includes(v.name));
const PROP_PAGES = { downtown: 3, suburbs: 4, docks: 4, neon: 3 };
const DECOR_PAGES = 4;

const jobs = [];
for (const a of AREAS) {
  jobs.push({ group: 'street', name: `street-${a}`, q: `scene=street&area=${a}` });
  for (const u of [0.25, 0.5, 0.75]) jobs.push({ group: 'blend', name: `blend-${a}-${NEXT[a]}-${u * 100}`, q: `scene=street&area=${a}&to=${NEXT[a]}&u=${u}`, vps: ['390x844'] });
  jobs.push({ group: 'street', name: `street-${a}-top`, q: `scene=street&area=${a}&speed=10.5`, vps: ['390x844'] });
  for (let p = 0; p < PROP_PAGES[a]; p++) jobs.push({ group: 'props', name: `props-${a}-${p}`, q: `scene=props&area=${a}&page=${p}`, vps: ['390x844', '1280x800'] });
  for (let p = 0; p < PROP_PAGES[a]; p++) jobs.push({ group: 'shade', name: `props-${a}-${p}-shade`, q: `scene=props&area=${a}&page=${p}&shade=1&labels=0`, vps: ['390x844'] });
  for (let p = 0; p < DECOR_PAGES; p++) jobs.push({ group: 'decor', name: `decor-${a}-${p}`, q: `scene=decor&area=${a}&page=${p}&speed=10.5`, vps: ['390x844', '1280x800'] });
  for (const p of [0, 1]) jobs.push({ group: 'decor', name: `decor-${a}-${p}-title`, q: `scene=decor&area=${a}&page=${p}&cam=title`, vps: ['390x844', '1280x800'] });
  jobs.push({ group: 'marks', name: `marks-${a}`, q: `scene=marks&area=${a}&labels=0`, vps: ['390x844', '1280x800'] });
  jobs.push({ group: 'title', name: `title-${a}`, q: `scene=street&area=${a}&cam=title` });
  jobs.push({ group: 'title', name: `locker-${a}`, q: `scene=street&area=${a}&cam=locker`, vps: ['390x844'] });
}
const todo = jobs.filter((j) => !only.length || only.includes(j.group));

async function up() { try { return (await fetch(`${BASE}/tests/unit/render/gallery.html`)).ok; } catch { return false; } }
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
const report = [];
let failed = false;
/** DESIGN §18.4 (debug/contrast.ts CONTRAST_GATE). */
const GATE = { hazard: 2.5, edge: 1.8 };
const gateFails = [];
try {
  for (const vp of VPS) {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, isMobile: vp.m, hasTouch: vp.m });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    for (const j of todo) {
      if (j.vps && !j.vps.includes(vp.name)) continue;
      await page.goto(`${BASE}/tests/unit/render/gallery.html?${j.q}`);
      await page.waitForFunction(() => window.__gallery?.ready, null, { timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(() => { const g = window.__gallery; const c = g.contrast(); return { stats: g.stats(), hazard: c.hazard, edge: c.edge, worst: c.worst,
        items: c.items.map((i) => ({ cls: i.cls, kind: i.kind, ratio: +i.ratio.toFixed(2), fg: +i.fg.toFixed(3), bg: +i.bg.toFixed(3) })) }; });
      const file = `${j.name}-${vp.name}.png`;
      await page.screenshot({ path: join(OUT, file) });
      const s = r.stats;
      report.push({ file, ...j, vp: vp.name, hazard: r.hazard, edge: r.edge, worst: r.worst, calls: s.calls, mainCalls: s.mainCalls, shadowCalls: s.shadowCalls, tris: s.tris,
        maxChunkTris: s.maxChunkTris, buildMsP95: s.buildMsP95, items: r.items });
      const fmt = (v) => (v === null || Number.isNaN(v) ? '  -  ' : v.toFixed(2));
      console.log(`${file.padEnd(40)} hazard ${fmt(r.hazard)} edge ${fmt(r.edge)} calls ${s.calls} (main ${s.mainCalls}) tris ${s.tris} chunk≤${s.maxChunkTris} build95 ${s.buildMsP95.toFixed(1)}${r.worst ? `  worst ${r.worst.kind} ${r.worst.ratio.toFixed(2)}` : ''}`);
      // Run-camera views are held to the DESIGN §18.4 gate (the menu cameras are not).
      if (!/cam=(title|locker)/.test(j.q) && !argv.includes('--no-gate')) {
        for (const [cls, v] of [['hazard', r.hazard], ['edge', r.edge]]) {
          if (v !== null && !Number.isNaN(v) && v < GATE[cls]) { gateFails.push(`${file}: ${cls} ${v.toFixed(2)} < ${GATE[cls]}${r.worst ? ` (${r.worst.kind})` : ''}`); }
        }
      }
    }
    if (errors.length) { failed = true; console.error(`[${vp.name}] console errors:\n  ${[...new Set(errors)].join('\n  ')}`); }
    await context.close();
  }
} finally {
  await browser.close();
  server?.kill();
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`gallery: ${report.length} PNGs in ${OUT}`);
if (gateFails.length) { failed = true; console.error(`gate failures (run views):\n  ${gateFails.join('\n  ')}`); }
process.exit(failed ? 1 : 0);
