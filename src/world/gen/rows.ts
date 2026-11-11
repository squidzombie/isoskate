// world/gen/rows.ts: anti-straight rows (DESIGN §10.7, the straight-bot guarantees of §10.11). A row closes the
// corridor at one s, all but 1–2 openings. Its *lanes* are the board-centre x ranges a straight roller passes it
// through (the openings, and any side gap a template obstacle beside it leaves). Each row's lanes are disjoint from the
// previous row's, so no straight lane passes two consecutive rows; the generator keeps consecutive rows ≤ GEN.gate.gap
// apart and every second row ≤ GEN.gate.window after the one two before, so a straight lane dies within that window.
//
// Theme T8, "where they stopped" (THEME §1, §3.4; DESIGN §10.7 rows note): everything where it belongs. A row is a small
// street scene with one readable decision, not a fence. Its runs are split at the kerb lines (and the Suburbs' lawn
// edge, the Docks' dock band), so every piece's footprint stands on one ground level:
//   road     vehicles stopped where they were, facing their traffic (a car in its lane or at the kerb; a van at the
//            kerb downtown; a taxi or a kei van in Neon; a car, an SUV or a camper in the Suburbs), and against the kerb
//            what a street parks there (a dumpster, a bike corral or a café set in a bay; the bins out on bin day;
//            lanterns, and a yatai anywhere in Neon);
//   sidewalk street furniture (news boxes, bins, café sets, bike racks, kiosks; mailboxes and bins on the verge;
//            vending machines on the facade and lanterns at the kerb in Neon);
//   Docks    a box truck or a container on the dock band (once a visit a van at its loading entrance), pallet stacks
//            or drums on the apron, one kind per group.
// A Downtown plaza takes no vehicles: its furniture spans it, grouped by kind. What a road part holds follows the
// block's mood and the last rows (no scene three times running), so the street never reads as a pattern. The rules
// that make a row fair do not change: the row band [sr, sr + 0.3], its lanes, the gap / hole limits and the openings.
import { round1cm } from '../../core/math';
import { AREA_ORDER, type AreaId, type PropKind } from '../../core/ids';
import { hash32, type Sfc32 } from '../../core/rng';
import type { PropSkin } from '../../core/skins';
import { FACE_INSET, HITBOX, STEP_UP } from '../../core/tuning';
import type { Obstacle } from '../../core/world';
import { ObTag } from '../../core/world';
import { GEN, type Tier } from './gen.config';
import { buildTall, type PropCtx } from './props/common';
import { buildVanAcross, skinVariant, VAN_ACROSS } from './props/shared';
import { LIP, type StreetLayout } from './props/street';

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

/** Today's mixed row kit, per area (DESIGN §10.3 sizes; long axis along s): the fallback when a part has no natural
 *  fill (flagged `fill: 'mixed'`), the kit-only row (`fill: 'kit'`) and the filler wall. */
