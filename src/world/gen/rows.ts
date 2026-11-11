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
import { buildCurbCar, buildVanAcross, curbSlots, skinVariant, VAN_ACROSS } from './props/shared';
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
    // (Phase B: a litter bin as well, so the runs beside the vehicles close with a few pieces, not a fence of mailboxes)
    case 'suburbs': return [
      { kind: 'mailbox', len: 0.4, wid: 0.4, hgt: 1.2, w8: 1 }, { kind: 'wheelie_bins', len: 0.7, wid: 1.5, hgt: 1.2, w8: 4 },
      { kind: 'trash_can', len: 0.6, wid: 0.6, hgt: 1.15, w8: 2 }];
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

/** The kinds a row's edge vehicle can be (THEME §3.4; the Docks' trucks are container-kind skins). */
export const VEHICLE_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(['van_across', 'parked_car', 'container']);
/** The Docks row truck: a container-size box truck 0.05 m in from the corridor edge, along the dock band. */
const DOCK_TRUCK = { len: 6.1, wid: 2.4, hgt: 2.6, edge: 0.05 } as const;
/** The widest hole a vehicle may leave beside an opening (it widens the opening by that much; the straight-bot gate
 *  measures what that costs). */
const HOLE_MAX = 0.3;

/** Is the plan box [x0, x1] × [s0, s1] clear of `obs` (solids, pits and raised slabs, with a margin), and of their
 *  grind edges (a rider coming off one sideways must not meet it)? For a row's deep pieces (THEME §3.4 vehicles):
 *  a curb car reaches 4.6 m along s, past the row band the keep-out spans cover. */
/** Clear room behind a deep piece: its 35° shadow (validator rule g, h ≤ 1.6 m: 2.8 m) plus a margin. */
const BEHIND = 3.0;
export function deepFree(obs: readonly Obstacle[]): (x0: number, x1: number, s0: number, s1: number) => boolean {
  return (x0, x1, s0, s1) => {
    for (const o of obs) {
      if (o.kind === 'curb' || o.kind === 'dock_lip' || o.s > s1 + 3 || o.s + o.len < s0 - 3) continue;
      for (const so of o.solids) { const b = so.box; if (b.x1 > x0 - 0.3 && b.x0 < x1 + 0.3 && b.s1 > s0 - 0.3 && b.s0 < s1 + BEHIND) return false; }
      for (const pt of o.pits) if (pt.x1 > x0 - 0.3 && pt.x0 < x1 + 0.3 && pt.s1 > s0 - 0.3 && pt.s0 < s1 + BEHIND) return false;
      for (const sl of o.slabs) if ((sl.kind !== 'flat' || sl.layer === 1) && sl.x1 > x0 - 0.3 && sl.x0 < x1 + 0.3 && sl.s1 > s0 - 0.3 && sl.s0 < s1 + 1.0) return false;
      for (const e of o.edges) {
        const ex0 = Math.min(e.a.x, e.b.x), ex1 = Math.max(e.a.x, e.b.x);
        if (ex1 > x0 - 1.0 && ex0 < x1 + 1.0 && e.b.s > s0 - 3 && e.a.s < s1 + 1.0) return false;
      }
    }
    return true;
  };
}

/** Phase B (THEME §3.4, theme T8): the vehicle that starts a row's edge run [r0, r1] on side sd, and the sub-runs
 *  left for the kit pieces. A van_across (nose flush with the corridor edge) when the run takes its 4.4 m; else a car
 *  at the curb (Downtown, Suburbs; Neon taxis) when the run reaches past the parking lane; else null. What is left
 *  between a vehicle and the opening is either a hole (an opening a little wider) or room for kit pieces. */
