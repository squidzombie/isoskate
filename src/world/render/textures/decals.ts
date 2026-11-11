// world/render/textures/decals.ts: the 512² decal atlas (TECH §8.4 "decal atlas 512²", DESIGN §18.7): 8 × 8 cells of
// 64 px, white marks on transparent (the instanced decal layer tints them per instance). Cracks, patches, oil, arrows,
// drains, the four manhole motifs (grid, plain, anchor, an original flower), leaves, petals, the soft contact
// shadow under obstacles, puddle and glow masks, crosswalk / lane paint and a "SLOW" stripe block; RECLAIM adds weed
// strips, moss patches and rims, root lifts, flower dots, lily pads, lichen, rust drips, joint grass, ripples and the
// perpendicular bay (40 of 64 cells).
import { Sfc32, hash32 } from '../../../core/rng';

export const DECAL = {
  solid: 0, soft: 1, contact: 2, crack1: 3, crack2: 4, patch: 5, oil: 6, arrowS: 7, arrowL: 8, arrowR: 9, drain: 10,
  manGrid: 11, manPlain: 12, manAnchor: 13, manFlower: 14, leaves: 15, petals: 16, puddle: 17, slow: 18, skid: 19,
  zebra: 20, dashes: 21, parkT: 22, ring: 23, chevrons: 24, stain: 25, grate: 26, scramble: 27,
  // RECLAIM (DESIGN §18.7, theme §11: 28 → 40 of 64 cells): ground overgrowth and the after-rain marks.
  weedA: 28, weedB: 29, mossA: 30, mossB: 31, rootLift: 32, flowers: 33, lily: 34, lichen: 35, rustDrip: 36,
  grassJoint: 37, ripple: 38, bayPerp: 39,
} as const;
export type DecalId = (typeof DECAL)[keyof typeof DECAL];
export const DECAL_GRID = 8;
const C = 64;

