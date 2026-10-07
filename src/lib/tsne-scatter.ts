import { TSNE } from '@thi.ng/tsne';

export type ScatterPoint = {
  name: string;
  neighbors: { name: string; similarity: number }[];
};

// One 2D layout of a panel's points, in the same order as `points`
export type ScatterLayout = {
  perplexity: number;
  positions: number[][];
};

// One map on the page, e.g. one embedding model, with a layout per perplexity
export type ScatterPanel = {
  title: string;
  points: ScatterPoint[];
  layouts: ScatterLayout[];
};

// Small seeded PRNG (mulberry32) so the same embeddings always give the same layout
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Reduce high-dimensional vectors to 2D points with t-SNE.
//
// @thi.ng/tsne lays points out in the same number of dimensions as its input
// (1536 or 3072 for these embeddings). Its own example just keeps the first two
// coordinates, which throws most of the structure away. Instead, keep the
// neighbour probabilities it computes from the full vectors, and restart the
// layout in 2D before optimising.
export function tsne2d(
  vectors: number[][],
  { perplexity = 10, iterations = 1000, seed = 42 } = {}
): number[][] {
  const tsne = new TSNE(vectors, { perplexity, maxIter: iterations + 1 });
  const random = seededRandom(seed);

  tsne.dim = 2;
  tsne.points = vectors.map(() => [
    (random() - 0.5) * 1e-4,
    (random() - 0.5) * 1e-4,
  ]);
  tsne.steps = vectors.map(() => [0, 0]);
  tsne.gains = vectors.map(() => [1, 1]);
  tsne.gradient = vectors.map(() => new Float64Array(2));
  tsne.ymean = new Float64Array(2);
  // 2D versions of the vector operations the solver uses (null `out` means in place)
  tsne.opDist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  tsne.opDivN = (out, a, n) => {
    const o = (out ?? a) as number[];
    o[0] = a[0] / n;
    o[1] = a[1] / n;
    return o;
  };
  tsne.opSub = (out, a, b) => {
    const o = (out ?? a) as number[];
    o[0] = a[0] - b[0];
    o[1] = a[1] - b[1];
    return o;
  };

  for (let i = 0; i < iterations; i++) {
    tsne.update();
  }
  return tsne.points.map(([x, y]) => [x, y]);
}
