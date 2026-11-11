// world/render/kits/shared.ts: the street base and the shared PropKinds (DESIGN §10.3 "Shared"), each re-skinned per
// area (DESIGN §18.6). Hazards follow DESIGN §18.4: ink bodies with one saturated accent (Neon: the inverted #7A6FB0
// body with an emissive rim), chevrons on every full-width hazard, noFog and matte flags on hazard bodies, contact
// shadows under every obstacle. Long kinds are drawn per chunk (clipped); compact kinds once, in their anchor chunk.
import { CAMERA } from '../../../core/tuning';
import type { AreaId } from '../../../core/ids';
import type { Chunk, GroundSlab, Obstacle, Pit } from '../../../core/world';
import { Dress } from '../../../core/skins';
import { ACCENTS, COLORS, LOOK, PAD_TOP, RECLAIM, fadePaint, mixHex, shade } from '../palette';
import { PAT } from '../textures/ground';
import { FACE, FX } from '../writer';
import { WARN, chevrons, contact, groundChevrons, groundOf, isFull, rnd, setArea, solidsFallback, surfaceLook, type KitCtx } from './common';
import { DRESS, DRESSER, clearOfEdges, mossOn, rustOn, type DressRole } from './dress';
import { FLORA } from './buildings';
import { vanAcrossKit } from './car';

export type KitFn = (c: KitCtx, ob: Obstacle) => void;
export interface KitDef { draw: KitFn; long?: boolean }

const HZ = FX.noFog | FX.matte;
/** Brush for a hazard body: ink-dark in Downtown, Suburbs and Docks (any colour passed is pulled down toward the
 *  ink body, so a kit's tinted parts never lift the silhouette past the gate), or the inverted, softly glowing Neon
 *  body. */
export function body(c: KitCtx, hex = c.hz.body): void {
  if (c.hz.inverted) { c.K.lit(0, 0, HZ, c.hz.glow).col(hex); return; }
  c.K.lit(0, 0, HZ).col(hex === c.hz.body || hex === c.hz.top ? hex : mixHex(hex, c.hz.body, 0.55));
}
/** Neon emissive rim along a top-front edge (0.03 m, DESIGN §18.4): emissive target, noFog. */
export function rim(c: KitCtx, x0: number, x1: number, y: number, s: number, s1?: number): void {
  if (!c.hz.inverted) return;
  const K = c.K, t = K.t;
  K.to('e').glowing(1.6, -1, FX.noFog).col(c.hz.rim);
  K.box(x0, y - 0.03, s - 0.012, x1, y + 0.006, s + 0.03, FACE.top | FACE.front);
  if (s1 !== undefined) K.box(x0, y - 0.01, s, x1, y + 0.008, s1, FACE.top);
  K.to(t);
}
/** Neon emissive rim on a round post or trunk (DESIGN §18.4 inverted hazards): a vertical strip on its camera face
 *  and a ring at `ringY`. No-op outside the inverted look. */
export function rimPost(c: KitCtx, x: number, s: number, r: number, y0: number, y1: number, ringY: number): void {
  if (!c.hz.inverted) return;
  const K = c.K, t = K.t;
  K.to('e').glowing(1.6, -1, FX.noFog).col(c.hz.rim);
  K.box(x - 0.02, y0, s - r - 0.012, x + 0.02, y1, s - r + 0.01, FACE.front);
  K.cyl(x, s, ringY, ringY + 0.035, r + 0.012, 8, false);
  K.to(t);
}
export const inChunk = (c: KitCtx, s: number) => s >= c.s0 && s < c.s1;

// ── street base (per chunk) ─────────────────────────────────────────────────────────────────────────────────────
const VERGE: Readonly<Record<AreaId, { color: number; pat: number }>> = {
  downtown: { color: 0xcdb8a3, pat: PAT.slabs }, suburbs: { color: 0x7eba6f, pat: PAT.grass },
  docks: { color: 0xc9b9a6, pat: PAT.apron }, neon: { color: 0x48426a, pat: PAT.tile },
};
/** RECLAIM (T7a; theme §5 green share, §1 "moss softens every stone"): grass and moss where the sidewalk meets the
 *  building line, flat (≤ 7 mm over the verge) in hash-gapped runs (doorways, bare stretches). |x| 4.85–5.3: beyond
 *  the 4.6 m vegetation line and 0.35 m clear of the curb's grind edge (rule 5, checked against every edge of the chunk
 *  too). Suburbs has its lawns instead; Neon grows the dark night moss (≤ 1.3:1 against its surfaces, rule 4). Not on
 *  the Docks harbor side (no wall behind it: a fringe on the open quay reads as a dashed lane line). */
function footGrowth(c: KitCtx, area: AreaId, a: number, b: number, y: number): void {
  if (area === 'suburbs') return;
  const K = c.K, f = FLORA[area], cols = area === 'neon' ? f.moss : [f.moss[0]!, f.leaf[1]!, f.moss[1]!];
  for (const side of [-1, 1] as const) {
    if (area === 'docks' && side > 0) continue;   // the open harbor side: a fringe on the quay reads as a dashed lane line
    const xo = 5.3;
    let s = a + 0.6 * rnd(a, side, 41);
    for (let i = 0; s < b - 0.2 && i < 8; i++) {
      const len = 0.9 + 2.1 * rnd(a, side, i, 42), e = Math.min(b, s + len), w = 0.22 + 0.23 * rnd(a, side, i, 44);
      const x0 = side * Math.max(4.85, xo - w), x1 = side * xo, lo = Math.min(x0, x1), hi = Math.max(x0, x1);
      if (rnd(a, side, i, 45) < 0.78 && clearOfEdges(lo, hi, s, e, y - 0.5, y + 0.5, c.edges, 0.3)) {
        K.lit(PAT.grass).col(cols[i % cols.length]!)   // ground level: under the camera-side cut, no `near` flag.box(lo, y, s, hi, y + 0.007, e, FACE.top);
        // A tongue toward the curb on some runs (growth spreading from the wall), still ≥ 4.85.
        if (rnd(a, side, i, 46) < 0.4) {
          const t0 = s + len * 0.2, t1 = Math.min(e, t0 + len * 0.45), tx = side * Math.max(4.85, Math.abs(lo + hi) / 2 - 0.25);
          K.col(cols[(i + 1) % cols.length]!).box(Math.min(tx, x0), y + 0.002, t0, Math.max(tx, x0), y + 0.006, t1, FACE.top);
        }
      }
      s = e + 0.25 + 1.1 * rnd(a, side, i, 43);
    }
  }
}

