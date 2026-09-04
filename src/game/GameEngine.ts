import { TextureGenerator } from '../core/TextureGenerator';
import { ModelManager } from '../core/ModelManager';
import { EngineFlightRecorder, FreezeIncident } from '../core/EngineFlightRecorder';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Timer } from 'three/examples/jsm/misc/Timer.js';
import { CatCharacter } from './CatCharacter';
import { ShipyardEnvironment } from './ShipyardEnvironment';
import { RatEntity } from './RatEntity';
import { CatVitals } from '../core/VitalsSystem';
import { RadiationSystem } from '../core/RadiationSystem';
import { AssistanceEngine, ShipbuildingAssistEvent } from '../core/AssistanceEngine';
import { MissionManager } from '../core/MissionManager';
import { ProgressionSystem } from '../core/ProgressionSystem';
import { ColonyCatEntity } from './ColonyCatEntity';
import { MutantCatEntity } from './MutantCatEntity';
import { ShipbuilderEntity } from './ShipbuilderEntity';
import { soundEngine } from '../core/SoundEngine';
import { TouchController } from '../core/TouchController';
import { MinimapSystem, MinimapEntity } from '../core/MinimapSystem';
import { PounceTrajectoryVisualizer } from '../graphics/PounceTrajectoryVisualizer';

export interface ContextualPrompt {
  id: string;
  type: 'TALK' | 'EAT' | 'POUNCE';
  title: string;
  subtitle?: string;
  keyText: string;
  screenX: number;
  screenY: number;
  distanceMeters: number;
  visible: boolean;
}

export interface PounceTargetCandidate {
  targetPos: THREE.Vector3;
  entity: RatEntity | MutantCatEntity;
  type: 'RAT' | 'MUTANT';
  name: string;
  dist: number;
}

export class GameEngine {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  
  public cat: CatCharacter;
  public environment: ShipyardEnvironment;
  public trajectoryVisualizer: PounceTrajectoryVisualizer;
  public rats: RatEntity[] = [];
  public colonyNPCs: ColonyCatEntity[] = [];
  public shipbuilders: ShipbuilderEntity[] = [];
  public mutantCats: MutantCatEntity[] = [];
  public vitals: CatVitals;
  public radiationSystem: RadiationSystem;
  public assistanceEngine: AssistanceEngine;
  public missionManager: MissionManager;
  public progression: ProgressionSystem;
  public touchController: TouchController;
  public minimapSystem: MinimapSystem;
  public flightRecorder: EngineFlightRecorder;
  public onFreezeDetected?: (incident: FreezeIncident) => void;
  public isDisposed: boolean = false;

  private keys: { [key: string]: boolean } = {};
  private lastForwardKeyDownTime: number = 0;
  private isDoubleTapSprint: boolean = false;
  private isSneakToggle: boolean = false;
  private comboStep: number = 0;
  private lastAttackTime: number = 0;
  private waterLevel: number = 0.05;
  private isFloodingActive: boolean = false;

  private timer: Timer;
  private cameraOffset: THREE.Vector3 = new THREE.Vector3(0, 1.8, -4.5);
  private currentCameraPos: THREE.Vector3 = new THREE.Vector3();
  private currentLookAt: THREE.Vector3 = new THREE.Vector3();
  private catVelocity: THREE.Vector3 = new THREE.Vector3();
  public isGrounded: boolean = true;
  private isWhiskersMode: boolean = false;
  private hdrSkyTexture: THREE.DataTexture | null = null;
  private pounceTarget: THREE.Vector3 | null = null;
  private isPouncing: boolean = false;
  private pounceTimer: number = 0;
  private catHeading: number = 0;
  private cameraYaw: number = 0;
  private cameraPitch: number = 0.15;
  private turnVelocity: number = 0;
  public currentCatSpeed: number = 0;
  public catBankAngle: number = 0;
  public hitStopTimer: number = 0;
  public cameraShakeIntensity: number = 0;

  // Impact Sparks Particle System & Hit Flash Light
  private sparkPoints: THREE.Points;
  private sparkPositions: Float32Array;
  private sparkVelocities: Float32Array;
  private sparkLifetimes: Float32Array;
  private static readonly MAX_SPARKS = 80;
  private hitFlashLight: THREE.PointLight;

  private isDraggingMouse: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private lastLocationName: string = '';
  private lastLocationNotificationTime: number = -4000;

  // Bound window event listener references for complete teardown
  private onKeyDownBound?: (e: KeyboardEvent) => void;
  private onKeyUpBound?: (e: KeyboardEvent) => void;
  private onMouseDownBound?: (e: MouseEvent) => void;
  private onMouseMoveBound?: (e: MouseEvent) => void;
  private onMouseUpBound?: () => void;
  private onContextMenuBound?: (e: MouseEvent) => void;
  private onResizeBound?: () => void;
  private animationFrameId: number | null = null;

  // Fixed Timestep 60Hz Physics Sub-stepping & Motion Interpolation System
  public static readonly FIXED_TIMESTEP: number = 1 / 60; // 60Hz physics sub-step (16.667ms)
  private static readonly MAX_PHYSICS_SUBSTEPS: number = 5; // Guard against spiral-of-death
  private static readonly MAX_FRAME_DELTA: number = 0.1; // Max 100ms delta clamp
  private physicsAccumulator: number = 0;
  private physicsCatPosition: THREE.Vector3 = new THREE.Vector3();
  private prevPhysicsPosition: THREE.Vector3 = new THREE.Vector3();
  private physicsCatHeading: number = 0;
  private prevPhysicsHeading: number = 0;
  private physicsCatBankAngle: number = 0;
  private prevPhysicsBankAngle: number = 0;

  // Static Preallocated Scratch Objects (Zero GC in Hot Animation / Physics Loop)
  private static readonly scratchForward = new THREE.Vector3();
  private static readonly scratchPounce = new THREE.Vector3();
  private static readonly scratchPrevPos = new THREE.Vector3();
  private static readonly scratchNewPos = new THREE.Vector3();
  private static readonly scratchAirPos = new THREE.Vector3();
  private static readonly scratchTotalVelocity = new THREE.Vector3();
  private static readonly scratchTargetPos = new THREE.Vector3();
  private static readonly scratchDesiredCamPos = new THREE.Vector3();
  private static readonly scratchLookAt = new THREE.Vector3();
  private static readonly scratchPushDir = new THREE.Vector3();
  private static readonly scratchRatPrevPos = new THREE.Vector3();
  private static readonly scratchProjectVec = new THREE.Vector3();
  private static readonly scratchScreenProj = { screenX: 0, screenY: 0, visible: false };
  private static readonly DOROTHY_PROXIMITY_TARGET = new THREE.Vector3(-20, 2, -25);
  private static readonly CAT_MOTEL_PROXIMITY_TARGET = new THREE.Vector3(-55, 0, -65);
  private static readonly SUB_TARGET_POS = new THREE.Vector3(-30, 0, 45);
  private static readonly SCRAP_TARGET_POS = new THREE.Vector3(38, 0, -52);
  private static readonly VAULT_TARGET_POS = new THREE.Vector3(45, 0, -60);
  private static readonly waypointScratch = new THREE.Vector3();
  private static readonly bestPounceCandidate: PounceTargetCandidate = {
    targetPos: new THREE.Vector3(),
    entity: null as any,
    type: 'RAT',
    name: '',
    dist: 0
  };

  // Persistent Fog & Background Colors
  private static readonly normalBgColor = new THREE.Color(0x131d2e);
  private static readonly sonarBgColor = new THREE.Color(0x021726);
  private normalFog = new THREE.FogExp2(0x131d2e, 0.0075);
  private sonarFog = new THREE.Fog(0x021726, 40, 300);

  // Reusable Minimap Pool to Eliminate Allocation Spikes
  private minimapEntityPool: MinimapEntity[] = [];
  private contextualPromptsPool: ContextualPrompt[] = [];
  private activePromptsList: ContextualPrompt[] = [];

  // Event callbacks for UI
  public onVitalsUpdate?: (vitals: CatVitals, radiation: number) => void;
  public onAssistanceTriggered?: (event: ShipbuildingAssistEvent) => void;
  public onMissionObjectiveUpdated?: () => void;
  public onNotification?: (title: string, message: string, type: 'info' | 'success' | 'warn') => void;
  public onContextualPromptsUpdate?: (prompts: ContextualPrompt[]) => void;
  public onFrameUpdate?: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.timer = new Timer();

    // 1. Initialize Subsystems & Preload 3D Assets
    ModelManager.preloadAll();
    this.vitals = new CatVitals();
    this.radiationSystem = new RadiationSystem();
    this.assistanceEngine = new AssistanceEngine();
    this.missionManager = new MissionManager();
    this.progression = new ProgressionSystem();
    this.touchController = new TouchController();
    this.minimapSystem = new MinimapSystem();
    this.flightRecorder = new EngineFlightRecorder((incident) => {
      this.onFreezeDetected?.(incident);
    });
    soundEngine.onAudioEvent = (evt) => {
      this.flightRecorder.logAudioEvent(evt);
    };

    // 2. Initialize Three.js Scene & Renderer (Video Game AAA Grade Pipeline)
    this.scene = new THREE.Scene();
    this.scene.background = GameEngine.normalBgColor; // Rich twilight dusk
    this.scene.fog = this.normalFog; // Atmospheric volumetric industrial haze

    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      600
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true; // Auto-update shadow map continuously to eliminate pipeline sync stalls
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.container.appendChild(this.renderer.domElement);

    // Load Industrial HDRI Skybox with RGBELoader for Image-Based Lighting (IBL)
    const hdrLoader = new RGBELoader();
    hdrLoader.load('/environment/evening_sky_1k.hdr', (texture: THREE.DataTexture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      this.hdrSkyTexture = texture;
      this.scene.environment = texture;
      if (!this.isWhiskersMode) {
        this.scene.background = texture;
      }
    }, undefined, (err: unknown) => {
      console.warn('HDRI load note:', err);
    });

    // 3. Setup Lighting
    this.setupLighting();

    // 4. Build Environment & Characters
    this.environment = new ShipyardEnvironment();
    this.scene.add(this.environment.group);

    this.trajectoryVisualizer = new PounceTrajectoryVisualizer();
    this.scene.add(this.trajectoryVisualizer.group);

    this.cat = new CatCharacter();
    this.cat.mesh.position.set(-10.0, 0, -20.0); // Start in open South Yard courtyard looking toward Dorothy
    this.physicsCatPosition.copy(this.cat.mesh.position);
    this.prevPhysicsPosition.copy(this.cat.mesh.position);
    this.physicsCatHeading = 0;
    this.prevPhysicsHeading = 0;
    this.physicsCatBankAngle = 0;
    this.prevPhysicsBankAngle = 0;
    this.catHeading = 0;
    this.catBankAngle = 0;
    this.cat.mesh.rotation.set(0, 0, 0);
    
