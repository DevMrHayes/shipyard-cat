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
    console.log(`Attempting download: ${url}`);
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : http;

    const request = (targetUrl) => {
      client.get(targetUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log(`Following redirect to: ${response.headers.location}`);
          return request(response.headers.location);
        }

        if (response.statusCode !== 200) {
          file.close();
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          return reject(new Error(`Failed with HTTP ${response.statusCode}`));
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            const size = fs.statSync(destPath).size;
            console.log(`Successfully saved: ${destPath} (${size} bytes)`);
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
  // Candidate CDN and raw GitHub endpoints for animated/rigged domestic cat models
  const catCandidates = [
    // Open-source CC0 animated cat models from game asset repos
    'https://raw.githubusercontent.com/pmndrs/drei-assets/master/cat.glb',
    'https://raw.githubusercontent.com/stemkoski/Three.js-Examples/master/models/gltf/cat.glb',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/models/gltf/Cat.glb',
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Cat/glTF-Binary/Cat.glb'
  ];

  const targetPath = path.join(PUBLIC_MODELS, 'cat.glb');
  let downloaded = false;

  for (const url of catCandidates) {
    try {
      await downloadFile(url, targetPath);
      downloaded = true;
      console.log(`Cat model updated from: ${url}`);
      break;
    } catch (err) {
      console.warn(`URL failed (${url}): ${err.message}`);
    }
  }

  if (!downloaded) {
    console.log('Online CDN sources unavailable. Ready for local /public/models/cat.glb placement.');
  }
}

main();
