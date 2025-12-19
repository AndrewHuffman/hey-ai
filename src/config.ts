import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';

const AppConfigSchema = z.object({
  defaultModel: z.string().optional(),
  mcpServers: z.record(
    z.string(),
    z.object({
      command: z.string(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
    })
  ).optional().default({})
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export class ConfigManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(os.homedir(), '.config', 'hey-ai', 'config.json');
  }

  async loadConfig(): Promise<AppConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const json = JSON.parse(content);
      return AppConfigSchema.parse(json);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return { mcpServers: {} };
      }
      // If mcp.json exists but config.json doesn't, we might want to migrate or check both
      // For now, let's check for the old mcp.json if config.json is missing
      const oldMcpPath = path.join(os.homedir(), '.config', 'hey-ai', 'mcp.json');
      try {
        const content = await fs.readFile(oldMcpPath, 'utf-8');
        const json = JSON.parse(content);
        // Minimal validation for migration
        if (json.mcpServers) {
          return { mcpServers: json.mcpServers };
        }
      } catch (e) {
        // ignore
      }

      return { mcpServers: {} };
    }
  }

  async setConfig(updates: Partial<AppConfig>): Promise<void> {
    const current = await this.loadConfig();
    const updated = { ...current, ...updates };
    
    const configDir = path.dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(updated, null, 2));
  }
}

