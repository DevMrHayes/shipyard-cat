import * as THREE from 'three';
import { ModelManager } from '../core/ModelManager';
import { soundEngine } from '../core/SoundEngine';

export type MutantArchetype = 'SCOUT' | 'PROWLER' | 'ENFORCER' | 'LIEUTENANT_COBALT';

export class MutantCatEntity {
  public mesh: THREE.Group;
  public name: string;
  public health: number = 60;
  public maxHealth: number = 60;
  public state: 'PATROL' | 'HOSTILE' | 'STAGGER' | 'DEFEATED' = 'PATROL';
  public isDefeated: boolean = false;
  public radioactiveAura: THREE.Mesh;
  public eyeLight: THREE.PointLight;

  private patrolOrigin: THREE.Vector3;
  private patrolAngle: number = 0;
  private attackCooldown: number = 0;
  public staggerTimer: number = 0;
  private staggerDuration: number = 0.4;
  private staggerKnockback: THREE.Vector3 = new THREE.Vector3();

  public gltfModel: THREE.Group | null = null;
  public mixer: THREE.AnimationMixer | null = null;
  public animations: { [key: string]: THREE.AnimationAction } = {};
  public currentAction: THREE.AnimationAction | null = null;
  public readyPromise: Promise<void> = Promise.resolve();
  public spawnOrigin: THREE.Vector3;
  public isBoss: boolean;
  public attackDamage: number;

  // Phase 3 Archetype Combat Specializations
  public archetype: MutantArchetype;
  private specialAbilityTimer: number = 0;
  private isDashing: boolean = false;
  private isStalking: boolean = false;
  private pulseAuraMesh: THREE.Mesh | null = null;

  constructor(name: string, position: THREE.Vector3, isBoss: boolean = false, archetype?: MutantArchetype) {
    this.name = name;
    this.spawnOrigin = position.clone();
    this.patrolOrigin = position.clone();
    this.isBoss = isBoss;

    // Determine archetype from argument, boss flag, or name heuristics
    if (archetype) {
      this.archetype = archetype;
    } else if (isBoss || name.toLowerCase().includes('cobalt') || name.toLowerCase().includes('lieutenant')) {
      this.archetype = 'LIEUTENANT_COBALT';
      this.isBoss = true;
    } else if (name.toLowerCase().includes('scout') || name.toLowerCase().includes('swift') || name.toLowerCase().includes('skitter')) {
      this.archetype = 'SCOUT';
    } else if (name.toLowerCase().includes('prowler') || name.toLowerCase().includes('shadow') || name.toLowerCase().includes('stalk')) {
      this.archetype = 'PROWLER';
    } else if (name.toLowerCase().includes('enforcer') || name.toLowerCase().includes('brute') || name.toLowerCase().includes('heavy')) {
      this.archetype = 'ENFORCER';
    } else {
      this.archetype = 'SCOUT';
    }

    // Configure stats according to archetype
    switch (this.archetype) {
      case 'LIEUTENANT_COBALT':
        this.maxHealth = 320;
        this.attackDamage = 35;
        this.specialAbilityTimer = 4.0;
        break;
      case 'ENFORCER':
        this.maxHealth = 120;
        this.attackDamage = 22;
        this.specialAbilityTimer = 2.5;
        break;
      case 'PROWLER':
        this.maxHealth = 70;
        this.attackDamage = 16;
        this.specialAbilityTimer = 3.0;
        break;
      case 'SCOUT':
      default:
        this.maxHealth = 50;
        this.attackDamage = 10;
        this.specialAbilityTimer = 2.0;
        break;
    }

    this.health = this.maxHealth;
    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);

    const proceduralGroup = new THREE.Group();
    this.mesh.add(proceduralGroup);

    const scaleFactor = this.archetype === 'LIEUTENANT_COBALT' ? 2.5 : (this.archetype === 'ENFORCER' ? 2.3 : 2.0);

