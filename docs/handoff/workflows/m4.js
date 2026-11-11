export const meta = {
  name: 'dusklane-m4',
  description: 'M4 integration: experience track (onboarding, juice, run flow, analytics) and platform track (PWA, single-file, perf, size) in parallel worktrees, then the M4 gate and tag m4',
  phases: [
    { title: 'Implement', detail: 'XP and PL tracks in their own worktrees' },
    { title: 'Verify', detail: 'independent skeptical reviewer per track' },
    { title: 'Fix', detail: 'apply verified issues, hand-off' },
    { title: 'Gate', detail: 'merge both, M4 acceptance, full gates' },
    { title: 'Review', detail: 'first session + release platform + gate checklist' },
    { title: 'Final', detail: 'fix verified issues, tag m4' },
  ],
}

const REPO = '/home/user/isoskate'
const DEV = 'claude/isometric-skateboarding-game-0b1x6h'
const SCR = '/tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/m4'
const HANDOFFS = '/tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/m4-handoffs.txt'
const TRAILERS = `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CeofHDq6PYaWz547ot5x2W`

const DISCIPLINE = `
TOKEN DISCIPLINE (keeps the work and the review just as thorough, at a fraction of the cost; everything you read stays in your context for every later step, so read narrowly):
- Never read DESIGN.md, TECH.md or core-requests.md whole. List headings with grep -n '^#' and read only the sections your task names or that grep shows are relevant (sed -n 'a,bp'). Same for large source files and hand-off files: grep first, then read the range you need.
- Screenshots: measure with scripts first (contrast numbers, sizes, overlap checks, counts). When you need to look, compose a contact sheet (python3 with PIL: related frames side by side, longest side <= 1600 px) and read the sheet, not the single PNGs; batch your looking near the end of a work phase rather than while iterating; never re-read an image you already saw; open one full-size PNG only to inspect a specific defect.
- Command output: always cap it (| tail -n 40, or grep -E 'passed|failed|✘|Error|FAIL'); on a failure read only that test's block. Never cat whole logs, build output or minified files.
- Slow suites (the full npm run test:bots, the full e2e run) at most twice: a baseline only if you need one, and once at the end; iterate with targeted subsets. A real-time e2e failure under load: rerun that test once alone; if it passes, note it and move on.
- Final report within its word limit, no pasted logs.
`