function edgeVehicle(sd: -1 | 1, r0: number, r1: number, sRow: number, props: PropCtx, minW: number,
  free: (x0: number, x1: number, s0: number, s1: number) => boolean, variant: number): { ob: Obstacle; sub: [number, number][] } | null {
  const L = r1 - r0, inner = (d: number) => (sd < 0 ? [r0 + d, r1] : [r0, r1 - d]) as [number, number];
  // What is left beside a vehicle takes kit pieces, or stays a hole: at the corridor edge ≤ GAP_MAX; at the run's
  // inner end (an opening, or a template obstacle's keep-out) ≤ HOLE_MAX, the opening a little wider (the generator
  // re-measures the row's lanes, so a lane this opens is still kept apart from the last row's).
  const leftover = (rem: number) => rem <= GAP_MAX + 1e-6 || rem >= GAP_MIN + minW - 1e-6;
  const innerOk = (rem: number) => rem >= -1e-6 && (rem <= HOLE_MAX + 1e-6 || rem >= GAP_MIN + minW - 1e-6);
  const innerHole = (rem: number) => rem <= HOLE_MAX + 1e-6;
  if (innerOk(L - VAN_ACROSS.wid)) {
    const x0 = sd < 0 ? -4.5 : 4.5 - VAN_ACROSS.wid, x1 = x0 + VAN_ACROSS.wid;
    if (free(x0, x1, sRow, sRow + VAN_ACROSS.len)) {
      const rem = L - VAN_ACROSS.wid;
      return { ob: buildVanAcross(sRow, sd, props, variant, ObTag.Filler), sub: innerHole(rem) ? [] : [inner(VAN_ACROSS.wid + GAP_MIN)] };
    }
  }
  if (props.area === 'docks') {
    // A box truck backed up along the dock band (a container-kind truck skin; THEME §3.4 "IN ≥ 20 % (trucks)").
    // (parked a little off the edge, ≤ 0.3 m: never a lane there, when that closes the run without a hole too wide)
    const T = DOCK_TRUCK, room = r1 - (-4.5 + T.edge + T.wid);
    const shift = innerOk(room) ? 0 : Math.min(room - HOLE_MAX, 0.3 - T.edge);
    const x0 = -4.5 + T.edge + Math.max(0, shift), x1 = x0 + T.wid, inRem = r1 - x1;
    if (sd > 0 || !innerOk(inRem) || !free(x0, x1, sRow, sRow + T.len)) return null;
    const ob = buildTall('container', sRow, round1cm((x0 + x1) / 2), T.len, T.wid, T.hgt, props, { variant, tags: ObTag.Filler });
    ob.variant = skinVariant(ob, (k) => k.body === 'box_truck' || k.body === 'shuttle_bus');
    return { ob, sub: innerHole(inRem) ? [] : [[x1 + GAP_MIN, r1]] };
  }
  const slots = curbSlots(props.area);
  for (let k = 0; k < slots.length; k++) {
    const cc = slots[k]!;
    const cIn = cc.x - cc.wid / 2, cOut = cc.x + cc.wid / 2;          // |x| of the car's road side and outer side
    const reach = Math.abs(sd < 0 ? r1 : r0);                          // the run's inner end (|x|)
    const inRem = cIn - reach, outRem = 4.5 - cOut;                     // to the opening, to the corridor edge
    if (!innerOk(inRem) || !leftover(outRem)) continue;
    const x0 = sd < 0 ? -cOut : cIn, x1 = sd < 0 ? -cIn : cOut;
    if (!free(x0, x1, sRow, sRow + cc.len)) continue;
    const ob = buildCurbCar(sRow, sd, props, variant, ObTag.Filler, k);
    if (!ob) continue;
    const sub: [number, number][] = outRem > GAP_MAX + 1e-6 ? [sd < 0 ? [-4.5, -cOut - GAP_MIN] : [cOut + GAP_MIN, 4.5]] : [];
    if (!innerHole(inRem)) sub.push(sd < 0 ? [-cIn + GAP_MIN, r1] : [r0, cIn - GAP_MIN]);
    return { ob, sub };
  }
  return null;
}

/** A row across the corridor at sRow except the openings (width w) and the spans of `keepOut` (template obstacles
 *  beside it, kept GEN.gate.keepPad clear): mixed pieces of the area kit, filling each run edge to edge. Phase B
 *  (THEME §3.4): a run at the corridor edge starts with a vehicle when one fits and `free` clears its deep box. */
export function gateRow(sRow: number, centres: readonly number[], w: number, props: PropCtx, rng: Sfc32,
  keepOut: readonly (readonly [number, number])[] = [], free: ((x0: number, x1: number, s0: number, s1: number) => boolean) | null = null): Obstacle[] {
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
  const all: [number, number][] = [];
  for (const [r0, r1] of runs) {
    const atL = r0 <= -4.5 + 1e-6, atR = r1 >= 4.5 - 1e-6;
    const veh = free && atL !== atR ? edgeVehicle(atL ? -1 : 1, r0, r1, sRow, props, minW, free, rng.int(0, 7)) : null;
    if (veh) { out.push(veh.ob); all.push(...veh.sub); } else all.push([r0, r1]);
  }
  // (an end may keep a hole ≤ GAP_MAX only against the corridor edge or a vehicle, never beside an opening: a wider
  // opening would let straight lanes live longer)
  const veh = out.map((o) => o.solids[0]!.box);
  const byVeh = (x: number) => veh.some((b) => Math.abs(b.x1 - x) < GAP_MIN + 0.01 || Math.abs(b.x0 - x) < GAP_MIN + 0.01);
  for (const [r0, r1] of all) variant = kitRun(out, r0, r1, sRow, props, rng, variant, byVeh(r0), byVeh(r1));
  return out;
}