type Painter = (c: CanvasRenderingContext2D, r: Sfc32) => void;
const W = '#ffffff';
const P: Readonly<Record<number, Painter>> = {
  [DECAL.solid]: (c) => { c.fillStyle = W; c.fillRect(0, 0, C, C); },
  [DECAL.soft]: (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, C, C); },
  [DECAL.contact]: (c) => {
    // Soft-edged rounded rectangle: full inside, fading over the outer 12 px (contact shadow under obstacles).
    for (let i = 0; i < 12; i++) { c.fillStyle = `rgba(255,255,255,${((i + 1) / 12) ** 1.6 * 0.12})`; c.fillRect(i, i, C - 2 * i, C - 2 * i); }
    c.fillStyle = 'rgba(255,255,255,1)'; c.fillRect(12, 12, C - 24, C - 24);
  },
  [DECAL.crack1]: (c, r) => crack(c, r, 3), [DECAL.crack2]: (c, r) => crack(c, r, 5),
  [DECAL.patch]: (c, r) => { c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); for (let k = 0; k < 9; k++) { const a = (k / 9) * 6.283; const rr = 22 + r.range(-6, 8); const x = 32 + Math.cos(a) * rr * 1.1, y = 32 + Math.sin(a) * rr * 0.8; if (k) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); c.fill(); },
  [DECAL.oil]: (c, r) => { for (let k = 0; k < 5; k++) { const g = c.createRadialGradient(0, 0, 0, 0, 0, 16); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.save(); c.translate(32 + r.range(-10, 10), 32 + r.range(-10, 10)); c.scale(1.3, r.range(0.6, 1)); c.fillStyle = g; c.fillRect(-16, -16, 32, 32); c.restore(); } },
  [DECAL.arrowS]: (c) => arrow(c, 0), [DECAL.arrowL]: (c) => arrow(c, -1), [DECAL.arrowR]: (c) => arrow(c, 1),
  // A kerb gully grate filling the cell (drawn 0.4 m across × 0.6 m along the kerb): frame, five slots along v.
  [DECAL.drain]: (c) => { c.fillStyle = W; c.fillRect(3, 2, 58, 60); c.clearRect(9, 7, 46, 50); for (let i = 0; i < 6; i++) c.fillRect(9 + i * 8.6, 7, 3.4, 50); c.fillRect(9, 30, 46, 3); },
  [DECAL.manGrid]: (c) => { manhole(c); c.fillStyle = W; for (let i = 0; i < 6; i++) { c.fillRect(14 + i * 6.5, 14, 2, 36); c.fillRect(14, 14 + i * 6.5, 36, 2); } },
  [DECAL.manPlain]: (c) => { manhole(c); c.fillStyle = W; c.beginPath(); c.arc(32, 32, 14, 0, 6.283); c.fill(); c.clearRect(18, 30, 28, 4); },
  [DECAL.manAnchor]: (c) => { manhole(c); c.strokeStyle = W; c.lineWidth = 3; c.beginPath(); c.moveTo(32, 16); c.lineTo(32, 46); c.moveTo(24, 22); c.lineTo(40, 22); c.stroke(); c.beginPath(); c.arc(32, 36, 11, 0.15, Math.PI - 0.15); c.stroke(); c.beginPath(); c.arc(32, 14, 3, 0, 6.283); c.stroke(); },
  [DECAL.manFlower]: (c) => {
    manhole(c); c.fillStyle = W;
    // An original five-petal motif with a ring of dots (not any real ward emblem).
    for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.283; c.save(); c.translate(32, 32); c.rotate(a); c.beginPath(); c.ellipse(0, -9, 4.5, 8, 0, 0, 6.283); c.fill(); c.restore(); }
    c.clearRect(29, 29, 6, 6);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.283; c.beginPath(); c.arc(32 + Math.cos(a) * 21, 32 + Math.sin(a) * 21, 1.4, 0, 6.283); c.fill(); }
  },
  [DECAL.leaves]: (c, r) => { for (let k = 0; k < 9; k++) { c.save(); c.translate(r.range(8, 56), r.range(8, 56)); c.rotate(r.range(0, 6.28)); c.fillStyle = `rgba(255,255,255,${r.range(0.7, 1)})`; c.beginPath(); c.ellipse(0, 0, 4, 2.2, 0, 0, 6.283); c.fill(); c.restore(); } },
  [DECAL.petals]: (c, r) => { for (let k = 0; k < 14; k++) { c.save(); c.translate(r.range(6, 58), r.range(6, 58)); c.rotate(r.range(0, 6.28)); c.fillStyle = `rgba(255,255,255,${r.range(0.6, 1)})`; c.beginPath(); c.ellipse(0, 0, 2.4, 1.5, 0, 0, 6.283); c.fill(); c.restore(); } },
  [DECAL.puddle]: (c, r) => { c.fillStyle = W; c.beginPath(); for (let k = 0; k < 14; k++) { const a = (k / 14) * 6.283; const rr = 26 + r.range(-4, 4); const x = 32 + Math.cos(a) * rr, y = 32 + Math.sin(a) * rr * 0.95; if (k) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); c.fill(); },
  [DECAL.slow]: (c) => { c.fillStyle = W; c.font = '900 22px Nunito, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.save(); c.translate(32, 32); c.scale(0.8, 1.6); c.fillText('SLOW', 0, 0); c.restore(); },
  [DECAL.skid]: (c, r) => { c.strokeStyle = 'rgba(255,255,255,0.8)'; for (const dx of [-8, 8]) { c.lineWidth = r.range(3, 5); c.beginPath(); c.moveTo(32 + dx, 64); c.quadraticCurveTo(32 + dx + r.range(-8, 8), 32, 32 + dx * 0.5, 0); c.stroke(); } },
  [DECAL.zebra]: (c) => { c.fillStyle = W; c.fillRect(0, 6, C, C - 12); },
  [DECAL.dashes]: (c) => { c.fillStyle = W; c.fillRect(26, 0, 12, C); },
  [DECAL.parkT]: (c) => { c.fillStyle = W; c.fillRect(0, 28, C, 6); c.fillRect(29, 0, 6, 34); },
  [DECAL.ring]: (c) => { c.strokeStyle = W; c.lineWidth = 5; c.beginPath(); c.arc(32, 32, 27, 0, 6.283); c.stroke(); },
  [DECAL.chevrons]: (c) => { c.fillStyle = W; for (let i = -2; i < 4; i++) { c.beginPath(); c.moveTo(i * 22, 64); c.lineTo(i * 22 + 11, 64); c.lineTo(i * 22 + 43, 0); c.lineTo(i * 22 + 32, 0); c.closePath(); c.fill(); } },
  [DECAL.stain]: (c, r) => { for (let k = 0; k < 3; k++) { const g = c.createRadialGradient(0, 0, 0, 0, 0, 22); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.save(); c.translate(32 + r.range(-8, 8), 32 + r.range(-8, 8)); c.fillStyle = g; c.fillRect(-22, -22, 44, 44); c.restore(); } },
  [DECAL.grate]: (c) => { c.fillStyle = W; c.fillRect(4, 4, 56, 56); c.clearRect(8, 8, 48, 48); c.fillStyle = W; for (let i = 0; i < 8; i++) c.fillRect(10 + i * 6, 8, 2.5, 48); },
  [DECAL.scramble]: (c) => { c.fillStyle = W; c.save(); c.translate(32, 32); c.rotate(Math.PI / 4); for (let i = -4; i <= 4; i++) c.fillRect(i * 9 - 2.5, -46, 5, 92); c.restore(); },
  [DECAL.weedA]: (c, r) => tufts(c, r, 30, 0.75),
  [DECAL.weedB]: (c, r) => { tufts(c, r, 14, 0.6); for (let k = 0; k < 18; k++) { c.fillStyle = `rgba(255,255,255,${r.range(0.5, 0.9)})`; c.beginPath(); c.arc(r.range(6, 58), r.range(4, 60), r.range(1.2, 2.4), 0, 6.283); c.fill(); } },
  [DECAL.mossA]: (c, r) => blobs(c, r, 32, 32, 26, 22),
  [DECAL.mossB]: (c, r) => {
    // A moss rim: blobs along the edge of the cell around a clear middle (kerb drains, slab edges).
    for (let k = 0; k < 26; k++) {
      const side = k % 4, t = r.range(4, 60);
      const [x, y] = side === 0 ? [t, r.range(2, 12)] : side === 1 ? [t, r.range(52, 62)] : side === 2 ? [r.range(2, 12), t] : [r.range(52, 62), t];
      soft(c, x!, y!, r.range(4, 8), r.range(0.45, 0.8));
    }
  },
  [DECAL.rootLift]: (c, r) => {
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineCap = 'round';
    for (let b = 0; b < 4; b++) {
      let x = 32 + r.range(-6, 6), y = 60, w = 4 - b * 0.6;
      c.beginPath(); c.moveTo(x, y);
      for (let i = 0; i < 9; i++) { x += r.range(-6, 6) + (b - 1.5) * 1.4; y -= r.range(5, 8); c.lineTo(x, y); }
      c.lineWidth = Math.max(1, w); c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(0, 40, 64, 3);
  },
  [DECAL.flowers]: (c, r) => {
    for (let k = 0; k < 16; k++) {
      const x = r.range(6, 58), y = r.range(6, 58), pr = r.range(1.4, 2.4);
      c.fillStyle = 'rgba(255,255,255,0.95)';
      for (let p = 0; p < 5; p++) { const a = (p / 5) * 6.283; c.beginPath(); c.arc(x + Math.cos(a) * pr, y + Math.sin(a) * pr, pr * 0.8, 0, 6.283); c.fill(); }
    }
  },
  [DECAL.lily]: (c, r) => {
    for (let k = 0; k < 4; k++) {
      const x = 12 + (k % 2) * 34 + r.range(-3, 3), y = 14 + Math.floor(k / 2) * 34 + r.range(-3, 3), pr = r.range(8, 11), a = r.range(0, 6.28);
      c.fillStyle = W; c.beginPath(); c.moveTo(x, y); c.arc(x, y, pr, a + 0.35, a + 6.283 - 0.35); c.closePath(); c.fill();
    }
  },
  [DECAL.lichen]: (c, r) => { for (let k = 0; k < 22; k++) { c.strokeStyle = `rgba(255,255,255,${r.range(0.4, 0.85)})`; c.lineWidth = r.range(1, 2.2); c.beginPath(); c.arc(r.range(6, 58), r.range(6, 58), r.range(2, 6), 0, 6.283); c.stroke(); } },
  [DECAL.rustDrip]: (c, r) => {
    for (let k = 0; k < 7; k++) {
      const x = r.range(6, 58), len = r.range(24, 60), g = c.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(x, 0, r.range(2, 4.5), len);
    }
  },
  [DECAL.grassJoint]: (c, r) => {
    // Grass in paving joints: a 4 × 4 joint grid of thin broken lines with tufts at the crossings.
    c.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 4; i++) for (let k = 0; k < 8; k++) {
      if (r.chance(0.35)) continue;
      c.fillRect(i * 16 + 7, k * 8, 2, 7); c.fillRect(k * 8, i * 16 + 7, 7, 2);
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (r.chance(0.5)) soft(c, i * 16 + 8, j * 16 + 8, r.range(2.5, 4.5), 0.85);
  },
  [DECAL.ripple]: (c) => { for (let k = 0; k < 3; k++) { c.strokeStyle = `rgba(255,255,255,${0.9 - k * 0.25})`; c.lineWidth = 2.4 - k * 0.5; c.beginPath(); c.arc(32, 32, 9 + k * 9, 0, 6.283); c.stroke(); } },
  // A perpendicular bay (Phase B `parking_bay` perp 1): two long sides along v and the back line, open toward the road.
  [DECAL.bayPerp]: (c) => { c.fillStyle = W; c.fillRect(2, 2, 5, 60); c.fillRect(57, 2, 5, 60); c.fillRect(2, 2, 60, 5); },
};
/** Grass tufts: clusters of thin tapered blades over the cell, ragged at its edges (weed strips). */
function tufts(c: CanvasRenderingContext2D, r: Sfc32, n: number, alpha: number): void {
  for (let k = 0; k < n; k++) {
    const x = r.range(4, 60), y = r.range(4, 60), blades = r.int(3, 6);
    for (let b = 0; b < blades; b++) {
      const a = r.range(-1.2, 1.2) - Math.PI / 2, l = r.range(4, 9);
      c.fillStyle = `rgba(255,255,255,${alpha * r.range(0.7, 1)})`;
      c.beginPath(); c.moveTo(x - 1.2, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.lineTo(x + 1.2, y); c.closePath(); c.fill();
    }
  }
}
/** A soft round spot (moss, tufts). */
function soft(c: CanvasRenderingContext2D, x: number, y: number, rad: number, a: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.7, `rgba(255,255,255,${a * 0.8})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}
/** An organic moss patch: overlapping soft blobs with a few clear holes. */
function blobs(c: CanvasRenderingContext2D, r: Sfc32, cx: number, cy: number, rx: number, ry: number): void {
  for (let k = 0; k < 22; k++) { const a = r.range(0, 6.283), d = Math.sqrt(r.float()); soft(c, cx + Math.cos(a) * rx * d * 0.8, cy + Math.sin(a) * ry * d * 0.8, r.range(5, 11), r.range(0.5, 0.85)); }
  c.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 5; k++) soft(c, cx + r.range(-rx, rx) * 0.6, cy + r.range(-ry, ry) * 0.6, r.range(2, 4), 0.9);
  c.globalCompositeOperation = 'source-over';
}
function manhole(c: CanvasRenderingContext2D): void {
  c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(32, 32, 30, 0, 6.283); c.fill();
  c.strokeStyle = W; c.lineWidth = 3; c.beginPath(); c.arc(32, 32, 28, 0, 6.283); c.stroke();
}
function crack(c: CanvasRenderingContext2D, r: Sfc32, branches: number): void {
  c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineCap = 'round';
  for (let b = 0; b < branches; b++) {
    let x = b === 0 ? 4 : r.range(16, 48), y = b === 0 ? 32 : r.range(16, 48);
    c.lineWidth = b === 0 ? 2.2 : 1.2;
    c.beginPath(); c.moveTo(x, y);
    for (let i = 0; i < 7; i++) { x += r.range(4, 9) * (b === 0 ? 1 : r.chance(0.5) ? 1 : -1); y += r.range(-6, 6); c.lineTo(x, y); }
    c.stroke();
  }
}
function arrow(c: CanvasRenderingContext2D, turn: -1 | 0 | 1): void {
  c.fillStyle = W;
  c.fillRect(28, 26, 8, 36);
  c.save(); c.translate(32, 26); if (turn) { c.rotate(turn * -0.8); }
  c.beginPath(); c.moveTo(-14, 6); c.lineTo(0, -22); c.lineTo(14, 6); c.closePath(); c.fill();
  c.restore();
}

/** Draws the 512² atlas (the canvasTexture callback). */
export function drawDecalAtlas(c: CanvasRenderingContext2D): void {
  c.clearRect(0, 0, C * DECAL_GRID, C * DECAL_GRID);
  for (const [id, paint] of Object.entries(P)) {
    const k = Number(id), x = (k % DECAL_GRID) * C, y = Math.floor(k / DECAL_GRID) * C;
    c.save(); c.beginPath(); c.rect(x, y, C, C); c.clip(); c.translate(x, y);
    paint(c, new Sfc32(hash32(0xdeca1, k)));
    c.restore();
  }
}
export const DECAL_ATLAS_SIZE = C * DECAL_GRID;