const TRACKS = {
  xp: {
    port: 5191,
    owns: `src/game/, src/ui/, src/meta/, src/platform/{haptics,visibility,history,wake}.ts and new platform files for fullscreen/orientation, src/vfx/, NEW files in src/world/render/ for run juice (BEST line and flag, chevron flash) plus the smallest hooks in existing render files (note each one), src/audio/ only for juice cues (the 1.6 s full-width tick), tests/unit/{game,ui,meta,platform,vfx}/, tests/e2e/ui.spec.ts and new tests/e2e/{flow,onboarding,analytics}.spec.ts`,
    brief: `TRACK XP (ROADMAP M4: Onboarding, Juice cross-cuts, Run flow, Analytics): the first session and the "one more run" loop. This is where a new phone player decides to keep playing.
Spec: ROADMAP M4 scope and acceptance (the XP items), DESIGN §9 (juice, haptics table), §12.3 (Lesson Line), §14.4 (first three runs), §17 (run flow, screens, timing targets), §21 (every analytics event with its properties), TECH game/ui/platform sections.
Deliver:
- ONBOARDING (game/onboarding.ts): Lesson Line hints in order with the ghost thumb / key caps placed 10-16 % from the bottom and the "rest here" mark in runs 1-3; the 0.5x assist time scale; hint replay after a Lesson rewind (GP implemented rewinds); hint re-arm after a 3-run crash streak; the first-3-runs pacing (Level 2 crate with a forced Rare skater, "Equip now?", the Level 3 shop banner, the install hint after run 3). A fresh profile's first run must end at exactly Level 2 for a run of >= 30 s, and a crash on the trench must rewind.
- JUICE: the haptics table (>= 15 ms pulses, <= 1 per 120 ms, Key / All levels, Off); crash render slow-mo 0.35x for 0.6 s with desaturation (uDesat), the BAILED sticker and the cause line; the Perfect zoom punch; the BEST line and flag on the road at the player's best distance; New Ground cards and the SET BANKED! label; the full-width chevron flash + tick 1.6 s before each full-width hazard; speed-tier stamps. Everything respects Settings (shake, effects, reduced motion, battery saver) and never covers the look-ahead zone for > 0.5 s.
- RUN FLOW: instant retry (a fresh touch that goes down >= 0.6 s after the crash starts a new run; one that went down earlier is ignored) with the reward toast; crash -> fresh tap -> new run <= 1.0 s and the Results path <= 3.0 s (e2e timing via events); Pause/Resume with a 3-2-1 and ctx.resume(); auto-pause on visibility change, the back gesture and landscape-on-phone; Wake Lock during runs; fullscreen on the first TAP TO ROLL in the Android browser (never on iOS or desktop); battery saver and menu frame caps (30 fps in menus, battery saver per DESIGN); the PWA update toast on Title and Results only, through the existing platform/pwa.ts registerServiceWorker({ nosw, onUpdate }) signature (the PL track implements registration in parallel: do not edit pwa.ts).
- ANALYTICS: every DESIGN §21 event fires with its properties at the right moment (unit test with a fake sink plus an e2e check of the ring buffer after a scripted session), opt-out in Settings respected, no network calls.
The PL track works in parallel on PWA, single-file, fonts, perf and size (platform/pwa.ts, main.ts, index.html, scripts/, configs, world/render perf, gfx): do not edit those; if you need something there, write it in your hand-off for the gate.
Feel bar: play a fresh-profile first session yourself through Playwright with real touch at 390x844 (isMobile, hasTouch) and judge it as a new player: is every hint clear and timed right, does the first crash teach, is the first crate exciting, does the retry feel instant? Iterate with screenshots and event traces.`,
  },
  pl: {
    port: 5192,
    owns: `src/platform/{pwa,ios,icon,compat,env,index}.ts, src/main.ts, index.html, public/, src/fonts/, scripts/ (new: gen-icons.mjs, the SW generator, the size check; existing scripts only where needed and noted), vite.config.ts, package.json scripts (no new dependencies), src/world/render/ and src/gfx/ for performance work (except the juice files XP adds), performance-only edits in src/world/gen/, src/sim/, src/skater/ and src/audio/ that keep behaviour and golden hashes identical, tests/unit/{render,gfx,perf}/, new tests/e2e/{pwa,single}.spec.ts`,
    brief: `TRACK PL (ROADMAP M4: PWA, Single-file build, Performance pass, and the size check): make it install, load fast, work offline and run smoothly on a mid-range phone.
Spec: ROADMAP M4 scope and acceptance (the PL items), TECH §8 (perf budgets §8.4, chunk build §8.6), §10.6 (PWA, service worker, update flow), the single-file build section, DESIGN §18.5 (boot-time prop library).
Deliver:
- PWA: manifest (name DUSKLANE, portrait, theme colours from the palette), a generated service worker written by our own build script (no new dependency): precache the hashed build, HTML network-first with a 2.5 s timeout falling back to cache, offline reload works; icons generated procedurally by scripts/gen-icons.mjs (original art, no external assets), apple-touch-icon and the iOS meta tags; registerServiceWorker({ nosw, onUpdate }) in platform/pwa.ts with its existing signature (never registers in an iframe, the single-file build or with ?nosw=1; calls onUpdate when a new SW is waiting; the XP track shows the toast on Title and Results). pwa.spec: offline reload works, the HTML timeout falls back to cache, a new build shows the update (onUpdate fires).
- SINGLE-FILE: npm run build:single produces dist-single/index.html with everything inlined (JS, CSS, fonts as data URIs), no SW, and single.spec proves there are no network requests at all while booting and playing a run.
- SIZE: a size check script (JS+CSS gzip, fonts reported separately) wired as an npm script and into the gate; budget per the TECH §8.4 decision row recorded at G1 (350 KB, or 420 KB if G1 applied the size decision). Report the top contributors per source folder from a sourcemap build and take safe wins (dead code, duplicated tables, tree-shaking three imports, minifier settings) without visible quality cuts.
- PERFORMANCE PASS on the TECH §8.4 budgets across all four areas and every gateway blend at the plateau: the boot-time per-kind/variant geometry library (DESIGN §18.5, TECH §8.6) so chunks stop re-tessellating every prop; chunk build p95 <= 4 ms for single builds of dense chunks (measure in Node and in the browser); draw calls <= 70 main / 120 total, tris <= 120k; no per-frame allocations in hot paths (sim, render update, vfx, audio scheduler); no layout reads during runs (e.g. input/index.ts reading innerHeight on every touch-down: cache it on resize; coordinate with the gate if that file is GP's); heap and GPU geometry counts flat over a 3-minute bot run; boot to TAP TO ROLL time measured and reduced (kit warm-up in idle slices). Prove every number with a test or a measurement script, and keep determinism and golden hashes identical.
The XP track works in parallel on game/, ui/, meta/, vfx/ and some platform files: do not edit those; list what you need there in your hand-off for the gate.`,
  },
}

