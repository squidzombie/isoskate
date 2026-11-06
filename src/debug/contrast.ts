// debug/contrast.ts: the DESIGN §18.4 readability gate measured on the rendered frame (`__skate.contrast()`,
// `shots --contrast`). Everything is located with the live camera (CameraRig.project) and read back from the canvas:
//   - hazard: every `crash`-top solid fully in view below the HUD band (one being scrolled in at the top edge is
//     measured once it is whole). Its silhouette (convex hull of the projected box, minus nearer solids and the
//     skater) vs the ground ring around it (the hull dilated by RING_PX, minus every solid): mean relative luminance,
//     contrast ratio (L1 + 0.05) / (L2 + 0.05). Gate ≥ 2.5:1.
//   - edge: every visible grind edge. At 5 points along it, a patch across the projected edge (5 px along it): the
//     cream stripe is the run of offsets around the brightest one that stays above halfway to the surface, the ink
//     underline the same around the darkest (a run that fills the search window to its end is a surface, not a
//     stripe, and counts as no stripe); each stripe's value is the median of all its pixels (not one extreme
//     pixel), each side's surface the median of the pixels beside it. Against each side the better of the two
//     stripes counts (DESIGN: "at least one of its two stripes"), and an edge on a border between two surfaces
//     (a bench top over the road) reads only as well as its weaker side. The search width comes from CAMERA.minEdgePx and EDGE_SEARCH_M, not from any
//     renderer, so the gate measures whatever world/render draws. Gate ≥ 1.8:1.
// The skater and the coins in view are excluded from every measurement. NaN means nothing of that class was in view.
import { Box3, Vector3 } from 'three';
import type { V3 } from '../core/math';
import { CAMERA } from '../core/tuning';
import type { DebugHost } from './api';

export const CONTRAST_GATE = { hazard: 2.5, edge: 1.8 } as const;
/** Width of the "ground around it" ring, CSS px. */
export const RING_PX = 8;
/** Half-width across a grind edge within which its stripes are looked for, m (at least 1.5 × minEdgePx on screen);
 *  the surface is read in the 6 px beyond it. */
export const EDGE_SEARCH_M = 0.1;
/** Patch length along the edge at each sample point, device px (odd). */
const ALONG_PX = 5;

import type { ContrastItem, ContrastReport } from '../core/debug';
export type { ContrastItem, ContrastReport };

const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const relLum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const ratioOf = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

type P = [number, number];
function hull(pts: P[]): P[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P[] = [], upper: P[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]!; while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
/** Convex hull dilated by r (Minkowski sum with an octagon). */
function dilate(poly: readonly P[], r: number): P[] {
  const pts: P[] = [];
  for (const [x, y] of poly) for (let k = 0; k < 8; k++) pts.push([x + r * Math.cos((k * Math.PI) / 4), y + r * Math.sin((k * Math.PI) / 4)]);
  return hull(pts);
}
function inside(poly: readonly P[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1] || 1e-9) + a[0]) c = !c;
  }
  return c;
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : NaN; };

