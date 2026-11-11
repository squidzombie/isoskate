// world/gen/props/shared.ts: physical builders for the shared kinds (DESIGN §10.3 sizes): barrier_low (and its Neon
// skin, the holo gate), trench (pits at lip level + planks, per-area skins), the tall column fillers, flatbar, bench,
// cone, manual_pad, full-width stairs (terrace) with handrails and hubbas, side-set stairs, inclines, and dips.
// Area skins: `variant` = the area index (AREA_ORDER), so WA's kits pick the skin; geometry rules are shared.
import type { AreaId, PropKind } from '../../../core/ids';
import { AREA_ORDER } from '../../../core/ids';
import { newSkin, propSkin, type PropSkin } from '../../../core/skins';
import { round1cm } from '../../../core/math';
import { HAZARD_WARN_SEC, HEIGHT, STEP_UP } from '../../../core/tuning';
import type { GroundSlab, Obstacle } from '../../../core/world';
import { ObTag } from '../../../core/world';
import { BODY_TOPS, buildProp, buildTall, lowGround, steppedBody, type PropCtx } from './common';

export const skinOf = (a: AreaId): number => AREA_ORDER.indexOf(a);
export const STAIR = { rise: 0.17, tread: 0.30 } as const;
/** Drop of an n-step set (DESIGN §10.3: 3 / 5 / 7 / 10 steps → 0.51 / 0.85 / 1.19 / 1.70 m). */
export const stairDrop = (n: number): number => round1cm(n * STAIR.rise);

/** Full-width barrier_low (crash top, chevrons), optionally with a slot [slot.x ± slot.w/2] (DESIGN §10.3). The Neon
 *  skin is the holo gate (kind 'holo_gate', same geometry: a light bar over a solid chevroned base). */
export function buildBarrier(s: number, hgt: number, v: number, p: PropCtx, slot?: { x: number; w: number }): Obstacle {
  const len = 0.6;
  const kind: PropKind = p.area === 'neon' ? 'holo_gate' : 'barrier_low';
  const ob = buildProp({ kind, s, x: 0, len, wid: 9.0, hgt, tags: ObTag.FullWidth | ObTag.Required, variant: skinOf(p.area),
    warnAtS: s - HAZARD_WARN_SEC * v, params: slot ? { slotX: round1cm(slot.x), slotW: round1cm(slot.w) } : {} }, p);
  if (slot) {
    const bx = ob.solids[0]!.box;
    const l = { ...bx, x1: round1cm(slot.x - slot.w / 2) }, r = { ...bx, x0: round1cm(slot.x + slot.w / 2) };
    ob.solids = [l, r].filter((q) => q.x1 - q.x0 > 0.05).map((box) => ({ box, top: 'crash' as const, tall: false }));
  }
  return ob;
}

/** Full-width trench (pits at lip level) of length len with planks (DESIGN §10.3 skins): DT one 1.2 m plank, SB a
 *  1.4 m culvert slab, Docks two 0.9 m steel plates, Neon a 1.2 m grate. `planks` = plank centres (the safe one first).
 *  Each street band gets its own pit at its own lip; the caller cuts the base over [s, s + len). */
export function buildTrench(s: number, len: number, planks: readonly number[], v: number, p: PropCtx, depth = 0.6,
  bands: readonly { x0: number; x1: number; dy: number }[] = [{ x0: -4.5, x1: 4.5, dy: 0 }]): Obstacle {
  const plankW = p.area === 'suburbs' ? 1.4 : p.area === 'docks' ? 0.9 : 1.2;
  const params: Record<string, number> = { plankX: round1cm(planks[0]!), plankW, depth, planks: planks.length };
  if (planks[1] !== undefined) params.plank2X = round1cm(planks[1]);
  const ob = buildProp({ kind: 'trench', s, x: 0, len, wid: 9.0, hgt: 0, tags: ObTag.FullWidth | ObTag.Required,
    variant: skinOf(p.area), warnAtS: s - HAZARD_WARN_SEC * v, params, topSlab: false }, p);
  ob.solids.length = 0;
  const s0 = ob.s, s1 = round1cm(ob.s + ob.len);
  for (const bd of bands) ob.pits.push({ s0, s1, x0: bd.x0, x1: bd.x1, lipY: round1cm(p.datum + bd.dy), depth, cause: 'fall' });
  for (const px of planks) {
    ob.slabs.push({ s0, s1, x0: round1cm(px - plankW / 2), x1: round1cm(px + plankW / 2), y0: round1cm(p.datum), y1: round1cm(p.datum),
      layer: 0, surface: p.area === 'docks' || p.area === 'neon' ? 'metal' : 'wood', kind: 'flat' });
  }
  return ob;
}

