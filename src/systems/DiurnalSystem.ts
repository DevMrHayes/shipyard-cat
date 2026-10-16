/**
 * DiurnalSystem.ts - Continuous 24-Hour Shipyard Celestial & Shift Cycle
 * ======================================================================
 * Manages continuous time-of-day progression, orbital sun/moon movement,
 * multi-keyframe atmospheric interpolation with dynamic industrial exponential fog (FogExp2),
 * dynamic high-mast floodlight illumination with distance falloff, and
 * 3-shift shipyard operational governance (1st, 2nd, and 3rd shifts).
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
  fogDensity: number;
  sun: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  sunIntensity: number;
  ambientIntensity: number;
  shadowBias: number;
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
  private floodlights: (THREE.Light | THREE.SpotLight | THREE.PointLight)[] = [];

  private keyframes: DiurnalKeyframe[];
  public onShiftChange?: (info: ShiftInfo) => void;

  constructor(
    scene: THREE.Scene,
    sunLight: THREE.DirectionalLight,
    ambientLight: THREE.AmbientLight,
    hemiLight: THREE.HemisphereLight,
    floodlights: (THREE.Light | THREE.SpotLight | THREE.PointLight)[] = []
  ) {
    this.scene = scene;
    this.sunLight = sunLight;
    this.ambientLight = ambientLight;
    this.hemiLight = hemiLight;
    this.floodlights = floodlights;

    // Configure directional key-light shadow maps for crisper shipyard contours
    if (this.sunLight.shadow) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 2048;
      this.sunLight.shadow.mapSize.height = 2048;
      this.sunLight.shadow.camera.near = 5;
      this.sunLight.shadow.camera.far = 380;
      const d = 110;
      this.sunLight.shadow.camera.left = -d;
      this.sunLight.shadow.camera.right = d;
      this.sunLight.shadow.camera.top = d;
      this.sunLight.shadow.camera.bottom = -d;
      this.sunLight.shadow.bias = -0.0006;
      this.sunLight.shadow.normalBias = 0.035;
    }

    // Ensure industrial exponential fog is installed on scene
    if (!(this.scene.fog instanceof THREE.FogExp2)) {
      this.scene.fog = new THREE.FogExp2(0x131d2e, 0.0035);
    }

    // Atmospheric color and fog gradients matching Newport News Shipbuilding coastal marine aesthetic
    this.keyframes = [
      {
        hour: 0.0, // Midnight
        sky: new THREE.Color(0x020617),
        fog: new THREE.Color(0x040817),
        fogDensity: 0.0048,
        sun: new THREE.Color(0x38bdf8),
        hemiSky: new THREE.Color(0x0f172a),
        hemiGround: new THREE.Color(0x020617),
        sunIntensity: 0.35,
        ambientIntensity: 0.18,
        shadowBias: -0.0004
      },
      {
        hour: 5.2, // Pre-Dawn marine haze
        sky: new THREE.Color(0x1e1b4b),
        fog: new THREE.Color(0x1f143d),
        fogDensity: 0.0062,
        sun: new THREE.Color(0xf97316),
        hemiSky: new THREE.Color(0x3b0764),
        hemiGround: new THREE.Color(0x0f172a),
        sunIntensity: 0.6,
        ambientIntensity: 0.3,
        shadowBias: -0.0005
      },
      {
        hour: 7.0, // Dawn / 1st Shift Whistle
        sky: new THREE.Color(0xd97706),
        fog: new THREE.Color(0x9a3412),
        fogDensity: 0.005,
        sun: new THREE.Color(0xfde047),
        hemiSky: new THREE.Color(0xfef08a),
        hemiGround: new THREE.Color(0x334155),
        sunIntensity: 1.8,
        ambientIntensity: 0.65,
        shadowBias: -0.0008
      },
      {
        hour: 12.0, // High Noon - Crisp direct sun
        sky: new THREE.Color(0x1e293b),
        fog: new THREE.Color(0x243248),
        fogDensity: 0.0028,
        sun: new THREE.Color(0xfff6e5),
        hemiSky: new THREE.Color(0xcbd5e1),
        hemiGround: new THREE.Color(0x1e293b),
        sunIntensity: 2.8,
        ambientIntensity: 1.15,
        shadowBias: -0.0007
      },
      {
        hour: 17.5, // Dusk / Golden Hour
        sky: new THREE.Color(0x9a3412),
        fog: new THREE.Color(0x7c2d12),
        fogDensity: 0.0042,
        sun: new THREE.Color(0xfb923c),
        hemiSky: new THREE.Color(0xfdba74),
        hemiGround: new THREE.Color(0x1e293b),
        sunIntensity: 1.6,
        ambientIntensity: 0.6,
        shadowBias: -0.0007
      },
      {
        hour: 19.5, // Nightfall
        sky: new THREE.Color(0x070b14),
        fog: new THREE.Color(0x080e1d),
        fogDensity: 0.0052,
        sun: new THREE.Color(0x38bdf8),
        hemiSky: new THREE.Color(0x1e293b),
        hemiGround: new THREE.Color(0x020617),
        sunIntensity: 0.45,
        ambientIntensity: 0.22,
        shadowBias: -0.0004
      },
      {
        hour: 24.0, // Midnight Wrap
        sky: new THREE.Color(0x020617),
        fog: new THREE.Color(0x040817),
        fogDensity: 0.0048,
        sun: new THREE.Color(0x38bdf8),
        hemiSky: new THREE.Color(0x0f172a),
        hemiGround: new THREE.Color(0x020617),
        sunIntensity: 0.35,
        ambientIntensity: 0.18,
        shadowBias: -0.0004
      }
    ];

    this.configureInitialFloodlights();
  }

  private configureInitialFloodlights(): void {
    for (const light of this.floodlights) {
      if ('decay' in light) {
        (light as THREE.PointLight | THREE.SpotLight).decay = 2.0;
      }
      if ('distance' in light && (light as any).distance === 0) {
        (light as any).distance = 120;
      }
      if (light instanceof THREE.SpotLight) {
        light.penumbra = 0.65;
        light.angle = Math.PI / 3.2;
      }
    }
  }

  public registerFloodlight(light: THREE.Light | THREE.SpotLight | THREE.PointLight): void {
    if (!this.floodlights.includes(light)) {
      if ('decay' in light) {
        (light as THREE.PointLight | THREE.SpotLight).decay = 2.0;
      }
      if ('distance' in light && (light as any).distance === 0) {
        (light as any).distance = 120;
      }
      if (light instanceof THREE.SpotLight) {
        light.penumbra = 0.65;
        light.angle = Math.PI / 3.2;
      }
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
    // Solar trajectory across 170m radius dome
    const solarAngle = ((this.timeOfDay - 6.0) / 24.0) * Math.PI * 2;
    const orbitRadius = 170;

    const sunX = Math.cos(solarAngle) * orbitRadius;
    const sunY = Math.sin(solarAngle) * orbitRadius;
    const sunZ = 50.0; // Axial tilt over James River & dry docks

    if (sunY < 0) {
      // Moon trajectory during night hours
      this.sunLight.position.set(-sunX * 0.75, Math.abs(sunY) * 0.75 + 35, -sunZ);
    } else {
      this.sunLight.position.set(sunX, Math.max(sunY, 12), sunZ);
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

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.lerpColors(k0.fog, k1.fog, alpha);
      this.scene.fog.density = THREE.MathUtils.lerp(k0.fogDensity, k1.fogDensity, alpha);
    } else if (this.scene.fog && 'color' in this.scene.fog) {
      (this.scene.fog as any).color.lerpColors(k0.fog, k1.fog, alpha);
    }

    this.sunLight.color.lerpColors(k0.sun, k1.sun, alpha);
    this.sunLight.intensity = THREE.MathUtils.lerp(k0.sunIntensity, k1.sunIntensity, alpha);

    if (this.sunLight.shadow) {
      this.sunLight.shadow.bias = THREE.MathUtils.lerp(k0.shadowBias, k1.shadowBias, alpha);
    }

    this.ambientLight.intensity = THREE.MathUtils.lerp(k0.ambientIntensity, k1.ambientIntensity, alpha);
    this.hemiLight.color.lerpColors(k0.hemiSky, k1.hemiSky, alpha);
    this.hemiLight.groundColor.lerpColors(k0.hemiGround, k1.hemiGround, alpha);
  }

  private updateFloodlights(): void {
    // High-mast stadium sodium & LED floodlights activate at twilight/night (18:30 - 05:45)
    const shouldBeOn = this.timeOfDay >= 18.5 || this.timeOfDay < 5.75;
    this.isNight = shouldBeOn;

    const targetIntensity = shouldBeOn ? 7.5 : 0.05;

    for (const light of this.floodlights) {
      // Smooth physical intensity ramp
      light.intensity = THREE.MathUtils.lerp(light.intensity, targetIntensity, 0.08);

      if ('decay' in light && (light as any).decay !== 2.0) {
        (light as THREE.PointLight | THREE.SpotLight).decay = 2.0;
      }
    }
    this.floodlightsActive = shouldBeOn;
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