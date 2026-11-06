#!/usr/bin/env node
// scripts/shots.mjs: screenshots and pixel gates for visual review (TECH §11.4). Every mode works only through
// window.__skate (the frozen DebugAPI plus `__skate.ext`, debug/api.ts), so later packages never edit this file.
//
//   node scripts/shots.mjs [modes] [--seed N] [--ticks a,b,c] [--no-build] [--vp 390x844,...]
//     (no mode)    title, run frames, every area at blend 0 and in the gateway blends, every UI screen, the debug
//                  overlay frame, at 390×844, 390×664 and 1280×800                      → artifacts/shots/*.png
//     --cosmetics  every CATALOG item on the turntable (per-item PNG at 200 px plus 60 px and 31 px skater heights)
//                  as a contact sheet, and the Locker with 6 loadouts                    → artifacts/shots/cosmetics/
//     --contrast   the DESIGN §18.4 pixel gate (hazard ≥ 2.5:1, grind edge ≥ 1.8:1) at every area preset and gateway
//                  blend; exits 1 on a failure                                           → artifacts/shots/contrast/
//     --hud        HUD layouts at 320 / 360 / 390 px (live and a worst-case preview), overlap and 56 px band
//                  checks; exits 1 on a failure                                          → artifacts/shots/hud/
//     --audio      20 s renderAudio per area as 16-bit WAV with the peak in dBFS; a null render (the M0 audio stub)
//                  prints a note and exits 0; clipping (peak > −1 dBFS) or silence exits 1 → artifacts/audio/
// Several modes may be combined. Uses the preview server on $PORT (default 5173) if one is up; otherwise builds
// (unless --no-build) and starts `vite preview`. Chromium comes from /opt/pw-browsers (never `playwright install`).
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const { chromium } = await import('@playwright/test');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'artifacts', 'shots');
const AUDIO_OUT = join(ROOT, 'artifacts', 'audio');
const PORT = Number(process.env.PORT ?? 5173);
const BASE = `http://127.0.0.1:${PORT}`;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const AREAS = ['downtown', 'suburbs', 'docks', 'neon'];
const NEXT = { downtown: 'suburbs', suburbs: 'docks', docks: 'neon', neon: 'downtown' };
const BLENDS = [0.25, 0.5, 0.75];
const SCREENS = ['title', 'pause', 'crash', 'results', 'rewards', 'locker', 'shop', 'crates', 'stats', 'settings'];
const GATE = { hazard: 2.5, edge: 1.8 };

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const seed = Number(opt('seed', '1'));
const ticksList = opt('ticks', '60,330,600').split(',').map(Number).filter((n) => n >= 0);
const MODES = ['cosmetics', 'contrast', 'hud', 'audio'].filter(flag);
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '390x664', width: 390, height: 664, mobile: true },
  { name: '1280x800', width: 1280, height: 800, mobile: false },
];
const vpFilter = opt('vp', '');
const pickVps = (list) => (vpFilter ? list.filter((v) => vpFilter.split(',').includes(v.name)) : list);

// ── server ─────────────────────────────────────────────────────────────────────────────────────────────────────
async function up() { try { return (await fetch(`${BASE}/`)).ok; } catch { return false; } }
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

