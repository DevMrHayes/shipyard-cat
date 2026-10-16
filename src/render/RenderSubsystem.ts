import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { DiurnalSystem, ShiftInfo } from '../systems/DiurnalSystem';

export interface ScreenProjection {
  screenX: number;
  screenY: number;
  visible: boolean;
}

export interface RenderEvents {
  onLocationChange?: (location: string, isIndoors: boolean) => void;
}

/**
 * RenderSubsystem: Encapsulates the WebGL rendering pipeline, Three.js camera,
 * spring-arm collision avoidance, indoor/outdoor clamping, dynamic industrial atmospheric fog,
 * diurnal shift lighting with distance falloff high-mast floodlights,
 * shadow cascades, impact sparks particle simulation, and shader pre-warming.
 */
export class RenderSubsystem {
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public hdrSkyTexture: THREE.DataTexture | null = null;
  public isWhiskersMode: boolean = false;
  public isSceneReady: boolean = false;

  // Spring-Arm Camera State
  public cameraYaw: number = 0;
  public cameraPitch: number = 0.15;
  public currentCameraPos: THREE.Vector3 = new THREE.Vector3();
  public currentLookAt: THREE.Vector3 = new THREE.Vector3();
  public cameraShakeIntensity: number = 0;

  // Impact Sparks Particle System & Dynamic Hit Flash Light
  public sparkPoints: THREE.Points;
  public sparkPositions: Float32Array;
  public sparkVelocities: Float32Array;
  public sparkLifetimes: Float32Array;
  public static readonly MAX_SPARKS = 80;
  public hitFlashLight: THREE.PointLight;

  // Lighting References
  public hemiLight: THREE.HemisphereLight;
  public sunLight: THREE.DirectionalLight;
  public fillLight: THREE.DirectionalLight;
  public ambientLight!: THREE.AmbientLight;
  public southYardFlood: THREE.SpotLight;
  public dryDockFlood: THREE.SpotLight;
  public subShopFlood: THREE.SpotLight;
  public riverFlood: THREE.DirectionalLight;

  // Atmospheric Fog & Palettes
  public static readonly normalBgColor = new THREE.Color(0x131d2e);
  public static readonly sonarBgColor = new THREE.Color(0x021726);
  public static readonly dayFogColor = new THREE.Color(0x768ca0);
  public static readonly duskFogColor = new THREE.Color(0x382c3e);
  public static readonly nightFogColor = new THREE.Color(0x030814);

  public normalFog: THREE.FogExp2;
  public sonarFog: THREE.Fog;
  public isNightMode: boolean = false;
  public diurnalSystem!: DiurnalSystem;

  private targetFogColor: THREE.Color = new THREE.Color(0x768ca0);
  private currentFogColor: THREE.Color = new THREE.Color(0x768ca0);
  private targetFogDensity: number = 0.0055;
  private currentFogDensity: number = 0.0055;

  public updateDiurnal(deltaTime: number, scene?: THREE.Scene): ShiftInfo {
    const info = this.diurnalSystem.update(deltaTime);
    this.isNightMode = info.isNight;

    // Dynamic industrial exponential fog transitions based on solar cycle
    if (!this.isWhiskersMode && scene) {
      this.updateAtmosphericFog(deltaTime, info, scene);
    }

    return info;
  }

  /**
   * Smoothly interpolate industrial atmospheric exponential fog with diurnal cycle
   */
  private updateAtmosphericFog(deltaTime: number, info: ShiftInfo, scene: THREE.Scene): void {
    const timeNorm = info.cycleProgress; // 0.0 - 1.0 (0=Dawn, 0.25=Noon, 0.5=Dusk, 0.75=Midnight)

    if (info.isNight) {
      this.targetFogColor.copy(RenderSubsystem.nightFogColor);
      this.targetFogDensity = 0.0085; // Heavier maritime haze on night shift
    } else if (timeNorm > 0.42 && timeNorm < 0.6) {
      // Golden hour / Dusk shift
      this.targetFogColor.copy(RenderSubsystem.duskFogColor);
      this.targetFogDensity = 0.0068;
    } else {
      // Daytime industrial atmospheric haze
      this.targetFogColor.copy(RenderSubsystem.dayFogColor);
      this.targetFogDensity = 0.005;
    }

    const lerpRate = Math.min(1.0, deltaTime * 1.5);
    this.currentFogColor.lerp(this.targetFogColor, lerpRate);
    this.currentFogDensity = THREE.MathUtils.lerp(this.currentFogDensity, this.targetFogDensity, lerpRate);

    this.normalFog.color.copy(this.currentFogColor);
    this.normalFog.density = this.currentFogDensity;

    if (!scene.background || !(scene.background as any).isTexture) {
      (scene.background as THREE.Color).copy(this.currentFogColor);
    }
  }

