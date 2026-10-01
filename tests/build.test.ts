import { spawnSync } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('CLI build permissions', () => {
  it('keeps an existing CLI link executable across clean builds', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hey-ai-build-'));
    try {
      await mkdir(path.join(root, 'scripts'));
      await mkdir(path.join(root, 'src'));
      for (const script of ['clean.mjs', 'make-cli-executable.mjs']) {
        await copyFile(path.resolve('scripts', script), path.join(root, 'scripts', script));
      }
      await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { outDir: 'dist', rootDir: 'src', types: [] },
        include: ['src'],
      }));
      await writeFile(path.join(root, 'src/index.ts'), '#!/usr/bin/env node\nconsole.log("CLI fixture works");\n');
      const { scripts } = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));
      const env = {
        ...process.env,
        PATH: [path.dirname(process.execPath), path.resolve('node_modules/.bin'), process.env.PATH].join(path.delimiter),
      };
      const cliPath = path.join(root, 'dist/index.js');
      const linkedPath = path.join(root, 'hey-ai');
      await symlink(cliPath, linkedPath);

      for (let build = 0; build < 2; build++) {
        const result = spawnSync(scripts.build, { shell: true, cwd: root, env, encoding: 'utf8' });
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        await expect(access(path.join(root, 'dist/stale.js'))).rejects.toMatchObject({ code: 'ENOENT' });
        if (process.platform !== 'win32') {
          expect((await stat(cliPath)).mode & 0o777).toBe(0o755);
          const cli = spawnSync(linkedPath, [], { cwd: root, env, encoding: 'utf8' });
          expect(cli.error).toBeUndefined();
          expect(cli.status).toBe(0);
          expect(cli.stdout.trim()).toBe('CLI fixture works');
        }
        await writeFile(path.join(root, 'dist/stale.js'), '// stale output');
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
