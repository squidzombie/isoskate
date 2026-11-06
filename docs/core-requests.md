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

## MU: Meta and UI (W3a)

## AU: Audio (W3b)
