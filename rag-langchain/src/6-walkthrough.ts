/**
 * Stage 6: Walk one question through every step
 * npm run 6-walkthrough -- "your question"
 * ---
 * Runs a real question through the pipeline and records what each step
 * produced: the CSV row, the Document, the chunks, the vectors, the search
 * results, the filled-in prompt and the answer. Writes
 * output/walkthrough.html.
 *
 * Indexing happened earlier (when the collection was built), so for those
 * steps the page follows the one chunk that ended up ranked #1 for this
 * question, back to the CSV row it came from.
 *
 * Needs the Chroma server running (`npm run chroma`). Makes one embedding
 * call and one LLM call.
 */
import fs from 'fs';
import {
  chroma,
  COLLECTION_NAME,
  CHAT_MODEL,
  createChatModel,
  EMBEDDING_MODEL,
  embeddings,
  formatContext,
  getVectorStore,
  loadArtistDocuments,
  loadCsv,
  RAG_K,
  ragPrompt,
  rowOf,
  splitter,
} from './lib/pipeline.ts';
import { renderWalkthroughHtml } from './lib/walkthrough-page.ts';

const OUTPUT = 'output/walkthrough.html';
// Show a few chunks past the cut-off too, to see what just missed
const EXTRA = 4;
const question =
  process.argv[2] ??
  'Which artists blend hip hop with R&B, and what are some of their albums?';

const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
  const start = performance.now();
  const result = await fn();
  return [result, Math.round(performance.now() - start)];
};
const round = (v: number[]) => v.map((n) => Math.round(n * 1e5) / 1e5);
const norm = (v: number[]) => Math.hypot(...v);

console.log(`Question: ${question}`);
const vectorStore = await getVectorStore();
const collection = await chroma.getCollection({ name: COLLECTION_NAME });

// ---- Query time, run first so we know which chunk to follow -------------

// Embed the question
const [queryVector, embedMs] = await timed(() =>
  embeddings.embedQuery(question),
);

// Search: the k nearest chunks, plus a few that just missed
const [hits, searchMs] = await timed(() =>
  vectorStore.similaritySearchVectorWithScore(queryVector, RAG_K + EXTRA),
);
const results = hits.map(([doc, distance], i) => {
  const artist = String(doc.metadata.artist_name);
  return {
    rank: i + 1,
    id: doc.id!,
    artist,
    kind: doc.pageContent.startsWith(`Artist: ${artist} (continued)`)
      ? 'discography'
      : 'profile',
    distance,
    preview: doc.pageContent.slice(0, 160),
  };
});
const retrievedDocs = hits.slice(0, RAG_K).map(([doc]) => doc);
console.log(
  `Retrieved: ${results
    .slice(0, RAG_K)
    .map((r) => r.artist)
    .join(', ')}`,
);

// Fill the prompt and ask the model
const messages = await ragPrompt.formatMessages({
  context: formatContext(retrievedDocs),
  question,
});
const model = await createChatModel();
const [response, llmMs] = await timed(() => model.invoke(messages));
console.log(`Answer: ${response.text.slice(0, 200)}...`);

// ---- Indexing, traced back from the #1 chunk -----------------------------

const top = hits[0][0];
const mbid = String(top.metadata.artist_mbid);
const artist = String(top.metadata.artist_name);

// The raw CSV line and what CSVLoader made of it
const csvLines = fs.readFileSync('data/artists.csv', 'utf8').split('\n');
const rawCsvLine = csvLines.find((line) => line.startsWith(mbid)) ?? '';
const artistRows = await loadCsv('artists.csv');
const loadedDoc = artistRows.find((doc) => rowOf(doc).artist_mbid === mbid)!;
const releaseRows = (await loadCsv('releases.csv')).filter(
  (doc) => rowOf(doc).artist_mbid === mbid,
);

// The reshaped profile Document
const profile = (await loadArtistDocuments()).find(
  (doc) => doc.metadata.artist_mbid === mbid,
)!;

// The artist's chunks as stored in Chroma, in order (ids are <mbid>-<n>)
const stored = await collection.get({
  where: { artist_mbid: mbid },
  include: ['documents', 'embeddings', 'metadatas'],
});
const chunks = stored.ids
  .map((id, i) => ({
    id,
    n: Number(id.slice(id.lastIndexOf('-') + 1)),
    text: stored.documents[i] ?? '',
    vector: stored.embeddings[i] as number[],
    metadata: stored.metadatas[i] ?? {},
  }))
  .sort((a, b) => a.n - b.n);

// How much of each chunk's end is repeated at the start of the next one
// (chunkOverlap), not counting the "(continued)" header we add
const header = `Artist: ${artist} (continued)\n`;
const overlaps = chunks.map((chunk, i) => {
  const next = chunks[i + 1]?.text.replace(header, '') ?? '';
  for (let len = Math.min(chunk.text.length, next.length); len > 0; len--) {
    if (next.startsWith(chunk.text.slice(-len))) return len;
  }
  return 0;
});

const topChunk = chunks.find((chunk) => chunk.id === top.id)!;
const dot = queryVector.reduce((sum, n, i) => sum + n * topChunk.vector[i], 0);

const usage = response.usage_metadata;
fs.mkdirSync('output', { recursive: true });
fs.writeFileSync(
  OUTPUT,
  renderWalkthroughHtml({
    question,
    artist,
    chatModel: CHAT_MODEL,
    embeddingModel: EMBEDDING_MODEL,
    k: RAG_K,
    load: {
      rawCsvLine,
      artistRowCount: artistRows.length,
      releaseRowCount: releaseRows.length,
      pageContent: loadedDoc.pageContent,
      metadata: loadedDoc.metadata,
    },
    reshape: {
      pageContent: profile.pageContent,
      metadata: profile.metadata,
    },
    split: {
      chunkSize: splitter.chunkSize,
      chunkOverlap: splitter.chunkOverlap,
      header,
      chunks: chunks.map((chunk, i) => ({
        id: chunk.id,
        text: chunk.text,
        overlap: overlaps[i],
      })),
      topChunkId: top.id!,
    },
    store: {
      collection: COLLECTION_NAME,
      count: await collection.count(),
      id: topChunk.id,
      metadata: topChunk.metadata,
    },
    chunkVector: round(topChunk.vector),
    chunkNorm: norm(topChunk.vector),
    queryVector: round(queryVector),
    queryNorm: norm(queryVector),
    embedMs,
    search: { results, searchMs, dot },
    prompt: {
      system: messages[0].text,
      human: messages[1].text,
    },
    llm: {
      ms: llmMs,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      reasoningTokens: usage?.output_token_details?.reasoning,
      answer: response.text,
    },
  }),
);
console.log(`\nWrote ${OUTPUT}`);