  public setNightMode(isNight: boolean, scene: THREE.Scene): void {
    this.isNightMode = isNight;
    if (isNight) {
      this.hemiLight.color.setHex(0x1e293b);
      this.hemiLight.groundColor.setHex(0x020617);
      this.hemiLight.intensity = 0.35;
      if (this.ambientLight) this.ambientLight.intensity = 0.18;

      this.sunLight.color.setHex(0x60a5fa);
      this.sunLight.intensity = 0.3;

      this.fillLight.color.setHex(0x1e293b);
      this.fillLight.intensity = 0.15;

      this.riverFlood.intensity = 0.35;

      // High-mast stadium floodlights with realistic quadratic/physical falloff
      this.southYardFlood.intensity = 8.5;
      this.dryDockFlood.intensity = 9.8;
      this.subShopFlood.intensity = 8.5;

      this.targetFogColor.copy(RenderSubsystem.nightFogColor);
      this.targetFogDensity = 0.0085;
      scene.background = RenderSubsystem.nightFogColor;
      this.renderer.toneMappingExposure = 0.95;
    } else {
      this.hemiLight.color.setHex(0xcbd5e1);
      this.hemiLight.groundColor.setHex(0x1e293b);
      this.hemiLight.intensity = 1.35;

      this.sunLight.color.setHex(0xfff4e0);
      this.sunLight.intensity = 2.65;

      this.fillLight.color.setHex(0x38bdf8);
      this.fillLight.intensity = 1.4;

      this.riverFlood.intensity = 1.7;

      // Realistic daylight standby floodlights
      this.southYardFlood.intensity = 1.5;
      this.dryDockFlood.intensity = 1.8;
      this.subShopFlood.intensity = 1.5;

      this.targetFogColor.copy(RenderSubsystem.dayFogColor);
      this.targetFogDensity = 0.005;
      scene.background = this.hdrSkyTexture ? this.hdrSkyTexture : RenderSubsystem.dayFogColor;
      this.renderer.toneMappingExposure = 1.05;
    }
  }

  // --- Whiskers Vision Sonar Pulse Wave & Thermal Signature Properties ---
  public sonarWaveRing!: THREE.Mesh;
  public sonarWaveMaterial!: THREE.MeshBasicMaterial;
  public sonarWaveActive: boolean = false;
  public sonarWaveElapsed: number = 0;
  public static readonly SONAR_WAVE_DURATION = 1.2; // 1.2s expansion to 35m
  public static readonly SONAR_WAVE_MAX_RADIUS = 35.0;
  private lastPreyWhiskersMode: boolean = false;

  public static readonly THERMAL_COLORS = {
    PREY_AMBER: new THREE.Color(0xff9500),       // Warm high-contrast amber/orange for mice & rats
    KINGPIN_CRIMSON: new THREE.Color(0x991b1b),  // Deep menacing crimson silhouette for Rat Kingpin
    MUTANT_VIOLET: new THREE.Color(0xc026d3),    // Radioactive vibrant violet for mutants
    NEUTRAL_CYAN: new THREE.Color(0x06b6d4)      // Cool blueprint cyan
  };

  // --- Spring-Arm Camera Collision State & Zero-Allocation Scratch Buffers ---
  private currentCamDist: number = 3.8;
  private static readonly DEFAULT_CAM_DIST = 3.8;
  private static readonly MIN_CAM_DIST = 1.2;
  private static readonly CAM_COLLISION_OFFSET = 0.25;
  private static readonly scratchRayOrigin = new THREE.Vector3();
  private static readonly scratchRayDir = new THREE.Vector3();

  // Static preallocated scratch objects (Zero GC in hot frame loop)
  private static readonly scratchDesiredCamPos = new THREE.Vector3();
  private static readonly scratchLookAt = new THREE.Vector3();
  private static readonly scratchProjectVec = new THREE.Vector3();
  private static readonly scratchScreenProj: ScreenProjection = { screenX: 0, screenY: 0, visible: false };

  // Location tracking state
  private lastLocationName: string = '';
  private lastLocationNotificationTime: number = -4000;
  private currentLocationString: string = 'Shipyard Grounds (South Yard)';

  public getCurrentLocationName(): string {
    return this.currentLocationString;
  }