    // Alba's Feline Vision / Personal Worksite Light
    const catAuraLight = new THREE.PointLight(0xffedd5, 2.2, 25);
    catAuraLight.position.set(0, 1.5, 0);
    this.cat.mesh.add(catAuraLight);

    this.scene.add(this.cat.mesh);

    // Setup Impact Sparks Particle System
    this.sparkPositions = new Float32Array(GameEngine.MAX_SPARKS * 3);
    this.sparkVelocities = new Float32Array(GameEngine.MAX_SPARKS * 3);
    this.sparkLifetimes = new Float32Array(GameEngine.MAX_SPARKS);
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
    this.scene.add(this.sparkPoints);

    // Dynamic Hit Flash Light
    this.hitFlashLight = new THREE.PointLight(0xf59e0b, 0, 10);
    this.scene.add(this.hitFlashLight);

    // Initialize Camera Position immediately behind Alba looking toward Dorothy
    this.currentCameraPos.set(-10.0, 1.6, -24.5);
    this.camera.position.copy(this.currentCameraPos);
    this.camera.lookAt(-10.0, 0.4, -20.0);

    // 5. Spawn Entities: Rats, Colony NPCs, and Mutant Cats
    this.spawnRats();
    this.spawnColonyNPCs();
    this.spawnShipbuilders();
    this.spawnMutantCats();

    // 6. Pre-Warm All Shaders & Compile Scene Graph Ahead of Time
    if (this.renderer && typeof this.renderer.compile === 'function') {
      this.renderer.compile(this.scene, this.camera);
    }

    // 7. Connect Event Listeners
    this.setupInput();
    this.setupAssistanceListeners();
    this.onResizeBound = this.onResize.bind(this);
    window.addEventListener('resize', this.onResizeBound);

