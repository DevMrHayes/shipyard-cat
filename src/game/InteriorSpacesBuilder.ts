import * as THREE from 'three';

export interface InteriorCollider {
  box: THREE.Box3;
  type: 'floor' | 'wall' | 'workbench';
}

export interface InteriorCollectible {
  id: string;
  name: string;
  type: 'lore' | 'blueprint' | 'tool';
  position: THREE.Vector3;
  rotation?: THREE.Euler;
  mesh: THREE.Object3D;
  description: string;
  facility: 'JMAF' | 'ApprenticeSchool';
}

export class InteriorSpacesBuilder {
  private scene: THREE.Scene;
  private colliders: InteriorCollider[] = [];
  private lights: THREE.Light[] = [];
  private collectibles: InteriorCollectible[] = [];
  private interiorGroup: THREE.Group;

  // Shared reusable materials
  private floorMaterial: THREE.MeshStandardMaterial;
  private ceilingMaterial: THREE.MeshStandardMaterial;
  private wallMaterial: THREE.MeshStandardMaterial;
  private metalTrimMaterial: THREE.MeshStandardMaterial;
  private deskMaterial: THREE.MeshStandardMaterial;
  private terminalScreenMaterial: THREE.MeshBasicMaterial;
  private glowingCollectibleMaterial: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.interiorGroup = new THREE.Group();
    this.interiorGroup.name = 'InteriorSpaces_Root';

