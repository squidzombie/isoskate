# Isoskate

*The city’s quiet. The streets are yours.* Isoskate: a mobile-first endless street-skating web game (portrait, two thumbs): TypeScript + Vite + Three.js, everything procedural.

- **What:** `docs/DESIGN.md` · **How:** `docs/TECH.md` (§4 is the frozen contract in `src/core/`) ·
  **Packages:** `docs/ROADMAP.md` · **Order:** `docs/SCHEDULE.md` · **Contract requests:** `docs/core-requests.md`

## Commands

| Command | What |
|---|---|
| `npm ci` | Install (exact versions; `.npmrc` sets `legacy-peer-deps`) |
| `npm run dev` | Dev server on `$PORT` (default 5173) |
| `npm run build` / `npm run preview` | Production build to `dist/` / serve it on `$PORT` |
| `npm run typecheck` · `npm run lint` · `npm test` | tsc, determinism + boundary lint, vitest: unit + `tests/bots/quick*.test.ts` (`--maxWorkers=2` via config) |
| `npm run test:bots [-- --release]` | The gate bot suites in `tests/bots/` (`vitest.bots.config.ts`; `--release` sets `BOTS_RELEASE=1`) |
| `npm run test:e2e` | Playwright, mobile 390×844 + desktop 1280×800 (builds first; `E2E_NO_BUILD=1` to skip) |
| `npm run shots` | Screenshots to `artifacts/shots/` (`--seed N --ticks a,b,c --no-build`) |

Playwright uses the preinstalled Chromium: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (set by the configs). Never run
`playwright install`.

## Debug

`window.__skate` (dev builds, or `?debug=1`): `start({seed})`, `manual(true)`, `step(n)`, `gesture('tap')`,
`events()`, `camera()`, `perf()`… (TECH §4.11). Backquote toggles the perf readout. Query flags: `?seed=N`,
`?quality=low|med|high`, `?fakeads=1`, `?bot=safe`, `?reset=1`.
