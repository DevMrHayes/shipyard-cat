import * as THREE from 'three';
import { TextureGenerator } from '../core/TextureGenerator';
import { SpatialHashGrid } from '../core/SpatialHashGrid';
import { StylizedWater } from '../graphics/StylizedWater';
import { SeagullFlock } from '../game/SeagullFlock';
import { ToonMaterialFactory } from '../graphics/ToonMaterialFactory';
import { RemoteLogger } from '../core/RemoteLogger';
import { IndustrialExpansion } from './IndustrialExpansion';
import { SubmarineAndFabExpansion } from './SubmarineAndFabExpansion';

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
  public turnstileWorkerLegL: THREE.Object3D | null = null;
  public turnstileWorkerLegR: THREE.Object3D | null = null;
  public turnstileWorkerCycle: number = 0;
  public turnstileSpindleAngle: number = 0;

  constructor() {
    this.group = new THREE.Group();
    this.buildGroundAndWater();
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

    // Build Heavy Steel Fab Super-Shop (North-West Sector) & Dry Dock 2 Virginia-Class Submarine Berth
    const subAndFabExpansion = new SubmarineAndFabExpansion(
      this.platforms,
      (min, max, name) => this.registerObstacle(min, max, name),
      this.foodBowls
    );
    this.group.add(subAndFabExpansion.group);
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
      if (obs.max.y - obs.min.y < 1.5) continue;
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
      return pos.copy(resolved);
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
              if (minPen === penLeft) resolved.x = minX;
              else if (minPen === penRight) resolved.x = maxX;
              else if (minPen === penNear) resolved.z = minZ;
              else resolved.z = maxZ;
            }
          } else {
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
        roughness: 0.88,
        metalness: 0.04,
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
    instancedTiePlates.receiveShadow = true;
    railGroup.add(instancedTiePlates);

    this.group.add(railGroup);

    // 2. INSTANCED CAUTION HAZARD STRIPES
    const hazardTex = TextureGenerator.createHazardStripeTexture();
    const hazardNor = TextureGenerator.createHazardStripeNormalTexture();
    const stripeMat = new THREE.MeshStandardMaterial({
      map: hazardTex,
      normalMap: hazardNor,
      roughness: 0.5,
      metalness: 0.1
    });

    const stripeZPositions: number[] = [];
    for (let z = -80; z <= 80; z += 15) stripeZPositions.push(z);

    const stripeGeo = new THREE.PlaneGeometry(0.8, 10);
    stripeGeo.rotateX(-Math.PI / 2);
    const instancedStripes = new THREE.InstancedMesh(stripeGeo, stripeMat, stripeZPositions.length);
    stripeZPositions.forEach((z, i) => {
      dummyMatrix.setPosition(-10, 0.01, z);
      instancedStripes.setMatrixAt(i, dummyMatrix);
    });
    instancedStripes.instanceMatrix.needsUpdate = true;
    instancedStripes.receiveShadow = true;
    this.group.add(instancedStripes);

    // Pier elevated boardwalk
    const pierWoodTex = TextureGenerator.createPierWoodTexture();
    const pierWoodNor = TextureGenerator.createPierWoodNormalTexture();
    const pierWoodRough = TextureGenerator.createPierWoodRoughnessTexture();
    const pierGeo = new THREE.BoxGeometry(12, 1.4, 280);
    const pierMat = new THREE.MeshStandardMaterial({
      map: pierWoodTex,
      normalMap: pierWoodNor,
      roughnessMap: pierWoodRough,
      roughness: 0.8,
      metalness: 0.1
    });
    const pier = new THREE.Mesh(pierGeo, pierMat);
    pier.position.set(51, 0.7, 0);
    pier.castShadow = true;
    pier.receiveShadow = true;
    this.group.add(pier);

    // 3. INSTANCED PIER PILING POSTS (Saves ~36 WebGL Draw Calls)
    const pilingMat = new THREE.MeshStandardMaterial({ color: 0x271708, roughness: 0.95 });
    const pilingGeo = new THREE.CylinderGeometry(0.35, 0.4, 6.0, 10);
    const pilingPositions: THREE.Vector3[] = [];
    for (let z = -130; z <= 130; z += 15) {
      pilingPositions.push(new THREE.Vector3(46.0, -1.8, z));
      pilingPositions.push(new THREE.Vector3(56.0, -1.8, z));
    }
    const instancedPilings = new THREE.InstancedMesh(pilingGeo, pilingMat, pilingPositions.length);
    pilingPositions.forEach((pos, i) => {
      dummyMatrix.setPosition(pos.x, pos.y, pos.z);
      instancedPilings.setMatrixAt(i, dummyMatrix);
    });
    instancedPilings.instanceMatrix.needsUpdate = true;
    instancedPilings.receiveShadow = true;
    this.group.add(instancedPilings);

    // Stylized James River Water Surface with Gerstner Wave Displacement & Contact Foam
    this.stylizedWater = new StylizedWater(240, 280);
    this.stylizedWater.mesh.position.set(177, 0.85, 0);
    this.jamesRiverWater = this.stylizedWater.mesh;
    this.group.add(this.stylizedWater.mesh);

    // Ambient Maritime Seagull Flock that scatters when Alba sprints
    this.seagullFlock = new SeagullFlock();
    this.group.add(this.seagullFlock.group);

    // Timber Dock Staircases connecting concrete shipyard ground (Y=0.0m) to pier boardwalk (Y=1.4m)
    const stairMat = new THREE.MeshStandardMaterial({
      map: pierWoodTex,
      normalMap: pierWoodNor,
      roughness: 0.8,
      metalness: 0.1
    });
    const stairZPositions = [-100, -60, 20, 60, 100];
    const numDockSteps = 5;
    const stepRise = 1.4 / numDockSteps; // 0.28m rise per step
    const stepRun = (45.0 - 39.5) / numDockSteps; // 1.1m run per step

    for (const rz of stairZPositions) {
      for (let s = 0; s < numDockSteps; s++) {
        const stepH = (s + 1) * stepRise;
        const stepX = 39.5 + (s + 0.5) * stepRun;
        const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(stepRun + 0.1, stepH, 8.0), stairMat);
        stepMesh.position.set(stepX, stepH / 2, rz);
        stepMesh.castShadow = true;
        stepMesh.receiveShadow = true;
        this.group.add(stepMesh);

        this.platforms.push({
          minX: 39.5 + s * stepRun,
          maxX: 39.5 + (s + 1) * stepRun + (s === numDockSteps - 1 ? 0.2 : 0),
          minZ: rz - 4.0,
          maxZ: rz + 4.0,
          height: stepH
        });
      }

      // Sloped Timber Side Stringers, Handrails, and Newel Posts following the stair gradient (Y=0 to 1.4m)
      const railingMat = new THREE.MeshStandardMaterial({ color: 0x3d2618, roughness: 0.85, metalness: 0.1 });
      const slopeRun = 45.0 - 39.5; // 5.5m
      const slopeRise = 1.4;
      const slopeDist = Math.hypot(slopeRun, slopeRise);
      const slopeAngle = Math.atan2(slopeRise, slopeRun);

      const stringerGeo = new THREE.BoxGeometry(slopeDist, 0.24, 0.16);
      const handrailGeo = new THREE.BoxGeometry(slopeDist, 0.08, 0.12);
      const postGeo = new THREE.BoxGeometry(0.14, 1.1, 0.14);

      for (const dz of [-4.15, 4.15]) {
        // Sloped Stringer base
        const stringer = new THREE.Mesh(stringerGeo, railingMat);
        stringer.position.set(42.25, slopeRise / 2 + 0.05, rz + dz);
        stringer.rotation.z = -slopeAngle;
        stringer.castShadow = true;
        this.group.add(stringer);

        // Sloped Handrail
        const handrail = new THREE.Mesh(handrailGeo, railingMat);
        handrail.position.set(42.25, slopeRise / 2 + 0.75, rz + dz);
        handrail.rotation.z = -slopeAngle;
        handrail.castShadow = true;
        this.group.add(handrail);

        // Ground & Boardwalk Newel Posts
        const bottomPost = new THREE.Mesh(postGeo, railingMat);
        bottomPost.position.set(39.5, 0.55, rz + dz);
        bottomPost.castShadow = true;

        const topPost = new THREE.Mesh(postGeo, railingMat);
        topPost.position.set(45.0, 1.4 + 0.45, rz + dz);
        topPost.castShadow = true;

        this.group.add(bottomPost, topPost);
      }

      // Solid side barriers aligned with handrails (Z in [rz - 4.4, rz - 3.8] and [rz + 3.8, rz + 4.4])
      this.registerObstacle(
        new THREE.Vector3(39.0, 0.0, rz - 4.4),
        new THREE.Vector3(45.5, 1.4, rz - 3.8),
        `Boarding Ramp South Barrier (Z=${rz})`
      );
      this.registerObstacle(
        new THREE.Vector3(39.0, 0.0, rz + 3.8),
        new THREE.Vector3(45.5, 1.4, rz + 4.4),
        `Boarding Ramp North Barrier (Z=${rz})`
      );
    }

    // Elevated Pier Boardwalk platform surface
    this.platforms.push({
      minX: 45.0,
      maxX: 57.0,
      minZ: -140.0,
      maxZ: 140.0,
      height: 1.4
    });

    // Register Pier boardwalk solid obstacle walls (X in [45.0, 56.5], Y in [0, 1.35]) along west side leaving open entry gaps where ramps connect (Z in [rz - 4.0, rz + 4.0]) and Dry Dock 1 escape route (Z in [-25.5, -20.5])
    const boardwalkWallSegments: [number, number, string][] = [
      [-140.0, -104.0, 'Pier Boardwalk West Wall (South End)'],
      [-96.0, -64.0, 'Pier Boardwalk West Wall (-96 to -64)'],
      [-56.0, -25.5, 'Pier Boardwalk West Wall (South Section)'],
      [-20.5, 16.0, 'Pier Boardwalk West Wall (-56 to 16)'],
      [24.0, 56.0, 'Pier Boardwalk West Wall (24 to 56)'],
      [64.0, 96.0, 'Pier Boardwalk West Wall (64 to 96)'],
      [104.0, 140.0, 'Pier Boardwalk West Wall (North End)']
    ];

    for (const [minZ, maxZ, segName] of boardwalkWallSegments) {
      this.registerObstacle(
        new THREE.Vector3(45.0, 0.0, minZ),
        new THREE.Vector3(56.5, 1.35, maxZ),
        segName
      );
    }

    // 4. INSTANCED MOORING BOLLARDS
    const bollardMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.88, roughness: 0.3 });
    const bollardGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.8, 12);
    const bollardPositions: THREE.Vector3[] = [];
    for (let z = -120; z <= 120; z += 20) {
      bollardPositions.push(new THREE.Vector3(55.5, 1.8, z));
    }
    // Additional South Yard / Historic Basin bollards
    for (let z = -35; z <= -20; z += 7.5) {
      bollardPositions.push(new THREE.Vector3(13.8, 0.4, z));
    }

    const instancedBollards = new THREE.InstancedMesh(bollardGeo, bollardMat, bollardPositions.length);
    bollardPositions.forEach((pos, i) => {
      dummyMatrix.setPosition(pos.x, pos.y, pos.z);
      instancedBollards.setMatrixAt(i, dummyMatrix);
    });
    instancedBollards.instanceMatrix.needsUpdate = true;
    instancedBollards.castShadow = true;
    instancedBollards.receiveShadow = true;
    this.group.add(instancedBollards);

    // 5. INSTANCED LIGHT STANCHIONS & LAMP HOUSINGS
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.35 });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 7, 8);
    const lampHousingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 });
    const lampHousingGeo = new THREE.BoxGeometry(0.5, 0.25, 0.7);

    const lightPositions = [
      new THREE.Vector3(-12, 0, -8),
      new THREE.Vector3(-30, 0, -25),
      new THREE.Vector3(-12, 0, 15),
      new THREE.Vector3(10, 0, -5),
      new THREE.Vector3(-40, 0, 30),
      new THREE.Vector3(-20, 0, 50),
      new THREE.Vector3(35, 0, -45),
      new THREE.Vector3(48, 1.4, -60),
      new THREE.Vector3(48, 1.4, 60)
    ];

    const instancedPoles = new THREE.InstancedMesh(poleGeo, poleMat, lightPositions.length);
    const instancedHousings = new THREE.InstancedMesh(lampHousingGeo, lampHousingMat, lightPositions.length);

    lightPositions.forEach((pos, i) => {
      dummyMatrix.setPosition(pos.x, pos.y + 3.5, pos.z);
      instancedPoles.setMatrixAt(i, dummyMatrix);

      dummyMatrix.setPosition(pos.x, pos.y + 6.9, pos.z);
      instancedHousings.setMatrixAt(i, dummyMatrix);
    });
    instancedPoles.instanceMatrix.needsUpdate = true;
    instancedPoles.castShadow = true;
    instancedHousings.instanceMatrix.needsUpdate = true;
    instancedHousings.castShadow = true;
    this.group.add(instancedPoles, instancedHousings);
  }

  // 6. INSTANCED INDUSTRIAL BARREL CLUSTERS WITH PARKOUR COLLISION
  private buildInstancedIndustrialBarrels() {
    const barrelGeo = new THREE.CylinderGeometry(0.36, 0.36, 1.05, 14);
    const barrelMat = new THREE.MeshStandardMaterial({
      roughness: 0.45,
      metalness: 0.65
    });

    interface BarrelPlacement {
      x: number;
      y: number;
      z: number;
      color: number;
    }

    const barrelDefs: BarrelPlacement[] = [
      // 1. South Yard Fuel / Dorothy Staging (Maritime Blue & Industrial Red)
      { x: -16.0, y: 0.52, z: -30.0, color: 0x0284c7 },
      { x: -14.8, y: 0.52, z: -30.0, color: 0x0284c7 },
      { x: -15.4, y: 0.52, z: -31.2, color: 0x991b1b },
      { x: -15.4, y: 1.57, z: -30.6, color: 0x0284c7 }, // Stacked top barrel

      // 2. Machine Shop Lathe & Oil Area (Industrial Red & Charcoal)
      { x: -30.0, y: 0.52, z: -10.0, color: 0xdc2626 },
      { x: -31.2, y: 0.52, z: -10.0, color: 0xdc2626 },
      { x: -30.6, y: 0.52, z: -11.2, color: 0x1e293b },
      { x: -30.6, y: 1.57, z: -10.6, color: 0xdc2626 },

      // 3. Waterfront Pier Boardwalk (Safety Amber & Navy on pier deck X in [45, 57])
      { x: 49.0, y: 1.4 + 0.52, z: -10.0, color: 0xf59e0b },
      { x: 50.2, y: 1.4 + 0.52, z: -10.0, color: 0x0284c7 },
      { x: 49.6, y: 1.4 + 0.52, z: -11.2, color: 0x1e293b },

      // 4. Submarine MOF Heavy Hydraulic Drums (Heavy Charcoal & Orange)
      { x: -38.0, y: 0.52, z: 40.0, color: 0x334155 },
      { x: -39.2, y: 0.52, z: 40.0, color: 0xf97316 },
      { x: -38.6, y: 0.52, z: 41.2, color: 0x334155 },
      { x: -38.6, y: 1.57, z: 40.6, color: 0x334155 },

      // 5. RCOH Radiological Vault Scrap Waste (Nuclear Hazard Yellow & Lead Slate)
      { x: 38.0, y: 0.52, z: -48.0, color: 0xeab308 },
      { x: 39.2, y: 0.52, z: -48.0, color: 0xeab308 },
      { x: 38.6, y: 0.52, z: -49.2, color: 0x475569 },
      { x: 40.0, y: 0.52, z: -49.2, color: 0xeab308 },
      { x: 39.2, y: 1.57, z: -48.6, color: 0xeab308 }
    ];

    const instancedBarrels = new THREE.InstancedMesh(barrelGeo, barrelMat, barrelDefs.length);
    const dummyMatrix = new THREE.Matrix4();
    const colorObj = new THREE.Color();

    barrelDefs.forEach((b, i) => {
      dummyMatrix.setPosition(b.x, b.y, b.z);
      instancedBarrels.setMatrixAt(i, dummyMatrix);
      colorObj.setHex(b.color);
      instancedBarrels.setColorAt(i, colorObj);

      // Register platform climbable top surfaces for ground & stacked barrels
      this.platforms.push({
        minX: b.x - 0.42,
        maxX: b.x + 0.42,
        minZ: b.z - 0.42,
        maxZ: b.z + 0.42,
        height: b.y + 0.52
      });
    });

    instancedBarrels.instanceMatrix.needsUpdate = true;
    if (instancedBarrels.instanceColor) instancedBarrels.instanceColor.needsUpdate = true;
    instancedBarrels.castShadow = true;
    instancedBarrels.receiveShadow = true;
    this.group.add(instancedBarrels);

    // Register solid obstacle bounds for barrel clusters
    this.registerObstacle(new THREE.Vector3(-16.8, 0, -32.0), new THREE.Vector3(-14.0, 2.2, -29.2), 'South Yard Drum Cluster');
    this.registerObstacle(new THREE.Vector3(-32.0, 0, -12.0), new THREE.Vector3(-29.2, 2.2, -9.2), 'Machine Shop Drum Cluster');
    this.registerObstacle(new THREE.Vector3(-40.0, 0, 39.2), new THREE.Vector3(-37.2, 2.2, 42.0), 'Submarine Fab Drum Cluster');
    this.registerObstacle(new THREE.Vector3(37.2, 0, -50.0), new THREE.Vector3(40.8, 2.2, -47.2), 'Radiological Waste Drum Cluster');
  }

  private buildHistoricSouthYard() {
    let brickMat: THREE.MeshStandardMaterial;
    if (typeof document !== 'undefined') {
      const brickTex = TextureGenerator.createBrickTexture();
      const brickNor = TextureGenerator.createBrickNormalTexture();
      const brickRough = TextureGenerator.createBrickRoughnessTexture();
      const brickAO = TextureGenerator.createBrickAOTexture();

      brickMat = new THREE.MeshStandardMaterial({
        map: brickTex,
        normalMap: brickNor,
        roughnessMap: brickRough,
        aoMap: brickAO,
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide
      });
    } else {
      brickMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.85, side: THREE.DoubleSide });
    }

    const corrugatedRoofTex = TextureGenerator.createCorrugatedMetalTexture('#334155');
    const corrugatedRoofNor = TextureGenerator.createCorrugatedMetalNormalTexture();
    const roofMat = new THREE.MeshStandardMaterial({
      map: corrugatedRoofTex,
      normalMap: corrugatedRoofNor,
      roughness: 0.65,
      metalness: 0.4,
      side: THREE.DoubleSide
    });

    const interiorFloorMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
      metalness: 0.1
    });

    const shopGroup = new THREE.Group();

    const floorGeo = new THREE.PlaneGeometry(21.6, 35.6);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, interiorFloorMat);
    floor.position.set(-45, 0.02, -20);
    floor.receiveShadow = true;
    shopGroup.add(floor);

    // Primary Brick Walls
    const wallNorth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 16), brickMat);
    wallNorth.position.set(-34, 4, -30);
    wallNorth.castShadow = true;
    wallNorth.receiveShadow = true;
    shopGroup.add(wallNorth);

    const wallSouth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 16), brickMat);
    wallSouth.position.set(-34, 4, -10);
    wallSouth.castShadow = true;
    wallSouth.receiveShadow = true;
    shopGroup.add(wallSouth);

    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 36), brickMat);
    wallBack.position.set(-56, 4, -20);
    wallBack.castShadow = true;
    wallBack.receiveShadow = true;
    shopGroup.add(wallBack);

    const wallEndL = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 0.8), brickMat);
    wallEndL.position.set(-45, 4, -38);
    wallEndL.castShadow = true;
    shopGroup.add(wallEndL);

    const wallEndR = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 0.8), brickMat);
    wallEndR.position.set(-45, 4, -2);
    wallEndR.castShadow = true;
    shopGroup.add(wallEndR);

    // 1. WEATHERED BRICK CORBELING & PARAPET CORNICE
    const corbelMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createBrickTexture(),
      normalMap: TextureGenerator.createBrickNormalTexture(),
      roughness: 0.85,
      metalness: 0.05
    });
    const stoneCopingMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7, metalness: 0.1 });

    // East facade corbeling tiers
    const corbelTier1E = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 36.4), corbelMat);
    corbelTier1E.position.set(-34, 7.8, -20);
    const corbelTier2E = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.25, 36.6), corbelMat);
    corbelTier2E.position.set(-34, 8.05, -20);
    const stoneCopingE = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.16, 36.8), stoneCopingMat);
    stoneCopingE.position.set(-34, 8.25, -20);
    shopGroup.add(corbelTier1E, corbelTier2E, stoneCopingE);

    // Gabled roof corbeling along end walls
    const corbelEndL = new THREE.Mesh(new THREE.BoxGeometry(22.6, 0.25, 1.2), corbelMat);
    corbelEndL.position.set(-45, 8.05, -38);
    const corbelEndR = new THREE.Mesh(new THREE.BoxGeometry(22.6, 0.25, 1.2), corbelMat);
    corbelEndR.position.set(-45, 8.05, -2);
    shopGroup.add(corbelEndL, corbelEndR);

    // Corrugated Gabled Roof
    const ceilingGeo = new THREE.ConeGeometry(18, 5, 4);
    ceilingGeo.rotateY(Math.PI / 4);
    const ceiling = new THREE.Mesh(ceilingGeo, roofMat);
    ceiling.position.set(-45, 10.5, -20);
    ceiling.scale.set(1, 0.8, 1.8);
    ceiling.castShadow = true;
    shopGroup.add(ceiling);

    // 2. DETAILED CORRUGATED ROOF TRUSSES WITH A-FRAME CROSS-BRACING
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.25 });
    const trussZPositions = [-32, -24, -16, -8];

    const instancedTrusses = new THREE.InstancedMesh(new THREE.BoxGeometry(21.4, 0.35, 0.35), trussMat, trussZPositions.length);
    const dummyMatrixTruss = new THREE.Matrix4();

    trussZPositions.forEach((tz, i) => {
      dummyMatrixTruss.setPosition(-45, 7.8, tz);
      instancedTrusses.setMatrixAt(i, dummyMatrixTruss);

      const rafterL = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.28, 0.28), trussMat);
      rafterL.position.set(-45 - 5.3, 7.8 + 1.3, tz);
      rafterL.rotation.z = 0.24;

      const rafterR = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.28, 0.28), trussMat);
      rafterR.position.set(-45 + 5.3, 7.8 + 1.3, tz);
      rafterR.rotation.z = -0.24;

      const kingPost = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), trussMat);
      kingPost.position.set(-45, 7.8 + 1.3, tz);

      const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 0.2), trussMat);
      strutL.position.set(-45 - 4.5, 7.8 + 0.8, tz);
      strutL.rotation.z = -0.4;

      const strutR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 0.2), trussMat);
      strutR.position.set(-45 + 4.5, 7.8 + 0.8, tz);
      strutR.rotation.z = 0.4;

      shopGroup.add(rafterL, rafterR, kingPost, strutL, strutR);
    });

    instancedTrusses.instanceMatrix.needsUpdate = true;
    instancedTrusses.castShadow = true;
    shopGroup.add(instancedTrusses);

    // 3. ARCHED MULTI-PANE INDUSTRIAL WINDOWS WITH WARM AMBER INTERIOR GLOW
    const windowFrameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6, metalness: 0.8 });
    const warmGlassMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.3,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });

    for (let w = 0; w < 3; w++) {
      const winZ = -34 + w * 4;

      const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.6, 3.2), windowFrameMat);
      winFrame.position.set(-34, 5.5, winZ);
      
      const archTopGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.88, 16, 1, false, 0, Math.PI);
      archTopGeo.rotateZ(Math.PI / 2);
      archTopGeo.rotateY(Math.PI / 2);
      const archTop = new THREE.Mesh(archTopGeo, windowFrameMat);
      archTop.position.set(-34, 6.8, winZ);

      const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.3), warmGlassMat);
      winGlass.rotateY(Math.PI / 2);
      winGlass.position.set(-33.54, 5.5, winZ);

      const archGlassGeo = new THREE.CircleGeometry(1.45, 16, 0, Math.PI);
      archGlassGeo.rotateY(Math.PI / 2);
      const archGlass = new THREE.Mesh(archGlassGeo, warmGlassMat);
      archGlass.position.set(-33.54, 6.65, winZ);

      const mullionMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.85 });
      for (let mx = -1.0; mx <= 1.0; mx += 1.0) {
        const vMullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 0.06), mullionMat);
        vMullion.position.set(-33.52, 5.5, winZ + mx);
        shopGroup.add(vMullion);
      }
      for (let my = -0.75; my <= 0.75; my += 0.5) {
        const hMullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 2.9), mullionMat);
        hMullion.position.set(-33.52, 5.5 + my, winZ);
        shopGroup.add(hMullion);
      }

      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 3.5), stoneCopingMat);
      sill.position.set(-34, 4.12, winZ);

      shopGroup.add(winFrame, archTop, winGlass, archGlass, sill);
    }

    // 4. RELIEF SIGNAGE: MACHINE SHOP NO. 1
    if (typeof document !== 'undefined') {
      const signTex = TextureGenerator.createReliefSignTexture(
        'RIGGER DIVISION',
        'MACHINE SHOP NO. 1 - EST. 1886',
        '#0f172a',
        '#f8fafc',
        '#f59e0b'
      );
      const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.35, metalness: 0.6 });
      const signboard = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.3, 8.4), signMat);
      signboard.position.set(-33.35, 6.2, -10);
      signboard.castShadow = true;
      shopGroup.add(signboard);
    }

    // 5. FLANGED EXHAUST CONDUITS & ROOFTOP INDUSTRIAL VENTILATION
    const conduitMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.3 });
    const flangeRingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.2 });

    const exhaustStack = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 11.5, 16), conduitMat);
    exhaustStack.position.set(-33.2, 5.75, -36.5);
    exhaustStack.castShadow = true;

    const rainCap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.45, 16), conduitMat);
    rainCap.position.set(-33.2, 11.75, -36.5);

    [2.0, 5.0, 8.0, 11.2].forEach(fy => {
      const fRing = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16), flangeRingMat);
      fRing.position.set(-33.2, fy, -36.5);
      shopGroup.add(fRing);
    });

    [3.5, 7.5].forEach(by => {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.25), conduitMat);
      bracket.position.set(-33.65, by, -36.5);
      shopGroup.add(bracket);
    });

    [-28, -20, -12].forEach(tz => {
      const ventBase = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.6, 12), conduitMat);
      ventBase.position.set(-45, 11.8, tz);
      const ventSphere = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), conduitMat);
      ventSphere.position.set(-45, 12.2, tz);
      ventSphere.scale.set(1.0, 0.8, 1.0);
      shopGroup.add(ventBase, ventSphere);
    });

    shopGroup.add(exhaustStack, rainCap);

    // Roll-Up Industrial Loading Bay Shutter
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, side: THREE.DoubleSide });
    const shutterTex = TextureGenerator.createCorrugatedMetalTexture('#475569');
    const shutterNor = TextureGenerator.createCorrugatedMetalNormalTexture();
    const shutterMat = new THREE.MeshStandardMaterial({
      map: shutterTex,
      normalMap: shutterNor,
      metalness: 0.8,
      roughness: 0.4
    });

    const doorFrameL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.4), doorFrameMat);
    doorFrameL.position.set(-34, 4, -22);
    const doorFrameR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.4), doorFrameMat);
    doorFrameR.position.set(-34, 4, -18);

    const shutterBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 4.4), shutterMat);
    shutterBox.position.set(-34, 7.1, -20);
    shutterBox.castShadow = true;

    const shutterCurtain = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.5, 3.8), shutterMat);
    shutterCurtain.position.set(-34, 5.2, -20);
    shutterCurtain.castShadow = true;

    shopGroup.add(doorFrameL, doorFrameR, shutterBox, shutterCurtain);

    // 7. INDUSTRIAL YARD PROPS: ACETYLENE/OXYGEN GAS CYLINDER CARTS
    this.buildAcetyleneCart(-32.0, 0.0, -23.5, Math.PI / 4);
    this.buildAcetyleneCart(-17.5, 0.0, -18.0, -Math.PI / 3);

    // 8. INDUSTRIAL YARD PROPS: HEAVY CABLE SPOOLS
    this.buildCableSpool(-26.0, 0.6, -20.0, 0.7);
    this.buildCableSpool(36.0, 0.65, -12.0, 0.8);

    const benchMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });

    const bench1 = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 8.0), benchMat);
    bench1.position.set(-48, 0.6, -30);
    bench1.castShadow = true;
    bench1.receiveShadow = true;
    shopGroup.add(bench1);
    this.platforms.push({ minX: -49.8, maxX: -46.2, minZ: -34.2, maxZ: -25.8, height: 1.2 });
    this.registerObstacle(new THREE.Vector3(-49.8, 0, -34.2), new THREE.Vector3(-46.2, 1.2, -25.8), 'Machine Shop Lathe Bench');

    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.4, 6.0), steelMat);
    cabinet.position.set(-54, 1.2, -15);
    cabinet.castShadow = true;
    shopGroup.add(cabinet);
    this.platforms.push({ minX: -55.2, maxX: -52.8, minZ: -18.2, maxZ: -11.8, height: 2.4 });
    this.registerObstacle(new THREE.Vector3(-55.2, 0, -18.2), new THREE.Vector3(-52.8, 2.4, -11.8), 'Machine Shop Tool Cabinet');

    const conduitBeam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 28), steelMat);
    conduitBeam.position.set(-42, 3.8, -20);
    conduitBeam.castShadow = true;
    shopGroup.add(conduitBeam);
    this.platforms.push({ minX: -42.5, maxX: -41.5, minZ: -34.0, maxZ: -6.0, height: 3.95 });

    // High-Voltage Industrial Step-Down Transformer Unit
    const transformerMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.35 });
    const insulatorMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.4, metalness: 0.1 });
    const transBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 3.0), transformerMat);
    transBody.position.set(-53.5, 1.2, -32.0);
    transBody.castShadow = true;
    transBody.receiveShadow = true;
    shopGroup.add(transBody);

    for (let iz = -1.0; iz <= 1.0; iz += 1.0) {
      const insulator = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 12), insulatorMat);
      insulator.position.set(-53.5, 2.7, -32.0 + iz);
      insulator.castShadow = true;
      shopGroup.add(insulator);
    }

    this.platforms.push({ minX: -54.8, maxX: -52.2, minZ: -33.8, maxZ: -30.2, height: 2.4 });
    this.registerObstacle(new THREE.Vector3(-54.8, 0, -33.8), new THREE.Vector3(-52.2, 2.5, -30.2), 'Machine Shop High-Voltage Transformer');

    // 9. MACHINE SHOP INTERIOR MEZZANINE CATWALK & ACCESS STAIRCASE (ELEVATION Y = 3.5m)
    const gratingMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createIndustrialGratingTexture(),
      normalMap: TextureGenerator.createIndustrialGratingNormalTexture(),
      roughnessMap: TextureGenerator.createIndustrialGratingRoughnessTexture(),
      metalness: 0.85,
      roughness: 0.35,
      transparent: true,
      side: THREE.DoubleSide
    });
    const catwalkYellowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.3 });
    const catwalkColumnMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.25 });
    const steelBeamMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.88, roughness: 0.28 });

    // A. West Catwalk Platform (along West Wall: X in [-55.5, -48.5], Z in [-37.0, -4.0] at Y = 3.4m, top surface Y = 3.5m)
    const westPlatGeo = new THREE.BoxGeometry(7.0, 0.15, 33.0);
    const westPlat = new THREE.Mesh(westPlatGeo, gratingMat);
    westPlat.position.set(-52.0, 3.425, -20.5);
    westPlat.castShadow = true;
    westPlat.receiveShadow = true;
    westPlat.name = 'Machine Shop Mezzanine Catwalk';
    this.mezzanineCatwalk = westPlat;
    shopGroup.add(westPlat);

    const beamW1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 33.0), steelBeamMat);
    beamW1.position.set(-48.6, 3.25, -20.5);
    beamW1.castShadow = true;
    shopGroup.add(beamW1);

    this.platforms.push({ minX: -55.5, maxX: -48.5, minZ: -37.0, maxZ: -4.0, height: 3.5 });

    // B. North Catwalk Platform (along North Wall: X in [-51.5, -34.5], Z in [-37.0, -33.5] at Y = 3.4m, top surface Y = 3.5m)
    const northPlatGeo = new THREE.BoxGeometry(17.0, 0.15, 3.5);
    const northPlat = new THREE.Mesh(northPlatGeo, gratingMat);
    northPlat.position.set(-43.0, 3.425, -35.25);
    northPlat.castShadow = true;
    northPlat.receiveShadow = true;
    shopGroup.add(northPlat);

    const beamN1 = new THREE.Mesh(new THREE.BoxGeometry(17.0, 0.35, 0.2), steelBeamMat);
    beamN1.position.set(-43.0, 3.25, -33.5);
    beamN1.castShadow = true;
    shopGroup.add(beamN1);

    this.platforms.push({ minX: -51.5, maxX: -34.5, minZ: -37.0, maxZ: -33.5, height: 3.5 });

    // C. Structural Support Steel Columns (from Ground Y=0 to Y=3.5m)
    const columnGeo = new THREE.BoxGeometry(0.35, 3.5, 0.35);
    const colPositions = [
      new THREE.Vector3(-48.9, 1.75, -33.0),
      new THREE.Vector3(-48.9, 1.75, -26.0),
      new THREE.Vector3(-48.9, 1.75, -19.0),
      new THREE.Vector3(-48.9, 1.75, -13.0),
      new THREE.Vector3(-43.0, 1.75, -33.5),
      new THREE.Vector3(-35.0, 1.75, -33.5)
    ];

    colPositions.forEach((cp, idx) => {
      const col = new THREE.Mesh(columnGeo, catwalkColumnMat);
      col.position.copy(cp);
      col.castShadow = true;
      col.receiveShadow = true;
      shopGroup.add(col);

      this.registerObstacle(
        new THREE.Vector3(cp.x - 0.3, 0.0, cp.z - 0.3),
        new THREE.Vector3(cp.x + 0.3, 3.5, cp.z + 0.3),
        `Mezzanine Steel Column ${idx + 1}`
      );
    });

    // D. Accessible Steel Staircase (Rising from Ground Y = 0.0m to Mezzanine Y = 3.5m at East side)
    const numSteps = 10;
    const stairZStart = -18.0;
    const stairZEnd = -33.5;
    const stairStepDistZ = (stairZEnd - stairZStart) / numSteps;
    const stairStepRiseY = 3.5 / numSteps;

    const stepMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.3 });
    const treadGeo = new THREE.BoxGeometry(2.8, 0.08, Math.abs(stairStepDistZ) + 0.15);

    for (let s = 0; s < numSteps; s++) {
      const stepH = (s + 1) * stairStepRiseY;
      const stepZ = stairZStart + (s + 0.5) * stairStepDistZ;

      const tread = new THREE.Mesh(treadGeo, gratingMat);
      tread.position.set(-36.2, stepH - 0.04, stepZ);
      tread.castShadow = true;
      tread.receiveShadow = true;

      const riser = new THREE.Mesh(new THREE.BoxGeometry(2.8, stairStepRiseY, 0.05), stepMat);
      riser.position.set(-36.2, stepH - stairStepRiseY / 2, stepZ + stairStepDistZ / 2);

      shopGroup.add(tread, riser);

      this.platforms.push({
        minX: -37.8,
        maxX: -34.6,
        minZ: Math.min(stepZ - 0.8, stepZ + 0.8),
        maxZ: Math.max(stepZ - 0.8, stepZ + 0.8),
        height: stepH
      });
    }

    // Sloped Stair Stringer & Outer Handrail
    const stairDist = Math.hypot(3.5, stairZEnd - stairZStart);
    const stairDir = new THREE.Vector3(0, 3.5, stairZEnd - stairZStart).normalize();

    const stringerGeo = new THREE.BoxGeometry(0.12, 0.35, stairDist);
    const stringer = new THREE.Mesh(stringerGeo, steelBeamMat);
    stringer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), stairDir);
    stringer.position.set(-37.8, 1.75, (stairZStart + stairZEnd) / 2);
    shopGroup.add(stringer);

    const stairRailBar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, stairDist, 8), catwalkYellowMat);
    stairRailBar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), stairDir);
    stairRailBar.position.set(-37.8, 1.75 + 0.9, (stairZStart + stairZEnd) / 2);
    shopGroup.add(stairRailBar);

    // E. Safety Yellow Handrails on Mezzanine Open Edges
    const handrailGeo = new THREE.CylinderGeometry(0.03, 0.03, 22.0, 8);
    handrailGeo.rotateX(Math.PI / 2);
    const topRail = new THREE.Mesh(handrailGeo, catwalkYellowMat);
    topRail.position.set(-48.7, 4.35, -23.0);
    const midRail = new THREE.Mesh(handrailGeo, catwalkYellowMat);
    midRail.position.set(-48.7, 3.9, -23.0);
    const kickplate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 22.0), catwalkYellowMat);
    kickplate.position.set(-48.7, 3.59, -23.0);
    shopGroup.add(topRail, midRail, kickplate);

    const stanchionGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.95, 6);
    for (let rz = -33.5; rz <= -12.5; rz += 3.0) {
      const stan = new THREE.Mesh(stanchionGeo, catwalkYellowMat);
      stan.position.set(-48.7, 3.95, rz);
      shopGroup.add(stan);
    }

    this.registerObstacle(
      new THREE.Vector3(-48.9, 3.5, -34.0),
      new THREE.Vector3(-48.5, 4.5, -12.0),
      'Mezzanine West Handrail Barrier'
    );

    // North Catwalk Inner Railing (along Z = -33.5, X from -48.5 to -34.5)
    const railNLen = 14.0;
    const topRailN = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, railNLen, 8), catwalkYellowMat);
    topRailN.rotateZ(Math.PI / 2);
    topRailN.position.set(-41.5, 4.35, -33.5);

    const midRailN = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, railNLen, 8), catwalkYellowMat);
    midRailN.rotateZ(Math.PI / 2);
    midRailN.position.set(-41.5, 3.9, -33.5);

    const kickplateN = new THREE.Mesh(new THREE.BoxGeometry(railNLen, 0.18, 0.04), catwalkYellowMat);
    kickplateN.position.set(-41.5, 3.59, -33.5);

    shopGroup.add(topRailN, midRailN, kickplateN);

    for (let rx = -48.5; rx <= -34.5; rx += 2.8) {
      const stan = new THREE.Mesh(stanchionGeo, catwalkYellowMat);
      stan.position.set(rx, 3.95, -33.5);
      shopGroup.add(stan);
    }

    this.registerObstacle(
      new THREE.Vector3(-48.5, 3.5, -33.7),
      new THREE.Vector3(-34.5, 4.5, -33.3),
      'Mezzanine North Handrail Barrier'
    );

    // Warm Sodium Interior Overhead Lights spilling glow outside
    const interiorLight1 = new THREE.PointLight(0xffb74d, 3.2, 22);
    interiorLight1.position.set(-45, 6.0, -28);
    const interiorLight2 = new THREE.PointLight(0xffb74d, 3.2, 22);
    interiorLight2.position.set(-45, 6.0, -12);
    shopGroup.add(interiorLight1, interiorLight2);

    this.group.add(shopGroup);

    this.registerObstacle(new THREE.Vector3(-34.5, 0, -38), new THREE.Vector3(-33.5, 14.0, -22), 'Machine Shop - North Wall');
    this.registerObstacle(new THREE.Vector3(-34.5, 0, -18), new THREE.Vector3(-33.5, 14.0, -2), 'Machine Shop - South Wall');
    this.registerObstacle(new THREE.Vector3(-56.5, 0, -38), new THREE.Vector3(-55.5, 14.0, -2), 'Machine Shop - Back Wall');
    this.registerObstacle(new THREE.Vector3(-56, 0, -38.5), new THREE.Vector3(-34, 14.0, -37.5), 'Machine Shop - Left Wall');
    this.registerObstacle(new THREE.Vector3(-56, 0, -2.5), new THREE.Vector3(-34, 14.0, -1.5), 'Machine Shop - Right Wall');

    // Tugboat Dorothy Keel & Structure
    const dorothyGroup = new THREE.Group();
    dorothyGroup.position.set(-20, 0, -25);

    const keelMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
    for (let z = -6; z <= 6; z += 3) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 1.5), keelMat);
      block.position.set(0, 0.4, z);
      dorothyGroup.add(block);
    }

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x992222,
      map: TextureGenerator.createSteelPlateTexture(),
      normalMap: TextureGenerator.createSteelPlateNormalTexture(),
      roughness: 0.7,
      metalness: 0.35
    });
    const hullGeo = new THREE.CapsuleGeometry(2.4, 12, 8, 16);
    hullGeo.rotateX(Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.set(0, 2.2, 0);
    hull.scale.set(0.9, 0.9, 1.0);
    hull.castShadow = true;
    dorothyGroup.add(hull);

    const deckMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createPierWoodTexture(),
      normalMap: TextureGenerator.createPierWoodNormalTexture(),
      roughness: 0.8,
      metalness: 0.1
    });
    const cabinGeo = new THREE.BoxGeometry(2.8, 2.4, 4.5);
    const cabin = new THREE.Mesh(cabinGeo, deckMat);
    cabin.position.set(0, 3.8, 1.2);
    cabin.castShadow = true;
    dorothyGroup.add(cabin);

    const stackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.7 });
    const stackGeo = new THREE.CylinderGeometry(0.55, 0.65, 4.2, 16);
    const stack = new THREE.Mesh(stackGeo, stackMat);
    stack.position.set(0, 5.2, -1.5);
    dorothyGroup.add(stack);

    const brassMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.95, roughness: 0.15 });
    const whistleGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8);
    const whistle = new THREE.Mesh(whistleGeo, brassMat);
    whistle.position.set(0.5, 6.2, -1.2);
    dorothyGroup.add(whistle);

    const gearGeo = new THREE.CylinderGeometry(0.45, 0.55, 0.7, 16);
    this.dorothyCapstanMesh = new THREE.Mesh(gearGeo, brassMat);
    this.dorothyCapstanMesh.position.set(0, 3.2, -4.5);
    this.dorothyCapstanMesh.castShadow = true;
    dorothyGroup.add(this.dorothyCapstanMesh);

    this.group.add(dorothyGroup);

    this.registerObstacle(
      new THREE.Vector3(-22.5, 0, -32.0),
      new THREE.Vector3(-17.5, 2.2, -18.0),
      'Tugboat Dorothy Keel & Hull'
    );
    this.registerObstacle(
      new THREE.Vector3(-21.5, 2.2, -26.5),
      new THREE.Vector3(-18.5, 5.5, -21.0),
      'Tugboat Dorothy Wheelhouse'
    );
  }

  private buildAcetyleneCart(x: number, y: number, z: number, rotationY: number = 0) {
    const cartGroup = new THREE.Group();
    cartGroup.position.set(x, y, z);
    cartGroup.rotation.y = rotationY;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.75, roughness: 0.35 });
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
    const oxygenMat = new THREE.MeshStandardMaterial({ color: 0x15803d, metalness: 0.6, roughness: 0.4 });
    const acetyleneMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, metalness: 0.6, roughness: 0.4 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85, roughness: 0.25 });
    const gaugeTex = TextureGenerator.createGaugeDialTexture('PSI', 0.6);
    const miniGaugeMat = new THREE.MeshStandardMaterial({ map: gaugeTex, metalness: 0.4, roughness: 0.2 });

    const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.45), frameMat);
    basePlate.position.set(0, 0.08, 0.1);
    
    const spineL = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 8), frameMat);
    spineL.position.set(0.28, 0.75, -0.1);
    const spineR = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 8), frameMat);
    spineR.position.set(-0.28, 0.75, -0.1);

    const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), frameMat);
    handleBar.rotateZ(Math.PI / 2);
    handleBar.position.set(0, 1.42, -0.18);

    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8), frameMat);
    axle.rotateZ(Math.PI / 2);
    axle.position.set(0, 0.16, -0.12);

    const wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelL = new THREE.Mesh(wheelGeo, rubberMat);
    wheelL.position.set(0.38, 0.16, -0.12);
    const wheelR = new THREE.Mesh(wheelGeo, rubberMat);
    wheelR.position.set(-0.38, 0.16, -0.12);

    const o2Body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.25, 14), oxygenMat);
    o2Body.position.set(0.15, 0.72, 0.08);
    const o2Dome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), oxygenMat);
    o2Dome.position.set(0.15, 1.34, 0.08);
    const o2Regulator = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), brassMat);
    o2Regulator.position.set(0.15, 1.45, 0.08);
    const o2Gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), miniGaugeMat);
    o2Gauge.rotateX(Math.PI / 2);
    o2Gauge.position.set(0.15, 1.48, 0.13);

    const acBody = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.95, 14), acetyleneMat);
    acBody.position.set(-0.15, 0.58, 0.08);
    const acDome = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), acetyleneMat);
    acDome.position.set(-0.15, 1.05, 0.08);
    const acRegulator = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), brassMat);
    acRegulator.position.set(-0.15, 1.16, 0.08);
    const acGauge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), miniGaugeMat);
    acGauge.rotateX(Math.PI / 2);
    acGauge.position.set(-0.15, 1.19, 0.13);

    const hoseMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.8 });
    const hoseCoil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 8, 16), hoseMat);
    hoseCoil.position.set(0, 0.95, -0.2);

    cartGroup.add(
      basePlate, spineL, spineR, handleBar, axle, wheelL, wheelR,
      o2Body, o2Dome, o2Regulator, o2Gauge,
      acBody, acDome, acRegulator, acGauge, hoseCoil
    );

    this.group.add(cartGroup);

    this.registerObstacle(
      new THREE.Vector3(x - 0.45, y, z - 0.45),
      new THREE.Vector3(x + 0.45, y + 1.55, z + 0.45),
      `Acetylene & Oxygen Gas Cylinder Cart (${x.toFixed(1)}, ${z.toFixed(1)})`
    );
    this.platforms.push({
      minX: x - 0.4,
      maxX: x + 0.4,
      minZ: z - 0.4,
      maxZ: z + 0.4,
      height: y + 1.55
    });
  }

  private buildCableSpool(x: number, y: number, z: number, radius: number = 0.75) {
    const spoolGroup = new THREE.Group();
    spoolGroup.position.set(x, y, z);

    const woodMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createPierWoodTexture(),
      normalMap: TextureGenerator.createPierWoodNormalTexture(),
      roughness: 0.85,
      metalness: 0.05
    });
    const cableMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createSteelPlateTexture(),
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.35
    });
    const tieRodMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.2 });

    const width = 0.9;
    const flangeThickness = 0.08;

    const flangeGeo = new THREE.CylinderGeometry(radius, radius, flangeThickness, 20);
    flangeGeo.rotateZ(Math.PI / 2);
    const flangeL = new THREE.Mesh(flangeGeo, woodMat);
    flangeL.position.x = -width / 2;
    flangeL.castShadow = true;
    flangeL.receiveShadow = true;

    const flangeR = new THREE.Mesh(flangeGeo, woodMat);
    flangeR.position.x = width / 2;
    flangeR.castShadow = true;
    flangeR.receiveShadow = true;

    const drumGeo = new THREE.CylinderGeometry(radius * 0.78, radius * 0.78, width - flangeThickness * 2, 20);
    drumGeo.rotateZ(Math.PI / 2);
    const cableDrum = new THREE.Mesh(drumGeo, cableMat);
    cableDrum.castShadow = true;

    const holeGeo = new THREE.CylinderGeometry(0.12, 0.12, width + 0.02, 12);
    holeGeo.rotateZ(Math.PI / 2);
    const centerHole = new THREE.Mesh(holeGeo, tieRodMat);

    spoolGroup.add(flangeL, flangeR, cableDrum, centerHole);
    this.group.add(spoolGroup);

    this.platforms.push({
      minX: x - radius * 0.9,
      maxX: x + radius * 0.9,
      minZ: z - radius * 0.9,
      maxZ: z + radius * 0.9,
      height: y + radius
    });

    this.registerObstacle(
      new THREE.Vector3(x - radius, 0, z - radius),
      new THREE.Vector3(x + radius, y + radius, z + radius),
      `Industrial Cable Spool (${x.toFixed(1)}, ${z.toFixed(1)})`
    );
  }

  private buildDryDock12AndBigBlue() {
    let graniteMat: THREE.MeshStandardMaterial;
    if (typeof document !== 'undefined') {
      const graniteTex = TextureGenerator.createGraniteStoneTexture();
      const graniteNor = TextureGenerator.createGraniteStoneNormalTexture();
      const graniteRough = TextureGenerator.createGraniteStoneRoughnessTexture();
      const graniteAO = TextureGenerator.createGraniteStoneAOTexture();

      graniteMat = new THREE.MeshStandardMaterial({
        map: graniteTex,
        normalMap: graniteNor,
        roughnessMap: graniteRough,
        aoMap: graniteAO,
        roughness: 0.85,
        metalness: 0.1
      });
    } else {
      graniteMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });
    }

    const basinFloorGeo = new THREE.PlaneGeometry(30, 17);
    basinFloorGeo.rotateX(-Math.PI / 2);
    basinFloorGeo.computeBoundingBox();
    basinFloorGeo.computeBoundingSphere();
    const dd1BasinFloor = new THREE.Mesh(basinFloorGeo, new THREE.MeshStandardMaterial({
      map: TextureGenerator.createWetAsphaltRoughnessTexture(),
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.2,
      side: THREE.DoubleSide
    }));
    dd1BasinFloor.position.set(30, -2.0, -27.5);
    dd1BasinFloor.receiveShadow = true;
    dd1BasinFloor.name = 'Dry Dock 1 Basin Floor';
    this.dd1BasinFloor = dd1BasinFloor;
    this.group.add(dd1BasinFloor);

    // 1. UPGRADED HISTORIC GRANITE ASHLAR STONE BASIN WALLS
    const dd1WallNorth = new THREE.Mesh(new THREE.BoxGeometry(30, 2.2, 1.2), graniteMat);
    dd1WallNorth.position.set(30, -0.9, -35.5);
    dd1WallNorth.receiveShadow = true;

    const dd1WallSouth = new THREE.Mesh(new THREE.BoxGeometry(30, 2.2, 1.2), graniteMat);
    dd1WallSouth.position.set(30, -0.9, -19.5);
    dd1WallSouth.receiveShadow = true;

    const dd1WallWest = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 16.5), graniteMat);
    dd1WallWest.position.set(14.5, -0.9, -27.5);
    dd1WallWest.receiveShadow = true;

    this.group.add(dd1WallNorth, dd1WallSouth, dd1WallWest);

    // 2. STEPPED GRANITE STONE ALTARS WITH ROUNDED COPING EDGES
    const altarNorthUpper = new THREE.Mesh(new THREE.BoxGeometry(29, 0.4, 0.4), graniteMat);
    altarNorthUpper.position.set(29.5, -0.7, -35.1);
    altarNorthUpper.receiveShadow = true;
    altarNorthUpper.castShadow = true;

    const altarSouthUpper = new THREE.Mesh(new THREE.BoxGeometry(29, 0.4, 0.4), graniteMat);
    altarSouthUpper.position.set(29.5, -0.7, -19.9);
    altarSouthUpper.receiveShadow = true;
    altarSouthUpper.castShadow = true;

    const altarNorthLower = new THREE.Mesh(new THREE.BoxGeometry(29, 0.4, 0.4), graniteMat);
    altarNorthLower.position.set(29.5, -1.4, -34.7);
    altarNorthLower.receiveShadow = true;
    altarNorthLower.castShadow = true;

    const altarSouthLower = new THREE.Mesh(new THREE.BoxGeometry(29, 0.4, 0.4), graniteMat);
    altarSouthLower.position.set(29.5, -1.4, -20.3);
    altarSouthLower.receiveShadow = true;
    altarSouthLower.castShadow = true;

    this.group.add(altarNorthUpper, altarSouthUpper, altarNorthLower, altarSouthLower);
    this.platforms.push({ minX: 15.0, maxX: 44.0, minZ: -35.3, maxZ: -34.9, height: -0.5 });
    this.platforms.push({ minX: 15.0, maxX: 44.0, minZ: -20.1, maxZ: -19.7, height: -0.5 });
    this.platforms.push({ minX: 15.0, maxX: 44.0, minZ: -34.9, maxZ: -34.5, height: -1.2 });
    this.platforms.push({ minX: 15.0, maxX: 44.0, minZ: -20.5, maxZ: -20.1, height: -1.2 });

    // 3. CAISSON GATE DETAILING WITH RIVETED STEEL PLATES, HANDRAILS & RUBBER SEALS
    const caissonMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      map: TextureGenerator.createSteelPlateTexture(),
      normalMap: TextureGenerator.createSteelPlateNormalTexture(),
      metalness: 0.75,
      roughness: 0.35
    });
    const caissonGateGroup = new THREE.Group();
    caissonGateGroup.position.set(45.2, -0.1, -27.5);

    const caissonGate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.8, 16), caissonMat);
    caissonGate.castShadow = true;
    caissonGate.receiveShadow = true;
    caissonGateGroup.add(caissonGate);

    const caissonWalkwayMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createSteelPlateTexture(),
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.25
    });
    const walkway = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.15, 16.2), caissonWalkwayMat);
    walkway.position.y = 1.95;
    walkway.castShadow = true;
    caissonGateGroup.add(walkway);

    const railMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.3 });
    const stanchionGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6);
    const topBarGeo = new THREE.CylinderGeometry(0.025, 0.025, 16.2, 6);
    topBarGeo.rotateX(Math.PI / 2);

    const topBarW = new THREE.Mesh(topBarGeo, railMat);
    topBarW.position.set(-0.75, 2.85, 0);
    const topBarE = new THREE.Mesh(topBarGeo, railMat);
    topBarE.position.set(0.75, 2.85, 0);
    caissonGateGroup.add(topBarW, topBarE);

    for (let rz = -7.5; rz <= 7.5; rz += 2.5) {
      const stanW = new THREE.Mesh(stanchionGeo, railMat);
      stanW.position.set(-0.75, 2.45, rz);
      const stanE = new THREE.Mesh(stanchionGeo, railMat);
      stanE.position.set(0.75, 2.45, rz);
      caissonGateGroup.add(stanW, stanE);
    }

    const rubberSealMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.95 });
    const sealN = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.6, 0.3), rubberSealMat);
    sealN.position.set(0, 0, -8.0);
    const sealS = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.6, 0.3), rubberSealMat);
    sealS.position.set(0, 0, 8.0);
    caissonGateGroup.add(sealN, sealS);

    this.group.add(caissonGateGroup);

    this.platforms.push({ minX: 44.3, maxX: 46.1, minZ: -35.6, maxZ: -19.4, height: 1.85 });
    this.registerObstacle(new THREE.Vector3(44.2, -2.0, -36.5), new THREE.Vector3(46.2, 1.8, -35.2), 'Caisson Gate North Rubber Seal');
    this.registerObstacle(new THREE.Vector3(44.2, -2.0, -19.8), new THREE.Vector3(46.2, 1.8, -18.5), 'Caisson Gate South Rubber Seal');

    // 4. TIMBER KEEL BLOCKS WITH STEEL TIE PLATES & WEDGE CHOCKS
    const keelWoodMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createPierWoodTexture(),
      normalMap: TextureGenerator.createPierWoodNormalTexture(),
      roughness: 0.85,
      metalness: 0.05
    });
    const tiePlateMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createSteelPlateTexture(),
      color: 0x475569,
      metalness: 0.9,
      roughness: 0.25
    });

    const keelXPositions = [18, 22, 26, 30, 34, 38];

    const instancedKeelBlocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.44, 4.0), keelWoodMat, keelXPositions.length);
    const instancedTiePlates = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 0.06, 3.8), tiePlateMat, keelXPositions.length);
    const instancedWedges = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.12, 0.8), keelWoodMat, keelXPositions.length * 2);

    const dummyMatrixKeel = new THREE.Matrix4();
    let wedgeIdx = 0;

    keelXPositions.forEach((kx, i) => {
      dummyMatrixKeel.setPosition(kx, -1.75, -27.5);
      instancedKeelBlocks.setMatrixAt(i, dummyMatrixKeel);

      dummyMatrixKeel.setPosition(kx, -1.75 + 0.24, -27.5);
      instancedTiePlates.setMatrixAt(i, dummyMatrixKeel);

      dummyMatrixKeel.setPosition(kx, -1.75 + 0.32, -27.5 - 1.5);
      instancedWedges.setMatrixAt(wedgeIdx++, dummyMatrixKeel);
      dummyMatrixKeel.setPosition(kx, -1.75 + 0.32, -27.5 + 1.5);
      instancedWedges.setMatrixAt(wedgeIdx++, dummyMatrixKeel);

      this.platforms.push({ minX: kx - 0.7, maxX: kx + 0.7, minZ: -29.8, maxZ: -25.2, height: -1.5 });
    });

    instancedKeelBlocks.instanceMatrix.needsUpdate = true;
    instancedKeelBlocks.castShadow = true;
    instancedKeelBlocks.receiveShadow = true;

    instancedTiePlates.instanceMatrix.needsUpdate = true;
    instancedTiePlates.castShadow = true;

    instancedWedges.instanceMatrix.needsUpdate = true;
    instancedWedges.castShadow = true;

    this.group.add(instancedKeelBlocks, instancedTiePlates, instancedWedges);

    const crateMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createPierWoodTexture(),
      roughness: 0.85,
      metalness: 0.1
    });

    // Historic Dry Dock 1 Escape Crate Stack
    const cr1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.4), crateMat);
    cr1.position.set(40.6, -1.7, -22.8);
    cr1.castShadow = true;
    cr1.receiveShadow = true;
    this.group.add(cr1);
    this.platforms.push({ minX: 39.5, maxX: 41.5, minZ: -24.1, maxZ: -21.4, height: -1.4 });

    const cr2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 2.4), crateMat);
    cr2.position.set(42.0, -1.35, -22.8);
    cr2.castShadow = true;
    cr2.receiveShadow = true;
    this.group.add(cr2);
    this.platforms.push({ minX: 41.3, maxX: 42.9, minZ: -24.1, maxZ: -21.4, height: -0.7 });

    const cr3 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 2.4), crateMat);
    cr3.position.set(44.0, -1.0, -22.8);
    cr3.castShadow = true;
    cr3.receiveShadow = true;
    this.group.add(cr3);
    this.platforms.push({ minX: 42.7, maxX: 46.5, minZ: -24.1, maxZ: -21.4, height: 0.0 });

    this.registerObstacle(new THREE.Vector3(14, -3, -36.5), new THREE.Vector3(46, -0.25, -34.5), 'Dry Dock 1 North Wall');
    this.registerObstacle(new THREE.Vector3(14, -3, -20.5), new THREE.Vector3(46, -0.25, -18.5), 'Dry Dock 1 South Wall');
    this.registerObstacle(new THREE.Vector3(13.5, -3, -36), new THREE.Vector3(15.5, -0.25, -19), 'Dry Dock 1 West Wall');
    this.registerObstacle(new THREE.Vector3(44.5, -3, -36), new THREE.Vector3(46.5, 2, -24.6), 'River Caisson Gate (North)');
    this.registerObstacle(new THREE.Vector3(44.5, -3, -21.0), new THREE.Vector3(46.5, 2, -19), 'River Caisson Gate (South)');

    // Dry Dock 12 Solid Sunken Basin Floor (Y = -2.5m, X: 5 to 36, Z: 10 to 80)
    const dd12BasinGeo = new THREE.PlaneGeometry(31.0, 70.0);
    dd12BasinGeo.rotateX(-Math.PI / 2);
    dd12BasinGeo.computeBoundingBox();
    dd12BasinGeo.computeBoundingSphere();
    let dd12BasinMat: THREE.MeshStandardMaterial;
    if (typeof document !== 'undefined') {
      dd12BasinMat = new THREE.MeshStandardMaterial({
        map: TextureGenerator.createGraniteStoneTexture(),
        normalMap: TextureGenerator.createGraniteStoneNormalTexture(),
        roughnessMap: TextureGenerator.createGraniteStoneRoughnessTexture(),
        roughness: 0.85,
        metalness: 0.15,
        side: THREE.DoubleSide
      });
    } else {
      dd12BasinMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.85,
        metalness: 0.15,
        side: THREE.DoubleSide
      });
    }
    const dd12BasinFloor = new THREE.Mesh(dd12BasinGeo, dd12BasinMat);
    dd12BasinFloor.position.set(20.5, -2.5, 45.0);
    dd12BasinFloor.receiveShadow = true;
    dd12BasinFloor.name = 'Dry Dock 12 Basin Floor';
    this.dd12BasinFloor = dd12BasinFloor;
    this.group.add(dd12BasinFloor);

    // Dry Dock 12 Complete Solid Granite/Concrete Basin Side Walls (Y = -2.5m to 0.0m)
    const dd12WallWest = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.5, 70.0), dd12BasinMat);
    dd12WallWest.position.set(4.4, -1.25, 45.0);
    dd12WallWest.receiveShadow = true;

    const dd12WallEast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.5, 70.0), dd12BasinMat);
    dd12WallEast.position.set(36.6, -1.25, 45.0);
    dd12WallEast.receiveShadow = true;

    const dd12WallSouth = new THREE.Mesh(new THREE.BoxGeometry(32.4, 2.5, 1.2), dd12BasinMat);
    dd12WallSouth.position.set(20.5, -1.25, 9.4);
    dd12WallSouth.receiveShadow = true;

    const dd12WallNorth = new THREE.Mesh(new THREE.BoxGeometry(32.4, 2.5, 1.2), dd12BasinMat);
    dd12WallNorth.position.set(20.5, -1.25, 80.6);
    dd12WallNorth.receiveShadow = true;

    this.group.add(dd12WallWest, dd12WallEast, dd12WallSouth, dd12WallNorth);

    // Dry Dock 12 Stepped Crate/Pallet Climbing Stack
    const dd12Cr1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.6), crateMat);
    dd12Cr1.position.set(9.9, -2.2, 16.5);
    dd12Cr1.castShadow = true;
    dd12Cr1.receiveShadow = true;
    this.group.add(dd12Cr1);
    this.platforms.push({ minX: 9.2, maxX: 10.6, minZ: 15.6, maxZ: 17.4, height: -1.9 });

    const dd12Cr2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.6), crateMat);
    dd12Cr2.position.set(8.5, -1.6, 16.5);
    dd12Cr2.castShadow = true;
    dd12Cr2.receiveShadow = true;
    this.group.add(dd12Cr2);
    this.platforms.push({ minX: 7.8, maxX: 9.2, minZ: 15.6, maxZ: 17.4, height: -1.3 });

    const dd12Cr3 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.65, 1.6), crateMat);
    dd12Cr3.position.set(7.1, -0.975, 16.5);
    dd12Cr3.castShadow = true;
    dd12Cr3.receiveShadow = true;
    this.group.add(dd12Cr3);
    this.platforms.push({ minX: 6.4, maxX: 7.8, minZ: 15.6, maxZ: 17.4, height: -0.65 });

    const dd12Cr4 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.65, 1.6), crateMat);
    dd12Cr4.position.set(5.7, -0.325, 16.5);
    dd12Cr4.castShadow = true;
    dd12Cr4.receiveShadow = true;
    this.group.add(dd12Cr4);
    this.platforms.push({ minX: 4.8, maxX: 6.4, minZ: 15.6, maxZ: 17.4, height: 0.0 });

    this.buildDryDock12Perimeter();

    this.registerObstacle(new THREE.Vector3(3.5, -2.5, 25.0), new THREE.Vector3(6.5, 0.5, 42.6), 'CVN Basin West Wall South');
    this.registerObstacle(new THREE.Vector3(3.5, -2.5, 45.4), new THREE.Vector3(6.5, 0.5, 80.0), 'CVN Basin West Wall');
    this.registerObstacle(new THREE.Vector3(33.5, -2.5, 25.0), new THREE.Vector3(36.5, 0.5, 80.0), 'CVN Basin East Wall');

    this.registerObstacle(new THREE.Vector3(12.5, -2.5, 17.0), new THREE.Vector3(28.5, 3.25, 62.0), 'CVN-80 Carrier Hull Module');

    // 5. BIG BLUE CRANE WITH DETAILED LATTICE CROSS-BRACING
    const bigBlueMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      metalness: 0.55,
      roughness: 0.38
    });

    const gantryGroup = new THREE.Group();
    gantryGroup.position.set(20, 0, 52.5);

    const foundationMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.85,
      metalness: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    const runwayPadGeo = new THREE.BoxGeometry(9.5, 0.02, 76.0);
    const westRunwayPad = new THREE.Mesh(runwayPadGeo, foundationMat);
    westRunwayPad.position.set(-22, 0.01, -6.5);
    westRunwayPad.receiveShadow = true;

    const eastRunwayPad = new THREE.Mesh(runwayPadGeo, foundationMat);
    eastRunwayPad.position.set(22, 0.01, -6.5);
    eastRunwayPad.receiveShadow = true;

    gantryGroup.add(westRunwayPad, eastRunwayPad);

    const legGeo = new THREE.BoxGeometry(3.2, 38, 4.0);
    const leftLeg = new THREE.Mesh(legGeo, bigBlueMat);
    leftLeg.position.set(-22, 19, 0);
    const rightLeg = new THREE.Mesh(legGeo, bigBlueMat);
    rightLeg.position.set(22, 19, 0);
    gantryGroup.add(leftLeg, rightLeg);

    const latticeMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.75, roughness: 0.35 });
    const braceGeo = new THREE.BoxGeometry(1.8, 0.35, 3.8);
    const braceYPositions = [6, 12, 18, 24, 30];

    braceYPositions.forEach(ly => {
      const strutL = new THREE.Mesh(braceGeo, latticeMat);
      strutL.position.set(-22, ly, 0);
      const strutR = new THREE.Mesh(braceGeo, latticeMat);
      strutR.position.set(22, ly, 0);
      gantryGroup.add(strutL, strutR);
    });

    const diagGeo = new THREE.BoxGeometry(0.25, 6.8, 0.25);
    for (let i = 0; i < braceYPositions.length - 1; i++) {
      const yMid = (braceYPositions[i] + braceYPositions[i + 1]) / 2;
      
      const diagW1 = new THREE.Mesh(diagGeo, latticeMat);
      diagW1.position.set(-22, yMid, 0);
      diagW1.rotation.z = 0.35;

      const diagW2 = new THREE.Mesh(diagGeo, latticeMat);
      diagW2.position.set(-22, yMid, 0);
      diagW2.rotation.z = -0.35;

      const diagE1 = new THREE.Mesh(diagGeo, latticeMat);
      diagE1.position.set(22, yMid, 0);
      diagE1.rotation.z = 0.35;

      const diagE2 = new THREE.Mesh(diagGeo, latticeMat);
      diagE2.position.set(22, yMid, 0);
      diagE2.rotation.z = -0.35;

      gantryGroup.add(diagW1, diagW2, diagE1, diagE2);
    }

    const bridgeGeo = new THREE.BoxGeometry(50, 4.5, 6.0);
    const bridge = new THREE.Mesh(bridgeGeo, bigBlueMat);
    bridge.position.set(0, 37.5, 0);
    bridge.castShadow = true;
    gantryGroup.add(bridge);

    const strobeMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 1.5 });
    const strobeL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), strobeMat);
    strobeL.position.set(-22, 40.0, 0);
    const strobeR = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), strobeMat);
    strobeR.position.set(22, 40.0, 0);
    gantryGroup.add(strobeL, strobeR);

    this.craneTrolley = new THREE.Group();
    this.craneTrolley.position.set(0, 34.5, 0);

    const hoistBlockGeo = new THREE.BoxGeometry(3.5, 2.0, 3.5);
    const hoistMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.75, roughness: 0.25 });
    const hoistBlock = new THREE.Mesh(hoistBlockGeo, hoistMat);
    this.craneTrolley.add(hoistBlock);

    const cableMat = new THREE.LineBasicMaterial({ color: 0x09090b });
    const cableGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(-1, -18, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, -18, 0)
    ]);
    const cable = new THREE.Line(cableGeo, cableMat);
    this.craneTrolley.add(cable);

    const moduleGeo = new THREE.BoxGeometry(8, 2, 8);
    const moduleMesh = new THREE.Mesh(moduleGeo, new THREE.MeshStandardMaterial({
      map: TextureGenerator.createSteelPlateTexture(),
      metalness: 0.7,
      roughness: 0.35
    }));
    moduleMesh.position.set(0, -18, 0);
    moduleMesh.castShadow = true;
    this.craneTrolley.add(moduleMesh);

    gantryGroup.add(this.craneTrolley);
    this.group.add(gantryGroup);

    this.registerObstacle(new THREE.Vector3(-3.6, 0, 50.5), new THREE.Vector3(-0.4, 38.0, 54.5), 'Big Blue Crane West Leg');
    this.registerObstacle(new THREE.Vector3(40.4, 0, 50.5), new THREE.Vector3(43.6, 38.0, 54.5), 'Big Blue Crane East Leg');
  }

  private buildSubmarineFabShop() {
    const smofGroup = new THREE.Group();
    smofGroup.name = 'Covered_Submarine_Shelter_SMOF_Bldg4677';
    const centerX = -30;
    const centerZ = 45;
    const lengthZ = 44;
    const widthX = 32;
    const wallHeight = 16;
    const roofPeak = 21;

    const claddingMat = new THREE.MeshStandardMaterial({
      color: 0x242d38,
      roughness: 0.65,
      metalness: 0.45
    });
    const trussMat = new THREE.MeshStandardMaterial({
      color: 0x1b222c,
      roughness: 0.5,
      metalness: 0.7
    });
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.32,
      metalness: 0.85
    });
    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.4,
      metalness: 0.5
    });

    const padMat = new THREE.MeshStandardMaterial({
      color: 0x3e4249,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(widthX + 4, 0.02, lengthZ + 4),
      padMat
    );
    pad.position.set(centerX, 0.01, centerZ);
    pad.receiveShadow = true;
    smofGroup.add(pad);

    const westWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, wallHeight, lengthZ), claddingMat);
    westWall.position.set(centerX - widthX / 2, wallHeight / 2, centerZ);
    westWall.castShadow = true;
    westWall.receiveShadow = true;
    smofGroup.add(westWall);
    this.registerObstacle(
      new THREE.Vector3(centerX - widthX / 2 - 0.6, 0, centerZ - lengthZ / 2),
      new THREE.Vector3(centerX - widthX / 2 + 0.6, wallHeight, centerZ + lengthZ / 2),
      'SMOF Bldg 4677 West Wall'
    );

    const eastSegLen = (lengthZ - 12) / 2;
    for (const dir of [-1, 1]) {
      const segZ = centerZ + dir * (lengthZ / 2 - eastSegLen / 2);
      const eastSeg = new THREE.Mesh(new THREE.BoxGeometry(1.2, wallHeight, eastSegLen), claddingMat);
      eastSeg.position.set(centerX + widthX / 2, wallHeight / 2, segZ);
      eastSeg.castShadow = true;
      eastSeg.receiveShadow = true;
      smofGroup.add(eastSeg);
      this.registerObstacle(
        new THREE.Vector3(centerX + widthX / 2 - 0.6, 0, segZ - eastSegLen / 2),
        new THREE.Vector3(centerX + widthX / 2 + 0.6, wallHeight, segZ + eastSegLen / 2),
        `SMOF Bldg 4677 East Wall Seg ${dir}`
      );
    }
    const eastHeader = new THREE.Mesh(new THREE.BoxGeometry(1.2, wallHeight - 8.5, 12), claddingMat);
    eastHeader.position.set(centerX + widthX / 2, 8.5 + (wallHeight - 8.5) / 2, centerZ);
    smofGroup.add(eastHeader);

    for (const dir of [-1, 1]) {
      const wallZ = centerZ + dir * (lengthZ / 2);
      const segW = (widthX - 10) / 2;
      for (const wDir of [-1, 1]) {
        const segX = centerX + wDir * (widthX / 2 - segW / 2);
        const gableSeg = new THREE.Mesh(new THREE.BoxGeometry(segW, wallHeight, 1.2), claddingMat);
        gableSeg.position.set(segX, wallHeight / 2, wallZ);
        gableSeg.castShadow = true;
        gableSeg.receiveShadow = true;
        smofGroup.add(gableSeg);
        this.registerObstacle(
          new THREE.Vector3(segX - segW / 2, 0, wallZ - 0.6),
          new THREE.Vector3(segX + segW / 2, wallHeight, wallZ + 0.6),
          `SMOF Bldg 4677 End Wall ${dir}_${wDir}`
        );
      }
      const gableHeader = new THREE.Mesh(new THREE.BoxGeometry(10, wallHeight - 8.5, 1.2), claddingMat);
      gableHeader.position.set(centerX, 8.5 + (wallHeight - 8.5) / 2, wallZ);
      smofGroup.add(gableHeader);