// skater/textures.ts: every canvas the skater draws (TECH §8.4 sizes): the 256² skater atlas (face, prints, legs,
// sleeves, a solid white block for vertex-coloured parts), the 512 × 256 board atlas (512 × 128 deck graphic from
// {pattern, palette, scale, rot, logo, wear}, the grip noise, the ply edge), and the 256 × 128 helmet decal.
// All drawing is seeded (core/rng), so a look always produces the same pixels. All motifs are original.
import type { BoardLook, BoardPattern, Hex, HelmetLook, SkaterLook } from '../core/cosmetics';
import { SKIN_TONES } from '../core/cosmetics';
import { hash32, Sfc32 } from '../core/rng';
import { mix, shade } from './parts';
import { TEX } from './skater.config';

type Ctx = CanvasRenderingContext2D;
const css = (h: Hex, a = 1) => a >= 1 ? `#${h.toString(16).padStart(6, '0')}` : `rgba(${(h >> 16) & 255},${(h >> 8) & 255},${h & 255},${a})`;
const INK = 0x2b2140, PAPER = 0xfff4e3;

/** Stable 32-bit seed from any JSON-able look. */
export function lookSeed(o: unknown): number {
  const s = JSON.stringify(o);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// ── skater atlas layout (canvas px; UV rects are 0..1 with v up) ──────────────────────────────────────────────
const A = TEX.atlas;
type Rect = readonly [number, number, number, number];
const uvRect = (x0: number, y0: number, x1: number, y1: number, W: number = A, H: number = A): Rect => [x0 / W, 1 - y1 / H, x1 / W, 1 - y0 / H];
export const ATLAS = {
  face: { px: [0, 0, 64, 64] as const, uv: uvRect(8, 8, 56, 56), back: uvRect(3, 3, 61, 5) },
  torso: { px: [128, 0, 256, 128] as const, uv: uvRect(132, 6, 252, 122),
    // The torso is two parts (chest bone, spine bone): each maps its own band of the cell (they overlap 6 cm).
    chest: uvRect(132, 6, 252, 68), belly: uvRect(132, 51, 252, 122) },
  legs: { px: [0, 64, 128, 128] as const, uv: uvRect(4, 68, 124, 124) },
  sleeves: { px: [0, 128, 128, 192] as const, uv: uvRect(4, 132, 124, 188) },
  white: { px: [0, 192, 256, 256] as const, u: 32 / A, v: 1 - 224 / A },
} as const;

export interface FaceState { blink: boolean; robotFace: number }

/** Draws the whole skater atlas for one look. */
export function drawSkaterAtlas(c: Ctx, look: SkaterLook, face: FaceState): void {
  c.clearRect(0, 0, A, A);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, A, A);
  drawFace(c, look, face);
  drawTorso(c, look);
  drawLegs(c, look);
  drawSleeves(c, look);
  c.fillStyle = '#ffffff';
  c.fillRect(...ATLAS.white.px.slice(0, 2) as [number, number], A, A - ATLAS.white.px[1]);
}

/** The 64² face cell: skin, eyes (open / blink), brows, mouth, blush, moustache; Kettle's 12 screen faces. */
export function drawFace(c: Ctx, look: SkaterLook, st: FaceState): void {
  const [x0, y0] = ATLAS.face.px, S = TEX.face;
  c.save();
  c.translate(x0, y0);
  c.beginPath(); c.rect(0, 0, S, S); c.clip();
  if (look.kind === 'robot') { drawRobotFace(c, look, st, S); c.restore(); return; }
  const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[2]!;
  c.fillStyle = css(skin); c.fillRect(0, 0, S, S);
  // The face occupies the inner 48 px (UV rect 8..56); features centred, slightly below the middle.
  const cx = 32, ey = 33, dx = 8.5;
  const dark = mix(INK, skin, 0.15);
  // Blush.
  c.fillStyle = css(0xff8a7a, 0.35);
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * 13, ey + 8, 4.5, 2.6, 0, 0, Math.PI * 2); c.fill(); }
  // Brows.
  c.strokeStyle = css(mix(look.hairColor, INK, 0.3)); c.lineWidth = 2; c.lineCap = 'round';
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * (dx - 4), ey - 7.5); c.lineTo(cx + s * (dx + 3.5), ey - 8.5 + (s > 0 ? 0 : 0)); c.stroke(); }
  // Eyes.
  if (st.blink) {
    c.strokeStyle = css(dark); c.lineWidth = 2;
    for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * dx, ey - 1, 3.6, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
  } else {
    for (const s of [-1, 1]) {
      c.fillStyle = css(dark); c.beginPath(); c.ellipse(cx + s * dx, ey, 3.2, 4.4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx + s * dx + 1.1, ey - 1.6, 1.25, 0, Math.PI * 2); c.fill();
    }
  }
  // Nose hint and mouth.
  c.strokeStyle = css(shade(skin, 0.78)); c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(cx, ey + 3); c.lineTo(cx - 1.5, ey + 7); c.lineTo(cx + 0.5, ey + 7.5); c.stroke();
  if (look.facialHair === 'moustache') {
    c.fillStyle = css(look.hairColor);
    c.beginPath(); c.ellipse(cx - 4, ey + 10, 5, 2.2, 0.2, 0, Math.PI * 2); c.ellipse(cx + 4, ey + 10, 5, 2.2, -0.2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = css(shade(skin, 0.5)); c.lineWidth = 1.6;
    c.beginPath(); c.arc(cx, ey + 12, 3.5, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
  } else {
    c.strokeStyle = css(mix(INK, 0xc4473d, 0.4)); c.lineWidth = 1.8;
    c.beginPath(); c.arc(cx, ey + 9, 4.2, 0.18 * Math.PI, 0.82 * Math.PI); c.stroke();
  }
  c.restore();
}

/** Kettle's screen: a dark rounded screen in the chrome head with one of 12 cyan emoticon faces (index 0..11). */
function drawRobotFace(c: Ctx, look: SkaterLook, st: FaceState, S: number): void {
  c.fillStyle = css(look.hairColor); c.fillRect(0, 0, S, S);
  c.fillStyle = css(0x1e2350);
  roundRect(c, 10, 14, 44, 32, 7); c.fill();
  c.strokeStyle = css(shade(look.hairColor, 0.7)); c.lineWidth = 2; roundRect(c, 10, 14, 44, 32, 7); c.stroke();
  const glow = '#3ff2ff';
  c.strokeStyle = glow; c.fillStyle = glow; c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round';
  const f = ((st.robotFace % 12) + 12) % 12, L = 24, R = 40, Y = 26, M = 37;
  const eye = (x: number, kind: string) => {
    c.beginPath();
    switch (kind) {
      case 'dot': c.arc(x, Y, 2.6, 0, Math.PI * 2); c.fill(); return;
      case 'happy': c.arc(x, Y + 2, 3.6, 1.1 * Math.PI, 1.9 * Math.PI); break;
      case 'line': c.moveTo(x - 3.5, Y); c.lineTo(x + 3.5, Y); break;
      case 'ring': c.arc(x, Y, 3.4, 0, Math.PI * 2); break;
      case 'gt': c.moveTo(x - 3, Y - 3); c.lineTo(x + 2, Y); c.lineTo(x - 3, Y + 3); break;
      case 'lt': c.moveTo(x + 3, Y - 3); c.lineTo(x - 2, Y); c.lineTo(x + 3, Y + 3); break;
      case 'star': for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 4; c.moveTo(x - 3.5 * Math.cos(a), Y - 3.5 * Math.sin(a)); c.lineTo(x + 3.5 * Math.cos(a), Y + 3.5 * Math.sin(a)); } break;
      case 'x': c.moveTo(x - 3, Y - 3); c.lineTo(x + 3, Y + 3); c.moveTo(x + 3, Y - 3); c.lineTo(x - 3, Y + 3); break;
      case 'tall': c.moveTo(x, Y - 4); c.lineTo(x, Y + 3); break;
    }
    c.stroke();
  };
  const mouth = (kind: string) => {
    c.beginPath();
    switch (kind) {
      case 'smile': c.arc(32, M - 4, 5, 0.15 * Math.PI, 0.85 * Math.PI); break;
      case 'grin': c.moveTo(26, M - 1); c.lineTo(38, M - 1); c.arc(32, M - 1, 6, 0, Math.PI); break;
      case 'o': c.arc(32, M, 2.8, 0, Math.PI * 2); break;
      case 'flat': c.moveTo(27, M); c.lineTo(37, M); break;
      case 'wave': c.moveTo(26, M); c.quadraticCurveTo(29, M - 3, 32, M); c.quadraticCurveTo(35, M + 3, 38, M); break;
      case 'cat': c.moveTo(26, M - 2); c.quadraticCurveTo(29, M + 2, 32, M - 1); c.quadraticCurveTo(35, M + 2, 38, M - 2); break;
      case 'frown': c.arc(32, M + 3, 5, 1.15 * Math.PI, 1.85 * Math.PI); break;
      case 'tongue': c.arc(32, M - 3, 5, 0.15 * Math.PI, 0.85 * Math.PI); c.moveTo(33, M + 1); c.arc(33, M + 1.5, 2, 0, Math.PI); break;
    }
    c.stroke();
  };
  const FACES: [string, string, string][] = [
    ['dot', 'dot', 'smile'], ['happy', 'happy', 'grin'], ['ring', 'ring', 'o'], ['gt', 'lt', 'flat'],
    ['star', 'star', 'grin'], ['dot', 'happy', 'smile'], ['line', 'line', 'flat'], ['tall', 'tall', 'wave'],
    ['happy', 'happy', 'cat'], ['x', 'x', 'o'], ['ring', 'dot', 'tongue'], ['dot', 'dot', 'frown'],
  ];
  const [le, re, mo] = FACES[f]!;
  if (st.blink && f !== 6) { eye(L, 'line'); eye(R, 'line'); } else { eye(L, le); eye(R, re); }
  mouth(mo);
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}

