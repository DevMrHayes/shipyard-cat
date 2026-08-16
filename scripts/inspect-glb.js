import fs from 'fs';
import path from 'path';

// Let's inspect cat.glb and rat.glb binary header
const catPath = path.join(process.cwd(), 'public', 'models', 'cat.glb');
const ratPath = path.join(process.cwd(), 'public', 'models', 'rat.glb');

function inspectGlb(name, file) {
  if (!fs.existsSync(file)) {
    console.log(`${name}: File does not exist`);
    return;
  }
  const buf = fs.readFileSync(file);
  const magic = buf.toString('ascii', 0, 4);
  const version = buf.readUInt32LE(4);
  const length = buf.readUInt32LE(8);
  console.log(`${name}: magic=${magic}, version=${version}, length=${length} bytes (fileSize=${buf.length})`);
  
  // Read JSON chunk
  const jsonChunkLen = buf.readUInt32LE(12);
  const jsonChunkType = buf.toString('ascii', 16, 20);
  const jsonText = buf.toString('utf8', 20, 20 + jsonChunkLen);
  try {
    const gltf = JSON.parse(jsonText);
    console.log(`${name} nodes:`, gltf.nodes?.map(n => n.name));
    console.log(`${name} meshes:`, gltf.meshes?.map(m => m.name));
    console.log(`${name} animations:`, gltf.animations?.map(a => a.name));
  } catch (e) {
    console.log('Error parsing JSON chunk:', e.message);
  }
}

inspectGlb('CAT', catPath);
console.log('----------------');
inspectGlb('RAT', ratPath);
