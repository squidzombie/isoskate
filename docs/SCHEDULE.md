# DUSKLANE: Execution schedule (overrides the wave order in ROADMAP.md)

ROADMAP.md still defines the package scopes, ownership and acceptance criteria. This file only changes the order: more packages run at the same time, so the night fits. Ownership rules (ROADMAP "Rules for every milestone", TECH §2) apply unchanged.

**Branches**
- `DEV` is the integration branch, `claude/isometric-skateboarding-game-0b1x6h`, checked out in `/home/user/isoskate`. Wherever ROADMAP says `main`, read `DEV`.
- Package agents work in their own git worktree, `/home/user/wt/<pkg>`, on a local branch `pkg/<pkg>` created from the current `DEV` HEAD.
- Only gate agents merge into `DEV`. Never push any branch except `DEV`, and only gate agents push.

**Ports**
- Every worktree uses its own dev/preview port through the `PORT` env var: `DEV` 5173, `pkg/*` worktrees 5181–5189 as assigned in the brief.
- `playwright.config.ts` and `scripts/shots.mjs` read `PORT`.

**CPU (4 cores, shared by up to 4 agents)**
- Run vitest with `--maxWorkers=2` while iterating.
- Run Playwright with `--workers=1`.
- Full bot suites only at the end of a package.

## Phases

| Phase | Who | What |
|---|---|---|
| **P1 M0-core** | 1 agent, `DEV` | The skeleton everything else builds on (see below) |
| **P2** | 4 agents in parallel | **M0-sim** (`sim/`, `tricks/`, `world/gen/` minimum, `debug/bots/` SafeKey follower)<br>**M0-io** (`input/`, `platform/` except monetization, `ui/` debug HUD + text screens, `world/render/` grey-box chunk builder, `gfx/` additions, `debug/` api/perfhud/overlay, `scripts/shots.mjs` all modes, e2e smoke/touch/audio)<br>**SK** (W2b)<br>**AU** (W3b) |
| **G0** | gate agent | Merge the four branches, wire skater + audio, M0 acceptance, push |
| **P3** | 4 agents in parallel | **GP** (W1a), **WG** (W1b), **WA** (W2a), **MU** (W3a) |
| **G1** | gate agent | Merge the four, wire everything, full gates, push |
| **P4** | INT | M4 integration: onboarding, juice cross-cuts, run flow, PWA, single-file |
| **P5** | many | M5 playtest and polish loops |

### P1 M0-core
- Scaffold: `package.json` pinned as in TECH §1, `npm ci`, configs, `scripts/lint.mjs`, `index.html`, fonts, `.github/workflows/pages.yml`, `docs/core-requests.md`.
- All of `src/core/` verbatim from TECH §4, plus `core/decor.ts` (see below).
- `game/`: loop, app flow against stub screens, wiring, runSession.
- **Every** module folder with its TECH §4.13 factory as a working stub.
- `gfx/renderer.ts`, the camera rig with the full framing solver and its unit test, and a minimal world view (flat street slab, curbs and grey boxes for obstacles).
- The `debug/api.ts` skeleton with every TECH §4.11 method present (stubs may return defaults).
- Basic `scripts/shots.mjs`, `smoke.spec`, and `npm run build`.

### `core/decor.ts` (added to the frozen contract)
- `export const DECOR_KINDS` is the single vocabulary of `Decor.kind` values. Each entry carries its param docs.
- It is derived from DESIGN §18.5–18.7 and §10, and covers buildings, shadow casters, lantern strings, blade signs, billboards, end walls, maglev beams, puddles, trees, street lamps, vending machines, cranes, containers-as-backdrop and so on.
- WG emits only these kinds and WA renders all of them, so WG and WA can be built at the same time.
- `world/gen/decor.ts` re-exports or uses it; it does not redefine it.
