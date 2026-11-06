// core/cosmetics.ts (TECH §4.7). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
// Purely visual: nothing here may reach sim/, tricks/ or world/gen/.
import type { AreaId, ItemId, Rarity, Slot } from './ids';
export type Hex = number;                                   // 0xRRGGBB
export type HairId = 'none' | 'bob' | 'longStraight' | 'curlyMop' | 'afroPuff' | 'buzz' | 'twinBuns'
  | 'topBun' | 'ponytail' | 'spikes' | 'shortGrey' | 'mohawk';
export type TopId = 'tee' | 'hoodie' | 'longSleeve' | 'jacket' | 'varsity' | 'raincoat' | 'overalls'
  | 'trackJacket' | 'coveralls' | 'courierJacket' | 'cardigan' | 'robot';
export type PrintId = 'none' | 'stripe' | 'pocket' | 'chestLogo' | 'crestRD' | 'paintDots' | 'sunsetStripe';
export type BottomId = 'baggyJeans' | 'slimJeans' | 'cargoShorts' | 'shorts' | 'chinos' | 'trackPants'
  | 'slacks' | 'onePiece' | 'robot';
export type ShoeId = 'lowTop' | 'highTop' | 'chunky' | 'rainBoots' | 'workBoots' | 'robot';
export type AccessoryId = 'tallSocks' | 'tubeSocks' | 'wristband' | 'headphones' | 'beanie' | 'backpack' | 'antenna';
export type SkaterFx = 'reflectiveStrips' | 'lightSeams' | 'leafTrail' | 'screenFace' | 'coatSway';
export interface SkaterLook {
  kind: 'human' | 'robot';
  skin: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;                    // SKIN_TONES index (ignored for robot)
  build: 'slim' | 'regular' | 'stocky'; heightScale: number; // 0.92..1.08, visual only
  hair: HairId; hairColor: Hex; hairTip?: Hex; facialHair?: 'moustache';
  top: TopId; topColors: [Hex, Hex]; print: PrintId; printColors?: Hex[];
  bottom: BottomId; bottomColor: Hex;
  shoes: ShoeId; shoeColor: Hex;
  accessory: AccessoryId | null; accessoryColor?: Hex;
  stance: 'regular' | 'goofy'; poseStyle: 'normal' | 'upright';
  fx: SkaterFx[];
}
export type BoardPattern = 'plainMaple' | 'stripes' | 'chevrons' | 'checker' | 'halftoneSun' | 'palms'
  | 'waveLines' | 'polka' | 'gradientFade' | 'stickerBomb' | 'topo' | 'neonGrid' | 'retroSun' | 'brick'
  | 'cassette' | 'corrugated' | 'koi' | 'streetMap' | 'lanterns' | 'goldLeaf';
export interface BoardLook {
  pattern: BoardPattern; palette: [Hex, Hex, Hex]; scale: number; rot: 0 | 45 | 90; wear: number;
  logo: string | null; grip: Hex; wheels: Hex; trucks: Hex;
  finish: 'flat' | 'holo' | 'animHue' | 'goldLeaf' | 'emissive';
  wheelFx: 'none' | 'lightTrail' | 'hoverRing'; fxColor?: Hex; gripGlow?: Hex; animated?: boolean;
}
export interface HelmetLook {
  shell: 'dome' | 'visor' | 'bucket' | 'retro' | 'hardHat' | 'lantern' | 'bubble' | 'catEars' | 'petalRing' | 'wrapVisor';
  color: Hex; decal: 'none' | 'stickers' | 'stripe' | 'scuffs' | 'plaid' | 'innerEars' | 'ribs' | 'fish'
    | 'petals' | 'glyphScroll';
  decalColor: Hex; finish: 'matte' | 'gloss' | 'chrome' | 'emissive'; visorTint?: Hex; opacity?: number;
  fx: 'none' | 'emissiveDusk' | 'orbitFish' | 'petalShed' | 'glyphTrail' | 'earFlick';
}
export interface CosmeticItem {
  id: ItemId; slot: Slot; name: string; rarity: Rarity;
  source: 'starter' | 'shop' | 'level30';              // 'level30' = never in shop or crates
  theme?: AreaId;
  look: SkaterLook | BoardLook | HelmetLook;
}
export interface Loadout { skater: SkaterLook; board: BoardLook; helmet: HelmetLook }
export const SKIN_TONES: readonly Hex[] =
  [0xF6D7C3, 0xEBC1A0, 0xD9A27E, 0xC68863, 0xA86B4A, 0x8A5238, 0x6B3D2A, 0x4A2A1E];