/** The area's column filler kinds (DESIGN §10.5): [narrow, wide]. */
export function fillerKinds(a: AreaId): { kind: PropKind; len: number; wid: number; hgt: number }[] {
  switch (a) {
    case 'downtown': return [{ kind: 'news_box', len: 0.5, wid: 0.5, hgt: 1.15 }, { kind: 'trash_can', len: 0.6, wid: 0.6, hgt: 1.15 }];
    case 'suburbs': return [{ kind: 'mailbox', len: 0.4, wid: 0.4, hgt: 1.2 }, { kind: 'wheelie_bins', len: 0.7, wid: 1.5, hgt: 1.2 }];
    case 'docks': return [{ kind: 'pallet_tall', len: 1.2, wid: 1.0, hgt: 1.2 }, { kind: 'drum_cluster', len: 0.7, wid: 1.3, hgt: 1.15 }];
    case 'neon': return [{ kind: 'lantern_stand', len: 0.4, wid: 0.4, hgt: 1.6 }, { kind: 'vending_bank', len: 0.8, wid: 1.0, hgt: 1.8 }];
  }
}

/** A tall column filler or blocker of the area kit, centred at x, front at s (Filler tag). */
export function buildFiller(s: number, x: number, wide: boolean, p: PropCtx, variant = 0): Obstacle {
  const f = fillerKinds(p.area)[wide ? 1 : 0]!;
  const params: Record<string, number> | undefined = f.kind === 'vending_bank' ? { machines: 1 } : f.kind === 'drum_cluster' ? { drums: 2 } : undefined;
  return buildTall(f.kind, s, x, f.len, f.wid, f.hgt, p, { variant, tags: ObTag.Filler, params });
}

// ── Phase B (theme T8, THEME §3.4): cars as the main blocker ──────────────────────────────────────────────────────
/** van_across: a delivery van nosed into a side loading entrance, its tail out into the street (DESIGN §10.3). */
export const VAN_ACROSS = { len: 1.8, wid: 4.4, hgt: 1.4 } as const;
/** A van_across on side `sd`, its nose flush with the corridor edge (the loading entrance is just beyond it). The kit
 *  reads the side from the sign of x. */
export function buildVanAcross(s: number, sd: -1 | 1, p: PropCtx, variant = 0, tags = 0): Obstacle {
  return buildTall('van_across', s, round1cm(sd * (4.5 - VAN_ACROSS.wid / 2)), VAN_ACROSS.len, VAN_ACROSS.wid, VAN_ACROSS.hgt, p, { variant, tags });
}
/** Where a parked car stands beside the road, parallel to s (DESIGN §10.2), in the order a row tries them: Downtown
 *  and Neon (a taxi, THEME §3.4) in the curb lane beside the curb, else half up on the sidewalk at the corridor edge
 *  (the plaza's edge where there is no curb); the Suburbs on a driveway apron over the sidewalk and lawn (the curb is
 *  cut behind it). Centre |x| and size (the area's parked_car); empty where the street has neither (the Docks). */
export interface CurbSlot { x: number; len: number; wid: number; hgt: number; driveway: boolean }
export function curbSlots(a: AreaId): readonly CurbSlot[] {
  switch (a) {
    case 'downtown': case 'neon': return [{ x: 2.15, len: 4.4, wid: 1.8, hgt: 1.4, driveway: false }, { x: 3.6, len: 4.4, wid: 1.8, hgt: 1.4, driveway: false }];
    case 'suburbs': return [{ x: 3.5, len: 4.6, wid: 1.9, hgt: 1.5, driveway: true }];
    default: return [];
  }
}
/** A parked car in slot `slot` of curbSlots on side `sd` (null where the area has none). Rear to the camera. */
export function buildCurbCar(s: number, sd: -1 | 1, p: PropCtx, variant = 0, tags = 0, slot = 0): Obstacle | null {
  const c = curbSlots(p.area)[slot];
  if (!c) return null;
  const ob = buildTall('parked_car', s, round1cm(sd * c.x), c.len, c.wid, c.hgt, p, { variant, tags });
  ob.variant = skinVariant(ob, (k) => !k.nosedIn);
  return ob;
}
/** Bumper-to-bumper gap of a parked row whose next car stays out of the one before's 35° shadow (validator rule g:
 *  h·cot 35° + 0.5 m, h ≤ the 1.6 m x-ray cap): an empty bay between cars. */
