import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ZshHistory } from '../context/history.js';
import { FileContext } from '../context/files.js';
import { SessionHistory } from '../context/session.js';
import { CommandDetector } from '../context/commands.js';
import { McpManager } from '../mcp/client.js';

export class RagEngine {
  private history: ZshHistory;
  private files: FileContext;
  private session: SessionHistory;
  private commands: CommandDetector;
  public mcp: McpManager;

  constructor() {
    this.history = new ZshHistory();
    this.files = new FileContext();
    this.session = new SessionHistory();
    this.commands = new CommandDetector();
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

  private getManPage(command: string): string | null {
    try {
      // Try tldr first if available
      const tldr = spawnSync('tldr', [command], { 
        encoding: 'utf8', 
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      if (tldr.status === 0 && tldr.stdout.trim()) {
        return tldr.stdout.trim();
      }
    } catch {
      // tldr not available
    }

    try {
      // Use col -b to strip formatting from man output
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

  async assembleContext(query: string): Promise<string> {
    const parts: string[] = [];

    // 0. System information (always included)
    parts.push(this.getOsContext());

    // 1. Command preferences (always included - lightweight)
    const commandContext = this.commands.getContextString();
    if (commandContext) {
      parts.push(commandContext);
    }

    // 2. Man/tldr pages for commands mentioned in query
    const mentionedCommands = this.extractCommandsFromQuery(query);
    const preferences = this.commands.getPreferences();
    
    for (const cmd of mentionedCommands) {
      // If user has a preferred alternative for this command, fetch docs for that instead
      const preferredCmd = preferences[cmd] || cmd;
      const manPage = this.getManPage(preferredCmd);
      if (manPage) {
        const note = preferredCmd !== cmd ? ` (preferred over \`${cmd}\`)` : '';
        parts.push(`## Documentation for \`${preferredCmd}\`${note}`);
        parts.push(manPage);
      }
    }

    // 3. ZSH History - only if query seems terminal-related
    const terminalKeywords = [
      'run', 'command', 'terminal', 'shell', 'execute', 'sudo', 'history',
      'command history', 'shell history', 'terminal history'
    ];
    const isTerminalQuery = terminalKeywords.some(kw => query.toLowerCase().includes(kw)) 
      || mentionedCommands.length > 0;
    
    if (isTerminalQuery) {
      const recentCommands = await this.history.getLastEntries(5);
      if (recentCommands.length > 0) {
        parts.push('## Recent Terminal History');
        parts.push(recentCommands.map(e => `${e.command}`).join('\n'));
      }
    }

    // 4. Session History - HEURISTIC: only if query seems like follow-up
    if (this.shouldIncludeHistory(query)) {
      // Use hybrid search over session history:
      // - Combines fast keyword/FTS5 matching with semantic similarity search.
      // - This allows retrieving both exact term matches and related concepts (semantic).
      // - Results from both methods are merged, de-duplicated, and ranked.
      const relevantSession = await this.session.searchHybrid(query, 3);
      const lastTurn = this.session.getRecentEntries(1);
      
      // Merge and dedupe
      const sessionEntries = [...lastTurn, ...relevantSession].filter(
        (v, i, a) => a.findIndex(t => t.id === v.id) === i
      );
      
      if (sessionEntries.length > 0) {
        parts.push('## Relevant AI Interaction History');
        sessionEntries.sort((a, b) => a.timestamp - b.timestamp).forEach(entry => {
          parts.push(`User: ${entry.prompt}`);
          parts.push(`Assistant: ${entry.response}`);
        });
      }
    }

    // 5. File Context - only if query seems file-related
    const fileKeywords = [
      'file', 'files', 'filename', 'filepath', 'directory', 'folder', 'path',
      'list files', 'list directory', 'list folders'
    ];
    const lowerQuery = query.toLowerCase();
    const mentionsFileConcept = fileKeywords.some(kw => lowerQuery.includes(kw));
    // Detect explicit paths or filenames (with / or \)
    const mentionsPathLike = lowerQuery.includes('/') || lowerQuery.includes('\\');
    const isFileQuery = mentionsFileConcept || mentionsPathLike;
    
    if (isFileQuery) {
      const fileList = await this.files.listFiles(20);
      if (fileList.length > 0) {
        parts.push('## Current Directory Files');
        parts.push(fileList.join('\n'));

        // Only include file content if explicitly mentioned
        for (const file of fileList) {
          const basename = file.split('/').pop()!;
          if (query.includes(file) || query.includes(basename)) {
            const content = await this.files.getFileContent(file);
            parts.push(`## Content of ${file}`);
            parts.push('```\n' + content + '\n```');
          }
        }
      }
    }

    // 6. MCP Tools - brief summary only
    const mcpTools = await this.mcp.getTools();
    if (mcpTools.length > 0) {
      parts.push(`## Tools Available: ${mcpTools.map(t => t.name).join(', ')}`);
    }

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

  async saveInteraction(prompt: string, response: string) {
    await this.session.addEntry(prompt, response, process.cwd());
  }
}
