// world/gen/decor.ts: decor emission (DESIGN §18.4–18.7, §12.2). The vocabulary is core/decor.ts (DECOR_KINDS): this
// module uses it and never redefines it (SCHEDULE.md); WA renders every kind. Each area reads distinct and the
// portrait view gets camera-facing identity elements (DESIGN §18.4): blade signs and banners perpendicular to the
// facades, awnings over the sidewalk band, lantern strings and wires across the street, vending machines and food
// carts facing the camera, cross-street end walls every 8–12 s, rich ground decals, and a 1–2 m dressing band just
// outside the corridor. Placement keeps the zone limits (side |x| − half width ≥ 4.6, signs ≥ 4.9, backdrop ≥ 5.0,
// overhead lowest point ≥ 3.2 m, maglev at 7 m). Decor never collides, never uses chevrons or the cream edge.
// The decor stream is separate from the layout stream (TECH §5.4): changing decor never changes layout.
import type { AreaId, GatewayId } from '../../core/ids';
import { round1cm } from '../../core/math';
import type { Sfc32 } from '../../core/rng';
import { speedAt, tAt } from '../../core/tuning';
import type { Decor } from '../../core/world';
import { DECOR_BRANDS, DECOR_KINDS, DECOR_LIMITS, NEON_SIGN_WORDS, type DecorKind } from '../../core/decor';
import { GEN } from './gen.config';

export { DECOR_KINDS, DECOR_LIMITS, isDecorKind, type DecorKind } from '../../core/decor';

/** Seconds between cross-street end walls (DESIGN §18.4: every 8–12 s). */
export const END_WALL_SEC = [8, 12] as const;

export interface DecorEnv {
  area: AreaId; gateway: GatewayId | null; s0: number; s1: number; datum: number;
  /** The Docks lip side has water beyond; Suburbs driveways get driveway decals. */
  driveways?: readonly (readonly [number, number, number])[];
  /** Next end-wall s (carried by the cursor, updated in place). */
  nextEndWall: number;
  /** Next backdrop s per side [left, right] (carried, updated in place): blocks continue across segments. */
  backNext: [number, number];
  /** End of the area visit (s): backdrop blocks never reach into the next gateway. */
  areaEndS: number;
}

class Out {
  constructor(readonly list: Decor[], readonly env: DecorEnv) {}
  add(kind: DecorKind, s: number, x: number, y: number, params: Record<string, number> = {}, o: { rotY?: number; variant?: number; scale?: number } = {}): void {
    if (s < this.env.s0 || s >= this.env.s1) return;
    const def = DECOR_KINDS[kind];
    const p: Record<string, number> = {};
    for (const [k, v] of Object.entries(params)) p[k] = round1cm(v);
    this.list.push({ kind, s: round1cm(s), x: round1cm(x), y: round1cm(y), rotY: o.rotY ?? 0, scale: o.scale ?? 1,
      variant: o.variant ?? 0, castShadow: def.castShadow, params: p });
  }
}

