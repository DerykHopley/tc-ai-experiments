/**
 * Stage 9: Report on the re-ranking experiment
 * npm run 9-rerank-report
 * ---
 * Reads the four re-rank variant runs (score scale 0-3 or 0-100, with or
 * without a per-artist cap) and writes output/eval-runs/rerank-experiment.html:
 * the averages, the scores the same candidate chunks got in each run, and
 * which expected artists were missing. No API calls.
 *
 * The runs, from stage 7:
 *   npm run 7-evaluate -- --strategy rerank --name rerank-c
 *   npm run 7-evaluate -- --strategy rerank-cap
 *   npm run 7-evaluate -- --strategy rerank-100
 *   npm run 7-evaluate -- --strategy rerank-100-cap
 */
import fs from 'fs';
import type { EvalRun } from './lib/evaluation-page.ts';
import { renderRerankReportHtml } from './lib/rerank-report-page.ts';

const RUNS_DIR = 'output/eval-runs';
const OUTPUT = `${RUNS_DIR}/rerank-experiment.html`;
const read = (name: string): EvalRun =>
  JSON.parse(fs.readFileSync(`${RUNS_DIR}/${name}.json`, 'utf8'));

const cells = [
  { run: read('rerank-c'), scale: '0–3', cap: '' },
  { run: read('rerank-cap'), scale: '0–3', cap: ' + cap' },
  { run: read('rerank-100'), scale: '0–100', cap: '' },
  { run: read('rerank-100-cap'), scale: '0–100', cap: ' + cap' },
];
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
  renderRerankReportHtml({ cells, references, focus: { question, chunks } }),
);
console.log(`Wrote ${OUTPUT}`);
