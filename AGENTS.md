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
├── index.html              # Entry point
├── src/
│   ├── main.js             # Phaser game bootstrap
│   ├── scenes/
│   │   ├── BootScene.js    # Asset loading
│   │   ├── PondScene.js    # Main game scene
│   │   └── UIScene.js      # HUD overlay (Phaser parallel scene)
│   ├── systems/
│   │   ├── EcosystemSystem.js   # Water chemistry simulation
│   │   ├── FishSystem.js        # Fish AI & behavior
│   │   ├── PlantSystem.js       # Plant growth & oxygen production
│   │   └── StorageSystem.js     # localStorage ↔ MUD-schema state
│   ├── entities/
│   │   ├── Fish.js
│   │   ├── Plant.js
│   │   └── PondTile.js
│   ├── data/
│   │   ├── species.json         # Fish/plant species definitions
│   │   └── chemistry.json       # Chemistry constants & thresholds
│   └── utils/
│       ├── iso.js               # Isometric math helpers
│       └── audio.js             # Audio manager
├── assets/
│   ├── images/
│   ├── audio/
│   └── tilemaps/
├── AGENTS.md               # This file
├── CLAUDE.md -> AGENTS.md  # Symlink
├── GEMINI.md -> AGENTS.md  # Symlink
├── FEATURES.md
└── TODO.md
```

---

## 🏗️ Build & Test Commands

```bash
# Serve locally (no build step — pure static HTML)
python3 -m http.server 8080
# or
npx serve .

# Lint (if added later)
# npx eslint src/

# No test runner yet — visual QA in browser
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

*(Populate as discovered)*

---

## 🤖 Agent Tips

- **Read TODO.md first** before starting any session — it has the current task queue.
- **Read FEATURES.md** to understand what's stable, in-progress, and planned.
- **Commit after each task** with a descriptive message referencing the TODO item.
- The game uses a **single `index.html`** — Phaser loads from CDN. Don't add a bundler unless the user approves.
- When generating assets, prefer **PNG spritesheets** for Phaser animations.
- Isometric tile math: `screenX = (isoX - isoY) * tileHalfWidth`, `screenY = (isoX + isoY) * tileHalfHeight`
- The chemistry simulation runs on a **game-time tick** (1 real second = configurable in-game minutes), not real-time.

---

## 👥 Rapport & Reflection

- **Pierce** is the collaborator/project owner. Prefers concise, technical communication.
- Likes real science grounded in biology/chemistry — cite real formulas when implementing systems.
- Wants commits after each task — keep commit messages clear and descriptive.
- Prefers Ghibli-ish aesthetics: soft, warm, painterly. Avoid harsh/neon palettes.
- Does not want a build step for now — keep it static/CDN-friendly.
- Suggest AGENTS.md updates at end of each session to keep it current and concise.
