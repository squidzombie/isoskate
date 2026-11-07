# DUSKLANE: Technical Architecture

**Status:** v1.1, authoritative (after the Player, Feasibility and Mobile reviews). `DESIGN.md` owns the gameplay numbers. This document owns how the game is built.

**The frozen contract.** The TypeScript in §4 is the **frozen contract** between parallel agents. It is created verbatim in `src/core/` during M0 and changed afterwards only by the integrator (§2.2).

**Working rules**
- **Units.** Metres and seconds. Track space is `s` (forward), `x` (lateral, + is right) and `y` (up).
- **Mapping to world space.** World is three.js Y-up. Track space maps to world as `world.x = x`, `world.y = y`, `world.z = −(s − originS)` (§8.2).
- **Boundaries.** The sim never touches the DOM, three.js or wall-clock time.

---

## 0. Key decisions
1. **Straight street.** The world is a straight street in track space (DESIGN §10.1). There are no curves, so sim, generation, collision and camera stay simple and reliable.
2. **Seconds, not metres.** Speed is a pure function of run time: `v = speedAt(t)`, and `s = sAt(t)` is closed-form. The generator, the validator, movers and bots all use the same schedule, so **arrival time at any `s` is known in advance**. This is what makes top speed provably fair.
3. **Deterministic sim.** Fixed **60 Hz**, DOM-free. Gameplay depends only on `(seed, InputFrame[])`. Rendering, audio and UI only read state and subscribe to events.
4. **Gestures in, meaning in the sim.** The input layer emits raw gestures packed into `InputFrame`s, labelled with *how* they were made (`fast`, `fromRest`, `steer`). The sim decides what a gesture means in the current state (`tricks/interpret.ts`), so replays and bots are exact and the recognizer never needs game state.
5. **One renderer, DOM UI.** One WebGL2 context and one canvas, with a DOM overlay for UI. The Locker, Shop and Title reuse the renderer with a perspective camera.
6. **No physics engine, no UI framework.** The only runtime dependency is `three`.
7. **Stub-first parallelism.** M0 ships a working vertical slice *and* a stub for every factory. Each later agent replaces internals behind a frozen interface, inside folders it owns.

---

## 1. Stack (pinned exact versions, verified on npm 2026-11-06)

| Package | Version | Notes |
|---|---|---|
| `typescript` | **5.9.3** | `strict`, `noUncheckedIndexedAccess`, `isolatedModules`, `verbatimModuleSyntax`. TS 7.x is too new, so it is skipped. |
| `vite` | **7.3.7** | `base: './'`. `build.target: ['es2020', 'safari15']` (syntax level). The **runtime minimum is iOS/Safari 15.4** (`structuredClone`, `dvh`); `inert` (15.5) and `getCoalescedEvents` are feature-detected (§10.8). Vite 8 is too new, so it is skipped. |
| `three` | **0.186.1** | WebGL2 `WebGLRenderer` only. Named imports only. The only addon is `three/addons/utils/BufferGeometryUtils.js`. |
| `@types/three` | **0.186.0** | |
| `vitest` | **4.1.12** | `environment: 'node'`. Thread pool for bot suites. |
| `@playwright/test` | **1.63.0** | Matches the preinstalled `/opt/pw-browsers/chromium-1243` (verified from `playwright-core@1.63.0/browsers.json`). Always run with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`. Never run `playwright install`. |
| `vite-plugin-singlefile` | **2.3.4** | Peer dependency `vite ^7` is OK |
| `@fontsource/bungee` | **5.3.0** | devDependency. Only `files/bungee-latin-400-normal.woff2` is used. |
| `@fontsource/nunito` | **5.3.0** | devDependency. Only `files/nunito-latin-{700,800,900}-normal.woff2` are used. |
| `@types/node` | **22.20.5** | devDependency (INT, M0): types for `vite.config.ts`, `playwright.config.ts` and Node scripts. Not part of the bundle. |
| *(no ESLint)* | — | The global ESLint 10 can't parse TypeScript without extra plugins, so **`scripts/lint.mjs`** (about 80 lines, no dependencies) enforces two kinds of rule. **Determinism bans** (regex over the stripped source): `Math.random`, `Date`, `performance`, `window`, `document`, `self`, `globalThis`, `navigator`, storage, `crypto`, timers, `requestAnimationFrame`, `queueMicrotask`, `eval`, `Function`, any use of `Math` other than `Math.<member>`, and any `three` import in `src/sim/`, `src/tricks/`, `src/world/gen/` and `src/core/` (`core/view.ts` may use `import type` from three). **Import boundaries:** `sim/`, `tricks/` and `world/gen/` may not import `content/`, `skater/`, `ui/`, `audio/` or `meta/`; no module may import another module's internals, only its `index.ts` or `core/`. |

**Rules**
- Node 22 (local has v22.23.4). `package.json` sets `"type": "module"` and `"engines": { "node": ">=20" }`.
- Exact versions, with no `^`. Commit `package-lock.json`.
- `.npmrc` sets `legacy-peer-deps=true`: npm 10.9 crashes (`Cannot read properties of null (reading 'edgesOut')`) while resolving vitest 4's optional peer sets. Every peer we need (`vite`) is a direct dependency, so nothing is lost. `npm ci` uses the same setting.
- **Agents never add dependencies.** Only the integrator does.
- **Fonts are self-hosted.** `src/fonts/fonts.css` (INT) declares four `@font-face` rules whose `src` is the woff2 file inside the `@fontsource` package (woff2 only, `font-display: swap`). `main.ts` imports it, so Vite hashes the files in `dist/` and inlines them in the single-file build. The game makes **no third-party requests**.

---

## 2. Repository layout and ownership

**Ownership codes:**
- **INT**: integrator (the M0 agent, and the integration milestones)
- **GP**: Gameplay (W1a)
- **WG**: World-gen (W1b)
- **WA**: World-art (W2a)
- **SK**: Skater and cosmetics (W2b)
- **MU**: Meta and UI (W3a)
- **AU**: Audio (W3b)

```
isoskate/
  index.html  package.json  package-lock.json  tsconfig.json  vite.config.ts
  vitest.config.ts  vitest.bots.config.ts  playwright.config.ts  .github/workflows/pages.yml   INT
  public/  manifest.webmanifest  icons/{180,192,512,512-maskable}.png      (added in M4)        INT
  src/
    main.ts                                                                    INT
    fonts/     fonts.css (self-hosted @font-face, §1)                          INT
    core/      FROZEN contract (§4): ids, math, rng, tuning, world, input, sim, view,
               tricks, cosmetics, events, bus, save, meta, audio, platform, debug, ui,
               decor (DECOR_KINDS: the Decor.kind vocabulary, §4.14)                    INT
    game/      app.ts (screen state machine), loop.ts (fixed step + interpolation),
               wiring.ts (creates all modules), runSession.ts, onboarding.ts        INT
    sim/       index.ts step.ts kinematics.ts ground.ts collide.ts air.ts predict.ts
               grind.ts magnet.ts manual.ts landing.ts pickups.ts pose.ts snapshot.ts      GP
    tricks/    index.ts defs.ts interpret.ts combo.ts scoring.ts score.config.ts           GP
    input/     index.ts recognizer.ts pointer.ts keyboard.ts gamepad.ts frames.ts          GP
    world/gen/ index.ts schedule.ts generator.ts cursor.ts areas.ts lesson.ts coins.ts
               movers.ts decor.ts (emits Decor; uses core/decor.ts DECOR_KINDS) query.ts gen.config.ts
               props/{shared,downtown,suburbs,docks,neon}.ts     (physical prop builders)
               templates/{shared,downtown,suburbs,docks,neon}.ts
               validator/{grid,sweep,path,rules}.ts                                         WG
    world/render/ index.ts camera.ts chunkBuilder.ts pools.ts palette.ts lights.ts sky.ts
               materials.ts decals.ts buildings.ts coins.ts xray.ts quality.ts
               kits/{shared,downtown,suburbs,docks,neon}.ts      (prop meshes)
               textures/{atlas,facades,signs,ground,glyphs}.ts                              WA
    vfx/       index.ts particles.ts rings.ts speedlines.ts                                 WA
    gfx/       renderer.ts canvas.ts geom.ts (low-level helpers; INT in M0, WA may add files in W2)
    skater/    index.ts model.ts skin.ts rig.ts ik.ts poses.ts animator.ts board.ts
               helmet.ts face.ts textures.ts outline.ts showcase.ts                          SK
    content/   cosmetics.ts (the catalog, DESIGN §15)                                       SK
    meta/      index.ts economy.config.ts wallet.ts progression.ts shop.ts crates.ts
               offers.ts results.ts analytics.ts                                            MU
    save/      index.ts schema.ts defaults.ts migrate.ts storage.ts sanitize.ts             MU (M0 ships a minimal version)
    ui/        index.ts h.ts hud.ts popups.ts hints.ts overlay.ts toasts.ts
               screens/{title,pause,crash,results,rewards,locker,shop,crates,stats,settings}.ts
               styles/{base,hud,screens,buttons}.css                                        MU (M0 ships a debug HUD + title stub)
    platform/  env.ts pwa.ts ios.ts visibility.ts haptics.ts icon.ts compat.ts wake.ts history.ts   INT
               monetization.ts                                                             MU
    audio/     index.ts engine.ts clock.ts bindings.ts mix.config.ts
               music/{sequencer,instruments,drums,patterns,progressions,tape,vinyl}.ts
               sfx/{roll,grind,oneshots,ui,noise}.ts                                        AU
    debug/     api.ts perfhud.ts overlay.ts tuningPanel.ts                                  INT
               bots/{planner,safe,myopic,thumb,straight,trick,conformance,harness}.ts       WG (M0 ships a SafeKey follower)
  tests/
    unit/<module>/*.test.ts      (owned by the module owner)
    bots/*.test.ts               (WG)
    e2e/*.spec.ts                (INT; each agent may add one spec file named after its package)
  scripts/  lint.mjs  gen-icons.mjs  shots.mjs  test-bots.mjs  bot-report.mjs  size-check.mjs  INT
            (shots.mjs ships in M0 with every mode, §11.4; gen-icons and size-check arrive in M4)
  docs/     DESIGN.md TECH.md ROADMAP.md
```

### 2.1 Module rules
1. **Public surface.** Each module exposes one `index.ts` with a factory (§4.13). Modules import each other only through `core/` types and those factories. `game/wiring.ts`, owned by INT, is the only place that instantiates modules.
2. **Cross-module talk.** Modules communicate through the **event buses** (§4.8) and the read-only state objects passed in `RenderFrame`. Listeners never mutate sim state.
3. **Folder ownership.** An agent edits only folders it owns, plus new test files in `tests/unit/<its module>/`. The exception is the `gfx/` additions noted in the layout.
4. **Config files.** `package.json`, `vite.config.ts`, CI workflows and `core/` are INT-only.

### 2.2 Changing the frozen contract
- An agent that needs a contract change does **not** edit `core/`. Instead it:
  - defines a local extension type inside its own module, for example `interface GrindStateExt extends GrindState {…}`;
  - appends a request to `docs/core-requests.md`, its only allowed shared-file edit, with an append-only section per agent.
- The integrator applies accepted requests at the next merge gate (ROADMAP).
- **Additive changes are preferred**: new optional fields and new union members.

---

## 3. Naming and environment
- `core/ids.ts` exports `GAME_ID = 'dusklane'`, `GAME_NAME = 'Dusklane'` and `BUILD` (injected by Vite define: `{ version, hash, mode }`). Every user-visible name and storage key derives from these.
- **Storage keys:**
  - `dusklane.save` (current)
  - `dusklane.save.bak` (backup)
  - `dusklane.analytics`
  - `dusklane.prefs` (per-device conveniences)
- **Query flags** (`platform/env.ts`), read once at boot:

| Flag | Effect |
|---|---|
| `?debug=1` | Enables `window.__skate` in production; always on in dev |
| `?seed=N` | Fixed run seed |
| `?quality=low\|med\|high` | Forces a quality tier |
| `?fakeads=1` | Uses `FakeProvider` for monetization |
| `?bot=safe` | Starts a bot on load |
| `?nosw=1` | Skips service-worker registration |
| `?reset=1` | Resets the save, behind a confirm dialog |

---

## 4. The frozen contract (`src/core/`)
Created verbatim in M0. Everything is exported. There are no runtime dependencies except `core/rng.ts`, `core/math.ts`, `core/tuning.ts` and `core/bus.ts`, which contain small implementations. In the listings below, `/*…*/` means "implementation in M0, signature frozen".

### 4.1 `core/ids.ts`: identifiers
```ts
export const GAME_ID = 'dusklane';
export const GAME_NAME = 'Dusklane';
declare const __BUILD__: { version: string; hash: string; mode: 'development' | 'production' | 'single' };
export const BUILD = __BUILD__;      // Vite `define` (also set in vitest.config.ts)

export type AreaId = 'downtown' | 'suburbs' | 'docks' | 'neon';
export const AREA_ORDER: readonly AreaId[] = ['downtown', 'suburbs', 'docks', 'neon'];
export type GatewayId = 'greenway' | 'levelCrossing' | 'harborBridge' | 'underpass';
export type Dir8 = 'u' | 'd' | 'l' | 'r' | 'ul' | 'ur' | 'dl' | 'dr';
export type Surface = 'asphalt' | 'wetAsphalt' | 'concrete' | 'tile' | 'granite' | 'wood' | 'metal' | 'grass';
export type EdgeMaterial = 'metal' | 'neon' | 'concrete' | 'stone' | 'wood';
export type EdgeKind = 'rail' | 'ledge' | 'bench' | 'curb' | 'lip' | 'rim' | 'hubba';
export type CrashCause = 'slam' | 'badLanding' | 'fall' | 'splash';

export type PropKind =
  // shared
  | 'curb' | 'flatbar' | 'bench' | 'manual_pad' | 'trash_can' | 'cone' | 'barrier_low' | 'trench'
  | 'stairs' | 'handrail' | 'hubba' | 'incline' | 'terrace' | 'filler'
  // downtown
  | 'granite_ledge' | 'planter' | 'planter_tree' | 'fountain' | 'bollard_row' | 'kiosk' | 'parked_car'
  | 'bike_rack' | 'cafe_set' | 'news_box' | 'crosswalk_car'
  // suburbs
  | 'garden_wall' | 'hedge' | 'picket_fence' | 'mailbox' | 'wheelie_bins' | 'parked_van' | 'porch_steps'
  | 'yard_table' | 'crate_stack' | 'speed_hump' | 'hoop_pole' | 'bus_shelter' | 'backout_car'
  // docks
  | 'container' | 'pallet_1' | 'pallet_2' | 'pallet_3' | 'pallet_tall' | 'ibeam' | 'loading_dock'
  | 'drum_cluster' | 'spool_standing' | 'spool_lying' | 'mooring_bollard' | 'dock_lip' | 'rail_track' | 'forklift'
  // neon
  | 'guard_rail' | 'vending_bank' | 'viaduct_pillar' | 'holo_gate' | 'cherry_planter' | 'food_cart'
  | 'bike_row' | 'skywalk' | 'a_frame_sign' | 'lantern_stand' | 'neon_curb' | 'delivery_robot';

export type FlipId =
  | 'popShuvit' | 'kickflip' | 'heelflip' | 'impossible' | 'shuvit360' | 'varialKickflip' | 'varialHeelflip'
  | 'hardflip' | 'inwardHeelflip' | 'treFlip' | 'laserFlip' | 'doubleKickflip' | 'doubleHeelflip'
  | 'tripleKickflip' | 'tripleHeelflip';
export type GrindId =
  | 'fiftyFifty' | 'fiveO' | 'nosegrind' | 'boardslide' | 'lipslide' | 'noseslide' | 'tailslide'
  | 'feeble' | 'smith' | 'crooked' | 'overcrook' | 'bluntslide' | 'noseBluntslide';
export type SpinId = 'fs180' | 'bs180' | 'fs360' | 'bs360';       // body spins (DESIGN §6.1a)
export type ManualId = 'manual' | 'noseManual';
export type GrabId = 'indy';
export type TrickId = 'ollie' | FlipId | SpinId | GrindId | ManualId | GrabId;   // 36 Trick Book entries
export type BonusId = 'nearMiss' | 'transfer' | 'popOut' | 'spinOut' | 'revert' | 'gap' | 'landmark' | 'newGround' | 'knock';
export type HintId = 'drag' | 'tap' | 'grind' | 'pick' | 'flip' | 'avoid' | 'manual' | 'transfer' | 'spin' | 'pit';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Slot = 'skater' | 'board' | 'helmet';
export type ItemId = string;          // stable save keys, e.g. 'sk_juno', 'bd_plain_maple', 'hm_classic'
export type CrateTier = 'cardboard' | 'street' | 'pro';
export type ScreenId = 'boot' | 'title' | 'run' | 'pause' | 'crash' | 'results' | 'rewards'
  | 'locker' | 'shop' | 'crates' | 'stats' | 'settings';
export type QualityTier = 'low' | 'med' | 'high';
```

### 4.2 `core/math.ts`, `core/rng.ts`, `core/tuning.ts`
```ts
// core/math.ts
export interface V3 { s: number; x: number; y: number }               // track space, metres
export interface AABB { s0: number; s1: number; x0: number; x1: number; y0: number; y1: number }
export const clamp = (v: number, a: number, b: number) => /*…*/ 0;
export const lerp = (a: number, b: number, u: number) => /*…*/ 0;
export const smoothstep = (e0: number, e1: number, v: number) => /*…*/ 0;
export const approach = (v: number, target: number, maxDelta: number) => /*…*/ 0;
export const round1cm = (v: number) => Math.round(v * 100) / 100;

// core/rng.ts (deterministic; the only randomness allowed in sim/, tricks/, world/gen/, meta/crates)
export function hash32(...ints: number[]): number { /* murmur3 finalizer chain */ return 0; }
export class Sfc32 {
  constructor(seed: number) {}
  next(): number { return 0; }                       // uint32
  float(): number { return 0; }                      // [0,1)
  range(a: number, b: number): number { return 0; }  // [a,b)
  int(a: number, b: number): number { return 0; }    // [a,b]
  chance(p: number): boolean { return false; }
  pick<T>(arr: readonly T[]): T { return arr[0]!; }
  weighted<T>(items: readonly (readonly [T, number])[]): T { return items[0]![0]; }
  getState(): [number, number, number, number] { return [0, 0, 0, 0]; }
  setState(s: [number, number, number, number]): void {}
}
export type RngStream = 'layout' | 'coins' | 'decor' | 'movers';
export const streamSeed = (runSeed: number, segIndex: number, stream: RngStream) =>
  hash32(runSeed, segIndex, ['layout', 'coins', 'decor', 'movers'].indexOf(stream));
