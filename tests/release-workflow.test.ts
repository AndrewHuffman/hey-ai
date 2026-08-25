import { readFile } from 'node:fs/promises';

const setupActionPath = '.github/actions/setup-release/action.yml';
const prepareActionPath = '.github/actions/prepare-release/action.yml';
const ciWorkflowPath = '.github/workflows/ci.yml';
const releaseWorkflowPath = '.github/workflows/release.yml';

function getWorkflowStep(workflow: string, name: string): { block: string; index: number } {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stepMatch = new RegExp(`^ {6}- name: ${escapedName}\\r?$`, 'm').exec(workflow);

  expect(stepMatch).not.toBeNull();
  if (!stepMatch) {
    throw new Error(`Workflow is missing the "${name}" step`);
  }

  const nextStepPattern = /^ {6}- /gm;
  nextStepPattern.lastIndex = stepMatch.index + stepMatch[0].length;
  const nextStepMatch = nextStepPattern.exec(workflow);

  return {
    block: workflow.slice(stepMatch.index, nextStepMatch?.index ?? workflow.length),
    index: stepMatch.index,
  };
}

describe('release workflow prerequisites', () => {
  it('pins one toolchain for PR validation and release', async () => {
    const [setupAction, ciWorkflow, releaseWorkflow] = await Promise.all([
      readFile(setupActionPath, 'utf8'),
      readFile(ciWorkflowPath, 'utf8'),
      readFile(releaseWorkflowPath, 'utf8'),
    ]);

    expect(ciWorkflow).toContain('uses: ./.github/actions/setup-release');
    expect(releaseWorkflow).toContain('uses: ./.github/actions/setup-release');
    expect(releaseWorkflow).not.toContain('npm@latest');

    expect(setupAction).toContain('default: "22.23.2"');
    expect(setupAction).toContain('version: 10.11.0');
    expect(setupAction).toContain('npm install --global npm@12.0.2');

    for (const systemPackage of ['libgomp1', 'libsqlite3-dev', 'libblas3', 'liblapack3']) {
      expect(setupAction).toContain(systemPackage);
    }
  });

  it('runs the shared release preparation before merge and before publication', async () => {
    const [prepareAction, ciWorkflow, releaseWorkflow] = await Promise.all([
      readFile(prepareActionPath, 'utf8'),
      readFile(ciWorkflowPath, 'utf8'),
      readFile(releaseWorkflowPath, 'utf8'),
    ]);

    const ciPrepare = getWorkflowStep(ciWorkflow, 'Prepare release candidate');
    const releasePrepare = getWorkflowStep(releaseWorkflow, 'Prepare verified release');
    const releasePublish = getWorkflowStep(releaseWorkflow, 'Publish to npm (Trusted Publishing)');

    expect(ciWorkflow).toContain('fetch-depth: 0');
    expect(ciPrepare.block).toContain('uses: ./.github/actions/prepare-release');
    expect(ciPrepare.block).toContain('publish_dry_run: "true"');
    expect(releasePrepare.block).toContain('uses: ./.github/actions/prepare-release');
    expect(releasePrepare.block).toContain('publish_dry_run: "false"');
    expect(releasePrepare.index).toBeLessThan(releasePublish.index);

    expect(prepareAction).toContain('npm version "${{ steps.version.outputs.bump }}" --no-git-tag-version');
    expect(prepareAction).toContain('conventional-changelog -p angular -i CHANGELOG.md -s -r 0');
    expect(prepareAction).toContain('pnpm run test:package -- "${{ inputs.tarball_path }}"');
    expect(prepareAction).toContain('npm publish "${{ inputs.tarball_path }}" --access public --dry-run');
    expect(releasePublish.block).toContain(
      'npm publish "${{ runner.temp }}/hey-ai.tgz" --access public',
    );
  });

  it('keeps the aggregate PR status dependent on every validation job', async () => {
    const ciWorkflow = await readFile(ciWorkflowPath, 'utf8');

    expect(ciWorkflow).toContain('name: PR Validation');
    expect(ciWorkflow).toContain('needs: [minimum_runtime, release_preflight]');
    expect(ciWorkflow).toContain('if: ${{ always() }}');
    expect(ciWorkflow).toContain('MINIMUM_RUNTIME_RESULT: ${{ needs.minimum_runtime.result }}');
    expect(ciWorkflow).toContain('RELEASE_PREFLIGHT_RESULT: ${{ needs.release_preflight.result }}');
  });
});
