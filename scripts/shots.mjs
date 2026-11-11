#!/usr/bin/env node
// scripts/shots.mjs: screenshots and pixel gates for visual review (TECH §11.4). Every mode works only through
// window.__skate (the frozen DebugAPI plus `__skate.ext`, debug/api.ts), so later packages never edit this file.
//
//   node scripts/shots.mjs [modes] [--seed N] [--ticks a,b,c] [--no-build] [--vp 390x844,...]
//     (no mode)    title, run frames, every area at blend 0 and in the gateway blends, every UI screen, the debug
//                  overlay frame, at 390×844, 390×664 and 1280×800                      → artifacts/shots/*.png
//     --cosmetics  every CATALOG item: turntable views on a plain background (front 3/4 plus slot close-ups) and the
//                  item at real in-run scale (≈ 60 px and ≈ 31 px skater, native pixels), one PNG per item, the
//                  contact sheet, and the Locker with 6 loadouts                         → artifacts/shots/cosmetics/
//     --contrast   the DESIGN §18.4 pixel gate (hazard ≥ 2.5:1, grind edge ≥ 1.8:1) at every area preset and gateway
//                  blend; exits 1 on a failure                                           → artifacts/shots/contrast/
//     --hud        HUD layouts at 320 / 360 / 390 px (live and a worst-case preview), overlap and 56 px band
//                  checks; exits 1 on a failure                                          → artifacts/shots/hud/
//     --audio      20 s renderAudio per area as 16-bit WAV with the peak in dBFS; a null render (the M0 audio stub)
//                  prints a note and exits 0; a peak ≥ 1.0 or silence exits 1 (above −1 dBFS warns) → artifacts/audio/
//     --green      THEME §5 green share per area (390×844 run frames, canvas only so the HUD is excluded; 3 seeds × 3
//                  frames; HSV hue 60–178°, S ≥ 0.20, V ≥ 0.10) against each area's band; exits 1 outside a band
//                                                                                        → artifacts/shots/green/
//     --cam ID     every page runs the debug camera variant ID (?cam=, world/render/camVariants.ts; default A)
// Several modes may be combined. Uses the preview server on $PORT (default 5173) if one is up; otherwise builds
// (unless --no-build) and starts `vite preview`. Chromium comes from /opt/pw-browsers (never `playwright install`).
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const { chromium } = await import('@playwright/test');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAM_ARG = process.argv.indexOf('--cam');
const OUT = join(ROOT, 'artifacts', CAM_ARG > 0 && process.argv[CAM_ARG + 1] ? `shots-cam-${process.argv[CAM_ARG + 1]}` : 'shots');
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
const cam = opt('cam', '');
const ticksList = opt('ticks', '60,330,600').split(',').map(Number).filter((n) => n >= 0);
const MODES = ['cosmetics', 'contrast', 'green', 'hud', 'audio'].filter(flag);
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
  // (a page load under software GL with other pages rendering can pass 30 s on a shared machine: the tool waits longer)
  await page.goto(`${BASE}/?debug=1&seed=${seed}${cam ? `&cam=${encodeURIComponent(cam)}` : ''}${query}`, { timeout: 120000 });
  await page.waitForFunction(() => !!window.__skate, null, { timeout: 60000 });
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
    // The Title's Earth maps bake in idle slices after boot: shoot it once they are up (a preview Earth until then).
    await page.waitForFunction(() => !window.__skateTitle || window.__skateTitle.bakeDone(), null, { timeout: 60000, polling: 250 })
      .catch(() => fail(`[${vp.name}] the Title's Earth maps did not finish baking`));
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
// Per item: the turntable views on a plain background (ext.capture view: front 3/4 for every item, plus close-ups
// of the slot: the rider from behind, the board from below (its graphic) and from above, the helmet front and back),
// and the item at real in-run scale (ext.tryOn in a god run, cropped at native pixels, no resampling): 390×844 at the
// start speed (≈ 60 CSS px skater) and 375×548 (SE in Safari) at top speed (≈ 31 CSS px), both at DPR 2.
const COSMETIC_BG = '#3a3058';
const SLOT_VIEWS = {
  skater: [['rear 3/4', { azDeg: 160, elevDeg: 12 }], ['face', { part: 'head', azDeg: 20, elevDeg: 6 }]],
  board: [['graphic (below)', { part: 'board', azDeg: 25, elevDeg: -42 }], ['top', { part: 'board', azDeg: 25, elevDeg: 48 }]],
  helmet: [['helmet', { part: 'head', azDeg: 25, elevDeg: 14 }], ['helmet back', { part: 'head', azDeg: 150, elevDeg: 24 }]],
};
const RUN_SCALES = [
  { name: '390×844 start', vp: { name: '390x844', width: 390, height: 844, mobile: true, dpr: 2 }, startT: 0, slot: 220 },
  { name: '375×548 top speed', vp: { name: '375x548', width: 375, height: 548, mobile: true, dpr: 2 }, startT: 160, slot: 112 },
];

