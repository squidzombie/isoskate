// core/tricks.ts (TECH §4.7). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
import type { Dir8, FlipId, GrindId, ManualId, GrabId, SpinId } from './ids';
export interface FlipDef {
  id: FlipId; name: string;
  input: readonly Dir8[];             // e.g. ['dl','dl'] for treFlip
  upgradeOf: FlipId | null;           // repeat-swipe upgrade source (kickflip → doubleKickflip)
  dur: number;                        // seconds
  rot: { roll: number; yaw: number; pitch: number };   // degrees, signed (BS yaw +)
  pitchArc?: number;                  // degrees of transient pitch arc mid-flip (Hardflip 70)
  points: number;
}
export interface SpinDef {
  id: SpinId; name: string;
  input: Dir8;                        // 'ur' (FS) or 'ul' (BS); a repeat while < 60% done upgrades 180 → 360
  upgradeOf: SpinId | null;
  dur: number; yaw: number;           // 0.30 / 0.50 s; ±180 / ±360 deg
  points: number;                     // 150 / 350
}
export interface GrindDef {
  id: GrindId; name: string;
  input: readonly Dir8[];             // [] = default (50-50)
  contact: 'bothTrucks' | 'backTruck' | 'frontTruck' | 'deck' | 'deckNose' | 'deckTail' | 'tailOver' | 'noseOver';
  slide: boolean;                     // deck-scrape audio layer
  entry: number; perSec: number;
}
export interface ManualDef { id: ManualId; name: string; entry: number; perSec: number }
export interface GrabDef { id: GrabId; name: string; entry: number; perSec: number; maxDur: number }
export interface TrickTables {
  flips: readonly FlipDef[]; spins: readonly SpinDef[]; grinds: readonly GrindDef[]; manuals: readonly ManualDef[];
  grabs: readonly GrabDef[];
  ollie: { points: number; minFactor: number };
}
