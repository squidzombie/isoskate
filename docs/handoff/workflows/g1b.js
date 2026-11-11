export const meta = {
  name: 'dusklane-g1-integrate',
  description: 'Gate G1 part 2: merge the side branches (Locker fix, two-thumb controls, steering feel, run camera), build the owner-approved RECLAIM re-theme (T0, T1 || T2+T5, T3+T4, T6+T7a, T8 cars as main blocker), then one three-lens review, fix, tag m1',
  phases: [
    { title: 'Integrate', detail: 'merge side branches, make them work together, gates' },
    { title: 'Theme', detail: 'RECLAIM: T0 docs/tokens, T1 vehicles+kits || T2 overgrowth+T5 audio, T3 decor+T4 VFX, T6 copy+T7a checks, T8 cars as main blocker' },
    { title: 'Review', detail: 'player feel + art/UI director + gate checklist' },
    { title: 'Fix', detail: 'apply verified issues, tag m1' },
  ],
}

const REPO = '/home/user/isoskate'
const DEV = 'claude/isometric-skateboarding-game-0b1x6h'
const SCR = '/tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/g1b'
const NOTES = '/tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/g1-notes.txt'
const SPEC = '/tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/theme/THEME.md'
const A = args || {}
const TUNE = A.tune || 'The G1 tune report is in the file /tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/g1-tune-report.md: read it (it is short).'
const SIDE = A.side || 'The side-branch final hand-offs (pkg/fix-locker, pkg/ctl, pkg/steer, pkg/cam) are in the file /tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/g1b/side-handoffs-all.md: read it (grep for the branch you are merging when resolving its conflicts).'
const THEME_SUMMARY = A.theme || 'The spec author\'s final summary is in the file /tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/theme/final-summary.md: read it.'
const BRANCHES = A.branches || ['pkg/fix-locker', 'pkg/ctl', 'pkg/steer', 'pkg/cam']
const TRAILERS = `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CeofHDq6PYaWz547ot5x2W`

const DISCIPLINE = `
TOKEN DISCIPLINE (keeps the work and the review just as thorough, at a fraction of the cost; everything you read stays in your context for every later step, so read narrowly):
- Never read DESIGN.md, TECH.md, core-requests.md or the theme spec whole. List headings with grep -n '^#' and read only the sections your task names or that grep shows are relevant (sed -n 'a,bp'). Same for large source files and hand-off files: grep first, then read the range you need.
- Screenshots: measure with scripts first (contrast numbers, sizes, overlap checks, counts, green share). When you need to look, compose a contact sheet (python3 with PIL: related frames side by side, longest side <= 1600 px) and read the sheet, not the single PNGs; batch your looking near the end of a work phase rather than while iterating; never re-read an image you already saw; open one full-size PNG only to inspect a specific defect.
- Command output: always cap it (| tail -n 40, or grep -E 'passed|failed|✘|Error|FAIL'); on a failure read only that test's block. Never cat whole logs, build output or minified files.
- Slow suites (the full npm run test:bots, the full e2e run) at most twice: a baseline only if you need one, and once at the end; iterate with targeted subsets. A real-time e2e failure under load: rerun that test once alone; if it passes, note it and move on.
- Final report within its word limit, no pasted logs.
`

const COMMON = `You are working on DUSKLANE, an original mobile-first (portrait) isometric endless street-skating web game: TypeScript + Vite + Three.js, procedural everything, sunset lo-fi mood. The owner wants "a successful, addicting little game" that does not feel 2D, and playtests it on their phone.
Docs (authoritative; read by section): ${REPO}/docs/DESIGN.md, TECH.md (§4 frozen contract in src/core/, §11.6 gates), ROADMAP.md, docs/core-requests.md. The orchestrator's binding G1 notes (1-17; owner feedback is note 17): ${NOTES}.
Repo: ${REPO} on branch ${DEV} (DEV) unless your task names a worktree. You are the integrator (INT): you may edit anything your task covers; keep src/core/ changes additive and documented in TECH §4 and docs/core-requests.md; never weaken a gate threshold or test. Commit with clear messages ending with exactly:
${TRAILERS}
Never put a model name in code, docs or commits. Do NOT git push. Use PORT=5173 on DEV (worktrees use the port your task names). 4 CPU cores: vitest --maxWorkers=2 (1 when another agent runs in parallel), Playwright --workers=1; check ps/uptime for stray vite/chromium/vitest processes before timing anything (kill only strays, never another live agent's). Chromium preinstalled (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers; never 'playwright install'). Scratch files in ${SCR}/.
` + DISCIPLINE

