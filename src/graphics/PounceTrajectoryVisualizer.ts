import * as THREE from 'three';

/**
 * PounceTrajectoryVisualizer - Projects a dynamic dotted parabolic leap trajectory arc
 * with landing circle reticle when the player aims a pounce (Hold [F] or Right Click).
 */
export class PounceTrajectoryVisualizer {
  public group: THREE.Group;
  private lineMesh: THREE.Line;
  private reticleMesh: THREE.Mesh;
  private maxPoints: number = 32;
  private positions: Float32Array;
  private positionAttribute: THREE.BufferAttribute;

  constructor() {
    this.group = new THREE.Group();

    // 1. Dotted/Dashed Parabolic Arc
    this.positions = new Float32Array(this.maxPoints * 3);
    const lineGeo = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    lineGeo.setAttribute('position', this.positionAttribute);

    const lineMat = new THREE.LineDashedMaterial({
      color: 0xf59e0b, // Amber Gold
      dashSize: 0.25,
      gapSize: 0.15,
      linewidth: 3,
      transparent: true,
      opacity: 0.95
    });

    this.lineMesh = new THREE.Line(lineGeo, lineMat);
    this.lineMesh.frustumCulled = false;
    this.group.add(this.lineMesh);

    // 2. Target Landing Ring Reticle
    const reticleGeo = new THREE.RingGeometry(0.35, 0.45, 24);
    reticleGeo.rotateX(-Math.PI / 2);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.reticleMesh = new THREE.Mesh(reticleGeo, reticleMat);
    this.group.add(this.reticleMesh);

    this.setVisible(false);
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public updateTrajectory(
    origin: THREE.Vector3,
    velocity: THREE.Vector3,
    gravity: number = 18.0,
    targetFloorY: number = 0.0
  ): void {
    const flightTime = Math.max(0.2, (velocity.y + Math.sqrt(velocity.y * velocity.y + 2 * gravity * Math.max(0, origin.y - targetFloorY))) / gravity);
    const dt = flightTime / (this.maxPoints - 1);

    for (let i = 0; i < this.maxPoints; i++) {
      const t = i * dt;
      const x = origin.x + velocity.x * t;
      const y = Math.max(targetFloorY, origin.y + velocity.y * t - 0.5 * gravity * t * t);
      const z = origin.z + velocity.z * t;

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y + 0.05; // Slightly above ground
      this.positions[i * 3 + 2] = z;
    }

    this.positionAttribute.needsUpdate = true;
    this.lineMesh.computeLineDistances();

    // Position landing reticle at trajectory endpoint
    const endX = this.positions[(this.maxPoints - 1) * 3];
    const endY = this.positions[(this.maxPoints - 1) * 3 + 1];
    const endZ = this.positions[(this.maxPoints - 1) * 3 + 2];
    this.reticleMesh.position.set(endX, endY + 0.02, endZ);
  }

  /**
   * Switches trajectory color to vibrant green when a valid prey target is locked in range
   */
  public setTargetLock(inRange: boolean): void {
    const targetColor = inRange ? 0x22c55e : 0xf59e0b; // Green when in range, Amber when aiming/out of range
    (this.lineMesh.material as THREE.LineDashedMaterial).color.setHex(targetColor);
    (this.reticleMesh.material as THREE.MeshBasicMaterial).color.setHex(targetColor);
  }
}
