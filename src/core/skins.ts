// core/skins.ts: the RECLAIM skin chooser (TECH §4.15; DESIGN §10.3 skin notes, §18.5 vehicle builder). Additive core
// module (docs/core-requests.md THEME). One deterministic answer to "what is this obstacle drawn as?", shared by the
// kits (world/render/kits) and the crash copy (ui/format.ts), so the crash noun always names what was drawn.
// Pure: no gameplay effect. Footprints, height classes, tops, solids and edges come from the generator and never
// depend on a skin. The isolated-filler flag (sapling exception, DESIGN §18.4 rule 2) is passed to the kits
// separately by the chunk builder and never changes the noun.
import { DECOR_BRANDS } from './decor';
import type { AreaId, PropKind } from './ids';
import { hash32 } from './rng';

/** Vehicle bodies of the vehicle builder (`kits/car.ts` → `drawVehicle`, DESIGN §18.5). */
export type VehicleBody =
  | 'sedan' | 'estate' | 'pickup' | 'suv' | 'taxi' | 'kei_van' | 'panel_van' | 'camper' | 'box_truck' | 'shuttle_bus' | 'sweeper';
/** What a kit draws. `kit` = the kind's own (existing) geometry, re-dressed; the others name an alternate object
 *  inside the same box (DESIGN §10.3 RECLAIM skins). */
export type SkinBody = VehicleBody
  | 'kit' | 'container' | 'bikes' | 'carts' | 'bin_pair' | 'dumpster' | 'barrier_board' | 'log' | 'pipe' | 'holo_gate';
export const VEHICLE_BODIES: ReadonlySet<SkinBody> = new Set<SkinBody>(
  ['sedan', 'estate', 'pickup', 'suv', 'taxi', 'kei_van', 'panel_van', 'camper', 'box_truck', 'shuttle_bus', 'sweeper']);
export const isVehicle = (b: SkinBody): b is VehicleBody => VEHICLE_BODIES.has(b);

/** Hazard car paint tops (world/render/palette.ts RECLAIM.carPaint). Neon vehicles are inverted bodies: no paint.
 *  Oxblood stays valid and slate stays for movers; the hazard roll uses CAR_PAINTS. */
export type CarPaint = 'teal' | 'oxblood' | 'olive' | 'slate' | 'cobalt' | 'coral' | 'plum' | 'ochre';
/** The hazard roll (theme T8 "where they stopped"): six cheerful sun-faded paints, CAR_PAINTS[paintSlot]. */
export const CAR_PAINTS: readonly CarPaint[] = ['teal', 'olive', 'cobalt', 'coral', 'plum', 'ochre'];
/** Paint slots of the hazard roll, one per CAR_PAINTS entry. The generator tells two vehicles' paints apart by slot,
 *  so its choices do not move if the paint list does. */
export const PAINT_SLOTS = 6;
export const paintSlot = (id: number, variant: number): number => Math.floor(roll(id, variant, 2) * PAINT_SLOTS) % PAINT_SLOTS;

/** Theme T8 ("where they stopped"): does a vehicle parallel to s at x show its front to the camera? Each car faces
 *  its own traffic: traffic keeps right, so a car in the −x half came toward the camera and shows its front; one in
 *  the +x half drove away and shows its rear. Hoshimachi Ward keeps left (the mirror). */
export const noseToCam = (a: AreaId, x: number): boolean => (a === 'neon' ? x > 0 : x < 0);