    // 3D Mutant Cat Model (Loads in browser environment)
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      this.readyPromise = ModelManager.loadCatModel().then((gltf) => {
        this.gltfModel = gltf.scene;
        this.gltfModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        this.gltfModel.position.set(0, 0, 0);

        let coatColor = 0x1f242b;
        if (this.archetype === 'LIEUTENANT_COBALT') coatColor = 0x152238; // Deep irradiated cobalt hue
        else if (this.archetype === 'ENFORCER') coatColor = 0x1a1a1a;
        else if (this.archetype === 'PROWLER') coatColor = 0x0f172a;

        const mutantFurMat = new THREE.MeshStandardMaterial({
          color: coatColor,
          roughness: 0.88,
          metalness: 0.15,
          side: THREE.DoubleSide
        });

        this.gltfModel.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            (child as THREE.Mesh).material = mutantFurMat;
          }
        });

        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.gltfModel);
          const walkClip = gltf.animations.find(a => a.name.includes('Walk-IP') || a.name.includes('Walk')) || gltf.animations[0];
          const runClip = gltf.animations.find(a => a.name.includes('Run-IP') || a.name.includes('Sprint')) || walkClip;
          const attackClip = gltf.animations.find(a => a.name.includes('Attack_Agressive') || a.name.includes('Attack')) || runClip;

          this.animations['walk'] = this.mixer.clipAction(walkClip);
          this.animations['run'] = this.mixer.clipAction(runClip);
          this.animations['attack'] = this.mixer.clipAction(attackClip);

          Object.values(this.animations).forEach(act => {
            act.enabled = true;
            act.setEffectiveWeight(1.0);
            act.play();
          });
          this.mixer.update(0.016);

          this.animations['walk'].play();
          this.currentAction = this.animations['walk'];
          this.mixer.update(0);
        }

        this.mesh.add(this.gltfModel);
        this.mesh.remove(proceduralGroup);
        proceduralGroup.visible = false;
      }).catch(() => {
        this.buildProceduralMutant(proceduralGroup);
      });
    } else {
      this.buildProceduralMutant(proceduralGroup);
    }

    // Persistent 3D Mutant Identifiers (glowing spines + tapetum eyes)
    const mutantIdentifierGroup = new THREE.Group();
    const spineColor = this.archetype === 'LIEUTENANT_COBALT' ? 0x38bdf8 : 0x84cc16;
    const spineEmissive = this.archetype === 'LIEUTENANT_COBALT' ? 0x0284c7 : 0x65a30d;

    const spineMat = new THREE.MeshStandardMaterial({
      color: spineColor,
      emissive: spineEmissive,
      emissiveIntensity: 1.6,
      roughness: 0.25,
      metalness: 0.3
    });

    const spinePositions = [
      { z: 0.12, y: 0.56, s: 1.0, tilt: -0.25 },
      { z: -0.04, y: 0.58, s: 1.15, tilt: -0.35 },
      { z: -0.20, y: 0.53, s: 0.85, tilt: -0.45 }
    ];
    for (const sp of spinePositions) {
      const spine = new THREE.Mesh(new THREE.ConeGeometry(0.032 * sp.s, 0.14 * sp.s, 5), spineMat);
      spine.position.set(0, sp.y, sp.z);
      spine.rotation.x = sp.tilt;
      mutantIdentifierGroup.add(spine);
    }

    const glowEyeGeo = new THREE.SphereGeometry(0.028, 8, 8);
    const glowEyeL = new THREE.Mesh(glowEyeGeo, spineMat);
    glowEyeL.position.set(0.07, 0.52, 0.38);
    const glowEyeR = new THREE.Mesh(glowEyeGeo, spineMat);
    glowEyeR.position.set(-0.07, 0.52, 0.38);
    mutantIdentifierGroup.add(glowEyeL, glowEyeR);
    this.mesh.add(mutantIdentifierGroup);

    // Eye Light
    this.eyeLight = new THREE.PointLight(spineColor, 1.2, 5);
    this.eyeLight.position.set(0, 0.5, 0.4);
    this.mesh.add(this.eyeLight);

    // Radioactive Whiskers Aura
    const auraGeo = new THREE.SphereGeometry(0.75, 12, 12);
    const auraMat = new THREE.MeshBasicMaterial({
      color: spineColor,
      wireframe: true,
      transparent: true,
      opacity: 0.0
    });
    this.radioactiveAura = new THREE.Mesh(auraGeo, auraMat);
    this.radioactiveAura.position.y = 0.35;
    this.mesh.add(this.radioactiveAura);

    // Boss Cobalt Radial Pulse FX Mesh
    if (this.archetype === 'LIEUTENANT_COBALT') {
      const pulseGeo = new THREE.RingGeometry(0.2, 0.6, 24);
      pulseGeo.rotateX(-Math.PI / 2);
      const pulseMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });
      this.pulseAuraMesh = new THREE.Mesh(pulseGeo, pulseMat);
      this.pulseAuraMesh.position.y = 0.05;
      this.mesh.add(this.pulseAuraMesh);
    }

    // Overhead Nametag with Archetype Indicator
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 70;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.roundRect(10, 8, 280, 54, 12);
      ctx.fill();

      const borderHex = this.archetype === 'LIEUTENANT_COBALT' ? '#38bdf8' : (this.archetype === 'ENFORCER' ? '#f97316' : '#84cc16');
      ctx.strokeStyle = borderHex;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.font = 'bold 18px Courier New';
      ctx.fillStyle = borderHex;
      ctx.textAlign = 'center';
      const label = `${this.archetype === 'LIEUTENANT_COBALT' ? '★ ' : '☣ '}${this.name} [${this.archetype}]`;
      ctx.fillText(label, 150, 40);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 1.25, 0);
      sprite.scale.set(1.9, 0.44, 1);
      this.mesh.add(sprite);
    }
  }

  private buildProceduralMutant(group: THREE.Group) {
    group.rotation.y = -Math.PI / 2;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: this.archetype === 'LIEUTENANT_COBALT' ? 0x152238 : 0x1f242b,
      roughness: 0.88
    });
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });
    const bodyGeo = new THREE.CapsuleGeometry(0.18, 0.55, 8, 12);
    bodyGeo.rotateZ(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.32;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 12, 12), bodyMat);
    head.position.set(0.35, 0.46, 0);
    head.castShadow = true;
    group.add(head);

    const earGeo = new THREE.ConeGeometry(0.06, 0.12, 4);
    const earL = new THREE.Mesh(earGeo, bodyMat);
    earL.position.set(0.32, 0.62, 0.1);
    earL.rotation.z = -0.3;
    const earR = new THREE.Mesh(earGeo, bodyMat);
    earR.position.set(0.32, 0.62, -0.1);
    earR.rotation.z = -0.3;
    group.add(earL, earR);

    const createMutantLeg = (isFront: boolean, isLeft: boolean) => {
      const leg = new THREE.Group();
      const x = isFront ? 0.22 : -0.22;
      const z = isLeft ? 0.12 : -0.12;
      leg.position.set(x, 0.28, z);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.24, 6), bodyMat);
      upper.position.y = -0.1;
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 6), bodyMat);
      paw.position.set(0, -0.22, 0.02);

      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.04, 4), clawMat);
      claw.rotateX(Math.PI / 2);
      claw.position.set(0, -0.22, 0.06);

      leg.add(upper, paw, claw);
      group.add(leg);
    };

    createMutantLeg(true, true);
    createMutantLeg(true, false);
    createMutantLeg(false, true);
    createMutantLeg(false, false);
  }

  private static readonly scratchDir = new THREE.Vector3();
  private static readonly scratchNewPos = new THREE.Vector3();
  private static readonly scratchPrevPos = new THREE.Vector3();
  private static readonly scratchKnockbackStep = new THREE.Vector3();
  private static readonly scratchTangent = new THREE.Vector3();

  public update(
    deltaTime: number,
    playerPos: THREE.Vector3,
    onAttackPlayer?: (damage: number) => void,
    resolveCollision?: (pos: THREE.Vector3, radius: number, previousPos?: THREE.Vector3) => THREE.Vector3,
    skipMixer: boolean = false
  ) {
    if (this.isDefeated) return;

    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }
    if (this.specialAbilityTimer > 0) {
      this.specialAbilityTimer -= deltaTime;
    }

    const prevPos = MutantCatEntity.scratchPrevPos.copy(this.mesh.position);

    // Stagger Recoil Handling
    if (this.state === 'STAGGER') {
      this.staggerTimer -= deltaTime;
      const progress = Math.max(0, this.staggerTimer / this.staggerDuration);

      if (this.staggerKnockback.lengthSq() > 0.001) {
        const knockbackStep = MutantCatEntity.scratchKnockbackStep.copy(this.staggerKnockback).multiplyScalar(progress * 4.0 * deltaTime);
        const staggeredPos = MutantCatEntity.scratchNewPos.copy(this.mesh.position).add(knockbackStep);
        if (resolveCollision) {
          this.mesh.position.copy(resolveCollision(staggeredPos, 0.35, prevPos));
        } else {
          this.mesh.position.copy(staggeredPos);
        }
      }

      const shudder = Math.sin(this.staggerTimer * 38) * 0.18 * progress;
      this.mesh.rotation.z = shudder;
      this.mesh.rotation.x = -0.25 * progress;
      if (this.gltfModel) {
        this.gltfModel.position.y = 0.08 * Math.sin(progress * Math.PI);
      }

      if (this.staggerTimer <= 0) {
        this.state = 'HOSTILE';
        this.mesh.rotation.z = 0;
        this.mesh.rotation.x = 0;
        if (this.gltfModel) this.gltfModel.position.y = 0;
        this.attackCooldown = 0.9;
      }
      return;
    }

    const distToPlayer = this.mesh.position.distanceTo(playerPos);

    if (this.mixer && !skipMixer) {
      this.mixer.update(deltaTime);
      let targetAnim = this.animations['walk'];
      if (!this.isDefeated) {
        if (distToPlayer < 1.6 && this.attackCooldown > 0.8) {
          targetAnim = this.animations['attack'] || this.animations['run'] || this.animations['walk'];
        } else if (distToPlayer < 8.0) {
          targetAnim = this.animations['run'] || this.animations['walk'];
        }
      }

      if (targetAnim && targetAnim !== this.currentAction) {
        if (this.currentAction) this.currentAction.fadeOut(0.2);
        targetAnim.reset().fadeIn(0.2).play();
        this.currentAction = targetAnim;
      }
    }

    // Engagement behavior based on distance and archetype modifiers
    const aggroRadius = this.archetype === 'PROWLER' ? 16.0 : (this.archetype === 'LIEUTENANT_COBALT' ? 15.0 : 12.0);

    if (distToPlayer < aggroRadius) {
      this.state = 'HOSTILE';
      const dir = MutantCatEntity.scratchDir.subVectors(playerPos, this.mesh.position).normalize();
      dir.y = 0;

      let speed = 3.8;
      let reach = 1.4;

      // Archetype-Specific Combat Behaviors
      switch (this.archetype) {
        case 'SCOUT':
          // Scout Dash Burst: quick acceleration dash every 3.5s
          if (this.specialAbilityTimer <= 0) {
            this.isDashing = true;
            this.specialAbilityTimer = 3.5;
          }
          if (this.isDashing) {
            speed = 6.2;
            if (distToPlayer < 2.0 || this.specialAbilityTimer < 2.8) {
              this.isDashing = false;
            }
          } else {
            speed = 4.3;
          }
          break;

        case 'PROWLER':
          // Prowler Stalk: circles or sneaks until close, then springs
          if (distToPlayer > 4.5) {
            this.isStalking = true;
            speed = 2.2; // Silent slow stalk
            // Add slight flank angle
            const tangent = MutantCatEntity.scratchTangent.set(-dir.z, 0, dir.x).multiplyScalar(0.35);
            dir.add(tangent).normalize();
          } else {
            this.isStalking = false;
            speed = 5.2; // Spring forward
          }
          break;

        case 'ENFORCER':
          // Enforcer Heavy Strike: slower steady approach, heavy reach & blow
          speed = 3.0;
          reach = 1.8;
          break;

        case 'LIEUTENANT_COBALT':
          // Boss: Steady advance + Area Radiation Pulse every 5s
          speed = 3.6;
          reach = 2.2;
          if (this.specialAbilityTimer <= 0) {
            // Radiation Pulse Nova
            this.specialAbilityTimer = 5.0;
            if (this.pulseAuraMesh) {
              this.pulseAuraMesh.scale.set(1, 1, 1);
              (this.pulseAuraMesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
            }
            // Pulse AoE damage within 4.5m
            if (distToPlayer < 4.5) {
              onAttackPlayer?.(Math.round(this.attackDamage * 0.75));
            }
          }
          // Animate pulse ring decay
          if (this.pulseAuraMesh && (this.pulseAuraMesh.material as THREE.MeshBasicMaterial).opacity > 0) {
            const mat = this.pulseAuraMesh.material as THREE.MeshBasicMaterial;
            mat.opacity = Math.max(0, mat.opacity - deltaTime * 1.8);
            const scaleInc = (0.9 - mat.opacity) * 7.0 + 1.0;
            this.pulseAuraMesh.scale.set(scaleInc, scaleInc, scaleInc);
          }
          break;
      }

      const newPos = MutantCatEntity.scratchNewPos.copy(this.mesh.position).addScaledVector(dir, speed * deltaTime);
      if (resolveCollision) {
        this.mesh.position.copy(resolveCollision(newPos, 0.35, prevPos));
      } else {
        this.mesh.position.copy(newPos);
      }
      this.mesh.rotation.y = Math.atan2(dir.x, dir.z);

      // Melee attack trigger
      if (distToPlayer < reach && this.attackCooldown <= 0) {
        let dmg = this.attackDamage;
        if (this.archetype === 'ENFORCER' && Math.random() < 0.35) {
          dmg = Math.round(dmg * 1.5); // Crushing blow
        }
        this.attackCooldown = this.archetype === 'SCOUT' ? 0.9 : 1.3;
        onAttackPlayer?.(dmg);
      }
    } else {
      // Idle patrol behavior
      this.state = 'PATROL';
      this.patrolAngle += deltaTime * 0.8;
      const targetX = this.patrolOrigin.x + Math.sin(this.patrolAngle) * 3.5;
      const targetZ = this.patrolOrigin.z + Math.cos(this.patrolAngle) * 3.5;

      const dir = MutantCatEntity.scratchDir.set(targetX - this.mesh.position.x, 0, targetZ - this.mesh.position.z);
      if (dir.length() > 0.1) {
        dir.normalize();
        const newPos = MutantCatEntity.scratchNewPos.copy(this.mesh.position).addScaledVector(dir, 1.8 * deltaTime);
        if (resolveCollision) {
          this.mesh.position.copy(resolveCollision(newPos, 0.3, prevPos));
        } else {
          this.mesh.position.copy(newPos);
        }
        this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      }
    }
  }

  public takeDamage(amount: number, hitSourcePos?: THREE.Vector3, isTailSweep: boolean = false): boolean {
    if (this.isDefeated) return false;

    // Enforcers possess natural heavy armor plating (-20% damage)
    let finalAmount = amount;
    if (this.archetype === 'ENFORCER') {
      finalAmount = Math.max(1, Math.round(amount * 0.8));
    }

    this.health -= finalAmount;
    soundEngine.playMutantRecoil();

    if (this.health <= 0) {
      this.isDefeated = true;
      this.state = 'DEFEATED';
      this.mesh.rotation.z = Math.PI / 2;
      this.mesh.rotation.x = 0;
      this.eyeLight.intensity = 0;
      if (this.pulseAuraMesh) this.pulseAuraMesh.visible = false;
      return true;
    }

    // Trigger Stagger & Recoil
    this.state = 'STAGGER';
    const baseStagger = this.archetype === 'ENFORCER' ? 0.25 : (isTailSweep ? 0.65 : 0.4);
    this.staggerDuration = baseStagger;
    this.staggerTimer = this.staggerDuration;

    if (hitSourcePos) {
      this.staggerKnockback.subVectors(this.mesh.position, hitSourcePos).normalize();
      this.staggerKnockback.y = 0;
      // Enforcers resist knockback
      if (this.archetype === 'ENFORCER') {
        this.staggerKnockback.multiplyScalar(0.4);
      }
    } else {
      this.staggerKnockback.set(0, 0, 1).applyQuaternion(this.mesh.quaternion).negate();
    }

    return false;
  }

  public setWhiskersAura(visible: boolean, hasTier2Sense: boolean) {
    if (hasTier2Sense && visible) {
      (this.radioactiveAura.material as THREE.MeshBasicMaterial).opacity = 0.85;
      this.eyeLight.intensity = 3.0;
    } else {
      (this.radioactiveAura.material as THREE.MeshBasicMaterial).opacity = 0.0;
      this.eyeLight.intensity = 1.2;
    }
  }

  public prewarmAnimations(): void {
    if (!this.mixer) return;
    Object.values(this.animations).forEach(act => {
      act.enabled = true;
      act.setEffectiveWeight(1.0);
      act.play();
    });
    this.mixer.update(0.016);
    const initialAction = this.animations['walk'];
    if (initialAction) {
      initialAction.play();
      this.currentAction = initialAction;
    }
    this.mixer.update(0);
  }
}