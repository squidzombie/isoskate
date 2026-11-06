// content/cosmetics.ts: the cosmetic catalog (DESIGN §15), all 40 items. Purely visual: nothing here may reach
// sim/, tricks/ or world/gen/ (scripts/lint.mjs boundary rule). Item ids are stable save keys: never rename them.
//
// Look parameters map one-to-one onto SkaterLook / BoardLook / HelmetLook (core/cosmetics.ts, TECH §4.7). Where the
// DESIGN table leaves a value open (a decal colour for a multi-colour decal, Kettle's leg colour) the choice is noted
// inline. The bespoke animated fx (screenFace, lightSeams, trails, hoverRing, orbiting fish, glyph scroll, petal shed,
// animated canvases) are M5 stretch: skater/ renders a static emissive or colour fallback for each.
import type { BoardLook, CosmeticItem, Hex, HelmetLook, Loadout, SkaterLook } from '../core/cosmetics';
import type { ItemId, Slot } from '../core/ids';

// ── Skaters (DESIGN §15.1) ──────────────────────────────────────────────────────────────────────────────────────
type SkaterArgs = Omit<SkaterLook, 'kind' | 'stance' | 'poseStyle' | 'fx' | 'accessory'>
  & Partial<Pick<SkaterLook, 'kind' | 'stance' | 'poseStyle' | 'fx' | 'accessory'>>;
const skater = (a: SkaterArgs): SkaterLook => ({
  kind: 'human', stance: 'regular', poseStyle: 'normal', fx: [], accessory: null, ...a,
});

