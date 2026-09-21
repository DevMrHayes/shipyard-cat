import * as THREE from 'three';
import { CatVitals } from '../core/VitalsSystem';
import { ProgressionSystem } from '../core/ProgressionSystem';
import { ShipyardEnvironment } from '../game/ShipyardEnvironment';
import { PounceTargetCandidate } from '../game/GameEngine';
import { soundEngine } from '../core/SoundEngine';

export interface PhysicsInputState {
  driveInput: number;
  turnInput: number;
  isSprinting: boolean;
  isCrouching: boolean;
  isMoving: boolean;
  jumpRequested: boolean;
}

export interface PhysicsEvents {
  onFallDamage?: (damage: number) => void;
  onEnterDryDock1?: () => void;
  onClimbDorothy?: () => void;
  onJumpPallet?: () => void;
  onNotification?: (title: string, message: string, type: 'info' | 'success' | 'warn') => void;
}

/**
 * PhysicsSubsystem: Encapsulates 60Hz fixed-timestep kinematic sub-stepping,
 * swept-capsule collision sliding, spatial hash queries, and step-up ground clamping
 * with zero runtime memory allocations.
 */
export class PhysicsSubsystem {
  public static readonly FIXED_TIMESTEP: number = 1 / 60; // 60Hz (16.667ms)
  public static readonly MAX_PHYSICS_SUBSTEPS: number = 5; // Guard against spiral-of-death
  public static readonly MAX_FRAME_DELTA: number = 0.1; // Max 100ms clamp

  // Kinematic state
  public position: THREE.Vector3 = new THREE.Vector3();
  public prevPosition: THREE.Vector3 = new THREE.Vector3();
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public heading: number = 0;
  public prevHeading: number = 0;
  public bankAngle: number = 0;
  public prevBankAngle: number = 0;
  public turnVelocity: number = 0;
  public currentSpeed: number = 0;
  public isGrounded: boolean = true;
  public isPouncing: boolean = false;
  public pounceTimer: number = 0;
  public accumulator: number = 0;

  // Static preallocated scratch objects (Zero GC in hot physics path)
  private static readonly scratchForward = new THREE.Vector3();
  private static readonly scratchPrevPos = new THREE.Vector3();
  private static readonly scratchNewPos = new THREE.Vector3();
  private static readonly scratchTotalVelocity = new THREE.Vector3();
  private static readonly scratchPounceDir = new THREE.Vector3();

  public events: PhysicsEvents = {};

  constructor(initialPosition: THREE.Vector3 = new THREE.Vector3(-10.0, 0, -20.0), initialHeading: number = 0) {
    this.position.copy(initialPosition);
    this.prevPosition.copy(initialPosition);
    this.heading = initialHeading;
    this.prevHeading = initialHeading;
  }

  /**
   * Reset or teleport physical cat position and heading
   */
  public teleport(pos: THREE.Vector3, heading: number = 0): void {
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.velocity.set(0, 0, 0);
    this.heading = heading;
    this.prevHeading = heading;
    this.bankAngle = 0;
    this.prevBankAngle = 0;
    this.turnVelocity = 0;
    this.currentSpeed = 0;
    this.isGrounded = true;
    this.isPouncing = false;
    this.pounceTimer = 0;
    this.accumulator = 0;
  }

  /**
   * Main fixed-timestep kinematic sub-stepping driver.
   * Runs 1..MAX_PHYSICS_SUBSTEPS ticks depending on accumulated frame delta.
   */
  public update(
    deltaTime: number,
    input: PhysicsInputState,
    env: ShipyardEnvironment,
    vitals: CatVitals,
    progression: ProgressionSystem
  ): number {
    const clampedDelta = Math.min(Math.max(deltaTime, 0.0001), PhysicsSubsystem.MAX_FRAME_DELTA);
    this.accumulator += clampedDelta;

    let substeps = 0;
    while (this.accumulator >= PhysicsSubsystem.FIXED_TIMESTEP && substeps < PhysicsSubsystem.MAX_PHYSICS_SUBSTEPS) {
      this.fixedStep(PhysicsSubsystem.FIXED_TIMESTEP, input, env, vitals, progression);
      this.accumulator -= PhysicsSubsystem.FIXED_TIMESTEP;
      substeps++;
    }

    // Clamp accumulator if sub-step limit reached to prevent spiral-of-death
    if (substeps >= PhysicsSubsystem.MAX_PHYSICS_SUBSTEPS) {
      this.accumulator = 0;
    }

    // Return interpolation alpha between previous and current physics state
    return Math.min(1.0, Math.max(0.0, this.accumulator / PhysicsSubsystem.FIXED_TIMESTEP));
  }