const tracks = (Array.isArray(args) ? args : (args && args.tracks) || ['xp', 'pl']).filter(t => TRACKS[t])
const RESUMED = (args && !Array.isArray(args) && args.resumed) || []
const RESUME_NOTE = (t) => `
RESUMING AFTER AN INTERRUPTION: a previous agent for track ${t} was working in /home/user/wt/${t} when the machine restarted, and it was killed mid-task. Its partial work is still there (git log --oneline m1..HEAD, git status, git diff). Inspect that work FIRST: keep and finish what is sound (prove it with the tests), revert what is broken that you cannot finish. Stray dev servers or browsers may still hold your port (free PORT=${TRACKS[t].port} if needed, touch no other port).
`

function common(t) {
  const T = TRACKS[t]
  const WT = '/home/user/wt/' + t
  return `You are working on DUSKLANE, an original mobile-first (portrait, one-thumb) isometric endless street-skating web game: TypeScript + Vite + Three.js, procedural everything (no asset files), sunset lo-fi mood. Milestones M0 and G1 are merged (tag m1): real sim with full tricks and scoring, the full generator with 4 areas and gateways and the bots, world art and VFX, the skater with 40 cosmetics, procedural lo-fi audio, every UI screen, the economy and save. M4 integrates the rest. The owner wants "a successful, addicting little game": think as a new player on a phone, a skilled score chaser, a performance engineer on a mid-range phone, and the next agent who extends your code.
Docs (authoritative, read from your worktree): ${WT}/docs/SCHEDULE.md (read first), docs/DESIGN.md, docs/TECH.md (§4 is the FROZEN contract in src/core/), docs/ROADMAP.md (M4 scope and acceptance), docs/core-requests.md (hooks, exports and invariants from every package: grep it for the modules you touch and read those entries). The G1 final report and the orchestrator's M4 notes are in ${HANDOFFS}: read the orchestrator notes at its top completely and grep the rest for your track.

WHERE YOU WORK: only in the git worktree ${WT} on local branch pkg/${t} (created from DEV at tag m1, npm ci done). Never edit files in ${REPO} or in other worktrees (another agent works in parallel on another track). Commit early and often on pkg/${t} with clear messages ending with exactly these two trailer lines:
${TRAILERS}
Never git push, merge, rebase onto, or check out other branches. Never put a model name in code, comments, docs or commits.

YOUR PORT is ${T.port}: run every dev/preview/e2e/shots command with PORT=${T.port}. Environment: 4 CPU cores shared with the other agent: vitest --maxWorkers=2, Playwright --workers=1, run heavy suites only when needed (real-time e2e tests can flake under load: rerun alone before judging). Chromium for Playwright is preinstalled (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers; never run 'playwright install'). Throwaway scripts and screenshots go in ${SCR}/${t}/.

OWNERSHIP: you may edit ONLY: ${T.owns}, plus appending to an "M4 ${t.toUpperCase()}" section of docs/core-requests.md and the M4 rows you need in docs/ (note them). src/core/ changes: additive only, filed in your section for the gate to apply (use local extension types meanwhile). No new dependencies. npm run dev must keep working at every commit. Never weaken an existing gate threshold or test.

DEFINITION OF DONE: npm run typecheck, lint, test -- --maxWorkers=2 pass; npm run test:bots quick suite passes; PORT=${T.port} npm run test:e2e -- --workers=1 passes (both projects); determinism and golden hashes unchanged unless intended and explained; every tunable in its config file (DESIGN §22); visual work LOOKED at (Read the PNGs).
` + DISCIPLINE
}

