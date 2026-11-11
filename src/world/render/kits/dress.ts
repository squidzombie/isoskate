// world/render/kits/dress.ts: the RECLAIM dressing rules as helpers (DESIGN §18.4 "Dressing rules", rules 1–10), and the
// life-accent accounting a kit unit test checks per variant (rule 6: flowers, the cat, lanterns and the area accent
// stripe cover ≤ 10% of a hazard's top-view silhouette).
// Kits read the obstacle's skin from DRESSER (set by drawObstacle through `begin`) and draw dressing through
// `DRESSER.box(K, role, …)`, which clamps it to the footprint (rule 1) and the height caps (rule 2), refuses wear and
// plants on helper machines (rule 9) and foliage within 0.3 m of a grind edge (rule 5), and adds `life` / `cat`
// boxes to the ledger. Colour helpers pick the luminance-matched tokens (rule 4). Pure accounting: no allocation unless
// a test turns `record` on.
import type { AreaId, PropKind } from '../../../core/ids';
import { Dress, WEAR_MASK, newSkin, propSkin, type PropSkin } from '../../../core/skins';
import { ObTag, type GrindEdge, type Obstacle, type Solid } from '../../../core/world';
import { RECLAIM, contrastRatio, relLum, withLum } from '../palette';
import { FACE, type Kit } from '../writer';

/** The rule numbers (DESIGN §18.4 dressing rules). */
export const DRESS = {
  /** Rule 1: plan-view overhang allowed beyond the collision footprint (mirrors included), m. */
  overhang: 0.05,
  /** Rule 2: rise above the top of a Tall prop: flat foliage / crown caps, animals (cat loaf, resting bird), m. */
  tallFoliageRise: 0.05, animalRise: 0.22,
  /** Rule 2 exception: the isolated column filler's sapling (1 in 4; no other solid within `clear` m in x or s). */
  sapling: { crownR: 0.35, rise: 0.6, chance: 0.25, clear: 1.0 },
  /** Rule 4: luminance match tolerance (relative), hazard foliage cap, decor foliage floor (DT/SB/IN), Neon decor cap. */
  lumTol: 0.1, hazardFoliageMaxL: 0.05, decorFoliageMinL: 0.1, neonDecorMaxContrast: 1.3,
  /** Rule 5: no foliage, weed decal, crack or root within this distance of a grind edge, m. */
  edgeClear: 0.3,
  /** Rule 6: life accents ≤ this share of the hazard's top-view silhouette. */
  lifeBudget: 0.1,
  /** Rule 7: clean core |x| ≤ 3.6 (existing decal kinds only); flat weed / moss decals in 3.6–4.5 at ≤ 1.3:1; 3D
   *  vegetation from |x| ≥ 4.6. */
  core: 3.6, edgeBand: 4.5, veg: 4.6, edgeBandMaxContrast: 1.3,
  /** Rule 5: the lightest tone a non-grindable thing near a grind edge may have (gull #A6A3A8). */
  maxNearEdgeL: relLum(RECLAIM.animalMax),
} as const;

/** Rule 3: kinds whose top face may carry flowers (landable / grindable planter beds); scenery is decor, not a kit. */
export const BLOOM_TOP_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(['planter', 'planter_tree', 'cherry_planter']);
/** Rule 8: the only hazards with a time-varying light (their existing telegraphs, DESIGN §10.3): the crosswalk signal,
 *  the reverse lights, the forklift beacon and the holo-gate pulse (≤ 2 Hz; `barrier_low` in Neon is the holo gate). */
export const TELEGRAPH_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(['crosswalk_car', 'backout_car', 'forklift', 'holo_gate']);
export const mayAnimateEmissive = (kind: PropKind, area: AreaId) => TELEGRAPH_KINDS.has(kind) || (kind === 'barrier_low' && area === 'neon');

// ── rule 4: colour ─────────────────────────────────────────────────────────────────────────────────────────────
/** Are two colours luminance-matched (within ±tol of the face's relative luminance)? */
export const lumMatched = (dressing: number, face: number, tol: number = DRESS.lumTol) =>
  Math.abs(relLum(dressing) - relLum(face)) <= tol * relLum(face);