  /**
   * Execute single 60Hz kinematic physics step
   */
  private fixedStep(
    dt: number,
    input: PhysicsInputState,
    env: ShipyardEnvironment,
    vitals: CatVitals,
    progression: ProgressionSystem
  ): void {
    this.prevPosition.copy(this.position);
    this.prevHeading = this.heading;
    this.prevBankAngle = this.bankAngle;

    // 1. Steering & Body Banking
    if (Math.abs(input.turnInput) > 0.001) {
      const baseTurnRate = input.isCrouching ? 3.4 : (input.isSprinting ? 2.6 : (input.isMoving ? 3.0 : 3.6));
      const targetTurnVel = input.turnInput * baseTurnRate;
      this.turnVelocity = THREE.MathUtils.lerp(this.turnVelocity, targetTurnVel, Math.min(1.0, 16.0 * dt));
      this.heading += this.turnVelocity * dt;

      // Banking roll tilt when turning at speed
      const targetBank = -input.turnInput * 0.12 * Math.min(1.0, this.currentSpeed / 8.0);
      this.bankAngle = THREE.MathUtils.lerp(this.bankAngle, targetBank, Math.min(1.0, 12.0 * dt));
    } else {
      this.turnVelocity = 0;
      if (Math.abs(this.bankAngle) < 0.001) {
        this.bankAngle = 0;
      } else {
        this.bankAngle = THREE.MathUtils.lerp(this.bankAngle, 0, Math.min(1.0, 16.0 * dt));
      }
    }

    // 2. Jump Handling
    if (input.jumpRequested && this.isGrounded && !this.isPouncing) {
      const jumpPower = 6.2 * progression.jumpMultiplier;
      this.velocity.y = jumpPower;
      this.isGrounded = false;
      vitals.consumePounceStamina(10);
    }

    // 3. Feline Acceleration Curve
    let targetSpeed = 0;
    if (input.isMoving) {
      if (input.isSprinting) {
        targetSpeed = 9.2 * progression.sprintMultiplier;
      } else if (input.isCrouching) {
        targetSpeed = 2.0;
      } else {
        targetSpeed = 4.6;
      }
      if (input.driveInput < 0) targetSpeed *= 0.6; // Reverse
    }

    const accelRate = targetSpeed > this.currentSpeed ? 22.0 : 28.0;
    const speedDiff = targetSpeed - this.currentSpeed;
    this.currentSpeed += Math.sign(speedDiff) * Math.min(Math.abs(speedDiff), accelRate * dt);

    PhysicsSubsystem.scratchPrevPos.copy(this.position);
    const forward = PhysicsSubsystem.scratchForward.set(Math.sin(this.heading), 0, Math.cos(this.heading));

    // 4. Unified 3D Velocity & Single Integration Pass
    const totalVelocity = PhysicsSubsystem.scratchTotalVelocity.set(0, 0, 0);

    if (this.isPouncing) {
      this.velocity.y -= 18.0 * dt;
      totalVelocity.copy(this.velocity);
    } else {
      if (this.currentSpeed > 0.01) {
        const moveDir = Math.sign(input.driveInput || 1);
        totalVelocity.x = forward.x * moveDir * this.currentSpeed;
        totalVelocity.z = forward.z * moveDir * this.currentSpeed;
      }
      if (!this.isGrounded) {
        this.velocity.y -= 18.0 * dt;
        totalVelocity.y = this.velocity.y;
      } else {
        totalVelocity.y = 0;
      }
    }

    // 5. Continuous Displacement Integration & Swept Obstacle Collision Resolution
    const scratchNewPos = PhysicsSubsystem.scratchNewPos.copy(this.position).addScaledVector(totalVelocity, dt);
    const resolvedPos = env.resolveCollision(scratchNewPos, 0.35, PhysicsSubsystem.scratchPrevPos);
    this.position.copy(resolvedPos);

    // 6. Vertical Platform Floor Evaluation, Damping, Step-Up & Landing
    const currentFloor = env.getPlatformFloor(this.position.x, this.position.z, this.position.y);

    if (this.isGrounded) {
      const heightDiff = currentFloor - this.position.y;
      if (Math.abs(heightDiff) <= 0.15) {
        const dampFactor = 1.0 - Math.exp(-22.0 * dt);
        this.position.y = THREE.MathUtils.lerp(this.position.y, currentFloor, dampFactor);
        if (Math.abs(this.position.y - currentFloor) < 0.001) {
          this.position.y = currentFloor;
        }
        this.velocity.y = 0;
        if (this.isPouncing) {
          this.isPouncing = false;
          this.pounceTimer = 0;
        }
      } else if (heightDiff > 0 && heightDiff <= 0.55) {
        // Step-up smooth tolerance (stairs, curbs, pallets)
        const stepSpeed = Math.max(8.0, this.currentSpeed * 2.5);
        this.position.y = Math.min(currentFloor, this.position.y + stepSpeed * dt);
        this.velocity.y = 0;
        if (this.isPouncing) {
          this.isPouncing = false;
          this.pounceTimer = 0;
        }
      } else if (this.position.y > currentFloor + 0.15) {
        this.isGrounded = false;
        this.velocity.y = 0;
      } else {
        this.position.y = currentFloor;
        this.velocity.y = 0;
      }
    } else {
      // Airborne: Check landing on platform surface or ground
      if (this.position.y <= currentFloor) {
        const fallSpeed = Math.abs(this.velocity.y);
        this.position.y = currentFloor;
        this.velocity.set(0, 0, 0);
        this.isGrounded = true;
        this.isPouncing = false;
        this.pounceTimer = 0;

        // Fall Impact Damage (Jumping from high structures without using stepping crates)
        if (fallSpeed > 10.5 && !progression.hasAlwaysLandOnFeet) {
          const fallDmg = Math.round((fallSpeed - 10.0) * 8);
          vitals.takeDamage(fallDmg);
          soundEngine.playMeow();
          this.events.onFallDamage?.(fallDmg);
          this.events.onNotification?.('Ouch! Fall Damage', `Fell too far (-${fallDmg} HP)! Climb down using the wooden crates.`, 'warn');
        }

        // Historic Dry Dock 1 Basin Descent (X: 16 to 43, Z: -34 to -21)
        if (this.position.x >= 16.0 && this.position.x <= 43.0 &&
            this.position.z >= -34.0 && this.position.z <= -21.0 &&
            currentFloor <= -1.0) {
          this.events.onEnterDryDock1?.();
        }

        // Tugboat Dorothy's Deck (X: -22 to -18, Z: -31 to -19, Y: 2.2)
        if (this.position.x >= -23.0 && this.position.x <= -17.0 &&
            this.position.z >= -32.0 && this.position.z <= -18.0 &&
            currentFloor >= 2.0) {
          this.events.onClimbDorothy?.();
          soundEngine.playPurr();
        }

        // Dry Dock 12 Floating Pallet Check
        if (this.position.x > 8 && this.position.x < 32 && this.position.z > 10 && this.position.z < 60) {
          if (currentFloor > 0.5) {
            this.events.onJumpPallet?.();
          }
        }
      }
    }

    // 7. Pounce Expiration Failsafe
    if (this.isPouncing) {
      this.pounceTimer -= dt;
      if (this.pounceTimer <= 0 || this.isGrounded || this.position.y <= currentFloor) {
        this.isPouncing = false;
        this.pounceTimer = 0;
      }
    }

    // 8. Yard Ground Rim Safeguard (Outside Sunken Dry Dock Basins)
    const isInsideDD1 = (this.position.x >= 15.0 && this.position.x <= 44.5 && this.position.z >= -36.0 && this.position.z <= -19.0);
    const isInsideDD12 = (this.position.x >= 5.0 && this.position.x <= 35.0 && this.position.z >= 10.0 && this.position.z <= 80.0);
    if (!isInsideDD1 && !isInsideDD12 && this.position.y < 0.0) {
      this.position.y = 0.0;
      this.velocity.y = Math.max(0, this.velocity.y);
      this.isGrounded = true;
    }
  }

