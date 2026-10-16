import * as THREE from 'three';

export interface InteriorLoreItem {
  id: string;
  facility: 'JMAF' | 'APPRENTICE_SCHOOL';
  title: string;
  snippet: string;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  collected: boolean;
}

export interface InteriorRivetCache {
  id: string;
  facility: 'JMAF' | 'APPRENTICE_SCHOOL';
  rivetCount: number;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  collected: boolean;
}

export interface InteriorPortalTrigger {
  facility: 'JMAF' | 'APPRENTICE_SCHOOL';
  doorwayPosition: THREE.Vector3;
  interiorPadPosition: THREE.Vector3;
  portalRadius: number;
}

export interface InteriorSpaceDefinition {
  facility: 'JMAF' | 'APPRENTICE_SCHOOL';
  doorwayCenter: THREE.Vector3;
  interiorPadCenter: THREE.Vector3;
  stagingPadDimensions: THREE.Vector3;
  ambientLightColor: number;
  pointLightColor: number;
  workbenches: THREE.Mesh[];
  decorations: THREE.Object3D[];
  loreHooks: InteriorLoreItem[];
  rivetCaches: InteriorRivetCache[];
}

export class InteriorSpacesBuilder {
  private readonly scene: THREE.Scene;
  private readonly interiorSpaces: Map<string, InteriorSpaceDefinition> = new Map();
  private readonly loreRegistry: InteriorLoreItem[] = [];
  private readonly rivetRegistry: InteriorRivetCache[] = [];
  private readonly portalTriggers: InteriorPortalTrigger[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public buildAllInteriors(): {
    spaces: Map<string, InteriorSpaceDefinition>;
    loreItems: InteriorLoreItem[];
    rivetCaches: InteriorRivetCache[];
    portals: InteriorPortalTrigger[];
  } {
    this.buildJMAFInterior();
    this.buildApprenticeSchoolInterior();

    return {
      spaces: this.interiorSpaces,
      loreItems: this.loreRegistry,
      rivetCaches: this.rivetRegistry,
      portals: this.portalTriggers
    };
  }

  private buildJMAFInterior(): void {
    // Joint Modular Assembly Facility (X=-52, Z=-5)
    const doorwayPos = new THREE.Vector3(-52, 0, -5);
    const interiorPadPos = new THREE.Vector3(-52, 0.12, -7.5);
    const stagingDimensions = new THREE.Vector3(14, 0.24, 10);

    const jmafGroup = new THREE.Group();
    jmafGroup.name = 'interior_jmaf_staging_pad';

    // Walkable Interior Staging Pad (non-slip industrial steel diamond-plate visual)
    const padGeometry = new THREE.BoxGeometry(
      stagingDimensions.x,
      stagingDimensions.y,
      stagingDimensions.z
    );
    const padMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b333c,
      roughness: 0.82,
      metalness: 0.35
    });
    const stagingPadMesh = new THREE.Mesh(padGeometry, padMaterial);
    stagingPadMesh.position.copy(interiorPadPos);
    stagingPadMesh.receiveShadow = true;
    jmafGroup.add(stagingPadMesh);

