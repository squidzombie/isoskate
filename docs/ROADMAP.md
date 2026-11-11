# DUSKLANE: Roadmap

Built tonight by autonomous agents. `DESIGN.md` says *what*, `TECH.md` says *how*, and this file says *in what order and when it is done*. v1.1: re-scoped after the Player, Feasibility and Mobile reviews (DESIGN §24, rows 36–56).

**Shape of the plan:**
- **M0:** one agent builds the foundation vertical slice.
- **Three waves** of **two parallel agents** each, in separate git worktrees with disjoint folders.
- A **merge gate** after each wave.
- **M4:** integration, PWA and single-file build.
- **M5:** playtest, polish and stretch goals.

```
M0 (INT) ─▶ G0 ─▶ W1a Gameplay ‖ W1b World-gen ─▶ G1 ─▶ W2a World art ‖ W2b Skater ─▶ G2
            ─▶ W3a Meta+UI ‖ W3b Audio ─▶ G3 ─▶ M4 Integration (INT) ─▶ M5 Playtest & polish ─▶ v1.0
```

Rough time-boxes for one night: M0 3 h · each wave 2–2.5 h · each gate 30–45 min · M4 2 h · M5 1.5 h. The machine has 4 cores and only Chromium, so bot suites are sized to finish in ≤ 15 min at gates, and WebKit-only behaviour is feature-detected rather than tested (TECH §10.8).

---

## Rules for every milestone

**Branching and worktrees.** Each wave agent works in its own worktree off the latest `main`:
```
git worktree add ../isoskate-w1a -b w1a-gameplay main
git worktree add ../isoskate-w1b -b w1b-worldgen main
```
Only the integrator merges into `main`, at gates.

**Ownership** (TECH §2)
- Edit only your folders, plus new tests under `tests/unit/<your module>/` and at most one e2e spec named after your package.
- Never edit `src/core/`, `src/game/`, `scripts/`, `index.html`, `package.json`, configs or another package's folders.
- Contract needs go to `docs/core-requests.md` (append-only, with a section per package).
- No new dependencies.

**Stubs stay green.** Replace the internals behind your factory; do not change its signature. `npm run dev` must keep working at every commit.

**Definition of done (all milestones)**
- `npm run typecheck`, `npm run lint` and `npm test` (which includes `bots.quick`) pass.
- No console errors in `smoke.spec`.
- Determinism tests pass.
- Every new tunable is in the right config file (DESIGN §22).
- Commits are small and descriptive.
- At the end, write a short hand-off in the final merge commit message: what is done, what is stubbed, and known issues.

**Visual work.** Run `npm run shots` (and `-- --contrast` from W2a on) and look at `artifacts/shots/` before claiming done. The readability rules are in DESIGN §18.4.

**Performance.** Check `__skate.perf()` against TECH §8.4 in the `bot-survival.spec` run. FPS under SwiftShader is not a metric.

---

## M0: Foundation vertical slice (one agent, INT)

**Goal:** a playable grey-box Downtown in which you can carve, ollie, kickflip, 50-50 and boardslide, crash and restart instantly. It must be deterministic, tested, deployable to Pages, stubbed for every later package, and it **freezes the behaviours the fairness proof depends on** (collision, skim, pits, magnet, capture).

### Scope
1. **Scaffold.**
   - Pinned `package.json` (TECH §1, including the two `@fontsource` devDependencies), `tsconfig.json`, `vite.config.ts` (single mode may be stubbed; the SW plugin arrives in M4), `scripts/lint.mjs` with determinism bans and import boundaries, `vitest.config.ts`, `playwright.config.ts` (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, SwiftShader args, mobile and desktop projects).
   - `index.html` with the viewport meta and CSS hygiene (TECH §10.1), and `src/fonts/fonts.css` with the self-hosted fonts.
   - `.github/workflows/pages.yml`, so the owner can try builds on a phone early.
   - `docs/core-requests.md`, seeded with headers only.
2. **`src/core/`**, verbatim from TECH §4, with working `math`, `rng` (sfc32 + hash32), `tuning` (`speedAt`/`sAt`/`tAt` closed form) and `bus`.
3. **`game/`.**
   - `loop.ts`: fixed 60 Hz, accumulator, 4-step cap, interpolation, `timeScale`, input binning by tick due time, the 60 fps render cap, and one-of {chunk build, segment generation} per frame.
   - `app.ts`: **the whole DESIGN §17.1 flow** against stub screens: Title → Run → Crash overlay → (fresh touch ≥ 0.6 s → Run) | Results → Run, Pause (button, Esc, visibility, `popstate`, landscape rotate card), Home, and the intents of TECH §4.12.
   - `wiring.ts` and `runSession.ts` (run id + seed drawn here).
