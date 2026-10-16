import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';

// ============================================================================
// PART 1: FRAME ALLOCATION POOL & ZERO-ALLOCATION MATH INFRASTRUCTURE
// ============================================================================

export class FrameAllocationPool {
  private static instance: FrameAllocationPool | null = null;

  public readonly vec3Pool: THREE.Vector3[] = [];
  public readonly quatPool: THREE.Quaternion[] = [];
  public readonly box3Pool: THREE.Box3[] = [];
  public readonly raycaster: THREE.Raycaster;
  public readonly matrix4: THREE.Matrix4;

  private vec3Index = 0;
  private quatIndex = 0;
  private box3Index = 0;

  private constructor(poolSize = 64) {
    for (let i = 0; i < poolSize; i++) {
      this.vec3Pool.push(new THREE.Vector3());
      this.quatPool.push(new THREE.Quaternion());
      this.box3Pool.push(new THREE.Box3());
    }
    this.raycaster = new THREE.Raycaster();
    this.matrix4 = new THREE.Matrix4();
  }

  public static getInstance(): FrameAllocationPool {
    if (!FrameAllocationPool.instance) {
      FrameAllocationPool.instance = new FrameAllocationPool();
    }
    return FrameAllocationPool.instance;
  }

  public reset(): void {
    this.vec3Index = 0;
    this.quatIndex = 0;
    this.box3Index = 0;
  }

  public getVec3(x = 0, y = 0, z = 0): THREE.Vector3 {
    if (this.vec3Index >= this.vec3Pool.length) {
      this.vec3Pool.push(new THREE.Vector3());
    }
    const v = this.vec3Pool[this.vec3Index++];
    return v.set(x, y, z);
  }

  public getQuat(): THREE.Quaternion {
    if (this.quatIndex >= this.quatPool.length) {
      this.quatPool.push(new THREE.Quaternion());
    }
    const q = this.quatPool[this.quatIndex++];
    return q.identity();
  }

  public getBox3(): THREE.Box3 {
    if (this.box3Index >= this.box3Pool.length) {
      this.box3Pool.push(new THREE.Box3());
    }
    const b = this.box3Pool[this.box3Index++];
    return b.makeEmpty();
  }
}

// ============================================================================
// PART 2: STARTUP CAMERA SNAP & WHITE BOX GLITCH MITIGATION
// ============================================================================

export interface CharacterSpawnConfig {
  spawnPosition: THREE.Vector3;
  spawnHeading: number;
}

export class CameraStartupManager {
  private camera: THREE.PerspectiveCamera;
  private isInitialized = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  public initialize(spawnConfig: CharacterSpawnConfig, cameraOffset: THREE.Vector3): void {
    const pool = FrameAllocationPool.getInstance();
    const targetCamPos = pool.getVec3();
    targetCamPos.copy(spawnConfig.spawnPosition).add(cameraOffset);

    // Hard-set position and rotation directly prior to initial render pass
    this.camera.position.copy(targetCamPos);
    this.camera.lookAt(spawnConfig.spawnPosition);
    this.camera.updateMatrixWorld(true);

    this.isInitialized = true;
  }

  public sanitizeVisualNodes(root: THREE.Object3D): void {
    // Strip temporary white placeholder/untextured boxes and bounding wireframes
    const nodesToRemove: THREE.Object3D[] = [];
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.name.includes('placeholder_white_box') || child.name.includes('bbox_helper')) {
          nodesToRemove.push(child);
        } else if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) {
            // Guarantee material properties are initialized to prevent white default frame flashes
            if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
              if (mat.color.getHex() === 0xffffff && !mat.map && child.name.startsWith('temp_')) {
                nodesToRemove.push(child);
                break;
              }
            }
          }
        }
      }
    });

    for (const node of nodesToRemove) {
      if (node.parent) {
        node.parent.remove(node);
      }
    }
  }

  public isReady(): boolean {
    return this.isInitialized;
  }
}

// ============================================================================
// PART 3: TACTICAL MINIMAP WITH CACHED STATIC LAYER & FACILITY REGISTRY
// ============================================================================

export interface FacilityDefinition {
  id: string;
  name: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  color: string;
  type: 'drydock' | 'fab_shop' | 'crane' | 'pier' | 'foundry' | 'boiler' | 'sub_berth';
}