    // High-visibility floor perimeter striping
    const edgeGeo = new THREE.BoxGeometry(stagingDimensions.x + 0.1, 0.02, stagingDimensions.z + 0.1);
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xf5a623,
      roughness: 0.4,
      metalness: 0.1
    });
    const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
    edgeMesh.position.set(interiorPadPos.x, interiorPadPos.y + 0.13, interiorPadPos.z);
    jmafGroup.add(edgeMesh);

    // Warm Architectural Interior Lighting
    const warmInteriorLight = new THREE.PointLight(0xffb74d, 2.2, 18, 1.4);
    warmInteriorLight.position.set(-52, 3.8, -7.5);
    warmInteriorLight.castShadow = false;
    jmafGroup.add(warmInteriorLight);

    const secondaryWarmFill = new THREE.PointLight(0xff9800, 1.2, 12, 1.5);
    secondaryWarmFill.position.set(-56, 2.9, -9);
    secondaryWarmFill.castShadow = false;
    jmafGroup.add(secondaryWarmFill);

    // Doorway Portal Frame visual
    const portalFrame = this.createDoorwayPortalMesh(doorwayPos, 0x3e4a59, 'JMAF Bay Door 04');
    jmafGroup.add(portalFrame);

    // Heavy Workbenches
    const workbenches: THREE.Mesh[] = [];
    const bench1 = this.createWorkbench(new THREE.Vector3(-55.5, 0.65, -9.5), 3.2, 0.9, 1.4);
    const bench2 = this.createWorkbench(new THREE.Vector3(-48.5, 0.65, -9.5), 3.0, 0.9, 1.4);
    workbenches.push(bench1, bench2);
    jmafGroup.add(bench1, bench2);

    // Tool Rack / Staging Crate deco
    const crateGeo = new THREE.BoxGeometry(1.2, 1.0, 1.2);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(-56.2, 0.65, -6.0);
    jmafGroup.add(crate);

    // Collectible Lore Hook: JMAF Modular Weld Blueprint
    const lore1 = this.createLoreHook(
      'lore_jmaf_cvn_bulkhead',
      'JMAF',
      'CVN-80 Modular Bulkhead Schematics',
      'Structural tolerance log confirms automated seam welders reduced unit join time by 38%.',
      new THREE.Vector3(-55.2, 1.2, -9.3)
    );
    jmafGroup.add(lore1.mesh);
    this.loreRegistry.push(lore1);

    // Rivet Cache: JMAF High-Tensile Titanium Rivets
    const rivetCache1 = this.createRivetCache(
      'rivet_cache_jmaf_primary',
      'JMAF',
      25,
      new THREE.Vector3(-48.2, 1.2, -9.3)
    );
    jmafGroup.add(rivetCache1.mesh);
    this.rivetRegistry.push(rivetCache1);

    this.scene.add(jmafGroup);

    const jmafPortalTrigger: InteriorPortalTrigger = {
      facility: 'JMAF',
      doorwayPosition: doorwayPos.clone(),
      interiorPadPosition: interiorPadPos.clone(),
      portalRadius: 2.8
    };
    this.portalTriggers.push(jmafPortalTrigger);

    this.interiorSpaces.set('JMAF', {
      facility: 'JMAF',
      doorwayCenter: doorwayPos,
      interiorPadCenter: interiorPadPos,
      stagingPadDimensions: stagingDimensions,
      ambientLightColor: 0xffb74d,
      pointLightColor: 0xff9800,
      workbenches,
      decorations: [crate, portalFrame],
      loreHooks: [lore1],
      rivetCaches: [rivetCache1]
    });
  }

  private buildApprenticeSchoolInterior(): void {
    // The Apprentice School (X=-54, Z=-50)
    const doorwayPos = new THREE.Vector3(-54, 0, -50);
    const interiorPadPos = new THREE.Vector3(-54, 0.12, -52.5);
    const stagingDimensions = new THREE.Vector3(13, 0.24, 11);

    const schoolGroup = new THREE.Group();
    schoolGroup.name = 'interior_apprentice_school_staging_pad';

    // Polished Linoleum / Drafting Floor Staging Pad
    const padGeometry = new THREE.BoxGeometry(
      stagingDimensions.x,
      stagingDimensions.y,
      stagingDimensions.z
    );
    const padMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.2
    });
    const stagingPadMesh = new THREE.Mesh(padGeometry, padMaterial);
    stagingPadMesh.position.copy(interiorPadPos);
    stagingPadMesh.receiveShadow = true;
    schoolGroup.add(stagingPadMesh);

    // Apprentice Gold Boundary Accent
    const accentGeo = new THREE.BoxGeometry(stagingDimensions.x + 0.1, 0.02, stagingDimensions.z + 0.1);
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.35,
      metalness: 0.25
    });
    const accentMesh = new THREE.Mesh(accentGeo, accentMat);
    accentMesh.position.set(interiorPadPos.x, interiorPadPos.y + 0.13, interiorPadPos.z);
    schoolGroup.add(accentMesh);

    // Warm Classroom / Drafting Interior Lighting
    const draftingRoomLight = new THREE.PointLight(0xffe082, 2.0, 16, 1.3);
    draftingRoomLight.position.set(-54, 3.6, -52.5);
    draftingRoomLight.castShadow = false;
    schoolGroup.add(draftingRoomLight);

    const warmReadingLight = new THREE.PointLight(0xffca28, 1.4, 10, 1.4);
    warmReadingLight.position.set(-50.5, 2.7, -54.5);
    warmReadingLight.castShadow = false;
    schoolGroup.add(warmReadingLight);

    // Doorway Portal Visual
    const portalFrame = this.createDoorwayPortalMesh(
      doorwayPos,
      0x1e293b,
      'Apprentice School Hallway Entrance'
    );
    schoolGroup.add(portalFrame);

    // Drafting Workbenches
    const workbenches: THREE.Mesh[] = [];
    const draftingDesk1 = this.createWorkbench(new THREE.Vector3(-57.2, 0.65, -54.0), 3.0, 0.9, 1.5, 0x475569);
    const draftingDesk2 = this.createWorkbench(new THREE.Vector3(-50.8, 0.65, -54.0), 3.0, 0.9, 1.5, 0x475569);
    workbenches.push(draftingDesk1, draftingDesk2);
    schoolGroup.add(draftingDesk1, draftingDesk2);

    // Bookshelf / Archival Blueprint Locker
    const lockerGeo = new THREE.BoxGeometry(2.4, 2.2, 0.8);
    const lockerMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const lockerMesh = new THREE.Mesh(lockerGeo, lockerMat);
    lockerMesh.position.set(-54.0, 1.25, -56.8);
    schoolGroup.add(lockerMesh);

    // Collectible Lore Hook: 1919 Apprentice Charter Log
    const lore2 = this.createLoreHook(
      'lore_apprentice_heritage_charter',
      'APPRENTICE_SCHOOL',
      '1919 Shipbuilder Apprentice Charter',
      '"Always good ships: rigorous craftsmanship, leadership, and unwavering commitment to nation and crew."',
      new THREE.Vector3(-56.8, 1.2, -53.8)
    );
    schoolGroup.add(lore2.mesh);
    this.loreRegistry.push(lore2);

    // Rivet Cache: Precision Training Rivet Pack
    const rivetCache2 = this.createRivetCache(
      'rivet_cache_apprentice_precision',
      'APPRENTICE_SCHOOL',
      30,
      new THREE.Vector3(-50.4, 1.2, -53.8)
    );
    schoolGroup.add(rivetCache2.mesh);
    this.rivetRegistry.push(rivetCache2);

    this.scene.add(schoolGroup);

    const schoolPortalTrigger: InteriorPortalTrigger = {
      facility: 'APPRENTICE_SCHOOL',
      doorwayPosition: doorwayPos.clone(),
      interiorPadPosition: interiorPadPos.clone(),
      portalRadius: 2.8
    };
    this.portalTriggers.push(schoolPortalTrigger);

    this.interiorSpaces.set('APPRENTICE_SCHOOL', {
      facility: 'APPRENTICE_SCHOOL',
      doorwayCenter: doorwayPos,
      interiorPadCenter: interiorPadPos,
      stagingPadDimensions: stagingDimensions,
      ambientLightColor: 0xffe082,
      pointLightColor: 0xffca28,
      workbenches,
      decorations: [lockerMesh, portalFrame],
      loreHooks: [lore2],
      rivetCaches: [rivetCache2]
    });
  }

  private createWorkbench(
    position: THREE.Vector3,
    width = 2.8,
    height = 0.9,
    depth = 1.2,
    color = 0x334155
  ): THREE.Mesh {
    const tableGroup = new THREE.Group();

    const topGeo = new THREE.BoxGeometry(width, 0.12, depth);
    const topMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      metalness: 0.4
    });
    const tableTop = new THREE.Mesh(topGeo, topMat);
    tableTop.position.set(0, height * 0.5, 0);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    tableGroup.add(tableTop);

    const legGeo = new THREE.BoxGeometry(0.12, height, 0.12);
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
      metalness: 0.5
    });

    const halfW = width * 0.5 - 0.1;
    const halfD = depth * 0.5 - 0.1;
    const legOffsets = [
      [-halfW, -halfD],
      [halfW, -halfD],
      [-halfW, halfD],
      [halfW, halfD]
    ];

    for (const [ox, oz] of legOffsets) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(ox, 0, oz);
      leg.castShadow = true;
      tableGroup.add(leg);
    }

    // Merge/encapsulate as Mesh representation
    const compoundMesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    compoundMesh.position.copy(position);
    compoundMesh.add(tableGroup);
    return compoundMesh;
  }

  private createDoorwayPortalMesh(
    position: THREE.Vector3,
    frameColor: number,
    portalLabel: string
  ): THREE.Object3D {
    const portalGroup = new THREE.Group();
    portalGroup.name = `portal_${portalLabel.replace(/\s+/g, '_')}`;

    const beamGeo = new THREE.BoxGeometry(3.6, 0.35, 0.35);
    const pillarGeo = new THREE.BoxGeometry(0.35, 3.2, 0.35);
    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: 0.5,
      metalness: 0.6
    });

    const lintel = new THREE.Mesh(beamGeo, frameMat);
    lintel.position.set(0, 3.0, 0);

    const leftPillar = new THREE.Mesh(pillarGeo, frameMat);
    leftPillar.position.set(-1.6, 1.5, 0);

    const rightPillar = new THREE.Mesh(pillarGeo, frameMat);
    rightPillar.position.set(1.6, 1.5, 0);

    // Doorway threshold light marker
    const thresholdGeo = new THREE.BoxGeometry(3.0, 0.05, 0.6);
    const thresholdMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
      roughness: 0.3
    });
    const thresholdMesh = new THREE.Mesh(thresholdGeo, thresholdMat);
    thresholdMesh.position.set(0, 0.05, 0);

    portalGroup.add(lintel, leftPillar, rightPillar, thresholdMesh);
    portalGroup.position.copy(position);
    return portalGroup;
  }

  private createLoreHook(
    id: string,
    facility: 'JMAF' | 'APPRENTICE_SCHOOL',
    title: string,
    snippet: string,
    position: THREE.Vector3
  ): InteriorLoreItem {
    const loreGeo = new THREE.OctahedronGeometry(0.24, 0);
    const loreMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.8
    });
    const mesh = new THREE.Mesh(loreGeo, loreMat);
    mesh.name = `lore_hook_${id}`;
    mesh.position.copy(position);

    return {
      id,
      facility,
      title,
      snippet,
      position: position.clone(),
      mesh,
      collected: false
    };
  }

  private createRivetCache(
    id: string,
    facility: 'JMAF' | 'APPRENTICE_SCHOOL',
    rivetCount: number,
    position: THREE.Vector3
  ): InteriorRivetCache {
    const rivetGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.2, 8);
    const rivetMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.9
    });
    const mesh = new THREE.Mesh(rivetGeo, rivetMat);
    mesh.name = `rivet_cache_${id}`;
    mesh.position.copy(position);

    return {
      id,
      facility,
      rivetCount,
      position: position.clone(),
      mesh,
      collected: false
    };
  }

  public getPortalAtPosition(position: THREE.Vector3, threshold = 2.6): InteriorPortalTrigger | null {
    for (const portal of this.portalTriggers) {
      const dist = position.distanceTo(portal.doorwayPosition);
      if (dist <= (portal.portalRadius || threshold)) {
        return portal;
      }
    }
    return null;
  }

  public getLoreHooks(): InteriorLoreItem[] {
    return this.loreRegistry;
  }

  public getRivetCaches(): InteriorRivetCache[] {
    return this.rivetRegistry;
  }

  public getInteriorSpace(facility: 'JMAF' | 'APPRENTICE_SCHOOL'): InteriorSpaceDefinition | undefined {
    return this.interiorSpaces.get(facility);
  }
}