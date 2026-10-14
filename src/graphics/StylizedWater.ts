import * as THREE from 'three';

export interface StylizedWaterConfig {
  width: number;
  depth: number;
  position: THREE.Vector3;
  segmentsX?: number;
  segmentsZ?: number;
  shorelineX?: number;        // World X coordinate where pier/shoreline meets water
  isEnclosedBasin?: boolean;  // True for Dry Dock 12 (four-wall edge foam), False for James River
  waveScale?: number;         // Dampens wave height inside enclosed basins
}

/**
 * StylizedWater: GPU-accelerated Gerstner wave displacement with shoreline & pier contact foam,
 * two-tone Atlantic depth gradient, and stylized cel sun specular reflection.
 * Evaluates 100% on the GPU with zero per-frame CPU vertex manipulation stalls.
 */
export class StylizedWater {
  public mesh: THREE.Mesh;
  public material: THREE.ShaderMaterial;

  private static readonly VERTEX_SHADER = /* glsl */ `
    uniform float uTime;
    uniform float uWaveScale;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vWaveHeight;

    // Gerstner Wave calculation
    vec3 calcGerstnerWave(vec4 wave, vec3 p, inout vec3 tangent, inout vec3 binormal) {
      float steepness = wave.z;
      float wavelength = wave.w;
      float k = 2.0 * 3.14159265 / wavelength;
      float c = sqrt(9.8 / k);
      vec2 d = normalize(wave.xy);
      float f = k * (dot(d, p.xz) - c * uTime);
      float a = steepness / k * uWaveScale;

      tangent += vec3(
        -d.x * d.x * (steepness * sin(f)),
        d.x * (steepness * cos(f)),
        -d.x * d.y * (steepness * sin(f))
      );
      binormal += vec3(
        -d.x * d.y * (steepness * sin(f)),
        d.y * (steepness * cos(f)),
        -d.y * d.y * (steepness * sin(f))
      );

      return vec3(
        d.x * (a * cos(f)),
        a * sin(f),
        d.y * (a * cos(f))
      );
    }

    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vec3 gridPoint = worldPosition.xyz;

      vec3 tangent = vec3(1.0, 0.0, 0.0);
      vec3 binormal = vec3(0.0, 0.0, 1.0);
      vec3 p = gridPoint;

      // 3 distinct Gerstner waves: (dirX, dirZ, steepness, wavelength)
      vec4 waveA = vec4(1.0, 0.35, 0.14, 18.0);
      vec4 waveB = vec4(0.6, -0.8, 0.10, 9.5);
      vec4 waveC = vec4(-0.4, -0.9, 0.07, 4.8);

      vec3 displacement = vec3(0.0);
      displacement += calcGerstnerWave(waveA, gridPoint, tangent, binormal);
      displacement += calcGerstnerWave(waveB, gridPoint, tangent, binormal);
      displacement += calcGerstnerWave(waveC, gridPoint, tangent, binormal);

      p += displacement;
      vWaveHeight = displacement.y;
      vWorldPos = p;
      vNormal = normalize(cross(binormal, tangent));

      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }
  `;