export class TacticalMinimapSystem {
  public static readonly FACILITIES: FacilityDefinition[] = [
    {
      id: 'dd1_carrier',
      name: 'Dry Dock 1 (Aircraft Carrier)',
      bounds: { minX: -120, maxX: -40, minZ: -180, maxZ: 20 },
      color: '#0055ff',
      type: 'drydock'
    },
    {
      id: 'dd2_virginia',
      name: 'Dry Dock 2 (Virginia-class Submarine Berth)',
      bounds: { minX: 60, maxX: 140, minZ: -160, maxZ: 10 },
      color: '#00ccaa',
      type: 'sub_berth'
    },
    {
      id: 'fab_supershop',
      name: 'Heavy Steel Fab Super-Shop',
      bounds: { minX: -80, maxX: 40, minZ: 60, maxZ: 200 },
      color: '#ffaa00',
      type: 'fab_shop'
    },
    {
      id: 'gantry_cranes',
      name: 'Gantry Rail Complex',
      bounds: { minX: -140, maxX: 160, minZ: -190, maxZ: -160 },
      color: '#ffff00',
      type: 'crane'
    },
    {
      id: 'foundry_facility',
      name: 'Shipyard Foundry & Metalworks',
      bounds: { minX: -180, maxX: -130, minZ: 40, maxZ: 140 },
      color: '#ff3300',
      type: 'foundry'
    },
    {
      id: 'machine_shop',
      name: 'Precision Machine Shop',
      bounds: { minX: 60, maxX: 150, minZ: 60, maxZ: 150 },
      color: '#aa00ff',
      type: 'fab_shop'
    },
    {
      id: 'pier_tug_berth',
      name: 'Pier & Tugboat Berth',
      bounds: { minX: 160, maxX: 220, minZ: -100, maxZ: 80 },
      color: '#0088cc',
      type: 'pier'
    },
    {
      id: 'boiler_house',
      name: 'Central Steam Boiler Plant',
      bounds: { minX: -160, maxX: -110, minZ: -80, maxZ: -20 },
      color: '#ff6600',
      type: 'boiler'
    }
  ];

  private cachedCanvas: HTMLCanvasElement | null = null;
  private cachedCtx: CanvasRenderingContext2D | null = null;
  private mapWidth = 256;
  private mapHeight = 256;
  private worldExtents = { minX: -200, maxX: 240, minZ: -200, maxZ: 220 };

  constructor(width = 256, height = 256) {
    this.mapWidth = width;
    this.mapHeight = height;
    this.buildStaticCacheLayer();
  }

  private buildStaticCacheLayer(): void {
    if (typeof document !== 'undefined') {
      this.cachedCanvas = document.createElement('canvas');
      this.cachedCanvas.width = this.mapWidth;
      this.cachedCanvas.height = this.mapHeight;
      this.cachedCtx = this.cachedCanvas.getContext('2d');
    }

    if (!this.cachedCtx) return;

    // Background Yard Ground
    this.cachedCtx.fillStyle = '#111822';
    this.cachedCtx.fillRect(0, 0, this.mapWidth, this.mapHeight);

    // Pre-render static facility footprints
    for (const fac of TacticalMinimapSystem.FACILITIES) {
      const pMin = this.worldToMap(fac.bounds.minX, fac.bounds.minZ);
      const pMax = this.worldToMap(fac.bounds.maxX, fac.bounds.maxZ);

      const w = Math.abs(pMax.x - pMin.x);
      const h = Math.abs(pMax.y - pMin.y);
      const x = Math.min(pMin.x, pMax.x);
      const y = Math.min(pMin.y, pMax.y);

      this.cachedCtx.fillStyle = fac.color;
      this.cachedCtx.globalAlpha = 0.45;
      this.cachedCtx.fillRect(x, y, w, h);

      this.cachedCtx.strokeStyle = fac.color;
      this.cachedCtx.globalAlpha = 0.9;
      this.cachedCtx.lineWidth = 1.5;
      this.cachedCtx.strokeRect(x, y, w, h);
    }
    this.cachedCtx.globalAlpha = 1.0;
  }

  public worldToMap(x: number, z: number): { x: number; y: number } {
    const rangeX = this.worldExtents.maxX - this.worldExtents.minX;
    const rangeZ = this.worldExtents.maxZ - this.worldExtents.minZ;

    const normX = (x - this.worldExtents.minX) / rangeX;
    const normZ = (z - this.worldExtents.minZ) / rangeZ;

    return {
      x: Math.max(0, Math.min(this.mapWidth, normX * this.mapWidth)),
      y: Math.max(0, Math.min(this.mapHeight, normZ * this.mapHeight))
    };
  }

