# Pond Quest — Features

> Format per [features.md](https://features.md) spec. Stability: `stable` | `in-progress` | `planned`

---

## Features

### Isometric Pond Grid
- **Stability**: in-progress
- **Description**: A 4×4 isometric tile grid representing the pond surface. Each tile contains a 4×4 sub-grid for placing plants and items.
- **Properties**:
  - Grid renders in isometric projection with correct depth sorting
  - Each macro-tile holds up to 16 sub-tile slots
  - Tiles have substrate types (clay, gravel, sand, mud)
- **Test Criteria**:
  - [ ] 4×4 grid renders without overlap or gaps
  - [ ] Clicking a tile selects it and shows sub-tile grid
  - [ ] Depth sorting correct (far tiles render behind near tiles)

### Fish Entities
- **Stability**: in-progress
- **Description**: Fish swim around the pond with organic wander/flocking behavior, react to clicks, and occasionally jump.
- **Properties**:
  - Wander using steering behaviors (seek, flee, flocking/Boids)
  - Click/poke interaction causes flee response
  - Periodic jumping animation with splash particle
  - Species: Koi, Goldfish, Shubunkin (v1)
- **Test Criteria**:
  - [ ] Fish move continuously without leaving pond bounds
  - [ ] Clicking fish triggers visible flee reaction
  - [ ] Jump animation plays ~every 30–120 seconds per fish
  - [ ] Multiple fish flock loosely together

### Plant Entities
- **Stability**: in-progress
- **Description**: Aquatic plants placed in sub-tile slots, producing oxygen and absorbing nitrates.
- **Properties**:
  - Species: Lotus, Cattail, Water Lily, Hornwort (v1)
  - Growth stages: seedling → juvenile → mature → flowering
  - DO production rate scales with plant maturity and light
  - Nitrate absorption scales with root biomass
- **Test Criteria**:
  - [ ] Plants render at correct sub-tile position
  - [ ] Mature plants produce measurable DO in EcosystemSystem
  - [ ] Plants absorb nitrates over time

### Ecosystem Chemistry Simulation
- **Stability**: in-progress
- **Description**: Realistic nitrogen cycle and water chemistry model. Fish produce ammonia; bacteria convert it; plants absorb nitrates.
- **Properties**:
  - Tracks: pH, NH₃ (ammonia), NO₂⁻ (nitrite), NO₃⁻ (nitrate), DO (dissolved oxygen)
  - Fish waste generates ammonia proportional to species/size/count
  - Nitrosomonas bacteria convert NH₃ → NO₂⁻ (colonization lag ~4–6 in-game weeks)
  - Nitrobacter bacteria convert NO₂⁻ → NO₃⁻
  - Plants absorb NO₃⁻; water evaporation concentrates or dilutes levels
  - Poor chemistry triggers fish stress / death over time
- **Test Criteria**:
  - [ ] Adding 5 fish raises NH₃ measurably within 1 in-game day
  - [ ] NH₃ converts to NO₂⁻ then NO₃⁻ over time
  - [ ] Adding plants reduces NO₃⁻ over time
  - [ ] Critical chemistry levels cause fish stress indicator

### Chemistry HUD
- **Stability**: in-progress
- **Description**: Non-intrusive overlay showing live pond chemistry stats with color-coded status.
- **Properties**:
  - Shows: pH, NH₃, NO₂⁻, NO₃⁻, DO
  - Color coding: green (ideal) / amber (warning) / red (critical)
  - Fades to minimal when pond is healthy; appears more prominently when attention needed
- **Test Criteria**:
  - [ ] HUD renders without blocking pond view
  - [ ] Values update in real-time as simulation ticks
  - [ ] Colors change correctly at threshold boundaries

### Ambient Audio
- **Stability**: in-progress
- **Description**: Calming, layered ambient soundscape — water, nature, and subtle pond life.
- **Properties**:
  - Looping: water ripple, wind, frogs, bird calls
  - Fish splash SFX triggered on jump
  - Poke/interact SFX on click
  - Audio respects browser autoplay policies (starts on first interaction)
- **Test Criteria**:
  - [ ] Audio begins after first user interaction
  - [ ] Splash sound plays when fish jumps
  - [ ] No audio clipping or gaps in ambient loop

### State Persistence (localStorage)
- **Stability**: in-progress
- **Description**: All pond state saved to localStorage in MUD-compatible schema for seamless future migration to on-chain storage.
- **Properties**:
  - Schema matches MUD table/field model
  - Auto-saves on meaningful state change (place fish, plant, chemistry tick)
  - Load on page refresh
- **Test Criteria**:
  - [ ] Pond state persists across page refreshes
  - [ ] State JSON matches documented MUD schema
  - [ ] Corrupt/missing state gracefully initializes new pond

### Fish Interaction (Poke)
- **Stability**: planned
- **Description**: Clicking a fish causes it to flee with a ripple animation. Fish have personalities that affect flee distance/speed.
- **Properties**:
  - Ripple particle effect at click point
  - Fish flee vector away from click origin
  - Timid fish flee further; bold fish barely react
- **Test Criteria**:
  - [ ] Ripple renders at correct position
  - [ ] Fish velocity changes immediately on click
  - [ ] Personality trait visible in flee behavior

### Shop / Inventory
- **Stability**: planned
- **Description**: Interface for purchasing fish, plants, and pond items using in-game currency.
- **Properties**:
  - Currency earned by maintaining healthy pond over time
  - Species unlock as player progresses
  - MUD-ready item definitions (future on-chain ownership)
- **Test Criteria**:
  - [ ] Shop opens without disrupting pond view
  - [ ] Purchased fish appear immediately in pond
  - [ ] Balance updates correctly on purchase

### Day / Night Cycle
- **Stability**: planned
- **Description**: Smooth 24-hour in-game lighting cycle affecting visuals and chemistry.
- **Properties**:
  - Photosynthesis (DO production) only during daylight hours
  - Lighting tint shifts from warm dawn → bright day → amber dusk → dark blue night
  - Nocturnal behavior increases at night (some fish more active)
- **Test Criteria**:
  - [ ] Visual tint cycles continuously
  - [ ] DO levels drop at night (no photosynthesis)
  - [ ] Cycle speed configurable in chemistry.json

### MUD / Ethereum Migration
- **Stability**: planned
- **Description**: Replace localStorage with MUD on-chain state; fish and plants become wallet-owned NFT-style entities.
- **Properties**:
  - All tables map 1:1 to MUD World tables
  - Player identity tied to wallet address
  - Fish/plant species data on-chain
- **Test Criteria**:
  - [ ] StorageSystem swappable between localStorage and MUD adapter
  - [ ] Wallet connect flow works in static HTML context
  - [ ] On-chain state reads/writes correctly
