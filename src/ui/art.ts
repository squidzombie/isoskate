// ui/art.ts: procedural card art for the Locker, Shop, crate reveal and Stats (DESIGN §15, §16; no image assets).
//   Boards: SK's drawBoardThumb (the real deck graphic). Skaters: a chunky flat bust from the SkaterLook (skin, hair,
//   top colours and print, accessory). Helmets: the shell shape, colour, decal and finish from the HelmetLook.
//   Postcards: a small sunset scene per area (Neon is a glowing silhouette until reached).
// Drawn lazily into a canvas and cached as a data URL per item, so a card is an <img> (cheap to clone, no redraws).
import type { AreaId } from '../core/ids';
import type { BoardLook, CosmeticItem, HelmetLook, SkaterLook } from '../core/cosmetics';
import { SKIN_TONES } from '../core/cosmetics';
import { drawBoardThumb, ITEM_GRAPHIC } from '../skater';

type C = CanvasRenderingContext2D;
const INK = '#1b1d3f';   // BRAND §4: space-indigo ink
const hex = (n: number, a = 1) => {
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};
const shade = (n: number, f: number) => {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
  return (ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255);
};
export const ART_PX = 168;

/** Rounded-rect path (CanvasRenderingContext2D.roundRect is Safari 16+; the runtime minimum is 15.4). */
function rr(c: C, x: number, y: number, w: number, hh: number, r: number): void {
  const q = Math.min(r, w / 2, hh / 2);
  c.moveTo(x + q, y); c.arcTo(x + w, y, x + w, y + hh, q); c.arcTo(x + w, y + hh, x, y + hh, q);
  c.arcTo(x, y + hh, x, y, q); c.arcTo(x, y, x + w, y, q); c.closePath();
}