/** Road under the corridor in 4 m strips (colour by area along s, so a gateway blends the ground), cut around pits,
 *  and the verges beyond ±4.5 at sidewalk height. Both follow the street datum: the lowest ground slab across the
 *  corridor at s (world/gen lowers it after a full-width drop and lays its own bands, stairs and inclines), never
 *  above 0; strips are split at slab ends so a terrace or an incline carries the verges down with it. */
export function streetBase(c: KitCtx, ch: Chunk, roadAt: (s: number) => number = (s) => LOOK[c.areaAt(s)].road, split?: number): void {
  const K = c.K;
  const pits: Pit[] = [];
  for (const ob of ch.obstacles) for (const p of ob.pits) if (p.s1 > ch.s0 && p.s0 < ch.s0 + ch.len) pits.push(p);
  const hasWater = ch.decor.some((d) => d.kind === 'water');
  const e0 = ch.s0, e1 = ch.s0 + ch.len;
  const ground: GroundSlab[] = [];
  for (const ob of ch.obstacles) {
    if (ob.solids.length) continue;
    for (const sl of ob.slabs) if (sl.x1 > -4.5 && sl.x0 < 4.5 && sl.s1 > e0 && sl.s0 < e1) ground.push(sl);
  }
  const datumAt = (s: number): number => {
    let y = 0;
    for (const sl of ground) if (s >= sl.s0 && s < sl.s1) y = Math.min(y, sl.y0 + ((sl.y1 - sl.y0) * (s - sl.s0)) / Math.max(1e-6, sl.s1 - sl.s0));
    return y;
  };
  // 4 m strips, cut at slab ends where the datum changes and at the gateway look switch (chunkBuilder.lookSwitch).
  const cuts: number[] = [];
  for (let q = e0; q < e1 - 1e-6; q += 4) cuts.push(q);
  const cut = (q: number) => { if (q > e0 + 0.05 && q < e1 - 0.05 && !cuts.some((v) => Math.abs(v - q) < 0.05)) cuts.push(q); };
  for (const sl of ground) if (Math.min(sl.y0, sl.y1) < 0) { cut(sl.s0); cut(sl.s1); }
  if (split !== undefined) cut(split);
  cuts.sort((p, q) => p - q);
  cuts.push(e1);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i]!, b = cuts[i + 1]!, mid = (a + b) / 2, area = c.lookAt(mid);
    const ya = datumAt(a + 0.01), yb = datumAt(b - 0.01), lo = Math.min(ya, yb), bot = lo - 0.3;
    const road = roadAt(mid);
    K.reset();
    K.lit(area === 'neon' ? PAT.wet : PAT.asphalt).col(road);
    rectsMinusPits(-4.5, 4.5, a, b, pits, (x0, x1, s0, s1) => K.box(x0, bot, s0, x1, lo - 0.005, s1, FACE.top | FACE.front));
    const v = VERGE[area], flat = Math.abs(ya - yb) < 1e-3;
    // A flat strip as a box with only the faces the cameras see; a strip where the datum changes as a wedge.
    const verge = (x0: number, x1: number, h: number, faces: number) => {
      if (flat) K.box(x0, bot, a, x1, ya + h, b, faces); else K.wedge(x0, x1, a, b, bot, ya + h, yb + h);
    };
    K.lit(v.pat).col(v.color);
    verge(-18, -4.5, 0.15, FACE.top | FACE.right | FACE.front);
    if (area === 'docks' && !hasWater) {
      // Beyond the dock lip: a quay edge and the harbour water (a stand-in until WG's `water` decor arrives).
      K.lit(PAT.apron).col(0xb9ab98);
      verge(4.5, 5.1, 0.3, FACE.top | FACE.right);
      K.lit(0).col(COLORS.water).box(5.1, lo - 1.6, a, 18, lo - 0.9, b, FACE.top);
    } else verge(4.5, 18, 0.15, FACE.top | FACE.left | FACE.front);
    if (flat) footGrowth(c, area, a, b, ya + 0.15);
  }
  K.reset();
}
/** Calls f for the rectangles of [x0,x1]×[s0,s1] not covered by the pits. */
function rectsMinusPits(x0: number, x1: number, s0: number, s1: number, pits: readonly Pit[], f: (x0: number, x1: number, s0: number, s1: number) => void): void {
  let any = false;
  for (const p of pits) if (p.s1 > s0 && p.s0 < s1) { any = true; break; }
  if (!any) { f(x0, x1, s0, s1); return; }        // the common case: no pit in this strip
  const cuts = new Set<number>([s0, s1]);
  for (const p of pits) { if (p.s0 > s0 && p.s0 < s1) cuts.add(p.s0); if (p.s1 > s0 && p.s1 < s1) cuts.add(p.s1); }
  const ss = [...cuts].sort((u, v) => u - v);
  for (let i = 0; i + 1 < ss.length; i++) {
    const a = ss[i]!, b = ss[i + 1]!, mid = (a + b) / 2;
    const holes = pits.filter((p) => p.s0 <= mid && p.s1 >= mid).map((p) => [Math.max(x0, p.x0), Math.min(x1, p.x1)] as const)
      .filter(([u, v]) => v > u).sort((u, v) => u[0] - v[0]);
    let x = x0;
    for (const [h0, h1] of holes) { if (h0 > x + 1e-4) f(x, h0, a, b); x = Math.max(x, h1); }
    if (x < x1 - 1e-4) f(x, x1, a, b);
  }
}

// ── RECLAIM dressing helpers (DESIGN §18.4 dressing rules; every box goes through DRESSER) ──────────────────────
/** Brush for dressing on a hazard: noFog and matte like the body, the Neon body glow in the inverted look. */
export function dressBrush(c: KitCtx, hex: number): void { c.K.lit(0, 0, HZ, c.hz.inverted ? c.hz.glow : 0).col(hex); }
/** Hazard foliage (rule 4): ink-green (the lit-side highlight on sun faces), or in the inverted Neon look the moss
 *  matched to the lavender body. */
export const leaf = (c: KitCtx, lit = false) => (c.hz.inverted ? RECLAIM.neonHazardMoss : lit ? RECLAIM.hazardFoliageLit : RECLAIM.hazardFoliage);
/** A dressing box (through DRESSER) with the dressing brush. */
export function dress(c: KitCtx, role: DressRole, hex: number, x0: number, y0: number, s0: number, x1: number, y1: number, s1: number, faces: number = FACE.sides5): boolean {
  dressBrush(c, hex);
  return DRESSER.box(c.K, role, x0, y0, s0, x1, y1, s1, faces);
}
/** Ivy climbing a round post (x, s, radius r) from y0 to y1: leaf clusters spiralling over its camera and side faces.
 *  Skipped unless the skin carries ivy; clusters within 0.3 m of a grind edge are left out (rule 5). */
