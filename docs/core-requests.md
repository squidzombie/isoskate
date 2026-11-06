# Core contract requests

`src/core/` is the frozen contract (TECH §4). Package agents never edit it. To request a change, append an entry to **your package's section only** (append-only; never edit another section). The integrator applies accepted requests at the next merge gate as additive changes where possible (new optional fields, new union members).

Entry format:

```
### <short title>   (status: open | accepted | rejected | applied @<gate>)
- File / symbol: core/<file>.ts › <Symbol>
- Change: <exact TypeScript you need>
- Why: <the behaviour it unblocks>
- Local workaround meanwhile: <extension type in your module, if any>
```

## INT (M0-core) fixes

- **§4 sketches compiled verbatim.** No typo fixes were needed: every TypeScript block in TECH §4.1–§4.12 is in `src/core/` unchanged (only the `/*…*/` bodies of `math`, `rng`, `tuning` and `bus` were filled in, and `Sfc32` got private state fields).
- **Added `core/decor.ts`** (SCHEDULE.md, TECH §4.14): `DECOR_KINDS` (with zone, areas, default `castShadow`, doc and per-param docs), `DecorKind`, `isDecorKind`, `DECOR_LIMITS`, `DECOR_BRANDS`, `NEON_SIGN_WORDS`, `DECOR_SURFACES`. `Decor.kind` in `core/world.ts` stays `string`.
- **Doc inconsistency, `speedAt(90)`.** ROADMAP G0 and DESIGN §11 print 8.99 m/s at t = 90 s. The frozen formula `7 + 3.5·smoothstep(20, 150, t)` gives **8.9516**, and it is the one every other number agrees with (`s(90) = 682`, 8.7 m/s at 1:23, 10.1 at 2:02, the closed-form `sAt`). The formula is kept; `tests/unit/core/tuning.test.ts` asserts 8.99 ± 0.05 and 8.9516 ± 0.0005. (Smootherstep would give 9.00 but breaks `sAt`.)
- **Bus semantics** (not specified in §4.8): typed listeners run in subscription order, then `onAny` listeners; unsubscribing during an emit is safe.
- **`hash32`** is murmur3_32 over int32 words with the fmix32 finalizer; inputs are truncated with `| 0`. Golden values are in `tests/unit/core/rng.test.ts`.

### Applied @m0-core (after the P1 review; additive, TECH §4 updated to match)
- `core/input.ts › InputSource.setSimpleTricks?(on)`: the Settings "Simple tricks" toggle (wiring calls it at boot and on every settings intent).
- `core/view.ts › SkaterView.setTurntable?(yawDeg)`: Locker drag (`UiIntent 'turntable'`, App accumulates `dYaw`) and shots `yaw`.
- `core/debug.ts › DebugAPI.renderAudio?(area, sec)`: shots `--audio`; wraps the new `audio/index.ts › renderOffline(area, sec): Promise<AudioBuffer | null>` (TECH §4.13; stub resolves null).
- `core/decor.ts`: the generic street kinds also list the four gateways; new kinds `food_cart` (Neon side band) and `bin_pair` (Suburbs side band).

### Hooks and behaviour the P2 packages can rely on (frozen for P2; change only through this file)
- **Audio layers:** `game/wiring.ts` calls `audio.roll(speed01, surface, airborne, manual)` and `audio.grind(active, material, slide)` every rendered frame. `speed01 = clamp(speed / V_MAX, 0, 1)`; both are silent (0 / inactive) off the run screen and after a crash. `material` comes from `sim.world.edge(grind.edgeId)`, `slide` from `TRICKS.grinds[].slide`.
- **Settings:** `UiIntent { k: 'settings', key, value }` writes `save.settings[key]` (known keys, same type only) and re-applies everything: sensitivity, key preset, Simple tricks, volumes, haptics, battery saver, `cameraRig.setReducedMotion(reducedMotion || !shake)`, analytics opt-out, quality (`?quality` wins; then the saved tier; `auto` = med on touch, high otherwise).
- **Screens:** `__skate.ui(screen, params)` → `App.open` (TECH §11.4 lists the params). Locker / Shop switch the skater to `showcase` and the camera to `locker`; `UiIntent 'preview'` tries an item on.
- **Rotate card:** a coarse-pointer phone in landscape (`CameraRig.solve().rotate`) pauses on the card at run start, on rotation and on Resume; rotating back shows the normal Pause (no auto-resume).
- **`DebugHost`** (`debug/api.ts`, built in `game/wiring.ts`): `sim`, `loop`, `startRun`, `camera`, `gfx`, `worldView`, `save`, `ui`, `audio`, `gameBus`, `appBus`, `input`, `cameraRig`, `skater`, `vfx`, `meta`, `app`, `renderAudio`, `setQuality`.
- **Camera rig:** keeps the public `last: Framing` (the eased framing used this frame; `__skate.camera()` reads it) and eases on game time, so `step(n)` frames like real-time play.
- **Module exports used by `game/` and `debug/`** (keep the names and signatures): `debug/bots` `BOTS`, `Bot { frame(sim) }`, `BotFactory (opts & { seed }) → Bot`, `BotKind`, `BotOptions`; `platform` `createBackGuard`, `onHide`, `createWakeLock`, `blurActive`, `installTouchHygiene`, `isTouchDevice`, `readFlags`; `gfx` `readViewport`, `onViewportChange`, `setGfxQuality`, `redrawCanvasTextures`, `colorBox`, `mergeAll`, `originOf`, `getSun`; `world/render` `solveFraming`.
- **Generator invariants encoded in `tests/e2e/smoke.spec.ts`** (M0-sim keeps them true): a straight run with no input slams (`crash.cause 'slam'`) before tick 400 for seeds 1–3 (the 3.5 s Roll-out chain, DESIGN §12.3), and `snapshot().nextObstacles` is non-empty at tick 600 of a god run (seed 1).
- **Tests:** `npm test` runs `tests/unit/**` and `tests/bots/quick*.test.ts` only; everything else in `tests/bots/` runs under `npm run test:bots` (`BOTS_RELEASE=1` with `--release`).

