# DUSKLANE: RECLAIM theme spec

Status: final, for owner sign-off. Internal theme name **RECLAIM** (it matches the `RECLAIM` token table). Players never see a theme name. This spec is the source for the re-theme work packages (§12). Phase A changes only look, decor, ambience and copy, and every gameplay number stays where it is (DESIGN §5, §10, §13, TECH §4). Phase B (T8) changes generator content so cars become the main blocker. Sign-off on this spec is also the request for Phase B approval.

---

## 1. Concept

**One paragraph (internal; never shown to players).** Years ago everyone left the city, calmly, and nobody was hurt. The city went quiet and nature moved back in slowly. Fig trees grow out of hotel roof terraces, wildflowers fill the front lawns, swifts nest under the cranes, and moss softens every stone. Cars still sit in their bays and driveways, doors closed, sun-faded, with moss at the roof edges and sometimes a cat asleep on top. A few helper machines kept working: a street sweeper on its rounds, a forklift shuffling pallets, a delivery robot, a car still doing its evening re-park. The city runs on sunlight now, so some lights switch on by themselves at dusk. The light is the same golden hour sliding into a neon night, and the lo-fi beat still plays. You are the only person on screen, and the whole city is your skatepark. In a world of rust and moss, the ledges and rails you grind are the only polished things in sight, polished by your own board.

Players are never told why people left. Saying it in game raises the question. The calm, peaceful cause stays an internal brief.

**Mood words:** solitude, calm, wonder, freedom, golden, hopeful, "the whole city is your skatepark".

**Honest take on the owner's idea.** It is a good move. The isolation fits the name, and real objects read better than abstract blocks. The calm keeps the chill vibe. Three caveats, all handled here:
1. **Tone.** "Abandoned" slides toward grim very easily. The guardrails below keep it warm: flowers, birds, gold light, clean helper machines, no decay theatre.
2. **Not every blocker can be a car.** Most blockers today are narrow column fillers (bins 0.6 m, news boxes 0.5 m, mailboxes 0.4 m), because they form gates. The current templates reference them about 30 times, against 3 for car-sized kinds. Phase A turns every car-sized slot into a vehicle and every filler into a real, readable object. To make cars the **main** blocker, Phase B (§3.4, T8) changes generator content and must pass the bot gates again. It ships in the same release, before the owner build and the store shots.
3. **Neon has no car kind today.** In v1 its taxis are decor outside the corridor. Taxis and kei vans in the street come with Phase B.

**Do**
- Moss, ivy, wildflowers, saplings, trees through roofs and awnings, meadow verges, roof gardens.
- Pigeons and sparrows on wires and roofs, grey-backed gulls, a grey heron, swifts swooping, a V of geese, butterflies, one far-off deer or fox, cats on car roofs (not in Neon).
- Sun-faded paint, gentle orange-brown rust, faded posters, dead neon tubes beside the lit ones.
- Vehicles parked calmly in bays, driveways, curbs and loading entrances. Doors and boots closed. Intact, quietly weathered.
- Helper machines (sweeper, forklift, robot, self-parking car) clean and working.

**Do not**
- No zombies, people or NPCs, bodies, blood, gore, fire, smoke plumes, weapons, military or police gear, quarantine walls, sandbags, barbed wire, warning graffiti or X-marked doors.
- No crashed, crumpled, overturned or burnt cars, no pile-ups, no jams, no lanes of stopped cars, no car parked mid-lane, no shattered glass, no open doors or boots, no luggage or mattresses on roof racks, no car alarms.
- No fungus or spore growths, mushroom clusters or fleshy growths.
- No fireflies, ever, in any emitter, cosmetic or trail.
- No leaning, toppled or broken towers: every tower stands upright. No collapsed buildings and no war damage.
- No Ferris wheels or amusement parks, anywhere.
- No cats in Neon City. No faces or emoticons on robot screens (pictograms only). No robot or machine touches, carries or grows plants.
- No lone dog, no circling birds of prey, no deer herd, no deer in Neon, no wild boars.
- No stopped clocks, black bag piles, closure notices, hazard or radiation symbols, dosimeters or masks.
- No cherry-tree avenue arching over the road.
- No flicker on any hazard, and no single window that flickers or lights up as you pass.
- No crimson stains: rust drips stay orange-brown, never on the ground or under car doors.
- No giraffes, and no hero animals from known media.
- Nothing from any existing game or film: no names, characters, logos, locations, signage, story beats, iconic scenes or music signatures (no sparse acoustic-guitar motifs). "Overgrown abandoned city" is a genre mood and nothing more.
- All signage keeps the invented brands (`DECOR_BRANDS`) and the reviewed `NEON_SIGN_WORDS`. No new word or brand without review. 出口 and 薬局 never appear on live signs or the Neon vista.

