import * as THREE from 'three';

export interface RadiationHotspot {
  id: string;
  name: string;
  position: THREE.Vector3;
  maxDose: number; // mSv/hr at epicenter
  decayRadius: number; // Radius in world units
}

export class RadiationSystem {
  public static readonly BackgroundLevel = 0.05; // Normal mSv/hr
  private hotspots: RadiationHotspot[] = [];

  constructor() {
    // Default hotspots at Newport News Shipbuilding
    this.addHotspot({
      id: 'rcoh_reactor_vault',
      name: 'RCOH Decommissioned Core Vault',
      position: new THREE.Vector3(45, 0, -60),
      maxDose: 12.5,
      decayRadius: 35
    });

    this.addHotspot({
      id: 'sub_sonar_shielding',
      name: 'Submarine Reactor Compartment Mockup',
      position: new THREE.Vector3(-30, 2, 40),
      maxDose: 6.2,
      decayRadius: 20
    });
  }

  public addHotspot(spot: RadiationHotspot) {
    this.hotspots.push(spot);
  }

  public getHotspots(): RadiationHotspot[] {
    return this.hotspots;
  }

  public calculateRadiationAtPoint(point: THREE.Vector3): { totalDose: number; nearestHotspot: RadiationHotspot | null } {
    let totalDose = RadiationSystem.BackgroundLevel;
    let nearestHotspot: RadiationHotspot | null = null;
    let maxHotspotDose = 0;

    for (const spot of this.hotspots) {
      const distance = point.distanceTo(spot.position);
      if (distance < spot.decayRadius) {
        const normalizedDist = Math.max(distance / spot.decayRadius, 0.05);
        // Inverse-Square falloff
        const spotDose = spot.maxDose / (normalizedDist * normalizedDist);
        const clampedDose = Math.min(spot.maxDose, Math.max(RadiationSystem.BackgroundLevel, spotDose * 0.15));

        totalDose += clampedDose;
        if (clampedDose > maxHotspotDose) {
          maxHotspotDose = clampedDose;
          nearestHotspot = spot;
        }
      }
    }

    return { totalDose: Math.round(totalDose * 100) / 100, nearestHotspot };
  }
}