const OWNER = `OWNER PLAYTEST FEEDBACK (phone): (1) steering on the left thumb, tricks on the right (pkg/ctl); (2) a Locker bug where switching boards changed the skater (pkg/fix-locker); (3) steering kept sliding after a flick (pkg/steer); (4) expected an angled view, maybe closer, some stretches felt like "waiting for the map" (pkg/cam; G1 tune for density); (5) grindable vs not was hard to tell everywhere: one consistent grind signature (G1 tune); (6) Neon decor covered the skate area (G1 tune, the camera's occlusion cure, the theme's Neon cut); (7) APPROVED RE-THEME "RECLAIM": a quiet, peaceful, nature-reclaimed abandoned city, abandoned cars and real objects instead of abstract blockers, overgrowth on buildings and verges, clean skateable streets, no zombies, people or gore, same four areas, lighting, lo-fi vibe and gameplay; (8) gaps across the street should look like jagged cracks you obviously jump; manhole and drain decals were far too large; road arrows did not make sense for direction and position.`

const THEME = `THE RE-THEME (owner-approved, including Phase B "cars as the main blocker", which the owner asked for in their own words: "instead of the weird random shapes that are kind of the blocking parts, it could just be cars"). The final spec is ${SPEC} (headings: §1 Concept and the do-not list, §2 what does NOT change, §3 obstacle mapping incl. §3.3 vehicle builder and §3.4 Phase B, §4 decor mapping, §5 palette and lighting, §6 the four areas, §7 gateways / Roll-out / Title / store frames, §8 audio, §9 copy and naming, §10 cosmetics, §11 performance, §12 implementation plan with work packages T0-T8 and acceptance checks 1-9, Revision notes). Always read §1, §2 and the §12 rows and checks for your work package, then the sections it cites. Binding: obstacle footprints, height classes, top types and hitboxes, the validator and every bot gate, controls, scoring, the camera rules, the contrast gate and the perf budgets; golden OBSTACLE hashes stay identical through T7a (T3 splits the golden test into obstacle and decor chains; only decor re-baselines there) and change once in T8. NAME: the owner chose ISOSKATE as the game's name. A separate brand pass on branch pkg/title renames GAME_NAME, redesigns the logo, fonts and UI style; so in the theme work do NOT change GAME_NAME, the logo, the fonts or the UI style, but write every NEW player-facing string with the name Isoskate where a name appears (never Dusklane), and do not reintroduce Dusklane anywhere new.
THEME SUMMARY FROM THE SPEC AUTHOR: ${THEME_SUMMARY}
OWNER NOTES (8) map to: jagged honest crack lips on every full-width pit / trench / gap kit (T1; the visible lip stays within ~0.1 m of the true collision edge, the plank stays); real-scale manhole (~0.6-0.75 m) and drain (~0.4 x 0.6 m) decals in every area (T2); road arrows that point the way the skater travels, centred in a lane before crossings, never backwards, sideways or on lane lines, fewer if in doubt (T2). Each with before/after crops in a contact sheet.`

