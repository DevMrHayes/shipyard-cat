import * as THREE from 'three';
import { ModelManager } from '../core/ModelManager';
import { soundEngine } from '../core/SoundEngine';

export type RatAIState = 'FORAGING' | 'SUSPICIOUS' | 'FLEEING' | 'CAUGHT';

export class RatEntity {
  public mesh: THREE.Group;
  public state: RatAIState = 'FORAGING';
  public isKingpin: boolean = false;
  public bossPhase: 1 | 2 | 3 = 1;
  public invulnerableTimer: number = 0;
  public nutritionValue: number = 30;
  public name: string = 'Shipyard Rat';
  public health: number = 1;
  public maxHealth: number = 1;
  public isStunned: boolean = false;
  public stunTimer: number = 0;
  public attackCooldown: number = 0;

  private moveSpeed: number = 2.4;
  private patrolTarget: THREE.Vector3;
  private spawnOrigin: THREE.Vector3;
  private alertTimer: number = 0;
  private runCycle: number = 0;
  private bodyMesh: THREE.Mesh | null = null;
  private tailMesh: THREE.Line | null = null;
  private panicBurstSpeed: number = 1.0;
  private panicSqueakTimer: number = 0;

  public gltfModel: THREE.Group | null = null;
  public mixer: THREE.AnimationMixer | null = null;
  private animations: { [key: string]: THREE.AnimationAction } = {};
  private currentAction: THREE.AnimationAction | null = null;

  // Thermal Whiskers Senses Components
  public thermalAura: THREE.Mesh;
  public thermalLight: THREE.PointLight;
  public scentTrailParticles: THREE.Points;
  private scentPositions: Float32Array;
  private scentHeadIndex: number = 0;
  private scentTimer: number = 0;

  public static diagnosticFlags = {
    gltfFetchAttempted: false,
    gltfLoadSuccess: false,
    childCount: 0,
    activeMode: 'PROCEDURAL' as 'PROCEDURAL' | 'GLTF' | 'HYBRID_DEBUG',
    scaleMultiplier: 1.0,
    forcedMagenta: false
  };

  private static lastGlobalSqueakTime: number = -100;
  private static readonly MIN_GLOBAL_SQUEAK_INTERVAL: number = 3.5;

  public proceduralGroup: THREE.Group;
  public readyPromise: Promise<void> = Promise.resolve();

  private static standardRatMat: THREE.MeshStandardMaterial | null = null;
  private static kingpinRatMat: THREE.MeshStandardMaterial | null = null;

  public static getRatMaterial(isKingpin: boolean): THREE.MeshStandardMaterial {
    if (isKingpin) {
      if (!this.kingpinRatMat) {
        this.kingpinRatMat = new THREE.MeshStandardMaterial({
          color: 0x1a0f0a, // Rich dark chocolate rodent brown for boss
          roughness: 0.75,
          metalness: 0.1,
          side: THREE.DoubleSide
        });
      }
      return this.kingpinRatMat;
    } else {
      if (!this.standardRatMat) {
        this.standardRatMat = new THREE.MeshStandardMaterial({
          color: 0x3d2618, // Rodent brown
          roughness: 0.75,
          metalness: 0.1,
          side: THREE.DoubleSide
        });
      }
      return this.standardRatMat;
    }
  }

  constructor(position: THREE.Vector3, isKingpin: boolean = false) {
    this.isKingpin = isKingpin;
    this.spawnOrigin = position.clone();
    this.patrolTarget = position.clone();
    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);

    const scale = isKingpin ? 2.0 : 1.0;
    this.nutritionValue = isKingpin ? 100 : 30;
    this.name = isKingpin ? "Dockyard Kingpin (Mini-Boss)" : "Shipyard Rat";
    this.maxHealth = isKingpin ? 3 : 1;
    this.health = this.maxHealth;

    this.proceduralGroup = new THREE.Group();
    const proceduralGroup = this.proceduralGroup;
    this.mesh.add(proceduralGroup);

