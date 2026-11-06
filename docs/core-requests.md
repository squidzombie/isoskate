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

No change to `src/core/` is needed for M0 to work: everything below is implemented inside sim/, tricks/, world/gen/
and debug/bots/. One additive request (sim tunables into `core/tuning.ts`) is open for G0.
The first block is the frozen behaviour later packages (GP, WG, WA, the bots) can rely on; the rest are open notes.

### Frozen M0 contact details the validator mirrors   (status: open, informational)
- File / symbol: sim/collide.ts, sim/grind.ts, sim/magnet.ts, world/gen/validator/path.ts (TECH §6.4, §6.6)
- Change: none. Details TECH §6.4 / §6.6 leave implicit, now fixed in code and tests:
  - The inset is `min(FACE_INSET, extent / 4)` per axis, so a 0.05 m rail keeps a body (`insetOf`, one definition in
    world/gen/validator/path.ts, used by sim/collide.ts, exported from sim/index.ts and world/gen/index.ts).
  - Overlap uses the inset box. Skim compares the **true** top (`box.y1`) with the board bottom (`≤ STEP_UP`): a 0.19 m
    landable body slams, a 0.18 m one skims. A crash top slams whenever the board is below its inset top.
  - The first-contact axis is the one that started overlapping last (slab method, prev → cur): from above, lateral or
    frontal. Knock tops are knocked from every side.
  - In an air tick, capture is tested **before** collisions, so a board coming down onto a ledge or rail locks before
    it can touch the crash top. **Capture starts when the board's front half reaches the edge start**: centre
    `s ≥ a.s − HITBOX.l/2` (`CAPTURE_LEAD`, u clamped to 0), in the sim, the prediction and the validator.
  - After rolling off a top **sideways** (the centre left it), its body pushes the board out to the side and
    re-anchors targetX; it never re-lands on that top (one drop, one `land`).
  - Ground align eases targetX toward the grindable's **centreline** (the mean of its non-pickOnly edge axes).
  - The pick window stays open through up to 3 air ticks without a predicted capture (`PICK_MISS_TICKS`), so the
    tell never flickers; predictions step time exactly like the sim (`startT + (tick + j)·DT`). A buffered TAP is
    discarded at capture.
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
  - world/gen also registers an allocation-free `FastQuery` (`fastQueryOf(world)`: obstaclesInto, coinsInto,
    groundInto, areaGatewayInto) that the sim uses each tick; other worlds (test fixtures) fall back to the contract.
    WG: keep it when rewriting query.ts.
- Why: bots, the debug overlay and coins read keys this way, and GP's fixture worlds need the same ground rules.
- Local workaround meanwhile: n/a.

### Sim tunables into core/tuning.ts   (status: open, for G0)
- File / symbol: core/tuning.ts (additive), today in sim/consts.ts
- Change: add verbatim, then make sim/consts.ts re-export them from core:
  ```ts
  export const ROLL_OFF_DROP = 0.05, STICKY_DROP = 0.3;                 // TECH §6.3 step 5 (roll-off, sticky slabs)
  export const BUMP_WOBBLE = 0.3, MANUAL_END_WOBBLE = 0.3;              // s (side bump TECH §6.4, manual budget end)
  export const COIN_VOLUME = { lat: 0.3, fwd: 0.4, vert: 0.7, centreUp: 0.75 } as const;   // DESIGN §10.8
  export const COIN_CHAIN_TICKS = 30, PICK_MISS_TICKS = 3;
  ```
- Why: DESIGN §22 puts movement and physics numbers in core/tuning.ts; these were implicit in TECH.
- Local workaround meanwhile: sim/consts.ts is their single home (re-exported by sim/index.ts).

### Pits and trench planks must be drawn; S_TRENCH is off until they are   (status: open, G0 checklist + M0-io / WA)
- File / symbol: world/render (grey-box chunk builder) › Obstacle.pits; world/gen/gen.config.ts › GEN_FLAGS.trench
- Change: none to core. S_TRENCH emits `kind: 'trench'` with three `pits` (road lip 0, sidewalk lips 0.15). It also
  emits one 1.2 m plank slab at y = 0 (surface 'wood') and `params { plankX, plankW, depth }`, and cuts the sidewalk
  slabs over the trench. S_BARRIER may carry `params { slotX, slotW }` with two solids.
