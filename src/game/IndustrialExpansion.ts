/**
 * IndustrialExpansion.ts - World Sector Expansion for Unused Shipyard Grounds
 * ============================================================================
 * Populates previously vacant perimeter zones inside Newport News Shipbuilding fence:
 *  - Zone 1: Pipe Fabrication & Cable Spool Depot (Northwest, X: -95 to -45, Z: -95 to -30)
 *  - Zone 2: Plate Bending & Blast Shed (Central-West, X: -95 to -50, Z: -15 to 30)
 *  - Zone 3: Rail Marshaling & Sorting Yard (Southwest, X: -65 to 30, Z: 65 to 100)
 *
 * All walkable decks, crates, and spools register directly into ShipyardEnvironment.platforms
 * ensuring deterministic platform elevation and zero foot-sinking.
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
  }

  /**
   * ZONE 1: Pipe Fabrication & Cable Spool Depot (X in [-95, -45], Z in [-95, -30])
   */
  private buildPipeFabAndSpoolDepot(): void {
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75, metalness: 0.6 });
    const gratingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85, metalness: 0.7 });
    const cuNiMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.45, metalness: 0.85 }); // Copper-Nickel
    const spoolMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9, metalness: 0.1 });
    const yellowTrim = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 });

    // 1A. Three Multi-Tier Pipe Racks
    const rackZPositions = [-80, -60, -40];
    const rackLength = 34;
    const rackTiers = [1.8, 3.6];

    rackZPositions.forEach((zPos, idx) => {
      // Walkable Grated Catwalk Spine on each level
      rackTiers.forEach((yLevel) => {
        const catwalk = new THREE.Mesh(new THREE.BoxGeometry(rackLength, 0.18, 3.6), gratingMat);
        catwalk.position.set(-68, yLevel - 0.09, zPos);
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
          const pipeGeo = new THREE.CylinderGeometry(0.32, 0.32, rackLength - 2, 10);
          pipeGeo.rotateZ(Math.PI / 2);
          const pipe = new THREE.Mesh(pipeGeo, offsetZ < 0 ? cuNiMat : rackMat);
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
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.15, 1.6), gratingMat);
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

    // 1B. Giant Marine Wooden Cable Spools (Stepping stones between racks)
    const spools = [
      { x: -48, z: -70, r: 1.6, h: 1.8 },
      { x: -46, z: -50, r: 2.0, h: 2.4 },
      { x: -88, z: -35, r: 1.8, h: 2.0 }
    ];

    spools.forEach((s) => {
      const spoolGroup = new THREE.Group();
      spoolGroup.position.set(s.x, 0, s.z);

      const flangeGeo = new THREE.CylinderGeometry(s.r, s.r, 0.15, 16);
      const bottomFlange = new THREE.Mesh(flangeGeo, spoolMat);
      bottomFlange.position.y = 0.08;
      const topFlange = new THREE.Mesh(flangeGeo, spoolMat);
      topFlange.position.y = s.h - 0.08;
      const core = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.65, s.r * 0.65, s.h, 14), rackMat);
      core.position.y = s.h / 2;

      spoolGroup.add(bottomFlange, topFlange, core);
      this.group.add(spoolGroup);

      // Register top of spool as walkable platform
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

    // Open-Bay Fabrication Frame (36m x 10m x 38m)
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
   */
  private buildRailMarshalingYard(): void {
    const railSteelMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.35, metalness: 0.9 });
    const woodTieMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.95 });
    const flatcarMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.7, metalness: 0.5 });
    const containerMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 }); // Red freight container

    // Two Parallel Rail Tracks (Length 42m)
    [-42, -22].forEach((xTrack) => {
      // Steel Rail Pair
      const railGeo = new THREE.BoxGeometry(0.12, 0.18, 38);
      const railL = new THREE.Mesh(railGeo, railSteelMat);
      railL.position.set(xTrack - 0.75, 0.12, 82);
      const railR = new THREE.Mesh(railGeo, railSteelMat);
      railR.position.set(xTrack + 0.75, 0.12, 82);
      this.group.add(railL, railR);

      // Wood Ties spaced every 1.2m
      for (let zTie = 64; zTie <= 100; zTie += 1.4) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.28), woodTieMat);
        tie.position.set(xTrack, 0.06, zTie);
        this.group.add(tie);
      }
    });

    // Staged Heavy Flatcars (Walkable decks)
    const flatcar1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 14.0), flatcarMat);
    flatcar1.position.set(-42, 0.55, 78);
    flatcar1.castShadow = true;
    this.group.add(flatcar1);
    this.platforms.push({
      minX: -42 - 1.6,
      maxX: -42 + 1.6,
      minZ: 78 - 7.0,
      maxZ: 78 + 7.0,
      height: 1.0
    });

    // Intermodal Shipping Container aboard Flatcar 1
    const container = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.6, 6.5), containerMat);
    container.position.set(-42, 2.3, 75);
    container.castShadow = true;
    this.group.add(container);
    this.platforms.push({
      minX: -42 - 1.4,
      maxX: -42 + 1.4,
      minZ: 75 - 3.25,
      maxZ: 75 + 3.25,
      height: 3.6
    });

    const flatcar2 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 12.0), flatcarMat);
    flatcar2.position.set(-22, 0.55, 85);
    flatcar2.castShadow = true;
    this.group.add(flatcar2);
    this.platforms.push({
      minX: -22 - 1.6,
      maxX: -22 + 1.6,
      minZ: 85 - 6.0,
      maxZ: 85 + 6.0,
      height: 1.0
    });
  }
}
