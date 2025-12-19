#!/usr/bin/env node
import { Command } from 'commander';
import clipboardy from 'clipboardy';
import chalk from 'chalk';
import { RagEngine } from './rag/engine.js';
import { LlmWrapper } from './llm/wrapper.js';
import { CommandDetector } from './context/commands.js';

export function createProgram() {
  const program = new Command();

  program
    .name('llm-cli')
    .description('Enhanced CLI for LLM interactions with context and MCP support')
    .version('1.0.0')
    .argument('[query]', 'The query to ask the LLM')
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

      // Show preferences mode
      if (options.showPrefs) {
        const detector = new CommandDetector();
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

      // Show context mode (doesn't need a real query)
      if (options.showContext) {
        const rag = new RagEngine();
        console.log(chalk.gray('Gathering context...'));
        await rag.init();
        const context = await rag.assembleContext(query || '');
        console.log(chalk.bold('\n=== Assembled Context ===\n'));
        console.log(context || '(no context)');
        console.log(chalk.bold('\n=== End Context ===\n'));
        return;
      }

      if (!query) {
        if (!process.stdin.isTTY) {
          const chunks = [];
          for await (const chunk of process.stdin) {
            chunks.push(chunk);
          }
          query = Buffer.concat(chunks).toString().trim();
        } else {
          program.help();
          return;
        }
      }

      try {
        let context = '';
        const rag = new RagEngine();
        
        if (options.context === false) {
          log('Skipping context (--no-context)');
        } else {
          console.log(chalk.gray('Gathering context...'));
          await rag.init();
          context = await rag.assembleContext(query);
          log('Context length:', context.length);
        }

        const systemPrompt = options.system || 
          `You are a helpful CLI assistant. Provide accurate, executable zsh commands in markdown code blocks. Be concise.`;

        const finalPrompt = context 
          ? `${context}\n\n## User Query\n${query}`
          : query;

        const llm = new LlmWrapper();
        
        console.log(chalk.blue('Thinking...'));
        
        const response = await llm.streamPrompt(finalPrompt, {
          model: options.model,
          system: systemPrompt
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
          const lastCommand = commands[commands.length - 1];
          try {
            await clipboardy.write(lastCommand);
            console.log(chalk.green('\n✓ Command copied to clipboard!'));
          } catch (e) {
            log('Clipboard error:', e);
          }
        }

      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  return program;
}

export const program = createProgram();

const isMain = process.argv[1] && (
  process.argv[1].endsWith('index.ts') || 
  process.argv[1].endsWith('llm-cli') ||
  process.argv[1].endsWith('index.js')
);

if (isMain) {
  program.parse();
}
