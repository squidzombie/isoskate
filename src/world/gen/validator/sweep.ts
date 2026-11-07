// world/gen/validator/sweep.ts: the validator's passes over the raster (DESIGN §10.6.2–10.6.5, TECH §5.2).
//  - forward reachability F (from the stored plane set at the window start), backward viability B (to the template's
//    exit set plus 1 s of open entry), both over the ground plane and the pop planes (class h, k), as bitsets;
//  - the dead-end rule (h): every state in F \ B dies within 2.0 s (a backward max-survival over F \ B only, which is
//    closed under successors, with two rolling slices);
//  - the minimum-action path: a cost-to-go DP over (slice, cell, last lateral direction) on F ∩ B with straight ollie
//    macros (cost = ollies + direction changes + 0.1 × metres, plus small comfort penalties next to non-viable cells
//    and in the last 0.2 s before a forced move), then a forward extraction that prefers holding (late, comfortable
//    moves);
//  - the greedy-player check (rule i): one deterministic myopic trajectory from the safe exit state.
// Everything uses module-level scratch: nothing is allocated per validation except the small result arrays.
import { CAPTURE, DT, HITBOX, R_MIN, T_SHIFT, V_LAT_MAX, VALIDATOR } from '../../../core/tuning';
/** The safe line never ollies with a non-pickOnly edge within this lateral distance while its arc is in that edge's
 *  capture band (the capture radius plus the followers' tracking margin): bots following it are never captured. */
export const CAPTURE_ZONE = CAPTURE.lat + 0.3;
import {
  HI_MASK, KMAX, MAX_SLICES, NC, NH_MAX, NPLANES, RASTER, SLICE, bitTest, cellOf, cellX, nA, nG, planeOf, type Raster,
} from './grid';

export const F = new Int32Array(MAX_SLICES * NPLANES * 2);
export const B = new Int32Array(MAX_SLICES * NPLANES * 2);
/** Per (slice, class, k): pruned cells (airBlocked) and touched-down cells (landed) of the pop planes. */
const AB = new Int32Array(MAX_SLICES * NH_MAX * (KMAX + 2) * 2);
const AL = new Int32Array(MAX_SLICES * NH_MAX * (KMAX + 2) * 2);
const abo = (i: number, h: number, k: number) => ((i * NH_MAX + h) * (KMAX + 2) + k) * 2;
const fo = (i: number, p: number) => (i * NPLANES + p) * 2;

const spL = (lo: number, hi: number) => (lo | (lo << 1) | (lo >>> 1) | (hi << 31)) | 0;
const spH = (lo: number, hi: number) => (hi | (hi << 1) | (hi >>> 1) | (lo >>> 31)) & HI_MASK;
const ALL_LO = -1, ALL_HI = HI_MASK;

/** One plane's state at one slice, for storing / restoring across segments (class by height, not index). */
export interface PlaneBits { h: number | null; k: number; lo: number; hi: number }   // h null = ground

export function precomputePlanes(r: Raster): void {
  const blk = NH_MAX * (KMAX + 2) * 2;
  for (let i = 0; i < r.n; i++) {
    // Most slices repeat the previous one (same thresholds and ground levels, no pits): copy its planes.
    if (i > 0 && r.same[i]) { AB.copyWithin(i * blk, (i - 1) * blk, i * blk); AL.copyWithin(i * blk, (i - 1) * blk, i * blk); continue; }
    for (let h = 0; h < r.nh; h++) {
      for (let k = 1; k <= KMAX + 1; k++) {
        const o = abo(i, h, k);
        if (k > r.kMax[h]!) { AB[o] = 0; AB[o + 1] = 0; AL[o] = ALL_LO; AL[o + 1] = ALL_HI; continue; }
        const q = h * (KMAX + 1) + k;
        r.airBlocked(i, r.pyLo[q]!, r.pyHi[q]!, AB, o);
        if (r.pvy[q]! > 0) { AL[o] = 0; AL[o + 1] = 0; } else r.landed(i, r.py[q]!, AL, o);
      }
    }
  }
}

/** A stored plane mapped into this raster at local slice i: air states that have touched down here (or whose class
 *  this window does not model) are ground states. */
function resolvePlane(r: Raster, i: number, pb: PlaneBits): { p: number; lo: number; hi: number; glo: number; ghi: number } {
  if (pb.h === null) return { p: -1, lo: 0, hi: 0, glo: pb.lo, ghi: pb.hi };
  let h = -1;
  for (let q = 0; q < r.nh; q++) if (Math.abs(r.classes[q]! - pb.h) < 0.005) { h = q; break; }
  if (h < 0 || pb.k > r.kMax[h]!) return { p: -1, lo: 0, hi: 0, glo: pb.lo, ghi: pb.hi };
  const o = abo(i, h, pb.k);
  const ll = AL[o]!, lh = AL[o + 1]!;
  return { p: planeOf(h, pb.k), lo: pb.lo & ~ll, hi: pb.hi & ~lh & HI_MASK, glo: pb.lo & ll, ghi: pb.hi & lh };
}

