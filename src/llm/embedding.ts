import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { embedMany, embed } from 'ai';

export type EmbeddingProvider = 'gemini' | 'openai';

/**
 * Get embeddings for a single text string
 */
export async function getEmbedding(
  text: string,
  provider: EmbeddingProvider = 'gemini'
): Promise<number[]> {
  const model = getEmbeddingModel(provider);
  const result = await embed({ model, value: text });
  return result.embedding;
}

/**
 * Get embeddings for multiple texts in batch
 */
export async function getEmbeddings(
  texts: string[],
  provider: EmbeddingProvider = 'gemini'
): Promise<number[][]> {
  if (texts.length === 0) return [];
  
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
export function getEmbeddingDimension(provider: EmbeddingProvider = 'gemini'): number {
  // Gemini text-embedding-004: 768 dimensions
  // OpenAI text-embedding-3-small: 1536 dimensions
  return provider === 'openai' ? 1536 : 768;
}
