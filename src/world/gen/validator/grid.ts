// world/gen/validator/grid.ts: the validator's rasterized window (DESIGN §10.6.1, TECH §5.2).
//  - Lateral cells: 37 board-centre positions x = −4.5 + 0.25·i (0.25 m pitch over ±4.5, so x = 0 is a centre); cells
//    0 and 36 (|x| = 4.5) are walls (targetX never exceeds ±4.3). A cell set is a bitset in two int32 words: cells
//    0–31 in `lo`, 32–36 in `hi`.
//  - Forward slices are 1/30 s on a GLOBAL grid (slice j ↔ t = j/30), so the planes stored at a segment boundary
//    line up with the next window. Each slice is the interval [t − 1/60, t + 1/60] (conservative in time).
//  - Per slice: the L0 ground height per cell (datum slabs only: no body tops, no L1 decks), slope and pit masks, and
//    the dilated solids as threshold entries (thr, bottom, cell mask): a board at height y in a masked cell is pruned
//    when y < thr and y + HITBOX.h > bottom. thr is the inset top for crash tops (no skim) and top − STEP_UP for
//    landable tops (skim), exactly the sim's contact rules (TECH §6.4). Dilation: half hitbox + SAFE_MARGIN laterally,
//    half hitbox along s (plus the half slice).
// The raster is a module-level scratch reused by every validation (nothing is allocated per segment).
import { clamp } from '../../../core/math';
import { FACE_INSET, G, HEIGHT, HITBOX, PIT_FALL_EPS, SAFE_LATERAL_FRACTION, STEP_UP, V_LAT_MAX, V_POP, VALIDATOR, sAt, speedAt } from '../../../core/tuning';
import type { GroundSlab, Obstacle } from '../../../core/world';
import { slabYAt } from '../query';
import { BODY_TOPS } from '../props/common';
import type { StreetLayout } from '../props/street';

export const NC = 37, CELL = 0.25, X_MIN = -4.5;
export const SLICE = 1 / 30;
export const HI_MASK = 0x1f;
export const MAX_SLICES = 420;
export const KMAX = 30;
export const NH_MAX = 6;
/** Planes: 0 = ground (L0), then pop planes (class h, k = 1…KMAX). Roll-off planes are never populated: L0 has no
 *  non-sticky drop > STEP_UP (stairs and inclines are sticky; bigger drops only leave L1 decks and body tops). */
export const NPLANES = 1 + NH_MAX * KMAX;
export const planeOf = (h: number, k: number): number => 1 + h * KMAX + (k - 1);
export const cellX = (c: number): number => X_MIN + CELL * c;
export const cellOf = (x: number): number => clamp(Math.round((x - X_MIN) / CELL), 0, NC - 1);
/** Lateral reach per slice in cells (DESIGN §10.6.2): 0.70·V_LAT_MAX on the ground, 0.35 in the air. */
export const REACH_G = (SAFE_LATERAL_FRACTION.ground * V_LAT_MAX * SLICE) / CELL;
export const REACH_A = (SAFE_LATERAL_FRACTION.air * V_LAT_MAX * SLICE) / CELL;
/** Spread amount at global slice j (0 or 1 cell): floor((j+1)r) − floor(jr). */
export const nG = (j: number): number => Math.floor((j + 1) * REACH_G) - Math.floor(j * REACH_G);
export const nA = (j: number): number => Math.floor((j + 1) * REACH_A) - Math.floor(j * REACH_A);
export const sliceOfT = (t: number): number => Math.round(t / SLICE);
export const tOfSlice = (j: number): number => j * SLICE;

/** Bit helpers on (lo, hi) pairs. */
export const bitTest = (lo: number, hi: number, c: number): boolean => (c < 32 ? (lo >>> c) & 1 : (hi >>> (c - 32)) & 1) === 1;
export function maskRange(c0: number, c1: number, out: Int32Array, o: number): void {
  let lo = 0, hi = 0;
  for (let c = Math.max(0, c0); c <= Math.min(NC - 1, c1); c++) { if (c < 32) lo |= 1 << c; else hi |= 1 << (c - 32); }
  out[o] = lo | 0; out[o + 1] = hi | 0;
}
/** Board height of a pop plane: class height h0, k slices after take-off, at the slice centre and its interval. */
export function popY(h0: number, k: number): { y: number; lo: number; hi: number; vy: number } {
  const tau = k * SLICE, a = tau - SLICE / 2, b = tau + SLICE / 2;
  const f = (t: number) => h0 + V_POP * t - 0.5 * G * t * t;
  const ya = f(a), yb = f(b), apex = V_POP / G;
  return { y: f(tau), lo: Math.min(ya, yb), hi: a <= apex && b >= apex ? f(apex) : Math.max(ya, yb), vy: V_POP - G * tau };
}

