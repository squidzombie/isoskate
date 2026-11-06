// world/render/textures/ground.ts: the 512² ground pattern atlas (TECH §8.4 "ground 512²"): 4 × 4 cells of 128 px,
// each a seamless 4 m × 4 m tile (32 px/m) stored as LINEAR data centred on mid-grey: the lit material multiplies the
// vertex colour by 2 × texel (materials.ts), so 128 = the surface colour unchanged. The material picks the cell from
// fx.x (PAT values are cell + 1) and projects by the face normal (top faces xz, walls along their plane).
import { Sfc32, hash32 } from '../../../core/rng';

export const PAT = {
  none: 0, asphalt: 1, wet: 2, slabs: 3, tile: 4, pavers: 5, planks: 6, plate: 7, grass: 8, apron: 9, brick: 10,
  soil: 11, gravel: 12, wallTile: 13, ribsV: 14, brickWall: 15, ribsH: 16,
} as const;
export type PatternId = (typeof PAT)[keyof typeof PAT];

const CELL = 128, PX = CELL / 4;    // 32 px per metre

type Painter = (c: CanvasRenderingContext2D, r: Sfc32) => void;
const g = (v: number) => { const k = Math.max(0, Math.min(255, Math.round(128 + v))); return `rgb(${k},${k},${k})`; };
const grey = (c: CanvasRenderingContext2D, v: number) => { c.fillStyle = g(v); };

function noise(c: CanvasRenderingContext2D, r: Sfc32, n: number, amp: number, size: [number, number] = [1, 2]): void {
  for (let i = 0; i < n; i++) {
    grey(c, r.range(-amp, amp));
    const s = r.range(size[0], size[1]);
    c.fillRect(r.range(0, CELL), r.range(0, CELL), s, s);
  }
}
/** Seamless: every mark is drawn again shifted by ±CELL so it wraps (the cell is clipped). */
function wrapped(c: CanvasRenderingContext2D, f: () => void): void {
  for (const dx of [-CELL, 0, CELL]) for (const dy of [-CELL, 0, CELL]) { c.save(); c.translate(dx, dy); f(); c.restore(); }
}

