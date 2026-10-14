import * as THREE from 'three';

export interface Seagull {
  mesh: THREE.Group;
  wingLeft: THREE.Mesh;
  wingRight: THREE.Mesh;
  perchOrigin: THREE.Vector3;
  velocity: THREE.Vector3;
  isAirborne: boolean;
  flightTimer: number;
  flapPhase: number;
}

/**
 * SeagullFlock - Ambient Low-Poly Maritime Fauna.
 * Perches on dock bollards and gantry beams; scatters into the sunset sky
 * when Alba sprints or pounces nearby.
 */
export class SeagullFlock {
  public group: THREE.Group;
  private seagulls: Seagull[] = [];
  private static birdMat: THREE.MeshBasicMaterial | null = null;
  private static beakMat: THREE.MeshBasicMaterial | null = null;

  constructor() {
    this.group = new THREE.Group();

    if (!SeagullFlock.birdMat) {
      SeagullFlock.birdMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc }); // Crisp Seagull White
    }
    if (!SeagullFlock.beakMat) {
      SeagullFlock.beakMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b }); // Golden Orange Beak
    }

    const perchPositions = [
      new THREE.Vector3(55.5, 2.3, -20),  // Pier Bollard South
      new THREE.Vector3(55.5, 2.3, 0),    // Pier Bollard Mid
      new THREE.Vector3(55.5, 2.3, 20),   // Pier Bollard North
      new THREE.Vector3(45.0, 1.9, -60),  // Boarding Ramp Post
      new THREE.Vector3(-15.0, 0.9, -18), // Dorothy Tugboat Capstan
      new THREE.Vector3(13.8, 0.9, -27.5) // Dry Dock 1 Basin Rim
    ];

    perchPositions.forEach(pos => {
      this.spawnSeagull(pos);
    });
  }

  private spawnSeagull(pos: THREE.Vector3) {
    const birdGroup = new THREE.Group();

    // Body
    const bodyGeo = new THREE.ConeGeometry(0.12, 0.45, 5);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMesh = new THREE.Mesh(bodyGeo, SeagullFlock.birdMat!);
    birdGroup.add(bodyMesh);

    // Beak
    const beakGeo = new THREE.ConeGeometry(0.04, 0.15, 4);
    beakGeo.rotateX(Math.PI / 2);
    const beakMesh = new THREE.Mesh(beakGeo, SeagullFlock.beakMat!);
    beakMesh.position.set(0, 0.02, 0.28);
    birdGroup.add(beakMesh);

    // Left Wing
    const wingGeo = new THREE.PlaneGeometry(0.4, 0.15);
    wingGeo.rotateX(-Math.PI / 2);
    const wingLeft = new THREE.Mesh(wingGeo, SeagullFlock.birdMat!);
    wingLeft.position.set(-0.2, 0.05, 0);
    birdGroup.add(wingLeft);

    // Right Wing
    const wingRight = new THREE.Mesh(wingGeo, SeagullFlock.birdMat!);
    wingRight.position.set(0.2, 0.05, 0);
    birdGroup.add(wingRight);

    birdGroup.position.copy(pos);
    birdGroup.scale.set(1.1, 1.1, 1.1);
    this.group.add(birdGroup);

    this.seagulls.push({
      mesh: birdGroup,
      wingLeft,
      wingRight,
      perchOrigin: pos.clone(),
      velocity: new THREE.Vector3(),
      isAirborne: false,
      flightTimer: 0,
      flapPhase: Math.random() * Math.PI * 2
    });
  }

  // Pre-allocated static scratch vectors for zero-allocation Boids flocking
  private static readonly scratchSep = new THREE.Vector3();
  private static readonly scratchAli = new THREE.Vector3();
  private static readonly scratchCoh = new THREE.Vector3();
  private static readonly scratchDiff = new THREE.Vector3();
  private static readonly scratchCenter = new THREE.Vector3();
  private static readonly scratchAvgVel = new THREE.Vector3();

  public update(deltaTime: number, catPosition: THREE.Vector3, isCatSprintingOrPouncing: boolean): void {
    const birdCount = this.seagulls.length;

    // 1. Check for scatter trigger when Alba sprints or pounces nearby
    for (let i = 0; i < birdCount; i++) {
      const bird = this.seagulls[i];
      const distToCat = bird.mesh.position.distanceTo(catPosition);

      if (!bird.isAirborne && distToCat < 8.5 && isCatSprintingOrPouncing) {
        bird.isAirborne = true;
        bird.flightTimer = 6.0 + Math.random() * 4.0;
        const fleeDir = new THREE.Vector3()
          .subVectors(bird.mesh.position, catPosition)
          .normalize();
        fleeDir.y = 0.55 + Math.random() * 0.25; // Take off into sky
        bird.velocity.copy(fleeDir).multiplyScalar(7.5);
      }
    }

    // 2. Compute Craig Reynolds Boids Flocking Forces for Airborne Birds
    let airborneCount = 0;
    SeagullFlock.scratchCenter.set(0, 0, 0);
    SeagullFlock.scratchAvgVel.set(0, 0, 0);

    for (let i = 0; i < birdCount; i++) {
      if (this.seagulls[i].isAirborne) {
        airborneCount++;
        SeagullFlock.scratchCenter.add(this.seagulls[i].mesh.position);
        SeagullFlock.scratchAvgVel.add(this.seagulls[i].velocity);
      }
    }

    if (airborneCount > 1) {
      SeagullFlock.scratchCenter.multiplyScalar(1 / airborneCount);
      SeagullFlock.scratchAvgVel.multiplyScalar(1 / airborneCount);
    }

    // 3. Update Individual Kinematics & Wing Flapping
    for (let i = 0; i < birdCount; i++) {
      const bird = this.seagulls[i];
      if (!bird.isAirborne) continue;

      bird.flightTimer -= deltaTime;
      bird.flapPhase += deltaTime * 12.0;

      // Wing flapping
      const flapAngle = Math.sin(bird.flapPhase) * 0.45;
      bird.wingLeft.rotation.z = flapAngle;
      bird.wingRight.rotation.z = -flapAngle;

      if (airborneCount > 1) {
        // Separation (avoid crowding flock mates within 3.5m)
        SeagullFlock.scratchSep.set(0, 0, 0);
        let sepCount = 0;
        for (let j = 0; j < birdCount; j++) {
          if (i === j || !this.seagulls[j].isAirborne) continue;
          const d = bird.mesh.position.distanceTo(this.seagulls[j].mesh.position);
          if (d > 0.001 && d < 3.5) {
            SeagullFlock.scratchDiff.subVectors(bird.mesh.position, this.seagulls[j].mesh.position).normalize();
            SeagullFlock.scratchDiff.multiplyScalar(1.0 / d);
            SeagullFlock.scratchSep.add(SeagullFlock.scratchDiff);
            sepCount++;
          }
        }
        if (sepCount > 0) {
          SeagullFlock.scratchSep.multiplyScalar(1.0 / sepCount);
          bird.velocity.addScaledVector(SeagullFlock.scratchSep, deltaTime * 5.0);
        }

        // Alignment (steer towards average flock velocity)
        SeagullFlock.scratchAli.subVectors(SeagullFlock.scratchAvgVel, bird.velocity);
        bird.velocity.addScaledVector(SeagullFlock.scratchAli, deltaTime * 2.0);

        // Cohesion (steer towards center of mass)
        SeagullFlock.scratchCoh.subVectors(SeagullFlock.scratchCenter, bird.mesh.position);
        bird.velocity.addScaledVector(SeagullFlock.scratchCoh, deltaTime * 1.5);
      }

      // Gentle maritime river bias (+X direction toward James River)
      bird.velocity.x += (8.0 - bird.velocity.x) * deltaTime * 0.6;
      bird.velocity.clampLength(4.0, 9.5);

      // Apply velocity
      bird.mesh.position.addScaledVector(bird.velocity, deltaTime);
      bird.mesh.lookAt(
        bird.mesh.position.x + bird.velocity.x,
        bird.mesh.position.y + bird.velocity.y,
        bird.mesh.position.z + bird.velocity.z
      );

      // Return to perch after flight timer expires
      if (bird.flightTimer <= 0) {
        bird.isAirborne = false;
        bird.mesh.position.copy(bird.perchOrigin);
        bird.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
        bird.wingLeft.rotation.z = 0;
        bird.wingRight.rotation.z = 0;
      }
    }
  }
}
