import { OpenAI } from 'openai';

export type Embedding = number[];
export type TextEmbedding = {
  text: string;
  embedding: Embedding;
};

// The models to compare, by OpenRouter id
export const models = [
  'openai/text-embedding-3-small',
  'openai/text-embedding-3-large',
  'qwen/qwen3-embedding-8b',
  'mistralai/mistral-embed-2312',
  'google/gemini-embedding-2',
];

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export async function getEmbeddings(
  strings: string[],
  model: string = 'openai/text-embedding-3-small'
): Promise<TextEmbedding[]> {
  const response = await client.embeddings.create({
    model: model,
    input: strings,
  });

  // Scale every vector to length 1 so the dot product below is cosine similarity
  // for any model, not just those that already return unit vectors
  return response.data.map(({ embedding, index }) => {
    const length = Math.hypot(...embedding);
    return {
      embedding: embedding.map((value) => value / length),
      text: strings[index],
    };
  });
}

export function findNearestNeighbors(
  query: Embedding,
  allEmbeddings: TextEmbedding[],
  k: number = 5
): { text: string; distance: number }[] {
  return allEmbeddings
    .map((item) => ({
      text: item.text,
      distance: dotProductSimilarity(query, item.embedding),
    }))
    .sort((a, b) => b.distance - a.distance) // higher dot product = more similar
    .slice(0, k);
}

// dot product similarity, which is the same as cosine similarity
// for normalized vectors, which is the case for OpenAI embeddings.
function dotProductSimilarity(a: Embedding, b: Embedding): number {
  return a.reduce((acc, val, i) => acc + val * b[i], 0);
}