export function rowPalette(a: AreaId): RowPiece[] {
  switch (a) {
    case 'downtown': return [
      { kind: 'news_box', len: 0.5, wid: 0.5, hgt: 1.15, w8: 2 }, { kind: 'trash_can', len: 0.6, wid: 0.6, hgt: 1.15, w8: 3 },
      { kind: 'cafe_set', len: 1.2, wid: 1.2, hgt: 1.2, w8: 2, params: { canopyY: 2.2 } }, { kind: 'kiosk', len: 1.6, wid: 1.6, hgt: 2.4, w8: 1 }];
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
/** The widest hole a vehicle may leave beside an opening (it widens the opening by that much; the straight-bot gate
 *  measures what that costs). A strip of gutter this narrow between an opening and a kerb stays empty too. */
const HOLE_MAX = 0.3;
/** Each side of a kerb (or lawn edge, dock band edge) joint: the two pieces 0.05–0.14 m apart across it. */
const JOINT: Range = [0.025, 0.07];
/** A road kit piece's side of a kerb joint (the kerb face to 0.12 m off it). */
const KIT_JOINT: Range = [0, 0.12];

/** The kinds a row vehicle can be (THEME §3.4; the Docks' trucks are container-kind skins). */
export const VEHICLE_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(['van_across', 'parked_car', 'parked_van', 'container']);

/** Clear room behind a deep piece: its 35° shadow (validator rule g, h ≤ 1.6 m: 2.8 m) plus a margin. */
const BEHIND = 3.0;
export type Free = (x0: number, x1: number, s0: number, s1: number) => boolean;
/** Is the plan box [x0, x1] × [s0, s1] clear of `obs` (solids, pits and raised slabs, with a margin), and of their
 *  grind edges (a rider coming off one sideways must not meet it)? For a row's deep pieces (vehicles reach 4.4–6.1 m
 *  along s, past the row band the keep-out spans cover). */
export function deepFree(obs: readonly Obstacle[]): Free {
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

// ── "Where they stopped": the kits, the vehicles and the scenes ───────────────────────────────────────────────────

type Range = readonly [number, number];
/** A kit piece. `skin`: the skin it must show (a dumpster, not a bin pair); `facade`: stands at the outer end of a
 *  sidewalk; `free`: may stand anywhere in the road (Neon's yatai); `group`: one group per Docks pile. */
interface Kit extends RowPiece { skin?: (k: PropSkin) => boolean; facade?: boolean; free?: boolean; group?: string }
/** A road vehicle: |x| of its centre in [lo, hi] (its own half); `skin`: the body it must show. */
interface Veh { kind: PropKind; len: number; wid: number; hgt: number; w8: number; lo: number; hi: number; skin?: (k: PropSkin) => boolean;
  params?: Record<string, number> }

const P = {
  news: { kind: 'news_box', len: 0.5, wid: 0.5, hgt: 1.15, w8: 2 },
  bin: { kind: 'trash_can', len: 0.6, wid: 0.6, hgt: 1.15, w8: 3 },
  cafe: { kind: 'cafe_set', len: 1.2, wid: 1.2, hgt: 1.2, w8: 2, params: { canopyY: 2.2 } },
  kiosk: { kind: 'kiosk', len: 1.6, wid: 1.6, hgt: 2.4, w8: 1 },
  bikes: { kind: 'bike_rack', len: 2.4, wid: 0.7, hgt: 1.15, w8: 2 },
  dumpster: { kind: 'wheelie_bins', len: 0.7, wid: 1.5, hgt: 1.2, w8: 1, skin: (k: PropSkin) => k.body === 'dumpster' },
  binPair: { kind: 'wheelie_bins', len: 0.7, wid: 1.5, hgt: 1.2, w8: 3, skin: (k: PropSkin) => k.body === 'bin_pair' },
  mailbox: { kind: 'mailbox', len: 0.4, wid: 0.4, hgt: 1.2, w8: 2 },
  lantern: { kind: 'lantern_stand', len: 0.4, wid: 0.4, hgt: 1.6, w8: 1 },
  vending: { kind: 'vending_bank', len: 0.8, wid: 1.0, hgt: 1.8, w8: 3, params: { machines: 1 }, facade: true },
  cart: { kind: 'food_cart', len: 2.0, wid: 1.2, hgt: 2.2, w8: 1.5, free: true },
  pallets: { kind: 'pallet_tall', len: 1.2, wid: 1.0, hgt: 1.2, w8: 2, group: 'pallets' },
  drums2: { kind: 'drum_cluster', len: 0.7, wid: 1.3, hgt: 1.15, w8: 2, params: { drums: 2 }, group: 'drums' },
  drums3: { kind: 'drum_cluster', len: 0.7, wid: 1.95, hgt: 1.15, w8: 1.5, params: { drums: 3 }, group: 'drums' },
} satisfies Record<string, Kit>;

/** What stands where, per area: `walk` on sidewalks, verges and plazas; `kerb` in the road against the kerb (≤ 2 pieces,
 *  ≤ STRIP m from it); `pile` on the Docks' dock band and apron. */
export function rowKit(a: AreaId, band: 'walk' | 'kerb' | 'pile'): readonly Kit[] {
  if (band === 'pile') return [P.pallets, P.drums2, P.drums3];
  switch (a) {
    case 'downtown': return band === 'walk' ? [P.news, P.bin, { ...P.cafe, w8: 1.5 }, P.bikes, P.kiosk] : [P.cafe, P.bikes, P.dumpster, { ...P.bin, w8: 1 }];
    case 'suburbs': return band === 'walk' ? [P.mailbox, { ...P.bin, w8: 2 }] : [P.binPair, { ...P.bin, w8: 2 }, { ...P.mailbox, w8: 1 }];
    case 'neon': return band === 'walk' ? [P.lantern, P.vending, P.cart] : [{ ...P.lantern, w8: 2 }, P.cart];
    case 'docks': return [P.pallets, P.drums2, P.drums3];
  }
}
/** The widest strip of kerb kit beside one kerb (a parking lane). */
const STRIP = 2.0;

/** The road vehicles per area (DESIGN §10.3 sizes): a car anywhere in its half from its lane (≤ 0.15 m over the centre
 *  line) to the kerb, a van only at the kerb and now and then a box truck making a delivery downtown; Neon's taxis and
 *  kei vans; the Suburbs' cars, SUVs and campers (in lane from |x| 0.9: nearer the middle is mid-street). */
function roadVehicles(a: AreaId): readonly Veh[] {
  switch (a) {
    case 'downtown': return [{ kind: 'parked_car', len: 4.4, wid: 1.8, hgt: 1.4, w8: 3, lo: 0.75, hi: 2.07 },
      { kind: 'parked_van', len: 4.6, wid: 1.9, hgt: 1.9, w8: 1, lo: 1.98, hi: 2.025 },
      { ...DOCK_TRUCK, w8: 0.5, lo: 1.25, hi: 1.775 }];
    case 'neon': return [{ kind: 'parked_car', len: 4.4, wid: 1.8, hgt: 1.4, w8: 3, lo: 0.75, hi: 2.07 },
      { kind: 'parked_van', len: 3.8, wid: 1.7, hgt: 1.9, w8: 1.2, lo: 0.75, hi: 2.12 }];
    case 'suburbs': return [{ kind: 'parked_car', len: 4.6, wid: 1.9, hgt: 1.5, w8: 3, lo: 0.9, hi: 1.62 },
      { kind: 'parked_van', len: 4.6, wid: 1.9, hgt: 1.9, w8: 1, lo: 0.9, hi: 1.62, skin: (k) => k.body === 'camper' }];
    case 'docks': return [];
  }
}
/** The Docks' dock-band vehicle: a box truck (container kind) 0.05 m in from the corridor edge. A shipping container
 *  stands in the same place as the band's "clear" fill. */
const DOCK_TRUCK: Veh = { kind: 'container', len: 6.1, wid: 2.4, hgt: 2.6, w8: 1, lo: 3.2, hi: 3.3, skin: (k) => k.body === 'box_truck' };
const DOCK_BOX: Kit = { kind: 'container', len: 6.1, wid: 2.4, hgt: 2.6, w8: 1, skin: (k) => k.body === 'container' };

/** A row's scene: one vehicle in its lane, at the kerb, or mid-street; two side by side in opposite lanes (pair), one
 *  double-parked beside another (double), two flanking an opening (squeeze), the either-side fork; or none (clear). */
export type Scene = 'lane' | 'kerb' | 'mid' | 'pair' | 'double' | 'squeeze' | 'either' | 'clear';
/** The scene of one road part's vehicles (a part's composition). */
const partScene = (vs: readonly { mode: Mode }[]): Scene =>
  !vs.length ? 'clear' : vs.length >= 2 ? (vs.some((v) => v.mode === 'mid') ? 'double' : 'pair')
    : vs[0]!.mode === 'mid' ? 'mid' : vs[0]!.mode === 'kerb' ? 'kerb' : 'lane';
/** A row's signature (the generator keeps the last ones, GenCursor.rowHist): its scene, its vehicle count, the side its
 *  vehicles stand on (0: none, both, or the middle of the street: within GEN.rows.sideNeutral of the centre), and
 *  whether a car stood mid-street (across the centre line). */
export interface RowSig { scene: Scene; veh: number; side: -1 | 0 | 1; mid?: boolean }
/** How a row was filled: `band` (everything where it belongs), `mixed` (a road part took the mixed kit), `kit` (today's
 *  kit row: the last resort). */
export type RowFill = 'band' | 'mixed' | 'kit';
export interface RowCtx {
  /** Deep boxes clear of the template's obstacles (deepFree). */
  free: Free;
  /** The line's x on the approach, and the opening it takes (centres[0]): the approach's columns. */
  x0: number; cSafe: number;
  /** Speed at the row (the stagger's time), the block's mood and vehicle chance, the last rows' signatures (newest
   *  first). */
  v: number; pVeh: number; hist: readonly RowSig[]; mood?: Mood;
  layout: StreetLayout;
  /** The openings are an either-side fork (gateOpenings): two stopped cars close the middle. */
  either?: boolean;
  /** Docks: this visit's van at its loading entrance may still stand. */
  van?: boolean;
}
export interface RowBuild { obs: Obstacle[]; sig: RowSig; fill: RowFill }

export type Mood = 'quiet' | 'normal' | 'busy';
/** The mood of the street block at s (GEN.rows.block m; hashed from the seed: no RNG stream moves). Quiet Suburbs
 *  blocks are bin day; busy ones are where everyone was when it happened. */
export function moodAt(seed: number, s: number, area: AreaId): Mood {
  const R = GEN.rows;
  const u = (hash32(seed, Math.floor(s / R.block), AREA_ORDER.indexOf(area), 0x7e1) >>> 0) / 4294967296;
  let acc = 0;
  for (const [m, p] of R.moods) { acc += p; if (u < acc) return m; }
  return 'normal';
}
/** The block mood's vehicle chance at s (the run's first metres after the Roll-out at least GEN.rows.firstVeh). */
export function vehChance(seed: number, s: number, area: AreaId, sOpen: number): number {
  const R = GEN.rows, p = R.pVeh[moodAt(seed, s, area)] * R.areaVeh[area];
  return s < sOpen + R.openingBusy ? Math.max(p, R.firstVeh) : p;
}

type End = 'open' | 'keep' | 'edge' | 'joint' | 'veh';
type Zone = 'road' | 'walk' | 'dock' | 'apron';
interface Part { a: number; b: number; ea: End; eb: End; zone: Zone; dy: number; empty?: boolean; narrow?: Kit;
  /** A joint end's hole range when the piece across it already stands (the two holes 0.05–0.14 m together). */
  ja?: Range; jb?: Range }

/** The row zones of a layout, left to right: one per street band (a kerb or a lawn edge is a level change). */
function zonesOf(l: StreetLayout): { x0: number; x1: number; zone: Zone; dy: number }[] {
  return l.bands.map((bd) => ({ x0: bd.x0, x1: bd.x1, dy: bd.dy,
    zone: bd.kind === 'road' ? 'road' as const : bd.kind === 'dock' ? 'dock' as const : bd.kind === 'apron' ? 'apron' as const : 'walk' as const }));
}

/** Splits the run [r0, r1] at the zone boundaries. A sliver ≤ 0.1 m beside a boundary joins its neighbour (a piece
 *  may reach 0.1 m over a kerb: its footprint, inset 0.1 m, still stands on one level); one ≤ HOLE_MAX beside an
 *  opening stays empty (the opening a little wider). Null: a sliver nothing fits (the run takes the mixed kit). */
function partsOf(r0: number, r1: number, ea: End, eb: End, l: StreetLayout, area: AreaId): Part[] | null {
  const zs = zonesOf(l);
  const xs = [r0, ...zs.slice(1).map((z) => z.x0).filter((x) => x > r0 + 1e-6 && x < r1 - 1e-6), r1];
  const ps: Part[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i]!, b = xs[i + 1]!, m = (a + b) / 2;
    const z = zs.find((q) => m >= q.x0 && m < q.x1) ?? zs[zs.length - 1]!;
    ps.push({ a, b, ea: i === 0 ? ea : 'joint', eb: i + 2 === xs.length ? eb : 'joint', zone: z.zone, dy: z.dy });
  }
  const kitOf = (p: Part) => p.zone === 'road' ? [...rowKit(area, 'kerb'), ...rowKit(area, 'walk')] : rowKit(area, p.zone === 'walk' ? 'walk' : 'pile');
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!, L = p.b - p.a;
    // (a sliver: narrower than anything its zone stands)
    const nar = kitOf(p).reduce((m, q) => (q.wid < m.wid ? q : m));
    if (ps.length === 1 || L >= nar.wid + JOINT[0]) continue;
    const left = p.ea === 'joint' ? ps[i - 1] : undefined, right = p.eb === 'joint' ? ps[i + 1] : undefined;
    const nb = left && right ? (left.b - left.a >= right.b - right.a ? left : right) : left ?? right;
    if (!nb) return null;
    // (it joins its neighbour when they are one level, as the Docks' dock band and apron are, or when it is ≤ 0.1 m)
    if (L <= 0.1 + 1e-6 || Math.abs(nb.dy - p.dy) < 1e-6) {
      if (nb === left) { left.b = p.b; left.eb = p.eb; } else { nb.a = p.a; nb.ea = p.ea; }
      ps.splice(i, 1); i--;
      continue;
    }
    const outer = nb === left ? p.eb : p.ea;
    if (L <= HOLE_MAX + 1e-6 && (outer === 'open' || outer === 'keep')) {
      p.empty = true;
      if (nb === left) left.eb = 'open'; else nb.ea = 'open';
      continue;
    }
    // (a little wider: the zone's narrowest piece against the joint, ≤ 0.12 m into the opening, as a run narrower
    // than its piece always did at the corridor edge)
    if ((outer === 'open' || outer === 'keep') && nar.wid + JOINT[0] - L <= 0.12 + 1e-6) { p.narrow = nar; continue; }
    return null;
  }
  return ps.filter((p) => !p.empty);
}

/** The end-hole range of a part end next to a kit piece or a vehicle. */
function endRange(e: End, veh: boolean, road = false): Range {
  switch (e) {
    // (street furniture stands flush with an opening: a hole there would let straight lanes live longer, measured)
    case 'open': case 'keep': return veh ? [0, HOLE_MAX] : [0, 0];
    case 'edge': return [0, GAP_MAX];
    // (road kit may stand against the kerb face, up to 0.12 m off it: the sidewalk piece across takes the rest)
    case 'joint': return veh || !road ? JOINT : KIT_JOINT;
    case 'veh': return [GAP_MIN, GAP_MAX];
  }
}
/** A part end's hole range: the joint range left by the piece across it, else endRange. */
const partEnd = (pt: Part, end: 'a' | 'b', veh: boolean): Range =>
  (end === 'a' ? pt.ja : pt.jb) ?? endRange(end === 'a' ? pt.ea : pt.eb, veh, pt.zone === 'road');

interface Item { w: number; c?: Range }
/** Places items left to right in [a, b] (closed form): the end holes in hA / hB, GAP_MIN–GAP_MAX between items, each
 *  item with a centre range inside it. Returns the left edges, or null when they cannot close the part. A forward
 *  pass bounds each prefix of slack (an interval), a backward pass picks inside the bounds (`rng`: at random). */
function place(a: number, b: number, items: readonly Item[], hA: Range, hB: Range, rng: Sfc32 | null): number[] | null {
  const n = items.length;
  if (!n) return b - a <= hA[1] + hB[1] + 1e-9 && b - a >= hA[0] + hB[0] - 1e-9 ? [] : null;
  const lo: number[] = [hA[0]], hi: number[] = [hA[1]];
  for (let i = 1; i < n; i++) { lo.push(GAP_MIN); hi.push(GAP_MAX); }
  lo.push(hB[0]); hi.push(hB[1]);
  let W = 0;
  for (const it of items) W += it.w;
  const Z = b - a - W;
  const sufLo = new Array<number>(n + 2).fill(0), sufHi = new Array<number>(n + 2).fill(0);
  for (let j = n; j >= 0; j--) { sufLo[j] = sufLo[j + 1]! + lo[j]!; sufHi[j] = sufHi[j + 1]! + hi[j]!; }
  if (Z < sufLo[0]! - 1e-9 || Z > sufHi[0]! + 1e-9) return null;
  const F: [number, number][] = [];
  let p0 = 0, p1 = 0, base = 0;
  for (let i = 0; i < n; i++) {
    let l = p0 + lo[i]!, h = p1 + hi[i]!;
    l = Math.max(l, Z - sufHi[i + 1]!); h = Math.min(h, Z - sufLo[i + 1]!);
    const it = items[i]!;
    if (it.c) { const off = a + base + it.w / 2; l = Math.max(l, it.c[0] - off); h = Math.min(h, it.c[1] - off); }
    if (l > h + 1e-9) return null;
    F.push([l, Math.max(l, h)]); p0 = l; p1 = Math.max(l, h); base += it.w;
  }
  const Pv = new Array<number>(n);
  let next = Z;
  for (let i = n - 1; i >= 0; i--) {
    const l = Math.max(F[i]![0], next - hi[i + 1]!), h = Math.min(F[i]![1], next - lo[i + 1]!);
    if (l > h + 1e-9) return null;
    Pv[i] = rng ? l + (Math.max(l, h) - l) * rng.float() : (l + Math.max(l, h)) / 2;
    next = Pv[i]!;
  }
  const xs: number[] = [];
  base = 0;
  for (let i = 0; i < n; i++) { xs.push(a + base + Pv[i]!); base += items[i]!.w; }
  return xs;
}

/** The multisets of n pieces of `kit` (counts per entry), for the fewest-pieces fills. */
function multisets(k: number, n: number): number[][] {
  const out: number[][] = [], cnt = new Array<number>(k).fill(0);
  const walk = (i: number, left: number) => {
    if (i === k - 1) { cnt[i] = left; out.push(cnt.slice()); return; }
    for (let m = 0; m <= left; m++) { cnt[i] = m; walk(i + 1, left - m); }
  };
  walk(0, n);
  return out;
}

interface Placed { p: Kit | Veh; x0: number; veh: boolean; ds: number }
/** Fills [a, b] with the fewest pieces of `kit` that close it (end ranges hA / hB), drawn by the product of their
 *  weights; ordered at random, grouped by kind (`grouped`), one group only (`oneGroup`), the facade pieces outermost.
 *  Null when no multiset of ≤ 6 pieces fits. */
function fillKit(a: number, b: number, kit: readonly Kit[], hA: Range, hB: Range, rng: Sfc32,
  o: { grouped?: boolean; oneGroup?: boolean; outer?: -1 | 1 } = {}): Placed[] | null {
  const L = b - a;
  if (L < 0.25) return [];
  for (let n = 1; n <= 6; n++) {
    const found: { c: number[]; w: number }[] = [];
    for (const c of multisets(kit.length, n)) {
      let T = 0, w = 1;
      const groups = new Set<string>();
      c.forEach((m, i) => { if (m) { T += m * kit[i]!.wid; w *= kit[i]!.w8 ** m; groups.add(kit[i]!.group ?? kit[i]!.kind); } });
      if (o.oneGroup && groups.size > 1) continue;
      if (T + (n - 1) * GAP_MIN + hA[0] + hB[0] > L + 1e-9 || T + (n - 1) * GAP_MAX + hA[1] + hB[1] < L - 1e-9) continue;
      found.push({ c, w });
    }
    if (!found.length) continue;
    const pick = rng.weighted(found.map((f) => [f.c, f.w] as const));
    let ps: Kit[] = [];
    pick.forEach((m, i) => { for (let j = 0; j < m; j++) ps.push(kit[i]!); });
    if (o.grouped) {
      const kinds = [...new Set(ps.map((p) => p.kind))];
      for (let i = kinds.length - 1; i > 0; i--) { const j = rng.int(0, i); const t = kinds[i]!; kinds[i] = kinds[j]!; kinds[j] = t; }
      ps = kinds.flatMap((k) => ps.filter((p) => p.kind === k));
    } else for (let i = ps.length - 1; i > 0; i--) { const j = rng.int(0, i); const t = ps[i]!; ps[i] = ps[j]!; ps[j] = t; }
    if (o.outer) {
      // (vending machines against the facade: the outer end of the sidewalk)
      const fac = ps.filter((p) => p.facade), rest = ps.filter((p) => !p.facade);
      ps = o.outer > 0 ? [...rest, ...fac] : [...fac, ...rest];
    }
    const xs = place(a, b, ps.map((p) => ({ w: p.wid })), hA, hB, rng);
    if (!xs) continue;
    return ps.map((p, i) => ({ p, x0: xs[i]!, veh: false, ds: 0 }));
  }
  return null;
}

/** Narrowest-piece fallback: closes any part (pieces evenly spaced, gaps ≤ GAP_MAX; they may touch). One piece wider
 *  than the part keeps flush with the corridor edge or the lip when the part ends there (as a row's always did), else
 *  against its kerb, else centred. */
function fillNarrow(pt: Part, kit: readonly Kit[]): Placed[] {
  const nar = kit.reduce((m, p) => (p.wid < m.wid ? p : m));
  const a = pt.a, b = pt.b, L = b - a;
  if (L < 0.25) return [];
  const n = Math.max(1, Math.ceil((L - nar.wid) / (nar.wid + GAP_MAX)) + 1);
  const step = n > 1 ? (L - nar.wid) / (n - 1) : 0;
  const one = pt.eb === 'edge' ? b - nar.wid : pt.ea === 'edge' ? a : pt.eb === 'joint' ? b - JOINT[0] - nar.wid
    : pt.ea === 'joint' ? a + JOINT[0] : (a + b) / 2 - nar.wid / 2;
  return Array.from({ length: n }, (_, k) => ({ p: nar, x0: n > 1 ? a + k * step : one, veh: false, ds: 0 }));
}

/** The row-wide state while a row's parts are filled. */
interface RowState {
  ctx: RowCtx; area: AreaId; sr: number; rng: Sfc32;
  /** Vehicles placed so far (centre x, front s offset, part index), the halves they stand in. */
  veh: { x: number; ds: number; part: number; kerb: boolean; wid: number; mid?: boolean }[];
  /** The approach's columns (no vehicle there stands earlier than the row), and the columns of the routes from x0 to
   *  the other openings (the validator never rides those: no vehicle there stands earlier at all). */
  colA: number; colB: number; cols: readonly Range[];
  mixed: boolean; mid: boolean;
}

type Cls = 'kerb' | 'lane' | 'pair' | 'clear' | 'mid' | 'double';
/** Where a vehicle stopped: at the kerb, in its lane (a little over the centre line at most), or mid-street (across
 *  it, alone or double-parked beside a car at the kerb: ≤ 1 row in GEN.rows.midEvery, or when nothing else closes the
 *  road; a car in the middle of the street reads better than a bin in it). */
type Mode = 'kerb' | 'lane' | 'mid';

/** A road part's candidate fills of one class: items left to right (kerb strip, vehicles, kerb strip). */
function compositions(pt: Part, cls: Cls, st: RowState, relax: boolean): { items: (Kit | (Veh & { half: -1 | 0 | 1; mode: Mode }))[]; w: number }[][] {
  const kerbX = st.ctx.layout.curbX ?? 4.5;
  const kit = rowKit(st.area, 'kerb');
  // (an end at the kerb line: a joint, or an opening whose gutter sliver stayed empty)
  const kerbA = Math.abs(pt.a + kerbX) < 1e-6, kerbB = Math.abs(pt.b - kerbX) < 1e-6;
  // Strips by piece count (0, 1, 2), kerb-most piece outermost.
  const strip = (on: boolean): Kit[][][] => {
    if (!on) return [[[]]];
    const one = kit.map((p) => [p]), two: Kit[][] = [];
    for (const p of kit) for (const q of kit) if (p.wid + q.wid <= STRIP) two.push([p, q]);
    return [[[]], one, two];
  };
  const sA = strip(kerbA), sB = strip(kerbB);
  // Vehicles per half (never two in one half; a half a vehicle of this row already holds is closed).
  const used = new Set(st.veh.filter((v) => !v.mid).map((v) => Math.sign(v.x)));
  const hist = st.ctx.hist;
  const sameSide = sideToAvoid(hist, st.area);
  // (the strict pass keeps the scene the last two rows had out of this row: a vehicle at the kerb after two in-lane
  // rows, none after two kerb rows)
  const avoid = relax ? undefined : sceneToAvoid(hist);
  const otherVeh = st.veh.length > 0;
  const midOk = !hist.slice(0, GEN.rows.midEvery - 1).some((h) => h.mid);
  type V = Veh & { half: -1 | 0 | 1; mode: Mode };
  const vehOf = (half: -1 | 0 | 1, mode: Mode): V[] => {
    if (mode === 'mid') {
      // (across the centre line, its centre on the `half` side of it; within GEN.rows.sideNeutral of the centre it
      // stands in the middle of the street, on neither side: the strict pass keeps it there on the side to avoid, as
      // the row signature counts it; one a row, and rare)
      if ((!midOk && !relax) || half === 0 || st.veh.some((v) => v.mid) || st.veh.length >= 2) return [];
      const cap = !relax && half === sameSide ? GEN.rows.sideNeutral : Infinity;
      return roadVehicles(st.area).filter((v) => v.kind !== 'container').map((v) => ({ ...v, lo: 0, hi: Math.min(v.lo - 0.01, cap), half, mode }));
    }
    if (half === 0 || used.has(half) || (!relax && half === sameSide) || (half < 0 ? pt.a >= 0 : pt.b <= 0)) return [];
    const out: V[] = [];
    for (const v of roadVehicles(st.area)) {
      const kLo = kerbX - JOINT[1] - v.wid / 2, kHi = kerbX - JOINT[0] - v.wid / 2;
      const lo = mode === 'kerb' ? Math.max(v.lo, kLo) : v.lo;
      const hi = mode === 'kerb' ? Math.min(v.hi, kHi) : Math.min(v.hi, kerbX - 0.12 - v.wid / 2);
      if (lo > hi + 1e-9) continue;
      out.push({ ...v, lo, hi, half, mode });
    }
    return out;
  };
  const vehSets: V[][] = [];
  if (cls === 'kerb' || cls === 'lane') for (const half of [-1, 1] as const) for (const v of vehOf(half, cls)) vehSets.push([v]);
  if (cls === 'mid') for (const half of [-1, 1] as const) for (const v of vehOf(half, 'mid')) vehSets.push([v]);
  if (cls === 'pair') {
    if (st.veh.length === 0) for (const l of [...vehOf(-1, 'kerb'), ...vehOf(-1, 'lane')]) for (const r of [...vehOf(1, 'kerb'), ...vehOf(1, 'lane')]) vehSets.push([l, r]);
  }
  if (cls === 'double' && st.veh.length === 0) {
    // (a car stopped beside one at the kerb or in its lane, across the centre line: double-parked)
    const mids = [...vehOf(-1, 'mid'), ...vehOf(1, 'mid')];
    for (const k of [...vehOf(-1, 'kerb'), ...vehOf(-1, 'lane')]) for (const m of mids) vehSets.push([k, m]);
    for (const k of [...vehOf(1, 'kerb'), ...vehOf(1, 'lane')]) for (const m of mids) vehSets.push([m, k]);
  }
  // (no vehicle: the strips at the kerbs, and the pieces that may stand anywhere in the road between them: a row of
  // yatai is Hoshimachi's night market)
  const mids: Kit[][] = [[]];
  if (cls === 'clear') {
    vehSets.push([]);
    const free = kit.filter((p) => p.free);
    for (const f of free) { mids.push([f]); mids.push([f, f]); mids.push([f, f, f]); }
  }
  // By total strip pieces (fewest first).
  const byN: { items: (Kit | V)[]; w: number }[][] = [[], [], [], [], []];
  for (const vs0 of vehSets) for (const mid of vs0.length ? [[]] : mids) {
    // (a part beside another part's vehicle makes the row a squeeze: that scene is the row's, not this part's)
    if (vs0.length && avoid && !otherVeh && partScene(vs0) === avoid) continue;
    const vs: (Kit | V)[] = vs0.length ? vs0 : mid;
    let wv = 1;
    for (const v of vs) wv *= v.w8 * ('mode' in v && v.mode === 'kerb' ? GEN.rows.kerbW8 : 1);
    for (let na = 0; na < sA.length; na++) for (const ka of sA[na]!) for (let nb = 0; nb < sB.length; nb++) for (const kb of sB[nb]!) {
      // (a strip only beside a kerb; with nothing between them the strips must meet, so they are one strip)
      if (!vs.length && ka.length && kb.length) continue;
      if (na + nb + mid.length > 4) continue;
      let w = wv;
      for (const p of ka) w *= p.w8;
      for (const p of kb) w *= p.w8;
      byN[na + nb + mid.length]!.push({ items: [...ka, ...vs, ...[...kb].reverse()], w });
    }
  }
  return byN;
}

/** A vehicle's item centre range (absolute x). */
const vehRange = (v: Veh & { half: -1 | 0 | 1 }): Range => (v.half < 0 ? [-v.hi, -v.lo] : v.half > 0 ? [v.lo, v.hi] : [-v.hi, v.hi]);
const isVeh = (it: Kit | Veh | undefined): it is Veh & { half: -1 | 0 | 1; mode: Mode } => !!it && 'lo' in it;
/** A composition's items for `place`, and its end ranges (a vehicle at an end may leave a wider hole). */
function itemsOf(pt: Part, list: readonly (Kit | Veh)[]): [Item[], Range, Range] {
  return [list.map((it) => (isVeh(it) ? { w: it.wid, c: vehRange(it) } : { w: it.wid })),
    partEnd(pt, 'a', isVeh(list[0])), partEnd(pt, 'b', isVeh(list[list.length - 1]))];
}

/** Tries one class on a road part: the fewest-pieces feasible compositions, drawn by weight, placed, the vehicles
 *  staggered and their deep boxes checked. Null when none stands. */
function tryClass(pt: Part, pi: number, cls: Cls, st: RowState, relax: boolean): Placed[] | null {
  const byN = compositions(pt, cls, st, relax);
  for (const group of byN) {
    const feas: { items: (Kit | (Veh & { half: -1 | 0 | 1; mode: Mode }))[]; w: number; xs: number[] }[] = [];
    for (const cand of group) {
      const [items, hA, hB] = itemsOf(pt, cand.items);
      const xs = place(pt.a, pt.b, items, hA, hB, null);
      if (xs) feas.push({ ...cand, xs });
    }
    while (feas.length) {
      const k = feas.length > 1 ? st.rng.weighted(feas.map((f, i) => [i, f.w] as const)) : 0;
      const cand = feas[k]!;
      feas.splice(k, 1);
      const [items, hA, hB] = itemsOf(pt, cand.items);
      const xs = place(pt.a, pt.b, items, hA, hB, st.rng) ?? cand.xs;
      const out: Placed[] = cand.items.map((it, i) => ({ p: it, x0: xs[i]!, veh: isVeh(it), ds: 0 }));
      let ok = true;
      const placedS = st.veh.map((v) => v.ds);
      // (vehicles nearest the opening the line takes first: it keeps its front at the row when the line passes it)
      const order = out.map((pl, i) => i).filter((i) => out[i]!.veh)
        .sort((i, j) => Math.abs(out[i]!.x0 + out[i]!.p.wid / 2 - st.ctx.cSafe) - Math.abs(out[j]!.x0 + out[j]!.p.wid / 2 - st.ctx.cSafe));
      for (const i of order) {
        const pl = out[i]!;
        const ds = stagger(st, pl.x0, pl.x0 + pl.p.wid, pl.p.len, placedS);
        if (ds === null) { ok = false; break; }
        placedS.push(ds);
        pl.ds = ds;
      }
      if (!ok) continue;
      for (const pl of out) if (pl.veh) {
        const v = pl.p as Veh & { half: -1 | 0 | 1; mode: Mode };
        const xc = pl.x0 + v.wid / 2;
        st.veh.push({ x: xc, ds: pl.ds, part: pi, kerb: v.mode === 'kerb', wid: v.wid, mid: v.mode === 'mid' });
        if (v.mode === 'mid') st.mid = true;
      }
      return out;
    }
  }
  return null;
}

/** The s offset of a vehicle over [x0, x1]: 0 in the approach's columns (the line passes there: it keeps its front at
 *  the row; a second one there, farther from the opening the line takes, 1.2 m earlier: ≤ 0.15 s, the validator
 *  checks the move still clears it), 0 on the route to another opening (nobody checks that move: a vehicle there never
 *  stands earlier than the row suggests), else 1.2–2.4 m earlier. Never abreast of another vehicle (≥ 1.2 m from
 *  every one already placed); the deep box clear of the template (deepFree). Null when no offset stands. */
function stagger(st: RowState, x0: number, x1: number, len: number, placed: readonly number[]): number | null {
  const crossed = x1 > st.colA && x0 < st.colB;
  const other = !crossed && st.cols.some(([a, b]) => x1 > a && x0 < b);
  const [s0, s1] = GEN.rows.stagger;
  const opts = crossed ? (placed.length ? [0, -s0] : [0]) : other ? [0] : [-round1cm(st.rng.range(s0, Math.max(s0, s1))), -s0, 0];
  // (a second vehicle off every route stands ≥ GEN.rows.apart from the others when it can: two cars 1.2 m apart in s
  // read as abreast, a jam, at phone scale; ≥ 2.2 m reads as two cars that stopped as they passed. It still covers the
  // row band, so the row's lanes do not change; falls back to the ≥ s0 offsets below)
  if (!crossed && !other && placed.length) {
    const apart = GEN.rows.apart, deep = -(len - ROW_BAND - 0.1);
    const wide = [...opts, ...placed.flatMap((p) => [round1cm(p - apart), round1cm(p + apart)])]
      .filter((d) => d <= 0 && d >= deep && placed.every((p) => Math.abs(p - d) >= apart - 1e-6));
    for (const ds of wide) if (st.ctx.free(x0, x1, st.sr + ds, st.sr + ds + len)) return ds;
  }
  for (const ds of opts) {
    if (placed.some((p) => Math.abs(p - ds) < s0 - 1e-6)) continue;
    if (st.ctx.free(x0, x1, st.sr + ds, st.sr + ds + len)) return ds;
  }
  return null;
}

/** The class order of a road part: its one-vehicle recipes first with the block's chance (else last), a pair last
 *  (but on a busy block), each reordered by the last rows (no scene a third time running, no 2-vehicle row after a
 *  2-vehicle row, squeezes rare). The openings were picked for what closes their road naturally (rowCloses), so the
 *  order mostly chooses between what the block's mood makes equally likely. */
function classOrder(st: RowState, pi: number): Cls[] {
  if (st.ctx.pVeh <= 0) return ['clear'];
  const h = st.ctx.hist, rng = st.rng;
  const vehFirst = rng.chance(st.ctx.pVeh);
  const twice = (sc: Scene | Cls) => h.length >= 2 && h[0]!.scene === sc && h[1]!.scene === sc;
  // (at the kerb first more often: a kerb car fits fewer roads, so it gets its chance when it does)
  const one: Cls[] = rng.chance(GEN.rows.kerbFirst) ? ['kerb', 'lane'] : ['lane', 'kerb'];
  one.sort((p, q) => (twice(p) ? 1 : 0) - (twice(q) ? 1 : 0));
  const pairLate = h.length > 0 && h[0]!.veh >= 2;
  // A vehicle here would be the row's second, in another part: a squeeze (≤ 1 row in 4) and never a second 2-vehicle
  // row running, unless nothing else closes (a car beside the opening before a bin in the middle of the road).
  if (st.veh.some((v) => v.part !== pi)) {
    return pairLate || h.slice(0, 3).some((x) => x.scene === 'squeeze') ? ['clear', ...one] : vehFirst ? [...one, 'clear'] : ['clear', ...one];
  }
  // (two side by side in opposite lanes only where one vehicle and the kerb kit cannot close the part: on a busy
  // block before the kit-only fill, Neon's yatai in the road; elsewhere after it)
  const busy = st.ctx.mood === 'busy', quiet = st.ctx.mood === 'quiet';
  const vs: Cls[] = busy && !pairLate ? [...one, 'pair'] : [...one];
  const order: Cls[] = (vehFirst || twice('clear')) && !(quiet && !twice('clear')) ? [...vs, 'clear'] : ['clear', ...vs];
  if (!busy || pairLate) order.push('pair');
  // (a scene the last two rows had goes last: never three running unless nothing else closes)
  const late = (k: Cls) => (twice(k) ? 1 : 0);
  return order.sort((p, q) => late(p) - late(q));
}

/** Development hooks (tests, analysis): `onMixed` for every road part the mixed kit fills, `onOpen` for every centre
 *  gateOpenings draws (its candidates and their weights), `onRow` for every row gateRow builds (tries included). */
export const ROW_DEBUG: { onMixed: ((info: { area: AreaId; a: number; b: number; ea: string; eb: string; why: string }) => void) | null;
  onOpen?: (info: { x0: number; cand: readonly number[]; scores: readonly number[]; pick: number }) => void;
  onRow?: (info: { area: AreaId; x0: number; centres: readonly number[]; w: number; sig: RowSig; mood?: Mood }) => void } = { onMixed: null };

/** Fills one road part (classOrder, then the mixed kit). */
function closeRoad(pt: Part, pi: number, st: RowState): Placed[] {
  const order = classOrder(st, pi);
  for (const relax of [false, true]) for (const cls of order) {
    const got = tryClass(pt, pi, cls, st, relax);
    if (got) return got;
  }
  // (a car stopped across the centre line, alone or double-parked, before street furniture in the middle of the road)
  if (st.ctx.pVeh > 0) for (const relax of [false, true]) for (const cls of ['mid', 'double'] as const) {
    const got = tryClass(pt, pi, cls, st, relax);
    if (got) return got;
  }
  st.mixed = true;
  if (ROW_DEBUG.onMixed) {
    // (why: some composition fitted the part but its deep box or stagger did not stand, or none fitted at all)
    const geom = (['clear', 'kerb', 'lane', 'pair', 'mid', 'double'] as const).some((cls) => compositions(pt, cls, st, true).some((g) => g.some((cand) => {
      const [items, hA, hB] = itemsOf(pt, cand.items);
      return !!place(pt.a, pt.b, items, hA, hB, null);
    })));
    ROW_DEBUG.onMixed({ area: st.area, a: pt.a, b: pt.b, ea: pt.ea, eb: pt.eb, why: (geom ? 'deep' : 'geom') + (st.ctx.pVeh > 0 ? '' : '-noveh') });
  }
  return mixedFill(pt, st);
}

const asKit = (a: AreaId): Kit[] => rowPalette(a);
function mixedFill(pt: Part, st: RowState): Placed[] {
  const hA = partEnd(pt, 'a', false), hB = partEnd(pt, 'b', false);
  return fillKit(pt.a, pt.b, asKit(st.area), hA, hB, st.rng) ?? fillNarrow(pt, asKit(st.area));
}

/** Fills one part of a zone other than the road. */
function fillOther(pt: Part, pi: number, st: RowState): Placed[] {
  const hA = partEnd(pt, 'a', false), hB = partEnd(pt, 'b', false);
  if (pt.zone === 'dock') {
    // A box truck or a container on the dock band (the truck is the band's vehicle recipe).
    // (the block's chance, but never the same scene a third time running: a truck after two piles, piles after two
    // trucks)
    const h = st.ctx.hist, twice = (sc: Scene) => h.length >= 2 && h[0]!.scene === sc && h[1]!.scene === sc;
    const vehFirst = st.ctx.pVeh > 0 && !st.veh.length && !twice('kerb') && (twice('clear') || st.rng.chance(st.ctx.pVeh));
    const truck: Veh & { half: -1; mode: 'kerb' } = { ...DOCK_TRUCK, half: -1, mode: 'kerb' };
    const fills: (() => Placed[] | null)[] = [
      () => {
        if (st.veh.length || st.ctx.pVeh <= 0) return null;
        const xs = place(pt.a, pt.b, [{ w: truck.wid, c: [-truck.hi, -truck.lo] }], endRange(pt.ea, true), endRange(pt.eb, true), st.rng);
        if (!xs) return null;
        const ds = stagger(st, xs[0]!, xs[0]! + truck.wid, truck.len, st.veh.map((v) => v.ds));
        if (ds === null) return null;
        st.veh.push({ x: xs[0]! + truck.wid / 2, ds, part: pi, kerb: true, wid: truck.wid });
        return [{ p: truck, x0: xs[0]!, veh: true, ds }];
      },
      () => {
        const xs = place(pt.a, pt.b, [{ w: DOCK_BOX.wid }], hA, hB, st.rng);
        return xs && st.ctx.free(xs[0]!, xs[0]! + DOCK_BOX.wid, st.sr, st.sr + DOCK_BOX.len) ? [{ p: DOCK_BOX, x0: xs[0]!, veh: false, ds: 0 }] : null;
      },
      () => fillKit(pt.a, pt.b, rowKit('docks', 'pile'), hA, hB, st.rng, { oneGroup: true }),
    ];
    const order = vehFirst ? [0, 2, 1] : st.rng.chance(0.5) ? [2, 1, 0] : [1, 2, 0];
    for (const k of order) { const got = fills[k]!(); if (got) return got; }
    return fillKit(pt.a, pt.b, asKit('docks'), hA, hB, st.rng) ?? fillNarrow(pt, asKit('docks'));
  }
  if (pt.zone === 'apron') {
    return fillKit(pt.a, pt.b, rowKit('docks', 'pile'), hA, hB, st.rng, { oneGroup: true })
      ?? fillKit(pt.a, pt.b, asKit('docks'), hA, hB, st.rng) ?? fillNarrow(pt, asKit('docks'));
  }
  // Sidewalks, verges, lawns, plazas: the area's street furniture (on a plaza grouped by kind; in Neon the vending
  // machines against the facade).
  const kit = rowKit(st.area, 'walk');
  const plaza = st.ctx.layout.curbX === null;
  const outer: -1 | 1 | undefined = st.area === 'neon' ? (pt.ea === 'edge' ? -1 : pt.eb === 'edge' ? 1 : undefined) : undefined;
  return fillKit(pt.a, pt.b, kit, hA, hB, st.rng, { grouped: plaza, ...(outer ? { outer } : {}) })
    ?? fillKit(pt.a, pt.b, asKit(st.area), hA, hB, st.rng)
    ?? fillNarrow(pt, kit);
}

/** The runs of a row: [r0, r1, end types], between the openings and the template keep-outs. */
function runsOf(centres: readonly number[], w: number, keepOut: readonly (readonly [number, number])[], xEnd: number): [number, number, End, End][] {
  const pad = GEN.gate.keepPad;
  const open = [...centres.map((x) => [x - w / 2, x + w / 2, 'open'] as const), ...keepOut.map(([a, b]) => [a - pad, b + pad, 'keep'] as const)]
    .sort((p, q) => p[0] - q[0]);
  let a = -4.5, ea: End = 'edge';
  const runs: [number, number, End, End][] = [];
  for (const [o0, o1, k] of open) {
    if (o0 > a) runs.push([a, Math.min(o0, xEnd), ea, o0 >= xEnd ? 'edge' : k]);
    if (o1 > a) { a = o1; ea = k; }
  }
  if (a < xEnd) runs.push([a, xEnd, ea, 'edge']);
  return runs.filter(([r0, r1]) => r1 - r0 >= 0.25);
}

/** A row across the corridor at sRow except the openings (width w) and the spans of `keepOut` (template obstacles
 *  beside it, kept GEN.gate.keepPad clear). With `ctx` (theme T8): everything where it belongs (above); without it,
 *  today's kit row (mixed pieces of the area kit, each run filled edge to edge). */
export function gateRow(sRow: number, centres: readonly number[], w: number, props: PropCtx, rng: Sfc32,
  keepOut: readonly (readonly [number, number])[] = [], ctx: RowCtx | null = null): RowBuild {
  const out: Obstacle[] = [];
  const xEnd = props.area === 'docks' ? LIP.x0 - LIP_CLEAR : 4.5;
  if (!ctx) {
    let variant = 0;
    const pad = GEN.gate.keepPad;
    const open = [...centres.map((x) => [x - w / 2, x + w / 2] as [number, number]), ...keepOut.map(([a, b]) => [a - pad, b + pad] as [number, number])]
      .sort((a, b) => a[0] - b[0]);
    let a = -4.5;
    for (const [o0, o1] of open) { if (o0 > a) variant = kitRun(out, a, Math.min(o0, xEnd), sRow, props, rng, variant); a = Math.max(a, o1); }
    if (a < xEnd) kitRun(out, a, xEnd, sRow, props, rng, variant);
    return { obs: out, sig: { scene: 'clear', veh: 0, side: 0 }, fill: 'kit' };
  }
  const cs = ctx.cSafe, hw = HITBOX.w / 2;
  const st: RowState = { ctx, area: props.area, sr: sRow, rng, veh: [], mixed: false, mid: false,
    colA: Math.min(ctx.x0, cs) - hw, colB: Math.max(ctx.x0, cs) + hw,
    cols: centres.slice(1).map((c) => [Math.min(ctx.x0, c) - hw, Math.max(ctx.x0, c) + hw] as const) };
  const placed: Placed[] = [];
  let van: Obstacle | null = null;
  let pi = 0;
  for (const [r0, r1, ea0, eb] of runsOf(centres, w, keepOut, xEnd)) {
    let ea = ea0, a0 = r0;
    // The Docks' van at its loading entrance: nosed in at the dock-side corridor edge, once a visit (never in a row
    // that keeps vehicles out: the no-vehicle retry, the easy re-rolls).
    if (props.area === 'docks' && ctx.van && ctx.pVeh > 0 && !van && ea === 'edge' && r0 <= -4.5 + 1e-6 && r1 >= -0.1 - 1e-6 && !st.veh.length
      && rng.chance(GEN.rows.van) && ctx.free(-4.5, -0.1, sRow, sRow + VAN_ACROSS.len)) {
      const rest = r1 - (-0.1);
      if (rest <= HOLE_MAX + 1e-6 && (eb === 'open' || eb === 'keep')) {
        van = buildVanAcross(sRow, -1, props, rng.int(0, 7), ObTag.Filler);
        st.veh.push({ x: van.x, ds: 0, part: pi++, kerb: true, wid: VAN_ACROSS.wid });
        continue;
      }
      if (rest >= 0.25 + GAP_MIN) {
        van = buildVanAcross(sRow, -1, props, rng.int(0, 7), ObTag.Filler);
        st.veh.push({ x: van.x, ds: 0, part: pi++, kerb: true, wid: VAN_ACROSS.wid });
        a0 = -0.1; ea = 'veh';
      }
    }
    const parts = partsOf(a0, r1, ea, eb, ctx.layout, props.area);
    if (!parts) {
      // (a sliver nothing fits: the run takes the mixed kit, edge to edge)
      const pt: Part = { a: a0, b: r1, ea, eb, zone: 'walk', dy: 0 };
      if (zonesOf(ctx.layout).some((z) => z.zone === 'road' && z.x1 > a0 && z.x0 < r1)) st.mixed = true;
      ROW_DEBUG.onMixed?.({ area: st.area, a: a0, b: r1, ea, eb, why: 'sliver' });
      placed.push(...mixedFill(pt, st));
      pi++;
      continue;
    }
    // (the road part first: its scene sets the row; then the sidewalks)
    const order = parts.map((_, i) => i).sort((i, j) => (parts[i]!.zone === 'road' ? 0 : 1) - (parts[j]!.zone === 'road' ? 0 : 1));
    for (const i of order) {
      const pt = parts[i]!;
      if (pt.narrow) {
        const w0 = pt.narrow.wid;
        placed.push({ p: pt.narrow, x0: pt.eb === 'joint' ? pt.b - JOINT[0] - w0 : pt.a + JOINT[0], veh: false, ds: 0 });
        continue;
      }
      if (pt.zone === 'road' && ctx.either && pt.ea === 'open' && pt.eb === 'open' && pt.a < 0 && pt.b > 0) {
        const got = eitherPair(pt, pi + i, st);
        if (got) { placed.push(...got); continue; }
      }
      const got = pt.zone === 'road' ? closeRoad(pt, pi + i, st) : fillOther(pt, pi + i, st);
      placed.push(...got);
      // (the joint holes it left: the pieces across them keep the two 0.05–0.14 m apart)
      if (pt.zone === 'road' && got.length) {
        const lo = Math.min(...got.map((g) => g.x0)), hi = Math.max(...got.map((g) => g.x0 + g.p.wid));
        const nb = (j: number) => parts[j];
        if (pt.ea === 'joint' && nb(i - 1)) { const r = lo - pt.a; nb(i - 1)!.jb = [Math.max(0, 0.05 - r), Math.max(0, GAP_MAX - r)]; }
        if (pt.eb === 'joint' && nb(i + 1)) { const r = pt.b - hi; nb(i + 1)!.ja = [Math.max(0, 0.05 - r), Math.max(0, GAP_MAX - r)]; }
      }
    }
    pi += parts.length;
  }
  // Build: vehicles at their (staggered) fronts, kit pieces 0–jitter m later.
  let variant = 0;
  if (van) out.push(van);
  for (const pl of placed) {
    const p = pl.p, xc = round1cm(pl.x0 + p.wid / 2);
    const s = pl.veh ? round1cm(sRow + pl.ds) : round1cm(sRow + rng.range(0, GEN.rows.jitter));
    const ob = buildTall(p.kind, s, xc, p.len, p.wid, p.hgt, props, { variant: pl.veh ? rng.int(0, 7) : variant++ % 3, tags: ObTag.Filler,
      ...(p.params ? { params: p.params } : {}) });
    if (p.skin) { const v = skinVariant(ob, p.skin); if (v >= 0) ob.variant = v; }
    out.push(ob);
  }
  const vs = st.veh;
  // (a vehicle within sideNeutral of the centre stands in the middle of the street, on neither side)
  const sides = new Set(vs.filter((v) => Math.abs(v.x) >= GEN.rows.sideNeutral - 1e-6).map((v) => Math.sign(v.x) as -1 | 1));
  const sqz = vs.length >= 2 && new Set(vs.map((v) => v.part)).size >= 2;
  const scene: Scene = !vs.length ? 'clear' : ctx.either && vs.length === 2 && !sqz ? 'either' : sqz ? 'squeeze'
    : partScene(vs.map((v) => ({ mode: v.mid ? 'mid' : v.kerb ? 'kerb' : 'lane' })));
  const sig: RowSig = { scene, veh: vs.length, side: sides.size === 1 ? [...sides][0]! : 0, ...(st.mid ? { mid: true } : {}) };
  ROW_DEBUG.onRow?.({ area: props.area, x0: ctx.x0, centres, w, sig, ...(ctx.mood ? { mood: ctx.mood } : {}) });
  return { obs: out, sig, fill: st.mixed ? 'mixed' : 'band' };
}

/** The either-side fork's middle: two cars stopped in opposite lanes, the one away from the committed line 1.2 m
 *  earlier (≤ 0.15 s at the fork's speed). */
function eitherPair(pt: Part, pi: number, st: RowState): Placed[] | null {
  const vs = roadVehicles(st.area).filter((v) => v.kind === 'parked_car');
  if (!vs.length) return null;
  const v = vs[0]!, kerbX = st.ctx.layout.curbX ?? 4.5;
  const hi = Math.min(v.hi, kerbX - JOINT[0] - v.wid / 2);
  const xs = place(pt.a, pt.b, [{ w: v.wid, c: [-hi, -v.lo] }, { w: v.wid, c: [v.lo, hi] }], [0, HOLE_MAX], [0, HOLE_MAX], st.rng);
  if (!xs) return null;
  const away = st.ctx.cSafe > 0 ? 0 : 1;
  const out: Placed[] = [];
  for (let i = 0; i < 2; i++) {
    const ds = i === away ? -GEN.rows.stagger[0] : 0;
    if (!st.ctx.free(xs[i]!, xs[i]! + v.wid, st.sr + ds, st.sr + ds + v.len)) return null;
    out.push({ p: { ...v, half: i ? 1 : -1, mode: 'lane' } as Veh, x0: xs[i]!, veh: true, ds });
  }
  for (let i = 0; i < 2; i++) st.veh.push({ x: xs[i]! + v.wid / 2, ds: out[i]!.ds, part: pi, kerb: false, wid: v.wid });
  return out;
}

/** The scene the next row must not repeat (the last two rows had it), if any. */
export const sceneToAvoid = (hist: readonly RowSig[]): Scene | undefined =>
  hist.length >= 2 && hist[0]!.scene === hist[1]!.scene ? hist[0]!.scene : undefined;
/** What the next row should avoid, from the last rows (rows.ts history rules): the scene and the side the last two
 *  rows had, a car mid-street in the last midEvery − 1 rows, a 2-vehicle row just before, a squeeze in the last 3. */
export interface Avoid { scene?: Scene; side: -1 | 0 | 1; mid: boolean; two?: boolean; sqz?: boolean; mood?: Mood }
export const avoidOf = (hist: readonly RowSig[], area: AreaId, mood?: Mood): Avoid =>
  ({ scene: sceneToAvoid(hist), side: sideToAvoid(hist, area), mid: hist.slice(0, GEN.rows.midEvery - 1).some((h) => h.mid),
    two: hist.length > 0 && hist[0]!.veh >= 2, sqz: hist.slice(0, 3).some((h) => h.scene === 'squeeze'), ...(mood ? { mood } : {}) });
/** The side the next row's vehicles keep off (the last two rows' vehicles all stood there), or 0. Not in the Docks,
 *  whose dock band is on one side. */
export const sideToAvoid = (hist: readonly RowSig[], area: AreaId): -1 | 0 | 1 =>
  area !== 'docks' && hist.length >= 2 && hist[0]!.veh > 0 && hist[1]!.veh > 0 && hist[0]!.side !== 0 && hist[0]!.side === hist[1]!.side ? hist[0]!.side : 0;

/** A natural fill of one road part (rowFits): its kind (GEN.rows.fit), its scene, the sides its vehicles stand on. */
interface FitOpt { cat: 'clear' | 'one' | 'pair' | 'mid'; scene: Scene; sides: readonly (-1 | 1)[] }
const CAT: Record<Cls, FitOpt['cat']> = { clear: 'clear', kerb: 'one', lane: 'one', pair: 'pair', mid: 'mid', double: 'mid' };
/** The natural fills of each road part (and the Docks' dock band) a row with openings at `centres` leaves; null when
 *  some road part only the mixed kit closes. Pure and history-blind (no draws, no deep check): cached. */
function rowFits(centres: readonly number[], w: number, area: AreaId, layout: StreetLayout,
  keepOut: readonly (readonly [number, number])[]): FitOpt[][] | null {
  const key = `${area}|${layout.id}|${w}|${centres.join(',')}|${keepOut.map((k) => k.join(':')).join(',')}`;
  const hit = FITS.get(key);
  if (hit !== undefined) return hit;
  const xEnd = area === 'docks' ? LIP.x0 - LIP_CLEAR : 4.5;
  const st: RowState = { ctx: { free: () => true, x0: 0, cSafe: 0, v: 8, pVeh: 1, hist: [], layout }, area, sr: 0, rng: NO_RNG,
    veh: [], mixed: false, mid: false, colA: 0, colB: 0, cols: [] };
  let out: FitOpt[][] | null = [];
  for (const [r0, r1, ea, eb] of runsOf(centres, w, keepOut, xEnd)) {
    const parts = partsOf(r0, r1, ea, eb, layout, area);
    if (!parts) { if (zonesOf(layout).some((z) => z.zone === 'road' && z.x1 > r0 && z.x0 < r1)) { out = null; break; } continue; }
    for (const pt of parts) {
      if (pt.zone === 'dock') {
        // (the Docks: a box truck on the dock band is the row's vehicle; piles and containers always close it)
        const xs = place(pt.a, pt.b, [{ w: DOCK_TRUCK.wid, c: [-DOCK_TRUCK.hi, -DOCK_TRUCK.lo] }], endRange(pt.ea, true), endRange(pt.eb, true), null);
        out.push([{ cat: 'clear', scene: 'clear', sides: [] }, ...(xs ? [{ cat: 'one' as const, scene: 'kerb' as const, sides: [-1 as const] }] : [])]);
        continue;
      }
      if (pt.zone !== 'road' || pt.narrow) continue;
      const opts: FitOpt[] = [], seen = new Set<string>();
      for (const cls of ['clear', 'kerb', 'lane', 'pair', 'mid', 'double'] as const) {
        for (const g of compositions(pt, cls, st, true)) for (const cand of g) {
          const vs = cand.items.filter(isVeh);
          const sides = vs.map((v) => (v.half < 0 ? -1 : 1) as -1 | 1);
          const k = `${cls}|${sides.join(',')}`;
          if (seen.has(k)) continue;
          const [items, hA, hB] = itemsOf(pt, cand.items);
          if (!place(pt.a, pt.b, items, hA, hB, null)) continue;
          seen.add(k);
          opts.push({ cat: CAT[cls], scene: partScene(vs), sides });
        }
      }
      if (!opts.length) { out = null; break; }
      out.push(opts);
    }
    if (!out) break;
  }
  if (FITS.size > 20000) FITS.clear();
  FITS.set(key, out);
  return out;
}
const FITS = new Map<string, FitOpt[][] | null>();

/** How naturally a row with openings at `centres` (width w) closes where everything belongs, as gateOpenings' weight
 *  for those centres: 0 when some road part needs the mixed kit, else the weight (GEN.rows.fit) of the least natural
 *  of its road parts' best fills, for the block's mood and the last rows (`av`). Pure: no draws, no deep check. */
export function rowCloses(centres: readonly number[], w: number, area: AreaId, layout: StreetLayout,
  keepOut: readonly (readonly [number, number])[] = [], av: Avoid = { side: 0, mid: false }): number {
  const fits = rowFits(centres, w, area, layout, keepOut);
  if (!fits) return 0;
  const R = GEN.rows, W = R.fit[av.mood ?? 'normal'];
  if (!fits.length) return W.clear;
  let row = Infinity, vehParts = 0;
  for (const opts of fits) {
    let best = 0, veh = false;
    for (const o of opts) {
      let x = W[o.cat];
      if (o.scene === av.scene) x *= R.fitAgain;
      if (av.side && o.sides.length && o.sides.every((sd) => sd === av.side)) x *= R.fitHist;
      if (o.cat === 'pair' && av.two) x *= R.fitHist;
      if (o.cat === 'mid' && av.mid) x *= R.fitMidAgain;
      if (x > best) { best = x; veh = o.cat !== 'clear'; }
    }
    row = Math.min(row, best);
    if (veh) vehParts++;
  }
  // (vehicles in two road parts flank an opening: a squeeze, rare)
  if (vehParts >= 2) row *= av.sqz ? R.fitHist * R.fitHist : R.fitHist;
  // (an opening at the corridor's outer sidewalk leaves a rider on the far one just over the validator's 2 s dead-end
  // limit from it: such rows mostly fail validation, so they are drawn less)
  if (centres.length === 1 && Math.abs(centres[0]!) > R.farOpen[0] + 1e-6) row *= R.farOpen[1];
  // (and one that leaves the line where the next row's forced move only reaches openings a car across the centre
  // line closes: Downtown's line 0.6–1.2 m off the centre)
  if (centres.length === 1 && !keepOut.length && midNext(centres[0]!, w, area, layout)) row *= R.midNext;
  return row;
}

/** Does every opening the next row's forced move reaches from x (2.8–3.7 m away, GEN.gate.shift) need a car across
 *  the centre line (or the mixed kit)? History-blind, cached: the one-row look-ahead of rowCloses. */
function midNext(x: number, w: number, area: AreaId, layout: StreetLayout): boolean {
  if (layout.curbX === null) return false;
  const key = `${area}|${layout.id}|${w}|${x}`;
  const hit = MID_NEXT.get(key);
  if (hit !== undefined) return hit;
  const [d0, d1] = GEN.gate.shift;
  let any = false, natural = false;
  for (let k = 0; k <= 66 && !natural; k++) {
    const c = round1cm(-GEN.gate.maxC + k * 0.1), d = Math.abs(c - x);
    if (d < d0 - 1e-6 || d > d1 + 1e-6) continue;
    any = true;
    const f = rowFits([c], w, area, layout, []);
    natural = !!f && f.every((opts) => opts.some((o) => o.cat !== 'mid'));
  }
  const v = any && !natural;
  if (MID_NEXT.size > 4000) MID_NEXT.clear();
  MID_NEXT.set(key, v);
  return v;
}
const MID_NEXT = new Map<string, boolean>();

/** An at-the-line row's opening centre: the line's x, or up to 0.2 m beside it (the line still passes inside its
 *  guide, ±0.25 m, without a move) where the row then closes most naturally (rowCloses). `ok`: lanes and keep-outs. */
export function nudgeOpening(x: number, w: number, area: AreaId, layout: StreetLayout, keepOut: readonly (readonly [number, number])[],
  ok: (c: number) => boolean, av?: Avoid): number {
  let best = x, bs = -1;
  for (const d of [0, -0.05, 0.05, -0.1, 0.1, -0.15, 0.15, -0.2, 0.2]) {
    const c = round1cm(x + d);
    if (Math.abs(c) > GEN.gate.maxC + 1e-6 || !ok(c)) continue;
    const sc = rowCloses([c], w, area, layout, keepOut, av);
    if (sc > bs + 1e-9) { best = c; bs = sc; }
  }
  return best;
}
/** (rowCloses draws nothing: a stand-in the pure check never calls.) */
const NO_RNG = { float: () => 0.5, int: (a: number) => a, range: (a: number) => a, chance: () => false, weighted: <T>(xs: readonly (readonly [T, number])[]) => xs[0]![0] } as unknown as Sfc32;

/** Fills the run [r0, r1] at sRow with pieces of the area's row kit, edge to edge (GAP_MIN–GAP_MAX apart), into
 *  `out`; returns the next variant. Runs under 0.25 m stay open. Today's kit row and the filler wall's remainder. An
 *  end at the corridor edge (or the lip), or one the caller marks (`holeL` / `holeR`), may keep a hole ≤ GAP_MAX, so
 *  fewer pieces close the run; an end beside an opening never does. */
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
 *  when L is below every width): the fewest pieces that close the run, so a row reads as a few real things, not a
 *  fence of the narrowest kit piece: among the piece multisets of the smallest count that fit, one is drawn by the
 *  product of the pieces' weights, in a shuffled order. */
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

