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
        ctx.beginPath();
        ctx.arc(x + period / 2, y, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Rust drip from screw hole
        const rustGrad = ctx.createLinearGradient(x + period / 2, y, x + period / 2, y + 40);
        rustGrad.addColorStop(0, 'rgba(180, 83, 9, 0.7)');
        rustGrad.addColorStop(1, 'rgba(180, 83, 9, 0)');
        ctx.fillStyle = rustGrad;
        ctx.fillRect(x + period / 2 - 2, y + 3, 4, 35);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 4, 4);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createCorrugatedMetalNormalTexture(): THREE.Texture {
    const cacheKey = 'corrugated_nor';
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

    const period = 32;
    for (let x = 0; x < 512; x += period) {
      const grad = ctx.createLinearGradient(x, 0, x + period, 0);
      grad.addColorStop(0, '#222222');
      grad.addColorStop(0.5, '#ffffff');
      grad.addColorStop(1, '#222222');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, period, 512);

      for (let y = 32; y < 512; y += 128) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x + period / 2, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const norm = this.generateNormalMapFromCanvas(canvas, 3.5);
    norm.repeat.set(4, 4);
    this.textureCache.set(cacheKey, norm);
    return norm;
  }

  public static createCorrugatedMetalRoughnessTexture(): THREE.Texture {
    const cacheKey = 'corrugated_rough';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x666666);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Galvanized metal has low-to-mid roughness (0.35 -> #595959)
    ctx.fillStyle = '#595959';
    ctx.fillRect(0, 0, 512, 512);

    // Rust spots have high roughness (#d4d4d4)
    const period = 32;
    for (let x = 0; x < 512; x += period) {
      for (let y = 32; y < 512; y += 128) {
        ctx.fillStyle = '#d4d4d4';
        ctx.fillRect(x + period / 2 - 3, y + 2, 6, 35);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, false, 4, 4);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * 4. RIVETED STEEL HULL PLATES & HEAVY INDUSTRIAL FLANGES
   */
  public static createSteelPlateTexture(): THREE.Texture {
    const cacheKey = 'steel_diff';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x475569);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Industrial cold steel plate background
    const bgGrad = ctx.createLinearGradient(0, 0, 512, 512);
    bgGrad.addColorStop(0, '#475569');
    bgGrad.addColorStop(0.5, '#334155');
    bgGrad.addColorStop(1, '#475569');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 512, 512);

    // Micro-grit steel texture
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      data[i] = Math.min(255, Math.max(0, data[i] + n));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    // Plate grid seams
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 504, 504);
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.stroke();

    // Weld bead highlight
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(6, 6, 500, 500);

    // Rivet dots with metallic highlight and drop shadow
    const drawRivets = (startX: number, startY: number, endX: number, endY: number) => {
      const dist = Math.hypot(endX - startX, endY - startY);
      const steps = Math.floor(dist / 32);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const rx = startX + (endX - startX) * t;
        const ry = startY + (endY - startY) * t;

        // Shadow
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(rx + 1, ry + 1, 4.0, 0, Math.PI * 2);
        ctx.fill();

        // Rivet head
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = '#f1f5f9';
        ctx.beginPath();
        ctx.arc(rx - 1, ry - 1, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawRivets(16, 16, 496, 16);
    drawRivets(16, 496, 496, 496);
    drawRivets(16, 16, 16, 496);
    drawRivets(496, 16, 496, 496);
    drawRivets(256, 16, 256, 496);
    drawRivets(16, 256, 496, 256);

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 2, 2);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createSteelPlateNormalTexture(): THREE.Texture {
    const cacheKey = 'steel_nor';
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

    // Plate recessed grooves
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 504, 504);
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.stroke();

    // Rivets raised dome
    const drawRivetHeights = (startX: number, startY: number, endX: number, endY: number) => {
      const dist = Math.hypot(endX - startX, endY - startY);
      const steps = Math.floor(dist / 32);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const rx = startX + (endX - startX) * t;
        const ry = startY + (endY - startY) * t;
        const rGrad = ctx.createRadialGradient(rx, ry, 0, rx, ry, 4);
        rGrad.addColorStop(0, '#ffffff');
        rGrad.addColorStop(1, '#808080');
        ctx.fillStyle = rGrad;
        ctx.beginPath();
        ctx.arc(rx, ry, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawRivetHeights(16, 16, 496, 16);
    drawRivetHeights(16, 496, 496, 496);
    drawRivetHeights(16, 16, 16, 496);
    drawRivetHeights(496, 16, 496, 496);
    drawRivetHeights(256, 16, 256, 496);
    drawRivetHeights(16, 256, 496, 256);

    const norm = this.generateNormalMapFromCanvas(canvas, 3.0);
    norm.repeat.set(2, 2);
    this.textureCache.set(cacheKey, norm);
    return norm;
  }

  public static createSteelPlateRoughnessTexture(): THREE.Texture {
    const cacheKey = 'steel_rough';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x555555);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Polished industrial steel plate base (0.35 roughness)
    ctx.fillStyle = '#595959';
    ctx.fillRect(0, 0, 512, 512);

    // Weathered edge seams
    ctx.strokeStyle = '#8c8c8c';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 504);

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, false, 2, 2);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * 5. VIBRANT MARITIME OCEAN WATER WITH DYNAMIC WAVE CRESTS & CAUSTICS
   */
  public static createWaterNormalTexture(): THREE.Texture {
    const cacheKey = 'water_nor';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x0284c7);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Deep Atlantic Coastal Blue Base
    const bgGrad = ctx.createLinearGradient(0, 0, 512, 512);
    bgGrad.addColorStop(0, '#0284c7');
    bgGrad.addColorStop(0.5, '#0369a1');
    bgGrad.addColorStop(1, '#075985');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 512, 512);

    // Dynamic wave ripples with bright turquoise and white foam crests
    for (let y = 0; y < 512; y += 24) {
      // Primary wave swell
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.beginPath();
      for (let x = 0; x <= 512; x += 16) {
        const waveY = y + Math.sin(x * 0.04 + y * 0.02) * 8 + Math.cos(x * 0.07) * 4;
        if (x === 0) ctx.moveTo(x, waveY);
        else ctx.lineTo(x, waveY);
      }
      ctx.stroke();

      // Whitecap foam spray along wave crests
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(240, 249, 255, 0.85)';
      ctx.beginPath();
      for (let x = 0; x <= 512; x += 16) {
        const waveY = y + Math.sin(x * 0.04 + y * 0.02) * 8 + Math.cos(x * 0.07) * 4 - 2;
        if (x === 0) ctx.moveTo(x, waveY);
        else ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }

    // Specular light caustics
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.beginPath();
      ctx.ellipse(x, y, 10 + Math.random() * 8, 3, Math.PI / 6, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 8, 8);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * 6. CREOSOTE HEAVY TIMBER & RAILWAY WOOD TIES
   */
  public static createPierWoodTexture(): THREE.Texture {
    const cacheKey = 'pier_wood_diff';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x78350f);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Dark creosote oak wood base
    ctx.fillStyle = '#301402';
    ctx.fillRect(0, 0, 512, 512);

    const plankHeight = 32;
    for (let y = 0; y < 512; y += plankHeight) {
      const grainVariation = Math.floor(Math.random() * 24) - 12;
      ctx.fillStyle = `rgb(${75 + grainVariation}, ${38 + grainVariation / 2}, ${20 + grainVariation / 2})`;
      ctx.fillRect(2, y + 2, 508, plankHeight - 4);

      // Deep wood grain fissures
      ctx.strokeStyle = 'rgba(15, 7, 2, 0.45)';
      ctx.lineWidth = 1.2;
      for (let g = 0; g < 5; g++) {
        const gy = y + 3 + g * 5;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(150, gy + (Math.random() - 0.5) * 6, 350, gy + (Math.random() - 0.5) * 6, 512, gy);
        ctx.stroke();
      }

      // Rusty iron forged railroad spikes & washers
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(32, y + plankHeight / 2, 3.5, 0, Math.PI * 2);
      ctx.arc(480, y + plankHeight / 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 2, 16);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createPierWoodNormalTexture(): THREE.Texture {
    const cacheKey = 'pier_wood_nor';
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

    ctx.fillStyle = '#222222';
    ctx.fillRect(0, 0, 512, 512);

    const plankHeight = 32;
    for (let y = 0; y < 512; y += plankHeight) {
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(2, y + 2, 508, plankHeight - 4);

      // Deep grain grooves
      ctx.strokeStyle = '#666666';
      ctx.lineWidth = 1.5;
      for (let g = 0; g < 4; g++) {
        const gy = y + 4 + g * 6;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(512, gy);
        ctx.stroke();
      }
    }

    const norm = this.generateNormalMapFromCanvas(canvas, 3.0);
    norm.repeat.set(2, 16);
    this.textureCache.set(cacheKey, norm);
    return norm;
  }

  public static createPierWoodRoughnessTexture(): THREE.Texture {
    const cacheKey = 'pier_wood_rough';
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

    // Creosote treated wood has 0.85 roughness with glossy tar patches (0.4)
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = '#666666';
    for (let i = 0; i < 20; i++) {
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 40, 8);
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, false, 2, 16);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * 7. CAUTION HAZARD STRIPES WITH HEAVY WEAR & TIRE SKIDS
   */
  public static createHazardStripeTexture(): THREE.Texture {
    const cacheKey = 'hazard_diff';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0xeab308);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    ctx.fillStyle = '#eab308'; // Safety Yellow
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#0f172a'; // Heavy Dark Charcoal
    ctx.beginPath();
    for (let i = -256; i < 512; i += 64) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 32, 0);
      ctx.lineTo(i + 32 + 256, 256);
      ctx.lineTo(i + 256, 256);
      ctx.closePath();
    }
    ctx.fill();

    // Tire tread scuffs & grime
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    for (let i = 0; i < 15; i++) {
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 60, 4);
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 8, 1);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createHazardStripeNormalTexture(): THREE.Texture {
    const cacheKey = 'hazard_nor';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x8080ff);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);

    // Slight bevel on painted stripes
    ctx.fillStyle = '#a0a0a0';
    ctx.beginPath();
    for (let i = -256; i < 512; i += 64) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 32, 0);
      ctx.lineTo(i + 32 + 256, 256);
      ctx.lineTo(i + 256, 256);
      ctx.closePath();
    }
    ctx.fill();

    const norm = this.generateNormalMapFromCanvas(canvas, 1.8);
    norm.repeat.set(8, 1);
    this.textureCache.set(cacheKey, norm);
    return norm;
  }

  /**
   * 8. VELVET TUXEDO FELINE FUR PBR MATERIAL & ANISOTROPIC MICRO-GRAIN
   */
  public static createVelvetFurTexture(): THREE.Texture {
    const cacheKey = 'fur_diff';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x121214);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Rich obsidian black base
    ctx.fillStyle = '#121214';
    ctx.fillRect(0, 0, 256, 256);

    // Directional velvet fur fibers
    const imgData = ctx.getImageData(0, 0, 256, 256);
    const data = imgData.data;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const idx = (y * 256 + x) * 4;
        const noise = (Math.random() - 0.5) * 14;
        const val = Math.min(45, Math.max(10, 20 + noise));
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val + 2; // subtle cool blue undertone
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 4, 4);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createFurNormalTexture(): THREE.Texture {
    const cacheKey = 'fur_nor';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x8080ff);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);

    // Micro hair strokes
    ctx.strokeStyle = '#a0a0a0';
    ctx.lineWidth = 1;
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1, y + 4 + Math.random() * 3);
      ctx.stroke();
    }

    const norm = this.generateNormalMapFromCanvas(canvas, 1.5);
    norm.repeat.set(4, 4);
    this.textureCache.set(cacheKey, norm);
    return norm;
  }

  public static createFurRoughnessTexture(): THREE.Texture {
    const cacheKey = 'fur_rough';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0xbbbbbb);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Feline coat has 0.75-0.8 roughness with softer specular response
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(0, 0, 256, 256);

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, false, 4, 4);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * 9. CAST-IRON EMBOSSED RELIEF SIGNBOARD & BADGE (Power of Two POT 512x256)
   */
  public static createReliefSignTexture(
    title: string,
    subtitle: string,
    bgColor: string = '#0f172a',
    textColor: string = '#f8fafc',
    accentColor: string = '#f59e0b'
  ): THREE.Texture {
    const cacheKey = `sign_${title}_${subtitle}_${bgColor}`;
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x0f172a);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256; // Standard 2:1 POT dimension for seamless mipmapping
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Cast iron frame with inner bevel
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 256);

    // Decorative industrial border
    ctx.lineWidth = 10;
    ctx.strokeStyle = accentColor;
    ctx.strokeRect(10, 10, 492, 236);

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.strokeRect(18, 18, 476, 220);

    // Corner rivet heads
    ctx.fillStyle = accentColor;
    [
      [28, 28], [484, 28], [28, 228], [484, 228]
    ].forEach(([rx, ry]) => {
      ctx.beginPath();
      ctx.arc(rx, ry, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // Primary embossed text
    ctx.textAlign = 'center';
    ctx.font = '900 42px "Chakra Petch", "Courier New", monospace';
    ctx.fillStyle = textColor;
    ctx.fillText(title, 256, 115);

    // Secondary subtext
    if (subtitle) {
      ctx.font = '700 22px "Inter", sans-serif';
      ctx.fillStyle = accentColor;
      ctx.fillText(subtitle, 256, 175);
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 1, 1);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * 10. HISTORIC GRANITE STONE ASHLAR MASONRY WITH CHISELED BLOCKS & QUARTZ/MICA FLECKS
   */
  public static createGraniteStoneTexture(): THREE.Texture {
    const cacheKey = 'granite_diff';
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

    // Dark weathered mortar bed
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 8;
    const cols = 4;
    const blockH = 512 / rows;
    const blockW = 512 / cols;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2 === 0) ? 0 : blockW / 2;
      for (let c = -1; c < cols + 1; c++) {
        const x = c * blockW + offset;
        const y = r * blockH;

        // Cut granite block tone variations (Slate grey, cold granite, warm stone)
        const rand = Math.random();
        let baseR = 90, baseG = 100, baseB = 112;
        if (rand < 0.25) { baseR = 75; baseG = 85; baseB = 98; }
        else if (rand < 0.55) { baseR = 105; baseG = 115; baseB = 125; }
        else if (rand < 0.8) { baseR = 82; baseG = 92; baseB = 102; }
        else { baseR = 118; baseG = 128; baseB = 138; }

        const shift = Math.floor((Math.random() - 0.5) * 12);
        ctx.fillStyle = `rgb(${baseR + shift}, ${baseG + shift}, ${baseB + shift + 2})`;
        ctx.fillRect(x + 2, y + 2, blockW - 4, blockH - 4);

        // Chiseled edge bevel
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(x + 2, y + 2, blockW - 4, 3);
        ctx.fillRect(x + 2, y + 2, 3, blockH - 4);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(x + 2, y + blockH - 5, blockW - 4, 3);
        ctx.fillRect(x + blockW - 5, y + 2, 3, blockH - 4);

        // Granite mineral grain & quartz flecks
        for (let p = 0; p < 12; p++) {
          const px = x + 4 + Math.random() * (blockW - 8);
          const py = y + 4 + Math.random() * (blockH - 8);
          const fleckType = Math.random();
          if (fleckType < 0.4) {
            // Dark biotite / mica specks
            ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
            ctx.fillRect(px, py, 2 + Math.random() * 2, 2 + Math.random() * 2);
          } else if (fleckType < 0.8) {
            // White quartz crystalline flecks
            ctx.fillStyle = 'rgba(248, 250, 252, 0.35)';
            ctx.fillRect(px, py, 2, 2);
          } else {
            // Weathered lichen/iron stain
            ctx.fillStyle = 'rgba(180, 83, 9, 0.18)';
            ctx.fillRect(px, py, 3, 2);
          }
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 3, 3);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createGraniteStoneNormalTexture(): THREE.Texture {
    const cacheKey = 'granite_nor';
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

    // Recessed mortar depth
    ctx.fillStyle = '#202020';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 8;
    const cols = 4;
    const blockH = 512 / rows;
    const blockW = 512 / cols;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2 === 0) ? 0 : blockW / 2;
      for (let c = -1; c < cols + 1; c++) {
        const x = c * blockW + offset;
        const y = r * blockH;

        // Raised cut stone face
        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(x + 2, y + 2, blockW - 4, blockH - 4);

        // Beveled chisel gradient border
        ctx.strokeStyle = '#808080';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 3, blockW - 6, blockH - 6);
      }
    }

    // Micro surface grit
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 50) {
        const noise = (Math.random() - 0.5) * 24;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = data[i];
        data[i + 2] = data[i];
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const norm = this.generateNormalMapFromCanvas(canvas, 3.2);
    norm.repeat.set(3, 3);
    this.textureCache.set(cacheKey, norm);
    return norm;
  }

  public static createGraniteStoneRoughnessTexture(): THREE.Texture {
    const cacheKey = 'granite_rough';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0xdedede);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // High roughness for chiseled stone (0.85 -> rgb(216,216,216))
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(0, 0, 512, 512);

    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 30;
      data[i] = Math.min(255, Math.max(0, 216 + noise));
      data[i + 1] = data[i];
      data[i + 2] = data[i];
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, false, 3, 3);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createGraniteStoneAOTexture(): THREE.Texture {
    const cacheKey = 'granite_ao';
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

    const rows = 8;
    const cols = 4;
    const blockH = 512 / rows;
    const blockW = 512 / cols;

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3.5;
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
    this.configureTexture(texture, false, 3, 3);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * 11. HIGH-VISIBILITY SAFETY FABRIC WITH RETROREFLECTIVE PRISMATIC SILVER BANDS
   */
  public static createHighVisFabricTexture(neonColor: string = '#ccff00'): THREE.Texture {
    const cacheKey = `highvis_diff_${neonColor}`;
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0xccff00);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Fluorescent neon safety background
    ctx.fillStyle = neonColor;
    ctx.fillRect(0, 0, 256, 256);

    // High-vis polyester mesh weave texture
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let y = 0; y < 256; y += 4) {
      ctx.fillRect(0, y, 256, 1.5);
    }
    for (let x = 0; x < 256; x += 4) {
      ctx.fillRect(x, 0, 1.5, 256);
    }

    // Retroreflective silver micro-prismatic stripes
    const stripeYPositions = [48, 144];
    const stripeHeight = 36;
    stripeYPositions.forEach(sy => {
      // Silver reflective base
      const silverGrad = ctx.createLinearGradient(0, sy, 0, sy + stripeHeight);
      silverGrad.addColorStop(0, '#cbd5e1');
      silverGrad.addColorStop(0.3, '#f8fafc');
      silverGrad.addColorStop(0.7, '#e2e8f0');
      silverGrad.addColorStop(1, '#94a3b8');
      ctx.fillStyle = silverGrad;
      ctx.fillRect(0, sy, 256, stripeHeight);

      // Micro-prismatic diamond pattern on tape
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      for (let px = 0; px < 256; px += 8) {
        ctx.beginPath();
        ctx.moveTo(px, sy);
        ctx.lineTo(px + 4, sy + stripeHeight / 2);
        ctx.lineTo(px, sy + stripeHeight);
        ctx.stroke();
      }

      // Dark seam border on reflective tape
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, sy, 256, stripeHeight);
    });

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 1, 1);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createHighVisFabricNormalTexture(): THREE.Texture {
    const cacheKey = 'highvis_nor';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x8080ff);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);

    // Raised reflective bands
    const stripeYPositions = [48, 144];
    const stripeHeight = 36;
    stripeYPositions.forEach(sy => {
      ctx.fillStyle = '#b0b0b0';
      ctx.fillRect(0, sy, 256, stripeHeight);
      ctx.strokeStyle = '#404040';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, sy, 256, stripeHeight);
    });

    const norm = this.generateNormalMapFromCanvas(canvas, 2.0);
    norm.repeat.set(1, 1);
    this.textureCache.set(cacheKey, norm);
    return norm;
  }

  /**
   * 12. INDUSTRIAL PRESSURE GAUGE DIAL & MANIFOLD INSTRUMENT (POT 256x256)
   */
  public static createGaugeDialTexture(title: string = 'PSI', valueFraction: number = 0.65): THREE.Texture {
    const cacheKey = `gauge_${title}_${valueFraction}`;
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0xf8fafc);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const cx = 128;
    const cy = 128;
    const r = 118;

    // 1. Chrome / Brass Bezel Outer Ring
    const bezelGrad = ctx.createRadialGradient(cx, cy, r - 16, cx, cy, r);
    bezelGrad.addColorStop(0, '#64748b');
    bezelGrad.addColorStop(0.6, '#cbd5e1');
    bezelGrad.addColorStop(0.9, '#f1f5f9');
    bezelGrad.addColorStop(1, '#334155');
    ctx.fillStyle = bezelGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 2. Off-white vintage instrument face
    ctx.fillStyle = '#fefce8';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 3. Colored operating zone arcs (Start at 135 deg to 405 deg = 270 deg sweep)
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const sweep = endAngle - startAngle;

    // Safe green zone (0% to 65%)
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 26, startAngle, startAngle + sweep * 0.65);
    ctx.stroke();

    // Danger red zone (65% to 100%)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 26, startAngle + sweep * 0.65, endAngle);
    ctx.stroke();

    // 4. Radial Tick Marks
    const totalTicks = 20;
    for (let i = 0; i <= totalTicks; i++) {
      const angle = startAngle + (i / totalTicks) * sweep;
      const isMajor = i % 4 === 0;
      const tickInner = r - 22 - (isMajor ? 10 : 5);
      const tickOuter = r - 22;

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = isMajor ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * tickInner, cy + Math.sin(angle) * tickInner);
      ctx.lineTo(cx + Math.cos(angle) * tickOuter, cy + Math.sin(angle) * tickOuter);
      ctx.stroke();
    }

    // 5. Gauge Title / Unit Text
    ctx.textAlign = 'center';
    ctx.font = '900 16px "Courier New", monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(title, cx, cy + 44);

    ctx.font = '700 11px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('NNS INDUSTRIAL', cx, cy - 35);

    // 6. Gauge Needle Indicator
    const needleAngle = startAngle + sweep * Math.max(0, Math.min(1.0, valueFraction));
    const needleLength = r - 32;

    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(needleAngle) * 12, cy - Math.sin(needleAngle) * 12);
    ctx.lineTo(cx + Math.cos(needleAngle) * needleLength, cy + Math.sin(needleAngle) * needleLength);
    ctx.stroke();

    // 7. Center Hub Pin
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 2, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 8. Glass Specular Glare Reflection Highlight
    const glareGrad = ctx.createLinearGradient(cx - 60, cy - 60, cx + 60, cy + 60);
    glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    glareGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
    glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glareGrad;
    ctx.beginPath();
    ctx.ellipse(cx - 25, cy - 35, 55, 28, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 1, 1);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * 13. HEAVY INDUSTRIAL STEEL CATWALK GRATING (Diamond / Rectangular Bar Lattice)
   */
  public static createIndustrialGratingTexture(): THREE.Texture {
    const cacheKey = 'grating_diff';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x475569);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Dark void gap behind grating
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 256, 256);

    // Galvanized steel bar lattice
    const barSpacing = 16;
    const barWidth = 4;

    // Longitudinal bearing bars (vertical)
    for (let x = 0; x < 256; x += barSpacing) {
      const barGrad = ctx.createLinearGradient(x, 0, x + barWidth, 0);
      barGrad.addColorStop(0, '#334155');
      barGrad.addColorStop(0.3, '#94a3b8');
      barGrad.addColorStop(0.7, '#cbd5e1');
      barGrad.addColorStop(1, '#475569');
      ctx.fillStyle = barGrad;
      ctx.fillRect(x, 0, barWidth, 256);
    }

    // Transverse twisted cross rods (horizontal serrated)
    for (let y = 0; y < 256; y += barSpacing) {
      const rodGrad = ctx.createLinearGradient(0, y, 0, y + barWidth - 1);
      rodGrad.addColorStop(0, '#1e293b');
      rodGrad.addColorStop(0.5, '#94a3b8');
      rodGrad.addColorStop(1, '#334155');
      ctx.fillStyle = rodGrad;
      ctx.fillRect(0, y, 256, barWidth - 1);

      // Serration friction dots on cross points
      for (let x = 0; x < 256; x += barSpacing) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x + 1, y + 1, 2, 2);
      }
    }

    // Outer perimeter band
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, 254, 254);

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 8, 8);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  public static createIndustrialGratingNormalTexture(): THREE.Texture {
    const cacheKey = 'grating_nor';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x8080ff);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Void level (black = lowest)
    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, 256, 256);

    const barSpacing = 16;
    const barWidth = 4;

    // Raised vertical bearing bars
    for (let x = 0; x < 256; x += barSpacing) {
      const grad = ctx.createLinearGradient(x, 0, x + barWidth, 0);
      grad.addColorStop(0, '#606060');
      grad.addColorStop(0.5, '#ffffff');
      grad.addColorStop(1, '#606060');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, barWidth, 256);
    }

    // Raised horizontal cross rods
    for (let y = 0; y < 256; y += barSpacing) {
      const grad = ctx.createLinearGradient(0, y, 0, y + barWidth - 1);
      grad.addColorStop(0, '#505050');
      grad.addColorStop(0.5, '#e0e0e0');
      grad.addColorStop(1, '#505050');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, 256, barWidth - 1);
    }

    const norm = this.generateNormalMapFromCanvas(canvas, 3.5);
    norm.repeat.set(8, 8);
    this.textureCache.set(cacheKey, norm);
    return norm;
  }

  public static createIndustrialGratingRoughnessTexture(): THREE.Texture {
    const cacheKey = 'grating_rough';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x666666);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // High roughness for dark void gaps
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, 256, 256);

    // Low-mid roughness (metallic sheen 0.35) for steel bars
    ctx.fillStyle = '#555555';
    const barSpacing = 16;
    const barWidth = 4;
    for (let x = 0; x < 256; x += barSpacing) {
      ctx.fillRect(x, 0, barWidth, 256);
    }
    for (let y = 0; y < 256; y += barSpacing) {
      ctx.fillRect(0, y, 256, barWidth - 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, false, 8, 8);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * 14. CAST-IRON SLOTTED DRAINAGE TRENCH GRATE
   */
  public static createDrainageGrateTexture(): THREE.Texture {
    const cacheKey = 'drainage_diff';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x1e293b);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Heavy oxidized cast-iron frame
    ctx.fillStyle = '#222831';
    ctx.fillRect(0, 0, 256, 256);

    // Slotted drainage openings
    const slotW = 12;
    const slotH = 100;
    const gapX = 22;

    ctx.fillStyle = '#05070a'; // Trench void
    for (let row = 0; row < 2; row++) {
      const startY = 24 + row * 114;
      for (let x = 18; x < 240; x += gapX) {
        ctx.beginPath();
        ctx.roundRect(x, startY, slotW, slotH, 4);
        ctx.fill();

        // Slot edge bevel / rust wear
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Outer frame bolt fasteners
    ctx.fillStyle = '#94a3b8';
    [
      [10, 10], [128, 10], [246, 10],
      [10, 246], [128, 246], [246, 246]
    ].forEach(([bx, by]) => {
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 4, 1);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * 15. IRIDESCENT PETROLEUM OIL SHEEN DECAL TEXTURE
   */
  public static createOilSheenTexture(): THREE.Texture {
    const cacheKey = 'oil_sheen_diff';
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey)!;
    if (typeof document === 'undefined') {
      const fb = this.createFallbackTexture(0x38bdf8);
      this.textureCache.set(cacheKey, fb);
      return fb;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    ctx.clearRect(0, 0, 256, 256);

    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 115);
    grad.addColorStop(0, 'rgba(14, 165, 233, 0.65)');  // Bright sky blue
    grad.addColorStop(0.25, 'rgba(168, 85, 247, 0.55)'); // Violet interference
    grad.addColorStop(0.5, 'rgba(234, 179, 8, 0.5)');   // Golden amber
    grad.addColorStop(0.75, 'rgba(34, 197, 94, 0.45)');  // Emerald green
    grad.addColorStop(0.9, 'rgba(244, 63, 94, 0.25)');   // Rose magenta
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(128, 128, 120, 95, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 1, 1);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * Clean Cel-Shaded Maritime Pier Timber with Defined Planks & Bevel Highlights
   */
  public static createStylizedPierWood(): THREE.Texture {
    const key = 'stylized_pier_wood';
    const cached = this.textureCache.get(key);
    if (cached) return cached;

    if (typeof document === 'undefined') {
      return this.createFallbackTexture(0x78350f);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return this.createFallbackTexture(0x78350f);

    // Warm creosote golden-brown base
    ctx.fillStyle = '#451a03';
    ctx.fillRect(0, 0, 512, 512);

    const plankH = 48;
    for (let y = 0; y < 512; y += plankH) {
      // Plank face tone
      ctx.fillStyle = (y / plankH) % 2 === 0 ? '#78350f' : '#92400e';
      ctx.fillRect(4, y + 4, 504, plankH - 8);

      // Beveled wood edge highlight
      ctx.fillStyle = '#b45309';
      ctx.fillRect(4, y + 4, 504, 3);

      // Dark plank groove shadow
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(4, y + plankH - 4, 504, 4);

      // Stylized Iron Fastener Rivets
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(32, y + plankH / 2, 4, 0, Math.PI * 2);
      ctx.arc(480, y + plankH / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 2, 8);
    this.textureCache.set(key, texture);
    return texture;
  }

  /**
   * Crisp Cel-Shaded Corrugated Shipping Container Texture (Industrial Orange / Blue)
   */
  public static createStylizedContainerTexture(baseColor: string = '#d97706'): THREE.Texture {
    const key = `stylized_container_${baseColor}`;
    const cached = this.textureCache.get(key);
    if (cached) return cached;

    if (typeof document === 'undefined') {
      return this.createFallbackTexture(0xd97706);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return this.createFallbackTexture(0xd97706);

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 512);

    // Stepped Corrugation Ribs
    const ribW = 32;
    for (let x = 0; x < 512; x += ribW) {
      // Shadow rib face
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(x, 0, ribW * 0.45, 512);

      // Highlight rib face
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(x + ribW * 0.45, 0, ribW * 0.55, 512);

      // Hard inking seam
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x, 0, 2, 512);
    }

    // Top and Bottom Structural Frame Rails
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 16);
    ctx.fillRect(0, 496, 512, 16);

    const texture = new THREE.CanvasTexture(canvas);
    this.configureTexture(texture, true, 4, 2);
    this.textureCache.set(key, texture);
    return texture;
  }

  /**
   * Preload all procedural textures and pre-upload them to GPU VRAM
   * to completely eliminate mid-gameplay Canvas 2D convolution stalls and texImage2D spikes.
   */
  public static preloadAll(renderer?: THREE.WebGLRenderer): void {
    const textures = [
      this.createAsphaltTexture(),
      this.createWetAsphaltNormalTexture(),
      this.createWetAsphaltRoughnessTexture(),
      this.createWetAsphaltAOTexture(),
      this.createBrickTexture(),
      this.createBrickNormalTexture(),
      this.createBrickRoughnessTexture(),
      this.createBrickAOTexture(),
      this.createCorrugatedMetalTexture(),
      this.createCorrugatedMetalNormalTexture(),
      this.createCorrugatedMetalRoughnessTexture(),
      this.createSteelPlateTexture(),
      this.createSteelPlateNormalTexture(),
      this.createPierWoodTexture(),
      this.createStylizedPierWood(),
      this.createStylizedContainerTexture(),
      this.createWaterNormalTexture(),
      this.createHazardStripeTexture(),
      this.createVelvetFurTexture(),
      this.createFurNormalTexture(),
      this.createFurRoughnessTexture(),
      this.createDrainageGrateTexture(),
      this.createOilSheenTexture()
    ];

    if (renderer && typeof renderer.initTexture === 'function') {
      textures.forEach((tex) => {
        try {
          renderer.initTexture(tex);
        } catch {
          // Safe fallback
        }
      });
    }
  }
}



