# ISOSKATE: hand-off for the next agent

This file is the starting point for whoever continues the work. It says where the project stands, what the owner has asked for, what is unfinished, and in which order to continue. The owner reads it too.

## 1. The game in one paragraph

**ISOSKATE** (formerly DUSKLANE) is an original mobile-first, portrait, one-thumb-or-two-thumb endless street-skating web game: TypeScript + Vite + Three.js, everything procedural (geometry, textures and lo-fi music are generated in code). You skate forever through four areas (Downtown plaza, Suburbs, Industrial docks, a Japanese-style futuristic Neon city) of a quiet, nature-reclaimed city ("RECLAIM" theme): no people, abandoned cars and real objects as obstacles, moss and flowers, waxed cream grind edges. Tricks (15 flips, spins, 13 grinds with picks, manuals) score combos; coins, XP, a shop, crates and 40 cosmetics keep players coming back. The Title is Earth floating in space with your equipped board spinning in front of it; tapping dives into Earth and lands you in the run.

## 2. Where things are

| What | Where |
|---|---|
| Development branch (everything below is on it) | `claude/isometric-skateboarding-game-0b1x6h` (last good commit `e5fe38e`) |
| Design (authoritative) | `docs/DESIGN.md` (decision log in §24) |
| Architecture, frozen contract `src/core/`, gates | `docs/TECH.md` (§4 contract, §8.4 budgets, §11.6 gates) |
| Milestones and acceptance lists | `docs/ROADMAP.md`, `docs/SCHEDULE.md` |
| Cross-package hooks, invariants, gotchas | `docs/core-requests.md` (grep it for the module you touch) |
| RECLAIM re-theme spec (obstacle and decor mapping, palette, Phase B, plan T0-T8, acceptance checks) | `docs/THEME.md` |
| Brand spec "Earthlight" (name, Bungee logo with Earth-O, colour tokens) | `docs/BRAND.md` |
| Store text draft | `docs/STORE.md` |
| Phase B (where they stopped): status | §5.1 (the original hand-off patch: `docs/handoff/t8-phase-b-wip.patch`) |
| Orchestrator decisions and the owner's feedback history | `docs/handoff/orchestrator-notes.txt` |
| The multi-agent workflow scripts used so far, with the token-saving rules | `docs/handoff/workflows/` (`g1b.js`, `m4.js`, `m5.js`, `token-discipline.txt`) |

## 3. Running and checking it

```bash
npm ci
npm run dev                         # http://localhost:5173 ; add ?debug=1 for window.__skate (start, step, previewArea, snapshot, pointer traces, bot)
npm run typecheck && npm run lint
npm test -- --maxWorkers=2          # unit tests incl. determinism, golden chunk hashes, benches
npm run test:bots                   # fairness gate suite (safe, conformance, both thumb-bot profiles, myopic, straight, trick, static asserts, score ratio); slow
npm run build && npm run build:single   # dist/ and the single-file dist-single/index.html
npm run test:e2e -- --workers=1     # Playwright, mobile + desktop projects
npm run shots                       # screenshots; modes: --contrast --hud --green --audio --cosmetics
```

Playwright in this kind of container: Chromium is preinstalled; use `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` and never `playwright install`. WebGL runs on SwiftShader (`--use-gl=angle --use-angle=swiftshader`), so real-time e2e tests can flake when the machine is loaded: rerun a failing one alone before judging it. Use `PORT=<n>` to run several dev servers.

## 4. What is done

- **Core game:** sim with full tricks and scoring, generator with 4 areas, gateways, Lesson Line and Roll-out, a validator plus bots that prove every line is fair, world art, VFX, skater with 40 cosmetics, procedural audio, every UI screen, economy, save with backup/restore, monetization hooks (no ads).
- **Owner playtest changes (all merged):**
  - two-thumb controls: left half steers, right half does tricks (Settings: One thumb classic, Swap sides); thumb-bot gate for both layouts;
  - direct steering: the skater stops within about 0.2-0.3 m when the thumb stops or lifts (lead cap 0.8 m, fast thumb up to 7 m/s, release brake);
  - Locker: a tap equips; Shop try-ons stack per slot;
  - angled run camera: telephoto perspective, pitch 34, portrait yaw 9, FOV 24, with an occlusion cure (camera-side buildings cut at the corridor);
  - one cream-chrome grind signature on every grindable edge; Neon clutter moved off the street; denser streets.
- **RECLAIM theme T0-T7a (merged):** vehicle builder and every obstacle re-skinned, jagged crack lips on gaps, real-scale manholes, road arrows that make sense, overgrowth, dead/live signs, quiet-city ambience, new decor kinds, critters and drips, Neon sign cut, plain crash nouns, banned-word test, `shots --green`.
- **Earth Title + dive + brand (merged):** constant-speed spinning board, 1.45 s dive that lands on the run camera, rename to ISOSKATE (storage keys deliberately still `dusklane.*` so saves survive), Bungee logo with the Earth-O, Earthlight colour tokens.

## 5. What is NOT done, in order

