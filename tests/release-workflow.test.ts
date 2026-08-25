import { readFile } from 'node:fs/promises';

describe('release workflow prerequisites', () => {
  it('installs native SQLite vector dependencies before installing and testing the project', async () => {
    const workflow = await readFile('.github/workflows/release.yml', 'utf8');
    const systemDependenciesStep = workflow.indexOf('- name: Install system dependencies');
    const installDependenciesStep = workflow.indexOf('- name: Install dependencies');
    const testStep = workflow.indexOf('- name: Test');

    expect(systemDependenciesStep).toBeGreaterThan(-1);
    expect(systemDependenciesStep).toBeLessThan(installDependenciesStep);
    expect(installDependenciesStep).toBeLessThan(testStep);

    for (const systemPackage of ['libgomp1', 'libsqlite3-dev', 'libblas3', 'liblapack3']) {
      expect(workflow).toContain(systemPackage);
    }
  });
});
