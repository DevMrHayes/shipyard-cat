import * as THREE from 'three';

export interface ExpansionCollisionItem {
  box: THREE.Box3;
  mesh?: THREE.Object3D;
  surfaceType?: 'metal' | 'concrete' | 'catwalk' | 'hull';
  name?: string;
}

export interface SubmarineAndFabResult {
  group: THREE.Group;
  colliders: ExpansionCollisionItem[];
  interactivePoints: {
    name: string;
    position: THREE.Vector3;
    type: 'inspection' | 'catwalk' | 'submarine_sail' | 'fab_overhead';
  }[];
}

export class SubmarineAndFabExpansion {
  private group: THREE.Group;
  private colliders: ExpansionCollisionItem[];
  private interactivePoints: SubmarineAndFabResult['interactivePoints'];

  // Shared reusable materials to reduce draw calls and avoid runtime shader recompilation
  private materials: {
    concreteWall: THREE.MeshStandardMaterial;
    concreteFloor: THREE.MeshStandardMaterial;
    subHullBlack: THREE.MeshStandardMaterial;
    subHullRed: THREE.MeshStandardMaterial;
    subSail: THREE.MeshStandardMaterial;
    steelDark: THREE.MeshStandardMaterial;
    steelYellow: THREE.MeshStandardMaterial;
    catwalkGrating: THREE.MeshStandardMaterial;
    glassTranslucent: THREE.MeshStandardMaterial;
    scaffoldMetal: THREE.MeshStandardMaterial;
    hazardStripe: THREE.MeshStandardMaterial;
    waterTrough: THREE.MeshStandardMaterial;
  };

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'SubmarineAndFabExpansion';
    this.colliders = [];
    this.interactivePoints = [];

