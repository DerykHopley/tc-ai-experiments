/**
 * Stage 2: Text splitters
 * npm run 2-split
 * ---
 * Embedding a whole long document squashes everything it says into one
 * vector, so a specific detail gets drowned out. Splitting into chunks gives
 * each part its own vector. Too small, though, and a chunk loses the context
 * that says what it's about.
 *
 * RecursiveCharacterTextSplitter tries to split on paragraphs, then lines,
 * then words, so chunks break at natural boundaries. chunkOverlap repeats the
 * end of one chunk at the start of the next.
 */
import {
  loadArtistDocuments,
  splitDocuments,
  splitter,
} from './lib/pipeline.ts';

const docs = await loadArtistDocuments();
const chunks = await splitDocuments(docs);
console.log(`${docs.length} Documents -> ${chunks.length} chunks\n`);

// How many chunks each artist became
const perArtist = new Map<string, number>();
for (const chunk of chunks) {
  const name = chunk.metadata.artist_name;
  perArtist.set(name, (perArtist.get(name) ?? 0) + 1);
}
const counts = [...perArtist].sort(([, a], [, b]) => b - a);
console.log('Most chunks:', counts.slice(0, 5));
console.log('Fewest chunks:', counts.slice(-3), '\n');

// A large profile, split. Every chunk keeps the parent's metadata, and our
// splitDocuments() adds "Artist: ... (continued)" to chunks that lost it.
const [bigArtist] = counts[0];
const bigChunks = chunks.filter((c) => c.metadata.artist_name === bigArtist);
bigChunks.forEach((chunk, i) => {
  console.log(
    `--- ${bigArtist} chunk ${i + 1}/${bigChunks.length} (${chunk.pageContent.length} chars)`,
  );
  console.log('metadata:', chunk.metadata);
  console.log(chunk.pageContent.slice(0, 300) + '...\n');
});

// Without our fix, a middle chunk is just album titles with no artist name
const raw = await splitter.splitDocuments(
  docs.filter((d) => d.metadata.artist_name === bigArtist),
);
console.log('Same chunk 2 straight from the splitter, no artist context:');
console.log(raw[1]?.pageContent.slice(0, 200) + '...');
