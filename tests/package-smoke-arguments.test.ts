import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadArgumentParser(): Promise<(arguments_: string[]) => string | undefined> {
  const moduleUrl = pathToFileURL(path.resolve('scripts/package-smoke-arguments.mjs')).href;
  const module = await import(moduleUrl);
  return module.getRetainedTarballArgument;
}

describe('package smoke arguments', () => {
  it('accepts a retained tarball path with or without a pnpm separator', async () => {
    const getRetainedTarballArgument = await loadArgumentParser();

    expect(getRetainedTarballArgument(['/tmp/hey-ai.tgz'])).toBe('/tmp/hey-ai.tgz');
    expect(getRetainedTarballArgument(['--', '/tmp/hey-ai.tgz'])).toBe('/tmp/hey-ai.tgz');
  });

  it('allows no retained tarball and rejects ambiguous paths', async () => {
    const getRetainedTarballArgument = await loadArgumentParser();

    expect(getRetainedTarballArgument([])).toBeUndefined();
    expect(() => getRetainedTarballArgument(['/tmp/one.tgz', '/tmp/two.tgz'])).toThrow(
      'Expected at most one retained tarball path',
    );
  });
});
