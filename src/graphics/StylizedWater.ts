import * as THREE from 'three';

/**
 * StylizedWater - Dual Gerstner Wave displacement with shoreline/pier contact foam.
 * Replaces the flat scrolling plane with animated maritime water.
 */
export class StylizedWater {
  public mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(width: number = 240, length: number = 280) {
    const geometry = new THREE.PlaneGeometry(width, length, 48, 48);
    geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uShallowColor: { value: new THREE.Color(0x06b6d4) }, // Turquoise #06b6d4
        uDeepColor: { value: new THREE.Color(0x0c4a6e) },    // Deep Atlantic #0c4a6e
        uFoamColor: { value: new THREE.Color(0xfef9c3) },    // Golden White Foam #fef9c3
        uSunDirection: { value: new THREE.Vector3(0.5, 0.7, 0.5).normalize() }
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        // Gerstner Wave Math
        vec3 gerstnerWave(vec4 wave, vec3 p, inout vec3 tangent, inout vec3 binormal) {
          float steepness = wave.z;
          float wavelength = wave.w;
          float k = 2.0 * 3.14159 / wavelength;
          float c = sqrt(9.8 / k);
          vec2 d = normalize(wave.xy);
          float f = k * (dot(d, p.xz) - c * uTime * 0.9);
          float a = steepness / k;

          tangent += vec3(-d.x * d.x * (steepness * sin(f)), d.x * (steepness * cos(f)), -d.x * d.y * (steepness * sin(f)));
          binormal += vec3(-d.x * d.y * (steepness * sin(f)), d.y * (steepness * cos(f)), -d.y * d.y * (steepness * sin(f)));

          return vec3(d.x * (a * cos(f)), a * sin(f), d.y * (a * cos(f)));
        }

        void main() {
          vUv = uv;
          vec3 p = position;
          vec3 tangent = vec3(1.0, 0.0, 0.0);
          vec3 binormal = vec3(0.0, 0.0, 1.0);

          p += gerstnerWave(vec4(1.0, 0.3, 0.12, 12.0), position, tangent, binormal);
          p += gerstnerWave(vec4(0.3, 1.0, 0.08, 6.0), position, tangent, binormal);

          vNormal = normalize(cross(binormal, tangent));
          vec4 worldPos = modelMatrix * vec4(p, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uShallowColor;
        uniform vec3 uDeepColor;
        uniform vec3 uFoamColor;
        uniform vec3 uSunDirection;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
          // 1. Two-tone water depth gradient
          float heightFactor = clamp((vWorldPos.y - 0.7) / 0.4, 0.0, 1.0);
          vec3 baseWater = mix(uDeepColor, uShallowColor, heightFactor);

          // 2. Stylized Cel Sun Specular
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 halfVector = normalize(uSunDirection + viewDir);
          float NdotH = max(0.0, dot(vNormal, halfVector));
          float spec = step(0.92, pow(NdotH, 32.0));

          // 3. Dynamic Wave Crest Foam
          float crest = smoothstep(0.92, 0.98, vWorldPos.y);
          vec3 withCrest = mix(baseWater, uFoamColor, crest);

          // 4. Stylized Pier Shoreline Foam Lines
          float shoreDist = smoothstep(57.0, 56.0, vWorldPos.x); // Pier boardwalk edge at X=56.5
          float foamPattern = sin(vWorldPos.z * 1.5 + uTime * 2.0) * 0.5 + 0.5;
          float shoreFoam = shoreDist * step(0.4, foamPattern);

          vec3 finalColor = mix(withCrest, uFoamColor, shoreFoam * 0.75) + spec * vec3(1.0, 0.95, 0.8);
          gl_FragColor = vec4(finalColor, 0.92);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.receiveShadow = true;
  }

  public update(deltaTime: number): void {
    this.material.uniforms.uTime.value += deltaTime;
  }
}