export function ivyPost(c: KitCtx, ob: Obstacle, x: number, s: number, r: number, y0: number, y1: number, n = 5): void {
  if (!DRESSER.has(Dress.Ivy) || y1 <= y0) return;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, a = Math.PI * (0.95 + 1.1 * ((i * 0.61) % 1)), y = y0 + (y1 - y0) * u;
    const px = x + Math.cos(a) * (r + 0.01), ps = s + Math.sin(a) * (r + 0.01), w = 0.045 + 0.02 * ((i * 0.37) % 1);
    if (!clearOfEdges(px - w, px + w, ps - w, ps + w, y - 0.05, y + 0.06, ob.edges)) continue;
    dress(c, 'foliage', leaf(c, i % 3 === 1), px - w, y - 0.05, ps - w, px + w, y + 0.06, ps + w, FACE.top | FACE.front | FACE.left | FACE.right);
  }
}
/** A patch of leaf boxes in the thin region x0..x1 × s0..s1 × y0..y1 (ivy on a face, ferns at a base): denser and
 *  lower toward y0 (ivy trails down). Clusters within 0.3 m of a grind edge are left out (rule 5). */
export function leafPatch(c: KitCtx, ob: Obstacle, x0: number, x1: number, s0: number, s1: number, y0: number, y1: number, n: number, seed: number, faces: number = FACE.sides5): void {
  if (x1 <= x0 || s1 <= s0 || y1 <= y0) return;
  for (let i = 0; i < n; i++) {
    const u = rnd(seed, i, 1), v = rnd(seed, i, 2), w = rnd(seed, i, 3);
    const hx = Math.min((x1 - x0) / 2, 0.05 + 0.04 * w), hs = Math.min((s1 - s0) / 2, 0.05 + 0.04 * u), hh = 0.04 + 0.05 * v;
    const cx = x0 + hx + (x1 - x0 - 2 * hx) * u, cs = s0 + hs + (s1 - s0 - 2 * hs) * w, cy = y0 + (y1 - y0 - hh) * v * v;
    const bx0 = cx - hx, bx1 = cx + hx, bs0 = cs - hs, bs1 = cs + hs, by1 = Math.min(y1, cy + 2 * hh);
    if (!clearOfEdges(bx0, bx1, bs0, bs1, cy, by1, ob.edges)) continue;
    dress(c, 'foliage', leaf(c, i % 4 === 1), bx0, cy, bs0, bx1, by1, bs1, faces);
  }
}
/** Moss (wear, luminance-matched to the face it covers, rule 4) as a thin patch. */
export function mossPatch(c: KitCtx, face: number, x0: number, y0: number, s0: number, x1: number, y1: number, s1: number, faces: number): void {
  if (!DRESSER.has(Dress.Moss)) return;
  dress(c, 'wear', mossOn(face), x0, y0, s0, x1, y1, s1, faces);
}
/** Rust (wear: ink rust on ink faces, else luminance-matched; never crimson) as a thin patch. */
export function rustPatch(c: KitCtx, face: number, x0: number, y0: number, s0: number, x1: number, y1: number, s1: number, faces: number): void {
  if (!DRESSER.has(Dress.Rust)) return;
  dress(c, 'wear', rustOn(face), x0, y0, s0, x1, y1, s1, faces);
}
/** Helper-machine band (rule 9): two tones of accent2 along both flanks (life accents, side faces only). */
export function helperBand(c: KitCtx, x0: number, x1: number, y: number, s0: number, s1: number): void {
  for (let k = 0; k < 2; k++) {
    const hex = k ? shade(c.hz.accent2, -0.35) : c.hz.accent2, ya = y - k * 0.05, yb = ya + 0.05;
    dress(c, 'life', hex, x0 - 0.006, ya, s0, x0, yb, s1, FACE.left);
    dress(c, 'life', hex, x1, ya, s0, x1 + 0.006, yb, s1, FACE.right);
  }
}
/** The isolated column filler's sapling (rule 2 exception: 1 in 4, only when the chunk builder marked it isolated):
 *  an ink trunk rooted at the far (up-screen) edge of the lid and a flat ink-green crown (radius ≤ 0.35 m, inside the
 *  footprint + 0.05 m, top ≤ lid + 0.6 m), so the lid's near part stays in view. */
export function sapling(c: KitCtx, x: number, s0: number, s1: number, half: number, lid: number): void {
  if (!DRESSER.sapling) return;
  const K = c.K, rise = DRESS.sapling.rise, r = Math.min(DRESS.sapling.crownR, half, (s1 - s0) * 0.5);
  const ts = s1 - 0.07, cs = s1 + 0.04 - r, cy = lid + rise - r * 0.5, cap = K.capY;
  // Above the x-ray cap like every in-corridor tall part (DESIGN §8).
  K.capY = (DRESSER.solidAt(x, (s0 + s1) / 2)?.box.y0 ?? lid - 1.15) + CAMERA.xrayCapY;
  if (dress(c, 'sapling', 0x241a16, x - 0.022, lid, ts - 0.022, x + 0.022, cy, ts + 0.022)) {
    dressBrush(c, leaf(c)); K.sphere(x, cy, cs, r, 7, 3, 0.5);
    dressBrush(c, leaf(c, true)); K.sphere(x - r * 0.25, cy + r * 0.12, cs + r * 0.15, r * 0.6, 5, 3, 0.55);
  }
  K.capY = cap;
}

// ── shared kinds ────────────────────────────────────────────────────────────────────────────────────────────────
/** Curb: a weathered curb-stone band along the road edge of each sidewalk slab (the slab and the pick-only waxed
 *  coping are drawn by the dispatcher; weeds are flat edge-band decals, ≥ 0.3 m from the coping). */
const curb: KitFn = (c, ob) => {
  const K = c.K;
  // world/gen's street base: only the sidewalk bands (params.band 1) carry a curb stone.
  if (ob.params?.band !== undefined && ob.params.band !== 1) return;
  for (const sl of ob.slabs) {
    const roadSide = Math.abs(sl.x0) < Math.abs(sl.x1) ? sl.x0 : sl.x1, dir = Math.sign(sl.x0 + sl.x1) || 1;
    const area = c.areaAt(sl.s0);
    // A mid-tone stone band, clearly darker than the cream lip at its road edge, so the lip reads as its own stripe
    // (the band never merges with it into one wide light surface, DESIGN §18.4). Darker since @cam: the perspective
    // camera sees the lip against the band with the shadowed road on its other side, where the ink underline merges
    // with the road, so the cream alone must carry ≥ 1.8:1 against the band.
    const col = area === 'neon' ? 0x7d759c : area === 'suburbs' ? 0x9c9186 : 0x9a8b7e;
    const x0 = Math.min(roadSide, roadSide + dir * 0.26), x1 = Math.max(roadSide, roadSide + dir * 0.26);
    K.lit(0).col(col).box(x0, sl.y0 - 0.05, sl.s0, x1, sl.y0 + 0.008, sl.s1, FACE.top);
  }
};