const JUNO = skater({
  skin: 2, build: 'regular', heightScale: 1.0, hair: 'bob', hairColor: 0x2b1e1a,
  top: 'hoodie', topColors: [0xe0a93b, 0xf3e3c3], print: 'none',
  bottom: 'baggyJeans', bottomColor: 0x4c6a92, shoes: 'highTop', shoeColor: 0xf7f2ea,
});
const MIKA = skater({
  skin: 0, build: 'slim', heightScale: 1.02, hair: 'longStraight', hairColor: 0xe8c97a,
  top: 'longSleeve', topColors: [0xf3e3c3, 0x3e8e8a], print: 'stripe',
  bottom: 'cargoShorts', bottomColor: 0x8a7f5c, shoes: 'lowTop', shoeColor: 0x2e2a33,
  accessory: 'tallSocks', accessoryColor: 0xf7f2ea, stance: 'goofy',
});
const THEO = skater({
  skin: 3, build: 'regular', heightScale: 1.04, hair: 'curlyMop', hairColor: 0x1e1714,
  top: 'jacket', topColors: [0x5b7db1, 0xf7f2ea], print: 'pocket',             // denim jacket
  bottom: 'slimJeans', bottomColor: 0x2e2a33, shoes: 'lowTop', shoeColor: 0xc4473d,
});
const DEE = skater({
  skin: 6, build: 'regular', heightScale: 0.98, hair: 'afroPuff', hairColor: 0x1a1210,
  top: 'tee', topColors: [0xb8a3e6, 0xfff4e3], print: 'chestLogo',            // the tee is cut oversized
  bottom: 'chinos', bottomColor: 0xd9c3ae, shoes: 'chunky', shoeColor: 0xf7f2ea,   // the chinos are cut wide
  accessory: 'wristband', accessoryColor: 0xff5e6c,
});
const ROOK = skater({
  skin: 4, build: 'stocky', heightScale: 1.03, hair: 'buzz', hairColor: 0x2a1f1a,
  top: 'varsity', topColors: [0xc4473d, 0xf3e3c3], print: 'crestRD',           // original "RD" crest
  bottom: 'baggyJeans', bottomColor: 0x3b4a6b, shoes: 'highTop', shoeColor: 0x2e2a33,
});
const LARK = skater({
  skin: 5, build: 'slim', heightScale: 0.92, hair: 'twinBuns', hairColor: 0x1a1210,
  top: 'raincoat', topColors: [0xf4d58d, 0xf2b630], print: 'none',             // a huge raincoat
  bottom: 'shorts', bottomColor: 0x8fb8de, shoes: 'rainBoots', shoeColor: 0xf2b630,
  fx: ['coatSway'],                                                              // the hem sways on landings
});
const INES = skater({
  skin: 1, build: 'regular', heightScale: 1.0, hair: 'topBun', hairColor: 0x7a3b2a,
  top: 'overalls', topColors: [0x8fb8de, 0xfff4e3], print: 'paintDots', printColors: [0xff8a5b, 0x7ee0b5, 0xa88beb],
  bottom: 'onePiece', bottomColor: 0x8fb8de, shoes: 'lowTop', shoeColor: 0xf7f2ea,
});
const KOFI = skater({
  skin: 7, build: 'regular', heightScale: 1.06, hair: 'buzz', hairColor: 0x14100e,
  top: 'trackJacket', topColors: [0x2b2140, 0xff8a5b], print: 'sunsetStripe',
  bottom: 'trackPants', bottomColor: 0x2b2140, shoes: 'lowTop', shoeColor: 0xfff4e3,
  accessory: 'headphones', accessoryColor: 0xff8a5b,
});
const VESPER = skater({
  skin: 3, build: 'stocky', heightScale: 1.0, hair: 'ponytail', hairColor: 0x3a2a22,
  top: 'coveralls', topColors: [0xf08a3c, 0x2b2140], print: 'none',
  bottom: 'onePiece', bottomColor: 0xf08a3c, shoes: 'workBoots', shoeColor: 0x5a4636,
  accessory: 'beanie', accessoryColor: 0x2f5d7c, fx: ['reflectiveStrips'],      // emissive bands 0.2 → 1.2 toward dusk
});
const AKI = skater({
  skin: 1, build: 'slim', heightScale: 1.0, hair: 'spikes', hairColor: 0x1a1a2a, hairTip: 0x3ff2ff,
  top: 'courierJacket', topColors: [0x2b2140, 0x3ff2ff], print: 'none',
  bottom: 'slimJeans', bottomColor: 0x1e2350, shoes: 'chunky', shoeColor: 0xff3fa4,
  accessory: 'backpack', accessoryColor: 0x2b2140, fx: ['lightSeams'],          // seams cycle #FF3FA4 ↔ #3FF2FF, 0.5 Hz
});
const GUS = skater({
  skin: 0, build: 'regular', heightScale: 1.05, hair: 'shortGrey', hairColor: 0xe8e4dc, facialHair: 'moustache',
  top: 'cardigan', topColors: [0xb5645a, 0xf3e3c3], print: 'none',
  bottom: 'slacks', bottomColor: 0x8a7f70, shoes: 'lowTop', shoeColor: 0xffffff,
  accessory: 'tubeSocks', accessoryColor: 0xffffff, poseStyle: 'upright',
  fx: ['leafTrail'],                                                             // leaves #D9765A #F4D58D (static: leaf pin)
});
const KETTLE = skater({
  kind: 'robot', skin: 0, build: 'regular', heightScale: 1.0,
  hair: 'none', hairColor: 0xb8bcc8,                                             // chrome dome
  top: 'robot', topColors: [0x3e8e8a, 0xb8bcc8], print: 'none',
  bottom: 'robot', bottomColor: 0x3e8e8a,                                        // legs: body teal (joints chrome)
  shoes: 'robot', shoeColor: 0xb8bcc8,                                           // feet: chrome
  accessory: 'antenna', accessoryColor: 0xff8a5b, fx: ['screenFace'],
});

// ── Boards (DESIGN §15.2) ───────────────────────────────────────────────────────────────────────────────────────
type BoardArgs = Pick<BoardLook, 'pattern' | 'palette'> & Partial<BoardLook>;
/** Shared defaults: grip #2E2A33, trucks #B8BCC8, cream wheels, natural ply edge, scale 1, rot 0, no wear. */
const board = (a: BoardArgs): BoardLook => ({
  scale: 1, rot: 0, wear: 0, logo: null, grip: 0x2e2a33, wheels: 0xf3e3c3, trucks: 0xb8bcc8,
  finish: 'flat', wheelFx: 'none', ...a,
});
const pal = (a: Hex, b: Hex, c: Hex): [Hex, Hex, Hex] => [a, b, c];

