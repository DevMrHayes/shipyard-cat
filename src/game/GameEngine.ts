import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
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

export class GameEngine {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  
  public cat: CatCharacter;
  public environment: ShipyardEnvironment;
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

  private keys: { [key: string]: boolean } = {};
  private lastForwardKeyDownTime: number = 0;
  private isDoubleTapSprint: boolean = false;
  private isSneakToggle: boolean = false;
  private comboStep: number = 0;
  private lastAttackTime: number = 0;
  private waterLevel: number = 0.05;
  private isFloodingActive: boolean = false;

  private timer: THREE.Timer;
  private cameraOffset: THREE.Vector3 = new THREE.Vector3(0, 1.8, -4.5);
  private currentCameraPos: THREE.Vector3 = new THREE.Vector3();
  private catVelocity: THREE.Vector3 = new THREE.Vector3();
  private isGrounded: boolean = true;
  private isWhiskersMode: boolean = false;
  private pounceTarget: THREE.Vector3 | null = null;
  private isPouncing: boolean = false;
  private pounceTimer: number = 0;
  private catHeading: number = 0;
  private cameraYaw: number = 0;
  private cameraPitch: number = 0.15;
  private turnVelocity: number = 0;
  private isDraggingMouse: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private lastLocationName: string = '';

  // Event callbacks for UI
  public onVitalsUpdate?: (vitals: CatVitals, radiation: number) => void;
  public onAssistanceTriggered?: (event: ShipbuildingAssistEvent) => void;
  public onMissionObjectiveUpdated?: () => void;
  public onNotification?: (title: string, message: string, type: 'info' | 'success' | 'warn') => void;
  public onFrameUpdate?: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.timer = new THREE.Timer();

    // 1. Initialize Subsystems
    this.vitals = new CatVitals();
    this.radiationSystem = new RadiationSystem();
    this.assistanceEngine = new AssistanceEngine();
    this.missionManager = new MissionManager();
    this.progression = new ProgressionSystem();
    this.touchController = new TouchController();
    this.minimapSystem = new MinimapSystem();

    // 2. Initialize Three.js Scene & Renderer (Video Game AAA Grade Pipeline)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e293b); // Rich twilight dusk
    this.scene.fog = new THREE.FogExp2(0x1e293b, 0.0075); // Atmospheric volumetric industrial haze

    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      600
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.container.appendChild(this.renderer.domElement);

    // Load Industrial HDRI Skybox with HDRLoader for Image-Based Lighting (IBL)
    const hdrLoader = new HDRLoader();
    hdrLoader.load('/environment/evening_sky_1k.hdr', (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = texture;
      this.scene.background = texture;
    }, undefined, (err) => {
      console.warn('HDRI load note:', err);
    });

    // 3. Setup Lighting
    this.setupLighting();

    // 4. Build Environment & Characters
    this.environment = new ShipyardEnvironment();
    this.scene.add(this.environment.group);

    this.cat = new CatCharacter();
    this.cat.mesh.position.set(-15, 0, -10); // Start near South Yard & Dorothy
    
    // Alba's Feline Vision / Personal Worksite Light
    const catAuraLight = new THREE.PointLight(0xffedd5, 2.2, 25);
    catAuraLight.position.set(0, 1.5, 0);
    this.cat.mesh.add(catAuraLight);

    this.scene.add(this.cat.mesh);

    // Initialize Camera Position immediately behind Alba
    this.currentCameraPos.set(-15, 1.6, -14.5);
    this.camera.position.copy(this.currentCameraPos);
    this.camera.lookAt(-15, 0.4, -10);

    // 5. Spawn Entities: Rats, Colony NPCs, and Mutant Cats
    this.spawnRats();
    this.spawnColonyNPCs();
    this.spawnShipbuilders();
    this.spawnMutantCats();

    // 6. Connect Event Listeners
    this.setupInput();
    this.setupAssistanceListeners();
    window.addEventListener('resize', this.onResize.bind(this));

    // 7. Start Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  private setupLighting() {
    // 1. Warm Industrial Twilight Sky & Ground Bounce
    const hemiLight = new THREE.HemisphereLight(0xffedd5, 0x1e293b, 1.8);
    this.scene.add(hemiLight);

