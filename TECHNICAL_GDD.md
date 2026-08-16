# SHIPYARD CAT: TECHNICAL GDD & ASSET PRODUCTION PIPELINE
**Author:** Lead Level Designer, Technical Artist & Systems Architect  
**Project:** *Shipyard Cat* — Photorealistic Feline Action/Simulation (Newport News Shipbuilding)  
**Document Version:** 2.0 (Prototype to Final Asset Production)

---

## 1. Executive Summary & Scope

*Shipyard Cat* transitions from a geometric white-box prototype to an atmospheric, photo-realistic simulation set across the working 2.5-mile industrial complex of Newport News Shipbuilding. 

### Visual Paradigm Shift (Referencing Target Visualization)
1. **From Primitives to Photorealism:** Every placeholder box, capsule, and cylinder is replaced by modular, PBR-textured industrial assets (corrugated siding, pitted brick, weathered steel hull plates, cast-iron rail ballast, weathered timber).
2. **Atmospheric Lighting Matrix:** Dramatic warm sodium staging lamps ($2200\text{K}$) intercut with cold industrial mercury vapor/arc-welding light ($6500\text{K}$), low-angle sunset volumetric haze, and airborne dust/slag motes.
3. **Anatomical Feline Fidelity:** Sleek black domestic short-hair with realistic fur anisotropy, anatomical spine flex, and a physical leather collar sporting an active digital LCD dosimeter screen.
4. **Diegetic Industrial UI:** Weathered riveted-brass framed HUD panels synced directly to in-game props (Alba's collar dosimeter, shipyard work orders).

---

## 2. Phase 1: Environmental Asset & Material Conversion Specifications

### 2.1 Building Asset Transformation: "Rigger Division" Machine Shop No. 1

| Component | Prototype State | Final Asset Specification (Target Reference) |
| :--- | :--- | :--- |
| **Primary Facade** | Flat red-tinted box | **Weathered 19th-century red/brown kilned brick**. Multi-layered PBR: Albedo, Roughness (0.75–0.9), Normal map (mortar relief $2.5\text{mm}$ recess), Ambient Occlusion, and salt/efflorescence staining along lower courses. |
| **Signage** | Procedural 2D text | **Cast-iron framed enamel sign** reading `"RIGGER DIVISION"` with chipped off-white enamel, rust streaks dripping from fastener rivets, and individual relief lettering. |
| **Fenestration (Windows)**| None | **$4\times 3$ Industrial multi-pane steel sash windows**. Translucent dirty glass material with interior wire mesh, grime build-up in corners, and condensation roughness maps. |
| **Roof Architecture** | Single flat roof slab | **Corrugated galvanized iron roofing** with rust patina, rain gutters, downspouts, and cylindrical roof ventilation turbine cowls. |
| **Attached Annex** | Simple side cube | **Corrugated vertical sheet-metal lean-to** with heavy denting, oxidized zinc finish, and industrial conduit piping junction boxes. |
| **Electrical / Piping** | None | **External conduit runs & compressor manifolds**: Exposed $2''$–$4''$ steel pipe conduits, pressure gauges with glass faces, exterior floodlight goosenecks, and transformer switchgear. |

---

### 2.2 Industrial Equipment: Heavy Weathered Fuel & Liquid Tank

| Component | Prototype State | Final Asset Specification (Target Reference) |
| :--- | :--- | :--- |
| **Vessel Shell** | Plain red capsule mesh | **Cylindrical riveted pressure vessel ($12\text{ft} \times 5\text{ft}$)**. Heavily oxidized industrial red-orange paint with paint blister peeling, deep rust pitting, seam weld beads, and grease streaks. |
| **Plumbing & Valves** | None | **Cast-iron flange manifold**: $3''$ gate valves with red handwheels, dial pressure gauge ($0\text{–}300\text{ PSI}$) with cracked glass, bleeder petcocks, and curved intake/outlet pipes running into concrete footings. |
| **Decals & Safety Markings** | None | **Sub-surface layered decals**: OSHA `"FLAMMABLE LIQUIDS"` safety diamond, yellow hazard triangle, stencil inspection stamp (`NNS-INSP-84`), and radiation warning badges. |
| **Foundation Cradle** | None | **Dual cast concrete saddle piers**: Pitted concrete with rebar stains and steel tie-down strapping bands. |

---

### 2.3 Ground Terrain: Rail Spur, Ballast & Weathered Concrete

| Layer | Specifications |
| :--- | :--- |
| **Concrete Apron** | High-density PBR concrete: dynamic surface roughness, spiderweb surface cracks, oil drip puddles with rainbow sheen, and embedded tie-down deck cleats. |
| **Industrial Rail Spur** | Dual heavy steel crane/locomotive rails ($136\text{ lb/yd}$) with polished steel running crowns and heavily rusted web/base plates. Wooden creosote cross-ties with forged steel tie plates and spikes. |
| **Ballast & Sand** | Scattered crushed granite track ballast ($1''\text{–}2''$), loose gravel scatter, sandy fill patches, discarded welding rod stubs, bolt head debris, and metallic scrap. |

---

### 2.4 Prop Conversion: Wooden Crates, Pallets & Shipyard Detritus

| Prop Type | Specifications |
| :--- | :--- |
| **Weathered Crates** | Rough-sawn Douglas fir planks, stenciled crate markings (`"NNS PROP - KEEP DRY"`, `"CARRIER FAB DIV"`), rusted steel corner brackets, and wood grain displacement. |
| **Standard Pallets** | $48'' \times 40''$ industrial stringer pallets with broken slat ends, nail pull-outs, and oil staining. |
| **Metal Drums & Gas Cylinders** | $55\text{-gallon}$ steel drums (dented, ribbed, with bung caps), oxygen/acetylene tanks chained in upright storage cages. |
| **Steel Beams & Planking** | Loose I-beams, angle iron racks, scaffold boards, and discarded metal banding wire. |

---

## 3. Phase 2: Core Gameplay Systems & Hazard Implementation

```
                           CORE GAMEPLAY & HAZARD MATRIX
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
[ALBA CONTROLLER]               [ACTIVE YARD HAZARDS]            [RAD CONTAINMENT & HUD]
• Anatomical Spine/Paws         • Third-Rail High Voltage        • Live Dosimeter Telemetry
• Physical LCD Collar           • Gantry Module Lifts (200ft)    • Radiation Screen Static
• Parkour Mantling              • Heavy Mobile Transporters      • Diegetic Brass UI Frames
```

### 3.1 Cat Character Controller (Alba)
* **Visual Specifications:** 
  * Sleek black domestic short-hair ($1.15\text{m}$ normalized scale).
  * High-density anatomical mesh: articulated spine curvature, distinct shoulder scapula blade movement, realistic velvet fur roughness with subtle anisotropic sheen.
  * Thick dark brown leather safety collar with brass buckle, dosimeter capsule tag, and a **miniature digital LCD backlit display** ($64 \times 32\text{px}$) reading live $\text{mSv/hr}$ radiation telemetry.
* **Locomotion & Mechanics:**
  * **Precision Micro-Steering:** Instant zero-recoil heading adjustment; direct linear turning without rotational momentum lag.
  * **Scaffolding Parkour:** Automatic raycast-assisted mantling onto narrow I-beams, stair stringers, gangway ramps, and pipe runs.
  * **Pounce & Combat:** Trajectory-guided leap onto vermin and mutant combatants; claw swipe combos and $360^\circ$ tail sweeps.

### 3.2 Dynamic Hazard Systems
1. **Gantry Crane Third-Rail Electrocution:**
   * Ground-level power rails between tracks carry $480\text{V}$ live feed.
   * Visuals: Blue-white intermittent electrical arcing, scorched rail ties, warning signposts.
   * Gameplay: Stepping on active rail triggers instant damage, screen flash, audio crackle, and knockback.
2. **Active Modular Crane Lifts (200-Foot Vertical Gameplay):**
   * Alba can curl up asleep inside a crane lift basket or prefabricated carrier module in Dry Dock 12.
   * Triggering the shift whistle initiates a modular crane lift: Big Blue's hoist raises the module $200\text{ft}$ in the air across the yard.
   * Dynamic camera transitions from ground third-person to a sweeping aerial panoramic vista of the entire James River waterfront.
3. **Radiological Containment Zones (Nuclear Overhaul):**
   * Submarine & Aircraft Carrier nuclear overhaul staging areas (Vault & Dry Dock 12 keel).
   * **Feedback Loop:**
     * **Audio:** Proportional Geiger counter clicks accelerating to continuous buzz.
     * **Visual FX:** High-ISO monochrome screen noise, chromatic aberration edge distortion, and violet isotope atmospheric haze.
     * **Collar Screen:** Collar LCD screen flashes amber/red with rising dosage rate ($0.05 \to 50.0\text{ mSv/hr}$).

---

## 4. Phase 3: Technical Architecture, Lighting & Pipeline Requirements

### 4.1 Modular Codebase & Engine Architecture
* **Target Engine:** Unreal Engine 5 (C++ & Lumen) or WebGL Three.js Advanced Custom Shaders.
* **Component Architecture:**
  * `CatLocomotionComponent`: Inverse kinematics (IK) paw placement on uneven ballast and stairs.
  * `RadiationSensorComponent`: Spatial falloff calculation with lead shielding occlusion raycasts.
  * `IndustrialHazardManager`: Track power states, heavy equipment pathing, and crush volumes.
  * `DiegeticTelemetryBridge`: Bi-directional event bus linking gameplay metrics to HUD and 3D collar LCD.

### 4.2 Lighting & Atmospheric Pipeline
* **Dual-Color Lighting Contrast:**
  * Primary Ambient: Dusk twilight sky ($4500\text{K}$).
  * Work Lights: High-intensity sodium vapor floodlights ($2200\text{K}$, deep amber) casting sharp shadows on rail beds.
  * Cold Industrial Accents: High-pressure mercury vapor lamps & blue electric arc-welding sparks ($6500\text{K}\text{–}8000\text{K}$).
* **Volumetric Fog & Dust Motes:** Exponential height fog filled with slow-drifting industrial dust, coal soot, and welding slag motes illuminated by spotlight cones.

### 4.3 AI Systems
* **Vermin (Mice & Rats):**
  * Multi-agent flocking and foraging AI along wall skirts and under pallets.
  * Threat detection: Whisker scent radius, line-of-sight flee behavior into wall crevices.
* **Mutant Insurgent Cats:**
  * Patrol waypoints around radiological hot zones.
  * Hostile behavior tree: Stalking, lunging leap attacks, glowing isotope eye lights, and defensive perimeter guarding.

### 4.4 HUD & UI Integration (Image 1 Parity)
* **Diegetic Brass Frame HUD:**
  * Top-Left: **Alba Status Card** (Level, Master Mouser rank, Stamina/Hunger/Health bars) encased in bolted industrial brass framing.
  * Top-Right: **Collar Dosimeter Card** with radioactive icon and digital $\text{mSv/hr}$ readout matching Alba's physical collar in real-time.
  * Top Navigation Bar: Integrated toolbar buttons (`Abilities`, `Logbook`, `Sandbox`, `Lore`, `Tests`).
  * Bottom-Left: **Mission Log Window** with active objective checklists.
  * Bottom-Right: **Action Keybind Action Bar** (`J/Click Paw Swipe`, `K Tail Sweep`, `F Pounce`, `Q Whiskers`, `E Talk/Meow`).
