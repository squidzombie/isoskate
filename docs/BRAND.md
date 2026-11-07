# ISOSKATE brand spec: "Earthlight"

**Status: final and binding for implementation.** For UI colours, this spec replaces the line in THEME §5 that says "UI colours are unchanged". The world palette (`RECLAIM`, `COLORS`, `HAZARD`) is not touched.

**Summary.** Keep Bungee and Nunito and the chunky ink-outline system. Recolour everything:
- moon-cream to sea-glass logo letters;
- an Earth-O;
- space-indigo ink;
- moss for "go";
- amber for points;
- translucent night chips for any text that floats over the scene.

---

## 0. Decision

| Direction | Brand judge | Player judge | Notes |
|---|---|---|---|
| A Orbit (Unbounded + Outfit, glass) | 5 | 4 | Best gold/peach/aqua palette. Reads as a calm app; glass pads vanish over the street; blur is costly. |
| B Sticker (Titan One + Nunito) | 6 | 6 | Best small-size punch. Coral/orange is the DUSKLANE colour story the owner rejected. |
| C Field notes (Fraunces + Kalam) | 5 | 4 | Most feeling ("you are here"). Handwriting unreadable at speed; 162 KB. |
| D Ledge (Rubik Mono One + Rubik) | 6 | 6 | Best game-derived colour logic. The two-face logo breaks at small sizes. |
| JE1 Bungee + Earthlight | **8** | – | Colours clearly new. Moss "go". Earth-O. |
| JE2 Bungee + dawn/amber | 7 | – | Drifts back to orange. |
| E Bungee Dawnline | – | **8** | Best readability system. Its logo fill (`#FFF → #FFC23A → #FF9A3C`) is within a hue step of the old DUSKLANE gradient (`#fff2c9 → #ffcf86 → #ff9e6b → #f0663f`). |

**Winner: "Bungee + new colours", built as JE1's colour story plus E's readability rules.**
- **Owner direction.** The owner likes Bungee and disliked the colours. Both judges independently scored a recoloured Bungee/Nunito ink system highest, at 8, so the font stays.
- **Colour story from JE1.** E's warm gold-to-orange logo repeats the colours the owner disliked. JE1's moon-cream to sea-glass letters, Earth-O, indigo ink and moss are new, and they belong to both halves of the game: moonlit Earth in space, and the cool, fresh accent over the warm golden-hour street.
- **Rules from E.** Text on a coloured surface is always ink. I measured both judges' light-text buttons: cream on coral is 2.55:1 and cream on moss is 2.45:1, so both fail. Passive text goes on night chips. Small numerals use Nunito. The logo is sized for 320 px. The pads are colour-keyed. Rarity uses filled bands.

**Grafts.**
- From D: cream panels `#F8F1E4`, and the idea that amber means points.
- From A: the gold, peach and pink legendary gradient.
- From C: "you are here" as an optional later title beat (§3.4).

---

## 1. Name and casing

### 1.1 Rules
- **ISOSKATE** (all caps) only in the logo lockup and in all-caps Bungee display contexts such as the store art and contact-sheet headers.
- **Isoskate** in every sentence, the `<title>`, the meta description, aria-labels, toasts, file names (lowercase), credits and store copy.
- Never use: IsoSkate, ISO Skate, Iso-skate, iSoskate, "ISOSKATE!".
- Never explain the pun (isometric / isolation) in the game or store text. THEME §9 notes that the run camera is not isometric, so do not call the game "isometric" in player-facing text.
- `GAME_NAME = 'Isoskate'`; the logo is drawn from `GAME_NAME.toUpperCase()`.
- `src/core/ids.ts` is a FROZEN CONTRACT. File the one-line change through `docs/core-requests.md`, as that file's header requires.

### 1.2 Change (player-facing)

| Where | New text |
|---|---|
| `src/core/ids.ts:3` | `export const GAME_NAME = 'Isoskate';` |
| `index.html:8` | `<title>Isoskate</title>` |
| `index.html:7` | `<meta name="description" content="Isoskate: roll through a quiet, overgrown city from golden hour into the neon night. A two-thumb endless street-skating game." />` |
| `index.html:6` | `<meta name="theme-color" content="#1B1D3F" />` |
| `src/ui/screens/title.ts:35` (tagline) | `'The city’s quiet. The streets are yours.'` (THEME §9) |
| `src/ui/screens/settings.ts:64` | `'This browser is not letting Isoskate save: progress won’t be saved after you close it. Use Back up to keep a copy.'` |
| `src/ui/screens/settings.ts:154` | `'That code is not an Isoskate backup'` (note the article "an") |
| `src/ui/screens/run.ts:56` | `'Isoskate plays in portrait. Turn your phone upright, then tap Resume.'` |
| `src/ui/screens/results.ts:61` | `'Add Isoskate to your Home Screen: it opens full-screen and keeps your progress safe.'` |
| `src/game/index.ts:12` | `` `This browser is too old for Isoskate (missing …)` `` |
| `src/game/wiring.ts:38` | `'Reset all Isoskate progress on this device?'` |
| `src/ui/screens/settings.ts:104` | No change needed: it uses `GAME_NAME`. Keep "Fonts: Bungee and Nunito (SIL Open Font License)". |
| `src/ui/screens/settings.ts:127,137` | No change needed. The export becomes `isoskate-progress-YYYY-MM-DD.json` and the share title "Isoskate progress". |
| `tests/e2e/ui.spec.ts:462` | Expect `'not an Isoskate backup'`. |
| `scripts/shots.mjs:267` | `ISOSKATE cosmetics · …` (dev contact sheet). |
| `README.md` title and `package.json` `description` | "Isoskate: a mobile-first endless street-skating web game." |
| Web manifest / `apple-mobile-web-app-title` (none today) | When added: `name` and `short_name` "Isoskate", `theme_color` and `background_color` `#1B1D3F`. Icons as in §3.5. |

