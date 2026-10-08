// Experiment: does a third t-SNE dimension keep more of each person's true
// neighbourhood than the 2D map on the main page? Writes output/map-3d.html.
import fs from 'fs';
import figures from '../data/historical_figures.json' with { type: 'json' };
import figureTags from '../data/historical_figures_tags.json' with { type: 'json' };
import {
  models,
  getEmbeddings,
  findNearestNeighbors,
} from './lib/embeddings.ts';
import { tsneLayout } from './lib/tsne-scatter.ts';
import { renderMap3dHtml, type Map3dModel } from './lib/map-3d-page.ts';

const perplexities = [10, 30];
const k = 3; // neighbours per person, as on the main page
const texts = figures.map((figure) => figure.text);
const indexByText = new Map(texts.map((text, i) => [text, i]));
const round = (value: number) => Math.round(value * 100) / 100; // keeps the page small

// Share of each person's k true closest who are also among their k nearest on the map
function keptOnMap(positions: number[][], neighbours: number[][]): number {
  let kept = 0;
  positions.forEach((p, i) => {
    const nearest = positions
      .map((q, j) => ({ j, distance: Math.hypot(...p.map((v, d) => v - q[d])) }))
      .filter(({ j }) => j !== i)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k)
      .map(({ j }) => j);
    kept += neighbours[i].filter((j) => nearest.includes(j)).length;
  });
  return kept / (positions.length * k);
}

const results = await Promise.allSettled(
  models.map(async (model): Promise<Map3dModel> => {
    // Put the embeddings in figure order, so index i is the same person everywhere
    const embeddings = (await getEmbeddings(texts, model)).sort(
      (a, b) => indexByText.get(a.text)! - indexByText.get(b.text)!
    );
    const vectors = embeddings.map(({ embedding }) => embedding);
    const neighbours = embeddings.map(({ text, embedding }) =>
      findNearestNeighbors(
        embedding,
        embeddings.filter((item) => item.text !== text),
        k
      ).map((neighbor) => indexByText.get(neighbor.text)!)
    );

    const layouts = perplexities.map((perplexity) => {
      const positions2d = tsneLayout(vectors, { perplexity }).map((p) => p.map(round));
      const positions3d = tsneLayout(vectors, { perplexity, dims: 3 }).map((p) => p.map(round));
      return {
        perplexity,
        positions2d,
        positions3d,
        kept2d: keptOnMap(positions2d, neighbours),
        kept3d: keptOnMap(positions3d, neighbours),
      };
    });
    return { model, neighbours, layouts };
  })
);

const done: Map3dModel[] = [];
const skipped: { model: string; reason: string }[] = [];
results.forEach((result, i) => {
  if (result.status === 'fulfilled') {
    done.push(result.value);
  } else {
    const reason = String(result.reason?.message ?? result.reason).split('\n')[0];
    skipped.push({ model: models[i], reason });
    console.warn(`Skipping ${models[i]}: ${reason}`);
  }
});
if (done.length === 0) {
  throw new Error('No embedding model succeeded');
}

const short = (model: string) => model.split('/').pop()!;
const pct = (x: number) => `${Math.round(x * 100)}%`;
console.log(`Share of each person's ${k} true closest also nearest on the map:`);
console.table(
  done.map(({ model, layouts }) =>
    Object.fromEntries([
      ['model', short(model)],
      ...layouts.flatMap((l) => [
        [`2D p${l.perplexity}`, pct(l.kept2d)],
        [`3D p${l.perplexity}`, pct(l.kept3d)],
      ]),
    ])
  )
);

const outputFile = 'output/map-3d.html';
fs.mkdirSync('output', { recursive: true });
fs.writeFileSync(
  outputFile,
  renderMap3dHtml({
    people: figures.map((figure) => ({
      name: figure.name,
      ...figureTags[figure.id as keyof typeof figureTags],
    })),
    k,
    models: done,
    skipped,
  })
);
console.log(`Wrote ${outputFile}`);
