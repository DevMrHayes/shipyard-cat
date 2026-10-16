/**
 * DiurnalSystem.ts - Continuous 24-Hour Shipyard Celestial & Shift Cycle
 * ======================================================================
 * Manages continuous time-of-day progression, orbital sun/moon movement,
 * multi-keyframe atmospheric interpolation, automatic stadium floodlight switching,
 * and 3-shift shipyard operational governance (1st, 2nd, and 3rd shifts).
 */

import * as THREE from 'three';

export interface ShiftInfo {
  shiftId: '1ST_SHIFT' | '2ND_SHIFT' | '3RD_SHIFT';
  label: string;
  subTitle: string;
  isNight: boolean;
  timeString: string;
}

interface DiurnalKeyframe {
  hour: number;
  sky: THREE.Color;
  fog: THREE.Color;
  sun: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  sunIntensity: number;
  ambientIntensity: number;
}

export class DiurnalSystem {
  // Time progression: 0.0 to 24.0 hours (starts at 07:00 1st Shift)
  public timeOfDay: number = 7.0;
  
  // 1 real second = 0.02 game hours -> 1 full 24h cycle = 20 real minutes
  public timeScale: number = 0.02;

  public currentShift: '1ST_SHIFT' | '2ND_SHIFT' | '3RD_SHIFT' = '1ST_SHIFT';
  public isNight: boolean = false;
  public floodlightsActive: boolean = false;

  private scene: THREE.Scene;
  private sunLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private floodlights: THREE.Light[] = [];

  private keyframes: DiurnalKeyframe[];
  public onShiftChange?: (info: ShiftInfo) => void;

  constructor(
    scene: THREE.Scene,
    sunLight: THREE.DirectionalLight,
    ambientLight: THREE.AmbientLight,
    hemiLight: THREE.HemisphereLight,
    floodlights: THREE.Light[] = []
  ) {
    this.scene = scene;
    this.sunLight = sunLight;
    this.ambientLight = ambientLight;
    this.hemiLight = hemiLight;
    this.floodlights = floodlights;

    // Atmospheric color gradients matching Newport News Shipbuilding coastal marine aesthetic
    this.keyframes = [
      {
        hour: 0.0, // Midnight
        sky: new THREE.Color(0x020617),
        fog: new THREE.Color(0x020617),
        sun: new THREE.Color(0x1e3a8a),
        hemiSky: new THREE.Color(0x0f172a),
        hemiGround: new THREE.Color(0x020617),
        sunIntensity: 0.25,
        ambientIntensity: 0.2
      },
      {
        hour: 5.5, // Pre-Dawn twilight
        sky: new THREE.Color(0x1e1b4b),
        fog: new THREE.Color(0x2e1065),
        sun: new THREE.Color(0xf97316),
        hemiSky: new THREE.Color(0x3b0764),
        hemiGround: new THREE.Color(0x0f172a),
        sunIntensity: 0.55,
        ambientIntensity: 0.35
      },
      {
        hour: 7.0, // Dawn / 1st Shift Whistle
        sky: new THREE.Color(0xd97706),
        fog: new THREE.Color(0xb45309),
        sun: new THREE.Color(0xfde047),
        hemiSky: new THREE.Color(0xfef08a),
        hemiGround: new THREE.Color(0x334155),
        sunIntensity: 1.6,
        ambientIntensity: 0.6
      },
      {
        hour: 12.0, // High Noon
        sky: new THREE.Color(0x131d2e),
        fog: new THREE.Color(0x131d2e),
        sun: new THREE.Color(0xfff4e0),
        hemiSky: new THREE.Color(0xcbd5e1),
        hemiGround: new THREE.Color(0x1e293b),
        sunIntensity: 2.45,
        ambientIntensity: 1.1
      },
      {
        hour: 17.5, // Dusk / Golden Hour
        sky: new THREE.Color(0x9a3412),
        fog: new THREE.Color(0x7c2d12),
        sun: new THREE.Color(0xfb923c),
        hemiSky: new THREE.Color(0xfdba74),
        hemiGround: new THREE.Color(0x1e293b),
        sunIntensity: 1.4,
        ambientIntensity: 0.55
      },
      {
        hour: 19.5, // Nightfall
        sky: new THREE.Color(0x090d16),
        fog: new THREE.Color(0x090d16),
        sun: new THREE.Color(0x3b82f6),
        hemiSky: new THREE.Color(0x1e293b),
        hemiGround: new THREE.Color(0x020617),
        sunIntensity: 0.35,
        ambientIntensity: 0.25
      },
      {
        hour: 24.0, // Midnight Wrap
        sky: new THREE.Color(0x020617),
        fog: new THREE.Color(0x020617),
        sun: new THREE.Color(0x1e3a8a),
        hemiSky: new THREE.Color(0x0f172a),
        hemiGround: new THREE.Color(0x020617),
        sunIntensity: 0.25,
        ambientIntensity: 0.2
      }
    ];
  }

  public registerFloodlight(light: THREE.Light): void {
    if (!this.floodlights.includes(light)) {
      this.floodlights.push(light);
    }
  }