const ENT_CAP = 24, LV_CAP = 8;
/** Lateral margin of the board centre on a plank across a pit (path.ts PIT_CENTRE_MARGIN + 0.05). */
const PIT_MARGIN = 0.2;
/** Grid dilation: half hitbox + SAFE_MARGIN, plus 5 cm so a committed line keeps slack for the exact tube check. */
export const GRID_EXTRA = 0.05;
const DIL_X = VALIDATOR.dilateX + VALIDATOR.safeMargin + GRID_EXTRA, DIL_S = VALIDATOR.dilateS;
const insetOf = (extent: number): number => Math.min(FACE_INSET, Math.max(0, extent) / 4);

/** An edge for capture-zone tests (non-pickOnly; L0 and L1). */
export interface CapEdge { s0: number; s1: number; xa: number; xb: number; ya: number; yb: number }

export class Raster {
  j0 = 0; n = 0;
  readonly t = new Float64Array(MAX_SLICES);
  readonly s = new Float64Array(MAX_SLICES);
  readonly v = new Float64Array(MAX_SLICES);
  readonly gy = new Float32Array(MAX_SLICES * NC);
  readonly slope = new Int32Array(MAX_SLICES * 2);
  readonly pit = new Int32Array(MAX_SLICES * 2);
  readonly gOK = new Int32Array(MAX_SLICES * 2);
  /** Greedy (rule i) masks: blocked by tall / non-ollie-able solids, or by low ones and pits (ollie-able). */
  readonly hard = new Int32Array(MAX_SLICES * 2);
  readonly soft = new Int32Array(MAX_SLICES * 2);
  readonly entN = new Int32Array(MAX_SLICES);
  readonly entThr = new Float32Array(MAX_SLICES * ENT_CAP);
  readonly entBot = new Float32Array(MAX_SLICES * ENT_CAP);
  readonly entM = new Int32Array(MAX_SLICES * ENT_CAP * 2);
  readonly lvN = new Int32Array(MAX_SLICES);
  readonly lvY = new Float32Array(MAX_SLICES * LV_CAP);
  readonly lvM = new Int32Array(MAX_SLICES * LV_CAP * 2);
  /** Ground classes (take-off heights) and, per slice, the flat non-slope non-pit cells of each class. */
  nh = 0;
  readonly classes = new Float64Array(NH_MAX);
  readonly flat = new Int32Array(MAX_SLICES * NH_MAX * 2);
  /** Pop plane heights per class and k (centre, interval low / high, vy). */
  readonly py = new Float64Array(NH_MAX * (KMAX + 1));
  readonly pyLo = new Float64Array(NH_MAX * (KMAX + 1));
  readonly pyHi = new Float64Array(NH_MAX * (KMAX + 1));
  readonly pvy = new Float64Array(NH_MAX * (KMAX + 1));
  /** Last k worth modelling per class (below every ground level of the window, everything has landed). */
  readonly kMax = new Int32Array(NH_MAX);
  exitLo = -1; exitHi = HI_MASK;
  /** First slice index (local) of the extension (open entry), and the segment's own [t0, t1]. */
  extFrom = 0; t0 = 0; t1 = 0;
  readonly caps: CapEdge[] = [];
  private readonly datumSlabs: GroundSlab[] = [];
  /** Wall cells (|x| > TARGET_X_MAX): cell 0 and cell 36. */
  static readonly WALL_LO = 1;
  static readonly WALL_HI = 1 << 4;

  cellGy(i: number, c: number): number { return this.gy[i * NC + c]!; }

  /** The class of a flat take-off height (1 cm), adding it while there is room; −1 = no class. */
  private classOf(y: number): number {
    for (let q = 0; q < this.nh; q++) if (Math.abs(this.classes[q]! - y) < 0.005) return q;
    if (this.nh >= NH_MAX) return -1;
    this.classes[this.nh] = y;
    return this.nh++;
  }