/** Dressing flags (bit set). What the skin carries; the kits draw it under the dressing rules (`kits/dress.ts`). */
export const Dress = {
  /** Luminance-matched moss: face joints, lids, roof edges (colour only on Bump / Low / landable tops). */
  Moss: 1,
  /** Ink rust on sills and bins; orange-brown drips only on side panels, never below the door line. */
  Rust: 2,
  /** Ink-green foliage on side faces, legs, posts and lip faces (ivy, ferns, reeds, vines, grass collars). */
  Ivy: 4,
  /** A flat flower carpet on the top face: landable / grindable planters only (top-face rule). */
  Flowers: 8,
  /** A tree through the roof: a flat ink-green crown cap ≤ +0.05 m inside the footprint (kiosk, bus shelter). */
  Crown: 16,
  /** A cat loaf on the roof (≤ +0.22 m; 1 in 8 sedans and estates; never in Neon, never on movers). */
  Cat: 32,
  /** A resting bird (gull on a mooring bollard, sparrow on a hoop rim; ≤ +0.22 m, no lighter than #A6A3A8). */
  Bird: 64,
  /** A bird's nest in an open mailbox flap. */
  Nest: 128,
  /** The 1-in-4 sapling roll of a column filler: drawn only when the chunk builder marks the filler isolated. */
  Sapling: 256,
  /** Helper machine (movers): no moss, rust or plants; a sensor dome and a two-tone accent2 band. */
  Clean: 512,
  /** Faded livery or poster from DECOR_BRANDS[area] (index in `PropSkin.livery`). */
  Livery: 1024,
  /** Climbing roses on the fence faces (SB pickets: the one bloom accent on a crash object). */
  Roses: 2048,
  /** Theme T8: flower heads in a pickup's open bed, below the bed rim (1 pickup in 3, never in Neon). */
  Bloom: 4096,
} as const;
/** Dressing that a `Clean` skin (a helper machine) may never carry. */
export const WEAR_MASK = Dress.Moss | Dress.Rust | Dress.Ivy | Dress.Flowers | Dress.Crown | Dress.Cat | Dress.Bird
  | Dress.Nest | Dress.Sapling | Dress.Roses | Dress.Bloom;

export interface PropSkin {
  body: SkinBody;
  /** Paint top of a hazard vehicle (movers: slate); null for non-vehicles and Neon's inverted bodies. */
  paint: CarPaint | null;
  /** The plain crash noun (DESIGN §9: no "abandoned", "overgrown" or "mossy"). */
  noun: string;
  /** The noun is a plural ("bins", "drums"): the crash line takes no "a"/"an". */
  plural: boolean;
  /** Dress bit set. */
  dress: number;
  /** Livery / poster brand index into DECOR_BRANDS[area] (−1: none). */
  livery: number;
  /** Vehicles: the front faces the camera (30% of the roll; the generator picks the variant so that every vehicle
   *  parallel to s faces its own traffic, `noseToCam`); otherwise the rear shows. */
  nosedIn: boolean;
}
export const newSkin = (): PropSkin => ({ body: 'kit', paint: null, noun: '', plural: false, dress: 0, livery: -1, nosedIn: false });

/** Kinds that may roll the isolated-filler sapling (column fillers with a lid; not Neon, not mailboxes). */
export const SAPLING_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(
  ['trash_can', 'filler', 'news_box', 'wheelie_bins', 'drum_cluster', 'pallet_tall']);
/** Movers: the helper machines (DESIGN §10.9). */
export const MOVER_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(['crosswalk_car', 'backout_car', 'forklift', 'delivery_robot']);

