import * as THREE from 'three';
import { TextureGenerator } from '../core/TextureGenerator';
import { ModelManager } from '../core/ModelManager';

export class CatCharacter {
  public mesh: THREE.Group;
  public body: THREE.Mesh;
  public head: THREE.Group;
  public tailSegments: THREE.Mesh[] = [];
  public legs: { fl: THREE.Group; fr: THREE.Group; bl: THREE.Group; br: THREE.Group };
  public collar: THREE.Mesh;
  public collarGroup: THREE.Group;
  public dosimeterTag: THREE.Mesh;
  public dosimeterScreen: THREE.Mesh | null = null;
  public dosimeterLight: THREE.PointLight | null = null;
  public whiskers: THREE.LineSegments[] = [];
  public neckBone: THREE.Bone | null = null;

  private static readonly scratchBonePos = new THREE.Vector3();
  private static readonly scratchBoneQuat = new THREE.Quaternion();
  private static readonly scratchMeshQuat = new THREE.Quaternion();

  public gltfModel: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private animations: { [key: string]: THREE.AnimationAction } = {};
  private currentAction: THREE.AnimationAction | null = null;
  public static readonly MIN_ACTION_DWELL_TIME: number = 0.15; // 150ms minimum dwell time
  public currentActionName: string = 'stand';
  public actionDwellTime: number = 0;

  private walkCycle: number = 0;
  private tailWagPhase: number = 0;
  public isCrouching: boolean = false;
  public isPouncing: boolean = false;

  // Diagnostic Flags for Debugger / Sandbox inspection
  public static diagnosticFlags = {
    gltfFetchAttempted: false,
    gltfLoadSuccess: false,
    gltfError: null as string | null,
    gltfChildCount: 0,
    meshCount: 0,
    totalVertices: 0,
    boneCount: 0,
    hasSkinnedMesh: false,
    hasTextures: false,
    activeMeshMode: 'PROCEDURAL' as 'PROCEDURAL' | 'GLTF' | 'HYBRID_DEBUG',
    meshVisible: true,
    boundingBoxSize: { x: 0, y: 0, z: 0 },
    modelRootY: 0,
    computedWorldPos: { x: 0, y: 0, z: 0 },
    currentScale: 0.018,
    isWireframeOverride: false,
    isBrightMagentaShader: false
  };

  public proceduralGroup: THREE.Group;
  public readyPromise: Promise<void> = Promise.resolve();

