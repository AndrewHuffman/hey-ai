import { readFile } from 'node:fs/promises';

function getWorkflowStep(workflow: string, name: string): { block: string; index: number } {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stepMatch = new RegExp(`^ {6}- name: ${escapedName}\\r?$`, 'm').exec(workflow);

  expect(stepMatch).not.toBeNull();
  if (!stepMatch) {
    throw new Error(`Release workflow is missing the "${name}" step`);
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
  it('installs native SQLite vector dependencies before installing and testing the project', async () => {
    const workflow = await readFile('.github/workflows/release.yml', 'utf8');
    const systemDependenciesStep = getWorkflowStep(workflow, 'Install system dependencies');
    const installDependenciesStep = getWorkflowStep(workflow, 'Install dependencies');
    const testStep = getWorkflowStep(workflow, 'Test');

    expect(systemDependenciesStep.index).toBeLessThan(installDependenciesStep.index);
    expect(installDependenciesStep.index).toBeLessThan(testStep.index);

    const runCommand = /^ {8}run:\s*(.+)\r?$/m.exec(systemDependenciesStep.block)?.[1];
    expect(runCommand).toBeDefined();
    const commandTokens = runCommand?.split(/\s+/) ?? [];

    for (const systemPackage of ['libgomp1', 'libsqlite3-dev', 'libblas3', 'liblapack3']) {
      expect(commandTokens).toContain(systemPackage);
    }
  });
});