/** Torso cell (cylindrical wrap: the centre column is the chest front, the edges the back). */
function drawTorso(c: Ctx, look: SkaterLook): void {
  const [x0, y0, x1, y1] = ATLAS.torso.px, w = x1 - x0, h = y1 - y0;
  const [base, sec] = look.topColors;
  c.save(); c.translate(x0, y0); c.beginPath(); c.rect(0, 0, w, h); c.clip();
  const bodyColor = look.top === 'overalls' ? sec : base;     // under the bib: the tee
  c.fillStyle = css(bodyColor); c.fillRect(0, 0, w, h);
  const cx = w / 2, rng = new Sfc32(lookSeed(look) ^ 0x7a);
  // Hems and ribbing (bottom rows are the waist, top rows the shoulders: canvas y grows downward = v down).
  switch (look.print) {
    case 'stripe': {
      c.fillStyle = css(sec);
      for (let y = 18; y < h - 8; y += 18) c.fillRect(0, y, w, 7);
      break;
    }
    case 'pocket': {
      c.fillStyle = css(shade(base, 0.8));
      for (const s of [-1, 1]) { c.fillRect(cx + s * 22 - 10, 34, 20, 18); }
      c.fillStyle = css(shade(base, 0.68));
      for (const s of [-1, 1]) c.fillRect(cx + s * 22 - 11, 32, 22, 6);
      c.strokeStyle = css(0xd9a441); c.lineWidth = 1; c.setLineDash([2, 2]);
      for (const s of [-1, 1]) c.strokeRect(cx + s * 22 - 9, 39, 18, 12);
      c.setLineDash([]);
      c.fillStyle = css(shade(base, 0.75)); c.fillRect(cx - 1, 20, 2, h - 20);   // button placket
      break;
    }
    case 'chestLogo': {
      // An original mark: a sun disc over two waves, in the secondary colour.
      c.fillStyle = css(sec); c.beginPath(); c.arc(cx, 46, 15, Math.PI, 0); c.fill();
      c.strokeStyle = css(sec); c.lineWidth = 4; c.lineCap = 'round';
      for (const yy of [54, 62]) { c.beginPath(); c.moveTo(cx - 18, yy); for (let i = 0; i <= 36; i += 6) c.quadraticCurveTo(cx - 18 + i + 3, yy + (i % 12 ? 3 : -3), cx - 18 + i + 6, yy); c.stroke(); }
      break;
    }
    case 'crestRD': {
      // Original varsity crest: a cream shield with "RD" in red, on the left chest; ribbed hem stripes.
      c.fillStyle = css(sec);
      c.beginPath(); c.moveTo(cx - 6, 26); c.lineTo(cx + 22, 26); c.lineTo(cx + 22, 46); c.quadraticCurveTo(cx + 22, 60, cx + 8, 66);
      c.quadraticCurveTo(cx - 6, 60, cx - 6, 46); c.closePath(); c.fill();
      c.fillStyle = css(base); c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('RD', cx + 8, 44);
      c.fillStyle = css(sec); c.fillRect(0, h - 14, w, 4); c.fillRect(0, h - 7, w, 3);
      break;
    }
    case 'paintDots': {
      const cols = look.printColors ?? [0xff8a5b, 0x7ee0b5, 0xa88beb];
      // The bib (front 60%) in the overalls colour with paint dots; the rest is the tee.
      c.fillStyle = css(base); c.fillRect(cx - 30, 28, 60, h - 28);
      c.fillRect(cx - 30, 0, 8, 30); c.fillRect(cx + 22, 0, 8, 30);              // straps
      c.fillRect(0, 0, 10, h); c.fillRect(w - 10, 0, 10, h);                     // back straps
      for (let i = 0; i < 22; i++) {
        c.fillStyle = css(cols[i % cols.length]!);
        c.beginPath(); c.arc(cx + rng.range(-28, 28), rng.range(32, h - 6), rng.range(2, 4.5), 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case 'sunsetStripe': {
      const g = c.createLinearGradient(0, 40, 0, 64);
      g.addColorStop(0, css(0xffc94a)); g.addColorStop(0.5, css(0xff8a5b)); g.addColorStop(1, css(0xc4477a));
      c.fillStyle = g; c.fillRect(0, 40, w, 24);
      c.fillStyle = css(sec); c.fillRect(cx - 1.5, 0, 3, h);                         // zip
      break;
    }
    default: break;
  }
  // Per-top details that are prints rather than geometry.
  if (look.top === 'cardigan') {
    c.fillStyle = css(sec);
    c.beginPath(); c.moveTo(cx - 14, 0); c.lineTo(cx, 46); c.lineTo(cx + 14, 0); c.closePath(); c.fill();   // V neck shirt
    c.fillStyle = css(0xfff4e3);
    for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(cx, 54 + i * 15, 2.6, 0, Math.PI * 2); c.fill(); }
    // Gus's leaf pin (static fallback of the leaf trail): two little autumn leaves.
    for (const [lx, ly, col] of [[cx + 24, 36, 0xd9765a], [cx + 31, 42, 0xf4d58d]] as const) {
      c.fillStyle = css(col); c.beginPath(); c.ellipse(lx, ly, 6, 3.2, -0.7, 0, Math.PI * 2); c.fill();
    }
  }
  if (look.top === 'hoodie') {
    c.fillStyle = css(shade(base, 0.86)); c.fillRect(cx - 22, h - 46, 44, 26);        // kangaroo pocket
    c.fillStyle = css(shade(base, 0.8)); c.fillRect(0, h - 10, w, 10);               // ribbed hem
  }
  if (look.top === 'trackJacket' || look.top === 'jacket' || look.top === 'varsity') {
    c.fillStyle = css(shade(look.top === 'varsity' ? base : base, 0.82)); c.fillRect(0, h - 9, w, 9);
  }
  if (look.top === 'coveralls') {
    c.fillStyle = css(sec); c.fillRect(0, h - 22, w, 8);                             // belt
    c.fillStyle = css(shade(base, 0.85)); c.fillRect(cx - 1.5, 0, 3, h);           // zip
    c.fillRect(cx + 10, 30, 18, 14);                                                // chest pocket
  }
  if (look.top === 'courierJacket') {
    c.fillStyle = css(shade(base, 1.25)); c.fillRect(cx - 1.5, 0, 3, h);
  }
  if (look.top === 'raincoat') {
    c.fillStyle = css(sec);
    for (let i = 0; i < 3; i++) c.fillRect(cx + 4, 34 + i * 26, 10, 4);              // toggles
    c.fillStyle = css(shade(base, 0.9)); c.fillRect(cx - 1, 0, 2, h);
  }
  if (look.top === 'robot') {
    c.fillStyle = css(sec); roundRect(c, cx - 26, 22, 52, 52, 8); c.fill();         // chest panel
    c.fillStyle = css(0x1e2350); roundRect(c, cx - 14, 32, 28, 16, 4); c.fill();
    c.fillStyle = css(0xff8a5b); c.beginPath(); c.arc(cx - 6, 40, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = css(0x3ff2ff); c.beginPath(); c.arc(cx + 6, 40, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = css(shade(base, 0.7));
    for (let i = 0; i < 4; i++) c.fillRect(cx - 18 + i * 10, 58, 6, 8);
  }
  c.restore();
}

/** Leg cell (cylindrical wrap per leg; centre column = the front of the leg). */
function drawLegs(c: Ctx, look: SkaterLook): void {
  const [x0, y0, x1, y1] = ATLAS.legs.px, w = x1 - x0, h = y1 - y0;
  c.save(); c.translate(x0, y0); c.beginPath(); c.rect(0, 0, w, h); c.clip();
  c.fillStyle = css(look.bottomColor); c.fillRect(0, 0, w, h);
  if (look.print === 'paintDots') {
    const cols = look.printColors ?? [0xff8a5b], rng = new Sfc32(lookSeed(look) ^ 0x3c);
    for (let i = 0; i < 16; i++) { c.fillStyle = css(cols[i % cols.length]!); c.beginPath(); c.arc(rng.range(0, w), rng.range(0, h), rng.range(2, 4), 0, Math.PI * 2); c.fill(); }
  }
  if (look.bottom === 'trackPants') {
    c.fillStyle = css(look.topColors[1]);
    c.fillRect(w * 0.25 - 3, 0, 6, h); c.fillRect(w * 0.75 - 3, 0, 6, h);         // side stripes (both sides)
  }
  if (look.bottom === 'baggyJeans' || look.bottom === 'slimJeans') {
    c.strokeStyle = css(shade(look.bottomColor, 1.25), 0.6); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(w * 0.25, 0); c.lineTo(w * 0.25, h); c.moveTo(w * 0.75, 0); c.lineTo(w * 0.75, h); c.stroke();
  }
  c.restore();
}

/** Sleeve cell (cylindrical wrap per arm). */
function drawSleeves(c: Ctx, look: SkaterLook): void {
  const [x0, y0, x1, y1] = ATLAS.sleeves.px, w = x1 - x0, h = y1 - y0;
  const [base, sec] = look.topColors;
  c.save(); c.translate(x0, y0); c.beginPath(); c.rect(0, 0, w, h); c.clip();
  c.fillStyle = css(look.top === 'varsity' ? sec : base); c.fillRect(0, 0, w, h);
  if (look.print === 'stripe') { c.fillStyle = css(sec); for (let y = 6; y < h; y += 14) c.fillRect(0, y, w, 5); }
  if (look.top === 'trackJacket') { c.fillStyle = css(sec); c.fillRect(w * 0.25 - 4, 0, 8, h); c.fillRect(w * 0.75 - 4, 0, 8, h); }
  if (look.top === 'varsity') { c.fillStyle = css(base); c.fillRect(0, h - 8, w, 3); c.fillRect(0, h - 4, w, 2); }
  c.restore();
}

// ── board atlas: deck graphic 512 × 128 (rows 0..127), grip (128..191), ply edge (192..223), white (224..255) ──
export const DECK_W = TEX.deckW, DECK_H = TEX.deckH, BOARD_ATLAS_H = 256;
export const BOARD_UV = {
  graphic: uvRect(0, 0, DECK_W, DECK_H, DECK_W, BOARD_ATLAS_H),
  grip: uvRect(4, 132, DECK_W - 4, 188, DECK_W, BOARD_ATLAS_H),
  ply: uvRect(0, 194, DECK_W, 222, DECK_W, BOARD_ATLAS_H),
  white: { u: 256 / DECK_W, v: 1 - 240 / BOARD_ATLAS_H },
} as const;

type PatternFn = (c: Ctx, w: number, h: number, pal: readonly [Hex, Hex, Hex], rng: Sfc32, scale: number) => void;

/** The 20 deck patterns (DESIGN §18.5). Drawn in deck space: x along the board (nose at x = 0), y across. */
export const PATTERNS: Readonly<Record<BoardPattern, PatternFn>> = {
  plainMaple(c, w, h, p, rng) {
    c.fillStyle = css(p[0]); c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      c.strokeStyle = css(i % 3 ? p[1] : p[2], 0.55); c.lineWidth = rng.range(0.8, 2.2);
      const y = rng.range(0, h), a = rng.range(1.5, 4), f = rng.range(0.008, 0.02);
      c.beginPath(); for (let x = 0; x <= w; x += 8) c.lineTo(x, y + a * Math.sin(x * f + i)); c.stroke();
    }
    for (let i = 0; i < 3; i++) { c.fillStyle = css(shade(p[1], 0.85), 0.6); c.beginPath(); c.ellipse(rng.range(60, w - 60), rng.range(20, h - 20), 9, 4, 0, 0, Math.PI * 2); c.fill(); }
  },
  stripes(c, w, h, p, _r, s) {
    const bw = 26 * s, cols = [p[0], p[1], p[2], p[1]];
    for (let x = -h, i = 0; x < w + h; x += bw, i++) { c.fillStyle = css(cols[i % 4]!); c.fillRect(x, -h, bw + 1, h * 3); }
  },
  chevrons(c, w, h, p, _r, s) {
    c.fillStyle = css(p[0]); c.fillRect(-w, -h, w * 3, h * 3);
    const step = 34 * s; c.fillStyle = css(p[1]);
    for (let x = -w; x < w * 2; x += step) { c.beginPath(); c.moveTo(x, -h); c.lineTo(x + step / 2, -h); c.lineTo(x + step / 2 + h * 2, h * 2); c.lineTo(x + h * 2, h * 2); c.closePath(); c.fill(); }
  },
  checker(c, w, h, p, _r, s) {
    const q = 16 * s;
    for (let y = 0, j = 0; y < h; y += q, j++) for (let x = 0, i = 0; x < w; x += q, i++) { c.fillStyle = css((i + j) % 2 ? p[1] : p[0]); c.fillRect(x, y, q + 0.5, q + 0.5); }
    c.fillStyle = css(p[2]); c.fillRect(0, h / 2 - 5, w, 10);
  },
  halftoneSun(c, w, h, p, _r, s) {
    c.fillStyle = css(p[0]); c.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, step = 9 * s;
    c.fillStyle = css(p[1]);
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const d = Math.hypot(x - cx, (y - cy) * 2.2) / (w * 0.42), r = (1 - d) * step * 0.55;
      if (r > 0.3) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
    }
    c.fillStyle = css(p[2]); c.beginPath(); c.arc(cx, cy, h * 0.28, 0, Math.PI * 2); c.fill();
  },
  palms(c, w, h, p, rng) {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, css(p[0])); g.addColorStop(1, css(p[1]));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = css(p[2]); c.strokeStyle = css(p[2]);
    // A low sun and three big palm silhouettes in the third colour.
    c.fillStyle = css(mix(p[0], 0xffffff, 0.45)); c.beginPath(); c.arc(w * 0.62, h * 0.55, h * 0.32, 0, Math.PI * 2); c.fill();
    c.fillStyle = css(p[2]); c.strokeStyle = css(p[2]);
    for (let i = 0; i < 3; i++) {
      const bx = 90 + i * 160 + rng.range(-15, 15), top = rng.range(14, 24);
      c.lineWidth = 9; c.beginPath(); c.moveTo(bx - 10, h); c.quadraticCurveTo(bx + 18, (h + top) / 2, bx + 6, top); c.stroke();
      for (let k = 0; k < 8; k++) {
        const a = -Math.PI * 1.05 + (k / 7) * Math.PI * 1.1 + rng.range(-0.12, 0.12), L = rng.range(44, 60);
        c.beginPath(); c.moveTo(bx + 6, top);
        c.quadraticCurveTo(bx + 6 + Math.cos(a) * L * 0.6, top + Math.sin(a) * L * 0.6 - 8, bx + 6 + Math.cos(a) * L, top + Math.sin(a) * L * 0.5 + 10);
        c.quadraticCurveTo(bx + 6 + Math.cos(a) * L * 0.5, top + Math.sin(a) * L * 0.3, bx + 6, top); c.fill();
      }
    }
  },
  waveLines(c, w, h, p, _r, s) {
    c.fillStyle = css(shade(p[0], 0.82)); c.fillRect(0, 0, w, h);
    for (let i = 0, y = 8; y < h + 10; y += 15 * s, i++) {
      c.strokeStyle = css(i % 2 ? shade(p[1], 0.86) : p[2]); c.lineWidth = 7 * s;
      c.beginPath(); for (let x = 0; x <= w; x += 6) c.lineTo(x, y + 5 * Math.sin(x * 0.045 + i * 0.9)); c.stroke();
    }
  },
  polka(c, w, h, p, rng, s) {
    c.fillStyle = css(p[0]); c.fillRect(0, 0, w, h);
    const step = 30 * s;
    for (let y = step / 2, j = 0; y < h + step; y += step * 0.8, j++) for (let x = (j % 2) * step / 2; x < w + step; x += step) {
      c.fillStyle = css(p[1]);
      // Mint Chip: irregular chips rather than perfect dots.
      c.beginPath(); c.ellipse(x + rng.range(-3, 3), y + rng.range(-3, 3), step * 0.2, step * 0.14, rng.range(0, Math.PI), 0, Math.PI * 2); c.fill();
    }
  },
  gradientFade(c, w, h, p) {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, css(p[0])); g.addColorStop(0.5, css(p[1])); g.addColorStop(1, css(p[2]));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    for (let x = -h; x < w; x += 40) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 14, h); c.lineTo(x + 14 + h, 0); c.lineTo(x + h, 0); c.fill(); }
  },
  stickerBomb(c, w, h, p, rng) {
    c.fillStyle = css(p[0]); c.fillRect(0, 0, w, h);
    const cols = [p[1], p[2], 0xff8a5b, 0x7ee0b5, 0xa88beb, 0xffc94a, PAPER];
    for (let i = 0; i < 30; i++) {
      const x = rng.range(0, w), y = rng.range(0, h), r = rng.range(9, 20);
      c.save(); c.translate(x, y); c.rotate(rng.range(-0.6, 0.6));
      sticker(c, i % 9, r, css(cols[i % cols.length]!));
      c.restore();
    }
  },
  topo(c, w, h, p, rng, s) {
    c.fillStyle = css(p[0]); c.fillRect(0, 0, w, h);
    const peaks = [0, 1, 2].map(() => [rng.range(60, w - 60), rng.range(20, h - 20)] as const);
    for (let k = 1; k < 10; k++) {
      c.strokeStyle = css(k % 3 ? p[1] : p[2]); c.lineWidth = k % 3 ? 1.5 : 2.5;
      for (const [px, py] of peaks) { c.beginPath(); c.ellipse(px, py, k * 13 * s, k * 6 * s, 0.3, 0, Math.PI * 2); c.stroke(); }
    }
  },
  neonGrid(c, w, h, p, rng) {
    c.fillStyle = css(p[0]); c.fillRect(0, 0, w, h);
    c.strokeStyle = css(p[1]); c.lineWidth = 2;
    for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    // Market buttons with invented glyph labels (abstract strokes, not real characters).
    for (let i = 0; i < 9; i++) {
      const x = 22 + i * 54, y = i % 2 ? 72 : 30;
      c.fillStyle = css(p[2]); roundRect(c, x, y, 40, 26, 6); c.fill();
      c.strokeStyle = css(PAPER); c.lineWidth = 2; glyph(c, x + 20, y + 13, rng, 8);
    }
  },
  retroSun(c, w, h, p) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, css(p[2])); g.addColorStop(1, css(mix(p[2], p[0], 0.45)));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.62, r = h * 0.5;
    const sg = c.createLinearGradient(0, cy - r, 0, cy + r); sg.addColorStop(0, css(p[1])); sg.addColorStop(1, css(p[0]));
    c.fillStyle = sg; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = css(p[2]);
    for (let i = 0; i < 5; i++) { const y = cy + 4 + i * 9; c.fillRect(cx - r, y, 2 * r, 2 + i * 1.2); }
    c.fillRect(0, h * 0.86, w, h);
    c.strokeStyle = css(p[0], 0.7); c.lineWidth = 1.5;
    for (let x = -w; x < w * 2; x += 40) { c.beginPath(); c.moveTo(cx, h * 0.86); c.lineTo(x, h); c.stroke(); }
  },
  brick(c, w, h, p, rng, s) {
    c.fillStyle = css(p[1]); c.fillRect(0, 0, w, h);
    const bh = 16 * s, bw = 38 * s;
    for (let y = 0, j = 0; y < h; y += bh, j++) for (let x = -(j % 2) * bw / 2; x < w; x += bw) {
      c.fillStyle = css(rng.chance(0.25) ? p[2] : shade(p[0], rng.range(0.92, 1.06)));
      c.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
    }
  },
  cassette(c, w, h, p) {
    c.fillStyle = css(p[0]); c.fillRect(0, 0, w, h);
    c.fillStyle = css(p[1]); roundRect(c, 60, 12, w - 120, h - 24, 12); c.fill();
    c.fillStyle = css(p[2]); c.fillRect(70, 22, w - 140, 18);
    c.fillStyle = css(p[0]); roundRect(c, w / 2 - 90, 52, 180, 50, 25); c.fill();
    for (const s of [-1, 1]) {
      c.fillStyle = css(p[2]); c.beginPath(); c.arc(w / 2 + s * 56, 77, 17, 0, Math.PI * 2); c.fill();
      c.fillStyle = css(p[0]); c.beginPath(); c.arc(w / 2 + s * 56, 77, 7, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = css(p[1]); c.fillRect(w / 2 - 30, 70, 60, 14);
  },
  corrugated(c, w, h, p, rng) {
    c.fillStyle = css(p[1]); c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) { c.fillStyle = css(shade(p[1], 1.18)); c.fillRect(0, y, w, 3); c.fillStyle = css(shade(p[1], 0.78)); c.fillRect(0, y + 6, w, 3); }
    for (let i = 0; i < 10; i++) {
      c.fillStyle = css(i % 3 ? p[0] : p[2], 0.75);
      c.beginPath(); c.ellipse(rng.range(0, w), rng.range(0, h), rng.range(18, 44), rng.range(8, 20), rng.range(0, 3), 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = css(shade(p[1], 0.6));
    for (let x = 30; x < w; x += 64) for (const y of [10, h - 10]) { c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 2); c.fill(); }
  },
  koi(c, w, h, p, rng) {
    c.fillStyle = css(p[0]); c.fillRect(0, 0, w, h);
    c.strokeStyle = css(shade(p[0], 1.3), 0.6); c.lineWidth = 2;
    for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(rng.range(0, w), rng.range(0, h), rng.range(8, 26), 0, Math.PI * 1.3); c.stroke(); }
    for (let i = 0; i < 3; i++) {
      const x = 90 + i * 160, y = i % 2 ? 80 : 46, a = i % 2 ? 0.25 : -0.2;
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = css(p[1]); c.beginPath(); c.ellipse(0, 0, 38, 14, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(-34, 0); c.lineTo(-56, -14); c.lineTo(-50, 0); c.lineTo(-56, 14); c.closePath(); c.fill();
      c.fillStyle = css(p[2]); c.beginPath(); c.ellipse(6, -3, 10, 6, 0.3, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(-14, 4, 7, 4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = css(INK); c.beginPath(); c.arc(28, -4, 2, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  },
  streetMap(c, w, h, p, rng) {
    c.fillStyle = css(p[0]); c.fillRect(0, 0, w, h);
    c.strokeStyle = css(p[1], 0.85);
    for (let x = 20; x < w; x += rng.range(34, 60)) { c.lineWidth = rng.chance(0.3) ? 5 : 2.5; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + rng.range(-8, 8), h); c.stroke(); }
    for (let y = 14; y < h; y += rng.range(24, 38)) { c.lineWidth = rng.chance(0.3) ? 5 : 2.5; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + rng.range(-6, 6)); c.stroke(); }
    c.strokeStyle = css(p[2]); c.lineWidth = 4; c.setLineDash([7, 6]); c.lineCap = 'round';
    c.beginPath(); c.moveTo(30, h - 20); c.lineTo(150, h - 20); c.lineTo(150, 40); c.lineTo(330, 40); c.lineTo(330, 90); c.lineTo(w - 40, 90); c.stroke();
    c.setLineDash([]);
    c.fillStyle = css(p[2]); c.beginPath(); c.arc(w - 40, 90, 7, 0, Math.PI * 2); c.fill();
  },
  lanterns(c, w, h, p) {
    c.fillStyle = css(p[2]); c.fillRect(0, 0, w, h);
    c.strokeStyle = css(p[1], 0.7); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, 18); for (let x = 0; x <= w; x += 64) c.quadraticCurveTo(x + 32, 34, x + 64, 18); c.stroke();
    for (let x = 32; x < w; x += 64) {
      const y = 62 + (x / 64 % 2) * 10;
      c.strokeStyle = css(p[1], 0.7); c.beginPath(); c.moveTo(x, 26); c.lineTo(x, y - 22); c.stroke();
      c.fillStyle = css(p[0]); c.beginPath(); c.ellipse(x, y, 17, 22, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = css(p[1], 0.85); c.beginPath(); c.ellipse(x - 4, y - 4, 6, 12, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = css(shade(p[0], 0.7)); c.lineWidth = 1.2;
      for (const k of [-10, 0, 10]) { c.beginPath(); c.ellipse(x, y + k, 17 * Math.cos(k / 22), 2, 0, 0, Math.PI * 2); c.stroke(); }
      c.fillStyle = css(INK); c.fillRect(x - 7, y - 24, 14, 4); c.fillRect(x - 7, y + 20, 14, 4);
    }
  },
  goldLeaf(c, w, h, p, rng) {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, css(p[2])); g.addColorStop(0.3, css(p[0])); g.addColorStop(0.5, css(p[1]));
    g.addColorStop(0.7, css(p[0])); g.addColorStop(1, css(p[2]));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      c.fillStyle = css(i % 2 ? p[1] : shade(p[0], 1.12), 0.8);
      const x = rng.range(0, w), y = rng.range(0, h), s = rng.range(6, 18);
      c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) c.lineTo(x + rng.range(-s, s), y + rng.range(-s, s)); c.closePath(); c.fill();
    }
    c.strokeStyle = css(p[2], 0.55); c.lineWidth = 1;
    for (let i = 0; i < 14; i++) { let x = rng.range(0, w), y = rng.range(0, h); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rng.range(-18, 18); y += rng.range(-10, 10); c.lineTo(x, y); } c.stroke(); }
    // A leaf motif in the middle.
    c.fillStyle = css(p[2], 0.8);
    c.beginPath(); c.moveTo(w / 2 - 50, h / 2); c.quadraticCurveTo(w / 2, h / 2 - 34, w / 2 + 50, h / 2); c.quadraticCurveTo(w / 2, h / 2 + 34, w / 2 - 50, h / 2); c.fill();
    c.strokeStyle = css(p[1]); c.lineWidth = 2; c.beginPath(); c.moveTo(w / 2 - 50, h / 2); c.lineTo(w / 2 + 50, h / 2); c.stroke();
  },
};

