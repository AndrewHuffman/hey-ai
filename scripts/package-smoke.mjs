import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIsolatedNpmEnvironment } from './npm-environment.mjs';
import { parseNpmPackMetadata } from './npm-pack-metadata.mjs';
import { getRetainedTarballArgument } from './package-smoke-arguments.mjs';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, '..');
const retainedTarballArgument = getRetainedTarballArgument(process.argv.slice(2));
const retainedTarball = retainedTarballArgument
  ? path.resolve(retainedTarballArgument)
  : undefined;
const staleModule = 'dist/__stale_package_smoke__.js';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: process.env,
    ...options,
  });

  if (result.error || result.status !== 0) {
    const details = [
      result.error?.message,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n');
    throw new Error(`${command} ${args.join(' ')} failed${details ? `:\n${details}` : ''}`);
  }

  return result;
}

async function listSourceModules(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const modules = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      modules.push(...await listSourceModules(absolutePath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      modules.push(`dist/${relativePath.replace(/\.ts$/, '.js')}`);
    }
  }

  return modules;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'hey-ai-package-smoke-'));
const stalePath = path.join(projectRoot, ...staleModule.split('/'));

try {
  const cacheDirectory = path.join(temporaryRoot, 'npm-cache');
  const userConfigPath = path.join(temporaryRoot, 'npmrc');
  const packDirectory = path.join(temporaryRoot, 'packed');
  const installDirectory = path.join(temporaryRoot, 'installed');
  const childEnvironment = createIsolatedNpmEnvironment(
    process.env,
    cacheDirectory,
    userConfigPath,
  );

  await mkdir(packDirectory, { recursive: true });
  await writeFile(userConfigPath, '');
  await mkdir(path.dirname(stalePath), { recursive: true });
  await writeFile(stalePath, 'throw new Error("stale build output was packaged");\n');

  const packResult = run(
    'npm',
    ['pack', '--json', '--pack-destination', packDirectory],
    { env: childEnvironment },
  );
  const packageRecord = parseNpmPackMetadata(packResult.stdout);
  assert(packageRecord && typeof packageRecord === 'object', 'npm pack returned an invalid package record');
  assert(Array.isArray(packageRecord.files), 'npm pack metadata did not include a file inventory');
  assert(typeof packageRecord.filename === 'string', 'npm pack metadata did not include a filename');
  const inventory = packageRecord.files.map((file) => file.path).sort();
  const inventorySet = new Set(inventory);
  const expectedRuntimeModules = await listSourceModules(path.join(projectRoot, 'src'));

  for (const runtimeModule of expectedRuntimeModules) {
    assert(inventorySet.has(runtimeModule), `Package is missing runtime module: ${runtimeModule}`);
  }

  for (const requiredModule of ['dist/tools/index.js', 'dist/tools/internal.js']) {
    assert(inventorySet.has(requiredModule), `Package is missing required tool module: ${requiredModule}`);
  }

  assert(!inventorySet.has(staleModule), `Package contains stale build output: ${staleModule}`);
  assert(!inventorySet.has('dist/mcp/config.js'), 'Package contains deleted runtime module: dist/mcp/config.js');

  const unexpectedFiles = inventory.filter((file) => (
    file !== 'package.json'
    && file.toLowerCase() !== 'readme.md'
    && !file.startsWith('dist/')
  ));
  assert(
    unexpectedFiles.length === 0,
    `Package contains files outside the release allowlist: ${unexpectedFiles.join(', ')}`,
  );

  const forbiddenSegments = [
    '.agent/',
    '.claude/',
    '.github/',
    '.husky/',
    'coverage/',
    'docs/',
    'scripts/',
    'src/',
    'tests/',
    'tools/',
  ];
  const forbiddenFiles = inventory.filter((file) => forbiddenSegments.some((segment) => file.startsWith(segment)));
  assert(forbiddenFiles.length === 0, `Package contains forbidden files: ${forbiddenFiles.join(', ')}`);

  const packedTarball = path.join(packDirectory, packageRecord.filename);
  const tarballToInstall = retainedTarball ?? packedTarball;

  if (retainedTarball) {
    await mkdir(path.dirname(retainedTarball), { recursive: true });
    await copyFile(packedTarball, retainedTarball);
  }

  await writeFile(userConfigPath, '');
  const activeUserConfig = run('npm', ['config', 'get', 'userconfig'], { env: childEnvironment });
  assert(
    path.resolve(activeUserConfig.stdout.trim()) === userConfigPath,
    `npm user configuration is not isolated: ${activeUserConfig.stdout.trim()}`,
  );
  const npmCutoff = run('npm', ['config', 'get', 'before'], { env: childEnvironment });
  assert(
    npmCutoff.stdout.trim() === 'null',
    `npm package cutoff is not isolated: ${npmCutoff.stdout.trim()}`,
  );

  run(
    'npm',
    ['install', '--prefix', installDirectory, '--no-package-lock', tarballToInstall],
    { env: childEnvironment },
  );

  const executable = path.join(
    installDirectory,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'hey-ai.cmd' : 'hey-ai',
  );
  const help = run(executable, ['--help'], { cwd: installDirectory, env: childEnvironment });
  const version = run(executable, ['--version'], { cwd: installDirectory, env: childEnvironment });
  const models = run(executable, ['models'], { cwd: installDirectory, env: childEnvironment });

  assert(help.stdout.includes('Usage: hey-ai'), 'Installed CLI help output was unexpected');
  assert(version.stdout.trim().length > 0, 'Installed CLI did not report a version');
  assert(models.stdout.includes('Recommended Models:'), 'Installed CLI models output was unexpected');

  console.log(`Verified ${packageRecord.filename} (${inventory.length} files, ${packageRecord.size} bytes)`);
  console.log(inventory.join('\n'));
  if (retainedTarball) {
    console.log(`Retained verified tarball at ${retainedTarball}`);
  }
} finally {
  await rm(stalePath, { force: true });
  await rm(temporaryRoot, { recursive: true, force: true });
}