phase('Integrate')
const merged = await agent(COMMON + OWNER + `
YOUR JOB: the integration step. DEV holds the four merged P3 packages and the G1 tune work (report below). Side branches were built in parallel from earlier DEV commits, each with its own implementer, independent reviewer and fix stage (final hand-offs below).
1. Merge into DEV with git merge --no-ff, in this order: ${BRANCHES.join(', ')}. Resolve conflicts carefully (tune changed world/render kits, materials, palette, decor, gen.config and docs; pkg/ctl changed src/input/, ui hints and settings, save settings, the thumb bot, labels and touch tests; pkg/steer changed sim kinematics/step/state, core/tuning.ts, sim tests and labels/touch tests (keep both sides of labels.test.ts: ctl's two-thumb cases and steer's rig(steerOnly, tapMs) changes); pkg/cam changed the run camera rig, framing solver, CAMERA tuning, decor occlusion and camera tests; pkg/fix-locker changed ui/screens/showcase.ts and game/app.ts try-ons). Typecheck + unit tests after each merge.
2. Make them work together: two-thumb layout with the steering lead cap / brake / fast thumb (the steer brake thresholds are in metres: confirm they still behave with the two-thumb half screen); both thumb-bot profiles pass; the new camera with the tuned art (grind signature, Neon clutter cure, contrast on every frame); first-run hints on the new camera framing (ghost thumbs and zone cue never over the look-ahead zone; "Tap right to ollie" early enough before the Roll-out barrier); docs consistent with the merged code.
3. Gates with evidence: npm run typecheck, lint, test -- --maxWorkers=2, npm run test:bots -- --maxWorkers=2, build, build:single, test:e2e -- --workers=1 (both projects), npm run shots (default, --contrast, --hud), bundle size.
4. Play it as the owner would (Playwright 390x844 isMobile hasTouch; two simultaneous CDP touch points for steer + trick; __skate.pointer() traces for fast gestures), and the keyboard at 1280x800: steering stops when the thumb lifts, flips with steering, a crash and instant retry, Locker tap-to-equip. One contact sheet of the four areas (portrait + desktop).
5. Commit (no tag). Record the commit hash as the theme base.
Return (<= 600 words): merges and conflicts, what you changed to make them work together, each gate with evidence, the sheet path, remaining issues, and the DEV commit hash.

===== G1 TUNE REPORT =====
${TUNE}

===== SIDE-BRANCH FINAL HAND-OFFS =====
${SIDE}`, { label: 'g1b:integrate', phase: 'Integrate' })

phase('Theme')
const TCOMMON = COMMON + OWNER + '\n' + THEME + '\n'

const t0 = await agent(TCOMMON + `
YOUR JOB: theme work package T0 on DEV (spec §12 row T0): docs (DESIGN §1, §10.3 skin notes, §12.3 Roll-out barrier, §18.1 / 18.4-18.8, §19.1, a §23 decision row), the RECLAIM tokens in world/render/palette.ts, the new core/skins.ts propSkin skin chooser (additive core request), kits/dress.ts dressing-rule helpers with the life-area accounting, and their unit tests. Then prepare two parallel worktrees for T1 and T2+T5 from the new DEV HEAD: git worktree add /home/user/wt/t1 -b pkg/t1 and /home/user/wt/t2 -b pkg/t2 (remove stale ones first if they exist), and in each: ln -sfn ${REPO}/node_modules node_modules. Gates: typecheck, lint, unit tests. Commit.
Return (<= 300 words): what T0 added (APIs the next packages use, with signatures), the DEV commit hash, the two worktrees ready.

===== INTEGRATION REPORT =====
${merged}`, { label: 'g1b:theme:t0', phase: 'Theme' })

const PAR = (wt, port, branch, job) => TCOMMON + `
WHERE YOU WORK: only in the git worktree ${wt} on branch ${branch} (created from DEV after T0; node_modules is a symlink, do not npm install). Another theme agent works in parallel in another worktree on other files; never touch ${REPO} or other worktrees. Use PORT=${port}, vitest --maxWorkers=1, nice -n 10 for builds, tests and browsers. Commit on ${branch}; never merge or push.
T0 REPORT (APIs to use): ${t0}
YOUR JOB: ${job}
Gates in your worktree: typecheck, lint, unit tests (golden OBSTACLE hashes identical), npm run shots -- --contrast (every frame passes), the perf budgets (wa.spec or the Node chunk-build bench), one contact sheet per area reviewed as a demanding art director (portrait 390x844 and 390x664, desktop 1280x800, plateau and a gateway blend). Commit.
Return (<= 450 words): what changed, measured numbers, sheet paths, files touched (for the merge), known issues.`