### 1.3 Keep unchanged (internal; saves must survive)
- `GAME_ID = 'dusklane'` and every key derived from it: `dusklane.save`, `dusklane.save.bak`, `dusklane.analytics`.
- The `'dusklane.save'` read in `src/world/render/view.ts:828`.
- `__dusklane_probe` in `src/save/storage.ts`.
- The debug hook `window.__dusklaneUi` (used by `tests/e2e/ui.spec.ts`).
- `package.json` `"name": "dusklane"` and the lockfile.
- Code comments that mention Dusklane may stay.
- **Import keeps accepting old backups** (`dusklane-progress-*.json`). Validation keys on file content, never on the file name.

### 1.4 Copy (THEME §9)
- Title tagline: "The city's quiet. The streets are yours."
- Store subtitle: "The whole city is your skatepark."
- Loading lines (boot): "Waxing the ledges…", "Listening for birds…", "Finding the smoothest street…".
- Banned in player-facing text: zombie, apocalypse, post-apocalyptic, outbreak, infected, quarantine, evacuate, survivor, last, remains, abandoned, "nature is healing". The existing unit test greps the string tables.
- Add one assertion: no player-facing string contains "Dusklane" or "DUSKLANE".

---

## 2. Fonts (unchanged files, sharper roles)

### 2.1 Packages
Both are already in the repo; add nothing.

| Package | Version | Weights | Subset | File bytes |
|---|---|---|---|---|
| `@fontsource/bungee` (SIL OFL 1.1) | 5.3.0 | 400 | latin | 14,344 |
| `@fontsource/nunito` (SIL OFL 1.1) | 5.3.0 | 700, 800, 900 | latin | 16,228 + 16,520 + 16,676 |

- **Budget:** 63,768 bytes of woff2 in total, 4 files.
- The gate is ≤ 64,000 bytes. A new weight or subset must remove one.
- No latin-ext.
- The latin subset contains `× · … ’ — €` but not `→` (U+2192). Draw arrows as SVG icons, never as text.

### 2.2 `src/fonts/fonts.css`
Keep the four blocks exactly as they are. Only the comment changes.

```css
/* Self-hosted fonts (TECH §1, BRAND §2): woff2 straight from the @fontsource packages, hashed by Vite. No third-party requests.
   Bungee 400: logo, headings, buttons, static display numbers >= 28 px, trick names. Nunito 700/800/900 (tabular-nums): everything else. */
@font-face { font-family: 'Bungee'; font-style: normal; font-weight: 400; font-display: swap;
  src: url('@fontsource/bungee/files/bungee-latin-400-normal.woff2') format('woff2'); }
@font-face { font-family: 'Nunito'; font-style: normal; font-weight: 700; font-display: swap;
  src: url('@fontsource/nunito/files/nunito-latin-700-normal.woff2') format('woff2'); }
@font-face { font-family: 'Nunito'; font-style: normal; font-weight: 800; font-display: swap;
  src: url('@fontsource/nunito/files/nunito-latin-800-normal.woff2') format('woff2'); }
@font-face { font-family: 'Nunito'; font-style: normal; font-weight: 900; font-display: swap;
  src: url('@fontsource/nunito/files/nunito-latin-900-normal.woff2') format('woff2'); }
```

### 2.3 Fallbacks and loading
- Fallbacks are unchanged: `--font-display: Bungee, 'Arial Black', Impact, system-ui;` and `--font-ui: Nunito, ui-rounded, system-ui, sans-serif;`. The same strings appear in `src/ui/fit.ts:27-28`.
- The logo must never flash in Arial Black:
  - The boot screen adds `fonts-pending` to `.logo`, styled `#screens .logo.fonts-pending { visibility: hidden; }`.
  - Remove the class when `document.fonts.load('400 50px Bungee')` resolves, or after 1200 ms, whichever comes first.
  - This is a one-time read at boot, outside the run.

### 2.4 Role rules
| Use | Face | Size floor | Notes |
|---|---|---|---|
| Logo, screen headings (`h1`–`h3`), TAP TO ROLL, button labels, segment and tab labels ≥ 12 px caps, trick names, crash sticker | Bungee 400 | 15 px; segments 12 px only in caps on a solid surface | One line only; `white-space: nowrap`. |
| Every number that ticks or changes: score, distance, coins, prices, LV number, XP, timers | Nunito 900 + `font-variant-numeric: tabular-nums` | 12 px | Bungee's open "4" reads as "Ч" at 17 px, and Bungee figures change width while counting. |
| Static display numbers ≥ 28 px (results headline, crate count) | Bungee allowed | 28 px | |
| UI text, labels, notes, hint chips, card names, the selected item's name | Nunito 800/900 | 11 px; badges 9 px | Card and item names are Nunito 900 (the shop's "Harbor Rust" was wrapping in Bungee 15 px). |

