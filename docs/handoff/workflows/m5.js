export const meta = {
  name: 'dusklane-m5',
  description: 'M5 playtest and polish: tuning, content and visual-polish tracks in parallel worktrees, then the release gate (release bots, checklist, Pages workflow, README) and tag v1.0',
  phases: [
    { title: 'Implement', detail: 'TN tuning, CT content, VP visual polish' },
    { title: 'Verify', detail: 'independent skeptical reviewer per track' },
    { title: 'Fix', detail: 'apply verified issues, hand-off' },
    { title: 'Release', detail: 'merge, release checklist, full gates' },
    { title: 'Review', detail: 'new player + art director + release checklist' },
    { title: 'Final', detail: 'fix verified issues, tag v1.0' },
  ],
}

const REPO = '/home/user/isoskate'
const DEV = 'claude/isometric-skateboarding-game-0b1x6h'
const SCR = '/tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/m5'
const HANDOFFS = '/tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/m5-handoffs.txt'
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
  tn: {
    port: 5193,
    owns: `src/world/gen/gen.config.ts (every value except the weight entries CT adds for new templates), src/world/gen/lesson.ts and the Roll-out, src/tricks/score.config.ts, src/meta/economy.config.ts, src/core/tuning.ts (only with the full bot suite re-run, documented), src/debug/bots/ (new average-bot profile), tests/bots/, scripts/bot-report.mjs, new scripts/playtest.mjs and scripts/heatmap.mjs, tests/unit/{gen,tricks,meta,bots}/ config tests, artifacts/`,
    brief: `TRACK TN (ROADMAP M5: automated playtests, economy and score tuning, crash heatmap, feel checklist numbers).
Deliver:
- PLAYTEST BOTS: the trick bot and an "average bot" profile (the trick bot at 50 % greed with 0.35 s reaction) over 100 seeds; scripts/playtest.mjs reports run length, score, coins, XP, combos, tricks used, areas reached, crash causes.
- ECONOMY TARGETS (DESIGN §14.1): an average run of about 2.5 min, 25-40k score, 85-130 coins; check the runs-to-first-purchase, the level pace (onboarding cap runs 1-3 at Levels 2/3/4), crate pity and daily gift against DESIGN §14-16. Tune score.config, gen.config and economy.config (never tuning.ts without the full bot suite).
- CRASH HEATMAP (scripts/heatmap.mjs) from bot data (and the analytics crash event shape): no single hazard kind may cause > 25 % of safe-bot near-crashes (closest approaches) or > 25 % of myopic-bot crashes; fix with gen weights and placement, not by removing kinds.
- FEEL CHECKLIST (measure with __skate traces and bots, then tune): the first grind happens <= 6 s into every run; the first combo bank happens within 15 s on the Lesson Line; about 40-50 % of flat-ollie flips at typical timing land Perfect; trick elements and required actions per 10 s inside DESIGN §11 targets (+-25 %) at every phase while every bot gate stays green.
- Keep every gate green: npm run test:bots full gate suite, plus npm run test:bots -- --release on fresh seeds once at the end (safe 200 + 200, thumb 50).
The CT track adds the non-v1 templates in parallel (it appends their weight entries to gen.config.ts): do not edit src/world/gen/templates/; the VP track polishes visuals and UI: do not edit render/ui/skater files. Re-tune after you see CT's templates only at the release gate (list what to re-check in your hand-off).`,
  },
  ct: {
    port: 5194,
    owns: `src/world/gen/templates/ (new non-v1 templates; edit existing ones only to fix bugs), src/world/gen/props/ (only if a prop builder a new template needs is missing), the weight entries for the new templates appended as one marked block in src/world/gen/gen.config.ts, tests/unit/gen/ template tests, golden chunk hashes (regenerated, explained)`,
    brief: `TRACK CT (ROADMAP M5 stretch, first item): the non-v1 templates of DESIGN §10.4, for variety in long runs (a run must never feel like the same few streets).
Deliver every non-v1 template that does NOT need movers (movers are deferred, DESIGN §10.9: skip DT_CROSSWALK, SB_BACKOUT, IN_FORKLIFT and any other mover template), exactly as DESIGN §10.4 describes (tier, length, layout, trick line, safe line, landmark), using only PropKinds from DESIGN §10.3 that already have prop builders and render kits. Each new template must pass the validator in every placement the generator can choose, carry trick-line coins (share >= 75 %), respect R_MIN, A1-A6 and the forbidden band, and keep generation p95 <= 3 ms (production-bundle bench). Add each template's weight in one marked block in gen.config.ts so area variety rises without raising the S_GATE share. Prove with tests per template (validates at every tier it claims, coins on trick lines, safe line exists for the safe and myopic bots) and the full gate bot suite green (safe 0 crashes, conformance 0, thumb 0, myopic median >= 4 min, straight <= 20 s / 10 s, static asserts). LOOK at screenshots of each new template in its area (__skate.previewArea / start({seed, startT}) or a seeded placement) at 390x844 and judge it as a level designer: does it invite a line worth chaining, is it readable at speed?
The TN track tunes gen.config values in parallel: touch only your marked block there. The VP track owns render/: if a prop looks wrong inside a new template, list it for the gate instead of editing render code.`,
  },
  vp: {
    port: 5195,
    owns: `src/world/render/, src/gfx/, src/vfx/, src/skater/, src/content/ (cosmetic fx only; never rename or remove items), src/ui/, src/game/ only for the live title attract run and camera decisions, scripts/shots.mjs, tests/unit/{render,vfx,gfx,skater,ui,content}/, tests/e2e/{wa,ui}.spec.ts`,
    brief: `TRACK VP (ROADMAP M5: visual polish, layout feel checklist, the camera decisions, and the visual stretch items): make every screenshot sell the game.
Deliver:
- VISUAL POLISH: take screenshots of all four areas, every gateway blend, cosmetics sheets and every UI screen (390x844, 390x664, 320x568, 1280x800) and review them as a demanding art director against DESIGN §17/§18. Fix readability issues FIRST (hazard vs grind vs ollie, Neon inverted hazards, top speed), then cohesion (sunset lo-fi palette, each area instantly distinct, portrait unmistakably 3D: camera-facing faces, overhangs, raking shadows, contact shadows, layered skyline), then charm (street details, small animated life that never distracts). shots --contrast must keep passing on every frame.
- LAYOUT FEEL CHECKLIST: nothing important sits in the bottom 22 % of the screen; popups never cover the look-ahead zone for > 0.5 s (measure with __skate traces); HUD readable at 320 px.
- DECISIONS (DESIGN §23): keep portrait yaw 0 or try <= 4 deg; keep the skater anchor at 74 % or move it to 70 %. Try both with screenshots and a short playtest, keep the better one, record a DESIGN decision row with the reason; look-ahead must stay >= 2.5 s on every viewport (the framing solver test must pass).
- STRETCH (in this order, each only when the previous is done and everything is green): bespoke cosmetic fx for Legendary items; the live title attract run (a bot run behind the Title at 30 fps that never affects saves or analytics); gamepad support (standard mapping, optional).
The TN track tunes configs and bots, the CT track adds templates in parallel: do not edit world/gen/, tricks/, meta/ configs or bots.`,
  },
}

