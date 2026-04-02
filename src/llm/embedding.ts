import { createOpenAI } from '@ai-sdk/openai';
import { embedMany, embed } from 'ai';

let hasWarned = false;

export function isEmbeddingAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export function getEmbeddingKeyName(): string | null {
  return process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : null;
}

function warnIfUnavailable(): boolean {
  if (isEmbeddingAvailable()) return false;
  if (!hasWarned && !process.env.HEY_AI_QUIET) {
    console.warn(
      'Warning: OPENAI_API_KEY is not set. Set it to enable semantic search. ' +
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
export async function getEmbedding(text: string): Promise<number[] | null> {
  if (warnIfUnavailable()) return null;
  const model = getEmbeddingModel();
  const result = await embed({ model, value: text });
  return result.embedding;
}

/**
 * Get embeddings for multiple texts in batch.
 * Returns null if no API key is configured.
 */
export async function getEmbeddings(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  if (warnIfUnavailable()) return null;
  
  const model = getEmbeddingModel();
  const result = await embedMany({ model, values: texts });
  return result.embeddings;
}

function getEmbeddingModel() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  const openai = createOpenAI({ apiKey });
  return openai.embedding('text-embedding-3-small');
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

export function getEmbeddingDimension(): number {
  return 1536;
}
