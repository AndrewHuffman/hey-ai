import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export interface SessionEntry {
  id: number;
  prompt: string;
  response: string;
  timestamp: number;
  cwd: string;
}

export class SessionHistory {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const configDir = path.join(os.homedir(), '.config', 'hey-ai');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    const finalDbPath = dbPath || path.join(configDir, 'session.db');
    this.db = new Database(finalDbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt TEXT NOT NULL,
        response TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        cwd TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_timestamp ON history(timestamp DESC);
    `);
  }

  addEntry(prompt: string, response: string, cwd: string) {
    const stmt = this.db.prepare(
      'INSERT INTO history (prompt, response, timestamp, cwd) VALUES (?, ?, ?, ?)'
    );
    stmt.run(prompt, response, Date.now(), cwd);
  }

  getRecentEntries(limit: number = 10): SessionEntry[] {
    const stmt = this.db.prepare(
      'SELECT * FROM history ORDER BY timestamp DESC LIMIT ?'
    );
    return stmt.all(limit) as SessionEntry[];
  }

  search(query: string, limit: number = 5): SessionEntry[] {
    // Simple keyword search
    const stmt = this.db.prepare(`
      SELECT * FROM history 
      WHERE prompt LIKE ? OR response LIKE ? 
      ORDER BY timestamp DESC LIMIT ?
    `);
    const searchPattern = `%${query}%`;
    return stmt.all(searchPattern, searchPattern, limit) as SessionEntry[];
  }
}