const SEV = `Return a prioritized list: BLOCKER / MAJOR / MINOR. Each item: exact file/symbol, evidence (command output, measured number, screenshot path or code reference), and the concrete fix. Say explicitly which acceptance items you verified as passing. Max ~1000 words.`

phase('Implement')
const results = await pipeline(
  tracks,
  (t) => agent(common(t) + `
${TRACKS[t].brief}

Work plan: read the docs sections and the existing code you build on, plan, then implement in small committed steps with tests alongside. Self-review at the end against every acceptance item and fix what fails. Check \`git diff --stat m1..HEAD\` lists only paths you own.

Return (final message): a hand-off of <= 450 words: what is done, exact verify commands, measured numbers for each acceptance item, what is stubbed, known issues, core requests filed, wiring the gate must do, paths touched.`, { label: 'impl:' + t, phase: 'Implement' }),

  (impl, t) => agent(common(t) + `
You are an INDEPENDENT, SKEPTICAL REVIEWER for track ${t}. Another agent just implemented it in /home/user/wt/${t}; its hand-off is below, but verify everything yourself. Do NOT edit tracked files (throwaway files only in ${SCR}/${t}-review/). The track brief was:
${TRACKS[t].brief}

Check at least: every acceptance item by running it; ownership (\`git diff --stat m1..HEAD\` within ${TRACKS[t].owns}); quality against DESIGN/TECH (numbers match the design? tunables in configs? deterministic? per-frame allocations or layout reads?); what a real player hits on a real phone (iOS Safari and Android Chrome behaviour, installed PWA, notch/safe areas, audio unlock, back swipe); what will break when merged with the other track at the M4 gate. LOOK at screenshots; for XP play a fresh-profile first session with real touch and judge it as a new player.

===== IMPLEMENTER HAND-OFF =====
${impl}

${SEV}`, { label: 'verify:' + t, phase: 'Verify' }).then(review => ({ impl, review })),

  (r, t) => agent(common(t) + `
${TRACKS[t].brief}

${RESUMED.includes(t) ? RESUME_NOTE(t) : ''}You are finishing track ${t}. It was implemented (hand-off below) and an independent reviewer reported issues (below). Re-check each issue yourself (reviewers can be wrong); fix every real BLOCKER and MAJOR, and the MINORs that are cheap or matter to players. Re-run the full definition of done and the acceptance checks; look at the visuals again. Commit on pkg/${t}.

Return (final message) the FINAL hand-off for the M4 gate agent, <= 500 words: what is done, exact verify commands, measured acceptance numbers, what is stubbed, known issues, core requests (what the gate must apply), wiring the gate must do in the other track's files, issues fixed vs rejected (with reasons).

===== IMPLEMENTER HAND-OFF =====
${r.impl}

===== REVIEWER REPORT =====
${r.review}`, { label: 'fix:' + t, phase: 'Fix' }).then(final => ({ track: t, review: r.review, final })),
)