**Why readability improves.**
- Today's tall hazards are ink-dark primitives, which the owner calls "weird random shapes". A car, a bin or a vending machine is recognised in one glance, and its size says what to do: low and full-width means ollie, car-sized means steer around.
- The grind signature becomes the story ("the only polished thing"), so it pops even more. With chrome removed from every car, the cream-chrome coping is the only thin bright line on screen.
- The value code does not change: ink = steer around, cream-chrome = grind, amber chevrons = ollie. Nature lives in the mid values outside the corridor (in Neon, in the dark values, because Neon's code is inverted).
- The headline "overgrown" signal costs zero clutter: leafy shadow stripes across the clean street (§4 `shadow_caster`).

---

## 2. What does NOT change / what changes

**Unchanged (contract):**
- Sim, controls and gesture grammar, tricks, scoring, combos, coins, XP and economy.
- Generator rules, templates and schedule in Phase A. The validator, bots and fairness rules.
- Every PropKind's footprint, height class, interaction code, top type, solids and crash-face insets. Edge names and grind materials. The x-ray cap above 1.6 m.
- Mover telegraphs as DESIGN §10.3 defines them: `crosswalk_car` signal light, `backout_car` reverse lights, `forklift` amber beacon, `holo_gate` ≤ 2 Hz pulse.
- Camera solver and constraints, HUD layout.
- Palette presets and blends (§18.1 tables) and the lighting rig (§18.2). `COLORS` and `HAZARD` bodies.
- Contrast gate thresholds (hazard ≥ 2.5:1, Neon target 3:1; grind edge ≥ 1.8:1). Occlusion rules (§18.4). TECH §8.4 budgets.
- Area ids, gateway ids, PropKind ids, cosmetic ids, save keys, analytics names. Music.

**Changes:**
- Kit materials and some kit geometry (vehicles, dressing).
- Render-side overgrowth on existing decor. New decor kinds and params. Decal atlas cells, faded and dead sign variants.
- Ambient VFX (critters, drips).
- Ambience beds. Crash-cause nouns, tagline, store text, loading and empty-state lines, the Title diorama.
- Phase B (T8): new kind `van_across`, `parked_car` in Neon, one parked-row template per area.

**The dressing rules (apply to every kit; T1 adds `kits/dress.ts` helpers that enforce and account for them):**
1. **Footprint rule.** In plan view (x, s), dressing on an obstacle stays inside its collision footprint, with at most 0.05 m of overhang (mirrors included).
2. **Height rule.**
   - On Bump, Low and landable (T) tops, nothing rises above the top surface: moss is a colour there, not geometry. Planter beds are a flat flower carpet at rim level −0.02 m.
   - On Tall props, foliage rises at most +0.05 m above the top (flat ink-green crown caps, roof moss is colour only). Animals (cat loaf, resting gull) rise at most +0.22 m.
   - Exception: an **isolated** column filler (no other solid within 1.0 m in x or s, computed by the chunk builder from its prop list) may grow a sapling, 1 in 4 of them: trunk rooted at the far (up-screen) edge of the lid, crown radius ≤ 0.35 m, top ≤ +0.6 m, ink-green. The lid stays visible from the portrait camera. Gate-row fillers never get a sapling.
3. **Top-face rule.** Flowers on a top face only on landable or grindable planters (`planter`, `planter_tree`, `cherry_planter` beds), or on scenery. Crash objects carry foliage only on their side faces, in ink-green. The one bloom accent on a crash object is the SB picket roses, on fence faces only. Water in a pit or fountain carries no blooms.
4. **Value rule.**
   - Moss and rust on a hazard face are luminance-matched (±10% relative luminance) to the face they cover (tokens in §5).
   - Hazard foliage bodies stay at L ≤ 0.05 (≥ 2.5:1 against asphalt): ink-green `#1B2B22` (L 0.021) by default, `#2A4232` (L 0.046) only for lit-side highlights.
   - Decor foliage in Downtown, Suburbs and Docks stays at L ≥ 0.10, so "dark = hazard" never leaks into the scenery.
   - Decor foliage in Neon is dark, ≤ 1.3:1 against wet asphalt `#352F55` (night leaf `#2E4A48`, night moss `#284440`), because Neon hazards are the mid values.
5. **Signature rule.** Nothing non-grindable is cream, near-white or chrome, or carries the glint. Vehicles have no chrome at all (bumpers ink `#2B2140`, hubs `#3A3448`, no bright window or door trim). Animals near any grind edge are no lighter than `#A6A3A8`. No foliage, weed decal, crack or root comes within 0.3 m of a grind edge, and grind rims stay straight.
6. **Life-accent budget.** On any hazard, flowers, the cat, lanterns and the area accent stripe together cover ≤ 10% of its top-view silhouette. This matches palette.ts "accents 8–12%". `dress.ts` accumulates the projected top-view area of every `life` dressing per prop, and a kit unit test checks it per variant.
7. **Clean core.** The riding surface at |x| ≤ 3.6 gets only the existing decal kinds: cracks, patches, organic puddles and faded paint. The edge band 3.6 ≤ |x| ≤ 4.5 may carry flat weed and moss decals at ≤ 1.3:1 against the surface. 3D vegetation only grows at |x| ≥ 4.6.
8. **No flicker on hazards.** Hazard emissives are steady. The only time-varying hazard lights are the existing telegraphs (§2 list). Decor flickers nowhere either: lights switch on and stay on.
9. **Machines are clean.** Movers (`crosswalk_car`, `backout_car`, `forklift`, `delivery_robot`) carry no moss, rust or plants. They share one "helper machine" motif: a small rounded sensor dome on top and a two-tone band in `HAZARD[area].accent2`, inside the life budget.
10. **Parked, not fled.** Every vehicle is axis-aligned and parked: in a bay, at a curb, in a driveway or nosed into a loading entrance. Doors and boots closed, roof racks empty.

---

## 3. Obstacle mapping (every PropKind)

Footprints and classes are as in DESIGN §10.3 and do not change. "Play" codes: O ollie, A avoid, G grind, T landable, K knock, B bump, P pit. **Reuse** means the existing kit geometry with new materials and dressing. **New** means new geometry inside the same box. The noun column feeds the crash copy (§9). Nouns are plain: no "abandoned", "overgrown" or "mossy".

### 3.1 Shared kinds (each re-skinned per area)

| Kind | Play | Reclaimed object (DT / SB / IN / NE) | Geometry | Crash noun |
|---|---|---|---|---|
| `curb` | B, G | Weathered curb, waxed coping. Weeds as flat decals in the edge band only, ≥ 0.3 m from the coping. | Reuse | curb |
| `flatbar` | G, O | Rust-brown rail body and posts, polished cream-chrome top tube | Reuse | rail |
| `bench` | G, T | DT granite with moss in the joints of its faces. SB park bench with ink ivy on the legs. IN pallet bench, sun-greyed. NE stone with wood slats, moss on the faces. Waxed long edges. | Reuse | bench |
| `manual_pad` | T, curb-class edges | Raised concrete slab with moss on its side faces, clean top | Reuse | pad |
| `trash_can` | A | Rusty litter bin, ink ivy on the sides, moss-coloured lid (luminance-matched). Sapling only under the isolated-filler exception (§2 rule 2). | Reuse (+ sapling) | bin |
| `cone` | K | Sun-faded cone with a grass collar at the base | Reuse | cone |
| `barrier_low` | O, full width, chevrons | **DT (both height classes, Roll-out included):** a faded road-works barrier board on two trestles. The chevron board is the solid full-width face; ink ivy on the trestle legs only. **SB:** fallen tree trunk (Ø 0.5, moss-coloured top, sawn ends) with the chevron boards on stakes in front. **IN:** rusty pipe run on blocks, ink seagrass at the blocks. **NE:** holo gate whose light bar still pulses (≤ 2 Hz, unchanged) on its solid chevroned base. Chevrons stay fresh: "the only fresh paint". | DT, IN reuse; SB log new | barrier / log / pipe / holo gate |
| `trench` | P, plank | DT: sunken road seam with ink ferns on the lip faces, under a scaffold plank. SB: overgrown ditch with ink reeds on the lip faces and the culvert slab. IN: quay seam with two steel plates. NE: rain-filled cable trench under a grate plank. Ferns and reeds stay below lip level. The pit floor stays flat `#2F2742` with **no reflection, glint or ripple** in every area, so a pit never looks like a puddle. Plank wood stays `#A9744F`. | Reuse + fern dressing | gap / ditch / gap / trench |
| `stairs`, `terrace` | drop | Stone steps with moss on the risers only. Treads clean. | Reuse | steps |
| `handrail` | G | DT brass turned green patina (`#8FA07A` body) with a polished top strip | Reuse | handrail |
| `hubba` | G, T | Moss on the hubba side faces, waxed coping | Reuse | hubba |
| `incline` | ride | Same, with flat root-crack decals at the edges (≥ 0.3 m from any edge it shares with a grind) | Reuse | ramp |
| `filler` | A | As `trash_can` (or its area filler skin) | Reuse | bin |

### 3.2 Area kinds

| Kind (area) | Play | Reclaimed object | Geometry | Crash noun |
|---|---|---|---|---|
| `granite_ledge` DT | G, T | Granite ledge with moss in the face joints, ivy trailing down its end faces, a clean top band beside the waxed coping | Reuse | ledge |
| `planter` DT | G, T | Planter with a flat wildflower carpet at rim level (pink, lilac, cornflower; poppies only if the planter sits at \|x\| ≥ 4.6) | Reuse | planter |
| `planter_tree` DT | G, A trunk | A fig or plane tree that outgrew its planter: thicker-looking bark on the same 0.3 Ø trunk box, a fuller crown inside today's crown envelope. Rims straight, roots ≥ 0.3 m inside the rim. | Reuse | tree |
| `fountain` DT | G rim, P water | Water stays blue `#4F6A8F`. Flat lily pads (`#4A6E45`) cover ≤ 30% of the basin, in the corners, ≥ 0.3 m from the rim, no blooms. Rim waxed. | Reuse + lily decals | fountain |
| `bollard_row` DT | A | Bollards with ink ivy spirals and moss-coloured caps | Reuse | bollard |
| `kiosk` DT | A | Shuttered news kiosk with a tree growing up through its awning: trunk visible on the side, a flat ink-green `#1B2B22` crown cap ≤ +0.05 m, inside the footprint | Reuse + crown cap | kiosk |
| `parked_car` DT/SB | A | **Parked car**: sedan, estate, pickup (ink shrubs below the bed rim) or small SUV (§3.3) | **New** vehicle builder | car / pickup |
| `crosswalk_car` DT (M5 mover) | A, M | Self-driving street sweeper still on its rounds, brushes turning, clean. Keeps the existing crosswalk signal light. | New (builder) | street sweeper |
| `bike_rack` DT | A | 50%: rusty bikes with ink vines through the wheels. 50%: a row of nested shopping carts in ink, ink vines on the sides, nothing in the baskets. No silver wire. | Reuse / new cart | bike rack / carts |
| `cafe_set` DT | A | Café table under a faded umbrella (not torn), with an ink-green potted plant under it | Reuse | café table |
| `news_box` DT | A | Faded newspaper box, moss-coloured top, ink ivy up the post | Reuse | news box |
| `garden_wall` SB | G, T | Low brick wall with moss in the joints and ivy on its faces, waxed coping | Reuse | wall |
| `hedge` SB | A | Crisp box-clipped hedge on a 0.25 m brick base, ink-green body. The box silhouette stays sharp: a shaggy hedge reads soft enough to ride through. | Reuse | hedge |
| `picket_fence` SB | A | Ink-dark weathered pickets with climbing roses (`#E98BA6`) on the fence faces only. Picket tops clean. Never white. | Reuse | fence |
| `mailbox` SB | A | Rusty mailbox, flap open with a bird's nest inside, ink ivy up the post | Reuse | mailbox |
| `wheelie_bins` SB | A | 50%: a bin pair with ink ferns at the base and moss-coloured lids. 50%: a compact dumpster, lid closed, ink shrub growing up its side. | Reuse / new dumpster | bins / dumpster |
| `parked_van` SB | A | **Parked van**: panel van (faded livery from `DECOR_BRANDS.suburbs`) or camper van (curtains drawn, nothing in the windows) | **New** builder | van |
| `porch_steps` SB | drop, G rail | Porch steps with moss on the risers, a patina rail with a waxed top | Reuse | porch rail |
| `yard_table` SB | A | Potting bench with terracotta pots (nothing above the pot rims) and ink trailing plants down the side faces | New dressing | potting bench |
| `crate_stack` SB | O, T | Weathered crates with grass at the base only | Reuse | crates |
| `speed_hump` SB | B | Faded hump, grass in its edge cracks as decals | Reuse | hump |
| `hoop_pole` SB | A | Hoop with the net gone and ink ivy up the pole. A sparrow on the rim (≤ +0.22 m). | Reuse | hoop pole |
| `bus_shelter` SB | A | Shelter with a tree through its roof (flat ink-green crown cap ≤ +0.05 m, inside the footprint), a faded poster from `DECOR_BRANDS.suburbs`, every pane in place (dusty glass) | Reuse + crown cap | bus shelter |
| `backout_car` SB (M5 mover) | A, M | A self-parking car still doing its evening re-park, clean. Keeps the existing reverse lights; adds a soft reversing chirp (§8). | Builder | reversing car |
| `container` IN | A | 60% rusty container with ink vines down the doors. 25% box truck in faded Brindle Freight livery. 15% staff shuttle bus in Saltwick Shipping livery. | Reuse / **new** builder | container / truck / bus |
| `pallet_1/2/3` IN | B / O, T | Sun-greyed pallets. Grass between the slats stays below the top surface. | Reuse | pallet |
| `pallet_tall` IN | A | Pallet stack in faded wrap, ink fern at the base | Reuse | pallet stack |
| `ibeam` IN | G | Rusty beam with a polished top flange | Reuse | beam |
| `loading_dock` IN | L1, G edge | Concrete dock with moss on its face, rubber bumpers, waxed steel edge | Reuse | dock |
| `drum_cluster` IN | A | Rusty drums on a skid, moss-coloured lids (luminance-matched), ink morning-glory vines on the sides, no flowers | Reuse | drums |
| `spool_standing` IN | A | Cable spool wrapped in ink vines | Reuse | spool |
| `spool_lying` IN | O | Spool on its side with grass at its base | Reuse | spool |
| `mooring_bollard` IN | A | Bollard with a frayed rope and a resting grey-backed gull (lightest tone `#A6A3A8`, ≤ +0.22 m) | Reuse + gull | bollard |
| `dock_lip` IN | G (signature) | Waxed coping. Seaweed and barnacles (`#A89F94`) only on the water face, ≥ 0.3 m below the lip. | Reuse | dock edge |
| `rail_track` IN | B | Rust-brown rails with a dull steel top (no sheen, never the signature), grass between as decals | Reuse | rails |
| `forklift` IN (M5 mover) | A, M | Autonomous forklift still shuffling pallets, clean, no plants. Keeps its amber beacon. | Reuse | forklift |
| `guard_rail` NE | G | Keeps its cyan body glow and cream edge. Night-leaf vines on the posts (inside the post boxes). | Reuse | guard rail |
| `vending_bank` NE | A | Machines still glowing, **steady**. Moss-coloured tops (`#669E70` on top `#9489C8`), vines up the sides (`#54825C` on body `#7A6FB0`). | Reuse | vending machine |
| `viaduct_pillar` NE | A | Pillar with ivy (luminance-matched `#54825C` on `#7A6FB0`) | Reuse | pillar |
| `holo_gate` NE | O | See `barrier_low` | Reuse | holo gate |
| `cherry_planter` NE | G rims, A trunk | Old cherry, crown inside today's envelope. Rims straight, roots ≥ 0.3 m inside the rim. | Reuse | cherry tree |
| `food_cart` NE | A | Yatai with a faded noren; its paper lantern glows steady | Reuse | food cart |
| `bike_row` NE | A | Rusty bikes laced with vines | Reuse | bikes |
| `skywalk` NE | L1, T, G | Deck clean, planters outside the deck edges, moss on the side faces, nothing hanging below | Reuse | skywalk |
| `a_frame_sign` NE | K | Faded menu board | Reuse | sign |
| `lantern_stand` NE | A | Faded paper lantern, faintly and steadily lit | Reuse | lantern |
| `neon_curb` NE | B, G | Same glow strip (it is gameplay) | Reuse | curb |
| `delivery_robot` NE (M5 mover) | A, M | Delivery robot still delivering, clean. Its screen shows a parcel pictogram: no eyes, no face, no emoticon. No plants anywhere on it. | Reuse | delivery robot |

Neon hazards keep the inverted mid-value body and the emissive accent rim (§18.4). In the story they are the night-owl lights.

### 3.3 Vehicle builder (`kits/car.ts` → `drawVehicle`)

- **Bodies:**

  | Body | Fits | Notes |
  |---|---|---|
  | `sedan` | parked_car, backout_car | 3-box |
  | `estate` | parked_car | 2-box, stretched to the box |
  | `pickup` | parked_car | Open bed with ink shrubs below the bed rim |
  | `suv` | parked_car, h ≥ 1.5 | |
  | `taxi` | decor; Phase B `parked_car` in Neon | Cabin lowered so the roof sign fits inside h; roof sign a plain shape, no text |
  | `kei_van` | Phase B `van_across` in Neon | Compact delivery van |
  | `panel_van` | parked_van, Phase B `van_across` | |
  | `camper` | parked_van | |
  | `box_truck` | container | |
  | `shuttle_bus` | container | |
  | `sweeper` | crosswalk_car | |

- **Fit:** every body is stretched to fill its box (L, W ±0.1 m) and never leaves "air" inside the hitbox. Long axis along s, axis-aligned, no yaw. 70% show the rear to the camera, 30% are nosed in.
- **Plan-view signature (the portrait camera mostly sees the roof):**
  - The roof and bonnet carry the paint top colour (below). Windscreen and rear glass are dark `#262438` (L 0.020, 3.6:1 against asphalt, about 2:1 against the paint tops), framing the lighter roof front and back.
  - One sky-reflection streak `#6A6890` per pane, ≤ 10% of the pane.
  - Four tyre nubs show at the box corners: the body sides are inset 0.05 m between the wheel arches.
  - Mirrors inside the 0.05 m overhang.
  - One accent stripe (0.10 m) along bonnet and roof in `HAZARD[area].accent` (DT `#D9765A`, SB `#8FB8DE`); Docks uses `accent2` `#B5552F` so no amber runs along s; Neon uses its emissive rim instead.
- **Shared low-poly parts:** 8-sided wheel and hub; low tyre (bottom flattened 0.04 m, body lowered 0.03 m); bumpers; light clusters; mirrors; wheel arches; empty roof rack (estate); bed (pickup). **No chrome:** bumpers ink `#2B2140`, hubs `#3A3448`, no bright window or door trim. Static vehicles are unlit: taillights matte deep red `#6A2A2A`, no emissive. Mover telegraphs keep their existing lights.
- **Paint (hazards; body ink, the top face is the paint):**

  | Paint | Top hex | L | Roof moss (luminance-matched) |
  |---|---|---|---|
  | teal | `#2E6062` | 0.098 | `#485F37` |
  | oxblood | `#7A3A48` | 0.076 | `#3F5431` |
  | olive | `#55603A` | 0.106 | `#485F37` |
  | slate | `#575B76` | 0.108 | `#485F37` |

  Body and side faces stay the ink family (`HAZARD.body` `#170F24`, `CAR_BODIES`), with ink rust `#3A1E14` on sills and arches. Top L stays in 0.075–0.11; the pixel gate measures the result. Movers use slate and keep the helper-machine motif.
- **Wear:**
  - Roof moss ≤ 20% of the roof and bonnet, as edge patches on the rear half of the roof and the bonnet corners only, never on glass. The roof rectangle always survives.
  - Weeds under the car inside the footprint; ink ivy up one wheel arch (side face).
  - Rust drip decal only on side panels, orange-brown `#B5552F` family, never below the door line.
  - No wear on movers.
- **Cats** (loaf ≤ 0.22 m, tail flick only; never in Neon, never on movers): 1 in 8 sedans and estates. In-corridor hazard cars get the grey tabby (`#6E6A70` with `#8A8690` stripes); decor cars get the ginger (`#C8743A`). On a crash into a car with a cat, the cat only twitches an ear. It is never knocked off.
- **Variant choice** (deterministic, shared): `core/skins.ts: propSkin(kind, area, id, variant, h)` returns the body, paint and dressing flags. Kits and `ui/format.ts` both call it, so the crash noun always matches what was drawn. The isolated-filler flag (§2 rule 2) is passed separately by the chunk builder and never changes the noun.
- **Budgets:** sedan, estate, pickup, taxi ≤ 700 triangles; vans ≤ 800; truck and bus ≤ 1,000 (§18.5 cap 1,500).

### 3.4 Phase B (T8, same release): cars as the main blocker

A content change in the generator. Rules, validator and the footprints of existing kinds do not change. It runs after the Phase A gates (T7a), so Phase A's identical-obstacle-hash check stays clean. The owner build and store shots wait for it.
1. **New Tall kind `van_across`**: a delivery van nosed into a side loading entrance, its tail out into the street. 1.8 L (s) × 4.4 W (x) × 1.4 H, A, `crash` top, all areas. Skins: DT/SB `panel_van` (livery from `DECOR_BRANDS[area]`), IN `panel_van` in Brindle Freight livery, NE `kei_van` (inverted body plus rim). The generator always emits, at the same s, a faded perpendicular-bay decal (`parking_bay` with new param `perp` 1) under it and a loading entrance (`end_wall` style `loading`: a roller door) on the side band it faces. The A2 wander wall becomes `van_across` plus one 0.6 m filler (6 m total, same ≥ 3 m wander), with the filler-row version kept as the fallback.
2. **Parked rows.** Allow `parked_car` in Neon (taxi skin, no cats) and add one parked-row template per area: `DT_PARKED_ROW` (bays along one curb), `SB_DRIVEWAY_ROW`, `IN_LOADING_ROW` (box trucks at docks), `NE_TAXI_RANK`. Cars sit in painted bays along one side only, parallel to s, ≥ 0.6 m apart, all facing the same way. Never two rows facing each other, never a row in the centre lanes.
3. **Targets.** Car share by count of tall blockers: DT/SB ≥ 35%, IN ≥ 20% (trucks), NE ≥ 15% (taxis and kei vans). Every DT run shows a car within its first 150 m after the Roll-out.
4. **Gates.** Full bot suite, new golden obstacle hashes (Phase B only), DESIGN §10.3/§10.4 rows, crash copy for the new nouns.

---

## 4. Decor mapping (every `DECOR_KINDS` entry)

Default: every existing kind keeps its zone, areas and params. Overgrowth is render-side, derived from a hash of (s, x) when its new params are absent, so T1 and T2 ship with zero generator or hash change. Façade ivy is an atlas texture plus vertex tint; 3D leaves only on edge drapes.

**Portrait priority.** Portrait sees roofs, sidewalk tops and the street, and façades mostly edge-on. Budget goes first to: leafy `shadow_caster` stripes across the street (the headline signal), roof gardens and rooftop trees, moss on awning tops, and the 1–2 m sidewalk band beyond |x| ≥ 4.6. Façade ivy is secondary (angled camera, end walls).

| Kinds | Reclaimed version (new optional params) |
|---|---|
| `building`, `house`, `warehouse`, `tower` | Faded façades. Roofs: moss and grass, roof gardens, 1 in 6 carries a tree. Ivy by area: DT on end walls only; SB on house walls 25–45%; IN vines down warehouse ribs plus rust streaks; NE moss on tower ledges only. Windows: 15% "sun-catch" panes `#F2C38A` (unlit sun reflection, hash-fixed per building) on DT and SB façades; every other unlit pane uses the preset's sky tint (30% fog colour into glass), never black. Houses get roof moss, a meadow yard and 1 in 5 a tree through the porch roof. Towers stand upright, no vine curtains; solar panels on Neon roofs (angled camera). Params: `ivy` 0..1, `roofGreen` 0..1, `fade` 0..1, `roofTree` 0/1. |
| `shadow_caster` | Adds leafy crown and plain water-tower silhouettes (`shape` values), so leaf shadows stripe the clean street in every area |
| `container_stack`, `crane` | Rust, faded paint, vines. Cranes: a tree on the cab, a heron's nest on the boom (`nest` 0/1), swifts. |
| `end_wall` | Shutters down, ivy, a faded brand from `DECOR_BRANDS[area]`, a tree in the side street, a car parked at the side-street curb. Neon: 1 in 4 shows one lit 営業中 or 喫茶 sign. New `style` values: `vista` (§6), `loading` (Phase B). |
| `water`, `city_glow` | Harbor water: floating leaves and kelp strands ≥ 1 m from the lip, no lilies (lilies are the fountain's). City glow: Neon ×0.85. |
| `chain_link`, `bridge_truss` | Morning glory and ivy woven in, rust |
| `tunnel` | Ferns at the portals, moss in tile joints, drips; the sodium strips stay on |
| `street_lamp`, `utility_pole`, `sign_post` | Ivy spirals and a vine hanging from the arm (side band only). Solar caps on lamp heads. Lamps lit: DT 0%, SB 20%, IN 40%, NE 60%, switched on and steady. New `vine` 0..1 and `lit` values. |
| `tree`, `cherry_tree`, `hedge_round` | Fuller, wilder crowns inside the current crown and trunk ranges. New species 3 (plane) and 4 (fig, DT), 5 (birch, SB). Cherry crowns ×1.2 only at \|x\| ≥ 6. Decor hedges may go shaggy, with flowering buddleia (lilac `#B79AD8`). |
| `fence_run`, `low_wall` | Pickets weathered grey `#8E98A0` (2.78:1 against cream, never white), climbing roses, moss caps |
| `awning`, `banner`, `cafe_umbrella` | Faded (never torn), moss on awning tops, a vine along the frame. New `tree` 0/1: a tree grows up through the awning, trunk and crown at \|x\| ≥ 4.6. |
| `blade_sign`, `billboard`, `holo_billboard` | **Neon:** at \|x\| < 6, 40% of blade signs and holo billboards are not emitted; of all that remain, 70% are live (`live` 1), the rest are dead tubes `#4A4470` with nothing hanging. Holo billboards keep the 0.2 Hz hue drift and lose the rare 50 ms flicker. **Other areas:** faded art; billboards faded brand art over grey board `#9A938C`, peel ≤ 0.3 at the corners only (`peel` 0..0.3). |
| `vending_machine`, `food_cart`, `paper_lantern` | The night-owl lights: steady glow, moss-coloured tops, vines |
| `hydrant`, `parking_meter`, `mailbox_post`, `bin_pair`, `hoop` | Rust, ivy, a bird or flowers on top (scenery, so flowers are fine) |
| `bike_parked`, `potted_plant` | Bikes overgrown. Pots burst with plants spilling 0.3 m over the rim. |
| `traffic_light`, `crossing_signal`, `gate_arm` | Traffic lights dark, a bird's nest in one hood per signal. Crossing lamps dark. Gate arms up, with vines. |
| `sprinkler` | Kept rare: one sprinkler still ticking (SB, 10%) |
| `parked_car_side` | Uses `drawVehicle` in sun-faded mid-value paints, never ink: dusty teal `#6F9A94`, faded brick `#B07A66`, bleached sky `#9DB4C8`, sage `#9AAE8A`, dusty lilac `#A898B8`. No chrome. Areas gain `docks`. Params: `body`, `age`, `cat` (ginger, not Neon). Neon: taxis, ≤ 1 per chunk, at \|x\| ≥ 5, roof sign unlit and textless, current decor paints. |
| `pallet_pile`, `drum_pile` | Sun-greyed, grass, flowers in drums (scenery) |
| `lantern_string` | Kept every 48 m; bulbs only at \|x\| ≥ 4.6, 60% lit (`litRatio`), steady; vines on the anchor ends only |
| `overhead_wire` | Bare dark wire over the corridor. Vines and perched birds only beyond \|x\| ≥ 4.6 (`vines` 0..1). |
| `maglev_beam`, `maglev_train` | Beams: moss on the top faces only, nothing hangs. Train: a lit carriage glides past every 40 s (was 20) with a softer whoosh. |
| `crosswalk`, `lane_dash`, `parking_bay`, `road_arrow` | Paint faded (alpha ×0.7); grass in the zebra joints only at \|x\| ≥ 3.6. `parking_bay` gains `perp` 0/1 (Phase B). |
| `crack`, `patch`, `drain`, `manhole`, `oil_stain` | Unchanged inside the clean core. Oil stains ×0.5 frequency. Drains get moss rims. |
| `puddle` | Frequency ×1.0 (unchanged), outlines always organic (never rectangular); floating leaves only at \|x\| ≥ 3.6; Neon puddles reflect only live signs and show drip ripples |
| `leaf_scatter`, `petal_scatter` | Leaves in every area, mixing green `#A8C66C` and russet `#B86A3E`, never gold; petals as now |
| `driveway`, `park_path`, `verge` | Cracked driveways with a grass strip; Greenway meadow path; verges become meadow (`#A9B865` SB, `#8FA85A` elsewhere, seagrass `#7E9A5A` IN) with `wild_grass` beyond 4.6 |
| `steam_vent` | Becomes low after-rain mist from drains (Neon, rate ×0.5) |
| `petal_emitter`, `leaf_emitter` | As now; leaves allowed in every area at rate 3 |

**New decor kinds** (core change through `docs/core-requests.md`). None is overhead. No new kind places anything opaque over the corridor; every overhead element stays thin, with its lowest point at ≥ 3.2 m.

| Kind | Zone, areas | Params | Rules |
|---|---|---|---|
| `weed_edge` | ground, ANY | `len`, `side` ±1, `density` 0..1, `flowers` 0..1 | Flat decal strip at 3.6 ≤ \|x\| ≤ 4.5 and along building bases. ≤ 1.3:1 against the surface. ≥ 0.3 m from grind edges. Flowers only at \|x\| ≥ 4.6. |
| `moss_patch` | ground, ANY | `r` 0.3–1.5, `tint` | Sidewalk, plaza, apron or roofs only, at \|x\| ≥ 3.6 |
| `root_lift` | ground, DT/SB/NE | `len`, `side` | Flat root and slab-crack decal at \|x\| ≥ 3.6; **no geometry** (it must never read as a bump) |
| `wild_grass` | side, ANY | `count` 3–12, `h` 0.3–0.9, `flowers` 0..1, `hue` | Solid blade triangles with sway, at \|x\| ≥ 4.6 |
| `shrub_wild` | side, ANY | `r` 0.4–1.2, `h`, `bloom` 0..1 | Fern clumps and buddleia, at \|x\| ≥ 4.6 |
| `sapling` | side, ANY | `h` 1–3 | Young tree out of a sidewalk crack, at \|x\| ≥ 4.6 |
| `cart_planter` | side, DT/SB | `bloom` | Rust `#7A3B26` shopping cart full of wildflowers (scenery) |
| `perched_birds` | side (wire-attached), ANY | `x0`, `x1` (both ≥ 4.6 in \|x\|), `count` 2–6, `species` (0 sparrow, 1 pigeon, 2 grey-backed gull) | Lightest tone `#A6A3A8`. They flutter off outward when the skater passes beneath, or when a trick lands within 6 m (VFX only). |
| `wildlife` | backdrop, all | `species` (0 deer: DT/SB only, 1 fox, 2 grey heron, 3 cat: not Neon), `pose` | At \|x\| ≥ 6 or in a cross street. At most one per area visit, one animal, idle only. |
| `critter_emitter` | ambient, ANY | `species` (0 butterflies lilac `#B79AD8` or sky blue `#9DB4C8`, 1 dandelion seeds warm grey `#A39A8E` at ≤ 35% alpha, 2 moths at live signs, Neon only, 3 dragonflies, SB/IN) | Side bands only (\|x\| ≥ 4.6), never in the HUD band or the top third of the screen. Never yellow, gold or white. No firefly species, ever. Butterflies also lift off on a nearby trick landing. |
| `drips` | ambient, neon/underpass | `rate`, `len` | "It just rained": drips from awning and sign edges in the side bands, ripple rings on puddles. No falling rain. Off with "Reduce effects". |
| `vista` | backdrop, per area | `which` 0–3 | §6. One per visit, at a cross street, camera-facing. (Not called "landmark", which is the existing Landmark XP bonus.) |

**Neon occlusion and clutter (owner complaint).** Neon is net-negative in objects near the corridor:
- No new overhead kinds, no hanging vines over the corridor, no vine curtains on towers, no falling rain.
- At |x| < 6: 40% fewer blade signs and holo billboards; decor cherry crowns unchanged in size; decor taxis only at |x| ≥ 5, ≤ 1 per chunk.
- Glow cards capped at 24 per chunk (was 40).
- Acceptance (T3 unit test, 50 seeds): mean decor instance count at |x| < 6 per Neon chunk is ≤ 90% of today's.

Neon stays distinct because 70% of the remaining signs are live, windows are lit at 0.35, and the city glow keeps ×0.85.

---

## 5. Palette and lighting

**Presets, blends, sun, hemisphere, fog, exposure, ground colours, `COLORS`, `HAZARD` bodies and UI colours are unchanged.** Add one token table, `RECLAIM`, in `world/render/palette.ts` (and its mirror in `gfx/palette.ts` if the Title uses it). Luminance values are relative luminance (sRGB).

| Token | Hex | Use |
|---|---|---|
| ivy deep / ivy light | `#3F6B3A` / `#6E9A4A` | Decor façades, posts (DT/SB/IN L ≥ 0.10: deep only in small patches) |
| moss / moss light | `#5E7A3A` / `#7A8F45` | Decor stone, roofs, ledge faces |
| new leaf / russet leaf | `#A8C66C` / `#B86A3E` | Crowns, saplings, leaf scatter |
| meadow / meadow SB / dry grass / seagrass | `#8FA85A` / `#A9B865` / `#C9B67A` / `#7E9A5A` | Verges, lawns, docks apron |
| wildflowers | pink `#E98BA6`, lilac `#B79AD8`, cornflower and morning glory `#7FA3E0`, poppy `#E0674F` (\|x\| ≥ 4.6 only) | Never yellow-gold (coins), never white (grind) |
| cherry | `#FFB7D0` / `#F59BBE` | Neon blossom (existing) |
| rust / rust deep / rust light | `#B5552F` / `#7A3B26` / `#D07A48` | Decor metal, carts, rust drips (never crimson) |
| patina | `#5E8C6A`, rail body `#8FA07A` | Brass, copper, cranes |
| faded paint | mix 25% toward `#CDB8A3`, −20% saturation | Building, awning and sign colours |
| peeled board / barnacle | `#9A938C` / `#A89F94` | Billboards, dock water face |
| pickets | `#8E98A0` | Decor fences (2.78:1 against cream) |
| vehicle glass / sky streak | `#262438` / `#6A6890` | All vehicles; streak ≤ 10% of a pane |
| vehicle bumper / hub | `#2B2140` / `#3A3448` | All vehicles (no chrome) |
| hazard car paint tops | teal `#2E6062`, oxblood `#7A3A48`, olive `#55603A`, slate `#575B76` | L 0.076–0.108 |
| hazard car roof moss | `#485F37` (L 0.098), `#3F5431` (L 0.076, oxblood) | Luminance-matched |
| hazard moss on ink tops | `#435B32` on `#5C4B84`, `#364928` on `#4A3B6B` | Bins, bollards, drums (L ≈ 0.090 / 0.056) |
| hazard foliage | `#1B2B22` (L 0.021), highlight `#2A4232` (L 0.046) | Ivy, ferns, vines, crown caps on hazards |
| hazard ink rust | `#3A1E14` (L 0.019, 3.6:1 against asphalt) | Car sills, bins |
| decor car paints | `#6F9A94`, `#B07A66`, `#9DB4C8`, `#9AAE8A`, `#A898B8` | `parked_car_side` |
| sun-catch pane | `#F2C38A` | 15% of DT/SB windows, unlit |
| Neon standby windows | dim `#FFC27A`, `#C9B8FF` | Never cyan (reserved) |
| dead neon tube | `#4A4470` | Unlit signs (1.39:1 against wet asphalt) |
| Neon night leaf / night moss | `#2E4A48` (1.30:1) / `#284440` (1.18:1) | Neon decor foliage, against wet asphalt `#352F55` |
| Neon hazard moss | `#54825C` on body `#7A6FB0`, `#669E70` on top `#9489C8` | Luminance-matched (L 0.186 / 0.284) |
| Neon inverted vehicle bodies | `#7A6FB0`, sea-glass `#538078`, rose `#9F687A`, steel blue `#5A78A0` | All L ≈ 0.18–0.19, with the emissive rim as today |
| animals | gull and pigeon ≤ `#A6A3A8`, grey tabby `#6E6A70`/`#8A8690`, ginger `#C8743A`, heron `#8A8C94` | Nothing near-white |
| seeds | `#A39A8E` at ≤ 35% alpha | Dandelion seeds |

**Per-area flora and green caps.** Green share is the fraction of pixels in a 390×844 run frame (HUD excluded) with HSV hue 60–178°, S ≥ 0.20, V ≥ 0.10.

| Area | Flora | Green share (target band) |
|---|---|---|
| Downtown (Golden) | Fig and plane trees, poppies `#E0674F` at \|x\| ≥ 4.6, moss in granite joints; ivy on end walls only | 6–15% |
| Suburbs (Late gold) | Meadow lawns, pink and lilac flowers, buddleia, the wildest area | 12–30% |
| Docks (Sunset) | Seagrass `#7E9A5A`, morning glory `#7FA3E0`, rust is the show | 3–10% |
| Neon (Blue hour) | Dark teal night foliage, cherry `#FFB7D0`, the lights are the show | 3–10% |

**Per-area deltas**
- **Downtown.** Façades faded. Awning red `#C4473D` → `#B5625A`. Brass → patina. Window lights 0.20 → 0.04, plus sun-catch panes and sky-tinted glass.
- **Suburbs.** Lawns become meadow `#A9B865` with flower dots. Moss on roofs. Pickets grey. Window lights → 0.04, plus sun-catch panes and sky-tinted glass. 20% of lamps on.
- **Docks.** Rust up and container paints faded. Seagrass on the apron verge. Window lights → 0.06.
- **Neon.**
  - About 70% of the remaining signs live; signage emissive unchanged per live sign.
  - Decor glow cards ≤ 24 per chunk. City glow ×0.85.
  - Window lights 0.60 → 0.35, in dim `#FFC27A` and `#C9B8FF` (no cyan), static per building.
  - Puddles reflect only live signs; pit floors reflect nothing.
  - `neonGlow` and hazard rims unchanged.

**Contrast stays achievable.** The value structure does not move:
- Ink bodies `#170F24` are 4.4:1 flat against asphalt `#7F7890`. Car paint tops L 0.076–0.108 are at or darker than today's `#5C4B84` (L 0.090 → 1.79:1), so the body/top mean stays near today's 2.97:1. Dark glass `#262438` (3.6:1) adds contrast. Neon `#7A6FB0` is 2.8:1 against `#352F55` before the emissive rim (target 3:1, measured).
- Grind edges keep the cream-chrome strip over the ink underline. New neighbours: mossy ledge tops `#8FA77A` (cream 2.5:1), meadow `#A9B865` (cream 2.0:1), dry grass `#C9B67A` (cream 1.9:1), pickets `#8E98A0` (2.78:1), gull `#A6A3A8` (2.36:1). All pass at least one stripe ≥ 1.8:1.
- Chevrons: amber against the SB log bark `#3B2E22` is 7.2:1; the DT barrier keeps its chevron board.
- Unlit static taillights remove a small emissive area, so re-measure.

The pixel gate stays the source of truth on every preset and every blend frame.

---

## 6. The four areas, reclaimed

**Downtown: "the quiet plaza" (Golden).**
- **Portrait:** leaf-shadow stripes across the plaza; roof gardens and rooftop fig trees at the screen edges; moss-topped awnings with trees through them; the fountain with lily pads in its corners; parked cars in the bays, a grey tabby on one roof; pigeons on the lantern-string anchors; poppies in the sidewalk band.
- **Angled camera:** ivy on the cross-street end walls, roof gardens.
- **Vista:** the **Hotel Amberlane fig**, a great fig tree on the hotel's roof terrace, roots draped down its end wall (once per visit).
- **Distinct by:** warm stone, deep fig greens, faded terracotta, low green share.

**Suburbs: "wildflower lanes" (Late gold).**
- **Portrait:** meadow lawns with pink and lilac flowers, crisp hedges, mailboxes with nests, vans and estates on the driveways, the fallen log across the road, sparrows on the 40 m wires (side spans), a deer standing far down a side street, mossy roofs at the edges.
- **Angled camera:** mossy gable roofs, trees through porch roofs.
- **Vista:** a plain water tower (no lettering) wrapped in vines, swifts swooping round it, its long shadow striping the street.
- **Distinct by:** the brightest greens, flowers, open sky light.

**Docks: "the seagrass harbor" (Sunset).**
- **Portrait:** rust-and-vine containers, box trucks and the staff shuttle bus in the channel walls, the waxed dock lip against glinting water, grey-backed gulls on bollards, a grey heron on the apron edge, seagrass verges.
- **Angled camera:** cranes with trees on their cabs, warehouses with rust streaks.
- **Vista:** the **heron crane**, the tallest gantry with a heron's nest on its boom, a V of geese passing.
- **Distinct by:** rust oranges against patina greens and water blue, little green.

**Neon City: "the night-owl lights" (Blue hour).**
- **Portrait:** live blade signs with fewer dead ones near the street, steadily glowing vending fronts, cherry trees in their planters shedding petals, wet tiles just after rain with drip ripples in the puddles, ivy on the viaduct pillars, moths at the live signs, the maglev beams overhead.
- **Angled camera:** solar panels and moss on the slim, upright towers.
- **Vista:** **the open sign**, a big Kumo Mart 24 sign over a cross street, fully lit, with a single 営業中 underneath.
- **Distinct by:** the night, the live colours, the wet street, plainly futuristic (maglev, holo signs). No cats.

Neon shots go to a Japanese-speaking reviewer before release (signage, sensitivity).

---

## 7. Gateways, Roll-out, Title, store frames

- **Greenway (DT → SB).** A meadow path through wild grass with mossy low walls, warm-grey dandelion seeds and leaves blowing, butterflies in the side bands.
- **Level Crossing (SB → IN).** Gate arms up and wrapped in vines, flush rails with grass between the sleepers (decals), chain-link with morning glory, dark crossing lamps, a faded signal box.
- **Harbor Bridge (IN → NE).** Gulls on the truss and the dim city ahead. The reward moment: as you cross, Neon's lights switch on one by one (a city-glow ramp over the 4 s, each light switching on and staying on). The deck and its guard rail are unchanged.
- **Underpass (NE → DT).** Ferns at both portals, moss in the tile joints, drips, the warm sodium strips still on. The sky resets to golden: "a new day".
- **Roll-out (DESIGN §12.3).** Identical geometry, timing and cache. The S-curve, then at 3.5 s the **road-works barrier** (`barrier_low`, 0.35 m, full chevron board on two trestles, ivy on the legs only), then the mossy granite ledge with its waxed coping at 6–9 s. The Lesson Line keeps its prompts.
- **Title diorama** (static; low perspective camera, real sky).
  - Your skater idles on a faded crosswalk next to an estate car with a ginger cat asleep on its roof.
  - Around them: ivy on the lamp post, wild grass along the curb, a tree through a bus-shelter roof.
  - In the distance: a skyline of trees on rooftops, a V of geese, one far-off deer.
  - Butterflies are off with reduced motion.
  - The Locker and Shop reuse this backdrop.
- **Store frames** (captured after T8):
  1. A grind on a gleaming garden wall past wildflower lawns, birds lifting off.
  2. A cat on a car roof in Downtown gold.
  3. The Harbor Bridge as Neon's lights switch on.

---

## 8. Audio

**Stays:** all music (song forms, per-area drums and instruments, tape and vinyl), the feedback bus, buses and gains (ambience 0.25), the speed wind bed, every trick and roll SFX. No theme sting uses a sparse acoustic-guitar motif.

**Ambience** (`audio/mix.config.ts` `AMBIENCE`, `audio/sfx/ambience.ts`). No traffic anywhere. The ambience kind `traffic` becomes `plaza` (internal id; no save impact).

| Area | Bed and events |
|---|---|
| Downtown `plaza` | Wind (pink noise BP 500 Hz, gain 0.05, LFO 0.07 Hz); leaf rustles every 4–10 s (HP 2 kHz, 0.4 s); wood-pigeon coos every 12–30 s (sine pairs 450 → 380 Hz); faint fountain trickle (BP 1.8 kHz, gain 0.02). The pigeon flutters stay. |
| Suburbs `suburb` | Birds every 2–6 s (was 3–9); cricket bed (4.2 kHz with 30 Hz AM, gain 0.015, rising toward late gold); wind in grass (BP 800 Hz); a far-off woodpecker drum (noise-burst train at 16 Hz for 0.5 s, BP 1.2 kHz, wide pan) every 40–90 s; a wind chime in key every 20–45 s. Sprinkler ticks only near a sprinkler decor. |
| Docks `harbor` | Lapping water and gulls stay; the foghorn becomes a buoy bell (FM, ratio 3.5) every 25–50 s; hollow wood knocks from moored boats (pairs, 220 Hz body, 60 ms) every 15–35 s; halyard clinks; an in-key chime every 30–60 s. No metal groans. |
| Neon `city` | Hum of the live signs (gain 0.05 → 0.03); vending buzz stays; after-rain drips every 1–4 s (short sine plinks, in key); maglev every 40–80 s (was 24–45), softer. |
| Gateways | Greenway: meadow wind and bees. Level Crossing: grass wind and an in-key chime from the signal box. Harbor Bridge: gulls, wind. Underpass: drips with a 0.4 s echo. |

**SFX changes.**
- Crash into a vehicle: add a low hollow body-panel thunk (110 Hz tom body, 120 ms) under the existing crash. No glass breaking and no car alarms.
- One new one-shot: bird flutter (noise bursts with 12 Hz AM, 0.35 s), played when `perched_birds` take off.
- `backout_car`: a soft reversing chirp (sine 1.1 kHz, 80 ms, every 0.6 s, gain 0.04, in key) while it moves.
- Cars are steer-around, so no car-roof bump sounds are needed.
- Rail clacks are unchanged.

---

## 9. Copy and naming

**Tagline.**
- Title: **"The city's quiet. The streets are yours."**
- Store subtitle: **"The whole city is your skatepark."** (it says what you do)
- Logline in DESIGN §1: *"Roll through a quiet, overgrown city from golden hour into the neon night."*

**Area names.** Keep Downtown, Suburbs, Docks and Neon City, and keep the ids. Postcard and arrival subtitles: "the quiet plaza", "wildflower lanes", "the seagrass harbor", "the night-owl lights". Gateway names stay. Spelling is "harbor" everywhere.

**Loading and empty-state lines:**
- "Waxing the ledges…"
- "Shooing a cat off the car…"
- "Listening for birds…"
- "Finding the smoothest street…"
- Empty Trick Book: "No tricks yet. The streets are waiting."
- No runs: "The city's all yours."

**Crash causes** (`ui/format.ts`). `kindName(kind)` becomes `kindName(kind, area, skin)`, using the plain nouns in §3 and `propSkin`. Articles ("a"/"an") come from a small helper. The existing " — " separator stays.

| Situation | Line |
|---|---|
| Steer-around | "Clipped a van — steer around it", "Clipped a bin — steer around it", "Clipped a truck — steer around it", "Clipped a vending machine — steer around it" |
| Ollie-over | "Hit the barrier — tap to ollie it", "Hit the log — tap to ollie it", "Hit the holo gate — tap to ollie it" |
| Pit | "Dropped into the gap — ollie it or take the plank" (SB ditch, NE trench) |
| Splash | "Splashed into the fountain" (DT), "Splashed into the harbor" (IN) |

**Copy and store rules.**
- Never name or compare to another game or film in store text, keywords, trailers, screenshots captions or patch notes (App Store guideline 2.3.7, Google Play metadata policy).
- Banned in all player-facing text (a unit test greps the string tables): zombie, apocalypse, post-apocalyptic, outbreak, infected, quarantine, evacuate, survivor, last, remains, abandoned, "nature is healing".
- Never explain why people left.
- "Hoshimachi" and other internal names never reach players: players only see "Neon City".

**Name.**
- **Neither name has been checked.** Before any public build, for whichever name is chosen: trademark search (USPTO, EUIPO, JPO; classes 9, 28, 41), exact and near-match search on the App Store and Google Play, domain, social handles.
- The owner already calls the game "isoskate", so this is a real choice for them.
- Recommendation: **DUSKLANE**, once the checks pass. It fits the golden-to-neon arc, and "an empty lane at dusk" now reads as the theme itself.
- **ISOSKATE** reads as isometric plus isolation, which is clever, and it is the owner's own name. Against it: the portrait camera is not isometric (ψ = 0°) and "iso" is crowded in store search.
- Middle path: DUSKLANE as the title, the quiet carried by the tagline. The owner decides.
- Either way, package and save keys never change.

---

## 10. Cosmetics

No change is needed for v1: every skater, board and helmet fits (Sunflower, Cat Ears, Hard Hat, Paper Lantern, Rust & Rivets, Palm Shadow, Golden Hour especially). The skater is the only person on screen, which is the point.

Optional later items (new ids, no renames):
- Boards: "Bracken" (topo variant), "Wildflower" (polka variant), "Moss Grip" (grip border).
- Helmets: "Bird's Nest" (legendary novelty with a tiny bird), "Ivy Crown".
- A leaf-trail legendary variant, which already exists in the fx notes. No firefly trail.

No military or survivalist gear.

---

## 11. Performance (TECH §8.4)

- **Draw calls:**
  - Vegetation, vehicles and dressing merge into the existing 5 chunk meshes (opaque lit, with the `sway` fx weight). No alpha cards and no `discard` in the opaque pass: leaves are solid low-poly triangles, like today's trees. Façade ivy is atlas texture plus vertex tint, 3D leaves only on edge drapes.
  - Ground weeds, moss and roots go in the existing instanced decal layer.
  - At most +1 draw call: a `critters` InstancedMesh (birds taking off, idle wildlife; capacity 64, no shadows). Add it only if the measured main pass keeps ≥ 3 calls of headroom under 70 (≤ 120 total). Otherwise birds stay static in chunk geometry and butterflies use the particle pool.
- **Triangles:**
  - Vegetation ≤ 2,500 per chunk: grass clump ≤ 24, shrub ≤ 60, sapling ≤ 80, ivy edge drape ≤ 16 per building face.
  - Vehicles ≤ 700 / 800 / 1,000.
  - Chunk ≤ 12k and scene ≤ 120k at `med`.
  - The `low` tier drops `wild_grass`, ivy drapes and critters.
- **Variants:** 11 vehicle bodies × paint × wear, all procedural at write time (kits draw directly into pooled chunk buffers), so variants cost code, not memory.
- **Build time:** chunk build p95 ≤ 4 ms (one chunk per frame), measured by the wa.spec perf and bench. Generation ≤ 3 ms p95: decor emission adds ≤ 0.2 ms.
- **Textures:**
  - Decal atlas: 28 → ≤ 40 of 64 cells (weed edge ×2, moss ×2, root lift, green and russet leaves, flower dots, lily pad, lichen, rust drip, grass joint, ripple, perpendicular bay).
  - Façade atlas: ivy overlay ×2 cells if free, else vertex tint only.
  - Sign atlas: 0 new cells (dead signs use the same art with the emissive mask off; peel is drawn in place).
  - Ground atlas: ≤ 2 cells (mossy slab joints, meadow) if free, else vertex tint.
  - GPU memory stays ≤ 16 MB.
- **Particles:** stay ≤ 300 in total (critters ≤ 30, drips ≤ 40, petals unchanged).
- **Bundle:** ≤ +15 KB gzip for the whole theme (budget 420 KB, now 396 KB).

---

## 12. Implementation plan

| WP | Size | Folder / files | Work | Depends |
|---|---|---|---|---|
| T0 Docs and tokens | S (0.5 d) | `docs/DESIGN.md` §1, §10.3 (skin notes only), §12.3 (Roll-out barrier), §18.1/18.4–18.8, §19.1, §23 row; `world/render/palette.ts` `RECLAIM`; new `core/skins.ts` `propSkin` (core request); `kits/dress.ts` rule helpers and life-area accounting | Spec into the design doc, tokens, skin chooser, dressing helpers | – |
| T1 Vehicles and kits | L (3 d) | `world/render/kits/car.ts` (`drawVehicle`), `shared.ts`, `downtown.ts`, `suburbs.ts`, `docks.ts`, `neon.ts`, `common.ts`; chunk builder isolated-filler flag | Vehicle builder and plan-view signature; every kind in §3 re-skinned under the dressing rules | T0 |
| T2 Render-side overgrowth | L (2.5 d) | `kits/decor.ts`, `kits/buildings.ts`, `textures/decals.ts`, `textures/signs.ts`, `textures/ground.ts`, `layers.ts` | Hash-derived roof green, ivy atlas, sun-catch panes, dead and live signs, faded paint, leafy shadow casters, new decal cells | T0 |
| T5 Audio | S (1 d) | `audio/mix.config.ts`, `audio/sfx/ambience.ts`, `audio/sfx/oneshots.ts` | §8 beds and events, vehicle thunk, bird flutter, reversing chirp | – |
| T3 Decor kinds and emission | M (2 d) | `core/decor.ts` (new kinds and params, via `docs/core-requests.md`), `world/gen/decor.ts`, `gen.config.ts`, `warmup.ts`, `tests/unit/gen/gen.test.ts` | Emit the new kinds, `vista` once per visit, the Neon sign cut and live ratio; split the golden hash into obstacle and decor chains | T2 |
| T4 VFX | S–M (1 d) | `vfx/` | `critter_emitter`, `drips`, bird and butterfly take-off (pass and trick landing), petal and leaf rates | T3 |
| T6 Copy and Title | M (1.5 d) | `ui/format.ts`, `ui/screens/title.ts`, title diorama scene, loading and empty-state strings, store text draft | §9 nouns, tagline, banned-word test, diorama | T1, T2 |
| T7a Phase A review | S (0.5 d) | `scripts/shots.mjs` (+ `--green` mode) | Gates 1–8 below; obstacle hashes identical | T0–T6 |
| T8 Phase B: cars as main blocker | L (3 d) | `core/ids.ts`, `world/gen/props/*`, `templates/*`, `generator.ts`, bots, `ui/format.ts` nouns | §3.4 | owner approval (with this sign-off), T7a |
| T7b Final review and release prep | S (1 d) + external | `scripts/shots.mjs`, store frames | Gates again on Phase B; store frames §7; Japanese-speaking review of Neon shots; name clearance (§9); owner playtest | T8 |

**Order:** T0 → (T1 ∥ T2 ∥ T5) → T3 → T4 → T6 → T7a → T8 → T7b. T1 and T2 ship with zero generator change. About 16 working days plus external reviews.

**Acceptance checks**
1. `npm run typecheck`, `npm run lint`, `npm test`. The kit registry test still finds a kit for every PropKind, and warmup covers every new decor kind. New unit tests:
   - life-accent budget ≤ 10% of top-view silhouette per hazard variant (`dress.ts` accounting);
   - no time-varying emissive on any hazard kit outside the §2 telegraph list;
   - no movers carry moss, rust or plant dressing;
   - banned-word grep over every player-facing string table;
   - Neon decor at |x| < 6 per chunk ≤ 90% of today's mean (50 seeds).
2. **Golden obstacle hashes are bit-identical through T7a** (after T3 splits the test). Only the decor hash is re-baselined, and only in T3. T8 re-baselines the obstacle hash once.
3. `npm run test:bots`: every bot gate passes, with unchanged numbers through T7a (footprints have not moved, so any difference is a bug) and passing numbers after T8.
4. `npm run shots -- --contrast` passes on every preset and every gateway blend frame: hazard ≥ 2.5:1 (Neon ≥ 3:1 target), grind edge ≥ 1.8:1.
5. `npm run shots -- --green`: each area's mean green share (3 seeds × 3 frames, 390×844, HUD excluded) is inside its §5 band.
6. `npm run shots` at 390×844, 390×664 and 1280×800, covering every area, every blend (25/50/75), the Title, Locker and run frames. A reviewer contact sheet confirms:
   - each area is recognisable in portrait, and cars read as cars (roof framed by dark glass, tyres visible);
   - the clean core is free of foliage, and no pit looks like a puddle;
   - nothing bright crosses the look-ahead zone; critters stay in the side bands and out of the top third;
   - the cream coping is the brightest thin line on screen;
   - no flower sits on top of a crash object;
   - no do-not item appears (§1 list).
7. Perf (wa.spec / bench at `med`): main calls ≤ 70, total ≤ 120, triangles ≤ 120k, chunk build p95 ≤ 4 ms, steady-state allocations 0, bundle ≤ 420 KB.
8. `npm run shots -- --audio`: no clipping, no silence. Listening pass: no traffic, no metal groans, calm beds under the music.
9. T7b only: Japanese-speaking reviewer signs off the Neon shots; name checks done for the chosen name; owner playtest: "Do the blockers read as real things? Does it feel peaceful, not sad?"

**Risks and mitigations**

| Risk | Mitigation |
|---|---|
| Looks dreary or sad | Presets untouched; flowers in every area; birds and butterflies; sun-catch panes and dusk lights for warmth; clean helper machines; faded rather than broken; one living moment per area (cat, deer, heron, the open sign). If the owner says "sad", raise flower density and window warmth first. |
| Visual noise hurts reading | Clean-core, footprint, height, top-face and value rules; life budget; Neon net-negative near the corridor; green caps. Gates 1, 5 and 6 check it. |
| Cars read as slabs or blobs | Dark glass framing the roof, ≤ 20% roof moss, tyre nubs, accent stripe; gate 6. |
| Hazard contrast drops (moss, paint tops, unlit taillights) | Luminance-matched moss tokens; paint top L ≤ 0.11; the gate on every frame; if needed, darken paint tops one step. |
| Perf on mid phones | Merged solid foliage, ivy as texture, budgets per chunk, `low` tier drops, a critters layer only with headroom. |
| Cars still feel rare | T8 in the same release, with share targets and a car early in every DT run. |
| Read as a copy of a specific game or a real disaster zone | §1 do-not list; invented brands only; no iconic scenes; Neon plainly futuristic; banned-word test; Japanese-speaking review; never explain why people left. |
| Golden-hash churn hides a generator change | The split hash: obstacles stay identical until T8. |

---

## Revision notes

**Applied (art director):** DT `barrier_low` and the Roll-out are a road-works barrier board on trestles (no chain left anywhere). Dark glass `#262438` with a ≤ 10% sky streak; no chrome on any vehicle. Neon night leaf `#2E4A48` and night moss `#284440`; the L ≥ 0.10 rule limited to DT, SB and IN. No flicker on hazards. Neon net-negative near the corridor (40% fewer signs at |x| < 6, 70% of the rest live, unlit textless taxi signs, cherry ×1.2 only at |x| ≥ 6, no falling rain, "just rained" drips and ripples). Sun-catch panes `#F2C38A`. Neon windows `#FFC27A`/`#C9B8FF`. Traffic lights dark with a nest. Taxi steel blue `#5A78A0`. Green and russet leaves. Paint top colours per car. The 10% life budget. Grey tabby in the corridor, ginger on decor. Crown caps +0.05 m in ink-green. Straight rims with roots ≥ 0.3 m inside. Barnacles ≥ 0.3 m below the lip. Pickets `#8E98A0`. Rust or ink carts. Blue fountain with ≤ 30% lilies. The portrait priority list and shadow stripes as the headline. Per-area flora and green caps. Ivy as atlas plus vertex tint. Butterflies lilac and sky blue. Poppies at |x| ≥ 4.6. "Sinkhole" gone.

**Applied (player):** the top-face rule. Roof moss ≤ 20%, edge patches only, never on glass. Tyre nubs, mirrors and an accent stripe as the plan-view signature. The filler sapling exception (isolated only, 1 in 4, lid visible). Parked cars: `DT_PARKED_ROW`, `van_across` at a loading entrance, the self-parking car, the helper-machine family. Grey-backed gulls and pigeons, warm-grey seeds. Steady vending glow. Phase B in the same release, before the owner build and store shots. Windows 0.35 in Neon and city glow ×0.85 (reframed as "the city runs on sunlight"). Pit floors without reflections, puddles ×1.0, never rectangular. Plain crash nouns and "gap". Critters in the side bands only. Docks and Level Crossing sounds replaced. A crisp hedge on a brick base. Store frames and store subtitle. Birds and butterflies scattering on trick landings. "Polished by your own board". The cat that only twitches an ear. No missing shelter pane, no torn umbrellas or awnings.

**Applied (originality):** the name-search claim removed, with the checks listed and the owner's choice stated. "Last" replaced ("the open sign", "the night-owl lights"). No fireflies and no leaning towers in the do-not list. No plant on the robot (and no plants on any machine). No cats in Neon; pictogram screens only. Copy and store rules, banned words, never explain why people left. "Bracken". The Neon sensitivity list, "rain-filled", 出口 and 薬局 off live and vista signs, the Japanese-speaking review, no Ferris wheel. Disaster words out. Doors and boots closed, empty roof racks, no van mid-lane. Swifts and geese, a woodpecker instead of the dog. Rust drips orange-brown and off the ground. Brand names only from `DECOR_BRANDS` (Saltwick Shipping livery, blank water tower, textless taxi sign); "harbor" throughout. "Hoshimachi" dropped. Internal theme name RECLAIM. `vista` instead of `landmark`. No acoustic-guitar stings. One idle deer, never in Neon. No flickering windows.

**Rejected or changed, and why:**
- **Fireflies (art director #16):** rejected. The originality review rules them out entirely.
- **Flicker on side-band signs (art director #4) and a 0.2 Hz breathe on vending fronts (player #7):** rejected. Nothing flickers anywhere, and the holo gate pulse stays the only pulsing hazard in Neon. The player and the originality review both read flicker as a horror cue.
- **Lighter windscreen bands (player #2):** replaced by the art director's dark glass. A light band would put a mid-value patch on a hazard. Dark glass frames the roof at about 2:1 and keeps "dark = hazard".
- **Roof moss ≤ 35% (art director #2):** tightened to the player's ≤ 20%.
- **Pink blooms on the lily pads (art director #13):** rejected. The water is a crash surface, so the top-face rule applies.
- **About 55% of Neon signs live (player):** I used the art director's 70% of the signs that remain after the near-corridor cut. The player wanted more light, so this goes further.
- **An amber beacon on the self-parking car (player #4):** rejected. It keeps its existing reverse-light telegraph and gains a soft chirp, so no new amber sits on a hazard.
- **"Clipped a mossy van" (originality):** plain nouns instead. They are shorter at 390 px, as the player asked.
- **Seed tint `#D8CFC2` (art director #18):** replaced by `#A39A8E`, because the player rules out near-white near grind edges.
- **Shipping Phase B together with Phase A (player):** applied as the same release, but sequenced after T7a. That way, Phase A's identical-obstacle-hash check still proves the re-skin changed no gameplay.
- **Own additions, following from the critiques:**
  - The decor mustard `#C9A35A` (hue 40°, next to coin gold) became dusty lilac `#A898B8`.
  - Docks car stripes use the rust `accent2`, so no amber line runs along s.
  - Harbor water has no lilies, because those belong to the fountain and salt water does not suit them.
  - Pit floors show no glint in any area.
  - The hazard foliage cap was corrected to L ≤ 0.05, because `#2A4232` measures 0.046.
