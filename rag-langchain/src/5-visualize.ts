/**
 * Stage 5: Look at the embeddings
 * npm run 5-visualize
 * ---
 * Every chunk is a point in 1,536 dimensions. t-SNE squeezes them onto a 2D
 * map that keeps each point's nearest neighbours nearby, so clusters on the
 * map are groups of chunks the embedding model sees as similar. Distances
 * between clusters are distorted, so read the map for "who sits with whom",
 * not "how far apart".
 *
 * The queries are embedded and laid out together with the chunks: t-SNE has
 * no way to place a new point on an existing map.
 *
 * Needs the Chroma server running (`npm run chroma`). Writes
 * output/embedding-map.html.
 */
import fs from 'fs';
import {
  COLLECTION_NAME,
  chroma,
  embeddings,
  getVectorStore,
  GROUND_TRUTHS_PATH,
  RAG_K,
  loadCsv,
  rowOf,
} from './lib/pipeline.ts';
import { tsneLayout } from './lib/tsne-scatter.ts';
import {
  renderEmbeddingMapHtml,
  type MapPoint,
  type MapQuery,
} from './lib/embedding-map-page.ts';

const OUTPUT = 'output/embedding-map.html';

// Broad genre families, matched against each artist's MusicBrainz tags. An
// artist can be in several. "pop" is left out because nearly everyone has it.
const GENRES: [string, RegExp][] = [
  ['Hip hop / rap', /hip hop|hip-hop|\brap\b|trap/],
  ['R&B / soul / funk', /r&b|rnb|soul|motown|funk/],
  ['Latin', /latin|reggaeton|salsa|bachata/],
  ['K-pop', /k-pop|kpop|korean/],
  ['Indian / filmi', /filmi|bollywood|indian|bhangra|punjabi|hindi/],
  ['African', /afrobeat|afrobeats|afropop|nigeria|african/],
  ['Rock', /rock/],
  ['Country / folk', /country|folk/],
  ['Jazz / swing', /jazz|swing|big band/],
  ['Electronic / dance', /electronic|house|edm|techno|disco/],
];

type GroundTruth = { query: string; where?: object };
const groundTruths: GroundTruth[] = JSON.parse(
  fs.readFileSync(GROUND_TRUTHS_PATH, 'utf8'),
);
const queryTexts = [
  ...groundTruths.filter((t) => !t.where).map((t) => t.query),
  'Which artists blend hip hop with R&B, and what are some of their albums?',
  'What is the capital of Australia?',
];

// 1. Pull every stored chunk, with its vector, back out of Chroma
const vectorStore = await getVectorStore();
const collection = await chroma.getCollection({ name: COLLECTION_NAME });
const stored = await collection.get({
  include: ['embeddings', 'documents', 'metadatas'],
});
const chunkVectors = stored.embeddings as number[][];
console.log(`Read ${stored.ids.length} chunk vectors from Chroma`);

// 2. Embed the queries and find what each one retrieves
const queryVectors = await embeddings.embedDocuments(queryTexts);
const indexOfId = new Map(stored.ids.map((id, i) => [id, i]));
const retrieved = await Promise.all(
  queryVectors.map(async (vector) => {
    const results = await vectorStore.similaritySearchVectorWithScore(
      vector,
      RAG_K,
    );
    return results.map(([doc, distance]) => ({
      index: indexOfId.get(doc.id!)!,
      distance,
    }));
  }),
);

// 3. One t-SNE layout for chunks and queries together
console.log('Running t-SNE (a few seconds)...');
const positions = tsneLayout([...chunkVectors, ...queryVectors], {
  perplexity: 15,
});

// 4. Label the points
const artistTags = new Map(
  (await loadCsv('artists.csv'))
    .map(rowOf)
    .map((row) => [row.artist_name, row.tags.toLowerCase()]),
);
const points: MapPoint[] = stored.ids.map((_, i) => {
  const metadata = stored.metadatas[i]!;
  const artist = String(metadata.artist_name);
  const text = stored.documents[i] ?? '';
  const tags = artistTags.get(artist) ?? '';
  return {
    artist,
    country: String(metadata.country || 'unknown'),
    // Our splitter fix marks every chunk after the first as "(continued)"
    kind: text.startsWith(`Artist: ${artist} (continued)`)
      ? 'discography'
      : 'profile',
    genres: GENRES.filter(([, pattern]) => pattern.test(tags)).map(
      ([label]) => label,
    ),
    preview: text.slice(0, 220),
    x: positions[i][0],
    y: positions[i][1],
  };
});
const queries: MapQuery[] = queryTexts.map((text, q) => ({
  text,
  x: positions[stored.ids.length + q][0],
  y: positions[stored.ids.length + q][1],
  results: retrieved[q],
}));

// 5. A check on the full 1,536-D vectors, so it isn't distorted by t-SNE:
// is each chunk's nearest neighbour another chunk of the same artist?
const unit = chunkVectors.map((v) => {
  const length = Math.hypot(...v);
  return v.map((n) => n / length);
});
const dot = (a: number[], b: number[]) =>
  a.reduce((sum, n, i) => sum + n * b[i], 0);
const neighbourStats = (['profile', 'discography'] as const).map((kind) => {
  const members = points.flatMap((p, i) => (p.kind === kind ? [i] : []));
  let sameArtist = 0;
  let sameKind = 0;
  for (const i of members) {
    let best = -1;
    let bestSimilarity = -Infinity;
    unit.forEach((other, j) => {
      if (j === i) return;
      const similarity = dot(unit[i], other);
      if (similarity > bestSimilarity) [best, bestSimilarity] = [j, similarity];
    });
    if (points[best].artist === points[i].artist) sameArtist++;
    if (points[best].kind === kind) sameKind++;
  }
  return { kind, chunks: members.length, sameArtist, sameKind };
});
console.log('\nNearest neighbour of each chunk (full 1,536-D vectors):');
console.table(
  neighbourStats.map((s) => ({
    'chunk kind': s.kind,
    chunks: s.chunks,
    'same artist': `${s.sameArtist} (${Math.round((100 * s.sameArtist) / s.chunks)}%)`,
    'same chunk kind': `${s.sameKind} (${Math.round((100 * s.sameKind) / s.chunks)}%)`,
  })),
);

// 6. Write the page
fs.mkdirSync('output', { recursive: true });
fs.writeFileSync(
  OUTPUT,
  renderEmbeddingMapHtml({
    points,
    queries,
    genres: GENRES.map(([label]) => label),
    neighbourStats,
    k: RAG_K,
  }),
);
console.log(`\nWrote ${OUTPUT}`);