/** Flat bar: rust-brown square posts every ~2.2 m (crash faces below the rail), rusty base plates, a rust-brown tube
 *  under the waxed cream-chrome top (the dispatcher's grind edge: the only polished part). */
const flatbar: KitFn = (c, ob) => {
  const K = c.K, b = ob.solids[0]?.box;
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, top = b.y1, g = b.y0, len = b.s1 - b.s0;
  const n = Math.max(1, Math.round(len / 2.2));
  const tube = c.area === 'neon' ? 0x8f9ad0 : 0x6e3c28;
  for (let i = 0; i <= n; i++) {
    const s = b.s0 + 0.08 + (len - 0.16) * (i / n);
    if (!inChunk(c, s)) continue;
    body(c, c.hz.inverted ? c.hz.body : 0x4a2418);
    K.box(x - 0.03, g, s - 0.03, x + 0.03, top - 0.04, s + 0.03, FACE.sides5 & ~FACE.top);
    K.lit(0).col(c.hz.inverted ? 0x4a3b6b : 0x3a1e14).box(x - 0.08, g, s - 0.06, x + 0.08, g + 0.02, s + 0.06, FACE.top | FACE.front);
  }
  K.lit(0, 0, FX.noFog).col(tube);
  K.box(x - 0.028, top - 0.055, b.s0, x + 0.028, top - 0.012, b.s1, FACE.front | FACE.back | FACE.left | FACE.right);
};

/** Bench 2.0 × 0.5 × 0.45 (DESIGN §10.3): granite block with moss in the face joints (DT), park bench with ink ivy on
 *  the legs (SB), sun-greyed pallet bench (IN), stone with wood slats and moss on the faces (NE). Waxed long edges
 *  (dispatcher). Landable top: clean; nothing rises above it. */
const bench: KitFn = (c, ob) => {
  const K = c.K, b = ob.solids[0]?.box;
  if (!b) return;
  const { x0, x1, s0, s1, y0, y1 } = b;
  contact(c, x0, x1, s0, s1, y0 + 0.01, 0.5, 0.2);
  if (c.area === 'downtown' || c.area === 'neon') {
    const stone = c.area === 'neon' ? 0x8a809e : 0x9c8d86, top = c.area === 'neon' ? 0xa9744f : 0xb9a9a0, leg = shade(stone, -0.25);
    K.lit(PAT.pavers).col(leg);
    for (const s of [s0 + 0.12, s1 - 0.42]) K.chamfer(x0 + 0.04, y0, s, x1 - 0.04, y1 - 0.1, s + 0.3, 0.02);
    K.lit(c.area === 'neon' ? PAT.planks : PAT.pavers).col(top).chamfer(x0, y1 - 0.1, s0, x1, y1, s1, 0.025);
    // Moss in the joints: under the top slab on the legs' faces and at their feet.
    for (const s of [s0 + 0.12, s1 - 0.42]) mossPatch(c, leg, x0 + 0.035, y0, s - 0.004, x1 - 0.035, y0 + 0.05, s + 0.3, FACE.front | FACE.left | FACE.right);
    if (c.area === 'neon') rim(c, x0, x1, y1 - 0.1, s0);
  } else if (c.area === 'suburbs') {
    K.lit(0).col(0x2b2140);
    for (const s of [s0 + 0.15, s1 - 0.2]) { K.box(x0 + 0.03, y0, s, x0 + 0.08, y1 - 0.05, s + 0.05); K.box(x1 - 0.08, y0, s, x1 - 0.03, y1 - 0.05, s + 0.05); K.box(x0 + 0.03, y1 - 0.12, s, x1 - 0.03, y1 - 0.06, s + 0.05); }
    K.lit(PAT.planks).col(0x9a7a5c);
    const n = 3, w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) K.chamfer(x0 + i * w + 0.015, y1 - 0.06, s0, x0 + (i + 1) * w - 0.015, y1, s1, 0.01);
    // Ink ivy on the legs, low (≥ 0.3 m under the waxed edges).
    if (DRESSER.has(Dress.Ivy)) for (const s of [s0 + 0.15, s1 - 0.2]) {
      dress(c, 'foliage', leaf(c), x0 + 0.02, y0, s - 0.01, x0 + 0.09, Math.min(y0 + 0.14, y1 - 0.31), s + 0.06);
      dress(c, 'foliage', leaf(c, true), x1 - 0.09, y0, s - 0.01, x1 - 0.02, Math.min(y0 + 0.1, y1 - 0.31), s + 0.06);
    }
  } else {
    // Sun-greyed pallet bench: two pallets (deck boards over three blocks).
    const wood = 0x9a8f80;
    for (let k = 0; k < 2; k++) {
      const ya = y0 + k * ((y1 - y0) / 2), yb = ya + (y1 - y0) / 2;
      K.lit(0).col(shade(wood, -0.35));
      for (const xx of [x0 + 0.02, (x0 + x1) / 2 - 0.05, x1 - 0.12]) K.box(xx, ya, s0 + 0.05, xx + 0.1, yb - 0.04, s1 - 0.05);
      K.lit(PAT.planks).col(shade(wood, k ? 0 : -0.1)).box(x0, yb - 0.04, s0, x1, yb, s1);
    }
  }
};

/** Manual pad: a raised concrete slab with a chamfered top (curb-class edges by the dispatcher), moss on its side faces
 *  and a clean top (G1: a mid-value top, so the cream-chrome edge reads against it). */
const manualPad: KitFn = (c, ob) => {
  const K = c.K, b = ob.solids[0]?.box ?? (ob.slabs[0] ? { x0: ob.slabs[0].x0, x1: ob.slabs[0].x1, s0: ob.slabs[0].s0, s1: ob.slabs[0].s1, y0: groundOf(ob) - 0.15, y1: ob.slabs[0].y0 } : null);
  if (!b) return;
  const col = PAD_TOP[c.area], yb = Math.min(b.y0, 0);
  K.lit(PAT.slabs).col(col).chamfer(b.x0, yb, b.s0, b.x1, b.y1, b.s1, 0.03);
  // Moss on the side faces, low, in this chunk only (long kind).
  const a = Math.max(b.s0, c.s0), z = Math.min(b.s1, c.s1), h = b.y1 - yb;
  if (z - a > 0.4 && h > 0.08) {
    if (inChunk(c, b.s0)) mossPatch(c, col, b.x0 + 0.2, yb, b.s0 - 0.004, b.x0 + 0.2 + (b.x1 - b.x0) * 0.35, yb + h * 0.55, b.s0, FACE.front);
    for (let s = Math.ceil(a / 2.6) * 2.6 + 0.3, k = 0; s < z - 0.9; s += 2.6, k++) {
      const xx = k % 2 ? b.x1 : b.x0 - 0.004;
      mossPatch(c, col, xx, yb, s, xx + 0.004, yb + h * 0.5, s + 0.8, k % 2 ? FACE.right : FACE.left);
    }
  }
};

