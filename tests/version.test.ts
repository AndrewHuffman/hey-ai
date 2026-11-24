import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKAGE_VERSION, readPackageVersion } from '../src/version.js';

describe('package version', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'hey-ai-version-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('matches the version in package.json', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(PACKAGE_VERSION).toBe(packageJson.version);
  });

  it('reads the version from the given package.json', () => {
    const file = path.join(tempDir, 'package.json');
    writeFileSync(file, JSON.stringify({ name: 'x', version: '9.8.7' }));
    expect(readPackageVersion(pathToFileURL(file))).toBe('9.8.7');
  });

  it.each([
    ['a missing version', { name: 'x' }],
    ['an empty version', { name: 'x', version: '' }],
    ['a non-string version', { name: 'x', version: 1 }],
  ])('rejects %s instead of reporting a placeholder', (_label, contents) => {
    const file = path.join(tempDir, 'package.json');
    writeFileSync(file, JSON.stringify(contents));
    expect(() => readPackageVersion(pathToFileURL(file))).toThrow('Missing "version"');
  });
});
