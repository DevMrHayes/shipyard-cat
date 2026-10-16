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

  // Zero-allocation scratch math structures to eliminate garbage collection freeze spikes
  private static readonly scratchBonePos = new THREE.Vector3();
  private static readonly scratchBoneQuat = new THREE.Quaternion();
  private static readonly scratchMeshQuat = new THREE.Quaternion();
  private static readonly scratchBBox = new THREE.Box3();
  private static readonly scratchBBoxSize = new THREE.Vector3();

  public gltfModel: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private animations: { [key: string]: THREE.AnimationAction } = {};
  private currentAction: THREE.AnimationAction | null = null;
  public static readonly MIN_ACTION_DWELL_TIME: number = 0.15; // 150ms minimum dwell time
  public currentActionName: string = 'stand';
  public actionDwellTime: number = 0;

  // --- Slope Pitch & Dynamic Stride Kinematics State ---
  public currentSlopePitch: number = 0;
  public currentBankRoll: number = 0;
  private previousYaw: number = 0;
  public static readonly MAX_SLOPE_PITCH_RAD = 0.14; // ~8 deg max natural feline ramp alignment
  public static readonly BASE_WALK_SPEED = 2.6;
  public static readonly BASE_RUN_SPEED = 6.2;

  private walkCycle: number = 0;
  private tailWagPhase: number = 0;
  public isCrouching: boolean = false;
  public isPouncing: boolean = false;

  // Cached materials for zero runtime reallocation
  private static sharedTuxedoMaterial: THREE.MeshStandardMaterial | null = null;
  private static sharedBlackFurMaterial: THREE.MeshStandardMaterial | null = null;
  private static sharedWhiteFurMaterial: THREE.MeshStandardMaterial | null = null;
  private static sharedPinkInnerMaterial: THREE.MeshStandardMaterial | null = null;
  private static sharedGreenEyeMaterial: THREE.MeshStandardMaterial | null = null;
  private static sharedBrassMaterial: THREE.MeshStandardMaterial | null = null;
  private static sharedOrangeCollarMaterial: THREE.MeshStandardMaterial | null = null;

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
    currentScale: 1.8,
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

    // Cache / initialize materials up front to eliminate startup shader compilation hitches
    if (!CatCharacter.sharedBlackFurMaterial) {
      CatCharacter.sharedBlackFurMaterial = new THREE.MeshStandardMaterial({
        color: 0x111113,
        map: TextureGenerator.createVelvetFurTexture(),
        normalMap: TextureGenerator.createFurNormalTexture(),
        roughnessMap: TextureGenerator.createFurRoughnessTexture(),
        roughness: 0.8,
        metalness: 0.05
      });
    }

    if (!CatCharacter.sharedWhiteFurMaterial) {
      CatCharacter.sharedWhiteFurMaterial = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.85,
        metalness: 0.02
      });
    }

    if (!CatCharacter.sharedPinkInnerMaterial) {
      CatCharacter.sharedPinkInnerMaterial = new THREE.MeshStandardMaterial({
        color: 0xfb7185,
        roughness: 0.55
      });
    }

    if (!CatCharacter.sharedGreenEyeMaterial) {
      CatCharacter.sharedGreenEyeMaterial = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.55,
        roughness: 0.08,
        metalness: 0.1
      });
    }

    if (!CatCharacter.sharedBrassMaterial) {
      CatCharacter.sharedBrassMaterial = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        metalness: 0.95,
        roughness: 0.15
      });
    }

    if (!CatCharacter.sharedOrangeCollarMaterial) {
      CatCharacter.sharedOrangeCollarMaterial = new THREE.MeshStandardMaterial({
        color: 0xea580c,
        roughness: 0.45,
        metalness: 0.1
      });
    }

    if (!CatCharacter.sharedTuxedoMaterial) {
      CatCharacter.sharedTuxedoMaterial = new THREE.MeshStandardMaterial({
        color: 0x121214,
        map: TextureGenerator.createVelvetFurTexture(),
        normalMap: TextureGenerator.createFurNormalTexture(),
        roughnessMap: TextureGenerator.createFurRoughnessTexture(),
        roughness: 0.75,
        metalness: 0.08,
        side: THREE.DoubleSide
      });
    }

    const blackFurMat = CatCharacter.sharedBlackFurMaterial;
    const whiteFurMat = CatCharacter.sharedWhiteFurMaterial;
    const pinkInnerMat = CatCharacter.sharedPinkInnerMaterial;
    const greenEyeMat = CatCharacter.sharedGreenEyeMaterial;
    const brassTagMat = CatCharacter.sharedBrassMaterial;

    // 1. Anatomical Feline Spine & Muscular Torso (Tapered ribcage + muscular rear haunches)
    const ribcageGeo = new THREE.SphereGeometry(0.14, 16, 16);
    ribcageGeo.scale(0.9, 1.0, 1.25);
    const ribcage = new THREE.Mesh(ribcageGeo, blackFurMat);
    ribcage.position.set(0, 0.33, 0.12);
    ribcage.castShadow = true;
    proceduralGroup.add(ribcage);

    const spineGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.28, 12);
    spineGeo.rotateX(Math.PI / 2);
    this.body = new THREE.Mesh(spineGeo, blackFurMat);
    this.body.position.set(0, 0.33, -0.05);
    this.body.castShadow = true;
    proceduralGroup.add(this.body);

    const pelvisGeo = new THREE.SphereGeometry(0.135, 16, 16);
    pelvisGeo.scale(0.95, 1.05, 1.15);
    const pelvis = new THREE.Mesh(pelvisGeo, blackFurMat);
    pelvis.position.set(0, 0.34, -0.22);
    pelvis.castShadow = true;
    proceduralGroup.add(pelvis);

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

    const muzzleL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), whiteFurMat);
    muzzleL.position.set(-0.035, -0.04, 0.11);
    muzzleL.scale.set(0.9, 0.7, 0.9);
    const muzzleR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), whiteFurMat);
    muzzleR.position.set(0.035, -0.04, 0.11);
    muzzleR.scale.set(0.9, 0.7, 0.9);
    this.head.add(muzzleL, muzzleR);

    const noseGeo = new THREE.ConeGeometry(0.018, 0.02, 4);
    noseGeo.rotateX(Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeo, pinkInnerMat);
    noseMesh.position.set(0, -0.025, 0.155);
    this.head.add(noseMesh);

    const eyeGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const leftEye = new THREE.Mesh(eyeGeo, greenEyeMat);
    leftEye.position.set(-0.048, 0.022, 0.115);
    const rightEye = new THREE.Mesh(eyeGeo, greenEyeMat);
    rightEye.position.set(0.048, 0.022, 0.115);
    this.head.add(leftEye, rightEye);

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
    this.collarGroup = new THREE.Group();

    const collarGeo = new THREE.CylinderGeometry(0.052, 0.055, 0.024, 24, 1, true);
    this.collar = new THREE.Mesh(collarGeo, CatCharacter.sharedOrangeCollarMaterial);
    this.collar.castShadow = true;
    this.collarGroup.add(this.collar);

    const buckleMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.2 });
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.022, 0.008), buckleMat);
    buckle.position.set(0, -0.003, 0.049);
    this.collarGroup.add(buckle);

    const tagGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.003, 12);
    tagGeo.rotateX(Math.PI / 2);
    this.dosimeterTag = new THREE.Mesh(tagGeo, brassTagMat);
    this.dosimeterTag.position.set(0, -0.018, 0.053);
    this.dosimeterTag.castShadow = true;
    this.collarGroup.add(this.dosimeterTag);

    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.9,
      roughness: 0.2
    });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.25 });

    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.018, 0.012), housingMat);
    housing.position.set(0, 0.005, -0.049);
    housing.rotateX(Math.PI);

    this.dosimeterScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 0.012), screenMat);
    this.dosimeterScreen.position.set(0, 0, -0.007);
    this.dosimeterScreen.rotateY(Math.PI);
    housing.add(this.dosimeterScreen);
    this.collarGroup.add(housing);

    this.dosimeterLight = new THREE.PointLight(0x06b6d4, 0.4, 0.8);
    this.dosimeterLight.position.set(0, 0.01, -0.052);
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

      const upperGeo = new THREE.CylinderGeometry(0.028, 0.024, 0.24, 8);
      const upperMesh = new THREE.Mesh(upperGeo, blackFurMat);
      upperMesh.position.set(0, -0.1, 0);
      upperMesh.castShadow = true;
      legGroup.add(upperMesh);

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

    // 6. Load Real 3D Quadruped Cat GLB Model
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      CatCharacter.diagnosticFlags.gltfFetchAttempted = true;
      this.readyPromise = ModelManager.loadCatModel().then((gltf) => {
        this.gltfModel = gltf.scene;
        CatCharacter.diagnosticFlags.gltfLoadSuccess = true;
        CatCharacter.diagnosticFlags.gltfChildCount = gltf.scene.children.length;
        CatCharacter.diagnosticFlags.activeMeshMode = 'GLTF';

        this.gltfModel.scale.set(1.8, 1.8, 1.8);
        this.gltfModel.position.set(0, 0, 0);
        this.gltfModel.rotation.y = 0;
        CatCharacter.diagnosticFlags.currentScale = 1.8;

        let meshCnt = 0;
        let vertCnt = 0;
        let boneCnt = 0;
        let hasSkinned = false;

        this.gltfModel.traverse((child) => {
          if ((child as THREE.Bone).isBone) {
            boneCnt++;
            const name = child.name;
            if (name === 'RigNeck1_00' || name === 'RigNeck2_014' || name.toLowerCase().includes('neck')) {
              if (!this.neckBone || name === 'RigNeck1_00') {
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
            mesh.frustumCulled = false;

            if (mesh.geometry && mesh.geometry.attributes.position) {
              vertCnt += mesh.geometry.attributes.position.count;
            }

            // Bind high-contrast velvet tuxedo coat and eliminate any white box material glitch
            if (mesh.material && CatCharacter.sharedTuxedoMaterial) {
              mesh.material = CatCharacter.sharedTuxedoMaterial;
            }
          }
        });

        CatCharacter.diagnosticFlags.meshCount = meshCnt;
        CatCharacter.diagnosticFlags.totalVertices = vertCnt;
        CatCharacter.diagnosticFlags.boneCount = boneCnt;
        CatCharacter.diagnosticFlags.hasSkinnedMesh = hasSkinned;
        CatCharacter.diagnosticFlags.modelRootY = this.gltfModel.position.y;

        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.gltfModel);
          gltf.animations.forEach((clip) => {
            const action = this.mixer!.clipAction(clip);
            this.animations[clip.name] = action;
            this.animations[clip.name.toLowerCase()] = action;
          });

          this.animations['stand'] = this.animations['Cat|Idle_00-IP'] || this.animations['Cat|A_Idle_00'] || Object.values(this.animations)[0];
          this.animations['idle'] = this.animations['stand'];
          this.animations['sit'] = this.animations['Cat|Sitting_00-IP'] || this.animations['Cat|Sitting_00'] || this.animations['stand'];
          this.animations['walk_straight'] = this.animations['Cat|Walk-IP'] || this.animations['Cat|Walk'] || this.animations['stand'];
          this.animations['walk'] = this.animations['walk_straight'];
          this.animations['turn_left'] = this.animations['Cat|Walk_L-IP'] || this.animations['Cat|Walk_L'] || this.animations['walk_straight'];
          this.animations['turn_right'] = this.animations['Cat|Walk_R-IP'] || this.animations['Cat|Walk_R'] || this.animations['walk_straight'];
          this.animations['run'] = this.animations['Cat|Run-IP'] || this.animations['Cat|Sprint-IP'] || this.animations['Cat|Run'] || this.animations['walk_straight'];
          this.animations['jump'] = this.animations['Cat|Jump_Trot-IP'] || this.animations['Cat|Jump_Up-IP'] || this.animations['Cat|Jump_Up'] || this.animations['run'];
          this.animations['pounce'] = this.animations['Cat|Jump_Run-IP'] || this.animations['Cat|Jump_Run'] || this.animations['jump'];
          this.animations['attack'] = this.animations['Cat|Attack_Agressive_Legs_01-IP'] || this.animations['Cat|Attack_Left-IP'] || this.animations['Cat|Attack_Right-IP'] || this.animations['stand'];
          this.animations['eat'] = this.animations['Cat|Eating_01-IP'] || this.animations['Cat|Eating_02-IP'] || this.animations['Cat|Eating_01'] || this.animations['stand'];

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

        if (this.gltfModel && this.gltfModel.children.length > 0) {
          this.mesh.remove(this.proceduralGroup);
          this.proceduralGroup.visible = false;

          if (this.collarGroup) {
            this.collarGroup.scale.set(1.85, 1.85, 1.85);
            this.mesh.add(this.collarGroup);
          }
        }

        // Bounding box calculation using scratch allocation
        CatCharacter.scratchBBox.setFromObject(this.mesh);
        CatCharacter.scratchBBox.getSize(CatCharacter.scratchBBoxSize);
        CatCharacter.diagnosticFlags.boundingBoxSize = {
          x: CatCharacter.scratchBBoxSize.x,
          y: CatCharacter.scratchBBoxSize.y,
          z: CatCharacter.scratchBBoxSize.z
        };
      }).catch((err: unknown) => {
        console.warn('GLTF Cat load fallback note:', err);
        CatCharacter.diagnosticFlags.gltfError = err instanceof Error ? err.message : String(err);
        CatCharacter.diagnosticFlags.activeMeshMode = 'PROCEDURAL';
        this.proceduralGroup.visible = true;
      });
    }
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

  public restTimer: number = 0;
  public wellRestedTimer: number = 0;

  public triggerRest(duration: number = 3.5) {
    this.restTimer = duration;
    this.wellRestedTimer = 600;
  }

  public get isWellRested(): boolean {
    return this.wellRestedTimer > 0;
  }

  public animate(deltaTime: number, speed: number, isGrounded: boolean, turnInput: number = 0) {
    this.animTime += deltaTime;

    if (speed > 0.05) {
      this.idleTimer = 0;
    } else {
      this.idleTimer += deltaTime;
    }

    this.actionDwellTime += deltaTime;

    if (this.attackTimer > 0) this.attackTimer -= deltaTime;
    if (this.eatTimer > 0) this.eatTimer -= deltaTime;
    if (this.restTimer > 0) this.restTimer -= deltaTime;
    if (this.wellRestedTimer > 0) this.wellRestedTimer -= deltaTime;

    // 1. Update GLTF Skeletal Animation Mixer
    if (this.mixer) {
      this.mixer.update(deltaTime);

      let targetName = 'stand';
      let isHighPriorityAction = false;

      if (this.attackTimer > 0 && this.animations['attack']) {
        targetName = 'attack';
        isHighPriorityAction = true;
      } else if (this.eatTimer > 0 && this.animations['eat']) {
        targetName = 'eat';
        isHighPriorityAction = true;
      } else if (this.restTimer > 0 && this.animations['sit']) {
        targetName = 'sit';
        isHighPriorityAction = true;
      } else if (this.isPouncing && this.animations['pounce']) {
        targetName = 'pounce';
        isHighPriorityAction = true;
      } else if (!isGrounded && this.animations['jump']) {
        targetName = 'jump';
        isHighPriorityAction = true;
      } else {
        const currentLoco = this.currentActionName;
        const isRunning = (currentLoco === 'run') ? (speed > 4.6) : (speed > 5.2);

        if (isRunning) {
          targetName = 'run';
        } else {
          const isWalking = (currentLoco === 'walk_straight' || currentLoco === 'turn_left' || currentLoco === 'turn_right')
            ? (speed > 0.08)
            : (speed > 0.20);

          if (isWalking) {
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
            if (this.idleTimer >= 12.0) {
              targetName = 'sit';
            } else {
              targetName = 'stand';
            }
          }
        }
      }

      if (targetName !== this.currentActionName) {
        const isExitingSpecialAction = (this.currentActionName === 'pounce' || this.currentActionName === 'jump' || this.currentActionName === 'attack' || this.currentActionName === 'eat');
        if (isHighPriorityAction || isExitingSpecialAction || this.actionDwellTime >= CatCharacter.MIN_ACTION_DWELL_TIME) {
          const targetAction = this.animations[targetName] || this.animations['stand'] || Object.values(this.animations)[0];
          if (targetAction) {
            if (targetAction !== this.currentAction) {
              const fadeDuration = 0.15;
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
        this.gltfModel.rotation.x = THREE.MathUtils.lerp(this.gltfModel.rotation.x, -0.35, deltaTime * 14);
        this.gltfModel.position.y = THREE.MathUtils.lerp(this.gltfModel.position.y, 0.1, deltaTime * 14);
      } else if (!isGrounded) {
        this.gltfModel.rotation.x = THREE.MathUtils.lerp(this.gltfModel.rotation.x, -0.15, deltaTime * 8);
      } else if (this.isCrouching) {
        this.gltfModel.position.y = THREE.MathUtils.lerp(this.gltfModel.