/** Trash can 0.6 × 0.6 × 1.15 (tall): a rusty 10-sided litter bin (ink body, ink-rust patches, one faded accent band),
 *  ink ivy up its sides, a moss-coloured lid (luminance-matched) and a dark slot on the camera face. Docks: a ribbed
 *  drum; Neon: the inverted body with a magenta rim. The isolated filler may grow its sapling. */
const trashCan: KitFn = (c, ob) => {
  const K = c.K, b = ob.solids[0]?.box;
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2, r = (b.x1 - b.x0) / 2 - 0.01, g = b.y0, top = b.y1;
  contact(c, b.x0, b.x1, b.s0, b.s1, g + 0.01, 0.62, 0.25);
  K.capY = g + CAMERA.xrayCapY;
  body(c); K.cyl(x, s, g, top - 0.12, r, 10, false);
  if (c.area === 'docks') {
    K.lit(0, 0, HZ).col(c.hz.accent2);
    for (const y of [g + 0.35, g + 0.72]) K.cyl(x, s, y, y + 0.02, r + 0.012, 10, false);
  } else {
    K.lit(0, 0, HZ, c.hz.glow).col(c.hz.inverted ? c.hz.accent : fadePaint(c.hz.accent)).cyl(x, s, top - 0.33, top - 0.29, r + 0.008, 10, false);
  }
  // Ink-rust patches on the camera face.
  rustPatch(c, c.hz.body, x - r * 0.34, g + 0.12, s - r * 0.94 - 0.005, x + r * 0.1, g + 0.34, s - r * 0.9, FACE.front);
  // Lid: a short collar and a moss-coloured dome (luminance-matched to the lid it covers).
  const lid = c.hz.top;
  body(c); K.cyl(x, s, top - 0.12, top - 0.06, r + 0.02, 10, false);
  dressBrush(c, DRESSER.has(Dress.Moss) ? mossOn(lid) : lid); K.frustum(x, s, top - 0.06, top, r + 0.02, r * 0.55, 10, true);
  if (!c.hz.inverted) K.lit(0, 0, HZ).col(0x5a4a72).cyl(x, s, top - 0.065, top - 0.055, r + 0.024, 10, false);
  // Slot on the camera-facing side.
  K.lit(0, 0, HZ).col(c.hz.inverted ? 0x2b2140 : 0x120c1e).box(x - r * 0.5, top - 0.24, b.s0 - 0.005, x + r * 0.5, top - 0.16, b.s0 + 0.04, FACE.front);
  rim(c, x - r, x + r, top - 0.06, b.s0 + 0.02);
  K.capY = null;
  ivyPost(c, ob, x, s, r, g + 0.04, top - 0.4, 4);
  sapling(c, x, b.s0, b.s1, r, top);
};

/** Cone (knock): a sun-faded cone with a muted band on a square base and a grass collar round its foot. */
const cone: KitFn = (c, ob) => {
  const K = c.K, b = ob.solids[0]?.box;
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2, r = (b.x1 - b.x0) / 2, g = b.y0, h = b.y1 - g;
  contact(c, b.x0, b.x1, b.s0, b.s1, g + 0.01, 0.4);
  const faded = fadePaint(COLORS.knock);
  K.lit(0).col(0x2b2140).box(x - r, g, s - r, x + r, g + 0.04, s + r);
  K.lit(0).col(faded).frustum(x, s, g + 0.04, g + h * 0.45, r * 0.8, r * 0.5, 8, false);
  K.col(0xc9b49a).frustum(x, s, g + h * 0.45, g + h * 0.62, r * 0.5, r * 0.4, 8, false);
  K.col(faded).frustum(x, s, g + h * 0.62, g + h, r * 0.4, 0.02, 8, true);
  // Grass collar (low, at the base).
  if (DRESSER.has(Dress.Ivy)) {
    K.lit(0).col(RECLAIM.moss);
    DRESSER.box(K, 'foliage', x - r, g + 0.04, s - r, x + r * 0.2, g + 0.1, s - r * 0.3, FACE.top | FACE.front | FACE.left);
  }
};

/** Full-width barrier_low (DESIGN §10.3 RECLAIM skins). Downtown (both height classes, the Roll-out included): faded
 *  road-works barrier boards on trestles, the chevron board the solid full-width face, ink ivy on the trestle legs
 *  only. Suburbs: a fallen tree trunk (moss-coloured top, sawn ends) with the chevron boards on stakes in front. Docks:
 *  a rusty pipe run on chevroned blocks, ink seagrass at the blocks. Neon: the holo gate (a solid chevroned base under
 *  its light bar, which pulses with the warning). The chevrons stay fresh: the only fresh paint. Every variant stands
 *  in its contact shadow behind a chevron warning band on the ground. An optional slot splits the solids. */
const barrier: KitFn = (c, ob) => {
  const area = c.area;
  for (const so of ob.solids) {
    const b = so.box;
    if (area !== 'neon') groundChevrons(c, b.x0, b.x1, b.s0 - BARRIER_BAND.near - BARRIER_BAND.depth, b.s0 - BARRIER_BAND.near);
    if (area === 'neon') holoGate(c, b);
    else if (area === 'suburbs') fallenLog(c, ob, b);
    else if (area === 'docks') pipeRun(c, ob, b);
    else roadWorks(c, ob, b);
  }
};
/** The ground warning band in front of a full-width barrier: its depth and its gap to the barrier front (m). */
export const BARRIER_BAND = { depth: 0.45, near: 0.6 } as const;
type Box = Obstacle['solids'][number]['box'];

/** Road-works barrier: boards ~2.2 m long, each on two A-frame trestles; the upper board (the solid face) carries the
 *  chevrons, the taller class a lower plain board. */
