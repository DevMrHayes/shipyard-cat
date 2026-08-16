import * as THREE from 'three';

export class TextureGenerator {
  private static createFallbackTexture(colorHex: number = 0x888888): THREE.Texture {
    const data = new Uint8Array([
      (colorHex >> 16) & 255,
      (colorHex >> 8) & 255,
      colorHex & 255,
      255
    ]);
    const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generates procedural asphalt staging ground texture with subtle concrete aggregate grain
   */
  public static createAsphaltTexture(): THREE.Texture {
    if (typeof document === 'undefined') return this.createFallbackTexture(0x475569);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Base asphalt industrial slate gray
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 512, 512);

    // Fine industrial asphalt grit noise
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 18;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(24, 24);
    return texture;
  }

  /**
   * Generates weathered shipyard brick texture with mortar seams
   */
  public static createBrickTexture(): THREE.Texture {
    if (typeof document === 'undefined') return this.createFallbackTexture(0x991b1b);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Mortar background
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

        // Brick variation
        const hueShift = Math.floor(Math.random() * 25);
        ctx.fillStyle = `rgb(${155 + hueShift}, ${55 + hueShift / 2}, ${45 + hueShift / 2})`;
        ctx.fillRect(x + 2, y + 2, blockW - 4, blockH - 4);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 3);
    return texture;
  }

  /**
   * Generates riveted steel plating texture with edge wear
   */
  public static createSteelPlateTexture(): THREE.Texture {
    if (typeof document === 'undefined') return this.createFallbackTexture(0x475569);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 512);

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

    // Rivet dots along seams
    ctx.fillStyle = '#64748b';
    const drawRivets = (startX: number, startY: number, endX: number, endY: number) => {
      const dist = Math.hypot(endX - startX, endY - startY);
      const steps = Math.floor(dist / 32);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const rx = startX + (endX - startX) * t;
        const ry = startY + (endY - startY) * t;
        ctx.beginPath();
        ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawRivets(16, 16, 496, 16);
    drawRivets(16, 496, 496, 496);
    drawRivets(16, 16, 16, 496);
    drawRivets(496, 16, 496, 496);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
  }

  /**
   * Generates vibrant maritime ocean water texture with distinct wave crests, turquoise translucency, and white foam lines
   */
  public static createWaterNormalTexture(): THREE.Texture {
    if (typeof document === 'undefined') return this.createFallbackTexture(0x0284c7);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

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
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
  }

  /**
   * Generates realistic weathered timber boardwalk pier wood plank texture
   */
  public static createPierWoodTexture(): THREE.Texture {
    if (typeof document === 'undefined') return this.createFallbackTexture(0x78350f);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Dark creosote oak wood base
    ctx.fillStyle = '#451a03';
    ctx.fillRect(0, 0, 512, 512);

    // Wooden planks with gaps
    const plankHeight = 32;
    for (let y = 0; y < 512; y += plankHeight) {
      const grainVariation = Math.floor(Math.random() * 20) - 10;
      ctx.fillStyle = `rgb(${85 + grainVariation}, ${45 + grainVariation / 2}, ${25 + grainVariation / 2})`;
      ctx.fillRect(2, y + 2, 508, plankHeight - 4);

      // Wood grain lines
      ctx.strokeStyle = 'rgba(20, 10, 5, 0.3)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 4; g++) {
        const gy = y + 4 + g * 6;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(512, gy + (Math.random() - 0.5) * 4);
        ctx.stroke();
      }

      // Fastener nail heads
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.arc(32, y + plankHeight / 2, 2.5, 0, Math.PI * 2);
      ctx.arc(480, y + plankHeight / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 16);
    return texture;
  }

  /**
   * Generates caution yellow & black industrial hazard stripe texture
   */
  public static createHazardStripeTexture(): THREE.Texture {
    if (typeof document === 'undefined') return this.createFallbackTexture(0xeab308);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

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

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 1);
    return texture;
  }
}
