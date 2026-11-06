// world/render/textures/signs.ts: the 1024² sign atlas (TECH §8.4 "facade/sign atlas 1024²"), shared by the lit
// (painted) and the emissive (neon) materials through `auv`. Everything is invented (DESIGN §18.6): the brands of
// DECOR_BRANDS, the reviewed Japanese words of NEON_SIGN_WORDS (system CJK fonts; if a measureText / pixel check shows
// the glyphs are missing, geometric pictograms are drawn instead: never random kana), abstract holo glyphs made of
// invented strokes, vending fronts, billboards, posters, street-name plates and awning stripes.
// The layout (`SIGN_RECTS`) is computed without a canvas (pure, unit-tested); the draw callback paints it.
import { DECOR_BRANDS, NEON_SIGN_WORDS } from '../../../core/decor';
import type { AreaId } from '../../../core/ids';
import { Sfc32, hash32 } from '../../../core/rng';

export const SIGN_ATLAS = 1024;
const PAD = 2;
const JP_FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif';
const AREAS: readonly AreaId[] = ['downtown', 'suburbs', 'docks', 'neon'];

/** uv rect (three.js convention: v grows upward; the canvas texture is flipped). */
export interface SignRect { u0: number; v0: number; u1: number; v1: number; px: { x: number; y: number; w: number; h: number } }

interface Entry { key: string; w: number; h: number; draw: (c: CanvasRenderingContext2D, w: number, h: number) => void }

// ── entries ─────────────────────────────────────────────────────────────────────────────────────────────────────
const ENTRIES: Entry[] = [];
const add = (key: string, w: number, h: number, draw: Entry['draw']) => ENTRIES.push({ key, w, h, draw });

/** Brand looks: background, ink, font, motif. Index = DECOR_BRANDS[area] index. */
interface BrandStyle { bg: string; fg: string; font: string; motif: string; neon?: boolean }
const BRAND_STYLE: Readonly<Record<AreaId, readonly BrandStyle[]>> = {
  downtown: [
    { bg: '#c4473d', fg: '#f3e3c3', font: 'italic 900 {px}px Nunito, sans-serif', motif: 'none' },          // Marlo's Deli
    { bg: '#f3e3c3', fg: '#2b2140', font: '900 {px}px Nunito, sans-serif', motif: 'record' },               // Persimmon Records
    { bg: '#f4d58d', fg: '#6b3a24', font: 'bold {px}px Georgia, serif', motif: 'none' },                    // Butter & Crumb
    { bg: '#2b2140', fg: '#c9a15a', font: 'bold {px}px Georgia, serif', motif: 'stars' },                   // Hotel Amberlane
    { bg: '#3e8e8a', fg: '#fff4e3', font: '800 {px}px Nunito, sans-serif', motif: 'cup' },                  // Pressline Coffee
  ],
  suburbs: [
    { bg: '#b5645a', fg: '#fff4e3', font: '900 {px}px Nunito, sans-serif', motif: 'leaf' },                 // Mapleworth Hardware
    { bg: '#f4d58d', fg: '#c4473d', font: 'italic 900 {px}px Nunito, sans-serif', motif: 'sun' },           // Sunny Spoon Diner
    { bg: '#9ccfb3', fg: '#2b2140', font: '900 {px}px Nunito, sans-serif', motif: 'cone' },                 // Corner Scoops
    { bg: '#8fb8de', fg: '#fff4e3', font: '800 {px}px Nunito, sans-serif', motif: 'bubbles' },              // Suds & Socks Laundry
  ],
  docks: [
    { bg: '#b5552f', fg: '#f3e3c3', font: '900 {px}px Bungee, Nunito, sans-serif', motif: 'none' },         // Brindle Freight
    { bg: '#2f5d7c', fg: '#fff4e3', font: '900 {px}px Bungee, Nunito, sans-serif', motif: 'waves' },        // Saltwick Shipping
    { bg: '#d8ecf2', fg: '#2f5d7c', font: '900 {px}px Bungee, Nunito, sans-serif', motif: 'none' },         // Pier 9 Ice
    { bg: '#5e8c6a', fg: '#fff4e3', font: '900 {px}px Bungee, Nunito, sans-serif', motif: 'gull' },         // Gullhaven Containers
  ],
  neon: [
    { bg: '#161029', fg: '#ff3fa4', font: '900 {px}px Nunito, sans-serif', motif: 'star', neon: true },     // Hoshi Noodle
    { bg: '#161029', fg: '#3ff2ff', font: '900 {px}px Bungee, Nunito, sans-serif', motif: 'cloud', neon: true },   // Kumo Mart 24
    { bg: '#161029', fg: '#8a5cff', font: '900 {px}px Bungee, Nunito, sans-serif', motif: 'pixel', neon: true },   // Tetsu Arcade
    { bg: '#161029', fg: '#ffb7d0', font: '900 {px}px Nunito, sans-serif', motif: 'dots', neon: true },     // Mochi Mochi Café
    { bg: '#161029', fg: '#3ff2ff', font: '900 {px}px Nunito, sans-serif', motif: 'line', neon: true },     // Sora Line
  ],
};
const NEON_WORD_COLORS = ['#ff5a3c', '#ffd39a', '#ff3fa4', '#3ff2ff', '#ff3fa4', '#7ee0b5', '#ff5a3c', '#ffb7d0', '#8a5cff', '#7ee0b5'];

