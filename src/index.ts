#!/usr/bin/env node
import { Command } from 'commander';
import os from 'node:os';
import clipboardy from 'clipboardy';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { RagEngine } from './rag/engine.js';
import { LlmWrapper, McpToolDef, getRecommendedModels } from './llm/wrapper.js';
import { CommandDetector } from './context/commands.js';
import { ConfigManager } from './config.js';

async function processQuery(query: string, options: any, rag: RagEngine, llm: LlmWrapper, log: Function) {
  try {
    let context = '';
    
    if (options.context === false) {
      log('Skipping context (--no-context)');
    } else {
      context = await rag.assembleContext(query);
      log('Context length:', context.length);
    }

    const configManager = new ConfigManager();
    const config = await configManager.loadConfig();
    const model = options.model || config.defaultModel;

    // Get internal context tools
    const internalToolDefs = rag.getInternalTools();

    // Get MCP tool definitions for function calling
    const mcpToolDefs = await rag.mcp.getToolDefinitionsForGemini();
    const mcpTools: McpToolDef[] = mcpToolDefs.map(t => ({
      name: t.name,
      description: t.description || '',
      parameters: t.parameters
    }));

    // Merge all tools (internal + MCP)
    const tools: McpToolDef[] = [...internalToolDefs, ...mcpTools];

    // Create tool call handlers for visual feedback
    const toolHandlers = {
      onToolStart: (toolName: string) => {
        const isInternal = rag.isInternalTool(toolName);
        if (isInternal) {
          console.log(chalk.cyan(`\n🔧 [Context: ${toolName}]`));
        } else {
          const serverName = rag.mcp.getServerForTool(toolName);
          const serverInfo = serverName ? ` via ${serverName}` : '';
          console.log(chalk.cyan(`\n🔧 [MCP: ${toolName}${serverInfo}]`));
        }
      },
      onToolEnd: (toolName: string, success: boolean, durationMs: number) => {
        const status = success
          ? chalk.green('✓')
          : chalk.red('✗');
        console.log(chalk.gray(`   ${status} completed in ${durationMs}ms\n`));
      }
    };

    const currentOs = `${os.type()} ${os.release()} (${os.platform()})`;
    const systemPrompt = options.system ||
`You are a skilled Developer Assistant CLI tool running on **${currentOs}**. Your role is to provide the user with precise, executable CLI commands and functions to solve their problems.

## Context Retrieval Tools
You have access to internal tools for gathering context ON DEMAND. Use these ONLY when genuinely needed:

- **search_session_history**: Search past AI conversations. Use when user references "previous", "last time", "earlier", "that thing we discussed", etc.
- **get_recent_commands**: Get recent terminal commands. Use when discussing terminal history, debugging command issues, or user asks "what did I just run".
- **list_project_files**: List project files. Use when user asks about project structure, "what files", or needs file context.
- **read_file_content**: Read a specific file. Use when you need to examine code/config to give accurate advice.
- **get_command_docs**: Get man/tldr docs for a command. Use when explaining unfamiliar commands or verifying syntax.

**When to use context tools:**
- User explicitly asks about history, files, or past interactions
- You need to verify something before giving advice (e.g., check a config file exists)
- The query references previous context ("do that again", "like before")

**When NOT to use context tools:**
- Simple command syntax questions ("how do I use grep")
- General knowledge questions
- When you already have sufficient context

## Core Responsibilities
- **Provider, Not Agent:** Do not "do" the task (unless asked deeply). Your primary job is to provide the *commands* for the user to execute.
- **Accuracy First:** Use tools to verify context when needed, ensuring your suggestions are valid and safe.
- **Context Aware:** Fetch context on-demand rather than assuming what's relevant.
- **Platform Specifics:** ALWAYS use the appropriate commands, flags, and arguments for **${currentOs}**. For example, use \`pbcopy\` on macOS, or BSD-style flags where appropriate.

## Tool Usage Guidelines
- **Minimal Fetching:** Only fetch context when genuinely needed - don't call tools speculatively.
- **Targeted Queries:** Use specific queries/paths rather than broad searches.
- **Error Handling:** If a tool fails, explain the error clearly and continue without it.
- **Direct Answers:** For simple questions, answer directly without invoking tools.

## Output Format
- **Single Block ONLY:** Provide ONE markdown code block containing the solution.
- **NO Text Outside Block:** Do NOT include introductions, conclusions, explanations, or lists outside the code block.
- **Parameterized Functions:** Wrap complex logic in functions.
- **Explanation via Echo:** Use \`echo\` for explanations inside the code.
- **No Inline Comments:** Do NOT use inline comments.
- **Multiple Options:** Define separate functions within the **same single code block**.
- **Usage Examples:** usage examples must be commented out inside the code block.

## Example
\`\`\`zsh
# Define the function
find_and_delete() {
  local pattern=$1
  echo "Finding files matching $pattern..."
  find . -name "$pattern" -delete
  echo "Done."
}

# Usage:
# find_and_delete "*.tmp"
\`\`\`
`;

    const finalPrompt = context 
      ? `${context}\n\n## User Query\n${query}`
      : query;

    console.log(chalk.blue('Thinking...'));
    
    const response = await llm.streamPrompt(finalPrompt, {
      model: model,
      system: systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
      onToolCall: async (toolName, args) => {
        // Route internal context tools differently from MCP tools
        if (rag.isInternalTool(toolName)) {
          return rag.executeInternalTool(toolName, args);
        }
        return rag.mcp.callTool(toolName, args);
      },
      ...toolHandlers
    });

    // Save to session history
    await rag.saveInteraction(query, response);

    // Extract code blocks for clipboard
    const codeBlockRegex = /```(?:zsh|bash|sh)?\n([\s\S]*?)\n```/g;
    const commands: string[] = [];
    let match;
    
    while ((match = codeBlockRegex.exec(response)) !== null) {
      commands.push(match[1].trim());
    }

    if (commands.length > 0) {
      // Use the first code block as it's typically the primary solution
      const commandToCopy = commands[0]; 
      try {
        await clipboardy.write(commandToCopy);
        console.log(chalk.green('\n✓ Command copied to clipboard!'));
      } catch (e) {
        log('Clipboard error:', e);
      }
    }
    
    return response;
  } catch (error) {
    console.error(chalk.red('Error:'), error);
    throw error;
  }
}


