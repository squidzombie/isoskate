# Isoskate: store text and store frames (draft)

Status: **draft** (theme T6). The frames are captured after Phase B (T8), and the T7b final review signs them off,
together with the name checks (THEME §9). Every line follows THEME §9: plain words, nothing about why the city is
empty, no banned words, and no name or comparison of another game or film anywhere: not in the text, the keywords,
the trailer, the screenshot captions or the patch notes (App Store guideline 2.3.7, Google Play metadata policy).

## Text

- **Name:** Isoskate (the owner's choice; the clearance checks of THEME §9 are still open).
- **Subtitle / short description (30 characters):** The whole city is your skatepark.
- **Promotional text:** Roll through a quiet, overgrown city from golden hour into the neon night.
- **Description:**

  > The city's quiet. The streets are yours.
  >
  > Skate one endless street through four places: the quiet plaza of Downtown, the wildflower lanes of the Suburbs,
  > the seagrass harbor of the Docks, and the night-owl lights of Neon City. Steer with your left thumb. Ollie, flip,
  > grind and spin with your right.
  >
  > - Two-thumb controls that are easy to learn: tap to ollie, flick to flip, swipe into a rail to grind.
  > - Ledges and rails shine: they are the only polished things in town. Cars, bins and barriers tell you to steer
  >   around them or jump them.
  > - Chain tricks into combos, bank them, and chase your best score from sunset into the night.
  > - Unlock skaters, boards and helmets as you level up. Every item is cosmetic.
  > - A lo-fi beat that follows you street to street. Plays offline.

- **Keywords (100 characters, no other game's name):** skate,skateboard,skating,endless,runner,tricks,grind,city,lofi,chill,arcade,street
- **What's new (first release):** First release. The streets are yours.

## Frames (THEME §7, captured after T8)

Portrait, phone aspect (capture at 390×844 × 3 = 1170×2532 and scale to each store's sizes), HUD visible, no
debug overlay, no caption that names another game. Each frame gets one short caption at the top.

| # | Frame | Caption | How to stage it (debug API) |
|---|---|---|---|
| 1 | A grind on a gleaming garden wall past wildflower lawns, perched birds lifting off. | "Grind the city." | Suburbs mid-visit (`__skate.start({ seed, startT: 54, god: true })`), step to a `garden_wall` inside 25 m, the trick bot or a scripted input locks a 50-50 at full speed; the frame 0.3 s after `perched_birds` take off. |
| 2 | A cat asleep on a car roof in Downtown gold, the skater rolling past. | "The whole city is your skatepark." | Downtown, a `parked_car` skin with `Dress.Cat` (`core/skins.propSkin`: 1 in 8 sedans and estates) in the side band of the near frame; pick the seed and time by scanning `propSkin` over the generated obstacles. |
| 3 | The Harbor Bridge as Neon's lights switch on, one by one. | "From golden hour into the neon night." | `__skate.previewArea('neon', 0.6)` (the Harbor Bridge blend), real time for the 4 s light-on ramp; the frame at about 70% of the ramp. |

Extra candidates for the gallery (no promise): the Greenway meadow with butterflies (frame 4), a kickflip over a
road-works barrier in the Roll-out (frame 5).

Before upload: the Japanese-speaking review of every Neon frame (THEME T7b), and the do-not list of THEME §1 checked
on every frame (no people, no crashed cars, no fireflies, no flicker, nothing from another game or film).