const MOSS_ON: ReadonlyMap<number, number> = new Map<number, number>([
  [0x5c4b84, RECLAIM.hazardMoss], [0x4a3b6b, RECLAIM.hazardMossDark],
  [RECLAIM.carPaint.teal, RECLAIM.carRoofMoss.teal], [RECLAIM.carPaint.oxblood, RECLAIM.carRoofMoss.oxblood],
  [RECLAIM.carPaint.olive, RECLAIM.carRoofMoss.olive], [RECLAIM.carPaint.slate, RECLAIM.carRoofMoss.slate],
  [0x7a6fb0, RECLAIM.neonHazardMoss], [0x9489c8, RECLAIM.neonHazardMossTop],
]);
const mossCache = new Map<number, number>();
/** Moss for a hazard face: the RECLAIM token when the face is a tabled one, else the moss hue at the face's luminance. */
export function mossOn(face: number): number {
  const t = MOSS_ON.get(face);
  if (t !== undefined) return t;
  let m = mossCache.get(face);
  if (m === undefined) { m = withLum(RECLAIM.hazardMoss, relLum(face)); mossCache.set(face, m); }
  return m;
}
/** Rust for a hazard face: ink rust on ink faces (L ≤ 0.03), else the rust hue at the face's luminance (never crimson). */
export function rustOn(face: number): number {
  return relLum(face) <= 0.03 ? RECLAIM.inkRust : withLum(RECLAIM.rustDeep, relLum(face));
}
/** Foliage colour: hazards ink-green (L ≤ 0.05; Neon hazards the luminance-matched Neon moss), decor ivy (L ≥ 0.10)
 *  or, in Neon, the dark night leaf (≤ 1.3:1 against wet asphalt). `lit`: the sun-side highlight. */
export function foliageFor(area: AreaId, hazard: boolean, lit = false): number {
  if (hazard) return area === 'neon' ? RECLAIM.neonHazardMoss : lit ? RECLAIM.hazardFoliageLit : RECLAIM.hazardFoliage;
  if (area === 'neon') return lit ? RECLAIM.nightLeaf : RECLAIM.nightMoss;
  return lit ? RECLAIM.ivyLight : RECLAIM.ivyDeep;
}
/** Rule 5: would this colour read like the grind signature (cream, near-white, chrome)? Near-white (L > 0.7), or
 *  lighter than the gull tone with HSV saturation < 0.15. */
export function signatureLike(hex: number): boolean {
  const L = relLum(hex);
  if (L > 0.7) return true;
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return L > DRESS.maxNearEdgeL + 1e-4 && (mx === 0 ? 0 : (mx - mn) / mx) < 0.15;
}
/** Rule 7: a flat weed / moss decal on the edge band must stay within 1.3:1 of the surface under it. */
export const edgeBandDecalOk = (decal: number, surface: number) => contrastRatio(decal, surface) <= DRESS.edgeBandMaxContrast;

// ── rule 7: zones ──────────────────────────────────────────────────────────────────────────────────────────────
/** The clean core (riding surface): only the existing decal kinds (cracks, patches, organic puddles, faded paint). */
export const inCleanCore = (x: number) => Math.abs(x) <= DRESS.core;
/** Flat weed and moss decals: the edge band and beyond. */
export const flatWeedOk = (x: number) => Math.abs(x) > DRESS.core;
/** 3D vegetation. */
export const vegOk = (x: number) => Math.abs(x) >= DRESS.veg;

