// world/gen/rows.ts: anti-straight rows (DESIGN §10.7, the straight-bot guarantees of §10.11). A row is a line of the
// area's tall props across the corridor at one s, with 1–2 openings. Its *lanes* are the board-centre x ranges a
// straight roller passes it through (the openings, and any side gap a template obstacle beside it leaves). Each row's
// lanes are disjoint from the previous row's, so no straight lane passes two consecutive rows; the generator keeps
// consecutive rows ≤ GEN.gate.gap apart and every second row ≤ GEN.gate.window after the one two before, so a straight
// lane dies within that window. Rows are drawn from a mixed palette of the area kit (kiosks, café sets, bins and news
// boxes downtown; bin pairs and mailboxes in the Suburbs; drum skids and tall pallets in the Docks; vending banks,
// food carts and lantern stands in Neon), so they read as street furniture, not a fence.
import { round1cm } from '../../core/math';
import { FACE_INSET, HITBOX, STEP_UP } from '../../core/tuning';
import type { Obstacle } from '../../core/world';
import { ObTag } from '../../core/world';
import type { Sfc32 } from '../../core/rng';
import { GEN, type Tier } from './gen.config';
import { buildTall, type PropCtx } from './props/common';
import { LIP } from './props/street';
import type { AreaId } from '../../core/ids';
import type { PropKind } from '../../core/ids';

export type Lanes = readonly (readonly [number, number])[];

/** Board-centre margin inside an opening between two blockers (half hitbox minus their crash-face inset). */
export const PASS_IN = HITBOX.w / 2 - FACE_INSET;
/** The board-centre range scanned for lanes (soft walls hold the centre inside ±4.3; a little extra for safety). */
const LANE_X = 4.45, LANE_STEP = 0.02;
/** The s depth over which a row's front band is scanned for blocking solids. */
const ROW_BAND = 0.3;

/** The lanes (board-centre x range) a straight roller passes an opening of width w centred at x through. */
export const openingLanes = (x: number, w: number): [number, number] => [x - w / 2 + PASS_IN, x + w / 2 - PASS_IN];

/** Are lane sets a and b disjoint, `pad` apart? */
export function lanesApart(a: Lanes, b: Lanes, pad: number = GEN.gate.apartPad): boolean {
  for (const [p0, p1] of a) for (const [q0, q1] of b) if (p0 < q1 + pad && p1 > q0 - pad) return false;
  return true;
}

/** The lanes a straight roller passes the band [sr, sr + 0.3] through: x where its hitbox meets no solid it cannot
 *  roll over (crash tops, landable tops > STEP_UP above their base; knock tops are knocked over). */
export function rowLanes(sr: number, obstacles: readonly Obstacle[]): [number, number][] {
  const spans: [number, number][] = [];
  for (const o of obstacles) {
    if (o.s > sr + ROW_BAND + 1 || o.s + o.len < sr - 1) continue;
    for (const so of o.solids) {
      const b = so.box;
      if (b.s0 >= sr + ROW_BAND || b.s1 <= sr || so.top === 'knock') continue;
      if (so.top === 'landable' && b.y1 - b.y0 <= STEP_UP + 1e-6) continue;
      const ix = Math.min(FACE_INSET, (b.x1 - b.x0) / 4);
      spans.push([b.x0 + ix - HITBOX.w / 2, b.x1 - ix + HITBOX.w / 2]);
    }
  }
  const out: [number, number][] = [];
  let lo: number | null = null;
  const n = Math.round((2 * LANE_X) / LANE_STEP);
  for (let k = 0; k <= n; k++) {
    const x = -LANE_X + k * LANE_STEP;
    const free = !spans.some(([a, b]) => x > a && x < b);
    if (free && lo === null) lo = x;
    if ((!free || k === n) && lo !== null) { out.push([round1cm(lo), round1cm(free ? x : x - LANE_STEP)]); lo = null; }
  }
  return out;
}

interface RowPiece { kind: PropKind; len: number; wid: number; hgt: number; w8: number; params?: Record<string, number> }

