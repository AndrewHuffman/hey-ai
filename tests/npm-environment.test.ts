import path from 'node:path';
import { pathToFileURL } from 'node:url';

type EnvironmentFactory = (
  environment: NodeJS.ProcessEnv,
  cacheDirectory: string,
  userConfigPath: string,
) => NodeJS.ProcessEnv;

async function loadEnvironmentFactory(): Promise<EnvironmentFactory> {
  const moduleUrl = pathToFileURL(path.resolve('scripts/npm-environment.mjs')).href;
  const module = await import(moduleUrl);
  return module.createIsolatedNpmEnvironment;
}

describe('isolated npm environment', () => {
  it('removes inherited npm configuration regardless of key casing', async () => {
    const createIsolatedNpmEnvironment = await loadEnvironmentFactory();
    const environment = createIsolatedNpmEnvironment(
      {
        PATH: '/test/bin',
        npm_config_userconfig: '/real/home/.npmrc',
        NPM_CONFIG_BEFORE: '2026-01-01',
        NpM_CoNfIg_CaChE: '/real/cache',
        NoDe_AuTh_ToKeN: 'secret-node-token',
        nPm_ToKeN: 'secret-npm-token',
      },
      '/isolated/cache',
      '/isolated/npmrc',
    );

    expect(environment).toEqual({
      PATH: '/test/bin',
      HUSKY: '0',
      NPM_CONFIG_CACHE: '/isolated/cache',
      NPM_CONFIG_USERCONFIG: '/isolated/npmrc',
    });
  });
});