// ── rule 5: grind-edge clearance ───────────────────────────────────────────────────────────────────────────────
/** Is the box (x, y, s ranges) at least `clear` m from every grind edge (L∞ distance, so conservative)? */
export function clearOfEdges(x0: number, x1: number, s0: number, s1: number, y0: number, y1: number,
  edges: readonly GrindEdge[], clear: number = DRESS.edgeClear): boolean {
  for (const e of edges) {
    const sa = Math.max(e.a.s, s0 - clear), sb = Math.min(e.b.s, s1 + clear);
    if (sa > sb) continue;
    const span = e.b.s - e.a.s || 1;
    const ua = (sa - e.a.s) / span, ub = (sb - e.a.s) / span;
    const xa = e.a.x + (e.b.x - e.a.x) * ua, xb = e.a.x + (e.b.x - e.a.x) * ub;
    if (Math.max(xa, xb) < x0 - clear || Math.min(xa, xb) > x1 + clear) continue;
    const ya = e.a.y + (e.b.y - e.a.y) * ua, yb = e.a.y + (e.b.y - e.a.y) * ub;
    if (Math.max(ya, yb) < y0 - clear || Math.min(ya, yb) > y1 + clear) continue;
    return false;
  }
  return true;
}

// ── rule 2: height caps ────────────────────────────────────────────────────────────────────────────────────────
export type DressRole =
  /** Flowers, lanterns, the area accent stripe: counts toward the life budget (rule 6). */
  | 'life'
  /** The cat loaf: an animal that also counts toward the life budget. */
  | 'cat'
  /** A resting bird (gull, sparrow). */
  | 'animal'
  /** Ink-green ivy, ferns, reeds, vines, crown caps. */
  | 'foliage'
  /** Moss, rust and grime patches drawn as thin overlays. */
  | 'wear'
  /** The isolated filler's sapling (trunk and crown). */
  | 'sapling';
/** How far a dressing of `role` may rise above the solid's top (rule 2): nothing on Bump / Low / landable tops. */
export function riseCap(sol: Solid | null, role: DressRole): number {
  if (!sol || !sol.tall || sol.top === 'landable') return 0;
  switch (role) {
    case 'animal': case 'cat': return DRESS.animalRise;
    case 'sapling': return DRESS.sapling.rise;
    case 'foliage': case 'life': return DRESS.tallFoliageRise;
    default: return 0;
  }
}

// ── rule 2 exception: isolated column fillers ──────────────────────────────────────────────────────────────────
/** Is this column filler isolated (no other solid within `clear` m of its footprint in x or s, and not part of a gate
 *  row of fillers)? The chunk builder computes it from the chunk's obstacle list and passes it to drawObstacle. */
export function isIsolatedFiller(ob: Obstacle, others: readonly Obstacle[], clear: number = DRESS.sapling.clear): boolean {
  if (!(ob.tags & ObTag.Filler) || ob.solids.length === 0) return false;
  let x0 = Infinity, x1 = -Infinity, s0 = Infinity, s1 = -Infinity;
  for (const so of ob.solids) { x0 = Math.min(x0, so.box.x0); x1 = Math.max(x1, so.box.x1); s0 = Math.min(s0, so.box.s0); s1 = Math.max(s1, so.box.s1); }
  for (const o of others) {
    if (o === ob || o.id === ob.id) continue;
    if ((o.tags & ObTag.Filler) && Math.abs(o.s - ob.s) < 0.05) return false;          // a gate row: never
    for (const so of o.solids) {
      const b = so.box;
      if (b.x1 > x0 - clear && b.x0 < x1 + clear && b.s1 > s0 - clear && b.s0 < s1 + clear) return false;
    }
  }
  return true;
}

// ── the dresser: per-obstacle skin, clamps and the life ledger ─────────────────────────────────────────────────
export interface DressRecord {
  id: number; kind: PropKind; area: AreaId; variant: number; body: PropSkin['body']; dress: number;
  /** Top-view areas, m²: life accents and the silhouette (union of the solids' plan rects, clipped to the chunk). */
  life: number; silhouette: number; ratio: number;
  /** Dressing boxes the helper had to clamp (rules 1, 2) and refused (rules 5, 9, sapling without isolation). */
  clamped: number; refused: number;
}

