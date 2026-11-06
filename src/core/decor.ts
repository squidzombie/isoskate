// core/decor.ts: the single vocabulary of `Decor.kind` values (added to the frozen contract in M0, SCHEDULE.md).
// FROZEN CONTRACT: change only via docs/core-requests.md.
//
// WG (world/gen) emits only these kinds; WA (world/render) renders every one of them in every listed area skin.
// Derived from DESIGN §10.3 (decor-only list), §10.2, §12.2 (gateways), §18.4 (portrait identity rules),
// §18.5 (building recipe), §18.6 (area kits, brands) and §18.7 (street details).
//
// Field conventions for every `Decor` record (core/world.ts):
// - `s`, `x`: footprint anchor in track space = front-centre (the end nearest the player, smallest s) at base height.
//   Ground decals and spans use their centre line; kinds with `x0`/`x1` params anchor at the span midpoint.
// - `y`: base height above the area datum (the surface it stands on). Overhead kinds give their lowest point.
// - `rotY`: radians about +y. 0 = the identity face looks at the camera (toward −s, i.e. toward the player).
// - `scale`: uniform multiplier on the nominal size (1 = sizes in the params / doc). `variant`: integer skin/shape
//   selector; kits use it modulo their own variant count, so any non-negative integer is valid.
// - `castShadow`: WG copies the kind's `castShadow` default unless it has a reason not to.
// - `params`: numbers only. Booleans are 0/1. Missing params take the documented default.
// Decor never collides, never uses chevrons or the cream grind-edge colour (DESIGN §18.4), and never puts an opaque
// structure over the corridor (DESIGN §8). The zone limits below are hard rules for WG and assumptions for WA.
import type { AreaId, GatewayId } from './ids';

export type DecorZone =
  | 'ground'     // flat decal or thin overlay on a surface; may lie inside the corridor (|x| ≤ 4.5)
  | 'side'       // sidewalk-dressing band just outside the corridor: |x| ≥ DECOR_LIMITS.sideMinX
  | 'backdrop'   // buildings, stacks, silhouettes: inner face at |x| ≥ DECOR_LIMITS.backdropMinX, casters to |x| 14
  | 'overhead'   // spans over the corridor: lowest point y ≥ 3.2 m, ≤ 0.3 m thick on screen
  | 'ambient';   // emitter or trigger with no solid mesh of its own (petals, leaves, train passes)

export interface DecorKindDef {
  readonly zone: DecorZone;
  /** Where WG may emit it. Gateway ids mean "inside that gateway's 4 s segment". */
  readonly areas: readonly (AreaId | GatewayId)[];
  /** Default for `Decor.castShadow`. */
  readonly castShadow: boolean;
  readonly doc: string;
  /** `Decor.params` key → meaning, unit, range and default. */
  readonly params: Readonly<Record<string, string>>;
}

export const DECOR_LIMITS = {
  sideMinX: 4.6,          // side-band decor keeps its inner edge here (corridor is ±4.5)
  signInnerMinX: 4.9,     // billboards and blade signs: inner edge |x| ≥ 4.9 (DESIGN §8)
  backdropMinX: 5.0,      // buildings and stacks start here
  casterMaxX: 14,         // off-screen shadow casters up to |x| = 14 (DESIGN §18.2)
  overheadMinY: 3.2,      // lantern strings, wires: lowest point (after sag) ≥ 3.2 m
  overheadMaxThick: 0.3,  // ≤ 0.3 m thick on screen
  maglevY: 7.0,           // maglev guideway height
} as const;

const ALL: readonly AreaId[] = ['downtown', 'suburbs', 'docks', 'neon'];
/** Generic street furniture and decals: every area and every gateway segment (DESIGN §12.2 gateways keep the street). */
const ANY: readonly (AreaId | GatewayId)[] = [...ALL, 'greenway', 'levelCrossing', 'harborBridge', 'underpass'];

