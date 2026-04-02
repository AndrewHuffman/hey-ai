import { jest } from '@jest/globals';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

jest.unstable_mockModule('../src/llm/embedding.js', () => ({
  getEmbedding: (jest.fn() as any).mockResolvedValue(Array(1536).fill(0.1)),
  getEmbeddings: (jest.fn() as any).mockResolvedValue([Array(1536).fill(0.1)]),
  getEmbeddingDimension: (jest.fn() as any).mockReturnValue(1536),
  isEmbeddingAvailable: (jest.fn() as any).mockReturnValue(true),
  getEmbeddingKeyName: (jest.fn() as any).mockReturnValue('OPENAI_API_KEY'),
}));

let SessionHistory: any;
let mockGetEmbedding: jest.Mock;

beforeAll(async () => {
  const embedding = await import('../src/llm/embedding.js');
  mockGetEmbedding = embedding.getEmbedding as unknown as jest.Mock;
  ({ SessionHistory } = await import('../src/context/session.js'));
});

describe('SessionHistory', () => {
  const testDbPath = path.join(os.tmpdir(), 'test-session.db');

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {
        // ignore
      }
    }
  });

  it('should store and retrieve entries', async () => {
    const session = new SessionHistory(testDbPath);
    await session.addEntry('hello', 'hi there', '/test');
    
    const recent = session.getRecentEntries(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].prompt).toBe('hello');
    expect(recent[0].response).toBe('hi there');
  });

  it('should search entries by keyword', async () => {
    const session = new SessionHistory(testDbPath);
    await session.addEntry('how to use find', 'use fd instead', '/test');
    await session.addEntry('unrelated', 'data', '/test');
    
    const results = session.searchFTS('find');
    expect(results).toHaveLength(1);
    expect(results[0].response).toBe('use fd instead');
  });

  it('should still store entries when getEmbedding returns null', async () => {
    mockGetEmbedding.mockResolvedValueOnce(null);
    const session = new SessionHistory(testDbPath);
    const id = await session.addEntry('hello', 'world', '/test');

    expect(id).toBeGreaterThan(0);
    const recent = session.getRecentEntries(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].prompt).toBe('hello');
  });

  it('should return empty results from searchSemantic when no embeddings exist', async () => {
    mockGetEmbedding.mockResolvedValueOnce(null);
    const session = new SessionHistory(testDbPath);
    await session.addEntry('hello', 'world', '/test');

    const results = await session.searchSemantic('hello');
    expect(results).toEqual([]);
  });

  it('should still store entries when getEmbedding rejects', async () => {
    mockGetEmbedding.mockRejectedValueOnce(new Error('API key invalid'));
    const session = new SessionHistory(testDbPath);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const id = await session.addEntry('hello', 'world', '/test');

    expect(id).toBeGreaterThan(0);
    const recent = session.getRecentEntries(1);
    expect(recent).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('API key invalid')
    );
    warnSpy.mockRestore();
  });
});

