// Copied from ../embedding-model-comparison/src/lib/tsne-scatter.ts
// (tsneLayout only). @thi.ng/tsne is alpha and pinned at 0.1.75: after an
// upgrade, check the internal fields this function overwrites still exist.
import { TSNE } from '@thi.ng/tsne';

// Small seeded PRNG (mulberry32) so the same embeddings always give the same layout
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Reduce high-dimensional vectors to 2D (or 3D) points with t-SNE.
//
// @thi.ng/tsne lays points out in the same number of dimensions as its input
// (1536 or 3072 for these embeddings). Its own example just keeps the first two
// coordinates, which throws most of the structure away. Instead, keep the
// neighbour probabilities it computes from the full vectors, and restart the
// layout in `dims` dimensions before optimising.
export function tsneLayout(
  vectors: number[][],
  { perplexity = 10, iterations = 1000, seed = 42, dims = 2 } = {},
): number[][] {
  const tsne = new TSNE(vectors, { perplexity, maxIter: iterations + 1 });
  const random = seededRandom(seed);
  const filled = (value: number) => Array<number>(dims).fill(value);

  tsne.dim = dims;
  tsne.points = vectors.map(() =>
    Array.from({ length: dims }, () => (random() - 0.5) * 1e-4),
  );
  tsne.steps = vectors.map(() => filled(0));
  tsne.gains = vectors.map(() => filled(1));
  tsne.gradient = vectors.map(() => new Float64Array(dims));
  tsne.ymean = new Float64Array(dims);
  // `dims`-sized versions of the vector operations the solver uses (null `out` means in place)
  tsne.opDist = (a, b) => {
    let sum = 0;
    for (let i = 0; i < dims; i++) sum += (a[i] - b[i]) ** 2;
    return sum;
  };
  tsne.opDivN = (out, a, n) => {
    const o = (out ?? a) as number[];
    for (let i = 0; i < dims; i++) o[i] = a[i] / n;
    return o;
  };
  tsne.opSub = (out, a, b) => {
    const o = (out ?? a) as number[];
    for (let i = 0; i < dims; i++) o[i] = a[i] - b[i];
    return o;
  };

  for (let i = 0; i < iterations; i++) {
    tsne.update();
  }
  return tsne.points.map((point) => [...point]);
}
