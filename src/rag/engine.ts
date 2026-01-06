import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ZshHistory } from '../context/history.js';
import { FileContext } from '../context/files.js';
import { SessionHistory } from '../context/session.js';
import { CommandDetector } from '../context/commands.js';
import { CommandDocsCache } from '../context/docs-cache.js';
import { McpManager } from '../mcp/client.js';
import {
  getInternalToolDefs,
  executeInternalTool,
  isInternalTool,
  type InternalToolContext,
  type InternalToolResult
} from '../tools/index.js';
import type { McpToolDef } from '../llm/wrapper.js';

export class RagEngine {
  private history: ZshHistory;
  private files: FileContext;
  public session: SessionHistory;
  private commands: CommandDetector;
  private docsCache: CommandDocsCache;
  public mcp: McpManager;

  constructor() {
    this.history = new ZshHistory();
    this.files = new FileContext();
    this.session = new SessionHistory();
    this.commands = new CommandDetector();
    this.docsCache = new CommandDocsCache();
    this.mcp = new McpManager();
  }

  async init() {
    await this.mcp.connectAll();
  }

  private getOsContext(): string {
    const lines = ['## System Information'];
    lines.push(`- OS: ${os.type()} ${os.release()} (${os.platform()})`);
    lines.push(`- Architecture: ${os.arch()}`);
    lines.push(`- Shell: ${process.env.SHELL || 'unknown'}`);
    lines.push(`- Home: ${os.homedir()}`);
    lines.push(`- User: ${os.userInfo().username}`);
    return lines.join('\n');
  }

  /**
   * Get man/tldr page for a command (public for internal tools).
   * Uses caching with lookup order: cache -> man -> tldr
   */
  async getManPage(command: string): Promise<string | null> {
    // 1. Check cache first (fast async read)
    const cached = await this.docsCache.get(command);
    if (cached) {
      return cached;
    }

    // 2. Try man first (fast, ~100ms)
    const manResult = this.fetchManPage(command);
    if (manResult) {
      // Cache async, don't block
      this.docsCache.set(command, manResult, 'man').catch((error) => {
        if (process.env.DEBUG) {
          console.error('[docs-cache] Cache write error:', error);
        }
      });
      return manResult;
    }

    // 3. Fall back to tldr (with auto-update disabled, ~4ms)
    const tldrResult = this.fetchTldrPage(command);
    if (tldrResult) {
      // Cache async, don't block
      this.docsCache.set(command, tldrResult, 'tldr').catch((error) => {
        if (process.env.DEBUG) {
          console.error('[docs-cache] Cache write error:', error);
        }
      });
      return tldrResult;
    }

    return null;
  }

  /**
   * Fetch man page for a command, extracting NAME + SYNOPSIS/DESCRIPTION
   */
  private fetchManPage(command: string): string | null {
    try {
      const man = spawnSync('sh', ['-c', `man ${command} 2>/dev/null | col -b`], { 
        encoding: 'utf8', 
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      if (man.status === 0 && man.stdout) {
        // Extract just the NAME and SYNOPSIS/DESCRIPTION sections
        const lines = man.stdout.split('\n');
        const result: string[] = [];
        let inSection = false;
        let sectionCount = 0;
        const sectionHeaders = ['NAME', 'SYNOPSIS', 'DESCRIPTION'];
        
        for (const line of lines) {
          const trimmed = line.trim();
          // Check if this is a section header (all caps, at start of line)
          if (sectionHeaders.includes(trimmed)) {
            if (sectionCount >= 2) break; // Stop after NAME + SYNOPSIS or NAME + DESCRIPTION
            inSection = true;
            sectionCount++;
            result.push('');
            result.push(`### ${trimmed}`);
            continue;
          }
          // Stop at next section header
          if (inSection && /^[A-Z][A-Z\s]+$/.test(trimmed) && trimmed.length > 2) {
            break;
          }
          if (inSection && line.trim()) {
            result.push(line);
          }
        }
        
        if (result.length > 0) {
          return result.join('\n').trim();
        }
      }
    } catch {
      // man not available or failed
    }
    return null;
  }

  /**
   * Fetch tldr page for a command (with auto-update disabled for speed)
   */
  private fetchTldrPage(command: string): string | null {
    try {
      const tldr = spawnSync('tldr', [command], { 
        encoding: 'utf8', 
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TLDR_AUTO_UPDATE_DISABLED: '1' }
      });
      if (tldr.status === 0 && tldr.stdout.trim()) {
        return tldr.stdout.trim();
      }
    } catch {
      // tldr not available
    }
    return null;
  }

  private extractCommandsFromQuery(query: string): string[] {
    // Common command patterns in queries
    const patterns = [
      /\b(how (?:to|do I) (?:use )?|what is |explain |help with )(\w+)\b/gi,
      /\b(\w+) command\b/gi,
      /\bman (\w+)\b/gi,
      /`(\w+)`/g,
    ];

    const commands = new Set<string>();
    
    // Common Unix commands to look for
    const knownCommands = [
      'ls', 'cd', 'pwd', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch', 'cat',
      'grep', 'find', 'sed', 'awk', 'sort', 'uniq', 'head', 'tail', 'less',
      'more', 'wc', 'cut', 'paste', 'tr', 'xargs', 'tee', 'chmod', 'chown',
      'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'curl', 'wget', 'ssh', 'scp',
      'rsync', 'git', 'docker', 'npm', 'yarn', 'pnpm', 'node', 'python',
      'pip', 'brew', 'apt', 'yum', 'dnf', 'pacman', 'kill', 'ps', 'top',
      'htop', 'df', 'du', 'free', 'mount', 'umount', 'ln', 'diff', 'patch',
      'make', 'gcc', 'go', 'cargo', 'rustc', 'java', 'javac', 'mvn', 'gradle',
      'fd', 'rg', 'bat', 'eza', 'exa', 'delta', 'sd', 'dust', 'htop', 'tldr', 'z', 'procs',
      'screen', 'vim', 'nvim', 'nano', 'emacs', 'code', 'subl', 'pbcopy',
      'pbpaste', 'xclip', 'open', 'xdg-open', 'ffmpeg', 'convert', 'magick'
    ];

    const queryLower = query.toLowerCase();
    
    // Check for known commands in query
    for (const cmd of knownCommands) {
      if (queryLower.includes(cmd)) {
        // Make sure it's a word boundary match
        const regex = new RegExp(`\\b${cmd}\\b`, 'i');
        if (regex.test(query)) {
          commands.add(cmd);
        }
      }
    }

    // Also try the patterns
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        const cmd = match[match.length - 1]; // Last capture group
        if (cmd && cmd.length > 1 && cmd.length < 20) {
          commands.add(cmd.toLowerCase());
        }
      }
    }

