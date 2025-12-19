import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ConfigManager } from '../config.js';

export interface McpToolResult {
  success: boolean;
  content: string;
  error?: string;
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

export class McpManager {
  private clients: Map<string, Client> = new Map();
  private toolToServer: Map<string, string> = new Map();
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
  }

  async connectAll() {
    const config = await this.configManager.loadConfig();
    
    if (!config.mcpServers) return;

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        const transport = new StdioClientTransport({
          command: serverConfig.command,
          args: serverConfig.args,
          env: serverConfig.env,
          stderr: 'ignore'  // Suppress MCP server status messages
        });

        const client = new Client({
          name: "hey-ai-client",
          version: "1.0.0",
        }, {
          capabilities: {}
        });

        await client.connect(transport);
        this.clients.set(name, client);

        // Index tools to this server
        const toolsResult = await client.listTools({});
        if (toolsResult.tools) {
          for (const tool of toolsResult.tools) {
            this.toolToServer.set(tool.name, name);
          }
        }
      } catch (error) {
        console.error(`Failed to connect to MCP server ${name}:`, error);
      }
    }
  }

  /**
   * Disconnect all MCP clients to allow process to exit
   */
  async disconnectAll() {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
      } catch (e) {
        // ignore close errors
      }
    }
    this.clients.clear();
    this.toolToServer.clear();
  }

  async getResources(query?: string) {
    const allResources = [];
    for (const [serverName, client] of this.clients) {
      try {
        const result = await client.listResources({});
        if (result.resources) {
          allResources.push(...result.resources.map(r => ({ ...r, serverName })));
        }
      } catch (error) {
        // ignore
      }
    }
    return allResources;
  }
  
  async getTools(): Promise<McpToolInfo[]> {
    const allTools: McpToolInfo[] = [];
    for (const [serverName, client] of this.clients) {
      try {
        const result = await client.listTools({});
        if (result.tools) {
          allTools.push(...result.tools.map(t => ({
            name: t.name,
            description: t.description || '',
            inputSchema: t.inputSchema as Record<string, unknown>,
            serverName
          })));
        }
      } catch (e) {
        // ignore
      }
    }
    return allTools;
  }

  /**
   * Get tool definitions in Gemini function calling format
   */
  async getToolDefinitionsForGemini(): Promise<Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>> {
    const tools = await this.getTools();
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: this.sanitizeSchemaForGemini(tool.inputSchema)
    }));
  }

  /**
   * Recursively sanitize JSON schema for API compatibility
   * Removes fields like $schema, additionalProperties, and ensures type field is present at root only
   */
  private sanitizeSchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
    // First, recursively remove disallowed keys
    const sanitized = this.removeDisallowedKeys(schema);
    
    // Then ensure type is present at root level ONLY (not in nested objects)
    if (!sanitized.type) {
      if (sanitized.properties) {
        sanitized.type = 'object';
      } else if (sanitized.items) {
        sanitized.type = 'array';
      } else if (sanitized.enum) {
        sanitized.type = 'string';
      } else {
        // Default to object for tool parameters
        sanitized.type = 'object';
        if (!sanitized.properties) {
          sanitized.properties = {};
        }
      }
    }
    
    return sanitized;
  }

  /**
   * Recursively remove disallowed keys from schema (no type inference)
   */
  private removeDisallowedKeys(schema: Record<string, unknown>): Record<string, unknown> {
    const disallowedKeys = ['$schema', 'additionalProperties', '$id', '$ref', 'definitions', '$defs'];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(schema)) {
      if (disallowedKeys.includes(key)) {
        continue;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.removeDisallowedKeys(value as Record<string, unknown>);
      } else if (Array.isArray(value)) {
        result[key] = value.map(item => 
          item && typeof item === 'object' 
            ? this.removeDisallowedKeys(item as Record<string, unknown>)
            : item
        );
      } else {
        result[key] = value;
      }
    }
    return result;
  }


  /**
   * Call an MCP tool by name
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const serverName = this.toolToServer.get(toolName);
    if (!serverName) {
      return {
        success: false,
        content: '',
        error: `Tool "${toolName}" not found in any connected MCP server`
      };
    }

    const client = this.clients.get(serverName);
    if (!client) {
      return {
        success: false,
        content: '',
        error: `MCP server "${serverName}" not connected`
      };
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args
      });

      // Extract text content from result
      let content = '';
      if (result.content && Array.isArray(result.content)) {
        content = result.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');
      }

      return {
        success: !result.isError,
        content,
        error: result.isError ? content : undefined
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check if any tools are available
   */
  hasTools(): boolean {
    return this.toolToServer.size > 0;
  }

  /**
   * Get the server name for a tool
   */
  getServerForTool(toolName: string): string | undefined {
    return this.toolToServer.get(toolName);
  }
}
