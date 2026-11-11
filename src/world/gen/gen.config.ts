// world/gen/gen.config.ts: every generator tunable (DESIGN §10, §11, §22). Fairness floors (R_MIN, height bands,
// look-ahead, the validator's reach and margins) live in core/tuning.ts; this file holds the difficulty curve, the
// anti-straight periods, template weights and placement rates. WG owns it.
// Density figures are targets for measured outputs (DESIGN §11: ±25 %); the floors are hard rules.
import type { AreaId } from '../../core/ids';

export type PhaseId = 'opening' | 'warm' | 'build' | 'plateau';
export type Tier = 0 | 1 | 2 | 3 | 4;

/** Difficulty phases by run time (DESIGN §11). */
export const PHASES: readonly { id: PhaseId; t0: number }[] = [
  { id: 'opening', t0: 0 }, { id: 'warm', t0: 45 }, { id: 'build', t0: 90 }, { id: 'plateau', t0: 150 },
];

export const GEN = {
  /** Tier weights per phase (DESIGN §11). The opening is T1 only (A2 wander gates are scheduled on top). */
  tierWeights: {
    opening: [[1, 1]], warm: [[1, 60], [2, 40]], build: [[1, 25], [2, 50], [3, 25]],
    plateau: [[1, 15], [2, 40], [3, 35], [4, 10]],
  } as Record<PhaseId, readonly (readonly [Tier, number])[]>,
  /** Template weights inside a drawn tier (area templates and the shared ones; DESIGN §10.4 v1 set). A template is
   *  only drawn in its own area (shared ones anywhere) and at its tiers. */
  weights: {
    S_CONES: 1.0, S_TRENCH: 0, S_BARRIER: 0, S_LADDER: 1.2, S_GATE: 0.6, S_PADS: 1.0, S_STAIRS: 0.8,
    DT_LEDGE: 3, DT_BENCHES: 2.5, DT_PLANTERS: 2.5, DT_TERRACE: 1.5, DT_RUSH: 1.2, DT_BIG7: 1.2,
    SB_WALL: 3, SB_HILL: 0, SB_DRIVEWAYS: 3.5, SB_BINDAY: 2.5, SB_PICKET: 2.5, SB_SCOOPS: 2,
    IN_BEAM: 3, IN_LIP: 3, IN_PALLETS: 2.5, IN_CHANNEL: 2.5, IN_DOCK_UP: 2, IN_GAUNTLET: 2,
    NE_RAIL: 3, NE_PILLARS: 2.5, NE_VENDING: 2.5, NE_SAKURA: 2.5, NE_SKYWALK: 1.6, NE_GAUNTLET: 2,
    // Phase B parked rows (THEME §3.4, theme T8): occasional set pieces since "where they stopped" (no car quota).
    DT_PARKED_ROW: 2, SB_DRIVEWAY_ROW: 1.5, IN_LOADING_ROW: 3, NE_TAXI_RANK: 2,
  } as Record<string, number>,
  /** Theme T8 "where they stopped" (rows.ts): what fills an anti-straight row. A block of the street (`block` m) has a
   *  mood hashed from the seed (quiet / normal / busy at `moods`), which sets the chance `pVeh` (× the area's `areaVeh`)
   *  that a road part tries its vehicle recipes first. The run's first `openingBusy` m after the Roll-out are at least
   *  `firstVeh` (the first rows show the street as it was left). An either-side fork (two openings on the sidewalks,
   *  two stopped cars between them) at `either[tier]` when the line is near the centre (|x0| ≤ eitherX0) and fast
   *  (v ≥ eitherV). A vehicle outside the approach's columns stands `stagger` m earlier (never abreast); kit pieces
   *  stand 0–`jitter` m later. `openPrefer`: an opening centre is drawn by how naturally its row closes (`fit`, below;
   *  the A2 order unchanged). Kill switches: either → 0, stagger[1] → 1.2, openPrefer → false (uniform centres). */
  rows: {
    block: 120, moods: [['quiet', 0.3], ['normal', 0.5], ['busy', 0.2]] as readonly (readonly ['quiet' | 'normal' | 'busy', number])[],
    pVeh: { quiet: 0.3, normal: 0.6, busy: 0.9 } as Readonly<Record<'quiet' | 'normal' | 'busy', number>>,
    areaVeh: { downtown: 1, suburbs: 0.8, neon: 0.7, docks: 0.5 } as Readonly<Record<AreaId, number>>,
    openingBusy: 150, firstVeh: 0.9,
    either: { 2: 0.25, 3: 0.35 } as Partial<Record<Tier, number>>, eitherX0: 0.5, eitherV: 8,
    stagger: [1.2, 2.4] as readonly [number, number], jitter: 0.2, openPrefer: true as boolean,
    /** A second vehicle in a row, off every route, stands at least this far (m, along s) from the others when it can:
     *  two cars passing in opposite lanes, not abreast (rows.ts stagger; the s0 floor stays the fallback). */
    apart: 2.2,
    /** The weight of an opening centre (rows.ts rowCloses) by the most natural fill of each road part it leaves, per
     *  block mood. `clear`: kerb kit only (bins out, a café set in a bay); `one`: one vehicle in its lane or at the
     *  kerb, the kit beside it; `pair`: two side by side in opposite lanes; `mid`: a car across the centre line (alone
     *  or double-parked). A centre whose road needs the mixed kit (street furniture in the middle of the road, the
     *  worst look) weighs `fitMixed`. A quiet block keeps its road clear where the move allows, a busy one stops a car
     *  in it; a pair or a car mid-street only where the move leaves nothing else. A fill that repeats the last two
     *  rows' scene × `fitAgain`; one whose vehicles stand on the side the last two rows' did, or a 2-vehicle row after
     *  one, × `fitHist`; a car mid-street within `midEvery` rows of the last × `fitMidAgain`; two road parts with
     *  vehicles (a squeeze) × `fitHist`, twice when one stood in the last 3 rows. */
    fit: {
      quiet: { clear: 80, one: 8, pair: 3, mid: 1.25 },
      normal: { clear: 12, one: 24, pair: 4, mid: 1.25 },
      busy: { clear: 2, one: 24, pair: 12, mid: 1.5 },
    } as Readonly<Record<'quiet' | 'normal' | 'busy', Readonly<Record<'clear' | 'one' | 'pair' | 'mid', number>>>>,
    fitMixed: 0.5, fitAgain: 0.08, fitHist: 0.25, fitMidAgain: 0.85,
    /** A single opening centred beyond farOpen[0] (rider on the far sidewalk ≥ 2 s from it: rule h mostly rejects the
     *  row) weighs × farOpen[1]. */
    farOpen: [3.05, 0.5] as readonly [number, number],
    /** A single opening whose next row's forced move (2.8–3.7 m) only reaches openings a car across the centre line
     *  closes weighs × midNext (rows.ts midNext: the one-row look-ahead that keeps mid-street cars rare). */
    midNext: 0.3,
    /** A road part tries the kerb before the lane at this chance; a vehicle at the kerb weighs kerbW8 in its class. */
    kerbFirst: 0.65, kerbW8: 2.5,
    /** A car stopped mid-street (across the centre line, alone or double-parked; rows.ts) in at most 1 row in
     *  midEvery, or when nothing else closes the road (before street furniture in the middle of the road). */
    midEvery: 8,
    /** A vehicle centred within this of the street's centre stands in the middle, on neither side (the same-side rule,
     *  the row signature). */
    sideNeutral: 0.5,
    /** Docks: the van_across at the loading entrance (≤ 1 per visit): chance per eligible row. */
    van: 0.5,
  },
  /** Area breathers drawn instead of S_OPEN when a breather is due (SB_HILL in the Suburbs). */
  breatherTemplate: { suburbs: 'SB_HILL' } as Partial<Record<AreaId, string>>,
  /** A1 column rule (DESIGN §10.7; measured, the rows of rows.ts carry the straight-bot guarantee): 0.5 m columns, and
   *  the period a column should meet a tall blocker in (non-T0 time). */
  a1: { period: { opening: 8, warm: 6, build: 5, plateau: 4 } as Record<PhaseId, number>, colW: 0.5 },
  /** A2 wander rule: the safe line shifts ≥ 3 m at least once per period (same periods as A1); a template that would
   *  leave the period without one gets a 6 m wander wall when it fits (generator.ts). */
  a2: { shift: 3.0, period: { opening: 8, warm: 6, build: 5, plateau: 4 } as Record<PhaseId, number> },
  /** A3: a full-width hazard (S_BARRIER / S_TRENCH area skin) every [min, max] seconds of non-T0 time. */
  a3: { opening: [12, 16], other: [8, 12] } as Record<'opening' | 'other', readonly [number, number]>,
  /** A3 is due (never before its minimum) when less than this much A-time is left to its maximum: a drawn template
   *  (≤ ~3.6 s) would overrun it, and the hazard itself stands ~1 s into its own template. */
  a3Lead: 4.6,
  /** Share of the A3 slots that are an S_TRENCH (with GEN_FLAGS.trench; the rest are S_BARRIER), and of the Neon A3 slots
   *  from T3 on that are an NE_GAUNTLET (its holo gate is the hazard). */
  a3Trench: 0.5, a3Gauntlet: 0.35,
  /** Each area's landmark template, drawn landmarkBoost× more often until it has appeared in the current visit. */
  landmarks: { downtown: 'DT_BIG7', suburbs: 'SB_SCOOPS', docks: 'IN_LIP', neon: 'NE_SKYWALK' } as Record<AreaId, string>,
  landmarkBoost: 4,
  /** Before a gateway (T0: the A-clock pauses) the last slot that fits the hazard takes it when its maximum would come
   *  within this much A-time after the gateway; such a slot needs `preGwLeft` s left in the visit and may come up to
   *  `preGwEarly` s before the A3 minimum. */
  a3PreGw: 2.6, a3PreGwLeft: 9.0, a3PreGwEarly: 2.5,
  /** The line enters a gateway within ±this x (its corridor; gateways are T0). The Docks lip starts lipLead s into a
   *  visit (a line still by the right wall after the gateway steers off it first). */
  gwEntry: 2.5, lipLead: 1.8,
  /** GW_harborBridge deck (DESIGN §12.2): incline from `lead` s in, deck to `exitSec`·v before the gateway ends, ≥ minDeck m. */
  harborBridge: { lead: 0.4, exitSec: 0.6, minDeck: 4 },
  /** S_GATE (DESIGN §10.4): openings 2.5 / 2.2 / 2.0 m by tier, ≥ 3 m (≤ 4.0 m) from the line's x when it moves. */
  gate: { width: { 0: 2.5, 1: 2.5, 2: 2.5, 3: 2.2, 4: 2.0 } as Record<Tier, number>, maxC: 3.3, shift: [2.8, 3.7] as readonly [number, number],
    second: { 2: 0.6, 3: 0.3 } as Partial<Record<Tier, number>>, secondOff: [3.6, 6.6] as readonly [number, number],
    /** The gate segment starts this long before its row (head window + a 3 m move). */
    lead: 2.3,
    /** Extra time a row leaves for the move to its opening beyond T_SHIFT (a human thumb's latency and ease-in). */
    moveSlack: 0.3,
    /** A template ending later than (deadline − lead − hostAhead) stands the row itself (the next one would be late). */
    hostAhead: 1.4,
    /** S_GATE approach trick line: chance, and its end ≥ this many seconds before the row; each re-roll stands the
     *  row retryLate s later. */
    feature: 0.95, featureGap: 1.3, retryLate: 0.3,
    /** (G1 flow) Chance of a manual pad in the opening's lane ending padGap s before the
     *  row (its curb edges' exit zones and rail-end lanes stay clear of the row), at most padSec[1] s long (≥ 3 m). */
    pad: 0.9, padGap: 1.02, padSec: [0.3, 0.6] as readonly [number, number],
    /** After a gate the fallback could not stand, the row deadline moves to its end + lead + this. */
    fallbackDefer: 1.0,
    /** A gate carries the A3 barrier only when the line enters within ±a3MaxX (not from the sidewalk edge). */
    a3MaxX: 3.4,
    /** A rider leaving a template's grind edge (within ±edgeSide of it) reaches a row's opening T_SHIFT + edgeLand s
     *  after the edge ends. */
    edgeLand: 0.5, edgeSide: 0.8,
    /** Anti-straight rows (straight-bot guarantees, rows.ts): every row's lanes are disjoint (≥ apartPad) from the
     *  previous row's, so a straight lane passes at most one of two consecutive rows. Consecutive rows are ≤ `gap`
     *  apart and every second row ≤ `window` after the one two before (run time, T0 stretches included). */
    gap: { opening: 8.0, warm: 6.3, build: 6.3, plateau: 6.3 } as Record<PhaseId, number>,
    window: { opening: 16.0, warm: 12.6, build: 12.6, plateau: 12.6 } as Record<PhaseId, number>,
    apartPad: 0.06,
    /** Rows overlaid on a template at its own line: candidate slots tried (each costs one validation); the line counts
     *  as steady at a slot when it stays within this x over [−0.45, +0.15] s around it. */
    overlayTries: 2, steady: 0.25,
    /** Template obstacles beside a row: the row's pieces keep this far from their solids (grind sweeps). */
    keepPad: 0.3,
    /** No base curb / lip edge ends in this many seconds before a row (its exit zone would face the row). */
    edgeBan: 3.0,
    /** A tail row (after a template's content) stands ≥ this long after the template's last grind edge ends (its exit
     *  zone and rail-end lane), and leaves this much room before a gateway (the cut-down filler). */
    edgeClear: 1.15, tailRoom: 0.8,
    /** ... and ends ≥ tailA3Room s of A-time before the A3 maximum (the next segment can still carry the hazard). */
    tailA3Room: 2.6,
    /** Planning: the shortest gate segment. A gate segment carries the A3 hazard too (both due) only after this
     *  many seconds of a run's clock (its first rows must stand on time). */
    fit: 2.9, combineAfter: 12,
    /** A template longer than the room before the row (+ slipPad) slips the row deadline (schedule.ts), only with
     *  slipGwRoom s to spare before the next gateway. */
    slipPad: 0.3, slipGwRoom: 2.0 },
  /** (G1 flow) A single-element template's second beat (templates/util.ts secondBeat): chance, kind weights per area,
   *  start after the main element's end (s): a pad at once, a bench / flat bar to the side a little later. */
  beat: { chance: 0.7, padAfter: [0.25, 0.45] as readonly [number, number], sideAfter: [0.35, 0.6] as readonly [number, number],
    kinds: {
      downtown: [['pad', 1], ['bench', 1.5], ['flatbar', 1]], suburbs: [['pad', 1.5], ['flatbar', 1]],
      docks: [['pad', 1], ['flatbar', 1.5]], neon: [['pad', 1], ['bench', 1], ['flatbar', 1]],
    } as Record<AreaId, readonly (readonly ['pad' | 'bench' | 'flatbar', number])[]> },
  /** (G1 flow) A3 hazards land into a manual pad: chance, start after the landing (s), length (s·v, 3–6 m). */
  landPad: { chance: 0.5, after: 0.25, sec: [0.4, 0.55] as readonly [number, number] },
  /** S_TRENCH: gap per tier (s·v, DESIGN §10.3 0.25 / 0.30 / 0.35) and the plank offset from the safe x per tier. */
  trench: { gapSec: { 0: 0.25, 1: 0.25, 2: 0.30, 3: 0.33, 4: 0.33 } as Record<Tier, number>,
    plankOff: { 0: [0, 1], 1: [0, 1], 2: [1, 2], 3: [1.5, 2.5], 4: [1.5, 2.5] } as Record<Tier, readonly [number, number]>, depth: 0.6 },
  /** Breathers (S_OPEN, T0) per phase: `every` seconds after the last breather or gateway, lasting `dur` (DESIGN §11;
   *  gateways count). G1 flow: a 35 s visit gets one breather near its middle (no breather ever runs straight into a
   *  gateway: ≥ breatherGwGap s of street between them), so no gap between breathers exceeds ~20 s and no stretch of
   *  empty road is longer than one breather; breathers are 0.5–1.5 s shorter than DESIGN §11's first numbers. */
  breather: { warm: { every: [16, 20], dur: 3.5 }, build: { every: [16, 20], dur: 3.5 }, plateau: { every: [16, 20], dur: 3.5 } } as
    Partial<Record<PhaseId, { every: readonly [number, number]; dur: number }>>,
  breatherGwGap: 8,
  /** S_OPEN length when drawn freely, the shortest cut-down filler (DESIGN §10.5), the optional flat bar's chance, and
   *  the shortest breather that carries it too (G1 flow). */
  open: { dur: [3, 5] as readonly [number, number], minFiller: 0.6, flatbar: 0.75, breatherBar: 3.4 },
  /** Re-rolls before the constructive fallback (DESIGN §10.6.7); from `easyFrom` on the template drops its hardest
   *  element. */
  rerolls: 6, easyFrom: 4,
  /** Shortest time left before a gateway in which a template is tried (else a cut-down S_OPEN fills it). */
  minTemplateSec: 1.9,
  /** No required action in the first / last seconds of a template (DESIGN §10.5). */
  noActionHead: 0.6, noActionTail: 0.4,
  /** First required action after a startT spawn (seconds). */
  spawnGrace: 1.5,
  /** Datum (DESIGN §10.10): net elevation within ±2.4 m; S_INCLINE_UP pays a drop back with ≤ 15 s of the area left,
   *  and a full-width drop is drawn only when that payback still fits before the area ends. */
  datum: { min: -2.4, paybackSec: 15, dropRoomSec: 22, slope: 0.1 },
  /** Downtown: every 3rd segment is a curb-free granite plaza (DESIGN §10.2). Suburbs: driveway cuts every 1.5–2 s. */
  plazaEvery: 3, driveway: { every: [1.5, 2.0] as readonly [number, number], w: 3.0, hazardClear: 1.6 },
  /** Decor across the road (m between): Neon lantern strings, Suburbs overhead wires (with their poles). Sparse, so the
   *  read of the street stays on the ground plane (G1 owner playtest: Neon overhead clutter; was 26 / 32 m). */
  decorOverhead: { neonLanterns: 48, suburbsWires: 40 },
  /** RECLAIM decor (theme §4, §6; T3). Spacings in m along s (×0.7–1.3 jitter), chances per segment unless noted.
   *  Neon is net-negative near the corridor: 40% of the blade signs at |x| < 6 are not emitted and 70% of the rest are
   *  live (出口 and 薬局 never). One vista and at most one animal per area visit, `vistaSec` / `wildlifeSec` into it. */
  reclaim: {
    neonSignCut: 0.4, signLive: 0.7, vistaSec: 12, wildlifeSec: 20, leafyCaster: 0.5,
    grass: { downtown: 5, suburbs: 4.5, docks: 7 } as Readonly<Partial<Record<AreaId, number>>>,
    weeds: { downtown: 10, suburbs: 9, docks: 14, neon: 12 } as Readonly<Record<AreaId, number>>,
    shrub: { downtown: 12, suburbs: 9, docks: 16 } as Readonly<Partial<Record<AreaId, number>>>,
    sapling: 0.3, cart: 0.12, moss: 0.5, birds: 0.6,
    /** Critters per area: [species, rate per second on screen] (0 butterflies, 1 seeds, 2 moths, 3 dragonflies). */
    critters: { downtown: [0, 0.4], suburbs: [0, 0.5], docks: [3, 0.3], neon: [2, 0.4] } as Readonly<Record<AreaId, readonly [number, number]>>,
    drips: 3, leafRate: 3,
  },
  /** Coins (DESIGN §10.8). Gold Stacks on hard lines from T3 (and transfers, high rails, Neon elevated). */
  coins: { stringSec: 0.12, stringMin: 5, stringMax: 8, edgeUp: 0.35, arcUp: 0.25, padUp: 0.35, groundY: 0.5,
    breatherAmp: 1.4, waveCount: 4, goldFromTier: 3 },
} as const;

/** Generator switches, read once per Generator (at createWorldGen). Mutable on purpose: tests force both settings.
 *  - trench: S_TRENCH in the A3 slots (and Lesson Line pit). ON since G0: the views draw `Obstacle.pits` and planks.
 *    Off, every A3 slot is an S_BARRIER and the Lesson Line's trench becomes a barrier (docs/core-requests.md). */
export const GEN_FLAGS: { trench: boolean } = { trench: true };
