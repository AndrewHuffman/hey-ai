import { jest } from '@jest/globals';

const embedMock = jest.fn() as any;
const embedManyMock = jest.fn() as any;
const embeddingModel = { provider: 'openai', modelName: 'text-embedding-3-small' };
const embeddingFactoryMock = jest.fn(() => embeddingModel);
const createOpenAIMock = jest.fn(() => ({ embedding: embeddingFactoryMock }));

jest.unstable_mockModule('ai', () => ({
  embed: embedMock,
  embedMany: embedManyMock,
}));

jest.unstable_mockModule('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}));

const { getEmbedding, getEmbeddings } = await import('../src/llm/embedding.js');

describe('embedding provider integration', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-openai-key';
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it('requests a single embedding through the upgraded OpenAI provider', async () => {
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2] });

    await expect(getEmbedding('one')).resolves.toEqual([0.1, 0.2]);

    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: 'test-openai-key' });
    expect(embeddingFactoryMock).toHaveBeenCalledWith('text-embedding-3-small');
    expect(embedMock).toHaveBeenCalledWith({ model: embeddingModel, value: 'one' });
  });

  it('requests batch embeddings through the upgraded OpenAI provider', async () => {
    embedManyMock.mockResolvedValue({ embeddings: [[0.1], [0.2]] });

    await expect(getEmbeddings(['one', 'two'])).resolves.toEqual([[0.1], [0.2]]);

    expect(embeddingFactoryMock).toHaveBeenCalledWith('text-embedding-3-small');
    expect(embedManyMock).toHaveBeenCalledWith({
      model: embeddingModel,
      values: ['one', 'two'],
    });
  });

  it('does not initialize a provider for an empty batch', async () => {
    await expect(getEmbeddings([])).resolves.toEqual([]);

    expect(createOpenAIMock).not.toHaveBeenCalled();
    expect(embedManyMock).not.toHaveBeenCalled();
  });
});