const cache = new Map<string, string>();
function paint(key: string, w: number, hgt: number, f: (c: C) => void): string {
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = hgt;
  // willReadFrequently: a CPU-backed canvas, so toDataURL never waits on the GPU (an accelerated 2D canvas reads back
  // through the GPU queue, behind the world's frames: seconds on a slow GPU at the Results screen).
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (!c) return '';
  try { f(c); } catch { /* a broken look draws an empty card rather than breaking the screen */ }
  const url = cv.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** Data URL of the item's card art (square, ART_PX). */
export function itemArt(it: CosmeticItem): string {
  return paint(`item:${it.id}`, ART_PX, ART_PX, (c) => {
    if (it.slot === 'board') drawBoardThumb(c, it.look as BoardLook, 10, 6, ART_PX - 20, ART_PX - 12);
    else if (it.slot === 'skater') drawSkater(c, it.look as SkaterLook, ART_PX);
    else drawHelmet(c, it.look as HelmetLook, ART_PX);
  });
}

function blob(c: C, fill: string, path: () => void, lw = 5): void {
  c.beginPath(); path(); c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
}

function drawSkater(c: C, l: SkaterLook, S: number): void {
  const robot = l.kind === 'robot';
  const skin = robot ? 0xb8bcc8 : SKIN_TONES[l.skin] ?? 0xd9a27e;
  const [c1, c2] = l.topColors;
  const cx = S / 2;
  const wide = l.build === 'stocky' ? 1.1 : l.build === 'slim' ? 0.9 : 1;
  // Backpack straps peek behind the shoulders.
  if (l.accessory === 'backpack') blob(c, hex(l.accessoryColor ?? ITEM_GRAPHIC.accessory), () => rr(c, cx - 52 * wide, 112, 104 * wide, 60, 18));
  // Hood behind the head.
  if (l.top === 'hoodie') blob(c, hex(shade(c1, -0.12)), () => c.ellipse(cx, 104, 40, 26, 0, 0, Math.PI * 2));
  // Torso.
  blob(c, hex(c1), () => {
    const w = 58 * wide;
    c.moveTo(cx - w, S + 4); c.lineTo(cx - w, 140); c.quadraticCurveTo(cx - w, 112, cx - 22, 108);
    c.lineTo(cx + 22, 108); c.quadraticCurveTo(cx + w, 112, cx + w, 140); c.lineTo(cx + w, S + 4); c.closePath();
  });
  c.save(); c.beginPath(); c.rect(0, 108, S, S); c.clip();
  const w = 58 * wide;
  if (l.top === 'varsity' || l.top === 'trackJacket') { c.fillStyle = hex(c2); c.fillRect(cx - w, 108, 16, S); c.fillRect(cx + w - 16, 108, 16, S); }
  if (l.top === 'overalls' || l.top === 'coveralls') { c.fillStyle = hex(c2); c.fillRect(cx - 24, 108, 48, 18); }
  if (l.top === 'overalls') { c.fillStyle = hex(shade(c1, -0.2)); c.fillRect(cx - 30, 108, 9, S); c.fillRect(cx + 21, 108, 9, S); }
  if (l.top === 'coveralls' || l.top === 'jacket' || l.top === 'courierJacket') { c.strokeStyle = hex(shade(c1, -0.35)); c.lineWidth = 3; c.beginPath(); c.moveTo(cx, 116); c.lineTo(cx, S); c.stroke(); }
  if (l.top === 'cardigan') { c.fillStyle = hex(c2); c.beginPath(); c.moveTo(cx - 18, 108); c.lineTo(cx, 140); c.lineTo(cx + 18, 108); c.fill();
    c.fillStyle = INK; for (const y of [146, 158]) { c.beginPath(); c.arc(cx + 3, y, 2.6, 0, 7); c.fill(); } }
  if (l.top === 'raincoat') { c.fillStyle = hex(c2); c.beginPath(); c.moveTo(cx - 40, 108); c.lineTo(cx, 128); c.lineTo(cx + 40, 108); c.fill(); }
  if (l.top === 'robot') { c.fillStyle = hex(c2); c.fillRect(cx - 22, 128, 44, 26); c.fillStyle = '#3ff2ff'; c.fillRect(cx - 14, 136, 8, 8); c.fillRect(cx + 6, 136, 8, 8); }
  const pc = l.printColors?.map((x) => hex(x));
  switch (l.print) {
    case 'stripe': c.fillStyle = hex(c2); c.fillRect(cx - w, 140, w * 2, 12); break;
    case 'sunsetStripe': { const g = c.createLinearGradient(0, 138, 0, 162); ITEM_GRAPHIC.sunsetStripe.forEach((x, i) => g.addColorStop(i / 2, hex(x)));
      c.fillStyle = g; c.fillRect(cx - w, 138, w * 2, 22); break; }
    case 'pocket': c.fillStyle = hex(shade(c1, -0.18)); c.fillRect(cx + 10, 132, 20, 18); break;
    case 'chestLogo': c.fillStyle = hex(c2); c.beginPath(); c.arc(cx, 142, 13, 0, 7); c.fill(); break;
    case 'crestRD': c.fillStyle = hex(c2); c.font = '900 22px Nunito, sans-serif'; c.textAlign = 'center'; c.fillText('RD', cx - 22, 150); break;
    case 'paintDots': for (let i = 0; i < 11; i++) { c.fillStyle = pc?.[i % (pc.length || 1)] ?? hex(ITEM_GRAPHIC.paintDots[i % 3]!);
      c.beginPath(); c.arc(cx - 44 + ((i * 37) % 88), 124 + ((i * 23) % 40), 4, 0, 7); c.fill(); } break;
    default: break;
  }
  c.restore();
  // Neck + head.
  blob(c, hex(shade(skin, -0.08)), () => rr(c, cx - 12, 92, 24, 22, 6), 4);
  if (robot) blob(c, hex(skin), () => rr(c, cx - 34, 30, 68, 68, 22));
  else blob(c, hex(skin), () => c.ellipse(cx, 66, 32, 36, 0, 0, Math.PI * 2));
  drawHair(c, l, cx);
  // Face.
  if (robot) {
    blob(c, '#1e2350', () => rr(c, cx - 24, 46, 48, 32, 10), 3);
    c.fillStyle = '#3ff2ff'; c.fillRect(cx - 14, 56, 7, 9); c.fillRect(cx + 7, 56, 7, 9);
    c.strokeStyle = '#3ff2ff'; c.lineWidth = 3; c.beginPath(); c.arc(cx, 66, 8, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
  } else {
    c.fillStyle = INK;
    for (const dx of [-11, 11]) { c.beginPath(); c.ellipse(cx + dx, 68, 3.4, 4.4, 0, 0, 7); c.fill(); }
    c.strokeStyle = INK; c.lineWidth = 3; c.lineCap = 'round';
    if (l.facialHair === 'moustache') { c.fillStyle = hex(l.hairColor); c.beginPath(); c.ellipse(cx, 81, 12, 4.5, 0, 0, 7); c.fill(); c.stroke(); }
    else { c.beginPath(); c.arc(cx, 77, 7, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    c.fillStyle = 'rgba(255,120,110,0.35)';
    for (const dx of [-20, 20]) { c.beginPath(); c.ellipse(cx + dx, 78, 6, 4, 0, 0, 7); c.fill(); }
  }
  // Accessories on the head.
  if (l.accessory === 'headphones') {
    c.strokeStyle = INK; c.lineWidth = 9; c.beginPath(); c.arc(cx, 64, 38, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    c.strokeStyle = hex(l.accessoryColor ?? ITEM_GRAPHIC.accessory); c.lineWidth = 5; c.stroke();
    for (const dx of [-36, 36]) blob(c, hex(l.accessoryColor ?? ITEM_GRAPHIC.accessory), () => rr(c, cx + dx - 9, 56, 18, 26, 7), 4);
  }
  if (l.accessory === 'beanie') blob(c, hex(l.accessoryColor ?? 0x2f5d7c), () => { c.moveTo(cx - 34, 52); c.quadraticCurveTo(cx, 6, cx + 34, 52); c.closePath(); });
  if (l.accessory === 'antenna') { c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.moveTo(cx, 30); c.lineTo(cx + 8, 10); c.stroke();
    blob(c, hex(l.accessoryColor ?? ITEM_GRAPHIC.accessory), () => c.arc(cx + 8, 10, 6, 0, 7), 3); }
}

function drawHair(c: C, l: SkaterLook, cx: number): void {
  const col = hex(l.hairColor);
  const cap = (top: number, side: number, low: number) => blob(c, col, () => {
    c.moveTo(cx - side, low); c.quadraticCurveTo(cx - side - 2, top, cx, top); c.quadraticCurveTo(cx + side + 2, top, cx + side, low);
    c.quadraticCurveTo(cx, low - 14, cx - side, low); c.closePath();
  }, 4);
  switch (l.hair) {
    case 'bob': blob(c, col, () => { c.moveTo(cx - 38, 90); c.quadraticCurveTo(cx - 44, 22, cx, 26); c.quadraticCurveTo(cx + 44, 22, cx + 38, 90);
      c.lineTo(cx + 26, 90); c.quadraticCurveTo(cx + 26, 52, cx, 50); c.quadraticCurveTo(cx - 26, 52, cx - 26, 90); c.closePath(); }, 4); break;
    case 'longStraight': blob(c, col, () => { c.moveTo(cx - 36, 118); c.quadraticCurveTo(cx - 46, 22, cx, 26); c.quadraticCurveTo(cx + 46, 22, cx + 36, 118);
      c.lineTo(cx + 26, 118); c.quadraticCurveTo(cx + 28, 50, cx, 48); c.quadraticCurveTo(cx - 28, 50, cx - 26, 118); c.closePath(); }, 4); break;
    case 'curlyMop': for (let i = 0; i < 9; i++) { const a = Math.PI * (1.05 + i * 0.11); blob(c, col, () => c.arc(cx + Math.cos(a) * 30, 60 + Math.sin(a) * 32, 13, 0, 7), 3); } break;
    case 'afroPuff': blob(c, col, () => c.arc(cx, 26, 24, 0, 7), 4); cap(30, 33, 56); break;
    case 'buzz': cap(31, 32, 54); break;
    case 'twinBuns': for (const dx of [-30, 30]) blob(c, col, () => c.arc(cx + dx, 30, 13, 0, 7), 4); cap(30, 33, 56); break;
    case 'topBun': blob(c, col, () => c.arc(cx, 22, 14, 0, 7), 4); cap(30, 33, 56); break;
    case 'ponytail': blob(c, col, () => c.ellipse(cx + 38, 72, 9, 22, 0.3, 0, 7), 4); cap(30, 33, 58); break;
    case 'spikes': blob(c, col, () => { c.moveTo(cx - 34, 58); for (let i = 0; i <= 6; i++) { c.lineTo(cx - 34 + i * 11.3, i % 2 ? 40 : 16); } c.lineTo(cx + 34, 58); c.closePath(); }, 4);
      if (l.hairTip !== undefined) { c.fillStyle = hex(l.hairTip); for (let i = 1; i <= 5; i += 2) { c.beginPath(); c.arc(cx - 34 + i * 11.3, 20, 4, 0, 7); c.fill(); } } break;
    case 'shortGrey': cap(32, 33, 52); break;
    case 'mohawk': blob(c, col, () => rr(c, cx - 7, 10, 14, 40, 6), 4); break;
    default: break;
  }
}

function drawHelmet(c: C, l: HelmetLook, S: number): void {
  const cx = S / 2, cy = S * 0.58, R = S * 0.36;
  const col = l.shell === 'bubble' ? hex(l.color, 0.45) : hex(l.color);
  const dome = () => { c.moveTo(cx - R, cy); c.arc(cx, cy, R, Math.PI, 0); c.quadraticCurveTo(cx + R, cy + 14, cx + R - 6, cy + 14); c.lineTo(cx - R + 6, cy + 14); c.quadraticCurveTo(cx - R, cy + 14, cx - R, cy); c.closePath(); };
  if (l.finish === 'emissive') { c.shadowColor = hex(l.decalColor, 0.9); c.shadowBlur = 18; }
  if (l.shell === 'catEars') for (const s of [-1, 1]) blob(c, col, () => { c.moveTo(cx + s * R * 0.25, cy - R * 0.85); c.lineTo(cx + s * R * 0.95, cy - R * 1.25); c.lineTo(cx + s * R * 0.85, cy - R * 0.35); c.closePath(); });
  if (l.shell === 'petalRing') for (let i = 0; i < 9; i++) { const a = Math.PI * (1 + i / 8); blob(c, hex(l.decalColor), () => c.ellipse(cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12, 12, 20, a + Math.PI / 2, 0, 7), 3); }
  if (l.shell === 'bucket') blob(c, hex(shade(l.color, -0.12)), () => c.ellipse(cx, cy + 12, R * 1.32, 16, 0, 0, 7));
  if (l.shell === 'hardHat') blob(c, hex(shade(l.color, -0.1)), () => c.ellipse(cx, cy + 12, R * 1.25, 12, 0, 0, 7));
  if (l.shell === 'lantern') blob(c, col, () => c.ellipse(cx, cy - 6, R * 0.95, R * 1.08, 0, 0, 7));
  else if (l.shell === 'bubble') blob(c, col, () => c.arc(cx, cy - 8, R * 1.05, 0, 7));
  else if (l.shell === 'retro') blob(c, col, () => { c.moveTo(cx - R, cy + 18); c.arc(cx, cy, R, Math.PI, 0); c.lineTo(cx + R, cy + 18); c.quadraticCurveTo(cx + R * 0.7, cy + 24, cx + R * 0.55, cy + 10); c.lineTo(cx - R * 0.55, cy + 10); c.quadraticCurveTo(cx - R * 0.7, cy + 24, cx - R, cy + 18); c.closePath(); });
  else blob(c, col, dome);
  c.shadowBlur = 0;
  // Decal, clipped to the shell.
  c.save();
  c.beginPath();
  if (l.shell === 'lantern') c.ellipse(cx, cy - 6, R * 0.95, R * 1.08, 0, 0, 7);
  else if (l.shell === 'bubble') c.arc(cx, cy - 8, R * 1.05, 0, 7);
  else c.arc(cx, cy, R - 2, Math.PI, 0);
  c.clip();
  const dc = hex(l.decalColor);
  switch (l.decal) {
    case 'stripe': c.fillStyle = dc; c.fillRect(cx - 9, cy - R, 18, R + 16); break;
    case 'stickers': { const cols = [...ITEM_GRAPHIC.stickers, l.decalColor].map((x) => hex(x));
      for (let i = 0; i < 9; i++) { c.fillStyle = cols[i % cols.length]!; c.save(); c.translate(cx - R + 14 + ((i * 41) % (R * 1.7)), cy - R + 16 + ((i * 29) % (R * 0.9))); c.rotate(i);
        if (i % 3 === 0) c.fillRect(-7, -7, 14, 14); else { c.beginPath(); c.arc(0, 0, 7, 0, 7); c.fill(); } c.restore(); } break; }
    case 'scuffs': c.strokeStyle = hex(l.decalColor, 0.5); c.lineWidth = 2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(cx - 30 + i * 12, cy - 30 + (i % 3) * 9); c.lineTo(cx - 20 + i * 12, cy - 24 + (i % 3) * 9); c.stroke(); } break;
    case 'plaid': c.fillStyle = hex(l.decalColor, 0.45); for (let i = -4; i <= 4; i++) { c.fillRect(cx + i * 16 - 4, cy - R, 8, R + 20); c.fillRect(cx - R, cy - R + 8 + (i + 4) * 14, R * 2, 6); } break;
    case 'innerEars': break;
    case 'ribs': c.strokeStyle = dc; c.lineWidth = 3; for (let i = -3; i <= 3; i++) { c.beginPath(); c.ellipse(cx, cy - 6, Math.abs(i) * R * 0.3 + 2, R * 1.08, 0, 0, 7); c.stroke(); } break;
    case 'fish': for (const [dx, dy, s] of [[-18, -14, 1], [16, 6, -1]] as const) { c.fillStyle = dc; c.beginPath(); c.ellipse(cx + dx, cy + dy, 11, 7, 0, 0, 7); c.fill();
      c.beginPath(); c.moveTo(cx + dx - s * 10, cy + dy); c.lineTo(cx + dx - s * 18, cy + dy - 7); c.lineTo(cx + dx - s * 18, cy + dy + 7); c.fill(); } break;
    case 'glyphScroll': c.fillStyle = dc; for (let i = 0; i < 7; i++) c.fillRect(cx - R + 10 + i * 15, cy - 10, 9, i % 2 ? 6 : 10); break;
    default: break;
  }
  c.restore();
  if (l.shell === 'catEars') { c.fillStyle = dc; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * R * 0.38, cy - R * 0.85); c.lineTo(cx + s * R * 0.86, cy - R * 1.1); c.lineTo(cx + s * R * 0.78, cy - R * 0.55); c.closePath(); c.fill(); } }
  if (l.shell === 'visor' || l.shell === 'wrapVisor') blob(c, hex(l.visorTint ?? 0x8a5cff, 0.85), () => rr(c, cx - R * (l.shell === 'wrapVisor' ? 1 : 0.8), cy - 16, R * (l.shell === 'wrapVisor' ? 2 : 1.6), 22, 10), 4);
  if (l.shell === 'wrapVisor') { c.fillStyle = hex(l.decalColor); for (let i = 0; i < 6; i++) c.fillRect(cx - R + 12 + i * 16, cy - 8, 8, 6); }
  if (l.shell === 'dome' && l.decal === 'none') { c.fillStyle = INK; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(cx - 30 + i * 20, cy - R * 0.55 + Math.abs(i - 1.5) * 6, 4, 9, 0, 0, 7); c.fill(); } }
  if (l.finish === 'gloss' || l.finish === 'chrome' || l.shell === 'bubble') { c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(cx - R * 0.42, cy - R * 0.55, R * 0.18, R * 0.1, -0.6, 0, 7); c.fill(); }
  if (l.shell === 'bubble') { c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy - R * 1.1); c.lineTo(cx + 6, cy - R * 1.4); c.stroke(); }
}

