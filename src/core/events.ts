// core/events.ts (TECH §4.8). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
import type { V3 } from './math';
import type { AreaId, BonusId, CrashCause, CrateTier, EdgeMaterial, FlipId, GatewayId, GrabId, GrindId,
  HintId, ItemId, ManualId, PropKind, Rarity, ScreenId, SpinId, Surface, TrickId } from './ids';
import type { RunResult, SkaterMode } from './sim';

/** Sim events: emitted inside Sim.step in order, dispatched by the loop after the tick. Deterministic. */
export type GameEvent =
  | { t: 'runStart'; tick: number; seed: number; mode: 'lesson' | 'normal' }
  | { t: 'ollie'; tick: number; from: SkaterMode; linked: boolean }
  | { t: 'airborne'; tick: number; reason: 'pop' | 'rollOff' | 'grindEnd' }
  | { t: 'flipStart'; tick: number; id: FlipId; dur: number }
  | { t: 'flipUpgrade'; tick: number; from: FlipId; to: FlipId }
  | { t: 'spinStart'; tick: number; id: SpinId; dur: number; out: boolean }      // out = 180 Out from a grind
  | { t: 'spinUpgrade'; tick: number; from: SpinId; to: SpinId }
  | { t: 'revert'; tick: number }
  | { t: 'grabStart'; tick: number; id: GrabId } | { t: 'grabEnd'; tick: number; id: GrabId; dur: number }
  | { t: 'land'; tick: number; airT: number; dropH: number; quality: 'clean' | 'perfect' | 'sketchy'; surface: Surface }
  | { t: 'pickWindow'; tick: number; edgeId: number; open: boolean }
  | { t: 'grindStart'; tick: number; id: GrindId; edgeId: number; material: EdgeMaterial; perfect: boolean; transfer: boolean }
  | { t: 'grindSwitch'; tick: number; from: GrindId; to: GrindId }
  | { t: 'grindEnd'; tick: number; id: GrindId; dur: number; exit: 'end' | 'pop' }
  | { t: 'manualStart'; tick: number; kind: ManualId }
  | { t: 'manualEnd'; tick: number; kind: ManualId; dur: number; reason: 'budget' | 'pop' | 'bump' | 'release' }
  | { t: 'trickScored'; tick: number; id: TrickId; pts: number; factor: number; link: boolean;
      comboPts: number; links: number; seq: number }          // seq = index in combo (musical pitch)
  | { t: 'bonus'; tick: number; id: BonusId; name: string; pts: number }
  | { t: 'comboBanked'; tick: number; total: number; links: number; variety: number; coins: number;
      reason: 'window' | 'heat' | 'sketchy' | 'gateway'; durSec: number }
  | { t: 'comboLost'; tick: number; total: number }
  | { t: 'coin'; tick: number; id: number; value: 1 | 10; p: V3; chain: number }
  | { t: 'nearMiss'; tick: number; obstacleId: number; side: -1 | 1 }
  | { t: 'bump'; tick: number; side: -1 | 1; kind: PropKind | 'wall' }
  | { t: 'knock'; tick: number; obstacleId: number }
  | { t: 'hazardWarn'; tick: number; obstacleId: number; kind: PropKind; inSec: number }
  | { t: 'stairStep'; tick: number }
  | { t: 'surface'; tick: number; surface: Surface }
  | { t: 'areaEnter'; tick: number; area: AreaId; firstThisRun: boolean }
  | { t: 'gatewayEnter'; tick: number; gateway: GatewayId }
  | { t: 'landmark'; tick: number; name: string }
  | { t: 'bestPassed'; tick: number; dist: number }
  | { t: 'speedTier'; tick: number; tier: 0 | 1 | 2 | 3 }    // < 8.0 / ≥ 8.0 CRUISE / ≥ 9.0 FLOW / 10.5 FULL SEND (SPEED_TIERS)
  | { t: 'crash'; tick: number; cause: CrashCause; obstacleId: number | null; kind: PropKind | null; speed: number;
      state: SkaterMode; flipProgress: number; spinProgress: number; god?: boolean }   // god: logged, not applied
  | { t: 'rewind'; tick: number; toTick: number }
  | { t: 'runEnd'; tick: number; result: RunResult };

/** App events: UI/meta/platform. Not deterministic, never consumed by the sim. */
export type AppEvent =
  | { t: 'screen'; screen: ScreenId; from: ScreenId }
  | { t: 'pause' } | { t: 'resume' }
  | { t: 'hint'; hint: HintId; show: boolean }
  | { t: 'levelUp'; level: number }
  | { t: 'itemGranted'; id: ItemId; rarity: Rarity; duplicateCoins: number }
  | { t: 'coinsChanged'; coins: number; delta: number }
  | { t: 'crateShake'; n: 1 | 2 | 3 } | { t: 'crateReveal'; tier: CrateTier; rarity: Rarity; dup: boolean }
  | { t: 'purchase'; id: ItemId; price: number }
  | { t: 'settings'; key: string }
  | { t: 'ui'; sfx: 'tap' | 'back' | 'toggle' | 'error' }
  | { t: 'quality'; tier: 'low' | 'med' | 'high' }
  | { t: 'contextLost' } | { t: 'contextRestored' };
