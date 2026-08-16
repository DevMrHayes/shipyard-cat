import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const ROOT_DIR = process.cwd();
const PUBLIC_MODELS = path.join(ROOT_DIR, 'public', 'models');

if (!fs.existsSync(PUBLIC_MODELS)) {
  fs.mkdirSync(PUBLIC_MODELS, { recursive: true });
}

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
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
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
  const models = [
    // 1. Animated Cat model (Quaternius / Open Game Art / GitHub mirror)
    {
      urls: [
        'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Fox/glTF-Binary/Fox.glb',
        'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/glTF-Binary/Fox.glb'
      ],
      dest: path.join(PUBLIC_MODELS, 'cat.glb')
    },
    // 2. Rat model
    {
      urls: [
        'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb'
      ],
      dest: path.join(PUBLIC_MODELS, 'rat.glb')
    }
  ];

  for (const m of models) {
    let downloaded = false;
    for (const u of m.urls) {
      try {
        await downloadFile(u, m.dest);
        downloaded = true;
        break;
      } catch (err) {
        console.warn(`Could not fetch ${u}:`, err.message);
      }
    }
  }

  console.log('Model download phase finished.');
}

main();