```

```ts
// core/tuning.ts: values from DESIGN §5, §6, §7, §8 and §10.6. Single source of truth.
export const SIM_HZ = 60, DT = 1 / 60;
export const V_START = 7.0, V_MAX = 10.5, RAMP_T0 = 20, RAMP_T1 = 150;
export function speedAt(t: number): number { /* 7 + 3.5·smoothstep(20,150,t) */ return 0; }
export function sAt(t: number): number { /* closed form, see §6.2 */ return 0; }
export function tAt(s: number): number { /* inverse: piecewise, Newton on [20,150] */ return 0; }
export const SPEED_TIERS = [8.0, 9.0, 10.5] as const;   // tier 1/2/3 thresholds: events, HUD stamps, audio layer, speed lines
export const G = 22, V_POP = 6.6, T_AIR_FLAT = 0.6;
export const CORRIDOR_HALF = 4.5, SOFT_WALL_X = 4.2, SOFT_WALL_K = 60, TARGET_X_MAX = 4.3;
export const V_LAT_MAX = 5.5, A_LAT_GROUND = 40, A_LAT_AIR = 16, STEER_P = 10;
export const STEER_LEAD_MAX = 0.8;   // touch steerDx never puts targetX further ahead of the skater (added @steer)
export const STEER_FAST = { vMax: 7.0, accel: 80 } as const;   // a thumb that outruns the skater (added @steer, §6.3)
export const STEER_BRAKE = { stopM: 0.03, jitterM: 0.012, restLead: 0.2, ground: 66, air: 40, reach: 0.2, winMax: 4 } as const;   // release brake (added @steer, §6.3)
export const STEER_GAIN = { roll: 1.0, manual: 1.0, air: 1.0, grind: 0, crashed: 0 } as const;
export const HITBOX = { w: 0.40, l: 0.70, h: 1.50 } as const;
export const FACE_INSET = 0.08, STEP_UP = 0.18, PIT_FALL_EPS = 0.02;   // pit level = lip level (DESIGN §7)
export const HEIGHT = { bumpMax: 0.18, lowMax: 0.60, forbidMin: 0.61, forbidMax: 1.14, tallMin: 1.15,
  fullWidthMaxH: 0.50, fullWidthMaxL: 0.60, pitMaxSec: 0.35 } as const;
export const COYOTE = 0.08, JUMP_BUFFER = 0.15, POP_BLEED = 0.07, LATE_FLIP_CUTOFF = 0.15;
export const LAND = { snap: 0.80, sketchy: 0.55, sketchyFirstRuns: 0.40, perfectLast: 0.12,
  snapTime: 0.06, edgeNudge: 0.15, sketchyWobble: 0.3 } as const;
/** The magnet and ground align steer by moving targetX (never by adding acceleration). */
export const MAGNET = { range: 1.6, inner: 0.4, rateMax: 3.0, transferRange: 2.5, transferRate: 4.5,
  cancelDragM: 15 * 0.042 } as const;   // ≈ 15 px of opposite drag at default sensitivity, after consumed swipes
export const CAPTURE = { lat: 0.9, latPickOnly: 0.6, below: 0.30, above: 0.45, vyMax: 1.5, snapT: 0.08 } as const;
export const GROUND_ALIGN = { tMin: 0.2, tMax: 1.0, rateMax: 1.5 } as const;
export const GRIND = { pickBefore: 0.25, pickAfter: 0.12, perfectLock: 0.08, switchAfter: 0.25,
  maxSwitches: 2, endHopVy: 2.5 } as const;
export const MANUAL = { budgets: [3.0, 2.2, 1.6, 1.2], budgetFloor: 1.0, coast: 0.30,
  prePressMax: 0.30, prePressMin: 0.10 } as const;   // pre-press touch-down window before touchdown
export const GRAB = { minAirLeft: 0.25, releaseBefore: 0.12, maxDur: 1.0 } as const;
export const FLIP_UPGRADE_MAX_PROGRESS = 0.6, SPIN_UPGRADE_MAX_PROGRESS = 0.6, KEY_DIAG_AMEND = { ms: 80, maxProgress: 0.25 } as const;
export const SIDE_BUMP_V = 3.0, NEAR_MISS = { lat: 0.35, vert: 0.20 } as const;
export const LOOKAHEAD_MIN = 2.5, LOOKAHEAD_TARGET = 2.6, DECISION_MIN = 1.2, HAZARD_WARN_SEC = 1.6;
export const R_MIN: readonly { t: number; sec: number }[] =
  [{ t: 0, sec: 1.6 }, { t: 45, sec: 1.2 }, { t: 90, sec: 1.0 }, { t: 150, sec: 0.9 }];
export const SAFE_LATERAL_FRACTION = { ground: 0.70, air: 0.35 } as const;   // validator reach model
export const T_SHIFT = (dx: number) => 0.35 + Math.abs(dx) / (SAFE_LATERAL_FRACTION.ground * V_LAT_MAX);
export const VALIDATOR = { safeMargin: 0.10, dilateX: HITBOX.w / 2, dilateS: HITBOX.l / 2, exitBand: 2.0,
  deadEndMaxSec: 2.0, ollieWindowRequired: 0.25, ollieWindowOptional: 0.15, historyMinSec: 1.0,
  myopic: { lookSec: 1.5, reaction: 0.35, latFrac: 0.75 } } as const;
export const CAMERA = { pitchDeg: 35, yawMinDeg: 0, yawMaxDeg: 30, yawAspect0: 0.75, yawAspect1: 1.25,
  anchorFromTop: 0.74, hudPx: 56, marginX: 0.3, behind: 1.5, headroom: 0.8, zoomTau: 2.0,
  vertTau: 0.3, latFollow: 0.15, xrayCapY: 1.6, minEdgePx: 2.5, minCoinPx: 12 } as const;
  // hudTop is not a constant: hudTop = (viewport.safeTop + hudPx) / viewport.hCss (§8.3)
export const CHUNK_LEN = 32, GEN_AHEAD_SEC = 12, ORIGIN_REBASE = 512;
export const CHUNK_WINDOW = { behind: 1, ahead: 3 } as const;
export const ROLLOUT_SEC = 9, LESSON_SEC = 40;
/** DESIGN §12.1 area timeline (added @G1, MU): first visit 40 s, later visits 35 s, gateways 4 s (world/gen re-exports). */
export const FIRST_VISIT_SEC = 40, VISIT_SEC = 35, GATEWAY_SEC = 4;
export const REWIND = { sec: 1.5, max: 3, snapEveryTicks: 15, ring: 8 } as const;
// Sim tunables moved from sim/consts.ts (applied @G0, docs/core-requests.md M0-sim section).
export const ROLL_OFF_DROP = 0.05, STICKY_DROP = 0.3;                 // TECH §6.3 step 5 (roll-off, sticky slabs)
export const BUMP_WOBBLE = 0.3, MANUAL_END_WOBBLE = 0.3;              // s (side bump TECH §6.4, manual budget end)
export const COIN_VOLUME = { lat: 0.3, fwd: 0.4, vert: 0.7, centreUp: 0.75 } as const;   // DESIGN §10.8
export const COIN_CHAIN_TICKS = 30, PICK_MISS_TICKS = 3;
```

### 4.3 `core/world.ts`: world data model
```ts
import type { V3, AABB } from './math';
import type { AreaId, GatewayId, Surface, EdgeKind, EdgeMaterial, PropKind, HintId } from './ids';

/** A crash/collision volume. Crash faces are `box` inset by FACE_INSET (the sim applies the inset; it is not stored).
 *  Every raised GroundSlab more than STEP_UP above its neighbours also emits a 'landable' Solid (its body). */
export interface Solid {
  box: AABB;
  top: 'landable' | 'crash' | 'knock';   // T → landable, K → knock, else crash (DESIGN §10.3). 'crash' tops never skim.
  tall: boolean;                          // top − local ground ≥ HEIGHT.tallMin (x-ray cap, A1 column rule)
}
/** A rideable surface. Flat when y0 === y1; stairs and inclines slope linearly along s. */
export interface GroundSlab {
  s0: number; s1: number; x0: number; x1: number;
  y0: number; y1: number;                 // surface height at s0 / s1
  layer: 0 | 1;                           // 0 = datum surface (street, terraces, stairs), 1 = optional deck
  surface: Surface;
  kind: 'flat' | 'stairs' | 'incline';
  steps?: number;
}
/** Pit level = lipY (DESIGN §7): fall when the board centre is over it and boardBottom ≤ lipY + PIT_FALL_EPS.
 *  `depth` is visual only. */
export interface Pit { s0: number; s1: number; x0: number; x1: number; lipY: number; depth: number; cause: 'fall' | 'splash' }
export interface GrindEdge {
  id: number; obstacleId: number;
  a: V3; b: V3;                           // a.s < b.s, |dx/ds| ≤ 0.3, may slope (stair rails, hubbas); never crosses a segment
  kind: EdgeKind; material: EdgeMaterial;
  layer: 0 | 1;
  pickOnly: boolean;                      // curb-class (≤ STEP_UP above local ground): capture only with a pick swipe; no magnet, no align
}
/** Phase-locked mover: lateral offset is a pure function of the PLAYER's s (DESIGN §10.9). */
export interface MoverDef { axis: 'x'; dxTotal: number; sStart: number; sEnd: number; telegraphS: number }

export const ObTag = {
  FullWidth: 1, TrickLine: 2, SafeLine: 4, Required: 8, Knockable: 16, Grindable: 32, Elevated: 64, Filler: 128, Mover: 256,
} as const;

export interface Obstacle {
  id: number; kind: PropKind; area: AreaId; segment: number;
  s: number; x: number;                   // anchor: front-centre at local ground
  len: number; wid: number; hgt: number;
  rotY: 0 | 1 | 2 | 3;                    // visual only; collision geometry below is already in track space
  mirror: boolean; variant: number;
  solids: Solid[]; slabs: GroundSlab[]; pits: Pit[]; edges: GrindEdge[];
  tags: number;                           // ObTag bit set
  mover?: MoverDef;
  gap?: { name: string; pts: number; fromObstacle?: number };
  landmark?: string;
  warnAtS?: number;                       // full-width hazards: s where the 1.6 s warning fires
  params?: Record<string, number>;        // builder parameters the kit needs (steps, machines, slot x, …)
  hint?: HintId;                          // Lesson Line: the hint this obstacle teaches
}
export interface Coin { id: number; p: V3; value: 1 | 10; line: 'trick' | 'safe' | 'breather' }
export interface Decor {
  kind: string;                           // renderer-owned vocabulary (WA), e.g. 'building', 'lantern_string'
  s: number; x: number; y: number; rotY: number; scale: number; variant: number; castShadow: boolean;
  params?: Record<string, number>;
}
export interface SafeKey { t: number; s: number; x: number; action?: 'ollie' }
export interface Segment {
  index: number; templateId: string; area: AreaId; tier: 0 | 1 | 2 | 3 | 4;
  t0: number; t1: number; s0: number; s1: number;
  mirror: boolean; rerolls: number; fallback: boolean; gateway?: GatewayId;
}
export interface AreaBlend { from: AreaId; to: AreaId; u: number }    // u ∈ [0,1] across the 8 s palette window
export interface Chunk {
  index: number; s0: number; len: number;        // len = CHUNK_LEN
  area: AreaId; blend: AreaBlend | null;         // evaluated at chunk centre (renderer re-evaluates per frame)
  obstacles: Obstacle[];                          // every obstacle overlapping [s0, s0+len)
  coins: Coin[]; decor: Decor[]; safe: SafeKey[]; segments: number[];
}
export interface GenStats {
  segments: number; rerolls: number; fallbacks: number; rejections: Record<string, number>;
  trickCoinShare: number; msPerSegment: number;
}
/** startT: no Roll-out, s0 = sAt(startT), phase and A1–A3 clocks start at startT (DESIGN §10.1).
 *  startArea: rotates the area timeline (Start District, M5 stretch); default 'downtown'. */
export interface WorldGenConfig { seed: number; mode: 'lesson' | 'normal'; startT?: number; startArea?: AreaId }
export interface WorldGen {
  readonly seed: number; readonly mode: 'lesson' | 'normal';
  /** Generate segments until coverage ≥ sAhead, or stop after maxSegments (the caller budgets time; world/gen
   *  may not read clocks). Returns true when coverage ≥ sAhead. */
  ensure(sAhead: number, maxSegments?: number): boolean;
  chunk(i: number): Chunk;                        // memoized; generates on demand, strictly in order
  release(beforeIndex: number): void;             // drop chunks/segments behind the player
  segments(): readonly Segment[];
  areaAt(s: number): { area: AreaId; blend: AreaBlend | null; gateway: GatewayId | null; first: boolean };
  stats(): GenStats;
}
export interface GroundHit {
  y: number; layer: 0 | 1; surface: Surface; slab: GroundSlab | null; pit: Pit | null;
}
export interface WorldQuery {
  obstacles(s0: number, s1: number): readonly Obstacle[];       // de-duplicated, sorted by s
  groundAt(s: number, x: number, yMax: number): GroundHit;      // highest slab top ≤ yMax under (s,x); if none, pit with y = pit.lipY
  edgesNear(s0: number, s1: number, x: number, range: number): readonly GrindEdge[];
  coins(s0: number, s1: number): readonly Coin[];
  moverOffset(ob: Obstacle, playerS: number): number;           // lateral offset to add to the obstacle's geometry
  edge(id: number): GrindEdge | undefined;
  obstacle(id: number): Obstacle | undefined;
}
```

### 4.4 `core/input.ts`: input contract
```ts
import type { Dir8 } from './ids';

/** One per sim tick. Recordable/replayable. Gestures only; meaning is decided by the sim (DESIGN §4.3). */
export interface InputFrame {
  steerDx: number;       // metres to add to targetX this tick (touch/mouse drag, sensitivity applied)
  steerAxis: number;     // −1..1 held keys / stick: targetX moves at steerAxis·V_LAT_MAX
  tap: boolean;          // edge: still touch released ≤ 350 ms after down | Space/W keydown | 2nd-finger tap | pad A
  swipe: Dir8 | null;    // edge: recognized swipe | arrow-key direction
  swipeDx: number;       // metres of steering that stroke contributed: its 80 ms window, or all since touch-down if ≤ 150 ms old
  swipeFast: boolean;    // ≥ 60·k px in 80 ms (≥ 0.75 px/ms)
  swipeFromRest: boolean;// the thumb was parked (< 0.15 px/ms for ≥ 60 ms) right before the flick
  swipeSteer: boolean;   // the stroke is the steering owner and older than 150 ms (steering-stroke rule, DESIGN §4.3)
  swipeAmend: boolean;   // keyboard: a 2nd arrow ≤ 80 ms after the 1st; replaces it with the diagonal if the trick is < 25% done
  hold: boolean;         // level: touch HOLD active (still ≥ 200 ms). Ground → manual (if allowed); air → grab.
  press: boolean;        // level: a non-DRAG touch is down, or the manual key is held. The sim tracks its rising edge
                         //        for the pre-press window (0.30–0.10 s before touchdown). A touch that becomes a DRAG drops it.
  manualKey: boolean;    // level: S/Shift/RT held. Ground → manual like HOLD; air → never a grab (press handles pre-press)
  grab: boolean;         // level: Q / LT held
  /** added @G1 (GP): edge: a still touch released after tapMaxMs and ≤ longTapMaxMs (600 ms) after down,
   *  a HOLD that never moved. The sim reads it as a TAP wherever that hold started nothing. */
  longTap?: boolean;
}
export const EMPTY_FRAME: Readonly<InputFrame> = { steerDx: 0, steerAxis: 0, tap: false, swipe: null, swipeDx: 0,
  swipeFast: false, swipeFromRest: false, swipeSteer: false, swipeAmend: false,
  hold: false, press: false, manualKey: false, grab: false };

export interface PointerSample { id: number; tMs: number; x: number; y: number; phase: 'down' | 'move' | 'up' | 'cancel' }
export type Gesture =
  | { k: 'steer'; tMs: number; dxPx: number }
  | { k: 'tap'; tMs: number }
  | { k: 'swipe'; tMs: number; dir: Dir8; dxPx: number; fast: boolean; fromRest: boolean; steer: boolean }
  | { k: 'holdStart'; tMs: number } | { k: 'holdEnd'; tMs: number; release?: true }   // release: the long tap (added @G1)
  | { k: 'press'; tMs: number; down: boolean };
export interface RecognizerConfig {
  slopPx: number; tapMaxMs: number; holdMs: number;                 // 10, 350, 200
  swipeWindowMs: number; swipeMinPx: number; fastMinPx: number;     // 80, 32, 60
  liftSwipeMinPx: number; liftSuppressMs: number;                   // 24, 150
  recoilMs: number; recoilDeg: number;                              // 150, 60
  refireMs: number; refireDip: number;                              // 90, 0.5 (speed must dip below 50% of the last peak)
  restSpeed: number; restMs: number; steerStrokeMs: number;         // 0.15 px/ms, 60, 150
  cardinalHalfDeg: number; diagonalHalfDeg: number;                 // 30, 15
  arcCompDeg: number; arcOuterFrac: number;                         // 8, 0.4
  simpleTricks: boolean;                                            // Settings: diagonals snap to cardinals
  deadZoneBottomPx: number;                                         // safeBottom + 12
  k: number;                                                        // clamp(screenW/390, 0.85, 1.3)
  // CSS px (added @G0): arc compensation uses the outer arcOuterFrac of screenW; touch-starts below
  // screenH − deadZoneBottomPx are ignored. 0 / absent = 390·k / no dead zone.
  screenW?: number; screenH?: number;
}
export interface GestureRecognizer {                       // pure; unit-tested with synthetic traces
  feed(s: PointerSample): Gesture[];                       // 'cancel' → no tap/swipe, ends hold, frees steering
  tick(nowMs: number): Gesture[];                          // time-based transitions (HOLD at 200 ms)
  reset(): void;
  readonly config: RecognizerConfig;
}
export interface InputSource {
  /** Collect everything with timestamp ≤ tickEndMs into one frame. Called once per sim tick. */
  frame(tickEndMs: number): InputFrame;
  setEnabled(on: boolean): void;
  setSensitivity(mult: number): void;                      // 0.6..1.6
  setPreset(p: 'A' | 'B'): void;
  onAnyInput(f: () => void): () => void;                   // fires on pointerup/touchend/click/keydown (user activation): audio unlock
  setSimpleTricks?(on: boolean): void;                     // Settings "Simple tricks" → RecognizerConfig.simpleTricks (added @m0-core)
  /** Schedules a synthetic trace through the real recognizer and frame binning: the first sample lands at `atMs`
   *  (default now), later samples keep their relative times (debug `__skate.pointer` in rAF mode; added @G0). */
  inject?(samples: readonly PointerSample[], atMs?: number): void;
  dispose(): void;
}
```

### 4.5 `core/sim.ts`: sim state and API
```ts
import type { V3 } from './math';
import type { AreaId, CrashCause, FlipId, GrindId, ManualId, GrabId, SpinId, TrickId, Surface, PropKind } from './ids';
import type { InputFrame } from './input';
import type { GameEvent } from './events';
import type { WorldGen, WorldGenConfig, WorldQuery } from './world';
import type { SkaterPose } from './view';