const tracks = (Array.isArray(args) ? args : (args && args.tracks) || ['tn', 'ct', 'vp']).filter(t => TRACKS[t])
const RESUMED = (args && !Array.isArray(args) && args.resumed) || []
const RESUME_NOTE = (t) => `
RESUMING AFTER AN INTERRUPTION: a previous agent for track ${t} was working in /home/user/wt/${t} when the machine restarted, and it was killed mid-task. Its partial work is still there (git log --oneline m4..HEAD, git status, git diff). Inspect that work FIRST: keep and finish what is sound, revert what is broken that you cannot finish. Stray dev servers or browsers may still hold your port (free PORT=${TRACKS[t].port} if needed, touch no other port).
`

function common(t) {
  const T = TRACKS[t]
  const WT = '/home/user/wt/' + t
  return `You are working on DUSKLANE, an original mobile-first (portrait, one-thumb) isometric endless street-skating web game: TypeScript + Vite + Three.js, procedural everything, sunset lo-fi mood. Milestones up to M4 are merged (tag m4): the complete game with tricks and scoring, 4 areas and gateways, bots, world art and VFX, skater cosmetics, audio, every screen, economy, save, onboarding, juice, run flow, analytics, PWA and the single-file build. M5 is playtest and polish before v1.0. The owner wants "a successful, addicting little game" that does not feel 2D: think as a new phone player, a skilled score chaser, an art director, and the next agent.
Docs (authoritative, read from your worktree): ${WT}/docs/SCHEDULE.md, DESIGN.md, TECH.md (§4 frozen contract), ROADMAP.md (M5 scope and release checklist), docs/core-requests.md (grep it for the modules you touch and read those entries). The M4 final report and the orchestrator's M5 notes are in ${HANDOFFS}: read the orchestrator notes at its top completely and grep the rest for your track.

WHERE YOU WORK: only in the git worktree ${WT} on local branch pkg/${t} (created from DEV at tag m4, npm ci done). Never edit files in ${REPO} or other worktrees (two other agents work in parallel). Commit early and often on pkg/${t} with clear messages ending with exactly:
${TRAILERS}
Never git push, merge, rebase onto, or check out other branches. Never put a model name in code, comments, docs or commits.

YOUR PORT is ${T.port}: use PORT=${T.port} for every dev/preview/e2e/shots command. 4 CPU cores shared by three agents: vitest --maxWorkers=1 or 2, Playwright --workers=1, the full bot suite only when needed (it is slow; develop with small seed counts). Real-time e2e tests can flake under load: rerun alone before judging. Chromium preinstalled (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers; never 'playwright install'). Throwaway files go in ${SCR}/${t}/.

OWNERSHIP: you may edit ONLY: ${T.owns}, plus appending to an "M5 ${t.toUpperCase()}" section of docs/core-requests.md and the DESIGN decision rows your work needs (note them). src/core/ changes: additive only, filed for the gate. No new dependencies. Never weaken a gate threshold or test. npm run dev must keep working at every commit.

DEFINITION OF DONE: npm run typecheck, lint, test pass; npm run test:bots gate suite passes; PORT=${T.port} npm run test:e2e -- --workers=1 passes (both projects); shots --contrast passes; determinism holds (golden hashes changed only when intended and explained); every tunable in its config file; visual work LOOKED at.
` + DISCIPLINE
}

