import { ZshHistory } from '../src/context/history';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ZshHistory', () => {
  const testHistoryPath = path.join(os.tmpdir(), '.zsh_history_test');

  beforeAll(async () => {
    const content = [
      ': 1698212617:0;ls -la',
      ': 1698212620:0;cd tools',
      ': 1698212625:0;pnpm build'
    ].join('\n');
    await fs.writeFile(testHistoryPath, content);
  });

  afterAll(async () => {
    await fs.unlink(testHistoryPath);
  });

  it('should parse extended history lines correctly', async () => {
    const history = new ZshHistory(testHistoryPath);
    const entries = await history.getLastEntries(2);
    
    expect(entries).toHaveLength(2);
    expect(entries[0].command).toBe('cd tools');
    expect(entries[1].command).toBe('pnpm build');
  });
});

