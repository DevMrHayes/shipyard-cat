import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type RatAIState = 'FORAGING' | 'SUSPICIOUS' | 'FLEEING' | 'CAUGHT';

export class RatEntity {
  public mesh: THREE.Group;
  public state: RatAIState = 'FORAGING';
  public isKingpin: boolean = false;
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

  private gltfModel: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private animations: { [key: string]: THREE.AnimationAction } = {};
  private currentAction: THREE.AnimationAction | null = null;

  // Thermal Whiskers Senses Components
  public thermalAura: THREE.Mesh;
  public thermalLight: THREE.PointLight;
  public scentTrailParticles: THREE.Points;
  private scentPositions: Float32Array;
  private scentHeadIndex: number = 0;
  private scentTimer: number = 0;

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

    const proceduralGroup = new THREE.Group();
    this.mesh.add(proceduralGroup);

    // Load Real 3D Rat GLB Model (in browser)
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const gltfLoader = new GLTFLoader();
      gltfLoader.load('/models/rat.glb', (gltf) => {
        this.gltfModel = gltf.scene;
        // Normal scale: rat model height is ~1.0 unit, scale down to 0.35m
        const modelScale = (isKingpin ? 0.6 : 0.3);
        this.gltfModel.scale.set(modelScale, modelScale, modelScale);
        this.gltfModel.position.set(0, 0, 0);

        this.gltfModel.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            if (isKingpin) {
              // Darker scarred fur for Kingpin
              (child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
                color: 0x271e16,
                roughness: 0.8
              });
            }
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
          });

          const initialAction = this.animations['idle'] || Object.values(this.animations)[0];
          if (initialAction) {
            initialAction.play();
            this.currentAction = initialAction;
          }
        }

        this.mesh.add(this.gltfModel);
        proceduralGroup.visible = false;
      }, undefined, () => {
        // Fallback
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
    this.mesh.add(this.bodyMesh);

    // Head & Snout
    const headGeo = new THREE.ConeGeometry(0.08 * scale, 0.2 * scale, 6);
    headGeo.rotateX(Math.PI / 2);
    const headMesh = new THREE.Mesh(headGeo, ratMat);
    headMesh.position.set(0, 0.12 * scale, 0.22 * scale);
    this.mesh.add(headMesh);

    // Pink Ears
    const earMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.5 });
    const earGeo = new THREE.SphereGeometry(0.035 * scale, 6, 6);
    earGeo.scale(0.8, 1.2, 0.3);
    const earL = new THREE.Mesh(earGeo, earMat);
    earL.position.set(-0.06 * scale, 0.2 * scale, 0.16 * scale);
    const earR = new THREE.Mesh(earGeo, earMat);
    earR.position.set(0.06 * scale, 0.2 * scale, 0.16 * scale);
    this.mesh.add(earL, earR);

    // Glowing Eyes
    const eyeGeo = new THREE.SphereGeometry(0.02 * scale, 6, 6);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.04 * scale, 0.16 * scale, 0.24 * scale);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.04 * scale, 0.16 * scale, 0.24 * scale);
    this.mesh.add(leftEye, rightEye);

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
    this.mesh.add(legFL, legFR, legBL, legBR);

    // Tail (Thin articulated segment chain)
    const tailPoints = [
      new THREE.Vector3(0, 0.1 * scale, -0.15 * scale),
      new THREE.Vector3(0.04 * scale, 0.08 * scale, -0.3 * scale),
      new THREE.Vector3(-0.02 * scale, 0.05 * scale, -0.45 * scale)
    ];
    const tailGeo = new THREE.BufferGeometry().setFromPoints(tailPoints);
    const tailMat = new THREE.LineBasicMaterial({ color: 0xf43f5e, linewidth: 2 });
    this.tailMesh = new THREE.Line(tailGeo, tailMat);
    this.mesh.add(this.tailMesh);

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
    this.mesh.add(this.thermalLight);

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

  public update(deltaTime: number, catPosition: THREE.Vector3, catIsCrouching: boolean) {
    if (this.mixer) {
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

    const distToCat = this.mesh.position.distanceTo(catPosition);
    const detectionRadius = catIsCrouching ? 4.5 : 9.5;

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

    // Kingpin Boss Combat AI
    if (this.isKingpin) {
      if (distToCat < 4.5 && this.attackCooldown <= 0) {
        // Lunge attack toward Alba
        const lungeDir = new THREE.Vector3().subVectors(catPosition, this.mesh.position).normalize();
        lungeDir.y = 0;
        this.mesh.position.addScaledVector(lungeDir, this.moveSpeed * 1.8 * deltaTime);
        this.mesh.rotation.y = Math.atan2(lungeDir.x, lungeDir.z);
      } else {
        // Patrol around the Dorothy capstan housing
        const time = Date.now() * 0.001;
        const radius = 1.6;
        this.mesh.position.x = this.spawnOrigin.x + Math.sin(time * 0.8) * radius;
        this.mesh.position.z = this.spawnOrigin.z + Math.cos(time * 0.8) * radius;
        this.mesh.rotation.y = time * 0.8 + Math.PI / 2;
      }
      return;
    }

    // Standard Rat AI State Transitions
    if (distToCat < 2.2) {
      this.state = 'FLEEING';
    } else if (distToCat < detectionRadius) {
      if (this.state === 'FORAGING') {
        this.state = 'SUSPICIOUS';
        this.alertTimer = 1.5;
      }
    } else if (this.state === 'FLEEING' && distToCat > 14) {
      this.state = 'FORAGING';
    }

    // Execute state behavior
    if (this.state === 'FLEEING') {
      const fleeDir = new THREE.Vector3().subVectors(this.mesh.position, catPosition).normalize();
      fleeDir.y = 0;
      this.mesh.position.addScaledVector(fleeDir, this.moveSpeed * 2.2 * deltaTime);
      this.mesh.rotation.y = Math.atan2(fleeDir.x, fleeDir.z);
    } else if (this.state === 'FORAGING') {
      if (this.mesh.position.distanceTo(this.patrolTarget) < 0.5 || Math.random() < 0.008) {
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          0,
          (Math.random() - 0.5) * 8
        );
        this.patrolTarget.addVectors(this.spawnOrigin, offset);
      }
      const dir = new THREE.Vector3().subVectors(this.patrolTarget, this.mesh.position).normalize();
      dir.y = 0;
      this.mesh.position.addScaledVector(dir, this.moveSpeed * 0.7 * deltaTime);
      if (dir.lengthSq() > 0.001) {
        this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      }
    }

    // Run animation wobble & thermal pulse
    this.runCycle += deltaTime * 12;
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
      (this.scentTrailParticles.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}
