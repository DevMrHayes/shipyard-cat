import * as THREE from 'three';

export interface WeldingStation {
  position: THREE.Vector3;
  light: THREE.PointLight;
  particles: THREE.Points;
  particleVelocities: Float32Array;
  particleLifetimes: Float32Array;
  maxLifetimes: Float32Array;
  particleCount: number;
  burstTimer: number;
  active: boolean;
  baseLightIntensity: number;
}

export interface SteamVent {
  position: THREE.Vector3;
  particles: THREE.Points;
  particleVelocities: Float32Array;
  particleLifetimes: Float32Array;
  maxLifetimes: Float32Array;
  particleBaseAlpha: Float32Array;
  particleCount: number;
}

export class FabAndSubFXSystem {
  private scene: THREE.Scene;
  private weldingStations: WeldingStation[] = [];
  private steamVents: SteamVent[] = [];
  private sparkMaterial!: THREE.PointsMaterial;
  private steamMaterial!: THREE.PointsMaterial;
  private sharedSparkTexture!: THREE.Texture;
  private sharedSteamTexture!: THREE.Texture;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initTextures();
    this.initMaterials();
  }

  private initTextures(): void {
    // Procedural sharp spark glow texture
    const sparkCanvas = document.createElement('canvas');
    sparkCanvas.width = 64;
    sparkCanvas.height = 64;
    const sparkCtx = sparkCanvas.getContext('2d');
    if (sparkCtx) {
      const gradient = sparkCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.2, 'rgba(255, 230, 160, 0.9)');
      gradient.addColorStop(0.5, 'rgba(255, 120, 30, 0.4)');
      gradient.addColorStop(1, 'rgba(255, 60, 0, 0)');
      sparkCtx.fillStyle = gradient;
      sparkCtx.fillRect(0, 0, 64, 64);
    }
    this.sharedSparkTexture = new THREE.CanvasTexture(sparkCanvas);

    // Procedural soft billowing steam texture
    const steamCanvas = document.createElement('canvas');
    steamCanvas.width = 128;
    steamCanvas.height = 128;
    const steamCtx = steamCanvas.getContext('2d');
    if (steamCtx) {
      const gradient = steamCtx.createRadialGradient(64, 64, 4, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(240, 248, 255, 0.85)');
      gradient.addColorStop(0.35, 'rgba(220, 230, 245, 0.4)');
      gradient.addColorStop(0.7, 'rgba(200, 215, 230, 0.12)');
      gradient.addColorStop(1, 'rgba(180, 200, 220, 0)');
      steamCtx.fillStyle = gradient;
      steamCtx.fillRect(0, 0, 128, 128);
    }
    this.sharedSteamTexture = new THREE.CanvasTexture(steamCanvas);
  }

  private initMaterials(): void {
    this.sparkMaterial = new THREE.PointsMaterial({
      size: 0.55,
      map: this.sharedSparkTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      vertexColors: true
    });

    this.steamMaterial = new THREE.PointsMaterial({
      size: 3.2,
      map: this.sharedSteamTexture,
      blending: THREE.NormalBlending,
      depthWrite: false,
      transparent: true,
      vertexColors: true
    });
  }

  public createWeldingStation(position: THREE.Vector3, particleCount = 120): WeldingStation {
    const pCount = particleCount;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(pCount * 3);
    const colors = new Float32Array(pCount * 3);
    const velocities = new Float32Array(pCount * 3);
    const lifetimes = new Float32Array(pCount);
    const maxLifetimes = new Float32Array(pCount);

    for (let i = 0; i < pCount; i++) {
      positions[i * 3 + 0] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      colors[i * 3 + 0] = 1.0;
      colors[i * 3 + 1] = 0.95;
      colors[i * 3 + 2] = 0.8;

      lifetimes[i] = -Math.random() * 0.8;
      maxLifetimes[i] = 0.45 + Math.random() * 0.55;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particles = new THREE.Points(geometry, this.sparkMaterial);
    particles.frustumCulled = false;
    this.scene.add(particles);

    const light = new THREE.PointLight(0x7df9ff, 4.0, 28, 2.0);
    light.position.copy(position);
    light.position.y += 0.3;
    this.scene.add(light);

    const station: WeldingStation = {
      position: position.clone(),
      light,
      particles,
      particleVelocities: velocities,
      particleLifetimes: lifetimes,
      maxLifetimes,
      particleCount: pCount,
      burstTimer: Math.random() * 2.0,
      active: true,
      baseLightIntensity: 4.5
    };

    this.weldingStations.push(station);
    return station;
  }

  public createSteamVent(position: THREE.Vector3, particleCount = 75): SteamVent {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const lifetimes = new Float32Array(particleCount);
    const maxLifetimes = new Float32Array(particleCount);
    const baseAlpha = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      lifetimes[i] = Math.random() * 3.5;
      maxLifetimes[i] = 2.5 + Math.random() * 2.0;
      baseAlpha[i] = 0.45 + Math.random() * 0.35;

      const progress = lifetimes[i] / maxLifetimes[i];
      positions[i * 3 + 0] = position.x + (Math.random() - 0.5) * 0.8;
      positions[i * 3 + 1] = position.y + progress * 6.5;
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.8;

      velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.4;
      velocities[i * 3 + 1] = 1.4 + Math.random() * 1.2;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.4;

      colors[i * 3 + 0] = 0.9;
      colors[i * 3 + 1] = 0.94;
      colors[i * 3 + 2] = 0.98;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particles = new THREE.Points(geometry, this.steamMaterial);
    particles.frustumCulled = false;
    this.scene.add(particles);

    const vent: SteamVent = {
      position: position.clone(),
      particles,
      particleVelocities: velocities,
      particleLifetimes: lifetimes,
      maxLifetimes,
      particleBaseAlpha: baseAlpha,
      particleCount
    };

    this.steamVents.push(vent);
    return vent;
  }

  public generateAnechoicTileTexture(width = 512, height = 512): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#181b20';
      ctx.fillRect(0, 0, width, height);

      const tileSize = 32;
      const margin = 2;

      for (let y = 0; y < height; y += tileSize) {
        for (let x = 0; x < width; x += tileSize) {
          const shadeOffset = Math.floor((Math.random() - 0.5) * 12);
          const r = Math.max(16, Math.min(38, 26 + shadeOffset));
          const g = Math.max(18, Math.min(42, 29 + shadeOffset));
          const b = Math.max(22, Math.min(48, 35 + shadeOffset));

          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(x + margin, y + margin, tileSize - margin * 2, tileSize - margin * 2);

          // Subtle internal anechoic absorption perforation
          ctx.fillStyle = 'rgba(10, 12, 16, 0.45)';
          ctx.beginPath();
          ctx.arc(x + tileSize / 2, y + tileSize / 2, tileSize / 6, 0, Math.PI * 2);
          ctx.fill();

          // Bevel edge highlight
          ctx.strokeStyle = 'rgba(60, 70, 85, 0.25)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + margin + 0.5, y + margin + 0.5, tileSize - margin * 2 - 1, tileSize - margin * 2 - 1);
        }
      }

      // Micro synthetic rubber grain
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 10;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(12, 6);
    return texture;
  }

  public update(delta: number): void {
    const gravity = -14.8;
    const floorY = 0.05;

    // 1. Update Welding Sparks & Arc Flash Flicker
    for (let sIdx = 0; sIdx < this.weldingStations.length; sIdx++) {
      const st = this.weldingStations[sIdx];
      st.burstTimer -= delta;

      if (st.burstTimer <= 0) {
        st.active = Math.random() > 0.28;
        st.burstTimer = st.active ? 1.0 + Math.random() * 2.2 : 0.4 + Math.random() * 0.9;
      }

      const posAttr = st.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = st.particles.geometry.getAttribute('color') as THREE.BufferAttribute;
      const pArr = posAttr.array as Float32Array;
      const cArr = colAttr.array as Float32Array;

      let activeSparks = 0;

      for (let i = 0; i < st.particleCount; i++) {
        st.particleLifetimes[i] += delta;

        if (st.particleLifetimes[i] > st.maxLifetimes[i]) {
          if (st.active) {
            // Respawn spark with cone velocity
            st.particleLifetimes[i] = 0;
            st.maxLifetimes[i] = 0.35 + Math.random() * 0.45;

            pArr[i * 3 + 0] = st.position.x + (Math.random() - 0.5) * 0.3;
            pArr[i * 3 + 1] = st.position.y + (Math.random() - 0.5) * 0.2;
            pArr[i * 3 + 2] = st.position.z + (Math.random() - 0.5) * 0.3;

            const spreadTheta = Math.random() * Math.PI * 2;
            const spreadPhi = Math.random() * Math.PI * 0.65;
            const speed = 4.5 + Math.random() * 8.5;

            st.particleVelocities[i * 3 + 0] = Math.sin(spreadPhi) * Math.cos(spreadTheta) * speed;
            st.particleVelocities[i * 3 + 1] = Math.cos(spreadPhi) * speed + 2.0;
            st.particleVelocities[i * 3 + 2] = Math.sin(spreadPhi) * Math.sin(spreadTheta) * speed;
          } else {
            pArr[i * 3 + 1] = -999;
            continue;
          }
        }

        if (st.particleLifetimes[i] < 0) {
          pArr[i * 3 + 1] = -999;
          continue;
        }

        activeSparks++;
        const pRatio = 1.0 - (st.particleLifetimes[i] / st.maxLifetimes[i]);

        // Velocity & Gravity integration
        st.particleVelocities[i * 3 + 1] += gravity * delta;
        pArr[i * 3 + 0] += st.particleVelocities[i * 3 + 0] * delta;
        pArr[i * 3 + 1] += st.particleVelocities[i * 3 + 1] * delta;
        pArr[i * 3 + 2] += st.particleVelocities[i * 3 + 2] * delta;

        // Ground collision & energetic bounce
        if (pArr[i * 3 + 1] < floorY) {
          pArr[i * 3 + 1] = floorY;
          st.particleVelocities[i * 3 + 1] = -st.particleVelocities[i * 3 + 1] * 0.38;
          st.particleVelocities[i * 3 + 0] *= 0.65;
          st.particleVelocities[i * 3 + 2] *= 0.65;
        }

        // Color thermal cooling transition: electric white-blue -> intense orange -> dark red
        if (pRatio > 0.7) {
          cArr[i * 3 + 0] = 0.85;
          cArr[i * 3 + 1] = 0.95;
          cArr[i * 3 + 2] = 1.0;
        } else if (pRatio > 0.35) {
          cArr[i * 3 + 0] = 1.0;
          cArr[i * 3 + 1] = 0.55 * pRatio;
          cArr[i * 3 + 2] = 0.05;
        } else {
          cArr[i * 3 + 0] = 0.7 * pRatio;
          cArr[i * 3 + 1] = 0.12 * pRatio;
          cArr[i * 3 + 2] = 0.0;
        }
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;

      // Realistic electric arc light flicker
      if (st.active && activeSparks > 0) {
        const flicker = 0.6 + Math.random() * 0.8 + (Math.random() > 0.85 ? 1.2 : 0);
        st.light.intensity = st.baseLightIntensity * flicker;
        st.light.color.setRGB(
          0.65 + Math.random() * 0.25,
          0.85 + Math.random() * 0.15,
          1.0
        );
      } else {
        st.light.intensity = 0.0;
      }
    }

    // 2. Update Rising Steam Vent Columns
    for (let vIdx = 0; vIdx < this.steamVents.length; vIdx++) {
      const vent = this.steamVents[vIdx];
      const posAttr = vent.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = vent.particles.geometry.getAttribute('color') as THREE.BufferAttribute;
      const pArr = posAttr.array as Float32Array;
      const cArr = colAttr.array as Float32Array;

      for (let i = 0; i < vent.particleCount; i++) {
        vent.particleLifetimes[i] += delta;

        if (vent.particleLifetimes[i] >= vent.maxLifetimes[i]) {
          vent.particleLifetimes[i] = 0;
          pArr[i * 3 + 0] = vent.position.x + (Math.random() - 0.5) * 0.6;
          pArr[i * 3 + 1] = vent.position.y;
          pArr[i * 3 + 2] = vent.position.z + (Math.random() - 0.5) * 0.6;

          vent.particleVelocities[i * 3 + 0] = (Math.random() - 0.5) * 0.5;
          vent.particleVelocities[i * 3 + 1] = 1.3 + Math.random() * 1.1;
          vent.particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
        }

        const progress = vent.particleLifetimes[i] / vent.maxLifetimes[i];
        pArr[i * 3 + 0] += (vent.particleVelocities[i * 3 + 0] + Math.sin(progress * 4.0 + i) * 0.15) * delta;
        pArr[i * 3 + 1] += vent.particleVelocities[i * 3 + 1] * delta;
        pArr[i * 3 + 2] += (vent.particleVelocities[i * 3 + 2] + Math.cos(progress * 4.0 + i) * 0.15) * delta;

        // Smooth Bell-curve opacity envelope
        const opacity = Math.sin(progress * Math.PI) * vent.particleBaseAlpha[i];
        cArr[i * 3 + 0] = opacity * 0.88;
        cArr[i * 3 + 1] = opacity * 0.92;
        cArr[i * 3 + 2] = opacity * 0.96;
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
  }

  public dispose(): void {
    for (const station of this.weldingStations) {
      this.scene.remove(station.particles);
      this.scene.remove(station.light);
      station.particles.geometry.dispose();
      station.light.dispose();
    }
    this.weldingStations = [];

    for (const vent of this.steamVents) {
      this.scene.remove(vent.particles);
      vent.particles.geometry.dispose();
    }
    this.steamVents = [];

    this.sparkMaterial.dispose();
    this.steamMaterial.dispose();
    this.sharedSparkTexture.dispose();
    this.sharedSteamTexture.dispose();
  }
}