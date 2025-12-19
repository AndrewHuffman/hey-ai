import { spawnSync } from 'node:child_process';

export interface LlmOptions {
  model?: string;
  system?: string;
}

export class LlmWrapper {
  constructor() {}

  async prompt(input: string, options: LlmOptions = {}): Promise<string> {
    const args: string[] = [];
    
    if (options.model) args.push('-m', options.model);
    if (options.system) args.push('--system', options.system);
    
    args.push(input);

    // Use spawnSync because llm CLI hangs with async spawn when stdout is piped
    const result = spawnSync('llm', args, {
      encoding: 'utf8',
      timeout: 120000, // 2 minute timeout
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(`llm exited with status ${result.status}: ${result.stderr}`);
    }

    const output = result.stdout || '';
    
    // Print the output
    if (output) {
      console.log(output);
    }

    return output;
  }

  // Alias for backward compatibility
  async streamPrompt(input: string, options: LlmOptions = {}): Promise<string> {
    return this.prompt(input, options);
  }
}
