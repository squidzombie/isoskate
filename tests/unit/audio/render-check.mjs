#!/usr/bin/env node
// tests/unit/audio/render-check.mjs: offline-render self-check for the audio package (AU, ROADMAP W3b).
//
//   PORT=5184 node tests/unit/audio/render-check.mjs [--no-server] [--areas downtown,neon] [--sec 20]
//
// Serves the app with `vite` (dev) on $PORT unless one is already up, opens /?debug=1 in headless Chromium and
//  1. renders `sec` seconds per area through the frozen hook window.__skate.renderAudio(area, sec) → artifacts/audio/<area>.wav,
//  2. renders stems through window.__skateAudio.renderScene (music only, roll bed only, every SFX once),
//  3. ANALYSES them (we cannot listen): sample and true peak, RMS, integrated loudness (BS.1770 K-weighting), DC
//     offset, dropouts and long silences, tempo by onset autocorrelation vs the area BPM, swing (odd-16th delay),
//     spectral balance (octave-band tilt, mud and 2–5 kHz harshness residuals, air), SFX one-shots under the music,
//     and determinism (two renders of the same area are bit-identical).
// Writes artifacts/audio/report.json and exits non-zero on any failure.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const { chromium } = await import('@playwright/test');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = join(ROOT, 'artifacts', 'audio');
const PORT = Number(process.env.PORT ?? 5184);
const BASE = `http://127.0.0.1:${PORT}`;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SEC = Number(opt('sec', '20'));
const AREAS = opt('areas', 'downtown,suburbs,docks,neon,menu').split(',');
const BPM = { downtown: 84, suburbs: 80, docks: 78, neon: 88, menu: 76 };

// ── Thresholds (the taste bar, as numbers) ──────────────────────────────────────────────────────────────────────
const LIMITS = {
  peakDb: -1,                 // sample peak < −1 dBFS
  truePeakDb: -0.5,           // 4× oversampled
  lufs: [-22, -12],           // integrated loudness of the listening render (phone speakers; mixes under other apps)
  rmsDb: [-30, -12],
  dc: 0.002,
  silenceSec: 0.25,           // no 50 ms-window run below −55 dBFS longer than this (after the needle drop)
  zeroRun: 64,                // no run of exact zeros (a dropout) longer than this many samples
  bpmTol: 1.5,
  swingBeats: [0.022, 0.058], // DESIGN: 0.04 beat
  tilt: [-8.5, -2.0],         // dB/octave over 63 Hz–8 kHz: warm (falls with frequency) but not dead
  mudDb: 3.5,                 // 250 / 500 Hz octave residual above the tilt line
  mudMenuDb: 7,               // level 0 (menu): no bass by design
  harshDb: 2.0,               // 2 k / 4 k octave residual above the tilt line
  harshThirdDb: 4.0,          // any 1/3 octave in 2–5 kHz above its neighbours
  airDb: -34,                 // E(8 k) − E(1 k)
  sfxOverMusicDb: 0,          // each SFX's loudest 100 ms ≤ the music's 90th-percentile 100 ms loudness
  sfxUnderMusicDb: 18,        // ... and not more than 18 dB under it (still audible over the music; the needle lift
                              //     is exempt: it plays after the tape stop, over silence)
  hazardUnderMusicDb: 12,     // the hazard tick is a gameplay cue: within 12 dB of the music p90
  bedUnderMusicDb: 6,         // roll + wind at plateau speed ≥ 6 dB under the music (integrated)
};

