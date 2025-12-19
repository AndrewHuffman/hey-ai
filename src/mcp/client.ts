import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ConfigManager } from '../config.js';

export class McpManager {
  private clients: Client[] = [];
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
          env: serverConfig.env
        });

        const client = new Client({
          name: "hey-ai-client",
          version: "1.0.0",
        }, {
          capabilities: {}
        });

        await client.connect(transport);
        this.clients.push(client);
        // console.log(`Connected to MCP server: ${name}`);
      } catch (error) {
        console.error(`Failed to connect to MCP server ${name}:`, error);
      }
    }
  }

  async getResources(query?: string) {
    const allResources = [];
    for (const client of this.clients) {
      try {
        // List resources from each server
        const result = await client.listResources({});
        if (result.resources) {
          allResources.push(...result.resources.map(r => ({ ...r, source: client })));
        }
      } catch (error) {
        // console.error('Error fetching resources:', error);
      }
    }
    return allResources;
  }
  
  async getTools() {
      const allTools = [];
      for (const client of this.clients) {
          try {
              const result = await client.listTools({});
              if (result.tools) {
                  allTools.push(...result.tools.map(t => ({...t, client})));
              }
          } catch (e) {
              // ignore
          }
      }
      return allTools;
  }
}

