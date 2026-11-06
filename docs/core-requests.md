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

## M0-io (input/, platform/, ui/ debug HUD, world/render/ grey-box, gfx/ additions, debug/ api, shots, e2e)

## GP: Gameplay (W1a)

## WG: World-gen (W1b)

## WA: World art (W2a)

## SK: Skater and cosmetics (W2b)

### Shared crash-desaturation uniform for the skater materials   (status: open)
- File / symbol: gfx/index.ts (INT/WA) › a shared `{ uDesat: IUniform<number> }` (DESIGN §18.8 "40% desaturate through a shared material uniform").
- Change: `export function sharedUniforms(ctx: GfxContext): { uDesat: IUniform<number> }` (one object per context).
- Why: the skater's toon materials patch their shaders (skater/materials.ts); with the shared uniform they would desaturate with the world during the crash slow-mo instead of staying fully saturated.
- Local workaround meanwhile: none (the skater stays saturated during a crash).

### Vfx emitter for the legendary effects   (status: open, M5 stretch)
- File / symbol: core/view.ts › Vfx
- Change: `emit?(kind: 'steam' | 'leaves' | 'petals' | 'glyphs' | 'lightTrail', p: { s: number; x: number; y: number }, n?: number): void`
- Why: TECH §8.5 routes legendary particles through vfx/ (Kettle's steam puffs on landings, Gus's leaf trail, Sunflower's petal shed, Holo Visor's glyph trail, Golden Hour's light trail). The skater knows when and where; vfx/ owns the particle pool.
- Local workaround meanwhile: static fallbacks (DESIGN §15 v1 scope): Gus's leaf pin print, glowing light-trail wheels, glowing glyph band; Kettle's screen face does change on every trick and the Fishbowl's goldfish do orbit (both inside skater/).

### Notes for the gate (behaviour other packages can rely on; no contract change)
- **Showcase framing (WA's Locker camera).** In `setMode('showcase')` the skater stays at its run position (`skater.object3d` world position, origin-rebased like the run) and, at turntable 0, faces world **+z** (toward the run camera's side of the street), the board broadside; goofy riders are turned so they face +z too. A Locker camera at `object3d` + (0, 1.3, 3.4) looking at y ≈ 0.95 frames the whole rider (that is what `tests/unit/skater/sheet.ts?sheet=showcase` does). The preview loop hops ≤ 0.32 m every 5.5 s (kickflip, pop shove-it, heelflip, BS 180, Indy).
- **What the view reads from `SkaterPose` (for GP's `Sim.pose()`).** `heading`, `lean` (rad, clamped to ±22°), `latAccel` (world +x; the view derives toeside / heelside from the rider's stance), `board` (deg; flips and shove-its; a manual pitch here is used instead of the table's ±12°, never added twice), `spinYaw` (deg, BS +; mirrored for goofy), `fakie` (a 180 landing snaps, the revert pivots), `grindId` / `manualKind` (pose tables in skater/poses.ts; `bodyYaw` is not read yet: slides take their yaw from the grind table), `height` (crash ground), `landImpulse` and `land` events (absorb dip, Gus's wave on Perfect, Lark's coat hem), `crash` (the sim stops stepping after a crash, so the view advances the tumble with `RenderFrame.dt`, crash slow-mo included).
- **Dusk-driven glows** (Vesper's reflective strips 0.2 → 1.2, the Paper Lantern 0.2 → 1.0) follow `RenderFrame.area` / `blend` along `AREA_ORDER` (Downtown 0 → Neon 1), independent of the palette module.
- **Exposure.** `skater.config.ts › SHADE.albedo` (0xd6d6d6) keeps light cloth hues out of the ACES shoulder under the M0 golden lights (`LIGHT_SCALE` = π). Retune it (one number) at G2 if WA's palette changes the light levels.
- **Extras on the concrete view** (`skater/index.ts › SkaterViewImpl`): `stats()` (draw calls, triangles incl. outline twins, last switch ms), `snap()`, `setShowcaseTime(t)`, `meshes()`. `content/index.ts` adds `itemById`, `itemsOfSlot`, `loadoutOf`.
- **Contact sheets:** `PORT=5183 node tests/unit/skater/sheet.mjs` (Vite on $PORT) writes `artifacts/sheets/*.png`; `scripts/shots.mjs --cosmetics` (M0-io) can drive the same items in-game through `__skate.ui('locker', { preview, yaw })`.

## MU: Meta and UI (W3a)

## AU: Audio (W3b)
