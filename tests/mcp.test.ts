import { jest } from '@jest/globals';

const loadConfigMock = jest.fn() as any;
const connectMock = jest.fn() as any;
const listToolsMock = jest.fn() as any;
const listResourcesMock = jest.fn() as any;
const callToolMock = jest.fn() as any;
const closeMock = jest.fn() as any;

const clientMock = {
  connect: connectMock,
  listTools: listToolsMock,
  listResources: listResourcesMock,
  callTool: callToolMock,
  close: closeMock,
};

const clientConstructorMock = jest.fn(() => clientMock);
const transportConstructorMock = jest.fn((options: unknown) => ({ options }));

jest.unstable_mockModule('../src/config.js', () => ({
  ConfigManager: jest.fn().mockImplementation(() => ({
    loadConfig: loadConfigMock,
  })),
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: clientConstructorMock,
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: transportConstructorMock,
}));

const { McpManager } = await import('../src/mcp/client.js');

describe('McpManager with MCP SDK 1.30', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadConfigMock.mockResolvedValue({
      mcpServers: {
        local: {
          command: 'mock-mcp-server',
          args: ['--stdio'],
          env: { SAFE_VALUE: 'configured' },
        },
      },
    });
    connectMock.mockResolvedValue(undefined);
    listToolsMock.mockResolvedValue({
      tools: [{
        name: 'lookup',
        description: 'Look up a value',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      }],
    });
    listResourcesMock.mockResolvedValue({ resources: [] });
    closeMock.mockResolvedValue(undefined);
  });

  it('connects, discovers, routes, calls, and closes an MCP client', async () => {
    callToolMock.mockResolvedValue({
      content: [
        { type: 'text', text: 'first' },
        { type: 'image', data: 'ignored' },
        { type: 'text', text: 'second' },
      ],
      isError: false,
    });
    const manager = new McpManager();

    await manager.connectAll();

    expect(transportConstructorMock).toHaveBeenCalledWith({
      command: 'mock-mcp-server',
      args: ['--stdio'],
      env: { SAFE_VALUE: 'configured' },
      stderr: 'ignore',
    });
    expect(clientConstructorMock).toHaveBeenCalledWith(
      { name: 'hey-ai-client', version: expect.any(String) },
      { capabilities: {} },
    );
    expect(clientConstructorMock.mock.calls[0][0].version).not.toHaveLength(0);
    expect(connectMock).toHaveBeenCalledWith(transportConstructorMock.mock.results[0].value);
    expect(manager.hasTools()).toBe(true);
    expect(manager.getServerForTool('lookup')).toBe('local');

    await expect(manager.getTools()).resolves.toEqual([{
      name: 'lookup',
      description: 'Look up a value',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      serverName: 'local',
    }]);

    await expect(manager.callTool('lookup', { query: 'value' })).resolves.toEqual({
      success: true,
      content: 'first\nsecond',
      error: undefined,
    });
    expect(callToolMock).toHaveBeenCalledWith({
      name: 'lookup',
      arguments: { query: 'value' },
    });

    await manager.disconnectAll();
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(manager.hasTools()).toBe(false);
    expect(manager.getServerForTool('lookup')).toBeUndefined();
  });

  it('returns model-visible MCP tool errors', async () => {
    callToolMock.mockResolvedValue({
      content: [{ type: 'text', text: 'server rejected request' }],
      isError: true,
    });
    const manager = new McpManager();

    await manager.connectAll();

    await expect(manager.callTool('lookup', {})).resolves.toEqual({
      success: false,
      content: 'server rejected request',
      error: 'server rejected request',
    });
    await expect(manager.callTool('missing', {})).resolves.toEqual({
      success: false,
      content: '',
      error: 'Tool "missing" not found in any connected MCP server',
    });

    await manager.disconnectAll();
  });
});