    // 2. Optimized Golden Hour Sun (Single Efficient Shadow Map Pass)
    const sunLight = new THREE.DirectionalLight(0xfef08a, 2.8);
    sunLight.position.set(60, 65, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024; // Optimized for 60 FPS performance
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.bias = -0.0008;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 260;
    sunLight.shadow.camera.left = -90;
    sunLight.shadow.camera.right = 90;
    sunLight.shadow.camera.top = 90;
    sunLight.shadow.camera.bottom = -90;
    this.scene.add(sunLight);

    // 3. Cool River Horizon Fill Light
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    fillLight.position.set(-60, 45, -45);
    this.scene.add(fillLight);

    // 4. High-Mast Sodium Floodlights (Direct illumination without expensive shadow map passes)
    const southYardFlood = new THREE.SpotLight(0xfbbf24, 3.5, 80, Math.PI / 3, 0.4, 1.2);
    southYardFlood.position.set(-20, 18, -15);
    southYardFlood.target.position.set(-20, 0, -25);
    this.scene.add(southYardFlood, southYardFlood.target);

    // 5. Big Blue Gantry Dry Dock High-Mast Lights
    const dryDockFlood = new THREE.SpotLight(0x60a5fa, 4.0, 110, Math.PI / 3.5, 0.3, 1.0);
    dryDockFlood.position.set(20, 36, 25);
    dryDockFlood.target.position.set(20, 0, 30);
    this.scene.add(dryDockFlood, dryDockFlood.target);

    // 6. Submarine MOF Fabrication Floodlight
    const subShopFlood = new THREE.SpotLight(0xfde047, 3.2, 70, Math.PI / 3, 0.3, 1.1);
    subShopFlood.position.set(-30, 18, 45);
    subShopFlood.target.position.set(-30, 0, 45);
    this.scene.add(subShopFlood, subShopFlood.target);

    // 7. James River Waterfront Pier Illuminator
    const riverFlood = new THREE.DirectionalLight(0xbae6fd, 1.6);
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

    const kingpin = new RatEntity(new THREE.Vector3(-20, 3.2, -29.5), true);
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
    const elena = new ColonyCatEntity('Dr. Elena Vance', 'EH&S Specialist', new THREE.Vector3(-50, 0, -60), 0xffffff, elenaDialogue, true);
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
    const belle = new ColonyCatEntity('Calico Belle', 'Veteran Guard', new THREE.Vector3(-54, 0, -58), 0xd97706, belleDialogue, false);
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
    const toby = new ColonyCatEntity('Tripod Toby', 'Colony Elder', new THREE.Vector3(-52, 0, -64), 0x71717a, tobyDialogue, false);
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
    const dave = new ShipbuilderEntity('Dave O\'Connor', 'Submarine Outfitting', 'PIPEFITTER', new THREE.Vector3(-32, 0, 38), Math.PI / 2, daveDialogues);
    this.shipbuilders.push(dave);
    this.scene.add(dave.mesh);
  }

  private spawnMutantCats() {
    const mutant1 = new MutantCatEntity('Mutant Scout Fang', new THREE.Vector3(-28, 0, 12));
    const mutant2 = new MutantCatEntity('Mutant Prowler Slag', new THREE.Vector3(10, 0, 18));
    const mutant3 = new MutantCatEntity('Lieutenant Cobalt', new THREE.Vector3(38, 0, -52));

    this.mutantCats.push(mutant1, mutant2, mutant3);
    this.scene.add(mutant1.mesh, mutant2.mesh, mutant3.mesh);
  }

  private setupInput() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      // Double-Tap Forward to Sprint Detection (W or Up Arrow) - no notification spam
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