function roadWorks(c: KitCtx, ob: Obstacle, b: Box): void {
  const K = c.K, g = b.y0, top = b.y1, span = b.x1 - b.x0, h = top - g;
  const n = Math.max(1, Math.round(span / 2.2)), w = span / n, bh = Math.min(0.2, h * 0.45);
  const sf = b.s0 + 0.16, sb = b.s0 + 0.28, sm = (b.s0 + b.s1) / 2;
  for (let i = 0; i < n; i++) {
    const xa = b.x0 + i * w, xb = xa + w;
    contact(c, xa + 0.05, xb - 0.05, b.s0, b.s1, g + 0.01, 0.4, 0.05);
    // Two trestles: splayed legs in s under a cross bar.
    for (const tx of [xa + 0.22, xb - 0.22]) {
      body(c);
      K.quad(tx - 0.04, g, b.s0 + 0.03, tx + 0.04, g, b.s0 + 0.03, tx + 0.04, top - 0.02, sm - 0.02, tx - 0.04, top - 0.02, sm - 0.02);
      K.quad(tx + 0.04, g, b.s1 - 0.03, tx - 0.04, g, b.s1 - 0.03, tx - 0.04, top - 0.02, sm + 0.02, tx + 0.04, top - 0.02, sm + 0.02);
      K.box(tx - 0.05, top - 0.06, sm - 0.06, tx + 0.05, top - 0.02, sm + 0.06);
      // Ink ivy on the trestle legs only, low.
      if (DRESSER.has(Dress.Ivy) && (i + (tx > xa + 0.5 ? 1 : 0) + ob.id) % 2 === 0) {
        dress(c, 'foliage', leaf(c), tx - 0.07, g, b.s0 + 0.01, tx + 0.07, g + Math.min(0.18, h * 0.4), b.s0 + 0.1, FACE.top | FACE.front | FACE.left | FACE.right);
      }
    }
    // The chevron board (the solid face) and, on the taller class, a plain lower board.
    body(c); K.chamfer(xa + 0.02, top - bh, sf, xb - 0.02, top, sb, 0.015, c.hz.top);
    chevrons(c, xa + 0.02, xb - 0.02, top - bh + 0.025, top - 0.025, sf, 0.6, 0.32);
    if (h > 0.5) { body(c); K.box(xa + 0.02, g + 0.1, sf, xb - 0.02, g + 0.22, sb); }
  }
}

/** Fallen tree trunk across the street (Ø = the barrier height, so the hitbox is full): ink bark, a moss-coloured top
 *  (luminance-matched to the bark), lighter sawn ends, and the chevron boards on stakes in front. */
function fallenLog(c: KitCtx, ob: Obstacle, b: Box): void {
  const K = c.K, g = b.y0, top = b.y1, span = b.x1 - b.x0, r = (top - g) / 2, sm = (b.s0 + b.s1) / 2, bark = 0x2e2018;
  contact(c, b.x0, b.x1, sm - r, sm + r, g + 0.01, 0.55, 0.1);
  // The trunk tapers in two lengths (the thick end on the left), with two sawn-off branch stubs toward the camera.
  const xm = b.x0 + span * 0.55;
  body(c, bark); K.hcyl('x', 0, g + r, sm, b.x0 + 0.02, xm, r, 9, false);
  body(c, shade(bark, 0.04)); K.hcyl('x', 0, g + r * 0.92, sm, xm, b.x1 - 0.02, r * 0.92, 9, false);
  for (const u of [0.28, 0.74]) {
    const x = b.x0 + span * u, sa = Math.max(b.s0, sm - r - 0.1);
    body(c, shade(bark, 0.08)); K.box(x - 0.06, g + r * 1.05, sa, x + 0.06, g + r * 1.05 + 0.1, sm - r * 0.6, FACE.top | FACE.front | FACE.left | FACE.right);
    K.lit(0, 0, HZ).col(0x6a5040).box(x - 0.055, g + r * 1.05 + 0.005, sa - 0.004, x + 0.055, g + r * 1.05 + 0.095, sa, FACE.front);
  }
  if (DRESSER.has(Dress.Ivy)) leafPatch(c, ob, b.x0 + span * 0.35, b.x0 + span * 0.5, sm - r - 0.03, sm - r * 0.4, g, g + r * 1.2, 3, ob.id * 41 + 3, FACE.front | FACE.top | FACE.left | FACE.right);
  // Moss along the top (colour only on a low prop: a flush strip on the uppermost facets).
  if (DRESSER.has(Dress.Moss)) dress(c, 'wear', mossOn(shade(bark, 0.15)), b.x0 + 0.1, top - 0.05, sm - r * 0.35, b.x1 - 0.1, top - 0.002, sm + r * 0.35, FACE.top | FACE.front);
  // Sawn ends: pale rings with darker heart wood.
  K.lit(0, 0, HZ).col(0x6a5040);
  K.hcyl('x', 0, g + r, sm, b.x0, b.x0 + 0.02, r * 0.96, 9, true); K.hcyl('x', 0, g + r, sm, b.x1 - 0.02, b.x1, r * 0.96, 9, true);
  // Chevron boards on stakes in front of the trunk.
  const n = Math.max(1, Math.round(span / 3));
  for (let i = 0; i < n; i++) {
    const x = b.x0 + span * ((i + 0.5) / n);
    body(c); K.box(x - 0.02, g, b.s0 - 0.04, x + 0.02, top - 0.12, b.s0);
    body(c); K.box(x - 0.3, top - 0.28, b.s0 - 0.06, x + 0.3, top - 0.1, b.s0 - 0.03, FACE.sides5);
    chevrons(c, x - 0.3, x + 0.3, top - 0.27, top - 0.11, b.s0 - 0.06, 0.2, 0.42);
  }
}

/** Rusty pipe run on concrete blocks (ink-dark, chevroned fronts) with ink seagrass at the blocks. */
function pipeRun(c: KitCtx, ob: Obstacle, b: Box): void {
  const K = c.K, g = b.y0, top = b.y1, sm = (b.s0 + b.s1) / 2, span = b.x1 - b.x0;
  const n = Math.max(1, Math.round(span / 1.8));
  for (let i = 0; i <= n; i++) {
    const x = b.x0 + 0.2 + (span - 0.4) * (i / n);
    body(c); K.chamfer(x - 0.2, g, b.s0 + 0.02, x + 0.2, top - 0.22, b.s1 - 0.02, 0.03, c.hz.top);
    chevrons(c, x - 0.2, x + 0.2, g + 0.04, top - 0.25, b.s0 + 0.02, 0.2, 0.42);
    if (DRESSER.has(Dress.Ivy) && (i + ob.id) % 2 === 0) {
      dress(c, 'foliage', leaf(c), x + 0.2, g, b.s0 + 0.1, x + 0.34, g + 0.14, b.s1 - 0.12, FACE.top | FACE.front | FACE.right);
    }
  }
  body(c, 0x3a2420); K.hcyl('x', 0, top - 0.17, sm - 0.11, b.x0, b.x1, 0.1, 6, true);
  body(c, 0x2e1c1a); K.hcyl('x', 0, top - 0.11, sm + 0.12, b.x0, b.x1, 0.1, 6, true);
  K.lit(0, 0, HZ).col(c.hz.accent2);
  for (let x = b.x0 + 0.9; x < b.x1; x += 1.8) K.hcyl('x', 0, top - 0.17, sm - 0.11, x, x + 0.06, 0.106, 6, false);
}