    return Array.from(commands).slice(0, 3); // Limit to 3 commands
  }

  /**
   * Detect if query appears to be a follow-up or requires history context
   */
  private shouldIncludeHistory(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    
    // Trigger words that suggest needing history
    const triggerWords = [
      'again', 'previous', 'last', 'before', 'earlier', 'that', 'it', 'same',
      'just now', 'you said', 'you mentioned', 'continue', 'what was', 'what did',
      'remind me', 'show me again', 'repeat', 'redo', 'like before'
    ];
    
    // Check for trigger words
    for (const trigger of triggerWords) {
      if (lowerQuery.includes(trigger)) {
        return true;
      }
    }
    
    // Very short queries (1-2 words) are often follow-ups
    const wordCount = query.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 0 && wordCount <= 2) {
      return true;
    }
    
    return false;
  }

  /**
   * Assemble minimal pre-loaded context.
   * Heavy context (session history, terminal history, files, man pages) is now
   * fetched on-demand via internal tools that the LLM can call as needed.
   */
  async assembleContext(query: string): Promise<string> {
    const parts: string[] = [];

    // 1. System information (always included - lightweight, always useful)
    parts.push(this.getOsContext());

    // 2. Command preferences (always included - lightweight, helps with suggestions)
    const commandContext = this.commands.getContextString();
    if (commandContext) {
      parts.push(commandContext);
    }

    // 3. Current working directory (useful context for file operations)
    parts.push(`## Current Directory\n${process.cwd()}`);

    // 4. Available tools summary (internal + MCP)
    const internalTools = this.getInternalTools();
    const mcpTools = await this.mcp.getTools();
    const allToolNames = [
      ...internalTools.map(t => t.name),
      ...mcpTools.map(t => t.name)
    ];
    if (allToolNames.length > 0) {
      parts.push(`## Available Tools\n${allToolNames.join(', ')}`);
    }

    // 5. MCP Resources (if any)
    const mcpResources = await this.mcp.getResources(query);
    if (mcpResources.length > 0) {
      parts.push('## Available MCP Resources');
      parts.push('These resources are available via MCP:');
      mcpResources.forEach(resource => {
        parts.push(`- ${resource.uri}: ${resource.name} (${resource.description || 'no description'})`);
      });
    }

    return parts.join('\n\n');
  }

  /**
   * Get internal context retrieval tool definitions
   */
  getInternalTools(): McpToolDef[] {
    return getInternalToolDefs();
  }

  /**
   * Check if a tool name is an internal tool
   */
  isInternalTool(toolName: string): boolean {
    return isInternalTool(toolName);
  }

  /**
   * Execute an internal context tool
   */
  async executeInternalTool(toolName: string, args: Record<string, unknown>): Promise<InternalToolResult> {
    const context: InternalToolContext = {
      session: this.session,
      history: this.history,
      files: this.files,
      getManPage: (cmd: string) => this.getManPage(cmd)
    };

    return executeInternalTool(toolName, args, context);
  }

  async saveInteraction(prompt: string, response: string) {
    await this.session.addEntry(prompt, response, process.cwd());
  }
}