export function createProgram() {
  const program = new Command();

  program
    .name('hey-ai')
    .description('Enhanced CLI for LLM interactions with context and MCP support')
    .version('1.0.0')
    .argument('[query]', 'The query to ask the LLM (omitting starts interactive mode)')
    .option('-m, --model <model>', 'Specify the model to use')
    .option('--no-history', 'Do not include history context')
    .option('--no-files', 'Do not include file context')
    .option('--system <prompt>', 'System prompt override')
    .option('--no-context', 'Skip context gathering (fast mode)')
    .option('-v, --verbose', 'Show debug output')
    .option('--show-context', 'Show assembled context without calling LLM')
    .option('--show-prefs', 'Show detected command preferences')
    .action(async (query, options) => {
      const log = options.verbose 
        ? (...args: any[]) => console.log(chalk.gray('[debug]'), ...args)
        : () => {};

      const detector = new CommandDetector();
      const rag = new RagEngine();
      const llm = new LlmWrapper();
      
      try {
        // Show preferences mode
        if (options.showPrefs) {
          const prefs = detector.getPreferences();
          console.log(chalk.bold('Detected command preferences:'));
          if (Object.keys(prefs).length === 0) {
            console.log(chalk.gray('  No alternative commands detected'));
          } else {
            for (const [generic, preferred] of Object.entries(prefs)) {
              console.log(`  ${chalk.red(generic)} → ${chalk.green(preferred)}`);
            }
          }
          console.log(chalk.gray('\nAlternatives searched: fd, rg, bat, eza, delta, sd, dust, htop, tldr, z, procs...'));
          return;
        }

        // Show context mode - show context then continue to LLM
        let isRagInitialized = false;
        if (options.showContext) {
          console.log(chalk.gray('Gathering context...'));
          await rag.init();
          isRagInitialized = true;
          const context = await rag.assembleContext(query || '');
          console.log(chalk.bold('\n=== Assembled Context ===\n'));
          console.log(context || '(no context)');
          console.log(chalk.bold('\n=== End Context ===\n'));
          // Continue to LLM call (don't return)
        }

        if (!query) {
          if (!process.stdin.isTTY) {
            const chunks = [];
            for await (const chunk of process.stdin) {
              chunks.push(chunk);
            }
            query = Buffer.concat(chunks).toString().trim();
          } else {
            // Interactive mode
            console.log(chalk.cyan.bold('Entering interactive mode. Type "exit" or "quit" to leave.'));
            if (!isRagInitialized) await rag.init();
            
            while (true) {
              const { input } = await inquirer.prompt([{
                type: 'input',
                name: 'input',
                message: '❯',
                prefix: ''
              }]);

              if (!input || input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
                break;
              }

              await processQuery(input, options, rag, llm, log);
              console.log(); // Newline for spacing
            }
            await rag.mcp.disconnectAll();
            return;
          }
        }

        if (query) {
          if (!isRagInitialized) await rag.init();
          await processQuery(query, options, rag, llm, log);
          await rag.mcp.disconnectAll();
          if (process.env.NODE_ENV !== 'test') {
            process.exit(0);  // Ensure clean exit
          }
        }
      } catch (error) {
        log('Action error:', error);
        await rag.mcp.disconnectAll();
        process.exit(1);
      }
    });
  
  program
    .command('models')
    .description('List available LLM models')
    .action(() => {
      const providers = getRecommendedModels();
      console.log(chalk.bold('Recommended Models:\n'));
      
      for (const provider of providers) {
        console.log(chalk.yellow.bold(provider.provider));
        for (const model of provider.models) {
          const aliasList = (model as any).aliases || [];
          const aliasInfo = aliasList.length > 0 ? ` (${chalk.cyan(aliasList.join(', '))})` : '';
          console.log(`  - ${chalk.green(model.id)}${aliasInfo}`);
          if (model.description) {
            console.log(`    ${chalk.gray(model.description)}`);
          }
        }
        console.log();
      }
      
      console.log(chalk.gray('Use a model with: '));
      console.log(chalk.gray('  hey-ai -m <model-name> "your query"'));
      console.log(chalk.gray('  hey-ai config set defaultModel <model-name>'));
    });

  program
    .command('completion')
    .description('Generate zsh completion script')
    .action(() => {
      const script = `#compdef hey-ai

_hey-ai() {
  local line state

  _arguments -C \
    '(-m --model)'{-m,--model}'[Specify the model to use]:model' \
    '--no-history[Do not include history context]' \
    '--no-files[Do not include file context]' \
    '--system[System prompt override]:prompt' \
    '--no-context[Skip context gathering (fast mode)]' \
    '(-v --verbose)'{-v,--verbose}'[Show debug output]' \
    '--show-context[Show assembled context without calling LLM]' \
    '--show-prefs[Show detected command preferences]' \
    '(-h --help)'{-h,--help}'[display help for command]' \
    '(-V --version)'{-V,--version}'[output the version number]' \
    '1: :->command' \
    '*: :->args'

  case $state in
    command)
      local -a subcommands
      subcommands=(
        'completion:Generate zsh completion script'
        'config:Manage configuration'
        'mcp:Manage MCP servers'
        'models:List available LLM models'
      )
      _describe -t subcommands 'subcommand' subcommands
      _message 'query'
      ;;
    args)
      case $line[1] in
        config)
          local -a config_cmds
          config_cmds=(
            'set:Set a configuration value'
            'list:Show current configuration'
            'show:Show current configuration'
          )
          _describe -t config_cmds 'config command' config_cmds
          ;;
        mcp)
          local -a mcp_cmds
          mcp_cmds=(
            'add:Add an MCP server'
            'add-json:Add an MCP server from JSON configuration'
            'add-preset:Add a preset MCP server'
            'presets:List available preset MCP servers'
            'list:List all configured MCP servers'
            'get:Show details for a specific MCP server'
            'remove:Remove an MCP server'
          )
          _describe -t mcp_cmds 'mcp command' mcp_cmds
          ;;
      esac
      ;;
  esac
}

_hey-ai "$@"
`;
      console.log(script);
    });

  const configCmd = program
    .command('config')
    .description('Manage configuration');

  configCmd
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'Configuration key (e.g., defaultModel)')
    .argument('<value>', 'Configuration value')
    .action(async (key, value) => {
      const configManager = new ConfigManager();
      if (key === 'defaultModel' || key === 'model') {
        await configManager.setConfig({ defaultModel: value });
        console.log(chalk.green(`✓ Default model set to: ${value}`));
      } else {
        console.error(chalk.red(`Error: Unknown configuration key "${key}"`));
        process.exit(1);
      }
    });

  configCmd
    .command('list')
    .alias('show')
    .description('Show current configuration')
    .action(async () => {
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      
      console.log(chalk.bold('Current configuration:'));
      console.log();
      
      if (config.defaultModel) {
        console.log(`  ${chalk.cyan('defaultModel')}: ${config.defaultModel}`);
      } else {
        console.log(`  ${chalk.cyan('defaultModel')}: ${chalk.gray('(not set)')}`);
        console.log(chalk.gray('    (Run "hey-ai models" to see available options)'));
      }
      
      const mcpCount = Object.keys(config.mcpServers || {}).length;
      console.log(`  ${chalk.cyan('mcpServers')}: ${mcpCount} configured`);
      
      if (mcpCount > 0) {
        for (const name of Object.keys(config.mcpServers || {})) {
          console.log(`    - ${name}`);
        }
      }
    });

  // MCP command group
  const mcpCmd = program
    .command('mcp')
    .description('Manage MCP (Model Context Protocol) servers');

  // Preset MCP servers
  const mcpPresets: Record<string, { description: string; config: { command: string; args?: string[]; env?: Record<string, string> } | { type: 'http' | 'sse'; url: string } }> = {
    'filesystem': {
      description: 'File system access (read/write files, list directories)',
      config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', process.env.HOME || '/'] }
    },
    'brave-search': {
      description: 'Web search via Brave Search API (requires BRAVE_API_KEY)',
      config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] }
    },
    'fetch': {
      description: 'Fetch and convert web content to markdown (requires uvx/uv)',
      config: { command: 'uvx', args: ['mcp-server-fetch'] }
    },
    'deepwiki': {
      description: 'Access documentation and wikis for GitHub repositories',
      config: { type: 'sse', url: 'https://mcp.deepwiki.com/sse' }
    },
    'github': {
      description: 'GitHub API access (requires GITHUB_TOKEN)',
      config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] }
    },
    'memory': {
      description: 'Persistent memory using a local knowledge graph',
      config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] }
    },
    'puppeteer': {
      description: 'Browser automation and web scraping',
      config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'] }
    },
    'slack': {
      description: 'Slack workspace access (requires SLACK_BOT_TOKEN, SLACK_TEAM_ID)',
      config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'] }
    },
  };

  mcpCmd
    .command('presets')
    .description('List available preset MCP servers')
    .action(() => {
      console.log(chalk.bold('Available MCP server presets:\n'));
      for (const [name, preset] of Object.entries(mcpPresets)) {
        const cfg = preset.config;
        const transportType = 'type' in cfg ? cfg.type : 'stdio';
        console.log(`  ${chalk.cyan(name)} ${chalk.gray(`(${transportType})`)}`);
        console.log(`    ${preset.description}`);
        console.log();
      }
      console.log(chalk.gray('Add a preset with: hey-ai mcp add-preset <name>'));
    });

  mcpCmd
    .command('add-preset <name>')
    .description('Add a preset MCP server')
    .option('-e, --env <key=value...>', 'Environment variables for the server')
    .option('--path <path>', 'Root path for filesystem server (default: home directory)')
    .action(async (name: string, options: any) => {
      const preset = mcpPresets[name];
      if (!preset) {
        console.error(chalk.red(`Error: Unknown preset "${name}"`));
        console.log(chalk.gray('\nAvailable presets:'));
        for (const presetName of Object.keys(mcpPresets)) {
          console.log(chalk.gray(`  - ${presetName}`));
        }
        process.exit(1);
      }

      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      config.mcpServers = config.mcpServers || {};

      if ('type' in preset.config) {
        // Remote server (http/sse)
        config.mcpServers[name] = {
          command: `__${preset.config.type}__`,
          args: [preset.config.url],
        };
        await configManager.setConfig(config);
        console.log(chalk.green(`✓ Added MCP server "${name}" (${preset.config.type})`));
        console.log(chalk.gray(`  ${preset.description}`));
        console.log(chalk.gray(`  URL: ${preset.config.url}`));
      } else {
        // Local stdio server
        const serverConfig: { command: string; args?: string[]; env?: Record<string, string> } = {
          command: preset.config.command,
          args: [...(preset.config.args || [])],
        };

        // Handle filesystem path option
        if (name === 'filesystem' && options.path) {
          serverConfig.args = ['-y', '@modelcontextprotocol/server-filesystem', options.path];
        }

        // Parse env vars from options
        if (options.env) {
          serverConfig.env = {};
          for (const envPair of options.env) {
            const [key, ...valueParts] = envPair.split('=');
            if (key && valueParts.length > 0) {
              serverConfig.env[key] = valueParts.join('=');
            }
          }
        }

        config.mcpServers[name] = serverConfig;
        await configManager.setConfig(config);
        console.log(chalk.green(`✓ Added MCP server "${name}" (stdio)`));
        console.log(chalk.gray(`  ${preset.description}`));
        console.log(chalk.gray(`  Command: ${serverConfig.command} ${serverConfig.args?.join(' ') || ''}`));
        
        // Show hints for servers that need env vars
        if (name === 'brave-search') {
          console.log(chalk.yellow('\n⚠ Note: Requires BRAVE_API_KEY environment variable'));
          console.log(chalk.gray('  Get an API key at: https://brave.com/search/api/'));
          console.log(chalk.gray('  Then run: hey-ai mcp remove brave-search'));
          console.log(chalk.gray('           hey-ai mcp add-preset brave-search -e BRAVE_API_KEY=your-key'));
        } else if (name === 'github') {
          console.log(chalk.yellow('\n⚠ Note: Requires GITHUB_TOKEN environment variable'));
          console.log(chalk.gray('  Create a token at: https://github.com/settings/tokens'));
        } else if (name === 'slack') {
          console.log(chalk.yellow('\n⚠ Note: Requires SLACK_BOT_TOKEN and SLACK_TEAM_ID environment variables'));
        }
      }
    });

  mcpCmd
    .command('add <name>')
    .description('Add an MCP server')
    .option('-t, --transport <type>', 'Transport type: stdio, http, or sse', 'stdio')
    .option('-e, --env <key=value...>', 'Environment variables for the server')
    .argument('[command_or_url]', 'Command (for stdio) or URL (for http/sse)')
    .argument('[args...]', 'Arguments for the command (stdio only, use -- to separate)')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async (name: string, commandOrUrl: string | undefined, args: string[], options: any, command: any) => {
      // Get remaining args after -- separator (they're in command.args)
      const allArgs = command.args || [];
      const nameIdx = allArgs.indexOf(name);
      // Everything after name is the command and its args
      const commandArgs = nameIdx >= 0 ? allArgs.slice(nameIdx + 1) : [];
      if (commandArgs.length > 0) {
        commandOrUrl = commandArgs[0];
        args = commandArgs.slice(1);
      }
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      
      const transport = options.transport.toLowerCase();
      
      if (transport === 'stdio') {
        if (!commandOrUrl) {
          console.error(chalk.red('Error: Command is required for stdio transport'));
          console.log(chalk.gray('\nUsage: hey-ai mcp add <name> <command> [args...]'));
          console.log(chalk.gray('Example: hey-ai mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /path'));
          console.log(chalk.gray('\nWith env vars (use -- to separate options from command):'));
          console.log(chalk.gray('  hey-ai mcp add myserver -e API_KEY=secret -- npx -y my-server'));
          process.exit(1);
        }
        
        const envVars: Record<string, string> = {};
        if (options.env) {
          for (const envPair of options.env) {
            const [key, ...valueParts] = envPair.split('=');
            if (key && valueParts.length > 0) {
              envVars[key] = valueParts.join('=');
            }
          }
        }
        
        const serverConfig: { command: string; args?: string[]; env?: Record<string, string> } = {
          command: commandOrUrl,
        };
        
        if (args.length > 0) {
          serverConfig.args = args;
        }
        
        if (Object.keys(envVars).length > 0) {
          serverConfig.env = envVars;
        }
        
        config.mcpServers = config.mcpServers || {};
        config.mcpServers[name] = serverConfig;
        
        await configManager.setConfig(config);
        console.log(chalk.green(`✓ Added MCP server "${name}" (stdio)`));
        console.log(chalk.gray(`  Command: ${commandOrUrl}${args.length > 0 ? ' ' + args.join(' ') : ''}`));
        
      } else if (transport === 'http' || transport === 'sse') {
        if (!commandOrUrl) {
          console.error(chalk.red(`Error: URL is required for ${transport} transport`));
          console.log(chalk.gray(`\nUsage: hey-ai mcp add -t ${transport} <name> <url>`));
          console.log(chalk.gray(`Example: hey-ai mcp add -t ${transport} stripe https://mcp.stripe.com`));
          process.exit(1);
        }
        
        // For http/sse, store as a special format
        config.mcpServers = config.mcpServers || {};
        config.mcpServers[name] = {
          command: `__${transport}__`,
          args: [commandOrUrl],
        };
        
        await configManager.setConfig(config);
        console.log(chalk.green(`✓ Added MCP server "${name}" (${transport})`));
        console.log(chalk.gray(`  URL: ${commandOrUrl}`));
        
      } else {
        console.error(chalk.red(`Error: Unknown transport type "${transport}"`));
        console.log(chalk.gray('Supported transports: stdio, http, sse'));
        process.exit(1);
      }
    });

  mcpCmd
    .command('add-json <name> <json>')
    .description('Add an MCP server from JSON configuration')
    .action(async (name: string, jsonStr: string) => {
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      
      try {
        const serverConfig = JSON.parse(jsonStr);
        
        // Validate the config has required fields
        if (serverConfig.type === 'http' || serverConfig.type === 'sse') {
          if (!serverConfig.url) {
            console.error(chalk.red('Error: URL is required for http/sse servers'));
            process.exit(1);
          }
          config.mcpServers = config.mcpServers || {};
          config.mcpServers[name] = {
            command: `__${serverConfig.type}__`,
            args: [serverConfig.url],
          };
        } else if (serverConfig.command) {
          config.mcpServers = config.mcpServers || {};
          config.mcpServers[name] = {
            command: serverConfig.command,
            args: serverConfig.args,
            env: serverConfig.env,
          };
        } else {
          console.error(chalk.red('Error: Invalid MCP server configuration'));
          console.log(chalk.gray('Expected either "command" (for stdio) or "type"+"url" (for http/sse)'));
          process.exit(1);
        }
        
        await configManager.setConfig(config);
        console.log(chalk.green(`✓ Added MCP server "${name}" from JSON`));
        
      } catch (e) {
        console.error(chalk.red('Error: Invalid JSON'));
        console.log(chalk.gray('Example: hey-ai mcp add-json myserver \'{"command":"npx","args":["-y","server"]}\''));
        process.exit(1);
      }
    });

  mcpCmd
    .command('list')
    .description('List all configured MCP servers')
    .action(async () => {
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      
      const servers = config.mcpServers || {};
      const serverNames = Object.keys(servers);
      
      if (serverNames.length === 0) {
        console.log(chalk.gray('No MCP servers configured.'));
        console.log(chalk.gray('\nAdd one with: hey-ai mcp add <name> <command> [args...]'));
        return;
      }
      
      console.log(chalk.bold('Configured MCP servers:\n'));
      
      for (const name of serverNames) {
        const server = servers[name];
        
        // Check for http/sse transport marker
        if (server.command.startsWith('__') && server.command.endsWith('__')) {
          const transport = server.command.slice(2, -2);
          console.log(`  ${chalk.cyan(name)} ${chalk.gray(`(${transport})`)}`);
          console.log(`    URL: ${server.args?.[0] || '(none)'}`);
        } else {
          console.log(`  ${chalk.cyan(name)} ${chalk.gray('(stdio)')}`);
          console.log(`    Command: ${server.command}${server.args?.length ? ' ' + server.args.join(' ') : ''}`);
          if (server.env && Object.keys(server.env).length > 0) {
            console.log(`    Env: ${Object.keys(server.env).join(', ')}`);
          }
        }
        console.log();
      }
    });

  mcpCmd
    .command('get <name>')
    .description('Show details for a specific MCP server')
    .action(async (name: string) => {
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      
      const server = config.mcpServers?.[name];
      
      if (!server) {
        console.error(chalk.red(`Error: MCP server "${name}" not found`));
        process.exit(1);
      }
      
      console.log(chalk.bold(`MCP Server: ${name}\n`));
      
      if (server.command.startsWith('__') && server.command.endsWith('__')) {
        const transport = server.command.slice(2, -2);
        console.log(`  Transport: ${transport}`);
        console.log(`  URL: ${server.args?.[0] || '(none)'}`);
      } else {
        console.log(`  Transport: stdio`);
        console.log(`  Command: ${server.command}`);
        if (server.args?.length) {
          console.log(`  Args: ${JSON.stringify(server.args)}`);
        }
        if (server.env && Object.keys(server.env).length > 0) {
          console.log(`  Env:`);
          for (const [key, value] of Object.entries(server.env)) {
            console.log(`    ${key}=${value}`);
          }
        }
      }
    });

  mcpCmd
    .command('remove <name>')
    .description('Remove an MCP server')
    .action(async (name: string) => {
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      
      if (!config.mcpServers?.[name]) {
        console.error(chalk.red(`Error: MCP server "${name}" not found`));
        process.exit(1);
      }
      
      delete config.mcpServers[name];
      await configManager.setConfig(config);
      
      console.log(chalk.green(`✓ Removed MCP server "${name}"`));
    });

  return program;
}

export const program = createProgram();

const isMain = process.argv[1] && (
  process.argv[1].endsWith('index.ts') || 
  process.argv[1].endsWith('hey-ai') ||
  process.argv[1].endsWith('index.js')
);

if (isMain) {
  program.parse();
}