  constructor() {
    this.mesh = new THREE.Group();
    this.proceduralGroup = new THREE.Group();
    const proceduralGroup = this.proceduralGroup;
    this.mesh.add(this.proceduralGroup);

    // Initialize foundational procedural animation clips & skeletal mixer
    this.initProceduralAnimations();

    // 1. Load Real 3D Quadruped Cat GLB Model
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      CatCharacter.diagnosticFlags.gltfFetchAttempted = true;
      this.readyPromise = ModelManager.loadCatModel().then((gltf) => {
        this.gltfModel = gltf.scene;
        CatCharacter.diagnosticFlags.gltfLoadSuccess = true;
        CatCharacter.diagnosticFlags.gltfChildCount = gltf.scene.children.length;
        CatCharacter.diagnosticFlags.activeMeshMode = 'GLTF';

        // Cat model authored scale adjusted by 1.8x to make Alba a proud, full-sized shipyard master mouser
        this.gltfModel.scale.set(1.8, 1.8, 1.8);
        this.gltfModel.position.set(0, 0, 0);
        this.gltfModel.rotation.y = 0; // Face forward (+Z direction)
        CatCharacter.diagnosticFlags.currentScale = 1.8;

        // Traverse to enable shadows, disable frustum culling, and apply authentic Velvet Tuxedo Fur Materials
        let meshCnt = 0;
        let vertCnt = 0;
        let boneCnt = 0;
        let hasSkinned = false;
        let hasTex = false;

        const velvetFurTex = TextureGenerator.createVelvetFurTexture();
        const furNorTex = TextureGenerator.createFurNormalTexture();
        const furRoughTex = TextureGenerator.createFurRoughnessTexture();

        const tuxedoFurMat = new THREE.MeshStandardMaterial({
          color: 0x121214, // Sleek deep velvet obsidian black tuxedo coat
          map: velvetFurTex,
          normalMap: furNorTex,
          roughnessMap: furRoughTex,
          roughness: 0.75,
          metalness: 0.08,
          side: THREE.DoubleSide
        });

        this.gltfModel.traverse((child) => {
          if ((child as THREE.Bone).isBone) {
            boneCnt++;
            const name = child.name;
            if (name === 'RigNeck2_014' || name === 'RigNeck1_00' || name.toLowerCase().includes('neck')) {
              if (!this.neckBone || name === 'RigNeck2_014') {
                this.neckBone = child as THREE.Bone;
              }
            }
          }
          if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
            hasSkinned = true;
          }
          if ((child as THREE.Mesh).isMesh) {
            meshCnt++;
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false; // CRITICAL: Prevents skinned mesh dropping out of camera frustum
            
            if (mesh.geometry) {
              mesh.geometry.computeBoundingBox();
              mesh.geometry.computeBoundingSphere();
              if (mesh.geometry.attributes.position) {
                vertCnt += mesh.geometry.attributes.position.count;
              }
            }

            // Apply high-contrast rich tuxedo black coat to the raw white GLTF geometry
            if (mesh.material) {
              mesh.material = tuxedoFurMat;
            }
          }
        });

        CatCharacter.diagnosticFlags.meshCount = meshCnt;
        CatCharacter.diagnosticFlags.totalVertices = vertCnt;
        CatCharacter.diagnosticFlags.boneCount = boneCnt;
        CatCharacter.diagnosticFlags.hasSkinnedMesh = hasSkinned;
        CatCharacter.diagnosticFlags.hasTextures = hasTex;
        CatCharacter.diagnosticFlags.modelRootY = this.gltfModel.position.y;

        // Bind Skeletal Animation Mixer with exact GLTF In-Place Animation Clip Names
        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.gltfModel);
          gltf.animations.forEach((clip) => {
            const action = this.mixer!.clipAction(clip);
            this.animations[clip.name] = action;
            this.animations[clip.name.toLowerCase()] = action;
          });

          // Precision Animation Clip Aliases (using clean -IP in-place clips without root displacement)
          this.animations['stand'] = this.animations['Cat|Idle_00-IP'] || this.animations['Cat|A_Idle_00'] || Object.values(this.animations)[0];
          this.animations['idle'] = this.animations['stand'];
          this.animations['sit'] = this.animations['Cat|Sitting_00-IP'] || this.animations['Cat|Sitting_00'] || this.animations['stand'];
          
          // Pure Forward Walk (straight spine & head forward)
          this.animations['walk_straight'] = this.animations['Cat|Walk-IP'] || this.animations['Cat|Walk'] || this.animations['stand'];
          this.animations['walk'] = this.animations['walk_straight'];

          // Turning Left / Right while walking
          this.animations['turn_left'] = this.animations['Cat|Walk_L-IP'] || this.animations['Cat|Walk_L'] || this.animations['walk_straight'];
          this.animations['turn_right'] = this.animations['Cat|Walk_R-IP'] || this.animations['Cat|Walk_R'] || this.animations['walk_straight'];

          // High Speed Sprint & Gallop
          this.animations['run'] = this.animations['Cat|Run-IP'] || this.animations['Cat|Sprint-IP'] || this.animations['Cat|Run'] || this.animations['walk_straight'];

          // True Jump (Airborne leap) & Combat Pounce (Fast predatory bound)
          this.animations['jump'] = this.animations['Cat|Jump_Trot-IP'] || this.animations['Cat|Jump_Up-IP'] || this.animations['Cat|Jump_Up'] || this.animations['run'];
          this.animations['pounce'] = this.animations['Cat|Jump_Run-IP'] || this.animations['Cat|Jump_Run'] || this.animations['jump'];

          // Attack & Strike Combos
          this.animations['attack'] = this.animations['Cat|Attack_Agressive_Legs_01-IP'] || this.animations['Cat|Attack_Left-IP'] || this.animations['Cat|Attack_Right-IP'] || this.animations['stand'];

          // Eating & Chewing
          this.animations['eat'] = this.animations['Cat|Eating_01-IP'] || this.animations['Cat|Eating_02-IP'] || this.animations['Cat|Eating_01'] || this.animations['stand'];

          // Ensure all animation clips are active, enabled, and weighted to full 1.0 (no frozen statues)
          const actionKeys = ['stand', 'idle', 'sit', 'walk_straight', 'walk', 'turn_left', 'turn_right', 'run', 'jump', 'pounce', 'attack', 'eat'];
          actionKeys.forEach(key => {
            const action = this.animations[key];
            if (action) {
              action.enabled = true;
              action.setEffectiveWeight(1.0);
              action.play();
            }
          });

          // Pre-evaluate 1 mixer tick to bind all bone tracks & skinning interpolators ahead of gameplay
          this.mixer.update(0.016);

          actionKeys.forEach(key => {
            const action = this.animations[key];
            if (action && key !== 'stand' && key !== 'idle') {
              action.stop();
            }
          });

          // Default state: Pure alert standing pose
          const initialAction = this.animations['stand'];
          if (initialAction) {
            initialAction.enabled = true;
            initialAction.setEffectiveWeight(1.0);
            initialAction.play();
            this.currentAction = initialAction;
            this.currentActionName = 'stand';
            this.actionDwellTime = 0;
            this.mixer.update(0);
          }
        }

        this.mesh.add(this.gltfModel);

        // Remove procedural fallback geometry completely once GLTF is attached
        if (this.gltfModel && this.gltfModel.children.length > 0) {
          this.mesh.remove(this.proceduralGroup);
          this.proceduralGroup.visible = false;

          // Attach Alba's signature fitted Safety-Orange Collar and OLED Dosimeter Tag to GLTF rig
          if (this.collarGroup) {
            this.collarGroup.scale.set(1.65, 1.65, 1.65);
            this.mesh.add(this.collarGroup);
          }
        }

