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

const { LlmWrapper, MODEL_ALIASES, resolveModelAlias, getRecommendedModels } =
  await import('../src/llm/wrapper.js');

// Retired on the Claude API per
// https://platform.claude.com/docs/en/about-claude/model-deprecations
const RETIRED_CLAUDE_MODELS = [
  'claude-opus-4-1-20250805',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-3-haiku-20240307',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'claude-3-sonnet-20240229',
  'claude-2.1',
  'claude-2.0',
];

describe('Claude model aliases', () => {
  it.each([
    ['claude', 'claude-opus-5-5'],
    ['opus', 'claude-opus-5-5'],
    ['claude-opus', 'claude-opus-5-5'],
    ['opus-5.5', 'claude-opus-5-5'],
    ['claude-opus-5.5', 'claude-opus-5-5'],
    ['sonnet', 'claude-sonnet-5-5'],
    ['claude-sonnet', 'claude-sonnet-5-5'],
    ['sonnet-5.5', 'claude-sonnet-5-5'],
    ['claude-sonnet-5.5', 'claude-sonnet-5-5'],
    ['haiku', 'claude-haiku-5-5'],
    ['claude-haiku', 'claude-haiku-5-5'],
    ['haiku-5.5', 'claude-haiku-5-5'],
    ['claude-haiku-5.5', 'claude-haiku-5-5'],
    ['fable', 'claude-fable-5-2'],
    ['claude-fable', 'claude-fable-5-2'],
    ['fable-5.2', 'claude-fable-5-2'],
    ['claude-fable-5.2', 'claude-fable-5-2'],
    ['Sonnet', 'claude-sonnet-5-5'],
    ['claude-haiku-4.5', 'claude-haiku-4-5-20251001'],
    ['opus-4.5', 'claude-opus-4-5-20251101'],
  ])('resolves %s to %s', (alias, expected) => {
    expect(resolveModelAlias(alias)).toBe(expected);
  });

  it('passes unaliased Claude model IDs through unchanged', () => {
    expect(resolveModelAlias('claude-opus-4-8')).toBe('claude-opus-4-8');
  });

  it('never targets a retired Claude model', () => {
    const retiredTargets = Object.entries(MODEL_ALIASES)
      .filter(([, id]) => RETIRED_CLAUDE_MODELS.includes(id));
    expect(retiredTargets).toEqual([]);
  });

  it('recommends the current Claude lineup with descriptions', () => {
    const anthropic = getRecommendedModels().find(p => p.provider === 'Anthropic');
    const ids = anthropic?.models.map(m => m.id) ?? [];

    for (const id of ['claude-fable-5-2', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']) {
      expect(ids).toContain(id);
      expect(anthropic?.models.find(m => m.id === id)?.description).toEqual(expect.any(String));
    }
    for (const id of RETIRED_CLAUDE_MODELS) {
      expect(ids).not.toContain(id);
    }
  });
});

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
    expect(anthropicProviderMock).toHaveBeenCalledWith('claude-haiku-5-5');
    expect(googleProviderMock).toHaveBeenCalledWith('gemini-2.0-flash');
  });

  it.each(['claude', 'opus', 'sonnet', 'haiku', 'fable', 'claude-opus-4-8'])(
    'routes %s to the Anthropic provider and not OpenAI',
    async (model) => {
      const wrapper = new LlmWrapper();

      await wrapper.prompt('anthropic', { model });

      expect(anthropicProviderMock).toHaveBeenCalledWith(resolveModelAlias(model));
      expect(createAnthropicMock).toHaveBeenCalledWith({ apiKey: process.env.ANTHROPIC_API_KEY });
      expect(createOpenAIMock).not.toHaveBeenCalled();
      expect(openAIChatMock).not.toHaveBeenCalled();
    },
  );

  it('does not send sampling or thinking settings that current Claude models reject', async () => {
    const wrapper = new LlmWrapper();

    await wrapper.prompt('anthropic', { model: 'opus' });

    const request = generateTextMock.mock.calls[0][0];
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('topP');
    expect(request).not.toHaveProperty('topK');
    expect(request).not.toHaveProperty('toolChoice');
    expect(request).not.toHaveProperty('providerOptions');
  });

  it('prints a refusal notice when the model declines the request', async () => {
    generateTextMock.mockResolvedValue({ text: '', finishReason: 'content-filter' });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = new LlmWrapper();

    try {
      await expect(wrapper.prompt('anthropic', { model: 'opus' })).resolves.toBe('');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('declined'));
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('prints no refusal notice for a normal completion', async () => {
    generateTextMock.mockResolvedValue({ text: 'ok', finishReason: 'stop' });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = new LlmWrapper();

    try {
      await wrapper.prompt('anthropic', { model: 'opus' });
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
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

  it('converts thrown tool errors to model-visible failures and reports completion', async () => {
    const onToolCall = (jest.fn() as any).mockRejectedValue(new Error('tool crashed'));
    const onToolEnd = jest.fn();
    const wrapper = new LlmWrapper();

    await wrapper.prompt('use a tool', {
      tools: [{
        name: 'throwing_tool',
        description: 'Throws an error',
        parameters: { type: 'object', properties: {} },
      }],
      onToolCall,
      onToolEnd,
    });

    const throwingTool = generateTextMock.mock.calls[0][0].tools.throwing_tool;
    await expect(throwingTool.execute({})).resolves.toBe('Error: tool crashed');
    expect(onToolEnd).toHaveBeenCalledWith('throwing_tool', false, expect.any(Number));
  });
});