const PAINTERS: Readonly<Record<Exclude<PatternId, 0>, Painter>> = {
  [PAT.asphalt]: (c, r) => {
    // Fine aggregate grain and a few soft low-frequency patches (no repeating cracks: cracks are decals).
    for (let i = 0; i < 6; i++) {
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, 40);
      const v = r.range(-7, 6);
      gr.addColorStop(0, g(v)); gr.addColorStop(1, g(0));
      const x = r.range(0, CELL), y = r.range(0, CELL);
      wrapped(c, () => { c.save(); c.translate(x, y); c.scale(1, r.range(0.6, 1.4)); c.fillStyle = gr; c.fillRect(-40, -40, 80, 80); c.restore(); });
    }
    noise(c, r, 2600, 12); noise(c, r, 160, -22, [1, 2.5]); noise(c, r, 90, 20, [1, 2]);
  },
  [PAT.wet]: (c, r) => {
    noise(c, r, 2000, 16);
    // Wet sheen: soft vertical streaks (lit material: brighter than the base).
    for (let i = 0; i < 26; i++) {
      const x = r.range(0, CELL), w = r.range(1, 4), y = r.range(0, CELL), h = r.range(10, 40), v = r.range(10, 34);
      const gr = c.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, g(0)); gr.addColorStop(0.5, g(v)); gr.addColorStop(1, g(0));
      wrapped(c, () => { c.fillStyle = gr; c.fillRect(x, y, w, h); });
    }
  },
  [PAT.slabs]: (c, r) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { grey(c, r.range(-7, 7)); c.fillRect(i * PX, j * PX, PX, PX); }
    noise(c, r, 900, 10);
    grey(c, -34);
    for (let i = 0; i < 4; i++) { c.fillRect(i * PX, 0, 1.5, CELL); c.fillRect(0, i * PX, CELL, 1.5); }
    grey(c, 14);
    for (let i = 0; i < 4; i++) { c.fillRect(i * PX + 1.5, 0, 1, CELL); c.fillRect(0, i * PX + 1.5, CELL, 1); }
  },
  [PAT.tile]: (c, r) => {
    const t = PX / 2;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { grey(c, ((i + j) % 2 ? 6 : -6) + r.range(-4, 4)); c.fillRect(i * t, j * t, t, t); }
    grey(c, -30);
    for (let i = 0; i < 8; i++) { c.fillRect(i * t, 0, 1, CELL); c.fillRect(0, i * t, CELL, 1); }
    noise(c, r, 500, 6);
  },
  [PAT.pavers]: (c, r) => {
    const h = PX / 2;
    for (let j = 0; j < 8; j++) {
      const off = j % 2 ? PX / 2 : 0;
      for (let i = -1; i < 4; i++) { grey(c, r.range(-10, 10)); c.fillRect(i * PX + off, j * h, PX, h); }
    }
    noise(c, r, 1600, 12);
    grey(c, -34);
    for (let j = 0; j < 8; j++) {
      c.fillRect(0, j * h, CELL, 1.2);
      const off = j % 2 ? PX / 2 : 0;
      for (let i = 0; i <= 4; i++) c.fillRect(i * PX + off - 0.6, j * h, 1.2, h);
    }
  },
  [PAT.planks]: (c, r) => {
    const w = PX * 0.2;
    for (let i = 0; i < CELL / w; i++) {
      grey(c, r.range(-14, 10)); c.fillRect(i * w, 0, w, CELL);
      c.strokeStyle = g(-18); c.lineWidth = 0.6;
      for (let k = 0; k < 3; k++) { c.beginPath(); const x = i * w + r.range(1, w - 1); c.moveTo(x, 0); c.bezierCurveTo(x + 1.5, 40, x - 1.5, 80, x, CELL); c.stroke(); }
      grey(c, -46); c.fillRect(i * w, 0, 0.8, CELL);
    }
  },
  [PAT.plate]: (c, r) => {
    noise(c, r, 800, 8);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
      const x = i * 8 + (j % 2) * 4, y = j * 8;
      grey(c, 22); c.fillRect(x, y, 3, 1.2); grey(c, -18); c.fillRect(x, y + 1.2, 3, 0.8);
    }
  },
  [PAT.grass]: (c, r) => {
    for (let i = 0; i < 12; i++) {
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, 30);
      const v = r.range(-14, 12);
      gr.addColorStop(0, g(v)); gr.addColorStop(1, g(0));
      const x = r.range(0, CELL), y = r.range(0, CELL);
      wrapped(c, () => { c.save(); c.translate(x, y); c.fillStyle = gr; c.fillRect(-30, -30, 60, 60); c.restore(); });
    }
    for (let i = 0; i < 2600; i++) { grey(c, r.range(-26, 22)); c.fillRect(r.range(0, CELL), r.range(0, CELL), 1, r.range(1.5, 3.5)); }
  },
  [PAT.apron]: (c, r) => {
    noise(c, r, 1600, 12); noise(c, r, 60, -20, [2, 5]);
    grey(c, -36); c.fillRect(0, 0, 1.6, CELL); c.fillRect(0, 0, CELL, 1.6);
    for (let i = 0; i < 3; i++) {
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, 14);
      gr.addColorStop(0, g(-22)); gr.addColorStop(1, g(0));
      const x = r.range(10, CELL - 10), y = r.range(10, CELL - 10);
      c.save(); c.translate(x, y); c.scale(1, r.range(0.5, 1.4)); c.fillStyle = gr; c.fillRect(-14, -14, 28, 28); c.restore();
    }
  },
  [PAT.brick]: (c, r) => {
    const bw = PX / 4, bh = PX / 8;
    for (let j = 0; j < CELL / bh; j++) for (let i = -1; i < CELL / bw + 1; i++) {
      grey(c, r.range(-16, 12)); c.fillRect(i * bw + (j % 2) * bw / 2, j * bh, bw, bh);
    }
    grey(c, -40);
    for (let j = 0; j < CELL / bh; j++) {
      c.fillRect(0, j * bh, CELL, 0.8);
      for (let i = -1; i <= CELL / bw; i++) c.fillRect(i * bw + (j % 2) * bw / 2, j * bh, 0.8, bh);
    }
  },
  [PAT.soil]: (c, r) => { noise(c, r, 3200, 28, [1, 3]); noise(c, r, 120, 34, [1, 2]); },
  [PAT.gravel]: (c, r) => { for (let i = 0; i < 1400; i++) { grey(c, r.range(-30, 26)); const s = r.range(1.5, 3.5); c.fillRect(r.range(0, CELL), r.range(0, CELL), s, s * 0.8); } },
  [PAT.wallTile]: (c, r) => {
    const t = PX * 0.25;
    for (let i = 0; i < CELL / t; i++) for (let j = 0; j < CELL / t; j++) { grey(c, 10 + r.range(-5, 5)); c.fillRect(i * t, j * t, t, t); }
    grey(c, -26);
    for (let i = 0; i < CELL / t; i++) { c.fillRect(i * t, 0, 0.8, CELL); c.fillRect(0, i * t, CELL, 0.8); }
  },
  [PAT.ribsV]: (c, r) => {
    noise(c, r, 500, 6);
    for (let i = 0; i < CELL / (PX * 0.25); i++) {
      const x = i * PX * 0.25;
      grey(c, 18); c.fillRect(x, 0, 2, CELL); grey(c, -22); c.fillRect(x + 3.5, 0, 2.5, CELL);
    }
  },
  [PAT.brickWall]: (c, r) => PAINTERS[PAT.brick](c, r),
  [PAT.ribsH]: (c, r) => {
    noise(c, r, 400, 5);
    for (let j = 0; j < CELL / (PX * 0.16); j++) { const y = j * PX * 0.16; grey(c, 16); c.fillRect(0, y, CELL, 1.4); grey(c, -18); c.fillRect(0, y + 2.4, CELL, 1.4); }
  },
};

/** Draws the 512² atlas (the canvasTexture callback). Deterministic. */
export function drawGroundAtlas(c: CanvasRenderingContext2D): void {
  c.fillStyle = g(0); c.fillRect(0, 0, CELL * 4, CELL * 4);
  for (const [id, paint] of Object.entries(PAINTERS)) {
    const cell = Number(id) - 1, x = (cell % 4) * CELL, y = Math.floor(cell / 4) * CELL;
    c.save();
    c.beginPath(); c.rect(x, y, CELL, CELL); c.clip();
    c.translate(x, y);
    paint(c, new Sfc32(hash32(0x6e0d, Number(id))));
    c.restore();
  }
}
export const GROUND_ATLAS_SIZE = CELL * 4;