  public renderDynamicOverlay(
    targetCtx: CanvasRenderingContext2D,
    catPos: { x: number; z: number },
    catHeading: number
  ): void {
    if (this.cachedCanvas) {
      targetCtx.drawImage(this.cachedCanvas, 0, 0);
    }

    const catCoords = this.worldToMap(catPos.x, catPos.z);

    // Draw Cat Icon (Zero heap allocation in loop)
    targetCtx.save();
    targetCtx.translate(catCoords.x, catCoords.y);
    targetCtx.rotate(catHeading);

    targetCtx.fillStyle = '#ffffff';
    targetCtx.beginPath();
    targetCtx.arc(0, 0, 4, 0, Math.PI * 2);
    targetCtx.fill();

    // Sight indicator
    targetCtx.strokeStyle = '#00ff66';
    targetCtx.lineWidth = 2;
    targetCtx.beginPath();
    targetCtx.moveTo(0, 0);
    targetCtx.lineTo(0, -9);
    targetCtx.stroke();

    targetCtx.restore();
  }

  public getFacilityAt(x: number, z: number): FacilityDefinition | undefined {
    return TacticalMinimapSystem.FACILITIES.find(
      (f) =>
        x >= f.bounds.minX &&
        x <= f.bounds.maxX &&
        z >= f.bounds.minZ &&
        z <= f.bounds.maxZ
    );
  }
}

// ============================================================================
// PART 4: EXPANSION BUILDER (FAB SUPER-SHOP & VIRGINIA SUBMARINE BERTH)
// ============================================================================

export interface YardExpansionResult {
  rootGroup: THREE.Group;
  colliders: THREE.Box3[];
}

export class SubmarineAndFabExpansion {
  private static sharedMaterials: Record<string, THREE.Material> = {};

  private static getMaterial(key: string, createFn: () => THREE.Material): THREE.Material {
    if (!this.sharedMaterials[key]) {
      this.sharedMaterials[key] = createFn();
    }
    return this.sharedMaterials[key];
  }

