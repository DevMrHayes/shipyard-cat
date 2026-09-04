import * as THREE from 'three';

/**
 * ToonMaterialFactory - High-performance Cel-Shading & Stylized Maritime Graphics.
 * Generates 3-band quantized lighting ramps, inverted-hull ink outlines,
 * and pre-compiled stylized toon materials matching the 'Shipyard Stray' aesthetic.
 */
export class ToonMaterialFactory {
  private static rampTextureCache: THREE.DataTexture | null = null;
  private static highContrastRampCache: THREE.DataTexture | null = null;

  /**
   * Generates a 1D 3-tier quantized toon ramp gradient texture
   * Tier 1 (Shadow): Dark Indigo Slate (#2e2d4d)
   * Tier 2 (Midtone): Warm Golden Ochre (#b45309)
   * Tier 3 (Highlight): Crisp Sunlight (#fffbeb)
   */
  public static getOrCreateToonRamp(): THREE.DataTexture {
    if (this.rampTextureCache) return this.rampTextureCache;

    // 4-step quantized smooth ramp for soft antialiased anime shading
    const rampData = new Uint8Array([
      75, 75, 95, 255,     // 0.00 to 0.25 (Shadow Ambient)
      140, 125, 110, 255,  // 0.25 to 0.50 (Halftone Shadow)
      215, 185, 150, 255,  // 0.50 to 0.75 (Warm Golden Midtone)
      255, 252, 245, 255   // 0.75 to 1.00 (Specular Highlight)
    ]);

    const texture = new THREE.DataTexture(rampData, 4, 1, THREE.RGBAFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;

    this.rampTextureCache = texture;
    return texture;
  }

  /**
   * High-contrast 2-tone ramp for ink-drawn industrial shipping containers & steel plates
   */
  public static getOrCreateHighContrastRamp(): THREE.DataTexture {
    if (this.highContrastRampCache) return this.highContrastRampCache;

    const rampData = new Uint8Array([
      90, 90, 115, 255,    // Shadow
      255, 250, 240, 255   // Direct Sunlight
    ]);

    const texture = new THREE.DataTexture(rampData, 2, 1, THREE.RGBAFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;

    this.highContrastRampCache = texture;
    return texture;
  }

  /**
   * Creates a production-ready Cel-Shaded MeshToonMaterial with custom ramp and PBR maps
   */
  public static createCelMaterial(options: {
    color?: THREE.ColorRepresentation;
    map?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    aoMap?: THREE.Texture | null;
    emissive?: THREE.ColorRepresentation;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
    isHighContrast?: boolean;
  }): THREE.MeshToonMaterial {
    const ramp = options.isHighContrast ? this.getOrCreateHighContrastRamp() : this.getOrCreateToonRamp();
    const mat = new THREE.MeshToonMaterial({
      color: options.color ?? 0xffffff,
      gradientMap: ramp,
      map: options.map ?? null,
      normalMap: options.normalMap ?? null,
      aoMap: options.aoMap ?? null,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0.0,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1.0,
      side: THREE.FrontSide
    });

    if (mat.normalMap) {
      mat.normalScale.set(1.2, 1.2);
    }
    return mat;
  }
}
