import { jest } from '@jest/globals';

// Mock the dependencies before importing anything
jest.unstable_mockModule('../src/rag/engine.js', () => ({
  RagEngine: jest.fn().mockImplementation(() => ({
    init: (jest.fn() as any).mockResolvedValue(undefined),
    assembleContext: (jest.fn() as any).mockResolvedValue('mock context'),
    saveInteraction: (jest.fn() as any).mockResolvedValue(undefined),
    mcp: {
      getToolDefinitionsForGemini: (jest.fn() as any).mockResolvedValue([]),
      getServerForTool: (jest.fn() as any).mockReturnValue(undefined),
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
    
    await program.parseAsync(['node', 'hey-ai', '--show-context']);
    
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