const [t1, t2] = await parallel([
  () => agent(PAR('/home/user/wt/t1', 5181, 'pkg/t1', `theme work package T1, vehicles and kits (spec §12 row T1, §3 all obstacle kinds, §3.3 the vehicle builder kits/car.ts drawVehicle with its variants and plan-view signature, the dressing rules): every PropKind re-skinned per area under the dressing rules, plus OWNER NOTE (8) jagged honest crack lips on every full-width pit / trench / gap kit (before/after crops). Files: world/render/kits/car.ts (new), shared.ts, downtown.ts, suburbs.ts, docks.ts, neon.ts, common.ts and the chunk builder's isolated-filler flag. Do not edit kits/decor.ts, kits/buildings.ts, textures/, layers.ts or audio/ (T2+T5 own them).`), { label: 'g1b:theme:t1', phase: 'Theme' }),
  () => agent(PAR('/home/user/wt/t2', 5182, 'pkg/t2', `theme work packages T2 render-side overgrowth and T5 audio (spec §12 rows T2 and T5, §4 decor mapping render side, §5, §6, §8): hash-derived roof green, ivy atlas, sun-catch panes, dead and live signs, faded paint, leafy shadow casters, new decal cells, plus OWNER NOTE (8) real-scale manhole and drain decals and road arrows that follow real road logic (before/after crops); then the audio beds and events of §8 (no traffic, calm beds under the music, vehicle thunk, bird flutter) with npm run shots -- --audio (no clipping, no silence). Files: world/render/kits/decor.ts, kits/buildings.ts, textures/decals.ts, textures/signs.ts, textures/ground.ts, layers.ts, audio/mix.config.ts, audio/sfx/ambience.ts, audio/sfx/oneshots.ts. Do not edit the obstacle kits, car.ts or common.ts (T1 owns them).`), { label: 'g1b:theme:t2', phase: 'Theme' }),
])

const t34 = await agent(TCOMMON + `
YOUR JOB on DEV: first merge pkg/t1 and pkg/t2 into DEV (git merge --no-ff; resolve conflicts; typecheck + unit tests; golden obstacle hashes identical). Then theme work packages T3 decor kinds and emission and T4 VFX (spec §12 rows T3 and T4, §4): new decor kinds and params in core/decor.ts via docs/core-requests.md, world/gen/decor.ts emission, gen.config.ts, warmup.ts, the vista once per visit, the Neon sign cut (about 40% fewer signs at |x| < 6, about 70% of the rest lit) and live ratio; split the golden hash test into obstacle and decor chains (only decor re-baselines); vfx critter_emitter, drips, bird and butterfly take-off, petal and leaf rates (critters stay in the side bands, out of the top third). Gates: typecheck, lint, unit tests, shots --contrast, the perf budgets, npm run test:bots (numbers unchanged: footprints did not move), one contact sheet per area. Commit.
Return (<= 450 words): merge result, what changed, numbers, sheet paths, issues.

===== T1 REPORT =====
${t1}

===== T2 + T5 REPORT =====
${t2}`, { label: 'g1b:theme:t3t4', phase: 'Theme' })

const t67 = await agent(TCOMMON + `
TITLE SCREEN CHANGE (owner-approved, built in parallel on branch pkg/title in /home/user/wt/title): the Title becomes Earth floating alone in space with the equipped board slowly spinning, and a dive into Earth that hands over to the run. So do NOT rebuild the street Title diorama in the theme; keep the Title copy (tagline) work. FIRST: if the file /tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/title/BRAND_DONE exists (the Earth title plus the ISOSKATE brand pass: rename, Bungee logo with new colours, new UI colour tokens, all finished on pkg/title), merge pkg/title into DEV (git merge --no-ff; its final hand-off is in /tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/side-handoffs/title.md if present), make its dive land on the new run camera, run its title.spec, and include it in your checks; if BRAND_DONE does not exist, leave pkg/title alone (the orchestrator merges it later) and say so. When you merge it, the brand pass owns GAME_NAME, the logo, fonts and UI colour tokens: keep its side in conflicts there.
YOUR JOB on DEV: theme work packages T6 copy and Title, then T7a Phase A review checks (spec §12 rows T6 and T7a, §7, §9): the §9 nouns in crash cause lines and hints, tagline, loading and empty-state strings, the banned-word test over every player-facing string table, the Locker and Shop backdrops in the new theme (the Title is the Earth scene, see above), a store-frame draft; scripts/shots.mjs --green mode; then run acceptance checks 1-8 of §12 and fix what fails (green share inside each area's band, cream coping the brightest thin line, no flowers on crash objects, nothing bright across the look-ahead zone, golden obstacle hashes identical, bot gate numbers unchanged). Play a fresh-profile first run with two-thumb touch at 390x844 and look at one sheet of the four areas and one of the menu screens. Commit.
Return (<= 450 words): what changed, each check 1-8 with evidence, sheet paths, issues.

===== T3 + T4 REPORT =====
${t34}`, { label: 'g1b:theme:t6t7a', phase: 'Theme' })