4. **`sim/` + `tricks/` (minimum, with frozen contact behaviour).**
   - Movement: the speed schedule, carve (P-controller, accelerations, gain 1.0 in every steering state), soft walls, ground slabs with step-up, sticky stairs and inclines.
   - Air: ollie (tap and ↑), gravity, coyote, jump buffer, `airLeft` prediction.
   - Flips and landing: Kickflip ←, Heelflip →, Pop Shove-it ↓, with every landing band (clean / Perfect at 0.12 s / sketchy / bail).
   - Grinds: the magnet **through `targetX`**, capture (including `pickOnly` edges), the 50-50 default and a Boardslide pick ←, the pick window taking every swipe, end hop and pop-out.
   - Contacts (**frozen here**, TECH §6.4): slam, crash tops never skim, skim onto landable tops, badLanding, pits at lip level, side bump, raised-slab bodies.
   - Scoring: points with per-trick rounding, links, link window, combo heat, gateway bank, bank or lose, distance.
   - Infrastructure: events, `pose()`, `snapshot`/`restore`/`hash`, `createSim(tables, deps?)`.
   - `tricks/defs.ts` may already hold the full DESIGN tables.
5. **`input/`.**
   - The recognizer with the full DESIGN §4.2 grammar: tap ≤ 350 ms, hold, drag, swipe labels (`fast`, `fromRest`, `steer`), arc compensation, recoil, re-fire, lift-off suppression, multi-touch ownership, `pointercancel`.
   - Pointer binding, keyboard preset A (immediate cardinals + amend, S for manual), `frames.ts`, and `createRecognizer`.
6. **`world/gen/` (minimum).**
   - Area timeline (all 4 areas named, DESIGN §12.1 timings; generation falls back to Downtown templates for every area in M0).
   - Base street slabs and curbs.
   - Roll-out segment (0–9 s), and templates S_OPEN, S_BARRIER, S_TRENCH, S_GATE, DT_LEDGE and DT_BENCHES.
   - A simple validator: height bands, `R_MIN` spacing along SafeKeys, A3 scheduling.
   - Coins on trick lines and SafeKeys.
   - Chunks and `WorldQuery`, `ensure(sAhead, maxSegments?)`, `startT` and `startArea` plumbing.
7. **Rendering (minimum).**
   - `gfx/renderer.ts` (MSAA from the capped DPR, `PCFShadowMap`), and a chunk builder with flat vertex colours: grey boxes coloured by height class; grind edges cream over an ink underline.
   - Hemi + directional light with the golden palette constant.
   - **Camera rig with the full framing solver** (TECH §8.3), using the real HUD band from `Viewport`.
   - Contact shadow and origin rebasing.
8. **Stubs with the exact factory signatures** for:
   - `skater/` (capsule + box board that shows flip rotation and spin yaw)
   - `vfx/` (no-op)
   - `audio/` (silent engine, with the unlock implemented on `pointerup`/`touchend`/`click`/`keydown` and retried until running)
   - `meta/` (`applyRun` gives distance-based coins, idempotent per `runId`; catalog = 3 starters)
   - `save/` (minimal store with adapter, memory fallback and v1 defaults)
   - `ui/` (debug HUD in a 56 px band: score, combo, coins, pause; text-only Title / Crash / Results with ROLL AGAIN)
   - `platform/monetization.ts` (`NullProvider`)
9. **`platform/`.** iOS hygiene (touchmove blocker on `#play` only), the visibility pause, `history.ts` (back-gesture pause), `compat.ts` (boot checks), `wake.ts`, haptics.
10. **`debug/` and `scripts/`.** The full `window.__skate` API (TECH §4.11). `bot('safe')` is a SafeKey follower. Perf HUD. **`scripts/shots.mjs` with every mode** (TECH §11.4) and the hooks it uses, so W2a, W2b and W3b never touch integrator files.
11. **Tests:**
    - core
    - camera solver table (all TECH §8.3 viewports, including safe-area and toolbar rows)
    - sim basics: airtime, apex, line change, step-up, skim and crash tops, pit at lip level, landing bands, magnet capture
    - recognizer traces, including the misfire traces (TECH §7.4)
    - replay determinism
    - generator golden hash
    - `bots.quick` with the SafeKey follower
    - e2e `smoke.spec`, `touch.spec` (basic) and `audio.spec`
12. **Build.** `npm run build` (dist) works and deploys to Pages. (PWA, icons, single-file build and the size check move to M4.)

### Acceptance criteria (G0)
- [x] `npm run dev`: tap to start. Within about 11 s you can carve, ollie the 3.5 s chain, grind the ledge at 6 s, kickflip, and crash on a tall blocker (the first one comes at ~10.4 s: the 9 s Roll-out has none, DESIGN §12.4). A fresh tap ≥ 0.6 s after the crash restarts in < 1 s.
- [x] Keyboard preset A plays the same on desktop.
- [x] Unit tests prove:
  - flat ollie airtime 0.600 s ± 1 tick at 7.0 and 10.5 m/s;
  - a 2 m line change ≤ 0.50 s;
  - `speedAt` equals 7.0 at t = 20, 8.99 at t = 90 and 10.5 at t ≥ 150;
  - camera look-ahead ≥ 2.5 s below the HUD band at every listed viewport and speed;
  - a flat ollie never clears a 1.15 m `crash`-top solid, and rolling onto a pit falls.
