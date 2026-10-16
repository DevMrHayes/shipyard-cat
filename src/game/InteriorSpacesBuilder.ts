import * as THREE from 'three';

export interface WalkablePlatform {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export interface InteriorCollectible {
  id: string;
  name: string;
  position: THREE.Vector3;
  mesh: THREE.Group;
  collected: boolean;
  type: 'blueprint' | 'tool' | 'lore' | 'ration';
}

export interface WorkbenchStation {
  id: string;
  name: string;
  position: THREE.Vector3;
  interactionRadius: number;
  type: 'shipfitting' | 'avionics' | 'subassembly' | 'tooling';
}

export class InteriorSpacesBuilder {
  public readonly group: THREE.Group;
  public readonly platforms: WalkablePlatform[];
  public readonly collectibles: InteriorCollectible[];
  public readonly workbenches: WorkbenchStation[];

  private readonly materials: {
    wallConcrete: THREE.MeshStandardMaterial;
    floorEpoxy: THREE.MeshStandardMaterial;
    ceilingTile: THREE.MeshStandardMaterial;
    steelTrim: THREE.MeshStandardMaterial;
    benchTopWood: THREE.MeshStandardMaterial;
    benchMetal: THREE.MeshStandardMaterial;
    screenGlow: THREE.MeshBasicMaterial;
    terminalHousing: THREE.MeshStandardMaterial;
    glassCabinet: THREE.MeshPhysicalMaterial;
    brassInstrument: THREE.MeshStandardMaterial;
    collectibleGlow: THREE.MeshStandardMaterial;
  };

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'InteriorSpaces';
    this.platforms = [];
    this.collectibles = [];
    this.workbenches = [];

