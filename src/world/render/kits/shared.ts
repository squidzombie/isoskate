// world/render/kits/shared.ts: the street base and the shared PropKinds (DESIGN §10.3 "Shared"), each re-skinned per
// area (DESIGN §18.6). Hazards follow DESIGN §18.4: ink bodies with one saturated accent (Neon: the inverted #7A6FB0
// body with an emissive rim), chevrons on every full-width hazard, noFog and matte flags on hazard bodies, contact
// shadows under every obstacle. Long kinds are drawn per chunk (clipped); compact kinds once, in their anchor chunk.
import type { AreaId } from '../../../core/ids';
import type { Chunk, GroundSlab, Obstacle, Pit } from '../../../core/world';
import { ACCENTS, COLORS, LOOK, mixHex, shade } from '../palette';
import { PAT } from '../textures/ground';
import { FACE, FX } from '../writer';
import { WARN, chevrons, contact, groundChevrons, groundOf, isFull, rnd, setArea, solidsFallback, type KitCtx } from './common';

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
  downtown: { color: 0xcdb8a3, pat: PAT.slabs }, suburbs: { color: 0x9db36b, pat: PAT.grass },
  docks: { color: 0xc9b9a6, pat: PAT.apron }, neon: { color: 0x48426a, pat: PAT.tile },
};
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

// ── shared kinds ────────────────────────────────────────────────────────────────────────────────────────────────
/** Curb: a curb-stone band along the road edge of each sidewalk slab (the slab and the pick-only edge are drawn by
 *  the dispatcher). */
const curb: KitFn = (c, ob) => {
  const K = c.K;
  // world/gen's street base: only the sidewalk bands (params.band 1) carry a curb stone.
  if (ob.params?.band !== undefined && ob.params.band !== 1) return;
  for (const sl of ob.slabs) {
    const roadSide = Math.abs(sl.x0) < Math.abs(sl.x1) ? sl.x0 : sl.x1, dir = Math.sign(sl.x0 + sl.x1) || 1;
    const area = c.areaAt(sl.s0);
    // A mid-tone stone band, clearly darker than the cream lip at its road edge, so the lip reads as its own stripe
    // (the band never merges with it into one wide light surface, DESIGN §18.4).
    const col = area === 'neon' ? 0x7d759c : area === 'suburbs' ? 0xbdb2a6 : 0xbfae9e;
    const x0 = Math.min(roadSide, roadSide + dir * 0.26), x1 = Math.max(roadSide, roadSide + dir * 0.26);
    K.lit(0).col(col).box(x0, sl.y0 - 0.05, sl.s0, x1, sl.y0 + 0.008, sl.s1, FACE.top);
  }
};

/** Flat bar: square posts every ~2.2 m (crash faces below the rail top), a round steel rail, base plates. */
const flatbar: KitFn = (c, ob) => {
  const K = c.K, b = ob.solids[0]?.box;
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, top = b.y1, g = b.y0, len = b.s1 - b.s0;
  const n = Math.max(1, Math.round(len / 2.2));
  const steel = c.area === 'neon' ? 0x8f9ad0 : c.area === 'docks' ? 0x8a8fa0 : 0x9ba3b5;
  for (let i = 0; i <= n; i++) {
    const s = b.s0 + 0.08 + (len - 0.16) * (i / n);
    if (!inChunk(c, s)) continue;
    body(c, c.hz.inverted ? c.hz.body : 0x3a3052);
    K.box(x - 0.03, g, s - 0.03, x + 0.03, top - 0.04, s + 0.03, FACE.sides5 & ~FACE.top);
    K.lit(0).col(0x4a3b6b).box(x - 0.08, g, s - 0.06, x + 0.08, g + 0.02, s + 0.06, FACE.top | FACE.front);
  }
  K.lit(0, 0, FX.noFog).col(steel);
  K.box(x - 0.028, top - 0.055, b.s0, x + 0.028, top - 0.012, b.s1, FACE.front | FACE.back | FACE.left | FACE.right);
};

/** Bench 2.0 × 0.5 × 0.45 (DESIGN §10.3): granite block (DT), park bench with slats (SB), pallet bench (IN), stone
 *  base with wood slats (NE). Landable top: light; legs and the shadowed underside dark. */