export type SkaterMode = 'roll' | 'air' | 'grind' | 'manual' | 'crashed';
/** angle0/t0 let an upgrade keep the current angle and spread the remaining rotation (no visible jump). */
export interface FlipState { id: FlipId; t: number; dur: number; upgrades: number; airLeftAtStart: number; angle0: number; t0: number }
export interface SpinState { id: SpinId; t: number; dur: number; upgrades: number; startTick: number; linked: boolean }
export interface GrindState {
  edgeId: number; obstacleId: number; id: GrindId; u: number;   // u = 0..1 along the edge
  t: number; lockTick: number; perfect: boolean; switches: number; transfer: boolean;
}
export interface ManualState { kind: ManualId; t: number; budget: number; coast: number; switched: boolean }
export interface GrabState { id: GrabId; t: number }
export interface SkaterState {
  tick: number; t: number;                       // run time t = startT + tick·DT
  p: V3; vel: { s: number; x: number; y: number };
  targetX: number;
  mode: SkaterMode; layer: 0 | 1; groundY: number; surface: Surface;
  airT: number; airLeft: number;                 // seconds airborne; predicted seconds to touchdown
  dropH: number;                                 // take-off height − predicted landing height
  coyote: number; jumpBuffer: number; popBleed: number;
  flip: FlipState | null; flipsThisAir: number; airTricks: TrickId[];
  spin: SpinState | null; fakie: boolean;        // fakie is visual only; auto-reverts on ground touchdown
  grind: GrindState | null; pickWindow: { edgeId: number; tCapture: number } | null;
  magnetEdge: number | null; magnetCancelled: boolean; transferArmed: boolean;
  manual: ManualState | null; grab: GrabState | null;
  pressRiseTick: number;                         // tick the current press went down (−1 if none): pre-press window
  wobble: number;
  crash: { cause: CrashCause; obstacleId: number | null; obstacleKind: PropKind | null; tick: number;
           flipProgress: number; spinProgress: number } | null;
}
export interface ComboEntry { id: TrickId; pts: number; factor: number; mod: number; link: boolean }
export interface ComboState {
  active: boolean; entries: ComboEntry[]; flat: number; links: number;
  manualLinked: boolean; manualCount: number;    // manual budget index within this combo
  window: number;                                // seconds left in link window; −1 = paused (in air/grind/manual)
  heat: number;                                  // seconds left to start the next link-adding trick (2.5); paused in grind/manual
  bankIn: number;                                // min(heat, window while rolling): drives the bank-timer arc
  startTick: number;                             // for the p95 combo-duration check
  pending: number;                               // current unbanked value (formula DESIGN §13.2)
  uniqueNames: number;
}
export interface ScoreState {
  total: number; trickPts: number; distancePts: number; bonusPts: number;
  combo: ComboState; bestCombo: number; maxLinks: number; lostCombo: number;
  coins: number; coinPayouts: number;
  recent: TrickId[];                             // decay window (10)
  tricks: Partial<Record<TrickId, number>>;
  longestGrind: number;
  areasReached: AreaId[]; furthestArea: AreaId; maxSpeed: number;
}
export interface RunConfig {
  runId: string;                                 // drawn outside the sim with the seed; makes MetaApi.applyRun idempotent
  seed: number; mode: 'lesson' | 'normal'; startT?: number;
  startArea?: AreaId;                            // Start District (M5 stretch); default 'downtown'
  firstRuns: boolean;                            // bail floor 0.40 when true (first 3 runs)
  bestDist: number;                              // for the BEST line event
  god?: boolean;                                 // debug: crashes are logged, not applied
  rewinds?: number;                              // lesson: crash → rewind (REWIND.max). Implemented by GP in W1a.
}
export interface RunResult {
  runId: string; seed: number; mode: 'lesson' | 'normal'; startArea: AreaId;
  score: number; trickPts: number; distance: number; durationS: number;
  coins: number; coinPayouts: number; bestCombo: number; maxLinks: number; lostCombo: number;
  furthestArea: AreaId; areasReached: AreaId[]; maxSpeed: number;
  tricks: Partial<Record<TrickId, number>>; longestGrind: number;
  crash: { cause: CrashCause; obstacleKind: PropKind | null; state: SkaterMode; t: number;
           flipProgress: number; spinProgress: number } | null;
}
export type SimSnapshot = { readonly __brand: 'SimSnapshot' };   // opaque; structuredClone-able
export interface Sim {
  readonly cur: Readonly<SkaterState>; readonly prev: Readonly<SkaterState>;
  readonly score: Readonly<ScoreState>;
  readonly gen: WorldGen; readonly world: WorldQuery;
  reset(cfg: RunConfig): void;
  step(f: InputFrame): readonly GameEvent[];      // exactly one 60 Hz tick; returns this tick's events in order
  pose(): SkaterPose;                             // visual targets for `cur` (deterministic)
  result(): RunResult;
  snapshot(): SimSnapshot; restore(s: SimSnapshot): void;
  hash(): number;                                 // FNV-1a over quantized state, for determinism tests
}
/** Optional dependency injection, so GP can test with hand-built worlds (tests/unit/sim/fixtures.ts). */
export interface SimDeps { makeWorld(cfg: WorldGenConfig): { gen: WorldGen; world: WorldQuery } }
```

### 4.6 `core/view.ts`: visual and animation state, render interfaces
```ts
import type { Object3D, OrthographicCamera, PerspectiveCamera, Scene, WebGLRenderer, Texture } from 'three';
import type { AreaId, GrindId, ManualId, QualityTier } from './ids';
import type { ScoreState, SkaterMode, SkaterState } from './sim';
import type { AreaBlend, WorldGen } from './world';
import type { GameEvent } from './events';
import type { Loadout } from './cosmetics';

export type PoseId = 'roll' | 'carve' | 'pop' | 'tuck' | 'flip' | 'grab' | 'land' | 'manual' | 'noseManual'
  | 'grind' | 'sketchy' | 'crash' | 'idle' | 'showcase';
/** Produced by Sim.pose() each tick: deterministic targets. The view smooths them with springs. */
export interface SkaterPose {
  mode: SkaterMode; pose: PoseId; grindId: GrindId | null; manualKind: ManualId | null;
  heading: number;                     // rad, board yaw from carve = atan2(vx, vs)
  lean: number;                        // rad, body roll from carve
  latAccel: number;                    // m/s², toeside(+)/heelside(−) pose selection
  crouch: number;                      // 0..1
  board: { roll: number; yaw: number; pitch: number };   // deg, eased flip/shuv/manual rotation (continuous across upgrades)
  bodyYaw: number;                     // deg, grind/slide body orientation
  spinYaw: number;                     // deg, body + board spin (FS/BS 180/360), 0 when not spinning
  fakie: boolean;                      // visual stance after a 180 until the revert
  height: number;                      // board bottom above ground (blob shadow)
  airT: number; wobble: number;        // wobble 0..1
  landImpulse: number;                 // 1 on the touchdown tick (scaled by drop), else 0
  crash: { t: number; seed: number } | null;
}
export interface Viewport { wCss: number; hCss: number; dpr: number; aspect: number; safeTop: number; safeBottom: number;
  coarse: boolean }                    // coarse = (pointer: coarse); with aspect > 1 on a phone → rotate card
export interface RenderFrame {
  alpha: number;                       // interpolation factor between prev and cur
  dt: number;                          // real frame delta (s)
  timeScale: number;                   // slow-mo (render & loop), 1 = normal
  prev: Readonly<SkaterState>; cur: Readonly<SkaterState>; pose: Readonly<SkaterPose>;
  score: Readonly<ScoreState>;         // bank-timer arc (combo.bankIn, heat), predicted-landing tint
  events: readonly GameEvent[];        // sim events since the last frame, in order
  playerS: number; speed: number;
  area: AreaId; blend: AreaBlend | null;
  viewport: Viewport;
}
export interface PaletteSample {
  zenith: number; mid: number; horizon: number; sun: number; sunGlow: number; fog: number;
  hemiSky: number; hemiGround: number; sunColor: number; sunIntensity: number; sunElevDeg: number;
  exposure: number; windowLit: number; neonGlow: number;  // 0..1
}
export interface GfxContext {
  renderer: WebGLRenderer; scene: Scene; quality: QualityTier;
  palette(area: AreaId, blend: AreaBlend | null): PaletteSample;
  canvasTexture(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): Texture;
}
export interface WorldView {
  attach(gen: WorldGen): void;        // new run
  update(f: RenderFrame): void;       // streaming, time-sliced chunk builds (≤ 4 ms), lights, palette
  setQuality(q: QualityTier): void;
  rebuildGPU(): void;                 // after context restore
  stats(): { chunksBuilt: number; buildMsP95: number; drawCalls: number };
  dispose(): void;
  /** added @G1 (WA): work-time auto-adjust (§8.9) on while the saved quality is 'auto', off after a manual pick. */
  setAutoQuality?(on: boolean): void;
}
export interface SkaterView {
  readonly object3d: Object3D;
  setLoadout(l: Loadout): void;
  update(f: RenderFrame): void;
  setMode(m: 'run' | 'showcase'): void;   // showcase = Locker/Shop turntable
  setTurntable?(yawDeg: number): void;    // showcase yaw, deg (Locker drag via UiIntent 'turntable', shots) (added @m0-core)
  rebuildGPU(): void;
}
export type CameraMode = 'run' | 'title' | 'locker';   // 'title' = static diorama (live attract run is M5 stretch)
export interface CameraRig {
  readonly camera: OrthographicCamera | PerspectiveCamera;
  setMode(m: CameraMode): void;
  update(f: RenderFrame): void;
  shake(amp: number, dur: number): void;
  punch(zoomFrac: number, dur: number): void;
  setReducedMotion(on: boolean): void;
  /** Pure framing solver (unit-tested): ortho height, yaw and achieved full-width look-ahead in seconds,
   *  measured below hudTop = (vp.safeTop + CAMERA.hudPx) / vp.hCss. `rotate` = phone in landscape → show the rotate card. */
  solve(speed: number, vp: Viewport): { H: number; yawDeg: number; lookAheadSec: number; anchorY: number; hudTop: number; rotate: boolean };
  /** Projects a track-space point to CSS px (HUD anchor, popups). */
  project(p: { s: number; x: number; y: number }): { x: number; y: number };
}
export interface Vfx {
  update(f: RenderFrame): void; setQuality(q: QualityTier): void; clear(): void;
  /** Legendary cosmetic particles requested by skater/ (TECH §8.5; added @G0, implemented by WA / M5). */
  emit?(kind: 'steam' | 'leaves' | 'petals' | 'glyphs' | 'lightTrail', p: { s: number; x: number; y: number }, n?: number): void;
  /** added @G1 (WA): DESIGN §18.8 reduced motion / "Reduce effects" (no speed lines, no ambient drift). */
  setReducedMotion?(on: boolean): void;
}
```

### 4.7 `core/tricks.ts` and `core/cosmetics.ts`: trick definitions and look parameters
```ts
// core/tricks.ts
import type { Dir8, FlipId, GrindId, ManualId, GrabId, SpinId } from './ids';
export interface FlipDef {
  id: FlipId; name: string;
  input: readonly Dir8[];             // e.g. ['dl','dl'] for treFlip
  upgradeOf: FlipId | null;           // repeat-swipe upgrade source (kickflip → doubleKickflip)
  dur: number;                        // seconds
  rot: { roll: number; yaw: number; pitch: number };   // degrees, signed (BS yaw +)
  pitchArc?: number;                  // degrees of transient pitch arc mid-flip (Hardflip 70)
  points: number;
}
export interface SpinDef {
  id: SpinId; name: string;
  input: Dir8;                        // 'ur' (FS) or 'ul' (BS); a repeat while < 60% done upgrades 180 → 360
  upgradeOf: SpinId | null;
  dur: number; yaw: number;           // 0.30 / 0.50 s; ±180 / ±360 deg
  points: number;                     // 150 / 350
}
export interface GrindDef {
  id: GrindId; name: string;
  input: readonly Dir8[];             // [] = default (50-50)
  contact: 'bothTrucks' | 'backTruck' | 'frontTruck' | 'deck' | 'deckNose' | 'deckTail' | 'tailOver' | 'noseOver';
  slide: boolean;                     // deck-scrape audio layer
  entry: number; perSec: number;
}
export interface ManualDef { id: ManualId; name: string; entry: number; perSec: number }
export interface GrabDef { id: GrabId; name: string; entry: number; perSec: number; maxDur: number }
export interface TrickTables {
  flips: readonly FlipDef[]; spins: readonly SpinDef[]; grinds: readonly GrindDef[]; manuals: readonly ManualDef[];
  grabs: readonly GrabDef[];
  ollie: { points: number; minFactor: number };
}
```

```ts
// core/cosmetics.ts. Purely visual: nothing here may reach sim/, tricks/ or world/gen/.
import type { AreaId, ItemId, Rarity, Slot } from './ids';
export type Hex = number;                                   // 0xRRGGBB
export type HairId = 'none' | 'bob' | 'longStraight' | 'curlyMop' | 'afroPuff' | 'buzz' | 'twinBuns'
  | 'topBun' | 'ponytail' | 'spikes' | 'shortGrey' | 'mohawk';
export type TopId = 'tee' | 'hoodie' | 'longSleeve' | 'jacket' | 'varsity' | 'raincoat' | 'overalls'
  | 'trackJacket' | 'coveralls' | 'courierJacket' | 'cardigan' | 'robot';
export type PrintId = 'none' | 'stripe' | 'pocket' | 'chestLogo' | 'crestRD' | 'paintDots' | 'sunsetStripe';
export type BottomId = 'baggyJeans' | 'slimJeans' | 'cargoShorts' | 'shorts' | 'chinos' | 'trackPants'
  | 'slacks' | 'onePiece' | 'robot';
export type ShoeId = 'lowTop' | 'highTop' | 'chunky' | 'rainBoots' | 'workBoots' | 'robot';
export type AccessoryId = 'tallSocks' | 'tubeSocks' | 'wristband' | 'headphones' | 'beanie' | 'backpack' | 'antenna';
export type SkaterFx = 'reflectiveStrips' | 'lightSeams' | 'leafTrail' | 'screenFace' | 'coatSway';
export interface SkaterLook {
  kind: 'human' | 'robot';
  skin: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;                    // SKIN_TONES index (ignored for robot)
  build: 'slim' | 'regular' | 'stocky'; heightScale: number; // 0.92..1.08, visual only
  hair: HairId; hairColor: Hex; hairTip?: Hex; facialHair?: 'moustache';
  top: TopId; topColors: [Hex, Hex]; print: PrintId; printColors?: Hex[];
  bottom: BottomId; bottomColor: Hex;
  shoes: ShoeId; shoeColor: Hex;
  accessory: AccessoryId | null; accessoryColor?: Hex;
  stance: 'regular' | 'goofy'; poseStyle: 'normal' | 'upright';
  fx: SkaterFx[];
}
export type BoardPattern = 'plainMaple' | 'stripes' | 'chevrons' | 'checker' | 'halftoneSun' | 'palms'
  | 'waveLines' | 'polka' | 'gradientFade' | 'stickerBomb' | 'topo' | 'neonGrid' | 'retroSun' | 'brick'
  | 'cassette' | 'corrugated' | 'koi' | 'streetMap' | 'lanterns' | 'goldLeaf';
export interface BoardLook {
  pattern: BoardPattern; palette: [Hex, Hex, Hex]; scale: number; rot: 0 | 45 | 90; wear: number;
  logo: string | null; grip: Hex; wheels: Hex; trucks: Hex;
  finish: 'flat' | 'holo' | 'animHue' | 'goldLeaf' | 'emissive';
  wheelFx: 'none' | 'lightTrail' | 'hoverRing'; fxColor?: Hex; gripGlow?: Hex; animated?: boolean;
}
export interface HelmetLook {
  shell: 'dome' | 'visor' | 'bucket' | 'retro' | 'hardHat' | 'lantern' | 'bubble' | 'catEars' | 'petalRing' | 'wrapVisor';
  color: Hex; decal: 'none' | 'stickers' | 'stripe' | 'scuffs' | 'plaid' | 'innerEars' | 'ribs' | 'fish'
    | 'petals' | 'glyphScroll';
  decalColor: Hex; finish: 'matte' | 'gloss' | 'chrome' | 'emissive'; visorTint?: Hex; opacity?: number;
  fx: 'none' | 'emissiveDusk' | 'orbitFish' | 'petalShed' | 'glyphTrail' | 'earFlick';
}
export interface CosmeticItem {
  id: ItemId; slot: Slot; name: string; rarity: Rarity;
  source: 'starter' | 'shop' | 'level30';              // 'level30' = never in shop or crates
  theme?: AreaId;
  look: SkaterLook | BoardLook | HelmetLook;
}
export interface Loadout { skater: SkaterLook; board: BoardLook; helmet: HelmetLook }
export const SKIN_TONES: readonly Hex[] =
  [0xF6D7C3, 0xEBC1A0, 0xD9A27E, 0xC68863, 0xA86B4A, 0x8A5238, 0x6B3D2A, 0x4A2A1E];
```

### 4.8 `core/events.ts` and `core/bus.ts`: event buses
```ts
// core/events.ts
import type { V3 } from './math';
import type { AreaId, BonusId, CrashCause, CrateTier, EdgeMaterial, FlipId, GatewayId, GrabId, GrindId,
  HintId, ItemId, ManualId, PropKind, Rarity, ScreenId, SpinId, Surface, TrickId } from './ids';
import type { RunResult, SkaterMode } from './sim';

/** Sim events: emitted inside Sim.step in order, dispatched by the loop after the tick. Deterministic. */
export type GameEvent =
  | { t: 'runStart'; tick: number; seed: number; mode: 'lesson' | 'normal'; startArea?: AreaId }   // startArea added @G0
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
  | { t: 'grindSwitch'; tick: number; from: GrindId; to: GrindId; late?: true }   // late: a re-pick ≤ 0.12 s after lock, not a switch (added @G1)
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
  | { t: 'rewind'; tick: number; toTick: number; cause?: CrashCause; obstacleId?: number | null; kind?: PropKind | null; left?: number }   // the crash it undid, rewinds left (added @G1)
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

// core/bus.ts (tiny implementation in M0)
export interface Bus<E extends { t: string }> {
  on<K extends E['t']>(t: K, f: (e: Extract<E, { t: K }>) => void): () => void;
  onAny(f: (e: E) => void): () => void;
  emit(e: E): void;
}
export function createBus<E extends { t: string }>(): Bus<E> { /*…*/ return null!; }
```

### 4.9 `core/save.ts`: save schema (versioned)
```ts
import type { AreaId, CrateTier, HintId, ItemId, TrickId } from './ids';

