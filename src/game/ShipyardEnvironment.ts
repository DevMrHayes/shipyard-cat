import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TextureGenerator } from '../core/TextureGenerator';

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
  public dorothyCapstanMesh: THREE.Mesh | null = null;
  public craneTrolley: THREE.Group | null = null;
  public weldingSparkParticles: THREE.Points | null = null;
  private sparkPositions: Float32Array = new Float32Array(0);

  // Water animation
  public jamesRiverWater: THREE.Mesh | null = null;
  private waterTime: number = 0;

  // Whiskers Sonar Objective Beacons
  public objectiveBeacon: THREE.Mesh | null = null;
  public beaconLight: THREE.PointLight | null = null;

  constructor() {
    this.group = new THREE.Group();
    this.buildGroundAndWater();
    this.buildHistoricSouthYard();
    this.buildDryDock12AndBigBlue();
    this.buildSubmarineFabShop();
    this.buildRadiationVault();
    this.buildCatMotelSanctuary();
    this.buildParkourStructures();
    this.buildWeldingSparks();
    this.buildWhiskersBeacons();
  }

  private registerObstacle(min: THREE.Vector3, max: THREE.Vector3, name: string) {
    this.solidObstacles.push({ min, max, name });
  }

  // Preallocated scratch vector to eliminate Garbage Collection allocations at 60 FPS
  private static readonly scratchResolved = new THREE.Vector3();

  public resolveCollision(pos: THREE.Vector3, radius: number = 0.3, previousPos?: THREE.Vector3): THREE.Vector3 {
    const resolved = ShipyardEnvironment.scratchResolved.copy(pos);

    // 1. James River waterfront pier outer edge (prevent falling off pier into deep river)
    if (resolved.x > 56.5) {
      resolved.x = 56.5;
    }

    // 2. World bounds
    resolved.x = Math.max(-110, Math.min(110, resolved.x));
    resolved.z = Math.max(-110, Math.min(110, resolved.z));

    // 3. Fast AABB Collision Solver
    const count = this.solidObstacles.length;
    for (let i = 0; i < count; i++) {
      const obs = this.solidObstacles[i];
      if (resolved.y < obs.min.y || resolved.y > obs.max.y) continue;

      const minX = obs.min.x - radius;
      const maxX = obs.max.x + radius;
      const minZ = obs.min.z - radius;
      const maxZ = obs.max.z + radius;

      if (resolved.x >= minX && resolved.x <= maxX && resolved.z >= minZ && resolved.z <= maxZ) {
        if (previousPos) {
          const prevSafeX = previousPos.x < minX || previousPos.x > maxX;
          const prevSafeZ = previousPos.z < minZ || previousPos.z > maxZ;

          if (prevSafeX && !prevSafeZ) {
            resolved.x = previousPos.x < minX ? minX : maxX;
          } else if (prevSafeZ && !prevSafeX) {
            resolved.z = previousPos.z < minZ ? minZ : maxZ;
          } else {
            const dLeft = Math.abs(resolved.x - minX);
            const dRight = Math.abs(maxX - resolved.x);
            const dTop = Math.abs(resolved.z - minZ);
            const dBottom = Math.abs(maxZ - resolved.z);
            const minPen = Math.min(dLeft, dRight, dTop, dBottom);

            if (minPen === dLeft) resolved.x = minX;
            else if (minPen === dRight) resolved.x = maxX;
            else if (minPen === dTop) resolved.z = minZ;
            else resolved.z = maxZ;
          }
        } else {
          const dLeft = Math.abs(resolved.x - minX);
          const dRight = Math.abs(maxX - resolved.x);
          const dTop = Math.abs(resolved.z - minZ);
          const dBottom = Math.abs(maxZ - resolved.z);
          const minPen = Math.min(dLeft, dRight, dTop, dBottom);

          if (minPen === dLeft) resolved.x = minX;
          else if (minPen === dRight) resolved.x = maxX;
          else if (minPen === dTop) resolved.z = minZ;
          else resolved.z = maxZ;
        }
      }
    }

    return pos.copy(resolved);
  }

  private buildWhiskersBeacons() {
    // Golden Sonar Objective Column above Dorothy Tugboat
    const beaconGeo = new THREE.CylinderGeometry(0.8, 0.8, 30, 16);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    this.objectiveBeacon = new THREE.Mesh(beaconGeo, beaconMat);
    this.objectiveBeacon.position.set(-20, 15, -25);
    this.objectiveBeacon.visible = false;
    this.group.add(this.objectiveBeacon);

    this.beaconLight = new THREE.PointLight(0xfacc15, 0, 30);
    this.beaconLight.position.set(-20, 8, -25);
    this.group.add(this.beaconLight);
  }

  public setWhiskersMode(active: boolean) {
    if (this.objectiveBeacon) this.objectiveBeacon.visible = active;
    if (this.beaconLight) this.beaconLight.intensity = active ? 2.5 : 0;
  }

  private buildGroundAndWater() {
    // 1. Asphalt Yard Ground with PBR Texture Maps (Poly Haven 1K)
    let groundMat: THREE.MeshStandardMaterial;
    if (typeof document !== 'undefined') {
      const textureLoader = new THREE.TextureLoader();
      const asphaltDiff = textureLoader.load('/textures/asphalt_diff_1k.jpg');
      const asphaltNor = textureLoader.load('/textures/asphalt_nor_1k.jpg');
      const asphaltRough = textureLoader.load('/textures/asphalt_rough_1k.jpg');
      const asphaltAO = textureLoader.load('/textures/asphalt_ao_1k.jpg');

      [asphaltDiff, asphaltNor, asphaltRough, asphaltAO].forEach(tex => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(16, 24);
      });

      groundMat = new THREE.MeshStandardMaterial({
        map: asphaltDiff,
        normalMap: asphaltNor,
        roughnessMap: asphaltRough,
        aoMap: asphaltAO,
        roughness: 0.8,
        metalness: 0.15
      });
    } else {
      groundMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
    }
    const groundGeo = new THREE.PlaneGeometry(191, 280);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(-44.5, 0, 0); // Centers ground between X=-140 and X=51
    ground.receiveShadow = true;
    this.group.add(ground);

    // Hazard Stripes & Yellow Staging Road Markings
    const hazardTex = TextureGenerator.createHazardStripeTexture();
    const stripeMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.5 });
    for (let z = -80; z <= 80; z += 15) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 10), stripeMat);
      stripe.rotateX(-Math.PI / 2);
      stripe.position.set(-10, 0.01, z);
      this.group.add(stripe);
    }

    // 2. Waterfront Timber Pier & Wooden Mooring Bollards (Walkable elevated platform at X = 51, Y = 1.4)
    const pierWoodTex = TextureGenerator.createPierWoodTexture();
    const pierGeo = new THREE.BoxGeometry(12, 1.4, 280);
    const pierMat = new THREE.MeshStandardMaterial({
      map: pierWoodTex,
      roughness: 0.8,
      metalness: 0.1
    });
    const pier = new THREE.Mesh(pierGeo, pierMat);
    pier.position.set(51, 0.7, 0);
    pier.castShadow = true;
    pier.receiveShadow = true;
    this.group.add(pier);

    // 3. James River Waterfront with realistic ocean wave normal texture & caustics (Visible directly from pier top)
    const waterNormalTex = TextureGenerator.createWaterNormalTexture();
    const waterGeo = new THREE.PlaneGeometry(240, 280, 64, 64);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      map: waterNormalTex,
      roughness: 0.1,
      metalness: 0.8,
      emissive: 0x0369a1,
      emissiveIntensity: 0.25,
      side: THREE.DoubleSide
    });
    this.jamesRiverWater = new THREE.Mesh(waterGeo, waterMat);
    this.jamesRiverWater.position.set(177, 0.85, 0); // Positioned directly beside pier deck (Y=1.4)
    this.jamesRiverWater.receiveShadow = true;
    this.group.add(this.jamesRiverWater);

    // Boarding ramps connecting ground (X=38) to pier deck (X=45)
    const rampMat = new THREE.MeshStandardMaterial({
      map: pierWoodTex,
      roughness: 0.8,
      metalness: 0.1
    });
    for (let z = -100; z <= 100; z += 40) {
      const rampGeo = new THREE.BoxGeometry(7.2, 0.35, 8);
      rampGeo.rotateZ(0.198); // Sloped upward toward +X pier deck
      const ramp = new THREE.Mesh(rampGeo, rampMat);
      ramp.position.set(41.5, 0.7, z);
      ramp.castShadow = true;
      ramp.receiveShadow = true;
      this.group.add(ramp);
    }

    // Register Pier top walking surface as platform (Height 1.4m)
    this.platforms.push({
      minX: 45.0,
      maxX: 57.0,
      minZ: -140.0,
      maxZ: 140.0,
      height: 1.4
    });

    // Mooring Bollards along pier (Optimized Single-Draw-Call InstancedMesh)
    const bollardMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.85 });
    const bollardGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.8, 10);
    const bollardZPositions: number[] = [];
    for (let z = -120; z <= 120; z += 20) bollardZPositions.push(z);

    const instancedBollards = new THREE.InstancedMesh(bollardGeo, bollardMat, bollardZPositions.length);
    const dummyMatrix = new THREE.Matrix4();
    bollardZPositions.forEach((z, i) => {
      dummyMatrix.setPosition(55.5, 1.8, z);
      instancedBollards.setMatrixAt(i, dummyMatrix);
    });
    instancedBollards.instanceMatrix.needsUpdate = true;
    instancedBollards.castShadow = true;
    this.group.add(instancedBollards);

    // Shipyard Light Posts (Optimized InstancedMesh)
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 7, 8);
    const lightPositions = [
      new THREE.Vector3(-12, 0, -8),
      new THREE.Vector3(-30, 0, -25),
      new THREE.Vector3(-12, 0, 15),
      new THREE.Vector3(10, 0, -5)
    ];

    const instancedPoles = new THREE.InstancedMesh(poleGeo, poleMat, lightPositions.length);
    lightPositions.forEach((pos, i) => {
      dummyMatrix.setPosition(pos.x, 3.5, pos.z);
      instancedPoles.setMatrixAt(i, dummyMatrix);
    });
    instancedPoles.instanceMatrix.needsUpdate = true;
    instancedPoles.castShadow = true;
    this.group.add(instancedPoles);
  }

  private buildHistoricSouthYard() {
    // Red Brick Machine Shop No. 1 with PBR Texture Maps (Poly Haven)
    let brickMat: THREE.MeshStandardMaterial;
    if (typeof document !== 'undefined') {
      const textureLoader = new THREE.TextureLoader();
      const brickTex = TextureGenerator.createBrickTexture();
      const brickNor = textureLoader.load('/textures/brick_nor_1k.jpg');
      const brickRough = textureLoader.load('/textures/brick_rough_1k.jpg');

      [brickNor, brickRough].forEach(tex => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 3);
      });

      brickMat = new THREE.MeshStandardMaterial({
        map: brickTex,
        normalMap: brickNor,
        roughnessMap: brickRough,
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide
      });
    } else {
      brickMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.85, side: THREE.DoubleSide });
    }
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x1f2421,
      roughness: 0.7,
      side: THREE.DoubleSide
    });
    const interiorFloorMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
      metalness: 0.1
    });

    const shopGroup = new THREE.Group();

    // 1. Interior Concrete Floor
    const floorGeo = new THREE.PlaneGeometry(21.6, 35.6);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, interiorFloorMat);
    floor.position.set(-45, 0.02, -20);
    floor.receiveShadow = true;
    shopGroup.add(floor);

    // 2. North Wall (-38 to -22 in Z)
    const wallNorth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 16), brickMat);
    wallNorth.position.set(-34, 4, -30);
    wallNorth.castShadow = true;
    wallNorth.receiveShadow = true;
    shopGroup.add(wallNorth);

    // 3. South Wall (-18 to -2 in Z)
    const wallSouth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 16), brickMat);
    wallSouth.position.set(-34, 4, -10);
    wallSouth.castShadow = true;
    wallSouth.receiveShadow = true;
    shopGroup.add(wallSouth);

    // 3D Historic Industrial Green Shipyard Door (Doorway Entry at X = -34, Z = -20)
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const doorLoader = new GLTFLoader();
      doorLoader.load('/models/gdansk_shipyard_green_door.glb', (gltf) => {
        const door = gltf.scene;
        door.scale.set(0.015, 0.015, 0.015);
        door.position.set(-34.0, 0, -20);
        door.rotation.y = Math.PI / 2;

        door.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        shopGroup.add(door);
      });
    }

    // 4. Back Bulkhead Wall (X = -56)
    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 36), brickMat);
    wallBack.position.set(-56, 4, -20);
    wallBack.castShadow = true;
    wallBack.receiveShadow = true;
    shopGroup.add(wallBack);

    // 5. Left End Wall (Z = -38) & Right End Wall (Z = -2)
    const wallEndL = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 0.8), brickMat);
    wallEndL.position.set(-45, 4, -38);
    wallEndL.castShadow = true;
    shopGroup.add(wallEndL);

    const wallEndR = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 0.8), brickMat);
    wallEndR.position.set(-45, 4, -2);
    wallEndR.castShadow = true;
    shopGroup.add(wallEndR);

    // 6. Overhead Pitched Ceiling
    const ceilingGeo = new THREE.ConeGeometry(18, 5, 4);
    ceilingGeo.rotateY(Math.PI / 4);
    const ceiling = new THREE.Mesh(ceilingGeo, roofMat);
    ceiling.position.set(-45, 10.5, -20);
    ceiling.scale.set(1, 0.8, 1.8);
    shopGroup.add(ceiling);

    // 7. Industrial Multi-Pane Windows on Brick Facade
    const windowFrameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
    const windowGlassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, transparent: true, opacity: 0.65 });
    for (let w = 0; w < 3; w++) {
      const winZ = -34 + w * 4;
      const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.5, 3.0), windowFrameMat);
      winFrame.position.set(-34, 5.5, winZ);
      const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.3), windowGlassMat);
      winGlass.rotateY(Math.PI / 2);
      winGlass.position.set(-33.5, 5.5, winZ);
      shopGroup.add(winFrame, winGlass);
    }

    // 8. RIGGER DIVISION Cast-Iron Enamel Signboard
    if (typeof document !== 'undefined') {
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 512;
      signCanvas.height = 128;
      const sCtx = signCanvas.getContext('2d')!;
      sCtx.fillStyle = '#f8fafc';
      sCtx.fillRect(0, 0, 512, 128);
      sCtx.lineWidth = 12;
      sCtx.strokeStyle = '#1e293b';
      sCtx.strokeRect(6, 6, 500, 116);
      sCtx.font = '900 48px "Courier New", monospace';
      sCtx.fillStyle = '#0f172a';
      sCtx.textAlign = 'center';
      sCtx.fillText('RIGGER DIVISION', 256, 78);

      const signTex = new THREE.CanvasTexture(signCanvas);
      const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4 });
      const signboard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.0, 7.5), signMat);
      signboard.position.set(-33.4, 6.2, -10);
      shopGroup.add(signboard);
    }

    // 9. Clean Industrial Roll-Up Doorway Frame (Open archway for Alba)
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, side: THREE.DoubleSide });
    const shutterMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.4 });

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

    // 10. HEAVILY-WEATHERED RUSTED INDUSTRIAL FUEL PRESSURE VESSEL (Image 1 Parity)
    const tankGroup = new THREE.Group();
    tankGroup.position.set(-18, 0, -8);

    // Weathered Red-Orange Vessel Shell
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b, // Oxidized red-orange industrial tank
      metalness: 0.65,
      roughness: 0.55
    });
    const tankGeo = new THREE.CylinderGeometry(1.8, 1.8, 10, 24);
    tankGeo.rotateZ(Math.PI / 2);
    const tankMesh = new THREE.Mesh(tankGeo, tankMat);
    tankMesh.position.set(0, 2.4, 0);
    tankMesh.castShadow = true;
    tankMesh.receiveShadow = true;

    // Domed Ends
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, metalness: 0.6, roughness: 0.6 });
    const domeL = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 16), domeMat);
    domeL.position.set(-5, 2.4, 0);
    domeL.scale.set(0.5, 1, 1);
    domeL.castShadow = true;

    const domeR = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 16), domeMat);
    domeR.position.set(5, 2.4, 0);
    domeR.scale.set(0.5, 1, 1);
    domeR.castShadow = true;

    // Concrete Saddle Support Piers
    const saddleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 });
    const saddle1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 4.0), saddleMat);
    saddle1.position.set(-3, 0.7, 0);
    saddle1.castShadow = true;
    const saddle2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 4.0), saddleMat);
    saddle2.position.set(3, 0.7, 0);
    saddle2.castShadow = true;

    // Valves, Gauges & Pipe Manifold
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
    const valveMat = new THREE.MeshStandardMaterial({ color: 0xdc2626 });
    const gaugeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc });

    const pipeOut = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.5, 12), pipeMat);
    pipeOut.position.set(-5.3, 1.2, 0.8);
    const handwheel = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 8, 16), valveMat);
    handwheel.position.set(-5.3, 2.2, 0.8);
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), gaugeMat);
    gauge.rotateX(Math.PI / 2);
    gauge.position.set(-5.3, 3.0, 0.8);

    tankGroup.add(tankMesh, domeL, domeR, saddle1, saddle2, pipeOut, handwheel, gauge);
    this.group.add(tankGroup);

    this.registerObstacle(new THREE.Vector3(-24, 0, -11), new THREE.Vector3(-12, 4.5, -5), 'Industrial Fuel Tank');

    // 8. Interior Industrial Furnishings: Workbenches, Tool Cabinets & Conduit Catwalks
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });

    // Heavy lathe / machining bench
    const bench1 = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 8.0), benchMat);
    bench1.position.set(-48, 0.6, -30);
    bench1.castShadow = true;
    bench1.receiveShadow = true;
    shopGroup.add(bench1);
    this.platforms.push({ minX: -49.8, maxX: -46.2, minZ: -34.2, maxZ: -25.8, height: 1.2 });

    // Tool storage cabinet
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.4, 6.0), steelMat);
    cabinet.position.set(-54, 1.2, -15);
    cabinet.castShadow = true;
    shopGroup.add(cabinet);
    this.platforms.push({ minX: -55.2, maxX: -52.8, minZ: -18.2, maxZ: -11.8, height: 2.4 });

    // High overhead conduit catwalk (for cat stealth parkour inside room)
    const conduitBeam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 28), steelMat);
    conduitBeam.position.set(-42, 3.8, -20);
    conduitBeam.castShadow = true;
    shopGroup.add(conduitBeam);
    this.platforms.push({ minX: -42.5, maxX: -41.5, minZ: -34.0, maxZ: -6.0, height: 3.95 });

    // 9. Warm Interior Pendant Lights
    const interiorLight1 = new THREE.PointLight(0xffedd5, 2.4, 18);
    interiorLight1.position.set(-45, 6.0, -28);
    const interiorLight2 = new THREE.PointLight(0xffedd5, 2.4, 18);
    interiorLight2.position.set(-45, 6.0, -12);
    shopGroup.add(interiorLight1, interiorLight2);

    this.group.add(shopGroup);

    // Register Solid Wall Obstacles (Full height 14.0m to prevent jumping through roof/walls)
    this.registerObstacle(
      new THREE.Vector3(-34.5, 0, -38),
      new THREE.Vector3(-33.5, 14.0, -22),
      'Machine Shop - North Wall'
    );
    this.registerObstacle(
      new THREE.Vector3(-34.5, 0, -18),
      new THREE.Vector3(-33.5, 14.0, -2),
      'Machine Shop - South Wall'
    );
    this.registerObstacle(
      new THREE.Vector3(-56.5, 0, -38),
      new THREE.Vector3(-55.5, 14.0, -2),
      'Machine Shop - Back Wall'
    );
    this.registerObstacle(
      new THREE.Vector3(-56, 0, -38.5),
      new THREE.Vector3(-34, 14.0, -37.5),
      'Machine Shop - Left Wall'
    );
    this.registerObstacle(
      new THREE.Vector3(-56, 0, -2.5),
      new THREE.Vector3(-34, 14.0, -1.5),
      'Machine Shop - Right Wall'
    );

    // 1891 Tugboat "Dorothy"
    const dorothyGroup = new THREE.Group();
    dorothyGroup.position.set(-20, 0, -25);

    // Keel Support Blocks
    const keelMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
    for (let z = -6; z <= 6; z += 3) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 1.5), keelMat);
      block.position.set(0, 0.4, z);
      dorothyGroup.add(block);
    }

    // Hull (Red / Dark Green)
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x992222, roughness: 0.7 });
    const hullGeo = new THREE.CapsuleGeometry(2.4, 12, 8, 16);
    hullGeo.rotateX(Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.set(0, 2.2, 0);
    hull.scale.set(0.9, 0.9, 1.0);
    hull.castShadow = true;
    dorothyGroup.add(hull);

    // Wooden Deck & Wheelhouse
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xc29b68, roughness: 0.8 });
    const cabinGeo = new THREE.BoxGeometry(2.8, 2.4, 4.5);
    const cabin = new THREE.Mesh(cabinGeo, deckMat);
    cabin.position.set(0, 3.8, 1.2);
    cabin.castShadow = true;
    dorothyGroup.add(cabin);

    // Black Smokestack
    const stackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const stackGeo = new THREE.CylinderGeometry(0.55, 0.65, 4.2, 12);
    const stack = new THREE.Mesh(stackGeo, stackMat);
    stack.position.set(0, 5.2, -1.5);
    dorothyGroup.add(stack);

    // Polished Brass Steam Whistle
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.2 });
    const whistleGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8);
    const whistle = new THREE.Mesh(whistleGeo, brassMat);
    whistle.position.set(0.5, 6.2, -1.2);
    dorothyGroup.add(whistle);

    // Mooring Capstan Gear
    const gearGeo = new THREE.CylinderGeometry(0.45, 0.55, 0.7, 12);
    this.dorothyCapstanMesh = new THREE.Mesh(gearGeo, brassMat);
    this.dorothyCapstanMesh.position.set(0, 3.2, -4.5);
    this.dorothyCapstanMesh.castShadow = true;
    dorothyGroup.add(this.dorothyCapstanMesh);

    this.group.add(dorothyGroup);

    // Register Dorothy Hull Solid Collider (ground-level hull)
    this.registerObstacle(
      new THREE.Vector3(-22.5, 0, -32),
      new THREE.Vector3(-17.5, 5, -18),
      'Tugboat Dorothy'
    );
  }

  private buildDryDock12AndBigBlue() {
    const dockWallMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.95 });
    
    // Basin Walls
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(3, 8, 80), dockWallMat);
    wallLeft.position.set(5, 4, 30);
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(3, 8, 80), dockWallMat);
    wallRight.position.set(35, 4, 30);
    this.group.add(wallLeft, wallRight);

    // Register Dry Dock Basin Wall Colliders
    this.registerObstacle(new THREE.Vector3(3.5, 0, -10), new THREE.Vector3(6.5, 8, 70), 'Dry Dock 12 West Wall');
    this.registerObstacle(new THREE.Vector3(33.5, 0, -10), new THREE.Vector3(36.5, 8, 70), 'Dry Dock 12 East Wall');

    // 3D CVN Modular Superstructure (Optimized Lightweight Geometry - Saves 25MB RAM)
    const steelPlateTex = TextureGenerator.createSteelPlateTexture();
    const carrierMat = new THREE.MeshStandardMaterial({
      map: steelPlateTex,
      metalness: 0.65,
      roughness: 0.35
    });
    const carrierGeo = new THREE.BoxGeometry(22, 10, 55);
    const carrierHull = new THREE.Mesh(carrierGeo, carrierMat);
    carrierHull.position.set(20, 5, 30);
    carrierHull.castShadow = true;
    carrierHull.receiveShadow = true;
    this.group.add(carrierHull);

    // Flight deck / island box
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5, roughness: 0.4 });
    const island = new THREE.Mesh(new THREE.BoxGeometry(4, 7, 12), islandMat);
    island.position.set(28, 13.5, 30);
    island.castShadow = true;
    this.group.add(island);

    this.registerObstacle(new THREE.Vector3(9, 0, 2.5), new THREE.Vector3(31, 12, 57.5), 'CVN-80 Carrier Hull Module');

    // "BIG BLUE" Crane
    const bigBlueMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      metalness: 0.5,
      roughness: 0.4
    });

    const gantryGroup = new THREE.Group();
    gantryGroup.position.set(20, 0, 25);

    const legGeo = new THREE.BoxGeometry(3.2, 38, 4.0);
    const leftLeg = new THREE.Mesh(legGeo, bigBlueMat);
    leftLeg.position.set(-22, 19, 0);
    const rightLeg = new THREE.Mesh(legGeo, bigBlueMat);
    rightLeg.position.set(22, 19, 0);
    gantryGroup.add(leftLeg, rightLeg);

    const bridgeGeo = new THREE.BoxGeometry(50, 4.5, 6.0);
    const bridge = new THREE.Mesh(bridgeGeo, bigBlueMat);
    bridge.position.set(0, 37.5, 0);
    bridge.castShadow = true;
    gantryGroup.add(bridge);

    this.craneTrolley = new THREE.Group();
    this.craneTrolley.position.set(0, 34.5, 0);

    const hoistBlockGeo = new THREE.BoxGeometry(3.5, 2.0, 3.5);
    const hoistMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.7 });
    const hoistBlock = new THREE.Mesh(hoistBlockGeo, hoistMat);
    this.craneTrolley.add(hoistBlock);

    const cableMat = new THREE.LineBasicMaterial({ color: 0x111111 });
    const cableGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -18, 0)
    ]);
    const cable = new THREE.Line(cableGeo, cableMat);
    this.craneTrolley.add(cable);

    const moduleGeo = new THREE.BoxGeometry(8, 2, 8);
    const moduleMesh = new THREE.Mesh(moduleGeo, new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
    moduleMesh.position.set(0, -18, 0);
    moduleMesh.castShadow = true;
    this.craneTrolley.add(moduleMesh);

    gantryGroup.add(this.craneTrolley);
    this.group.add(gantryGroup);
  }

  private buildSubmarineFabShop() {
    const subGroup = new THREE.Group();
    subGroup.position.set(-30, 0, 45);

    // 3D Submarine Model
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const gltfLoader = new GLTFLoader();
      gltfLoader.load('/models/submarine.glb', (gltf) => {
        const sub = gltf.scene;
        sub.scale.set(1.4, 1.4, 1.4);
        sub.position.set(0, 1.8, 0);
        sub.rotation.y = Math.PI / 2;

        sub.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        subGroup.add(sub);
      }, undefined, () => {
        const subMat = new THREE.MeshStandardMaterial({
          color: 0x09090b,
          metalness: 0.8,
          roughness: 0.3
        });
        const subGeo = new THREE.CylinderGeometry(4.8, 4.8, 28, 24);
        subGeo.rotateX(Math.PI / 2);
        const subHull = new THREE.Mesh(subGeo, subMat);
        subHull.position.set(0, 4.8, 0);
        subHull.castShadow = true;
        subHull.receiveShadow = true;
        subGroup.add(subHull);
      });
    } else {
      const subMat = new THREE.MeshStandardMaterial({
        color: 0x09090b,
        metalness: 0.8,
        roughness: 0.3
      });
      const subGeo = new THREE.CylinderGeometry(4.8, 4.8, 28, 24);
      subGeo.rotateX(Math.PI / 2);
      const subHull = new THREE.Mesh(subGeo, subMat);
      subHull.position.set(0, 4.8, 0);
      subHull.castShadow = true;
      subHull.receiveShadow = true;
      subGroup.add(subHull);
    }

    this.registerObstacle(new THREE.Vector3(-35, 0, 31), new THREE.Vector3(-25, 9.6, 59), 'Submarine Hull Module');

    const pipeMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const pipeGeo = new THREE.CylinderGeometry(0.3, 0.3, 30, 12);
      pipeGeo.rotateX(Math.PI / 2);
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.position.set(-4.2 + i * 1.2, 8.5, 0);
      subGroup.add(pipe);
    }

    this.group.add(subGroup);
  }

  private buildRadiationVault() {
    const vaultGroup = new THREE.Group();
    vaultGroup.position.set(45, 0, -60);

    const tentMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      roughness: 0.6,
      transparent: true,
      opacity: 0.85
    });

    const tentGeo = new THREE.BoxGeometry(16, 8, 16);
    const tent = new THREE.Mesh(tentGeo, tentMat);
    tent.position.set(0, 4, 0);
    vaultGroup.add(tent);

    const beacon = new THREE.PointLight(0xa855f7, 2.5, 25);
    beacon.position.set(0, 5, 0);
    vaultGroup.add(beacon);

    this.group.add(vaultGroup);

    this.registerObstacle(new THREE.Vector3(37, 0, -68), new THREE.Vector3(53, 8, -52), 'RCOH Radiological Vault');
  }

  public dryDockWater: THREE.Mesh | null = null;

  private buildCatMotelSanctuary() {
    const motelGroup = new THREE.Group();
    motelGroup.position.set(-55, 0, -65);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.7 });
    const bldgGeo = new THREE.BoxGeometry(14, 5, 12);
    const bldg = new THREE.Mesh(bldgGeo, wallMat);
    bldg.position.set(0, 2.5, 0);
    bldg.castShadow = true;
    bldg.receiveShadow = true;
    motelGroup.add(bldg);

    this.registerObstacle(new THREE.Vector3(-62, 0, -71), new THREE.Vector3(-48, 5, -59), 'Cat Motel Hub');

    const acGeo = new THREE.BoxGeometry(2.5, 1.6, 2.0);
    const acMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6 });
    const ac = new THREE.Mesh(acGeo, acMat);
    ac.position.set(2, 5.8, 1);
    motelGroup.add(ac);

    const porchLight = new THREE.PointLight(0xfef08a, 2.0, 15);
    porchLight.position.set(0, 3.5, 6.5);
    motelGroup.add(porchLight);

    // Cardboard Condos & Sleeping Nests
    const cardboardMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const condo = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.2), cardboardMat);
      condo.position.set(-4 + i * 2.2, 0.4, 7.2);
      condo.castShadow = true;
      motelGroup.add(condo);
    }

    // Feeding Bowls (Tuna / Salmon)
    const bowlMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.3 });
    const foodMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 });
    for (let i = 0; i < 2; i++) {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.15, 12), bowlMat);
      bowl.position.set(3.5 + i * 0.8, 0.08, 7.2);
      const food = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 12), foodMat);
      food.position.set(3.5 + i * 0.8, 0.14, 7.2);
      motelGroup.add(bowl, food);
    }

    this.group.add(motelGroup);
  }

  public platforms: { minX: number; maxX: number; minZ: number; maxZ: number; height: number; isRamp?: boolean; rampStart?: number; rampEnd?: number }[] = [];

  public getPlatformFloor(x: number, z: number, _currentY: number): number {
    let maxFloor = 0; // Default ground level

    // 1. Dynamic Sloped Gangway Ramps (X: 38 to 45 -> Y: 0.0 to 1.4)
    for (let rz = -100; rz <= 100; rz += 40) {
      if (x >= 38.0 && x <= 45.0 && z >= rz - 6.0 && z <= rz + 6.0) {
        const rampProgress = (x - 38.0) / (45.0 - 38.0); // 0.0 at ground, 1.0 at pier
        const rampH = THREE.MathUtils.clamp(rampProgress * 1.4, 0, 1.4);
        if (rampH > maxFloor) maxFloor = rampH;
      }
    }

    // 2. Solid Elevated Platforms (Pier, Dorothy Deck, I-Beams, Pallets)
    for (const p of this.platforms) {
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
        if (p.height > maxFloor) {
          maxFloor = p.height;
        }
      }
    }
    return maxFloor;
  }

  private buildParkourStructures() {
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.7, roughness: 0.3 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.85 }); // Weathered wood crate
    const palletMat = new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.9 }); // Wooden pallet

    // 1. High I-Beam Walkway
    const beamGeo = new THREE.BoxGeometry(0.5, 0.4, 25);
    const beam1 = new THREE.Mesh(beamGeo, steelMat);
    beam1.position.set(-20, 4.5, -5);
    beam1.castShadow = true;
    this.group.add(beam1);

    this.platforms.push({ minX: -20.5, maxX: -19.5, minZ: -17.5, maxZ: 7.5, height: 4.7 });

    // 2. Stepped Parkour Crates near Tugboat Dorothy (For climbing)
    const crate1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 2.0), crateMat);
    crate1.position.set(-15, 0.5, -20);
    crate1.castShadow = true;
    crate1.receiveShadow = true;
    this.group.add(crate1);
    this.platforms.push({ minX: -16.2, maxX: -13.8, minZ: -21.2, maxZ: -18.8, height: 1.0 });

    const crate2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), crateMat);
    crate2.position.set(-15, 0.9, -23);
    crate2.castShadow = true;
    crate2.receiveShadow = true;
    this.group.add(crate2);
    this.platforms.push({ minX: -16.0, maxX: -14.0, minZ: -24.0, maxZ: -22.0, height: 1.8 });

    // 3. Dorothy Main Deck Platform
    this.platforms.push({ minX: -22.0, maxX: -18.0, minZ: -31.0, maxZ: -19.0, height: 2.2 });

    // 4. Staging Pallet Stack near Machine Shop
    const palletCrate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.4), crateMat);
    palletCrate.position.set(-32, 0.6, -14);
    palletCrate.castShadow = true;
    palletCrate.receiveShadow = true;
    this.group.add(palletCrate);
    this.platforms.push({ minX: -33.4, maxX: -30.6, minZ: -15.4, maxZ: -12.6, height: 1.2 });

    // 5. Dry Dock 12 Dynamic Flooding Basin Water & Floating Pallets
    const waterGeo = new THREE.PlaneGeometry(30, 80);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.75
    });
    this.dryDockWater = new THREE.Mesh(waterGeo, waterMat);
    this.dryDockWater.position.set(20, 0.05, 30);
    this.group.add(this.dryDockWater);

    // Floating Pallets in Dry Dock 12
    const palletPositions = [
      { x: 12, y: 0.8, z: 12 },
      { x: 16, y: 1.6, z: 22 },
      { x: 22, y: 2.5, z: 32 },
      { x: 28, y: 3.4, z: 42 }
    ];

    palletPositions.forEach(p => {
      const pallet = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.4, 2.5), palletMat);
      pallet.position.set(p.x, p.y, p.z);
      pallet.castShadow = true;
      pallet.receiveShadow = true;
      this.group.add(pallet);
      this.platforms.push({ minX: p.x - 1.4, maxX: p.x + 1.4, minZ: p.z - 1.4, maxZ: p.z + 1.4, height: p.y + 0.2 });
    });
  }

  private buildWeldingSparks() {
    const particleCount = 120;
    const geometry = new THREE.BufferGeometry();
    this.sparkPositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      this.sparkPositions[i * 3] = -25 + (Math.random() - 0.5) * 1.5;
      this.sparkPositions[i * 3 + 1] = 4 + (Math.random() - 0.5) * 1.5;
      this.sparkPositions[i * 3 + 2] = 45 + (Math.random() - 0.5) * 1.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.18,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    this.weldingSparkParticles = new THREE.Points(geometry, material);
    this.group.add(this.weldingSparkParticles);
  }

  public update(deltaTime: number) {
    if (this.craneTrolley) {
      const time = Date.now() * 0.001;
      this.craneTrolley.position.x = Math.sin(time * 0.4) * 12;
      this.craneTrolley.rotation.z = Math.sin(time * 1.2) * 0.03;
    }

    if (this.objectiveBeacon && this.objectiveBeacon.visible) {
      this.objectiveBeacon.rotation.y += deltaTime * 0.8;
      const opacity = 0.25 + Math.sin(Date.now() * 0.004) * 0.15;
      (this.objectiveBeacon.material as THREE.MeshBasicMaterial).opacity = opacity;
    }

    // Dynamic James River Water wave ripples, caustics, & scrolling surface texture
    if (this.jamesRiverWater) {
      this.waterTime += deltaTime * 1.8;
      
      // Scroll wave caustics texture
      const mat = this.jamesRiverWater.material as THREE.MeshStandardMaterial;
      if (mat.map) {
        mat.map.offset.x = (mat.map.offset.x + deltaTime * 0.08) % 1;
        mat.map.offset.y = (mat.map.offset.y + deltaTime * 0.04) % 1;
      }

      const pos = this.jamesRiverWater.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i);
        const v = pos.getY(i);
        // Sinusoidal dual-wave ripple
        const z = Math.sin(u * 0.12 + this.waterTime) * 0.22 + Math.cos(v * 0.15 + this.waterTime * 1.2) * 0.18;
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
      this.jamesRiverWater.geometry.computeVertexNormals();
    }

    if (this.weldingSparkParticles && this.sparkPositions.length > 0) {
      const posAttr = this.weldingSparkParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = posAttr.array as Float32Array;
      for (let i = 0; i < array.length / 3; i++) {
        array[i * 3 + 1] -= deltaTime * (3 + Math.random() * 4);
        array[i * 3] += (Math.random() - 0.5) * 0.1;
        if (array[i * 3 + 1] < 0) {
          array[i * 3] = -25 + (Math.random() - 0.5) * 0.8;
          array[i * 3 + 1] = 4.5 + Math.random() * 0.5;
          array[i * 3 + 2] = 45 + (Math.random() - 0.5) * 0.8;
        }
      }
      posAttr.needsUpdate = true;
    }
  }
}
