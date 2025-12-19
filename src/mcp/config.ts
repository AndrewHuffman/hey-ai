import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';

const McpConfigSchema = z.object({
  mcpServers: z.record(
    z.string(),
    z.object({
      command: z.string(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
    })
  )
});

export type McpConfig = z.infer<typeof McpConfigSchema>;

export class ConfigLoader {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(os.homedir(), '.config', 'llm-cli', 'mcp.json');
  }

  async loadConfig(): Promise<McpConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const json = JSON.parse(content);
      return McpConfigSchema.parse(json);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // Return empty config if file doesn't exist
        return { mcpServers: {} };
      }
      console.error('Failed to load MCP config:', error);
      throw error;
    }
  }
}