/** One of 9 original sticker shapes. */
function sticker(c: Ctx, kind: number, r: number, fill: string): void {
  c.fillStyle = fill; c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1.5, r * 0.18); c.lineJoin = 'round';
  c.beginPath();
  switch (kind) {
    case 0: for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); break;   // star
    case 1: c.arc(0, 0, r * 0.8, 0, Math.PI * 2); break;                                                                                  // dot
    case 2: roundRect(c, -r, -r * 0.6, r * 2, r * 1.2, r * 0.3); break;                                                                    // label
    case 3: c.moveTo(-r * 0.2, -r); c.lineTo(r * 0.5, -r * 0.1); c.lineTo(0, -r * 0.05); c.lineTo(r * 0.3, r); c.lineTo(-r * 0.5, 0); c.lineTo(0, 0); c.closePath(); break; // bolt
    case 4: c.moveTo(0, -r); c.lineTo(r, r * 0.8); c.lineTo(-r, r * 0.8); c.closePath(); break;                                            // triangle
    case 5: c.arc(0, 0, r * 0.8, 0, Math.PI * 2); c.moveTo(r * 0.35, 0); c.arc(0, 0, r * 0.35, 0, Math.PI * 2, true); break;               // ring
    case 6: c.moveTo(-r, r * 0.3); c.quadraticCurveTo(-r * 0.5, -r * 0.6, 0, r * 0.3); c.quadraticCurveTo(r * 0.5, -r * 0.6, r, r * 0.3); c.lineTo(r, r * 0.7); c.lineTo(-r, r * 0.7); c.closePath(); break; // wave
    case 7: c.arc(0, 0, r * 0.85, 0, Math.PI * 2); break;                                                                                  // smiley base
    default: c.moveTo(0, -r); c.lineTo(r * 0.7, 0); c.lineTo(0, r); c.lineTo(-r * 0.7, 0); c.closePath(); break;                           // diamond
  }
  c.fill(); c.stroke();
  if (kind === 7) {
    c.fillStyle = css(INK); c.beginPath(); c.arc(-r * 0.3, -r * 0.15, r * 0.12, 0, Math.PI * 2); c.arc(r * 0.3, -r * 0.15, r * 0.12, 0, Math.PI * 2); c.fill();
    c.strokeStyle = css(INK); c.lineWidth = r * 0.12; c.beginPath(); c.arc(0, r * 0.05, r * 0.4, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
  }
}