Bungee below 15 px becomes Nunito 900 caps with `letter-spacing: .04em`. The places today are:
- `#screens kbd` (11 px);
- `.title-level .lv` (11 px);
- `.tab-badge`;
- `#hud .hud-trick` (11 px). Update the font string passed to `fit.ts` measuring for this one.
- `#hud .hud-hint` changes to Nunito 900 13 px caps (see §4.4).

The mockups show the run score in Bungee for illustration only. **In the game, the score stays Nunito 900, tabular.**

---

## 3. Logo

### 3.1 Construction
- **Wordmark:** `ISOSKATE` set in Bungee 400 caps on one line.
  - `letter-spacing: .02em`. Never more: Bungee is already wide.
  - Measured width: 5.59 em for the glyphs, plus 0.22 em for the outline, about 5.81 em.
- **Two layers, both `aria-hidden`.** The `h1` carries `aria-label="Isoskate"`.
  1. **Ink layer:** `color: ink; -webkit-text-stroke: .22em ink`. That is 11 px at 50 px, so about 5.5 px shows outside the glyph.
  2. **Fill layer:** absolutely positioned on top. `background: var(--logo-fill)` = `linear-gradient(180deg, #FFFDF6 10%, #E9F6EE 45%, #9BE7DD 92%)` (moon-cream to sea-glass), clipped to the text.
  - A single `paint-order` layer cannot carry a gradient fill: the background paints under the stroke, and the stroke eats half the fill.
- **The Earth-O.** The third letter, the O, is filled with `var(--earth)` = `radial-gradient(circle at 28% 24%, #5DB4C4 0 47%, #FFC870 47% 55%, #FF967A 55% 61%, #2D6E94 61%)`.
  - That is a day sea, one golden-hour band (gold, then peach) and a night ocean.
  - Hard stops give a curved terminator, which reads at 48 px.
  - No four-stop blends, and no straight stripes: those read as a beach ball.
- **Tilt and effects.**
  - `transform: rotate(-3deg)`.
  - `filter: drop-shadow(0 0 .32em rgba(255,200,112,.6)) drop-shadow(0 .12em 0 rgba(27,29,63,.7))`: a golden-hour rim glow (the day/night edge), then a hard ink drop.
  - Both are in em, so they scale. At desktop scale (100 px) there is no dark box behind the glow; this was checked in the render.
- **No paper die-cut border** (a DUSKLANE cue). No letter-by-letter gradient shifts. No extrusion.

### 3.2 Markup
Add a shared helper `src/ui/logo.ts`. Use it from `title.ts:32` and the boot screen in `menus.ts:13`.

```ts
import { h } from './h';
import { GAME_NAME } from '../core/ids';
/** BRAND §3: two stacked layers (ink outline under, moon-to-sea-glass fill over), O = Earth. */
export function logoEl(extra = ''): HTMLElement {
  const word = (layer: string) => {
    const up = GAME_NAME.toUpperCase(), i = up.indexOf('O');
    return h('span', { class: `logo-w ${layer}`, 'aria-hidden': 'true' }, up.slice(0, i), h('span', { class: 'o' }, 'O'), up.slice(i + 1));
  };
  return h('h1', { class: `logo ${extra}`.trim(), 'aria-label': GAME_NAME }, word('logo-ink'), word('logo-fill'));
}
```

```css
/* ── Logo (BRAND §3) ── replaces screens.css:44-48 */
#screens .logo { --logo-size: min(calc(50px * var(--k, 1)), calc(16.6vw - 5.3px));
  position: relative; display: inline-block; margin: 0; font-size: var(--logo-size); line-height: 1; transform: rotate(-3deg);
  filter: drop-shadow(0 0 0.32em var(--glow-gold)) drop-shadow(0 0.12em 0 rgba(27, 29, 63, 0.7)); }
#screens .logo .logo-w { display: block; font-family: var(--font-display); font-weight: 400; letter-spacing: 0.02em; white-space: nowrap; }
#screens .logo .logo-ink { color: var(--ink); -webkit-text-stroke: 0.22em var(--ink); }
#screens .logo .logo-fill { position: absolute; left: 0; top: 0; color: transparent;
  background: var(--logo-fill); -webkit-background-clip: text; background-clip: text; }
#screens .logo .logo-fill .o { background: var(--earth); -webkit-background-clip: text; background-clip: text; }
#screens .boot .logo { --logo-size: min(44px, calc(16.6vw - 5.3px)); }
@media (min-aspect-ratio: 1/1) and (min-width: 900px) { #screens .title .logo { --logo-size: clamp(64px, 7.8vw, 104px); } }
```

The 320 px size formula: `16.6vw − 5.3px` gives 47.8 px at 320, and the bounding box is 21–299 px, inside the 16 px gutters. At 360 px and above it is capped at 50 px × k.

### 3.3 Tagline under the logo
A night chip:

```css
#screens .tagline { font: 900 13.5px var(--font-ui); color: var(--night-text); background: var(--night); border: 2px solid var(--night-rim);
  border-radius: 12px; padding: 6px 12px; transform: rotate(-1.5deg); text-shadow: none; box-shadow: none; max-width: 300px; text-wrap: balance; }
```

On desktop, scale it to `font-size: calc(var(--logo-size) * .27)`.

### 3.4 Placement over the Earth scene
- **Portrait** (`title-390x844`):
  - The hero is centred horizontally. The logo's cap line sits at about 14% of the height: today's `.title-hero { margin-top: 9vh }` under the top bar, so it crosses the Earth's upper limb and atmosphere. In the 390×844 frame the Earth spans y ≈ 78–530.
  - The tagline chip sits 8–12 px below.
  - TAP TO ROLL sits at about 44% of the height, over the Earth's lower half.
  - The floating board stays below, and no UI covers it.
  - The existing top gradient `.title::before` uses ink rgba (§4.5).
- **Desktop or landscape** (≥ 900 px wide, aspect ≥ 1):
  - The hero block's centre x is the Earth's projected centre x. Read it from the title scene if it is exposed; otherwise use 0.42 W, measured on the current 1280×800 frame, where the Earth spans x ≈ 318–770 and y ≈ 16–572.
  - The logo cap line sits at about 0.40 H, so the word crosses the Earth's middle, as in `out/F/desk.png`.
  - The board floats at about 0.75 W. The hero's right edge stays at least 40 px left of the board's bounding box.
- **Boot screen** (`out/F/boot.png`):
  - The section `boot` drops the `paper` class: `#screens .boot { background: var(--space-bg); }`.
  - Logo at 44 px. The boot bar uses track `--cream` with a 3 px ink border and a fill of `--primary` with an inset `--primary-deep` bottom edge.
  - One loading line in Nunito 800 14 px, `--night-text`.
  - `index.html` `html, body { background: #1B1D3F }`, so first paint, boot and title are one continuous space.
  - `#boot-fail` stays paper with ink text.
- **Later (optional, not in v1):** C's "you are here" as a small sun-coloured pulse ring on the city lights. If it is ever lettered, use Bungee ≥ 15 px on a night chip. It belongs to the dive, not the logo.

### 3.5 App icon and favicon (procedural, for the future `scripts/gen-icons.mjs`)
- **App icon:** the board seen from below, rotated 36°, on space indigo with a golden-hour glow rising from the bottom.
  - The deck uses the logo fill (moon-cream to sea-glass) with a 7-unit ink edge and a 6-unit moon rim.
  - Ink axles and paper wheels.
  - The Earth-O roundel sits at the centre, lit from the upper left in screen space.
  - It reads at 48 and 29 px.
- **Favicon:** the Earth-O roundel alone, with an ink ring, on transparency.
- **Outputs:**

| Output | Size | Note |
|---|---|---|
| apple-touch-icon | 180 | |
| Icons | 192 and 512 | |
| Maskable | 512 | `{ maskable: true }`: the art scaled to 0.84, so the board stays inside the 80% safe circle. |
| favicon.png | 32 and 48 | |

- Full-bleed square: the OS applies the corner mask. No text, ever.
- The script can run this file in a Playwright page, as `final/icons/run.cjs` does, so it needs no new dependency.
- Verified renders are in `final/icons/c-*.png`.