/** Renders the current frame and measures it. Call in manual mode (`__skate.manual(true)`) for a stable frame. */
export function measureContrast(host: DebugHost): ContrastReport {
  host.loop.renderNow();
  const canvas = host.gfx.renderer.domElement;
  const W = canvas.width, H = canvas.height;
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const x2 = c2.getContext('2d', { willReadFrequently: true });
  if (!x2 || W < 2 || H < 2) return { hazard: NaN, edge: NaN, worst: null, items: [] };
  x2.drawImage(canvas, 0, 0);                     // same task as the render: the drawing buffer is still valid
  const data = x2.getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H);
  for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = relLum(data[j]!, data[j + 1]!, data[j + 2]!);

  const vp = readCss(host);
  const sx = W / vp.w, sy = H / vp.h;
  const proj = (p: V3): P => { const q = host.cameraRig.project(p); return [q.x * sx, q.y * sy]; };
  const hudBottom = Math.ceil((vp.safeTop + 56) * sy);
  const sim = host.sim(), cur = sim.cur;
  const s = cur.p.s;
  const ahead = Math.max(20, host.camera().lookAheadSec * Math.max(1, cur.vel.s) + 8);

  // The skater's screen rectangle (excluded from every measurement).
  const box = new Box3().setFromObject(host.skater.object3d);
  let sk: [number, number, number, number] | null = null;
  if (!box.isEmpty()) {
    const cam = host.cameraRig.camera, v = new Vector3();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
      const px = ((v.x + 1) / 2) * W, py = ((1 - v.y) / 2) * H;
      x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
    }
    sk = [x0 - 2, y0 - 2, x1 + 2, y1 + 2];
  }
  const inSkater = (x: number, y: number) => !!sk && x >= sk[0] && x <= sk[2] && y >= sk[1] && y <= sk[3];
  // Coins in view (pickups drawn over ledges and rails): their discs are excluded like the skater.
  // Radius: the coin's world size (≈ 0.16 m) or the CAMERA.minCoinPx floor, plus 3 px of antialiasing.
  const coins: [number, number, number][] = [];
  for (const c of host.sim().world.coins(cur.p.s - 2, cur.p.s + 60)) {
    const a = proj(c.p), b = proj({ ...c.p, x: c.p.x + 0.16 });
    coins.push([a[0], a[1], Math.max((CAMERA.minCoinPx / 2) * sx, Math.hypot(b[0] - a[0], b[1] - a[1])) + 3 * sx]);
  }
  const inCoin = (x: number, y: number) => {
    for (const c of coins) if ((x - c[0]) ** 2 + (y - c[1]) ** 2 <= c[2] * c[2]) return true;
    return false;
  };
  const usable = (x: number, y: number) => x >= 0 && y >= hudBottom && x < W && y < H && !inSkater(x, y) && !inCoin(x, y);

  const obs = sim.world.obstacles(s - 2, s + ahead);
  interface Shape { poly: P[]; s0: number; y1: number; top: string; kind: string; id: number; bb: [number, number, number, number] }
  const shapes: Shape[] = [];
  for (const o of obs) {
    for (const so of o.solids) {
      const b = so.box;
      const pts: P[] = [];
      for (let i = 0; i < 8; i++) pts.push(proj({ s: i & 4 ? b.s1 : b.s0, x: i & 1 ? b.x1 : b.x0, y: i & 2 ? b.y1 : b.y0 }));
      const poly = hull(pts);
      const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
      shapes.push({ poly, s0: b.s0, y1: b.y1, top: so.top, kind: o.kind, id: o.id, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    }
  }
  const items: ContrastItem[] = [];

  const ringPx = RING_PX * sx;
  for (const h of shapes) {
    if (h.top !== 'crash') continue;
    const [bx0, by0, bx1, by1] = h.bb;
    if (bx0 < 0 || by0 < hudBottom || bx1 > W || by1 > H) continue;          // not (yet) fully in view
    const pad = ringPx + 1;
    const ring = dilate(h.poly, ringPx);
    const nearer = shapes.filter((o) => o !== h && o.s0 < h.s0 - 1e-6 && o.bb[0] < bx1 && o.bb[2] > bx0 && o.bb[1] < by1 && o.bb[3] > by0);
    const others = shapes.filter((o) => o.bb[0] < bx1 + pad && o.bb[2] > bx0 - pad && o.bb[1] < by1 + pad && o.bb[3] > by0 - pad);
    let fg = 0, nf = 0, bg = 0, nb = 0;
    const step = Math.max(1, Math.floor(Math.sqrt(((bx1 - bx0 + 2 * pad) * (by1 - by0 + 2 * pad)) / 8000)));
    for (let y = Math.max(hudBottom, Math.floor(by0 - pad)); y < Math.min(H, by1 + pad); y += step) {
      for (let x = Math.max(0, Math.floor(bx0 - pad)); x < Math.min(W, bx1 + pad); x += step) {
        if (!usable(x, y)) continue;
        const l = L[y * W + x]!, px = x + 0.5, py = y + 0.5;
        if (inside(h.poly, px, py)) {
          if (!nearer.some((o) => inside(o.poly, px, py))) { fg += l; nf++; }
        } else if (inside(ring, px, py) && !others.some((o) => inside(o.poly, px, py))) { bg += l; nb++; }
      }
    }
    if (nf < 12 || nb < 12) continue;
    fg /= nf; bg /= nb;
    items.push({ cls: 'hazard', kind: h.kind, id: h.id, ratio: ratioOf(fg, bg), fg, bg, px: nf * step * step,
      at: { x0: bx0 / sx, y0: by0 / sy, x1: bx1 / sx, y1: by1 / sy } });
  }

  // Edges: luminance patches across the projected edge.
  const pick = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    return usable(xi, yi) ? L[yi * W + xi]! : NaN;
  };
  const halfAlong = (ALONG_PX - 1) / 2;
  for (const o of obs) {
    for (const e of o.edges) {
      const rs: number[] = [], fgs: number[] = [], bgs: number[] = [];
      let ax0 = Infinity, ay0 = Infinity, ax1 = -Infinity, ay1 = -Infinity;
      const span = Math.max(1e-6, e.b.s - e.a.s);
      const at = (u: number): V3 => ({ s: e.a.s + (e.b.s - e.a.s) * u, x: e.a.x + (e.b.x - e.a.x) * u, y: e.a.y + (e.b.y - e.a.y) * u });
      for (const u of [0.15, 0.32, 0.5, 0.68, 0.85]) {
        const p = at(u);
        if (p.s < s + 1 || p.s > s + ahead) continue;
        const c = proj(p), q = proj({ ...p, x: p.x + 1 }), t2 = proj(at(Math.min(1, u + 0.5 / span)));
        // Hidden behind a nearer, taller solid of another obstacle (a parked car in front of a curb): not visible.
        if (shapes.some((o) => o.id !== e.obstacleId && o.s0 < p.s - 0.01 && o.y1 > p.y + 0.02 && inside(o.poly, c[0], c[1]))) continue;
        let nx = q[0] - c[0], ny = q[1] - c[1];
        const pxPerM = Math.hypot(nx, ny);
        let tx = t2[0] - c[0], ty = t2[1] - c[1];
        const tl = Math.hypot(tx, ty);
        if (pxPerM < 1e-6 || tl < 1e-6) continue;
        nx /= pxPerM; ny /= pxPerM; tx /= tl; ty /= tl;
        const reach = Math.max(2, Math.ceil(Math.max(EDGE_SEARCH_M * pxPerM, 1.5 * CAMERA.minEdgePx * sx)) + 1);
        // patch[d][a]: offset d across (−reach−6 … reach+6), a along; col[d] = the along-median at that offset.
        const n = 2 * (reach + 6) + 1, mid = reach + 6;
        const patch: number[][] = [], col: number[] = [];
        for (let i = 0; i < n; i++) {
          const d = i - mid, row: number[] = [];
          for (let a = -halfAlong; a <= halfAlong; a++) {
            const l = pick(c[0] + nx * d + tx * a, c[1] + ny * d + ty * a);
            if (Number.isFinite(l)) row.push(l);
          }
          patch.push(row);
          col.push(row.length > halfAlong ? median(row) : NaN);
        }
        // The surface on each side (an edge on a border, e.g. a bench top over the road, has two different ones).
        const sides = [patch.slice(0, 4).flat(), patch.slice(n - 4).flat()].filter((v) => v.length >= 2 * ALONG_PX).map(median);
        if (!sides.length) continue;
        let valid = 0;
        for (let i = mid - reach; i <= mid + reach; i++) if (Number.isFinite(col[i]!)) valid++;
        if (valid < 0.8 * (2 * reach + 1)) continue;          // the stripes are mostly hidden here (coin, skater, HUD)
        // A stripe: the contiguous offsets around an extreme that stay past halfway to the nearest surface value (the
        // brighter surface for the cream, the darker one for the ink), so a run never spills onto a surface. A run that
        // reaches the end of the search window is a surface (the far side of a border), not a stripe: the next most
        // extreme offset outside it is tried (a neighbouring edge's stripe can sit inside the window too).
        const light = Math.max(...sides), dark = Math.min(...sides);
        const stripe = (brighter: boolean) => {
          const used = new Set<number>();
          for (let tries = 0; tries < 4; tries++) {
            let k = -1;
            for (let i = mid - reach; i <= mid + reach; i++) {
              if (used.has(i) || !Number.isFinite(col[i]!)) continue;
              if (k < 0 || (brighter ? col[i]! > col[k]! : col[i]! < col[k]!)) k = i;
            }
            if (k < 0) return NaN;
            const half = (col[k]! + (brighter ? light : dark)) / 2;
            const keep = (v: number) => Number.isFinite(v) && (brighter ? v >= half : v <= half);
            let a = k, b = k;
            while (a - 1 >= mid - reach && keep(col[a - 1]!)) a--;
            while (b + 1 <= mid + reach && keep(col[b + 1]!)) b++;
            if (a > mid - reach && b < mid + reach) return median(patch.slice(a, b + 1).flat());
            for (let i = a; i <= b; i++) used.add(i);
          }
          return NaN;
        };
        const cream = stripe(true), ink = stripe(false);
        // Against each side, the better of the two stripes; the edge reads as well as its weaker side.
        const rat = (v: number, sf: number) => (Number.isFinite(v) ? ratioOf(v, sf) : 1);
        let r = Infinity, fg = cream, bg = sides[0]!;
        for (const sf of sides) {
          const rc = rat(cream, sf), ri = rat(ink, sf), best = Math.max(rc, ri);
          if (best < r) { r = best; fg = rc >= ri ? cream : ink; bg = sf; }
        }
        rs.push(r); fgs.push(Number.isFinite(fg) ? fg : bg); bgs.push(bg);
        ax0 = Math.min(ax0, c[0]); ay0 = Math.min(ay0, c[1]); ax1 = Math.max(ax1, c[0]); ay1 = Math.max(ay1, c[1]);
      }
      if (rs.length < 2) continue;
      items.push({ cls: 'edge', kind: `${o.kind}:${e.kind}`, id: e.id, ratio: median(rs), fg: median(fgs), bg: median(bgs), px: rs.length,
        at: { x0: ax0 / sx, y0: ay0 / sy, x1: ax1 / sx, y1: ay1 / sy } });
    }
  }

  const min = (cls: ContrastItem['cls']) => { const v = items.filter((i) => i.cls === cls).map((i) => i.ratio); return v.length ? Math.min(...v) : NaN; };
  let worst: ContrastReport['worst'] = null, worstRel = Infinity;
  for (const it of items) {
    const rel = it.ratio / CONTRAST_GATE[it.cls];
    if (rel < worstRel) { worstRel = rel; worst = { kind: `${it.cls}:${it.kind}`, ratio: it.ratio }; }
  }
  return { hazard: min('hazard'), edge: min('edge'), worst, items };
}

/** CSS viewport size and the top safe area (as the camera sees it). */
function readCss(host: DebugHost): { w: number; h: number; safeTop: number } {
  const canvas = host.gfx.renderer.domElement;
  const r = host.gfx.renderer.getPixelRatio() || 1;
  const probe = document.getElementById('safe-probe');
  const safeTop = probe ? parseFloat(getComputedStyle(probe).paddingTop) || 0 : 0;
  return { w: canvas.width / r, h: canvas.height / r, safeTop };
}
