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

### Applied @G0 (gate G0; additive, TECH §4 updated to match)
- `core/tuning.ts`: `ROLL_OFF_DROP`, `STICKY_DROP`, `BUMP_WOBBLE`, `MANUAL_END_WOBBLE`, `COIN_VOLUME`, `COIN_CHAIN_TICKS`, `PICK_MISS_TICKS` (M0-sim).
- `core/input.ts`: `RecognizerConfig.screenW? / screenH?`, `InputSource.inject?` (M0-io).
- `core/debug.ts`: `DebugAPI.ext?: DebugExt` plus `HudPreview`, `CaptureView`, `ContrastItem`, `ContrastReport` (M0-io); `audio()` gains optional `contextState`, `msPerFrame`, `voicePeak`, `voicesDropped` (AU).
- `core/ui.ts`: `UiApi.show` params `settings?` (M0-io). `game/app.ts` passes `save.data.settings`; Pause has a Settings button and Back / Esc return to Pause.
- `core/audio.ts`: `SfxId` gains `spin`, `revert`, `pickChime`, `rewind`, `needle`, `grindSwitch` (AU).
- `core/events.ts`: `runStart.startArea?` (AU); the sim emits it.
- `core/view.ts`: `Vfx.emit?` (SK; implemented by WA / M5).
- TECH §5.3 / §6.4 / §6.6 now carry M0-sim's SafeKey, groundAt, FastQuery, inset, skim and capture details.
- Deferred: `gfx › sharedUniforms` / `uDesat` (SK) to WA, because nothing desaturates the world yet. The board-identity design question (SK) stays with the design owner at G2.
- Gate decisions: `GEN_FLAGS.trench = true` (the grey-box view draws pits, and now draws the plank above the pit face; seed 1 trench at t ≈ 22.6 s checked on screen). `tests/unit/integration/labels.test.ts` proves the real recognizer's `steer` / `fast` / `fromRest` labels reach the real sim as DESIGN §4.3 intends.

- Integration fixes outside core: the grey-box palette passes the contrast gate with the real generator (asphalt `#79728A`, tall top `#352A4C`, 0.05 m accent band; min hazard 2.61:1, min edge 1.83:1 over 32 presets; WA owns the palette from W2a); a run's first frame builds the chunks on screen, so a retry never shows the fog behind the start.
- For GP (no change made): on a very slow device (≈ 13 fps) touchmoves are delivered once per frame, so a drag whose first move arrives after 200 ms can read as a HOLD and start a manual inside a combo (harmless, DESIGN §4.4 rule 3). Consider measuring the HOLD from sample time rather than tick time if it shows up on real phones.

### Hooks added @G0 (later packages can rely on them)
- **HUD (MU keeps them):** `data-hud="score|dist|combo|trick|coins|pause"` on the HUD pieces and an optional `preview(values | null)` on the HudApi object (`__skate.ext.hud`).
- **`__skate.ext`** is part of the contract now (core/debug.ts › DebugExt); shots.mjs and the e2e specs use only it and the DebugAPI.

### Applied @G1 (gate G1: GP, WG, WA, MU merged; additive, TECH §4 updated to match)
- `core/input.ts`: `InputFrame.longTap?`, `Gesture` `holdEnd.release?` (GP 1); `longTapMaxMs` 600, touch.spec's prime holds 700 ms.
- `core/events.ts`: `rewind` gains `cause? / obstacleId? / kind? / left?` (GP 3); `grindSwitch.late?` (GP 6).
- `core/debug.ts`: `DebugSnapshot.sim?: DebugSimInfo` (GP 4), filled by debug/api.ts from `simDebug(sim)`.
- `core/save.ts`: `SaveV1.daily.giftBonusDay?`, `SaveV1.crates.queue?` (MU).
- `core/tuning.ts`: `FIRST_VISIT_SEC`, `VISIT_SEC`, `GATEWAY_SEC` (MU); world/gen/areas.ts re-exports them.
- `core/view.ts`: `WorldView.setAutoQuality?`, `Vfx.setReducedMotion?` (WA). `core/ui.ts`: `UiApi.setMonetization?` (MU).
- `core/decor.ts`: one `Decor.y` definition (the surface it stands on / hangs from; hung kinds take a `mount` param).
- Factory: `createInput(el, { screenW, safeBottom, screenH? })` (the cached viewport height; MU's layout-read finding).
- Behaviour changes approved at the gate (TECH §6.4–6.6): the 0.15 m edge nudge (GP 9), no re-capture of the edge a
  pop-out left (GP 2, on), a pre-press manual needs the press to go down in that air (found by the thumb-bot gate
  on the real recognizer: a 250 ms tap under way at a 0.15 m roll-off started a manual).
- Rejected: moving `RULES` into core (GP 5): they stay in tricks/score.config.ts.

## M0-sim (sim/, tricks/, world/gen/ minimum, debug/bots/ SafeKey follower)

No change to `src/core/` is needed for M0 to work: everything below is implemented inside sim/, tricks/, world/gen/
and debug/bots/. One additive request (sim tunables into `core/tuning.ts`) is open for G0.
The first block is the frozen behaviour later packages (GP, WG, WA, the bots) can rely on; the rest are open notes.

### Frozen M0 contact details the validator mirrors   (status: applied @G0: copied into TECH §6.4 / §6.6)
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

### SafeKey and WorldQuery semantics   (status: applied @G0: copied into TECH §5.3)
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

### Sim tunables into core/tuning.ts   (status: applied @G0; sim/consts.ts re-exports them)
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

### Pits and trench planks must be drawn; S_TRENCH is off until they are   (status: applied @G0: pits drawn, plank drawn above the pit face, `GEN_FLAGS.trench = true`)
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

### A1/A2 stand-in, GenStats timing, Lesson mode   (status: open, hand-off for WG; no core change)
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

### RecognizerConfig: screen size for arc compensation and the dead zone   (status: applied @G0 as optional fields)
- File / symbol: core/input.ts › RecognizerConfig
- Change: `screenW?: number; screenH?: number;   // CSS px; arc compensation uses the outer arcOuterFrac of screenW, touch-starts below screenH − deadZoneBottomPx are ignored (0/absent = 390·k / no dead zone)`
- Why: DESIGN §4.2 arc compensation needs the screen width ("outer 40%"), which `k` cannot give back once clamped; the dead zone needs the height. With both in the config the pure recognizer (thumb bot) applies the same rules as the DOM binding.
- Local workaround meanwhile: `input/recognizer.ts › RecognizerConfigExt` (fields required, default 0); `createRecognizer(cfg)` passes them through; `createInput` keeps them live from the viewport.

### InputSource: synthetic traces in real time   (status: applied @G0 as optional `inject?`)
- File / symbol: core/input.ts › InputSource
- Change: `inject?(samples: readonly PointerSample[], atMs?: number): void;   // schedules a trace (first sample at atMs, default now) through the real recognizer`
- Why: `__skate.pointer()` in rAF mode (smoke.spec) must go through the live recognizer and frame binning, not a parallel path.
- Local workaround meanwhile: `input/index.ts › InjectableInput` + `isInjectable()`; debug/api.ts duck-types `host.input`. In manual mode `pointer()` uses its own InputPipeline on the synthetic 60 Hz clock.

### DebugAPI: freeze `__skate.ext` as a hook   (status: applied @G0: `DebugAPI.ext?: DebugExt` with HudPreview, CaptureView, ContrastReport in core/debug.ts)
- File / symbol: core/debug.ts › DebugAPI (or only the "Hooks … P2 packages can rely on" list above)
- Change: `ext?: DebugExt` with `overlay(on?)`, `perfHud(on?)`, `tuning(on?)`, `contrastReport()`, `capture({ target: 'canvas' | 'skater', size, pad, bg })`, `catalog()`, `hud(preview | null)`, `world()`, `clockMs` (debug/api.ts › DebugExt).
- Why: `scripts/shots.mjs` (--cosmetics capture around the skater with the active camera, --hud worst-case preview, --contrast worst frames) and the e2e specs use them; later packages should never need to edit shots.mjs.
- Local workaround meanwhile: `DebugApiWithExt` in debug/api.ts; specs cast `window.__skate`.

### HUD hooks MU must keep when replacing ui/   (status: accepted @G0: listed under "Hooks … P2 packages can rely on"; not core)
- File / symbol: ui/hud.ts (not core); documented here because shots --hud and smoke.spec rely on it
- Change: keep `data-hud="score|dist|combo|trick|coins|pause"` on the HUD pieces and an optional `preview(values | null)` method on the HudApi object (`__skate.ext.hud` freezes the HUD on worst-case values).
- Why: the 320/360/390 px overlap and 56 px band checks measure `[data-hud]` boxes.
- Local workaround meanwhile: `ui/hud.ts › HudExt`.

### UiApi.show('settings') with the current values; Settings from Pause   (status: applied @G0: `params.settings`; Pause has Settings, Back / Esc return to Pause)
- File / symbol: core/ui.ts › UiApi.show params; game/app.ts › onIntent('open')
- Change: `show(screen, params?: { …; settings?: Readonly<SaveV1['settings']> })`, App passes `save.data.settings` when opening Settings; allow `{ k: 'open', screen: 'settings' }` from Pause (return to Pause on Back).
- Why: the stub Settings screen otherwise reads the stored save read-only from localStorage to show current values; DESIGN §17.2 lists Settings on Pause.
- Local workaround meanwhile: `ui/screens/menus.ts` reads `dusklane.save` read-only; Pause shows Resume / Restart / Home only.

### Wiring for M4 / G1 (no core change)   (status: deferred to M4 / G1, as filed)
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

### After the G0 reviews (appended by INT; no core change)
- **Input behaviour changed at G0** (DESIGN §4.2–4.4, rows 57–58; traces in `recognizer.test.ts` and `integration/labels.test.ts`, keep them green): owner sectors (`RecognizerConfigExt.ownerDiagonalHalfDeg` 10), sloppy taps (`sloppyTapMs/MaxPx/MaxDxPx` 250/20/15), fresh steering strokes need `fast`/`fromRest` sideways (`tricks/interpret.ts swipeCounts`: an owner swipe is one with `swipeDx ≠ 0`, other fingers and keys carry 0), and `SimImpl.apply` cancels steering only for air flips, spin upgrades and air picks.
- **Perf gates** now exist: `tests/unit/sim/bench.test.ts` (≤ 0.05 ms/tick) and `tests/unit/gen/bench.test.ts` (≤ 3 ms p95) run in `npm test`; `tests/e2e/bot-survival.spec.ts` gates calls ≤ 120 / tris ≤ 120k and bounded geometries on the mobile project. WA tightens it at G2 (main ≤ 70, per area); WG's bench at W1b can replace the gen one.
- **First-runs hints** live in `game/onboarding.ts` (`FirstRunHints`, runs 1–3, t = 0 starts, Roll-out timings from `world/gen` `ROLLOUT_*`). They call `hud.hint(id)` with core `HintId`s; `ui/hud.ts` draws a text chip (`HINT_TEXT`, touch vs keys wording, `position: fixed` 13% above the bottom, `pointer-events: none`). MU owns the chip's look; M4 replaces the driver with the Lesson Line hints.
- **Open for P3 (filed by the G0 reviews, not done at G0):**
  - GP: a 350–600 ms press outside a combo or pad does nothing (it needs a recognizer→sim signal for "held but no manual started"; decide it together with the manual start rules); a resting thumb starts a manual within the link window after 200 ms (review asks 300 ms or a delayed popup); the magnet captures from 1.6 m and re-locks the same ledge after a pop-out (frozen behaviour: needs a request here).
  - WA: the chain reads as a lane marking (bollards + chain, chevrons on the front face) and tall rows / trench / chain are all near-black: the contrast gate (hazard ≥ 2.5:1 on `#79728A`) leaves ≤ ~4% of a low hazard's silhouette for amber, so design the hazard kits and the gate together; tall props with a lighter top conflict with the gate fix that made tops darker; contact shadows under obstacles; camera-facing identity elements in portrait; a readable ledge end (darker block end, cream lip); the Roll-out chunk cache (the first frame of a run builds 3 chunks, ~3–9 ms, TECH §8.6 exception).
  - SK: a short motion smear on the flipping board (FLIP_VIEW already drops it 0.28 m, scales it 1.25× and yaws it 18°).
  - MU: the ghost thumb / key caps and the "rest here" mark; the cause line copy (`ui/format.ts crashCause`) now teaches ("tap to ollie it", "steer around it").
  - M4: the instant-retry window (0.6–1.2 s, DESIGN §17.1) stays as designed; a tap at +1.3 s lands on Results where only ROLL AGAIN works. Revisit with the reward toast.

## GP: Gameplay (W1a)

Everything below is implemented inside sim/, tricks/ and input/ with local extension types; the sim works without
any of these core changes. Requests 1–4 are additive (optional fields); request 2 changes frozen magnet/capture
behaviour and is behind a flag.

### 1. InputFrame.longTap: a 350–600 ms still press reads as a tap   (status: applied @G1: core `InputFrame.longTap?` and `holdEnd.release?`; `longTapMaxMs` 600; touch.spec's prime holds 700 ms)
- File / symbol: core/input.ts › InputFrame, Gesture; tests/e2e/touch.spec.ts › liveRun (INT)
- Change: `longTap?: boolean;   // edge: a still touch released after tapMaxMs, ≤ longTapMaxMs after down (a HOLD that never moved)`
  on InputFrame, and `{ k: 'holdEnd'; tMs: number; release?: true }` on Gesture.
- Why: the G0 open item "a 350–600 ms press outside a combo or pad does nothing". The recognizer marks the holdEnd of a
  still release in (tapMaxMs, longTapMaxMs] with `release: true` (no `tap`: the 349 / 351 ms boundary of TECH §7.4
  stays), the frame builder turns it into `longTap`, and the sim reads it as a TAP wherever the hold started nothing:
  an ollie on the ground, a linked ollie out of a manual that this still touch started, the jump buffer in the air
  (not after a grab), a pop-out in a grind. A 700 ms press still does nothing (traces in
  tests/unit/input/recognizer.test.ts, frames.test.ts and integration/labels.test.ts).
- **e2e note (INT, G1):** touch.spec.ts `liveRun(page, seed, prime)` primes Chromium's touch pipeline with a still
  press held "400 ms" after its first move arrives (measured 490–1,410 ms here) and expects it to do nothing. With the
  600 ms design value that prime pops an ollie in some runs, and "a tap during a run ollies", "a drag steers" and "a
  swipe left in the air kickflips" then fail. So `RecognizerConfigExt.longTapMaxMs` ships at **400** (the prime always
  holds longer). At G1: hold the prime for ≥ 700 ms (`waitForTimeout(700)`), then set `longTapMaxMs` to 600 in
  input/recognizer.ts DEFAULT_RECOGNIZER (one number; the unit tests read the default).
