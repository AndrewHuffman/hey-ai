import { spawnSync } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('package smoke cleanup', () => {
  it('removes the stale sentinel when npm pack fails before prepack', async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'hey-ai-package-smoke-failure-'));
    const scriptsDirectory = path.join(fixtureRoot, 'scripts');
    const fixtureScript = path.join(scriptsDirectory, 'package-smoke.mjs');
    const stalePath = path.join(fixtureRoot, 'dist', '__stale_package_smoke__.js');

    try {
      await mkdir(scriptsDirectory, { recursive: true });
      await copyFile(path.resolve('scripts/package-smoke.mjs'), fixtureScript);
      await writeFile(path.join(fixtureRoot, 'package.json'), '{ invalid json');

      const result = spawnSync(process.execPath, [fixtureScript], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env: { ...process.env, HUSKY: '0' },
      });

      expect(result.status).not.toBe(0);
      await expect(access(stalePath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