## M0-sim (sim/, tricks/, world/gen/ minimum, debug/bots/ SafeKey follower)

No contract change was needed: everything below is implemented inside sim/, tricks/, world/gen/ and debug/bots/.
The first block is the frozen behaviour later packages (GP, WG, WA, the bots) can rely on; the rest are open notes.

### Frozen M0 contact details the validator mirrors   (status: open, informational)
- File / symbol: sim/collide.ts, world/gen/validator/path.ts (TECH §6.4)
- Change: none. Details TECH §6.4 leaves implicit, now fixed in code and tests:
  - The inset is `min(FACE_INSET, extent / 4)` per axis, so a 0.05 m rail keeps a body (`insetOf`, exported from sim/index.ts).
  - Overlap uses the inset box. Skim compares the **true** top (`box.y1`) with the board bottom (`≤ STEP_UP`): a 0.19 m
    landable body slams, a 0.18 m one skims. A crash top slams whenever the board is below its inset top.
  - The first-contact axis is the one that started overlapping last (slab method, prev → cur): from above, lateral or
    frontal. Knock tops are knocked from every side.
  - In an air tick, capture is tested **before** collisions, so a board coming down onto a ledge or rail locks before
    it can touch the crash top.
  - Gravity is integrated exactly (`y += vy·DT − ½G·DT²`), so a flat ollie lasts 36 ticks (0.600 s), pop tick included.
  - A roll-off drop (a curb, a ledge end) keeps the link window running and does not refresh it on landing.
- Why: the validator's path check and the sim must agree to the centimetre.
- Local workaround meanwhile: n/a.

### SafeKey and WorldQuery semantics   (status: open, informational)
- File / symbol: core/world.ts › SafeKey, WorldQuery.groundAt
- Change: none (please copy into TECH §5.3 at G0).
  - SafeKeys are the vertices of the safe line in run time t, sorted by t, with x linear between consecutive keys.
    An `action: 'ollie'` key is the take-off: tap on the tick whose time is nearest `key.t`. There is a key at every
    vertex and at least every 0.5 s. Segment boundaries repeat the boundary key, with the same x.
  - `groundAt` returns the highest slab top `≤ yMax`. If no slab covers the point it returns the pit at lip level, or
    else the implicit street datum (y = 0, 'asphalt'). M0 emits sidewalk slabs (+0.15) but no road slab.
- Why: bots, the debug overlay and coins read keys this way, and GP's fixture worlds need the same ground rules.
- Local workaround meanwhile: n/a.

### Pits and trench planks must be drawn   (status: open, for M0-io / WA)
- File / symbol: world/render (grey-box chunk builder) › Obstacle.pits
- Change: none to core. S_TRENCH emits `kind: 'trench'` with three `pits` (road lip 0, sidewalk lips 0.15). It also
  emits one 1.2 m plank slab at y = 0 (surface 'wood') and `params { plankX, plankW, depth }`, and cuts the sidewalk
  slabs over the trench. S_BARRIER may carry `params { slotX, slotW }` with two solids.
- Why: the M0-core view draws nothing for pits, so a trench on the road is invisible (it is still fair in the sim and
  the validator, but a crash there would not feel deserved). Please draw the pit (dark, with chevrons) and the plank.
- Local workaround meanwhile: none in my folders. The trench is announced by `hazardWarn` 1.6 s ahead.

### A1/A2 stand-in, GenStats timing, Lesson mode   (status: open, for WG)
- File / symbol: world/gen/schedule.ts, gen.config.ts › GEN.gate; core/world.ts › GenStats.msPerSegment
- Change: none.
  - Instead of A1 column fillers, M0 forces an S_GATE every `GEN.gate.period` seconds of non-T0 time (5.5 / 5.5 / 4.5 / 4 s).
    Its opening is ≥ 3 m from the previous safe x and ≥ 2.4 m from every opening of the previous gate, so no straight
    lane passes two gates in a row. WG replaces this with A1 fillers.
  - `msPerSegment` stays 0, because world/gen may not read clocks. The loop or a bench measures it.
  - `mode: 'lesson'` plays the Roll-out like a normal run (the Lesson Line is WG's).
- Why: hand-off for W1b.
- Local workaround meanwhile: n/a.

## M0-io (input/, platform/, ui/ debug HUD, world/render/ grey-box, gfx/ additions, debug/ api, shots, e2e)

## GP: Gameplay (W1a)

## WG: World-gen (W1b)

## WA: World art (W2a)

## SK: Skater and cosmetics (W2b)

## MU: Meta and UI (W3a)

## AU: Audio (W3b)
