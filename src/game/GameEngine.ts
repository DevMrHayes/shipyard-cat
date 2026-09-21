import { TextureGenerator } from '../core/TextureGenerator';
import { ModelManager } from '../core/ModelManager';
import { EngineFlightRecorder, FreezeIncident } from '../core/EngineFlightRecorder';
import * as THREE from 'three';
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
import { GameEventBus, gameEventBus } from '../core/events/GameEventBus';
import { PhysicsSubsystem, PhysicsInputState } from '../physics/PhysicsSubsystem';
import { RenderSubsystem } from '../render/RenderSubsystem';

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
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  
  // Decoupled Subsystems
  public readonly eventBus: GameEventBus;
  public readonly physics: PhysicsSubsystem;
  public readonly renderSystem: RenderSubsystem;

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
  public hitStopTimer: number = 0;

  // Input state scratch object for PhysicsSubsystem (Zero GC)
  private physicsInput: PhysicsInputState = {
    driveInput: 0,
    turnInput: 0,
    isSprinting: false,
    isCrouching: false,
    isMoving: false,
    jumpRequested: false
  };

  private isDraggingMouse: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  // Bound window event listener references for complete teardown
  private onKeyDownBound?: (e: KeyboardEvent) => void;
  private onKeyUpBound?: (e: KeyboardEvent) => void;
  private onMouseDownBound?: (e: MouseEvent) => void;
  private onMouseMoveBound?: (e: MouseEvent) => void;
  private onMouseUpBound?: () => void;
  private onContextMenuBound?: (e: MouseEvent) => void;
  private onResizeBound?: () => void;
  private animationFrameId: number | null = null;

  // Static Preallocated Scratch Objects (Zero GC in Hot Animation / Physics Loop)
  private static readonly scratchForward = new THREE.Vector3();
  private static readonly scratchPounce = new THREE.Vector3();
  private static readonly scratchRatPrevPos = new THREE.Vector3();
  private static readonly DOROTHY_PROXIMITY_TARGET = new THREE.Vector3(-20, 2, -25);
  private static readonly CAT_MOTEL_PROXIMITY_TARGET = new THREE.Vector3(-55, 0, -65);
  private static readonly SUB_TARGET_POS = new THREE.Vector3(-30, 0, 45);
  private static readonly SCRAP_TARGET_POS = new THREE.Vector3(38, 0, -52);
  private static readonly VAULT_TARGET_POS = new THREE.Vector3(45, 0, -60);
  private static readonly waypointScratch = new THREE.Vector3();
  private static readonly interpolatedCatPos = new THREE.Vector3();
  private static readonly bestPounceCandidate: PounceTargetCandidate = {
    targetPos: new THREE.Vector3(),
    entity: null as any,
    type: 'RAT',
    name: '',
    dist: 0
  };

  // Reusable Minimap and Prompt Pools to Eliminate Allocation Spikes
  private minimapEntityPool: MinimapEntity[] = [];
  private contextualPromptsPool: ContextualPrompt[] = [];
  private activePromptsList: ContextualPrompt[] = [];

  // Backward-compatible Event callbacks for UI
  public onVitalsUpdate?: (vitals: CatVitals, radiation: number) => void;
  public onAssistanceTriggered?: (event: ShipbuildingAssistEvent) => void;
  public onMissionObjectiveUpdated?: () => void;
  public onNotification?: (title: string, message: string, type: 'info' | 'success' | 'warn') => void;
  public onContextualPromptsUpdate?: (prompts: ContextualPrompt[]) => void;
  public onFrameUpdate?: () => void;

  // Forwarding getters and setters for backwards compatibility
  public get isGrounded(): boolean {
    return this.physics.isGrounded;
  }
  public set isGrounded(val: boolean) {
    this.physics.isGrounded = val;
  }

  public get currentCatSpeed(): number {
    return this.physics.currentSpeed;
  }
  public set currentCatSpeed(val: number) {
    this.physics.currentSpeed = val;
  }

  public get catHeading(): number {
    return this.physics.heading;
  }
  public set catHeading(val: number) {
    this.physics.heading = val;
    this.physics.prevHeading = val;
  }

  public get catBankAngle(): number {
    return this.physics.bankAngle;
  }
  public set catBankAngle(val: number) {
    this.physics.bankAngle = val;
    this.physics.prevBankAngle = val;
  }

  public get cameraShakeIntensity(): number {
    return this.renderSystem.cameraShakeIntensity;
  }
  public set cameraShakeIntensity(val: number) {
    this.renderSystem.cameraShakeIntensity = val;
  }

  constructor(container: HTMLElement) {
    this.container = container;
    this.timer = new Timer();
    this.eventBus = gameEventBus;

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
      this.eventBus.emit('engine:freezeDetected', incident);
    });
    soundEngine.onAudioEvent = (evt) => {
      this.flightRecorder.logAudioEvent(evt);
    };

    // 2. Initialize Three.js Scene & RenderSubsystem
    this.scene = new THREE.Scene();
    this.renderSystem = new RenderSubsystem(this.container, this.scene);
    this.camera = this.renderSystem.camera;
    this.renderer = this.renderSystem.renderer;

    // 3. Initialize PhysicsSubsystem
    this.physics = new PhysicsSubsystem(new THREE.Vector3(-10.0, 0, -20.0), 0);
    this.setupPhysicsEvents();

    // 4. Build Environment & Characters
    this.environment = new ShipyardEnvironment();
    this.scene.add(this.environment.group);

    this.trajectoryVisualizer = new PounceTrajectoryVisualizer();
    this.scene.add(this.trajectoryVisualizer.group);

    this.cat = new CatCharacter();
    this.cat.mesh.position.set(-10.0, 0, -20.0);
    this.cat.mesh.rotation.set(0, 0, 0);
    
    // Alba's Feline Vision / Personal Worksite Light
    const catAuraLight = new THREE.PointLight(0xffedd5, 2.2, 25);
    catAuraLight.position.set(0, 1.5, 0);
    this.cat.mesh.add(catAuraLight);

    this.scene.add(this.cat.mesh);

    // 5. Spawn Entities: Rats, Colony NPCs, and Mutant Cats
    this.spawnRats();
    this.spawnColonyNPCs();
    this.spawnShipbuilders();
    this.spawnMutantCats();

    // 6. Pre-Warm All Shaders & Compile Scene Graph Ahead of Time
    if (this.renderer && typeof this.renderer.compile === 'function') {
      this.renderer.compile(this.scene, this.camera);
    }

    // 7. Connect Event Listeners & Input Handlers
    this.setupInput();
    this.setupAssistanceListeners();
    this.setupRenderEvents();

    this.onResizeBound = this.onResize.bind(this);
    window.addEventListener('resize', this.onResizeBound);

    // 8. Bind Animation Loop
    this.animate = this.animate.bind(this);
  }

  private setupPhysicsEvents(): void {
    this.physics.events.onNotification = (title, message, type) => {
      this.showNotification(title, message, type);
    };

    this.physics.events.onEnterDryDock1 = () => {
      const mission = this.missionManager.getCurrentMission();
      if (mission.id === 1 && !mission.objectives[1].isCompleted) {
        this.missionManager.completeObjective('climb_dorothy');
        soundEngine.playSuccess();
        this.showNotification('OBJECTIVE COMPLETE!', 'You climbed down into Historic Dry Dock 1! Track down the Dockyard Kingpin.', 'success');
        this.onMissionObjectiveUpdated?.();
        this.eventBus.emit('mission:objectiveUpdated', undefined);
      }
    };

    this.physics.events.onJumpPallet = () => {
      if (this.missionManager.getCurrentMission().id === 2) {
        this.missionManager.updateCountObjective('jump_pallets', 1);
        this.onMissionObjectiveUpdated?.();
        this.eventBus.emit('mission:objectiveUpdated', undefined);
      }
    };
  }

  private setupRenderEvents(): void {
    this.renderSystem.events.onLocationChange = (location, isIndoors) => {
      this.showNotification(`Entering: ${location}`, isIndoors ? 'Indoor stealth area active. Clustered machinery & conduits overhead.' : 'Open shipyard staging yard.', 'info');
      this.eventBus.emit('location:change', { location, isIndoors });
    };
  }

  private showNotification(title: string, message: string, type: 'info' | 'success' | 'warn' = 'info'): void {
    this.onNotification?.(title, message, type);
    this.eventBus.emit('ui:notification', { title, message, type });
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
    // 3. Compile scene graph
    onProgress?.(90, 'Pre-Warming GPU Shader Pipeline & Linking Driver Programs...');
    this.cat.prewarmAnimations();
    this.rats.forEach((r) => r.prewarmAnimations());
    this.mutantCats.forEach((m) => m.prewarmAnimations());

    // 4. Force-activate ALL visibility and disable frustum culling across entire scene hierarchy
    const originalVisibilityStates = new Map<THREE.Object3D, boolean>();
    const originalCullingStates = new Map<THREE.Object3D, boolean>();

    this.scene.traverse((obj) => {
      originalVisibilityStates.set(obj, obj.visible);
      obj.visible = true;
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine || (obj as THREE.Points).isPoints || (obj as THREE.InstancedMesh).isInstancedMesh) {
        originalCullingStates.set(obj, obj.frustumCulled);
        obj.frustumCulled = false;
      }
    });

    // Explicitly toggle trajectory visualizer in both amber and locked green modes
    this.trajectoryVisualizer.setVisible(true);
    this.trajectoryVisualizer.setTargetLock(false);
    this.trajectoryVisualizer.updateTrajectory(this.physics.position, new THREE.Vector3(0, 5, 5), 18.0, 0);

    // Warm up all character entities, thermal auras, scent particles, lights
    this.rats.forEach((r) => {
      r.mesh.visible = true;
      r.thermalAura.visible = true;
      r.scentTrailParticles.visible = true;
      r.thermalLight.intensity = 1.0;
    });
    this.mutantCats.forEach((m) => {
      m.mesh.visible = true;
      m.radioactiveAura.visible = true;
      m.eyeLight.intensity = 1.0;
    });
    this.shipbuilders.forEach((s) => {
      s.mesh.visible = true;
    });

    // Ensure particle system has active points
    this.renderSystem.triggerImpactFeedback(this.physics.position, true);
    this.renderSystem.hitFlashLight.intensity = 5.0;

    // Enable shadow maps and force shadow update
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.needsUpdate = true;

    const originalFov = this.camera.fov;
    this.camera.fov = 135;
    this.camera.updateProjectionMatrix();

    // Compile entire scene graph
    if (this.renderer && typeof this.renderer.compile === 'function') {
      this.renderer.compile(this.scene, this.camera);
    }

    // 5. Run Warmup Render Passes across all 7 major shipyard zones, elevations, and 360-degree orientations
    try {
      const tempCamPos = this.camera.position.clone();
      const zonePositions = [
        new THREE.Vector3(-10, 2, -20),  // South Yard & Dorothy Tugboat
        new THREE.Vector3(-45, 2, -30),  // Machine Shop Interior & Mezzanine
        new THREE.Vector3(-45, 5, -20),  // Machine Shop High Catwalk
        new THREE.Vector3(25, 1, -25),   // Historic Dry Dock 1 & Sunken Basin
        new THREE.Vector3(20, 15, 35),   // Big Blue Gantry & Dry Dock 12
        new THREE.Vector3(20, 1, 35),    // Dry Dock 12 Basin Floor
        new THREE.Vector3(-30, 2, 45),   // Submarine MOF Outfitting
        new THREE.Vector3(52, 2, 10),    // East Pier Boardwalk & James River
        new THREE.Vector3(45, 2, -60)    // RCOH Radiation Vault
      ];

      // Pass A: Normal maritime dusk lighting & shadow cascades
      for (const zonePos of zonePositions) {
        this.camera.position.copy(zonePos);
        const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
        for (const ang of angles) {
          this.camera.lookAt(zonePos.x + Math.sin(ang) * 30, zonePos.y, zonePos.z + Math.cos(ang) * 30);
          this.renderer.shadowMap.needsUpdate = true;
          this.renderer.render(this.scene, this.camera);
        }
      }

      // Pass B: Target Lock Green Trajectory variant
      this.trajectoryVisualizer.setTargetLock(true);
      this.renderer.render(this.scene, this.camera);

      // Pass C: Sonar Whiskers Blueprint mode across all zones
      this.renderSystem.setWhiskersMode(this.scene, true);
      for (let i = 0; i < this.rats.length; i++) this.rats[i].setWhiskersMode(true);
      for (let i = 0; i < this.mutantCats.length; i++) this.mutantCats[i].setWhiskersAura(true, true);
      this.environment.setWhiskersMode(true);

      if (typeof this.renderer.compile === 'function') {
        this.renderer.compile(this.scene, this.camera);
      }
      for (const zonePos of zonePositions) {
        this.camera.position.copy(zonePos);
        const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
        for (const ang of angles) {
          this.camera.lookAt(zonePos.x + Math.sin(ang) * 30, zonePos.y, zonePos.z + Math.cos(ang) * 30);
          this.renderer.render(this.scene, this.camera);
        }
      }

      // Restore normal environment & camera to Alba
      this.renderSystem.setWhiskersMode(this.scene, false);
      for (let i = 0; i < this.rats.length; i++) this.rats[i].setWhiskersMode(false);
      for (let i = 0; i < this.mutantCats.length; i++) this.mutantCats[i].setWhiskersAura(false, false);
      this.environment.setWhiskersMode(false);

      this.renderSystem.hitFlashLight.intensity = 0.0;
      this.camera.fov = originalFov;
      this.camera.updateProjectionMatrix();

      // Restore original visibility & frustum culling states
      this.scene.traverse((obj) => {
        const origVis = originalVisibilityStates.get(obj);
        if (origVis !== undefined) {
          obj.visible = origVis;
        }
        const origCull = originalCullingStates.get(obj);
        if (origCull !== undefined) {
          obj.frustumCulled = origCull;
        }
      });

      this.trajectoryVisualizer.setVisible(false);
      this.trajectoryVisualizer.setTargetLock(false);

      this.camera.position.copy(tempCamPos);
      this.camera.lookAt(this.physics.position.x, this.physics.position.y + 0.4, this.physics.position.z);

      const totalPrograms = this.renderer.info?.programs?.length ?? 0;
      console.log(`🚀 [PRE-WARM] WebGL Pipeline Ready: ${totalPrograms} compiled shader programs linked to GPU driver ahead of gameplay.`);
    } catch (e) {
      console.warn('Pre-warm render note:', e);
    }

    onProgress?.(100, 'Ready to Patrol the Yard!');
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

    // Dockyard Kingpin in Dry Dock 1 (X: 28, Y: -2.0, Z: -27.5)
    const kingpin = new RatEntity(new THREE.Vector3(28, -2.0, -27.5), true);
    this.rats.push(kingpin);
    this.scene.add(kingpin.mesh);
    this.scene.add(kingpin.scentTrailParticles);
  }

  private spawnColonyNPCs() {
    // 1. Dr. Elena Vance
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

    // 2. Calico Belle
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

    // 3. Tripod Toby
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
    // 1. Mo Kelly (Welder, Dept. 11)
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

    // Sarah Jenkins (Welder)
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

    // 2. Frank 'Sarge' Miller (Rigger)
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

    // 3. Dave O'Connor (Nuclear Pipefitter)
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

      // Double-Tap Forward to Sprint (W or Up Arrow)
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
          this.showNotification('Silent Stalker Mode (Active)', 'Low crouch stalking engaged. Movement is slow and silent.', 'info');
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
          this.executePawSwipe();
        } else if (e.button === 2) {
          this.executePounce();
        }
      }
    };

    this.onMouseMoveBound = (e: MouseEvent) => {
      if (this.isDraggingMouse) {
        const deltaX = e.clientX - this.lastMouseX;
        this.physics.heading -= deltaX * 0.005;
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

    // Virtual Touch Controller Action Hooks
    this.touchController.onPounce = () => this.executePounce();
    this.touchController.onAttack = () => this.executePawSwipe();
    this.touchController.onWhiskers = () => this.toggleWhiskersMode();
    this.touchController.onMeow = () => this.handleInteractOrMeow();
  }

  public handleInteractOrMeow() {
    const catPos = this.cat.mesh.position;
    let interacted = false;

    // 1. Check food bowls
    for (const bowl of this.environment.foodBowls) {
      const dist = bowl.position.distanceTo(catPos);
      if (dist < 2.8) {
        this.vitals.feed(35);
        this.vitals.currentHealth = Math.min(this.vitals.maxHealth, this.vitals.currentHealth + 20);
        soundEngine.playEatSnack();
        soundEngine.playPurr();
        this.cat.triggerEat();
        this.showNotification('🥣 Snack Ration Consumed!', `Alba enjoyed a bowl of ${bowl.name}! Hunger and health refilled.`, 'success');
        interacted = true;
        break;
      }
    }

    // 2. Check Colony NPCs
    if (!interacted) {
      for (const npc of this.colonyNPCs) {
        const dist = npc.mesh.position.distanceTo(catPos);
        if (dist < 4.0) {
          const dialogue = npc.getNextDialogue();
          soundEngine.playMeow();
          this.showNotification(
            `💬 ${dialogue.speaker} (${dialogue.role})`,
            dialogue.text,
            'info'
          );

          if (dialogue.actionReward) {
            if (dialogue.actionReward.type === 'HEAL') {
              this.vitals.feed(40);
              this.showNotification('Sanctuary Healing', 'Health & hunger fully replenished by Dr. Vance!', 'success');
            } else if (dialogue.actionReward.type === 'XP') {
              this.progression.addXP(dialogue.actionReward.amount);
            }
          }
          interacted = true;
          break;
        }
      }
    }

    // 3. Check Active Shipbuilders
    if (!interacted) {
      for (const builder of this.shipbuilders) {
        const dist = builder.mesh.position.distanceTo(catPos);
        if (dist < 4.5) {
          const dialogue = builder.getNextDialogue();
          soundEngine.playMeow();
          this.showNotification(
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
      this.showNotification('Alba Purrs', 'Meow! Attracting curious shipbuilders & alerting nearby prey.', 'info');
    }
  }

  // Trigger Impact Feedback (Camera Shake, Impact Sparks Burst, Flash Light, and Audio)
  public triggerHitFeedback(pos: THREE.Vector3, isHeavy: boolean = false) {
    this.hitStopTimer = 0;
    this.renderSystem.triggerImpactFeedback(pos, isHeavy);
    soundEngine.playHitImpact(isHeavy);
    soundEngine.playClawSlice();
    this.eventBus.emit('combat:hit', { position: pos, isHeavy });
  }

  // Find Best Locked Target in Frontal Predatory Cone for Precision Pounce Leap
  public findBestPounceTarget(): PounceTargetCandidate | null {
    const catPos = this.cat.mesh.position;
    const catForward = GameEngine.scratchForward.set(Math.sin(this.physics.heading), 0, Math.cos(this.physics.heading));
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
      if (dot < 0.25) continue;

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
    if (now - this.lastAttackTime < 240) return;
    this.lastAttackTime = now;

    this.comboStep = (this.comboStep % this.progression.maxComboHits) + 1;

    if (this.comboStep === 3) {
      soundEngine.playClawCombo();
      this.showNotification('CLAW FLURRY COMBO (Hit 3/3)', 'Critical claw bite strike executed!', 'warn');
    } else {
      soundEngine.playPawSwipe();
    }

    this.cat.legs.fl.rotation.x = 0.9;
    this.cat.legs.fr.rotation.x = -0.9;
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
          this.showNotification('Swipe KO!', `Struck down ${rat.name} with a claw combo!`, 'success');
          this.missionManager.updateCountObjective('hunt_mice', 1);
          this.onMissionObjectiveUpdated?.();
          this.eventBus.emit('mission:objectiveUpdated', undefined);
          this.eventBus.emit('combat:strikeKO', { victimName: rat.name, xpEarned: rat.nutritionValue * 3, isBoss: rat.isKingpin });
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
            this.showNotification('MUTANT INSURGENT DEFEATED!', `You knocked out ${mutant.name}! Gantry's hold on the yard weakens.`, 'success');
            this.progression.addXP(80);
            this.missionManager.updateCountObjective('defeat_mutants', 1);
            this.onMissionObjectiveUpdated?.();
            this.eventBus.emit('mission:objectiveUpdated', undefined);
            this.eventBus.emit('combat:strikeKO', { victimName: mutant.name, xpEarned: 80, isBoss: false });
          } else {
            this.showNotification('Claw Hit!', `Dealt ${damage.toFixed(0)} damage to ${mutant.name} (${mutant.health}/${mutant.maxHealth} HP).`, 'info');
          }
        }
      }
    }
  }

  // Combat: 360-Degree Tail Sweep Spin
  public executeTailSweep() {
    if (!this.progression.hasTailSweep) {
      this.showNotification('Ability Locked', 'Unlock "Tail Sweep Stun" in Abilities to use this move.', 'warn');
      return;
    }

    soundEngine.playTailSweep();
    this.cat.triggerTailSweep();
    this.showNotification('TAIL SWEEP!', 'Spun 360° knocking back surrounding enemies!', 'info');

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
      this.eventBus.emit('assistance:trigger', event);
      
      const leveledUp = this.progression.addXP(event.rewardXP);
      if (leveledUp) {
        this.showNotification(
          `⭐ LEVEL UP! (Level ${this.progression.level})`,
          `Rank: ${this.progression.rankTitle}. You earned +1 Skill Point! Visit Abilities to unlock perks.`,
          'success'
        );
      }

      this.showNotification(
        `UNINTENTIONAL ASSISTANCE: ${event.title}`,
        `${event.description} (+${event.rewardXP} XP)`,
        'success'
      );
    });
  }

  public toggleWhiskersMode(): boolean {
    if (!this.renderSystem.isWhiskersMode && !this.vitals.canUseWhiskers()) {
      this.showNotification('Exhausted!', 'Stamina too low to focus Whiskers Vision. Catch your breath!', 'warn');
      return false;
    }

    const nextMode = !this.renderSystem.isWhiskersMode;
    this.renderSystem.setWhiskersMode(this.scene, nextMode);
    soundEngine.playWhiskersPing();

    if (nextMode) {
      let modeDesc = 'Thermal prey signatures highlighted (Drains Stamina).';
      if (this.progression.whiskersTier >= 1) modeDesc += ' Scent footprint trails visible.';
      if (this.progression.whiskersTier >= 2) modeDesc += ' Radioactive mutant cats glowing violet.';
      if (this.progression.whiskersTier >= 3) modeDesc += ' Structural & Geiger conduit vision active.';

      this.showNotification('Whiskers Vision Active', modeDesc, 'info');
    }

    // Toggle visual cues on entities
    for (let i = 0; i < this.rats.length; i++) {
      this.rats[i].setWhiskersMode(nextMode);
    }
    for (let i = 0; i < this.mutantCats.length; i++) {
      this.mutantCats[i].setWhiskersAura(nextMode, this.progression.whiskersTier >= 2);
    }
    this.environment.setWhiskersMode(nextMode);
    this.eventBus.emit('whiskers:toggle', { active: nextMode });

    return nextMode;
  }

  // Trajectory-Locked Predatory Pounce Leap
  public executePounce() {
    const lockedTarget = this.findBestPounceTarget();
    const success = this.physics.executePounce(lockedTarget, this.vitals);
    if (success) {
      this.cat.isPouncing = true;
    }
  }

  private onMutantAttack = (damage: number) => {
    this.vitals.takeHazardDamage(damage / 100);
    soundEngine.playCatHiss();
    this.showNotification('MUTANT ATTACK!', 'A mutant insurgent swiped at Alba! Health reduced.', 'warn');
  };

  private resolveEnvCollision = (pos: THREE.Vector3, rad: number, prevPos?: THREE.Vector3) => this.environment.resolveCollision(pos, rad, prevPos);

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

    for (let i = 0; i < this.colonyNPCs.length; i++) {
      this.colonyNPCs[i].update(deltaTime);
    }

    for (let i = 0; i < this.shipbuilders.length; i++) {
      this.shipbuilders[i].animate(deltaTime);
    }
  }

  private updateFloodingSimulation(deltaTime: number) {
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
        const catchThreshold = rat.isKingpin ? 2.8 : (this.physics.isPouncing ? 2.4 : 1.3);

        if (dist < catchThreshold && (this.physics.isPouncing || dist < 1.3)) {
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
              this.cat.triggerEat();
              soundEngine.playSuccess();
              this.vitals.feed(100);
              this.vitals.currentStamina = this.vitals.maxStamina;
              this.vitals.currentHealth = this.vitals.maxHealth;
              this.progression.skillPoints += 1;
              this.progression.addXP(150);

              this.showNotification('👑 KINGPIN DEFEATED!', 'You defeated the Dockyard Kingpin! +1 Skill Point awarded & Vitals fully restored!', 'success');
              this.missionManager.completeObjective('hunt_kingpin');
              this.assistanceEngine.triggerAssist('DOROTHY_CAPSTAN_UNJAM');
            } else {
              this.showNotification('Boss Hit!', `Dockyard Kingpin stunned! (${rat.health}/${rat.maxHealth} HP remaining)`, 'warn');
            }
          } else {
            rat.state = 'CAUGHT';
            rat.mesh.visible = false;
            rat.scentTrailParticles.visible = false;
            this.cat.triggerEat();
            soundEngine.playRatCatch();
            this.vitals.feed(rat.nutritionValue);
            this.vitals.currentStamina = Math.min(this.vitals.maxStamina, this.vitals.currentStamina + 35);

            const xpEarned = rat.nutritionValue * 3;
            const leveledUp = this.progression.addXP(xpEarned);
            if (leveledUp) {
              this.showNotification(
                `⭐ LEVEL UP! (Level ${this.progression.level})`,
                `Rank: ${this.progression.rankTitle}. Unlocked +1 Skill Point! Check Abilities to upgrade Alba.`,
                'success'
              );
            }

            this.showNotification('Prey Caught!', `Caught a ${rat.name}! +${xpEarned} XP (+${rat.nutritionValue} Hunger refilled).`, 'info');
            this.missionManager.updateCountObjective('hunt_mice', 1);
          }
          this.onMissionObjectiveUpdated?.();
          this.eventBus.emit('mission:objectiveUpdated', undefined);
        }
      }
    }
    this.flightRecorder.setNearestRatDistance(minRatDist);
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
    if (!this.onContextualPromptsUpdate && this.eventBus.getListenerCount('ui:contextualPrompts') === 0) return;
    const catPos = this.cat.mesh.position;
    let count = 0;

    // 1. Check Colony NPCs (< 4.2m)
    for (let i = 0; i < this.colonyNPCs.length; i++) {
      const npc = this.colonyNPCs[i];
      const dist = npc.mesh.position.distanceTo(catPos);
      if (dist < 4.2) {
        const proj = this.renderSystem.projectPoint(npc.mesh.position, 0.75);
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
        const proj = this.renderSystem.projectPoint(b.mesh.position, 1.8);
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
        const proj = this.renderSystem.projectPoint(bowl.position, 0.35);
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
    if (pounceCandidate && pounceCandidate.dist > 1.2 && pounceCandidate.dist < 8.0 && this.physics.isGrounded) {
      const proj = this.renderSystem.projectPoint(pounceCandidate.targetPos, pounceCandidate.type === 'RAT' ? 0.4 : 0.7);
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

    this.activePromptsList.length = count;
    for (let pIdx = 0; pIdx < count; pIdx++) {
      this.activePromptsList[pIdx] = this.contextualPromptsPool[pIdx];
    }
    this.onContextualPromptsUpdate?.(this.activePromptsList);
    this.eventBus.emit('ui:contextualPrompts', this.activePromptsList);
  }

  private currentRadDose: number = 0;

  private updateRadiationAndHazards(deltaTime: number = 0.016) {
    const radData = this.radiationSystem.calculateRadiationAtPoint(this.cat.mesh.position);
    this.currentRadDose = radData.totalDose;
    soundEngine.updateRadiationLevel(radData.totalDose, deltaTime);
    this.cat.updateDosimeterRadiation(radData.totalDose);

    if (radData.totalDose > 4.0) {
      this.vitals.takeHazardDamage(0.04);
      if (this.missionManager.getCurrentMission().id === 4) {
        this.missionManager.completeObjective('activate_whiskers');
        this.onMissionObjectiveUpdated?.();
        this.eventBus.emit('mission:objectiveUpdated', undefined);
      }
    }

    const distToMotel = this.cat.mesh.position.distanceTo(GameEngine.CAT_MOTEL_PROXIMITY_TARGET);
    if (distToMotel < 8.0) {
      this.vitals.healAtSanctuary();
    }

    this.onVitalsUpdate?.(this.vitals, radData.totalDose);
    this.eventBus.emit('vitals:update', { vitals: this.vitals, radiation: radData.totalDose });
    this.eventBus.emit('hazard:radiation', { dose: radData.totalDose, position: this.cat.mesh.position });
  }

  private updateStoryProgression(deltaTime: number) {
    const mission = this.missionManager.getCurrentMission();
    const catPos = this.cat.mesh.position;

    // Mission 1
    if (mission.id === 1) {
      if (catPos.x >= 15.0 && catPos.x <= 44.0 && catPos.z >= -35.0 && catPos.z <= -20.0 && catPos.y <= -1.0) {
        if (!mission.objectives[1].isCompleted) {
          this.missionManager.completeObjective('climb_dorothy');
          soundEngine.playSuccess();
          this.showNotification('OBJECTIVE COMPLETE!', "You entered Historic Dry Dock 1! Defeat the Dockyard Kingpin.", 'success');
          this.onMissionObjectiveUpdated?.();
          this.eventBus.emit('mission:objectiveUpdated', undefined);
        }
      }
    }

    // Mission 2
    else if (mission.id === 2) {
      if (!mission.objectives[0].isCompleted) {
        if (catPos.z >= 12.0 && catPos.x >= 3.0 && catPos.x <= 38.0) {
          this.missionManager.completeObjective('reach_drydock');
          soundEngine.playCatHiss();
          this.isFloodingActive = true;
          this.showNotification('⚠️ EMERGENCY SLUICE BREACH!', "River water is flooding Dry Dock 12! Leap across floating pallets [Space/F]!", 'warn');
          this.onMissionObjectiveUpdated?.();
          this.eventBus.emit('mission:objectiveUpdated', undefined);
        }
      }
      if (!mission.objectives[2].isCompleted) {
        if (catPos.x >= 26.0 && catPos.z >= 38.0 && catPos.y >= 3.0) {
          this.missionManager.completeObjective('escape_flood');
          soundEngine.playSuccess();
          this.assistanceEngine.triggerAssist('CRANE_SAFETY_TRIP');
          this.showNotification('🎉 BASIN FLOOD ESCAPED!', "Alba reached the high gantry catwalk safely! Unlocked Mission 3.", 'success');
          this.onMissionObjectiveUpdated?.();
          this.eventBus.emit('mission:objectiveUpdated', undefined);
        }
      }
    }

    // Mission 3
    else if (mission.id === 3) {
      if (!mission.objectives[1].isCompleted && this.renderSystem.isWhiskersMode) {
        const distToSub = catPos.distanceTo(GameEngine.SUB_TARGET_POS);
        if (distToSub < 25.0) {
          this.missionManager.completeObjective('identify_radioactivity');
          soundEngine.playSuccess();
          this.showNotification('📡 RADIOACTIVE TRAIL IDENTIFIED!', "Whiskers Vision reveals gamma isotope tracks leading to the scrap yard!", 'info');
          this.onMissionObjectiveUpdated?.();
          this.eventBus.emit('mission:objectiveUpdated', undefined);
        }
      }

      if (!mission.objectives[2].isCompleted) {
        const distToScrap = catPos.distanceTo(GameEngine.SCRAP_TARGET_POS);
        if (distToScrap < 14.0) {
          this.missionManager.completeObjective('confront_gantry');
          soundEngine.playSuccess();
          this.assistanceEngine.triggerAssist('CONDUIT_PULL_STRING');
          this.showNotification('⭐ SCRAP YARD SECURED!', "You repelled Gantry's vanguard and saved the submarine wire harness!", 'success');
          this.onMissionObjectiveUpdated?.();
          this.eventBus.emit('mission:objectiveUpdated', undefined);
        }
      }
    }

    // Mission 4
    else if (mission.id === 4) {
      const distToVault = catPos.distanceTo(GameEngine.VAULT_TARGET_POS);
      if (distToVault < 12.0 && this.renderSystem.isWhiskersMode) {
        this.missionManager.completeObjective('activate_whiskers');
        this.onMissionObjectiveUpdated?.();
        this.eventBus.emit('mission:objectiveUpdated', undefined);
      }
    }
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
    const frameDelta = Math.min(Math.max(rawDelta, 0.0001), PhysicsSubsystem.MAX_FRAME_DELTA);

    this.frameTick++;
    this.flightRecorder.startFrame();

    // 1. Update Spark Particles & Hit Flash Light
    this.flightRecorder.startSection('sparks_lights');
    this.renderSystem.updateParticles(frameDelta);
    this.flightRecorder.endSection('sparks_lights');

    // 2. Prepare Physics Inputs
    const touchMove = this.touchController.moveVector;
    let driveInput = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) driveInput += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) driveInput -= 0.6;
    if (this.touchController.isTouching) {
      driveInput = touchMove.y;
    }

    let turnInput = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) turnInput += 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) turnInput -= 1;
    if (this.touchController.isTouching) {
      turnInput = -touchMove.x * 1.5;
    }

    const isMoving = Math.abs(driveInput) > 0.05 || Math.abs(touchMove.x) > 0.05;
    const isSprinting = ((this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.isDoubleTapSprint || this.touchController.isSprinting) && this.vitals.canSprint());
    const isCrouching = this.isSneakToggle || this.keys['ControlLeft'] || this.keys['KeyC'];
    this.cat.isCrouching = isCrouching;

    // Auto-disable Whiskers Mode if exhausted
    if (this.renderSystem.isWhiskersMode && !this.vitals.canUseWhiskers()) {
      this.toggleWhiskersMode();
      this.showNotification('Whiskers Vision Faded', 'Alba is exhausted! Stamina recharging...', 'warn');
    }

    // Update vitals
    this.vitals.update(frameDelta, isSprinting, isMoving, this.renderSystem.isWhiskersMode);

    this.physicsInput.driveInput = driveInput;
    this.physicsInput.turnInput = turnInput;
    this.physicsInput.isSprinting = isSprinting;
    this.physicsInput.isCrouching = isCrouching;
    this.physicsInput.isMoving = isMoving;
    this.physicsInput.jumpRequested = !!this.keys['Space'];

    // 3. Fixed-Timestep Physics Sub-stepping
    this.flightRecorder.startSection('physics_kinematics');
    const alpha = this.physics.update(
      frameDelta,
      this.physicsInput,
      this.environment,
      this.vitals,
      this.progression
    );

    // 4. Interpolate Render Transform for Cat
    const { heading: renderYaw, bankAngle: renderBank } = this.physics.interpolate(alpha, GameEngine.interpolatedCatPos);
    this.cat.mesh.position.copy(GameEngine.interpolatedCatPos);
    this.cat.mesh.rotation.set(0, renderYaw, renderBank);
    this.flightRecorder.endSection('physics_kinematics');

    // 5. Turn Input & Feline Render Frame Animation
    this.flightRecorder.startSection('cat_character_anim');
    this.cat.animate(frameDelta, this.physics.currentSpeed, this.physics.isGrounded, turnInput);
    this.flightRecorder.endSection('cat_character_anim');

    // 6. Touch Camera Drag Swipe Delta Consumption
    const camDelta = this.touchController.consumeCameraDelta();
    if (camDelta.x !== 0 || camDelta.y !== 0) {
      this.renderSystem.cameraYaw -= camDelta.x * 2.0;
      this.renderSystem.cameraPitch = Math.max(-0.25, Math.min(0.85, this.renderSystem.cameraPitch + camDelta.y * 1.5));
    }

    // Free lookaround keys
    const isFreeLooking = !!this.keys['KeyV'];
    if (isFreeLooking) {
      if (this.keys['ArrowLeft'] || this.keys['KeyJ']) this.renderSystem.cameraYaw += 2.0 * frameDelta;
      if (this.keys['ArrowRight'] || this.keys['KeyL']) this.renderSystem.cameraYaw -= 2.0 * frameDelta;
      if (this.keys['ArrowUp'] || this.keys['KeyI']) this.renderSystem.cameraPitch = Math.min(0.8, this.renderSystem.cameraPitch + 1.5 * frameDelta);
      if (this.keys['ArrowDown'] || this.keys['KeyK']) this.renderSystem.cameraPitch = Math.max(-0.4, this.renderSystem.cameraPitch - 1.5 * frameDelta);
    }

    // 7. Update Camera, Hazards, Story Progression & Environment
    this.flightRecorder.startSection('camera_spring');
    this.renderSystem.updateCamera(frameDelta, this.cat.mesh.position, renderYaw, isFreeLooking);
    this.flightRecorder.endSection('camera_spring');

    this.flightRecorder.startSection('hazards_story');
    this.updateRadiationAndHazards(frameDelta);
    this.updateStoryProgression(frameDelta);
    this.environment.update(frameDelta, this.cat.mesh.position, this.isDoubleTapSprint || this.physics.isPouncing);

    // Update Stylized Pounce Trajectory Arc Visualizer
    const pounceCandidate = this.findBestPounceTarget();
    if (pounceCandidate && pounceCandidate.dist > 1.0 && pounceCandidate.dist <= 8.5 && this.physics.isGrounded) {
      const catPos = this.cat.mesh.position;
      const targetPos = pounceCandidate.targetPos;
      const dx = targetPos.x - catPos.x;
      const dz = targetPos.z - catPos.z;
      const dist = Math.hypot(dx, dz);
      const flightTime = Math.max(0.25, dist / 11.5);
      const vy = (targetPos.y - catPos.y + 0.5 * 18.0 * flightTime * flightTime) / flightTime;
      const initVel = GameEngine.scratchPounce.set(dx / flightTime, vy, dz / flightTime);

      const isGuaranteedCatchRange = (dist <= 5.2);
      this.trajectoryVisualizer.setVisible(true);
      this.trajectoryVisualizer.setTargetLock(isGuaranteedCatchRange);
      this.trajectoryVisualizer.updateTrajectory(catPos, initVel, 18.0, targetPos.y);
    } else {
      this.trajectoryVisualizer.setVisible(false);
      this.trajectoryVisualizer.setTargetLock(false);
    }
    this.flightRecorder.endSection('hazards_story');

    // 8. AI & Entity Updates — once per render frame
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

    // 10. Real-Time Tactical Minimap & Radar (Throttled)
    this.flightRecorder.startSection('prompts_minimap');
    if (this.frameTick % 6 === 0) {
      this.updateMinimap();
    }

    // 11. Dynamic Floating Contextual HUD Prompts (Throttled)
    if (this.frameTick % 6 === 0) {
      this.updateContextualPrompts();
    }
    this.flightRecorder.endSection('prompts_minimap');

    // 12. WebGL Rendering
    this.flightRecorder.startSection('webgl_render');
    this.renderSystem.render(this.scene);
    this.flightRecorder.endSection('webgl_render');

    this.flightRecorder.endFrame({
      catPos: this.cat ? this.cat.mesh.position : undefined,
      catState: this.cat?.currentActionName || 'stand',
      speed: this.physics.currentSpeed,
      heading: this.physics.heading,
      isGrounded: this.physics.isGrounded,
      isPouncing: this.physics.isPouncing,
      isCrouching: this.cat ? this.cat.isCrouching : false,
      stamina: this.vitals.currentStamina,
      hunger: this.vitals.currentHunger,
      health: this.vitals.currentHealth,
      radDose: this.currentRadDose,
      zone: this.renderSystem.getCurrentLocationName(),
      mission: this.missionManager.getCurrentMission().title,
      rendererInfo: this.renderer.info
    });

    this.onFrameUpdate?.();
    this.eventBus.emit('engine:frameUpdate', { tick: this.frameTick, deltaTime: frameDelta });
  }

  private performDistanceLOD() {
    const catPos = this.cat.mesh.position;
    const maxActiveDistanceSq = 60 * 60;

    for (let i = 0; i < this.rats.length; i++) {
      const rat = this.rats[i];
      if (rat.state === 'CAUGHT') {
        rat.mesh.visible = false;
      } else {
        const dSq = rat.mesh.position.distanceToSquared(catPos);
        rat.mesh.visible = dSq < maxActiveDistanceSq;
      }
    }

    for (let i = 0; i < this.mutantCats.length; i++) {
      const mutant = this.mutantCats[i];
      const dSq = mutant.mesh.position.distanceToSquared(catPos);
      mutant.mesh.visible = dSq < maxActiveDistanceSq;
    }

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

    for (let i = 0; i < this.rats.length; i++) {
      const rat = this.rats[i];
      if (rat.state !== 'CAUGHT') {
        count = this.addMinimapEntity(count, rat.mesh.position, rat.isKingpin ? 'KINGPIN' : 'RAT');
      }
    }

    for (let i = 0; i < this.mutantCats.length; i++) {
      const m = this.mutantCats[i];
      if (!m.isDefeated) {
        count = this.addMinimapEntity(count, m.mesh.position, 'MUTANT');
      }
    }

    for (let i = 0; i < this.colonyNPCs.length; i++) {
      count = this.addMinimapEntity(count, this.colonyNPCs[i].mesh.position, 'COLONY');
    }

    const waypoint = this.missionManager.getActiveWaypoint();
    if (waypoint) {
      this.environment.setBeaconPosition(waypoint.x, waypoint.y, waypoint.z);
      count = this.addMinimapEntity(count, GameEngine.waypointScratch.set(waypoint.x, waypoint.y, waypoint.z), 'OBJECTIVE', waypoint.label);
    }

    this.minimapSystem.update(this.cat.mesh.position, this.physics.heading, this.minimapEntityPool, count);
  }

  private onResize() {
    this.renderSystem.resize();
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
    this.renderSystem.dispose();
    this.eventBus.clear();

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
  }
}
