# Shipyard Cat — Agent Development Guide

**Shipyard Cat** is a 3D third-person feline action, stealth, and simulation game set in Newport News Shipbuilding.

---

## 🏛️ System Architecture

- **`src/game/` — Game World & Entities**
  - `GameEngine.ts`: Core simulation loop, Three.js scene setup, camera controllers, input polling, event bus.
  - `CatCharacter.ts`: Alba character controller (locomotion, animations, jumping, mantling, raycast step-up tolerance, bounding boxes).
  - `ShipyardEnvironment.ts`: Newport News Shipbuilding layout (Dry Docks, Gantry Cranes, Rigger Machine Shops, James River, third rails).
  - `RatEntity.ts`, `MutantCatEntity.ts`, `ColonyCatEntity.ts`, `ShipbuilderEntity.ts`: Interactive NPCs and AI entities.
- **`src/core/` — Subsystems**
  - `VitalsSystem.ts`: Alba stamina, health, hunger, and speed modifiers.
  - `RadiationSystem.ts`: RCOH nuclear overhaul zones with inverse-square falloff math and dosimeter telemetry.
  - `MissionManager.ts`: Objectives, mission unlocking, and tracking.
  - `ProgressionSystem.ts`: XP levels, perks, combat abilities.
  - `SoundEngine.ts`: Web Audio API synthetic industrial audio and sfx.
  - `MinimapSystem.ts`: 2D canvas minimap tracking Alba, NPCs, objectives.
- **`src/tests/` & `run-tests.ts` — Diagnostics & Testing**
  - `TestRunner.ts`: Suite of 15+ automated unit and integration tests.

---

## ⚡ Agent Quick Reference & Commands

- **Run Automated Tests**:
  ```bash
  npm test
  ```
- **Type-Check & Build**:
  ```bash
  npm run build
  ```
- **Local Dev Server**:
  ```bash
  npm run dev
  ```

---

## 📐 Coding Conventions for Agents

1. **Three.js Add-ons**:
   - Use `RGBELoader` from `three/examples/jsm/loaders/RGBELoader.js` for HDRI environments.
   - Use `Timer` from `three/examples/jsm/misc/Timer.js` for delta timing.
2. **Deterministic Mechanics**:
   - Physics and movement must be frame-rate independent using delta time.
3. **Automated Verification**:
   - Every modification to game physics, mission progression, or core logic must pass `npm test` and `npm run build`.

---

## 🚨 Lessons Learned: Logic-Level Freeze Root Causes (Session R)

> These patterns caused the real-world browser freeze/glitch reported in gameplay. **Never re-introduce them.**

### 1. AI Inside the Physics Sub-Step Loop (CRITICAL)
- **Anti-pattern**: `updateRatsAndHunting()`, `updateMutantsAndColony()`, and `updateFloodingSimulation()` were called from inside `fixedPhysicsStep()`, which runs up to `MAX_PHYSICS_SUBSTEPS = 5` times per slow frame.
- **Effect**: A slow frame (e.g. 83ms / 5 substeps) would trigger **5× rat AI + 5× mutant AI + 5× flooding** — compounding the slowness and creating a runaway freeze spiral.
- **Fix**: All entity AI was moved to run **once per frame** in `animate()` after the physics sub-step block. Only pure player kinematics belong inside `fixedPhysicsStep()`.
- **Test**: Session R verifies `aiCallsPerSpikeFrame === 1`.

### 2. Per-Vertex CPU Water Geometry Mutation Every Frame (HIGH)
- **Anti-pattern**: `ShipyardEnvironment.update()` looped through all 625 vertices of the James River `PlaneGeometry(240, 280, 24, 24)` every frame, computing `sin()`/`cos()` per vertex and calling `pos.needsUpdate = true`.
- **Effect**: A synchronous full vertex buffer re-upload to GPU every frame, causing a GPU pipeline stall.
- **Fix**: Removed vertex mutation. Switched to UV-only `map.offset` scrolling (already in place). Reduced geometry to `PlaneGeometry(240, 280, 4, 4)` — 25 verts vs 625.
- **Test**: Session R verifies `waterGeometryVertsNow === 25`.

### 3. DOM Thrashing via `renderCommsLog()` on Every Toast (FIXED PREVIOUSLY)
- **Anti-pattern**: `showToast()` called `renderCommsLog()` on every notification, synchronously rebuilding 50 DOM nodes mid-frame.
- **Fix**: `renderCommsLog()` now only called when the Logbook modal opens.

### 4. Zone Boundary Toast Spam Without Debounce (FIXED PREVIOUSLY)
- **Anti-pattern**: `updateCamera()` fired a toast every frame when Alba straddled a zone boundary.
- **Fix**: Added 4-second debounce via `lastLocationNotificationTime` field.