const PLAIN_MAPLE = board({ pattern: 'plainMaple', palette: pal(0xd9b98c, 0xc9a27a, 0xe8c9a0), wheels: 0xf3e3c3, wear: 0.2 });
const SUNSET_STRIPE = board({ pattern: 'stripes', palette: pal(0xffc9a8, 0xff8a5b, 0x7a4e8c), scale: 1, rot: 0, wheels: 0xffc9a8 });
const MINT_CHIP = board({ pattern: 'polka', palette: pal(0x9ccfb3, 0x5a3b2a, 0x9ccfb3), scale: 0.6, wheels: 0xf3e3c3 });
const BRICK_LANE = board({ pattern: 'brick', palette: pal(0xb5645a, 0xe8d6c2, 0x8e4a42), wheels: 0x2e2a33 });
const CASSETTE = board({ pattern: 'cassette', palette: pal(0x2b2140, 0xff8a5b, 0xf3e3c3), wheels: 0xff8a5b });
const HAZARD_TAPE = board({ pattern: 'chevrons', palette: pal(0xf2b630, 0x2b2140, 0xf2b630), rot: 45, wheels: 0x2b2140 });
const LOFI_WAVES = board({ pattern: 'waveLines', palette: pal(0xa88beb, 0x7ee0b5, 0xffc9a8), logo: 'Pressline', wheels: 0xa88beb });
const PALM_SHADOW = board({ pattern: 'palms', palette: pal(0xf4d58d, 0xb5645a, 0x6b4e8c) });
const RUST_RIVETS = board({ pattern: 'corrugated', palette: pal(0xb5552f, 0x8a8fa0, 0x5e8c6a), wear: 0.6, trucks: 0x5a4636 });
const KOI_CURRENT = board({ pattern: 'koi', palette: pal(0x2f5d7c, 0xf08a3c, 0xfff4e3), wheels: 0xf08a3c });
const STREET_GRID = board({ pattern: 'streetMap', palette: pal(0xfff4e3, 0x2b2140, 0xff5e6c), wheels: 0xff5e6c });  // dotted route line
const HOLO_SHIFT = board({ pattern: 'gradientFade', palette: pal(0x3ff2ff, 0xff3fa4, 0x8a5cff), finish: 'holo' });
const LANTERN_ROW = board({ pattern: 'lanterns', palette: pal(0xff5a3c, 0xffd39a, 0x2b2140), finish: 'emissive' });  // lanterns glow 0.8
const NIGHT_MARKET = board({ pattern: 'neonGrid', palette: pal(0x1e2350, 0x3ff2ff, 0xff3fa4), finish: 'emissive' });  // invented glyph labels
const GOLDEN_HOUR = board({
  pattern: 'goldLeaf', palette: pal(0xe9b44c, 0xffe3a3, 0x8a5a2b), finish: 'goldLeaf',
  wheelFx: 'lightTrail', fxColor: 0xffc48a, gripGlow: 0xffd58a,
});
const GLIDE_RING = board({
  pattern: 'retroSun', palette: pal(0xff8a5b, 0xffc94a, 0x2b2140),
  wheelFx: 'hoverRing', fxColor: 0x7ff8ff, animated: true,                       // the sun rises and sets on a 6 s loop
});

// ── Helmets (DESIGN §15.3) ──────────────────────────────────────────────────────────────────────────────────────
type HelmetArgs = Pick<HelmetLook, 'shell' | 'color'> & Partial<HelmetLook>;
const helmet = (a: HelmetArgs): HelmetLook => ({ decal: 'none', decalColor: 0x2b2140, finish: 'matte', fx: 'none', ...a });

const CLASSIC = helmet({ shell: 'dome', color: 0xf3e3c3, finish: 'matte' });                                    // 8 vents
const STICKERBOMB = helmet({ shell: 'dome', color: 0xfff4e3, decal: 'stickers', decalColor: 0xff8a5b, finish: 'gloss' });   // 9 shapes
const RACING = helmet({ shell: 'dome', color: 0x2b3a6b, decal: 'stripe', decalColor: 0xf3e3c3, finish: 'gloss' });
const CHERRY = helmet({ shell: 'retro', color: 0xc4473d, finish: 'gloss' });                                    // specular sprite
const HARDHAT = helmet({ shell: 'hardHat', color: 0xf2b630, decal: 'scuffs', decalColor: 0x5a4636, finish: 'matte' });
const PLAID = helmet({ shell: 'bucket', color: 0xc4473d, decal: 'plaid', decalColor: 0xfff4e3, finish: 'matte' });     // gingham
const CATEARS = helmet({ shell: 'catEars', color: 0x2b2140, decal: 'innerEars', decalColor: 0xffb7d0, finish: 'gloss', fx: 'earFlick' });
const VISORPRO = helmet({ shell: 'visor', color: 0xfff4e3, visorTint: 0x8a5cff, finish: 'gloss' });           // the visor reflects the sky
const LANTERN = helmet({ shell: 'lantern', color: 0xff5a3c, decal: 'ribs', decalColor: 0xffd39a, finish: 'emissive', fx: 'emissiveDusk' });
const FISHBOWL = helmet({ shell: 'bubble', color: 0xbfe8ff, opacity: 0.35, decal: 'fish', decalColor: 0xf08a3c, finish: 'gloss', fx: 'orbitFish' });
const SUNFLOWER = helmet({ shell: 'petalRing', color: 0x5a3b2a, decal: 'petals', decalColor: 0xf4d58d, finish: 'matte', fx: 'petalShed' });
const HOLOVISOR = helmet({ shell: 'wrapVisor', color: 0x1e2350, decal: 'glyphScroll', decalColor: 0x3ff2ff, finish: 'emissive', fx: 'glyphTrail' });

