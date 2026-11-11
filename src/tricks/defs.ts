// tricks/defs.ts: the full trick tables (DESIGN §6.1, §6.1a, §6.2, §6.4, §13.1). GP owns this file from W1a.
// Rotation signs: roll + = kickflip direction, yaw + = backside (BS), pitch + = nose up (TECH §4.7).
// Every point value comes from tricks/score.config.ts POINTS (DESIGN §22: score.config holds every scoring number).
import type { FlipDef, GrabDef, GrindDef, ManualDef, SpinDef, TrickTables } from '../core/tricks';
import { POINTS } from './score.config';

const P = POINTS;

export const FLIPS: readonly FlipDef[] = [
  { id: 'popShuvit', name: 'Pop Shove-it', input: ['d'], upgradeOf: null, dur: 0.28, rot: { roll: 0, yaw: 180, pitch: 0 }, points: P.flips.popShuvit },
  { id: 'kickflip', name: 'Kickflip', input: ['l'], upgradeOf: null, dur: 0.32, rot: { roll: 360, yaw: 0, pitch: 0 }, points: P.flips.kickflip },
  { id: 'heelflip', name: 'Heelflip', input: ['r'], upgradeOf: null, dur: 0.32, rot: { roll: -360, yaw: 0, pitch: 0 }, points: P.flips.heelflip },
  { id: 'impossible', name: 'Impossible', input: ['u'], upgradeOf: null, dur: 0.36, rot: { roll: 0, yaw: 0, pitch: 360 }, points: P.flips.impossible },
  { id: 'shuvit360', name: '360 Shove-it', input: ['d', 'd'], upgradeOf: 'popShuvit', dur: 0.46, rot: { roll: 0, yaw: 360, pitch: 0 }, points: P.flips.shuvit360 },
  { id: 'varialKickflip', name: 'Varial Kickflip', input: ['dl'], upgradeOf: null, dur: 0.36, rot: { roll: 360, yaw: 180, pitch: 0 }, points: P.flips.varialKickflip },
  { id: 'varialHeelflip', name: 'Varial Heelflip', input: ['dr'], upgradeOf: null, dur: 0.36, rot: { roll: -360, yaw: -180, pitch: 0 }, points: P.flips.varialHeelflip },
  { id: 'hardflip', name: 'Hardflip', input: ['ul'], upgradeOf: null, dur: 0.38, rot: { roll: 360, yaw: -180, pitch: 0 }, pitchArc: 70, points: P.flips.hardflip },
  { id: 'inwardHeelflip', name: 'Inward Heelflip', input: ['ur'], upgradeOf: null, dur: 0.38, rot: { roll: -360, yaw: 180, pitch: 0 }, points: P.flips.inwardHeelflip },
  { id: 'treFlip', name: '360 Flip', input: ['dl', 'dl'], upgradeOf: 'varialKickflip', dur: 0.50, rot: { roll: 360, yaw: 360, pitch: 0 }, points: P.flips.treFlip },
  { id: 'laserFlip', name: 'Laser Flip', input: ['dr', 'dr'], upgradeOf: 'varialHeelflip', dur: 0.52, rot: { roll: -360, yaw: -360, pitch: 0 }, points: P.flips.laserFlip },
  { id: 'doubleKickflip', name: 'Double Kickflip', input: ['l', 'l'], upgradeOf: 'kickflip', dur: 0.56, rot: { roll: 720, yaw: 0, pitch: 0 }, points: P.flips.doubleKickflip },
  { id: 'doubleHeelflip', name: 'Double Heelflip', input: ['r', 'r'], upgradeOf: 'heelflip', dur: 0.56, rot: { roll: -720, yaw: 0, pitch: 0 }, points: P.flips.doubleHeelflip },
  { id: 'tripleKickflip', name: 'Triple Kickflip', input: ['l', 'l', 'l'], upgradeOf: 'doubleKickflip', dur: 0.78, rot: { roll: 1080, yaw: 0, pitch: 0 }, points: P.flips.tripleKickflip },
  { id: 'tripleHeelflip', name: 'Triple Heelflip', input: ['r', 'r', 'r'], upgradeOf: 'doubleHeelflip', dur: 0.78, rot: { roll: -1080, yaw: 0, pitch: 0 }, points: P.flips.tripleHeelflip },
];

