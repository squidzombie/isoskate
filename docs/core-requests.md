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

### 1. InputFrame.longTap: a 350–600 ms still press reads as a tap   (status: open; ships with longTapMaxMs 400, see the e2e note)
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

### 2. Magnet and capture: no re-capture of the edge a pop-out left   (status: open; implemented behind `RULES.popOutSkipsOwnEdge`, default true)
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

### 3. GameEvent 'rewind' carries the crash it undid   (status: open)
- File / symbol: core/events.ts › GameEvent 'rewind'
- Change: `{ t: 'rewind'; tick: number; toTick: number; cause?: CrashCause; obstacleId?: number | null; kind?: PropKind | null; left?: number }`
- Why: the Lesson rewind (RunConfig.rewinds, TECH §6.7) is implemented: a ring of REWIND.ring snapshots every
  REWIND.snapEveryTicks; a crash with rewinds left restores the newest snapshot ≥ REWIND.sec old and emits only
  `rewind` (no `crash`, `comboLost` or `runEnd`: the run goes on, so app.ts needs no change). M4's hint replay needs
  to know what was hit. The count is `min(cfg.rewinds, REWIND.max)`; the 4th crash is a real one.
- Local workaround meanwhile: the sim already pushes `sim › RewindEventExt` (those fields, all set).

### 4. DebugSnapshot: the debug overlay data   (status: open)
- File / symbol: core/debug.ts › DebugSnapshot; debug/api.ts › snapshot()
- Change: `sim?: { airLeft: number; heat: number; window: number; bankIn: number; magnetEdge: number | null; transferArmed: boolean;
  pick: { open: boolean; edgeId: number; tCapture: number; inSec: number; dirs: Dir8[]; grind: GrindId | null } | null;
  manual: { kind: ManualId; t: number; budget: number } | null; rewindsLeft: number }`, filled from `simDebug(sim)`.
- Why: ROADMAP W1a "debug overlay data: the pick-window state, heat and airLeft exposed in the snapshot"; G1 wires the
  pick-window and heat overlays. The frozen SkaterState already carries `pickWindow`, `airLeft` and
  `ScoreState.combo.heat / bankIn`; the extra fields (picks so far, the grind they select, budget) come from the sim.
- Local workaround meanwhile: `sim/index.ts › simDebug(sim): SimDebugInfo | null`.

### 5. New trick-rule tunables live in tricks/score.config.ts › RULES   (status: info; move to core/tuning.ts at G1 if preferred)
- `manualHoldSec` 0.30 (a resting thumb manuals only after 0.30 s of stillness: the G0 "manual 200 ms into the link
  window" fix), `switchDoubleSec` 0.25 (grind switch doubles), `dropGapMinH` 0.5 (drop gaps), `popOutSkipsOwnEdge`
  (request 2), and two pose constants. The recognizer's `longTapMaxMs` sits with the other recognizer numbers in
  input/recognizer.ts DEFAULT_RECOGNIZER (400 for now, see request 1). Every trick point moved from tricks/defs.ts into score.config.ts › POINTS
  (DESIGN §22: score.config holds every scoring number); TRICKS is unchanged in content.

### 6. GameEvent 'grindSwitch' marks a late re-pick   (status: open; additive optional field)
- File / symbol: core/events.ts › GameEvent 'grindSwitch'
- Change: `{ t: 'grindSwitch'; tick: number; from: GrindId; to: GrindId; late?: true }`
- Why: a pick swipe in the 0.12 s after lock (DESIGN §6.3) changes the grind just locked; it is not a switch (no new
  link, no switch counted). Without the flag AU's switch cue and MU's switch popup fire for it. Consumers: treat a
  `late` switch as the grind's real name (update the popup / last-trick label; no switch cue).
- Local workaround meanwhile: the sim already pushes `sim/grind.ts › GrindSwitchEventExt` with `late: true`.

### 7. Design question: back-to-back manuals keep the heat running   (status: open, for the design owner; no core change)
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

### 8. Design question: a deliberate manual outside a combo starts one   (status: open, for the design owner; no core change)
- §4.4 rule 3 says a manual "scores only inside a combo", §12.3 (Lesson Line, manual pads) says "Hold = manual. The
  combo counter and bank arc appear", §13.2 "any scored trick starts a combo".
- Shipped: a manual that the touch rules allow outside a combo (a HOLD on a pad or raised landable top, the manual key
  on a top, a pre-press held through a touchdown, a grab held through touchdown) starts a combo and is its one link
  (75 + 100/s). The manual key on flat ground outside a combo rides unscored, as a resting thumb there starts nothing
  (rule 3 parity between touch and keys, and no free combo from holding S).

### 9. Frozen M0 contact detail changed by the DESIGN §7 edge nudge   (status: open; info for WG's validator, copy into TECH §6.4)
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

### Thumb bot taps are capped at 190 ms where a HOLD would start a manual   (status: info for GP; no core change)
- File / symbol: debug/bots/thumb.ts; sim interpret (GP) › manualStart on HOLD with an open combo window or on a prop top
- Change: none. TECH §11.2 asks for 60–260 ms taps; a 2nd-finger tap held ≥ 200 ms becomes a HOLD, which on the ground
  starts a manual when the combo window is open or the board is on a prop top (an unintended trick). The bot caps such
  taps at 190 ms, and never puts the tap finger down in the 0.10–0.30 s pre-press window before a touchdown. If GP
  wants 260 ms taps to stay taps there, the recognizer / interpret rule is GP's call.
- Why: 0 unintended tricks (gate.thumb). Local workaround: the cap.

### BOTS.safe is the planner bot now; record sim fixtures with BOTS.conformance   (status: info for GP; no core change)
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

## SK: Skater and cosmetics (W2b)

### Shared crash-desaturation uniform for the skater materials   (status: deferred to WA (W2a): nothing desaturates the world yet; WA adds `sharedUniforms` with the crash grading, SK then patches the toon materials)
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

### Design question: board identity in the run at 31 px   (status: open, for the design owner at G2; not a contract change)
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