const bench: KitFn = (c, ob) => {
  const K = c.K, b = ob.solids[0]?.box;
  if (!b) return;
  const { x0, x1, s0, s1, y0, y1 } = b;
  contact(c, x0, x1, s0, s1, y0 + 0.01, 0.5, 0.2);
  if (c.area === 'downtown' || c.area === 'neon') {
    const stone = c.area === 'neon' ? 0x8a809e : 0x9c8d86, top = c.area === 'neon' ? 0xa9744f : 0xb9a9a0;
    K.lit(PAT.pavers).col(shade(stone, -0.25));
    for (const s of [s0 + 0.12, s1 - 0.42]) K.chamfer(x0 + 0.04, y0, s, x1 - 0.04, y1 - 0.1, s + 0.3, 0.02);
    K.lit(c.area === 'neon' ? PAT.planks : PAT.pavers).col(top).chamfer(x0, y1 - 0.1, s0, x1, y1, s1, 0.025);
    if (c.area === 'neon') rim(c, x0, x1, y1 - 0.1, s0);
  } else if (c.area === 'suburbs') {
    K.lit(0).col(0x2b2140);
    for (const s of [s0 + 0.15, s1 - 0.2]) { K.box(x0 + 0.03, y0, s, x0 + 0.08, y1 - 0.05, s + 0.05); K.box(x1 - 0.08, y0, s, x1 - 0.03, y1 - 0.05, s + 0.05); K.box(x0 + 0.03, y1 - 0.12, s, x1 - 0.03, y1 - 0.06, s + 0.05); }
    K.lit(PAT.planks).col(0xa9744f);
    const n = 3, w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) K.chamfer(x0 + i * w + 0.015, y1 - 0.06, s0, x0 + (i + 1) * w - 0.015, y1, s1, 0.01);
  } else {
    // Pallet bench: two pallets (deck boards over three blocks).
    const wood = 0xb08458;
    for (let k = 0; k < 2; k++) {
      const ya = y0 + k * ((y1 - y0) / 2), yb = ya + (y1 - y0) / 2;
      K.lit(0).col(shade(wood, -0.35));
      for (const xx of [x0 + 0.02, (x0 + x1) / 2 - 0.05, x1 - 0.12]) K.box(xx, ya, s0 + 0.05, xx + 0.1, yb - 0.04, s1 - 0.05);
      K.lit(PAT.planks).col(shade(wood, k ? 0 : -0.1)).box(x0, yb - 0.04, s0, x1, yb, s1);
    }
  }
};

/** Manual pad: a low concrete pad with a chamfered top (curb-class edges drawn by the dispatcher). */
const manualPad: KitFn = (c, ob) => {
  const K = c.K, b = ob.solids[0]?.box ?? (ob.slabs[0] ? { x0: ob.slabs[0].x0, x1: ob.slabs[0].x1, s0: ob.slabs[0].s0, s1: ob.slabs[0].s1, y0: groundOf(ob) - 0.15, y1: ob.slabs[0].y0 } : null);
  if (!b) return;
  const col = c.area === 'neon' ? 0x9a91b8 : c.area === 'docks' ? 0xc2b4a2 : 0xd9c3ae;
  K.lit(PAT.slabs).col(col).chamfer(b.x0, Math.min(b.y0, 0), b.s0, b.x1, b.y1, b.s1, 0.03);
};

/** Trash can 0.6 × 0.6 × 1.15 (tall). A 10-sided bin: ink body, lighter domed lid, one accent band, a dark slot on
 *  the camera face. Docks: a ribbed drum; Neon: the inverted body with a magenta rim. */
const trashCan: KitFn = (c, ob) => {
  const K = c.K, b = ob.solids[0]?.box;
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2, r = (b.x1 - b.x0) / 2 - 0.01, g = b.y0, top = b.y1;
  contact(c, b.x0, b.x1, b.s0, b.s1, g + 0.01, 0.62, 0.25);
  K.capY = g + 1.6;
  body(c); K.cyl(x, s, g, top - 0.12, r, 10, false);
  if (c.area === 'docks') {
    K.lit(0, 0, HZ).col(c.hz.accent2);
    for (const y of [g + 0.35, g + 0.72]) K.cyl(x, s, y, y + 0.02, r + 0.012, 10, false);
  } else {
    K.lit(0, 0, HZ, c.hz.glow).col(c.hz.accent).cyl(x, s, top - 0.33, top - 0.29, r + 0.008, 10, false);
  }
  // Lid: a short collar and a dome, a step lighter so the top reads as a volume, with a thin light rim on the collar.
  body(c); K.cyl(x, s, top - 0.12, top - 0.06, r + 0.02, 10, false);
  body(c, c.hz.top); K.frustum(x, s, top - 0.06, top, r + 0.02, r * 0.55, 10, true);
  if (!c.hz.inverted) K.lit(0, 0, HZ).col(0x6a5a86).cyl(x, s, top - 0.065, top - 0.055, r + 0.024, 10, false);
  // Slot on the camera-facing side.
  K.lit(0, 0, HZ).col(c.hz.inverted ? 0x2b2140 : 0x120c1e).box(x - r * 0.5, top - 0.24, b.s0 - 0.005, x + r * 0.5, top - 0.16, b.s0 + 0.04, FACE.front);
  rim(c, x - r, x + r, top - 0.06, b.s0 + 0.02);
};

