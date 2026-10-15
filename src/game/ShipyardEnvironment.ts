```typescript
import * as THREE from 'three';
import { TextureGenerator } from '../core/TextureGenerator';
import { SpatialHashGrid } from '../core/SpatialHashGrid';
import { StylizedWater } from '../graphics/StylizedWater';
import { SeagullFlock } from '../game/SeagullFlock';
import { ToonMaterialFactory } from '../graphics/ToonMaterialFactory';
import { RemoteLogger } from '../core/RemoteLogger';
import { IndustrialExpansion } from './IndustrialExpansion';

export interface SolidObstacle {
  min: THREE.Vector3;
  max: THREE.Vector3;
  name: string;
}

export class ShipyardEnvironment {
  public group: THREE.Group;
  public collisionObjects: THREE.Object3D[] = [];
  public balanceBeams: THREE.Box3[] = [];
  public solidObstacles: SolidObstacle[] = [];
  public spatialGrid: SpatialHashGrid = new SpatialHashGrid(8.0);
  public seagullFlock: SeagullFlock | null = null;
  public stylizedWater: StylizedWater | null = null;
  public stylizedWaterDD12: StylizedWater | null = null;
  public dorothyCapstanMesh: THREE.Mesh | null = null;
  public craneTrolley: THREE.Group | null = null;
  public weldingSparkParticles: THREE.Points | null = null;
  public weldingArcLight: THREE.PointLight | null = null;

  // Optimized Fixed Circular Particle Buffer for Ballistic Welding Sparks (Zero Runtime Allocations)
  private static readonly MAX_WELDING_SPARKS: number = 160;
  private sparkPositions: Float32Array = new Float32Array(ShipyardEnvironment.MAX_WELDING_SPARKS * 3);
  private sparkVelocities: Float32Array = new Float32Array(ShipyardEnvironment.MAX_WELDING_SPARKS * 3);
  private sparkColors: Float32Array = new Float32Array(ShipyardEnvironment.MAX_WELDING_SPARKS * 3);
  private sparkLifetimes: Float32Array = new Float32Array(ShipyardEnvironment.MAX_WELDING_SPARKS);
  private sparkMaxLifetimes: Float32Array = new Float32Array(ShipyardEnvironment.MAX_WELDING_SPARKS);
  private sparkEmitIndex: number = 0;
  private sparkEmitTimer: number = 0;

  // Water animation
  public jamesRiverWater: THREE.Mesh | null = null;
  public dryDockWater: THREE.Mesh | null = null;
  public groundMesh: THREE.Mesh | null = null;
  public dd1BasinFloor: THREE.Mesh | null = null;
  public dd12BasinFloor: THREE.Mesh | null = null;
  public mezzanineCatwalk: THREE.Mesh | null = null;
  private waterTime: number = 0;
  private envTime: number = 0;

  // Whiskers Sonar Objective Beacons
  public beaconGroup: THREE.Group | null = null;
  public objectiveBeacon: THREE.Mesh | null = null;
  public beaconDiamond: THREE.Mesh | null = null;
  public beaconRipple: THREE.Mesh | null = null;
  public beaconLight: THREE.PointLight | null = null;

  public platforms: { minX: number; maxX: number; minZ: number; maxZ: number; height: number; isRamp?: boolean; rampStart?: number; rampEnd?: number }[] = [];
  public foodBowls: { position: THREE.Vector3; name: string }[] = [];

  // Perimeter Security Fencing & Gate 4 Turnstiles
  public turnstileSpindles: THREE.Group[] = [];
  public turnstileWorkerMesh: THREE.Group | null = null;
  public turnstileWorkerCycle: number = 0;
  public turnstileSpindleAngle: number = 0;

  constructor() {
    this.group = new THREE.Group();
    this.buildGroundAndWater();
    this.buildGroundSurfaceVariety(); // Moved here to ensure it's built after ground and before other structures
    this.buildHistoricSouthYard();
    this.buildDryDock12AndBigBlue();
    this.buildSubmarineFabShop();
    this.buildJointManufacturingAssemblyFacility();
    this.buildApprenticeSchoolAndAdmin();
    this.buildRadiationVault();
    this.buildCatMotelSanctuary();
    this.buildParkourStructures();
    this.buildInstancedIndustrialBarrels();
    this.buildWeldingSparks();
    this.buildWhiskersBeacons();
    this.buildPerimeterFencingAndSecurityTurnstiles();
    const industrialExpansion = new IndustrialExpansion(this.platforms);
    this.group.add(industrialExpansion.group);
  }

  private registerObstacle(min: THREE.Vector3, max: THREE.Vector3, name: string) {
    const obstacle: SolidObstacle = {
      min: new THREE.Vector3(Math.min(min.x, max.x), Math.min(min.y, max.y), Math.min(min.z, max.z)),
      max: new THREE.Vector3(Math.max(min.x, max.x), Math.max(min.y, max.y), Math.max(min.z, max.z)),
      name
    };
    this.solidObstacles.push(obstacle);

    const center = new THREE.Vector3().addVectors(obstacle.min, obstacle.max).multiplyScalar(0.5);
    const halfSize = new THREE.Vector3().subVectors(obstacle.max, obstacle.min).multiplyScalar(0.5);

    this.spatialGrid.insert({
      id: `${name}_${this.solidObstacles.length}`,
      min: obstacle.min,
      max: obstacle.max,
      center,
      halfSize,
      name
    });
  }

  private static readonly scratchResolved = new THREE.Vector3();

  /**
   * Zero-allocation slab-method raycaster against all static solid obstacles.
   * Returns closest hit distance in [0, maxDist], or null if ray path is clear.
   */
  public raycastObstacles(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number | null {
    let closestT = maxDist;
    let hit = false;
    const invDirX = dir.x !== 0 ? 1.0 / dir.x : 1e9;
    const invDirY = dir.y !== 0 ? 1.0 / dir.y : 1e9;
    const invDirZ = dir.z !== 0 ? 1.0 / dir.z : 1e9;

    const count = this.solidObstacles.length;
    for (let i = 0; i < count; i++) {
      const obs = this.solidObstacles[i];
      let tminX = (obs.min.x - origin.x) * invDirX;
      let tmaxX = (obs.max.x - origin.x) * invDirX;
      if (tminX > tmaxX) { const tmp = tminX; tminX = tmaxX; tmaxX = tmp; }

      let tminY = (obs.min.y - origin.y) * invDirY;
      let tmaxY = (obs.max.y - origin.y) * invDirY;
      if (tminY > tmaxY) { const tmp = tminY; tminY = tmaxY; tmaxY = tmp; }

      if (tminX > tmaxY || tminY > tmaxX) continue;

      const tEnterY = Math.max(tminX, tminY);
      const tExitY = Math.min(tmaxX, tmaxY);

      let tminZ = (obs.min.z - origin.z) * invDirZ;
      let tmaxZ = (obs.max.z - origin.z) * invDirZ;
      if (tminZ > tmaxZ) { const tmp = tminZ; tminZ = tmaxZ; tmaxZ = tmp; }

      if (tEnterY > tmaxZ || tminZ > tExitY) continue;

      const tEnter = Math.max(tEnterY, tminZ);
      const tExit = Math.min(tExitY, tmaxZ);

      if (tExit < 0) continue; // Box is behind ray origin
      const tHit = tEnter >= 0 ? tEnter : tExit;
      if (tHit >= 0 && tHit < closestT) {
        closestT = tHit;
        hit = true;
      }
    }
    return hit ? closestT : null;
  }

  public resolveCollision(pos: THREE.Vector3, radius: number = 0.35, previousPos?: THREE.Vector3): THREE.Vector3 {
    const resolved = ShipyardEnvironment.scratchResolved.copy(pos);

    if (resolved.x > 56.5 - radius) {
      resolved.x = 56.5 - radius;
    }

    resolved.x = Math.max(-104.5 + radius, Math.min(56.5 - radius, resolved.x));
    resolved.z = Math.max(-104.5 + radius, Math.min(104.5 - radius, resolved.z));

    const isInsideDD1 = (resolved.x >= 15.0 && resolved.x <= 44.5 && resolved.z >= -36.0 && resolved.z <= -19.0);
    const isInsideDD12 = (resolved.x >= 5.0 && resolved.x <= 35.0 && resolved.z >= 10.0 && resolved.z <= 80.0);
    if (!isInsideDD1 && !isInsideDD12 && resolved.y < 0.0) {
      resolved.y = 0.0;
    }

    // O(1) Spatial Hash Query for near obstacles
    const obstaclesToTest = this.spatialGrid.queryNear(resolved, radius + 4.0);
    const count = obstaclesToTest.length;
    if (count === 0) {
      return resolved;
    }

    for (let pass = 0; pass < 3; pass++) {
      let collided = false;
      for (let i = 0; i < count; i++) {
        const obs = obstaclesToTest[i];
        
        if (resolved.y < obs.min.y - 0.05 || resolved.y >= obs.max.y - 0.38) continue;

        const minX = obs.min.x - radius;
        const maxX = obs.max.x + radius;
        const minZ = obs.min.z - radius;
        const maxZ = obs.max.z + radius;

        if (previousPos) {
          const prevSafeX = previousPos.x <= minX || previousPos.x >= maxX;
          const prevSafeZ = previousPos.z <= minZ || previousPos.z >= maxZ;

          const crossedX = (previousPos.x <= minX && resolved.x > minX) || (previousPos.x >= maxX && resolved.x < maxX);
          const crossedZ = (previousPos.z <= minZ && resolved.z > minZ) || (previousPos.z >= maxZ && resolved.z < maxZ);

          const inZSpan = (previousPos.z >= minZ && previousPos.z <= maxZ) || (resolved.z >= minZ && resolved.z <= maxZ);
          const inXSpan = (previousPos.x >= minX && previousPos.x <= maxX) || (resolved.x >= minX && resolved.x <= maxX);

          if (crossedX && inZSpan && (!crossedZ || !prevSafeZ)) {
            resolved.x = previousPos.x <= minX ? minX : maxX;
            collided = true;
          } else if (crossedZ && inXSpan && (!crossedX || !prevSafeX)) {
            resolved.z = previousPos.z <= minZ ? minZ : maxZ;
            collided = true;
          } else if (crossedX && crossedZ && inXSpan && inZSpan) {
            resolved.x = previousPos.x <= minX ? minX : maxX;
            resolved.z = previousPos.z <= minZ ? minZ : maxZ;
            collided = true;
          }
        }

        if (resolved.x > minX && resolved.x < maxX && resolved.z > minZ && resolved.z < maxZ) {
          collided = true;

          const penLeft = resolved.x - minX;
          const penRight = maxX - resolved.x;
          const penNear = resolved.z - minZ;
          const penFar = maxZ - resolved.z;
          const minPen = Math.min(penLeft, penRight, penNear, penFar);

          if (minPen > 0.20 && typeof window !== 'undefined') {
            RemoteLogger.logClippingIncident({
              type: 'OBSTACLE_PENETRATION',
              message: `Deep penetration (${minPen.toFixed(2)}m) into '${obs.name || 'Obstacle'}' at (${resolved.x.toFixed(2)}, ${resolved.y.toFixed(2)}, ${resolved.z.toFixed(2)}). Resolved collision.`,
              position: { x: resolved.x, y: resolved.y, z: resolved.z },
              obstacleName: obs.name,
              penetrationDepth: minPen
            });
          }

          if (previousPos) {
            const prevSafeX = previousPos.x <= minX || previousPos.x >= maxX;
            const prevSafeZ = previousPos.z <= minZ || previousPos.z >= maxZ;

            if (prevSafeX && !prevSafeZ) {
              resolved.x = previousPos.x <= minX ? minX : maxX;
            } else if (prevSafeZ && !prevSafeX) {
              resolved.z = previousPos.z <= minZ ? minZ : maxZ;
            } else {
              const minPen = Math.min(penLeft, penRight, penNear, penFar);
              if (minPen === penLeft) resolved.x = minX;
              else if (minPen === penRight) resolved.x = maxX;
              else if (minPen === penNear) resolved.z = minZ;
              else resolved.z = maxZ;
            }
          } else {
            const minPen = Math.min(penLeft, penRight, penNear, penFar);
            if (minPen === penLeft) resolved.x = minX;
            else if (minPen === penRight) resolved.x = maxX;
            else if (minPen === penNear) resolved.z = minZ;
            else resolved.z = maxZ;
          }
        }
      }
      if (!collided) break;
    }

    return pos.copy(resolved);
  }

  private buildWhiskersBeacons() {
    this.beaconGroup = new THREE.Group();
    this.beaconGroup.position.set(-20, 0, -25);

    const beaconGeo = new THREE.CylinderGeometry(0.04, 0.18, 5.0, 12);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide
    });
    this.objectiveBeacon = new THREE.Mesh(beaconGeo, beaconMat);
    this.objectiveBeacon.position.set(0, 2.5, 0);
    this.beaconGroup.add(this.objectiveBeacon);

    const diamondGeo = new THREE.OctahedronGeometry(0.7, 0);
    const diamondMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      wireframe: false
    });
    this.beaconDiamond = new THREE.Mesh(diamondGeo, diamondMat);
    this.beaconDiamond.position.set(0, 3.5, 0);
    this.beaconGroup.add(this.beaconDiamond);

    const ringGeo = new THREE.RingGeometry(0.5, 3.5, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    this.beaconRipple = new THREE.Mesh(ringGeo, ringMat);
    this.beaconRipple.position.set(0, 0.15, 0);
    this.beaconGroup.add(this.beaconRipple);

    this.beaconLight = new THREE.PointLight(0xfacc15, 0, 35);
    this.beaconLight.position.set(0, 6.0, 0);
    this.beaconGroup.add(this.beaconLight);

    this.beaconGroup.visible = false;
    this.group.add(this.beaconGroup);
  }

  public setBeaconPosition(x: number, y: number, z: number) {
    if (this.beaconGroup) {
      this.beaconGroup.position.set(x, y, z);
    }
  }

  public setWhiskersMode(active: boolean) {
    if (this.beaconGroup) this.beaconGroup.visible = active;
    if (this.beaconLight) this.beaconLight.intensity = active ? 3.0 : 0;
  }

  private buildGroundAndWater() {
    let groundMat: THREE.MeshStandardMaterial;
    if (typeof document !== 'undefined') {
      const asphaltDiff = TextureGenerator.createAsphaltTexture();
      const asphaltNor = TextureGenerator.createWetAsphaltNormalTexture();
      const asphaltRough = TextureGenerator.createWetAsphaltRoughnessTexture();
      const asphaltAO = TextureGenerator.createWetAsphaltAOTexture();

      groundMat = new THREE.MeshStandardMaterial({
        map: asphaltDiff,
        normalMap: asphaltNor,
        roughnessMap: asphaltRough,
        aoMap: asphaltAO,
        aoMapIntensity: 0.65,
        roughness: 0.78,
        metalness: 0.15,
        side: THREE.DoubleSide
      });
    } else {
      groundMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.8,
        side: THREE.DoubleSide
      });
    }
    const groundShape = new THREE.Shape();
    // Yard bounds: X in [-140, 51], Z in [-140, 140] (in 2D shape with y = -Z)
    groundShape.moveTo(-140, -140);
    groundShape.lineTo(51, -140);
    groundShape.lineTo(51, 140);
    groundShape.lineTo(-140, 140);
    groundShape.closePath();

    // Open Cutout 1: Historic Dry Dock 1 Basin (X: 14.5 to 45.5, Z: -36.5 to -18.5 -> 2D y: 18.5 to 36.5) [CW winding]
    const holeDD1 = new THREE.Path();
    holeDD1.moveTo(14.5, 18.5);
    holeDD1.lineTo(14.5, 36.5);
    holeDD1.lineTo(45.5, 36.5);
    holeDD1.lineTo(45.5, 18.5);
    holeDD1.closePath();
    groundShape.holes.push(holeDD1);

    // Open Cutout 2: Dry Dock 12 & CVN Basin (X: 5.0 to 36.0, Z: 10.0 to 80.5 -> 2D y: -80.5 to -10.0) [CW winding]
    const holeDD12 = new THREE.Path();
    holeDD12.moveTo(5.0, -80.5);
    holeDD12.lineTo(5.0, -10.0);
    holeDD12.lineTo(36.0, -10.0);
    holeDD12.lineTo(36.0, -80.5);
    holeDD12.closePath();
    groundShape.holes.push(holeDD12);

    const groundGeo = new THREE.ShapeGeometry(groundShape);
    groundGeo.rotateX(-Math.PI / 2);

    // Dynamic UV & UV2 Coordinates for seamless asphalt texture tiling and AO map support
    const posAttr = groundGeo.attributes.position;
    const uvs = new Float32Array(posAttr.count * 2);
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      uvs[i * 2] = (vx + 140) * 0.1;
      uvs[i * 2 + 1] = (vz + 140) * 0.1;
    }
    const uvBuffer = new THREE.BufferAttribute(uvs, 2);
    groundGeo.setAttribute('uv', uvBuffer);
    groundGeo.setAttribute('uv2', uvBuffer.clone());
    groundGeo.computeVertexNormals();
    groundGeo.computeBoundingBox();
    groundGeo.computeBoundingSphere();

    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.position.set(0, 0, 0);
    this.groundMesh.receiveShadow = true;
    this.groundMesh.name = 'Shipyard Ground Mesh';
    this.group.add(this.groundMesh);

    // 1. INSTANCED RAILWAY TIES & STEEL TIE PLATES (Saves ~150 WebGL Draw Calls)
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const tieMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createPierWoodTexture(),
      normalMap: TextureGenerator.createPierWoodNormalTexture(),
      roughness: 0.85,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const tiePlateMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.9,
      roughness: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    const railGroup = new THREE.Group();
    // South Track Segment (Embedded flush grade-level rails on solid shipyard concrete ground)
    const railSouthGeo = new THREE.BoxGeometry(0.12, 0.02, 128);
    const rail1South = new THREE.Mesh(railSouthGeo, railMat);
    rail1South.position.set(8.2, 0.01, -56.0);
    rail1South.receiveShadow = true;
    const rail2South = new THREE.Mesh(railSouthGeo, railMat);
    rail2South.position.set(10.8, 0.01, -56.0);
    rail2South.receiveShadow = true;

    // North Track Segment (Embedded flush grade-level rails on solid north shipyard apron)
    const railNorthGeo = new THREE.BoxGeometry(0.12, 0.02, 38);
    const rail1North = new THREE.Mesh(railNorthGeo, railMat);
    rail1North.position.set(8.2, 0.01, 101.0);
    rail1North.receiveShadow = true;
    const rail2North = new THREE.Mesh(railNorthGeo, railMat);
    rail2North.position.set(10.8, 0.01, 101.0);
    rail2North.receiveShadow = true;

    railGroup.add(rail1South, rail2South, rail1North, rail2North);

    // Track Bumper Stops (Heavy reinforced concrete buffer stops with hazard stripes at Dry Dock 12 perimeter)
    const bumperMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
      metalness: 0.2
    });
    const bumperFaceMat = new THREE.MeshStandardMaterial({
      color: 0xeab308, // Safety yellow warning bumper
      roughness: 0.4,
      metalness: 0.3
    });
    const bumperGeo = new THREE.BoxGeometry(3.6, 0.7, 0.9);
    const bumperSouth = new THREE.Mesh(bumperGeo, bumperMat);
    bumperSouth.position.set(9.5, 0.35, 7.8);
    bumperSouth.castShadow = true;
    bumperSouth.receiveShadow = true;

    const bumperSouthFace = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.1), bumperFaceMat);
    bumperSouthFace.position.set(9.5, 0.35, 8.26);
    railGroup.add(bumperSouth, bumperSouthFace);

    const bumperNorth = new THREE.Mesh(bumperGeo, bumperMat);
    bumperNorth.position.set(9.5, 0.35, 82.2);
    bumperNorth.castShadow = true;
    bumperNorth.receiveShadow = true;

    const bumperNorthFace = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.1), bumperFaceMat);
    bumperNorthFace.position.set(9.5, 0.35, 81.74);
    railGroup.add(bumperNorth, bumperNorthFace);

    this.registerObstacle(new THREE.Vector3(7.5, 0, 7.3), new THREE.Vector3(11.5, 0.8, 8.3), 'Crane Rail Bumper (South DD12)');
    this.registerObstacle(new THREE.Vector3(7.5, 0, 81.7), new THREE.Vector3(11.5, 0.8, 82.7), 'Crane Rail Bumper (North DD12)');

    // Railway ties strictly on solid terrain, excluding the 74m Dry Dock 12 basin span
    const tieZPositions: number[] = [];
    for (let z = -110; z <= 110; z += 3.0) {
      if (z <= 6.5 || z >= 83.5) {
        tieZPositions.push(z);
      }
    }

    const tieGeo = new THREE.BoxGeometry(3.6, 0.015, 0.32);
    const instancedTies = new THREE.InstancedMesh(tieGeo, tieMat, tieZPositions.length);
    const dummyMatrix = new THREE.Matrix4();

    tieZPositions.forEach((z, i) => {
      dummyMatrix.setPosition(9.5, 0.0075, z);
      instancedTies.setMatrixAt(i, dummyMatrix);
    });
    instancedTies.instanceMatrix.needsUpdate = true;
    instancedTies.receiveShadow = true;
    railGroup.add(instancedTies);

    // Track Tie Plates (under each rail at X: 8.2 and X: 10.8 for each solid ground tie)
    const tiePlateGeo = new THREE.BoxGeometry(0.36, 0.015, 0.28);
    const instancedTiePlates = new THREE.InstancedMesh(tiePlateGeo, tiePlateMat, tieZPositions.length * 2);
    let plateIdx = 0;
    tieZPositions.forEach((z) => {
      dummyMatrix.setPosition(8.2, 0.012, z);
      instancedTiePlates.setMatrixAt(plateIdx++, dummyMatrix);
      dummyMatrix.setPosition(10.8, 0.012, z);
      instancedTiePlates.setMatrixAt(plateIdx++, dummyMatrix);
    });
    instancedTiePlates.instanceMatrix.needsUpdate = true;