```js
// ISOSKATE icon recipe. Pure Canvas 2D. Units: the 180 px master (u = S / 180).
const C = { ink: '#1B1D3F', moon: '#FFFDF6', paper: '#F8F1E4', glassMid: '#E9F6EE', glass: '#9BE7DD', sea: '#5DB4C4', gold: '#FFC870',
  peach: '#FF967A', ocean: '#2D6E94', land: '#7DBE5A', dusk: '#4A3A7A', shadow: 'rgba(27,29,63,0.45)' };
function earth(ctx, cx, cy, d, land) {             // day sea, golden-hour band, night ocean, curved terminator
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.clip();
  const x0 = cx - d / 2 + 0.28 * d, y0 = cy - d / 2 + 0.24 * d, g = ctx.createRadialGradient(x0, y0, 0, x0, y0, Math.hypot(0.72 * d, 0.76 * d));
  [[0, C.sea], [0.47, C.sea], [0.47, C.gold], [0.55, C.gold], [0.55, C.peach], [0.61, C.peach], [0.61, C.ocean], [1, C.ocean]].forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g; ctx.fillRect(cx - d / 2, cy - d / 2, d, d);
  if (land) { ctx.fillStyle = C.land; ctx.beginPath();
    ctx.ellipse(cx - 0.14 * d, cy - 0.08 * d, 0.20 * d, 0.14 * d, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 0.08 * d, cy - 0.28 * d, 0.12 * d, 0.18 * d, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function boardPath(ctx, g) {                       // silhouette in board space: deck 64x156, trucks 92 wide, grown by g
  ctx.beginPath(); ctx.roundRect(-32 - g, -78 - g, 64 + 2 * g, 156 + 2 * g, 32 + g);
  for (const y of [-58, 38]) { ctx.roundRect(-46 - g, y - g, 16 + 2 * g, 20 + 2 * g, 6 + g); ctx.roundRect(30 - g, y - g, 16 + 2 * g, 20 + 2 * g, 6 + g); ctx.rect(-34 - g, y + 6 - g, 68 + 2 * g, 8 + 2 * g); }
}
function drawIcon(ctx, S, { maskable = false } = {}) {
  const u = S / 180, k = maskable ? 0.84 : 1, rot = (36 * Math.PI) / 180;
  ctx.save(); ctx.translate(S / 2, S * 1.18); ctx.scale(1.3 / 0.9, 1);        // = CSS radial-gradient(130% 90% at 50% 118%, ...)
  const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.9 * S);
  [[0, C.gold], [0.22, C.peach], [0.52, C.dusk], [0.88, C.ink], [1, C.ink]].forEach(([o, c]) => bg.addColorStop(o, c));
  ctx.fillStyle = bg; ctx.fillRect(-S, -2 * S, 2 * S, 3 * S); ctx.restore();
  const board = (dy, fn) => { ctx.save(); ctx.translate(S / 2, S / 2 + dy); ctx.rotate(rot); ctx.scale(u * k, u * k); fn(); ctx.restore(); };
  board(7 * u * k, () => { boardPath(ctx, 6); ctx.fillStyle = C.shadow; ctx.fill(); });           // hard drop shadow
  board(0, () => {
    boardPath(ctx, 6); ctx.fillStyle = C.moon; ctx.fill();                                           // 6-unit moon rim
    ctx.beginPath(); ctx.roundRect(-32, -78, 64, 156, 32); ctx.fillStyle = C.ink; ctx.fill();         // 7-unit ink edge
    const dg = ctx.createLinearGradient(0, -71, 0, 71);
    [[0.10, C.moon], [0.45, C.glassMid], [0.92, C.glass]].forEach(([o, c]) => dg.addColorStop(o, c));
    ctx.beginPath(); ctx.roundRect(-25, -71, 50, 142, 25); ctx.fillStyle = dg; ctx.fill();
    for (const y of [-58, 38]) {                                                                      // ink axle, paper wheels
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.roundRect(-34, y + 6, 68, 8, 4); ctx.fill();
      for (const x of [-46, 30]) { ctx.beginPath(); ctx.roundRect(x, y, 16, 20, 6); ctx.fill(); ctx.fillStyle = C.paper;
        ctx.beginPath(); ctx.roundRect(x + 4, y + 4, 8, 12, 3); ctx.fill(); ctx.fillStyle = C.ink; }
    }
  });
  const d = 38 * u * k;                                                                               // Earth, screen space
  ctx.beginPath(); ctx.arc(S / 2, S / 2, d / 2 + 2.5 * u * k, 0, Math.PI * 2); ctx.lineWidth = 5 * u * k; ctx.strokeStyle = C.ink; ctx.stroke();
  earth(ctx, S / 2, S / 2, d, S >= 64);
}
function drawFavicon(ctx, S) {                     // transparent; land only from 48 px
  const w = Math.max(2, 0.08 * S), d = 0.78 * S;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, d / 2 + w / 2, 0, Math.PI * 2); ctx.lineWidth = w; ctx.strokeStyle = C.ink; ctx.stroke();
  earth(ctx, S / 2, S / 2, d, S >= 48);
}
```

### 3.6 Logo rules
- Minimum size: 28 px cap height. Below that, use the favicon roundel.
- Clear space: 0.3 em on every side, glow excluded.
- On light backgrounds (store, press), use the same lockup. The ink outline carries it, so there is no reversed version.
- Never recolour the fill or the O. Never set the wordmark in Nunito. Never add a ring or orbit around the word (a stock space logo).

---

## 4. UI tokens

### 4.1 `src/ui/styles/base.css` `:root`
Replace lines 3–11. The names stay, so the 150 `var(--ink)` and 20 `var(--plum)` uses keep working.

```css
:root {
  /* Earthlight (BRAND §4). Ink and paper live in index.html. */
  --primary: #6fb552; --primary-deep: #4e8e3c; --primary-hi: #8cc970;           /* moss: "go", primary buttons, active tab/segment */
  --sun: #ffc94a; --coin: #ffc94a; --amber: #ffb13b;                              /* coins / combo x5; amber = points, score gains, x10 */
  --lilac: #b79aff; --mint: #9be7dd; --sky: #6ec6f0;                              /* epic + LV badge + focus; sea-glass gift badge + x20; rare + steer */
  --sea: #5db4c4; --ocean: #2d6e94; --ocean-deep: #24668a; --gold: #ffc870; --peach: #ff967a;
  --coral: #e0674f;                                                               /* poppy: crash, warnings, strike lines only */
  --bloom: #ff8fb1;                                                               /* wildflower pink: sale tags only */
  --plum: #5a5680;                                                                /* muted text on light surfaces (6.1:1 on paper) */
  --cream: #e4eee4; --moon: #fffdf6; --leaf: #2f6e2c;                             /* track/inset; cards/highlights; EQUIPPED */
  --night: rgba(27, 29, 63, 0.78); --night-strong: rgba(27, 29, 63, 0.82);
  --night-text: #fff6de; --night-rim: rgba(255, 241, 196, 0.22);
  --r-common: #d9d2c8; --r-rare: #6ec6f0; --r-epic: #b79aff; --r-legendary: #ffc870;
  --r-legendary-grad: linear-gradient(90deg, #ffc870, #ff967a 50%, #ff8fb1);
  --logo-fill: linear-gradient(180deg, #fffdf6 10%, #e9f6ee 45%, #9be7dd 92%);
  --earth: radial-gradient(circle at 28% 24%, #5db4c4 0 47%, #ffc870 47% 55%, #ff967a 55% 61%, #2d6e94 61%);
  --glow-gold: rgba(255, 200, 112, 0.6);
  --font-ui: Nunito, ui-rounded, system-ui, sans-serif;
  --font-display: Bungee, 'Arial Black', Impact, system-ui;
  --shadow: 0 4px 0 var(--ink);
  --shadow-sm: 0 3px 0 var(--ink);
  --menu-bg: linear-gradient(180deg, #fdf3e1 0%, #e6f0e2 52%, #bcdce4 100%);     /* opaque morning haze: cream, sage, sky */
  --space-bg: radial-gradient(120% 70% at 50% 108%, #ffc870 0, #ff967a 14%, #4a3a7a 42%, #1b1d3f 78%);
}
```