  /** Rasterize slices [j0, j0 + n) over the obstacles; slices from `extFrom` on are the 1 s open-entry extension with
   *  the layout's base street at `extDatum` and only `exit` cells open at the end. */
  build(j0: number, n: number, obstacles: readonly Obstacle[], extFrom: number, ext: { layout: StreetLayout; datum: number;
    exit: readonly (readonly [number, number])[] }, t0: number, t1: number): void {
    this.j0 = j0; this.n = n; this.extFrom = extFrom; this.t0 = t0; this.t1 = t1;
    const nn = n * NC;
    this.gy.fill(-1000, 0, nn);
    this.slope.fill(0, 0, n * 2); this.pit.fill(0, 0, n * 2); this.hard.fill(0, 0, n * 2); this.soft.fill(0, 0, n * 2);
    this.entN.fill(0, 0, n);
    for (let i = 0; i < n; i++) { const t = (j0 + i) * SLICE; this.t[i] = t; this.s[i] = sAt(t); this.v[i] = speedAt(t); }
    // 1. Ground: the highest datum slab top under each cell centre at the slice centre (stairs / inclines interpolate);
    //    pits where no slab covers the centre (anywhere in the slice interval: conservative).
    for (const ob of obstacles) {
      for (const sl of ob.slabs) {
        if (sl.layer !== 0 || BODY_TOPS.has(sl)) continue;
        const sloped = sl.y0 !== sl.y1;
        const c0 = Math.ceil((sl.x0 - X_MIN) / CELL - 1e-9), c1 = Math.floor((sl.x1 - X_MIN) / CELL + 1e-9);
        for (let i = this.firstSlice(sl.s0); i < n && this.s[i]! < sl.s1; i++) {
          const s = this.s[i]!;
          if (s < sl.s0) continue;
          const y = slabYAt(sl, s);
          for (let c = Math.max(0, c0); c <= Math.min(NC - 1, c1); c++) {
            const k = i * NC + c;
            if (y > this.gy[k]!) {
              this.gy[k] = y;
              if (sloped) this.setBit(this.slope, i, c); else this.clearBit(this.slope, i, c);
            }
          }
        }
      }
    }
    // Extension: the base street at the exit datum where nothing else is there.
    for (let i = extFrom; i < n; i++) {
      for (let c = 0; c < NC; c++) {
        const k = i * NC + c;
        if (this.gy[k]! > -999) continue;
        const x = cellX(c);
        let dy = 0;
        for (const bd of ext.layout.bands) if (x >= bd.x0 && x < bd.x1) dy = bd.dy;
        this.gy[k] = ext.datum + dy;
      }
    }
    this.datumSlabs.length = 0;
    for (const ob of obstacles) for (const sl of ob.slabs) if (sl.layer === 0 && !BODY_TOPS.has(sl)) this.datumSlabs.push(sl);
    for (const ob of obstacles) {
      for (const pt of ob.pits) {
        const c0 = Math.ceil((pt.x0 - X_MIN) / CELL - 1e-9), c1 = Math.floor((pt.x1 - X_MIN) / CELL + 1e-9);
        for (let i = this.firstSlice(pt.s0 - this.v[0]! * SLICE); i < n; i++) {
          const half = this.v[i]! * SLICE / 2, s = this.s[i]!;
          if (s - half >= pt.s1) break;
          if (s + half <= pt.s0) continue;
          for (let c = Math.max(0, c0); c <= Math.min(NC - 1, c1); c++) {
            // Covered by a datum slab (a plank) over the whole slice interval? Then no pit.
            if (this.coveredAt(obstacles, s - half, s + half, cellX(c), pt.s0, pt.s1)) continue;
            this.setBit(this.pit, i, c);
            this.setBit(this.soft, i, c);
            const k = i * NC + c;
            if (this.gy[k]! < pt.lipY) this.gy[k] = pt.lipY;
          }
        }
      }
    }
    for (let k = 0; k < nn; k++) if (this.gy[k]! < -999) this.gy[k] = 0;      // implicit street datum (y = 0)
    // 2. Solids → threshold entries.
    this.caps.length = 0;
    for (const ob of obstacles) {
      for (const so of ob.solids) {
        if (so.top === 'knock') continue;
        const bx = so.box;
        const is = insetOf(bx.s1 - bx.s0), ix = insetOf(bx.x1 - bx.x0), iy = insetOf(bx.y1 - bx.y0);
        const sa = bx.s0 + is - DIL_S, sb = bx.s1 - is + DIL_S;
        const xa = bx.x0 + ix - DIL_X, xb = bx.x1 - ix + DIL_X;
        if (xb - xa <= 0 || sb - sa <= 0) continue;
        const thr = so.top === 'crash' ? bx.y1 - iy : bx.y1 - STEP_UP;
        const c0 = Math.ceil((xa - X_MIN) / CELL - 1e-9), c1 = Math.floor((xb - X_MIN) / CELL + 1e-9);
        if (c1 < 0 || c0 > NC - 1 || c0 > c1) continue;
        const tall = so.tall || bx.y1 - bx.y0 > HEIGHT.lowMax + 0.05;
        for (let i = this.firstSlice(sa - this.v[0]! * SLICE); i < n; i++) {
          const half = this.v[i]! * SLICE / 2, s = this.s[i]!;
          if (s - half >= sb) break;
          if (s + half <= sa) continue;
          this.addEntry(i, thr, bx.y0, c0, c1);
          // Greedy masks: only solids a grounded board would touch.
          if (bx.y0 < this.gyMinRange(i, c0, c1) + HITBOX.h) for (let c = Math.max(0, c0); c <= Math.min(NC - 1, c1); c++) {
            if (thr <= this.gy[i * NC + c]! + 1e-6) continue;
            this.setBit(tall ? this.hard : this.soft, i, c);
          }
        }
      }
      for (const e of ob.edges) {
        if (e.pickOnly) continue;
        this.caps.push({ s0: e.a.s, s1: e.b.s, xa: e.a.x, xb: e.b.x, ya: e.a.y, yb: e.b.y });
      }
    }
    // 3. Per slice: ground levels (distinct heights with their cell masks), the ground OK mask (per level: one
    //    threshold pass instead of one per cell), the class table and the flat-class masks. Classes are the distinct
    //    flat take-off heights (1 cm) in order of first appearance; more than NH_MAX → extra ones get no class (no
    //    take-off there: conservative). Cells past LV_CAP levels in a slice take the per-cell path.
    this.nh = 0;
    let minG = Infinity;
    const gy = this.gy, lvY = this.lvY, lvM = this.lvM, entThr = this.entThr, entBot = this.entBot, entM = this.entM;
    this.flat.fill(0, 0, n * NH_MAX * 2);
    for (let i = 0; i < n; i++) {
      const l0 = i * LV_CAP, row = i * NC;
      let nl = 0, last = -1, restLo = 0, restHi = 0;
      for (let c = 1; c < NC - 1; c++) {
        const y = gy[row + c]!;
        if (y < minG) minG = y;
        let l = -1;
        if (last >= 0 && Math.abs(lvY[l0 + last]! - y) < 1e-4) l = last;
        else for (let q = 0; q < nl; q++) if (Math.abs(lvY[l0 + q]! - y) < 1e-4) { l = q; break; }
        if (l < 0 && nl < LV_CAP) { l = nl++; lvY[l0 + l] = y; lvM[(l0 + l) * 2] = 0; lvM[(l0 + l) * 2 + 1] = 0; }
        if (l < 0) { if (c < 32) restLo |= 1 << c; else restHi |= 1 << (c - 32); continue; }
        last = l;
        if (c < 32) lvM[(l0 + l) * 2] = lvM[(l0 + l) * 2]! | (1 << c); else lvM[(l0 + l) * 2 + 1] = lvM[(l0 + l) * 2 + 1]! | (1 << (c - 32));
      }
      this.lvN[i] = nl;
      const pl = this.pit[i * 2]!, ph = this.pit[i * 2 + 1]!, sl = this.slope[i * 2]!, sh = this.slope[i * 2 + 1]!;
      const e0 = i * ENT_CAP, ne = this.entN[i]!;
      let okLo = 0, okHi = 0;
      for (let l = 0; l < nl; l++) {
        const y = lvY[l0 + l]!, ml = lvM[(l0 + l) * 2]!, mh = lvM[(l0 + l) * 2 + 1]!;
        let bl = 0, bh = 0;
        for (let e = 0; e < ne; e++) {
          if (y < entThr[e0 + e]! - 1e-6 && y + HITBOX.h > entBot[e0 + e]! + 1e-6) { bl |= entM[(e0 + e) * 2]!; bh |= entM[(e0 + e) * 2 + 1]!; }
        }
        okLo |= ml & ~bl; okHi |= mh & ~bh;
        // Class of this level's flat cells.
        const fl = ml & ~sl & ~pl, fh = mh & ~sh & ~ph;
        if (!(fl | fh)) continue;
        const q = this.classOf(Math.round(y * 100) / 100);
        if (q >= 0) { const o = (i * NH_MAX + q) * 2; this.flat[o] = this.flat[o]! | fl; this.flat[o + 1] = this.flat[o + 1]! | fh; }
      }
      if (restLo | restHi) {
        for (let c = 1; c < NC - 1; c++) {
          if (!bitTest(restLo, restHi, c)) continue;
          const y = gy[row + c]!;
          if (!this.blockedAt(i, c, y)) { if (c < 32) okLo |= 1 << c; else okHi |= 1 << (c - 32); }
          if (bitTest(sl, sh, c) || bitTest(pl, ph, c)) continue;
          const q = this.classOf(Math.round(y * 100) / 100);
          if (q >= 0) this.setBitW(this.flat, (i * NH_MAX + q) * 2, c);
        }
      }
      this.gOK[i * 2] = okLo & ~pl; this.gOK[i * 2 + 1] = okHi & ~ph;
    }
    for (let h = 0; h < this.nh; h++) {
      const h0 = this.classes[h]!;
      let km = KMAX;
      for (let k = 1; k <= KMAX; k++) {
        const p = popY(h0, k), o = h * (KMAX + 1) + k;
        this.py[o] = p.y; this.pyLo[o] = p.lo; this.pyHi[o] = p.hi; this.pvy[o] = p.vy;
        if (p.vy < 0 && p.y < minG - 0.01 && km === KMAX) km = k;
      }
      this.kMax[h] = km;
    }
    // Exit mask (the template's exit lateral sets).
    let elo = 0, ehi = 0;
    for (let c = 0; c < NC; c++) {
      const x = cellX(c);
      if (!ext.exit.some(([a, b]) => x >= a - 1e-9 && x <= b + 1e-9)) continue;
      if (c < 32) elo |= 1 << c; else ehi |= 1 << (c - 32);
    }
    this.exitLo = elo | 0; this.exitHi = ehi | 0;
  }

