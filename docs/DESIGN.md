# DUSKLANE: Game Design Document

**Status:** v1.1, authoritative. It merges the Controls, Levels, Progression, Tech and Art/Audio proposals, then applies the Player, Feasibility and Mobile reviews. Where sources conflicted, this document wins. Every such conflict, and every review point that was rejected or changed, is listed in the Decision Log (§24).
**Companion docs:** `TECH.md` (architecture and the frozen interfaces) and `ROADMAP.md` (milestones).
**Repo codename:** `isoskate`. Every name the player sees comes from `GAME_NAME = "Dusklane"` and `GAME_ID = "dusklane"` (TECH §3).

**Units.** Distances are in metres. Time is in seconds unless a value is marked ms. Screen sizes are CSS px scaled by `k = clamp(screenWidthCss / 390, 0.85, 1.3)`. Track space uses three axes:
- `s` is forward distance from the run start.
- `x` is lateral position. Negative is left; 0 is the street centreline.
- `y` is height above the area datum.

**Golden rule.** Every gameplay timing is defined in **seconds**: hazard spacing, reaction windows, airtime, look-ahead and scoring rates. Seconds are converted to metres only through the speed schedule `v(t)` (§5.1).

---

## 1. Identity

**Name:** DUSKLANE. A web search on 2026-11-06 found no existing game with this title. Similar names exist (Duskers, DUSK, Dusk Runners), but none is a skate game or a close match.

**Logline:** *"Roll through a quiet, overgrown city from golden hour into the neon night."* An endless, two-thumb street-skating game (left thumb steers, right thumb tricks). You never push. You carve, pop, flip and grind your way down a never-ending procedural street that drifts from a sunset downtown into the suburbs, past the docks and up into a glowing futuristic city at blue hour.

**Theme: RECLAIM** (internal name; players never see it; §24 row 74). A quiet, peaceful city that nature has slowly moved back into: moss on the stone, wildflowers on the verges, trees through roof terraces, birds on the wires, cars still parked calmly in their bays. A few helper machines keep working (a street sweeper, a forklift, a delivery robot, a self-parking car). The streets stay clean and skateable, the light is the same golden hour sliding into a neon night, and the lo-fi beat still plays. You are the only person on screen: the whole city is your skatepark, and the ledges and rails you grind are the only polished things in sight. Never shown or explained to players: why people left. Never: zombies, people, bodies, gore, crashed or burnt cars, decay theatre, flicker on hazards, fireflies (the full do-not list is in §18.4). Mood words: solitude, calm, wonder, freedom, golden, hopeful.

**Pillars**
1. **Two-thumb flow** (one thumb in Settings, §4.7).
   - Left thumb: drag to carve. Right thumb: tap to pop, swipe up-diagonally to pop a spin, swipe in the air to flip, swipe into a rail to pick the grind, and hold to manual.
   - The controls never fight the player: steering and tricks live on different thumbs (§24 row 71).
   - Lining up a rail feels magnetic.
2. **Fair at every speed.**
   - Every timing is in seconds, and a safe line always exists.
   - You crash only by slamming into something or by bailing a flip.
   - Bots prove this before every release (§2, TECH §11).
3. **Greed is the game.**
   - Going straight is not viable and is worth little.
   - Trick lines hold the coins and the points.
   - An unbanked combo is lost when you crash, so the core tension is: bank it now, or push for more?
4. **Warm, chill, handmade.**
   - Golden-hour light, long purple shadows and lo-fi beats, all built in code.
   - Every trick plays a note, so a good combo plays a melody.
5. **Something to come back for, nothing predatory.**
   - Cosmetic skaters, boards and helmets, a level track, a Trick Book and area postcards.
   - No energy meters, no streak punishment, no revives, no pay-to-win.

**The first 5 seconds** of every run (§12.4): carve through a coin S-curve, ollie a road-works barrier at 3.5 s (the first thing you must react to), and get magnetically pulled into your first grind at 6 s.

---

## 2. The owner's question: "Will it even be playable when it's faster?"

> **Yes, by design.**
>
> - **You start at a relaxed cruise:** 7 m/s, about 25 km/h. For the first 20 seconds the speed doesn't change at all.
> - **Between 0:20 and 2:30 the game eases up to its top speed:** 10.5 m/s, about 38 km/h. It never goes faster than that. Top speed is only 1.5× the starting speed.
> - **Everything you react to is measured in seconds, not metres:**
>   - An ollie always keeps you in the air for 0.6 seconds, at any speed.
>   - The camera always shows at least 2.5 seconds of street ahead of you, on every phone, even with browser toolbars or a notch. It zooms out about 20% at top speed to do that.
>   - Steering sideways is exactly as quick at any speed. Moving 2 m to the side takes about half a second.
>   - Two things you must react to are never closer than 0.9 seconds apart at top speed, and never closer than 1.6 seconds in the opening. Human reaction time is about 0.25 s.
> - **Jumps get slightly easier at speed.** You spend the same time in the air but cover more ground.
> - **After 2:30, nothing gets faster.** The street gets a little busier, with trickier lines and more chances to score, and then that levels off too. A 20-minute run is as fair as minute 3.
> - **We prove it with robots before every build ships:**
>   - A bot with human-like reaction delay must skate 8 minutes on 400 random streets (half from the start, half from top speed) without a single crash.
>   - We also test with a bot that only looks 1.5 seconds ahead and reacts slower than most people (0.35 s). Starting at top speed, at least half of its runs must last 4 minutes or more.
>   - A bot that plays through the real touch controls with sloppy, human-like thumbs must never crash and never trigger a trick by accident.
>   - A bot that just goes straight must crash within the first 20 seconds.

The full numbers behind each claim are in §5 (movement), §8 (camera), §10.6 (safe-line validator) and §11 (difficulty curve).

---

## 3. Core loop

| Scale | Loop |
|---|---|
| **5 s (the moment)** | See a line → carve to it → pop → flip or lock a grind → land → chime, and the combo grows |
| **30 s (the line)** | Chain obstacles into a combo. Bank it by landing and rolling for 0.75 s, or keep linking (a new flip, spin or grind at least every 2.5 s) to grow the multiplier. Every area gateway banks the set. Area-specific spots offer bonus gaps and landmarks. |
| **Run (1–6 min)** | Survive the rising pace, reach new areas (Suburbs at 0:44, Neon at about 2:02), grab coins on the trick lines, then crash or bail. Instant retry takes under 1 s. |
| **Session (10–20 min)** | The results screen shows coins, XP and one concrete next goal. Then a level-up, a crate, a shop purchase or a wishlist bar fill-up, and "Run again". |
| **Weeks** | Collect 40 cosmetics, fill the 36-entry Trick Book, collect 4 area postcards, climb to Level 30 for the Golden Hour board, and beat your best line. |

---

## 4. Controls and gesture grammar

### 4.1 Platform and input principles
- **Phone portrait first, two thumbs (default on touch).** Hold the phone in two hands. The play area splits at the vertical midline (`splitFrac` = 0.5 of its width, one tunable): **the left thumb steers, the right thumb does tricks** (owner playtest, §24 row 71).
  - A touch belongs to the zone it went down in for its whole life. It may slide across the midline without changing role.
  - Steering and tricks are separated by construction, so both thumbs work at once: steer while flipping, dodge while picking a grind.
  - **Settings › Touch controls:** **Two thumbs** (default) / **One thumb (classic)** (§4.7, the earlier grammar: one thumb anywhere both steers and tricks). **Swap sides** (steer right, tricks left) is for left-handed players.
  - Keyboard is a first-class second scheme (§4.6). A **mouse** (or pen) is one pointer and cannot be two thumbs, so it always uses the one-thumb grammar (§4.7), whatever the setting.
- **Timing.** The sim runs at a fixed **60 Hz** (TECH §6). Pointer events use `event.timeStamp` and coalesced events, and are assigned to the sim tick their timestamp falls in, never deferred to rAF.
- **Layering.**
  - The recognizer emits *gestures* only and is stateless with respect to the game. The zone split lives in the recognizer: the sim never sees steering from the trick thumb nor a trick from the steering thumb.
  - The sim decides what a gesture means in the current skater state (§4.3), so meaning is deterministic and replayable.
  - Bots and replays feed the same `InputFrame` (TECH §4.4), which is unchanged by the zones.

### 4.2 Per-touch recognizer (thresholds are scaled by `k`)

The recognizer stays stateless with respect to the game. Each touch gets a **role** at touch-down: *steer* (steering zone), *trick* (trick zone) or *both* (one thumb, mouse, pen). It labels each swipe with how it was made (`fast`, `fromRest`, `steer`), and the sim decides per state whether that swipe counts (§4.3). With two thumbs no swipe is ever `steer` and none carries steering, so the labels only matter to the one-thumb grammar (§4.7).

| Name | Rule |
|---|---|
| **Zones** (two thumbs) | **Steering zone** (x < 0.5·W; the right half with Swap sides): the touch only steers. It never produces a TAP, SWIPE, HOLD, long tap or press, however it moves or rests: no ollie, flip, manual, grab or pick from it, ever. **Trick zone** (the other half; x exactly on the midline is the right): the touch taps, swipes and holds exactly as below, but never steers and never owns steering. |
| `SLOP` | 10 px |
| **TAP** | A still trick-zone touch (travel < SLOP) released **≤ 350 ms** after touch-down. Human taps last 60–250 ms, so a nervous long tap is still an ollie. **Sloppy tap (G0):** a touch that drifted past SLOP but stayed within 20 px of its start (and 15 px sideways), fired no swipe and lifted ≤ 250 ms after touch-down is also a TAP. **Long tap (G1):** a still press released 350–600 ms after down reads as a TAP wherever its HOLD started nothing (§24 row 62). |
| **HOLD** | A trick-zone touch that stays within SLOP for 200 ms. Level-triggered: active until lift. A HOLD released by 350 ms *also* emits a TAP. A HOLD that then moves ≥ SLOP ends the hold and becomes a DRAG. |
| **DRAG** | Travel ≥ SLOP. **Permanent for that touch**: a DRAG never becomes a HOLD. A steering-zone DRAG steers; a trick-zone DRAG only swipes. |
| **SWIPE** | Trick zone only. Either ≥ 32 px moved within any 80 ms window (≥ 0.4 px/ms), or a lift-off with ≥ 24 px moved in its last 80 ms. Labels: **`fast`** (≥ 60 px in 80 ms, ≥ 0.75 px/ms), **`fromRest`** (the thumb was parked, < 0.15 px/ms for ≥ 60 ms, right before the flick) and **`steer`** (always false with two thumbs; §4.7). |
| **Direction** | 8 screen-space sectors: **cardinals ±30°, diagonals ±15°**. **Arc compensation:** for strokes that start in the outer 40% of the screen width (either side) and are within 45° of horizontal, the measured angle is rotated 8° toward horizontal before sectoring, because a thumb swiping sideways arcs upward (the right thumb works the outer right). The Settings toggle **Simple tricks** snaps every diagonal to the nearest cardinal. |
| **Recoil filter** | For 150 ms after a swipe fires, motion within ±60° of the opposite direction is ignored on that stroke |
| **Re-fire** (same stroke) | A stroke can fire again only when **all three** hold: ≥ 90 ms since its last fire, ≥ 32 px moved since the last fire point, and its speed dipped below 50% of the previous flick's peak in between. One long flick therefore fires once; a deliberate flick-flick fires twice (how doubles work). |
| **Lift-off swipe** | Disabled for a stroke that fired in the last 150 ms, so a lift never adds a phantom double or triple |
| **Steering** | Steering zone only. Relative and **direct** (owner playtest, row 72): the skater moves while the thumb moves and stops when it stops or lifts. `targetX += dx_px · S`, where `S = 9 m / (0.55 · screenWidthPx)`, about 0.042 m/px on a 390 px phone. Settings slider scales it 0.6–1.6×. Steering starts when SLOP is crossed and counts from the touch-down point. The target never leads the skater by more than **0.8 m** (`STEER_LEAD_MAX`): a thumb faster than the skater loses the excess, so **a quick slide dodges as far as the skater can go while the thumb moves, not as far as the thumb drew** (table below). **Fast thumb:** while the thumb outruns the skater it moves at up to **7 m/s** (`STEER_FAST`; keys and bots keep 5.5). **Release brake:** when a thumb that outran the skater stops or lifts, the target drops to at most 0.2 m ahead (the brake rate rises with speed so the stopping distance never needs more) and the skater brakes, so **lifting or stopping stops the skater within ~0.35 m** (measured 0.1–0.33 m on the ground, 0.20–0.27 m in the air, no overshoot, settled in ≤ 0.07 s; 0.43–0.54 m when the phone delivers a sample only every 40–67 ms). A drag the skater keeps up with ends where the thumb said and holds the line. There is no auto-centring. **Gain is 1.0 in every state** that steers. Keys (`steerAxis`) are never capped, sped up or braked. |
| **`swipeDx`** | The steering that swipe contributed: always **0** with two thumbs (a trick-zone touch never steers), so the sim has nothing to subtract (§4.4 rule 2) |
| **Multi-touch** | The first steering-zone touch to become a DRAG owns steering; other steering-zone touches never steer while it is down. When it lifts or cancels, steering goes to the next steering-zone touch that becomes a DRAG **or to a steering-zone DRAG already down as soon as it moves**, from where it is then (a thumb that landed while a grip contact owned steering takes over the moment that contact lets go, with no re-grip; a still contact never takes steering, so lifting still holds the line). Trick-zone touches tap, swipe and hold at any time, any number of them, while the steering thumb steers. |
| **`pointercancel`** | Produces no tap or swipe, ends any hold, and frees steering exactly like a lift |

**Touch steering, measured** (recorded thumb traces through the real recognizer, 390 px phone, sensitivity 1, lifted at the end; row 72):

| Slide | 40 px / 50 ms flick | 60 px / 120 ms | 90 px / 180 ms | 120 px / 250 ms | 48 px (2 m drawn) / 300 ms | / 400 ms | / 500 ms | / 600 ms | / 800 ms |
|---|---|---|---|---|---|---|---|---|---|
| Skater moves, before @steer | 1.7 m | 2.5 m | 3.8 m | 4.3 m | 2.0 m | 2.0 m | 2.0 m | 2.0 m | 2.0 m |
| … of which after the thumb stopped | 1.6 m | 2.3 m | 3.3 m | 3.5 m | 1.25 m | 0.9 m | 0.4 m | 0.2 m | 0.1 m |
| First preview (cap and brake only, 15cac29) | 0.3 m | 0.45–0.6 m | 0.7–0.9 m | 1.0–1.4 m | 0.9 m | 1.3 m | 1.6 m | 1.9 m | 2.0 m |
| Skater moves, now | 0.33–0.39 m | 0.6–0.8 m | 0.9–1.2 m | 1.2–1.8 m | 1.1 m | 1.5 m | 1.9 m | 2.0 m | 2.0 m |
| … of which after the thumb stopped | 0.27–0.29 m | 0.2–0.33 m | 0.2–0.33 m | 0.1–0.33 m | 0.12 m | 0.13 m | 0.09 m | 0.1 m | 0.09 m |

A 2 m dodge needs the thumb to keep moving about 0.3 s (a thumb at 0.5 px/ms kept moving until the skater is there: 2 m in 0.32 s). Ranges cover 8 ms and 16.7 ms sampling, minimum-jerk and constant-speed strokes, and a lift, a still thumb or a trembling one at the end. A wiggle out and back moves the skater out and back by what it could follow, not to where it started.

### 4.3 What a gesture means in each skater state (resolved inside the sim)

With two thumbs every gesture below comes from the trick thumb and every drag from the steering thumb, so the table is the whole story. **Steering-stroke rule (one thumb only, §4.7).** A swipe labelled `steer`, or one carrying `swipeDx`, is judged by the rule in §4.7; trick-zone swipes never are, so they count with the normal 0.4 px/ms threshold in every direction.

| Gesture | Ground (roll) | Manual | Air | Grind |
|---|---|---|---|---|
| Steering drag (left thumb) | Steer (gain 1.0) | Steer (gain 1.0) | Steer target (gain 1.0); lateral acceleration is limited to air values (§5.3) | Ignored |
| **TAP** (right thumb) | **Ollie**, fires on release | Ollie, linked | Jump buffer: ollie on touchdown if touchdown is ≤ 0.15 s away, otherwise nothing. **Discarded at grind capture.** | **Pop out** (full ollie from rail height) |
| **SWIPE ↑** | **Ollie**, fires on recognition (about 60 ms sooner than a tap) | Ollie, linked | Impossible flip. Inside the last 0.15 s of air it becomes a buffered ollie instead. **In the pick window it is a pick** (Nosegrind). | Pop out |
| **SWIPE ↗ / ↖** | **FS 180 / BS 180 ollie** (§6.1a): pops and starts the spin | Linked spin ollie | Flip (Inward Heelflip / Hardflip), or a **spin upgrade to 360** if it repeats the spin's direction while the spin is < 60% done | **180 Out**: pop out with a FS / BS 180 |
| Other swipes | Nothing | ↓ switches to Nose Manual (once per manual). Others do nothing. | **Flip** (§6.1). **Becomes a grind pick whenever the pick window is open** (§6.3). | **Grind switch** (↓ ← → ↙ ↘ and their doubles) if ≥ 0.25 s after lock (§6.3) |
| **HOLD** (right thumb) | Manual, **only while the combo's link window is open or the board is on a manual pad or ledge top**. Otherwise a resting thumb does nothing. | n/a | Grab (Indy), if ≥ 0.25 s of air remains | Nothing |
| Right thumb still down at touchdown | n/a | n/a | **Pre-press manual** on landing, if that touch went down between 0.30 s and 0.10 s before touchdown and did not move past SLOP within 0.15 s; or a grab is held | Manual after a grind exit landing (same rule) |

The steering thumb resting, lifting, re-gripping or flicking in any direction is only ever steering: it starts no ollie, manual, grab, pre-press or pick.

### 4.4 Conflict rules (ordered: the first rule that applies wins)
1. **Pick window first.** While a grind pick window is open (§6.3), **every** swipe is a pick, ↑ included. The late-flip cutoff, spin upgrades and flip upgrades do not apply to it. A buffered TAP is discarded at capture.
2. **Steering drag vs trick swipe.** With two thumbs they never meet: the trick thumb never steers (`swipeDx` 0, nothing to subtract, a flick never yanks the skater sideways) and the steering thumb never tricks (a fast dodge never flips or pops), so a left drag and a right flick in the same tick give the trick **and** all of the steering (as far as the lead cap of §4.2 lets the skater go; the same traces with the flick removed steer identically). One thumb: the subtraction and the steering-stroke rule of §4.7.
3. **Resting thumb vs manual.** A still trick thumb never starts a manual outside a combo, except on a pad or ledge top, and a release ≤ 350 ms is always an ollie (manual → linked ollie). The steering thumb never starts one at all. A thumb that has dragged stays a DRAG for life. Manual has no fail state and scores only inside a combo (§24 row 61), so an accidental manual costs nothing, and steering feel never changes (gain 1.0 everywhere).
   - **A right thumb that rests on the glass between tricks** (two thumbs give it nothing else to do) is a HOLD: back down early in an ollie's air it grabs (Indy), and a grab or pre-press held through touchdown rolls into a manual; resting in a link window manuals too. That is the same gesture as a deliberate hold-to-grab, so it is **a measured trade-off, not a misfire**: the thumb bot's `rest` habit (back down 80–300 ms after every tap, still until 30–80 ms before the next) gives 0.36 grabs and 1.0 manual per ollie (20 seeds × 4 min: 282 ollies, 100 grabs, 282 manuals), 0 flips, 0 spins and 0 crashes (none of them can hurt: grabs auto-release before touchdown, manuals have no fail state). The hints teach a **hovering** right thumb instead (§12.3): the trick ghost waits lifted above its ring and comes down only to tap or hold.
4. **Pop bleed.** No air swipe is recognized in the first 70 ms after a pop, and the stroke that popped is spent.
5. **Too-late flips.** Outside the pick window, a swipe with < 0.15 s of predicted airtime left is ignored (↑ becomes a buffered ollie). A long trick started early enough to count but too late to finish still bails. That is the intended risk.
6. **Upgrade refusal.** A same-direction swipe that would upgrade a flip (or spin) is refused, keeping the current trick, if the upgraded trick could not reach p = 0.55 in the predicted air left. Refused upgrades never bail you.
7. **Re-anchor.** Whenever the sim takes lateral control (grind lock, run start, side bump), it sets `targetX := x`. The magnet and ground align steer by moving `targetX` (§6.3), so no re-anchor is needed for them.

### 4.5 Platform hygiene
- `touch-action:none` on the play layer only. No callout, no text selection, no pinch zoom, no double-tap zoom.
- **Dead zone:** ignore touch-starts in the bottom safe-area inset + 12 px (iOS home bar).
- **During a run, only the pause button can be tapped.** Toasts, hints and popups are `pointer-events:none`, so they never swallow an ollie.
- **Back gestures** (Android back, iOS edge swipe-back) pause the run instead of leaving the page (TECH §10.1). With two thumbs the steering thumb works the left half, so an edge swipe from the very left edge can trigger the system back gesture (a page cannot exclude it); the STEER ring sits 24% in from the edge. To check on real Android gesture navigation and iOS before release.
- A phone held in landscape shows a **"Rotate to portrait"** pause card.
- Haptics go through the `haptics.*` hook (TECH §10): `navigator.vibrate` on Android, and a native bridge later.
- Audio unlocks on the first `pointerup`, `touchend`, `click` or `keydown`, and retries on every gesture until the context is running (§19.4).

### 4.6 Keyboard, mouse, gamepad

| Action | Preset A (default) | Preset B | Gamepad (optional, M5) |
|---|---|---|---|
| Steer | A / D (hold: `targetX` moves at `V_LAT_MAX`; release holds the line) | ← / → | Left stick X (deflection → lateral velocity) |
| Ollie / pop | Space or W (on keydown) | Space | A |
| Trick direction (flip, spin, grind pick) | Arrow keys. ↑ on the ground = ollie. Repeating an arrow = double. | IJKL, plus U/O/N/M for diagonals (O / U on the ground = FS / BS 180 ollie) | Right-stick flick (> 0.7 within 100 ms) |
| Manual | Hold **S** (Shift is an alias) | Hold Shift | Hold RT |
| Grab | Hold Q | Hold Q | Hold LT |
| Pause | Esc | same | Start |
| Restart / retry | Enter or R, **only on Pause, Crash or Results** | same | Start |

- **Diagonals without delay.** Cardinal arrows fire at once. If a second arrow arrives ≤ 80 ms later while the trick it started is < 25% done, the trick is **upgraded in place** to the diagonal (for example ↑ then → on the ground = FS 180 ollie; ← then ↓ in the air = Varial Kickflip).
- **The manual key in the air** only arms the pre-press manual. It never grabs (Q grabs), so a held S or Shift never surprises you.
- S replaces Shift as the default because holding Shift five times opens the Windows Sticky Keys prompt, which blurs the window and pauses the run.
- During a run, game keys call `preventDefault`, the focused element is blurred, and the mouse cursor is hidden.

### 4.7 One thumb (classic)