  public events: RenderEvents = {};

  constructor(container: HTMLElement, scene: THREE.Scene) {
    // 1. Setup Perspective Camera
    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      650
    );

    // 2. Setup WebGL Renderer (High-Performance Industrial Pipeline)
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.appendChild(this.renderer.domElement);

    // 3. Dynamic Exponential Fog & Scene Atmosphere
    this.normalFog = new THREE.FogExp2(RenderSubsystem.dayFogColor.getHex(), 0.0055);
    this.sonarFog = new THREE.Fog(0x021726, 35, 280);

    scene.background = RenderSubsystem.dayFogColor;
    scene.fog = this.normalFog;

    // 4. Setup Lighting
    this.hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x1e293b, 1.35);
    scene.add(this.hemiLight);

    // Day Key Sun Light with high-fidelity shadow cascade configuration
    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 2.65);
    this.sunLight.position.set(55, 60, 30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.bias = -0.00012;
    this.sunLight.shadow.normalBias = 0.045;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 280;
    this.sunLight.shadow.camera.left = -90;
    this.sunLight.shadow.camera.right = 90;
    this.sunLight.shadow.camera.top = 90;
    this.sunLight.shadow.camera.bottom = -90;
    scene.add(this.sunLight);

    // Cool maritime fill light
    this.fillLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    this.fillLight.position.set(-60, 45, -45);
    scene.add(this.fillLight);

    // High-mast floodlights with distance decay falloff
    // South Yard Mast Light
    this.southYardFlood = new THREE.SpotLight(0xffb74d, 2.4, 75, Math.PI / 4, 0.45, 1.8);
    this.southYardFlood.position.set(-20, 24, -15);
    this.southYardFlood.target.position.set(-20, 0, -25);
    this.southYardFlood.castShadow = true;
    this.southYardFlood.shadow.mapSize.width = 1024;
    this.southYardFlood.shadow.mapSize.height = 1024;
    this.southYardFlood.shadow.bias = -0.0002;
    this.southYardFlood.shadow.camera.near = 2;
    this.southYardFlood.shadow.camera.far = 80;
    scene.add(this.southYardFlood, this.southYardFlood.target);

    // Dry Dock Basin Floodlight
    this.dryDockFlood = new THREE.SpotLight(0x93c5fd, 2.8, 90, Math.PI / 4.2, 0.35, 1.7);
    this.dryDockFlood.position.set(25, 42, 25);
    this.dryDockFlood.target.position.set(20, 0, 30);
    this.dryDockFlood.castShadow = true;
    this.dryDockFlood.shadow.mapSize.width = 1024;
    this.dryDockFlood.shadow.mapSize.height = 1024;
    this.dryDockFlood.shadow.bias = -0.0002;
    this.dryDockFlood.shadow.camera.near = 2;
    this.dryDockFlood.shadow.camera.far = 95;
    scene.add(this.dryDockFlood, this.dryDockFlood.target);

    // Heavy Fab & Sub MOF Tower Light
    this.subShopFlood = new THREE.SpotLight(0xffedd5, 2.4, 80, Math.PI / 3.8, 0.4, 1.8);
    this.subShopFlood.position.set(-45, 28, 60);
    this.subShopFlood.target.position.set(-50, 0, 70);
    this.subShopFlood.castShadow = true;
    this.subShopFlood.shadow.mapSize.width = 1024;
    this.subShopFlood.shadow.mapSize.height = 1024;
    this.subShopFlood.shadow.bias = -0.0002;
    this.subShopFlood.shadow.camera.near = 2;
    this.subShopFlood.shadow.camera.far = 85;
    scene.add(this.subShopFlood, this.subShopFlood.target);

    // River Waterfront Luminaire
    this.riverFlood = new THREE.DirectionalLight(0xbae6fd, 1.7);
    this.riverFlood.position.set(50, 30, 0);
    this.riverFlood.target.position.set(120, 0, 0);
    scene.add(this.riverFlood, this.riverFlood.target);

    // Diurnal Celestial & Shift Progression System
    const ambientFallback = new THREE.AmbientLight(0xffffff, 0.4);
    this.ambientLight = ambientFallback;
    scene.add(ambientFallback);
    this.diurnalSystem = new DiurnalSystem(
      scene,
      this.sunLight,
      ambientFallback,
      this.hemiLight,
      [this.southYardFlood, this.dryDockFlood, this.subShopFlood]
    );

    // 5. Impact Sparks Particle System
    this.sparkPositions = new Float32Array(RenderSubsystem.MAX_SPARKS * 3);
    for (let i = 0; i < RenderSubsystem.MAX_SPARKS; i++) {
      this.sparkPositions[i * 3 + 1] = -999;
    }
    this.sparkVelocities = new Float32Array(RenderSubsystem.MAX_SPARKS * 3);
    this.sparkLifetimes = new Float32Array(RenderSubsystem.MAX_SPARKS);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xfbbf24,
      size: 0.35,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    this.sparkPoints = new THREE.Points(sparkGeo, sparkMat);
    this.sparkPoints.frustumCulled = false;
    scene.add(this.sparkPoints);

    // 6. Dynamic Hit Flash Light
    this.hitFlashLight = new THREE.PointLight(0xf59e0b, 0, 10);
    scene.add(this.hitFlashLight);

    // 6B. Expanding Radial Sonar Ripple Ring (0 -> 35m over 1.2s)
    const ringGeo = new THREE.RingGeometry(0.88, 1.0, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.sonarWaveMaterial = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.sonarWaveRing = new THREE.Mesh(ringGeo, this.sonarWaveMaterial);
    this.sonarWaveRing.visible = false;
    this.sonarWaveRing.frustumCulled = false;
    scene.add(this.sonarWaveRing);

    // 7. Initial Camera Placement
    this.currentCameraPos.set(-10.0, 1.6, -24.5);
    this.currentLookAt.set(-10.0, 0.4, -20.0);
    this.camera.position.copy(this.currentCameraPos);
    this.camera.lookAt(this.currentLookAt);

    // 8. Load HDRI Environment
    this.loadHDRI(scene);
  }

  /**
   * Immediately snap camera and look-at target behind Alba without interpolating across the yard
   */
  public snapCameraToTarget(targetPos: THREE.Vector3, catHeading: number): void {
    const headHeight = 0.45;
    this.currentLookAt.set(targetPos.x, targetPos.y + headHeight, targetPos.z);
    this.cameraYaw = 0;
    this.cameraPitch = 0.15;
    const cosPitch = Math.cos(this.cameraPitch);
    const dirX = -Math.sin(catHeading) * cosPitch;
    const dirY = Math.sin(this.cameraPitch);
    const dirZ = -Math.cos(catHeading) * cosPitch;
    const rayDir = RenderSubsystem.scratchRayDir.set(dirX, dirY, dirZ).normalize();
    this.currentCamDist = RenderSubsystem.DEFAULT_CAM_DIST;
    this.currentCameraPos.set(
      this.currentLookAt.x + rayDir.x * this.currentCamDist,
      Math.max(targetPos.y + 0.45, this.currentLookAt.y + rayDir.y * this.currentCamDist),
      this.currentLookAt.z + rayDir.z * this.currentCamDist
    );
    this.camera.position.copy(this.currentCameraPos);
    this.camera.lookAt(this.currentLookAt);
    this.camera.updateMatrixWorld(true);
  }

  private loadHDRI(scene: THREE.Scene): void {
    const hdrLoader = new RGBELoader();
    hdrLoader.load('/environment/evening_sky_1k.hdr', (texture: THREE.DataTexture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      this.hdrSkyTexture = texture;
      scene.environment = texture;
      if (!this.isWhiskersMode) {
        scene.background = texture;
      }
    }, undefined, (err: unknown) => {
      console.warn('HDRI load note:', err);
    });
  }

  /**
   * Set Whiskers Vision Sonar Blueprint mode vs normal maritime sky
   */
  public setWhiskersMode(scene: THREE.Scene, active: boolean, originPos?: THREE.Vector3): void {
    this.isWhiskersMode = active;
    if (active) {
      scene.background = RenderSubsystem.sonarBgColor;
      scene.fog = this.sonarFog;

      this.sonarWaveActive = true;
      this.sonarWaveElapsed = 0;
      this.sonarWaveRing.visible = true;
      if (originPos) {
        this.sonarWaveRing.position.set(originPos.x, originPos.y + 0.12, originPos.z);
      }
      this.sonarWaveRing.scale.set(0.1, 1.0, 0.1);
      this.sonarWaveMaterial.opacity = 0.92;
    } else {
      if (this.hdrSkyTexture) {
        scene.background = this.hdrSkyTexture;
      } else {
        scene.background = this.currentFogColor;
      }
      scene.fog = this.normalFog;
      this.sonarWaveActive = false;
      this.sonarWaveRing.visible = false;
    }

    const reticleEl = document.getElementById('whiskers-sensory-reticle');
    if (reticleEl) {
      reticleEl.classList.toggle('active', active);
    }
  }

  /**
   * Updates expanding 35m radial sonar wave and applies high-contrast thermal
   * emissive signatures to prey (amber), Kingpin (crimson), and mutants (violet).
   */
  public updateWhiskersSonarWave(
    deltaTime: number,
    albaPos: THREE.Vector3,
    preyEntities?: Array<{ mesh: THREE.Object3D; type: 'prey' | 'kingpin' | 'mutant' }>
  ): void {
    if (this.sonarWaveActive) {
      this.sonarWaveElapsed += deltaTime;
      const t = Math.min(1.0, this.sonarWaveElapsed / RenderSubsystem.SONAR_WAVE_DURATION);
      const eased = 1.0 - Math.pow(1.0 - t, 3);
      const radius = Math.max(0.1, eased * RenderSubsystem.SONAR_WAVE_MAX_RADIUS);

      this.sonarWaveRing.position.x = albaPos.x;
      this.sonarWaveRing.position.y = albaPos.y + 0.12;
      this.sonarWaveRing.position.z = albaPos.z;
      this.sonarWaveRing.scale.set(radius, 1.0, radius);
      this.sonarWaveMaterial.opacity = (1.0 - t) * 0.85;

      if (t >= 1.0) {
        this.sonarWaveActive = false;
        this.sonarWaveRing.visible = false;
      }
    }

    if (preyEntities && (this.isWhiskersMode || this.isWhiskersMode !== this.lastPreyWhiskersMode)) {
      this.lastPreyWhiskersMode = this.isWhiskersMode;
      for (let i = 0; i < preyEntities.length; i++) {
        const entity = preyEntities[i];
        const targetColor =
          entity.type === 'kingpin'
            ? RenderSubsystem.THERMAL_COLORS.KINGPIN_CRIMSON
            : entity.type === 'mutant'
            ? RenderSubsystem.THERMAL_COLORS.MUTANT_VIOLET
            : RenderSubsystem.THERMAL_COLORS.PREY_AMBER;

        entity.mesh.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh && mesh.material) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if ('emissive' in mat) {
              if (this.isWhiskersMode) {
                mat.emissive.copy(targetColor);
                mat.emissiveIntensity = entity.type === 'kingpin' ? 0.8 : 1.85;
              } else {
                mat.emissiveIntensity = 0.0;
              }
            }
          }
        });
      }
    }
  }

  /**
   * Trigger vivid impact spark burst & dynamic point light flash
   */
  public triggerImpactFeedback(pos: THREE.Vector3, isHeavy: boolean = false): void {
    this.cameraShakeIntensity = isHeavy ? 0.35 : 0.22;

    const count = isHeavy ? 32 : 18;
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * RenderSubsystem.MAX_SPARKS);
      const pIdx = idx * 3;
      this.sparkPositions[pIdx] = pos.x + (Math.random() - 0.5) * 0.25;
      this.sparkPositions[pIdx + 1] = pos.y + 0.25 + (Math.random() - 0.5) * 0.25;
      this.sparkPositions[pIdx + 2] = pos.z + (Math.random() - 0.5) * 0.25;

      const speed = (isHeavy ? 6.5 : 4.2) * (0.6 + Math.random() * 0.8);
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.25) * Math.PI;
      this.sparkVelocities[pIdx] = Math.cos(theta) * Math.cos(phi) * speed;
      this.sparkVelocities[pIdx + 1] = Math.sin(phi) * speed + 2.2;
      this.sparkVelocities[pIdx + 2] = Math.sin(theta) * Math.cos(phi) * speed;

      this.sparkLifetimes[idx] = 0.28 + Math.random() * 0.22;
    }
    (this.sparkPoints.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    this.hitFlashLight.position.copy(pos);
    this.hitFlashLight.position.y += 0.35;
    this.hitFlashLight.intensity = isHeavy ? 6.0 : 3.8;
  }

  /**
   * Update spark particle kinematics & hit flash attenuation
   */
  public updateParticles(deltaTime: number): void {
    if (this.sparkPoints) {
      let activeSparks = false;
      const posAttr = this.sparkPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < RenderSubsystem.MAX_SPARKS; i++) {
        if (this.sparkLifetimes[i] > 0) {
          this.sparkLifetimes[i] -= deltaTime;
          const pIdx = i * 3;
          this.sparkPositions[pIdx] += this.sparkVelocities[pIdx] * deltaTime;
          this.sparkPositions[pIdx + 1] += this.sparkVelocities[pIdx + 1] * deltaTime;
          this.sparkPositions[pIdx + 2] += this.sparkVelocities[pIdx + 2] * deltaTime;
          this.sparkVelocities[pIdx + 1] -= 12.0 * deltaTime; // Gravity
          activeSparks = true;
        } else {
          const pIdx = i * 3;
          if (this.sparkPositions[pIdx + 1] !== -999) {
            this.sparkPositions[pIdx + 1] = -999;
            activeSparks = true;
          }
        }
      }
      if (activeSparks) posAttr.needsUpdate = true;
    }

    if (this.hitFlashLight.intensity > 0) {
      this.hitFlashLight.intensity = Math.max(0, this.hitFlashLight.intensity - deltaTime * 28.0);
    }
  }

  /**
   * Spring-Arm Camera Update with obstacle collision avoidance, indoor/outdoor clamping,
   * camera shake, and exponential decay smoothing.
   */
  public updateCamera(
    deltaTime: number,
    targetPos: THREE.Vector3,
    catHeading: number,
    isFreeLooking: boolean = false,
    obstacleRaycastFn?: (origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) => number | null
  ): void {
    if (this.currentLookAt.lengthSq() < 0.001) {
      this.snapCameraToTarget(targetPos, catHeading);
    }

    if (!isFreeLooking) {
      const yawDecay = 1.0 - Math.exp(-4.5 * deltaTime);
      this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, 0, yawDecay);
    }

    // Facility boundary recognition
    const isInsideMachineShop = targetPos.x >= -56 && targetPos.x <= -34 && targetPos.z >= -38 && targetPos.z <= -2;
    const isInsideMotel = targetPos.x >= -62 && targetPos.x <= -48 && targetPos.z >= -71 && targetPos.z <= -59;
    const isInsideSteelSuperShop = targetPos.x >= -145 && targetPos.x <= -85 && targetPos.z >= 185 && targetPos.z <= 295;
    const isIndoors = isInsideMachineShop || isInsideMotel || isInsideSteelSuperShop;

    let currentLocation = 'Shipyard Grounds (South Yard)';
    if (isInsideMachineShop) {
      currentLocation = 'Machine Shop No. 1 (Mezzanine Catwalk)';
    } else if (isInsideMotel) {
      currentLocation = 'Cat Motel Hub Sanctuary';
    } else if (isInsideSteelSuperShop) {
      currentLocation = 'Heavy Steel Fabrication Super-Shop';
    } else if (targetPos.x >= 15 && targetPos.x <= 40 && targetPos.z >= -45 && targetPos.z <= -5) {
      currentLocation = 'Historic Dry Dock 1 (Basin)';
    } else if (targetPos.x >= -205 && targetPos.x <= -155 && targetPos.z >= 35 && targetPos.z <= 185) {
      currentLocation = 'Dry Dock 2 (Virginia Submarine Berth)';
    } else if (targetPos.x >= 0 && targetPos.x <= 45 && targetPos.z >= 10 && targetPos.z <= 60) {
      currentLocation = 'Dry Dock 12 (Big Blue Gantry Apron)';
    } else if (targetPos.x <= -15 && targetPos.z >= 20) {
      currentLocation = 'Submarine MOF (Modular Outfitting)';
    } else if (targetPos.x >= 35 && targetPos.z >= -10 && targetPos.z <= 40) {
      currentLocation = 'East Pier Boardwalk & James River';
    } else if (targetPos.x >= 30 && targetPos.z <= -45) {
      currentLocation = 'RCOH Nuclear Overhaul Vault';
    }

    this.currentLocationString = currentLocation;

    const now = performance.now();
    if (currentLocation !== this.lastLocationName) {
      if (now - this.lastLocationNotificationTime >= 4000) {
        this.lastLocationName = currentLocation;
        this.lastLocationNotificationTime = now;
        this.events.onLocationChange?.(currentLocation, isIndoors);
      }
    }

    const headHeight = isIndoors ? 0.35 : 0.45;
    const rawLookTarget = RenderSubsystem.scratchLookAt.set(
      targetPos.x,
      targetPos.y + headHeight,
      targetPos.z
    );

    const maxDesiredDist = isIndoors ? 1.8 : RenderSubsystem.DEFAULT_CAM_DIST;
    const totalHeading = catHeading + this.cameraYaw;
    const cosPitch = Math.cos(this.cameraPitch);
    const dirX = -Math.sin(totalHeading) * cosPitch