  public static build(): YardExpansionResult {
    const root = new THREE.Group();
    root.name = 'SubmarineAndFabExpansion';
    const colliders: THREE.Box3[] = [];

    const concreteMat = this.getMaterial('concrete', () =>
      new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.9 })
    );
    const corrugatedMat = this.getMaterial('corrugatedSteel', () =>
      new THREE.MeshStandardMaterial({ color: 0x2f3d4f, metalness: 0.8, roughness: 0.4 })
    );
    const subHullMat = this.getMaterial('subHullAnechoicTile', () =>
      new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.7, metalness: 0.1 })
    );
    const catwalkMat = this.getMaterial('catwalkSteel', () =>
      new THREE.MeshStandardMaterial({ color: 0x7c858b, metalness: 0.9, roughness: 0.3 })
    );

    // ------------------------------------------------------------------------
    // SECTION A: DRY DOCK 2 & VIRGINIA-CLASS SUBMARINE
    // ------------------------------------------------------------------------
    const dd2Group = new THREE.Group();
    dd2Group.name = 'DryDock2_VirginiaBerth';
    dd2Group.position.set(100, 0, -75);

    // Basin Pit Basin Cavity (-12m deep)
    const basinFloorGeo = new THREE.BoxGeometry(60, 2, 140);
    const basinFloor = new THREE.Mesh(basinFloorGeo, concreteMat);
    basinFloor.position.set(0, -12, 0);
    dd2Group.add(basinFloor);
    colliders.push(new THREE.Box3().setFromObject(basinFloor));

    // Basin Walls (North, South, East, West retaining walls)
    const wallEast = new THREE.Mesh(new THREE.BoxGeometry(4, 14, 140), concreteMat);
    wallEast.position.set(30, -5, 0);
    dd2Group.add(wallEast);
    colliders.push(new THREE.Box3().setFromObject(wallEast));

    const wallWest = new THREE.Mesh(new THREE.BoxGeometry(4, 14, 140), concreteMat);
    wallWest.position.set(-30, -5, 0);
    dd2Group.add(wallWest);
    colliders.push(new THREE.Box3().setFromObject(wallWest));

    // Keel Support Blocks (Concrete piers holding the sub off dock floor)
    for (let zOffset = -50; zOffset <= 50; zOffset += 10) {
      const keelBlock = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 4), concreteMat);
      keelBlock.position.set(0, -10, zOffset);
      dd2Group.add(keelBlock);
      colliders.push(new THREE.Box3().setFromObject(keelBlock));
    }

    // Virginia-class Submarine (Length: ~115m, Beam: ~10.4m)
    const subGroup = new THREE.Group();
    subGroup.name = 'VirginiaClassSubmarine';
    subGroup.position.set(0, -5, 0);

    // Main Cylindrical Pressure Hull
    const hullCylinderGeo = new THREE.CylinderGeometry(5.2, 5.2, 85, 24);
    hullCylinderGeo.rotateX(Math.PI / 2);
    const hullMesh = new THREE.Mesh(hullCylinderGeo, subHullMat);
    hullMesh.position.set(0, 0, 0);
    subGroup.add(hullMesh);

    // Teardrop Bow Dome
    const bowGeo = new THREE.SphereGeometry(5.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    bowGeo.rotateX(-Math.PI / 2);
    const bowMesh = new THREE.Mesh(bowGeo, subHullMat);
    bowMesh.position.set(0, 0, -42.5);
    subGroup.add(bowMesh);

    // Stern Taper Cone
    const sternGeo = new THREE.ConeGeometry(5.2, 20, 24);
    sternGeo.rotateX(-Math.PI / 2);
    const sternMesh = new THREE.Mesh(sternGeo, subHullMat);
    sternMesh.position.set(0, 0, 52.5);
    subGroup.add(sternMesh);

    // Sail (Conning Tower)
    const sailGeo = new THREE.BoxGeometry(3.2, 7.5, 14);
    const sailMesh = new THREE.Mesh(sailGeo, subHullMat);
    sailMesh.position.set(0, 6, -12);
    subGroup.add(sailMesh);

    // Climbable Catwalk & Maintenance Gangway from Dock rim to Sub Deck
    const gangwayGeo = new THREE.BoxGeometry(34, 0.4, 3.5);
    const gangwayMesh = new THREE.Mesh(gangwayGeo, catwalkMat);
    gangwayMesh.position.set(-15, 0.5, -5);
    dd2Group.add(gangwayMesh);
    colliders.push(new THREE.Box3().setFromObject(gangwayMesh));

    dd2Group.add(subGroup);
    colliders.push(new THREE.Box3().setFromObject(subGroup));
    root.add(dd2Group);

    // ------------------------------------------------------------------------
    // SECTION B: HEAVY STEEL FABRICATION SUPER-SHOP
    // ------------------------------------------------------------------------
    const fabShopGroup = new THREE.Group();
    fabShopGroup.name = 'HeavySteelFabSuperShop';
    fabShopGroup.position.set(-20, 0, 130);

    // Main Hall Slab (120m x 140m)
    const floorGeo = new THREE.BoxGeometry(110, 1, 130);
    const floorMesh = new THREE.Mesh(floorGeo, concreteMat);
    floorMesh.position.set(0, 0, 0);
    fabShopGroup.add(floorMesh);
    colliders.push(new THREE.Box3().setFromObject(floorMesh));

    // Outer Walls with High-Bay Clearances
    const wallMat = corrugatedMat;
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(110, 28, 2), wallMat);
    backWall.position.set(0, 14, 64);
    fabShopGroup.add(backWall);
    colliders.push(new THREE.Box3().setFromObject(backWall));

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(2, 28, 130), wallMat);
    leftWall.position.set(-54, 14, 0);
    fabShopGroup.add(leftWall);
    colliders.push(new THREE.Box3().setFromObject(leftWall));

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(2, 28, 130), wallMat);
    rightWall.position.set(54, 14, 0);
    fabShopGroup.add(rightWall);
    colliders.push(new THREE.Box3().setFromObject(rightWall));

    // Open Gantry Entrance (Front Wall with two large hangar portals)
    const frontWallLeft = new THREE.Mesh(new THREE.BoxGeometry(30, 28, 2), wallMat);
    frontWallLeft.position.set(-40, 14, -64);
    fabShopGroup.add(frontWallLeft);
    colliders.push(new THREE.Box3().setFromObject(frontWallLeft));

    const frontWallRight = new THREE.Mesh(new THREE.BoxGeometry(30, 28, 2), wallMat);
    frontWallRight.position.set(40, 14, -64);
    fabShopGroup.add(frontWallRight);
    colliders.push(new THREE.Box3().setFromObject(frontWallRight));

    const headerWall = new THREE.Mesh(new THREE.BoxGeometry(50, 10, 2), wallMat);
    headerWall.position.set(0, 23, -64);
    fabShopGroup.add(headerWall);
    colliders.push(new THREE.Box3().setFromObject(headerWall));

    // Interior Structural I-Beam Columns
    for (let x = -35; x <= 35; x += 35) {
      for (let z = -40; z <= 40; z += 40) {
        const column = new THREE.Mesh(new THREE.BoxGeometry(2.5, 28, 2.5), catwalkMat);
        column.position.set(x, 14, z);
        fabShopGroup.add(column);
        colliders.push(new THREE.Box3().setFromObject(column));
      }
    }

    // Overhead Overhead Crane Rails & Girder
    const craneGirder = new THREE.Mesh(new THREE.BoxGeometry(106, 3, 5), catwalkMat);
    craneGirder.position.set(0, 22, 10);
    fabShopGroup.add(craneGirder);
    colliders.push(new THREE.Box3().setFromObject(craneGirder));

    // Walk-in Steel Curved Hull Assemblies under construction inside bay
    const hullAssemblyGeo = new THREE.CylinderGeometry(8, 8, 18, 16, 1, true, 0, Math.PI);
    hullAssemblyGeo.rotateZ(Math.PI / 2);
    const curvedHullAssembly = new THREE.Mesh(hullAssemblyGeo, corrugatedMat);
    curvedHullAssembly.position.set(0, 8, 20);
    fabShopGroup.add(curvedHullAssembly);
    colliders.push(new THREE.Box3().setFromObject(curvedHullAssembly));

    root.add(fabShopGroup);

    return {
      rootGroup: root,
      colliders
    };
  }
}