    // 8. Bind Loop
    this.animate = this.animate.bind(this);
  }

  public startLoop(): void {
    if (!this.animationFrameId && !this.isDisposed) {
      this.lastFrameTimestamp = 0;
      this.animationFrameId = requestAnimationFrame(this.animate);
    }
  }

  /**
   * Pre-loads all 3D assets, uploads all PBR textures, initializes HDR lighting,
   * compiles the WebGL scene graph, and executes warmup offscreen render passes.
   * Completely eliminates mid-gameplay WebGL pipeline shader compilation freezes.
   */
  public async initPipeline(onProgress?: (pct: number, stage: string) => void): Promise<void> {
    onProgress?.(20, 'Loading 3D Cat & Vermin Skeletal Assets...');
    // 1. Await 3D GLTF models and all character entity instances to attach
    await ModelManager.preloadAll();
    await Promise.all([
      this.cat.readyPromise,
      ...this.rats.map((r) => r.readyPromise),
      ...this.mutantCats.map((m) => m.readyPromise),
      ...this.colonyNPCs.map((c) => c.readyPromise)
    ]);

    onProgress?.(45, 'Pre-generating PBR Normal Maps & Uploading to GPU VRAM...');
    // 2. Preload & GPU upload all procedural textures
    TextureGenerator.preloadAll(this.renderer);

    onProgress?.(70, 'Loading Industrial HDRI Environment & Skybox...');
    // 3. Load HDRI skybox and apply to scene before compiling shaders
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      try {
        const hdrTexture = await new Promise<THREE.DataTexture>((resolve, reject) => {
          new RGBELoader().load(
            '/environment/evening_sky_1k.hdr',
            (tex) => resolve(tex),
            undefined,
            (err) => reject(err)
          );
        });
        hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
        this.hdrSkyTexture = hdrTexture;
        this.scene.environment = hdrTexture;
        if (!this.isWhiskersMode) {
          this.scene.background = hdrTexture;
        }
      } catch (err) {
        console.warn('HDRI load note:', err);
      }
    }

    onProgress?.(90, 'Pre-Warming GPU Shader Pipeline & Linking Driver Programs...');
    // Eagerly prewarm and link all character skeletal animation clips ahead of gameplay
    this.cat.prewarmAnimations();
    this.rats.forEach((r) => r.prewarmAnimations());
    this.mutantCats.forEach((m) => m.prewarmAnimations());

    // Temporarily bypass frustum culling on all objects so Three.js compiles EVERY mesh shader
    const originalCullingStates = new Map<THREE.Object3D, boolean>();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        originalCullingStates.set(obj, obj.frustumCulled);
        obj.frustumCulled = false;
      }
    });

    const originalFov = this.camera.fov;
    this.camera.fov = 120;
    this.camera.updateProjectionMatrix();

    // Flash hit light on so point light shadow/PBR shader variations are compiled
    this.hitFlashLight.intensity = 5.0;

    // Compile entire scene graph with active HDR environment
    if (this.renderer && typeof this.renderer.compile === 'function') {
      this.renderer.compile(this.scene, this.camera);
    }

    // 5. Run Warmup Render Passes across all 7 major shipyard zones and 360-degree orientations
    try {
      const tempCamPos = this.camera.position.clone();
      const zonePositions = [
        new THREE.Vector3(-10, 2, -20),  // South Yard & Dorothy Tugboat
        new THREE.Vector3(-45, 2, -30),  // Machine Shop Interior & Mezzanine
        new THREE.Vector3(25, 2, -25),   // Historic Dry Dock 1 & Sunken Basin
        new THREE.Vector3(20, 15, 35),   // Big Blue Gantry & Dry Dock 12
        new THREE.Vector3(-30, 2, 45),   // Submarine MOF Outfitting
        new THREE.Vector3(52, 2, 10),    // East Pier Boardwalk & James River
        new THREE.Vector3(45, 2, -60)    // RCOH Radiation Vault
      ];

      for (const zonePos of zonePositions) {
        this.camera.position.copy(zonePos);
        const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
        for (const ang of angles) {
          this.camera.lookAt(zonePos.x + Math.sin(ang) * 20, zonePos.y, zonePos.z + Math.cos(ang) * 20);
          this.renderer.render(this.scene, this.camera);
        }
      }

      // Warmup Sonar Whiskers Blueprint Shader variant across all zones
      this.scene.background = GameEngine.sonarBgColor;
      this.scene.fog = this.sonarFog;
      if (typeof this.renderer.compile === 'function') {
        this.renderer.compile(this.scene, this.camera);
      }
      this.renderer.render(this.scene, this.camera);

      // Restore normal environment & camera to Alba
      if (this.hdrSkyTexture) {
        this.scene.background = this.hdrSkyTexture;
      } else {
        this.scene.background = GameEngine.normalBgColor;
      }
      this.scene.fog = this.normalFog;
      this.hitFlashLight.intensity = 0.0;
      this.camera.fov = originalFov;
      this.camera.updateProjectionMatrix();

      // Restore original frustum culling states
      this.scene.traverse((obj) => {
        const orig = originalCullingStates.get(obj);
        if (orig !== undefined) {
          obj.frustumCulled = orig;
        }
      });

      this.camera.position.copy(tempCamPos);
      this.camera.lookAt(this.physicsCatPosition.x, this.physicsCatPosition.y + 0.4, this.physicsCatPosition.z);
    } catch (e) {
      console.warn('Pre-warm render note:', e);
    }

    onProgress?.(100, 'Ready to Patrol the Yard!');
  }

  private setupLighting() {
    // 1. Warm Golden-Hour Maritime Dusk Sky & Deep Slate Navy Ground Bounce
    const hemiLight = new THREE.HemisphereLight(0xfde68a, 0x1e293b, 2.2);
    this.scene.add(hemiLight);

    // 2. Warm Sunset Sun Light (Raking 25° Horizon Angle)
    const sunLight = new THREE.DirectionalLight(0xfbbf24, 3.6);
    sunLight.position.set(45, 38, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 240;
    sunLight.shadow.camera.left = -80;
    sunLight.shadow.camera.right = 80;
    sunLight.shadow.camera.top = 80;
    sunLight.shadow.camera.bottom = -80;
    this.scene.add(sunLight);

    // 3. Cool Maritime River Horizon Fill Light
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    fillLight.position.set(-60, 45, -45);
    this.scene.add(fillLight);

    // 4. High-Mast Warm Sodium Staging Floodlights (2200K / 0xff9922)
    const southYardFlood = new THREE.SpotLight(0xff9922, 3.8, 85, Math.PI / 3, 0.45, 1.2);
    southYardFlood.position.set(-20, 18, -15);
    southYardFlood.target.position.set(-20, 0, -25);
    this.scene.add(southYardFlood, southYardFlood.target);

    // 5. Big Blue Gantry Dry Dock Cold Mercury Vapor High-Mast Lights (6500K / 0x60a5fa)
    const dryDockFlood = new THREE.SpotLight(0x60a5fa, 4.2, 115, Math.PI / 3.5, 0.35, 1.0);
    dryDockFlood.position.set(20, 36, 25);
    dryDockFlood.target.position.set(20, 0, 30);
    this.scene.add(dryDockFlood, dryDockFlood.target);

    // 6. Submarine MOF Fabrication Floodlight (Warm Halogen 3000K / 0xfde047)
    const subShopFlood = new THREE.SpotLight(0xfde047, 3.4, 75, Math.PI / 3, 0.3, 1.1);
    subShopFlood.position.set(-30, 18, 45);
    subShopFlood.target.position.set(-30, 0, 45);
    this.scene.add(subShopFlood, subShopFlood.target);

    // 7. James River Waterfront Pier Illuminator (Atmospheric Coastal Blue)
    const riverFlood = new THREE.DirectionalLight(0xbae6fd, 1.7);
    riverFlood.position.set(50, 30, 0);
    riverFlood.target.position.set(120, 0, 0);
    this.scene.add(riverFlood, riverFlood.target);
  }

  private spawnRats() {
    const positions = [
      new THREE.Vector3(-25, 0, -15),
      new THREE.Vector3(-35, 0, -5),
      new THREE.Vector3(-10, 0, 10),
      new THREE.Vector3(5, 0, -20),
      new THREE.Vector3(-28, 0, 35)
    ];

    positions.forEach(pos => {
      const rat = new RatEntity(pos, false);
      this.rats.push(rat);
      this.scene.add(rat.mesh);
      this.scene.add(rat.scentTrailParticles);
    });

    // Dockyard Kingpin resides inside dedicated perpendicular sunken Historic Dry Dock 1 (X: 28, Y: -2.0, Z: -27.5)
    const kingpin = new RatEntity(new THREE.Vector3(28, -2.0, -27.5), true);
    this.rats.push(kingpin);
    this.scene.add(kingpin.mesh);
    this.scene.add(kingpin.scentTrailParticles);
  }

  private spawnColonyNPCs() {
    // 1. Dr. Elena Vance (EH&S Animal Management Specialist)
    const elenaDialogue = [
      {
        speaker: 'Dr. Elena Vance',
        role: 'EH&S Animal Management',
        text: "Good morning, Alba! Here's a clean tuna ration and some fresh water. Stay away from the lead-containment tents!",
        actionReward: { type: 'HEAL' as const, amount: 100 }
      },
      {
        speaker: 'Dr. Elena Vance',
        role: 'EH&S Animal Management',
        text: "Let me check your collar dosimeter... looks clear. Keep up the good work keeping the shipyard pest-free.",
        actionReward: { type: 'CLEANSE' as const, amount: 0 }
      }
    ];
    const elena = new ColonyCatEntity('Dr. Elena Vance', 'EH&S Specialist', new THREE.Vector3(-50, 0, -56), 0xffffff, elenaDialogue, true);
    this.colonyNPCs.push(elena);
    this.scene.add(elena.mesh);

    // 2. Calico Belle (Veteran Sanctuary Guard)
    const belleDialogue = [
      {
        speaker: 'Calico Belle',
        role: 'Colony Veteran',
        text: "Keep your claws sharp, kitten. Gantry's pack has been prowling near the submarine MOF after sundown.",
        actionReward: { type: 'XP' as const, amount: 50 }
      },
      {
        speaker: 'Calico Belle',
        role: 'Colony Veteran',
        text: "If you see a cat with glowing violet eyes in Whiskers Mode, don't trust it. That's one of Gantry's radioactive scouts."
      }
    ];
    const belle = new ColonyCatEntity('Calico Belle', 'Veteran Guard', new THREE.Vector3(-54, 0, -56), 0xd97706, belleDialogue, false);
    this.colonyNPCs.push(belle);
    this.scene.add(belle.mesh);

    // 3. Tripod Toby (Wise Three-Legged Tabby)
    const tobyDialogue = [
      {
        speaker: 'Tripod Toby',
        role: 'Colony Mentor',
        text: "Lost my hind paw to a gantry cable back in '98, but I still out-sprint any wharf rat! Remember: always right yourself mid-air.",
        actionReward: { type: 'BUFF' as const, amount: 50 }
      }
    ];
    const toby = new ColonyCatEntity('Tripod Toby', 'Colony Elder', new THREE.Vector3(-52, 0, -55), 0x71717a, tobyDialogue, false);
    this.colonyNPCs.push(toby);
    this.scene.add(toby.mesh);
  }

  private spawnShipbuilders() {
    // 1. Mo Kelly (Welder, Dept. 11) - Working near Dorothy Tugboat staging
    const moDialogues = [
      {
        speaker: 'Mo Kelly',
        department: 'Dept. 11 Welding',
        trade: 'WELDER' as const,
        text: "Morning, Alba! Watch out for those hot slag sparks on the deck. Keep old Dorothy running smooth for us!",
        assistTip: "Unjam the capstan winch to earn shipbuilding assist XP!"
      },
      {
        speaker: 'Mo Kelly',
        department: 'Dept. 11 Welding',
        trade: 'WELDER' as const,
        text: "Heard some weird skittering inside the machine shop conduit raceways. Better use your whiskers sense."
      }
    ];
    const mo = new ShipbuilderEntity('Mo Kelly', 'Dept. 11', 'WELDER', new THREE.Vector3(-18, 0, -18), Math.PI / 4, moDialogues, false);
    this.shipbuilders.push(mo);
    this.scene.add(mo.mesh);

    // Female Welder specialist near Machine Shop
    const sarahDialogues = [
      {
        speaker: 'Sarah Jenkins',
        department: 'Dept. 11 Welding',
        trade: 'WELDER' as const,
        text: "Hey Alba! Watch the torch arc while I seal this submarine bulkhead joint.",
        assistTip: "Stay behind the flash shield to avoid blinding flash."
      }
    ];
    const sarah = new ShipbuilderEntity('Sarah Jenkins', 'Dept. 11', 'WELDER', new THREE.Vector3(-32, 0, -16), -Math.PI / 4, sarahDialogues, true);
    this.shipbuilders.push(sarah);
    this.scene.add(sarah.mesh);

    // 2. Frank 'Sarge' Miller (Rigger, Heavy Lift) - Near Big Blue Crane staging
    const frankDialogues = [
      {
        speaker: 'Frank Miller',
        department: 'Heavy Rigging & Lift',
        trade: 'RIGGER' as const,
        text: "Hey there, four-legged supervisor! Big Blue's 1,050-ton trolley is geared up for the CVN module superlift.",
        assistTip: "Watch out for crane tag lines and 480V third rails on high catwalks."
      }
    ];
    const frank = new ShipbuilderEntity('Frank Miller', 'Rigging Dept.', 'RIGGER', new THREE.Vector3(14, 0, 18), -Math.PI / 3, frankDialogues);
    this.shipbuilders.push(frank);
    this.scene.add(frank.mesh);

    // 3. Dave O'Connor (Nuclear Pipefitter) - Outside Submarine MOF
    const daveDialogues = [
      {
        speaker: 'Dave O\'Connor',
        department: 'Nuclear Pipefitting',
        trade: 'PIPEFITTER' as const,
        text: "Careful around the steam testing valves, Alba. Those pressure gauges are sensitive!",
        assistTip: "Thread the conduit pilot string to prevent wire harness delays."
      }
    ];
    const dave = new ShipbuilderEntity('Dave O\'Connor', 'Submarine Outfitting', 'PIPEFITTER', new THREE.Vector3(-23, 0, 38), Math.PI / 2, daveDialogues);
    this.shipbuilders.push(dave);
    this.scene.add(dave.mesh);
  }

  private spawnMutantCats() {
    const mutant1 = new MutantCatEntity('Mutant Scout Fang', new THREE.Vector3(-28, 0, 12));
    const mutant2 = new MutantCatEntity('Mutant Prowler Slag', new THREE.Vector3(10, 0, 18));
    const mutant3 = new MutantCatEntity('Lieutenant Cobalt', new THREE.Vector3(34, 0, -50));

    this.mutantCats.push(mutant1, mutant2, mutant3);
    this.scene.add(mutant1.mesh, mutant2.mesh, mutant3.mesh);
  }

  private setupInput() {
    this.onKeyDownBound = (e: KeyboardEvent) => {
      this.keys[e.code] = true;

      // Double-Tap Forward to Sprint Detection (W or Up Arrow)
      if ((e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) {
        const now = performance.now();
        if (now - this.lastForwardKeyDownTime < 320 && !this.isDoubleTapSprint) {
          this.isDoubleTapSprint = true;
        }
        this.lastForwardKeyDownTime = now;
      }

      // Sneak / Silent Stalker Mode Toggle (C or Ctrl)
      if ((e.code === 'KeyC' || e.code === 'ControlLeft') && !e.repeat) {
        this.isSneakToggle = !this.isSneakToggle;
        if (this.isSneakToggle) {
          this.onNotification?.('Silent Stalker Mode (Active)', 'Low crouch stalking engaged. Movement is slow and silent.', 'info');
        }
      }

      // Whiskers Mode Toggle (Q)
      if (e.code === 'KeyQ' && !e.repeat) {
        this.toggleWhiskersMode();
      }

      // Interact / Meow / Eat (E)
      if (e.code === 'KeyE' && !e.repeat) {
        this.handleInteractOrMeow();
      }

      // Combat: Paw Swipe Combo (J or R)
      if ((e.code === 'KeyJ' || e.code === 'KeyR') && !e.repeat) {
        this.executePawSwipe();
      }

      // Combat: Tail Sweep (K or T)
      if ((e.code === 'KeyK' || e.code === 'KeyT') && !e.repeat) {
        this.executeTailSweep();
      }

      // Pounce (F)
      if (e.code === 'KeyF' && !e.repeat) {
        this.executePounce();
      }
    };

    this.onKeyUpBound = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        this.isDoubleTapSprint = false;
      }
    };

    // Mouse click & drag steering / combat
    this.onMouseDownBound = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'CANVAS') {
        this.isDraggingMouse = true;
        this.lastMouseX = e.clientX;
        if (e.button === 0) {
          this.executePawSwipe(); // Left click = Paw swipe attack
        } else if (e.button === 2) {
          this.executePounce();   // Right click = Pounce
        }
      }
    };

    this.onMouseMoveBound = (e: MouseEvent) => {
      if (this.isDraggingMouse) {
        const deltaX = e.clientX - this.lastMouseX;
        this.physicsCatHeading -= deltaX * 0.005;
        this.lastMouseX = e.clientX;
      }
    };

    this.onMouseUpBound = () => {
      this.isDraggingMouse = false;
    };

    this.onContextMenuBound = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('mousedown', this.onMouseDownBound);
    window.addEventListener('mousemove', this.onMouseMoveBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    window.addEventListener('contextmenu', this.onContextMenuBound);

    // Connect Virtual Touch Controller Action Hooks
    this.touchController.onPounce = () => this.executePounce();
    this.touchController.onAttack = () => this.executePawSwipe();
    this.touchController.onWhiskers = () => this.toggleWhiskersMode();
    this.touchController.onMeow = () => this.handleInteractOrMeow();
  }

  public handleInteractOrMeow() {
    const catPos = this.cat.mesh.position;
    let interacted = false;

    // 1. Check if near any food bowl / snack ration station
    for (const bowl of this.environment.foodBowls) {
      const dist = bowl.position.distanceTo(catPos);
      if (dist < 2.8) {
        this.vitals.feed(35);
        this.vitals.currentHealth = Math.min(this.vitals.maxHealth, this.vitals.currentHealth + 20);
        soundEngine.playEatSnack();
        soundEngine.playPurr();
        this.cat.triggerEat();
        this.onNotification?.('🥣 Snack Ration Consumed!', `Alba enjoyed a bowl of ${bowl.name}! Hunger and health refilled.`, 'success');
        interacted = true;
        break;
      }
    }

    // 2. Check if near any Colony NPC
    if (!interacted) {
      for (const npc of this.colonyNPCs) {
        const dist = npc.mesh.position.distanceTo(catPos);
        if (dist < 4.0) {
          const dialogue = npc.getNextDialogue();
          soundEngine.playMeow();
          this.onNotification?.(
            `💬 ${dialogue.speaker} (${dialogue.role})`,
            dialogue.text,
            'info'
          );

          if (dialogue.actionReward) {
            if (dialogue.actionReward.type === 'HEAL') {
              this.vitals.feed(40);
              this.onNotification?.('Sanctuary Healing', 'Health & hunger fully replenished by Dr. Vance!', 'success');
            } else if (dialogue.actionReward.type === 'XP') {
              this.progression.addXP(dialogue.actionReward.amount);
            }
          }
          interacted = true;
          break;
        }
      }
    }

    // 3. Check if near any active Shipbuilder
    if (!interacted) {
      for (const builder of this.shipbuilders) {
        const dist = builder.mesh.position.distanceTo(catPos);
        if (dist < 4.5) {
          const dialogue = builder.getNextDialogue();
          soundEngine.playMeow();
          this.onNotification?.(
            `🛠️ ${dialogue.speaker} (${dialogue.department})`,
            `${dialogue.text} ${dialogue.assistTip ? `\n💡 Tip: ${dialogue.assistTip}` : ''}`,
            'info'
          );
          interacted = true;
          break;
        }
      }
    }

    if (!interacted) {
      soundEngine.playMeow();
      this.onNotification?.('Alba Purrs', 'Meow! Attracting curious shipbuilders & alerting nearby prey.', 'info');
    }
  }

  // Trigger Impact Feedback (Camera Shake, Impact Sparks Particle Burst, Flash Light, and Audio)
  public triggerHitFeedback(pos: THREE.Vector3, isHeavy: boolean = false) {
    this.hitStopTimer = 0; // Removed artificial hit-stop pause to prevent screen freezing during combat combos
    this.cameraShakeIntensity = isHeavy ? 0.35 : 0.22;
    soundEngine.playHitImpact(isHeavy);
    soundEngine.playClawSlice();

    // Emit vivid impact sparks
    const count = isHeavy ? 32 : 18;
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * GameEngine.MAX_SPARKS);
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

    // Dynamic point light flash at strike point
    this.hitFlashLight.position.copy(pos);
    this.hitFlashLight.position.y += 0.35;
    this.hitFlashLight.intensity = isHeavy ? 6.0 : 3.8;
  }

  // Find Best Locked Target in Frontal Predatory Cone for Precision Pounce Leap (Zero-GC Preallocated Candidate)
  public findBestPounceTarget(): PounceTargetCandidate | null {
    const catPos = this.cat.mesh.position;
    const catForward = GameEngine.scratchForward.set(Math.sin(this.physicsCatHeading), 0, Math.cos(this.physicsCatHeading));
    let bestEntity: RatEntity | MutantCatEntity | null = null;
    let bestType: 'RAT' | 'MUTANT' = 'RAT';
    let bestName = '';
    let bestDist = 0;
    let bestScore = -Infinity;
    let foundTarget = false;

    // 1. Scan Vermin / Rats
    for (let i = 0; i < this.rats.length; i++) {
      const rat = this.rats[i];
      if (rat.state === 'CAUGHT') continue;
      const ratPos = rat.mesh.position;
      const dist = catPos.distanceTo(ratPos);
      if (dist > 8.5) continue;

      const dir = GameEngine.scratchPounce.subVectors(ratPos, catPos).normalize();
      const dot = catForward.dot(dir);
      if (dot < 0.25) continue; // In frontal vision arc

      const score = dot * 3.2 - (dist / 8.5);
      if (score > bestScore) {
        bestScore = score;
        bestEntity = rat;
        bestType = 'RAT';
        bestName = rat.name;
        bestDist = dist;
        GameEngine.bestPounceCandidate.targetPos.copy(ratPos);
        foundTarget = true;
      }
    }

    // 2. Scan Mutants
    for (let i = 0; i < this.mutantCats.length; i++) {
      const mutant = this.mutantCats[i];
      if (mutant.isDefeated) continue;
      const mPos = mutant.mesh.position;
      const dist = catPos.distanceTo(mPos);
      if (dist > 8.0) continue;

      const dir = GameEngine.scratchPounce.subVectors(mPos, catPos).normalize();
      const dot = catForward.dot(dir);
      if (dot < 0.25) continue;

      const score = dot * 3.2 - (dist / 8.0);
      if (score > bestScore) {
        bestScore = score;
        bestEntity = mutant;
        bestType = 'MUTANT';
        bestName = mutant.name;
        bestDist = dist;
        GameEngine.bestPounceCandidate.targetPos.copy(mPos);
        foundTarget = true;
      }
    }

    if (!foundTarget || !bestEntity) return null;

    GameEngine.bestPounceCandidate.entity = bestEntity;
    GameEngine.bestPounceCandidate.type = bestType;
    GameEngine.bestPounceCandidate.name = bestName;
    GameEngine.bestPounceCandidate.dist = bestDist;
    return GameEngine.bestPounceCandidate;
  }

  // Combat: Rapid Paw Swipe Combo
  public executePawSwipe() {
    const now = performance.now();
    if (now - this.lastAttackTime < 240) return; // Attack cooldown
    this.lastAttackTime = now;

    this.comboStep = (this.comboStep % this.progression.maxComboHits) + 1;

    if (this.comboStep === 3) {
      soundEngine.playClawCombo();
      this.onNotification?.('CLAW FLURRY COMBO (Hit 3/3)', 'Critical claw bite strike executed!', 'warn');
    } else {
      soundEngine.playPawSwipe();
    }

    // Animate paw strike
    this.cat.legs.fl.rotation.x = 0.9;
    this.cat.legs.fr.rotation.x = -0.9;

    // Trigger visual claw swipe animation
    this.cat.triggerSwipe(this.comboStep % 2 === 0);

    const catPos = this.cat.mesh.position;
    const damage = (this.comboStep === 3 ? 40 : 20) * this.progression.attackDamageMultiplier;

    // Check hit on rats
    for (let i = 0; i < this.rats.length; i++) {
      const rat = this.rats[i];
      if (rat.state !== 'CAUGHT') {
        const dist = rat.mesh.position.distanceTo(catPos);
        if (dist < 1.8) {
          this.triggerHitFeedback(rat.mesh.position, this.comboStep === 3 || rat.isKingpin);
          rat.state = 'CAUGHT';
          rat.mesh.visible = false;
          rat.scentTrailParticles.visible = false;
          this.cat.triggerEat();
          soundEngine.playRatCatch();
          this.vitals.feed(rat.nutritionValue);
          this.progression.addXP(rat.nutritionValue * 3);
          this.onNotification?.('Swipe KO!', `Struck down ${rat.name} with a claw combo!`, 'success');
          this.missionManager.updateCountObjective('hunt_mice', 1);
          this.onMissionObjectiveUpdated?.();
        }
      }
    }

    // Check hit on Mutant Cats
    for (let i = 0; i < this.mutantCats.length; i++) {
      const mutant = this.mutantCats[i];
      if (!mutant.isDefeated) {
        const dist = mutant.mesh.position.distanceTo(catPos);
        if (dist < 2.2) {
          const defeated = mutant.takeDamage(damage, catPos, false);
          this.triggerHitFeedback(mutant.mesh.position, this.comboStep === 3 || defeated);

          if (defeated) {
            this.onNotification?.('MUTANT INSURGENT DEFEATED!', `You knocked out ${mutant.name}! Gantry's hold on the yard weakens.`, 'success');
            this.progression.addXP(80);
            this.missionManager.updateCountObjective('defeat_mutants', 1);
            this.onMissionObjectiveUpdated?.();
          } else {
            this.onNotification?.('Claw Hit!', `Dealt ${damage.toFixed(0)} damage to ${mutant.name} (${mutant.health}/${mutant.maxHealth} HP).`, 'info');
          }
        }
      }
    }
  }

  // Combat: 360-Degree Tail Sweep Spin
  public executeTailSweep() {
    if (!this.progression.hasTailSweep) {
      this.onNotification?.('Ability Locked', 'Unlock "Tail Sweep Stun" in Abilities to use this move.', 'warn');
      return;
    }

    soundEngine.playTailSweep();
    this.cat.triggerTailSweep();
    this.onNotification?.('TAIL SWEEP!', 'Spun 360° knocking back surrounding enemies!', 'info');

    const catPos = this.cat.mesh.position;
    for (let i = 0; i < this.mutantCats.length; i++) {
      const mutant = this.mutantCats[i];
      if (!mutant.isDefeated) {
        const dist = mutant.mesh.position.distanceTo(catPos);
        if (dist < 3.2) {
          mutant.takeDamage(15, catPos, true);
          this.triggerHitFeedback(mutant.mesh.position, true);
        }
      }
    }
  }

  private setupAssistanceListeners() {
    this.assistanceEngine.onAssist((event) => {
      soundEngine.playSuccess();
      this.onAssistanceTriggered?.(event);
      
      const leveledUp = this.progression.addXP(event.rewardXP);
      if (leveledUp) {
        this.onNotification?.(
          `⭐ LEVEL UP! (Level ${this.progression.level})`,
          `Rank: ${this.progression.rankTitle}. You earned +1 Skill Point! Visit Abilities to unlock perks.`,
          'success'
        );
      }

      this.onNotification?.(
        `UNINTENTIONAL ASSISTANCE: ${event.title}`,
        `${event.description} (+${event.rewardXP} XP)`,
        'success'
      );
    });
  }

  public toggleWhiskersMode(): boolean {
    if (!this.isWhiskersMode && !this.vitals.canUseWhiskers()) {
      this.onNotification?.('Exhausted!', 'Stamina too low to focus Whiskers Vision. Catch your breath!', 'warn');
      return false;
    }

    this.isWhiskersMode = !this.isWhiskersMode;
    soundEngine.playWhiskersPing();

    if (this.isWhiskersMode) {
      this.scene.background = GameEngine.sonarBgColor; // Blueprint Sonar Blue
      this.scene.fog = this.sonarFog;
      
      let modeDesc = 'Thermal prey signatures highlighted (Drains Stamina).';
      if (this.progression.whiskersTier >= 1) modeDesc += ' Scent footprint trails visible.';
      if (this.progression.whiskersTier >= 2) modeDesc += ' Radioactive mutant cats glowing violet.';
      if (this.progression.whiskersTier >= 3) modeDesc += ' Structural & Geiger conduit vision active.';

      this.onNotification?.('Whiskers Vision Active', modeDesc, 'info');
    } else {
      if (this.hdrSkyTexture) {
        this.scene.background = this.hdrSkyTexture;
      } else {
        this.scene.background = GameEngine.normalBgColor;
      }
      this.scene.fog = this.normalFog;
    }

    // Toggle rats & mutant cats
    for (let i = 0; i < this.rats.length; i++) {
      this.rats[i].setWhiskersMode(this.isWhiskersMode);
    }
    for (let i = 0; i < this.mutantCats.length; i++) {
      this.mutantCats[i].setWhiskersAura(this.isWhiskersMode, this.progression.whiskersTier >= 2);
    }
    this.environment.setWhiskersMode(this.isWhiskersMode);

    return this.isWhiskersMode;
  }

  // Trajectory-Locked Predatory Pounce Leap
  public executePounce() {
    if (this.isPouncing || !this.isGrounded) return;
    if (!this.vitals.consumePounceStamina(22)) {
      this.onNotification?.('Exhausted!', 'Not enough stamina to execute a precision pounce. Catch your breath or eat!', 'warn');
      return;
    }

    const lockedTarget = this.findBestPounceTarget();
    if (lockedTarget) {
      const targetPos = lockedTarget.targetPos;
      const dx = targetPos.x - this.physicsCatPosition.x;
      const dz = targetPos.z - this.physicsCatPosition.z;
      const dist = Math.hypot(dx, dz);
      const safeDist = Math.max(0.001, dist);

      const targetHeading = Math.atan2(dx, dz);
      this.physicsCatHeading = targetHeading;
      this.prevPhysicsHeading = this.physicsCatHeading;
      this.catHeading = this.physicsCatHeading;
      this.physicsCatBankAngle = 0;
      this.prevPhysicsBankAngle = 0;
      this.cat.mesh.rotation.set(0, this.physicsCatHeading, 0);

      const flightTime = Math.max(0.25, Math.min(0.5, dist / 11.5));
      const gravity = 18.0;
      const dy = targetPos.y - this.physicsCatPosition.y;
      const initialVy = (dy + 0.5 * gravity * flightTime * flightTime) / flightTime;

      const horizSpeed = dist / flightTime;
      const dirX = dx / safeDist;
      const dirZ = dz / safeDist;

      this.catVelocity.set(dirX * horizSpeed, Math.max(4.2, initialVy), dirZ * horizSpeed);
      this.pounceTimer = flightTime + 0.1;
      this.isPouncing = true;
      this.isGrounded = false;
      this.cat.isPouncing = true;

      soundEngine.playPounce();
    } else {
      // Free Pounce Forward
      soundEngine.playPounce();
      this.isPouncing = true;
      this.pounceTimer = 0.45;
      this.cat.isPouncing = true;

      GameEngine.scratchForward.set(Math.sin(this.physicsCatHeading), 0, Math.cos(this.physicsCatHeading));
      this.catVelocity.copy(GameEngine.scratchForward).multiplyScalar(10.5);
      this.catVelocity.y = 5.5;
      this.isGrounded = false;
    }
  }

  // Preallocated mutant collision & damage handlers (eliminates per-frame closure allocations)
  private onMutantAttack = (damage: number) => {
    this.vitals.takeHazardDamage(damage / 100);
    soundEngine.playCatHiss();
    this.onNotification?.('MUTANT ATTACK!', 'A mutant insurgent swiped at Alba! Health reduced.', 'warn');
  };

  private resolveEnvCollision = (pos: THREE.Vector3, rad: number, prevPos?: THREE.Vector3) => this.environment.resolveCollision(pos, rad, prevPos);

  // Fixed 60Hz Physics Sub-step (Player movement ONLY — AI updates belong in the render loop)
  private fixedPhysicsStep(dt: number) {
    this.prevPhysicsPosition.copy(this.physicsCatPosition);
    this.prevPhysicsHeading = this.physicsCatHeading;
    this.prevPhysicsBankAngle = this.physicsCatBankAngle;

    this.fixedUpdateMovement(dt);
  }

  private fixedUpdateMovement(dt: number) {
    const touchMove = this.touchController.moveVector;
    const isSprinting = ((this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.isDoubleTapSprint || this.touchController.isSprinting) && this.vitals.canSprint());
    const isCrouching = this.isSneakToggle || this.keys['ControlLeft'] || this.keys['KeyC'];
    this.cat.isCrouching = isCrouching;

    // 1. Forward / Reverse Propulsion (Keyboard + Touch Joystick)
    let driveInput = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) driveInput += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) driveInput -= 0.6;
    if (this.touchController.isTouching) {
      driveInput = touchMove.y; // Positive Y is forward
    }

    const isMoving = Math.abs(driveInput) > 0.05 || Math.abs(touchMove.x) > 0.05;

    // Auto-disable Whiskers Mode if exhausted
    if (this.isWhiskersMode && !this.vitals.canUseWhiskers()) {
      this.toggleWhiskersMode();
      this.onNotification?.('Whiskers Vision Faded', 'Alba is exhausted! Stamina recharging...', 'warn');
    }

    // 2. Responsive Feline Steering Arc & Dynamic Body Banking
    let turnInput = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) turnInput += 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) turnInput -= 1;
    if (this.touchController.isTouching) {
      turnInput = -touchMove.x * 1.5;
    }

    if (Math.abs(turnInput) > 0.001) {
      const baseTurnRate = isCrouching ? 3.4 : (isSprinting ? 2.6 : (isMoving ? 3.0 : 3.6));
      const targetTurnVel = turnInput * baseTurnRate;
      this.turnVelocity = THREE.MathUtils.lerp(this.turnVelocity, targetTurnVel, Math.min(1.0, 16.0 * dt));
      this.physicsCatHeading += this.turnVelocity * dt;

      // Banking roll tilt when turning at speed
      const targetBank = -turnInput * 0.12 * Math.min(1.0, this.currentCatSpeed / 8.0);
      this.physicsCatBankAngle = THREE.MathUtils.lerp(this.physicsCatBankAngle, targetBank, Math.min(1.0, 12.0 * dt));
    } else {
      // Idle: 0 drift, immediately decay turnVelocity to 0 and stabilize heading
      this.turnVelocity = 0;
      if (Math.abs(this.physicsCatBankAngle) < 0.001) {
        this.physicsCatBankAngle = 0;
      } else {
        this.physicsCatBankAngle = THREE.MathUtils.lerp(this.physicsCatBankAngle, 0, Math.min(1.0, 16.0 * dt));
      }
    }

    // Update vitals with Whiskers drain & exhaustion lock
    this.vitals.update(dt, isSprinting, isMoving, this.isWhiskersMode);

    // 3. Jump with Progression Multiplier
    if (this.keys['Space'] && this.isGrounded && !this.isPouncing) {
      const jumpPower = 6.2 * this.progression.jumpMultiplier;
      this.catVelocity.y = jumpPower;
      this.isGrounded = false;
      this.vitals.consumePounceStamina(10);
    }

    // 4. Agile Feline Acceleration Curve
    let targetSpeed = 0;
    if (isMoving) {
      if (isSprinting) {
        targetSpeed = 9.2 * this.progression.sprintMultiplier;
      } else if (isCrouching) {
        targetSpeed = 2.0;
      } else {
        targetSpeed = 4.6;
      }
      if (driveInput < 0) targetSpeed *= 0.6; // Reverse
    }

    const accelRate = targetSpeed > this.currentCatSpeed ? 22.0 : 28.0;
    const speedDiff = targetSpeed - this.currentCatSpeed;
    this.currentCatSpeed += Math.sign(speedDiff) * Math.min(Math.abs(speedDiff), accelRate * dt);

    GameEngine.scratchPrevPos.copy(this.physicsCatPosition);
    const forward = GameEngine.scratchForward.set(Math.sin(this.physicsCatHeading), 0, Math.cos(this.physicsCatHeading));

    // 5. Unified 3D Velocity & Single Integration Pass
    const totalVelocity = GameEngine.scratchTotalVelocity.set(0, 0, 0);

    if (this.isPouncing) {
      this.catVelocity.y -= 18.0 * dt;
      totalVelocity.copy(this.catVelocity);
    } else {
      if (this.currentCatSpeed > 0.01) {
        const moveDir = Math.sign(driveInput || 1);
        totalVelocity.x = forward.x * moveDir * this.currentCatSpeed;
        totalVelocity.z = forward.z * moveDir * this.currentCatSpeed;
      }
      if (!this.isGrounded) {
        this.catVelocity.y -= 18.0 * dt;
        totalVelocity.y = this.catVelocity.y;
      } else {
        totalVelocity.y = 0;
      }
    }

    // Single 3D Displacement Integration & Collision Resolution
    const scratchNewPos = GameEngine.scratchNewPos.copy(this.physicsCatPosition).addScaledVector(totalVelocity, dt);
    const resolvedPos = this.environment.resolveCollision(scratchNewPos, 0.35, GameEngine.scratchPrevPos);
    this.physicsCatPosition.copy(resolvedPos);

    // 6. Vertical Platform Floor Evaluation, Damping, Step-Up & Landing
    const currentFloor = this.environment.getPlatformFloor(
      this.physicsCatPosition.x,
      this.physicsCatPosition.z,
      this.physicsCatPosition.y
    );

    if (this.isGrounded) {
      const heightDiff = currentFloor - this.physicsCatPosition.y;
      if (Math.abs(heightDiff) <= 0.15) {
        const dampFactor = 1.0 - Math.exp(-22.0 * dt);
        this.physicsCatPosition.y = THREE.MathUtils.lerp(this.physicsCatPosition.y, currentFloor, dampFactor);
        if (Math.abs(this.physicsCatPosition.y - currentFloor) < 0.001) {
          this.physicsCatPosition.y = currentFloor;
        }
        this.catVelocity.y = 0;
        if (this.isPouncing) {
          this.isPouncing = false;
          this.cat.isPouncing = false;
          this.pounceTimer = 0;
        }
      } else if (heightDiff > 0 && heightDiff <= 0.55) {
        const stepSpeed = Math.max(8.0, this.currentCatSpeed * 2.5);
        this.physicsCatPosition.y = Math.min(currentFloor, this.physicsCatPosition.y + stepSpeed * dt);
        this.catVelocity.y = 0;
        if (this.isPouncing) {
          this.isPouncing = false;
          this.cat.isPouncing = false;
          this.pounceTimer = 0;
        }
      } else if (this.physicsCatPosition.y > currentFloor + 0.15) {
        this.isGrounded = false;
        this.catVelocity.y = 0;
      } else {
        this.physicsCatPosition.y = currentFloor;
        this.catVelocity.y = 0;
      }
    } else {
      // Airborne: Check landing on platform top surface or ground
      if (this.physicsCatPosition.y <= currentFloor) {
        const fallSpeed = Math.abs(this.catVelocity.y);
        this.physicsCatPosition.y = currentFloor;
        this.catVelocity.set(0, 0, 0);
        this.isGrounded = true;
        this.isPouncing = false;
        this.cat.isPouncing = false;
        this.pounceTimer = 0;

        // Fall Impact Damage (Jumping from high boardwalk / walls without using crates)
        if (fallSpeed > 10.5 && !this.progression.hasAlwaysLandOnFeet) {
          const fallDmg = Math.round((fallSpeed - 10.0) * 8);
          this.vitals.takeDamage(fallDmg);
          soundEngine.playMeow();
          this.onNotification?.('Ouch! Fall Damage', `Fell too far (-${fallDmg} HP)! Climb down using the wooden crates.`, 'warn');
        }

        // Check if entered Historic Dry Dock 1 basin (X: 16 to 43, Z: -34 to -21)
        if (this.physicsCatPosition.x >= 16.0 && this.physicsCatPosition.x <= 43.0 &&
            this.physicsCatPosition.z >= -34.0 && this.physicsCatPosition.z <= -21.0 &&
            currentFloor <= -1.0) {
          if (!this.missionManager.getCurrentMission().objectives[1].isCompleted) {
            this.missionManager.completeObjective('climb_dorothy');
            soundEngine.playSuccess();
            this.onNotification?.('OBJECTIVE COMPLETE!', "You climbed down into Historic Dry Dock 1! Track down the Dockyard Kingpin.", 'success');
            this.onMissionObjectiveUpdated?.();
          }
        }

        // Check if climbed onto Tugboat Dorothy's deck (X: -22 to -18, Z: -31 to -19, Y: 2.2)
        if (this.physicsCatPosition.x >= -23.0 && this.physicsCatPosition.x <= -17.0 &&
            this.physicsCatPosition.z >= -32.0 && this.physicsCatPosition.z <= -18.0 &&
            currentFloor >= 2.0) {
          soundEngine.playPurr();
        }

        // Check if landed on a floating pallet in Dry Dock 12
        if (this.physicsCatPosition.x > 8 && this.physicsCatPosition.x < 32 && this.physicsCatPosition.z > 10 && this.physicsCatPosition.z < 60) {
          if (currentFloor > 0.5) {
            this.missionManager.updateCountObjective('jump_pallets', 1);
            this.onMissionObjectiveUpdated?.();
          }
        }
      }
    }

    // Failsafe State Machine Check: If pounce expired or grounded on any floor surface, unlock movement immediately
    if (this.isPouncing) {
      this.pounceTimer -= dt;
      if (this.pounceTimer <= 0 || this.isGrounded || this.physicsCatPosition.y <= currentFloor) {
        this.isPouncing = false;
        this.cat.isPouncing = false;
        this.pounceTimer = 0;
      }
    }

    // Ensure character never falls below Y = 0.0m unless inside a valid sunken dry dock basin
    const isInsideDD1 = (this.physicsCatPosition.x >= 15.0 && this.physicsCatPosition.x <= 44.5 && this.physicsCatPosition.z >= -36.0 && this.physicsCatPosition.z <= -19.0);
    const isInsideDD12 = (this.physicsCatPosition.x >= 5.0 && this.physicsCatPosition.x <= 35.0 && this.physicsCatPosition.z >= 10.0 && this.physicsCatPosition.z <= 80.0);
    if (!isInsideDD1 && !isInsideDD12 && this.physicsCatPosition.y < 0.0) {
      this.physicsCatPosition.y = 0.0;
      this.catVelocity.y = Math.max(0, this.catVelocity.y);
      this.isGrounded = true;
    }
  }

  private updateMutantsAndColony(deltaTime: number) {
    const catPos = this.cat.mesh.position;
    const throttleDistanceSq = 18 * 18;
    const maxActiveDistanceSq = 60 * 60;

    for (let i = 0; i < this.mutantCats.length; i++) {
      const mutant = this.mutantCats[i];
      const dSq = mutant.mesh.position.distanceToSquared(catPos);
      if (dSq > maxActiveDistanceSq) continue;
      const skipMixer = (dSq > throttleDistanceSq && this.frameTick % 2 !== 0);

      mutant.update(
        deltaTime,
        catPos,
        this.onMutantAttack,
        this.resolveEnvCollision,
        skipMixer
      );
    }

    // Animate Colony Cats (NPCs)
    for (let i = 0; i < this.colonyNPCs.length; i++) {
      this.colonyNPCs[i].update(deltaTime);
    }

    // Animate active shipbuilder torches and tools
    for (let i = 0; i < this.shipbuilders.length; i++) {
      this.shipbuilders[i].animate(deltaTime);
    }
  }

  private updateFloodingSimulation(deltaTime: number) {
    // If in Mission 2 (Dry Dock 12 Flooding), rise water
    if (this.missionManager.getCurrentMission().id === 2 && this.environment.dryDockWater) {
      if (this.waterLevel < 3.0) {
        this.waterLevel += deltaTime * 0.12;
        this.environment.dryDockWater.position.y = this.waterLevel;
      }
    }
  }

  private updateRatsAndHunting(deltaTime: number) {
    const catPos = this.cat.mesh.position;
    const throttleDistanceSq = 18 * 18;
    const maxActiveDistanceSq = 60 * 60;

    let minRatDist = 999;
    for (let i = 0; i < this.rats.length; i++) {
      const rat = this.rats[i];
      if (rat.state === 'CAUGHT') continue;

      const dSq = rat.mesh.position.distanceToSquared(catPos);
      const dist = Math.sqrt(dSq);
      if (dist < minRatDist) minRatDist = dist;

      if (dSq > maxActiveDistanceSq) {
        rat.mesh.visible = false;
        continue;
      }

      const skipMixer = (dSq > throttleDistanceSq && this.frameTick % 2 !== 0);
      rat.update(deltaTime, catPos, this.cat.isCrouching, skipMixer);
      
      if ((rat.state as string) !== 'CAUGHT') {
        const prevRatPos = GameEngine.scratchRatPrevPos.copy(rat.mesh.position);
        const resolvedRatPos = this.environment.resolveCollision(rat.mesh.position, 0.25, prevRatPos);
        rat.mesh.position.copy(resolvedRatPos);
      }

      if ((rat.state as string) !== 'CAUGHT') {
        const dist = rat.mesh.position.distanceTo(catPos);
        const catchThreshold = rat.isKingpin ? 2.8 : (this.isPouncing ? 2.4 : 1.3);

        if (dist < catchThreshold && (this.isPouncing || dist < 1.3)) {
          this.triggerHitFeedback(rat.mesh.position, rat.isKingpin);

          if (rat.isKingpin) {
            rat.health -= 1;
            rat.isStunned = true;
            rat.stunTimer = 1.2;
            rat.attackCooldown = 2.0;
            soundEngine.playRatCatch();

            if (rat.health <= 0) {
              rat.state = 'CAUGHT';
              rat.mesh.visible = false;
              rat.scentTrailParticles.visible = false;
              this.cat.triggerEat(); // Trigger Alba eating chewing animation
              soundEngine.playSuccess();
              this.vitals.feed(100);
              this.vitals.currentStamina = this.vitals.maxStamina;
              this.vitals.currentHealth = this.vitals.maxHealth;
              this.progression.skillPoints += 1;
              this.progression.addXP(150);

              this.onNotification?.('👑 KINGPIN DEFEATED!', 'You defeated the Dockyard Kingpin! +1 Skill Point awarded & Vitals fully restored!', 'success');
              this.missionManager.completeObjective('hunt_kingpin');
              this.assistanceEngine.triggerAssist('DOROTHY_CAPSTAN_UNJAM');
            } else {
              this.onNotification?.('Boss Hit!', `Dockyard Kingpin stunned! (${rat.health}/${rat.maxHealth} HP remaining)`, 'warn');
            }
          } else {
            rat.state = 'CAUGHT';
            rat.mesh.visible = false;
            rat.scentTrailParticles.visible = false;
            this.cat.triggerEat(); // Trigger Alba eating chewing animation
            soundEngine.playRatCatch();
            this.vitals.feed(rat.nutritionValue);
            this.vitals.currentStamina = Math.min(this.vitals.maxStamina, this.vitals.currentStamina + 35);

            const xpEarned = rat.nutritionValue * 3;
            const leveledUp = this.progression.addXP(xpEarned);
            if (leveledUp) {
              this.onNotification?.(
                `⭐ LEVEL UP! (Level ${this.progression.level})`,
                `Rank: ${this.progression.rankTitle}. Unlocked +1 Skill Point! Check Abilities to upgrade Alba.`,
                'success'
              );
            }

            this.onNotification?.('Prey Caught!', `Caught a ${rat.name}! +${xpEarned} XP (+${rat.nutritionValue} Hunger refilled).`, 'info');
            this.missionManager.updateCountObjective('hunt_mice', 1);
          }
          this.onMissionObjectiveUpdated?.();
        }
      }
    }
    this.flightRecorder.setNearestRatDistance(minRatDist);
  }

  private projectPoint(pos: THREE.Vector3, heightOffset: number) {
    const v = GameEngine.scratchProjectVec.copy(pos);
    v.y += heightOffset;
    v.project(this.camera);
    if (v.z < 1.0) {
      const screenX = (v.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-(v.y * 0.5) + 0.5) * window.innerHeight;
      if (screenX >= 20 && screenX <= window.innerWidth - 20 && screenY >= 20 && screenY <= window.innerHeight - 20) {
        GameEngine.scratchScreenProj.screenX = screenX;
        GameEngine.scratchScreenProj.screenY = screenY;
        GameEngine.scratchScreenProj.visible = true;
        return GameEngine.scratchScreenProj;
      }
    }
    GameEngine.scratchScreenProj.screenX = 0;
    GameEngine.scratchScreenProj.screenY = 0;
    GameEngine.scratchScreenProj.visible = false;
    return GameEngine.scratchScreenProj;
  }

  private addContextualPrompt(
    count: number,
    id: string,
    type: 'TALK' | 'EAT' | 'POUNCE',
    title: string,
    subtitle: string | undefined,
    keyText: string,
    screenX: number,
    screenY: number,
    distanceMeters: number,
    visible: boolean
  ): number {
    const pool = this.contextualPromptsPool;
    if (count < pool.length) {
      const p = pool[count];
      p.id = id;
      p.type = type;
      p.title = title;
      p.subtitle = subtitle;
      p.keyText = keyText;
      p.screenX = screenX;
      p.screenY = screenY;
      p.distanceMeters = distanceMeters;
      p.visible = visible;
    } else {
      pool.push({ id, type, title, subtitle, keyText, screenX, screenY, distanceMeters, visible });
    }
    return count + 1;
  }

  // Dynamic Floating Contextual HUD Prompts Calculation (Zero-Allocation Reusable Pool)
  private updateContextualPrompts() {
    if (!this.onContextualPromptsUpdate) return;
    const catPos = this.cat.mesh.position;
    let count = 0;

    // 1. Check Colony NPCs (< 4.2m)
    for (let i = 0; i < this.colonyNPCs.length; i++) {
      const npc = this.colonyNPCs[i];
      const dist = npc.mesh.position.distanceTo(catPos);
      if (dist < 4.2) {
        const proj = this.projectPoint(npc.mesh.position, 0.75);
        if (proj.visible) {
          count = this.addContextualPrompt(
            count,
            `npc-${i}`,
            'TALK',
            `Talk with ${npc.name}`,
            npc.role,
            'E',
            proj.screenX,
            proj.screenY,
            Math.round(dist * 10) / 10,
            true
          );
        }
      }
    }

    // 2. Check Active Shipbuilders (< 4.5m)
    for (let i = 0; i < this.shipbuilders.length; i++) {
      const b = this.shipbuilders[i];
      const dist = b.mesh.position.distanceTo(catPos);
      if (dist < 4.5) {
        const proj = this.projectPoint(b.mesh.position, 1.8);
        if (proj.visible) {
          count = this.addContextualPrompt(
            count,
            `builder-${i}`,
            'TALK',
            `Talk with ${b.name}`,
            b.department,
            'E',
            proj.screenX,
            proj.screenY,
            Math.round(dist * 10) / 10,
            true
          );
        }
      }
    }

    // 3. Check Food Bowls (< 3.0m)
    for (let i = 0; i < this.environment.foodBowls.length; i++) {
      const bowl = this.environment.foodBowls[i];
      const dist = bowl.position.distanceTo(catPos);
      if (dist < 3.0) {
        const proj = this.projectPoint(bowl.position, 0.35);
        if (proj.visible) {
          count = this.addContextualPrompt(
            count,
            `food-${i}`,
            'EAT',
            'Eat / Snack',
            bowl.name,
            'E',
            proj.screenX,
            proj.screenY,
            Math.round(dist * 10) / 10,
            true
          );
        }
      }
    }

    // 4. Check Locked Prey Target in Pounce Range (< 8.0m)
    const pounceCandidate = this.findBestPounceTarget();
    if (pounceCandidate && pounceCandidate.dist > 1.2 && pounceCandidate.dist < 8.0 && this.isGrounded) {
      const proj = this.projectPoint(pounceCandidate.targetPos, pounceCandidate.type === 'RAT' ? 0.4 : 0.7);
      if (proj.visible) {
        count = this.addContextualPrompt(
          count,
          'pounce-lock',
          'POUNCE',
          `Pounce Leap (${pounceCandidate.name})`,
          `Distance: ${pounceCandidate.dist.toFixed(1)}m • Trajectory Ready`,
          'F',
          proj.screenX,
          proj.screenY,
          Math.round(pounceCandidate.dist * 10) / 10,
          true
        );
      }
    }

    // Pass active prompts slice to event listener without creating garbage
    this.activePromptsList.length = count;
    for (let pIdx = 0; pIdx < count; pIdx++) {
      this.activePromptsList[pIdx] = this.contextualPromptsPool[pIdx];
    }
    this.onContextualPromptsUpdate(this.activePromptsList);
  }

  private updateRadiationAndHazards(deltaTime: number = 0.016) {
    const radData = this.radiationSystem.calculateRadiationAtPoint(this.cat.mesh.position);
    soundEngine.updateRadiationLevel(radData.totalDose, deltaTime);
    this.cat.updateDosimeterRadiation(radData.totalDose);

    if (radData.totalDose > 4.0) {
      this.vitals.takeHazardDamage(0.04);
      if (this.missionManager.getCurrentMission().id === 4) {
        this.missionManager.completeObjective('activate_whiskers');
        this.onMissionObjectiveUpdated?.();
      }
    }

    // Check proximity to Cat Motel sanctuary for healing
    const distToMotel = this.cat.mesh.position.distanceTo(GameEngine.CAT_MOTEL_PROXIMITY_TARGET);
    if (distToMotel < 8.0) {
      this.vitals.healAtSanctuary();
    }

    this.onVitalsUpdate?.(this.vitals, radData.totalDose);
  }

  private updateStoryProgression(deltaTime: number) {
    const mission = this.missionManager.getCurrentMission();
    const catPos = this.cat.mesh.position;

    // Mission 1: Historic Dry Dock 1 & Dockyard Kingpin
    if (mission.id === 1) {
      // Step 2: Check Dry Dock 1 basin descent (X: 15 to 44, Z: -35 to -20, Y <= -1.0)
      if (catPos.x >= 15.0 && catPos.x <= 44.0 && catPos.z >= -35.0 && catPos.z <= -20.0 && catPos.y <= -1.0) {
        if (!mission.objectives[1].isCompleted) {
          this.missionManager.completeObjective('climb_dorothy');
          soundEngine.playSuccess();
          this.onNotification?.('OBJECTIVE COMPLETE!', "You entered Historic Dry Dock 1! Defeat the Dockyard Kingpin.", 'success');
          this.onMissionObjectiveUpdated?.();
        }
      }
    }

    // Mission 2: Tide Rising in Dry Dock 12 (Carrier Keel Flooding & Catwalk Escape)
    else if (mission.id === 2) {
      // Objective 1: Reach rim of Dry Dock 12
      if (!mission.objectives[0].isCompleted) {
        if (catPos.z >= 12.0 && catPos.x >= 3.0 && catPos.x <= 38.0) {
          this.missionManager.completeObjective('reach_drydock');
          soundEngine.playCatHiss();
          this.isFloodingActive = true;
          this.onNotification?.('⚠️ EMERGENCY SLUICE BREACH!', "River water is flooding Dry Dock 12! Leap across floating pallets [Space/F]!", 'warn');
          this.onMissionObjectiveUpdated?.();
        }
      }
      // Objective 3: Escape flood by climbing high staging ladder to catwalk
      if (!mission.objectives[2].isCompleted) {
        if (catPos.x >= 26.0 && catPos.z >= 38.0 && catPos.y >= 3.0) {
          this.missionManager.completeObjective('escape_flood');
          soundEngine.playSuccess();
          this.assistanceEngine.triggerAssist('CRANE_SAFETY_TRIP');
          this.onNotification?.('🎉 BASIN FLOOD ESCAPED!', "Alba reached the high gantry catwalk safely! Unlocked Mission 3.", 'success');
          this.onMissionObjectiveUpdated?.();
        }
      }
    }

    // Mission 3: Mutants in the Machine Shop & Submarine Nuclear Vault
    else if (mission.id === 3) {
      // Objective 2: Identify radioactivity with Whiskers Vision near Submarine MOF (X: -30, Z: 45)
      if (!mission.objectives[1].isCompleted && this.isWhiskersMode) {
        const distToSub = catPos.distanceTo(GameEngine.SUB_TARGET_POS);
        if (distToSub < 25.0) {
          this.missionManager.completeObjective('identify_radioactivity');
          soundEngine.playSuccess();
          this.onNotification?.('📡 RADIOACTIVE TRAIL IDENTIFIED!', "Whiskers Vision reveals gamma isotope tracks leading to the scrap yard!", 'info');
          this.onMissionObjectiveUpdated?.();
        }
      }

      // Objective 3: Confront Gantry's vanguard in Scrap Staging Yard (X: 38, Z: -52)
      if (!mission.objectives[2].isCompleted) {
        const distToScrap = catPos.distanceTo(GameEngine.SCRAP_TARGET_POS);
        if (distToScrap < 14.0) {
          this.missionManager.completeObjective('confront_gantry');
          soundEngine.playSuccess();
          this.assistanceEngine.triggerAssist('CONDUIT_PULL_STRING');
          this.onNotification?.('⭐ SCRAP YARD SECURED!', "You repelled Gantry's vanguard and saved the submarine wire harness!", 'success');
          this.onMissionObjectiveUpdated?.();
        }
      }
    }

    // Mission 4: Shadows in the Shielding
    else if (mission.id === 4) {
      const distToVault = catPos.distanceTo(GameEngine.VAULT_TARGET_POS);
      if (distToVault < 12.0 && this.isWhiskersMode) {
        this.missionManager.completeObjective('activate_whiskers');
        this.onMissionObjectiveUpdated?.();
      }
    }
  }

  private updateCamera(deltaTime: number) {
    const targetPos = GameEngine.scratchTargetPos.copy(this.cat.mesh.position);
    
    // Free camera lookaround (Hold V or I/K/J/L or Arrow keys when Alt/V held)
    if (this.keys['KeyV']) {
      if (this.keys['ArrowLeft'] || this.keys['KeyJ']) this.cameraYaw += 2.0 * deltaTime;
      if (this.keys['ArrowRight'] || this.keys['KeyL']) this.cameraYaw -= 2.0 * deltaTime;
      if (this.keys['ArrowUp'] || this.keys['KeyI']) this.cameraPitch = Math.min(0.8, this.cameraPitch + 1.5 * deltaTime);
      if (this.keys['ArrowDown'] || this.keys['KeyK']) this.cameraPitch = Math.max(-0.4, this.cameraPitch - 1.5 * deltaTime);
    } else {
      // Smoothly re-center camera behind Alba when not free-looking with exponential decay
      const yawDecay = 1.0 - Math.exp(-4.5 * deltaTime);
      this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, 0, yawDecay);
    }

    // Check if Alba is inside Machine Shop No. 1 (X: -56 to -34, Z: -38 to -2)
    const isInsideMachineShop = targetPos.x >= -56 && targetPos.x <= -34 && targetPos.z >= -38 && targetPos.z <= -2;
    const isInsideMotel = targetPos.x >= -62 && targetPos.x <= -48 && targetPos.z >= -71 && targetPos.z <= -59;

    const isIndoors = isInsideMachineShop || isInsideMotel;

    // Location notification on transition with 4-second cooldown to prevent border thrashing
    const currentLocation = isInsideMachineShop ? 'Machine Shop No. 1 (Interior)' :
                            isInsideMotel ? 'Cat Motel Hub Sanctuary' : 'Shipyard Grounds (South Yard)';

    const now = performance.now();
    if (currentLocation !== this.lastLocationName) {
      if (now - this.lastLocationNotificationTime >= 4000) {
        this.lastLocationName = currentLocation;
        this.lastLocationNotificationTime = now;
        this.onNotification?.(`Entering: ${currentLocation}`, isIndoors ? 'Indoor stealth area active. Clustered machinery & conduits overhead.' : 'Open shipyard staging yard.', 'info');
      }
    }

    // Dynamic camera distance with spring-arm collision avoidance
    const maxDist = isIndoors ? 1.8 : 3.8;
    const totalHeading = this.catHeading + this.cameraYaw;
    const camHeight = isIndoors ? 1.1 : (1.4 + Math.sin(this.cameraPitch) * 1.5);
    const camDist = maxDist * Math.cos(this.cameraPitch);

    const desiredCameraPos = GameEngine.scratchDesiredCamPos.set(
      targetPos.x - Math.sin(totalHeading) * camDist,
      targetPos.y + camHeight,
      targetPos.z - Math.cos(totalHeading) * camDist
    );

    // If indoors in Machine Shop, clamp camera to room interior boundaries
    if (isInsideMachineShop) {
      desiredCameraPos.x = Math.max(-55.0, Math.min(-35.0, desiredCameraPos.x));
      desiredCameraPos.z = Math.max(-37.0, Math.min(-3.0, desiredCameraPos.z));
      desiredCameraPos.y = Math.max(0.4, Math.min(6.5, desiredCameraPos.y));
    }

    // Frame-rate independent exponential spring-arm camera position smoothing
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
    
    const rawLookTarget = GameEngine.scratchLookAt.set(targetPos.x, targetPos.y + (isIndoors ? 0.35 : 0.45), targetPos.z);
    const lookLerpFactor = 1.0 - Math.exp(-16.0 * deltaTime);
    this.currentLookAt.lerp(rawLookTarget, Math.min(1.0, lookLerpFactor));
    this.camera.lookAt(this.currentLookAt);
  }

  private frameTick: number = 0;
  private lastFrameTimestamp: number = 0;

  private animate(now: number = performance.now()) {
    if (this.isDisposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);

    if (this.lastFrameTimestamp === 0) {
      this.lastFrameTimestamp = now;
      return;
    }

    const rawDelta = (now - this.lastFrameTimestamp) / 1000;
    this.lastFrameTimestamp = now;
    const frameDelta = Math.min(Math.max(rawDelta, 0.0001), GameEngine.MAX_FRAME_DELTA);

    this.frameTick++;
    this.flightRecorder.startFrame();

    // 1. Update Spark Particles & Hit Flash Light
    this.flightRecorder.startSection('sparks_lights');
    if (this.sparkPoints) {
      let activeSparks = false;
      const posAttr = this.sparkPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < GameEngine.MAX_SPARKS; i++) {
        if (this.sparkLifetimes[i] > 0) {
          this.sparkLifetimes[i] -= frameDelta;
          const pIdx = i * 3;
          this.sparkPositions[pIdx] += this.sparkVelocities[pIdx] * frameDelta;
          this.sparkPositions[pIdx + 1] += this.sparkVelocities[pIdx + 1] * frameDelta;
          this.sparkPositions[pIdx + 2] += this.sparkVelocities[pIdx + 2] * frameDelta;
          this.sparkVelocities[pIdx + 1] -= 12.0 * frameDelta; // Gravity on sparks
          activeSparks = true;
        }
      }
      if (activeSparks) posAttr.needsUpdate = true;
    }

    if (this.hitFlashLight.intensity > 0) {
      this.hitFlashLight.intensity = Math.max(0, this.hitFlashLight.intensity - frameDelta * 28.0);
    }
    this.flightRecorder.endSection('sparks_lights');

    // 2. Smooth Continuous Simulation Tick (No Artificial Freezes or Slow-Downs)
    const simDelta = frameDelta;

    // 3. Fixed-Timestep Physics Sub-stepping (60Hz deterministic simulation)
    this.flightRecorder.startSection('physics_kinematics');
    this.physicsAccumulator += simDelta;
    let substeps = 0;
    while (this.physicsAccumulator >= GameEngine.FIXED_TIMESTEP && substeps < GameEngine.MAX_PHYSICS_SUBSTEPS) {
      this.fixedPhysicsStep(GameEngine.FIXED_TIMESTEP);
      this.physicsAccumulator -= GameEngine.FIXED_TIMESTEP;
      substeps++;
    }

    // Clamp remainder if sub-step limit exceeded to prevent spiral of death
    if (substeps >= GameEngine.MAX_PHYSICS_SUBSTEPS) {
      this.physicsAccumulator = 0;
    }

    // 4. Motion Smoothing Remainder Interpolation (Silky render positions & rotations between physics ticks)
    const alpha = Math.min(1.0, Math.max(0.0, this.physicsAccumulator / GameEngine.FIXED_TIMESTEP));
    this.cat.mesh.position.lerpVectors(this.prevPhysicsPosition, this.physicsCatPosition, alpha);

    let headingDiff = this.physicsCatHeading - this.prevPhysicsHeading;
    headingDiff = Math.atan2(Math.sin(headingDiff), Math.cos(headingDiff));
    const renderYaw = this.prevPhysicsHeading + headingDiff * alpha;
    const renderBank = THREE.MathUtils.lerp(this.prevPhysicsBankAngle, this.physicsCatBankAngle, alpha);

    this.cat.mesh.rotation.set(0, renderYaw, renderBank);
    this.catHeading = renderYaw;
    this.catBankAngle = renderBank;
    this.flightRecorder.endSection('physics_kinematics');

    // 5. Turn Input & Feline Render Frame Animation (Updated once per frame with frameDelta)
    this.flightRecorder.startSection('cat_character_anim');
    let turnInput = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) turnInput += 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) turnInput -= 1;
    if (this.touchController.isTouching) {
      turnInput = -this.touchController.moveVector.x * 1.5;
    }
    this.cat.animate(frameDelta, this.currentCatSpeed, this.isGrounded, turnInput);
    this.flightRecorder.endSection('cat_character_anim');

    // 6. Touch Camera Drag Swipe Delta Consumption
    const camDelta = this.touchController.consumeCameraDelta();
    if (camDelta.x !== 0 || camDelta.y !== 0) {
      this.cameraYaw -= camDelta.x * 2.0;
      this.cameraPitch = Math.max(-0.25, Math.min(0.85, this.cameraPitch + camDelta.y * 1.5));
    }

    // 7. Update Camera, Hazards, Story Progression & Environment
    this.flightRecorder.startSection('camera_spring');
    this.updateCamera(frameDelta);
    this.flightRecorder.endSection('camera_spring');

    this.flightRecorder.startSection('hazards_story');
    this.updateRadiationAndHazards(frameDelta);
    this.updateStoryProgression(frameDelta);
    this.environment.update(frameDelta, this.cat.mesh.position, this.isDoubleTapSprint || this.isPouncing);

    // Update Stylized Pounce Trajectory Arc Visualizer
    const pounceCandidate = this.findBestPounceTarget();
    if (pounceCandidate && pounceCandidate.dist > 1.0 && pounceCandidate.dist <= 8.5 && this.isGrounded) {
      const catPos = this.cat.mesh.position;
      const targetPos = pounceCandidate.targetPos;
      const dx = targetPos.x - catPos.x;
      const dz = targetPos.z - catPos.z;
      const dist = Math.hypot(dx, dz);
      const flightTime = Math.max(0.25, dist / 11.5);
      const vy = (targetPos.y - catPos.y + 0.5 * 18.0 * flightTime * flightTime) / flightTime;
      const initVel = GameEngine.scratchPounce.set(dx / flightTime, vy, dz / flightTime);

      // Arc is GREEN ONLY when Alba is in range to pounce and catch the rat (dist <= 5.2m).
      // When aiming from further out (5.2m < dist <= 8.5m), the arc stays AMBER.
      const isGuaranteedCatchRange = (dist <= 5.2);

      this.trajectoryVisualizer.setVisible(true);
      this.trajectoryVisualizer.setTargetLock(isGuaranteedCatchRange);
      this.trajectoryVisualizer.updateTrajectory(catPos, initVel, 18.0, targetPos.y);
    } else {
      this.trajectoryVisualizer.setVisible(false);
      this.trajectoryVisualizer.setTargetLock(false);
    }
    this.flightRecorder.endSection('hazards_story');

    // 8. AI & Entity Updates — once per render frame (NOT inside physics substeps)
    this.flightRecorder.startSection('rats_ai');
    this.updateRatsAndHunting(frameDelta);
    this.flightRecorder.endSection('rats_ai');

    this.flightRecorder.startSection('mutants_ai');
    this.updateFloodingSimulation(frameDelta);
    this.updateMutantsAndColony(frameDelta);
    this.flightRecorder.endSection('mutants_ai');

    // 9. Distance-Based Dynamic Occlusion & Skeletal LOD Culling
    this.flightRecorder.startSection('lod_culling');
    this.performDistanceLOD();
    this.flightRecorder.endSection('lod_culling');

    // 10. Real-Time Tactical Minimap & Radar (Throttled to ~10 FPS with preallocated pool)
    this.flightRecorder.startSection('prompts_minimap');
    if (this.frameTick % 6 === 0) {
      this.updateMinimap();
    }

    // 11. Dynamic Floating Contextual HUD Prompts (Throttled to 10 FPS / every 6th frame to eliminate DOM overhead)
    if (this.frameTick % 6 === 0) {
      this.updateContextualPrompts();
    }
    this.flightRecorder.endSection('prompts_minimap');

    // 12. WebGL Rendering
    this.flightRecorder.startSection('webgl_render');
    this.renderer.render(this.scene, this.camera);
    this.flightRecorder.endSection('webgl_render');

    this.flightRecorder.endFrame(this.cat ? this.cat.mesh.position : undefined, this.cat?.currentActionName || 'stand');

    this.onFrameUpdate?.();
  }

  private performDistanceLOD() {
    const catPos = this.cat.mesh.position;
    const maxActiveDistanceSq = 60 * 60; // 60-meter near-focus culling radius

    // 1. Cull far vermin
    for (let i = 0; i < this.rats.length; i++) {
      const rat = this.rats[i];
      if (rat.state === 'CAUGHT') {
        rat.mesh.visible = false;
      } else {
        const dSq = rat.mesh.position.distanceToSquared(catPos);
        rat.mesh.visible = dSq < maxActiveDistanceSq;
      }
    }

    // 2. Cull far mutant cats
    for (let i = 0; i < this.mutantCats.length; i++) {
      const mutant = this.mutantCats[i];
      const dSq = mutant.mesh.position.distanceToSquared(catPos);
      mutant.mesh.visible = dSq < maxActiveDistanceSq;
    }

    // 3. Cull far shipbuilders
    for (let i = 0; i < this.shipbuilders.length; i++) {
      const builder = this.shipbuilders[i];
      const dSq = builder.mesh.position.distanceToSquared(catPos);
      builder.mesh.visible = dSq < maxActiveDistanceSq;
    }
  }

  private addMinimapEntity(count: number, pos: THREE.Vector3, type: MinimapEntity['type'], label?: string): number {
    const pool = this.minimapEntityPool;
    if (count < pool.length) {
      pool[count].pos = pos;
      pool[count].type = type;
      pool[count].label = label;
    } else {
      pool.push({ pos, type, label });
    }
    return count + 1;
  }

  private updateMinimap() {
    let count = 0;

    // Add Rats
    for (let i = 0; i < this.rats.length; i++) {
      const rat = this.rats[i];
      if (rat.state !== 'CAUGHT') {
        count = this.addMinimapEntity(count, rat.mesh.position, rat.isKingpin ? 'KINGPIN' : 'RAT');
      }
    }

    // Add Mutants
    for (let i = 0; i < this.mutantCats.length; i++) {
      const m = this.mutantCats[i];
      if (!m.isDefeated) {
        count = this.addMinimapEntity(count, m.mesh.position, 'MUTANT');
      }
    }

    // Add Colony Friendly Cats
    for (let i = 0; i < this.colonyNPCs.length; i++) {
      count = this.addMinimapEntity(count, this.colonyNPCs[i].mesh.position, 'COLONY');
    }

    // Add Active Objective Waypoint Beacon
    const waypoint = this.missionManager.getActiveWaypoint();
    if (waypoint) {
      this.environment.setBeaconPosition(waypoint.x, waypoint.y, waypoint.z);
      count = this.addMinimapEntity(count, GameEngine.waypointScratch.set(waypoint.x, waypoint.y, waypoint.z), 'OBJECTIVE', waypoint.label);
    }

    this.minimapSystem.update(this.cat.mesh.position, this.catHeading, this.minimapEntityPool, count);
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  }

  /**
   * Cleanly dispose of all WebGL renderer, textures, materials, and scene graphs
   */
  public dispose(): void {
    this.isDisposed = true;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Remove window event listeners
    if (this.onKeyDownBound) window.removeEventListener('keydown', this.onKeyDownBound);
    if (this.onKeyUpBound) window.removeEventListener('keyup', this.onKeyUpBound);
    if (this.onMouseDownBound) window.removeEventListener('mousedown', this.onMouseDownBound);
    if (this.onMouseMoveBound) window.removeEventListener('mousemove', this.onMouseMoveBound);
    if (this.onMouseUpBound) window.removeEventListener('mouseup', this.onMouseUpBound);
    if (this.onContextMenuBound) window.removeEventListener('contextmenu', this.onContextMenuBound);
    if (this.onResizeBound) window.removeEventListener('resize', this.onResizeBound);

    this.touchController.dispose();
    this.minimapSystem.dispose();
    this.environment.dispose();
    TextureGenerator.disposeAll();

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.InstancedMesh).isInstancedMesh || (obj as THREE.Points).isPoints) {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
    });

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