/** Invented brands per area (DESIGN §18.6). `brand` params index into these (−1 = no brand). */
export const DECOR_BRANDS: Readonly<Record<AreaId, readonly string[]>> = {
  downtown: ["Marlo's Deli", 'Persimmon Records', 'Butter & Crumb', 'Hotel Amberlane', 'Pressline Coffee'],
  suburbs: ['Mapleworth Hardware', 'Sunny Spoon Diner', 'Corner Scoops', 'Suds & Socks Laundry'],
  docks: ['Brindle Freight', 'Saltwick Shipping', 'Pier 9 Ice', 'Gullhaven Containers'],
  neon: ['Hoshi Noodle', 'Kumo Mart 24', 'Tetsu Arcade', 'Mochi Mochi Café', 'Sora Line'],
};
/** The only Japanese words allowed on Neon signs (DESIGN §18.6). `word` params index into this (−1 = Latin brand). */
export const NEON_SIGN_WORDS: readonly string[] =
  ['ラーメン', '喫茶', 'カラオケ', '書店', '営業中', '薬局', '寿司', '花屋', '駐輪場', '出口'];
/** Surface list for `surface` params (index → Surface). */
export const DECOR_SURFACES = ['asphalt', 'wetAsphalt', 'concrete', 'tile', 'granite', 'wood', 'metal', 'grass'] as const;