const M = Dress.Moss, R = Dress.Rust, I = Dress.Ivy;
type Fixed = readonly [noun: string, dress: number];
/** Kinds whose skin does not vary (body `kit`). */
const FIXED: Readonly<Partial<Record<PropKind, Fixed>>> = {
  // shared
  curb: ['curb', 0], flatbar: ['rail', R], bench: ['bench', M | I], manual_pad: ['pad', M], trash_can: ['bin', M | R | I],
  cone: ['cone', I], stairs: ['steps', M], terrace: ['steps', M], handrail: ['handrail', 0], hubba: ['hubba', M],
  incline: ['ramp', 0], filler: ['bin', M | R | I],
  // downtown
  granite_ledge: ['ledge', M | I], planter: ['planter', Dress.Flowers], planter_tree: ['tree', 0],
  fountain: ['fountain', 0], bollard_row: ['bollard', M | I], kiosk: ['kiosk', Dress.Crown | I], cafe_set: ['café table', I],
  news_box: ['news box', M | I],
  // suburbs
  garden_wall: ['wall', M | I], hedge: ['hedge', 0], picket_fence: ['fence', Dress.Roses], mailbox: ['mailbox', R | I | Dress.Nest],
  porch_steps: ['porch rail', M], yard_table: ['potting bench', I], crate_stack: ['crates', I], speed_hump: ['hump', 0],
  hoop_pole: ['hoop pole', I | Dress.Bird], bus_shelter: ['bus shelter', Dress.Crown | Dress.Livery],
  // docks
  pallet_1: ['pallet', I], pallet_2: ['pallet', I], pallet_3: ['pallet', I], pallet_tall: ['pallet stack', I], ibeam: ['beam', R],
  loading_dock: ['dock', M], drum_cluster: ['drums', M | R | I], spool_standing: ['spool', I], spool_lying: ['spool', I],
  mooring_bollard: ['bollard', R | Dress.Bird], dock_lip: ['dock edge', 0], rail_track: ['rails', R],
  // neon
  guard_rail: ['guard rail', I], vending_bank: ['vending machine', M | I], viaduct_pillar: ['pillar', I],
  cherry_planter: ['cherry tree', 0], food_cart: ['food cart', 0], bike_row: ['bikes', R | I], skywalk: ['skywalk', M],
  a_frame_sign: ['sign', 0], lantern_stand: ['lantern', 0], neon_curb: ['curb', 0],
  // movers (helper machines)
  forklift: ['forklift', Dress.Clean], delivery_robot: ['delivery robot', Dress.Clean],
};
const PLURALS: ReadonlySet<string> = new Set(['bins', 'carts', 'crates', 'drums', 'rails', 'bikes', 'steps']);
const BARRIER: Readonly<Record<AreaId, readonly [SkinBody, string, number]>> = {
  downtown: ['barrier_board', 'barrier', I], suburbs: ['log', 'log', M], docks: ['pipe', 'pipe', R | I], neon: ['holo_gate', 'holo gate', 0],
};
const TRENCH: Readonly<Record<AreaId, string>> = { downtown: 'gap', suburbs: 'ditch', docks: 'gap', neon: 'trench' };
/** Docks liveries index DECOR_BRANDS.docks: 0 Brindle Freight (box trucks), 1 Saltwick Shipping (the staff shuttle). */
const BRINDLE = 0, SALTWICK = 1;
const brand = (area: AreaId, u: number) => Math.floor(u * DECOR_BRANDS[area].length) % DECOR_BRANDS[area].length;

/** Deterministic roll in [0, 1) per (id, variant, salt). */
const roll = (id: number, variant: number, salt: number) => (hash32(0x5c1a, id, variant, salt) >>> 0) / 4294967296;

function set(o: PropSkin, body: SkinBody, noun: string, dress: number, paint: CarPaint | null = null, livery = -1, nosedIn = false): PropSkin {
  o.body = body; o.noun = noun; o.plural = PLURALS.has(noun); o.dress = dress; o.paint = paint; o.livery = livery; o.nosedIn = nosedIn;
  return o;
}

/** The skin of an obstacle: body, paint, dressing flags, livery and crash noun (DESIGN §10.3 RECLAIM skins).
 *  Deterministic in its arguments; `h` is the obstacle height (an SUV needs h ≥ 1.5). Writes into `out` when given
 *  (no allocation), else returns a new object. Kits and ui/format.ts call it with the same
 *  (ob.kind, ob.area, ob.id, ob.variant, ob.hgt). */