- Why: the M0-core view draws nothing for pits, so a trench on the road would be invisible (fair in the sim and the
  validator, but a crash there would not feel deserved). Please draw the pit (dark, with chevrons) and the plank.
- Local workaround meanwhile: `GEN_FLAGS.trench` defaults to **false**: every A3 slot is an S_BARRIER and S_TRENCH is
  never drawn. **G0 checklist:** if the merged view draws `Obstacle.pits`, set `GEN_FLAGS.trench = true` in
  world/gen/gen.config.ts (one line). Tests force both settings, so no golden value changes. To look at one: with the
  flag on, seed 1 has a trench at t ≈ 22.6 s (s = 158.3, plank at x = −0.51).

### A1/A2 stand-in, GenStats timing, Lesson mode   (status: open, for WG)
- File / symbol: world/gen/schedule.ts, gen.config.ts › GEN.gate; core/world.ts › GenStats.msPerSegment
- Change: none.
  - Instead of A1 column fillers, M0 schedules S_GATE rows by a run-time deadline: consecutive rows ≤ `GEN.gate.gap`
    apart (9 / 9 / 8 / 7 s, T0 stretches included); a template that would overrun it is replaced by the gate, and when
    the deadline falls in a gateway the gate comes before it. S_GATE is not drawn freely. An opening is ≥ 3 m from the
    previous safe x and ≥ 2.4 m from every opening of the previous gate, so no straight lane passes two gates in a
    row: every lane dies by t ≤ 20 s from t = 0 and within 10 s of startT 150 / 165 (bots.quick, 20 seeds × 9 lanes).
    A spawn just before a gateway (e.g. startT 155) can take up to ~13 s. WG replaces this with A1 fillers.
  - `msPerSegment` stays 0, because world/gen may not read clocks. The loop or a bench measures it.
  - `mode: 'lesson'` plays the Roll-out like a normal run (the Lesson Line is WG's).
- Why: hand-off for W1b.
- Local workaround meanwhile: n/a.

## M0-io (input/, platform/, ui/ debug HUD, world/render/ grey-box, gfx/ additions, debug/ api, shots, e2e)

### RecognizerConfig: screen size for arc compensation and the dead zone   (status: open)
- File / symbol: core/input.ts › RecognizerConfig
- Change: `screenW?: number; screenH?: number;   // CSS px; arc compensation uses the outer arcOuterFrac of screenW, touch-starts below screenH − deadZoneBottomPx are ignored (0/absent = 390·k / no dead zone)`
- Why: DESIGN §4.2 arc compensation needs the screen width ("outer 40%"), which `k` cannot give back once clamped; the dead zone needs the height. With both in the config the pure recognizer (thumb bot) applies the same rules as the DOM binding.
- Local workaround meanwhile: `input/recognizer.ts › RecognizerConfigExt` (fields required, default 0); `createRecognizer(cfg)` passes them through; `createInput` keeps them live from the viewport.

### InputSource: synthetic traces in real time   (status: open)
- File / symbol: core/input.ts › InputSource
- Change: `inject?(samples: readonly PointerSample[], atMs?: number): void;   // schedules a trace (first sample at atMs, default now) through the real recognizer`
- Why: `__skate.pointer()` in rAF mode (smoke.spec) must go through the live recognizer and frame binning, not a parallel path.
- Local workaround meanwhile: `input/index.ts › InjectableInput` + `isInjectable()`; debug/api.ts duck-types `host.input`. In manual mode `pointer()` uses its own InputPipeline on the synthetic 60 Hz clock.

### DebugAPI: freeze `__skate.ext` as a hook   (status: open)
- File / symbol: core/debug.ts › DebugAPI (or only the "Hooks … P2 packages can rely on" list above)
- Change: `ext?: DebugExt` with `overlay(on?)`, `perfHud(on?)`, `tuning(on?)`, `contrastReport()`, `capture({ target: 'canvas' | 'skater', size, pad, bg })`, `catalog()`, `hud(preview | null)`, `world()`, `clockMs` (debug/api.ts › DebugExt).
- Why: `scripts/shots.mjs` (--cosmetics capture around the skater with the active camera, --hud worst-case preview, --contrast worst frames) and the e2e specs use them; later packages should never need to edit shots.mjs.
- Local workaround meanwhile: `DebugApiWithExt` in debug/api.ts; specs cast `window.__skate`.

### HUD hooks MU must keep when replacing ui/   (status: open)
- File / symbol: ui/hud.ts (not core); documented here because shots --hud and smoke.spec rely on it
- Change: keep `data-hud="score|dist|combo|trick|coins|pause"` on the HUD pieces and an optional `preview(values | null)` method on the HudApi object (`__skate.ext.hud` freezes the HUD on worst-case values).
- Why: the 320/360/390 px overlap and 56 px band checks measure `[data-hud]` boxes.
- Local workaround meanwhile: `ui/hud.ts › HudExt`.

### UiApi.show('settings') with the current values; Settings from Pause   (status: open)
- File / symbol: core/ui.ts › UiApi.show params; game/app.ts › onIntent('open')
- Change: `show(screen, params?: { …; settings?: Readonly<SaveV1['settings']> })`, App passes `save.data.settings` when opening Settings; allow `{ k: 'open', screen: 'settings' }` from Pause (return to Pause on Back).
- Why: the stub Settings screen otherwise reads the stored save read-only from localStorage to show current values; DESIGN §17.2 lists Settings on Pause.
- Local workaround meanwhile: `ui/screens/menus.ts` reads `dusklane.save` read-only; Pause shows Resume / Restart / Home only.

### Wiring for M4 / G1 (no core change)   (status: open)
- `platform › maybeFullscreen()` exists for the first TAP TO ROLL in the Android browser (TECH §10.2); INT calls it in M4.
- `debug › registerTunables(name, obj)` feeds the tuning panel; G1 registers `score.config` and `gen.config` (the panel already shows the live recognizer config and the loop).
- Haptics Key/All gating stays at the call sites (`platform › HAPTIC_RULES` has the 15 ms / 120 ms rules).

### Notes for the gate (no request)
- `CameraRig.camera` is now a getter: the ortho run camera, or a perspective camera in `'locker'` mode (FOV 35°, 1.4 m high, 11 m behind the skater, mid-body at 33% from the top), so the Locker turntable sits above the item panel. WA replaces it with the Title/Locker diorama.
- `WorldView.stats().buildMsP95` times the render-side build only (generation inside `gen.chunk()` is WG's budget). Measured in node: p50 0.11 ms, p95 0.49 ms, ≤ 1,030 tris per chunk.
- The M0 stub sim drops every `swipeSteer` swipe; touch.spec avoids relying on the steering-stroke rule (M0-sim / GP implement it).

### After the M0-io review (appended; no core change unless marked)
- **`__skate.ext` additions** (same open request as above: freeze `ext` as a hook): `capture({ native?: true })` returns a crop at its rendered pixels; `capture({ view: CaptureView })` renders the skater alone on a plain background with its own perspective camera (`azDeg` / `elevDeg` relative to the active camera, `part: 'all' | 'board' | 'head'`; a board is framed from its side, the rider hidden); `capture()` on the skater also returns `skaterCss` (projected size, CSS px); `tryOn(id | null)` puts one catalog item on over the equipped loadout via `SkaterView.setLoadout` (until the next run start or Locker visit). shots `--cosmetics` uses them for the per-item turntable views and the real-scale in-run crops.
- **Recognizer labels (DESIGN §4.2), for M0-sim / GP:** `fast` is now `max(flick speed since it started moving, speed over the last 24 ms) ≥ 0.75·k px/ms`, so a hard flick from a thumb that is already steering reads `fast` (the steering-stroke rule then accepts one-thumb ollies and air flips). Re-fire and the lift-off swipe after a fire need the speed dip **and then a new rise** (≥ 2× the trough and ≥ the lift-off swipe speed): a flick that eases into a slower drag fires once. Trace tests in `tests/unit/input/recognizer.test.ts`.
- **Grey-box world:** readability colours now live in `world/render/palette.ts` (DESIGN §22); coins are 8-sided unlit `#FFC94A`. Behind the run's first generated content the start cross-section (solid-free ground obstacles crossing it, their edges) and one chunk of its decor are continued backward (render only; the sim never sees them). `debug/` no longer imports anything from `world/render` (game/ uses only the two factories), so WA can rewrite its internals freely.

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

### Design question: board identity in the run at 31 px   (status: open, for the design owner at G2)
- DESIGN §15.2 gives every board the same grip (`#2E2A33`) and a natural ply edge, and the run camera (35° down, from behind) sees only the grip under the shoes. So in a run a board shows its graphic only during flips (bottom up from about 90° to 270° of roll). It also shows in the Locker / Shop board display and on the card art (below).
- Proposal: a palette-coloured grip cut at the tail kick (the graphic shows through), or a thin palette-coloured grip border. Either would be one tunable in `skater.config.ts`. Not implemented, because DESIGN fixes the grip.

### Notes for the gate, after the review (appended; no contract change)
- **Board display (Locker / Shop).** A board change while in `setMode('showcase')` makes the rider step off and hold the deck upright beside them, graphic toward the camera, for `SHOWCASE.display.dur` (2.6 s). They then hop back on and kickflip. `app.ts` already calls `setMode('showcase')` before the preview `setLoadout`; keep that order. `SkaterViewImpl.showBoard(sec?)` triggers the display directly.
- **Card art for MU:** `drawBoardThumb(c, look, x, y, w, h)` (exported from `skater/`) draws the deck graphic in its outline, portrait or landscape, into any 2D context. Sample sheet: `artifacts/sheets/thumbs.png`.
- **Crash direction:** the view reads `RenderFrame.cur.crash.cause`, falling back to the `crash` event's `cause`. A `slam` bounces back off the obstacle and lands the rider on their back in front of it. Bad landings and falls tumble forward. GP's sim must keep `SkaterState.crash.cause` set while crashed.
- **Blue hour:** as the dusk factor goes from 0.67 (Docks) to 1 (Neon), the outline lifts from ink toward a pale lilac (`OUTLINE.nightColor`) and the rim turns to the cool moon fill. WA's contrast gate will see this on the skater.
- **No shader compile on a switch:** all view materials and canvases live as long as the view. Each view has one canvas per slot (`sk-atlas:<n>`, `sk-board:<n>`, `sk-decal:<n>`), drawn by callbacks that read the current look, so `redrawCanvasTextures` after a context restore redraws what is on screen. The Fishbowl glass program is compiled at construction (`renderer.compile(object3d, camera, ctx.scene)`).
- **Switch cost on SwiftShader:** the first frame after a switch uploads one redrawn canvas, and SwiftShader rasterises the 2D canvas in software at upload time (board ≫ skater ≈ helmet). `sheet.mjs` (`items60`) gates on an unchanged shader program count and on a typical switch (set p95 + first-frame p50 ≤ 30 ms), and reports the p95. Check the real-device cost with `__skate.perf()` on a phone at G2/M5.
- **More extras:** `SkaterViewImpl.materials()`, `showBoard()`, `anim.displayBlend`; `CATALOG` and `DEFAULT_LOADOUT` are deep-frozen.

## MU: Meta and UI (W3a)

## AU: Audio (W3b)

### How AU uses the frozen hooks   (status: info)
- **Per-frame layers.** `audio.roll(speed01, surface, airborne, manual)` drives the rolling loop (band-pass 300 + 900·speed01 Hz, surface variants, joint ticks by distance, 40 ms fade + 0.4 s wheel whir when `airborne`, 2-wheel tone when `manual`) and the wind bed (from 8.0 m/s, i.e. `speed01 · V_MAX`). It is also the frame clock: it ticks the music scheduler and closes the per-frame perf sample. `audio.grind(active, material, slide)` builds the material loop on the first active frame and releases it (60 ms) on the first inactive one; `slide` adds the deck scrape. Both are silent unless `setScene('run')`.
- **Nothing else is needed from game/.** `attach()` plus `setScene()` drive the music: `runStart` resets the run (start area, speed level, combo filter, coin climb; needle drop after a tape stop), `speedTier` sets the base level (FLOW → 2), `trickScored` plays `note(seq)` and sets the combo filter from `max(1, links)`, `comboBanked`/`comboLost` close it, `gatewayEnter` / `areaEnter` pivot and crossfade, a non-god `crash` tape-stops; Results and Menu bring the music back at level 0. `music.start / setArea / setIntensity / setComboFilter / duck / stop` stay available (G3 may call them; they are idempotent with the bindings). `setIntensity(level)` is the speed-derived *base* level; the engine plays `max(base, combo level)` in the run scene and 0 elsewhere.
- **Boot.** `createAudio()` (wiring, at boot) queues every pre-rendered buffer (noise loops, vinyl, joint ticks, five drum kits; `audio/bank.ts`) and builds them in `requestIdleCallback` slices (setTimeout where there is none), ~200–300 ms of idle work done within ~1.5 s of boot, so the unlocking tap only creates nodes (~10–30 ms). A tap before that waits for the noise and the first kits in short tasks; the music then starts a few hundred ms late, never as one long task. Keep `createAudio()` at boot, not on the first gesture.
- **Unlock.** Every `input.onAnyInput` while `!audio.unlocked` calls `unlock()` (creates the context on the first gesture, `audioSession.type = 'ambient'`, 1-sample buffer, `resume()`). The engine itself suspends on `visibilitychange` hidden and resumes on visible; `unlock()` from any later gesture resumes too. With both sliders at 0 (`setVolumes`) the context is suspended and `unlocked` stays true once it has run; raising a slider resumes it.
- **Offline.** `renderOffline(area, sec)` = 20 s of the area at plateau speed (FLOW, mid-song, roll bed, wind, ambience, a few tricks) on the live graph code, default sliders, 48 kHz, deterministic per area. `tests/unit/audio/render-check.mjs` (PORT=5184) renders and analyses it (plus stems, scene changes and a skilled line through the debug-only `window.__skateAudio.renderScene`); G3 can run it next to `shots --audio`.
- **G0 merge note.** ROADMAP M0 / SCHEDULE also list an `audio.spec` for M0-io; pkg/m0-io had none when AU finished. If one appears, keep AU's `tests/e2e/audio.spec.ts` (it covers unlock, mute and the 2-minute run) and fold any extra M0-io assertion into it.

### DebugAPI.audio(): context state and cost   (status: open)
- File / symbol: core/debug.ts › DebugAPI.audio
- Change: `audio(): { unlocked: boolean; voices: number; scene: string; intensity: number; contextState?: string; msPerFrame?: number; voicePeak?: number; voicesDropped?: number }` and in debug/api.ts pass through `host.audio.stats().contextState` plus the AU debug numbers (`perf().msPerFrame` is the whole-session average since attach).
- Why: audio.spec asserts "context state running" and the ≤ 0.3 ms/frame budget through the frozen API.
- Local workaround meanwhile: debug builds (`?debug=1` / dev) expose `window.__skateAudio` (`AudioDebug` from audio/index.ts: `stats()`, `perf()`, `renderScene()`); audio.spec reads it.

### SfxId: the internal cues   (status: open)
- File / symbol: core/audio.ts › SfxId
- Change: `| 'spin' | 'revert' | 'pickChime' | 'rewind' | 'needle' | 'grindSwitch'`
- Why: DESIGN §9/§19.3 sounds that exist and are bound to events (spin swish, revert scuff, pick-window chime, lesson rewind, needle lift after the tape stop, grind switch) but cannot be requested through `audio.sfx()` by UI or tests.
- Local workaround meanwhile: `Cue` in audio/engine.ts (SfxId ∪ those six); bindings use it, `audio.sfx()` accepts only SfxId.

### runStart: start area   (status: open)
- File / symbol: core/events.ts › GameEvent 'runStart'
- Change: `{ t: 'runStart'; tick: number; seed: number; mode: 'lesson' | 'normal'; startArea?: AreaId }`
- Why: the run song should start in the start area's key when Start District (M5) lands, without waiting for an `areaEnter`.
- Local workaround meanwhile: runs start in Downtown; an `areaEnter` at tick 1 (debug `startT`, `startArea`) pivots to the right song at the next bar line.

### smoke.spec: renderAudio is no longer null   (status: open, G0)
- File / symbol: tests/e2e/smoke.spec.ts › "__skate.ui() goes through the app…" (line 204)
- Change: the stub-era `expect(await renderAudio('downtown', 1)).toBeNull()` becomes, for example,
  `const r = await page.evaluate(() => window.__skate!.renderAudio!('downtown', 1)); expect(r!.sec).toBeCloseTo(1, 2); expect(r!.peak).toBeGreaterThan(0.01); expect(r!.peak).toBeLessThan(0.9);`
- Why: AU ships `renderOffline` (TECH §4.13, as the debug.ts doc comment anticipates: "resolves null until AU ships"), so this one assertion fails on pkg/au in both projects; every other smoke test passes with audio on. AU may not edit smoke.spec.
- Local workaround meanwhile: none (the assertion contradicts the deliverable); tests/unit/audio/render-check.mjs covers renderAudio.