    this.materials = this.createSharedMaterials();
  }

  public build(): SubmarineAndFabResult {
    // 1. Dry Dock 2: Virginia-Class Attack Submarine Berth
    // Coordinates set to expand empty shipyard quadrant (X: -140 to -240, Z: 40 to 180)
    const dryDock2Origin = new THREE.Vector3(-180, 0, 110);
    this.buildDryDock2(dryDock2Origin);

    // 2. Heavy Steel Fabrication Super-Shop
    // Coordinates adjacent to Dry Dock 2 and existing yard crane corridors (X: -70 to -160, Z: 180 to 300)
    const fabShopOrigin = new THREE.Vector3(-115, 0, 240);
    this.buildHeavySteelFabSuperShop(fabShopOrigin);

    return {
      group: this.group,
      colliders: this.colliders,
      interactivePoints: this.interactivePoints
    };
  }

  private createSharedMaterials() {
    const concreteWall = new THREE.MeshStandardMaterial({
      color: 0x5a5e63,
      roughness: 0.9,
      metalness: 0.1
    });

    const concreteFloor = new THREE.MeshStandardMaterial({
      color: 0x484b4f,
      roughness: 0.85,
      metalness: 0.15
    });

    const subHullBlack = new THREE.MeshStandardMaterial({
      color: 0x141619,
      roughness: 0.35,
      metalness: 0.8
    });

    const subHullRed = new THREE.MeshStandardMaterial({
      color: 0x541818,
      roughness: 0.6,
      metalness: 0.4
    });

    const subSail = new THREE.MeshStandardMaterial({
      color: 0x181a1d,
      roughness: 0.4,
      metalness: 0.75
    });

    const steelDark = new THREE.MeshStandardMaterial({
      color: 0x2b3036,
      roughness: 0.5,
      metalness: 0.85
    });

    const steelYellow = new THREE.MeshStandardMaterial({
      color: 0xd69e2e,
      roughness: 0.4,
      metalness: 0.6
    });

    const catwalkGrating = new THREE.MeshStandardMaterial({
      color: 0x3a4047,
      roughness: 0.6,
      metalness: 0.8,
      wireframe: false
    });

    const glassTranslucent = new THREE.MeshStandardMaterial({
      color: 0x6ca0b8,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.45
    });

    const scaffoldMetal = new THREE.MeshStandardMaterial({
      color: 0x7c858e,
      roughness: 0.5,
      metalness: 0.7
    });

    const hazardStripe = new THREE.MeshStandardMaterial({
      color: 0xe2b007,
      roughness: 0.5,
      metalness: 0.3
    });

    const waterTrough = new THREE.MeshStandardMaterial({
      color: 0x0f2b35,
      roughness: 0.2,
      metalness: 0.9,
      transparent: true,
      opacity: 0.8
    });

    return {
      concreteWall,
      concreteFloor,
      subHullBlack,
      subHullRed,
      subSail,
      steelDark,
      steelYellow,
      catwalkGrating,
      glassTranslucent,
      scaffoldMetal,
      hazardStripe,
      waterTrough
    };
  }

  // =========================================================================
  // DRY DOCK 2 - VIRGINIA-CLASS ATTACK SUBMARINE BERTH
  // =========================================================================

  private buildDryDock2(origin: THREE.Vector3): void {
    const dockGroup = new THREE.Group();
    dockGroup.position.copy(origin);
    dockGroup.name = 'DryDock2_SubmarineBerth';

    const dockLength = 140;
    const dockWidth = 36;
    const dockDepth = 14;
    const wallThick = 4;

    // 1. Excavated Dock Basin Floor (Recessed below yard level Y = 0)
    const basinFloorGeo = new THREE.BoxGeometry(dockWidth, 2, dockLength);
    const basinFloor = new THREE.Mesh(basinFloorGeo, this.materials.concreteFloor);
    basinFloor.position.set(0, -dockDepth, 0);
    basinFloor.receiveShadow = true;
    dockGroup.add(basinFloor);

    this.registerBoxCollider(
      new THREE.Vector3(origin.x, origin.y - dockDepth, origin.z),
      new THREE.Vector3(dockWidth, 2, dockLength),
      'catwalk'
    );

    // 2. Concrete Retaining Walls (Left, Right, End Gate)
    // Left Wall
    const leftWallGeo = new THREE.BoxGeometry(wallThick, dockDepth + 1, dockLength);
    const leftWall = new THREE.Mesh(leftWallGeo, this.materials.concreteWall);
    leftWall.position.set(-dockWidth / 2 - wallThick / 2, -dockDepth / 2 + 0.5, 0);
    leftWall.receiveShadow = true;
    leftWall.castShadow = true;
    dockGroup.add(leftWall);

    this.registerBoxCollider(
      new THREE.Vector3(origin.x - dockWidth / 2 - wallThick / 2, origin.y - dockDepth / 2 + 0.5, origin.z),
      new THREE.Vector3(wallThick, dockDepth + 1, dockLength),
      'concrete'
    );

    // Right Wall
    const rightWall = new THREE.Mesh(leftWallGeo, this.materials.concreteWall);
    rightWall.position.set(dockWidth / 2 + wallThick / 2, -dockDepth / 2 + 0.5, 0);
    rightWall.receiveShadow = true;
    rightWall.castShadow = true;
    dockGroup.add(rightWall);

    this.registerBoxCollider(
      new THREE.Vector3(origin.x + dockWidth / 2 + wallThick / 2, origin.y - dockDepth / 2 + 0.5, origin.z),
      new THREE.Vector3(wallThick, dockDepth + 1, dockLength),
      'concrete'
    );

    // Caisson Dock Gate (Inboard End - Z: +dockLength/2)
    const gateGeo = new THREE.BoxGeometry(dockWidth + wallThick * 2, dockDepth + 2, wallThick);
    const endGate = new THREE.Mesh(gateGeo, this.materials.steelDark);
    endGate.position.set(0, -dockDepth / 2 + 1, dockLength / 2 + wallThick / 2);
    endGate.castShadow = true;
    dockGroup.add(endGate);

    this.registerBoxCollider(
      new THREE.Vector3(origin.x, origin.y - dockDepth / 2 + 1, origin.z + dockLength / 2 + wallThick / 2),
      new THREE.Vector3(dockWidth + wallThick * 2, dockDepth + 2, wallThick),
      'metal'
    );

    // Drainage Sump Floor Water (Thin layer in dock trough)
    const waterGeo = new THREE.PlaneGeometry(dockWidth - 2, dockLength - 4);
    const waterPlane = new THREE.Mesh(waterGeo, this.materials.waterTrough);
    waterPlane.rotation.x = -Math.PI / 2;
    waterPlane.position.set(0, -dockDepth + 1.05, 0);
    dockGroup.add(waterPlane);

    // 3. Virginia-Class Submarine Hull
    this.buildVirginiaClassSubmarine(dockGroup, dockDepth);

    // 4. Heavy Keel Blocking & Shores supporting the sub
    this.buildDockCribbingAndShores(dockGroup, dockLength, dockDepth, dockWidth);

    // 5. Perimeter Walkway Ramps & High-Level Inspection Catwalks
    this.buildDockCatwalksAndRamps(dockGroup, origin, dockWidth, dockLength, dockDepth);

    this.group.add(dockGroup);
  }

  private buildVirginiaClassSubmarine(parent: THREE.Group, dockDepth: number): void {
    const subGroup = new THREE.Group();
    subGroup.name = 'VirginiaClassSubmarine';

    // Virginia-class proportions: ~115m length, 10.4m beam
    const subLength = 115;
    const subRadius = 5.2;
    const subCenterY = -dockDepth + 3.0 + subRadius; // Elevate on keel blocks

    subGroup.position.set(0, subCenterY, 0);

    // Main Cylindrical Pressure Hull
    const hullCylinderLen = subLength * 0.68;
    const hullGeo = new THREE.CylinderGeometry(subRadius, subRadius, hullCylinderLen, 24, 1, false);
    // Orient along Z axis
    hullGeo.rotateX(Math.PI / 2);

    const mainHullUpper = new THREE.Mesh(hullGeo, this.materials.subHullBlack);
    mainHullUpper.castShadow = true;
    mainHullUpper.receiveShadow = true;
    subGroup.add(mainHullUpper);

    // Rounded Teardrop Bow
    const bowRadiusZ = 18;
    const bowGeo = new THREE.SphereGeometry(subRadius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    bowGeo.scale(1, 1, bowRadiusZ / subRadius);
    bowGeo.rotateX(-Math.PI / 2);
    const bowMesh = new THREE.Mesh(bowGeo, this.materials.subHullBlack);
    bowMesh.position.set(0, 0, -hullCylinderLen / 2);
    bowMesh.castShadow = true;
    subGroup.add(bowMesh);

    // Tapered Stern Cone
    const sternLength = 22;
    const sternGeo = new THREE.ConeGeometry(subRadius, sternLength, 24, 1, true);
    sternGeo.rotateX(-Math.PI / 2);
    const sternMesh = new THREE.Mesh(sternGeo, this.materials.subHullBlack);
    sternMesh.position.set(0, 0, hullCylinderLen / 2 + sternLength / 2);
    sternMesh.castShadow = true;
    subGroup.add(sternMesh);

    // Propulsor Pump-Jet Shroud (Propulsion at stern)
    const propShroudGeo = new THREE.CylinderGeometry(2.2, 2.6, 4.5, 16, 1, true);
    propShroudGeo.rotateX(Math.PI / 2);
    const propShroud = new THREE.Mesh(propShroudGeo, this.materials.steelDark);
    propShroud.position.set(0, 0, hullCylinderLen / 2 + sternLength + 2.2);
    subGroup.add(propShroud);

    // Sail / Conning Tower (Fitted with Virginia-class smooth blended sail)
    const sailLength = 12;
    const sailWidth = 3.2;
    const sailHeight = 6.4;
    const sailGeo = new THREE.BoxGeometry(sailWidth, sailHeight, sailLength);
    const sailMesh = new THREE.Mesh(sailGeo, this.materials.subSail);
    sailMesh.position.set(0, subRadius + sailHeight / 2 - 0.5, -hullCylinderLen * 0.22);
    sailMesh.castShadow = true;
    sailMesh.receiveShadow = true;
    subGroup.add(sailMesh);

    // Sail Fairwater Planes (Non-penetrating forward dive planes)
    const divePlaneGeo = new THREE.BoxGeometry(4.2, 0.4, 2.2);
    const leftPlane = new THREE.Mesh(divePlaneGeo, this.materials.subSail);
    leftPlane.position.set(-sailWidth / 2 - 2.1, subRadius + sailHeight * 0.65, -hullCylinderLen * 0.22 + 1.5);
    subGroup.add(leftPlane);

    const rightPlane = new THREE.Mesh(divePlaneGeo, this.materials.subSail);
    rightPlane.position.set(sailWidth / 2 + 2.1, subRadius + sailHeight * 0.65, -hullCylinderLen * 0.22 + 1.5);
    subGroup.add(rightPlane);

    // Stern Control Planes (Cruciform + X-shape hybrid rudders)
    const rudderGeo = new THREE.BoxGeometry(0.5, 9.5, 3.6);
    const vertRudder = new THREE.Mesh(rudderGeo, this.materials.subHullBlack);
    vertRudder.position.set(0, 0, hullCylinderLen / 2 + sternLength * 0.7);
    subGroup.add(vertRudder);

    const horizRudderGeo = new THREE.BoxGeometry(9.5, 0.5, 3.6);
    const horizRudder = new THREE.Mesh(horizRudderGeo, this.materials.subHullBlack);
    horizRudder.position.set(0, 0, hullCylinderLen / 2 + sternLength * 0.7);
    subGroup.add(horizRudder);

    // Submarine Hull Walking Top Collider (Allows player cat to jump and walk atop the full hull length)
    const worldSailY = parent.position.y + subCenterY + subRadius + sailHeight;
    this.interactivePoints.push({
      name: 'Sail Lookout Mast',
      position: new THREE.Vector3(parent.position.x, worldSailY, parent.position.z - hullCylinderLen * 0.22),
      type: 'submarine_sail'
    });

    // Hull collider block along spine
    this.registerBoxCollider(
      new THREE.Vector3(parent.position.x, parent.position.y + subCenterY, parent.position.z),
      new THREE.Vector3(subRadius * 2, subRadius * 2, hullCylinderLen + bowRadiusZ * 0.8),
      'hull'
    );

    // Sail collider block
    this.registerBoxCollider(
      new THREE.Vector3(parent.position.x, worldSailY - sailHeight / 2, parent.position.z - hullCylinderLen * 0.22),
      new THREE.Vector3(sailWidth + 0.4, sailHeight, sailLength),
      'hull'
    );

    parent.add(subGroup);
  }

  private buildDockCribbingAndShores(parent: THREE.Group, dockLength: number, dockDepth: number, dockWidth: number): void {
    const cribGeo = new THREE.BoxGeometry(4.8, 2.2, 2.6);
    const cribCount = 22;
    const zStep = (dockLength * 0.7) / cribCount;

    for (let i = 0; i < cribCount; i++) {
      const zPos = -dockLength * 0.35 + i * zStep;
      const crib = new THREE.Mesh(cribGeo, this.materials.steelDark);
      crib.position.set(0, -dockDepth + 1.1, zPos);
      crib.castShadow = true;
      parent.add(crib);
    }

    // Bilge Shores / Side Bracing Struts angled from dock wall to submarine hull
    const shoreGeo = new THREE.CylinderGeometry(0.25, 0.25, dockWidth * 0.36, 8);
    const shorePairs = 6;
    for (let j = 0; j < shorePairs; j++) {
      const z = -40 + j * 16;
      // Left Shore
      const shoreL = new THREE.Mesh(shoreGeo, this.materials.scaffoldMetal);
      shoreL.position.set(-dockWidth * 0.32, -dockDepth + 4.8, z);
      shoreL.rotation.z = Math.PI / 3.8;
      parent.add(shoreL);

      // Right Shore
      const shoreR = new THREE.Mesh(shoreGeo, this.materials.scaffoldMetal);
      shoreR.position.set(dockWidth * 0.32, -dockDepth + 4.8, z);
      shoreR.rotation.z = -Math.PI / 3.8;
      parent.add(shoreR);
    }
  }

  private buildDockCatwalksAndRamps(
    parent: THREE.Group,
    dockOrigin: THREE.Vector3,
    dockWidth: number,
    dockLength: number,
    dockDepth: number
  ): void {
    // Scaffold towers alongside hull for staging
    const platformY = -dockDepth * 0.45;
    const platformWidth = 3.0;
    const platformLength = dockLength * 0.75;

    const catwalkGeo = new THREE.BoxGeometry(platformWidth, 0.4, platformLength);

    // Port staging catwalk
    const portCatwalk = new THREE.Mesh(catwalkGeo, this.materials.catwalkGrating);
    portCatwalk.position.set(-dockWidth * 0.36, platformY, 0);
    portCatwalk.castShadow = true;
    parent.add(portCatwalk);

    this.registerBoxCollider(
      new THREE.Vector3(dockOrigin.x - dockWidth * 0.36, dockOrigin.y + platformY, dockOrigin.z),
      new THREE.Vector3(platformWidth, 0.4, platformLength),
      'catwalk'
    );

    // Starboard staging catwalk
    const stbdCatwalk = new THREE.Mesh(catwalkGeo, this.materials.catwalkGrating);
    stbdCatwalk.position.set(dockWidth * 0.36, platformY, 0);
    stbdCatwalk.castShadow = true;
    parent.add(stbdCatwalk);

    this.registerBoxCollider(
      new THREE.Vector3(dockOrigin.x + dockWidth * 0.36, dockOrigin.y + platformY, dockOrigin.z),
      new THREE.Vector3(platformWidth, 0.4, platformLength),
      'catwalk'
    );

    // Gangway bridge connecting ground level (Y=0) to the submarine deck
    const gangwayLength = dockWidth * 0.55;
    const gangwayGeo = new THREE.BoxGeometry(gangwayLength, 0.35, 2.4);
    const gangway = new THREE.Mesh(gangwayGeo, this.materials.steelYellow);
    gangway.position.set(-dockWidth * 0.28, 0.2, -18);
    gangway.castShadow = true;
    parent.add(gangway);

    this.registerBoxCollider(
      new THREE.Vector3(dockOrigin.x - dockWidth * 0.28, dockOrigin.y + 0.2, dockOrigin.z - 18),
      new THREE.Vector3(gangwayLength, 0.35, 2.4),
      'catwalk'
    );

    // Interactive Gangway Entry Point
    this.interactivePoints.push({
      name: 'Dry Dock 2 Submarine Access Gangway',
      position: new THREE.Vector3(dockOrigin.x - dockWidth * 0.45, dockOrigin.y + 0.5, dockOrigin.z - 18),
      type: 'catwalk'
    });
  }

  // =========================================================================
  // HEAVY STEEL FABRICATION SUPER-SHOP
  // =========================================================================

  private buildHeavySteelFabSuperShop(origin: THREE.Vector3): void {
    const shopGroup = new THREE.Group();
    shopGroup.position.copy(origin);
    shopGroup.name = 'HeavySteelFabSuperShop';

    const bldWidth = 65;   // X span
    const bldLength = 100; // Z span
    const bldHeight = 24;  // Y clearance
    const wallThick = 1.2;

    // 1. Reinforced High-Load Concrete Slab
    const slabGeo = new THREE.BoxGeometry(bldWidth + 4, 1.2, bldLength + 4);
    const slab = new THREE.Mesh(slabGeo, this.materials.concreteFloor);
    slab.position.set(0, 0.6, 0);
    slab.receiveShadow = true;
    shopGroup.add(slab);

    this.registerBoxCollider(
      new THREE.Vector3(origin.x, origin.y + 0.6, origin.z),
      new THREE.Vector3(bldWidth + 4, 1.2, bldLength + 4),
      'catwalk'
    );

    // 2. Main Outer Structural Walls with Giant Roll-Up Hull Transport Bay Doors
    // Back Wall (Z: -bldLength/2)
    const backWallGeo = new THREE.BoxGeometry(bldWidth, bldHeight, wallThick);
    const backWall = new THREE.Mesh(backWallGeo, this.materials.concreteWall);
    backWall.position.set(0, bldHeight / 2, -bldLength / 2);
    backWall.castShadow = true;
    shopGroup.add(backWall);

    this.registerBoxCollider(
      new THREE.Vector3(origin.x, origin.y + bldHeight / 2, origin.z - bldLength / 2),
      new THREE.Vector3(bldWidth, bldHeight, wallThick),
      'concrete'
    );

    // Left Long Wall (X: -bldWidth/2)
    const sideWallGeo = new THREE.BoxGeometry(wallThick, bldHeight, bldLength);
    const leftWall = new THREE.Mesh(sideWallGeo, this.materials.concreteWall);
    leftWall.position.set(-bldWidth / 2, bldHeight / 2, 0);
    leftWall.castShadow = true;
    shopGroup.add(leftWall);

    this.registerBoxCollider(
      new THREE.Vector3(origin.x - bldWidth / 2, origin.y + bldHeight / 2, origin.z),
      new THREE.Vector3(wallThick, bldHeight, bldLength),
      'concrete'
    );

    // Right Long Wall (X: +bldWidth/2) with clerestory industrial window bands
    const rightWall = new THREE.Mesh(sideWallGeo, this.materials.concreteWall);
    rightWall.position.set(bldWidth / 2, bldHeight / 2, 0);
    rightWall.castShadow = true;
    shopGroup.add(rightWall);

    this.registerBoxCollider(
      new THREE.Vector3(origin.x + bldWidth / 2, origin.y + bldHeight / 2, origin.z),
      new THREE.Vector3(wallThick, bldHeight, bldLength),
      'concrete'
    );

    // Front Bay (Z: +bldLength/2) with High-Clearance Open Portal
    const portalPillarWidth = 14;
    const portalDoorWidth = bldWidth - portalPillarWidth * 2;
    const portalHeight = 16;

    const leftPortalPillarGeo = new THREE.BoxGeometry(portalPillarWidth, bldHeight, wallThick);
    const leftPortalPillar = new THREE.Mesh(leftPortalPillarGeo, this.materials.concreteWall);
    leftPortalPillar.position.set(-bldWidth / 2 + portalPillarWidth / 2, bldHeight / 2, bldLength / 2);
    shopGroup.add(leftPortalPillar);

    this.registerBoxCollider(
      new THREE.Vector3(origin.x - bldWidth / 2 + portalPillarWidth / 2, origin.y + bldHeight / 2, origin.z + bldLength / 2),
      new THREE.Vector3(portalPillarWidth, bldHeight, wallThick),
      'concrete'
    );

    const rightPortalPillar = new THREE.Mesh(leftPortalPillarGeo, this.materials.concreteWall);
    rightPortalPillar.position.set(bldWidth / 2 - portalPillarWidth / 2, bldHeight / 2, bldLength / 2);
    shopGroup.add(rightPortalPillar);

    this.registerBoxCollider(
      new THREE.Vector3(origin.x + bldWidth / 2 - portalPillarWidth / 2, origin.y + bldHeight / 2, origin.z + bldLength / 2),
      new THREE.Vector3(portalPillarWidth, bldHeight, wallThick),
      'concrete'
    );

    // Header Beam above Roll-Up Bay Portal
    const headerHeight = bldHeight - portalHeight;
    const headerGeo = new THREE.BoxGeometry(portalDoorWidth, headerHeight, wallThick);
    const portalHeader = new THREE.Mesh(headerGeo, this.materials.hazardStripe);
    portalHeader.position.set(0, portalHeight + headerHeight / 2, bldLength / 2);
    shopGroup.add(portalHeader);

    this.registerBoxCollider(
      new THREE.Vector3(origin.x, origin.y + portalHeight + headerHeight / 2, origin.z + bldLength / 2),
      new THREE.Vector3(portalDoorWidth, headerHeight, wallThick),
      'concrete'
    );

    // 3. Steel Truss Roof Canopy
    const roofGeo = new THREE.BoxGeometry(bldWidth + 2, 1.0, bldLength + 2);
    const roof = new THREE.Mesh(roofGeo, this.materials.steelDark);
    roof.position.set(0, bldHeight + 0.5, 0);
    shopGroup.add(roof);

    this.registerBoxCollider(
      new THREE.Vector3(origin.x, origin.y + bldHeight + 0.5, origin.z),
      new THREE.Vector3(bldWidth + 2, 1.0, bldLength + 2),
      'metal'
    );

    // 4. Heavy Overhead Gantry Crane Rail & Bridge inside the Shop
    this.buildShopOverheadCrane(shopGroup, origin, bldWidth, bldLength, bldHeight);

    // 5. Interior Curving Hull Ring Sections & Hydraulic Welding Jigs
    this.buildInteriorFabricationFixtures(shopGroup, origin);

    this.group.add(shopGroup);
  }

  private buildShopOverheadCrane(
    parent: THREE.Group,
    shopOrigin: THREE.Vector3,
    bldWidth: number,
    bldLength: number,
    bldHeight: number
  ): void {
    const craneRailY = bldHeight * 0.78;

    // Longitudinal Rails along both walls
    const railGeo = new THREE.BoxGeometry(1.2, 1.0, bldLength - 4);
    const leftRail = new THREE.Mesh(railGeo, this.materials.steelYellow);
    leftRail.position.set(-bldWidth / 2 + 2, craneRailY, 0);
    parent.add(leftRail);

    const rightRail = new THREE.Mesh(railGeo, this.materials.steelYellow);
    rightRail.position.set(bldWidth / 2 - 2, craneRailY, 0);
    parent.add(rightRail);

    // Dual Gantry Cross Girder
    const girderSpan = bldWidth - 6;
    const girderGeo = new THREE.BoxGeometry(girderSpan, 2.2, 3.2);
    const craneGirder = new THREE.Mesh(girderGeo, this.materials.steelYellow);
    craneGirder.position.set(0, craneRailY + 1.2, -10);
    craneGirder.castShadow = true;
    parent.add(craneGirder);

    // Crane Trolley & Heavy Hoist Block
    const trolleyGeo = new THREE.BoxGeometry(4.2, 1.6, 3.8);
    const trolley = new THREE.Mesh(trolleyGeo, this.materials.steelDark);
    trolley.position.set(4, craneRailY + 2.8, -10);
    parent.add(trolley);

    // Walkable Gantry Catwalk on top of the Crane Bridge
    this.registerBoxCollider(
      new THREE.Vector3(shopOrigin.x, shopOrigin.y + craneRailY + 2.4, shopOrigin.z - 10),
      new THREE.Vector3(girderSpan, 0.4, 3.2),
      'catwalk'
    );

    this.interactivePoints.push({
      name: 'Super-Shop 120-Ton Overhead Crane Girder',
      position: new THREE.Vector3(shopOrigin.x, shopOrigin.y + craneRailY + 2.6, shopOrigin.z - 10),
      type: 'fab_overhead'
    });
  }

  private buildInteriorFabricationFixtures(parent: THREE.Group, shopOrigin: THREE.Vector3): void {
    // Submarine Ring Module 1 (HY-80 Steel Cylinder Section in fixture)
    const ringRadius = 5.1;
    const ringLength = 12.0;
    const ringThickness = 0.6;
    const ringGeo = new THREE.CylinderGeometry(ringRadius, ringRadius, ringLength, 20, 1, true);
    ringGeo.rotateX(Math.PI / 2);

    const hullRingMesh = new THREE.Mesh(ringGeo, this.materials.steelDark);
    hullRingMesh.position.set(-8, ringRadius + 1.2, 15);
    hullRingMesh.castShadow = true;
    parent.add(hullRingMesh);

    this.registerBoxCollider(
      new THREE.Vector3(shopOrigin.x - 8, shopOrigin.y + ringRadius + 1.2, shopOrigin.z + 15),
      new THREE.Vector3(ringRadius * 2, ringRadius * 2, ringLength),
      'metal'
    );

    // Ring Module 2 (Being turned on heavy hydraulic welding positioner roll beds)
    const ring2 = new THREE.Mesh(ringGeo, this.materials.subHullRed);
    ring2.position.set(12, ringRadius + 1.2, -22);
    ring2.castShadow = true;
    parent.add(ring2);

    this.registerBoxCollider(
      new THREE.Vector3(shopOrigin.x + 12, shopOrigin.y + ringRadius + 1.2, shopOrigin.z - 22),
      new THREE.Vector3(ringRadius * 2, ringRadius * 2, ringLength),
      'metal'
    );

    // Hydraulic Positioner Beds (Heavy Yellow pedestals under cylinders)
    const rollerGeo = new THREE.BoxGeometry(6.5, 1.4, 4.0);
    const roller1 = new THREE.Mesh(rollerGeo, this.materials.steelYellow);
    roller1.position.set(-8, 0.7, 15);
    parent.add(roller1);

    const roller2 = new THREE.Mesh(rollerGeo, this.materials.steelYellow);
    roller2.position.set(12, 0.7, -22);
    parent.add(roller2);

    // Inspection Elevated Staging Catwalk inside the shop
    const stagingGeo = new THREE.BoxGeometry(8.0, 0.4, 18.0);
    const staging = new THREE.Mesh(stagingGeo, this.materials.catwalkGrating);
    staging.position.set(0, 3.5, 0);
    staging.castShadow = true;
    staging.receiveShadow = true;
    parent.add(staging);

    this.registerBoxCollider(
      new THREE.Vector3(shopOrigin.x, shopOrigin.y + 3.5, shopOrigin.z),
      new THREE.Vector3(8.0, 0.4, 18.0),
      'catwalk'
    );

    this.interactivePoints.push({
      name: 'Super-Shop Elevated Module Staging Catwalk',
      position: new THREE.Vector3(shopOrigin.x, shopOrigin.y + 3.8, shopOrigin.z),
      type: 'catwalk'
    });
  }

  private registerBoxCollider(center: THREE.Vector3, size: THREE.Vector3, surfaceType: ExpansionCollisionItem['surfaceType'] = 'concrete', name?: string): void {
    const halfSize = new THREE.Vector3(size.x / 2, size.y / 2, size.z / 2);
    const box = new THREE.Box3(
      new THREE.Vector3(center.x - halfSize.x, center.y - halfSize.y, center.z - halfSize.z),
      new THREE.Vector3(center.x + halfSize.x, center.y + halfSize.y, center.z + halfSize.z)
    );
    this.colliders.push({ box, surfaceType, name });
  }

  public getColliders(): ExpansionCollisionItem[] {
    return this.colliders;
  }

  public getWalkablePlatforms(): { minX: number; maxX: number; minZ: number; maxZ: number; height: number }[] {
    const list: { minX: number; maxX: number; minZ: number; maxZ: number; height: number }[] = [];
    for (const c of this.colliders) {
      if (c.surfaceType === 'catwalk') {
        list.push({
          minX: c.box.min.x,
          maxX: c.box.max.x,
          minZ: c.box.min.z,
          maxZ: c.box.max.z,
          height: c.box.max.y
        });
      }
    }
    return list;
  }
}