/** An invented abstract glyph (2–4 strokes), never a real character. */
function glyph(c: Ctx, x: number, y: number, rng: Sfc32, s: number): void {
  c.beginPath();
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const k = rng.int(0, 3);
    if (k === 0) { c.moveTo(x - s * 0.6, y + rng.range(-s, s) * 0.6); c.lineTo(x + s * 0.6, y + rng.range(-s, s) * 0.6); }
    else if (k === 1) { const gx = x + rng.range(-s, s) * 0.5; c.moveTo(gx, y - s * 0.7); c.lineTo(gx + rng.range(-3, 3), y + s * 0.7); }
    else if (k === 2) { c.moveTo(x + s * 0.5, y - s * 0.6); c.arc(x, y, s * 0.55, -0.6, rng.range(1.5, 3)); }
    else { c.moveTo(x - s * 0.5, y + s * 0.6); c.lineTo(x, y - s * 0.4); c.lineTo(x + s * 0.5, y + s * 0.6); }
  }
  c.stroke();
}

/** Draws the full board atlas for one look. */
export function drawBoardAtlas(c: Ctx, look: BoardLook, sunPhase = 0.5): void {
  const W = DECK_W, H = DECK_H;
  c.clearRect(0, 0, W, BOARD_ATLAS_H);
  // Deck graphic with scale and rotation (rotated about the centre; drawn over-size so corners stay covered).
  const rng = new Sfc32(hash32(lookSeed(look.pattern), lookSeed(look.palette)));
  c.save();
  c.beginPath(); c.rect(0, 0, W, H); c.clip();
  c.fillStyle = css(look.palette[0]); c.fillRect(0, 0, W, H);
  c.translate(W / 2, H / 2);
  if (look.rot) c.rotate((look.rot * Math.PI) / 180);
  const big = look.rot ? 1.8 : 1;
  c.translate(-(W * big) / 2, -(H * big) / 2 * (look.rot ? 3 : 1));
  const draw = PATTERNS[look.pattern] ?? PATTERNS.plainMaple;
  if (look.pattern === 'retroSun' && look.animated) drawRetroSunPhase(c, W * big, H * big * (look.rot ? 3 : 1), look.palette, sunPhase);
  else draw(c, W * big, H * big * (look.rot ? 3 : 1), look.palette, rng, Math.max(0.5, Math.min(2, look.scale)));
  c.restore();
  if (look.logo) drawLogo(c, look.logo, look.palette, W, H);
  if (look.wear > 0) drawWear(c, look, W, H, rng);
  // Grip: dark noise (the 128² grip tile, tiled along the deck), plus Golden Hour's glowing edge.
  const [gx0, gy0] = [0, 128];
  c.fillStyle = css(look.grip); c.fillRect(gx0, gy0, W, 64);
  const tile = gripTile(c);
  if (tile) for (let x = 0; x < W; x += TEX.grip) c.drawImage(tile, 0, 0, TEX.grip, 64, gx0 + x, gy0, TEX.grip, 64);
  else drawGripNoise(c, gx0, gy0, W, 64);
  if (look.gripGlow !== undefined) {
    c.strokeStyle = css(look.gripGlow); c.lineWidth = 5; c.strokeRect(gx0 + 6, gy0 + 6, W - 12, 52);
  }
  // Ply edge: 7 stripes of natural maple (dyed middle ply in the palette's second colour).
  const plies = [0xe8c9a0, 0xc9a27a, 0xe8c9a0, look.palette[1], 0xe8c9a0, 0xc9a27a, 0xe8c9a0];
  for (let i = 0; i < 7; i++) { c.fillStyle = css(plies[i]!); c.fillRect(0, 192 + i * (32 / 7), W, 32 / 7 + 0.5); }
  c.fillStyle = '#ffffff'; c.fillRect(0, 224, W, 32);
}