export interface SaveV1 {
  v: 1;
  installId: string; created: number; lastPlayed: number; installDay: string;   // YYYY-MM-DD local
  wallet: { coins: number; earnedTotal: number; spentTotal: number; coinsPurchased: number };
  xp: { total: number; level: number; intoLevel: number; held: number };   // held: onboarding cap overflow (DESIGN §14.2)
  lastRunId: string | null;                                       // applyRun idempotency
  owned: ItemId[]; unseen: ItemId[];
  equipped: { skater: ItemId; board: ItemId; helmet: ItemId };
  wishlist: ItemId | null;
  titles: string[]; badges: string[];
  crates: {
    held: Record<CrateTier, number>;
    pity: { streetEpic: number; streetLegendary: number; proLegendary: number };
    rng: [number, number, number, number];                        // Sfc32 state (rolls are pre-committed)
    pending: { tier: CrateTier; rarity: string; item: ItemId | null; coins: number; dup: boolean } | null;
    opened: number;
    /** added @G1 (MU): pre-committed results waiting behind `pending` (granted at their reveal; ≤ 8, absent when empty). */
    queue?: { tier: CrateTier; rarity: string; item: ItemId | null; coins: number; dup: boolean }[];
  };
  daily: { lastGiftDay: string | null; giftHeld: boolean; lastWarmupDay: string | null;
           adsDay: string | null; adsCount: number;
           giftBonusDay?: string | null };                        // added @G1 (MU): day the daily_gift_bonus offer was granted
  crateMeter: { metres: number; nextAt: number };                 // 4000, then +8000
  stats: {
    runs: number; best: number; bestDist: number; bestTime: number; bestCombo: number;
    furthestArea: AreaId; totalDist: number; totalTime: number; longestGrind: number;
    tricks: Partial<Record<TrickId, number>>; areaVisits: Partial<Record<AreaId, number>>;
  };
  trickBook: TrickId[]; postcards: AreaId[];
  onboarding: { lessonDone: boolean; runsStarted: number; learned: Partial<Record<HintId, boolean>>;
                crashStreak: { kind: string; runs: number } | null;
                persistAsked: boolean; installHintShown: boolean };
  settings: {
    music: number; sfx: number; haptics: 'off' | 'key' | 'all'; shake: boolean; reducedMotion: boolean; effects: boolean;
    quality: 'auto' | 'low' | 'med' | 'high'; batterySaver: boolean; steerSensitivity: number; simpleTricks: boolean;
    keyPreset: 'A' | 'B'; analyticsOptOut: boolean;
  };
  entitlements: { adFree: boolean; supporter: boolean; purchases: string[] };
  shop: { featuredDay: string | null; featured: ItemId[] };
}
export type SaveAny = SaveV1;                       // union grows with versions
export const SAVE_VERSION = 1;
export interface SaveStore {
  readonly data: Readonly<SaveV1>;
  readonly persistent: boolean;                   // false = memory fallback ("progress won't be saved")
  mutate(f: (s: SaveV1) => void): void;           // apply + debounce(500 ms) write
  flush(): void;                                  // immediate write (visibility hidden, crate rolls, purchases)
  reset(): void;
  export(): string; import(json: string): boolean;
}
```

### 4.10 `core/meta.ts`, `core/audio.ts`, `core/platform.ts`: meta, audio, haptics, monetization and analytics APIs
```ts
// core/meta.ts
import type { AreaId, CrateTier, ItemId, Rarity, Slot, TrickId } from './ids';
import type { RunResult } from './sim';
import type { CosmeticItem, Loadout } from './cosmetics';
export type Reward =
  | { kind: 'coins'; amount: number; source: string }
  | { kind: 'item'; id: ItemId; duplicateCoins: number }
  | { kind: 'crate'; tier: CrateTier; count: number; forced?: { slot?: Slot; rarity?: Rarity } }
  | { kind: 'title'; name: string } | { kind: 'badge'; id: string };
export interface NextGoal { kind: 'level' | 'wishlist' | 'crate' | 'area' | 'best'; text: string; progress: number }
export interface RunRewards {
  coins: { pickups: number; payouts: number; score: number; warmup: number; newBest: number; total: number };
  xp: { gained: number; levelBefore: number; levelAfter: number; intoLevel: number; toNext: number };
  rewards: Reward[]; newTricks: TrickId[]; newAreas: AreaId[]; newBest: boolean;
  crateMeter: { metres: number; nextAt: number; granted: number };
  wishlist: { id: ItemId; have: number; need: number } | null;
  nextGoal: NextGoal;
}
export interface CrateResult { tier: CrateTier; rarity: Rarity | 'coins'; item: ItemId | null; coins: number; dup: boolean }
export interface MetaApi {
  catalog(): readonly CosmeticItem[];
  loadout(): Loadout;
  applyRun(r: RunResult): RunRewards;            // pure rules + save mutation; idempotent per r.runId (save.lastRunId)
  canAfford(price: number): boolean;
  price(id: ItemId): { base: number; featured: number | null };
  buy(id: ItemId): boolean;
  equip(id: ItemId): void; setWishlist(id: ItemId | null): void;
  featured(): ItemId[];                          // seeded by local date
  crateOdds(tier: CrateTier): Record<string, number>;
  buyCrate(tier: 'street' | 'pro'): boolean;
  openCrate(tier: CrateTier): CrateResult;       // rolls + writes the save BEFORE any animation
  pendingReveal(): CrateResult | null; ackReveal(): void;
  dailyGiftReady(): boolean; claimDailyGift(): void;
  levelInfo(): { level: number; into: number; toNext: number };
}

// core/audio.ts
import type { AreaId, EdgeMaterial, Surface } from './ids';
import type { Bus } from './bus';
import type { AppEvent, GameEvent } from './events';
export type SfxId = 'pop' | 'whoosh' | 'catch' | 'land' | 'sketchy' | 'perfect' | 'perfectLock' | 'stair'
  | 'bump' | 'knock' | 'coin' | 'nearMiss' | 'hazardTick' | 'comboBank' | 'comboLost' | 'crash' | 'newBest'
  | 'newArea' | 'grindEntry' | 'grindExit' | 'uiTap' | 'uiBack' | 'uiToggle' | 'uiError' | 'purchase'
  | 'levelUp' | 'crateShake' | 'crateOpen' | 'revealCommon' | 'revealRare' | 'revealEpic' | 'revealLegendary'
  | 'spin' | 'revert' | 'pickChime' | 'rewind' | 'needle' | 'grindSwitch';   // internal cues, added @G0
export interface AudioEngine {
  unlock(): Promise<boolean>; readonly unlocked: boolean;
  suspend(): void; resume(): void;
  setVolumes(v: { music: number; sfx: number }): void;
  setScene(s: 'menu' | 'run' | 'paused' | 'results'): void;
  music: {
    start(area: AreaId, seed: number): void;
    setArea(a: AreaId, gatewaySec: number): void;   // pivot bar + crossfade at the next bar line
    setIntensity(level: 0 | 1 | 2 | 3): void;
    setComboFilter(mult: number): void;             // 800 Hz at ×1 → 8 kHz at ×10+
    tapeStop(): void; duck(db: number, sec: number): void; stop(): void;
    clock(): { bpm: number; nextSixteenthAt: number };   // AudioContext time
  };
  roll(speed01: number, surface: Surface, airborne: boolean, manual: boolean): void;  // every frame
  grind(active: boolean, material: EdgeMaterial | null, slide: boolean): void;      // every frame
  sfx(id: SfxId, o?: { pan?: number; pitch?: number; gain?: number; intensity?: number }): void;
  note(seq: number): void;                           // musical feedback, quantized ≤ 40 ms
  /** Event bindings live inside audio/; returns an unsubscribe function. */
  attach(game: Bus<GameEvent>, app: Bus<AppEvent>): () => void;
  stats(): { voices: number; contextState: string; scene: string; intensity: number };
}

// core/platform.ts
export interface Haptics { enabled: boolean; pulse(pattern: number | number[]): void }  // vibrate now; native bridge later
export type Placement = 'results_double_coins' | 'daily_gift_bonus';
export type Sku = 'ad_free_pass' | 'coins_s' | 'coins_m' | 'coins_l' | 'supporter_pack';
export interface Product { sku: Sku; title: string; priceLabel: string }
export type PurchaseResult =
  | { ok: true; sku: Sku; transactionId: string }
  | { ok: false; sku: Sku; reason: 'cancelled' | 'failed' | 'unavailable' };
export interface MonetizationProvider {
  readonly kind: 'null' | 'fake' | 'native';
  init(): Promise<void>;
  isAdReady(p: Placement): boolean;
  showRewarded(p: Placement): Promise<'rewarded' | 'skipped' | 'unavailable'>;
  products(): Promise<Product[]>;
  purchase(sku: Sku): Promise<PurchaseResult>;
  restore(): Promise<Sku[]>;
}
/** meta/offers.ts implements this. The UI shows an offer only if eligible() && provider.isAdReady(). */
export interface OfferPolicy { eligible(p: Placement, ctx: { runCoins: number; runsTotal: number; today: string }): boolean }
export interface Analytics {
  track(event: string, props?: Record<string, string | number | boolean | object>): void;
  setOptOut(on: boolean): void;
  buffer(): readonly { e: string; t: number; p?: object }[];
}
export interface AnalyticsSink { flush(events: readonly object[]): Promise<void> }   // future uploader
```

### 4.11 `core/debug.ts`: debug API (`window.__skate`, dev builds or `?debug=1`)
```ts
import type { AreaId, Dir8, GrindId, ManualId, PropKind, ScreenId, QualityTier } from './ids';
import type { V3 } from './math';
import type { InputFrame } from './input';
import type { GameEvent } from './events';
import type { SkaterMode } from './sim';
import type { SaveV1 } from './save';
import type { GenStats, SafeKey } from './world';

export interface DebugSnapshot {
  tick: number; t: number; mode: SkaterMode; p: V3; vel: { s: number; x: number; y: number };
  speed: number; area: AreaId; layer: 0 | 1; alive: boolean;
  score: number; combo: { pts: number; links: number; window: number }; coins: number;
  crash: { cause: string; kind: string | null } | null;
  nextObstacles: { id: number; kind: PropKind; s: number; x: number; dist: number; tags: number }[];  // next 40 m
  safe: SafeKey[];                                                                              // next 40 m
  /** added @G1 (GP): the debug overlay data (pick window, combo clocks, prediction), from sim's simDebug(). */
  sim?: DebugSimInfo;
}
/** The sim's debug overlay data (added @G1). `heat` is 0 outside a combo; `pick` is null unless the pick window is open. */
export interface DebugSimInfo {
  airLeft: number; heat: number; window: number; bankIn: number; magnetEdge: number | null; transferArmed: boolean;
  pick: { open: boolean; edgeId: number; tCapture: number; inSec: number; dirs: Dir8[]; grind: GrindId | null } | null;
  manual: { kind: ManualId; t: number; budget: number } | null;
  rewindsLeft: number;
}
export interface DebugAPI {
  readonly version: string;
  start(o?: { seed?: number; mode?: 'lesson' | 'normal'; startT?: number; startArea?: AreaId; god?: boolean; firstRuns?: boolean }): void;
  manual(on: boolean): void;                                    // true: rAF no longer advances the sim
  step(n: number, input?: Partial<InputFrame> | InputFrame[]): DebugSnapshot;
  queue(f: Partial<InputFrame>): void;                           // merged into the next tick's frame
  gesture(g: 'tap' | 'holdStart' | 'holdEnd' | { swipe: string } | { steerDx: number }): void;
  snapshot(): DebugSnapshot;
  events(sinceTick?: number): GameEvent[];                       // ring buffer of 1024
  bot(kind: 'off' | 'safe' | 'myopic' | 'thumb' | 'straight' | 'trick' | 'conformance',
      opts?: { lane?: number; reaction?: number }): void;
  pointer(samples: { id: number; tMs: number; x: number; y: number; phase: 'down' | 'move' | 'up' | 'cancel' }[]): void;  // synthetic traces
  gen(): GenStats;
  previewArea(area: AreaId, blend?: number): void;               // palette/kit preview without a run (shots.mjs)
  contrast(): { hazard: number; edge: number; worst: { kind: string; ratio: number } | null };  // shots --contrast
  timeScale(x: number): void;
  renderNow(): void;
  camera(): { H: number; yawDeg: number; lookAheadSec: number; aspect: number };
  perf(): { fps: number; p50: number; p95: number; calls: number; tris: number; geoms: number; textures: number;
            simMs: number; buildMs: number; heapMB: number | null };
  quality(q: QualityTier | 'auto'): void;
  save: { get(): SaveV1; set(s: SaveV1): void; reset(): void };
  ui(screen: ScreenId, params?: object): void;
  audio(): { unlocked: boolean; voices: number; scene: string; intensity: number;
    // added @G0: AudioContext state, whole-session average cost per rendered frame (ms), voice peak, dropped voices
    contextState?: string; msPerFrame?: number; voicePeak?: number; voicesDropped?: number };
  /** shots --audio: `sec` seconds of `area` rendered offline, as a 16-bit stereo WAV in base64 plus its peak (0..1).
   *  Resolves null until AU ships audio/index.ts `renderOffline` (added @m0-core). */
  renderAudio?(area: AreaId, sec: number): Promise<{ wavBase64: string; peak: number; sampleRate: number; sec: number } | null>;
  /** Tooling hooks for scripts/shots.mjs and the e2e specs (frozen @G0 as a hook; see DebugExt). */
  ext?: DebugExt;
}

// ── __skate.ext (added @G0): the tooling hooks shots.mjs and the e2e specs use, so later packages never edit them ──
/** HUD layout preview values (shots --hud): replace the live numbers until cleared with null. */
export interface HudPreview { score?: number; dist?: number; speed?: number; combo?: number; links?: number; coins?: number; trick?: string }
/** One measured hazard or grind edge of the DESIGN §18.4 contrast gate. */
export interface ContrastItem {
  cls: 'hazard' | 'edge'; kind: string; id: number; ratio: number; fg: number; bg: number; px: number;
  at: { x0: number; y0: number; x1: number; y1: number };     // screen box in CSS px where it was measured
}
export interface ContrastReport { hazard: number; edge: number; worst: { kind: string; ratio: number } | null; items: ContrastItem[] }
/** An isolated turntable view of the skater (shots --cosmetics), angles relative to the direction toward the camera. */
export interface CaptureView { azDeg?: number; elevDeg?: number; part?: 'all' | 'board' | 'head'; fovDeg?: number; pad?: number }
export interface DebugExt {
  overlay(on?: boolean): boolean; perfHud(on?: boolean): boolean; tuning(on?: boolean): boolean;
  contrastReport(): ContrastReport;                        // every measured hazard and edge of the current frame
  /** PNG data URL: the whole canvas, or a square crop around the skater (`native`: at rendered pixels; `view`: the
   *  skater alone on a plain `bg`, framed by its own perspective camera). */
  capture(o?: { target?: 'canvas' | 'skater'; size?: number; pad?: number; bg?: string; native?: boolean; view?: CaptureView }):
    { dataUrl: string; rect: { x: number; y: number; w: number; h: number } | null; skaterCss?: { w: number; h: number } };
  tryOn(id: string | null): boolean;                       // one catalog item over the equipped loadout (null = equipped)
  catalog(): { id: string; slot: string; name: string; rarity: string; source: string; theme?: string; look: unknown }[];
  hud(v: HudPreview | null): void;                         // HUD layout preview with fake values (null = live)
  world(): unknown;                                        // world-view internals when available
  readonly clockMs: number;                                // the synthetic clock of manual stepping (ms)
}
declare global { interface Window { __skate?: DebugAPI } }
```

### 4.12 `core/ui.ts`: UI contract
```ts
import type { AreaId, ItemId, ScreenId } from './ids';
import type { RunRewards, MetaApi } from './meta';
import type { RunResult, ScoreState, SkaterState } from './sim';
import type { Bus } from './bus';
import type { SaveV1 } from './save';
import type { AppEvent, GameEvent } from './events';
import type { MonetizationProvider } from './platform';
export interface HudApi {
  show(on: boolean): void;
  /** anchor = the skater's projected CSS position (CameraRig.project), for popups beside/below the skater. */
  update(score: Readonly<ScoreState>, cur: Readonly<SkaterState>, dt: number, anchor: { x: number; y: number }): void;   // ≤ 15 Hz text writes
  hint(id: string | null): void;
}
export interface UiApi {
  readonly hud: HudApi;
  show(screen: ScreenId, params?: { result?: RunResult; rewards?: RunRewards; rotate?: boolean;   // rotate: landscape card on Pause
    settings?: Readonly<SaveV1['settings']> }): void;                                             // Settings: current values (added @G0)
  readonly current: ScreenId;
  toast(text: string, ms?: number): void;
  attach(game: Bus<GameEvent>, app: Bus<AppEvent>, meta: MetaApi): () => void;
  /** UI raises intents; game/app.ts decides what happens. */
  onIntent(f: (i: UiIntent) => void): () => void;
  /** added @G1 (MU): the shared monetization provider (wiring); the UI shows an offer only if eligible and ready. */
  setMonetization?(p: MonetizationProvider): void;
}
export type UiIntent =
  | { k: 'play'; startArea?: AreaId } | { k: 'retry' } | { k: 'pause' } | { k: 'resume' } | { k: 'home' } | { k: 'restart' }
  | { k: 'open'; screen: ScreenId } | { k: 'settings'; key: string; value: unknown } | { k: 'rewarded'; placement: string }
  | { k: 'preview'; id: ItemId | null }                 // shop / locker try-on on the turntable
  | { k: 'turntable'; dYaw: number }                    // Locker drag-to-rotate
  | { k: 'backup' } | { k: 'restore'; json: string };   // Settings: export() / import()
