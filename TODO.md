# TODO — Pond Quest

> Agent Rule: Read this file at the start of every session. Commit after each completed task.

---

## 🔥 Active / In Progress

- [ ] **[INIT-1]** Bootstrap project structure (index.html, src/, assets/, scenes, systems, entities)
- [ ] **[INIT-2]** Create isometric tile renderer with 4×4 pond grid in Phaser 3
- [ ] **[INIT-3]** Wire up StorageSystem for localStorage with MUD-compatible schema
- [ ] **[INIT-4]** Implement basic fish entity with wander/flocking behavior
- [ ] **[INIT-5]** Implement basic plant entity (lotus, cattail) with sub-tile placement
- [ ] **[INIT-6]** EcosystemSystem: nitrogen cycle + pH + DO simulation (medium-full fidelity)
- [ ] **[INIT-7]** UIScene: HUD overlay showing pond chemistry stats
- [ ] **[INIT-8]** Add ambient audio (water, frogs, wind through reeds)
- [ ] **[INIT-9]** Fish interaction: click/poke fish, fish jumping animation
- [ ] **[INIT-10]** Generate and integrate isometric art assets (tiles, fish, plants)

---

## 📋 Backlog

- [ ] **[FEAT-1]** Fish spawning / aging / lifecycle
- [ ] **[FEAT-2]** Plant growth stages (seedling → mature → seeding)
- [ ] **[FEAT-3]** Shop/inventory UI for purchasing fish and plants
- [ ] **[FEAT-4]** Day/night cycle with lighting changes
- [ ] **[FEAT-5]** Seasons affecting chemistry and species behavior
- [ ] **[FEAT-6]** Beneficial bacteria colonization timeline
- [ ] **[FEAT-7]** Pond expansion (beyond initial 4×4)
- [ ] **[FEAT-8]** Wildlife visitors (dragonflies, herons, frogs)
- [ ] **[FEAT-9]** Water clarity / turbidity visual effects
- [ ] **[FEAT-10]** Ripple/splash particle effects
- [ ] **[FEAT-11]** Save/load multiple pond profiles
- [ ] **[FEAT-12]** MUD/Ethereum migration (smart contract state storage)
- [ ] **[FEAT-13]** On-chain item ownership / trading
- [ ] **[UX-2]** Drag fish/plant from pond back to trash zone to remove it (FishSystem/PlantSystem need Phaser drag events wired to trash drop zone)

---

## ✅ Completed

*(Checked tasks move here with completion date)*

- [x] **[SETUP-1]** Initialize git repo with `main` as default branch — 2026-03-18
- [x] **[SETUP-2]** Create AGENTS.md, CLAUDE.md symlink, GEMINI.md symlink — 2026-03-18
- [x] **[SETUP-3]** Create TODO.md and FEATURES.md — 2026-03-18
- [x] **[UX-1]** Meadow field background (grass tufts, wildflowers, trees), scroll-to-zoom (0.35x–2.2x), drag-and-drop inventory tray (spawn fish/plants by dragging onto canvas) — 2026-03-18
