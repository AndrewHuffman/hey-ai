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
  private mcp: McpManager;

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

  async assembleContext(query: string): Promise<string> {
    const parts: string[] = [];

    // 0. Command preferences (detected from system)
    const commandContext = this.commands.getContextString();
    if (commandContext) {
      parts.push(commandContext);
    }

    // 1. ZSH History (Last 15 commands)
    const recentCommands = await this.history.getLastEntries(15);
    if (recentCommands.length > 0) {
      parts.push('## Recent Terminal History');
      parts.push(recentCommands.map(e => `${e.command}`).join('\n'));
    }

    // 2. Session History (Relevant past Q&A)
    // Always include last turn for conversation continuity
    const lastTurn = this.session.getRecentEntries(1);
    const relevantSession = this.session.search(query, 3);
    
    // Merge and dedupe
    const sessionEntries = [...lastTurn, ...relevantSession].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
    
    if (sessionEntries.length > 0) {
      parts.push('## Relevant AI Interaction History');
      // Sort by timestamp asc for logical flow
      sessionEntries.sort((a, b) => a.timestamp - b.timestamp).forEach(entry => {
        parts.push(`User: ${entry.prompt}`);
        parts.push(`Assistant: ${entry.response}`);
      });
    }

    // 3. File Context
    const fileList = await this.files.listFiles(50);
    if (fileList.length > 0) {
      parts.push('## Current Directory Files');
      parts.push(fileList.join('\n'));

      // If query mentions a file in the list, include its content
      for (const file of fileList) {
        if (query.includes(file) || query.includes(file.split('/').pop()!)) {
          const content = await this.files.getFileContent(file);
          parts.push(`## Content of ${file}`);
          parts.push('```\n' + content + '\n```');
        }
      }
    }

    return parts.join('\n\n');
  }

  async saveInteraction(prompt: string, response: string) {
    this.session.addEntry(prompt, response, process.cwd());
  }
}