/** Fits `text` into w × h (one line), from the font template with {px}. */
function fitText(c: CanvasRenderingContext2D, text: string, font: string, w: number, h: number, maxFrac = 0.62): void {
  let px = Math.floor(h * maxFrac);
  for (; px > 6; px--) { c.font = font.replace('{px}', String(px)); if (c.measureText(text).width <= w) break; }
}

function motif(c: CanvasRenderingContext2D, m: string, x: number, y: number, r: number, fg: string): void {
  c.save(); c.fillStyle = fg; c.strokeStyle = fg; c.lineWidth = Math.max(1.5, r * 0.18);
  switch (m) {
    case 'record': c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); c.fillStyle = '#e8743b'; c.beginPath(); c.arc(x, y, r * 0.38, 0, 6.283); c.fill(); break;
    case 'stars': for (const dx of [-1.2, 0, 1.2]) star(c, x + dx * r, y, r * 0.42); break;
    case 'cup': c.fillRect(x - r * 0.6, y - r * 0.3, r * 1.2, r * 0.9); c.beginPath(); c.arc(x + r * 0.65, y + 0.1 * r, r * 0.3, -1.5, 1.5); c.stroke(); break;
    case 'leaf': c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r * 0.8, y); c.lineTo(x, y + r * 0.7); c.lineTo(x - r * 0.8, y); c.closePath(); c.fill(); break;
    case 'sun': c.beginPath(); c.arc(x, y, r * 0.5, 0, 6.283); c.fill(); for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke(); } break;
    case 'cone': c.beginPath(); c.moveTo(x - r * 0.5, y - r * 0.1); c.lineTo(x + r * 0.5, y - r * 0.1); c.lineTo(x, y + r); c.closePath(); c.fill(); c.beginPath(); c.arc(x, y - r * 0.3, r * 0.5, 0, 6.283); c.fill(); break;
    case 'bubbles': for (const [dx, dy, k] of [[-0.5, 0.2, 0.4], [0.3, -0.3, 0.5], [0.5, 0.5, 0.3]] as const) { c.beginPath(); c.arc(x + dx * r, y + dy * r, k * r, 0, 6.283); c.stroke(); } break;
    case 'waves': for (let k = 0; k < 2; k++) { c.beginPath(); for (let i = 0; i <= 8; i++) { const px = x - r + (i / 8) * 2 * r, py = y + (k - 0.5) * r * 0.6 + Math.sin(i * 1.6) * r * 0.15; if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.stroke(); } break;
    case 'gull': c.beginPath(); c.moveTo(x - r, y); c.quadraticCurveTo(x - r * 0.5, y - r * 0.6, x, y); c.quadraticCurveTo(x + r * 0.5, y - r * 0.6, x + r, y); c.stroke(); break;
    case 'star': star(c, x, y, r * 0.8); break;
    case 'cloud': for (const [dx, k] of [[-0.45, 0.42], [0.05, 0.55], [0.5, 0.38]] as const) { c.beginPath(); c.arc(x + dx * r, y, k * r, 0, 6.283); c.fill(); } break;
    case 'pixel': for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) c.fillRect(x - r + i * r * 0.66, y - r + j * r * 0.66, r * 0.55, r * 0.55); break;
    case 'dots': for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x - r * 0.6 + i * r * 0.6, y, r * 0.22, 0, 6.283); c.fill(); } break;
    case 'line': c.fillRect(x - r, y - r * 0.12, 2 * r, r * 0.24); c.beginPath(); c.arc(x + r, y, r * 0.25, 0, 6.283); c.fill(); break;
    default: break;
  }
  c.restore();
}
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k / 10) * 6.283, rr = k % 2 ? r * 0.45 : r; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (k) c.lineTo(px, py); else c.moveTo(px, py); }
  c.closePath(); c.fill();
}