export interface Openings { centres: number[]; either: boolean }
/** Opening centres for a row that forces a move (A2 + straight-bot rule): within ±maxC, 2.8–4.0 m from the line's
 *  x0, lanes disjoint from the last row's lanes, clear of `keepOut`; an optional second opening. Relaxed in steps
 *  when nothing fits (the lanes rule never is). Theme T8: in the first scan tier that finds any, a centre is drawn by
 *  how naturally its row closes (`closes`, rowCloses: the block's mood and the last rows; GEN.rows.fitMixed when it
 *  needs the mixed kit); on T2–T3, near the centre and fast, an either-side fork (GEN.rows.either): two openings on the sidewalks, two
 *  stopped cars between them. */
export function gateOpenings(rng: Sfc32, x0: number, last: Lanes, tier: Tier,
  keepOut: readonly (readonly [number, number])[] = [], opt: { closes?: (cs: readonly number[]) => number; v?: number } = {}): Openings | null {
  const w = GEN.gate.width[tier];
  const clear = (x: number) => !keepOut.some(([a, b]) => x + w / 2 > a - GEN.gate.keepPad && x - w / 2 < b + GEN.gate.keepPad);
  const far = (x: number) => lanesApart([openingLanes(x, w)], last) && clear(x);
  const R = GEN.rows;
  // The either-side fork.
  const pe = R.either[tier] ?? 0;
  if (opt.closes && pe > 0 && Math.abs(x0) <= R.eitherX0 + 1e-6 && (opt.v ?? 0) >= R.eitherV && rng.chance(pe)) {
    const legal = (x: number) => { const d = Math.abs(x - x0); return d >= GEN.gate.shift[0] && d <= GEN.gate.shift[1] && far(x) && Math.abs(x) <= GEN.gate.maxC + 1e-6; };
    const pairs: [number, number][] = [];
    for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) {
      const l = round1cm(-3.0 - i * 0.1), r = round1cm(3.0 + j * 0.1);
      if (!legal(l) || !legal(r) || !lanesApart([openingLanes(l, w)], [openingLanes(r, w)], 1.0)) continue;
      let room = 0;
      for (let k = 0; k <= 66; k++) {
        const x = -GEN.gate.maxC + k * 0.1;
        if (lanesApart([openingLanes(x, w)], [openingLanes(l, w), openingLanes(r, w)])) room += 0.1;
      }
      if (room >= 1.0 && opt.closes([l, r]) > 0) pairs.push([l, r]);
    }
    if (pairs.length) {
      const [l, r] = pairs[rng.int(0, pairs.length - 1)]!;
      // (the committed line takes the side the line leans to)
      const right = x0 > 0.05 ? true : x0 < -0.05 ? false : rng.chance(0.5);
      return { centres: right ? [r, l] : [l, r], either: true };
    }
  }
  let cand: number[] = [];
  let tierOk: ((x: number) => boolean) | null = null;
  const scan = (ok: (x: number) => boolean) => {
    if (!cand.length) { for (let i = 0; i <= 66; i++) { const x = round1cm(-GEN.gate.maxC + i * 0.1); if (ok(x)) cand.push(x); } if (cand.length) tierOk = ok; }
  };
  // Prefer a real move (A2) the myopic player can still make, then no move at all (the line already left the last
  // lanes), then anything apart from the last lanes (the straight-bot guarantee needs only that).
  scan((x) => { const d = Math.abs(x - x0); return d >= GEN.gate.shift[0] && d <= GEN.gate.shift[1] && far(x); });
  scan((x) => far(x) && Math.abs(x - x0) <= 1.0);
  scan((x) => far(x) && Math.abs(x - x0) <= GEN.gate.shift[1]);
  scan((x) => far(x));
  if (!cand.length) return null;
  // (closes: 0 needs the mixed kit, else how naturally the row closes; when no centre of the tier closes, the
  // half-way centres are tried: a row's pieces only fit some widths)
  let scores = opt.closes ? cand.map((x) => opt.closes!([x])) : [];
  if (opt.closes && scores.every((sc) => sc === 0)) {
    const half = cand.map((x) => round1cm(x + 0.05)).filter((x) => Math.abs(x) <= GEN.gate.maxC + 1e-6 && tierOk!(x));
    const hs = half.map((x) => opt.closes!([x]));
    if (hs.some((sc) => sc > 0)) { cand = half; scores = hs; }
  }
  const pick = opt.closes && R.openPrefer
    ? rng.weighted(cand.map((x, i) => [x, scores[i]! || R.fitMixed] as const))
    : cand[rng.int(0, cand.length - 1)]!;
  const centres = [pick];
  ROW_DEBUG.onOpen?.({ x0, cand, scores, pick });
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
  return { centres, either: false };
}