/** Emit the decor of one segment [s0, s1). Returns the next end-wall s. */
export function emitDecor(out: Decor[], env: DecorEnv, rng: Sfc32): number {
  const o = new Out(out, env);
  const { s0, s1, datum } = env;
  const y0 = datum, side0 = datum + 0.15;
  const v = speedAt(tAt(s0));
  if (env.gateway) { gatewayDecor(o, env.gateway, rng); return endWalls(o, rng, env, v); }
  const a = env.area;
  // ── Backdrop: buildings both sides (the −x row casts across the street: shorter blocks, cross-street gaps). ──
  for (const sd of [-1, 1] as const) {
    if (a === 'docks' && sd > 0) {
      o.add('water', s0, 5.0, datum - 0.6, { len: s1 - s0, w: 20, glitter: 0.6 });
      if (rng.chance(0.25)) o.add('crane', s0 + rng.range(0, s1 - s0), 16, datum, { h: rng.range(22, 34), boom: rng.range(18, 30), side: 1 });
      env.backNext[1] = s1;
      continue;
    }
    const bi = sd < 0 ? 0 : 1;
    let s = Math.max(env.backNext[bi], s0);
    const xIn = sd * (DECOR_LIMITS.backdropMinX + 0.2);
    while (s < s1) {
      const [dMin, dMax] = a === 'suburbs' ? [8, 14] : a === 'docks' ? [16, 30] : a === 'neon' ? [6, 12] : sd < 0 ? [8, 12] : [8, 16];
      const room = env.areaEndS - s;
      if (room < dMin) { s = env.areaEndS; break; }
      const d = round1cm(Math.min(rng.range(dMin, dMax), room));
      if (a === 'downtown') o.add('building', s, xIn, side0, { w: rng.range(6, 12), d, h: rng.range(8, 22), floors: rng.int(3, 7),
        setbacks: rng.int(0, 2), awning: 1, brand: rng.chance(0.6) ? rng.int(0, DECOR_BRANDS.downtown.length - 1) : -1, facade: rng.int(0, 7) }, { variant: rng.int(0, 7) });
      else if (a === 'suburbs') o.add('house', s, xIn, side0, { w: rng.range(7, 12), d, h: rng.range(3, 4.5), roofH: rng.range(1.8, 3),
        roof: rng.int(0, 4), garage: rng.chance(0.4) ? 1 : 0, porch: 1 }, { variant: rng.int(0, 7) });
      else if (a === 'docks') o.add('warehouse', s, xIn, y0, { w: rng.range(10, 20), d, h: rng.range(7, 12), door: rng.chance(0.6) ? 1 : 0,
        brand: rng.chance(0.5) ? rng.int(0, DECOR_BRANDS.docks.length - 1) : -1, color: rng.int(0, 5) }, { variant: rng.int(0, 7) });
      else o.add('tower', s, xIn, side0, { w: rng.range(6, 10), d, floors: rng.int(8, 14), bladeSigns: rng.int(1, 3),
        accent: rng.int(0, 5) }, { variant: rng.int(0, 7) });
      s += d + round1cm(sd < 0 && a !== 'docks' ? rng.range(6, 12) : rng.range(0, 3));
    }
    env.backNext[bi] = s;
    // Off-screen shadow casters further out (long purple shadows across the street).
    if (rng.chance(0.6)) o.add('shadow_caster', s0 + rng.range(0, Math.max(1, s1 - s0 - 10)), sd * rng.range(9, 13), y0,
      { w: rng.range(3, 8), d: rng.range(6, 18), h: rng.range(14, 34), shape: a === 'docks' ? 3 : a === 'suburbs' ? 2 : 0 });
  }
  // ── Side band (|x| ≥ 4.6) and overhead, per area ──
  for (let s = Math.ceil(s0 / 14) * 14; s < s1; s += 14) for (const sd of [-1, 1] as const) {
    if (a === 'docks' && sd > 0) continue;
    o.add('street_lamp', s, sd * 4.75, side0, { h: a === 'docks' ? 7 : 5, arm: 0.1 }, { variant: ['downtown', 'suburbs', 'docks', 'neon'].indexOf(a) });
  }
  const len = s1 - s0;
  const along = (every: number, f: (s: number, k: number) => void) => { let k = 0; for (let s = s0 + rng.range(0, every); s < s1; s += every * rng.range(0.7, 1.3)) f(s, k++); };
  switch (a) {
    case 'downtown':
      along(9, (s, k) => {
        const sd = k % 2 ? 1 : -1;
        o.add('awning', s, sd * 4.65, side0 + 2.6, { w: rng.range(3, 6), depth: 1.0, stripes: 1, color: rng.int(0, 5) });
        o.add('blade_sign', s + 2, sd * 5.25, side0 + 2.8, { h: rng.range(1.5, 3), w: 0.6, brand: rng.int(0, DECOR_BRANDS.downtown.length - 1), emissive: 0 });
      });
      along(12, (s, k) => o.add(rng.pick(['cafe_umbrella', 'bike_parked', 'potted_plant', 'hydrant', 'parking_meter'] as const), s, (k % 2 ? 1 : -1) * 5.1, side0, { r: 1.1, count: 3, h: 0.9 }));
      along(16, (s, k) => o.add('tree', s, (k % 2 ? -1 : 1) * 5.4, side0, { crown: rng.range(1.2, 2.0), trunkH: rng.range(2.4, 3.4), species: 1 }));
      if (rng.chance(0.3)) o.add('billboard', s0 + rng.range(0, len), (rng.chance(0.5) ? -1 : 1) * 7.6, side0, { w: 5, h: 2.5, pole: 3, brand: rng.int(0, 4) });
      if (rng.chance(0.3)) o.add('banner', s0 + rng.range(0, len), (rng.chance(0.5) ? -1 : 1) * 5.0, side0 + 3, { h: 1.2, color: rng.int(0, 5) });
      if (rng.chance(0.25)) o.add('lantern_string', s0 + rng.range(0, len), 0, datum + 4.6, { x0: -5.2, x1: 5.2, sag: 0.6, count: 14, palette: 1 });
      if (rng.chance(0.35)) o.add('traffic_light', s0 + rng.range(0, len), (rng.chance(0.5) ? -1 : 1) * 4.9, side0, { h: 4, state: rng.int(0, 2) });
      break;
    case 'suburbs':
      along(8, (s, k) => {
        const sd = k % 2 ? 1 : -1;
        o.add(rng.pick(['hedge_round', 'mailbox_post', 'bin_pair', 'tree'] as const), s, sd * 5.2, y0, { r: 0.7, crown: rng.range(1.4, 2.6), trunkH: 2.4, count: 2, color: rng.int(0, 4) });
      });
      along(14, (s, k) => o.add('fence_run', s, (k % 2 ? -1 : 1) * 4.9, y0, { len: rng.range(6, 12), h: 1.0, style: rng.int(0, 2) }));
      if (rng.chance(0.35)) o.add('hoop', s0 + rng.range(0, len), (rng.chance(0.5) ? -1 : 1) * 5.6, y0, { h: 3.05 });
      if (rng.chance(0.3)) o.add('sprinkler', s0 + rng.range(0, len), (rng.chance(0.5) ? -1 : 1) * 6.2, y0, { r: 2 });
      if (rng.chance(0.35)) o.add('parked_car_side', s0 + rng.range(0, len), (rng.chance(0.5) ? -1 : 1) * 6.0, y0, { color: rng.float(), van: rng.chance(0.3) ? 1 : 0 }, { rotY: Math.PI / 2 });
      along(GEN.decorOverhead.suburbsWires, (s) => { o.add('utility_pole', s, -4.9, y0, { h: 8, arms: 2 }); o.add('overhead_wire', s, 0, datum + 6.2, { x0: -4.9, x1: 4.9, sag: 0.4, count: 2 }); });
      for (const d of env.driveways ?? []) o.add('driveway', d[0], d[2] * 3.2, side0, { w: d[1] - d[0] });
      o.add('leaf_emitter', s0, 0, datum, { rate: 4, len });
      if (rng.chance(0.25)) o.add('billboard', s0 + rng.range(0, len), (rng.chance(0.5) ? -1 : 1) * 8, y0, { w: 5, h: 2.5, pole: 3, brand: rng.int(0, 3) });
      break;
    case 'docks':
      o.add('chain_link', s0, -4.8, y0, { len, h: 2.0, post: 2.5 });
      along(10, (s) => o.add(rng.pick(['pallet_pile', 'drum_pile'] as const), s, -5.3, y0, { tiers: rng.int(2, 6), count: rng.int(2, 5), color: rng.int(0, 5) }));
      along(18, (s) => o.add('container_stack', s, -9, y0, { cols: rng.int(1, 3), rows: rng.int(1, 3), runs: rng.int(1, 2), palette: rng.int(0, 9) }));
      along(22, (s) => o.add('utility_pole', s, -4.9, y0, { h: 9, arms: 1 }));
      if (rng.chance(0.3)) o.add('billboard', s0 + rng.range(0, len), -7.5, y0, { w: 5, h: 2.5, pole: 3, brand: rng.int(0, 3) });
      break;
    case 'neon':
      along(6, (s, k) => {
        const sd = k % 2 ? 1 : -1;
        o.add('blade_sign', s, sd * 5.25, side0 + 2.4, { h: rng.range(2.5, 5), w: 0.6, word: rng.chance(0.5) ? rng.int(0, NEON_SIGN_WORDS.length - 1) : -1,
          brand: rng.int(0, DECOR_BRANDS.neon.length - 1), emissive: 1.8, glow: 1 });
      });
      along(9, (s, k) => o.add(rng.pick(['vending_machine', 'food_cart', 'paper_lantern', 'bike_parked', 'potted_plant', 'cherry_tree'] as const), s,
        (k % 2 ? -1 : 1) * 5.15, side0, { count: rng.int(1, 3), hue: rng.float(), word: rng.chance(0.5) ? rng.int(0, NEON_SIGN_WORDS.length - 1) : -1, glow: 1.2, crown: 1.5 }));
      along(GEN.decorOverhead.neonLanterns, (s) => o.add('lantern_string', s, 0, datum + 4.4, { x0: -5.0, x1: 5.0, sag: rng.range(0.3, 0.8), count: rng.int(10, 18), palette: rng.int(0, 2) }));
      if (rng.chance(0.4)) o.add('holo_billboard', s0 + rng.range(0, len), (rng.chance(0.5) ? -1 : 1) * 7.0, side0, { w: 3.5, h: 2.5, pole: 3.5, hue: rng.float(), brand: rng.int(0, 4) });
      o.add('maglev_beam', s0, 0, datum + DECOR_LIMITS.maglevY, { len, gap: 1.6 });
      if (rng.chance(0.3)) o.add('maglev_train', s0, 0, datum + DECOR_LIMITS.maglevY, { period: 20, phase: rng.range(0, 20), len: 40, speed: 45 });
      o.add('petal_emitter', s0, 0, datum, { rate: 5, len });
      if (rng.chance(0.4)) o.add('city_glow', s0 + rng.range(0, len), (rng.chance(0.5) ? -1 : 1) * 16, datum, { w: 30, h: 15, intensity: 0.5 });
      break;
  }
  groundDecals(o, a, rng, v);
  return endWalls(o, rng, env, v);
}

