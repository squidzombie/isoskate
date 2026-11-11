# Overnight work, 11 Nov 2026: summary for the owner

Branch `claude/magical-mayer-793ib8`, on top of the game branch (`claude/isometric-skateboarding-game-0b1x6h`) plus the hand-off commit. Every change is in its own commit, and `git revert <sha>` undoes one cleanly. I didn't change controls, camera, economy or scoring.

## 1. Cars: "where they stopped"

**Your direction.** "Don't add cars just to add cars. Especially if they always are just on the sides", "the last one on earth skating", "fun and light", "natural looking but obviously thoughtful so it stays interesting as an obstacle".

**What it was.** The hand-off's Phase B put a car at the edge of nearly every anti-straight row (the rows that stop you riding straight forever), in order to hit car-share quotas. Every car showed its rear.

**What it is now:** *everything where it belongs*.
- **Road vehicles.** They stand in their lanes, at the kerb, or waiting at a crossing; a lone car gets its zebra just ahead of it, so it has a reason to be stopped. Two cars only appear where a row closes the whole road, staggered and never touching.
- **Other areas.** Bins, a café set or a bike corral go against the kerb, and street furniture stays on the sidewalk. The Docks have trucks on the dock band and pallets or drums on the apron. Neon has taxis, kei vans and yatai carts.
- **Facing.** Every vehicle faces its own traffic. In the oncoming lane you see headlamps and a grille; going away you see taillights. Hoshimachi (Neon) drives on the left. The cabin sits rearward, so even the roof shows which way a car points.
- **No quotas.** Each 120 m block of street has a mood (quiet, normal or busy). Openings are chosen by how naturally their part of the road closes for that mood, and a short history stops the same scene three times running.
- **Fun and light.**
  - Four new sun-faded paints: cobalt, coral, plum and ochre.
  - Flowers growing in 1 pickup bed in 3, and the tabby still naps on roofs.
  - The yellow centre line is gone from the Suburbs' residential lanes, so a car toward the middle of one reads as stopped in a quiet street. **This one is yours to veto: it's one line in `src/world/gen/decor.ts`.**
- **Fixes on the way.**
  - The van parked across the street now appears only in the Docks, at its loading entrance.
  - The roofs of lifted vehicles go see-through properly (the x-ray screen door).
  - Wheels never sink into a kerb.
  - A rare trick-gate crash was fixed: a kerb grind ran out right before a trench.

**Numbers (24 seeds × 3.2 km):**

| | Downtown | Suburbs | Neon |
|---|---|---|---|
| Wrong facing | 0 | 0 | 0 |
| Rows with a vehicle, quiet / busy blocks | 59 / 73 % | 65 / 83 % | 27 / 74 % |
| Rows with two vehicles | 22 % | 18 % | 14 % |
| Car toward the middle of the road | 12 % | 30 % | 1 % |
| Street furniture standing in the road | 4 % | 4 % | 2 % |

**What I'm still not happy with** (all are proposals, since they touch gameplay):
1. **Two cars side by side.** In about 1 row in 5 two cars stand in opposite lanes, 5–14 cm apart.
   - Tonight's last commit moves the second car ≥ 2.2 m away when it isn't on your line. Abreast pairs drop by 20 % in Downtown and 16 % in the Suburbs.
   - The rest are on your line. Their 1.2 m stagger sets how early you must start the dodge.
   - Option: allow 2.2 m there too. That makes those rows a bit harder (about 0.12 s less time).
   - Option: fewer two-car rows, with a kerb kit piece instead.
2. **Cars in most rows.** Downtown has a car in about 60–75 % of rows. Geometry decides more than mood here: a row must close the whole 9 m corridor except the openings, and a 6 m road only closes naturally with a car.
   - The real lever is fewer rows. Rows are about half of a run, which is also why trick density is low; see §4.
3. **The Suburbs put a car toward the middle in 30 % of rows.** Without the centre line it reads fine to me in the screenshots, but you should see it moving.

**Gates** (re-run after every change tonight). Unit tests (855), all 30 bot gate tests and the contrast gate are green, with lowest hazard contrast 2.86 against a 2.5 floor. Generation runs at p95 2.2 ms against a 3 ms budget. Golden hashes were re-baselined, with the reason in `tests/unit/gen/gen.test.ts`.

## 2. Crate opening