  /**
   * Launch precision ballistic or forward free pounce
   */
  public executePounce(lockedTarget: PounceTargetCandidate | null, vitals: CatVitals): boolean {
    if (this.isPouncing || !this.isGrounded) return false;
    if (!vitals.consumePounceStamina(22)) {
      this.events.onNotification?.('Exhausted!', 'Not enough stamina to execute a precision pounce. Catch your breath or eat!', 'warn');
      return false;
    }

    if (lockedTarget) {
      const targetPos = lockedTarget.targetPos;
      const dx = targetPos.x - this.position.x;
      const dz = targetPos.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      const safeDist = Math.max(0.001, dist);

      const targetHeading = Math.atan2(dx, dz);
      this.heading = targetHeading;
      this.prevHeading = targetHeading;
      this.bankAngle = 0;
      this.prevBankAngle = 0;

      const flightTime = Math.max(0.25, Math.min(0.5, dist / 11.5));
      const gravity = 18.0;
      const dy = targetPos.y - this.position.y;
      const initialVy = (dy + 0.5 * gravity * flightTime * flightTime) / flightTime;

      const horizSpeed = dist / flightTime;
      const dirX = dx / safeDist;
      const dirZ = dz / safeDist;

      this.velocity.set(dirX * horizSpeed, Math.max(4.2, initialVy), dirZ * horizSpeed);
      this.pounceTimer = flightTime + 0.1;
      this.isPouncing = true;
      this.isGrounded = false;

      soundEngine.playPounce();
      return true;
    } else {
      // Free Pounce Forward
      soundEngine.playPounce();
      this.isPouncing = true;
      this.pounceTimer = 0.45;
      this.isGrounded = false;

      PhysicsSubsystem.scratchForward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      this.velocity.copy(PhysicsSubsystem.scratchForward).multiplyScalar(10.5);
      this.velocity.y = 5.5;
      return true;
    }
  }

  /**
   * Interpolates physics position, heading, and bank angle for silky smooth rendering
   */
  public interpolate(alpha: number, outPosition: THREE.Vector3): { heading: number; bankAngle: number } {
    outPosition.lerpVectors(this.prevPosition, this.position, alpha);

    let headingDiff = this.heading - this.prevHeading;
    headingDiff = Math.atan2(Math.sin(headingDiff), Math.cos(headingDiff));
    const renderYaw = this.prevHeading + headingDiff * alpha;
    const renderBank = THREE.MathUtils.lerp(this.prevBankAngle, this.bankAngle, alpha);

    return { heading: renderYaw, bankAngle: renderBank };
  }
}