### 5.1 Phase B: where they stopped (THEME §3.4, §12 row T8; DESIGN §24 rows 75–76)
The owner first asked for cars instead of "the weird random shapes"; the first Phase B build (the hand-off patch, applied in 62f28e5) put a car at the edge of every anti-straight row and the owner found it forced ("Don't add cars just to add cars. Especially if they always are just on the sides ... natural looking but obviously thoughtful so it stays interesting as an obstacle"). The generator track of the rework is in: `world/gen/rows.ts` builds each row as a street scene with everything where it belongs (DESIGN §10.7 rows note), every vehicle faces its own traffic (`props/shared.ts` `faceTraffic`, `core/skins.ts` `noseToCam`), the van at a loading entrance is Docks-only, the van wander wall is cut, the parked rows stand in the road at the kerb, and `tests/unit/gen/placement.test.ts` replaces `phaseb.test.ts`. After review, a row's openings are drawn by how naturally their road closes (`rows.ts` `rowCloses`, `GEN.rows.fit`: the block mood, the last rows, a one-row look-ahead), the Suburbs' lanes are unmarked, and the measured limits of the geometry (two cars side by side or one mid-street wherever a row closes the whole road) are written down in DESIGN §10.7 and tested per area. The render track is in too (front and rear ends that read which way a car points, a rearward cabin, the six cheerful paints, flowers in pickup beds, the x-ray cap fixes, the kerb wheel lift), and a second vehicle off every route stands ≥ 2.2 m from the first along s (`GEN.rows.apart`), so fewer pairs read as abreast. Full bot suite, contrast gate and contact sheets: green and reviewed on 11 Nov (`docs/handoff/overnight-2026-11-11.md`). Open for the owner: pairs on the player's line still stand 1.2 m apart (the stagger sets how early the dodge must start), how often rows carry a vehicle (Downtown about 60–75 % of rows), and the unmarked Suburbs lanes.

### 5.2 One combined review and fix pass (planned as the end of gate G1)
Three independent lenses on the whole build: player feel on a phone (two-thumb controls, camera, flow), art direction and UI against DESIGN §17/§18, THEME and BRAND, and the gate checklist (TECH §11.6, THEME §12 checks 1-8, no weakened tests). Then fix the real issues and tag `m1`. The prompts are in `docs/handoff/workflows/g1b.js` (Review and Fix phases).

### 5.3 Known issues to fix (from the reports)
- **Bundle size:** JS+CSS gzip was about 401 KB after integration (budget decision: 420 KB; TECH §8.4) and grew with the theme and the Title: measured **467 KB** on 11 Nov (453 KB JS + 14 KB CSS; the `?debug=1` chunk excluded). By source (minified bytes): three 38 %, `world/render` 20 %, `world/gen` 10 %. Get back under 420 KB without visible quality cuts (the M4 performance pass owns this; ideas in `docs/handoff/overnight-2026-11-11.md`).
- **Density:** trick elements per 10 s are still below DESIGN §11 targets (rows take about half of the run); Phase B's parked rows with trick lines are the planned lever.
- Lowest grind-edge contrast is 1.89 against the 1.8 floor (Neon rail in a blend, desktop).
- The two-thumb hint chip overlaps a corner of the hovering trick-thumb ghost; on a 375x548 phone the chip touches the skater's feet.
- At 320 px the longest trick names ("INWARD HEELFLIP") are cut at 10 px.
- Flaky under load: `ui.spec.ts` "Level 2 skipped by ROLL AGAIN" and desktop smoke instant retry.
- To check on a real iPhone: the Earth-O logo layering (nested `background-clip`), audio unlock, back swipe.
- Name clearance for ISOSKATE (trademarks, both app stores) before any public launch.

### 5.4 Milestone M4: integration (docs/ROADMAP.md "M4")
Onboarding and Lesson Line hints for the two-thumb layout, juice (haptics, crash slow-mo, Perfect punch, BEST line, stamps), run flow (instant retry, pause, wake lock), every DESIGN §21 analytics event, PWA (manifest, generated service worker, icons from the brand's drawn icon), the single-file build test, and the performance pass (bundle size, boot-time prop library, chunk-build budget). A two-track plan is in `docs/handoff/workflows/m4.js`.

### 5.5 Milestone M5: playtest, polish, release (docs/ROADMAP.md "M5")
Economy and score tuning with playtest bots, the crash heatmap, the remaining non-v1 templates, visual polish, then the v1.0 checklist and a GitHub Pages deploy (the owner must enable Pages and merge to `main`). Plan in `docs/handoff/workflows/m5.js`.

## 6. What the owner cares about (keep these)
- It must be fun and "addicting", and must not feel 2D; they like the angled camera.
- Two-thumb controls; steering that stops when the thumb stops.
- The quiet, peaceful reclaimed city (not sad, no zombies or gore), real objects, cars as blockers, obvious jagged cracks to jump.
- One consistent grind look; nothing covering the skate area.
- The Earth Title with the equipped board spinning at a constant speed; the dive.
- The name ISOSKATE in the Bungee font they like, with the new Earthlight colours.
- They test on a phone: keep a playable single-file build ready (`npm run build:single`).

## 7. How the work was run (useful patterns)
Work was split into packages built in parallel git worktrees (`/home/user/wt/<pkg>` on branches `pkg/<pkg>`), each with an implementer, an independent skeptical reviewer and a fix stage, then merged by a gate that ran every check, played the game in Playwright and looked at contact sheets. To keep token use down, agents read docs by section (never whole), measured visuals with scripts and looked at screenshots as combined contact sheets, capped command output and ran slow suites at most twice (`docs/handoff/workflows/token-discipline.txt`).
