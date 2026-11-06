// sim/consts.ts: the sim tunables that belong in core/tuning.ts (DESIGN §22: movement and physics) but are not in the
// frozen contract yet. Requested in docs/core-requests.md (M0-sim section): the integrator moves them into
// core/tuning.ts at G0 (additive); until then this file is their single home, re-exported by sim/index.ts.

/** Ground falling away by more than this goes airborne 'rollOff' (TECH §6.3 step 5). */
export const ROLL_OFF_DROP = 0.05;
/** A sticky slab (stairs / incline) is followed down by up to this much per tick (10-stair at 10.5 m/s ≈ 0.10). */
export const STICKY_DROP = 0.3;
/** Arm wobble (s) after a side bump (TECH §6.4) and when a manual runs out of budget (DESIGN §6.4). */
export const BUMP_WOBBLE = 0.3, MANUAL_END_WOBBLE = 0.3;
/** Coin pickup volume around the skater's centre (board bottom + 0.75 m), DESIGN §10.8. */
export const COIN_VOLUME = { lat: 0.3, fwd: 0.4, vert: 0.7, centreUp: 0.75 } as const;
/** Coins picked up at most this many ticks apart count as one chain (the `coin` event's `chain`). */
export const COIN_CHAIN_TICKS = 30;
/** Air ticks an open grind pick window survives without a predicted capture (hysteresis: the tell never flickers). */
export const PICK_MISS_TICKS = 3;