export const rowGap = (h: number): number => Math.min(h, 1.6) / Math.tan((35 * Math.PI) / 180) + 0.5 + 0.1;
/** The driveway curb cuts [s0, s1, side] under the Suburbs' driveway cars among `obs` (a row's or a template's). */
export function carDriveways(obs: readonly Obstacle[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const o of obs) if (o.kind === 'parked_car' && o.area === 'suburbs' && Math.abs(Math.abs(o.x) - 3.5) < 0.01) out.push([round1cm(o.s - 0.4), round1cm(o.s + o.len + 0.4), Math.sign(o.x)]);
  return out;
}
/** The first variant ≥ the obstacle's own (up to 16 on) whose skin (core/skins propSkin) passes `ok`: a row of
 *  parked cars that all face the same way, the Docks' trucks. The variant only picks the skin (WA kits use it modulo
 *  their own counts), so this never changes a footprint. */
export function skinVariant(ob: Obstacle, ok: (s: PropSkin) => boolean): number {
  for (let v = ob.variant; v < ob.variant + 16; v++) if (ok(propSkin(ob.kind, ob.area, ob.id, v, ob.hgt, SKIN))) return v;
  return ob.variant;
}
const SKIN = newSkin();

/** A tall column blocker (trash can 0.6 × 0.6, news box 0.5 × 0.5) standing on the street or the sidewalk. */
export function buildBlocker(kind: 'trash_can' | 'news_box', s: number, x: number, p: PropCtx, variant = 0): Obstacle {
  const w = kind === 'trash_can' ? 0.6 : 0.5;
  return buildTall(kind, s, x, w, w, HEIGHT.tallMin, p, { variant });
}

/** Flat bar: a 0.05 m rail on posts (crash top) with one centre grind edge (DESIGN §10.3). */
export function buildFlatbar(s: number, x: number, len: number, hgt: number, p: PropCtx, tags: number = ObTag.TrickLine): Obstacle {
  return buildProp({ kind: 'flatbar', s, x, len, wid: 0.05, hgt, ground: lowGround(x, 0.05, p), tags,
    edges: [{ side: 0, kind: 'rail', material: 'metal' }] }, p);
}

/** Bench 2.0 × 0.5 × 0.45, long axis along s: landable top, grindable long edges, crash front (DESIGN §10.3). */
export function buildBench(s: number, x: number, p: PropCtx, tags: number = ObTag.TrickLine): Obstacle {
  return buildProp({ kind: 'bench', s, x, len: 2.0, wid: 0.5, hgt: 0.45, ground: lowGround(x, 0.5, p), tags,
    surface: 'wood', variant: skinOf(p.area),
    edges: [{ side: -1, kind: 'bench', material: p.area === 'docks' ? 'wood' : 'stone' }, { side: 1, kind: 'bench', material: p.area === 'docks' ? 'wood' : 'stone' }] }, p);
}

export function buildCone(s: number, x: number, p: PropCtx): Obstacle {
  return buildProp({ kind: p.area === 'neon' ? 'a_frame_sign' : 'cone', s, x, len: 0.3, wid: p.area === 'neon' ? 0.4 : 0.3,
    hgt: p.area === 'neon' ? 0.55 : 0.5, ground: lowGround(x, 0.3, p), tags: ObTag.Knockable | ObTag.TrickLine }, p);
}

/** Manual pad 3–6 × 1.2 × 0.15: a bump-class top (manual), its long edges curb-class (pick only). */
export function buildPad(s: number, x: number, len: number, p: PropCtx): Obstacle {
  return buildProp({ kind: 'manual_pad', s, x, len: Math.min(6, Math.max(3, len)), wid: 1.2, hgt: 0.15, ground: lowGround(x, 1.2, p),
    tags: ObTag.TrickLine, surface: 'concrete', edges: [{ side: -1, kind: 'curb', material: 'concrete' }, { side: 1, kind: 'curb', material: 'concrete' }] }, p);
}

/** Full-width stairs (a terrace drop, DESIGN §10.3): a sticky stairs slab from the datum down `n` steps. The caller
 *  cuts the street base over it and lowers the datum after it. Returns the terrace obstacle; rails / hubbas are added
 *  with addHandrail / addHubba. */