    // Materials Initialization
    this.floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x22262b,
      roughness: 0.7,
      metalness: 0.3
    });

    this.ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1c1e,
      roughness: 0.9,
      metalness: 0.1
    });

    this.wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d444d,
      roughness: 0.8,
      metalness: 0.2
    });

    this.metalTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a636e,
      roughness: 0.4,
      metalness: 0.8
    });

    this.deskMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b3138,
      roughness: 0.5,
      metalness: 0.5
    });

    this.terminalScreenMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8
    });

    this.glowingCollectibleMaterial = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xeab308,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.8
    });
  }

  public build(): {
    group: THREE.Group;
    colliders: InteriorCollider[];
    lights: THREE.Light[];
    collectibles: InteriorCollectible[];
  } {
    this.buildJMAFInterior();
    this.buildApprenticeSchoolInterior();

    this.scene.add(this.interiorGroup);

    return {
      group: this.interiorGroup,
      colliders: this.colliders,
      lights: this.lights,
      collectibles: this.collectibles
    };
  }

  /**
   * Joint Manufacturing Assembly Facility (JMAF)
   * Position: X = -52, Z = -5, Base Elevation Y = 0
   * Dimensions: 24m Wide (X), 6m High (Y), 32m Deep (Z)
   */
  private buildJMAFInterior(): void {
    const center = new THREE.Vector3(-52, 0, -5);
    const width = 24;
    const height = 6;
    const depth = 32;

    const jmafGroup = new THREE.Group();
    jmafGroup.name = 'Interior_JMAF';

    // 1. Walkable Floor Platform
    const floorGeo = new THREE.BoxGeometry(width, 0.4, depth);
    const floorMesh = new THREE.Mesh(floorGeo, this.floorMaterial);
    floorMesh.position.set(center.x, center.y + 0.2, center.z);
    floorMesh.receiveShadow = true;
    jmafGroup.add(floorMesh);

    this.registerCollider(floorMesh, 'floor');

    // 2. Ceiling
    const ceilingGeo = new THREE.BoxGeometry(width, 0.4, depth);
    const ceilingMesh = new THREE.Mesh(ceilingGeo, this.ceilingMaterial);
    ceilingMesh.position.set(center.x, center.y + height - 0.2, center.z);
    jmafGroup.add(ceilingMesh);

    // 3. Perimeter Structural Walls (Cutout doorways left logically clear)
    this.createWallSegment(jmafGroup, new THREE.Vector3(center.x, center.y + height / 2, center.z - depth / 2), new THREE.Vector3(width, height, 0.5)); // North
    this.createWallSegment(jmafGroup, new THREE.Vector3(center.x, center.y + height / 2, center.z + depth / 2), new THREE.Vector3(width, height, 0.5)); // South
    this.createWallSegment(jmafGroup, new THREE.Vector3(center.x - width / 2, center.y + height / 2, center.z), new THREE.Vector3(0.5, height, depth)); // West
    this.createWallSegment(jmafGroup, new THREE.Vector3(center.x + width / 2, center.y + height / 2, center.z), new THREE.Vector3(0.5, height, depth)); // East

    // 4. Heavy Overhead Craneways & Overhead Lighting
    const craneGeo = new THREE.BoxGeometry(width - 2, 0.8, 1.2);
    const craneMesh = new THREE.Mesh(craneGeo, this.metalTrimMaterial);
    craneMesh.position.set(center.x, center.y + height - 1.0, center.z);
    jmafGroup.add(craneMesh);

    // Lighting: Industrial Overhead Spotlights
    const lightZOffsets = [-10, 0, 10];
    lightZOffsets.forEach((zOffset, index) => {
      const spotLight = new THREE.SpotLight(0xdff4ff, 45, 20, Math.PI / 3, 0.4, 1.2);
      spotLight.position.set(center.x, center.y + height - 0.8, center.z + zOffset);
      spotLight.target.position.set(center.x, center.y, center.z + zOffset);
      spotLight.castShadow = true;
      spotLight.name = `JMAF_SpotLight_${index}`;

      jmafGroup.add(spotLight);
      jmafGroup.add(spotLight.target);
      this.lights.push(spotLight);

      // Light Fixture Visual
      const fixtureMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 12), this.metalTrimMaterial);
      fixtureMesh.position.copy(spotLight.position);
      jmafGroup.add(fixtureMesh);
    });

    // 5. Heavy Manufacturing Workbenches & Assembly Stanchions
    const benchPositions = [
      new THREE.Vector3(center.x - 7, center.y + 0.4, center.z - 8),
      new THREE.Vector3(center.x - 7, center.y + 0.4, center.z + 8),
      new THREE.Vector3(center.x + 7, center.y + 0.4, center.z - 8),
      new THREE.Vector3(center.x + 7, center.y + 0.4, center.z + 8)
    ];

    benchPositions.forEach((benchPos, idx) => {
      this.createIndustrialWorkbench(jmafGroup, benchPos, idx % 2 === 0 ? 0 : Math.PI);
    });

    // 6. Collectibles: JMAF Propulsion Schematics
    this.createLoreCollectible(
      jmafGroup,
      'collectible_jmaf_propulsion',
      'Classified Submarine Drive Schematics',
      'blueprint',
      new THREE.Vector3(center.x - 7, center.y + 1.45, center.z - 8),
      'Joint Manufacturing Assembly blueprint detailing next-gen propulsor tolerance specifications.',
      'JMAF'
    );

    this.interiorGroup.add(jmafGroup);
  }

  /**
   * The Apprentice School
   * Position: X = -54, Z = -50, Base Elevation Y = 0
   * Dimensions: 20m Wide (X), 5m High (Y), 20m Deep (Z)
   */
  private buildApprenticeSchoolInterior(): void {
    const center = new THREE.Vector3(-54, 0, -50);
    const width = 20;
    const height = 5;
    const depth = 20;

    const schoolGroup = new THREE.Group();
    schoolGroup.name = 'Interior_ApprenticeSchool';

    // 1. Walkable Polished Floor
    const floorGeo = new THREE.BoxGeometry(width, 0.4, depth);
    const floorMesh = new THREE.Mesh(floorGeo, this.floorMaterial);
    floorMesh.position.set(center.x, center.y + 0.2, center.z);
    floorMesh.receiveShadow = true;
    schoolGroup.add(floorMesh);

    this.registerCollider(floorMesh, 'floor');

    // 2. Ceiling
    const ceilingGeo = new THREE.BoxGeometry(width, 0.4, depth);
    const ceilingMesh = new THREE.Mesh(ceilingGeo, this.ceilingMaterial);
    ceilingMesh.position.set(center.x, center.y + height - 0.2, center.z);
    schoolGroup.add(ceilingMesh);

    // 3. Walls
    this.createWallSegment(schoolGroup, new THREE.Vector3(center.x, center.y + height / 2, center.z - depth / 2), new THREE.Vector3(width, height, 0.5)); // North
    this.createWallSegment(schoolGroup, new THREE.Vector3(center.x, center.y + height / 2, center.z + depth / 2), new THREE.Vector3(width, height, 0.5)); // South
    this.createWallSegment(schoolGroup, new THREE.Vector3(center.x - width / 2, center.y + height / 2, center.z), new THREE.Vector3(0.5, height, depth)); // West
    this.createWallSegment(schoolGroup, new THREE.Vector3(center.x + width / 2, center.y + height / 2, center.z), new THREE.Vector3(0.5, height, depth)); // East

    // 4. Class & Drafting Workstations
    const rowOffsets = [-4, 0, 4];
    rowOffsets.forEach((zRow, rowIndex) => {
      const draftingDesk = new THREE.Mesh(new THREE.BoxGeometry(10, 0.9, 1.8), this.deskMaterial);
      draftingDesk.position.set(center.x, center.y + 0.85, center.z + zRow);
      schoolGroup.add(draftingDesk);
      this.registerCollider(draftingDesk, 'workbench');

      // Terminal screen on desk
      const screen = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.1), this.terminalScreenMaterial);
      screen.position.set(center.x + 2, center.y + 1.7, center.z + zRow - 0.5);
      screen.rotation.y = THREE.MathUtils.degToRad(-15);
      schoolGroup.add(screen);
    });

    // 5. Lighting: Warmer Architectural Ambient Fluorescents
    const lightCoords = [
      new THREE.Vector3(center.x - 4, center.y + height - 0.6, center.z - 4),
      new THREE.Vector3(center.x + 4, center.y + height - 0.6, center.z - 4),
      new THREE.Vector3(center.x - 4, center.y + height - 0.6, center.z + 4),
      new THREE.Vector3(center.x + 4, center.y + height - 0.6, center.z + 4)
    ];

    lightCoords.forEach((coord, idx) => {
      const pointLight = new THREE.PointLight(0xfff3e0, 25, 14, 1.4);
      pointLight.position.copy(coord);
      pointLight.castShadow = true;
      pointLight.name = `ApprenticeSchool_Light_${idx}`;

      schoolGroup.add(pointLight);
      this.lights.push(pointLight);

      const panelMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.5), this.metalTrimMaterial);
      panelMesh.position.set(coord.x, coord.y + 0.1, coord.z);
      schoolGroup.add(panelMesh);
    });

    // 6. Collectible: Historic Apprentice Logbook
    this.createLoreCollectible(
      schoolGroup,
      'collectible_apprentice_logbook',
      'Foundry Apprentice Log (1942)',
      'lore',
      new THREE.Vector3(center.x - 2, center.y + 1.4, center.z - 4),
      'A weathered journal containing entries by WWII shipbuilder apprentices studying nuclear lofting.',
      'ApprenticeSchool'
    );

    this.interiorGroup.add(schoolGroup);
  }

  private createWallSegment(parent: THREE.Group, position: THREE.Vector3, dimensions: THREE.Vector3): void {
    const wallGeo = new THREE.BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
    const wallMesh = new THREE.Mesh(wallGeo, this.wallMaterial);
    wallMesh.position.copy(position);
    wallMesh.receiveShadow = true;
    parent.add(wallMesh);
    this.registerCollider(wallMesh, 'wall');
  }

  private createIndustrialWorkbench(parent: THREE.Group, position: THREE.Vector3, rotY: number): void {
    const benchGroup = new THREE.Group();
    benchGroup.position.copy(position);
    benchGroup.rotation.y = rotY;

    // Workbench Top
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.3, 2.0), this.deskMaterial);
    tableTop.position.set(0, 0.9, 0);
    benchGroup.add(tableTop);

    // Workbench Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.9, 0.2);
    const legPositions = [
      [-1.8, 0.45, -0.8],
      [1.8, 0.45, -0.8],
      [-1.8, 0.45, 0.8],
      [1.8, 0.45, 0.8]
    ];

    legPositions.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(legGeo, this.metalTrimMaterial);
      leg.position.set(lx, ly, lz);
      benchGroup.add(leg);
    });

    parent.add(benchGroup);
    this.registerCollider(tableTop, 'workbench');
  }

  private createLoreCollectible(
    parent: THREE.Group,
    id: string,
    name: string,
    type: 'lore' | 'blueprint' | 'tool',
    position: THREE.Vector3,
    description: string,
    facility: 'JMAF' | 'ApprenticeSchool'
  ): void {
    const geo = new THREE.BoxGeometry(0.4, 0.1, 0.5);
    const mesh = new THREE.Mesh(geo, this.glowingCollectibleMaterial);
    mesh.position.copy(position);
    mesh.name = id;

    parent.add(mesh);

    this.collectibles.push({
      id,
      name,
      type,
      position: position.clone(),
      mesh,
      description,
      facility
    });
  }

  private registerCollider(mesh: THREE.Mesh, type: 'floor' | 'wall' | 'workbench'): void {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    this.colliders.push({ box, type });
  }

  public getWalkableBounds(): THREE.Box3[] {
    return this.colliders.filter((c) => c.type === 'floor').map((c) => c.box);
  }

  public getColliders(): InteriorCollider[] {
    return this.colliders;
  }

  public getCollectibles(): InteriorCollectible[] {
    return this.collectibles;
  }

  public getLights(): THREE.Light[] {
    return this.lights;
  }
}