// tricks/defs.ts: the full trick tables (DESIGN §6.1, §6.1a, §6.2, §6.4, §13.1). GP owns this file from W1a.
// Rotation signs: roll + = kickflip direction, yaw + = backside (BS), pitch + = nose up (TECH §4.7).
import type { FlipDef, GrabDef, GrindDef, ManualDef, SpinDef, TrickTables } from '../core/tricks';

export const FLIPS: readonly FlipDef[] = [
  { id: 'popShuvit', name: 'Pop Shove-it', input: ['d'], upgradeOf: null, dur: 0.28, rot: { roll: 0, yaw: 180, pitch: 0 }, points: 100 },
  { id: 'kickflip', name: 'Kickflip', input: ['l'], upgradeOf: null, dur: 0.32, rot: { roll: 360, yaw: 0, pitch: 0 }, points: 150 },
  { id: 'heelflip', name: 'Heelflip', input: ['r'], upgradeOf: null, dur: 0.32, rot: { roll: -360, yaw: 0, pitch: 0 }, points: 150 },
  { id: 'impossible', name: 'Impossible', input: ['u'], upgradeOf: null, dur: 0.36, rot: { roll: 0, yaw: 0, pitch: 360 }, points: 200 },
  { id: 'shuvit360', name: '360 Shove-it', input: ['d', 'd'], upgradeOf: 'popShuvit', dur: 0.46, rot: { roll: 0, yaw: 360, pitch: 0 }, points: 200 },
  { id: 'varialKickflip', name: 'Varial Kickflip', input: ['dl'], upgradeOf: null, dur: 0.36, rot: { roll: 360, yaw: 180, pitch: 0 }, points: 250 },
  { id: 'varialHeelflip', name: 'Varial Heelflip', input: ['dr'], upgradeOf: null, dur: 0.36, rot: { roll: -360, yaw: -180, pitch: 0 }, points: 250 },
  { id: 'hardflip', name: 'Hardflip', input: ['ul'], upgradeOf: null, dur: 0.38, rot: { roll: 360, yaw: -180, pitch: 0 }, pitchArc: 70, points: 300 },
  { id: 'inwardHeelflip', name: 'Inward Heelflip', input: ['ur'], upgradeOf: null, dur: 0.38, rot: { roll: -360, yaw: 180, pitch: 0 }, points: 300 },
  { id: 'treFlip', name: '360 Flip', input: ['dl', 'dl'], upgradeOf: 'varialKickflip', dur: 0.50, rot: { roll: 360, yaw: 360, pitch: 0 }, points: 350 },
  { id: 'laserFlip', name: 'Laser Flip', input: ['dr', 'dr'], upgradeOf: 'varialHeelflip', dur: 0.52, rot: { roll: -360, yaw: -360, pitch: 0 }, points: 400 },
  { id: 'doubleKickflip', name: 'Double Kickflip', input: ['l', 'l'], upgradeOf: 'kickflip', dur: 0.56, rot: { roll: 720, yaw: 0, pitch: 0 }, points: 400 },
  { id: 'doubleHeelflip', name: 'Double Heelflip', input: ['r', 'r'], upgradeOf: 'heelflip', dur: 0.56, rot: { roll: -720, yaw: 0, pitch: 0 }, points: 400 },
  { id: 'tripleKickflip', name: 'Triple Kickflip', input: ['l', 'l', 'l'], upgradeOf: 'doubleKickflip', dur: 0.78, rot: { roll: 1080, yaw: 0, pitch: 0 }, points: 650 },
  { id: 'tripleHeelflip', name: 'Triple Heelflip', input: ['r', 'r', 'r'], upgradeOf: 'doubleHeelflip', dur: 0.78, rot: { roll: -1080, yaw: 0, pitch: 0 }, points: 650 },
];

export const SPINS: readonly SpinDef[] = [
  { id: 'fs180', name: 'FS 180', input: 'ur', upgradeOf: null, dur: 0.30, yaw: -180, points: 150 },
  { id: 'bs180', name: 'BS 180', input: 'ul', upgradeOf: null, dur: 0.30, yaw: 180, points: 150 },
  { id: 'fs360', name: 'FS 360', input: 'ur', upgradeOf: 'fs180', dur: 0.50, yaw: -360, points: 350 },
  { id: 'bs360', name: 'BS 360', input: 'ul', upgradeOf: 'bs180', dur: 0.50, yaw: 360, points: 350 },
];

export const GRINDS: readonly GrindDef[] = [
  { id: 'fiftyFifty', name: '50-50', input: [], contact: 'bothTrucks', slide: false, entry: 100, perSec: 150 },
  { id: 'fiveO', name: '5-0', input: ['d'], contact: 'backTruck', slide: false, entry: 100, perSec: 175 },
  { id: 'nosegrind', name: 'Nosegrind', input: ['u'], contact: 'frontTruck', slide: false, entry: 125, perSec: 175 },
  { id: 'boardslide', name: 'Boardslide', input: ['l'], contact: 'deck', slide: true, entry: 125, perSec: 175 },
  { id: 'lipslide', name: 'Lipslide', input: ['l', 'l'], contact: 'deck', slide: true, entry: 150, perSec: 200 },
  { id: 'noseslide', name: 'Noseslide', input: ['ul'], contact: 'deckNose', slide: true, entry: 150, perSec: 225 },
  { id: 'tailslide', name: 'Tailslide', input: ['dl'], contact: 'deckTail', slide: true, entry: 150, perSec: 225 },
  { id: 'feeble', name: 'Feeble', input: ['r'], contact: 'backTruck', slide: false, entry: 200, perSec: 250 },
  { id: 'smith', name: 'Smith', input: ['dr'], contact: 'backTruck', slide: false, entry: 200, perSec: 250 },
  { id: 'crooked', name: 'Crooked', input: ['ur'], contact: 'frontTruck', slide: false, entry: 200, perSec: 250 },
  { id: 'overcrook', name: 'Overcrook', input: ['ur', 'ur'], contact: 'frontTruck', slide: false, entry: 225, perSec: 275 },
  { id: 'bluntslide', name: 'Bluntslide', input: ['d', 'd'], contact: 'tailOver', slide: true, entry: 250, perSec: 300 },
  { id: 'noseBluntslide', name: 'Nosebluntslide', input: ['u', 'u'], contact: 'noseOver', slide: true, entry: 250, perSec: 300 },
];

export const MANUALS: readonly ManualDef[] = [
  { id: 'manual', name: 'Manual', entry: 75, perSec: 100 },
  { id: 'noseManual', name: 'Nose Manual', entry: 100, perSec: 125 },
];

export const GRABS: readonly GrabDef[] = [
  { id: 'indy', name: 'Indy Grab', entry: 100, perSec: 150, maxDur: 1.0 },
];

export const TRICK_TABLES: TrickTables = {
  flips: FLIPS, spins: SPINS, grinds: GRINDS, manuals: MANUALS, grabs: GRABS,
  ollie: { points: 50, minFactor: 0.5 },
};