export function propSkin(kind: PropKind, area: AreaId, id: number, variant: number, h: number, out: PropSkin = newSkin()): PropSkin {
  const u = roll(id, variant, 1);
  const paint = CAR_PAINTS[paintSlot(id, variant)]!;
  const nosed = roll(id, variant, 3) < 0.3;
  const sapling = area !== 'neon' && roll(id, variant, 6) < 0.25 ? Dress.Sapling : 0;
  const wear = M | R | I;
  switch (kind) {
    case 'parked_car': {
      if (area === 'neon') return set(out, 'taxi', 'taxi', I, null, -1, nosed);        // Phase B: taxis, no cats
      const body: VehicleBody = h >= 1.5
        ? (u < 0.3 ? 'sedan' : u < 0.55 ? 'estate' : u < 0.75 ? 'pickup' : 'suv')
        : (u < 0.4 ? 'sedan' : u < 0.75 ? 'estate' : 'pickup');
      const cat = (body === 'sedan' || body === 'estate') && roll(id, variant, 4) < 1 / 8 ? Dress.Cat : 0;
      // (theme T8: flowers in 1 pickup bed in 3; Neon has no pickups)
      const bloom = body === 'pickup' && roll(id, variant, 7) < 1 / 3 ? Dress.Bloom : 0;
      return set(out, body, body === 'pickup' ? 'pickup' : 'car', wear | cat | bloom, paint, -1, nosed);
    }
    case 'parked_van': {
      if (area === 'neon') return set(out, 'kei_van', 'van', I, null, -1, nosed);
      return u < 0.55
        ? set(out, 'panel_van', 'van', wear | Dress.Livery, paint, brand(area, roll(id, variant, 5)), nosed)
        : set(out, 'camper', 'van', wear, paint, -1, nosed);
    }
    case 'van_across': {
      // Phase B (theme T8): a delivery van nosed into a side loading entrance, its tail out into the street. Neon: a kei
      // van (inverted body and rim); the Docks: Brindle Freight livery; Downtown / Suburbs: an area brand.
      if (area === 'neon') return set(out, 'kei_van', 'van', I);
      const liv = area === 'docks' ? BRINDLE : brand(area, roll(id, variant, 5));
      return set(out, 'panel_van', 'van', wear | Dress.Livery, paint, liv);
    }
    case 'container': {
      if (u < 0.6) return set(out, 'container', 'container', R | I);
      const liv = area === 'docks' ? Dress.Livery : 0;                                     // brands are the Docks' own
      if (u < 0.85) return set(out, 'box_truck', 'truck', wear | liv, paint, liv ? BRINDLE : -1, nosed);
      return set(out, 'shuttle_bus', 'bus', wear | liv, paint, liv ? SALTWICK : -1, nosed);
    }
    case 'crosswalk_car': return set(out, 'sweeper', 'street sweeper', Dress.Clean, 'slate');
    case 'backout_car': return set(out, 'sedan', 'reversing car', Dress.Clean, 'slate');   // reverses out: rear to the street
    case 'bike_rack': return u < 0.5 ? set(out, 'bikes', 'bike rack', R | I) : set(out, 'carts', 'carts', I);
    case 'wheelie_bins': return u < 0.5 ? set(out, 'bin_pair', 'bins', M | I | sapling) : set(out, 'dumpster', 'dumpster', R | I | sapling);
    case 'barrier_low': { const [b, n, d] = BARRIER[area]; return set(out, b, n, d); }
    case 'holo_gate': return set(out, 'holo_gate', 'holo gate', 0);
    case 'trench': return set(out, 'kit', TRENCH[area], I);
    default: {
      const f = FIXED[kind];
      const d = (f ? f[1] : 0) | (SAPLING_KINDS.has(kind) ? sapling : 0);
      return set(out, 'kit', f ? f[0] : kind.replace(/_/g, ' '), d, null, d & Dress.Livery ? brand(area, roll(id, variant, 5)) : -1);
    }
  }
}