const t8 = await agent(TCOMMON + `
FIRST, BEFORE T8: if pkg/title is not yet merged into DEV (git branch --merged shows no pkg/title, or git merge-base --is-ancestor $(cat /tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/title/BRAND_DONE) HEAD fails), merge it now with git merge --no-ff pkg/title. It is the owner-approved Earth-in-space Title with the floating equipped board (constant spin), the dive into the run, and the ISOSKATE brand pass (rename with storage keys kept, Bungee logo with the Earth-O, the Earthlight colour tokens, drawn arrows). Final hand-offs: /tmp/claude-0/-home-user-isoskate/ffbebe5e-682a-582a-baae-7ae01d016c67/scratchpad/side-handoffs/title.md and side-handoffs/brand.md (read their merge notes). Resolve conflicts: the brand side wins on GAME_NAME, the logo, fonts, UI colour tokens and hud.css shared rules (keep DEV's STEER/TRICKS pad blocks, replace the "STEER ↔" character with the brand's .steer-arrow element, then grep for the old ink/paper rgba values per BRAND §4.5); the theme side wins on copy nouns and crash lines (but say Isoskate, never Dusklane); the dive must land on the new perspective run camera (run tests/e2e/title.spec.ts on both projects) and the world warm-up must not disturb the camera rig. Typecheck, lint, unit tests, title.spec, ui.spec and smoke after the merge, and one contact sheet of the Title, a dive frame and the run at 390x844. Commit. Then:
YOUR JOB on DEV: theme work package T8, Phase B: cars as the main blocker (spec §3.4, §12 row T8): the new van_across kind (core/ids.ts additive, its prop builder, its kit through the T1 vehicle builder), parked-row templates, the per-area car-share targets and a car early in every Downtown run, the crash nouns. This changes the generator: keep every fairness rule (validator, A1-A6, R_MIN, look-ahead, decision time), re-baseline the golden OBSTACLE hash once with the reason, and prove with the full npm run test:bots (safe 0 crashes, conformance 0, both thumb-bot profiles 0 crashes and 0 unintended tricks, myopic median >= 4 min, straight <= 20 s / 10 s, trick bot, static asserts, score ratio, combo p95, density within the DESIGN §11 bands) and the production-bundle generation bench (p95 <= 3 ms). Measure the car share of tall blockers per area before/after. Look at one sheet of the four areas at the plateau. Commit.
Return (<= 450 words): what changed, car share before/after, bot gate numbers, bench, sheet path, issues.

===== T6 + T7a REPORT =====
${t67}`, { label: 'g1b:theme:t8', phase: 'Theme' })

const REPORTS = `===== G1 TUNE REPORT =====
${TUNE}

===== INTEGRATION REPORT =====
${merged}

===== THEME T0 =====
${t0}

===== THEME T1 (vehicles, kits) =====
${t1}

===== THEME T2 + T5 (overgrowth, audio) =====
${t2}

===== THEME T3 + T4 (decor, VFX) =====
${t34}

===== THEME T6 + T7a (copy, Title, Phase A checks) =====
${t67}

===== THEME T8 (cars as the main blocker) =====
${t8}`

