```typescript
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

  // Reusable Materials
  private readonly rackMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75, metalness: 0.6 }); // Slate Gray
  private readonly gratingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85, metalness: 0.7 }); // Dark Steel Grating
  private readonly cuNiMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.45, metalness: 0.85 }); // Copper-Nickel
  private readonly carbonSteelMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.8 }); // Carbon Steel
  private readonly spoolMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9, metalness: 0.1 }); // Dark Wood
  private readonly yellowTrim = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 }); // Industrial Yellow
  private readonly steelWallMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7, metalness: 0.5 }); // Haze Gray Steel
  private readonly hy80PlateMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.85 }); // HY-80 submarine armor plate
  private readonly yellowBeam = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 }); // Yellow Structural Beam

  // New Materials for Refinement
  private readonly corrugatedSteelMat = new THREE.MeshStandardMaterial({
    color: 0x64748b, // Light Slate Gray
    roughness: 0.7,
    metalness: 0.8,
    normalMap: this.createCorrugatedNormalMap(), // Simulate corrugation
    map: this.createCorrugatedAlbedoMap(), // Subtle texture
  });
  private readonly brickMat = new THREE.MeshStandardMaterial({
    color: 0x8b4513, // Sienna Brown
    roughness: 0.9,
    map: this.createBrickAlbedoMap(), // Simulate brick pattern
    normalMap: this.createBrickNormalMap(),
  });
  private readonly concreteMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 }); // Light Gray Concrete
  private readonly rustedSteelMat = new THREE.MeshStandardMaterial({ color: 0x8b4000, roughness: 0.9, metalness: 0.7 }); // Dark Orange-Brown Rusted Steel
  private readonly railSteelMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.35,
    metalness: 0.85,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  private readonly woodTieMat = new THREE.MeshStandardMaterial({
    color: 0x271708,
    roughness: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  private readonly flatcarFrameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.6 });
  private readonly wheelSteelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.2 });
  private readonly woodPlankDeckMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
  private readonly containerMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5, metalness: 0.3 }); // Navy blue intermodal container
  private readonly bufferMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 }); // Hazard yellow buffer stop
  private readonly reflectorMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xb91c1c, emissiveIntensity: 0.5 }); // Red reflector
  private readonly carrierHullMat = new THREE.MeshStandardMaterial({
    color: 0x475569, // Haze Gray Navy Camouflage
    roughness: 0.55,
    metalness: 0.65
  });
  private readonly flightDeckMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // High-traction non-skid flight deck coating
    roughness: 0.9,
    metalness: 0.2
  });
  private readonly scaffoldYellow = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
  private readonly keelBlockMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 });


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
   * Helper to create a simple corrugated normal map.
   * This is a placeholder; in a real scenario, this would come from TextureGenerator.ts or a loaded texture.
   */
  private createCorrugatedNormalMap(): THREE.Texture {
    const size = 64;
    const data = new Uint8Array(3 * size * size);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const stride = (i * size + j) * 3;
        const x = j / size;
        const y = i / size;
        // Simple sine wave for corrugation
        const val = Math.sin(x * Math.PI * 8) * 0.5 + 0.5; // 8 corrugations
        data[stride] = 128; // R (X component, flat for simple vertical corrugation)
        data[stride + 1] = Math.floor(val * 255); // G (Y component, varies)
        data[stride + 2] = 255; // B (Z component, always up)
      }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4); // Repeat the pattern
    return texture;
  }

  /**
   * Helper to create a subtle corrugated albedo map.
   */
  private createCorrugatedAlbedoMap(): THREE.Texture {
    const size = 64;
    const data = new Uint8Array(3 * size * size);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const stride = (i * size + j) * 3;
        const x = j / size;
        const val = Math.sin(x * Math.PI * 8) * 0.05 + 0.95; // Subtle light/dark variation
        data[stride] = Math.floor(val * 255);
        data[stride + 1] = Math.floor(val * 255);
        data[stride + 2] = Math.floor(val * 255);
      }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  }

  /**
   * Helper to create a simple brick albedo map.
   */
  private createBrickAlbedoMap(): THREE.Texture {
    const size = 64;
    const data = new Uint8Array(3 * size * size);
    const brickColor = new THREE.Color(0x8b4513);
    const mortarColor = new THREE.Color(0x555555);

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const stride = (i * size + j) * 3;
        const row = Math.floor(i / (size / 4)); // 4 rows of bricks
        const col = Math.floor(j / (size / 8)); // 8 bricks per row

        let color = brickColor;
        // Simulate mortar lines
        if (i % (size / 4) < 2 || j % (size / 8) < 2) { // Horizontal and vertical mortar
          color = mortarColor;
        }
        // Offset every other row for brick pattern
        if (row % 2 === 1 && j % (size / 8) < (size / 16) + 1 && j % (size / 8) > (size / 16) - 1) {
          color = mortarColor; // Vertical mortar for offset
        }

        data[stride] = Math.floor(color.r * 255);
        data[stride + 1] = Math.floor(color.g * 255);
        data[stride + 2] = Math.floor(color.b * 255);
      }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  }

  /**
   * Helper to create a simple brick normal map.
   */
  private createBrickNormalMap(): THREE.Texture {
    const size = 64;
    const data = new Uint8Array(3 * size * size);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const stride = (i * size + j) * 3;
        const row = Math.floor(i / (size / 4));
        const col = Math.floor(j / (size / 8));

        let normalX = 128; // Flat default
        let normalY = 128; // Flat default

        // Simulate mortar lines for normal map
        if (i % (size / 4) < 2) { // Horizontal mortar
          normalY = 100; // Push in slightly
        }
        if (j % (size / 8) < 2) { // Vertical mortar
          normalX = 100; // Push in slightly
        }
        if (row % 2 === 1 && j % (size / 8) < (size / 16) + 1 && j % (size / 8) > (size / 16) - 1) {
          normalX = 100; // Vertical mortar for offset
        }

        data[stride] = normalX;
        data[stride + 1] = normalY;
        data[stride + 2] = 255; // Z component always up
      }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  }


  /**
   * ZONE 1: Pipe Fabrication & Cable Spool Depot (X in [-95, -45], Z in [-95, -30])
   */
  private buildPipeFabAndSpoolDepot(): void {
    // Three Multi-Tier Pipe Racks
    const rackZPositions = [-80, -60, -40];
    const rackLength = 34;
    const rackTiers = [1.8, 3.6];

    rackZPositions.forEach((zPos, idx) => {
      // Walkable Grated Catwalk Spine on each level
      rackTiers.forEach((yLevel) => {
        const catwalk = new THREE.Mesh(new THREE.BoxGeometry(rackLength, 0.12, 3.6), this.gratingMat);
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
          const pipe = new THREE.Mesh(pipeGeo, offsetZ < 0 ? this.cuNiMat : this.carbonSteelMat);
          pipe.position.set(-68, yLevel + 0.35, zPos + offsetZ);
          pipe.castShadow = true;
          this.group.add(pipe);
        }
      });

      // Support Columns
      for (let xCol = -82; xCol <= -54; xCol += 14) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 3.8), this.yellowTrim);
        col.position.set(xCol, 2.1, zPos);
        this.group.add(col);
      }

      // Incline Ramp for climbing onto Tier 1
      const rampHeight = 1.8;
      const rampLength = 5.0;
      const rampAngle = Math.atan2(rampHeight, rampLength);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLength, 0.12, 1.6), this.gratingMat);
      ramp.position.set(-48 - rampLength / 2 + 0.5, rampHeight / 2 - 0.06, zPos); // Adjust position for base at Y=0
      ramp.rotation.z = rampAngle;
      ramp.castShadow = true;
      ramp.receiveShadow = true;
      this.group.add(ramp);

      // Register platform for cat movement (top of the ramp)
      this.platforms.push({
        minX: -48 - rampLength / 2,
        maxX: -48 + rampLength / 2,
        minZ: zPos - 0.8,
        maxZ: zPos + 0.8,
        height: rampHeight // Top height of the ramp
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
      const bottomFlange = new THREE.Mesh(flangeGeo, this.spoolMat);
      bottomFlange.position.y = 0.06;
      const topFlange = new THREE.Mesh(flangeGeo, this.spoolMat);
      topFlange.position.y = s.h - 0.06;
      const core = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.65, s.r * 0.65, s.h, 14), this.rackMat);
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
   * Refactored to include brick wainscot, corrugated steel siding, and roof.
   */
  private buildPlateBendingAndBlastShed(): void {
    const shedWidth = 30; // X dimension
    const shedDepth = 40; // Z dimension
    const shedHeight = 10; // Y dimension
    const shedBaseX = -72;
    const shedBaseZ = 8;

    const shedGroup = new THREE.Group();
    shedGroup.position.set(shedBaseX, 0, shedBaseZ);
    shedGroup.name = 'PlateBendingBlastShed';

    // 1. Building Structure
    // Brick Wainscot (Base)
    const wainscotHeight = 1.5;
    const wallThickness = 0.2;

    const wainscotGeo = new THREE.BoxGeometry(shedWidth + wallThickness * 2, wainscotHeight, shedDepth + wallThickness * 2);
    const wainscot = new THREE.Mesh(wainscotGeo, this.brickMat);
    wainscot.position.y = wainscotHeight / 2;
    shedGroup.add(wainscot);

    // Corrugated Steel Siding (Upper Walls)
    const sidingHeight = shedHeight - wainscotHeight;
    const sidingGeo = new THREE.BoxGeometry(shedWidth + wallThickness * 2, sidingHeight, shedDepth + wallThickness * 2);
    const siding = new THREE.Mesh(sidingGeo, this.corrugatedSteelMat);
    siding.position.y = wainscotHeight + sidingHeight / 2;
    shedGroup.add(siding);

    // Roof (simple flat roof for now)
    const roofThickness = 0.3;
    const roofGeo = new THREE.BoxGeometry(shedWidth + wallThickness * 2 + 0.4, roofThickness, shedDepth + wallThickness * 2 + 0.4); // Slightly overhang
    const roof = new THREE.Mesh(roofGeo, this.rustedSteelMat);
    roof.position.y = shedHeight + roofThickness / 2;
    shedGroup.add(roof);

    // Structural H-beam Pilasters (corner and mid-span supports)
    const pilasterGeo = new THREE.BoxGeometry(0.4, shedHeight + roofThickness, 0.4);
    const pilasterMat = this.rackMat; // Dark steel for structural elements

    // Corners
    const corners = [
      { x: -shedWidth / 2 - wallThickness / 2, z: -shedDepth / 2 - wallThickness / 2 },
      { x: shedWidth / 2 + wallThickness / 2, z: -shedDepth / 2 - wallThickness / 2 },
      { x: -shedWidth / 2 - wallThickness / 2, z: shedDepth / 2 + wallThickness / 2 },
      { x: shedWidth / 2 + wallThickness / 2, z: shedDepth / 2 + wallThickness / 2 },
    ];
    corners.forEach(pos => {
      const pilaster = new THREE.Mesh(pilasterGeo, pilasterMat);
      pilaster.position.set(pos.x, (shedHeight + roofThickness) / 2, pos.z);
      shedGroup.add(pilaster);
    });

    // Doors/Openings (cut out from the walls - simplified by not adding walls where doors are)
    // For simplicity, we'll assume the main structure is a shell and internal elements are added.
    // If we were to cut out, we'd use CSG or create individual wall segments.

    // 2. Internal Elements (relative to shedGroup)
    // Gantry Runway Beams Overhead
    const runwayL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, shedDepth - 2), this.yellowBeam);
    runwayL.position.set(-14, 8.5, 0);
    const runwayR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, shedDepth - 2), this.yellowBeam);
    runwayR.position.set(14, 8.5, 0);
    shedGroup.add(runwayL, runwayR);

    // Structural Pillars (supporting gantry)
    for (let zCol = -(shedDepth / 2 - 4); zCol <= (shedDepth / 2 - 4); zCol += (shedDepth - 8) / 2) {
      const colL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9.0, 0.8), this.steelWallMat);
      colL.position.set(-14, 4.5, zCol);
      const colR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9.0, 0.8), this.steelWallMat);
      colR.position.set(14, 4.5, zCol);
      shedGroup.add(colL, colR);
    }

    // Curved HY-80 Submarine Hull Shell Mockup
    const hullSegment = new THREE.Mesh(
      new THREE.CylinderGeometry(8.5, 8.5, 12, 16, 1, false, 0, Math.PI * 0.65),
      this.hy80PlateMat
    );
    hullSegment.rotation.z = Math.PI / 2;
    hullSegment.position.set(0, 4.5, -5);
    hullSegment.castShadow = true;
    shedGroup.add(hullSegment);

    // Staged Flat Armor Plate Pallet Stacks (walkable by Alba)
    const plateStack1 = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.8, 3.5), this.hy80PlateMat);
    plateStack1.position.set(-6, 0.4, 8);
    plateStack1.castShadow = true;
    shedGroup.add(plateStack1);
    this.platforms.push({
      minX: shedBaseX - 6 - 3.0,
      maxX: shedBaseX - 6 + 3.0,
      minZ: shedBaseZ + 8 - 1.75,
      maxZ: shedBaseZ + 8 + 1.75,
      height: 0.8
    });

    const plateStack2 = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.6, 3.0), this.hy80PlateMat);
    plateStack2.position.set(6, 0.8, 8);
    plateStack2.castShadow = true;
    shedGroup.add(plateStack2);
    this.platforms.push({
      minX: shedBaseX + 6 - 2.5,
      maxX: shedBaseX + 6 + 2.5,
      minZ: shedBaseZ + 8 - 1.5,
      maxZ: shedBaseZ + 8 + 1.5,
      height: 1.6
    });

    this.group.add(shedGroup);
  }

  /**
   * ZONE 3: Rail Marshaling & Sorting Yard (X in [-65, 30], Z in [65, 100])
   * Embedded flush grade-level tracks, realistic train flatcars with wheel bogies,
   * and heavy end-of-track buffer stops with hazard stripes.
   * Expanded with gravel beds and switchyard.
   */
  private buildRailMarshalingYard(): void {
    const trackLength = 34;
    const trackZStart = 64;
    const trackZEnd = trackZStart + trackLength;

    // Function to build a single track segment
    const buildTrack = (xTrack: number, zStart: number, zEnd: number, isSwitch = false) => {
      const segmentLength = zEnd - zStart;
      const segmentCenterZ = zStart + segmentLength / 2;

      // Gravel/Concrete Sleeper Bed
      const bedGeo = new THREE.BoxGeometry(3.0, 0.1, segmentLength + 2); // Wider and slightly longer than ties
      const bed = new THREE.Mesh(bedGeo, this.concreteMat);
      bed.position.set(xTrack, -0.05, segmentCenterZ); // Slightly below ground
      bed.receiveShadow = true;
      this.group.add(bed);

      // Flush Grade-Level Steel Rails (0.02m height)
      const railGeo = new THREE.BoxGeometry(0.12, 0.02, segmentLength);
      const railL = new THREE.Mesh(railGeo, this.railSteelMat);
      railL.position.set(xTrack - 0.75, 0.01, segmentCenterZ);
      const railR = new THREE.Mesh(railGeo, this.railSteelMat);
      railR.position.set(xTrack + 0.75, 0.01, segmentCenterZ);
      this.group.add(railL, railR);

      // Flush Embedded Wood Ties
      for (let zTie = zStart; zTie <= zEnd; zTie += 1.4) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.015, 0.28), this.woodTieMat);
        tie.position.set(xTrack, 0.008, zTie);
        this.group.add(tie);
      }
    };

    // Function to build a heavy duty hydraulic buffer stop
    const buildBufferStop = (xPos: number, zPos: number) => {
      const bumperGroup = new THREE.Group();
      bumperGroup.position.set(xPos, 0, zPos);

      // Main structure
      const postL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), this.bufferMat);
      postL.position.set(-0.75, 0.6, 0);
      const postR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), this.bufferMat);
      postR.position.set(0.75, 0.6, 0);

      const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.25), this.bufferMat);
      crossBeam.position.set(0, 0.85, 0);

      // Hydraulic piston detail
      const pistonCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8), this.carbonSteelMat);
      pistonCylinder.position.set(0, 0.4, -0.4);
      pistonCylinder.rotation.x = Math.PI / 2;
      const pistonRod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 6), this.railSteelMat);
      pistonRod.position.set(0, 0.4, -0.8);
      pistonRod.rotation.x = Math.PI / 2;

      // Dual Red Reflective Warning Targets
      const reflectorL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12), this.reflectorMat);
      reflectorL.rotateX(Math.PI / 2);
      reflectorL.position.set(-