      // Interact / Meow (E)
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
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        this.isDoubleTapSprint = false;
      }
    });

    // Mouse click & drag steering / combat
    window.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).tagName === 'CANVAS') {
        this.isDraggingMouse = true;
        this.lastMouseX = e.clientX;
        if (e.button === 0) {
          this.executePawSwipe(); // Left click = Paw swipe attack
        } else if (e.button === 2) {
          this.executePounce();   // Right click = Pounce
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDraggingMouse) {
        const deltaX = e.clientX - this.lastMouseX;
        this.catHeading -= deltaX * 0.005;
        this.lastMouseX = e.clientX;
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDraggingMouse = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  public handleInteractOrMeow() {
    const catPos = this.cat.mesh.position;
    let interacted = false;

    // Check if near any Colony NPC
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

    // Check if near any active Shipbuilder
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
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.cat.mesh.quaternion);
    const damage = (this.comboStep === 3 ? 40 : 20) * this.progression.attackDamageMultiplier;

    // Check hit on rats
    for (const rat of this.rats) {
      if (rat.state !== 'CAUGHT') {
        const dist = rat.mesh.position.distanceTo(catPos);
        if (dist < 1.8) {
          rat.state = 'CAUGHT';
          rat.mesh.visible = false;
          this.scene.remove(rat.mesh);
          this.scene.remove(rat.scentTrailParticles);
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
    for (const mutant of this.mutantCats) {
      if (!mutant.isDefeated) {
        const dist = mutant.mesh.position.distanceTo(catPos);
        if (dist < 2.2) {
          const defeated = mutant.takeDamage(damage);
          soundEngine.playCatHiss();

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
    for (const mutant of this.mutantCats) {
      if (!mutant.isDefeated) {
        const dist = mutant.mesh.position.distanceTo(catPos);
        if (dist < 3.2) {
          mutant.takeDamage(15);
          // Push back
          const pushDir = new THREE.Vector3().subVectors(mutant.mesh.position, catPos).normalize();
          mutant.mesh.position.addScaledVector(pushDir, 2.5);
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
      this.scene.background = new THREE.Color(0x021726); // Blueprint Sonar Blue
      this.scene.fog = new THREE.Fog(0x021726, 40, 300);
      
      let modeDesc = 'Thermal prey signatures highlighted (Drains Stamina).';
      if (this.progression.whiskersTier >= 1) modeDesc += ' Scent footprint trails visible.';
      if (this.progression.whiskersTier >= 2) modeDesc += ' Radioactive mutant cats glowing violet.';
      if (this.progression.whiskersTier >= 3) modeDesc += ' Structural & Geiger conduit vision active.';

      this.onNotification?.('Whiskers Vision Active', modeDesc, 'info');
    } else {
      this.scene.background = new THREE.Color(0x2b3748);
      this.scene.fog = new THREE.Fog(0x2b3748, 80, 500);
    }

    // Toggle rats & mutant cats
    this.rats.forEach(r => r.setWhiskersMode(this.isWhiskersMode));
    this.mutantCats.forEach(m => m.setWhiskersAura(this.isWhiskersMode, this.progression.whiskersTier >= 2));
    this.environment.setWhiskersMode(this.isWhiskersMode);

    return this.isWhiskersMode;
  }

  public executePounce() {
    if (this.isPouncing || !this.isGrounded) return;
    if (!this.vitals.consumePounceStamina(22)) {
      this.onNotification?.('Exhausted!', 'Not enough stamina to execute a precision pounce. Catch your breath or eat!', 'warn');
      return;
    }

    soundEngine.playPounce();
    this.isPouncing = true;
    this.pounceTimer = 0.45;
    this.cat.isPouncing = true;

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.cat.mesh.quaternion);
    this.catVelocity.copy(forward).multiplyScalar(11.0);
    this.catVelocity.y = 5.5;
    this.isGrounded = false;
  }

  private updateMovement(deltaTime: number) {
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

    // 2. Silky-Smooth Precision Steering (Keyboard + Touch Joystick)
    let turnInput = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) turnInput += 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) turnInput -= 1;
    if (this.touchController.isTouching) {
      turnInput = -touchMove.x * 1.5; // Turn left / right with thumbstick
    }

    if (turnInput !== 0) {
      const baseTurnRate = isMoving ? 2.4 : 2.8;
      this.catHeading += turnInput * baseTurnRate * deltaTime;
      this.cat.mesh.rotation.y = this.catHeading;
    }

    // Touch camera drag swipe delta
    const camDelta = this.touchController.consumeCameraDelta();
    if (camDelta.x !== 0 || camDelta.y !== 0) {
      this.cameraYaw -= camDelta.x * 2.0;
      this.cameraPitch = Math.max(-0.25, Math.min(0.85, this.cameraPitch + camDelta.y * 1.5));
    }

    // Update vitals with Whiskers drain & exhaustion lock
    this.vitals.update(deltaTime, isSprinting, isMoving, this.isWhiskersMode);

    // 3. Jump with Progression Multiplier
    if (this.keys['Space'] && this.isGrounded && !this.isPouncing) {
      const jumpPower = 6.2 * this.progression.jumpMultiplier;
      this.catVelocity.y = jumpPower;
      this.isGrounded = false;
      this.vitals.consumePounceStamina(10);
    }

    let speed = 4.2;
    if (isSprinting) speed = 8.8 * this.progression.sprintMultiplier;
    if (isCrouching) speed = 1.8;

    const previousPos = this.cat.mesh.position.clone();

    // 4. Move cat along forward vector and resolve wall collisions
    if (isMoving && !this.isPouncing) {
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.cat.mesh.quaternion);
      const newPos = this.cat.mesh.position.clone().addScaledVector(forward, driveInput * speed * deltaTime);
      
      const resolvedPos = this.environment.resolveCollision(newPos, 0.35, previousPos);
      this.cat.mesh.position.copy(resolvedPos);
    }

    // 5. Vertical Gravity, Platform Mantling & Floor Heights
    const currentFloor = this.environment.getPlatformFloor(
      this.cat.mesh.position.x,
      this.cat.mesh.position.z,
      this.cat.mesh.position.y
    );

    if (!this.isGrounded || this.cat.mesh.position.y > currentFloor) {
      this.catVelocity.y -= 18.0 * deltaTime;
      const newAirPos = this.cat.mesh.position.clone().addScaledVector(this.catVelocity, deltaTime);
      const resolvedAirPos = this.environment.resolveCollision(newAirPos, 0.35, previousPos);
      this.cat.mesh.position.copy(resolvedAirPos);

      // Check landing on platform top surface or ground
      if (this.cat.mesh.position.y <= currentFloor) {
        this.cat.mesh.position.y = currentFloor;
        this.catVelocity.set(0, 0, 0);
        this.isGrounded = true;
        this.isPouncing = false;
        this.cat.isPouncing = false;

        // Check if climbed onto Tugboat Dorothy's deck (X: -22 to -18, Z: -31 to -19, Y: 2.2)
        if (this.cat.mesh.position.x >= -23.0 && this.cat.mesh.position.x <= -17.0 &&
            this.cat.mesh.position.z >= -32.0 && this.cat.mesh.position.z <= -18.0 &&
            currentFloor >= 2.0) {
          if (!this.missionManager.getCurrentMission().objectives[1].isCompleted) {
            this.missionManager.completeObjective('climb_dorothy');
            soundEngine.playSuccess();
            this.onNotification?.('OBJECTIVE COMPLETE!', "You climbed onto Tugboat Dorothy's deck! Head to the capstan.", 'success');
            this.onMissionObjectiveUpdated?.();
          }
        }

        // Check if landed on a floating pallet in Dry Dock 12
        if (this.cat.mesh.position.x > 8 && this.cat.mesh.position.x < 32 && this.cat.mesh.position.z > 10 && this.cat.mesh.position.z < 60) {
          if (currentFloor > 0.5) {
            this.missionManager.updateCountObjective('jump_pallets', 1);
            this.onMissionObjectiveUpdated?.();
          }
        }
      }
    } else {
      this.cat.mesh.position.y = currentFloor;
    }

    if (this.isPouncing) {
      this.pounceTimer -= deltaTime;
      if (this.pounceTimer <= 0 && this.isGrounded) {
        this.isPouncing = false;
        this.cat.isPouncing = false;
      }
    }

    this.cat.animate(deltaTime, isMoving ? speed : 0, this.isGrounded, turnInput);

    // Update Mutant Cats & Flooding
    this.updateMutantsAndColony(deltaTime);
    this.updateFloodingSimulation(deltaTime);
  }

  private updateMutantsAndColony(deltaTime: number) {
    const catPos = this.cat.mesh.position;
    for (const mutant of this.mutantCats) {
      mutant.update(
        deltaTime,
        catPos,
        (damage) => {
          this.vitals.takeHazardDamage(damage / 100);
          soundEngine.playCatHiss();
          this.onNotification?.('MUTANT ATTACK!', `${mutant.name} swiped at Alba! Health reduced.`, 'warn');
        },
        (pos, rad) => this.environment.resolveCollision(pos, rad)
      );
    }

    // Animate active shipbuilder torches and tools
    for (const builder of this.shipbuilders) {
      builder.animate(deltaTime);
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

    for (const rat of this.rats) {
      rat.update(deltaTime, catPos, this.cat.isCrouching);
      
      if (rat.state !== 'CAUGHT') {
        const resolvedRatPos = this.environment.resolveCollision(rat.mesh.position, 0.25);
        rat.mesh.position.copy(resolvedRatPos);
      }

      if (rat.state !== 'CAUGHT') {
        const dist = rat.mesh.position.distanceTo(catPos);
        const catchThreshold = rat.isKingpin ? 2.2 : 1.4;

        if (dist < catchThreshold && (this.isPouncing || dist < 1.1)) {
          if (rat.isKingpin) {
            rat.health -= 1;
            rat.isStunned = true;
            rat.stunTimer = 1.2;
            rat.attackCooldown = 2.0;
            soundEngine.playRatCatch();

            if (rat.health <= 0) {
              rat.state = 'CAUGHT';
              rat.mesh.visible = false;
              this.scene.remove(rat.mesh); // Permanently remove caught rat from 3D scene
              this.scene.remove(rat.scentTrailParticles);
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
            this.scene.remove(rat.mesh); // Permanently remove caught mouse from 3D scene
            this.scene.remove(rat.scentTrailParticles);
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
  }

  private updateRadiationAndHazards() {
    const radData = this.radiationSystem.calculateRadiationAtPoint(this.cat.mesh.position);
    soundEngine.updateRadiationLevel(radData.totalDose);

    if (radData.totalDose > 4.0) {
      this.vitals.takeHazardDamage(0.04);
      if (this.missionManager.getCurrentMission().id === 4) {
        this.missionManager.completeObjective('activate_whiskers');
        this.onMissionObjectiveUpdated?.();
      }
    }

    // Check proximity to Dorothy scaffolding for Mission 1
    const distToDorothy = this.cat.mesh.position.distanceTo(new THREE.Vector3(-20, 2, -25));
    if (distToDorothy < 6.0) {
      this.missionManager.completeObjective('climb_dorothy');
      this.onMissionObjectiveUpdated?.();
    }

    // Check proximity to Cat Motel sanctuary for healing
    const distToMotel = this.cat.mesh.position.distanceTo(new THREE.Vector3(-55, 0, -65));
    if (distToMotel < 8.0) {
      this.vitals.healAtSanctuary();
    }

    this.onVitalsUpdate?.(this.vitals, radData.totalDose);
  }

  private updateCamera(deltaTime: number) {
    const targetPos = this.cat.mesh.position.clone();
    
    // Free camera lookaround (Hold V or I/K/J/L or Arrow keys when Alt/V held)
    if (this.keys['KeyV']) {
      if (this.keys['ArrowLeft'] || this.keys['KeyJ']) this.cameraYaw += 2.0 * deltaTime;
      if (this.keys['ArrowRight'] || this.keys['KeyL']) this.cameraYaw -= 2.0 * deltaTime;
      if (this.keys['ArrowUp'] || this.keys['KeyI']) this.cameraPitch = Math.min(0.8, this.cameraPitch + 1.5 * deltaTime);
      if (this.keys['ArrowDown'] || this.keys['KeyK']) this.cameraPitch = Math.max(-0.4, this.cameraPitch - 1.5 * deltaTime);
    } else {
      // Smoothly re-center camera behind Alba when not free-looking
      this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, 0, deltaTime * 4);
    }

    // Check if Alba is inside Machine Shop No. 1 (X: -56 to -34, Z: -38 to -2)
    const isInsideMachineShop = targetPos.x >= -56 && targetPos.x <= -34 && targetPos.z >= -38 && targetPos.z <= -2;
    const isInsideMotel = targetPos.x >= -62 && targetPos.x <= -48 && targetPos.z >= -71 && targetPos.z <= -59;

    const isIndoors = isInsideMachineShop || isInsideMotel;

    // Location notification on transition
    const currentLocation = isInsideMachineShop ? 'Machine Shop No. 1 (Interior)' :
                            isInsideMotel ? 'Cat Motel Hub Sanctuary' : 'Shipyard Grounds (South Yard)';

    if (currentLocation !== this.lastLocationName) {
      this.lastLocationName = currentLocation;
      this.onNotification?.(`Entering: ${currentLocation}`, isIndoors ? 'Indoor stealth area active. Clustered machinery & conduits overhead.' : 'Open shipyard staging yard.', 'info');
    }

    // Dynamic camera distance with spring-arm collision avoidance
    const maxDist = isIndoors ? 1.8 : 3.8;
    const totalHeading = this.catHeading + this.cameraYaw;
    const camHeight = isIndoors ? 1.1 : (1.4 + Math.sin(this.cameraPitch) * 1.5);
    const camDist = maxDist * Math.cos(this.cameraPitch);

    let desiredCameraPos = new THREE.Vector3(
      targetPos.x - Math.sin(totalHeading) * camDist,
      targetPos.y + camHeight,
      targetPos.z - Math.cos(totalHeading) * camDist
    );

    // Wall collision prevention: push camera in front of solid obstacles
    desiredCameraPos = this.environment.resolveCollision(desiredCameraPos, 0.45);

    // If indoors in Machine Shop, clamp camera to room interior boundaries
    if (isInsideMachineShop) {
      desiredCameraPos.x = Math.max(-55.0, Math.min(-35.0, desiredCameraPos.x));
      desiredCameraPos.z = Math.max(-37.0, Math.min(-3.0, desiredCameraPos.z));
      desiredCameraPos.y = Math.max(0.4, Math.min(6.5, desiredCameraPos.y));
    }

    this.currentCameraPos.lerp(desiredCameraPos, deltaTime * 12);
    this.camera.position.copy(this.currentCameraPos);
    this.camera.lookAt(targetPos.clone().add(new THREE.Vector3(0, 0.4, 0)));
  }

  private animate() {
    requestAnimationFrame(this.animate);

    this.timer.update();
    const deltaTime = Math.min(this.timer.getDelta(), 0.1);

    this.updateMovement(deltaTime);
    this.updateRatsAndHunting(deltaTime);
    this.updateRadiationAndHazards();
    this.environment.update(deltaTime);
    this.updateCamera(deltaTime);

    // Distance-Based Dynamic Occlusion & LOD Culling (Performance Optimization)
    this.performDistanceLOD();

    // Update Real-Time Tactical Minimap & Radar
    this.updateMinimap();

    this.renderer.render(this.scene, this.camera);
    this.onFrameUpdate?.();
  }

  private performDistanceLOD() {
    const catPos = this.cat.mesh.position;
    const maxActiveDistanceSq = 60 * 60; // 60-meter near-focus culling radius

    // 1. Cull far vermin (and ensure caught eaten rats stay hidden/removed)
    this.rats.forEach(rat => {
      if (rat.state === 'CAUGHT') {
        rat.mesh.visible = false;
      } else {
        const dSq = rat.mesh.position.distanceToSquared(catPos);
        rat.mesh.visible = dSq < maxActiveDistanceSq;
      }
    });

    // 2. Cull far mutant cats
    this.mutantCats.forEach(mutant => {
      const dSq = mutant.mesh.position.distanceToSquared(catPos);
      mutant.mesh.visible = dSq < maxActiveDistanceSq;
    });

    // 3. Cull far shipbuilders
    this.shipbuilders.forEach(builder => {
      const dSq = builder.mesh.position.distanceToSquared(catPos);
      builder.mesh.visible = dSq < maxActiveDistanceSq;
    });
  }

  private updateMinimap() {
    const entities: MinimapEntity[] = [];

    // Add Rats
    this.rats.forEach(rat => {
      if (rat.state !== 'CAUGHT') {
        entities.push({
          pos: rat.mesh.position,
          type: rat.isKingpin ? 'KINGPIN' : 'RAT'
        });
      }
    });

    // Add Mutants
    this.mutantCats.forEach(m => {
      if (!m.isDefeated) {
        entities.push({
          pos: m.mesh.position,
          type: 'MUTANT'
        });
      }
    });

    // Add Colony Friendly Cats
    this.colonyNPCs.forEach(c => {
      entities.push({
        pos: c.mesh.position,
        type: 'COLONY'
      });
    });

    // Add Objective Beacons
    if (this.environment.objectiveBeacon && this.environment.objectiveBeacon.visible) {
      entities.push({
        pos: this.environment.objectiveBeacon.position,
        type: 'OBJECTIVE'
      });
    }

    this.minimapSystem.update(this.cat.mesh.position, this.catHeading, entities);
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