/** Forward pass. `init` = planes at local slice 0. */
export function forward(r: Raster, init: readonly PlaneBits[]): void {
  const n = r.n;
  F.fill(0, 0, n * NPLANES * 2);
  for (const pb of init) {
    const m = resolvePlane(r, 0, pb);
    F[0] = F[0]! | m.glo; F[1] = F[1]! | m.ghi;
    if (m.p >= 0) { F[fo(0, m.p)] = F[fo(0, m.p)]! | m.lo; F[fo(0, m.p) + 1] = F[fo(0, m.p) + 1]! | m.hi; }
  }
  F[0] = F[0]! & r.gOK[0]!; F[1] = F[1]! & r.gOK[1]!;
  for (let i = 0; i < n - 1; i++) {
    const j = r.j0 + i, ng = nG(j), na = nA(j);
    const a = fo(i, 0), b = fo(i + 1, 0);
    const okl = r.gOK[(i + 1) * 2]!, okh = r.gOK[(i + 1) * 2 + 1]!;
    let glo = 0, ghi = 0;
    const lo = F[a]!, hi = F[a + 1]!;
    if (lo | hi) {
      glo = ng ? spL(lo, hi) : lo; ghi = ng ? spH(lo, hi) : hi;
      for (let h = 0; h < r.nh; h++) {
        const fl = lo & r.flat[(i * NH_MAX + h) * 2]!, fh = hi & r.flat[(i * NH_MAX + h) * 2 + 1]!;
        if (!(fl | fh)) continue;
        airStep(r, i, h, 1, na ? spL(fl, fh) : fl, na ? spH(fl, fh) : fh);
        glo |= LAND_LO; ghi |= LAND_HI;
      }
    }
    for (let h = 0; h < r.nh; h++) {
      const km = r.kMax[h]!;
      for (let k = 1; k <= km; k++) {
        const o = fo(i, planeOf(h, k));
        const l = F[o]!, hh = F[o + 1]!;
        if (!(l | hh)) continue;
        airStep(r, i, h, k + 1, na ? spL(l, hh) : l, na ? spH(l, hh) : hh);
        glo |= LAND_LO; ghi |= LAND_HI;
      }
    }
    F[b] = F[b]! | (glo & okl); F[b + 1] = F[b + 1]! | (ghi & okh);
  }
}
let LAND_LO = 0, LAND_HI = 0;
/** Air states arriving in plane (h, k) at slice i + 1: airborne ones are stored, touched-down ones are returned in
 *  LAND_LO / LAND_HI (the caller ORs them into the ground plane, which applies the ground mask). */
function airStep(r: Raster, i: number, h: number, k: number, lo: number, hi: number): void {
  const o = abo(i + 1, h, Math.min(k, KMAX + 1));
  const ll = AL[o]!, lh = AL[o + 1]!;
  LAND_LO = lo & ll; LAND_HI = hi & lh;
  if (k > r.kMax[h]!) return;
  const p = fo(i + 1, planeOf(h, k));
  F[p] = F[p]! | (lo & ~ll & ~AB[o]!); F[p + 1] = F[p + 1]! | (hi & ~lh & ~AB[o + 1]! & HI_MASK);
}

/** Backward pass: B at the last slice = the exit cells (ground OK, or airborne and not pruned). */
export function backward(r: Raster): void {
  const n = r.n, last = n - 1;
  B.fill(0, 0, n * NPLANES * 2);
  const el = r.exitLo, eh = r.exitHi;
  B[fo(last, 0)] = r.gOK[last * 2]! & el; B[fo(last, 0) + 1] = r.gOK[last * 2 + 1]! & eh;
  for (let h = 0; h < r.nh; h++) for (let k = 1; k <= r.kMax[h]!; k++) {
    const o = abo(last, h, k), p = fo(last, planeOf(h, k));
    B[p] = ~AB[o]! & ~AL[o]! & el; B[p + 1] = ~AB[o + 1]! & ~AL[o + 1]! & eh & HI_MASK;
  }
  for (let i = last - 1; i >= 0; i--) {
    const j = r.j0 + i, ng = nG(j), na = nA(j);
    const gn = fo(i + 1, 0), bgl = B[gn]!, bgh = B[gn + 1]!;
    let glo = ng ? spL(bgl, bgh) : bgl, ghi = ng ? spH(bgl, bgh) : bgh;
    for (let h = 0; h < r.nh; h++) {
      const km = r.kMax[h]!;
      for (let k = km; k >= 1; k--) {
        // Successor of (h, k) at i is (h, k + 1) at i + 1: airborne → its B, touched down → the ground B there.
        const on = abo(i + 1, h, k + 1);
        let sl = 0, sh = 0;
        if (k + 1 <= km) { const ps = fo(i + 1, planeOf(h, k + 1)); sl = B[ps]!; sh = B[ps + 1]!; }
        const el2 = (sl & ~AL[on]!) | (bgl & AL[on]!), eh2 = (sh & ~AL[on + 1]!) | (bgh & AL[on + 1]!);
        const pl = na ? spL(el2, eh2) : el2, ph = na ? spH(el2, eh2) : eh2;
        const oc = abo(i, h, k), p = fo(i, planeOf(h, k));
        B[p] = pl & ~AB[oc]! & ~AL[oc]!; B[p + 1] = ph & ~AB[oc + 1]! & ~AL[oc + 1]! & HI_MASK;
      }
      // Ground → pop (h, 1) at i + 1.
      const o1 = abo(i + 1, h, 1);
      let s1l = 0, s1h = 0;
      if (km >= 1) { const ps = fo(i + 1, planeOf(h, 1)); s1l = B[ps]!; s1h = B[ps + 1]!; }
      const e1l = (s1l & ~AL[o1]!) | (bgl & AL[o1]!), e1h = (s1h & ~AL[o1 + 1]!) | (bgh & AL[o1 + 1]!);
      const fl = r.flat[(i * NH_MAX + h) * 2]!, fh = r.flat[(i * NH_MAX + h) * 2 + 1]!;
      glo |= fl & (na ? spL(e1l, e1h) : e1l); ghi |= fh & (na ? spH(e1l, e1h) : e1h);
    }
    const g = fo(i, 0);
    B[g] = glo & r.gOK[i * 2]!; B[g + 1] = ghi & r.gOK[i * 2 + 1]!;
  }
}

