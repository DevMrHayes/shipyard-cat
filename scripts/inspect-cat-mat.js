import fs from 'fs';
import path from 'path';

const catPath = path.join(process.cwd(), 'public', 'models', 'cat.glb');
const buf = fs.readFileSync(catPath);
const jsonChunkLen = buf.readUInt32LE(12);
const jsonText = buf.toString('utf8', 20, 20 + jsonChunkLen);
const gltf = JSON.parse(jsonText);

console.log('Materials:', JSON.stringify(gltf.materials, null, 2));
console.log('Textures:', JSON.stringify(gltf.textures, null, 2));
console.log('Images:', JSON.stringify(gltf.images, null, 2));