/** The 128² grip noise tile (speckles only, drawn once and reused over every grip colour). */
let gripCanvas: HTMLCanvasElement | null | undefined;
function gripTile(c: Ctx): HTMLCanvasElement | null {
  if (gripCanvas !== undefined) return gripCanvas;
  const doc = (c.canvas as HTMLCanvasElement | undefined)?.ownerDocument;
  if (!doc) return (gripCanvas = null);
  const t = doc.createElement('canvas');
  t.width = TEX.grip; t.height = TEX.grip;
  const g = t.getContext('2d');
  if (!g) return (gripCanvas = null);
  drawGripNoise(g, 0, 0, TEX.grip, TEX.grip);
  return (gripCanvas = t);
}
function drawGripNoise(c: Ctx, x0: number, y0: number, w: number, h: number): void {
  const gr = new Sfc32(0x9e1d), n = Math.round((w * h) / 12.6);
  for (let i = 0; i < n; i++) {
    c.fillStyle = gr.float() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.22)';
    c.fillRect(x0 + gr.range(0, w), y0 + gr.range(0, h), 1.5, 1.5);
  }
}

/** Glide Ring's animated canvas: the retro sun at a phase of its 6 s rise-and-set loop (0..1). */
function drawRetroSunPhase(c: Ctx, w: number, h: number, p: readonly [Hex, Hex, Hex], phase: number): void {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, css(p[2])); g.addColorStop(1, css(mix(p[2], p[0], 0.45)));
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const rise = Math.sin(Math.PI * phase);                 // 0 at the horizon → 1 high
  const cx = w / 2, r = h * 0.5, cy = h * 0.86 + r * 0.2 - rise * h * 0.42;
  const sg = c.createLinearGradient(0, cy - r, 0, cy + r); sg.addColorStop(0, css(p[1])); sg.addColorStop(1, css(p[0]));
  c.save(); c.beginPath(); c.rect(0, 0, w, h * 0.86); c.clip();
  c.fillStyle = sg; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = css(p[2]);
  for (let i = 0; i < 5; i++) { const y = cy + 4 + i * 9; c.fillRect(cx - r, y, 2 * r, 2 + i * 1.2); }
  c.restore();
  c.fillStyle = css(p[2]); c.fillRect(0, h * 0.86, w, h);
  c.strokeStyle = css(p[0], 0.7); c.lineWidth = 1.5;
  for (let x = -w; x < w * 2; x += 40) { c.beginPath(); c.moveTo(cx, h * 0.86); c.lineTo(x, h); c.stroke(); }
}