/** Plane index of a stored plane (class by height) in this raster, or −1 when the class is not in the table. */
function classIndex(r: Raster, h: number, k: number): number {
  for (let q = 0; q < r.nh; q++) if (Math.abs(r.classes[q]! - h) < 0.005) return k <= r.kMax[q]! ? planeOf(q, k) : -1;
  return -1;
}

/** Planes at local slice i (nonzero only), as stored bits (class by height). `band` limits the cells (exit set E). */
export function planesAt(r: Raster, i: number, src: Int32Array, bandLo = ALL_LO, bandHi = ALL_HI, and?: Int32Array): PlaneBits[] {
  const out: PlaneBits[] = [];
  const g = fo(i, 0);
  const gl = src[g]! & bandLo & (and ? and[g]! : -1), gh = src[g + 1]! & bandHi & (and ? and[g + 1]! : -1);
  if (gl | gh) out.push({ h: null, k: 0, lo: gl | 0, hi: gh | 0 });
  for (let h = 0; h < r.nh; h++) for (let k = 1; k <= r.kMax[h]!; k++) {
    const p = fo(i, planeOf(h, k));
    const l = src[p]! & bandLo & (and ? and[p]! : -1), hh = src[p + 1]! & bandHi & (and ? and[p + 1]! : -1);
    if (l | hh) out.push({ h: r.classes[h]!, k, lo: l | 0, hi: hh | 0 });
  }
  return out;
}

/** Rule (a): every stored state (the previous committed exit set) is viable at local slice i. Returns the number of
 *  states outside B (0 = pass). */
export const EXIT_FAIL = { text: '' };
export function exitSetViolations(r: Raster, i: number, e: readonly PlaneBits[]): number {
  let bad = 0;
  EXIT_FAIL.text = '';
  for (const pb of e) {
    const m = resolvePlane(r, i, pb);
    const g = fo(i, 0);
    let lo = m.glo & ~B[g]!, hi = m.ghi & ~B[g + 1]! & HI_MASK;
    if (m.p >= 0) { lo |= m.lo & ~B[fo(i, m.p)]!; hi |= m.hi & ~B[fo(i, m.p) + 1]! & HI_MASK; }
    const n = popcnt(lo) + popcnt(hi);
    if (n && !EXIT_FAIL.text) {
      const c = lo ? 31 - Math.clz32(lo & -lo) : 32 + 31 - Math.clz32(hi & -hi);
      EXIT_FAIL.text = `plane h=${pb.h} k=${pb.k} p=${m.p} cell ${c} x=${cellX(c)} t=${r.t[i]!.toFixed(3)}`;
    }
    bad += n;
  }
  return bad;
}
const popcnt = (x: number) => { let n = 0; x |= 0; while (x) { x &= x - 1; n++; } return n; };

// ── Rule (h): dead ends ──────────────────────────────────────────────────────────────────────────────────────────
const M0 = new Uint8Array(NPLANES * NC), M1 = new Uint8Array(NPLANES * NC);
const RUN = new Int32Array(MAX_SLICES), LONG = new Uint8Array(MAX_SLICES);

/** Longest survival (slices) of any state in F \ B at local slices [iFrom, iTo]; survival counts the state's own
 *  slice. Successors of a doomed state are doomed (or dead), so only F \ B is visited. */
