import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, '..');
const distDirectory = path.join(projectRoot, 'dist');

if (path.dirname(distDirectory) !== projectRoot || path.basename(distDirectory) !== 'dist') {
  throw new Error(`Refusing to clean unexpected path: ${distDirectory}`);
}

await rm(distDirectory, { recursive: true, force: true });
console.log(`Removed ${distDirectory}`);