In `index.html`'s `<style>`, set `--ink: #1b1d3f; --paper: #f8f1e4;` and `html, body { background: #1b1d3f; }`.

- **Radii (unchanged):**
  - buttons 16–18 px;
  - sheets 20–24 px;
  - cards 14 px;
  - chips and pills 999 px or 14 px;
  - small tags 7–8 px.
- **Outlines:**
  - 3 px ink on everything tappable;
  - 2–2.5 px on tags, badges and the rarity band divider;
  - 2 px `--night-rim` on night chips.
- **Shadows:** hard, ink, never blurred.
  - `--shadow` 4 px;
  - `--shadow-sm` 3 px;
  - primary buttons 5–6 px.
  - The only soft shadows are the logo glow and the TAP TO ROLL golden glow.
- **No `backdrop-filter`** anywhere over the run.

### 4.2 The surface rule (the core of the system)
1. **Tappable:** a solid paper, moon or moss surface, with a 3 px ink outline, a hard ink shadow, and **ink text**.
2. **Passive text over the 3D scene:** tagline, hint chip, combo, pad sub-labels, DIST. Use `--night` with `--night-text`, a 2 px `--night-rim`, and no hard shadow. The worst case is over pure white: 7.4:1.
3. **Text never sits in light colour on a mid-tone fill.**
   - Light-on-colour fails: cream on moss is 2.45:1, white on poppy is 3.37:1.
   - Large display text over the scene is light fill with an ink stroke: the score and pad labels use `paint-order: stroke fill`; the logo uses two layers.

### 4.3 Colour roles
- **Moss = go:**
  - TAP TO ROLL;
  - the primary button;
  - the active tab and active segment;
  - the selected card ring;
  - the XP fill;
  - the boot bar.
- **Amber and sun = reward:**
  - coins (sun);
  - points popups and score gains (amber);
  - the combo tiers.
- **Poppy = bad:** crash, warnings, strike-through lines.
- **Bloom = sale only.**
- **Sky:** rare items and STEER.
- **Lilac:** epic items, the LV badge and the focus ring.
- **Sea-glass:** the gift badge, top-tier combo (x20), and the logo and trick-name fill.

### 4.4 Components
- **Primary button** (`buttons.css:13-14`):
  - `background: linear-gradient(180deg, var(--primary-hi), var(--primary) 60%)`;
  - `color: var(--ink)`;
  - `box-shadow: inset 0 -4px 0 var(--primary-deep), 0 5px 0 var(--ink)`;
  - pressed: `translateY(3px)` with the shadow reduced to 2 px.
  - Ink on moss is 6.5:1, ink on `--primary-hi` 8.3:1.
- **Secondary button:** `--moon` fill, ink text.
- **Danger:** keep `#8a1f2b` text on paper (8.1:1).
- **Disabled:** `--cream` fill, `--plum` text, no shadow.
- **TAP TO ROLL** (`.tap`):
  - Bungee 22–24 px, ink;
  - a moss pill with radius 20, 3 px ink border;
  - `box-shadow: inset 0 -5px 0 var(--primary-deep), inset 0 3px 0 rgba(255,253,246,.35), 0 6px 0 var(--ink), 0 0 28px rgba(255,200,112,.4)`;
  - keep the `dl-pulse`.
  - Also use it for crash/results "ROLL AGAIN".
- **Panels and sheets:**
  - `--paper` with a 3 px ink border and `--shadow`;
  - cards inside are `--moon`;
  - insets and tracks are `--cream`;
  - section labels on paper or `--menu-bg` are Nunito 900 in `--plum`.
- **Chips** (coins, LV):
  - `--paper` with a 3 px ink border, `--shadow-sm` and Nunito 900 16 px tabular;
  - the "LV" label is Nunito 900 11 px in `--ocean-deep` (5.6:1);
  - the LV number is Nunito 900 18 px;
  - XP bar: `--cream` track, `--primary` fill, 2 px ink border.