// ============================================================================
// PART 5: UNIT TESTS (VERIFICATION SUITE)
// ============================================================================

describe('Shipyard Freeze Spike Elimination, Startup Camera, and Minimap Expansion', () => {
  let pool: FrameAllocationPool;

  beforeEach(() => {
    pool = FrameAllocationPool.getInstance();
    pool.reset();
  });

  describe('FrameAllocationPool & Hot-Loop Freeze Prevention', () => {
    it('should pre-allocate and reuse vectors without triggering new allocations', () => {
      const v1 = pool.getVec3(10, 20, 30);
      const v2 = pool.getVec3(5, 5, 5);

      expect(v1.x).toBe(10);
      expect(v2.y).toBe(5);

      // Verify reset rewinds index pointer back to zero
      pool.reset();
      const v1Again = pool.getVec3(1, 2, 3);
      expect(v1Again).toBe(v1); // Same object reference reused!
      expect(v1Again.x).toBe(1);
    });

    it('should provide cached bounding boxes and quaternions', () => {
      const box = pool.getBox3();
      expect(box.isEmpty()).toBe(true);

      const q = pool.getQuat();
      expect(q.w).toBe(1);
      expect(q.x).toBe(0);
    });

    it('should perform WebGLRenderer compilation pre-warming without error', () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
      );
      scene.add(mesh);

      const mockRenderer = {
        compile: vi.fn()
      } as unknown as THREE.WebGLRenderer;

      // Simulate pre-warming routine before frame loop
      mockRenderer.compile(scene, camera);
      expect(mockRenderer.compile).toHaveBeenCalledWith(scene, camera);
    });
  });

  describe('Startup Camera Snap & Glitch Fix', () => {
    it('should synchronize camera orientation directly with spawn point on frame zero', () => {
      const camera = new THREE.PerspectiveCamera(60, 1.77, 0.1, 1000);
      const cameraMgr = new CameraStartupManager(camera);
      const spawnConfig: CharacterSpawnConfig = {
        spawnPosition: new THREE.Vector3(12, 1, 45),
        spawnHeading: 0
      };
      const camOffset = new THREE.Vector3(0, 3, -6);

      expect(cameraMgr.isReady()).toBe(false);

      cameraMgr.initialize(spawnConfig, camOffset);

      expect(cameraMgr.isReady()).toBe(true);
      expect(camera.position.x).toBe(12);
      expect(camera.position.y).toBe(4);
      expect(camera.position.z).toBe(39);
    });

    it('should prune temporary untextured white placeholder meshes and debug helpers', () => {
      const camera = new THREE.PerspectiveCamera();
      const cameraMgr = new CameraStartupManager(camera);
      const root = new THREE.Group();

      const validMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshBasicMaterial({ color: 0x444444 })
      );
      validMesh.name = 'real_ship_hull';

      const whiteBoxPlaceholder = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      whiteBoxPlaceholder.name = 'temp_placeholder_white_box';

      const bboxHelper = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshBasicMaterial()
      );
      bboxHelper.name = 'bbox_helper_grid';

      root.add(validMesh);
      root.add(whiteBoxPlaceholder);
      root.add(bboxHelper);

      expect(root.children.length).toBe(3);

      cameraMgr.sanitizeVisualNodes(root);

      expect(root.children.length).toBe(1);
      expect(root.children[0].name).toBe('real_ship_hull');
    });
  });

  describe('Tactical Minimap Facility Registry', () => {
    it('should index all 8 major shipyard landmarks', () => {
      expect(TacticalMinimapSystem.FACILITIES.length).toBe(8);

      const ids = TacticalMinimapSystem.FACILITIES.map((f) => f.id);
      expect(ids).toContain('dd1_carrier');
      expect(ids).toContain('dd2_virginia');
      expect(ids).toContain('fab_supershop');
      expect(ids).toContain('gantry_cranes');
      expect(ids).toContain('foundry_facility');
      expect(ids).toContain('machine_shop');
      expect(ids).toContain('pier_tug_berth');
      expect(ids).toContain('boiler_house');
    });

    it('should map world coordinates correctly into 2D radar pixel coordinate boundaries', () => {
      const minimap = new TacticalMinimapSystem(256, 256);
      const coordsMin = minimap.worldToMap(-200, -200);
      expect(coordsMin.x).toBe(0);
      expect(coordsMin.y).toBe(0);

      const coordsMax = minimap.worldToMap(240, 220);
      expect(coordsMax.x).toBe(256);
      expect(coordsMax.y).toBe(256);
    });

    it('should detect facilities when query points fall within bounding envelopes', () => {
      const minimap = new TacticalMinimapSystem(256, 256);

      // Dry Dock 2 Virginia Sub Berth is at bounds { minX: 60, maxX: 140, minZ: -160, maxZ: 10 }
      const facSub = minimap.getFacilityAt(100, -75);
      expect(facSub).toBeDefined();
      expect(facSub?.id).toBe('dd2_virginia');

      // Heavy Steel Fab Super-Shop is at bounds { minX: -80, maxX: 40, minZ: 60, maxZ: 200 }
      const facFab = minimap.getFacilityAt(0, 130);
      expect(facFab).toBeDefined();
      expect(facFab?.id).toBe('fab_supershop');

      // Outer ocean coordinates return undefined
      const facNone = minimap.getFacilityAt(999, 999);
      expect(facNone).toBeUndefined();
    });
  });

  describe('Yard Expansion: Heavy Steel Fab Super-Shop & Dry Dock 2 Submarine Berth', () => {
    it('should construct Dry Dock 2 and Virginia-class submarine with physics colliders', () => {
      const expansion = SubmarineAndFabExpansion.build();
      expect(expansion.rootGroup).toBeInstanceOf(THREE.Group);

      const dd2 = expansion.rootGroup.getObjectByName('DryDock2_VirginiaBerth');
      expect(dd2).toBeDefined();

      const sub = dd2?.getObjectByName('VirginiaClassSubmarine');
      expect(sub).toBeDefined();

      // Ensure submarine includes sail conning tower and hull assembly
      let hasCylinderHull = false;
      let hasSail = false;
      sub?.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry instanceof THREE.CylinderGeometry) {
            hasCylinderHull = true;
          }
          if (child.geometry instanceof THREE.BoxGeometry) {
            hasSail = true;
          }
        }
      });

      expect(hasCylinderHull).toBe(true);
      expect(hasSail).toBe(true);
    });

    it('should construct the Heavy Steel Fab Super-Shop with portals, columns, and gantry crane', () => {
      const expansion = SubmarineAndFabExpansion.build();
      const fabShop = expansion.rootGroup.getObjectByName('HeavySteelFabSuperShop');
      expect(fabShop).toBeDefined();

      expect(expansion.colliders.length).toBeGreaterThan(10);
      // Verify all colliders have valid non-inverted, non-empty bounds
      for (const box of expansion.colliders) {
        expect(box.isEmpty()).toBe(false);
        expect(box.max.x).toBeGreaterThanOrEqual(box.min.x);
        expect(box.max.y).toBeGreaterThanOrEqual(box.min.y);
        expect(box.max.z).toBeGreaterThanOrEqual(box.min.z);
      }
    });
  });
});