export function buildTerrace(s: number, n: number, p: PropCtx, landmark?: string): Obstacle {
  const drop = stairDrop(n), len = round1cm(n * STAIR.tread);
  const ob = buildProp({ kind: 'terrace', s, x: 0, len, wid: 9.0, hgt: 0, topSlab: false, landmark, variant: skinOf(p.area),
    params: { steps: n, drop } }, p);
  ob.solids.length = 0;
  ob.slabs.push({ s0: ob.s, s1: round1cm(ob.s + len), x0: -4.5, x1: 4.5, y0: round1cm(p.datum), y1: round1cm(p.datum - drop),
    layer: 0, surface: p.area === 'downtown' ? 'granite' : 'concrete', kind: 'stairs', steps: n });
  return ob;
}

/** A handrail down a stair slab (DESIGN §10.3): 0.60 above the nosing line, a 0.5 m flat kink at the top, 0.05 wide;
 *  crash posts and rail (stepped), two grind edges (kink + slope). `y0` = top datum, `drop` = stairs drop. */
export function buildHandrail(sTop: number, len: number, x: number, y0: number, drop: number, p: PropCtx, tags: number = ObTag.TrickLine): Obstacle {
  const kink = 0.5, h = 0.6, w = 0.05;
  const ob = buildProp({ kind: 'handrail', s: sTop - kink, x, len: kink + len, wid: w, hgt: h, ground: y0, tags,
    edges: [], topSlab: false }, p);
  const xa = round1cm(x - w / 2), xb = round1cm(x + w / 2);
  ob.solids = [{ box: { s0: round1cm(sTop - kink), s1: round1cm(sTop), x0: xa, x1: xb, y0: round1cm(y0), y1: round1cm(y0 + h) }, top: 'crash', tall: false }];
  const yAt = (s: number) => y0 + h - (drop * (s - sTop)) / len;
  const base = (s: number) => y0 - (drop * (s - sTop)) / len;
  steppedBody(ob, sTop, sTop + len, xa, xb, yAt, base, 'crash', Math.max(2, Math.round(len / 0.6)));
  const e = (a: number, b: number, ya: number, yb: number) => ({ id: ++p.ids.edge, obstacleId: ob.id,
    a: { s: round1cm(a), x: round1cm(x), y: round1cm(ya) }, b: { s: round1cm(b), x: round1cm(x), y: round1cm(yb) },
    kind: 'rail' as const, material: 'metal' as const, layer: 0 as const, pickOnly: false });
  ob.edges.push(e(sTop - kink, sTop, y0 + h, y0 + h), e(sTop, sTop + len, y0 + h, y0 + h - drop));
  ob.tags |= ObTag.Grindable;
  ob.params = { drop: round1cm(drop), kink };
  return ob;
}

/** A hubba down a stair slab: 0.45 above the nosing, 0.6 wide; landable sloped top (rideable), both long edges. */
export function buildHubba(sTop: number, len: number, x: number, y0: number, drop: number, p: PropCtx, tags: number = ObTag.TrickLine): Obstacle {
  const h = 0.45, w = 0.6;
  const ob = buildProp({ kind: 'hubba', s: sTop, x, len, wid: w, hgt: h, ground: y0, tags, topSlab: false, edges: [] }, p);
  const xa = round1cm(x - w / 2), xb = round1cm(x + w / 2);
  ob.solids.length = 0;
  const yAt = (s: number) => y0 + h - (drop * (s - sTop)) / len;
  const base = (s: number) => y0 - (drop * (s - sTop)) / len;
  // The top end is a full-height landable face (frontal slam above 0.18); then the stepped body.
  steppedBody(ob, sTop, sTop + len, xa, xb, yAt, base, 'landable', Math.max(3, Math.round(len / 0.45)));
  const top: GroundSlab = { s0: ob.s, s1: round1cm(sTop + len), x0: xa, x1: xb, y0: round1cm(y0 + h), y1: round1cm(y0 + h - drop),
    layer: 0, surface: 'granite', kind: 'incline' };
  ob.slabs.push(top);
  BODY_TOPS.add(top);
  for (const ex of [xa, xb]) ob.edges.push({ id: ++p.ids.edge, obstacleId: ob.id, a: { s: ob.s, x: ex, y: round1cm(y0 + h) },
    b: { s: round1cm(sTop + len), x: ex, y: round1cm(y0 + h - drop) }, kind: 'hubba', material: 'stone', layer: 0, pickOnly: false });
  ob.tags |= ObTag.Grindable;
  ob.params = { drop: round1cm(drop) };
  return ob;
}

