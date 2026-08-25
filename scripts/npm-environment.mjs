export function createIsolatedNpmEnvironment(baseEnvironment, cacheDirectory, userConfigPath) {
  const environment = {
    ...baseEnvironment,
    HUSKY: '0',
  };

  for (const environmentName of Object.keys(environment)) {
    if (/^npm_config_/i.test(environmentName)) {
      delete environment[environmentName];
    }
  }

  delete environment.NODE_AUTH_TOKEN;
  delete environment.NPM_TOKEN;
  environment.NPM_CONFIG_CACHE = cacheDirectory;
  environment.NPM_CONFIG_USERCONFIG = userConfigPath;
  return environment;
}
