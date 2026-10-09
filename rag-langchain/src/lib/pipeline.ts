// The shared pipeline: each numbered script calls the stages before it and
// then prints what its own stage does.
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { Document } from '@langchain/core/documents';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { ChromaClient } from 'chromadb';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { initChatModel } from 'langchain';

const DATA_DIR = 'data';
// Test queries + the artists each one should find (generated with Claude
// from the dataset; see data/README.md)
export const GROUND_TRUTHS_PATH = 'data/music_ground_truths.json';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const CHAT_MODEL = 'openai/gpt-5-mini';
export const openRouterConfig = {
  configuration: { baseURL: OPENROUTER_BASE_URL },
  apiKey: process.env.OPENROUTER_API_KEY,
};

// ---------------------------------------------------------------------------
// 1. Load
// ---------------------------------------------------------------------------

// CSVLoader turns every row into one Document whose pageContent is
// "column: value" lines, and whose metadata is { source, line }.
export async function loadCsv(file: string): Promise<Document[]> {
  return new CSVLoader(`${DATA_DIR}/${file}`).load();
}

// Read the "column: value" lines back into an object, so we can reshape rows
export function rowOf(doc: Document): Record<string, string> {
  return Object.fromEntries(
    doc.pageContent.split('\n').map((line) => {
      const i = line.indexOf(': ');
      return [line.slice(0, i), line.slice(i + 2)];
    }),
  );
}