- [x] Replaying a recorded 2-minute input gives identical per-tick hashes, and `snapshot` → `restore` → same hash.
- [x] `__skate.start({seed:1}); manual(true); step(600)` returns a sane snapshot, and `events()` contains `ollie` after `gesture('tap')`.
- [x] `bots.quick` passes with the SafeKey follower (M0 templates only, 20 seeds × 2 min).
- [x] `smoke.spec`, `touch.spec` and `audio.spec` pass. `dist/` is produced and deployed.
- [x] Every module folder exists, with its factory matching TECH §4.13. Each later agent can start by replacing its stub.
- [x] Tag `m0`.

**G0 result (gate G0).** All items pass. Evidence: real CDP touch at 390×844 and CDP keys at 1280×800 on seed 1 (carve, chain ollie at 3.2 s, 50-50 on the ledge at 5.95 s, pop-out kickflip at 7.4 s, slam into a news box, retry 0.76 s after the crash, first new-run frame 23–290 ms later); unit tests in `tests/unit/sim/basics.test.ts`, `replay.test.ts`, `core/tuning.test.ts`, `render/camera.test.ts`, `integration/labels.test.ts`; `bots.quick`; 48 e2e passed (4 project-specific skips); `dist/` and `dist-single/` build, and the Pages workflow deploys `dist/` when DEV is pushed. The first tall blocker of every seed arrives at **10.4 s**, because the 9 s Roll-out (DESIGN §12.4) has none and the first gate needs a ≥ 3 m lateral shift from the safe line; the criterion now says "about 11 s".

**G0 review fixes** (player-feel and gate-checklist reviews): the perf gates now exist (`tests/unit/sim/bench.test.ts`, `tests/unit/gen/bench.test.ts` in `npm test`, `tests/e2e/bot-survival.spec.ts`); dodges no longer misfire as FS/BS 180 pops or flips and pops keep their steering, sloppy taps ollie (DESIGN rows 57–58); interim first-runs hints and teaching cause lines (row 59, `game/onboarding.ts`); flips drop and enlarge the board so it reads (`skater.config.ts` `FLIP_VIEW`); pits show a lit far wall and lip chevrons; the HUD band has an ink scrim; back gesture on Settings-over-Pause returns to Pause; `audio.spec` waits for the music on a shared CPU.

---

## Wave 1: feel and fairness (two worktrees in parallel)

### W1a: Gameplay depth (GP)
**Owns:** `src/sim/`, `src/tricks/`, `src/input/`, `tests/unit/{sim,tricks,input}/`.
**Must not touch:** `world/gen/` or `debug/bots/`. Hand-built `Obstacle` fixtures for grind and landing tests go in `tests/unit/sim/fixtures.ts` and are injected with `createSim(tables, { makeWorld })`.
**Must not change** the contact, skim, pit, magnet or capture behaviour frozen in M0 (TECH §6.3) without an approved `core-requests.md` entry.

**Deliverables**
- **Tricks:**
  - All 15 flips with the upgrade chains (continuous rotation, upgrade refusal), Double-up, and the Indy Grab (≥ 0.25 s of air).
  - **Body spins:** FS / BS 180 and 360, 180 Out, fakie and Revert (DESIGN §6.1a).
  - All 13 grinds, including double-swipe picks, Perfect Lock, switches (↓ ← → ↙ ↘, max 2) and transfers.
  - Manual and Nose Manual, with the new start rules (HOLD only in a combo or on a pad/ledge top), shrinking budgets, pre-press (0.30–0.10 s), coast and bump exits.
- **Landing and contacts:**
  - Full landing rules, including the first-runs bail floor and the edge nudge.
  - Non-landable tops, near miss (inside and outside a combo), knockables, ground align through `targetX`.
- **Scoring:** every bonus, repetition decay, variety, the ×30 cap, sketchy-banks, **combo heat** and the gateway bank (DESIGN §13). `score.config.ts` holds every scoring number.
- **Gesture handling:**
  - Exhaustive gesture × label × state interpretation (DESIGN §4.3) with the ordered conflict rules 1–7 and the steering-stroke rule.
  - Keyboard amend and preset B. Gamepad is optional.
- **Lesson rewind** (`RunConfig.rewinds`, moved here from M4 because it lives in the sim).
- **Output:**
  - `pose()` complete for every `PoseId`, grind pose, manual kind, `spinYaw` and `fakie`.
  - Every `GameEvent` kind emitted where specified.
