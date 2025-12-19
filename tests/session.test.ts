import { SessionHistory } from '../src/context/session';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('SessionHistory', () => {
  const testDbPath = path.join(os.tmpdir(), 'test-session.db');

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should store and retrieve entries', () => {
    const session = new SessionHistory(testDbPath);
    session.addEntry('hello', 'hi there', '/test');
    
    const recent = session.getRecentEntries(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].prompt).toBe('hello');
    expect(recent[0].response).toBe('hi there');
  });

  it('should search entries by keyword', () => {
    const session = new SessionHistory(testDbPath);
    session.addEntry('how to use find', 'use fd instead', '/test');
    session.addEntry('unrelated', 'data', '/test');
    
    const results = session.search('find');
    expect(results).toHaveLength(1);
    expect(results[0].response).toBe('use fd instead');
  });
});