/** Full-width incline (slope ≤ 1:10, DESIGN §10.10): from the datum up `rise` over `len` (sticky, no launch). */
export function buildIncline(s: number, len: number, rise: number, p: PropCtx, x0 = -4.5, x1 = 4.5): Obstacle {
  const ob = buildProp({ kind: 'incline', s, x: (x0 + x1) / 2, len, wid: x1 - x0, hgt: 0, topSlab: false, variant: skinOf(p.area),
    params: { rise: round1cm(rise) } }, p);
  ob.solids.length = 0;
  ob.slabs.push({ s0: ob.s, s1: round1cm(ob.s + len), x0, x1, y0: round1cm(p.datum), y1: round1cm(p.datum + rise), layer: 0,
    surface: p.area === 'neon' ? 'wetAsphalt' : p.area === 'docks' ? 'concrete' : 'asphalt', kind: 'incline' });
  return ob;
}

/** A dip (SB_HILL, DESIGN §10.4): down `depth` and back up, slopes 1:15, full width. Net datum change 0. */
export function buildDip(s: number, len: number, depth: number, p: PropCtx): Obstacle {
  const ob = buildProp({ kind: 'incline', s, x: 0, len, wid: 9.0, hgt: 0, topSlab: false, variant: skinOf(p.area), params: { dip: round1cm(depth) } }, p);
  ob.solids.length = 0;
  const half = round1cm(len / 2), d = round1cm(p.datum);
  const surface = p.area === 'suburbs' ? 'asphalt' : 'concrete';
  ob.slabs.push({ s0: ob.s, s1: round1cm(ob.s + half), x0: -4.5, x1: 4.5, y0: d, y1: round1cm(d - depth), layer: 0, surface, kind: 'incline' },
    { s0: round1cm(ob.s + half), s1: round1cm(ob.s + len), x0: -4.5, x1: 4.5, y0: round1cm(d - depth), y1: d, layer: 0, surface, kind: 'incline' });
  return ob;
}

/** Side-set stairs (DESIGN §10.3, §10.10): a 3-stair set off a raised 0.51 m platform on one side (a Low face, T),
 *  stairs down to the street. Platform [sA, sA + platLen), stairs after it; x0…x1 its lateral span. Landable body. */
export function buildSideSet(sA: number, platLen: number, x0: number, x1: number, p: PropCtx): Obstacle {
  const n = 3, drop = stairDrop(n), stairLen = round1cm(n * STAIR.tread);
  const g = lowGround((x0 + x1) / 2, x1 - x0, p);
  const ob = buildProp({ kind: 'stairs', s: sA, x: (x0 + x1) / 2, len: platLen + stairLen, wid: x1 - x0, hgt: drop, ground: g,
    top: 'landable', topSlab: false, tags: ObTag.TrickLine | ObTag.Elevated, params: { steps: n, side: 1, platLen: round1cm(platLen) } }, p);
  ob.solids = [{ box: { s0: ob.s, s1: round1cm(sA + platLen), x0: round1cm(x0), x1: round1cm(x1), y0: g, y1: round1cm(g + drop) }, top: 'landable', tall: false }];
  const yAt = (s: number) => g + drop - (drop * (s - sA - platLen)) / stairLen;
  steppedBody(ob, sA + platLen, sA + platLen + stairLen, x0, x1, yAt, () => g, 'landable', n);
  const plat: GroundSlab = { s0: ob.s, s1: round1cm(sA + platLen), x0: round1cm(x0), x1: round1cm(x1), y0: round1cm(g + drop), y1: round1cm(g + drop),
    layer: 1, surface: 'granite', kind: 'flat' };
  const stairs: GroundSlab = { s0: round1cm(sA + platLen), s1: round1cm(sA + platLen + stairLen), x0: round1cm(x0), x1: round1cm(x1),
    y0: round1cm(g + drop), y1: round1cm(g), layer: 1, surface: 'granite', kind: 'stairs', steps: n };
  ob.slabs.push(plat, stairs);
  BODY_TOPS.add(plat); BODY_TOPS.add(stairs);
  if (drop <= STEP_UP) ob.solids.length = 0;
  return ob;
}