export function worstDeadEnd(r: Raster, iFrom: number, iTo: number, limit = Infinity): { slices: number; i: number; c: number } {
  // Successors of doomed states are doomed or dead, so no doomed state outlives its run of slices with a non-empty
  // F \ B, and runs are independent: only runs longer than the limit need the per-state pass. Short runs report
  // their length (an upper bound).
  let run = 0, shortMax = 0;
  for (let i = 0; i < r.n; i++) {
    const g = fo(i, 0);
    let any = ((F[g]! & ~B[g]!) | (F[g + 1]! & ~B[g + 1]! & HI_MASK)) !== 0;
    for (let h = 0; h < r.nh && !any; h++) {
      const km = r.kMax[h]!;
      for (let k = 1; k <= km; k++) {
        const o = fo(i, 1 + h * KMAX + (k - 1));
        if ((F[o]! & ~B[o]!) | (F[o + 1]! & ~B[o + 1]! & HI_MASK)) { any = true; break; }
      }
    }
    run = any ? run + 1 : 0;
    RUN[i] = run;
  }
  // Mark the slices of long runs (walking back from each run's end).
  let anyLong = false;
  for (let i = r.n - 1; i >= 0; i--) {
    if (!RUN[i]) { LONG[i] = 0; continue; }
    const len = RUN[i]!, i0 = i - len + 1;
    const long = len > limit ? 1 : 0;
    if (long) anyLong = true;
    else if (i0 <= iTo && i >= iFrom) shortMax = Math.max(shortMax, len);
    for (let k = i; k >= i0; k--) LONG[k] = long;
    i = i0;
  }
  if (!anyLong) return { slices: shortMax, i: -1, c: -1 };
  let worst = shortMax, wi = -1, wc = -1;
  let cur = M0, nxt = M1;
  for (let i = r.n - 1; i >= 0; i--) {
    if (!LONG[i]) continue;
    const j = r.j0 + i, ng = nG(j), na = nA(j);
    const hasNext = i < r.n - 1;
    // Ground.
    const g = fo(i, 0);
    let dl = F[g]! & ~B[g]!, dh = F[g + 1]! & ~B[g + 1]! & HI_MASK;
    const gn = fo(i + 1, 0);
    const ndl = hasNext ? F[gn]! & ~B[gn]! : 0, ndh = hasNext ? F[gn + 1]! & ~B[gn + 1]! & HI_MASK : 0;
    while (dl | dh) {
      const c = dl ? 31 - Math.clz32(dl & -dl) : 32 + 31 - Math.clz32(dh & -dh);
      if (c < 32) dl &= dl - 1; else dh &= dh - 1;
      let best = 0;
      if (hasNext) {
        for (let d = -ng; d <= ng; d++) { const c2 = c + d; if (c2 >= 0 && c2 < NC && bitTest(ndl, ndh, c2)) best = Math.max(best, nxt[c2]!); }
        const hc = classOfCell(r, i, c);
        if (hc >= 0) best = Math.max(best, airSucc(r, i, hc, 1, c, na, nxt));
      }
      const m = Math.min(255, best + 1);
      cur[c] = m;
      if (i >= iFrom && i <= iTo && m > worst) { worst = m; wi = i; wc = c; }
    }
    // Air planes.
    for (let h = 0; h < r.nh; h++) for (let k = 1; k <= r.kMax[h]!; k++) {
      const p = fo(i, planeOf(h, k));
      let al = F[p]! & ~B[p]!, ah = F[p + 1]! & ~B[p + 1]! & HI_MASK;
      while (al | ah) {
        const c = al ? 31 - Math.clz32(al & -al) : 32 + 31 - Math.clz32(ah & -ah);
        if (c < 32) al &= al - 1; else ah &= ah - 1;
        const best = hasNext ? airSucc(r, i, h, k + 1, c, na, nxt) : 0;
        const m = Math.min(255, best + 1);
        cur[planeOf(h, k) * NC + c] = m;
        if (i >= iFrom && i <= iTo && m > worst) { worst = m; wi = i; wc = c; }
      }
    }
    const t = cur; cur = nxt; nxt = t;
  }
  return { slices: worst, i: wi, c: wc };
}
/** Best survival among the successors in plane (h, k) at i + 1 (touched down → ground) of cell c (doomed ones only). */
function airSucc(r: Raster, i: number, h: number, k: number, c: number, na: number, nxt: Uint8Array): number {
  let best = 0;
  const on = abo(i + 1, h, Math.min(k, KMAX + 1));
  const gn = fo(i + 1, 0);
  const dgl = F[gn]! & ~B[gn]!, dgh = F[gn + 1]! & ~B[gn + 1]!;
  const air = k <= r.kMax[h]!;
  const pn = air ? fo(i + 1, planeOf(h, k)) : 0;
  const dal = air ? F[pn]! & ~B[pn]! : 0, dah = air ? F[pn + 1]! & ~B[pn + 1]! : 0;
  for (let d = -na; d <= na; d++) {
    const c2 = c + d;
    if (c2 < 0 || c2 >= NC) continue;
    if (bitTest(AL[on]!, AL[on + 1]!, c2)) { if (bitTest(dgl, dgh, c2)) best = Math.max(best, nxt[c2]!); }
    else if (air && bitTest(dal, dah, c2)) best = Math.max(best, nxt[planeOf(h, k) * NC + c2]!);
  }
  return best;
}
export function classOfCell(r: Raster, i: number, c: number): number {
  for (let h = 0; h < r.nh; h++) if (bitTest(r.flat[(i * NH_MAX + h) * 2]!, r.flat[(i * NH_MAX + h) * 2 + 1]!, c)) return h;
  return -1;
}