/** Cone (knock): a traffic cone with a white band on a square base. */
const cone: KitFn = (c, ob) => {
  const K = c.K, b = ob.solids[0]?.box;
  if (!b) return;
  const x = (b.x0 + b.x1) / 2, s = (b.s0 + b.s1) / 2, r = (b.x1 - b.x0) / 2, g = b.y0, h = b.y1 - g;
  contact(c, b.x0, b.x1, b.s0, b.s1, g + 0.01, 0.4);
  K.lit(0).col(0x2b2140).box(x - r, g, s - r, x + r, g + 0.04, s + r);
  K.lit(0).col(COLORS.knock).frustum(x, s, g + 0.04, g + h * 0.45, r * 0.8, r * 0.5, 8, false);
  K.col(0xfff4e3).frustum(x, s, g + h * 0.45, g + h * 0.62, r * 0.5, r * 0.4, 8, false);
  K.col(COLORS.knock).frustum(x, s, g + h * 0.62, g + h, r * 0.4, 0.02, 8, true);
};

/** Full-width barrier_low (DESIGN §10.3). Downtown: a parking chain (≤ 0.47 m: chunky bollards with amber sleeves
 *  and a heavy chain) or a construction barrier (boards with chevrons); Suburbs: a trimmed low hedge with chevron
 *  boards on stakes; Docks: a pipe run on chevroned blocks; Neon: the holo gate (a solid chevroned base under a light
 *  bar). Every variant stands in its contact shadow behind a chevron warning band on the ground (the "ollie this"
 *  read from far away; it lies outside the gate's ring around the hazard). An optional slot splits the solids:
 *  nothing is drawn there. */
const barrier: KitFn = (c, ob) => {
  const area = c.area;
  for (const so of ob.solids) {
    const b = so.box;
    if (area !== 'neon') groundChevrons(c, b.x0, b.x1, b.s0 - BARRIER_BAND.near - BARRIER_BAND.depth, b.s0 - BARRIER_BAND.near);
    if (area === 'neon') holoGate(c, b);
    else if (area === 'suburbs') hedgeBarrier(c, b);
    else if (area === 'docks') pipeRun(c, b);
    else if (b.y1 - b.y0 < 0.48) parkingChain(c, b);
    else constructionBarrier(c, b);
  }
};
/** The ground warning band in front of a full-width barrier: its depth and its gap to the barrier front (m). */
export const BARRIER_BAND = { depth: 0.45, near: 0.6 } as const;
type Box = Obstacle['solids'][number]['box'];

function parkingChain(c: KitCtx, b: Box): void {
  const K = c.K, g = b.y0, top = b.y1, sm = (b.s0 + b.s1) / 2;
  const span = b.x1 - b.x0, n = Math.max(1, Math.round(span / 1.5)), r = 0.12;
  const posts: number[] = [];
  for (let i = 0; i <= n; i++) posts.push(b.x0 + r + 0.01 + (span - 2 * r - 0.02) * (i / n));
  for (const px of posts) {
    contact(c, px - r, px + r, sm - r, sm + r, g + 0.01, 0.5, 0.1);
    body(c); K.chamfer(px - r, g, sm - r, px + r, top + 0.02, sm + r, 0.035, c.hz.top);
    // Amber reflective sleeve round the bollard (front and sides), flashing with the warning.
    K.lit(0, 0, HZ | WARN).col(COLORS.chevron).box(px - r - 0.004, top - 0.13, sm - r - 0.004, px + r + 0.004, top - 0.085, sm + r + 0.004, FACE.front | FACE.left | FACE.right);
  }
  // A heavy dark chain sagging between the bollards (every 4th link amber), under a thin contact line.
  for (let i = 0; i + 1 < posts.length; i++) {
    const xa = posts[i]! + r, xb = posts[i + 1]! - r, links = Math.max(4, Math.round((xb - xa) / 0.12));
    contact(c, xa, xb, sm - 0.06, sm + 0.06, g + 0.01, 0.3, 0);
    for (let k = 0; k < links; k++) {
      const u0 = k / links, u1 = (k + 1) / links;
      const sag = (u: number) => top - 0.06 - 0.14 * Math.sin(Math.PI * u);
      if (k % 5 === 2) K.lit(0, 0, HZ | WARN).col(COLORS.chevron); else body(c, 0x1a1428);
      K.bar(xa + (xb - xa) * u0, sag(u0), sm, xa + (xb - xa) * u1, sag(u1), sm, 0.035);
    }
  }
}