const AREA_SCENE: Readonly<Record<AreaId, { sky: [string, string, string]; ground: string; sun: string }>> = {
  downtown: { sky: ['#ffd39a', '#ffb07a', '#ff967a'], ground: '#7a4e8c', sun: '#fff1b8' },
  suburbs: { sky: ['#ffe3c4', '#ffb7a0', '#d08ab8'], ground: '#5e8c6a', sun: '#fffdf6' },
  docks: { sky: ['#f6a77a', '#b5645a', '#5a3b6e'], ground: '#2f4a5e', sun: '#ffc48a' },
  neon: { sky: ['#5a4e9c', '#2b2b6e', '#1e2350'], ground: '#1a1838', sun: '#ff6ec0' },
};

/** A small area postcard (DESIGN §14.3). `got = false` draws the locked version (Neon: a glowing silhouette). */
export function postcardArt(area: AreaId, got: boolean): string {
  return paint(`pc:${area}:${got ? 1 : 0}`, 240, 150, (c) => {
    const s = AREA_SCENE[area];
    const g = c.createLinearGradient(0, 0, 0, 150);
    g.addColorStop(0, got ? s.sky[0] : '#d9d0c4'); g.addColorStop(0.55, got ? s.sky[1] : '#c9bfb2'); g.addColorStop(1, got ? s.sky[2] : '#b8ad9f');
    c.fillStyle = g; c.fillRect(0, 0, 240, 150);
    if (!got && area === 'neon') { c.fillStyle = INK; c.fillRect(0, 0, 240, 150); }
    if (got) { c.fillStyle = s.sun; c.beginPath(); c.arc(170, 74, 26, 0, 7); c.fill(); }
    const sil = got ? s.ground : area === 'neon' ? '#1e1838' : '#9d9285';
    c.fillStyle = sil;
    const glow = !got && area === 'neon';
    if (glow) { c.shadowColor = '#ff6ec0'; c.shadowBlur = 14; c.strokeStyle = '#ff6ec0'; c.lineWidth = 2.5; }
    const shape = () => {
      c.beginPath(); c.moveTo(0, 150);
      if (area === 'downtown') { for (const [x, y, w] of [[0, 70, 34], [34, 48, 30], [64, 84, 26], [90, 36, 36], [126, 60, 30], [156, 92, 40], [196, 52, 44]] as const) { c.lineTo(x, y); c.lineTo(x + w, y); } }
      else if (area === 'suburbs') { for (let i = 0; i < 5; i++) { const x = i * 50; c.lineTo(x, 108); c.lineTo(x + 25, 84); c.lineTo(x + 50, 108); } }
      else if (area === 'docks') { c.lineTo(0, 110); c.lineTo(40, 110); c.lineTo(40, 40); c.lineTo(46, 40); c.lineTo(120, 48); c.lineTo(46, 52); c.lineTo(46, 110); c.lineTo(140, 110); c.lineTo(140, 92); c.lineTo(240, 92); }
      else { for (const [x, y, w] of [[0, 60, 28], [28, 22, 26], [54, 74, 22], [76, 10, 30], [106, 50, 24], [130, 30, 34], [164, 66, 28], [192, 18, 48]] as const) { c.lineTo(x, y); c.lineTo(x + w, y); } }
      c.lineTo(240, 150); c.closePath();
    };
    shape(); c.fill(); if (glow) c.stroke();
    c.shadowBlur = 0;
    if (got && area === 'neon') { for (let i = 0; i < 26; i++) { c.fillStyle = i % 2 ? '#3ff2ff' : '#ff6ec0'; c.fillRect(8 + ((i * 53) % 224), 30 + ((i * 37) % 100), 5, 3); } }
    if (got && area === 'suburbs') { c.fillStyle = '#3e6b4e'; for (const x of [30, 120, 205]) { c.beginPath(); c.arc(x, 112, 16, 0, 7); c.fill(); } }
    if (got && area === 'docks') { c.fillStyle = '#c4473d'; c.fillRect(150, 70, 40, 22); c.fillStyle = '#2f5d7c'; c.fillRect(192, 74, 40, 18); }
    if (!got) { c.fillStyle = glow ? 'rgba(255,110,192,0.9)' : 'rgba(27,29,63,0.55)'; c.font = '400 44px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.fillText('?', 120, 96); }
  });
}