// ── The minimum-action path ──────────────────────────────────────────────────────────────────────────────────────
const INF = 0x3fffffff;
const COST = new Int32Array(MAX_SLICES * NC * 3);
const HOLD = new Int32Array(MAX_SLICES * NC);
const PEN = new Int32Array(MAX_SLICES * NC);
export const DP_COST = { action: 1000, perCell: 25, edge: 6, late: 30, lateSlices: 6, guide: 5 } as const;
/** Line guides (template hints such as a gate opening's centre): local slices [i0, i1] prefer cells [c0, c1]. */
export const GUIDES: { i0: number; i1: number; c0: number; c1: number }[] = [];
/** Local slice ranges where starting an action costs extra (a template's head and tail windows, DESIGN §10.5). */
export const QUIET: { i0: number; i1: number }[] = [];
const quiet = (i: number) => { for (const q of QUIET) if (i >= q.i0 && i <= q.i1) return 600; return 0; };
function guidePen(i: number, c: number, nGuides: number): number {
  let pen = 0;
  for (let gI = 0; gI < nGuides; gI++) {
    const g = GUIDES[gI]!;
    if (i >= g.i0 && i <= g.i1) pen += DP_COST.guide * (c < g.c0 ? g.c0 - c : c > g.c1 ? c - g.c1 : 0);
  }
  return pen;
}

export interface PathStep { i: number; c: number; air: boolean; h: number; k: number }
export interface DpResult {
  steps: PathStep[];                      // one per local slice from the start slice to the last slice
  ollies: number[];                       // local take-off slices
  cost: number;
}

/** Viable ground cells (F ∩ B) per local slice: filled by fillViable() after the passes. */
const VG = new Int32Array(MAX_SLICES * 2);
export function fillViable(r: Raster): void {
  for (let i = 0; i < r.n; i++) { const g = fo(i, 0); VG[i * 2] = F[g]! & B[g]!; VG[i * 2 + 1] = F[g + 1]! & B[g + 1]! & HI_MASK; }
}
const vgOK = (i: number, c: number): boolean => (c < 32 ? (VG[i * 2]! >>> c) & 1 : (VG[i * 2 + 1]! >>> (c - 32)) & 1) === 1;

/** Per (slice, cell): the first later slice with an ollie-able block (low solid or pit) in that cell, and per slice
 *  whether any capture edge is near (ollieMacro's capture test is skipped elsewhere). Filled by prepareMacros(). */
const NEXT_SOFT = new Int32Array(MAX_SLICES * NC);
/** Longest pit run (slices, conservative interval) a required ollie may clear with a ≥ 0.25 s window. */
export const PIT_OLLIE_MAX = 10;
const CAP_NEAR = new Uint8Array(MAX_SLICES);
function prepareMacros(r: Raster): void {
  const n = r.n;
  for (let c = 0; c < NC; c++) NEXT_SOFT[(n - 1) * NC + c] = 1 << 30;
  for (let i = n - 2; i >= 0; i--) {
    const sl = r.soft[(i + 1) * 2]!, sh = r.soft[(i + 1) * 2 + 1]!;
    const row = i * NC, nrow = (i + 1) * NC;
    for (let c = 0; c < NC; c++) NEXT_SOFT[row + c] = (c < 32 ? (sl >>> c) & 1 : (sh >>> (c - 32)) & 1) ? i + 1 : NEXT_SOFT[nrow + c]!;
  }
  for (let i = 0; i < n; i++) {
    const s = r.s[i]!;
    let near = 0;
    for (const e of r.caps) if (s >= e.s0 - HITBOX.l / 2 - 0.2 && s <= e.s1 + 0.2) { near = 1; break; }
    CAP_NEAR[i] = near;
  }
}

/** Straight ollie macro from ground (i, c): the touch-down slice (local), or −1 if an air state on the way is not
 *  viable or inside a capture zone (the safe line never ollies where the magnet could take it). */
export function ollieMacro(r: Raster, i: number, c: number): number {
  // Useful only with an ollie-able block (low solid or pit) ahead in this cell.
  const ns = NEXT_SOFT[i * NC + c]!;
  if (ns - i > 25) return -1;
  // A pit longer than PIT_OLLIE_MAX slices in this cell leaves no 0.25 s take-off window: plank or other lane only.
  if (bitTest(r.pit[ns * 2]!, r.pit[ns * 2 + 1]!, c)) {
    let run = 0;
    for (let k = ns; k < r.n && bitTest(r.pit[k * 2]!, r.pit[k * 2 + 1]!, c); k++) run++;
    if (run > PIT_OLLIE_MAX) return -1;
  }
  const h = classOfCell(r, i, c);
  if (h < 0) return -1;
  const km = r.kMax[h]!;
  const w = c < 32 ? 0 : 1, sh = c < 32 ? c : c - 32;
  for (let k = 1; k <= KMAX + 1 && i + k < r.n; k++) {
    const ii = i + k;
    const o = abo(ii, h, k <= KMAX ? k : KMAX + 1);
    if ((AL[o + w]! >>> sh) & 1) return ((VG[ii * 2 + w]! >>> sh) & 1) ? ii : -1;
    if (k > km) return -1;
    const p = fo(ii, 1 + h * KMAX + (k - 1));
    if (!(((F[p + w]! & B[p + w]!) >>> sh) & 1)) return -1;
    if (CAP_NEAR[ii]) {
      const q = h * (KMAX + 1) + k;
      if (r.pvy[q]! <= CAPTURE.vyMax && r.captureAt(ii, c, r.py[q]!, CAPTURE_ZONE)) return -1;
    }
  }
  return -1;
}

/** Cost-to-go DP from every viable ground state to the last slice, then the forward extraction from (iS, cS).
 *  `noMoveFrom`: local slices ≥ this may not start moves (gateways: none needed). */