/** The tall kit a row is built from, per area (DESIGN §10.3 sizes; long axis along s). */
export function rowPalette(a: AreaId): RowPiece[] {
  switch (a) {
    case 'downtown': return [
      { kind: 'news_box', len: 0.5, wid: 0.5, hgt: 1.15, w8: 2 }, { kind: 'trash_can', len: 0.6, wid: 0.6, hgt: 1.15, w8: 3 },
      { kind: 'cafe_set', len: 1.2, wid: 1.2, hgt: 1.2, w8: 2, params: { canopyY: 2.2 } }, { kind: 'kiosk', len: 1.6, wid: 1.6, hgt: 2.4, w8: 1 }];
    case 'suburbs': return [
      { kind: 'mailbox', len: 0.4, wid: 0.4, hgt: 1.2, w8: 1 }, { kind: 'wheelie_bins', len: 0.7, wid: 1.5, hgt: 1.2, w8: 4 }];
    case 'docks': return [
      { kind: 'pallet_tall', len: 1.2, wid: 1.0, hgt: 1.2, w8: 2 },
      { kind: 'drum_cluster', len: 0.7, wid: 1.3, hgt: 1.15, w8: 2, params: { drums: 2 } },
      { kind: 'drum_cluster', len: 0.7, wid: 1.95, hgt: 1.15, w8: 2, params: { drums: 3 } }];
    case 'neon': return [
      { kind: 'lantern_stand', len: 0.4, wid: 0.4, hgt: 1.6, w8: 1 }, { kind: 'vending_bank', len: 0.8, wid: 1.0, hgt: 1.8, w8: 2, params: { machines: 1 } },
      { kind: 'vending_bank', len: 0.8, wid: 2.0, hgt: 1.8, w8: 2, params: { machines: 2 } }, { kind: 'food_cart', len: 2.0, wid: 1.2, hgt: 2.2, w8: 1 }];
  }
}

/** A Docks row ends this far left of the lip. */
const LIP_CLEAR = 0.05;
/** Pieces 0.05–0.14 m apart (with the 0.08 m insets a gap stays < the 0.40 m hitbox), filling [r0, r1] exactly. */
const GAP_MIN = 0.05, GAP_MAX = 0.14;

/** A row across the corridor at sRow except the openings (width w) and the spans of `keepOut` (template obstacles
 *  beside it, kept GEN.gate.keepPad clear): mixed pieces of the area kit, filling each run edge to edge. */
export function gateRow(sRow: number, centres: readonly number[], w: number, props: PropCtx, rng: Sfc32,
  keepOut: readonly (readonly [number, number])[] = []): Obstacle[] {
  const out: Obstacle[] = [];
  const pad = GEN.gate.keepPad;
  const open = [...centres.map((x) => [x - w / 2, x + w / 2] as [number, number]), ...keepOut.map(([a, b]) => [a - pad, b + pad] as [number, number])]
    .sort((a, b) => a[0] - b[0]);
  const pal = rowPalette(props.area);
  const minW = Math.min(...pal.map((p) => p.wid));
  // (in the Docks the row stops at the lip: its body blocks a straight roller there)
  const xEnd = props.area === 'docks' ? LIP.x0 - LIP_CLEAR : 4.5;
  let a = -4.5;
  const runs: [number, number][] = [];
  for (const [o0, o1] of open) { if (o0 > a) runs.push([a, Math.min(o0, xEnd)]); a = Math.max(a, o1); }
  if (a < xEnd) runs.push([a, xEnd]);
  let variant = 0;
  for (const [r0, r1] of runs) {
    const L = r1 - r0;
    if (L < 0.25) continue;
    const pieces = fillRun(L, pal, minW, rng);
    const total = pieces.reduce((s, p) => s + p.wid, 0);
    const gap = pieces.length > 1 ? (L - total) / (pieces.length - 1) : 0;
    // (a run narrower than its piece: the piece keeps flush with the corridor edge or the lip, else centred)
    const one = pieces.length === 1 ? pieces[0]!.wid : 0;
    let x = !one ? r0 : r1 >= xEnd - 1e-6 && one > L ? r1 - one : r0 <= -4.5 + 1e-6 && one > L ? r0 : (r0 + r1) / 2 - one / 2;
    for (const p of pieces) {
      const ob = buildTall(p.kind, sRow, round1cm(x + p.wid / 2), p.len, p.wid, p.hgt, props,
        { variant: variant++ % 3, tags: ObTag.Filler, ...(p.params ? { params: p.params } : {}) });
      out.push(ob);
      x += p.wid + gap;
    }
  }
  return out;
}