// One CSV row per Document is rarely what you want to search over. Here we
// reshape the rows into one profile per artist (artist row + its releases),
// because "who is this artist and what did they release" is the unit a
// question is usually about.
export async function loadArtistDocuments(): Promise<Document[]> {
  const artists = (await loadCsv('artists.csv')).map(rowOf);
  const releases = (await loadCsv('releases.csv')).map(rowOf);

  return artists.map((artist) => {
    // Many releases are the same album in different countries/formats:
    // keep each title once, with its earliest year
    const titles = new Map<string, string>();
    for (const release of releases) {
      if (release.artist_mbid !== artist.artist_mbid) continue;
      const year = release.release_date.slice(0, 4);
      const seen = titles.get(release.release_title);
      if (!seen || (year && year < seen)) {
        titles.set(release.release_title, year);
      }
    }
    const discography = [...titles]
      .sort(([, a], [, b]) => a.localeCompare(b))
      .map(([title, year]) => `- ${title}${year ? ` (${year})` : ''}`)
      .join('\n');

    const pageContent = [
      `Artist: ${artist.artist_name}`,
      `Type: ${artist.artist_type || 'unknown'}`,
      `Country: ${artist.country || 'unknown'} (${artist.area || 'unknown area'})`,
      artist.disambiguation && `Description: ${artist.disambiguation}`,
      `Active since: ${artist.begin_date || 'unknown'}`,
      `Tags: ${artist.tags}`,
      `Also known as: ${artist.aliases}`,
      `Releases:\n${discography || '- none listed'}`,
    ]
      .filter(Boolean)
      .join('\n');

    return new Document({
      pageContent,
      metadata: {
        artist_mbid: artist.artist_mbid,
        artist_name: artist.artist_name,
        country: artist.country,
        gender: artist.gender,
        artist_type: artist.artist_type,
        release_count: titles.size,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// 2. Split
// ---------------------------------------------------------------------------

export const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 800,
  chunkOverlap: 100,
});

export async function splitDocuments(docs: Document[]): Promise<Document[]> {
  const chunks = await splitter.splitDocuments(docs);
  // A chunk from the middle of a discography is just a list of album titles:
  // it no longer says whose albums they are. Put the artist name back in so
  // the chunk's embedding (and the LLM reading it) has that context.
  return chunks.map((chunk) =>
    chunk.pageContent.startsWith('Artist: ')
      ? chunk
      : new Document({
          pageContent: `Artist: ${chunk.metadata.artist_name} (continued)\n${chunk.pageContent}`,
          metadata: chunk.metadata,
        }),
  );
}

// ---------------------------------------------------------------------------
// 3. Embed + store
// ---------------------------------------------------------------------------

export const embeddings = new OpenAIEmbeddings({
  model: EMBEDDING_MODEL,
  ...openRouterConfig,
});

// Chroma runs as a separate server (`npm run chroma`) that stores the vectors
// on disk in ./chroma-data, so they survive between runs. Port 8001 avoids
// clashing with another Chroma server on the default port 8000.
export const chroma = new ChromaClient({ host: 'localhost', port: 8001 });
export const COLLECTION_NAME = 'music-artists';

// Chroma ranks by distance (lower = closer). Its default is squared L2;
// cosine distance (1 - cosine similarity) is easier to read.
function getCollection() {
  return chroma.getOrCreateCollection({
    name: COLLECTION_NAME,
    configuration: { hnsw: { space: 'cosine' } },
    // We embed with LangChain, not with a Chroma embedding function
    embeddingFunction: null,
  });
}

// Split, embed and store every chunk. Ids are stable (artist id + chunk
// number), so adding the same chunk twice updates it instead of duplicating it.
async function addChunks(vectorStore: Chroma): Promise<number> {
  const chunks = await splitDocuments(await loadArtistDocuments());
  const counters = new Map<string, number>();
  const ids = chunks.map((chunk) => {
    const artistId = chunk.metadata.artist_mbid;
    const n = counters.get(artistId) ?? 0;
    counters.set(artistId, n + 1);
    return `${artistId}-${n}`;
  });
  await vectorStore.addDocuments(chunks, { ids });
  return chunks.length;
}

// Delete the collection and embed everything again. Run this after changing
// the loader, splitter or embedding model, or the stored vectors are stale.
export async function rebuildVectorStore(): Promise<Chroma> {
  try {
    await chroma.deleteCollection({ name: COLLECTION_NAME });
  } catch {
    // Didn't exist yet
  }
  await getCollection();
  const vectorStore = new Chroma(embeddings, {
    index: chroma,
    collectionName: COLLECTION_NAME,
  });
  const count = await addChunks(vectorStore);
  console.log(`Embedded and stored ${count} chunks in "${COLLECTION_NAME}"`);
  return vectorStore;
}

// Open the stored collection, and only embed when it's still empty
export async function getVectorStore(): Promise<Chroma> {
  const collection = await getCollection();
  if ((await collection.count()) === 0) return rebuildVectorStore();
  return new Chroma(embeddings, {
    index: chroma,
    collectionName: COLLECTION_NAME,
  });
}

// How the top chunks are picked:
// - top-k: the k nearest chunks. One artist with many matching chunks can
//   fill most of the slots and push other relevant artists out.
// - two-per-artist / one-per-artist: fetch more candidates, then keep the
//   nearest ones while allowing at most 2 (or 1) chunks per artist. More
//   artists fit in, but a question about one artist gets fewer of its chunks.
// - long-context: no search at all. Every artist's whole profile goes into
//   the prompt (51 profiles, about 28k tokens), in the CSV's order. The
//   baseline that shows whether retrieval helps.
export const STRATEGIES = [
  'top-k',
  'two-per-artist',
  'one-per-artist',
  'long-context',
] as const;
export type RetrievalStrategy = (typeof STRATEGIES)[number];
const PER_ARTIST_CAP = { 'two-per-artist': 2, 'one-per-artist': 1 };
// Loaded once, the first time long-context needs them
let allProfiles: Promise<Document[]> | undefined;
// Candidates fetched before capping, so there are enough to fill k slots
const CANDIDATES = 30;

export async function retrieve(
  vectorStore: Chroma,
  question: string,
  strategy: RetrievalStrategy = 'top-k',
  k = RAG_K,
): Promise<[Document, number][]> {
  if (strategy === 'top-k') {
    return vectorStore.similaritySearchWithScore(question, k);
  }
  if (strategy === 'long-context') {
    // No search, so no distance: NaN marks "not searched"
    allProfiles ??= loadArtistDocuments();
    return (await allProfiles).map((doc) => [doc, NaN]);
  }
  const cap = PER_ARTIST_CAP[strategy];
  const candidates = await vectorStore.similaritySearchWithScore(
    question,
    CANDIDATES,
  );
  const perArtist = new Map<string, number>();
  const kept: [Document, number][] = [];
  for (const hit of candidates) {
    const artist = String(hit[0].metadata.artist_name);
    const count = perArtist.get(artist) ?? 0;
    if (count >= cap) continue;
    perArtist.set(artist, count + 1);
    kept.push(hit);
    if (kept.length === k) break;
  }
  return kept;
}

// ---------------------------------------------------------------------------
// 4. Prompt + LLM
// ---------------------------------------------------------------------------

// How many chunks go into the prompt
export const RAG_K = 6;

export const ragPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You answer questions about music artists using only the context below.
Each context block is a chunk of an artist profile from MusicBrainz.
If the context doesn't contain the answer, say "I don't know based on the data."
Name the artists you use, and don't add facts that aren't in the context.

Context:
{context}`,
  ],
  ['human', '{question}'],
]);

// Number the chunks so the model (and you) can refer to them
export function formatContext(docs: Document[]): string {
  return docs.map((doc, i) => `[${i + 1}] ${doc.pageContent}`).join('\n\n');
}

export function createChatModel() {
  return initChatModel(CHAT_MODEL, {
    modelProvider: 'openai',
    ...openRouterConfig,
  });
}