function constructionBarrier(c: KitCtx, b: Box): void {
  const K = c.K, g = b.y0, top = b.y1, span = b.x1 - b.x0;
  // A-frame legs and two boards across the full width; the upper board carries the chevrons.
  const n = Math.max(1, Math.round(span / 2.2));
  body(c);
  for (let i = 0; i <= n; i++) {
    const x = b.x0 + 0.06 + (span - 0.12) * (i / n);
    K.box(x - 0.05, g, b.s0 + 0.05, x + 0.05, top, b.s1 - 0.05);
  }
  K.chamfer(b.x0, top - 0.2, b.s0 + 0.18, b.x1, top, b.s0 + 0.3, 0.02, c.hz.top);
  K.box(b.x0, g + 0.08, b.s0 + 0.18, b.x1, g + 0.22, b.s0 + 0.3);
  chevrons(c, b.x0, b.x1, top - 0.17, top - 0.04, b.s0 + 0.18, 0.62, 0.32);
  // Two small blinker lamps (emissive amber) on the top board.
  K.to('e').glowing(1.4, -1, FX.noFog, 2).col(0xffc94a);
  for (const x of [b.x0 + span * 0.25, b.x0 + span * 0.75]) K.cyl(x, b.s0 + 0.24, top, top + 0.06, 0.04, 6, true);
  K.to('o');
}

function hedgeBarrier(c: KitCtx, b: Box): void {
  const K = c.K, g = b.y0, top = b.y1, span = b.x1 - b.x0;
  const leaf = 0x1c2e24, leafTop = 0x2c4434;
  K.lit(PAT.grass, 0, HZ).col(leaf);
  K.chamfer(b.x0, g, b.s0 + 0.04, b.x1, top - 0.05, b.s1 - 0.04, 0.08, leafTop);
  // Lumpy clipped top.
  for (let x = b.x0 + 0.3; x < b.x1 - 0.2; x += 0.55) K.lit(PAT.grass, 0, HZ).col(leafTop).sphere(x, top - 0.08, (b.s0 + b.s1) / 2, 0.2, 5, 3, 0.55, 0.22);
  // Chevron boards on stakes in front of the hedge.
  const n = Math.max(1, Math.round(span / 3));
  for (let i = 0; i < n; i++) {
    const x = b.x0 + span * ((i + 0.5) / n);
    body(c); K.box(x - 0.02, g, b.s0 - 0.04, x + 0.02, top - 0.12, b.s0);
    body(c); K.box(x - 0.3, top - 0.28, b.s0 - 0.06, x + 0.3, top - 0.1, b.s0 - 0.03, FACE.sides5);
    chevrons(c, x - 0.3, x + 0.3, top - 0.27, top - 0.11, b.s0 - 0.06, 0.2, 0.42);
  }
}