- **e2e under load (INT, info):** with the machine at load average 10–12 (four agents), the real-time touch / keyboard
  tests time out on wall-clock waits (liveRun saw < 20 ticks in 5 s; "Enter / R are ignored" saw no tick in 200 ms),
  and a CDP `touch.tap` (start and end back to back) arrived with pointerdown → pointerup 550–860 ms apart, so it was
  not a tap at all. They pass in isolation and at normal load; the synthetic-trace tests never flake. Re-measured
  after the GP review at load ≈ 11: six back-to-back CDP taps arrived 30, 1,095, 528, 885, 337 and 1,092 ms long
  (only the 30 and 337 ms ones ollied) and the loop ran at ≈ 0.3× real time; the desktop "tap ollies", "swipe left
  kickflips" and keyboard-A tests fail exactly then. Rerun touch.spec at the gate on a quiet machine.
- Local workaround meanwhile: `tricks › InputFrameExt`, `input › HoldEndExt`, `RecognizerConfigExt.longTapMaxMs`.
  Bots and tools that build InputFrames from gestures themselves (WG's thumb bot) should use input's `InputPipeline` /
  `FrameBuilder`, or set `longTap` the same way.

### 2. Magnet and capture: no re-capture of the edge a pop-out left   (status: applied @G1: on (`RULES.popOutSkipsOwnEdge` true); conformance, thumb and trick bot gates green with it; TECH §6.6)
- File / symbol: sim/magnet.ts, sim/predict.ts, sim/grind.ts (TECH §6.6, frozen at M0); tricks/score.config.ts › RULES
- Change: after a pop-out (TAP / ↑ / 180 Out) the air magnet skips the edge the board left; capture (and the capture
  prediction behind airLeft and the pick window) skips every edge of that obstacle when its top is landable (a ledge,
  a bench), unless the player steered toward that edge by ≥ MAGNET.cancelDragM this jump. Rails and beams keep
  re-capture under the board: their tops are crash tops, so dropping onto one would bail. The end hop at an edge's
  end is unchanged.
- Why: G0 review: the magnet re-locked the same ledge after a pop-out (pop out, come down, locked again), so you could
  not get off a ledge. Now a pop-out lands on the ledge top (or beside it), and the magnet is free for a different
  edge (transfers to the next rail work without having to fight the magnet of the one you left).
- Validator impact (WG): a pop-out is never a required action on the safe line, and landing on a ledge top is a
  landing the validator already models; set the flag false to restore M0 exactly.
- Local workaround meanwhile: the flag. Tests: tests/unit/sim/tricks.test.ts (transfer and the re-capture rule).

### 3. GameEvent 'rewind' carries the crash it undid   (status: applied @G1 as optional fields)
- File / symbol: core/events.ts › GameEvent 'rewind'
- Change: `{ t: 'rewind'; tick: number; toTick: number; cause?: CrashCause; obstacleId?: number | null; kind?: PropKind | null; left?: number }`
- Why: the Lesson rewind (RunConfig.rewinds, TECH §6.7) is implemented: a ring of REWIND.ring snapshots every
  REWIND.snapEveryTicks; a crash with rewinds left restores the newest snapshot ≥ REWIND.sec old and emits only
  `rewind` (no `crash`, `comboLost` or `runEnd`: the run goes on, so app.ts needs no change). M4's hint replay needs
  to know what was hit. The count is `min(cfg.rewinds, REWIND.max)`; the 4th crash is a real one.
- Local workaround meanwhile: the sim already pushes `sim › RewindEventExt` (those fields, all set).

### 4. DebugSnapshot: the debug overlay data   (status: applied @G1: `DebugSnapshot.sim?: DebugSimInfo`, filled by debug/api.ts; the overlay draws the pick window, heat and airLeft)
- File / symbol: core/debug.ts › DebugSnapshot; debug/api.ts › snapshot()
- Change: `sim?: { airLeft: number; heat: number; window: number; bankIn: number; magnetEdge: number | null; transferArmed: boolean;
  pick: { open: boolean; edgeId: number; tCapture: number; inSec: number; dirs: Dir8[]; grind: GrindId | null } | null;
  manual: { kind: ManualId; t: number; budget: number } | null; rewindsLeft: number }`, filled from `simDebug(sim)`.
- Why: ROADMAP W1a "debug overlay data: the pick-window state, heat and airLeft exposed in the snapshot"; G1 wires the
  pick-window and heat overlays. The frozen SkaterState already carries `pickWindow`, `airLeft` and
  `ScoreState.combo.heat / bankIn`; the extra fields (picks so far, the grind they select, budget) come from the sim.
- Local workaround meanwhile: `sim/index.ts › simDebug(sim): SimDebugInfo | null`.

### 5. New trick-rule tunables live in tricks/score.config.ts › RULES   (status: rejected @G1 as a move: they stay in tricks/score.config.ts, where DESIGN §22 puts trick and scoring numbers; nothing outside sim/tricks reads them)
- `manualHoldSec` 0.30 (a resting thumb manuals only after 0.30 s of stillness: the G0 "manual 200 ms into the link
  window" fix), `switchDoubleSec` 0.25 (grind switch doubles), `dropGapMinH` 0.5 (drop gaps), `popOutSkipsOwnEdge`
  (request 2), and two pose constants. The recognizer's `longTapMaxMs` sits with the other recognizer numbers in
  input/recognizer.ts DEFAULT_RECOGNIZER (400 for now, see request 1). Every trick point moved from tricks/defs.ts into score.config.ts › POINTS
  (DESIGN §22: score.config holds every scoring number); TRICKS is unchanged in content.

### 6. GameEvent 'grindSwitch' marks a late re-pick   (status: applied @G1 as `late?: true`)
- File / symbol: core/events.ts › GameEvent 'grindSwitch'
- Change: `{ t: 'grindSwitch'; tick: number; from: GrindId; to: GrindId; late?: true }`
- Why: a pick swipe in the 0.12 s after lock (DESIGN §6.3) changes the grind just locked; it is not a switch (no new
  link, no switch counted). Without the flag AU's switch cue and MU's switch popup fire for it. Consumers: treat a
  `late` switch as the grind's real name (update the popup / last-trick label; no switch cue).
- Local workaround meanwhile: the sim already pushes `sim/grind.ts › GrindSwitchEventExt` with `late: true`.

### 7. Design question: back-to-back manuals keep the heat running   (status: accepted @G1 by the design owner as built; DESIGN §24 row 60)
- DESIGN §6.4 last bullet pauses the combo heat in every manual. With that, manual → roll → manual (release and
  re-press, or pulse the manual key one tick) holds a combo for a whole area visit without a real trick (review probe:
  35 manuals, 38 s, 13,992 pending from one kickflip; touch re-press 15 s), against §13.2 "you have to keep doing real
  tricks".
- Shipped: `RULES.backToBackManualPausesHeat = false`: a manual started without leaving the ground since the previous
  manual keeps the heat running (the combo's one linked manual excepted); if the heat runs out in it, the combo banks
  when the manual ends, its points included. The first manual after every touchdown still pauses the heat, so the
  3.0 / 2.2 / 1.6 / 1.2 / 1.0 budgets stay usable between real tricks (the acceptance sequence still holds in one
  combo). `true` restores §6.4 exactly. Suggested DESIGN wording: "Manualling pauses combo heat, except a manual
  started straight after another one without leaving the ground."
- Tests: tests/unit/sim/tricks.test.ts (back-to-back manuals, key and touch).

### 8. Design question: a deliberate manual outside a combo starts one   (status: accepted @G1 by the design owner as built; DESIGN §24 row 61)
- §4.4 rule 3 says a manual "scores only inside a combo", §12.3 (Lesson Line, manual pads) says "Hold = manual. The
  combo counter and bank arc appear", §13.2 "any scored trick starts a combo".
- Shipped: a manual that the touch rules allow outside a combo (a HOLD on a pad or raised landable top, the manual key
  on a top, a pre-press held through a touchdown, a grab held through touchdown) starts a combo and is its one link
  (75 + 100/s). The manual key on flat ground outside a combo rides unscored, as a resting thumb there starts nothing
  (rule 3 parity between touch and keys, and no free combo from holding S).

### 9. Frozen M0 contact detail changed by the DESIGN §7 edge nudge   (status: applied @G1: copied into TECH §6.4; the validator's grid does not replay landing x, conformance bot 0 crashes on the GP sim)
- File / symbol: sim/collide.ts (landable top from above), sim/landing.ts › edgeNudge; core/tuning.ts › LAND.edgeNudge (0.15, already in core)
- Change: an air landing on a raised landable top moves the board centre ≥ LAND.edgeNudge (0.15 m) inside the top's
  side edge (M0: 0.02 m), and targetX with it. Ground contact (rolling onto a top) keeps the M0 0.02 m. Same surface,
  same landed / crash classification; only x differs (≤ 0.13 m toward the top's centre).
- Why: ROADMAP W1a "full landing rules … the edge nudge" (DESIGN §7). The validator models landings on tops; if it
  replays x exactly, mirror `edgeNudge` (min(0.15, width / 2) from each side edge).

### Behaviour other packages can rely on (no contract change)
- **Event timing** (VFX / audio / popups): `flipStart`, `flipUpgrade`, `spinStart`, `grabStart`, `grindStart`,
  `grindSwitch`, `manualStart` on the tick the trick starts; `trickScored` for flips, spins and the grab on the
  touchdown or capture tick (landing modifiers known), for a grind at each switch and at its end, for a manual at the
  Nose Manual switch and at its end. A Nose Manual is a second `manualStart` (kind 'noseManual') without a
  `manualEnd` in between. `land` precedes its `trickScored`s; `nearMiss` precedes its `bonus`.
- **New emitters:** `grabStart` / `grabEnd`, `nearMiss`, `landmark`, `rewind`, `grindSwitch` for switches, and `bump`
  with kind 'wall' when the board touches a soft wall (once per contact, with the 0.3 s wobble).
- **pose():** every sim PoseId (roll, carve, pop, tuck, flip, grab, land, manual, noseManual, grind, sketchy, crash);
  `board` continuous across upgrades and keyboard amends, plus the Hardflip's 70° pitch arc; `spinYaw` continuous
  across the 180 → 360 upgrade and 0 once the spin has finished (a finished 180 hands over to `fakie` on the same
  tick); `fakie` stays true for RULES.revertPoseTicks (3) after a revert, so SK's view sees the 180 land fakie and
  pivots; `bodyYaw` for all 13 grinds (sim › GRIND_BODY_YAW, slides ±90); `height` above the ground under the board.
- **Landing:** the DESIGN §7 edge nudge leaves the board centre ≥ LAND.edgeNudge (0.15 m) inside a raised top's side
  edge (M0 left it 0.02 m inside); same surface, same classification (WG: the validator's landing x may differ by
  ≤ 0.13 m toward the top's centre).
- **Gaps (WG, `Obstacle.gap`):** with `fromObstacle`, paid when an air that started on that obstacle (rolling on its
  top or grinding its edge) ends on this one (landing on its top or locking onto its edge); without it, paid when an
  air spans the obstacle's s-range over its lateral extent (trench, stairs, hops), or, when the air started on the
  gap obstacle itself, when it lands ≥ 0.5 m lower (Dock / Skywalk / Bridge Drop). Once per obstacle per run.
- **Landmarks (`Obstacle.landmark`):** the first grind on it, manual on it, or air trick taken off from / landed on it
  pays +300 once per area visit (`landmark` event + `bonus`).
- **Near miss:** crash-top solids only (not the obstacle being ground or the one the air left); lateral gap ≤ 0.35 m
  to the inset face, or ≤ 0.20 m over its inset top; paid when the board has passed the obstacle's far end, never
  after a side bump on it.
- **Combo heat:** refreshed when a link-adding trick starts (flip, spin, grab, grind, switch, the linked manual,
  Transfer, a linked Revert); not by upgrades, and not by a trick decayed below SCORE.decay.noLinkBelow (repeating one
  trick cannot hold a combo).
- **Manual start on a top:** a HOLD manuals outside a combo on any raised landable top (it has a landable body), not
  only the TOP_KINDS list. The slow-device HOLD note from G0 is mitigated by `manualHoldSec` (a late first touchmove
  ends the hold before the 0.30 s).
- **After the GP review (G1):**
  - `combo.pending` counts up every tick while a grind or manual is ridden (the running entry is live); `trickScored`
    for grinds and manuals still arrives at their end (or at a switch / Nose Manual), with `comboPts` equal to the
    pending value shown. MU: the HUD's last-trick label should also follow `grindStart`, `grindSwitch` and
    `manualStart` (today it updates on `trickScored` only, so it shows the previous trick during a long grind).
  - A gateway bank mid-grind or mid-manual banks the part ridden so far; the rest scores into a new combo (no entry
    points again, no second link), like a flip still rotating at the gateway.
  - A manual outside a combo on a pad / top, from a pre-press or a held grab starts a combo (request 8): MU's combo
    pill appears with it. Back-to-back manuals keep the heat running (request 7); the bank arc shows it shrinking.
  - The link window: a roll-off landing opens it when that air scored a trick or the combo has no running window
    (e.g. the combo began in that air); a plain roll-off still keeps the running window.
  - Grab: a touch HOLD grabs only if that touch went down in this air (a thumb resting since the ground, while
    another finger pops, never grabs; Q still grabs whenever held). Three same-direction picks keep the double
    (←←← Lipslide). A pick in the 0.12 s after lock emits `grindSwitch` with `late: true` (request 6).
  - Recognizer `fromRest`: a sample-less gap of more than 40 ms is a rest that ended one sample interval before the
    next sample, so a still park of ~60 ms (one sample of slack) then a flick is `fromRest` (it needed ~110 ms at
    60 Hz). With tremor samples the 40 ms speed window still applies (~80–95 ms): a dodge's turnaround must not read
    as a rest, so that margin is kept on purpose.

## WG: World-gen (W1b)

### Anti-straight: gate rows instead of A1 column fillers; A1 / A2 measured   (status: info, design deviation for the gate review; no core change)
- File / symbol: world/gen/generator.ts (tryBuild rows), schedule.ts, templates/shared.ts › S_GATE, gen.config.ts › GEN.gate
- Change: none. A1 column fillers cost too much (validation per filler) and failed near the line, so the straight-bot
  guarantee comes from gate rows: a row of the area's tall blockers with 1–2 openings, ≤ `GEN.gate.gap` apart
  (8 / 6.5 / 6.3 / 6.3 s by phase), each opening ≥ 2.4 m from every opening of the previous row (pass zones
  disjoint: no straight lane passes two rows). Rows are overlaid on the template due at the deadline (validated with
  it in one pass) or come as an S_GATE segment; a run's first segment is an at-line S_GATE (its row stands inside
  the spawn grace) so two rows stand within ~4.5 s of any start; a long template drawn while the gate is not due may
  slip the deadline by ≤ its length (not in the first 12 s of a run, nor right before a gateway); a gate due inside
  a gateway comes before it. A1 column coverage and A2 wander (line range ≥ 3 m) are tracked and measured, not
  enforced (no filler / wall insertion). S_GATE may also carry the A3 barrier when both deadlines fall together.
- Why: straight bot 100 % dead by 17.2 s from t = 0 and by 4.4 s / 7.2 s from startT 150 / 165 (gate.straight).
- Local workaround meanwhile: n/a.

### Validator conventions other packages rely on   (status: info; no core change)
- Street base obstacles are `kind: 'curb'` with `params.band` (world/gen BAND_CODE: road 0, sidewalk 1, lawn 2, apron 3,
  dock 4, plaza 5, path 6, tunnel 7); curb grind edges are cut so no edge ends 2.2 s before a gate row or faces a
  blocker in its exit zone. The Docks lip is one persistent `dock_lip` body per visit (0.8 s·v into it) with its edges
  per segment (no joints under a board).
- Stepped bodies (stair rails, hubbas, incline sides): landable pieces sit at the lower end, crash pieces (rails) on
  the higher ground of their piece, so no box height lies in the forbidden band; ride-on slope bodies are exempt
  from the band rule (they are ramps).
- Rule (h) uses one 1/30 s grid slice of tolerance (dead ends measured ≤ 2.033 s): the grid's air reach and slice
  interval are pessimistic. Required ollies never clear a pit longer than 10 slices (no 0.25 s window: plank only).
- `insetOf` (sim's crash-face inset) is exported from world/gen; `planLine` (world/gen) is the validator's planner for bots.
- `GEN_FLAGS.trench` (ON since G0): S_TRENCH in the A3 slots and the Lesson Line's 33–35.5 s pit; off, every A3 slot
  is an S_BARRIER and the Lesson Line uses a barrier there. Read once per Generator.
- Why: hand-off notes. Local workaround: n/a.

### Thumb bot taps are capped at 190 ms where a HOLD would start a manual   (status: info; G1: the pre-press manual now needs the press to go down in that air, sim/landing.ts, after the thumb gate found a tap under way at a curb roll-off)
- File / symbol: debug/bots/thumb.ts; sim interpret (GP) › manualStart on HOLD with an open combo window or on a prop top
- Change: none. TECH §11.2 asks for 60–260 ms taps; a 2nd-finger tap held ≥ 200 ms becomes a HOLD, which on the ground
  starts a manual when the combo window is open or the board is on a prop top (an unintended trick). The bot caps such
  taps at 190 ms, and never puts the tap finger down in the 0.10–0.30 s pre-press window before a touchdown. If GP
  wants 260 ms taps to stay taps there, the recognizer / interpret rule is GP's call.
- Why: 0 unintended tricks (gate.thumb). Local workaround: the cap.

### BOTS.safe is the planner bot now; record sim fixtures with BOTS.conformance   (status: applied @G1: the sim bench records with BOTS.conformance in beforeAll and times only the sim)
- File / symbol: debug/bots/registry.ts › BOTS.safe, BOTS.conformance; tests/unit/sim/bench.test.ts, replay.test.ts (GP)
- Change: none. `BOTS.safe` was the SafeKey follower at M0; it is now the planner bot of TECH §11.2 (delayed view,
  latency, jitter), about 5× costlier per tick to record with. The old behaviour is `BOTS.conformance`. GP's sim bench
  and replay tests record 2-minute runs with `BOTS.safe` and, on a machine at load ≈ 10, can pass their default 5 s
  test timeout (they pass alone in ~5 s). Suggest recording with `BOTS.conformance` (or a longer timeout).
- Why: hand-off. Local workaround: the safe bot re-plans only when its view changed (≥ every 0.3 s).

### Decor anchors   (status: info for WA; no core change)
- Decor records use only `DECOR_KINDS` with their documented params; billboards stand at |x| ≥ 4.9 (inner edge); end
  walls every 8–12 s of an area visit; shadow casters, lantern strings and blade signs follow the area recipes in
  world/gen/decor.ts. Backdrop buildings keep their parameter ranges (w 6–14, d 8–30, h 6–40 m).
- Why: hand-off. Local workaround: n/a.

### After the WG review (appended; supersedes the gate-row numbers above; no core change)   (status: info for the G1 gate)
- File / symbol: world/gen/rows.ts, generator.ts (row overlays), schedule.ts, gen.config.ts › GEN.gate / GEN.a3; tests/bots/*.
- Change: none to core. What the gate should know:
  - **After a fallback** the next segment draws a template first (no re-plan cascade) and a missed row deadline moves
    on by one template (`GEN.gate.fallbackDefer`).
  - **Anti-straight rows by lanes** (rows.ts): a row's *lanes* are the board-centre x ranges a straight roller passes
    it through (openings and any side gap beside a template obstacle, scanned from the solids); every row's lanes are
    disjoint from the previous row's. Rows ≤ `GEN.gate.gap` apart (8 / 6.3 / 6.3 / 6.3 s); a long template may still
    slip the deadline by ≤ its length outside a run's first 12 s and with 2 s left before a gateway. Rows are drawn
    from a mixed palette of the area kit (DT news box, trash can, café set, kiosk; SB mailbox, bin pair; IN tall
    pallet, 2- and 3-drum skids; NE lantern stand, 1- and 2-machine vending banks, food cart), all `ObTag.Filler`.
  - **Rows inside templates** first where the template's own line already passes (opening at the line), else as a
    tail after its content (the segment grows), else with one forced move; never beside a grind edge a rider is still
    on, and only where a rider leaving any template edge (±0.8 m) reaches an opening (T_SHIFT + 0.5 s). S_GATE is the
    fallback (≈ 42 % of run time, as before the review: the row cadence is the binding constraint).
  - **Straight-bot guarantee** (gate.straight): t = 0 → all lanes dead by 17.2 s; startT 150 / 165 → ≤ 10 s. Beyond the
    acceptance, measured: plateau starts every 10 s from 150–460 s → 2.2 % of lanes live > 10 s, worst 13.1 s (all
    next to a gateway: 4 s of T0 between two rows); switching to straight mid-run → 7.6 % > 10 s, worst 16.3 s (same
    cause). A1 per-column periods (4 s at the plateau) are measured, not enforced; A2 likewise (wander wall when due).
  - **Docks**: rows stop at the lip (its body blocks a straight roller; row lanes count it); base curb / lip edges end
    `GEN.gate.edgeBan` = 3.0 s before a row (a rider coming off the lip reaches the opening).
  - **Bots**: the thumb bot applies a targetX change the sim made itself once (its in-flight moves shift with it; the
    old loop diverged into ±4.3 m flicks on some streets) and steers at most at the planned lateral rate.
  - **A3**: never before its minimum (8 s; 12 s in the opening) except the last slot before a gateway (≤ 2.5 s early,
    `a3PreGwEarly`); the maximum may slip ≤ 2 s when a long template lands on it.
  - **Rejection metrics** (gate.static, artifacts/bots.json): validator re-rolls per segment (the < 5 % gate),
    fallbacks per segment (< 1 %), every failed `validate()` incl. row-overlay probes and edge trims
    (`validationFailRate`, ≈ 11–14 %, gated < 20 %), and scheduling re-plans per segment (`replanRate`, reported).
  - **Bench** (tests/unit/gen/bench.test.ts): world/gen bundled with Vite's production build (Rollup) and run by plain
    Node in a child process, fastest of 3 passes per segment, p95 ≤ 3 ms. Vitest's module transform costs this code
    ~2.5×; the old in-vitest bench measured that.
  - **Docks lip** starts `GEN.lipLead` (1.8 s) into a visit, not 0.8 s (a line by the right wall after the Level
    Crossing steers off first; otherwise the lip's magnet captured it).
  - **Rule (h)** has no slice tolerance any more (dead ends ≤ 2.0 s on the grid).
  - **Content**: landmarks are drawn 4× until seen in a visit; NE_GAUNTLET also fills Neon A3 slots from T3; DT_RUSH
    reworked (cars from 1.5 s in); the Harbor Bridge deck stands on every visit (incline from 0.4 s in).
- Why: review fixes B1, B2 (partly), M1 (partly), M2, M3, M4, M7.
- Local workaround meanwhile: n/a.

### Merge risks for the gate (WG ↔ GP / WA)   (status: info for G1; no core change)
- The thumb bot imports `FrameBuilder` and `steerMetresPerPx` from `input/index.ts` (not frozen; TECH §11.2 names
  `frames.ts`). If GP renamed them, re-point debug/bots/thumb.ts at the new names (no behaviour change needed).
- The trick bot now reads the frozen `TRICKS` tables (core TrickTables), not `FLIPS` / `SPINS`.
- GP's sim bench records with `BOTS.safe` (the planner): see the G1 notes (make the bench time the sim only).
- WA: the row palette above uses existing PropKinds only; `Decor.y` for awnings / blade signs / banners is the
  mounting height (sidewalk + 2.4–3 m), see the G1 decision on Decor.y semantics. Overhead decor is sparser now
  (Neon lantern strings ~26 m apart, Suburbs wires ~32 m: `GEN.decorOverhead`).

## WA: World art (W2a)

### App: put the camera in 'title' on the Title screen   (status: applied @G1: game/app.ts; the Title and the menus opened from it use 'title', Locker / Shop 'locker'; home() resets the sim to the seed-1 preview)
- File / symbol: game/app.ts › boot() / home() / open() (the two `TODO(WA)` lines)
- Change: `this.setCamera('title')` when the Title screen opens (boot and home), `'run'` when a run starts, `'locker'` for Locker / Shop as now. The rig already implements all three (world/render/camera.ts: the 'title' mode is the static perspective diorama; menu cameras see the sky layer).
- Why: the Title diorama (DESIGN §18.7) only shows when the rig is in 'title'; today the Title sits on the ortho run camera.
- Local workaround meanwhile: none (gallery `title` scenes and `ui('locker')` show the menu cameras). The portrait Title framing (TITLE_CAM.portrait) shows the whole rider in the lower third with the sun glow and clouds over the vanishing point; coins keep their true size in menu cameras.

### Quality setting → WorldView: an explicit auto-quality switch   (status: applied @G1: `WorldView.setAutoQuality?`; wiring calls it from applySettings; the localStorage read stays only as the fallback before the App calls it)
- File / symbol: core/view.ts › WorldView
- Change: `setAutoQuality?(on: boolean): void;` (App calls it from the saved setting and on Settings changes).
- Why: auto-adjust (TECH §8.9) must stay off when the player picked a tier. world/render reads it today without a contract.
- Local workaround meanwhile: world/render/view.ts reads `localStorage['dusklane.save']` read-only (quality ≠ 'auto' → off) at start and every 2 s (so picking 'auto' again turns it back on), and turns auto off for `?quality=`, `navigator.webdriver` and right after an external `setQuality`.

### Vfx reduced motion from the setting   (status: applied @G1: `Vfx.setReducedMotion?`; wiring passes reducedMotion || !effects)
- File / symbol: core/view.ts › Vfx
- Change: `setReducedMotion?(on: boolean): void;` (App calls it with settings.reducedMotion).
- Why: DESIGN §18.8 reduced motion (no speed lines, no ambient drift, camera shake off). vfx/ implements it; the rig's shake is off with it too.
- Local workaround meanwhile: vfx/ and the rig follow `matchMedia('(prefers-reduced-motion: reduce)')`; `VfxImpl.setReducedMotion` exists.

### Contrast gate: measure the hazard silhouette, not the hull of its box   (status: applied @G1: patch applied, readWorldPoints exported from gfx/index.ts; still strict: road-coloured Downtown hazards read 1.47)
- File / symbol: debug/contrast.ts › measureContrast (hazard items). Exact patch: `tests/unit/render/contrast-silhouette.diff` (`git apply tests/unit/render/contrast-silhouette.diff`, ~40 lines).
- Change: (1) the silhouette of a crash solid is the pixels inside its projected hull whose visible surface lies inside that box and more than 2.5 cm above the ground under it (new `gfx/silhouette.ts › readWorldPoints`: the scene rendered once more into a depth texture with the same materials, unprojected per pixel; the ground is `WorldQuery.groundAt`). Without a read-back it falls back to today's hull. (2) A thin grindable (a crash solid ≤ 0.35 m across with one of its obstacle's non-pick grind edges along its top: handrail, flatbar, ibeam, dock lip) is held to the edge rule only.
- Why: DESIGN §18.4 asks for the "hazard silhouette (mean rendered luminance, accent included)". The hull counts the road seen between a barrier's bollards, past a car's bonnet or round a bin as hazard, so the only way to pass it was the near-black "ink pool" painted over each hull (the G1 review's black slabs). With the patch the pools are gone: real contact shadows, lighter tops, bollards and chains that read as objects (the brief allows the gate change: "the gate may measure silhouettes the way DESIGN §18.4 intends").
- Measured (`shots --contrast`, seed 1, 32 presets / blends, 390×844 + 1280×800): WA alone + patch: all pass, min hazard 2.61, min edge 2.41. WA + WG (2282568) + patch: all pass, min hazard 2.83, min edge 2.26. WA alone without the patch fails (min hazard 1.98: bins and news boxes whose hull corners show road). The gallery (`tests/unit/render/gallery.mjs`) uses the same gate and exits 1 on a run-view failure.
- Local workaround meanwhile: none (without the patch `shots --contrast` fails on pkg/wa).

### Decor.y of hung side kinds   (status: applied @G1 with the opposite convention: `y` is the surface it hangs from for every non-overhead kind, and awning / blade_sign / banner get a documented `mount` param; WG emits y = sidewalk + mount 2.6 / 2.8 / 2.4 / 3.0, WA draws at y + mount, its two-way heuristic removed; TECH §4.14)
- File / symbol: core/decor.ts › header "Field conventions" (`y`).
- Change: add "Side kinds hung on a facade or a post (awning, blade_sign, banner) give their lowest point in `y`, like overhead kinds" (what world/gen emits: sidewalk + 2.6 / 2.8 / 2.4 / 3.0 m).
- Why: WA added its own mounting height on top of WG's, so awnings floated at the second floor in the merged game.
- Local workaround meanwhile: world/render/kits/decor.ts › `hungY`: a `y` ≥ 1.2 m above the sidewalk edge is the lowest point; a ground-level `y` gets the kind's default mount (HUNG). Unit-tested both ways.

### Auto-adjust tier changes → the 'quality' app event   (status: applied @G1 in wiring only (no core change): render() compares gfx.quality with the last reported tier and emits appBus 'quality')
- File / symbol: core/view.ts › WorldView (or game/wiring.ts only)
- Change: `onQualityChange?(cb: (tier: QualityTier) => void): void;` on WorldView, or wiring compares `gfx.quality` with its own `tier` once per frame and emits `appBus { t: 'quality', tier }` on a change.
- Why: auto-adjust (world/render/quality.ts) lowers the tier mid-run through setGfxQuality; nothing tells MU's overlay (the grain should go with the low tier) or the analytics.
- Local workaround meanwhile: none. (A mid-run step now changes only the pixel ratio; the shadow map follows at the next run start, so no program recompiles mid-run.)

### Shared uniforms and palette routing in gfx/   (status: info; gfx edits WA made, additive)
- gfx/uniforms.ts (new): `sharedUniforms(ctx)` (uDesat, uTime, haze, emissive / glow / window-lit scales, sky colours) and `GRADING_PARS` (`dlGrade`). SK can now patch the toon materials with `sharedUniforms(ctx).uDesat` (the deferred SK request above).
- gfx/renderer.ts: `palette(area, blend)` routes through `setPaletteSource(ctx, f)` (world/render installs its presets; GOLDEN without it); `getHemi(ctx)`. gfx/index.ts exports them. `setGfxQuality(ctx, q, keepShadows = false)`: WA's mid-run auto-adjust passes true (pixel ratio now, shadow map at the next run start: no program recompile mid-run); every existing caller is unchanged.
- gfx/silhouette.ts (new, debug only): `readWorldPoints(renderer, scene, camera, w, h)` for the contrast gate patch.

### Notes for WG (no contract change)
- Decor beyond the dock lip (water side) and gaps between side buildings on the sun side give the long sun stripes their depth; both read well and are worth keeping in the layouts.
- Landscape (yaw > 0): camera-side (+x) decor now hides only when one of its vertices would cover the corridor on screen (`x − y·sin ψ·cot θ < 4.1`); low props at |x| ≥ 5.1 (bins, planters, bikes, benches ≤ ~1.2 m) keep drawing.
- The street base follows the datum: after a full-width drop WA's road and verges sit at the lowest ground slab across the corridor (WG's street-base bands), split at slab ends. Curb stones are drawn only on `params.band` 1 (sidewalk) bands.
- Gateway blends: road colour and hazard looks switch at one s per blend (the weight's 0.5 crossing) moved off every hazard; an obstacle keeps the look of its own `area` (from-area ones before the switch, to-area ones after). Keep `Obstacle.area` = the area whose kit it is.

### Notes for the gate (behaviour other packages can rely on)
- `__skate.ext.world()` (WorldView debug info) adds `mainCalls`, `shadowCalls`, `chunksBuilt`, `cacheHits`, `buildMsP95` (build work per frame that built), `chunkMsP95` (per finished chunk), `pending`, `warmupMs`, `bench(n, index)` and `obstacles(id?)`; wa.spec reads them.
- Chunk building (TECH §8.6): a chunk not on screen yet is built in resumable steps (`buildChunkSteps`) within `STREAM.sliceMs` (1.5 ms) of the frame start; a chunk already on screen (debug `step(n)` jumps) is built at once; the first frame of a run builds or restores exactly the 3 chunks around the start. Every kit runs once per area in idle callbacks at boot (`world/render/warmup.ts`). `perf().buildMs` is therefore the per-frame build work; wa.spec gates single builds of every streamed chunk (p95 ≤ 4 ms over ~80 chunks, after a 1 px read-back so SwiftShader's rasterisation does not race the timer).
- `shots --contrast`: see the silhouette request above (apply the patch at G1). 4 of the 32 frames (the 0.25 gateway blends) still have no hazard in view; shots.mjs could sample further into the blend.
- Palette deviations from DESIGN §18.1 (the gate is the source of truth): asphalt `#7F7890` (DESIGN `#79728A`), Neon hemi sky `#A69CD8` (`#8C8CE0`), hazard bodies `#170F24` with tops `#4A3B6B` (ink `#2B2140`): a slightly lighter road and darker bodies keep ink hazards ≥ 2.5:1 in building shadows while their tops read as volumes.
- Bundle: pkg/wa builds to 324 KB gzip (M0 268; world/render + vfx ≈ 58 KB of it). With WG the review measured 354 KB, over the 350 KB of TECH §8.4 before MU and GP land: G1 has to re-budget or split (e.g. load debug/ and the menu sky lazily); WA found no ~30 KB to cut without dropping kits.

## SK: Skater and cosmetics (W2b)

### Shared crash-desaturation uniform for the skater materials   (status: applied @G1: skater toon and outline materials take gfx `sharedUniforms(ctx).uDesat` by reference)
- File / symbol: gfx/index.ts (INT/WA) › a shared `{ uDesat: IUniform<number> }` (DESIGN §18.8 "40% desaturate through a shared material uniform").
- Change: `export function sharedUniforms(ctx: GfxContext): { uDesat: IUniform<number> }` (one object per context).
- Why: the skater's toon materials patch their shaders (skater/materials.ts); with the shared uniform they would desaturate with the world during the crash slow-mo instead of staying fully saturated.
- Local workaround meanwhile: none (the skater stays saturated during a crash).

### Vfx emitter for the legendary effects   (status: applied @G0 as optional `Vfx.emit?`; no implementation until WA / M5)
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

### Design question: board identity in the run at 31 px   (status: accepted @G1 by the design owner: a thin palette-coloured grip border, one tunable in skater.config.ts, default on; not built at G1, M5)
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

### App: open a menu screen from another menu screen   (status: applied @G1: game/app.ts accepts `open` from locker / shop / crates / stats / rewards / settings (not over Pause))
- File / symbol: game/app.ts › onIntent('open') (INT)
- Change: also accept `{ k: 'open', screen }` while the current screen is `locker`, `shop`, `crates`, `stats`, `rewards` (and `settings` when it was not opened over Pause), going through the same `open(screen)` path.
- Why: Locker "Get more" → Shop, Shop → Crates, Crates → Shop and the Results reward rows link menus to each other (DESIGN §17.1).
- Local workaround meanwhile: `ui/index.ts › ctx.go(screen)` raises `{ k: 'home' }` and then `{ k: 'open', screen }` when the current screen is a menu (both synchronous, so the Title never paints). It keeps working unchanged once the App accepts the direct open.

### UI: the real monetization provider   (status: applied @G1: `UiApi.setMonetization?` in core/ui.ts; wiring passes the shared provider)
- File / symbol: game/wiring.ts (INT) › after `createUi(root)`; optionally core/ui.ts › `UiApi.setMonetization?(p: MonetizationProvider): void`
- Change: `(ui as { setMonetization?(p: MonetizationProvider): void }).setMonetization?.(monetization);`
- Why: DESIGN §20 / TECH §4.10: "the UI shows an offer only if eligible() && provider.isAdReady()". The UI runs the whole rewarded flow (Results `results_double_coins` slot: policy `meta/offers.ts` → `provider.showRewarded` → `MetaExt.grantOffer`), so App can keep ignoring `{ k: 'rewarded' }` (it is still raised).
- Local workaround meanwhile: `ui/index.ts` makes its own provider with `platform › createMonetization({ fakeAds: readFlags().fakeAds })`: the NullProvider in production (no ad UI ever shows), the FakeProvider with `?fakeads=1`. Remove the fallback when wiring injects the shared one.

### Back up / Restore performed by the UI   (status: info; accepted @G1: the App keeps ignoring the `backup` / `restore` intents)
- File / symbol: core/ui.ts › UiIntent `backup` / `restore` (no change)
- Behaviour: Settings › Export shows `SaveStore.export()` (copy, download, share); Restore takes a pasted code or a picked file, asks once, calls `SaveStore.import(json)` through `MetaExt.importSave`, then **reloads the page** so every module (settings, loadout, audio volumes, quality) re-reads the restored save. Both intents are still raised for the App. G3: the App may keep ignoring them; if it handles `restore`, it must not import a second time (harmless, but pointless) and should not fight the reload.

### SaveV1.daily: the day the rewarded gift bonus was used   (status: applied @G1 as `giftBonusDay?`)
- File / symbol: core/save.ts › SaveV1['daily']
- Change: `giftBonusDay?: string | null;   // YYYY-MM-DD the daily_gift_bonus offer was granted (once per day, DESIGN §20)`
- Why: `daily_gift_bonus` is "once per day"; `adsDay`/`adsCount` count every rewarded ad.
- Local workaround meanwhile: `save/schema.ts › SaveDailyExt`, kept by `save/sanitize.ts` when present; `meta/offers.ts` reads it.

### run_end with the DESIGN §21 properties   (status: applied @G1: App tracks run_end once per run with runEndProps (passed in by wiring); retry_kind 'instant' at an instant retry, 'results' once Results show)
- File / symbol: game/app.ts › onCrash / retry (INT)
- Change: track `run_end` with `meta/index.ts › runEndProps(result, rewards, retryKind)` (score, distance_m, duration_s, area_reached, max_speed, best_combo, coins, xp, new_best, lost_combo, retry_kind). The retry kind is known at the retry tap ('instant') or at ROLL AGAIN ('results').
- Why: the App tracks `run_end` with score and distance only. Meta/UI already track their own events: `level_up`, `trick_counts`, `shop_purchase`, `crate_open`, `equip`, `wishlist_set` (meta), and `crash`, `combo_banked` (aggregated per run), `area_reached`, `hint_shown`, `shop_view`, `rewarded_offer_shown/_accepted/_completed` (ui). `hint_learned` belongs to the onboarding driver (M4).

### For GP / INT: a layout read on every touch-down   (status: applied @G1: createInput takes an optional `screenH` (the cached viewport height) from wiring; TECH §4.13)
- File / symbol: input/index.ts › `syncMetrics` (reads `window.innerHeight` on each pointer `down`)
- Why: TECH §9 "nothing reads layout during a run"; the dev guard (`ui/guard.ts`, `window.__dusklaneUi.guard` in debug builds) counts it. `innerHeight` can force a style/layout flush. Suggest reading it from the viewport (`opts`) like `screenW`, refreshed on resize. ui.spec drives its guard run with keys for that reason.

### Notes for the gate (behaviour other packages can rely on; no contract change)
- **Hooks kept from M0-io / G0:** `data-hud="score|dist|combo|trick|coins|pause"` on the band pieces, `hud.preview(values | null)`, `hud.hint(id)` with `HINT_TEXT` (now in `ui/hints.ts`, re-exported from `ui/index.ts`; the G0 wording is unchanged, `keys` is still the full key sentence), the chip at `position: fixed` ~13% above the bottom with `pointer-events: none` and no `data-hud` (it rises above the "rest here" ring on touch in runs 1–3), the ink scrim and the DIST label, `ui/format.ts crashCause` (teaching lines unchanged). shots `--hud` passes at 320 / 360 / 390.
- **HudExt additions** (duck-typed, `ui/hud.ts`): `onGame(e)` (popups, bank float, speed stamps, area card), `rewardToast(text)`, `setFirstRuns(on)`, `relayout(vw, safeL, safeR)`, `stats()`. `UiExt` (`createUiImpl`): `setMonetization(p)`, `guard`. The frozen factory still returns `UiApi`.
- **MetaExt** (`meta/index.ts › isMetaExt`): a read view of the save plus unlocks, pity, offers, `lastRun()` (the instant-retry toast), `track()`, `exportSave / importSave / resetProgress`. The UI uses only this and the frozen MetaApi.
- **Economy invariants:** `RunResult.coins` is pickups only and `coinPayouts` the combo payouts (as the M0 sim does; GP keep it). `applyRun` is idempotent per `runId` and flushes; the Level 2 "guaranteed Rare skater" crate is rolled at applyRun and written to `crates.pending` (pre-committed). **What a crate holds is granted when its reveal opens the lid** (`MetaApi.ackReveal`), never at the roll, so the Locker, the NEW badges and the toast can't spoil it; a result rolled while another reveal is still unopened is queued (`crates.queue`, below), never lost. Results opens the Level 2 crate by itself once the XP bar has filled (3 taps → "Equip now?" → Back to Results); ROLL AGAIN before that skips it, and the Title then opens it once per session ("Later" is honoured). M4's "the crate reveals a Rare skater + Equip now?" is this flow. The shop and crate purchases open at Level 3 (try-on stays free). `storage.persist()` is asked once after run 1 (`onboarding.persistAsked`); `onboarding.crashStreak` is maintained per run for M4's hint re-arming; `onboarding.lessonDone` is left to M4.
- **App bus events the UI emits** (for AU): `ui {sfx}` on every button, `crateShake n`, `crateReveal`, `itemGranted`, `coinsChanged`, `purchase`, `levelUp` (when the Results XP bar crosses a level, not at applyRun), `settings {key}`.
- **Settings the UI also applies itself:** `effects` / `reducedMotion` / `quality` drive the lo-fi overlay (`#lofi`, MU) directly; the App's `applySettings` still owns everything else. "Reduce effects" should also stop WA's speed lines (G3 wiring through `save.settings.effects`).
- **Debug hook for the e2e:** debug builds expose `window.__dusklaneUi` (`guard`, `hudStats()`, `current()`, `reveal()`, `modalOpen()`); `tests/e2e/ui.spec.ts` uses it.

### Area timeline constants in core   (status: applied @G1: FIRST_VISIT_SEC / VISIT_SEC / GATEWAY_SEC in core/tuning.ts; world/gen/areas.ts re-exports, meta reads them)
- File / symbol: core/tuning.ts (next to `ROLLOUT_SEC`, `LESSON_SEC`)
- Change: `export const FIRST_VISIT_SEC = 40, VISIT_SEC = 35, GATEWAY_SEC = 4;   // DESIGN §12.1 area timeline (world/gen/areas.ts re-exports them)`
- Why: the Results "next area" goal (`meta/results.ts › arrivalDistance`) needs the timeline; importing `world/gen` (WG's internals) from meta is a merge risk.
- Local workaround meanwhile: `meta/results.ts › AREA_TIMELINE` mirrors 40 / 35 / 4; `tests/unit/meta/economy.test.ts` pins it against the frozen `WorldGen.areaAt`, so a WG change fails there, not silently on Results.

### SaveV1.crates: reveals queued behind the pending one   (status: applied @G1 as `queue?`)
- File / symbol: core/save.ts › SaveV1['crates']
- Change: `queue?: { tier: CrateTier; rarity: string; item: ItemId | null; coins: number; dup: boolean }[];   // pre-committed results waiting behind pending (granted at their reveal)`
- Why: crate contents are granted at the reveal, so a second rolled result (the Level 2 crate after an abandoned gift reveal) must persist, not overwrite or drop.
- Local workaround meanwhile: `save/schema.ts › SaveCratesExt` (kept by `save/sanitize.ts`, at most 8, absent when empty); `meta/results.ts › pendingReveals / ackPending`.

### After the review (appended; no core change)
- **Fixed:** run 1's goal line said "Level 3 in 1 XP" (a level the held XP already guarantees is no longer a goal); the HUD bank ring no longer imports `tricks` `SCORE` (normalised by the longest `bankIn` since the last link); meta no longer imports `world/gen`; the Shop fits 320 × 568 (compact picks, one-line lock chip, a full card row above the detail bar); the goal line sits under the Results score; the crash clears the bank float / speed stamp / area card; the hint chip rises with a transform and hides under Pause; the reward toast never splits a chunk; `combo_banked` is sent once per run however it ends; Pause lists the active key preset; the `daily_gift_bonus` slot exists on Crates (eligible() && isAdReady(), so never with the NullProvider); menu backdrops are opaque.
- **Mirrors pinned by tests** (save/ may not import meta/): `save/defaults.ts` crate meter `nextAt` 4000 = `CRATE_METER.first`, `save/sanitize.ts` Cardboard max 2 = `CRATE_HELD_MAX.cardboard`.
- **For M4 (first-3-runs pacing, game/app.ts):** a fresh tap ≥ 0.6 s after run 1's crash still instant-retries, so that player meets the Level 2 crate on the Title (or the next Results row), not before run 2. If M4 wants "run 2 rides as the new skater" for everyone, skip the instant-retry window on the run whose rewards carry `RunRewardsExt.pending` (one `isRewardsExt(r) && r.pending` check in `onCrash`); the UI handles both paths already.

### Final pass (appended; no core change)
- **Crates prefer items no later level reward grants** (`meta/results.ts › reservedByLevels`, `rollCrate({ reserved })`): the Level 2 "guaranteed Rare skater" is Rook, Lark or Kofi, never Ines (the Level 15 reward) while one of those is unowned. Odds per rarity are unchanged; the fallback is any unowned item, then a duplicate.
- **The first run of a new day refreshes today's Shop picks** at `applyRun` (same `featuredFor(day, owned)` the Shop uses), so the goal line, `RunRewards.wishlist.need` and the Results wishlist bar quote one price.

## AU: Audio (W3b)

### How AU uses the frozen hooks   (status: info)
- **Per-frame layers.** `audio.roll(speed01, surface, airborne, manual)` drives the rolling loop (band-pass 300 + 900·speed01 Hz, surface variants, joint ticks by distance, 40 ms fade + 0.4 s wheel whir when `airborne`, 2-wheel tone when `manual`) and the wind bed (from 8.0 m/s, i.e. `speed01 · V_MAX`). It is also the frame clock: it ticks the music scheduler and closes the per-frame perf sample. `audio.grind(active, material, slide)` builds the material loop on the first active frame and releases it (60 ms) on the first inactive one; `slide` adds the deck scrape. Both are silent unless `setScene('run')`.
- **Nothing else is needed from game/.** `attach()` plus `setScene()` drive the music: `runStart` resets the run (start area, speed level, combo filter, coin climb; needle drop after a tape stop), `speedTier` sets the base level (FLOW → 2), `trickScored` plays `note(seq)` and sets the combo filter from `max(1, links)`, `comboBanked`/`comboLost` close it, `gatewayEnter` / `areaEnter` pivot and crossfade, a non-god `crash` tape-stops; Results and Menu bring the music back at level 0. `music.start / setArea / setIntensity / setComboFilter / duck / stop` stay available (G3 may call them; they are idempotent with the bindings). `setIntensity(level)` is the speed-derived *base* level; the engine plays `max(base, combo level)` in the run scene and 0 elsewhere.
- **Boot.** `createAudio()` (wiring, at boot) queues every pre-rendered buffer (noise loops, vinyl, joint ticks, five drum kits; `audio/bank.ts`) and builds them in `requestIdleCallback` slices (setTimeout where there is none), ~200–300 ms of idle work done within ~1.5 s of boot, so the unlocking tap only creates nodes (~10–30 ms). A tap before that waits for the noise and the first kits in short tasks; the music then starts a few hundred ms late, never as one long task. Keep `createAudio()` at boot, not on the first gesture.
- **Unlock.** Every `input.onAnyInput` while `!audio.unlocked` calls `unlock()` (creates the context on the first gesture, `audioSession.type = 'ambient'`, 1-sample buffer, `resume()`). The engine itself suspends on `visibilitychange` hidden and resumes on visible; `unlock()` from any later gesture resumes too. With both sliders at 0 (`setVolumes`) the context is suspended and `unlocked` stays true once it has run; raising a slider resumes it.
- **Offline.** `renderOffline(area, sec)` = 20 s of the area at plateau speed (FLOW, mid-song, roll bed, wind, ambience, a few tricks) on the live graph code, default sliders, 48 kHz, deterministic per area. `tests/unit/audio/render-check.mjs` (PORT=5184) renders and analyses it (plus stems, scene changes and a skilled line through the debug-only `window.__skateAudio.renderScene`); G3 can run it next to `shots --audio`.
- **G0 merge note.** ROADMAP M0 / SCHEDULE also list an `audio.spec` for M0-io; pkg/m0-io had none when AU finished. If one appears, keep AU's `tests/e2e/audio.spec.ts` (it covers unlock, mute and the 2-minute run) and fold any extra M0-io assertion into it.

### DebugAPI.audio(): context state and cost   (status: applied @G0; debug/api.ts passes `stats().contextState` and the AU debug numbers through)
- File / symbol: core/debug.ts › DebugAPI.audio
- Change: `audio(): { unlocked: boolean; voices: number; scene: string; intensity: number; contextState?: string; msPerFrame?: number; voicePeak?: number; voicesDropped?: number }` and in debug/api.ts pass through `host.audio.stats().contextState` plus the AU debug numbers (`perf().msPerFrame` is the whole-session average since attach).
- Why: audio.spec asserts "context state running" and the ≤ 0.3 ms/frame budget through the frozen API.
- Local workaround meanwhile: debug builds (`?debug=1` / dev) expose `window.__skateAudio` (`AudioDebug` from audio/index.ts: `stats()`, `perf()`, `renderScene()`); audio.spec reads it.

### SfxId: the internal cues   (status: applied @G0; audio/engine.ts `Cue` is now SfxId)
- File / symbol: core/audio.ts › SfxId
- Change: `| 'spin' | 'revert' | 'pickChime' | 'rewind' | 'needle' | 'grindSwitch'`
- Why: DESIGN §9/§19.3 sounds that exist and are bound to events (spin swish, revert scuff, pick-window chime, lesson rewind, needle lift after the tape stop, grind switch) but cannot be requested through `audio.sfx()` by UI or tests.
- Local workaround meanwhile: `Cue` in audio/engine.ts (SfxId ∪ those six); bindings use it, `audio.sfx()` accepts only SfxId.

### runStart: start area   (status: applied @G0; the sim emits `startArea` (default 'downtown'); AU may read it when Start District lands)
- File / symbol: core/events.ts › GameEvent 'runStart'
- Change: `{ t: 'runStart'; tick: number; seed: number; mode: 'lesson' | 'normal'; startArea?: AreaId }`
- Why: the run song should start in the start area's key when Start District (M5) lands, without waiting for an `areaEnter`.
- Local workaround meanwhile: runs start in Downtown; an `areaEnter` at tick 1 (debug `startT`, `startArea`) pivots to the right song at the next bar line.

### smoke.spec: renderAudio is no longer null   (status: applied @G0)
- File / symbol: tests/e2e/smoke.spec.ts › "__skate.ui() goes through the app…" (line 204)
- Change: the stub-era `expect(await renderAudio('downtown', 1)).toBeNull()` becomes, for example,
  `const r = await page.evaluate(() => window.__skate!.renderAudio!('downtown', 1)); expect(r!.sec).toBeCloseTo(1, 2); expect(r!.peak).toBeGreaterThan(0.01); expect(r!.peak).toBeLessThan(0.9);`
- Why: AU ships `renderOffline` (TECH §4.13, as the debug.ts doc comment anticipates: "resolves null until AU ships"), so this one assertion fails on pkg/au in both projects; every other smoke test passes with audio on. AU may not edit smoke.spec.
- Local workaround meanwhile: none (the assertion contradicts the deliverable); tests/unit/audio/render-check.mjs covers renderAudio.

## CTL: Two-thumb controls (owner playtest, after G1)

The owner played the G1 build on a phone and asked for "steering on the left thumb and tricks on the right thumb, still
swiping the way it works now" (DESIGN §24 row 71). Built on `pkg/ctl` from DEV `f543ced`. The split lives in the
recognizer, so the frozen `InputFrame`, the sim, scoring, the generator, replays and golden hashes are untouched.

### Core additions (additive, optional; status: applied @ctl, confirmed and merged into DEV at G1b; TECH §4.4 / §4.9 updated)
- `core/input.ts › PointerSample.pointerType?: 'mouse' | 'touch' | 'pen'` (input/pointer.ts stamps it; absent = touch,
  so synthetic traces and bots are touches).
- `core/input.ts › RecognizerConfig.controls?: 'two' | 'one'; swapSides?: boolean; splitFrac?: number` (absent = two,
  false, 0.5). `input/recognizer.ts › RecognizerConfigExt` makes them required; `DEFAULT_RECOGNIZER.controls = 'two'`.
- `core/input.ts › InputSource.setControls?(controls, swapSides)` (input/index.ts implements it; touches already down
  keep their role).
- `core/save.ts › SaveV1.settings.controls?: 'two' | 'one'; swapSides?: boolean`. `save/defaults.ts` DEFAULT_SETTINGS
  `controls: 'two', swapSides: false`; `save/sanitize.ts` fills both for every save (older saves get the defaults; junk
  falls back). The App's settings intent writes them like any other key (they are always present after sanitize).
- `core/save.ts › SaveV1.onboarding.twoThumbIntro?: number` (review fix, the one-run re-teach, DESIGN §12.5): −1 = due,
  n > 0 = shown in run n, 0 / absent = not needed. `save/sanitize.ts` sets −1 for a stored save with
  `onboarding.runsStarted > 3` and no `settings.controls` (a profile from before two thumbs), else keeps the stored value
  (clamped ≥ −1) or 0; `save/defaults.ts` new profiles 0.

### Rules (DESIGN §4.1–4.4; one thumb in §4.7)
- At `down` each touch gets a role from `roleOf(x, pointerType, config)`: `both` for `controls: 'one'` or a mouse / pen
  pointer (the G1 grammar, unchanged); otherwise `steer` when `x < splitFrac · screenW` (the left half; mirrored by
  `swapSides`; x exactly on the midline is the right), else `trick`. The role lasts until up / cancel.
- `steer`: never HOLD, never `press`, `tap`, `swipe`, `holdStart` / `holdEnd` or the long tap; it can own steering (the
  first steer touch to cross SLOP, counted from touch-down, gain 1.0, lift holds the line).
- `trick`: the full tap / hold / long-tap / swipe / press machine, but never owns steering, so its swipes carry `dxPx` 0
  and `steer` false (normal thresholds and sectors; arc compensation kept). Nothing for the sim to subtract.

- Steering hand-over (review fix, DESIGN §4.2 Multi-touch): once the owner lifts or cancels, a `steer` DRAG that is
  already down takes ownership on its next sideways move, from where it is then (`one` keeps "the next touch to cross
  SLOP").

### Files touched
- input: `recognizer.ts` (roles, `roleOf`, config, the steer-zone hand-over), `pointer.ts` (pointerType), `index.ts`
  (`setControls`, exports).
- game: `wiring.ts` (`applySettings` → `input.setControls?.(st.controls ?? 'two', st.swapSides ?? false)`; the
  `FirstRunHints` gets `{ save, touch }`), `onboarding.ts` (`FirstRunOptions`, the two-thumb re-teach that marks
  `onboarding.twoThumbIntro`, `isTwoThumbIntroRun`).
- debug: `api.ts` (`syncSynth` copies controls / swapSides / splitFrac from the live pipeline: manual-mode
  `__skate.pointer()` follows the setting); `bots/thumb.ts` (two profiles), `bots/registry.ts` (`BotOptions.layout`,
  `grammar`), `bots/harness.ts` (`BotRun.bot`: the gate reports the ThumbBot's gesture counts).
- save: `defaults.ts`, `sanitize.ts`. ui: `hints.ts` (two rings, two-thumb wording `HINT_TEXT[id].twoThumb` / `side`,
  `touchText()`, the zone cue and its "STEER ↔" / "TRICKS" pad labels, the hovering trick ghost, `Hints.pointer` for
  the wrong-side pulses), `hud.ts` (`HudExt.setControls`), `index.ts` (syncs the setting at attach, every runStart and
  every `settings` app event for `controls` / `swapSides`; the re-teach run's rings and toasts; passive window-capture
  touch listeners feeding `hints.pointer`), `screens/settings.ts` (Touch controls "touch screens only", Swap sides
  dimmed with One thumb; rows carry `data-setting`), `ui.config.ts` (`ZONE_CUE`, `WRONG_SIDE`, `TOAST.introMs`),
  `index.ts` also exposes `__dusklaneUi.hint(id)` in debug builds (screenshots of any hint),
  `styles/hud.css`, `styles/screens.css`.
- tests: `unit/input/twothumb.test.ts`, `unit/integration/twothumb.test.ts` (new); `unit/input/trace.ts` (`makeRec` is
  now the one-thumb recognizer, `makeRec2` the two-thumb one), `recognizer.test.ts` / `frames.test.ts` /
  `integration/labels.test.ts` run with `controls: 'one'`; `unit/save/save.test.ts`, `unit/ui/hud.test.ts`;
  `bots/gate.thumb.test.ts` (both layouts, the measured `rest` habit, the control); `unit/integration/hints.test.ts`
  (re-teach); `e2e/touch.spec.ts` (swap sides, right hold → grab → manual, hard left flick in the air), `e2e/ui.spec.ts`
  (two-thumb hints and the re-teach, mobile), `e2e/smoke.spec.ts` (the real-time synthetic tap moved to the right half).

### What the gate (and every later package) must know
- **Any test or script that taps, drags or flicks** must put taps / swipes / holds on the right half and drags on the
  left half, or switch to one thumb first. A tap at `vp.width / 2` still ollies (the midline belongs to the right);
  a tap at a fixed x = 195 does not on the desktop project (1280 px: that is the left half). Unit tests that build
  `InputPipeline` / `createRecognizerImpl` without `controls` get two thumbs; `tests/unit/input/trace.ts › makeRec`
  and `ONE_THUMB` give the one-thumb grammar. Mouse input (desktop e2e, shots) is unchanged.
- **Thumb bot** (`BOTS.thumb`): two thumbs by default (`{ layout: 'one' }` for the G1 profile; `{ rest: true }` the
  measured resting-right-thumb habit, reported in `artifacts/bots/thumb-rest.json`, gated only on 0 crashes and 0 flips / spins). It
  imports `createRecognizer`, `FrameBuilder`, `steerMetresPerPx` from `input/index.ts` as before and passes `controls`.
- **A resting right thumb is a HOLD** (DESIGN §4.4 rule 3): 0.36 grabs and 1.0 manual per ollie in the `rest` habit (282
  ollies, 20 seeds × 4 min), 0 crashes. Accepted as a trade-off (the same gesture as hold-to-grab); the hints teach a hovering right thumb. Revisit
  only with real-phone data.
- **Hints:** `HINT_TEXT[id].touch` keeps the G0 one-thumb wording (hud.test pins it); two-thumb wording is
  `twoThumb` with `{S}` / `{T}` side tokens. The Lesson Line (M4) should call `hud.hint(id)` as before; the HUD picks
  the wording, the rings and the cue from `SaveV1.settings` at each runStart. `ZONE_CUE.firstOfSession` also shows the
  cue on the first run after the app opens (a returning player who updated sees the split once per session).
- **Two touches in e2e:** CDP `Input.dispatchTouchEvent` releases one of two points only with a `touchEnd` that lists
  that point (a `touchMove` that leaves it out releases nothing); `touch.spec.ts › Multi` does it. Queue a tap's down
  and up together (an awaited round trip under SwiftShader can turn it into a hold).
- **Re-teach:** profiles from before two thumbs get it once (`onboarding.twoThumbIntro`); M4's Lesson Line should keep
  `FirstRunHints.start` deciding it (or move the same rule into its own arming) and keep `hud.setFirstRuns(true)` for
  that run (ui/index.ts reads `twoThumbIntro === runsStarted`).
- **Not done here:** Android / iOS edge back gestures near the left edge (the steering thumb may start there): needs a
  real-device check (a web page cannot exclude system gesture areas; the STEER ring sits 24% in from the edge);
  gamepad unaffected.

## STEER (owner playtest after G1: direct touch steering, pkg/steer)

### core/tuning.ts: STEER_LEAD_MAX, STEER_FAST and STEER_BRAKE (additive), and a frozen steering behaviour changed   (status: applied @steer, merged into DEV at G1b; DESIGN §4.2, §5.2, row 72; TECH §4.2, §6.3)
- File / symbol: core/tuning.ts › STEER_LEAD_MAX (0.8), STEER_FAST `{ vMax: 7.0, accel: 80 }`, STEER_BRAKE `{ stopM: 0.03, jitterM: 0.012, restLead: 0.2, ground: 66, air: 40, reach: 0.2, winMax: 4 }`; sim/kinematics.ts › applySteer, touchSteer, noteAssist, lateral; sim/state.ts › SimState.steer (SteerExt, freshSteer); sim/step.ts (step 4 reports what the magnet / ground align moved to noteAssist; a consumed air swipe gives back at most the lead its direction still has).
- Change: touch `steerDx` never puts targetX more than 0.8 m ahead of the skater (never pulling back a target the magnet or ground align moved); a drag the cap held back runs the skater at up to 7 m/s (80 m/s² on the ground) until it stops; then a release brake stops it within ~0.35 m (TECH §6.3 steps 2 and 4). `steerAxis`, `V_LAT_MAX`, `A_LAT_*`, `STEER_P`, `T_SHIFT` and the validator are unchanged.
- Why: owner playtest ("it will continue to turn even when I take my finger off it"): a quick slide threw targetX 2.5–5 m ahead and the skater kept sliding 2.3–3.6 m (0.45–0.8 s) after the thumb stopped or lifted. The fast thumb (fix pass) gives quick slides back part of the reach the cap took (60 px / 120 ms: 0.45 → 0.6–0.8 m; 120 px / 250 ms: 1.0–1.4 → 1.2–1.8 m).
- What other packages can rely on: absolute-target drivers (every bot: targetX ≤ 0.66 m ahead, measured over the gate runs) never reach the cap, so they are never capped, sped up or braked: bot paths are bit-identical to before @steer and every bot gate is unchanged. A bot or test that steers with one big instant `steerDx` (a "throw") now moves the skater ≤ ~1 m: drag over several ticks at a human pace (0.08–0.1 m per tick) or set a key target. Touch-input layouts (pkg/ctl's two-thumb split) need nothing: all of it reads only `steerDx` (the stop thresholds are in metres: `jitterM` ≈ 0.3 px and `stopM` ≈ 0.7 px at the default scale).
- Local workaround meanwhile: n/a.

## CAM: Run camera (pkg/cam, owner playtest: "angled", "closer"; DESIGN decision row 73)

### CAMERA: the perspective run camera   (status: applied @cam, merged into DEV at G1b)
- File / symbol: core/tuning.ts › CAMERA
- Change: `proj: 'persp'`, `fovDeg: 24` and `latTau: 0.4` added; `pitchDeg: 35 → 34`, `yawMinDeg: 0 → 9`, `xrayCapY: 1.6 → 1.2`. Every other field unchanged.
- Why: the portrait camera read top-down and 2D on phones (owner); the winning camera of the @cam prototype and three judges is a telephoto perspective camera at pitch 34°, portrait yaw 9° (30° at aspect ≥ 1.25), window FOV 24°, D solved per frame. Perspective hides more ground behind an in-corridor solid, so the x-ray cap comes down to 1.2 m. The sim, the generator and the validator read none of these fields (the generator's 2.5 s assumption and `LOOKAHEAD_*` are unchanged), so the course is unchanged on every device.
- Local workaround meanwhile: none needed; `world/render/camVariants.ts` builds the production spec `P` from CAMERA and keeps the pre-@cam ortho camera as the debug spec `A`.

### Notes for the gate (no contract change)
- **Shaders read camera uniforms.** `world/render/camera.ts › RIG_UNIFORMS` (`uEdge`, `uCut`, `uOver`, `uOverDir`) is bound by every world material and the lantern layer; the rig writes it in `update()`. The buildings, emissive and glow materials now `discard` camera-side fragments above the cut plane (TECH §8.6); the opaque material still has no discard.
- **`gfx/uniforms.ts › uHideNear`** is no longer read (the comment says so); removing the field is safe once nothing outside world/render uses it.
- **`chunkBuilder.ts`** lost `NEAR` / `nearKeep` / `settleNear` (the cut replaced the whole-record hide); `BuildOptions.yawDeg` stays (hazard pools).
- **`world/gen/generator.ts`** carries G1's mid-gateway start fix (6323753) verbatim, so `shots --contrast` can run here; the merge sees the identical hunk.
- **`debug/contrast.ts`**: a grind-edge sample behind a raised deck (slab top ≥ 0.5 m) of another obstacle is hidden, like one behind another obstacle's solid (the perspective camera sees skywalk decks hide the kerb beyond them); hazards and edges are measured up to the HUD-line ground when that is beyond look-ahead + 8 m. `scripts/shots.mjs --contrast` also retries ±0.6 / ±1.8 s starts (after the existing ones).
- **`tests/e2e/audio.spec.ts`** (AU's): @cam scaled the per-rendered-frame audio bound by 30 / fps; at the G1b merge the G1 tune's form was kept instead (the budget asserted per 60 Hz frame, per rendered frame only at ≥ 25 fps), which covers the slower perspective render too.
- **`tests/e2e/smoke.spec.ts`**: the landscape → portrait test expects the portrait yaw 9° (was 0°).

### G1b integration (how the merge met the G1 tune; no contract change)
- **fx flags:** 32 stays the G1 grind signature (sheen + glint); @cam's overhead-span fade moved to **64** (`FX.over`).
- **Grind edges:** @cam's constant-on-screen stripes carry the grind flag; `RENDER.grind.halfW` (1.25) is the one
  width factor (the cream ≈ 3.1 px, replacing `EDGE_WIDEN.px` 1.2); a perspective build keeps @cam's physical floor
  (0.035 m), an ortho build scales its floor; the cream's palette emissive is the tune's 0.2 under the fixed sheen.
- **Maglev:** @cam's far-facade guideway, the tune's paper-magenta streak at 22 % (`OCCLUSION.trainAlpha`).
- **Steering tests:** `steer.test` traces run on the steering half (two thumbs is the default); `twothumb.test` judges
  "all of the steering" against the same traces with swipes removed (the lead cap limits fast strokes).

## THEME: RECLAIM re-theme (owner-approved; DESIGN §24 row 74; work packages T0–T8)

### core/skins.ts: propSkin, the skin chooser (additive, new file)   (status: applied @theme T0 on DEV; TECH §4.15)
- File / symbol: core/skins.ts › `propSkin(kind, area, id, variant, h, out?)`, `PropSkin`, `SkinBody`, `VehicleBody`, `CarPaint`, `Dress` (bit set), `WEAR_MASK`, `VEHICLE_BODIES`, `CAR_PAINTS`, `SAPLING_KINDS`, `MOVER_KINDS`, `isVehicle`, `newSkin`.
- Change: a new pure module; nothing existing changes. It imports only `core/ids` (types), `core/rng` (`hash32`) and `core/decor` (`DECOR_BRANDS`, for livery indices).
- Why: the kits and the crash copy must agree on what an obstacle is drawn as (a car or a pickup, a container or a truck, a barrier board or a log), so the crash line names what the player saw (DESIGN §9, §10.3 skin notes). Both call it with `(ob.kind, ob.area, ob.id, ob.variant, ob.hgt)`.
- What other packages can rely on: deterministic per argument tuple; never read by world/gen, sim or the validator, so footprints, solids, edges, golden obstacle hashes and every bot gate are untouched. The isolated-filler sapling is a separate flag from the chunk builder and never changes the noun. `kits/dress.ts` `DRESSER.begin` (called by `drawObstacle`) computes the skin per drawn obstacle; kits read `DRESSER.skin`.
- Local workaround meanwhile: n/a.

### core/audio.ts: SfxId gains 'birdFlutter' and 'reverseChirp' (additive)   (status: applied @theme T5 on pkg/t2; TECH §4 SfxId)
- File / symbol: core/audio.ts › `SfxId` (two new members at the end of the union).
- Change: additive only; no existing id, signature or behaviour changes.
- Why: theme §8 adds two one-shots the engine plays through `cue()`: the bird flutter when `perched_birds` take off (T4 VFX fires it) and the soft reversing chirp of the self-parking `backout_car` while it moves (every 0.6 s; the mover's owner fires it). Both live in audio/sfx/oneshots.ts with levels in audio/mix.config.ts (`FLUTTER`, `REVERSE_CHIRP`).
- What other packages can rely on: `engine.cue('birdFlutter', { pan })` and `engine.cue('reverseChirp', { pan })` are cheap, in key and under the music; the crash cue takes `variant: 'vehicle'` for the body-panel thunk (audio/bindings.ts sets it from the crash event's `kind`, `THUNK_KINDS`); `Ambience.gateway(id)` plays each gateway's moment (wired from the `gatewayEnter` binding) and `Ambience.sprinkler(t)` is there for a sprinkler decor in earshot (not wired yet: nothing reports one).
- Local workaround meanwhile: n/a.

### T2 render-side overgrowth: the optional decor params it already reads (for T3 to declare in DECOR_KINDS)   (no contract change)
- Each falls back to a hash of (s, x) when absent, so today's WG decor is reclaimed with no generator or hash change:
  `building`/`house`/`warehouse`/`end_wall`: `fade` 0..1, `roofGreen` 0..1, `roofTree` 0/1, `ivy` 0..1; `end_wall` (Neon) `live` 0/1 (1 in 4: one lit 営業中 or 喫茶);
  `shadow_caster`: `shape` 4 (a row of leafy crowns) and 5 (a plain water tower), `roofTree` 0/1 on boxes; `crane`: `tree`, `nest` 0/1;
  `blade_sign`/`holo_billboard`: `live` 0/1 (70% live; 出口 and 薬局 are never lit); `street_lamp`: `lit` (DT 0, SB 0.2, IN 0.4, NE 0.6), `vine` 0/1;
  `hedge_round`: `bloom` 0/1 (buddleia); `fence_run`: `roses` 0/1 (Suburbs); `low_wall`: `moss` 0/1; `chain_link`: `ivy` 0..1; `mailbox_post`: `nest` 0/1;
  `lantern_string`: `litRatio` (0.6); `tree`: species 3 plane, 4 fig, 5 birch (WG's Downtown species 1 is drawn a third each palm, plane and fig).
- Road marks (owner note 8): `road_arrow` is painted only before a `crosswalk` in the same chunk, one per crossing, pointing +s from a lane centre (two-way Suburbs: the right-hand lane); its `x` and turn `kind`s are ignored (kind 3 stays SLOW). T3 may emit arrows only before crossings. `manhole` ignores `r` (0.6–0.75 m covers); `drain` and `steam_vent` sit in the gutter at the kerb (0.4 × 0.6 m).
- Decal atlas cells 28–39 (`DECAL.weedA` … `bayPerp`) are ready for `weed_edge`, `moss_patch`, `root_lift`, flower drifts, lily pads, lichen, rust drips, joint grass, ripples and the perpendicular bay.

### core/decor.ts: the RECLAIM decor kinds and params (additive)   (status: applied @theme T3 on DEV; TECH §4.14)
- File / symbol: core/decor.ts › `DECOR_KINDS` gains `weed_edge`, `moss_patch`, `root_lift`, `wild_grass`, `shrub_wild`, `sapling`, `cart_planter`, `perched_birds`, `wildlife`, `critter_emitter`, `drips`, `vista`; existing kinds gain optional param docs (the T2 list above, plus `parked_car_side` `body` / `age` / `cat`, `blade_sign` / `holo_billboard` `live`, `lantern_string` `litRatio`, `maglev_train` period 40); `parked_car_side.areas` gains `docks`; `leaf_emitter.areas` becomes every area and gateway. A private `RECLAIMED` doc object is spread into the four backdrop kinds' params.
- Change: additive only. No kind, zone, area or default was removed or renamed; `DecorKindDef` is unchanged.
- Why: theme §4 "New decor kinds" and §6 vistas; Neon net-negative near the corridor (40% of the blade signs at |x| < 6 not emitted, 70% of the rest `live`, 出口 and 薬局 never).
- What other packages can rely on: WG emits them (`world/gen/decor.ts`, tunables `GEN.reclaim`), one `vista` per area visit and at most one `wildlife` (the generator's decor state carries the visit); WA renders every one (`kits/reclaim.ts`; birds, critters and drips are `vfx/critters.ts`); warmup covers them through `DECOR_KINDS`. `KitCtx.edges` (world/render, not core) lists the chunk's grind edges for the rule-5 clearance. Obstacles, coins, the safe line and every bot are untouched: `tests/unit/gen/gen.test.ts` now holds two golden chains, obstacles (identical through T7a) and decor (re-baselined here).
- Local workaround meanwhile: n/a.

### What T1 / T2 / T3 / T6 build on (no further core change in T0)
- **T1 (kits, vehicle builder):** `DRESSER.skin` (body, paint, dress, livery, nosedIn), `DRESSER.box(K, role, x0, y0, s0, x1, y1, s1, faces?)` for every dressing box (roles `life`, `cat`, `animal`, `foliage`, `wear`, `sapling`), `DRESSER.life` / `lifeDisc` for accents drawn another way, `DRESSER.has(flag)`, `DRESSER.sapling`; colours from `palette.ts` `RECLAIM` and `dress.ts` `mossOn` / `rustOn` / `foliageFor`; `isIsolatedFiller(ob, chunkObstacles)` for the chunk-builder flag, passed as `drawObstacle(c, ob, chunkIndex, first, isolated)`. `tests/unit/render/dress.test.ts` already draws every kit in every skin and checks the life budget, refusals and clean machines.
- **T2 (render-side overgrowth):** `RECLAIM` tokens, `fadePaint`, `withLum`, `contrastRatio`, the zone helpers `inCleanCore` / `flatWeedOk` / `vegOk`, `edgeBandDecalOk`, `clearOfEdges`, `GREEN_SHARE`.
- **T3 (decor kinds):** new `DECOR_KINDS` entries come as their own request here, with the split golden test (obstacle chain identical, decor chain re-baselined once).
- **T6 (copy):** `kindName(kind, area, skin)` reads `PropSkin.noun` and `plural` (no "a"/"an" for plurals).
