import { readFileSync } from 'node:fs';

/**
 * Read the version from the package's own package.json at runtime.
 *
 * The release workflow bumps package.json before packing, so reading it here
 * keeps `--version` and the MCP client identity in step with the published
 * package without a build-time copy. `../package.json` resolves to the package
 * root from both `src/` (tsx, Jest) and the compiled `dist/`.
 */
export function readPackageVersion(packageJsonUrl = new URL('../package.json', import.meta.url)): string {
  const { version } = JSON.parse(readFileSync(packageJsonUrl, 'utf8')) as { version?: unknown };
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`Missing "version" in ${packageJsonUrl.pathname}`);
  }
  return version;
}

export const PACKAGE_VERSION = readPackageVersion();
