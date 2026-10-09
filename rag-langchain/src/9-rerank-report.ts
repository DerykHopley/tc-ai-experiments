/**
 * Stage 9: Report on the re-ranking experiment
 * npm run 9-rerank-report
 * ---
 * Reads the re-rank variant runs (score scale 0-3 or 0-100, with or without
 * a per-artist cap, at temperature 1 and 0) and the repeatability check
 * (stage 9a), and writes output/eval-runs/rerank-experiment.html. No API
 * calls.
 *
 * The runs, from stage 7:
 *   npm run 7-evaluate -- --strategy rerank --name rerank-c
 *   npm run 7-evaluate -- --strategy rerank-cap
 *   npm run 7-evaluate -- --strategy rerank-100
 *   npm run 7-evaluate -- --strategy rerank-100-cap
 * and the same four again at temperature 0, named *-t0, then
 *   npm run 9-rerank-consistency
 */
import fs from 'fs';
import type { EvalRun } from './lib/evaluation-page.ts';
import { renderRerankReportHtml, type Cell } from './lib/rerank-report-page.ts';

const RUNS_DIR = 'output/eval-runs';
const OUTPUT = `${RUNS_DIR}/rerank-experiment.html`;
const read = (name: string): EvalRun =>
  JSON.parse(fs.readFileSync(`${RUNS_DIR}/${name}.json`, 'utf8'));

const VARIANTS = [
  ['rerank', '0–3'],
  ['rerank-cap', '0–3 + cap'],
  ['rerank-100', '0–100'],
  ['rerank-100-cap', '0–100 + cap'],
];
// The temperature-1 run of plain rerank is rerank-c (a and b saved no
// candidate scores)
const cells: Cell[] = [1, 0].flatMap((temperature) =>
  VARIANTS.map(([strategy, label]) => {
    const name =
      temperature === 0
        ? `${strategy}-t0`
        : strategy === 'rerank'
          ? 'rerank-c'
          : strategy;
    return { run: read(name), label, temperature };
  }),
);
const consistency = JSON.parse(
  fs.readFileSync('output/rerank-consistency.json', 'utf8'),
);
const references = ['top-k-a', 'two-per-artist', 'long-context-a'].map(read);

// The soul question's chunks for the expected artists, by search position
const question = 'soul';
const soul = cells[0].run.results.find((r) => r.id === question)!;
const expected = new Set(soul.expectedArtists);
const chunks = (soul.candidates ?? [])
  .filter((c) => expected.has(c.artist))
  .map((c) => ({ artist: c.artist, searchRank: c.searchRank }))
  .sort((a, b) => a.searchRank - b.searchRank);

fs.writeFileSync(
  OUTPUT,
  renderRerankReportHtml({
    cells,
    references,
    focus: { question, chunks },
    consistency,
  }),
);
console.log(`Wrote ${OUTPUT}`);
