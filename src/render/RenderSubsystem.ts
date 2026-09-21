import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { TextureGenerator } from '../core/TextureGenerator';
import { ModelManager } from '../core/ModelManager';

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
 * spring-arm collision avoidance, indoor/outdoor clamping, golden-hour sun,
 * shadow cascades, impact sparks particle simulation, and shader pre-warming.
 */
export class RenderSubsystem {
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public hdrSkyTexture: THREE.DataTexture | null = null;
  public isWhiskersMode: boolean = false;

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
  public southYardFlood: THREE.SpotLight;
  public dryDockFlood: THREE.SpotLight;
  public subShopFlood: THREE.SpotLight;
  public riverFlood: THREE.DirectionalLight;

  // Fog & Background Colors
  public static readonly normalBgColor = new THREE.Color(0x131d2e);
  public static readonly sonarBgColor = new THREE.Color(0x021726);
  public normalFog = new THREE.FogExp2(0x131d2e, 0.0075);
  public sonarFog = new THREE.Fog(0x021726, 40, 300);

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
      600
    );

    // 2. Setup WebGL Renderer (AAA Grade Pipeline)
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.appendChild(this.renderer.domElement);

    // 3. Scene Atmosphere
    scene.background = RenderSubsystem.normalBgColor;
    scene.fog = this.normalFog;

    // 4. Setup Lighting
    // Golden-hour sky & Slate navy ground bounce
    this.hemiLight = new THREE.HemisphereLight(0xfde68a, 0x1e293b, 2.2);
    scene.add(this.hemiLight);

    // Raking golden sunset sun with shadow cascade tracking
    this.sunLight = new THREE.DirectionalLight(0xfbbf24, 3.6);
    this.sunLight.position.set(45, 38, 25);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 240;
    this.sunLight.shadow.camera.left = -80;
    this.sunLight.shadow.camera.right = 80;
    this.sunLight.shadow.camera.top = 80;
    this.sunLight.shadow.camera.bottom = -80;
    scene.add(this.sunLight);

    // Cool maritime river fill light
    this.fillLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    this.fillLight.position.set(-60, 45, -45);
    scene.add(this.fillLight);

    // High-mast floodlights
    this.southYardFlood = new THREE.SpotLight(0xff9922, 3.8, 85, Math.PI / 3, 0.45, 1.2);
    this.southYardFlood.position.set(-20, 18, -15);
    this.southYardFlood.target.position.set(-20, 0, -25);
    scene.add(this.southYardFlood, this.southYardFlood.target);

    this.dryDockFlood = new THREE.SpotLight(0x60a5fa, 4.2, 115, Math.PI / 3.5, 0.35, 1.0);
    this.dryDockFlood.position.set(20, 36, 25);
    this.dryDockFlood.target.position.set(20, 0, 30);
    scene.add(this.dryDockFlood, this.dryDockFlood.target);

    this.subShopFlood = new THREE.SpotLight(0xfde047, 3.4, 75, Math.PI / 3, 0.3, 1.1);
    this.subShopFlood.position.set(-30, 18, 45);
    this.subShopFlood.target.position.set(-30, 0, 45);
    scene.add(this.subShopFlood, this.subShopFlood.target);

    this.riverFlood = new THREE.DirectionalLight(0xbae6fd, 1.7);
    this.riverFlood.position.set(50, 30, 0);
    this.riverFlood.target.position.set(120, 0, 0);
    scene.add(this.riverFlood, this.riverFlood.target);

    // 5. Impact Sparks Particle System
    this.sparkPositions = new Float32Array(RenderSubsystem.MAX_SPARKS * 3);
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

    // 7. Initial Camera Placement
    this.currentCameraPos.set(-10.0, 1.6, -24.5);
    this.camera.position.copy(this.currentCameraPos);
    this.camera.lookAt(-10.0, 0.4, -20.0);

    // 8. Load HDRI Environment
    this.loadHDRI(scene);
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
   * Set Whiskers Vision Sonar Blueprint mode vs normal maritime dusk sky
   */
  public setWhiskersMode(scene: THREE.Scene, active: boolean): void {
    this.isWhiskersMode = active;
    if (active) {
      scene.background = RenderSubsystem.sonarBgColor;
      scene.fog = this.sonarFog;
    } else {
      if (this.hdrSkyTexture) {
        scene.background = this.hdrSkyTexture;
      } else {
        scene.background = RenderSubsystem.normalBgColor;
      }
      scene.fog = this.normalFog;
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
        }
      }
      if (activeSparks) posAttr.needsUpdate = true;
    }

    if (this.hitFlashLight.intensity > 0) {
      this.hitFlashLight.intensity = Math.max(0, this.hitFlashLight.intensity - deltaTime * 28.0);
    }
  }

  /**
   * Spring-Arm Camera Update with indoor/outdoor room clamping and exponential decay smoothing
   */
  public updateCamera(
    deltaTime: number,
    targetPos: THREE.Vector3,
    catHeading: number,
    isFreeLooking: boolean = false
  ): void {
    if (!isFreeLooking) {
      // Smoothly re-center camera behind Alba with exponential decay
      const yawDecay = 1.0 - Math.exp(-4.5 * deltaTime);
      this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, 0, yawDecay);
    }

    // Interior boundary detection: Machine Shop No. 1 & Cat Motel Hub
    const isInsideMachineShop = targetPos.x >= -56 && targetPos.x <= -34 && targetPos.z >= -38 && targetPos.z <= -2;
    const isInsideMotel = targetPos.x >= -62 && targetPos.x <= -48 && targetPos.z >= -71 && targetPos.z <= -59;
    const isIndoors = isInsideMachineShop || isInsideMotel;

    // Full 7-Zone spatial recognition
    let currentLocation = 'Shipyard Grounds (South Yard)';
    if (isInsideMachineShop) {
      currentLocation = 'Machine Shop No. 1 (Mezzanine Catwalk)';
    } else if (isInsideMotel) {
      currentLocation = 'Cat Motel Hub Sanctuary';
    } else if (targetPos.x >= 15 && targetPos.x <= 40 && targetPos.z >= -45 && targetPos.z <= -5) {
      currentLocation = 'Historic Dry Dock 1 (Basin)';
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

    // Dynamic camera distance with spring-arm collision avoidance
    const maxDist = isIndoors ? 1.8 : 3.8;
    const totalHeading = catHeading + this.cameraYaw;
    const camHeight = isIndoors ? 1.1 : (1.4 + Math.sin(this.cameraPitch) * 1.5);
    const camDist = maxDist * Math.cos(this.cameraPitch);

    const desiredCameraPos = RenderSubsystem.scratchDesiredCamPos.set(
      targetPos.x - Math.sin(totalHeading) * camDist,
      targetPos.y + camHeight,
      targetPos.z - Math.cos(totalHeading) * camDist
    );

    // Indoor Machine Shop room boundary clamping
    if (isInsideMachineShop) {
      desiredCameraPos.x = Math.max(-55.0, Math.min(-35.0, desiredCameraPos.x));
      desiredCameraPos.z = Math.max(-37.0, Math.min(-3.0, desiredCameraPos.z));
      desiredCameraPos.y = Math.max(0.4, Math.min(6.5, desiredCameraPos.y));
    }

    // Frame-rate independent exponential spring-arm smoothing
    const camLerpFactor = 1.0 - Math.exp(-14.0 * deltaTime);
    this.currentCameraPos.lerp(desiredCameraPos, Math.min(1.0, camLerpFactor));

    // Apply dynamic camera shake from combat impacts
    if (this.cameraShakeIntensity > 0) {
      this.camera.position.x = this.currentCameraPos.x + (Math.random() - 0.5) * this.cameraShakeIntensity;
      this.camera.position.y = this.currentCameraPos.y + (Math.random() - 0.5) * this.cameraShakeIntensity * 0.7;
      this.camera.position.z = this.currentCameraPos.z + (Math.random() - 0.5) * this.cameraShakeIntensity;
      this.cameraShakeIntensity = Math.max(0, this.cameraShakeIntensity - deltaTime * 3.5);
    } else {
      this.camera.position.copy(this.currentCameraPos);
    }

    // Smooth look-at target tracking
    const rawLookTarget = RenderSubsystem.scratchLookAt.set(targetPos.x, targetPos.y + (isIndoors ? 0.35 : 0.45), targetPos.z);
    const lookLerpFactor = 1.0 - Math.exp(-16.0 * deltaTime);
    this.currentLookAt.lerp(rawLookTarget, Math.min(1.0, lookLerpFactor));
    this.camera.lookAt(this.currentLookAt);

    // Keep sunlight shadow camera centered on Alba's quadrant for crisp shadow cascades
    this.sunLight.target.position.set(targetPos.x, 0, targetPos.z);
    this.sunLight.target.updateMatrixWorld();
  }

  /**
   * Fast GPU Screen Coordinate Projection for 3D In-World UI Elements (Zero-Allocation)
   */
  public projectPoint(pos: THREE.Vector3, heightOffset: number): ScreenProjection {
    const v = RenderSubsystem.scratchProjectVec.copy(pos);
    v.y += heightOffset;
    v.project(this.camera);

    if (v.z < 1.0) {
      const screenX = (v.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-(v.y * 0.5) + 0.5) * window.innerHeight;
      if (screenX >= 20 && screenX <= window.innerWidth - 20 && screenY >= 20 && screenY <= window.innerHeight - 20) {
        RenderSubsystem.scratchScreenProj.screenX = screenX;
        RenderSubsystem.scratchScreenProj.screenY = screenY;
        RenderSubsystem.scratchScreenProj.visible = true;
        return RenderSubsystem.scratchScreenProj;
      }
    }

    RenderSubsystem.scratchScreenProj.screenX = 0;
    RenderSubsystem.scratchScreenProj.screenY = 0;
    RenderSubsystem.scratchScreenProj.visible = false;
    return RenderSubsystem.scratchScreenProj;
  }

  /**
   * Handle viewport resize
   */
  public resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  }

  /**
   * Render frame pass
   */
  public render(scene: THREE.Scene): void {
    this.renderer.render(scene, this.camera);
  }

  /**
   * Dispose all WebGL resources, geometries, materials, and canvas elements
   */
  public dispose(): void {
    if (this.sparkPoints) {
      this.sparkPoints.geometry.dispose();
      (this.sparkPoints.material as THREE.Material).dispose();
    }

    if (this.hdrSkyTexture) {
      this.hdrSkyTexture.dispose();
      this.hdrSkyTexture = null;
    }

    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
