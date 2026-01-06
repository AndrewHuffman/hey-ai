/**
 * Internal context retrieval tools for on-demand context fetching.
 * These tools allow the LLM to request specific context when needed,
 * rather than pre-loading all context upfront.
 */

import type { SessionHistory, SearchResult } from '../context/session.js';
import type { ZshHistory, HistoryEntry } from '../context/history.js';
import type { FileContext } from '../context/files.js';
import type { McpToolDef } from '../llm/wrapper.js';

/**
 * Context providers passed to internal tool executors
 */
export interface InternalToolContext {
  session: SessionHistory;
  history: ZshHistory;
  files: FileContext;
  getManPage: (command: string) => Promise<string | null>;
}

/**
 * Result type for internal tool execution
 */
export interface InternalToolResult {
  success: boolean;
  content: string;
  error?: string;
}

/**
 * Internal tool definition with execution logic
 */
export interface InternalTool extends McpToolDef {
  execute: (args: Record<string, unknown>, context: InternalToolContext) => Promise<InternalToolResult>;
}

/**
 * Tool: search_session_history
 * Search past AI interactions using hybrid FTS + semantic search
 */
const searchSessionHistory: InternalTool = {
  name: 'search_session_history',
  description: 'Search past AI conversation history for relevant context. Use when the user references previous interactions, asks follow-up questions, or when you need to recall past discussions.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to find relevant past interactions'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)'
      }
    },
    required: ['query']
  },
  execute: async (args, context): Promise<InternalToolResult> => {
    try {
      const query = args.query as string;
      const limit = (args.limit as number) || 5;

      const results: SearchResult[] = await context.session.searchHybrid(query, limit);

      if (results.length === 0) {
        return {
          success: true,
          content: 'No relevant past interactions found.'
        };
      }

      const formatted = results.map((r, i) => {
        const date = new Date(r.timestamp).toLocaleString();
        return `### Result ${i + 1} (relevance: ${(r.score * 100).toFixed(0)}%)\n**Date:** ${date}\n**User:** ${r.prompt}\n**Assistant:** ${r.response}`;
      }).join('\n\n---\n\n');

      return {
        success: true,
        content: `Found ${results.length} relevant past interaction(s):\n\n${formatted}`
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `Failed to search session history: ${error}`
      };
    }
  }
};

/**
 * Tool: get_recent_commands
 * Get recent terminal commands from zsh history
 */
const getRecentCommands: InternalTool = {
  name: 'get_recent_commands',
  description: 'Get recent terminal commands the user has executed. Use when discussing terminal history, debugging command issues, or when the user asks about recent actions.',
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Number of recent commands to retrieve (default: 10, max: 50)'
      }
    }
  },
  execute: async (args, context): Promise<InternalToolResult> => {
    try {
      const count = Math.min((args.count as number) || 10, 50);

      const entries: HistoryEntry[] = await context.history.getLastEntries(count);

      if (entries.length === 0) {
        return {
          success: true,
          content: 'No terminal history found.'
        };
      }

      const formatted = entries.map((e, i) => {
        const date = new Date(e.timestamp * 1000).toLocaleString();
        return `${i + 1}. \`${e.command}\` (${date})`;
      }).join('\n');

      return {
        success: true,
        content: `Recent terminal commands:\n\n${formatted}`
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `Failed to retrieve terminal history: ${error}`
      };
    }
  }
};

/**
 * Tool: list_project_files
 * List files in the current project directory
 */
