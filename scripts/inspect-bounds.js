import fs from 'fs';
import path from 'path';

const catPath = path.join(process.cwd(), 'public', 'models', 'cat.glb');
const ratPath = path.join(process.cwd(), 'public', 'models', 'rat.glb');

function getBounds(name, file) {
  const buf = fs.readFileSync(file);
  const jsonChunkLen = buf.readUInt32LE(12);
  const jsonText = buf.toString('utf8', 20, 20 + jsonChunkLen);
  const gltf = JSON.parse(jsonText);
  console.log(`\n=== ${name} ACCESSORS & BOUNDS ===`);
  gltf.accessors?.forEach((acc, i) => {
    if (acc.min && acc.max) {
      console.log(`Accessor ${i} (${acc.type}): min=${JSON.stringify(acc.min)}, max=${JSON.stringify(acc.max)}`);
    }
  });
}

getBounds('CAT', catPath);
getBounds('RAT', ratPath);