/** A neon-tube look: a soft halo then the bright core. */
function neonText(c: CanvasRenderingContext2D, text: string, x: number, y: number, col: string): void {
  c.save();
  c.shadowColor = col; c.shadowBlur = 8; c.fillStyle = col; c.fillText(text, x, y);
  c.shadowBlur = 0; c.fillStyle = mixCss(col, '#ffffff', 0.55); c.fillText(text, x, y);
  c.restore();
}
function mixCss(a: string, b: string, u: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i]! - v) * u)).join(',')})`;
}

// Brand wide signs (shopfronts, end walls, awning boards), all areas.
for (const area of AREAS) {
  DECOR_BRANDS[area].forEach((name, i) => {
    const st = BRAND_STYLE[area][i]!;
    add(`b:${area}:${i}`, 200, 50, (c, w, h) => {
      c.fillStyle = st.bg; c.fillRect(0, 0, w, h);
      if (!st.neon) { c.strokeStyle = 'rgba(43,33,64,0.35)'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, w - 3, h - 3); }
      const hasMotif = st.motif !== 'none';
      const tx = hasMotif ? h * 0.95 : 8;
      fitText(c, name, st.font, w - tx - 8, h);
      c.textBaseline = 'middle'; c.textAlign = 'left';
      if (hasMotif) motif(c, st.motif, h * 0.5, h * 0.5, h * 0.3, st.fg);
      if (st.neon) neonText(c, name, tx, h * 0.54, st.fg);
      else { c.fillStyle = st.fg; c.fillText(name, tx, h * 0.54); }
    });
  });
}
// Blade signs (vertical): Downtown and Neon brands.
for (const area of ['downtown', 'neon'] as const) {
  DECOR_BRANDS[area].forEach((name, i) => {
    const st = BRAND_STYLE[area][i]!;
    add(`t:${area}:${i}`, 48, 192, (c, w, h) => {
      c.fillStyle = st.bg; c.fillRect(0, 0, w, h);
      const word = name.replace(/['&]/g, '').split(' ')[0]!.toUpperCase().slice(0, 7);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const step = (h - 34) / word.length;
      c.font = st.font.replace('{px}', String(Math.floor(Math.min(w * 0.62, step * 0.92))));
      for (let k = 0; k < word.length; k++) {
        const y = 14 + step * (k + 0.5);
        if (st.neon) neonText(c, word[k]!, w / 2, y, st.fg); else { c.fillStyle = st.fg; c.fillText(word[k]!, w / 2, y); }
      }
      motif(c, st.motif === 'none' ? 'dots' : st.motif, w / 2, h - 12, 8, st.fg);
    });
  });
}

// ── Japanese words (reviewed list) with the pictogram fallback ─────────────────────────────────────────────────
let jpSupport: boolean[] | null = null;
/** Per word: are its glyphs available? A missing glyph draws the same pixels as an unassigned codepoint (tofu or
 *  nothing) and has no ink of its own; checked once, at the first atlas draw. */
function jpSupported(i: number): boolean {
  if (!jpSupport) {
    jpSupport = NEON_SIGN_WORDS.map(() => true);
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 40;
      const x = cv.getContext('2d', { willReadFrequently: true });
      if (x) {
        const ink = (t: string) => {
          x.clearRect(0, 0, 40, 40); x.font = `28px ${JP_FONT}`; x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(t, 4, 20);
          return x.getImageData(0, 0, 40, 40).data;
        };
        const tofu = ink('͸');
        jpSupport = NEON_SIGN_WORDS.map((w) => glyphCheck([...w].filter((ch) => ch !== 'ー').map((ch) => ink(ch)), tofu,
          [...w].map((ch) => x.measureText(ch).width)));
      }
    } catch { /* no canvas: keep true (the draw callback never runs then) */ }
  }
  return jpSupport[i] ?? false;
}
/** Pure decision (unit-tested): every glyph has ink, differs from the tofu reference, and measures > 1 px. */
export function glyphCheck(glyphs: readonly ArrayLike<number>[], tofu: ArrayLike<number>, widths: readonly number[]): boolean {
  if (widths.some((w) => !(w > 1))) return false;
  for (const g of glyphs) {
    let ink = 0, same = true;
    for (let k = 3; k < g.length; k += 4) { if (g[k]! > 0) ink++; if (g[k] !== tofu[k]) same = false; }
    if (ink < 6 || same) return false;
  }
  return true;
}

/** Geometric pictograms for the ten words (index = NEON_SIGN_WORDS index), drawn in a square of side r·2. */
export function pictogram(c: CanvasRenderingContext2D, i: number, x: number, y: number, r: number, col: string): void {
  c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(2, r * 0.14); c.lineCap = 'round';
  const L = (a: number, b: number, cc: number, d: number) => { c.beginPath(); c.moveTo(x + a * r, y + b * r); c.lineTo(x + cc * r, y + d * r); c.stroke(); };
  switch (i) {
    case 0: c.beginPath(); c.arc(x, y, r * 0.7, 0, Math.PI); c.stroke(); L(-0.8, 0, 0.8, 0); L(-0.2, -0.3, -0.35, -0.8); L(0.2, -0.3, 0.05, -0.8); L(0.35, 0.05, 0.9, -0.6); break;   // ramen bowl
    case 1: c.strokeRect(x - r * 0.55, y - r * 0.4, r * 0.9, r * 0.9); c.beginPath(); c.arc(x + r * 0.45, y + r * 0.05, r * 0.25, -1.4, 1.4); c.stroke(); L(-0.3, -0.6, -0.2, -0.9); L(0, -0.6, 0.1, -0.9); break;   // cup
    case 2: c.beginPath(); c.arc(x, y - r * 0.45, r * 0.32, 0, 6.283); c.fill(); L(0, -0.1, 0, 0.8); L(-0.4, 0.8, 0.4, 0.8); break;   // microphone
    case 3: L(0, -0.6, 0, 0.7); c.beginPath(); c.moveTo(x, y - 0.6 * r); c.lineTo(x - 0.85 * r, y - 0.75 * r); c.lineTo(x - 0.85 * r, y + 0.55 * r); c.lineTo(x, y + 0.7 * r); c.lineTo(x + 0.85 * r, y + 0.55 * r); c.lineTo(x + 0.85 * r, y - 0.75 * r); c.closePath(); c.stroke(); break;   // book
    case 4: c.beginPath(); c.arc(x, y, r * 0.75, 0, 6.283); c.stroke(); c.beginPath(); c.arc(x, y, r * 0.28, 0, 6.283); c.fill(); break;   // open: a lit dot in a ring
    case 5: c.save(); c.translate(x, y); c.rotate(-0.7); c.beginPath(); c.arc(-r * 0.55, 0, r * 0.35, Math.PI / 2, Math.PI * 1.5); c.lineTo(r * 0.55, -r * 0.35); c.arc(r * 0.55, 0, r * 0.35, -Math.PI / 2, Math.PI / 2); c.closePath(); c.stroke(); c.fillRect(0, -r * 0.35, r * 0.55, r * 0.7); c.restore(); break;   // capsule
    case 6: c.beginPath(); c.ellipse(x, y + r * 0.2, r * 0.85, r * 0.38, 0, 0, 6.283); c.stroke(); c.beginPath(); c.ellipse(x, y - r * 0.15, r * 0.75, r * 0.3, 0, Math.PI, 6.283); c.fill(); break;   // nigiri
    case 7: for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.283 - Math.PI / 2; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.45, y - r * 0.15 + Math.sin(a) * r * 0.45, r * 0.3, 0, 6.283); c.fill(); } L(0, 0.3, 0, 0.9); break;   // flower
    case 8: c.beginPath(); c.arc(x - r * 0.5, y + r * 0.3, r * 0.38, 0, 6.283); c.stroke(); c.beginPath(); c.arc(x + r * 0.5, y + r * 0.3, r * 0.38, 0, 6.283); c.stroke(); L(-0.5, 0.3, -0.1, -0.3); L(-0.1, -0.3, 0.5, 0.3); L(-0.1, -0.3, 0.35, -0.3); break;   // bicycle
    case 9: c.strokeRect(x - r * 0.75, y - r * 0.8, r * 0.8, r * 1.6); L(-0.2, 0, 0.85, 0); L(0.55, -0.3, 0.85, 0); L(0.55, 0.3, 0.85, 0); break;   // exit
    default: break;
  }
  c.restore();
}

NEON_SIGN_WORDS.forEach((word, i) => {
  const col = NEON_WORD_COLORS[i % NEON_WORD_COLORS.length]!;
  add(`w:${i}`, 200, 50, (c, w, h) => {
    c.fillStyle = '#161029'; c.fillRect(0, 0, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (jpSupported(i)) { fitText(c, word, `900 {px}px ${JP_FONT}`, w - 24, h, 0.7); neonText(c, word, w / 2, h * 0.53, col); }
    else pictogram(c, i, w / 2, h / 2, h * 0.38, col);
  });
  add(`wt:${i}`, 48, 192, (c, w, h) => {
    c.fillStyle = '#161029'; c.fillRect(0, 0, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (jpSupported(i)) {
      const chars = [...word];
      const step = Math.min(44, (h - 16) / chars.length);
      c.font = `900 ${Math.floor(Math.min(w * 0.72, step * 0.9))}px ${JP_FONT}`;
      chars.forEach((ch, k) => {
        const y = h / 2 + (k - (chars.length - 1) / 2) * step;
        if (ch === 'ー') { c.save(); c.fillStyle = col; c.fillRect(w / 2 - 2, y - step * 0.3, 4, step * 0.6); c.restore(); }   // vertical chōonpu
        else neonText(c, ch, w / 2, y, col);
      });
    } else pictogram(c, i, w / 2, h / 2, w * 0.36, col);
  });
});

// Billboards (painted, invented ads) for Downtown, Suburbs, Docks.
for (const area of ['downtown', 'suburbs', 'docks'] as const) {
  for (let k = 0; k < 2; k++) {
    add(`bb:${area}:${k}`, 192, 96, (c, w, h) => {
      const i = (k * 2 + (area === 'docks' ? 1 : 0)) % DECOR_BRANDS[area].length;
      const st = BRAND_STYLE[area][i]!;
      const r = new Sfc32(hash32(0xb1, k, area.length));
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#8e7cc3'); sky.addColorStop(0.6, '#f2a37b'); sky.addColorStop(1, '#ffd9a0');
      c.fillStyle = k ? st.bg : sky; c.fillRect(0, 0, w, h);
      c.fillStyle = k ? 'rgba(255,244,227,0.25)' : '#fff1c9';
      c.beginPath(); c.arc(w * 0.75, h * 0.45, h * 0.28, 0, 6.283); c.fill();
      for (let s = 0; s < 6; s++) { c.fillStyle = `rgba(43,33,64,${0.15 + 0.1 * r.next()})`; c.fillRect(r.range(0, w * 0.6), h * 0.62, r.range(8, 20), -r.range(10, 34)); }
      c.fillStyle = 'rgba(43,33,64,0.85)'; c.fillRect(0, h * 0.68, w, h * 0.32);
      fitText(c, DECOR_BRANDS[area][i]!, st.font, w - 16, h * 0.32, 0.8);
      c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#fff4e3';
      c.fillText(DECOR_BRANDS[area][i]!, 8, h * 0.84);
      c.strokeStyle = '#2b2140'; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4);
    });
  }
}

/** Holo glyphs: invented abstract strokes on a 3 × 3 point lattice (never real characters, DESIGN §18.6). */
export function holoGlyph(c: CanvasRenderingContext2D, r: Sfc32, x: number, y: number, s: number): void {
  const P = (k: number): [number, number] => [x + (k % 3) * s / 2, y + Math.floor(k / 3) * s / 2];
  const strokes = 2 + r.int(0, 2);
  c.beginPath();
  for (let i = 0; i < strokes; i++) {
    const a = P(r.int(0, 8)), b = P(r.int(0, 8));
    c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
  }
  c.stroke();
  if (r.chance(0.4)) { const p = P(r.int(0, 8)); c.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3); }
}
for (let k = 0; k < 4; k++) {
  add(`holo:${k}`, 192, 96, (c, w, h) => {
    const r = new Sfc32(hash32(0x401, k));
    const hue = ['#3ff2ff', '#ff3fa4', '#8a5cff', '#7ee0b5'][k]!;
    c.fillStyle = 'rgba(20,16,48,0.55)'; c.fillRect(0, 0, w, h);
    c.strokeStyle = hue; c.fillStyle = hue; c.lineWidth = 2; c.lineCap = 'round';
    for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 7; gx++) if (r.chance(0.8)) holoGlyph(c, r, 10 + gx * 25, 10 + gy * 28, 14);
    c.globalAlpha = 0.9; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6);
    c.globalAlpha = 1;
    const brand = DECOR_BRANDS.neon[k % DECOR_BRANDS.neon.length]!;
    fitText(c, brand, '900 {px}px Nunito, sans-serif', w - 20, 26, 0.9);
    c.textAlign = 'right'; c.textBaseline = 'bottom'; neonText(c, brand, w - 10, h - 6, '#fff4e3');
  });
}

// Vending fronts (lit): rows of product blocks, a selection strip and a coin slot.
for (let k = 0; k < 4; k++) {
  add(`vend:${k}`, 64, 128, (c, w, h) => {
    const r = new Sfc32(hash32(0x7e9d, k));
    const panel = ['#e9f4ff', '#fff0f6', '#f2fff6', '#fff8e8'][k]!;
    c.fillStyle = panel; c.fillRect(0, 0, w, h);
    const cols = ['#ff5a3c', '#3ff2ff', '#ffd39a', '#ff3fa4', '#7ee0b5', '#8a5cff', '#f2b630'];
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 4; i++) { c.fillStyle = cols[r.int(0, cols.length - 1)]!; c.fillRect(5 + i * 14, 8 + row * 18, 10, 13); }
      c.fillStyle = '#c9c2b8'; c.fillRect(3, 22 + row * 18, w - 6, 2);
    }
    c.fillStyle = '#2b2140'; c.fillRect(4, 84, w - 8, 10);
    for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#3ff2ff' : '#ff3fa4'; c.fillRect(7 + i * 9, 87, 5, 4); }
    c.fillStyle = '#3a3058'; c.fillRect(8, 100, w - 16, 20);
  });
}
// Posters / menu boards (painted) and street-name plates (invented).
for (let k = 0; k < 4; k++) {
  add(`poster:${k}`, 48, 72, (c, w, h) => {
    const bg = ['#ff8a5b', '#a88beb', '#7ee0b5', '#ffc94a'][k]!;
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2b2140'; c.beginPath(); c.arc(w / 2, h * 0.38, w * 0.26, 0, 6.283); c.fill();
    c.fillStyle = '#fff4e3'; c.fillRect(6, h * 0.72, w - 12, 5); c.fillRect(6, h * 0.84, w * 0.6, 4);
  });
}
const STREETS = ['DUSK AVE', 'AMBER ST', 'MAPLE ROW', 'QUAY RD', 'LANTERN LN', 'PIER 9'];
STREETS.forEach((name, k) => {
  add(`street:${k}`, 112, 28, (c, w, h) => {
    c.fillStyle = '#3e8e8a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#fff4e3'; c.lineWidth = 2; c.strokeRect(2, 2, w - 4, h - 4);
    fitText(c, name, '900 {px}px Nunito, sans-serif', w - 12, h, 0.66);
    c.fillStyle = '#fff4e3'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, w / 2, h * 0.55);
  });
});
// Awning stripes (alpha mask: white stripes over the vertex colour) and a scalloped valance.
add('stripe', 64, 32, (c, w, h) => {
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,244,227,1)';
  for (let i = 0; i < 4; i++) c.fillRect(i * 16, 0, 8, h);
});
add('picto:bus', 32, 32, (c, w, h) => { c.fillStyle = '#fff4e3'; c.fillRect(0, 0, w, h); c.fillStyle = '#3e8e8a'; c.fillRect(5, 7, 22, 14); c.fillStyle = '#fff4e3'; c.fillRect(8, 10, 7, 5); c.fillRect(17, 10, 7, 5); c.fillStyle = '#2b2140'; c.fillRect(8, 21, 4, 4); c.fillRect(20, 21, 4, 4); });
add('picto:round', 32, 32, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#c4473d'; c.beginPath(); c.arc(16, 16, 15, 0, 6.283); c.fill(); c.fillStyle = '#fff4e3'; c.fillRect(6, 13, 20, 6); });
add('picto:arrow', 32, 32, (c, w, h) => { c.fillStyle = '#3e6ea8'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff4e3'; c.beginPath(); c.moveTo(6, 13); c.lineTo(18, 13); c.lineTo(18, 7); c.lineTo(27, 16); c.lineTo(18, 25); c.lineTo(18, 19); c.lineTo(6, 19); c.closePath(); c.fill(); });

// ── packing ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Shelf packer: entries sorted by height (then key) are placed left to right, a new shelf when a row is full. */
function pack(list: readonly Entry[]): Map<string, SignRect> {
  const sorted = [...list].sort((a, b) => b.h - a.h || b.w - a.w || (a.key < b.key ? -1 : 1));
  const out = new Map<string, SignRect>();
  let x = 0, y = 0, rowH = 0;
  for (const e of sorted) {
    const w = e.w + 2 * PAD, h = e.h + 2 * PAD;
    if (x + w > SIGN_ATLAS) { x = 0; y += rowH; rowH = 0; }
    if (y + h > SIGN_ATLAS) throw new Error(`sign atlas overflow at ${e.key}`);
    const px = { x: x + PAD, y: y + PAD, w: e.w, h: e.h };
    out.set(e.key, { u0: px.x / SIGN_ATLAS, u1: (px.x + px.w) / SIGN_ATLAS, v1: 1 - px.y / SIGN_ATLAS, v0: 1 - (px.y + px.h) / SIGN_ATLAS, px });
    x += w; rowH = Math.max(rowH, h);
  }
  return out;
}
export const SIGN_RECTS: ReadonlyMap<string, SignRect> = pack(ENTRIES);
export const SIGN_KEYS: readonly string[] = ENTRIES.map((e) => e.key);

/** The rect of a sign key (falls back to the first brand of the area). */
export function signRect(key: string): SignRect {
  return SIGN_RECTS.get(key) ?? SIGN_RECTS.get('b:downtown:0')!;
}

/** Draws the atlas (the canvasTexture callback). */
export function drawSignAtlas(c: CanvasRenderingContext2D): void {
  c.clearRect(0, 0, SIGN_ATLAS, SIGN_ATLAS);
  for (const e of ENTRIES) {
    const r = SIGN_RECTS.get(e.key)!;
    c.save();
    c.beginPath(); c.rect(r.px.x, r.px.y, r.px.w, r.px.h); c.clip();
    c.translate(r.px.x, r.px.y);
    e.draw(c, e.w, e.h);
    c.restore();
  }
}