function pipeRun(c: KitCtx, b: Box): void {
  const K = c.K, g = b.y0, top = b.y1, sm = (b.s0 + b.s1) / 2, span = b.x1 - b.x0;
  // Concrete blocks (ink-dark, chevroned fronts) carrying two rusty pipes along x.
  const n = Math.max(1, Math.round(span / 1.8));
  for (let i = 0; i <= n; i++) {
    const x = b.x0 + 0.2 + (span - 0.4) * (i / n);
    body(c); K.chamfer(x - 0.2, g, b.s0 + 0.02, x + 0.2, top - 0.22, b.s1 - 0.02, 0.03, c.hz.top);
    chevrons(c, x - 0.2, x + 0.2, g + 0.04, top - 0.25, b.s0 + 0.02, 0.2, 0.42);
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
  // Posts and the light bar (emissive cyan-white, pulses with the warning).
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

/** Trench (full width): the pits and the plank slab are drawn by the dispatcher; here the per-area plank dressing:
 *  DT a nailed wooden plank, SB a concrete culvert slab, Docks two steel plates, Neon a grate plank. */
const trench: KitFn = (c, ob) => {
  const K = c.K;
  for (const sl of ob.slabs) {
    if (!ob.pits.some((p) => sl.s0 < p.s1 && sl.s1 > p.s0)) continue;
    const y = Math.max(sl.y0, sl.y1) + 0.004;
    if (c.area === 'downtown') {
      K.lit(PAT.planks).col(0xb08458).box(sl.x0, y - 0.05, sl.s0 - 0.12, sl.x1, y + 0.03, sl.s1 + 0.12);
      K.lit(0).col(0x5a4636);
      for (const s of [sl.s0 + 0.05, sl.s1 - 0.1]) K.box(sl.x0 + 0.05, y + 0.03, s, sl.x1 - 0.05, y + 0.04, s + 0.05, FACE.top);
    } else if (c.area === 'suburbs') {
      K.lit(PAT.slabs).col(0xc8bcae).chamfer(sl.x0 - 0.1, y - 0.12, sl.s0 - 0.15, sl.x1 + 0.1, y + 0.03, sl.s1 + 0.15, 0.03);
    } else if (c.area === 'docks') {
      const mid = (sl.x0 + sl.x1) / 2;
      K.lit(PAT.plate).col(0x9ba3b5);
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
};

/** Stairs: the steps are slabs (dispatcher); side cheek walls on the open ends of each flight. */
const stairs: KitFn = (c, ob) => {
  const K = c.K;
  for (const sl of ob.slabs) {
    if (sl.kind !== 'stairs') continue;
    const hi = Math.max(sl.y0, sl.y1), lo = Math.min(sl.y0, sl.y1) - 0.05;
    const col = c.area === 'neon' ? 0x7d749c : c.area === 'docks' ? 0x9c8f80 : 0xb3a194;
    K.lit(PAT.slabs).col(col);
    for (const x of [sl.x0, sl.x1]) {
      if (Math.abs(x) >= 4.49) continue;
      K.wedge(x - 0.06, x + 0.06, sl.s0, sl.s1, lo, sl.y0 + 0.08, sl.y1 + 0.08);
    }
    void hi;
  }
};

/** Handrail: posts at both ends and every ~1.2 m along the slope, a round metal rail (the edge is the grind line). */
const handrail: KitFn = (c, ob) => {
  const K = c.K;
  const brass = c.area === 'downtown' ? 0xc9a15a : c.area === 'neon' ? 0x8f9ad0 : 0x9ba3b5;
  for (const e of ob.edges) {
    const len = e.b.s - e.a.s, n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) {
      const u = i / n, s = e.a.s + len * u;
      if (!inChunk(c, s)) continue;
      const x = e.a.x + (e.b.x - e.a.x) * u, y = e.a.y + (e.b.y - e.a.y) * u;
      body(c, i === 0 ? c.hz.body : 0x3a3052);
      K.box(x - 0.025, y - 0.62, s - 0.025, x + 0.025, y - 0.04, s + 0.025, FACE.sides5 & ~FACE.top);
    }
    K.lit(0, 0, FX.noFog).col(brass).beam(e.a.x, e.a.y, e.a.s, e.b.x, e.b.y, e.b.s, 0.026, -0.05, -0.012);
  }
};

/** Hubba: a sloped granite block following the stairs (its top is a landable slab; edges grindable). */
const hubba: KitFn = (c, ob) => {
  const K = c.K;
  for (const so of ob.solids) {
    const b = so.box;
    const col = c.area === 'neon' ? 0x8a809e : 0xb9a9a0;
    K.lit(PAT.pavers).col(col);
    const e = ob.edges[0];
    if (e) K.wedge(b.x0, b.x1, b.s0, b.s1, Math.min(e.a.y, e.b.y) - 0.6, e.a.y, e.b.y);
    else K.chamfer(b.x0, b.y0, b.s0, b.x1, b.y1, b.s1, 0.03);
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

/** Column filler: a generic tall street blocker skinned per area (news-box size). */
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
  manual_pad: { draw: manualPad, long: true }, trash_can: { draw: trashCan }, cone: { draw: cone },
  barrier_low: { draw: barrier }, trench: { draw: trench }, stairs: { draw: stairs, long: true },
  handrail: { draw: handrail, long: true }, hubba: { draw: hubba, long: true }, incline: { draw: incline, long: true },
  terrace: { draw: terrace, long: true }, filler: { draw: filler },
};
export { trashCan, setArea, isFull };
