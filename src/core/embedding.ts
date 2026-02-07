import axios from 'axios';

const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Get embedding vector for text using OpenRouter API
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  // Clean and truncate text (embedding models have token limits)
  const cleanedText = text.trim().substring(0, 8000);

  if (!cleanedText) {
    // Return zero vector for empty text
    return new Array(EMBEDDING_DIMENSIONS).fill(0);
  }

  try {
    const response = await axios.post(
      `${baseUrl}/embeddings`,
      {
        model: EMBEDDING_MODEL,
        input: cleanedText,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const embedding = response.data?.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      console.error('[Embedding] Invalid response:', response.data);
      throw new Error('Invalid embedding response');
    }

    return embedding;
  } catch (error: any) {
    console.error('[Embedding] API error:', error.message);
    // Return zero vector on error to avoid breaking the flow
    return new Array(EMBEDDING_DIMENSIONS).fill(0);
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

export { EMBEDDING_DIMENSIONS };