- **Tabs:** `--paper` with ink icons and labels (Nunito 900 ≥ 9.5 px caps); `.tab.play` and the active tab use `--primary` with ink.
- **Badges:**
  - Nunito 900, at least 9 px;
  - LV badge `--lilac`, gift `--mint`, lock `--cream` with `--plum`;
  - sale `--bloom` with ink text and no text shadow (today `#fff` on coral);
  - all with a 2 px ink border.
- **HUD numerals:**
  - `.hud-score` is Nunito 900 `calc(26px*k)`, tabular, `color: var(--moon)`, with `-webkit-text-stroke: 2px var(--ink); paint-order: stroke fill`;
  - `.hud-dist` is Nunito 800 12 px in `--moon` with a 1 px ink stroke;
  - the band gradient uses the new ink rgba;
  - HUD coins use the coin chip.
  - Fill against stroke is 15.9:1.
- **Combo pill** (`.hud-combo`):
  - `background: var(--night-strong)`, `border: 2px solid var(--night-rim)`, text `--night-text`;
  - tiers: x5 `--sun` (6.0:1), x10 `--amber` (5.1:1), x20 `--mint` sea-glass (6.5:1). Bloom on night is 4.27:1, so it is not used.
  - `.pill-ring` is `--moon`, warn `--coral`.