  private static readonly FRAGMENT_SHADER = /* glsl */ `
    uniform float uTime;
    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform vec3 uFoamColor;
    uniform vec3 uSunDirection;
    uniform vec3 uCameraPos;
    uniform float uShorelineX;
    uniform float uIsEnclosedBasin;
    uniform vec4 uBasinBounds; // minX, maxX, minZ, maxZ

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vWaveHeight;

    // Fast procedural 2D hash & value noise for organic cellular foam
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    void main() {
      // 1. Distance from shoreline / basin walls for depth gradient & contact foam
      float distFromEdge = 0.0;
      if (uIsEnclosedBasin > 0.5) {
        float dx = min(abs(vWorldPos.x - uBasinBounds.x), abs(uBasinBounds.y - vWorldPos.x));
        float dz = min(abs(vWorldPos.z - uBasinBounds.z), abs(uBasinBounds.w - vWorldPos.z));
        distFromEdge = min(dx, dz);
      } else {
        distFromEdge = max(0.0, vWorldPos.x - uShorelineX);
      }

      // 2. Depth Gradient (#06b6d4 turquoise shallows -> #0c4a6e deep Atlantic)
      float depthFactor = clamp(distFromEdge / 26.0, 0.0, 1.0);
      float celDepth = mix(depthFactor, floor(depthFactor * 5.0) / 5.0, 0.28);
      vec3 waterColor = mix(uShallowColor, uDeepColor, celDepth);

      // 3. Animated surface noise ripples
      vec2 uvNoise1 = vWorldPos.xz * 0.28 + vec2(uTime * 0.18, uTime * 0.12);
      vec2 uvNoise2 = vWorldPos.xz * 0.55 - vec2(uTime * 0.14, -uTime * 0.22);
      float surfacePattern = (noise(uvNoise1) * 0.6 + noise(uvNoise2) * 0.4);

      // 4. Wave Crest Foam Lines
      float crestThreshold = smoothstep(0.09, 0.20, vWaveHeight + (surfacePattern - 0.5) * 0.12);
      float ribbonFoam = step(0.76, surfacePattern + vWaveHeight * 1.4) * 0.55;

      // 5. Contact Shoreline & Pier Edge Foam
      float shoreAnimated = distFromEdge + sin(uTime * 2.6 + vWorldPos.z * 0.45) * 0.45;
      float contactBand1 = 1.0 - smoothstep(0.0, 1.8, shoreAnimated);
      float contactBand2 = (1.0 - smoothstep(1.8, 4.2, shoreAnimated)) * step(0.52, surfacePattern);
      float contactFoam = clamp(contactBand1 + contactBand2, 0.0, 1.0);

      // Combine foam layers
      float totalFoam = clamp(max(crestThreshold, max(ribbonFoam, contactFoam)), 0.0, 1.0);
      vec3 finalColor = mix(waterColor, uFoamColor, totalFoam);

      // 6. Stylized Cel Sun Specular Reflection
      vec3 viewDir = normalize(uCameraPos - vWorldPos);
      vec3 halfVec = normalize(uSunDirection + viewDir);
      float NdotH = max(0.0, dot(normalize(vNormal), halfVec));
      float specPower = pow(NdotH, 96.0);
      float celSpec = step(0.32, specPower) * 0.9 + step(0.08, specPower) * 0.22;
      finalColor += vec3(1.0, 0.97, 0.88) * celSpec;

      gl_FragColor = vec4(finalColor, 0.92);
    }
  `;

  constructor(configOrWidth: StylizedWaterConfig | number = 240, length: number = 280) {
    let config: StylizedWaterConfig;
    if (typeof configOrWidth === 'number') {
      config = {
        width: configOrWidth,
        depth: length,
        position: new THREE.Vector3(177, 0.85, 0),
        segmentsX: 4,
        segmentsZ: 4,
        shorelineX: 56.5,
        isEnclosedBasin: false,
        waveScale: 1.0
      };
    } else {
      config = configOrWidth;
    }

    // Default 4x4 subdivisions = (4+1)*(4+1) = 25 vertices for guaranteed zero CPU/GPU stall
    const segX = config.segmentsX ?? 4;
    const segZ = config.segmentsZ ?? 4;

    const geometry = new THREE.PlaneGeometry(config.width, config.depth, segX, segZ);
    geometry.rotateX(-Math.PI / 2);

    const halfW = config.width / 2;
    const halfD = config.depth / 2;

    this.material = new THREE.ShaderMaterial({
      vertexShader: StylizedWater.VERTEX_SHADER,
      fragmentShader: StylizedWater.FRAGMENT_SHADER,
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uWaveScale: { value: config.waveScale ?? 1.0 },
        uDeepColor: { value: new THREE.Color(0x0c4a6e) },    // Deep Atlantic (#0c4a6e)
        uShallowColor: { value: new THREE.Color(0x06b6d4) }, // Turquoise Shallows (#06b6d4)
        uFoamColor: { value: new THREE.Color(0xf0f9ff) },    // Seafoam white
        uSunDirection: { value: new THREE.Vector3(0.6, 0.75, 0.3).normalize() },
        uCameraPos: { value: new THREE.Vector3() },
        uShorelineX: { value: config.shorelineX ?? (config.position.x - halfW) },
        uIsEnclosedBasin: { value: config.isEnclosedBasin ? 1.0 : 0.0 },
        uBasinBounds: {
          value: new THREE.Vector4(
            config.position.x - halfW,
            config.position.x + halfW,
            config.position.z - halfD,
            config.position.z + halfD
          )
        }
      }
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.copy(config.position);
    this.mesh.name = config.isEnclosedBasin ? 'DryDockStylizedWater' : 'JamesRiverStylizedWater';
    this.mesh.receiveShadow = false;
  }

  public update(elapsedTime: number, cameraPosition?: THREE.Vector3): void {
    this.material.uniforms.uTime.value = elapsedTime;
    if (cameraPosition) {
      this.material.uniforms.uCameraPos.value.copy(cameraPosition);
    }
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