async function cosmeticsMode() {
  const dir = join(OUT, 'cosmetics');
  mkdirSync(dir, { recursive: true });
  const vp = { name: '390x844', width: 390, height: 844, mobile: true, dpr: 2 };
  const { page, close } = await openPage(vp, '&quality=high');
  const runPages = [];
  for (const r of RUN_SCALES) runPages.push({ ...r, ...(await openPage(r.vp, '&quality=high')) });
  const items = await page.evaluate(() => window.__skate.ext.catalog().map(({ look: _l, ...rest }) => rest));
  console.log(`cosmetics: ${items.length} catalog items`);
  const cells = [];
  const sizes = RUN_SCALES.map(() => []);
  for (const it of items) {
    // Turntable views: re-enter the Locker so the showcase clock restarts at its idle pose.
    await page.evaluate(() => window.__skate.ui('title'));
    await page.evaluate((id) => window.__skate.ui('locker', { preview: id, yaw: 0 }), it.id);
    await settle(page, 120);
    const views = await page.evaluate(([bg, extra]) => {
      const cap = (view, size) => window.__skate.ext.capture({ view, size, bg }).dataUrl;
      return { main: cap({ azDeg: 20, elevDeg: 8 }, 240), extra: extra.map(([label, v]) => ({ label, url: cap(v, 116) })) };
    }, [COSMETIC_BG, SLOT_VIEWS[it.slot] ?? []]);
    if (!views.main) { fail(`cosmetics: no skater to frame for ${it.id}`); continue; }
    // Real in-run scale.
    const runs = [];
    for (let k = 0; k < runPages.length; k++) {
      const rp = runPages[k];
      await rp.page.evaluate(([t]) => { window.__skate.start({ startT: t, god: true }); window.__skate.manual(true); window.__skate.step(2); }, [rp.startT]);
      const ok = await rp.page.evaluate((id) => window.__skate.ext.tryOn(id), it.id);
      if (!ok) fail(`cosmetics: tryOn(${it.id}) refused`);
      await settle(rp.page, 160);                                // skater springs settle on rAF renders
      const cap = await rp.page.evaluate(() => { window.__skate.step(6); return window.__skate.ext.capture({ target: 'skater', native: true, pad: 0.3 }); });
      if (!cap.rect) { fail(`cosmetics: no skater on screen in the run (${rp.name}) for ${it.id}`); continue; }
      sizes[k].push(cap.skaterCss.h);
      runs.push({ label: rp.name, px: cap.skaterCss.h, url: cap.dataUrl, slot: rp.slot });
    }
    cells.push({ ...it, views, runs });
  }
  // One cell per item (also written alone as <id>.png), then the grid.
  const sheet = await page.evaluate(async ([list, bg]) => {
    const CW = 720, CH = 330, load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
    const RARITY = { common: '#c9c2b8', rare: '#5eb8ff', epic: '#b47cff', legendary: '#ffb13b' };
    const drawCell = async (x, it, ox, oy) => {
      x.fillStyle = '#fff4e3'; x.fillRect(ox, oy, CW, CH);
      x.fillStyle = RARITY[it.rarity] ?? '#c9c2b8'; x.fillRect(ox + 4, oy, CW - 8, 6);
      x.font = '600 10px ui-monospace, monospace';
      const label = (t, lx, ly) => { x.fillStyle = '#2b2140'; x.fillText(t, lx, ly); };
      const main = await load(it.views.main);
      if (main) x.drawImage(main, ox + 4, oy + 10, 240, 240);
      label('front 3/4', ox + 6, oy + 262);
      for (let k = 0; k < it.views.extra.length; k++) {
        const e = it.views.extra[k], img = await load(e.url), ey = oy + 10 + k * 126;
        if (img) x.drawImage(img, ox + 250, ey, 116, 116);
        label(e.label, ox + 250, ey + 124 > oy + 262 ? oy + 262 : ey + 124);
      }
      // In-run crops at native pixels (scaled down only if a crop is larger than its slot, and then labelled so).
      let rx = ox + 374;
      for (const r of it.runs) {
        const img = await load(r.url);
        if (img) {
          const s = Math.min(1, r.slot / Math.max(img.width, img.height));
          const w = Math.round(img.width * s), h = Math.round(img.height * s);
          x.fillStyle = bg; x.fillRect(rx, oy + 10, r.slot, r.slot);
          x.drawImage(img, rx + (r.slot - w) / 2, oy + 10 + (r.slot - h) / 2, w, h);
          label(r.label, rx, oy + 10 + r.slot + 12);
          label(`skater ${r.px.toFixed(0)} px${s < 1 ? ' (scaled)' : ''}`, rx, oy + 10 + r.slot + 24);
        }
        rx += r.slot + 8;
      }
      x.fillStyle = '#2b2140'; x.font = '800 14px Nunito, sans-serif';
      x.fillText(it.name, ox + 6, oy + 284, CW - 12);
      x.font = '600 11px ui-monospace, monospace';
      x.fillText(`${it.id} · ${it.slot} · ${it.rarity.toUpperCase()} · ${it.source}${it.theme ? ` · ${it.theme}` : ''}`, ox + 6, oy + 302, CW - 12);
    };
    const per = [];
    for (const it of list) {
      const c = document.createElement('canvas'); c.width = CW; c.height = CH;
      await drawCell(c.getContext('2d'), it, 0, 0);
      per.push({ id: it.id, url: c.toDataURL('image/png') });
    }
    const cols = Math.min(3, Math.max(1, list.length)), rows = Math.ceil(list.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * CW; c.height = rows * CH + 34;
    const x = c.getContext('2d');
    x.fillStyle = '#fff4e3'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#2b2140'; x.font = '700 16px Nunito, sans-serif';
    x.fillText(`ISOSKATE cosmetics · ${list.length} items · turntable views on a plain background; in-run crops at native pixels (DPR 2)`, 10, 22);
    for (let i = 0; i < list.length; i++) await drawCell(x, list[i], (i % cols) * CW, 34 + Math.floor(i / cols) * CH);
    return { sheet: c.toDataURL('image/png'), per };
  }, [cells, COSMETIC_BG]);
  for (const p of sheet.per) writeDataUrl(join(dir, `${p.id}.png`), p.url);
  writeDataUrl(join(dir, 'contact-sheet.png'), sheet.sheet);
  for (let k = 0; k < RUN_SCALES.length; k++) {
    const v = sizes[k];
    if (v.length) console.log(`cosmetics: in-run skater height at ${RUN_SCALES[k].name}: ${Math.min(...v).toFixed(1)}–${Math.max(...v).toFixed(1)} CSS px`);
  }
  for (const rp of runPages) await rp.close();
  // The Locker with 6 loadouts (slots cycled through the catalog; turntable yaw: front 3/4 both ways, front, back).
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
  const YAWS = [20, -20, 40, -40, 0, 160];
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => window.__skate.ui('title'));
    const ids = await page.evaluate(([k, yaw]) => {
      const l = window.__shotsLoadouts[k];
      window.__skate.ui('locker', { loadout: { skater: l.skater, board: l.board, helmet: l.helmet }, yaw });
      return l.ids;
    }, [i, YAWS[i]]);
    await settle(page, 200);
    await page.screenshot({ path: join(dir, `locker-loadout-${i + 1}.png`) });
    console.log(`locker-loadout-${i + 1}.png  ${ids.join(' + ')}  yaw ${YAWS[i]}`);
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
      // Every preset / blend frame set must measure at least one hazard and one grind edge (G1): when the default
      // start shows none, the same palette is retried from slightly earlier / later starts (previewArea's run time
      // ± 0.6 … 2.4 s; blends: the same gateway, ≤ 0.3 of blend weight away), else the case fails with "no hazard".
      const { items: r, worst, offset } = await page.evaluate(({ area, blend, samples, gate }) => {
        const ARRIVAL = { downtown: 161, suburbs: 44, docks: 83, neon: 122 };
        const t0 = blend === undefined ? (area === 'downtown' ? 10 : ARRIVAL[area] + 10) : ARRIVAL[area] - 6 + 8 * blend;
        let items = [], worst = null, offset = 0;
        const union = []; let uWorst = null, uRel = Infinity;
        // (@cam: the finer offsets come last, so a case that already measured both classes keeps its frames; the very
        // last retry measures the default start over the whole readable range, up to the HUD line: the perspective
        // camera on a wide screen can show no grindable within look-ahead + 8 m in a whole gateway window. If no
        // single attempt shows both classes, the case is judged on every frame of every attempt, all in the same
        // palette window.)
        for (const off of [0, -1.2, 1.2, -2.4, 2.4, -0.6, 0.6, -1.8, 1.8, 'hud']) {
          window.__contrastHudRange = off === 'hud';
          if (off === 0 || off === 'hud') window.__skate.previewArea(area, blend);
          else { window.__skate.start({ startT: Math.max(0, t0 + off), god: true }); window.__skate.manual(true); window.__skate.step(1); }
          items = []; worst = null; offset = off;
          let worstRel = Infinity;
          for (let i = 0; i < samples; i++) {
            window.__skate.step(i === 0 ? 20 : 36);
            for (const it of window.__skate.ext.contrastReport().items) {
              items.push(it); union.push(it);
              const rel = it.ratio / gate[it.cls];
              if (rel < worstRel) { worstRel = rel; worst = { item: it, tick: window.__skate.snapshot().tick, png: window.__skate.ext.capture().dataUrl }; }
              if (rel < uRel) { uRel = rel; uWorst = worst; }
            }
          }
          if (items.some((i) => i.cls === 'hazard') && items.some((i) => i.cls === 'edge')) break;
        }
        window.__contrastHudRange = false;
        if (!(items.some((i) => i.cls === 'hazard') && items.some((i) => i.cls === 'edge'))) return { items: union, worst: uWorst, offset: 'all' };
        return { items, worst, offset };
      }, { ...cs, gate: GATE });
      if (offset === 'all') console.log(`    (${cs.label}: no single start showed both classes: judged on every attempted frame)`);
      else if (offset === 'hud') console.log(`    (${cs.label}: measured over the readable range, up to the HUD line)`);
      else if (offset !== 0) console.log(`    (${cs.label}: measured from a start ${offset > 0 ? '+' : ''}${offset} s off the default)`);
      if (worst) {
        const w = worst.item;
        writeDataUrl(join(dir, `${cs.label.replace(/[^a-z0-9]+/gi, '-')}-${vp.name}-worst.png`), worst.png);
        console.log(`    worst: ${w.cls} ${w.kind} #${w.id} ${w.ratio.toFixed(2)} at tick ${worst.tick}, css box ${Math.round(w.at.x0)},${Math.round(w.at.y0)}–${Math.round(w.at.x1)},${Math.round(w.at.y1)} (fg ${w.fg.toFixed(3)} bg ${w.bg.toFixed(3)})`);
      }
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
      if (!hz.length) fail(`contrast ${vp.name} ${cs.label}: no hazard in view`);
      if (!ed.length) fail(`contrast ${vp.name} ${cs.label}: no grind edge in view`);
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

// ── --green ────────────────────────────────────────────────────────────────────────────────────────────────────
/** THEME §5 per-area green-share bands (RECLAIM): each area keeps its own flora and amount of it. */
const GREEN_BAND = { downtown: [0.06, 0.15], suburbs: [0.12, 0.30], docks: [0.03, 0.10], neon: [0.03, 0.10] };
async function greenMode() {
  const dir = join(OUT, 'green');
  mkdirSync(dir, { recursive: true });
  const vp = VIEWPORTS[0];
  const { page, close } = await openPage(vp);
  const rows = [];
  for (const area of AREAS) {
    const frames = [];
    for (const sd of [seed, seed + 1, seed + 2]) {
      // Three frames per seed, 4 s apart, mid-visit (previewArea's start: arrival + 10 s; Downtown from 10 s); a frame
      // that is not in the area (a seed whose schedule differs) moves on by 2 s, up to four times.
      const got = await page.evaluate(({ area, sd }) => {
        const ARRIVAL = { downtown: 161, suburbs: 44, docks: 83, neon: 122 };
        const t0 = area === 'downtown' ? 14 : ARRIVAL[area] + 10;
        const share = () => {
          const gl = document.querySelector('canvas#gl');
          const c = document.createElement('canvas'); c.width = gl.width; c.height = gl.height;
          const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(gl, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height).data;
          let g = 0;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], gg = d[i + 1], b = d[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
            if (mx < 25.5 || mx - mn < 0.2 * mx) continue;                           // V ≥ 0.10, S ≥ 0.20
            const dd = mx - mn;
            let hue = mx === r ? ((gg - b) / dd) % 6 : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4;
            hue *= 60; if (hue < 0) hue += 360;
            if (hue >= 60 && hue <= 178) g++;
          }
          return g / (d.length / 4);
        };
        const out = [];
        for (let k = 0; k < 3; k++) {
          let t = t0 + 4 * k, snap = null;
          for (let tries = 0; tries < 5; tries++, t += 2) {
            window.__skate.start({ seed: sd, startT: t, god: true }); window.__skate.manual(true);
            window.__skate.step(20);
            snap = window.__skate.snapshot();
            if (snap.area === area) break;
          }
          window.__skate.renderNow();
          out.push({ t, area: snap.area, share: share(), png: k === 0 ? window.__skate.ext.capture({ size: 4096 }).dataUrl : null });
        }
        return out;
      }, { area, sd });
      for (const f of got) {
        if (f.png) writeDataUrl(join(dir, `${area}-s${sd}.png`), f.png);
        frames.push({ seed: sd, t: f.t, area: f.area, share: f.share });
      }
    }
    const inArea = frames.filter((f) => f.area === area);
    const mean = inArea.reduce((a, f) => a + f.share, 0) / Math.max(1, inArea.length);
    const [lo, hi] = GREEN_BAND[area];
    const ok = inArea.length >= 6 && mean >= lo && mean <= hi;
    rows.push({ area, mean, band: [lo, hi], frames });
    console.log(`${area.padEnd(9)} green ${(100 * mean).toFixed(1).padStart(5)}%  band ${100 * lo}–${100 * hi}%  `
      + `(${inArea.length}/9 frames: ${inArea.map((f) => (100 * f.share).toFixed(1)).join(' ')})  ${ok ? 'ok' : 'FAIL'}`);
    if (inArea.length < 6) fail(`green ${area}: only ${inArea.length}/9 frames were in the area`);
    else if (!ok) fail(`green ${area}: ${(100 * mean).toFixed(1)}% outside ${100 * lo}–${100 * hi}%`);
  }
  await close();
  writeFileSync(join(dir, 'report.json'), JSON.stringify(rows, null, 2));
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
    // TECH §11.4: fail at a peak ≥ 1.0 (full scale); above −1 dBFS is only a warning (headroom for lossy encoders).
    else if (r.peak >= 1) fail(`audio ${area}: peak ${r.peak.toFixed(4)} (${dbfs.toFixed(2)} dBFS) reaches full scale (clipping)`);
    else if (dbfs > -1) console.warn(`audio ${area}: warning: peak ${dbfs.toFixed(2)} dBFS is above −1 dBFS (little headroom)`);
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
    if (m === 'green') await greenMode();
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
