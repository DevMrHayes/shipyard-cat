/**
 * IndustrialExpansion.ts - World Sector Expansion & Carrier Construction Polish
 * ==============================================================================
 * Comprehensive world-engineering and visual upgrade:
 *  - Zone 1: Pipe Fabrication & Cable Spool Depot (Northwest, X: -95 to -45, Z: -95 to -30)
 *  - Zone 2: Plate Bending & Blast Shed (Central-West, X: -95 to -50, Z: -15 to 30)
 *  - Zone 3: Rail Marshaling & Sorting Yard (Southwest, X: -65 to 30, Z: 65 to 100)
 *      * Flush grade-level embedded tracks with steel tie plates (zero cat foot-sinking)
 *      * Detailed rolling-stock flatcars with steel I-beam sills & wheel bogies
 *      * End-of-track hydraulic bumper stops with hazard stripes & red reflectors
 *  - Zone 4: Aircraft Carrier (CVN-80 Enterprise) Modular Superstructure in Dry Dock 12
 *      * Carrier lower hull module block on concrete keel blocks
 *      * Angled flight deck sponson staging with feline parkour catwalks
 */

import * as THREE from 'three';

export interface PlatformSurface {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export class IndustrialExpansion {
  public group: THREE.Group;
  private platforms: PlatformSurface[];

  constructor(platforms: PlatformSurface[]) {
    this.group = new THREE.Group();
    this.group.name = 'INDUSTRIAL_EXPANSION_ZONES';
    this.platforms = platforms;

    this.buildPipeFabAndSpoolDepot();
    this.buildPlateBendingAndBlastShed();
    this.buildRailMarshalingYard();
    this.buildAircraftCarrierModularZone();
  }

