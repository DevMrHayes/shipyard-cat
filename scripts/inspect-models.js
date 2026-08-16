import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const PUBLIC_MODELS = path.join(ROOT_DIR, 'public', 'models');

const files = fs.readdirSync(PUBLIC_MODELS);
console.log('--- PUBLIC/MODELS INSPECTION ---');
files.forEach(f => {
  const filePath = path.join(PUBLIC_MODELS, f);
  const stats = fs.statSync(filePath);
  console.log(`- ${f}: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
});
