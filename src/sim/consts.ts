// sim/consts.ts: the sim tunables now live in core/tuning.ts (moved @G0, docs/core-requests.md M0-sim section).
// Re-exported here so sim files and sim/index.ts keep their imports.
//   ROLL_OFF_DROP     ground falling away by more than this goes airborne 'rollOff' (TECH §6.3 step 5)
//   STICKY_DROP       a sticky slab (stairs / incline) is followed down by up to this much per tick
//   BUMP_WOBBLE       arm wobble (s) after a side bump (TECH §6.4); MANUAL_END_WOBBLE when a manual runs out of budget
//   COIN_VOLUME       coin pickup volume around the skater's centre (board bottom + 0.75 m), DESIGN §10.8
//   COIN_CHAIN_TICKS  coins picked up at most this many ticks apart count as one chain (the `coin` event's `chain`)
//   PICK_MISS_TICKS   air ticks an open grind pick window survives without a predicted capture (no flicker)
export { BUMP_WOBBLE, COIN_CHAIN_TICKS, COIN_VOLUME, MANUAL_END_WOBBLE, PICK_MISS_TICKS, ROLL_OFF_DROP, STICKY_DROP } from '../core/tuning';