/** Union area of axis-aligned rects [x0, x1, s0, s1] (coordinate sweep; n is small). */
export function unionArea(rects: readonly (readonly [number, number, number, number])[]): number {
  const xs = [...new Set(rects.flatMap((r) => [r[0], r[1]]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const xa = xs[i]!, xb = xs[i + 1]!;
    const iv = rects.filter((r) => r[0] <= xa && r[1] >= xb).map((r) => [r[2], r[3]] as const).sort((a, b) => a[0] - b[0]);
    let len = 0, cs = -Infinity, ce = -Infinity;
    for (const [a, b] of iv) {
      if (a > ce) { len += ce - cs > 0 ? ce - cs : 0; cs = a; ce = b; } else if (b > ce) ce = b;
    }
    len += ce - cs > 0 ? ce - cs : 0;
    area += len * (xb - xa);
  }
  return area;
}

export class Dresser {
  ob: Obstacle | null = null;
  /** The skin of the obstacle being drawn (propSkin(ob.kind, ob.area, ob.id, ob.variant, ob.hgt)). */
  readonly skin: PropSkin = newSkin();
  /** Set by the chunk builder: the obstacle is an isolated column filler (rule 2 exception). */
  isolated = false;
  /** Plan-view footprint (bounding box of the solids, else the obstacle box) and the chunk clip along s. */
  fx0 = 0; fx1 = 0; fs0 = 0; fs1 = 0; c0 = -Infinity; c1 = Infinity;
  /** Highest solid top (caps a dressing box that sits beside every solid). */
  ftop = Infinity;
  lifeArea = 0; clamped = 0; refused = 0;
  /** Tests: set to [] to log one DressRecord per drawn obstacle. */
  record: DressRecord[] | null = null;

  /** Starts an obstacle (drawObstacle calls it before the kit). `s0`/`s1`: the chunk clip of a long kind. */
  begin(ob: Obstacle, s0 = -Infinity, s1 = Infinity, isolated = false): PropSkin {
    this.ob = ob; this.isolated = isolated; this.c0 = s0; this.c1 = s1;
    this.lifeArea = 0; this.clamped = 0; this.refused = 0;
    propSkin(ob.kind, ob.area, ob.id, ob.variant, ob.hgt, this.skin);
    if (ob.solids.length) {
      this.fx0 = Infinity; this.fx1 = -Infinity; this.fs0 = Infinity; this.fs1 = -Infinity; this.ftop = -Infinity;
      for (const so of ob.solids) {
        const b = so.box;
        this.fx0 = Math.min(this.fx0, b.x0); this.fx1 = Math.max(this.fx1, b.x1);
        this.fs0 = Math.min(this.fs0, b.s0); this.fs1 = Math.max(this.fs1, b.s1); this.ftop = Math.max(this.ftop, b.y1);
      }
    } else {
      this.fx0 = ob.x - ob.wid / 2; this.fx1 = ob.x + ob.wid / 2; this.fs0 = ob.s; this.fs1 = ob.s + ob.len; this.ftop = Infinity;
    }
    return this.skin;
  }
  /** Ends the obstacle; logs its record when recording. */
  end(): void {
    const ob = this.ob;
    if (ob && this.record) {
      const sil = this.silhouetteArea();
      this.record.push({ id: ob.id, kind: ob.kind, area: ob.area, variant: ob.variant, body: this.skin.body, dress: this.skin.dress,
        life: this.lifeArea, silhouette: sil, ratio: sil > 0 ? this.lifeArea / sil : 0, clamped: this.clamped, refused: this.refused });
    }
    this.ob = null;
  }
  /** Does the skin carry this dressing (and may it: helper machines never carry wear or plants)? */
  has(flag: number): boolean {
    const d = this.skin.dress;
    return (d & flag) !== 0 && !((d & Dress.Clean) && (flag & WEAR_MASK));
  }
  /** The isolated-filler sapling is drawn (rolled 1 in 4 by the skin, and the chunk builder found it isolated). */
  get sapling(): boolean { return this.isolated && this.has(Dress.Sapling); }

  /** Rule 6: adds a life accent's top-view rect (clipped to the footprint and the chunk). */
  life(x0: number, x1: number, s0: number, s1: number): void {
    const w = Math.min(x1, this.fx1) - Math.max(x0, this.fx0);
    const l = Math.min(s1, this.fs1, this.c1) - Math.max(s0, this.fs0, this.c0);
    if (w > 0 && l > 0) this.lifeArea += w * l;
  }
  /** Rule 6: a round life accent (lantern, flower clump) of radius r. */
  lifeDisc(x: number, s: number, r: number): void {
    const before = this.lifeArea;
    this.life(x - r, x + r, s - r, s + r);
    this.lifeArea = before + (this.lifeArea - before) * (Math.PI / 4);
  }
  /** Top-view silhouette: union of the solids' plan rects (the obstacle box when it has none), clipped to the chunk. */
  silhouetteArea(): number {
    const ob = this.ob;
    if (!ob) return 0;
    const clip = (r: readonly [number, number, number, number]) =>
      [r[0], r[1], Math.max(r[2], this.c0), Math.min(r[3], this.c1)] as const;
    const rects = (ob.solids.length
      ? ob.solids.map((so) => clip([so.box.x0, so.box.x1, so.box.s0, so.box.s1]))
      : [clip([this.fx0, this.fx1, this.fs0, this.fs1])]).filter((r) => r[3] > r[2] && r[1] > r[0]);
    return unionArea(rects);
  }
  lifeRatio(): number { const s = this.silhouetteArea(); return s > 0 ? this.lifeArea / s : 0; }

  /** The solid under plan point (x, s) with the highest top (null: none). */
  solidAt(x: number, s: number): Solid | null {
    let best: Solid | null = null;
    for (const so of this.ob?.solids ?? []) {
      const b = so.box;
      if (x >= b.x0 && x <= b.x1 && s >= b.s0 && s <= b.s1 && (!best || b.y1 > best.box.y1)) best = so;
    }
    return best;
  }

  /** Draws one dressing box with the Kit's current brush under rules 1, 2, 5, 6 and 9: clamps it into the footprint
   *  (+0.05 m) and under the rise cap of the solid it sits on, refuses wear and plants on helper machines, foliage
   *  within 0.3 m of a grind edge and a sapling the chunk builder did not mark isolated, and adds `life` / `cat`
   *  boxes to the ledger. Returns false when nothing was drawn. */
  box(K: Kit, role: DressRole, x0: number, y0: number, s0: number, x1: number, y1: number, s1: number, faces: number = FACE.sides5): boolean {
    const ob = this.ob;
    if (!ob) return false;
    const clean = (this.skin.dress & Dress.Clean) !== 0;
    if ((clean && role !== 'life') || (role === 'sapling' && !this.sapling)) { this.refused++; return false; }
    const oh = DRESS.overhang;
    const cx0 = Math.max(x0, this.fx0 - oh), cx1 = Math.min(x1, this.fx1 + oh);
    const cs0 = Math.max(s0, this.fs0 - oh), cs1 = Math.min(s1, this.fs1 + oh);
    if (cx1 <= cx0 || cs1 <= cs0) { this.refused++; return false; }
    const sol = this.solidAt((cx0 + cx1) / 2, (cs0 + cs1) / 2);
    const top = sol ? sol.box.y1 + riseCap(sol, role) : this.ftop;
    const cy1 = Math.min(y1, top);
    if (cy1 <= y0) { this.refused++; return false; }
    if (role === 'foliage' && !clearOfEdges(cx0, cx1, cs0, cs1, y0, cy1, ob.edges)) { this.refused++; return false; }
    if (cx0 !== x0 || cx1 !== x1 || cs0 !== s0 || cs1 !== s1 || cy1 !== y1) this.clamped++;
    if (role === 'life' || role === 'cat') this.life(cx0, cx1, cs0, cs1);
    K.box(cx0, y0, cs0, cx1, cy1, cs1, faces);
    return true;
  }
}

/** The one dresser the kits share (drawing is synchronous, one obstacle at a time). */
export const DRESSER = new Dresser();