export function minActionPath(r: Raster, iS: number, cS: number, d0: -1 | 0 | 1): DpResult | null {
  const n = r.n, last = n - 1;
  prepareMacros(r);
  // One backward pass: hold runs, comfort penalties and the cost-to-go (direction index d + 1).
  const nGuides = GUIDES.length;
  const A = DP_COST.action, PC = DP_COST.perCell, EDGE = DP_COST.edge, LATE = DP_COST.late, LS = DP_COST.lateSlices;
  COST.fill(INF, iS * NC * 3, n * NC * 3);
  for (let i = last; i >= iS; i--) {
    const vl = VG[i * 2]!, vh = VG[i * 2 + 1]!, row = i * NC;
    // Viable neighbours on both sides (edge penalty) as masks: cell c has both iff bit c of `inner` is set.
    const innerLo = vl & ((vl >>> 1) | (vh << 31)) & (vl << 1), innerHi = vh & (vh >>> 1) & ((vh << 1) | (vl >>> 31));
    let gLo = 0;
    for (let gI = 0; gI < nGuides; gI++) { const g = GUIDES[gI]!; if (i >= g.i0 && i <= g.i1) gLo = 1; }
    if (i === last) {
      for (let c = 0; c < NC; c++) {
        const ok = c < 32 ? (vl >>> c) & 1 : (vh >>> (c - 32)) & 1;
        HOLD[row + c] = ok;
        if (!ok) { PEN[row + c] = 0; continue; }
        let pen = 0;
        if (c === 0 || c === NC - 1 || !(c < 32 ? (innerLo >>> c) & 1 : (innerHi >>> (c - 32)) & 1)) pen += EDGE;
        if (gLo) pen += guidePen(i, c, nGuides);
        PEN[row + c] = pen;
        const o = (row + c) * 3;
        COST[o] = 0; COST[o + 1] = 0; COST[o + 2] = 0;
      }
      continue;
    }
    const j = r.j0 + i, ng = nG(j);
    const sl = r.slope[i * 2]!, sh = r.slope[i * 2 + 1]!;
    const qi = quiet(i), AQ = A + qi;
    const nl = VG[(i + 1) * 2]!, nh = VG[(i + 1) * 2 + 1]!;
    const nrow = (i + 1) * NC;
    for (let c = 0; c < NC; c++) {
      const ok = c < 32 ? (vl >>> c) & 1 : (vh >>> (c - 32)) & 1;
      if (!ok) { HOLD[row + c] = 0; PEN[row + c] = 0; continue; }
      const hold = 1 + HOLD[nrow + c]!;
      HOLD[row + c] = hold;
      let pen = 0;
      if (c === 0 || c === NC - 1 || !(c < 32 ? (innerLo >>> c) & 1 : (innerHi >>> (c - 32)) & 1)) pen += EDGE;
      if (hold < LS && i + hold < last) pen += LATE * (LS - hold);
      if (gLo) pen += guidePen(i, c, nGuides);
      PEN[row + c] = pen;
      const onSlope = (c < 32 ? (sl >>> c) & 1 : (sh >>> (c - 32)) & 1) === 1;
      const okS = (c < 32 ? (nl >>> c) & 1 : (nh >>> (c - 32)) & 1) === 1;
      const canMove = ng === 1 && !onSlope;
      const no = (nrow + c) * 3;
      // Successor costs (independent of the current direction except for the action charge).
      let s0 = INF, s1 = INF, s2 = INF;
      if (okS) { if (ng) { s0 = s1 = s2 = COST[no + 1]!; } else { s0 = COST[no]!; s1 = COST[no + 1]!; s2 = COST[no + 2]!; } }
      if (canMove) {
        const okL = c > 0 && (c - 1 < 32 ? (nl >>> (c - 1)) & 1 : (nh >>> (c - 33)) & 1) === 1;
        const okR = c + 1 < NC && (c + 1 < 32 ? (nl >>> (c + 1)) & 1 : (nh >>> (c - 31)) & 1) === 1;
        if (okL) {
          const cL = COST[no - 3]!;                                   // (c − 1, dir −1 → index 0)
          if (cL < INF) {
            const keep = PC + cL, turn = PC + AQ + cL;
            if (keep < s0) s0 = keep;
            if (turn < s1) s1 = turn;
            if (turn < s2) s2 = turn;
          }
        }
        if (okR) {
          const cR = COST[no + 3 + 2]!;                               // (c + 1, dir +1 → index 2)
          if (cR < INF) {
            const keep = PC + cR, turn = PC + AQ + cR;
            if (turn < s0) s0 = turn;
            if (turn < s1) s1 = turn;
            if (keep < s2) s2 = keep;
          }
        }
      }
      if (!onSlope && hold < 26) {
        const m = ollieMacro(r, i, c);
        if (m >= 0) {
          const mc = AQ + COST[(m * NC + c) * 3 + 1]!;
          if (mc < s0) s0 = mc;
          if (mc < s1) s1 = mc;
          if (mc < s2) s2 = mc;
        }
      }
      const o = (row + c) * 3;
      COST[o] = s0 >= INF ? INF : s0 + pen;
      COST[o + 1] = s1 >= INF ? INF : s1 + pen;
      COST[o + 2] = s2 >= INF ? INF : s2 + pen;
    }
  }
  if (COST[(iS * NC + cS) * 3 + d0 + 1]! >= INF) return null;
  // Forward extraction: prefer holding, then a same-direction move, then a new move, then an ollie.
  const steps: PathStep[] = [], ollies: number[] = [];
  let i = iS, c = cS, d: number = d0;
  steps.push({ i, c, air: false, h: -1, k: 0 });
  while (i < last) {
    const j = r.j0 + i, ng = nG(j);
    const here = COST[(i * NC + c) * 3 + d + 1]! - PEN[i * NC + c]!;
    const qi = quiet(i);
    const onSlope = bitTest(r.slope[i * 2]!, r.slope[i * 2 + 1]!, c);
    let took = false;
    if (vgOK(i + 1, c)) {
      const ds = ng ? 0 : d;
      if (COST[((i + 1) * NC + c) * 3 + ds + 1]! === here) { i++; d = ds; steps.push({ i, c, air: false, h: -1, k: 0 }); took = true; }
    }
    if (!took && ng && !onSlope) {
      for (let oi = 0; oi < 2; oi++) {
        const dir = d === 0 ? (oi === 0 ? -1 : 1) : (oi === 0 ? d : -d);
        const c2 = c + dir;
        if (c2 < 0 || c2 >= NC || !vgOK(i + 1, c2)) continue;
        if (DP_COST.perCell + (dir !== d ? DP_COST.action + qi : 0) + COST[((i + 1) * NC + c2) * 3 + dir + 1]! === here) {
          i++; c = c2; d = dir; steps.push({ i, c, air: false, h: -1, k: 0 }); took = true; break;
        }
      }
    }
    if (!took && !onSlope) {
      const m = ollieMacro(r, i, c);
      if (m >= 0 && DP_COST.action + qi + COST[(m * NC + c) * 3 + 1]! === here) {
        ollies.push(i);
        const h = classOfCell(r, i, c);
        for (let k = i + 1; k < m; k++) steps.push({ i: k, c, air: true, h, k: k - i });
        i = m; d = 0; steps.push({ i, c, air: false, h: -1, k: 0 }); took = true;
      }
    }
    if (!took) return null;                              // cannot happen: the DP is consistent
  }
  return { steps, ollies, cost: COST[(iS * NC + cS) * 3 + d0 + 1]! };
}