const SEV = `Return a prioritized list: BLOCKER / MAJOR / MINOR. Each item: exact file/symbol, evidence (command output, measured number, screenshot path or code reference), and the concrete fix. Say explicitly which acceptance items you verified as passing. Max ~1000 words.`

phase('Implement')
const results = await pipeline(
  tracks,
  (t) => agent(common(t) + `
${TRACKS[t].brief}

Work plan: read the docs and the code you build on, measure the current state first (numbers and screenshots), then improve in small committed steps with tests, measuring after each. Self-review against every item at the end. Check \`git diff --stat m4..HEAD\` lists only paths you own.

Return (final message): a hand-off of <= 450 words: what is done, exact verify commands, before/after numbers, known issues, core requests filed, wiring or re-checks the release gate must do, paths touched.`, { label: 'impl:' + t, phase: 'Implement' }),

  (impl, t) => agent(common(t) + `
You are an INDEPENDENT, SKEPTICAL REVIEWER for track ${t}. Another agent just worked in /home/user/wt/${t}; its hand-off is below, but verify everything yourself. Do NOT edit tracked files (throwaway files only in ${SCR}/${t}-review/). The track brief was:
${TRACKS[t].brief}

Check at least: every item by running or measuring it; ownership (\`git diff --stat m4..HEAD\` within ${TRACKS[t].owns}); that no gate or test was weakened; that tuning did not make the game worse for a new player or a skilled one (play it with real touch at 390x844); for visuals LOOK at the screenshots as a demanding art director; what will break when merged with the other two tracks.

===== HAND-OFF =====
${impl}

${SEV}`, { label: 'verify:' + t, phase: 'Verify' }).then(review => ({ impl, review })),

  (r, t) => agent(common(t) + `
${TRACKS[t].brief}

${RESUMED.includes(t) ? RESUME_NOTE(t) : ''}You are finishing track ${t}. It was worked on (hand-off below) and an independent reviewer reported issues (below). Re-check each issue yourself (reviewers can be wrong); fix every real BLOCKER and MAJOR, and the MINORs that matter to players or are cheap. Re-run the definition of done; look at visuals again. Commit on pkg/${t}.

Return (final message) the FINAL hand-off for the release gate agent, <= 500 words: what is done, exact verify commands, before/after numbers, known issues, core requests, re-checks the gate must do after merging all three tracks, issues fixed vs rejected (with reasons).

===== HAND-OFF =====
${r.impl}

===== REVIEWER REPORT =====
${r.review}`, { label: 'fix:' + t, phase: 'Fix' }).then(final => ({ track: t, review: r.review, final })),
)