- **Debug overlay data:** the pick-window state, heat and `airLeft` exposed in the snapshot.

**Acceptance**
- [ ] An exhaustive table test: every (state, gesture, label set) → exactly the intent in DESIGN §4.3.
- [ ] The worked example (DESIGN §13.6) scores exactly 5,028. Ollie spam (30 ollies) yields a multiplier of ×1 and banks within 2.5 s of the last link-adding trick.
- [ ] Feasibility at 7 and 10.5 m/s:
  - every single flip, 360 Shove-it, Tre Flip and a 360 spin land clean from a flat ollie with a swipe at +0.18 s;
  - doubles land clean off a 0.30 m rail pop;
  - triples land clean off a 2.0 m drop.
- [ ] The pick window opens 0.25 s before capture, ←← within the window gives Lipslide, and ↑ in the window gives Nosegrind.
- [ ] The manual budget sequence within one combo is 3.0, 2.2, 1.6, 1.2, 1.0, 1.0. A resting thumb outside a combo starts nothing.
- [ ] A steering-stroke ← in the air that is not `fromRest` produces no flip and no `targetX` cancel.
- [ ] `bots.quick` passes on the W1a branch. Sim bench ≤ 0.05 ms per tick. Determinism tests still pass.
- [ ] No edits outside the owned folders, except `docs/core-requests.md`.

### W1b: World generation and bots (WG)
**Owns:** `src/world/gen/`, `src/debug/bots/`, `tests/unit/world/`, `tests/bots/`.
**Must not touch:** `sim/`, `tricks/` or `input/`. It uses the M0 sim, whose contact behaviour is frozen, so the validator and sim agree. The thumb bot uses `createRecognizer` from `input/index.ts`.

**Deliverables**
- **Areas:**
  - All 4 area lateral layouts, base slabs and surfaces, with the DESIGN §12.1 timeline (Neon at 2:02).
  - Prop builders for every `PropKind` used by **v1 templates, fillers, the gateways and the Lesson Line** (DESIGN §10.3 dimensions, the new tall heights, top types, `pickOnly`, pit `lipY`, slab bodies).
  - **v1 templates:** the 9 shared ones (with S_INCLINE_UP), **6 per area** (marked v1 in DESIGN §10.4, landmarks included), the 4 gateways, the 40 s Lesson Line and the 9 s Roll-out. The other 20 templates are M5 stretch.
- **Fairness rules:**
  - The full validator (DESIGN §10.6, rules a–i): history planes, committed exit set, hitbox dilation, forward DP for required actions, dead ends ≤ 2.0 s, the greedy-player check, exit zones and grind sweeps, occlusion. L1 is skipped (rule d only).
  - Anti-straight rules A1–A6 from t = 9 s, clocks paused in T0, the constructive fallback, column fillers that re-validate, and the full-width scheduler.
  - Datum payback with S_INCLINE_UP.
- **Placement:**
  - Coin placement rules (DESIGN §10.8).
  - Difficulty phases and tier weights (`gen.config.ts`), plateau at 6 actions / 10 s.
  - Landmarks, gap tags and `warnAtS`.
  - **No movers** (deferred).
- **Decor vocabulary.** Emit `Decor` records for buildings, shadow casters, lantern strings, blade signs, billboards (inner edge |x| ≥ 4.9), cross-street end walls, the maglev's two edge beams, puddles, trees and so on. The vocabulary is defined in `world/gen/decor.ts` (`DECOR_KINDS` with param docs) for W2a to render. In M0 the renderer draws unknown decor as nothing.
- **Bots:** the safe (delayed-vision, plan-ahead steering), **myopic**, **thumb**, **conformance**, straight and trick bots, plus the harness and `scripts/bot-report.mjs` output format.

**Acceptance**
- [ ] `npm run test:bots` (TECH §11.2 gate suite): safe bot 100 seeds × 8 min from t = 0 plus 100 from the plateau with **0 crashes**; **myopic median survival ≥ 4 min**; **thumb bot 0 crashes and 0 unintended tricks** on 20 seeds; conformance 0 crashes on 50 seeds.
- [ ] Straight bot: 100% of runs crash by t ≤ 20 s for all 9 lanes, and within 10 s from a plateau start.
- [ ] Static asserts over the gate's seeds × 3,000 m:
  - visibility ≥ 2.5 s and decision time ≥ 1.2 s;
  - spacing ≥ `R_MIN`, required ollie windows ≥ 0.25 s, dead ends ≤ 2.0 s;
  - no forbidden-band solids (0.61–1.14 m);
  - datum closure;
  - trick-coin share ≥ 75%.