export const DECOR_KINDS = {
  // ─── Backdrop: buildings and big silhouettes (also the off-screen shadow casters, DESIGN §18.2) ───────────────
  building: {
    zone: 'backdrop', areas: ['downtown', 'suburbs', 'docks', 'neon'], castShadow: true,
    doc: 'Generic city building (DESIGN §18.5 recipe): base box + setback boxes + darker cornice (0.15 m overhang), '
      + 'area facade-atlas windows, ground-floor awning and sign board, roof clutter. Downtown default; other areas '
      + 'prefer house / warehouse / tower. Street face at x (inner edge), extends away from the corridor.',
    params: {
      w: 'lateral depth away from the street, m (6–14, default 8)',
      d: 'length along s, m (8–30, default 14)',
      h: 'height to the roof, m (6–40, default 14)',
      floors: 'window rows (2–12; default h/3.2)',
      setbacks: 'number of setback boxes on the roof (0–2, default 1)',
      cornice: '0/1 darker cornice band (default 1)',
      awning: '0/1 ground-floor awning toward the street (default 1)',
      brand: 'sign board brand index into DECOR_BRANDS[area] (−1 none, default −1)',
      facade: 'facade atlas row (0–7, default variant)',
      lit: 'window-lit bias added to the palette ratio (−0.2..0.2, default 0)',
      tint: 'lightness jitter (−0.04..0.04, default 0)',
      clutter: 'roof clutter mask bits: 1 water tank, 2 AC boxes, 4 antennas, 8 laundry lines (default 3)',
    },
  },
  house: {
    zone: 'backdrop', areas: ['suburbs'], castShadow: true,
    doc: 'Suburban gable house, seen mostly as a roof and its shadow. Faces the street with a porch and a driveway side.',
    params: {
      w: 'lateral depth, m (7–12, default 9)', d: 'length along s, m (8–14, default 10)',
      h: 'eave height, m (3–6, default 3.2)', roofH: 'ridge above the eave, m (1.5–3.5, default 2.4)',
      roof: 'roof colour index into the Suburbs accents (0–4, default 4 = roof brick)',
      garage: '0/1 attached garage on the driveway side (default 0)', porch: '0/1 porch facing the street (default 1)',
      lit: 'window-lit bias (−0.2..0.2, default 0)',
    },
  },
  warehouse: {
    zone: 'backdrop', areas: ['docks'], castShadow: true,
    doc: 'Ribbed (corrugated) dock warehouse with a roller door toward the street and a painted sign band.',
    params: {
      w: 'lateral depth, m (10–24, default 16)', d: 'length along s, m (16–40, default 24)', h: 'height, m (6–14, default 9)',
      ribs: 'rib spacing, m (0.3–0.8, default 0.5)', door: '0/1 roller door facing the street (default 1)',
      brand: 'sign band brand index into DECOR_BRANDS.docks (−1 none)', color: 'cladding colour index into Docks accents (0–5)',
    },
  },
  tower: {
    zone: 'backdrop', areas: ['neon'], castShadow: true,
    doc: 'Slim 8–14 storey Neon tower (shadow caster; roof edges visible at the screen sides at top speed), '
      + 'emissive window dots, optional vertical blade signs on the street face.',
    params: {
      w: 'lateral depth, m (6–10, default 8)', d: 'length along s, m (6–12, default 9)',
      floors: 'storeys (8–14, default 11; 3.2 m each)', bladeSigns: 'blade signs on the street face (0–3, default 1)',
      lit: 'window-lit bias (−0.2..0.2, default 0)', accent: 'emissive accent index into Neon accents (0–5)',
    },
  },
  shadow_caster: {
    zone: 'backdrop', areas: ANY, castShadow: true,
    doc: 'Shadow-only silhouette: rendered into the shadow map but not the main pass, for off-screen buildings, '
      + 'trees and crane arms at |x| 9–14 whose shadows stripe the street (DESIGN §18.2).',
    params: {
      w: 'lateral size, m (1–12)', d: 'length along s, m (1–30)', h: 'height, m (2–40)',
      shape: 'silhouette: 0 box, 1 gable roof, 2 tree crown, 3 crane arm (default 0)',
    },
  },
  container_stack: {
    zone: 'backdrop', areas: ['docks', 'levelCrossing'], castShadow: true,
    doc: 'Stacked shipping containers as backdrop (6.1 × 2.4 × 2.6 each), long axis along s.',
    params: {
      cols: 'containers side by side laterally (1–4, default 2)', rows: 'tiers (1–4, default 2)',
      runs: 'containers end to end along s (1–4, default 1)', palette: 'colour seed; kit picks from Docks accents',
    },
  },
  crane: {
    zone: 'backdrop', areas: ['docks', 'harborBridge'], castShadow: true,
    doc: 'Gantry/harbour crane silhouette with a boom over the water side; mostly seen through its long shadow.',
    params: {
      h: 'height of the gantry, m (20–40, default 28)', boom: 'boom length, m (15–40, default 25)',
      side: 'boom direction: −1 left, +1 right (default sign of x)', beacon: '0/1 amber beacon at the top (default 1)',
    },
  },
  end_wall: {
    zone: 'backdrop', areas: ANY, castShadow: true,
    doc: 'Cross-street end wall every 8–12 s (DESIGN §18.4): beyond a side street, the next block shows a corner '
      + 'shopfront or shutters facing the camera. Inner edge at |x| ≥ 4.6 (beside the corridor, never across it).',
    params: {
      w: 'lateral span, m (4–14, default 9)', h: 'height, m (4–20, default 8)',
      style: 'face: 0 corner shopfront, 1 pastel ribbed shutters (Neon), 2 warehouse doors (Docks), 3 house front (Suburbs)',
      brand: 'shopfront sign brand index into DECOR_BRANDS[area] (−1 none)',
      word: 'Neon only: NEON_SIGN_WORDS index for the sign (−1 = Latin brand)',
      shutters: 'number of shutter bays for style 1 (1–6, default 3)',
    },
  },
  chain_link: {
    zone: 'side', areas: ['docks', 'levelCrossing'], castShadow: true,
    doc: 'Chain-link fence run along s outside the corridor (posts + translucent mesh).',
    params: { len: 'length along s, m (2–40)', h: 'height, m (1.6–2.4, default 2.0)', post: 'post spacing, m (default 2.5)' },
  },
  water: {
    zone: 'backdrop', areas: ['docks', 'harborBridge'], castShadow: false,
    doc: 'Harbour water beyond the dock lip (x > 4.5): sky-gradient plane with sun-glitter sparkles (DESIGN §18.7). '
      + 'y is the water level (below the datum).',
    params: { len: 'length along s, m', w: 'lateral width, m (default 20)', glitter: 'sparkle density 0..1 (default 0.5)' },
  },
  bridge_truss: {
    zone: 'side', areas: ['harborBridge'], castShadow: true,
    doc: 'Harbor Bridge side girders and truss beyond the corridor edge (the optional L1 deck itself is an obstacle).',
    params: { len: 'length along s, m', h: 'truss height above y, m (default 3)', side: '−1 left, +1 right' },
  },
  tunnel: {
    zone: 'side', areas: ['underpass'], castShadow: true,
    doc: 'Underpass: tiled tunnel walls with warm sodium light strips and a portal arch at the entry. Cutaway: no '
      + 'ceiling mesh over the corridor (DESIGN §8 occlusion); the portal arch band stays ≥ 4 m up and ≤ 0.6 m deep.',
    params: {
      len: 'length along s, m', wallX: 'wall inner face |x|, m (≥ 5.0, default 5.5)', h: 'wall height, m (default 4.5)',
      lightEvery: 'sodium light spacing, m (default 4)',
    },
  },
  city_glow: {
    zone: 'backdrop', areas: ['harborBridge', 'neon'], castShadow: false,
    doc: 'Additive glow card standing beyond the side buildings: "the city\'s glow ahead" (DESIGN §12.2).',
    params: { w: 'width, m (default 30)', h: 'height, m (default 15)', intensity: '0..1 (default 0.6)' },
  },

  // ─── Side band: street furniture just outside the corridor (DESIGN §18.4 "1–2 m sidewalk-dressing band") ───────
  street_lamp: {
    zone: 'side', areas: ANY, castShadow: true,
    doc: 'Street lamp. Variant skins per area: DT brass ornate, SB simple, Docks floodlight mast, Neon lantern-topped.',
    params: {
      h: 'pole height, m (3.5–8, default 5)', arm: 'arm reach toward the street, m (0–1.2; head stays at |x| ≥ 4.6)',
      lit: 'lamp emissive 0..1 (default: palette driven)',
    },
  },
  tree: {
    zone: 'side', areas: ['downtown', 'suburbs', 'greenway', 'levelCrossing'], castShadow: true,
    doc: 'Tree outside the corridor (Downtown palms in planters, Suburbs round trees, Greenway park trees). Sways gently.',
    params: {
      crown: 'crown radius, m (0.8–3, default 1.6)', trunkH: 'trunk height, m (1.5–6, default 2.6)',
      species: '0 round deciduous, 1 palm (in a planter), 2 conifer (default 0)', sway: 'sway amount 0..1 (default 0.3)',
    },
  },
  cherry_tree: {
    zone: 'side', areas: ['neon'], castShadow: true,
    doc: 'Cherry tree (clustered icosahedra #FFB7D0 / #F59BBE) in a sidewalk pit; sheds petal particles via vfx.',
    params: { crown: 'crown radius, m (1–2.5, default 1.5)', trunkH: 'trunk height, m (default 2.8)', petals: 'petal rate 0..1 (default 0.5)' },
  },
  hedge_round: {
    zone: 'side', areas: ['suburbs', 'greenway'], castShadow: true,
    doc: 'Round clipped hedge / bush in a front yard.',
    params: { r: 'radius, m (0.4–1.2, default 0.7)', squash: 'height/width ratio (0.6–1.2, default 0.85)' },
  },
  fence_run: {
    zone: 'side', areas: ['suburbs', 'greenway'], castShadow: true,
    doc: 'Front-yard boundary outside the corridor: picket fence, hedge strip or low wall, along s.',
    params: { len: 'length along s, m (1–40)', h: 'height, m (0.5–1.4, default 1.0)', style: '0 picket, 1 hedge, 2 low wall' },
  },
  low_wall: {
    zone: 'side', areas: ['greenway', 'downtown'], castShadow: true,
    doc: 'Low decorative park or plaza wall outside the corridor (not grindable; never cream-edged).',
    params: { len: 'length along s, m', h: 'height, m (0.3–0.8, default 0.5)' },
  },
  awning: {
    zone: 'side', areas: ['downtown', 'suburbs', 'neon'], castShadow: true,
    doc: 'Striped awning / canopy sticking out from a facade over the sidewalk band (DESIGN §18.4 identity element). '
      + 'Outer tip at |x| ≥ 4.6; underside ≥ 2.4 m.',
    params: {
      w: 'length along s, m (2–8, default 4)', depth: 'reach toward the street, m (0.6–1.5, default 1.0)',
      stripes: '0 plain, 1 striped (default 1)', color: 'colour index into area accents (0–5)',
    },
  },
  blade_sign: {
    zone: 'side', areas: ['downtown', 'neon'], castShadow: true,
    doc: 'Vertical blade sign hanging perpendicular to the facade (faces the camera in portrait). Inner edge |x| ≥ 4.9.',
    params: {
      h: 'sign height, m (1–6, default 3)', w: 'lateral width, m (0.3–1.2, default 0.6)',
      brand: 'brand index into DECOR_BRANDS[area] (−1 none)', word: 'Neon: NEON_SIGN_WORDS index (−1 = Latin brand)',
      emissive: 'glow 0..2.5 (default 0 Downtown, 1.8 Neon)', glow: '0/1 additive glow card behind (Neon, default 1)',
    },
  },
  banner: {
    zone: 'side', areas: ['downtown', 'suburbs'], castShadow: false,
    doc: 'Fabric banner hung on a lamp post, facing the camera.',
    params: { h: 'banner height, m (0.8–2, default 1.2)', color: 'colour index into area accents (0–5)' },
  },
  billboard: {
    zone: 'side', areas: ['downtown', 'suburbs', 'docks'], castShadow: true,
    doc: 'Painted billboard on poles facing the camera; invented brand art. Inner edge |x| ≥ 4.9.',
    params: { w: 'width, m (3–8, default 5)', h: 'panel height, m (1.5–4, default 2.5)', pole: 'pole height under the panel, m (default 3)', brand: 'brand index' },
  },
  holo_billboard: {
    zone: 'side', areas: ['neon', 'harborBridge'], castShadow: false,
    doc: 'Holographic billboard: additive plane with scanlines, 0.2 Hz hue drift and a rare 50 ms flicker, on a pole '
      + 'facing the camera. Inner edge |x| ≥ 4.9. Abstract invented glyphs only.',
    params: {
      w: 'width, m (2–6, default 3.5)', h: 'height, m (1.5–5, default 2.5)', pole: 'pole height, m (default 3.5)',
      hue: 'base hue 0..1', drift: 'hue drift Hz (default 0.2)', flicker: '0/1 rare flicker (default 1)', brand: 'brand index',
    },
  },
  vending_machine: {
    zone: 'side', areas: ['neon'], castShadow: true,
    doc: 'Vending machines outside the corridor with lit fronts facing the camera (the in-corridor vending_bank is an obstacle).',
    params: { count: 'machines side by side along s (1–4, default 2)', hue: 'front panel colour seed 0..1' },
  },
  food_cart: {
    zone: 'side', areas: ['neon'], castShadow: true,
    doc: 'Yatai-style food cart on the sidewalk band, its lit counter and noren facing the camera (DESIGN §18.4; '
      + 'the in-corridor food_cart is an obstacle). Brand from DECOR_BRANDS.neon or a NEON_SIGN_WORDS word.',
    params: { brand: 'brand index (−1 none, default −1)', word: 'NEON_SIGN_WORDS index (−1 Latin brand, default −1)',
      glow: 'counter emissive 0..2 (default 1)' },
  },
  paper_lantern: {
    zone: 'side', areas: ['neon'], castShadow: false,
    doc: 'Standing paper lantern (#FF5A3C / #FFD39A, emissive) on the sidewalk band.',
    params: { h: 'height, m (1.2–2, default 1.6)', glow: 'emissive 0..2 (default 1.2)' },
  },
  cafe_umbrella: {
    zone: 'side', areas: ['downtown'], castShadow: true,
    doc: 'Café table with an umbrella canopy outside the corridor (the in-corridor cafe_set is an obstacle).',
    params: { r: 'canopy radius, m (0.8–1.4, default 1.1)', color: 'colour index into Downtown accents (0–4)' },
  },
  hydrant: { zone: 'side', areas: ['downtown', 'suburbs'], castShadow: true, doc: 'Fire hydrant.', params: {} },
  parking_meter: { zone: 'side', areas: ['downtown'], castShadow: true, doc: 'Parking meter on the curb band.', params: {} },
  sign_post: {
    zone: 'side', areas: ANY, castShadow: true,
    doc: 'Street-name or traffic sign on a post (invented street names; generic pictogram signs).',
    params: { h: 'post height, m (2–3.5, default 2.6)', kind: '0 street name, 1 round pictogram, 2 arrow, 3 bus stop' },
  },
  traffic_light: {
    zone: 'side', areas: ['downtown', 'suburbs', 'neon'], castShadow: true,
    doc: 'Traffic light on a pole with the head over the sidewalk band (never over the corridor).',
    params: { h: 'height, m (3–5, default 4)', state: 'lit lamp 0 red, 1 amber, 2 green (static)' },
  },
  utility_pole: {
    zone: 'side', areas: ['suburbs', 'docks', 'neon'], castShadow: true,
    doc: 'Utility pole with cross-arms; overhead_wire spans usually start here.',
    params: { h: 'height, m (6–10, default 8)', arms: 'cross-arms (1–3, default 2)' },
  },
  bike_parked: {
    zone: 'side', areas: ['downtown', 'neon'], castShadow: true,
    doc: 'Parked bicycles on the sidewalk band (the in-corridor bike_rack / bike_row are obstacles).',
    params: { count: 'bikes in a row along s (1–8, default 3)' },
  },
  potted_plant: {
    zone: 'side', areas: ['downtown', 'neon'], castShadow: true,
    doc: 'Potted plant or flower box at a shopfront.',
    params: { h: 'height, m (0.5–1.5, default 0.9)' },
  },
  mailbox_post: {
    zone: 'side', areas: ['suburbs'], castShadow: true,
    doc: 'Front-yard mailbox on a post outside the corridor (the in-corridor mailbox is an obstacle).',
    params: { color: 'colour index into Suburbs accents (0–4)' },
  },
  bin_pair: {
    zone: 'side', areas: ['suburbs'], castShadow: true,
    doc: 'Wheelie bins put out at the kerb on the sidewalk band (DESIGN §18.6; the in-corridor wheelie_bins are obstacles).',
    params: { count: 'bins side by side along s (1–3, default 2)', color: 'lid colour index into Suburbs accents (0–4)' },
  },
  hoop: {
    zone: 'side', areas: ['suburbs'], castShadow: true,
    doc: 'Driveway basketball hoop facing the street (the in-corridor hoop_pole is an obstacle).',
    params: { h: 'rim height, m (default 3.05)' },
  },
  sprinkler: {
    zone: 'side', areas: ['suburbs'], castShadow: false,
    doc: 'Lawn sprinkler with an animated water arc (particles via vfx).',
    params: { r: 'arc radius, m (1–3, default 2)', rate: 'sweep Hz (default 0.3)' },
  },
  parked_car_side: {
    zone: 'side', areas: ['downtown', 'suburbs', 'neon'], castShadow: true,
    doc: 'Parked car outside the corridor (driveways, side streets). The in-corridor parked_car is an obstacle.',
    params: { color: 'body colour seed 0..1', van: '0 car, 1 van' },
  },
  pallet_pile: {
    zone: 'side', areas: ['docks'], castShadow: true,
    doc: 'Pallets stacked outside the corridor.',
    params: { tiers: 'stack height in pallets (1–8, default 4)', count: 'stacks along s (1–3)' },
  },
  drum_pile: {
    zone: 'side', areas: ['docks'], castShadow: true,
    doc: 'Oil drums outside the corridor.',
    params: { count: 'drums (1–8, default 4)', color: 'colour index into Docks accents (0–5)' },
  },
  gate_arm: {
    zone: 'side', areas: ['levelCrossing'], castShadow: true,
    doc: 'Level Crossing gate arm, raised (vertical), with its signal box at the corridor edge.',
    params: { h: 'raised arm height, m (default 5)', lit: '0/1 flashing lamps (default 1)' },
  },
  crossing_signal: {
    zone: 'side', areas: ['levelCrossing'], castShadow: true,
    doc: 'Level-crossing warning signal with two alternating lamps and a crossbuck.',
    params: { flash: 'flash rate Hz (default 1)' },
  },

  // ─── Overhead: thin spans over the corridor (DESIGN §8 occlusion: ≥ 3.2 m, ≤ 0.3 m thick on screen) ─────────────
  lantern_string: {
    zone: 'overhead', areas: ['neon', 'downtown'], castShadow: false,
    doc: 'Catenary of instanced emissive spheres (#FF5A3C / #FFD39A) across the street, swaying at 0.5 Hz. '
      + 'Anchored at x0/x1 outside the corridor; the lowest point (after sag) stays ≥ 3.2 m.',
    params: {
      x0: 'left anchor x, m (≤ −4.6)', x1: 'right anchor x, m (≥ 4.6)', sag: 'sag at mid-span, m (0–1.2, default 0.6)',
      count: 'lanterns (6–24, default 12)', palette: '0 red/paper alternating, 1 paper only, 2 red only', sway: 'Hz (default 0.5)',
    },
  },
  overhead_wire: {
    zone: 'overhead', areas: ANY, castShadow: true,
    doc: 'Overhead power or tram wires across or along the street (thin dark lines, cast thin shadows).',
    params: { x0: 'left anchor x, m', x1: 'right anchor x, m', sag: 'sag, m (0–0.8, default 0.3)', count: 'parallel wires (1–4, default 2)' },
  },
  maglev_beam: {
    zone: 'overhead', areas: ['neon'], castShadow: true,
    doc: 'Sora Line maglev guideway at y = 7: two thin edge beams (≤ 0.3 m wide each) running along s, carried by '
      + 'the viaduct pillars. Never a deck over the corridor. x is the guideway centre line.',
    params: { len: 'length along s, m', gap: 'lateral distance between the two beams, m (1.2–2.4, default 1.6)' },
  },

  // ─── Ground: decals and thin overlays (512² atlas, polygonOffset; may lie inside the corridor) ───────────────────
  crosswalk: {
    zone: 'ground', areas: ['downtown', 'neon', 'suburbs'], castShadow: false,
    doc: 'Zebra crosswalk stripes across the road (Neon: scramble crossing with diagonals).',
    params: { len: 'length along s, m (2–5, default 3)', w: 'lateral span, m (default 6)', scramble: '0/1 diagonal scramble (Neon)' },
  },
  lane_dash: {
    zone: 'ground', areas: ANY, castShadow: false,
    doc: 'Painted lane line along s at x (dashed or solid).',
    params: { len: 'length along s, m', dash: 'dash length, m (0 = solid, default 3)', gap: 'gap length, m (default 3)', color: '0 paint white, 1 yellow' },
  },
  parking_bay: {
    zone: 'ground', areas: ['downtown'], castShadow: false,
    doc: 'Parking bay lines in the ±2.0…±3.0 bands (DESIGN §10.2).',
    params: { len: 'length along s, m', bays: 'bays along s (default len/5)' },
  },
  road_arrow: {
    zone: 'ground', areas: ['downtown', 'suburbs', 'neon'], castShadow: false,
    doc: 'Painted road arrow or word marking (generic, no text in Neon except the reviewed list).',
    params: { kind: '0 straight, 1 left, 2 right, 3 "SLOW"/stripe block' },
  },
  crack: { zone: 'ground', areas: ANY, castShadow: false, doc: 'Asphalt or concrete crack decal.', params: { len: 'length, m (0.5–3)' } },
  patch: { zone: 'ground', areas: ANY, castShadow: false, doc: 'Repair patch decal.', params: { len: 'length along s, m (0.5–3)', w: 'width, m (0.5–2)' } },
  oil_stain: { zone: 'ground', areas: ['downtown', 'docks', 'neon'], castShadow: false, doc: 'Oil stain decal.', params: { r: 'radius, m (0.3–1)' } },
  drain: { zone: 'ground', areas: ANY, castShadow: false, doc: 'Storm drain grate at the curb line.', params: {} },
  manhole: {
    zone: 'ground', areas: ANY, castShadow: false,
    doc: 'Manhole cover; motif per area (DESIGN §18.7): grid (Downtown), plain (Suburbs), anchor (Docks), original flower (Neon).',
    params: { r: 'radius, m (default 0.35)' },
  },
  puddle: {
    zone: 'ground', areas: ANY, castShadow: false,
    doc: 'Puddle decal with the sky-horizon gradient, vertically stretched smears of nearby sign colours and a UV ripple '
      + '(no real reflection). Gold at golden hour; magenta/cyan in Neon.',
    params: { len: 'length along s, m (0.5–3, default 1.4)', w: 'width, m (0.4–2, default 0.9)', tint: '0 sky (palette), 1 neon magenta, 2 neon cyan' },
  },
  leaf_scatter: { zone: 'ground', areas: ['suburbs', 'greenway'], castShadow: false, doc: 'Scattered autumn leaf decals.', params: { r: 'patch radius, m (0.5–2)' } },
  petal_scatter: { zone: 'ground', areas: ['neon'], castShadow: false, doc: 'Scattered sakura petal decals.', params: { r: 'patch radius, m (0.5–2)' } },
  driveway: {
    zone: 'ground', areas: ['suburbs'], castShadow: false,
    doc: 'Driveway concrete and the curb-cut ramp decal from the sidewalk to a house (the curb geometry itself is WG slabs).',
    params: { w: 'width along s, m (2.5–4, default 3)' },
  },
  park_path: {
    zone: 'ground', areas: ['greenway'], castShadow: false,
    doc: 'Greenway park path and lawn verge (decal over the base slabs).',
    params: { len: 'length along s, m', w: 'path width, m (default 3)' },
  },
  verge: {
    zone: 'ground', areas: ANY, castShadow: false,
    doc: 'Ground strip outside the corridor continuing the area surface toward the backdrop (sidewalk, lawn, apron).',
    params: { len: 'length along s, m', w: 'lateral width, m', surface: 'index into DECOR_SURFACES' },
  },
  steam_vent: {
    zone: 'ground', areas: ['neon'], castShadow: false,
    doc: 'Street grate with a rising steam plume (particles via vfx; ≤ 25% alpha in the look-ahead zone).',
    params: { rate: 'puffs per second (default 2)' },
  },

  // ─── Ambient: emitters and triggers ──────────────────────────────────────────────────────────────────────────────
  petal_emitter: {
    zone: 'ambient', areas: ['neon'], castShadow: false,
    doc: 'Ambient sakura petals drifting across the view (off with reduced motion).',
    params: { rate: 'petals per second on screen (default 6)', len: 'active length along s, m' },
  },
  leaf_emitter: {
    zone: 'ambient', areas: ['suburbs', 'greenway'], castShadow: false,
    doc: 'Ambient leaves blowing across the street (Greenway "leaves blowing", DESIGN §12.2).',
    params: { rate: 'leaves per second on screen (default 6)', len: 'active length along s, m' },
  },
  maglev_train: {
    zone: 'ambient', areas: ['neon'], castShadow: false,
    doc: 'Sora Line train pass along the maglev beams: a light streak with a whoosh every ~20 s.',
    params: { period: 'seconds between passes (default 20)', phase: 'offset, s', len: 'streak length, m (default 40)', speed: 'm/s (default 45)' },
  },
} as const satisfies Readonly<Record<string, DecorKindDef>>;

export type DecorKind = keyof typeof DECOR_KINDS;
export const isDecorKind = (k: string): k is DecorKind => Object.prototype.hasOwnProperty.call(DECOR_KINDS, k);