function groundDecals(o: Out, a: AreaId, rng: Sfc32, v: number): void {
  const { s0, s1, datum } = o.env;
  const len = s1 - s0;
  if (a !== 'docks') o.add('lane_dash', s0, 0, datum, { len, dash: 3, gap: 3, color: a === 'suburbs' ? 1 : 0 });
  if (a === 'downtown' && rng.chance(0.5)) o.add('parking_bay', s0, (rng.chance(0.5) ? -1 : 1) * 2.5, datum, { len, bays: Math.max(1, Math.floor(len / 5)) });
  if (a !== 'docks' && rng.chance(0.18)) o.add('crosswalk', s0 + rng.range(0, len), 0, datum, { len: 3, w: 6, scramble: a === 'neon' ? 1 : 0 });
  if (a !== 'docks' && rng.chance(0.3)) o.add('road_arrow', s0 + rng.range(0, len), rng.range(-2, 2), datum, { kind: rng.int(0, 3) });
  const n = Math.max(1, Math.round(len / (v * 2.2)));
  for (let k = 0; k < n; k++) {
    const s = s0 + rng.range(0, len), x = rng.range(-3.8, 3.8);
    const pool: DecorKind[] = a === 'suburbs' ? ['crack', 'patch', 'leaf_scatter', 'manhole', 'drain', 'puddle']
      : a === 'neon' ? ['puddle', 'puddle', 'petal_scatter', 'steam_vent', 'manhole', 'oil_stain']
      : a === 'docks' ? ['oil_stain', 'crack', 'patch', 'manhole', 'puddle'] : ['crack', 'patch', 'oil_stain', 'manhole', 'drain', 'puddle'];
    const kind = rng.pick(pool);
    o.add(kind, s, kind === 'drain' ? Math.sign(x || 1) * 3.0 : x, datum, { len: rng.range(0.6, 2.4), w: rng.range(0.5, 1.4), r: rng.range(0.4, 1.4),
      tint: a === 'neon' ? rng.int(1, 2) : 0, rate: 2 });
  }
}

