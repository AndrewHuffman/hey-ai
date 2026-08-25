import { pathToFileURL } from 'node:url';

async function loadParser(): Promise<(output: string) => Record<string, unknown>> {
  const moduleUrl = pathToFileURL('scripts/npm-pack-metadata.mjs').href;
  const module = await import(moduleUrl);
  return module.parseNpmPackMetadata;
}

const packageRecord = {
  id: 'hey-ai@0.6.3',
  name: 'hey-ai',
  version: '0.6.3',
  filename: 'hey-ai-0.6.3.tgz',
  files: [{ path: 'dist/index.js', size: 100, mode: 420 }],
};

describe('npm pack metadata parser', () => {
  it('parses the npm 10 array format after lifecycle output', async () => {
    const parseNpmPackMetadata = await loadParser();
    const output = `Removed /tmp/dist\nHUSKY=0 skip install\n${JSON.stringify([packageRecord])}\n`;

    expect(parseNpmPackMetadata(output)).toEqual(packageRecord);
  });

  it('parses the npm 12 package-name map after lifecycle output', async () => {
    const parseNpmPackMetadata = await loadParser();
    const output = `Removed /tmp/dist\nHUSKY=0 skip install${JSON.stringify({ 'hey-ai': packageRecord }, null, 2)}\n`;

    expect(parseNpmPackMetadata(output)).toEqual(packageRecord);
  });

  it('rejects ambiguous or missing metadata', async () => {
    const parseNpmPackMetadata = await loadParser();

    expect(() => parseNpmPackMetadata('{}')).toThrow('expected exactly one');
    expect(() => parseNpmPackMetadata('ordinary lifecycle output')).toThrow(
      'Could not find npm pack metadata',
    );
  });
});
