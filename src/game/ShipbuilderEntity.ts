import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
  
  private toolArm: THREE.Mesh | null = null;
  private sparkLight: THREE.PointLight | null = null;
  private workPhase: number = 0;
  private gltfModel: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;

  constructor(
    name: string,
    department: string,
    trade: 'WELDER' | 'PIPEFITTER' | 'RIGGER' | 'ELECTRICIAN' | 'SUPERVISOR',
    position: THREE.Vector3,
    heading: number,
    dialogues: ShipbuilderDialogue[],
    isFemale: boolean = false
  ) {
    this.name = name;
    this.department = department;
    this.trade = trade;
    this.dialogueTree = dialogues;

    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);
    this.mesh.rotation.y = heading;

    // Load Real 3D Shipbuilder Character Model (in browser)
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const modelFile = isFemale ? '/models/009_female_worker_welder_07.glb' : '/models/009_male_worker_welder_02.glb';
      const gltfLoader = new GLTFLoader();
      gltfLoader.load(modelFile, (gltf) => {
        this.gltfModel = gltf.scene;
        this.gltfModel.scale.set(1.0, 1.0, 1.0);
        this.gltfModel.position.set(0, 0, 0);

        this.gltfModel.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.gltfModel);
          const action = this.mixer.clipAction(gltf.animations[0]);
          action.play();
        }

        this.mesh.add(this.gltfModel);
      }, undefined, () => {
        this.buildShipbuilderMesh();
      });
    } else {
      this.buildShipbuilderMesh();
    }
  }

  private buildShipbuilderMesh() {
    // Workwear Materials
    const coverallColor = this.trade === 'WELDER' ? 0x1e3a8a : // Dark Navy
                          this.trade === 'PIPEFITTER' ? 0xb45309 : // Heavy Canvas Brown
                          this.trade === 'RIGGER' ? 0x065f46 : // Forest Green Rigging
                          this.trade === 'ELECTRICIAN' ? 0x475569 : 0x0f172a; // Slate / Tech

    const coverallMat = new THREE.MeshStandardMaterial({ color: coverallColor, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.7 });
    const vestMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 }); // Hi-Vis Safety Vest
    const hardhatMat = new THREE.MeshStandardMaterial({
      color: this.trade === 'SUPERVISOR' ? 0xffffff : 0xfacc15, // White hardhat for leadership, Yellow for craft
      roughness: 0.3
    });

    // 1. Legs / Workboots
    const legGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.9, 8);
    const legL = new THREE.Mesh(legGeo, coverallMat);
    legL.position.set(0.18, 0.45, 0);
    legL.castShadow = true;
    const legR = new THREE.Mesh(legGeo, coverallMat);
    legR.position.set(-0.18, 0.45, 0);
    legR.castShadow = true;
    this.mesh.add(legL, legR);

    const bootGeo = new THREE.BoxGeometry(0.18, 0.18, 0.32);
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9 });
    const bootL = new THREE.Mesh(bootGeo, bootMat);
    bootL.position.set(0.18, 0.09, 0.05);
    const bootR = new THREE.Mesh(bootGeo, bootMat);
    bootR.position.set(-0.18, 0.09, 0.05);
    this.mesh.add(bootL, bootR);

    // 2. Torso / Coveralls
    const torsoGeo = new THREE.CylinderGeometry(0.32, 0.3, 0.9, 10);
    const torso = new THREE.Mesh(torsoGeo, coverallMat);
    torso.position.y = 1.35;
    torso.castShadow = true;
    this.mesh.add(torso);

    // 3. Hi-Vis Safety Vest
    const vestGeo = new THREE.CylinderGeometry(0.33, 0.31, 0.65, 10);
    const vest = new THREE.Mesh(vestGeo, vestMat);
    vest.position.y = 1.4;
    this.mesh.add(vest);

    // 4. Head & Hardhat
    const headGeo = new THREE.SphereGeometry(0.2, 12, 12);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 2.0;
    head.castShadow = true;
    this.mesh.add(head);

    const hatGeo = new THREE.CylinderGeometry(0.26, 0.28, 0.14, 12);
    const hat = new THREE.Mesh(hatGeo, hardhatMat);
    hat.position.y = 2.18;
    this.mesh.add(hat);

    // Hardhat Brim
    const brimGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.03, 12);
    const brim = new THREE.Mesh(brimGeo, hardhatMat);
    brim.position.y = 2.12;
    this.mesh.add(brim);

    // 5. Tool in Hand based on Trade
    if (this.trade === 'WELDER') {
      // Welding Torch & Face Shield
      const torchMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.8 });
      this.toolArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), torchMat);
      this.toolArm.position.set(0.35, 1.4, 0.35);
      this.toolArm.rotation.x = Math.PI / 3;
      this.mesh.add(this.toolArm);

      // Welding Arc Light
      this.sparkLight = new THREE.PointLight(0x60a5fa, 0, 8);
      this.sparkLight.position.set(0.35, 1.2, 0.6);
      this.mesh.add(this.sparkLight);
    } else if (this.trade === 'PIPEFITTER') {
      // Pipe Wrench
      const wrenchMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.7 });
      this.toolArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), wrenchMat);
      this.toolArm.position.set(0.35, 1.3, 0.25);
      this.toolArm.rotation.z = Math.PI / 4;
      this.mesh.add(this.toolArm);
    } else if (this.trade === 'RIGGER') {
      // Rigging Shackles & Cable Hook
      const hookMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9 });
      this.toolArm = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 12), hookMat);
      this.toolArm.position.set(0.35, 1.3, 0.25);
      this.mesh.add(this.toolArm);
    }

    // 6. Overhead Trade Billboard Tag
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 280;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.roundRect(10, 10, 260, 44, 10);
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = 'bold 18px Courier New';
      ctx.fillStyle = '#facc15';
      ctx.textAlign = 'center';
      ctx.fillText(`${this.name} (${this.trade})`, 140, 38);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 2.6, 0);
      sprite.scale.set(1.8, 0.42, 1);
      this.mesh.add(sprite);
    }
  }

  public animate(deltaTime: number) {
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }

    this.workPhase += deltaTime * 3.5;

    if (this.trade === 'WELDER' && this.sparkLight) {
      // Arc flickering effect
      const isWelding = Math.sin(this.workPhase * 2.5) > 0.1;
      this.sparkLight.intensity = isWelding ? (1.5 + Math.random() * 2.5) : 0;
      if (this.toolArm) {
        this.toolArm.position.y = 1.4 + Math.sin(this.workPhase * 4) * 0.03;
      }
    } else if (this.toolArm) {
      // Light work movement
      this.toolArm.rotation.x = Math.sin(this.workPhase) * 0.2 + (this.trade === 'RIGGER' ? 0 : 0.5);
    }
  }

  public getNextDialogue(): ShipbuilderDialogue {
    const d = this.dialogueTree[this.currentDialogueIndex];
    this.currentDialogueIndex = (this.currentDialogueIndex + 1) % this.dialogueTree.length;
    return d;
  }
}
