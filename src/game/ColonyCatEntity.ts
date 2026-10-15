import * as THREE from 'three';
import { ModelManager } from '../core/ModelManager';

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
  public readyPromise: Promise<void> = Promise.resolve();

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
        this.readyPromise = ModelManager.loadCatModel().then((gltf) => {
          this.gltfModel = gltf.scene;
          this.gltfModel.scale.set(1.8, 1.8, 1.8);
          this.gltfModel.position.set(0, 0, 0);

          const colonyFurMat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.7,
            side: THREE.DoubleSide
          });

          this.gltfModel.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.frustumCulled = false;
              (child as THREE.Mesh).material = colonyFurMat;
            }
          });

          if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(this.gltfModel);
            // Look for sitting, sleeping, survey standing, or stretching animations
            const sitClip = gltf.animations.find(a => a.name.includes('Sitting_00-IP') || a.name.includes('Sitting')) ||
                            gltf.animations.find(a => a.name.includes('Idle_00-IP') || a.name.includes('Idle_03_LookAround')) ||
                            gltf.animations[0];
            if (sitClip) {
              const action = this.mixer.clipAction(sitClip);
              action.play();
            }
          }

          this.mesh.add(this.gltfModel);
          this.mesh.remove(proceduralGroup);
          proceduralGroup.visible = false;
          this.createNametagSprite(1.15);
        }).catch(() => {
          this.buildCatMesh(color, proceduralGroup);
          this.createNametagSprite(1.15);
        });
      } else {
        this.buildCatMesh(color, proceduralGroup);
        this.createNametagSprite(1.15);
      }
    }
  }

  public update(deltaTime: number) {
    if (this.mixer) {
      this.mixer.update(deltaTime);
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
      const ctx = nameCanvas.getContext('2d', { willReadFrequently: true })!;
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
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xfcd34d, roughness: 0.7 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8 });
    const scrubsMat = new THREE.MeshStandardMaterial({ color: 0x0d9488, roughness: 0.6 }); // Marine Teal scrubs
    const labCoatMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 }); // Clean white lab coat
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 }); // Navy shipyard work trousers
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 }); // Black safety boots
    const hardhatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.85, roughness: 0.2 });
    const stethMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.5 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 }); // Nitrile medical gloves

    const humanGroup = new THREE.Group();

    // 1. Boots & Legs (Articulated Left and Right)
    for (const dx of [-0.14, 0.14]) {
      // Boot
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.28), bootMat);
      boot.position.set(dx, 0.07, 0.03);
      boot.castShadow = true;
      humanGroup.add(boot);

      // Trouser Leg
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.76, 10), pantsMat);
      leg.position.set(dx, 0.48, 0);
      leg.castShadow = true;
      humanGroup.add(leg);
    }

    // 2. Hips & Pelvis
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.26), pantsMat);
    pelvis.position.set(0, 0.92, 0);
    pelvis.castShadow = true;
    humanGroup.add(pelvis);

    // 3. Torso (Teal Scrubs under Lab Coat)
    const scrubsTorso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.24), scrubsMat);
    scrubsTorso.position.set(0, 1.25, 0);
    scrubsTorso.castShadow = true;
    humanGroup.add(scrubsTorso);

    // White Lab Coat (Body and Lower Skirt / Flaps)
    const coatSides = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.54, 0.26), labCoatMat);
    coatSides.position.set(0, 1.25, -0.01);
    coatSides.castShadow = true;
    humanGroup.add(coatSides);

    const coatSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.28), labCoatMat);
    coatSkirt.position.set(0, 0.86, -0.01);
    coatSkirt.castShadow = true;
    humanGroup.add(coatSkirt);

    // Lab Coat Open Lapels (Revealing scrubs neckline)
    const lapelL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.04), labCoatMat);
    lapelL.position.set(-0.12, 1.34, 0.13);
    lapelL.rotation.z = -0.15;
    const lapelR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.04), labCoatMat);
    lapelR.position.set(0.12, 1.34, 0.13);
    lapelR.rotation.z = 0.15;
    humanGroup.add(lapelL, lapelR);

    // Shipyard ID Badge & Dosimeter clipped to coat pocket
    const idBadge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.02), new THREE.MeshStandardMaterial({ color: 0x38bdf8 }));
    idBadge.position.set(-0.15, 1.35, 0.14);
    humanGroup.add(idBadge);

    // 4. Stethoscope (Curved around neck, chest piece resting on scrubs)
    const stethLoop = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 8, 16, Math.PI * 1.2), stethMat);
    stethLoop.position.set(0, 1.48, 0.04);
    stethLoop.rotation.x = Math.PI / 2.3;
    const stethBell = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 12), chromeMat);
    stethBell.position.set(0.05, 1.30, 0.14);
    stethBell.rotation.x = Math.PI / 2;
    humanGroup.add(stethLoop, stethBell);

    // 5. Left Arm with Veterinary Clipboard
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.45, 8), labCoatMat);
    armL.position.set(-0.28, 1.22, 0.08);
    armL.rotation.x = -Math.PI / 3.8;
    armL.castShadow = true;
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), gloveMat);
    handL.position.set(-0.28, 1.05, 0.22);
    humanGroup.add(armL, handL);

    // Diagnostic Clipboard
    const clipboardBoard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.02), new THREE.MeshStandardMaterial({ color: 0xb45309 }));
    clipboardBoard.position.set(-0.22, 1.14, 0.26);
    clipboardBoard.rotation.x = -Math.PI / 4;
    clipboardBoard.rotation.y = 0.2;
    const clipboardPaper = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.26), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
    clipboardPaper.position.set(0, 0, 0.012);
    clipboardBoard.add(clipboardPaper);
    humanGroup.add(clipboardBoard);

    // 6. Right Arm (Gesturing / resting gently)
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.52, 8), labCoatMat);
    armR.position.set(0.28, 1.22, 0.02);
    armR.rotation.z = -0.12;
    armR.castShadow = true;
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), gloveMat);
    handR.position.set(0.32, 0.94, 0.04);
    humanGroup.add(armR, handR);

    // 7. Head, Hair, Safety Glasses & Hardhat
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 8), skinMat);
    neck.position.set(0, 1.58, 0);
    humanGroup.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 14), skinMat);
    head.position.set(0, 1.76, 0);
    head.scale.set(0.9, 1.05, 0.95);
    head.castShadow = true;
    humanGroup.add(head);

    // Stylized swept hair
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), hairMat);
    hair.position.set(0, 1.80, -0.04);
    hair.scale.set(0.95, 0.95, 1.05);
    humanGroup.add(hair);

    // Turquoise Tinted Safety Glasses
    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.08), new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      metalness: 0.8
    }));
    glasses.position.set(0, 1.77, 0.14);
    humanGroup.add(glasses);

    // White Veterinary Hardhat with Green Cross
    const hardhatDome = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hardhatMat);
    hardhatDome.position.set(0, 1.84, 0);
    hardhatDome.castShadow = true;
    const hardhatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 16), hardhatMat);
    hardhatBrim.position.set(0, 1.84, 0.02);
    hardhatDome.add(hardhatBrim);

    // Green Medical Cross Emblem on front of hardhat
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const crossH = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.026), crossMat);
    crossH.position.set(0, 0.08, 0.22);
    const crossV = new THREE.Mesh(new THREE.PlaneGeometry(0.026, 0.08), crossMat);
    crossV.position.set(0, 0.08, 0.22);
    hardhatDome.add(crossH, crossV);
    humanGroup.add(hardhatDome);

    this.mesh.add(humanGroup);
    this.createNametagSprite(2.3);
  }

  private createNametagSprite(yPos: number): void {
    if (typeof document !== 'undefined') {
      const nameCanvas = document.createElement('canvas');
      nameCanvas.width = 300;
      nameCanvas.height = 64;
      const ctx = nameCanvas.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.roundRect(10, 10, 280, 44, 10);
      ctx.fill();
      ctx.strokeStyle = this.isHuman ? '#38bdf8' : '#4ade80';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = this.isHuman ? '#38bdf8' : '#4ade80';
      ctx.textAlign = 'center';
      ctx.fillText(this.name, 150, 38);

      const texture = new THREE.CanvasTexture(nameCanvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, yPos, 0);
      sprite.scale.set(this.isHuman ? 2.0 : 1.5, this.isHuman ? 0.45 : 0.35, 1);
      this.mesh.add(sprite);
    }
  }

  public getNextDialogue(): ColonyDialogue {
    const d = this.dialogueTree[this.currentDialogueIndex];
    this.currentDialogueIndex = (this.currentDialogueIndex + 1) % this.dialogueTree.length;
    return d;
  }
}

