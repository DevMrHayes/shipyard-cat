import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class CatCharacter {
  public mesh: THREE.Group;
  public body: THREE.Mesh;
  public head: THREE.Group;
  public tailSegments: THREE.Mesh[] = [];
  public legs: { fl: THREE.Group; fr: THREE.Group; bl: THREE.Group; br: THREE.Group };
  public collar: THREE.Mesh;
  public dosimeterTag: THREE.Mesh;
  public whiskers: THREE.LineSegments[] = [];

  public gltfModel: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private animations: { [key: string]: THREE.AnimationAction } = {};
  private currentAction: THREE.AnimationAction | null = null;

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
    activeMeshMode: 'PROCEDURAL' as 'PROCEDURAL' | 'GLTF' | 'HYBRID_DEBUG',
    meshVisible: true,
    boundingBoxSize: { x: 0, y: 0, z: 0 }
  };

  public proceduralGroup: THREE.Group;

  constructor() {
    this.mesh = new THREE.Group();
    this.proceduralGroup = new THREE.Group();
    const proceduralGroup = this.proceduralGroup;
    this.mesh.add(this.proceduralGroup);

    // 1. Load Real 3D Quadruped Cat GLB Model
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      CatCharacter.diagnosticFlags.gltfFetchAttempted = true;
      const gltfLoader = new GLTFLoader();
      gltfLoader.load('/models/cat.glb', (gltf) => {
        this.gltfModel = gltf.scene;
        CatCharacter.diagnosticFlags.gltfLoadSuccess = true;
        CatCharacter.diagnosticFlags.gltfChildCount = gltf.scene.children.length;
        CatCharacter.diagnosticFlags.activeMeshMode = 'GLTF';

        // Cat model bounding box is ~30 units tall, 0.018 scale normalizes it to ~0.55m height
        this.gltfModel.scale.set(0.018, 0.018, 0.018);
        this.gltfModel.position.set(0, 0, 0);
        this.gltfModel.rotation.y = 0; // Face forward (+Z direction)

        // Traverse to enable shadows & disable frustum culling on animated bones
        this.gltfModel.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false; // CRITICAL: Prevents skinned mesh dropping out of camera frustum
            if (mesh.geometry) {
              mesh.geometry.computeBoundingBox();
              mesh.geometry.computeBoundingSphere();
            }

            // CRITICAL FIX: Ensure materials are fully opaque, double-sided, and not culled or alpha-masked out
            if (mesh.material) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(mat => {
                  mat.transparent = false;
                  mat.opacity = 1.0;
                  mat.depthWrite = true;
                  mat.side = THREE.DoubleSide;
                  mat.needsUpdate = true;
                });
              } else {
                mesh.material.transparent = false;
                mesh.material.opacity = 1.0;
                mesh.material.depthWrite = true;
                mesh.material.side = THREE.DoubleSide;
                mesh.material.needsUpdate = true;
              }
            }
          }
        });

        // Bind Skeletal Animation Mixer
        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.gltfModel);
          gltf.animations.forEach((clip) => {
            const action = this.mixer!.clipAction(clip);
            const name = clip.name.toLowerCase();
            this.animations[name] = action;
            // Also alias common animation names
            if (name.includes('idle')) this.animations['idle'] = action;
            if (name.includes('walk')) this.animations['walk'] = action;
            if (name.includes('run')) this.animations['run'] = action;
            if (name.includes('jump')) this.animations['jump'] = action;
            if (name.includes('attack')) this.animations['attack'] = action;
          });

          // Set default idle animation
          const idleAction = this.animations['idle'] || Object.values(this.animations)[0];
          if (idleAction) {
            idleAction.play();
            this.currentAction = idleAction;
          }
        }

        this.mesh.add(this.gltfModel);

        // Hide procedural fallback geometry only after verifying GLTF is attached
        if (this.gltfModel && this.gltfModel.children.length > 0) {
          this.proceduralGroup.visible = false;
        }

        // Measure bounding box for diagnostics
        const bbox = new THREE.Box3().setFromObject(this.mesh);
        const sz = new THREE.Vector3();
        bbox.getSize(sz);
        CatCharacter.diagnosticFlags.boundingBoxSize = { x: sz.x, y: sz.y, z: sz.z };
      }, undefined, (err) => {
        console.warn('GLTF Cat load fallback note:', err);
        CatCharacter.diagnosticFlags.gltfError = err instanceof Error ? err.message : String(err);
        CatCharacter.diagnosticFlags.activeMeshMode = 'PROCEDURAL';
        this.proceduralGroup.visible = true;
      });
    }

    // Material definitions (Tuxedo Cat: Sleek velvety black fur with white bib and white paws)
    const blackFurMat = new THREE.MeshStandardMaterial({
      color: 0x111113,
      roughness: 0.85,
      metalness: 0.05
    });

    const whiteFurMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.9,
      metalness: 0.02
    });

    const pinkInnerMat = new THREE.MeshStandardMaterial({
      color: 0xfb7185,
      roughness: 0.5
    });

    const greenEyeMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 0.45,
      roughness: 0.1
    });

    const collarMat = new THREE.MeshStandardMaterial({
      color: 0xf97316, // High-Vis Safety Orange
      roughness: 0.35,
      metalness: 0.3
    });

    const brassTagMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.9,
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
    const whiskerMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
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

    // 3. Thick Dark Brown Leather Collar with Digital Backlit LCD Dosimeter (Image 1 Parity)
    const leatherCollarMat = new THREE.MeshStandardMaterial({
      color: 0x3e2723, // Deep brown weathered harness leather
      roughness: 0.7,
      metalness: 0.1
    });

    const collarGeo = new THREE.CylinderGeometry(0.125, 0.13, 0.045, 24, 1, true);
    this.collar = new THREE.Mesh(collarGeo, leatherCollarMat);
    this.collar.position.set(0, 0.38, 0.25);
    this.collar.castShadow = true;
    proceduralGroup.add(this.collar);

    // Working Digital Collar Dosimeter Screen (Mounted on back of neck facing player camera)
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee }); // Glowing cyan digital LCD
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });

    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.03), housingMat);
    housing.position.set(0, 0.405, 0.22); // Placed prominently on nape of neck
    housing.rotateX(-0.35); // Angled upward toward player camera

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.028), screenMat);
    screen.position.set(0, 0, -0.016);
    screen.rotateY(Math.PI);
    housing.add(screen);

    proceduralGroup.add(housing);

    // Brass dosimeter medal tag
    const tagGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.006, 12);
    tagGeo.rotateX(Math.PI / 2);
    this.dosimeterTag = new THREE.Mesh(tagGeo, brassTagMat);
    this.dosimeterTag.position.set(0, 0.33, 0.36);
    this.dosimeterTag.castShadow = true;
    proceduralGroup.add(this.dosimeterTag);

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
  }

  // Combat Animation Timers
  public attackTimer: number = 0;
  public attackType: 'SWIPE_L' | 'SWIPE_R' | 'TAIL_SWEEP' | null = null;

  public triggerSwipe(isRight: boolean = false) {
    this.attackTimer = 0.25;
    this.attackType = isRight ? 'SWIPE_R' : 'SWIPE_L';
  }

  public triggerTailSweep() {
    this.attackTimer = 0.35;
    this.attackType = 'TAIL_SWEEP';
  }

  public animate(deltaTime: number, speed: number, isGrounded: boolean) {
    // 1. Update GLTF Skeletal Animation Mixer
    if (this.mixer) {
      this.mixer.update(deltaTime);

      // Determine appropriate animation clip based on locomotion state
      let targetName = 'survey'; // Default idle
      if (this.isPouncing || !isGrounded) {
        if (this.animations['run']) targetName = 'run';
        else if (this.animations['walk']) targetName = 'walk';
      } else if (speed > 5.0 && this.animations['run']) {
        targetName = 'run';
      } else if (speed > 0.1 && this.animations['walk']) {
        targetName = 'walk';
      } else if (this.animations['idle']) {
        targetName = 'idle';
      }

      const targetAction = this.animations[targetName] || Object.values(this.animations)[0];
      if (targetAction && targetAction !== this.currentAction) {
        if (this.currentAction) {
          this.currentAction.fadeOut(0.15);
        }
        targetAction.reset().fadeIn(0.15).play();
        this.currentAction = targetAction;
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

    // 1. Combat Strike Animation Overrides
    if (this.attackTimer > 0) {
      this.attackTimer -= deltaTime;
      const progress = 1.0 - (this.attackTimer / (this.attackType === 'TAIL_SWEEP' ? 0.35 : 0.25));

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
      if (!isGrounded) {
        // Mid-Air Jump Posture
        this.legs.fl.rotation.x = THREE.MathUtils.lerp(this.legs.fl.rotation.x, 0.45, deltaTime * 12);
        this.legs.fr.rotation.x = THREE.MathUtils.lerp(this.legs.fr.rotation.x, 0.45, deltaTime * 12);
        this.legs.bl.rotation.x = THREE.MathUtils.lerp(this.legs.bl.rotation.x, -0.55, deltaTime * 12);
        this.legs.br.rotation.x = THREE.MathUtils.lerp(this.legs.br.rotation.x, -0.55, deltaTime * 12);
        this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, 0.35, deltaTime * 12);
      } else if (speed > 0.1) {
        const cycleSpeed = this.isCrouching ? 4.5 : 7.5;
        this.walkCycle += deltaTime * speed * cycleSpeed;
        const swing = Math.sin(this.walkCycle) * (this.isCrouching ? 0.22 : 0.45);

        this.legs.fl.rotation.x = swing;
        this.legs.br.rotation.x = swing;
        this.legs.fr.rotation.x = -swing;
        this.legs.bl.rotation.x = -swing;

        // Spine & Head bob
        const bobAmount = this.isCrouching ? 0.01 : 0.025;
        const baseBodyY = this.isCrouching ? 0.18 : 0.32;
        this.body.position.y = baseBodyY + Math.abs(Math.sin(this.walkCycle * 2)) * bobAmount;
        this.head.position.y = (this.isCrouching ? 0.32 : 0.46) + Math.abs(Math.sin(this.walkCycle * 2)) * (bobAmount * 0.8);
      } else {
        // Idle breathing
        this.legs.fl.rotation.x = THREE.MathUtils.lerp(this.legs.fl.rotation.x, 0, deltaTime * 8);
        this.legs.fr.rotation.x = THREE.MathUtils.lerp(this.legs.fr.rotation.x, 0, deltaTime * 8);
        this.legs.bl.rotation.x = THREE.MathUtils.lerp(this.legs.bl.rotation.x, 0, deltaTime * 8);
        this.legs.br.rotation.x = THREE.MathUtils.lerp(this.legs.br.rotation.x, 0, deltaTime * 8);

        const baseBodyY = this.isCrouching ? 0.18 : 0.32;
        this.body.position.y = baseBodyY + Math.sin(Date.now() * 0.003) * 0.006;
        this.head.position.y = (this.isCrouching ? 0.32 : 0.46) + Math.sin(Date.now() * 0.003) * 0.004;
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
}
