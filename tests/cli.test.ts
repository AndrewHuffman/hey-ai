import { jest } from '@jest/globals';

// Mock the dependencies before importing anything
jest.unstable_mockModule('../src/rag/engine.js', () => ({
  RagEngine: jest.fn().mockImplementation(() => ({
    init: (jest.fn() as any).mockResolvedValue(undefined),
    assembleContext: (jest.fn() as any).mockResolvedValue('mock context'),
    saveInteraction: (jest.fn() as any).mockResolvedValue(undefined),
    getInternalTools: (jest.fn() as any).mockReturnValue([]),
    isInternalTool: (jest.fn() as any).mockReturnValue(false),
    executeInternalTool: (jest.fn() as any).mockResolvedValue({ success: true, content: '' }),
    mcp: {
      getToolDefinitionsForGemini: (jest.fn() as any).mockResolvedValue([]),
      getServerForTool: (jest.fn() as any).mockReturnValue(undefined),
      callTool: (jest.fn() as any).mockResolvedValue({ content: [] }),
      disconnectAll: (jest.fn() as any).mockResolvedValue(undefined),
    },
  })),
}));

jest.unstable_mockModule('../src/llm/wrapper.js', () => ({
  LlmWrapper: jest.fn().mockImplementation(() => ({
    streamPrompt: (jest.fn() as any).mockResolvedValue('```zsh\nls -la\n```'),
  })),
  createToolCallHandlers: jest.fn().mockReturnValue({
    onToolStart: jest.fn(),
    onToolEnd: jest.fn(),
  }),
  getRecommendedModels: jest.fn().mockReturnValue([]),
  MODEL_ALIASES: {},
}));

jest.unstable_mockModule('../src/llm/embedding.js', () => ({
  getEmbedding: (jest.fn() as any).mockResolvedValue(Array(1536).fill(0.1)),
  getEmbeddingDimension: (jest.fn() as any).mockReturnValue(1536),
  isEmbeddingAvailable: (jest.fn() as any).mockReturnValue(true),
  getEmbeddingKeyName: (jest.fn() as any).mockReturnValue('OPENAI_API_KEY'),
}));

jest.unstable_mockModule('../src/context/commands.js', () => ({
  CommandDetector: jest.fn().mockImplementation(() => ({
    getPreferences: jest.fn().mockReturnValue({}),
  })),
}));

jest.unstable_mockModule('clipboardy', () => ({
  default: {
    write: (jest.fn() as any).mockResolvedValue(undefined),
  },
}));

jest.unstable_mockModule('chalk', () => ({
  default: {
    gray: (s: any) => s,
    blue: (s: any) => s,
    green: (s: any) => s,
    red: (s: any) => s,
    bold: (s: any) => s,
  },
}));

describe('CLI Arguments', () => {
  it('reports the package.json version and makes no LLM call', async () => {
    const { readFileSync } = await import('node:fs');
    const packageVersion = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ).version;
    const { createProgram } = await import('../src/index.js');
    const { LlmWrapper } = await import('../src/llm/wrapper.js');
    (LlmWrapper as any).mockClear();
    const program = createProgram();
    let output = '';
    program.exitOverride().configureOutput({ writeOut: (text) => { output += text; } });

    await expect(program.parseAsync(['node', 'hey-ai', '--version']))
      .rejects.toMatchObject({ code: 'commander.version' });

    expect(output.trim()).toBe(packageVersion);
    for (const result of (LlmWrapper as any).mock.results) {
      expect(result.value.streamPrompt).not.toHaveBeenCalled();
    }
  });

  it('should handle --show-prefs', async () => {
    const { createProgram } = await import('../src/index.js');
    const program = createProgram();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    await program.parseAsync(['node', 'hey-ai', '--show-prefs']);
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Detected command preferences:'));
    consoleSpy.mockRestore();
  });

  it('should handle --show-context', async () => {
    const { createProgram } = await import('../src/index.js');
    const program = createProgram();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    await program.parseAsync(['node', 'hey-ai', '--show-context', 'test query']);
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('=== Assembled Context ==='));
    consoleSpy.mockRestore();
  });

  it('should handle query with --no-context', async () => {
    const { createProgram } = await import('../src/index.js');
    const program = createProgram();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    await program.parseAsync(['node', 'hey-ai', 'test query', '--no-context']);
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Thinking...'));
    consoleSpy.mockRestore();
  });

  it('should handle full query with context', async () => {
    const { createProgram } = await import('../src/index.js');
    const program = createProgram();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    await program.parseAsync(['node', 'hey-ai', 'list my files']);
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Thinking...'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Thinking...'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Command copied to clipboard!'));
    consoleSpy.mockRestore();
  });

  it('should handle models command', async () => {
    const { createProgram } = await import('../src/index.js');
    const program = createProgram();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    await program.parseAsync(['node', 'hey-ai', 'models']);
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Recommended Models:'));
    consoleSpy.mockRestore();
  });
});