```

### 4.13 Factories (each module's `index.ts`, frozen signatures)
```ts
export function createWorldGen(cfg: WorldGenConfig): WorldGen;                                   // world/gen
export function createWorldQuery(gen: WorldGen): WorldQuery;                                      // world/gen
export function createSim(tables: TrickTables, deps?: SimDeps): Sim;                              // sim (tables from tricks)
export const TRICKS: TrickTables;                                                                 // tricks
export function createInput(el: HTMLElement, opts: { screenW: () => number; safeBottom: () => number; screenH?: () => number }): InputSource; // input (screenH added @G1: the cached viewport height, no layout read on touch-down)
export function createRecognizer(cfg?: Partial<RecognizerConfig>): GestureRecognizer;            // input (pure; thumb bot)
export function createGfx(canvas: HTMLCanvasElement, q: QualityTier): GfxContext;                 // gfx
export function createWorldView(ctx: GfxContext): WorldView;                                      // world/render
export function createCameraRig(): CameraRig;                                                     // world/render
export function createVfx(ctx: GfxContext): Vfx;                                                  // vfx
export function createSkaterView(ctx: GfxContext): SkaterView;                                    // skater
export const CATALOG: readonly CosmeticItem[];                                                    // content
export function createSaveStore(): SaveStore;                                                     // save
export function createMeta(save: SaveStore, catalog: readonly CosmeticItem[]): MetaApi;           // meta
export function createAnalytics(save: SaveStore): Analytics;                                      // meta
export function createAudio(): AudioEngine;                                                       // audio
export function createUi(root: HTMLElement): UiApi;                                               // ui
export function createMonetization(flags: { fakeAds: boolean }): MonetizationProvider;            // platform
export function createHaptics(): Haptics;                                                          // platform
export function installDebugApi(deps: object): void;                                              // debug
export function renderOffline(area: AreaId, sec: number): Promise<AudioBuffer | null>;          // audio (added @m0-core: shots --audio)
```

### 4.14 `core/decor.ts`: decor vocabulary (added in M0, SCHEDULE.md)
- `export const DECOR_KINDS` is the single vocabulary of `Decor.kind` values: each entry has a `zone` (`ground`, `side`, `backdrop`, `overhead`, `ambient`), the areas/gateways that may use it, a default `castShadow`, a doc string and a doc string per `Decor.params` key. `DecorKind = keyof typeof DECOR_KINDS`, `isDecorKind(k)`.
- `DECOR_LIMITS` holds the placement rules (side band |x| ≥ 4.6, signs |x| ≥ 4.9, backdrop |x| ≥ 5, overhead y ≥ 3.2 m and ≤ 0.3 m thick, maglev at 7 m). `DECOR_BRANDS` (DESIGN §18.6) and `NEON_SIGN_WORDS` (the reviewed Japanese list) are what `brand` / `word` params index into.
- WG emits only these kinds (`world/gen/decor.ts` uses it, never redefines it); WA renders every kind in every listed area skin. `Decor.kind` stays `string` in `core/world.ts` for compatibility.
- A gateway id in `areas` means "inside that gateway's 4 s segment". The generic street kinds (decals, lamps, sign posts, wires, verge, shadow casters, end walls) list every area **and** every gateway.
- **`Decor.y` (one definition since G1).** `y` is the base height of the surface the element stands on or hangs from (ground, sidewalk, the foot of the facade or post) for every ground, side and backdrop kind. Kinds hung above that surface take their own mounting height from a documented `mount` param (lowest point = `y + mount`): `awning` (underside, default 2.4 m), `blade_sign` (sign bottom, 2.6 m), `banner` (banner bottom, 3.0 m). Only `overhead` kinds give their lowest point in `y`. WG emits `y` = sidewalk with `mount` 2.6 / 2.8 / 2.4 / 3.0; WA draws at `y + mount`.

---

## 5. World generation (`world/gen/`, WG)

### 5.1 Pipeline
```
areas.ts (pure timeline: t → area, gateway, blend) ─┐
lesson.ts (fixed Lesson Line 0–40 s / Roll-out 0–9 s)┤
gen.config.ts (phases, weights)                      ├─▶ generator.ts: next segment
templates/*.ts (parametric scripts)                  │     1. pick template (phase weights, area, constraints)
props/*.ts (physical builders per kind)              │     2. instantiate with the layout RNG → Obstacles (track space, 1 cm rounding)
                                                     │     3. validator → accept | re-roll ×6 | drop hardest | constructive fallback
                                                     │     4. coins.ts (coins RNG) + decor (decor RNG) + SafeKeys
                                                     └─▶ commit: write into 32 m chunk buckets; advance GenCursor
```

**Internal cursor type** (WG-owned, not frozen):
```ts
interface GenCursor {
  seed: number; segIndex: number; t: number; s: number;
  area: AreaId; datumY: number; startArea: AreaId;
  exitOpen: [number, number][];          // lateral intervals open at the last segment's exit
  historyPlanes: Uint8Array;             // full validator plane set (ground + every air plane, with take-off heights)
                                         // at the start of the history window; the next forward pass starts here
  exitSet: Uint8Array;                   // committed exit set E = F_end ∩ B_end ∩ {|x − safeExitX| ≤ 2.0}
  safeExitX: number;
  lastActionT: number; lastActionX: number; lastActionDir: -1 | 0 | 1;   // spacing rule (b) across boundaries
  historySec: number;                    // max(1.0, R_MIN(t), T_SHIFT of the last required lateral move)
  lastTallT: Float64Array;               // per 0.25 m cell: last non-T0 time a tall blocker covered it (A1)
  aClock: number;                        // non-T0 seconds since 9 s (or startT); A1–A3 clocks pause in T0
  lastWanderT: number; lastSafeX: number; lastFullWidthT: number; lastBreatherT: number;
  lastTier: number;
  ids: { ob: number; coin: number; edge: number };
}
```

**Area timeline.** `areas.ts` is a pure function of `(t, startArea)` (DESIGN §12.1): the first visit is 40 s (it contains the Roll-out or the Lesson Line), every later visit is 35 s, and each gateway is 4 s. One loop is 156 s; Neon arrives at 122 s. It is used by the generator, palette, audio and analytics, so they always agree.

**Mode `lesson`.** The fixed segment list in `lesson.ts` covers 0–40 s (DESIGN §12.3). The Greenway gateway follows.
**Mode `normal`.** The Roll-out (the first 9 s of the lesson list) plays, then procedural generation from 9 s. The Roll-out's chunks are identical every run and are cached by the renderer.
**`startT`.** No Roll-out; generation starts at `s0 = sAt(startT)` with the phase at `startT`, and the A1–A3 clocks start at `startT`.

**Prop builders.** `props/<area>.ts` turns `(kind, params, variant)` into `{solids, slabs, pits, edges, len, wid, hgt}` using DESIGN §10.3 dimensions. The renderer's kits (WA) consume the same `Obstacle` and build meshes from `kind + variant + len/wid/hgt + params`, so physical truth lives only in WG. Builders exist for every `PropKind` used by v1 templates, fillers and the Lesson Line; stretch kinds may stay stubs until M5.
- Every raised slab more than `STEP_UP` above its neighbours also emits a `landable` `Solid` for its body.
- Edges ≤ `STEP_UP` above local ground get `pickOnly: true`.
- Pits get `lipY` = the surrounding surface height.

**Street base.**
- Each segment emits the area's base `GroundSlab`s: road at 0, sidewalks at +0.15 behind curbs, lawns at 0.
- Curbs are steps of ≤ STEP_UP. Curb grind edges sit on the sidewalk's outer top edge, one finite edge per segment.

### 5.2 Validator (DESIGN §10.6), implementation
- **Data layout.**
  - Per slice (1/30 s), a `Uint8Array(36)` per state plane: L0 ground, plus air planes indexed by (take-off kind ∈ {pop, rollOff}, k = 1…AIR_MAX ≤ 30). Each air byte has a companion `Uint8` take-off height (cm above datum, quantized), merged by minimum.
  - A survival plane (`Uint8` slices-to-death per cell) for rule (h).
  - A 6 s segment with up to 1.6 s of history is about 230 slices × ~63 planes × 36 bytes, about 0.5 MB from a reused scratch pool. Nothing is allocated per segment.
  - **L1 is not modelled.** Decks and platform tops are checked only by rule (d).
- **Rasterization.** Per slice, rasterize the solids, slabs and pits of the segment plus the history window into cell heights, after **dilating** every inset solid by `VALIDATOR.dilateX` (+ `safeMargin`) laterally and `dilateS` along s. `crash` tops prune any board bottom below the top; `landable` tops prune below top − STEP_UP; pits prune at lip level. These are exactly the sim's rules (§6.4).
- **Lateral reach.** Reach per slice in cells is `r = 0.70·V_LAT_MAX·Δt/0.25` on the ground (≈ 0.51 cells) and 0.35× in the air. The dilation amount alternates `floor((i+1)r) − floor(ir)`.
- **Passes.** Forward reachability (from `historyPlanes`), backward viability, backward max-survival, then a **forward DP** for the minimum-action path over (slice, plane, cell, lastDir): no heap, typically < 1.5 ms. The path gives rules (b) and (c) and the SafeKeys.
- **Greedy check (rule i).** One deterministic myopic trajectory on the grid from `safeExitX`: every 0.1 s pick the nearest cell whose next 1.5 s (as seen 0.35 s ago) is clear at 75% reach. Reject if it leaves `B`. Cost: one trajectory, < 0.2 ms.
- **Rules (d)–(g)** are static geometric checks over the instantiated obstacles, including each edge's grind sweep.
- **Fallback.** S_OPEN plus fillers for every overdue rule, validated like any segment.
- **Budget.** ≤ 3 ms per segment including re-rolls on a mid phone.
  - The game calls `WorldGen.ensure(sAhead, 1)` (one segment) from the loop only while `performance.now()` shows ≥ 3 ms left in the frame and **never in a frame that builds a chunk**. It keeps `GEN_AHEAD_SEC` (12 s) of buffer, which covers the renderer's 3-chunk window at top speed, so a worst-case re-roll spike never lands on a frame that needs it.
  - `world/gen` never reads a clock (lint). Tests call `ensure` without a segment limit.

### 5.3 WorldQuery
- **Chunk lists.** Each chunk holds `obstacles`, sorted by `s0`. Lookups map `s` to the chunk index, scan neighbouring chunks, and de-duplicate by id with a tick-stamped `Uint32Array` mark table, so nothing is allocated.
- **`groundAt(s, x, yMax)`.** The highest slab top ≤ `yMax` covering `(s, x)`. Stairs and inclines interpolate `y0 → y1`. Pits are reported only when no slab covers the point, with `y = lipY` (pit level = lip level).
- **`moverOffset`.** `dxTotal · clamp((playerS − sStart)/(sEnd − sStart), 0, 1)`. The sim adds it to the mover's solids.
- **SafeKeys** (fixed @G0, from M0-sim). The vertices of the safe line in run time `t`, sorted by `t`, with `x` linear between consecutive keys. An `action: 'ollie'` key is the take-off: tap on the tick whose time is nearest `key.t`. There is a key at every vertex and at least every 0.5 s; segment boundaries repeat the boundary key with the same `x`.
- **`groundAt` fallbacks** (fixed @G0). If no slab covers the point it returns the pit at lip level, or else the implicit street datum (`y = 0`, `'asphalt'`). M0 emits sidewalk slabs (+0.15) but no road slab.
- **`FastQuery`** (fixed @G0). world/gen also registers an allocation-free `fastQueryOf(world)` (`obstaclesInto`, `coinsInto`, `groundInto`, `areaGatewayInto`) that the sim uses each tick; other worlds (test fixtures) fall back to the contract. Keep it when rewriting `query.ts`.

### 5.4 Determinism
- RNG streams are per segment and per purpose (`core/rng.ts`). Changing decor never changes layout.
- All positions and sizes are rounded to 1 cm.
- Generation is strictly in order. `chunk(i)` generates forward until chunk `i` is covered.
- Test: `hash(chunks 0..N)` is stable for fixed seeds. Golden hashes for 3 seeds are committed and updated deliberately.

---

## 6. Simulation and collision (`sim/`, `tricks/`, GP)

### 6.1 Loop (`game/loop.ts`, INT)
- **Fixed step.** `DT = 1/60`. The frame delta is clamped to 0.1 s and multiplied by `timeScale`. At most 4 sim steps run per frame; excess time is dropped, so the game briefly slows instead of spiralling.
- **Rendering** interpolates between `prev` and `cur` with `alpha = acc/DT`. A 30 fps device runs 2 steps per frame and behaves the same.
- **Frame cap.** rAF callbacks less than 14 ms after the last rendered frame are skipped, so 90/120 Hz displays render at 60 fps (the sim is 60 Hz anyway). Battery saver caps at 30 fps (skip < 30 ms). Title, Locker and Shop render at 30 fps; screens that fully cover the world render only when something changes.
- **Per-frame work order.** Input binning and sim steps first, then render. At most one of {chunk build, segment generation} runs per frame.
- **Input binning.** Tick `k` has a due time in `performance.now()` space. Before stepping tick `k`, the loop calls `input.frame(dueMs_k)`, which pops every gesture with `tMs ≤ dueMs_k`. `event.timeStamp` uses the same clock.
- **Time scale.**
  - `timeScale` 0.5 is the Lesson assist. It slows the *loop*, so the sim still runs exact ticks.
  - The 0.35× crash slow-mo is **render-only**: the sim has ended, and the tumble is animated by the views.
- **Events.** Events returned by `step` are copied into the frame's event list, emitted on the game bus after each tick, and passed in `RenderFrame.events`.

### 6.2 Speed schedule (closed form, `core/tuning.ts`)
```
v(t) = 7 + 3.5·S(u),  u = clamp((t−20)/130, 0, 1),  S(u) = 3u² − 2u³
s(t) = 7t                                    for t ≤ 20
     = 7t + 455·(u³ − u⁴/2)                  for 20 < t ≤ 150
     = 7t + 227.5 + 3.5·(t − 150)            for t > 150
tAt(s): piecewise inverse; Newton (≤ 6 iterations) on the middle piece.
```
- The sim sets `p.s = sAt(t)` and `vel.s = speedAt(t)` every tick, so there is no integration drift.
- The generator, validator and movers use the same functions.

### 6.3 Step order (`sim/step.ts`)
1. **Advance time.** `tick++`, `t = startT + tick·DT`, `vs = speedAt(t)`, `s = sAt(t)`.
2. **Steering target.** `targetX += steerDx·STEER_GAIN[mode] + steerAxis·V_LAT_MAX·DT`, clamped to ±`TARGET_X_MAX`. Gain is 1.0 in roll, manual and air. On re-anchor events, `targetX = x`. **Direct touch steering (@steer, DESIGN §4.2, row 67):**
   - `steerDx` never puts `targetX` more than `STEER_LEAD_MAX` (0.8 m) ahead of `x` in its direction, and never pulls back a target that was already further (the magnet or ground align moved it). `steerAxis` is never capped.
   - **Touch steering state** (`SimState.steer`, part of snapshots; `sim/kinematics.ts` touchSteer): each tick a `steerDx` below `jitterM` counts as 0; the last 4 counted values and the empty-tick runs before the last 4 ticks with motion are kept (a run of `winMax` empty ticks is a pause and clears the runs). A tick whose `steerDx` the cap held back **arms** it in that direction (the thumb outran the skater): step 4 then runs the fast thumb. A key (`steerAxis ≠ 0`) disarms it and stops any brake.
   - **Release brake**: when the counted `steerDx` over the stop window (2 ticks, or 1 + the longest of those empty runs, at most `winMax` = 4, so a phone that delivers a sample only every 2–3 ticks is not read as stopping) nets < `stopM` in the armed direction, it disarms and fires once: unless the air magnet holds an edge or the skater is not moving that way, `aB = max(ground 66 | air 40, vx²/(2·reach))`, `targetX` drops to `x + max(vx²/(2·aB), min(lead, restLead)) + assist` (assist: what the magnet and ground align moved `targetX` in the armed direction since it armed, step 4's `noteAssist`, so the brake never takes back an assist) and step 4 decelerates at aB (never accelerating or reversing at it) until `|vx| < 0.05`, a key steers, or a drag re-arms it. Grinds and crashes clear the state.
   - The return value (applied steering, for the magnet cancel and `steerNet`) excludes the brake's drop. A consumed air swipe gives back at most the lead its direction still has (step 3), since the cap may have dropped part of its `swipeDx`.
   - Bots set `targetX` ≤ 0.66 m ahead (measured over the gate runs: safe 0.48, thumb 0.54 on the ground and 0.66 dragging through a hop), so they never reach the cap and never arm the fast thumb or the brake: their paths are bit-identical to before @steer (checked per tick: 6 bots × 2 start times × 4 seeds × 1 min, thumb seed 17 and safe seed 17 × 4 min at the plateau), and the conformance gate and the validator's model are unchanged.
3. **Interpret** (`tricks/interpret.ts`, pure): `(state, frame) → Intent[]`, one of `ollie | spinOllie(dir) | spinUpgrade | flip(dir) | pick(dir) | switch(dir) | popOut | spinOut(dir) | manualStart | noseManual | manualEnd | grabStart | grabEnd | bufferOllie | amend(dir)`. It follows DESIGN §4.3 and the ordered conflict rules of §4.4: pick window first, then the steering-stroke rule (`swipeSteer` with `swipeFast` / `swipeFromRest`), swipe cancel (`targetX −= swipeDx` only when a swipe is consumed), pop bleed, the late-flip cutoff, upgrade refusal (an upgrade that couldn't reach p = 0.55 in `airLeft` is ignored) and double-swipe picks. A ground HOLD starts a manual only if `combo.window > 0` or the board is on a pad or ledge top. The pre-press manual needs `pressRiseTick` between 0.30 and 0.10 s before touchdown.
4. **Lateral motion.** First the magnet and ground align move `targetX` (§6.6). Then `desiredVx = clamp(STEER_P·(targetX − x), ±V_LAT_MAX)`, `vx = approach(vx, desiredVx, A·DT)`, plus the soft-wall spring. **Fast thumb** (armed, not braking, no magnet edge held): the limit is `STEER_FAST.vMax` (7 m/s) and the gain `STEER_P·vMax/V_LAT_MAX`, so a 0.55 m lead still commands full speed and the cap leaves 0.25 m of headroom; speeding up in the armed direction on the ground uses `STEER_FAST.accel` (80 m/s²; the air keeps `A_LAT_AIR`). While the release brake runs, slowing down uses its deceleration. Nothing else adds lateral acceleration, so the player's steering and the magnet never fight.
5. **Vertical motion by mode:**
   - **roll / manual.** Follow `groundAt(s, x, y + STEP_UP)`.
     - Step-ups ≤ 0.18 are taken instantly as a bump.
     - **Stair and incline slabs are sticky:** the skater follows their slope and never rolls off them; stairs emit `stairStep`.
     - Otherwise, if the ground falls away by > 0.05, go airborne (`rollOff`), with coyote 0.08 s (not over a pit).
   - **air.** `vy −= G·DT`, `y += vy·DT`. Advance the flip, spin and grab timers.
   - **grind.** Constrain to the edge: `u += vs·DT / (b.s − a.s)`, and take `x, y` from the edge. At `u ≥ 1`, end the grind with an auto-hop.
6. **Collision** (§6.4) against solids in `[s − 2, s + 3]`, with mover offsets applied: crash, skim, bump, knock or near-miss.
7. **Touchdown / capture resolution** (§6.5, §6.6).
8. **Pickups and markers.** Coins, hazard warnings (`warnAtS`), area and gateway entry (a gateway entry banks the combo), landmarks, best line, speed tier.
9. **Scoring** (`tricks/combo.ts`, `tricks/scoring.ts`, pure): link window, heat, bank or lose, decay, bonuses, distance points, per-trick rounding. Emits `trickScored`, `bonus`, `comboBanked`.
10. **Bookkeeping.** `prev ← cur` (pre-step copy), and compute `pose()` lazily.

**Allocation.** None per tick. Scratch vectors are module-level. The returned events array is reused and is valid until the next `step`; the loop copies it.

**Frozen in M0.** Collision classification, skim, pits, the magnet-through-`targetX` model and capture conditions are implemented in M0 and are part of the contract the validator relies on. W1a may extend tricks and scoring but must not change these behaviours without an integrator-approved `core-requests.md` entry, and must keep `bots.quick` green.

### 6.4 Collision
- **Skater box.** `HITBOX` 0.40 × 0.70 × 1.50, centred on `(s − 0.35 … s + 0.35, x ± 0.20, y … y + 1.5)`.
- **Crash faces** are solids inset by `FACE_INSET` (0.08) on every face.
- **Swept test.** Test the box swept from `prev` to `cur` (Minkowski-expanded AABB versus segment). One tick at top speed is 0.175 m, and rails are 0.05 m wide but 0.45 m after expansion, so nothing tunnels.
- **Classification at the first contact time** (identical in the validator, §5.2):
  - **From above:** `prev` board bottom ≥ top → landing on top (§6.5): `landable` → a surface; `crash` → `badLanding`; `knock` → knock.
  - **Lateral entry** (normal within 45° of lateral) → **side bump**: push out at `SIDE_BUMP_V`, wobble 0.3 s, re-anchor `targetX`, emit `bump`.
  - **Frontal entry** (`prev.s1 ≤ solid.s0`):
    - `knock` top → knock.
    - `crash` top → **`slam`** whenever the board bottom is below the top. Crash tops never skim, which keeps tall solids un-jumpable.
    - `landable` top with `top − boardBottom ≤ STEP_UP` → **skim**: `y := top` (airborne skaters keep `vy ≥ 0`), emit `bump`. Never a crash, in any mode.
    - `landable` top with `top − boardBottom > STEP_UP` → `slam`.
- **Near miss.** Track every crash-face solid whose s-range the skater passed. Award once if the min lateral gap was ≤ 0.35 m, or the vertical clearance at crossing was ≤ 0.20 m, with no contact. Inside a combo it is +75 and refreshes the link window only; outside a combo it is +25, banked directly.
- **Pits.** The pit's level is its `lipY`. If the board centre is over a pit and the board bottom is ≤ `lipY + PIT_FALL_EPS`, crash with the pit's `cause`. Landing with the centre past the far edge is safe. Coyote time never applies over a pit.
- **God mode.** Crashes are emitted as `crash` events with `god: true` and ignored.
- **Details fixed in M0 code and tests** (@G0; the validator mirrors them to the centimetre):
  - The inset is `min(FACE_INSET, extent / 4)` per axis (`insetOf`, one definition in world/gen/validator/path.ts), so a 0.05 m rail keeps a body.
  - Overlap uses the inset box. Skim compares the **true** top (`box.y1`) with the board bottom (`≤ STEP_UP`): a 0.19 m landable body slams, a 0.18 m one skims.
  - The first-contact axis is the one that started overlapping last (slab method, prev → cur). Knock tops are knocked from every side.
  - After rolling off a top **sideways**, its body pushes the board out to the side and re-anchors `targetX`; it never re-lands on that top.
  - Gravity is integrated exactly (`y += vy·DT − ½G·DT²`), so a flat ollie lasts 36 ticks (0.600 s), pop tick included.
  - A roll-off drop (a curb, a ledge end) keeps the link window running and does not refresh it on landing, unless that air scored a trick or the combo has no running window (G1, GP review M4).
- **Edge nudge** (changed @G1, GP request 9; DESIGN §7). An **air** landing on a raised landable top moves the board centre ≥ `LAND.edgeNudge` (0.15 m; `min(0.15, width / 2)` from each side edge) inside the top's side edge, and `targetX` with it (M0: 0.02 m). Rolling onto a top keeps the M0 0.02 m. The surface and the landed / crash classification are unchanged; only x moves (≤ 0.13 m toward the top's centre). The validator's grid does not replay landing x, so nothing mirrors it there; the conformance bot (GP sim, WG validator) stays at 0 crashes.

### 6.5 Air, flips, spins and landing
- **`airLeft` prediction** (`predict.ts`). Each air tick, integrate forward with DT (≤ 90 steps) against `groundAt` and candidate capture bands. This gives the predicted time to touchdown or capture, used for:
  - the late-flip cutoff and upgrade refusal
  - the jump buffer
  - grab eligibility (≥ 0.25 s)
  - the pick window
  - the HUD's predicted-landing tint
- **Flips.**
  - Progress `p = t/dur` is linear in time and is what landing is judged on.
  - The board rotation shown is `angle0 + easeOutCubic((t − t0)/(dur − t0))·(rot − angle0)`: an upgrade sets `angle0` to the current angle and `t0` to now, so the board never visibly jumps.
  - **Upgrades:** a same-direction swipe while `p < 0.6` and the def's `upgradeOf` chain matches adds the duration difference, unless refused.
  - **Double-up:** a separate flip after the first one completes.
- **Spins.** Started by `spinOllie` (ground ↗ / ↖) or `spinOut` (grind ↗ / ↖). A repeat of the same diagonal while the spin is < 60% done upgrades 180 → 360. Progress is judged like a flip; the landing takes the worse band. A 180 sets `fakie`; a ground touchdown clears it and emits `revert` (+50, and +1 link if `spin.linked`).
- **Keyboard amend.** `swipeAmend` with a diagonal converts the trick started by the previous arrow ≤ 80 ms ago, if it is < 25% done (ollie → spin ollie, kickflip → varial kickflip).
- **Touchdown** (DESIGN §7):
  - `p == 1` → clean; it is perfect if every rotation finished in the air and the last finished within the last 0.12 s.
  - `p ≥ 0.80` → snap, clean.
  - `p ≥ 0.55` (0.40 for first runs) → sketchy: combo banks.
  - Otherwise `badLanding`.
  - The board centre within 0.15 m of a top edge is nudged to the supported side.
- **Pre-press manual.** A press that went down **in that air** (or on the grind the air left) between 0.30 and 0.10 s before touchdown and is still a press (it did not become a DRAG), or a held grab, starts a manual on touchdown. A press already down when the board rolled off a curb is an ollie on its way, not a pre-press (G1: the thumb-bot gate). Outside a combo it starts one (DESIGN §24 row 61).

### 6.6 Magnet, capture and grind
- **Candidates.** In air, take edges from `edgesNear(s, s + 1.5·vs, x, MAGNET.range)` whose height band is reachable along the predicted arc and that are **not `pickOnly`**. Pick the one with the minimum lateral offset at its predicted crossing.
- **Magnet.** Each tick, move `targetX` toward the edge axis by `rate·DT`, with `rate = MAGNET.rateMax · clamp((range − |dx|)/(range − inner), 0, 1)` (3 m/s at the inner radius). After popping off an edge with another edge reachable, it uses `transferRange` / `transferRate`. **Cancel:** net steering away from the edge of ≥ `cancelDragM` this jump, counting only steering that was not removed by consumed swipes.
- **Ground align.** If rolling on a collision course with a non-`pickOnly` grindable 0.2–1.0 s ahead, move `targetX` toward its centreline at ≤ 1.5 m/s. It never creates a collision course.
- **Pick window.** It opens when the predicted capture is ≤ 0.25 s away (emit `pickWindow open`) and lasts until 0.12 s after lock. While it is open, `interpret` turns **every** swipe into a pick (↑ included) and discards a buffered TAP at capture. Doubles need 2 same-direction swipes inside the window. For `pickOnly` edges the window opens only within `CAPTURE.latPickOnly` (0.6 m), and capture requires a pick.
- **Capture order and start** (fixed @G0). In an air tick capture is tested **before** collisions, so a board coming down onto a ledge or rail locks before it touches the crash top. Capture starts when the board's front half reaches the edge start (centre `s ≥ a.s − HITBOX.l/2`), in the sim, the prediction and the validator. Ground align aims at the grindable's centreline (the mean of its non-`pickOnly` edge axes). The pick window survives up to `PICK_MISS_TICKS` air ticks without a predicted capture.
- **Capture.** When `|dx| ≤ 0.9` (0.6 and a pick for `pickOnly`), board bottom ∈ [top − 0.30, top + 0.45] and `vy ≤ 1.5`:
  - Enter `grind`.
  - The lateral/vertical snap eases over 0.08 s.
  - Flip and spin progress are judged as a landing.
  - `perfect` if the pick time is within ±0.08 s of lock.
- **Switch.** A swipe of ↓ ← → ↙ ↘ (or a double) ≥ 0.25 s after lock changes the grind id, at most 2 per edge. A pick in the 0.12 s after lock re-names the grind just locked: `grindSwitch` with `late: true` (no link, no switch counted, no switch cue).
- **No re-capture of the edge a pop-out left** (changed @G1, GP request 2, `RULES.popOutSkipsOwnEdge` = true). After a pop-out (TAP / ↑ / 180 Out) the air magnet skips the edge the board left, and capture (with its prediction) skips every edge of that obstacle when its top is landable (ledges, benches), unless the player steered toward it by ≥ `MAGNET.cancelDragM` this jump. Rails and beams keep re-capture (their tops are crash tops). The end hop is unchanged. The bot gates (conformance, thumb, trick) pass with it on.
- **Exit.**
  - At the edge end: an auto-hop with `vy = 2.5` (`airborne: grindEnd`).
  - TAP or ↑: a full pop `vy = V_POP` from the edge height, scored as a Pop-out.
  - ↗ / ↖: the same pop plus a FS / BS 180 (`spinOut`), scored as a 180 Out.

### 6.7 Determinism
- **Inputs.** The sim reads only `RunConfig`, `InputFrame` and WorldGen output. Lint bans clocks, `Math.random` and DOM globals.
- **Hashing.** `hash()` folds `tick`, the quantized `p`/`vel` (1e-6) and the mode/score fields.
- **Tests:**
  - Replay a recorded `InputFrame[]` (from a bot run) twice and compare the per-tick hashes.
  - Compare `snapshot → step(n) → hash` with `restore → step(n) → hash`.
- **Snapshots and rewind.** Snapshots are `structuredClone` of the internal state; WorldGen memo is not included because it is deterministic. The Lesson rewind (`RunConfig.rewinds`, GP in W1a) keeps a ring of 8 snapshots taken every 15 ticks and restores the newest one that is ≥ 1.5 s old, emitting `rewind`.

### 6.8 Long distances and performance
- **Float64 everywhere.** A 1-hour run is about 37 km, far below precision limits.
- **Rendering rebasing** (§8.2) keeps GPU coordinates small.
- **Performance targets** (vitest bench, CI CPU):
  - `step()` ≤ 0.05 ms mean
  - segment generation and validation ≤ 3 ms p95

---

## 7. Input (`input/`, GP)

### 7.1 Pipeline
```
pointer.ts (DOM: pointerdown/move/up/cancel on #play, setPointerCapture, getCoalescedEvents if present)
   └─▶ recognizer.ts (pure state machine per pointer) ──Gesture[]──▶ frames.ts
keyboard.ts (keydown/up, preset A/B, immediate cardinals + 80 ms diagonal amend) ──▶ frames.ts
gamepad.ts  (optional, polled per tick) ──────────────────────────────▶ frames.ts
frames.ts: queue of timestamped gestures → InputFrame per tick:
   steer px → metres via S = 9 / (0.55·screenWidthPx) × sensitivity; swipe dxPx → swipeDx metres;
   swipe labels → swipeFast / swipeFromRest / swipeSteer
```
`createRecognizer` is exported from `input/index.ts`, so the thumb bot (§11.2) runs the real recognizer on synthetic traces.

### 7.2 Recognizer state machine (per pointer)
- **States:** `PENDING` (down, travel < SLOP) → `HOLD` at 200 ms still, or `DRAG` once travel ≥ SLOP (permanent).
  - Release while still and ≤ 350 ms after down → `tap` (also from `HOLD`, which then emits `holdEnd` too).
  - `HOLD` that moves ≥ SLOP → `holdEnd`, then `DRAG` (it may become the steering owner; gain is 1.0).
  - `cancel` → no tap or swipe, `holdEnd` if holding, release steering ownership.
- **Swipe detection.**
  - Keep a ring of the last 80 ms of samples per pointer (coalesced events when available).
  - Fire on displacement ≥ 32·k px within the window, or on lift with ≥ 24·k px in the last 80 ms (**not** if the stroke fired in the last 150 ms).
  - Labels: `fast` = ≥ 60·k px in the window; `fromRest` = the stroke's speed was < 0.15 px/ms for ≥ 60 ms just before the window; `steer` = this pointer is the steering owner and is older than 150 ms.
  - Direction: apply arc compensation (strokes starting in the outer 40% of the width, within 45° of horizontal, rotated 8° toward horizontal), then the 8 sectors (cardinals ±30°, diagonals ±15°). `simpleTricks` snaps diagonals to the nearest cardinal.
  - After firing, apply the recoil mask (±60° of the opposite direction for 150 ms).
  - **Re-fire on the same stroke** needs ≥ 90 ms since the last fire, ≥ 32·k px from the last fire point, and a speed dip below 50% of the previous peak in between.
  - `dxPx` = the window's dx, or all dx since touch-down if the stroke is ≤ 150 ms old.
- **Steering.** Emitted continuously from DRAG touches (including HOLD-then-move), but only by the steering owner: the first touch to become a DRAG.
- **Hold and press.** `holdStart`/`holdEnd` are emitted for non-steering touches. `press` is level-tracked for every non-DRAG touch and drops when a touch becomes a DRAG.
- **Ignored touch-starts.** Ignore starts in the bottom `safeBottom + 12` px. During a run, every UI element except the pause button is `pointer-events:none`, so nothing else can swallow a touch.

### 7.3 Keyboard
- **Preset A:**
  - A/D set `steerAxis`. Space/W → `tap`.
  - Arrows → `swipe` **immediately**. A second arrow ≤ 80 ms later emits the diagonal with `swipeAmend`; the sim upgrades the just-started trick in place if it is < 25% done. A repeated arrow repeats (doubles).
  - **S** (Shift alias) → `press` + `manualKey`. Q → `grab`.
  - Esc → pause intent. Enter/R → retry or restart intent, **only while Pause, Crash or Results is showing**.
- **Preset B:** ←/→ steer. IJKL plus U/O/N/M for directions (no amend needed). Shift → `press` + `manualKey`.
- **Key repeat** (`e.repeat`) is ignored for edges. During a run, game keys call `preventDefault`, and `document.activeElement` is blurred at run start so a stale button can't be "clicked" by Space.

### 7.4 Tests (synthetic traces, `tests/unit/input/`)
- Tap vs hold vs drag boundaries: 199/201 ms for HOLD, **349/351 ms** for TAP release, 9/11 px.
- A HOLD released at 300 ms emits both `holdEnd` and `tap`; a HOLD that moves 12 px becomes a DRAG.
- A swipe during a drag is detected, with correct `fast`, `fromRest` and `steer` labels and `swipeDx` (window, or since touch-down when ≤ 150 ms old).
- **Misfire traces** (Mobile review): one long 90 px / 130 ms flick fires once, not twice; a lift right after a fire adds no third swipe; a corrective air drag at 0.4–0.7 px/ms on the steering stroke is labelled `steer` and not `fast`; a parked-then-flicked thumb is `fromRest`.
- **G0 playtest traces** (`recognizer.test.ts`, `tests/unit/integration/labels.test.ts`, real recognizer → real sim): owner sectors (a fresh or steering thumb's 34° flick is →, 36° is ↗; a parked thumb's first flick and second fingers keep ±15°); a fast fresh dodge rising 32° steers its full sideways motion; one rising 40° pops a FS 180 and keeps its steering; a 0.5 px/ms fresh dodge at 36° does not pop; a fresh 0.41 px/ms sideways stroke in the air steers, a 1.2 px/ms one kickflips; sloppy taps (< 20 px, < 15 px sideways, ≤ 250 ms) are taps.
- Arc compensation: a right-thumb leftward stroke starting at x = 0.8·W rising 28° is ←, not ↖; sector edges at 30° and 15°; `simpleTricks`.
- Recoil suppression, re-fire conditions (doubles), and diagonal sector edges.
- Two-pointer ownership and `pointercancel` handing steering to the next DRAG.
- Keyboard: a cardinal fires on keydown with no delay; a second arrow at 60 ms gives an amend, at 90 ms a separate swipe.
- Binning: a gesture at t lands in the tick whose due time is ≥ t.

## 8. Rendering (`gfx/`, `world/render/`, `vfx/`, `skater/`)

### 8.1 Renderer (`gfx/renderer.ts`)
- `WebGLRenderer({ antialias: min(devicePixelRatio, startTierCap) < 2, powerPreference: 'high-performance', stencil: false })`. MSAA is fixed at context creation from the **capped** ratio of the starting tier (touch devices start at med, 1.5 → MSAA on); later tier changes never recreate the context.
- `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping`, `shadowMap.type = PCFShadowMap` with `shadow.radius` 2 (med) / 3 (high). `PCFSoftShadowMap` ignores `radius` and is not used.
- **Pixel ratio cap:** low 1.0, med 1.5, high 2.0.
- **Sizing:** the canvas fills `100dvh` (fallback `100%`); resize on `visualViewport` resize, debounced to 100 ms. The `Viewport` passed to the camera carries `safeTop`/`safeBottom` read from `env(safe-area-inset-*)` via CSS variables.
- **One `Scene`** for the run world and a separate small `Scene` for the Locker showcase.

### 8.2 Coordinates and rebasing
- **Rebasing.** `originS = floor(playerS / 512)·512`. A chunk group sits at `z = −(chunk.s0 − originS)`, with geometry in chunk-local coordinates (≤ 32 m).
- **Shared offset.** The skater, camera, shadow camera and VFX all use `s − originS`.
- **Seamless UVs.** Ground UVs are chunk-local, and `CHUNK_LEN` (32) is a multiple of every ground texture repeat (4 m).

### 8.3 Camera rig (`world/render/camera.ts`, WA; M0 ships the solver)
- **Solver** (pure, unit-tested; DESIGN §8):
  ```
  yaw ψ = lerp(0°, 30°, clamp((aspect − 0.75)/(1.25 − 0.75), 0, 1)); pitch θ = 35°
  hudTop = (vp.safeTop + CAMERA.hudPx) / vp.hCss          // the real HUD band, never a constant
  required corners: s ∈ {−1.5, L = 2.6·v} × x ∈ {±(4.5 + 0.3)}; screen X = x·cosψ + s·sinψ;
                    Y = s·sinθ·cosψ − x·sinψ·sinθ
  H = max( (Xmax − Xmin)/aspect,  (Ymax + 0.8)/(0.74 − hudTop),  −Ymin/(1 − 0.74) )
  centre X on the corridor; skater ground point at 74% from top; H eased with τ = 2 s, monotonic within a run
  rotate = coarse pointer && min(wCss, hCss) < 500 && aspect > 1      // phone in landscape → rotate card, no 30° layout
  ```
- **Test table.** Asserts look-ahead ≥ 2.5 s **below the HUD band** at 7.0 and 10.5 m/s for 393×852 (safeTop 59, safeBottom 34), 390×844, 390×664, 375×548, 412×780, 360×840, 360×640, 768×1024, 1280×800, 1920×1080 and 2560×1080. The expected values from DESIGN §8 must match within ±0.1 m (H) and ±0.03 s. It also asserts ψ = 0 for every portrait phone row and `rotate` for 844×390 with a coarse pointer.
- **Minimum on-screen sizes.** Grind edges are drawn at least `CAMERA.minEdgePx` (2.5 CSS px) wide and coins at least `minCoinPx` (12 px): the kit widens them in a vertex shader from the current ortho scale.
- **Camera placement.** `OrthographicCamera` 60 m back along the view direction, `near 1`, `far 200`. The vertical target is the ground height under the skater (τ 0.3). Forward follow is rigid. Lateral follow is 15% only when ψ > 0.
- **Effects.** Shake and punch are additive offsets, off when reduced motion is set.
- **Menu camera.** Title (static diorama) and Locker modes use a `PerspectiveCamera` (FOV 35°, 1.4 m high), show the sky dome and render at 30 fps.

### 8.4 Budgets (mid-range phone, e.g. Pixel 6a or iPhone 11, quality `med`)

| Item | Budget |
|---|---|
| Draw calls | ≤ 70 main pass, ≤ 120 including the shadow pass |
| Triangles visible | ≤ 120k. Per chunk ≤ 12k; skater + board + helmet ≤ 3.5k |
| Textures | ≤ 16 MB GPU. Facade/sign atlas 1024² per area, decal atlas 512², ground 512², board graphic 512×128, skater atlas 256² |
| Main thread per frame | sim ≤ 1 ms (all ticks), render submit ≤ 5 ms, chunk build ≤ 4 ms (sliced, 1 chunk per frame max), generation ≤ 3 ms (budgeted) |
| Particles | ≤ 300 instances (150 on low) |
| Glow cards | ≤ 40 per chunk |
| Memory | No allocations in steady-state frames. Chunk buffers are pooled. |
| Bundle | ≤ 350 KB gzip (`scripts/size-check.mjs` in CI) |

**Bundle decision (G1, orchestrator).** At the G1 merge the production build is 410 KB gzip JS + CSS (fonts excluded; 399 KB JS + 11.5 KB CSS), against 268 KB at M0. M4's performance pass trims what is cheap and safe (dead code, duplicated tables, unused three imports, debug-only code). If the honest total is still above 350 KB after that, the budget becomes **420 KB gzip JS + CSS** (fonts excluded): a ~400 KB game loads in about a second on 4G and the PWA caches it. Visible quality cuts are not made to meet 350.

### 8.5 Skater rendering (SK)
- **Body.** One **rigid-skinned** `SkinnedMesh`: every vertex is weighted 1.0 to one bone of the DESIGN §18.5 hierarchy.
  - Geometry is built per loadout from procedural parts and merged.
  - It uses vertex colours plus a 256² atlas for the face, prints and fx masks, with `MeshToonMaterial` (3-step gradient map).
- **Outline twin.** A second `SkinnedMesh` that shares the skeleton. Its geometry is inflated 0.025 m along the normals; it is drawn `BackSide` in ink `#2B2140` with `MeshBasicMaterial`.
- **Board.** A mesh (deck + trucks, plus wheels as a child mesh) attached to the `boardPivot` bone, with its own outline twin.
- **Helmet.** A mesh attached to the head bone's `helmetSocket`, with its own outline twin.
- **Totals.** ≤ 8 draw calls (+4 in the shadow pass) and ≤ 3.5k triangles.
- **Animator** (`animator.ts`):
  - consumes `SkaterPose`;
  - blends pose targets with critically damped springs;
  - runs 2-bone IK for the legs;
  - plays the board rotation from `pose.board`;
  - plays the crash tumble: a view-side rigid-body tumble with a seeded spin; the board flies off with restitution 0.3.
- **Showcase mode.** The Locker turntable drives the same rig with a slow idle and trick-preview loops.
- **Legendary effects.** Trails are ribbon meshes, and particles go through `vfx/`.

### 8.6 World chunk building (WA)
- **Prop library.** At boot, `kits/*.ts` build non-indexed, flat-shaded `BufferGeometry` (position, normal, colour, and an optional `fx` attribute for x-ray, emissive mask and sway) per `kind × variant`. Size-parametric kinds (ledges, rails, walls) are built from unit pieces and scaled or tiled.
- **Per chunk, 5 merged meshes from pooled buffers** (preallocated `Float32Array`s of 40k vertices, with `setDrawRange` and update ranges):
  1. opaque lit (**no `discard`** in its shader, so tile-based GPUs keep early depth rejection)
  2. x-ray parts: the above-1.6 m parts of in-corridor tall solids, with the 4×4 Bayer screen-door discard
  3. emissive (neon, windows, coins excluded)
  4. additive glow cards (`depthWrite: false`)
  5. buildings and off-screen shadow casters
- **Per-vertex `fx` flags** in the shared material: emissive mask, sway, and **`noFog`** (hazards and grind edges skip the haze).
- **Global instanced layers:** decals (`polygonOffset`), coins (`InstancedMesh`, capacity 256; collected coins are hidden by matrix), lantern spheres, and the bank-timer arc.
- **Time slicing.** At most 1 chunk built per frame with a 4 ms budget, never in a frame that generates a segment. A chunk is built ≥ 2 chunks before it becomes visible. The window keeps `CHUNK_WINDOW` = 1 chunk behind and 3 ahead (96 m, inside the 12 s generation lead). The Roll-out's chunks are cached across runs (not yet implemented at G0: WA).
  - **Exception (G0): the first frame of a run** builds the three chunks the camera sees (the one under the skater, the one behind it, the next one ahead) and nothing else, so a retry never shows empty fog behind the start. The one-per-frame scheduler resumes on the next frame. Until the Roll-out cache lands, that frame costs 3 builds (~3–9 ms).
- **No opaque overhead.** Overhead decor is thin (lantern strings ≤ 0.3 m on screen, maglev as two edge beams), so there is no overhead dither pass.
- **Desaturate.** A shared `uDesat` uniform in every world and skater material (crash: 0.4); no CSS filter on the canvas.
- **Crash outline flash.** On a `crash` event, the renderer redraws the obstacle `obstacleId` once more with a coral inverted-hull outline for 0.6 s.
- **Palette.** `PaletteSample` updates the light colours and intensities, fog, emissive scale (blue hour → 1.0), window-lit ratio (a uniform threshold on a per-window random attribute) and the DOM sky-glow CSS variables, every frame during blends and otherwise on area change.

### 8.7 Lighting and shadows (WA)
- **Lights.** `HemisphereLight` (sky/ground from the palette) plus one `DirectionalLight` from behind-left of the camera (azimuth 35° left of straight-behind, elevation from the palette).
- **Shadow camera.** An ortho box `x ±10`, `s ∈ [s_p − 6, s_p + 34]`, snapped to texels. 2048 (high), 1024 (med), off (low).
- **Casters.** The skater, props and buildings. Decals, coins and glow never cast.
- **Contact shadow.** Always drawn: a radial-gradient quad under the board, opacity 0.6 on the ground falling to 0.25 at 2 m. When the local ground luminance is low (Neon, blue hour), it switches to an **additive cyan glow** at opacity 0.5.

### 8.8 VFX (WA)
- **Particles.** One additive `InstancedMesh` of camera-facing quads with a CPU ring buffer: sparks, dust, petals, coin stars, rings.
- **Speed lines** (from 9.0 m/s) are quads in the same system placed **outside the corridor only**, alpha ≤ 0.15, plus parallax streaks on side dressing.
- **DOM effects.** Trick popups and the "BAILED!" sticker are DOM, owned by MU. Desaturation is the `uDesat` uniform (§8.6), not DOM.

### 8.9 Quality tiers and auto-adjust (`world/render/quality.ts`)

| Tier | DPR cap | Shadows | Particles | Glow cards | Grain overlay |
|---|---|---|---|---|---|
| low | 1.0 | off (contact shadow only) | 150 | 20 per chunk | off |
| med | 1.5 | 1024, `PCFShadowMap` radius 2 | 300 | 40 | on |
| high | 2.0 | 2048, radius 3 | 300 | 40 | on |

- **Start tier:** `med` on touch devices, `high` on desktop. MSAA is decided once from the starting tier (§8.1).
- **Auto-adjust measures work, not intervals.** Per frame it records CPU work time (sim + render submit, `performance.now()` around the frame) and missed vsyncs (an interval > 1.5× the median interval).
  - Drop one tier if p95 work > 12 ms for 3 s, or > 10% of frames miss vsync while p95 work > 8 ms.
  - Raise one tier, at most once per run, after 10 s of p95 work < 6 ms and no missed vsyncs.
  - A stable ~33 ms interval with low work (iOS Low Power Mode, Battery saver) is a capped display and never drops a tier.
  - A settings override disables auto.
- **Frame cap:** 60 fps (14 ms skip rule, §6.1), 30 fps with Battery saver and on menu screens.

### 8.10 Context loss
- **`webglcontextlost`:** `preventDefault()`, pause the run, and show "Tap to resume".
- **`webglcontextrestored`:**
  - `WorldView.rebuildGPU()` and `SkaterView.rebuildGPU()` rebuild everything from seed + sim state.
  - Canvas textures are re-drawn from their draw callbacks, which `GfxContext.canvasTexture` keeps.

---

## 9. UI layer (`ui/`, MU)

**DOM structure**
```
#app
├─ canvas#gl
├─ div#sky-glow      (CSS gradient inside the HUD band only; palette CSS vars)
├─ div#lofi          (pre-baked grain tile at alpha 0.05 moved by transform, vignette, Neon scanlines; pointer-events:none)
├─ div#play          (full-screen input surface; touch-action:none; the only touchmove-blocked element)
├─ div#hud           (pointer-events:none, except the pause button: 48 px visible, 56 px hit area)
├─ div#screens       (one <section data-screen> per ScreenId; class toggles; transform/opacity transitions only;
│                     hidden sections get visibility:hidden + inert (if supported) when their transition ends)
└─ div#toasts        (pointer-events:none during runs; the SW update toast shows only on Title and Results)
```

**Building and styling**
- A tiny `h(tag, props, ...children)` helper builds elements.
- Plain CSS files are imported by Vite. Screens are built once and updated with text and class changes.

**HUD rules** (DESIGN §13.8)
- The HUD band is ≤ 56 px + `safe-area-inset-top`; the camera excludes exactly that (`CAMERA.hudPx`).
- Score at 26·k px, abbreviated from 1M ("1.2M"); the ticker shows the last trick only.
- Text is written only when values change, at most 15 Hz.
- Animations use only `transform` and `opacity`. Trick popups come from a pool of 4 elements, **one visible at a time**, ≤ 0.5 s, placed beside or below the projected skater (`HudApi.update(…, anchor)`), and tinted coral when the predicted landing is Sketchy or a bail.
- The crash overlay shows a one-line cause from the `crash` event (cause, kind, flip/spin progress).
- The instant-retry reward toast lives in the HUD band and is gone by 3.0 s.
- **Nothing reads layout during a run.**

**Accessibility**
- Buttons are real `<button>`s, at least 56 px (hit area).
- Focus rings and keyboard navigation work on desktop: Enter/Space activate, Esc goes back. On run start the active element is blurred; hidden screens are `inert`, so Space can never re-click ROLL AGAIN.
- `aria-label`s on icon buttons. Rarity is always shown as text too. `prefers-reduced-motion` is respected (also stops grain jitter, speed lines and petals).

**Fonts**
- Bungee and Nunito are **self-hosted** (`src/fonts/fonts.css`, §1), `font-display: swap`, with fallbacks `"Arial Black", Impact, system-ui` and `ui-rounded, system-ui, sans-serif`. No Google Fonts requests: no third-party IP logging, no opaque-response cache quota, and the single-file build has them inlined.
- The game is fully functional with fallback fonts.

**Integrator-owned UI pieces.** The screen state machine and intents live in `game/app.ts`, which M0 implements for the **whole** DESIGN §17.1 flow against the stub screens. UI raises `UiIntent`s and never starts runs itself.

---

## 10. Platform, persistence, PWA (`platform/`, `save/`)

### 10.1 Mobile quirks (`platform/ios.ts`, `platform/history.ts`, INT)
- **CSS:** `html,body{position:fixed;inset:0;overflow:hidden;overscroll-behavior:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}`.
- **Viewport:** `<meta name=viewport content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">`.
- **Touch handling:**
  - `touch-action:none` on `#play` only. The non-passive `touchmove` `preventDefault` fallback is attached to **`#play` only**, so the Shop, Locker and Trick Book still scroll.
  - `gesturestart` → `preventDefault`. Double-tap zoom is prevented by `touch-action:none`.
  - Touch-starts in the bottom `safeBottom + 12` px are ignored.
- **Back gestures.** On run start, `history.pushState({ run: true }, '')`. A `popstate` during a run (Android back, iOS edge swipe-back) pauses the run and pushes the state again, so a steering drag from the screen edge can never leave the page. On other screens, `popstate` navigates back to the Title.
- **Focus and keys.** On run start, blur `document.activeElement`; game keys `preventDefault`; the cursor is hidden over `#play`.
- **Landscape phones.** When `CameraRig.solve` reports `rotate`, the run pauses and Pause shows the "Rotate to portrait" card.
- **Safe areas:** HUD padding uses `env(safe-area-inset-*)`, exposed as CSS variables that `Viewport` reads.

### 10.2 Lifecycle (`platform/visibility.ts`, `platform/wake.ts`)
- `visibilitychange` (hidden), `pagehide` and `blur` pause the run, suspend audio and `flush()` the save.
- On resume, the Pause screen is shown. Runs never auto-resume.
- **Wake Lock.** `navigator.wakeLock.request('screen')` at run start (feature-detected), released on pause and results, re-requested after `visibilitychange` if a run is resumed.
- **Fullscreen.** In the Android browser (not standalone, not iOS), the first TAP TO ROLL calls `requestFullscreen({ navigationUI: 'hide' })` if available; failures are ignored.

### 10.3 Audio unlock
- `input.onAnyInput` fires on **`pointerup`, `touchend`, `click` and `keydown`** (a touch `pointerdown` is not a user activation). Each call runs `audio.unlock()`: `ctx.resume()` plus a 1-sample buffer, **retried on every gesture until `ctx.state === 'running'`**.
- The Pause screen's Resume button calls `ctx.resume()` directly in its click handler (iOS `interrupted` state after calls or Siri).
- Set `navigator.audioSession.type = 'ambient'` when it exists.

### 10.4 Haptics (`platform/haptics.ts`)
- `pulse()` calls `navigator.vibrate` when it is supported and enabled in settings (`'key'` or `'all'`, DESIGN §9). Every pulse is ≥ 15 ms and at most one fires per 120 ms. It is a no-op on iOS web.
- A native bridge (Capacitor Haptics) replaces the implementation later, with no call-site changes.

### 10.5 Persistence (`save/`, MU; M0 ships a minimal store)
- **Storage adapter.** `get`/`set`/`remove`, each wrapped in `try/catch`. On failure (private mode, quota, sandboxed iframe) it falls back to memory, sets `persistent = false`, and Settings shows "progress won't be saved".
- **Load:** `JSON.parse` → migrate up to `SAVE_VERSION` → deep-merge with defaults → **sanitize**:
  - clamp numbers
  - drop unknown item ids
  - make sure the starters are owned and equipped items are owned
- **Backup.** Write `dusklane.save.bak` before each overwrite. A corrupt main save falls back to the backup, then to defaults.
- **When to write:**
  - Debounced to 500 ms after `mutate`.
  - `flush()` immediately on: run end, a crate roll (before the reveal), a purchase, and visibility hidden.
  - Never per frame.
- **Meta rules** live in `meta/` as pure functions with unit tests: no negative coins, duplicates convert to coins, pity, odds and featured selection.
- **Eviction.** Safari deletes script-writable storage after 7 days of Safari use without a visit. So: after run 1, call `navigator.storage.persist()` once (feature-detected; `onboarding.persistAsked`); Settings offers **Back up / Restore progress** through `SaveStore.export()` / `import()` (copy, share or download a JSON file; paste or pick to restore); installed PWAs are not subject to the 7-day rule, which is one more reason for the calm install hint after run 3.

### 10.6 PWA and service worker (INT, **M4**)
- **Manifest.** `public/manifest.webmanifest`: name "Dusklane", `display: standalone`, `orientation: portrait`, `theme_color #2B2140`, `background_color #FFF4E3`, and icons 192, 512 and 512-maskable.
- **iOS tags.** `<link rel="apple-touch-icon" href="icons/180.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">` and `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`.
- **Service worker generation.** A ~40-line Vite plugin (`swPlugin` in `vite.config.ts`) emits `dist/sw.js` with the build hash as the cache name and the precache list of hashed assets. The worker itself is about 60 lines of hand-written template.
- **Caching:**
  - HTML is network-first with a **2.5 s timeout**, then the cached copy (a weak connection must not break the 1.5 s boot target).
  - Hashed assets, fonts included, are cache-first. There are no cross-origin requests to cache.
- **Updates.** When an updated worker is found, show the "Update ready — tap to refresh" toast, **only on the Title or Results**, never during a run. `skipWaiting` happens only on that tap.
- **Registration** happens only on `https:` or `localhost`, never in an iframe, never in single mode, and never with `?nosw=1`.
- **Icons.** `platform/icon.ts` exports `drawIcon(ctx, size, maskable)`: a procedural skateboard over a sunset disc. `scripts/gen-icons.mjs` renders it in Playwright Chromium and writes the PNGs (committed). In single mode, the favicon is a runtime canvas data URL.

### 10.7 Future native wrapping
- Capacitor wraps `dist/` later.
- `MonetizationProvider`, `Haptics`, `AnalyticsSink` and the storage adapter are the only swap points. No gameplay code changes.

### 10.8 Browser support (`platform/compat.ts`, INT)
- **Minimum:** iOS / Safari 15.4+, Chrome / Edge / Firefox from 2022 on. WebKit cannot be tested on this machine (only Chromium is installed), so every newer API is feature-detected rather than assumed.
- **Boot check:** WebGL2, `structuredClone` and `AudioContext`. If any is missing, show a friendly "This browser is too old for Dusklane" card instead of a broken game.
- **Feature-detected:** `PointerEvent.getCoalescedEvents`, `inert` (15.5), `dvh` (fallback `100%`), `navigator.audioSession`, `navigator.wakeLock`, `navigator.storage.persist`, `requestFullscreen`.
- **M5** includes a real-device check on an iPhone in Safari and installed (ROADMAP).

---

## 11. Testing and debug

### 11.1 Unit tests (vitest, node; `tests/unit/<module>/`)

| Module | Must cover |
|---|---|
| core (INT) | `speedAt` is monotone, equals 7.0 for t ≤ 20 and 10.5 for t ≥ 150. `sAt`/`tAt` round-trip within 1e-6. RNG golden values. Bus ordering. |
| camera (INT → WA) | The solver table (§8.3), including the safe-area and toolbar viewports. Look-ahead ≥ 2.5 s below the HUD band at every viewport and speed. ψ = 0 on every portrait phone. H is monotonic within a run. |
| input (GP) | §7.4 |
| sim (GP) | Flat ollie airtime 0.600 ± 1 tick and apex 0.99 ± 0.01 at 7 and 10.5 m/s. 2 m line change ≤ 0.50 s (a key target, and a drag kept up until the skater is there). Direct touch steering (`tests/unit/integration/steer.test.ts`, recorded thumb traces through the real recognizer): after a quick slide the skater stops within 0.35 m of where the thumb stopped or lifted (0.5 m in the air), with no overshoot; quick slides of 60 / 90 / 120 px dodge ≥ 0.55 / 0.85 / 1.2 m at ≤ STEER_FAST.vMax; a 2 m human-speed drag (≥ 500 ms) ends within 0.15 m of 2 m and settles as it ends; a 0.5 px/ms thumb kept moving completes 2 m in ≤ 0.5 s; one sample every 40–67 ms is a smooth drag (≥ 90% of the 8 ms distance) and stops within 0.6 m; keys and bot-style absolute targets (on the ground and through a hop, leading more than 0.6 m) are never capped, sped up or braked; the brake keeps an assist; a snapshot mid-brake replays exactly. Soft walls. Step-up 0.18 is a bump and 0.19 is a frontal crash. **Skim** onto a landable top; a `crash` top 0.05 m above the board is a slam; a flat ollie never clears a 1.15 m bin. Side contact is a bump. **Pit at lip level** (rolling over it falls). Raised slabs have bodies. Stairs are sticky. Every landing band, Perfect at 0.12 s. Magnet moves `targetX` (≤ 3 m/s) and is cancelled by 15 px of non-consumed drag only. `pickOnly` edges need a pick. Pick window takes every swipe. Perfect Lock, switch directions and limits. Spins, 360 upgrade, revert. Manual start rules and budgets. Coyote and jump buffer. Swipe cancel only for consumed swipes. Rewind. Determinism replay and snapshot/restore. |
| tricks (GP) | Every gesture (with every label combination) in every state maps to exactly one intent (exhaustive table test). Combo formula: the worked example in DESIGN §13.6 = 5,028 with per-trick rounding. Ollies add no link. Heat banks a combo after 2.5 s without a link-adding trick; ollie-hopping every 0.7 s banks within 2.5 s; heat pauses in grinds and manuals. Gateway bank. Revert links only after a linked spin. Decay factors. Variety cap. ×30 cap. Bank on sketchy. Lost on crash. Near miss outside a combo = +25. |
| world/gen (WG) | Golden chunk hashes for 3 seeds. Height bands (forbidden 0.61–1.14). Every v1 template instantiates and validates on 50 seeds. Rejection rate < 5% and fallback < 1%. A1–A3 (clocks paused in T0), A5. Rules (a)–(i), including dilation, required-action extraction, dead ends ≤ 2.0 s and the greedy check. Datum closure per area via S_INCLINE_UP. No edge or deck crosses a segment. Area timeline (Neon at 122 s). Lesson Line layout matches DESIGN §12.3. `startT` semantics. |
| meta / save (MU) | XP curve values (DESIGN §14.2 table, exponent 1.5). Onboarding XP rules and the one-level-per-results cap. Score coins `floor(sqrt(score/400))`. `applyRun` idempotent per `runId`. The level reward table is complete and references only existing items. Odds sum to 1. Pity triggers at exactly 10 and 40. Duplicate preference. The crate result is persisted before the reveal. No negative coins. Featured items are deterministic per date. Migrations, corrupt JSON, a throwing storage, the backup path, export/import round-trip, sanitize. |
| audio (AU) | The scheduler produces the expected step times for 84 BPM swing 58% (OfflineAudioContext is unavailable in node, so the sequencer logic is pure and tested). Feedback and coin notes use the relative major's pentatonic in minor keys. Bindings map every `GameEvent` kind to at most a fixed set of SFX ids. |
| content (SK) | 40 items. Ids are unique and match DESIGN §15. Counts per rarity. Every look validates against its interface. Starters have `source: 'starter'`. `bd_golden_hour` is `level30`. |
| input (GP) | §7.4, including the misfire traces. |

### 11.2 Bots (`debug/bots/`, `tests/bots/`, WG)
- **Harness.** Runs `createSim` + `createWorldGen` headless at full speed. Bots implement `(sim, world) → InputFrame` (or, for the thumb bot, `→ PointerSample[]` fed through `createRecognizer` and `frames.ts`) and use only the public `WorldQuery` restricted to what is visible.
- **Safe bot.**
  - Every 6 ticks it re-plans with the validator planner, over a grid rasterized from obstacles in `[s, s + 2.5·v]` *as they were 0.25 s ago* (a reaction buffer of world snapshots, implemented as an observation delay).
  - It steers by emitting `steerDx` that puts `targetX` on **its plan's x at t + 0.15 s** (so the skater doesn't trail the plan by v / STEER_P), limited to 85% of `V_LAT_MAX`, and an ollie at the planned tick + 0.15 s latency ± 0.05 s jitter (seeded).
  - It must never crash.
- **Myopic bot** (DESIGN §10.11). Every 0.1 s, picks the nearest 0.25 m lane whose next 1.5 s (as seen 0.35 s ago) is open, allowing an ollie for Low obstacles and full-width hazards; 75% lateral speed; ±0.08 s jitter. It may crash; the gate is median survival ≥ 4 min from the plateau over 100 seeds. The generator runs a deterministic grid version as validator rule (i).
- **Thumb bot.** Renders the safe bot's plan as pointer traces: steering drags with human jerk (minimum-jerk profiles plus ±3 px tremor), a resting thumb between moves, taps of 60–260 ms (uniform), flicks with ±25° arcs, air dodges on the steering stroke, and 0.25 s total latency. Traces go through the real recognizer. Pass: 0 crashes and **0 unintended tricks** (any `flipStart`, `spinStart`, `grabStart` or `manualStart` the plan didn't ask for).
- **Conformance bot.** Follows `SafeKey`s exactly (sets `targetX` to the key's x, ollies on the key's tick). Pass: 0 crashes on 50 seeds × 4 min. It proves the validator's geometry and the sim's collision agree, and runs at every gate after W1a merges.
- **Straight bot.** Holds lane x ∈ {−4, −3, …, +4} and taps at every `FullWidth` obstacle using `warnAtS`. It must crash by t ≤ 20 s from a normal start, and within 10 s of `startT = 150`, in 100% of runs.
- **Trick bot.** Greedy: steers to trick lines (`TrickLine` tags), flicks the highest-value flip or spin that fits `airLeft`, and picks grinds. It is used for feasibility (doubles, triples, the 360 spin), score ratio, trick-line safety and the p95 combo duration (≤ 45 s, from `comboBanked.durSec`).
- **Suites** (4 cores, threads):
  - `npm test` includes `bots.quick`: the safe bot on 20 seeds × 4 min at the plateau, the straight bot on 9 lanes × 3 seeds, and the conformance bot on 10 seeds × 2 min. Target ≤ 60 s.
  - `npm run test:bots` (every merge gate): safe bot 100 seeds × 8 min from t = 0 + 100 from the plateau; myopic bot 100 seeds; thumb bot 20 seeds × 4 min; conformance 50 seeds; straight 9 lanes × 20 seeds; trick bot 50 seeds × 5 min. About 7M sim ticks; target ≤ 15 min. It writes `artifacts/bots.json` (crash list with seed and tick, myopic survival distribution, unintended-trick list, rejection stats, score ratios, combo durations).
  - `npm run test:bots -- --release` (M5 only): fresh seeds, safe bot 200 + 200, thumb bot 50, everything else as at gates.

### 11.3 End-to-end (Playwright, `tests/e2e/`)
- **Config.**
  - `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, Chromium launch args `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
  - Projects: `mobile` (390×844, `isMobile`, `hasTouch`, DPR 3) and `desktop` (1280×800).
  - `webServer: npm run preview`.
- **`smoke.spec`:**
  - no console errors;
  - the canvas is not blank (pixel variance above a threshold);
  - Title → tap → run starts;
  - a tap produces an `ollie` event;
  - a crash shows the crash overlay, and a tap within 1 s starts a new run.
- **`bot-survival.spec`:**
  - `__skate.start({seed, startT: 160})`, `manual(true)`, `bot('safe')`, then `step(3600)` × 3 for 5 seeds;
  - expect `alive`;
  - `perf().calls ≤ 120`, `tris ≤ 120k`.
- **`touch.spec`:** real `page.touchscreen` and dispatched pointer sequences for steer, tap (including a 300 ms tap), swipe in the air (→ `flipStart`), ↗ on the ground (→ `spinStart`), hold inside a combo (→ `manualStart`), a resting thumb outside a combo (→ nothing), and swipe into a rail (→ `grindStart` with the right id).
- **`audio.spec`:** a `page.touchscreen.tap` on the Title, then `__skate.audio()` reports `unlocked` and context state `running`.
- **`keyboard.spec`:** preset A mapping end to end, including the immediate cardinal plus amend, S for manual, Enter/R ignored during a run, and Space not re-clicking a focused button.
- **`ui.spec`:** each screen opens via `__skate.ui()`; results → ROLL AGAIN; shop purchase; crate open persists across reload; **HUD no-overlap at 320, 360 and 390 px widths** (bounding boxes of score, combo pill, coins and pause never intersect, and stay inside the 56 px band); hidden screens are not focusable; Back up / Restore round-trips.
- **`single.spec`** (M4): opens `dist-single/index.html` via `file://` and asserts **no network requests at all**.
- **`pwa.spec`** (M4): manifest valid, SW registers on localhost, offline reload works, HTML falls back to cache after the 2.5 s timeout.

**Note.** FPS under SwiftShader is meaningless. Gate on draw calls, triangles and CPU timings (`perf().simMs`, `buildMs`) instead.

### 11.4 Screenshots (`scripts/shots.mjs`)
- **Ships in M0 with every mode** and the debug hooks it needs (`previewArea`, `ui`, `contrast`), so W2a, W2b and W3b never edit it:
  - default: each area at blend 0 and in the gateway blends, each UI screen;
  - `--cosmetics`: the 40-item contact sheet and the Locker with 6 loadouts;
  - `--contrast`: the DESIGN §18.4 pixel gate (hazard ≥ 2.5:1, grind edge ≥ 1.8:1) at every preset and blend; exits non-zero on failure;
  - `--hud`: HUD layouts at 320 / 360 / 390 px;
  - `--audio`: 20 s `OfflineAudioContext` renders per area to `artifacts/audio/*.wav` with a peak check.
- Viewports: 390×844, 390×664 (Safari toolbars) and 1280×800. Output goes to `artifacts/shots/`.
- **Hooks (frozen at m0-core).** Everything goes through `window.__skate`:
  - `previewArea(area, blend?)`, `renderNow()`, `camera()`, `contrast()` (M0-io implements it with `host.cameraRig.project` and pixel reads).
  - `ui(screen, params)` goes through `App.open` (game/app.ts), so App and UI never disagree. `'title'` goes Home, `'run'` starts a run, anything else leaves the run. Params: `result`, `rewards`, `rotate`, and for `locker` / `shop` the turntable: `loadout?: Partial<Loadout>` (merged over the equipped one: the 6 loadouts), `preview?: ItemId` (try one item on: the 40-item contact sheet) and `yaw?: number` (deg, `SkaterView.setTurntable`). Entering Locker / Shop sets `skater.setMode('showcase')` and `cameraRig.setMode('locker')`; leaving restores `run` and the equipped loadout.
  - `renderAudio(area, sec)` → `{ wavBase64, peak, sampleRate, sec } | null` (16-bit stereo WAV). It wraps `renderOffline` from `audio/index.ts` (AU); `--audio` writes `artifacts/audio/<area>.wav` and fails on a null result, a peak ≥ 1.0 or silence.
  - `debug/api.ts` gets a `DebugHost` from `game/wiring.ts` with the live `sim`, `loop`, `input`, `cameraRig`, `skater`, `vfx`, `meta`, `gfx`, `worldView`, `save`, `ui`, `audio`, both buses, `app` and `renderAudio`, so M0-io never edits `game/`.
- Agents must look at these to judge visuals (readability checklist: DESIGN §18.4).

### 11.5 Debug tooling (INT)
- `window.__skate` implements `DebugAPI` (§4.11).
- **Overlays** (toggle with the backquote key):
  - safe-line keys and the reachable-set heatmap
  - obstacle classes coloured by height band
  - the pick-window state
  - camera look-ahead lines at 2.5 s
- **Tuning panel.** Live edits of `score.config` and `gen.config` values, dev only, never persisted.
- **Perf HUD:** fps, p50/p95, calls, tris, sim ms, build ms.

### 11.6 Gates

| Command | Contents | Required |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | Every commit |
| `npm run lint` | `node scripts/lint.mjs` (determinism bans + import boundaries) | Every commit |
| `npm test` | Unit + `bots.quick` + benches (sim ≤ 0.05 ms per tick: `tests/unit/sim/bench.test.ts`; segment ≤ 3 ms p95: `tests/unit/gen/bench.test.ts`; single chunk builds ≤ 4 ms p95 on real plateau content: `tests/unit/render/build.bench.test.ts`, G1; best of repeats, since CPU noise only adds time) | Every commit |
| `npm run test:bots` | Gate bot suite (§11.2); `--release` doubles the seeds | Merge gates; `--release` at M5 |
| `npm run e2e` | Playwright (after build) | Merge gates |
| `npm run shots -- --contrast` | Readability pixel gate | Merge gates from G2 |
| `npm run size` | JS + CSS ≤ 350 KB gzip (fonts excluded, ≤ 150 KB) | Merge gates from M4 |

---

## 12. Build and deploy

| Script | Command |
|---|---|
| `dev` | `vite` |
| `build` | `vite build` → `dist/` (`base: './'`, manifest + generated `sw.js` + icons) |
| `build:single` | (M4) `vite build --mode single` → `dist-single/index.html` (`viteSingleFile()`, `assetsInlineLimit: Infinity`, `cssCodeSplit: false`, fonts inlined; SW and manifest link disabled via `import.meta.env.MODE === 'single'`) |
| `preview` | `vite preview --port 4173` |
| `test` / `test:bots` | `vitest run` (unit + `tests/bots/quick*.test.ts`) / `node scripts/test-bots.mjs` (`vitest.bots.config.ts`: all of `tests/bots/`, threads; `--release` → env `BOTS_RELEASE=1`) |
| `e2e` | `npm run build && playwright test` (from M4: `npm run build && npm run build:single && playwright test`) |
| `icons` / `shots` / `size` | `node scripts/gen-icons.mjs` / `node scripts/shots.mjs` / `node scripts/size-check.mjs` |

**Vite config**
- `define: { __BUILD__: { version, hash: git short sha, mode } }`.
- `build.target ['es2020','safari15']`.
- `build.sourcemap` is `hidden` for `dist`.
- Three is imported by name, so tree-shaking applies.

**GitHub Pages** (`.github/workflows/pages.yml`)
- On push to `main`: `npm ci && npm run typecheck && npm test && npm run build`.
- Then `actions/upload-pages-artifact` (dist) and `actions/deploy-pages`.
- Everything works under a subpath because of `base: './'`.

**Releases.** Every merge gate tags `m<N>`. The single-file build is attached as an artifact for offline sharing.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Parallel agents collide or drift | Frozen `core/`, stub-first M0, folder ownership, `docs/core-requests.md` as the only shared edit, INT-only wiring, and full tests at every merge gate |
| Portrait view too narrow, unreadable or "not iso" | The camera solver is tested against a look-ahead guarantee. ψ = 0 in portrait is a deliberate choice, with a fallback of ψ ≤ 4° (DESIGN §23). The x-ray cap, the height-band contract and the colour hierarchy. Screenshots are reviewed every wave. |
| Unfair at top speed | Seconds-based generation, the validator floors, validator geometry matched to sim collision (conformance bot), dead-end and greedy-player rules, a delayed-reaction safe bot (200 seeds per gate, 400 at release), the myopic bot's median-survival gate, and `crash` analytics events with state and kind |
| Steer vs flick conflicts | A pure recognizer that labels swipes, the steering-stroke rule in the sim, misfire trace tests, cancel only for consumed swipes, re-fire and lift-off rules, a second-finger tap, and the thumb bot through the real recognizer |
| Readability (dark Neon, light sidewalks, toolbars) | Inverted Neon hazards, cream-over-ink grind edges, the `--contrast` pixel gate, `noFog` hazards, a HUD-band-aware camera solver and minimum on-screen edge widths |
| Feel tuning spread across modules | `core/tuning.ts` plus per-package config files, a live tuning panel, and bot tests guarding fairness after every change |
| Mobile GPU fill rate (neon, shadows, DPR 3) | DPR caps, glow-card caps, auto quality tiers, blob-only on low, no post-processing, and no bloom |
| Hitches from generation, chunk building or GC | A 12 s generation buffer generated one segment at a time when ≥ 3 ms remain, never in the same frame as a chunk build, pooled buffers, a cached Roll-out, and no per-tick allocations (benched) |
| Thermal / battery drain on high-refresh phones | A 60 fps render cap, 30 fps menus, Battery saver, and auto-quality based on CPU work and missed vsyncs instead of frame intervals |
| Broken determinism | Lint bans, per-purpose RNG streams, 1 cm rounding, closed-form `sAt`, replay and snapshot hash tests, and golden chunk hashes |
| iOS Safari (audio unlock, zoom/scroll, `100vh`, backgrounding, context loss, back swipe, storage eviction) | `platform/ios.ts`, unlock on `pointerup`/`touchend` with retries, pause on hide and on `popstate`, full GPU rebuild on restore, `dvh` + `visualViewport`, `storage.persist()` and Back up / Restore, feature detection (§10.8), and a real-device check in M5 because WebKit can't run here |
| Scope too big for one night | Movers, 20 templates, the live title, bespoke cosmetic fx and the Start District picker are M5 stretch; the validator skips L1; PWA and single-file moved to M4; bot seeds reduced at gates |
| Procedural art looks cheap | Strict palette, toon skater with outline, long shadows, glow cards, the lo-fi overlay, and screenshot review against DESIGN §18 at every gate |
| Stale cached builds | Versioned SW cache, network-first HTML, update toast, and no SW in single or iframe contexts |
| Bundle bloat in single-file mode | Named three imports, one addon, and the CI size check |
| Missing CJK fonts on some devices | A `measureText` probe with fallback to pictograms (DESIGN §18.6) |
| Font privacy and quota | Self-hosted woff2 fonts; no third-party requests (`single.spec` asserts none) |
| Bot suite too slow for agents | A quick suite in `npm test`, the full suite only at gates, threads, and a 6-tick replan |