/** Pieces whose widths plus GAP_MIN–GAP_MAX gaps fill L (one piece centred when L is below every width). */
function fillRun(L: number, pal: readonly RowPiece[], minW: number, rng: Sfc32): RowPiece[] {
  const narrow = pal.reduce((m, p) => (p.wid < m.wid ? p : m));
  if (L <= minW + 1e-6) return [narrow];
  for (let attempt = 0; attempt < 4; attempt++) {
    const out: RowPiece[] = [];
    let used = 0;
    for (;;) {
      const room = L - used - (out.length ? GAP_MIN : 0);
      const fit = pal.filter((p) => p.wid <= room + 1e-6);
      if (!fit.length) break;
      const p = rng.weighted(fit.map((q) => [q, q.w8] as const));
      used += p.wid + (out.length ? GAP_MIN : 0);
      out.push(p);
    }
    const total = out.reduce((s, p) => s + p.wid, 0);
    const gap = out.length > 1 ? (L - total) / (out.length - 1) : L - total;
    if (out.length > 1 && gap <= GAP_MAX + 1e-6) return out;
    if (out.length === 1 && L - total <= 2 * GAP_MAX) return out;
  }
  // Uniform narrow pieces (always closes the run).
  const n = Math.max(1, Math.ceil((L - narrow.wid) / (narrow.wid + GAP_MAX)) + 1);
  return Array.from({ length: n }, () => narrow);
}

/** Opening centres for a row that forces a move (A2 + straight-bot rule): within ±maxC, 2.8–4.0 m from the line's
 *  x0, lanes disjoint from the last row's lanes, clear of `keepOut`; an optional second opening. Relaxed in steps
 *  when nothing fits (the lanes rule never is). */
export function gateOpenings(rng: Sfc32, x0: number, last: Lanes, tier: Tier,
  keepOut: readonly (readonly [number, number])[] = []): number[] | null {
  const w = GEN.gate.width[tier];
  const clear = (x: number) => !keepOut.some(([a, b]) => x + w / 2 > a - GEN.gate.keepPad && x - w / 2 < b + GEN.gate.keepPad);
  const far = (x: number) => lanesApart([openingLanes(x, w)], last) && clear(x);
  const cand: number[] = [];
  const scan = (ok: (x: number) => boolean) => { if (!cand.length) for (let i = 0; i <= 66; i++) { const x = round1cm(-GEN.gate.maxC + i * 0.1); if (ok(x)) cand.push(x); } };
  // Prefer a real move (A2) the myopic player can still make, then no move at all (the line already left the last
  // lanes), then anything apart from the last lanes (the straight-bot guarantee needs only that).
  scan((x) => { const d = Math.abs(x - x0); return d >= GEN.gate.shift[0] && d <= GEN.gate.shift[1] && far(x); });
  scan((x) => far(x) && Math.abs(x - x0) <= 1.0);
  scan((x) => far(x) && Math.abs(x - x0) <= GEN.gate.shift[1]);
  scan((x) => far(x));
  if (!cand.length) return null;
  const pick = cand[rng.int(0, cand.length - 1)]!;
  const centres = [pick];
  if (rng.chance(GEN.gate.second[tier] ?? 0)) {
    const c2 = round1cm(pick - Math.sign(pick - x0 || 1) * rng.range(GEN.gate.secondOff[0], GEN.gate.secondOff[1]));
    // Keep room for the next row: ≥ 1 m of opening centres whose lanes miss both openings.
    let room = 0;
    for (let k = 0; k <= 66; k++) {
      const x = -GEN.gate.maxC + k * 0.1;
      if (lanesApart([openingLanes(x, w)], [openingLanes(pick, w), openingLanes(c2, w)])) room += 0.1;
    }
    if (Math.abs(c2) <= GEN.gate.maxC && far(c2) && Math.abs(c2 - x0) >= GEN.gate.shift[0] && room >= 1.0) centres.push(c2);
  }
  return centres;
}
