import * as THREE from 'three';
import { ModelManager } from '../core/ModelManager';
import { soundEngine } from '../core/SoundEngine';

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

  constructor(name: string, position: THREE.Vector3, isBoss: boolean = false) {
    this.name = name;
    this.spawnOrigin = position.clone();
    this.patrolOrigin = position.clone();
    this.isBoss = isBoss;
    this.maxHealth = isBoss ? 240 : 60;
    this.health = this.maxHealth;
    this.attackDamage = isBoss ? 25 : 12;
    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);

    const proceduralGroup = new THREE.Group();
    this.mesh.add(proceduralGroup);

    // 3D Mutant Cat Model (Loads in browser environment)
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      this.readyPromise = ModelManager.loadCatModel().then((gltf) => {
        this.gltfModel = gltf.scene;
        // Imposing mutant scale (2.1x)
        this.gltfModel.scale.set(2.1, 2.1, 2.1);
        this.gltfModel.position.set(0, 0, 0);

        const mutantFurMat = new THREE.MeshStandardMaterial({
          color: 0x2e1065, // Dark radioactive bruised purple/black fur
          roughness: 0.8,
          metalness: 0.25,
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

    // Eye PointLight
    this.eyeLight = new THREE.PointLight(0xa855f7, 1.2, 5);
    this.eyeLight.position.set(0.5, 0.5, 0);
    this.mesh.add(this.eyeLight);

    // Radioactive Whiskers Aura (Visible in Whiskers Mode with Tier 2+)
    const auraGeo = new THREE.SphereGeometry(0.7, 12, 12);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      wireframe: true,
      transparent: true,
      opacity: 0.0
    });
    this.radioactiveAura = new THREE.Mesh(auraGeo, auraMat);
    this.radioactiveAura.position.y = 0.35;
    this.mesh.add(this.radioactiveAura);

    // Nametag
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.roundRect(10, 10, 236, 44, 10);
      ctx.fill();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = 'bold 20px Courier New';
      ctx.fillStyle = '#c084fc';
      ctx.textAlign = 'center';
      ctx.fillText('â˜£ ' + this.name, 128, 38);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 1.1, 0);
      sprite.scale.set(1.6, 0.4, 1);
      this.mesh.add(sprite);
    }
  }

  private buildProceduralMutant(group: THREE.Group) {
    // Mutant Cat Body (Dark mottled steel fur, larger frame)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });
    const bodyGeo = new THREE.CapsuleGeometry(0.18, 0.55, 8, 12);
    bodyGeo.rotateZ(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.32;
    body.castShadow = true;
    group.add(body);

    // Muscular Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 12, 12), bodyMat);
    head.position.set(0.35, 0.46, 0);
    head.castShadow = true;
    group.add(head);

    // Jagged Ears
    const earGeo = new THREE.ConeGeometry(0.06, 0.12, 4);
    const earL = new THREE.Mesh(earGeo, bodyMat);
    earL.position.set(0.32, 0.62, 0.1);
    earL.rotation.z = -0.3;
    const earR = new THREE.Mesh(earGeo, bodyMat);
    earR.position.set(0.32, 0.62, -0.1);
    earR.rotation.z = -0.3;
    group.add(earL, earR);

    // 4 Heavy Predatory Legs with Steel Claws
    const createMutantLeg = (isFront: boolean, isLeft: boolean) => {
      const leg = new THREE.Group();
      const x = isFront ? 0.22 : -0.22;
      const z = isLeft ? 0.12 : -0.12;
      leg.position.set(x, 0.28, z);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.24, 6), bodyMat);
      upper.position.y = -0.1;
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 6), bodyMat);
      paw.position.set(0, -0.22, 0.02);
      
      // Steel Claws
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.04, 4), clawMat);
      claw.rotateX(Math.PI / 2);
      claw.position.set(0, -0.22, 0.06);

      leg.add(upper, paw, claw);
      group.add(leg);
      return leg;
    };

    createMutantLeg(true, true);
    createMutantLeg(true, false);
    createMutantLeg(false, true);
    createMutantLeg(false, false);

    // Radioactive Glowing Violet Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xc084fc }); // Bright violet isotope glow
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
    eyeL.position.set(0.48, 0.49, 0.08);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
    eyeR.position.set(0.48, 0.49, -0.08);
    group.add(eyeL, eyeR);
  }

  // Static Scratch Vectors for Zero Garbage Collection
  private static readonly scratchDir = new THREE.Vector3();
  private static readonly scratchNewPos = new THREE.Vector3();
  private static readonly scratchKnockbackDir = new THREE.Vector3();
  private static readonly scratchPrevPos = new THREE.Vector3();
  private static readonly scratchKnockbackStep = new THREE.Vector3();

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

    const prevPos = MutantCatEntity.scratchPrevPos.copy(this.mesh.position);

    // 1. Handle Stagger Recoil State
    if (this.state === 'STAGGER') {
      this.staggerTimer -= deltaTime;
      const progress = Math.max(0, this.staggerTimer / this.staggerDuration);
      
      // Apply knockback displacement
      if (this.staggerKnockback.lengthSq() > 0.001) {
        const knockbackStep = MutantCatEntity.scratchKnockbackStep.copy(this.staggerKnockback).multiplyScalar(progress * 4.0 * deltaTime);
        const staggeredPos = MutantCatEntity.scratchNewPos.copy(this.mesh.position).add(knockbackStep);
        if (resolveCollision) {
          this.mesh.position.copy(resolveCollision(staggeredPos, 0.35, prevPos));
        } else {
          this.mesh.position.copy(staggeredPos);
        }
      }

      // Visceral recoil flinch & tilt animation
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
        this.attackCooldown = 0.9; // Brief recovery before next swipe
      }
      return;
    }

    const distToPlayer = this.mesh.position.distanceTo(playerPos);

    if (this.mixer && !skipMixer) {
      this.mixer.update(deltaTime);
      let targetAnim = this.animations['walk'];
      if (this.isDefeated) {
        // Stop animation
      } else if (distToPlayer < 1.4 && this.attackCooldown > 0.8) {
        targetAnim = this.animations['attack'] || this.animations['run'] || this.animations['walk'];
      } else if (distToPlayer < 7.0) {
        targetAnim = this.animations['run'] || this.animations['walk'];
      }

      if (targetAnim && targetAnim !== this.currentAction) {
        if (this.currentAction) this.currentAction.fadeOut(0.2);
        targetAnim.reset().fadeIn(0.2).play();
        this.currentAction = targetAnim;
      }
    }

    if (distToPlayer < 7.0) {
      // Aggro on Alba!
      this.state = 'HOSTILE';
      const dir = MutantCatEntity.scratchDir.subVectors(playerPos, this.mesh.position).normalize();
      dir.y = 0;
      const newPos = MutantCatEntity.scratchNewPos.copy(this.mesh.position).addScaledVector(dir, 3.2 * deltaTime);
      if (resolveCollision) {
        this.mesh.position.copy(resolveCollision(newPos, 0.3, prevPos));
      } else {
        this.mesh.position.copy(newPos);
      }
      this.mesh.rotation.y = Math.atan2(-dir.z, dir.x);

      // Attack Alba if in melee range (< 1.2m)
      if (distToPlayer < 1.2 && this.attackCooldown <= 0) {
        this.attackCooldown = 1.4;
        onAttackPlayer?.(12);
      }
    } else {
      // Idle patrol around spawn point
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
        this.mesh.rotation.y = Math.atan2(-dir.z, dir.x);
      }
    }
  }

  public takeDamage(amount: number, hitSourcePos?: THREE.Vector3, isTailSweep: boolean = false): boolean {
    if (this.isDefeated) return false;
    this.health -= amount;
    
    soundEngine.playMutantRecoil();

    if (this.health <= 0) {
      this.isDefeated = true;
      this.state = 'DEFEATED';
      this.mesh.rotation.z = Math.PI / 2; // Knocked out
      this.mesh.rotation.x = 0;
      this.eyeLight.intensity = 0;
      return true; // Defeated!
    }

    // Trigger Stagger & Recoil
    this.state = 'STAGGER';
    this.staggerDuration = isTailSweep ? 0.65 : 0.4;
    this.staggerTimer = this.staggerDuration;

    if (hitSourcePos) {
      this.staggerKnockback.subVectors(this.mesh.position, hitSourcePos).normalize();
      this.staggerKnockback.y = 0;
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