/** Fills the run [r0, r1] at sRow with pieces of the area's row kit, edge to edge (GAP_MIN–GAP_MAX apart), into
 *  `out`; returns the next variant. Runs under 0.25 m stay open. Also the remainder of a van wander wall. An end at
 *  the corridor edge (or the lip), or one the caller marks (`holeL` / `holeR`: against a vehicle), may keep a hole
 *  ≤ GAP_MAX, so fewer pieces close the run; an end beside an opening never does (Phase B, theme T8). */
export function kitRun(out: Obstacle[], r0: number, r1: number, sRow: number, props: PropCtx, rng: Sfc32, variant = 0,
  holeL = false, holeR = false): number {
  const L = r1 - r0;
  if (L < 0.25) return variant;
  const pal = rowPalette(props.area), minW = Math.min(...pal.map((p) => p.wid));
  const xEnd = props.area === 'docks' ? LIP.x0 - LIP_CLEAR : 4.5;
  const hL = holeL || r0 <= -4.5 + 1e-6, hR = holeR || r1 >= xEnd - 1e-6;
  const pieces = fillRun(L, pal, minW, rng, (hL ? 1 : 0) + (hR ? 1 : 0));
  const total = pieces.reduce((s, p) => s + p.wid, 0);
  // Pieces GAP_MIN–GAP_MAX apart; what is left goes to the ends that may keep a hole.
  const gap = pieces.length > 1 ? Math.min(GAP_MAX, (L - total) / (pieces.length - 1)) : 0;
  const extra = L - total - gap * (pieces.length - 1);
  // (a run narrower than its piece: the piece keeps flush with the corridor edge or the lip, else centred)
  const one = pieces.length === 1 ? pieces[0]!.wid : 0;
  let x = !one ? r0 + (hL && hR ? extra / 2 : hL ? extra : 0)
    : r1 >= xEnd - 1e-6 && one > L ? r1 - one : r0 <= -4.5 + 1e-6 && one > L ? r0 : (r0 + r1) / 2 - one / 2;
  for (const p of pieces) {
    const ob = buildTall(p.kind, sRow, round1cm(x + p.wid / 2), p.len, p.wid, p.hgt, props,
      { variant: variant++ % 3, tags: ObTag.Filler, ...(p.params ? { params: p.params } : {}) });
    out.push(ob);
    x += p.wid + gap;
  }
  return variant;
}

/** Pieces whose widths plus GAP_MIN–GAP_MAX gaps (and ≤ GAP_MAX at each of `holes` ends) fill L (one piece centred
 *  when L is below every width). Phase B
 *  (theme T8): the fewest pieces that close the run, so a row reads as a few real things, not a fence of the
 *  narrowest kit piece: among the piece multisets of the smallest count that fit, one is drawn by the product of the
 *  pieces' weights, in a shuffled order. */
function fillRun(L: number, pal: readonly RowPiece[], minW: number, rng: Sfc32, holes: number): RowPiece[] {
  const narrow = pal.reduce((m, p) => (p.wid < m.wid ? p : m));
  if (L <= minW + 1e-6) return [narrow];
  const k = pal.length, cnt = new Array<number>(k).fill(0);
  for (let n = 1; n <= 14; n++) {
    const found: { c: number[]; w: number }[] = [];
    // Every multiset of n pieces (counts per palette entry).
    const walk = (i: number, left: number, T: number, w: number): void => {
      if (i === k - 1) {
        const tot = T + left * pal[i]!.wid, ww = w * pal[i]!.w8 ** left;
        cnt[i] = left;
        // (one piece is centred, ≤ GAP_MAX each side, as before; several are ≤ GAP_MAX apart, plus ≤ GAP_MAX at each
        // end that may keep a hole)
        const ok = n === 1 ? tot <= L + 1e-6 && L - tot <= 2 * GAP_MAX + 1e-6
          : tot + (n - 1) * GAP_MIN <= L + 1e-6 && tot + (n - 1 + holes) * GAP_MAX >= L - 1e-6;
        if (ok && ww > 0) found.push({ c: cnt.slice(), w: ww });
        return;
      }
      for (let m = 0; m <= left; m++) { cnt[i] = m; walk(i + 1, left - m, T + m * pal[i]!.wid, w * pal[i]!.w8 ** m); }
    };
    walk(0, n, 0, 1);
    if (!found.length) continue;
    const pick = rng.weighted(found.map((f) => [f.c, f.w] as const));
    const out: RowPiece[] = [];
    pick.forEach((m, i) => { for (let j = 0; j < m; j++) out.push(pal[i]!); });
    for (let i = out.length - 1; i > 0; i--) { const j = rng.int(0, i); const t = out[i]!; out[i] = out[j]!; out[j] = t; }
    return out;
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