// ── Server and page ─────────────────────────────────────────────────────────────────────────────────────────────
async function up() { try { return (await fetch(`${BASE}/`)).ok; } catch { return false; } }
let server = null;
if (!argv.includes('--no-server') && !(await up())) {
  server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(PORT) } });
  const t0 = Date.now();
  while (!(await up())) {
    if (Date.now() - t0 > 30000) { server.kill(); throw new Error(`dev server did not start on ${PORT}`); }
    await new Promise((r) => setTimeout(r, 200));
  }
}
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}/?debug=1&quality=low`);
await page.waitForFunction(() => !!window.__skate && !!window.__skateAudio, null, { timeout: 30000 });

const b64ToBuf = (b64) => Buffer.from(b64, 'base64');
function wavToFloat(buf) {
  const n = (buf.length - 44) / 4, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = buf.readInt16LE(44 + i * 4) / 32768; R[i] = buf.readInt16LE(46 + i * 4) / 32768; }
  return { L, R, sr: buf.readUInt32LE(24) };
}
/** Extended render through the debug hook: float32 channels as base64, plus marks. */
async function scene(o) {
  const r = await page.evaluate(async (o) => {
    const res = await window.__skateAudio.renderScene(o);
    if (!res) return null;
    const enc = (a) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
    return { sr: res.buffer.sampleRate, L: enc(res.buffer.getChannelData(0)), R: enc(res.buffer.getChannelData(1)), marks: res.marks };
  }, o);
  if (!r) throw new Error(`renderScene returned null for ${JSON.stringify(o)}`);
  const f = (b) => { const x = b64ToBuf(b); return new Float32Array(x.buffer, x.byteOffset, x.byteLength / 4); };
  return { L: f(r.L), R: f(r.R), sr: r.sr, marks: r.marks };
}
function writeWav(path, a) {
  const n = a.L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(a.sr, 24); b.writeUInt32LE(a.sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  const q = (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < n; i++) { b.writeInt16LE(q(a.L[i]), 44 + i * 4); b.writeInt16LE(q(a.R[i]), 46 + i * 4); }
  writeFileSync(path, b);
}

// ── DSP helpers ─────────────────────────────────────────────────────────────────────────────────────────────────
const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
const pdb = (x) => 10 * Math.log10(Math.max(1e-20, x));
function biquadRun(x, c) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
/** BS.1770 K-weighting at any sample rate (pyloudnorm's parametrisation). */
function kweight(x, sr) {
  const norm = (b0, b1, b2, a0, a1, a2) => ({ b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 });
  let w0 = 2 * Math.PI * 1681.974450955533 / sr, A = Math.pow(10, 3.999843853973347 / 40), al = Math.sin(w0) / (2 * 0.7071752369554196), c = Math.cos(w0);
  const s1 = norm(A * ((A + 1) + (A - 1) * c + 2 * Math.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - 2 * Math.sqrt(A) * al),
    (A + 1) - (A - 1) * c + 2 * Math.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - 2 * Math.sqrt(A) * al);
  w0 = 2 * Math.PI * 38.13547087602444 / sr; al = Math.sin(w0) / (2 * 0.5003270373238773); c = Math.cos(w0);
  const s2 = norm((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  return biquadRun(biquadRun(x, s1), s2);
}
/** Short-window loudness (K-weighted, both channels) in LUFS-like units: window `win` s, hop `hop` s. */
function shortLoud(a, win, hop, from = 0, to = Infinity) {
  const kl = a.kL ?? (a.kL = kweight(a.L, a.sr)), kr = a.kR ?? (a.kR = kweight(a.R, a.sr));
  const W = Math.round(win * a.sr), H = Math.round(hop * a.sr), out = [];
  const i0 = Math.round(from * a.sr), i1 = Math.min(kl.length, Math.round(to * a.sr));
  for (let i = i0; i + W <= i1; i += H) {
    let s = 0;
    for (let k = i; k < i + W; k++) s += kl[k] * kl[k] + kr[k] * kr[k];
    out.push(-0.691 + pdb(s / W));
  }
  return out;
}
function integrated(a, from = 0.6) {
  const blocks = shortLoud(a, 0.4, 0.1, from).filter((l) => l > -70);
  if (!blocks.length) return -Infinity;
  const mean = (arr) => pdb(arr.reduce((s, l) => s + Math.pow(10, l / 10), 0) / arr.length);
  const rel = mean(blocks) - 10;
  return mean(blocks.filter((l) => l > rel));
}
const pct = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k], br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi; re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
function psd(a, from = 0.6, N = 4096) {
  const mid = new Float32Array(a.L.length);
  for (let i = 0; i < mid.length; i++) mid[i] = (a.L[i] + a.R[i]) / 2;
  const out = new Float64Array(N / 2); let frames = 0;
  const hann = new Float64Array(N); for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  for (let s = Math.round(from * a.sr); s + N <= mid.length; s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = mid[s + i] * hann[i];
    fft(re, im);
    for (let k = 0; k < N / 2; k++) out[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  for (let k = 0; k < N / 2; k++) out[k] /= Math.max(1, frames);
  return { p: out, df: a.sr / N };
}
function bandDb(sp, lo, hi) {
  let s = 0;
  for (let k = Math.ceil(lo / sp.df); k <= Math.floor(hi / sp.df) && k < sp.p.length; k++) s += sp.p[k];
  return pdb(s);
}
function spectral(a) {
  const sp = psd(a);
  const centers = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
  const E = centers.map((f) => bandDb(sp, f / Math.SQRT2, f * Math.SQRT2));
  const xs = centers.map((f) => Math.log2(f / 1000));
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = E.reduce((s, y) => s + y, 0) / E.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (E[i] - my); den += (xs[i] - mx) ** 2; }
  const tilt = num / den, icpt = my - tilt * mx;
  const resid = (f) => E[centers.indexOf(f)] - (icpt + tilt * Math.log2(f / 1000));
  // 1/3-octave bumps in 2–5 kHz relative to the mean of the neighbouring thirds.
  const thirds = []; for (let f = 1250; f <= 6400; f *= Math.pow(2, 1 / 3)) thirds.push({ f, e: bandDb(sp, f / Math.pow(2, 1 / 6), f * Math.pow(2, 1 / 6)) });
  let bump = -Infinity;
  for (let i = 1; i < thirds.length - 1; i++) if (thirds[i].f >= 1900 && thirds[i].f <= 5100) bump = Math.max(bump, thirds[i].e - (thirds[i - 1].e + thirds[i + 1].e) / 2);
  return { bands: Object.fromEntries(centers.map((f, i) => [f, +E[i].toFixed(1)])), tilt: +tilt.toFixed(2),
    mud: +Math.max(resid(250), resid(500)).toFixed(2), harsh: +Math.max(resid(2000), resid(4000)).toFixed(2),
    harshThird: +bump.toFixed(2), air: +(E[7] - E[4]).toFixed(1) };
}
/** Onset envelope (spectral flux, hop 128) and picked onsets. */
function onsets(a, from = 0.6, loHz = 0) {
  const N = 1024, H = 128, mid = new Float32Array(a.L.length);
  for (let i = 0; i < mid.length; i++) mid[i] = (a.L[i] + a.R[i]) / 2;
  const hann = new Float64Array(N); for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  let prev = new Float64Array(N / 2);
  const flux = [];
  for (let s = Math.round(from * a.sr); s + N <= mid.length; s += H) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = mid[s + i] * hann[i];
    fft(re, im);
    let f = 0;
    const mag = new Float64Array(N / 2);
    const k0 = Math.max(1, Math.ceil(loHz / (a.sr / N)));
    for (let k = k0; k < N / 2; k++) { mag[k] = Math.log1p(1000 * Math.hypot(re[k], im[k])); const d = mag[k] - prev[k]; if (d > 0) f += d; }
    prev = mag; flux.push(f);
  }
  const hopSec = H / a.sr, t0 = from + N / 2 / a.sr;
  // Peaks above a local-median threshold.
  const picks = [];
  const W = 24;
  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
    const win = flux.slice(Math.max(0, i - W), i + W).sort((x, y) => x - y);
    const med = win[Math.floor(win.length / 2)];
    if (flux[i] > med * 1.3 + 1) {
      const t = t0 + i * hopSec;
      if (picks.length && t - picks[picks.length - 1].t < 0.04) { if (flux[i] > picks[picks.length - 1].s) picks[picks.length - 1] = { t, s: flux[i] }; }
      else picks.push({ t, s: flux[i] });
    }
  }
  return { flux, hopSec, t0, picks };
}
function tempo(o) {
  const f = o.flux, n = f.length, mean = f.reduce((s, x) => s + x, 0) / n;
  const x = f.map((v) => v - mean);
  let best = { bpm: 0, r: -Infinity }, rs = [];
  const lagOf = (bpm) => 60 / bpm / o.hopSec;
  for (let lag = Math.floor(lagOf(132)); lag <= Math.ceil(lagOf(62)); lag++) {
    let r = 0; for (let i = 0; i + lag < n; i++) r += x[i] * x[i + lag];
    r /= (n - lag);
    rs.push({ lag, r });
  }
  for (let i = 1; i < rs.length - 1; i++) {
    if (rs[i].r > best.r && rs[i].r >= rs[i - 1].r && rs[i].r >= rs[i + 1].r) {
      const a = rs[i - 1].r, b = rs[i].r, c = rs[i + 1].r, p = 0.5 * (a - c) / (a - 2 * b + c || 1);
      best = { bpm: 60 / ((rs[i].lag + p) * o.hopSec), r: b };
    }
  }
  return best.bpm;
}
/** Swing on the known tempo from hat onsets (> 5 kHz, vinyl off): the 8th-note grid phase that best fits the onsets
 *  (strong on-beat / off-beat hats), then the median delay of the onsets sitting between 8ths (odd 16ths: the ghost
 *  hats) from their straight position, in beats. DESIGN: 0.04 beat. */
function swing(hats, bpm) {
  const beat = 60 / bpm, s16 = beat / 4, e8 = 2 * s16, sig = 0.006;
  const P = hats.picks;
  let best = 0, bestScore = -Infinity;
  for (let ph = 0; ph < e8; ph += 0.0005) {
    let sc = 0;
    for (const p of P) { let d = (p.t - ph) % e8; if (d < 0) d += e8; d = Math.min(d, e8 - d); sc += p.s * Math.exp(-(d * d) / (2 * sig * sig)); }
    if (sc > bestScore) { bestScore = sc; best = ph; }
  }
  const odd = [], even = [];
  for (const p of P) {
    let d = (p.t - best) % e8; if (d < 0) d += e8;           // 0 … e8 from the previous 8th
    if (d < 0.35 * s16 || d > e8 - 0.35 * s16) even.push(Math.min(d, e8 - d) * (d < s16 ? 1 : -1));
    else odd.push(d - s16);
  }
  const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  return { swingBeats: +(med(odd) / beat).toFixed(4), odd: odd.length, even: even.length, oddFrac: +(med(odd) / s16).toFixed(3), evenFrac: +(med(even) / s16).toFixed(3) };
}
function levels(a, from = 0.6) {
  let peak = 0, sum = 0, dcL = 0, dcR = 0, zr = 0, zmax = 0;
  const i0 = Math.round(from * a.sr);
  for (let i = 0; i < a.L.length; i++) {
    const l = a.L[i], r = a.R[i];
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    dcL += l; dcR += r;
    if (i >= i0) { sum += l * l + r * r; if (l === 0 && r === 0) { zr++; zmax = Math.max(zmax, zr); } else zr = 0; }
  }
  const n = a.L.length - i0;
  // 4× true-peak estimate (windowed sinc, 8 taps each side) around the loudest samples.
  let tp = peak;
  const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
  for (const ch of [a.L, a.R]) {
    for (let i = 8; i < ch.length - 8; i++) {
      if (Math.abs(ch[i]) < peak * 0.7) continue;
      for (const fr of [0.25, 0.5, 0.75]) {
        let v = 0;
        for (let k = -7; k <= 8; k++) { const x = fr - k; v += ch[i + k] * sinc(x) * (0.5 + 0.5 * Math.cos(Math.PI * x / 8.5)); }
        tp = Math.max(tp, Math.abs(v));
      }
    }
  }
  // Silences: 50 ms windows below −55 dBFS.
  const W = Math.round(0.05 * a.sr);
  let run = 0, maxRun = 0;
  for (let i = i0; i + W <= a.L.length; i += W) {
    let s = 0; for (let k = i; k < i + W; k++) s += a.L[k] * a.L[k] + a.R[k] * a.R[k];
    if (pdb(s / (2 * W)) < -55) { run += 0.05; maxRun = Math.max(maxRun, run); } else run = 0;
  }
  return { peakDb: +db(peak).toFixed(2), truePeakDb: +db(tp).toFixed(2), rmsDb: +pdb(sum / (2 * n)).toFixed(2),
    dc: +Math.max(Math.abs(dcL), Math.abs(dcR)).toFixed(6) / a.L.length, zeroRun: zmax, silenceSec: +maxRun.toFixed(2) };
}

// ── Spectrogram PNG (log frequency 30 Hz – 16 kHz, 80 dB range), so a render can be looked at ───────────────────────
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(path, w, h, rgb) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  writeFileSync(path, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
function spectrogram(path, a, H = 240) {
  const N = 2048, hop = Math.round(a.sr * 0.02), frames = Math.floor((a.L.length - N) / hop);
  const hann = new Float64Array(N); for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const img = Buffer.alloc(frames * H * 3);
  const f0 = 30, f1 = 16000;
  for (let x = 0; x < frames; x++) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = ((a.L[x * hop + i] + a.R[x * hop + i]) / 2) * hann[i];
    fft(re, im);
    for (let y = 0; y < H; y++) {
      const f = f0 * Math.pow(f1 / f0, 1 - y / (H - 1)), k = Math.min(N / 2 - 1, Math.round(f / (a.sr / N)));
      const d = Math.max(0, Math.min(1, (pdb(re[k] * re[k] + im[k] * im[k]) + 20) / 80));
      const o = (y * frames + x) * 3;
      img[o] = Math.round(255 * Math.min(1, d * 1.6)); img[o + 1] = Math.round(255 * Math.max(0, d * 1.6 - 0.6)); img[o + 2] = Math.round(255 * Math.max(0, 0.5 - d) * (d > 0.05 ? 1 : 0));
    }
  }
  png(path, frames, H, img);
}

// ── Run ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const report = { sec: SEC, areas: {}, sfx: null, failures: [] };
const fail = (where, msg) => { report.failures.push(`${where}: ${msg}`); };
const inRange = (v, [lo, hi]) => v >= lo && v <= hi;
try {
  for (const area of AREAS) {
    const t0 = Date.now();
    let a;
    if (area === 'menu') a = await scene({ area: 'menu', sec: SEC, script: 'music', level: 0 });
    else {
      const r = await page.evaluate(([ar, s]) => window.__skate.renderAudio(ar, s), [area, SEC]);
      if (!r) { fail(area, 'renderAudio returned null'); continue; }
      writeFileSync(join(OUT, `${area}.wav`), b64ToBuf(r.wavBase64));
      a = wavToFloat(b64ToBuf(r.wavBase64));
      if (area === 'downtown') {
        // Same seed → same music: every note, time and parameter is identical. Chrome's renderer itself is not
        // bit-exact between runs (input summing order follows node addresses; ≈ 1e-7 per junction, then grown by the
        // master dynamics), so the check is: the difference signal stays below −70 dBFS peak and −90 dBFS RMS.
        // A real divergence (another seed, a moved or missing note) measures −20 dB or louder.
        const r2 = await page.evaluate(([ar, s]) => window.__skate.renderAudio(ar, s), [area, SEC]);
        const b = wavToFloat(b64ToBuf(r2.wavBase64));
        let mx = 0, ss = 0;
        for (let i = 0; i < a.L.length; i++) {
          const dl = a.L[i] - b.L[i], dr = a.R[i] - b.R[i];
          mx = Math.max(mx, Math.abs(dl), Math.abs(dr)); ss += dl * dl + dr * dr;
        }
        const diffRms = pdb(ss / (2 * a.L.length));
        report.deterministic = { identical: r2.wavBase64 === r.wavBase64, maxDiffDb: +db(mx).toFixed(1), diffRmsDb: +diffRms.toFixed(1) };
        if (db(mx) > -70 || diffRms > -90) fail(area, `two renders differ: peak ${db(mx).toFixed(1)} dBFS, rms ${diffRms.toFixed(1)} dBFS`);
      }
    }
    const music = area === 'menu' ? a : await scene({ area, sec: SEC, script: 'music' });
    const dry = await scene({ area, sec: SEC, script: 'music', stems: { vinyl: false }, ...(area === 'menu' ? { level: 0 } : {}) });
    if (area === 'menu') writeWav(join(OUT, 'menu.wav'), a); else writeWav(join(OUT, `${area}-music.wav`), music);
    spectrogram(join(OUT, `${area}.png`), a);
    const lv = levels(a), loud = integrated(a), sp = spectral(music), on = onsets(dry), bpm = tempo(on), sw = area === 'menu' ? { swingBeats: NaN } : swing(onsets(dry, 0.6, 5000), BPM[area]);
    const res = { ...lv, lufs: +loud.toFixed(2), bpm: +bpm.toFixed(2), expectBpm: BPM[area], ...sw, spectral: sp, renderMs: Date.now() - t0 };
    if (!(lv.peakDb < LIMITS.peakDb)) fail(area, `peak ${lv.peakDb} dBFS ≥ ${LIMITS.peakDb}`);
    if (!(lv.truePeakDb < LIMITS.truePeakDb)) fail(area, `true peak ${lv.truePeakDb} dBTP ≥ ${LIMITS.truePeakDb}`);
    if (!inRange(loud, LIMITS.lufs)) fail(area, `loudness ${loud.toFixed(1)} LUFS outside ${LIMITS.lufs}`);
    if (!inRange(lv.rmsDb, LIMITS.rmsDb)) fail(area, `RMS ${lv.rmsDb} dBFS outside ${LIMITS.rmsDb}`);
    if (!(lv.dc < LIMITS.dc)) fail(area, `DC offset ${lv.dc}`);
    if (lv.silenceSec > LIMITS.silenceSec) fail(area, `silence of ${lv.silenceSec} s`);
    if (lv.zeroRun > LIMITS.zeroRun) fail(area, `dropout: ${lv.zeroRun} zero samples in a row`);
    if (!(Math.abs(bpm - BPM[area]) <= LIMITS.bpmTol)) fail(area, `tempo ${bpm.toFixed(2)} BPM, expected ${BPM[area]}`);
    if (area !== 'menu' && !inRange(sw.swingBeats, LIMITS.swingBeats)) fail(area, `swing ${sw.swingBeats} beat outside ${LIMITS.swingBeats}`);
    if (!inRange(sp.tilt, LIMITS.tilt)) fail(area, `spectral tilt ${sp.tilt} dB/oct outside ${LIMITS.tilt}`);
    // The menu plays level 0 by design (EP, pad, muffled drums, no bass), so its low octaves are thin and the mids
    // sit above a full-band tilt line; it gets the menu allowance instead of the full-mix limit.
    const mudLimit = area === 'menu' ? LIMITS.mudMenuDb : LIMITS.mudDb;
    if (sp.mud > mudLimit) fail(area, `muddy: 250/500 Hz +${sp.mud} dB over the tilt line`);
    if (sp.harsh > LIMITS.harshDb) fail(area, `harsh: 2/4 kHz +${sp.harsh} dB over the tilt line`);
    if (sp.harshThird > LIMITS.harshThirdDb) fail(area, `2–5 kHz third-octave bump +${sp.harshThird} dB`);
    if (sp.air < LIMITS.airDb) fail(area, `dead top end: E(8k) − E(1k) = ${sp.air} dB`);
    report.areas[area] = res;
    console.log(`${area.padEnd(9)} peak ${lv.peakDb} dBFS (tp ${lv.truePeakDb})  ${loud.toFixed(1)} LUFS  rms ${lv.rmsDb}  bpm ${bpm.toFixed(2)}/${BPM[area]}  swing ${sw.swingBeats} (${sw.odd}/${sw.even} ${sw.oddFrac}/${sw.evenFrac})  tilt ${sp.tilt}  mud ${sp.mud}  harsh ${sp.harsh}/${sp.harshThird}  air ${sp.air}  sil ${lv.silenceSec}s  ${res.renderMs} ms`);
  }

  // SFX one-shots and the roll bed against the music (reference: Downtown).
  const ref = await scene({ area: 'downtown', sec: SEC, script: 'music' });
  const refShort = shortLoud(ref, 0.1, 0.025, 1);
  const refP90 = pct(refShort, 0.9), refInt = integrated(ref);
  const tour = await scene({ area: 'downtown', sec: 40, script: 'sfxTour' });
  writeWav(join(OUT, 'sfx-tour.wav'), tour);
  spectrogram(join(OUT, 'sfx-tour.png'), tour);
  const sfx = {};
  tour.marks.forEach((m, i) => {
    const next = tour.marks[i + 1]?.t ?? m.t + 1;
    const l = shortLoud(tour, 0.1, 0.01, m.t - 0.02, Math.min(next, m.t + 1.6));
    const mx = l.length ? Math.max(...l) : -Infinity;
    sfx[m.id] = +mx.toFixed(1);
    if (mx - refP90 > LIMITS.sfxOverMusicDb) fail('sfx', `${m.id} peaks at ${mx.toFixed(1)} LUFS(100 ms), above the music p90 ${refP90.toFixed(1)}`);
    const floor = m.id === 'hazardTick' ? LIMITS.hazardUnderMusicDb : LIMITS.sfxUnderMusicDb;
    if (m.id !== 'needle' && refP90 - mx > floor) fail('sfx', `${m.id} peaks at ${mx.toFixed(1)}, more than ${floor} dB under the music p90 ${refP90.toFixed(1)} (inaudible)`);
  });
  const bed = await scene({ area: 'downtown', sec: 8, script: 'roll' });
  const bedInt = integrated(bed, 1);
  if (refInt - bedInt < LIMITS.bedUnderMusicDb) fail('sfx', `roll + wind bed ${bedInt.toFixed(1)} LUFS is only ${(refInt - bedInt).toFixed(1)} dB under the music`);
  report.sfx = { musicP90: +refP90.toFixed(1), musicLufs: +refInt.toFixed(1), bedLufs: +bedInt.toFixed(1), oneShots: sfx };
  console.log(`sfx       music p90(100ms) ${refP90.toFixed(1)}  music ${refInt.toFixed(1)} LUFS  roll+wind ${bedInt.toFixed(1)} LUFS`);
  console.log('          ' + Object.entries(sfx).map(([k, v]) => `${k} ${v}`).join('  '));
  if (errors.length) fail('page', errors.join(' | '));
} finally {
  await browser.close();
  server?.kill();
}
report.limits = LIMITS;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
if (report.failures.length) { console.error(`\nrender-check: ${report.failures.length} failure(s)\n  ${report.failures.join('\n  ')}`); process.exit(1); }
console.log(`\nrender-check: ok (${Object.keys(report.areas).length} areas, deterministic: ${JSON.stringify(report.deterministic)}) → ${OUT}`);