- [ ] Rejection rate < 5%, fallback < 1%, segment generation ≤ 3 ms p95 (bench).
- [ ] The Lesson Line matches the DESIGN §12.3 table, and each gateway appears at the DESIGN §12.1 times (**2:02 for Neon**).
- [ ] Golden chunk hashes are updated and committed.
- [ ] The score-ratio and combo-duration checks exist. They may be marked `todo` until G1, when the W1a scoring is merged.

### Gate G1 (INT)
1. Merge W1a, then W1b, into `main`. Resolve `core-requests.md` items, as additive `core/` changes only.
2. Run the full gates (TECH §11.6). This includes the **score ratio ≤ 10%**, **p95 combo ≤ 45 s**, trick-bot feasibility with the real scoring, the **thumb bot against the W1a recognizer**, and the **conformance bot against the W1a sim**.
3. Wire the debug overlays: safe-line heatmap, pick window and heat.
4. Play in the browser on both projects. Tune only via config files.
5. Tag `m1`.
6. **G1b (owner phone playtest after `m1`):** merge `pkg/fix-locker` (a Locker tap equips; try-ons per slot), `pkg/ctl` (two thumbs: left steers, right tricks; DESIGN row 71), `pkg/steer` (direct touch steering: lead cap, fast thumb, release brake; row 72) and `pkg/cam` (telephoto perspective run camera and occlusion cure; row 73) onto the G1 tune, re-run every gate, and record the result as the base of the approved re-theme ("Reclaim").
7. **Re-theme RECLAIM (DESIGN §24 row 74):** T0 docs, `RECLAIM` tokens, `core/skins.ts` `propSkin`, `kits/dress.ts` dressing rules and life accounting → T1 vehicles and kits ∥ T2 render-side overgrowth ∥ T5 audio → T3 decor kinds (split golden hash) → T4 VFX → T6 copy and Title → T7a Phase A review (obstacle hashes identical, bots unchanged) → T8 Phase B (cars as the main blocker) → T7b final review and release prep.

---

## Wave 2: look (two worktrees in parallel)

### W2a: World art, camera polish, VFX (WA)
**Owns:** `src/world/render/`, `src/vfx/`, new files in `src/gfx/`, `tests/unit/render/`.

**Deliverables**
- **Kits:**
  - Kits for every `PropKind` used by v1 templates, fillers, gateways and the Lesson Line, in all 4 area skins (DESIGN §18.5–18.6), plus renderers for every `DECOR_KINDS` entry. Stretch kinds may render as tinted boxes until M5.
  - Buildings as off-screen shadow casters.
  - Canvas textures: facade and sign atlases with invented brands and the reviewed Japanese words with the `measureText` fallback, ground, decals, glyphs.
- **Readability (DESIGN §18.4):** ink hazards on the lighter asphalt; **inverted Neon hazards** (`#7A6FB0` body with an emissive magenta or lantern-red rim); cream-over-ink grind edges everywhere; chevrons on every full-width hazard including the holo gate's solid base; `noFog` on hazards and edges; minimum on-screen widths for edges and coins; the cyan contact glow on dark ground; the coral crash outline flash. **`npm run shots -- --contrast` passes.**
- **Lighting and palette:**
  - Palette presets with the 8 s blends.
  - Hemi + sun lighting with `PCFShadowMap`, glow cards, window-lit ramp, puddles and water, the sky glow inside the HUD band and haze.
- **Performance:** the 5-mesh chunk layout (x-ray parts separate, no `discard` in the opaque shader), the `uDesat` uniform, quality tiers with work-time auto-adjust, context-loss rebuild, and the Roll-out chunk cache.
- **Camera and menus:** shake and punch driven by `GameEvent`s (DESIGN §8 table); the **static Title diorama** and Locker with the perspective camera, sky dome, clouds, birds and the two skyline strips, at 30 fps.
- **VFX:** every effect in DESIGN §18.8, including speed lines from 9.0 m/s outside the corridor, side-dressing streaks and the world-space bank-timer arc.

**Acceptance**
- [ ] Screenshot set at 390×844, 390×664 and 1280×800, for each area and each gateway blend, reviewed against DESIGN §18.4:
  - hazards read against the ground in every area, Neon included;
  - grind edges are cream over ink;
  - full-width hazards have chevrons;
  - no decor in the forbidden visual vocabulary and nothing opaque over the corridor;
  - identity elements are camera-facing in portrait.
- [ ] `--contrast`: hazard ≥ 2.5:1 and grind edge ≥ 1.8:1 at every preset and blend.
- [ ] `bot-survival.spec` in each area at the plateau: `calls ≤ 70` (main) and `≤ 120` total, `tris ≤ 120k`, and chunk build p95 ≤ 4 ms.
- [ ] Neon City reads as dense, neon and original. Cross-check: no real brands, no landmarks, no copied characters or signs.
- [ ] Context loss (`WEBGL_lose_context` in e2e) → resume restores the scene.

