/**
 * Stage 3: Embeddings + vector store = semantic search
 * npm run 3-search
 * ---
 * An embedding model turns text into a vector; texts with similar meaning
 * get vectors pointing in similar directions. A vector store keeps the
 * vectors next to their Documents and, given a query vector, returns the
 * nearest ones. Chroma reports cosine distance: 0 = same direction, and
 * lower is closer.
 *
 * Needs the Chroma server running: `npm run chroma` in a second terminal.
 * The first run embeds and stores the chunks; later runs reuse them.
 */
import fs from 'fs';
import type { Where } from 'chromadb';
import {
  COLLECTION_NAME,
  chroma,
  getVectorStore,
  embeddings,
  EMBEDDING_MODEL,
  GROUND_TRUTHS_PATH,
} from './lib/pipeline.ts';

type GroundTruth = { query: string; where?: object; ground_truth: string[] };
const groundTruths: GroundTruth[] = JSON.parse(
  fs.readFileSync(GROUND_TRUTHS_PATH, 'utf8'),
);

// 1. What an embedding looks like
const vector = await embeddings.embedQuery('K-pop groups');
console.log(
  `"K-pop groups" with ${EMBEDDING_MODEL}: ${vector.length} numbers, starting`,
  vector.slice(0, 5).map((n) => n.toFixed(4)),
);

// 2. Open the stored collection (embedding the chunks only if it's empty)
const vectorStore = await getVectorStore();
const collection = await chroma.getCollection({ name: COLLECTION_NAME });
console.log(
  `\nChroma collection "${COLLECTION_NAME}" holds ${await collection.count()} chunks\n`,
);

// 3. Search. Results are chunks, and one artist can own several chunks, so
// fetch extra and keep each artist's closest chunk.
const TOP_ARTISTS = 5;

async function searchArtists(query: string, filter?: Where) {
  const results = await vectorStore.similaritySearchWithScore(
    query,
    TOP_ARTISTS * 3,
    filter,
  );
  const best = new Map<string, number>();
  for (const [doc, distance] of results) {
    const name = doc.metadata.artist_name;
    if (!best.has(name)) best.set(name, distance);
  }
  return [...best].slice(0, TOP_ARTISTS);
}

const query = 'Rappers and hip hop artists';
console.log(`Query: "${query}"`);
console.table(
  (await searchArtists(query)).map(([artist, distance]) => ({
    artist,
    distance: distance.toFixed(3),
  })),
);

// 4. Check retrieval against the hand-labelled expected artists. Queries that
// need a metadata filter in the ground truth file are skipped here.
let found = 0;
let expected = 0;
const rows = [];
for (const truth of groundTruths.filter((t) => !t.where)) {
  const top = (await searchArtists(truth.query)).map(([name]) => name);
  const hits = truth.ground_truth.filter((name) => top.includes(name));
  const possible = Math.min(truth.ground_truth.length, TOP_ARTISTS);
  found += hits.length;
  expected += possible;
  rows.push({
    query: truth.query,
    hits: `${hits.length}/${possible}`,
    missed: truth.ground_truth.filter((n) => !top.includes(n)).join(', '),
    top: top.join(', '),
  });
}
console.log(`\nGround truth check (top ${TOP_ARTISTS} artists per query):`);
console.table(rows);
console.log(`Recall: ${found}/${expected}\n`);

// 5. Metadata filtering: Chroma takes a `where` object over the metadata.
// Gender and country are facts, not meaning: filter on them, search the rest.
const filtered = 'Singers';
console.log(`Query: "${filtered}", filtered to gender=female, country=GB`);
console.table(
  (
    await searchArtists(filtered, {
      $and: [{ gender: 'female' }, { country: 'GB' }],
    })
  ).map(([artist, distance]) => ({ artist, distance: distance.toFixed(3) })),
);
