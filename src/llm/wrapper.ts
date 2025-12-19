import { generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import chalk from 'chalk';

export interface McpToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmOptions {
  model?: string;
  system?: string;
  tools?: McpToolDef[];
  onToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<{ success: boolean; content: string; error?: string }>;
  onToolStart?: (toolName: string, serverName?: string) => void;
  onToolEnd?: (toolName: string, success: boolean, durationMs: number) => void;
}

/**
 * Model aliases for user-friendly names
 */
const MODEL_ALIASES: Record<string, string> = {
  // Claude aliases
  'claude-haiku': 'claude-3-5-haiku-20241022',
  'claude-haiku-4.5': 'claude-3-5-haiku-20241022',
  'claude-3.5-haiku': 'claude-3-5-haiku-20241022',
  'claude-sonnet': 'claude-3-5-sonnet-20241022',
  'claude-sonnet-4': 'claude-sonnet-4-20250514',
  'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
  'claude-opus': 'claude-3-opus-20240229',
  'claude-opus-4.5': 'claude-3-opus-20240229',
  'haiku': 'claude-3-5-haiku-20241022',
  'sonnet': 'claude-3-5-sonnet-20241022',
  'opus': 'claude-3-opus-20240229',
  
  // Gemini aliases
  'gemini': 'gemini-2.0-flash',
  'gemini-flash': 'gemini-2.0-flash',
  'gemini-pro': 'gemini-1.5-pro',
  
  // OpenAI aliases
  'gpt4': 'gpt-4o',
  'gpt-4': 'gpt-4o',
  'gpt4o': 'gpt-4o',
  'gpt4-mini': 'gpt-4o-mini',
  'gpt-4-mini': 'gpt-4o-mini',
};

/**
 * Resolve model alias to full model name
 */
function resolveModelAlias(modelName: string): string {
  return MODEL_ALIASES[modelName.toLowerCase()] || modelName;
}

/**
 * Detect the provider from model name and return the appropriate model instance
 */
function getModelFromName(modelName: string) {
  // First resolve any alias
  const resolvedName = resolveModelAlias(modelName);
  const lowerName = resolvedName.toLowerCase();
  
  // OpenAI models
  if (lowerName.startsWith('gpt-') || lowerName.startsWith('o1') || lowerName.includes('openai')) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(resolvedName);
  }
  
  // Anthropic/Claude models
  if (lowerName.includes('claude') || lowerName.includes('anthropic')) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(resolvedName);
  }
  
  // Google/Gemini models
  if (lowerName.includes('gemini') || lowerName.includes('google')) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });
    return google(resolvedName);
  }
  
  // Default to OpenAI for unknown models (llm CLI convention)
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai(resolvedName);
}


/**
 * Convert JSON Schema to Zod schema
 */
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  const type = schema.type as string | undefined;
  
  if (type === 'object' || schema.properties) {
    const properties = (schema.properties || {}) as Record<string, Record<string, unknown>>;
    const required = (schema.required || []) as string[];
    
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      let zodType = jsonSchemaToZod(propSchema);
      if (!required.includes(key)) {
        zodType = zodType.optional();
      }
      // Add description if available
      if (propSchema.description) {
        zodType = zodType.describe(propSchema.description as string);
      }
      shape[key] = zodType;
    }
    return z.object(shape);
  }
  
  if (type === 'array') {
    const items = (schema.items || { type: 'string' }) as Record<string, unknown>;
    return z.array(jsonSchemaToZod(items));
  }
  
  if (type === 'string') {
    const enumValues = schema.enum as string[] | undefined;
    if (enumValues) {
      return z.enum(enumValues as [string, ...string[]]);
    }
    return z.string();
  }
  
  if (type === 'number' || type === 'integer') {
    return z.number();
  }
  
  if (type === 'boolean') {
    return z.boolean();
  }
  
  // Default fallback - treat as object with no properties
  return z.object({});
}

export class LlmWrapper {
  constructor() {}

  async prompt(input: string, options: LlmOptions = {}): Promise<string> {
    const modelName = options.model || process.env.LLM_MODEL || 'gpt-4o-mini';
    const model = getModelFromName(modelName);
    
    // Convert MCP tools to Vercel AI SDK format using Zod
    const aiTools: Record<string, any> = {};
    
    if (options.tools && options.onToolCall) {
      for (const mcpTool of options.tools) {
        const toolName = mcpTool.name;
        const onToolCall = options.onToolCall;
        const onToolStart = options.onToolStart;
        const onToolEnd = options.onToolEnd;
        
        // Convert JSON schema to Zod and wrap with zodSchema
        const zodSchemaObj = jsonSchemaToZod(mcpTool.parameters);
        
        aiTools[toolName] = tool({
          description: mcpTool.description,
          parameters: zodSchemaObj,
          execute: async (args: any) => {
            onToolStart?.(toolName);
            const startTime = Date.now();
            
            const result = await onToolCall(toolName, args as Record<string, unknown>);
            
            const duration = Date.now() - startTime;
            onToolEnd?.(toolName, result.success, duration);
            
            if (result.success) {
              return result.content;
            } else {
              return `Error: ${result.error}`;
            }
          }
        } as any);
      }
    }
    
    const result = await generateText({
      model,
      system: options.system,
      prompt: input,
      tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
      maxSteps: 10, // Allow up to 10 tool calls
    });
    
    const responseText = result.text;
    console.log(responseText);
    return responseText;
  }

  // Alias for backward compatibility
  async streamPrompt(input: string, options: LlmOptions = {}): Promise<string> {
    return this.prompt(input, options);
  }
}

/**
 * Create tool call display handlers for use with LlmWrapper
 */
export function createToolCallHandlers(getServerForTool?: (name: string) => string | undefined) {
  return {
    onToolStart: (toolName: string) => {
      const serverName = getServerForTool?.(toolName);
      const serverInfo = serverName ? ` via ${serverName}` : '';
      console.log(chalk.cyan(`\n🔧 [MCP: ${toolName}${serverInfo}]`));
    },
    onToolEnd: (toolName: string, success: boolean, durationMs: number) => {
      const status = success 
        ? chalk.green('✓') 
        : chalk.red('✗');
      console.log(chalk.gray(`   ${status} completed in ${durationMs}ms\n`));
    }
  };
}