  /** Board at height y (centre range [lo, hi]) pruned by a solid in cell c at local slice i? */
  blockedAt(i: number, c: number, y: number, yhi = y): boolean {
    const e0 = i * ENT_CAP, n = this.entN[i]!;
    for (let e = 0; e < n; e++) {
      const o = (e0 + e) * 2;
      if (!bitTest(this.entM[o]!, this.entM[o + 1]!, c)) continue;
      if (y < this.entThr[e0 + e]! - 1e-6 && yhi + HITBOX.h > this.entBot[e0 + e]! + 1e-6) return true;
    }
    return false;
  }

  /** Cells pruned for a board whose height spans [ylo, yhi] at local slice i (written into out[o], out[o+1]). */
  airBlocked(i: number, ylo: number, yhi: number, out: Int32Array, o: number): void {
    let lo = Raster.WALL_LO, hi = Raster.WALL_HI;
    const e0 = i * ENT_CAP, n = this.entN[i]!;
    for (let e = 0; e < n; e++) {
      if (ylo < this.entThr[e0 + e]! - 1e-6 && yhi + HITBOX.h > this.entBot[e0 + e]! + 1e-6) {
        lo |= this.entM[(e0 + e) * 2]!; hi |= this.entM[(e0 + e) * 2 + 1]!;
      }
    }
    out[o] = lo | 0; out[o + 1] = hi & HI_MASK;
  }

