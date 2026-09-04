import * as THREE from 'three';
import { TextureGenerator } from '../core/TextureGenerator';

export interface ShipbuilderDialogue {
  speaker: string;
  department: string;
  trade: 'WELDER' | 'PIPEFITTER' | 'RIGGER' | 'ELECTRICIAN' | 'SUPERVISOR';
  text: string;
  assistTip?: string;
}

export class ShipbuilderEntity {
  public mesh: THREE.Group;
  public name: string;
  public department: string;
  public trade: 'WELDER' | 'PIPEFITTER' | 'RIGGER' | 'ELECTRICIAN' | 'SUPERVISOR';
  public dialogueTree: ShipbuilderDialogue[];
  public currentDialogueIndex: number = 0;
  
  private characterRoot: THREE.Group | null = null;
  private torsoGroup: THREE.Group | null = null;
  private headGroup: THREE.Group | null = null;
  private leftArmGroup: THREE.Group | null = null;
  private rightArmGroup: THREE.Group | null = null;
  private toolArm: THREE.Mesh | null = null;
  private sparkLight: THREE.PointLight | null = null;
  private workPhase: number = 0;
  private breathingPhase: number = 0;
  private isWeldingArcActive: boolean = false;
  private arcIntensity: number = 0;

  constructor(
    name: string,
    department: string,
    trade: 'WELDER' | 'PIPEFITTER' | 'RIGGER' | 'ELECTRICIAN' | 'SUPERVISOR',
    position: THREE.Vector3,
    heading: number,
    dialogues: ShipbuilderDialogue[],
    _isFemale: boolean = false
  ) {
    this.name = name;
    this.department = department;
    this.trade = trade;
    this.dialogueTree = dialogues;
    this.workPhase = Math.random() * Math.PI * 2;
    this.breathingPhase = Math.random() * Math.PI * 2;

    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);
    this.mesh.rotation.y = heading;