    // Load Real 3D Rat GLB Model (in browser)
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      RatEntity.diagnosticFlags.gltfFetchAttempted = true;
      this.readyPromise = ModelManager.loadRatModel().then((gltf) => {
        this.gltfModel = gltf.scene;
        RatEntity.diagnosticFlags.gltfLoadSuccess = true;
        RatEntity.diagnosticFlags.childCount = gltf.scene.children.length;
        RatEntity.diagnosticFlags.activeMode = 'GLTF';

        // Center and scale 3D rat model (compute bounding box to zero root offset)
        const baseScale = isKingpin ? 0.65 : 0.35;
        const finalScale = baseScale * RatEntity.diagnosticFlags.scaleMultiplier;
        this.gltfModel.scale.set(finalScale, finalScale, finalScale);

        const box = new THREE.Box3().setFromObject(this.gltfModel);
        const center = box.getCenter(new THREE.Vector3());
        this.gltfModel.position.set(-center.x, -box.min.y, -center.z);

        const ratFurMat = RatEntity.getRatMaterial(isKingpin);

        this.gltfModel.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            (child as THREE.Mesh).material = ratFurMat;
          }
        });

        // Bind Skeletal Animations (Eat, Idle, Run)
        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.gltfModel);
          gltf.animations.forEach((clip) => {
            const action = this.mixer!.clipAction(clip);
            const name = clip.name.toLowerCase();
            this.animations[name] = action;
            if (name.includes('idle')) this.animations['idle'] = action;
            if (name.includes('run')) this.animations['run'] = action;
            if (name.includes('eat')) this.animations['eat'] = action;
            action.enabled = true;
            action.setEffectiveWeight(1.0);
            action.play();
          });

          // Pre-evaluate 1 mixer tick to bind bone tracks ahead of gameplay
          this.mixer.update(0.016);

          const initialAction = this.animations['run'] || this.animations['idle'] || Object.values(this.animations)[0];
          if (initialAction) {
            initialAction.play();
            this.currentAction = initialAction;
            this.mixer.update(0);
          }
        }

        this.mesh.add(this.gltfModel);
        this.mesh.remove(proceduralGroup);
        proceduralGroup.visible = false;
      }).catch(() => {
        proceduralGroup.visible = true;
      });
    }

    const ratMat = new THREE.MeshStandardMaterial({
      color: isKingpin ? 0x271e16 : 0x524b45,
      roughness: 0.85
    });

    const eyeMat = new THREE.MeshStandardMaterial({
      color: isKingpin ? 0xef4444 : 0x111111,
      emissive: isKingpin ? 0xdc2626 : 0x000000,
      emissiveIntensity: isKingpin ? 0.8 : 0
    });

    // Body
    const bodyGeo = new THREE.CapsuleGeometry(0.12 * scale, 0.28 * scale, 6, 8);
    bodyGeo.rotateX(Math.PI / 2);
    this.bodyMesh = new THREE.Mesh(bodyGeo, ratMat);
    this.bodyMesh.position.y = 0.12 * scale;
    this.bodyMesh.castShadow = true;
    proceduralGroup.add(this.bodyMesh);

    // Head & Snout
    const headGeo = new THREE.ConeGeometry(0.08 * scale, 0.2 * scale, 6);
    headGeo.rotateX(Math.PI / 2);
    const headMesh = new THREE.Mesh(headGeo, ratMat);
    headMesh.position.set(0, 0.12 * scale, 0.22 * scale);
    proceduralGroup.add(headMesh);

    // Pink Ears
    const earMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.5 });
    const earGeo = new THREE.SphereGeometry(0.035 * scale, 6, 6);
    earGeo.scale(0.8, 1.2, 0.3);
    const earL = new THREE.Mesh(earGeo, earMat);
    earL.position.set(-0.06 * scale, 0.2 * scale, 0.16 * scale);
    const earR = new THREE.Mesh(earGeo, earMat);
    earR.position.set(0.06 * scale, 0.2 * scale, 0.16 * scale);
    proceduralGroup.add(earL, earR);

    // Glowing Eyes
    const eyeGeo = new THREE.SphereGeometry(0.02 * scale, 6, 6);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.04 * scale, 0.16 * scale, 0.24 * scale);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.04 * scale, 0.16 * scale, 0.24 * scale);
    proceduralGroup.add(leftEye, rightEye);

    // 4 Articulated Tiny Rat Paws
    const pawMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.6 });
    const legGeo = new THREE.CylinderGeometry(0.015 * scale, 0.015 * scale, 0.08 * scale, 6);
    const legFL = new THREE.Mesh(legGeo, pawMat);
    legFL.position.set(-0.06 * scale, 0.04 * scale, 0.12 * scale);
    const legFR = new THREE.Mesh(legGeo, pawMat);
    legFR.position.set(0.06 * scale, 0.04 * scale, 0.12 * scale);
    const legBL = new THREE.Mesh(legGeo, pawMat);
    legBL.position.set(-0.07 * scale, 0.04 * scale, -0.12 * scale);
    const legBR = new THREE.Mesh(legGeo, pawMat);
    legBR.position.set(0.07 * scale, 0.04 * scale, -0.12 * scale);
    proceduralGroup.add(legFL, legFR, legBL, legBR);

    // Tail
    const tailPoints = [
      new THREE.Vector3(0, 0.1 * scale, -0.15 * scale),
      new THREE.Vector3(0.04 * scale, 0.08 * scale, -0.3 * scale),
      new THREE.Vector3(-0.02 * scale, 0.05 * scale, -0.45 * scale)
    ];
    const tailGeo = new THREE.BufferGeometry().setFromPoints(tailPoints);
    const tailMat = new THREE.LineBasicMaterial({ color: 0xf43f5e, linewidth: 2 });
    this.tailMesh = new THREE.Line(tailGeo, tailMat);
    proceduralGroup.add(this.tailMesh);

    // --- WHISKERS THERMAL AURA ---
    const auraGeo = new THREE.SphereGeometry(0.4 * scale, 12, 12);
    const auraMat = new THREE.MeshBasicMaterial({
      color: isKingpin ? 0xff0055 : 0xff7700, // Bright infrared thermal glow
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });
    this.thermalAura = new THREE.Mesh(auraGeo, auraMat);
    this.thermalAura.position.y = 0.2 * scale;
    this.thermalAura.visible = false;
    this.mesh.add(this.thermalAura);

    this.thermalLight = new THREE.PointLight(isKingpin ? 0xff0055 : 0xff8800, 0, 10);
    this.thermalLight.position.y = 0.5;
    // Detached from mesh: rats use thermalAura mesh and emissive eyes to eliminate GPU forward light pass overhead
    // this.mesh.add(this.thermalLight);

    // --- SCENT FOOTSTEP TRAIL PARTICLES ---
    const scentCount = 30;
    this.scentPositions = new Float32Array(scentCount * 3);
    for (let i = 0; i < scentCount * 3; i += 3) {
      this.scentPositions[i] = position.x;
      this.scentPositions[i + 1] = 0.05;
      this.scentPositions[i + 2] = position.z;
    }
    const scentGeo = new THREE.BufferGeometry();
    scentGeo.setAttribute('position', new THREE.BufferAttribute(this.scentPositions, 3));
    const scentMat = new THREE.PointsMaterial({
      color: isKingpin ? 0xff2266 : 0x38bdf8,
      size: 0.22,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    this.scentTrailParticles = new THREE.Points(scentGeo, scentMat);
    this.scentTrailParticles.visible = false;
  }

  public setWhiskersMode(active: boolean) {
    this.thermalAura.visible = active && this.state !== 'CAUGHT';
    this.thermalLight.intensity = active && this.state !== 'CAUGHT' ? (this.isKingpin ? 3.0 : 1.8) : 0;
    this.scentTrailParticles.visible = active && this.state !== 'CAUGHT';
  }

  // Static Scratch Vectors for Zero Runtime Garbage Collection
  private static readonly scratchLungeDir = new THREE.Vector3();
  private static readonly scratchFleeDir = new THREE.Vector3();
  private static readonly scratchPatrolOffset = new THREE.Vector3();
  private static readonly scratchDir = new THREE.Vector3();
  private static readonly scratchToCat = new THREE.Vector3();
  private static readonly scratchRatForward = new THREE.Vector3();
  private static readonly DRY_DOCK_CRATE_PERCH = new THREE.Vector3(42.5, -0.7, -22.5);

  /**
   * Evaluates 90-degree forward vision cone and auditory stealth radius based on Alba's posture.
   */
  public evaluateSensoryInput(
    catPosition: THREE.Vector3,
    catCrouching: boolean,
    catSprinting: boolean = false,
    catPouncing: boolean = false,
    inShadowZone: boolean = false
  ): 'NONE' | 'SUSPICIOUS' | 'DETECTED' {
    RatEntity.scratchToCat.subVectors(catPosition, this.mesh.position);
    const verticalDelta = Math.abs(RatEntity.scratchToCat.y);
    RatEntity.scratchToCat.y = 0;
    const dist = RatEntity.scratchToCat.length();

    if (dist > 22.0 || verticalDelta > 4.5) return 'NONE';

    // 1. Auditory Hearing Detection Radius
    let hearingRadius = 6.0; // Normal walking footsteps
    if (catSprinting || catPouncing) {
      hearingRadius = 14.0; // Loud sprint / pounce alerts vermin around corners
    } else if (catCrouching) {
      hearingRadius = 2.5; // Whisper-quiet stealth prowl
    }

    if (dist <= hearingRadius) {
      return (catSprinting || catPouncing || dist < 3.2) ? 'DETECTED' : 'SUSPICIOUS';
    }

    // 2. 90-Degree Forward Vision Cone (dot > 0.7071)
    const visionRange = inShadowZone ? 4.5 : 12.0;
    if (dist <= visionRange && dist > 0.001) {
      RatEntity.scratchToCat.multiplyScalar(1 / dist);
      RatEntity.scratchRatForward.set(0, 0, 1).applyQuaternion(this.mesh.quaternion);
      RatEntity.scratchRatForward.y = 0;
      RatEntity.scratchRatForward.normalize();

      const dot = RatEntity.scratchRatForward.dot(RatEntity.scratchToCat);
      if (dot > 0.7071) {
        if (dist < visionRange * 0.55 || !catCrouching) {
          return 'DETECTED';
        }
        return 'SUSPICIOUS';
      }
    }

    return 'NONE';
  }

  public update(
    deltaTime: number,
    catPosition: THREE.Vector3,
    catIsCrouching: boolean,
    skipMixer: boolean = false,
    catIsSprinting: boolean = false,
    catIsPouncing: boolean = false,
    inShadowZone: boolean = false
  ) {
    if (this.mixer && !skipMixer) {
      this.mixer.update(deltaTime);
      const isMoving = this.state === 'FLEEING' || this.state === 'FORAGING' || this.isKingpin;
      const targetAnim = isMoving ? (this.animations['run'] || this.animations['eat']) : this.animations['idle'];
      if (targetAnim && targetAnim !== this.currentAction) {
        if (this.currentAction) this.currentAction.fadeOut(0.2);
        targetAnim.reset().fadeIn(0.2).play();
        this.currentAction = targetAnim;
      }
    }

    if (this.state === 'CAUGHT') {
      this.mesh.visible = false;
      this.thermalAura.visible = false;
      this.thermalLight.intensity = 0;
      this.scentTrailParticles.visible = false;
      return;
    }

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - deltaTime);
    }

    // Handle Stun
    if (this.isStunned) {
      this.stunTimer -= deltaTime;
      if (this.stunTimer <= 0) {
        this.isStunned = false;
      }
      return;
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }

    const distToCat = this.mesh.position.distanceTo(catPosition);

    // Dockyard Kingpin Multi-Phase Combat AI
    if (this.isKingpin) {
      // Phase 2: High Ground Overwatch Retreat atop Dry Dock 1 Crate Stack
      if (this.bossPhase === 2) {
        const distToPerch = this.mesh.position.distanceTo(RatEntity.DRY_DOCK_CRATE_PERCH);
        if (distToPerch > 0.4) {
          const retreatDir = RatEntity.scratchDir.subVectors(RatEntity.DRY_DOCK_CRATE_PERCH, this.mesh.position).normalize();
          this.mesh.position.addScaledVector(retreatDir, this.moveSpeed * 2.0 * deltaTime);
          this.mesh.rotation.y = Math.atan2(retreatDir.x, retreatDir.z);
        } else {
          // Perched atop crates: menace Alba below
          this.mesh.position.copy(RatEntity.DRY_DOCK_CRATE_PERCH);
          RatEntity.scratchToCat.subVectors(catPosition, this.mesh.position);
          this.mesh.rotation.y = Math.atan2(RatEntity.scratchToCat.x, RatEntity.scratchToCat.z);
          // Lunge if Alba leaps up onto the crates within 3.5m
          if (distToCat < 3.5 && this.attackCooldown <= 0) {
            this.attackCooldown = 2.0;
            const lungeDir = RatEntity.scratchLungeDir.subVectors(catPosition, this.mesh.position).normalize();
            lungeDir.y = 0;
            this.mesh.position.addScaledVector(lungeDir, this.moveSpeed * 1.5 * deltaTime);
          }
        }
        return;
      }

      // Phase 3: Berserk Frenzied Charge (1.6x speed, serpentine weave, relentless pursuit)
      if (this.bossPhase === 3) {
        if (distToCat > 0.2) {
          const lungeDir = RatEntity.scratchLungeDir.subVectors(catPosition, this.mesh.position).normalize();
          lungeDir.y = 0;
          // Aggressive serpentine charge weave
          const weave = Math.sin(this.runCycle * 2.2) * 0.35;
          const perpX = -lungeDir.z * weave;
          const perpZ = lungeDir.x * weave;
          lungeDir.x += perpX;
          lungeDir.z += perpZ;
          lungeDir.normalize();

          this.mesh.position.addScaledVector(lungeDir, this.moveSpeed * 1.6 * deltaTime);
          this.mesh.rotation.y = Math.atan2(lungeDir.x, lungeDir.z);
        }
        return;
      }

      // Phase 1: Heavy Lunge Attacks & Dry Dock 1 Basin Patrol
      if (distToCat < 4.5 && this.attackCooldown <= 0) {
        const lungeDir = RatEntity.scratchLungeDir.subVectors(catPosition, this.mesh.position).normalize();
        lungeDir.y = 0;
        this.mesh.position.addScaledVector(lungeDir, this.moveSpeed * 1.8 * deltaTime);
        this.mesh.rotation.y = Math.atan2(lungeDir.x, lungeDir.z);
      } else {
        const time = Date.now() * 0.001;
        const radius = 1.6;
        this.mesh.position.x = this.spawnOrigin.x + Math.sin(time * 0.8) * radius;
        this.mesh.position.z = this.spawnOrigin.z + Math.cos(time * 0.8) * radius;
        this.mesh.rotation.y = time * 0.8 + Math.PI / 2;
      }
      return;
    }

    // Standard Vermin AI with Vision Cone & Auditory Senses
    const perception = this.evaluateSensoryInput(catPosition, catIsCrouching, catIsSprinting, catIsPouncing, inShadowZone);

    if (distToCat < 3.2 || perception === 'DETECTED') {
      if (this.state !== 'FLEEING') {
        this.state = 'FLEEING';
        this.panicBurstSpeed = 1.75;
        this.panicSqueakTimer = 1.0 + Math.random() * 2.0;
      }
    } else if (perception === 'SUSPICIOUS') {
      if (this.state === 'FORAGING') {
        this.state = 'SUSPICIOUS';
        this.alertTimer = 1.25;
      }
    } else if (this.state === 'FLEEING' && distToCat > 14) {
      this.state = 'FORAGING';
      this.panicBurstSpeed = 1.0;
    }

    // Suspicious scanning state (sniff air, pause)
    if (this.state === 'SUSPICIOUS') {
      this.alertTimer -= deltaTime;
      if (this.alertTimer <= 0) {
        this.state = 'FORAGING';
      }
      return;
    }

    // Fleeing state
    if (this.state === 'FLEEING') {
      this.panicBurstSpeed = Math.max(1.0, this.panicBurstSpeed - deltaTime * 0.45);

      this.panicSqueakTimer -= deltaTime;
      if (this.panicSqueakTimer <= 0) {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
        if (distToCat < 12.0 && (now - RatEntity.lastGlobalSqueakTime) >= RatEntity.MIN_GLOBAL_SQUEAK_INTERVAL) {
          RatEntity.lastGlobalSqueakTime = now;
          soundEngine.playSpatialSound('RAT_SQUEAK', this.mesh.position.x, this.mesh.position.y, this.mesh.position.z, 0.35);
          this.panicSqueakTimer = 4.5 + Math.random() * 4.0;
        } else {
          this.panicSqueakTimer = 1.5 + Math.random() * 2.0;
        }
      }

      const fleeDir = RatEntity.scratchFleeDir.subVectors(this.mesh.position, catPosition).normalize();
      fleeDir.y = 0;

      const perpX = -fleeDir.z;
      const perpZ = fleeDir.x;
      const zigzag = Math.sin(this.runCycle * 1.8) * 0.3;
      fleeDir.x += perpX * zigzag;
      fleeDir.z += perpZ * zigzag;
      fleeDir.normalize();

      const currentSpeed = this.moveSpeed * 2.4 * this.panicBurstSpeed;
      this.mesh.position.addScaledVector(fleeDir, currentSpeed * deltaTime);
      this.mesh.rotation.y = Math.atan2(fleeDir.x, fleeDir.z);
    } else if (this.state === 'FORAGING') {
      if (this.mesh.position.distanceTo(this.patrolTarget) < 0.5 || Math.random() < 0.008) {
        RatEntity.scratchPatrolOffset.set(
          (Math.random() - 0.5) * 8,
          0,
          (Math.random() - 0.5) * 8
        );
        this.patrolTarget.addVectors(this.spawnOrigin, RatEntity.scratchPatrolOffset);
      }
      const dir = RatEntity.scratchDir.subVectors(this.patrolTarget, this.mesh.position).normalize();
      dir.y = 0;
      this.mesh.position.addScaledVector(dir, this.moveSpeed * 0.7 * deltaTime);
      if (dir.lengthSq() > 0.001) {
        this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      }
    }

    // Run animation wobble & thermal pulse (accelerated on panic flee)
    const animRate = this.state === 'FLEEING' ? (20 * this.panicBurstSpeed) : 12;
    this.runCycle += deltaTime * animRate;
    if (this.bodyMesh) {
      this.bodyMesh.position.y = (this.isKingpin ? 0.22 : 0.12) + Math.abs(Math.sin(this.runCycle)) * 0.03;
    }

    if (this.thermalAura && this.thermalAura.visible) {
      const scale = 1.0 + Math.sin(Date.now() * 0.008) * 0.15;
      this.thermalAura.scale.set(scale, scale, scale);
    }

    // Update Scent Footsteps
    this.scentTimer += deltaTime;
    if (this.scentTimer > 0.15) {
      this.scentTimer = 0;
      const idx = this.scentHeadIndex * 3;
      this.scentPositions[idx] = this.mesh.position.x + (Math.random() - 0.5) * 0.1;
      this.scentPositions[idx + 1] = 0.06;
      this.scentPositions[idx + 2] = this.mesh.position.z + (Math.random() - 0.5) * 0.1;

      this.scentHeadIndex = (this.scentHeadIndex + 1) % (this.scentPositions.length / 3);
      if (this.scentTrailParticles.visible) {
        (this.scentTrailParticles.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      }
    }
  }

  public takeDamage(damage: number = 1, onPhaseChange?: (newPhase: 1 | 2 | 3) => void): boolean {
    if (this.state === 'CAUGHT' || this.invulnerableTimer > 0) return false;

    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      this.state = 'CAUGHT';
      this.mesh.visible = false;
      return true;
    }

    // Kingpin Boss Multi-Phase Transitions
    if (this.isKingpin) {
      this.invulnerableTimer = 1.2;

      if (this.health === 2) {
        this.bossPhase = 2;
        this.patrolTarget.copy(RatEntity.DRY_DOCK_CRATE_PERCH);
      } else if (this.health === 1) {
        this.bossPhase = 3;
        this.moveSpeed = 3.8;
        if (this.thermalLight) {
          this.thermalLight.color.setHex(0xff0022);
          this.thermalLight.intensity = 4.0;
        }
      }

      onPhaseChange?.(this.bossPhase);
    }

    return false;
  }

  public prewarmAnimations(): void {
    if (!this.mixer) return;
    const keys = ['idle', 'run', 'eat'];
    keys.forEach(k => {
      const act = this.animations[k];
      if (act) {
        act.enabled = true;
        act.setEffectiveWeight(1.0);
        act.play();
      }
    });
    this.mixer.update(0.016);
    const initialAction = this.animations['run'] || this.animations['idle'];
    if (initialAction) {
      initialAction.play();
      this.currentAction = initialAction;
    }
    this.mixer.update(0);
  }
}