export const SPINS: readonly SpinDef[] = [
  { id: 'fs180', name: 'FS 180', input: 'ur', upgradeOf: null, dur: 0.30, yaw: -180, points: P.spins.fs180 },
  { id: 'bs180', name: 'BS 180', input: 'ul', upgradeOf: null, dur: 0.30, yaw: 180, points: P.spins.bs180 },
  { id: 'fs360', name: 'FS 360', input: 'ur', upgradeOf: 'fs180', dur: 0.50, yaw: -360, points: P.spins.fs360 },
  { id: 'bs360', name: 'BS 360', input: 'ul', upgradeOf: 'bs180', dur: 0.50, yaw: 360, points: P.spins.bs360 },
];

export const GRINDS: readonly GrindDef[] = [
  { id: 'fiftyFifty', name: '50-50', input: [], contact: 'bothTrucks', slide: false, entry: P.grinds.fiftyFifty[0], perSec: P.grinds.fiftyFifty[1] },
  { id: 'fiveO', name: '5-0', input: ['d'], contact: 'backTruck', slide: false, entry: P.grinds.fiveO[0], perSec: P.grinds.fiveO[1] },
  { id: 'nosegrind', name: 'Nosegrind', input: ['u'], contact: 'frontTruck', slide: false, entry: P.grinds.nosegrind[0], perSec: P.grinds.nosegrind[1] },
  { id: 'boardslide', name: 'Boardslide', input: ['l'], contact: 'deck', slide: true, entry: P.grinds.boardslide[0], perSec: P.grinds.boardslide[1] },
  { id: 'lipslide', name: 'Lipslide', input: ['l', 'l'], contact: 'deck', slide: true, entry: P.grinds.lipslide[0], perSec: P.grinds.lipslide[1] },
  { id: 'noseslide', name: 'Noseslide', input: ['ul'], contact: 'deckNose', slide: true, entry: P.grinds.noseslide[0], perSec: P.grinds.noseslide[1] },
  { id: 'tailslide', name: 'Tailslide', input: ['dl'], contact: 'deckTail', slide: true, entry: P.grinds.tailslide[0], perSec: P.grinds.tailslide[1] },
  { id: 'feeble', name: 'Feeble', input: ['r'], contact: 'backTruck', slide: false, entry: P.grinds.feeble[0], perSec: P.grinds.feeble[1] },
  { id: 'smith', name: 'Smith', input: ['dr'], contact: 'backTruck', slide: false, entry: P.grinds.smith[0], perSec: P.grinds.smith[1] },
  { id: 'crooked', name: 'Crooked', input: ['ur'], contact: 'frontTruck', slide: false, entry: P.grinds.crooked[0], perSec: P.grinds.crooked[1] },
  { id: 'overcrook', name: 'Overcrook', input: ['ur', 'ur'], contact: 'frontTruck', slide: false, entry: P.grinds.overcrook[0], perSec: P.grinds.overcrook[1] },
  { id: 'bluntslide', name: 'Bluntslide', input: ['d', 'd'], contact: 'tailOver', slide: true, entry: P.grinds.bluntslide[0], perSec: P.grinds.bluntslide[1] },
  { id: 'noseBluntslide', name: 'Nosebluntslide', input: ['u', 'u'], contact: 'noseOver', slide: true, entry: P.grinds.noseBluntslide[0], perSec: P.grinds.noseBluntslide[1] },
];

export const MANUALS: readonly ManualDef[] = [
  { id: 'manual', name: 'Manual', entry: P.manuals.manual[0], perSec: P.manuals.manual[1] },
  { id: 'noseManual', name: 'Nose Manual', entry: P.manuals.noseManual[0], perSec: P.manuals.noseManual[1] },
];

export const GRABS: readonly GrabDef[] = [
  { id: 'indy', name: 'Indy Grab', entry: P.grabs.indy.entry, perSec: P.grabs.indy.perSec, maxDur: P.grabs.indy.maxDur },
];

export const TRICK_TABLES: TrickTables = {
  flips: FLIPS, spins: SPINS, grinds: GRINDS, manuals: MANUALS, grabs: GRABS,
  ollie: { points: P.ollie, minFactor: P.ollieMinFactor },
};