Settings › Touch controls › **One thumb**, and every mouse or pen pointer: the grammar the game shipped with until the owner playtest (§24 row 71). One thumb anywhere on screen both steers and tricks; every touch has the role *both*. The recognizer rules of §4.2 apply to every touch (any touch can tap, swipe and hold, and the first touch to become a DRAG owns steering; a second-finger tap is an ollie), and steering and tricks are told apart by how a swipe was made:
- **Labels.** `fast` and `fromRest` as in §4.2, and **`steer`**: the stroke is the steering owner and is older than 150 ms. **`swipeDx`**: the steering that swipe contributed, its 80 ms window, or all steering since touch-down when the stroke is ≤ 150 ms old (0 for non-owners).
- **Owner sectors (G0).** A swipe from the steering owner uses diagonals ±10° (cardinals ±35°), unless it is the first motion of a parked thumb (it rested ≥ 60 ms and had not steered before), so a dodge that rises 30–35° stays a dodge.
- **Sloppy tap drift** already steered (the owner's drift is applied live).
- **Conflict rule 2, one thumb.** Steering applies live. When the sim consumes an air swipe as a flip, spin or pick, it subtracts that swipe's `swipeDx` from `targetX`, so a flick doesn't yank the skater sideways. Pops (↑ ↗ ↖ from the ground or a manual, pop-outs and 180 Outs) subtract nothing: a dodge that also pops keeps its dodge. A `steer` swipe that fails the steering-stroke rule is not consumed and nothing is subtracted, so a dodge stays a dodge.
- **Resting thumb.** A still touch never starts a manual outside a combo, except on a pad or ledge top (§4.4 rule 3, for any touch).

**Steering-stroke rule** (in the sim, `tricks/interpret.ts swipeCounts`). A `steer` swipe is mostly steering, so it counts as a trick only when clearly meant:

| State and direction | A `steer` swipe counts only if |
|---|---|
| Air, ← or → | `fromRest`. A fast sideways dodge in the air is never a kickflip or heelflip. |
| Air, any other direction | `fast` or `fromRest` |
| Ground, ↑ ↗ ↖ (they pop) | `fast` or `fromRest` |
| Ground, other directions | Never (horizontal ones are just fast steering) |

A swipe that does not count is plain steering: it was already applied and nothing is cancelled. Non-steering touches keep the normal 0.4 px/ms threshold. **Fresh steering strokes (G0):** a stroke ≤ 150 ms old that is the steering owner (its `swipeDx` is not 0) counts in any direction with a sideways component (← → and the diagonals) only if `fast` or `fromRest`, so a thumb that lands on the glass and dodges at 0.4–0.7 px/ms dodges; ↑ and ↓ keep the normal threshold.

---

## 5. Movement

### 5.1 Key numbers (single source: `core/tuning.ts`)

| Constant | Value | Notes |
|---|---|---|
| Sim rate | 60 Hz fixed | Render interpolates |
| Start speed `V_START` | **7.0 m/s** (25 km/h) | Held for the first 20 s |
| Top speed `V_MAX` | **10.5 m/s** (38 km/h), hard cap | 1.5× start |
| Speed schedule | `v(t) = 7.0 + 3.5 · smoothstep(20, 150, t)` | `t` = run time in seconds. Depends **only** on run time: tricks, grinds and terrain never change it. |
| Distance | Closed-form `sAt(t)`. Examples: s(8)=56 m, s(45)=318, s(60)=431, s(90)=682, s(150)=1,278, s(165)=1,435, then +10.5 m/s | The sim sets `p.s = sAt(t)` exactly, so there is no drift |
| Gravity `G` | 22 m/s² | Constant for the skater |
| Ollie pop `V_POP` | 6.6 m/s | Flat ollie: **0.60 s airtime, apex 0.99 m, at every speed** |
| Playable corridor | **9 m**, `x ∈ [−4.5, +4.5]`, identical in all areas | Soft walls (§5.3) |
| Lateral speed `V_LAT_MAX` | **5.5 m/s at every forward speed** | Dodges take the same seconds at any speed |
| Lateral acceleration | 40 m/s² (ground and manual), 16 m/s² (air) | Steering gain is 1.0 in roll, manual and air; 0 in grinds |
| Line change, measured in sim (settles within 0.1 m) | 1 m 0.30 s · 2 m 0.48 s · 3 m 0.67 s · 4.5 m 0.93 s · full width 1.75 s | A key target, or a drag kept up until the skater is there. A thumb that outruns the skater runs it at up to 7 m/s, so a 2 m touch dodge takes 0.32 s from the touch's first motion (the thumb moves ~0.3 s) |
| Hitbox | 0.40 W × 0.70 L × 1.50 H | Same for every cosmetic. The visual skater is about 0.55 m wide. |
| Crash-face inset | 0.08 m | Obstacles are more forgiving than they look |
| Step-up `STEP_UP` | 0.18 m | Anything this low is a bump, not a wall |
| Look-ahead | **≥ 2.5 s always, measured below the HUD band and safe area**; about 2.9–3.3 s at start and 2.6 s at top (portrait) | §8 |
| Reaction floor `R_MIN(t)` | 1.6 s (intro), 1.2 (warm), 1.0 (build), **0.9 s (plateau)** | Minimum gap between the starts of consecutive required actions on the safe line (§10.6) |
| Line-change time used by the validator `T_SHIFT(dx)` | `0.35 + dx / (0.70·V_LAT_MAX)`: 2 m 0.87 s, 3 m 1.13 s | The same 0.70 reach fraction as the validator grid (§10.6) |

### 5.2 Carve
- **Target speed:** `desiredVx = clamp(10 · (targetX − x), ±V_LAT_MAX)`. `vx` moves toward `desiredVx` at the state's lateral acceleration.
- **Target clamp:** `targetX` is clamped to ±4.3.
- **Touch lead cap, fast thumb and release brake** (§4.2, row 72): touch steering never puts `targetX` more than 0.8 m ahead of the skater (it never pulls back a target the magnet or ground align moved). A drag the cap held back (the thumb outran the skater) arms the fast thumb: `desiredVx = clamp(10 · 7/5.5 · (targetX − x), ±7)` m/s, speeding up at 80 m/s² on the ground (the air keeps 16), so the 0.55 m lead that commands full speed leaves 0.25 m of headroom for a tick or two without samples. When that thumb stops or lifts (under ~0.7 px over the stop window, 2 ticks, or one more than the longest gap between the thumb's last few samples, up to 4; jitter under ~0.3 px a tick is ignored), `targetX` drops to `x + max(vx²/(2·aB), min(lead, 0.2))` plus whatever the magnet or ground align added since it armed, where `aB = max(66 m/s² on the ground or 40 in the air, vx²/(2 · 0.2 m))`, and the skater slows at aB. Every bot steers with `targetX` ≤ 0.66 m ahead (measured over the gate runs), keys move it by `steerAxis`, and the magnet, ground align, re-anchors and landing nudges move it directly, so none of them meets the cap, the fast thumb or the brake: lateral capability for the validator (`T_SHIFT`, 0.7·`V_LAT_MAX`) is unchanged, and a human's only goes up.
- **Visual only, no effect on physics:**
  - board yaw = `atan2(vx, v)`
  - body lean = 0.8 × yaw, capped at 25°
  - the toeside or heelside pose comes from the sign of lateral acceleration

### 5.3 Air and edges
- **Air control:** lateral acceleration 16 m/s² with the same `V_LAT_MAX`, so carve momentum carries through jumps. The air magnet (§6.3) adds on top. A touch release in the air brakes at ≥ 40 m/s² (§5.2), so the board no longer floats past where the thumb stopped (was ~0.1–0.3 m of overshoot): it stops within 0.20–0.27 m.
- **Soft walls:** beyond |x| = 4.2 a spring (`a = −60·(|x|−4.2)`, lateral) pushes the skater back with a wobble. You can never leave the corridor and never crash on a corridor wall.
- **Coyote time:** you can ollie up to 0.08 s after rolling off an edge (never over a pit, §7).
- **Jump buffer:** a tap within the last 0.15 s before touchdown ollies on landing.
- **Stairs and inclines stick.** Rolling onto a stair set or an incline follows its slope (no roll-off launch), so rolling down stairs is the harmless stair-clack judder. Ollie off the top edge to fly them.
- **Slopes change airtime.** An ollie on a 1:10 incline lasts about 0.51 s uphill and 0.70 s downhill at top speed, so **required actions are never placed on inclines or stairs** (§10.10).

### 5.4 Ollie and drop table (pop at `V_POP` = 6.6, `G` = 22)

| Take-off | Airtime | Apex | Distance at 7 / 8.75 / 10.5 m/s |
|---|---|---|---|
| Flat ollie | 0.60 s | 0.99 m | 4.2 / 5.3 / 6.3 m |
| Pop off a 0.30 m lip or rail | 0.64 s | 1.29 m | 4.5 / 5.6 / 6.7 m |
| Pop off a 0.60 m rail | 0.68 s | 1.59 m | 4.8 / 6.0 / 7.1 m |
| Pop down a 3-stair (0.51 m) | 0.67 s | n/a | 4.7 / 5.9 / 7.0 m |
| Pop down a 7-stair (1.19 m) or 1.2 m dock edge | 0.75 s | n/a | 5.2 / 6.5 / 7.8 m |
| Pop down a 10-stair (1.70 m) | 0.80 s | n/a | 5.6 / 7.0 / 8.3 m |
| Pop down the 2.0 m skywalk edge | 0.82 s | n/a | 5.7 / 7.2 / 8.6 m |
| Roll off (no pop) a 1.2 m / 2.0 m edge | 0.33 / 0.43 s | n/a | Drops are never crashes |

### 5.5 Height classes (readability contract, enforced by the validator)

| Class | Height of top above the local riding surface | Rule |
|---|---|---|
| **Bump** | ≤ 0.18 m | Roll over harmlessly: curbs (0.15), cracks, cables, grates, flush rail tracks, speed humps (0.08) |
| **Low** | 0.19–0.60 m | Ollie-able. Everything grindable sits here, and so does every full-width hazard (those are ≤ 0.50 m). Cream top edge if grindable; chevrons if full-width. |
| **Forbidden band** | 0.61–1.14 m | **No solid may have its top in this band.** Low things look jumpable and tall things look like walls, with nothing ambiguous in between. |
| **Tall** | ≥ 1.15 m | Steer around only: a flat ollie's apex (0.99 m) stays below a tall top even after the 0.08 m inset (1.07 m). Dark body with a saturated accent (§18.4). |

**Ollie clearance.** At these numbers the board stays above:
- a 0.42 m effective (inset) full-width hazard 0.44 m long for an **ollie window of 0.29 s at 7 m/s and 0.35 s at 10.5 m/s**;
- the max 0.60 m low obstacle for a window of 0.19–0.25 s.

**Required ollies on the safe line need a window of ≥ 0.25 s** (a sloppy 250 ms tap still makes it); optional trick-line ollies need ≥ 0.15 s (§10.6.5).

Because airtime is fixed in seconds, a fixed-size obstacle gets *easier* to clear at higher speed.

---

## 6. Tricks

### 6.1 Flip tricks (air swipes, screen space)
Board axes: roll is about the long axis, yaw about the vertical axis, pitch about the short axis. Rotations use an ease-out cubic, so the board visibly "catches". Points are the base value before modifiers.

| Swipe | Trick | Rotation | Duration | Points |
|---|---|---|---|---|
| ↓ | Pop Shove-it | yaw 180 BS | 0.28 s | 100 |
| ← | Kickflip | roll +360 | 0.32 s | 150 |
| → | Heelflip | roll −360 | 0.32 s | 150 |
| ↑ | Impossible | pitch 360 (wrap round the back foot) | 0.36 s | 200 |
| ↓↓ | 360 Shove-it | yaw 360 BS | 0.46 s | 200 |
| ↙ | Varial Kickflip | roll +360, yaw 180 BS | 0.36 s | 250 |
| ↘ | Varial Heelflip | roll −360, yaw 180 FS | 0.36 s | 250 |
| ↖ | Hardflip | roll +360, yaw 180 FS, 70° pitch arc (`FlipDef.pitchArc`) | 0.38 s | 300 |
| ↗ | Inward Heelflip | roll −360, yaw 180 BS | 0.38 s | 300 |
| ↙↙ | 360 Flip (Tre Flip) | roll +360, yaw 360 BS | 0.50 s | 350 |
| ↘↘ | Laser Flip | roll −360, yaw 360 FS | 0.52 s | 400 |
| ←← | Double Kickflip | roll +720 | 0.56 s | 400 |
| →→ | Double Heelflip | roll −720 | 0.56 s | 400 |
| ←←← | Triple Kickflip | roll +1080 | 0.78 s | 650 |
| →→→ | Triple Heelflip | roll −1080 | 0.78 s | 650 |

Ollie (TAP or ↑ on the ground) scores 50.

**Repeat-upgrade rule.**
- A swipe in the **same** direction while the current flip is < 60% done upgrades it in place: kickflip → double → triple, pop shove-it → 360 shove-it, varial kickflip → tre, varial heelflip → laser.
- The upgrade adds the duration difference shown in the table. The board keeps its current angle and spreads the remaining rotation over the remaining duration, so it never visibly jumps.
- An upgrade is refused (the current flip continues) if the upgraded flip could not reach p = 0.55 in the predicted air left (§4.4 rule 6).
- Once a flip has finished, a new swipe in the same air starts a separate flip. This is a **Double-up**: the second flip scores ×1.5.

**What fits where.** A typical swipe is recognized about 0.18 s after the pop. A trick lands clean if the airtime left at the swipe is ≥ 0.8 × its duration (§7).
- **Flat ollie** (0.42 s left): every single flip, the 360 Shove-it, the Tre Flip and a 360 spin. The Laser Flip needs a quick swipe.
- **Rail pop-offs, any stair set, dock edges:** doubles.
- **The 2.0 m skywalk drop, the Harbor Bridge drop, or 10-stairs with a quick swipe:** triples.

The trick bot verifies all of these at 7 and 10.5 m/s (§10.11).

### 6.1a Body spins (ground diagonals)
The skater and board rotate together about the vertical axis. Spins start **only with a pop**: from the ground (or a manual) by swiping ↗ / ↖, or from a grind as a 180 Out (§6.3). Spin direction is FS for ↗ and BS for ↖ (mirrored visually for goofy stance).

| Input | Spin | Rotation | Duration | Points |
|---|---|---|---|---|
| ↗ on the ground | FS 180 | body + board yaw 180 FS | 0.30 s | 150 |
| ↖ on the ground | BS 180 | body + board yaw 180 BS | 0.30 s | 150 |
| ↗ then ↗ (2nd in the air while the spin is < 60% done) | FS 360 | yaw 360 FS | 0.50 s | 350 |
| ↖ then ↖ | BS 360 | yaw 360 BS | 0.50 s | 350 |

- A spin ollie scores the ollie (50) plus the spin, and the spin adds a link like a flip.
- **Flips stack on top.** After the spin has started, air swipes are flips as usual (except a repeat of the spin's own diagonal while it is < 60% done, which upgrades it to 360). BS 180 + ← lands as "BS 180 Kickflip" and scores both tricks.
- **Landing.** Spin progress is judged with the same bands as flips (§7); the landing takes the worse band of the spin and the flip.
- **Fakie and Revert.** A 180 lands fakie, which is visual only (`pose.fakie`). On a ground touchdown it auto-reverts with a quick pivot: **Revert +50**, plus **+1 link if the spin itself added a link** (a decayed spin gives no Revert link). A 360 lands regular. A 180 into a grind is ridden fakie (visual) and reverts silently on exit.

**Grab (cheap, optional).**
- HOLD in air with ≥ 0.25 s of air left: **Indy Grab**, 100 + 150/s, capped at 1.0 s.
- It auto-releases 0.12 s before touchdown. Still holding at touchdown rolls straight into a manual.

### 6.2 Grinds and slides (pick by swipe; mnemonic: up = nose side, down = tail side, left = board-slides, right = truck-locks)

| Pick | Grind | Entry | Per second |
|---|---|---|---|
| (no swipe) | 50-50 | 100 | 150 |
| ↓ | 5-0 | 100 | 175 |
| ↑ | Nosegrind | 125 | 175 |
| ← | Boardslide | 125 | 175 |
| ←← | Lipslide | 150 | 200 |
| ↖ | Noseslide | 150 | 225 |
| ↙ | Tailslide | 150 | 225 |
| → | Feeble | 200 | 250 |
| ↘ | Smith | 200 | 250 |
| ↗ | Crooked | 200 | 250 |
| ↗↗ | Overcrook | 225 | 275 |
| ↓↓ | Bluntslide | 250 | 300 |
| ↑↑ | Nosebluntslide | 250 | 300 |

- All grinds work on every grindable edge kind: rail, ledge, bench, curb, lip, rim, hubba.
- **Curb-class edges** (bump-height edges ≤ 0.18 m: curbs, neon curbs, manual-pad rims; `GrindEdge.pickOnly`) are grindable **only with a pick swipe** (so they have no 50-50 default), and they have no magnet and no ground align (§6.3). Lining up near a curb never hijacks your line.
- The material (metal, concrete, wood, neon, stone) changes the sparks and the sound, not the scoring.
- Grinds pay **per second**, never per metre, so speed never inflates them.

### 6.3 Grind selection, magnet and rules
- **Pick window.**
  - The window runs from 0.25 s before the predicted capture to 0.12 s after lock.
  - **While it is open, every swipe is a pick** (↑ = Nosegrind, ↑↑ = Nosebluntslide included). The late-flip cutoff, spin upgrades and flip upgrades are suspended (§4.4 rule 1). A swipe this late could not land a clean flip anyway (the shortest flip needs 0.22 s).
  - **The tell:** the rail's cream grind edge brightens, a cream chevron appears at the predicted capture point, a soft chime plays and Android gives a 15 ms pulse. That means "your swipe picks a grind now". The Lesson Line teaches it at 10–13 s.
  - A double (for example ←←) needs both swipes inside the window.
  - A buffered TAP is discarded at capture.
- **Perfect Lock.**
  - A pick within ±0.08 s of lock is a Perfect Lock.
  - It gives +25% on that grind and triple sparks.
  - A 50-50 with no swipe can never be a Perfect Lock.
- **Grind switch.**
  - A swipe ≥ 0.25 s after lock switches to that grind. Switches use **↓ ← → ↙ ↘ and their doubles**; ↑ and TAP pop out, and ↗ / ↖ pop out with a 180 (below). Noseslide, Crooked and Overcrook are therefore entry-only picks.
  - A switch counts as a new trick and a new link.
  - At most 2 switches per edge.
- **Air magnet** (Low-class edges only; curb-class edges have none).
  - It is active from the moment you leave the ground, for any grindable edge whose crossing point is within **1.6 m** laterally and height-compatible.
  - It **moves `targetX` toward the edge axis** at a rate that ramps linearly from 0 at 1.6 m to **3 m/s** at 0.4 m, so the normal steering controller carries you in and your own steering adds on top.
  - Dragging ≥ 15 px away from the edge cancels it for that jump. Steering removed by consumed swipes does not count toward that 15 px, so "Kickflip to Boardslide" never cancels itself.
- **Capture.**
  - Conditions: lateral offset ≤ 0.9 m (≤ 0.6 m for curb-class edges, and only with a pick made in their window), board bottom within [edge top − 0.30, edge top + 0.45], and `vy ≤ +1.5 m/s`.
  - The snap onto the edge takes 0.08 s, ease-out.
  - Capture happens **only while airborne**. Rolling straight never grinds anything by accident.
  - You can lock on anywhere along the edge's length.
- **Ground align.**
  - If you are rolling *already* on a collision course with a Low-class grindable 0.2–1.0 s ahead, `targetX` eases toward its centreline at ≤ 1.5 m/s so the ollie lines up.
  - It never moves you *onto* a collision course.
- **During a grind.**
  - There is no balance meter, and speed is unchanged.
  - Steering is ignored.
  - The grind ends at the edge's end with an auto-hop (`vy` 2.5 m/s, airtime about 0.23 s plus the drop). You can also end it with TAP or ↑, a full pop from rail height that leaves room to flip out.
  - A pop-out flip scores the flip plus a +50 **Pop-out** bonus.
  - **180 Out:** ↗ / ↖ pops out with a FS / BS 180 spin (§6.1a) and scores **+100**. A repeat diagonal upgrades it to a 360 as usual.
  - Every edge ends inside one segment and has a clear grind sweep and exit zone (§10.6 rule d), so a grind never carries you into a blocker.
- **Transfer.**
  - If you pop off an edge while a *different* grindable is reachable, the air magnet gets 2.5 m range and a 4.5 m/s `targetX` rate.
  - Landing on that edge scores **Transfer +250**, and it adds a link.
- **Flip-in.** A flip or spin still rotating at capture is judged by the landing rules (§7). "Kickflip to Boardslide" scores both tricks.

### 6.4 Manual
- **Start:**
  - a HOLD on the ground **while the combo's link window is open**, or on a manual pad or ledge top at any time;
  - a pre-press held through landing or a grind exit (the touch went down in that air, 0.30–0.10 s before touchdown, and stayed still; §24 row 61);
  - a grab held through touchdown;
  - or the manual key (S / Shift) held on the ground.
- **Look and feel:**
  - The nose or tail rises 12°.
  - Steering gain stays 1.0, so the controls feel the same in every state.
  - There is no fail state.
- **Kinds:** Manual (75 + 100/s) and **Nose Manual** (100 + 125/s, reached by ↓ while manualling, once per manual).
- **Budget per combo.**
  - Within one combo the budget shrinks each time: **3.0 s, then 2.2, 1.6, 1.2, with a floor of 1.0 s**.
  - When the budget runs out the board drops with a wobble (no crash), and the 0.75 s link window starts.
  - Hitting any bump also ends the manual.
- **Exits:**
  - ↑ flick, ↗ / ↖ (spin ollie), or a release ≤ 350 ms after the touch went down gives a linked ollie.
  - Lifting the thumb lets the manual "coast" for 0.30 s, so a tap in that window is also a linked ollie.
- **Scoring:**
  - A manual counts as a link once per combo.
  - Manuals are exempt from repetition decay, because the shrinking budget already limits them.
  - Manualling pauses combo heat (§13.2) but does not reset it, except the one linked manual, and except a manual started straight after another one without leaving the ground (G1, §24 row 60).

---

## 7. Landing and crash rules

**Touchdown or capture with rotation progress `p`** (fraction of a flip's or spin's total rotation done; with both active, the worse band wins):

| p | Result |
|---|---|
| 1.0 (finished in the air) | **Clean**. It is **Perfect** (+25% on that air's tricks, golden ring) if every rotation finished in the air and the last one finished within the **last 0.12 s** before touchdown, i.e. caught late. Typical swipe timing lands about 40–50% of flat-ollie flips Perfect; flicking later is a real risk-for-reward choice. |
| 0.80 to < 1.0 | Remaining rotation snaps in 0.06 s. Counts as Clean (never Perfect). |
| 0.55 to < 0.80 | **Sketchy**: that air's tricks score ×0.5, 0.3 s arm-wobble, and the combo **banks immediately**, so it is safe but over. |
| < 0.55 | **Bail = crash** (`badLanding`) |

- During a player's first 3 runs, the bail floor is 0.40 instead of 0.55.
- Carve angle, landing yaw and drop height never cause a crash.
- A plain 180 spin on a flat ollie finishes at 0.30 s, so it is Clean but never Perfect on its own; add a late flip for the Perfect.

**Landable surfaces**
- Ground, stair sets and inclines. Stairs collide as a smooth slope that you stick to when rolling (§5.3), so rolling down them is a harmless judder with a stair-clack sound.
- Tops of ledges, benches, planters, walls, crate stacks, loading docks and the skywalk. Every raised slab more than 0.18 m above its neighbours also has a solid body, so its sides and front are real faces.
- If the board centre lands within 0.15 m of a top edge, it is nudged onto the supported side.

**Top types.** Every catalog kind's top is one of `landable` (kinds marked **T**), `knock` (kinds marked **K**) or `crash` (everything else, the default). `barrier_low`, `holo_gate`, `spool_lying`, rails and beams have `crash` tops; rails and beams are captured as grinds before their top can be touched.

**Contact rules (sim and validator use the same ones)**
- **Skim.** A frontal contact with a `landable` solid whose top is ≤ 0.18 m above the board bottom lifts the board onto the top (`y := top`) and emits a `bump`. It is never a crash, in any mode. (`knock` solids always just get knocked.)
- **Crash tops never skim.** A frontal contact with a `crash`-top solid at any height below its top is a `slam`. This keeps tall things un-jumpable: a flat ollie's 0.99 m apex can never skim a 1.15 m bin.
- **Landing on top** happens only when the previous tick's board bottom was at or above the top.

**Bump (harmless)**
- Any feature ≤ 0.18 m above the board bottom.
- **Side contact**, meaning a contact normal within 45° of lateral. The skater is pushed out at 3 m/s with a wobble and a scuff sound. The combo continues and no near-miss is awarded.
- **Knockables** (cones, A-frame signs): they fly away, +10 points, no slowdown.

**Crash causes**

| Cause | Trigger |
|---|---|
| `slam` | Frontal contact (normal within 45° of travel) with a face more than 0.18 m above the board bottom, or with any `crash`-top solid below its top. Hitting a rail's end post too low counts. So does hitting a mover. |
| `badLanding` | Landing with p < 0.55, or landing on a **`crash`** top: bins, bollards, cars, vending machines, carts, drums, posts, barriers, mover roofs |
| `fall` | A pit's level is its **lip level** (its depth is visual only). The skater falls if the board centre is over the pit while the board bottom is ≤ lip + 0.02 m. You can't roll across a pit; you must ollie it or use the plank. Landing with the centre past the far edge is safe. |
| `splash` | Landing in the fountain basin's water |

**Near miss**
- Passing within 0.35 m laterally of a crash face, or clearing a hazard top with < 0.20 m to spare.
- Inside a combo: **+75**, once per obstacle. It refreshes the link window (§13) but adds no link and does not refresh combo heat.
- Outside a combo: **+25**, banked directly. It does not start a combo.

**Onboarding forgiveness**
- During the Lesson Line (first runs, §12.3), a crash **rewinds 1.5 s** and replays the relevant hint.
- At most 3 rewinds. After that, crashes end the run normally.

---

## 8. Camera

**Projection (decision row 73, @cam).** A telephoto **perspective** camera: the window's vertical field of view is **24°**, **pitch θ = 34°** down, and the framing solver picks the camera distance `D` (about 57–60 m on a 390×844 phone, 37 m on an iPhone SE in Safari). Until @cam it was orthographic (pitch 35°, ψ = 0 in portrait): on a phone that read top-down and flat, with the side facades edge-on. The owner, after a phone playtest, expected "an angled view instead of straight down the street" and asked for something "closer" that feels more active. The perspective camera keeps the skater big while the far street compresses, so hazards grow as they come at you and both street walls show.

**Yaw ψ depends on aspect ratio.**
- `ψ = 9°` for aspect ≤ 0.75, which covers every phone in portrait, including browser toolbars eating the height (an iPhone SE in Safari is 375×548, aspect 0.68): the street runs **diagonally up the screen**, converging, with the left facades showing.
- It rises linearly to `ψ = 30°` at aspect ≥ 1.25 (tablet landscape, desktop): a classic iso diagonal.
- Yaw is fixed for the whole run. There is no roll, ever.
- A **phone in landscape** (coarse pointer, shorter side < 500 px, aspect > 1) does not get the 30° layout; it shows a "Rotate to portrait" pause card.

**Why 9° and not more on phones.** With the 9 m corridor filling a portrait screen, a bigger angle pushes the far corner of the corridor off-screen sooner, so the solver must pull the camera back: at 12° the skater drops to about 46 px at 390×844 (44 px at 360×640) and the top of the screen reaches 68 m of street; at 14°, about 43 px. Any yaw also tilts the direction of travel on screen: a point 1 s ahead in the skater's own lane sits about `v·tan ψ` (≈ 1.7 m at 10.5 m/s) right of "straight up the screen". The lane dashes, kerbs and converging facades show the real direction, and 9° keeps the skater ≥ 40 px on every phone. The pitch is 34° (not 35°) so the window's top ray still looks 17° down (the run camera never sees the horizon, §18.3).

**Framing solver** (`world/render/camera.ts`, unit-tested in TECH §11). Every frame the rig chooses the smallest camera distance `D` (along the view direction from the skater's ground point) at which the fixed window fits a required region:
- **Required region:** the corridor `|x| ≤ 4.8` from `s_p − 1.5` to `s_p + 2.6·v`, plus 0.8 m of headroom for tall far objects. With ψ > 0 it is fitted for the worst lateral follow offset (15% of |x| ≤ 4.5 m), so the guarantee holds wherever the skater is.
- **The HUD band is excluded, measured for real:** `hudTop = (safeTop + 56 px) / screenHeight`, from the live `Viewport` (the HUD band is ≤ 56 px plus the top safe-area inset, §13.8). On a Dynamic Island iPhone installed as an app that is 115 px.
- The skater's ground point sits at **74% from the top** (an off-axis window). If playtests show a resting thumb covering it, the fallback is 70% (§23).
- `D` eases with τ = 2 s and only grows during a run.
- `?debug=1&cam=A` still runs the pre-@cam ortho camera, and `?cam=p<pitch>y<yaw>f<fov>` / `o<pitch>y<yaw>` any other spec, for comparisons (debug builds only).

Results (look-ahead is the full-corridor-width view below the HUD band, measured with the skater in the middle; `H` is the frame height at the skater's depth; skater height ≈ 1.48 m of `H`):

| Screen (CSS px, top safe area) | v = 7.0 | v = 10.5 |
|---|---|---|
| 393×852, safe 59 (iPhone 15/16, installed) | D 57.3 m (H 24.3 m), 2.76 s, ≈ 52 px | D 60.3 m (H 25.6 m), 2.77 s, ≈ 49 px |
| 390×844, safe 0 (full screen) | 57.1 m (24.3 m), 2.76 s, ≈ 51 px | 60.1 m (25.6 m), 2.77 s, ≈ 49 px |
| 390×664 (iPhone in Safari, toolbars) | 43.7 m (18.6 m), 2.91 s, ≈ 53 px | 45.4 m (19.3 m), 2.93 s, ≈ 51 px |
| 375×548 (iPhone SE in Safari) | 36.8 m (15.6 m), 3.13 s, ≈ 52 px | 37.9 m (16.1 m), 2.66 s, ≈ 50 px |
| 412×780 (Android Chrome) | 49.3 m (20.9 m), 2.83 s, ≈ 55 px | 51.5 m (21.9 m), 2.84 s, ≈ 53 px |
| 360×640 (9:16) | 45.9 m (19.5 m), 2.87 s, ≈ 49 px | 47.8 m (20.3 m), 2.88 s, ≈ 47 px |
| 1280×800 (ψ 30°) | 23.8 m (10.1 m), 2.66 s, ≈ 117 px | 32.7 m (13.9 m), 2.64 s, ≈ 85 px |

Against the ortho camera at 10.5 m/s: the skater is 49 px instead of 51 at 390×844 and **50 px instead of 31** at 375×548. A 1 m hazard 2.5 s ahead stands 22.7 px at 390×844 (ortho 28.3) and 21.2 px at 375×548 (ortho 17.4), and grows to 25.5 / 25.2 px 1 s ahead (ortho: no growth, 28.3 / 17.4). The top of the screen shows 41–70 m of street (390×844: 65 m; the chunk window keeps ≥ 92 m built ahead).

**Guarantee.**
- At least **2.5 s** of the *full corridor width* is visible ahead, below the HUD band, at every supported viewport from 9:21 to 21:9 (including the toolbar and safe-area cases above), at every speed, wherever the skater is laterally. A unit test asserts this.
- The generator assumes 2.5 s (aspect-independent), so the course is identical on every device.
- **Minimum sizes on screen:** grind edges are drawn at least 2.5 CSS px wide and coins at least 12 CSS px, at every depth. Under the perspective camera both are floored **per view depth** in the vertex shaders, so the cream stripe stays about 3 px wide from the skater to the HUD line (it never grows fat up close) and far coins never shrink under 12 px.
- The skater is ≥ 40 px on every phone at every speed (never < 30 px), and the resting thumb (bottom 22% of the screen) never covers it.

**Follow**
- **Forward:** rigid. There is no lag, because lag would eat look-ahead.
- **Lateral:** with yaw, the rig follows 15% of the skater's offset, τ = 0.4 s (the solver already fits the worst offset).
- **Vertical:** follows the *ground height* under the skater (τ = 0.3 s). It ignores jump arcs and eases down drops.

**Height readability**
- An always-on contact shadow sits under the board: a dark blob (opacity 0.6 on the ground, fading to 0.25 at 2 m height) on light ground, and a **soft additive cyan contact glow** (opacity 0.5) on dark ground (Neon, blue hour), where a dark blob would vanish.
- Long sunset shadows alone do not read height.

**Occlusion rules** (owner playtest: "the neon city has elements that covered the skate area in weird ways"; an angled or perspective camera makes camera-side decor lean over the street, so these are enforced by the renderer, not by placement alone)
- **No opaque structure crosses over the corridor.** The Sora Line maglev guideway is drawn as two thin beams hugging the far (−x) facade line at 7 m, never along the median, and the train's light streak (≤ 45% alpha) runs on it: neither ever crosses the corridor on screen. Viaduct pillars stay in their templates.
- **Camera-side cut.** Decor and buildings on the camera side (+x) are clipped at the plane through the corridor edge (x = 4.5 m at the street datum) and the camera: whatever would cover the corridor on screen is cut away, exactly (a fragment cut for buildings, windows, signs and glow cards), so the right-hand street wall ends at the corridor edge like a cutaway diorama and nothing on that side ever stands between the camera and the corridor. What is left of that wall darkens over its last 10 px next to the cut (a section line), so a light hazard at the corridor edge never stands against a lit facade. Low verge props are below the plane and draw whole.
- **Overhead spans fade over the look-ahead zone.** Lantern strings, overhead wires and lantern bulbs drop to a 25% screen door wherever they project onto the corridor between 2.5 m behind the skater and the HUD line; over the sidewalks and behind the skater they stay full. They hang at ≥ 3.2 m and stay ≤ 0.3 m thick on screen.
- The part of any in-corridor solid above **1.2 m** is dithered to 50% (the "x-ray cap"; 1.6 m before @cam, lowered because perspective hides more ground behind a solid): planter crowns, kiosks, containers and pillars never hide a hazard behind them.
- Billboards and blade signs keep their inner edge at |x| ≥ 4.9 m.
- Haze never applies to hazards or grind edges (`noFog`), and the sky glow stays inside the HUD band (§18.3).

**Shake** (amplitude in metres)

| Event | Amplitude | Duration |
|---|---|---|
| Crash | 0.25, decaying | 0.35 s |
| Landing from a drop ≥ 1 m | 0.06 | 0.12 s |
| Grind lock | 0.03 | 0.05 s |
| Grinding | 0.01 jitter | continuous |

- A Perfect landing adds a 2% zoom punch for 0.15 s.
- All shake and punch are disabled by the "Screen shake" setting and by `prefers-reduced-motion`.

**Non-run cameras**
- The Title diorama, Locker and Shop use a *low perspective* camera (FOV 35°, 1.4 m high, looking down the street toward the horizon). They render at 30 fps.
- That is where the sunset sky, sun disc and skyline are seen (§18.3).
- v1 Title is a **static diorama**: a fixed street vignette in the current palette, with your loadout idling. A live attract run is an M5 stretch goal.

---

## 9. Juice

**Signature: musical feedback.**
- Every scoring event plays a note from the beat's current chord, using the area key's major pentatonic. Minor-key areas use the relative major's pentatonic (Suburbs, A minor → C major; Docks, C minor → E♭ major), so notes never clash.
- The note is quantized to the next 1/16 if that is ≤ 40 ms away; otherwise it plays immediately.
- Pitch climbs one scale degree per trick within the combo, so a combo plays a rising melody. It resets on bank.

**Haptics rules.** Every pulse is ≥ 15 ms, and at most one pulse fires per 120 ms. Settings → Haptics offers Off / **Key moments** (default) / All. "Key" rows below always pulse (unless Off); "All" rows pulse only on All.

| Event | Visual | Audio (synth, §19) | Haptic |
|---|---|---|---|
| Pop | 6-particle tail dust puff; squash 0.92 then stretch 1.06 over 50 ms | Woody clack | 15 ms (All) |
| Flip | 3 ghost board copies at 30% alpha; trick name pops **beside or below** the skater for ≤ 0.5 s, tinted coral if the predicted landing would be Sketchy or a bail | Whoosh, pitch follows spin rate | n/a |
| Spin / Revert | Body ghost (1 copy, 20% alpha); "FS 180" label; "REVERT" pivot puff on landing | Low swish; revert scuff | n/a |
| Land | 10-puff dust ring; squash 0.9 for 70 ms | Two knocks + thud; wheel roar resumes | 15 ms (All) |
| Perfect land | Golden ground ring 0.25 s; "PERFECT"; 2% zoom punch | Double clack + chord chime | 2 × 15 ms (Key) |
| Sketchy | Arm-wobble pose; "SKETCHY" in grey | Scuff | n/a |
| Pick window open | Grind edge brightens + cream chevron at the predicted capture point | Soft chime | 15 ms (All, Android) |
| Grind | Warm sparks on metal (40/s), cyan on neon, dust on concrete, wood flecks on benches; glowing contact trail 0.4 s | Material loop (§19.3) | 15 ms on lock (All) |
| Perfect Lock | Triple sparks; "PERFECT LOCK" | Bright metal ring | 2 × 15 ms (Key) |
| Combo build | Combo pill "1,240 × 6" bumps 1.15 → 1.0 in 120 ms; colour cream → amber (×5) → coral (×10) → magenta (×20). **Bank-timer arc** around the board's contact shadow (world space) shrinks cream → coral and pulses with a soft rim tick in its last 0.25 s; it shows the time until the combo banks (§13.2). | Music low-pass opens 800 Hz → 8 kHz with multiplier; intensity layers (§19.1) | n/a |
| Combo bank | Pill flies into the total; "+5,028" float ("SET BANKED!" at a gateway) | Arpeggio | 15 ms (Key) |
| Combo lost (crash) | Pill text cracks and falls; "−5,028" struck through on results | Descending minor third | n/a |
| Near miss | "CLOSE!" label + 1-frame rim flash | Stereo-panned whoosh | n/a |
| Coin | 6-star burst; HUD coin icon pulse | Ding on the current chord (climbs, §19.3) | n/a |
| Full-width hazard warning | Chevron flash on the hazard, **1.6 s before contact at every speed** (the holo gate pulses at ≤ 2 Hz over the same 1.6 s) | Wood-block tick (not quantized) | n/a |
| Crash | Procedural tumble, board clatters away; 0.35× render slow-mo for 0.6 s; 40% desaturate (material uniform); "BAILED!" sticker. **The obstacle that got you outline-flashes coral**, and one cause line explains it ("Clipped a bin", "Flip 62% done — flick earlier", "Landed on a car roof", "Fell in the trench"). | Thud + board clatter + tape-stop | 30 ms (Key) |
| New best | Painted "BEST" line across the road (with a flag streamer) comes into view; crossing it bursts leaves or petals by area | Vocal-chop-style synth flourish | 20 ms (Key) |
| Speed | From 9.0 m/s: speed lines **outside the corridor only** (alpha ≤ 0.15) and parallax streaks on the side dressing. A small HUD stamp on each speed tier: **CRUISE** (8.0 m/s), **FLOW** (9.0), **FULL SEND** (10.5). | Wheel roar pitch rises with speed; a wind bed fades in from 8.0 m/s | n/a |
| New area | Area title card slides in for 1.5 s ("SUBURBS"), +500 New Ground | Pivot chord, then the new area's groove | 15 ms (Key) |

**Retry speed.** A fresh touch that goes down ≥ 0.6 s after a crash starts a new run in under 1 s (§17.3). Panic taps during the tumble never skip the results by accident.

---

## 10. World generation

### 10.1 Track model
- **One straight street** runs along world −Z. The camera never rotates. Variety comes from layout: lateral line choice, heights, stairs, gaps, layers and area scenery. There are no bends.
- **Time cursor.** The generator places **segments** (template instances, §10.4) along *run time* `t` and converts to metres with `sAt(t)`. Every template element time `τ` is in seconds. Lengths are given either in seconds (`sec: [a, b]`, converted with the local `v`) or as fixed physical sizes.
- **Chunks** are a separate concept: fixed **32 m** pages used for streaming, queries and rendering.
  - An obstacle is listed in *every* chunk its `s`-range overlaps. Ids are unique, so queries de-duplicate.
  - The generator stays ≥ 12 s of travel ahead of the player (`GEN_AHEAD_SEC`, which covers the renderer's 3-chunk window at top speed) and drops chunks once they are more than one chunk behind.
- **Determinism.**
  - RNG is `sfc32`, seeded by `hash32(runSeed, segmentIndex, stream)`, with separate streams for `layout`, `coins` and `decor`.
  - All output is rounded to 1 cm.
  - Segments are generated strictly in order and carry `GenCursor` state (TECH §5): t, s, area, datum y, the open lateral set, the validator's full state planes for the history window, the committed exit set, the time and x of the last required action, the A1–A3 clocks (per-column last-tall-blocker times, last wander, last full-width hazard), last tier, and the time of the last breather.
  - The same seed gives the same street on every device and aspect ratio.
- **Seeds.** Each run gets a fresh 32-bit seed and a run id. Both are drawn outside the sim, at run start. The Lesson Line uses a fixed seed. Daily/shared seeds are a future feature (ROADMAP "Later").
- **Starting later (`startT`).** Debug and bot runs may start at any `startT`: there is no Roll-out, `s0 = sAt(startT)`, the difficulty phase is the one at `startT`, and the A1–A3 clocks start at `startT`.

### 10.2 Corridor and per-area lateral layout
Every area uses the same 9 m playable corridor (`x ∈ ±4.5`, soft walls from ±4.2). Everything beyond is decor that can't be collided with, seen mostly at top speed and through the shadows it casts.

| Area | Lateral layout (x, m) | Surfaces | Character |
|---|---|---|---|
| **Downtown Plaza** | Sidewalk −4.5…−3.0, curb 0.15 at −3.0. Road −3.0…+3.0, with parking bays at ±2.0…±3.0 in some segments. Sidewalk +3.0…+4.5. Every 3rd segment is a curb-free **plaza** of granite tile across the full width. | asphalt, concrete, tile | Ledges, stair terraces, handrails |
| **Suburbs** | Lawn −4.5…−3.8 (rideable grass). Sidewalk −3.8…−2.6. Curb at ±2.6 with driveway cuts every 1.5–2 s. Road −2.6…+2.6, crowned +0.05 at the centre. Sidewalk +2.6…+3.8. Lawn +3.8…+4.5. | asphalt, concrete, grass | Flowy and open, gentle rolling grades |
| **Industrial Docks** | Dock band −4.5…−2.0, at datum or as a raised loading dock (+1.2 m, layer L1). Concrete apron −2.0…+4.2. **Dock lip** +4.2…+4.5 (0.30 high, grindable inner edge), with water beyond the corridor. **Never mirrored.** | concrete, steel plate, wood planks | Wide, container channels, a high line |
| **Neon City (Hoshimachi Ward)**, invented name | Tiled sidewalk −4.5…−3.0. Wet-asphalt road −3.0…+3.0, with a median pillar line at x = 0 in pillar segments. Glowing guard rails along ±3.0 in rail segments. Tiled sidewalk +3.0…+4.5. | wet asphalt, tile | Dense, split lanes, elevated skywalk |

Area layouts blend over the 4 s gateway (§12.2).

### 10.3 Obstacle catalog
**Size** is L (along travel) × W (lateral) × H. **Class** is defined in §5.5.

**Interaction codes**
- **G**: grindable, edges named
- **T**: top is landable, ride or manual on it
- **O**: ollie over
- **A**: avoid, tall blocker
- **K**: knock over harmlessly (+10)
- **B**: bump
- **P**: pit, crash cause `fall`
- **M**: mover (§10.9)

**Physical rules**
- Every crash face is inset 0.08 m.
- Tall in-corridor solids get the x-ray cap above 1.6 m (§8).
- Each area re-skins the shared items with its own materials.

**RECLAIM skin notes** (§1 theme, §18.4 dressing rules, §18.5 vehicle builder; §24 row 74). A skin changes only what is drawn: every kind keeps its footprint, class, interaction code, top type, solids, crash-face insets and edges, and the bot gates do not move. `core/skins.ts` `propSkin(kind, area, id, variant, h)` picks the body, paint, dressing flags, livery and crash noun deterministically; the kits and the crash copy (§9) both call it, so the crash line always names what was drawn. Crash nouns are plain ("car", "bin", "gap"), never "abandoned", "overgrown" or "mossy".

| Kind | RECLAIM skin (crash noun) |
|---|---|
| `parked_car` | A parked car from the vehicle builder: sedan, estate, pickup or (h ≥ 1.5) small SUV, paint top teal / oxblood / olive / slate, dark glass framing the roof, tyre nubs, one accent stripe, no chrome; 70% show the rear, 30% are nosed in; a grey tabby asleep on 1 in 8 sedans and estates (never in Neon) ("car" / "pickup") |
| `parked_van` | Panel van in a faded `DECOR_BRANDS` livery (55%) or camper van, curtains drawn ("van") |
| `container` | 60% rusty container with vines, 25% box truck in Brindle Freight livery, 15% staff shuttle bus in Saltwick Shipping livery ("container" / "truck" / "bus") |
| `crosswalk_car` / `backout_car` / `forklift` / `delivery_robot` | Helper machines still at work, clean: a street sweeper, a self-parking car, an autonomous forklift, a delivery robot (pictogram screen, no face). Telegraphs unchanged ("street sweeper" / "reversing car" / "forklift" / "delivery robot") |
| `barrier_low` / `holo_gate` | DT a faded road-works barrier board on two trestles (both height classes, the Roll-out included; no chains anywhere); SB a fallen log with chevron boards on stakes; IN a rusty pipe run on blocks; NE the holo gate. Chevrons stay fresh ("barrier" / "log" / "pipe" / "holo gate") |
| `trench` | DT sunken road seam under a scaffold plank, SB ditch with a culvert slab, IN quay seam with steel plates, NE cable trench under a grate plank. Jagged honest crack lips within ~0.1 m of the collision edge; the floor stays flat `#2F2742` with no reflection, so a pit never looks like a puddle ("gap" / "ditch" / "gap" / "trench") |
| `bike_rack` / `wheelie_bins` | Bikes with vines, or nested shopping carts (50/50); a bin pair, or a compact dumpster (50/50) ("bike rack" / "carts"; "bins" / "dumpster") |
| `kiosk` / `bus_shelter` | A tree grows up through the awning or roof: a flat ink-green crown cap ≤ +0.05 m inside the footprint; every shelter pane in place, a faded poster ("kiosk" / "bus shelter") |
| everything else | The same object, weathered and dressed under §18.4 (moss, ivy, rust, a bird on a bollard or hoop, a nest in a mailbox, roses on SB pickets, a flower carpet in DT planters). Lidded column fillers outside Neon roll a sapling 1 in 4, drawn only when the filler is isolated |
- **Top type** follows the interaction codes: **T** = `landable`, **K** = `knock`, everything else = `crash` (§7).
- **Seconds vs metres.** For length-parametric kinds (ledges, rails, walls, beams, decks) the template's seconds range is authoritative; the catalog's metre range below is wide enough to fit it at `V_MAX` and only clamps extreme jitter. Fixed-size kinds keep their sizes.
- **"Continuous" kinds** (curbs, neon curbs, the dock lip) are emitted as finite edges per template. No grind edge and no L1 deck crosses a segment boundary.

**Shared (all areas)**

| Kind | Size | Class | Interaction and notes |
|---|---|---|---|
| `curb` | continuous × 0.30 × 0.15 | Bump | B. G on the top outer edge (curb-class: pick swipe only, §6.2). |
| `flatbar` | 3–16 (0.6–1.5 s·v) × 0.05 × 0.35–0.45 | Low | G, O. End posts are crash faces below the rail top. |
| `bench` | 2.0 × 0.5 × 0.45 (long axis along s) | Low | G on both long edges, T. Front face crashes. Skins: granite (DT), park bench (SB), pallet bench (IN), stone + wood slats (NE). |
| `manual_pad` | 3–6 × 1.2 × 0.15 | Bump | T (manual). Its edges are curb-class grindables (pick only). |
| `trash_can` | 0.6 × 0.6 × 1.15 | Tall | A. Non-landable. Common column filler. |
| `cone` | 0.3 × 0.3 × 0.5 | Low | K. A-frame signs use the same rule. |
| `barrier_low` | 0.6 × full width × 0.50 | Low | **O (full-width hazard)**, with amber/ink chevrons. `crash` top. Skins (RECLAIM): DT road-works barrier board on trestles, SB fallen log with chevron boards, IN pipe run on blocks, NE **holo gate** (a light bar over a solid chevroned base; may have an open 2.0 m slot; pulses at ≤ 2 Hz for the standard 1.6 s warning). |
| `trench` | gap 0.25–0.35 s·v (1.8–3.7 m) × full width; a 1.2 m-wide plank at some x | Pit | **Full-width hazard.** O across, or steer onto the plank. Pit level = lip level; depth is visual only (§7). Skins: DT utility trench, SB drainage ditch with a 1.4 m culvert slab, IN plate gap with two 0.9 m steel plates, NE cable trench with a grate plank. |
| `stairs` | 3 / 5 / 7 / 10 steps (rise 0.17, tread 0.30): drops 0.51 / 0.85 / 1.19 / 1.70 m | Drop | Roll (sticky slope) or ollie down. **Full width** (terrace, any count) or a **side set** at 3, 7 or 10 steps only: a side set's platform face is 0.51 m (Low) or ≥ 1.19 m (Tall), never the 0.85 m forbidden band. |
| `handrail` | follows the stairs: 0.60 above the nosing line, 0.5 m flat kink at the top, 0.05 wide | Low | G. Top end post is a crash face. |
| `hubba` | follows the stairs: 0.45 above the nosing, 0.6 wide | Low | G, T |
| `incline` | slope ≤ 1:10, ≥ 1.0 s·v long, rounded crest | Ground | Rideable. At the crest `vy` is clamped to the surface, so there is no launch. |

**Downtown Plaza**

| Kind | Size | Class | Interaction and notes |
|---|---|---|---|
| `granite_ledge` | 4–22 × 0.6 × 0.45 | Low | G on both long edges, T |
| `planter` | 3.0 × 1.5 × 0.50 | Low | G on the rim (all 4 edges), T |
| `planter_tree` | 3.0 × 1.5 × 0.50, plus a central trunk 0.3 Ø × 2.6 | Low + Tall | G on the long rims. The trunk is A, so no top ride. |
| `fountain` | 4.0 × 3.2 basin, rim 0.30 wide × 0.40 high | Low + P | G on the rim. The water is `splash`. |
| `bollard_row` | 0.25 Ø × 1.15 every 1.6 m, leaving 1–2 gaps of 2.4 m | Tall | A (forms gates) |
| `kiosk` | 1.6 × 1.6 × 2.4 | Tall | A. News kiosk with an awning. |
| `parked_car` | 4.4 × 1.8 × 1.4 | Tall | A, in parking bays |
| `bike_rack` | 2.4 × 0.7 × 1.15 (with bikes) | Tall | A |
| `cafe_set` | 1.2 × 1.2 × 1.2 (umbrella canopy at 2.2) | Tall | A |
| `news_box` | 0.5 × 0.5 × 1.15 | Tall | A. Column filler. |
| `terrace` | full width, 5–7 steps, 1–2 handrails or hubbas | Drop | A datum drop |
| `crosswalk_car` | 4.2 × 1.8 × 1.4 | Tall, M | A crosswalk with a signal light (mover, M5 stretch) |

**Suburbs**

| Kind | Size | Class | Interaction and notes |
|---|---|---|---|
| `garden_wall` | 3–10 × 0.4 × 0.50 | Low | G, T |
| `hedge` / `picket_fence` | continuous × 0.4 × 1.2–1.4 | Tall | A. Narrows the street. Side bump only. |
| `mailbox` | 0.4 × 0.4 × 1.2 | Tall | A |
| `wheelie_bins` | 0.7 × 1.5 × 1.2 (a pair) | Tall | A |
| `parked_car` / `parked_van` | 4.6 × 1.9 × 1.5 / 1.9 | Tall | A |
| `porch_steps` | side drop of 2 steps (0.34 m), with a 0.55 rail | Drop | G on the rail. An incline returns you to the street. |
| `yard_table` | 2.0 × 0.8 × 1.15 (a potting bench; nothing above the pot rims) | Tall | A |
| `crate_stack` | 0.6 × 0.4 × 0.30 | Low | O, T |
| `speed_hump` | 3.0 × full × 0.08 | Bump | B |
| `hoop_pole` | 0.2 × 0.2 × 3.0 | Tall | A |
| `bus_shelter` | 1.6 × 3.0 × 2.4 | Tall | A. Glass sides, ad panel facing the camera. |
| `backout_car` | 4.4 × 1.8 × 1.4 | Tall, M | Reverses out of a driveway, with reverse lights (mover, M5 stretch) |

**Industrial Docks**

| Kind | Size | Class | Interaction and notes |
|---|---|---|---|
| `container` | 6.1 × 2.4 × 2.6 | Tall | A. Forms channel walls. |
| `pallet_1` / `pallet_2` / `pallet_3` / `pallet_tall` | 1.2 × 1.0 × 0.15 / 0.30 / 0.45 / 1.20 | Bump / Low / Low / Tall | B / O, T / O, T / A. A readable "staircase" of sizes. |
| `ibeam` | 6–12 × 0.2 × 0.40 | Low | G |
| `loading_dock` | 10–30 × 2.5 × 1.2 (layer L1) | Layer | Reached by an incline at its start. G on the steel edge on the open side. Drop at the end. Its side face is a side bump. |
| `drum_cluster` | 2–5 drums on a skid, each 0.6 Ø × 1.15 overall | Tall | A |
| `spool_standing` | 1.2 Ø × 1.2 | Tall | A |
| `spool_lying` | 0.8 × 1.0 × 0.50 | Low | O. Non-landable round top. |
| `mooring_bollard` | 0.5 Ø × 1.15 (bollard with a frayed rope; a resting gull) | Tall | A. Sits on the apron near the lip, outside every lip grind sweep. |
| `dock_lip` | continuous × 0.3 × 0.30 at x +4.2…+4.5 | Low | G: **the signature long grind** (auto-capture; it is Low-class, not curb-class) |
| `rail_track` | flush embedded rails | Bump | B, with a clack sound |
| `forklift` | 2.5 × 1.2 × 2.1 | Tall, M | Amber beacon (mover, M5 stretch) |

**Neon City.** All signage uses invented brand names (§18.6) and a reviewed list of generic Japanese words. There are no religious structures, no real landmarks and nothing copied from any film, game or anime.

| Kind | Size | Class | Interaction and notes |
|---|---|---|---|
| `guard_rail` | 6–32 × 0.06 × 0.50 at x = ±3.0, with entry gaps ≥ 2.5 m about every 10 m | Low | G: cream top edge over an ink underline, like every grindable; the cyan glow is on the rail body only. End posts crash. |
| `vending_bank` | 0.8 × (1.0 per machine, 1–4 machines side by side) × 1.8 | Tall | A. **Lit fronts face the camera.** A single machine is a Neon column filler. |
| `viaduct_pillar` | 1.2 × 1.2 × 6.0 at x = 0, spaced ≥ 1.3 s apart | Tall | A, with x-ray cap. Carries the maglev's two thin edge beams; no deck over the street. |
| `holo_gate` | `barrier_low` skin | Low | O (full-width), `crash` top. Amber/ink chevrons on a solid base under the light bar. Optional 2.0 m slot. |
| `cherry_planter` | 2.4 × 1.2 × 0.50, plus a trunk 0.3 Ø × 2.8 | Low + Tall | G on the long rims. The trunk is A. Sheds petals. |
| `food_cart` | 2.0 × 1.2 × 2.2, paper lantern on top | Tall | A |
| `bike_row` | 4–8 × 0.6 × 1.15 | Tall | A strip |
| `skywalk` | deck 20–45 × 3.0 at +2.0 m (layer L1); 20 m incline at 1:10; guard rails on both deck edges | Layer | T and G. Exit by a 2.0 m edge drop onto open road. Nothing is placed on the road under the deck or within 3.4 m beyond its end in its columns (§10.6 rule g). |
| `a_frame_sign` | 0.5 × 0.4 × 0.55 | Low | K |
| `lantern_stand` | 0.4 × 0.4 × 1.6 | Tall | A |
| `neon_curb` | continuous × 0.3 × 0.15, glowing | Bump | B, G (curb-class: pick only) |
| `delivery_robot` | 0.7 × 0.6 × 1.15 (with its flag mast) | Tall, M | Six-wheeled box with a screen face (mover, M5 stretch) |

**Decor only, never in the collision model:**
- lantern strings at ≥ 3.2 m, ≤ 0.3 m thick on screen
- blade signs and holo billboards on poles, inner edge at |x| ≥ 4.9, facing the camera
- shop shutters on cross-street end walls
- the maglev guideway at 7 m: two thin edge beams (≤ 0.3 m wide) and the train's light streak, never a deck over the corridor
- puddles, petals, steam vents

### 10.4 Templates
A template is a parametric script. Element times `t` are in seconds from the segment start. `x` ranges are jittered, and the whole template may be mirrored unless `mirror:false`.

```ts
{ id: "DT_LEDGE_PAIR", area: "downtown", tier: 2, dur: 3.2, mirror: true,
  entry: [[-4.5, 4.5]], exit: [[-4.5, 4.5]],         // lateral sets that must be open at the edges
  els: [ { k: "granite_ledge", t: 0.4, x: [-3.2, -2.2], len: { sec: [1.0, 1.4] } },
         { k: "parked_car",    t: 1.6, x: -2.4 },
         { k: "granite_ledge", t: 1.9, x: [1.6, 2.6],   len: { sec: [0.8, 1.2] } } ],
  coins: [ { on: 0 }, { arc: [0, 2] } ], gaps: [ { name: "Ledge Hop", from: 0, to: 2, pts: 200 } ],
  safe: "auto" }                                       // safe line is computed by the validator (§10.6)
```

**Tiers**
- **T0:** no required action. Breathers, gateways and S_INCLINE_UP. The A1–A3 clocks pause inside T0 (§10.7).
- **T1:** one element.
- **T2:** two elements and one lane change.
- **T3:** overlapping elements, narrow choices.
- **T4:** expert. Narrow safe line, stacked hazards.

**v1 scope.** v1 ships the 9 shared templates, the 4 gateways and **6 templates per area** (marked **v1** below, each area's landmark included). The other 20 are M5 stretch. When an area has no v1 template of the drawn tier, the generator uses a tier-parametric shared template (S_GATE, S_TRENCH, S_STAIRS, S_BARRIER) at that tier. Templates that need movers are stretch, because movers are (§10.9).

**Shared templates** (all v1)

| ID | Tier | Dur (s) | Content | Trick line | Safe line | Coins |
|---|---|---|---|---|---|---|
| S_OPEN | T0 | 3–5 | Empty street (breather) | Optional single flat bar | Anywhere | Sine wave (breather coins) |
| S_CONES | T1 | 2.5 | Weaving cone line | Smash the cones | Anywhere | Between the cones |
| S_TRENCH | T1–T3 | 2.0 | Full-width trench with one plank | Flip across away from the plank | Steer onto the plank | Air arc away from the plank |
| S_BARRIER | T1–T2 | 1.8 | Full-width `barrier_low`, optional slot | Flip over it | Ollie, or use the slot | Arc over it |
| S_LADDER | T2 | 3.0 | 3 flat bars staggered 2.5 m apart laterally, overlapping 0.3 s | Rail-to-rail transfers | Lanes between the bars | Bar tops |
| S_GATE | T2–T4 | 1.5 | Row of tall blockers with 1–2 openings of 2.0–2.5 m, placed ≥ 3 m from the previous safe x | n/a | Through an opening | None (forces a wander) |
| S_PADS | T1 | 3.0 | 2–3 manual pads | Manual chain | Around the pads | Pad tops |
| S_STAIRS | T1–T3 | 2.5 | 3/7 side set + handrail, or a 5/7 full-width terrace (datum drop) | Grind or flip down | Roll down anywhere | Down the rail |
| S_INCLINE_UP | T0 | rise / (0.1·v), ≥ 1.0 | 1:10 incline paying back a datum drop (scheduled when the datum is below 0 with ≤ 15 s of the area left) | Crest flips | Anywhere | Wave up the slope |

**Downtown**

| ID | Tier | Dur | Content | Trick line | Safe line | Coins |
|---|---|---|---|---|---|---|
| DT_LEDGE **v1** | T1 | 2.5 | One sidewalk ledge, 1.2–2 s long | 50-50 / boardslide | Road | Ledge top |
| DT_LEDGE_PAIR | T2 | 3.2 | Ledges on alternating sides, a car between | Ledge → ledge transfer | Weave | Arc between |
| DT_BENCHES **v1** | T1 | 2.5 | 3 benches in a row, 0.5 s apart | Grind, hop, grind ("Bench Hop" gap) | Other half | Bench tops |
| DT_PLANTERS **v1** | T2 | 3.0 | 2 × 3 planter grid with tree variants | Rim grinds | Lanes between | Rims |
| DT_BOLLARDS | T2 | 2.5 | Bollard row with 2 gaps, a ledge lined up with one gap | Ledge → thread the gap | Either gap | Through the ledge gap |
| DT_FOUNTAIN | T2 | 2.5 | Basin offset to one side | Rim grind | Around | Rim |
| DT_TERRACE **v1** | T2 | 3.0 | Full-width 5-stair terrace with a rail and a hubba | Rail or hubba | Roll down anywhere | Rail |
| DT_CROSSWALK | T2–T3 | 3.0 | Phase-locked car + sidewalk bench (mover) | Bench grind | Pass behind the car | Bench |
| DT_HUBBA_KIOSK | T3 | 3.0 | Stairs with hubbas both sides, kiosk at the bottom centre | Hubba | Pick a side | Hubba |
| DT_RUSH **v1** | T3–T4 | 3.5 | Both parking lanes full, a double-parked car in the centre | Sidewalk ledges and rails | Zig-zag | Rails |
| DT_BIG7 **v1** | T3 | 3.0 | **"Amberlane Seven"**: full-width 7-stair with a long handrail (Landmark) | Rail, or tre flip down | Roll down | Rail |

**Suburbs**

| ID | Tier | Dur | Content | Trick line | Safe line | Coins |
|---|---|---|---|---|---|---|
| SB_WALL **v1** | T1 | 2.5 | Long garden wall | Grind or manual on top | Road | Wall top |
| SB_HILL **v1** | T0 | 3.0 | 1:15 dip and crest (breather) | Crest flips | Anywhere | Crests |
| SB_DRIVEWAYS **v1** | T2 | 3.0 | Parked cars jutting out, alternating sides | Curb grinds (pick) | Weave | Curbs |
| SB_BINDAY **v1** | T2 | 3.0 | Bin pairs every 0.6 s, alternating | Curb grinds between (pick) | Centre, weaving | Curb |
| SB_DITCH | T2 | 2.0 | Ditch + culvert slab | Flip the ditch | Slab | Air arc |
| SB_PORCH | T2 | 3.0 | Side porch drop + rail, incline back up | Rail | Road | Rail |
| SB_YARDSALE | T3 | 3.0 | Tables (A) with a crate line (T) | Crate manual | Opposite lane | Crates |
| SB_BUSSTOP | T2 | 2.5 | Bus shelter (A, 2.4 tall) with a bench in front | Bench grind | Road | Bench |
| SB_BACKOUT | T3 | 3.0 | Car reversing out of a driveway (mover) | Wall grind past it | Pass behind | Wall |
| SB_PICKET **v1** | T3 | 3.5 | Hedges narrow the street to the road; mailbox slalom | Curb runs | Slalom | Curb |
| SB_SCOOPS **v1** | T2 | 3.0 | **"Corner Scoops wall"**: long low wall outside the ice-cream shop (Landmark) | Long wall grind | Road | Wall |
| SB_HEDGEMAZE | T4 | 4.0 | Alternating 2 m passages between hedges | Garden-wall grinds | Snake | Walls |

**Industrial Docks**

| ID | Tier | Dur | Content | Trick line | Safe line | Coins |
|---|---|---|---|---|---|---|
| IN_BEAM **v1** | T1 | 2.5 | Long I-beam | Long grind | Beside it | Beam |
| IN_LIP **v1** | T1 | 3.0 | **"Pier 9 lip"**: dock-lip run 2–3 s with mooring bollards on the apron (Landmark) | Lip grind | Apron | Lip |
| IN_PALLETS **v1** | T2 | 3.0 | Pallet "staircase": 1 / 2–3 / tall | Manual on top | Around | Tops |
| IN_CHANNEL **v1** | T2 | 4.0 | Container walls with a 3 m channel that shifts sideways | Beam inside | Follow the shift | Beam |
| IN_DOCK_UP **v1** | T2 | 4.0 | Incline up onto the loading dock, ride along it, drop off | Edge grind, drop flip | Apron | Dock |
| IN_DRUMS | T2 | 2.5 | Drum clusters with clear lanes | n/a | Lanes | Lane switches |
| IN_SPOOLS | T2 | 3.0 | Standing (A) and lying (O) spools, alternating | Ollie the lying ones | Weave | Air arcs |
| IN_FORKLIFT | T3 | 3.0 | Phase-locked forklift + pallets | Pallet manual | Pass behind | Pallets |
| IN_PLATEGAP | T3 | 2.5 | Beam leading into a plate gap | Grind → gap | Steer onto a plate | Air arc |
| IN_GAUNTLET **v1** | T4 | 4.0 | Loading-dock high line with gaps (0.3 s·v), drums on the low line | Gap to gap | Thread the drums | High line |

**Neon City**

| ID | Tier | Dur | Content | Trick line | Safe line | Coins |
|---|---|---|---|---|---|---|
| NE_RAIL **v1** | T1 | 3.0 | Guard rail, 1.5–3 s long | Long glowing grind | Road | Rail |
| NE_SHUTTERS | T0 | 3.0 | Shutter-row street, knockable A-frames, neon curbs (breather) | Curb grind (pick) | Anywhere | Wave |
| NE_PILLARS **v1** | T2 | 3.5 | Median pillars every 1.3 s, split lanes, a rail on the right lane | Rail | Pick a side, switch at gaps | Rail |
| NE_VENDING **v1** | T2 | 3.0 | Vending banks narrowing the sidewalks, benches | Bench grinds | Road | Benches |
| NE_HOLOGATE | T2 | 2.0 | Holo gate, sometimes with a slot | Flip over it | Slot, or ollie | Arc |
| NE_SAKURA **v1** | T2 | 3.0 | Staggered cherry planters | Rim grinds | Lanes between | Rims |
| NE_MARKET | T3 | 3.5 | Food carts on both sides, benches, lantern stands | Bench grinds | Centre | Benches |
| NE_SKYWALK **v1** | T3 | 6.0 | **"Sora Line Skywalk"**: 20 m incline up to the +2.0 m deck (the deck fills the remaining time, 20–45 m), rails, 2 m drop out (Landmark). Only drawn at T3+, i.e. from 90 s (v ≥ 8.9). | Rail → drop triple | Road below (kept clear under the deck) | Deck (Gold Stack) |
| NE_SCRAMBLE | T3 | 3.0 | Zebra scramble crossing, 2 phase-locked robots, flat bar (mover) | Bar | Gap between robots | Bar |
| NE_BIKES | T3 | 3.0 | Bike rows lining the lanes, flat bars between | Bars | Lanes | Bars |
| NE_GAUNTLET **v1** | T4 | 4.0 | Pillars + holo gate + rail transfer | Transfer → gate flip | Narrow weave | Line |

Areas get about equal template variety: 11 Downtown, 12 Suburbs, 10 Docks and 11 Neon, plus 9 shared templates (re-skinned per area; the Neon S_BARRIER skin is the holo gate) and 4 gateways. v1 ships 6 per area. Neon's look in v1 (vending machines, lantern stands, shutters, billboards, maglev, guard rails, cherry planters) also comes from its column fillers (vending machine, lantern stand) and decor, not only from templates.

### 10.5 Stitching rules
- **No required actions** in the first 0.6 s or the last 0.4 s of a template.
- **Open-width check.** Where a template's exit set meets the next template's entry set, the shared open width must be ≥ 2 m. Otherwise a 0.8 s filler (S_OPEN cut down) is inserted.
- **T4 limits.** T4 never follows T4. It is always followed by a T1 or a breather.
- **Area-only templates.** Templates tagged with an area appear only in that area. Shared templates are re-skinned.
- **Column fillers.** If a lateral column is overdue on the A1 column rule (§10.7), the generator mirrors or shifts the next template to block it. If that fails, it inserts a filler blocker (DT bin or news box, SB bin pair or mailbox, IN drum or tall pallet, NE vending machine or lantern stand) in the overdue column, outside the computed safe line. **Inserting a filler re-runs validation.**
- **Full-width hazard scheduler.** A3 slots in a `S_TRENCH` or `S_BARRIER` (area skin) when one is due.
- **Datum payback.** When the datum is below 0 with ≤ 15 s of the area left, the next segment is S_INCLINE_UP.
- **Boundaries.** Grind edges and L1 decks end inside their own segment.

### 10.6 Safe-line validator (the fairness guarantee)
Every candidate segment is validated together with a **history window** of the previous segment before it is committed. The history length is `max(1.0 s, R_MIN(t), T_SHIFT of the last required lateral move)`, so spacing rules always see the previous required action.

**1. Grid and geometry (matches the sim's collision, §7)**
- Lateral cells are 0.25 m wide: 36 cells across ±4.5.
- Forward slices are 1/30 s each, converted with `Δs = v(t)·Δt`.
- Each cell stores: ground height on L0 (datum, including stairs and slopes), the solid top height and top type, and flags for pit, mover-swept (when movers exist) and non-landable. **The validator ignores L1 entirely** (decks, platform tops): L1 lines are optional and are checked only by rule (d).
- **Hitbox dilation.** Each inset solid is dilated by the skater's half-hitbox, 0.20 m laterally and 0.35 m along `s`, plus `SAFE_MARGIN` 0.10 m laterally, before rasterizing. A safe path therefore never clips a blocker.
- **Same contact rules as the sim:** a `crash`-top solid prunes any state whose board bottom is below its top (no skim); a `landable` solid prunes states more than 0.18 m below its top; pits prune any state with the board centre over them at lip level.

**2. States**
- *Ground on L0*, or *air plane (take-off kind, k)*: take-off kind is pop or roll-off, k = 1…AIR_MAX slices since take-off. Each air byte also stores its **take-off height** (the minimum when two paths merge), because airtime and apex depend on it.
- **On the ground** the model may:
  - shift sideways by a reach of `0.70·V_LAT_MAX·Δt`, which spreads the bitset;
  - ollie, entering a pop plane at k = 1 (never on an incline or stair slab);
  - roll off an edge into a roll-off plane.
- **In the air** it shifts by `0.35·V_LAT_MAX·Δt` per slice and follows the board-bottom height `y(kind, k, takeOffH)`. It lands when that height reaches the cell's ground.

**3. Passes**
- The **forward pass** computes the reachable sets `F_i`. It starts from the **stored full plane set** (ground and air) at the start of the history window, not from a ground-only summary.
- The **backward pass** computes the viable sets `B_i`: states from which the segment's exit, plus 1 s of the next segment's open entry, can still be reached.
- A **backward max-survival pass** stores, per cell, how long the best path from that state survives (one `Uint8` of slices per cell). It feeds rule (h).
- **Committed exit set** `E = F_end ∩ B_end ∩ {|x − safeExitX| ≤ 2.0 m}`. It is what the next segment must accept; states far from the safe line are covered by rule (h) instead.

**4. Required actions.** On the minimum-action path, a **required action** is either an ollie (timed at take-off) or a maximal run of same-direction lateral movement of at least 0.5 m (timed at its start). The minimum-action path comes from a **forward DP** over (slice, plane, cell, last lateral direction): time only moves forward, so no Dijkstra heap is needed. Cost = ollies + direction reversals + 0.1 × metres of lateral travel.
- **Latest valid start** of a required action = the last slice at which holding the pre-action state (same x, still on the ground) is still inside `B`.

**5. Accept the segment only if all of these hold:**
- (a) Every state in the previous segment's committed exit set `E` is in `B_0`.
- (b) **Spacing.** For consecutive required actions, `start(next) − start(prev) ≥ max(R_MIN(t), T_SHIFT(dx_prev))`.
  - `R_MIN` is 1.6 / 1.2 / 1.0 / **0.9 s** (§11).
  - `T_SHIFT(dx) = 0.35 + dx / (0.70·V_LAT_MAX)` s: 0.87 s for a 2 m move, 1.13 s for 3 m.
- (c) **Decision time.** Every required action's latest valid start is ≥ **1.2 s** after its hazard enters the guaranteed view, which happens 2.5 s before contact. Equivalently, latest start ≥ contact − 1.3 s.
- (d) **No trick-line traps.** Every elevated surface (L1) and every grindable edge must end in an **exit zone**. The exit zone is ≥ 0.6 s·v long and ±1.5 m wide, centred on the line's end, with no crash faces in it. It must also intersect `B`. Each edge's **grind sweep** (the hitbox swept along the edge, plus the exit zone) must be free of solids. Rail ends must not point into a tall blocker within 1.0 s. Every optional line rejoins the safe line.
- (e) **Height bands.** No solid top in 0.61–1.14 m. Full-width hazards are ≤ 0.50 m tall, ≤ 0.6 m long, and pits are ≤ 0.35 s·v long.
- (f) **Anti-straight rules** (§10.7) still hold, considering the rolling history.
- (g) **Occlusion.** No crash face sits within `h·cot35° + 0.5 m` behind a solid in the same columns, where `h = min(height, 1.6)` (the x-ray cap hides the rest) and only faces reachable from `F` count. L1 decks count as solids for this rule, and nothing is placed under a deck.
- (h) **Short dead ends.** Every state in `F_i \ B_i` (reachable but doomed) must die within **2.0 s**. Dead-end pockets therefore reveal themselves inside the 2.5 s view.
- (i) **Greedy-player check.** A deterministic grid version of the myopic bot (§10.11: nearest open lane in a 1.5 s look-ahead, 0.35 s reaction, 75% lateral reach) is run from the safe exit state. The segment is rejected if it ever enters a state outside `B`. The lane that *looks* open must not be a trap.

**6. Ollie timing window.** An obstacle of effective height `h` and length `d` is clearable at speed `v` only if:

`window = (t₂(h) − t₁(h)) − (d + 0.70)/v ≥ W`

Here `t₁`, `t₂` are the times the board bottom crosses `h` on a flat ollie, and **W = 0.25 s for required ollies on the safe line, 0.15 s for optional trick-line ollies**. Because airtime is fixed in seconds, the window grows with speed. A trench at the 0.35 s·v maximum gives exactly 0.25 s.

**7. On failure**
- Re-roll the parameters up to 6 times (jitter, mirror, shift).
- Then drop the template's hardest element.
- Then use the **constructive fallback**, which is valid by construction: S_OPEN, plus tall fillers in every overdue column (A1), or an S_BARRIER (A3 overdue), or a 6 m filler wall centred on the safe x (A2 overdue). The fallback is validated too.
- The dev overlay logs rejections. CI asserts the rejection rate is < 5% and the fallback rate is < 1%.

**8. Output.** The committed path is written as `SafeKey[]` (`{t, s, x, action?}`), used by bots, the debug overlay and coin placement.

### 10.7 Anti-"just go straight" rules (the owner's concern)
The A1–A3 clocks run on non-T0 time: they **pause inside T0 segments** (Roll-out, gateways, breathers, S_INCLINE_UP), which never carry required actions.

| Rule | Requirement |
|---|---|
| **A1 Column rule** | From **t = 9 s** (the end of the Roll-out), every 0.5 m lateral column hits a **tall** blocker (not ollie-able) at least once every 8 s (opening), 6 s (warm), 5 s (build) and **4 s (plateau)**. Tapping ollie at every hazard cannot save a straight line. |
| **A2 Wander rule** | From t = 9 s, the centre of the safe line must shift ≥ 3 m sideways at least every 8 / 6 / 5 / 4 s, matching the phases in A1. |
| **A3 Full-width hazards** | A trench or barrier (area skin) arrives every 8–12 s (12–16 s in the opening). It needs an ollie, or a steer onto the plank or slot. |
| **A4 Score** | Straight survival earns distance only (1 pt/m, about 10 pts/s at the plateau) plus 50-point ollies. Trick play is worth 8–15k pts/min (average) to 20–35k (good). CI: at the plateau, a survival-only bot's score per minute must be ≤ 10% of the trick bot's. |
| **A5 Coins** | ≥ 75% of placed coins sit on trick lines (rail tops, air arcs over gaps and hazards, elevated layers, manual pads). ≤ 10% sit on the safe line outside breathers. No ground coin string stays at one x for more than 1.5 s. |
| **A6 Magnet** | Rail capture happens only while airborne, and curb-class edges need a pick swipe, so rolling straight never grinds anything. |

**Straight-bot guarantees** (CI, §10.11): from a normal start, every lane crashes by **t ≤ 20 s**; from a plateau start (`startT = 150`), every lane crashes within **10 s** (A1's 4 s period plus at most one T0 stretch).

### 10.8 Coin placement
- **Strings:** 5–8 coins worth 1 each, spaced 0.12 s·v apart.
  - Along a grind edge, at edge top + 0.35 m.
  - Along an ollie arc, at the flat-ollie parabola + 0.25 m, starting at the take-off point the validator found.
  - On manual pads and elevated decks, at + 0.35 m.
- **Gold Stack (10):** one per hard line, at the line's apex or end: transfers, high rails, Neon elevated sections, T3+ lines.
- **Density:** about one string every 8 s in the warm phase and every 5 s at the plateau, which is 40–70 coins/min available. Gateways and breathers carry a "free" wave string.
- **Pickup volume:** 0.6 m lateral × 0.8 m forward × 1.4 m vertical (±0.7 m) around the coin, tested against the skater's centre (board bottom + 0.75 m). Arc coins at parabola + 0.25 m sit 0.5 m below that centre, comfortably inside the volume.

### 10.9 Moving obstacles (sparse, phase-locked; **deferred to M5 stretch**)
v1 ships no movers and none of the four mover templates. The rules below stay as the spec for when they are added; the validator's mover mask and `MoverDef` already exist in the contract.
- **M1 Phase-locked.**
  - A mover's x position is a pure function of the **player's** `s`: `x = lerp(from, to, clamp((s_p − s_start)/(s_end − s_start), 0, 1))`.
  - The scene looks the same every time you arrive, so the validator treats the swept area as a static mask over its slices.
  - Frame hitches cannot desync it.
- **M2 Motion.**
  - Lateral only, ≤ 3.5 m/s apparent, always entering from outside the corridor.
  - Telegraphed ≥ 2.0 s ahead by a crossing light, beacon, reverse lights or a glow ring.
  - Movers never stop inside the corridor.
- **M3 Frequency.**
  - No movers before t = 45 s.
  - At most 1 per template, and at most 1 per 10 s (warm), 8 s (build) or 6 s (plateau).
  - Never within 1 s of another required action.
- **M4 Clearance.** Always leaves a ≥ 2.5 m gap. Passing behind is the safe line.
- **M5 What moves:**
  - crosswalk car (Downtown)
  - car backing out of a driveway (Suburbs)
  - forklift (Docks)
  - delivery robots (Neon)
  - The maglev is overhead decor only. There are no pedestrians or animals in the corridor.

### 10.10 Elevation rules (no launch ramps, ever)
- **Down:** stair sets (0.51 / 0.85 / 1.19 / 1.70 m), planter and wall tops (0.5), the loading dock (1.2), the skywalk (2.0) and the Harbor Bridge (2.0). Rolling off any edge is an automatic, harmless drop; rolling onto stairs follows them down (§5.3).
- **Up:** inclines only, slope ≤ 1:10, ≥ 1.0 s long, with a rounded crest.
- **No required actions on inclines or stairs.** Airtime there differs by up to ±16% (0.51 s uphill, 0.70 s downhill at 10.5 m/s on 1:10), so the validator never lets an ollie take off from a slope slab, and no hazard sits on one.
- **Side sets** are L1 platforms whose face is 0.51 m (3-stair) or ≥ 1.19 m (7- and 10-stair). The 5-stair (0.85 m) is full-width only, because a 0.85 m side face would sit in the forbidden band.
- **Datum rule:**
  - Each area starts and ends at y = 0, with net elevation within ±2.4 m.
  - A full-width drop (terrace, full-width stairs) must be paid back before the area ends. **S_INCLINE_UP** (T0, 1:10, duration = rise / (0.1·v), at least 1.0 s) is scheduled whenever the datum is below 0 with ≤ 15 s of the area left.
  - Optional layers (L1 decks, ledge tops) never move the datum.

### 10.11 Bot verification (CI)
All bots drive the real `Sim` only through `InputFrame`s (TECH §11). Seed counts are per gate; **releases double them with fresh seeds**.

| Check | Rule | Pass criteria |
|---|---|---|
| **Safe bot ("human")** | Plans with the validator's planner, but only on what was inside the guaranteed 2.5 s view **0.25 s ago** (reaction), with +0.15 s input latency, ±0.05 s timing jitter and 85% lateral speed. It steers by setting `targetX` to its plan's x at t + 0.15 s. | `npm test`: 20 seeds × 4 min starting at the plateau. Gates: 100 seeds × 8 min from t = 0, plus 100 seeds from the plateau. Release: 200 + 200 fresh seeds. **0 crashes.** |
| **Myopic bot** (the owner's question) | Greedy: steers to the nearest open lane it can see in a **1.5 s** look-ahead. Reaction 0.35 s, 75% lateral speed, ±0.08 s jitter. Ollies full-width hazards and takes planks or slots when they are the nearest open lane. | 100 seeds starting at the plateau, capped at 8 min: **median survival ≥ 4 min**. (It may crash; it models a player who misreads lines.) |
| **Thumb bot** (real touch path) | The safe bot's plan rendered as synthetic pointer traces with human jerk and thumb arc, run through the real recognizer: taps 60–260 ms, ±3 px tremor, ±25° flick arcs, 0.25 s total latency, a resting thumb between moves, and air dodges with the steering thumb | Gates: 20 seeds × 4 min at the plateau. Release: 50 seeds. **0 crashes, and 0 unintended flips, spins, grabs or manuals.** |
| **Conformance** | A perfect SafeKey follower (exact `targetX`, ollie on the key tick) | 50 seeds × 4 min from t = 0: **0 crashes**. Proves validator geometry and sim collision agree. |
| **Straight bot** | Holds a constant x (each of 9 lanes) and taps ollie at every full-width hazard | From t = 0: **100%** of lanes and seeds crash by t ≤ 20 s. From the plateau: within 10 s. |
| **Trick bot** | Greedy: takes trick lines and flicks the highest-value trick that fits; keeps combos going like a good player (an extra flip pop after 60% of landings when the plan holds its line and the air is clear, a bridging manual up to the plan's next ollie) and pops off the 2.0 m decks for the long air (G1) | Doubles fit rail pop-offs and stairs, triples fit the ≥ 2.0 m drops, and a 360 spin fits a flat ollie, at 7 and 10.5 m/s. No trick-line deaths in 50 seeds × 5 min. **p95 combo duration ≤ 45 s.** Its score lands in the §13.7 good-play band (20–35k pts/min). |
| **Score ratio** | Survival-only bot vs trick bot at the plateau | ≤ 10% |
| **Static asserts** | Over the gate's seeds × first 3,000 m | Every hazard visible ≥ 2.5 s. Decision time ≥ 1.2 s. Required-action spacing ≥ `R_MIN`. Required ollie windows ≥ 0.25 s. Dead ends die within 2.0 s. No forbidden-band solids. Every area datum closes to y = 0. Coin share on trick lines ≥ 75%. |

---

## 11. Difficulty curve

Time and distance map to each other exactly, because speed follows the schedule. **After 150 s nothing gets harder.**

Density figures are **targets for measured outputs** (±25%), not inputs: the generator's tier weights and breathers produce them, and the final values are whatever keeps the myopic-bot gate (§10.11) green. The floors (`R_MIN`, A1/A2 periods) are hard rules.

| Phase | t (s) | v (m/s) | Required actions / 10 s (incl. breathers) | Mean spacing outside breathers / floor `R_MIN` | Trick elements / 10 s | Tier weights | Breather (T0) | A1 / A2 period | A3 full-width |
|---|---|---|---|---|---|---|---|---|---|
| **Opening** | 0–45 | 7.0 → 7.34 | 2.5 | ~4.0 / **1.6** | 3 | Lesson Line or Roll-out (0–9 s), then T1 only | Roll-out and the Greenway gateway | 8 s (from t = 9) | 12–16 s |
| **Warm** | 45–90 | 7.34 → 8.99 | 4 | ~2.1 / **1.2** | 4 | T1 60, T2 40 | 5 s every 30 s | 6 s | 8–12 s |
| **Build** | 90–150 | 8.99 → 10.5 | 5 | ~1.7 / **1.0** | 5 | T1 25, T2 50, T3 25 | 4 s every 30 s | 5 s | 8–12 s |
| **Plateau** | 150+ | **10.5 flat** | **6** | ~1.4 / **0.9** | 5 | T1 15, T2 40, T3 35, T4 10 | 4 s every 20–30 s | **4 s** | 8–12 s |

- Gateways (4 s, §12.2) count as breathers.
- **Breather placement (G1, owner playtest: "parts feel like waiting"):** one 3.5 s breather near the middle of each 35 s visit (16–20 s after the gateway), never within 8 s of the next gateway, so no gap between breathers exceeds ~20 s and no empty stretch is longer than one breather. A breather ≥ 3.4 s carries the optional flat bar off the line (75%).
- At the plateau, difficulty comes from density, tier mix and area variety, never from speed. The plateau is deliberately one notch calmer than "maximum", so long runs stay chill and possible.
- Movers are deferred (§10.9); when added they come in at ≤ 1 per 10 s (warm), 8 s (build) and 6 s (plateau).

---

## 12. Area cycling, gateways and the opening

### 12.1 Order and timing (every run starts Downtown)

| Area | Visit length | Sky preset (§18.1) | Arrives at (first loop) | v on arrival |
|---|---|---|---|---|
| Downtown Plaza | First visit **40 s** (includes the Roll-out or the Lesson Line), later visits 35 s | Golden hour | 0:00 | 7.0 |
| → Gateway **Greenway** | 4 s | blend | 0:40 | 7.2 |
| Suburbs | 35 s | Late gold | **0:44** | 7.3 |
| → Gateway **Level Crossing** | 4 s | blend | 1:19 | 8.5 |
| Industrial Docks | 35 s | Sunset | **1:23** | 8.7 |
| → Gateway **Harbor Bridge** | 4 s | blend | 1:58 | 10.0 |
| **Neon City** | 35 s | Blue hour | **2:02**, the "you made it" reward, just before top speed | 10.1 |
| → Gateway **Underpass** | 4 s | resets to golden inside the tunnel | 2:37 | 10.5 |
| Downtown (loop 2) … | 35 s each | | 2:41 | 10.5 |

- One full loop takes 156 s, so an average 2.5-minute run sees all four areas.
- **Furthest area** and **Area Postcards** (§14) count first arrivals **through a gateway**; the starting area never counts as "reached".
- The **New Ground** bonus (+500) is paid on every gateway arrival.
- **Every gateway entry banks the combo** ("SET BANKED!", §13.2).

### 12.2 Gateways (T0, 4 s, coins, no required actions)
Each gateway hides the swap of building kit and carries the palette and music crossfade. The palette blends over 8 s, centred on the gateway.

| Gateway | Content |
|---|---|
| **Greenway** (DT → SB) | Park path, low walls, curbs fade out, leaves blowing |
| **Level Crossing** (SB → IN) | Raised gate arms, flush rail tracks (bumps), chain-link starts |
| **Harbor Bridge** (IN → NE) | An optional bridge deck (L1, like the skywalk) on one side: a 1:10 incline up 2.0 m (about 2 s at v ≈ 10), a guard rail along the deck, the city's glow ahead, then a 2.0 m edge drop. The open road beside it is the safe line, so the datum is untouched and the gateway fits in 4 s. A triple-flip spot. |
| **Underpass** (NE → DT) | Tiled tunnel with warm sodium lights. The sky resets to golden while you're inside: "a new day". |

### 12.3 The Lesson Line (first runs only; fixed seed; 0–40 s)
- **How it plays:**
  - Runs use the Lesson Line until the player has done every taught move once (saved), for at most the first 3 runs. After that they start with the Roll-out (§12.4).
  - Each move is taught by a ghost-thumb icon (key caps on desktop) with a short label. No text walls.
  - **Two thumbs** (the default on touch, §4.1): in runs 1–3 two faint rings sit **10–16% from the bottom** on their sides, below the skater so resting thumbs don't cover it: **STEER** (left; a ghost thumb with a short ↔ arrow) and **TRICKS · TAP · FLICK · HOLD** (right; a ghost thumb that acts the tap, flick or hold). Ring labels are 11 px·k with an ink shadow. The ghost of the side the hint is about acts, the other waits faintly: the steering ghost rests on its ring, the trick ghost **hovers** above its ring (lifted, its shadow on the ring) and its tap and hold come down from the hover and go back up, because a right thumb left on the glass is a HOLD (§4.4 rule 3).
  - **Wrong-side feedback** (while the rings are up): a tap on the steering half pulses the TRICKS ring, and a slow sideways drag on the trick half pulses the STEER ring, so a player who taps or steers on the wrong side learns the split in seconds (the touch itself still does nothing). Labels name the thumb where it matters: "DRAG LEFT THUMB TO STEER", "TAP RIGHT TO OLLIE", "FLICK ← ON THE RIGHT", "HOLD RIGHT TO MANUAL" (sides swapped with Swap sides); the others keep their words ("OLLIE ONTO THE LEDGE", "SWIPE ↓ INTO THE RAIL", "SWIPE ↗ TO SPIN"). **One thumb:** one "rest here" ring in the middle and the one-thumb words ("DRAG TO STEER", "TAP TO OLLIE"). The keys wording (fine pointer) is unchanged.
  - **Zone cue** (two thumbs, touch): for the first 3 s of runs 1–3, and of the first run after the app opens (a returning player meets the split too), two soft rounded pads and a faint dashed midline fill the bottom band (3–22% from the bottom: below the skater, never in the look-ahead zone, `pointer-events: none`), then fade out. When no ring is up (a returning player) the pads carry their names, **"STEER ↔"** and **"TRICKS"**.
  - Speed follows the normal schedule (7.0 m/s for 20 s).
- **Assists:**
  - A required hazard that hasn't been answered 1.0 s out slows time to 0.5× (loop time scale, so the sim stays deterministic) until the player acts.
  - A crash rewinds 1.5 s, up to 3 times.

| t (s) | s (m) | Content | Teaches |
|---|---|---|---|
| 0–3 | 0–21 | Plaza roll-out, S-curve of 8 coins | **Drag** (left thumb) to carve |
| 3.5 | 25 | Full-width low road-works barrier (`barrier_low`, 0.35 m: a chevron board on two trestles, ivy on the legs only; no chains, §24 row 74), coin arc. The first required action. | **Tap** (right thumb) = ollie |
| 6–9 | 42–63 | Granite ledge at x = +2, magnet, coins on top | **First grind within 6 s** |
| 10–13 | 70–91 | Two bench pairs at x = −2; ghost ↓ as the edge glows and the chevron appears | **Swipe into a rail** (right thumb) picks the grind (watch for the glow) |
| 14–17 | 98–119 | Parked car centre-right; the left ledge continues | Tall things must be avoided |
| 18–21 | 126–147 | 5-stair terrace (−0.85 m) with a centre handrail; ghost ← at apex (0.4× slow-mo) | **Flick in the air** (right thumb) = flip. Drops are safe. |
| 22–25 | 154–175 | 3 manual pads; ghost hold | **Hold** (right thumb) = manual. The combo counter and bank arc appear. |
| 26–29 | 182–203 | Rail ladder | Transfers |
| 30–32 | 210–224 | 1:10 incline back up 0.85 m (datum payback), coins on the crest; ghost ↗ on the flat crest (optional, nothing to react to) | **Swipe up-right** = FS 180 ollie |
| 33–35.5 | 231–249 | Trench + plank | First full-width pit |
| 36–40 | 252–281 | Ledge → bench hop → planter rim mini-line, double coins, combo popup | Putting it together, then a big bank before the gateway banks it for you |

The Greenway gateway follows at 40 s.

### 12.4 The Roll-out (every later run)
Every later run starts with the **first 9 s** of the Lesson Line, with no prompts:
- carve the coin S-curve
- ollie the road-works barrier at 3.5 s (nothing to react to before that, so the instant-retry reward toast is gone in time)
- grind the mossy granite ledge with its waxed coping at 6–9 s

Geometry, timing and the chunk cache are unchanged by the RECLAIM skin.

This keeps "fun in 5 seconds" and gives veterans a familiar warm-up. Procedural generation (Opening phase) takes over at 9 s, and the A1/A2 clocks start then. The Roll-out's chunks are identical every run, so they are cached and not rebuilt on retry.

**Start District (M5 stretch).** A Title picker lets a player start in any area whose postcard they have earned. Each area gets a 9 s area-skinned Roll-out (T0 coins plus one area ledge). Difficulty is unchanged because it is time-based; the timeline simply rotates to start in that area (`RunConfig.startArea`, already in the contract). Starting in Neon begins at blue hour, and the Underpass resets the day. Postcards and Furthest Area still count only gateway arrivals.

### 12.5 Hints
- **Re-teaching.** If the player crashes on the same hazard type for 3 runs in a row, that hint is re-armed once.
- **Two-thumb re-teach** (§24 row 71). A profile that played before the two-thumb controls (more than 3 runs, and its save has no `settings.controls`) gets the first-runs teaching once more, in its next normal run on a touch screen with two thumbs: the two rings, the chips ("DRAG LEFT THUMB TO STEER", "TAP RIGHT TO OLLIE", "OLLIE ONTO THE LEDGE") and two toasts, "New: left steers · right tricks" and "One thumb? Settings › Controls". Saved in `onboarding.twoThumbIntro` (−1 due, then the run's number), so it happens once.
- **Desktop discovery.** On desktop, a one-time key overlay appears during the first run, and the full key list is on the pause screen.
- **Trick discovery.** A "Trick Book" toast teaches new flips the first time a direction is used: "↙ VARIAL KICKFLIP — new!".

---

## 13. Scoring and combos

Every scoring tunable lives in `src/tricks/score.config.ts`. Every economy tunable lives in `src/meta/economy.config.ts`.
- Score is never multiplied by speed.
- Grinds, manuals and grabs pay per **second**.
- Gear never affects score, hitboxes or physics.

### 13.1 Base points
- **Air tricks:** ollie 50, plus the flip table in §6.1 (100–650), the spins in §6.1a (150 / 350) and the Indy Grab (100 + 150/s).
- **Grinds:** entry points + per-second points from §6.2.
- **Manuals:** Manual 75 + 100/s, Nose Manual 100 + 125/s.
- **Rounding:** each trick's points (after its modifiers and decay) are rounded to an integer before summing.

**Modifiers on a trick's points**

| Modifier | Effect |
|---|---|
| Perfect landing | ×1.25 on that air's tricks |
| Perfect Lock | ×1.25 on that grind |
| Double-up (2nd separate flip in one air) | ×1.5 on the second flip |
| Sketchy landing | ×0.5 on that air's tricks, and the combo banks at once |
| Repetition decay | §13.4 |

### 13.2 Combos
- **Start:** any scored trick starts a combo, a plain ollie included.
- **Links feed the multiplier:**
  - Every **flip, spin, grind, grind switch, grab and Transfer** adds +1 link. A **Revert** adds +1 link only if its spin added one.
  - A **manual** adds +1 link once per combo.
  - **Plain ollies add no link.** They are connectors: they score points and keep the link window alive.
  - A trick whose repetition factor is < 0.45 adds no link.
- **Multiplier** = `max(1, links)`, capped at **×30**.
- **Link window.** After a ground touchdown you have **0.75 s** to pop or start a manual again.
  - Landing from the air straight into a grind links automatically.
  - While manualling, the window is paused, up to the manual budget (§6.4).
  - A Near Miss refreshes the window.
- **Combo heat.** A link-adding trick must start within **2.5 s** of the previous one, or the combo banks.
  - Heat counts down while rolling or airborne, and is paused while grinding or manualling.
  - It resets to 2.5 s whenever a link-adding trick starts. **Ollies and near misses refresh only the 0.75 s link window, never the heat**, so hopping every 0.7 s can't keep a combo alive forever; you have to keep doing real tricks.
- **Gateway bank.** Every gateway entry banks the combo at once ("SET BANKED!"). A flip still rotating then scores into a new combo when it lands. Combined with heat, a combo can never outlive one area visit (≤ 40 s).
- **Bank timer.** The world-space arc around the board's contact shadow (§9) shows the time until the combo banks: `min(heat, link window while rolling)`. It shrinks cream → coral and pulses with a rim tick in its last 0.25 s. The combo pill repeats it as a thin ring (secondary).
- **Bank.** When the window or the heat expires, on a Sketchy landing, or at a gateway, the combo is added to the total with a chime and a floating "+5,028".
- **Crash.** The run ends and the **unbanked combo is lost**. Results show it struck through ("−5,028 lost"). Bank now or keep linking: that is the core greed tension.

```
banked = round( (Σ round(trickPts × modifiers × decay) + Σ flatBonuses) × min(30, max(1, links)) × (1 + variety) )
variety = min(0.50, 0.05 × max(0, uniqueTrickNames − 2))
```

### 13.3 Bonuses

| Bonus | Condition | Reward |
|---|---|---|
| **Near Miss** | §7 | Inside a combo: +75 (flat). Refreshes the link window, not the heat. Outside a combo: +25, banked directly. Once per obstacle. |
| **Transfer** | Edge → a different edge without touching ground | +250 and +1 link |
| **Pop-out** | Tap or ↑ to pop off an edge before its end | +50 |
| **180 Out** | ↗ / ↖ to pop off an edge with a spin (§6.3) | +100 (the spin also scores) |
| **Revert** | Ground touchdown after a 180 (lands fakie, pivots back) | +50, and +1 link if the spin added one |
| **Gap** (tagged by templates) | Bench Hop 200 · Ledge Hop 200 · Planter Gap 250 · Trench / Ditch / Plate Gap 200 (airborne across, not via the plank) · Pallet Hop 150 · Spool Hop 150 · Shutter Hop 150 · 3 / 5 / 7 / 10 Stair Set 150 / 200 / 300 / 500 · Dock Drop 250 · Skywalk Drop 400 · Bridge Drop 400 | Flat bonus, inside the combo, no link |
| **Landmark** | First trick on the area's landmark per visit: Amberlane Seven, Corner Scoops wall, Pier 9 lip, Sora Line Skywalk | +300 |
| **New Ground** | Entering any area through a gateway | +500, outside any combo |
| **Knock** | Knock over a cone or A-frame | +10, outside the combo |
| **Variety** | At bank time | +5% per unique trick name beyond 2, capped at +50% |

### 13.4 Repetition decay
- **Window:** the last 10 tricks of the run. It carries across combos and resets each run.
- **Factor** by how many times the trick already appears in the window: **1.0 / 0.7 / 0.45 / 0.25 / 0.1**.
- Grinds decay per grind type, and spins per spin type. The base 50-50 decays like any other grind.
- **Ollies** never drop below 0.5, so required ollies always count something.
- Flat bonuses (Revert, Pop-out, 180 Out, gaps) do not decay.
- **Manuals** are exempt.
- **HUD:** decayed trick names show grey with their factor, e.g. "Kickflip ×0.45".

### 13.5 Distance
- 1 point per metre.
- Banked continuously, never multiplied.
- There are no separate time points.

### 13.6 Worked example

| Step | Points | Links |
|---|---|---|
| Ollie | 50 | 0 |
| 50-50, 1.2 s | 100 + 180 = 280 | 1 |
| Pop-out Kickflip, Perfect (150 × 1.25) + Pop-out bonus 50 | 188 + 50 | 2 |
| Manual, 1.5 s | 75 + 150 = 225 | 3 |
| Ollie (decayed ×0.7) | 35 | 3 |
| Boardslide, 0.8 s | 125 + 140 = 265 | 4 |

- **Sum** = 1,093 (the Perfect Kickflip's 187.5 rounds to 188 before summing).
- **Unique trick names** = 5 (ollie, 50-50, kickflip, manual, boardslide), so variety = +15%.
- **Heat** never expires: every link-adding trick starts well within 2.5 s of the previous one.
- **Banked** = 1,093 × 4 × 1.15 = **5,028**. The coin payout is `floor(sqrt(5028/250))` = 4 coins.

### 13.7 Why going straight doesn't pay
- **Survival-only** (steers and ollies, no tricks): about 600 distance + 300 ollie points per minute at the plateau, so **≈ 900 pts/min**. Ollie-hopping can't hold a combo either, because ollies don't refresh heat.
- **Average trick play:** 8–15k pts/min. **Good play:** 20–35k pts/min.
- **Coins:** the safe line holds ≤ 10% of coins outside breathers (§10.7 A5).
- **CI asserts** the survival/trick ratio is ≤ 10% (§10.11).

### 13.8 Score HUD (portrait)
- **Top-left:** banked total in tabular digits (Nunito 900, **26·k px**), rolling up over 0.3 s, abbreviated from 1M ("1.2M"). Distance sits below it at 12·k px.
- **Top-centre:** the combo pill "1,093 × 4" with a thin bank-timer ring. Below it, the **last trick name only**.
- **Top-right:** coins and the pause button: **48 px visible, 56 px hit area**.
- **Near the skater:** the world-space bank-timer arc, and **at most 1** bonus or trick popup at a time, shown beside or below the skater for ≤ 0.5 s so it never covers the look-ahead.
- **Placement rules:**
  - The whole HUD band is **≤ 56 px tall plus the top safe-area inset**. The camera solver excludes exactly this band (§8).
  - Nothing sits in the bottom 22% (thumb zone), except first-run ghost hints and the "rest here" mark.
  - A Playwright check asserts no HUD overlap at 320, 360 and 390 px widths.
  - The instant-retry reward toast sits in the HUD band and is gone by 3.0 s.

---

## 14. Coins, XP and the level track

### 14.1 Coins

**In-run sources**
- Pickups: strings of 1s and Gold Stacks of 10 (§10.8).
- **Combo payout:** a banked combo of ≥ 2,000 pays `floor(sqrt(combo / 250))` coins. 5k → 4, 20k → 8, 100k → 20.

**Post-run**
- **Score coins** = `floor(sqrt(score / 400))`: 8k → 4, 40k → 10, 160k → 20. The square root keeps long runs rewarding without letting one huge score break the economy.
- +25 for a New Best (not on run 1).
- **Warm-up bonus:** the first run of each local day doubles pickup coins. It is shown as a calm "Warm-up ×2" tag, never as a countdown.

**Expected coins per run** (combo heat and gateway banks keep combos to ≤ one area visit, so payouts stay bounded)

| Player | Run length | Score | Pickups | Payouts | Score coins | **Total** |
|---|---|---|---|---|---|---|
| New (runs 1–10) | 60–120 s | 3–8k | 15–30 | 0–8 | 2–4 | **~20–40** |
| Average | ~2.5 min | 25–40k | 60–90 | 15–30 | 7–10 | **~85–130** |
| Good | ~5 min | 120–180k | 150–210 | 80–140 | 17–21 | **~250–370** |

### 14.2 XP and levels

**XP per run** = the sum of:
- `floor(score / 50)`
- `floor(distance_m / 10)`
- **50** per new Trick Book entry (**25** during runs 1–3)
- **150** per area reached **through a gateway** for the first time ever (the starting area never counts)
- **100** for a New Best (**not on run 1**, where any score is a best)

**Onboarding cap.** During runs 1–3, one results screen grants **at most one level-up**. XP beyond the next threshold is held (`xp.held` in the save) and added at the start of the next run's results, so the Level 2 crate and the Level 3 shop banner never collide.

**Curve:** `xpToNext(L) = round(60 × L^1.5 + 90)`

| Level | XP to next |
|---|---|
| L1 | 150 |
| L2 | 260 |
| L3 | 402 |
| L5 | 761 |
| L10 | 1,987 |
| L20 | 5,457 |
| L29 | 9,460 |

- Total XP to reach L30 is about 116k. After L30, each level costs a flat 10,000 XP.
- **Pace:** an average player reaches L5 around run 4, L10 around run 16, L20 around run 65 and L30 around run 170 (about 7 h). A good player reaches L30 in 35–45 runs.

**Rewards**

| Lv | Reward | Lv | Reward | Lv | Reward |
|---|---|---|---|---|---|
| 1 | Starter set: Juno Park, Plain Maple, Classic Shell | 11 | 500 coins | 21 | 700 coins |
| 2 | **Street Crate, guaranteed Rare skater** | 12 | Helmet: Cat Ears (R) | 22 | 2 Street Crates |
| 3 | 300 coins + **Shop opens** | 13 | Street Crate | 23 | 800 coins |
| 4 | Board: Sunset Stripe (C) + Crate Meter intro | 14 | 600 coins | 24 | Board: Lantern Row (E) |
| 5 | Helmet: Stickerbomb (C) | 15 | Skater: Ines Moreau (R) + title "Local" | 25 | Skater: Vesper Quay (E) |
| 6 | 400 coins | 16 | 600 coins | 26 | 900 coins |
| 7 | Skater: Mika Lindqvist (C) | 17 | Board: Palm Shadow (R) | 27 | Pro Crate |
| 8 | Street Crate | 18 | Pro Crate | 28 | 1,000 coins |
| 9 | 500 coins | 19 | 700 coins | 29 | Pro Crate |
| 10 | Board: Lofi Waves (R) + profile badge | 20 | Helmet: Fishbowl (E) | 30 | **Golden Hour board (L), only obtainable here** + title "Golden" |

- **Beyond L30:** 500 coins every level, a Pro Crate every 5th level, and a profile star every 10th.
- **Already-owned rewards:** if a fixed item reward is already owned (for example, the player bought it), it converts to its duplicate value (§16.3), and the toast says so.

### 14.3 Long-term trackers
- **Trick Book (36 entries).** Entries are discovered the first time each is landed (+50 XP each, 25 in runs 1–3). Stats show the count per trick and the longest grind.
  - Ollie
  - 15 flips
  - 4 spins (FS / BS 180, FS / BS 360)
  - Indy Grab
  - 13 grinds
  - Manual and Nose Manual
- **Area Postcards (4).** Each unlocks on first arrival through a gateway (Downtown's is granted on run 1). Neon City is shown as a glowing silhouette until reached, because it is the aspirational one.
- **Crate Meter.** A free Street Crate at 4 km of total distance, then every 8 km after that.
- **Best line.** A painted "BEST" line with a flag streamer sits at your best distance in every run (§9).
- **Wishlist.** Pin 1 item. Its progress bar shows on every results screen ("Koi Current 640/900").

### 14.4 The first three runs (scripted pacing)
- **Run 1 (60–90 s, Lesson Line):** earns about 350–550 XP (it now reaches Suburbs at 0:44), and the onboarding cap makes it exactly **Level 2**. A crate opens and reveals a guaranteed Rare skater, with "Equip now?". The game asks the browser for persistent storage here (TECH §10.5).
- **Run 2:** you ride as the new skater. **Level 3** pays 300 coins with a banner: "Shop open — you can afford a board". The wishlist is introduced. The results screen shows one next goal, e.g. "Docks: 240 m further".
- **Run 3:** **Level 4** gives the Sunset Stripe board and introduces the Crate Meter ("2.1 km to a free crate") and the Trick Book ("9/36 tricks discovered"). After this run, a calm, dismissible "Add to Home Screen" hint appears once on Results.

---

## 15. Cosmetic catalog (purely cosmetic)

- **No effect on play.** Every item uses the same rig, hitbox, animation timing and physics.
- **Colours** are written as hex; in code they are `0xRRGGBB` numbers.
- **Parameters** map one-to-one onto the `SkaterLook`, `BoardLook` and `HelmetLook` interfaces (TECH §4.7).
- **Rarity look language:**
  - **Common:** flat materials.
  - **Rare:** canvas patterns or prints.
  - **Epic:** emissive or animated material.
  - **Legendary:** animation plus a trail or particles.
- **Item ids** are stable save keys and must never be renamed.
- **v1 scope.** All 40 items ship with distinct static looks (shape, colours, patterns, finish). The bespoke animated effects in the fx / notes columns (`screenFace`, `lightSeams`, `reflectiveStrips`, leaf trail, `hoverRing`, `lightTrail`, orbiting fish, glyph scroll, petal shed, animated canvases) are **M5 stretch**; until then each falls back to a static emissive or colour version of the same idea.

| Category | Common | Rare | Epic | Legendary | Total |
|---|---|---|---|---|---|
| Skaters | 4 | 4 | 2 | 2 | 12 |
| Boards | 6 | 5 | 3 | 2 | 16 |
| Helmets | 4 | 4 | 2 | 2 | 12 |

### 15.1 Skaters
`SKIN_TONES` = `#F6D7C3 #EBC1A0 #D9A27E #C68863 #A86B4A #8A5238 #6B3D2A #4A2A1E` (index 0–7).

| id | Name | R | skin / build / hScale | hair / colour | top (type, colours, print) | bottom | shoes | accessory | fx / notes |
|---|---|---|---|---|---|---|---|---|---|
| `sk_juno` | Juno Park | C (starter) | 2 / regular / 1.00 | bob `#2B1E1A` | hoodie `#E0A93B`/`#F3E3C3`, none | baggyJeans `#4C6A92` | highTop `#F7F2EA` | none | regular stance |
| `sk_mika` | Mika Lindqvist | C | 0 / slim / 1.02 | longStraight `#E8C97A` | longSleeve `#F3E3C3`/`#3E8E8A`, stripe | cargoShorts `#8A7F5C` | lowTop `#2E2A33` | tallSocks `#F7F2EA` | goofy stance |
| `sk_theo` | Theo Ramos | C | 3 / regular / 1.04 | curlyMop `#1E1714` | jacket (denim) `#5B7DB1`/`#F7F2EA`, pocket | slimJeans `#2E2A33` | lowTop `#C4473D` | none | |
| `sk_dee` | Dee Abara | C | 6 / regular / 0.98 | afroPuff `#1A1210` | tee (oversized) `#B8A3E6`/`#FFF4E3`, chestLogo | chinos (wide) `#D9C3AE` | chunky `#F7F2EA` | wristband `#FF5E6C` | |
| `sk_rook` | Rook Delaney | R | 4 / stocky / 1.03 | buzz `#2A1F1A` | varsity `#C4473D`/`#F3E3C3`, crestRD (original "RD" crest) | baggyJeans `#3B4A6B` | highTop `#2E2A33` | none | Downtown-themed |
| `sk_lark` | Lark Osei | R | 5 / slim / 0.92 | twinBuns `#1A1210` | raincoat (huge) `#F4D58D`/`#F2B630`, none | shorts `#8FB8DE` | rainBoots `#F2B630` | none | Suburbs-themed. Coat hem sways on landings. |
| `sk_ines` | Ines Moreau | R | 1 / regular / 1.00 | topBun `#7A3B2A` | overalls `#8FB8DE`/`#FFF4E3`, paintDots | (overalls) | lowTop `#F7F2EA` | none | Procedural paint dots in `#FF8A5B #7EE0B5 #A88BEB` |
| `sk_kofi` | Kofi Mensah | R | 7 / regular / 1.06 | buzz `#14100E` | trackJacket `#2B2140`/`#FF8A5B`, sunsetStripe | trackPants `#2B2140` | lowTop `#FFF4E3` | headphones `#FF8A5B` | |
| `sk_vesper` | Vesper Quay | E | 3 / stocky / 1.00 | ponytail `#3A2A22` | coveralls `#F08A3C`/`#2B2140`, none | (coveralls) | workBoots `#5A4636` | beanie `#2F5D7C` | **reflectiveStrips**: emissive bands rising 0.2 → 1.2 as time of day moves toward dusk. Docks-themed. |
| `sk_aki` | Aki Tanabe | E | 1 / slim / 1.00 | spikes `#1A1A2A`, tips `#3FF2FF` | courierJacket `#2B2140`/`#3FF2FF`, none | slimJeans `#1E2350` | chunky `#FF3FA4` | backpack `#2B2140` | **lightSeams**: emissive seams cycling `#FF3FA4` ↔ `#3FF2FF` at 0.5 Hz. Neon-themed. |
| `sk_gus` | Gus Halloran | L | 0 / regular / 1.05 | shortGrey `#E8E4DC` + moustache | cardigan `#B5645A`/`#F3E3C3`, none | slacks `#8A7F70` | lowTop `#FFFFFF` | tubeSocks `#FFFFFF` | Rides perfectly upright (pose style `upright`). Waves at the camera on Perfect landings. Trail of tiny autumn leaves (`#D9765A #F4D58D`). |
| `sk_kettle` | Kettle | L | robot / regular / 1.00 | chrome dome `#B8BCC8` | robot body `#3E8E8A`/`#B8BCC8` | robot legs | robot feet | antenna | **screenFace**: an emoticon screen that changes on every trick (64² canvas, 12 faces). Steam puffs on landings. Uses the humanoid rig. |

### 15.2 Boards
Every board shares these parameters:
- `pattern`
- `palette[3]`
- `scale` (0.5–2)
- `rot` (0, 45 or 90)
- `wear` (0–1)
- `logo` (an invented brand or none)
- `grip`
- `wheels`
- `trucks`
- `finish`: flat, holo, animHue, goldLeaf or emissive
- `wheelFx`: none, lightTrail or hoverRing

Defaults: grip `#2E2A33`, trucks `#B8BCC8`, natural ply edge.

| id | Name | R | pattern | palette | other params |
|---|---|---|---|---|---|
| `bd_plain_maple` | Plain Maple | C (starter) | plainMaple | `#D9B98C #C9A27A #E8C9A0` | wheels `#F3E3C3`, wear 0.2 |
| `bd_sunset_stripe` | Sunset Stripe | C | stripes | `#FFC9A8 #FF8A5B #7A4E8C` | scale 1, rot 0, wheels `#FFC9A8` |
| `bd_mint_chip` | Mint Chip | C | polka | `#9CCFB3 #5A3B2A #9CCFB3` | scale 0.6, wheels `#F3E3C3` |
| `bd_brick_lane` | Brick Lane | C | brick | `#B5645A #E8D6C2 #8E4A42` | Downtown-themed, wheels `#2E2A33` |
| `bd_cassette` | Cassette | C | cassette | `#2B2140 #FF8A5B #F3E3C3` | wheels `#FF8A5B` |
| `bd_hazard_tape` | Hazard Tape | C | chevrons | `#F2B630 #2B2140 #F2B630` | rot 45, Docks-themed, wheels `#2B2140` |
| `bd_lofi_waves` | Lofi Waves | R | waveLines | `#A88BEB #7EE0B5 #FFC9A8` | logo "Pressline", wheels `#A88BEB` |
| `bd_palm_shadow` | Palm Shadow | R | palms | `#F4D58D #B5645A #6B4E8C` | Suburbs-themed |
| `bd_rust_rivets` | Rust & Rivets | R | corrugated | `#B5552F #8A8FA0 #5E8C6A` | wear 0.6, trucks `#5A4636`, Docks-themed |
| `bd_koi_current` | Koi Current | R | koi | `#2F5D7C #F08A3C #FFF4E3` | Neon-themed, wheels `#F08A3C` |
| `bd_street_grid` | Street Grid | R | streetMap | `#FFF4E3 #2B2140 #FF5E6C` | dotted route line, wheels `#FF5E6C` |
| `bd_holo_shift` | Holo Shift | E | gradientFade | `#3FF2FF #FF3FA4 #8A5CFF` | finish `holo` (hue shifts with view angle) |
| `bd_lantern_row` | Lantern Row | E | lanterns | `#FF5A3C #FFD39A #2B2140` | finish `emissive` (lanterns glow 0.8), Neon-themed |
| `bd_night_market` | Night Market | E | neonGrid | `#1E2350 #3FF2FF #FF3FA4` | finish `emissive`; invented glyph labels on the buttons; Neon-themed |
| `bd_golden_hour` | Golden Hour | L (L30 only, never in crates or shop) | goldLeaf | `#E9B44C #FFE3A3 #8A5A2B` | finish `goldLeaf`, wheelFx `lightTrail` `#FFC48A`, grip edge glow `#FFD58A` |
| `bd_glide_ring` | Glide Ring | L | retroSun | `#FF8A5B #FFC94A #2B2140` | wheelFx `hoverRing` `#7FF8FF` (wheels replaced by glowing rings; physics unchanged), animated canvas (sun rises and sets on a 6 s loop) |

### 15.3 Helmets
Every helmet shares these parameters:
- `shell`: dome, visor, bucket, retro or a novelty shape
- `color`
- `decal` and `decalColor`
- `finish`: matte, gloss, chrome or emissive
- `fx`

| id | Name | R | shell | colour | decal | finish / fx |
|---|---|---|---|---|---|---|
| `hm_classic` | Classic Shell | C (starter) | dome (8 vents) | `#F3E3C3` | none | matte |
| `hm_stickerbomb` | Stickerbomb | C | dome | `#FFF4E3` | stickers (procedural scatter, 9 shapes) | gloss |
| `hm_racing` | Racing Stripe | C | dome | `#2B3A6B` | stripe `#F3E3C3` | gloss |
| `hm_cherry` | Cherry Gloss | C | retro | `#C4473D` | none | gloss (specular sprite) |
| `hm_hardhat` | Hard Hat | R | novelty: hardHat (brim) | `#F2B630` | scuffs | matte. Docks-themed. |
| `hm_plaid` | Picnic Plaid | R | bucket | `#C4473D` | plaid `#FFF4E3` (gingham canvas) | matte. Suburbs-themed. |
| `hm_catears` | Cat Ears | R | dome + ears | `#2B2140` | ear inners `#FFB7D0` | gloss. Ears flick on Perfect landings. |
| `hm_visorpro` | Visor Pro | R | visor | `#FFF4E3` | visor tint `#8A5CFF` | gloss. The visor reflects the sky gradient. |
| `hm_lantern` | Paper Lantern | E | novelty: lantern (ribbed) | `#FF5A3C` | ribs `#FFD39A` | emissive, rising 0.2 → 1.0 toward blue hour. Neon-themed. |
| `hm_fishbowl` | Fishbowl | E | novelty: bubble | glass `#BFE8FF` @ 0.35 | 2 orbiting goldfish `#F08A3C`, tiny antenna | gloss + animation |
| `hm_sunflower` | Sunflower | L | dome + petal ring | `#5A3B2A` | petals `#F4D58D` | Petals bob on landings and shed on Perfect landings (particles) |
| `hm_holovisor` | Holo Visor | L | visor (wraparound) | `#1E2350` | scrolling invented glyph text `#3FF2FF` | emissive, animated canvas, faint cyan trail at speed. Neon-themed. |

**Backlog** (post-launch, not v1):
- Original novelty helmets: Traffic Cone, Toast Slice, Sun Lid, Cumulus.
- A future "Night Owl" set, if a Supporter Pack ships.

---

## 16. Shop and crates

### 16.1 Prices

| Rarity | Price | Good runs needed | Average runs needed | Duplicate value |
|---|---|---|---|---|
| Common | 300 | ~1 | ~3 | 150 |
| Rare | 900 | ~3 | ~8 | 450 |
| Epic | 2,400 | ~8 | ~22 | 1,200 |
| Legendary | 6,000 | ~19 | ~55 | 3,000 |

Buying everything purchasable costs about 62k coins. That is about 22 h of average play, with level and crate gifts counted. The first 10 items typically arrive in the first hour.

### 16.2 Shop
- **Tabs:** Skaters, Boards, Helmets. Each tab is a 3-column card grid.
- **Free try-on:** tapping a card shows the item on your current loadout on the 3D turntable above.
- **Availability:**
  - **Every item is always buyable**, except the L30 board.
  - Nothing is exclusive to crates or to the rotation.
- **Featured row:** 3 slots per day, seeded by the local date, so it works offline.
  - **Slot A:** Common or Rare. **Slot B:** Rare or Epic. **Slot C:** Epic or Legendary.
  - Featured items are **25% off**, and only items you don't own are shown.
  - The label says "New picks tomorrow". There are no countdowns and no flashing.
- **Wishlist:** pin 1 item from any card.

### 16.3 Mystery crates (coins only; odds always visible on the crate screen)

| Tier | Price | Common | Rare | Epic | Legendary | Pity |
|---|---|---|---|---|---|---|
| **Cardboard** (free daily gift) | 0 | 70%: 60–120 coins · 25%: a Common item · 5%: a Rare item | | | | none |
| **Street** | 450 | 70% | 25% | 4.5% | 0.5% | An Epic or better is guaranteed by the 10th crate; a Legendary by the 40th |
| **Pro** | 1,500 | – | 60% | 32% | 8% | A Legendary is guaranteed by the 10th crate |

**How a roll works**
- Rolls always prefer items you **don't own** within the rolled rarity. A duplicate is only possible once you own the whole rarity tier.
- A duplicate converts to coins at the duplicate value.
- The L30 board is excluded from crates.

**Value**
- A Street crate's expected value is about 573 coins (1.27× its price). A Pro crate's is about 1,788 (1.19×).
- The trade-off is better value than the shop, but no choice of item.

**Pity**
- Pity counters are saved and shown on the crate screen, e.g. "Epic+ guaranteed within 4".

**Free crates**
- **Daily Gift:** a Cardboard crate once per local day. At most 1 is held at a time. **No streaks, no penalty for missed days.**
- **Crate Meter:** §14.3.

**Integrity**
- The result is rolled with a seeded RNG whose state lives in the save.
- The result is **written to the save before the reveal animation plays**, so refreshing cannot reroll it. An unfinished reveal resumes on the next visit.

**Reveal**
1. Tap the crate 3 times. It shakes harder each time, and each tap plays a note 2 semitones higher.
2. The tape rips and the lid pops. A light beam shows the rarity colour: Common cream, Rare teal-blue, Epic violet, Legendary an animated gold-to-pink gradient.
3. The item rises spinning on a turntable with a "NEW!" badge. Buttons: Equip / Open another / Back.
4. A duplicate gets a "DUPLICATE" stamp, shatters into coins, and the coins fly to the counter.

After the first reveal ever, a tap skips the animation.

---

## 17. Screens and UI flow

### 17.1 Flow
```
Boot ─▶ Title (diorama) ──tap──▶ Run ──crash──▶ Crash overlay ──(fresh touch ≥ 0.6 s, tap)──▶ Run   (instant retry)
            │  ▲                                     └──(1.2 s, or no tap)──▶ Results ──RUN AGAIN──▶ Run
            │  └──────────── Home ◀──────────────────────────────────────────────┤
            ├─▶ Locker (equip, try-on, wishlist)                                  ├─▶ Rewards modal (only when an item or crate was earned)
            ├─▶ Shop ─▶ Crates (open, odds)                                       └─▶ Locker / Shop
            ├─▶ Stats (bests, Trick Book, Postcards)
            └─▶ Settings (audio, haptics, shake, effects, quality, battery saver, touch controls, swap sides, steering sensitivity, simple tricks, key preset, back up / restore, analytics opt-out, credits)
Run ⇄ Pause (pause button, Esc, back gesture, landscape rotation, visibilitychange/pagehide/blur auto-pause)
```

### 17.2 Screens

| Screen | Content |
|---|---|
| **Boot** | Procedural logo on paper `#FFF4E3`. Checks for WebGL2, `structuredClone` and `AudioContext` (iOS 15.4+); if any is missing, a friendly "This browser is too old for Dusklane" card replaces the game. Builds geometry and textures behind a progress bar. Target < 1.5 s on mid-range phones. |
| **Title** | Static 3D diorama (low perspective camera, real sky, 30 fps): your loadout idles on a golden street. Bungee logo with a sunset gradient fill and 4 px ink stroke. "TAP TO ROLL" pulses every 1.2 s (Space or Enter on desktop). Best score is shown. Bottom tab bar: Play / Locker / Shop / Crates / Stats, plus a Settings gear. A Daily Gift badge appears when the gift is ready. The service-worker "Update ready" toast appears only here and on Results. |
| **Run HUD** | §13.8 |
| **Pause** | Resume, Restart, Settings, Home. Shows the key list on desktop. Resume calls `ctx.resume()` inside its click handler (covers iOS audio interruptions). A landscape phone sees the "Rotate to portrait" variant instead. |
| **Crash overlay** | 0.6 s slow-mo tumble. "BAILED!" sticker, the killer obstacle outline-flashing, **one cause line** ("Clipped a bin", "Flip 62% done — flick earlier"), and the lost combo struck through. "Tap to roll again" appears at 0.6 s and accepts only touches that went down after it appeared. Results slide up at 1.2 s. |
| **Results** | Score counts up over 0.8 s (tap to skip); "NEW BEST!" when you beat it. Breakdown: Tricks / Distance / Best Combo / Furthest Area. Coin tally: pickups + combo payouts + score coins (+ warm-up). XP bar, with level-up bursts inline. Crate Meter and wishlist bars. **One** next-goal line: the closest of next level, wishlist, crate, next area, or the gap to your best. A huge **ROLL AGAIN** button in the thumb zone. Small Locker / Shop / Home buttons. A reserved hidden slot for the future rewarded offer (§20). |
| **Rewards modal** | Shown only when there is an item or crate: crate reveal or item card, then back to Results |
| **Locker** | 3D turntable in the top half (drag to rotate). Tabs for Skaters / Boards / Helmets. Owned items only, plus "get more" links. Equipping is free and instant. |
| **Shop / Crates** | §16 |
| **Stats** | Bests (score, combo, distance, time, furthest area). Totals (runs, distance, tricks). Trick Book grid (36). Area Postcards (4). |
| **Settings** | Music and SFX sliders, a "No sound? Check the silent switch" note, haptics (Off / Key moments / All), screen shake, reduce effects (lo-fi overlay and speed lines), quality (auto/low/med/high), **battery saver (30 fps)**, **touch controls: Two thumbs (default: left steers, right tricks) / One thumb (classic)**, **swap sides** (steer right, tricks left), steering sensitivity 0.6–1.6, **simple tricks** (diagonals snap to cardinals), key preset A/B, **Back up / Restore progress** (uses the save's `export()`/`import()`), analytics opt-out, "progress won't be saved" warning if storage is unavailable, credits, reset progress (double confirm) |

### 17.3 Timing targets
- **Crash to the next run:**
  - ≤ 1.0 s with an instant retry tap. Only a touch that goes down ≥ 0.6 s after the crash counts, so panic taps during the tumble never skip NEW BEST or level-up news.
  - ≤ 3.0 s through Results.
  - The instant retry still grants everything earned. A compact toast in the HUD band at the start of the next run shows "+34 coins · +410 XP · Level 6!" and is gone by 3.0 s. Items and crates go to a "New" badge on Home and Locker.
- **No loading** between runs. The world regenerates in under 50 ms because segments are generated lazily and the Roll-out chunks are cached.
- **Auto-pause** on `visibilitychange`, `pagehide`, `blur`, the back gesture and landscape rotation. Resuming shows a 3-2-1 count at 0.5 s per beat.
- **Keeping the screen on.** A screen Wake Lock is held during runs (where supported) and released on pause and results. In the Android browser (not installed), the first TAP TO ROLL requests fullscreen.

### 17.4 UI style
- **Buttons:**
  - 18 px radius, paper `#FFF4E3` fill, 3 px ink `#2B2140` border, hard shadow `0 4px 0 #2B2140`.
  - Pressed: `translateY(3px)` and the shadow drops to 1 px.
  - Primary buttons are filled `#FF8A5B`. Minimum touch target 56 px (the 48 px pause button has a 56 px hit area).
  - Labels are uppercase Bungee 18 px.
- **Cards:** 2 px ink border, a rarity-coloured top band and a **text rarity label** ("RARE", "EPIC"), because Rare blue and Epic violet are easy to confuse.
- **Hidden screens** get `visibility:hidden` (and `inert` where supported) once their transition ends, so they can't keep focus or eat key presses.
- **Fonts** (self-hosted woff2, latin subset, `font-display: swap`, with system fallbacks; no CJK webfont; no third-party font requests, which matters for privacy and app-store builds):
  - **Bungee** for display text and trick names.
  - **Nunito** 700/800/900 with `tabular-nums` for UI.
- **Motion:** transitions use only `transform` and `opacity`.
  - The Results card slides up in 250 ms.
  - Trick popups: scale 0.6 → 1.1 → 1 in 120 ms, then fade, ≤ 0.5 s in total, beside or below the skater, one at a time.
  - Popup colour by type: flip `#FFE3A3`, grind `#8FE3FF`, manual `#C3A8FF`, gap/transfer `#FF9E7A`.

---

## 18. Art direction (everything procedural: geometry in code, canvas textures, no imported assets)

### 18.1 Palette presets (time of day is tied to area)
The palette lerps over 8 s, centred on each gateway. Palettes are looked up by `(area, blend)` in `world/render/palette.ts`.

| Preset | Zenith | Mid | Horizon | Sun disc / glow | Fog / haze | Hemi sky / ground | Sun colour, intensity, elevation | Exposure |
|---|---|---|---|---|---|---|---|---|
| **Golden** (Downtown) | `#8E7CC3` | `#F2A37B` | `#FFD9A0` | `#FFF1C9` / `#FFC27A` | `#F4C49A` | `#FFD7B0` / `#6B4E8C` | `#FFC48A`, 2.4, 22° | 1.05 |
| **Late gold** (Suburbs) | `#7B8CC8` | `#F5B08A` | `#FFE2AE` | `#FFF6D8` / `#FFD08A` | `#F2CDA6` | `#FFE0BC` / `#6E5A93` | `#FFD09A`, 2.3, 26° | 1.0 |
| **Sunset** (Docks) | `#5E5A9E` | `#E8826E` | `#FFB07A` | `#FFE0B0` / `#FF9466` | `#D99A86` | `#F7B79A` / `#5A3F7E` | `#FF9E6E`, 2.0, 12° | 1.05 |
| **Blue hour** (Neon) | `#1E2350` | `#4B3F86` | `#C9729A` | none (sun has set) | `#3A3466` | `#A69CD8` / `#3B2A5C` (G1: was `#8C8CE0`, lifted so inverted hazards keep their volume) | `#9AA8FF`, 0.6, 30° (moon fill) | 1.2 |

**Ground colours**

| Surface | Colour |
|---|---|
| Asphalt | `#7F7890` (lightened from `#5B5466`, then `#6B6478` at G0, `#79728A` at G1, so ink hazards reach ≥ 2.5:1 in building shadows and against sun-lit faces) |
| Wet neon asphalt | `#352F55` |
| Neon hazard body | `#7A6FB0` (mid-value, lighter than the road; see §18.4) |
| Ink hazard body / top (Downtown, Suburbs, Docks) | `#170F24` / `#5C4B84` (G1: darker than the `#2B2140` ink so bodies hold 2.5:1 in shadow; tops two value steps lighter so a tall prop reads as a solid box from the near-top-down portrait camera, not a slab) |
| Sidewalk / concrete | `#D9C3AE` |
| Curb top | `#E8D6C2` |
| Granite | `#B9A9A0` |
| Paint | `#EDE3D3` |
| Grass | `#9DB36B` |
| Wood | `#A9744F` |
| Rail steel | `#9BA3B5` |

**Area accents**

| Area | Accents |
|---|---|
| Downtown | terracotta `#D9765A`, teal `#3E8E8A`, cream `#F3E3C3`, brass `#C9A15A`, awning red `#C4473D` |
| Suburbs | mint `#9CCFB3`, butter `#F4D58D`, powder blue `#8FB8DE`, picket `#F7EFE3`, roof brick `#B5645A` |
| Docks | rust `#B5552F`, container blue `#2F5D7C`, safety yellow `#F2B630`, patina `#5E8C6A`, steel `#8A8FA0`, water `#4F6A8F` |
| Neon | magenta `#FF3FA4`, cyan `#3FF2FF`, lantern red `#FF5A3C`, paper `#FFD39A`, violet `#8A5CFF`, sakura `#FFB7D0` |

**RECLAIM tokens** (§1 theme, §24 row 74; `world/render/palette.ts` `RECLAIM`). The presets, blends, sun, hemisphere, fog, exposure, ground colours, `COLORS`, `HAZARD` bodies, accents and UI colours above do **not** change. Nature lives in the mid values outside the corridor (in Neon, in the dark values, because Neon's code is inverted). Luminance values are sRGB relative luminance; `tests/unit/render/palette.test.ts` checks every number below.

| Token | Hex | Use |
|---|---|---|
| ivy deep / light | `#3F6B3A` / `#6E9A4A` | Decor façades and posts (DT/SB/IN decor foliage L ≥ 0.10; deep only in small patches) |
| moss / moss light | `#5E7A3A` / `#7A8F45` | Decor stone, roofs, ledge faces |
| new leaf / russet leaf | `#A8C66C` / `#B86A3E` | Crowns, saplings, leaf scatter (never gold) |
| meadow / meadow SB / dry grass / seagrass | `#8FA85A` / `#A9B865` / `#C9B67A` / `#7E9A5A` | Verges, lawns, the docks apron |
| wildflowers | pink `#E98BA6`, lilac `#B79AD8`, cornflower and morning glory `#7FA3E0`, poppy `#E0674F` (\|x\| ≥ 4.6 only) | Never yellow-gold (coins), never white (grind) |
| rust / deep / light | `#B5552F` / `#7A3B26` / `#D07A48` | Decor metal, carts, rust drips (orange-brown, never crimson, never on the ground) |
| patina / rail body | `#5E8C6A` / `#8FA07A` | Brass and copper; the DT handrail body under its polished strip |
| faded paint | 25% toward `#CDB8A3`, then −20% saturation (`fadePaint`) | Building, awning and sign colours |
| peeled board / barnacle / pickets | `#9A938C` / `#A89F94` / `#8E98A0` | Billboards; the dock water face; decor fences (2.78:1 against cream, never white) |
| vehicle glass / sky streak | `#262438` (L 0.020, 3.6:1 on asphalt) / `#6A6890` (≤ 10% of a pane) | Every vehicle |
| vehicle bumper / hub / taillight | `#2B2140` / `#3A3448` / matte `#6A2A2A` | Every vehicle: no chrome; static vehicles unlit |
| hazard car paint tops | teal `#2E6062`, oxblood `#7A3A48`, olive `#55603A`, slate `#575B76` (L 0.076–0.108) | The top face is the paint; bodies stay the ink family |
| hazard car roof moss | `#485F37` (teal, olive, slate), `#3F5431` (oxblood) | Luminance-matched (±10%) to the paint top |
| hazard moss on ink tops | `#435B32` on `#5C4B84`, `#364928` on `#4A3B6B` | Bins, bollards, drums, lids |
| hazard foliage | `#1B2B22` (L 0.021), lit-side highlight `#2A4232` (L 0.046) | Ivy, ferns, vines and crown caps on hazards (L ≤ 0.05) |
| hazard ink rust | `#3A1E14` (L 0.019) | Car sills, bins |
| Neon hazard moss | `#54825C` on body `#7A6FB0`, `#669E70` on top `#9489C8` | Luminance-matched |
| Neon inverted vehicle bodies | `#7A6FB0`, sea-glass `#538078`, rose `#9F687A`, taxi steel blue `#5A78A0` (L ≈ 0.18–0.19) | With the emissive rim, as today |
| Neon night leaf / night moss | `#2E4A48` (1.30:1) / `#284440` (1.18:1) against wet asphalt | Neon decor foliage (dark, because Neon hazards are the mid values) |
| decor car paints | `#6F9A94`, `#B07A66`, `#9DB4C8`, `#9AAE8A`, `#A898B8` | `parked_car_side`: sun-faded mid values, never ink |
| sun-catch pane / Neon standby windows | `#F2C38A` / `#FFC27A`, `#C9B8FF` | 15% of DT/SB windows, unlit; Neon windows at 0.35 (never cyan) |
| dead neon tube | `#4A4470` (1.39:1 on wet asphalt) | Unlit signs |
| animals | gull and pigeon ≤ `#A6A3A8`, grey tabby `#6E6A70` / `#8A8690`, ginger `#C8743A`, heron `#8A8C94` | Nothing near-white |
| seeds / lily pad / roses | `#A39A8E` at ≤ 35% alpha / `#4A6E45` / `#E98BA6` | Dandelion seeds; fountain pads (≤ 30%, corners); SB picket roses |

**Per-area flora and green caps** (`GREEN_SHARE`; checked by `npm run shots -- --green`: the share of pixels in a 390×844 run frame, HUD excluded, with HSV hue 60–178°, S ≥ 0.20, V ≥ 0.10): Downtown 6–15% (fig and plane trees, poppies at \|x\| ≥ 4.6, moss in granite joints, ivy on end walls only), Suburbs 12–30% (meadow lawns, pink and lilac flowers, buddleia: the wildest area), Docks 3–10% (seagrass, morning glory: rust is the show), Neon 3–10% (dark teal night foliage, cherry: the lights are the show).

**Per-area deltas** (render side, T2): Downtown façades faded, awning red `#C4473D` → `#B5625A`, brass → patina, window lights 0.20 → 0.04 plus sun-catch panes. Suburbs lawns become meadow with flower dots, moss on roofs, pickets grey, window lights 0.04, 20% of lamps on. Docks rust up, container paints faded, window lights 0.06. Neon about 70% of the remaining signs live, glow cards ≤ 24 per chunk, city glow ×0.85, windows 0.60 → 0.35 in dim `#FFC27A` / `#C9B8FF` ("the city runs on sunlight"), puddles reflect only live signs, pit floors reflect nothing; `neonGlow` and the hazard rims unchanged.

**UI colours**

| Role | Colour |
|---|---|
| Ink | `#2B2140` |
| Paper | `#FFF4E3` |
| Primary | `#FF8A5B` |
| Lilac | `#A88BEB` |
| Coin | `#FFC94A` |
| Mint | `#7EE0B5` |
| Coral | `#FF5E6C` |

**Rarity colours:** Common `#C9C2B8`, Rare `#5EB8FF`, Epic `#B47CFF`, Legendary an animated gradient from `#FFB13B` to `#FF5EA8`.

### 18.2 Lighting and materials

**Lights**
- One `HemisphereLight` at intensity 1.0.
- One low `DirectionalLight` from **behind the camera and to the left** (azimuth 35° left of straight-behind).
  - Front faces, which the camera sees, are warmly lit.
  - Long shadows rake **forward and to the right**, so the skater "chases" their own shadow up the street.
  - Shadow length is about 2.5× object height at the golden preset.
- Shadows are never black. Shadowed faces get only the hemisphere ground colour, and the darkest shadow should land near `#4A3B6B`.

**Shadow maps**
- `PCFShadowMap` with `shadow.radius` 2 (med) / 3 (high). (`shadow.radius` has no effect with `PCFSoftShadowMap`, so the soft type is not used.) Map size 2048 (high), 1024 (med), off (low, contact shadows only).
- The shadow camera is an ortho box covering `x ±10, s ∈ [s_p − 6, s_p + 34]`. It snaps to the texel grid. Bias −0.0004, normalBias 0.03.
- **Off-screen buildings (|x| 5–14 m) are shadow casters**, so their silhouettes stripe the street even when the buildings themselves are out of frame.

**Renderer**
- Tone mapping is ACES Filmic, output `SRGBColorSpace`. MSAA is decided once at boot from the **capped** pixel ratio of the starting tier: on when it is < 2 (so med's 1.5 gets MSAA and 2 px rails don't shimmer), off at 2.
- **No bloom in v1.**

**Materials**
- World: `MeshLambertMaterial`, vertex colours, flat shading.
- Skater, board and helmet: `MeshToonMaterial` with a 3-step ramp (0.35 / 0.7 / 1.0).
- **Neon:** emissive intensity 1.5–2.5, which ACES rolls off softly, plus additive **glow cards** behind signs, capped at 40 per chunk. Glow intensity scales with blend toward blue hour. There are no point lights.

### 18.3 Sky and the run camera
The run camera looks down at 34° (the top of its window 17° below the horizontal) and **never sees the horizon**, so time of day is sold through six other channels:
1. Light colour, intensity and sun elevation.
2. Long shadows, including those from off-screen buildings.
3. Warm haze: fog colour applied to the far 30% of the frame, at ≤ 35% strength, **never on hazards or grind edges** (they carry a `noFog` flag).
4. A screen-space **sky glow** gradient **inside the HUD band only** (horizon colour → transparent, alpha 0.25), so it never washes out the zone where hazards are first read.
5. Reflections that use the sky gradient: puddles, dock water, shop glass.
6. Window lights: 20% lit at golden, rising to 60% at blue hour.

The **sky dome** (3-stop gradient, sun disc, glow falloff, 5–8 lozenge clouds with `#FFC9A8` tops and `#E58F8A` undersides, an occasional V of 5 birds) and the **two parallax skyline strips** appear only in the Title, Locker and Shop perspective camera. The near strip is 15% darker. In Neon the skyline gets emissive window dots.

### 18.4 Readability and portrait composition rules (never broken)

**Value hierarchy**
- The ground is mid-value.
- **Crash hazards (Downtown, Suburbs, Docks):** dark ink `#2B2140` body with one saturated area accent.
- **Crash hazards (Neon):** on dark wet asphalt a dark body would vanish, so Neon hazards invert: a **mid-value `#7A6FB0` body** with a 0.03 m **emissive accent rim** (magenta `#FF3FA4` or lantern red `#FF5A3C`, emissive 1.2) on the top and front edges. Cyan is reserved for sparks, rail-body glow and the contact glow.
- **Full-width hazards:** add safety chevrons `#F2B630` / `#2B2140` in every area, the holo gate included (on its solid base).
- **Grindable edges: one grind signature, identical in every area and palette** (G1, owner playtest): a polished cream-chrome coping strip `#FFF8EC` (was cream `#FFF1D6`) along every grindable edge (rail tubes, ledge, bench, curb, planter and dock lips, Neon rails), drawn over a **0.02 m ink underline** so the pair reads on light sidewalks and dark neon roads alike. Under the perspective run camera (@cam) both stripes keep a constant width on screen at every depth: the cream **1.25 × `CAMERA.minEdgePx` ≈ 3 px** (`RENDER.grind.halfW`), the ink ≈ 1.6 px beside it; the ink band runs 0.07 m down the faces so the cream lip always borders ink, and kerb stone bands are darker so the lip alone still reads against them. It carries a fixed self-lit sheen (stronger on its top face, the same under every palette) and a slow glint band travelling along the street every 8 m (`RENDER.grind`, fx flag `grind`), over a palette-tinted emissive 0.2. It brightens during the pick window. Never cyan.
- **Nothing that is not grindable uses the signature:** no non-grindable prop, decor, trim or light strip is cream or carries the glint, and emissive trim (Neon rims, light bars, vending fronts) is never a thin cream line. "Grind this" = the cream-chrome strip; "ollie this" = a full-width hazard with chevrons; "steer around this" = a tall ink (Neon: lavender) volume.
- **Coins** glow gold.
- **Decor** never uses chevrons or the cream edge.

**Dressing rules (RECLAIM, every kit; `world/render/kits/dress.ts` enforces and accounts for them, §24 row 74).** Kits draw dressing through `DRESSER.box(K, role, …)`, which clamps and refuses by these rules; `tests/unit/render/dress.test.ts` draws every kit in every skin.
1. **Footprint.** In plan view (x, s), dressing stays inside the collision footprint, with at most 0.05 m of overhang (mirrors included).
2. **Height.** On Bump, Low and landable tops nothing rises above the top surface (moss is a colour there; planter beds are a flat flower carpet at rim level −0.02 m). On Tall props foliage rises at most +0.05 m (flat ink-green crown caps; roof moss is colour only) and animals (cat loaf, resting gull, sparrow) at most +0.22 m. **Exception:** an *isolated* lidded column filler (no other solid within 1.0 m in x or s, never in a gate row, never in Neon; the chunk builder computes it) grows a sapling 1 in 4: trunk at the far (up-screen) edge of the lid, crown radius ≤ 0.35 m, top ≤ +0.6 m, ink-green; the lid stays visible.
3. **Top face.** Flowers on a top face only on landable or grindable planters (`planter`, `planter_tree`, `cherry_planter` beds) or on scenery. Crash objects carry foliage only on their side faces, in ink-green. The one bloom accent on a crash object is the SB picket roses, on fence faces only. Water in a pit or fountain carries no blooms.
4. **Value.** Moss and rust on a hazard face are luminance-matched (±10% relative luminance) to the face they cover (§18.1 tokens). Hazard foliage stays at L ≤ 0.05 (ink-green `#1B2B22`; `#2A4232` only for lit-side highlights). Decor foliage in Downtown, Suburbs and Docks stays at L ≥ 0.10, so "dark = hazard" never leaks into the scenery. Neon decor foliage is dark (≤ 1.3:1 against wet asphalt), because Neon hazards are the mid values.
5. **Signature.** Nothing non-grindable is cream, near-white or chrome, or carries the glint. Vehicles have no chrome at all (ink bumpers `#2B2140`, hubs `#3A3448`, no bright trim). Animals near a grind edge are no lighter than `#A6A3A8`. No foliage, weed decal, crack or root comes within 0.3 m of a grind edge, and grind rims stay straight. The cream-chrome coping is the brightest thin line on screen: "the only polished thing in the city".
6. **Life-accent budget.** On any hazard, flowers, the cat, lanterns and the area accent stripe together cover ≤ 10% of its top-view silhouette (the 8–12% accent rule above). `dress.ts` accumulates it per prop; a unit test checks it per variant.
7. **Clean core.** The riding surface at \|x\| ≤ 3.6 gets only the existing decal kinds: cracks, patches, organic puddles and faded paint. The edge band 3.6 ≤ \|x\| ≤ 4.5 may carry flat weed and moss decals at ≤ 1.3:1 against the surface. 3D vegetation grows only at \|x\| ≥ 4.6.
8. **No flicker.** Hazard emissives are steady; the only time-varying hazard lights are the existing telegraphs (crosswalk signal, reverse lights, forklift beacon, holo-gate pulse ≤ 2 Hz). Decor flickers nowhere either: lights switch on and stay on, and no window lights up as you pass.
9. **Machines are clean.** Movers carry no moss, rust or plants and share one helper-machine motif: a small rounded sensor dome and a two-tone band in `HAZARD[area].accent2`, inside the life budget. No machine touches, carries or grows plants.
10. **Parked, not fled.** Every vehicle is axis-aligned and parked (bay, curb, driveway, loading entrance), doors and boots closed, roof racks empty. Never crashed, crumpled, overturned or burnt, never a pile-up or a lane of stopped cars, never mid-lane.

**Do-not list (RECLAIM, every kit, decor kind, effect, cosmetic and line of copy).**
- No zombies, people or NPCs, bodies, blood, gore, fire, smoke plumes, weapons, military or police gear, quarantine walls, sandbags, barbed wire, warning graffiti or X-marked doors.
- No crashed, crumpled, overturned or burnt cars, no pile-ups, jams or lanes of stopped cars, no car parked mid-lane, no shattered glass, no open doors or boots, nothing on roof racks, no car alarms.
- No fungus, spore or mushroom growths. No fireflies, ever. No leaning, toppled or broken towers, collapsed buildings or war damage. No Ferris wheels or amusement parks.
- No cats in Neon City. No faces or emoticons on robot screens (pictograms only). No machine touches, carries or grows plants.
- No lone dog, circling birds of prey, deer herd, deer in Neon, wild boars, giraffes or hero animals from known media.
- No stopped clocks, black bag piles, closure notices, hazard or radiation symbols, dosimeters or masks. No cherry-tree avenue arching over the road.
- No flicker on any hazard, and no window that flickers or lights up as you pass. No crimson stains: rust drips stay orange-brown, never on the ground or under car doors.
- Nothing from any existing game or film: no names, characters, logos, locations, signage, story beats, iconic scenes or music signatures (no sparse acoustic-guitar motifs). Signage keeps the invented brands (§18.6) and the reviewed Japanese word list; no new word or brand without review.
- Player-facing text never uses: zombie, apocalypse, post-apocalyptic, outbreak, infected, quarantine, evacuate, survivor, last, remains, abandoned, "nature is healing" (a unit test greps the string tables), never names or compares to another game or film, and never explains why people left.

**Measured contrast gate** (`scripts/shots.mjs --contrast`, at every palette preset and every gateway blend):
- Hazard silhouette (mean rendered luminance, accent included) vs the ground around it: **≥ 2.5:1**. Neon targets 3:1.
- Grind edge vs the surface next to it: at least one of its two stripes (cream top or ink underline) **≥ 1.8:1**.
- Palette values in §18.1 are starting points; the gate is the source of truth.

**Effects limits**
- Only the skater and board get an outline: inverted-hull ink, 0.025 m.
- The upper two-thirds of the screen is the look-ahead zone. VFX there stay ≤ 25% alpha, and speed lines stay outside the corridor at ≤ 15%.

**Portrait-specific rules.** In portrait the camera looks up the street at a 9° angle in perspective (§8): the left (far-side) facades show, the street converges, and the camera-side (right) street wall is cut away at the corridor edge. Still, most of the screen is the street seen from above, so **every identity element must show a top or a camera-facing (+s-toward-player) face, or stand on the far side.** Use:
- blade signs and banners that hang perpendicular to the facades
- awnings and canopies that stick out over the sidewalk
- lantern strings and overhead wires across the street
- vending banks and food carts that face the camera
- cross-street end walls every 8–12 s, showing a corner shopfront or shutter that faces the camera
- rich ground decals
- a 1–2 m sidewalk-dressing band just outside the corridor, visible at top speed

On landscape (ψ = 30°) the left-side facades show more and the camera-side cut grows; anything identity-bearing on the camera side must live below about 1.5 m there (low verge props, ground decals).

**Occlusion** (§8 occlusion rules)
- In-corridor solids get the x-ray cap above 1.2 m (§8).
- No opaque structure crosses over the corridor; the maglev runs on the far facade line; overhead decor stays thin (§8).
- Camera-side decor and buildings are cut at the corridor edge (the renderer does it; the generator may keep placing them).
- Overhead spans (lantern strings, wires) fade to 25% over the look-ahead zone and stay thin; they are full only over the sidewalks and behind the skater.
- **Nothing bright crosses the look-ahead zone** (G1, owner playtest: lantern strings read as low chains to ollie): lantern-string bulbs hang only beyond |x| ≥ 4.6 (over the sidewalks and facades); over the corridor a string is its thin dark wire. Overhead strings and wires are sparse (Neon one every 48 m, Suburbs wires every 40 m).

### 18.5 Models

**Skater**
- **Size:** about 1.80 m to the helmet top, chunky and big-headed. The head is a sphere of radius 0.17, about 1/5 of body height. Torso 0.48, legs 0.72. Shoes 0.30 × 0.13.
- **Silhouette:** strong, with readable arms and a bright top. About 46–63 px tall on screen at the start and 31–51 px at top speed, depending on the viewport (§8).
- **Budget:** ≤ 2,500 triangles. Sphere 10×8. Limbs are tapered 6-sided cylinders.
- **Construction:** one **rigid-skinned** mesh (each vertex weighted 100% to one bone), plus an outline twin that shares the skeleton (TECH §8.5).

```
root (board contact; yaw = heading, roll = carve lean)
├─ boardPivot (deck centre; flips rotate here)
└─ hips (y = crouch)
   ├─ spine → chest → neck → head (64² face canvas, hair, helmetSocket)
   │          ├─ shoulderL → elbowL → handL
   │          └─ shoulderR → elbowR → handR
   ├─ hipL → kneeL → ankleL (shoe)
   └─ hipR → kneeR → ankleR (shoe)
```

**Rig behaviour**
- Legs use analytic 2-bone IK toward foot targets on the deck: front bolts and tail. In the air the targets may lift off the board.
- Poses are sets of joint Euler angles plus hip height. They blend with critically damped springs: ω = 18 rad/s normally, 30 for pop and landing.
- Poses are authored for regular stance. Goofy stance mirrors the targets.
- Blink every 3–6 s.

| Pose | Values |
|---|---|
| Rolling | Knees 15°, hip y −0.04, arms 20° out, head toward travel, bob 0.6 Hz ±0.015 m |
| Carve | Root roll = clamp(lat. accel × 1.6°, ±22°); toeside knees 30°; heelside hips back 0.06; arms counter 15° |
| Pop (0–60 ms) | Back leg extends, front knee 70°, board pitch +25°, stretch y 1.06 |
| Tuck (apex) | Knees 85°, feet 0.22 above the deck, arms 45° out |
| Flip | Body holds the tuck, shoulders twist 15° with shove-its, feet re-catch at 80% of the flip |
| Grab (Indy) | Back hand to the toeside edge between the feet, knees 95° |
| Land absorb | Hip y −0.15 in 80 ms, springs back over 220 ms, knees 55°, squash y 0.94 |
| Manual / Nose Manual | Board pitch +12° / −12°, arms sway 1.2 Hz ±20° |
| 50-50 | Board parallel to the edge, upright, knees 25°, arms 60° out |
| 5-0 / Nosegrind | Pitch +12° / −12°, weight over the tail / nose |
| Boardslide / Lipslide | Deck yaw 90° (lip: tail leads), torso faces down the rail, hips open |
| Noseslide / Tailslide | Yaw 90°, pitch −10° / +10° |
| Crooked / Overcrook | Nose truck on, yaw 25° / −25°, pitch −10° |
| Smith / Feeble | Back truck on, roll ±15°, yaw ±20°, front truck hangs below the edge |
| Bluntslide / Nosebluntslide | Pitch +35° / −35° over the edge, yaw 90° |
| Sketchy | Arm windmill 2 Hz, 0.3 s |
| Crash | Rigid tumble: forward + 3 m/s up, spin 3–6 rad/s (seeded axis), limbs flail with 4 Hz noise ±40°. The board flies off with its own spin and bounces (restitution 0.3). The helmet stays on. |

**Board**
- **Deck:** 0.80 × 0.21 m, nose and tail radius 0.105, `ExtrudeGeometry` depth 0.022.
  - Kicks: vertices beyond |x| > 0.30 rotate up 18°.
  - Concave: y += 0.006 × (z / 0.105)².
- **Trucks:** baseplate plus a 0.19 × 0.03 × 0.035 hanger.
- **Wheels:** 8-sided, radius 0.028.
- **Grip:** a 128² noise texture.
- **Edge:** 7 ply stripes.
- **Graphics:** a 512×128 canvas from `{pattern, palette, scale, rot, logo, wear}`.
  - Patterns: plainMaple, stripes, chevrons, checker, halftoneSun, palms, waveLines, polka, gradientFade, stickerBomb, topo, neonGrid, retroSun, brick, cassette, corrugated, koi, streetMap, lanterns, goldLeaf.
  - Wear adds scratches clustered at the nose and tail.

**Helmets**
- **Shells:** classic dome (hemisphere × 1.08, 8 vents), visor shell, low bucket, round retro, plus novelty shapes. Strap and buckle on all.
- **Decals:** 256×128 canvas.
- **Finishes:** matte, gloss (specular sprite), chrome (vertical gradient map), emissive.

**Props and buildings**
- **Props:**
  - Flat-shaded, vertex-coloured, low-poly, with chamfered top edges (one bevel ring) so tops catch the light.
  - ≤ 400 triangles per prop and ≤ 1,500 for a car.
  - Built once at boot per kind and variant.
- **Vehicle builder** (RECLAIM, `kits/car.ts` `drawVehicle`; the body comes from `propSkin`, §10.3). Bodies: sedan, estate, pickup (ink shrubs below the bed rim), SUV (h ≥ 1.5), taxi (decor; Phase B Neon `parked_car`, roof sign a plain textless shape), kei van and panel van (Phase B `van_across`), camper, box truck and shuttle bus (`container`), sweeper (`crosswalk_car`). Every body is stretched to fill its box (L, W ±0.1 m) with no "air" inside the hitbox, long axis along s, no yaw.
  - **Plan-view signature** (the portrait camera mostly sees the roof): the paint top on roof and bonnet, framed front and back by dark glass `#262438` (one `#6A6890` sky streak ≤ 10% of each pane); four tyre nubs at the box corners (sides inset 0.05 m between the arches); mirrors inside the 0.05 m overhang; one 0.10 m accent stripe along bonnet and roof in `HAZARD[area].accent` (Docks `accent2`, so no amber runs along s; Neon uses its emissive rim).
  - **Shared parts:** 8-sided wheel and hub, low tyre (bottom flattened 0.04 m), bumpers, light clusters, mirrors, wheel arches, empty roof rack (estate), bed (pickup). Static vehicles are unlit (matte taillights `#6A2A2A`); movers keep their telegraph lights.
  - **Implementation (T1):** `kits/car.ts` `drawVehicle(K, VehicleSpec)` (cars: `car`; vans, the truck, the bus and the sweeper: `boxy`) and `vehicleKit`, the kit of every vehicle kind and of the container's truck / bus skins. Roof moss, sill rust, arch ivy, the cat, the accent stripe and the helper band go through `DRESSER`. The parts above the x-ray cap (1.2 m) are screen-doored like every in-corridor tall solid, so an opaque paint plate sits just under the cap and the roof still reads as paint. Decor cars (`drawCar`) use the same builder with no dressing and no stripe.
  - **Wear:** roof moss ≤ 20% of roof and bonnet, as edge patches on the rear half of the roof and the bonnet corners, never on glass (the roof rectangle survives); weeds under the car inside the footprint; ink ivy up one wheel arch; rust drips only on side panels, above the door line. No wear on movers. Cats: 1 in 8 sedans and estates (never Neon, never movers): grey tabby on in-corridor hazards, ginger on decor cars; on a crash it only twitches an ear.
  - **Budgets:** sedan, estate, pickup, taxi ≤ 700 triangles; vans ≤ 800; truck and bus ≤ 1,000 (the 1,500 car cap above).
- **Building recipe** (decor zone and shadow casters):
  - a base box plus 1–2 setback boxes and a darker cornice (0.15 m overhang)
  - windows from the area facade atlas
  - a ground-floor awning and sign board
  - roof clutter: water tank, AC boxes, antennas, laundry lines
  - ±4% random lightness per building

### 18.6 Area kits and invented brands

**Area kits**

| Area | Kit |
|---|---|
| Downtown | Granite ledges, hubbas, stair terraces with brass handrails, benches, planters, café umbrellas, bike racks, bollards, news kiosks, a low fountain, palms in planters, striped awnings, crosswalk zebras |
| Suburbs | Gable houses (seen as roofs and shadows), picket fences, round hedges, mailboxes, driveway curbs, parked cars, bins, hoops, sprinklers, leaf decals, a bus shelter |
| Docks | Ribbed warehouses, stacked containers, crane silhouettes (casting shadows), loading docks, pallets, drums, chain-link, embedded rail tracks, sun-glitter water beyond the lip |
| Neon | Slim 8–14-storey towers (shadow casters, roofs at the screen edges at top speed) with vertical blade signs. Lantern strings: catenaries of instanced emissive spheres `#FF5A3C` / `#FFD39A` swaying at 0.5 Hz. Vending banks with lit fronts. Pastel ribbed shop shutters on cross-street end walls. **Holographic billboards** (additive planes with scanlines, 0.2 Hz hue drift, a rare 50 ms flicker) on poles facing the camera. The **Sora Line maglev** guideway overhead as two thin edge beams (no deck over the street): a train passes every ~20 s as a light streak with a whoosh. Guard rails with a cyan body glow and the standard cream grind edge. Cherry trees in planters (clustered icosahedra `#FFB7D0` / `#F59BBE`) shedding petal particles. Paper lantern stands. Bike rows. Wet asphalt with neon puddle smears. |

**The four areas, reclaimed** (RECLAIM, §1; each keeps its preset, layout and flora band, §18.1)

| Area | Portrait reads | Vista (once per visit, a cross street, camera-facing) |
|---|---|---|
| Downtown: "the quiet plaza" | Leaf-shadow stripes across the plaza, roof gardens and rooftop figs at the edges, moss-topped awnings with trees through them, the fountain with lily pads in its corners, parked cars in the bays (a grey tabby on one roof), pigeons on the string anchors, poppies in the sidewalk band | The Hotel Amberlane fig: a great fig tree on the hotel's roof terrace, roots draped down its end wall |
| Suburbs: "wildflower lanes" | Meadow lawns with pink and lilac flowers, crisp hedges on brick bases, mailboxes with nests, vans and estates on the driveways, the fallen log across the road, sparrows on the side spans of the wires, a deer far down a side street | A plain water tower (no lettering) wrapped in vines, swifts round it, its long shadow striping the street |
| Docks: "the seagrass harbor" | Rust-and-vine containers, box trucks and the staff shuttle in the channel walls, the waxed dock lip against glinting water, grey-backed gulls on bollards, a grey heron on the apron edge, seagrass verges | The heron crane: the tallest gantry with a heron's nest on its boom, a V of geese passing |
| Neon City: "the night-owl lights" | Live blade signs (40% fewer near the street, 70% of the rest lit), steadily glowing vending fronts, cherry trees shedding petals, wet tiles just after rain with drip ripples (no falling rain), ivy on the viaduct pillars, moths at the live signs; plainly futuristic, no cats | The open sign: a big Kumo Mart 24 sign over a cross street, fully lit, with a single 営業中 underneath |

Neon shots go to a Japanese-speaking reviewer before release. 出口 and 薬局 never appear on live signs or the vista. No Ferris wheels, leaning or broken towers, collapsed buildings, closure notices or warning graffiti anywhere.

**Invented brands** (all original, checked to avoid well-known names)

| Area | Brands |
|---|---|
| Downtown | Marlo's Deli, Persimmon Records, Butter & Crumb, Hotel Amberlane, Pressline Coffee |
| Suburbs | Mapleworth Hardware, Sunny Spoon Diner, Corner Scoops, Suds & Socks Laundry |
| Docks | Brindle Freight, Saltwick Shipping, Pier 9 Ice, Gullhaven Containers |
| Neon (Latin script) | Hoshi Noodle, Kumo Mart 24, Tetsu Arcade, Mochi Mochi Café, Sora Line (the maglev) |

**Japanese text in Neon**
- Only words from this reviewed list of correct, generic sign words may appear: ラーメン (ramen), 喫茶 (café), カラオケ (karaoke), 書店 (bookshop), 営業中 (open), 薬局 (pharmacy), 寿司 (sushi), 花屋 (florist), 駐輪場 (bicycle parking), 出口 (exit).
- Render them with system fonts: `"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif`.
- **Never random kana.** If a `measureText` check shows the glyphs are missing, fall back to geometric pictograms.
- Decorative "glyph" textures for holo screens use invented abstract strokes, not real characters.

### 18.7 Street details
- **Decals:** a 512² atlas drawn as instanced quads with `polygonOffset`.
  - cracks, patches, crosswalk zebras, lane dashes, oil stains, arrows, drains, leaves (Suburbs), petals (Neon)
- **Manhole motifs:** grid (Downtown), anchor (Docks), an original flower (Neon).
- **Real scale** (owner playtest, §24 row 74): manholes 0.6–0.75 m across and drains about 0.4 × 0.6 m, in every area; drains get moss rims.
- **Road arrows** point the way the skater travels, centred in a lane before a crossing; never backwards, sideways or on a lane line. Fewer if in doubt.
- **Crack lips** (owner playtest): every full-width pit, trench and gap kit shows a jagged, honest crack lip that you obviously jump, with the visible lip within ~0.1 m of the true collision edge; the plank stays. Implementation (T1): `kits/common.ts` `pit` draws both lips through `crackLip` (`LIP.amp` 0.10 m; teeth of road over the hole alternate with notches of hole into the road, 0.18–0.46 m apart; the far lip's teeth show a broken crumb face to the camera; a lighter broken rim follows the zigzag; hairline crack decals run back from it), and the full-width chevron band sits `LIP.band` 0.24 m before the near lip so the zigzag reads against the road; `tests/unit/render/kits.test.ts` checks the bound. The pit floor is flat `#2F2742` with no reflection, glint or ripple.
- **RECLAIM ground** (rule 7, §18.4): the clean core keeps only the existing decal kinds; the edge band (3.6–4.5) adds flat weed edges, moss patches and root-lift cracks at ≤ 1.3:1 and ≥ 0.3 m from any grind edge (never geometry, so nothing reads as a bump); grass in the zebra joints only at \|x\| ≥ 3.6; road paint faded (alpha ×0.7); oil stains at half frequency. **Leafy shadow casters** (crown and water-tower silhouettes) stripe the clean street in every area: the headline "overgrown" signal at zero clutter.
- **Puddles:** decals with the sky-horizon gradient, vertically stretched smears of nearby sign colours, and a UV ripple. Gold at golden hour; magenta and cyan in Neon. No real reflection. RECLAIM: outlines always organic (never rectangular), floating leaves only at \|x\| ≥ 3.6, Neon puddles reflect only live signs and show drip ripples.
- **Water** beyond the dock lip: a sky-gradient plane with sun-glitter sparkles.

### 18.8 VFX
All particles come from one pooled additive `InstancedMesh`, capped at 300.

| Effect | Recipe |
|---|---|
| Metal grind sparks | 40/s streak quads, `#FFE7A3` → `#FF8A3D`, life 0.25–0.45 s, 2–4 m/s back and up, gravity 9.8 |
| Neon rail sparks | Same, `#7FF8FF` → `#3FF2FF` |
| Ledge / bench | Dust puffs 12/s `#D9C3AE` / wood flecks 8/s `#C89B6D` |
| Landing dust | Ring of 10 puffs in the ground colour +20% lightness; radius 0.2 → 0.7 m over 0.35 s; alpha 0.6 → 0; scales with drop height |
| Perfect ring | Golden ground ring 0.25 s |
| Speed lines | From 9.0 m/s; warm-white streaks **outside the corridor only**; alpha ≤ 0.15; plus parallax streaks on the side dressing |
| Coins | 8-sided, emissive `#FFC94A`, 3 rev/s, bob 0.1 m, twinkle; pickup = 6-star burst |
| Crash | Cartoon star ring around the head, "BAILED!" sticker (DOM), coral outline flash on the obstacle that caused it, 40% desaturate through a shared material uniform (`uDesat`), never a CSS filter on the canvas |
| Bank-timer arc | World-space ring around the contact shadow, cream → coral, pulsing in its last 0.25 s (§13.2) |
| Petals / leaves | Area ambient, 6 per second on screen (off with reduced motion). RECLAIM: leaves in every area (rate 3), mixing green `#A8C66C` and russet `#B86A3E`, never gold |
| Critters (RECLAIM) | Butterflies (lilac `#B79AD8`, sky blue `#9DB4C8`), dandelion seeds (warm grey `#A39A8E`, ≤ 35% alpha), moths at live Neon signs, dragonflies (SB, IN): side bands only (\|x\| ≥ 4.6), never in the HUD band or the top third of the screen, never yellow, gold or white, ≤ 30 particles. Perched birds flutter off outward when the skater passes beneath or a trick lands within 6 m (with the bird-flutter one-shot, §19.3). **No fireflies, ever**, in any emitter, cosmetic or trail |
| Drips (RECLAIM) | Neon and the Underpass: "it just rained": drips from awning and sign edges in the side bands, ripple rings on puddles, ≤ 40 particles; **no falling rain**; off with "Reduce effects" |

### 18.9 Lo-fi overlay (DOM, `pointer-events:none`)
- **Grain:** a 128² grain tile pre-baked to a canvas at boot, shown at **plain alpha 0.05** (no blend modes, which are expensive on mobile GPUs) and moved by `transform` at 8 fps. Off on the low tier; static with reduced motion.
- **Vignette:** `radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(43,33,64,.35))`.
- **Neon only:** 2 px scanlines at 4% opacity.
- **"Reduce effects"** removes the overlay and the speed lines. **Reduced motion** also stops grain jitter, speed lines, petals, shake and the zoom punch.

---

## 19. Audio direction (100% WebAudio synthesis, no samples, no licensed audio)

### 19.1 Procedural lo-fi music

**Scheduler**
- Looks 120 ms ahead on the `AudioContext` clock and ticks every 25 ms.
- Each song has its own seed.

**Groove**
- 16-step bars with 58% swing: odd 16ths are delayed by 0.04 beat.
- Humanize timing by ±8 ms and velocity by ±10%.

**Drums** (the drum bus is low-passed at 9 kHz)

| Drum | Recipe |
|---|---|
| Kick | Sine falling 120 → 45 Hz exponentially over 0.12 s; attack 2 ms, decay 0.35 s. Click: 3 ms of noise high-passed at 2 kHz, gain 0.2. |
| Snare | Noise band-passed at 1.8 kHz (Q 0.8), decay 0.18 s, gain 0.7, plus a 185 Hz triangle decaying over 0.08 s, gain 0.4. Rim variant: band-pass 3.5 kHz, 30 ms. |
| Hats | Noise high-passed at 7 kHz. Closed: 40 ms, velocity 0.3–0.5. Open: 250 ms. |
| Shaker | Noise band-passed at 5 kHz, 60 ms, gain 0.08 |

**Patterns** (K = kick, S = snare, H = hat, g = ghost note)

| | K | S | H |
|---|---|---|---|
| A, boom-bap | `x......x..x.....` | `....x.......x...` | `x.x.x.x.x.x.x.x.` |
| B, lazy | `x........x.x....` | `....x.......x..g` | `x.xgx.x.x.xgx.x.` |
| C, half-time | `x.........x.....` | `........x.......` | `x...x...x...x...` |

**Progressions** (MIDI notes, written as bass | electric-piano voicing)

| Area | Key and tempo | Chords |
|---|---|---|
| **Downtown** | F major, 84 BPM | Gm9 [43 \| 58 62 65 69] – C9 [48 \| 58 62 64 67] – Fmaj9 [41 \| 57 60 64 67] – Dm9 [38 \| 53 57 60 64] |
| **Suburbs** | A minor, 80 BPM | Fmaj7 [41 \| 57 60 64 67] – E7♭9 [40 \| 56 59 62 65] – Am9 [45 \| 55 59 60 64] – Gm9 / C9 (2 beats each) |
| **Docks** | C minor, 78 BPM | Cm9 [36 \| 51 55 58 62] – A♭maj9 [44 \| 60 63 67 70] – Fm9 [41 \| 56 60 63 67] – G7alt [43 \| 53 59 63 70] |
| **Neon** | D major, 88 BPM | Gmaj9 [43 \| 54 57 59 62] – A13 [45 \| 55 59 61 66] – F♯m7 [42 \| 52 57 61 64] – Bm9 [47 \| 57 61 62 66] |
| **Menu** | E♭, 76 BPM | E♭maj9 – Cm9 – Fm9 – B♭13 |

**Instruments**

| Instrument | Recipe |
|---|---|
| **Electric piano (FM)** | Sine carrier. Modulator ratio 1, index 1.6 decaying to 0.3 over 0.8 s. Tine partial at ratio 14, index 0.4, 50 ms decay. Envelope A 5 ms, D 1.6 s, S 0.25, R 0.6. Tremolo 4.5 Hz at 0.12 depth with ±0.3 auto-pan. Low-pass 2.8 kHz (4 kHz in Neon). Chords strummed 12–25 ms apart, comped on beat 1 and the "and" of 2. |
| **Bass** | Sine plus a triangle an octave up at 0.3 gain, through a soft-clip WaveShaper (so it is audible on phone speakers), low-pass 600 Hz. Envelope A 8 ms, D 0.4 s, S 0.6, R 0.12. Root on beat 1, fifth or octave on beat 3, a chromatic approach note on the last 16th in 30% of bars, 30 ms glide. |
| **Pad** | 2 saws detuned ±7 cents, low-pass 900 Hz with an LFO at 0.07 Hz ±300 Hz. Attack 1.2 s, release 2 s, gain 0.1, voiced an octave up. |
| **Mallet melody** | Sine plus a 4× partial at 0.25 gain decaying in 120 ms; decay 0.7 s. Notes are chord tones plus the area pentatonic (the relative major's pentatonic in minor keys). A seeded 2-bar motif repeats with 25% of notes mutated and 35% of steps resting. Echo: 3/16 delay, feedback 0.3, low-pass 2.5 kHz. |
| **Arp** | Triangle 16ths going up and down the voicing, 90 ms decay, gain 0.06 |

**Lo-fi chain**
- **Tape:** a 12 ms `DelayNode` modulated by wow (0.5 Hz, ±1.5 ms) and flutter (6 Hz, ±0.2 ms), then tanh warmth (drive 1.4), then low-pass 7.5 kHz.
- **Vinyl:** a 4 s buffer pre-rendered at boot and looped.
  - Hiss: noise band-passed at 3 kHz, gain 0.012.
  - Pops: Poisson at 6/s, 1–3 samples each, high-passed at 1 kHz.
- **Sidechain:** on every scheduled kick, non-drum gain drops to 0.55 in 10 ms and recovers with `setTargetAtTime` (τ 0.07).
- **Master:** compressor at −14 dB, ratio 3, knee 10.

**Song form** (about 2.5 min per seed)
- Intro, 4 bars: drums muffled at 1.2 kHz.
- A, 16 bars.
- B, 8 bars: a different pattern; the kick drops out in bars 7–8; the pad comes up.
- A′, 16 bars: the melody enters.
- Break, 4 bars: low-pass sweep from 600 Hz back open.
- A″, 16 bars.
- Then a new seed. Every 2nd song uses an alternate voicing set.
- Fills: on bar 4 of each phrase, a 50% chance of a snare roll or a kick drop.

**Intensity layers.** Level = max(speed tier, combo tier). A change waits for the next bar line and fades in over 1 beat.

| Level | When | Adds |
|---|---|---|
| 0 | Menu, pause, results | Electric piano, pad, vinyl, muffled drums |
| 1 | Rolling | Full drums and bass |
| 2 | Speed tier ≥ 2 (≥ 9.0 m/s), or combo ≥ ×3 | Ghost 16th hats, open hat, melody |
| 3 | Combo ≥ ×6 | Arp and shaker. Drum low-pass opens to 12 kHz. Pad low-pass +600 Hz. |

- **Combo filter:** separately, the music low-pass follows the multiplier, from 800 Hz at ×1 to 8 kHz at ×10+ (§9).
- **Crash "tape stop":** the music low-passes to 400 Hz and pitch and gain fall to 0.3 over 0.5 s, with wow depth ×4, then a needle-lift click. Music returns from level 0 on the results screen.
- **Area transitions:** inside the gateway, play one bar of the new key's V7 as a pivot, then crossfade to the new song at the next bar line. The tempo changes at the crossfade.

**Per-area variations**

| Area | Drums | Signature |
|---|---|---|
| Downtown | Classic boom-bap, rim on ghost notes | Mallet melody. Pigeon flutters. Ambience (RECLAIM `plaza`, no traffic): wind, leaf rustles, wood-pigeon coos, a faint fountain trickle. |
| Suburbs | Softer kick (decay 0.25 s), brushed snare (decay 0.3 s, gain 0.5) | Plucky mallet. Bird chirps (sine glides 3–5 kHz, every 2–6 s). Sprinkler ticks only near a sprinkler. RECLAIM: a cricket bed, wind in grass, a far-off woodpecker, an in-key wind chime. |
| Docks | Heavier kick (starts at 140 Hz), snare with a metallic ring (squares at 540 / 800 Hz, 60 ms) | Off-beat FM clanks (ratio 1.41). Gulls. Lapping water. RECLAIM: the foghorn becomes a buoy bell; hollow wood knocks from moored boats, halyard clinks, an in-key chime; no metal groans. |
| Neon | Crisp hats, a clap layer on 2 and 4 | Brighter electric piano. Chorus on the pad (15 ms ±3 ms at 0.8 Hz). Triangle arp. Hum of the live signs (quieter). Vending-machine buzz. Maglev pass with Doppler every 40–80 s, softer. RECLAIM: after-rain drips (in-key plinks). |

The music itself (song forms, drums, instruments, tape and vinyl) is unchanged by RECLAIM; no theme sting uses a sparse acoustic-guitar motif. Ambience beds and events live in `audio/mix.config.ts` `AMBIENCE` and `audio/sfx/ambience.ts` (the ambience kind `traffic` becomes `plaza`, an internal id with no save impact). New SFX: a hollow body-panel thunk under a crash into a vehicle (no glass, no alarms), a bird flutter when perched birds take off, a soft in-key reversing chirp on the self-parking car.

**Musical feedback** (§9)
- Scoring notes go to their own "feedback" bus (mallet timbre). They are quantized to the next 1/16 if that is ≤ 40 ms away.
- Pitch climbs one pentatonic degree per trick in the combo, capped at 2 octaves. The pentatonic is the key's major one, or the relative major's in minor keys (Suburbs → C, Docks → E♭).

### 19.2 Mix
- **Buses:** music 0.55, SFX 0.8, ambience 0.25, feedback 0.5. Music and SFX each have a user slider.
- **Voices** are capped at 32. Noise buffers are pre-rendered at boot.
- **Variation:** every one-shot gets ±3% pitch and ±1.5 dB of random variation, from a non-sim RNG.

### 19.3 SFX recipes

**Rolling loop**
- **Base:** noise band-passed at 300 + 900 × speed01 Hz, gain 0.05–0.12, plus a brown-noise rumble low-passed at 180 Hz.
- **Surface variants:**

| Surface | Variant |
|---|---|
| Asphalt | Q 0.5, rumble 0.6, no joints |
| Concrete / tile | Q 1.2, gain × 0.7, a joint tick every 1.5 m (8 ms noise high-passed at 1.5 kHz plus a 90 Hz thump) |
| Wood planks | Joints every 0.3 m, a 140 Hz thump, resonant band-pass 400 Hz at Q 4 |
| Metal plate | Adds a ring: band-pass 1.2 kHz at Q 8 |
| Wet asphalt | Adds hiss: high-pass 4 kHz, gain 0.3 |
| Grass | Low-pass 800 Hz, gain × 0.5, soft swish |

- **Airborne:** the roll fades out in 40 ms, and a 900 Hz wheel whir fades over 0.4 s.
- **Wind bed:** pink noise band-passed at 600 Hz (Q 0.7) fading in from 8.0 m/s to gain 0.04 at 10.5 m/s, slowly panned. It sells speed without changing anything you must read.

**One-shots**

| Sound | Recipe |
|---|---|
| **Pop** | 15 ms of noise band-passed at 2.2 kHz (Q 1.5), plus a wood knock (sine 180 → 110 Hz, 80 ms), plus grip scrape (noise high-passed at 3 kHz, 60 ms, gain 0.15) |
| **Flip whoosh** | Noise through a band-pass sweeping 600 → 2,400 Hz over 60% of the flip (Q 2), gain swelling 0 → 0.25 → 0. Shove-its sweep 400 → 1,200 Hz with a pan sweep. The tre flip layers two sweeps 80 ms apart. The catch is a grip tap. |
| **Landing** | Two knocks 15 ms apart (sine 140 Hz decaying in 60 ms, plus 20 ms of noise band-passed at 1.5 kHz), plus a 70 Hz thud. Bigger drops add up to +4 dB and up to −20% pitch. Sketchy adds a 120 ms scuff. |
| **Stair judder** | One 25 ms knock per step crossed |

**Grinds** (entry hit, loop, exit)

| Edge | Recipe |
|---|---|
| **Metal rail** | Noise through three parallel band-passes (2.1 / 3.4 / 5.6 kHz at Q 12 / 10 / 8). Grit: a 95 Hz saw amplitude-modulated by noise, low-passed at 1.2 kHz, gain 0.1. Pitch drifts ±5% at 3 Hz. Gain 0.35. Entry clank: FM at 600 Hz, ratio 1.41, index 8 → 0 over 0.2 s. |
| **Concrete / stone ledge** | Noise band-passed at 900 Hz (Q 0.8), low-passed at 2 kHz, with grainy 20 Hz random AM, gain 0.3. Entry: a 120 Hz thump. |
| **Wood bench** | Noise band-passed at 600 Hz (Q 1.5) into a comb (4 ms, feedback 0.5). Occasional creak (220 Hz with vibrato). Woody knock on entry. |
| **Neon rail** | The metal recipe plus an electric hum (60 Hz square band-passed at 120 Hz, Q 4, gain 0.05) |
| **Slides** (board, lip, nose, tail, blunt) | Blend in a deck scrape (band-pass 500 Hz, Q 1) at 50% |

**Other sounds**

| Sound | Recipe |
|---|---|
| **Coin** | Sine plus a 2× partial at 0.3 gain, decaying in 180 ms, then a fifth above at 0.6 gain 60 ms later. Pitch climbs the area pentatonic (relative major in minor keys) from its tonic in octave 5, one degree per coin within 1.5 s of the last, capped at two octaves, and resets after a gap. |
| **Hazard tick** | Wood block (1.6 kHz for 20 ms plus 5 ms of noise), fired 1.6 s before a full-width hazard. Not quantized. |
| **Near miss** | Noise through a band-pass sweeping 3 → 1 kHz over 150 ms, panned to the obstacle's side |
| **Knock** | Plastic tock (sine 600 Hz, 40 ms) plus a short rattle |
| **Crash** | A noise burst low-passed at 1.5 kHz (250 ms), plus a thump sweeping 80 → 40 Hz over 300 ms, plus 3–5 decaying board-clatter knocks (150–300 Hz) over 0.6 s, plus the wheel whir. Then the tape stop. |
| **Combo bank** | An arpeggio of the current chord, 4 notes 50 ms apart, on the feedback bus |
| **UI** | Tap: 1,200 Hz for 30 ms plus 2,400 Hz for 10 ms, gain 0.15. Back: 800 Hz. Toggle: 900 + 1,350 Hz blips. Purchase: three coin chimes. |
| **Level up** | Maj9 arpeggio in the current key on electric piano plus mallet, 5 notes 70 ms apart, the last held 1.2 s. A 0.6 s high-passed shimmer at 6 kHz. Music ducks 3 dB. |
| **Crate** | Shake taps: a cardboard thump (noise low-passed at 800 Hz plus a 100 Hz sine), +2 semitones per tap. Open: a tape rip (band-pass sweeping 1 → 4 kHz over 0.25 s with 40 Hz AM) plus a 400 → 800 Hz blip. |
| **Crate reveal stingers** | Common: 2-note pluck. Rare: 3-note arpeggio. Epic: 4 notes plus shimmer. Legendary: full Maj9 strum, a rising swell, an FM bell (ratio 3.5, index 2) and crackle confetti. |

### 19.4 Platform notes
- Create and resume the `AudioContext` on a gesture that counts as **user activation**: `pointerup`, `touchend`, `click` or `keydown`. (A touch `pointerdown` does not count, so resuming there leaves phones silent.) Play a 1-sample buffer, and **retry on every gesture until the context is `running`**.
- Suspend and resume on `visibilitychange`. The Pause screen's Resume button calls `ctx.resume()` directly inside its click handler, which also recovers iOS's `interrupted` state after a call or Siri.
- Set `navigator.audioSession.type = 'ambient'` where it exists (feature-detected). That respects the iOS silent switch and mixes with the player's own music; Settings notes "No sound? Check the silent switch."
- An in-game mute is always available.

---

## 20. Monetization hooks (nothing live in v1; designed for later app wrapping)

**Principles**
- Gear is cosmetic.
- No premium currency. Prices are shown as real prices.
- No energy or lives, no streak loss, no expiring rewards, no countdown pressure, no fake discounts, no "best value" nagging.
- Restore Purchases is always present. The game is fully playable offline.

**Rewarded ads (opt-in only)**

| Placement id | Rule |
|---|---|
| `results_double_coins` | Doubles that run's coins when the run earned ≥ 20. At most once per run and 5 per day. |
| `daily_gift_bonus` | A second Cardboard crate, once per day |

- **No revives, ever.** "Crash = run over" is a pillar, and it keeps bests honest.
- **Never mid-run.** Never in the first 3 runs or on the install day. No interstitials, ever.
- **No auto-play, no blocking.** An offer never delays ROLL AGAIN.

**In-app purchases (future)**

| SKU | Price | Contents |
|---|---|---|
| `ad_free_pass` | $3.99 | Every rewarded-ad bonus granted with no ad |
| `coins_s` / `coins_m` / `coins_l` | $0.99 / $4.99 / $9.99 | 1,200 / 7,000 / 15,000 coins |
| `supporter_pack` | $6.99 | Ad-Free Pass, 3,000 coins and an original "Night Owl" cosmetic set (designed post-launch; never in crates) |

**Compliance hooks**
- A `config.cratesEnabled` region flag. When it is off, crate purchase is hidden, and the daily gift and Crate Meter grant coins equal to the expected value instead.
- The save keeps a separate `coinsPurchased` ledger, so crates can be limited to earned coins if a region requires it.
- Crate odds are always shown.

**Code hooks** (TECH §4.10)
- `platform/monetization.ts`: the `MonetizationProvider` interface, with `NullProvider` in v1, so ad buttons are hidden.
- `?fakeads=1` enables `FakeProvider` for development.
- `meta/offers.ts`: eligibility rules.
- Entitlements live in the save: `{ adFree, supporter, purchases[] }`.

---

## 21. Analytics events

**Storage and privacy**
- `meta/analytics.ts` exposes `track(event, props)`. It writes to a local ring buffer of 500 events in the save-adjacent key `dusklane.analytics`, and to the console in dev.
- There are **no network calls in v1**. The id is an anonymous install id. No personal data is collected, and there is an opt-out in Settings.
- A future `AnalyticsSink` interface lets a wrapper upload the buffer.

| Event | Properties |
|---|---|
| `session_start` | `installDay`, `runsTotal`, `platform` ('web' \| 'pwa' \| 'ios' \| 'android'), `quality` |
| `run_start` | `seed`, `runIndex`, `loadout` {skater, board, helmet}, `lesson` (bool) |
| `run_end` | `score`, `distance_m`, `duration_s`, `area_reached`, `max_speed`, `best_combo`, `coins`, `xp`, `new_best`, `lost_combo`, `retry_kind` ('instant' \| 'results') |
| `crash` | `cause`, `obstacle_kind`, `area`, `speed`, `t_s`, `state` ('roll' \| 'air' \| 'grind' \| 'manual'), `flip_progress`, `spin_progress`. This is the key event for balancing top-speed difficulty. |
| `combo_banked` | Aggregated per run: `count`, `max`, `sum`, `max_links` |
| `trick_counts` | Per run: `{ [trickId]: n }` |
| `hint_shown` / `hint_learned` | `hint` |
| `level_up` | `level`, `runsTotal` |
| `area_reached` | `area`, `t_s`, `first_time` |
| `retry_tap` | `ms_since_crash` |
| `shop_view` / `shop_purchase` | `{ item, rarity, price, featured }` |
| `crate_open` | `{ tier, rarity, dup, pity }` |
| `equip` / `wishlist_set` | `{ item }` |
| `rewarded_offer_shown` / `_accepted` / `_completed` | `{ placement }` |
| `iap_start` / `_success` / `_fail` | `{ sku }` |
| `perf_tier_change` | `{ from, to, workP95, missedVsyncPct }` |

---

## 22. Tunables map (which file owns which numbers)

| File | Contents | Owner during waves |
|---|---|---|
| `src/core/tuning.ts` | Movement, physics, fairness and camera constants (§5, §8, §10.6): `V_START`, `V_MAX`, `G`, `V_POP`, `V_LAT_MAX`, `LOOKAHEAD_MIN`, `R_MIN`, height bands, magnet and capture numbers, landing thresholds | Integrator (frozen after M0; value changes by note) |
| `src/input/recognizer.ts` (`DEFAULT_RECOGNIZER`) | Gesture thresholds (§4.2, §4.7): slop, tap / hold / long tap, swipe windows, labels, sectors, arc compensation, recoil, re-fire, owner sectors, sloppy tap, the two-thumb split `splitFrac` (0.5) | Gameplay agent |
| `src/tricks/score.config.ts` | Trick and spin points, modifiers, link window, combo heat (2.5 s), decay, bonuses (§6, §13) | Gameplay agent |
| `src/world/gen/gen.config.ts` | Difficulty phases, tier weights, template weights, A1–A3 periods, coin density (§10, §11) | World-gen agent |
| `src/meta/economy.config.ts` | Coin rules (incl. score coins `sqrt(score/400)`), XP curve, onboarding XP rules, level rewards, prices, crate odds and pity, shop featured rules (§14, §16) | Meta/UI agent |
| `src/world/render/palette.ts` | Palette presets (§18.1) | World-art agent |
| `src/audio/mix.config.ts` | Buses, BPMs, progressions (§19) | Audio agent |

---

## 23. Open items (non-blocking)
1. **Portrait yaw.** Resolved @cam (decision row 73): perspective, pitch 34°, ψ = 9° in portrait. Open: whether the lane misread of an angled street (≈ 1.7 m, 1 s ahead at the plateau) makes plateau crashes feel unfair in the M5 playtest; the fallback is ψ = 4–6° with the same perspective (skater +2 px), or a faint heading ribbon 1.5 s ahead of the skater's lane.
2. **Skater anchor.** 74% from the top. If playtests show a resting right thumb covering the skater, move to 70% (skater about 6% smaller). Decide in M5.
3. **Gamepad support** is optional (M5 stretch).
4. **Supporter "Night Owl" set**, Daily Street, landmark records, shared seeds and leaderboards are post-v1 (ROADMAP "Later").
5. **Tuning by playtest.** Final numbers for the link window (0.75 s), combo heat (2.5 s), the manual budget, plateau density and the Gold Stack frequency come from playtests, the myopic-bot gate and bot score ratios. All of them are config values.

---

## 24. Decision log (conflicts between proposals, resolved)

| # | Topic | Proposals said | Decision |
|---|---|---|---|
| 1 | Sim rate | Controls 120 Hz; Tech 60 Hz | **60 Hz.** Input is timestamped to ticks. Cheaper on phones and faster bot CI. 16.7 ms granularity is well inside every window (smallest is ±80 ms). |
| 2 | Top speed and ramp | Controls/Tech 11.0 m/s by 150 s (Tech used distance); Levels 10.5 with a 20 s hold | **7.0 → 10.5 m/s, `smoothstep(20,150,t)`, time-based.** The more modest cap the owner asked for, and seconds-native. |
| 3 | Gravity and airtime | Controls g 22 / 0.60 s / apex 0.99; Levels 0.62 s / apex 0.70; Tech g 26 | **g 22, pop 6.6, 0.60 s, apex 0.99.** A higher apex makes 0.6 m rails reachable and gives fat ollie windows. |
| 4 | Ollie-able height and bands | Controls ≤ 0.80; Levels ≤ 0.55 plus a forbidden band 0.56–0.79 | **Low ≤ 0.60 (full-width ≤ 0.50), forbidden 0.61–1.14, tall ≥ 1.15** (v1.1: tall was 0.90, but a flat ollie's 0.99 m apex cleared 0.95 m drums; see #44). Keeps Levels' readability band and fits every grind edge into Low. |
| 5 | Playable width | Controls 9 m; Levels 11–14 m per area; Tech 10 m | **9 m in every area.** The portrait camera can't fit more at 2.5 s of look-ahead. Areas differ in layout, not width. |
| 6 | Lateral speed | Controls 3.0 + 0.3v; Levels 5.0; Tech 5.5, all constant except Controls | **5.5 m/s constant, accel 40 / air 16.** "Steering is equally quick at any speed" is the clearest fairness story. |
| 7 | Look-ahead and reaction floor | 2.4 / 2.4 / 2.5 s; 0.85 / 0.9 / 0.85 s | **≥ 2.5 s look-ahead, `R_MIN` 0.9 s at the plateau**, plus a 1.2 s decision-time rule |
| 8 | Camera angle | Controls pitch 42°, yaw from aspect (~17° in portrait); Tech pitch 35.26°, yaw 30° | **Pitch 35°. Yaw 0° up to aspect 0.75 (every portrait phone, toolbars included), rising to 30° at 1.25.** A framing solver handles it. Computed: any portrait yaw over ~5° makes the far corner of the street exit the screen or shrinks the skater below 40 px. |
| 9 | Hitbox | 0.40 × 0.70 / 0.4 × 0.8 / 0.5 wide | **0.40 W × 0.70 L × 1.5 H**, with 0.08 m face inset |
| 10 | Landing thresholds | Controls clean ≥ 0.8, sketchy 0.55–0.8; Levels crash below 0.8; Tech auto-complete ≥ 0.75; Progression perfect = early finish | **Controls' bands.** **Perfect = finished in the last 0.12 s** (v1.1, was 0.20 s, which made almost every flip Perfect). **Sketchy banks the combo** (Progression). |
| 11 | Trick points | Controls 80–550; Progression 50–400 | **Progression scale** (the economy is built on it), extended to the full Controls trick list (impossible 200, inward 300, triples 650) |
| 12 | Multiplier | Controls: repeats add no multiplier; Progression: every trick is a link | **Links = flips, grinds, switches, grabs, transfers, and the manual once. Ollies add none**, which closes the ollie-spam exploit. Cap ×30. |
| 13 | Link window | Controls 0.35 s; Progression 0.75 s | **0.75 s** (chill), with the manual budget extending it, plus **2.5 s combo heat** and gateway banks (v1.1, #38) |
| 14 | Manual | Controls: shrinking budget, 30 + 40/s; Progression: 4 s auto-bank, 75 + 100/s | **Progression points with Controls' shrinking budget** (3.0 / 2.2 / 1.6 / 1.2 / 1.0 s). v1.1: steering gain stays 1.0 in a manual. |
| 15 | Grind list | Controls 9; Progression adds lip and blunt | **13 grinds.** The doubles (←← ↓↓ ↑↑ ↗↗) add Lipslide, Bluntslide, Nosebluntslide and Overcrook. |
| 16 | Magnet and capture | Controls 1.6 m magnet, 0.9 capture; Levels 0.8 descending only; Tech 0.9 / 0.35 | **Controls' generous magnet, air-only capture** (Levels A6). v1.1: the magnet moves `targetX` (≤ 3 m/s) instead of adding acceleration, and curb-class edges need a pick swipe. |
| 17 | Side contact | Controls: combo continues; Levels: combo drops | **Combo continues** (chill arcade) |
| 18 | Near miss | +25 / +75 | **+75**, refreshes the link window, no link |
| 19 | Opening | Levels: a 45 s fixed intro every run; Controls: a 60 s first-run tutorial | **Lesson Line (40 s since v1.1) only until moves are learned (max 3 runs). Every later run gets a 9 s Roll-out.** Avoids a stale intro on every retry. |
| 20 | Gateways and palette blend | Levels 4 s; Art 8 s | **4 s gateway pieces, 8 s palette blend centred on them. Neon arrives at 2:02** (v1.1, was 5 s and 2:45; #39). |
| 21 | Light direction | Art "behind-left, shadows to bottom-right" (self-contradictory) | **Sun behind the camera, to the left.** Fronts are lit and shadows rake up-right. |
| 22 | Sky | Art and Tech assumed a visible sky in the run | The 35° ortho view never sees the horizon. **Sky dome only in menus. In the run, light, shadow, haze, sky glow and reflections carry the mood.** |
| 23 | Bloom and budgets | Art: bloom on high tier, ≤ 120 draws / 90k tris; Tech: no post, ≤ 60 / 150k | **No bloom in v1. ≤ 70 draws in the main pass (≤ 120 total) and ≤ 120k triangles** (TECH §8.4) |
| 24 | Shadow map | Tech 1024 / 512 / off; Art 1024 mobile, 2048 desktop | **2048 high / 1024 med / off low**, `PCFShadowMap` with radius 2 / 3 (v1.1) |
| 25 | Skater rendering | Tech: an Object3D hierarchy; Art: hierarchy plus outline | **A rigid-skinned body mesh plus outline twins; board and helmet attached to bones.** ≤ 8 draw calls for the whole skater (TECH §8.5) |
| 26 | Helmets | Art: 6 novelty legendaries; Progression: 12 helmets | **Progression's 12** (they include Art's lantern and fishbowl). The other novelties go to the backlog. |
| 27 | HUD placement | Progression: total top-centre, pause top-left; Art: score top-left, pause top-right | **Art's layout**, with Progression's combo pill top-centre |
| 28 | Audio session | Tech 'ambient'; Art 'playback' | **'ambient'** (respects the silent switch, mixes with the player's music) |
| 29 | Retry flow | Controls: tap after 0.6 s for a new run in < 1 s; Progression: results first, ≤ 3 s | **Both.** An instant tap skips results and still grants rewards via a toast. |
| 30 | Monetization module | Progression `meta/monetization.ts`; Tech `platform/monetization.ts` | **`platform/monetization.ts`** (providers) plus **`meta/offers.ts`** (eligibility policy) |
| 31 | Movers | Levels: included, phase-locked | **Specified, but deferred to M5 stretch** (v1.1, Feasibility review: the owner never asked for them, and they cost a validator mode, 4 templates and 4 kits tonight) |
| 32 | Brand names | Art "Kettle & Crumb" clashes with the skater Kettle; "Rook Bay" clashes with Rook Delaney; "Tangerine Records" is a real historic label | Renamed to **Butter & Crumb**, **Gullhaven Containers** and **Persimmon Records** |
| 33 | Distance points | Levels 1 pt/m; Progression 1 pt/m | 1 pt/m, never multiplied (all agree) |
| 34 | Score bot ratio | Levels ≤ 15%; Progression ≤ 10% | **≤ 10%** |
| 35 | Straight-bot criterion | Controls: crash ≤ 45 s on 95% of seeds; Levels: median < 20 s; Tech: ≤ 20 s on 95% | **100% of lanes crash by t ≤ 20 s, and within 10 s from a plateau start** (v1.1). Guaranteed by construction: A1 and A2 run at an 8 s period from t = 9 s, and their clocks pause only in T0. |

### Review v1.1 (Player, Feasibility and Mobile critiques)

Every MUST-FIX was applied. The rows below record decisions where critiques conflicted, where a fix was changed, and where a point was rejected or deferred.

| # | Topic | Critique said | Decision and why |
|---|---|---|---|
| 36 | Body spins | Player: ↗ / ↖ = FS / BS 180, doubled = 360, Revert +50 +1 link, 180 Out from grinds | **Accepted.** Revert's link is only granted when the spin itself linked, otherwise a decayed spin would still farm links. |
| 37 | Grind-state swipes | Feasibility: ↑ and TAP pop out, switches use the other 7 directions; Player: ↗ / ↖ = 180 Out | **Merged:** ↑ / TAP pop out, ↗ / ↖ are 180 Outs, switches use the remaining 5 (↓ ← → ↙ ↘ and doubles). Noseslide, Crooked and Overcrook become entry-only picks. |
| 38 | Endless combo | Player: 2.5 s heat, gateway auto-bank, score coins `sqrt(score/400)` | **Accepted.** Heat pauses during grinds and manuals, or a long rail would bank its own combo. The combo payout `sqrt(combo/250)` is kept, since heat already bounds combos. |
| 39 | Timeline | Player: Downtown 40 s, areas 35 s, gateways 4 s, Neon at 2:02 | **Accepted.** The Lesson Line was compressed from 45 s to 40 s to fit, and the Harbor Bridge became an optional L1 deck so the gateway fits in 4 s with no datum change. |
| 40 | Neon readability | Player: hazards `#5A4E86` + emissive rim, road `#352F55`, ≥ 3:1 gate. Mobile: hazards `#151020` + glowing band, road `#3B3560`, ≥ 2.5:1 gate | **Lighter hazards on the darker road** (Player's direction), but `#5A4E86` measures only ~1.7:1 against `#352F55`, so the body is `#7A6FB0` (~2.8:1 before its rim). Mobile's dark-on-dark scheme measures ~1.6:1 by body colour and was rejected. **Gate: 2.5:1 everywhere** (Mobile), with 3:1 as Neon's target: a hard 3:1 gate would fail ink on Downtown asphalt (~2.7:1 even after lightening it). Grind edges follow Mobile: cream over an ink underline in every area, ≥ 1.8:1. |
| 41 | Air-dodge flips and recognizer misfires | Player: parked-thumb rule for air ←/→; Mobile: re-fire, lift-off and 0.75 px/ms rules | **Both, merged into one steering-stroke rule** (§4.3). Extended to ground ↑ ↗ ↖, so a steering thumb drifting upward can't pop a spin ollie. The recognizer stays stateless: it labels swipes (`fast`, `fromRest`, `steer`) and the sim decides. |
| 42 | Thumb bot vs input-realism bot | Player: 20 seeds; Mobile: 50 seeds with tap, tremor and arc models | **One "thumb bot"** with Mobile's models: 20 seeds at gates, 50 at release. |
| 43 | Instant-retry guard | Player: fresh touch-down ≥ 0.6 s; Mobile: ≥ 0.45 s | **0.6 s**, matching the moment the prompt appears. |
| 44 | Skim rule vs tall obstacles | Feasibility: skim any front contact ≤ 0.18 m below a top, in every mode | **Changed:** skim applies only to `landable` tops. With tall now at 1.15 m (inset 1.07 m), a universal skim would have let a 0.99 m apex skim over a bin, undoing Mobile's tall fix. `crash` tops always slam; the validator matches that. |
| 45 | Anti-straight vs breathers | Feasibility: pause A-clocks in T0, constructive fallback, and no breather in t ∈ [45, 57] | **Clock pause and constructive fallback accepted. The [45, 57] ban was rejected as unnecessary:** under the new straight-bot rule (crash by t ≤ 20 s) the straight bot is dead long before the first warm-phase breather. |
| 46 | Committed exit set | Feasibility: `E` limited to within 2.0 m of the safe exit x, plus rule (h) | **Accepted**, together with Player's myopic greedy check as rule (i), so a player who drifts from the safe line meets only short, visible dead ends. |
| 47 | Start District picker | Player: Title picker, area Roll-outs | **Deferred to M5 stretch.** `RunConfig.startArea` goes into the contract now (cheap); the picker, four area Roll-outs and the rotated timeline come after the core is green. The compressed timeline already shortens the repeated part to the 9 s Roll-out. |
| 48 | Run 1 level overshoot | Player and Feasibility: no New Best XP on run 1, start area doesn't count, Trick Book 25 XP | **Accepted, plus an onboarding cap** (at most one level-up per results screen in runs 1–3, overflow held). The compressed timeline makes run 1 reach Suburbs, which alone would have pushed it past Level 3. |
| 49 | Air hold for grabs | Feasibility (nice): touch grabs are almost unreachable | **Grab needs ≥ 0.25 s of air left (was 0.35 s).** A shorter air-only HOLD threshold was rejected because the recognizer can't know the skater is airborne. |
| 50 | Plateau density | Player: 6 actions / 10 s, breathers every 20–30 s; Feasibility: table values are measured outputs ±25% | **Both.** Final values are whatever keeps the myopic-bot gate green. |
| 51 | Seconds vs metres | Feasibility: "template seconds win, catalog metres are clamps" | **Read as:** seconds are authoritative for length-parametric kinds, and the catalog ranges were widened to fit them at `V_MAX` (granite ledge 4–22 m, guard rail 6–32 m, skywalk deck 20–45 m). NE_SKYWALK is 6.0 s and only drawn at T3+ (v ≥ 8.9). |
| 52 | Speed feel | Player (nice): speed lines from 9.0, streaks, wind, tier stamps | **Accepted**, with Mobile's limit: speed lines only outside the corridor at ≤ 0.15 alpha. Speed tiers unified at 8.0 / 9.0 / 10.5 m/s for events, stamps and the audio layer. |
| 53 | Camera yaw with toolbars | Mobile: the SE in Safari gives ψ ≈ 3° | **`yawAspect0` raised from 0.62 to 0.75**, so every portrait phone viewport stays at ψ = 0 and the test table is simpler. |
| 54 | Scope for one night | Feasibility: defer movers, ship 6 templates per area, skip L1 in the validator, move PWA to M4, fewer bot seeds, static title, stretch cosmetic fx | **All accepted** (ROADMAP). |
| 55 | Daily Street, landmark records | Player (nice) | **Moved to ROADMAP "Later".** Cheap thanks to determinism, but they need UI and save work that competes with the core tonight. |
| 56 | Fonts | Mobile: self-host now | **Accepted:** `@fontsource` woff2 files bundled by Vite (inlined in the single-file build). No third-party requests at all. |

### G0 playtest review (integration gate)

| # | Topic | Finding | Resolution |
|---|---|---|---|
| 57 | Dodges read as tricks | A fast dodge rising 30–40° popped a FS/BS 180 and the ground pop subtracted the dodge; a fresh medium-speed sideways stroke in the air heelflipped and lost the dodge | **Steering-thumb sectors** (§4.2, diagonals ±10° for the steering owner unless a parked thumb flicks first), **fresh steering strokes** need `fast` or `fromRest` sideways (§4.3), and **pops cancel no steering** (§4.4 rule 2). |
| 58 | Sloppy taps | 12–20 px of drift within 100 ms gave nothing | **Sloppy tap** (§4.2): < 20 px (< 15 px sideways), no swipe, lifted ≤ 250 ms. A 350–600 ms press outside a combo is still nothing: it needs a recognizer/sim contract decision and touches the manual rules (GP, W1a). |
| 59 | First run teaches nothing | No hints until M4 | **Interim first-runs hints** (runs 1–3, Roll-out only): "DRAG TO STEER", "TAP TO OLLIE" 1.2 s before the chain, "OLLIE ONTO THE LEDGE"; the crash cause line now says what to do ("tap to ollie it" / "steer around it"). The Lesson Line hints (M4) replace them. |

### G1 merge gate (design-owner decisions and gate calls)

| # | Topic | Finding | Resolution |
|---|---|---|---|
| 60 | Back-to-back manuals | Manual → roll → manual (re-press, or pulse S) held a combo for a whole visit without a real trick (35 manuals, 38 s from one kickflip) | **Accepted as built (GP):** a manual started straight after another one without leaving the ground keeps the combo heat running (`RULES.backToBackManualPausesHeat = false`); the first manual after every touchdown still pauses it, so the 3.0 / 2.2 / 1.6 / 1.2 / 1.0 budgets stay usable. §6.4 reads: "Manualling pauses combo heat, except a manual started straight after another one without leaving the ground." |
| 61 | A deliberate manual outside a combo | §4.4 rule 3 ("scores only inside a combo") vs §12.3 ("Hold = manual. The combo counter and bank arc appear") | **Accepted as built (GP):** a manual the touch rules allow outside a combo (HOLD on a pad or raised landable top, the manual key on a top, a pre-press held through touchdown, a grab held through touchdown) starts a combo and is its link (75 + 100/s). The manual key on flat ground outside a combo still rides unscored, like a resting thumb. A pre-press must go down **in that air** (a tap already under way at a curb roll-off is an ollie, not a pre-press: the thumb-bot gate). |
| 62 | The 350–600 ms press | Row 58 left it as "nothing" | **Long tap** (GP): a still press released 350–600 ms after down reads as a TAP wherever its HOLD started nothing (an ollie on the ground, a linked ollie out of a manual it started, the jump buffer, a pop-out). A 700 ms press still does nothing. |
| 63 | Pop-out re-capture | The magnet re-locked the ledge a pop-out left, so you could not get off a ledge | **No re-capture of that edge** (GP, on): after a pop-out the magnet skips the edge it left, and capture skips every edge of that obstacle when its top is landable, unless you steer toward it. Rails and beams keep re-capture. |
| 64 | `Decor.y` | WG gave awnings / signs / banners their mounting height in `y`, WA added its own again (awnings at ~5.9 m) | **One convention:** `y` is the surface an element stands on or hangs from; hung kinds carry a `mount` param (lowest point = `y + mount`). Only overhead kinds give their lowest point in `y` (TECH §4.14). |
| 65 | Palette values | WA's gate tuning moved three colours | **Accepted:** asphalt `#7F7890`, Neon hemi sky `#A69CD8`, ink hazard bodies `#170F24` with `#4A3B6B` tops (§18.1). The pixel gate (`shots --contrast`, silhouette measured) is the source of truth. |
| 66 | Board identity at 31 px | The grip hides the board graphic in runs | **Accepted:** a thin palette-coloured grip border, one tunable in `skater.config.ts`, default on (M5 if not built earlier). **Built at G1 tune** (`GRIP_BORDER`: the palette colour farthest from the grip, 13% of the grip width). |

### G1 tune (owner playtest and the gate's measured outputs)

| # | Topic | Finding | Resolution |
|---|---|---|---|
| 67 | Grindable vs not (owner) | "Very hard to differentiate grindable things vs not" | **One grind signature** (§18.4): the cream-chrome coping with a fixed sheen and a travelling glint on every grindable edge in every area; nothing else uses cream or the glint. Hazard tops two value steps lighter (`#5C4B84`) so steer-around volumes read as boxes. Things that looked like the signature lost it: white picket-fence decor is a painted blue-grey, the speed lines peach. Surfaces a grind edge borders are mid-value so the stripe reads against them: manual pad tops (`PAD_TOP`) and the elevated tiled decks outside Neon (`COLORS.deckTile`, the Harbor Bridge deck read as a blown-out light bar beside the vending banks). The contrast gate passes every preset and blend at both viewports. |
| 68 | Neon clutter over the street (owner) | Lantern strings across the road read as chains; overhead decor every 26 m; the maglev light streak was a 90 % cyan-white bar across the look-ahead zone (it sank a vending bank's contrast to 1.89) | Lantern bulbs only beyond \|x\| ≥ 4.6; strings every 48 m (Neon), wires every 40 m (Suburbs); the maglev streak at 22 % in paper-magenta (§18.4 occlusion and effects limits). |
| 69 | Dead stretches (owner, §11) | 85% of the anti-straight row segments (S_GATE, half of all run time) and every A3 hazard carried no trick element; warm/build breathers ran straight into the gateway (8–9 s of empty road) | **Template fill:** a manual pad in the row opening's lane (threading the gap is a manual line), A3 hazards land into a manual pad (50%), the single-element templates (DT_LEDGE, SB_WALL, IN_BEAM, NE_RAIL) get a second beat (pad, bench or flat bar, 70%), breathers carry the optional flat bar; breathers mid-visit (§11). Trick elements / 10 s 3.0 / 1.5 / 1.9 / 1.3 → 3.8 / 2.0 / 2.4 / 2.2 (opening / warm / build / plateau). The §11 targets (4–5 trick elements, 4–6 actions / 10 s) need rows hosted by template trick props instead of S_GATE (still ~50% of run time): M5 content work. |
| 70 | Score ratio and combo gates | The trick bot only flipped on the plan's own ollies (4k pts/min, ratio 0.42) | The trick bot keeps combos like a good player (§10.11): 23.7k pts/min, ratio 0.072, p95 combo 6.3 s, 100 triples (deck pops) in 50 seeds × 5 min. Scoring unchanged. A frame-perfect chain (a pop after every landing) reaches ~270k pts/min: the ×30 multiplier over a whole visit; watch it in M5 balance. |

### Owner playtest (after G1)

| # | Topic | Finding | Resolution |
|---|---|---|---|
| 71 | Owner playtest: steer left thumb, tricks right thumb | Playing the G1 build on a phone, the owner felt steering and tricks fighting each other on one thumb ("we need steering on the left thumb and tricks on the right thumb; still swiping the way it works now") | **Two thumbs is the default on touch** (§4.1–4.4): the play area splits at the vertical midline; a touch keeps the role of the zone it went down in. The left thumb only steers (never a tap, swipe, hold or press); the right thumb only taps / swipes / holds with the unchanged gestures and never steers (`swipeDx` 0, normal thresholds). The split lives in the recognizer, so the `InputFrame` contract, the sim, replays and golden hashes are unchanged. **One thumb (classic)** (§4.7) stays in Settings, and a mouse or pen always uses it; **Swap sides** for left-handed players. Hints show the two rings and name the thumb; a zone cue shows the split for the first 3 s. Thumb-bot gate on both layouts (0 crashes, 0 unintended tricks); its control (the two-thumb traces read with the one-thumb grammar) misfires. **Review fixes:** the trick ghost hovers (a right thumb resting on the glass is a HOLD: grabs and manuals, measured by the bot's `rest` habit as a trade-off, §4.4 rule 3); a profile from before the change is re-taught once (§12.5) and the session's first-run cue is labelled; wrong-side taps / drags pulse the right ring; hints follow a Settings change mid-run; Swap sides is dimmed with One thumb; a steering-zone DRAG already down takes over steering when the owner lifts and it moves (§4.2). |
| 72 | Steering kept going after the thumb stopped | Owner on a phone: "if I slide it to the left or right and kind of flick it, it will continue to turn even when I take my finger off it." Relative steering put targetX wherever the thumb went (a 60–120 px slide in 120–250 ms threw it 2.5–5 m), and the skater, limited to 5.5 m/s, kept sliding 2.3–3.6 m for 0.45–0.8 s after the thumb had stopped or lifted (2.4–3.9 m in the air). | **Direct touch steering** (§4.2, §5.2; measured with recorded thumb traces through the real recognizer, table in §4.2): the target leads the skater by ≤ 0.8 m; a thumb that outruns the skater drives it at up to 7 m/s (80 m/s² on the ground); a release brake stops it within ~0.35 m when that thumb stops or lifts (0.1–0.33 m on the ground, 0.20–0.27 m in the air, no overshoot). **The cost:** a quick slide now dodges as far as the skater can go while the thumb moves, not as far as the thumb drew: 60 px / 120 ms moves 0.6–0.8 m (was 2.5 m), 120 px / 250 ms 1.2–1.8 m (was 4.3 m); a 2 m dodge needs the thumb to keep moving ~0.3 s (0.32 s for a 0.5 px/ms thumb kept moving until the skater is there); a 2 m drag drawn in 300 / 400 / 500 / 600 ms ends at 1.1 / 1.5 / 1.9 / 2.0 m; a 40 px flick is a 0.33 m hop (was 1.7 m). Against a late hazard at plateau speed (the latest start before its face that still dodges a crash box centred on the skater): a slide that moves the skater far enough dodges about as late as before or later (1.6 m box: 120 px / 250 ms 0.22 s, was 0.26; 2 m drawn in 300 ms 0.26 s, was 0.32; 90 px / 180 ms 0.30 s, was 0.26), a sustained drag as before (48 px / 600 ms 0.40 s, was 0.40); a slide too short for the hazard does not dodge it at all (60 px / 120 ms never clears a 1.0 m box, was 0.20 s; under ~0.25 s of thumb motion never clears 2.4 m). **The owner should try quick dodges on the preview.** **Measured and rejected:** the cap alone (0.6 m: 0.43–0.54 m after a stop, 0.54–0.65 m in the air with a 0.12 m float past; 0.9 m: 0.72–0.84 m); a higher air acceleration (30: no float, but 0.46–0.52 m, and it changes keys, bots and the magnet in the air); a brake to the stopping point with no rest lead (0.12–0.33 m, but a flick moved 0.1 m and natural drags lost up to 0.4 m); the cap and brake without the fast thumb (first preview, 15cac29: 60 px / 120 ms moved 0.45 m, 120 px / 250 ms 1.0 m; quick slides of 60–90 px never cleared a 1.6 m box); arming the brake at a 0.6 m lead (it also armed for the thumb bot dragging through a hop, 0.62–0.66 m ahead, and changed its path); a higher fast-thumb speed (7.5–8 m/s: +5–6% distance, stops up to 0.355 m, and the board heads more sideways than forward at the 7 m/s start speed); a restLead of 0.35 / 0.4 m for a little throw (+0.15 / +0.2 m per slide, but stops at 0.26–0.48 / 0.31–0.53 m, past the 0.35 m target: the tunable to try if quick dodges feel short). Keys, bots (bit-identical paths to before @steer: never at the cap), the magnet, ground align, re-anchors and landing nudges never meet the cap, the fast thumb or the brake; `V_LAT_MAX`, the accelerations and `T_SHIFT` are unchanged, so the validator and every generated line are untouched. On a phone that delivers one sample every 40–67 ms (no coalesced events below 25 fps) the stop window widens, so a drag stays smooth (3.9–4.0 m of a 4.0 m drag) and the stop takes 0.43–0.54 m. |
| 73 | Run camera reads flat on phones (@cam) | Owner, after a phone playtest: "I thought it would be like angled view instead of straight down that street… maybe closer perspective?"; DESIGN §8 had ortho, pitch 35°, ψ = 0 in portrait. A prototype of 8 cameras (ortho pitch/yaw variants, telephoto perspective) and three judges: readability (winner perspective p34 ψ 9 FOV 24), art direction (perspective p34 ψ 10 FOV 22), game design (perspective ψ 0, warning that any yaw tilts the lane read; ≤ 4–6° if angled) | **Perspective, pitch 34°, ψ 9° in portrait (30° at aspect ≥ 1.25), window FOV 24°, D solved per frame**, anchor 74%, 15% lateral follow fitted into the solver. It answers both owner points: the street runs diagonally and both walls show (angled), and hazards grow as they approach while the skater stays ~50 px (closer, 31 → 50 px on the SE). Cost: the 2.5 s hazard is 20% smaller at 390×844 (22.7 vs 28.3 px; +22% at 375×548), a ≈ 1.7 m lane tilt 1 s ahead, coarser shadows (the shadow box grows to the ground shown). Same change: grind stripes and coins floored per view depth (constant ~3 px stripes, ink underline down the faces: the contrast gate passes from every angle), x-ray cap 1.6 → 1.2 m, and the occlusion cure the owner asked for separately (Neon decor "covered the skate area"): camera-side cut at the corridor edge, overhead spans faded over the look-ahead zone, the maglev moved to the far facade line. `?debug=1&cam=A` keeps the old camera for comparisons. |
| 74 | Re-theme "RECLAIM" (owner-approved) | Owner, after a phone playtest: "instead of the weird random shapes that are kind of the blocking parts, it could just be cars"; a quiet, peaceful, nature-reclaimed abandoned city, real objects instead of abstract blockers, overgrowth on buildings and verges, clean skateable streets, no zombies, people or gore; same four areas, lighting, lo-fi vibe and gameplay. Also: pit gaps should look like jagged cracks you obviously jump; manhole and drain decals were far too large; road arrows did not make sense | **Accepted (theme spec, work packages T0–T8).** Phase A changes only look, decor, ambience and copy: every PropKind keeps its footprint, class, top type, solids, edges and hitboxes; the validator, bot gates, controls, scoring, camera rules, contrast gate and perf budgets are unchanged, and the golden obstacle hashes stay identical through the Phase A review (T3 splits the golden test into obstacle and decor chains and re-baselines only decor). The theme lives in §1, §10.3 (skin notes), §12.3/§12.4 (the Roll-out ollie is a road-works barrier on trestles; no chains anywhere), §18.1 (`RECLAIM` tokens, green-share bands), §18.4 (ten dressing rules, enforced and accounted by `kits/dress.ts`, the life budget ≤ 10% checked per variant), §18.5 (vehicle builder: dark glass framing a paint roof, tyre nubs, one accent stripe, no chrome), §18.6–18.8 and §19.1. `core/skins.ts` `propSkin` (additive core request THEME) makes the drawn object and the crash noun one deterministic choice. **Phase B** (T8, same release, owner-requested): cars become the main blocker with a new `van_across` kind and parked-row templates; it re-runs every bot gate and re-baselines the obstacle hash once. Players never see a theme name and are never told why people left. New player-facing strings use the game's name Isoskate where a name appears. |