const done = results.filter(Boolean)
if (done.length < tracks.length) log(`only ${done.length}/${tracks.length} tracks finished: the release gate merges what exists`)
const HAND = done.map(r => `===== FINAL HAND-OFF: ${r.track} =====\n${r.final}`).join('\n\n')

const GCOMMON = `You are working on DUSKLANE, an original mobile-first (portrait, one-thumb) isometric endless street-skating web game (TypeScript + Vite + Three.js, procedural everything, sunset lo-fi). The owner wants "a successful, addicting little game" that does not feel 2D; they will check it in the morning on their phone.
Docs (authoritative): ${REPO}/docs/SCHEDULE.md, DESIGN.md, TECH.md (§4 frozen contract, §11.6 gates), ROADMAP.md (M5 scope and the release checklist), docs/core-requests.md. The M4 report and M5 notes: ${HANDOFFS}.
Repo: ${REPO} on branch ${DEV} (DEV). You are the integrator (INT): you may edit anything; keep src/core/ changes additive and documented; never weaken a gate threshold or test. Commit with clear messages ending with exactly:
${TRAILERS}
Never put a model name in code, docs or commits. Do NOT git push and do not touch GitHub settings. Use PORT=5173. 4 CPU cores: vitest --maxWorkers=2, Playwright --workers=1; check ps/uptime for stray processes before timing anything. Chromium preinstalled (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers; never 'playwright install'). Scratch files in ${SCR}/.
` + DISCIPLINE

phase('Release')
const gate = await agent(GCOMMON + `
YOUR JOB: the RELEASE gate (ROADMAP M5 release checklist). Three tracks were built in parallel worktrees from tag m4: pkg/tn (/home/user/wt/tn: tuning, playtest bots, heatmap), pkg/ct (/home/user/wt/ct: non-v1 templates), pkg/vp (/home/user/wt/vp: visual and UI polish, camera decisions). Their final hand-offs are below.
1. Merge into DEV with git merge --no-ff: pkg/tn, pkg/ct, pkg/vp. Resolve conflicts carefully (gen.config.ts: keep TN's values and CT's marked block); typecheck + unit tests after each merge.
2. Re-tune after the merge where the tracks interact: with CT's templates in, re-run TN's playtest, heatmap and density numbers and adjust weights so the economy targets, the heatmap rule and DESIGN §11 density (+-25 %) hold, every bot gate stays green and the S_GATE share does not rise.
3. Release checklist with evidence: all gates pass; npm run test:bots -- --release on fresh seeds (safe 200 + 200, thumb 50); the owner's question demonstrably answered in artifacts/bots.json (0 safe-bot crashes at the plateau, myopic median survival >= 4 min, thumb 0 crashes and 0 unintended tricks, straight bot dies 100 % by t <= 20 s, look-ahead >= 2.5 s on every viewport incl. toolbars and safe areas); the DESIGN §2 text matches the shipped numbers (update the text, not the numbers, if they drifted for good reasons); every name original (GAME_NAME, skaters, brands, Neon sign words from the reviewed list; grep for real brand names); NullProvider in production, no ad UI visible, hooks documented in TECH §4.10.
4. Pages and docs: add .github/workflows/pages.yml (build with npm ci + npm run build on push to main and on workflow_dispatch, upload dist with actions/upload-pages-artifact, deploy with actions/deploy-pages; Pages permissions; Node 22) and make sure the build works under a sub-path (relative base). Write README.md: what the game is, controls (touch and keyboard), how to run, test and build, the single-file build, how to enable GitHub Pages (Settings -> Pages -> Source: GitHub Actions, then merge to main or run the workflow), and the MORNING CHECK for the owner (open the Pages URL or the single-file build on a phone in portrait; Add to Home Screen; play the Lesson Line; reach Neon at about 2:02; open a crate; try the desktop keyboard). Write release notes (docs/RELEASE.md) with the bots numbers and the known issues, including that a real-device pass on iPhone and Android still needs a human.
5. Full gates: typecheck, lint, test, test:bots, build, build:single, test:e2e (both projects), shots (every mode, LOOK at the PNGs), size, perf budgets per area.
6. Play it as the owner would: a fresh profile on 390x844 touch through Lesson Line, a run to Neon, a crate, the shop, the keyboard at 1280x800, the single-file build from file://. Look at the screenshot strips.
7. Commit and git tag -f v1.0.
Return a release report (<= 700 words): merges, re-tuning numbers, each release checklist item with evidence, what you saw playing (paths), remaining issues.

${HAND}`, { label: 'gate:release', phase: 'Release' })

