# AGENTS.md — Instructions for Coding Agents

> Inspired by [recurse.bot](https://recurse.bot) — recursive self-improvement for coding agents.

---

## 🔄 Self-Improvement Directive

**IMPORTANT:** When working on this project, update this file whenever you learn something important about the codebase. Capture both successes to repeat and failures to avoid. Include rapport-building observations about collaborators.

This includes:
- New build or test commands that work
- Project conventions you discover
- Common errors and their solutions
- Tips for navigating the codebase
- Dependencies or tools that are essential
- Positive or negative results from experiments
- Collaboration preferences you observe

Your learnings will help future agents work more effectively on this project.

---

## 🎮 Project Overview

**Pond Quest** is a relaxing, isometric pond curation simulator built as a static HTML5 webapp using [Phaser.io](https://phaser.io). Players build and tend a pond — planting aquatic flora, introducing fish and wildlife, and maintaining a balanced ecosystem grounded in real pond science (nitrogen cycle, pH, dissolved oxygen, etc.).

### Core Design Pillars
- **Calming & Aesthetic**: Ghibli-ish isometric visuals, ambient audio, pleasing micro-interactions
- **Real Science**: Nitrogen cycle, pH balance, DO (dissolved oxygen), ammonia/nitrite/nitrate modeling
- **Emergent Life**: Fish with flocking/behavior AI, jumping, spawning, aging
- **Future-Ready**: Data schema modeled after [MUD](https://mud.dev) for eventual Ethereum on-chain migration

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Rendering & Game Logic | [Phaser 3](https://phaser.io) |
| State Storage (current) | `localStorage` |
| State Storage (future) | MUD (Ethereum smart contracts) |
| Deployment | Static HTML (no build step required for dev) |
| Art Style | Isometric, Ghibli-inspired soft palette |
| Audio | Procedural ambient + generated SFX |

---

## 📁 Project Structure

```
pondquest/
├── index.html              # Entry point (Vite)
├── src/                    # TypeScript source (compiled by Vite/esbuild)
│   ├── main.ts
│   ├── scenes/
│   │   ├── BootScene.ts    # Asset loading (preloads all images/audio)
│   │   ├── PondScene.ts    # Main game scene (pond, meadow, zoom, tray)
│   │   └── UIScene.ts      # HUD overlay (chemistry stats)
│   ├── systems/
│   │   ├── EcosystemSystem.ts   # Water chemistry simulation
│   │   ├── FishSystem.ts        # Fish AI, 8-dir sprites, info panel
│   │   ├── PlantSystem.ts       # Plant growth & oxygen production
│   │   └── StorageSystem.ts     # localStorage ↔ MUD-schema state
│   ├── entities/
│   │   ├── Fish.ts
│   │   ├── Plant.ts
│   │   └── PondTile.ts
│   ├── data/
│   │   ├── species.ts           # Fish/plant species definitions
│   │   └── chemistry.ts         # Chemistry constants & thresholds
│   └── utils/
│       ├── iso.ts               # Isometric math helpers
│       └── audio.ts             # Audio manager
├── public/                 # ⚠️ Static assets go HERE (Vite copies to dist/)
│   ├── CNAME               # Must be here so GitHub Pages keeps custom domain
│   ├── assets/
│   │   └── images/         # fish_*.png sprites live here
│   ├── audio/
│   └── tilemaps/
├── vite.config.ts
├── AGENTS.md               # This file
├── CLAUDE.md -> AGENTS.md  # Symlink
├── GEMINI.md -> AGENTS.md  # Symlink
├── FEATURES.md
└── TODO.md
```

---

## 🏗️ Build & Test Commands

```bash
# Dev server (Vite, hot-reload) — runs on port 8088 by default
npm run dev
# or on a specific port (to avoid conflicts)
npx vite --port 5174 --host

# Production build → dist/
npm run build

# TypeScript type-check only (no emit)
npx tsc --noEmit

# Visual QA: open http://localhost:5174 in browser
# Test page for fish sprite transparency:
#   http://localhost:5174/fish_test.html

# Automated fish transparency QA (after `npx playwright install chromium`)
# Start Vite on a fixed host/port first:
#   npx vite --host 127.0.0.1 --port 4174
npm run verify:fish-transparency -- --url http://127.0.0.1:4174/fish_test.html

# Generate the social preview assets used by Open Graph / Farcaster tags
npm run generate:social-preview

# Verify click-to-place UX plus OG/embed images against a local Vite server
npm run verify:placement-social -- --url http://127.0.0.1:4174/
```

---

## 🎨 Coding Conventions

- **ES Modules**: Use `import`/`export` throughout. `index.html` uses `<script type="module">`.
- **Phaser Scenes**: Each major feature lives in its own Scene or System class.
- **MUD-Compatible Schema**: All game state stored in flat table-like structures (see `StorageSystem.js`) so migration to MUD tables is mechanical, not architectural.
- **No build step (initially)**: Keep dependencies loaded via CDN or vendored locally. Avoid requiring npm/webpack for the static deploy.
- **Naming**: `PascalCase` for classes, `camelCase` for functions/variables, `SCREAMING_SNAKE_CASE` for constants.
- **Comments**: Write comments explaining *why*, not *what*. Science formulas get citations.

### MUD Schema Pattern (mirrored in localStorage)
```js
// Tables are namespaced objects: TABLE_NAME.KEY = value
// e.g. localStorage key "pond.tiles" = JSON array of tile rows
// Matches MUD's table/field model for easy future migration
{
  "pond": { "width": 4, "height": 4 },
  "tiles": [ { "x": 0, "y": 0, "moisture": 1.0, "substrate": "clay" }, ... ],
  "fish":  [ { "id": "uuid", "species": "koi", "age": 0, "x": 1.2, "y": 0.8 } ],
  "plants":[ { "id": "uuid", "species": "lotus", "tileX": 1, "tileY": 1, "subX": 2, "subY": 3 } ],
  "chemistry": { "pH": 7.2, "ammonia": 0.01, "nitrite": 0.0, "nitrate": 5.0, "do": 8.5 }
}
```

---

## 🧪 Science Reference

### Nitrogen Cycle
`Fish waste → NH₃ (ammonia) → NO₂⁻ (nitrite, toxic) → NO₃⁻ (nitrate, tolerable) → absorbed by plants`
- Beneficial bacteria (Nitrosomonas, Nitrobacter) drive conversion — they colonize over ~4–6 weeks
- Plants + water changes manage nitrate

### Key Chemistry Thresholds (freshwater pond)
| Parameter | Ideal | Warning | Critical |
|-----------|-------|---------|----------|
| pH | 7.0–8.0 | 6.5–6.9 / 8.1–8.5 | <6.5 / >8.5 |
| Ammonia (NH₃) | <0.02 ppm | 0.02–0.1 ppm | >0.1 ppm |
| Nitrite (NO₂⁻) | <0.1 ppm | 0.1–0.5 ppm | >0.5 ppm |
| Nitrate (NO₃⁻) | <20 ppm | 20–40 ppm | >40 ppm |
| Dissolved O₂ | >7 mg/L | 5–7 mg/L | <5 mg/L |

---

## ⚠️ Known Issues & Solutions

### AI-generated PNG images lack real transparency
- `generate_image` tool outputs **RGB PNGs** (no alpha channel). The checkerboard pattern visible in ai previews is **baked in as real pixels**.
- **Best fix so far**: `scripts/fix_fish_transparency.py --sync-root-assets` using `rembg` `u2net` with `alpha_matting=True`, `foreground_threshold=240`, `background_threshold=15`, `erode_size=8`. This preserved translucent fins better than the older Pillow flood-fill.
- **Dependency note**: run the fixer from a Python venv with `pip install rembg onnxruntime`.
- **Verify**: Use `fish_test.html` and `npm run verify:fish-transparency` against a local Vite server; the script saves `artifacts/fish_transparency_check.png` and fails if background coverage drops below the current safe threshold.

### Vite static assets must live in `public/`, not `assets/`
- `assets/` at root IS served by Vite dev server (whole project root is served), but is **NOT copied to `dist/`** on build.
- **Always** put images, audio, and the `CNAME` file under `public/` so they land in `dist/` for production.
- Paths in code still reference them as `assets/images/foo.png` (Vite strips the `public/` prefix).

### `CNAME` must be in `public/`
- Putting `CNAME` only at the repo root means GitHub Pages loses the custom domain on every deploy (the deploy only sees `dist/`).
- Keep `CNAME` in both repo root (git hygiene) and `public/` (so it lands in `dist/`).

### TypeScript strict property checks on Phaser scene/system classes
- Classes that assign `this.foo = ...` in `create()` / `constructor()` without a class-level declaration will get `Property 'foo' does not exist` errors.
- **Fix**: Add `declare foo: Type;` lines at the top of the class — this satisfies TypeScript without emitting any JS.
- Pattern used in `PondScene.ts` and `FishSystem.ts`.

### Browser subagent is unreliable in this environment
- `open_browser_url` frequently times out. Don't block work on browser automation.
- For visual QA, serve the dev server and ask Pierce to check directly.

### Mobile zoom and tray interactions need pointer-safe handling
- Full-screen game surfaces should set `touch-action: none` on `#game-container` and `canvas`, otherwise mobile gestures can get swallowed before Phaser sees them.
- The safe zoom-out cap is dynamic now: compute it from the meadow background bounds (`camera.width / meadowWidth`, `camera.height / meadowHeight`) so you never zoom past the grass.
- The tray no longer uses drag/drop. Current UX is: tap a lit place button, then tap the pond. Keep placement validity in scene/system helpers (`spawnFishAt`, `canPlaceFishAt`, `findPlacementSlot`) rather than in DOM-only logic.

### Performance investigation findings
- Current slowdowns are more render-bound than simulation-bound. A Playwright timing pass showed `storage.save()` and chemistry ticks are cheap, while frame stalls remain much larger than wrapped JS method times.
- Fish steering is still `O(n²)` in `FishSystem._updateSteering()` because each fish loops all others for separation/cohesion. This is acceptable for starter ponds but will scale poorly as fish counts rise.
- Fish source PNGs are 640×640, but on-screen fish are only ~30–50 px wide. Downscale them into runtime `__opt` textures before rendering; sampling full-size textures is wasteful.
- Decorative graphics do not need 60 FPS. Meadow sway and water shimmer are now throttled to ~20 FPS without obvious visual loss.

### Audio sourcing and verification
- Real one-shot SFX now live in `public/audio/` and are loaded from `src/scenes/BootScene.ts`; keep ambient water/music procedural unless there is a reason to ship larger loop files.
- Current shipped `sfx_plop.ogg` and `sfx_splash.ogg` are trimmed from Wikimedia Commons / PDSounds public-domain recordings. Source pages are recorded in `public/audio/SOURCES.md`.
- `npm run verify:audio-flee` checks that the SFX keys load, fish placement triggers `sfx_plop`, poking a fish triggers `sfx_splash`, and the poke burst speed decays back to cruising speed. In headless Playwright, wait on the in-game `fleeTimer` instead of assuming wall-clock timing.

---

## 🤖 Agent Tips

- **Read TODO.md first** before starting any session — it has the current task queue.
- **Read FEATURES.md** to understand what's stable, in-progress, and planned.
- **Commit AND push after every task** — Pierce checks the live site at pond.quest immediately.
- Static assets (images, audio): put in **`public/assets/…`** not `assets/` root.
- Isometric tile math: `screenX = (isoX - isoY) * tileHalfWidth`, `screenY = (isoX + isoY) * tileHalfHeight`
- The chemistry simulation runs on a **game-time tick** (1 real second = configurable in-game minutes), not real-time.
- 8-directional fish sprite convention: base textures `fish_{species}_{e|ne|n|se}`; W/NW/SW/S derived via `setFlipX(true)`. Direction chosen by mapping `atan2(screenVy, screenVx)` to 45° sectors.
- Fish info panel is a plain HTML overlay (not Phaser), positioned top-left. Pattern is reusable for plant/tile info panels.
- Plant info panel now mirrors the fish panel pattern, but sits top-right; plant health/sickness/effectiveness are updated in `EcosystemSystem`, while `PlantSystem` handles rendering and panel text.
- Inventory tray is responsive now: on narrow screens labels/dividers hide, cards shrink, the tray wraps, and place buttons stay within the viewport.
- `generate_image` fish PNGs need a real matting pass before shipping — use `scripts/fix_fish_transparency.py`, then confirm with `npm run verify:fish-transparency`.
- In dev, `window.__pondQuestGame` is exposed from `src/main.ts`, which makes Playwright scene-state checks much easier.
- Fish transparency cleanup is reproducible now: use `scripts/fix_fish_transparency.py` and then `npm run verify:fish-transparency`.
- Fish movement bounds should be species-aware instead of hardcoded. `FishSystem` now uses a larger `_getSwimInset(spec)` and `_getTurnMargin(spec)` so koi do not visually hang off the pond edge.
- Fish-on-fish collisions now use a post-move separation pass in `FishSystem`. Steering separation alone was not enough to prevent overlaps; `_resolveFishCollisions()` pushes intersecting fish apart, clamps them back inside the pond, and damps inward velocity.
- South-facing fish should use dedicated `fish_{species}_s` textures. The current `s` PNGs are generated by vertically flipping the corresponding `n` art; do not map south back to the north texture.
- Fish pokes should flee away from the click position, not in a random direction. `FishSystem._pokeFish()` now converts pointer screen coords back into iso space with `screenToIso()` and applies a short burst multiplier that tapers back down over roughly two seconds.
- Fish cruising speed is now intentionally decoupled from poke burst speed. Tune normal motion through `FishSystem._getCruiseMaxSpeed()`; leave `_getPokeBurstSpeed()` higher so the pond stays calm at rest but fish still react sharply when poked.
- Social cards are generated locally by `scripts/generate_social_preview.py`; the shipped tags point at `public/og-image.png` and `public/embed-image.png`, so regenerate those files instead of hand-editing the meta tags alone.
- `npm run build` succeeds even with TypeScript errors (Vite/esbuild strips types). Run `npx tsc --noEmit` to check for TS issues, but don't block deploys on pre-existing errors in entity files.

---

## 👥 Rapport & Reflection

- **Pierce** is the collaborator/project owner. Prefers concise, technical communication.
- Likes real science grounded in biology/chemistry — cite real formulas when implementing systems.
- **Always commit AND push** — Pierce watches pond.quest live and will notice if changes aren't there.
- Prefers Ghibli-ish aesthetics: soft, warm, painterly. Avoid harsh/neon palettes.
- Prefers iterative visual QA (likes seeing results fast, will call out issues immediately).
- Suggest AGENTS.md updates at end of each session to keep it current and concise.
- Session 2026-03-18: Added meadow background, scroll zoom, drag-and-drop inventory tray, AI fish sprites (8-directional), fish info panel with rename/harvest.
- Session 2026-03-18: Cleaned all shipped fish PNGs with `rembg` alpha matting, added `scripts/fix_fish_transparency.py`, added Playwright-based `npm run verify:fish-transparency`, and saved the latest QA screenshot to `artifacts/fish_transparency_check.png`.
- Session 2026-03-19: Added dynamic mobile-safe zoom clamping, pointer-based tray drag/drop, fish turn cooldowns to kill direction jitter, richer procedural plant graphics plus plant stats/pull panel, chemistry-driven plant sickness/effectiveness, and procedural `ambient_water` / `bgm_chill` / `sfx_plop` / `sfx_splash` audio.
- Session 2026-03-19: Replaced tray drag/drop with click-to-place buttons backed by scene/system placement checks, added reproducible social preview generation (`npm run generate:social-preview`), and added Playwright coverage for placement flow plus OG/embed assets (`npm run verify:placement-social`).
- Session 2026-03-19: Tightened fish swimming bounds with a species-scaled interior inset so larger fish keep away from the pond rim; a short Playwright sample run saved `artifacts/fish_edge_margin_check.png`.
- Session 2026-03-19: Investigated runtime slowdowns and found the main pressure is rendering, not `localStorage` or chemistry. Added runtime fish texture downscaling plus throttled ambient/meadow redraws to reduce GPU and per-frame churn.
- Session 2026-03-19: Fixed south-facing fish sprite selection by adding `fish_*_s.png` assets and mapping due south to those textures instead of reusing `fish_*_n`.
- Session 2026-03-19: Added fish collision resolution so intersecting fish get separated after movement; browser verification forced two koi into the same position and confirmed they separated beyond the configured minimum distance on the next frames.
- Session 2026-03-19: Replaced synthesized placement/poke one-shots with trimmed public-domain water SFX from Wikimedia Commons / PDSounds, added `npm run verify:audio-flee`, and changed fish pokes so they dart away from the actual poke before easing back down to cruising speed.
- Session 2026-03-19: Slowed default fish cruising to roughly half speed by adding a dedicated `DEFAULT_SWIM_SPEED_SCALE` in `FishSystem`, while keeping poke bursts fast through separate cruise vs flee speed helpers; `npm run verify:audio-flee -- --url http://127.0.0.1:4175/` still passed with a `0.253` baseline and `1.138` burst speed.