function drawLogo(c: Ctx, text: string, p: readonly [Hex, Hex, Hex], W: number, H: number): void {
  c.save();
  c.font = 'bold 26px sans-serif';
  const tw = Math.min(W * 0.5, c.measureText(text).width + 34);
  c.fillStyle = css(PAPER); roundRect(c, W / 2 - tw / 2, H / 2 - 21, tw, 42, 21); c.fill();
  c.strokeStyle = css(INK); c.lineWidth = 3; roundRect(c, W / 2 - tw / 2, H / 2 - 21, tw, 42, 21); c.stroke();
  c.fillStyle = css(mix(p[0], INK, 0.55)); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, W / 2, H / 2 + 1, tw - 24);
  c.restore();
}

/** Wear: scratches clustered at the nose and the tail, showing the light ply through the print. */
function drawWear(c: Ctx, look: BoardLook, W: number, H: number, rng: Sfc32): void {
  const n = Math.round(look.wear * 70);
  c.save(); c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const nose = i % 2 === 0, x = nose ? rng.range(0, W * 0.2) ** 1 : W - rng.range(0, W * 0.2);
    const y = rng.range(4, H - 4), len = rng.range(6, 26), a = rng.range(-0.5, 0.5);
    c.strokeStyle = css(rng.chance(0.6) ? 0xe8d6b8 : shade(look.palette[0], 0.7), rng.range(0.4, 0.85));
    c.lineWidth = rng.range(0.8, 2.2);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len * (nose ? 1 : -1), y + Math.sin(a) * len); c.stroke();
  }
  c.restore();
}