### W2b: Skater, board, helmet, cosmetics (SK)
**Owns:** `src/skater/`, `src/content/`, `tests/unit/{skater,content}/`.

**Deliverables**
- **Body:** a rigid-skinned body with the outline twin, IK legs, and every pose in DESIGN §18.5. Flip rotations come from `pose.board`, spins from `pose.spinYaw` and `pose.fakie`, and grind poses from `pose.grindId`.
- **Effects:** the crash tumble with the board flying off, sketchy windmill, blink and the face canvas.
- **Board and helmet:**
  - Deck extrusion with kicks and concave.
  - The deck-graphic generator (all patterns).
  - Helmet shells, novelties, decals and finishes.
- **Catalog:** `content/cosmetics.ts` with all 40 items exactly as DESIGN §15 (ids, names, rarity, source, theme, look params), each with a **distinct static look**. The bespoke animated fx (Kettle's screen faces, light seams, trails, hover ring, orbiting fish, glyph scroll, petal shed, animated canvases) are M5 stretch, with static fallbacks.
- **Showcase mode** for the Locker/Shop turntable (driven by the `turntable` and `preview` intents).

**Acceptance**
- [ ] A contact sheet of all 40 items (`npm run shots -- --cosmetics`), reviewed. Every item is distinct, matches its description, and reads at 31 px (SE in Safari at top speed) as well as at 60 px.
- [ ] The skater is ≤ 8 draw calls and ≤ 3.5k triangles. A loadout switch takes ≤ 30 ms.
- [ ] Pose coverage test: every `PoseId` × `GrindId` × `ManualId` (and spin / fakie) resolves to a defined target.
- [ ] Hitbox and physics unaffected: `sim/`, `tricks/` and `world/gen/` never import `content/` or `skater/` (the `scripts/lint.mjs` boundary rule).

### Gate G2 (INT)
1. Merge W2a and W2b. Wire `SkaterView` into the run scene, the Title diorama and the Locker stub.
2. Run the full gates, including `shots -- --contrast`, and the screenshot review.
3. Tag `m2`.

---

## Wave 3: progression and sound (two worktrees in parallel)

### W3a: Meta, UI, save, monetization hooks, analytics (MU)
**Owns:** `src/meta/`, `src/save/`, `src/ui/`, `src/platform/monetization.ts`, `tests/unit/{meta,save,ui}/`.

**Deliverables**
- **Screens:** every screen and flow in DESIGN §17, the HUD (§13.8: 56 px band, 26·k px score with abbreviation, last trick only, 48/56 px pause), popups (one at a time, ≤ 0.5 s, beside or below the skater, coral when the landing will be bad), toasts (`pointer-events:none` during runs), the hint component (`hud.hint(id)`), the crash cause line, the lo-fi overlay (pre-baked grain tile), and button styles with rarity text labels. Hidden screens are `visibility:hidden` + `inert`.
- **Rewards:** results with the coin tally, XP bar, Crate Meter, wishlist and one next goal; the instant-retry reward toast in the HUD band; the rewards modal.
- **Economy:** the complete DESIGN §14 and §16 rules, in `economy.config.ts`:
  - coins (score coins `sqrt(score/400)`), the XP curve (exponent 1.5), onboarding XP rules and the one-level-per-results cap, level rewards L1–30+
  - Trick Book (36) and postcards (gateway arrivals)
  - shop with featured items and try-on
  - crates with odds, pity, duplicate preference, pre-committed results and the reveal flow
  - the daily gift and warm-up bonus
- **Save:** the full `SaveV1` with migrations scaffold, sanitize, backup and flush points; `storage.persist()` after run 1; **Back up / Restore** in Settings; `applyRun` idempotent per `runId`.
- **Settings:** haptics Off / Key / All, Battery saver, Simple tricks, the silent-switch note, and everything else in DESIGN §17.2.
- **Hooks:**
  - Analytics: local ring buffer, opt-out, every event in DESIGN §21 that UI/meta owns.
  - Monetization: `offers.ts` policy, plus `NullProvider` and `FakeProvider` (`?fakeads=1`). The hidden reserved slot is on Results.

**Acceptance**
- [ ] `ui.spec` covers:
  - every screen opens;
  - Results → ROLL AGAIN ≤ 3 s;
  - buy an item → equip → it persists after reload;
  - open a crate → reload mid-reveal → the same result resumes;
  - pity counts are visible;
  - HUD no-overlap at 320, 360 and 390 px;
  - Back up → Restore round-trips.
- [ ] Unit tests cover the economy tables (XP values, rewards reference only existing items, odds sum to 1, pity at exactly 10/40/10), the onboarding cap (runs 1, 2, 3 end at exactly Levels 2, 3, 4 for typical XP), plus save corruption and storage-throw paths.
- [ ] HUD: there are no layout reads during runs (checked with a dev-mode guard). Text writes are ≤ 15 Hz.
- [ ] No dark patterns: no countdowns, no streak loss. Ads are hidden with `NullProvider` and never shown mid-run or in the first 3 runs (policy unit test).

### W3b: Audio (AU)
**Owns:** `src/audio/`, `tests/unit/audio/`.

**Deliverables**
- **Music:** the lo-fi engine from DESIGN §19.1:
  - scheduler, swing, drums, patterns, instruments
  - 5 progressions with BPMs and per-area variations
  - song form, intensity layers (speed tier ≥ 2 = 9.0 m/s), combo filter, pivot crossfade at gateways, tape stop
- **Mix:** tape and vinyl chain, sidechain, master.
- **SFX:** every recipe in DESIGN §19.3, with material-specific rolling and grinds, the **wind bed**, the hazard tick, coin pentatonic climb (relative major in minor keys), the pick-window chime, spin swish, crate and UI sounds.
- **Musical feedback:** the `note(seq)` bus, quantized ≤ 40 ms, on the relative major's pentatonic in minor keys.
- **Bindings:** `attach()` maps every relevant `GameEvent` and `AppEvent` to sound.
- **Platform:** unlock on user-activation events with retries, suspend/resume, `audioSession` 'ambient', volumes, 32-voice cap.

**Acceptance**
- [ ] The pure sequencer test for step timing passes. The bindings table covers every `GameEvent` kind (sound or explicitly silent).
- [ ] `audio.spec`: after a `page.touchscreen` tap, `__skate.audio().unlocked === true` and the context state is running. Voices stay ≤ 32 during a 2-minute trick-bot run.
- [ ] Main-thread audio scheduling costs ≤ 0.3 ms per frame (perf counter).
- [ ] Recorded listening notes: `scripts/shots.mjs --audio` (shipped in M0) writes a 20 s render per area to `artifacts/audio/*.wav`, sanity-checked for clipping (peak < −1 dBFS).

### Gate G3 (INT)
1. Merge W3a and W3b. Wire settings intents (volumes, haptics, shake, effects, quality, battery saver, sensitivity, simple tricks, preset, backup/restore), `meta.applyRun`, and the audio scene changes.
2. Run the full gates.
3. Tag `m3`.

---

## M4: Integration (INT)

**Scope**
- **Onboarding** (`game/onboarding.ts`):
  - Lesson Line hints (ghost thumb and key caps placed 10–16% from the bottom, plus the "rest here" mark in runs 1–3), and the 0.5× assist time scale. (Rewinds are implemented by GP in W1a; M4 wires the hint replay.)
  - Hint re-arm after a 3-run crash streak.
  - The first-3-runs pacing from DESIGN §14.4: Level 2 crate with a forced Rare skater, the Level 3 shop banner, the install hint after run 3.
- **Juice cross-cuts** (DESIGN §9):
  - the haptics table (≥ 15 ms pulses, ≤ 1 per 120 ms, Key / All levels)
  - crash render slow-mo 0.35× for 0.6 s, desaturate, the BAILED sticker and the cause line
  - the Perfect zoom punch
  - the BEST line and flag
  - New Ground cards and the SET BANKED! label
  - the full-width chevron flash + tick at 1.6 s
  - speed-tier stamps
- **Run flow:**
  - Instant retry (fresh touch ≥ 0.6 s) with the reward toast.
  - Pause/resume 3-2-1, Resume calling `ctx.resume()`.
  - Visibility, back-gesture and landscape auto-pause.
  - Wake Lock during runs; fullscreen on the first TAP TO ROLL in the Android browser.
  - Battery saver and menu frame caps.
- **Analytics:** every DESIGN §21 event fires (unit test with a fake sink plus an e2e buffer check).
- **PWA (moved here from M0):** manifest, generated SW (HTML network-first with a 2.5 s timeout), icons and `gen-icons.mjs`, `apple-touch-icon` and the iOS meta tags, the update toast (Title and Results only), offline reload.
- **Single-file build** (moved here from M0) with inlined fonts, `single.spec`, and the size check.
- **Performance pass** on the TECH §8.4 budgets across all areas.

**Acceptance**
- [ ] A fresh profile (cleared storage), first run:
  - the hints appear in order;
  - a crash on the trench rewinds;
  - the run ends at exactly Level 2 (a run of ≥ 30 s);
  - the crate reveals a Rare skater;
  - "Equip now?" works.
- [ ] A crash → fresh tap → new run in ≤ 1.0 s (e2e timing via events); a tap that went down before 0.6 s is ignored. Results path ≤ 3.0 s.
- [ ] All e2e specs pass on mobile and desktop. The gate bot suite passes. The size check passes.
- [ ] `pwa.spec`: offline reload works, the HTML timeout falls back to cache, and a new build shows the update toast on the Title.
- [ ] `single.spec`: no network requests at all.
- [ ] Tag `m4`.

---

## M5: Playtest and polish

**Scope**
- **Automated playtests:**
  - Trick-bot and "average-bot" profiles (the trick bot at 50% greed with 0.35 s reaction) over 100 seeds.
  - Compare against the economy targets (DESIGN §14.1): average run ~2.5 min, 25–40k score, 85–130 coins.
  - Tune `score.config`, `gen.config` and `economy.config`. Never tune `tuning.ts` without re-running the full bots.
- **Crash heatmap** from bot and analytics data: no single hazard kind may cause > 25% of safe-bot near-crashes (closest approaches) or > 25% of myopic-bot crashes.
- **Visual polish:** review screenshots for all areas and blends, cosmetics sheets and UI screens against DESIGN §18. Fix the readability issues first.
- **Feel checklist** (agent self-review with `__skate` traces):
  - the first grind happens ≤ 6 s into every run;
  - the first combo bank happens within 15 s on the Lesson Line;
  - nothing important sits in the bottom 22% of the screen;
  - popups never cover the look-ahead zone for > 0.5 s;
  - about 40–50% of flat-ollie flips at typical timing land Perfect.
- **Decisions:** keep portrait ψ = 0 or try ψ ≤ 4°; keep the skater anchor at 74% or move it to 70% (DESIGN §23).
- **Stretch goals, in this order:** the 20 non-v1 templates; the Start District picker with area Roll-outs; bespoke cosmetic fx; movers and their 4 templates; the live title attract run; gamepad support.
- **Release:** a `v1.0` tag, GitHub Pages deploy, and the `dist-single/index.html` artifact.

**Acceptance (release checklist)**
- [ ] All gates pass. `npm run test:bots -- --release` passes on fresh seeds (safe bot 200 + 200, thumb bot 50), not just the committed ones.
- [ ] The owner's question is demonstrably answered:
  - `artifacts/bots.json` shows 0 safe-bot crashes at the plateau and a myopic-bot median survival ≥ 4 min;
  - the thumb bot shows 0 crashes and 0 unintended tricks;
  - the straight bot dies 100% by t ≤ 20 s;
  - look-ahead ≥ 2.5 s on all viewports, toolbars and safe areas included;
  - the DESIGN §2 text matches the shipped numbers.
- [ ] Every name in game is original: GAME_NAME, skaters, brands. No licensed audio or assets. Japanese text comes only from the reviewed list.
- [ ] Monetization: `NullProvider` in production, no ad UI visible, and the hooks documented in TECH §4.10.
- [ ] A real-device pass on an iPhone (Safari and installed) and an Android phone: audio unlocks, back swipe pauses, no zoom or scroll, HUD clear of the notch.
- [ ] A **morning check for the owner** is printed in the release notes:
  1. Open the Pages URL on a phone in portrait.
  2. "Add to Home Screen".
  3. Play the Lesson Line.
  4. Reach Neon at about 2:02.
  5. Open a crate.
  6. Try the desktop keyboard.

---

## Package map (for scheduling)

| Package | Wave | Folders | Depends on |
|---|---|---|---|
| INT (M0, gates, M4) | M0/G/M4 | `core/`, `game/`, `fonts/`, `debug/` (except bots), `platform/` (except monetization), `gfx/` (base), `scripts/`, `index.html`, configs | — |
| GP Gameplay | W1a | `sim/`, `tricks/`, `input/` | core |
| WG World-gen | W1b | `world/gen/`, `debug/bots/`, `tests/bots/` | core, M0 sim (for bots), `input/` factory (thumb bot) |
| WA World art | W2a | `world/render/`, `vfx/`, `gfx/` (additions) | core, WG output (`Obstacle`, `Decor`) |
| SK Skater | W2b | `skater/`, `content/` | core (`SkaterPose`, looks) |
| MU Meta/UI | W3a | `meta/`, `save/`, `ui/`, `platform/monetization.ts` | core, `content/` catalog |
| AU Audio | W3b | `audio/` | core events |

Within each wave the two packages share **no folders**. The only shared write is the append-only `docs/core-requests.md`.

---

## Later (post-v1 backlog)

Accepted ideas that don't fit tonight, roughly in priority order:
1. **Daily Street:** one date-seeded run per day with its own personal best. Determinism makes it nearly free; no streaks, no penalties, so it stays within the owner's "no missions".
2. **Landmark records:** the best combo set on each landmark per area, shown as a painted tag the next time you pass it.
3. Anything from the M5 stretch list that didn't land: non-v1 templates, Start District, bespoke cosmetic fx, movers, the live attract title, gamepad.
4. Original novelty helmets (Traffic Cone, Toast Slice, Sun Lid, Cumulus) and the "Night Owl" supporter set.
5. Shared seeds and leaderboards (needs a backend).
6. Native wrapping (Capacitor), with the real monetization provider and haptics bridge behind the existing interfaces.