const listProjectFiles: InternalTool = {
  name: 'list_project_files',
  description: 'List files in the current project directory. Respects .gitignore and excludes common directories like node_modules. Use when discussing project structure or when user asks about files.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of files to list (default: 30, max: 100)'
      },
      pattern: {
        type: 'string',
        description: 'Optional glob pattern to filter files (e.g., "**/*.ts", "src/**/*")'
      }
    }
  },
  execute: async (args, context): Promise<InternalToolResult> => {
    try {
      const limit = Math.min((args.limit as number) || 30, 100);
      // Note: pattern filtering would require modifying FileContext.listFiles()
      // For now, we just use the limit

      const files = await context.files.listFiles(limit);

      if (files.length === 0) {
        return {
          success: true,
          content: 'No files found in the current directory.'
        };
      }

      // Group files by directory for better readability
      const grouped: Record<string, string[]> = {};
      for (const file of files) {
        const dir = file.includes('/') ? file.substring(0, file.lastIndexOf('/')) : '.';
        if (!grouped[dir]) grouped[dir] = [];
        grouped[dir].push(file);
      }

      let formatted = `Found ${files.length} file(s) in ${process.cwd()}:\n\n`;
      for (const [dir, dirFiles] of Object.entries(grouped).sort()) {
        formatted += `**${dir}/**\n`;
        for (const f of dirFiles.sort()) {
          const basename = f.split('/').pop();
          formatted += `  - ${basename}\n`;
        }
        formatted += '\n';
      }

      return {
        success: true,
        content: formatted.trim()
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `Failed to list project files: ${error}`
      };
    }
  }
};

/**
 * Tool: read_file_content
 * Read the contents of a specific file
 */
const readFileContent: InternalTool = {
  name: 'read_file_content',
  description: 'Read the contents of a specific file. Use when you need to examine code, configuration, or documentation to provide accurate advice.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read (relative to current directory)'
      },
      max_lines: {
        type: 'number',
        description: 'Maximum number of lines to return (default: 100, max: 500)'
      }
    },
    required: ['path']
  },
  execute: async (args, context): Promise<InternalToolResult> => {
    try {
      const filePath = args.path as string;
      const maxLines = Math.min((args.max_lines as number) || 100, 500);

      const content = await context.files.getFileContent(filePath, maxLines);

      // Check if it's an error message from getFileContent
      if (content.startsWith('Error reading file')) {
        return {
          success: false,
          content: '',
          error: content
        };
      }

      return {
        success: true,
        content: `Contents of \`${filePath}\`:\n\n\`\`\`\n${content}\n\`\`\``
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `Failed to read file: ${error}`
      };
    }
  }
};

/**
 * Tool: get_command_docs
 * Get documentation (man page or tldr) for a command
 */
const getCommandDocs: InternalTool = {
  name: 'get_command_docs',
  description: 'Get documentation for a CLI command (tries man page first, then tldr). Use when explaining commands, suggesting flags, or verifying command syntax.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Name of the command to get documentation for (e.g., "grep", "find", "git")'
      }
    },
    required: ['command']
  },
  execute: async (args, context): Promise<InternalToolResult> => {
    try {
      const command = args.command as string;

      const docs = await context.getManPage(command);

      if (!docs) {
        return {
          success: true,
          content: `No documentation found for command: ${command}`
        };
      }

      return {
        success: true,
        content: `Documentation for \`${command}\`:\n\n${docs}`
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `Failed to get command documentation: ${error}`
      };
    }
  }
};

/**
 * All internal context tools
 */
export const INTERNAL_TOOLS: InternalTool[] = [
  searchSessionHistory,
  getRecentCommands,
  listProjectFiles,
  readFileContent,
  getCommandDocs
];

/**
 * Set of internal tool names for quick lookup
 */
export const INTERNAL_TOOL_NAMES = new Set(INTERNAL_TOOLS.map(t => t.name));

/**
 * Check if a tool name is an internal tool
 */
export function isInternalTool(toolName: string): boolean {
  return INTERNAL_TOOL_NAMES.has(toolName);
}

/**
 * Get internal tool definitions (without execute function) for LLM
 */
export function getInternalToolDefs(): McpToolDef[] {
  return INTERNAL_TOOLS.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters
  }));
}

/**
 * Execute an internal tool by name
 */
export async function executeInternalTool(
  toolName: string,
  args: Record<string, unknown>,
  context: InternalToolContext
): Promise<InternalToolResult> {
  const tool = INTERNAL_TOOLS.find(t => t.name === toolName);

  if (!tool) {
    return {
      success: false,
      content: '',
      error: `Unknown internal tool: ${toolName}`
    };
  }

  return tool.execute(args, context);
}
