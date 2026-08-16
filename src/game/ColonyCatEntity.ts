import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface ColonyDialogue {
  speaker: string;
  role: string;
  text: string;
  actionPrompt?: string;
  actionReward?: { type: 'HEAL' | 'CLEANSE' | 'BUFF' | 'XP'; amount: number };
}

export class ColonyCatEntity {
  public mesh: THREE.Group;
  public name: string;
  public role: string;
  public dialogueTree: ColonyDialogue[];
  public currentDialogueIndex: number = 0;
  public isHuman: boolean = false;
  private gltfModel: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;

  constructor(name: string, role: string, position: THREE.Vector3, color: number, dialogue: ColonyDialogue[], isHuman: boolean = false) {
    this.name = name;
    this.role = role;
    this.dialogueTree = dialogue;
    this.isHuman = isHuman;

    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);

    if (isHuman) {
      this.buildHumanMesh();
    } else {
      // 3D Cat Model Loader for Colony NPCs
      const proceduralGroup = new THREE.Group();
      this.mesh.add(proceduralGroup);

      if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
        const gltfLoader = new GLTFLoader();
        gltfLoader.load('/models/cat.glb', (gltf) => {
          this.gltfModel = gltf.scene;
          this.gltfModel.scale.set(0.016, 0.016, 0.016);
          this.gltfModel.position.set(0, 0, 0);

          this.gltfModel.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              (child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.7
              });
            }
          });

          if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(this.gltfModel);
            const idleAction = this.mixer.clipAction(gltf.animations[0]);
            idleAction.play();
          }

          this.mesh.add(this.gltfModel);
          proceduralGroup.visible = false;
        }, undefined, () => {
          this.buildCatMesh(color, proceduralGroup);
        });
      } else {
        this.buildCatMesh(color, proceduralGroup);
      }
    }
  }

  private buildCatMesh(color: number, targetGroup?: THREE.Group) {
    const group = targetGroup || this.mesh;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.4 });

    // Torso / Spine
    const bodyGeo = new THREE.CapsuleGeometry(0.13, 0.5, 8, 12);
    bodyGeo.rotateZ(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.32;
    body.castShadow = true;
    group.add(body);

    // White Chest Bib
    const bib = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), whiteMat);
    bib.position.set(0.18, 0.28, 0);
    bib.scale.set(0.6, 0.9, 0.6);
    this.mesh.add(bib);

    // Head
    const headGeo = new THREE.SphereGeometry(0.15, 12, 12);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.set(0.32, 0.46, 0);
    head.castShadow = true;
    this.mesh.add(head);

    // White Muzzle
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), whiteMat);
    muzzle.position.set(0.42, 0.42, 0);
    muzzle.scale.set(1.1, 0.7, 0.9);
    this.mesh.add(muzzle);

    // Alert Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
    eyeL.position.set(0.42, 0.49, 0.06);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
    eyeR.position.set(0.42, 0.49, -0.06);
    this.mesh.add(eyeL, eyeR);

    // Ears
    const earGeo = new THREE.ConeGeometry(0.05, 0.09, 4);
    const earL = new THREE.Mesh(earGeo, mat);
    earL.position.set(0.3, 0.58, 0.08);
    earL.rotation.z = -0.2;
    this.mesh.add(earL);

    const earR = new THREE.Mesh(earGeo, mat);
    earR.position.set(0.3, 0.58, -0.08);
    earR.rotation.z = -0.2;
    this.mesh.add(earR);

    // 4 Articulated Legs with White Paws
    const createColonyLeg = (isFront: boolean, isLeft: boolean) => {
      const leg = new THREE.Group();
      const x = isFront ? 0.22 : -0.22;
      const z = isLeft ? 0.09 : -0.09;
      leg.position.set(x, 0.28, z);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.22, 6), mat);
      upper.position.y = -0.1;
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), whiteMat);
      paw.position.set(0, -0.2, 0.02);
      leg.add(upper, paw);
      this.mesh.add(leg);
      return leg;
    };

    createColonyLeg(true, true);
    createColonyLeg(true, false);
    createColonyLeg(false, true);
    createColonyLeg(false, false);

    // Friendly Nametag Billboard Aura
    if (typeof document !== 'undefined') {
      const nameCanvas = document.createElement('canvas');
      nameCanvas.width = 256;
      nameCanvas.height = 64;
      const ctx = nameCanvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.roundRect(10, 10, 236, 44, 10);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = 'bold 22px Courier New';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.fillText(this.name, 128, 38);

      const texture = new THREE.CanvasTexture(nameCanvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 1.0, 0);
      sprite.scale.set(1.5, 0.38, 1);
      this.mesh.add(sprite);
    }
  }

  private buildHumanMesh() {
    const coatMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 }); // Hi-vis safety coat
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.8 });
    const vestMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 }); // Neon yellow vest

    // Body / Coat
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.4, 12), coatMat);
    body.position.y = 1.1;
    body.castShadow = true;
    this.mesh.add(body);

    // Vest
    const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.41, 0.8, 12), vestMat);
    vest.position.y = 1.3;
    this.mesh.add(vest);

    // Head & Hardhat
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), headMat);
    head.position.y = 2.0;
    this.mesh.add(head);

    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    hat.position.y = 2.22;
    this.mesh.add(hat);

    // Nametag
    if (typeof document !== 'undefined') {
      const nameCanvas = document.createElement('canvas');
      nameCanvas.width = 300;
      nameCanvas.height = 64;
      const ctx = nameCanvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.roundRect(10, 10, 280, 44, 10);
      ctx.fill();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = 'bold 20px Courier New';
      ctx.fillStyle = '#4ade80';
      ctx.textAlign = 'center';
      ctx.fillText(this.name, 150, 38);

      const texture = new THREE.CanvasTexture(nameCanvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 2.7, 0);
      sprite.scale.set(2.0, 0.45, 1);
      this.mesh.add(sprite);
    }
  }

  public getNextDialogue(): ColonyDialogue {
    const d = this.dialogueTree[this.currentDialogueIndex];
    this.currentDialogueIndex = (this.currentDialogueIndex + 1) % this.dialogueTree.length;
    return d;
  }
}
