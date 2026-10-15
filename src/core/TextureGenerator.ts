```typescript
import * as THREE from 'three';

export interface PBRTextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap?: THREE.Texture;
}

export class TextureGenerator {
  private static textureCache: Map<string, THREE.Texture> = new Map();

  /**
   * Dispose all cached canvas/procedural textures to cleanly release GPU VRAM
   */
  public static disposeAll(): void {
    for (const [, texture] of this.textureCache) {
      texture.dispose();
    }
    this.textureCache.clear();
  }

  /**
   * Get current cached texture count
   */
  public static getCacheSize(): number {
    return this.textureCache.size;
  }

  /**
   * Dispose a single cached texture by identifier
   */
  public static disposeTexture(key: string): void {
    const texture = this.textureCache.get(key);
    if (texture) {
      texture.dispose();
      this.textureCache.delete(key);
    }
  }

  private static createFallbackTexture(colorHex: number = 0x888888): THREE.Texture {
    const data = new Uint8Array([
      (colorHex >> 16) & 255,
      (colorHex >> 8) & 255,
      colorHex & 255,
      255
    ]);
    const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Helper to configure CanvasTexture with optimal mipmaps, trilinear filtering, and color space
   */
  private static configureTexture(
    texture: THREE.CanvasTexture,
    isColorMap: boolean = true,
    repeatX: number = 1,
    repeatY: number = 1
  ): THREE.Texture {
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.colorSpace = isColorMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Helper to generate a tangent-space Normal Map from a heightmap 2D canvas context
   */
  public static generateNormalMapFromCanvas(
    srcCanvas: HTMLCanvasElement,
    intensity: number = 2.0
  ): THREE.Texture {
    if (typeof document === 'undefined') return this.createFallbackTexture(0x8080ff);
    const width = srcCanvas.width;
    const height = srcCanvas.height;
    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
    const srcData = srcCtx.getImageData(0, 0, width, height).data;

    const normCanvas = document.createElement('canvas');
    normCanvas.width = width;
    normCanvas.height = height;
    const normCtx = normCanvas.getContext('2d', { willReadFrequently: true })!;
    const normImgData = normCtx.createImageData(width, height);
    const dstData = normImgData.data;

    const getLuma = (x: number, y: number): number => {
      const px = (x + width) % width;
      const py = (y + height) % height;
      const idx = (py * width + px) * 4;
      return (srcData[idx] * 0.299 + srcData[idx + 1] * 0.587 + srcData[idx + 2] * 0.114) / 255.0;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Sobel filter convolution for smooth gradients
        const tl = getLuma(x - 1, y - 1);
        const l  = getLuma(x - 1, y);
        const bl = getLuma(x - 1, y + 1);
        const t  = getLuma(x, y - 1);
        const b  = getLuma(x, y + 1);
        const tr = getLuma(x + 1, y - 1);
        const r  = getLuma(x + 1, y);
        const br = getLuma(x + 1, y + 1);

        const dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
        const dy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);

        // Vector normal calculation (dx, dy, 1/intensity)
        let nx = -dx * intensity;
        let ny = -dy * intensity;
        let nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
        nx /= len;
        ny /= len;
        nz /= len;

        const dstIdx = (y * width + x) * 4;
        dstData[dstIdx]     = Math.floor((nx * 0.5 + 0.5) * 255);
        dstData[dstIdx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        dstData[dstIdx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
        dstData[dstIdx + 3] = 255;
      }
    }

    normCtx.putImageData(normImgData, 0, 0);
    const texture = new THREE.CanvasTexture(normCanvas);
    return this.configureTexture(texture, false, 1, 1);
  }

  /**
   * 1. WET ASPHALT WITH CONCRETE AGGREGATE & PETROLEUM OIL SHEEN
   */
  public static createAsphaltTexture(): THREE.Texture {
    const cacheKey = 'asphalt_diff';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x283038);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Base damp dark charcoal asphalt
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#2d3748');
    grad.addColorStop(0.5, '#1e293b');
    grad.addColorStop(1, '#242f3d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Aggregate gravel aggregate noise & fine cracks
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 36;
      const speck = Math.random() < 0.08 ? (Math.random() * 45 - 20) : 0;
      data[i] = Math.min(255, Math.max(0, data[i] + noise + speck));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise + speck));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise + speck * 1.2));
    }
    ctx.putImageData(imgData, 0, 0);

    // Subtle asphalt cracks
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, 40);
    ctx.lineTo(140, 110);
    ctx.lineTo(210, 100);
    ctx.lineTo(290, 190);
    ctx.moveTo(340, 310);
    ctx.lineTo(410, 380);
    ctx.lineTo(470, 430);
    ctx.stroke();

    // Standing water puddle with subtle petroleum iridescent sheen ring
    const puddleGrad = ctx.createRadialGradient(256, 260, 20, 256, 260, 110);
    puddleGrad.addColorStop(0, 'rgba(15, 23, 42, 0.6)');
    puddleGrad.addColorStop(0.6, 'rgba(30, 41, 59, 0.4)');
    puddleGrad.addColorStop(0.85, 'rgba(56, 189, 248, 0.12)'); // subtle cyan oil sheen
    puddleGrad.addColorStop(0.95, 'rgba(234, 179, 8, 0.08)');  // subtle amber oil sheen
    puddleGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = puddleGrad;
    ctx.beginPath();
    ctx.ellipse(256, 260, 120, 80, Math.PI / 8, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 24, 24);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createWetAsphaltNormalTexture(): THREE.Texture {
    const cacheKey = 'asphalt_nor';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x8080ff);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 60;
      data[i] = Math.min(255, Math.max(0, 128 + n));
      data[i + 1] = Math.min(255, Math.max(0, 128 + n));
      data[i + 2] = Math.min(255, Math.max(0, 128 + n));
    }
    ctx.putImageData(imgData, 0, 0);

    // Flatten puddle normal (mirror flat water)
    ctx.fillStyle = '#808080';
    ctx.beginPath();
    ctx.ellipse(256, 260, 110, 70, Math.PI / 8, 0, Math.PI * 2);
    ctx.fill();

    const norm = this.generateNormalMapFromCanvas(canvas, 2.5);
    norm.repeat.set(24, 24);
    this.textureCache.set(cacheKey, norm);
    return norm;
  }

  public static createWetAsphaltRoughnessTexture(): THREE.Texture {
    const cacheKey = 'asphalt_rough';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0xcccccc);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // High roughness (0.85 -> rgb(216,216,216)) for coarse asphalt
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(0, 0, 512, 512);

    // Micro-grit noise
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 40;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = data[i];
      data[i + 2] = data[i];
    }
    ctx.putImageData(imgData, 0, 0);

    // Glossy wet puddle (low roughness -> rgb(35, 35, 35))
    const wetGrad = ctx.createRadialGradient(256, 260, 20, 256, 260, 115);
    wetGrad.addColorStop(0, '#1c1c1c');
    wetGrad.addColorStop(0.7, '#2a2a2a');
    wetGrad.addColorStop(1, 'rgba(216, 216, 216, 0)');
    ctx.fillStyle = wetGrad;
    ctx.beginPath();
    ctx.ellipse(256, 260, 120, 80, Math.PI / 8, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, false, 24, 24);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createWetAsphaltAOTexture(): THREE.Texture {
    const cacheKey = 'asphalt_ao';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0xffffff);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);

    // Puddle edge occlusion and crack shadowing
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(60, 40);
    ctx.lineTo(140, 110);
    ctx.lineTo(210, 100);
    ctx.lineTo(290, 190);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, false, 24, 24);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * 2. WEATHERED KILNED BRICK WITH EFFLORESCENCE, CHIPPING & MORTAR RELIEF
   */
  public static createBrickTexture(): THREE.Texture {
    const cacheKey = 'brick_diff';
    if (TextureGenerator.textureCache.has(cacheKey)) return TextureGenerator.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = TextureGenerator.createFallbackTexture(0x991b1b);
      TextureGenerator.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Weathered dark mortar base
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 16;
    const cols = 8;
    const blockH = 512 / rows;
    const blockW = 512 / cols;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2 === 0) ? 0 : blockW / 2;
      for (let c = -1; c < cols + 1; c++) {
        const x = c * blockW + offset;
        const y = r * blockH;

        // Realistic kilned brick palette
        const rand = Math.random();
        let baseR = 160, baseG = 52, baseB = 40;
        if (rand < 0.25) { baseR = 135; baseG = 42; baseB = 32; }
        else if (rand < 0.55) { baseR = 175; baseG = 65; baseB = 48; }
        else if (rand < 0.85) { baseR = 190; baseG = 78; baseB = 56; }
        else { baseR = 120; baseG = 38; baseB = 30; }

        const shift = Math.floor((Math.random() - 0.5) * 16);
        ctx.fillStyle = `rgb(${baseR + shift}, ${baseG + shift / 2}, ${baseB + shift / 2})`;
        ctx.fillRect(x + 2, y + 2, blockW - 4, blockH - 4);

        // Brick surface pitting and soot stains
        for (let p = 0; p < 4; p++) {
          const px = x + 4 + Math.random() * (blockW - 8);
          const py = y + 4 + Math.random() * (blockH - 8);
          ctx.fillStyle = Math.random() < 0.3 ? 'rgba(255, 255, 255, 0.15)' : 'rgba(20, 10, 5, 0.25)';
          ctx.fillRect(px, py, 2 + Math.random() * 3, 2 + Math.random() * 2);
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 4, 3);
    TextureGenerator.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createBrickNormalTexture(): THREE.Texture {
    const cacheKey = 'brick_nor';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x8080ff);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Mortar is recessed deep (black = low)
    ctx.fillStyle = '#222222';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 16;
    const cols = 8;
    const blockH = 512 / rows;
    const blockW = 512 / cols;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2 === 0) ? 0 : blockW / 2;
      for (let c = -1; c < cols + 1; c++) {
        const x = c * blockW + offset;
        const y = r * blockH;

        // Brick face raised (white = high with beveled edges)
        ctx.fillStyle = '#dddddd';
        ctx.fillRect(x + 2, y + 2, blockW - 4, blockH - 4);

        // Chamfered brick edges
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 3, y + 3, blockW - 6, blockH - 6);
      }
    }

    const norm = this.generateNormalMapFromCanvas(canvas, 3.2);
    norm.repeat.set(4, 3);
    this.textureCache.set(cacheKey, norm);
    return norm;
  }

  public static createBrickRoughnessTexture(): THREE.Texture {
    const cacheKey = 'brick_rough';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0xd0d0d0);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Mortar is very rough (high roughness rgb(240,240,240))
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 16;
    const cols = 8;
    const blockH = 512 / rows;
    const blockW = 512 / cols;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2 === 0) ? 0 : blockW / 2;
      for (let c = -1; c < cols + 1; c++) {
        const x = c * blockW + offset;
        const y = r * blockH;
        // Brick face roughness (0.75-0.85 -> rgb(190..215))
        const rVal = 190 + Math.floor(Math.random() * 25);
        ctx.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
        ctx.fillRect(x + 2, y + 2, blockW - 4, blockH - 4);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, false, 4, 3);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createBrickAOTexture(): THREE.Texture {
    const cacheKey = 'brick_ao';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0xffffff);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 16;
    const cols = 8;
    const blockH = 512 / rows;
    const blockW = 512 / cols;

    // Mortar channels receive deep ambient occlusion
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 3;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * blockH);
      ctx.lineTo(512, r * blockH);
      ctx.stroke();
    }
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2 === 0) ? 0 : blockW / 2;
      for (let c = -1; c < cols + 1; c++) {
        ctx.beginPath();
        ctx.moveTo(c * blockW + offset, r * blockH);
        ctx.lineTo(c * blockW + offset, (r + 1) * blockH);
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, false, 4, 3);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * 3. CORRUGATED GALVANIZED SHEET METAL & OXIDIZED INDUSTRIAL SIDING
   */
  public static createCorrugatedMetalTexture(color: string = '#64748b'): THREE.Texture {
    const cacheKey = `corrugated_diff_${color}`;
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x64748b);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 512);

    const period = 32;
    for (let x = 0; x < 512; x += period) {
      const grad = ctx.createLinearGradient(x, 0, x + period, 0);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
      grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.25)');
      grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
      grad.addColorStop(0.8, 'rgba(255, 255, 255, 0.25)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, period, 512);

      // Fastener screws along ribs
      for (let y = 32; y < 512; y += 128) {
        ctx.fillStyle = '#1e293b';