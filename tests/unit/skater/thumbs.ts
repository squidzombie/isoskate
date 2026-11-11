// tests/unit/skater/thumbs.ts: the Shop / Locker board card art (drawBoardThumb) for all 16 boards, portrait and
// landscape cards, on paper (driven by sheet.mjs: artifacts/sheets/thumbs.png).
import { CATALOG } from '../../../src/content';
import type { BoardLook } from '../../../src/core/cosmetics';
import { drawBoardThumb } from '../../../src/skater';

const boards = CATALOG.filter((c) => c.slot === 'board');
const cw = 90, ch = 250, lw = 250, lh = 80, cols = 8;
const W = Math.max(cols * cw, 3 * lw), H = 2 * ch + Math.ceil(boards.length / 3) * lh + 20;
const cv = document.getElementById('c') as HTMLCanvasElement;
cv.width = W; cv.height = H;
const c = cv.getContext('2d')!;
c.fillStyle = '#fff4e3'; c.fillRect(0, 0, W, H);
c.font = '700 10px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#2b2140';
boards.forEach((b, i) => {
  const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
  c.strokeStyle = '#c9c2b8'; c.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
  drawBoardThumb(c, b.look as BoardLook, x + 6, y + 6, cw - 12, ch - 28);
  c.fillStyle = '#2b2140'; c.fillText(b.name, x + cw / 2, y + ch - 10);
});
boards.forEach((b, i) => {
  const x = (i % 3) * lw, y = 2 * ch + Math.floor(i / 3) * lh;
  drawBoardThumb(c, b.look as BoardLook, x + 4, y + 4, lw - 8, lh - 8);
});
(window as unknown as { __sheet: object }).__sheet = { done: true, width: W, height: H, maxCalls: 0, maxTris: 0,
  switchMs: { first: 0, again: 0, p50: 0, p95: 0 } };
