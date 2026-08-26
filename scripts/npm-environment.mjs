export function createIsolatedNpmEnvironment(baseEnvironment, cacheDirectory, userConfigPath) {
  const environment = {
    ...baseEnvironment,
    HUSKY: '0',
  };

  for (const environmentName of Object.keys(environment)) {
    if (/^(?:npm_config_.*|node_auth_token|npm_token)$/i.test(environmentName)) {
      delete environment[environmentName];
    }
  }

  environment.NPM_CONFIG_CACHE = cacheDirectory;
  environment.NPM_CONFIG_USERCONFIG = userConfigPath;
  return environment;
}
