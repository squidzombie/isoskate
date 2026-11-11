// core/ids.ts: identifiers (TECH §4.1). FROZEN CONTRACT: change only via docs/core-requests.md.
export const GAME_ID = 'dusklane';
export const GAME_NAME = 'Isoskate';
declare const __BUILD__: { version: string; hash: string; mode: 'development' | 'production' | 'single' };
export const BUILD = __BUILD__;      // Vite `define` (also set in vitest.config.ts)

export type AreaId = 'downtown' | 'suburbs' | 'docks' | 'neon';
export const AREA_ORDER: readonly AreaId[] = ['downtown', 'suburbs', 'docks', 'neon'];
export type GatewayId = 'greenway' | 'levelCrossing' | 'harborBridge' | 'underpass';
export type Dir8 = 'u' | 'd' | 'l' | 'r' | 'ul' | 'ur' | 'dl' | 'dr';
export type Surface = 'asphalt' | 'wetAsphalt' | 'concrete' | 'tile' | 'granite' | 'wood' | 'metal' | 'grass';
export type EdgeMaterial = 'metal' | 'neon' | 'concrete' | 'stone' | 'wood';
export type EdgeKind = 'rail' | 'ledge' | 'bench' | 'curb' | 'lip' | 'rim' | 'hubba';
export type CrashCause = 'slam' | 'badLanding' | 'fall' | 'splash';

export type PropKind =
  // shared
  | 'curb' | 'flatbar' | 'bench' | 'manual_pad' | 'trash_can' | 'cone' | 'barrier_low' | 'trench'
  | 'stairs' | 'handrail' | 'hubba' | 'incline' | 'terrace' | 'filler'
  | 'van_across'                                     // every area: a van nosed into a side loading entrance (@theme T8)
  // downtown
  | 'granite_ledge' | 'planter' | 'planter_tree' | 'fountain' | 'bollard_row' | 'kiosk' | 'parked_car'
  | 'bike_rack' | 'cafe_set' | 'news_box' | 'crosswalk_car'
  // suburbs
  | 'garden_wall' | 'hedge' | 'picket_fence' | 'mailbox' | 'wheelie_bins' | 'parked_van' | 'porch_steps'
  | 'yard_table' | 'crate_stack' | 'speed_hump' | 'hoop_pole' | 'bus_shelter' | 'backout_car'
  // docks
  | 'container' | 'pallet_1' | 'pallet_2' | 'pallet_3' | 'pallet_tall' | 'ibeam' | 'loading_dock'
  | 'drum_cluster' | 'spool_standing' | 'spool_lying' | 'mooring_bollard' | 'dock_lip' | 'rail_track' | 'forklift'
  // neon
  | 'guard_rail' | 'vending_bank' | 'viaduct_pillar' | 'holo_gate' | 'cherry_planter' | 'food_cart'
  | 'bike_row' | 'skywalk' | 'a_frame_sign' | 'lantern_stand' | 'neon_curb' | 'delivery_robot';

export type FlipId =
  | 'popShuvit' | 'kickflip' | 'heelflip' | 'impossible' | 'shuvit360' | 'varialKickflip' | 'varialHeelflip'
  | 'hardflip' | 'inwardHeelflip' | 'treFlip' | 'laserFlip' | 'doubleKickflip' | 'doubleHeelflip'
  | 'tripleKickflip' | 'tripleHeelflip';
export type GrindId =
  | 'fiftyFifty' | 'fiveO' | 'nosegrind' | 'boardslide' | 'lipslide' | 'noseslide' | 'tailslide'
  | 'feeble' | 'smith' | 'crooked' | 'overcrook' | 'bluntslide' | 'noseBluntslide';
export type SpinId = 'fs180' | 'bs180' | 'fs360' | 'bs360';       // body spins (DESIGN §6.1a)
export type ManualId = 'manual' | 'noseManual';
export type GrabId = 'indy';
export type TrickId = 'ollie' | FlipId | SpinId | GrindId | ManualId | GrabId;   // 36 Trick Book entries
export type BonusId = 'nearMiss' | 'transfer' | 'popOut' | 'spinOut' | 'revert' | 'gap' | 'landmark' | 'newGround' | 'knock';
export type HintId = 'drag' | 'tap' | 'grind' | 'pick' | 'flip' | 'avoid' | 'manual' | 'transfer' | 'spin' | 'pit';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Slot = 'skater' | 'board' | 'helmet';
export type ItemId = string;          // stable save keys, e.g. 'sk_juno', 'bd_plain_maple', 'hm_classic'
export type CrateTier = 'cardboard' | 'street' | 'pro';
export type ScreenId = 'boot' | 'title' | 'run' | 'pause' | 'crash' | 'results' | 'rewards'
  | 'locker' | 'shop' | 'crates' | 'stats' | 'settings';
export type QualityTier = 'low' | 'med' | 'high';