  /** Cells where a board at height y has touched down (y ≤ ground; pits at lip level + PIT_FALL_EPS). */
  landed(i: number, y: number, out: Int32Array, o: number): void {
    let lo = 0, hi = 0;
    const l0 = i * LV_CAP, n = this.lvN[i]!;
    for (let l = 0; l < n; l++) {
      if (y <= this.lvY[l0 + l]! + 1e-6) { lo |= this.lvM[(l0 + l) * 2]!; hi |= this.lvM[(l0 + l) * 2 + 1]!; }
    }
    if (n >= LV_CAP) {                                   // overflow: exact per cell
      for (let c = 0; c < NC; c++) if (y <= this.gy[i * NC + c]! + 1e-6) { if (c < 32) lo |= 1 << c; else hi |= 1 << (c - 32); }
    }
    const pl = this.pit[i * 2]!, ph = this.pit[i * 2 + 1]!;
    if (pl | ph) for (let c = 0; c < NC; c++) {
      if (bitTest(pl, ph, c) && y <= this.gy[i * NC + c]! + PIT_FALL_EPS) { if (c < 32) lo |= 1 << c; else hi |= 1 << (c - 32); }
    }
    out[o] = lo | 0; out[o + 1] = hi & HI_MASK;
  }

  /** Is cell c inside a capture zone for a board at height y descending (vy ≤ CAPTURE.vyMax) at local slice i? The
   *  magnet range plus a margin: the safe line never ollies where the magnet or a capture could take it. */
  captureAt(i: number, c: number, y: number, range: number): boolean {
    const s = this.s[i]!, x = cellX(c);
    for (const e of this.caps) {
      if (s < e.s0 - HITBOX.l / 2 - 0.2 || s > e.s1 + 0.2) continue;
      const u = e.s1 - e.s0 > 1e-6 ? clamp((s - e.s0) / (e.s1 - e.s0), 0, 1) : 0;
      const ex = e.xa + (e.xb - e.xa) * u, ey = e.ya + (e.yb - e.ya) * u;
      if (Math.abs(ex - x) > range) continue;
      if (y <= ey + 0.45 + 0.08 && y >= ey - 0.30 - 0.08) return true;
    }
    return false;
  }