function holoGate(c: KitCtx, b: Box): void {
  const K = c.K, g = b.y0, top = b.y1, span = b.x1 - b.x0, base = g + (top - g) * 0.62;
  // Solid chevroned base (inverted body) with the emissive rim on its top front edge.
  body(c); K.chamfer(b.x0, g, b.s0, b.x1, base, b.s1, 0.03, c.hz.top);
  chevrons(c, b.x0 + 0.04, b.x1 - 0.04, g + 0.05, base - 0.05, b.s0, 0.55, 0.36);
  rim(c, b.x0, b.x1, base, b.s0);
  // Posts and the light bar (emissive cyan-white, pulses with the warning: the one pulsing hazard light in Neon).
  const n = Math.max(1, Math.round(span / 3));
  for (let i = 0; i <= n; i++) {
    const x = b.x0 + 0.06 + (span - 0.12) * (i / n);
    body(c); K.box(x - 0.04, base, (b.s0 + b.s1) / 2 - 0.04, x + 0.04, top, (b.s0 + b.s1) / 2 + 0.04);
  }
  K.to('e').glowing(1.9, -1, FX.noFog | WARN).col(0xbff9ff);
  K.box(b.x0, top - 0.07, (b.s0 + b.s1) / 2 - 0.035, b.x1, top, (b.s0 + b.s1) / 2 + 0.035, FACE.sides5);
  K.to('o');
  if (c.glowLeft > 0) {
    c.glowLeft--;
    K.col(0x3ff2ff).fxs(0, 0, 0.55, 0).card((b.x0 + b.x1) / 2, top - 0.05, (b.s0 + b.s1) / 2 + 0.02, span, 0.7);
  }
}

/** Trench (full width): the jagged crack lips, pit floor and walls come from common.ts `pit`, the plank slab from the
 *  dispatcher; here the per-area plank and the lip-face dressing (always below lip level): DT a sunken road seam with
 *  ink ferns under a scaffold plank (#A9744F), SB an overgrown ditch with ink reeds and the culvert slab, Docks a quay
 *  seam with two steel plates, Neon a cable trench under a grate plank. */
const trench: KitFn = (c, ob) => {
  const K = c.K;
  for (const sl of ob.slabs) {
    if (!ob.pits.some((p) => sl.s0 < p.s1 && sl.s1 > p.s0)) continue;
    const y = Math.max(sl.y0, sl.y1) + 0.004;
    if (c.area === 'downtown') {
      K.lit(PAT.planks).col(RECLAIM.plank).box(sl.x0, y - 0.05, sl.s0 - 0.12, sl.x1, y + 0.03, sl.s1 + 0.12);
      K.lit(0).col(0x5a4636);
      for (const s of [sl.s0 + 0.05, sl.s1 - 0.1]) K.box(sl.x0 + 0.05, y + 0.03, s, sl.x1 - 0.05, y + 0.04, s + 0.05, FACE.top);
    } else if (c.area === 'suburbs') {
      K.lit(PAT.slabs).col(0xb4a898).chamfer(sl.x0 - 0.1, y - 0.12, sl.s0 - 0.15, sl.x1 + 0.1, y + 0.03, sl.s1 + 0.15, 0.03);
    } else if (c.area === 'docks') {
      const mid = (sl.x0 + sl.x1) / 2;
      K.lit(PAT.plate).col(0x8a909e);
      K.box(sl.x0, y - 0.03, sl.s0 - 0.15, mid - 0.02, y + 0.02, sl.s1 + 0.15);
      K.box(mid + 0.02, y - 0.03, sl.s0 - 0.15, sl.x1, y + 0.02, sl.s1 + 0.15);
    } else {
      K.lit(0).col(0x8a8fb0).box(sl.x0, y - 0.03, sl.s0 - 0.1, sl.x1, y + 0.02, sl.s1 + 0.1);
      K.col(0x3a3058);
      for (let s = sl.s0; s < sl.s1 - 0.05; s += 0.12) K.box(sl.x0 + 0.06, y + 0.02, s, sl.x1 - 0.06, y + 0.025, s + 0.05, FACE.top);
      K.to('e').glowing(1.2, -1, FX.noFog).col(0x3ff2ff);
      K.box(sl.x0, y + 0.02, sl.s0 - 0.1, sl.x0 + 0.03, y + 0.03, sl.s1 + 0.1, FACE.top);
      K.box(sl.x1 - 0.03, y + 0.02, sl.s0 - 0.1, sl.x1, y + 0.03, sl.s1 + 0.1, FACE.top);
      K.to('o');
    }
  }
  // Ferns (DT) / reeds (SB) on the lip faces, below lip level, clear of the plank: tufts on the camera-facing far wall.
  if ((c.area !== 'downtown' && c.area !== 'suburbs') || !DRESSER.has(Dress.Ivy)) return;
  const reeds = c.area === 'suburbs';
  for (const p of ob.pits) {
    if (p.s1 <= c.s0 || p.s1 > c.s1 + 0.01) continue;
    const d = Math.max(0.2, p.depth), floor = p.lipY - d, top = p.lipY - 0.07;
    for (let x = p.x0 + 0.4, i = 0; x < p.x1 - 0.4; x += 0.7 + rnd(ob.id, i, 7) * 0.8, i++) {
      if (ob.slabs.some((sl) => x > sl.x0 - 0.35 && x < sl.x1 + 0.35)) continue;
      // A tuft: a taller centre blade and two shorter ones leaning out (reeds: thin and upright), rooted in the wall.
      const y0 = floor + d * (reeds ? 0.05 : 0.25 + 0.3 * rnd(ob.id, i, 8)), hh = Math.min(top - y0, d * (reeds ? 0.75 : 0.35));
      if (hh < 0.06) continue;
      const w = reeds ? 0.015 : 0.035, f = FACE.front | FACE.top | FACE.left | FACE.right;
      dress(c, 'foliage', leaf(c, true), x - w, y0, p.s1 - 0.07, x + w, y0 + hh, p.s1 - 0.02, f);
      dress(c, 'foliage', leaf(c), x - 0.07 - w, y0 + hh * 0.1, p.s1 - 0.06, x - 0.07 + w, y0 + hh * 0.7, p.s1 - 0.02, f);
      dress(c, 'foliage', leaf(c, i % 2 === 0), x + 0.07 - w, y0 + hh * 0.05, p.s1 - 0.06, x + 0.07 + w, y0 + hh * 0.6, p.s1 - 0.02, f);
    }
  }
};

/** Stairs: the steps are slabs (dispatcher); side cheek walls on the open ends of each flight, moss on the risers only
 *  (the camera-facing risers of an upward flight; treads stay clean). */
