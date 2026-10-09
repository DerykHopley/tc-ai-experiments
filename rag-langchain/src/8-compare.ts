/**
 * Stage 8: Compare evaluation runs
 * npm run 8-compare
 * ---
 * Reads every run saved by stage 7 in output/eval-runs/ and writes
 * output/eval-runs/comparison.html. No API calls.
 *
 * To compare retrieval strategies:
 *   npm run 7-evaluate                                 (top-k)
 *   npm run 7-evaluate -- --name top-k-b               (same again: the noise)
 *   npm run 7-evaluate -- --strategy two-per-artist
 *   npm run 7-evaluate -- --strategy one-per-artist
 *   npm run 7-evaluate -- --strategy rerank            (30 candidates, LLM picks 6)
 *   npm run 7-evaluate -- --strategy long-context      (no search: the baseline)
 *   npm run 8-compare
 */
import fs from 'fs';
import type { EvalRun } from './lib/evaluation-page.ts';
import { renderComparisonHtml } from './lib/comparison-page.ts';
import { STRATEGIES, type RetrievalStrategy } from './lib/pipeline.ts';

const RUNS_DIR = 'output/eval-runs';
const PAGE = `${RUNS_DIR}/comparison.html`;

const runs: EvalRun[] = fs
  .readdirSync(RUNS_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(fs.readFileSync(`${RUNS_DIR}/${file}`, 'utf8')))
  // Grouped by strategy (in pipeline order), oldest first within each, so
  // the first run of each strategy is the one drawn filled
  .sort(
    (a: EvalRun, b: EvalRun) =>
      STRATEGIES.indexOf(a.config.strategy as RetrievalStrategy) -
        STRATEGIES.indexOf(b.config.strategy as RetrievalStrategy) ||
      a.date.localeCompare(b.date),
  );

if (runs.length < 2) {
  console.error(`Need at least 2 runs in ${RUNS_DIR}; run stage 7 first.`);
  process.exit(1);
}
fs.writeFileSync(PAGE, renderComparisonHtml(runs));
console.log(`Compared ${runs.map((r) => r.name).join(', ')}\nWrote ${PAGE}`);