    this.buildArticulatedShipbuilder();
  }

  private buildArticulatedShipbuilder() {
    this.characterRoot = new THREE.Group();
    this.mesh.add(this.characterRoot);

    // Trade-Specific Color Palette
    const coverallColor = this.trade === 'WELDER' ? 0x1e3a8a : // Dark Navy Coveralls
                          this.trade === 'PIPEFITTER' ? 0xb45309 : // Heavy Canvas Brown
                          this.trade === 'RIGGER' ? 0x065f46 : // Forest Green Rigging
                          this.trade === 'ELECTRICIAN' ? 0x334155 : // Slate Workwear
                          0x0f172a; // Supervisor Charcoal / Dark Slate

    const vestNeonColor = (this.trade === 'SUPERVISOR' || this.trade === 'RIGGER') ? '#f97316' : '#ccff00';
    const hardhatColor = this.trade === 'SUPERVISOR' ? 0xf8fafc : // White helmet for supervisor
                         this.trade === 'WELDER' ? 0x1e293b : // Dark slag shield with gold band
                         0xfacc15; // High-vis yellow for craftsmen

    // Common PBR Materials
    const coverallMat = new THREE.MeshStandardMaterial({
      color: coverallColor,
      roughness: 0.85,
      metalness: 0.05
    });

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xfbcfe8,
      roughness: 0.65,
      metalness: 0.0
    });

    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.75,
      metalness: 0.1
    });

    const darkLeatherMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.8,
      metalness: 0.2
    });

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.9,
      roughness: 0.2
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.85,
      roughness: 0.25
    });

    // High-Vis Safety Vest Material with Retroreflective Micro-Prismatic Banding
    let vestMat: THREE.MeshStandardMaterial;
    if (typeof document !== 'undefined') {
      const vestDiff = TextureGenerator.createHighVisFabricTexture(vestNeonColor);
      const vestNor = TextureGenerator.createHighVisFabricNormalTexture();
      vestMat = new THREE.MeshStandardMaterial({
        map: vestDiff,
        normalMap: vestNor,
        roughness: 0.45,
        metalness: 0.1
      });
    } else {
      vestMat = new THREE.MeshStandardMaterial({
        color: vestNeonColor === '#f97316' ? 0xf97316 : 0xeab308,
        roughness: 0.45,
        metalness: 0.1
      });
    }

    const hardhatMat = new THREE.MeshStandardMaterial({
      color: hardhatColor,
      roughness: 0.35,
      metalness: 0.15
    });

    // -------------------------------------------------------------------------
    // 1. LEGS & HEAVY LEATHER WORK BOOTS WITH STEEL TOE CAPS
    // -------------------------------------------------------------------------
    const legPositions = [0.18, -0.18];
    legPositions.forEach(lx => {
      const legGroup = new THREE.Group();
      legGroup.position.set(lx, 0.45, 0);

      // Thigh & Shin Overalls
      const thighGeo = new THREE.CylinderGeometry(0.13, 0.12, 0.46, 10);
      const thigh = new THREE.Mesh(thighGeo, coverallMat);
      thigh.position.y = 0.22;
      thigh.castShadow = true;

      const kneePadGeo = new THREE.BoxGeometry(0.18, 0.14, 0.1);
      const kneePad = new THREE.Mesh(kneePadGeo, darkLeatherMat);
      kneePad.position.set(0, 0.02, 0.08);
      kneePad.castShadow = true;

      const calfGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.44, 10);
      const calf = new THREE.Mesh(calfGeo, coverallMat);
      calf.position.y = -0.2;
      calf.castShadow = true;

      // Heavy Leather Work Boot
      const bootBaseGeo = new THREE.BoxGeometry(0.2, 0.14, 0.34);
      const boot = new THREE.Mesh(bootBaseGeo, darkLeatherMat);
      boot.position.set(0, -0.38, 0.04);
      boot.castShadow = true;
      boot.receiveShadow = true;

      // Steel Toe Cap
      const toeCapGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.14, 8);
      toeCapGeo.rotateX(Math.PI / 2);
      const toeCap = new THREE.Mesh(toeCapGeo, steelMat);
      toeCap.position.set(0, -0.38, 0.16);
      toeCap.scale.set(0.95, 0.9, 0.6);

      // Boot Sole Tread
      const soleGeo = new THREE.BoxGeometry(0.22, 0.05, 0.36);
      const soleMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.95 });
      const sole = new THREE.Mesh(soleGeo, soleMat);
      sole.position.set(0, -0.43, 0.04);

      legGroup.add(thigh, kneePad, calf, boot, toeCap, sole);
      this.characterRoot!.add(legGroup);
    });

    // -------------------------------------------------------------------------
    // 2. PELVIS & HEAVY LEATHER TOOL BELT WITH POUCHES & SPANNER
    // -------------------------------------------------------------------------
    const pelvisGeo = new THREE.CylinderGeometry(0.28, 0.26, 0.22, 12);
    const pelvis = new THREE.Mesh(pelvisGeo, coverallMat);
    pelvis.position.y = 0.98;
    pelvis.castShadow = true;
    this.characterRoot.add(pelvis);

    const beltGeo = new THREE.CylinderGeometry(0.295, 0.295, 0.08, 14);
    const toolBelt = new THREE.Mesh(beltGeo, leatherMat);
    toolBelt.position.y = 1.02;
    toolBelt.castShadow = true;
    this.characterRoot.add(toolBelt);

    // Brass Belt Buckle
    const buckleGeo = new THREE.BoxGeometry(0.08, 0.09, 0.04);
    const buckle = new THREE.Mesh(buckleGeo, brassMat);
    buckle.position.set(0, 1.02, 0.29);
    this.characterRoot.add(buckle);

    // Leather Tool Pouches
    const pouchGeo = new THREE.BoxGeometry(0.12, 0.15, 0.08);
    const pouchL = new THREE.Mesh(pouchGeo, leatherMat);
    pouchL.position.set(0.26, 0.96, 0.12);
    pouchL.rotation.y = -Math.PI / 6;

    const pouchR = new THREE.Mesh(pouchGeo, leatherMat);
    pouchR.position.set(-0.26, 0.96, 0.12);
    pouchR.rotation.y = Math.PI / 6;

    // Spanner / Wrench hanging on holster loop
    const wrenchLoopGroup = new THREE.Group();
    wrenchLoopGroup.position.set(0.28, 0.92, -0.05);
    const wrenchShaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.02), steelMat);
    const wrenchJaw = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 10), steelMat);
    wrenchJaw.position.y = -0.14;
    wrenchLoopGroup.add(wrenchShaft, wrenchJaw);
    wrenchLoopGroup.rotation.z = -0.15;

    this.characterRoot.add(pouchL, pouchR, wrenchLoopGroup);

    // -------------------------------------------------------------------------
    // 3. ARTICULATED TORSO & HIGH-VISIBILITY SAFETY VEST
    // -------------------------------------------------------------------------
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 1.1, 0);

    const torsoGeo = new THREE.CylinderGeometry(0.32, 0.28, 0.65, 12);
    const torsoMesh = new THREE.Mesh(torsoGeo, coverallMat);
    torsoMesh.position.y = 0.32;
    torsoMesh.castShadow = true;
    this.torsoGroup.add(torsoMesh);

    // High-Vis Safety Vest Outer Shell
    const vestGeo = new THREE.CylinderGeometry(0.335, 0.295, 0.58, 12);
    const vestMesh = new THREE.Mesh(vestGeo, vestMat);
    vestMesh.position.y = 0.33;
    vestMesh.castShadow = true;
    this.torsoGroup.add(vestMesh);

    // Neck Collar
    const collarGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.12, 10);
    const collar = new THREE.Mesh(collarGeo, coverallMat);
    collar.position.y = 0.68;
    this.torsoGroup.add(collar);

    // -------------------------------------------------------------------------
    // 4. HEAD, HARDHAT / WELDING HELMET & VISOR
    // -------------------------------------------------------------------------
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.8, 0);

    const headGeo = new THREE.SphereGeometry(0.18, 14, 14);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.y = 0.08;
    headMesh.scale.set(0.9, 1.05, 0.95);
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    if (this.trade === 'WELDER') {
      // Articulated Welding Helmet with Flip-Down Tinted Visor
      const helmetGroup = new THREE.Group();
      helmetGroup.position.set(0, 0.12, 0.02);

      // Main curved face shield
      const shieldGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.36, 12, 1, false, -Math.PI * 0.45, Math.PI * 0.9);
      const shieldMat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        metalness: 0.4,
        roughness: 0.6,
        side: THREE.DoubleSide
      });
      const shield = new THREE.Mesh(shieldGeo, shieldMat);
      shield.position.set(0, 0.0, 0.05);

      // Top Dome Cap
      const domeGeo = new THREE.SphereGeometry(0.23, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const dome = new THREE.Mesh(domeGeo, shieldMat);
      dome.position.y = 0.18;

      // Tinted Glass Welding Visor Aperture (Blue Tinted Dark Glass with Specular Glare)
      const visorFrameMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.3 });
      const visorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.04), visorFrameMat);
      visorFrame.position.set(0, 0.03, 0.28);

      const visorGlassMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0369a1,
        emissiveIntensity: 0.45,
        roughness: 0.05,
        metalness: 0.95,
        transparent: true,
        opacity: 0.88
      });
      const visorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.05), visorGlassMat);
      visorGlass.position.set(0, 0.03, 0.285);

      // Side Pivot Knobs
      const knobGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8);
      knobGeo.rotateZ(Math.PI / 2);
      const knobL = new THREE.Mesh(knobGeo, brassMat);
      knobL.position.set(0.22, 0.04, 0);
      const knobR = new THREE.Mesh(knobGeo, brassMat);
      knobR.position.set(-0.22, 0.04, 0);

      helmetGroup.add(shield, dome, visorFrame, visorGlass, knobL, knobR);
      this.headGroup.add(helmetGroup);
    } else {
      // Protective Industrial Hardhat with Front Brim, Earmuffs & Badge
      const hardhatGroup = new THREE.Group();
      hardhatGroup.position.set(0, 0.18, 0);

      // Crown Dome
      const crownGeo = new THREE.SphereGeometry(0.23, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
      const crown = new THREE.Mesh(crownGeo, hardhatMat);
      crown.scale.set(0.96, 0.75, 1.12);
      crown.castShadow = true;

      // Brim
      const brimGeo = new THREE.CylinderGeometry(0.27, 0.28, 0.03, 14);
      const brim = new THREE.Mesh(brimGeo, hardhatMat);
      brim.position.set(0, -0.02, 0.02);
      brim.scale.set(0.95, 1.0, 1.15);

      // Front Crest / NNS Anchor Emblem
      const emblemMat = new THREE.MeshStandardMaterial({
        color: this.trade === 'SUPERVISOR' ? 0xdc2626 : 0x0f172a,
        metalness: 0.8,
        roughness: 0.2
      });
      const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.02), emblemMat);
      emblem.position.set(0, 0.06, 0.24);

      // Earmuffs / Hearing Protection
      const muffMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7 });
      const muffGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8);
      muffGeo.rotateZ(Math.PI / 2);
      const muffL = new THREE.Mesh(muffGeo, muffMat);
      muffL.position.set(0.21, -0.05, 0);
      const muffR = new THREE.Mesh(muffGeo, muffMat);
      muffR.position.set(-0.21, -0.05, 0);

      hardhatGroup.add(crown, brim, emblem, muffL, muffR);
      this.headGroup.add(hardhatGroup);
    }

    this.torsoGroup.add(this.headGroup);

    // -------------------------------------------------------------------------
    // 5. ARTICULATED ARMS, WORK GAUNTLETS & TRADE TOOLS
    // -------------------------------------------------------------------------
    // Left Arm (Gauntlet Glove / Auxiliary Holding)
    this.leftArmGroup = new THREE.Group();
    this.leftArmGroup.position.set(0.36, 0.52, 0);

    const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), coverallMat);
    const upperArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.32, 8), coverallMat);
    upperArmL.position.set(0.04, -0.16, 0.04);
    upperArmL.rotation.z = -0.18;

    const elbowL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), coverallMat);
    elbowL.position.set(0.08, -0.32, 0.08);

    // Heavy Leather Gauntlet Work Glove
    const forearmL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.3, 8), leatherMat);
    forearmL.position.set(0.06, -0.45, 0.16);
    forearmL.rotation.x = Math.PI / 4;

    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.06), leatherMat);
    handL.position.set(0.06, -0.56, 0.25);

    this.leftArmGroup.add(shoulderL, upperArmL, elbowL, forearmL, handL);
    this.torsoGroup.add(this.leftArmGroup);

    // Right Arm (Articulated Holding Welding Stinger Torch / Tool)
    this.rightArmGroup = new THREE.Group();
    this.rightArmGroup.position.set(-0.36, 0.52, 0);

    const shoulderR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), coverallMat);
    const upperArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.32, 8), coverallMat);
    upperArmR.position.set(-0.04, -0.16, 0.08);
    upperArmR.rotation.x = Math.PI / 6;

    const elbowR = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), coverallMat);
    elbowR.position.set(-0.06, -0.3, 0.18);

    const forearmR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.3, 8), leatherMat);
    forearmR.position.set(-0.04, -0.38, 0.32);
    forearmR.rotation.x = Math.PI / 3;

    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.06), leatherMat);
    handR.position.set(-0.03, -0.46, 0.44);

    this.rightArmGroup.add(shoulderR, upperArmR, elbowR, forearmR, handR);

    // Tool Equipment attached to Right Hand
    const toolGroup = new THREE.Group();
    toolGroup.position.set(-0.03, -0.48, 0.48);

    if (this.trade === 'WELDER') {
      // Precision Welding Stinger Electrode Torch with Trailing Rubber Lead Cable
      const torchHandleMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4, metalness: 0.6 });
      const torchHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.32, 8), torchHandleMat);
      torchHandle.rotation.x = Math.PI / 3;

      // Ceramic Cup Nozzle & Copper Collet
      const copperMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.2 });
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 8), copperMat);
      nozzle.position.set(0, -0.16, 0.1);
      nozzle.rotation.x = Math.PI / 3;

      // Tungsten Electrode Needle Point
      const tungstenMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.8
      });
      const tungsten = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.06, 6), tungstenMat);
      tungsten.position.set(0, -0.21, 0.13);
      tungsten.rotation.x = Math.PI / 3;

      // Trailing Rubber Power Cable
      const cableMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.9 });
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6), cableMat);
      cable.position.set(0, 0.18, -0.12);
      cable.rotation.x = Math.PI / 4;

      toolGroup.add(torchHandle, nozzle, tungsten, cable);

      // Welding Arc Point Light
      this.sparkLight = new THREE.PointLight(0x67e8f9, 0, 10);
      this.sparkLight.position.set(0, -0.24, 0.15);
      toolGroup.add(this.sparkLight);
    } else if (this.trade === 'PIPEFITTER') {
      // Heavy Heavy-Duty Red Industrial Pipe Wrench
      const wrenchBodyMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.7, roughness: 0.3 });
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.06), wrenchBodyMat);
      handle.rotation.z = Math.PI / 4;

      const hookJaw = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.07), steelMat);
      hookJaw.position.set(0.18, 0.18, 0);

      const adjustWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), brassMat);
      adjustWheel.position.set(0.12, 0.12, 0);

      toolGroup.add(handle, hookJaw, adjustWheel);
    } else if (this.trade === 'SUPERVISOR') {
      // Field Clipboard with Blueprint Sheet Papers
      const boardMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.6 });
      const paperMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 });
      const clipMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });

      const board = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.02), boardMat);
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.01), paperMat);
      paper.position.z = 0.015;
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.03), clipMat);
      clip.position.set(0, 0.18, 0.02);

      toolGroup.add(board, paper, clip);
      toolGroup.rotation.set(0.4, 0.2, 0.2);
    } else if (this.trade === 'RIGGER') {
      // Heavy Forged Rigging Shackle & Steel Hoist Ring
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 14), steelMat);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 8), brassMat);
      pin.rotateZ(Math.PI / 2);
      toolGroup.add(shackle, pin);
    } else {
      // Electrician Multimeter & Test Probe
      const meterMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
      const meter = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.06), meterMat);
      const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.25, 6), steelMat);
      probe.position.set(0.08, 0.05, 0.05);
      toolGroup.add(meter, probe);
    }

    this.toolArm = toolGroup as unknown as THREE.Mesh;
    this.rightArmGroup.add(toolGroup);
    this.torsoGroup.add(this.rightArmGroup);

    this.characterRoot.add(this.torsoGroup);

    // -------------------------------------------------------------------------
    // 6. OVERHEAD TRADE BILLBOARD SPRITE BADGE
    // -------------------------------------------------------------------------
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 80;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

      // Styled industrial rounded container
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.roundRect(8, 8, 304, 64, 12);
      ctx.fill();

      // Border with trade accent
      ctx.strokeStyle = this.trade === 'SUPERVISOR' ? '#ef4444' :
                        this.trade === 'WELDER' ? '#38bdf8' :
                        this.trade === 'PIPEFITTER' ? '#f97316' : '#facc15';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Department sub-badge
      ctx.font = '700 13px "Inter", sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(this.department.toUpperCase(), 160, 30);

      // Name and Trade
      ctx.font = '900 20px "Chakra Petch", "Courier New", monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`${this.name}  [${this.trade}]`, 160, 56);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 2.75, 0);
      sprite.scale.set(2.0, 0.5, 1);
      this.mesh.add(sprite);
    }
  }

  public animate(deltaTime: number) {
    this.workPhase += deltaTime * 3.2;
    this.breathingPhase += deltaTime * 2.2;

    // Natural smooth breathing motion on torso and chest
    if (this.torsoGroup) {
      const breathSway = Math.sin(this.breathingPhase) * 0.015;
      this.torsoGroup.position.y = 1.1 + breathSway;
      this.torsoGroup.scale.set(
        1.0 + Math.cos(this.breathingPhase) * 0.01,
        1.0 + breathSway * 0.5,
        1.0 + Math.sin(this.breathingPhase) * 0.015
      );
    }

    // Subtle head glance / idle observation
    if (this.headGroup) {
      this.headGroup.rotation.y = Math.sin(this.breathingPhase * 0.4) * 0.12;
      this.headGroup.rotation.x = Math.sin(this.breathingPhase * 0.7) * 0.05 + 0.08;
    }

    // Arm and Tool Work Action Kinematics
    if (this.trade === 'WELDER') {
      // Precision weld bead weave oscillation (Figure-8 stringer bead motion)
      const weaveX = Math.sin(this.workPhase * 3.0) * 0.03;
      const weaveY = Math.cos(this.workPhase * 6.0) * 0.015;
      const isWelding = (Math.sin(this.workPhase * 1.5) > -0.2);

      this.isWeldingArcActive = isWelding;

      if (this.rightArmGroup) {
        this.rightArmGroup.rotation.x = 0.15 + (isWelding ? 0.25 : 0.0) + Math.sin(this.workPhase * 0.8) * 0.04;
        this.rightArmGroup.rotation.y = weaveX * 2.0;
        this.rightArmGroup.rotation.z = -0.1 + weaveY;
      }

      if (this.leftArmGroup) {
        // Supporting gauntlet steadies the workpiece
        this.leftArmGroup.rotation.x = 0.2 + Math.sin(this.workPhase * 0.5) * 0.02;
      }

      if (this.sparkLight) {
        if (isWelding) {
          // Arc flicker with intense electric cyan/white strobing
          this.arcIntensity = (Math.random() < 0.2) ? 0.8 : (2.5 + Math.random() * 4.0);
          this.sparkLight.color.setHex(Math.random() < 0.3 ? 0xa5f3fc : 0x38bdf8);
        } else {
          this.arcIntensity = THREE.MathUtils.lerp(this.arcIntensity, 0, Math.min(1.0, 12.0 * deltaTime));
        }
        this.sparkLight.intensity = this.arcIntensity;
      }
    } else if (this.trade === 'PIPEFITTER') {
      // Ratchet torque wrenching motion
      const wrenching = Math.sin(this.workPhase * 1.8);
      if (this.rightArmGroup) {
        this.rightArmGroup.rotation.x = 0.3 + wrenching * 0.25;
        this.rightArmGroup.rotation.z = wrenching * 0.15;
      }
    } else if (this.trade === 'SUPERVISOR') {
      // Clipboard review and pointing gesture
      const inspectPhase = Math.sin(this.workPhase * 0.6);
      if (this.rightArmGroup) {
        this.rightArmGroup.rotation.x = 0.2 + inspectPhase * 0.1;
        this.rightArmGroup.rotation.y = inspectPhase * 0.15;
      }
    } else {
      // Rigger / Electrician tooling motion
      if (this.rightArmGroup) {
        this.rightArmGroup.rotation.x = 0.2 + Math.sin(this.workPhase) * 0.15;
      }
    }
  }

  public getNextDialogue(): ShipbuilderDialogue {
    const d = this.dialogueTree[this.currentDialogueIndex];
    this.currentDialogueIndex = (this.currentDialogueIndex + 1) % this.dialogueTree.length;
    return d;
  }
}


