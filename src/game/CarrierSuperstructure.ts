import * as THREE from 'three';
import { PlatformSurface } from './IndustrialExpansion';

export interface CarrierSuperstructureOptions {
  parentGroup: THREE.Group;
  origin?: THREE.Vector3;
  hullMaterial?: THREE.Material;
  flightDeckMaterial?: THREE.Material;
  registerPlatform?: (platform: PlatformSurface) => void;
}

/**
 * CarrierSuperstructure - Modular builder for CVN-80 Enterprise Island Superstructure,
 * Pri-Fly cantilever bridge, mast spire, tactical '80' hull markings, and yard-to-flight-deck gangway.
 */
export class CarrierSuperstructure {
  private parentGroup: THREE.Group;
  private origin: THREE.Vector3;
  private registerPlatform?: (platform: PlatformSurface) => void;

  // Materials
  private matHazeGray: THREE.MeshStandardMaterial;
  private matDeckCharcoal: THREE.MeshStandardMaterial;
  private matPriFlyGlass: THREE.MeshStandardMaterial;
  private matDarkSteel: THREE.MeshStandardMaterial;
  private matWarningYellow: THREE.MeshStandardMaterial;

  constructor(options: CarrierSuperstructureOptions) {
    this.parentGroup = options.parentGroup;
    this.origin = options.origin || new THREE.Vector3(20.5, -2.5, 32.0);
    this.registerPlatform = options.registerPlatform;

    this.matHazeGray = (options.hullMaterial as THREE.MeshStandardMaterial) ?? new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.55,
      metalness: 0.65
    });

    this.matDeckCharcoal = (options.flightDeckMaterial as THREE.MeshStandardMaterial) ?? new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.2
    });

    this.matPriFlyGlass = new THREE.MeshStandardMaterial({
      color: 0x112233,
      roughness: 0.1,
      metalness: 0.9
    });

    this.matDarkSteel = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.6,
      metalness: 0.8
    });

    this.matWarningYellow = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.4
    });

    this.build();
  }

  private build(): void {
    const root = new THREE.Group();
    root.name = 'CVN80_Island_and_Gangway';

    this.buildIslandTower(root);
    this.buildYardToFlightDeckGangway(root);

    this.parentGroup.add(root);
  }

  /**
   * 1. Monumental Island Superstructure (Ford-Class Aft-Starboard Layout)
   * High-visibility island tower rising to Y = 13.5m above basin (11.0m above yard ground)
   * Featuring Primary Flight Control (Pri-Fly) cantilever bridge, SPY-6 radar faces, and tactical '80' decals.
   */
  private buildIslandTower(root: THREE.Group): void {
    const islandGroup = new THREE.Group();
    islandGroup.name = 'CVN80_Island_Tower';
    // Positioned on the Starboard side of the carrier hull block (local coordinates)
    islandGroup.position.set(5.5, 5.0, 4.0);

    // Main Island Lower Base (Width: 4.8m, Height: 6.0m, Length: 9.0m)
    const baseGeo = new THREE.BoxGeometry(4.8, 6.0, 9.0);
    const islandBase = new THREE.Mesh(baseGeo, this.matHazeGray);
    islandBase.position.set(0, 3.0, 0);
    islandBase.castShadow = true;
    islandBase.receiveShadow = true;
    islandGroup.add(islandBase);

    // Register Island Lower Catwalk / Roof platform
    if (this.registerPlatform) {
      // World position: origin + islandGroup position
      const worldX = this.origin.x + islandGroup.position.x;
      const worldZ = this.origin.z + islandGroup.position.z;
      const worldY = this.origin.y + islandGroup.position.y + 6.0; // Y = -2.5 + 5.0 + 6.0 = 8.5m
      this.registerPlatform({
        minX: worldX - 2.4,
        maxX: worldX + 2.4,
        minZ: worldZ - 4.5,
        maxZ: worldZ + 4.5,
        height: worldY
      });
    }

    // Upper Pri-Fly (Primary Flight Control) Cantilever Bridge overlooking flight deck
    const priFlyGeo = new THREE.BoxGeometry(5.4, 2.2, 5.5);
    const priFly = new THREE.Mesh(priFlyGeo, this.matHazeGray);
    priFly.position.set(-0.5, 7.1, -1.2);
    priFly.castShadow = true;
    islandGroup.add(priFly);

    // 360-Degree Wraparound Tinted Bridge Windows
    const winGeo = new THREE.BoxGeometry(5.5, 0.9, 5.6);
    const windows = new THREE.Mesh(winGeo, this.matPriFlyGlass);
    windows.position.set(-0.5, 7.25, -1.2);
    islandGroup.add(windows);

    // SPY-6 AESA Phased Array Radar Octagonal Cheeks
    const radarGeo = new THREE.BoxGeometry(0.18, 1.8, 1.8);
    const radarPort = new THREE.Mesh(radarGeo, this.matDarkSteel);
    radarPort.position.set(-2.45, 4.2, 0);
    const radarFwd = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 0.18), this.matDarkSteel);
    radarFwd.position.set(0, 4.2, 4.55);
    islandGroup.add(radarPort, radarFwd);

    // High Radar Mast Spire & Yardarm
    const mastGeo = new THREE.CylinderGeometry(0.15, 0.35, 6.0, 8);
    const mast = new THREE.Mesh(mastGeo, this.matDarkSteel);
    mast.position.set(0, 11.2, -1.0);
    mast.castShadow = true;

    const yardarmGeo = new THREE.BoxGeometry(3.6, 0.12, 0.12);
    const yardarm = new THREE.Mesh(yardarmGeo, this.matDarkSteel);
    yardarm.position.set(0, 12.0, -1.0);
    islandGroup.add(mast, yardarm);

    // Tactical '80' Hull Decal Panels
    const decalMat = this.createTacticalDecalMaterial('80');
    const decalGeo = new THREE.PlaneGeometry(3.2, 3.2);

    // Port-facing decal (visible from shipyard ground & flight deck)
    const portDecal = new THREE.Mesh(decalGeo, decalMat);
    portDecal.position.set(-2.45, 3.2, 2.0);
    portDecal.rotation.y = -Math.PI / 2;
    islandGroup.add(portDecal);

    root.add(islandGroup);
  }

  /**
   * 2. Heavy Yard-to-Flight-Deck Industrial Gangway Ramp
   * Connects Dry Dock 12 Yard Rim (X = 12.0, Y = 0.0m) to Carrier Flight Deck (X = 17.0, Y = 3.25m)
   * Features anti-slip ribbed walkway and safety yellow handrails.
   */
  private buildYardToFlightDeckGangway(root: THREE.Group): void {
    const gangwayGroup = new THREE.Group();
    gangwayGroup.name = 'CVN80_FlightDeck_Gangway';

    // In local coordinates of cvnGroup (origin = 20.5, -2.5, 32.0):
    // Yard rim is at X = 12.5 (local X = 12.5 - 20.5 = -8.0), local Y = 2.5 (world Y = 0.0), Z = 12.0
    // Flight deck edge is at local X = -4.0, local Y = 5.75 (world Y = 3.25), Z = 12.0
    const startLocal = new THREE.Vector3(-8.2, 2.5, 12.0);
    const endLocal = new THREE.Vector3(-4.0, 5.75, 12.0);

    const delta = new THREE.Vector3().subVectors(endLocal, startLocal);
    const spanLen = delta.length();
    const midPoint = new THREE.Vector3().addVectors(startLocal, endLocal).multiplyScalar(0.5);
    const slopeAngle = Math.atan2(delta.y, delta.x);

    gangwayGroup.position.copy(midPoint);
    gangwayGroup.rotation.z = slopeAngle;

    const walkwayWidth = 2.2;
    const gangwayDeck = new THREE.Mesh(
      new THREE.BoxGeometry(spanLen + 0.2, 0.15, walkwayWidth),
      this.matDarkSteel
    );
    gangwayDeck.castShadow = true;
    gangwayDeck.receiveShadow = true;
    gangwayGroup.add(gangwayDeck);

    // Anti-slip ribbed cleats
    for (let x = -spanLen / 2 + 0.4; x <= spanLen / 2 - 0.4; x += 0.8) {
      const cleat = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.04, walkwayWidth - 0.1),
        this.matWarningYellow
      );
      cleat.position.set(x, 0.09, 0);
      gangwayGroup.add(cleat);
    }

    // Safety Yellow Handrails
    [-walkwayWidth / 2 + 0.08, walkwayWidth / 2 - 0.08].forEach((zOff) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(spanLen + 0.2, 0.06, 0.06),
        this.matWarningYellow
      );
      rail.position.set(0, 0.75, zOff);
      gangwayGroup.add(rail);

      for (let x = -spanLen / 2; x <= spanLen / 2; x += 1.2) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.75, 0.06),
          this.matWarningYellow
        );
        post.position.set(x, 0.38, zOff);
        gangwayGroup.add(post);
      }
    });

    root.add(gangwayGroup);

    // Register climbable ramp platform for smooth cat ascent
    if (this.registerPlatform) {
      const worldStartX = this.origin.x + startLocal.x; // 12.3
      const worldEndX = this.origin.x + endLocal.x;     // 16.5
      const worldZ = this.origin.z + 12.0;              // 44.0

      // Stepped ramp platform surfaces (4 segments)
      const numRampSteps = 4;
      const stepDistX = (worldEndX - worldStartX) / numRampSteps;
      const stepRiseY = 3.25 / numRampSteps;

      for (let s = 0; s < numRampSteps; s++) {
        this.registerPlatform({
          minX: worldStartX + s * stepDistX,
          maxX: worldStartX + (s + 1) * stepDistX + 0.1,
          minZ: worldZ - walkwayWidth / 2,
          maxZ: worldZ + walkwayWidth / 2,
          height: (s + 1) * stepRiseY
        });
      }
    }
  }

  /**
   * Procedural Tactical Hull Decal Canvas ('80' for CVN-80 Enterprise)
   */
  private createTacticalDecalMaterial(hullNumber: string): THREE.MeshBasicMaterial {
    if (typeof document === 'undefined') {
      return new THREE.MeshBasicMaterial({
        color: 0xf8fafc,
        transparent: true,
        opacity: 0.9
      });
    }
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 512, 512);

      // Navy stencil font with tactical shadow
      ctx.font = '900 300px "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = '#0f172a';
      ctx.fillText(hullNumber, 264, 264);

      ctx.fillStyle = '#f8fafc';
      ctx.fillText(hullNumber, 256, 256);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
  }
}