  public update(deltaTime: number): ShiftInfo {
    this.timeOfDay = (this.timeOfDay + deltaTime * this.timeScale) % 24.0;

    this.updateSunTrajectory();
    this.updateAtmosphere();
    this.updateFloodlights();
    return this.evaluateShift();
  }

  public setTime(hour: number): void {
    this.timeOfDay = Math.max(0, Math.min(23.99, hour));
    this.updateSunTrajectory();
    this.updateAtmosphere();
    this.updateFloodlights();
  }

  private updateSunTrajectory(): void {
    // Solar trajectory across 160m radius dome
    // Rises at 06:00 (angle 0) and sets at 18:00 (angle PI)
    const solarAngle = ((this.timeOfDay - 6.0) / 24.0) * Math.PI * 2;
    const orbitRadius = 150;

    const sunX = Math.cos(solarAngle) * orbitRadius;
    const sunY = Math.sin(solarAngle) * orbitRadius;
    const sunZ = 45.0; // Axial tilt over James River & dry docks

    if (sunY < 0) {
      // Moon trajectory at night
      this.sunLight.position.set(-sunX * 0.7, Math.abs(sunY) * 0.7 + 30, -sunZ);
    } else {
      this.sunLight.position.set(sunX, Math.max(sunY, 10), sunZ);
    }
  }

  private updateAtmosphere(): void {
    let k0 = this.keyframes[0];
    let k1 = this.keyframes[this.keyframes.length - 1];

    for (let i = 0; i < this.keyframes.length - 1; i++) {
      if (this.timeOfDay >= this.keyframes[i].hour && this.timeOfDay <= this.keyframes[i + 1].hour) {
        k0 = this.keyframes[i];
        k1 = this.keyframes[i + 1];
        break;
      }
    }

    const span = k1.hour - k0.hour;
    const alpha = span > 0 ? (this.timeOfDay - k0.hour) / span : 0;

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.lerpColors(k0.sky, k1.sky, alpha);
    }
    if (this.scene.fog && 'color' in this.scene.fog) {
      (this.scene.fog as any).color.lerpColors(k0.fog, k1.fog, alpha);
    }
    if (this.scene.fog && 'density' in this.scene.fog) {
      // Dynamic industrial exponential fog density: 0.0062 at high noon to 0.0088 at night / marine dawn
      const isLowSun = this.timeOfDay >= 18.5 || this.timeOfDay < 7.0;
      const targetDensity = isLowSun ? 0.0085 : 0.0065;
      (this.scene.fog as THREE.FogExp2).density = THREE.MathUtils.lerp(
        (this.scene.fog as THREE.FogExp2).density,
        targetDensity,
        0.05
      );
    }

    this.sunLight.color.lerpColors(k0.sun, k1.sun, alpha);
    this.sunLight.intensity = THREE.MathUtils.lerp(k0.sunIntensity, k1.sunIntensity, alpha);

    this.ambientLight.intensity = THREE.MathUtils.lerp(k0.ambientIntensity, k1.ambientIntensity, alpha);
    this.hemiLight.color.lerpColors(k0.hemiSky, k1.hemiSky, alpha);
    this.hemiLight.groundColor.lerpColors(k0.hemiGround, k1.hemiGround, alpha);
  }

  private updateFloodlights(): void {
    // High-mast sodium stadium lights engage between 18:00 and 06:00
    const shouldBeOn = this.timeOfDay >= 18.0 || this.timeOfDay < 6.0;
    this.isNight = shouldBeOn;

    if (shouldBeOn !== this.floodlightsActive) {
      this.floodlightsActive = shouldBeOn;
      const targetIntensity = shouldBeOn ? 6.5 : 0.8;
      for (const light of this.floodlights) {
        light.intensity = targetIntensity;
      }
    }
  }

  public evaluateShift(): ShiftInfo {
    const hours = Math.floor(this.timeOfDay);
    const minutes = Math.floor((this.timeOfDay - hours) * 60);
    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    let shiftId: '1ST_SHIFT' | '2ND_SHIFT' | '3RD_SHIFT' = '1ST_SHIFT';
    let label = '1ST SHIFT: DAY FABRICATION';
    let subTitle = 'Active welders, heavy crane lifts, and shipyard trades.';

    if (this.timeOfDay >= 7.0 && this.timeOfDay < 15.5) {
      shiftId = '1ST_SHIFT';
      label = '1ST SHIFT: DAY FABRICATION';
      subTitle = 'Active welders, heavy crane lifts, and shipyard trades.';
    } else if (this.timeOfDay >= 15.5 && this.timeOfDay < 23.5) {
      shiftId = '2ND_SHIFT';
      label = '2ND SHIFT: EVENING ASSEMBLY';
      subTitle = 'Hot-work cooling, turnover inspections, twilight lighting.';
    } else {
      shiftId = '3RD_SHIFT';
      label = '3RD SHIFT: NIGHT SECURITY';
      subTitle = 'High-mast sodium floodlights, stealth perimeter patrols.';
    }

    const info: ShiftInfo = {
      shiftId,
      label,
      subTitle,
      isNight: this.isNight,
      timeString
    };

    if (shiftId !== this.currentShift) {
      this.currentShift = shiftId;
      this.onShiftChange?.(info);
    }

    return info;
  }
}
