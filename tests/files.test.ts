import { FileContext } from '../src/context/files';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('FileContext', () => {
  const testDir = path.join(os.tmpdir(), 'llm-cli-test-files');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'test1.txt'), 'Hello world');
    await fs.writeFile(path.join(testDir, 'test2.ts'), 'console.log("hi")');
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should list files in directory', async () => {
    const context = new FileContext(testDir);
    const files = await context.listFiles();
    expect(files).toContain('test1.txt');
    expect(files).toContain('test2.ts');
  });

  it('should get file content', async () => {
    const context = new FileContext(testDir);
    const content = await context.getFileContent('test1.txt');
    expect(content).toBe('Hello world');
  });

  it('should truncate long files', async () => {
    const context = new FileContext(testDir);
    const longContent = 'line\n'.repeat(200);
    await fs.writeFile(path.join(testDir, 'long.txt'), longContent);
    
    const content = await context.getFileContent('long.txt', 10);
    expect(content).toContain('truncated');
    expect(content.split('\n').length).toBeLessThan(200);
  });
});