- **Trick and points popups** (`.hud-popup`):
  - trick names: `color: var(--moon)`, Bungee, `-webkit-text-stroke: 0.24em var(--ink); paint-order: stroke fill`, `text-shadow: 0 2px 0 var(--ink)`;
  - points (`+250`): `color: var(--amber)` with the same stroke;
  - `.bad`: `--coral` with glow `rgba(224,103,79,.6)`.
  - Any large trick moment (the mockup's KICKFLIP!) may use the logo's two-layer construction with `--logo-fill`.
  - Never use a light gradient without the ink stroke behind it.
- **Side labels:** `.hud-trick` and `.hud-float` use `--sun` instead of `#ffe3a3`; `.hud-trick.decayed` uses `--r-common`.
- **Speed stamp:** `--sun` with ink.
- **Area card:** title in Bungee ink (drop the orange gradient on paper); subtitle `--plum`.
- **Hint chip** (`.hud-hint`):
  - night chip (`--night`, `--night-rim`, `--night-text`), no hard shadow;
  - Nunito 900 `calc(13px*k)` caps, `letter-spacing: .04em`;
  - a 16 px `--sky` dot with a `--night-text` ring;
  - kbd keycaps stay `--moon` with ink.
  - Single line at 320 px.
- **Two-thumb pads** (`.zone-pad`, `.rest-mark`):
  - 3 px dashed border, `rgba(27,29,63,.55)`; fill `rgba(248,241,228,.16)`;
  - ring `rgba(248,241,228,.62)` with an inset 5 px bottom underline: `--sky` on STEER, `--amber` on TRICKS;
  - labels in Bungee 15 px `--moon` with a 5 px ink stroke (`paint-order`);
  - sub-labels on a night pill, Nunito 900 11 px.
  - Restyle only: do not change pad sizes or hit areas.
- **Cards and rarity** (shop, locker):
  - `--moon` card, 3 px ink border, `--shadow-sm`;
  - a **filled** rarity band at the top (`--r-*`, ink text Nunito 900 9 px caps, 2.5 px ink divider): common 10.8:1, rare 8.5:1, epic 7.0:1, legendary uses the gradient;
  - name Nunito 900 12 px;
  - price Nunito 900 12.5 px tabular; the old price in `--plum` with a `--coral` strike line;
  - EQUIPPED Nunito 900 10 px in `--leaf` (6.1:1);
  - selected card: `box-shadow: 0 0 0 3px var(--primary), 0 0 0 6px var(--ink)`.
- **Segments:** `--paper`, Bungee 12 px caps; `.on` uses `--primary` with ink text and no text shadow.
- **Crash sticker:** Bungee 52 px in `--coral` with a 0.06 em ink stroke and `paint-order` (ink on poppy is 4.8:1, large text).
- **Menu screens** (crates, stats, settings, rewards): `--menu-bg`.
  - Text placed directly on it is ink (≥ 11.2:1) or `--plum` (≥ 4.7:1 at the lowest stop).
  - The crates footnote that today is white with a text shadow becomes `--plum`.
- **Settings range track:** `--primary`; the settings `.warn` uses `color-mix(in srgb, var(--coral) 22%, var(--moon))` with ink.
- **Focus ring:** 3 px `--lilac`.

### 4.5 Hard-coded colour map
Apply this across `src/ui/styles/*.css` and canvas UI art in `src/ui/art.ts`.

| Old | New |
|---|---|
| `rgba(43, 33, 64, a)` (old ink) | `rgba(27, 29, 63, a)` |
| `rgba(255, 244, 227, a)` and `#fff4e3` (old paper) | `rgba(248, 241, 228, a)` and `var(--paper)` |
| `#ffa47c` (button top) | `var(--primary-hi)` |
| `#ff8a5b` (range track, old primary) | `var(--primary)` |
| `#ffe3a3`, `#ffe6c4`, `#fff1d6` (warm HUD text) | `var(--sun)` for accents; `var(--moon)` or `var(--night-text)` for plain text |
| `#eaf8ef` | `var(--cream)` |
| `#ff8a6c` | `var(--amber)` |
| `#ff6ec0` | `var(--mint)` |
| `#ff7ab6` | `var(--bloom)` |
| `#ffb07a → #ff8a5b → #c4473d` gradients | per §4.4 |
| `#6b4e8c` | `var(--plum)` |

Keep as they are: the cardboard crate `#d9a86a`, the coin art `#fff1b8` / `#c98a1a`, crate-tier art, and `#8a1f2b`.

After the edit, this command must print nothing: `grep -rn -i 'ff8a5b\|e8663a\|ff5e6c\|a88beb\|7ee0b5\|2b2140\|fff4e3\|43, *33, *64\|255, *244, *227\|ffdeba\|ffbe9e\|d696be\|f0663f\|ffcf86' src/ui src/fonts index.html`.

---

## 5. Do / Do not

**Do**
- Keep Bungee and Nunito and the chunky 3 px ink outlines with hard shadows. The game stays a playful arcade.
- Put ink text on every coloured surface. Put passive floating text on night chips.
- Keep moss meaning "go", amber and sun meaning reward, and poppy meaning bad, everywhere.
- Use the Earth-O, with one golden band and a curved terminator, as the only brand mark: logo O, app icon and favicon.
- Use Nunito 900 tabular for every number that changes.
- Check every screen at 320 px, over both the dark title and the bright street.

**Do not**
- No orange-gradient logo, no coral primary, no cream-on-colour buttons. Those are the DUSKLANE colours the owner rejected.
- No paper die-cut sticker border on the logo. No ring or orbit around the word. No glass or blur panels over the run.
- No Bungee under 15 px, no Bungee figures that tick, no handwriting fonts, no new font files.
- No light gradient text without an ink stroke behind it.
- No bloom (pink) text on night: it is 4.27:1.
- No banned THEME §9 words. No "isometric" in store or player copy. No other game or film named.
- Do not touch `GAME_ID`, the storage keys, `__dusklaneUi` or the package name.

---

## 6. Acceptance checks (all must pass)

1. **Name**
   - `grep -rni dusklane src index.html` shows only the internal list in §1.3.
   - The new no-"Dusklane" string assertion passes, and the banned-words test passes.
   - `<title>` is Isoskate; theme-color is `#1B1D3F`.
2. **Saves**
   - A save from the previous build (`dusklane.save` in localStorage) loads with the same level, coins and items.
   - Importing an old `dusklane-progress-*.json` works.
   - Export writes `isoskate-progress-YYYY-MM-DD.json`.
3. **Fonts**
   - `npm run build`: `dist/assets` contains exactly 4 `.woff2` files, 63,768 bytes in total (≤ 64,000).
   - The e2e run makes no request to another origin.
   - The logo never renders in a fallback face: screenshot the boot with fonts throttled.
4. **Contrast** (WCAG relative luminance; measured values for these tokens)
   - **Body text ≥ 4.5:1:**
     - ink on paper 14.5, on moon 15.9, on moss 6.5, on amber 9.0, on sun 10.6, on bloom 7.6, on sky 8.5, on lilac 7.0, on cream 13.6;
     - plum on paper 6.1 and on the `--menu-bg` lowest stop 4.7;
     - ocean-deep on paper 5.6; leaf on moon 6.1;
     - night-text on night (over white) 7.4;
     - combo tiers on night-strong (over white) 5.1–6.5.
   - **Large text and HUD numerals ≥ 3:1:**
     - moon fill against ink stroke 15.9;
     - ink on poppy (crash) 4.8.
   - Sample the HUD in `shots` frames: the score fill and stroke, and the hint and combo chips over the brightest street pixel.
5. **Layout**
   - `npm run shots -- --hud` at 320, 360 and 390 reports zero overlaps and the 56 px band intact.
   - The hint chip is one line at 320.
   - The logo bounding box sits inside the 16 px gutters at 320 (expected 21–299 px).
   - The shop's selected item name is one line (Nunito 900 16 px, ellipsis).
   - No horizontal scroll on any screen at 320.
6. **Readability at 320**
   - Every menu screen in `shots` at 320×568 and 390×844 has no text under 9 px (badges) or 11 px (everything else), and no Bungee under 15 px except segment caps at 12 px.
7. **Visual**
   - `shots` of title (390×844 and 1280×800), boot, run, shop, crash, results and settings match `final-sheet.png`.
   - The logo glow shows no dark box at 1280×800.
   - The Earth-O renders correctly in iOS Safari (nested `background-clip: text`). On a real device, check that the ink layer sits under the fill.
8. **Performance:** HUD restyle adds no `backdrop-filter` and no per-frame layout reads; the existing layout-guard e2e passes.

---

## 7. Files
- The final Earthlight mockups (`final-sheet.png`: title, run HUD, shop, boot, desktop, logo at 320, app icon 180/48, favicon 48/32, swatches), the per-mockup renders, the direction studies and the judges' sheets were made outside the repo and are not checked in; this file is the binding text.
- Implemented in: `src/ui/styles/base.css` (tokens), `src/ui/logo.ts` + `screens.css` (logo), `buttons.css`, `hud.css`, `screens.css`, `overlay.css` (components), `src/ui/art.ts` and `src/ui/popups.ts` (canvas and popup colours), `index.html` (ink, paper, theme-color, first paint).
