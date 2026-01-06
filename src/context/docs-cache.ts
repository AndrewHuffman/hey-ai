/**
 * File-based cache for command documentation (man pages, tldr).
 * Uses size-based LRU eviction to keep cache under 100MB.
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export type DocSource = 'man' | 'tldr';

interface CacheFileInfo {
  path: string;
  size: number;
  mtimeMs: number;
}

export class CommandDocsCache {
  private cacheDir: string;
  private maxSizeBytes: number;
  private evictionInProgress: boolean = false;

  constructor(cacheDir?: string, maxSizeMB: number = 100) {
    this.cacheDir = cacheDir || path.join(os.homedir(), '.cache', 'hey-ai', 'docs');
    this.maxSizeBytes = maxSizeMB * 1024 * 1024;
  }

  /**
   * Generate a safe filename for a command.
   * Uses URL encoding to avoid collisions and hashes if too long.
   */
  private getCachePath(command: string): string {
    // URL-encode to handle special characters safely and avoid collisions
    let sanitized = encodeURIComponent(command);
    
    // If the encoded name is too long (>200 chars), use a hash
    if (sanitized.length > 200) {
      const hash = crypto.createHash('sha256').update(command).digest('hex').slice(0, 16);
      // Keep a prefix for readability, then append hash
      sanitized = `${sanitized.slice(0, 50)}_${hash}`;
    }
    
    return path.join(this.cacheDir, `${sanitized}.txt`);
  }

  /**
   * Get cached documentation for a command.
   * Returns null if not cached.
   */
  async get(command: string): Promise<string | null> {
    const cachePath = this.getCachePath(command);
    
    try {
      const content = await fsp.readFile(cachePath, 'utf8');
      
      // Parse the cache file format
      const match = content.match(/^---\nsource: (man|tldr)\n---\n([\s\S]*)$/);
      if (!match) {
        // Invalid format, delete and return null
        await fsp.unlink(cachePath).catch(() => {});
        return null;
      }
      
      // Update mtime to mark as recently used
      const now = new Date();
      await fsp.utimes(cachePath, now, now).catch(() => {});
      
      return match[2];
    } catch {
      // File doesn't exist or read failed
      return null;
    }
  }

  /**
   * Cache documentation for a command.
   * Triggers LRU eviction if cache exceeds max size.
   */
  async set(command: string, content: string, source: DocSource): Promise<void> {
    const cachePath = this.getCachePath(command);
    
    // Ensure cache directory exists
    await fsp.mkdir(this.cacheDir, { recursive: true });
    
    // Write cache file with metadata header
    const cacheContent = `---\nsource: ${source}\n---\n${content}`;
    await fsp.writeFile(cachePath, cacheContent, 'utf8');
    
    // Enforce max size (async, don't block return)
    this.enforceMaxSize().catch((error) => {
      // Log eviction errors for debugging
      if (process.env.DEBUG) {
        console.error('[docs-cache] Eviction error:', error);
      }
    });
  }

  /**
   * Delete oldest cache files until total size is under limit.
   * Uses a lock to prevent concurrent eviction operations.
   */
  private async enforceMaxSize(): Promise<void> {
    // Prevent concurrent eviction operations
    if (this.evictionInProgress) {
      return;
    }
    
    this.evictionInProgress = true;
    
    try {
      const files = await fsp.readdir(this.cacheDir);
      
      // Get file info for all cache files
      const fileInfos: CacheFileInfo[] = [];
      let totalSize = 0;
      
      for (const file of files) {
        if (!file.endsWith('.txt')) continue;
        
        const filePath = path.join(this.cacheDir, file);
        try {
          const stat = await fsp.stat(filePath);
          fileInfos.push({
            path: filePath,
            size: stat.size,
            mtimeMs: stat.mtimeMs
          });
          totalSize += stat.size;
        } catch {
          // File may have been deleted, skip
        }
      }
      
      // If under limit, nothing to do
      if (totalSize <= this.maxSizeBytes) {
        return;
      }
      
      // Sort by mtime ascending (oldest first)
      fileInfos.sort((a, b) => a.mtimeMs - b.mtimeMs);
      
      // Delete oldest files until under limit
      for (const fileInfo of fileInfos) {
        if (totalSize <= this.maxSizeBytes) {
          break;
        }
        
        try {
          await fsp.unlink(fileInfo.path);
          totalSize -= fileInfo.size;
        } catch {
          // File may have been deleted, skip
        }
      }
    } catch {
      // Cache dir may not exist yet, ignore
    } finally {
      this.evictionInProgress = false;
    }
  }
}