// ── Required actions (DESIGN §10.6.4) and rules (b), (c) ────────────────────────────────────────────────────────
export interface Action { i: number; t: number; kind: 'ollie' | 'move'; dx: number; c: number }

/** Required actions on a path: every ollie (at take-off), and every maximal run of same-direction moves (no
 *  voluntary pause) of ≥ 0.5 m, timed at its start. */
export function actionsOf(r: Raster, steps: readonly PathStep[], ollies: readonly number[]): Action[] {
  const out: Action[] = [];
  const iS = steps[0]!.i;
  for (const o of ollies) out.push({ i: o, t: r.t[o]!, kind: 'ollie', dx: 0, c: steps[o - iS]!.c });
  let runDir = 0, runStart = -1, runC = 0, runDx = 0;
  const flush = () => { if (runDir && Math.abs(runDx) >= 0.5 - 1e-9) out.push({ i: runStart, t: r.t[runStart]!, kind: 'move', dx: runDx, c: runC }); runDir = 0; runDx = 0; };
  for (let k = 1; k < steps.length; k++) {
    const a = steps[k - 1]!, b = steps[k]!;
    const dc = b.c - a.c;
    if (dc !== 0) {
      const dir = Math.sign(dc);
      if (dir !== runDir) { flush(); runDir = dir; runStart = a.i; runC = a.c; }
      runDx += dc * 0.25;
    } else if (runDir && !a.air && nG(r.j0 + a.i) === 1) flush();        // a voluntary pause ends the run
  }
  flush();
  return out.sort((p, q) => p.i - q.i);
}

export const rMinAt = (t: number): number => {
  let rr = R_MIN[0]!.sec;
  for (const e of R_MIN) if (t >= e.t) rr = e.sec;
  return rr;
};
/** Minimum gap after a required action at time t that moved dx (DESIGN §10.6 rule b). */
export const spacingAfter = (t: number, dx: number): number => Math.max(rMinAt(t), T_SHIFT(dx));

/** Rule (c): for an action at (i, c), the hazard contact (first slice holding c on the ground is pruned) and the
 *  latest valid start (last slice holding c is still viable). Returns the decision time or Infinity (no hazard). */
export function decisionTime(r: Raster, a: Action): { decision: number; contact: number; latest: number } {
  let latest = a.i;
  while (latest + 1 < r.n && vgOK(latest + 1, a.c)) latest++;
  let contact = -1;
  for (let k = a.i + 1; k < Math.min(r.n, a.i + 90); k++) {
    if (!bitTest(r.gOK[k * 2]!, r.gOK[k * 2 + 1]!, a.c)) { contact = k; break; }
  }
  if (contact < 0) return { decision: Infinity, contact: -1, latest };
  // Hazard enters the guaranteed view LOOKAHEAD_MIN before contact; decision time = latest start − that.
  const decision = r.t[latest]! - (r.t[contact]! - 2.5);
  return { decision, contact, latest };
}

