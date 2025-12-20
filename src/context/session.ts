import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import * as sqliteVss from 'sqlite-vss';
import { getEmbedding, getEmbeddingDimension } from '../llm/embedding.js';

export interface SessionEntry {
  id: number;
  prompt: string;
  response: string;
  timestamp: number;
  cwd: string;
}

export interface SearchResult extends SessionEntry {
  score: number;
  source: 'fts' | 'semantic' | 'hybrid';
}

export class SessionHistory {
  private db: Database.Database;
  private embeddingDimension: number;

  constructor(dbPath?: string) {
    const configDir = path.join(os.homedir(), '.config', 'hey-ai');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    const finalDbPath = dbPath || path.join(configDir, 'session.db');
    this.db = new Database(finalDbPath);
    this.embeddingDimension = getEmbeddingDimension();
    this.init();
  }

  private init() {
    // Load sqlite-vss extension
    // On Linux, better-sqlite3 often appends .so to the end of the path.
    // sqlite-vss provides paths that already include .so, leading to .so.so errors.
    try {
      // Use the built-in load function first
      sqliteVss.load(this.db);
    } catch (e) {
      if (process.platform === 'linux' && e instanceof Error && e.message.includes('.so')) {
        // Fallback for Linux: load manually and strip .so if it exists
        const vectorPath = (sqliteVss as any).getVector0Path?.().replace(/\.so$/, '');
        const vssPath = (sqliteVss as any).getVss0Path?.().replace(/\.so$/, '');
        
        if (vectorPath && vssPath) {
          this.db.loadExtension(vectorPath);
          this.db.loadExtension(vssPath);
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    // Main history table
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

    // FTS5 virtual table for keyword search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(
        prompt,
        response,
        content='history',
        content_rowid='id'
      );
    `);

    // Triggers to keep FTS in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS history_ai AFTER INSERT ON history BEGIN
        INSERT INTO history_fts(rowid, prompt, response)
        VALUES (new.id, new.prompt, new.response);
      END;
      
      CREATE TRIGGER IF NOT EXISTS history_ad AFTER DELETE ON history BEGIN
        INSERT INTO history_fts(history_fts, rowid, prompt, response)
        VALUES('delete', old.id, old.prompt, old.response);
      END;
      
      CREATE TRIGGER IF NOT EXISTS history_au AFTER UPDATE ON history BEGIN
        INSERT INTO history_fts(history_fts, rowid, prompt, response)
        VALUES('delete', old.id, old.prompt, old.response);
        INSERT INTO history_fts(rowid, prompt, response)
        VALUES (new.id, new.prompt, new.response);
      END;
    `);

    // Vector table for semantic search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS history_vss USING vss0(
        embedding(${this.embeddingDimension})
      );
    `);

    // Mapping table between history IDs and vector rowids
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history_embeddings (
        history_id INTEGER PRIMARY KEY REFERENCES history(id) ON DELETE CASCADE,
        vss_rowid INTEGER NOT NULL
      );
    `);
  }

  async addEntry(prompt: string, response: string, cwd: string): Promise<number> {
    // Insert into main table (triggers handle FTS)
    const stmt = this.db.prepare(
      'INSERT INTO history (prompt, response, timestamp, cwd) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(prompt, response, Date.now(), cwd);
    const historyId = result.lastInsertRowid as number;

    // Generate and store embedding asynchronously
    try {
      const text = `${prompt}\n${response}`;
      const embedding = await getEmbedding(text);
      
      // Insert into VSS table
      const vssStmt = this.db.prepare(
        'INSERT INTO history_vss(rowid, embedding) VALUES (?, ?)'
      );
      vssStmt.run(historyId, JSON.stringify(embedding));
      
      // Map history ID to VSS rowid
      const mapStmt = this.db.prepare(
        'INSERT INTO history_embeddings (history_id, vss_rowid) VALUES (?, ?)'
      );
      mapStmt.run(historyId, historyId);
    } catch (error) {
      // Embedding failures are non-fatal - keyword search still works
      console.error('Failed to generate embedding:', error);
    }

    return historyId;
  }

  getRecentEntries(limit: number = 10): SessionEntry[] {
    const stmt = this.db.prepare(
      'SELECT * FROM history ORDER BY timestamp DESC LIMIT ?'
    );
    return stmt.all(limit) as SessionEntry[];
  }

  /**
   * Full-text search using FTS5
   */
  searchFTS(query: string, limit: number = 5): SearchResult[] {
    // Escape special FTS5 characters and create search query
    const sanitized = query.replace(/['"*()]/g, ' ').trim();
    if (!sanitized) return [];

    const stmt = this.db.prepare(`
      SELECT h.*, bm25(history_fts) as score
      FROM history_fts fts
      JOIN history h ON h.id = fts.rowid
      WHERE history_fts MATCH ?
      ORDER BY bm25(history_fts)
      LIMIT ?
    `);
    
    try {
      const results = stmt.all(sanitized, limit) as (SessionEntry & { score: number })[];
      return results.map(r => ({ ...r, source: 'fts' as const }));
    } catch {
      // FTS query syntax error - fall back to simple search
      return this.search(query, limit).map(r => ({ ...r, score: 0, source: 'fts' as const }));
    }
  }

  /**
   * Semantic search using embeddings
   */
  async searchSemantic(query: string, limit: number = 5): Promise<SearchResult[]> {
    try {
      // Check if there are any embeddings to search
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM history_embeddings');
      const countResult = countStmt.get() as { count: number };
      if (countResult.count === 0) {
        return []; // No embeddings to search
      }

      const queryEmbedding = await getEmbedding(query);
      
      // VSS requires the limit (k) inside the vss_search function call
      const stmt = this.db.prepare(`
        SELECT h.*, vss.distance as score
        FROM (
          SELECT rowid, distance
          FROM history_vss
          WHERE vss_search(embedding, vss_search_params(?, ?))
        ) AS vss
        JOIN history_embeddings he ON he.vss_rowid = vss.rowid
        JOIN history h ON h.id = he.history_id
        ORDER BY vss.distance
      `);
      
      const results = stmt.all(JSON.stringify(queryEmbedding), limit) as (SessionEntry & { score: number })[];
      return results.map(r => ({ ...r, source: 'semantic' as const }));
    } catch (error) {
      // Gracefully handle errors - FTS search will still work
      return [];
    }
  }

  /**
   * Hybrid search combining FTS5 and semantic search
   */
  async searchHybrid(query: string, limit: number = 5): Promise<SearchResult[]> {
    // Run both searches in parallel
    const [ftsResults, semanticResults] = await Promise.all([
      Promise.resolve(this.searchFTS(query, limit * 2)),
      this.searchSemantic(query, limit * 2)
    ]);

    // Merge and dedupe results
    const resultMap = new Map<number, SearchResult>();
    
    // Add FTS results with normalized score
    const maxFtsScore = Math.max(...ftsResults.map(r => Math.abs(r.score)), 1);
    for (const r of ftsResults) {
      resultMap.set(r.id, {
        ...r,
        score: 1 - (Math.abs(r.score) / maxFtsScore), // BM25 is negative, lower is better
        source: 'hybrid'
      });
    }

    // Merge semantic results (distance, lower is better)
    const maxSemanticScore = Math.max(...semanticResults.map(r => r.score), 1);
    for (const r of semanticResults) {
      const existing = resultMap.get(r.id);
      const normalizedScore = 1 - (r.score / maxSemanticScore);
      
      if (existing) {
        // Boost items found by both methods, capping score at 1.0
        existing.score = Math.min(1.0, (existing.score + normalizedScore) / 2 + 0.2);
      } else {
        resultMap.set(r.id, { ...r, score: normalizedScore, source: 'hybrid' });
      }
    }

    // Sort by score descending and limit
    return Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Simple keyword search (fallback)
   */
  search(query: string, limit: number = 5): SessionEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM history 
      WHERE prompt LIKE ? OR response LIKE ? 
      ORDER BY timestamp DESC LIMIT ?
    `);
    const searchPattern = `%${query}%`;
    return stmt.all(searchPattern, searchPattern, limit) as SessionEntry[];
  }
}
