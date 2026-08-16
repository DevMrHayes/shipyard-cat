import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const ROOT_DIR = process.cwd();
const PUBLIC_MODELS = path.join(ROOT_DIR, 'public', 'models');
const PUBLIC_TEXTURES = path.join(ROOT_DIR, 'public', 'textures');
const PUBLIC_ENV = path.join(ROOT_DIR, 'public', 'environment');

[PUBLIC_MODELS, PUBLIC_TEXTURES, PUBLIC_ENV].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url} -> ${destPath}`);
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : http;

    const request = (targetUrl) => {
      client.get(targetUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log(`Redirecting to: ${response.headers.location}`);
          return request(response.headers.location);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          return reject(new Error(`Failed to download ${targetUrl}, status code: ${response.statusCode}`));
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            console.log(`Saved: ${destPath} (${fs.statSync(destPath).size} bytes)`);
            resolve(destPath);
          });
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
    };

    request(url);
  });
}

async function main() {
  const assets = [
    // 1. HDRI Skybox (Poly Haven / Raw Open HDR sunset/industrial sky)
    {
      url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/industrial_sunset_puresky_01_1k.hdr',
      dest: path.join(PUBLIC_ENV, 'industrial_sunset_1k.hdr')
    },
    // Fallback HDRI
    {
      url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/evening_road_01_puresky_1k.hdr',
      dest: path.join(PUBLIC_ENV, 'evening_sky_1k.hdr')
    },
    // 2. PBR Asphalt / Concrete Textures (Poly Haven 1k)
    {
      url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_diff_1k.jpg',
      dest: path.join(PUBLIC_TEXTURES, 'asphalt_diff_1k.jpg')
    },
    {
      url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_nor_gl_1k.jpg',
      dest: path.join(PUBLIC_TEXTURES, 'asphalt_nor_1k.jpg')
    },
    {
      url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_rough_1k.jpg',
      dest: path.join(PUBLIC_TEXTURES, 'asphalt_rough_1k.jpg')
    },
    {
      url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_ao_1k.jpg',
      dest: path.join(PUBLIC_TEXTURES, 'asphalt_ao_1k.jpg')
    },
    // 3. PBR Weathered Brick Textures
    {
      url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_diff_1k.jpg',
      dest: path.join(PUBLIC_TEXTURES, 'brick_diff_1k.jpg')
    },
    {
      url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_nor_gl_1k.jpg',
      dest: path.join(PUBLIC_TEXTURES, 'brick_nor_1k.jpg')
    },
    {
      url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_rough_1k.jpg',
      dest: path.join(PUBLIC_TEXTURES, 'brick_rough_1k.jpg')
    },
    // 4. PBR Rusty Metal / Hull Textures
    {
      url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rusty_metal_02/rusty_metal_02_diff_1k.jpg',
      dest: path.join(PUBLIC_TEXTURES, 'metal_diff_1k.jpg')
    },
    {
      url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rusty_metal_02/rusty_metal_02_nor_gl_1k.jpg',
      dest: path.join(PUBLIC_TEXTURES, 'metal_nor_1k.jpg')
    },
    {
      url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rusty_metal_02/rusty_metal_02_rough_1k.jpg',
      dest: path.join(PUBLIC_TEXTURES, 'metal_rough_1k.jpg')
    },
    // 5. Permissive Free 3D Models (.glb / .gltf samples)
    {
      url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/glTF-Binary/Fox.glb',
      dest: path.join(PUBLIC_MODELS, 'quadruped_creature.glb')
    },
    {
      url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb',
      dest: path.join(PUBLIC_MODELS, 'duck_sample.glb')
    }
  ];

  for (const asset of assets) {
    try {
      await downloadFile(asset.url, asset.dest);
    } catch (err) {
      console.warn(`Warning: Could not download ${asset.url}:`, err.message);
    }
  }

  console.log('Asset download phase completed.');
}

main();