type Row = Omit<CosmeticItem, 'source'> & { source?: CosmeticItem['source'] };
const rows: Row[] = [
  // skaters: 4 common, 4 rare, 2 epic, 2 legendary
  { id: 'sk_juno', slot: 'skater', name: 'Juno Park', rarity: 'common', source: 'starter', look: JUNO },
  { id: 'sk_mika', slot: 'skater', name: 'Mika Lindqvist', rarity: 'common', look: MIKA },
  { id: 'sk_theo', slot: 'skater', name: 'Theo Ramos', rarity: 'common', look: THEO },
  { id: 'sk_dee', slot: 'skater', name: 'Dee Abara', rarity: 'common', look: DEE },
  { id: 'sk_rook', slot: 'skater', name: 'Rook Delaney', rarity: 'rare', theme: 'downtown', look: ROOK },
  { id: 'sk_lark', slot: 'skater', name: 'Lark Osei', rarity: 'rare', theme: 'suburbs', look: LARK },
  { id: 'sk_ines', slot: 'skater', name: 'Ines Moreau', rarity: 'rare', look: INES },
  { id: 'sk_kofi', slot: 'skater', name: 'Kofi Mensah', rarity: 'rare', look: KOFI },
  { id: 'sk_vesper', slot: 'skater', name: 'Vesper Quay', rarity: 'epic', theme: 'docks', look: VESPER },
  { id: 'sk_aki', slot: 'skater', name: 'Aki Tanabe', rarity: 'epic', theme: 'neon', look: AKI },
  { id: 'sk_gus', slot: 'skater', name: 'Gus Halloran', rarity: 'legendary', look: GUS },
  { id: 'sk_kettle', slot: 'skater', name: 'Kettle', rarity: 'legendary', look: KETTLE },
  // boards: 6 common, 5 rare, 3 epic, 2 legendary
  { id: 'bd_plain_maple', slot: 'board', name: 'Plain Maple', rarity: 'common', source: 'starter', look: PLAIN_MAPLE },
  { id: 'bd_sunset_stripe', slot: 'board', name: 'Sunset Stripe', rarity: 'common', look: SUNSET_STRIPE },
  { id: 'bd_mint_chip', slot: 'board', name: 'Mint Chip', rarity: 'common', look: MINT_CHIP },
  { id: 'bd_brick_lane', slot: 'board', name: 'Brick Lane', rarity: 'common', theme: 'downtown', look: BRICK_LANE },
  { id: 'bd_cassette', slot: 'board', name: 'Cassette', rarity: 'common', look: CASSETTE },
  { id: 'bd_hazard_tape', slot: 'board', name: 'Hazard Tape', rarity: 'common', theme: 'docks', look: HAZARD_TAPE },
  { id: 'bd_lofi_waves', slot: 'board', name: 'Lofi Waves', rarity: 'rare', look: LOFI_WAVES },
  { id: 'bd_palm_shadow', slot: 'board', name: 'Palm Shadow', rarity: 'rare', theme: 'suburbs', look: PALM_SHADOW },
  { id: 'bd_rust_rivets', slot: 'board', name: 'Rust & Rivets', rarity: 'rare', theme: 'docks', look: RUST_RIVETS },
  { id: 'bd_koi_current', slot: 'board', name: 'Koi Current', rarity: 'rare', theme: 'neon', look: KOI_CURRENT },
  { id: 'bd_street_grid', slot: 'board', name: 'Street Grid', rarity: 'rare', look: STREET_GRID },
  { id: 'bd_holo_shift', slot: 'board', name: 'Holo Shift', rarity: 'epic', look: HOLO_SHIFT },
  { id: 'bd_lantern_row', slot: 'board', name: 'Lantern Row', rarity: 'epic', theme: 'neon', look: LANTERN_ROW },
  { id: 'bd_night_market', slot: 'board', name: 'Night Market', rarity: 'epic', theme: 'neon', look: NIGHT_MARKET },
  { id: 'bd_golden_hour', slot: 'board', name: 'Golden Hour', rarity: 'legendary', source: 'level30', look: GOLDEN_HOUR },
  { id: 'bd_glide_ring', slot: 'board', name: 'Glide Ring', rarity: 'legendary', look: GLIDE_RING },
  // helmets: 4 common, 4 rare, 2 epic, 2 legendary
  { id: 'hm_classic', slot: 'helmet', name: 'Classic Shell', rarity: 'common', source: 'starter', look: CLASSIC },
  { id: 'hm_stickerbomb', slot: 'helmet', name: 'Stickerbomb', rarity: 'common', look: STICKERBOMB },
  { id: 'hm_racing', slot: 'helmet', name: 'Racing Stripe', rarity: 'common', look: RACING },
  { id: 'hm_cherry', slot: 'helmet', name: 'Cherry Gloss', rarity: 'common', look: CHERRY },
  { id: 'hm_hardhat', slot: 'helmet', name: 'Hard Hat', rarity: 'rare', theme: 'docks', look: HARDHAT },
  { id: 'hm_plaid', slot: 'helmet', name: 'Picnic Plaid', rarity: 'rare', theme: 'suburbs', look: PLAID },
  { id: 'hm_catears', slot: 'helmet', name: 'Cat Ears', rarity: 'rare', look: CATEARS },
  { id: 'hm_visorpro', slot: 'helmet', name: 'Visor Pro', rarity: 'rare', look: VISORPRO },
  { id: 'hm_lantern', slot: 'helmet', name: 'Paper Lantern', rarity: 'epic', theme: 'neon', look: LANTERN },
  { id: 'hm_fishbowl', slot: 'helmet', name: 'Fishbowl', rarity: 'epic', look: FISHBOWL },
  { id: 'hm_sunflower', slot: 'helmet', name: 'Sunflower', rarity: 'legendary', look: SUNFLOWER },
  { id: 'hm_holovisor', slot: 'helmet', name: 'Holo Visor', rarity: 'legendary', theme: 'neon', look: HOLOVISOR },
];

