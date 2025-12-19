import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface HistoryEntry {
  timestamp: number;
  duration: number;
  command: string;
}

export class ZshHistory {
  private historyPath: string;

  constructor(historyPath?: string) {
    this.historyPath = historyPath || process.env.HISTFILE || path.join(os.homedir(), '.zsh_history');
  }

  async getLastEntries(count: number = 20): Promise<HistoryEntry[]> {
    try {
      const content = await fs.readFile(this.historyPath, 'utf-8');
      const lines = content.trim().split('\n');
      
      const entries: HistoryEntry[] = [];
      // Read from end
      for (let i = lines.length - 1; i >= 0 && entries.length < count; i--) {
        const line = lines[i];
        const entry = this.parseLine(line);
        if (entry) {
          entries.unshift(entry);
        }
      }
      
      return entries;
    } catch (error) {
      console.error('Failed to read zsh history:', error);
      return [];
    }
  }

  private parseLine(line: string): HistoryEntry | null {
    // Format: : 1698212617:0;command
    const match = line.match(/^: (\d+):(\d+);(.*)$/);
    if (!match) {
      // Handle legacy or non-extended lines if necessary, or just skip
      return null;
    }

    return {
      timestamp: parseInt(match[1], 10),
      duration: parseInt(match[2], 10),
      command: match[3]
    };
  }
}

