import { OpenAI } from 'openai';
import fs from 'fs';
import figures from '../data/historical_figures.json' with { type: 'json' };
import figureTags from '../data/historical_figures_tags.json' with { type: 'json' };
import { tsne2d, type ScatterPanel } from './lib/tsne-scatter.ts';
import { compareModels, type Tags } from './lib/model-comparison.ts';
import { renderComparisonHtml } from './lib/model-comparison-page.ts';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});

type Embedding = number[];
type TextEmbedding = {
  text: string;
  embedding: Embedding;
};

const models = [
  'openai/text-embedding-3-small',
  'openai/text-embedding-3-large',
  'qwen/qwen3-embedding-8b',
  'mistralai/mistral-embed-2312',
  'google/gemini-embedding-2',
];
// t-SNE perplexity: roughly how many neighbours each point's position takes into
// account. The page has a switcher; the first value is shown by default.
const perplexities = [10, 15, 20, 30];
const texts = figures.map((figure) => figure.text);
const nameByText = new Map(figures.map((figure) => [figure.text, figure.name]));

// Run every model in parallel. allSettled keeps going if one model fails
// (e.g. blocked by an OpenRouter guardrail), and keeps results in model order.
const results = await Promise.allSettled(
  models.map(async (model) => {
    // 1. Get embeddings for all inputs
    const embeddings: TextEmbedding[] = await getEmbeddings(texts, model);

    // 2. Find the nearest neighbors for each text
    const embeddingsClosest = embeddings.map(({ text, embedding }) => {
      const embeddingsToCompare = embeddings.filter(
        (item) => item.text !== text
      );
      const neighbors = findNearestNeighbors(embedding, embeddingsToCompare, 3);

      return {
        text,
        neighbors,
      };
    });

    // 3. Lay the embeddings out in 2D with t-SNE, once per perplexity
    const vectors = embeddings.map(({ embedding }) => embedding);
    const round = (value: number) => Math.round(value * 100) / 100; // keeps the page small
    const layouts = perplexities.map((perplexity) => ({
      perplexity,
      positions: tsne2d(vectors, { perplexity }).map((point) =>
        point.map(round)
      ),
    }));

    const panel: ScatterPanel = {
      title: model,
      points: embeddingsClosest.map(({ text, neighbors }) => ({
        name: nameByText.get(text)!,
        neighbors: neighbors.map((neighbor) => ({
          name: nameByText.get(neighbor.text)!,
          similarity: neighbor.distance,
        })),
      })),
      layouts,
    };
    return { panel, dims: embeddings[0].embedding.length };
  })
);

const panels: ScatterPanel[] = [];
const dims: Record<string, number> = {};
const skipped: { model: string; reason: string }[] = [];
results.forEach((result, i) => {
  if (result.status === 'fulfilled') {
    panels.push(result.value.panel);
    dims[models[i]] = result.value.dims;
  } else {
    const reason = String(result.reason?.message ?? result.reason).split(
      '\n'
    )[0];
    skipped.push({
      model: models[i],
      reason: reason.includes('guardrail')
        ? 'blocked by an OpenRouter guardrail'
        : reason,
    });
    console.warn(`Skipping ${models[i]}: ${reason}`);
  }
});
if (panels.length === 0) {
  throw new Error('No embedding model succeeded');
}

// 4. Compare the models
// Tags are keyed by figure id in the file; key them by name like everything else
const tags: Tags = Object.fromEntries(
  figures.map((figure) => [
    figure.name,
    figureTags[figure.id as keyof typeof figureTags],
  ])
);
const comparison = compareModels(panels, tags);
const short = (model: string) => model.split('/').pop()!;

console.log(
  '\nAverage closest neighbours (of 3) shared by each pair of models:'
);
console.table(
  Object.fromEntries(
    comparison.models.map((a, i) => [
      short(a),
      Object.fromEntries(
        comparison.models.map((b, j) => [
          short(b),
          Number(comparison.agreement[i][j].toFixed(2)),
        ])
      ),
    ])
  )
);

console.log('People whose neighbours change most between models:');
console.table(
  comparison.stability.slice(0, 10).map(({ name, agreement }) => ({
    name,
    agreement: `${Math.round(agreement * 100)}%`,
  }))
);

console.log(
  'Share of closest neighbours in the same field / of the same gender:'
);
console.table(
  comparison.models.map((model, i) => ({
    model: short(model),
    'same field': `${Math.round(comparison.traits.field.scores[i].share * 100)}%`,
    'same gender': `${Math.round(comparison.traits.gender.scores[i].share * 100)}%`,
  }))
);
console.log(
  `By chance: same field ${Math.round(comparison.traits.field.chance * 100)}%, ` +
    `same gender ${Math.round(comparison.traits.gender.chance * 100)}%`
);

// 5. Write the comparison page
const outputFile = 'output/model-comparison.html';
fs.mkdirSync('output', { recursive: true });
fs.writeFileSync(
  outputFile,
  renderComparisonHtml({
    title: 'How embedding models relate historical figures',
    subtitle:
      'Each of the 68 biographies is embedded by every model. Two people are neighbours when their biographies are among the 3 most similar. ' +
      'This page compares those neighbour lists across models.',
    panels,
    comparison,
    tags,
    dims,
    skipped,
  })
);
console.log(`Wrote ${outputFile}`);

async function getEmbeddings(
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

function findNearestNeighbors(
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