// ── helmet decal 256 × 128: shell (rows 0..107, equirect: x = azimuth with the face at the centre, y = rim → top),
//    visor band (rows 112..127, x 0..191: sky-gradient visor or the glyph band), white block (x 192..255) ──
export const DECAL_W = TEX.decalW, DECAL_H = TEX.decalH;
export const DECAL_UV = {
  shell: uvRect(0, 2, DECAL_W, 106, DECAL_W, DECAL_H),
  visor: uvRect(2, 113, 190, 126, DECAL_W, DECAL_H),
  white: { u: 224 / DECAL_W, v: 1 - 120 / DECAL_H },
} as const;

/** Draws the helmet decal canvas for one look (`sky` is the gradient the visor reflects). */
export function drawHelmetDecal(c: Ctx, look: HelmetLook, sky: readonly [Hex, Hex, Hex] = [0x8e7cc3, 0xf2a37b, 0xffd9a0]): void {
  const W = DECAL_W, SH = 108, rng = new Sfc32(lookSeed(look));
  c.clearRect(0, 0, W, DECAL_H);
  c.fillStyle = css(look.color); c.fillRect(0, 0, W, SH);
  // Canvas y = 0 is the top of the texture = the pole (v = 1); y = SH is the rim.
  const yOf = (el: number) => SH * (1 - el);             // el: 0 rim .. 1 pole
  const cx = W / 2;                                       // the front of the helmet
  if (look.finish === 'chrome') {
    const g = c.createLinearGradient(0, 0, 0, SH); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, css(look.color)); g.addColorStop(0.6, css(shade(look.color, 0.55))); g.addColorStop(1, css(shade(look.color, 1.2)));
    c.fillStyle = g; c.fillRect(0, 0, W, SH);
  }
  if (look.shell === 'dome' || look.shell === 'visor' || look.shell === 'catEars' || look.shell === 'wrapVisor') {
    // 8 vents in two rows over the top.
    c.fillStyle = css(shade(look.color, 0.45));
    for (let i = 0; i < 8; i++) {
      const az = (i < 4 ? -1 : 1) * (0.06 + (i % 4) * 0.05), el = 0.5 + (i % 2) * 0.18;
      const x = cx + az * W, y = yOf(el);
      roundRect(c, x - 3, y - 9, 6, 18, 3); c.fill();
      roundRect(c, x - 3 + W / 2 * (az > 0 ? -1 : 1) * 0, y - 9, 6, 18, 3);
    }
    for (let i = 0; i < 4; i++) { const x = (i < 2 ? 0.08 : 0.92) * W + (i % 2) * 10 - 5; roundRect(c, x - 3, yOf(0.62) - 9, 6, 18, 3); c.fill(); }
  }
  switch (look.decal) {
    case 'stickers': {
      const cols = [0xff8a5b, 0x7ee0b5, 0xa88beb, 0xffc94a, 0xff5e6c, 0x5eb8ff, INK, look.decalColor, 0x9ccfb3];
      // Procedural scatter of the 9 sticker shapes, big and saturated so the bomb reads as confetti at run scale.
      // A jittered 10 × 4 grid: every view of the shell shows a dozen stickers.
      for (let i = 0; i < 40; i++) {
        const gx = i % 10, gy = Math.floor(i / 10);
        c.save(); c.translate(gx * 25.6 + 12 + rng.range(-7, 7), 16 + gy * 24 + rng.range(-6, 6)); c.rotate(rng.range(-0.7, 0.7));
        sticker(c, (i * 4 + gy) % 9, rng.range(10, 14), css(cols[(i * 5 + gy) % cols.length]!)); c.restore();
      }
      break;
    }
    case 'stripe': {
      c.fillStyle = css(look.decalColor);
      for (const ax of [cx, 0, W]) for (const off of [-9, 9]) {
        c.beginPath();
        for (let k = 0; k <= 12; k++) { const el = k / 12, wpx = 6 / Math.max(0.25, Math.cos(el * Math.PI / 2)); c.lineTo(ax + off - wpx / 2, yOf(el)); }
        for (let k = 12; k >= 0; k--) { const el = k / 12, wpx = 6 / Math.max(0.25, Math.cos(el * Math.PI / 2)); c.lineTo(ax + off + wpx / 2, yOf(el)); }
        c.closePath(); c.fill();
      }
      break;
    }
    case 'scuffs': {
      c.lineCap = 'round';
      for (let i = 0; i < 40; i++) {
        c.strokeStyle = css(rng.chance(0.5) ? look.decalColor : 0xffffff, rng.range(0.25, 0.6)); c.lineWidth = rng.range(1, 2.5);
        const x = rng.range(0, W), y = rng.range(6, SH - 4); c.beginPath(); c.moveTo(x, y); c.lineTo(x + rng.range(-12, 12), y + rng.range(-5, 5)); c.stroke();
      }
      c.fillStyle = css(look.decalColor, 0.5);
      for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(rng.range(0, W), rng.range(10, SH - 6), rng.range(2, 4), 0, Math.PI * 2); c.fill(); }
      // A stencilled band: an original freight-yard mark (stripes only).
      c.fillStyle = css(INK, 0.85); c.fillRect(cx - 26, yOf(0.3) - 5, 52, 10);
      c.fillStyle = css(look.color); for (let x = cx - 22; x < cx + 22; x += 9) c.fillRect(x, yOf(0.3) - 3, 5, 6);
      break;
    }
    case 'plaid': {
      c.fillStyle = css(look.decalColor, 0.5);
      for (let x = 0; x < W; x += 16) c.fillRect(x, 0, 8, SH);
      for (let y = 0; y < SH; y += 16) c.fillRect(0, y, W, 8);
      c.fillStyle = css(shade(look.color, 0.75), 0.35);
      for (let x = 4; x < W; x += 16) c.fillRect(x, 0, 1, SH);
      break;
    }
    case 'ribs': {
      c.strokeStyle = css(look.decalColor); c.lineWidth = 2.5;
      for (let y = 8; y < SH; y += 13) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      c.strokeStyle = css(shade(look.color, 0.7), 0.6); c.lineWidth = 1;
      for (let x = 0; x < W; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, SH); c.stroke(); }
      // A warm hot spot where the light inside shines through.
      const g = c.createRadialGradient(cx, SH * 0.55, 4, cx, SH * 0.55, 70); g.addColorStop(0, css(0xffd39a, 0.55)); g.addColorStop(1, css(0xffd39a, 0));
      c.fillStyle = g; c.fillRect(0, 0, W, SH);
      break;
    }
    case 'petals': {
      // Sunflower centre: seeds in a spiral.
      for (let i = 0; i < 140; i++) {
        const a = i * 2.39996, r = Math.sqrt(i / 140);
        c.fillStyle = css(i % 3 ? shade(look.color, 1.35) : shade(look.color, 0.65));
        c.beginPath(); c.arc(cx + Math.cos(a) * r * W * 0.5, SH * (1 - r) * 0.98 + 1 + Math.sin(a) * 2, 2.2, 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case 'glyphScroll': {
      c.strokeStyle = css(look.decalColor, 0.35); c.lineWidth = 1.5;
      for (let y = 10; y < SH; y += 22) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      break;
    }
    default: break;
  }
  if (look.finish === 'gloss') {
    // Specular sprite: a soft highlight on the upper front-left.
    const hx = cx - W * 0.09, hy = yOf(0.62);
    const g = c.createRadialGradient(hx, hy, 1, hx, hy, 22); g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(hx, hy, 30, 18, -0.3, 0, Math.PI * 2); c.fill();
  }
  // Visor band.
  if (look.decal === 'glyphScroll') {
    c.fillStyle = css(look.color); c.fillRect(0, 108, 192, 20);
    c.fillStyle = css(shade(look.color, 1.4)); c.fillRect(0, 110, 192, 16);
    c.strokeStyle = css(look.decalColor); c.lineWidth = 1.6; c.lineCap = 'round';
    for (let x = 8; x < 190; x += 12) glyph(c, x, 118, rng, 4.5);
  } else {
    const tint = look.visorTint ?? shade(look.color, 0.6);
    const g = c.createLinearGradient(0, 110, 0, 128);
    g.addColorStop(0, css(mix(tint, sky[0], 0.35))); g.addColorStop(0.55, css(mix(tint, sky[1], 0.45))); g.addColorStop(1, css(mix(tint, sky[2], 0.55)));
    c.fillStyle = g; c.fillRect(0, 108, 192, 20);
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(20, 113, 60, 2);
  }
  c.fillStyle = '#ffffff'; c.fillRect(192, 108, 64, 20);
}