/** The 40 items, in DESIGN §15 order (skaters, boards, helmets; by rarity within each slot). Non-starters are
 *  'shop' (shop and crates), except Golden Hour ('level30': the Level 30 reward, never in the shop or crates). */
export const CATALOG: readonly CosmeticItem[] = Object.freeze(rows.map((r) => Object.freeze({ ...r, source: r.source ?? 'shop' })));

export const STARTERS = { skater: 'sk_juno', board: 'bd_plain_maple', helmet: 'hm_classic' } as const;
export const DEFAULT_LOADOUT: Loadout = { skater: JUNO, board: PLAIN_MAPLE, helmet: CLASSIC };

const BY_ID = new Map<ItemId, CosmeticItem>(CATALOG.map((c) => [c.id, c]));
/** Catalog lookup by stable id (undefined for unknown ids, e.g. a save written by a newer build). */
export function itemById(id: ItemId): CosmeticItem | undefined { return BY_ID.get(id); }
/** The items of one slot, in catalog order. */
export function itemsOfSlot(slot: Slot): readonly CosmeticItem[] { return CATALOG.filter((c) => c.slot === slot); }
/** A full loadout from item ids; an unknown or wrong-slot id falls back to that slot's starter. */
export function loadoutOf(ids: { skater?: ItemId; board?: ItemId; helmet?: ItemId }): Loadout {
  const pick = <S extends Slot>(slot: S, id: ItemId | undefined): Loadout[S] => {
    const it = id !== undefined ? BY_ID.get(id) : undefined;
    return ((it && it.slot === slot ? it : BY_ID.get(STARTERS[slot])!).look) as Loadout[S];
  };
  return { skater: pick('skater', ids.skater), board: pick('board', ids.board), helmet: pick('helmet', ids.helmet) };
}