phase('Review')
const LENSES = [
  { key: 'feel', prompt: `REVIEW LENS: PLAYER FEEL, FAIRNESS AND THE "ONE MORE RUN" LOOP on a phone, with the owner's feedback as the bar. Play through Playwright with real touch at 390x844 isMobile hasTouch (two simultaneous CDP touch points for steer + trick; __skate.pointer() traces for fast gestures), using window.__skate (?debug=1) to observe and jump (start({seed, startT}), previewArea). Judge: do the two-thumb controls feel obvious and direct (stops when the left thumb stops or lifts; a right flick never moves the skater sideways; steer + flip at once)? Does the camera read angled and active with enough look-ahead at the plateau (startT 160+)? Does the reclaimed street invite chaining (count trick elements per 10 s; any "waiting for the map" stretches)? Do cars read as steer-around, cracks as jump, waxed edges as grind, at a glance at top speed? Is the mood peaceful and inviting, not sad or creepy? Fresh-profile runs 1-3, shop prices vs earn rate, nothing predatory. List what most hurts first-session fun and retention, with concrete fixes.` },
  { key: 'look', prompt: `REVIEW LENS: ART DIRECTION, 3D READABILITY AND UI against the RECLAIM spec and DESIGN §17/§18. Take your own screenshots (each area, every gateway blend, 390x844, 390x664, 1280x800; Title, Locker, Shop, Crates, Results, Settings, Pause, Stats at 390x844 and 320x568) and review them as contact sheets: warm and beautiful, not dreary; portrait reads angled and 3D; each area distinct with its own flora and green share; cars read as cars from above; the cream coping is the brightest thin line and appears only on grindables; cracks honest and obviously jumpable; manholes and arrows correct; nothing covers the skate area (Neon especially); nothing on the spec's do-not list; Neon original; UI warm, readable at 320 px, no overlaps, hints clear and out of the look-ahead zone; rendering bugs. Concrete fixes (file/symbol/number).` },
  { key: 'gate', prompt: `REVIEW LENS: GATE CHECKLIST AND INTEGRATION CORRECTNESS. Re-run every gate (TECH §11.6 incl. npm run test:bots with both thumb-bot profiles, both e2e projects, shots --contrast, --hud, --green, --audio, the size number) and the spec §12 acceptance checks 1-8. Check the merges kept every branch's work and tests; core/ changes additive and documented; no gate threshold or test weakened since a5277d9 (git diff on tests/, scripts/ and configs); golden obstacle hashes changed exactly once, in T8, with a reason; determinism (replay hash identical across processes); perf budgets per area at the plateau under the new camera and theme (calls, tris, chunk build p95, sim and gen benches, heap and geometry flat over 3 minutes); save compatibility for the new settings fields; settings intents change behaviour.` },
]
const reviews = await parallel(LENSES.map(l => () => agent(COMMON + OWNER + `
You are an INDEPENDENT SKEPTICAL REVIEWER of gate G1 on DEV (the combined build: integration + RECLAIM theme). Do NOT edit tracked files; scratch files only in ${SCR}/review-${l.key}/. The theme spec is ${SPEC} (read §1, §2 and the parts your lens needs). Each side branch already had its own reviewer: spend your effort on the combined build and your lens. Verify, do not trust the reports below.
${l.prompt}

${REPORTS}

Return a prioritized list BLOCKER / MAJOR / MINOR (file/symbol, evidence, concrete fix), and which items you verified passing. Max ~1000 words.`, { label: 'g1b:review:' + l.key, phase: 'Review' })))

phase('Fix')
const fixed = await agent(TCOMMON + `
You are the integrator finishing gate G1 on DEV. The reports and three independent reviews are below. Re-check each issue yourself (reviewers can be wrong); fix every real BLOCKER and MAJOR and the MINORs that matter to players or are cheap (configs first). Re-run the full gates, play it again with two-thumb touch, look at the contact sheets again, commit, and git tag -f m1.
Return the FINAL G1 report (<= 700 words): what a player experiences now (first session, skilled play, controls, camera, the RECLAIM world), every gate item with evidence, issues fixed vs rejected (with reasons), known issues for M4 (onboarding/Lesson Line hints, juice cross-cuts, run flow, analytics, PWA, single-file, perf pass incl. the boot-time prop library) and M5 (incl. spec T7b: store frames, Japanese-speaking review of Neon shots, name clearance), and what the next agents must know.

${REPORTS}

===== REVIEW: PLAYER FEEL =====
${reviews[0]}

===== REVIEW: ART AND UI =====
${reviews[1]}

===== REVIEW: GATE CHECKLIST =====
${reviews[2]}`, { label: 'g1b:fix', phase: 'Fix' })

return { merged, t0, t1, t2, t34, t67, t8, reviews, fixed }