// ── Rule (i): the greedy player ──────────────────────────────────────────────────────────────────────────────────
const MY = VALIDATOR.myopic;
/** One deterministic myopic trajectory from (iS, x0) on the ground: every 0.1 s it heads for the nearest cell whose
 *  next 1.5 s, as seen 0.35 s ago, is clear of tall (non-ollie-able) solids; it ollies ollie-able hazards in its cell
 *  with the arc centred on them; 75 % lateral speed (35 % in the air). Returns the first local slice where its state
 *  is outside B, or −1. */
const GHARD_L = new Int32Array(MAX_SLICES), GHARD_H = new Int32Array(MAX_SLICES);
export function greedyCheck(r: Raster, iS: number, x0: number, iEnd: number): number {
  let x = x0, target = x0, air = 0, h = -1;
  const vG = MY.latFrac * V_LAT_MAX * SLICE, vA = 0.35 * V_LAT_MAX * SLICE;
  const react = Math.round(MY.reaction / SLICE), look = Math.round(MY.lookSec / SLICE);
  // What the myopic player steers around: tall solids, and low ones (or pits) too long to ollie (> 0.4 s in a cell).
  const LONG = 12;
  for (let i = 0; i < r.n; i++) { GHARD_L[i] = r.hard[i * 2]!; GHARD_H[i] = r.hard[i * 2 + 1]!; }
  for (let c = 0; c < NC; c++) {
    let run = 0;
    for (let i = 0; i <= r.n; i++) {
      const soft = i < r.n && bitTest(r.soft[i * 2]!, r.soft[i * 2 + 1]!, c);
      if (soft) { run++; continue; }
      if (run > LONG) for (let k = i - run; k < i; k++) { if (c < 32) GHARD_L[k] = GHARD_L[k]! | (1 << c); else GHARD_H[k] = GHARD_H[k]! | (1 << (c - 32)); }
      run = 0;
    }
  }
  for (let i = iS; i <= iEnd; i++) {
    const c = cellOf(x);
    if (air > 0) {
      const p = fo(i, planeOf(h, air));
      const o = abo(i, h, air);
      if (bitTest(AL[o]!, AL[o + 1]!, c)) air = 0;
      else if (!bitTest(B[p]!, B[p + 1]!, c)) return i;
    }
    if (air === 0) {
      const g = fo(i, 0);
      if (!bitTest(B[g]!, B[g + 1]!, c)) return i;
    }
    if ((i - iS) % 3 === 0 && air === 0) {
      // Visible horizon: [i, (i − react) + look].
      const hz = Math.min(r.n - 1, i - react + look);
      let bl = 0, bh = 0;
      for (let k = i; k <= hz; k++) { bl |= GHARD_L[k]!; bh |= GHARD_H[k]!; }
      bl |= 1; bh |= 1 << 4;
      let best = -1, bd = Infinity;
      for (let cc = 0; cc < NC; cc++) {
        if (bitTest(bl, bh, cc)) continue;
        const dd = Math.abs(cellX(cc) - x);
        if (dd < bd - 1e-9) { bd = dd; best = cc; }
      }
      if (best >= 0) target = cellX(best);
    }
    // Ollie: a short ollie-able block ahead in this cell, centred under the arc's apex (9 slices after take-off).
    if (air === 0) {
      let a0 = -1, a1 = -1;
      for (let k = i + 1; k < Math.min(r.n, i + 24); k++) {
        const soft = bitTest(r.soft[k * 2]!, r.soft[k * 2 + 1]!, c);
        if (soft && a0 < 0) a0 = k;
        if (a0 >= 0) { if (soft) a1 = k; else break; }
      }
      if (a0 >= 0 && a1 - a0 <= LONG && i >= Math.round((a0 + a1) / 2) - 9) {
        const hc = classOfCell(r, i, c);
        if (hc >= 0) { h = hc; air = 1; continue; }
      }
    }
    const step = air > 0 ? vA : vG;
    if (Math.abs(target - x) <= step) x = target; else x += Math.sign(target - x) * step;
    if (air > 0) air = air + 1 > r.kMax[h]! + 1 ? 0 : air + 1;
  }
  return -1;
}

/** Air slices (k) at the take-off class of (i, c) until touch-down at cell c (flat ground), for the window refiner. */
export const tickOf = (t: number, phase: number): number => Math.round((t - phase) / DT) * DT + phase;
export const DEAD_END_SLICES = Math.round(VALIDATOR.deadEndMaxSec / SLICE);
export { RASTER, HITBOX };

/** Debug: the ground plane per slice as text (one row per slice: gOK, F, B; '#' = set). */
export function dumpGround(r: Raster, i0: number, i1: number): string {
  const rows: string[] = [];
  const row = (lo: number, hi: number) => { let s = ''; for (let c = 0; c < NC; c++) s += bitTest(lo, hi, c) ? '#' : '.'; return s; };
  for (let i = Math.max(0, i0); i <= Math.min(r.n - 1, i1); i++) {
    const g = fo(i, 0);
    rows.push(`${r.t[i]!.toFixed(2)} ok ${row(r.gOK[i * 2]!, r.gOK[i * 2 + 1]!)} F ${row(F[g]!, F[g + 1]!)} B ${row(B[g]!, B[g + 1]!)}`);
  }
  return rows.join('\n');
}