  /**
   * ZONE 1: Pipe Fabrication & Cable Spool Depot (X in [-95, -45], Z in [-95, -30])
   */
  private buildPipeFabAndSpoolDepot(): void {
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75, metalness: 0.6 });
    const gratingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85, metalness: 0.7 });
    const cuNiMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.45, metalness: 0.85 }); // Copper-Nickel
    const carbonSteelMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.8 });
    const spoolMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9, metalness: 0.1 });
    const yellowTrim = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 });

    // Three Multi-Tier Pipe Racks
    const rackZPositions = [-80, -60, -40];
    const rackLength = 34;
    const rackTiers = [1.8, 3.6];

    rackZPositions.forEach((zPos, idx) => {
      // Walkable Grated Catwalk Spine on each level
      rackTiers.forEach((yLevel) => {
        const catwalk = new THREE.Mesh(new THREE.BoxGeometry(rackLength, 0.12, 3.6), gratingMat);
        catwalk.position.set(-68, yLevel - 0.06, zPos);
        catwalk.castShadow = true;
        catwalk.receiveShadow = true;
        this.group.add(catwalk);

        // Register platform for cat movement
        this.platforms.push({
          minX: -68 - rackLength / 2,
          maxX: -68 + rackLength / 2,
          minZ: zPos - 1.8,
          maxZ: zPos + 1.8,
          height: yLevel
        });

        // Pipe Bundles (Copper-Nickel and Carbon Steel)
        for (let offsetZ = -1.1; offsetZ <= 1.1; offsetZ += 1.1) {
          const pipeGeo = new THREE.CylinderGeometry(0.32, 0.32, rackLength - 2, 12);
          pipeGeo.rotateZ(Math.PI / 2);
          const pipe = new THREE.Mesh(pipeGeo, offsetZ < 0 ? cuNiMat : carbonSteelMat);
          pipe.position.set(-68, yLevel + 0.35, zPos + offsetZ);
          pipe.castShadow = true;
          this.group.add(pipe);
        }
      });

      // Support Columns
      for (let xCol = -82; xCol <= -54; xCol += 14) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 3.8), yellowTrim);
        col.position.set(xCol, 2.1, zPos);
        this.group.add(col);
      }

      // Incline Ramp for climbing onto Tier 1
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.12, 1.6), gratingMat);
      ramp.position.set(-48, 0.9, zPos);
      ramp.rotation.z = Math.atan2(1.8, 4.5);
      this.group.add(ramp);
      this.platforms.push({
        minX: -51,
        maxX: -45,
        minZ: zPos - 0.8,
        maxZ: zPos + 0.8,
        height: 1.0
      });
    });

    // Giant Marine Wooden Cable Spools
    const spools = [
      { x: -48, z: -70, r: 1.6, h: 1.8 },
      { x: -46, z: -50, r: 2.0, h: 2.4 },
      { x: -88, z: -35, r: 1.8, h: 2.0 }
    ];

    spools.forEach((s) => {
      const spoolGroup = new THREE.Group();
      spoolGroup.position.set(s.x, 0, s.z);

      const flangeGeo = new THREE.CylinderGeometry(s.r, s.r, 0.12, 16);
      const bottomFlange = new THREE.Mesh(flangeGeo, spoolMat);
      bottomFlange.position.y = 0.06;
      const topFlange = new THREE.Mesh(flangeGeo, spoolMat);
      topFlange.position.y = s.h - 0.06;
      const core = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.65, s.r * 0.65, s.h, 14), rackMat);
      core.position.y = s.h / 2;

      spoolGroup.add(bottomFlange, topFlange, core);
      this.group.add(spoolGroup);

      this.platforms.push({
        minX: s.x - s.r,
        maxX: s.x + s.r,
        minZ: s.z - s.r,
        maxZ: s.z + s.r,
        height: s.h
      });
    });
  }

  /**
   * ZONE 2: Plate Bending & Blast Shed (X in [-95, -50], Z in [-15, 30])
   */
  private buildPlateBendingAndBlastShed(): void {
    const steelWallMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7, metalness: 0.5 });
    const hy80PlateMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.85 }); // HY-80 submarine armor plate
    const yellowBeam = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 });

    const shedFrame = new THREE.Group();
    shedFrame.position.set(-72, 0, 8);

    // Gantry Runway Beams Overhead
    const runwayL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 38), yellowBeam);
    runwayL.position.set(-14, 8.5, 0);
    const runwayR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 38), yellowBeam);
    runwayR.position.set(14, 8.5, 0);
    shedFrame.add(runwayL, runwayR);

    // Structural Pillars
    for (let zCol = -16; zCol <= 16; zCol += 16) {
      const colL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9.0, 0.8), steelWallMat);
      colL.position.set(-14, 4.5, zCol);
      const colR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9.0, 0.8), steelWallMat);
      colR.position.set(14, 4.5, zCol);
      shedFrame.add(colL, colR);
    }

    // Curved HY-80 Submarine Hull Shell Mockup
    const hullSegment = new THREE.Mesh(
      new THREE.CylinderGeometry(8.5, 8.5, 12, 16, 1, false, 0, Math.PI * 0.65),
      hy80PlateMat
    );
    hullSegment.rotation.z = Math.PI / 2;
    hullSegment.position.set(0, 4.5, -5);
    hullSegment.castShadow = true;
    shedFrame.add(hullSegment);

    // Staged Flat Armor Plate Pallet Stacks (walkable by Alba)
    const plateStack1 = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.8, 3.5), hy80PlateMat);
    plateStack1.position.set(-6, 0.4, 8);
    plateStack1.castShadow = true;
    shedFrame.add(plateStack1);
    this.platforms.push({
      minX: -78 - 3.0,
      maxX: -78 + 3.0,
      minZ: 8 + 8 - 1.75,
      maxZ: 8 + 8 + 1.75,
      height: 0.8
    });

    const plateStack2 = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.6, 3.0), hy80PlateMat);
    plateStack2.position.set(6, 0.8, 8);
    plateStack2.castShadow = true;
    shedFrame.add(plateStack2);
    this.platforms.push({
      minX: -66 - 2.5,
      maxX: -66 + 2.5,
      minZ: 8 + 8 - 1.5,
      maxZ: 8 + 8 + 1.5,
      height: 1.6
    });

    this.group.add(shedFrame);
  }

  /**
   * ZONE 3: Rail Marshaling & Sorting Yard (X in [-65, 30], Z in [65, 100])
   * Embedded flush grade-level tracks, realistic train flatcars with wheel bogies,
   * and heavy end-of-track buffer stops with hazard stripes.
   */
  private buildRailMarshalingYard(): void {
    const railSteelMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.35,
      metalness: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const woodTieMat = new THREE.MeshStandardMaterial({
      color: 0x271708,
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const flatcarFrameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.6 });
    const wheelSteelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.2 });
    const woodPlankDeckMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
    const containerMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5, metalness: 0.3 }); // Navy blue intermodal container
    const bufferMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 }); // Hazard yellow buffer stop
    const reflectorMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xb91c1c, emissiveIntensity: 0.5 }); // Red reflector

    // Two Parallel Rail Tracks (Length 34m, embedded flush into pavement)
    [-42, -22].forEach((xTrack) => {
      // Flush Grade-Level Steel Rails (0.02m height)
      const railGeo = new THREE.BoxGeometry(0.12, 0.02, 34);
      const railL = new THREE.Mesh(railGeo, railSteelMat);
      railL.position.set(xTrack - 0.75, 0.01, 80);
      const railR = new THREE.Mesh(railGeo, railSteelMat);
      railR.position.set(xTrack + 0.75, 0.01, 80);
      this.group.add(railL, railR);

      // Flush Embedded Wood Ties
      for (let zTie = 64; zTie <= 96; zTie += 1.4) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.015, 0.28), woodTieMat);
        tie.position.set(xTrack, 0.008, zTie);
        this.group.add(tie);
      }

      // End-of-Track Steel Buffer Stops (terminating safely with warning reflectors)
      const bumperGroup = new THREE.Group();
      bumperGroup.position.set(xTrack, 0, 97.5);

      const postL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), bufferMat);
      postL.position.set(-0.75, 0.6, 0);
      const postR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), bufferMat);
      postR.position.set(0.75, 0.6, 0);

      const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.25), bufferMat);
      crossBeam.position.set(0, 0.85, 0);

      // Dual Red Reflective Warning Targets
      const reflectorL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12), reflectorMat);
      reflectorL.rotateX(Math.PI / 2);
      reflectorL.position.set(-0.75, 0.85, -0.15);
      const reflectorR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12), reflectorMat);
      reflectorR.rotateX(Math.PI / 2);
      reflectorR.position.set(0.75, 0.85, -0.15);

      bumperGroup.add(postL, postR, crossBeam, reflectorL, reflectorR);
      this.group.add(bumperGroup);
    });

    // Realistic Heavy Rail Flatcar (Positioned on Track 1, clear of through-traffic)
    const flatcar = new THREE.Group();
    flatcar.position.set(-42, 0, 78);

    // Steel Center-Sill I-Beam Chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, 12.0), flatcarFrameMat);
    chassis.position.y = 0.65;
    chassis.castShadow = true;
    flatcar.add(chassis);

    // Wood Plank Cargo Deck (Walkable Platform at Y=0.82m)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.08, 12.1), woodPlankDeckMat);
    deck.position.y = 0.81;
    deck.castShadow = true;
    deck.receiveShadow = true;
    flatcar.add(deck);

    // 4-Wheel Railroad Truck Bogies (Front and Rear)
    [-4.2, 4.2].forEach((zTruck) => {
      const truck = new THREE.Group();
      truck.position.set(0, 0, zTruck);

      const bolster = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.4), flatcarFrameMat);
      bolster.position.y = 0.42;
      truck.add(bolster);

      [-0.75, 0.75].forEach((xWheel) => {
        [-0.6, 0.6].forEach((zWheel) => {
          const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 14);
          wheelGeo.rotateZ(Math.PI / 2);
          const wheel = new THREE.Mesh(wheelGeo, wheelSteelMat);
          wheel.position.set(xWheel, 0.28, zWheel);
          truck.add(wheel);
        });
      });
      flatcar.add(truck);
    });

    // Staged Cargo on Flatcar: Intermodal Shipping Container (Climbable roof at Y=3.4m)
    const container = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.5, 6.0), containerMat);
    container.position.set(0, 2.1, 0);
    container.castShadow = true;
    container.receiveShadow = true;
    flatcar.add(container);

    this.group.add(flatcar);

    // Register Walkable Flatcar Deck & Container Roof
    this.platforms.push({
      minX: -42 - 1.55,
      maxX: -42 + 1.55,
      minZ: 78 - 6.0,
      maxZ: 78 + 6.0,
      height: 0.85
    });

    this.platforms.push({
      minX: -42 - 1.3,
      maxX: -42 + 1.3,
      minZ: 78 - 3.0,
      maxZ: 78 + 3.0,
      height: 3.35
    });
  }

  /**
   * ZONE 4: Aircraft Carrier (CVN-80 Enterprise) Modular Superstructure in Dry Dock 12
   * Represents the ongoing supercarrier construction inside Dry Dock 12 under Big Blue crane:
   *  - Angled Flight Deck Sponson & Keel Module on reinforced dock keel blocks
   *  - Structural assembly scaffolding and high-elevation catwalks for feline exploration
   */
  private buildAircraftCarrierModularZone(): void {
    const carrierHullMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Haze Gray Navy Camouflage
      roughness: 0.55,
      metalness: 0.65
    });
    const flightDeckMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // High-traction non-skid flight deck coating
      roughness: 0.9,
      metalness: 0.2
    });
    const scaffoldYellow = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
    const keelBlockMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 });

    const cvnGroup = new THREE.Group();
    cvnGroup.name = 'CVN80_Enterprise_Carrier_Assembly';
    cvnGroup.position.set(20.5, -2.5, 32.0); // Inside Dry Dock 12 basin floor (Y = -2.5)

    // 1. Concrete Keel Blocks Support Row
    for (let zBlock = -14; zBlock <= 14; zBlock += 3.5) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.75, 1.2), keelBlockMat);
      block.position.set(0, 0.375, zBlock);
      block.receiveShadow = true;
      cvnGroup.add(block);
    }

    // 2. Main Carrier Keel & Lower Hull Module Block (Width: 16m, Length: 32m, Height: 5.5m)
    const hullBlock = new THREE.Mesh(new THREE.BoxGeometry(16.0, 5.0, 30.0), carrierHullMat);
    hullBlock.position.set(0, 3.25, 0);
    hullBlock.castShadow = true;
    hullBlock.receiveShadow = true;
    cvnGroup.add(hullBlock);

    // Register Hull Top Deck Platform (elevation in world space: -2.5 + 5.75 = 3.25m above ground!)
    this.platforms.push({
      minX: 20.5 - 8.0,
      maxX: 20.5 + 8.0,
      minZ: 32.0 - 15.0,
      maxZ: 32.0 + 15.0,
      height: 3.25
    });

    // 3. Angled Flight Deck Sponson Overhang (Portside Sponson No. 2 Mockup)
    const sponsonGeo = new THREE.BoxGeometry(6.5, 0.8, 18.0);
    const sponson = new THREE.Mesh(sponsonGeo, flightDeckMat);
    sponson.position.set(-10.2, 5.4, -2.0);
    sponson.castShadow = true;
    cvnGroup.add(sponson);

    // Register Sponson Flight Deck Platform
    this.platforms.push({
      minX: 20.5 - 13.5,
      maxX: 20.5 - 7.0,
      minZ: 32.0 - 11.0,
      maxZ: 32.0 + 7.0,
      height: 3.7
    });

    // 4. Yellow Assembly Scaffolding Towers & Inspection Ladders
    [-7.5, 7.5].forEach((xTower) => {
      const tower = new THREE.Group();
      tower.position.set(xTower, 0, 15.5);

      for (let yLevel = 1.2; yLevel <= 5.0; yLevel += 1.8) {
        const plat = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 2.8), scaffoldYellow);
        plat.position.y = yLevel;
        tower.add(plat);
      }

      for (let dx of [-1.2, 1.2]) {
        for (let dz of [-1.2, 1.2]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 6.0, 6), scaffoldYellow);
          pole.position.set(dx, 3.0, dz);
          tower.add(pole);
        }
      }

      cvnGroup.add(tower);
    });

    this.group.add(cvnGroup);
  }
}