        // Measure bounding box for diagnostics
        const bbox = new THREE.Box3().setFromObject(this.mesh);
        const sz = new THREE.Vector3();
        bbox.getSize(sz);
        CatCharacter.diagnosticFlags.boundingBoxSize = { x: sz.x, y: sz.y, z: sz.z };
      }).catch((err: unknown) => {
        console.warn('GLTF Cat load fallback note:', err);
        CatCharacter.diagnosticFlags.gltfError = err instanceof Error ? err.message : String(err);
        CatCharacter.diagnosticFlags.activeMeshMode = 'PROCEDURAL';
        this.proceduralGroup.visible = true;
      });
    }

    // Material definitions (Tuxedo Cat: Sleek velvety black fur with white bib and white paws)
    const blackFurMat = new THREE.MeshStandardMaterial({
      color: 0x111113,
      map: TextureGenerator.createVelvetFurTexture(),
      normalMap: TextureGenerator.createFurNormalTexture(),
      roughnessMap: TextureGenerator.createFurRoughnessTexture(),
      roughness: 0.8,
      metalness: 0.05
    });

    const whiteFurMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.85,
      metalness: 0.02
    });

    const pinkInnerMat = new THREE.MeshStandardMaterial({
      color: 0xfb7185,
      roughness: 0.55
    });

    const greenEyeMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.55,
      roughness: 0.08,
      metalness: 0.1
    });

    const brassTagMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.95,
      roughness: 0.15
    });

    // 1. Anatomical Feline Spine & Muscular Torso (Tapered ribcage + muscular rear haunches)
    // Chest / Ribcage
    const ribcageGeo = new THREE.SphereGeometry(0.14, 16, 16);
    ribcageGeo.scale(0.9, 1.0, 1.25);
    const ribcage = new THREE.Mesh(ribcageGeo, blackFurMat);
    ribcage.position.set(0, 0.33, 0.12);
    ribcage.castShadow = true;
    proceduralGroup.add(ribcage);

    // Mid-Spine & Slender Flank
    const spineGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.28, 12);
    spineGeo.rotateX(Math.PI / 2);
    this.body = new THREE.Mesh(spineGeo, blackFurMat);
    this.body.position.set(0, 0.33, -0.05);
    this.body.castShadow = true;
    proceduralGroup.add(this.body);

    // Rear Pelvis & Muscular Haunches
    const pelvisGeo = new THREE.SphereGeometry(0.135, 16, 16);
    pelvisGeo.scale(0.95, 1.05, 1.15);
    const pelvis = new THREE.Mesh(pelvisGeo, blackFurMat);
    pelvis.position.set(0, 0.34, -0.22);
    pelvis.castShadow = true;
    proceduralGroup.add(pelvis);

    // White Tuxedo Chest / Belly Patch
    const chestGeo = new THREE.SphereGeometry(0.115, 12, 12);
    chestGeo.scale(0.75, 1.05, 0.6);
    const chestMesh = new THREE.Mesh(chestGeo, whiteFurMat);
    chestMesh.position.set(0, 0.28, 0.16);
    proceduralGroup.add(chestMesh);

    // 2. Sculpted Feline Skull & Muzzle
    this.head = new THREE.Group();
    this.head.position.set(0, 0.46, 0.36);

    const headGeo = new THREE.SphereGeometry(0.13, 16, 16);
    headGeo.scale(1.05, 0.95, 1.1);
    const headMesh = new THREE.Mesh(headGeo, blackFurMat);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // White Muzzle Pad (Cheeks)
    const muzzleL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), whiteFurMat);
    muzzleL.position.set(-0.035, -0.04, 0.11);
    muzzleL.scale.set(0.9, 0.7, 0.9);
    const muzzleR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), whiteFurMat);
    muzzleR.position.set(0.035, -0.04, 0.11);
    muzzleR.scale.set(0.9, 0.7, 0.9);
    this.head.add(muzzleL, muzzleR);

    // Pink Leather Nose
    const noseGeo = new THREE.ConeGeometry(0.018, 0.02, 4);
    noseGeo.rotateX(Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeo, pinkInnerMat);
    noseMesh.position.set(0, -0.025, 0.155);
    this.head.add(noseMesh);

    // Realistic Green Feline Eyes with Dark Almond Contours
    const eyeGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const leftEye = new THREE.Mesh(eyeGeo, greenEyeMat);
    leftEye.position.set(-0.048, 0.022, 0.115);
    const rightEye = new THREE.Mesh(eyeGeo, greenEyeMat);
    rightEye.position.set(0.048, 0.022, 0.115);
    this.head.add(leftEye, rightEye);

    // Whiskers (6 White Filament Lines on Snout)
    const whiskerMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const createWhiskers = (isLeft: boolean) => {
      const dir = isLeft ? -1 : 1;
      const points = [
        new THREE.Vector3(dir * 0.04, -0.03, 0.12),
        new THREE.Vector3(dir * 0.14, -0.02, 0.15),
        new THREE.Vector3(dir * 0.04, -0.04, 0.12),
        new THREE.Vector3(dir * 0.14, -0.05, 0.14),
        new THREE.Vector3(dir * 0.04, -0.05, 0.12),
        new THREE.Vector3(dir * 0.13, -0.08, 0.13)
      ];
      const wGeo = new THREE.BufferGeometry().setFromPoints(points);
      return new THREE.LineSegments(wGeo, whiskerMat);
    };
    this.head.add(createWhiskers(true), createWhiskers(false));

    // Sculpted Triangular Ears with Pink Inner Shell
    const earGeo = new THREE.ConeGeometry(0.05, 0.1, 4);
    const earInnerGeo = new THREE.ConeGeometry(0.035, 0.075, 4);

    const leftEar = new THREE.Mesh(earGeo, blackFurMat);
    leftEar.position.set(-0.075, 0.11, 0.02);
    leftEar.rotation.set(0.1, 0, 0.35);
    const leftEarInner = new THREE.Mesh(earInnerGeo, pinkInnerMat);
    leftEarInner.position.set(0, 0, 0.01);
    leftEar.add(leftEarInner);

    const rightEar = new THREE.Mesh(earGeo, blackFurMat);
    rightEar.position.set(0.075, 0.11, 0.02);
    rightEar.rotation.set(0.1, 0, -0.35);
    const rightEarInner = new THREE.Mesh(earInnerGeo, pinkInnerMat);
    rightEarInner.position.set(0, 0, 0.01);
    rightEar.add(rightEarInner);

    this.head.add(leftEar, rightEar);
    proceduralGroup.add(this.head);

    // 3. Vibrant Safety-Orange Shipyard Collar with Digital Backlit LCD Dosimeter
    const orangeCollarMat = new THREE.MeshStandardMaterial({
      color: 0xea580c, // High-visibility shipyard safety orange (#ea580c)
      roughness: 0.45,
      metalness: 0.1
    });

    this.collarGroup = new THREE.Group();

    // Snug Collar Ring (Tilted with neck angle)
    const collarGeo = new THREE.CylinderGeometry(0.065, 0.068, 0.028, 24, 1, true);
    this.collar = new THREE.Mesh(collarGeo, orangeCollarMat);
    this.collar.castShadow = true;
    this.collarGroup.add(this.collar);

    // Brass Collar Buckle at front throat
    const buckleMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.2 });
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.028, 0.012), buckleMat);
    buckle.position.set(0, -0.005, 0.068);
    this.collarGroup.add(buckle);

    // Brass dosimeter medal tag (NNS Medallion)
    const tagGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.004, 12);
    tagGeo.rotateX(Math.PI / 2);
    this.dosimeterTag = new THREE.Mesh(tagGeo, brassTagMat);
    this.dosimeterTag.position.set(0, -0.024, 0.074);
    this.dosimeterTag.castShadow = true;
    this.collarGroup.add(this.dosimeterTag);

    // Working Digital Collar Dosimeter Screen (Mounted on nape of neck facing player camera)
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.9,
      roughness: 0.2
    });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.25 });

    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.024, 0.016), housingMat);
    housing.position.set(0, 0.01, -0.068);
    housing.rotateX(Math.PI); // Facing rearwards toward third person camera

    this.dosimeterScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.016), screenMat);
    this.dosimeterScreen.position.set(0, 0, -0.009);
    this.dosimeterScreen.rotateY(Math.PI);
    housing.add(this.dosimeterScreen);
    this.collarGroup.add(housing);

    // Subtle localized collar dosimeter glow
    this.dosimeterLight = new THREE.PointLight(0x06b6d4, 0.4, 0.8);
    this.dosimeterLight.position.set(0, 0.02, -0.07);
    this.collarGroup.add(this.dosimeterLight);

    this.collarGroup.position.set(0, 0.31, 0.22);
    this.collarGroup.rotation.set(0.42, 0, 0);
    proceduralGroup.add(this.collarGroup);

    // 4. Articulated Tail (5 Slender Segments)
    let prevSegment: THREE.Object3D = this.body;
    for (let i = 0; i < 5; i++) {
      const segGeo = new THREE.CylinderGeometry(0.022 - i * 0.003, 0.026 - i * 0.003, 0.12, 8);
      segGeo.rotateX(-Math.PI / 4);
      const segMesh = new THREE.Mesh(segGeo, blackFurMat);
      if (i === 0) {
        segMesh.position.set(0, 0.06, -0.34);
      } else {
        segMesh.position.set(0, 0.05, -0.09);
      }
      prevSegment.add(segMesh);
      this.tailSegments.push(segMesh);
      prevSegment = segMesh;
    }

    // 5. Four Articulated Slender Legs with White Mittens
    const createLeg = (isFront: boolean, isLeft: boolean) => {
      const legGroup = new THREE.Group();
      const xOffset = isLeft ? -0.09 : 0.09;
      const zOffset = isFront ? 0.22 : -0.22;
      legGroup.position.set(xOffset, 0.28, zOffset);

      // Upper Leg (Slender, lean)
      const upperGeo = new THREE.CylinderGeometry(0.028, 0.024, 0.24, 8);
      const upperMesh = new THREE.Mesh(upperGeo, blackFurMat);
      upperMesh.position.set(0, -0.1, 0);
      upperMesh.castShadow = true;
      legGroup.add(upperMesh);

      // White Paw (Mitten)
      const pawGeo = new THREE.SphereGeometry(0.035, 8, 8);
      pawGeo.scale(0.85, 0.55, 1.1);
      const pawMesh = new THREE.Mesh(pawGeo, whiteFurMat);
      pawMesh.position.set(0, -0.22, 0.02);
      pawMesh.castShadow = true;
      legGroup.add(pawMesh);

      proceduralGroup.add(legGroup);
      return legGroup;
    };

    this.legs = {
      fl: createLeg(true, true),
      fr: createLeg(true, false),
      bl: createLeg(false, true),
      br: createLeg(false, false)
    };

    this.mesh.scale.set(1.15, 1.15, 1.15);

    // Initialize foundational procedural animation actions & mixer
    this.initProceduralAnimations();
  }

  // Locomotion & State Timers
  public idleTimer: number = 0;
  public eatTimer: number = 0;
  public attackTimer: number = 0;
  public attackType: 'SWIPE_L' | 'SWIPE_R' | 'TAIL_SWEEP' | null = null;
  private animTime: number = 0;

  public triggerSwipe(isRight: boolean = false) {
    this.attackTimer = 0.4;
    this.attackType = isRight ? 'SWIPE_R' : 'SWIPE_L';
  }

  public triggerTailSweep() {
    this.attackTimer = 0.45;
    this.attackType = 'TAIL_SWEEP';
  }

  public triggerEat() {
    this.eatTimer = 1.2;
  }

  public animate(deltaTime: number, speed: number, isGrounded: boolean, turnInput: number = 0) {
    this.animTime += deltaTime;

    // Locomotion & Idle State Machine
    if (speed > 0.05) {
      this.idleTimer = 0; // Reset idle timer whenever moving
    } else {
      this.idleTimer += deltaTime;
    }

    this.actionDwellTime += deltaTime;

    if (this.attackTimer > 0) this.attackTimer -= deltaTime;
    if (this.eatTimer > 0) this.eatTimer -= deltaTime;

    // 1. Update GLTF Skeletal Animation Mixer
    if (this.mixer) {
      this.mixer.update(deltaTime);

      let targetName = 'stand'; // Default: Alert standing posture
      let isHighPriorityAction = false;

      if (this.attackTimer > 0 && this.animations['attack']) {
        targetName = 'attack';
        isHighPriorityAction = true;
      } else if (this.eatTimer > 0 && this.animations['eat']) {
        targetName = 'eat';
        isHighPriorityAction = true;
      } else if (this.isPouncing && this.animations['pounce']) {
        targetName = 'pounce';
        isHighPriorityAction = true;
      } else if (!isGrounded && this.animations['jump']) {
        targetName = 'jump';
        isHighPriorityAction = true;
      } else {
        // Locomotion state resolution with speed & steering deadzone hysteresis
        const currentLoco = this.currentActionName;

        // Run vs Walk hysteresis (Deadband: enter run > 5.2 m/s, exit run < 4.6 m/s)
        const isRunning = (currentLoco === 'run') ? (speed > 4.6) : (speed > 5.2);

        if (isRunning) {
          targetName = 'run';
        } else {
          // Walk vs Stand hysteresis (Deadband: enter walk > 0.20 m/s, exit walk < 0.08 m/s)
          const isWalking = (currentLoco === 'walk_straight' || currentLoco === 'turn_left' || currentLoco === 'turn_right')
            ? (speed > 0.08)
            : (speed > 0.20);

          if (isWalking) {
            // Directional steering hysteresis (Deadband: enter turn at ±0.30, maintain turn until ±0.15)
            if (currentLoco === 'turn_left') {
              targetName = (turnInput > 0.15) ? 'turn_left' : 'walk_straight';
            } else if (currentLoco === 'turn_right') {
              targetName = (turnInput < -0.15) ? 'turn_right' : 'walk_straight';
            } else {
              if (turnInput > 0.30) {
                targetName = 'turn_left';
              } else if (turnInput < -0.30) {
                targetName = 'turn_right';
              } else {
                targetName = 'walk_straight';
              }
            }
          } else {
            // Idle Posture: Stand alert for the first 12s, then transition to sitting down
            if (this.idleTimer >= 12.0) {
              targetName = 'sit';
            } else {
              targetName = 'stand';
            }
          }
        }
      }

      // Transition animation clip with minimum 150ms dwell time protection (high-priority combat/jumps bypass dwell)
      if (targetName !== this.currentActionName) {
        if (isHighPriorityAction || this.actionDwellTime >= CatCharacter.MIN_ACTION_DWELL_TIME) {
          const targetAction = this.animations[targetName] || this.animations['stand'] || Object.values(this.animations)[0];
          if (targetAction) {
            if (targetAction !== this.currentAction) {
              const fadeDuration = 0.2;
              if (this.currentAction) {
                this.currentAction.fadeOut(fadeDuration);
              }
              targetAction.enabled = true;
              targetAction.setEffectiveWeight(1.0);
              if (!targetAction.isRunning()) {
                targetAction.reset().fadeIn(fadeDuration).play();
              } else {
                targetAction.fadeIn(fadeDuration).play();
              }
              this.currentAction = targetAction;
            }
            this.currentActionName = targetName;
            this.actionDwellTime = 0;
          }
        }
      }
    }

    // Dynamic Pounce & Jump Posture Tilt for 3D model
    if (this.gltfModel) {
      if (this.isPouncing) {
        // Dynamic leap trajectory pitch (nose forward, paws extended)
        this.gltfModel.rotation.x = THREE.MathUtils.lerp(this.gltfModel.rotation.x, -0.35, deltaTime * 14);
        this.gltfModel.position.y = THREE.MathUtils.lerp(this.gltfModel.position.y, 0.1, deltaTime * 14);
      } else if (!isGrounded) {
        this.gltfModel.rotation.x = THREE.MathUtils.lerp(this.gltfModel.rotation.x, -0.15, deltaTime * 8);
      } else if (this.isCrouching) {
        // Low-profile stealth prowl
        this.gltfModel.position.y = THREE.MathUtils.lerp(this.gltfModel.position.y, -0.06, deltaTime * 10);
        this.gltfModel.rotation.x = THREE.MathUtils.lerp(this.gltfModel.rotation.x, 0, deltaTime * 8);
      } else {
        this.gltfModel.position.y = THREE.MathUtils.lerp(this.gltfModel.position.y, 0, deltaTime * 10);
        this.gltfModel.rotation.x = THREE.MathUtils.lerp(this.gltfModel.rotation.x, 0, deltaTime * 8);
      }
    }

    // Dynamic Skeletal Socket Tracking: Keeps Alba's safety collar & dosimeter locked to her neck bone
    if (this.neckBone && this.collarGroup) {
      this.neckBone.getWorldPosition(CatCharacter.scratchBonePos);
      this.neckBone.getWorldQuaternion(CatCharacter.scratchBoneQuat);

      this.mesh.worldToLocal(CatCharacter.scratchBonePos);
      this.collarGroup.position.copy(CatCharacter.scratchBonePos);

      this.mesh.getWorldQuaternion(CatCharacter.scratchMeshQuat);
      this.collarGroup.quaternion.copy(CatCharacter.scratchMeshQuat.invert().multiply(CatCharacter.scratchBoneQuat));
      this.collarGroup.rotateX(0.42);
    }

    // 1. Combat Strike Animation Overrides
    if (this.attackTimer > 0) {
      const totalDuration = this.attackType === 'TAIL_SWEEP' ? 0.45 : 0.4;
      const progress = Math.max(0, Math.min(1.0, 1.0 - (this.attackTimer / totalDuration)));

      if (this.attackType === 'SWIPE_L') {
        const swipeArc = Math.sin(progress * Math.PI) * 1.6;
        this.legs.fl.rotation.x = -swipeArc;
        this.legs.fl.rotation.z = -swipeArc * 0.6;
        this.head.rotation.y = swipeArc * 0.3;
      } else if (this.attackType === 'SWIPE_R') {
        const swipeArc = Math.sin(progress * Math.PI) * 1.6;
        this.legs.fr.rotation.x = -swipeArc;
        this.legs.fr.rotation.z = swipeArc * 0.6;
        this.head.rotation.y = -swipeArc * 0.3;
      } else if (this.attackType === 'TAIL_SWEEP') {
        const spinArc = progress * Math.PI * 2;
        this.body.rotation.y = Math.sin(spinArc) * 0.8;
        for (let i = 0; i < this.tailSegments.length; i++) {
          this.tailSegments[i].rotation.y = Math.sin(spinArc + i) * 1.8;
        }
      }

      if (this.attackTimer <= 0) {
        this.attackType = null;
        this.legs.fl.rotation.z = 0;
        this.legs.fr.rotation.z = 0;
        this.head.rotation.y = 0;
        this.body.rotation.y = 0;
      }
    }

    if (this.attackType === null) {
      if (this.eatTimer > 0) {
        // Eating / chewing animation: head dips to ground and bobs
        const chewBob = Math.sin((1.2 - this.eatTimer) * 14) * 0.04;
        this.head.position.y = 0.28 + chewBob;
        this.head.rotation.x = 0.38 + chewBob * 1.2;
        this.body.position.y = 0.28;
        this.legs.fl.rotation.x = THREE.MathUtils.lerp(this.legs.fl.rotation.x, 0, deltaTime * 8);
        this.legs.fr.rotation.x = THREE.MathUtils.lerp(this.legs.fr.rotation.x, 0, deltaTime * 8);
        this.legs.bl.rotation.x = THREE.MathUtils.lerp(this.legs.bl.rotation.x, 0, deltaTime * 8);
        this.legs.br.rotation.x = THREE.MathUtils.lerp(this.legs.br.rotation.x, 0, deltaTime * 8);
      } else if (!isGrounded || this.isPouncing) {
        // Mid-Air Jump & Pounce Posture
        const pounceExt = this.isPouncing ? 0.2 : 0;
        this.legs.fl.rotation.x = THREE.MathUtils.lerp(this.legs.fl.rotation.x, 0.45 + pounceExt, deltaTime * 14);
        this.legs.fr.rotation.x = THREE.MathUtils.lerp(this.legs.fr.rotation.x, 0.45 + pounceExt, deltaTime * 14);
        this.legs.bl.rotation.x = THREE.MathUtils.lerp(this.legs.bl.rotation.x, -0.55 - pounceExt, deltaTime * 14);
        this.legs.br.rotation.x = THREE.MathUtils.lerp(this.legs.br.rotation.x, -0.55 - pounceExt, deltaTime * 14);
        this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, 0.35, deltaTime * 12);
        this.head.position.y = THREE.MathUtils.lerp(this.head.position.y, 0.46, deltaTime * 12);
        this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, this.isPouncing ? -0.2 : 0, deltaTime * 12);
      } else if (speed > 0.08) {
        // Locomotion: Gallop (speed > 4.6) vs Walk/Trot (0.08 < speed <= 4.6)
        const isRunning = speed > 4.6;
        const cycleSpeed = this.isCrouching ? 4.5 : (isRunning ? 9.5 : 7.5);
        this.walkCycle += deltaTime * speed * cycleSpeed;

        if (isRunning) {
          // Gallop Gait: high-speed leaping strides
          const gallopLead = Math.sin(this.walkCycle) * 0.65;
          const gallopRear = Math.sin(this.walkCycle - 0.4) * 0.70;
          this.legs.fl.rotation.x = gallopLead;
          this.legs.fr.rotation.x = gallopLead * 0.9;
          this.legs.bl.rotation.x = -gallopRear;
          this.legs.br.rotation.x = -gallopRear * 0.9;

          const bobAmount = 0.04;
          this.body.position.y = 0.32 + Math.abs(Math.sin(this.walkCycle * 2)) * bobAmount;
          this.head.position.y = 0.46 + Math.abs(Math.sin(this.walkCycle * 2)) * (bobAmount * 0.85);
          this.head.rotation.x = Math.sin(this.walkCycle * 2) * 0.08;
        } else {
          // Diagonal 4-beat Trot / Walk Gait
          const swing = Math.sin(this.walkCycle) * (this.isCrouching ? 0.22 : 0.45);
          this.legs.fl.rotation.x = swing;
          this.legs.br.rotation.x = swing;
          this.legs.fr.rotation.x = -swing;
          this.legs.bl.rotation.x = -swing;

          const bobAmount = this.isCrouching ? 0.01 : 0.025;
          const baseBodyY = this.isCrouching ? 0.18 : 0.32;
          this.body.position.y = baseBodyY + Math.abs(Math.sin(this.walkCycle * 2)) * bobAmount;
          this.head.position.y = (this.isCrouching ? 0.32 : 0.46) + Math.abs(Math.sin(this.walkCycle * 2)) * (bobAmount * 0.8);
          this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, 0, deltaTime * 8);
        }
      } else {
        // Idle Posture: Sitting (>= 12s) vs Alert Standing (< 12s)
        this.legs.fl.rotation.x = THREE.MathUtils.lerp(this.legs.fl.rotation.x, 0, deltaTime * 8);
        this.legs.fr.rotation.x = THREE.MathUtils.lerp(this.legs.fr.rotation.x, 0, deltaTime * 8);
        this.legs.bl.rotation.x = THREE.MathUtils.lerp(this.legs.bl.rotation.x, 0, deltaTime * 8);
        this.legs.br.rotation.x = THREE.MathUtils.lerp(this.legs.br.rotation.x, 0, deltaTime * 8);

        if (this.idleTimer >= 12.0) {
          // Alert Sitting Pose: lowered rear pelvis, upright forelegs, alert head tilt
          const sitProgress = Math.min(1.0, (this.idleTimer - 12.0) * 2.0);
          this.body.position.y = THREE.MathUtils.lerp(0.32, 0.20, sitProgress);
          this.head.position.y = THREE.MathUtils.lerp(0.46, 0.38, sitProgress);
          this.head.rotation.x = THREE.MathUtils.lerp(0, -0.15, sitProgress);
        } else {
          // Standing Alert Breathing Pose
          const baseBodyY = this.isCrouching ? 0.18 : 0.32;
          this.body.position.y = baseBodyY + Math.sin(this.animTime * 3.0) * 0.006;
          this.head.position.y = (this.isCrouching ? 0.32 : 0.46) + Math.sin(this.animTime * 3.0) * 0.004;
          this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, 0, deltaTime * 8);
        }
      }
    }

    // Dynamic Tail Physics / Low tail during stealth
    this.tailWagPhase += deltaTime * (speed > 0.1 ? (this.isCrouching ? 2.5 : 6.0) : 2.0);
    for (let i = 0; i < this.tailSegments.length; i++) {
      const seg = this.tailSegments[i];
      const phaseOffset = i * 0.35;
      const wagIntensity = this.isCrouching ? 0.04 : (0.15 + i * 0.06);
      seg.rotation.y = Math.sin(this.tailWagPhase + phaseOffset) * wagIntensity;
      seg.rotation.z = Math.cos(this.tailWagPhase * 0.5 + phaseOffset) * (this.isCrouching ? 0.02 : 0.08);
      if (this.isCrouching) {
        seg.rotation.x = -0.4; // Low tail tucked to the ground
      } else {
        seg.rotation.x = -0.78; // Normal alert tail angle
      }
    }
  }

  public updateDosimeterRadiation(radDose: number) {
    let colorHex = 0x06b6d4; // Cyan (normal safe zone < 1.0 mSv)
    let intensity = 0.6;
    if (radDose > 8.0) {
      colorHex = 0xd946ef; // Bright ionizing magenta/purple hotspot
      intensity = 1.8 + Math.sin(this.animTime * 15.0) * 0.8;
    } else if (radDose > 2.0) {
      colorHex = 0xf59e0b; // Amber radiation caution
      intensity = 1.0 + Math.sin(this.animTime * 8.0) * 0.4;
    }
    if (this.dosimeterScreen && this.dosimeterScreen.material instanceof THREE.MeshStandardMaterial) {
      this.dosimeterScreen.material.color.setHex(colorHex);
      this.dosimeterScreen.material.emissive.setHex(colorHex);
      this.dosimeterScreen.material.emissiveIntensity = intensity;
    }
    if (this.dosimeterLight) {
      this.dosimeterLight.color.setHex(colorHex);
      this.dosimeterLight.intensity = intensity * 0.8;
    }
  }

  /**
   * Initializes foundational procedural animation clips & skeletal mixer
   * providing full action playback, weight blending, and timeline advancement in headless and pre-load states.
   */
  private initProceduralAnimations(): void {
    this.mixer = new THREE.AnimationMixer(this.mesh);
    const clipDefs: { name: string; duration: number }[] = [
      { name: 'stand', duration: 2.0 },
      { name: 'idle', duration: 2.0 },
      { name: 'sit', duration: 2.0 },
      { name: 'walk_straight', duration: 1.0 },
      { name: 'walk', duration: 1.0 },
      { name: 'turn_left', duration: 1.0 },
      { name: 'turn_right', duration: 1.0 },
      { name: 'run', duration: 0.6 },
      { name: 'jump', duration: 0.8 },
      { name: 'pounce', duration: 0.5 },
      { name: 'attack', duration: 0.4 },
      { name: 'eat', duration: 1.2 }
    ];

    clipDefs.forEach(({ name, duration }) => {
      const track = new THREE.NumberKeyframeTrack(
        '.position[y]',
        [0, duration * 0.5, duration],
        [0, 0.02, 0]
      );
      const clip = new THREE.AnimationClip(name, duration, [track]);
      const action = this.mixer!.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(1.0);
      this.animations[name] = action;
      this.animations[name.toLowerCase()] = action;
    });

    const initialAction = this.animations['stand'];
    if (initialAction) {
      initialAction.enabled = true;
      initialAction.setEffectiveWeight(1.0);
      initialAction.play();
      this.currentAction = initialAction;
      this.currentActionName = 'stand';
      this.actionDwellTime = 0;
      this.mixer.update(0);
    }
  }

  public getMixer(): THREE.AnimationMixer | null {
    return this.mixer;
  }

  public getAnimations(): { [key: string]: THREE.AnimationAction } {
    return this.animations;
  }

  public getAnimationAction(name: string): THREE.AnimationAction | undefined {
    return this.animations[name] || this.animations[name.toLowerCase()];
  }

  public getCurrentAction(): THREE.AnimationAction | null {
    return this.currentAction;
  }

  public getCurrentActionName(): string {
    return this.currentActionName;
  }

  public prewarmAnimations(): void {
    if (!this.mixer) return;
    const actionKeys = ['stand', 'idle', 'sit', 'walk_straight', 'walk', 'turn_left', 'turn_right', 'run', 'jump', 'pounce', 'attack', 'eat'];
    actionKeys.forEach(key => {
      const action = this.animations[key];
      if (action) {
        action.enabled = true;
        action.setEffectiveWeight(1.0);
        action.play();
      }
    });
    this.mixer.update(0.016);
    actionKeys.forEach(key => {
      const action = this.animations[key];
      if (action && key !== 'stand' && key !== 'idle') {
        action.stop();
      }
    });
    const initialAction = this.animations['stand'];
    if (initialAction) {
      initialAction.play();
      this.currentAction = initialAction;
      this.currentActionName = 'stand';
    }
    this.mixer.update(0);
  }
}


