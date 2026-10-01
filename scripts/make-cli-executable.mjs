import { chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../dist/index.js', import.meta.url));
await chmod(cliPath, 0o755);
console.log(`Made CLI executable: ${cliPath}`);