// ── helpers ────────────────────────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ args: ARGS });
let failed = false;
const fail = (msg) => { failed = true; console.error(`FAIL ${msg}`); };
const writeDataUrl = (file, url) => writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(vp, query = '') {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr ?? 1, isMobile: vp.mobile, hasTouch: vp.mobile,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?debug=1&seed=${seed}${query}`);
  await page.waitForFunction(() => !!window.__skate, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(250);
  return { page, context, errors, close: async () => { if (errors.length) fail(`[${vp.name}] console errors:\n  ${errors.join('\n  ')}`); await context.close(); } };
}
/** Lets the rAF loop composite a fresh frame before a page screenshot. */
const settle = (page, ms = 140) => page.waitForTimeout(ms);

// ── default mode ───────────────────────────────────────────────────────────────────────────────────────────────
async function defaultMode() {
  mkdirSync(OUT, { recursive: true });
  const report = [];
  for (const vp of pickVps(VIEWPORTS)) {
    const { page, close } = await openPage(vp);
    const shot = async (file, extra = {}) => {
      await settle(page, extra.screen ? 320 : 140);             // screens fade in over 0.2 s
      await page.screenshot({ path: join(OUT, file) });
      const cam = await page.evaluate(() => window.__skate.camera());
      const snap = await page.evaluate(() => window.__skate.snapshot());
      report.push({ file, tick: snap.tick, t: +snap.t.toFixed(2), area: snap.area, speed: +snap.speed.toFixed(2),
        H: +cam.H.toFixed(2), yawDeg: +cam.yawDeg.toFixed(1), lookAheadSec: +cam.lookAheadSec.toFixed(2), ...extra });
    };
    await shot(`title-${vp.name}.png`);
    // Run frames.
    await page.evaluate((s) => { window.__skate.start({ seed: s, god: true }); window.__skate.manual(true); }, seed);
    let done = 0;
    for (const ticks of ticksList) {
      await page.evaluate((n) => window.__skate.step(n), ticks - done);
      done = ticks;
      await shot(`run-${vp.name}-t${String(ticks).padStart(4, '0')}.png`);
    }
    // Debug overlay frame.
    await page.evaluate(() => { window.__skate.ext.overlay(true); window.__skate.ext.perfHud(true); window.__skate.renderNow(); });
    await shot(`overlay-${vp.name}.png`);
    await page.evaluate(() => { window.__skate.ext.overlay(false); window.__skate.ext.perfHud(false); });
    // Areas at blend 0, then the gateway blends into each area (first viewport only: the palette is aspect-free).
    for (const area of AREAS) {
      await page.evaluate((a) => { window.__skate.previewArea(a); window.__skate.step(30); }, area);
      await shot(`area-${area}-${vp.name}.png`, { preset: area });
    }
    if (vp === pickVps(VIEWPORTS)[0]) {
      for (const area of AREAS) {
        for (const u of BLENDS) {
          await page.evaluate(([a, b]) => { window.__skate.previewArea(a, b); }, [NEXT[area], u]);
          await shot(`blend-${area}-${NEXT[area]}-${Math.round(u * 100)}-${vp.name}.png`, { blend: `${area}→${NEXT[area]} ${u}` });
        }
      }
    }
    // UI screens: a real crash for Crash / Results, then every other screen through __skate.ui (App.open).
    await page.evaluate(() => window.__skate.manual(false));
    await page.evaluate(() => {
      window.__skate.start({ seed: 2 }); window.__skate.manual(true);
      let s = window.__skate.step(200);
      while (s.alive && s.tick < 400) s = window.__skate.step(1);
    });
    await shot(`screen-crash-${vp.name}.png`, { screen: 'crash' });
    await page.waitForFunction(() => document.querySelector('#screens [data-screen="results"]')?.classList.contains('on'), null, { timeout: 10000 })
      .catch(() => fail(`[${vp.name}] results did not open after the crash`));
    await page.waitForTimeout(700);
    await shot(`screen-results-${vp.name}.png`, { screen: 'results' });
    await page.evaluate(() => { window.__skate.manual(false); window.__skate.start({ seed: 3, god: true }); });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__skate.ui('pause'));
    await shot(`screen-pause-${vp.name}.png`, { screen: 'pause' });
    await page.evaluate(() => { window.__skate.ui('run'); window.__skate.ui('pause', { rotate: true }); });
    await shot(`screen-pause-rotate-${vp.name}.png`, { screen: 'pause (rotate card)' });
    for (const id of SCREENS) {
      if (id === 'pause' || id === 'crash' || id === 'results') continue;
      await page.evaluate((s) => window.__skate.ui(s), id);
      await shot(`screen-${id}-${vp.name}.png`, { screen: id });
    }
    await page.evaluate(() => window.__skate.ui('title'));
    await close();
  }
  writeFileSync(join(OUT, 'shots.json'), JSON.stringify(report, null, 2));
  for (const r of report) console.log(`${r.file.padEnd(44)} t ${String(r.t).padStart(6)}  v ${r.speed}  H ${r.H}  yaw ${r.yawDeg}  look ${r.lookAheadSec}s`);
  console.log(`shots: ${report.length} PNGs in ${OUT}`);
}

// ── --cosmetics ────────────────────────────────────────────────────────────────────────────────────────────────
async function cosmeticsMode() {
  const dir = join(OUT, 'cosmetics');
  mkdirSync(dir, { recursive: true });
  const vp = { name: '390x844', width: 390, height: 844, mobile: true, dpr: 2 };
  const { page, close } = await openPage(vp, '&quality=high');
  const items = await page.evaluate(() => window.__skate.ext.catalog().map(({ look: _l, ...rest }) => rest));
  console.log(`cosmetics: ${items.length} catalog items`);
  // One cell per item: the turntable at 200 px, plus the skater scaled to 60 px and 31 px tall (DESIGN: reads at both).
  const cells = [];
  for (const it of items) {
    const cap = await page.evaluate((id) => {
      window.__skate.ui('locker', { preview: id, yaw: 30 });
      return window.__skate.ext.capture({ target: 'skater', size: 200, bg: '#3a3058' });
    }, it.id);
    if (!cap.rect) { fail(`cosmetics: no skater on screen for ${it.id}`); continue; }
    writeDataUrl(join(dir, `${it.id}.png`), cap.dataUrl);
    cells.push({ ...it, dataUrl: cap.dataUrl });
  }
  const sheet = await page.evaluate(async (list) => {
    const cols = Math.min(5, Math.max(1, list.length)), cw = 236, ch = 262, rows = Math.ceil(list.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * cw; c.height = rows * ch + 34;
    const x = c.getContext('2d');
    x.fillStyle = '#fff4e3'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#2b2140'; x.font = '700 16px Nunito, sans-serif';
    x.fillText(`DUSKLANE cosmetics · ${list.length} items · turntable 200 px, skater at 60 px and 31 px`, 10, 22);
    const RARITY = { common: '#c9c2b8', rare: '#5eb8ff', epic: '#b47cff', legendary: '#ffb13b' };
    for (let i = 0; i < list.length; i++) {
      const it = list[i], cx = (i % cols) * cw, cy = 34 + Math.floor(i / cols) * ch;
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.src = it.dataUrl; });
      x.fillStyle = RARITY[it.rarity] ?? '#c9c2b8'; x.fillRect(cx + 4, cy, cw - 8, 6);
      x.drawImage(img, cx + 4, cy + 8, 160, 160);
      // The skater fills ~1/(1+pad) of the crop height: scale so it is 60 px and 31 px tall.
      const fill = 1 / 1.35;
      for (const [hpx, oy] of [[60, 8], [31, 100]]) {
        const s = hpx / fill;
        x.drawImage(img, cx + 168 + (64 - s) / 2 + 0, cy + oy + (80 - s) / 2, s, s);
      }
      x.fillStyle = '#2b2140'; x.font = '800 13px Nunito, sans-serif';
      x.fillText(it.name, cx + 6, cy + 186, cw - 12);
      x.font = '600 11px ui-monospace, monospace';
      x.fillText(`${it.id}`, cx + 6, cy + 202, cw - 12);
      x.fillText(`${it.slot} · ${it.rarity.toUpperCase()} · ${it.source}${it.theme ? ` · ${it.theme}` : ''}`, cx + 6, cy + 217, cw - 12);
    }
    return c.toDataURL('image/png');
  }, cells);
  writeDataUrl(join(dir, 'contact-sheet.png'), sheet);
  // The Locker with 6 loadouts (slots cycled through the catalog, turntable yaw 0..300).
  const n = await page.evaluate(() => {
    const cat = window.__skate.ext.catalog();
    const by = (s) => cat.filter((c) => c.slot === s);
    const sk = by('skater'), bd = by('board'), hm = by('helmet');
    window.__shotsLoadouts = Array.from({ length: 6 }, (_, i) => ({
      skater: sk[(i * 7) % sk.length]?.look, board: bd[(i * 5 + 1) % bd.length]?.look, helmet: hm[(i * 3 + 2) % hm.length]?.look,
      ids: [sk[(i * 7) % sk.length]?.id, bd[(i * 5 + 1) % bd.length]?.id, hm[(i * 3 + 2) % hm.length]?.id],
    }));
    return 6;
  });
  for (let i = 0; i < n; i++) {
    const ids = await page.evaluate((k) => {
      const l = window.__shotsLoadouts[k];
      window.__skate.ui('locker', { loadout: { skater: l.skater, board: l.board, helmet: l.helmet }, yaw: k * 60 });
      return l.ids;
    }, i);
    await settle(page, 200);
    await page.screenshot({ path: join(dir, `locker-loadout-${i + 1}.png`) });
    console.log(`locker-loadout-${i + 1}.png  ${ids.join(' + ')}`);
  }
  await page.evaluate(() => window.__skate.ui('title'));
  await close();
  console.log(`cosmetics: ${cells.length} item PNGs + contact-sheet.png + ${n} locker loadouts in ${dir}`);
}

// ── --contrast ─────────────────────────────────────────────────────────────────────────────────────────────────
async function contrastMode() {
  const dir = join(OUT, 'contrast');
  mkdirSync(dir, { recursive: true });
  const rows = [];
  for (const vp of pickVps([VIEWPORTS[0], VIEWPORTS[2]])) {
    const { page, close } = await openPage(vp);
    const cases = [...AREAS.map((a) => ({ label: a, area: a, blend: undefined, samples: 14 })),
      ...AREAS.flatMap((a) => BLENDS.map((u) => ({ label: `${a}→${NEXT[a]} ${u}`, area: NEXT[a], blend: u, samples: 4 })))];
    for (const cs of cases) {
      const r = await page.evaluate(({ area, blend, samples }) => {
        window.__skate.previewArea(area, blend);
        const items = [];
        for (let i = 0; i < samples; i++) {
          window.__skate.step(i === 0 ? 20 : 36);
          for (const it of window.__skate.ext.contrastReport().items) items.push(it);
        }
        return items;
      }, cs);
      const hz = r.filter((i) => i.cls === 'hazard'), ed = r.filter((i) => i.cls === 'edge');
      const minOf = (l) => (l.length ? Math.min(...l.map((i) => i.ratio)) : NaN);
      const worstOf = (l) => l.reduce((a, b) => (a && a.ratio <= b.ratio ? a : b), null);
      const row = { vp: vp.name, preset: cs.label, hazards: hz.length, edges: ed.length, hazard: minOf(hz), edge: minOf(ed),
        worstHazard: worstOf(hz)?.kind ?? null, worstEdge: worstOf(ed)?.kind ?? null };
      rows.push(row);
      await page.screenshot({ path: join(dir, `${cs.label.replace(/[^a-z0-9]+/gi, '-')}-${vp.name}.png`) });
      const ok = (v, g) => (Number.isNaN(v) ? 'n/a' : v >= g ? 'ok' : 'FAIL');
      console.log(`${vp.name}  ${cs.label.padEnd(22)} hazard ${Number.isNaN(row.hazard) ? '  -  ' : row.hazard.toFixed(2)} (${hz.length}, ${ok(row.hazard, GATE.hazard)})`
        + `  edge ${Number.isNaN(row.edge) ? '  -  ' : row.edge.toFixed(2)} (${ed.length}, ${ok(row.edge, GATE.edge)})`
        + `${row.worstHazard ? `  worst hazard ${row.worstHazard}` : ''}${row.worstEdge ? `  worst edge ${row.worstEdge}` : ''}`);
      if (row.hazard < GATE.hazard) fail(`contrast ${vp.name} ${cs.label}: hazard ${row.hazard.toFixed(2)} < ${GATE.hazard} (${row.worstHazard})`);
      if (row.edge < GATE.edge) fail(`contrast ${vp.name} ${cs.label}: edge ${row.edge.toFixed(2)} < ${GATE.edge} (${row.worstEdge})`);
    }
    await close();
  }
  const measured = rows.filter((r) => r.hazards > 0).length, measuredE = rows.filter((r) => r.edges > 0).length;
  if (!measured) fail('contrast: no hazard was ever in view');
  if (!measuredE) fail('contrast: no grind edge was ever in view');
  writeFileSync(join(dir, 'report.json'), JSON.stringify(rows, null, 2));
  const all = (k) => Math.min(...rows.map((r) => r[k]).filter((v) => !Number.isNaN(v)));
  console.log(`contrast: ${rows.length} presets/blends; min hazard ${all('hazard').toFixed(2)} (gate ${GATE.hazard}), min edge ${all('edge').toFixed(2)} (gate ${GATE.edge})`);
}

// ── --hud ──────────────────────────────────────────────────────────────────────────────────────────────────────
async function hudMode() {
  const dir = join(OUT, 'hud');
  mkdirSync(dir, { recursive: true });
  const WORST = { score: 987654, dist: 23456, speed: 10.5, combo: 98765, links: 24, coins: 98765, trick: 'VARIAL HEELFLIP' };
  const rows = [];
  for (const [w, h] of [[320, 568], [360, 640], [390, 844]]) {
    const vp = { name: `${w}x${h}`, width: w, height: h, mobile: true, dpr: 2 };
    const { page, close } = await openPage(vp);
    await page.evaluate(() => { window.__skate.start({ seed: 1, god: true }); window.__skate.manual(true); window.__skate.step(240); });
    for (const variant of ['live', 'worst']) {
      if (variant === 'worst') await page.evaluate((v) => window.__skate.ext.hud(v), WORST);
      await settle(page, 200);
      await page.screenshot({ path: join(dir, `hud-${variant}-${vp.name}.png`), clip: { x: 0, y: 0, width: w, height: Math.min(h, 160) } });
      await page.screenshot({ path: join(dir, `hud-${variant}-${vp.name}-full.png`) });
      const m = await page.evaluate(() => {
        const band = document.querySelector('#hud .hud-band') ?? document.getElementById('hud');
        const bandRect = band.getBoundingClientRect();
        const probe = document.getElementById('safe-probe');
        const safeTop = probe ? parseFloat(getComputedStyle(probe).paddingTop) || 0 : 0;
        const els = [...document.querySelectorAll('#hud [data-hud]')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && e.textContent !== '' || e.dataset.hud === 'pause');
        return { safeTop, band: { top: bandRect.top, bottom: bandRect.bottom }, vw: innerWidth,
          rects: els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.hud, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, text: e.textContent }; }) };
      });
      const issues = [];
      const groups = { score: 'L', dist: 'L', combo: 'M', trick: 'M', coins: 'R', pause: 'R' };
      for (let i = 0; i < m.rects.length; i++) {
        const a = m.rects[i];
        if (a.y1 > m.safeTop + 56 + 0.5) issues.push(`${a.id} leaves the 56 px band (bottom ${a.y1.toFixed(1)})`);
        if (a.x0 < -0.5 || a.x1 > m.vw + 0.5) issues.push(`${a.id} is off-screen`);
        for (let j = i + 1; j < m.rects.length; j++) {
          const b = m.rects[j];
          if (groups[a.id] && groups[a.id] === groups[b.id]) continue;          // stacked pieces of one group
          const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
          if (ix > 0.5 && iy > 0.5) issues.push(`${a.id} overlaps ${b.id}`);
        }
      }
      rows.push({ vp: vp.name, variant, rects: m.rects, issues });
      console.log(`${vp.name.padEnd(8)} ${variant.padEnd(5)} ${issues.length ? `FAIL ${issues.join('; ')}` : 'ok'}  `
        + m.rects.map((r) => `${r.id}[${Math.round(r.x0)}–${Math.round(r.x1)}]`).join(' '));
      for (const i of issues) fail(`hud ${vp.name} ${variant}: ${i}`);
    }
    await page.evaluate(() => window.__skate.ext.hud(null));
    await close();
  }
  writeFileSync(join(dir, 'report.json'), JSON.stringify(rows, null, 2));
}

// ── --audio ────────────────────────────────────────────────────────────────────────────────────────────────────
async function audioMode() {
  const vp = { name: '390x844', width: 390, height: 844, mobile: true };
  const { page, close } = await openPage(vp);
  const results = [];
  for (const area of AREAS) {
    const r = await page.evaluate(async (a) => {
      const f = window.__skate.renderAudio;
      if (typeof f !== 'function') return { missing: true };
      const t0 = performance.now();
      const res = await f(a, 20);
      return res ? { ...res, ms: performance.now() - t0 } : null;
    }, area);
    if (!r || r.missing) {
      console.log(`audio ${area}: renderAudio returned ${r?.missing ? 'nothing (no hook)' : 'null'}: audio/index.ts renderOffline is still the M0 stub (AU ships it). No WAV written.`);
      results.push({ area, rendered: false });
      continue;
    }
    mkdirSync(AUDIO_OUT, { recursive: true });
    const file = join(AUDIO_OUT, `${area}.wav`);
    writeFileSync(file, Buffer.from(r.wavBase64, 'base64'));
    const dbfs = r.peak > 0 ? 20 * Math.log10(r.peak) : -Infinity;
    results.push({ area, rendered: true, peak: r.peak, dbfs, sampleRate: r.sampleRate, sec: r.sec });
    console.log(`audio ${area}: ${file}  ${r.sec.toFixed(1)} s @ ${r.sampleRate} Hz  peak ${dbfs.toFixed(2)} dBFS  (${(r.ms / 1000).toFixed(1)} s to render)`);
    if (r.peak < 1e-4) fail(`audio ${area}: silent render (peak ${dbfs.toFixed(1)} dBFS)`);
    else if (dbfs > -1) fail(`audio ${area}: peak ${dbfs.toFixed(2)} dBFS is above −1 dBFS (clipping risk)`);
  }
  if (results.every((r) => !r.rendered)) console.log('audio: nothing rendered (stub). This is expected until AU ships renderOffline; exit 0.');
  await close();
}

try {
  if (!MODES.length) await defaultMode();
  for (const m of MODES) {
    console.log(`\n── shots --${m} ──`);
    if (m === 'cosmetics') await cosmeticsMode();
    if (m === 'contrast') await contrastMode();
    if (m === 'hud') await hudMode();
    if (m === 'audio') await audioMode();
  }
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  await browser.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);