function endWalls(o: Out, rng: Sfc32, env: DecorEnv, v: number): number {
  let next = Math.max(env.nextEndWall, env.s0 - 1e-6);
  const style = env.area === 'neon' ? 1 : env.area === 'docks' ? 2 : env.area === 'suburbs' ? 3 : 0;
  while (next < env.s1) {
    if (next >= env.s0) {
      const sd = rng.chance(0.5) ? -1 : 1;
      const brands = DECOR_BRANDS[env.area];
      o.add('end_wall', next, sd * 4.7, env.datum, { w: rng.range(6, 12), h: rng.range(5, 12), style,
        brand: rng.int(0, brands.length - 1), word: env.area === 'neon' && rng.chance(0.5) ? rng.int(0, NEON_SIGN_WORDS.length - 1) : -1,
        shutters: rng.int(2, 5) }, { rotY: 0 });
    }
    next += v * rng.range(END_WALL_SEC[0], END_WALL_SEC[1]);
  }
  env.nextEndWall = next;
  return next;
}

function gatewayDecor(o: Out, gw: GatewayId, rng: Sfc32): void {
  const { s0, s1, datum } = o.env;
  const len = s1 - s0;
  switch (gw) {
    case 'greenway':
      o.add('park_path', s0, 0, datum, { len, w: 6.4 });
      for (let s = s0 + 2; s < s1; s += rng.range(5, 8)) for (const sd of [-1, 1] as const) {
        o.add(rng.chance(0.6) ? 'tree' : 'hedge_round', s, sd * rng.range(5.4, 7.5), datum, { crown: rng.range(1.6, 2.8), trunkH: 2.6, species: 0, r: 0.9 });
      }
      o.add('low_wall', s0, -4.9, datum, { len, h: 0.5 }); o.add('fence_run', s0, 4.9, datum, { len, h: 0.9, style: 1 });
      o.add('leaf_scatter', s0 + len / 2, 0, datum, { r: 2 }); o.add('leaf_emitter', s0, 0, datum, { rate: 10, len });
      break;
    case 'levelCrossing':
      o.add('gate_arm', s0 + len * 0.3, -4.9, datum, { h: 5, lit: 1 }); o.add('gate_arm', s0 + len * 0.3, 4.9, datum, { h: 5, lit: 1 }, { rotY: Math.PI });
      o.add('crossing_signal', s0 + len * 0.25, -5.4, datum, { flash: 1 }); o.add('crossing_signal', s0 + len * 0.25, 5.4, datum, { flash: 1 });
      o.add('chain_link', s0 + len * 0.5, -4.8, datum, { len: len * 0.5, h: 2.0 });
      o.add('container_stack', s0 + len * 0.6, 9, datum, { cols: 2, rows: 2, runs: 1, palette: rng.int(0, 9) });
      break;
    case 'harborBridge':
      o.add('bridge_truss', s0, -4.9, datum, { len, h: 3, side: -1 }); o.add('bridge_truss', s0, 4.9, datum, { len, h: 3, side: 1 });
      o.add('water', s0, -5.0, datum - 4, { len, w: 30, glitter: 0.7 }); o.add('water', s0, 5.0, datum - 4, { len, w: 30, glitter: 0.7 });
      o.add('crane', s0 + len * 0.2, -18, datum, { h: 30, boom: 26, side: -1 });
      o.add('city_glow', s1 - 1, 0, datum, { w: 40, h: 18, intensity: 0.8 });
      o.add('holo_billboard', s0 + len * 0.7, 6.8, datum, { w: 3.5, h: 2.5, pole: 3.5, hue: rng.float(), brand: 4 });
      break;
    case 'underpass':
      o.add('tunnel', s0, 0, datum, { len, wallX: 5.5, h: 4.5, lightEvery: 4 });
      break;
  }
}