  private firstSlice(s: number): number {
    // Slices are in increasing s; binary search the first with s ≥ sTarget − half a slice.
    let lo = 0, hi = this.n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.s[m]! < s) lo = m + 1; else hi = m; }
    return Math.max(0, lo - 1);
  }
  private gyMinRange(i: number, c0: number, c1: number): number {
    let m = Infinity;
    for (let c = Math.max(0, c0); c <= Math.min(NC - 1, c1); c++) m = Math.min(m, this.gy[i * NC + c]!);
    return m === Infinity ? 0 : m;
  }
  private coveredAt(_obstacles: readonly Obstacle[], sa: number, sb: number, x: number, p0: number, p1: number): boolean {
    for (const sl of this.datumSlabs) {
      // The board centre must stay PIT_MARGIN inside a plank (the exact check's centre margin plus tracking).
      if (x < sl.x0 + PIT_MARGIN || x > sl.x1 - PIT_MARGIN) continue;
      if (sl.s0 <= Math.max(sa, p0) + 1e-9 && sl.s1 >= Math.min(sb, p1) - 1e-9) return true;
    }
    return false;
  }
  private addEntry(i: number, thr: number, bot: number, c0: number, c1: number): void {
    const e0 = i * ENT_CAP;
    let lo = 0, hi = 0;
    for (let c = Math.max(0, c0); c <= Math.min(NC - 1, c1); c++) { if (c < 32) lo |= 1 << c; else hi |= 1 << (c - 32); }
    const n = this.entN[i]!;
    for (let e = 0; e < n; e++) {
      if (Math.abs(this.entThr[e0 + e]! - thr) < 0.005 && Math.abs(this.entBot[e0 + e]! - bot) < 0.005) {
        this.entM[(e0 + e) * 2] = this.entM[(e0 + e) * 2]! | lo; this.entM[(e0 + e) * 2 + 1] = this.entM[(e0 + e) * 2 + 1]! | hi; return;
      }
    }
    if (n < ENT_CAP) {
      this.entThr[e0 + n] = thr; this.entBot[e0 + n] = bot; this.entM[(e0 + n) * 2] = lo | 0; this.entM[(e0 + n) * 2 + 1] = hi | 0;
      this.entN[i] = n + 1;
    } else {                                              // overflow: merge conservatively into the last entry
      const e = n - 1;
      this.entThr[e0 + e] = Math.max(this.entThr[e0 + e]!, thr); this.entBot[e0 + e] = Math.min(this.entBot[e0 + e]!, bot);
      this.entM[(e0 + e) * 2] = this.entM[(e0 + e) * 2]! | lo; this.entM[(e0 + e) * 2 + 1] = this.entM[(e0 + e) * 2 + 1]! | hi;
    }
  }
  setBit(a: Int32Array, i: number, c: number): void { this.setBitW(a, i * 2, c); }
  clearBit(a: Int32Array, i: number, c: number): void { if (c < 32) a[i * 2] = a[i * 2]! & ~(1 << c); else a[i * 2 + 1] = a[i * 2 + 1]! & ~(1 << (c - 32)); }
  setBitW(a: Int32Array, o: number, c: number): void { if (c < 32) a[o] = a[o]! | (1 << c); else a[o + 1] = a[o + 1]! | (1 << (c - 32)); }
}

export const RASTER = new Raster();
