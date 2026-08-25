import { jest } from '@jest/globals';

const generateTextMock = jest.fn() as any;
const isStepCountMock = jest.fn((count: number) => ({ type: 'step-count', count }));
const toolMock = jest.fn((definition: unknown) => definition);

const openAIChatMock = jest.fn((modelName: string) => ({ provider: 'openai-chat', modelName }));
const openAIProviderMock = Object.assign(jest.fn(), { chat: openAIChatMock });
const createOpenAIMock = jest.fn(() => openAIProviderMock);

const anthropicProviderMock = jest.fn((modelName: string) => ({ provider: 'anthropic', modelName }));
const createAnthropicMock = jest.fn(() => anthropicProviderMock);

const googleProviderMock = jest.fn((modelName: string) => ({ provider: 'google', modelName }));
const createGoogleMock = jest.fn(() => googleProviderMock);

jest.unstable_mockModule('ai', () => ({
  generateText: generateTextMock,
  isStepCount: isStepCountMock,
  tool: toolMock,
}));

jest.unstable_mockModule('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}));

jest.unstable_mockModule('@ai-sdk/anthropic', () => ({
  createAnthropic: createAnthropicMock,
}));

jest.unstable_mockModule('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: createGoogleMock,
}));

const { LlmWrapper } = await import('../src/llm/wrapper.js');

describe('LlmWrapper', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    generateTextMock.mockResolvedValue({ text: 'generated response' });
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('selects provider models and keeps OpenAI on Chat Completions', async () => {
    const wrapper = new LlmWrapper();

    await wrapper.prompt('openai', { model: 'gpt4' });
    await wrapper.prompt('anthropic', { model: 'claude-haiku' });
    await wrapper.prompt('google', { model: 'gemini' });
    await wrapper.prompt('fallback', { model: 'custom-model' });

    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: process.env.OPENAI_API_KEY });
    expect(openAIChatMock).toHaveBeenNthCalledWith(1, 'gpt-4o');
    expect(openAIChatMock).toHaveBeenNthCalledWith(2, 'custom-model');
    expect(openAIProviderMock).not.toHaveBeenCalled();
    expect(anthropicProviderMock).toHaveBeenCalledWith('claude-3-5-haiku-20241022');
    expect(googleProviderMock).toHaveBeenCalledWith('gemini-2.0-flash');
  });

  it('passes instructions, uses the ten-step stop condition, and returns generated text', async () => {
    const wrapper = new LlmWrapper();

    await expect(wrapper.prompt('hello', { system: 'system instructions' }))
      .resolves.toBe('generated response');

    expect(isStepCountMock).toHaveBeenCalledWith(10);
    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
      instructions: 'system instructions',
      prompt: 'hello',
      stopWhen: { type: 'step-count', count: 10 },
    }));

    const request = generateTextMock.mock.calls[0][0];
    expect(request).not.toHaveProperty('system');
    expect(request).not.toHaveProperty('maxSteps');
    expect(consoleSpy).toHaveBeenCalledWith('generated response');
  });

  it('converts tool schemas and invokes successful execution callbacks', async () => {
    const onToolCall = (jest.fn() as any).mockResolvedValue({
      success: true,
      content: 'tool response',
    });
    const onToolStart = jest.fn();
    const onToolEnd = jest.fn();
    const wrapper = new LlmWrapper();

    await wrapper.prompt('use a tool', {
      tools: [{
        name: 'lookup',
        description: 'Look up a value',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'integer' },
          },
          required: ['query'],
        },
      }],
      onToolCall,
      onToolStart,
      onToolEnd,
    });

    const request = generateTextMock.mock.calls[0][0];
    const lookupTool = request.tools.lookup;

    expect(toolMock).toHaveBeenCalledTimes(1);
    expect(lookupTool).toHaveProperty('inputSchema');
    expect(lookupTool).not.toHaveProperty('parameters');
    expect(lookupTool.inputSchema.safeParse({ query: 'value', limit: 2 }).success).toBe(true);
    expect(lookupTool.inputSchema.safeParse({ limit: 2 }).success).toBe(false);

    await expect(lookupTool.execute({ query: 'value', limit: 2 })).resolves.toBe('tool response');
    expect(onToolStart).toHaveBeenCalledWith('lookup');
    expect(onToolCall).toHaveBeenCalledWith('lookup', { query: 'value', limit: 2 });
    expect(onToolEnd).toHaveBeenCalledWith('lookup', true, expect.any(Number));
  });

  it('returns useful model-visible errors when tool execution reports failure', async () => {
    const onToolCall = (jest.fn() as any)
      .mockResolvedValueOnce({ success: false, content: 'remote failure' })
      .mockResolvedValueOnce({ success: false, content: '' });
    const onToolEnd = jest.fn();
    const wrapper = new LlmWrapper();

    await wrapper.prompt('use a tool', {
      tools: [{
        name: 'failing_tool',
        description: 'Always fails',
        parameters: { type: 'object', properties: {} },
      }],
      onToolCall,
      onToolEnd,
    });

    const failingTool = generateTextMock.mock.calls[0][0].tools.failing_tool;
    await expect(failingTool.execute({})).resolves.toBe('Error: remote failure');
    await expect(failingTool.execute({})).resolves.toBe('Error: Tool call failed');
    expect(onToolEnd).toHaveBeenCalledTimes(2);
    expect(onToolEnd).toHaveBeenCalledWith('failing_tool', false, expect.any(Number));
  });
});