phase('Review')
const LENSES = [
  { key: 'player', prompt: `REVIEW LENS: A NEW PLAYER AND A SKILLED PLAYER ON A PHONE. Clear storage, play runs 1-6 with real touch at 390x844 (isMobile, hasTouch; __skate.pointer() traces for fast gestures if CDP moves arrive late), then skilled play at the plateau (start({startT: 160})). Is it fun in the first 60 seconds, is every crash deserved and readable, do streets invite lines (count trick elements per 10 s you meet), is the score feedback juicy and immediate, is the economy generous enough that you buy something in the first few runs, would you play again tomorrow (daily gift, goals, crates)? Anything confusing, unfair, slow or predatory? Concrete fixes with config numbers.` },
  { key: 'art', prompt: `REVIEW LENS: ART DIRECTOR AND STORE-PAGE SCREENSHOTS. Take screenshots of all four areas and blends (390x844, 1280x800), the Title, Locker, Shop, Crate reveal, Results, Settings at 390x844 and 320x568. Would these screenshots make someone install the game? Is portrait unmistakably 3D and street-like? Are hazards / grind edges / ollie obstacles readable at a glance in every area at top speed? Is each area distinct and cohesive in the sunset lo-fi palette, Neon original (no real brands, landmarks, copied signs or anime/game references)? UI warm, chunky, readable, no overlaps? Rendering bugs? Concrete fixes (file/symbol/number).` },
  { key: 'checklist', prompt: `REVIEW LENS: RELEASE CHECKLIST AND REGRESSIONS. Re-run every gate (TECH §11.6, npm run test:bots incl. --release, both e2e projects, shots modes, size, perf budgets) and every ROADMAP M5 release checklist item on DEV. Check no gate threshold or test was weakened since m4 (git diff m4..HEAD on tests/, scripts/ and configs), the merges kept all three tracks' work, determinism (replay hash across processes, golden hashes explained), save compatibility with an m4 save, the Pages workflow (valid YAML, correct actions and permissions, relative base path; build it locally into a sub-path and serve it), README and RELEASE.md accuracy (every command in them works), and the single-file build opening from file:// with zero network requests.` },
]
const reviews = await parallel(LENSES.map(l => () => agent(GCOMMON + `
You are an INDEPENDENT SKEPTICAL REVIEWER of the v1.0 release candidate on DEV. Do NOT edit tracked files; scratch files only in ${SCR}/review-${l.key}/. Verify, do not trust the report below. Each track already had its own independent reviewer and fix stage (their final hand-offs say what was verified): do not re-verify track-internal items the merge did not touch; spend your effort on what only shows up on the merged build (interactions between tracks, the acceptance list, regressions) and on your lens.
${l.prompt}

===== RELEASE REPORT =====
${gate}

${SEV}`, { label: 'review:' + l.key, phase: 'Review' })))

phase('Final')
const fixed = await agent(GCOMMON + `
You are the integrator finishing the v1.0 release on DEV. The release report and three independent reviews are below. Re-check each issue yourself; fix every real BLOCKER and MAJOR and the MINORs that matter to players or are cheap (configs first). Re-run the full gates and the release checklist, play it again, look at the screenshots again, update README.md / docs/RELEASE.md if anything changed, commit, and git tag -f v1.0.
Return the FINAL release report (<= 700 words): what a player experiences in v1.0 (first session, skilled play, progression, install/offline), every release checklist item with evidence, issues fixed vs rejected, known issues and the post-v1 backlog (movers, Start District picker, real-device pass, monetization provider), and exactly how the owner can play it (Pages steps and the single-file build).

===== RELEASE REPORT =====
${gate}

===== REVIEW: PLAYER =====
${reviews[0]}

===== REVIEW: ART =====
${reviews[1]}

===== REVIEW: CHECKLIST =====
${reviews[2]}`, { label: 'final:v1', phase: 'Final' })

return { tracks: done.map(r => ({ track: r.track, final: r.final })), gate, reviews, fixed }