Before, the beam had a hard bottom edge. The box simply vanished, the result appeared with little ceremony, and the layout jumped when the buttons came in. Now:
- **Shaking.** Light leaks from under the lid as you shake it: warm white on tap 1, then the rarity colour on tap 2 (a tease). Tap 3 opens it.
- **Opening.** The box squashes and pops as the lid flies, with a flash ring from the seam.
- **Light.** A soft rarity-coloured glow, plus slow sun rays turning behind the item (on brand with Earthlight).
- **The item.** It lands with a small overshoot while sparkles burst out: 8 for Common, 12 for Rare, 16 in gold and pink for Legendary. Rare and up get one shine sweep across the card, and the coin total counts up.
- **Layout.** Nothing jumps any more, and "Open another (2)" no longer clips.
- **Reduce Motion.** It is honoured from both the OS and your in-game setting; colours and light stay, movement goes.
- **Haptics.** A light tick on each tap and a pulse on the pop (a double pulse for Epic and Legendary). This works on Android today. iOS needs the native haptics bridge once the app is wrapped.
- **Phone cost.** It only animates transform and opacity, so it's cheap on phones.

## 3. Phone performance (measured, nothing cut)

| | Measured | Budget |
|---|---|---|
| Draw calls per frame (low / med / high) | 32–42 / 48–59 / 47–59 | ≤ 70 |
| Triangles per frame | 25–35k / 47–57k / 47–58k | ≤ 120k |
| Bundle (JS + CSS, gzip) | **467 KB** | 420 KB (decision), 350 KB (original) |
| World generation p95 | 2.2 ms | 3 ms |

- **Bundle size.** This is the only budget that is over. By source: three.js 38 %, our render kits 20 %, the generator 10 %.
- **Safe ideas for the performance pass**, all without visible changes:
  - minify three's GLSL shader strings at build time;
  - lazy-load the Title's Earth and the debug-only code;
  - drop duplicated lookup tables in the render kits.
- **To check on a real phone.** Chunk-build spikes, which this machine's software renderer can't measure honestly. Also iOS audio unlock and the Earth-O logo layering.

## 4. Not done tonight (next, in this order)

- **Docks look empty.** Partly done: a yellow safety line now runs where the dock band meets the apron, and the apron has about half again as many stains and patches. It still reads sparse.
  - Next: truck-bay lines across the dock band, bollards and cleats along the quay lip (scenery only, off the grind edge), and a forklift mover more often.
  - The tall trucks turn into see-through screen-door boxes near the camera, which reads as "ghost boxes". It's the x-ray rule that keeps the skater visible. It's worth a look together.
- **Trick-line density.** It's below target (about 2 trick elements per 10 s against 3–5), because rows take about half the run.
  - Proposal: fewer, better rows, with grindable kerb runs and ledges between them. This is a gameplay basic, so it's for you to decide.
- **Obstacles that read as black blobs.** Give dark hazards a lit top face and a rim, keeping "dark means hazard" and the contrast gate.
- **Suburbs bin day.** Rows of wheelie bins across the road are the Suburbs' most common row (about half the rows in the shots). Natural, but repetitive; a second Suburbs kerb kit (mailbox and recycling crate, a parked bike) would vary it.
- **Known and unchanged.** The "Level 2 skipped by ROLL AGAIN" end-to-end test is timing-flaky on this shared machine. It fails on the previous commit too, as the hand-off already noted.

## 5. Commits (newest last; each one can be reverted on its own)

| Commit | What | Revert note |
|---|---|---|
| `62f28e5` | The hand-off's Phase B patch, applied unchanged | base of everything below |
| `e979ca3`, `8d4b395` | Vehicle render: facing, car-not-slab, paints, flowers, x-ray cap and kerb fixes | revert both together |
| `026c10b` | Where they stopped: generator rework, facing, six paints, tests, docs | depends on the render commits for the paints |
| `9fb493e` | TECH doc line for the six paints | docs only |
| `c8a8e21` | Crate reveal polish and haptics | standalone |
| `dc48f4f` | Second car of a pair ≥ 2.2 m away when off your line | standalone |
| `5c83b9d` | Docks: yellow safety line at the dock band, more used apron (decor only) | standalone |
| *(last)* | This summary and the hand-off status | docs only |

**Deploy.** PR #1 (game branch → `main`) is still waiting for you to enable GitHub Pages (Settings → Pages → Source: GitHub Actions) and merge. Tonight's work is on this branch on top of it. Say the word and I'll open a PR for it as well.