const done = results.filter(Boolean)
if (done.length < tracks.length) log(`only ${done.length}/${tracks.length} tracks finished: the gate merges what exists`)
const HAND = done.map(r => `===== FINAL HAND-OFF: ${r.track} =====\n${r.final}`).join('\n\n')

const GCOMMON = `You are working on DUSKLANE, an original mobile-first (portrait, one-thumb) isometric endless street-skating web game (TypeScript + Vite + Three.js, procedural everything, sunset lo-fi). The owner wants "a successful, addicting little game" that does not feel 2D.
Docs (authoritative): ${REPO}/docs/SCHEDULE.md, DESIGN.md, TECH.md (§4 frozen contract, §11.6 gates), ROADMAP.md (M4 scope and acceptance), docs/core-requests.md. The G1 report and M4 notes: ${HANDOFFS}.
Repo: ${REPO} on branch ${DEV} (DEV). You are the integrator (INT): you may edit anything; keep src/core/ changes additive and documented in TECH §4; never weaken a gate threshold or test. Commit with clear messages ending with exactly:
${TRAILERS}
Never put a model name in code, docs or commits. Do NOT git push. Use PORT=5173. 4 CPU cores: vitest --maxWorkers=2, Playwright --workers=1; check ps/uptime for stray vite/chromium/vitest processes before timing anything. Chromium preinstalled (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers; never 'playwright install'). Scratch files in ${SCR}/.
` + DISCIPLINE

phase('Gate')
const gate = await agent(GCOMMON + `
YOUR JOB: the M4 gate. Two tracks were built in parallel worktrees from tag m1: pkg/xp (/home/user/wt/xp: onboarding, juice, run flow, analytics) and pkg/pl (/home/user/wt/pl: PWA, single-file, size, perf). Their final hand-offs are below.
1. Merge into DEV with git merge --no-ff: pkg/xp then pkg/pl. Resolve conflicts carefully; typecheck + unit tests after each merge.
2. Apply the filed core requests (additive; TECH §4; mark applied @M4 or rejected with a reason) and every wiring step the hand-offs ask (e.g. the update toast from pwa.ts onUpdate, settings reaching perf tiers, analytics perf_tier_change, layout-read fixes).
3. Check every ROADMAP M4 acceptance item on the merged DEV with evidence: the fresh-profile first run (hints in order, trench crash rewinds, ends at exactly Level 2 for a run >= 30 s, the crate reveals a Rare skater, "Equip now?" works); crash -> fresh tap -> new run <= 1.0 s and an early tap ignored, Results path <= 3.0 s; all e2e specs on mobile and desktop (incl. pwa.spec, single.spec, flow/onboarding/analytics specs); the gate bot suite (npm run test:bots); the size check; offline reload, HTML timeout fallback, update toast on the Title; single-file makes no network requests.
4. Full gates (TECH §11.6): typecheck, lint, test, test:bots, build, build:single, test:e2e (both projects), shots (every mode, LOOK at the PNGs), size, perf budgets per area at the plateau.
5. Play it: a fresh-profile first session with real touch at 390x844, a 3-minute run, pause/resume, background the tab, retry, shop, crate; the keyboard at 1280x800; the single-file build opened from file:// with no network. Look at the screenshot strips.
6. Commit and git tag -f m4.
Return a gate report (<= 700 words): merges, core requests, wiring, each M4 acceptance item and each gate with evidence, what you saw playing (paths), remaining issues.

${HAND}`, { label: 'gate:m4', phase: 'Gate' })