    this.materials = {
      wallConcrete: new THREE.MeshStandardMaterial({
        color: 0x8a929a,
        roughness: 0.85,
        metalness: 0.1,
      }),
      floorEpoxy: new THREE.MeshStandardMaterial({
        color: 0x3d4b53,
        roughness: 0.35,
        metalness: 0.25,
      }),
      ceilingTile: new THREE.MeshStandardMaterial({
        color: 0x4a5259,
        roughness: 0.9,
        metalness: 0.05,
      }),
      steelTrim: new THREE.MeshStandardMaterial({
        color: 0x2e353b,
        roughness: 0.4,
        metalness: 0.8,
      }),
      benchTopWood: new THREE.MeshStandardMaterial({
        color: 0x7c5a36,
        roughness: 0.65,
        metalness: 0.05,
      }),
      benchMetal: new THREE.MeshStandardMaterial({
        color: 0x333b42,
        roughness: 0.5,
        metalness: 0.7,
      }),
      screenGlow: new THREE.MeshBasicMaterial({
        color: 0x64c8ff,
      }),
      terminalHousing: new THREE.MeshStandardMaterial({
        color: 0x1f2429,
        roughness: 0.6,
        metalness: 0.4,
      }),
      glassCabinet: new THREE.MeshPhysicalMaterial({
        color: 0xddeeff,
        transparent: true,
        opacity: 0.45,
        roughness: 0.1,
        transmission: 0.7,
        thickness: 0.5,
      }),
      brassInstrument: new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        roughness: 0.3,
        metalness: 0.9,
      }),
      collectibleGlow: new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        emissive: 0x008ba3,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.8,
      }),
    };

    this.buildJMAFInterior();
    this.buildApprenticeSchoolInterior();
  }

  /**
   * Joint Manufacturing Assembly Facility (JMAF) Interior Room
   * Location: X = -52, Z = -5
   */
  private buildJMAFInterior(): void {
    const center = new THREE.Vector3(-52, 0, -5);
    const roomWidth = 18;
    const roomLength = 22;
    const roomHeight = 6.5;
    const wallThickness = 0.5;
    const floorY = 0;

    const jmafGroup = new THREE.Group();
    jmafGroup.name = 'JMAF_Interior';

    // Walkable floor platform
    const halfW = roomWidth / 2;
    const halfL = roomLength / 2;
    this.platforms.push({
      minX: center.x - halfW,
      maxX: center.x + halfW,
      minZ: center.z - halfL,
      maxZ: center.z + halfL,
      height: floorY,
    });

    // Floor Mesh
    const floorGeo = new THREE.BoxGeometry(roomWidth, 0.4, roomLength);
    const floorMesh = new THREE.Mesh(floorGeo, this.materials.floorEpoxy);
    floorMesh.position.set(center.x, floorY - 0.2, center.z);
    floorMesh.receiveShadow = true;
    jmafGroup.add(floorMesh);

    // Ceiling Mesh
    const ceilingGeo = new THREE.BoxGeometry(roomWidth, 0.4, roomLength);
    const ceilingMesh = new THREE.Mesh(ceilingGeo, this.materials.ceilingTile);
    ceilingMesh.position.set(center.x, floorY + roomHeight + 0.2, center.z);
    jmafGroup.add(ceilingMesh);

    // Walls (North, South, East, West with entrance opening on East side)
    // North Wall
    const northWall = new THREE.Mesh(
      new THREE.BoxGeometry(roomWidth, roomHeight, wallThickness),
      this.materials.wallConcrete
    );
    northWall.position.set(center.x, floorY + roomHeight / 2, center.z - halfL);
    northWall.castShadow = true;
    northWall.receiveShadow = true;
    jmafGroup.add(northWall);

    // South Wall
    const southWall = new THREE.Mesh(
      new THREE.BoxGeometry(roomWidth, roomHeight, wallThickness),
      this.materials.wallConcrete
    );
    southWall.position.set(center.x, floorY + roomHeight / 2, center.z + halfL);
    southWall.castShadow = true;
    southWall.receiveShadow = true;
    jmafGroup.add(southWall);

    // West Wall
    const westWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, roomHeight, roomLength),
      this.materials.wallConcrete
    );
    westWall.position.set(center.x - halfW, floorY + roomHeight / 2, center.z);
    westWall.castShadow = true;
    westWall.receiveShadow = true;
    jmafGroup.add(westWall);

    // East Wall with doorway (split into two wall panels)
    const doorGap = 4.0;
    const sideWallLen = (roomLength - doorGap) / 2;
    const eastWallA = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, roomHeight, sideWallLen),
      this.materials.wallConcrete
    );
    eastWallA.position.set(center.x + halfW, floorY + roomHeight / 2, center.z - halfL + sideWallLen / 2);
    jmafGroup.add(eastWallA);

    const eastWallB = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, roomHeight, sideWallLen),
      this.materials.wallConcrete
    );
    eastWallB.position.set(center.x + halfW, floorY + roomHeight / 2, center.z + halfL - sideWallLen / 2);
    jmafGroup.add(eastWallB);

    // Header over entrance doorway
    const doorHeader = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, roomHeight - 3.2, doorGap),
      this.materials.wallConcrete
    );
    doorHeader.position.set(center.x + halfW, floorY + 3.2 + (roomHeight - 3.2) / 2, center.z);
    jmafGroup.add(doorHeader);

    // Warm Lighting Setup (Overhead Pendants + Industrial Sconces)
    const lightPositions: [number, number, number][] = [
      [center.x - 4, floorY + roomHeight - 0.8, center.z - 5],
      [center.x + 4, floorY + roomHeight - 0.8, center.z - 5],
      [center.x - 4, floorY + roomHeight - 0.8, center.z + 5],
      [center.x + 4, floorY + roomHeight - 0.8, center.z + 5],
    ];

    lightPositions.forEach(([lx, ly, lz], idx) => {
      const warmLight = new THREE.PointLight(0xffb870, 1.25, 14, 1.8);
      warmLight.position.set(lx, ly, lz);
      warmLight.castShadow = false;
      jmafGroup.add(warmLight);

      // Light Fixture Model
      const fixtureStem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.8),
        this.materials.steelTrim
      );
      fixtureStem.position.set(lx, ly + 0.4, lz);
      jmafGroup.add(fixtureStem);

      const fixtureShade = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 0.35, 16, 1, true),
        this.materials.steelTrim
      );
      fixtureShade.position.set(lx, ly + 0.1, lz);
      jmafGroup.add(fixtureShade);

      const bulbGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd199 })
      );
      bulbGlow.position.set(lx, ly, lz);
      jmafGroup.add(bulbGlow);
    });

    // Workbenches
    this.createIndustrialWorkbench(jmafGroup, new THREE.Vector3(center.x - 6.0, floorY, center.z - 6.0), 'JMAF Heavy Tooling Bench', 'shipfitting', 0);
    this.createIndustrialWorkbench(jmafGroup, new THREE.Vector3(center.x - 6.0, floorY, center.z + 6.0), 'JMAF Hydraulic Routing Rig', 'subassembly', 0);

    // Center Assembly Table Platform (Stepped/Raised Surface)
    const centerPlatformY = floorY + 0.9;
    this.platforms.push({
      minX: center.x - 2.5,
      maxX: center.x + 2.5,
      minZ: center.z - 3.0,
      maxZ: center.z + 3.0,
      height: centerPlatformY,
    });

    const assemblyTable = new THREE.Mesh(
      new THREE.BoxGeometry(5.0, 0.9, 6.0),
      this.materials.benchMetal
    );
    assemblyTable.position.set(center.x, floorY + 0.45, center.z);
    assemblyTable.castShadow = true;
    assemblyTable.receiveShadow = true;
    jmafGroup.add(assemblyTable);

    // Tabletop detailing: Modular Sub-Hull Mockup
    const hullMockup = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 4.0, 16, 1, false, 0, Math.PI),
      this.materials.steelTrim
    );
    hullMockup.rotation.z = Math.PI / 2;
    hullMockup.position.set(center.x, centerPlatformY + 0.4, center.z);
    jmafGroup.add(hullMockup);

    // Collectibles in JMAF
    this.addCollectible(
      'jmaf_cvn80_bow_blueprint',
      'CVN-80 Enterprise Bow Section Blueprint',
      new THREE.Vector3(center.x - 6.0, floorY + 1.1, center.z - 6.0),
      'blueprint',
      jmafGroup
    );

    this.addCollectible(
      'jmaf_titanium_wrench',
      'High-Spec Titanium Torque Spanner',
      new THREE.Vector3(center.x, centerPlatformY + 0.8, center.z + 1.5),
      'tool',
      jmafGroup
    );

    this.group.add(jmafGroup);
  }

  /**
   * Apprentice School Interior Room (Training Classroom & Prototype Lab)
   * Location: X = -54, Z = -50
   */
  private buildApprenticeSchoolInterior(): void {
    const center = new THREE.Vector3(-54, 0, -50);
    const roomWidth = 16;
    const roomLength = 18;
    const roomHeight = 5.5;
    const wallThickness = 0.5;
    const floorY = 0;

    const schoolGroup = new THREE.Group();
    schoolGroup.name = 'ApprenticeSchool_Interior';

    // Walkable floor platform
    const halfW = roomWidth / 2;
    const halfL = roomLength / 2;
    this.platforms.push({
      minX: center.x - halfW,
      maxX: center.x + halfW,
      minZ: center.z - halfL,
      maxZ: center.z + halfL,
      height: floorY,
    });

    // Floor Mesh
    const floorGeo = new THREE.BoxGeometry(roomWidth, 0.4, roomLength);
    const floorMesh = new THREE.Mesh(floorGeo, this.materials.floorEpoxy);
    floorMesh.position.set(center.x, floorY - 0.2, center.z);
    floorMesh.receiveShadow = true;
    schoolGroup.add(floorMesh);

    // Ceiling Mesh
    const ceilingGeo = new THREE.BoxGeometry(roomWidth, 0.4, roomLength);
    const ceilingMesh = new THREE.Mesh(ceilingGeo, this.materials.ceilingTile);
    ceilingMesh.position.set(center.x, floorY + roomHeight + 0.2, center.z);
    schoolGroup.add(ceilingMesh);

    // North Wall with chalkboard/display
    const northWall = new THREE.Mesh(
      new THREE.BoxGeometry(roomWidth, roomHeight, wallThickness),
      this.materials.wallConcrete
    );
    northWall.position.set(center.x, floorY + roomHeight / 2, center.z - halfL);
    schoolGroup.add(northWall);

    const blackboard = new THREE.Mesh(
      new THREE.BoxGeometry(8, 2.8, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x1d2e24, roughness: 0.9 })
    );
    blackboard.position.set(center.x, floorY + 2.6, center.z - halfL + wallThickness / 2 + 0.05);
    schoolGroup.add(blackboard);

    // South Wall with Entry Door
    const doorGap = 3.6;
    const sWallLen = (roomWidth - doorGap) / 2;
    const southWallA = new THREE.Mesh(
      new THREE.BoxGeometry(sWallLen, roomHeight, wallThickness),
      this.materials.wallConcrete
    );
    southWallA.position.set(center.x - halfW + sWallLen / 2, floorY + roomHeight / 2, center.z + halfL);
    schoolGroup.add(southWallA);

    const southWallB = new THREE.Mesh(
      new THREE.BoxGeometry(sWallLen, roomHeight, wallThickness),
      this.materials.wallConcrete
    );
    southWallB.position.set(center.x + halfW - sWallLen / 2, floorY + roomHeight / 2, center.z + halfL);
    schoolGroup.add(southWallB);

    const doorHeader = new THREE.Mesh(
      new THREE.BoxGeometry(doorGap, roomHeight - 3.2, wallThickness),
      this.materials.wallConcrete
    );
    doorHeader.position.set(center.x, floorY + 3.2 + (roomHeight - 3.2) / 2, center.z + halfL);
    schoolGroup.add(doorHeader);

    // West and East Walls
    const westWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, roomHeight, roomLength),
      this.materials.wallConcrete
    );
    westWall.position.set(center.x - halfW, floorY + roomHeight / 2, center.z);
    schoolGroup.add(westWall);

    const eastWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, roomHeight, roomLength),
      this.materials.wallConcrete
    );
    eastWall.position.set(center.x + halfW, floorY + roomHeight / 2, center.z);
    schoolGroup.add(eastWall);

    // Warm Ambient and Recessed Lights
    const schoolLightPos: [number, number, number][] = [
      [center.x - 3.5, floorY + roomHeight - 0.6, center.z - 3.5],
      [center.x + 3.5, floorY + roomHeight - 0.6, center.z - 3.5],
      [center.x - 3.5, floorY + roomHeight - 0.6, center.z + 3.5],
      [center.x + 3.5, floorY + roomHeight - 0.6, center.z + 3.5],
    ];

    schoolLightPos.forEach(([lx, ly, lz]) => {
      const lamp = new THREE.PointLight(0xffca85, 1.1, 12, 2.0);
      lamp.position.set(lx, ly, lz);
      schoolGroup.add(lamp);

      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.1, 1.6),
        new THREE.MeshBasicMaterial({ color: 0xffebd1 })
      );
      panel.position.set(lx, ly + 0.55, lz);
      schoolGroup.add(panel);
    });

    // Desks / Apprentice Workbenches
    this.createSchoolWorkbench(schoolGroup, new THREE.Vector3(center.x - 4.5, floorY, center.z), 'Apprentice Drafting Terminal A', 'avionics');
    this.createSchoolWorkbench(schoolGroup, new THREE.Vector3(center.x + 4.5, floorY, center.z), 'Apprentice Drafting Terminal B', 'tooling');

    // Display Glass Cabinets along West Wall
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 3.2, 5.0),
      this.materials.glassCabinet
    );
    cabinet.position.set(center.x - halfW + 1.2, floorY + 1.6, center.z - 2.5);
    schoolGroup.add(cabinet);

    // Relic inside cabinet
    const modelHull = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 2.2, 8),
      this.materials.brassInstrument
    );
    modelHull.rotation.z = Math.PI / 2;
    modelHull.position.set(center.x - halfW + 1.2, floorY + 1.8, center.z - 2.5);
    schoolGroup.add(modelHull);

    // Apprentice School Collectibles
    this.addCollectible(
      'apprentice_logbook_1942',
      'Historic 1942 Shipbuilder Apprentice Log',
      new THREE.Vector3(center.x - 4.5, floorY + 0.95, center.z + 0.2),
      'lore',
      schoolGroup
    );

    this.addCollectible(
      'smof_catwalk_passkey',
      'SMOF Submarine Catwalk Access Token',
      new THREE.Vector3(center.x + 4.5, floorY + 0.95, center.z - 0.3),
      'tool',
      schoolGroup
    );

    this.group.add(schoolGroup);
  }

  private createIndustrialWorkbench(
    parent: THREE.Group,
    pos: THREE.Vector3,
    name: string,
    type: WorkbenchStation['type'],
    rotationY: number
  ): void {
    const wbGroup = new THREE.Group();
    wbGroup.position.copy(pos);
    wbGroup.rotation.y = rotationY;

    // Platform for table top collision
    this.platforms.push({
      minX: pos.x - 1.5,
      maxX: pos.x + 1.5,
      minZ: pos.z - 0.7,
      maxZ: pos.z + 0.7,
      height: pos.y + 0.95,
    });

    // Legs
    const legGeo = new THREE.BoxGeometry(0.12, 0.9, 0.12);
    const legOffsets: [number, number][] = [
      [-1.35, -0.55],
      [1.35, -0.55],
      [-1.35, 0.55],
      [1.35, 0.55],
    ];
    legOffsets.forEach(([ox, oz]) => {
      const leg = new THREE.Mesh(legGeo, this.materials.steelTrim);
      leg.position.set(ox, 0.45, oz);
      wbGroup.add(leg);
    });

    // Top
    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 0.1, 1.4),
      this.materials.benchTopWood
    );
    tableTop.position.set(0, 0.9, 0);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    wbGroup.add(tableTop);

    // Back Tool Pegboard
    const pegboard = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 1.4, 0.08),
      this.materials.benchMetal
    );
    pegboard.position.set(0, 1.6, -0.65);
    wbGroup.add(pegboard);

    // Small terminal monitor
    const monitor = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.45, 0.06),
      this.materials.terminalHousing
    );
    monitor.position.set(0.6, 1.25, -0.45);
    wbGroup.add(monitor);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.38),
      this.materials.screenGlow
    );
    screen.position.set(0.6, 1.25, -0.41);
    wbGroup.add(screen);

    parent.add(wbGroup);

    this.workbenches.push({
      id: `wb_${this.workbenches.length + 1}`,
      name,
      position: pos.clone().add(new THREE.Vector3(0, 0.9, 0)),
      interactionRadius: 2.6,
      type,
    });
  }

  private createSchoolWorkbench(
    parent: THREE.Group,
    pos: THREE.Vector3,
    name: string,
    type: WorkbenchStation['type']
  ): void {
    const benchGroup = new THREE.Group();
    benchGroup.position.copy(pos);

    // Platform for surface
    this.platforms.push({
      minX: pos.x - 1.2,
      maxX: pos.x + 1.2,
      minZ: pos.z - 0.6,
      maxZ: pos.z + 0.6,
      height: pos.y + 0.85,
    });

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.8, 1.2),
      this.materials.benchMetal
    );
    body.position.set(0, 0.4, 0);
    benchGroup.add(body);

    const deskTop = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.08, 1.3),
      this.materials.benchTopWood
    );
    deskTop.position.set(0, 0.82, 0);
    benchGroup.add(deskTop);

    // Drafting Lamp
    const lampArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.5),
      this.materials.steelTrim
    );
    lampArm.rotation.z = -0.3;
    lampArm.position.set(-0.8, 1.05, -0.35);
    benchGroup.add(lampArm);

    const lampHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.18, 12),
      this.materials.brassInstrument
    );
    lampHead.rotation.x = 0.5;
    lampHead.position.set(-0.68, 1.22, -0.3);
    benchGroup.add(lampHead);

    const lampLight = new THREE.PointLight(0xffdfa8, 0.8, 4.0);
    lampLight.position.set(-0.68, 1.15, -0.25);
    benchGroup.add(lampLight);

    parent.add(benchGroup);

    this.workbenches.push({
      id: `wb_school_${this.workbenches.length + 1}`,
      name,
      position: pos.clone().add(new THREE.Vector3(0, 0.85, 0)),
      interactionRadius: 2.4,
      type,
    });
  }

  private addCollectible(
    id: string,
    name: string,
    pos: THREE.Vector3,
    type: InteriorCollectible['type'],
    parent: THREE.Group
  ): void {
    const colGroup = new THREE.Group();
    colGroup.position.copy(pos);

    // Floating Collectible Mesh
    const coreMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.2, 0),
      this.materials.collectibleGlow
    );
    coreMesh.castShadow = true;
    colGroup.add(coreMesh);

    // Glow halo ring
    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.025, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x88ffff, wireframe: true })
    );
    ringMesh.rotation.x = Math.PI / 2;
    colGroup.add(ringMesh);

    // Subtle beacon light
    const colLight = new THREE.PointLight(0x00e5ff, 0.6, 3.5);
    colLight.position.set(0, 0.1, 0);
    colGroup.add(colLight);

    parent.add(colGroup);

    this.collectibles.push({
      id,
      name,
      position: pos.clone(),
      mesh: colGroup,
      collected: false,
      type,
    });
  }

  /**
   * Per-frame animation for interior elements (hovering collectibles, flashing dials)
   */
  public update(delta: number, elapsedTime: number): void {
    for (let i = 0; i < this.collectibles.length; i++) {
      const item = this.collectibles[i];
      if (!item.collected && item.mesh) {
        item.mesh.rotation.y += delta * 1.5;
        item.mesh.position.y = item.position.y + Math.sin(elapsedTime * 2.5 + i) * 0.08;
      }
    }
  }

  public checkCollectibleInteractions(playerPos: THREE.Vector3, pickupRadius = 1.6): InteriorCollectible | null {
    for (const item of this.collectibles) {
      if (!item.collected && item.position.distanceTo(playerPos) <= pickupRadius) {
        item.collected = true;
        item.mesh.visible = false;
        return item;
      }
    }
    return null;
  }
}