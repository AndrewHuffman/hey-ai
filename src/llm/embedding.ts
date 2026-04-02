import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { embedMany, embed } from 'ai';

export type EmbeddingProvider = 'openai' | 'gemini';

let hasWarned = false;

export function isEmbeddingAvailable(provider: EmbeddingProvider = 'openai'): boolean {
  if (provider === 'openai') {
    return !!process.env.OPENAI_API_KEY;
  }
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export function getEmbeddingKeyName(provider: EmbeddingProvider = 'openai'): string | null {
  if (provider === 'openai') {
    return process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : null;
  }
  if (process.env.GEMINI_API_KEY) return 'GEMINI_API_KEY';
  if (process.env.GOOGLE_API_KEY) return 'GOOGLE_API_KEY';
  return null;
}

function warnIfUnavailable(provider: EmbeddingProvider): boolean {
  if (isEmbeddingAvailable(provider)) return false;
  if (!hasWarned && !process.env.HEY_AI_QUIET) {
    const keyName = provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY or GOOGLE_API_KEY';
    console.warn(
      `Warning: ${keyName} is not set. Set it to enable semantic search. ` +
      'Suppress this warning with HEY_AI_QUIET=1.'
    );
    hasWarned = true;
  }
  return true;
}

/**
 * Get embeddings for a single text string.
 * Returns null if no API key is configured.
 */
export async function getEmbedding(
  text: string,
  provider: EmbeddingProvider = 'openai'
): Promise<number[] | null> {
  if (warnIfUnavailable(provider)) return null;
  const model = getEmbeddingModel(provider);
  const result = await embed({ model, value: text });
  return result.embedding;
}

/**
 * Get embeddings for multiple texts in batch.
 * Returns null if no API key is configured.
 */
export async function getEmbeddings(
  texts: string[],
  provider: EmbeddingProvider = 'openai'
): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  if (warnIfUnavailable(provider)) return null;
  
  const model = getEmbeddingModel(provider);
  const result = await embedMany({ model, values: texts });
  return result.embeddings;
}

/**
 * Get the embedding model based on provider
 */
function getEmbeddingModel(provider: EmbeddingProvider) {
  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    const openai = createOpenAI({ apiKey });
    const model = openai.embedding('text-embedding-3-small');
    return model;
  }
  
  // Default to Gemini (free tier available)
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  });
  return google.textEmbeddingModel('text-embedding-004');
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Get embedding dimension for the provider
 */
export function getEmbeddingDimension(provider: EmbeddingProvider = 'openai'): number {
  return provider === 'openai' ? 1536 : 768;
}
