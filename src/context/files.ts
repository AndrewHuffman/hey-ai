import { globby } from 'globby';
import fs from 'node:fs/promises';
import path from 'node:path';

export class FileContext {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  async listFiles(limit: number = 50): Promise<string[]> {
    try {
      // Use globby to find files, respecting .gitignore
      const files = await globby(['**/*'], {
        cwd: this.cwd,
        gitignore: true,
        onlyFiles: true,
        ignore: ['.git/**', 'node_modules/**', 'dist/**', 'coverage/**'],
        deep: 3, // Limit depth to prevent overwhelming context
      });

      return files.slice(0, limit);
    } catch (error) {
      console.error('Failed to list files:', error);
      return [];
    }
  }

  async getFileContent(filePath: string, maxLines: number = 100): Promise<string> {
    try {
      const fullPath = path.resolve(this.cwd, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      
      if (lines.length > maxLines) {
        return lines.slice(0, maxLines).join('\n') + `\n... (truncated ${lines.length - maxLines} lines)`;
      }
      return content;
    } catch (error) {
      return `Error reading file ${filePath}: ${error}`;
    }
  }

  async getFileTree(): Promise<string> {
      const files = await this.listFiles(100);
      // specific file tree representation if needed, or just list
      return files.join('\n');
  }
}