const stairs: KitFn = (c, ob) => {
  const K = c.K;
  for (const sl of ob.slabs) {
    if (sl.kind !== 'stairs') continue;
    const lo = Math.min(sl.y0, sl.y1) - 0.05;
    const col = c.area === 'neon' ? 0x7d749c : c.area === 'docks' ? 0x9c8f80 : 0xb3a194;
    K.lit(PAT.slabs).col(col);
    for (const x of [sl.x0, sl.x1]) {
      if (Math.abs(x) >= 4.49) continue;
      K.wedge(x - 0.06, x + 0.06, sl.s0, sl.s1, lo, sl.y0 + 0.08, sl.y1 + 0.08);
    }
    riserMoss(c, ob, sl);
  }
};
/** Moss on the camera-facing risers of an upward flight (treads clean, rule: "moss on the risers only"). */
export function riserMoss(c: KitCtx, ob: Obstacle, sl: GroundSlab): void {
  const n = sl.steps ?? 0;
  if (sl.kind !== 'stairs' || n < 2 || sl.y1 <= sl.y0 || !DRESSER.has(Dress.Moss)) return;
  const face = surfaceLook(sl.surface, c.lookAt((sl.s0 + sl.s1) / 2)).color, len = (sl.s1 - sl.s0) / n, w = sl.x1 - sl.x0;
  for (let i = 1; i < n; i++) {
    const a = sl.s0 + i * len;
    if (!inChunk(c, a)) continue;
    const yPrev = sl.y0 + (sl.y1 - sl.y0) * ((i - 1) / n), yStep = sl.y0 + (sl.y1 - sl.y0) * (i / n);
    const u = rnd(ob.id, i, 3), x0 = sl.x0 + w * u * 0.6, x1 = Math.min(sl.x1 - 0.05, x0 + w * (0.15 + 0.25 * rnd(ob.id, i, 4)));
    mossPatch(c, face, x0, yPrev, a - 0.006, x1, yPrev + (yStep - yPrev) * 0.6, a, FACE.front);
  }
}

/** Handrail: posts at both ends and every ~1.2 m along the slope, a metal rail under the waxed top strip (the edge is
 *  the grind line): Downtown brass turned green patina, rust-brown elsewhere, Neon lavender steel. */
const handrail: KitFn = (c, ob) => {
  const K = c.K;
  const metal = c.area === 'downtown' ? RECLAIM.patinaRail : c.area === 'neon' ? 0x8f9ad0 : 0x7a4a32;
  for (const e of ob.edges) {
    const len = e.b.s - e.a.s, n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) {
      const u = i / n, s = e.a.s + len * u;
      if (!inChunk(c, s)) continue;
      const x = e.a.x + (e.b.x - e.a.x) * u, y = e.a.y + (e.b.y - e.a.y) * u;
      body(c, i === 0 ? c.hz.body : 0x3a3052);
      K.box(x - 0.025, y - 0.62, s - 0.025, x + 0.025, y - 0.04, s + 0.025, FACE.sides5 & ~FACE.top);
    }
    K.lit(0, 0, FX.noFog).col(metal).beam(e.a.x, e.a.y, e.a.s, e.b.x, e.b.y, e.b.s, 0.026, -0.05, -0.012);
  }
};

/** Hubba: a sloped granite block following the stairs (landable top, waxed edges) with moss low on its side faces. */
const hubba: KitFn = (c, ob) => {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box;
    const col = c.area === 'neon' ? 0x8a809e : 0xb9a9a0;
    K.lit(PAT.pavers).col(col);
    const e = ob.edges[0];
    if (!e) { K.chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.03); continue; }
    const bot = Math.min(e.a.y, e.b.y) - 0.6;
    K.wedge(b.x0, b.x1, b.s0, b.s1, bot, e.a.y, e.b.y);
    const a = Math.max(b.s0, c.s0), z = Math.min(b.s1, c.s1);
    if (z - a < 0.8) continue;
    const ym = Math.min(e.a.y, e.b.y) - 0.18;
    mossPatch(c, col, b.x0 - 0.004, bot + 0.3, a + 0.2, b.x0, Math.max(bot + 0.32, ym), a + (z - a) * 0.45, FACE.left);
  }
};

/** Incline: the slope slab (dispatcher) plus a lighter crest line. */
const incline: KitFn = (c, ob) => {
  const K = c.K;
  for (const sl of ob.slabs) {
    if (sl.kind !== 'incline') continue;
    const crest = sl.y1 > sl.y0 ? sl.s1 : sl.s0, y = Math.max(sl.y0, sl.y1);
    if (!inChunk(c, crest)) continue;
    K.lit(0).col(shade(surfaceColor(c, sl.surface), 0.2)).box(sl.x0, y, crest - 0.08, sl.x1, y + 0.006, crest, FACE.top);
  }
};
const surfaceColor = (c: KitCtx, s: Obstacle['slabs'][number]['surface']) => (s === 'concrete' ? (c.area === 'neon' ? 0x8b82a3 : 0xd9c3ae) : 0xb9a9a0);

/** Terrace: a full-width stair set (slabs) with side cheeks, its rails / hubbas come as their own obstacles. */
const terrace: KitFn = (c, ob) => { stairs(c, ob); };

/** Column filler: a generic tall street blocker skinned per area (as the litter bin). */
const filler: KitFn = (c, ob) => {
  const b = ob.solids[0]?.box;
  if (!b) { solidsFallback(c, ob); return; }
  if (b.y1 - b.y0 >= 1.15) trashCan(c, ob); else solidsFallback(c, ob);
};

/** Accent of an area (DESIGN §18.1). */
export const accent = (area: AreaId, i: number) => ACCENTS[area][((i % ACCENTS[area].length) + ACCENTS[area].length) % ACCENTS[area].length]!;
export const randOf = (ob: Obstacle, k = 0) => rnd(ob.id, k, ob.variant);

export const SHARED_KITS: Readonly<Partial<Record<Obstacle['kind'], KitDef>>> = {
  curb: { draw: curb, long: true }, flatbar: { draw: flatbar, long: true }, bench: { draw: bench },
  van_across: { draw: vanAcrossKit },   // Phase B (theme T8): the vehicle builder turned across, every area
  manual_pad: { draw: manualPad, long: true }, trash_can: { draw: trashCan }, cone: { draw: cone },
  barrier_low: { draw: barrier }, trench: { draw: trench }, stairs: { draw: stairs, long: true },
  handrail: { draw: handrail, long: true }, hubba: { draw: hubba, long: true }, incline: { draw: incline, long: true },
  terrace: { draw: terrace, long: true }, filler: { draw: filler },
};
export { trashCan, setArea, isFull };