phase('Review')
const LENSES = [
  { key: 'first', prompt: `REVIEW LENS: THE FIRST SESSION AND THE "ONE MORE RUN" LOOP on a phone. Clear storage and play runs 1-5 yourself through Playwright with real touch at 390x844 (isMobile, hasTouch; __skate.pointer() traces for fast gestures if CDP touch moves arrive late) and the keyboard at 1280x800. Judge as a new player: does the game explain itself in the first 40 s without text walls, are hints timed and placed right (never over the look-ahead), does the first crash teach, is the instant retry really instant (measure), does the crash slow-mo / BAILED / cause line feel good and not slow, do juice cues (haptic intents, punch, stamps, New Ground, SET BANKED!, chevron flash) land at the right tick and respect Settings, does the first crate feel exciting, is progress visible (XP, coins, next goal), would you play run 6? Check pause/resume, backgrounding, back gesture and landscape auto-pause. Concrete fixes with config numbers.` },
  { key: 'release', prompt: `REVIEW LENS: RELEASE PLATFORM QUALITY. Verify independently: the PWA (manifest fields, icons at every size and maskable, apple-touch-icon and iOS meta, standalone portrait, theme colours; the SW precache list matches the build, HTML network-first 2.5 s timeout, offline reload, update flow, no SW in iframes/single/?nosw=1, no stale-cache trap after a deploy); the single-file build (opens from file:// with zero network requests, fonts inlined, size); bundle size and its contributors against the TECH §8.4 row; boot time to TAP TO ROLL; perf budgets per area at the plateau (calls, tris, chunk build p95 single builds, sim and gen benches, heap and geometry counts flat over 3 minutes, no per-frame allocations, no layout reads during runs); Wake Lock and fullscreen behaviour; audio unlock paths; safe areas and notch; no console errors or warnings in a 3-minute run; the GitHub Pages readiness (relative base path, a deploy workflow if present). Concrete fixes.` },
  { key: 'gate', prompt: `REVIEW LENS: GATE CHECKLIST AND INTEGRATION CORRECTNESS. Re-run every gate item (TECH §11.6 incl. npm run test:bots, both e2e projects, shots modes, size) and every ROADMAP M4 acceptance item on DEV. Check the merges kept both tracks' work and tests (git diff pkg/xp and pkg/pl against DEV for owned folders), core/ changes are additive and documented, lint boundaries, no gate thresholds or tests weakened since m1 (git diff m1..HEAD on tests/ and configs), determinism (replay hash identical across processes; golden chunk hashes unchanged or explained), analytics events vs DESIGN §21 (every event and property, opt-out), save compatibility with an m1 save (migration), settings intents actually change behaviour.` },
]
const reviews = await parallel(LENSES.map(l => () => agent(GCOMMON + `
You are an INDEPENDENT SKEPTICAL REVIEWER of the M4 gate on DEV (tag m4). Do NOT edit tracked files; scratch files only in ${SCR}/review-${l.key}/. Verify, do not trust the report below. Each track already had its own independent reviewer and fix stage (their final hand-offs say what was verified): do not re-verify track-internal items the merge did not touch; spend your effort on what only shows up on the merged build (interactions between tracks, the acceptance list, regressions) and on your lens.
${l.prompt}

===== M4 GATE REPORT =====
${gate}

${SEV}`, { label: 'review:' + l.key, phase: 'Review' })))

phase('Final')
const fixed = await agent(GCOMMON + `
You are the integrator finishing the M4 gate on DEV. The gate report and three independent reviews are below. Re-check each issue yourself (reviewers can be wrong); fix every real BLOCKER and MAJOR and the MINORs that matter to players or are cheap (configs first). Re-run the full gates and the M4 acceptance list, play it again, look at the screenshots again, commit, and git tag -f m4.
Return the FINAL M4 report (<= 700 words): what a player experiences now (first session, skilled play, install/offline), every gate and acceptance item with evidence, issues fixed vs rejected (with reasons), known issues for M5 (playtest/economy tuning, crash heatmap, visual polish, feel checklist, stretch content, release), and what the next agents must know.

===== M4 GATE REPORT =====
${gate}

===== REVIEW: FIRST SESSION =====
${reviews[0]}

===== REVIEW: RELEASE PLATFORM =====
${reviews[1]}

===== REVIEW: GATE CHECKLIST =====
${reviews[2]}`, { label: 'final:m4', phase: 'Final' })

return { tracks: done.map(r => ({ track: r.track, final: r.final })), gate, reviews, fixed }
