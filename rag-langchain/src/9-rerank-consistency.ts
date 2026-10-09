/**
 * Stage 9a: How repeatable are the re-ranker's scores?
 * npm run 9-rerank-consistency
 * ---
 * Fetches the 30 candidates for two questions once, then has the re-ranker
 * score the same candidates 3 times at temperature 1 (the first runs) and
 * 3 times at temperature 0, on both scales. Then scores each expected
 * artist's profile chunk (the one with the tags) on its own, to compare
 * with its score inside the batch of 30. Writes
 * output/rerank-consistency.json for the experiment report.
 * Needs the Chroma server. About 60 re-ranker calls.
 */
import fs from 'fs';
import { getVectorStore, rerank } from './lib/pipeline.ts';

const OUTPUT = 'output/rerank-consistency.json';
const QUESTIONS = {
  soul: 'Which classic soul or Motown singers are in the data?',
  bollywood: 'Which artists are known for Indian film music or Bollywood?',
};
const REPEATS = 3;
const CANDIDATES = 30;

const EXPECTED: Record<string, string[]> = {
  soul: ['Stevie Wonder', 'Marvin Gaye', 'Aretha Franklin'],
  bollywood: ['Kishore Kumar', 'Diljit Dosanjh'],
};

const vectorStore = await getVectorStore();
const results = [];
const alone = [];
for (const [id, question] of Object.entries(QUESTIONS)) {
  const candidates = await vectorStore.similaritySearchWithScore(
    question,
    CANDIDATES,
  );
  const artists = candidates.map(([doc]) => String(doc.metadata.artist_name));
  for (const temperature of [1, 0]) {
    for (const scale of [3, 100] as const) {
      const repeats = await Promise.all(
        Array.from({ length: REPEATS }, async () => {
          const ranked = await rerank(question, candidates, scale, temperature);
          // Scores in search order, so repeats line up chunk by chunk
          const scores: number[] = [];
          for (const r of ranked) scores[r.searchRank - 1] = r.score;
          return scores;
        }),
      );
      results.push({ id, question, temperature, scale, artists, repeats });
      console.log(`${id}, temperature ${temperature}, 0-${scale}: done`);
    }
  }
  // The same profile chunks, scored one at a time (temperature 0)
  for (const artist of EXPECTED[id]) {
    const i = candidates.findIndex(
      ([doc]) =>
        doc.metadata.artist_name === artist &&
        doc.pageContent.includes('\nTags:'),
    );
    if (i === -1) continue;
    for (const scale of [3, 100] as const) {
      const scores = await Promise.all(
        Array.from(
          { length: REPEATS },
          async () =>
            (await rerank(question, [candidates[i]], scale, 0))[0].score,
        ),
      );
      alone.push({ id, artist, searchRank: i + 1, scale, scores });
    }
  }
  console.log(`${id}: profiles scored alone`);
}
fs.writeFileSync(
  OUTPUT,
  JSON.stringify({ repeats: REPEATS, results, alone }, null, 2),
);
console.log(`Wrote ${OUTPUT}`);
